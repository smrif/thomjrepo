import {Capacitor,registerPlugin} from '@capacitor/core';
import {App} from '@capacitor/app';
import {createClient} from '@supabase/supabase-js';
import {createAuth,testProject,projectAuthVault} from './auth.js';
import {createAccountStore} from './account-store.js';
import {previewAccounts} from './account-preview.js';
import {browserVault} from './browser-vault.js';
import {testBackend} from './test-backend.js';
import {registrationBackend} from './registration-backend.js';
import {registrationEnabled} from './registration-config.js';
import {deviceVault,previewBackend} from './sync-preview.js';
import {syncUI} from './sync-ui.js';
import {mountSettings} from './settings-runtime.js';
import {deletionUI} from './deletion-ui.js';
import {mountBackup} from './backup-runtime.js';
import {mountReports} from './reports-runtime.js';
import {mountPolicies} from './policies-runtime.js';
import {mountOnboarding} from './onboarding-runtime.js';
import {accountDeletion} from './delete-account.js';
import {mountProduct} from './product-runtime.js';
import config from '../config.generated.json';

const native=Capacitor.isNativePlatform(),$=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),syncPreview=__WHOSE_DAY_LAB__&&!native&&params.get('sync')==='preview',device=params.get('device')==='two'?'two':'one';
const onboardingPreview=__WHOSE_DAY_LAB__&&!native&&!syncPreview&&params.get('onboarding')==='preview',previewKey='account-preview:v1:identity'+(onboardingPreview?':onboarding':'');
let vault,accounts,auth,onboarding,onboardingFixture,probeTools,loadedOwner=null,signingOut=false,mounting=false,probeMode='',syncView=null,settings=null,deletion=null,previewOnline=true;
const online=()=>navigator.onLine!==false&&(!syncPreview||previewOnline);
const canDownload=()=>!loadedOwner||['s-home','s-cal','s-trends'].includes(document.body.dataset.activeScreen);
function refreshProduct(){
  if(!loadedOwner||document.body.dataset.checkinState!=='ready')return;
  if(document.body.dataset.activeScreen==='s-home')initHome();
  else if(document.body.dataset.activeScreen==='s-cal'){
    const entry=selectedCalDate&&getEntries()[selectedCalDate];
    if(entry&&$('cal-detail').style.display!=='none')showDetail(selectedCalDate,entry,{reveal:false});else renderCal();
    renderStats();
  }
  syncView?.render();
}
function view(name){
  document.body.dataset.accountView=name;
  for(const id of ['welcome','profile','onboarding','panel','restore','deletion','file-restore','policies']){const page=$('account-'+id);if(page)page.hidden=id!==name;}
  if(name!=='product')document.body.dataset.checkinState=name==='loading'?'loading':'locked';
  $('checkin-loading').hidden=name!=='loading';
}
function message(text){$('account-message').textContent=text;}
function fail(){
  view('welcome');message('Could not open this account. Your saved records have not been replaced. Close and reopen to retry.');
  if(__WHOSE_DAY_LAB__&&probeMode)vault.write({key:'probe:'+probeMode,value:JSON.stringify({passed:false,error:'Account startup or verification failed.'})}).catch(()=>{});
}
async function receive(session){
  if(signingOut)return;
  if(loadedOwner&&(session?.user?.id!==loadedOwner||session?.user?.email!==accounts.state.account?.email)){
    accounts.lock();view('loading');location.reload();return;
  }
  try{await accounts.activate(session);}catch{fail();}
}
async function stateChanged(state){
  if(['restoring','restore-complete','restore-check'].includes(state.status)){
    view('file-restore');$('file-restore-reopen').hidden=state.status==='restoring';
    $('file-restore-title').textContent=state.status==='restoring'?'Restoring your backup':state.status==='restore-complete'?'Backup restored':'Check the saved restore';
    $('file-restore-message').textContent=state.status==='restoring'?'Saving selected data on this device. Sync is paused.':state.status==='restore-complete'?state.count+' records restored'+(state.profileChanged?' with profile and preferences':'')+'. Reopen to review your records and resume account sync.':'The restore could not be confirmed. The transaction keeps either the complete restore or the previous records. Reopen to check the saved copy before making more changes. Keep your backup file.';return;
  }
  if(state.status==='signed-out'){syncView?.reset();view('welcome');return;}
  if(state.status==='deletion-pending'){deletion?.pending();return;}
  if(state.status==='deleted'){view('deletion');$('account-deletion-title').textContent='Test account deleted';$('account-deletion-message').textContent='The test account was deleted. Its saved device copies remain hidden here and will not sync to another account.';$('mobile-delete-pending').hidden=true;$('mobile-delete-reopen').hidden=true;return;}
  if(state.status==='deletion-failed')return;
  if(state.status==='loading'){view('loading');return;}
  if(state.status==='restore-unavailable'){view('restore');$('account-restore-retry').disabled=false;return;}
  if(state.status==='needs-profile'){
    if(__WHOSE_DAY_LAB__&&probeMode&&!probeMode.startsWith('onboarding-')){if(!['account-write','backup-write','reports-write','photo-write'].includes(probeMode))throw new Error('Missing probe profile.');await accounts.saveProfile(probeTools.probeProfile);return;}
    if(await onboarding.needsProfile(state))return;
    if(!__WHOSE_DAY_LAB__)throw Error('Account setup must finish before opening records.');
    $('account-profile-email').textContent=state.account.email;
    // Never carry a different account's partially authored profile into this form.
    $('account-profile-form').reset();$('account-profile-save').disabled=false;$('account-profile-message').textContent='';view('profile');return;
  }
  if(state.status==='error'){fail();return;}
  if(state.status!=='ready'||mounting)return;
  onboarding?.ready(state.account);
  if(loadedOwner===state.account.id)return;
  loadedOwner=state.account.id;mounting=true;
  try{
    await mountProduct({config:state.config,store:state.records,accountMode:true});
    if(accounts.state!==state)return;
    const button=document.createElement('button');button.id='account-open';button.className='shell-sample account-open';button.textContent='Account';
    document.querySelector('.shell-sample').replaceWith(button);
    button.onclick=()=>{view('panel');$('account-back').focus()};
    $('account-identity').textContent=state.account.email;
    const openAccount=()=>{view('panel');$('account-back').focus()};
    settings=mountSettings({accounts,openAccount,signOut,deletion,syncEnabled:!!syncView});
    policies.addSettings();
    mountBackup({accounts,vault,native});
    mountReports({accounts,vault,native,applyProfile:settings.apply});
    if(syncView){
      const note=document.querySelector('.checkin-local-note');note.textContent='Test build · Saves stay on this device first. Sync status is separate from a device save.';
      const status=document.createElement('button');status.id='account-sync-home';status.className='account-sync-home';status.onclick=()=>{view('panel');$('account-back').focus()};note.after(status);
      state.records.subscribe(kind=>{if(kind==='remote')refreshProduct()});
      syncView.render();
    }
    view('product');
    if(syncView)queueMicrotask(()=>accounts.sync());
    if(__WHOSE_DAY_LAB__){
    if(probeMode.startsWith('reports-'))await (await import('./reports-probe.js')).runReportsProbe({vault,accounts,mode:probeMode});
    else if(probeMode.startsWith('photo-'))await (await import('./photo-probe.js')).runPhotoProbe({vault,accounts,mode:probeMode});
    else if(probeMode.startsWith('backup-'))await (await import('./backup-probe.js')).runBackupProbe({vault,accounts,mode:probeMode});
    else if(probeMode.startsWith('onboarding-'))await vault.write({key:'probe:onboarding-ui-ready',value:JSON.stringify({passed:true,scope:state.account.scope,userId:state.account.id,at:new Date().toISOString()})});
    else if(probeMode)await probeTools.runAccountProductProbe({vault,accounts,mode:probeMode});
    }
  }catch{fail();}finally{mounting=false;}
}
async function signOut(){
  if(signingOut)return;
  signingOut=true;accounts.lock();view('welcome');message('Signing out…');
  try{
    if(native)await auth.signOut();
    else if(__WHOSE_DAY_LAB__){
      await vault.write({key:previewKey,value:'null'});
      if((await vault.read({key:previewKey})).value!=='null')throw new Error('Sign-out not saved.');
    }
    // The next account starts on Today rather than inheriting this account's
    // Settings route from the URL fragment.
    history.replaceState(null,'',location.pathname+location.search);location.reload();
  }catch{
    message('Could not finish saving sign-out. Your account is locked here. Try again before closing the app.');
    $('account-retry-signout').hidden=false;
  }finally{signingOut=false;}
}
for(const button of document.querySelectorAll('.account-signout'))button.onclick=signOut;
$('account-retry-signout').onclick=signOut;
$('file-restore-reopen').onclick=()=>{history.replaceState(null,'',location.pathname+location.search);location.reload()};
$('account-restore-retry').onclick=()=>{const session={user:{id:accounts.state.account.id,email:accounts.state.account.email}};$('account-restore-retry').disabled=true;receive(session)};
$('account-back').onclick=()=>{view('product');document.body.dataset.checkinState='ready';refreshProduct();$('account-open').focus();accounts.sync()};
$('account-login').onsubmit=async event=>{
  event.preventDefault();if(!auth)return;
  $('account-send').disabled=true;message('Sending your sign-in link…');
  try{await auth.send($('account-email').value.trim(),{signup:false});message('Check your email on this device and open the newest link to return to the app.');}
  catch{message('Could not send the link. Check the approved test email and your connection, then try again.');}
  finally{$('account-send').disabled=false;}
};
if(__WHOSE_DAY_LAB__)$('account-profile-form').onsubmit=async event=>{
  event.preventDefault();$('account-profile-save').disabled=true;$('account-profile-message').textContent='';
  const owner=accounts.state.account?.scope;
  try{await accounts.saveProfile({currentParentLabel:$('account-parent').value,coParentLabel:$('account-coparent').value,children:$('account-children').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)});}
  catch(error){if(accounts.state.account?.scope===owner)$('account-profile-message').textContent=error.message?.startsWith('Enter both')?error.message:'Could not save the profile. Your answers are still here. Try again.';}
  finally{if(accounts.state.account?.scope===owner)$('account-profile-save').disabled=false;}
};
async function start(){
  try{
    // A candidate web payload cannot fall back to browser identities or storage.
    // Native authentication remains the only way into its account screens.
    if(!__WHOSE_DAY_LAB__&&!native){
      $('account-signup').disabled=true;$('account-signin').disabled=true;
      $('account-intro').textContent='Open the installed app to sign in.';view('welcome');return;
    }
    if(new URLSearchParams(location.search).has('demo'))throw new Error('No demo seeding in account records.');
    vault=__WHOSE_DAY_LAB__&&!native?await browserVault():registerPlugin('WhoseDayVault');
    if(__WHOSE_DAY_LAB__&&native){const {mode}=await vault.testMode();if(['onboarding-write','onboarding-read','account-write','account-read','backup-write','backup-read','reports-write','reports-read','photo-write','photo-read'].includes(mode))probeMode=mode;}
    if(__WHOSE_DAY_LAB__&&probeMode)probeTools=await import('./account-probe.js');
    const sharedVault=vault;
    if(__WHOSE_DAY_LAB__&&syncPreview){vault=deviceVault(vault,device);previewOnline=(await vault.read({key:'sync-preview:online'})).value!=='false';}
    if(__WHOSE_DAY_LAB__&&probeMode.startsWith('onboarding-'))onboardingFixture=await (await import('./onboarding-probe.js')).onboardingProbe(vault,probeMode,receive);
    const project=__WHOSE_DAY_LAB__&&probeMode?(onboardingFixture?onboardingFixture.project:probeMode.startsWith('photo-')?'sim-photo-probe':probeMode.startsWith('reports-')?'sim-reports-probe':probeMode.startsWith('backup-')?'sim-backup-probe':probeTools.PROBE_PROJECT):native&&config.auth?.enabled?testProject(config.auth):syncPreview?'browser-sync-preview':onboardingPreview?'browser-onboarding-preview':'browser-preview';
    const serverRegistration=registrationEnabled(config),syncEnabled=syncPreview||native&&!probeMode&&config.sync?.enabled===true&&config.auth?.enabled;
    const backend=syncEnabled?(owner=>__WHOSE_DAY_LAB__&&syncPreview?previewBackend(sharedVault,owner,online):(serverRegistration?registrationBackend:testBackend)(auth,config.auth,owner)):null;
    accounts=createAccountStore(vault,{project,backend,canDownload,online,onSync:(kind,state)=>syncView?.update(kind,state),onState:state=>{stateChanged(state).catch(fail)}});
    const choosePreview=__WHOSE_DAY_LAB__?async function(index){
      const value=JSON.stringify({id:previewAccounts[index].user.id});
      await vault.write({key:previewKey,value});if((await vault.read({key:previewKey})).value!==value)throw Error('Account choice not saved.');
      await receive(previewAccounts[index]);
    }:null;
    onboarding=mountOnboarding({vault,project,native,accounts,auth:()=>native?auth:{signOut},previewAccounts:__WHOSE_DAY_LAB__?previewAccounts:[],choosePreview,setView:view,policies});
    $('account-signup').onclick=()=>onboarding.beginSignup().catch(fail);
    $('account-signin').onclick=async()=>{try{await onboarding.signIn();$('account-login').hidden=!native||!auth;$('account-intro').textContent=native?'Sign in to restore your existing profile and records.':'Choose your existing sample account below. This preview sends no email.';if(native&&auth)$('account-email').focus();}catch{message('Could not save the sign-in choice. Try again.')}};
    if(syncEnabled)syncView=syncUI({accounts:()=>accounts,canDownload,previewDevice:syncPreview?device:'',online,toggleOnline:__WHOSE_DAY_LAB__?async()=>{previewOnline=!previewOnline;await vault.write({key:'sync-preview:online',value:String(previewOnline)})}:null});
    const remove=__WHOSE_DAY_LAB__&&syncPreview?(owner=>previewBackend(sharedVault,owner,online).remove()):native&&config.deletion?.enabled?(owner=>accountDeletion(auth,config)(owner)):null;
    deletion=deletionUI({accounts,remove,online,view,signOut,preview:syncPreview,restore:()=>location.reload(),complete:async()=>{
      signingOut=true;
      try{
        if(native)await auth.signOut();else{await vault.write({key:previewKey,value:'null'});if((await vault.read({key:previewKey})).value!=='null')throw Error();}
      }catch{$('account-deletion-message').textContent='Deletion was confirmed. Your account remains locked here, but sign-out cleanup needs a retry. Use Sign out before closing.';}
      finally{signingOut=false;}
    }});
    window.addEventListener('online',()=>accounts.sync());
    window.addEventListener('offline',()=>accounts.sync());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)accounts.sync()});
    // Foreground retry also discovers changes from another device. Bundled
    // native code does not promise continuous background synchronization.
    let retryDelay=5000;
    async function retry(){
      if(!document.hidden&&accounts.state.status==='ready'){
        await accounts.sync();refreshProduct();
        retryDelay=accounts.syncs.some(s=>s.state.status==='error')?Math.min(retryDelay*2,60000):15000;
      }
      setTimeout(retry,retryDelay);
    }
    if(syncEnabled)setTimeout(retry,retryDelay);
    if(native){
      if(__WHOSE_DAY_LAB__&&onboardingFixture){auth=onboardingFixture.auth;await auth.start();return;}
      if(__WHOSE_DAY_LAB__&&probeMode){auth=await probeTools.createProbeAuth(vault,probeMode,receive);await auth.start();return;}
      $('account-login').hidden=true;$('account-unconfigured').hidden=!!config.auth?.enabled;
      if(!__WHOSE_DAY_LAB__&&!config.auth?.enabled){$('account-signup').disabled=true;$('account-signin').disabled=true;}
      auth=createAuth({config:config.auth,vault:projectAuthVault(vault,project),createClient,onSession:receive,onError:text=>{if(!onboarding.authError(text))message(text)}});
      if(auth){
        await App.addListener('appUrlOpen',({url})=>auth.callback(url));
        await auth.start();const launch=await App.getLaunchUrl();if(launch?.url)await auth.callback(launch.url);
        await App.addListener('appStateChange',({isActive})=>auth.foreground(isActive).then(()=>{if(isActive)accounts.sync()}).catch(()=>{accounts.lock();fail()}));
      }else view('welcome');
    }else if(__WHOSE_DAY_LAB__){
      for(const id of ['account-preview-a','account-preview-b'])$(id).disabled=true;
      $('account-preview').hidden=false;$('account-intro').textContent=syncPreview?'Sync preview · Device '+device+'. Try the same sample account on both preview devices.':'Try the app with two separate sample accounts.';
      for(const [i,id] of ['account-preview-a','account-preview-b'].entries())$(id).onclick=async()=>{
        try{
          await onboarding.signIn();await choosePreview(i);
        }catch{fail();}
      };
      const {value}=await vault.read({key:previewKey}),choice=value?JSON.parse(value):null;
      await receive(previewAccounts.find(s=>s.user.id===choice?.id)||null);
      for(const id of ['account-preview-a','account-preview-b'])$(id).disabled=false;
    }
  }catch{fail();}
}
const policies=mountPolicies({setView:view,owner:()=>accounts?.state.account?.scope||'',status:()=>accounts?.state.status||''});
start();
