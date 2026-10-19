import { cpSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const file of ['index.html', 'app.js', 'supabase-config.js', 'supabase-client.js', 'styles.css', 'theme.css', 'terms.html', 'privacy.html']) {
  cpSync(join(root, file), join(outDir, file));
}

cpSync(join(root, 'assets'), join(outDir, 'assets'), { recursive: true });

mkdirSync(join(outDir, 'vendor'), { recursive: true });
cpSync(join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), join(outDir, 'vendor/supabase.js'));
cpSync(join(root, 'node_modules/@supabase/supabase-js/LICENSE'), join(outDir, 'vendor/supabase-LICENSE.txt'));

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
const files = listFiles(outDir).sort();
const workerTemplate = readFileSync(join(root, 'src/service-worker.js'), 'utf8');
const hash = createHash('sha256').update(workerTemplate);
for (const file of files) hash.update(relative(outDir, file)).update(readFileSync(file));
const version = hash.digest('hex').slice(0, 16);
const urls = files.map(file => '/' + relative(outDir, file).split('\\').join('/'));
writeFileSync(join(outDir, 'sw.js'), workerTemplate
  .replace('__BUILD_VERSION__', version)
  .replace('/* __SHELL_URLS__ */ []', JSON.stringify(urls)));

console.log('Static site built to dist/');
