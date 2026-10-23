// Read-only source inventory. No local auth config, credentials or provider calls.
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),run=promisify(execFile);
const json=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const plist=async path=>JSON.parse((await run('/usr/bin/plutil',['-convert','json','-o','-',join(root,path)])).stdout);
const [capacitor,info,privacy,project,build,auth]=await Promise.all([
  json('capacitor.config.json'),plist('ios/App/App/Info.plist'),plist('ios/App/App/PrivacyInfo.xcprivacy'),
  plist('ios/App/App.xcodeproj/project.pbxproj'),
  readFile(join(root,'scripts/build.mjs'),'utf8'),readFile(join(root,'src/auth.js'),'utf8')
]);
const targets=Object.values(project.objects).filter(item=>item.isa==='PBXNativeTarget');
const application=targets.find(item=>item.name==='App'&&item.productType==='com.apple.product-type.application');
if(!application)throw Error('The native App application target is missing.');
const configurations=project.objects[application.buildConfigurationList].buildConfigurations.map(id=>project.objects[id].buildSettings);
const values=key=>[...new Set(configurations.map(settings=>settings[key]).filter(value=>value!==undefined).map(String))];
const observed={
  appId:capacitor.appId,appName:capacitor.appName,displayName:info.CFBundleDisplayName,
  nativeBundleIds:values('PRODUCT_BUNDLE_IDENTIFIER'),versions:values('MARKETING_VERSION'),builds:values('CURRENT_PROJECT_VERSION'),
  deviceFamilies:values('TARGETED_DEVICE_FAMILY'),developerTeamConfigured:values('DEVELOPMENT_TEAM').some(Boolean),
  deploymentTargets:values('IPHONEOS_DEPLOYMENT_TARGET'),separateUITestTargets:targets.filter(item=>item.productType==='com.apple.product-type.bundle.ui-testing').map(item=>item.name),
  callbacks:(info.CFBundleURLTypes||[]).flatMap(type=>type.CFBundleURLSchemes||[]),
  photoPurpose:info.NSPhotoLibraryUsageDescription,
  privacy:{tracking:privacy.NSPrivacyTracking,collectedTypes:(privacy.NSPrivacyCollectedDataTypes||[]).length,accessedAPIs:(privacy.NSPrivacyAccessedAPITypes||[]).map(item=>({type:item.NSPrivacyAccessedAPIType,reasons:item.NSPrivacyAccessedAPITypeReasons}))},
  buildStripsWebsiteAnalytics:build.includes('analytics-config|analytics'),
  authSourceContainsProductionRefusal:auth.includes("url.hostname==='hdfuknggfkmaycnantxv.supabase.co'")
};
const findings=[];
if(/lab|feasibility/i.test(observed.appName+' '+observed.displayName+' '+observed.appId))findings.push('Prototype identity remains; final owner-approved identity is pending.');
if(observed.deviceFamilies.some(value=>value.includes('2')))findings.push('iPad is enabled in Xcode; final device scope and iPad QA need confirmation.');
if(/test|feasibility/i.test(observed.photoPurpose||''))findings.push('Photo permission text still describes a feasibility test.');
if(observed.privacy.collectedTypes===0)findings.push('Lab manifest has no collected-data declarations; reconcile with the cloud account product and dependencies.');
if(observed.authSourceContainsProductionRefusal)findings.push('Native auth still explicitly rejects the production project. Guided onboarding receipts are local test records; production/server acceptance integration remains.');
console.log(JSON.stringify({kind:'source-inventory-only',observedAt:new Date().toISOString(),observed,findings,
  releaseReadiness:'Not assessed or approved by this script.',
  requiredOwnerGates:['IOS-QA-01 signing/device install','IOS-QA-02/03 real auth and sync','IOS-QA-04/05/06 physical Files/photo/accessibility/sharing','IOS-QA-07 live deletion','IOS-QA-08 final identity/listing/privacy/support','IOS-QA-09 real onboarding/email return'],
  reviewPacket:'docs/product/mobile-release-preparation.md'},null,2));
