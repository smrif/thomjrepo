import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

function replaceOnce(source,pattern,replacement,label){
  const matches=[...source.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))];
  if(matches.length!==1)throw Error('Candidate source boundary changed: '+label);
  return source.replace(pattern,replacement);
}
export function candidateMarkup(account,onboarding){
  account=replaceOnce(account,/<div id="account-preview" hidden>[\s\S]*?<\/div>/,'','sample accounts');
  account=replaceOnce(account,/<section id="account-profile"[\s\S]*?<\/section>/,'','shortcut profile');
  for(const label of ['Open sample check-in','Open native lab'])account=replaceOnce(account,new RegExp('<a href="[^"\\n]+">'+label+'<\\/a>'),'','lab navigation');
  for(const [tag,id] of [['button','account-preview-network'],['a','account-preview-other']])account=replaceOnce(account,new RegExp('<'+tag+'[^>]*id="'+id+'"[^>]*>[\\s\\S]*?<\\/'+tag+'>'),'','preview device controls');
  onboarding=replaceOnce(onboarding,/<div id="onboarding-preview-choice"[^>]*>[\s\S]*?<\/div>/,'','onboarding sample selector');
  return {account,onboarding};
}
export function candidateSharedApp(source){
  source=replaceOnce(source,/function seedJuneDemoData\(\)\{[\s\S]*?\nrenderConfigurableUi\(\);/,"const ONBOARDING_PREVIEW=false;\nrenderConfigurableUi();",'demo and reset routines');
  return replaceOnce(source,/if\(DEMO_MODE==='june'\|\|DEMO_MODE==='july'\)\{recordAppSession\(\);showCal\(\)\}\s*else\{initOnboarding\(\);show\('s-ob-welcome'\)\}/,"initOnboarding();show('s-ob-welcome')",'demo entry');
}
export const candidateGates=[
  'Final app identity, signing, callback and supported-device decisions',
  'Production authentication and registration activation review',
  'Approved live signup, existing-account and deletion QA',
  'Physical-device QA and native candidate archive verification',
  'Privacy, store assets, reviewer access and release approval',
];
// Check the actual payload, not only build flags. Never publish this manifest as
// release approval; this package intentionally remains test-project-only.
export async function candidateManifest(root,{authConfigured=false,policies={}}={}){
  const files={};
  async function walk(dir,prefix=''){
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const relative=prefix+entry.name,path=join(dir,entry.name);
      if(entry.isSymbolicLink())throw Error('Candidate payload contains a symbolic link.');
      if(entry.isDirectory()){await walk(path,relative+'/');continue;}
      if(!entry.isFile()||!(/^(index\.html|entry\.js)$/.test(relative)||relative.startsWith('account/')))throw Error('Unexpected candidate route: '+relative);
      if(relative.startsWith('account/')&&!/^account\/(?:index\.html|account-runtime\.js|app\.js|backup\.js|styles\.css|theme\.css|terms\.html|privacy\.html|shell\.css|shell\.js|checkin\.css|account\.css|assets\/.+)$/.test(relative))throw Error('Unexpected candidate account file: '+relative);
      if(/(?:^|\/)(?:lab(?:\.js|\.css)?|checkin-runtime\.js|config[^/]*\.json)$/.test(relative))throw Error('Developer file in candidate: '+relative);
      const data=await readFile(path),text=data.toString('utf8');
      if(/\.(?:js|html)$/.test(relative))for(const marker of ['seedJuneDemoData','seedJulyDemoData','DEMO_MODE','DEMO_PARAMS','account-preview-a','account-profile-form','onboarding-preview-account','sim-account-probe','sim-photo-probe','probe:onboarding-ui-ready','runAccountProductProbe','runBackupProbe','runReportsProbe','runPhotoProbe','parent-a@example.invalid','parent-b@example.invalid','sync-preview:online','probeBackupFile','vault.testMode(']){
        if(text.includes(marker))throw Error('Developer marker in candidate '+relative+': '+marker);
      }
      files[relative]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
    }
  }
  await walk(root);
  for(const file of ['index.html','entry.js','account/index.html','account/account-runtime.js','account/app.js','account/shell.js'])if(!files[file])throw Error('Missing candidate entry: '+file);
  return {schema:1,profile:'candidate-web-payload',readyForRelease:false,authConfigured,productionAuthAllowed:false,policies:Object.fromEntries(Object.entries(policies).map(([kind,value])=>[kind,value.version])),gates:candidateGates,files};
}
