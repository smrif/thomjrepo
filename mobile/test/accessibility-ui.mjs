import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '../../node_modules/playwright/index.mjs';
const root=resolve(import.meta.dirname,'../www'),out=resolve(import.meta.dirname,'../.build/accessibility');
await mkdir(out,{recursive:true});const browser=await chromium.launch();
const results=[];
try{for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
 const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[],external=[];
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='accessibility.test'){external.push(url.hostname);return route.abort()}const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/'))return route.abort();try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream',body:await readFile(file)})}catch{await route.abort()}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://accessibility.test/account/index.html');
 async function check(label){
  await page.waitForFunction(()=>!document.querySelector('.screen-leave'));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const issues=await page.evaluate(()=>{
   const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden],[inert]')};
   const issues=[];
   if(![...document.querySelectorAll('button,[role="button"]')].some(e=>visible(e)&&!e.disabled))issues.push('no visible enabled controls');
   if(document.body.dataset.accountView==='product'&&!visible(document.getElementById('shell-header')))issues.push('product header hidden');
   if(document.documentElement.scrollWidth>innerWidth)issues.push('horizontal overflow');
   for(const e of document.querySelectorAll('button,[role="button"]')){if(!visible(e)||e.disabled)continue;const r=e.getBoundingClientRect(),name=(e.getAttribute('aria-label')||e.innerText||e.title||'').trim();if(!name)issues.push('unnamed button '+(e.id||e.className));if(r.width<44||r.height<44)issues.push('small target '+name+' '+Math.round(r.width)+'×'+Math.round(r.height));if(e.scrollWidth>e.clientWidth+1)issues.push('clipped button text '+name);}
   for(const e of document.querySelectorAll('input:not([type="hidden"]),textarea,select')){if(!visible(e)||e.disabled)continue;if(!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby'))issues.push('unlabeled field '+e.id);}
   return issues;
  });
  results.push({viewport,label,issues});assert.deepEqual(issues,[],viewport.width+'px '+label);
 }
 await page.locator('#account-preview-a').waitFor();await check('account chooser');await page.locator('#account-preview-a').click();await page.locator('#account-parent').waitFor();await check('profile');
 await page.locator('#account-parent').fill('Alex');await page.locator('#account-coparent').fill('Jordan');await page.locator('#account-children').fill('Avery\nSam');await page.locator('#account-profile-save').click();await page.locator('body[data-active-screen="s-home"]').waitFor();await check('Today');
 for(const large of [false,true]){
  if(large)await page.addStyleTag({content:'body :is(p,label,input,textarea,select,button,.export-card-title,.settings-row-label){font-size:24px!important;line-height:1.5!important}'});
  await page.locator('[data-shell-tab="s-setup"]').click();await check('Settings'+(large?' enlarged text':''));
  await page.screenshot({path:resolve(out,viewport.width+'-settings-'+(large?'large':'standard')+'.png'),fullPage:true});
  for(const section of ['name','coparent','activities','email','sync','logs','export','backup','import','delete']){await page.evaluate(section=>openSettingsPage(section),section);await check(section+(large?' enlarged text':''));await page.evaluate(()=>backToSettings());}
  await page.locator('[data-shell-tab="s-export"]').click();await check('Reports'+(large?' enlarged text':''));await page.locator('#exp-full').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#exp-full').getAttribute('aria-pressed'),'true');await check('Report preview'+(large?' enlarged text':''));
  await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:resolve(out,viewport.width+'-'+(large?'large':'standard')+'.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();console.log('Accessibility first pass passed at '+viewport.width+'px: named controls/fields, 44px button targets, keyboard report selection and enlarged text without horizontal overflow.');
}}finally{await writeFile(resolve(out,'checks.json'),JSON.stringify(results,null,2));await browser.close()}
