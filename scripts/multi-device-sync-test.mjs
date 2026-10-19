import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const cloud = new Map();
let version = 0;
const server = createServer(async (req, res) => {
  if (req.url === '/test-cloud') {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { row, expected } = JSON.parse(body);
      const previous = cloud.get(row.entry_date);
      if ((previous?.updated_at || null) !== expected) { res.end('null'); return; }
      const saved = { ...row, updated_at: `version-${++version}` };
      cloud.set(row.entry_date, saved);
      res.end(JSON.stringify(saved));
    } else res.end(JSON.stringify([...cloud.values()]));
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  const path = resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const content = await readFile(path);
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch();
  const now = new Date();
  const format = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = format(now);
  const yesterdayDate = new Date(now); yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = format(yesterdayDate);
  const original = { week: 'dad', dadMode: 'normal', kidsWithDad: ['Child'], diary: 'Older local copy', loggedAt: '2026-10-12T18:21:44Z' };
  const latest = { ...original, diary: 'Latest phone copy', loggedAt: '2026-10-12T18:25:51Z' };
  cloud.set(yesterday, { entry_date: yesterday, entry_json: latest, updated_at: 'version-original', device_id: 'phone' });
  const errors = [];
  async function device(kind, entry) {
    const context = await browser.newContext({ viewport: kind === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(({ yesterday, entry }) => {
      if (location.protocol !== 'http:' || localStorage.getItem('custody_tracker_config')) return;
      localStorage.setItem('custody_tracker_config', JSON.stringify({ currentParentLabel: 'Dad', coParentLabel: 'Mom', children: ['Child'], email: 'test@example.com', termsAccepted: true, themeMode: 'dark' }));
      localStorage.setItem('familylog_entries', JSON.stringify({ [yesterday]: entry }));
    }, { yesterday, entry });
    await context.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
      window.profileWrites=0; window.deviceWrites=0;
      window.WhoseDayBackend={
        isEnabled:()=>true, getSession:async()=>({user:{id:'test-owner'}}),
        getProfile:async()=>null,
        upsertProfile:async row=>{window.profileWrites++;return row;},
        getCustodyEntries:async()=>(await fetch('/test-cloud')).json(),
        saveCustodyEntry:async(row,expected)=>(await fetch('/test-cloud',{method:'POST',body:JSON.stringify({row,expected})})).json(),
        upsertSyncDevice:async row=>{window.deviceWrites++;return row;}
      };` }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !cloudSyncBusy && !cloudSyncPending);
    await page.waitForFunction(() => Boolean(cloudSyncRefreshTimer));
    return { context, page };
  }
  const phone = await device('phone', latest);
  const desktop = await device('desktop', original);
  assert.equal(await desktop.page.evaluate(() => getStoredSyncConflicts().length), 1);
  await phone.context.setOffline(true);
  await desktop.context.setOffline(true);
  await phone.page.evaluate(() => {
    const entries = getEntries();
    entries[todayStr()] = { week: 'dad', dadMode: 'normal', kidsWithDad: ['Child'], diary: 'Logged only on phone while offline', loggedAt: new Date().toISOString() };
    putEntries(entries);
  });
  // The receiving device checks before the offline sender reconnects.
  await desktop.context.setOffline(false);
  await desktop.page.waitForFunction(() => !cloudSyncBusy && !cloudSyncPending);
  await desktop.page.evaluate(() => { showCal(); showEmptyDetail(todayStr()); });
  assert.match(await desktop.page.locator('#cal-detail').innerText(), /Nothing logged/);
  const profileWrites = await desktop.page.evaluate(() => profileWrites);
  await phone.context.setOffline(false);
  await phone.page.waitForFunction(() => !cloudSyncBusy && !cloudSyncPending && getEntrySyncBase('test-owner')[todayStr()]?.diary === 'Logged only on phone while offline');
  assert(cloud.has(today));
  // No focus event, reload, Settings visit, or manual sync on the desktop.
  await desktop.page.waitForFunction(() => getEntries()[todayStr()]?.diary === 'Logged only on phone while offline', null, { timeout: 25000 });
  assert.equal(await desktop.page.locator('#s-cal').isVisible(), true);
  assert.match(await desktop.page.locator('#cal-detail').innerText(), /Logged only on phone while offline/);
  assert.equal(await desktop.page.locator(`.cal-cell[data-date="${today}"]`).evaluate(cell => cell.classList.contains('dad-day')), true);
  assert.equal(await desktop.page.evaluate(() => profileWrites), profileWrites, 'Periodic receiving checks must not rewrite profile settings');
  assert.equal(await desktop.page.evaluate(yesterday => getEntries()[yesterday].diary, yesterday), 'Older local copy', 'An unrelated old conflict remains protected');
  assert.equal(cloud.get(yesterday).entry_json.diary, 'Latest phone copy');
  await desktop.page.evaluate(() => showExport());
  await desktop.page.evaluate(() => selectExport('full'));
  const reportText = await desktop.page.locator('#reports-stats-bar').innerText();
  await phone.page.evaluate(() => {
    const entries = getEntries();
    const date = new Date(); date.setDate(date.getDate() + 1);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    entries[key] = { week: 'dad', dadMode: 'normal', kidsWithDad: ['Child'], diary: 'Another remotely received entry', loggedAt: new Date().toISOString() };
    putEntries(entries);
  });
  await desktop.page.waitForFunction(previous => document.getElementById('reports-stats-bar').innerText !== previous, reportText, { timeout: 25000 });
  assert.equal(await desktop.page.locator('#s-export').isVisible(), true);
  assert.match(await desktop.page.locator('#preview-box').innerText(), /Another remotely received entry/);
  await desktop.page.screenshot({ path: '/tmp/whose-day-receiving-sync.png' });
  assert.deepEqual(errors, []);
  console.log('Multi-device receiving passed: desktop reconnects first, later phone upload arrives automatically, Calendar/detail and Reports refresh, profile is not rewritten, and unrelated old conflicts stay protected.');
  await phone.context.close(); await desktop.context.close();
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
