import {testProject} from './auth.js';
import {validateEntry} from './record-store.js';
import {validateProfile} from './profile-store.js';
const profileFields='user_id,current_parent_label,co_parent_label,children,activities,theme_mode,updated_at';
const entryFields='user_id,entry_date,entry_json,entry_version,deleted_at,updated_at';
// Uses the auth client's protected session. No second token store, service key,
// production origin, upsert, or unqualified update is allowed in this adapter.
export function testBackend(auth,config,owner){
  if(!auth||!config?.enabled)throw new Error('Test sync needs test authentication.');testProject(config);
  function decode(row,profile=false){
    if(!row||row.user_id!==owner.id||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw new Error('Invalid cloud ownership or version.');
    if(profile)return {value:validateProfile({currentParentLabel:row.current_parent_label,coParentLabel:row.co_parent_label,children:row.children,activityIds:row.activities,themeMode:row.theme_mode},owner.email),version:row.updated_at};
    if(row.entry_version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date))throw new Error('Unsupported cloud record.');
    if(row.deleted_at!==null){if(!Number.isFinite(Date.parse(row.deleted_at)))throw new Error('Invalid cloud removal.');return {deleted:true,version:row.updated_at};}
    return {value:validateEntry(row.entry_date,row.entry_json),version:row.updated_at};
  }
  function transport(profile){
    const table=profile?'profiles':'custody_entries',fields=profile?profileFields:entryFields,key=profile?'user_id':'entry_date';
    const request=operation=>auth.withSession(owner.id,async(client,check)=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{const result=await operation(client,check,controller.signal);check();return result;}finally{clearTimeout(timer)}
    });
    return {
      async list(){return request(async(client,check,signal)=>{
        const rows={};let after=null;
        do{
          let query=client.from(table).select(fields).eq('user_id',owner.id).order(key).limit(250);
          if(after!==null)query=query.gt(key,after);
          const {data,error}=await query.abortSignal(signal);check();if(error)throw error;
          if(!Array.isArray(data))throw new Error('Invalid cloud listing.');
          for(const row of data){const id=profile?'profile':row.entry_date;if(id in rows)throw new Error('Duplicate cloud record.');rows[id]=decode(row,profile);}
          if(Object.keys(rows).length>20000)throw new Error('Cloud history is too large for this test build.');
          after=data.length===250?data.at(-1)[key]:null;
        }while(after!==null);
        return rows;
      });},
      async get(id){return request(async(client,check,signal)=>{
        if(profile&&id!=='profile')throw new Error('Invalid profile key.');
        const {data,error}=await client.from(table).select(fields).eq('user_id',owner.id).eq(key,profile?owner.id:id).maybeSingle().abortSignal(signal);check();if(error)throw error;return data?decode(data,profile):null;
      });},
      async compareAndSet(id,value,version){
        if(profile){if(id!=='profile')throw new Error('Invalid profile key.');value=validateProfile(value,owner.email);}else validateEntry(id,value);
        const row=profile?{user_id:owner.id,current_parent_label:value.currentParentLabel,co_parent_label:value.coParentLabel,children:value.children,activities:value.activityIds,theme_mode:value.themeMode}:{user_id:owner.id,entry_date:id,entry_json:value,entry_version:1,deleted_at:null};
        return request(async(client,check,signal)=>{
          const query=version===null?client.from(table).insert(row):client.from(table).update(row).eq('user_id',owner.id).eq(key,profile?owner.id:id).eq('updated_at',version);
          const {data,error}=await query.select(fields).maybeSingle().abortSignal(signal);check();
          if(error){if(error.code==='23505')return null;throw error;}
          return data?decode(data,profile):null;
        });
      }
    };
  }
  return {profile:transport(true),entries:transport(false)};
}
