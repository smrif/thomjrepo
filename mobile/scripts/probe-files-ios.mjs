import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {fingerprint} from '../src/sync-store.js';
const root=resolve(import.meta.dirname,'..'),device=process.argv[2],execute=promisify(execFile);
const scenario=process.argv[3]||'all',scenarios={all:[],onboarding:['-only-testing:NativeExportQA/NativeExportQATests/testOnboardingColdReopen'],cancellation:['-only-testing:NativeExportQA/NativeExportQATests/testSystemSheetCancellation'],'local-backup':['-only-testing:NativeExportQA/NativeExportQATests/testLocalBackupRoundTrip'],photo:['-only-testing:NativeExportQA/NativeExportQATests/testPhotoAttachmentColdReopen']};
if(!Object.hasOwn(scenarios,scenario))throw Error('Choose all, cancellation, local-backup, photo or onboarding.');
const includePhoto=['all','photo'].includes(scenario);
if(!/^[0-9a-f-]{36}$/i.test(device||''))throw Error('Pass the UUID of a booted, dedicated iOS simulator. Physical devices are not supported by this runner.');
const devices=JSON.parse((await execute('xcrun',['simctl','list','devices','available','--json'],{timeout:30000,maxBuffer:4*1024*1024})).stdout).devices;
if(!Object.entries(devices).some(([runtime,list])=>runtime.includes('.iOS-')&&list.some(item=>item.udid===device&&item.state==='Booted'&&item.isAvailable)))throw Error('Use a booted, available iOS simulator for synthetic UI QA.');
const evidence=join(root,scenario==='onboarding'?'.build/ios-onboarding-ui-probe.json':'.build/ios-files-ui-probe.json');await mkdir(join(root,'.build'),{recursive:true});await rm(evidence,{force:true});
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
 const fixture=join(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
 if(includePhoto){await run('xcrun',['simctl','addmedia',device,fixture]);await run('xcrun',['simctl','privacy',device,'revoke','photos','com.whoseday.feasibility']);}
 await run(process.execPath,['scripts/build.mjs']);await run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','ios']);
 const webAssetsSha256=createHash('sha256').update(await readFile(join(root,'ios/App/App/public/account/account-runtime.js'))).digest('hex');
 const testSourceSha256=createHash('sha256').update(await readFile(join(root,'ios/App/NativeExportQA/NativeExportQATests.swift'))).digest('hex');
 const nativeSourceSha256=createHash('sha256').update(await readFile(join(root,'ios/App/App/WhoseDayVault.swift'))).digest('hex');
 await run('xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','NativeExportQA','-configuration','Debug','-sdk','iphonesimulator','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',derived,...(process.env.WHOSE_DAY_IOS_PACKAGES?['-clonedSourcePackagesDirPath',process.env.WHOSE_DAY_IOS_PACKAGES]:[]),'-resultBundlePath',resultBundle,'-parallel-testing-enabled','NO',...scenarios[scenario],'test'],scenario==='all'?720000:480000);
 const attachments=join(root,'.build/ios-files-ui',basename(directory));await mkdir(join(root,'.build/ios-files-ui'),{recursive:true});
 await run('xcrun',['xcresulttool','export','attachments','--path',resultBundle,'--output-path',attachments,'--filter','*.png']);
 let photo,onboarding;
 if(['all','onboarding'].includes(scenario)){
   const container=(await execute('xcrun',['simctl','get_app_container',device,'com.whoseday.feasibility','data'],{timeout:30000})).stdout.trim(),database=join(container,'Library/Application Support/WhoseDayLab/records.sqlite');
   const query=async sql=>(await execute('sqlite3',[database,sql],{timeout:30000,maxBuffer:1024*1024})).stdout.trim();
   const marker=JSON.parse(await query("SELECT value FROM records WHERE key='probe:onboarding-ui-ready'"));
   if(!marker?.passed||!/^account-v1-sim-onboard-ui-[a-f0-9]{8}-11111111-1111-4111-8111-111111111111$/.test(marker.scope))throw Error('Missing fresh native onboarding evidence.');
   const profile=JSON.parse(await query("SELECT value FROM records WHERE key='profile:v1:"+marker.scope+"'"));
   const receipts=JSON.parse(await query("SELECT json_group_array(json(value)) FROM records WHERE key LIKE 'policy-receipt:v1:"+marker.scope+":%'"));
   if(profile.config.currentParentLabel!=='Native Onboarding Parent'||profile.config.children.join(',')!=='Avery,Sam'||receipts.length!==1||receipts[0].userId!==marker.userId||receipts[0].source!=='mobile-test')throw Error('Native onboarding profile/receipt readback mismatch.');
   onboarding={...marker,profileRecovered:true,receipt:receipts[0],verification:'synthetic-no-email'};
 }
 if(includePhoto){
   const container=(await execute('xcrun',['simctl','get_app_container',device,'com.whoseday.feasibility','data'],{timeout:30000})).stdout.trim();
   const database=join(container,'Library/Application Support/WhoseDayLab/records.sqlite');
   const query=async sql=>(await execute('sqlite3',[database,sql],{timeout:30000,maxBuffer:8*1024*1024})).stdout.trim();
   const result=JSON.parse(await query("SELECT value FROM records WHERE key='probe:photo-read'"));
   if(!result?.passed||result.photoPermission!=='denied'||!/^\d{4}-\d{2}-\d{2}$/.test(result.day)||!result.noteRecovered||!result.pendingCheckpointRecovered||!result.backupImageRetained||!result.csvImageRetained)throw Error('Missing verified photo cold-reopen evidence.');
   const row=JSON.parse(await query("SELECT value FROM records WHERE key='checkin:v1:account-v1-sim-photo-probe-11111111-1111-4111-8111-111111111111:"+result.day+"'"));
   if(await fingerprint(row.entry)!==result.entryHash||await fingerprint(row.entry.attachment.dataUrl)!==result.imageHash)throw Error('Persisted photo does not match the UI save checkpoint.');
   const bytes=Buffer.from(row.entry.attachment.dataUrl.split(',')[1],'base64');
   if(bytes.length<1024)throw Error('The selected photo must contain the seeded full-size image.');
   const imagePath=join(attachments,'selected-photo.'+(result.imageType==='image/png'?'png':'jpg'));await writeFile(imagePath,bytes);
   photo={...result,imagePath,imageBytes:bytes.length,fixtureSha256:createHash('sha256').update(await readFile(fixture)).digest('hex')};
 }
 await writeFile(evidence,JSON.stringify({passed:true,scenario,device,resultBundle,attachments,webAssetsSha256,testSourceSha256,nativeSourceSha256,...(photo?{photo}:{}),...(onboarding?{onboarding}:{}),at:new Date().toISOString(),syntheticOnly:true,recipientsContacted:false},null,2));
 console.log('Native system-sheet UI QA passed. Evidence: '+evidence);
}catch(error){await writeFile(evidence,JSON.stringify({passed:false,scenario,device,resultBundle,error:error.message,at:new Date().toISOString()},null,2));throw error}
