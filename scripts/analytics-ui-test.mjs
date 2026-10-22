import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'..'),browser=await chromium.launch();
try{
 for(const [width,theme] of [[390,'dark'],[1280,'light']]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),events=[];
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='api.mixpanel.com'){
    events.push(...JSON.parse(route.request().postData()));
    return route.fulfill({contentType:'application/json',body:'{"status":1}'});
   }
   if(url.hostname!=='whosedayapp.com')return route.abort();
   if(url.pathname==='/supabase-client.js')return route.fulfill({contentType:'text/javascript',body:`
    window.testSession=null;
    window.WhoseDayBackend={isEnabled:()=>true,getSession:async()=>testSession,
     signInWithEmail:async()=>{},getProfile:async()=>null,upsertProfile:async row=>row,
     getCustodyEntries:async()=>[],upsertSyncDevice:async row=>row,saveCustodyEntry:async row=>({...row,updated_at:'mock'})};`});
   const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root+sep))return route.abort();
   try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(path)]||'application/octet-stream',body:await readFile(path)})}catch{return route.abort()}
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://whosedayapp.com/');
  await page.evaluate(theme=>setThemeMode(theme,false),theme);
  await page.locator('.landing-nav').getByRole('button',{name:'Sign up',exact:true}).click();
  await page.locator('#btn-ob-name').click();
  assert.equal(await page.locator('#s-ob-name').evaluate(el=>el.classList.contains('active')),true);
  await page.locator('#ob-name').fill('PRIVATE_PARENT');await page.locator('#btn-ob-name').click();
  await page.locator('#s-ob-coparent .ob-btn-back').click();
  await page.locator('#btn-ob-name').click();
  await page.locator('#ob-coparent').fill('PRIVATE_COPARENT');
  await page.locator('#s-ob-coparent .ob-btn-primary').click();
  await page.locator('.ob-kid-input').first().fill('PRIVATE_CHILD');await page.locator('#btn-ob-kids').click();
  await page.locator('#ob-email').fill('private-email@example.com');await page.locator('#ob-terms').check();
  await page.locator('#btn-ob-finish').click();
  await page.locator('#ob-login-message').filter({hasText:'link sent'}).waitFor();
  await page.evaluate(()=>WhoseDayAnalytics.flush());
  assert(events.some(e=>e.event==='Signup Link Sent'));
  assert(!events.some(e=>e.event==='Flow Completed'));
  assert(events.some(e=>e.event==='Step Back'));
  await page.evaluate(async()=>{testSession={user:{id:'private-auth-id',email:'private-email@example.com'}};await restoreLoggedOutCloudAccount()});
  await page.locator('#s-home.active').waitFor();
  await page.evaluate(()=>startCheckin());await page.locator('#wk-dad').click();
  await page.locator('#sc-dad-normal').click();
  await page.locator('#dad-help-no').click();
  await page.locator('#diary-input').fill('PRIVATE_NOTE');
  await page.locator('#diary-next-btn').click();await page.locator('#s-saved.active').waitFor();
  await page.evaluate(()=>WhoseDayAnalytics.flush());
  assert(events.some(e=>e.event==='Signup Verified'));
  assert.equal(events.filter(e=>e.event==='Flow Completed'&&e.properties.flow==='signup').length,1);
  assert.equal(events.filter(e=>e.event==='Flow Completed'&&e.properties.flow==='checkin').length,1);
  await page.evaluate(()=>{
   show('s-home');show('s-home');showCal();
   showDetail(todayStr(),getEntries()[todayStr()]);
   showDetail(todayStr(),getEntries()[todayStr()],{reveal:false});
   showEmptyDetail(yesterdayStr());switchTab('trends');setTrendsFilter('90');setTrendsFilter('90');
   showExport();setReportFilter('30');selectExport('full');
  });
  const csvDownload=page.waitForEvent('download');await page.evaluate(()=>exportAllData());await csvDownload;
  await page.evaluate(()=>{showSetup();openSettingsPage('activities');document.getElementById('setup-custom-activity').value='PRIVATE_ACTIVITY';addCustomActivity()});
  const jsonDownload=page.waitForEvent('download');await page.evaluate(()=>{openSettingsPage('backup');return downloadFullBackup()});
  const jsonFile=await jsonDownload;
  const backupBytes=await readFile(await jsonFile.path());
  await page.evaluate(()=>{openSettingsPage('import');const entries=getEntries();delete entries[todayStr()];putEntries(entries,{skipSync:true})});
  await page.locator('#backup-file').setInputFiles({name:'test-backup.json',mimeType:'application/json',buffer:backupBytes});
  await page.locator('#backup-import-message').filter({hasText:'Preview ready'}).waitFor();
  await page.locator('#backup-restore-confirm').click();
  await page.locator('#backup-import-message').filter({hasText:'Restored'}).waitFor();
  await page.evaluate(()=>{
    show('s-home');const entries=getEntries();delete entries[yesterdayStr()];entries['2026-01-01']={week:'not-logged'};putEntries(entries,{skipSync:true});
    localStorage.removeItem('missed_dismissed_'+todayStr());checkMissedPrompt();checkMissedPrompt();startBackfill();
    show('s-home');dismissMissedPrompt();
  });
  await page.evaluate(()=>WhoseDayAnalytics.flush());
  for(const event of ['Today Viewed','Calendar Viewed','Calendar Day Viewed','Trends Viewed','Trends Filter Changed','Reports Viewed','Reports Filter Changed','Report Generated','Settings Viewed','Settings Section Viewed','Export Started','Export Download Requested','Custom Activity Added','Check-in Saved','Restore Previewed','Restore Completed','Missed Check-in Shown','Missed Check-in Log Selected','Missed Check-in Skip Selected'])assert(events.some(e=>e.event===event),event);
  assert.equal(events.filter(e=>e.event==='Calendar Day Viewed').length,2,'Background refresh must not create a day view');
  assert.equal(events.filter(e=>e.event==='Trends Filter Changed').length,1);
  assert(events.some(e=>e.event==='Report Generated'&&e.properties.report_type==='full'&&e.properties.range==='30'));
  assert(events.some(e=>e.event==='Check-in Saved'&&e.properties.usage==='first'));
  const serialized=JSON.stringify(events);
  for(const secret of ['PRIVATE_PARENT','PRIVATE_COPARENT','PRIVATE_CHILD','PRIVATE_NOTE','PRIVATE_ACTIVITY','private-email','private-auth-id','access_token','refresh_token'])assert(!serialized.includes(secret),secret+' must never leave app');
  await page.evaluate(()=>{showSetup();openSettingsPage('delete')});
  await page.waitForFunction(()=>!cloudAuthBusy);
  await page.evaluate(async()=>{
    document.getElementById('cloud-delete-confirm').value='DELETE';
    window.WhoseDayBackend.deleteAccount=async()=>{throw new Error('fetch PRIVATE_DELETION_ERROR')};
    await deleteCloudAccount();
  });
  await page.evaluate(()=>WhoseDayAnalytics.flush());
  assert(!events.some(e=>e.event==='Account Deletion Completed'));
  assert(events.some(e=>e.event==='Account Deletion Failed'&&e.properties.error_category==='network'));
  await page.evaluate(async()=>{window.WhoseDayBackend.deleteAccount=async()=>{testSession=null};await deleteCloudAccount()});
  await page.evaluate(()=>WhoseDayAnalytics.flush());
  assert.equal(events.filter(e=>e.event==='Account Deletion Completed').length,1);
  assert(!JSON.stringify(events).includes('PRIVATE_DELETION_ERROR'));
  await page.locator('#s-ob-welcome [data-analytics-choice]').uncheck();
  const count=events.length;await page.evaluate(()=>{startCheckin();return WhoseDayAnalytics.flush()});assert.equal(events.length,count);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Analytics browser passed: signup/check-in, views/filters/reports, real CSV/JSON downloads and restore, missed-check-in choices, deletion failure/success, private-field exclusion and opt-out in both viewports. All requests intercepted; no live analytics sent.');
}finally{await browser.close()}
