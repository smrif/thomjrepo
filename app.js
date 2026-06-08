const DEFAULT_CONFIG={
  currentParentLabel:'Dad',
  coParentLabel:'Mom',
  children:['Thomas','Presley','Hayden'],
  scheduleType:'alternating-weeks',
  reminderPreference:'none'
};
const CONFIG_KEY='custody_tracker_config';
let APP_CONFIG=loadConfig();
let KIDS=[...APP_CONFIG.children];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ACT_LBL={tennis:'Tennis',camp:'Camp/drop-off',school:'School run',food:'Meal/dinner',medical:'Doctor/medical',activity:'Activity/event',overnight:'Had overnight',other:'Other'};
const LOC_LBL={moms:"At Mom's",sleepover:'Sleepover',camp:'Overnight camp',activity:'Activity/event',other:'Other'};
const MY_EMAIL='thomas.j.gamble@gmail.com';

let S={week:null,dadMode:null,momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:''};
let absentQueue=[],absentIdx=0,helpedQueue=[],helpedIdx=0,momHelpedQueue=[],momHelpedIdx=0;
let easyOpts=[];
let diaryOrigin='';   // which screen diary came from, for back nav
let calM=new Date().getMonth(),calY=new Date().getFullYear();
let currentExportType=null,currentReportText='';
let BACKFILL_DATE=null;

