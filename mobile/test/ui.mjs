import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '../../node_modules/playwright/index.mjs';
const browser=await chromium.launch(),root=resolve(import.meta.dirname,'../www');
const evidence=resolve(import.meta.dirname,'../.build/shell');
await mkdir(evidence,{recursive:true});
const cases=[
  {name:'small-phone',width:320,height:568},
  {name:'iphone',width:390,height:844,safe:true},
  {name:'landscape',width:844,height:390,safe:true},
  {name:'dark',width:390,height:844,dark:true},
  {name:'desktop',width:1280,height:900},
];
const settled=async page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try{for(const test of cases){
  const viewport={width:test.width,height:test.height};
  const context=await browser.newContext({viewport,colorScheme:test.dark?'dark':'light',reducedMotion:'reduce',serviceWorkers:'block'}),requests=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.hostname!=='lab.test'){requests.push(url.hostname);return route.abort()}
    const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+'/'))return route.abort();
    try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream',body:await readFile(file)})}catch{await route.abort()}
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://lab.test/');
  await page.getByText('Browser preview: native persistence',{exact:false}).waitFor();assert(await page.locator('#save').isDisabled());assert(await page.locator('#send-link').isDisabled());
  await page.getByRole('link',{name:'Open iPhone app shell'}).click();await page.locator('#s-home.active').waitFor();await settled(page);
  if(test.safe)await page.addStyleTag({content:`body.mobile-shell{--safe-area-inset-top:47px;--safe-area-inset-bottom:34px;--safe-area-inset-left:${test.name==='landscape'?44:0}px;--safe-area-inset-right:${test.name==='landscape'?44:0}px;}`});
  const tabs=page.getByRole('navigation',{name:'App navigation'});
  async function layout(screen){
    await settled(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),test.name+' horizontal overflow');
    assert.equal(await tabs.getByRole('button').count(),4);
    assert.equal(await page.locator('#app .bottom-nav:visible').count(),0);
    assert(await page.locator('.shell-skip').evaluate(el=>el.getBoundingClientRect().bottom<=0),'skip link hidden until focused');
    assert.equal(await tabs.locator('[aria-current="page"]').getAttribute('data-shell-tab'),screen);
    assert(await page.evaluate(()=>document.activeElement.matches('h1,h2,[role="heading"]')),'page heading receives focus');
    assert(await tabs.getByRole('button').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44&&b.getBoundingClientRect().width>=44)));
    assert(await page.evaluate(()=>{const h=document.getElementById('shell-header').getBoundingClientRect(),n=document.getElementById('shell-tabs').getBoundingClientRect();return h.top===0&&Math.abs(n.bottom-innerHeight)<1&&h.bottom<n.top}));
  }
  await layout('s-home');
  const spacing=await page.evaluate(()=>({greeting:document.getElementById('home-greeting').getBoundingClientRect().top,header:document.getElementById('shell-header').getBoundingClientRect().bottom,scroll:scrollY,padding:getComputedStyle(document.getElementById('app')).paddingTop}));
  assert(spacing.greeting>=spacing.header,JSON.stringify(spacing));
  await page.screenshot({path:resolve(evidence,test.name+'-today.png')});
  await tabs.getByRole('button',{name:'Calendar',exact:true}).click();await layout('s-cal');
  await tabs.getByRole('button',{name:'Reports',exact:true}).click();await layout('s-export');
  await tabs.getByRole('button',{name:'Settings',exact:true}).click();await layout('s-setup');
  await page.evaluate(()=>scrollTo(0,300));await settled(page);
  const settingsScroll=await page.evaluate(()=>scrollY);assert(settingsScroll>0);
  await tabs.getByRole('button',{name:'Today',exact:true}).click();await settled(page);
  await tabs.getByRole('button',{name:'Settings',exact:true}).click();await settled(page);
  assert(Math.abs(await page.evaluate(()=>scrollY)-settingsScroll)<2,'tab scroll restored');
  // Name is above the restored position. Open it from the top so Playwright's
  // own scroll-to-click does not change the position this back check expects.
  await page.evaluate(()=>scrollTo(0,0));await settled(page);
  await page.locator(`button[onclick*="openSettingsPage('name'"]`).click();await settled(page);
  assert(await page.getByRole('button',{name:'Back to Settings',exact:true}).isVisible());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-heading-name');
  await page.locator('#setup-current-parent').focus();
  await page.setViewportSize({width:test.width,height:Math.max(230,test.height-250)});await settled(page);
  assert.equal(await page.locator('body').getAttribute('data-shell-keyboard'),'true');
  assert(!(await tabs.isVisible()));
  await page.setViewportSize(viewport);await settled(page);
  assert(await tabs.isVisible());
  await page.getByRole('button',{name:'Back to Settings',exact:true}).click();await settled(page);
  assert(await page.evaluate(()=>scrollY)<2,'Settings back scroll restored');
  await tabs.getByRole('button',{name:'Today',exact:true}).click();await settled(page);
  await page.locator('#home-primary-btn').click();await page.locator('#s-week.active').waitFor();await settled(page);
  assert(!(await tabs.isVisible()));assert(await page.locator('#shell-back').isVisible());
  assert.equal(await page.locator('#s-week .top-bar:visible').count(),0);
  await page.screenshot({path:resolve(evidence,test.name+'-checkin.png')});
  await page.locator('#wk-dad').click();await page.locator('body[data-active-screen="s-dad-mode"]').waitFor();await settled(page);
  await page.locator('#shell-back').click();await page.locator('#s-week.active').waitFor();await settled(page);
  await page.locator('#shell-back').click();await page.locator('#s-home.active').waitFor();await layout('s-home');
  await page.getByRole('button',{name:'Open Settings',exact:true}).click();await layout('s-setup');
  await page.locator(`button[onclick*="openSettingsPage('name'"]`).click();await settled(page);
  await page.reload();await settled(page);
  assert(await page.getByRole('button',{name:'Back to Settings',exact:true}).isVisible(),'Settings detail reload');
  const settingsHash=await page.evaluate(()=>location.hash);
  await page.locator('.shell-skip').focus();
  assert(await page.locator('.shell-skip').evaluate(el=>el.getBoundingClientRect().top>=0));
  await page.locator('.shell-skip').click();
  assert.equal(await page.evaluate(()=>location.hash),settingsHash,'skip preserves Settings route');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'app');
  if(test.name==='small-phone'){
    await page.getByRole('button',{name:'Back to Settings',exact:true}).click();
    await page.addStyleTag({content:'.shell-brand span{font-size:32px}.shell-sample{font-size:16px}.shell-tabs button{font-size:20px}.shell-context{font-size:24px}'});
    await settled(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'large text overflow');
  }
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await context.close();
  console.log('Shell passed: '+test.name);
}console.log('Mobile shell navigation, back, scroll, keyboard, safe-area and offline checks passed.')}finally{await browser.close()}
