export const TABLES = ['profiles', 'custody_entries', 'sync_devices'];
export class QaError extends Error {}

function requireThat(condition, message) {
  if (!condition) throw new QaError(message);
}

function api(config, account, fetchImpl) {
  return async (path, { method = 'GET', body, prefer } = {}) => {
    const response = await fetchImpl(`${config.url}${path}`, {
      method, cache: 'no-store', credentials: 'omit',
      headers: {
        apikey: config.publishableKey, Authorization: `Bearer ${account.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(prefer ? { Prefer: prefer } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000)
    });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, ok: response.ok, data };
  };
}

function fixtures(id, runId) {
  return {
    profiles: { user_id: id, current_parent_label: `QA ${runId}`, co_parent_label: 'Synthetic control' },
    custody_entries: { user_id: id, entry_date: '2099-12-30', entry_json: { security_qa: runId }, device_id: runId },
    sync_devices: { user_id: id, device_id: runId, client_schema_version: 1 }
  };
}

function query(table, id, runId) {
  const params = new URLSearchParams({ user_id: `eq.${id}` });
  if (table === 'custody_entries') params.set('entry_date', 'eq.2099-12-30');
  if (table === 'sync_devices') params.set('device_id', `eq.${runId}`);
  return `/rest/v1/${table}?${params}`;
}

async function readOwn(request, table, id, preflight = false) {
  const response = await request(`/rest/v1/${table}?${new URLSearchParams({ user_id: `eq.${id}`, select: preflight ? 'user_id' : '*', ...(preflight ? { limit: '1' } : {}) })}`);
  requireThat(response.ok && Array.isArray(response.data), `${table}: owner read failed; no pass recorded.`);
  return response.data;
}

async function verifyIdentity(request, account) {
  const response = await request('/auth/v1/user');
  requireThat(response.ok && response.data?.id === account.user.id &&
    response.data?.email?.toLowerCase() === account.expectedEmail.toLowerCase(),
  'A test session is invalid or belongs to a different email.');
  requireThat(account.expires_at * 1000 > Date.now() + 120000, 'Test session expires too soon. Sign in again.');
}

function validate(config, accounts) {
  const url = new URL(config.url);
  requireThat(url.protocol === 'https:' && url.origin === config.url && url.hostname.endsWith('.supabase.co'), 'Use the configured HTTPS Supabase project.');
  requireThat(config.publishableKey.startsWith('sb_publishable_'), 'Only a public publishable key is accepted.');
  requireThat(accounts.length === 2 && accounts[0].user?.id !== accounts[1].user?.id, 'Two different authenticated test users are required.');
  for (const account of accounts) {
    requireThat(/^[0-9a-f-]{36}$/i.test(account.user?.id || '') && account.expectedEmail &&
      account.access_token && account.refresh_token, 'Missing test identity or session.');
  }
}

export async function prepareFixtures(config, accounts, { fetchImpl = fetch, runId = crypto.randomUUID(), report = () => {} } = {}) {
  validate(config, accounts);
  requireThat(/^[0-9a-f-]{36}$/i.test(runId), 'Invalid fixture run ID.');
  const requests = accounts.map(account => api(config, account, fetchImpl));
  // Check both identities and all tables before the first write. Never adopt existing records.
  for (let i = 0; i < accounts.length; i++) {
    await verifyIdentity(requests[i], accounts[i]);
    for (const table of TABLES) {
      const rows = await readOwn(requests[i], table, accounts[i].user.id, true);
      requireThat(rows.length === 0, `Account ${i ? 'B' : 'A'} already has ${table} records. Use a fresh disposable account.`);
    }
  }
  const snapshots = [];
  for (let i = 0; i < accounts.length; i++) {
    const rows = fixtures(accounts[i].user.id, runId);
    const snapshot = {};
    for (const table of TABLES) {
      const response = await requests[i](`/rest/v1/${table}`, { method: 'POST', body: rows[table], prefer: 'return=representation' });
      requireThat(response.ok && response.data?.length === 1 && response.data[0].user_id === accounts[i].user.id,
        `${table}: synthetic fixture creation failed. Stop and inspect the test accounts; no automatic cleanup was performed.`);
      const conflict = table === 'profiles' ? 'user_id' : table === 'custody_entries' ? 'user_id,entry_date' : 'user_id,device_id';
      const upsert = await requests[i](`/rest/v1/${table}?${new URLSearchParams({ on_conflict: conflict })}`, {
        method: 'POST', body: rows[table], prefer: 'resolution=merge-duplicates,return=representation'
      });
      requireThat(upsert.ok && upsert.data?.length === 1 && upsert.data[0].user_id === accounts[i].user.id, `${table}: owner upsert failed.`);
      snapshot[table] = await readOwn(requests[i], table, accounts[i].user.id);
      requireThat(snapshot[table].length === 1, `${table}: owner fixture read failed.`);
      report(`Account ${i ? 'B' : 'A'}: ${table} owner create/read/upsert passed.`);
    }
    snapshots.push(snapshot);
  }
  return { runId, accounts, snapshots };
}

export async function runIsolation(config, context, { allowFixtureDelete = false, fetchImpl = fetch, report = () => {} } = {}) {
  requireThat(allowFixtureDelete === true, 'Explicit confirmation for cross-account synthetic-fixture DELETE tests is required.');
  validate(config, context.accounts);
  const { accounts, snapshots, runId } = context;
  const requests = accounts.map(account => api(config, account, fetchImpl));
  for (let i = 0; i < 2; i++) await verifyIdentity(requests[i], accounts[i]);
  for (let i = 0; i < 2; i++) {
    const foreign = accounts[1 - i].user.id;
    for (const table of TABLES) {
      const label = `Account ${i ? 'B' : 'A'} -> ${i ? 'A' : 'B'} ${table}`;
      const target = query(table, foreign, runId);
      const read = await requests[i](target);
      requireThat(read.ok && Array.isArray(read.data) && read.data.length === 0, `${label}: foreign read was not denied.`);
      report(`${label}: foreign read hidden.`);
      const scoped = await requests[i](`/rest/v1/${table}?${new URLSearchParams({ select: 'user_id', user_id: `in.(${accounts.map(a => a.user.id).join(',')})` })}`);
      requireThat(scoped.ok && scoped.data?.length === 1 && scoped.data[0].user_id === accounts[i].user.id,
        `${label}: two-owner query did not return only the caller's fixture.`);
      for (const method of ['PATCH', 'DELETE']) {
        const response = await requests[i](target, {
          method, prefer: 'return=representation',
          ...(method === 'PATCH' ? { body: table === 'profiles' ? { current_parent_label: 'QA unexpected write' }
            : table === 'custody_entries' ? { entry_json: { unexpected_write: runId } } : { client_schema_version: 999 } } : {})
        });
        requireThat(response.ok && Array.isArray(response.data) && response.data.length === 0, `${label}: foreign ${method} was not denied.`);
        report(`${label}: foreign ${method} affected zero rows.`);
      }
      const forged = fixtures(foreign, runId)[table];
      for (const prefer of ['return=representation', 'resolution=merge-duplicates,return=representation']) {
        const conflict = table === 'profiles' ? 'user_id' : table === 'custody_entries' ? 'user_id,entry_date' : 'user_id,device_id';
        const response = await requests[i](`/rest/v1/${table}?${new URLSearchParams({ on_conflict: conflict })}`, { method: 'POST', body: forged, prefer });
        requireThat(response.status === 403 && response.data?.code === '42501', `${label}: foreign insert/upsert did not return an RLS denial.`);
      }
      const transfer = await requests[i](query(table, accounts[i].user.id, runId), { method: 'PATCH', body: { user_id: foreign }, prefer: 'return=representation' });
      requireThat(transfer.status === 403 && transfer.data?.code === '42501', `${label}: ownership transfer did not return an RLS denial.`);
      report(`${label}: foreign insert, upsert, and ownership transfer denied.`);
    }
  }
  for (let i = 0; i < 2; i++) {
    for (const table of TABLES) {
      const rows = await readOwn(requests[i], table, accounts[i].user.id);
      requireThat(JSON.stringify(rows) === JSON.stringify(snapshots[i][table]), `${table}: a control fixture changed.`);
    }
  }
  report('Both test accounts retain their unchanged synthetic control records.');
}

export async function checkDeletedSession(config, context, { fetchImpl = fetch, report = () => {} } = {}) {
  validate(config, context.accounts);
  const [removed, control] = context.accounts;
  requireThat(removed.expires_at * 1000 > Date.now() + 60000, 'Old access token has expired or is nearly expired. This deletion-session check is inconclusive.');
  const stale = api(config, removed, fetchImpl);
  const controlRequest = api(config, control, fetchImpl);
  await verifyIdentity(controlRequest, control);
  const user = await stale('/auth/v1/user');
  requireThat([401, 403].includes(user.status) && !user.data?.id, 'Auth still recognizes account A; deletion was not established.');
  for (const table of TABLES) {
    const read = await stale(query(table, removed.user.id, context.runId));
    requireThat([401, 403].includes(read.status) || (read.ok && Array.isArray(read.data) && read.data.length === 0), `${table}: old session still reads data or returned an inconclusive error.`);
    const insert = await stale(`/rest/v1/${table}`, { method: 'POST', body: fixtures(removed.user.id, context.runId)[table], prefer: 'return=representation' });
    requireThat(insert.status === 401 || (insert.status === 403 && insert.data?.code === '42501') ||
      (insert.status === 400 && insert.data?.code === '23503'), `${table}: old session write was not safely denied.`);
    const controlRows = await readOwn(controlRequest, table, control.user.id);
    requireThat(JSON.stringify(controlRows) === JSON.stringify(context.snapshots[1][table]), `${table}: account B changed after deletion.`);
    report(`${table}: old session cannot restore/create rows; account B unchanged.`);
  }
  const refreshed = await stale('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: removed.refresh_token } });
  requireThat([400, 401, 403].includes(refreshed.status) &&
    ['refresh_token_not_found', 'user_not_found', 'session_not_found'].includes(refreshed.data?.error_code || refreshed.data?.code),
  'Old refresh session was not conclusively revoked. No credentials are shown; inspect Auth state.');
  report('Original account A refresh token rejected. Independently verify Auth deletion and cascade counts in Supabase.');
}
