import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../dist');
let cloud = [];
let profile = null;
let revision = 0;
let workerRevision = '';
let failAsset = false;
let apiRequests = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/supabase-config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' }).end(`window.WHOSE_DAY_SUPABASE={enabled:true,url:'http://127.0.0.1:${server.address().port}',publishableKey:'test-only',sdkUrl:'vendor/supabase.js'};`);
    return;
  }
  if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/api/')) {
    apiRequests++;
    res.setHeader('content-type', 'application/json');
    if (url.pathname.startsWith('/api/')) { res.end('{"private":"do not cache"}'); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : null;
    let rows = [];
    if (url.pathname.endsWith('/profiles')) {
      if (data) profile = { ...data, updated_at: new Date().toISOString() };
      rows = profile ? [profile] : [];
    } else if (url.pathname.endsWith('/custody_entries')) {
      if (data) {
        const existing = cloud.find(row => row.entry_date === data.entry_date);
        const expected = url.searchParams.get('updated_at');
        if (expected && expected !== 'eq.' + existing?.updated_at) { res.end('[]'); return; }
        const saved = { ...data, updated_at: `version-${++revision}` };
        cloud = [...cloud.filter(row => row.entry_date !== data.entry_date), saved];
        rows = [saved];
      } else rows = cloud;
    } else if (url.pathname.endsWith('/sync_devices')) rows = [data];
    else { res.writeHead(404).end('{}'); return; }
    res.end(JSON.stringify(req.headers.accept?.includes('vnd.pgrst.object') ? rows[0] : rows));
    return;
  }
  if (failAsset && url.pathname === '/theme.css') { res.writeHead(503).end(); return; }
  const redirects = { '/index.html': '/', '/privacy.html': '/privacy', '/terms.html': '/terms' };
  if (redirects[url.pathname]) { res.writeHead(308, { location: redirects[url.pathname] }).end(); return; }
  const documents = { '/': '/index.html', '/privacy': '/privacy.html', '/terms': '/terms.html' };
  const path = resolve(root, `.${documents[url.pathname] || url.pathname}`);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    let data = await readFile(path);
    if (url.pathname === '/sw.js') data = data.toString().replace(/const CACHE_NAME = (.*);/, `const CACHE_NAME = $1 + '${workerRevision}';`);
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf' })[extname(path)];
    res.writeHead(200, { 'content-type': type || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch();
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [width, height, theme] of [[390, 844, 'dark'], [1280, 900, 'light']]) {
    cloud = []; profile = null; workerRevision = ''; failAsset = false;
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(theme => {
      if (!['http:', 'https:'].includes(location.protocol)) return;
      if (localStorage.getItem('custody_tracker_config')) return;
      localStorage.setItem('custody_tracker_config', JSON.stringify({ currentParentLabel: 'Dad', coParentLabel: 'Mom', children: ['Child'], email: 'test@example.com', termsAccepted: true, themeMode: theme }));
      const expires_at = Math.floor(Date.now() / 1000) + 86400;
      const payload = btoa(JSON.stringify({ sub: 'offline-test', exp: expires_at })).replace(/=/g, '');
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.test', refresh_token: 'test', token_type: 'bearer', expires_at, expires_in: 86400, user: { id: 'offline-test', email: 'test@example.com' } }));
    }, theme);
    let page = await context.newPage();
    const errors = [];
    context.on('page', next => next.on('pageerror', error => errors.push(error.message)));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => navigator.serviceWorker.controller && window.supabase && !cloudSyncBusy && !cloudSyncPending);
    assert.equal(await page.locator('#s-home').isVisible(), true);
    const initialCaches = await page.evaluate(() => caches.keys());
    assert.equal(initialCaches.length, 1);
    // Account/API responses must never become cached static files.
    await page.evaluate(() => fetch('/api/probe').then(response => response.json()));
    const cachedUrls = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).map(request => request.url));
    assert(cachedUrls.some(url => url.endsWith('/vendor/supabase.js')));
    assert(cachedUrls.every(url => !url.includes('/api/') && !url.includes('/rest/') && !url.includes('code=') && !url.includes('access_token')));
    await context.setOffline(true);
    assert.equal(await page.evaluate(() => fetch('/api/probe').then(() => true).catch(() => false)), false, 'API responses must not be served offline');
    await page.reload();
    await page.locator('#s-home').waitFor({ state: 'visible' });
    await page.waitForFunction(() => appAccessState === 'offline');
    await page.evaluate(() => showCal());
    assert.equal(await page.locator('#s-cal').isVisible(), true);
    await page.evaluate(() => showSetup());
    assert.equal(await page.locator('#s-setup').isVisible(), true);
    // Offline startup hides the signed-in sync panel. Check the status that is
    // actually shown, rather than text persisted inside that hidden panel.
    assert.match(await page.locator('#settings-sync-summary').innerText(), /offline/i);
    await page.evaluate(() => openSettingsPage('sync'));
    await page.locator('#cloud-auth-pill').waitFor({ state: 'visible' });
    assert.match(await page.locator('#cloud-auth-pill').innerText(), /offline/i);
    // The bundled SDK must load on a cold offline reload, not just in the first tab.
    const session = await page.evaluate(() => WhoseDayBackend.getSession());
    assert.equal(session.user.id, 'offline-test');
    await page.evaluate(() => {
      putEntries({ [todayStr()]: { week: 'dad', dadMode: 'normal', kidsWithDad: ['Child'], diary: 'Saved after an offline reload', loggedAt: new Date().toISOString() } });
      initHome(); show('s-home');
    });
    assert.equal(cloud.length, 0);
    await page.close();
    page = await context.newPage();
    await page.goto(origin);
    await page.locator('#s-home').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => getEntries()[todayStr()].diary), 'Saved after an offline reload');
    const offlineBackup = await page.evaluate(async () => {
      const backup = await WhoseDayBackup.create({ account: lastSignedInAccount(), config: APP_CONFIG, records: getEntries() });
      const restored = await WhoseDayBackup.parse(JSON.stringify(backup));
      return restored.entries[todayStr()].diary;
    });
    assert.equal(offlineBackup, 'Saved after an offline reload', 'The backup module and checksum verification must work after a cold offline reopen');
    await page.screenshot({ path: `/tmp/whose-day-offline-home-${theme}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await context.setOffline(false);
    await page.waitForFunction(() => !cloudSyncBusy && !cloudSyncPending && getEntrySyncBase('offline-test')[todayStr()]?.diary === 'Saved after an offline reload');
    assert.equal(cloud[0].entry_json.diary, 'Saved after an offline reload');
    assert.equal(await page.locator('#s-home').isVisible(), true);
    // Failed precache cannot replace the usable shell or retain a partial new shell.
    workerRevision = '-failed'; failAsset = true;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      const worker = registration.installing;
      if (worker && worker.state !== 'redundant') await new Promise(resolve => worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); }));
    });
    assert.deepEqual(await page.evaluate(() => caches.keys()), initialCaches);
    failAsset = false;
    workerRevision = '-next';
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting));
    assert.equal(await page.evaluate(() => caches.keys().then(keys => keys.length)), 2);
    assert.equal(await page.locator('#s-home').isVisible(), true, 'An update must not force-reload an open app');
    await page.close();
    page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(async () => (await caches.keys()).length === 1 && !(await navigator.serviceWorker.getRegistration()).waiting);
    assert.equal(await page.evaluate(() => getEntries()[todayStr()].diary), 'Saved after an offline reload');
    assert.notDeepEqual(await page.evaluate(() => caches.keys()), initialCaches);
    await context.setOffline(true);
    await page.goto(origin + '/privacy.html');
    assert.match(await page.title(), /privacy/i);
    await page.goto(origin + '/terms.html');
    assert.match(await page.title(), /terms/i);
    await page.goto(origin + '/privacy');
    assert.match(await page.title(), /privacy/i);
    await page.goto(origin + '/terms');
    assert.match(await page.title(), /terms/i);
    for (const kind of ['privacy', 'terms']) {
      await page.goto(origin + `/assets/legal/2026-10-13/${kind}.html`);
      assert.match(await page.title(), new RegExp(kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use'));
      assert.equal(await page.locator('meta[name="policy-version"]').getAttribute('content'), '2026-10-13', 'The exact agreement version must load offline');
    }
    await page.goto(origin + '/?offline-check=1');
    await page.locator('#s-home').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert(apiRequests > 0);
  console.log('Offline shell passed: mobile/dark + desktop/light cold reload/reopen, cached SDK, navigation, retained edits, automatic reconnect, API exclusion, failed install safety, and update activation/cleanup.');
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
