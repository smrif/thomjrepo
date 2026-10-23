import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {testBackend} from '../src/test-backend.js';
const config={enabled:true,url:'https://test-project.supabase.co',publishableKey:'sb_publishable_SYNTHETIC'};
const owner={id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'};
const row={user_id:owner.id,current_parent_label:'A',co_parent_label:'B',children:['Alex'],activities:['school'],theme_mode:'system',updated_at:'2026-10-22T00:00:00Z'};
function fixture(responses){
 const requests=[],client=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
  requests.push({url:new URL(url),...init});const next=responses.shift();assert(next,'Unexpected backend request');return new Response(JSON.stringify(next.body),{status:next.status??200,headers:{'Content-Type':'application/json'}});
 }}});
 const auth={async withSession(id,fn){assert.equal(id,owner.id);return fn(client,()=>{})}};
 return {requests,backend:testBackend(auth,config,owner)};
}
test('test backend uses owner-qualified CAS, omits acceptance/email fields, and treats duplicate inserts as races',async()=>{
 const {requests,backend}=fixture([{body:[row]},{body:row},{body:null},{status:409,body:{code:'23505',message:'duplicate'}}]);
 const profile=(await backend.profile.list()).profile;await backend.profile.compareAndSet('profile',profile.value,row.updated_at);assert.equal(await backend.profile.compareAndSet('profile',profile.value,row.updated_at),null);assert.equal(await backend.profile.compareAndSet('profile',profile.value,null),null);
 assert.equal(requests[0].url.searchParams.get('user_id'),'eq.'+owner.id);
 assert.equal(requests[1].method,'PATCH');assert.equal(requests[1].url.searchParams.get('updated_at'),'eq.'+row.updated_at);assert.equal(requests[1].url.searchParams.get('user_id'),'eq.'+owner.id);
 assert.deepEqual(Object.keys(JSON.parse(requests[1].body)).sort(),['activities','children','co_parent_label','current_parent_label','theme_mode','user_id']);
 assert.equal(requests[3].method,'POST');assert(!requests[3].headers.get('prefer')?.includes('resolution=merge-duplicates'));
});
test('test backend fails closed on cross-owner or invalid cloud data and production configuration',async()=>{
 for(const bad of [{...row,user_id:'22222222-2222-4222-8222-222222222222'},{...row,children:[]},{...row,updated_at:'unknown'}]){
  const {backend}=fixture([{body:[bad]}]);await assert.rejects(backend.profile.list());
 }
 assert.throws(()=>testBackend({}, {...config,url:'https://hdfuknggfkmaycnantxv.supabase.co'},owner));
});
test('cloud entry listing uses a stable cursor beyond one API page',async()=>{
 const entries=Array.from({length:250},(_,i)=>({user_id:owner.id,entry_date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),entry_version:1,deleted_at:'2026-10-21T00:00:00Z',updated_at:'2026-10-22T00:00:00Z'}));
 const {requests,backend}=fixture([{body:entries},{body:[]}]);const result=await backend.entries.list();assert.equal(Object.keys(result).length,250);assert.equal(requests[1].url.searchParams.get('entry_date'),'gt.'+entries.at(-1).entry_date);assert(result[entries[0].entry_date].deleted);
});
