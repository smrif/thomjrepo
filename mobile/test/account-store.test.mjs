import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAccountStore,accountScope,validateProfile} from '../src/account-store.js';
const A={user:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'}},B={user:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'}};
const profile={currentParentLabel:'Parent A',coParentLabel:'Parent B',children:['Alex','Sam']};
const entry={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Alex','Sam'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Only account A',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-10-22T12:00:00Z'};
function memory(){const rows=new Map();return {rows,async read({key}){return {value:rows.get(key)??null}},async write({key,value}){rows.set(key,value)},async keys({prefix}){return {keys:[...rows.keys()].filter(k=>k.startsWith(prefix))}}}}
async function setup(store,session=A,config=profile){await store.activate(session);if(store.state.status==='needs-profile')await store.saveProfile(config);return store.state.records;}

test('profiles and check-ins survive new stores, stay account/project scoped, and never adopt sample data',async()=>{
 const vault=memory(),accounts=createAccountStore(vault,{project:'test-project'}),a=await setup(accounts);
 const snapshot=a.snapshot();snapshot['2026-10-22']=entry;await a.commit(snapshot);
 await accounts.activate(B);assert.equal(accounts.state.status,'needs-profile');assert.throws(()=>a.snapshot(),/not ready/);
 const b=await setup(accounts,B,{...profile,children:['Taylor']});assert.deepEqual(b.snapshot(),{});
 accounts.lock();assert.equal(accounts.state.status,'signed-out');assert.throws(()=>b.snapshot(),/not ready/);
 const reopened=createAccountStore(vault,{project:'test-project'});await reopened.activate(A);
 assert.equal(reopened.state.config.email,A.user.email);assert.deepEqual(reopened.state.config.children,['Alex','Sam']);assert.deepEqual(reopened.state.records.snapshot()['2026-10-22'],entry);
 const otherProject=createAccountStore(vault,{project:'another-project'});await otherProject.activate(A);assert.equal(otherProject.state.status,'needs-profile');
 assert.notEqual(accountScope('test-project',A.user.id),accountScope('another-project',A.user.id));
 assert(![...vault.rows.values()].some(v=>v.includes('access_token')||v.includes('refresh_token')));
});
test('sign-out during a pending write revokes old snapshots and prevents publishing into the next account',async()=>{
 const vault=memory(),accounts=createAccountStore(vault,{project:'test-project'}),a=await setup(accounts),original=vault.write;
 let release,started;const waiting=new Promise(r=>started=r);vault.write=async row=>{if(row.key.startsWith('checkin:')){started();await new Promise(r=>release=r)}return original(row)};
 const snapshot=a.snapshot();snapshot['2026-10-22']=entry;const pending=a.commit(snapshot);await waiting;accounts.lock();
 await setup(accounts,B);assert.deepEqual(accounts.state.records.snapshot(),{});release();await assert.rejects(pending,/account changed/);
 await assert.rejects(a.commit(snapshot),/not ready/);assert.throws(()=>a.snapshot(),/not ready/);
 await accounts.activate(A);assert.deepEqual(accounts.state.records.snapshot()['2026-10-22'],entry,'A later reopen recovers its own actual committed write');
});
test('a delayed previous-account profile cannot reopen or replace the active account',async()=>{
 const vault=memory(),first=createAccountStore(vault,{project:'test-project'});await setup(first);await setup(first,B);
 let release;const read=vault.read;vault.read=async row=>{if(row.key==='profile:v1:'+accountScope('test-project',A.user.id))await new Promise(r=>release=r);return read(row)};
 const states=[],accounts=createAccountStore(vault,{project:'test-project',onState:s=>states.push(s)});
 const slow=accounts.activate(A);await accounts.activate(B);release();await slow;
 assert.equal(accounts.state.account.id,B.user.id);assert(!states.some(s=>s.status==='ready'&&s.account.id===A.user.id));
});
test('corrupt/misowned profiles block entry without replacing data; failed profile saves remain retryable',async()=>{
 for(const corrupt of ['{broken',JSON.stringify({schema:1,scope:accountScope('test-project',B.user.id),userId:A.user.id,config:profile})]){
  const vault=memory(),key='profile:v1:'+accountScope('test-project',A.user.id);vault.rows.set(key,corrupt);
  const accounts=createAccountStore(vault,{project:'test-project'});await assert.rejects(accounts.activate(A));assert.equal(accounts.state.status,'error');assert.equal(vault.rows.get(key),corrupt);
 }
 const vault=memory(),accounts=createAccountStore(vault,{project:'test-project'});await accounts.activate(A);
 const write=vault.write;vault.write=async()=>{throw new Error('disk full')};await assert.rejects(accounts.saveProfile(profile),/disk full/);assert.equal(accounts.state.status,'needs-profile');
 vault.write=write;await accounts.saveProfile(profile);assert.equal(accounts.state.status,'ready');
});
test('profile and identity validation rejects fabricated consent, ambiguous names, and injected scopes',()=>{
 for(const bad of [{...profile,children:[]},{...profile,children:['Alex',' Alex ']},{...profile,termsAccepted:true},{...profile,extra:'unknown'}])assert.throws(()=>validateProfile(bad,A.user.email));
 for(const [project,id] of [['test:other',A.user.id],['test-project','../../other']])assert.throws(()=>accountScope(project,id));
});
test('same-account refresh does not reset a profile draft or reopen the record store',async()=>{
 const accounts=createAccountStore(memory(),{project:'test-project'});await accounts.activate(A);const draft=accounts.state;
 await accounts.activate(A);assert.equal(accounts.state,draft);await accounts.saveProfile(profile);const ready=accounts.state;
 await accounts.activate(A);assert.equal(accounts.state,ready);
 await assert.rejects(accounts.activate({user:{id:'invalid',email:'x@example.invalid'}}));assert.equal(accounts.state.status,'signed-out');assert.throws(()=>ready.records.snapshot(),/not ready/);
});
test('a previous account read failing late does not hide the new account',async()=>{
 const vault=memory(),seed=createAccountStore(vault,{project:'test-project'});await setup(seed,B);
 const read=vault.read;let reject;vault.read=async row=>{if(row.key==='profile:v1:'+accountScope('test-project',A.user.id))return await new Promise((_,r)=>reject=r);return read(row)};
 const accounts=createAccountStore(vault,{project:'test-project'}),old=accounts.activate(A);await accounts.activate(B);reject(new Error('old read failed'));await old;
 assert.equal(accounts.state.status,'ready');assert.equal(accounts.state.account.id,B.user.id);
});
