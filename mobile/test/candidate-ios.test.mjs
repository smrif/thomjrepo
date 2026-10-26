import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {candidateManifest} from '../scripts/candidate-package.mjs';
import {verifiedWebManifest,verifyNativeWeb,copyNativeSources,nativeBuildArgs,releaseSettings,verifyIdentity,verifyReleaseBinary,candidateScreenshots} from '../scripts/candidate-ios.mjs';

test('native copies must match every reviewed web byte; only empty Capacitor stubs are allowed',async()=>{
  const root=await mkdtemp(join(tmpdir(),'whose-day-native-resources-'));
  try{
    await mkdir(join(root,'account'));
    for(const path of ['index.html','entry.js','account/index.html','account/account-runtime.js','account/app.js','account/shell.js'])await writeFile(join(root,path),'safe');
    const manifest=await candidateManifest(root);await verifiedWebManifest(root,manifest);await verifyNativeWeb(root,manifest);
    await assert.rejects(verifiedWebManifest(root,{...manifest,readyForRelease:true}),/gated/);
    await writeFile(join(root,'cordova.js'),'');await writeFile(join(root,'cordova_plugins.js'),'');
    assert.equal(Object.keys((await verifyNativeWeb(root,manifest)).bridge).length,2);
    await writeFile(join(root,'cordova.js'),'runUnreviewedCode()');await assert.rejects(verifyNativeWeb(root,manifest),/compatibility bridge/);await writeFile(join(root,'cordova.js'),'');
    await writeFile(join(root,'lab.js'),'');await assert.rejects(verifyNativeWeb(root,manifest),/file list/);await rm(join(root,'lab.js'));
    await writeFile(join(root,'account/app.js'),'changed');await assert.rejects(verifyNativeWeb(root,manifest),/bytes differ/);
    await writeFile(join(root,'account/app.js'),'safe');await rm(join(root,'entry.js'));await assert.rejects(verifyNativeWeb(root,manifest),/file list/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('native source staging rejects traversal, generated resources, duplicates and symlinks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'whose-day-native-source-')),out=join(root,'staged');
  try{
    await mkdir(join(root,'ios/App/App'),{recursive:true});await writeFile(join(root,'ios/App/App/Info.plist'),'identity');
    await copyNativeSources(root,out,['ios/App/App/Info.plist']);assert.equal(await readFile(join(out,'ios/App/App/Info.plist'),'utf8'),'identity');
    for(const paths of [[],['ios/App/../../../outside'],['ios/App/App/public/lab.js'],['ios/App/CapApp-SPM/.build/debug/file'],['ios/App/App/Info.plist','ios/App/App/Info.plist']])await assert.rejects(copyNativeSources(root,out,paths));
    await symlink(join(root,'ios/App/App/Info.plist'),join(root,'ios/App/App/Link.plist'));await assert.rejects(copyNativeSources(root,out,['ios/App/App/Link.plist']),/regular file/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('native candidate modes pin Release and prevent provider signing or archive export',()=>{
  const archive=nativeBuildArgs('archive',{derived:'/tmp/derived',archive:'/tmp/candidate.xcarchive'}),sim=nativeBuildArgs('simulator',{derived:'/tmp/derived'});
  for(const args of [archive,sim]){assert.equal(args[args.indexOf('-configuration')+1],'Release');assert(args.includes('DEVELOPMENT_TEAM='));assert(!args.some(arg=>/allowProvisioning|exportArchive|upload/.test(arg)));}
  assert(archive.includes('CODE_SIGNING_ALLOWED=NO'));assert(sim.includes('CODE_SIGN_IDENTITY=-'));assert.throws(()=>nativeBuildArgs('upload'),/Choose/);
  const settings={CONFIGURATION:'Release',PLATFORM_NAME:'iphoneos',CODE_SIGNING_ALLOWED:'NO',DEVELOPMENT_TEAM:'',SWIFT_ACTIVE_COMPILATION_CONDITIONS:''};
  releaseSettings([{target:'App',buildSettings:settings}],'archive');
  for(const change of [{CONFIGURATION:'Debug'},{SWIFT_ACTIVE_COMPILATION_CONDITIONS:'DEBUG'},{DEVELOPMENT_TEAM:'SomeTeam'},{CODE_SIGNING_ALLOWED:'YES'},{PLATFORM_NAME:'iphonesimulator'}])assert.throws(()=>releaseSettings([{target:'App',buildSettings:{...settings,...change}}],'archive'));
});
test('native identity/callback drift and probe-bearing Release executables fail verification',()=>{
  const config={appId:'com.example.fixture',appName:'Fixture'},source={CFBundleURLTypes:[{CFBundleURLSchemes:['fixture']}]},info={...source,CFBundleIdentifier:config.appId,CFBundleDisplayName:config.appName,CFBundleExecutable:'App',CFBundleSupportedPlatforms:['iPhoneOS']};
  assert.equal(verifyIdentity(info,config,source,'archive').appId,config.appId);
  for(const change of [{CFBundleIdentifier:'com.example.other'},{CFBundleDisplayName:'Other'},{CFBundleURLTypes:[]},{CFBundleSupportedPlatforms:['iPhoneSimulator']},{CFBundleExecutable:'../App'}])assert.throws(()=>verifyIdentity({...info,...change},config,source,'archive'));
  assert.equal(verifyReleaseBinary(Buffer.from('compiled product')).probeMarkersAbsent,true);
  for(const marker of ['--lab-account-write','testMode','probeBackupFile'])assert.throws(()=>verifyReleaseBinary(Buffer.from('compiled '+marker)),/Developer probe marker/);
});
test('native UI QA refuses skipped/incomplete runs and failure attachments',()=>{
  const names=['Candidate welcome_','Candidate ignores lab launch arguments_','Candidate bundled terms_1','Candidate bundled terms_2','Candidate bundled privacy_1','Candidate bundled privacy_2'];
  const attachments=names.map((name,i)=>({exportedFileName:i+'.png',suggestedHumanReadableName:name,isAssociatedWithFailure:false}));
  assert.equal(candidateScreenshots([{attachments}]).length,6);
  for(const images of [[],attachments.slice(1),[...attachments.slice(1),attachments[1]],attachments.map((image,i)=>i===0?{...image,isAssociatedWithFailure:true}:image),attachments.map((image,i)=>i===0?{...image,exportedFileName:'../outside.png'}:image)])assert.throws(()=>candidateScreenshots([{attachments:images}]));
});
