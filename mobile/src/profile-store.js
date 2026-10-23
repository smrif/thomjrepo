import {createSyncStore} from './sync-store.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const defaults={activityIds:['school','afterschool','medical','practice','birthday','camp','therapy','religious'],themeMode:'system',purpose:'Mobile test',termsAccepted:false};
const name=value=>typeof value==='string'&&value.trim().length>0&&value.length<=100;

export function validateProfile(config,email){
  if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).some(k=>!['currentParentLabel','coParentLabel','children','activityIds','themeMode','purpose','termsAccepted','email'].includes(k))||!name(config.currentParentLabel)||!name(config.coParentLabel)||!Array.isArray(config.children)||config.children.length<1||config.children.length>20||!config.children.every(name)||new Set(config.children.map(v=>v.trim())).size!==config.children.length)throw new Error('Enter both parent names and one to twenty different child names.');
  if(config.activityIds!==undefined&&(!Array.isArray(config.activityIds)||config.activityIds.length>30||!config.activityIds.every(name))||config.themeMode!==undefined&&!['light','dark','system'].includes(config.themeMode)||config.purpose!==undefined&&(typeof config.purpose!=='string'||config.purpose.length>200)||config.termsAccepted!==undefined&&config.termsAccepted!==false)throw new Error('Invalid test profile.');
  return {...clone(defaults),...clone(config),currentParentLabel:config.currentParentLabel.trim(),coParentLabel:config.coParentLabel.trim(),children:config.children.map(v=>v.trim()),email,termsAccepted:false};
}


export function createProfileStore(vault,owner){
  const key='profile:v1:'+owner.scope;
  const validate=(id,value)=>{if(id!=='profile')throw new Error('Invalid profile key.');return validateProfile(value,owner.email)};
  const store=createSyncStore({validate,
    async load(){
      const {value}=await vault.read({key});if(value===null)return {};
      const row=JSON.parse(value);
      if(!row||![1,2].includes(row.schema)||Object.keys(row).sort().join(',')!==(row.schema===1?'config,schema,scope,userId':'config,schema,scope,sync,userId')||row.scope!==owner.scope||row.userId!==owner.id)throw new Error('Profile ownership could not be verified.');
      return {profile:{value:validateProfile(row.config,owner.email),sync:row.schema===1?{baseHash:null,version:null}:row.sync}};
    },
    async persist(id,item){
      validate(id,item.value);
      const value=JSON.stringify({schema:2,scope:owner.scope,userId:owner.id,config:item.value,sync:item.sync});
      await vault.write({key,value});if((await vault.read({key})).value!==value)throw new Error('The saved profile could not be verified.');
    }
  });
  return {...store,config:()=>store.values().profile,save:(input,expected=store.values().profile)=>store.local('profile',validateProfile(input,owner.email),expected)};
}