function loadConfig(){
  try{
    const saved=localStorage.getItem(CONFIG_KEY);
    if(!saved)return{...DEFAULT_CONFIG,children:[...DEFAULT_CONFIG.children]};
    const parsed=JSON.parse(saved);
    const children=Array.isArray(parsed.children)&&parsed.children.length?parsed.children:DEFAULT_CONFIG.children;
    return{...DEFAULT_CONFIG,...parsed,children:children.map(cleanName).filter(Boolean)};
  }catch(e){return{...DEFAULT_CONFIG,children:[...DEFAULT_CONFIG.children]}}
}
function hasSavedConfig(){return !!localStorage.getItem(CONFIG_KEY)}
function saveConfig(config){
  APP_CONFIG={...DEFAULT_CONFIG,...config,children:config.children.map(cleanName).filter(Boolean)};
  if(!APP_CONFIG.children.length)APP_CONFIG.children=[...DEFAULT_CONFIG.children];
  KIDS=[...APP_CONFIG.children];
  localStorage.setItem(CONFIG_KEY,JSON.stringify(APP_CONFIG));
}
function cleanName(name){return String(name||'').trim().replace(/\s+/g,' ')}
function possessive(label){return label.endsWith('s')?label+"'":label+"'s"}
function currentParent(){return APP_CONFIG.currentParentLabel||DEFAULT_CONFIG.currentParentLabel}
function coParent(){return APP_CONFIG.coParentLabel||DEFAULT_CONFIG.coParentLabel}
function currentParentPoss(){return possessive(currentParent())}
function coParentPoss(){return possessive(coParent())}
function kidsWord(count=KIDS.length){return count===1?'kid':'kids'}
function kidsCountLabel(count=KIDS.length){
  if(count===0)return'no kids';
  if(count===1)return'one kid';
  if(count===2)return'both kids';
  if(count===3)return'all three kids';
  return'all '+count+' kids';
}
function kidsListLabel(kids=KIDS){return kids.length<=2?kids.join(' and '):kids.slice(0,-1).join(', ')+', and '+kids[kids.length-1]}
function labelize(text){
  return String(text)
    .replace(/Dad's/g,currentParentPoss())
    .replace(/Mom's/g,coParentPoss())
    .replace(/\bDad\b/g,currentParent())
    .replace(/\bMom\b/g,coParent());
}
function kidBtnId(prefix,name){return prefix+'-'+encodeURIComponent(name)}
function kidBtn(prefix,name){return document.getElementById(kidBtnId(prefix,name))}
function setupKidGrid(gridId,prefix,handlerName,extraButton){
  const grid=document.getElementById(gridId);
  if(!grid)return;
  grid.innerHTML='';
  KIDS.forEach(k=>{
    const btn=document.createElement('button');
    btn.className='kid-btn';
    btn.id=kidBtnId(prefix,k);
    btn.textContent=k;
    btn.onclick=()=>window[handlerName](k);
    grid.appendChild(btn);
  });
  if(extraButton)grid.appendChild(extraButton());
}
function allWithCoParentButton(id,handler,label){
  const btn=document.createElement('button');
  btn.className='kid-btn';
  btn.id=id;
  btn.textContent=label||('All at '+coParentPoss());
  btn.onclick=handler;
  return btn;
}
function personalizeStaticCopy(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{node.nodeValue=labelize(node.nodeValue)});
}
function renderConfigurableUi(){
  personalizeStaticCopy();
  const allKidsSub=document.getElementById('allkids-sub');
  if(allKidsSub)allKidsSub.textContent=kidsListLabel();
  const allKidsQ=document.querySelector('#s-allkids .q');
  if(allKidsQ)allKidsQ.textContent='Are '+kidsCountLabel()+' sleeping at your house tonight?';
  const yesAll=document.getElementById('ak-yes');
  if(yesAll)yesAll.textContent='Yes, '+kidsCountLabel();
  setupKidGrid('which-kids-grid','kb','toggleKid',()=>allWithCoParentButton('kb-allMom',setAllMom,'All at '+coParentPoss()));
  setupKidGrid('mom-helped-grid','mhk','toggleMomHelpedKid');
  setupKidGrid('dad-wk-mom-grid','dwm','toggleDadWkMomKid',()=>allWithCoParentButton('dwm-all',setDadWkMomAll,kidsCountLabel()));
  setupKidGrid('helped-kids-grid','hk','toggleHelpedKid');
  setupKidGrid('dad-had-grid','dh','toggleDadHadKid',()=>allWithCoParentButton('dh-allThree',setDadHadAll,kidsCountLabel()));
  LOC_LBL.moms='At '+coParentPoss();
}
function initSetupForm(){
  document.getElementById('setup-current-parent').value=APP_CONFIG.currentParentLabel;
  document.getElementById('setup-co-parent').value=APP_CONFIG.coParentLabel;
  document.getElementById('setup-children').value=APP_CONFIG.children.join(', ');
  document.getElementById('setup-schedule').value=APP_CONFIG.scheduleType;
  document.getElementById('setup-reminder').value=APP_CONFIG.reminderPreference;
}
function saveSetup(){
  const children=document.getElementById('setup-children').value.split(',').map(cleanName).filter(Boolean);
  saveConfig({
    currentParentLabel:cleanName(document.getElementById('setup-current-parent').value)||DEFAULT_CONFIG.currentParentLabel,
    coParentLabel:cleanName(document.getElementById('setup-co-parent').value)||DEFAULT_CONFIG.coParentLabel,
    children,
    scheduleType:document.getElementById('setup-schedule').value,
    reminderPreference:document.getElementById('setup-reminder').value
  });
  renderConfigurableUi();
  initHome();
  show('s-home');
}
function skipSetup(){saveConfig(DEFAULT_CONFIG);renderConfigurableUi();initHome();show('s-home')}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function pad(n){return String(n).padStart(2,'0')}
function fmtDate(ds){const[y,m,d]=ds.split('-');return MONTHS[parseInt(m)-1]+' '+parseInt(d)+', '+y}
function fmtShort(ds){const[y,m,d]=ds.split('-');return MONTHS[parseInt(m)-1].slice(0,3)+' '+parseInt(d)+', '+y}

// ── MISSED DAY LOGIC ──────────────────────────────────────────
function yesterdayStr(){
  const d=new Date();d.setDate(d.getDate()-1);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function getMissedDays(){
  // Returns array of date strings (oldest first) that are in the past, before today,
  // have no entry, and are after the app's first entry (so we don't flag the whole past).
  const entries=getEntries();
  const today=todayStr();
  const allDates=Object.keys(entries).sort();
  if(!allDates.length)return[];
  const firstEntry=allDates[0];
  const missed=[];
  // Walk from day after first entry up to (not including) today
  const cursor=new Date(firstEntry);
  cursor.setDate(cursor.getDate()+1);
  const todayD=new Date(today);
  while(cursor<todayD){
    const ds=cursor.getFullYear()+'-'+pad(cursor.getMonth()+1)+'-'+pad(cursor.getDate());
    if(!entries[ds]&&ds!==today)missed.push(ds);
    cursor.setDate(cursor.getDate()+1);
  }
  return missed;
}
function markMissedDays(){
  // For any missed days older than yesterday, write a "not-logged" sentinel entry.
  // Yesterday is left alone so the prompt can offer to backfill it.
  const yesterday=yesterdayStr();
  const missed=getMissedDays().filter(ds=>ds!==yesterday);
  if(!missed.length)return;
  const entries=getEntries();
  missed.forEach(ds=>{
    if(!entries[ds])entries[ds]={week:'not-logged',missedAt:new Date().toISOString()};
  });
  putEntries(entries);
}
function checkMissedPrompt(){
  // Show the prompt only if yesterday has no entry and we haven't already dismissed it today.
  const yesterday=yesterdayStr();
  const entries=getEntries();
  const dismissKey='missed_dismissed_'+todayStr();
  if(entries[yesterday])return; // already logged or marked
  if(!Object.keys(entries).length)return; // brand-new app, no history yet
  if(localStorage.getItem(dismissKey))return; // already asked today
  // Find the first entry to make sure the app has been in use at least one day
  const allDates=Object.keys(entries).sort();
  if(!allDates.length||allDates[0]>=yesterday)return;
  // Show it
  const yLabel=fmtShort(yesterday);
  document.getElementById('missed-date-label').textContent=yLabel;
  document.getElementById('missed-prompt').style.display='block';
}
function dismissMissedPrompt(){
  // Mark yesterday as intentionally skipped (not-logged sentinel)
  const yesterday=yesterdayStr();
  const entries=getEntries();
  if(!entries[yesterday])entries[yesterday]={week:'not-logged',intentional:true,missedAt:new Date().toISOString()};
  putEntries(entries);
  localStorage.setItem('missed_dismissed_'+todayStr(),'1');
  document.getElementById('missed-prompt').style.display='none';
}
function startBackfill(){
  // Start check-in flow but target yesterday's date instead of today
  document.getElementById('missed-prompt').style.display='none';
  localStorage.setItem('missed_dismissed_'+todayStr(),'1');
  startCheckin(yesterdayStr());
}
// ── END MISSED DAY LOGIC ──────────────────────────────────────

function getEntries(){try{const r=localStorage.getItem('familylog_entries');return r?JSON.parse(r):{}}catch(e){return{}}}
function putEntries(e){try{localStorage.setItem('familylog_entries',JSON.stringify(e));try{sessionStorage.setItem('familylog_backup',JSON.stringify(e))}catch(ex){}}catch(e){}}

function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');window.scrollTo(0,0)}
function setProg(id,step,total){const el=document.getElementById(id);if(!el)return;el.innerHTML='';for(let i=0;i<total;i++){const d=document.createElement('div');d.className='pd'+(i<step?' done':'')+(i===step?' active':'');el.appendChild(d)}}

function initHome(){
  markMissedDays();
  checkMissedPrompt();
  const now=new Date();
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  document.getElementById('home-date').textContent=days[now.getDay()]+', '+MONTHS[now.getMonth()]+' '+now.getDate()+', '+now.getFullYear();
  if(now.getDay()===0&&!localStorage.getItem('sunday_prompt_'+todayStr()))document.getElementById('sunday-prompt').style.display='block';
  const entries=getEntries(),dates=Object.keys(entries).sort().reverse();
  if(!dates.length)return;
  const last=dates[0],e=entries[last];
  let desc=describeEntry(e);
  document.getElementById('home-recent-inner').innerHTML=`<div class="entry-date-lbl">${fmtShort(last)}</div><div class="entry-row">${desc}</div>${e.diary?`<div class="entry-row" style="color:#666;font-style:italic;font-size:13px;margin-top:3px">"${e.diary.substring(0,90)}${e.diary.length>90?'…':''}"</div>`:''}`;
  document.getElementById('home-recent').style.display='block';
}
function describeEntry(e){
  if(e.week==='not-logged')return e.intentional?'Skipped intentionally':'Dad didn\'t post';
  if(e.week==='other')return'Special day';
  if(e.dadMode==='mom-had')return"Your week · Kids at "+coParentPoss()+': '+(e.momHadKidsOnDadWeek||[]).join(', ');
  if(e.dadMode==='dad-helped-mom')return'Your week · '+coParent()+' helped: '+(e.momHadKidsOnDadWeek||[]).join(', ');
  if(e.momMode==='easy')return coParent()+' had kids';
  if(e.momMode==='helped')return'You helped: '+(e.helpedKids||[]).join(', ');
  if(e.momMode==='dad-had')return'You had: '+(e.dadHadKids||[]).join(', ');
  const n=(e.kidsWithDad||[]).length;return n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')+' home';
}

function startCheckin(backfillDate=null){
  BACKFILL_DATE=backfillDate;
  S={week:null,dadMode:null,momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:''};
  easyOpts=[];diaryOrigin='';
  ['dad','mom','other'].forEach(w=>document.getElementById('wk-'+w).className='btn');
  document.getElementById('week-hint').style.display='none';
  setProg('prog-week',0,5);show('s-week');
}

function setWeek(w){
  S.week=w;
  const hints={dad:'Your scheduled custody week — how did it actually go?',mom:coParentPoss()+" scheduled week — you'll describe how involved you were.",other:'Holiday, tournament, or special day — goes straight to your diary.'};
  const hintEl=document.getElementById('week-hint');
  hintEl.style.display='block';hintEl.style.padding='10px 13px';
  hintEl.style.background=w==='mom'?'#faece7':w==='other'?'#faeeda':'#f2f2f0';
  hintEl.style.color=w==='mom'?'#993c1d':w==='other'?'#854f0b':'#666';
  hintEl.textContent=hints[w];
  ['dad','mom','other'].forEach(x=>document.getElementById('wk-'+x).className='btn'+(x===w?(w==='mom'?' sel-mom':w==='other'?' sel-other':' sel'):''));
  if(w==='dad')setTimeout(()=>{setProg('prog-dad-mode',0,4);document.querySelectorAll('#s-dad-mode .scene-card').forEach(c=>c.className='scene-card');show('s-dad-mode')},300);
  else if(w==='mom')setTimeout(()=>{setProg('prog-mom-mode',0,3);document.querySelectorAll('#s-mom-mode .scene-card').forEach(c=>c.className='scene-card');show('s-mom-mode')},300);
  else setTimeout(()=>{document.getElementById('other-diary-input').value=S.diary||'';show('s-other-diary')},300);
}

// DAD MODE
function setDadMode(mode){
  S.dadMode=mode;
  document.querySelectorAll('#s-dad-mode .scene-card').forEach(c=>c.className='scene-card');
  const idMap={'normal':'sc-dad-normal','dad-helped-mom':'sc-dad-helped','mom-had':'sc-dad-momhad'};
  document.getElementById(idMap[mode]).classList.add(mode==='mom-had'?'sel-warn':'sel-dad');
  if(mode==='normal')setTimeout(()=>{setProg('prog-allkids',1,4);show('s-allkids')},250);
  else if(mode==='dad-helped-mom')setTimeout(()=>{KIDS.forEach(k=>kidBtn('mhk',k).className='kid-btn');S.momHelpedOnDadWeek={};S.momHadKidsOnDadWeek=[];document.getElementById('mom-helped-next').disabled=true;updateMomHelpedSummary();setProg('prog-mom-helped-kids',1,4);show('s-mom-helped-kids')},250);
  else setTimeout(()=>{KIDS.forEach(k=>kidBtn('dwm',k).className='kid-btn');document.getElementById('dwm-all').className='kid-btn';S.momHadKidsOnDadWeek=[];updateDadWkMomSummary();document.getElementById('dwm-next').disabled=true;setProg('prog-dad-wk-mom-had',1,4);show('s-dad-wk-mom-had')},250);
}

function toggleMomHelpedKid(name){
  const btn=kidBtn('mhk',name),idx=S.momHadKidsOnDadWeek.indexOf(name);
  if(idx>=0){S.momHadKidsOnDadWeek.splice(idx,1);btn.classList.remove('with-mom')}else{S.momHadKidsOnDadWeek.push(name);btn.classList.add('with-mom')}
  document.getElementById('mom-helped-next').disabled=S.momHadKidsOnDadWeek.length===0;updateMomHelpedSummary();
}
function updateMomHelpedSummary(){const el=document.getElementById('mom-helped-summary');if(!S.momHadKidsOnDadWeek.length){el.textContent='Tap the kids '+coParent()+' was involved with';return}el.innerHTML='<strong style="color:#993c1d">'+coParent()+' helped with:</strong> '+S.momHadKidsOnDadWeek.join(', ')}
function startMomHelpedLoop(){momHelpedQueue=[...S.momHadKidsOnDadWeek];momHelpedIdx=0;showMomHelpedStep()}
function showMomHelpedStep(){
  const kid=momHelpedQueue[momHelpedIdx],total=momHelpedQueue.length;
  document.getElementById('mha-step-lbl').textContent='Kid '+(momHelpedIdx+1)+' of '+total;
  document.getElementById('mha-kid-name').textContent=kid;document.getElementById('mha-avatar').textContent=kid[0];
  document.getElementById('mha-q').textContent='What did '+coParent()+' do with '+kid+'?';
  if(!S.momHelpedOnDadWeek[kid])S.momHelpedOnDadWeek[kid]={acts:[],note:''};
  document.getElementById('mha-note').value=S.momHelpedOnDadWeek[kid].note||'';
  document.querySelectorAll('#mha-acts .act-btn').forEach(b=>{b.classList.toggle('sel',S.momHelpedOnDadWeek[kid].acts.includes(b.getAttribute('onclick').match(/'(\w+)'/)[1]))});
  document.getElementById('mha-next-btn').disabled=S.momHelpedOnDadWeek[kid].acts.length===0;
  document.getElementById('mha-next-btn').textContent=momHelpedIdx<total-1?'Next kid →':'Continue →';
  setProg('prog-mom-helped-activity',2,4);show('s-mom-helped-activity');
}
function toggleMomAct(el,key){
  el.classList.toggle('sel');const kid=momHelpedQueue[momHelpedIdx];
  if(!S.momHelpedOnDadWeek[kid])S.momHelpedOnDadWeek[kid]={acts:[],note:''};
  const i=S.momHelpedOnDadWeek[kid].acts.indexOf(key);if(i>=0)S.momHelpedOnDadWeek[kid].acts.splice(i,1);else S.momHelpedOnDadWeek[kid].acts.push(key);
  document.getElementById('mha-next-btn').disabled=S.momHelpedOnDadWeek[kid].acts.length===0;
}
function nextMomHelpedKid(){
  const kid=momHelpedQueue[momHelpedIdx];S.momHelpedOnDadWeek[kid].note=document.getElementById('mha-note').value.trim();momHelpedIdx++;
  if(momHelpedIdx<momHelpedQueue.length)showMomHelpedStep();
  else{setProg('prog-allkids',1,4);show('s-allkids')}
}
function goBackFromMomHelped(){if(momHelpedIdx>0){momHelpedIdx--;showMomHelpedStep()}else show('s-mom-helped-kids')}

function toggleDadWkMomKid(name){
  document.getElementById('dwm-all').classList.remove('with-mom');
  const btn=kidBtn('dwm',name),idx=S.momHadKidsOnDadWeek.indexOf(name);
  if(idx>=0){S.momHadKidsOnDadWeek.splice(idx,1);btn.classList.remove('with-mom')}else{S.momHadKidsOnDadWeek.push(name);btn.classList.add('with-mom')}
  document.getElementById('dwm-next').disabled=S.momHadKidsOnDadWeek.length===0;updateDadWkMomSummary();
}
function setDadWkMomAll(){S.momHadKidsOnDadWeek=[...KIDS];KIDS.forEach(k=>kidBtn('dwm',k).classList.add('with-mom'));document.getElementById('dwm-all').classList.add('with-mom');document.getElementById('dwm-next').disabled=false;updateDadWkMomSummary()}
function updateDadWkMomSummary(){const el=document.getElementById('dad-wk-mom-summary');if(!S.momHadKidsOnDadWeek.length){el.textContent='Tap the kids who are at '+coParentPoss()+' tonight';return}el.innerHTML='<strong style="color:#993c1d">At '+coParentPoss()+':</strong> '+S.momHadKidsOnDadWeek.join(', ')}
function goDadWkMomDiary(){diaryOrigin='s-dad-wk-mom-had';document.getElementById('diary-q').textContent="Add a note about tonight";document.getElementById('diary-sub').textContent='Why did the kids end up at '+coParentPoss()+' during your week?';document.getElementById('diary-input').value=S.diary||'';document.getElementById('diary-next-btn').textContent='Review & save →';setProg('prog-diary',3,4);show('s-diary')}

function setAllKids(all){
  document.getElementById('ak-yes').classList.toggle('sel',all);document.getElementById('ak-no').classList.toggle('sel',!all);
  if(all){S.kidsWithDad=[...KIDS];setTimeout(()=>{showKidsConfirm('s-allkids')},200)}
  else{KIDS.forEach(k=>kidBtn('kb',k).classList.remove('with-dad'));document.getElementById('kb-allMom').classList.remove('all-mom');S.kidsWithDad=[];updateWhoSummary();setTimeout(()=>{setProg('prog-whichkids',2,4);show('s-whichkids')},200)}
}
function toggleKid(name){
  document.getElementById('kb-allMom').classList.remove('all-mom');
  const btn=kidBtn('kb',name),idx=S.kidsWithDad.indexOf(name);
  if(idx>=0){S.kidsWithDad.splice(idx,1);btn.classList.remove('with-dad')}else{S.kidsWithDad.push(name);btn.classList.add('with-dad')}
  updateWhoSummary();
}
function setAllMom(){S.kidsWithDad=[];KIDS.forEach(k=>kidBtn('kb',k).classList.remove('with-dad'));document.getElementById('kb-allMom').classList.toggle('all-mom');updateWhoSummary()}
function updateWhoSummary(){
  const el=document.getElementById('who-summary-text'),allMom=document.getElementById('kb-allMom').classList.contains('all-mom');
  if(allMom){el.innerHTML='<strong>'+kidsCountLabel()+'</strong> are at '+coParentPoss()+' tonight';return}
  if(!S.kidsWithDad.length){el.textContent='Tap the kids who are with you tonight';return}
  if(S.kidsWithDad.length===KIDS.length){el.innerHTML='<strong>'+kidsCountLabel()+'</strong> are with you tonight';return}
  const absent=KIDS.filter(k=>!S.kidsWithDad.includes(k));
  let h='<strong style="color:#3c3489">With you:</strong> '+S.kidsWithDad.join(', ');
  if(absent.length)h+='<br><strong style="color:#712b13">Not home:</strong> '+absent.join(', ')+' — you\'ll be asked about them next';
  el.innerHTML=h;
}
function startAbsentLoop(){
  absentQueue=KIDS.filter(k=>!S.kidsWithDad.includes(k));absentIdx=0;
  if(!absentQueue.length){showKidsConfirm('s-whichkids');return}
  showAbsentStep();
}
function showAbsentStep(){
  const kid=absentQueue[absentIdx],total=absentQueue.length;
  document.getElementById('absent-step-lbl').textContent='Kid '+(absentIdx+1)+' of '+total+' not home tonight';
  document.getElementById('absent-name').textContent=kid;document.getElementById('absent-avatar').textContent=kid[0];
  document.getElementById('absent-q').textContent='Where is '+kid+' tonight?';
  const saved=S.absentData[kid];
  document.getElementById('absent-note-input').value=saved?saved.note:'';
  document.querySelectorAll('#absent-opts .opt').forEach(o=>{o.classList.toggle('sel',saved&&o.dataset.loc===saved.location)});
  document.getElementById('absent-next-btn').disabled=!saved||!saved.location;
  document.getElementById('absent-next-btn').textContent=absentIdx<total-1?'Next kid →':'Continue →';
  setProg('prog-absent',2,4);show('s-absent');
}
function setAbsentLoc(el,loc){document.querySelectorAll('#absent-opts .opt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');el.dataset.loc=loc;document.getElementById('absent-next-btn').disabled=false}
function nextAbsent(){
  const kid=absentQueue[absentIdx],locEl=document.querySelector('#absent-opts .opt.sel');
  S.absentData[kid]={location:locEl?locEl.dataset.loc:'other',note:document.getElementById('absent-note-input').value.trim()};
  absentIdx++;
  if(absentIdx<absentQueue.length)showAbsentStep();
  else{showKidsConfirm('s-absent')}
}
function goBackFromAbsent(){if(absentIdx>0){absentIdx--;showAbsentStep()}else show('s-whichkids')}
function goBackFromDiary(){show(diaryOrigin||'s-week')}

// ── KIDS CONFIRM SCREEN ───────────────────────────────────────
function showKidsConfirm(backTarget){
  const list=document.getElementById('kids-confirm-list');
  list.innerHTML='';

  // Grid wrapper — same 2-col layout as the kid picker
  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:10px';

  KIDS.forEach(kid=>{
    const withDad=S.kidsWithDad.includes(kid);
    const absentData=S.absentData[kid];
    const box=document.createElement('div');

    if(withDad){
      // Purple highlighted box — same style as .kid-btn.with-dad, plus checkmark corner
      box.style.cssText='padding:18px 12px 14px;border-radius:14px;border:2.5px solid #3C3489;background:#EEEDFE;text-align:center;position:relative';
      box.innerHTML=`
        <div style="position:absolute;top:8px;right:10px;width:20px;height:20px;border-radius:50%;background:#3C3489;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">✓</div>
        <div style="font-size:17px;font-weight:700;color:#3C3489;margin-bottom:5px">${kid}</div>
        <div style="font-size:11px;font-weight:500;color:#534AB7;line-height:1.3">🏠 With you<br>tonight</div>`;
    } else {
      const locLabel=absentData?(LOC_LBL[absentData.location]||absentData.location):'Not set';
      const noteStr=absentData&&absentData.note?absentData.note:'';
      // Coral highlighted box — same style as absent/mom-side, plus location info
      box.style.cssText='padding:18px 12px 14px;border-radius:14px;border:2.5px solid #993C1D;background:#FAECE7;text-align:center;position:relative';
      box.innerHTML=`
        <div style="position:absolute;top:8px;right:10px;width:20px;height:20px;border-radius:50%;background:#993C1D;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">✓</div>
        <div style="font-size:17px;font-weight:700;color:#712B13;margin-bottom:5px">${kid}</div>
        <div style="font-size:11px;font-weight:500;color:#993C1D;line-height:1.3">📍 ${locLabel}</div>
        ${noteStr?`<div style="font-size:10px;color:#993C1D;margin-top:3px;font-style:italic;line-height:1.3">${noteStr}</div>`:''}`;
    }
    grid.appendChild(box);
  });

  list.appendChild(grid);

  // Store where back should go
  document.getElementById('kids-confirm-back-btn').dataset.back=backTarget||'s-whichkids';
  setProg('prog-kids-confirm',3,5);
  show('s-kids-confirm');
}

function goBackFromKidsConfirm(){
  const target=document.getElementById('kids-confirm-back-btn').dataset.back||'s-whichkids';
  show(target);
}

function confirmKidsAndContinue(){
  // Proceed to diary
  diaryOrigin='s-kids-confirm';
  document.getElementById('diary-q').textContent='Anything else to note?';
  document.getElementById('diary-sub').textContent='A quick diary — how was today?';
  document.getElementById('diary-input').value=S.diary||'';
  document.getElementById('diary-next-btn').textContent='Review & save →';
  setProg('prog-diary',4,5);
  show('s-diary');
}
// ── END KIDS CONFIRM ──────────────────────────────────────────


// MOM MODE
function toggleEasyOpt(el,key){
  if(key==='none'){easyOpts=['none'];document.querySelectorAll('#easy-opts .opt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');return}
  document.querySelector('#easy-opts .opt[onclick*="none"]').classList.remove('sel');easyOpts=easyOpts.filter(o=>o!=='none');
  el.classList.toggle('sel');const i=easyOpts.indexOf(key);if(i>=0)easyOpts.splice(i,1);else easyOpts.push(key);
}
function setMomMode(mode){
  S.momMode=mode;
  document.querySelectorAll('#s-mom-mode .scene-card').forEach(c=>c.className='scene-card');
  const idMap={easy:'ft-easy',helped:'ft-helped','dad-had':'ft-dad'};
  document.getElementById(idMap[mode]).classList.add(mode==='dad-had'?'sel-warn':'sel-dad');
  if(mode==='easy')setTimeout(()=>{setProg('prog-mom-easy',1,3);document.querySelectorAll('#easy-opts .opt').forEach(o=>o.classList.remove('sel'));easyOpts=[];document.getElementById('easy-note').value='';show('s-mom-easy')},250);
  else if(mode==='helped')setTimeout(()=>{KIDS.forEach(k=>kidBtn('hk',k).classList.remove('with-dad'));S.helpedKids=[];document.getElementById('helped-kids-next').disabled=true;updateHelpedSummary();setProg('prog-mom-helped-kids2',1,3);show('s-mom-helped-kids2')},250);
  else setTimeout(()=>{KIDS.forEach(k=>kidBtn('dh',k).classList.remove('with-dad'));document.getElementById('dh-allThree').classList.remove('with-dad');S.dadHadKids=[];updateDadHadSummary();document.getElementById('dad-had-next').disabled=true;setProg('prog-mom-dad-had',1,3);show('s-mom-dad-had')},250);
}
function toggleHelpedKid(name){
  const btn=kidBtn('hk',name),idx=S.helpedKids.indexOf(name);
  if(idx>=0){S.helpedKids.splice(idx,1);btn.classList.remove('with-dad')}else{S.helpedKids.push(name);btn.classList.add('with-dad')}
  document.getElementById('helped-kids-next').disabled=S.helpedKids.length===0;updateHelpedSummary();
}
function updateHelpedSummary(){const el=document.getElementById('helped-summary');if(!S.helpedKids.length){el.textContent='Tap the kids you were involved with today';return}el.innerHTML='<strong style="color:#3c3489">You helped with:</strong> '+S.helpedKids.join(', ')}
function startHelpedLoop(){helpedQueue=[...S.helpedKids];helpedIdx=0;showHelpedStep()}
function showHelpedStep(){
  const kid=helpedQueue[helpedIdx],total=helpedQueue.length;
  document.getElementById('helped-step-lbl').textContent='Kid '+(helpedIdx+1)+' of '+total;
  document.getElementById('helped-kid-name').textContent=kid;document.getElementById('helped-avatar').textContent=kid[0];
  document.getElementById('helped-q').textContent='What did you do with '+kid+'?';
  if(!S.helpedData[kid])S.helpedData[kid]={acts:[],note:''};
  document.getElementById('helped-note').value=S.helpedData[kid].note||'';
  document.querySelectorAll('#helped-acts .act-btn').forEach(b=>{b.classList.toggle('sel',S.helpedData[kid].acts.includes(b.getAttribute('onclick').match(/'(\w+)'/)[1]))});
  document.getElementById('helped-act-next').disabled=S.helpedData[kid].acts.length===0;
  document.getElementById('helped-act-next').textContent=helpedIdx<total-1?'Next kid →':'Continue →';
  setProg('prog-helped-activity',2,3);show('s-mom-helped-activity');
}
function toggleAct(el,key){
  el.classList.toggle('sel');const kid=helpedQueue[helpedIdx];
  if(!S.helpedData[kid])S.helpedData[kid]={acts:[],note:''};
  const i=S.helpedData[kid].acts.indexOf(key);if(i>=0)S.helpedData[kid].acts.splice(i,1);else S.helpedData[kid].acts.push(key);
  document.getElementById('helped-act-next').disabled=S.helpedData[kid].acts.length===0;
}
function nextHelpedKid(){
  const kid=helpedQueue[helpedIdx];if(!S.helpedData[kid])S.helpedData[kid]={acts:[],note:''};
  S.helpedData[kid].note=document.getElementById('helped-note').value.trim();helpedIdx++;
  if(helpedIdx<helpedQueue.length)showHelpedStep();
  else{showKidsConfirm('s-mom-helped-activity')}
}
function goBackFromHelped(){if(helpedIdx>0){helpedIdx--;showHelpedStep()}else show('s-mom-helped-kids2')}
function toggleDadHadKid(name){
  document.getElementById('dh-allThree').classList.remove('with-dad');
  const btn=kidBtn('dh',name),idx=S.dadHadKids.indexOf(name);
  if(idx>=0){S.dadHadKids.splice(idx,1);btn.classList.remove('with-dad')}else{S.dadHadKids.push(name);btn.classList.add('with-dad')}
  document.getElementById('dad-had-next').disabled=S.dadHadKids.length===0;updateDadHadSummary();
}
function setDadHadAll(){S.dadHadKids=[...KIDS];KIDS.forEach(k=>kidBtn('dh',k).classList.add('with-dad'));document.getElementById('dh-allThree').classList.add('with-dad');document.getElementById('dad-had-next').disabled=false;updateDadHadSummary()}
function updateDadHadSummary(){const el=document.getElementById('dad-had-summary');if(!S.dadHadKids.length){el.textContent='Tap the kids who were actually with you';return}el.innerHTML='<strong style="color:#3c3489">With you:</strong> '+S.dadHadKids.join(', ')}
function goDadHadDiary(){diaryOrigin='s-mom-dad-had';document.getElementById('diary-q').textContent='Add a note about tonight';document.getElementById('diary-sub').textContent="Context: why did you end up with the kids during her week?";document.getElementById('diary-input').value=S.diary||'';document.getElementById('diary-next-btn').textContent='Review & save →';setProg('prog-diary',2,3);show('s-diary')}

// REVIEW
function goToReview(){
  // Save diary / other diary before reviewing
  if(document.getElementById('s-diary').classList.contains('active'))S.diary=document.getElementById('diary-input').value;
  if(document.getElementById('s-other-diary').classList.contains('active'))S.diary=document.getElementById('other-diary-input').value;
  if(document.getElementById('s-mom-easy').classList.contains('active')){S.momOpts=easyOpts;S.diary=document.getElementById('easy-note').value.trim()}
  buildReviewScreen();show('s-review');
}

function buildReviewScreen(){
  const rc=document.getElementById('review-content');
  let html='';
  // Week type
  const weekLabel=S.week==='dad'?'🏠 Your scheduled week':S.week==='mom'?'🏢 Mom\'s scheduled week':'✨ Special / other day';
  html+=reviewSection('Day type',`<div class="review-row"><span class="review-val">${weekLabel}</span></div>`,S.week==='dad'?'s-dad-mode':S.week==='mom'?'s-mom-mode':'s-week');

  if(S.week==='other'){
    html+=reviewSection('Note',`<div class="review-row"><span class="review-val" style="font-style:italic">"${S.diary||'(no note)'}"</span></div>`,'s-other-diary');
  } else if(S.week==='dad'){
    // Dad mode
    const modeLabel=S.dadMode==='normal'?'✅ I had the kids':S.dadMode==='dad-helped-mom'?'🤝 Mom helped out':'⚠️ Kids ended up at Mom\'s';
    html+=reviewSection('Situation',`<div class="review-row"><span class="review-val">${modeLabel}</span></div>`,'s-dad-mode');
    if(S.dadMode==='normal'||S.dadMode==='dad-helped-mom'){
      const n=S.kidsWithDad.length;
      const kidsStr=n===KIDS.length?kidsListLabel():n===0?'None — all at '+coParentPoss():S.kidsWithDad.join(', ');
      html+=reviewSection('Kids with you',`<div class="review-row"><span class="review-val">${kidsStr}</span></div>`,'s-allkids');
      const absent=KIDS.filter(k=>!S.kidsWithDad.includes(k));
      if(absent.length){
        const abRows=absent.map(k=>{const d=S.absentData[k];return`<div class="review-row"><span class="review-key">${k}</span><span class="review-val">${d?(LOC_LBL[d.location]||d.location)+(d.note?' — '+d.note:''):'—'}</span></div>`}).join('');
        html+=reviewSection('Absent kids',abRows,'s-whichkids');
      }
      if(S.dadMode==='dad-helped-mom'&&S.momHadKidsOnDadWeek.length){
        const mhRows=S.momHadKidsOnDadWeek.map(k=>{const v=S.momHelpedOnDadWeek[k];return`<div class="review-row"><span class="review-key">${k}</span><span class="review-val">${v?(v.acts.map(a=>ACT_LBL[a]).join(', '))+(v.note?' — '+v.note:''):'—'}</span></div>`}).join('');
        html+=reviewSection("Mom's help",mhRows,'s-mom-helped-kids');
      }
    }
    if(S.dadMode==='mom-had'){
      html+=reviewSection("Kids at Mom's",`<div class="review-row"><span class="review-val">${S.momHadKidsOnDadWeek.join(', ')||'—'}</span></div>`,'s-dad-wk-mom-had');
    }
    if(S.diary)html+=reviewSection('Diary note',`<div class="review-row"><span class="review-val" style="font-style:italic">"${S.diary}"</span></div>`,'s-diary');
  } else if(S.week==='mom'){
    const modeLabel=S.momMode==='easy'?'✅ Mom had the kids':S.momMode==='helped'?'🤝 I helped with some kids':'⚠️ Mom left the kids with me';
    html+=reviewSection('Situation',`<div class="review-row"><span class="review-val">${modeLabel}</span></div>`,'s-mom-mode');
    if(S.momMode==='easy'){
      const inv=S.momOpts.filter(o=>o!=='none');
      html+=reviewSection('Your involvement',`<div class="review-row"><span class="review-val">${inv.length?inv.join(', '):'None — completely her day'}</span></div>`,'s-mom-easy');
    }
    if(S.momMode==='helped'&&S.helpedKids.length){
      const hRows=S.helpedKids.map(k=>{const v=S.helpedData[k];return`<div class="review-row"><span class="review-key">${k}</span><span class="review-val">${v?(v.acts.map(a=>ACT_LBL[a]).join(', '))+(v.note?' — '+v.note:''):'—'}</span></div>`}).join('');
      html+=reviewSection('You helped with',hRows,'s-mom-helped-kids2');
    }
    if(S.momMode==='dad-had'){
      html+=reviewSection('Kids you had',`<div class="review-row"><span class="review-val">${S.dadHadKids.join(', ')||'—'}</span></div>`,'s-mom-dad-had');
    }
    if(S.diary)html+=reviewSection('Diary note',`<div class="review-row"><span class="review-val" style="font-style:italic">"${S.diary}"</span></div>`,'s-diary');
  }
  rc.innerHTML=html;
}

function reviewSection(label,content,editTarget){
  return`<div class="review-section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div class="review-label">${label}</div>
      <button class="review-edit-btn" onclick="goEditFromReview('${editTarget}')">Edit</button>
    </div>
    <div class="review-card">${content}</div>
  </div>`;
}

function goEditFromReview(target){show(target)}
function goBackFromReview(){
  // Go back to diary or last meaningful screen
  if(S.week==='other')show('s-other-diary');
  else if(S.momMode==='easy')show('s-mom-easy');
  else show('s-diary');
}

function saveEntry(){
  const entries=getEntries();
  const e={week:S.week,dadMode:S.dadMode,momMode:S.momMode,
    kidsWithDad:S.dadMode==='mom-had'?[]:S.momMode==='dad-had'?[...S.dadHadKids]:[...S.kidsWithDad],
    absentData:{...S.absentData},momOpts:S.week==='mom'&&S.momMode==='easy'?[...S.momOpts]:[],
    helpedKids:[...S.helpedKids],helpedData:{...S.helpedData},
    dadHadKids:[...S.dadHadKids],
    momHadKidsOnDadWeek:[...S.momHadKidsOnDadWeek],
    momHelpedOnDadWeek:{...S.momHelpedOnDadWeek},
    diary:S.diary};
  const saveDate=BACKFILL_DATE||todayStr();BACKFILL_DATE=null;
  entries[saveDate]=e;putEntries(entries);
  let ring='✅',summary='';
  if(S.week==='other'){ring='✨';summary='Special day logged'}
  else if(S.dadMode==='mom-had'){ring='🏡';summary="Your week · Kids at Mom's\n"+S.momHadKidsOnDadWeek.join(', ')}
  else if(S.dadMode==='dad-helped-mom'){summary="Your week · Mom helped: "+S.momHadKidsOnDadWeek.join(', ')}
  else if(S.momMode==='easy'){ring='✅';summary="Mom's week · She had the kids"}
  else if(S.momMode==='helped'){ring='🤝';summary="Mom's week · You helped: "+S.helpedKids.join(', ')}
  else if(S.momMode==='dad-had'){ring='⚠️';summary="Mom's week · You had: "+S.dadHadKids.join(', ')}
  else{const n=e.kidsWithDad.length;summary=(S.week==='dad'?'Your week · ':'')+(n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':e.kidsWithDad.join(', ')+' home')}
  document.getElementById('saved-ring').textContent=ring;
  document.getElementById('saved-summary').textContent=summary;
  show('s-saved');
}

// CALENDAR
function showCal(){calM=new Date().getMonth();calY=new Date().getFullYear();renderCal();show('s-cal');document.getElementById('stats-lbl').textContent=MONTHS[calM]+' '+calY;renderStats()}
function renderCal(){
  const entries=getEntries();
  document.getElementById('cal-title').textContent=MONTHS[calM]+' '+calY;
  const grid=document.getElementById('cal-grid');grid.innerHTML='';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d=>{const e=document.createElement('div');e.className='cal-lbl';e.textContent=d;grid.appendChild(e)});
  const first=new Date(calY,calM,1).getDay(),days=new Date(calY,calM+1,0).getDate(),today=todayStr();
  for(let i=0;i<first;i++)grid.appendChild(document.createElement('div'));
  for(let d=1;d<=days;d++){
    const ds=calY+'-'+pad(calM+1)+'-'+pad(d),e=entries[ds];
    const cell=document.createElement('div');cell.className='cal-cell';cell.textContent=d;
    if(e){
      let cls='mom-has';
      if(e.week==='not-logged')cls='missed';
      else if(e.week==='other')cls='special';
      else if(e.week==='dad'&&e.dadMode==='mom-had')cls='dad-wk-mom-has';
      else if(e.week==='dad'||(e.week==='mom'&&e.momMode==='dad-had'))cls='dad-has';
      cell.classList.add(cls);
      const dot=document.createElement('div');dot.className='dot';cell.appendChild(dot);
      cell.onclick=()=>showDetail(ds,e);
    }
    if(ds===today)cell.classList.add('today');grid.appendChild(cell);
  }
}
function showDetail(ds,e){
  const el=document.getElementById('cal-detail');el.style.display='block';
  let tag,body;
  if(e.week==='not-logged'){
    const reason=e.intentional?' (skipped intentionally)':'';
    tag='<span class="tag tag-missed">Not logged</span>';
    body=`<div class="entry-row" style="color:#999;font-style:italic">Dad didn\'t post this day${reason}.</div>`;
    el.innerHTML=`<div class="entry-card"><div class="entry-date-lbl">${fmtDate(ds)} ${tag}</div>${body}</div>`;
    return;
  }
  if(e.week==='other'){tag='<span class="tag tag-other">✨ Special</span>';body=`<div class="entry-row" style="font-style:italic;color:#666">${e.diary||'No note'}</div>`}
  else if(e.dadMode==='mom-had'){tag='<span class="tag tag-teal">Your wk · Kids at Mom\'s</span>';body=`<div class="entry-row"><strong>At Mom's: ${(e.momHadKidsOnDadWeek||[]).join(', ')}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.dadMode==='dad-helped-mom'){tag='<span class="tag tag-dad">Your week</span>';const n=(e.kidsWithDad||[]).length;const acts=Object.entries(e.momHelpedOnDadWeek||{}).map(([k,v])=>`<div class="entry-row" style="color:#666">${k}: ${coParent()} — ${(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')}</div>`).join('');body=`<div class="entry-row"><strong>${n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')+' home'}</strong></div>${acts}${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.momMode==='easy'){tag='<span class="tag tag-mom">'+coParentPoss()+' week</span>';body=`<div class="entry-row">${coParent()} had ${kidsCountLabel()}</div>${e.diary?`<div class="entry-row" style="color:#666;margin-top:4px">${e.diary}</div>`:''}`}
  else if(e.momMode==='helped'){tag='<span class="tag tag-mom">'+coParentPoss()+' wk · You helped</span>';const acts=Object.entries(e.helpedData||{}).map(([k,v])=>`<div class="entry-row" style="color:#666">${k}: ${(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')}${v.note?' — '+v.note:''}</div>`).join('');body=`<div class="entry-row"><strong>You helped: ${(e.helpedKids||[]).join(', ')}</strong></div>${acts}${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.momMode==='dad-had'){tag='<span class="tag tag-other">'+coParentPoss()+' wk · You had</span>';body=`<div class="entry-row"><strong>You had: ${(e.dadHadKids||[]).join(', ')}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else{tag='<span class="tag tag-dad">Your week</span>';const n=(e.kidsWithDad||[]).length;const kids=n===KIDS.length?kidsCountLabel()+' home':n===0?'All at '+coParentPoss():(e.kidsWithDad||[]).join(', ')+' home';body=`<div class="entry-row"><strong>${kids}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  el.innerHTML=`<div class="entry-card"><div class="entry-date-lbl">${fmtDate(ds)} ${tag}</div>${body}</div>`;
}
function renderStats(){
  const entries=getEntries(),px=calY+'-'+pad(calM+1)+'-';
  const me=Object.entries(entries).filter(([k])=>k.startsWith(px));
  const dadActual=me.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had')).length;
  const dadWkMomHad=me.filter(([,e])=>e.week==='dad'&&e.dadMode==='mom-had').length;
  const momWkDadHad=me.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had').length;
  const involvement=me.filter(([,e])=>(e.week==='mom'&&e.momMode==='helped')||(e.week==='dad'&&e.dadMode==='dad-helped-mom')).length;
  document.getElementById('stat-grid').innerHTML=`
    <div class="stat-card"><div class="stat-num">${dadActual}</div><div class="stat-lbl">Days Dad actually had kids</div></div>
    <div class="stat-card"><div class="stat-num">${momWkDadHad}</div><div class="stat-lbl">Mom's week — Dad had kids</div></div>
    <div class="stat-card"><div class="stat-num">${dadWkMomHad}</div><div class="stat-lbl">Dad's week — kids at Mom's</div></div>
    <div class="stat-card"><div class="stat-num">${involvement}</div><div class="stat-lbl">Cross-week help days</div></div>`;
  const missedDays=me.filter(([,e])=>e.week==='not-logged').length;
  const loggedDays=me.filter(([,e])=>e.week!=='not-logged').length;
  let summaryText=`${MONTHS[calM]}: ${loggedDays} day${loggedDays!==1?'s':''} logged. Dad had the kids on ${dadActual} day${dadActual!==1?'s':''}. During Mom's scheduled days, she left the kids with Dad ${momWkDadHad} time${momWkDadHad!==1?'s':''}. During Dad's scheduled days, kids ended up at Mom's ${dadWkMomHad} time${dadWkMomHad!==1?'s':''}.`;
  if(missedDays)summaryText+=` ${missedDays} day${missedDays!==1?'s were':' was'} not logged.`;
  document.getElementById('summary-box').textContent=summaryText;
}
function renderLog(){
  const entries=getEntries(),sorted=Object.entries(entries).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,30);
  const list=document.getElementById('log-list');
  if(!sorted.length){list.innerHTML='<p style="color:#999;font-size:14px;padding:1rem 0">No entries yet.</p>';return}
  list.innerHTML=sorted.map(([date,e])=>{
    let tagCls,tagTxt,desc;
    if(e.week==='not-logged'){tagCls='tag-missed';tagTxt='Not logged';desc=e.intentional?'Skipped intentionally':'Dad didn\'t post'}
    else if(e.week==='other'){tagCls='tag-other';tagTxt='Special';desc='Special day'}
    else if(e.dadMode==='mom-had'){tagCls='tag-teal';tagTxt='Dad wk/Mom had';desc="Kids at Mom's: "+(e.momHadKidsOnDadWeek||[]).join(', ')}
    else if(e.dadMode==='dad-helped-mom'){tagCls='tag-dad';tagTxt='Your wk';desc='Mom helped: '+(e.momHadKidsOnDadWeek||[]).join(', ')}
    else if(e.momMode==='easy'){tagCls='tag-mom';tagTxt="Mom's wk";desc='Mom had kids'}
    else if(e.momMode==='helped'){tagCls='tag-mom';tagTxt='Mom/Dad helped';desc='You helped: '+(e.helpedKids||[]).join(', ')}
    else if(e.momMode==='dad-had'){tagCls='tag-other';tagTxt='Mom/Dad had';desc='You had: '+(e.dadHadKids||[]).join(', ')}
    else{tagCls='tag-dad';tagTxt='Your wk';const n=(e.kidsWithDad||[]).length;desc=n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')}
    return`<div class="entry-card"><div class="entry-date-lbl">${fmtShort(date)} <span class="tag ${tagCls}">${tagTxt}</span></div><div class="entry-row">${desc}</div>${e.diary?`<div class="entry-row" style="color:#666;font-style:italic;font-size:13px;margin-top:3px">"${e.diary.substring(0,80)}${e.diary.length>80?'…':''}"</div>`:''}</div>`;
  }).join('');
}
function changeMonth(dir){calM+=dir;if(calM>11){calM=0;calY++}if(calM<0){calM=11;calY--}document.getElementById('stats-lbl').textContent=MONTHS[calM]+' '+calY;renderCal();renderStats()}
function switchTab(t){['cal','stats','log'].forEach(x=>{document.getElementById('t-'+x).classList.toggle('active',x===t);document.getElementById('tc-'+x).style.display=x===t?'block':'none'});if(t==='log')renderLog()}

// EXPORT
function showExport(){currentExportType=null;document.querySelectorAll('.export-card').forEach(c=>c.classList.remove('sel'));document.getElementById('export-preview-section').style.display='none';show('s-export')}
function selectExport(type){
  currentExportType=type;document.querySelectorAll('.export-card').forEach(c=>c.classList.remove('sel'));document.getElementById('exp-'+type).classList.add('sel');
  currentReportText=buildReport(type);
  document.getElementById('preview-box').textContent=currentReportText||'No entries found.';
  document.getElementById('export-preview-section').style.display='block';document.getElementById('copy-toast').style.display='none';
}
function notLoggedText(e){return e.intentional?'Skipped intentionally':'Not logged'}
function buildReport(type){
  const entries=getEntries(),sorted=Object.entries(entries).sort((a,b)=>a[0].localeCompare(b[0]));
  if(!sorted.length)return'';
  const gen='Generated: '+new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const D='─'.repeat(50);
  if(type==='full'){
    let L=['CUSTODY TRACKER — FULL DIARY','Kids: '+kidsListLabel(),gen,'',D,''];
    for(const[ds,e]of sorted){
      L.push('DATE: '+fmtDate(ds));
      if(e.week==='not-logged'){L.push('TYPE: Not logged');L.push('STATUS: '+notLoggedText(e))}
      else if(e.week==='other'){L.push('TYPE: Special/other day');L.push('NOTE: '+(e.diary||'—'))}
      else if(e.dadMode==='mom-had'){L.push("WEEK: Dad's scheduled week — KIDS AT MOM'S");L.push('KIDS AT MOM\'S: '+(e.momHadKidsOnDadWeek||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.dadMode==='dad-helped-mom'){L.push('WEEK: '+currentParentPoss()+' scheduled week');const n=(e.kidsWithDad||[]).length;L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(n===KIDS.length?kidsCountLabel():n===0?'None':(e.kidsWithDad||[]).join(', ')));L.push(coParent().toUpperCase()+' HELPED:');Object.entries(e.momHelpedOnDadWeek||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')+(v.note?' ('+v.note+')':'')));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='easy'){L.push("WEEK: Mom's scheduled week");L.push('STATUS: Mom had the kids');if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='helped'){L.push("WEEK: Mom's scheduled week");L.push('DAD HELPED WITH: '+(e.helpedKids||[]).join(', '));Object.entries(e.helpedData||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')+(v.note?' ('+v.note+')':'')));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='dad-had'){L.push("WEEK: Mom's scheduled week — MOM LEFT KIDS WITH DAD");L.push('KIDS WITH DAD: '+(e.dadHadKids||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary)}
      else{const n=(e.kidsWithDad||[]).length;L.push('WEEK: '+currentParentPoss()+' scheduled week');L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(n===KIDS.length?kidsCountLabel():n===0?'None':(e.kidsWithDad||[]).join(', ')));if(e.diary)L.push('NOTES: '+e.diary)}
      L.push(D,'');
    }return L.join('\n');
  }
  if(type==='dadactual'){
    const filt=sorted.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had'));
    if(!filt.length)return'No entries found.';
    let L=["CUSTODY TRACKER — DAD'S ACTUAL TIME WITH KIDS","Includes Dad's-week days AND Mom's-week nights she left the kids.",gen,'Total: '+filt.length+' days','',D,''];
    for(const[ds,e]of filt){L.push('DATE: '+fmtDate(ds));if(e.momMode==='dad-had'){L.push('*** '+coParent().toUpperCase()+'\'S WEEK — KIDS LEFT WITH '+currentParent().toUpperCase()+' ***');L.push('KIDS: '+(e.dadHadKids||[]).join(', '))}else{const n=(e.kidsWithDad||[]).length;L.push(currentParentPoss()+" scheduled week · "+(n===KIDS.length?kidsCountLabel():(e.kidsWithDad||[]).join(', ')))}if(e.diary)L.push('NOTE: '+e.diary);L.push(D,'');}return L.join('\n');
  }
  if(type==='honest'){
    const mhd=sorted.filter(([,e])=>e.week==='dad'&&e.dadMode==='mom-had');
    const dhm=sorted.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had');
    let L=['CUSTODY TRACKER — FULL HONESTY REPORT',gen,'',D,"DAD'S WEEK — KIDS ENDED UP AT MOM'S ("+mhd.length+' nights)',D,''];
    if(!mhd.length)L.push('None logged.','');else for(const[ds,e]of mhd){L.push('DATE: '+fmtDate(ds));L.push("AT MOM'S: "+(e.momHadKidsOnDadWeek||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary);L.push('')}
    L.push(D,"MOM'S WEEK — MOM LEFT KIDS WITH DAD ("+dhm.length+' nights)',D,'');
    if(!dhm.length)L.push('None logged.','');else for(const[ds,e]of dhm){L.push('DATE: '+fmtDate(ds));L.push('WITH DAD: '+(e.dadHadKids||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary);L.push('')}
    return L.join('\n');
  }
  if(type==='momsweek'){
    const filt=sorted.filter(([,e])=>e.week==='mom'&&(e.momMode==='helped'||e.momMode==='dad-had'));
    if(!filt.length)return"No Mom's-week entries with Dad involvement found.";
    let L=["CUSTODY TRACKER — MOM'S WEEK / DAD'S INVOLVEMENT",gen,'Total: '+filt.length,'',D,''];
    for(const[ds,e]of filt){L.push('DATE: '+fmtDate(ds));if(e.momMode==='dad-had'){L.push('Mom left kids with Dad');L.push('KIDS WITH DAD: '+(e.dadHadKids||[]).join(', '))}else{L.push('Dad helped out');Object.entries(e.helpedData||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')+(v.note?' — '+v.note:'')))}if(e.diary)L.push('NOTE: '+e.diary);L.push(D,'');}return L.join('\n');
  }
  if(type==='notes'){
    const filt=sorted.filter(([,e])=>e.diary&&e.diary.trim());if(!filt.length)return'No diary notes found.';
    let L=['CUSTODY TRACKER — DIARY NOTES',gen,'',D,''];
    for(const[ds,e]of filt){const t=e.week==='other'?'[Special]':e.dadMode==='mom-had'?"[Dad's wk/Mom had]":e.momMode==='dad-had'?"[Mom's wk/Dad had]":e.momMode==='helped'?"[Mom's wk/Dad helped]":e.week==='dad'?"[Dad's week]":"[Mom's week]";L.push(fmtDate(ds)+' '+t);L.push(e.diary.trim(),'');}return L.join('\n');
  }
  return'';
}
function shareReport(){
  if(!currentReportText)return;
  const names={full:'Full Diary',dadactual:"Dad's Actual Time",honest:'Honesty Report',momsweek:"Mom's Week",notes:'Diary Notes'};
  const subject=encodeURIComponent('Custody Tracker — '+(names[currentExportType]||'Report')+' '+new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'}));
  const body=encodeURIComponent(currentReportText);
  if(navigator.share){navigator.share({title:'Custody Tracker',text:currentReportText}).catch(()=>{})}
  else window.location.href=`mailto:${MY_EMAIL}?subject=${subject}&body=${body}`;
}
async function copyReport(){
  if(!currentReportText)return;
  try{await navigator.clipboard.writeText(currentReportText);const el=document.getElementById('copy-toast');el.style.display='block';setTimeout(()=>el.style.display='none',2500)}catch(e){}
}

// SUNDAY EMAIL
function buildWeeklyReport(){
  const entries=getEntries(),sorted=Object.entries(entries).sort((a,b)=>a[0].localeCompare(b[0]));
  const now=new Date(),weekAgo=new Date(now);weekAgo.setDate(weekAgo.getDate()-7);
  const week=sorted.filter(([ds])=>new Date(ds)>=weekAgo);
  const dadActual=week.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had')).length;
  const momLeft=week.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had').length;
  const dadHelped=week.filter(([,e])=>e.week==='mom'&&e.momMode==='helped').length;
  let L=['CUSTODY TRACKER — WEEKLY REPORT','Week ending: '+now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),'','SUMMARY','───────────────────','Days logged: '+week.length,'Days Dad had kids: '+dadActual,"Mom's-week nights she left kids with Dad: "+momLeft,"Mom's-week days Dad helped out: "+dadHelped,'','DAILY BREAKDOWN','───────────────────',''];
  for(const[ds,e]of week){
    L.push(fmtDate(ds).toUpperCase());
    if(e.week==='not-logged')L.push('  Not logged: '+notLoggedText(e));
    else if(e.week==='other')L.push('  Special: '+(e.diary||'—'));
    else if(e.dadMode==='mom-had')L.push("  Your week — kids at Mom's: "+(e.momHadKidsOnDadWeek||[]).join(', '));
    else if(e.momMode==='easy')L.push("  Mom's week — she had kids");
    else if(e.momMode==='helped')L.push("  Mom's week — Dad helped: "+(e.helpedKids||[]).join(', '));
    else if(e.momMode==='dad-had')L.push("  Mom's week — Dad had: "+(e.dadHadKids||[]).join(', '));
    else{const n=(e.kidsWithDad||[]).length;L.push('  Your week — '+(n===KIDS.length?kidsCountLabel()+' home':n===0?'no kids':(e.kidsWithDad||[]).join(', ')+' home'))}
    if(e.diary)L.push('  "'+e.diary.substring(0,80)+(e.diary.length>80?'…':'')+'"');
    L.push('');
  }
  return L.join('\n');
}
function sendWeeklyEmail(){
  const report=buildWeeklyReport();
  const subject=encodeURIComponent('Custody Tracker — Weekly Report '+new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}));
  window.location.href=`mailto:${MY_EMAIL}?subject=${subject}&body=${encodeURIComponent(report)}`;
  localStorage.setItem('sunday_prompt_'+todayStr(),'sent');
  document.getElementById('sunday-prompt').style.display='none';
}

renderConfigurableUi();
if(hasSavedConfig()){
  initHome();
}else{
  initSetupForm();
  show('s-setup');
}
