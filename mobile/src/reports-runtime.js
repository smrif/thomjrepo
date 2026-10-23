import {Share} from '@capacitor/share';
import {reportFiles,REPORT_TYPES,checkedText,CSV_LIMIT} from './report-files.js';
const $=id=>document.getElementById(id);
export function mountReports({accounts,vault,native,applyProfile}){
  let busy=false,preview=null;
  const original={show:window.showExport,select:window.selectExport,filter:window.setReportFilter,print:window.printReport};
  const status=document.createElement('p');status.id='mobile-report-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('export-preview-section').append(status);
  const csvStatus=document.createElement('p');csvStatus.id='mobile-csv-status';csvStatus.setAttribute('role','status');csvStatus.setAttribute('aria-live','polite');document.querySelector('[data-settings-page="export"]').append(csvStatus);
  function message(text,error=false,csv=false){const el=csv?csvStatus:status;el.textContent=text;el.setAttribute('role',error?'alert':'status');}
  const current=()=>JSON.stringify([accounts.backupSnapshot().snapshot,currentExportType,REPORT_FILTER,currentReportText]);
  function capture(){return {expected:current(),owner:accounts.state.account.scope,report:reportDocument(),text:currentReportText,type:currentExportType};}
  async function action(operation,{csv=false}={}){
    if(busy)return;const owner=accounts.state.account?.scope;busy=true;
    for(const id of ['app','shell-header','shell-tabs'])$(id).inert=true;$('app').setAttribute('aria-busy','true');message('Preparing your export…',false,csv);
    try{await operation();}catch(error){if(accounts.state.account?.scope===owner)message(error.message||'Could not finish this export. Your records are kept.',true,csv)}
    finally{busy=false;for(const id of ['app','shell-header','shell-tabs'])$(id).inert=false;$('app').setAttribute('aria-busy','false');}
  }
  const files=reportFiles({current,transport:{
    pdf:options=>vault.makeReport(options),csv:options=>vault.makeTextFile(options),save:(uri,name)=>vault.saveExport({uri,name}),
    share:async(uri,name)=>{try{const result=await Share.share({title:name,files:[uri],dialogTitle:'Share Whose Day report'});return{shared:true,activityType:result.activityType||''}}catch(error){if(/cancel|dismiss|not shared/i.test(error?.message||''))return{cancelled:true};throw Error('Could not open or finish sharing. Your prepared file was not confirmed as delivered.');}},
    copy:text=>native?vault.copyText({text}):navigator.clipboard.writeText(text)
  }});
  window.showExport=()=>{
    if(busy)return;const config=accounts.applyProfile();applyProfile(config);accounts.backupSnapshot();preview=null;status.textContent='';original.show();for(const card of document.querySelectorAll('.export-card'))card.setAttribute('aria-pressed','false');
  };
  window.selectExport=type=>{if(busy||!REPORT_TYPES.includes(type))return;original.select(type);for(const card of document.querySelectorAll('.export-card'))card.setAttribute('aria-pressed',String(card.id==='exp-'+type));preview=capture();status.textContent='';};
  window.setReportFilter=range=>{if(busy||!['all','30','60','90'].includes(range))return;original.filter(range);for(const button of document.querySelectorAll('.report-pill'))button.setAttribute('aria-pressed',String(button.classList.contains('active')));};
  function reviewed(){
    if(!preview||!currentExportType)throw Error('Choose a report first.');
    if(current()!==preview.expected){window.selectExport(currentExportType);throw Error('Your saved data changed. Review the refreshed preview before exporting.');}
    return preview;
  }
  const reportName=type=>'whose-day-report-'+todayStr()+'-'+type+'.pdf';
  window.printReport=()=>action(async()=>{
    const selected=reviewed();
    if(!native){original.print();message('Print / PDF dialog requested. Confirm the file in your chosen destination.');return;}
    const result=await files.pdf({expected:selected.expected,text:selected.report.text,attestation:selected.report.attestation,name:reportName(selected.type),scope:selected.owner});
    message(result.cancelled?'PDF save cancelled.':'PDF saved to the location you chose.');
  });
  window.shareReport=()=>action(async()=>{
    const selected=reviewed();if(!native){message('Use Print / Save PDF or Copy in this browser preview. The native app opens the system share sheet.');return;}
    const result=await files.pdf({expected:selected.expected,text:selected.report.text,attestation:selected.report.attestation,name:reportName(selected.type),scope:selected.owner,share:true});
    message(result.cancelled?'Sharing cancelled.':'Share sheet closed. Check the receiving app for the file.');
  });
  window.copyReport=()=>action(async()=>{const selected=reviewed();await files.copy({expected:selected.expected,text:selected.text});message('Report copied.');});
  function csvDownload(data){const url=URL.createObjectURL(new Blob([data.text],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=data.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  async function csvExport(share){
    const config=accounts.applyProfile();applyProfile(config);accounts.backupSnapshot();const expected=current(),owner=accounts.state.account.scope,data=allDataCsv();data.name='whose-day-records-'+todayStr()+'.csv';
    checkedText(data.text,CSV_LIMIT,'This CSV export');
    if(!native){csvDownload(data);message('CSV download requested. CSV is not a restorable backup.',false,true);return;}
    const result=await files.csv({expected,...data,scope:owner,share});message(result.cancelled?'CSV export cancelled.':share?'Share sheet closed. Check the receiving app for the CSV.':'CSV saved to the location you chose.',false,true);
  }
  window.exportAllData=()=>action(()=>csvExport(false),{csv:true});
  const csvButton=document.querySelector('[data-settings-page="export"] [onclick="exportAllData()"]');csvButton.textContent=native?'Save CSV to Files':'Download CSV';
  const shareCsv=document.createElement('button');shareCsv.id='mobile-share-csv';shareCsv.className='settings-export-btn';shareCsv.textContent='Share CSV';shareCsv.onclick=()=>action(()=>csvExport(true),{csv:true});shareCsv.hidden=!native;csvButton.after(shareCsv);
  document.querySelector('.report-print-btn').textContent=native?'Save PDF':'Print / Save PDF';
  document.querySelector('[onclick="shareReport()"]').textContent='Share PDF';
  window.sendWeeklyEmail=()=>window.showExport();
  document.querySelector('#sunday-prompt .btn').textContent='Review reports';
  document.querySelector('#weekly-report-row .section-title').textContent='Reports';
  document.querySelector('#weekly-report-row .section-sub').textContent='Review saved records and choose an export.';
  document.querySelector('#weekly-report-row button').textContent='Review reports ›';
  for(const el of document.querySelectorAll('[data-shell-tab="s-export"],#s-saved [onclick="showExport()"],#weekly-report-row button,#sunday-prompt button')){el.disabled=false;el.removeAttribute('title');}
  const exportSettings=document.querySelector(`[onclick="openSettingsPage('export')"]`);exportSettings.disabled=false;exportSettings.removeAttribute('title');
  for(const card of document.querySelectorAll('.export-card')){card.setAttribute('role','button');card.setAttribute('aria-pressed','false');card.tabIndex=0;card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();card.click()}});}
  for(const button of document.querySelectorAll('.report-pill'))button.setAttribute('aria-pressed',String(button.classList.contains('active')));
  return{get busy(){return busy}};
}
