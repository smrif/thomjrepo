import {createRecordStore} from './record-store.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const defaults={activityIds:['school','afterschool','medical','practice','birthday','camp','therapy','religious'],themeMode:'system',purpose:'Mobile test',termsAccepted:false};
const name=value=>typeof value==='string'&&value.trim().length>0&&value.length<=100;

export function accountScope(project,userId){
  if(!/^[a-z0-9-]{1,30}$/.test(project)||!uuid.test(userId))throw new Error('Invalid account identity.');
  return 'account-v1-'+project+'-'+userId.toLowerCase();
}
export function validateProfile(config,email){
  if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).some(k=>!['currentParentLabel','coParentLabel','children','activityIds','themeMode','purpose','termsAccepted','email'].includes(k))||!name(config.currentParentLabel)||!name(config.coParentLabel)||!Array.isArray(config.children)||config.children.length<1||config.children.length>20||!config.children.every(name)||new Set(config.children.map(v=>v.trim())).size!==config.children.length)throw new Error('Enter both parent names and one to twenty different child names.');
  if(config.activityIds!==undefined&&(!Array.isArray(config.activityIds)||config.activityIds.length>30||!config.activityIds.every(name))||config.themeMode!==undefined&&!['light','dark','system'].includes(config.themeMode)||config.purpose!==undefined&&(typeof config.purpose!=='string'||config.purpose.length>200)||config.termsAccepted!==undefined&&config.termsAccepted!==false)throw new Error('Invalid test profile.');
  return {...clone(defaults),...clone(config),currentParentLabel:config.currentParentLabel.trim(),coParentLabel:config.coParentLabel.trim(),children:config.children.map(v=>v.trim()),email,termsAccepted:false};
}

// Auth supplies identity; stored profile rows cannot select an account. Every
// switch closes the previous store immediately, including snapshots held by UI.
export function createAccountStore(vault,{project,onState=()=>{}}){
  let epoch=0,state={status:'signed-out'},records=null,profileBusy=false;
  const publish=next=>{state=next;onState(next);return next};
  function lock(){epoch++;records?.close();records=null;publish({status:'signed-out'});}
  async function openRecords(owner,config,version){
    const next=createRecordStore(vault,{scope:owner.scope});
    await next.open();
    if(version!==epoch){next.close();return null;}
    records=next;return publish({status:'ready',account:owner,config,records});
  }
  return {
    lock,
    get state(){return state},
    async activate(session){
      if(!session){lock();return state;}
      const id=session.user?.id,email=session.user?.email;
      let scope;
      try{
        if(typeof email!=='string'||email.length>254)throw new Error('Invalid account identity.');
        scope=accountScope(project,id);
      }catch(error){lock();throw error;}
      if(['ready','needs-profile'].includes(state.status)&&state.account.scope===scope&&state.account.email===email)return state;
      lock();const version=epoch,owner={id,email,scope};publish({status:'loading',account:owner});
      try{
        const {value}=await vault.read({key:'profile:v1:'+scope});
        if(version!==epoch)return null;
        if(value===null)return publish({status:'needs-profile',account:owner});
        const row=JSON.parse(value);
        if(!row||Object.keys(row).sort().join(',')!=='config,schema,scope,userId'||row.schema!==1||row.scope!==scope||row.userId!==id)throw new Error('Profile ownership could not be verified.');
        return await openRecords(owner,validateProfile(row.config,email),version);
      }catch(error){if(version!==epoch)return null;publish({status:'error',account:owner});throw error;}
    },
    async saveProfile(input){
      if(state.status!=='needs-profile'||profileBusy)throw new Error('Reopen the account before saving its profile.');
      const owner=state.account,version=epoch,config=validateProfile(input,owner.email);
      const key='profile:v1:'+owner.scope,value=JSON.stringify({schema:1,scope:owner.scope,userId:owner.id,config});
      profileBusy=true;
      try{
        await vault.write({key,value});
        if((await vault.read({key})).value!==value)throw new Error('The saved profile could not be verified.');
        if(version!==epoch)throw new Error('The account changed during saving.');
        return await openRecords(owner,config,version);
      }finally{profileBusy=false;}
    }
  };
}
