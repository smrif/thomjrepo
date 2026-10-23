import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),device=process.argv[2],execute=promisify(execFile);
const scenario=process.argv[3]||'all',scenarios={all:[],cancellation:['-only-testing:NativeExportQA/NativeExportQATests/testSystemSheetCancellation'],'local-backup':['-only-testing:NativeExportQA/NativeExportQATests/testLocalBackupRoundTrip']};
if(!Object.hasOwn(scenarios,scenario))throw Error('Choose all, cancellation or local-backup.');
if(!/^[0-9a-f-]{36}$/i.test(device||''))throw Error('Pass the UUID of a booted, dedicated iOS simulator. Physical devices are not supported by this runner.');
const devices=JSON.parse((await execute('xcrun',['simctl','list','devices','available','--json'],{timeout:30000,maxBuffer:4*1024*1024})).stdout).devices;
if(!Object.entries(devices).some(([runtime,list])=>runtime.includes('.iOS-')&&list.some(item=>item.udid===device&&item.state==='Booted'&&item.isAvailable)))throw Error('Use a booted, available iOS simulator for synthetic UI QA.');
const evidence=join(root,'.build/ios-files-ui-probe.json');await mkdir(join(root,'.build'),{recursive:true});await rm(evidence,{force:true});
const directory=await mkdtemp(join(tmpdir(),'whose-day-files-ui-')),resultBundle=join(directory,'result.xcresult');
const derived=join(tmpdir(),'whose-day-files-ui-'+createHash('sha256').update(root).digest('hex').slice(0,10));
function run(command,args,timeout=120000){return new Promise((done,reject)=>{
 const child=spawn(command,args,{cwd:root,stdio:['ignore','pipe','pipe']});let timedOut=false,failed=false,stop,failureStop,tail='';
 const output=(stream,chunk)=>{stream.write(chunk);tail=(tail+chunk.toString()).slice(-4000);if(!failureStop&&/Test (?:Case|Suite) [^\n]+ failed/.test(tail)){failed=true;failureStop=setTimeout(()=>child.kill('SIGTERM'),30000)}};
 child.stdout.on('data',chunk=>output(process.stdout,chunk));child.stderr.on('data',chunk=>output(process.stderr,chunk));
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');stop=setTimeout(()=>child.kill('SIGKILL'),5000)},timeout);
 child.once('error',error=>{clearTimeout(timer);clearTimeout(stop);clearTimeout(failureStop);reject(error)});
 child.once('exit',code=>{clearTimeout(timer);clearTimeout(stop);clearTimeout(failureStop);if(code===0&&!timedOut&&!failed)done();else reject(Error(timedOut?'Native UI QA timed out.':failed?'Native UI QA contains a failed test.':'Native UI QA step failed ('+code+').'))});
})}
try{
 await run(process.execPath,['scripts/build.mjs']);await run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','ios']);
 const webAssetsSha256=createHash('sha256').update(await readFile(join(root,'ios/App/App/public/account/account-runtime.js'))).digest('hex');
 const testSourceSha256=createHash('sha256').update(await readFile(join(root,'ios/App/NativeExportQA/NativeExportQATests.swift'))).digest('hex');
 await run('xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','NativeExportQA','-configuration','Debug','-sdk','iphonesimulator','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',derived,...(process.env.WHOSE_DAY_IOS_PACKAGES?['-clonedSourcePackagesDirPath',process.env.WHOSE_DAY_IOS_PACKAGES]:[]),'-resultBundlePath',resultBundle,'-parallel-testing-enabled','NO',...scenarios[scenario],'test'],480000);
 const attachments=join(root,'.build/ios-files-ui',basename(directory));await mkdir(join(root,'.build/ios-files-ui'),{recursive:true});
 await run('xcrun',['xcresulttool','export','attachments','--path',resultBundle,'--output-path',attachments,'--filter','*.png']);
 await writeFile(evidence,JSON.stringify({passed:true,scenario,device,resultBundle,attachments,webAssetsSha256,testSourceSha256,at:new Date().toISOString(),syntheticOnly:true,recipientsContacted:false},null,2));
 console.log('Native system-sheet UI QA passed. Evidence: '+evidence);
}catch(error){await writeFile(evidence,JSON.stringify({passed:false,scenario,device,resultBundle,error:error.message,at:new Date().toISOString()},null,2));throw error}
