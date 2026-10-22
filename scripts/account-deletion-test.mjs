import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';

const userId = 'a6f9850b-894e-4d0d-b7c7-df644ca722b0';
const env = {
  ACCOUNT_DELETION_ENABLED: 'true',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'server-test-secret'
};
const originalFetch = globalThis.fetch;
let calls = [];
let authStatus = 200;
let deleteStatus = 200;
let authUser = { id: userId, email: 'test@example.com' };
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), ...init });
  if (String(url).endsWith('/auth/v1/user')) {
    return Response.json(authStatus === 200 ? authUser : { msg: 'private auth error' }, { status: authStatus });
  }
  assert.equal(String(url), `${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`);
  return Response.json(deleteStatus === 200 ? { id: userId } : { msg: 'private deletion error' }, { status: deleteStatus });
};

async function remove({ method = 'DELETE', headers = {}, body = { confirmation: 'DELETE' }, config = env } = {}) {
  const request = new Request('https://app.example/api/account', {
    method,
    headers: { authorization: 'Bearer user-test-token', 'content-type': 'application/json', origin: 'https://app.example', ...headers },
    ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
  });
  const response = await worker.fetch(request, config);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const result = await response.json();
  assert(!JSON.stringify(result).includes('server-test-secret'));
  assert(!JSON.stringify(result).includes('private '));
  return { response, result };
}

