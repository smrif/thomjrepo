import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, normalize, resolve } from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    const bundledPlaywright = '/Users/ryanrifkin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
    ({ chromium } = await import(pathToFileURL(bundledPlaywright).href));
  } catch {
    console.error('Playwright is not installed. Run `npm install` once, then retry `npm run test:smoke`.');
    process.exit(1);
  }
}

const root = resolve(import.meta.dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png'
};

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const requested = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = resolve(root, `.${requested}`);

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push(err.message));

async function expectActive(id) {
  await page.waitForFunction(expected => document.querySelector('.screen.active')?.id === expected, id);
}

async function click(selector) {
  await page.locator(selector).click();
}

async function bootstrap(config = {}) {
  const appConfig = {
    currentParentLabel: 'Dad',
    coParentLabel: 'Mom',
    children: ['Ava', 'Ben'],
    scheduleType: 'alternating-weeks',
    reminderPreference: 'none',
    ...config
  };

  await page.goto(baseUrl);
  await page.evaluate(configValue => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('custody_tracker_config', JSON.stringify(configValue));
  }, appConfig);
  await page.reload();
  await expectActive('s-home');
}

function dateString(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function assertIncludes(text, expected, context) {
  if (!text.includes(expected)) {
    throw new Error(`${context} should include "${expected}". Actual text:\n${text}`);
  }
}

function assertIncludesText(text, expected, context) {
  if (!text.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`${context} should include "${expected}". Actual text:\n${text}`);
  }
}

function assertExcludes(text, unexpected, context) {
  if (text.includes(unexpected)) {
    throw new Error(`${context} should not include "${unexpected}". Actual text:\n${text}`);
  }
}

async function assertNoHorizontalOverflow(context) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth
  }));
  const scrollWidth = Math.max(metrics.bodyScrollWidth, metrics.docScrollWidth);
  const clientWidth = Math.max(metrics.bodyClientWidth, metrics.docClientWidth);
  if (scrollWidth > clientWidth + 2) {
    throw new Error(`${context} has horizontal overflow: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`);
  }
}

