import {localDay} from './domain.js';
import {createSyncStore,equal} from './sync-store.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const text=(value,max=4000)=>typeof value==='string'&&value.length<=max;
const names=value=>Array.isArray(value)&&value.length<=20&&value.every(v=>text(v,100));
const entryFields=new Set(['week','dadMode','momMode','kidsWithDad','absentData','momOpts','helpedKids','helpedData','dadHadKids','momHadKidsOnDadWeek','momHelpedOnDadWeek','diary','attachment','changeAgreed','changePressured','loggedAt','intentional','missedAt']);
export function validateEntry(day,entry){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||localDay(new Date(day+'T12:00:00'))!==day)throw new Error('Invalid entry date.');
  if(!plain(entry)||Object.keys(entry).some(key=>!entryFields.has(key)))throw new Error('Unrecognized check-in data.');
  if(entry.week==='not-logged'){
    if(!Number.isFinite(Date.parse(entry.missedAt||entry.loggedAt))||entry.intentional!==undefined&&typeof entry.intentional!=='boolean'||Object.keys(entry).some(k=>!['week','intentional','missedAt','loggedAt'].includes(k)))throw new Error('Invalid skipped check-in.');
    return entry;
  }
  if(!['dad','mom'].includes(entry.week)||![null,'normal','mom-had','dad-helped-mom'].includes(entry.dadMode)||![null,'easy','helped','dad-had'].includes(entry.momMode)||!text(entry.diary)||!text(entry.loggedAt,40)||!Number.isFinite(Date.parse(entry.loggedAt)))throw new Error('Invalid check-in.');
  for(const key of ['kidsWithDad','momOpts','helpedKids','dadHadKids','momHadKidsOnDadWeek'])if(!names(entry[key]))throw new Error('Invalid check-in choices.');
  for(const key of ['changeAgreed','changePressured'])if(entry[key]!==null&&typeof entry[key]!=='boolean')throw new Error('Invalid schedule context.');
  for(const key of ['absentData','helpedData','momHelpedOnDadWeek']){
    if(!plain(entry[key])||Object.keys(entry[key]).length>20)throw new Error('Invalid child details.');
    for(const [name,detail] of Object.entries(entry[key])){
      if(!text(name,100)||!plain(detail)||Object.keys(detail).some(k=>!['location','note','acts'].includes(k))||detail.note!==undefined&&!text(detail.note)||detail.location!==undefined&&!text(detail.location,100)||detail.acts!==undefined&&!names(detail.acts))throw new Error('Invalid child details.');
    }
  }
  if(entry.attachment!==null){
    const a=entry.attachment;
    if(!plain(a)||Object.keys(a).some(k=>!['name','type','dataUrl'].includes(k))||!text(a.name,200)||!['image/png','image/jpeg','image/webp'].includes(a.type)||!text(a.dataUrl,4*1024*1024)||!a.dataUrl.startsWith('data:'+a.type+';base64,')||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(a.dataUrl))throw new Error('Use a JPEG, PNG or WebP image under 3 MB.');
  }
  return entry;
}

// Each date, attachment and cloud checkpoint commit in one verified SQLite row.
export function createRecordStore(vault,{scope}){
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(scope))throw new Error('Invalid record scope.');
  const prefix='checkin:v1:'+scope+':',snapshots=new WeakMap();let busy=false,edit=null;
  const store=createSyncStore({validate:validateEntry,
    async load(){
      const loaded={}, {keys}=await vault.keys({prefix});
      if(!Array.isArray(keys)||keys.length>20000||new Set(keys).size!==keys.length)throw new Error('Invalid record listing.');
      for(const key of keys){
        if(typeof key!=='string'||!key.startsWith(prefix))throw new Error('Record scope mismatch.');
        const {value}=await vault.read({key}),row=JSON.parse(value);
        if(!plain(row)||![1,2].includes(row.schema)||Object.keys(row).sort().join(',')!==(row.schema===1?'day,entry,schema,scope':'day,entry,schema,scope,sync')||row.scope!==scope||key!==prefix+row.day)throw new Error('Unrecognized stored record.');
        loaded[row.day]={value:row.entry,sync:row.schema===1?{baseHash:null,version:null}:row.sync};
      }
      return loaded;
    },
    async persist(day,item){
      const key=prefix+day,value=JSON.stringify({schema:2,scope,day,entry:item.value,sync:item.sync});
      await vault.write({key,value});if((await vault.read({key})).value!==value)throw new Error('Saved record could not be verified.');
    }
  });
  return {
    open:store.open,close:store.close,syncItems:store.syncItems,accept:store.accept,acknowledge:store.acknowledge,subscribe:store.subscribe,
    beginEdit(day){edit={day,value:store.values()[day]};},
    snapshot(){const snapshot=store.values();snapshots.set(snapshot,clone(snapshot));return snapshot;},
    async commit(next){
      if(busy)throw new Error('Records are not ready for another save.');
      const records=store.values(),base=snapshots.get(next);
      if(!base||!plain(next))throw new Error('Save requires a current record snapshot.');
      if(Object.keys(base).some(day=>!(day in next)))throw new Error('Bulk removal is not enabled in this test build.');
      const changed=Object.keys(next).filter(day=>!equal(next[day],base[day]));
      if(!changed.length)return;
      if(changed.length!==1)throw new Error('Bulk writes are not enabled in this test build.');
      const day=changed[0],entry=clone(validateEntry(day,next[day]));
      if(edit?.day===day&&!equal(records[day],edit.value))throw new Error('This date changed in the cloud. Return to Today and reopen it before saving again.');
      if(!equal(records[day],base[day]))throw new Error('This date changed. Reopen it before saving again.');
      busy=true;try{await store.local(day,entry,base[day]);edit=null;}finally{busy=false;}
    }
  };
}
