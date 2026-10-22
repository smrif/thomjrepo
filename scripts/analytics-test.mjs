import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../analytics.js',import.meta.url),'utf8');
function harness({hostname='whosedayapp.com',search='',optOut=false,gpc=false,storage,fail=false}={}){
 const values=storage||new Map();if(optOut)values.set('whose_day_analytics_opt_out','1');
 const requests=[],timers=[];let sequence=0;
 const context={window:{WHOSE_DAY_ANALYTICS:{enabled:true,token:'a'.repeat(32),region:'US'}},
  location:{protocol:'https:',hostname,search},navigator:{onLine:true,globalPrivacyControl:gpc},
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
  crypto:{randomUUID:()=>`uuid-${++sequence}`},AbortSignal,
  document:{querySelectorAll:()=>[],addEventListener(){}},addEventListener(){},
  setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},
  fetch:async(url,options)=>{requests.push({url,options});if(fail)throw new Error('offline');return {ok:true,json:async()=>({status:1})}}
 };
 vm.runInNewContext(source,context);
 return {api:context.window.WhoseDayAnalytics,context,values,requests,events:()=>JSON.parse(values.get('whose_day_analytics_v1')||'{"queue":[]}').queue};
}
{
 const h=harness();h.api.begin('signup');h.api.screen('s-ob-name');h.api.screen('s-ob-name');
 assert.equal(h.events().filter(e=>e.event==='Step Started').length,1);
 h.api.screen('s-ob-coparent','forward');h.api.screen('s-ob-name','back');
 assert.equal(h.events().filter(e=>e.event==='Step Completed').length,1,'Back must not complete the co-parent step');
 h.api.screen('s-ob-welcome');assert(h.events().some(e=>e.event==='Flow Exited'));
 assert(!h.events().some(e=>e.event==='Flow Completed'));
}
{
 const h=harness();h.api.begin('checkin');h.api.screen('s-absent');h.api.completeStep();h.api.screen('s-absent');
 h.api.screen('s-absent','back',true);
 assert.equal(h.events().filter(e=>e.event==='Step Completed').length,1);
 const starts=h.events().filter(e=>e.event==='Step Started');
 assert.equal(starts.length,3);assert.equal(new Set(starts.map(e=>e.properties.visit_id)).size,3);
 h.api.finish('checkin');h.api.finish('checkin');
 assert.equal(h.events().filter(e=>e.event==='Flow Completed').length,1);
 h.api.begin('checkin');h.api.screen('s-week');
 assert.equal(new Set(h.events().filter(e=>e.event==='Flow Started').map(e=>e.properties.flow_id)).size,2);
}
{
 const h=harness();h.api.begin('signup');h.api.screen('s-ob-finish');
 h.api.signupEvent('Signup Link Requested');h.api.signupEvent('Signup Link Sent');
 assert(!h.events().some(e=>e.event==='Flow Completed'));
 const callback=harness({storage:h.values});callback.api.signupEvent('Signup Verified');callback.api.signupEvent('Signup Verified');callback.api.finish('signup');
 assert.equal(callback.events().filter(e=>e.event==='Signup Verified').length,1);
 const ids=new Set(callback.events().map(e=>e.properties.flow_id));assert.equal(ids.size,1,'Callback preserves signup attempt');
 await callback.api.flush();assert.equal(callback.events().length,0);
 const request=callback.requests[0];assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert(request.url.includes('ip=0'));
 for(const event of JSON.parse(request.options.body)){
  assert.deepEqual(Object.keys(event.properties).filter(k=>!['token','time','distinct_id','$insert_id','environment','schema_version','flow','flow_id','step','visit_id','duration_ms'].includes(k)),[]);
 }
}
for(const options of [{hostname:'localhost'},{search:'?demo=june'},{search:'?onboarding-theme-preview'},{optOut:true},{gpc:true}]){
 const h=harness(options);h.api.begin('signup');h.api.screen('s-ob-name');await h.api.flush();assert.equal(h.requests.length,0);assert.equal(h.events().length,0);
}
{
 const h=harness({fail:true});h.api.begin('checkin');h.api.screen('s-week');const ids=h.events().map(e=>e.properties.$insert_id);
 await h.api.flush();await h.api.flush();assert.deepEqual(h.events().map(e=>e.properties.$insert_id),ids,'Retries preserve dedup IDs');
 h.api.setOptOut(true);assert.equal(h.events().length,0);await h.api.flush();assert.equal(h.requests.length,2);
}
{
 const h=harness();h.context.localStorage.getItem=()=>{throw new Error('denied')};assert.doesNotThrow(()=>h.api.screen('s-week'));
}
{
 const h=harness();
 h.api.track('Report Generated',{report_type:'full',range:'30',email:'private@example.com',entry_date:'2026-10-01',record_count:42});
 h.api.track('Report Generated',{report_type:'PRIVATE_NOTE',range:'PRIVATE_DATE'});
 h.api.track('Settings Section Viewed',{section:'PRIVATE_CHILD'});
 h.api.health(false,new Error('fetch failed private@example.com'));
 h.api.health(false,new Error('private retry'));
 h.api.health(true);h.api.health(true);
 h.api.visible('conflict',true);h.api.visible('conflict',true);
 h.api.visible('missed',true);h.api.visible('missed',true);
 h.api.track('Sign-in Verified');h.api.track('Sign-in Verified');
 assert.equal(h.events().filter(e=>e.event==='Sync Failed').length,1);
 assert.equal(h.events().filter(e=>e.event==='Sync Recovered').length,1);
 assert.equal(h.events().filter(e=>e.event==='Sync Conflict Shown').length,1);
 assert.equal(h.events().filter(e=>e.event==='Missed Check-in Shown').length,1);
 assert.equal(h.events().filter(e=>e.event==='Sign-in Verified').length,1);
 assert(!JSON.stringify(h.events()).includes('PRIVATE'));
 assert(!JSON.stringify(h.events()).includes('private@example.com'));
 assert(!JSON.stringify(h.events()).includes('record_count'));
 assert.equal(h.events()[0].properties.report_type,'full');
 assert.equal(h.events()[0].properties.range,'30');
 await h.api.flush();
}
console.log('Analytics passed: funnels, usage-property allowlists, health deduplication, opt-out/privacy, retry deduplication, and storage failures.');
