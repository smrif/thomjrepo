import {spawn} from 'node:child_process';
import {access,cp,mkdir,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {join,relative,basename,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {root,sdk,java,environment} from './android-env.mjs';
const evidence=join(root,'.build/android-build.json');
const output=join(tmpdir(),'whose-day-android-build-'+createHash('sha256').update(root).digest('hex').slice(0,10));
await rm(evidence,{force:true});
for(const path of [join(java,'bin',process.platform==='win32'?'java.exe':'java'),join(sdk,'platforms/android-36/android.jar')]) {
  try {await access(path)} catch {throw new Error('Android toolchain prerequisite missing: '+path+'. See mobile/README.md; this script never installs tools or accepts licenses.');}
}
// Build a fresh copy of the current source, including uncommitted changes.
// Preserve the checkout; skip only known byte-identical generated duplicates.
const source=join(root,'android'),workspace=join(output,'source'),project=join(workspace,'android');
await rm(workspace,{recursive:true,force:true});await mkdir(workspace,{recursive:true});
await cp(source,project,{recursive:true,filter:async path=>{
  const part=relative(source,path).split('\\').join('/');
  if(['build','.gradle','app/build','capacitor-cordova-android-plugins/build'].some(dir=>part===dir||part.startsWith(dir+'/')))return false;
  if(part.startsWith('app/src/main/res/xml/')&&/^config \d+\.xml$/.test(basename(path))){
    if(!(await readFile(path)).equals(await readFile(join(dirname(path),'config.xml'))))throw Error('A generated config duplicate differs. Preserve it and review before building.');
    return false;
  }
  return true;
}});
await symlink(join(root,'node_modules'),join(workspace,'node_modules'),process.platform==='win32'?'junction':'dir');
const child=spawn(process.platform==='win32'?'gradlew.bat':'./gradlew',['--no-daemon','--console=plain','--project-cache-dir',join(output,'.gradle'),'assembleDebug','lintDebug'],{cwd:project,env:{...environment,WHOSE_DAY_ANDROID_BUILD_ROOT:output},stdio:'inherit'});
const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',done)});
if(code!==0)process.exit(code||1);
const apkPath=join(output,'app/outputs/apk/debug/app-debug.apk');
await access(apkPath);await mkdir(join(root,'.build'),{recursive:true});
await writeFile(evidence,JSON.stringify({apkPath,sdkPath:sdk,javaHome:java,checked:['assembleDebug','lintDebug'],at:new Date().toISOString()},null,2));
console.log('Android debug APK and lint passed; location saved in .build/android-build.json. Runtime probes are a separate check.');
