import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const js = readFileSync(resolve(root, 'app.js'), 'utf8');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');

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
  's-review',
  's-cal',
  's-export',
  's-setup'
]) {
  assert(html.includes(`id="${id}"`), `Missing screen: ${id}`);
}

for (const cls of [
  '.checkin-decision-card',
  '.bottom-nav',
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

if (failures.length) {
  console.error(`Contract test failed with ${failures.length} issue${failures.length === 1 ? '' : 's'}:`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Contract test passed.');
