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
    await context.route('**/supabase-client.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.WhoseDayBackend={isEnabled:()=>false};'}));
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(theme=>{
      saveConfig({...DEFAULT_CONFIG,currentParentLabel:'Alex <Parent>',coParentLabel:'Jordan & Co',children:['Avery','Sam'],themeMode:theme});
      const common={kidsWithDad:['Avery','Sam'],dadHadKids:['Avery','Sam'],momHadKidsOnDadWeek:['Avery'],loggedAt:'2026-06-01T20:00:00Z'};
      putEntries({
        '2026-06-01':{...common,week:'mom',momMode:'dad-had',changeAgreed:true,changePressured:false},
        '2026-06-02':{...common,week:'dad',dadMode:'mom-had',changeAgreed:true,changePressured:true},
        '2026-06-03':{...common,week:'dad',dadMode:'mom-had',changeAgreed:false},
        '2026-06-04':{...common,week:'mom',momMode:'dad-had'},
        '2026-06-05':{...common,week:'dad',dadMode:'normal',kidsWithDad:['Avery'],absentData:{Sam:{location:'sleepover'}}},
        '2026-06-06':{week:'not-logged'},'2026-06-07':{week:'other',diary:'Legacy note'},
        '2026-06-08':{...common,week:'mom',momMode:'dad-had',changeAgreed:true}
      },{skipSync:true});
      showCal();setTrendsFilter('all');switchTab('trends');
    },theme);
    const coverage=await page.locator('#trends-coverage').innerText();
    assert.match(coverage,/6 custody records · 1 not-logged marker · 1 other or legacy note/);
    assert.match(coverage,/one family date, including split days/);
    assert.deepEqual(await page.locator('#stat-grid .stat-num').allTextContents(),['4','3','2','0']);
    assert.equal(await page.locator('.trends-deviation-card').count(),2);
    assert.equal(await page.locator('.trends-dev-date').count(),5);
    assert.equal(await page.locator('.flag-unknown').count(),2);
    assert.match(await page.locator('#summary-box').innerText(),/1 felt pressured, 1 agreed, 1 unexpected, 2 context not recorded/);
    assert.match(await page.locator('#stat-grid').innerText(),/Alex <Parent>/);
    assert.equal(await page.locator('#stat-grid Parent').count(),0);
    await page.locator('.trends-dev-date').first().click();
    assert.equal(await page.locator('#tc-cal').isVisible(),true);
    assert.match(await page.locator('#cal-title').innerText(),/June 2026/);
    assert.match(await page.locator('#cal-detail').innerText(),/June 1, 2026/);
    // A remote refresh must update Trends without changing filters or records.
    await page.evaluate(()=>{switchTab('trends');const e=getEntries();e['2026-06-04'].changeAgreed=false;putEntries(e,{skipSync:true});refreshCloudEntryViews(['2026-06-04'])});
    assert.equal(await page.locator('.flag-unknown').count(),1);
    await page.screenshot({path:`/tmp/whose-day-trends-${theme}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>{putEntries({'2026-06-01':{week:'other'}},{skipSync:true});renderStats()});
    assert.match(await page.locator('#summary-box').innerText(),/No custody records in this period/);
    assert.equal(await page.locator('#trends-coverage').isVisible(),false);
    assert.equal(await page.locator('.trends-deviation-card,.trends-footnote').count(),0);
    await page.screenshot({path:`/tmp/whose-day-trends-empty-${theme}.png`,fullPage:true});
    await page.evaluate(()=>{putEntries({'2026-06-01':{week:'dad',dadMode:'normal',kidsWithDad:['Avery']}},{skipSync:true});renderStats()});
    assert.match(await page.locator('#summary-box').innerText(),/No recorded schedule changes in this period/);
    assert.equal(await page.locator('#trends-coverage').isVisible(),true);
    assert.equal(await page.locator('.trends-deviation-card,.trends-footnote').count(),0);
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Trends clarity passed: family-date coverage, both directions, exclusive context counts, legacy unknowns, escaping, historical Calendar links, sync refresh, distinct empty states, mobile/dark and desktop/light.');
}finally{if(browser)await browser.close();server.close();await once(server,'close')}
