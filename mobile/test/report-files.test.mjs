import {test} from 'node:test';import assert from 'node:assert/strict';
import {reportFiles,checkedText,REPORT_LIMIT,CSV_LIMIT} from '../src/report-files.js';
function setup(){let identity='A:records:full:30',resolve;const calls=[],transport={async pdf(data){calls.push(['pdf',data]);return{uri:'file:///prepared.pdf'}},async csv(data){calls.push(['csv',data]);return{uri:'file:///prepared.csv'}},async save(...args){calls.push(['save',args]);return{saved:true}},async share(...args){calls.push(['share',args]);return{cancelled:true}},async copy(text){calls.push(['copy',text])}};return {calls,transport,files:reportFiles({current:()=>identity,transport}),change:value=>identity=value};}
const input={expected:'A:records:full:30',text:'Exact report 日本語\nNo missing end.',name:'whose-day-report-2000-01-01-full.pdf',scope:'account-A'};
test('PDF/CSV creation precedes an explicit save/share; content and cancellation propagate unchanged',async()=>{
 const {files,calls}=setup();assert.deepEqual(await files.pdf(input),{saved:true});assert.deepEqual(calls.map(c=>c[0]),['pdf','save']);assert.equal(calls[0][1].text,input.text);
 calls.length=0;assert.deepEqual(await files.csv({...input,share:true}),{cancelled:true});assert.deepEqual(calls.map(c=>c[0]),['csv','share']);
});
test('changed account, records, selection or range block stale exports before and after file preparation',async()=>{
 for(const identity of ['B:records:full:30','A:new-records:full:30','A:records:notes:30','A:records:full:60']){
  const {files,calls,change,transport}=setup();change(identity);await assert.rejects(files.pdf(input),/changed/);assert.equal(calls.length,0);
  change(input.expected);transport.pdf=async()=>{change(identity);return{uri:'file:///old-account.pdf'}};await assert.rejects(files.pdf(input),/changed/);assert.equal(calls.length,0);
 }
});
test('failed preparation, missing URI and destination failure never report successful delivery',async()=>{
 const {files,calls,transport}=setup();transport.pdf=async()=>{throw Error('disk full')};await assert.rejects(files.pdf(input),/disk full/);assert.equal(calls.length,0);
 transport.pdf=async()=>({});await assert.rejects(files.pdf(input),/could not/);assert.equal(calls.length,0);transport.pdf=async()=>({uri:'file:///new.pdf'});transport.save=async()=>{throw Error('provider failed')};await assert.rejects(files.pdf(input),/provider failed/);
});
test('copy uses the exact report and validates state before and after the clipboard operation',async()=>{
 const {files,calls,change,transport}=setup();await files.copy(input);assert.deepEqual(calls,[['copy',input.text]]);transport.copy=async()=>change('B');await assert.rejects(files.copy(input),/changed/);
});
test('UTF-8 byte limits reject oversized exports instead of truncating text or embedded image CSV',async()=>{
 assert.equal(checkedText('a'.repeat(REPORT_LIMIT),REPORT_LIMIT,'Report').length,REPORT_LIMIT);assert.throws(()=>checkedText('日'.repeat(Math.ceil(REPORT_LIMIT/3)),REPORT_LIMIT,'Report'),/too large/);assert.throws(()=>checkedText('',REPORT_LIMIT,'Report'),/empty/);
 const {files,calls}=setup();await assert.rejects(files.pdf({...input,text:'x'.repeat(REPORT_LIMIT+1)}),/too large/);await assert.rejects(files.csv({...input,text:'x'.repeat(CSV_LIMIT+1)}),/too large/);assert.equal(calls.length,0);
});
