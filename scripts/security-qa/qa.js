import { prepareFixtures, runIsolation, checkDeletedSession, QaError } from './checks.mjs';

const config = window.QA_CONFIG;
const slots = ['a', 'b'];
const prefix = 'whose-day-security-qa:';
const pendingKey = `${prefix}pending`;
const byId = id => document.getElementById(id);
const clients = Object.fromEntries(slots.map(slot => [slot, window.supabase.createClient(config.url, config.publishableKey, {
  auth: { storageKey: `${prefix}${slot}`, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' }
})]));
let busy = false, context = null, isolationPassed = false;
const cooldowns = {};
function message(text, tone = '') { byId('message').textContent = text; byId('message').dataset.tone = tone; }
function report(text) { const row = document.createElement('li'); row.textContent = text; byId('results').append(row); }
function stopped(error) { message(error instanceof QaError ? error.message : 'Check stopped due to an unexpected request failure. No pass recorded; no credentials or response data displayed.', 'error'); }
function pending() { try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; } }
function controls() {
  const current = pending();
  for (const slot of slots) {
    byId(`signin-${slot}`).disabled = busy || !!context || !!current || Date.now() < (cooldowns[slot] || 0);
    byId(`email-${slot}`).disabled = busy || !!context || !!current;
  }
  byId('cancel-pending').disabled = busy || !current;
  byId('prepare').disabled = busy || !!context || !byId('disposable').checked;
  byId('isolation').disabled = busy || !context || !byId('allow-delete').checked;
  byId('post-delete').disabled = busy || !context || !isolationPassed || !byId('deleted').checked;
  byId('clear').disabled = busy;
}
async function action(callback) {
  if (busy) return;
  busy = true; controls();
  try { await callback(); } catch {
    // Never render an SDK/network exception: it may include credentials or response data.
    message('Check stopped. No pass recorded. Keep the accounts unchanged for investigation; do not retry fixture creation.', 'error');
  } finally { busy = false; controls(); }
}
async function accounts() {
  const result = [];
  for (const slot of slots) {
    const { data, error } = await clients[slot].auth.getSession();
    if (error || !data.session) throw new Error('Missing session');
    result.push({ ...data.session, expectedEmail: byId(`email-${slot}`).value.trim().toLowerCase() });
  }
  return result;
}
async function statuses() {
  for (const slot of slots) {
    const { data } = await clients[slot].auth.getSession();
    const user = data.session?.user;
    byId(`status-${slot}`).textContent = user ? `${user.email} | ${user.id}` : 'Not signed in';
    if (user) byId(`email-${slot}`).value = user.email;
  }
}
for (const slot of slots) {
  byId(`signin-${slot}`).addEventListener('click', () => action(async () => {
    if (pending()) return;
    const email = byId(`email-${slot}`).value.trim().toLowerCase();
    if (!byId(`email-${slot}`).reportValidity() || !email) return;
    localStorage.setItem(pendingKey, JSON.stringify({ slot, email }));
    cooldowns[slot] = Date.now() + 65000;
    message(`Sending account ${slot.toUpperCase()} sign-in link...`);
    const { error } = await clients[slot].auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/`, shouldCreateUser: true } });
    if (error) { localStorage.removeItem(pendingKey); message('Email request failed. Wait before retrying; no credentials are displayed.', 'error'); return; }
    message(`Account ${slot.toUpperCase()} email sent. Open its link in this same browser before requesting the other account.`);
  }));
}
byId('cancel-pending').addEventListener('click', () => { localStorage.removeItem(pendingKey); message('Pending link canceled. Do not use the older email link.'); controls(); });
for (const id of ['disposable', 'allow-delete', 'deleted']) byId(id).addEventListener('change', controls);
byId('prepare').addEventListener('click', () => action(async () => {
  const captured = await accounts();
  if (!window.confirm(`Create synthetic records in the configured Supabase project for ONLY:\n${captured.map(a => a.expectedEmail).join('\n')}\nBoth accounts must be empty and disposable. No account will be deleted.`)) return;
  message('Verifying both empty accounts before writing fixtures...');
  try { context = await prepareFixtures(config, captured, { report }); }
  catch (error) { stopped(error); return; }
  message(`Fixtures ready. Keep this page open. Run ID: ${context.runId}`, 'success');
}));
byId('isolation').addEventListener('click', () => action(async () => {
  if (!window.confirm(`Run cross-account read/write/upsert/DELETE attempts against ONLY the synthetic records for:\n${context.accounts.map(a => a.expectedEmail).join('\n')}\nIf protection is broken, synthetic test rows could change or be deleted. No Auth account is deleted.`)) return;
  isolationPassed = false;
  message('Running authenticated account isolation checks...');
  try { await runIsolation(config, context, { allowFixtureDelete: true, report }); isolationPassed = true; }
  catch (error) { stopped(error); return; }
  message('Account isolation passed. Account deletion remains a separately confirmed manual action.', 'success');
}));
byId('post-delete').addEventListener('click', () => action(async () => {
  message('Testing the original account A session without refreshing it first...');
  try { await checkDeletedSession(config, context, { report }); }
  catch (error) { stopped(error); return; }
  message('Retained-session checks passed. Independent Auth/table counts and app UI QA are still required.', 'success');
}));
byId('clear').addEventListener('click', () => action(async () => {
  for (const slot of slots) {
    await clients[slot].auth.signOut({ scope: 'local' });
    for (const key of Object.keys(localStorage)) if (key.startsWith(`${prefix}${slot}`)) localStorage.removeItem(key);
  }
  localStorage.removeItem(pendingKey); context = null; isolationPassed = false;
  byId('results').replaceChildren(); await statuses();
  message('QA browser sessions cleared. Server-side test accounts and fixtures were not deleted.');
}));

byId('project').textContent = `Project: ${new URL(config.url).hostname.split('.')[0]}`;
async function hydrateCallback() {
  const callback = new URLSearchParams(location.hash.slice(1));
  const access_token = callback.get('access_token'), refresh_token = callback.get('refresh_token');
  if (location.hash) history.replaceState(null, '', '/');
  if (access_token || refresh_token) {
    const current = pending();
    if (!current || !slots.includes(current.slot) || !access_token || !refresh_token) {
      message('Unmatched sign-in callback discarded. Request a fresh link in this browser.', 'error'); return;
    }
    const { data, error } = await clients[current.slot].auth.setSession({ access_token, refresh_token });
    if (error || data.session?.user.email?.toLowerCase() !== current.email) {
      await clients[current.slot].auth.signOut({ scope: 'local' });
      localStorage.removeItem(pendingKey); message('Sign-in identity did not match the requested test account.', 'error'); return;
    }
    localStorage.removeItem(pendingKey); message(`Account ${current.slot.toUpperCase()} signed in.`, 'success');
  } else if (callback.has('error') || callback.has('error_code')) {
    localStorage.removeItem(pendingKey); message('Email link was rejected. Request a fresh test link.', 'error');
  }
  await statuses();
}
window.addEventListener('hashchange', () => action(hydrateCallback));
await action(hydrateCallback);
setInterval(controls, 1000);
