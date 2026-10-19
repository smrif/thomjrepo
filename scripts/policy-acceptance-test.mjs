import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const current = '2026-10-13';
const acceptedAt = '2026-10-13T19:00:00.000Z';
const oldAt = '2026-10-01T12:00:00.000Z';
const clone = value => JSON.parse(JSON.stringify(value));
let clock = acceptedAt;
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } }
const base = { currentParentLabel: 'Parent', coParentLabel: 'Other parent', children: ['Synthetic child'], email: 'qa@example.com', themeMode: 'light', termsAccepted: false };
function harness(config = base) {
  const storage = new Map();
  let sessions = 0;
  const context = {
    APP_CONFIG: structuredClone(config), CONFIG_KEY: 'custody_tracker_config',
    CURRENT_TERMS_VERSION: current, CURRENT_PRIVACY_VERSION: current,
    Date: TestDate, navigator: { onLine: true }, session: { user: { id: 'A' } },
    cloudBackendEnabled: () => true,
    window: { WhoseDayBackend: { getSession: async () => { sessions++; if (context.failSession) throw new Error('offline'); return context.session; } } },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    currentParent: () => context.APP_CONFIG.currentParentLabel,
    coParent: () => context.APP_CONFIG.coParentLabel,
    normalizeThemeMode: mode => mode || 'system'
  };
  const helpers = source.slice(source.indexOf('function hasCurrentPolicyAcceptance('), source.indexOf('function setPolicySaveBusy('));
  const payload = source.slice(source.indexOf('function profilePayloadFromConfig('), source.indexOf('function updateProfileSyncDetail('));
  vm.runInNewContext(helpers + '\n' + payload, context);
  return { context, storage, sessions: () => sessions };
}
function acceptance(row) {
  return Object.fromEntries(['terms_version', 'terms_accepted_at', 'privacy_version', 'privacy_accepted_at'].map(key => [key, row[key]]));
}
const remote = { user_id: 'A', terms_version: 'alpha-local', terms_accepted_at: oldAt, privacy_version: 'alpha-local', privacy_accepted_at: oldAt };
let checks = 0;
function equal(a, b, label) { assert.deepEqual(clone(a), clone(b), label); checks++; }

