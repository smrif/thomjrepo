import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../app.js',import.meta.url),'utf8');
const save=source.slice(source.indexOf('function saveEntry('),source.indexOf('function captureEntryInputs('));
function harness(){
  let entries={},logged=0,errors=0,retry,write=async next=>{entries=structuredClone(next)};
  const state={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Alex'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'unsaved note',attachment:null,changeAgreed:null,changePressured:null};
  const busy=[];const context={S:state,BACKFILL_DATE:'2026-10-21',captureEntryInputs(){},needsDeviationDocumentationPrompt:()=>false,getEntries:()=>structuredClone(entries),isLockedEntry:()=>false,todayStr:()=> '2026-10-22',loggedEntryCount:()=>0,putEntries:next=>write(next),showSavedEntry:()=>logged++,trackUsage(){},trackFailure(){},window:{WhoseDayPlatform:{saving:v=>busy.push(v),saveError:(_e,fn)=>{errors++;retry=fn}}}};
  vm.createContext(context);vm.runInContext(save,context);
  return {context,busy,get logged(){return logged},get errors(){return errors},get entries(){return entries},set write(fn){write=fn},retry:()=>retry()};
}
test('product Saved screen waits for commit; duplicate taps share one save',async()=>{
  const h=harness();let resolve,calls=0;h.write=async next=>{calls++;await new Promise(r=>{resolve=()=>{h.write=async()=>{};r()}});h.context.getEntries=()=>next};
  const pending=h.context.saveEntry();assert.equal(h.context.saveEntry(),pending);assert.equal(h.logged,0);assert.equal(h.context.BACKFILL_DATE,'2026-10-21');resolve();await pending;
  assert.equal(calls,1);assert.equal(h.logged,1);assert.equal(h.context.BACKFILL_DATE,null);assert.deepEqual(h.busy,[true,false]);
});
test('failure retains answers and backfill date; retry saves the intended day',async()=>{
  const h=harness();h.write=async()=>{throw new Error('disk full')};await h.context.saveEntry();assert.equal(h.logged,0);assert.equal(h.errors,1);assert.equal(h.context.BACKFILL_DATE,'2026-10-21');assert.equal(h.context.S.diary,'unsaved note');
  h.write=async next=>{h.context.getEntries=()=>next};await h.retry();assert.equal(h.logged,1);assert.equal(h.context.getEntries()['2026-10-21'].diary,'unsaved note');
});
test('a resolved but unverified write cannot show the Saved screen',async()=>{
  const h=harness();h.write=async()=>{};await h.context.saveEntry();assert.equal(h.logged,0);assert.equal(h.errors,1);
});
