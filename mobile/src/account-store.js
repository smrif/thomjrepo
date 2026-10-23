import {createRecordStore} from './record-store.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function accountScope(project,userId){
  if(!/^[a-z0-9-]{1,30}$/.test(project)||!uuid.test(userId))throw new Error('Invalid account identity.');
  return 'account-v1-'+project+'-'+userId.toLowerCase();
}
export {validateProfile} from './profile-store.js';
import {validateProfile,createProfileStore} from './profile-store.js';
import {createSync} from './sync.js';
import {equal} from './sync-store.js';

// Auth supplies identity; stored profile rows cannot select an account. Every
// switch closes the previous store immediately, including snapshots held by UI.
export function createAccountStore(vault,{project,onState=()=>{},backend=null,onSync=()=>{},canDownload=()=>true,online=()=>globalThis.navigator?.onLine!==false}){
  const deletionKey=owner=>'deletion:v1:'+owner.scope;
  async function journal(owner,status){const key=deletionKey(owner),value=status===null?'null':JSON.stringify({schema:1,scope:owner.scope,userId:owner.id,status});await vault.write({key,value});if((await vault.read({key})).value!==value)throw new Error('Could not verify the account deletion checkpoint.');}
  let epoch=0,state={status:'signed-out'},records=null,profileBusy=false,deletionBusy=false,profile=null,syncs=[];
  const publish=next=>{state=next;onState(next);return next};
  function lock(){epoch++;for(const sync of syncs)sync.close();syncs=[];profile?.close();profile=null;records?.close();records=null;publish({status:'signed-out'});}
  async function openRecords(owner,config,version){
    const next=createRecordStore(vault,{scope:owner.scope});
    await next.open();
    if(version!==epoch){next.close();return null;}
    records=next;
    if(backend){
      const sync=createSync({store:records,transport:backend(owner).entries,canDownload,online,onState:s=>onSync('entries',s)});syncs.push(sync);
      records.subscribe(kind=>{if(kind==='local')queueMicrotask(()=>sync.run())});
    }
    return publish({status:'ready',account:owner,config,records,profile});
  }
  return {
    lock,
    async sync(){
      if(state.status==='ready'&&online()&&backend?.(state.account).isDeleted){
        const owner=state.account,version=epoch,deleted=await backend(owner).isDeleted();if(version!==epoch)return;
        if(deleted){await journal(owner,'deleted');if(version!==epoch)return;lock();publish({status:'deleted',account:owner});return;}
      }
      await Promise.all(syncs.map(sync=>sync.run()));
    },
    async deleteAccount(confirmation,remove){
      if(!['ready','deletion-pending'].includes(state.status)||profileBusy||deletionBusy||confirmation!=='DELETE'||typeof remove!=='function'||!online())throw new Error('Connect and type DELETE before deleting this account.');
      deletionBusy=true;try{
      const owner=state.account,oldVersion=epoch;
      await journal(owner,'pending');if(epoch!==oldVersion)throw new Error('The account changed during deletion.');
      const draining=syncs.map(sync=>sync.close());lock();const version=epoch;publish({status:'deletion-pending',account:owner});
      try{
        await Promise.all(draining);if(epoch!==version)throw new Error('The account changed during deletion.');
        const result=await remove(owner);if(epoch!==version)return null;
        if(result?.deleted!==true)throw new Error('Deletion could not be confirmed.');
        await journal(owner,'deleted');if(epoch!==version)return null;
        return publish({status:'deleted',account:owner});
      }catch(error){
        if(epoch!==version)return null;
        if(error.definite===true){
          try{await journal(owner,null);if(epoch===version)publish({status:'deletion-failed',account:owner});}catch{/* The durable pending checkpoint keeps the account closed. */}
        }
        throw error;
      }
      }finally{deletionBusy=false;}
    },
    get syncs(){return syncs;},
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
        const {value:deletion}=await vault.read({key:deletionKey(owner)});if(version!==epoch)return null;
        if(deletion&&deletion!=='null'){
          const row=JSON.parse(deletion);if(!row||Object.keys(row).sort().join(',')!=='schema,scope,status,userId'||row.schema!==1||row.scope!==scope||row.userId!==id||!['pending','deleted'].includes(row.status))throw new Error('Invalid deletion checkpoint.');
          return publish({status:row.status==='deleted'?'deleted':'deletion-pending',account:owner});
        }
        if(backend&&online()&&backend(owner).isDeleted&&await backend(owner).isDeleted()){
          if(version!==epoch)return null;await journal(owner,'deleted');if(version!==epoch)return null;return publish({status:'deleted',account:owner});
        }
        const nextProfile=createProfileStore(vault,owner);await nextProfile.open();
        if(version!==epoch){nextProfile.close();return null;}profile=nextProfile;
        if(backend){
          const sync=createSync({store:profile,transport:backend(owner).profile,canDownload,online,onState:s=>onSync('profile',s)});syncs.push(sync);
          profile.subscribe(kind=>{if(kind==='local')queueMicrotask(()=>sync.run())});
          await sync.run();if(version!==epoch)return null;
          if(!profile.config()&&['error','offline'].includes(sync.state.status))return publish({status:'restore-unavailable',account:owner});
        }
        const config=profile.config();
        if(!config)return publish({status:'needs-profile',account:owner});
        return await openRecords(owner,config,version);
      }catch(error){if(version!==epoch)return null;publish({status:'error',account:owner});throw error;}
    },
    applyProfile(){
      if(state.status!=='ready'||profileBusy||deletionBusy)throw new Error('Reopen Settings before applying a profile.');
      const config=profile.config();publish({...state,config});return config;
    },
    async updateProfile(patch,expected){
      if(state.status!=='ready'||profileBusy||deletionBusy)throw new Error('Wait for the current profile save to finish.');
      if(!patch||Object.getPrototypeOf(patch)!==Object.prototype||Object.keys(patch).some(key=>!['currentParentLabel','coParentLabel','children','activityIds','themeMode'].includes(key)))throw new Error('That profile setting cannot be changed here.');
      if(patch.activityIds!==undefined&&(!Array.isArray(patch.activityIds)||patch.activityIds.length<1||patch.activityIds.length>30||new Set(patch.activityIds).size!==patch.activityIds.length))throw new Error('Choose between one and thirty different activities.');
      const version=epoch,current=profile.config(),target=profile;
      if(!expected||!equal(current,expected))throw new Error('Your profile changed. Reopen Settings to review the current copy before saving.');
      const config=validateProfile({...current,...patch},state.account.email);
      profileBusy=true;
      try{
        await target.save(config,expected);
        if(version!==epoch)throw new Error('The account changed during saving.');
        publish({...state,config});return config;
      }finally{profileBusy=false;}
    },
    async saveProfile(input){
      if(state.status!=='needs-profile'||profileBusy||deletionBusy)throw new Error('Reopen the account before saving its profile.');
      const owner=state.account,version=epoch,config=validateProfile(input,owner.email);
      profileBusy=true;
      try{
        await profile.save(config);
        if(version!==epoch)throw new Error('The account changed during saving.');
        const ready=await openRecords(owner,config,version);queueMicrotask(()=>this.sync());return ready;
      }finally{profileBusy=false;}
    }
  };
}
