import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { createQaServer } from './server.mjs';
import { TABLES, prepareFixtures, runIsolation, checkDeletedSession, QaError } from './checks.mjs';

const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const runId = '20000000-0000-4000-8000-000000000003';
const config = { url: 'https://test.supabase.co', publishableKey: 'sb_publishable_test' };
function harness({ existing = false, invalidB = false, fault = '', refreshCode = 'refresh_token_not_found' } = {}) {
  const accounts = ids.map((id, i) => ({ user: { id, email: `test+${i}@example.com` }, expectedEmail: `test+${i}@example.com`, access_token: `private-access-${i}`, refresh_token: `private-refresh-${i}`, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  const state = Object.fromEntries(TABLES.map(table => [table, []]));
  if (existing) state.sync_devices.push({ user_id: ids[1], device_id: 'existing-real-record' });
  const requests = [];
  let removed = false;
  const fetchImpl = async (raw, init) => {
    const url = new URL(raw), i = accounts.findIndex(a => init.headers.Authorization === `Bearer ${a.access_token}`);
    assert(i >= 0);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    const id = ids[i], method = init.method;
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ path: url.pathname, method, i, body, query: url.searchParams });
    if (url.pathname === '/auth/v1/user') {
      if ((removed && i === 0) || (invalidB && i === 1)) return Response.json({ code: 'user_not_found' }, { status: 401 });
      return Response.json(accounts[i].user);
    }
    if (url.pathname === '/auth/v1/token') {
      assert.equal(body.refresh_token, accounts[0].refresh_token);
      assert.equal(url.searchParams.get('grant_type'), 'refresh_token');
      return Response.json({ error_code: refreshCode }, { status: 400 });
    }
    const table = url.pathname.split('/').at(-1);
    assert(TABLES.includes(table));
    const target = url.searchParams.get('user_id')?.slice(3);
    if (fault === 'network' && method === 'GET') return Response.json({}, { status: 500 });
    if (method === 'GET') {
      const rows = state[table].filter(row => (!target || target.startsWith('(') || row.user_id === target) && (row.user_id === id || fault === 'read'));
      return Response.json(url.searchParams.get('select') === 'user_id' ? rows.map(row => ({ user_id: row.user_id })) : rows);
    }
    if (method === 'POST') {
      if (removed && i === 0) return Response.json({ code: '23503' }, { status: 400 });
      if (body.user_id !== id) return fault === 'insert' ? Response.json([body], { status: 201 }) : Response.json({ code: '42501' }, { status: 403 });
      if (!state[table].some(row => row.user_id === id)) state[table].push({ ...body, updated_at: '2026-10-13T12:00:00Z' });
      return Response.json(state[table].filter(row => row.user_id === id), { status: 201 });
    }
    if (method === 'PATCH' && body.user_id) return fault === 'transfer' ? Response.json([body]) : Response.json({ code: '42501' }, { status: 403 });
    if (fault === method.toLowerCase()) return Response.json([{ user_id: target }]);
    return Response.json([]);
  };
  return { accounts, state, requests, fetchImpl, deleteA: () => { removed = true; for (const table of TABLES) state[table] = state[table].filter(row => row.user_id !== ids[0]); } };
}

test('positive controls, symmetric API isolation, and retained deletion-session checks', async () => {
  const h = harness(), messages = [];
  const context = await prepareFixtures(config, h.accounts, { fetchImpl: h.fetchImpl, runId, report: line => messages.push(line) });
  await assert.rejects(runIsolation(config, context, { fetchImpl: h.fetchImpl }), /confirmation/);
  assert(!h.requests.some(r => r.method === 'DELETE'));
  await runIsolation(config, context, { fetchImpl: h.fetchImpl, allowFixtureDelete: true, report: line => messages.push(line) });
  assert.equal(h.requests.filter(r => r.method === 'DELETE').length, 6);
  for (const request of h.requests.filter(r => r.method === 'DELETE' || r.method === 'PATCH')) {
    assert.equal(request.query.get('user_id'), `eq.${ids[request.body?.user_id ? request.i : 1 - request.i]}`);
    if (request.path.endsWith('/sync_devices')) assert.equal(request.query.get('device_id'), `eq.${runId}`);
    if (request.path.endsWith('/custody_entries')) assert.equal(request.query.get('entry_date'), 'eq.2099-12-30');
  }
  await assert.rejects(checkDeletedSession(config, context, { fetchImpl: h.fetchImpl }), /still recognizes/);
  h.deleteA();
  await checkDeletedSession(config, context, { fetchImpl: h.fetchImpl, report: line => messages.push(line) });
  assert(messages.some(line => line.includes('refresh token rejected')));
  assert(!messages.join('\n').includes('private-'));
  for (const table of TABLES) assert.equal(h.state[table].filter(row => row.user_id === ids[1]).length, 1);
  assert(!h.requests.some(r => r.path.includes('/admin/') || r.path === '/api/account'));
});

test('preflight checks both accounts before any writes and refuses existing records', async () => {
  for (const options of [{ existing: true }, { invalidB: true }]) {
    const h = harness(options);
    await assert.rejects(prepareFixtures(config, h.accounts, { fetchImpl: h.fetchImpl, runId }), QaError);
    assert(h.requests.every(r => r.method === 'GET'));
  }
});

test('invalid config, same user, and near-expired sessions cannot start tests', async () => {
  const h = harness();
  await assert.rejects(prepareFixtures({ ...config, publishableKey: 'sb_secret_never-use' }, h.accounts, { fetchImpl: h.fetchImpl }), /public publishable/);
  await assert.rejects(prepareFixtures(config, [h.accounts[0], h.accounts[0]], { fetchImpl: h.fetchImpl }), /different/);
  h.accounts[0].expires_at = Math.floor(Date.now() / 1000) + 10;
  await assert.rejects(prepareFixtures(config, h.accounts, { fetchImpl: h.fetchImpl }), /expires too soon/);
  assert(!h.requests.some(r => r.method !== 'GET'));
});

for (const fault of ['read', 'patch', 'delete', 'insert', 'transfer', 'network']) {
  test(`a ${fault} regression is never recorded as an isolation pass`, async () => {
    const safe = harness();
    const context = await prepareFixtures(config, safe.accounts, { fetchImpl: safe.fetchImpl, runId });
    const broken = harness({ fault });
    Object.assign(broken.state, structuredClone(safe.state));
    await assert.rejects(runIsolation(config, context, { fetchImpl: broken.fetchImpl, allowFixtureDelete: true }), QaError);
  });
}

test('deleted-session checks reject expired tokens, altered controls, and inconclusive refresh errors', async () => {
  const h = harness({ refreshCode: 'unexpected_failure' });
  const context = await prepareFixtures(config, h.accounts, { fetchImpl: h.fetchImpl, runId });
  h.deleteA();
  await assert.rejects(checkDeletedSession(config, context, { fetchImpl: h.fetchImpl }), /conclusively revoked/);
  context.accounts[0].expires_at = Math.floor(Date.now() / 1000) - 1;
  await assert.rejects(checkDeletedSession(config, context, { fetchImpl: h.fetchImpl }), /inconclusive/);
  context.accounts[0].expires_at = Math.floor(Date.now() / 1000) + 3600;
  h.state.profiles[0].current_parent_label = 'changed';
  await assert.rejects(checkDeletedSession(config, context, { fetchImpl: h.fetchImpl }), /account B changed/);
});

test('local server only exposes allowlisted files, no-store responses, and the public key', async () => {
  const server = createQaServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const headers = {};
    for (const path of ['/', '/qa.js', '/checks.mjs', '/styles.css', '/config.js', '/vendor/supabase.js']) {
      const response = await fetch(`${origin}${path}`, { headers });
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    }
    assert.equal((await fetch(`${origin}/config.js`, { headers })).status, 200);
    assert.equal((await fetch(`${origin}/.git/config`, { headers })).status, 404);
    assert.equal((await fetch(`${origin}/supabase-config.js`, { headers })).status, 404);
    const rebindingStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(`${origin}/`, { headers: { host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(rebindingStatus, 403);
    assert.equal((await fetch(`${origin}/`, { headers, method: 'POST' })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
