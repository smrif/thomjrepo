import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const index = await readFile(resolve(root, 'index.html'), 'utf8');
const privacy = await readFile(resolve(root, 'privacy.html'), 'utf8');
const terms = await readFile(resolve(root, 'terms.html'), 'utf8');
const app = await readFile(resolve(root, 'app.js'), 'utf8');
for (const text of [index, privacy, terms, app]) {
  assert(!/your email is never shared|your data stays on your device|cloud sync is not available|prepare private backup and restore|alpha runs without cloud sync/i.test(text));
}
assert.match(privacy, /sync automatically/);
assert.match(privacy, /notes and attached screenshots/);
for (const provider of ['Supabase', 'Resend', 'Cloudflare']) assert(privacy.includes(provider));
assert.match(privacy, /not end-to-end encrypted/);
assert.match(privacy, /Local records on your devices.*not erased/);
assert.match(privacy, /backups or operational logs may remain/);
assert.match(terms, /sync automatically/);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch();
  for (const [width, height, theme] of [[390, 844, 'dark'], [390, 844, 'light'], [1280, 900, 'dark'], [1280, 900, 'light']]) {
    const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block' });
    await page.addInitScript(theme => {
      if (location.protocol !== 'http:') return;
      localStorage.setItem('custody_tracker_config', JSON.stringify({ currentParentLabel: 'Dad', coParentLabel: 'Mom', email: 'test@example.com', children: ['Child'], termsAccepted: true, themeMode: theme }));
    }, theme);
    await page.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
      let signedIn=false; const rows=new Map();
      window.testSignIn=()=>{signedIn=true;};
      window.WhoseDayBackend={
        isEnabled:()=>true, getSession:async()=>signedIn?{user:{id:'test',email:'test@example.com'}}:null,
        getProfile:async()=>null,upsertProfile:async row=>row,
        getCustodyEntries:async()=>[...rows.values()],
        saveCustodyEntry:async row=>{const saved={...row,updated_at:new Date().toISOString()};rows.set(row.entry_date,saved);return saved;},
        upsertSyncDevice:async row=>row
      };` }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    for (const screen of ['s-ob-login', 's-ob-finish']) {
      await page.evaluate(screen => show(screen), screen);
      const content = await page.locator('#' + screen).innerText();
      assert.match(content, /sync(?:ed|s)? automatically|synced to your account/i);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const fits = await page.locator('#' + screen).evaluate(element => [...element.querySelectorAll('p,button')].every(child => child.scrollWidth <= child.clientWidth + 1));
      assert(fits, `${screen} text must fit at ${width}px in ${theme} mode`);
      await page.screenshot({ path: `/tmp/whose-day-disclosures-${screen}-${theme}-${width}.png` });
    }
    const privacyLink = page.locator('#s-ob-login a[href="privacy.html"]');
    assert.equal(await privacyLink.getAttribute('rel'), 'noopener');
    assert.equal(await privacyLink.getAttribute('target'), '_blank');
    await page.evaluate(async () => { testSignIn(); await checkAppAccess({initial:true});showSetup();await refreshCloudAuthUi(false); });
    assert.equal(await page.locator('#cloud-auth-title').innerText(), 'Signed in');
    assert.match(await page.locator('#cloud-account-section').innerText(), /sync automatically while signed in, including notes and screenshots/);
    await page.locator('#cloud-account-section').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `/tmp/whose-day-disclosures-settings-${theme}-${width}.png` });

    // Download the real CSV, preserving its existing column contract.
    await page.evaluate(() => putEntries({ [todayStr()]: { week: 'dad', dadMode: 'normal', kidsWithDad: ['Child'], diary: 'A local export fixture', loggedAt: new Date().toISOString() } }, { skipSync: true }));
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => exportAllData());
    const download = await downloadPromise;
    const csv = await readFile(await download.path(), 'utf8');
    assert(csv.split('\n')[0].includes('exported_at,alpha_note,user_label'), 'Preserve legacy CSV column names');
    assert.match(csv, /may include changes that have not synced/);
    assert.match(csv, /A local export fixture/);
    assert(!csv.includes('cloud sync is not available'));
    for (const [path, title] of [['privacy.html', 'Privacy Policy'], ['terms.html', 'Terms of Use']]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/${path}`);
      assert.match(await page.title(), new RegExp(title));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Cloud disclosures passed: accurate provider/sync/deletion wording, responsive onboarding and Settings, policy links, and real CSV download with unchanged columns.');
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
