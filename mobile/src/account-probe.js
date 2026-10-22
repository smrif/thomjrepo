import {createAccountStore} from './account-store.js';
import {createAuth,AUTH_STORAGE_KEY} from './auth.js';
import {previewAccounts} from './account-preview.js';
export const PROBE_PROJECT='sim-account-probe';
export const probeProfile={currentParentLabel:'Probe Parent A',coParentLabel:'Probe Parent B',children:['Alex','Sam']};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const note='Synthetic account-specific check-in.';
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
export async function runAccountProductProbe({vault,accounts,mode}){
  if(accounts.state.account.id!==session.user.id||APP_CONFIG.currentParentLabel!==probeProfile.currentParentLabel)throw new Error('Account/profile mismatch.');
  if(mode==='account-write'){
    startCheckin();S={...blankCheckinState(),week:'dad',dadMode:'normal',kidsWithDad:['Alex','Sam'],diary:note,attachment:{name:'synthetic.png',type:'image/png',dataUrl:image}};
    goToDiary('s-dad-help-choice','Anything else to note?','Synthetic account test.',3,4);document.getElementById('diary-input').value=note;
    await saveEntry();if(document.body.dataset.activeScreen!=='s-saved')throw new Error('Product save did not finish.');
  }else{
    if(document.body.dataset.activeScreen!=='s-home'||!document.getElementById('home-checkin-card').classList.contains('logged'))throw new Error('Today did not recover.');
    startTodayEdit();prepareEditTarget('s-diary');
    if(document.getElementById('diary-input').value!==note||S.attachment?.dataUrl!==image)throw new Error('Edit did not recover.');
  }
  const entry=getEntries()[todayStr()];if(entry?.diary!==note||entry.attachment?.dataUrl!==image)throw new Error('Saved record mismatch.');
  const result={passed:true,mode,profileRecovered:true,secureIdentityRecovered:true,noteRecovered:true,attachmentRecovered:true,at:new Date().toISOString()};
  if(mode==='account-read'){
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
