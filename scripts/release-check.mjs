import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

assert.equal(process.argv.length, 2, 'Release checks accept no live-project or credential arguments.');
const root = resolve(import.meta.dirname, '..');
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw new Error('Could not start a local release-check process.');
  if (result.status !== 0) process.exit(result.status || 1);
}

run(['scripts/build-static.mjs']);
const dist = resolve(root, 'dist');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [relative(dist, path).replaceAll('\\', '/')];
  });
}
const built = files(dist);
const rootFiles = new Set(['index.html', 'app.js', 'analytics.js', 'analytics-config.js', 'backup.js', 'supabase-config.js', 'supabase-client.js', 'styles.css', 'theme.css', 'terms.html', 'privacy.html', 'sw.js']);
assert(built.every(path => rootFiles.has(path) || path.startsWith('assets/') || path.startsWith('vendor/')), 'Unexpected file in production build.');
assert(!built.some(path => /(?:^|\/)(?:scripts|security-qa|\.git|\.dev\.vars)(?:\/|$)/.test(path)), 'Private QA/source files must not be bundled.');
const publicConfig = readFileSync(resolve(dist, 'supabase-config.js'), 'utf8');
assert(publicConfig.includes('sb_publishable_') && !/sb_secret_|SUPABASE_SECRET_KEY|service_role/i.test(publicConfig), 'Production config must contain only the public key.');
console.log(`Build boundary passed (${built.length} static files; no QA server or privileged config).`);

// Explicit local/mock suite: never auto-run sign-in email, live API, or deletion QA.
run(['--test', '--test-concurrency=1', ...[
  'contract-test', 'api-contract-test', 'analytics-test', 'analytics-ui-test', 'homepage-auth-test', 'auth-entry-test', 'checkin-branch-test',
  'account-deletion-test', 'account-deletion-ui-test', 'database-security-test',
  'automatic-sync-test', 'automatic-sync-ui-test', 'multi-device-sync-test',
  'signin-button-test', 'domain-migration-test', 'cloud-disclosures-test', 'date-filter-test',
  'backup-test', 'backup-ui-test', 'policy-acceptance-test', 'policy-acceptance-ui-test', 'trends-clarity-test', 'reports-clarity-test', 'settings-account-test', 'offline-shell-test', 'smoke-test'
].map(name => `scripts/${name}.mjs`), 'scripts/security-qa/checks-test.mjs', 'scripts/security-qa/ui-test.mjs']);
console.log('Local release checks passed. Owner QA and a hosted CI run remain separate evidence.');
