import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '../../node_modules/playwright/index.mjs';
const browser=await chromium.launch(),root=resolve(import.meta.dirname,'../www'),evidence=resolve(import.meta.dirname,'../.build/checkin');
await mkdir(evidence,{recursive:true});
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
try{for(const viewport of [{width:390,height:844},{width:320,height:568}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'}),requests=[],errors=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.hostname!=='checkin.test'){requests.push(url.hostname);return route.abort()}
    const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/'))return route.abort();
    try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream',body:await readFile(file)})}catch{await route.abort()}
  });
  let page;
  async function open(){
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://checkin.test/checkin/index.html');await page.locator('body[data-checkin-state="ready"]').waitFor();
    assert.equal(await page.locator('.shell-sample').innerText(),'Browser test');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  async function step(id){await page.locator(`body[data-active-screen="${id}"]`).waitFor();await page.waitForFunction(()=>!document.querySelector('.screen-leave'))}
  async function normal(){
    await page.locator('#home-primary-btn').click();await step('s-week');
    await page.locator('#wk-dad').click();await step('s-dad-mode');
    await page.locator('#sc-dad-normal').click();await step('s-allkids');
    await page.locator('#ak-yes').click();await step('s-dad-help-choice');
    await page.locator('#dad-help-no').click();await step('s-diary');
  }
  async function save(){await page.locator('#diary-next-btn').click();await step('s-saved');await page.waitForFunction(()=>!saveEntry.pending);await page.evaluate(()=>hideSuccessOverlay())}
  await open();assert.equal(await page.locator('#home-primary-label').innerText(),'Log today');
  // Poisoned legacy browser caches cannot be imported into the native-shaped slice.
  await page.evaluate(()=>localStorage.setItem('familylog_entries','{"2000-01-01":{"week":"dad","diary":"legacy data"}}'));
  await normal();await page.locator('#diary-input').fill('Synthetic evening: dinner and reading.');
  await page.locator('#diary-attach-input').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await page.locator('#diary-attach-preview').waitFor({state:'visible'});
  const remove=page.getByRole('button',{name:'Remove screenshot',exact:true}),removeBounds=await remove.boundingBox();
  assert(removeBounds.width>=44&&removeBounds.height>=44,'Attachment removal has a named 44px target');
  await remove.click();assert(!(await page.locator('#diary-attach-preview').isVisible()));assert.equal(await page.evaluate(()=>S.attachment),null);
  await page.locator('#diary-attach-input').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await page.locator('#diary-attach-preview').waitFor({state:'visible'});
  await page.evaluate(()=>{
    const original=WhoseDayPlatform.records.commit.bind(WhoseDayPlatform.records);window.commitCount=0;
    WhoseDayPlatform.records.commit=async value=>{commitCount++;await new Promise(r=>setTimeout(r,600));return original(value)};
  });
  await page.locator('#diary-next-btn').click();await page.locator('#checkin-save-status').waitFor({state:'visible'});
  assert.equal(await page.locator('body').getAttribute('data-active-screen'),'s-diary');assert(await page.locator('#app').evaluate(el=>el.inert));
  await page.evaluate(()=>{saveEntry();saveEntry()});
  await step('s-saved');await page.waitForFunction(()=>!saveEntry.pending);assert.equal(await page.evaluate(()=>commitCount),1);
  await page.evaluate(()=>hideSuccessOverlay());
  assert.equal(await page.evaluate(()=>Object.keys(getEntries()).length),1,'No legacy records imported');
  await page.screenshot({path:resolve(evidence,viewport.width+'-saved.png')});
  const saved=await page.evaluate(()=>getEntries()[todayStr()]);assert.equal(saved.diary,'Synthetic evening: dinner and reading.');assert.equal(saved.attachment.dataUrl,'data:image/png;base64,'+image);
  await page.evaluate(()=>localStorage.clear());await page.close();await context.setOffline(true);await open();
  assert.equal(await page.locator('#home-primary-label').innerText(),'Edit today');
  assert.deepEqual(await page.evaluate(()=>getEntries()[todayStr()]),saved);
  await page.screenshot({path:resolve(evidence,viewport.width+'-reopened.png')});
  await normal();assert.equal(await page.locator('#diary-input').inputValue(),saved.diary);assert(await page.locator('#diary-attach-preview').isVisible());
  await page.locator('#diary-input').fill('Synthetic revised evening.');
  await page.evaluate(()=>{
    const original=WhoseDayPlatform.records.commit.bind(WhoseDayPlatform.records);let fail=true;
    WhoseDayPlatform.records.commit=async value=>{if(fail){fail=false;throw new Error('Injected disk-full failure')}return original(value)};
  });
  await page.locator('#diary-next-btn').click();await page.getByRole('button',{name:'Try saving again'}).waitFor();
  assert.equal(await page.locator('body').getAttribute('data-active-screen'),'s-diary');assert.equal(await page.locator('#diary-input').inputValue(),'Synthetic revised evening.');
  assert.equal(await page.evaluate(()=>getEntries()[todayStr()].diary),saved.diary);
  await page.screenshot({path:resolve(evidence,viewport.width+'-retry.png')});
  await page.getByRole('button',{name:'Try saving again'}).click();await step('s-saved');await page.waitForFunction(()=>!saveEntry.pending);await page.evaluate(()=>hideSuccessOverlay());
  await page.getByRole('button',{name:'Back to Today',exact:true}).click();await step('s-home');
  await page.locator('#home-primary-btn').click();await step('s-week');
  await page.locator('#wk-mom').click();await step('s-mom-mode');await page.locator('#ft-easy').click();await step('s-mom-easy');
  await page.locator(`#easy-opts .opt[onclick*="'none'"]`).click();await page.locator('#easy-note').fill('Synthetic co-parent day.');
  await page.locator('#easy-continue-btn').click();await step('s-saved');await page.waitForFunction(()=>!saveEntry.pending);
  assert.equal(await page.evaluate(()=>getEntries()[todayStr()].momMode),'easy');assert.equal(await page.evaluate(()=>getEntries()[todayStr()].dadMode),null);assert.deepEqual(await page.evaluate(()=>getEntries()[todayStr()].kidsWithDad),[]);
  await page.evaluate(()=>{hideSuccessOverlay();show('s-home')});
  // Both directions use one help step, with durable save/reopen on small phones.
  for(const theirs of [true,false]){
    async function openHelp(){
      await page.locator('#home-primary-btn').click();await step('s-week');
      await page.locator(theirs?'#wk-mom':'#wk-dad').click();await step(theirs?'s-mom-mode':'s-dad-mode');
      if(theirs){
        await page.locator('#ft-easy').click();await step('s-mom-easy');
        const choice=page.locator(`#easy-opts .opt[onclick*="'helped'"]`);
        if(!(await choice.evaluate(el=>el.classList.contains('sel'))))await choice.click();
        await page.locator('#easy-continue-btn').click();await step('s-helped-activity');
      }else{
        await page.locator('#sc-dad-normal').click();await step('s-allkids');
        await page.locator('#ak-yes').click();await step('s-dad-help-choice');
        await page.locator('#dad-help-yes').click();await step('s-mom-helped-activity');
      }
    }
    await openHelp();
    const prefix=theirs?'helped':'mha',next=theirs?'helped-act-next':'mha-next-btn',field=theirs?'helpedData':'momHelpedOnDadWeek';
    assert.equal(await page.locator('#'+prefix+'-step-lbl').innerText(),'All children');
    assert.equal(await page.locator('#'+prefix+'-kid-name').innerText(),'Alex, Sam');
    assert(await page.locator('#'+next).isDisabled());
    await page.locator('#'+prefix+'-acts .act-btn').first().click();
    await page.locator('#'+prefix+'-note').fill('Shared pickup and dinner.');
    await page.screenshot({path:resolve(evidence,viewport.width+'-shared-help-'+(theirs?'you':'coparent')+'.png')});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#'+next).click();await step('s-diary');
    await page.locator('#shell-back').click();await step(theirs?'s-helped-activity':'s-mom-helped-activity');
    assert.equal(await page.locator('#'+prefix+'-note').inputValue(),'Shared pickup and dinner.');
    await page.locator('#'+next).click();await step('s-diary');await save();
    const helped=await page.evaluate(field=>getEntries()[todayStr()][field],field);
    assert.deepEqual(helped.Alex,helped.Sam);assert.equal(helped.Alex.note,'Shared pickup and dinner.');
    await page.close();await open();await openHelp();
    assert.equal(await page.locator('#'+prefix+'-note').inputValue(),'Shared pickup and dinner.');
    assert.equal(await page.locator('#'+prefix+'-acts .act-btn.sel').count(),1);
    await page.evaluate(()=>show('s-home'));await step('s-home');
  }
  // Corrupt/future records block startup without clearing the persistent store.
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('whose-day-checkin-synthetic-v1');request.onsuccess=()=>{const db=request.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put('{"schema":999}','checkin:v1:browser-sample-v1:2000-01-01');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=reject};request.onerror=reject;
  }));
  await page.reload();await page.getByRole('button',{name:'Retry opening'}).waitFor();assert(!(await page.locator('#app').isVisible()));
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await context.close();console.log('Persistent check-in UI passed at '+viewport.width+'px: save/readback, offline reopen, image/edit, failure/retry, duplicate taps, shared help in both directions with durable reopen, alternate branch and corrupt-data recovery.');
}}finally{await browser.close()}
