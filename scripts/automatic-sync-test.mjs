import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const functions = [
  slice('function stableStringify(', 'function formatSyncTime('),
  slice("function scheduleCloudSync(reason=", 'function profilePayloadFromConfig('),
  slice('function reconcileLocalAndCloudRows(', 'async function initCloudAuthUi('),
  slice('function getEntries(){', 'function loggedEntryCount(')
].join('\n');
const date = '2026-10-12';
const original = { diary: 'Original', loggedAt: '2026-10-12T12:00:00Z' };
const edit = diary => ({ diary, loggedAt: '2026-10-12T13:00:00Z' });
function harness({ storage = new Map(), cloud = new Map(), userId = 'owner' } = {}) {
  let timerId = 0;
  let version = 0;
  const timers = new Map();
  const statuses = [];
  const writes = [];
  const context = {
    SYNC_BASE_KEY: 'whose_day_entry_sync_base', cloudSyncGeneration: 0,
    cloudSyncRetryAttempt: 0, cloudSyncBusy: false, cloudSyncPending: false,
    cloudSyncTimer: null, cloudSyncRefreshTimer: null, cloudSyncTask: null, cloudDeletionBusy: false,
    document: { hidden: false, getElementById: () => null },
    navigator: { onLine: true }, conflicts: [],
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    sessionStorage: { setItem: () => {} },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    hasSavedConfig: () => true, accountDeletedOnDevice: () => false,
    cloudBackendEnabled: () => true, lockSignedOutApp:()=>{},
    cloudSyncAllowed: () => context.navigator.onLine && !context.cloudDeletionBusy,
    updateCloudSyncStatusUi: status => statuses.push(status),
    setCloudAuthMessage: () => {}, updateProfileSyncDetail: () => {},
    profilePayloadFromConfig: () => ({ user_id: userId }),
    initHome: () => {}, recordSyncDevice: async () => {}, updateEntryBackupDetail: () => {},
    setStoredSyncConflicts: conflicts => { context.conflicts = conflicts; },
    window: { WhoseDayBackend: {
      getSession: async () => ({ user: { id: userId } }),
      getProfile: async () => { if (context.failRead) throw new Error('Network interrupted'); return {}; },
      upsertProfile: async () => ({}),
      getCustodyEntries: async () => {
        const rows = structuredClone([...cloud.values()]);
        if (context.afterRead) { const hook = context.afterRead; context.afterRead = null; await hook(); }
        return rows;
      },
      saveCustodyEntry: async (row, expected) => {
        if (context.beforeWrite) { const hook = context.beforeWrite; context.beforeWrite = null; await hook(); }
        const previous = cloud.get(row.entry_date);
        if (previous ? previous.updated_at !== expected : expected !== null) return null;
        const saved = structuredClone({ ...row, updated_at: `version-${++version}` });
        cloud.set(row.entry_date, saved);
        writes.push(saved);
        return structuredClone(saved);
      }
    } }
  };
  vm.createContext(context);
  vm.runInContext(functions, context);
  context.localEntryRowsForBackup = id => Object.entries(context.getEntries()).map(([entry_date, entry_json]) => ({ user_id: id, entry_date, entry_json, client_updated_at: entry_json.loggedAt, device_id: 'device-B' }));
  if (!storage.has('familylog_entries')) context.putEntries({ [date]: original }, { skipSync: true });
  if (!cloud.size) cloud.set(date, { entry_date: date, entry_json: original, updated_at: 'version-0', device_id: 'device-A' });
  return {
    context, storage, cloud, timers, writes, statuses,
    sync: () => context.syncCloudData(),
    change: entry => context.putEntries({ [date]: entry }),
    tick: async () => {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      await timer.fn();
    }
  };
}

