import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const section = (first, last) => {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert(start >= 0 && end > start);
  return source.slice(start, end);
};
const node = { style: {}, classList: { add(){}, remove(){}, toggle(){} } };
let stored;
const context = {
  document: { getElementById: () => node, querySelectorAll: () => [] },
  setTimeout: () => {}, resetWeekCards(){}, coParentPoss: () => "Co-parent's",
  KIDS: ['Alex', 'Sam'], easyOpts: [], BACKFILL_DATE: null,
  captureEntryInputs(){}, needsDeviationDocumentationPrompt: () => false,
  getEntries: () => ({}), isLockedEntry: () => false, todayStr: () => '2026-10-13',
  putEntries: entries => { stored = entries['2026-10-13']; }, showSavedEntry(){}
};
vm.createContext(context);
vm.runInContext([
  section('function blankCheckinState(){', 'const CHECKIN_PHASES='),
  section('function resetCheckinBranch(){', '// DAD MODE'),
  section('function setDadMode(', 'function toggleMomHelpedKid('),
  section('function setMomMode(', 'function startHelpedLoop('),
  section('function setAllKids(', 'function toggleKid('),
  section('function saveEntry(', 'function captureEntryInputs(')
].join('\n'), context);

const attachment = { name: 'evidence.png', dataUrl: 'data:image/png;base64,AA==' };
function oldBranch(week, dadMode, momMode) {
  context.S = {
    ...context.blankCheckinState(), week, dadMode, momMode,
    kidsWithDad: ['Alex'], absentData: { Sam: { location: 'mom' } },
    helpedKids: ['Sam'], helpedData: { Sam: { acts: ['pickup'] } },
    dadHadKids: ['Alex'], momHadKidsOnDadWeek: ['Sam'],
    momHelpedOnDadWeek: { Alex: { acts: ['dinner'] } },
    changeAgreed: true, changePressured: true,
    changeContextNext: 'old', changeContextBack: 'old', diary: 'Keep my note', attachment
  };
}
function assertCleanSaved(week, dadMode, momMode) {
  context.saveEntry();
  assert.equal(stored.week, week);
  assert.equal(stored.dadMode, dadMode);
  assert.equal(stored.momMode, momMode);
  assert.equal(stored.changeAgreed, null);
  assert.equal(stored.changePressured, null);
  assert.equal(stored.diary, 'Keep my note');
  assert.equal(stored.attachment, attachment);
  for (const key of ['helpedKids', 'dadHadKids', 'momHadKidsOnDadWeek']) assert.equal(stored[key].length, 0, key);
  for (const key of ['absentData', 'helpedData', 'momHelpedOnDadWeek']) assert.equal(Object.keys(stored[key]).length, 0, key);
}

// Change the scheduled parent after answering a deviation, in both directions.
oldBranch('dad', 'mom-had', null);
context.setWeek('mom'); context.setMomMode('easy');
assertCleanSaved('mom', null, 'easy');
oldBranch('mom', null, 'dad-had');
context.setWeek('dad'); context.setDadMode('normal');
assertCleanSaved('dad', 'normal', null);

// Change actual custody within the same parent's scheduled day.
oldBranch('dad', 'mom-had', null); context.setDadMode('normal');
assertCleanSaved('dad', 'normal', null);
oldBranch('mom', null, 'dad-had'); context.setMomMode('easy');
assertCleanSaved('mom', null, 'easy');

// Reselecting the same answers keeps a loaded edit's existing details.
oldBranch('dad', 'normal', null);
const state = context.S;
context.setWeek('dad'); context.setDadMode('normal');
assert.equal(context.S, state);
assert.equal(context.S.diary, 'Keep my note');
// Returning from a split night to all kids home removes obsolete absent details.
context.setAllKids(true);
assert.equal(Object.keys(context.S.absentData).length, 0);
assert.equal(context.S.kidsWithDad.length, 2);
console.log('Check-in branch tests passed: changed schedule/custody clears stale answers, saves clean records, and retains notes/evidence and unchanged edits.');
