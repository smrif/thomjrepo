import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createClient} from '@supabase/supabase-js';
import {registrationBackend} from '../src/registration-backend.js';
import {createAccountStore,accountScope} from '../src/account-store.js';
import {onboardingStore} from '../src/onboarding-store.js';
import {registrationEnabled} from '../src/registration-config.js';

const A={user:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'}},B={user:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'}};
const config={enabled:true,url:'https://test-project.supabase.co',publishableKey:'sb_publishable_SYNTHETIC'},versions={terms:'2026-10-21-v2',privacy:'2026-10-21-v2'};
const columns={current_parent_label:'Alex',co_parent_label:'Jordan',children:['Avery','Sam'],activities:['school'],theme_mode:'system'};
const profile={currentParentLabel:'Alex',coParentLabel:'Jordan',children:['Avery','Sam'],activityIds:['school'],themeMode:'system'};
const attempt='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',otherAttempt='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('registration environment is explicit, requires sync and keeps production blocked',()=>{
 assert.equal(registrationEnabled({}),false);
 const enabled={auth:config,sync:{enabled:true},registration:{enabled:true,contractVersion:1}};
 assert.equal(registrationEnabled(enabled),true);
 for(const bad of [{...enabled,sync:{enabled:false}},{...enabled,auth:{enabled:false}},{...enabled,registration:{enabled:true,contractVersion:2}},{...enabled,auth:{...config,url:'https://hdfuknggfkmaycnantxv.supabase.co'}}])assert.throws(()=>registrationEnabled(bad));
});
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 `);
 await db.exec('grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;revoke create on schema public from public;');
 for(const file of ['20261012000100_app_baseline.sql','20261012000200_limit_client_privileges.sql','20261026000100_mobile_registration.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 for(const user of [A.user,B.user])await db.query('insert into auth.users values($1,$2,now())',[user.id,user.email]);
 return db;
}
async function as(db,role,user=null){await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(user?{sub:user.id}:{})})]);}
const call=(db,extra={})=>db.query('select public.complete_mobile_registration($1::uuid,$2::text,$3::jsonb,$4::text,$5::text,$6::timestamptz) as result',[extra.attempt??attempt,extra.email??A.user.email,JSON.stringify(extra.profile??columns),extra.terms??versions.terms,extra.privacy??versions.privacy,extra.acceptedAt??new Date().toISOString()]).then(r=>r.rows[0].result);

test('registration SQL commits atomically, protects immutable owner history, retries exactly and preserves legacy profiles',async()=>{
 const db=await database(),acceptedAt=new Date().toISOString();
 try{
  const source=await readFile(new URL('../../app.js',import.meta.url),'utf8');assert(source.includes("const CURRENT_TERMS_VERSION='"+versions.terms+"'"));assert(source.includes("const CURRENT_PRIVACY_VERSION='"+versions.privacy+"'"));
  const metadata=(await db.query(await readFile(new URL('../../supabase/checks/mobile-registration.sql',import.meta.url),'utf8'))).rows;assert.equal(metadata.length,1);for(const [key,value] of Object.entries(metadata[0]))assert.equal(value,true,key);
  await as(db,'anon');await assert.rejects(call(db,{acceptedAt}),e=>e.code==='42501');
  await as(db,'authenticated');await assert.rejects(call(db,{acceptedAt}),e=>e.code==='22023');
  await as(db,'authenticated',A.user);
  await as(db,'postgres');await db.query('update auth.users set email_confirmed_at=null where id=$1',[A.user.id]);await as(db,'authenticated',A.user);await assert.rejects(call(db,{acceptedAt}),e=>e.code==='22023');await as(db,'postgres');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[A.user.id]);await as(db,'authenticated',A.user);
  for(const bad of [{email:B.user.email},{terms:'unknown'},{privacy:'unknown'},{acceptedAt:new Date(Date.now()-25*3600000).toISOString()},{acceptedAt:new Date(Date.now()+600000).toISOString()},{profile:{...columns,children:['Same',' Same ']}},{profile:{...columns,activities:[]}},{profile:{...columns,user_id:B.user.id}},{profile:{...columns,theme_mode:null}}])await assert.rejects(call(db,bad),e=>e.code==='22023');
  assert.equal((await db.query('select * from public.profiles')).rows.length,0);
  // Force a receipt insert failure after profile insert: both must roll back.
  await as(db,'postgres');await db.exec("alter table public.mobile_policy_acceptances add constraint injected_failure check(source<>'mobile')");await as(db,'authenticated',A.user);
  await assert.rejects(call(db,{acceptedAt}),e=>e.code==='23514');assert.equal((await db.query('select * from public.profiles')).rows.length,0);
  await as(db,'postgres');await db.exec('alter table public.mobile_policy_acceptances drop constraint injected_failure');await as(db,'authenticated',A.user);
  const first=await call(db,{acceptedAt}),retry=await call(db,{acceptedAt});assert.deepEqual(retry,first);assert.equal(first.status,'completed');assert.equal(first.receipt.user_id,A.user.id);assert.equal(first.receipt.verified_email,A.user.email);assert.equal(Date.parse(first.receipt.accepted_at),Date.parse(acceptedAt));assert(Number.isFinite(Date.parse(first.receipt.recorded_at)));
  await assert.rejects(call(db,{acceptedAt,profile:{...columns,current_parent_label:'Changed attempt'}}),e=>e.code==='22023');
  assert.equal((await db.query('select * from public.mobile_policy_acceptances')).rows.length,1);
  for(const sql of ['update public.mobile_policy_acceptances set terms_version=\'invented\'','delete from public.mobile_policy_acceptances','truncate public.mobile_policy_acceptances',`insert into public.mobile_policy_acceptances select * from public.mobile_policy_acceptances`])await assert.rejects(db.exec(sql),e=>e.code==='42501');
  await db.exec("update public.profiles set current_parent_label='Website edit',terms_version='future-policy' ");
  const current=await call(db,{acceptedAt});assert.equal(current.profile.current_parent_label,'Website edit');assert.deepEqual(current.receipt,first.receipt);
  const existing=await call(db,{attempt:otherAttempt});assert.equal(existing.status,'existing');assert.equal(existing.profile.terms_version,'future-policy');assert.equal(existing.receipt,null);
  await as(db,'authenticated',B.user);assert.equal((await db.query('select * from public.mobile_policy_acceptances')).rows.length,0);
  await assert.rejects(call(db,{acceptedAt}),e=>e.code==='22023');
  await db.query("insert into public.profiles(user_id,current_parent_label,co_parent_label,children,activities,terms_version) values($1,'Legacy','Other','[\"Child\"]','[\"school\"]','older-policy')",[B.user.id]);
  const legacy=await call(db,{email:B.user.email});assert.equal(legacy.status,'existing');assert.equal(legacy.profile.current_parent_label,'Legacy');assert.equal(legacy.profile.terms_version,'older-policy');assert.equal((await db.query('select * from public.mobile_policy_acceptances')).rows.length,0);
  await as(db,'postgres');await db.query('delete from auth.users where id=$1',[A.user.id]);await as(db,'authenticated',A.user);await assert.rejects(call(db,{acceptedAt}),e=>e.code==='22023');await as(db,'postgres');assert.equal((await db.query('select * from public.mobile_policy_acceptances')).rows.length,0);assert.equal((await db.query('select * from public.profiles')).rows[0].user_id,B.user.id);
 }finally{await db.close()}
});

function memory(){const rows=new Map();return {rows,async read({key}){return {value:rows.get(key)??null}},async write({key,value}){rows.set(key,value)},async keys({prefix}){return {keys:[...rows.keys()].filter(k=>k.startsWith(prefix))}},async compareBatch({rows:batch}){if(batch.some(r=>(rows.get(r.key)??null)!==r.expected))return {matched:false};for(const r of batch)if(r.value!==undefined)rows.set(r.key,r.value);return {matched:true}}};}
async function setup(vault){const draft=onboardingStore(vault,'test-project');await draft.save({...profile,children:'Avery\nSam',email:A.user.email},4);const intent={schema:1,attempt,scope:'',email:A.user.email,profile,draftRaw:await draft.snapshot(),termsVersion:versions.terms,privacyVersion:versions.privacy,acceptedAt:new Date().toISOString()};await draft.intent(intent);return {draft,intent,complete:accounts=>accounts.completeOnboarding({pendingKey:draft.intentKey,pendingRaw:JSON.stringify(intent),versions,environment:'mobile-test'})};}
function adapter(db,{lost=false,corrupt=false}={}){
 const requests=[];let lose=lost,changed=false;
 const client=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
  const path=new URL(url).pathname;requests.push({path,body:init.body});await as(db,'authenticated',A.user);
  if(path.endsWith('/rpc/complete_mobile_registration')){
   const body=JSON.parse(init.body),result=await call(db,{attempt:body.p_attempt,email:body.p_email,profile:body.p_profile,terms:body.p_terms_version,privacy:body.p_privacy_version,acceptedAt:body.p_accepted_at});
   if(lose){lose=false;return new Response(JSON.stringify({message:'Synthetic lost response'}),{status:503})}
   if(corrupt)result.receipt.user_id=B.user.id;
   return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  }
  assert.equal(init.method,'GET');const rows=path.endsWith('/profiles')?(await db.query('select * from public.profiles')).rows:[];
  return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json'}});
 }}});
 const auth={async withSession(id,fn){assert.equal(id,A.user.id);return fn(client,()=>{if(changed)throw Error('The account changed')})}};
 return {requests,change:()=>{changed=true},backend:owner=>registrationBackend(auth,config,owner)};
}
test('real SDK RPC and account flow preserve durable server receipt through local commit, reopen, and legacy restoration',async()=>{
 const db=await database(),vault=memory(),f=await setup(vault),transport=adapter(db),accounts=createAccountStore(vault,{project:'test-project',backend:transport.backend});
 try{
  await accounts.activate(A);assert.equal(accounts.state.status,'needs-profile');await f.complete(accounts);assert.equal(accounts.state.status,'ready');assert.equal(accounts.state.config.currentParentLabel,'Alex');assert.equal(accounts.syncs[0].state.pending,0);
  const receipt=JSON.parse([...vault.rows].find(([key])=>key.startsWith('policy-receipt:'))[1]);assert.equal(receipt.server.userId,A.user.id);assert.equal(receipt.server.attempt,attempt);assert.equal(await f.draft.pending(),null);
  const body=JSON.parse(transport.requests.find(r=>r.path.includes('/rpc/')).body);assert.deepEqual(body.p_profile,columns);assert(!('user_id' in body));
  const otherDevice=createAccountStore(memory(),{project:'test-project',backend:transport.backend});await otherDevice.activate(A);assert.equal(otherDevice.state.status,'ready');assert.equal(otherDevice.state.config.currentParentLabel,'Alex');assert.equal(otherDevice.state.config.termsAccepted,false);
  // Restoring the website profile preserves report recipient and future/legacy
  // agreement fields; none can become sign-in identity or a new device receipt.
  await as(db,'authenticated',A.user);await db.exec("update public.profiles set report_email='recipient@example.invalid',terms_version='future-policy',current_parent_label='Website parent'");
  const legacyVault=memory(),legacy=createAccountStore(legacyVault,{project:'test-project',backend:transport.backend});await legacy.activate(A);assert.equal(legacy.state.config.currentParentLabel,'Website parent');assert.equal(legacy.state.config.email,A.user.email);assert(![...legacyVault.rows.keys()].some(k=>k.startsWith('policy-receipt:')));assert.equal((await db.query('select terms_version from public.profiles')).rows[0].terms_version,'future-policy');
 }finally{accounts.lock();await db.close()}
});
test('lost server response or local storage failure recovers the committed cloud profile without duplicate acceptance or replacement',async()=>{
 for(const failure of ['response','disk']){
  const db=await database(),vault=memory(),f=await setup(vault),transport=adapter(db,{lost:failure==='response'}),accounts=createAccountStore(vault,{project:'test-project',backend:transport.backend});
  try{
   await accounts.activate(A);const compare=vault.compareBatch;if(failure==='disk')vault.compareBatch=async args=>{if(args.rows.some(r=>r.value!==undefined))throw Error('disk full');return compare(args)};
   await assert.rejects(f.complete(accounts));assert.equal(accounts.state.status,'needs-profile');assert(await f.draft.pending());assert(!vault.rows.has('profile:v1:'+accountScope('test-project',A.user.id)));vault.compareBatch=compare;
   const reopened=createAccountStore(vault,{project:'test-project',backend:transport.backend});await reopened.activate(A);assert.equal(reopened.state.status,'ready');assert.equal(reopened.state.config.currentParentLabel,'Alex');assert.equal((await db.query('select * from public.mobile_policy_acceptances')).rows.length,1);
  }finally{accounts.lock();await db.close()}
 }
});
test('registration rejects a forged server receipt and refuses profile creation through ordinary sync',async()=>{
 const db=await database(),transport=adapter(db,{corrupt:true}),vault=memory(),f=await setup(vault),owner={...A.user,scope:accountScope('test-project',A.user.id)},backend=transport.backend(owner);
 try{await assert.rejects(backend.registration.complete(f.intent,versions),/receipt/);await assert.rejects(async()=>backend.profile.compareAndSet('profile',profile,null),/Complete account setup/);assert(![...vault.rows.keys()].some(k=>k.startsWith('profile:')))}finally{await db.close()}
});
test('a profile created during email return is restored without overwriting it or fabricating acceptance',async()=>{
 const db=await database(),vault=memory(),f=await setup(vault),transport=adapter(db),accounts=createAccountStore(vault,{project:'test-project',backend:transport.backend});
 try{
  await accounts.activate(A);await as(db,'authenticated',A.user);await db.query("insert into profiles(user_id,current_parent_label,co_parent_label,children,activities,terms_version) values($1,'Other device','Existing co-parent','[\"Existing child\"]','[\"school\"]','unknown-future-policy')",[A.user.id]);
  await f.complete(accounts);assert.equal(accounts.state.config.currentParentLabel,'Other device');assert.equal(accounts.state.status,'ready');assert(![...vault.rows.keys()].some(k=>k.startsWith('policy-receipt:')));assert.equal(await f.draft.pending(),null);assert.equal((await db.query('select * from mobile_policy_acceptances')).rows.length,0);assert.equal((await db.query('select terms_version from profiles')).rows[0].terms_version,'unknown-future-policy');
 }finally{accounts.lock();await db.close()}
});
test('offline, changed drafts and account changes prevent stale local registration completion',async()=>{
 const db=await database();
 try{
  for(const scenario of ['offline','draft','account']){
   const vault=memory(),f=await setup(vault),transport=adapter(db),accounts=createAccountStore(vault,{project:'test-project',backend:transport.backend,online:()=>scenario!=='offline'});
   await accounts.activate(A);
   if(scenario==='draft')await f.draft.save({...profile,email:A.user.email,children:'New child'},4);
   if(scenario==='account'){
    const original=transport.backend;let release,entered;const waiting=new Promise(r=>entered=r);
    transport.backend=owner=>{const result=original(owner),complete=result.registration.complete;result.registration.complete=async(...args)=>{const response=await complete(...args);entered();await new Promise(r=>release=r);return response};return result};
    // The store receives this forwarding closure so the synthetic delay can be
    // placed after the server commit while its original owner remains fixed.
    const delayed=createAccountStore(vault,{project:'test-project',backend:owner=>transport.backend(owner)});await delayed.activate(A);const saving=f.complete(delayed);await waiting;delayed.lock();release();await assert.rejects(saving,/changed/);assert.equal(delayed.state.status,'signed-out');
   }else{await assert.rejects(f.complete(accounts));assert(!transport.requests.some(r=>r.path.includes('/rpc/')))}
   assert(![...vault.rows.keys()].some(k=>k.startsWith('profile:')||k.startsWith('policy-receipt:')));assert(await f.draft.pending());accounts.lock();
  }
 }finally{await db.close()}
});
