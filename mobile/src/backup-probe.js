import {portable,parseBackup} from './backup-domain.js';
import {localDay} from './domain.js';
import {equal} from './sync-store.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const restored='Synthetic Files restore 日本語',parent='Native restored parent';
export async function runBackupProbe({vault,accounts,mode}){
  const day=localDay(new Date());
  if(mode==='backup-write'){
    const first=accounts.backupSnapshot();await accounts.updateProfile({currentParentLabel:'Before restore',themeMode:'light'},first.config);
    const snapshot=accounts.state.records.snapshot();snapshot[day]={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Alex','Sam'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Before restore',attachment:null,changeAgreed:null,changePressured:null,loggedAt:new Date().toISOString()};await accounts.state.records.commit(snapshot);
    const current=accounts.backupSnapshot(),file=await portable.create({...current,config:{...current.config,currentParentLabel:parent,themeMode:'dark'},records:{...current.records,[day]:{...current.records[day],diary:restored,attachment:{name:'synthetic.png',type:'image/png',dataUrl:image}}}});
    const {text}=await vault.probeBackupFile({text:JSON.stringify(file)}),parsed=await parseBackup(text);if(!equal(parsed,file))throw Error('Native file round-trip changed the backup.');
    const prefix='probe:backup-atomic:'+crypto.randomUUID(),rows=[{key:prefix+':a',expected:null,value:'first'},{key:prefix+':b',expected:null,value:'second'}];
    let failed=false;try{await vault.compareBatch({rows,probeRollback:true})}catch{failed=true}
    if(!failed||(await vault.read({key:rows[0].key})).value!==null||(await vault.read({key:rows[1].key})).value!==null)throw Error('Interrupted SQLite transaction did not roll back.');
    const held=accounts.state.records;await accounts.restoreBackup(parsed,current.snapshot,{choices:{[day]:'backup'},restoreProfile:true});if(accounts.state.status!=='restore-complete')throw Error('Restore did not complete.');
    let closed=false;try{held.snapshot()}catch{closed=true}if(!closed)throw Error('Old store stayed writable.');
    await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:true,fileRoundTrip:true,sqliteRollback:true,selectedRestore:true,oldStoreRevoked:true,at:new Date().toISOString()})});
  }else{
    const state=accounts.backupSnapshot();if(state.config.currentParentLabel!==parent||state.config.themeMode!=='dark'||state.records[day]?.diary!==restored||state.records[day]?.attachment?.dataUrl!==image)throw Error('Atomic restore did not recover after process termination.');
    if(accounts.state.records.syncItems()[day].sync.baseHash!==null||accounts.state.profile.syncItems().profile.sync.baseHash!==null)throw Error('Restored changes imported sync history.');
    await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:true,restoredProfileRecovered:true,restoredImageRecovered:true,restoredNoteRecovered:true,pendingSyncRecovered:true,at:new Date().toISOString()})});
  }
}
