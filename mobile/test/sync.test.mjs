import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRecordStore} from '../src/record-store.js';
import {createAccountStore} from '../src/account-store.js';
import {fingerprint} from '../src/sync-store.js';
import {createSync,syncDecision} from '../src/sync.js';
import {previewBackend,deviceVault} from '../src/sync-preview.js';
const day='2026-10-22';
const entry={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Alex','Sam'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Original',attachment:{name:'sample.png',type:'image/png',dataUrl:'data:image/png;base64,AA=='},changeAgreed:null,changePressured:null,loggedAt:'2026-10-22T12:00:00Z'};
const A={user:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'}},B={user:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'}};
const profile={currentParentLabel:'Parent A',coParentLabel:'Parent B',children:['Alex','Sam']};
function memory(){const rows=new Map();return {rows,async read({key}){return {value:rows.get(key)??null}},async write({key,value}){rows.set(key,value)},async keys({prefix}){return {keys:[...rows.keys()].filter(k=>k.startsWith(prefix))}},async compareAndSwap({key,expected,value}){if((rows.get(key)??null)!==expected)return false;rows.set(key,value);return true}}}
async function save(store,note){const next=store.snapshot();next[day]={...entry,diary:note};await store.commit(next);}
async function device(vault,name,transport){const store=createRecordStore(deviceVault(vault,name),{scope:'test-A'});await store.open();return {store,sync:createSync({store,transport})}}
function cloud(vault){return previewBackend(vault,{scope:'test-A'},()=>true).entries}

