import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Opt-in, GET-only checks against the configured project. Never uses a secret/JWT.
assert(process.argv.includes('--live'), 'Pass --live to check the configured Supabase project.');
const context = { window: {}, location: { protocol: 'https:', origin: 'https://whosedayapp.com' } };
vm.runInNewContext(await readFile(new URL('../supabase-config.js', import.meta.url), 'utf8'), context);
const { url, publishableKey } = context.window.WHOSE_DAY_SUPABASE;
assert.equal(new URL(url).protocol, 'https:');
assert(publishableKey.startsWith('sb_publishable_'), 'This check accepts only a public publishable key.');

for (const table of ['profiles', 'custody_entries', 'sync_devices']) {
  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set('select', 'user_id');
  endpoint.searchParams.set('limit', '0'); // No record contents, even if access is unexpectedly allowed.
  const response = await fetch(endpoint, {
    headers: { apikey: publishableKey }, signal: AbortSignal.timeout(15000)
  });
  const body = await response.json();
  assert([401, 403].includes(response.status) && body.code === '42501', `${table}: expected database permission denial, received HTTP ${response.status}`);
  console.log(`${table}: anonymous Data API read denied (HTTP ${response.status}, SQLSTATE 42501).`);
}
