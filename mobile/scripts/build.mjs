import {readFile,writeFile,rm,mkdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url)),repo=resolve(root,'..'),out=join(root,'www');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
let config={auth:{enabled:false}};
try{config=JSON.parse(await readFile(join(root,'config.local.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
if(config.auth?.enabled && (config.auth.url==='https://hdfuknggfkmaycnantxv.supabase.co' || !/^sb_publishable_/.test(config.auth.publishableKey||'')))throw new Error('A separate test Supabase project and publishable key are required.');
await writeFile(join(root,'config.generated.json'),JSON.stringify(config));
try{await build({entryPoints:[join(root,'src/main.js')],bundle:true,outfile:join(out,'lab.js'),format:'iife',target:'es2022',minify:false})}finally{await rm(join(root,'config.generated.json'))}
for(const file of ['index.html','lab.css'])await cp(join(root,'src',file),join(out,file));
// Reuse the current website source in a network-disabled, synthetic-only demo.
const preview=join(out,'preview');await mkdir(preview,{recursive:true});
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
await writeFile(join(preview,'app.js'),app);
// Separate persistent slice: no demo seeding, provider client or analytics.
const checkin=join(out,'checkin');await cp(preview,checkin,{recursive:true});
let productHtml=html.replace(/<script src="(?:app\.js[^\"]*|shell\.js)"><\/script>/g,'');
productHtml=productHtml.replace('<body class="mobile-shell">','<body class="mobile-shell" data-checkin-state="loading">'+await readFile(join(root,'src/checkin.html'),'utf8'));
productHtml=productHtml.replace('</head>','<link rel="stylesheet" href="checkin.css"></head>');
productHtml=productHtml.replace('</body>','<script src="checkin-runtime.js" defer></script></body>');
await writeFile(join(checkin,'index.html'),productHtml);
await cp(join(root,'src/checkin.css'),join(checkin,'checkin.css'));
await build({entryPoints:[join(root,'src/checkin-runtime.js')],bundle:true,outfile:join(checkin,'checkin-runtime.js'),format:'iife',target:'es2022',minify:false});
console.log('Bundled native lab, shell preview and persistent check-in slice (no production backend or telemetry).');
