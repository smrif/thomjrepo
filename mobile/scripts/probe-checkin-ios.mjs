import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const execute=promisify(execFile),root=resolve(import.meta.dirname,'..'),device=process.argv[2],id='com.whoseday.feasibility';
if(!device)throw new Error('Pass a booted simulator UUID.');
const run=async(command,args)=>(await execute(command,args,{encoding:'utf8',timeout:60000,maxBuffer:1024*1024})).stdout.trim();
const sim=(...args)=>run('xcrun',['simctl',...args]);
await sim('bootstatus',device,'-b');
if(!process.argv.includes('--installed')){const {appPath}=JSON.parse(await readFile(join(root,'.build/ios-build.json'),'utf8'));await sim('install',device,appPath)}
const container=await sim('get_app_container',device,id,'data'),database=join(container,'Library/Application Support/WhoseDayLab/records.sqlite'),results=[];
for(const mode of ['checkin-write','checkin-read']){
  // Only remove the marker belonging to this explicit synthetic integration test.
  try{await run('sqlite3',[database,"DELETE FROM records WHERE key='probe:"+mode+"'"])}catch{}
  console.log('Starting shared product '+mode+' probe…');
  try{await sim('launch','--terminate-running-process',device,id,'--lab-'+mode)}catch(error){if(!error.killed)throw error;console.log('Launch reply timed out; checking database evidence.')}
  let result;
  for(let i=0;i<100;i++){
    try{const raw=await run('sqlite3',[database,"SELECT value FROM records WHERE key='probe:"+mode+"'"]);if(raw){result=JSON.parse(raw);break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!result?.passed)throw new Error('Product '+mode+' failed: '+JSON.stringify(result||'No fresh evidence.'));
  results.push({mode,...result});
}
await mkdir(join(root,'.build'),{recursive:true});await writeFile(join(root,'.build/ios-checkin-probe.json'),JSON.stringify({device,results},null,2));
console.log(JSON.stringify(results,null,2));
console.log('Shared Today/check-in/save/edit flow recovered full record and attachment after iOS process termination. No network used.');
