import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRecordStore,validateEntry} from '../src/record-store.js';
const day='2026-10-22';
const entry={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Alex','Sam'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Synthetic only',attachment:{name:'sample.png',type:'image/png',dataUrl:'data:image/png;base64,AA=='},changeAgreed:null,changePressured:null,loggedAt:'2026-10-22T12:00:00Z'};
function memory(){const rows=new Map();return {rows,keys:async({prefix})=>({keys:[...rows.keys()].filter(k=>k.startsWith(prefix))}),read:async({key})=>({value:rows.get(key)??null}),write:async({key,value})=>{rows.set(key,value)}}}
async function write(store,value=entry,date=day){const rows=store.snapshot();rows[date]=structuredClone(value);await store.commit(rows)}
test('full check-in and image survive new store instances; failed writes do not publish',async()=>{
  const vault=memory(),store=createRecordStore(vault,{scope:'user-A'});await store.open();await write(store);
  const reopened=createRecordStore(vault,{scope:'user-A'});await reopened.open();assert.deepEqual(reopened.snapshot()[day],entry);
  vault.write=async()=>{throw new Error('disk full')};await assert.rejects(write(reopened,{...entry,diary:'unsaved'}),/disk full/);assert.deepEqual(reopened.snapshot()[day],entry);
});
test('readback failure never publishes Saved and reopening recovers actual committed data',async()=>{
  const vault=memory(),store=createRecordStore(vault,{scope:'user-A'});await store.open();const read=vault.read;
  vault.read=async()=>({value:null});await assert.rejects(write(store),/verified/);assert.deepEqual(store.snapshot(),{});
  vault.read=read;const reopened=createRecordStore(vault,{scope:'user-A'});await reopened.open();assert.deepEqual(reopened.snapshot()[day],entry);
});
test('scope isolation, stale edits and bulk changes cannot overwrite another record',async()=>{
  const vault=memory(),a=createRecordStore(vault,{scope:'user-A'}),b=createRecordStore(vault,{scope:'user-B'});await a.open();await b.open();await write(a);
  assert.deepEqual(b.snapshot(),{});await write(b,{...entry,diary:'B'});await a.open();assert.equal(a.snapshot()[day].diary,entry.diary);
  const stale=a.snapshot();await write(a,{...entry,diary:'newer'});stale[day].diary='old edit';await assert.rejects(a.commit(stale),/changed/);
  const bulk=a.snapshot();bulk['2026-10-20']=entry;bulk['2026-10-21']=entry;await assert.rejects(a.commit(bulk),/Bulk/);
  const removal=a.snapshot();delete removal[day];await assert.rejects(a.commit(removal),/removal/);
});
test('invalid/future/cross-scope stored data blocks startup without replacing rows',async()=>{
  for(const row of [{schema:2,scope:'user-A',day,entry},{schema:1,scope:'user-B',day,entry},{schema:1,scope:'user-A',day,entry:{...entry,week:'unknown'}}]){
    const vault=memory();vault.rows.set('checkin:v1:user-A:'+day,JSON.stringify(row));const before=[...vault.rows];const store=createRecordStore(vault,{scope:'user-A'});
    await assert.rejects(store.open());assert.throws(()=>store.snapshot(),/not ready/);assert.deepEqual([...vault.rows],before);
  }
});
test('untrusted record payloads reject invalid dates, executable images and oversized notes',()=>{
  for(const change of [{diary:'x'.repeat(4001)},{attachment:{name:'bad.svg',type:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,AA=='}},{helpedData:{Alex:{acts:['school'],note:'x'.repeat(4001)}}},{kidsWithDad:'Alex'},{extra:'unknown'}])assert.throws(()=>validateEntry(day,{...entry,...change}));
  assert.throws(()=>validateEntry('2026-02-30',entry));
});
test('a pending save blocks another commit and exposes only previously verified data',async()=>{
  const vault=memory(),store=createRecordStore(vault,{scope:'user-A'});await store.open();let unblock;const original=vault.write;
  vault.write=async args=>{await new Promise(resolve=>{unblock=resolve});await original(args)};
  const first=write(store);assert.deepEqual(store.snapshot(),{});await assert.rejects(write(store),/another save/);unblock();await first;assert.deepEqual(store.snapshot()[day],entry);
});