{
  const h = harness();
  await h.sync(); // Seed the last shared copy, even though device A wrote it.
  h.context.navigator.onLine = false;
  h.change(edit('Offline edit'));
  assert.equal(h.statuses.at(-1).state, 'offline');
  assert.equal(await h.sync(), null);
  assert.equal(h.writes.length, 0);
  h.context.navigator.onLine = true;
  h.context.scheduleCloudSync('online', 200);
  await h.tick();
  assert.equal(h.cloud.get(date).entry_json.diary, 'Offline edit');
  assert.equal(h.context.conflicts.length, 0);
  assert.equal(h.statuses.at(-1).state, 'synced');
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 15000, 'Keep receiving changes while the app stays visible');
  // A later remote-only change should also converge without opening Settings.
  h.cloud.set(date, { ...h.cloud.get(date), entry_json: edit('Remote edit'), updated_at: 'remote-2', device_id: 'device-A' });
  await h.sync();
  assert.equal(h.context.getEntries()[date].diary, 'Remote edit');
  assert.equal(h.context.conflicts.length, 0);
}
{
  const h = harness(); await h.sync();
  h.change(edit('Local edit'));
  h.cloud.set(date, { ...h.cloud.get(date), entry_json: edit('Competing remote edit'), updated_at: 'remote-2' });
  await h.sync();
  assert.equal(h.context.conflicts.length, 1);
  assert.equal(h.writes.length, 0);
  assert.equal(h.context.getEntries()[date].diary, 'Local edit');
  assert.equal(h.cloud.get(date).entry_json.diary, 'Competing remote edit');
}
{
  const h = harness(); await h.sync();
  h.context.document.hidden = true;
  await h.tick();
  assert.equal(h.timers.size, 0, 'Do not poll while the app is hidden');
  h.context.document.hidden = false;
  h.context.window.WhoseDayBackend.getSession = async () => null;
  await h.sync();
  assert.equal(h.timers.size, 0, 'Do not keep polling after sign-out');
}
{
  const h = harness(); await h.sync(); h.change(edit('Pending'));
  h.context.failRead = true;
  await h.sync();
  assert.equal(h.statuses.at(-2).state, 'error');
  assert.equal([...h.timers.values()][0].delay, 2000);
  h.context.failRead = false;
  await h.tick();
  assert.equal(h.cloud.get(date).entry_json.diary, 'Pending');
  assert.equal(h.statuses.at(-1).state, 'synced');
}
{
  const h = harness(); await h.sync(); h.change(edit('First save'));
  h.context.beforeWrite = () => h.change(edit('Save during upload'));
  await h.sync();
  assert.equal(h.cloud.get(date).entry_json.diary, 'First save');
  assert.equal(h.context.getEntries()[date].diary, 'Save during upload');
  await h.tick();
  assert.equal(h.cloud.get(date).entry_json.diary, 'Save during upload');
  assert.equal(h.statuses.at(-1).state, 'synced');
}
{
  const h = harness(); await h.sync(); h.change(edit('Local pending'));
  h.context.beforeWrite = () => h.cloud.set(date, { ...h.cloud.get(date), entry_json: edit('Concurrent writer'), updated_at: 'concurrent' });
  await h.sync(); await h.tick();
  assert.equal(h.cloud.get(date).entry_json.diary, 'Concurrent writer');
  assert.equal(h.context.conflicts.length, 1);
  assert.equal(h.writes.length, 0, 'A stale expected version must not overwrite a concurrent write');
}
{
  const h = harness(); await h.sync();
  h.cloud.set(date, { ...h.cloud.get(date), entry_json: edit('Remote edit'), updated_at: 'remote' });
  h.context.afterRead = () => h.change(edit('Edit during download'));
  await h.sync(); await h.tick();
  assert.equal(h.context.getEntries()[date].diary, 'Edit during download');
  assert.equal(h.context.conflicts.length, 1);
}
{
  const h = harness(); await h.sync();
  h.change(edit('Persisted pending edit'));
  const reopened = harness({ storage: h.storage, cloud: h.cloud });
  await reopened.sync();
  assert.equal(reopened.cloud.get(date).entry_json.diary, 'Persisted pending edit');
  assert.equal(reopened.context.conflicts.length, 0, 'Reload must preserve the last shared copy');
  const otherAccount = harness({ storage: h.storage, cloud: new Map([[date, { entry_date: date, entry_json: original, updated_at: 'other', device_id: 'device-B' }]]), userId: 'different-owner' });
  await otherAccount.sync();
  assert.equal(otherAccount.context.conflicts.length, 1, 'Another account cannot reuse this account baseline, even with a matching device ID');
}

// Exercise the real SDK helper's conditional update/insert contract without a server.
for (const mode of ['update', 'insert', 'race', 'error']) {
  const calls = [];
  const chain = new Proxy({}, { get: (_target, method) => (...args) => {
    calls.push([method, ...args]);
    if (method === 'single' || method === 'maybeSingle') return Promise.resolve({ data: mode === 'race' ? null : { entry_date: date }, error: mode === 'error' ? { code: '42501' } : null });
    return chain;
  } });
  const context = {
    window: { WHOSE_DAY_SUPABASE: { enabled: true, url: 'https://project.supabase.co', publishableKey: 'public-test' }, supabase: { createClient: () => ({ from: table => { calls.push(['from', table]); return chain; } }) } }, URL
  };
  vm.runInNewContext(readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8'), context);
  const request = context.window.WhoseDayBackend.saveCustodyEntry({ user_id: 'owner', entry_date: date }, mode === 'insert' ? null : 'expected-server-version');
  if (mode === 'error') await assert.rejects(request);
  else assert.equal((await request)?.entry_date ?? null, mode === 'race' ? null : date);
  if (mode !== 'insert') assert(calls.some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === 'expected-server-version'));
  assert(!calls.some(call => call[0] === 'upsert'), 'Never use an unconditional upsert for reconciled entries');
}
console.log('Automatic sync passed (offline reconnect, remote pull, real conflicts, retries, in-flight edits, concurrent writes, reload/account isolation, guarded SDK writes).');
