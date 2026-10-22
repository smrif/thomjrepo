import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),device=process.argv[2];
if(!device)throw new Error('Pass the UUID of a booted simulator.');
const run=async(command,args)=>(await execute(command,args,{encoding:'utf8',timeout:60000})).stdout.trim();
const sim=(...args)=>run('xcrun',['simctl',...args]);
const id='com.whoseday.feasibility';
console.log('Waiting for simulator readiness…');
await sim('bootstatus',device,'-b');
if(!process.argv.includes('--installed')) {
  console.log('Installing lab app…');
  const {appPath}=JSON.parse(await readFile(join(root,'.build/ios-build.json'),'utf8'));
  await sim('install',device,appPath);
}
const container=await sim('get_app_container',device,id,'data'),database=join(container,'Library/Application Support/WhoseDayLab/records.sqlite');
const results=[];
for(const mode of ['write','read']){
  // A sentinel prevents a stale successful result being mistaken for this launch.
  try{await run('sqlite3',[database,"DELETE FROM records WHERE key='probe:"+mode+"'"])}catch{}
  console.log('Starting native '+mode+' probe…');
  try { await sim('launch','--terminate-running-process',device,id,'--lab-probe-'+mode); }
  catch(error) { if(!error.killed)throw error; console.log('Simulator launch response timed out; checking native evidence.'); }
  let result;
  for(let attempt=0;attempt<100;attempt++){
    try{const raw=await run('sqlite3',[database,"SELECT value FROM records WHERE key='probe:"+mode+"'"]);if(raw){result=JSON.parse(raw);break}}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!result?.passed)throw new Error('Native '+mode+' probe failed: '+JSON.stringify(result||'timed out'));
  const pdf=await readFile(new URL(result.pdf));
  if(pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('Native PDF header is invalid');
  const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  if(pages<2)throw new Error('Long report did not paginate');
  results.push({mode,passed:true,attachmentBytes:result.attachmentBytes,pdfBytes:pdf.length,pdfPages:pages});
}
await mkdir(join(root,'.build'),{recursive:true});await writeFile(join(root,'.build/ios-probe.json'),JSON.stringify({device,results},null,2));
console.log(JSON.stringify(results,null,2));
console.log('Native SQLite record/image and Keychain survived process termination; deletion and multipage PDF checks passed. No network used by probes.');
