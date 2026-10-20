import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root=resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=resolve(root,`.${url.pathname==='/'?'/index.html':url.pathname}`);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return}
  try{res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}).end(await readFile(file))}catch{res.writeHead(404).end()}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
try{
 browser=await chromium.launch();
 for(const [width,theme] of [[390,'dark'],[1280,'light']]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.route('**/supabase-client.js*',r=>r.fulfill({contentType:'text/javascript',body: `
   window.testSession={user:{id:'settings-owner',email:'account@example.com'}};
   window.WhoseDayBackend={isEnabled:()=>true,getSession:async()=>window.testSession,
    getProfile:async()=>null,upsertProfile:async row=>row,getCustodyEntries:async()=>[],upsertSyncDevice:async row=>row,
    signOut:async()=>{window.testSession=null},signInWithEmail:async email=>{window.requestedEmail=email}};
  `}));
  await context.addInitScript(()=>{
   if(!localStorage.getItem('custody_tracker_config'))localStorage.setItem('custody_tracker_config',JSON.stringify({currentParentLabel:'Parent',children:['Avery'],email:'old-contact@example.com',termsAccepted:true}));
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.evaluate(async theme=>{await checkAppAccess();saveConfig({...DEFAULT_CONFIG,email:'old-contact@example.com',children:['Avery'],termsAccepted:true,themeMode:theme});showSetup()},theme);
  await page.waitForFunction(()=>!cloudAuthBusy&&document.getElementById('cloud-auth-title').textContent==='Signed in');
  assert.equal(await page.locator('#s-setup h2').filter({hasText:/^Account$/}).count(),1);
  assert.equal(await page.locator('#s-setup h2').filter({hasText:/Cloud account/}).count(),0);
  const account=page.locator('#setup-email').locator('xpath=ancestor::section');
  assert.equal(await account.locator('input[type=email]').count(),1);
  assert.equal(await account.locator('#cloud-auth-signout').isVisible(),true);
  assert.equal(await page.locator('#setup-email').inputValue(),'account@example.com');
  assert.equal(await page.locator('#setup-email').evaluate(e=>e.readOnly),true);
  assert.equal(await page.locator('#cloud-auth-send').count(),0);
  assert.equal(await page.evaluate(()=>reportMailto('Test','body')),'mailto:account%40example.com?subject=Test&body=body');
  await page.screenshot({path:'/tmp/whose-day-account-'+theme+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#setup-continue').click();
  await page.locator('#s-home.active').waitFor();
  assert.equal(await page.evaluate(()=>APP_CONFIG.email),'account@example.com');
  assert.equal(await page.evaluate(()=>APP_CONFIG.termsAcceptedAt),null,'Saving profile must not fabricate policy acceptance');
  await page.evaluate(()=>showSetup());
  await page.waitForFunction(()=>!cloudAuthBusy);
  await page.locator('#cloud-auth-signout').click();
  await page.locator('#s-ob-welcome.active').waitFor();
  await page.reload();await page.locator('#s-ob-welcome.active').waitFor();
  await page.evaluate(()=>showSetup());
  assert.equal(await page.locator('#s-setup').isVisible(),false);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Unified Account passed: one section/email, authenticated identity, readonly email, report recipient, save without policy restamping, sign-out and signed-out sign-in, mobile/dark and desktop/light.');
}finally{if(browser)await browser.close();server.close();await once(server,'close')}
