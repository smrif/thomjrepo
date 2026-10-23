import {fingerprint} from './sync-store.js';
import {createSync} from './sync.js';
import {createAccountStore} from './account-store.js';
import {createAuth,AUTH_STORAGE_KEY} from './auth.js';
import {previewAccounts} from './account-preview.js';
export const PROBE_PROJECT='sim-account-probe';
export const probeProfile={currentParentLabel:'Probe Parent A',coParentLabel:'Probe Parent B',children:['Alex','Sam']};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const baseNote='Synthetic account-specific check-in.',note=baseNote+' Offline edit waiting to sync.';
const session={...previewAccounts[0],access_token:'synthetic-probe-token',refresh_token:'synthetic-probe-refresh'};
function probeVault(vault){
  return Object.fromEntries(['readSecret','writeSecret','removeSecret'].map(method=>[method,({key,...rest})=>vault[method]({key:'probe-account:'+key,...rest})]));
}
function authFor(vault,onSession){
  return createAuth({config:{enabled:true,url:'https://test-project.supabase.co',publishableKey:'sb_publishable_PROBE'},vault:probeVault(vault),online:()=>false,
    createClient:()=>({auth:{onAuthStateChange(){},async signOut(){return{}},stopAutoRefresh(){}}}),onSession,onError:()=>{throw new Error('Probe auth failed.')}});
}
// Only native DEBUG simulator launch modes can call this path. Probe credentials
// use their own Keychain namespace and never replace the real test sign-in.
export async function createProbeAuth(vault,mode,onSession){
  if(mode==='account-write'){
    const scoped=probeVault(vault);await scoped.removeSecret({key:AUTH_STORAGE_KEY+'-signed-out'});
    await scoped.writeSecret({key:AUTH_STORAGE_KEY,value:JSON.stringify(session)});
  }
  return authFor(vault,onSession);
}
function probeCloud(vault,prefix){
  // One simulator process owns this synthetic transport. Actual server CAS is
  // independently tested against PostgreSQL; this probe exercises SQLite rows.
  return {
    async list(){const rows={};for(const key of (await vault.keys({prefix})).keys)rows[key.slice(prefix.length)]=JSON.parse((await vault.read({key})).value);return rows;},
    async get(id){const {value}=await vault.read({key:prefix+id});return value?JSON.parse(value):null;},
    async compareAndSet(id,value,version){
      const current=await this.get(id);if((current?.version??null)!==version)return null;
      const next={value,version:crypto.randomUUID()},raw=JSON.stringify(next);await vault.write({key:prefix+id,value:raw});
      if((await vault.read({key:prefix+id})).value!==raw)throw new Error('Probe cloud fixture write failed.');return next;
    }
  };
}
export async function runAccountProductProbe({vault,accounts,mode}){
  if(accounts.state.account.id!==session.user.id||APP_CONFIG.currentParentLabel!==probeProfile.currentParentLabel)throw new Error('Account/profile mismatch.');
  if(mode==='account-write'){
    startCheckin();S={...blankCheckinState(),week:'dad',dadMode:'normal',kidsWithDad:['Alex','Sam'],diary:baseNote,attachment:{name:'synthetic.png',type:'image/png',dataUrl:image}};
    goToDiary('s-dad-help-choice','Anything else to note?','Synthetic account test.',3,4);document.getElementById('diary-input').value=baseNote;
    await saveEntry();if(document.body.dataset.activeScreen!=='s-saved')throw new Error('Product save did not finish.');
    const prefix='probe-sync:'+crypto.randomUUID()+':';await vault.write({key:'probe:account-sync-fixture',value:prefix});
    const sync=createSync({store:accounts.state.records,transport:probeCloud(vault,prefix)});await sync.run();
    if(sync.state.status!=='synced'||sync.state.pending)throw new Error('Probe baseline did not sync.');sync.close();
    // A second actual product save remains pending across process termination.
    startTodayEdit();prepareEditTarget('s-diary');document.getElementById('diary-input').value=note;
    await saveEntry();if(document.body.dataset.activeScreen!=='s-saved')throw new Error('Offline edit did not finish.');
  }else{
    if(document.body.dataset.activeScreen!=='s-home'||!document.getElementById('home-checkin-card').classList.contains('logged'))throw new Error('Today did not recover.');
    startTodayEdit();prepareEditTarget('s-diary');
    if(document.getElementById('diary-input').value!==note||S.attachment?.dataUrl!==image)throw new Error('Edit did not recover.');
  }
  const entry=getEntries()[todayStr()];if(entry?.diary!==note||entry.attachment?.dataUrl!==image)throw new Error('Saved record mismatch.');
  const checkpoint=accounts.state.records.syncItems()[todayStr()],{value:fixturePrefix}=await vault.read({key:'probe:account-sync-fixture'});
  const base=await probeCloud(vault,fixturePrefix).get(todayStr());
  if(checkpoint.value.diary!==note||base?.value.diary!==baseNote||base.value.attachment?.dataUrl!==image||checkpoint.sync.baseHash!==await fingerprint(base.value)||!checkpoint.sync.version)throw new Error('Pending sync checkpoint or attachment did not recover.');
  const result={passed:true,syncPendingRecovered:true,attachmentCheckpointRecovered:true,mode,profileRecovered:true,secureIdentityRecovered:true,noteRecovered:true,attachmentRecovered:true,at:new Date().toISOString()};
  if(mode==='account-read'){
    const {value:prefix}=await vault.read({key:'probe:account-sync-fixture'});if(!prefix?.startsWith('probe-sync:'))throw new Error('Missing probe sync fixture.');
    const sync=createSync({store:accounts.state.records,transport:probeCloud(vault,prefix)});await sync.run();
    if(sync.state.status!=='synced'||sync.state.pending||accounts.state.records.snapshot()[todayStr()].diary!==note)throw new Error('Pending check-in did not sync after restart.');
    sync.close();result.syncAfterRestartVerified=true;
    const audit=createAccountStore(vault,{project:PROBE_PROJECT});await audit.activate(session);const old=audit.state.records,snapshot=old.snapshot();
    await audit.activate(previewAccounts[1]);if(audit.state.status==='needs-profile')await audit.saveProfile({...probeProfile,currentParentLabel:'Probe Other Account',children:['Taylor']});
    if(Object.keys(audit.state.records.snapshot()).length)throw new Error('Other account contains data.');
    let rejected=false;try{await old.commit(snapshot)}catch{rejected=true}if(!rejected)throw new Error('Old store remained writable.');
    audit.lock();let signedIn;const auth=authFor(vault,s=>{signedIn=s});await auth.start();if(signedIn?.user.id!==session.user.id)throw new Error('Secure identity was not recovered.');
    await auth.signOut();const reopened=authFor(vault,s=>{signedIn=s});await reopened.start();if(signedIn!==null)throw new Error('Signed-out session reopened.');
    accounts.lock();Object.assign(result,{separateAccountEmpty:true,oldStoreRevoked:true,offlineSignoutPersisted:true});
  }
  await vault.write({key:'probe:'+mode,value:JSON.stringify(result)});
}
