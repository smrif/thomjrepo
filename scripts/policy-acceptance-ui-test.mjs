import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[extname(path)] || 'application/octet-stream';
    response.writeHead(200, { 'content-type': type }).end(body);
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const legacy = { user_id: 'A', current_parent_label: 'Parent', co_parent_label: 'Other', children: ['Child'], report_email: 'qa@example.com', terms_version: 'alpha-local', terms_accepted_at: '2026-10-01T12:00:00.000Z', privacy_version: 'alpha-local', privacy_accepted_at: '2026-10-01T12:00:00.000Z', theme_mode: 'dark' };
let cases = 0;
try {
  for (const [width, height, theme] of [[390, 844, 'dark'], [1280, 900, 'light']]) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    await context.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
      window.qaSessionCalls=0; window.qaProfile=null; window.qaGate=false; window.qaSession={user:{id:'A',email:'qa@example.com'}};
      window.WhoseDayBackend={
        isEnabled:()=>true,
        getSession:async()=>{qaSessionCalls++;if(qaGate)await new Promise(resolve=>window.qaResolve=resolve);return qaSession;},
        getProfile:async()=>qaProfile,upsertProfile:async row=>{window.qaLastProfile=row;return row;},
        getCustodyEntries:async()=>[],upsertSyncDevice:async row=>row
      };` }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(theme => {
      setThemeMode(theme, false);
      document.getElementById('ob-name').value='Parent';
      document.getElementById('ob-coparent').value='Other';
      document.querySelector('.ob-kid-input').value='Child';
      show('s-ob-finish');
    }, theme);
    await page.locator('#ob-email').fill('qa@example.com');
    await page.locator('#btn-ob-finish').click();
    assert.equal(await page.evaluate(() => hasSavedConfig()), false, 'Unchecked submission must not save acceptance');
    await page.locator('#ob-terms').check();
    await page.evaluate(() => { qaGate=true; });
    await page.locator('#btn-ob-finish').click();
    assert(await page.locator('#btn-ob-finish').isDisabled());
    assert.equal(await page.locator('#btn-ob-finish').getAttribute('aria-busy'), 'true');
    await page.evaluate(() => { document.getElementById('btn-ob-finish').click(); qaGate=false; qaResolve(); });
    await page.locator('#s-home.active').waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(CONFIG_KEY)));
    assert.equal(saved.termsVersion, '2026-10-21-v2');
    assert.equal(saved.privacyVersion, '2026-10-21-v2');
    assert.equal(saved.termsAcceptedAt, saved.privacyAcceptedAt);
    assert.equal(saved.policyAcceptanceOwnerId, 'A');
    assert(Number.isFinite(Date.parse(saved.termsAcceptedAt)));
    assert.equal(await page.locator('#btn-ob-finish').getAttribute('aria-busy'), null);
    await page.reload();
    assert.equal(await page.evaluate(() => APP_CONFIG.termsAcceptedAt), saved.termsAcceptedAt, 'Reload must retain the actual submission timestamp');
    await page.evaluate(() => showSetup());
    assert(await page.locator('#setup-terms').isChecked());
    await page.getByRole('button',{name:/^Name /}).click();
    await page.locator('#setup-current-parent').fill('Updated parent');
    await page.locator('#setup-continue').click();
    await page.locator('[data-settings-page=overview]:visible').waitFor();
    assert.equal(await page.evaluate(() => APP_CONFIG.termsAcceptedAt), saved.termsAcceptedAt, 'Ordinary Settings save must not restamp acceptance');

    // Restoring a legacy account must replace newer local acceptance metadata, not mix it in.
    await page.evaluate(profile => { qaProfile=profile; showSetup(); }, legacy);
    await page.evaluate(() => restoreCloudProfile());
    assert.equal(await page.evaluate(() => APP_CONFIG.termsAcceptedAt), legacy.terms_accepted_at);
    assert.equal(await page.evaluate(() => APP_CONFIG.termsVersion), 'alpha-local');
    assert(!(await page.locator('#setup-terms').isChecked()), 'An old acceptance must not appear as agreement to current documents');
    await page.locator('#setup-continue').click();
    await page.locator('[data-settings-page=overview]:visible').waitFor();
    assert.equal(await page.evaluate(() => APP_CONFIG.termsAcceptedAt), legacy.terms_accepted_at, 'Editing a legacy profile does not force or invent re-consent');
    await page.evaluate(() => showSetup());
    await page.locator('#setup-terms-field').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/whose-day-policy-review-${width}.png` });
    await page.locator('#setup-terms').check();
    await page.locator('#setup-continue').click();
    await page.locator('[data-settings-page=overview]:visible').waitFor();
    assert.equal(await page.evaluate(() => APP_CONFIG.termsVersion), '2026-10-21-v2');
    assert.notEqual(await page.evaluate(() => APP_CONFIG.termsAcceptedAt), legacy.terms_accepted_at, 'Only an explicit checkbox resubmission upgrades acceptance');
    await page.evaluate(async () => { clearTimeout(cloudSyncTimer); await syncCloudData({reason:'policy-test'}); });
    assert.equal(await page.evaluate(() => qaLastProfile.terms_version), '2026-10-21-v2');
    assert.equal(await page.evaluate(() => qaLastProfile.terms_accepted_at===APP_CONFIG.termsAcceptedAt), true);
    await page.evaluate(() => showSetup());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth), true);
    await page.getByRole('button',{name:/^Name /}).click();
    await page.locator('#s-setup .setup-actions').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/whose-day-policy-acceptance-${width}.png` });
    for (const kind of ['terms', 'privacy']) {
      const policy = await context.newPage();
      await policy.goto(`${origin}/assets/legal/2026-10-21-v2/${kind}.html`);
      assert.equal(await policy.locator('meta[name="policy-version"]').getAttribute('content'), '2026-10-21-v2');
      assert.equal(new URL(await policy.locator('a.back').getAttribute('href'), policy.url()).pathname, '/index.html');
      assert.equal(await policy.evaluate(() => document.documentElement.scrollWidth<=innerWidth), true);
      await policy.close();
    }
    assert.deepEqual(errors, []);
    await context.close(); cases++;
  }

  const previewContext = await browser.newContext({ serviceWorkers: 'block' });
  await previewContext.addInitScript(() => localStorage.setItem('custody_tracker_config', JSON.stringify({currentParentLabel:'Existing',coParentLabel:'Other',email:'qa@example.com',children:['Child'],termsAccepted:true,termsVersion:'alpha-local',termsAcceptedAt:'2026-10-01T12:00:00.000Z'})));
  await previewContext.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.qaCalls=0;window.WhoseDayBackend={isEnabled:()=>true,getSession:async()=>{qaCalls++;return {user:{id:'A',email:'qa@example.com'}};}};
  ` }));
  const previewPage = await previewContext.newPage();
  await previewPage.goto(origin + '/?onboarding-theme-preview=1');
  await previewPage.evaluate(async () => {
    document.getElementById('ob-name').value='Preview';document.querySelector('.ob-kid-input').value='Child';
    document.getElementById('ob-email').value='qa@example.com';document.getElementById('ob-terms').checked=true;
    show('s-ob-finish');await obFinish();
    scheduleCloudSync('preview-test',0);
  });
  assert.equal(await previewPage.evaluate(() => JSON.parse(localStorage.getItem(CONFIG_KEY)).termsVersion), 'alpha-local');
  assert.equal(await previewPage.evaluate(() => cloudSyncAllowed()), false);
  assert.equal(await previewPage.evaluate(() => qaCalls), 0, 'Preview must not attribute or sync a real account');
  await previewContext.close(); cases++;

  const canceledContext = await browser.newContext({ serviceWorkers: 'block' });
  await canceledContext.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.WhoseDayBackend={isEnabled:()=>true,getSession:()=>new Promise(resolve=>{window.qaResolve=()=>resolve({user:{id:'A'}});})};
  ` }));
  const canceledPage = await canceledContext.newPage();
  await canceledPage.goto(origin);
  await canceledPage.evaluate(() => {
    document.getElementById('ob-name').value='Parent';document.querySelector('.ob-kid-input').value='Child';
    document.getElementById('ob-email').value='qa@example.com';document.getElementById('ob-terms').checked=true;
    show('s-ob-finish');window.pendingFinish=obFinish();
    show('s-ob-name');show('s-ob-finish');
  });
  await canceledPage.evaluate(async () => { qaResolve();await pendingFinish; });
  assert.equal(await canceledPage.evaluate(() => hasSavedConfig()), false, 'Leaving and returning while Auth is pending must not save a canceled submission');
  assert(!(await canceledPage.locator('#btn-ob-finish').isDisabled()));
  await canceledContext.close(); cases++;

  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: `window.WhoseDayBackend={isEnabled:()=>false};` }));
  const page = await context.newPage();
  await page.goto(origin);
  await context.setOffline(true);
  await page.evaluate(async () => {
    document.getElementById('ob-name').value='Offline parent';document.querySelector('.ob-kid-input').value='Child';
    document.getElementById('ob-email').value='qa@example.com';document.getElementById('ob-terms').checked=true;
    show('s-ob-finish');await obFinish();
  });
  const offline = await page.evaluate(() => JSON.parse(localStorage.getItem(CONFIG_KEY)));
  assert.equal(offline.policyAcceptanceOwnerId, null);
  assert.equal(offline.termsVersion, '2026-10-21-v2');
  await context.setOffline(false);
  await page.reload();
  assert.equal(await page.evaluate(() => APP_CONFIG.termsAcceptedAt), offline.termsAcceptedAt);
  const bound = await page.evaluate(() => profilePayloadFromConfig('offline-owner', null, 'qa@example.com'));
  assert.equal(bound.terms_accepted_at, offline.termsAcceptedAt, 'Reconnect binds but never restamps offline acceptance');
  assert.equal(await page.evaluate(() => APP_CONFIG.policyAcceptanceOwnerId), 'offline-owner');
  await context.close(); cases++;
  console.log(`Policy acceptance browser tests passed (${cases} cases: explicit onboarding, disabled duplicate submission, reload, legacy restore/edit, explicit upgrade, immutable links, offline/reconnect; mocked backend only).`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
