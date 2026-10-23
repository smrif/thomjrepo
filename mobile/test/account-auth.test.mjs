import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAuth,AUTH_STORAGE_KEY,projectAuthVault} from '../src/auth.js';
const session={user:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'},access_token:'synthetic-token',refresh_token:'synthetic-refresh'};
function fixture({online=()=>true,error=null}={}){
 const values=new Map([[AUTH_STORAGE_KEY,JSON.stringify(session)]]),sessions=[];let calls=0,exchange=async()=>({data:{session}});
 const vault={readSecret:async({key})=>({value:values.get(key)??null}),writeSecret:async({key,value})=>values.set(key,value),removeSecret:async({key})=>values.delete(key)};
 const client={auth:{onAuthStateChange(){},getSession:async()=>{calls++;return {data:{session:error?null:session},error}},signOut:async()=>({error:new Error('offline')}),stopAutoRefresh(){},exchangeCodeForSession:code=>exchange(code)}};
 const auth=createAuth({config:{enabled:true,url:'https://test-project.supabase.co',publishableKey:'sb_publishable_TEST'},vault,createClient:()=>client,onSession:s=>sessions.push(s),onError:e=>assert.fail(e),online});
 return {auth,values,sessions,vault,client,get calls(){return calls},set exchange(value){exchange=value}};
}
test('offline reopen uses only the cached secure session; local sign-out remains effective offline and on restart',async()=>{
 const f=fixture({online:()=>false});await f.auth.start();assert.deepEqual(f.sessions.at(-1),session);assert.equal(f.calls,0);
 await f.auth.signOut();assert.equal(f.sessions.at(-1),null);assert(!f.values.has(AUTH_STORAGE_KEY));assert.equal(f.values.get(AUTH_STORAGE_KEY+'-signed-out'),'1');
 // Even a credential restored by a late SDK operation cannot defeat sign-out.
 f.values.set(AUTH_STORAGE_KEY,JSON.stringify(session));await f.auth.start();assert.equal(f.sessions.at(-1),null);
 const reopened=createAuth({config:{enabled:true,url:'https://test-project.supabase.co',publishableKey:'sb_publishable_TEST'},vault:f.vault,createClient:()=>f.client,onSession:s=>f.sessions.push(s),onError:assert.fail,online:()=>false});
 await reopened.start();assert.equal(f.sessions.at(-1),null);
});
test('only transient refresh failure permits offline recovery; rejected sessions close the account',async()=>{
 const transient=fixture({error:{name:'AuthRetryableFetchError'}});await transient.auth.start();assert.deepEqual(transient.sessions.at(-1),session);
 const denied=fixture({error:{name:'AuthApiError',status:401}});await assert.rejects(denied.auth.start());assert.equal(denied.sessions.at(-1),null);
});
test('a callback already in flight cannot undo a later sign-out',async()=>{
 const f=fixture();let release;f.exchange=async()=>{await new Promise(r=>release=r);f.values.set(AUTH_STORAGE_KEY,JSON.stringify(session));return {data:{session}}};
 const callback=f.auth.callback('whoseday-feasibility://auth/callback?code=abcdefgh');await f.auth.signOut();release();await callback;await f.auth.start();
 assert.equal(f.sessions.at(-1),null);assert.equal(f.values.get(AUTH_STORAGE_KEY+'-signed-out'),'1');assert(!f.sessions.some(Boolean));
});
test('a fresh explicit callback can sign in again after durable local sign-out',async()=>{
 const f=fixture();await f.auth.signOut();await f.auth.callback('whoseday-feasibility://auth/callback?code=new-code-123');assert.deepEqual(f.sessions.at(-1),session);assert(!f.values.has(AUTH_STORAGE_KEY+'-signed-out'));
});
test('account auth uses a project namespace and does not inherit lab/other-project sessions',async()=>{
 const f=fixture(),a=projectAuthVault(f.vault,'project-a'),b=projectAuthVault(f.vault,'project-b');
 assert.equal((await a.readSecret({key:AUTH_STORAGE_KEY})).value,null);
 await a.writeSecret({key:AUTH_STORAGE_KEY,value:'project-a-session'});
 assert.equal((await b.readSecret({key:AUTH_STORAGE_KEY})).value,null);
 assert.equal((await f.vault.readSecret({key:AUTH_STORAGE_KEY})).value,JSON.stringify(session));
});
test('a delayed startup session cannot replace a later successful sign-in',async()=>{
 const f=fixture();let release,started;const waiting=new Promise(r=>started=r);
 f.client.auth.getSession=async()=>{started();return await new Promise(r=>release=r)};
 const newer={...session,user:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'}};
 f.exchange=async()=>({data:{session:newer}});
 const slow=f.auth.start();await waiting;await f.auth.callback('whoseday-feasibility://auth/callback?code=newer-code-123');
 release({data:{session}});await slow;assert.deepEqual(f.sessions,[newer]);
});
test('cloud operations share protected auth and reject a different identity or a sign-out in flight',async()=>{
 const f=fixture();let called=false;
 await assert.rejects(f.auth.withSession('22222222-2222-4222-8222-222222222222',()=>{called=true}));assert.equal(called,false);
 let release,started;const waiting=new Promise(r=>started=r);
 const request=f.auth.withSession(session.user.id,async(client,check)=>{assert.equal(client,f.client);started();await new Promise(r=>release=r);check();return 'old data'});
 await waiting;await f.auth.signOut();release();await assert.rejects(request,/changed/);
 await assert.rejects(f.auth.withSession(session.user.id,()=>{called=true}));assert.equal(called,false);
});
