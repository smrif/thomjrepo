import {createHash} from 'node:crypto';
import {readFile,readdir,mkdir,copyFile,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {candidateManifest} from './candidate-package.mjs';

export const digest=data=>createHash('sha256').update(data).digest('hex');
export async function fileInventory(root,{optional=false}={}){
  const files={};
  async function walk(path,prefix=''){
    for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      if(entry.isSymbolicLink())throw Error('Symbolic link in candidate resources: '+prefix+entry.name);
      if(entry.isDirectory())await walk(join(path,entry.name),prefix+entry.name+'/');
      else if(entry.isFile()){const data=await readFile(join(path,entry.name));files[prefix+entry.name]={bytes:data.length,sha256:digest(data)};}
      else throw Error('Unsupported candidate resource.');
    }
  }
  try{await walk(root)}catch(e){if(optional&&e.code==='ENOENT')return null;throw e}
  return files;
}
function sameFiles(actual,expected){
  const keys=Object.keys(actual).sort(),wanted=Object.keys(expected).sort();
  if(JSON.stringify(keys)!==JSON.stringify(wanted))throw Error('Candidate resource file list differs.');
  for(const file of wanted)if(actual[file].sha256!==expected[file].sha256||actual[file].bytes!==expected[file].bytes)throw Error('Candidate resource bytes differ: '+file);
}
export async function verifiedWebManifest(root,manifest){
  if(manifest.schema!==1||manifest.profile!=='candidate-web-payload'||manifest.readyForRelease!==false||manifest.productionAuthAllowed!==false||typeof manifest.authConfigured!=='boolean')throw Error('Expected a gated candidate web manifest.');
  const actual=await candidateManifest(root,{authConfigured:manifest.authConfigured,policies:Object.fromEntries(Object.entries(manifest.policies).map(([kind,version])=>[kind,{version}]))});
  if(JSON.stringify(actual)!==JSON.stringify(manifest))throw Error('Candidate manifest differs from packaged bytes or gates.');
  return actual;
}
export async function verifyNativeWeb(root,manifest){
  const actual=await fileInventory(root),bridge={};
  // Capacitor 8 copy adds only empty Cordova compatibility stubs. Explicitly
  // reject nonempty stubs and every other unmanifested file.
  for(const file of ['cordova.js','cordova_plugins.js'])if(actual[file]){
    if(actual[file].bytes!==0)throw Error('Review changed Capacitor compatibility bridge: '+file);
    bridge[file]=actual[file];delete actual[file];
  }
  sameFiles(actual,manifest.files);return {files:actual,bridge};
}
export async function copyNativeSources(source,target,files){
  if(!files.length)throw Error('No tracked native source files.');
  const seen=new Set();
  for(const file of files){
    if(!/^ios\/App\//.test(file)||file.split('/').some(p=>p==='..'||p===''||p==='.' )||/(?:^|\/)(?:public|xcuserdata|\.build)\//.test(file)||seen.has(file))throw Error('Unexpected native source path.');
    seen.add(file);const from=resolve(source,file),to=resolve(target,file);
    if(!(await lstat(from)).isFile())throw Error('Native source must be a regular file.');
    await mkdir(dirname(to),{recursive:true});await copyFile(from,to);
  }
}
export function nativeBuildArgs(mode,{derived,archive,packages,arch='arm64'}={}){
  if(!['simulator','archive'].includes(mode))throw Error('Choose simulator or archive.');
  const args=['-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Release','-sdk',mode==='archive'?'iphoneos':'iphonesimulator','-destination',mode==='archive'?'generic/platform=iOS':'generic/platform=iOS Simulator','-derivedDataPath',derived,'-jobs','2'];
  if(packages)args.push('-clonedSourcePackagesDirPath',packages);
  // No developer-account lookup, provisioning update or export/upload action.
  args.push('DEVELOPMENT_TEAM=','CODE_SIGN_IDENTITY='+ (mode==='archive'?'':'-'),'CODE_SIGNING_ALLOWED='+ (mode==='archive'?'NO':'YES'),'CODE_SIGNING_REQUIRED=NO');
  if(mode==='simulator')args.push('ARCHS='+arch,'ONLY_ACTIVE_ARCH=YES');
  if(mode==='archive')args.push('-archivePath',archive);
  return args;
}
export function releaseSettings(items,mode){
  const settings=items.find(item=>item.target==='App')?.buildSettings;
  if(!settings||settings.CONFIGURATION!=='Release'||/\bDEBUG\b/.test(settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS||'')||settings.DEVELOPMENT_TEAM)throw Error('Candidate must use Release without a developer team or DEBUG probes.');
  const platform=mode==='archive'?'iphoneos':'iphonesimulator';
  if(settings.PLATFORM_NAME!==platform||settings.CODE_SIGNING_ALLOWED!==(mode==='archive'?'NO':'YES')||mode==='simulator'&&settings.CODE_SIGN_IDENTITY!=='-')throw Error('Unexpected candidate platform or signing.');
  return Object.fromEntries(['CONFIGURATION','PLATFORM_NAME','SDK_NAME','ARCHS','SWIFT_ACTIVE_COMPILATION_CONDITIONS','CODE_SIGNING_ALLOWED','CODE_SIGN_IDENTITY','DEVELOPMENT_TEAM','PRODUCT_BUNDLE_IDENTIFIER','MARKETING_VERSION','CURRENT_PROJECT_VERSION','IPHONEOS_DEPLOYMENT_TARGET','TARGETED_DEVICE_FAMILY'].map(key=>[key,settings[key]??'']));
}
export function verifyIdentity(info,config,sourceInfo,mode){
  if(info.CFBundleIdentifier!==config.appId||info.CFBundleDisplayName!==config.appName||JSON.stringify(info.CFBundleURLTypes)!==JSON.stringify(sourceInfo.CFBundleURLTypes))throw Error('Candidate native identity or callback differs.');
  if(JSON.stringify(info.CFBundleSupportedPlatforms)!==JSON.stringify([mode==='archive'?'iPhoneOS':'iPhoneSimulator']))throw Error('Candidate native platform differs.');
  if(!/^[A-Za-z0-9_-]+$/.test(info.CFBundleExecutable))throw Error('Unexpected candidate executable.');
  return {appId:info.CFBundleIdentifier,displayName:info.CFBundleDisplayName,version:info.CFBundleShortVersionString,build:info.CFBundleVersion,minimumOS:info.MinimumOSVersion,deviceFamily:info.UIDeviceFamily,callbacks:info.CFBundleURLTypes};
}
export function verifyReleaseBinary(data){
  for(const marker of ['--lab-','testMode','probeBackupFile'])if(data.includes(Buffer.from(marker)))throw Error('Developer probe marker remains in native Release executable: '+marker);
  return {sha256:digest(data),bytes:data.length,probeMarkersAbsent:true};
}
export function candidateScreenshots(manifest){
  const images=manifest.flatMap(test=>test.attachments||[]),expected={'Candidate welcome_':1,'Candidate ignores lab launch arguments_':1,'Candidate bundled terms_':2,'Candidate bundled privacy_':2};
  if(images.length!==6||images.some(image=>image.isAssociatedWithFailure!==false||!/^[A-Za-z0-9_-]+\.png$/.test(image.exportedFileName||'')))throw Error('Candidate XCTest did not produce six passing screenshots. Check for skipped tests or failures.');
  for(const [prefix,count] of Object.entries(expected))if(images.filter(image=>image.suggestedHumanReadableName?.startsWith(prefix)).length!==count)throw Error('Candidate XCTest screenshots are incomplete: '+prefix);
  return images.map(image=>({name:image.suggestedHumanReadableName,file:image.exportedFileName}));
}
