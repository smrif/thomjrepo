import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAccountStore,accountScope} from '../src/account-store.js';
import {portable,parseBackup} from '../src/backup-domain.js';
import {localDay} from '../src/domain.js';
const A={user:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'}},B={user:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'}};
const profile={currentParentLabel:'Parent A',coParentLabel:'Other parent',children:['Alex','Sam']};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const entry={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Alex','Sam'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Private <note> 日本語',attachment:{name:'synthetic.png',type:'image/png',dataUrl:image},changeAgreed:null,changePressured:null,loggedAt:new Date().toISOString()};
const today=localDay(new Date()),old='2000-01-01';
function memory(){const rows=new Map();return {rows,async read({key}){return{value:rows.get(key)??null}},async write({key,value}){rows.set(key,value)},async keys({prefix}){return{keys:[...rows.keys()].filter(k=>k.startsWith(prefix))}},async compareBatch({rows:batch}){if(batch.some(row=>(rows.get(row.key)??null)!==row.expected))return{matched:false};for(const row of batch)if(row.value!==undefined)rows.set(row.key,row.value);return{matched:true}}}}
async function setup(vault=memory(),owner=A){const accounts=createAccountStore(vault,{project:'backup-test',online:()=>false});await accounts.activate(owner);if(accounts.state.status==='needs-profile')await accounts.saveProfile(profile);return{vault,accounts}}
async function fixture(accounts){const state=accounts.backupSnapshot();return portable.create({...state,config:{...state.config,currentParentLabel:'From backup',themeMode:'dark'},records:{[old]:entry,[today]:entry}})}
test('mobile JSON round-trips profile, Unicode note and full image without credentials or sync metadata',async()=>{
 const {accounts}=await setup(),state=accounts.backupSnapshot(),file=await fixture(accounts),parsed=await parseBackup(JSON.stringify(file));assert.deepEqual(parsed,file);assert.equal(file.account.project,'backup-test');assert.equal(file.entries[today].attachment.dataUrl,image);assert(!JSON.stringify(file).includes('baseHash'));assert.equal(state.config.termsAccepted,false);
 const changed=structuredClone(file);changed.account.project='foreign';await assert.rejects(parseBackup(JSON.stringify(changed)),/verification failed/);
});
test('project/account ownership and mobile validation reject unsafe imports before writes',async()=>{
 const {vault,accounts}=await setup(),before=[...vault.rows],file=await fixture(accounts),state=accounts.backupSnapshot();
 for(const account of [{...file.account,id:B.user.id},{...file.account,project:'other'},{id:A.user.id,email:A.user.email}]){const foreign=await portable.create({account,config:file.settings,records:file.entries});await assert.rejects(accounts.restoreBackup(foreign,state.snapshot,{}),/different/);}
 const invalid=await portable.create({account:file.account,config:file.settings,records:{[today]:{...entry,attachment:{...entry.attachment,dataUrl:'data:image/gif;base64,AAAA'}}}});await assert.rejects(parseBackup(JSON.stringify(invalid)),/JPEG/);assert.deepEqual([...vault.rows],before);
 await assert.rejects(parseBackup('broken'),/JSON/);
});
test('selected restore is atomic, preserves other accounts and reloads before resuming sync',async()=>{
 const {vault,accounts}=await setup();await accounts.activate(B);await accounts.saveProfile({...profile,children:['Jordan']});const other=[...vault.rows].filter(([key])=>key.includes(B.user.id));await accounts.activate(A);
 const file=await fixture(accounts),snapshot=accounts.backupSnapshot(),held=accounts.state.records;await accounts.restoreBackup(file,snapshot.snapshot,{restoreProfile:true});assert.equal(accounts.state.status,'restore-complete');assert.throws(()=>held.snapshot(),/not ready/);
 await accounts.activate(A);assert.equal(accounts.state.status,'restore-complete');const reopened=(await setup(vault)).accounts;assert.deepEqual(reopened.state.records.snapshot(),file.entries);assert.equal(reopened.state.config.themeMode,'dark');assert.equal(reopened.state.config.email,A.user.email);assert.equal(reopened.state.config.termsAccepted,false);
 for(const item of Object.values(reopened.state.records.syncItems()))assert.deepEqual(item.sync,{baseHash:null,version:null});assert.deepEqual([...vault.rows].filter(([key])=>key.includes(B.user.id)),other);
});
test('read-only conflicts remain current, editable choices are explicit and profile restore is optional',async()=>{
 const {vault,accounts}=await setup();for(const day of [old,today]){const s=accounts.state.records.snapshot();s[day]={...entry,diary:'Keep current'};await accounts.state.records.commit(s);}
 const file=await fixture(accounts),state=accounts.backupSnapshot();await assert.rejects(accounts.restoreBackup(file,state.snapshot,{choices:{[old]:'backup'}}),/read-only/);assert.equal(accounts.state.status,'ready');
 await accounts.restoreBackup(file,state.snapshot,{choices:{[today]:'backup'}});const reopened=(await setup(vault)).accounts;assert.equal(reopened.state.records.snapshot()[old].diary,'Keep current');assert.equal(reopened.state.records.snapshot()[today].diary,entry.diary);assert.equal(reopened.state.config.currentParentLabel,'Parent A');
});
test('stale review and concurrent persisted changes cannot overwrite a newer copy',async()=>{
 const {vault,accounts}=await setup(),file=await fixture(accounts),state=accounts.backupSnapshot();await accounts.updateProfile({currentParentLabel:'Newer'},state.config);await assert.rejects(accounts.restoreBackup(file,state.snapshot,{restoreProfile:true}),/data changed/);assert.equal(accounts.state.status,'ready');
 const fresh=accounts.backupSnapshot(),batch=vault.compareBatch;vault.compareBatch=async request=>{await vault.write({key:'checkin:v1:'+accountScope('backup-test',A.user.id)+':'+today,value:JSON.stringify({schema:2,scope:accountScope('backup-test',A.user.id),day:today,entry:{...entry,diary:'Concurrent'},sync:{baseHash:null,version:null}})});return batch(request)};
 await assert.rejects(accounts.restoreBackup(file,fresh.snapshot,{restoreProfile:true}),/changed/);assert.equal(accounts.state.status,'restore-check');const reopened=(await setup(vault)).accounts;assert.equal(reopened.state.config.currentParentLabel,'Newer');assert.equal(reopened.state.records.snapshot()[today].diary,'Concurrent');assert.equal(reopened.state.records.snapshot()[old],undefined);
});
test('failed transaction and lost commit response reopen to either the previous state or the complete restore',async()=>{
 for(const committed of [false,true]){
  const {vault,accounts}=await setup(),file=await fixture(accounts),state=accounts.backupSnapshot(),batch=vault.compareBatch;
  vault.compareBatch=async request=>{if(committed)await batch(request);throw Error('interrupted')};await assert.rejects(accounts.restoreBackup(file,state.snapshot,{restoreProfile:true}),/interrupted/);assert.equal(accounts.state.status,'restore-check');
  const reopened=(await setup(vault)).accounts;assert.equal(Object.keys(reopened.state.records.snapshot()).length,committed?2:0);assert.equal(reopened.state.config.currentParentLabel,committed?'From backup':'Parent A');
 }
});
test('delayed restore cannot publish into a different active account',async()=>{
 const {vault,accounts}=await setup(),file=await fixture(accounts),state=accounts.backupSnapshot(),batch=vault.compareBatch;let release,started;const waiting=new Promise(r=>started=r);
 vault.compareBatch=async request=>{started();await new Promise(r=>release=r);return batch(request)};
 const pending=accounts.restoreBackup(file,state.snapshot,{restoreProfile:true});await waiting;await accounts.activate(B);await accounts.saveProfile({...profile,children:['Jordan']});release();assert.equal(await pending,null);assert.equal(accounts.state.account.id,B.user.id);assert.equal(accounts.state.status,'ready');assert.deepEqual(accounts.state.records.snapshot(),{});
});
test('a restored edit queues conflict review instead of silently replacing an existing cloud copy',async()=>{
 const {vault,accounts}=await setup(),file=await fixture(accounts),state=accounts.backupSnapshot();await accounts.restoreBackup(file,state.snapshot,{restoreProfile:true});const reopened=(await setup(vault)).accounts;
 const {createSync}=await import('../src/sync.js');let uploads=0;const remote={value:{...entry,diary:'Cloud copy'},version:'cloud-version'};
 const sync=createSync({store:reopened.state.records,transport:{async list(){return{[today]:remote}},async compareAndSet(_id,value){uploads++;return{value,version:'new-version'}}},online:()=>true});await sync.run();assert.equal(sync.state.status,'conflict');assert(sync.state.conflicts.some(c=>c.id===today));assert.equal(reopened.state.records.snapshot()[today].diary,entry.diary);assert.equal(uploads,1,'Only the missing historical date is offered as a new upload.');
});
test('deletion appearing during restore prevents every selected write',async()=>{
 const {vault,accounts}=await setup(),file=await fixture(accounts),state=accounts.backupSnapshot(),batch=vault.compareBatch;
 vault.compareBatch=async request=>{const marker=request.rows.find(r=>r.key.startsWith('deletion:'));await vault.write({key:marker.key,value:JSON.stringify({schema:1,scope:accountScope('backup-test',A.user.id),userId:A.user.id,status:'pending'})});return batch(request)};
 await assert.rejects(accounts.restoreBackup(file,state.snapshot,{restoreProfile:true}),/changed/);assert(![...vault.rows.keys()].some(key=>key.startsWith('checkin:')));assert.equal(JSON.parse([...vault.rows].find(([key])=>key.startsWith('profile:'))[1]).config.currentParentLabel,'Parent A');const reopened=(await setup(vault)).accounts;assert.equal(reopened.state.status,'deletion-pending');
});