try {
  for (const [options, status] of [
    [{ method: 'GET' }, 405],
    [{ method: 'POST' }, 405],
    [{ method: 'OPTIONS' }, 405],
    [{ headers: { origin: 'https://untrusted.example' } }, 403],
    [{ headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    [{ headers: { authorization: '' } }, 401],
    [{ headers: { authorization: 'Bearer token extra' } }, 401],
    [{ headers: { 'content-type': 'text/plain' } }, 415],
    [{ body: 'not json' }, 400],
    [{ body: null }, 400],
    [{ body: {} }, 400],
    [{ body: { confirmation: 'delete' } }, 400],
    [{ body: { confirmation: 'DELETE', user_id: 'someone-else' } }, 400],
    [{ config: { ...env, ACCOUNT_DELETION_ENABLED: 'false' } }, 503],
    [{ config: { ...env, SUPABASE_SECRET_KEY: '' } }, 503],
    [{ config: { ...env, SUPABASE_URL: '' } }, 503]
  ]) {
    calls = [];
    assert.equal((await remove(options)).response.status, status);
    assert.equal(calls.length, 0, 'Rejected requests must never call the privileged API');
  }
  for (const status of [401, 403, 500]) {
    authStatus = status;
    calls = [];
    assert.equal((await remove()).response.status, status === 500 ? 502 : 401);
    assert.equal(calls.length, 1, 'Failed verification must never delete an account');
  }
  authStatus = 200;
  authUser = {};
  calls = [];
  assert.equal((await remove()).response.status, 401);
  assert.equal(calls.length, 1, 'A missing user must never reach the admin delete endpoint');
  authUser = { id: userId };
  deleteStatus = 500;
  assert.equal((await remove()).response.status, 502);
  deleteStatus = 200;
  calls = [];
  const { response, result } = await remove();
  assert.equal(response.status, 200);
  assert.deepEqual(result, { deleted: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.Authorization, 'Bearer user-test-token');
  assert.equal(calls[1].headers.Authorization, `Bearer ${env.SUPABASE_SECRET_KEY}`);
  assert.equal(calls[1].method, 'DELETE');
  assert.equal(JSON.parse(calls[1].body).should_soft_delete, false);
} finally {
  globalThis.fetch = originalFetch;
}

const clientSource = readFileSync(new URL('../supabase-client.js', import.meta.url), 'utf8');
function clientHarness({ protocol = 'https:', fail = false, logoutFails = false, signedIn = true } = {}) {
  const events = [];
  const storage = new Map([
    ['sb-project-auth-token', 'session'],
    ['sb-project-auth-token-code-verifier', 'verifier'],
    ['sb-project-auth-token-user', 'user'],
    ['custody_tracker_config', 'local profile'],
    ['familylog_entries', 'local records']
  ]);
  const context = {
    URL, setTimeout, clearTimeout,
    localStorage: { removeItem: key => storage.delete(key) },
    window: {
      location: { protocol },
      WHOSE_DAY_SUPABASE: { enabled: true, url: 'https://project.supabase.co', publishableKey: 'public-test-key' },
      supabase: { createClient: (_url, key, options) => {
        assert.equal(key, 'public-test-key');
        assert.equal(options.auth.storageKey, 'sb-project-auth-token');
        return { auth: {
          getSession: async () => ({ data: { session: signedIn ? { access_token: 'user-test-token' } : null } }),
          stopAutoRefresh: async () => events.push('stop'),
          signOut: async options => {
            assert.equal(options.scope, 'local');
            events.push('logout');
            if (!logoutFails) storage.delete('sb-project-auth-token');
            return { error: logoutFails ? new Error('offline') : null };
          }
        } };
      } }
    },
    fetch: async (url, init) => {
      events.push('request');
      assert.equal(url, '/api/account');
      assert.equal(init.method, 'DELETE');
      assert.equal(init.credentials, 'omit');
      assert.equal(init.headers.authorization, 'Bearer user-test-token');
      assert.equal(init.body, '{"confirmation":"DELETE"}');
      return Response.json(fail ? { message: 'temporarily unavailable' } : { deleted: true }, { status: fail ? 503 : 200 });
    }
  };
  vm.runInNewContext(clientSource, context);
  return { backend: context.window.WhoseDayBackend, events, storage };
}
for (const options of [{ protocol: 'file:' }, { signedIn: false }, { fail: true }]) {
  const { backend, events, storage } = clientHarness(options);
  await assert.rejects(backend.deleteAccount());
  assert(!events.includes('logout'), 'A failed deletion must not sign out the user');
  assert.equal(storage.get('sb-project-auth-token'), 'session');
  assert.equal(storage.get('familylog_entries'), 'local records');
}
for (const logoutFails of [false, true]) {
  const { backend, events, storage } = clientHarness({ logoutFails });
  assert.equal(await backend.deleteAccount(), true);
  assert.deepEqual(events, ['request', 'stop', 'logout']);
  assert.equal(storage.get('custody_tracker_config'), 'local profile');
  assert.equal(storage.get('familylog_entries'), 'local records');
  assert(!storage.has('sb-project-auth-token'), 'Clear the dead session even if logout fails');
  if (logoutFails) assert(!storage.has('sb-project-auth-token-user'));
}

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const handler = appSource.slice(appSource.indexOf('async function deleteCloudAccount(){'), appSource.indexOf('\nasync function resolveCloudConflict'));
for (const fail of [false, true]) {
  const events = [];
  const telemetry=[];
  let finishSync;
  const input = { value: 'DELETE', focus: () => events.push('notice-focused') };
  const storage = new Map();
  const context = {
    trackUsage:(event,properties)=>telemetry.push({event,properties}),
    trackFailure:event=>telemetry.push({event}),
    cloudAuthBusy: false, cloudDeletionBusy: false, cloudSyncPending: true, cloudSyncTimer: null,
    cloudSyncTask: new Promise(resolve => { finishSync = resolve; }),
    document: { getElementById: () => input },
    window: { WhoseDayBackend: { deleteAccount: async () => {
      assert.equal(context.cloudDeletionBusy, true);
      events.push('delete');
      if (fail) throw new Error('try again');
    } } },
    clearTimeout,
    ACCOUNT_DELETED_KEY: 'whose_day_account_deleted',
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    setOnboardingMode: () => {}, startWelcome: () => events.push('welcome'),
    setCloudAuthBusy: busy => { context.cloudAuthBusy = busy; },
    setCloudAuthMessage: (message, tone) => events.push({ message, tone }),
    getEntries: () => ({ '2026-10-12': { notes: 'preserve' } }),
    setStoredSyncConflicts: () => events.push('clear-conflicts'),
    updateProfileSyncDetail: () => {}, updateEntryBackupDetail: () => {},
    updateCloudDeleteButton: () => {}, refreshCloudAuthUi: async () => {},
    updateCloudSyncStatusUi: () => {}
  };
  const operation = vm.runInNewContext(`${handler}\ndeleteCloudAccount()`, context);
  assert.equal(context.cloudDeletionBusy, true);
  assert(!events.includes('delete'), 'Deletion must wait for the already-running sync');
  finishSync();
  await operation;
  assert(events.includes('delete'));
  assert.equal(telemetry.filter(e=>e.event==='Account Deletion Completed').length,fail?0:1);
  assert.equal(telemetry.filter(e=>e.event==='Account Deletion Failed').length,fail?1:0);
  assert.equal(context.cloudDeletionBusy, false);
  assert.equal(context.cloudAuthBusy, false);
  assert.equal(events.some(event => event.tone === 'success'), !fail);
  assert.equal(events.includes('clear-conflicts'), !fail);
  assert.equal(input.value, fail ? 'DELETE' : '');
  assert.equal(events.includes('welcome'), !fail, 'Navigate only after successful deletion');
  assert.equal(events.includes('notice-focused'), !fail);
  assert.equal(storage.has('whose_day_account_deleted'), !fail);
}

// New sync tasks and queued timers must remain blocked throughout deletion.
const syncContext = {
  backupRestoreBusy:false, backupRecoveryError:'',
  appAccessState:'signed-in', cloudDeletionBusy: true, cloudSyncBusy: false, cloudSyncPending: false,
  URLSearchParams, window: { location: { search: '' } }, navigator: { onLine: true },
  cloudBackendEnabled: () => true,
  accountDeletedOnDevice: () => false,
  performCloudSync: () => { throw new Error('Sync started during account deletion'); }
};
for (const [start, end] of [
  ['function cloudSyncAllowed(){', '\nfunction cloudRedirectUrl'],
  ["function scheduleCloudSync(reason='manual',delay=900){", '\nfunction profilePayloadFromConfig'],
  ['function syncCloudData(options={}){', '\nasync function performCloudSync']
]) {
  vm.runInNewContext(appSource.slice(appSource.indexOf(start), appSource.indexOf(end)), syncContext);
}
assert.equal(syncContext.cloudSyncAllowed(), false);
syncContext.scheduleCloudSync();
assert.equal(syncContext.cloudSyncPending, false);
assert.equal(await syncContext.syncCloudData(), null);

console.log('Account deletion tests passed (authorization, API failures, local preservation, sync ordering).');
