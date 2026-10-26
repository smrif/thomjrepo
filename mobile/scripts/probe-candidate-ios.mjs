import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {digest,verifyNativeWeb,verifyReleaseBinary,nativeBuildArgs,candidateScreenshots} from './candidate-ios.mjs';
const execute=promisify(execFile),root=resolve(import.meta.dirname,'..'),reference=process.argv[2];
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/i.test(reference||''))throw Error('Pass a dedicated Whose Day simulator UUID as the runtime/device-type reference.');
const evidencePath=join(root,'.build/ios-candidate-ui.json'),candidate=JSON.parse(await readFile(join(root,'.build/ios-candidate-simulator.json'),'utf8'));
if(!candidate.passed||candidate.mode!=='simulator'||candidate.authConfigured!==false||candidate.web?.authConfigured!==false||candidate.readyForRelease!==false||candidate.productionAuthAllowed!==false)throw Error('First build the unconfigured candidate simulator app. Provider/account QA is a separate approved flow.');
await verifyNativeWeb(join(candidate.appPath,'public'),candidate.web);
if(verifyReleaseBinary(await readFile(join(candidate.appPath,'App'))).sha256!==candidate.executable.sha256)throw Error('Rebuild the changed candidate executable before QA.');
const sim=async(...args)=>(await execute('xcrun',['simctl',...args],{timeout:120000,maxBuffer:4*1024*1024})).stdout.trim();
const devices=JSON.parse(await sim('list','devices','available','--json')).devices;
const pair=Object.entries(devices).find(([runtime,list])=>runtime.includes('.iOS-')&&list.some(device=>device.udid===reference));
const source=pair?.[1].find(device=>device.udid===reference);
if(!source||!/^Whose Day/.test(source.name)||!source.deviceTypeIdentifier||!['Booted','Shutdown'].includes(source.state))throw Error('Use an available, dedicated Whose Day simulator, not a physical or personal device.');
const lock=join(root,'.build/candidate-native.lock');
try{await mkdir(lock)}catch(e){if(e.code==='EEXIST')throw Error('Another native candidate operation owns the lock.');throw e}
let device,sourceStopped=false,result,error,resultBundle,attachments,cleanupErrors=[];
const started=new Date().toISOString();
try{
  const directory=await mkdtemp(join(tmpdir(),'whose-day-candidate-ui-'));resultBundle=join(directory,'result.xcresult');attachments=join(directory,'screenshots');
  await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,mode:'candidate-ui',started}));
  await writeFile(evidencePath,JSON.stringify({passed:false,status:'running',started,resultBundle},null,2));
  // A fresh device prevents the candidate's installed app from replacing any
  // existing test identity/container. Temporarily stop only the explicitly named
  // dedicated reference simulator to limit memory use; restore its boot state.
  if(source.state==='Booted'){await sim('shutdown',reference);sourceStopped=true;}
  device=await sim('create','Whose Day Candidate QA '+Date.now(),source.deviceTypeIdentifier,pair[0]);
  await sim('boot',device);await sim('bootstatus',device,'-b');
  const staged=candidate.projectRoot;
  // QA source can evolve independently of the application. The copied app
  // source, web resources and auth settings remain the verified candidate.
  await copyFile(join(root,'ios/App/NativeExportQA/NativeExportQATests.swift'),join(staged,'ios/App/NativeExportQA/NativeExportQATests.swift'));
  const args=nativeBuildArgs('simulator',{derived:candidate.derived,arch:process.arch==='arm64'?'arm64':'x86_64',packages:process.env.WHOSE_DAY_IOS_PACKAGES});
  args[args.indexOf('-scheme')+1]='NativeExportQA';args[args.indexOf('-destination')+1]='platform=iOS Simulator,id='+device;
  await new Promise((done,reject)=>{
    const child=spawn('xcodebuild',[...args,'-resultBundlePath',resultBundle,'-parallel-testing-enabled','NO','-only-testing:NativeExportQA/NativeExportQATests/testCandidateSignedOutEntry','test'],{cwd:staged,stdio:'inherit'});let expired=false,stop;
    const timer=setTimeout(()=>{expired=true;child.kill('SIGTERM');stop=setTimeout(()=>child.kill('SIGKILL'),5000)},480000);
    child.once('error',e=>{clearTimeout(timer);clearTimeout(stop);reject(e)});child.once('exit',code=>{clearTimeout(timer);clearTimeout(stop);code===0&&!expired?done():reject(Error(expired?'Candidate native UI QA timed out.':'Candidate native UI QA failed.'))});
  });
  await execute('xcrun',['xcresulttool','export','attachments','--path',resultBundle,'--output-path',attachments,'--filter','*.png'],{timeout:60000,maxBuffer:4*1024*1024});
  const screenshots=candidateScreenshots(JSON.parse(await readFile(join(attachments,'manifest.json'),'utf8')));
  for(const image of screenshots)image.sha256=digest(await readFile(join(attachments,image.file)));
  await verifyNativeWeb(join(candidate.appPath,'public'),candidate.web);
  const executable=verifyReleaseBinary(await readFile(join(candidate.appPath,'App')));
  // Xcode test may refresh ad-hoc signing. Record the current inspected binary
  // while retaining its original build hash for traceability.
  const current={...candidate,executable,originalExecutableSha256:candidate.executable.sha256,verifiedAfterQA:new Date().toISOString()};
  await writeFile(join(root,'.build/ios-candidate-simulator.json'),JSON.stringify(current,null,2)+'\n');
  result={passed:true,started,at:new Date().toISOString(),device,reference,resultBundle,attachments,screenshots,appPath:candidate.appPath,webManifestSha256:candidate.webManifestSha256,executable,freshSimulator:true,authConfigured:false,recipientsContacted:false,limits:['Unconfigured signed-out native candidate only; verified auth, product records, device/provider and archive signing QA remain gated.']};
}catch(e){error=e;result={passed:false,started,at:new Date().toISOString(),device,reference,resultBundle,error:e.message}}
finally{
  if(device){try{await sim('shutdown',device)}catch{}try{await sim('delete',device)}catch(e){cleanupErrors.push('Fresh simulator cleanup: '+e.message)}}
  if(sourceStopped){try{await sim('boot',reference);await sim('bootstatus',reference,'-b')}catch(e){cleanupErrors.push('Restore reference simulator: '+e.message)}}
  result={...result,referenceBootStateRestored:cleanupErrors.length===0,cleanupErrors};
  if(cleanupErrors.length)result.passed=false;
  try{await writeFile(evidencePath,JSON.stringify(result,null,2)+'\n')}finally{await rm(lock,{recursive:true,force:true});}
}
if(error)throw error;if(cleanupErrors.length)throw Error('Candidate QA cleanup needs attention: '+cleanupErrors.join('; '));
console.log('Fresh Release simulator candidate QA passed: welcome/policies, cold reopen and ignored lab launch arguments. Original simulator boot state restored.');
