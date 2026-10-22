import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';
import {chromium} from '../../node_modules/playwright/index.mjs';
const root=resolve(import.meta.dirname,'../www'),evidence=resolve(import.meta.dirname,'../.build/accounts');await mkdir(evidence,{recursive:true});
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const browser=await chromium.launch();
try{for(const viewport of [{width:390,height:844},{width:320,height:568}]){
 const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'}),requests=[],errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='accounts.test'){requests.push(url.hostname);return route.abort()}
  const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/'))return route.abort();
  try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream',body:await readFile(file)})}catch{await route.abort()}
 });
 let page;
 async function view(name){await page.locator('body[data-account-view="'+name+'"]').waitFor()}
 async function step(name){await page.locator('body[data-active-screen="'+name+'"]').waitFor();await page.waitForFunction(()=>!document.querySelector('.screen-leave'))}
 async function open(){page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://accounts.test/account/index.html')}
 async function profile(parent,children){await view('profile');await page.locator('#account-parent').fill(parent);await page.locator('#account-coparent').fill('Other parent');await page.locator('#account-children').fill(children);await page.locator('#account-profile-save').click();await view('product');await step('s-home')}
 async function signout(){await page.locator('#account-open').click();await view('panel');await Promise.all([page.waitForEvent('load'),page.locator('#account-panel .account-signout').click()]);await view('welcome')}
 async function log(note,withImage){
  await page.locator('#home-primary-btn').click();await step('s-week');await page.locator('#wk-dad').click();await step('s-dad-mode');await page.locator('#sc-dad-normal').click();
  // A has two children; B has one and skips the all-children question.
  await page.waitForFunction(()=>['s-allkids','s-dad-help-choice'].includes(document.body.dataset.activeScreen));
  if(await page.locator('body').getAttribute('data-active-screen')==='s-allkids'){await page.locator('#ak-yes').click()}
  await step('s-dad-help-choice');await page.locator('#dad-help-no').click();await step('s-diary');await page.locator('#diary-input').fill(note);
  if(withImage)await page.locator('#diary-attach-input').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await page.locator('#diary-next-btn').click();await step('s-saved');await page.waitForFunction(()=>!saveEntry.pending);await page.evaluate(()=>hideSuccessOverlay());
 }
 await open();await view('welcome');assert(!(await page.locator('#app').isVisible()));assert(!(await page.locator('#account-login').isVisible()));
 await page.locator('#account-preview-a').click();await profile('Sample Parent A','Alex\nSam');
 assert.deepEqual(await page.evaluate(()=>KIDS),['Alex','Sam']);assert.equal(await page.locator('#home-primary-label').innerText(),'Log today');
 await log('Account A only: dinner and reading.',true);
 const saved=await page.evaluate(()=>getEntries()[todayStr()]);assert.equal(saved.attachment.dataUrl,'data:image/png;base64,'+image);
 await page.close();await context.setOffline(true);await open();await view('product');await step('s-home');
 assert.equal(await page.locator('#home-primary-label').innerText(),'Edit today');assert.deepEqual(await page.evaluate(()=>getEntries()[todayStr()]),saved);
 assert.equal(await page.evaluate(()=>APP_CONFIG.currentParentLabel),'Sample Parent A');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:resolve(evidence,viewport.width+'-account-a-offline.png')});
 await signout();assert(!(await page.locator('#app').isVisible()));await page.reload();await view('welcome');
 await page.locator('#account-preview-b').click();await view('profile');assert.equal(await page.locator('#account-parent').inputValue(),'');assert.equal(await page.locator('#account-children').inputValue(),'');
 // A profile write failure preserves the form and cannot enter the product.
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;window.accountOriginalPut=original;let fail=true;IDBObjectStore.prototype.put=function(value,key){if(fail&&String(key).startsWith('profile:')){fail=false;throw new DOMException('Full','QuotaExceededError')}return original.call(this,value,key)}});
 await page.locator('#account-parent').fill('Sample Parent B');await page.locator('#account-coparent').fill('Other parent');await page.locator('#account-children').fill('Taylor');await page.locator('#account-profile-save').click();
 await page.locator('#account-profile-message').filter({hasText:'Could not save'}).waitFor();await view('profile');assert.equal(await page.locator('#account-parent').inputValue(),'Sample Parent B');assert(!(await page.locator('#app').isVisible()));
 await page.locator('#account-profile-save').click();await view('product');await step('s-home');assert.deepEqual(await page.evaluate(()=>getEntries()),{});assert.deepEqual(await page.evaluate(()=>KIDS),['Taylor']);
 assert(!(await page.locator('body').innerText()).includes('Account A only'));
 await page.screenshot({path:resolve(evidence,viewport.width+'-account-b-empty.png')});
 await log('Account B only: park visit.',false);await signout();await page.locator('#account-preview-a').click();await view('product');await step('s-home');
 assert.deepEqual(await page.evaluate(()=>getEntries()[todayStr()]),saved);assert.deepEqual(await page.evaluate(()=>KIDS),['Alex','Sam']);
 assert(!(await page.locator('body').innerText()).includes('Account B only'));
 await page.locator('#account-open').click();await view('panel');assert.match(await page.locator('#account-identity').innerText(),/parent-a/);
 await page.screenshot({path:resolve(evidence,viewport.width+'-account-panel.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await context.close();
 console.log('Account UI passed at '+viewport.width+'px: profile/save failure retry, separate accounts, record/image recovery, offline reopen, sign-out/reload and account switching.');
}}finally{await browser.close()}
