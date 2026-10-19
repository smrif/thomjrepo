import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const js = readFileSync(resolve(root, 'app.js'), 'utf8');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
const supabaseConfig = readFileSync(resolve(root, 'supabase-config.js'), 'utf8');
const supabaseClient = readFileSync(resolve(root, 'supabase-client.js'), 'utf8');

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function definedFunctionNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    names.add(match[1]);
  }
  return names;
}

function inlineHandlerNames(markup) {
  const names = new Set();
  for (const match of markup.matchAll(/\bon(?:click|change|input|submit)="([^"]+)"/g)) {
    const handler = match[1].trim();
    const call = handler.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (call) names.add(call[1]);
  }
  return names;
}

const functions = definedFunctionNames(js);
const handlers = inlineHandlerNames(html);
const missingHandlers = [...handlers].filter(name => !functions.has(name));

assert(missingHandlers.length === 0, `Missing JS functions referenced by inline handlers: ${missingHandlers.join(', ')}`);

for (const id of [
  's-home',
  's-week',
  's-dad-mode',
  's-mom-mode',
  's-absent',
  's-change-context',
  's-diary',
  's-cal',
  's-export',
  's-setup'
]) {
  assert(html.includes(`id="${id}"`), `Missing screen: ${id}`);
}

for (const cls of [
  '.checkin-decision-card',
  '.bottom-nav',
  '#s-setup.onboarding-mode .bottom-nav',
  '.cal-cell.dad-day',
  '.cal-cell.dad-day-mom-has',
  '.cal-cell.mom-day',
  '.cal-cell.mom-day-dad-has',
  '.context-badge',
  '.attach-section'
]) {
  assert(css.includes(cls), `Missing expected CSS selector: ${cls}`);
}

for (const fn of [
  'showSetup',
  'setOnboardingMode',
  'resetWeekCards',
  'showChangeContext',
  'setAgreed',
  'setPressure',
  'handleAttachment',
  'setReportFilter',
  'printReport'
]) {
  assert(functions.has(fn), `Missing expected function: ${fn}`);
}

assert(/styles\.css\?v=[^"]+/.test(html), 'Stylesheet is missing a cache-busting version token');
assert(/app\.js\?v=[^"]+/.test(html), 'Script is missing a cache-busting version token');
assert(/supabase-config\.js\?v=[^"]+/.test(html), 'Supabase config script is missing a cache-busting version token');
assert(/supabase-client\.js\?v=[^"]+/.test(html), 'Supabase client script is missing a cache-busting version token');
assert(supabaseConfig.includes('https://hdfuknggfkmaycnantxv.supabase.co'), 'Supabase project URL is missing from public config');
assert(supabaseConfig.includes('sb_publishable_'), 'Supabase publishable key is missing from public config');
assert(!/service_role|sb_secret_/i.test(supabaseConfig), 'Supabase public config must not include service-role or secret keys');
assert(supabaseClient.includes('WhoseDayBackend'), 'Supabase client helper should expose WhoseDayBackend');
assert(supabaseClient.includes("from('sync_devices')"), 'Supabase client should write sync device metadata');
assert(js.includes('reconcileLocalAndCloudRows'), 'App should reconcile cloud rows before uploading local entries');
assert(html.includes('cloud-sync-status-panel'), 'Settings should show cloud sync status');
assert(html.includes('cloud-conflict-panel'), 'Settings should include sync conflict review UI');
assert(functions.has('resolveCloudConflict'), 'App should expose a sync conflict resolver');
assert(html.includes('cloud-delete-panel'), 'Settings should include cloud data deletion UI');
assert(functions.has('deleteCloudAccount'), 'App should expose account deletion handler');
assert(supabaseClient.includes('deleteAccount'), 'Supabase client should expose account deletion helper');
assert(html.includes('s-ob-login'), 'Logged-out onboarding should include an existing-account login screen');
assert(functions.has('sendLoggedOutSignInLink'), 'App should send sign-in links from logged-out login');
assert(functions.has('restoreLoggedOutCloudAccount'), 'App should restore cloud account from logged-out login');

if (failures.length) {
  console.error(`Contract test failed with ${failures.length} issue${failures.length === 1 ? '' : 's'}:`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Contract test passed.');
