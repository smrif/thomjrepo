import {equal} from './sync-store.js';
const $=id=>document.getElementById(id);
const clone=value=>JSON.parse(JSON.stringify(value));

// Reuse the shared Settings screens; their mobile saves never enter the web
// localStorage/auth paths. Only a verified per-account write changes the UI.
export function mountSettings({accounts,openAccount,signOut,deletion,syncEnabled=false}){
  let expected=null,busy=false;
  const original={showSetup:window.showSetup,openSettingsPage:window.openSettingsPage,backToSettings:window.backToSettings,setThemeMode:window.setThemeMode,updateSettingsOverview:window.updateSettingsOverview};
  function apply(config){
    window.WhoseDayPlatform.config=clone(config);saveConfig(config,false);
    renderConfigurableUi();initHome();
  }
  function feedback(text,error=false){const target=settingsPage==='child'?$('child-editor-error'):$('settings-save-message');target.textContent=text;target.setAttribute('role',error?'alert':'status');}
  function setBusy(value){
    busy=value;
    for(const id of ['app','shell-header','shell-tabs'])$(id).inert=value;
    $('app').setAttribute('aria-busy',String(value));
    $('mobile-settings-saving').hidden=!value;
  }
  async function save(patch,{child=false}={}){
    if(busy)return false;
    const page=settingsPage,scroll=window.scrollY;setBusy(true);feedback('');
    try{
      const config=await accounts.updateProfile(patch,expected);
      expected=clone(config);apply(config);
      // Rebuild the form only after the durable write succeeds. A failure keeps
      // the actual field, including a child editor's text, available for retry.
      if(child){$('child-modal').classList.remove('show');$('child-modal').setAttribute('aria-hidden','true');editingChildRow=null;}
      setBusy(false);if(page==='overview'&&Object.keys(patch).join(',')==='themeMode'){original.updateSettingsOverview();decorate();window.scrollTo(0,scroll);}else{original.showSetup();decorate();}feedback('Saved on this device.');return true;
    }catch(error){
      if(accounts.state.status!=='ready')return false;
      feedback(error.message?.startsWith('Your profile changed')?error.message:(error.message?.startsWith('Enter both')||error.message?.startsWith('Choose between'))?error.message:'Could not confirm the save. Your changes are still here. Try again or reopen Settings to check the saved copy.',true);
      return false;
    }finally{setBusy(false);}
  }
  function decorate(){
    $('setup-email').readOnly=true;$('setup-email').value=accounts.state.account.email;
    document.querySelector('[data-settings-page="email"] .settings-detail-description').textContent='Your signed-in account. Use Sign out to switch accounts.';
    $('account-email-hint').textContent='This is the signed-in account. Changing the sign-in email is not available in this test build.';
    $('cloud-auth-signout').hidden=false;$('cloud-auth-signout').onclick=signOut;
    $('setup-terms-field').hidden=true;$('s-setup').classList.remove('policy-update-available');
    $('settings-save-area').hidden=!['name','coparent','activities'].includes(settingsPage);
    const summary=$('settings-sync-summary');summary.textContent=$('account-sync-status').textContent||'Saved on this device';
    for(const el of document.querySelectorAll('#s-setup [data-cloud-unavailable]'))el.hidden=true;
    document.querySelector('.setup-privacy').textContent=syncEnabled?'Saved on this device first. Check account sync for its upload status.':'Saved on this device for this account. Cloud sync is not configured.';
    document.querySelector('.setup-add-child').disabled=accounts.state.profile.config().children.length>=20;
    for(const input of [$('setup-current-parent'),$('setup-co-parent'),$('child-modal-input')])input.maxLength=100;
  }
  window.updateSettingsOverview=function(){original.updateSettingsOverview();if(accounts.state.status==='ready')decorate()};
  window.showSetup=function(){
    if(busy)return;
    const config=accounts.applyProfile();apply(config);expected=clone(config);
    original.showSetup();decorate();
  };
  window.openSettingsPage=function(page,options){
    if(busy)return;
    if(['backup','import','export'].includes(page))return;
    const previous=settingsPage;original.openSettingsPage(page,options);decorate();
    if(page==='delete'){if(previous!==page)deletion?.reset();else deletion?.refresh();}
  };
  window.backToSettings=function(){if(busy)return;original.backToSettings();decorate()};
  window.saveSetup=async()=>{
    if(settingsPage==='name')return save({currentParentLabel:$('setup-current-parent').value});
    if(settingsPage==='coparent')return save({coParentLabel:$('setup-co-parent').value});
    if(settingsPage==='activities')return save({activityIds:getActivityIdsFromSetup()});
  };
  window.setThemeMode=function(mode,persist=true){
    if(!persist)return original.setThemeMode(mode,false);
    if(!['system','light','dark'].includes(mode)||busy)return;
    return save({themeMode:mode});
  };
  window.saveChildEditor=async()=>{
    if(!editingChildRow||busy)return;
    const name=$('child-modal-input').value.trim().replace(/\s+/g,' ');
    if(!name){feedback('Enter a child’s name.',true);return;}
    const rows=[...document.querySelectorAll('.setup-child-row')],index=rows.indexOf(editingChildRow);
    const children=rows.map((row,i)=>i===index?name:row.querySelector('.setup-child-input').value);
    return save({children},{child:true});
  };
  window.removeEditingChild=async()=>{
    if(!editingChildRow||busy)return;
    const children=[...document.querySelectorAll('.setup-child-row')].filter(row=>row!==editingChildRow).map(row=>row.querySelector('.setup-child-input').value);
    if(!children.length){feedback('Keep at least one child in this profile.',true);return;}
    return save({children},{child:true});
  };
  // Mobile account management and data tools replace browser-only actions.
  for(const page of ['backup','import','export']){
    const button=document.querySelector(`#s-setup [onclick="openSettingsPage('${page}')"]`);button.disabled=true;button.title='Not yet available in this test build.';
  }
  const analytics=document.querySelector('#s-setup [data-analytics-choice]')?.closest('section');if(analytics)analytics.remove();
  for(const page of ['sync','logs']){
    const host=document.querySelector(`[data-settings-page="${page}"]`);
    host.querySelectorAll('.settings-auth-card').forEach(el=>el.hidden=true);
    const box=document.createElement('div');box.className='settings-card settings-auth-card';
    const status=document.createElement('p');status.dataset.mobileSyncStatus='';status.textContent=$('account-sync-status').textContent||'This account saves on this device. Cloud sync is not configured.';
    const button=document.createElement('button');button.className='btn';button.textContent='Open account and sync';button.onclick=openAccount;box.append(status,button);host.append(box);
  }
  const note=document.createElement('p');note.className='settings-detail-description';note.textContent='Changes apply to future check-ins. Saved records keep their original child names.';$('setup-children-list').closest('section').append(note);
  const saving=document.createElement('p');saving.id='mobile-settings-saving';saving.className='checkin-save-status';saving.setAttribute('role','status');saving.hidden=true;saving.textContent='Saving your settings…';document.body.append(saving);
  const settingsButton=document.querySelector('[data-shell-tab="s-setup"]');settingsButton.disabled=false;settingsButton.removeAttribute('title');
  if(document.body.dataset.activeScreen==='s-setup')window.showSetup();
  return {apply, get busy(){return busy},get editing(){return document.body.dataset.activeScreen==='s-setup'},changed(){return !equal(accounts.state.config,accounts.state.profile.config())}};
}
