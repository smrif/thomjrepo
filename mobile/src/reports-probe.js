import {portable} from './backup-domain.js';import {reportFixture,reportProfile} from './report-fixture.js';import {REPORT_TYPES} from './report-files.js';
export async function runReportsProbe({accounts,vault,mode}){
 try{
  if(mode==='reports-write'){
    const state=accounts.backupSnapshot(),backup=await portable.create({...state,config:{...state.config,...reportProfile},records:reportFixture()}),plan=portable.plan(backup,state);
    const choices=Object.fromEntries(plan.conflicts.filter(c=>!c.locked).map(c=>[c.date,'backup']));
    await accounts.restoreBackup(backup,state.snapshot,{choices,restoreProfile:true});
    await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:true,fixtureStored:true,at:new Date().toISOString()})});document.getElementById('file-restore-title').textContent='Synthetic report fixture ready';return;
  }
  showExport();setReportFilter('30');const pdfs=[];
  for(const type of REPORT_TYPES){
    selectExport(type);const report=reportDocument();
    if(!report.text.includes('Signature:')||report.text.includes('OUTSIDE PERIOD')||report.text.includes('FUTURE RECORD'))throw Error('Report selection or document parity failed.');
    const file=await vault.makeReport({text:report.text,attestation:report.attestation,name:'whose-day-report-'+todayStr()+'-'+type+'.pdf',scope:accounts.state.account.scope});
    pdfs.push({type,uri:file.uri,text:report.text});
  }
  const csv=allDataCsv();if(!csv.text.includes('END-LONG-NOTE')||!csv.text.includes('data:image/png;base64,'))throw Error('CSV did not include full notes and images.');
  const file=await vault.makeTextFile({text:csv.text,name:'whose-day-records-'+todayStr()+'.csv',scope:accounts.state.account.scope});
  await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:true,pdfs,csv:{uri:file.uri,text:csv.text},at:new Date().toISOString()})});
  document.getElementById('mobile-report-status').textContent='Synthetic reports ready for QA.';
 }catch(error){await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:false,error:error.message||'Reports probe failed.'})})}
}
