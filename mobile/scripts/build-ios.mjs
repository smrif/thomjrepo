import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
// Keep signing products outside cloud-managed Documents folders: FinderInfo
// extended attributes added by file providers cause codesign to reject bundles.
const derived=join(tmpdir(),'whose-day-ios-'+createHash('sha256').update(root).digest('hex').slice(0,10));
const packages=process.env.WHOSE_DAY_IOS_PACKAGES;
const child=spawn('xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',derived,...(packages?['-clonedSourcePackagesDirPath',packages]:[]),'build'],{cwd:root,stdio:'inherit'});
const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',done)});
if(code!==0)process.exit(code||1);
await mkdir(join(root,'.build'),{recursive:true});await writeFile(join(root,'.build/ios-build.json'),JSON.stringify({appPath:join(derived,'Build/Products/Debug-iphonesimulator/App.app')},null,2));
console.log('Simulator app built with normal local signing; location saved in .build/ios-build.json');
