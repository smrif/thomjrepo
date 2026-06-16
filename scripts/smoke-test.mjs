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
    email: 'parent@example.com',
    children: ['Ava', 'Ben'],
    purpose: '',
    termsAccepted: true,
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

async function assertSettingsScreen(context) {
  await expectActive('s-setup');
  const settingsNavVisible = await page.locator('#s-setup .bottom-nav').isVisible();
  if (!settingsNavVisible) throw new Error(`${context}: Settings should show the bottom navigation for returning users.`);
  const settingsTermsVisible = await page.locator('#s-setup .setup-terms').isVisible();
  if (settingsTermsVisible) throw new Error(`${context}: Settings should not show onboarding terms acceptance.`);
  const settingsTitle = await page.locator('#s-setup .settings-title').innerText();
  if (settingsTitle.toLowerCase() !== 'settings') throw new Error(`${context}: Settings should use its own title, saw "${settingsTitle}".`);
  const fieldState = await page.evaluate(() => ({
    currentParent: document.getElementById('setup-current-parent')?.value || '',
    email: document.getElementById('setup-email')?.value || '',
    childCount: document.querySelectorAll('#s-setup .setup-child-input').length,
    childRows: document.querySelectorAll('#s-setup .settings-child-row-button').length,
    activityGroups: document.querySelectorAll('#s-setup #setup-activity-chips').length,
    childActivityGroups: document.querySelectorAll('#s-setup .activity-child-section').length,
    accountSection: document.querySelector('#s-setup .settings-section h2')?.textContent || '',
    activityLabel: document.querySelector('#setup-activities-container .settings-section-head p')?.textContent || '',
    activeActivityCount: document.querySelectorAll('#setup-activity-chips .activity-chip.active').length,
    activityListsMatch: JSON.stringify(getActivitiesForChild('Ava')) === JSON.stringify(getActivitiesForChild('Ben')),
    hasEmojiActivityLabels: [...document.querySelectorAll('#setup-activity-chips .activity-chip')].some(node => /[\u{1F300}-\u{1FAFF}]/u.test(node.innerText))
  }));
  if (fieldState.currentParent !== 'Dad') throw new Error(`${context}: Settings did not populate the current parent field. Saw ${JSON.stringify(fieldState)}.`);
  if (fieldState.email !== 'parent@example.com') throw new Error(`${context}: Settings did not populate the email field. Saw ${JSON.stringify(fieldState)}.`);
  if (fieldState.childCount !== 2) throw new Error(`${context}: Settings should render saved children. Saw ${JSON.stringify(fieldState)}.`);
  if (fieldState.childRows !== 2) throw new Error(`${context}: Settings should render children as clean rows. Saw ${JSON.stringify(fieldState)}.`);
  if (fieldState.activityGroups !== 1 || fieldState.childActivityGroups !== 0) {
    throw new Error(`${context}: Settings should render one shared activity group, not per-child groups. Saw ${JSON.stringify(fieldState)}.`);
  }
  assertIncludes(fieldState.activityLabel, 'apply to every child', `${context}: Shared activity label`);
  if (fieldState.activeActivityCount === 0) throw new Error(`${context}: Shared activities should have default active options. Saw ${JSON.stringify(fieldState)}.`);
  if (!fieldState.activityListsMatch) throw new Error(`${context}: Activity changes should apply to every child. Saw ${JSON.stringify(fieldState)}.`);
  if (fieldState.hasEmojiActivityLabels) throw new Error(`${context}: Activity labels should not use emoji. Saw ${JSON.stringify(fieldState)}.`);
}

