import {test} from 'node:test';import assert from 'node:assert/strict';
import service from '../server/worker.mjs';
import {accountDeletion,deletionEndpoint} from '../src/delete-account.js';
const id='11111111-1111-4111-8111-111111111111';
const env={MOBILE_TEST_PROJECT:'test-project',SUPABASE_URL:'https://test-project.supabase.co',MOBILE_TEST_API_ENABLED:'true',ACCOUNT_DELETION_ENABLED:'true',SUPABASE_SECRET_KEY:'synthetic-server-key'};
const config={auth:{enabled:true,url:env.SUPABASE_URL,publishableKey:'sb_publishable_SYNTHETIC'},deletion:{enabled:true,project:'test-project',url:'https://whose-day-mobile-test.example.workers.dev/api/account'}};
function request({method='DELETE',origin='capacitor://localhost',body={confirmation:'DELETE'},headers={}}={}){return new Request('https://whose-day-mobile-test.example.workers.dev/api/account',{method,headers:{origin,authorization:'Bearer synthetic-token','content-type':'application/json',...headers},...(['GET','OPTIONS'].includes(method)?{}:{body:JSON.stringify(body)})})}
test('test deletion service refuses production/mismatched projects, foreign origins, and arbitrary preflights',async()=>{
 for(const change of [{MOBILE_TEST_API_ENABLED:'false'},{SUPABASE_URL:'https://hdfuknggfkmaycnantxv.supabase.co',MOBILE_TEST_PROJECT:'hdfuknggfkmaycnantxv'},{MOBILE_TEST_PROJECT:'wrong-project'}])assert.equal((await service.fetch(request(),{...env,...change})).status,503);
 assert.equal((await service.fetch(request({origin:'https://foreign.invalid'}),env)).status,403);
 const valid=await service.fetch(request({method:'OPTIONS',headers:{'access-control-request-method':'DELETE','access-control-request-headers':'authorization, content-type'}}),env);assert.equal(valid.status,204);assert.equal(valid.headers.get('access-control-allow-origin'),'capacitor://localhost');assert.equal(valid.headers.get('access-control-allow-credentials'),null);
 assert.equal((await service.fetch(request({method:'OPTIONS',headers:{'access-control-request-method':'POST'}}),env)).status,403);
});
test('native service reuses verified-token self-deletion; no caller ID or upstream error is trusted',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});if(String(url).endsWith('/auth/v1/user'))return Response.json({id,email:'test@example.invalid'});assert.equal(String(url),env.SUPABASE_URL+'/auth/v1/admin/users/'+id);return Response.json({id})};
 try{
  assert.equal((await service.fetch(request({body:{confirmation:'DELETE',user_id:'someone-else'}}),env)).status,400);assert.equal(calls.length,0);
  const result=await service.fetch(request(),env);assert.equal(result.status,200);assert.deepEqual(await result.json(),{deleted:true});assert.equal(result.headers.get('access-control-allow-origin'),'capacitor://localhost');assert.equal(calls.length,2);
  globalThis.fetch=async()=>Response.json({msg:'private upstream error'},{status:500});const failed=await service.fetch(request(),env);assert.equal(failed.status,502);assert(!(await failed.text()).includes('private upstream'));
 }finally{globalThis.fetch=original}
});
test('native client pins the test service and expected user, omits cookies and caller IDs, and distinguishes uncertain failures',async()=>{
 for(const deletion of [{...config.deletion,project:'wrong-project'},{...config.deletion,url:'https://whosedayapp.com/api/account'},{...config.deletion,url:'https://whose-day-mobile-test.example.workers.dev/api/account?x=1'}])assert.throws(()=>deletionEndpoint({...config,deletion}));
 const auth={async withSession(expected,operation){assert.equal(expected,id);return operation({auth:{async getSession(){return{data:{session:{user:{id},access_token:'synthetic-user-token'}}}}}},()=>{})}};
 const remove=accountDeletion(auth,config,{fetcher:async(url,init)=>{assert.equal(url,config.deletion.url);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(init.body),{confirmation:'DELETE'});return Response.json({deleted:true})}});assert.deepEqual(await remove({id}),{deleted:true});
 for(const status of [503,502]){const rejected=accountDeletion(auth,config,{fetcher:async()=>Response.json({error:'unavailable'},{status})});await assert.rejects(rejected({id}),error=>error.definite===(status===503));}
 const lost=accountDeletion(auth,config,{fetcher:async()=>{throw Error('lost response')}});await assert.rejects(lost({id}),error=>!error.definite);
 const changed={async withSession(_,operation){return operation({auth:{async getSession(){return{data:{session:{user:{id:'other'},access_token:'other-token'}}}}}},()=>{})}};
 await assert.rejects(accountDeletion(changed,config,{fetcher:async()=>assert.fail('No wrong-account request')})({id}));
});
