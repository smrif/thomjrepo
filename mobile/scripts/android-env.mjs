import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
export const root=resolve(import.meta.dirname,'..');
export const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||join(root,'.build/android-tools/sdk');
export const java=process.env.JAVA_HOME||join(root,'.build/android-tools/jdk/Contents/Home');
export const adb=join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
export const environment={...process.env,JAVA_HOME:java,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,
  ANDROID_USER_HOME:process.env.ANDROID_USER_HOME||join(root,'.build/android-user'),
  GRADLE_USER_HOME:process.env.GRADLE_USER_HOME||join(tmpdir(),'whose-day-gradle-'+createHash('sha256').update(root).digest('hex').slice(0,10))};
