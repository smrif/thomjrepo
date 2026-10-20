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
 const config={currentParentLabel:'Alex',coParentLabel:'Jordan',children:['Child'],email:'parent@example.com',termsAccepted:true};
 async function app(state={}){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(({config,state})=>{
   if(state.saved!==false&&!localStorage.getItem('custody_tracker_config')){
    localStorage.setItem('custody_tracker_config',JSON.stringify(config));
    localStorage.setItem('familylog_entries',JSON.stringify({'2026-10-20':{week:'dad',dadMode:'normal',kidsWithDad:['Child'],diary:'Preserve this record'}}));
   }
   if(state.offline)Object.defineProperty(Navigator.prototype,'onLine',{get:()=>false,configurable:true});
   if(state.offline&&state.known)localStorage.setItem('whose_day_last_signed_in_account',JSON.stringify({id:'owner',email:'parent@example.com'}));
   if(state.signedOut)localStorage.setItem('whose_day_explicitly_signed_out','1');
   if(state.pendingEmail)localStorage.setItem('whose_day_pending_signup_email',state.pendingEmail);
  },{config,state});
  await context.route('**/supabase-client.js*',r=>r.fulfill({contentType:'text/javascript',body:`
   window.fixtureSession=${JSON.stringify(state.session||null)};
   window.requests=[];window.profileWrites=0;window.sessionReads=0;
   window.WhoseDayBackend={isEnabled:()=>true,
    getSession:async()=>{sessionReads++;if(${JSON.stringify(state.readError||null)})throw new Error(${JSON.stringify(state.readError||null)});const snapshot=fixtureSession;if(${!!state.delay})await new Promise(resolve=>window.releaseSession=resolve);return snapshot;},
    getProfile:async()=>null,getCustodyEntries:async()=>[],upsertProfile:async row=>{profileWrites++;return row},
    saveCustodyEntry:async row=>({...row,updated_at:'version'}),upsertSyncDevice:async row=>row,
    getCachedSession:()=>(${state.cached?JSON.stringify({user:{id:'owner',email:'parent@example.com'}}):'null'}),
    signInWithEmail:async(email,url,options)=>requests.push({email,options}),
    signOut:async()=>{fixtureSession=null;if(${!!state.signoutFails})throw new Error('Network unavailable')},
    subscribeAuthState:cb=>{window.emitAuth=cb}
   };
  `}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  return {page,context,state,errors};
 }
 // Existing local records do not bypass an absent session, and are retained.
 let h=await app();await h.page.waitForFunction(()=>!appAccessTask);
 assert.equal(await h.page.locator('#s-ob-welcome').isVisible(),true);
 await h.page.evaluate(()=>{showSetup();showCal();showExport();show('s-home')});
 assert.equal(await h.page.locator('#s-ob-welcome').isVisible(),true);
 assert.equal(await h.page.evaluate(()=>profileWrites),0);
 assert.match(await h.page.evaluate(()=>localStorage.getItem('familylog_entries')),/Preserve this record/);
 await h.context.close();
 // An authenticated session opens Today; explicit sign-out wins over retained cached tokens.
 const user={user:{id:'owner',email:'parent@example.com'}};
 h=await app({session:user,cached:true,signoutFails:true});
 await h.page.locator('#s-home.active').waitFor();
 await h.page.evaluate(()=>showSetup());await h.page.waitForFunction(()=>!cloudAuthBusy);
 assert.equal(await h.page.locator('#cloud-auth-send').count(),0);
 await h.page.locator('#cloud-auth-signout').click();await h.page.locator('#s-ob-welcome.active').waitFor();
 await h.page.reload();await h.page.waitForFunction(()=>!appAccessTask);
 assert.equal(await h.page.locator('#s-home').isVisible(),false);
 await h.context.close();
 // Previously authenticated devices retain offline access; unknown/signed-out devices do not.
 for(const [known,signedOut,allow] of [[true,false,true],[false,false,false],[true,true,false]]){
  h=await app({offline:true,known,signedOut});await h.page.waitForFunction(()=>!appAccessTask);
  assert.equal(await h.page.locator('#s-home').isVisible(),allow);
  assert.equal(await h.page.evaluate(()=>sessionReads),0,'Offline opening must not wait for Auth requests');
  if(allow){await h.page.evaluate(()=>showSetup());assert.match(await h.page.locator('#cloud-auth-title').innerText(),/Offline/)}
  await h.context.close();
 }
 // Do not flash protected content while a session check is unresolved.
 h=await app({session:user,delay:true});
 assert.equal(await h.page.locator('#s-home').isVisible(),false);
 await h.page.evaluate(()=>releaseSession());await h.page.locator('#s-home.active').waitFor();
 await h.context.close();
 // A late session response cannot reopen the app after an auth sign-out event.
 h=await app({session:user,delay:true});
 await h.page.evaluate(()=>{emitAuth('SIGNED_OUT');releaseSession()});
 await h.page.waitForFunction(()=>!appAccessTask);
 assert.equal(await h.page.locator('#s-ob-welcome').isVisible(),true);await h.context.close();
 // Network trouble can use a cached session; a rejected refresh token requires login.
 for(const [readError,allow] of [['Network unavailable',true],['Invalid Refresh Token',false]]){
  h=await app({readError,cached:true});await h.page.waitForFunction(()=>!appAccessTask);
  assert.equal(await h.page.locator('#s-home').isVisible(),allow);await h.context.close();
 }
 // A draft for another email cannot upload before the new account finishes setup.
 h=await app({session:{user:{id:'other',email:'other@example.com'}},pendingEmail:'parent@example.com'});
 await h.page.locator('#s-ob-name.active').waitFor();
 assert.equal(await h.page.evaluate(()=>cloudSyncAllowed()),false);
 assert.equal(await h.page.evaluate(()=>profileWrites),0);await h.context.close();
 // Browser history restoration and sign-out in another tab also close protected screens.
 for(const event of ['history','storage']){
  h=await app({session:user});await h.page.locator('#s-home.active').waitFor();
  await h.page.evaluate(event=>{
   localStorage.setItem(SIGNED_OUT_KEY,'1');
   if(event==='history')window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   else window.dispatchEvent(new StorageEvent('storage',{key:SIGNED_OUT_KEY,newValue:'1'}));
  },event);
  await h.page.locator('#s-ob-welcome.active').waitFor();await h.context.close();
 }
 // Signup keeps the name-first draft, sends one link, and waits for verified identity.
 h=await app({saved:false});await h.page.waitForFunction(()=>!appAccessTask);
 await h.page.evaluate(()=>{
  document.getElementById('ob-name').value='New parent';document.getElementById('ob-coparent').value='Other';
  document.querySelector('.ob-kid-input').value='Child';document.getElementById('ob-email').value='parent@example.com';
  document.getElementById('ob-terms').checked=true;show('s-ob-finish');
 });
 await h.page.locator('#btn-ob-finish').click();await h.page.waitForFunction(()=>requests.length===1);
 assert.equal(await h.page.locator('#s-ob-login').isVisible(),true);
 assert.equal(await h.page.evaluate(()=>requests[0].options.createUser),true);
 assert.equal(await h.page.evaluate(()=>profileWrites),0);
 h.state.session=user;
 await h.page.goto('http://127.0.0.1:'+server.address().port+'/?code=verified-signup');
 await h.page.locator('#s-home.active').waitFor();
 assert.equal(await h.page.evaluate(()=>APP_CONFIG.currentParentLabel),'New parent');
 assert.equal(await h.page.evaluate(()=>localStorage.getItem(PENDING_SIGNUP_KEY)),null);
 assert.deepEqual(h.errors,[]);await h.context.close();
 console.log('Auth entry passed: saved-profile gate, protected navigation, no auth-check flash, explicit signout/reload, offline continuity, no offline access for signed-out/unknown devices, signup verification and draft continuation.');
}finally{if(browser)await browser.close();server.close();await once(server,'close')}
