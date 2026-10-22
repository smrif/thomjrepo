import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {once} from 'node:events';
import {chromium} from 'playwright';
import '../backup.js';
const B=globalThis.WhoseDayBackup,root=resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403).end();return}try{res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(path)]||'application/octet-stream'}).end(await readFile(path))}catch{res.writeHead(404).end()}});
server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
try{
 browser=await chromium.launch();
 const account={id:'backup-owner',email:'backup@example.com'};
 const date=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const today=date(0),yesterday=date(-1),old=date(-2);
 const config={currentParentLabel:'Alex <Parent>',coParentLabel:'Jordan & Co',children:['Avery <Kid>','Sam'],email:account.email,activityIds:['school','Art <class>'],themeMode:'dark',purpose:'Backup test',termsAccepted:true,termsVersion:'2026-10-13',termsAcceptedAt:'2026-10-19T12:00:00Z',privacyVersion:'2026-10-13',privacyAcceptedAt:'2026-10-19T12:00:00Z',policyAcceptanceOwnerId:account.id};
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
 const entry={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Avery <Kid>'],diary:'Literal <img src=x onerror="window.backupXss=1"> & quotes',attachment:{name:'screen.png',type:'image/png',dataUrl:png},loggedAt:new Date().toISOString()};
 const records={[old]:entry,[yesterday]:{week:'not-logged',intentional:true},[today]:{...entry,diary:'Today’s original note'}};
 for(const [width,theme] of [[390,'dark'],[1280,'light']]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(({config,records,theme})=>{if(!localStorage.getItem('custody_tracker_config')){localStorage.setItem('custody_tracker_config',JSON.stringify({...config,themeMode:theme}));localStorage.setItem('familylog_entries',JSON.stringify(records))}},{config,records,theme});
  await context.route('**/supabase-client.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.cloudRows=[];window.cloudWrites=[];window.WhoseDayBackend={isEnabled:()=>true,getSession:async()=>({user:${JSON.stringify(account)}}),getProfile:async()=>null,upsertProfile:async row=>row,getCustodyEntries:async()=>cloudRows,saveCustodyEntry:async row=>{cloudWrites.push(row);const saved={...row,updated_at:'v'+Date.now()};cloudRows=cloudRows.filter(x=>x.entry_date!==row.entry_date);cloudRows.push(saved);return saved},upsertSyncDevice:async row=>row};`}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.locator('#s-home.active').waitFor();
  await context.setOffline(true);
  await page.evaluate(()=>showSetup());
  await page.getByRole('button',{name:'Download full backup',exact:true}).click();
  const pending=page.waitForEvent('download');await page.locator('#backup-download').click();const downloaded=await pending;
  const text=await readFile(await downloaded.path(),'utf8'),file=await B.parse(text);
  assert.deepEqual(file.entries,records);assert.equal(file.account.id,account.id);assert(!text.includes('refresh_token'));
  const choose=async(content=text,name='backup.json')=>{await page.locator('#backup-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(content)})};
  const openImport=async()=>{await page.evaluate(()=>showSetup());await page.getByRole('button',{name:'Restore from backup',exact:true}).click()};
  await page.evaluate(()=>{putEntries({},{skipSync:true});saveConfig({...APP_CONFIG,currentParentLabel:'Current parent',children:['Current child'],termsVersion:'future-policy',termsAcceptedAt:'2027-01-01T00:00:00Z'});showSetup()});
  await openImport();await choose();await page.locator('#backup-preview:visible').waitFor();
  assert.deepEqual(await page.evaluate(()=>getEntries()),{},'Preview must not write records');
  assert.equal(await page.locator('#backup-restore-profile').isChecked(),false);
  await page.locator('#backup-restore-profile').check();
  await page.screenshot({path:'/tmp/whose-day-backup-preview-'+theme+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#backup-restore-confirm').click();await page.waitForFunction(()=>document.getElementById('backup-import-message').textContent.startsWith('Restored'));
  assert.deepEqual(await page.evaluate(()=>getEntries()),records);
  assert.equal(await page.evaluate(()=>APP_CONFIG.currentParentLabel),config.currentParentLabel);
  assert.equal(await page.evaluate(()=>APP_CONFIG.termsVersion),'future-policy');
  assert.equal(await page.evaluate(()=>APP_CONFIG.email),account.email);
  assert.equal(await page.evaluate(()=>localStorage.getItem(WhoseDayBackup.JOURNAL_KEY)),null);
  await page.evaluate(date=>{initHome();showDetail(date,getEntries()[date])},old);
  assert.equal(await page.evaluate(()=>window.backupXss),undefined);
  assert.equal(await page.locator('#cal-detail img').count(),1,'Only the saved screenshot may render as an image');
  await page.waitForFunction(()=>document.querySelector('#cal-detail img')?.naturalWidth===1,'',{timeout:10000});
  assert.match(await page.locator('#cal-detail').innerText(),/Literal <img/);
  assert.match(await page.locator('#home-recent-inner').innerText(),/Today’s original note/);
  // Reload restores saved records and never takes policy acceptance from the file.
  await context.setOffline(false);await page.reload();await page.waitForFunction(()=>!cloudSyncBusy&&!cloudSyncPending);
  assert.deepEqual(await page.evaluate(()=>getEntries()),records);assert.equal(await page.evaluate(()=>APP_CONFIG.termsVersion),'future-policy');
  await context.setOffline(true);await openImport();
  const before=await page.evaluate(()=>localStorage.getItem('familylog_entries'));
  await choose('{not json');await page.waitForFunction(()=>document.getElementById('backup-import-message').dataset.tone==='error');
  assert.equal(await page.locator('#backup-preview').isVisible(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('familylog_entries')),before);
  const wrong=await B.create({account:{...account,id:'another-owner'},config,records});await choose(JSON.stringify(wrong));
  await page.waitForFunction(()=>document.getElementById('backup-import-message').textContent.includes('different account'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('familylog_entries')),before);
  // Existing locked records remain protected; editable conflicts default to current.
  await page.evaluate(({old,today,entry})=>{putEntries({...getEntries(),[old]:{...entry,diary:'Locked current'},[today]:{...entry,diary:'Current editable'}},{skipSync:true})},{old,today,entry});
  await choose();await page.locator('#backup-preview:visible').waitFor();
  assert.equal(await page.locator('[data-backup-date="'+old+'"]').count(),0);
  assert.equal(await page.locator('.backup-record-details').count(),4,'Each differing date offers both complete records for comparison');
  assert.match(await page.locator('.backup-record-details').first().textContent(),/Locked current/);
  await page.locator('.backup-record-details').nth(1).locator('summary').click();
  await page.screenshot({path:'/tmp/whose-day-backup-conflict-'+theme+'.png',fullPage:true});
  assert.equal(await page.locator('#backup-restore-confirm').isEnabled(),false);
  await page.locator('[data-backup-date="'+today+'"]').selectOption('backup');await page.locator('#backup-restore-confirm').click();
  await page.waitForFunction(()=>document.getElementById('backup-import-message').textContent.startsWith('Restored'));
  assert.equal(await page.evaluate(d=>getEntries()[d].diary,old),'Locked current');
  assert.equal(await page.evaluate(d=>getEntries()[d].diary,today),records[today].diary);
  // A sync finishing after preview requires a new review before any restore.
  await page.evaluate(({today,entry})=>{putEntries({...getEntries(),[today]:{...entry,diary:'Before preview'}},{skipSync:true})},{today,entry});
  await choose();await page.locator('#backup-preview:visible').waitFor();await page.locator('[data-backup-date="'+today+'"]').selectOption('backup');
  await page.evaluate(()=>{cloudSyncTask=new Promise(resolve=>window.finishBackupSync=resolve)});
  await page.locator('#backup-restore-confirm').click();
  await page.evaluate(({today,entry})=>{putEntries({...getEntries(),[today]:{...entry,diary:'Arrived during preview'}},{skipSync:true});finishBackupSync(null)},{today,entry});
  await page.waitForFunction(()=>document.getElementById('backup-import-message').textContent.includes('updated preview'));
  assert.equal(await page.evaluate(d=>getEntries()[d].diary,today),'Arrived during preview');
  assert.equal(await page.locator('[data-backup-date="'+today+'"]').inputValue(),'current');
  // A failed write keeps all old values and leaves the preview available to retry.
  await page.locator('[data-backup-date="'+today+'"]').selectOption('backup');
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.backupStorageSetter=original;let once=true;Storage.prototype.setItem=function(k,v){if(k==='familylog_entries'&&once){once=false;throw new DOMException('Full','QuotaExceededError')}return original.call(this,k,v)}});
  const savedBeforeFailure=await page.evaluate(()=>localStorage.getItem('familylog_entries'));
  await page.locator('#backup-restore-confirm').click();await page.waitForFunction(()=>document.getElementById('backup-import-message').textContent.includes('previous records were kept'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('familylog_entries')),savedBeforeFailure);
  assert.equal(await page.evaluate(()=>localStorage.getItem(WhoseDayBackup.JOURNAL_KEY)),null);
  await page.evaluate(()=>{Storage.prototype.setItem=backupStorageSetter});
  await page.locator('.settings-back').click();assert.equal(await page.locator('#backup-preview').isVisible(),false);
  assert.equal(await page.evaluate(()=>backupImportReview),null);
  // Leaving during an asynchronous read invalidates it even if Import is reopened.
  await openImport();
  await page.evaluate(()=>{const original=File.prototype.text;window.originalBackupFileText=original;File.prototype.text=function(){const file=this;return new Promise(resolve=>window.finishBackupFileRead=()=>resolve(original.call(file)))}});
  await choose();await page.waitForFunction(()=>typeof finishBackupFileRead==='function');
  await page.locator('.settings-back').click();await page.getByRole('button',{name:'Restore from backup',exact:true}).click();
  await page.evaluate(()=>{File.prototype.text=originalBackupFileText;finishBackupFileRead()});
  await page.waitForFunction(()=>!document.getElementById('backup-file').value);
  assert.equal(await page.evaluate(()=>backupImportReview),null);
  assert.equal(await page.locator('#backup-preview').isVisible(),false);
  // Imported dates with different cloud copies must use the normal conflict review.
  await page.evaluate(({today,entry,account})=>{putEntries({},{skipSync:true});cloudRows=[{user_id:account.id,entry_date:today,entry_json:{...entry,diary:'Cloud copy kept'},updated_at:'cloud-version'}];cloudWrites=[]},{today,entry,account});
  await openImport();await choose();await page.locator('#backup-preview:visible').waitFor();await page.locator('#backup-restore-confirm').click();
  await page.waitForFunction(()=>document.getElementById('backup-import-message').textContent.startsWith('Restored'));
  await context.setOffline(false);await page.evaluate(()=>checkAppAccess().then(()=>syncCloudData({reason:'backup-test'})));
  await page.waitForFunction(()=>!cloudSyncBusy&&!cloudSyncPending);
  assert((await page.evaluate(()=>getStoredSyncConflicts())).some(c=>c.entry_date===today));
  assert.equal(await page.evaluate(d=>cloudRows.find(r=>r.entry_date===d).entry_json.diary,today),'Cloud copy kept');
  assert.equal(await page.evaluate(d=>cloudWrites.filter(r=>r.entry_date===d).length,today),0);
  assert.deepEqual(errors,[]);await context.close();
 }
 // An interrupted commit rolls back before normal app startup. If the recovery
 // module is unavailable, protected screens and cloud writes must stay blocked.
 for(const missingModule of [false,true]){
  const recovery=await browser.newContext({serviceWorkers:'block'});
  await recovery.addInitScript(({config,records})=>{
   const before={custody_tracker_config:JSON.stringify(config),familylog_entries:JSON.stringify(records)};
   localStorage.setItem('whose_day_restore_journal_v1',JSON.stringify({before}));
   localStorage.setItem('custody_tracker_config',JSON.stringify({...config,currentParentLabel:'Partial restore'}));
   localStorage.setItem('familylog_entries','{}');
  },{config,records});
  await recovery.route('**/supabase-client.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.WhoseDayBackend={isEnabled:()=>true,getSession:async()=>({user:${JSON.stringify(account)}}),getProfile:async()=>null,upsertProfile:async row=>row,getCustodyEntries:async()=>[],saveCustodyEntry:async row=>row,upsertSyncDevice:async row=>row};`}));
  if(missingModule)await recovery.route('**/backup.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.WhoseDayBackup=undefined;'}));
  const page=await recovery.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
  if(missingModule){
   await page.locator('#s-backup-recovery.active').waitFor();assert.equal(await page.evaluate(()=>cloudSyncAllowed()),false);
   await page.evaluate(()=>showSetup());assert.equal(await page.locator('#s-setup').isVisible(),false);
   assert(await page.evaluate(()=>localStorage.getItem('whose_day_restore_journal_v1')));
  }else{
   await page.locator('#s-home.active').waitFor();assert.equal(await page.evaluate(()=>APP_CONFIG.currentParentLabel),config.currentParentLabel);
   assert.deepEqual(await page.evaluate(()=>getEntries()),records);assert.equal(await page.evaluate(()=>localStorage.getItem('whose_day_restore_journal_v1')),null);
  }
  await recovery.close();
 }
 console.log('Backup UI passed: real JSON download/import, screenshots, safe text, profile/consent preservation, same-account checks, locked/editable conflicts, stale preview, rollback, reload, offline and cloud conflict handling in both themes/viewports.');
}finally{if(browser)await browser.close();server.close();await once(server,'close')}