try {
  await bootstrap();

  await click('#s-home .bottom-nav-item[onclick="showSetup()"]');
  await expectActive('s-setup');
  await click(`#s-setup.screen.active .bottom-nav-item[onclick="show('s-home')"]`);
  await expectActive('s-home');

  await click('#s-home .home-primary');
  await expectActive('s-week');
  const weekClasses = await page.locator('#s-week .checkin-decision-card').evaluateAll(nodes => nodes.map(n => n.className));
  if (!weekClasses.every(cls => cls.includes('checkin-decision-card'))) {
    throw new Error(`Week cards lost decision-card styling: ${weekClasses.join(' | ')}`);
  }

  await click('#wk-dad');
  await expectActive('s-dad-mode');
  await click('#sc-dad-normal');
  await expectActive('s-allkids');
  await click('#ak-no');
  await expectActive('s-whichkids');
  await click('#kb-Ben');
  await click('#s-whichkids button[onclick="startAbsentLoop()"]');
  await expectActive('s-absent');
  const absentSelected = await page.locator('#absent-opts .opt.sel').count();
  const absentNextDisabled = await page.locator('#absent-next-btn').isDisabled();
  if (absentSelected !== 0 || !absentNextDisabled) {
    throw new Error('Absent-kid location screen should start with no selected option and disabled Continue.');
  }

  await bootstrap();
  await click('#s-home .home-primary');
  await click('#wk-mom');
  await expectActive('s-mom-mode');
  await click('#ft-easy');
  await expectActive('s-mom-easy');
  await click('#s-mom-easy .opt[onclick*="brief"]');
  if (await page.locator('#easy-review-btn').isDisabled()) {
    throw new Error('Brief visit should enable Review & save.');
  }

  await bootstrap();
  await click('#s-home .home-primary');
  await click('#wk-mom');
  await expectActive('s-mom-mode');
  await click('#ft-dad');
  await expectActive('s-mom-dad-had');
  await click('#dh-allThree');
  await click('#dad-had-next');
  await expectActive('s-change-context');
  await click('#agreed-no');
  if (await page.locator('#change-context-next').isDisabled()) {
    throw new Error('Unexpected schedule changes should be able to continue without pressure answer.');
  }

  await bootstrap();
  await click('#s-home .bottom-nav-item[onclick="showExport()"]');
  await expectActive('s-export');
  await click('#pill-30');
  const pillActive = await page.locator('#pill-30').evaluate(node => node.classList.contains('active'));
  if (!pillActive) throw new Error('30-day report filter did not become active.');
  await click('#exp-honest');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('export-preview-section')).display !== 'none');

  await bootstrap();
  await click('#s-home .bottom-nav-item[onclick="showCal()"]');
  await expectActive('s-cal');
  await page.evaluate(ds => showEmptyDetail(ds), dateString(-1));
  const yesterdayDetail = await page.locator('#cal-detail').innerText();
  if (!yesterdayDetail.includes('Nothing logged') || !yesterdayDetail.includes('Log yesterday')) {
    throw new Error('Yesterday with no entry should show Nothing logged and allow one-day backfill.');
  }
  await page.evaluate(ds => showEmptyDetail(ds), dateString(-2));
  const olderDetail = await page.locator('#cal-detail').innerText();
  if (!olderDetail.includes('Nothing logged') || olderDetail.includes('Log yesterday')) {
    throw new Error('Older empty days should only show Nothing logged with no backfill action.');
  }

  await bootstrap({
    currentParentLabel: 'Ryan',
    coParentLabel: 'Laura',
    children: ['Ava', 'Ben']
  });
  await click('#s-home .home-primary');
  await click('#wk-dad');
  await expectActive('s-dad-mode');
  await click('#sc-dad-momhad');
  await expectActive('s-dad-wk-mom-had');
  await click('#dwm-Ava');
  await click('#dwm-next');
  await expectActive('s-change-context');
  await click('#agreed-yes');
  await click('#pressure-no');
  await click('#change-context-next');
  await expectActive('s-diary');
  await page.locator('#diary-input').fill('Custom label smoke note.');
  await click('#diary-next-btn');
  await expectActive('s-review');
  const reviewText = await page.locator('#review-content').innerText();
  assertIncludes(reviewText, "Ryan's scheduled day", 'Review label copy');
  assertIncludes(reviewText, "Kids ended up at Laura's", 'Review label copy');
  assertIncludesText(reviewText, "Kids at Laura's", 'Review label copy');
  assertExcludes(reviewText, "Mom's", 'Review label copy');
  assertExcludes(reviewText, "Dad's", 'Review label copy');

  await click('#s-review button[onclick="saveEntry()"]');
  await expectActive('s-saved');
  const savedText = await page.locator('#saved-summary').innerText();
  assertIncludes(savedText, "Kids at Laura's", 'Saved summary label copy');
  assertExcludes(savedText, "Mom's", 'Saved summary label copy');

  await click('#s-saved .bottom-nav-item[onclick="showCal()"]');
  await expectActive('s-cal');
  await page.evaluate(ds => showDetail(ds, getEntries()[ds]), dateString(0));
  const calendarDetailText = await page.locator('#cal-detail').innerText();
  assertIncludes(calendarDetailText, "Kids at Laura's", 'Calendar detail label copy');
  assertIncludes(calendarDetailText, "At Laura's", 'Calendar detail label copy');
  assertExcludes(calendarDetailText, "Mom's", 'Calendar detail label copy');

  await page.evaluate(() => switchTab('trends'));
  const trendsText = await page.locator('#tc-trends').innerText();
  assertIncludes(trendsText, "Days Ryan actually had kids", 'Calendar trends label copy');
  assertIncludes(trendsText, "Ryan's week", 'Calendar trends label copy');
  assertIncludes(trendsText, "Laura's", 'Calendar trends label copy');
  assertExcludes(trendsText, "Dad", 'Calendar trends label copy');
  assertExcludes(trendsText, "Mom", 'Calendar trends label copy');

  await click('#s-cal .bottom-nav-item[onclick="showExport()"]');
  await expectActive('s-export');
  const reportListText = await page.locator('.report-list').innerText();
  assertIncludes(reportListText, "Ryan's actual time with kids", 'Report list label copy');
  assertIncludes(reportListText, "Laura's day", 'Report list label copy');
  assertExcludes(reportListText, "Dad", 'Report list label copy');
  assertExcludes(reportListText, "Mom", 'Report list label copy');
  await click('#exp-honest');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('export-preview-section')).display !== 'none');
  const reportPreviewText = await page.locator('#preview-box').innerText();
  assertIncludes(reportPreviewText, "RYAN'S WEEK", 'Report preview label copy');
  assertIncludes(reportPreviewText, 'AT LAURA', 'Report preview label copy');
  assertExcludes(reportPreviewText, "DAD", 'Report preview label copy');
  assertExcludes(reportPreviewText, "MOM", 'Report preview label copy');

  const longCurrentParent = 'Ryan Jonathan Montgomery-Sanderson-Custody Coordinator';
  const longCoParent = 'Laura Elizabeth Worthington-Harrington the Third';
  await bootstrap({
    currentParentLabel: 'R',
    coParentLabel: 'L',
    children: ['Ava', 'Ben']
  });
  await click('#s-home .bottom-nav-item[onclick="showSetup()"]');
  await expectActive('s-setup');
  await page.locator('#setup-current-parent').fill(longCurrentParent);
  await page.locator('#setup-co-parent').fill(longCoParent);
  await page.locator('#setup-children').fill('Ava Penelope Montgomery-Sanderson, Benjamin Theodore Worthington-Harrington, Supercalifragilisticexpialidocious Junior');
  await click('#s-setup button[onclick="saveSetup()"]');
  await expectActive('s-home');

  await click('#s-home .bottom-nav-item[onclick="showCal()"]');
  await expectActive('s-cal');
  const longLegendText = await page.locator('.legend').innerText();
  assertIncludes(longLegendText, `${longCoParent}'s day`, 'Long-label calendar legend');
  assertIncludes(longLegendText, `kids at ${longCoParent}'s`, 'Long-label calendar legend');
  assertExcludes(longLegendText, "L's", 'Long-label calendar legend');
  await assertNoHorizontalOverflow('Calendar with long labels');

  await click('#s-cal .bottom-nav-item[onclick="showExport()"]');
  await expectActive('s-export');
  const longReportListText = await page.locator('.report-list').innerText();
  assertIncludes(longReportListText, `${longCurrentParent}'s actual time with kids`, 'Long-label report list');
  assertIncludes(longReportListText, `${longCoParent}'s day`, 'Long-label report list');
  assertExcludes(longReportListText, "L's", 'Long-label report list');
  await assertNoHorizontalOverflow('Reports with long labels');

  await click(`#s-export .bottom-nav-item[onclick="show('s-home')"]`);
  await expectActive('s-home');
  await click('#s-home .home-primary');
  await click('#wk-dad');
  await expectActive('s-dad-mode');
  await click('#sc-dad-momhad');
  await expectActive('s-dad-wk-mom-had');
  const longKidGridText = await page.locator('#s-dad-wk-mom-had').innerText();
  assertIncludes(longKidGridText, 'Supercalifragilisticexpialidocious Junior', 'Long child-name grid');
  assertIncludes(longKidGridText, longCoParent, 'Long child-name grid');
  await assertNoHorizontalOverflow('Kid grid with long names');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
  }

  console.log('Browser smoke test passed.');
} finally {
  await browser.close();
  server.close();
}
