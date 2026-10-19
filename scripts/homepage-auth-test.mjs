import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function restoreLoggedOutCloudAccount('), source.indexOf('\nfunction obSetExample'));
for (const state of ['new', 'incomplete', 'existing']) {
  const existing = state === 'existing';
  const events = [];
  const input = { value: '' };
  const context = {
    loggedOutAuthBusy: false, OB_STATE: {},
    loggedOutLoginActive: () => true,
    document: { getElementById: () => input },
    window: { WhoseDayBackend: {
      getSession: async () => ({ user: { id: 'test', email: 'parent@example.com' } }),
      getProfile: async () => state === 'new' ? null : { id: 'test', terms_accepted_at: existing ? '2026-10-12T12:00:00Z' : null },
      getCustodyEntries: async () => [],
    } },
    setLoggedOutAuthBusy: value => { context.loggedOutAuthBusy = value; events.push(['busy', value]); },
    show: id => events.push(['screen', id]),
    setLoggedOutAuthMessage: value => events.push(['message', value]),
    saveConfig: () => events.push(['saved']), configFromProfile: x => x,
    getEntries: () => ({}), putEntries: () => {}, rememberEntrySyncBase: () => {}, recordSyncDevice: async () => {},
    setOnboardingMode: () => {}, renderConfigurableUi: () => {}, recordAppSession: () => {}, initHome: () => {},
  };
  vm.createContext(context);
  await vm.runInContext(`${fn}\nrestoreLoggedOutCloudAccount()`, context);
  assert(events.some(x => x[0] === 'screen' && x[1] === (existing ? 's-home' : 's-ob-name')));
  assert.deepEqual(events.at(-1), ['busy', false]);
  if (!existing) {
    assert.equal(input.value, 'parent@example.com');
    assert(!events.some(x => x[0] === 'saved'), 'New account must accept terms and finish setup before saving');
  }
}

const refresh = source.slice(source.indexOf('async function refreshLoggedOutLoginUi('), source.indexOf('\nasync function sendLoggedOutSignInLink'));
for (const signedIn of [false, true]) {
  let restores = 0;
  const button = { hidden: true };
  const session = signedIn ? { user: { id: 'test' } } : null;
  const context = {
    loggedOutAuthBusy: false,
    loggedOutAuthEnabled: () => true,
    loggedOutLoginActive: () => true,
    document: { getElementById: () => button },
    window: { WhoseDayBackend: { getSession: async () => session } },
    setLoggedOutAuthBusy: value => { context.loggedOutAuthBusy = value; },
    setLoggedOutAuthMessage: () => {},
    restoreLoggedOutCloudAccount: async verified => {
      assert.equal(context.loggedOutAuthBusy, false, 'Release the check lock before restoring');
      assert.equal(verified, session, 'Reuse the verified session instead of waiting for another check');
      restores++;
    }
  };
  vm.createContext(context);
  vm.runInContext(refresh, context);
  await context.refreshLoggedOutLoginUi(false);
  assert.equal(restores, signedIn ? 1 : 0, 'Sign-in completion must advance without clicking Continue');
  assert.equal(button.hidden, !signedIn);
  context.loggedOutAuthBusy = true;
  await context.refreshLoggedOutLoginUi(false);
  assert.equal(restores, signedIn ? 1 : 0, 'Ignore duplicate refreshes while another auth action is busy');
  context.loggedOutAuthBusy = false;
  context.loggedOutLoginActive = () => false;
  await context.refreshLoggedOutLoginUi(false);
  assert.equal(restores, signedIn ? 1 : 0, 'Do not navigate after the user has left sign-in');
}

const syncAllowed = source.slice(source.indexOf('function cloudSyncAllowed(){'), source.indexOf('\nfunction cloudRedirectUrl'));
const syncContext = {
  URLSearchParams, cloudDeletionBusy: false,
  window: { location: { search: '' } }, navigator: { onLine: true },
  hasSavedConfig: () => false, cloudBackendEnabled: () => true, accountDeletedOnDevice: () => false
};
vm.runInNewContext(syncAllowed, syncContext);
assert.equal(syncContext.cloudSyncAllowed(), false, 'Never upload default settings before onboarding or restoration');
syncContext.hasSavedConfig = () => true;
assert.equal(syncContext.cloudSyncAllowed(), true, 'Completed setup should still sync automatically');
syncContext.accountDeletedOnDevice = () => true;
assert.equal(syncContext.cloudSyncAllowed(), false, 'Retained local records must not sync before completing sign-in/setup again');

{
  const events = [];
  const button = { hidden: true, value: '' };
  const context = {
    loggedOutAuthBusy: false, OB_STATE: {},
    loggedOutAuthEnabled: () => true, loggedOutLoginActive: () => true,
    document: { getElementById: () => button },
    window: { WhoseDayBackend: {
      getSession: async () => ({ user: { id: 'test', email: 'parent@example.com' } }),
      getProfile: async () => { throw new Error('Connection interrupted. Try Continue again.'); }
    } },
    setLoggedOutAuthBusy: value => { context.loggedOutAuthBusy = value; },
    setLoggedOutAuthMessage: message => events.push(message),
    show: screen => events.push(screen)
  };
  vm.createContext(context);
  vm.runInContext(refresh + '\n' + fn, context);
  await context.refreshLoggedOutLoginUi(false);
  assert.equal(context.loggedOutAuthBusy, false, 'A failed profile read must release the buttons');
  assert.equal(button.hidden, false, 'Keep Continue as an explicit retry after a failed restore');
  assert(events.includes('Connection interrupted. Try Continue again.'));
  context.window.WhoseDayBackend.getProfile = async () => null;
  await context.restoreLoggedOutCloudAccount();
  assert(events.includes('s-ob-name'), 'Continue must retry successfully without another sign-in email');
}
// Check actual SDK requests: sign-in must never silently create an account.
{
  const requests=[];
  const sdkSource=readFileSync(new URL('../supabase-client.js',import.meta.url),'utf8');
  const context={URL,window:{
    WHOSE_DAY_SUPABASE:{enabled:true,url:'https://test.supabase.co',publishableKey:'public-test'},
    supabase:{createClient:()=>({auth:{signInWithOtp:async request=>{requests.push(request);return {error:null};}}})}
  }};
  vm.runInNewContext(sdkSource,context);
  const auth=context.window.WhoseDayBackend;
  await auth.signInWithEmail('returning@example.com','https://whosedayapp.com/');
  await auth.signInWithEmail('new@example.com','https://whosedayapp.com/',{createUser:true});
  await auth.signInWithEmail('returning@example.com','https://whosedayapp.com/',{createUser:false});
  assert.deepEqual(requests.map(request=>request.options.shouldCreateUser),[false,true,false]);
  assert(requests.every(request=>request.options.emailRedirectTo==='https://whosedayapp.com/'));
}
console.log('Homepage auth tests passed (routing, automatic continuation, busy/back guards, sync-before-setup guard, explicit signup versus existing-account SDK requests).');
