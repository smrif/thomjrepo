import {test} from 'node:test';import assert from 'node:assert/strict';
import {onboardingStore,validateIntent,policyReceipt} from '../src/onboarding-store.js';
import {createAccountStore,accountScope} from '../src/account-store.js';
const project='test-project',A={user:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'}},B={user:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'}};
const versions={terms:'2026-10-21-v2',privacy:'2026-10-21-v2'},profile={currentParentLabel:'Alex',coParentLabel:'Jordan',children:['Avery','Sam'],activityIds:['school']};
const draftRaw=JSON.stringify({schema:1,answers:{...profile,children:'Avery\nSam',email:A.user.email},step:4});
const intent=(extra={})=>({schema:1,draftRaw,attempt:'11111111-aaaa-4111-8111-111111111111',email:A.user.email,scope:'',profile,termsVersion:versions.terms,privacyVersion:versions.privacy,acceptedAt:new Date().toISOString(),...extra});
function memory(){const rows=new Map();return {rows,async read({key}){return {value:rows.get(key)??null}},async write({key,value}){rows.set(key,value)},async keys({prefix}){return {keys:[...rows.keys()].filter(k=>k.startsWith(prefix))}},async compareBatch({rows:batch}){if(batch.some(r=>(rows.get(r.key)??null)!==r.expected))return {matched:false};for(const r of batch)if(r.value!==undefined)rows.set(r.key,r.value);return {matched:true}}};}
async function fixture(){const vault=memory(),draft=onboardingStore(vault,project);await draft.save(JSON.parse(draftRaw).answers,4);await draft.intent(intent());const pending=await draft.pending(),accounts=createAccountStore(vault,{project});await accounts.activate(A);const complete=()=>accounts.completeOnboarding({pendingKey:draft.intentKey,pendingRaw:pending.raw,versions,environment:'browser-preview'});return{vault,draft,pending,accounts,complete};}
test('unfinished setup is durable, project/account isolated and never stores checked agreement',async()=>{
 const vault=memory(),draft=onboardingStore(vault,project),answers={...profile,children:'Avery\nSam',email:A.user.email};
 await Promise.all([draft.save({...answers,currentParentLabel:'First'},0),draft.save(answers,3)]);
 assert.deepEqual(await onboardingStore(vault,project).load(),{schema:1,answers,step:3});assert.equal(await onboardingStore(vault,'other-project').load(),null);assert.equal(await onboardingStore(vault,project,accountScope(project,A.user.id)).load(),null);assert.equal(await draft.pending(),null);
 vault.write=async()=>{};await assert.rejects(draft.save(answers,4),/verify/);
});
test('consent intents reject stale versions, malformed metadata, invalid setup and wrong verified identity',()=>{
 for(const bad of [{termsVersion:'2026-10-13-v1'},{privacyVersion:'wrong'},{acceptedAt:'invalid'},{acceptedAt:new Date(Date.now()-2*24*60*60*1000).toISOString()},{acceptedAt:new Date(Date.now()+10*60*1000).toISOString()},{email:' A@example.invalid '},{profile:{...profile,children:['Same',' Same ']}},{profile:{...profile,activityIds:[]}},{attempt:'short'},{extra:true}])assert.throws(()=>validateIntent(intent(bad),versions));
 const owner={...A.user,scope:accountScope(project,A.user.id)};assert.equal(policyReceipt(intent(),owner,project,'browser-preview').userId,A.user.id);
 assert.throws(()=>policyReceipt(intent({email:B.user.email}),owner,project,'browser-preview'),/different/);assert.throws(()=>policyReceipt(intent({scope:accountScope(project,B.user.id)}),owner,project,'browser-preview'),/different/);
});
test('profile and versioned account receipt commit together, intent is consumed, and reopen preserves both',async()=>{
 const f=await fixture();await f.complete();assert.equal(f.accounts.state.status,'ready');assert.deepEqual(f.accounts.state.config.children,['Avery','Sam']);assert.equal(await f.draft.pending(),null);
 const receipts=[...f.vault.rows].filter(([key])=>key.startsWith('policy-receipt:'));assert.equal(receipts.length,1);const receipt=JSON.parse(receipts[0][1]);assert.equal(receipt.userId,A.user.id);assert.equal(receipt.termsVersion,versions.terms);assert.equal(receipt.source,'browser-preview');assert.equal(receipt.acceptedAt,f.pending.value.acceptedAt);
 const reopened=createAccountStore(f.vault,{project});await reopened.activate(A);assert.equal(reopened.state.status,'ready');assert.deepEqual(reopened.state.records.snapshot(),{});
 await assert.rejects(f.complete());assert.equal([...f.vault.rows.keys()].filter(k=>k.startsWith('policy-receipt:')).length,1);
 await reopened.updateProfile({currentParentLabel:'Changed'},reopened.state.config);assert.equal(f.vault.rows.get(receipts[0][0]),receipts[0][1],'Settings must not rewrite acceptance history');
});
test('transaction failure, changed intent, deletion lock and account switch cannot partially complete or leak setup',async()=>{
 for(const scenario of ['storage','intent','draft','scope','deletion','account']){
  const f=await fixture();if(scenario==='storage')f.vault.compareBatch=async()=>{throw Error('disk full')};
  if(scenario==='intent')await f.draft.intent(intent({attempt:'22222222-aaaa-4111-8111-111111111111'}));
  if(scenario==='draft')await f.draft.save({...JSON.parse(draftRaw).answers,currentParentLabel:'Newer draft'},4);
  if(scenario==='scope'){const key='onboarding:v1:'+project+':'+accountScope(project,B.user.id)+':intent';f.vault.rows.set(key,f.pending.raw);f.vault.rows.set(key.replace(/:intent$/,':draft'),f.pending.value.draftRaw);f.complete=()=>f.accounts.completeOnboarding({pendingKey:key,pendingRaw:f.pending.raw,versions,environment:'browser-preview'})}
  if(scenario==='deletion')f.vault.rows.set('deletion:v1:'+accountScope(project,A.user.id),'pending');
  if(scenario==='account')await f.accounts.activate(B);
  await assert.rejects(f.complete());assert(![...f.vault.rows.keys()].some(k=>k.startsWith('profile:')||k.startsWith('policy-receipt:')),scenario);
 }
});
test('an existing profile cannot be overwritten by signup intent, and corrupt checkpoints stay unchanged',async()=>{
 const f=await fixture();await f.accounts.saveProfile({...profile,currentParentLabel:'Existing'});await assert.rejects(f.complete());assert.equal(f.accounts.state.config.currentParentLabel,'Existing');assert(![...f.vault.rows.keys()].some(k=>k.startsWith('policy-receipt:')));
 const key='onboarding:v1:'+project+':guest:draft';f.vault.rows.set(key,'{broken');await assert.rejects(f.draft.load());assert.equal(f.vault.rows.get(key),'{broken');
});
test('sign-out during commit can leave only the original account rows and cannot open another account',async()=>{
 const f=await fixture(),commit=f.vault.compareBatch;let release,started;const waiting=new Promise(r=>started=r);
 f.vault.compareBatch=async args=>{started();await new Promise(r=>release=r);return commit(args)};
 const saving=f.complete();await waiting;f.accounts.lock();await f.accounts.activate(B);release();await assert.rejects(saving,/changed/);assert.equal(f.accounts.state.account.id,B.user.id);assert.equal(f.accounts.state.status,'needs-profile');
 const reopened=createAccountStore(f.vault,{project});await reopened.activate(A);assert.equal(reopened.state.config.currentParentLabel,'Alex');
});
