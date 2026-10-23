import {createRecordStore} from './record-store.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function accountScope(project,userId){
  if(!/^[a-z0-9-]{1,30}$/.test(project)||!uuid.test(userId))throw new Error('Invalid account identity.');
  return 'account-v1-'+project+'-'+userId.toLowerCase();
}
export {validateProfile} from './profile-store.js';
import {validateProfile,createProfileStore} from './profile-store.js';
import {createSync} from './sync.js';

// Auth supplies identity; stored profile rows cannot select an account. Every
// switch closes the previous store immediately, including snapshots held by UI.
export function createAccountStore(vault,{project,onState=()=>{},backend=null,onSync=()=>{},canDownload=()=>true,online=()=>globalThis.navigator?.onLine!==false}){
  let epoch=0,state={status:'signed-out'},records=null,profileBusy=false,profile=null,syncs=[];
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
    async sync(){await Promise.all(syncs.map(sync=>sync.run()));},
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
        const nextProfile=createProfileStore(vault,owner);await nextProfile.open();
        if(version!==epoch){nextProfile.close();return null;}profile=nextProfile;
        if(backend){
          const sync=createSync({store:profile,transport:backend(owner).profile,canDownload,online,onState:s=>onSync('profile',s)});syncs.push(sync);
          await sync.run();if(version!==epoch)return null;
          if(!profile.config()&&['error','offline'].includes(sync.state.status))return publish({status:'restore-unavailable',account:owner});
        }
        const config=profile.config();
        if(!config)return publish({status:'needs-profile',account:owner});
        return await openRecords(owner,config,version);
      }catch(error){if(version!==epoch)return null;publish({status:'error',account:owner});throw error;}
    },
    async saveProfile(input){
      if(state.status!=='needs-profile'||profileBusy)throw new Error('Reopen the account before saving its profile.');
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
