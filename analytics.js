(function(){
  'use strict';
  // Explicit payloads avoid SDK page/referrer/form capture and auth callback URLs.
  const KEY='whose_day_analytics_v1',OPT_OUT='whose_day_analytics_opt_out';
  const STEPS={
    's-ob-name':['signup','name'], 's-ob-coparent':['signup','coparent'],
    's-ob-howmany':['signup','child_count'], 's-ob-kids':['signup','children'],
    's-ob-finish':['signup','email_agreement'],
    's-week':['checkin','schedule'], 's-dad-mode':['checkin','overnight_a'],
    's-mom-mode':['checkin','overnight_b'], 's-allkids':['checkin','all_children'],
    's-whichkids':['checkin','children_a'], 's-absent':['checkin','location'],
    's-mom-helped-kids':['checkin','children_b'],
    's-mom-helped-activity':['checkin','activities_a'],
    's-dad-wk-mom-had':['checkin','children_c'],
    's-mom-easy':['checkin','help_question_b'],
    's-helped-activity':['checkin','activities_b'],
    's-mom-dad-had':['checkin','children_d'],
    's-dad-help-choice':['checkin','help_question_a'],
    's-change-context':['checkin','context'], 's-context-followup':['checkin','context_followup'], 's-diary':['checkin','notes']
  };
  const EVENTS=new Set(['Flow Started','Step Started','Step Completed','Step Back','Flow Exited','Flow Completed','Signup Link Requested','Signup Link Sent','Signup Link Failed','Signup Verified']);
  const ALLOWED=new Set(['flow','flow_id','step','visit_id','duration_ms','schema_version']);
  const RANGES=['all','month','30','60','90'];
  const REPORTS=['full','dadactual','honest','momsweek','notes'];
  const ERRORS=['network','rate_limit','auth','storage','validation','unknown'];
  const USAGE={
    'Today Viewed':{},'Calendar Viewed':{},'Calendar Day Viewed':{day_state:['today','record','empty']},
    'Trends Viewed':{range:RANGES},'Trends Filter Changed':{range:RANGES},
    'Reports Viewed':{},'Reports Filter Changed':{range:RANGES},
    'Report Generated':{report_type:REPORTS,range:RANGES},
    'Report Print Requested':{report_type:REPORTS,range:RANGES},
    'Report Share Requested':{report_type:REPORTS,range:RANGES,method:['native','email']},
    'Report Copy Completed':{report_type:REPORTS,range:RANGES},
    'Settings Viewed':{},'Settings Section Viewed':{section:['overview','name','email','coparent','child','activities','sync','logs','backup','import','export','delete']},
    'Export Started':{format:['csv','json']},'Export Download Requested':{format:['csv','json']},
    'Export Failed':{format:['csv','json'],error_category:ERRORS},
    'Restore Previewed':{},'Restore Started':{},'Restore Completed':{},'Restore Failed':{error_category:ERRORS},
    'Custom Activity Added':{},'Account Deletion Started':{},'Account Deletion Completed':{},'Account Deletion Failed':{error_category:ERRORS},
    'Weekly Report Email Requested':{},'Missed Check-in Shown':{},'Missed Check-in Log Selected':{},'Missed Check-in Skip Selected':{},
    'Check-in Saved':{usage:['first','repeat']},
    'Sign-in Link Requested':{},'Sign-in Link Sent':{},'Sign-in Link Failed':{error_category:ERRORS},
    'Sign-in Verified':{},'Sign-in Verification Failed':{error_category:ERRORS},'Account Restore Failed':{error_category:ERRORS},
    'Sync Failed':{error_category:ERRORS},'Sync Recovered':{},'Sync Conflict Shown':{},'Sync Conflict Resolved':{copy:['device','cloud']}
  };
  let syncFailed=false,conflictVisible=false,missedVisible=false,viewedPage=null,viewedSection=null,signInVerified=false;
  let state=null,busy=false,timer=null,retry=0;
  const uuid=()=>crypto.randomUUID();
  function enabled(){
    const c=window.WHOSE_DAY_ANALYTICS||{};
    return c.enabled===true&&/^[a-f0-9]{32}$/i.test(c.token||'')&&['US','EU','IN'].includes(c.region)&&
      location.protocol==='https:'&&['whosedayapp.com','thomjrepo.ryan-rifkin.workers.dev'].includes(location.hostname)&&
      !location.search.includes('demo')&&!location.search.includes('preview')&&
      navigator.globalPrivacyControl!==true&&navigator.doNotTrack!=='1'&&localStorage.getItem(OPT_OUT)!=='1';
  }
  function load(){
    try{state=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
    if(!state||typeof state.id!=='string'||!Array.isArray(state.queue))state={id:uuid(),queue:[],flows:{},active:null};
    if(!state.flows)state.flows={};
    return state;
  }
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
  function emit(event,properties={}){
    if(!enabled()||(!EVENTS.has(event)&&!Object.hasOwn(USAGE,event)))return;
    if(event==='Sign-in Link Requested')signInVerified=false;
    if(event==='Sign-in Verified'){if(signInVerified)return;signInVerified=true}
    if(event==='Settings Section Viewed'){
      if(viewedSection===properties.section)return;
      viewedSection=properties.section;
    }
    load();
    const clean={schema_version:1,environment:'production'};
    for(const [key,value] of Object.entries(properties)){
      if(USAGE[event]){if(USAGE[event][key]?.includes(value))clean[key]=value}
      else if(ALLOWED.has(key))clean[key]=value;
    }
    state.queue.push({event,properties:{...clean,distinct_id:state.id,time:Math.floor(Date.now()/1000),$insert_id:uuid()}});
    state.queue=state.queue.filter(e=>e.properties.time>Date.now()/1000-4*86400).slice(-200);
    persist();schedule();
  }
  function schedule(delay=1000){if(!timer)timer=setTimeout(()=>{timer=null;Promise.resolve(flush()).catch(()=>{})},delay)}
  async function flush(){
    if(!enabled()||busy||navigator.onLine===false)return;
    load();state.queue=state.queue.filter(e=>e.properties.time>Date.now()/1000-4*86400);
    if(!state.queue.length){persist();return}
    busy=true;
    const batch=state.queue.slice(0,50),config=window.WHOSE_DAY_ANALYTICS;
    const host={US:'api.mixpanel.com',EU:'api-eu.mixpanel.com',IN:'api-in.mixpanel.com'}[config.region];
    try{
      const response=await fetch('https://'+host+'/track?ip=0&verbose=1',{
        method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(batch.map(e=>({...e,properties:{...e.properties,token:config.token}}))),
        signal:AbortSignal.timeout(10000)
      });
      if(!response.ok)throw new Error('delivery failed');
      const result=await response.json();if(result.status!==1)throw new Error('not accepted');
      if(!enabled())return;
      load();const ids=new Set(batch.map(e=>e.properties.$insert_id));
      state.queue=state.queue.filter(e=>!ids.has(e.properties.$insert_id));retry=0;persist();
    }catch{retry=Math.min(retry+1,6)}
    finally{busy=false;if(enabled()&&state?.queue.length)schedule(Math.min(60000,1000*2**retry))}
  }
  function flow(name){
    load();const existing=state.flows[name];
    if(existing&&existing.at>Date.now()-86400000)return existing;
    const fresh={id:uuid(),at:Date.now()};state.flows[name]=fresh;persist();
    emit('Flow Started',{flow:name,flow_id:fresh.id});return fresh;
  }
  function completeStep(){
    if(!enabled())return;load();const a=state.active;if(!a||a.completed)return;
    a.completed=true;persist();
    emit('Step Completed',{flow:a.flow,flow_id:a.flow_id,step:a.step,visit_id:a.visit_id,duration_ms:Math.max(0,Date.now()-a.at)});
  }
  function screen(id,direction,revisit=false){
    if(!enabled())return;load();
    if(!revisit&&viewedPage!==id){
      viewedPage=id;
      viewedSection=null;
      const event={'s-home':'Today Viewed','s-cal':'Calendar Viewed','s-export':'Reports Viewed','s-setup':'Settings Viewed'}[id];
      if(event)emit(event);
      if(id!=='s-setup')conflictVisible=false;
      if(id!=='s-home')missedVisible=false;
      load();
    }
    const next=STEPS[id]||(id==='s-ob-login'&&window.__analyticsSignup?['signup','email_verification']:null);
    const previous=state.active;
    if(previous&&previous.screen===id&&!previous.completed&&!revisit)return;
    if(previous){
      if(next&&previous.flow===next[0]){
        if(direction==='back')emit('Step Back',{flow:previous.flow,flow_id:previous.flow_id,step:previous.step,visit_id:previous.visit_id});
        else completeStep();
      }else if(!previous.completed)emit('Flow Exited',{flow:previous.flow,flow_id:previous.flow_id,step:previous.step,visit_id:previous.visit_id});
    }
    load();state.active=null;persist();
    if(next){
      const f=flow(next[0]);state.active={flow:next[0],flow_id:f.id,step:next[1],screen:id,visit_id:uuid(),at:Date.now(),completed:false};
      persist();
      emit('Step Started',{flow:next[0],flow_id:f.id,step:next[1],visit_id:state.active.visit_id});
    }
    persist();
  }
  function signupEvent(event){
    if(!enabled()||!EVENTS.has(event))return;
    const f=flow('signup');
    if(event==='Signup Verified'){
      if(f.verified)return;f.verified=true;persist();
    }
    emit(event,{flow:'signup',flow_id:f.id});
  }
  function finish(name){
    if(!enabled())return;load();const f=state.flows[name];if(!f)return;
    if(state.active?.flow===name)completeStep();
    emit('Flow Completed',{flow:name,flow_id:f.id});
    load();delete state.flows[name];if(state.active?.flow===name)state.active=null;persist();
  }
  function begin(name){
    if(!enabled()||!['signup','checkin'].includes(name))return;
    load();delete state.flows[name];state.active=null;persist();flow(name);
  }
  function setOptOut(value){
    try{localStorage.setItem(OPT_OUT,value?'1':'0');if(value){localStorage.removeItem(KEY);state=null;clearTimeout(timer);timer=null}}catch{}
  }
  function errorCategory(error){
    const message=String(error?.code||'')+' '+String(error?.name||'')+' '+String(error?.message||'');
    if(/rate.?limit|429/i.test(message))return 'rate_limit';
    if(/quota|storage|disk/i.test(message))return 'storage';
    if(/network|fetch|timeout|timed out|offline/i.test(message))return 'network';
    if(/auth|token|session|401|403|expired|user not found|signups not allowed/i.test(message))return 'auth';
    if(/invalid|checksum|format|schema|backup|account mismatch/i.test(message))return 'validation';
    return 'unknown';
  }
  function health(ok,error){
    if(!enabled())return;
    if(!ok&&!syncFailed){syncFailed=true;emit('Sync Failed',{error_category:errorCategory(error)})}
    else if(ok&&syncFailed){syncFailed=false;emit('Sync Recovered')}
  }
  function visible(kind,value){
    if(!enabled())return;
    if(kind==='conflict'){if(value&&!conflictVisible)emit('Sync Conflict Shown');conflictVisible=value}
    if(kind==='missed'){if(value&&!missedVisible)emit('Missed Check-in Shown');missedVisible=value}
  }
  // Analytics must never prevent navigation, saving, or authentication.
  const safe=fn=>(...args)=>{try{const result=fn(...args);return result?.catch?result.catch(()=>{}):result}catch{}};
  window.WhoseDayAnalytics={track:safe(emit),health:safe(health),visible:safe(visible),errorCategory:safe(errorCategory),begin:safe(begin),screen:safe(screen),completeStep:safe(completeStep),finish:safe(finish),signupEvent:safe(signupEvent),setOptOut:safe(setOptOut),flush:safe(flush)};
  function syncControls(){
    for(const el of document.querySelectorAll('[data-analytics-choice]')){
      el.checked=localStorage.getItem(OPT_OUT)!=='1'&&navigator.globalPrivacyControl!==true&&navigator.doNotTrack!=='1';
      el.disabled=navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
    }
  }
  addEventListener('DOMContentLoaded',safe(syncControls));
  document.addEventListener('change',safe(event=>{
    if(event.target.matches('[data-analytics-choice]')){setOptOut(!event.target.checked);syncControls()}
  }));
  addEventListener('storage',safe(()=>{state=null;syncControls()}));
  safe(()=>{if(enabled())schedule()})();
  addEventListener('online',safe(()=>schedule()));
})();
