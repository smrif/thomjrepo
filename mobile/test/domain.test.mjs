import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRepository,validateRecord,callbackCode,reportText} from '../src/domain.js';
import {createAuth} from '../src/auth.js';
const record={schema:1,day:'2026-10-21',week:'dad',diary:'Synthetic only',attachment:null,loggedAt:'2026-10-21T19:00:00Z'};
test('only acknowledge a verified durable write and preserve failures',async()=>{
  const rows=new Map();let committed=false;
  const repo=createRepository({async write({key,value}){await new Promise(r=>setTimeout(r,5));rows.set(key,value);committed=true},async read({key}){return {value:rows.get(key)||null}}});
  assert.equal(await repo.load(record.day),null);const promise=repo.save(record);assert.equal(committed,false);assert.deepEqual(await promise,record);assert.deepEqual(await repo.load(record.day),record);
  await assert.rejects(createRepository({write:async()=>{throw new Error('disk full')}}).save(record),/disk full/);
  await assert.rejects(createRepository({write:async()=>{},read:async()=>({value:null})}).save(record),/verified/);
});
test('records reject oversized or executable attachments and impossible dates',()=>{
  for(const change of [{day:'2026-02-30'},{week:'other'},{diary:'a'.repeat(4001)},{attachment:'data:text/html;base64,PHNjcmlwdD4='},{attachment:'data:image/jpeg;base64,'+'A'.repeat(4*1024*1024)}])assert.throws(()=>validateRecord({...record,...change}));
  assert.match(reportText(record),/Synthetic records only/);
});
test('callback accepts only the exact app route with a single code',()=>{
  assert.equal(callbackCode('whoseday-feasibility://auth/callback?code=abcdefgh-1234'),'abcdefgh-1234');
  for(const url of ['https://auth/callback?code=abcdefgh','whoseday-feasibility://evil/callback?code=abcdefgh','whoseday-feasibility://auth/other?code=abcdefgh','whoseday-feasibility://auth/callback#access_token=secret','whoseday-feasibility://auth/callback?code=abcdefgh&code=ijklmnop','whoseday-feasibility://auth/callback?error=denied'])assert.throws(()=>callbackCode(url));
});
test('test sign-in uses secure storage, PKCE, existing users and duplicate-safe return',async()=>{
  const calls=[],sessions=[],secrets=new Map();let options;
  const client={auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}}},async signInWithOtp(value){calls.push(value);return{}},async exchangeCodeForSession(code){calls.push(code);await new Promise(r=>setTimeout(r,5));return{data:{session:{user:{id:'synthetic'}}}}},async signOut(){return{}},startAutoRefresh(){},stopAutoRefresh(){}}};
  const auth=createAuth({config:{enabled:true,url:'https://test-project.supabase.co',publishableKey:'sb_publishable_TEST'},vault:{readSecret:async({key})=>({value:secrets.get(key)||null}),writeSecret:async({key,value})=>secrets.set(key,value),removeSecret:async({key})=>secrets.delete(key)},createClient:(_url,_key,config)=>{options=config;return client},onSession:s=>sessions.push(s),onError:e=>assert.fail(e)});
  assert.equal(options.auth.flowType,'pkce');assert.equal(options.auth.detectSessionInUrl,false);
  await options.auth.storage.setItem('verifier','secret');assert.equal(await options.auth.storage.getItem('verifier'),'secret');await options.auth.storage.removeItem('verifier');assert.equal(await options.auth.storage.getItem('verifier'),null);
  await auth.send('approved@example.com');assert.equal(calls[0].options.shouldCreateUser,false);
  await Promise.all([auth.callback('whoseday-feasibility://auth/callback?code=abcdefgh'),auth.callback('whoseday-feasibility://auth/callback?code=abcdefgh')]);
  await auth.callback('whoseday-feasibility://auth/callback?code=abcdefgh');assert.equal(calls.filter(v=>v==='abcdefgh').length,1);assert.equal(sessions.length,1);
});
test('production project cannot be enabled in the lab',()=>{
  assert.throws(()=>createAuth({config:{enabled:true,url:'https://hdfuknggfkmaycnantxv.supabase.co',publishableKey:'sb_publishable_TEST'}}),/separate/);
  assert.equal(createAuth({config:{enabled:false}}),null);
});
test('new test identity is limited to the explicitly approved inbox',async()=>{
  const calls=[];
  const auth=createAuth({config:{enabled:true,url:'https://test-project.supabase.co',publishableKey:'sb_publishable_TEST',approvedTestEmail:'approved@example.com',createApprovedTestUser:true},vault:{},createClient:()=>({auth:{onAuthStateChange(){},async signInWithOtp(args){calls.push(args);return{}}}}),onSession(){},onError(){}});
  await assert.rejects(auth.send('other@example.com'),/approved/);await auth.send('approved@example.com');assert.equal(calls.length,1);assert.equal(calls[0].options.shouldCreateUser,true);
});
