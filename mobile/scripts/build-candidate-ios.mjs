import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,cp,symlink,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {digest,fileInventory,verifiedWebManifest,verifyNativeWeb,copyNativeSources,nativeBuildArgs,releaseSettings,verifyIdentity,verifyReleaseBinary} from './candidate-ios.mjs';

const root=resolve(import.meta.dirname,'..'),repo=resolve(root,'..'),execute=promisify(execFile);
const modes={'--simulator':'simulator','--archive':'archive'},args=process.argv.slice(2),mode=modes[args[0]];
if(args.length!==1||!mode)throw Error('Usage: build-candidate-ios.mjs --simulator | --archive');
if(process.platform!=='darwin')throw Error('Native candidate builds require macOS and Xcode.');
const output=join(root,'.build');await mkdir(output,{recursive:true});
const lock=join(output,'candidate-native.lock');
try{await mkdir(lock)}catch(e){if(e.code==='EEXIST')throw Error('A candidate native operation already owns .build/candidate-native.lock. Check its owner.json before retrying.');throw e}
const started=new Date().toISOString(),attempt=join(output,'ios-candidate-last-attempt.json');let workspace,protectedBefore;
const protectedPaths=['www','ios/App/App/public','ios/App/App/capacitor.config.json','config.local.json','capacitor.config.json','ios/App/App.xcodeproj/project.pbxproj'];
async function snapshot(){
  const values={};for(const path of protectedPaths){
    try{const data=await readFile(join(root,path));values[path]=digest(data)}catch(e){if(e.code==='EISDIR')values[path]=await fileInventory(join(root,path));else if(e.code==='ENOENT')values[path]=null;else throw e}
  }return values;
}
async function run(command,params,cwd,timeout=900000){
  await new Promise((done,reject)=>{
    const child=spawn(command,params,{cwd,stdio:'inherit'});let expired=false,stop;
    const timer=setTimeout(()=>{expired=true;child.kill('SIGTERM');stop=setTimeout(()=>child.kill('SIGKILL'),5000)},timeout);
    child.once('error',error=>{clearTimeout(timer);clearTimeout(stop);reject(error)});
    child.once('exit',code=>{clearTimeout(timer);clearTimeout(stop);code===0&&!expired?done():reject(Error(expired?'Native candidate step timed out.':'Native candidate step failed ('+code+').'))});
  });
}
async function plist(path){return JSON.parse((await execute('plutil',['-convert','json','-o','-',path],{maxBuffer:1024*1024})).stdout)}
try{
  await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,mode,started}));
  await writeFile(attempt,JSON.stringify({passed:false,status:'running',mode,started},null,2));
  protectedBefore=await snapshot();
  await run(process.execPath,[join(root,'scripts/build.mjs'),'--candidate'],root,120000);
  const webRoot=join(output,'candidate/www'),manifest=await verifiedWebManifest(webRoot,JSON.parse(await readFile(join(output,'candidate/manifest.json'),'utf8')));
  workspace=await mkdtemp(join(tmpdir(),'whose-day-native-candidate-'));
  const staged=join(workspace,'mobile');await mkdir(staged);
  const tracked=(await execute('git',['ls-files','-z','--','mobile/ios/App'],{cwd:repo,maxBuffer:4*1024*1024})).stdout.split('\0').filter(Boolean).map(file=>file.replace(/^mobile\//,''));
  await copyNativeSources(root,staged,tracked);
  await cp(join(root,'package.json'),join(staged,'package.json'));
  await symlink(join(root,'node_modules'),join(staged,'node_modules'),'dir');
  await cp(webRoot,join(staged,'www'),{recursive:true});
  const config=JSON.parse(await readFile(join(root,'capacitor.config.json'),'utf8'));
  if(config.server||config.plugins)throw Error('Review remote hosting or plugin configuration before native candidate packaging.');
  config.webDir='www';await writeFile(join(staged,'capacitor.config.json'),JSON.stringify(config,null,2));
  const sourceInfo=await plist(join(staged,'ios/App/App/Info.plist'));
  // Copy (not sync) uses the committed SPM graph. Only this isolated project is
  // changed; development public/config and the running preview stay untouched.
  await run(process.execPath,[join(root,'node_modules/@capacitor/cli/bin/capacitor'),'copy','ios'],staged,120000);
  const copied=await verifyNativeWeb(join(staged,'ios/App/App/public'),manifest);
  const copiedConfig=await readFile(join(staged,'ios/App/App/capacitor.config.json'));
  const derived=join(workspace,'derived'),archive=join(workspace,'WhoseDay-Candidate.xcarchive');
  const buildArgs=nativeBuildArgs(mode,{derived,archive,packages:process.env.WHOSE_DAY_IOS_PACKAGES,arch:process.arch==='arm64'?'arm64':'x86_64'});
  const settings=releaseSettings(JSON.parse((await execute('xcodebuild',[...buildArgs,'-showBuildSettings','-json'],{cwd:staged,timeout:180000,maxBuffer:8*1024*1024})).stdout),mode);
  await run('xcodebuild',[...buildArgs,mode==='archive'?'archive':'build'],staged);
  const appPath=mode==='archive'?join(archive,'Products/Applications/App.app'):join(derived,'Build/Products/Release-iphonesimulator/App.app');
  const compiled=await verifyNativeWeb(join(appPath,'public'),manifest);
  if(digest(await readFile(join(appPath,'capacitor.config.json')))!==digest(copiedConfig))throw Error('Compiled native configuration differs from staged configuration.');
  const info=await plist(join(appPath,'Info.plist')),identity=verifyIdentity(info,config,sourceInfo,mode);
  const executable=verifyReleaseBinary(await readFile(join(appPath,info.CFBundleExecutable)));
  if(mode==='archive'){
    // Archive metadata contains NSDate values that cannot be converted to JSON.
    // Extract only the exact application path needed for the resource boundary.
    const applicationPath=(await execute('plutil',['-extract','ApplicationProperties.ApplicationPath','raw','-o','-',join(archive,'Info.plist')],{maxBuffer:1024*1024})).stdout.trim();
    if(applicationPath!=='Applications/App.app')throw Error('Unexpected archived application path.');
    // An unsigned inspection archive cannot be installed or submitted as-is.
    try{await execute('codesign',['-dv',appPath],{maxBuffer:1024*1024});throw Error('Expected an unsigned candidate archive.')}catch(e){if(!/not signed at all/.test(e.stderr||''))throw e}
  }
  const protectedAfter=await snapshot();if(JSON.stringify(protectedAfter)!==JSON.stringify(protectedBefore))throw Error('Development assets/configuration changed during candidate build.');
  const evidence={schema:1,passed:true,mode,started,at:new Date().toISOString(),workspace,projectRoot:staged,derived,appPath,...(mode==='archive'?{archivePath:archive}:{}),readyForRelease:false,signing:mode==='archive'?'unsigned-inspection-only':'ad-hoc-simulator-only',productionAuthAllowed:false,authConfigured:manifest.authConfigured,identity,settings,executable,webManifestSha256:digest(await readFile(join(output,'candidate/manifest.json'))),web:manifest,copiedBridge:copied.bridge,compiledBridge:compiled.bridge,nativeConfigSha256:digest(copiedConfig),developmentPreserved:true,gates:manifest.gates};
  await writeFile(join(output,'ios-candidate-'+mode+'.json'),JSON.stringify(evidence,null,2)+'\n');
  await writeFile(attempt,JSON.stringify({passed:true,mode,started,at:evidence.at,evidence:'ios-candidate-'+mode+'.json'},null,2)+'\n');
  console.log('Native candidate '+mode+' verified. Evidence: .build/ios-candidate-'+mode+'.json');
}catch(error){await writeFile(attempt,JSON.stringify({passed:false,mode,started,at:new Date().toISOString(),workspace,error:error.message},null,2)+'\n');throw error}
finally{await rm(lock,{recursive:true,force:true});}
