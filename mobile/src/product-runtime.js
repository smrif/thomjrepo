import {Capacitor} from '@capacitor/core';
import {Camera,CameraResultType,CameraSource} from '@capacitor/camera';
import {validateEntry} from './record-store.js';
const native=Capacitor.isNativePlatform(),$=id=>document.getElementById(id);
let account=false;
function saving(busy,label='Saving your check-in…'){
  for(const id of ['app','shell-header','shell-tabs'])$(id).inert=busy;
  $('app').setAttribute('aria-busy',String(busy));
  $('checkin-save-status').hidden=!busy;
  if(busy)$('checkin-save-status').textContent=label;
  if(busy)document.querySelectorAll('.checkin-save-error').forEach(el=>el.remove());
}
function saveError(_error,retry){
  saving(false);
  document.querySelectorAll('.checkin-save-error').forEach(el=>el.remove());
  const box=document.createElement('div');box.className='checkin-save-error';box.setAttribute('role','alert');box.tabIndex=-1;
  const message=document.createElement('p');message.textContent="Couldn't confirm the save. Your answers are still here. Try again, or reopen to check the saved copy.";
  const button=document.createElement('button');button.type='button';button.className='btn primary';button.textContent='Try saving again';button.onclick=()=>{box.remove();retry()};
  box.append(message,button);document.querySelector('.screen.active:not(.screen-leave)').append(box);box.focus();
}
function script(src){return new Promise((resolve,reject)=>{
  const element=document.createElement('script');element.src=src;element.onload=resolve;element.onerror=()=>reject(new Error('Interface could not load.'));document.body.append(element);
});}
function limitFeatures(){
  for(const button of document.querySelectorAll('[data-shell-tab="s-export"],[data-shell-tab="s-setup"],#s-saved [onclick="showExport()"],#weekly-report-row button,#sunday-prompt button')){
    button.disabled=true;button.title='Available in the full interface preview. Not connected in this check-in test.';
  }
  const note=document.createElement('p');note.className='checkin-local-note';
  note.textContent=account?'Test build · This account’s records save only on this device. Use sample data. Cloud sync is not connected.':native?'Test build · Sample records save only on this device. Cloud sync is not connected.':'Browser test · Sample records save in this browser. Cloud sync is not connected.';
  document.querySelector('#s-home .home-date').after(note);
  document.querySelector('.shell-sample').textContent=account?'Account test':native?'Device test':'Browser test';
  $('diary-input').maxLength=4000;$('easy-note').maxLength=4000;
  document.querySelector('#s-saved .saved-actions > button').textContent='Back to Today';
  document.querySelector('#s-saved .saved-card .q').textContent='Saved';
  document.querySelector('.success-copy').textContent='Saved on this device.';
  for(const id of ['s-week','s-dad-mode','s-mom-mode','s-allkids','s-mom-easy','s-diary']){
    const heading=document.querySelector(`#${id} .q`);if(heading)heading.setAttribute('aria-level','1');
  }
}
function accessibleChoices(){
  for(const element of document.querySelectorAll('#app .scene-card,#app .opt,#app .cal-cell[data-date]')){
    element.setAttribute('role','button');element.tabIndex=0;
    if(element.dataset.date)element.setAttribute('aria-label',element.dataset.date);
    if(!element.dataset.checkinKeyboard){
      element.dataset.checkinKeyboard='true';element.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();element.click()}
      });
    }
  }
}
async function pickAttachment(_input,origin){
  saving(true,'Opening your photos…');
  try{
    const photo=await Camera.getPhoto({source:CameraSource.Photos,resultType:CameraResultType.DataUrl,quality:75,width:1600,height:1600,correctOrientation:true});
    const attachment={name:'check-in-image.'+(photo.format==='png'?'png':'jpg'),type:'image/'+photo.format,dataUrl:photo.dataUrl};
    // Reuse the record validator before assigning any untrusted image payload.
    const entry={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'',attachment,changeAgreed:null,changePressured:null,loggedAt:new Date().toISOString()};
    validateEntry('2000-01-01',entry);S.attachment=attachment;renderAttachment(origin);
  }catch(error){
    if(!/cancel/i.test(error?.message||'')){
      const message=$('checkin-attachment-error');message.textContent='Could not add that image. Choose a JPEG or PNG under 3 MB.';message.hidden=false;
    }
  }finally{saving(false)}
}

export async function mountProduct({config,store,accountMode=false}){
  account=accountMode;
  window.WhoseDayPlatform={synthetic:true,config,records:store,saving,saveError,saveStatusLabel:native?'Saved on this device':'Saved in this browser',...(native?{pickAttachment}:{})};
  await script('app.js');await script('shell.js');limitFeatures();accessibleChoices();
  new MutationObserver(accessibleChoices).observe($('app'),{subtree:true,childList:true});
  if(native){
    $('diary-attach-btn').addEventListener('click',event=>{event.preventDefault();$('checkin-attachment-error').hidden=true;pickAttachment(null,'diary')});
  }
  document.body.dataset.checkinState='ready';$('checkin-loading').hidden=true;
}
