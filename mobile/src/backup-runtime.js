import {portable,parseBackup} from './backup-domain.js';
const $=id=>document.getElementById(id);
export function mountBackup({accounts,vault,native}){
  let busy=false;
  const originalCancel=window.cancelBackupImport;
  function message(text,error=false){backupMessage(text,error)}
  function working(value){
    busy=value;backupRestoreBusy=value;
    for(const id of ['app','shell-header','shell-tabs'])$(id).inert=value;
    $('app').setAttribute('aria-busy',String(value));
    $('backup-download').disabled=value;$('backup-file').disabled=value;$('backup-import-controls').disabled=value;
    const choose=$('mobile-backup-choose');if(choose)choose.disabled=value;
  }
  window.backupState=()=>accounts.backupSnapshot();
  window.cancelBackupImport=()=>{if(!busy)originalCancel()};
  window.downloadFullBackup=async()=>{
    if(busy)return;working(true);
    try{
      message('Preparing your backup…');const state=accounts.backupSnapshot(),data=await portable.create(state);
      if(accounts.state.account?.scope!==stateScope(state))return;
      const text=JSON.stringify(data),name='whose-day-backup-'+todayStr()+'.json';
      if(native){const result=await vault.exportBackup({text,name});if(accounts.state.account?.scope!==stateScope(state))return;message(result.cancelled?'Backup export cancelled.':'Backup saved to the location you chose. Keep the file safe.');}
      else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message('Backup download requested. Keep the downloaded file safe.');}
    }catch(error){message(error.message||'Could not prepare your backup.',true)}finally{working(false)}
  };
  function stateScope(state){return 'account-v1-'+state.account.project+'-'+state.account.id.toLowerCase()}
  async function preview(read){
    if(busy)return;backupImportReview=null;$('backup-preview').hidden=true;const token=++backupFileToken,owner=accounts.state.account?.scope;working(true);
    try{
      message('Checking your backup…');const file=await read();if(file?.cancelled){message('No backup selected.');return;}
      const backup=await parseBackup(file.text);
      if(token!==backupFileToken||settingsPage!=='import'||owner!==accounts.state.account?.scope)return;
      const state=accounts.backupSnapshot(),plan=portable.plan(backup,state);
      backupImportReview={backup,plan,fileName:file.name,snapshot:state.snapshot,accountId:state.account.id,epoch:appAccessEpoch,choices:{},restoreProfile:false};
      renderBackupPreview();message('Preview ready. Nothing has been changed.');
    }catch(error){if(token===backupFileToken&&owner===accounts.state.account?.scope)message(error.message||'Could not read this backup.',true)}
    finally{working(false);updateBackupRestoreButton()}
  }
  window.previewBackupFile=input=>{
    const file=input.files?.[0];if(!file)return;
    return preview(async()=>{if(file.size>portable.MAX_BYTES)throw Error('Choose a backup up to 25 MB.');return {text:await file.text(),name:file.name}});
  };
  window.restoreBackupSelection=async()=>{
    if(busy||!backupImportReview||$('backup-restore-confirm').disabled)return;
    const review=backupImportReview;working(true);
    try{
      const current=accounts.backupSnapshot();
      if(current.snapshot!==review.snapshot){review.plan=portable.plan(review.backup,current);review.snapshot=current.snapshot;review.choices={};review.restoreProfile=false;renderBackupPreview();message('Your saved data changed. Review the updated preview before restoring.',true);return;}
      await accounts.restoreBackup(review.backup,review.snapshot,{choices:review.choices,restoreProfile:review.restoreProfile});
    }catch(error){if(accounts.state.status==='ready')message(error.message||'Could not restore this backup.',true)}
    finally{working(false);updateBackupRestoreButton()}
  };
  for(const page of ['backup','import']){const button=document.querySelector(`#s-setup [onclick="openSettingsPage('${page}')"]`);button.disabled=false;button.removeAttribute('title');}
  if(native){
    const button=document.createElement('button');button.id='mobile-backup-choose';button.className='settings-export-btn';button.textContent='Choose backup from Files';button.onclick=()=>preview(()=>vault.importBackup());
    $('backup-file').hidden=true;$('backup-file').before(button);document.querySelector('label[for="backup-file"]').removeAttribute('for');
    $('backup-download').textContent='Save backup to Files (.json)';
  }
  return {get busy(){return busy}};
}
