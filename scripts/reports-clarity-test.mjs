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
  await context.route('**/supabase-client.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.WhoseDayBackend={isEnabled:()=>true,getSession:async()=>({user:{id:"fixture",email:"fixture@example.com"}}),getProfile:async()=>({user_id:"fixture",terms_accepted_at:"2026-10-13T12:00:00Z"}),getCustodyEntries:async()=>[],upsertSyncDevice:async row=>row};'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>appAccessState==='signed-in'&&!appAccessTask&&!loggedOutAuthBusy);
  await page.evaluate(()=>WhoseDayBackend.isEnabled=()=>false);
  const fixtures=await page.evaluate(theme=>{
   saveConfig({...DEFAULT_CONFIG,currentParentLabel:'Alex <Parent>',coParentLabel:'Jordan & Co',children:['Avery','Sam'],themeMode:theme});renderConfigurableUi();
   const date=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
   const common={kidsWithDad:['Avery','Sam'],dadHadKids:['Avery','Sam'],momHadKidsOnDadWeek:['Avery'],diary:'A note with <tags> & punctuation'};
   const entries={
    [date(0)]:{...common,week:'mom',momMode:'dad-had',changeAgreed:true},
    [date(-1)]:{...common,week:'dad',dadMode:'mom-had',changeAgreed:true,changePressured:true,attachment:{name:'image.png',dataUrl:'data:image/png;base64,'}},
    [date(-2)]:{...common,week:'dad',dadMode:'normal',absentData:{Sam:{location:'sleepover'}}},
    [date(-3)]:{week:'not-logged'},[date(-4)]:{week:'other',diary:'Legacy note'},
    [date(-40)]:{...common,week:'mom',momMode:'dad-had',diary:'OUTSIDE PERIOD'},
    [date(1)]:{...common,week:'mom',momMode:'dad-had',diary:'FUTURE RECORD'}
   };
   putEntries(entries,{skipSync:true});showExport();setReportFilter('30');
   return {entries:JSON.stringify(getEntries()),today:date(0)};
  },theme);
  assert.deepEqual(await page.locator('.reports-stat-num').allTextContents(),['3','2','1','1']);
  for(const [type,count] of [['honest',2],['dadactual',2],['momsweek',1],['notes',4],['full',5]]){
   await page.evaluate(type=>selectExport(type),type);
   const text=await page.locator('#preview-box').innerText();
   assert.match(text,/Period: Last 30 days/);assert(text.includes('Included in this report: '+count));
   assert(!text.includes('OUTSIDE PERIOD'));assert(!text.includes('FUTURE RECORD'));
   assert.match(text,/Displayed timestamps:/);assert.match(text,/LOGGED: Unknown/);
   if(type==='honest'){
    assert.match(text,/CONTEXT: Context not recorded/);assert.match(text,/CONTEXT: Felt pressured/);
    assert(!text.includes('FULL HONESTY'));assert(!text.includes('S WEEK'));assert(!text.includes('scheduled week'));
   }
   if(type==='full')assert.match(text,/Nothing logged; custody unknown/);
  }
  await page.evaluate(()=>selectExport('honest'));
  const preview=await page.locator('#preview-box').innerText();
  const printed=await page.evaluate(()=>{
   let doc;window.open=()=>({document:{write(html){doc=new DOMParser().parseFromString(html,'text/html')},querySelectorAll:q=>doc.querySelectorAll(q),close(){}},focus(){},print(){}});
   printReport();return {body:doc.body.innerText||doc.body.textContent,report:doc.querySelector('pre').textContent,html:doc.documentElement.outerHTML};
  });
  assert.equal(printed.report,preview);assert(printed.body.includes('Included: 2'));assert(printed.body.includes('Records in period: 5'));
  assert(printed.body.includes('Alex <Parent>'));assert(!printed.html.includes('<parent>'));
  assert.equal(await page.evaluate(()=>JSON.stringify(getEntries())),fixtures.entries,'Reports must not mutate stored records');
  await page.screenshot({path:'/tmp/whose-day-reports-'+theme+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{putEntries({},{skipSync:true});selectExport('honest')});
  assert.match(await page.locator('#preview-box').innerText(),/Included in this report: 0/);
  assert.match(await page.locator('#preview-box').innerText(),/No matching records in this period/);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Reports clarity passed: all five type selections, range exclusion, family-date stats, unknown context/timestamps, preview/print parity, escaped names, no record mutation, compact empty output, mobile/dark and desktop/light.');
}finally{if(browser)await browser.close();server.close();await once(server,'close')}
