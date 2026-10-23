import assert from 'node:assert/strict';
import {test} from 'node:test';
import '../backup.js';
const B=globalThis.WhoseDayBackup;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const account={id:'owner-a',email:'parent@example.com'};
const config={currentParentLabel:'Alex <Parent>',coParentLabel:'Jordan & Co',children:['Avery','Sam'],email:account.email,activityIds:['school','Art <class>'],themeMode:'dark',purpose:'Personal records',termsAccepted:true,termsVersion:'2026-10-13',termsAcceptedAt:'2026-10-19T12:00:00Z',privacyVersion:'2026-10-13',privacyAcceptedAt:'2026-10-19T12:00:00Z',policyAcceptanceOwnerId:account.id};
const entry={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Avery'],absentData:{Sam:{location:'sleepover',note:'A < B & C'}},diary:'Literal <img src=x onerror=alert(1)> text',attachment:{name:'family.png',type:'image/png',dataUrl:png},loggedAt:'2026-10-18T12:00:00Z',changeAgreed:null,changePressured:null};
const records={'2026-10-18':entry,'2026-10-19':{week:'not-logged',intentional:true}};
const backup=()=>B.create({account,config,records,exportedAt:'2026-10-20T12:00:00Z'});
const state=(data={})=>({account,config,records:{},yesterday:'2026-10-19',...data});
class Storage{
 constructor(data={}){this.data=new Map(Object.entries(data));this.failKey=null;this.always=false;}
 getItem(k){return this.data.has(k)?this.data.get(k):null}
 setItem(k,v){if(k===this.failKey){if(!this.always)this.failKey=null;throw new Error('QuotaExceededError')}this.data.set(k,String(v))}
 removeItem(k){this.data.delete(k)}
}
const stored=()=>new Storage({custody_tracker_config:JSON.stringify(config),familylog_entries:JSON.stringify({'2026-10-19':{week:'mom'}}),'whose_day_entry_sync_base:owner-a':JSON.stringify({'2026-10-18':{week:'mom'},'2026-10-17':{week:'dad'}}),'sb-auth-token':'keep-credential'});

test('complete JSON backup round-trips exact notes, historical names, screenshots and policy metadata without auth credentials',async()=>{
 const result=await B.create({account,config:{...config,access_token:'SECRET',deviceId:'not-portable'},records});
 assert.deepEqual(await B.parse(JSON.stringify(result)),result);
 assert.deepEqual(result.entries,records);assert.deepEqual(result.settings,config);
 assert(!JSON.stringify(result).includes('SECRET'));assert(!JSON.stringify(result).includes('deviceId'));
 assert.equal(result.checksum.algorithm,'SHA-256');
 const merged=B.merge(result,state());assert.deepEqual(merged.records,records);assert.deepEqual(merged.config,config);
});
test('invalid JSON, CSV, unknown versions, malformed data and changed checksums are rejected',async()=>{
 await assert.rejects(B.parse('broken'),/valid JSON/);await assert.rejects(B.parse('a,b\nc,d'),/JSON/);
 const b=await backup();b.entries['2026-10-18'].diary='changed';await assert.rejects(B.parse(JSON.stringify(b)),/verification failed/);
 b.version=2;await assert.rejects(B.parse(JSON.stringify(b)),/version/);
 await assert.rejects(B.create({account,config,records:{'2026-02-30':entry}}),/Invalid record/);
 await assert.rejects(B.create({account,config,records:{'2026-10-18':{...entry,helpedData:{Avery:'bad'}}}}),/Invalid details/);
 await assert.rejects(B.create({account,config:{...config,children:'bad'},records}),/children/);
 const dangerous=JSON.parse('{"__proto__":{"polluted":true}}');await assert.rejects(B.create({account,config,records:{'2026-10-18':{...entry,...dangerous}}}),/unsafe/);
 assert.equal({}.polluted,undefined);
});
test('screenshots must be embedded raster image data, never external URLs or executable attributes',async()=>{
 for(const dataUrl of ['https://example.com/tracker.png','data:text/html;base64,PGgxPmhlbGxvPC9oMT4=','data:image/png;base64,AAAA\" onerror=alert(1)','data:image/svg+xml;base64,AAAA'])await assert.rejects(B.create({account,config,records:{'2026-10-18':{...entry,attachment:{...entry.attachment,dataUrl}}}}),/screenshot/);
});
test('backup size limits reject oversized files before parsing',async()=>{
 await assert.rejects(B.parse(' '.repeat(B.MAX_BYTES+1)),/25 MB/);
});
test('account mismatch including a recreated account with the same email cannot import',async()=>{
 const b=await backup();assert.throws(()=>B.plan(b,state({account:{id:'other',email:account.email}})),/different account/);
 assert.throws(()=>B.plan(b,state({account:null})),/different account/);
});
test('preview classifies additions, duplicates and locked conflicts without mutating either copy',async()=>{
 const b=await backup(),local={'2026-10-18':{...entry,diary:'Keep current'},'2026-10-19':{week:'not-logged',intentional:true},'2026-10-17':{week:'other',diary:'unrelated'}};
 const before=JSON.stringify(local),file=JSON.stringify(b);const p=B.plan(b,state({records:local}));
 assert.deepEqual(p.same,['2026-10-19']);assert.equal(p.conflicts[0].locked,true);
 const keep=B.merge(b,state({records:local}));assert.deepEqual(keep.records,local);
 assert.throws(()=>B.merge(b,state({records:local}),{choices:{'2026-10-18':'backup'}}),/read-only/);
 assert.equal(JSON.stringify(local),before);assert.equal(JSON.stringify(b),file);
});
test('editable conflicts require a choice, unknown auto-markers can recover, deliberate skipped dates remain locked',async()=>{
 const b=await B.create({account,config,records:{'2026-10-19':entry,'2026-10-18':entry,'2026-10-17':entry}});
 const local={'2026-10-19':{week:'mom'},'2026-10-18':{week:'not-logged',missedAt:'2026-10-20T12:00:00Z'},'2026-10-17':{week:'not-logged',intentional:true}};
 const p=B.plan(b,state({records:local}));assert.deepEqual(p.conflicts.map(c=>[c.date,c.locked]),[['2026-10-17',true],['2026-10-18',false],['2026-10-19',false]]);
 const merged=B.merge(b,state({records:local}),{choices:{'2026-10-19':'backup','2026-10-18':'backup'}});
 assert.deepEqual(merged.changed,['2026-10-18','2026-10-19']);assert.deepEqual(merged.records['2026-10-17'],local['2026-10-17']);
});
test('profile restore is opt-in and never replaces current sign-in identity or policy acceptance',async()=>{
 const b=await backup(),current={...config,currentParentLabel:'Current',children:['Different'],childActivities:{Different:['Stale activity']},email:'new-address@example.com',termsVersion:'future',termsAcceptedAt:'2027-01-01T00:00:00Z',policyAcceptanceOwnerId:'current-owner'};
 assert.deepEqual(B.merge(b,state({config:current})).config,current);
 const result=B.merge(b,state({config:current}),{restoreProfile:true});
 assert.equal(result.config.currentParentLabel,config.currentParentLabel);assert.deepEqual(result.config.children,config.children);
 assert.equal(Object.hasOwn(result.config,'childActivities'),false,'A profile restore must not inherit legacy activities missing from the backup');
 for(const field of ['email','termsVersion','termsAcceptedAt','policyAcceptanceOwnerId'])assert.equal(result.config[field],current[field]);
});
test('storage commit clears changed-date sync baselines so differing cloud data is held for review; no sync/auth state is imported',async()=>{
 const storage=stored(),b=await backup(),result=B.merge(b,state({config:{...config,currentParentLabel:'Old'}}),{restoreProfile:true});
 B.commit(storage,result,account.id);assert.deepEqual(JSON.parse(storage.getItem('familylog_entries')),records);
 assert.deepEqual(JSON.parse(storage.getItem('whose_day_entry_sync_base:owner-a')),{'2026-10-17':{week:'dad'}});
 assert.equal(storage.getItem('sb-auth-token'),'keep-credential');assert.equal(storage.getItem(B.JOURNAL_KEY),null);
});
test('quota or storage failures roll back previous settings, entries and sync baselines',async()=>{
 for(const key of [B.JOURNAL_KEY,'familylog_entries','custody_tracker_config','whose_day_entry_sync_base:owner-a']){
  const storage=stored(),before=[...storage.data],b=await backup();storage.failKey=key;
  const result=B.merge(b,state({config:{...config,currentParentLabel:'Old'}}),{restoreProfile:true});
  assert.throws(()=>B.commit(storage,result,account.id),/previous records were kept/);assert.deepEqual([...storage.data],before);
 }
});
test('interrupted restores recover previous values on restart; failed rollback retains a recovery journal',async()=>{
 const storage=stored(),before={familylog_entries:storage.getItem('familylog_entries'),custody_tracker_config:storage.getItem('custody_tracker_config')};
 storage.setItem(B.JOURNAL_KEY,JSON.stringify({before}));storage.setItem('familylog_entries','{}');assert.equal(B.recover(storage),true);
 for(const [k,v] of Object.entries(before))assert.equal(storage.getItem(k),v);
 assert.equal(B.recover(storage),false);
 storage.failKey='familylog_entries';storage.always=true;
 const result=B.merge(await backup(),state());
 assert.throws(()=>B.commit(storage,result,account.id),error=>error.recoveryRequired===true);
 assert(storage.getItem(B.JOURNAL_KEY));storage.failKey=null;B.recover(storage);
 assert.equal(storage.getItem(B.JOURNAL_KEY),null);
});

test('project-qualified mobile backups round-trip and cannot cross into an unqualified website or another project',async()=>{
 const legacy=await backup(),mobile={...account,project:'mobile-test'},file=await B.create({account:mobile,config,records});assert.deepEqual((await B.parse(JSON.stringify(file))).account,mobile);
 assert.throws(()=>B.plan(file,state()),/different project/);assert.throws(()=>B.plan(file,state({account:{...mobile,project:'other'}})),/different project/);
 assert.throws(()=>B.plan(legacy,state({account:mobile})),/different project/);
});
