import {createRecordStore} from './record-store.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function accountScope(project,userId){
  if(!/^[a-z0-9-]{1,30}$/.test(project)||!uuid.test(userId))throw new Error('Invalid account identity.');
  return 'account-v1-'+project+'-'+userId.toLowerCase();
}
export {validateProfile} from './profile-store.js';
import {validateProfile,createProfileStore} from './profile-store.js';
import {createSync} from './sync.js';
import {equal,canonical} from './sync-store.js';
import {localDay} from './domain.js';
import {mergeBackup} from './backup-domain.js';

// Auth supplies identity; stored profile rows cannot select an account. Every
// switch closes the previous store immediately, including snapshots held by UI.
export function createAccountStore(vault,{project,onState=()=>{},backend=null,onSync=()=>{},canDownload=()=>true,online=()=>globalThis.navigator?.onLine!==false}){
  const deletionKey=owner=>'deletion:v1:'+owner.scope;
  async function journal(owner,status){const key=deletionKey(owner),value=status===null?'null':JSON.stringify({schema:1,scope:owner.scope,userId:owner.id,status});await vault.write({key,value});if((await vault.read({key})).value!==value)throw new Error('Could not verify the account deletion checkpoint.');}
  let epoch=0,state={status:'signed-out'},records=null,profileBusy=false,deletionBusy=false,restoring=false,profile=null,syncs=[];
  const publish=next=>{state=next;onState(next);return next};
  function lock(){epoch++;const pending=syncs.map(sync=>sync.close());syncs=[];pending.push(profile?.close(),records?.close());profile=null;records=null;publish({status:'signed-out'});return Promise.all(pending);}
  function backupSnapshot(){
    if(state.status!=='ready'||profileBusy||deletionBusy||restoring)throw Error('Wait for the current save to finish, then reopen backup.');
    profile.syncItems();records.syncItems();
    const account={id:state.account.id,email:state.account.email,project},config=profile.config(),saved=records.snapshot(),yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
    return {account,config,records:saved,yesterday:localDay(yesterday),snapshot:canonical([epoch,state.account.scope,config,saved])};
  }
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
    backupSnapshot,
    async restoreBackup(backup,snapshot,selection){
      const current=backupSnapshot();if(current.snapshot!==snapshot)throw Error('Your saved data changed. Choose the backup again and review the current copies.');
      const result=mergeBackup(backup,current,selection);
      if(!result.changed.length&&!result.profileChanged)throw Error('Select records or profile settings to restore.');
      const owner=state.account,entryItems=records.syncItems(),profileItem=profile.syncItems().profile;
      restoring=true;const drained=lock(),version=epoch;publish({status:'restoring',account:owner});
      try{
        await drained;if(version!==epoch)return null;
        const rows=[],checkpoint={baseHash:null,version:null};
        async function row(key,item,value,kind){
          const raw=(await vault.read({key})).value;if(version!==epoch)throw Error('The account changed during restore.');
          const old=raw===null?null:JSON.parse(raw),stored=old?.[kind];
          if(old&&(Object.keys(old).sort().join(',')!==(kind==='entry'?(old.schema===1?'day,entry,schema,scope':'day,entry,schema,scope,sync'):(old.schema===1?'config,schema,scope,userId':'config,schema,scope,sync,userId'))||kind==='entry'&&key!=='checkin:v1:'+owner.scope+':'+old.day||kind==='config'&&old.userId!==owner.id))throw Error('Stored record ownership could not be verified.');
          if(!equal(stored,item?.value)||old&&(old.scope!==owner.scope||![1,2].includes(old.schema)||!equal(old.schema===1?checkpoint:old.sync,item.sync)))throw Error('Saved data changed while preparing restore. Reopen and review the backup again.');
          rows.push({key,expected:raw,...(value===undefined?{}:{value:JSON.stringify(value)})});
        }
        for(const day of result.changed)await row('checkin:v1:'+owner.scope+':'+day,entryItems[day],{schema:2,scope:owner.scope,day,entry:result.records[day],sync:checkpoint},'entry');
        await row('profile:v1:'+owner.scope,profileItem,result.profileChanged?{schema:2,scope:owner.scope,userId:owner.id,config:result.config,sync:checkpoint}:undefined,'config');
        const deletion=(await vault.read({key:deletionKey(owner)})).value;
        if(deletion!==null&&deletion!=='null')throw Error('This account is locked for deletion.');
        rows.push({key:deletionKey(owner),expected:deletion});
        if(version!==epoch)return null;
        if((await vault.compareBatch({rows})).matched!==true)throw Error('Saved data changed before restore committed.');
        for(const row of rows)if(row.value!==undefined&&((await vault.read({key:row.key})).value!==row.value))throw Error('Restore readback could not be verified.');
        if(version!==epoch)return null;
        publish({status:'restore-complete',account:owner,count:result.changed.length,profileChanged:result.profileChanged});return result;
      }catch(error){if(version===epoch)publish({status:'restore-check',account:owner});throw error;}
      finally{restoring=false;}
    },
    async sync(){
      if(restoring)return;
      if(state.status==='ready'&&online()&&backend?.(state.account).isDeleted){
        const owner=state.account,version=epoch,deleted=await backend(owner).isDeleted();if(version!==epoch)return;
        if(deleted){await journal(owner,'deleted');if(version!==epoch)return;lock();publish({status:'deleted',account:owner});return;}
      }
      await Promise.all(syncs.map(sync=>sync.run()));
    },
    async deleteAccount(confirmation,remove){
      if(!['ready','deletion-pending'].includes(state.status)||profileBusy||deletionBusy||restoring||confirmation!=='DELETE'||typeof remove!=='function'||!online())throw new Error('Connect and type DELETE before deleting this account.');
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
      if(['restoring','restore-complete','restore-check'].includes(state.status)&&state.account.scope===scope&&state.account.email===email)return state;
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
