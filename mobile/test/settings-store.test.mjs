import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAccountStore} from '../src/account-store.js';
const A={user:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'}},B={user:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'}};
const profile={currentParentLabel:'Parent A',coParentLabel:'Parent B',children:['Alex','Sam']};
function memory(){const rows=new Map();return {rows,async read({key}){return{value:rows.get(key)??null}},async write({key,value}){rows.set(key,value)},async keys({prefix}){return{keys:[...rows.keys()].filter(k=>k.startsWith(prefix))}}}}
async function setup(vault=memory()){const accounts=createAccountStore(vault,{project:'settings-test'});await accounts.activate(A);if(accounts.state.status==='needs-profile')await accounts.saveProfile(profile);return{vault,accounts}}
test('settings persist per-account labels, children, activities and appearance without changing another profile',async()=>{
 const {vault,accounts}=await setup();const patch={currentParentLabel:'New parent',coParentLabel:'New co-parent',children:['Taylor','Alex'],activityIds:['school','Library'],themeMode:'dark'};
 await accounts.updateProfile(patch,accounts.state.profile.config());assert.equal(accounts.state.config.currentParentLabel,'New parent');
 const reopened=(await setup(vault)).accounts;assert.equal(reopened.state.config.themeMode,'dark');assert.deepEqual(reopened.state.config.activityIds,['school','Library']);assert.deepEqual(reopened.state.config.children,['Taylor','Alex']);
 await reopened.activate(B);await reopened.saveProfile({...profile,children:['Jordan']});await reopened.activate(A);assert.deepEqual(reopened.state.config.children,['Taylor','Alex']);
});
test('failed profile writes keep the applied config unchanged, retain retry and reject stale Settings saves',async()=>{
 const {vault,accounts}=await setup(),expected=accounts.state.profile.config(),write=vault.write;
 vault.write=async()=>{throw new Error('disk full')};await assert.rejects(accounts.updateProfile({themeMode:'dark'},expected),/disk full/);assert.equal(accounts.state.config.themeMode,'system');
 vault.write=write;await accounts.updateProfile({themeMode:'dark'},expected);await assert.rejects(accounts.updateProfile({currentParentLabel:'Stale'},expected),/profile changed/);assert.equal(accounts.state.config.currentParentLabel,'Parent A');
});
test('a delayed Settings save cannot apply to a newly active account',async()=>{
 const {vault,accounts}=await setup();await accounts.activate(B);await accounts.saveProfile({...profile,children:['Jordan']});await accounts.activate(A);
 const write=vault.write;let release,started;const waiting=new Promise(r=>started=r);vault.write=async row=>{if(row.key.startsWith('profile:')&&row.key.endsWith(A.user.id)){started();await new Promise(r=>release=r)}return write(row)};
 const pending=accounts.updateProfile({currentParentLabel:'A updated'},accounts.state.profile.config());await waiting;await accounts.activate(B);release();await assert.rejects(pending,/account changed/);assert.equal(accounts.state.config.currentParentLabel,'Parent A');assert.deepEqual(accounts.state.config.children,['Jordan']);
});
test('settings reject identity/consent edits and invalid family data',async()=>{
 const {accounts}=await setup();for(const patch of [{email:'other@example.invalid'},{termsAccepted:true},{children:[]},{children:['Alex',' Alex ']},{activityIds:['a'.repeat(101)]},{activityIds:[]},{activityIds:['school','school']},{themeMode:'unknown'}])await assert.rejects(accounts.updateProfile(patch,accounts.state.profile.config()));
});
test('confirmed deletion revokes held stores, retains local copies and cannot reopen the deleted scope',async()=>{
 const {vault,accounts}=await setup(),old=accounts.state.records,rows=[...vault.rows].filter(([key])=>key.startsWith('profile:'));
 await accounts.deleteAccount('DELETE',async owner=>{assert.equal(owner.id,A.user.id);assert.throws(()=>old.snapshot(),/not ready/);return{deleted:true}});
 assert.equal(accounts.state.status,'deleted');assert.deepEqual([...vault.rows].filter(([key])=>key.startsWith('profile:')),rows);
 const reopened=(await setup(vault)).accounts;assert.equal(reopened.state.status,'deleted');await reopened.activate(B);assert.equal(reopened.state.status,'needs-profile');
});
test('uncertain deletion is durably gated; definitive rejection retains the account and allows reopening',async()=>{
 for(const definite of [true,false]){
  const {vault,accounts}=await setup();const error=new Error('network or service failure');error.definite=definite;
  await assert.rejects(accounts.deleteAccount('DELETE',async()=>{throw error}));assert.equal(accounts.state.status,definite?'deletion-failed':'deletion-pending');
  const reopened=(await setup(vault)).accounts;assert.equal(reopened.state.status,definite?'ready':'deletion-pending');
  if(!definite){await reopened.deleteAccount('DELETE',async()=>({deleted:true}));assert.equal(reopened.state.status,'deleted');}
 }
});
test('deletion drains an in-flight sync before requesting removal and rejects duplicate requests',async()=>{
 const vault=memory();let release,started;const waiting=new Promise(r=>started=r),backend=()=>({profile:{async list(){return{}}},entries:{async list(){started();await new Promise(r=>release=r);return{}}}});
 const accounts=createAccountStore(vault,{project:'settings-test',backend});await accounts.activate(A);await accounts.saveProfile(profile);await waiting;
 let removed=false;const pending=accounts.deleteAccount('DELETE',async()=>{removed=true;return{deleted:true}});
 await new Promise(r=>setTimeout(r,0));assert.equal(removed,false);await assert.rejects(accounts.deleteAccount('DELETE',async()=>({deleted:true})));release();await pending;assert.equal(removed,true);
});
test('invalid/offline deletion or failure to verify its checkpoint never contacts the server',async()=>{
 const {vault,accounts}=await setup();let calls=0;const remove=async()=>{calls++;return{deleted:true}};
 await assert.rejects(accounts.deleteAccount('delete',remove));vault.write=async()=>{throw Error('disk full')};await assert.rejects(accounts.deleteAccount('DELETE',remove));const offline=createAccountStore(vault,{project:'settings-test',online:()=>false});await offline.activate(A);await assert.rejects(offline.deleteAccount('DELETE',remove));assert.equal(calls,0);
});
test('a deletion detected by another preview device closes sync and preserves its local scope',async()=>{
 let deleted=false;const vault=memory(),backend=()=>({isDeleted:async()=>deleted,profile:{async list(){return{}}},entries:{async list(){return{}}}}),accounts=createAccountStore(vault,{project:'settings-test',backend});
 await accounts.activate(A);await accounts.saveProfile(profile);const old=accounts.state.records;deleted=true;await accounts.sync();assert.equal(accounts.state.status,'deleted');assert.throws(()=>old.snapshot(),/not ready/);
 assert([...vault.rows.keys()].some(key=>key.startsWith('profile:')));const reopened=createAccountStore(vault,{project:'settings-test'});await reopened.activate(A);assert.equal(reopened.state.status,'deleted');
});
test('a delayed deletion checkpoint cannot close a different active account',async()=>{
 const vault=memory();let deleted=false,release,started;const waiting=new Promise(r=>started=r);
 const backend=owner=>({isDeleted:async()=>deleted&&owner.id===A.user.id,profile:{async list(){return{}}},entries:{async list(){return{}}}});
 const accounts=createAccountStore(vault,{project:'settings-test',backend});await accounts.activate(A);await accounts.saveProfile(profile);await accounts.sync();
 const write=vault.write;vault.write=async row=>{if(row.key.startsWith('deletion:')&&row.key.endsWith(A.user.id)){started();await new Promise(r=>release=r)}return write(row)};
 deleted=true;const pending=accounts.sync();await waiting;await accounts.activate(B);await accounts.saveProfile({...profile,children:['Jordan']});const records=accounts.state.records;release();await pending;
 assert.equal(accounts.state.status,'ready');assert.equal(accounts.state.account.id,B.user.id);assert.deepEqual(accounts.state.config.children,['Jordan']);assert.deepEqual(records.snapshot(),{});
});
