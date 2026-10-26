import {readFile,writeFile,rm,mkdir,cp,mkdtemp,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {testProject} from '../src/auth.js';
import {deletionEndpoint} from '../src/delete-account.js';
import {registrationEnabled} from '../src/registration-config.js';
import {candidateMarkup,candidateSharedApp,candidateManifest} from './candidate-package.mjs';
const args=process.argv.slice(2),candidate=args.length===1&&args[0]==='--candidate';
if(args.length&&!candidate)throw Error('Usage: build.mjs [--candidate]');
const root=fileURLToPath(new URL('..',import.meta.url)),repo=resolve(root,'..');
// Candidate configuration is deliberately independent of the running lab.
let config={auth:{enabled:false}};
try{config=JSON.parse(await readFile(join(root,candidate?'config.candidate.local.json':'config.local.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
const project=config.auth?.enabled?testProject(config.auth):null;
const deletionURL=deletionEndpoint(config);
if(config.deletion?.enabled&&!project)throw new Error('Deletion requires test auth.');
if(config.sync?.enabled&&!project)throw new Error('Sync requires an explicitly configured test auth project.');
registrationEnabled(config);
const sharedSource=await readFile(join(repo,'app.js'),'utf8'),policies={};
for(const [kind,constant] of [['terms','CURRENT_TERMS_VERSION'],['privacy','CURRENT_PRIVACY_VERSION']]){
  const version=sharedSource.match(new RegExp("const "+constant+"='([0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]+)'"))?.[1];
  if(!version)throw new Error('Missing current policy version.');
  const html=await readFile(join(repo,'assets/legal',version,kind+'.html'),'utf8');
  if(!html.includes('name="policy-version" content="'+version+'"'))throw new Error('Policy version metadata differs.');
  const main=html.match(/<main>([\s\S]*?)<\/main>/)?.[1];
  if(!main||/<(?:script|iframe|img|svg)\b|\son\w+\s*=/i.test(main))throw new Error('Unsupported policy document content.');
  for(const link of main.matchAll(/href="([^"]+)"/g))if(!['privacy.html','terms.html','../../../index.html'].includes(link[1]))throw new Error('Review the new policy link before bundling it.');
  policies[kind]={version,html:main,title:kind==='terms'?'Terms of Use':'Privacy Policy'};
}
await mkdir(join(root,'.build'),{recursive:true});
const stage=candidate?await mkdtemp(join(root,'.build/candidate-stage-')):null;
const out=candidate?join(stage,'www'):join(root,'www');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
try{
if(!candidate){
await writeFile(join(root,'config.generated.json'),JSON.stringify(config));
try{await build({entryPoints:[join(root,'src/main.js')],bundle:true,outfile:join(out,'lab.js'),format:'iife',target:'es2022',minify:false})}finally{await rm(join(root,'config.generated.json'))}
for(const file of ['index.html','lab.css'])await cp(join(root,'src',file),join(out,file));
}
// Reuse the current website source in a network-disabled, synthetic-only demo.
const preview=join(out,candidate?'account':'preview');await mkdir(preview,{recursive:true});
for(const file of ['app.js','backup.js','styles.css','theme.css','terms.html','privacy.html'])await cp(join(repo,file),join(preview,file));
await cp(join(repo,'assets'),join(preview,'assets'),{recursive:true});
for(const file of ['shell.css','shell.js'])await cp(join(root,'src',file),join(preview,file));
let html=await readFile(join(repo,'index.html'),'utf8');
html=html.replace(/<script src="(?:supabase-config|supabase-client|analytics-config|analytics)\.js[^\"]*"><\/script>/g,'');
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; connect-src \'none\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; form-action \'none\'; object-src \'none\'">');
html=html.replace(/<meta name="viewport"[^>]*>/,'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
html=html.replace('</head>','<link rel="stylesheet" href="shell.css"></head>');
html=html.replace('<body>','<body class="mobile-shell">'+await readFile(join(root,'src/shell.html'),'utf8'));
html=html.replace('</body>','<script src="shell.js"></script></body>');
await writeFile(join(preview,'index.html'),html);
let app=await readFile(join(preview,'app.js'),'utf8');
app=app.replace("if('serviceWorker' in navigator&&window.isSecureContext&&location.protocol!=='file:')",'if(false)');
if(candidate)app=candidateSharedApp(app);
await writeFile(join(preview,'app.js'),app);
// Separate persistent slice: no demo seeding, provider client or analytics.
const checkin=candidate?preview:join(out,'checkin');if(!candidate)await cp(preview,checkin,{recursive:true});
let productHtml=html.replace(/<script src="(?:app\.js[^\"]*|shell\.js)"><\/script>/g,'');
productHtml=productHtml.replace('<body class="mobile-shell">','<body class="mobile-shell" data-checkin-state="loading">'+await readFile(join(root,'src/checkin.html'),'utf8'));
productHtml=productHtml.replace('</head>','<link rel="stylesheet" href="checkin.css"></head>');
productHtml=productHtml.replace('</body>','<script src="checkin-runtime.js" defer></script></body>');
await writeFile(join(checkin,'index.html'),productHtml);
await cp(join(root,'src/checkin.css'),join(checkin,'checkin.css'));
if(!candidate)await build({entryPoints:[join(root,'src/checkin-runtime.js')],bundle:true,outfile:join(checkin,'checkin-runtime.js'),format:'iife',target:'es2022',minify:false});
// Account flow reuses the product screens and native bridge. Only this entry
// may reach the configured, validated test auth origin. No production SDK/config.
const account=join(out,'account');if(!candidate)await cp(checkin,account,{recursive:true});
let accountHtml=productHtml.replace('data-checkin-state="loading"','data-checkin-state="loading" data-account-view="loading"');
accountHtml=accountHtml.replace('</head>','<link rel="stylesheet" href="account.css"></head>');
let accountMarkup=await readFile(join(root,'src/account.html'),'utf8'),onboardingMarkup=await readFile(join(root,'src/onboarding.html'),'utf8');
if(candidate){const clean=candidateMarkup(accountMarkup,onboardingMarkup);accountMarkup=clean.account;onboardingMarkup=clean.onboarding;}
accountHtml=accountHtml.replace('</body>',accountMarkup+onboardingMarkup+'</body>');
accountHtml=accountHtml.replace('src="checkin-runtime.js"','src="account-runtime.js"');
if(project)accountHtml=accountHtml.replace("connect-src 'none'","connect-src https://"+project+'.supabase.co'+(deletionURL?' '+new URL(deletionURL).origin:''));
await writeFile(join(account,'index.html'),accountHtml);
await cp(join(root,'src/account.css'),join(account,'account.css'));
await rm(join(account,'checkin-runtime.js'),{force:true});
await writeFile(join(root,'config.generated.json'),JSON.stringify(config));
try{await build({entryPoints:[join(root,'src/account-runtime.js')],bundle:true,outfile:join(account,'account-runtime.js'),format:'iife',target:'es2022',minifySyntax:candidate,define:{__WHOSE_DAY_LAB__:String(!candidate),__WHOSE_DAY_POLICIES__:JSON.stringify(policies)}})}finally{await rm(join(root,'config.generated.json'))}
if(candidate){
  await writeFile(join(out,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; connect-src \'none\'; object-src \'none\'; base-uri \'none\'"><title>Whose Day</title><script src="entry.js" defer></script></head><body><p>Opening Whose Day…</p><a href="account/index.html">Open Whose Day</a></body></html>');
  await writeFile(join(out,'entry.js'),"location.replace('account/index.html'+location.search+location.hash);\n");
  const manifest=await candidateManifest(out,{authConfigured:!!project,policies});
  await writeFile(join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  // Validate fully before replacing a previous candidate. Keep a recoverable
  // previous payload until the new directory has moved successfully.
  const destination=join(root,'.build/candidate'),previous=stage+'-previous';let moved=false;
  try{await rename(destination,previous);moved=true}catch(e){if(e.code!=='ENOENT')throw e}
  try{await rename(stage,destination)}catch(e){if(moved)await rename(previous,destination);throw e}
  if(moved)await rm(previous,{recursive:true,force:true});
  console.log('Candidate web payload: .build/candidate/www (lab routes and probes excluded; release gates remain).');
}else console.log('Bundled lab, shell, sample check-in and account flow (test auth only; no production backend or telemetry).');
}finally{if(stage)await rm(stage,{recursive:true,force:true});}
