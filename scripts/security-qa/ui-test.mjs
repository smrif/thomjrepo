import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createQaServer } from './server.mjs';

const server = createQaServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const emails = ['ryanrifkin+whoseday-qa-a@gmail.com', 'ryanrifkin+whoseday-qa-b@gmail.com'];
const sessions = ids.map((id, i) => {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    access_token: `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: id, exp: expires_at, role: 'authenticated' })}.test-signature-${i}`,
    refresh_token: `private-test-refresh-${i}`, expires_at, expires_in: 3600, token_type: 'bearer', user: { id, email: emails[i] }
  };
});
let contexts = 0;
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let calls = [], removed = false;
    const rows = { profiles: [], custody_entries: [], sync_devices: [] };
    await context.route('https://**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      calls.push({ url, method });
      assert.equal(url.hostname, 'hdfuknggfkmaycnantxv.supabase.co', 'No other external services are allowed in this test');
      const body = request.postDataJSON();
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'content-type': 'application/json' };
      const reply = (data, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
      if (method === 'OPTIONS') return reply({});
      if (url.pathname === '/auth/v1/otp') return reply({});
      const i = sessions.findIndex(session => request.headers().authorization === `Bearer ${session.access_token}`);
      assert(i >= 0, 'Every authenticated request uses only the synthetic sessions');
      if (url.pathname === '/auth/v1/user') return removed && i === 0 ? reply({ code: 'user_not_found' }, 401) : reply(sessions[i].user);
      if (url.pathname === '/auth/v1/token') return reply({ error_code: 'refresh_token_not_found' }, 400);
      if (url.pathname === '/auth/v1/logout') return reply({});
      const table = url.pathname.split('/').at(-1);
      assert(Object.hasOwn(rows, table));
      const id = ids[i], target = url.searchParams.get('user_id');
      if (method === 'GET') return reply(rows[table].filter(row => row.user_id === id && (!target || target.startsWith('in.') || target === `eq.${row.user_id}`)));
      if (method === 'POST') {
        if (removed && i === 0) return reply({ code: '23503' }, 400);
        if (body.user_id !== id) return reply({ code: '42501' }, 403);
        if (!rows[table].some(row => row.user_id === id)) rows[table].push({ ...body, updated_at: '2026-10-13T12:00:00Z' });
        return reply(rows[table].filter(row => row.user_id === id), 201);
      }
      if (method === 'PATCH' && body?.user_id) return reply({ code: '42501' }, 403);
      return reply([]);
    });
    await page.goto(origin);
    await page.getByText('Ready. No requests sent.', { exact: true }).waitFor();
    assert.equal(calls.length, 0, 'Loading the QA screen must not send sign-in emails or other API calls');
    assert(await page.locator('#prepare').isDisabled());
    assert(await page.locator('#isolation').isDisabled());
    assert(await page.locator('#post-delete').isDisabled());

    // Exercise a real browser email-link callback against mocked GoTrue, including fragment removal.
    await page.locator('#signin-a').click();
    await page.getByText(/Account A email sent/).waitFor();
    assert(await page.locator('#signin-a').isDisabled());
    assert(await page.locator('#signin-b').isDisabled());
    const otp = calls.find(call => call.url.pathname === '/auth/v1/otp');
    assert(otp);
    const hash = new URLSearchParams({ access_token: sessions[0].access_token, refresh_token: sessions[0].refresh_token, type: 'magiclink' });
    await page.goto(`${origin}/#${hash}`);
    await page.getByText('Account A signed in.', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    await page.evaluate(session => localStorage.setItem('whose-day-security-qa:b', JSON.stringify(session)), sessions[1]);
    await page.reload();
    await page.locator('#status-b').filter({ hasText: emails[1] }).waitFor();
    await page.locator('#disposable').check();
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#prepare').click();
    await page.getByText(/Fixtures ready. Keep this page open/).waitFor();
    assert(await page.locator('#isolation').isDisabled());
    await page.locator('#allow-delete').check();
    await page.locator('#isolation').click();
    await page.getByText(/Account isolation passed/).waitFor();
    removed = true;
    for (const table of Object.keys(rows)) rows[table] = rows[table].filter(row => row.user_id === ids[1]);
    await page.locator('#deleted').check();
    await page.locator('#post-delete').click();
    await page.getByText(/Retained-session checks passed/).waitFor();
    assert(!calls.some(call => call.url.pathname === '/api/account' || call.url.pathname.includes('/admin/')));
    const visible = await page.locator('body').innerText();
    for (const session of sessions) {
      assert(!visible.includes(session.access_token));
      assert(!visible.includes(session.refresh_token));
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    await page.screenshot({ path: `/tmp/whose-day-security-qa-${viewport.width}.png`, fullPage: true });
    await page.locator('#clear').click();
    await page.getByText(/QA browser sessions cleared/).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('whose-day-security-qa:')).length), 0);
    assert.deepEqual(errors, []);
    contexts++;
    await context.close();
  }
  console.log(`Local security QA browser tests passed (${contexts} viewports, mocked Auth/Data API only; no live accounts or emails).`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
