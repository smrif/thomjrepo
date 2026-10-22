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
const nodes=new Map();
const getNode=id=>{if(!nodes.has(id))nodes.set(id,{...node,value:'',textContent:''});return nodes.get(id)};
const context = {
  window:{},trackUsage(){},trackFailure(){},alert:message=>assert.fail(message),loggedEntryCount:()=>0,
  document: { getElementById: getNode, querySelectorAll: () => [] },
  coParent:()=> 'Co-parent',setProg(){},show(id){context.active=id},
  goToDiary(origin){context.diaryOrigin=origin;context.active='s-diary'},prepareEditTarget(){},
  setTimeout: () => {}, resetWeekCards(){}, coParentPoss: () => "Co-parent's",
  KIDS: ['Alex', 'Sam'], easyOpts: [], BACKFILL_DATE: null,
  captureEntryInputs(){}, needsDeviationDocumentationPrompt: () => false,
  getEntries: () => stored?{'2026-10-13':stored}:{}, isLockedEntry: () => false, todayStr: () => '2026-10-13',
  putEntries: entries => { stored = entries['2026-10-13']; }, showSavedEntry(){}
};
vm.createContext(context);
vm.runInContext([
  section('function blankCheckinState(){', 'const CHECKIN_PHASES='),
  section('function resetCheckinBranch(){', '// DAD MODE'),
  section('function setDadMode(', 'function toggleMomHelpedKid('),
  section('function sharedHelpDetails(', 'function toggleDadWkMomKid('),
  section('function setMomMode(', 'function toggleDadHadKid('),
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

// Both help branches collect one answer and advance directly to the diary.
for(const theirs of [true,false]){
  context.S={...context.blankCheckinState(),week:theirs?'mom':'dad',momMode:theirs?'helped':null,dadMode:theirs?null:'dad-helped-mom',helpedKids:theirs?['Alex','Sam']:[],kidsWithDad:theirs?[]:['Alex','Sam'],momHadKidsOnDadWeek:theirs?[]:['Alex','Sam']};
  const start=theirs?'startHelpedLoop':'startMomHelpedLoop',toggle=theirs?'toggleAct':'toggleMomAct',next=theirs?'nextHelpedKid':'nextMomHelpedKid',field=theirs?'helpedData':'momHelpedOnDadWeek',prefix=theirs?'helped':'mha';
  context[start]();assert.equal(getNode(prefix+'-step-lbl').textContent,'All children');
  context[toggle](node,'school');getNode(prefix+'-note').value='One pickup for everyone';
  context[next]();assert.equal(context.active,'s-diary');
  assert.deepEqual(JSON.parse(JSON.stringify(context.S[field])),{Alex:{acts:['school'],note:'One pickup for everyone'},Sam:{acts:['school'],note:'One pickup for everyone'}});
  context[start]();assert.equal(getNode(prefix+'-note').value,'One pickup for everyone');
  assert.equal(context.helpDetailGroups(context.S[field]).length,1);
}
// Opening/continuing historical differing answers must not rewrite them.
const legacy={Alex:{acts:['school'],note:'Pickup'},Sam:{acts:['medical'],note:'Appointment'}};
const details=context.sharedHelpDetails(legacy,['Alex','Sam']);
assert.equal(context.applySharedHelp(legacy,['Alex','Sam'],details),legacy);
assert.equal(context.helpDetailGroups(legacy).length,2);
assert.equal(context.helpDetailGroups({Alex:{acts:['school','medical'],note:'Same'},Sam:{acts:['medical','school'],note:'Same'}}).length,1);
console.log('Shared help regressions passed: both directions advance once, save all children, restore answers and preserve historical child-specific details.');
