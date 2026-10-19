import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const server = createServer(async (req, res) => {
  const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html')}`);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const contents = await readFile(path);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(contents);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch();
  for (const [width, height, themeMode] of [[390, 844, 'dark'], [1280, 900, 'light']]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      localStorage.setItem('custody_tracker_config', JSON.stringify({
        currentParentLabel: 'Dad', coParentLabel: 'Mom', email: 'test@example.com',
        children: ['Child'], termsAccepted: true, themeMode: theme
      }));
      localStorage.setItem('familylog_entries', JSON.stringify({ '2026-10-12': { date: '2026-10-12', diary: 'Keep this local record' } }));
    }, themeMode);
    // Mock all cloud operations: this test cannot touch a real Supabase account.
    await page.route('**/supabase-client.js*', route => route.fulfill({
      contentType: 'text/javascript',
      body: `(() => {
        let signedIn = true;
        window.WhoseDayBackend = {
          isEnabled: () => true,
          getSession: async () => signedIn ? { user: { id: 'test', email: 'test@example.com' } } : null,
          getProfile: async () => null,
          upsertProfile: async profile => profile,
          getCustodyEntries: async () => [], upsertCustodyEntries: async () => [],
          saveCustodyEntry: async entry => ({ ...entry, updated_at: new Date().toISOString() }),
          upsertSyncDevice: async device => device,
          deleteAccount: async () => {
            const response = await fetch('/api/account', { method: 'DELETE' });
            if (!response.ok) throw new Error('Account deletion is temporarily unavailable.');
            signedIn = false;
          }
        };
      })();`
    }));
    let succeeds = false;
    let requests = 0;
    await page.route('**/api/account', route => {
      requests++;
      return route.fulfill({ status: succeeds ? 200 : 503, contentType: 'application/json', body: JSON.stringify({ deleted: succeeds }) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#settings-profile').waitFor({ state: 'attached' });
    await page.locator('[onclick="showSetup()"]:visible').first().click();
    const button = page.locator('#cloud-delete-btn');
    const input = page.locator('#cloud-delete-confirm');
    await button.waitFor({ state: 'visible' });
    assert.equal(await button.isEnabled(), false);
    await input.fill('delete');
    assert.equal(await button.isEnabled(), false);
    assert.equal(requests, 0);
    await input.fill('DELETE');
    await page.waitForFunction(() => !document.getElementById('cloud-delete-btn').disabled);
    await page.locator('#cloud-delete-panel').evaluate(panel => panel.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `/tmp/whose-day-account-delete-${themeMode}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const panelFits = await page.locator('#cloud-delete-panel').evaluate(panel => panel.scrollWidth <= panel.clientWidth);
    assert.equal(panelFits, true, 'Deletion controls must fit at mobile and desktop widths');
    await button.click();
    await page.waitForFunction(() => document.getElementById('cloud-auth-message').textContent.includes('temporarily unavailable'));
    assert.equal(await page.locator('#s-setup').isVisible(), true, 'Failed deletion stays in Settings');
    assert.equal(await page.locator('#account-deleted-notice').isVisible(), false);
    assert.equal(await page.locator('#cloud-auth-title').innerText(), 'Signed in');
    assert.equal(await input.inputValue(), 'DELETE');
    succeeds = true;
    await button.click();
    await page.waitForFunction(() => document.getElementById('cloud-auth-message').textContent.includes('account and cloud records were deleted'));
    assert.equal(await page.locator('#s-ob-welcome').isVisible(), true, 'Success returns to the logged-out home');
    assert.equal(await page.locator('#s-home').isVisible(), false);
    const notice = page.locator('#account-deleted-notice');
    assert.equal(await notice.isVisible(), true);
    assert.equal(await notice.evaluate(el => document.activeElement === el), true, 'Confirmation receives focus');
    assert.match(await notice.innerText(), /Local records remain on this device/);
    assert.equal(await notice.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.screenshot({ path: `/tmp/whose-day-account-deleted-${themeMode}.png` });
    await page.getByRole('button', { name: 'Dismiss account deletion confirmation' }).click();
    assert.equal(await notice.isVisible(), false);
    assert.equal(await page.locator('#cloud-auth-title').innerText(), 'Not signed in');
    assert.equal(await page.locator('#cloud-delete-panel').isVisible(), false);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('familylog_entries'))['2026-10-12'].diary), 'Keep this local record');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('custody_tracker_config')).email), 'test@example.com');
    assert.equal(requests, 2);
    // Reload remains logged out despite the deliberately retained local profile.
    await page.reload();
    await page.locator('#s-ob-welcome').waitFor({ state: 'visible' });
    assert.equal(await notice.isVisible(), false, 'Do not repeat the deletion toast on reload');
    assert.equal(await page.evaluate(() => cloudSyncAllowed()), false);
    // Completing setup/restoration releases the guard for the next account.
    await page.evaluate(() => saveConfig(APP_CONFIG));
    assert.equal(await page.evaluate(() => localStorage.getItem('whose_day_account_deleted')), null);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Account deletion UI passed (mobile/dark, desktop/light, failure/retry, retained local records).');
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
