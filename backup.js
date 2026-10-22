/* Versioned, local-only backup format and storage recovery. No auth credentials. */
(function(root){
  'use strict';
  const FORMAT='whose-day-backup', VERSION=1, MAX_BYTES=25*1024*1024;
  const JOURNAL_KEY='whose_day_restore_journal_v1';
  const CONFIG_KEY='custody_tracker_config', ENTRIES_KEY='familylog_entries';
  const PROFILE_FIELDS=['currentParentLabel','coParentLabel','children','activityIds','childActivities','purpose','themeMode'];
  const SETTINGS_FIELDS=[...PROFILE_FIELDS,'email','termsAccepted','termsVersion','termsAcceptedAt','privacyVersion','privacyAcceptedAt','policyAcceptanceOwnerId','policyAcceptanceEmail'];
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function fail(message){throw new Error(message)}
  function string(value,label,max=1000000){if(typeof value!=='string'||value.length>max)fail('Invalid '+label+'.')}
  function strings(value,label){if(!Array.isArray(value)||value.length>1000)fail('Invalid '+label+'.');value.forEach(item=>string(item,label,10000))}
  function inspect(value,depth=0,budget={nodes:0}){
    if(++budget.nodes>300000||depth>15)fail('Backup contains too much nested data.');
    if(typeof value==='string'){string(value,'text',MAX_BYTES);return;}
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
    if(typeof value!=='object')fail('Backup contains unsupported data.');
    for(const [key,item] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(key))fail('Backup contains an unsafe field name.');
      inspect(item,depth+1,budget);
    }
  }
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  const equal=(a,b)=>canonical(a)===canonical(b);
  function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date}
  function settings(value){
    if(!object(value))fail('Backup settings are missing.');
    if(Object.keys(value).some(key=>!SETTINGS_FIELDS.includes(key)))fail('Backup contains unsupported settings.');
    for(const key of ['currentParentLabel','coParentLabel']){string(value[key],key,10000);if(!value[key].trim())fail('Backup is missing a parent label.')}
    strings(value.children,'children');if(!value.children.length||value.children.some(name=>!name.trim()))fail('Backup needs at least one named child.');
    if(value.activityIds!=null)strings(value.activityIds,'activities');
    if(value.childActivities!=null){if(!object(value.childActivities))fail('Invalid child activities.');Object.values(value.childActivities).forEach(v=>strings(v,'child activities'))}
    if(value.themeMode!==undefined&&!['system','light','dark'].includes(value.themeMode))fail('Invalid appearance preference.');
    for(const key of ['purpose','email','termsVersion','termsAcceptedAt','privacyVersion','privacyAcceptedAt','policyAcceptanceOwnerId','policyAcceptanceEmail'])if(value[key]!=null)string(value[key],key,10000);
    if(value.termsAccepted!==undefined&&typeof value.termsAccepted!=='boolean')fail('Invalid policy metadata.');
    return value;
  }
  function entries(value){
    if(!object(value)||Object.keys(value).length>20000)fail('Invalid backup records.');
    for(const [date,entry] of Object.entries(value)){
      if(!validDate(date)||!object(entry)||!['dad','mom','not-logged','other'].includes(entry.week))fail('Invalid record for '+date+'.');
      for(const key of ['diary','dadMode','momMode','loggedAt','missedAt','date'])if(entry[key]!=null)string(entry[key],date+' '+key);
      for(const key of ['kidsWithDad','momOpts','helpedKids','dadHadKids','momHadKidsOnDadWeek'])if(entry[key]!=null)strings(entry[key],date+' '+key);
      for(const key of ['changeAgreed','changePressured','intentional','missed'])if(entry[key]!=null&&typeof entry[key]!=='boolean')fail('Invalid '+date+' '+key+'.');
      for(const key of ['absentData','helpedData','momHelpedOnDadWeek'])if(entry[key]!=null){
        if(!object(entry[key]))fail('Invalid details for '+date+'.');
        for(const details of Object.values(entry[key])){
          if(!object(details))fail('Invalid details for '+date+'.');
          if(details.note!=null)string(details.note,date+' note');
          if(details.location!=null)string(details.location,date+' location',10000);
          if(details.acts!=null)strings(details.acts,date+' activities');
        }
      }
      if(entry.attachment!=null){
        const image=entry.attachment;if(!object(image))fail('Invalid screenshot for '+date+'.');
        string(image.name,date+' screenshot name',10000);string(image.type,date+' screenshot type',100);
        string(image.dataUrl,date+' screenshot',MAX_BYTES);
        if(!/^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp|heic|heif);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/i.test(image.dataUrl)||!image.dataUrl.split(',')[1])fail('Unsupported or damaged screenshot for '+date+'. Use a backup with embedded image files.');
      }
    }
    return value;
  }
  function validate(backup){
    inspect(backup);
    if(!object(backup)||backup.format!==FORMAT)fail('Choose a Whose Day JSON backup. CSV files cannot be restored.');
    if(backup.version!==VERSION)fail('This backup version is not supported. Update the app before restoring.');
    if(Object.keys(backup).some(key=>!['format','version','exportedAt','account','settings','entries','checksum'].includes(key)))fail('Backup contains unsupported fields.');
    if(typeof backup.exportedAt!=='string'||!Number.isFinite(Date.parse(backup.exportedAt)))fail('Backup date is invalid.');
    if(!object(backup.account)||Object.keys(backup.account).some(key=>!['id','email'].includes(key)))fail('Backup account is invalid.');
    string(backup.account.id,'backup account',200);if(!backup.account.id)fail('Backup account is missing.');
    string(backup.account.email,'backup email',10000);
    settings(backup.settings);entries(backup.entries);return backup;
  }
  async function digest(value){
    if(!root.crypto?.subtle)fail('Backup verification needs a secure app connection. Open the hosted app or localhost.');
    const bytes=new TextEncoder().encode(canonical(value));
    if(bytes.length>MAX_BYTES)fail('Backup exceeds the 25 MB file limit.');
    const result=await root.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('');
  }
  function payload(backup){const {checksum,...data}=backup;return data}
  async function create({account,config,records,exportedAt=new Date().toISOString()}){
    const data={format:FORMAT,version:VERSION,exportedAt,account:{id:account?.id,email:account?.email||''},settings:{},entries:clone(records)};
    for(const field of SETTINGS_FIELDS)if(config[field]!==undefined)data.settings[field]=clone(config[field]);
    validate(data);
    const backup={...data,checksum:{algorithm:'SHA-256',value:await digest(data)}};
    if(new TextEncoder().encode(JSON.stringify(backup)).length>MAX_BYTES)fail('Backup exceeds the 25 MB file limit.');
    return backup;
  }
  async function parse(text){
    if(typeof text!=='string'||text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)fail('Backup exceeds the 25 MB file limit.');
    let backup;try{backup=JSON.parse(text)}catch{fail('This file is not valid JSON. Choose a complete Whose Day backup.')}
    validate(backup);
    if(!object(backup.checksum)||backup.checksum.algorithm!=='SHA-256'||!/^[a-f0-9]{64}$/.test(backup.checksum.value||''))fail('Backup verification information is missing.');
    if(await digest(payload(backup))!==backup.checksum.value)fail('Backup verification failed. The file may have been changed or damaged.');
    return backup;
  }
  function profile(config){return Object.fromEntries(PROFILE_FIELDS.filter(key=>config[key]!==undefined).map(key=>[key,config[key]]))}
  function plan(backup,{account,config,records,yesterday}){
    validate(backup);
    if(!account?.id||account.id!==backup.account.id)fail('This backup belongs to a different account. Sign in to the account that created it.');
    const added=[],same=[],conflicts=[];
    for(const [date,incoming] of Object.entries(backup.entries).sort(([a],[b])=>a.localeCompare(b))){
      if(!Object.hasOwn(records,date)){added.push(date);continue;}
      if(equal(records[date],incoming)){same.push(date);continue;}
      const current=records[date];
      // Auto-generated unknown-day markers are replaceable during recovery.
      const placeholder=current.week==='not-logged'&&typeof current.missedAt==='string'&&!current.intentional&&!current.loggedAt&&!current.diary&&!current.attachment;
      conflicts.push({date,locked:date<yesterday&&!placeholder,current:clone(current),incoming:clone(incoming)});
    }
    return{added,same,conflicts,profileChanged:!equal(profile(config),profile(backup.settings)),screenshots:Object.values(backup.entries).filter(e=>e.attachment).length};
  }
  function merge(backup,state,{choices={},restoreProfile=false}={}){
    const review=plan(backup,state),records=clone(state.records),changed=[...review.added];
    for(const date of review.added)records[date]=clone(backup.entries[date]);
    for(const conflict of review.conflicts){
      if(choices[conflict.date]==='backup'){
        if(conflict.locked)fail('Existing read-only records cannot be replaced: '+conflict.date+'.');
        records[conflict.date]=clone(backup.entries[conflict.date]);changed.push(conflict.date);
      }
    }
    // Auth identity and current policy acceptance are never restored from a file.
    const config=clone(state.config);
    if(restoreProfile)for(const field of PROFILE_FIELDS){
      if(Object.hasOwn(backup.settings,field))config[field]=clone(backup.settings[field]);
      else delete config[field];
    }
    return{records,config,changed,profileChanged:!equal(config,state.config)};
  }
  function journal(storage){
    const raw=storage.getItem(JOURNAL_KEY);if(raw===null)return null;
    let data;try{data=JSON.parse(raw)}catch{fail('Restore recovery information is unreadable. Keep browser data and your backup file.')}
    if(!object(data)||!object(data.before)||Object.keys(data.before).length>3)fail('Restore recovery information is invalid.');
    for(const [key,value] of Object.entries(data.before))if(![CONFIG_KEY,ENTRIES_KEY].includes(key)&&!/^whose_day_entry_sync_base:[A-Za-z0-9_-]+$/.test(key)||value!==null&&typeof value!=='string')fail('Restore recovery information is invalid.');
    return data;
  }
  function recover(storage){
    const data=journal(storage);if(!data)return false;
    // Roll back the large entries value first to release space after quota errors.
    const keys=Object.keys(data.before).sort((a,b)=>a===ENTRIES_KEY?-1:b===ENTRIES_KEY?1:0);
    for(const key of keys){const old=data.before[key];if(old===null)storage.removeItem(key);else storage.setItem(key,old)}
    storage.removeItem(JOURNAL_KEY);return true;
  }
  function commit(storage,{config,records,changed,profileChanged},accountId){
    if(storage.getItem(JOURNAL_KEY)!==null)fail('Finish recovery from the previous restore before trying again.');
    const writes={[ENTRIES_KEY]:JSON.stringify(records)};
    if(profileChanged)writes[CONFIG_KEY]=JSON.stringify(config);
    const baseKey='whose_day_entry_sync_base:'+accountId;
    if(!/^[A-Za-z0-9_-]+$/.test(accountId))fail('Account identity is invalid.');
    if(changed.length){
      let base;try{base=JSON.parse(storage.getItem(baseKey)||'{}')}catch{fail('Sync history is unreadable. Restore was not applied.')}
      if(!object(base))fail('Sync history is unreadable. Restore was not applied.');
      for(const date of changed)delete base[date];
      writes[baseKey]=JSON.stringify(base);
    }
    const before=Object.fromEntries(Object.keys(writes).map(key=>[key,storage.getItem(key)]));
    let started=false;
    try{
      storage.setItem(JOURNAL_KEY,JSON.stringify({before}));started=true;
      for(const [key,value] of Object.entries(writes))storage.setItem(key,value);
      storage.removeItem(JOURNAL_KEY);
    }catch(error){
      if(started){try{recover(storage)}catch{const failed=new Error('Restore was interrupted. Reload to recover the previous records before making more changes. Keep your backup file.');failed.recoveryRequired=true;throw failed}}
      fail('Could not save the restore. Your previous records were kept. Browser storage may be full or unavailable.');
    }
  }
  root.WhoseDayBackup={FORMAT,VERSION,MAX_BYTES,JOURNAL_KEY,create,parse,validate,plan,merge,commit,recover,equal,profile};
})(globalThis);
