import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
// Keep the single-row mock current so startup does not generate intervening
// missed-day records that this mock cannot persist.
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const initial = { date, diary: 'Original', loggedAt: '2026-10-12T12:00:00Z' };
let cloud = { entry_date: date, entry_json: initial, updated_at: 'version-1', device_id: 'other-device' };
let version = 1;
const server = createServer(async (req, res) => {
  if (req.url === '/test-cloud') {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { row, expected } = JSON.parse(body);
      if (expected !== cloud.updated_at) { res.end('null'); return; }
      cloud = { ...row, updated_at: `version-${++version}` };
      res.end(JSON.stringify(cloud));
    } else res.end(JSON.stringify([cloud]));
    return;
  }
  const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html')}`);
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ date, initial }) => {
    localStorage.setItem('custody_tracker_config', JSON.stringify({ currentParentLabel: 'Dad', coParentLabel: 'Mom', email: 'test@example.com', children: ['Child'], termsAccepted: true, themeMode: 'dark' }));
    localStorage.setItem('familylog_entries', JSON.stringify({ [date]: initial }));
  }, { date, initial });
  await context.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.WhoseDayBackend = {
      isEnabled: () => true,
      getSession: async () => ({ user: { id: 'offline-test', email: 'test@example.com' } }),
      getProfile: async () => null, upsertProfile: async row => row,
      getCustodyEntries: async () => (await fetch('/test-cloud')).json(),
      saveCustodyEntry: async (row, expected) => (await fetch('/test-cloud', { method: 'POST', body: JSON.stringify({ row, expected }) })).json(),
      upsertSyncDevice: async row => row
    };` }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => Object.keys(getEntrySyncBase('offline-test')).length === 1 && !cloudSyncBusy);
  assert.equal(await page.locator('#s-home').isVisible(), true);
  await context.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  // Exercise the same persistence hook used by the logging UI, without opening Settings.
  await page.evaluate(date => {
    const entries = getEntries();
    entries[date] = { ...entries[date], diary: 'Edited offline', loggedAt: new Date().toISOString() };
    putEntries(entries);
  }, date);
  assert.equal(cloud.entry_json.diary, 'Original');
  assert.equal(await page.evaluate(() => cloudSyncPending), true);
  await context.setOffline(false);
  await page.waitForFunction(date => !cloudSyncBusy && !cloudSyncPending && getEntrySyncBase('offline-test')[date]?.diary === 'Edited offline', date);
  assert.equal(cloud.entry_json.diary, 'Edited offline');
  assert.equal(await page.locator('#s-home').isVisible(), true);
  assert.equal(await page.evaluate(() => getStoredSyncConflicts().length), 0);
  cloud = { ...cloud, updated_at: `version-${++version}`, entry_json: { ...cloud.entry_json, diary: 'Changed on another device' } };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(date => getEntries()[date]?.diary === 'Changed on another device' && !cloudSyncBusy, date);
  assert.equal(await page.evaluate(() => getStoredSyncConflicts().length), 0);
  assert.equal(await page.locator('#s-home').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('Automatic sync browser passed: offline edit/reconnect upload and focus-triggered remote pull, without visiting Settings.');
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
