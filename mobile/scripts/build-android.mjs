import {spawn} from 'node:child_process';
import {access,mkdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {root,sdk,java,environment} from './android-env.mjs';
const evidence=join(root,'.build/android-build.json');
await rm(evidence,{force:true});
for(const path of [join(java,'bin',process.platform==='win32'?'java.exe':'java'),join(sdk,'platforms/android-36/android.jar')]) {
  try {await access(path)} catch {throw new Error('Android toolchain prerequisite missing: '+path+'. See mobile/README.md; this script never installs tools or accepts licenses.');}
}
const child=spawn(process.platform==='win32'?'gradlew.bat':'./gradlew',['--no-daemon','--console=plain','assembleDebug','lintDebug'],{cwd:join(root,'android'),env:environment,stdio:'inherit'});
const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',done)});
if(code!==0)process.exit(code||1);
const apkPath=join(root,'android/app/build/outputs/apk/debug/app-debug.apk');
await access(apkPath);await mkdir(join(root,'.build'),{recursive:true});
await writeFile(evidence,JSON.stringify({apkPath,sdkPath:sdk,javaHome:java,checked:['assembleDebug','lintDebug'],at:new Date().toISOString()},null,2));
console.log('Android debug APK and lint passed; location saved in .build/android-build.json. Runtime probes are a separate check.');