test('offline edits and image survive restart, upload on reconnect, and restore to a second device',async()=>{
 const vault=memory(),transport=cloud(vault);let a=await device(vault,'one',transport);await save(a.store,'Offline first');
 a.sync.close();a.store.close();a=await device(vault,'one',transport);assert.equal(a.store.snapshot()[day].diary,'Offline first');assert.equal(a.store.syncItems()[day].sync.baseHash,null);
 await a.sync.run();assert.equal(a.sync.state.pending,0);const b=await device(vault,'two',transport);await b.sync.run();assert.deepEqual(b.store.snapshot(),a.store.snapshot());
 await save(a.store,'Only A changed');await a.sync.run();await b.sync.run();assert.equal(b.store.snapshot()[day].diary,'Only A changed');
 assert.equal(b.store.snapshot()[day].attachment.dataUrl,entry.attachment.dataUrl);
});
test('divergent edits preserve both copies across restarts; both choices resolve explicitly',async()=>{
 for(const choice of ['cloud','local']){
  const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport);let b=await device(vault,'two',transport);
  await save(a.store,'Base');await a.sync.run();await b.sync.run();await save(a.store,'Device A');await save(b.store,'Device B');await a.sync.run();
  b.sync.close();b.store.close();b=await device(vault,'two',transport);await b.sync.run();assert.equal(b.sync.state.status,'conflict');assert.equal(b.store.snapshot()[day].diary,'Device B');assert.equal((await transport.get(day)).value.diary,'Device A');
  assert(await b.sync.resolve(day,choice));await a.sync.run();assert.equal(a.store.snapshot()[day].diary,choice==='cloud'?'Device A':'Device B');assert.equal(b.sync.state.conflicts.length,0);
 }
});
test('a newer cloud version during review requires a fresh decision for either choice',async()=>{
 for(const choice of ['cloud','local']){
  const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport),b=await device(vault,'two',transport);
  await save(a.store,'Base');await a.sync.run();await b.sync.run();await save(a.store,'A first');await a.sync.run();await save(b.store,'B');await b.sync.run();
  await save(a.store,'A newest');await a.sync.run();assert.equal(await b.sync.resolve(day,choice),false);assert.equal(b.store.snapshot()[day].diary,'B');assert.equal((await transport.get(day)).value.diary,'A newest');
  assert.equal(b.sync.state.conflicts[0].remote.value.diary,'A newest');
 }
});
test('a server CAS race preserves the losing device edit and enters review',async()=>{
 const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport),b=await device(vault,'two',transport);
 await save(a.store,'A');await save(b.store,'B');let release,started;const entered=new Promise(r=>started=r),original=transport.compareAndSet;
 transport.compareAndSet=async(...args)=>{started();await new Promise(r=>release=r);return original(...args)};
 const pending=a.sync.run();await entered;transport.compareAndSet=original;await b.sync.run();release();await pending;
 assert.equal(a.sync.state.status,'conflict');assert.equal(a.store.snapshot()[day].diary,'A');assert.equal((await transport.get(day)).value.diary,'B');
});
test('late upload acknowledgements preserve newer local edits; failed acknowledgements remain pending after restart',async()=>{
 const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport);await save(a.store,'First');let release,started;const entered=new Promise(r=>started=r),original=transport.compareAndSet;
 transport.compareAndSet=async(...args)=>{const saved=await original(...args);started();await new Promise(r=>release=r);return saved};
 const pending=a.sync.run();await entered;await save(a.store,'Second');release();await pending;
 assert.equal(a.store.snapshot()[day].diary,'Second');assert.equal(a.store.syncItems()[day].sync.baseHash,await fingerprint({...entry,diary:'First'}));assert.equal(a.sync.state.pending,1);
 transport.compareAndSet=original;const write=vault.write;vault.write=async()=>{throw new Error('disk full')};await a.sync.run();assert.equal(a.sync.state.status,'error');vault.write=write;
 const reopened=await device(vault,'one',transport);await reopened.sync.run();assert.equal(reopened.store.snapshot()[day].diary,'Second');assert.equal(reopened.sync.state.pending,0);
});
test('unverified local writes block sync until successful retry or reopen',async()=>{
 const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport);await save(a.store,'Base');await a.sync.run();const read=vault.read;
 vault.read=async({key})=>key.startsWith('device-one:checkin:')?{value:null}:read({key});await assert.rejects(save(a.store,'Actually written'),/verified/);
 await a.sync.run();assert.equal(a.sync.state.status,'error');assert.equal((await transport.get(day)).value.diary,'Base');
 vault.read=read;const reopened=await device(vault,'one',transport);await reopened.sync.run();assert.equal((await transport.get(day)).value.diary,'Actually written');
});
test('download cannot replace a local save made while listing; a draft opened before a download cannot overwrite it',async()=>{
 const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport),b=await device(vault,'two',transport);await save(a.store,'Base');await a.sync.run();await b.sync.run();
 await save(a.store,'Cloud change');await a.sync.run();let release,started;const entered=new Promise(r=>started=r),original=b.store.accept;
 b.store.accept=async(...args)=>{started();await new Promise(r=>release=r);return original(...args)};
 const pending=b.sync.run();await entered;await save(b.store,'New local');release();await pending;b.store.accept=original;assert.equal(b.store.snapshot()[day].diary,'New local');await b.sync.run();assert.equal(b.sync.state.status,'conflict');
 await b.sync.resolve(day,'cloud');b.store.beginEdit(day);await save(a.store,'Cloud later');await a.sync.run();await b.sync.run();await assert.rejects(save(b.store,'Stale draft'),/changed in the cloud/);
});
test('cloud removals and unknown divergence cannot silently resurrect or replace data',async()=>{
 const local={value:entry,sync:{baseHash:null,version:null}},remote={value:{...entry,diary:'Different'},version:'v1'};
 assert.equal(await syncDecision(local,remote),'conflict');assert.equal(await syncDecision(local,{deleted:true,version:'v2'}),'conflict');
});
test('profile restore and pending check-ins stay account-scoped; closing while a cloud read is pending never publishes',async()=>{
 const shared=memory(),one=deviceVault(shared,'one'),two=deviceVault(shared,'two'),backend=owner=>previewBackend(shared,owner,()=>true);
 const a=createAccountStore(one,{project:'test-project',backend});await a.activate(A);await a.saveProfile(profile);await a.sync();
 const b=createAccountStore(two,{project:'test-project',backend});await b.activate(A);assert.equal(b.state.status,'ready');assert.deepEqual(b.state.config.children,['Alex','Sam']);assert.deepEqual(b.state.records.snapshot(),{});
 await b.activate(B);assert.equal(b.state.status,'needs-profile');assert.equal(Object.keys((await backend({scope:b.state.account.scope}).profile.list())).length,0);
 let release,started;const entered=new Promise(r=>started=r),states=[];
 const slow=createAccountStore(two,{project:'slow-project',onState:s=>states.push(s),backend:owner=>{const remote=backend(owner);remote.profile.list=async()=>{started();await new Promise(r=>release=r);return {profile:{value:a.state.config,version:'v1'}}};return remote}});
 const pending=slow.activate(A);await entered;slow.lock();release();await pending;assert.equal(slow.state.status,'signed-out');assert(!states.some(s=>s.status==='ready'));assert.equal((await two.read({key:'profile:v1:account-v1-slow-project-'+A.user.id})).value,null);
});
test('new accounts with unreachable cloud cannot silently create a replacement profile',async()=>{
 const backend=()=>({profile:{async list(){throw new Error('offline')}},entries:{}}),store=createAccountStore(memory(),{project:'test-project',backend});
 await store.activate(A);assert.equal(store.state.status,'restore-unavailable');await assert.rejects(store.saveProfile(profile));
});
test('profile changes use the same conflict choices and restore the chosen family on another device',async()=>{
 for(const choice of ['cloud','local']){
  const shared=memory(),backend=owner=>previewBackend(shared,owner,()=>true),a=createAccountStore(deviceVault(shared,'one'),{project:'profile-project',backend}),b=createAccountStore(deviceVault(shared,'two'),{project:'profile-project',backend});
  await a.activate(A);await a.saveProfile(profile);await a.sync();await b.activate(A);
  await a.state.profile.save({...a.state.config,children:['Alex','Sam','Taylor']});await a.sync();
  await b.state.profile.save({...b.state.config,coParentLabel:'Other parent on this device'});await b.sync();
  assert.equal(b.syncs[0].state.status,'conflict');assert(await b.syncs[0].resolve('profile',choice));
  b.lock();await b.activate(A);await a.sync();
  assert.deepEqual(b.state.config.children,choice==='cloud'?['Alex','Sam','Taylor']:['Alex','Sam']);
  assert.equal(b.state.config.coParentLabel,choice==='cloud'?'Parent B':'Other parent on this device');
 }
});
test('downloads wait while editing and resume without resetting the draft',async()=>{
 const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport),local=createRecordStore(deviceVault(vault,'two'),{scope:'test-A'});await local.open();
 let idle=false;const sync=createSync({store:local,transport,canDownload:()=>idle});await save(a.store,'Cloud check-in');await a.sync.run();
 await sync.run();assert.equal(sync.state.status,'waiting');assert.deepEqual(local.snapshot(),{});idle=true;await sync.run();assert.equal(local.snapshot()[day].diary,'Cloud check-in');
});
test('a review click queued behind an automatic refresh cannot choose an unseen newer copy',async()=>{
 for(const choice of ['cloud','local']){
  const vault=memory(),transport=cloud(vault),a=await device(vault,'one',transport),b=await device(vault,'two',transport);
  await save(a.store,'Base');await a.sync.run();await b.sync.run();await save(a.store,'Reviewed cloud');await a.sync.run();await save(b.store,'Local');await b.sync.run();const reviewed=b.sync.state.conflicts[0];
  await save(a.store,'Unseen cloud');await a.sync.run();let release,started;const entered=new Promise(r=>started=r),list=transport.list;
  transport.list=async()=>{started();await new Promise(r=>release=r);return list()};
  const refresh=b.sync.run();await entered;const resolution=b.sync.resolve(day,choice,reviewed);release();await refresh;
  assert.equal(await resolution,false);assert.equal(b.store.snapshot()[day].diary,'Local');assert.equal((await transport.get(day)).value.diary,'Unseen cloud');
 }
});