{
  const h = harness();
  const recorded = await h.context.capturePolicyAcceptance(' QA@Example.com ');
  equal(recorded, { termsAccepted: true, termsVersion: current, termsAcceptedAt: acceptedAt, privacyVersion: current, privacyAcceptedAt: acceptedAt, policyAcceptanceOwnerId: 'A', policyAcceptanceEmail: 'qa@example.com' }, 'Explicit acceptance captures both versions and the submission time');
  h.context.APP_CONFIG = { ...base, ...recorded };
  equal(h.context.hasCurrentPolicyAcceptance(h.context.APP_CONFIG), true);
  clock = '2026-10-14T12:00:00.000Z';
  const payload = h.context.profilePayloadFromConfig('A', null, 'qa@example.com');
  equal(acceptance(payload), { terms_version: current, terms_accepted_at: acceptedAt, privacy_version: current, privacy_accepted_at: acceptedAt }, 'Sync uses the actual acceptance time, not now');
  equal(acceptance(h.context.profilePayloadFromConfig('A', payload, 'qa@example.com')), acceptance(payload), 'Retries and ordinary sync never restamp consent');
  equal(acceptance(h.context.profilePayloadFromConfig('B', null, 'qa@example.com')), { terms_version: null, terms_accepted_at: null, privacy_version: null, privacy_accepted_at: null }, 'Same email/new user ID cannot inherit an earlier account acceptance');
  equal(acceptance(h.context.profilePayloadFromConfig('A', remote)), acceptance(payload), 'Explicit newer acceptance upgrades a known legacy version');
  const future = { ...remote, terms_version: '2027-01-01', privacy_version: 'unknown-future-version' };
  equal(acceptance(h.context.profilePayloadFromConfig('A', future)), acceptance(future), 'Unknown/future versions are not downgraded');
  const newer = { ...remote, terms_version: current, privacy_version: current, terms_accepted_at: clock, privacy_accepted_at: clock };
  equal(acceptance(h.context.profilePayloadFromConfig('A', newer)), acceptance(newer), 'Another device newer acceptance wins');
  assert.throws(() => h.context.profilePayloadFromConfig('A', { ...remote, user_id: 'B' }), /owner/); checks++;
}
clock = acceptedAt;
{
  const h = harness();
  equal((await h.context.capturePolicyAcceptance('qa@example.com', { preview: true })).policyAcceptanceOwnerId, null);
  equal(h.sessions(), 0, 'Preview does not resolve or attribute a real account');
}
for (const failure of ['offline', 'session-error', 'signed-out']) {
  const h = harness();
  if (failure === 'offline') h.context.navigator.onLine = false;
  if (failure === 'session-error') h.context.failSession = true;
  if (failure === 'signed-out') h.context.session = null;
  const recorded = await h.context.capturePolicyAcceptance('qa@example.com');
  equal(recorded.policyAcceptanceOwnerId, null, `${failure}: pending acceptance has no invented owner`);
  equal(recorded.termsAcceptedAt, acceptedAt);
  if (failure === 'offline') equal(h.sessions(), 0, 'Offline acceptance does not wait for Auth');
  h.context.APP_CONFIG = { ...base, ...recorded };
  equal(acceptance(h.context.profilePayloadFromConfig('B', null, 'other@example.com')), { terms_version: null, terms_accepted_at: null, privacy_version: null, privacy_accepted_at: null }, 'Pending acceptance cannot bind to a different email');
  equal(h.context.APP_CONFIG.policyAcceptanceOwnerId, null);
  equal(h.context.profilePayloadFromConfig('A', null, ' QA@example.com ').terms_accepted_at, acceptedAt);
  equal(JSON.parse(h.storage.get('custody_tracker_config')).policyAcceptanceOwnerId, 'A', 'First matching authenticated sync persists the owner binding');
  equal(h.context.profilePayloadFromConfig('B', null, 'qa@example.com').terms_accepted_at, null, 'Bound acceptance is not reusable by another subject');
}
{
  const h = harness({ ...base, termsAccepted: true });
  equal(acceptance(h.context.profilePayloadFromConfig('A', null, 'qa@example.com')), { terms_version: 'alpha-local', terms_accepted_at: null, privacy_version: 'alpha-local', privacy_accepted_at: null }, 'Legacy booleans retain uncertainty; no acceptance time is fabricated');
  equal(h.context.hasCurrentPolicyAcceptance(h.context.APP_CONFIG), false);
  for (const profile of [remote, { ...remote, privacy_accepted_at: null }, { ...remote, terms_version: '', privacy_version: null }, { ...remote, terms_accepted_at: null }]) {
    equal(acceptance(h.context.profilePayloadFromConfig('A', profile)), acceptance(profile), 'Preserve every existing cloud field, including missing or unknown metadata');
  }
  h.context.APP_CONFIG = { ...base, termsAccepted: true, termsVersion: current, termsAcceptedAt: acceptedAt, privacyVersion: current, privacyAcceptedAt: acceptedAt, policyAcceptanceOwnerId: 'B' };
  const restored = h.context.configFromProfile(remote);
  equal([restored.termsVersion, restored.termsAcceptedAt, restored.privacyVersion, restored.privacyAcceptedAt, restored.policyAcceptanceOwnerId], ['alpha-local', oldAt, 'alpha-local', oldAt, 'A'], 'Restore replaces rather than mixes accounts metadata');
  equal(h.context.configFromProfile({ user_id: 'A' }).termsAccepted, false, 'A local Boolean does not fabricate acceptance for an incomplete restored profile');
}

const manifest = JSON.parse(await readFile(new URL('../assets/legal/manifest.json', import.meta.url), 'utf8'));
const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const kind of ['terms', 'privacy']) {
  const item = manifest[kind];
  const snapshot = await readFile(new URL('../' + item.path, import.meta.url), 'utf8');
  const latest = await readFile(new URL(`../${kind}.html`, import.meta.url), 'utf8');
  equal(item.version, current);
  equal(createHash('sha256').update(snapshot).digest('hex'), item.sha256, 'Archived policy must keep its recorded hash');
  equal(snapshot, latest.replace('href="index.html"', 'href="../../../index.html"'), 'Versioned document matches the current policy text');
  assert(snapshot.includes(`<meta name="policy-version" content="${current}">`)); checks++;
  for (const id of ['s-ob-finish', 's-setup']) {
    const screen = markup.slice(markup.indexOf(`id="${id}"`), markup.indexOf(`id="${id}"`) + (id === 's-setup' ? 14000 : 2000));
    assert(screen.includes(`href="${item.path}"`), `${id} must link to the version it records`); checks++;
  }
}
console.log(`Policy acceptance passed (${checks} checks: explicit capture, offline binding, no fabricated history, restore, legacy upgrades, no version/time downgrade, immutable policy links).`);