try {
  await page.goto(baseUrl);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await expectActive('s-ob-welcome');
  const firstRunNavCount = await page.locator('#s-ob-welcome .bottom-nav').count();
  if (firstRunNavCount !== 0) throw new Error('First-run onboarding should not show the bottom navigation.');
  await click('#s-ob-welcome .ob-btn-primary');
  await expectActive('s-ob-promises');
  const finalPromise = await page.evaluate(() => {
    const card = document.querySelector('#s-ob-promises .ob-promise-cards .ob-promise:last-child');
    return {
      title: card?.querySelector('strong')?.textContent || '',
      body: card?.querySelector('p')?.textContent || '',
      hasSvgIcon: !!card?.querySelector('svg')
    };
  });
  if (finalPromise.title !== 'Lawyer-ready records') throw new Error(`Final onboarding promise title is wrong: ${JSON.stringify(finalPromise)}.`);
  if (finalPromise.body !== 'Timestamped summaries are organized so they’re easy to review, export, or share when needed.') throw new Error(`Final onboarding promise body is wrong: ${JSON.stringify(finalPromise)}.`);
  if (!finalPromise.hasSvgIcon) throw new Error(`Final onboarding promise should use a professional line icon: ${JSON.stringify(finalPromise)}.`);
  await click('#s-ob-promises .ob-btn-primary');
  await expectActive('s-ob-name');
  if (await page.locator('#s-ob-name .ob-examples').count() !== 0) throw new Error('Step 1 should not show role shortcut chips.');
  if (await page.locator('#s-ob-name .ob-label').innerText() !== 'Your name') throw new Error('Step 1 should label the name field clearly.');
  if (await page.locator('#ob-name').getAttribute('placeholder') !== 'Enter your name') throw new Error('Step 1 should use the simplified name placeholder.');
  await page.locator('#ob-name').fill('   ');
  await click('#btn-ob-name');
  await expectActive('s-ob-name');
  await page.locator('#ob-name').fill('Ryan');
  await click('#btn-ob-name');
  await expectActive('s-ob-coparent');
  if (await page.locator('#s-ob-coparent .ob-examples').count() !== 0) throw new Error('Step 2 should not show parent shortcut chips.');
  if (await page.locator('#s-ob-coparent .ob-q').innerText() !== 'What should we call the other parent?') throw new Error('Step 2 heading should ask about the other parent label.');
  if (await page.locator('#s-ob-coparent .ob-label').innerText() !== 'Other parent name or label') throw new Error('Step 2 should label the co-parent field clearly.');
  if (await page.locator('#ob-coparent').getAttribute('placeholder') !== 'e.g. Kelly, Mom, Dad, Co-parent') throw new Error('Step 2 placeholder should give neutral examples.');
  await page.locator('#ob-coparent').fill('Laura');
  await click('#s-ob-coparent .ob-btn-primary');
  await expectActive('s-ob-kids');
  if (await page.locator('#s-ob-kids .ob-q').innerText() !== 'What are your kids’ first names?') throw new Error('Step 4 heading should explicitly ask for kids’ first names.');
  if (await page.locator('#s-ob-kids .ob-sub').innerText() !== 'First names only — just enough to make the app feel personal.') throw new Error('Step 4 supporting text should clarify first names only.');
  if (await page.locator('#s-ob-kids .ob-label').innerText() !== 'Child’s first name') throw new Error('Step 4 should label child fields clearly.');
  if (await page.locator('#s-ob-kids .ob-kid-input').count() !== 1) throw new Error('Step 4 should show one child field by default.');
  if (await page.locator('#s-ob-kids .ob-kid-input').first().getAttribute('placeholder') !== 'Child’s first name') throw new Error('Step 4 child input should use the first-name placeholder.');
  await click('#s-ob-kids .ob-add-child');
  if (await page.locator('#s-ob-kids .ob-kid-input').count() !== 2) throw new Error('Step 4 should allow adding another child field.');
  await page.locator('#s-ob-kids .ob-kid-input').first().fill('Ava');
  await click('#btn-ob-kids');
  await expectActive('s-ob-finish');
  await click('#btn-ob-finish');
  if (!await page.locator('#ob-finish-error').isVisible()) throw new Error('Invalid onboarding finish should show the error banner.');
  await page.locator('#ob-email').fill('ryan@example.com');
  await page.locator('#ob-terms').check();
  await click('#btn-ob-finish');
  await expectActive('s-home');

  await bootstrap();

  await click('#s-home .bottom-nav-item[onclick="showSetup()"]');
  await assertSettingsScreen('Home Settings tab');
  await click(`#s-setup.screen.active .bottom-nav-item[onclick="show('s-home')"]`);
  await expectActive('s-home');

  await click('#s-home .bottom-nav-item[onclick="showExport()"]');
  await expectActive('s-export');
  await click('#s-export .bottom-nav-item[onclick="showSetup()"]');
  await assertSettingsScreen('Reports Settings tab');
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
  const selectedAfterYesterday = await page.evaluate(({ todayDs, yesterdayDs }) => {
    const todayCell = document.querySelector(`[data-date="${todayDs}"]`);
    const yesterdayCell = document.querySelector(`[data-date="${yesterdayDs}"]`);
    return {
      selectedCalDate,
      yesterdayVisible: !!yesterdayCell,
      todaySelected: todayCell?.classList.contains('selected') || false,
      yesterdaySelected: yesterdayCell?.classList.contains('selected') || false
    };
  }, { todayDs: dateString(0), yesterdayDs: dateString(-1) });
  if (selectedAfterYesterday.selectedCalDate !== dateString(-1) || selectedAfterYesterday.todaySelected || (selectedAfterYesterday.yesterdayVisible && !selectedAfterYesterday.yesterdaySelected)) {
    throw new Error(`Calendar selected state should move to yesterday. Saw ${JSON.stringify(selectedAfterYesterday)}.`);
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
  await page.evaluate(ds => {
    const entries = getEntries();
    entries[ds].attachment = {
      name: 'context.png',
      type: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
    };
    putEntries(entries);
  }, dateString(0));
  await page.evaluate(ds => showDetail(ds, getEntries()[ds]), dateString(0));
  const calendarDetailText = await page.locator('#cal-detail').innerText();
  assertIncludes(calendarDetailText, "Kids at Laura's", 'Calendar detail label copy');
  assertIncludes(calendarDetailText, "At Laura's", 'Calendar detail label copy');
  assertIncludes(calendarDetailText, 'Logged:', 'Calendar detail metadata');
  assertIncludes(calendarDetailText, 'Agreed in advance', 'Calendar detail metadata');
  assertIncludes(calendarDetailText, 'No pressure noted', 'Calendar detail metadata');
  assertExcludes(calendarDetailText, "Mom's", 'Calendar detail label copy');
  const calendarAttachmentCount = await page.locator('#cal-detail .entry-attachment-full img').count();
  if (calendarAttachmentCount !== 1) throw new Error(`Calendar detail should show one full attachment image, saw ${calendarAttachmentCount}.`);

  await page.evaluate(() => switchTab('trends'));
  const trendsText = await page.locator('#tc-trends').innerText();
  assertIncludes(trendsText, "Days Ryan had kids", 'Calendar trends label copy');
  assertIncludes(trendsText, "Your nights", 'Calendar trends label copy');
  assertIncludes(trendsText, "Laura's", 'Calendar trends label copy');
  assertExcludes(trendsText, "Dad", 'Calendar trends label copy');
  assertExcludes(trendsText, "Mom", 'Calendar trends label copy');

  await click('#s-cal .bottom-nav-item[onclick="showExport()"]');
  await expectActive('s-export');
  const reportStatsText = await page.locator('#reports-stats-bar').innerText();
  assertIncludes(reportStatsText, '1', 'Report stats should include screenshot count');
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
  assertIncludes(reportPreviewText, 'CHANGE AGREED IN ADVANCE: Yes', 'Report preview metadata');
  assertIncludes(reportPreviewText, 'FELT PRESSURED: No', 'Report preview metadata');
  assertIncludes(reportPreviewText, 'ATTACHMENT: Screenshot attached in app', 'Report preview metadata');
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
  await page.locator('.setup-child-input').evaluateAll((inputs, names) => {
    inputs.forEach((input, idx) => { input.value = names[idx] || ''; });
  }, ['Ava Penelope Montgomery-Sanderson', 'Benjamin Theodore Worthington-Harrington']);
  await click('#s-setup .setup-add-child');
  await page.locator('#child-modal-input').fill('Supercalifragilisticexpialidocious Junior');
  await click('#child-modal .child-modal-save');
  await page.evaluate(names => {
    document.querySelectorAll('.setup-child-input').forEach((input, idx) => {
      input.value = names[idx] || input.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, ['Ava Penelope Montgomery-Sanderson', 'Benjamin Theodore Worthington-Harrington', 'Supercalifragilisticexpialidocious Junior']);
  const longChildRows = await page.locator('#s-setup .settings-child-row-button').count();
  if (longChildRows !== 3) throw new Error(`Settings should show three child rows after adding a child, saw ${longChildRows}.`);
  await assertNoHorizontalOverflow('Settings with long labels');
  await click('#s-setup button[onclick="saveSetup()"]');
  await expectActive('s-home');

  await click('#s-home .bottom-nav-item[onclick="showCal()"]');
  await expectActive('s-cal');
  const longLegendText = await page.locator('#tc-cal .legend').innerText();
  assertIncludes(longLegendText, 'You', 'Compact calendar legend');
  assertIncludes(longLegendText, 'Co-parent', 'Compact calendar legend');
  assertIncludes(longLegendText, 'Changed', 'Compact calendar legend');
  assertIncludes(longLegendText, 'Special', 'Compact calendar legend');
  assertExcludes(longLegendText, longCurrentParent, 'Compact calendar legend');
  assertExcludes(longLegendText, longCoParent, 'Compact calendar legend');
  assertExcludes(longLegendText, "L's", 'Long-label calendar legend');
  const legendColumnCount = await page.locator('#tc-cal .legend').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  if (legendColumnCount !== 4) throw new Error(`Calendar legend should render as four columns, saw ${legendColumnCount}.`);
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
