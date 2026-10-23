import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';
import {chromium} from '../../node_modules/playwright/index.mjs';
const root=resolve(import.meta.dirname,'../www'),evidence=resolve(import.meta.dirname,'../.build/sync');await mkdir(evidence,{recursive:true});
const browser=await chromium.launch();
try{for(const viewport of [{width:390,height:844},{width:320,height:568}]){
 const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'}),requests=[],errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='sync.test'){requests.push(url.hostname);return route.abort()}
  const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/'))return route.abort();
  try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream',body:await readFile(file)})}catch{await route.abort()}
 });
 async function step(p,name){await p.locator('body[data-active-screen="'+name+'"]').waitFor();await p.waitForFunction(()=>!document.querySelector('.screen-leave'))}
 async function open(device){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('https://sync.test/account/index.html?sync=preview&device='+device);return p}
 async function panel(p){if(await p.locator('body').getAttribute('data-account-view')!=='panel')await p.locator('#account-open').click()}
 async function back(p){await p.locator('#account-back').click();await p.locator('body[data-account-view="product"]').waitFor()}
 async function synced(p){await panel(p);await p.locator('#account-sync-now').click();await p.locator('#account-sync-status').filter({hasText:'Up to date'}).waitFor()}
 async function offline(p){await panel(p);await p.getByRole('button',{name:'Go offline on this device',exact:true}).click();await p.locator('#account-sync-status').filter({hasText:'Offline'}).waitFor();await back(p)}
 async function reconnect(p){await panel(p);await p.getByRole('button',{name:'Reconnect this device',exact:true}).click()}
 async function log(p,note,staySaved=false){
  await step(p,'s-home');await p.locator('#home-primary-btn').click();await step(p,'s-week');await p.locator('#wk-dad').click();await step(p,'s-dad-mode');await p.locator('#sc-dad-normal').click();await step(p,'s-allkids');await p.locator('#ak-yes').click();await step(p,'s-dad-help-choice');await p.locator('#dad-help-no').click();await step(p,'s-diary');await p.locator('#diary-input').fill(note);await p.locator('#diary-next-btn').click();await step(p,'s-saved');await p.waitForFunction(()=>!saveEntry.pending);await p.evaluate(()=>hideSuccessOverlay());
  if(staySaved)return;await p.locator('#s-saved .saved-actions > button').click();await step(p,'s-home');
 }
 let a=await open('one');await a.locator('#account-preview-a').click();await a.locator('#account-profile-form').waitFor();await a.locator('#account-parent').fill('Sync parent');await a.locator('#account-coparent').fill('Other parent');await a.locator('#account-children').fill('Alex\nSam');await a.locator('#account-profile-save').click();await step(a,'s-home');
 await log(a,'Shared base');await synced(a);await back(a);
 let b=await open('two');await b.locator('#account-preview-a').click();await step(b,'s-home');assert.equal(await b.evaluate(()=>APP_CONFIG.currentParentLabel),'Sync parent');await synced(b);await back(b);assert.equal(await b.evaluate(()=>getEntries()[todayStr()].diary),'Shared base');
 for(const choice of ['cloud','local']){
  await offline(a);await offline(b);await log(a,'Device one '+choice);await log(b,'Device two '+choice);
  if(choice==='cloud'){await b.close();b=await open('two');await step(b,'s-home');assert.equal(await b.evaluate(()=>getEntries()[todayStr()].diary),'Device two cloud')}
  await reconnect(a);await synced(a);await back(a);await reconnect(b);
  const conflict=b.locator('.account-conflict');await conflict.waitFor();assert.equal(await b.evaluate(()=>getEntries()[todayStr()].diary),'Device two '+choice);
  await conflict.getByText('This device',{exact:true}).click();await conflict.getByText('Cloud copy',{exact:true}).click();
  assert((await conflict.innerText()).includes('Device one '+choice));assert((await conflict.innerText()).includes('Device two '+choice));assert(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await b.screenshot({path:resolve(evidence,viewport.width+'-'+choice+'-review.png'),fullPage:true});
  await conflict.locator('[data-sync-choice="'+choice+'"]').click();await b.locator('#account-sync-status').filter({hasText:'Up to date'}).waitFor();await back(b);
  const expected=(choice==='cloud'?'Device one ':'Device two ')+choice;assert.equal(await b.evaluate(()=>getEntries()[todayStr()].diary),expected);await synced(a);await back(a);assert.equal(await a.evaluate(()=>getEntries()[todayStr()].diary),expected);
 }
 // Saved still has an Edit action, so cloud pulls wait until Today.
 await log(b,'Saved screen note',true);await synced(b);await back(b);await synced(a);await back(a);
 await log(a,'Newer cloud edit');await synced(a);await back(a);
 await panel(b);await b.locator('#account-sync-now').click();await b.locator('#account-sync-status').filter({hasText:'Cloud changes will load'}).waitFor();assert.equal(await b.evaluate(()=>getEntries()[todayStr()].diary),'Saved screen note');await back(b);await step(b,'s-saved');await b.locator('#s-saved .saved-actions > button').click();await step(b,'s-home');await synced(b);await back(b);assert.equal(await b.evaluate(()=>getEntries()[todayStr()].diary),'Newer cloud edit');
 // Refreshing sync must preserve the month the owner is browsing.
 await a.locator('[data-shell-tab="s-cal"]').click();await step(a,'s-cal');await a.locator('[onclick="changeMonth(-1)"]').click();const month=await a.locator('#cal-title').innerText();await synced(a);await back(a);assert.equal(await a.locator('#cal-title').innerText(),month);
 // A different user must still have no restored family or records.
 await panel(b);await Promise.all([b.waitForEvent('load'),b.locator('#account-panel .account-signout').click()]);await b.locator('#account-preview-b').click();await b.locator('#account-profile-form').waitFor();assert.equal(await b.locator('#account-parent').inputValue(),'');
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await context.close();
 console.log('Sync UI passed at '+viewport.width+'px: profile restore, two offline devices, restart recovery, both conflict choices and account isolation.');
}}finally{await browser.close()}
