import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '../../node_modules/playwright/index.mjs';
import {candidateManifest} from '../scripts/candidate-package.mjs';
const base=resolve(import.meta.dirname,'../.build/candidate'),root=resolve(base,'www'),out=resolve(import.meta.dirname,'../.build/candidate-qa');await mkdir(out,{recursive:true});
const saved=JSON.parse(await readFile(resolve(base,'manifest.json'),'utf8'));
assert.deepEqual(await candidateManifest(root,{authConfigured:saved.authConfigured,policies:Object.fromEntries(Object.entries(saved.policies).map(([kind,version])=>[kind,{version}]))}),saved,'Manifest must describe the exact packaged bytes');
const browser=await chromium.launch(),checks=[];
try{for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:width===390?'dark':'light',serviceWorkers:'block'}),external=[],errors=[],missing=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!=='https://candidate.test'){external.push(url.href);return route.abort()}
    const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/'))return route.abort();
    try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream',body:await readFile(file)})}catch{missing.push(url.pathname);await route.fulfill({status:404,body:'Not found'})}
  });
  await context.addInitScript(()=>{
    // Simulate stale browser QA identity and unrelated saved records. Reserved
    // query flags must neither open that identity nor clear either storage area.
    localStorage.setItem('account-preview:v1:identity',JSON.stringify({id:'11111111-1111-4111-8111-111111111111'}));
    localStorage.setItem('candidate-sentinel','preserve');sessionStorage.setItem('candidate-sentinel','preserve');
    window.__storageBefore=JSON.stringify(Object.entries(localStorage).sort());
    window.__sessionBefore=JSON.stringify(Object.entries(sessionStorage).sort());
  });
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  for(const query of ['', '?lab=1&demo=june&reset=1&sync=preview&device=two&onboarding=preview&onboarding-theme-preview=1']){
    await p.goto('https://candidate.test/index.html'+query+'#settings');await p.locator('body[data-account-view="welcome"]').waitFor();
    assert.equal(new URL(p.url()).pathname,'/account/index.html');assert.equal(new URL(p.url()).hash,'#settings');
    assert.equal(await p.locator('#account-intro').innerText(),'Open the installed app to sign in.');
    await context.setOffline(true);
    assert(await p.locator('#account-signup').isDisabled());assert(await p.locator('#account-signin').isDisabled());
    assert.equal(await p.locator('#account-preview-a,#account-profile-form,#onboarding-preview-account,[href*="lab=1"],[href*="../checkin/"]').count(),0);
    assert.equal(await p.evaluate(()=>typeof window.startCheckin),'undefined','Product code must not mount before authentication');
    for(const kind of ['terms','privacy']){
      await p.locator('#account-welcome [data-mobile-policy="'+kind+'"]').click();await p.locator('body[data-account-view="policies"]').waitFor();
      assert.equal(await p.locator('#mobile-policy-version').innerText(),'Version '+saved.policies[kind]);
      assert((await p.locator('#mobile-policy-content').innerText()).length>1000);
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await p.locator('#mobile-policy-back').click();await p.locator('body[data-account-view="welcome"]').waitFor();
    }
    assert(await p.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort())===window.__storageBefore));
    assert(await p.evaluate(()=>JSON.stringify(Object.entries(sessionStorage).sort())===window.__sessionBefore));
    assert.equal(await p.locator('#shell-tabs').isVisible(),false);
    assert.equal(await p.evaluate(()=>window.WhoseDayPlatform),undefined);
    checks.push({width,query:query||'default',passed:true});
  }
  await p.screenshot({path:resolve(out,width+'-welcome.png'),fullPage:true});
  assert.deepEqual(missing,[]);
  for(const route of ['/preview/index.html','/checkin/index.html','/lab.js']){const response=await p.goto('https://candidate.test'+route);assert.equal(response.status(),404);}
  assert.deepEqual(missing,['/preview/index.html','/checkin/index.html','/lab.js']);
  // This shim checks the unconfigured native branch's DOM wiring only. It is
  // deliberately not evidence of a working native bridge or verified login.
  if(!saved.authConfigured){
    await context.addInitScript(()=>{window.CapacitorCustomPlatform={name:'ios'};});
    const shim=await context.newPage();shim.on('pageerror',e=>errors.push(e.message));await shim.goto('https://candidate.test/account/index.html');
    await shim.locator('body[data-account-view="welcome"]').waitFor();
    assert.equal(await shim.evaluate(()=>Capacitor.isNativePlatform()),true);
    assert(await shim.locator('#account-unconfigured').isVisible());assert(await shim.locator('#account-signup').isDisabled());assert(await shim.locator('#account-signin').isDisabled());
    assert.equal(await shim.locator('#account-message').innerText(),'');await shim.close();checks.push({width,unconfiguredNativeDOMShim:true,passed:true});
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();
}
}finally{await browser.close()}
await writeFile(resolve(out,'result.json'),JSON.stringify({profile:saved.profile,authConfigured:saved.authConfigured,files:Object.keys(saved.files).length,checks,limits:['Browser and static payload QA only; native candidate archive/device and provider flows remain gated.']},null,2)+'\n');
console.log('Candidate passed: exact manifest, omitted lab routes/fixtures, reserved-query and stored-preview rejection, offline-bundled policies, unchanged browser storage at 320px/390px.');
