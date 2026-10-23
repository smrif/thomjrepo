import {fingerprint} from './sync-store.js';
import {portable} from './backup-domain.js';
import {Camera} from '@capacitor/camera';
const note='Synthetic photo-picker QA. No personal information.';
function status(screen,text){
  let element=document.getElementById('photo-qa-status');
  if(!element){element=document.createElement('p');element.id='photo-qa-status';element.setAttribute('role','status');element.className='checkin-local-note';}
  element.textContent=text;document.getElementById(screen).append(element);
}
// Reached only through DEBUG simulator launch modes; its account/project and
// synthetic Keychain identity are separate from normal signed-in records.
export async function runPhotoProbe({accounts,vault,mode}){
  const fail=async error=>{await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:false,error:error.message})});status('s-home','Synthetic photo QA failed.');};
  try{
    const day=todayStr();
    if(mode==='photo-write'){
      window.WhoseDayPlatform.attachmentError=error=>{
        const detail={code:error?.code||'',message:error?.message||'Photo selection failed.'};
        vault.write({key:'probe:photo-error',value:JSON.stringify(detail)}).catch(()=>{});
        status('s-diary','Synthetic photo error: '+detail.code+' '+detail.message);
      };
      await vault.write({key:'probe:photo-saved',value:'null'});
      await vault.write({key:'probe:photo-read',value:'null'});
      await vault.write({key:'probe:photo-error',value:'null'});
      const snapshot=accounts.state.records.snapshot();
      snapshot[day]={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Alex','Sam'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:note,attachment:null,changeAgreed:null,changePressured:null,loggedAt:new Date().toISOString()};
      await accounts.state.records.commit(snapshot);
      accounts.state.records.subscribe(kind=>{
        if(kind!=='local')return;
        (async()=>{
          const entry=accounts.state.records.snapshot()[day];
          if(!entry.attachment)return;
          if(entry.diary!==note)throw Error('The photo selection changed the diary.');
          await vault.write({key:'probe:photo-saved',value:JSON.stringify({day,entryHash:await fingerprint(entry),imageHash:await fingerprint(entry.attachment.dataUrl)})});
          status('s-saved','Synthetic photo save checkpoint ready.');
        })().catch(fail);
      });
      initHome();await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:true,fixtureStored:true,day})});
      status('s-home','Synthetic photo fixture ready.');return;
    }
    const {value}=await vault.read({key:'probe:photo-saved'}),saved=JSON.parse(value||'null');
    const state=accounts.backupSnapshot(),entry=state.records[day],checkpoint=accounts.state.records.syncItems()[day];
    const permissions=await Camera.checkPermissions();if(permissions.photos!=='denied')throw Error('Photo QA must run with photo-library access denied.');
    if(!saved||saved.day!==day||entry?.diary!==note||!entry.attachment||await fingerprint(entry)!==saved.entryHash||await fingerprint(entry.attachment.dataUrl)!==saved.imageHash||await fingerprint(checkpoint.value)!==saved.entryHash)throw Error('Selected photo or record changed after cold reopen.');
    const backup=await portable.create(state),csv=allDataCsv();
    if(backup.entries[day].attachment.dataUrl!==entry.attachment.dataUrl||!csv.text.includes(entry.attachment.dataUrl))throw Error('Export did not retain the complete selected photo.');
    startTodayEdit();prepareEditTarget('s-diary');
    await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:true,day,photoPermission:permissions.photos,entryHash:saved.entryHash,imageHash:saved.imageHash,imageType:entry.attachment.type,dataUrlLength:entry.attachment.dataUrl.length,noteRecovered:true,pendingCheckpointRecovered:true,backupImageRetained:true,csvImageRetained:true,at:new Date().toISOString()})});
    status('s-diary','Synthetic photo cold-reopen verified.');
  }catch(error){await fail(error);}
}
