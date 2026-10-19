import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

if (!process.argv.includes('--timezone-case')) {
  for (const timezone of ['America/Los_Angeles', 'Pacific/Kiritimati', 'America/New_York', 'UTC']) {
    const result = spawnSync(process.execPath, [import.meta.filename, '--timezone-case'], {
      env: { ...process.env, TZ: timezone }, encoding: 'utf8'
    });
    assert.equal(result.status, 0, `${timezone}: ${result.stderr || result.stdout}`);
  }
  console.log('Date filters passed: shared Reports/Trends boundaries, midnight/noon, DST, leap day, year rollover, and four timezones.');
} else {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const slice = (start, end) => {
    const first = source.indexOf(start), last = source.indexOf(end, first);
    assert(first >= 0 && last > first, `Missing source section: ${start}`);
    return source.slice(first, last);
  };
  const functions = [
    slice('function filterRecentEntryDates(', 'function trendsFilterLabel('),
    slice('function reportEntries(){', 'function renderReportsStats(')
  ].join('\n');
  // Fixed local clock; constructor arguments retain normal calendar/DST behavior.
  for (const [year, month, day, first30, before30] of [
    [2026, 9, 13, '2026-09-14', '2026-09-13'],
    [2026, 2, 9, '2026-02-08', '2026-02-07'],
    [2026, 10, 2, '2026-10-04', '2026-10-03'],
    [2026, 0, 1, '2025-12-03', '2025-12-02'],
    [2024, 2, 1, '2024-02-01', '2024-01-31']
  ]) {
    for (const hour of [0, 12, 23]) {
      const now = new Date(year, month, day, hour, 59, 59);
      const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const today = key(now);
      const tomorrow = new Date(year, month, day+1);
      const entries = Object.fromEntries([before30, first30, today, key(tomorrow)].map(ds => [ds, { diary: ds }]));
      const context = {
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } },
        pad: value => String(value).padStart(2,'0'), getEntries: () => entries,
        trendsFilter: '30', trendsM: month, trendsY: year, REPORT_FILTER: '30'
      };
      vm.createContext(context);
      vm.runInContext(functions, context);
      const dates = rows => Array.from(rows, ([ds]) => ds).sort();
      assert.deepEqual(dates(context.getTrendsEntries()), [first30, today]);
      assert.deepEqual(dates(context.reportEntries()), [first30, today]);
      assert.deepEqual(dates(context.filterRecentEntryDates(Object.entries(entries), 1)), [today]);
      // Ninety days includes exactly ninety calendar dates even across DST.
      const ninety = Array.from({ length: 92 }, (_, i) => [key(new Date(year, month, day-i)), {}]);
      assert.equal(context.filterRecentEntryDates(ninety, 90).length, 90);
      context.REPORT_FILTER = 'all'; context.trendsFilter = 'all';
      assert.equal(context.reportEntries().length, 4);
      assert.equal(context.getTrendsEntries().length, 4);
      context.trendsFilter = 'month';
      assert.deepEqual(dates(context.getTrendsEntries()), Object.keys(entries).filter(ds => ds.startsWith(today.slice(0,7))).sort());
    }
  }
}
