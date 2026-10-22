import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {root,adb,environment} from './android-env.mjs';
const execute=promisify(execFile),device=process.argv[2],id='com.whoseday.feasibility';
if(!/^emulator-\d+$/.test(device||''))throw new Error('Pass the serial of a running Android emulator. Physical Android devices require a separate test workflow.');
const run=async(command,args,options={})=>(await execute(command,args,{env:environment,encoding:'utf8',timeout:60000,maxBuffer:10*1024*1024,...options})).stdout;
const android=(...args)=>run(adb,['-s',device,...args]);
const evidence=join(root,'.build/android-probe.json'),database=join(root,'.build/android-probe.sqlite');
await mkdir(join(root,'.build'),{recursive:true});
await rm(evidence,{force:true});
async function marker(mode) {
  try {
    const bytes=await run(adb,['-s',device,'exec-out','run-as',id,'cat','databases/whose-day-lab.sqlite'],{encoding:null,timeout:5000});
    await writeFile(database,bytes);
    return (await run('sqlite3',[database,"SELECT value FROM records WHERE key='probe:"+mode+"'"],{timeout:3000})).trim();
  } catch {return ''}
}
await android('get-state');
if((await android('shell','getprop','sys.boot_completed')).trim()!=='1')throw new Error('Wait for Android to finish booting before running the native probe.');
if(!process.argv.includes('--installed')){
  console.log('Installing lab debug APK…');
  const {apkPath}=JSON.parse(await readFile(join(root,'.build/android-build.json'),'utf8'));
  await android('install','-r',apkPath);
}
const session=Date.now(),results=[];
for(const mode of ['write','read']) {
  console.log('Starting native '+mode+' probe…');
  // Compare markers across a new process; do not assume guest and host clocks match.
  await android('shell','am','force-stop',id);
  const previous=await marker(mode);
  await android('shell','am','start','-W','-n',id+'/.MainActivity','--es','labProbe',mode);
  let result;
  const deadline=Date.now()+180000;
  while(Date.now()<deadline) {
    try {
      const raw=await marker(mode);
      if(raw&&raw!==previous){result=JSON.parse(raw);break}
    } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!result?.passed)throw new Error('Native '+mode+' probe failed: '+(result?.error||'No fresh success marker.'));
  const pdfPath=new URL(result.pdf).pathname;
  if(!pdfPath.startsWith('/data/user/0/'+id+'/cache/lab-reports/')&&!pdfPath.startsWith('/data/data/'+id+'/cache/lab-reports/'))throw new Error('Unexpected native PDF location');
  if(!/^Whose-Day-test-[A-Za-z0-9-]+\.pdf$/.test(pdfPath.split('/').at(-1)))throw new Error('Unexpected native PDF name');
  const pdf=await run(adb,['-s',device,'exec-out','run-as',id,'cat',pdfPath],{encoding:null});
  if(pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('Native PDF header is invalid');
  const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  if(pages<2)throw new Error('Long native report did not paginate');
  results.push({mode,passed:true,attachmentBytes:result.attachmentBytes,pdfBytes:pdf.length,pdfPages:pages});
}
await writeFile(evidence,JSON.stringify({device,startedAt:new Date(session).toISOString(),results},null,2));
console.log(JSON.stringify(results,null,2));
console.log('Native SQLite record/image and Android Keystore-backed secret survived process termination; secret removal and multipage PDFs passed. Photo/share UI and email handoff remain separate checks.');
