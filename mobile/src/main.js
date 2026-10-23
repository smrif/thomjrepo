import {runProbe} from './probe.js';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Camera,CameraResultType,CameraSource} from '@capacitor/camera';
import {Share} from '@capacitor/share';
import {createClient} from '@supabase/supabase-js';
import {createRepository,localDay,reportText} from './domain.js';
import {createAuth} from './auth.js';
import config from '../config.generated.json';
const vault=registerPlugin('WhoseDayVault'),repo=createRepository(vault);
const $=id=>document.getElementById(id);
let attachment=null,saved=null,auth=null,busy=false,ready=false;
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error)}
function lock(value){busy=value;for(const el of document.querySelectorAll('[data-native]'))el.disabled=value||!Capacitor.isNativePlatform()||!ready;$('send-link').disabled=value||!auth;$('sign-out').disabled=value||!auth}
async function action(fn){if(busy)return;lock(true);try{await fn()}catch{message('That action failed. Your previous saved test record is preserved. Try again.',true)}finally{lock(false)}}
function render(record){
  saved=record;
  if(record){$('parent').value=record.week;$('note').value=record.diary;attachment=record.attachment;$('saved').textContent='Saved record reopened: '+record.day+' · '+new Date(record.loggedAt).toLocaleTimeString()}
  else{$('saved').textContent='No test record saved for today.';attachment=null}
  $('attachment').hidden=!attachment;if(attachment)$('attachment').src=attachment;
}
$('save').onclick=()=>action(async()=>{
  const record={schema:1,day:localDay(),week:$('parent').value,diary:$('note').value,attachment,loggedAt:new Date().toISOString()};
  render(await repo.save(record));message('Saved and verified in the native database. Force quit and reopen to test recovery.');
});
$('reload').onclick=()=>action(async()=>{render(await repo.load(localDay()));message('Read directly from the native database.');});
$('pick').onclick=()=>action(async()=>{
  const photo=await Camera.getPhoto({source:CameraSource.Photos,resultType:CameraResultType.DataUrl,quality:70,width:1024,height:1024,correctOrientation:true});
  if(!photo.dataUrl || !['jpeg','png'].includes(photo.format) || photo.dataUrl.length>4*1024*1024)throw new Error('Image too large');
  attachment=photo.dataUrl;$('attachment').src=attachment;$('attachment').hidden=false;message('Test image selected. Save the check-in to keep it after reopening.');
});
$('remove-image').onclick=()=>{attachment=null;$('attachment').removeAttribute('src');$('attachment').hidden=true;message('Image removed from draft. Save to update the database.');};
$('share').onclick=()=>action(async()=>{
  if(!saved){message('Save a test check-in before making a report.',true);return}
  const {uri}=await vault.makeReport({text:reportText(saved)});
  await Share.share({title:'Whose Day test report',files:[uri],dialogTitle:'Share synthetic test report'});
  message('Report share sheet closed. Confirm the resulting file in the destination you chose.');
});
$('native-check').onclick=()=>action(async()=>{
  await vault.writeSecret({key:'lab-probe',value:'synthetic-session-probe'});
  const secret=await vault.readSecret({key:'lab-probe'});
  if(secret.value!=='synthetic-session-probe')throw new Error('Secure readback failed');
  await vault.removeSecret({key:'lab-probe'});
  if((await vault.readSecret({key:'lab-probe'})).value!==null)throw new Error('Secure removal failed');
  const {uri}=await vault.makeReport({text:'Synthetic native PDF test. No personal data.'});
  await vault.write({key:'probe:last',value:JSON.stringify({secureRoundTrip:true,pdfCreated:true,uri,at:new Date().toISOString()})});
  message('Native secure-storage round trip and PDF creation passed.');
});
$('send-link').onclick=()=>action(async()=>{
  if(!$('email').reportValidity())return;
  await auth.send($('email').value.trim());message('Sign-in link requested. Open it on this device to return to Whose Day Lab.');
});
$('sign-out').onclick=()=>action(async()=>{await auth.signOut();message('Signed out of the test account. Synthetic local records remain.');});
(async()=>{
  $('platform').textContent=Capacitor.getPlatform();
  if(!Capacitor.isNativePlatform()){lock(false);message('Browser preview: native persistence, photo selection and sharing require the installed lab app.');return}
  lock(true);
  try {
    const {mode}=await vault.testMode();
    if(mode.startsWith('account-')||mode.startsWith('backup-')||mode.startsWith('reports-')){location.replace('account/index.html');return}
    if(mode.startsWith('checkin-')){location.replace('checkin/index.html');return}
    if(!mode&&!new URLSearchParams(location.search).has('lab')){location.replace('account/index.html');return}
    if(mode)await runProbe(vault,mode);
    render(await repo.load(localDay()));ready=true;
    auth=createAuth({config:config.auth,vault,createClient,onSession:session=>{$('auth-state').textContent=session?'Test account signed in.':'Signed out.';if(session)vault.write({key:'probe:auth-verified',value:JSON.stringify({verified:true,at:new Date().toISOString()})}).catch(()=>{})},onError:text=>message(text,true)});
    if(auth){
      await App.addListener('appUrlOpen',({url})=>auth.callback(url));
      await auth.start();
      if(mode==='auth' && config.auth.approvedTestEmail){
        const previous=await vault.read({key:'probe:auth-requested'});
        if(!previous.value){await auth.send(config.auth.approvedTestEmail);await vault.write({key:'probe:auth-requested',value:JSON.stringify({requested:true,at:new Date().toISOString()})});message('Requested the approved test account sign-in link.')}
      }
      const launch=await App.getLaunchUrl();if(launch?.url)await auth.callback(launch.url);
      await App.addListener('appStateChange',({isActive})=>auth.foreground(isActive).catch(()=>message('Could not refresh test sign-in.',true)));
    }
    $('auth-setup').hidden=!!auth;
    if(mode!=='auth')message(saved?'Native record recovered. Ready for offline and sharing tests.':'Ready for a synthetic offline check-in.');
  }catch{message('Native startup failed. No records were replaced. Close and reopen the app.',true)}finally{lock(false)}
})();
