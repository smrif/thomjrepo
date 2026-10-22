import {Capacitor,registerPlugin} from '@capacitor/core';
import {App} from '@capacitor/app';
import {createClient} from '@supabase/supabase-js';
import {createAuth,testProject,projectAuthVault} from './auth.js';
import {createAccountStore} from './account-store.js';
import {previewAccounts} from './account-preview.js';
import {browserVault} from './browser-vault.js';
import {mountProduct} from './product-runtime.js';
import {PROBE_PROJECT,probeProfile,createProbeAuth,runAccountProductProbe} from './account-probe.js';
import config from '../config.generated.json';

const native=Capacitor.isNativePlatform(),$=id=>document.getElementById(id),previewKey='account-preview:v1:identity';
let vault,accounts,auth,loadedOwner=null,signingOut=false,mounting=false,probeMode='';
function view(name){
  document.body.dataset.accountView=name;
  for(const id of ['welcome','profile','panel'])$('account-'+id).hidden=id!==name;
  if(name!=='product')document.body.dataset.checkinState=name==='loading'?'loading':'locked';
  $('checkin-loading').hidden=name!=='loading';
}
function message(text){$('account-message').textContent=text;}
function fail(){
  view('welcome');message('Could not open this account. Your saved records have not been replaced. Close and reopen to retry.');
  if(probeMode)vault.write({key:'probe:'+probeMode,value:JSON.stringify({passed:false,error:'Account startup or verification failed.'})}).catch(()=>{});
}
async function receive(session){
  if(signingOut)return;
  if(loadedOwner&&(session?.user?.id!==loadedOwner||session?.user?.email!==accounts.state.account?.email)){
    accounts.lock();view('loading');location.reload();return;
  }
  try{await accounts.activate(session);}catch{fail();}
}
async function stateChanged(state){
  if(state.status==='signed-out'){view('welcome');return;}
  if(state.status==='loading'){view('loading');return;}
  if(state.status==='needs-profile'){
    if(probeMode){if(probeMode!=='account-write')throw new Error('Missing probe profile.');await accounts.saveProfile(probeProfile);return;}
    $('account-profile-email').textContent=state.account.email;
    // Never carry a different account's partially authored profile into this form.
    $('account-profile-form').reset();$('account-profile-save').disabled=false;$('account-profile-message').textContent='';view('profile');return;
  }
  if(state.status==='error'){fail();return;}
  if(state.status!=='ready'||mounting)return;
  if(loadedOwner===state.account.id)return;
  loadedOwner=state.account.id;mounting=true;
  try{
    await mountProduct({config:state.config,store:state.records,accountMode:true});
    if(accounts.state!==state)return;
    const button=document.createElement('button');button.id='account-open';button.className='shell-sample account-open';button.textContent='Account';
    document.querySelector('.shell-sample').replaceWith(button);
    button.onclick=()=>{view('panel');$('account-back').focus()};
    $('account-identity').textContent=state.account.email;
    view('product');
    if(probeMode)await runAccountProductProbe({vault,accounts,mode:probeMode});
  }catch{fail();}finally{mounting=false;}
}
async function signOut(){
  if(signingOut)return;
  signingOut=true;accounts.lock();view('welcome');message('Signing out…');
  try{
    if(native)await auth.signOut();
    else{
      await vault.write({key:previewKey,value:'null'});
      if((await vault.read({key:previewKey})).value!=='null')throw new Error('Sign-out not saved.');
    }
    location.reload();
  }catch{
    message('Could not finish saving sign-out. Your account is locked here. Try again before closing the app.');
    $('account-retry-signout').hidden=false;
  }finally{signingOut=false;}
}
for(const button of document.querySelectorAll('.account-signout'))button.onclick=signOut;
$('account-retry-signout').onclick=signOut;
$('account-back').onclick=()=>{view('product');document.body.dataset.checkinState='ready';$('account-open').focus()};
$('account-login').onsubmit=async event=>{
  event.preventDefault();if(!auth)return;
  $('account-send').disabled=true;message('Sending your sign-in link…');
  try{await auth.send($('account-email').value.trim());message('Check your email on this device and open the newest link to return to the app.');}
  catch{message('Could not send the link. Check the approved test email and your connection, then try again.');}
  finally{$('account-send').disabled=false;}
};
$('account-profile-form').onsubmit=async event=>{
  event.preventDefault();$('account-profile-save').disabled=true;$('account-profile-message').textContent='';
  const owner=accounts.state.account?.scope;
  try{await accounts.saveProfile({currentParentLabel:$('account-parent').value,coParentLabel:$('account-coparent').value,children:$('account-children').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)});}
  catch(error){if(accounts.state.account?.scope===owner)$('account-profile-message').textContent=error.message?.startsWith('Enter both')?error.message:'Could not save the profile. Your answers are still here. Try again.';}
  finally{if(accounts.state.account?.scope===owner)$('account-profile-save').disabled=false;}
};
async function start(){
  try{
    if(new URLSearchParams(location.search).has('demo'))throw new Error('No demo seeding in account records.');
    vault=native?registerPlugin('WhoseDayVault'):await browserVault();
    if(native){const {mode}=await vault.testMode();if(['account-write','account-read'].includes(mode))probeMode=mode;}
    const project=probeMode?PROBE_PROJECT:native&&config.auth?.enabled?testProject(config.auth):'browser-preview';
    accounts=createAccountStore(vault,{project,onState:state=>{stateChanged(state).catch(fail)}});
    if(native){
      if(probeMode){auth=await createProbeAuth(vault,probeMode,receive);await auth.start();return;}
      $('account-login').hidden=!config.auth?.enabled;$('account-unconfigured').hidden=!!config.auth?.enabled;
      auth=createAuth({config:config.auth,vault:projectAuthVault(vault,project),createClient,onSession:receive,onError:message});
      if(auth){
        await App.addListener('appUrlOpen',({url})=>auth.callback(url));
        await auth.start();const launch=await App.getLaunchUrl();if(launch?.url)await auth.callback(launch.url);
        await App.addListener('appStateChange',({isActive})=>auth.foreground(isActive).catch(()=>{accounts.lock();fail()}));
      }else view('welcome');
    }else{
      $('account-preview').hidden=false;$('account-intro').textContent='Try the app with two separate sample accounts.';
      for(const [i,id] of ['account-preview-a','account-preview-b'].entries())$(id).onclick=async()=>{
        try{
          const value=JSON.stringify({id:previewAccounts[i].user.id});
          await vault.write({key:previewKey,value});if((await vault.read({key:previewKey})).value!==value)throw new Error('Account choice not saved.');
          await receive(previewAccounts[i]);
        }catch{fail();}
      };
      const {value}=await vault.read({key:previewKey}),choice=value?JSON.parse(value):null;
      await receive(previewAccounts.find(s=>s.user.id===choice?.id)||null);
    }
  }catch{fail();}
}
start();
