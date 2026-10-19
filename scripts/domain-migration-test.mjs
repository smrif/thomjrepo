import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../src/worker.js';

const source = await readFile(new URL('../supabase-config.js', import.meta.url), 'utf8');
for (const [href, redirect] of [
  ['https://whosedayapp.com/', 'https://whosedayapp.com/'],
  ['https://whosedayapp.com/?code=example#fragment', 'https://whosedayapp.com/'],
  ['https://www.whosedayapp.com/', 'https://whosedayapp.com/'],
  ['https://thomjrepo.ryan-rifkin.workers.dev/?code=example', 'https://thomjrepo.ryan-rifkin.workers.dev/'],
  ['http://localhost:8000/', 'https://whosedayapp.com/'],
  ['file:///test/index.html', 'https://whosedayapp.com/']
]) {
  const url = new URL(href);
  const context = { window: {}, location: { protocol: url.protocol, origin: url.origin } };
  vm.runInNewContext(source, context);
  assert.equal(context.window.WHOSE_DAY_SUPABASE.redirectTo, redirect);
  assert.equal(context.window.WHOSE_DAY_SUPABASE.url, 'https://hdfuknggfkmaycnantxv.supabase.co', 'Keep the same database and accounts');
}

let assets = 0;
const env = { ASSETS: { fetch: () => { assets++; return new Response('asset'); } } };
for (const path of ['/', '/privacy.html', '/sw.js', '/?code=example%2Fvalue&next=https%3A%2F%2Funtrusted.example']) {
  const response = await worker.fetch(new Request('https://www.whosedayapp.com' + path), env);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://whosedayapp.com' + path);
}
assert.equal(assets, 0, 'Canonical redirects happen before static asset delivery');
for (const host of ['whosedayapp.com', 'thomjrepo.ryan-rifkin.workers.dev']) {
  const response = await worker.fetch(new Request('https://' + host + '/'), env);
  assert.equal(response.status, 200, 'Both canonical and legacy origins keep serving the app');
  assert.equal(response.headers.get('location'), null, 'Do not strand legacy local records behind a redirect');
  const health = await worker.fetch(new Request('https://' + host + '/api/health'), env);
  assert.equal(health.status, 200);
  const unauthorized = await worker.fetch(new Request('https://' + host + '/api/account', { method: 'DELETE', headers: { origin: 'https://' + host, 'content-type': 'application/json' }, body: '{"confirmation":"DELETE"}' }), env);
  assert.equal(unauthorized.status, 401, 'Domain migration does not weaken account deletion authentication');
}
const crossOrigin = await worker.fetch(new Request('https://whosedayapp.com/api/account', { method: 'DELETE', headers: { origin: 'https://thomjrepo.ryan-rifkin.workers.dev', 'content-type': 'application/json' }, body: '{"confirmation":"DELETE"}' }), env);
assert.equal(crossOrigin.status, 403, 'Do not allow cross-origin deletion between the two app origins');
const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
assert.equal(config.workers_dev, true, 'Explicitly preserve legacy access when custom routes are added');
assert.equal(config.assets.run_worker_first, true, 'Asset delivery must not bypass canonical host redirects');
assert.deepEqual(config.routes, [
  { pattern: 'whosedayapp.com', custom_domain: true },
  { pattern: 'www.whosedayapp.com', custom_domain: true }
]);
console.log('Domain migration passed: canonical redirect/path/query handling, both origins stay live, origin-specific login returns, unchanged database, and deletion protection.');
