import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css', 'terms.html', 'privacy.html']) {
  cpSync(join(root, file), join(outDir, file));
}

cpSync(join(root, 'assets'), join(outDir, 'assets'), { recursive: true });

console.log('Static site built to dist/');
