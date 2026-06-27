const DEFAULT_CONFIG={
  currentParentLabel:'Dad',
  coParentLabel:'Mom',
  email:'',
  children:['Thomas','Presley','Hayden'],
  purpose:'',
  termsAccepted:false,
  activityIds:null,
};
const CONFIG_KEY='custody_tracker_config';
const DEFAULT_ACTIVITIES=[
  {id:'school',label:'School pickup / dropoff'},
  {id:'afterschool',label:'After school program'},
  {id:'medical',label:'Doctor / medical'},
  {id:'sports',label:'Sports / practice'},
  {id:'dance',label:'Dance / gymnastics'},
  {id:'music',label:'Music / tutoring'},
  {id:'birthday',label:'Birthday party / playdate'},
  {id:'camp',label:'Camp / day program'},
  {id:'therapy',label:'Therapy / counseling'},
  {id:'religious',label:'Religious service / worship'},
  {id:'volunteer',label:'Volunteering'},
  {id:'tournament',label:'Tournament / competition'},
];

let APP_CONFIG=loadConfig();
let KIDS=[...APP_CONFIG.children];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ACT_LBL={school:'School pickup/dropoff',afterschool:'After school program',medical:'Doctor/medical',sports:'Sports/practice',dance:'Dance/gymnastics',music:'Music/tutoring',birthday:'Birthday party/playdate',camp:'Camp/day program',therapy:'Therapy/counseling',religious:'Religious service',volunteer:'Volunteering',tournament:'Tournament/competition',other:'Other'};
const LOC_LBL={moms:"At Mom's",sleepover:'Sleepover',camp:'Overnight camp',activity:'Activity/event',other:'Other'};
const MY_EMAIL='thomas.j.gamble@gmail.com';

let S={week:null,dadMode:null,momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'',attachment:null,changeAgreed:null,changePressured:null,changeContextNext:null,changeContextBack:null};
let absentQueue=[],absentIdx=0,helpedQueue=[],helpedIdx=0,momHelpedQueue=[],momHelpedIdx=0;
let easyOpts=[];
let diaryOrigin='';   // which screen diary came from, for back nav
let calM=new Date().getMonth(),calY=new Date().getFullYear();
let selectedCalDate=todayStr();
let currentExportType=null,currentReportText='';
let BACKFILL_DATE=null;
let REPORT_FILTER='all';
let setupValidationAttempted=false;
let editingChildRow=null;

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
function childFieldValues(){
  return [...document.querySelectorAll('.setup-child-input')].map(input=>cleanName(input.value)).filter(Boolean);
}
function renderChildFields(children=APP_CONFIG.children){
  const list=document.getElementById('setup-children-list');
  if(!list)return;
  const values=(Array.isArray(children)&&children.length?children:['']);
  list.innerHTML='';
  values.forEach((name,idx)=>appendChildField(name,idx,false));
  updateChildRemoveButtons();
}
function appendChildField(name='',idx=0,openEditor=true){
  const list=document.getElementById('setup-children-list');
  if(!list)return;
  const row=document.createElement('div');
  row.className='setup-child-row';
  const input=document.createElement('input');
  input.type='hidden';
  input.className='setup-child-input';
  input.value=name;
  input.setAttribute('aria-label','Child '+(idx+1)+' name');
  input.addEventListener('input',()=>{renderChildRow(row);handleSetupInput();});
  const error=document.createElement('div');
  error.className='setup-error';
  error.textContent='Please enter a child’s name.';
  row.appendChild(input);
  row.appendChild(error);
  list.appendChild(row);
  renderChildRow(row);
  if(openEditor)openChildEditor(row);
}
function updateChildRemoveButtons(){
  const rows=[...document.querySelectorAll('.setup-child-row')];
  rows.forEach((row,idx)=>{
    const input=row.querySelector('.setup-child-input');
    if(input)input.setAttribute('aria-label','Child '+(idx+1)+' name');
    row.dataset.index=String(idx);
  });
}
function addChildField(){
  appendChildField('',document.querySelectorAll('.setup-child-row').length,true);
  updateChildRemoveButtons();
  handleSetupInput();
}

function renderChildRow(row){
  const input=row.querySelector('.setup-child-input');
  const error=row.querySelector('.setup-error');
  const name=cleanName(input?.value);
  row.innerHTML='';
  row.appendChild(input);
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='settings-child-row-button';
  btn.onclick=()=>openChildEditor(row);
  btn.innerHTML=`<span class="settings-child-avatar person-icon" aria-hidden="true"></span><span class="settings-child-name">${name||'Unnamed child'}</span><span class="settings-chevron" aria-hidden="true">›</span>`;
  row.appendChild(btn);
  row.appendChild(error);
}

function openChildEditor(row){
  editingChildRow=row;
  const modal=document.getElementById('child-modal');
  const input=document.getElementById('child-modal-input');
  const remove=document.querySelector('.child-modal-remove');
  const childInput=row.querySelector('.setup-child-input');
  input.value=childInput?.value||'';
  if(remove)remove.style.display=document.querySelectorAll('.setup-child-row').length>1?'inline-flex':'none';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  setTimeout(()=>input.focus(),0);
}

function closeChildEditor(){
  const modal=document.getElementById('child-modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden','true');
  editingChildRow=null;
}

function saveChildEditor(){
  if(!editingChildRow)return;
  const value=cleanName(document.getElementById('child-modal-input').value);
  const input=editingChildRow.querySelector('.setup-child-input');
  input.value=value;
  renderChildRow(editingChildRow);
  updateChildRemoveButtons();
  handleSetupInput();
  closeChildEditor();
}

function removeEditingChild(){
  if(!editingChildRow)return;
  if(document.querySelectorAll('.setup-child-row').length<=1)return;
  editingChildRow.remove();
  updateChildRemoveButtons();
  handleSetupInput();
  closeChildEditor();
}

// ── ACTIVITIES ───────────────────────────────────────────────────
function renderActivitySetup(){
  const container=document.getElementById('setup-activities-container');
  if(!container)return;
  container.style.display='block';
  const selected=new Set(getConfiguredActivityIds());

  container.innerHTML=`<section class="settings-section">
    <div class="settings-section-head">
      <span class="settings-section-icon activities-icon" aria-hidden="true"></span>
      <div>
        <h2>Common activities</h2>
        <p>These apply to every child.</p>
      </div>
    </div>
    <div class="settings-card activity-card-grid" id="setup-activity-chips"></div>
    <div class="activity-add-row">
      <input type="text" class="activity-custom-input" placeholder="Add custom activity..." id="setup-custom-activity">
      <button type="button" class="activity-add-btn" onclick="addCustomActivity()">Add</button>
    </div>
  </section>`;

  const chipsEl=document.getElementById('setup-activity-chips');
  DEFAULT_ACTIVITIES.forEach(act=>{
    const chip=document.createElement('button');
    chip.type='button';
    chip.className='activity-chip'+(selected.has(act.id)?' active':'');
    chip.dataset.actId=act.id;
    chip.innerHTML=`<span class="activity-line-icon activity-${act.id}" aria-hidden="true"></span><span>${act.label}</span><span class="activity-check" aria-hidden="true">✓</span>`;
    chip.onclick=()=>chip.classList.toggle('active');
    chipsEl.appendChild(chip);
  });
  selected.forEach(id=>{
    if(!DEFAULT_ACTIVITIES.find(a=>a.id===id))addCustomChip(chipsEl,id,true);
  });
}

function getConfiguredActivityIds(){
  if(Array.isArray(APP_CONFIG.activityIds)&&APP_CONFIG.activityIds.length)return APP_CONFIG.activityIds;
  const legacy=APP_CONFIG.childActivities||{};
  const legacyIds=[...new Set(Object.values(legacy).flat().filter(Boolean))];
  return legacyIds.length?legacyIds:DEFAULT_ACTIVITIES.map(a=>a.id);
}

function addCustomChip(chipsEl, label, active=false){
  const chip=document.createElement('button');
  chip.type='button';
  chip.className='activity-chip custom'+(active?' active':'');
  chip.dataset.actId=label;
  chip.innerHTML=`<span class="activity-line-icon activity-custom" aria-hidden="true"></span><span>${label}</span><span class="activity-check" aria-hidden="true">✓</span>`;
  chip.onclick=()=>chip.classList.toggle('active');
  chipsEl.appendChild(chip);
}

function addCustomActivity(){
  const input=document.getElementById('setup-custom-activity');
  const val=input?input.value.trim():'';
  if(!val)return;
  const chipsEl=document.getElementById('setup-activity-chips');
  if(chipsEl)addCustomChip(chipsEl, val, true);
  if(input)input.value='';
}

function getActivityIdsFromSetup(){
  return [...document.querySelectorAll('#setup-activity-chips .activity-chip.active')]
    .map(chip=>chip.dataset.actId)
    .filter(Boolean);
}

function getActivitiesForChild(childName){
  const saved=getConfiguredActivityIds();
  if(saved&&saved.length)return saved.map(id=>{
    const def=DEFAULT_ACTIVITIES.find(a=>a.id===id);
    return def?{id,label:def.label}:{id,label:id};
  });
  return DEFAULT_ACTIVITIES;
}
// ── END ACTIVITIES ───────────────────────────────────────────────

function personalizeStaticCopy(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{node.nodeValue=labelize(node.nodeValue)});
}
function renderConfigurableUi(){
  personalizeStaticCopy();
  const homeProfile=document.getElementById('home-profile');
  if(homeProfile)homeProfile.textContent=currentParent().slice(0,1).toUpperCase();
  const reportsProfile=document.getElementById('reports-profile');
  if(reportsProfile)reportsProfile.textContent=currentParent().slice(0,1).toUpperCase();
  const settingsProfile=document.getElementById('settings-profile');
  if(settingsProfile)settingsProfile.textContent=currentParent().slice(0,1).toUpperCase();
  const dadActualTitle=document.getElementById('report-dadactual-title');
  if(dadActualTitle)dadActualTitle.textContent=currentParentPoss()+' actual time with kids';
  const dadActualDesc=document.getElementById('report-dadactual-desc');
  if(dadActualDesc)dadActualDesc.textContent='All nights '+currentParent()+' had the kids — '+currentParentPoss()+' day plus any schedule changes';
  const momsWeekTitle=document.getElementById('report-momsweek-title');
  if(momsWeekTitle)momsWeekTitle.textContent=coParentPoss()+' day — '+currentParentPoss()+' involvement';
  const momsWeekDesc=document.getElementById('report-momsweek-desc');
  if(momsWeekDesc)momsWeekDesc.textContent=coParentPoss()+' scheduled days where '+currentParent()+' helped or had the kids, with pressure notes';
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
  const onboarding=document.getElementById('s-setup').classList.contains('onboarding-mode');
  setupValidationAttempted=false;
  document.getElementById('setup-alert').classList.remove('show');
  const setupTitle=document.getElementById('setup-title');
  const setupSubtitle=document.getElementById('setup-subtitle');
  if(setupTitle)setupTitle.textContent=onboarding?'Let’s get you started':'Settings';
  if(setupSubtitle)setupSubtitle.textContent=onboarding?'A few quick details to personalize your experience.':'Update your profile and household details.';
  document.getElementById('setup-current-parent').value=onboarding?'':APP_CONFIG.currentParentLabel;
  document.getElementById('setup-email').value=onboarding?'':(APP_CONFIG.email||'');
  document.getElementById('setup-co-parent').value=APP_CONFIG.coParentLabel;
  document.getElementById('setup-co-parent').oninput=()=>updateCoParentPreview();
  renderChildFields(onboarding?['']:APP_CONFIG.children);
  renderActivitySetup();
  updateCoParentPreview();
  const setupPurpose=document.getElementById('setup-purpose');
  if(setupPurpose)setupPurpose.value=onboarding?'':APP_CONFIG.purpose;
  document.getElementById('setup-terms').checked=onboarding?false:!!APP_CONFIG.termsAccepted;
  document.getElementById('setup-continue').textContent=onboarding?'Start tracking →':'Save changes';
  validateSetup(false);
}
function setOnboardingMode(active){
  document.getElementById('s-setup').classList.toggle('onboarding-mode',active);
  document.getElementById('app').classList.toggle('onboarding-active',active);
}
function updateCoParentPreview(){
  const preview=document.getElementById('setup-co-parent-label-preview');
  if(preview)preview.textContent=cleanName(document.getElementById('setup-co-parent')?.value)||DEFAULT_CONFIG.coParentLabel;
}
function isValidEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
function validateSetup(showErrors=setupValidationAttempted){
  const onboarding=document.getElementById('s-setup').classList.contains('onboarding-mode');
  const nameInput=document.getElementById('setup-current-parent');
  const emailInput=document.getElementById('setup-email');
  const nameField=nameInput.closest('.setup-field');
  const emailField=emailInput.closest('.setup-field');
  const nameValid=!!cleanName(nameInput.value);
  const emailValid=isValidEmail(emailInput.value);
  const termsValid=!onboarding||document.getElementById('setup-terms').checked;
  const childInputs=[...document.querySelectorAll('.setup-child-input')];
  const childValidity=childInputs.map(input=>!!cleanName(input.value));
  const childrenValid=childInputs.length>0&&childValidity.every(Boolean);
  nameField.classList.toggle('invalid',showErrors&&!nameValid);
  emailField.classList.toggle('invalid',showErrors&&!emailValid);
  nameInput.setAttribute('aria-invalid',String(showErrors&&!nameValid));
  emailInput.setAttribute('aria-invalid',String(showErrors&&!emailValid));
  const termsField=document.getElementById('setup-terms-field');
  termsField.classList.toggle('invalid',showErrors&&!termsValid);
  childInputs.forEach((input,idx)=>{
    const control=input.closest('.setup-child-row');
    const invalid=showErrors&&!childValidity[idx];
    if(control)control.classList.toggle('invalid',invalid);
    input.setAttribute('aria-invalid',String(invalid));
  });
  const valid=nameValid&&emailValid&&childrenValid&&termsValid;
  const button=document.getElementById('setup-continue');
  button.classList.toggle('is-disabled',!valid);
  button.dataset.valid=String(valid);
  document.getElementById('setup-alert').classList.toggle('show',showErrors&&!valid);
  // Show a gentle hint about what's still needed
  const hint=document.getElementById('setup-progress-hint');
  if(hint&&!valid){
    const missing=[];
    if(!nameValid)missing.push('your name');
    if(!childrenValid)missing.push('at least one child');
    if(!emailValid)missing.push('your email');
    if(!termsValid)missing.push('terms acceptance');
    hint.textContent=missing.length?'Still needed: '+missing.join(', '):'';
    hint.style.display=missing.length?'block':'none';
  } else if(hint){hint.style.display='none';}
  return valid;
}
function handleSetupInput(){validateSetup(setupValidationAttempted)}
function saveSetup(){
  setupValidationAttempted=true;
  if(!validateSetup(true)){
    // Scroll to first invalid field so user knows what to fix
    const firstInvalid=document.querySelector('.setup-field.invalid, .setup-terms.invalid');
    if(firstInvalid)firstInvalid.scrollIntoView({behavior:'smooth',block:'center'});
    else document.getElementById('setup-alert').scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  const children=childFieldValues();
  const activityIds=getActivityIdsFromSetup();
  saveConfig({
    currentParentLabel:cleanName(document.getElementById('setup-current-parent').value)||DEFAULT_CONFIG.currentParentLabel,
    coParentLabel:cleanName(document.getElementById('setup-co-parent').value)||DEFAULT_CONFIG.coParentLabel,
    email:document.getElementById('setup-email').value.trim(),
    children,
    activityIds,
    purpose:document.getElementById('setup-purpose')?.value||APP_CONFIG.purpose,
    termsAccepted:APP_CONFIG.termsAccepted||document.getElementById('setup-terms').checked,
  });
  setOnboardingMode(false);
  renderConfigurableUi();
  initHome();
  show('s-home');
}
function skipSetup(){saveConfig(DEFAULT_CONFIG);setOnboardingMode(false);renderConfigurableUi();initHome();show('s-home')}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function pad(n){return String(n).padStart(2,'0')}
function fmtDate(ds){const[y,m,d]=ds.split('-');return MONTHS[parseInt(m)-1]+' '+parseInt(d)+', '+y}
function fmtShort(ds){const[y,m,d]=ds.split('-');return MONTHS[parseInt(m)-1].slice(0,3)+' '+parseInt(d)+', '+y}
function fmtLoggedAt(iso){
  if(!iso)return'';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return'';
  const day=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}).replace(',','');
  const time=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).toLowerCase().replace(/\s/g,'');
  return'Logged: '+day+' at '+time;
}
function changeContextBadges(e){
  if(e.changeAgreed===null||e.changeAgreed===undefined)return'';
  return`<span class="context-badge ${e.changeAgreed?'badge-agreed':'badge-unexpected'}">${e.changeAgreed?'Agreed in advance':'Not agreed in advance'}</span>`+(e.changePressured===null||e.changePressured===undefined?'':` <span class="context-badge ${e.changePressured?'badge-pressured':'badge-agreed'}">${e.changePressured?'Felt pressured':'No pressure noted'}</span>`);
}
function changeContextReportLines(e){
  const lines=[];
  if(e.changeAgreed!==null&&e.changeAgreed!==undefined)lines.push('CHANGE AGREED IN ADVANCE: '+(e.changeAgreed?'Yes':'No'));
  if(e.changePressured!==null&&e.changePressured!==undefined)lines.push('FELT PRESSURED: '+(e.changePressured?'Yes':'No'));
  return lines;
}
function entryMetaHtml(e,{fullAttachment=false}={}){
  const parts=[];
  const logged=fmtLoggedAt(e.loggedAt);
  if(logged)parts.push(`<div class="entry-meta-note">${logged}</div>`);
  const badges=changeContextBadges(e);
  if(badges)parts.push(`<div class="entry-badge-row">${badges}</div>`);
  if(e.attachment)parts.push(fullAttachment?`<div class="entry-attachment-full"><img src="${e.attachment.dataUrl}" alt="Attached screenshot"></div>`:'<div class="attach-indicator">Screenshot attached</div>');
  return parts.join('');
}
function reportMetaLines(e){
  const lines=[];
  if(e.loggedAt)lines.push('LOGGED: '+new Date(e.loggedAt).toLocaleString());
  lines.push(...changeContextReportLines(e));
  if(e.attachment)lines.push('ATTACHMENT: Screenshot attached in app');
  return lines;
}

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
  BACKFILL_DATE=yesterdayStr();
  startCheckin();
}
function startBackfillForDate(ds){
  if(isLockedDate(ds)&&ds!==yesterdayStr())return;
  if(ds!==yesterdayStr())return;
  localStorage.setItem('missed_dismissed_'+todayStr(),'1');
  BACKFILL_DATE=ds;
  startCheckin();
}
// ── END MISSED DAY LOGIC ──────────────────────────────────────


// ── ENTRY LOCK — entries older than yesterday are read-only ────
function isLockedDate(ds){
  return ds < yesterdayStr();
}
function isLockedEntry(ds){
  const entries=getEntries();
  return !!(entries[ds] && isLockedDate(ds));
}
// ── END ENTRY LOCK ─────────────────────────────────────────────
function getEntries(){try{const r=localStorage.getItem('familylog_entries');return r?JSON.parse(r):{}}catch(e){return{}}}
function putEntries(e){try{localStorage.setItem('familylog_entries',JSON.stringify(e));try{sessionStorage.setItem('familylog_backup',JSON.stringify(e))}catch(ex){}}catch(e){}}

const CHECKIN_FLOW_SCREENS=new Set([
  's-week','s-dad-mode','s-allkids','s-whichkids','s-absent','s-mom-helped-kids',
  's-mom-helped-activity','s-dad-wk-mom-had','s-mom-mode','s-mom-easy',
  's-mom-helped-kids2','s-helped-activity','s-mom-dad-had','s-kids-confirm',
  's-change-context','s-diary','s-other-diary','s-review'
]);
let screenStack=[];

function show(id,direction){
  const next=document.getElementById(id);
  if(!next)return;
  const current=document.querySelector('.screen.active');
  const currentId=current?.id||null;
  let navDirection=direction;
  const isCheckinTransition=currentId&&CHECKIN_FLOW_SCREENS.has(currentId)&&CHECKIN_FLOW_SCREENS.has(id);

  if(!navDirection&&isCheckinTransition){
    const existingIdx=screenStack.lastIndexOf(id);
    navDirection=existingIdx>=0?'back':'forward';
  }
  if(currentId!==id){
    const existingIdx=screenStack.lastIndexOf(id);
    if(existingIdx>=0)screenStack=screenStack.slice(0,existingIdx+1);
    else screenStack.push(id);
  }

  document.querySelectorAll('.screen.screen-leave,.screen-enter').forEach(s=>{
    s.classList.remove('screen-leave','screen-leave-forward','screen-leave-back','screen-enter','screen-enter-forward','screen-enter-back');
  });

  if(isCheckinTransition&&current&&current!==next&&navDirection){
    const enterClass=navDirection==='back'?'screen-enter-back':'screen-enter-forward';
    const leaveClass=navDirection==='back'?'screen-leave-back':'screen-leave-forward';
    current.classList.add('screen-leave',leaveClass);
    next.classList.add('active','screen-enter',enterClass);
    window.setTimeout(()=>{
      current.classList.remove('active','screen-leave',leaveClass);
      next.classList.remove('screen-enter',enterClass);
    },320);
  }else{
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    next.classList.add('active');
  }
  window.scrollTo(0,0);
}
function setProg(id,step,total){const el=document.getElementById(id);if(!el)return;el.innerHTML='';for(let i=0;i<total;i++){const d=document.createElement('div');d.className='pd'+(i<step?' done':'')+(i===step?' active':'');el.appendChild(d)}}


// ── MULTI-STEP ONBOARDING ─────────────────────────────────────────
const OB_STATE = {name:'', coparent:'', kids:[], activities:[], email:'', terms:false};

function obNext(targetScreen){
  const activeScreen=document.querySelector('.screen.active');
  if(activeScreen&&activeScreen.id==='s-ob-name'){
    const nameInput=document.getElementById('ob-name');
    if(nameInput){
      nameInput.value=nameInput.value.trim();
      obValidateStep('s-ob-name');
      if(!nameInput.value)return;
    }
  }
  if(activeScreen&&activeScreen.id==='s-ob-coparent'){
    const coparentInput=document.getElementById('ob-coparent');
    if(coparentInput)coparentInput.value=coparentInput.value.trim();
  }
  if(activeScreen&&activeScreen.id==='s-ob-kids'){
    const kidInputs=[...document.querySelectorAll('.ob-kid-input')];
    kidInputs.forEach(input=>{input.value=input.value.trim();});
    obValidateStep('s-ob-kids');
    if(!kidInputs.some(input=>input.value))return;
  }
  show(targetScreen);
  window.scrollTo(0,0);
  // Echo name on co-parent screen
  if(targetScreen==='s-ob-coparent'){
    const nameEl=document.getElementById('ob-name-echo');
    if(nameEl){
      const name=document.getElementById('ob-name').value.trim();
      nameEl.textContent=name||'there';
    }
  }
  // Echo kids on how-many screen (micro-celebration)
  if(targetScreen==='s-ob-activities') obRenderActivities();
}
function obBack(targetScreen){
  show(targetScreen);
  window.scrollTo(0,0);
}
function obSkip(){
  saveConfig(DEFAULT_CONFIG);
  setOnboardingMode(false);
  renderConfigurableUi();
  initHome();
  show('s-home');
}

function obSetExample(inputId, val){
  const el=document.getElementById(inputId);
  if(el){el.value=val;obValidateStep(el.closest('.screen').id);}
}

function obValidateStep(screenId){
  if(screenId==='s-ob-name'){
    const val=document.getElementById('ob-name').value.trim();
    const btn=document.getElementById('btn-ob-name');
    if(btn)btn.classList.toggle('ob-disabled',!val);
  }
  if(screenId==='s-ob-kids'){
    const inputs=[...document.querySelectorAll('.ob-kid-input')];
    const valid=inputs.length>0&&inputs.some(i=>i.value.trim());
    const btn=document.getElementById('btn-ob-kids');
    if(btn)btn.classList.toggle('ob-disabled',!valid);
  }
  if(screenId==='s-ob-finish'){
    const email=document.getElementById('ob-email').value.trim();
    const terms=document.getElementById('ob-terms').checked;
    const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const valid=emailOk&&terms;
    const btn=document.getElementById('btn-ob-finish');
    if(btn)btn.classList.toggle('ob-disabled',!valid);
  }
}

function obSetKidCount(n){
  // Highlight selected button
  document.querySelectorAll('.ob-count-btn').forEach(b=>b.classList.remove('selected'));
  event.target.classList.add('selected');

  // Build kid name fields
  const list=document.getElementById('ob-kids-list');
  list.innerHTML='';
  const count=(n===6)?3:n; // for 6+ start with 3 fields
  for(let i=0;i<count;i++) obAddKidField(i,count);

  // Update question
  const q=document.getElementById('ob-kids-q');
  if(q)q.textContent='What are your kids’ first names?';

  // Auto-advance after short delay (feels snappy)
  setTimeout(()=>{
    obNext('s-ob-kids');
    // Focus first input
    const first=document.querySelector('#ob-kids-list .ob-kid-input');
    if(first)first.focus();
  },250);
}

function obAddKidField(idx, total){
  const list=document.getElementById('ob-kids-list');
  const row=document.createElement('div');
  row.className='ob-kid-row';
  const placeholder='Child’s first name';
  row.innerHTML=`<input class="ob-kid-input" type="text" placeholder="${placeholder}" oninput="obValidateStep('s-ob-kids')">`;
  list.appendChild(row);
}

function obAddKid(){
  const list=document.getElementById('ob-kids-list');
  const idx=list.children.length;
  obAddKidField(idx, idx+1);
  const inputs=list.querySelectorAll('.ob-kid-input');
  if(inputs.length)inputs[inputs.length-1].focus();
  obValidateStep('s-ob-kids');
}

function obRenderActivities(){
  const container=document.getElementById('ob-activity-list');
  if(!container||container.children.length>0)return; // already rendered
  DEFAULT_ACTIVITIES.forEach(act=>{
    const chip=document.createElement('button');
    chip.type='button';
    chip.className='ob-activity-chip active';
    chip.dataset.actId=act.id;
    chip.textContent=act.label;
    chip.onclick=()=>chip.classList.toggle('active');
    container.appendChild(chip);
  });
}

function obFinish(){
  const email=document.getElementById('ob-email').value.trim();
  const terms=document.getElementById('ob-terms').checked;
  const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const errEl=document.getElementById('ob-finish-error');
  if(!emailOk||!terms){
    if(errEl)errEl.style.display='block';
    return;
  }
  if(errEl)errEl.style.display='none';

  // Collect all state
  const name=document.getElementById('ob-name').value.trim()||DEFAULT_CONFIG.currentParentLabel;
  const coparent=document.getElementById('ob-coparent').value.trim()||DEFAULT_CONFIG.coParentLabel;
  const kids=[...document.querySelectorAll('.ob-kid-input')].map(i=>i.value.trim()).filter(Boolean);
  const defaultActIds=DEFAULT_ACTIVITIES.map(a=>a.id);

  saveConfig({
    currentParentLabel:name,
    coParentLabel:coparent,
    children:kids.length?kids:DEFAULT_CONFIG.children,
    activityIds:defaultActIds,
    email,
    termsAccepted:true,
    purpose:'',
  });
  setOnboardingMode(false);
  renderConfigurableUi();
  initHome();
  show('s-home');
}

// Kick off onboarding — init first kid row
function initOnboarding(){
  const list=document.getElementById('ob-kids-list');
  if(list&&!list.children.length) obAddKid();
}
// ── END MULTI-STEP ONBOARDING ─────────────────────────────────────


// ── 48-HOUR ACTIVITY PROMPT ──────────────────────────────────────
function checkActivityPrompt(){
  if(localStorage.getItem('activity_prompt_dismissed'))return;
  const entries=getEntries();
  const dates=Object.keys(entries).sort();
  if(dates.length<2)return; // need at least 2 days
  const first=new Date(dates[0]);
  const now=new Date();
  const hours=(now-first)/(1000*60*60);
  if(hours>=48){
    document.getElementById('activity-prompt').style.display='block';
  }
}
function dismissActivityPrompt(){
  document.getElementById('activity-prompt').style.display='none';
  localStorage.setItem('activity_prompt_dismissed','1');
}
// ── END 48-HOUR PROMPT ───────────────────────────────────────────

// ── WELCOME SCREEN ────────────────────────────────────
function startWelcome(){initOnboarding();show('s-ob-welcome');}
function skipWelcome(){obSkip();}
function obShowPromises(){show('s-ob-promises');}
// ── END WELCOME ───────────────────────────────────────
function showSetup(){setOnboardingMode(false);initSetupForm();show('s-setup')}
function resetWeekCards(){
  const classes={dad:'checkin-decision-card planned',mom:'checkin-decision-card change',other:'checkin-decision-card special'};
  Object.entries(classes).forEach(([w,cls])=>{const el=document.getElementById('wk-'+w);if(el)el.className=cls});
}

function initHome(){
  markMissedDays();
  checkMissedPrompt();
  checkActivityPrompt();
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
  if(e.week==='not-logged')return e.intentional?'Skipped intentionally':'Nothing logged';
  if(e.week==='other')return'Special day';
  if(e.dadMode==='mom-had')return"Your week · Kids at "+coParentPoss()+': '+(e.momHadKidsOnDadWeek||[]).join(', ');
  if(e.dadMode==='dad-helped-mom')return'Your week · '+coParent()+' helped: '+(e.momHadKidsOnDadWeek||[]).join(', ');
  if(e.momMode==='easy')return coParent()+' had kids';
  if(e.momMode==='helped')return'You helped: '+(e.helpedKids||[]).join(', ');
  if(e.momMode==='dad-had')return'You had: '+(e.dadHadKids||[]).join(', ');
  const n=(e.kidsWithDad||[]).length;return n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')+' home';
}

function startCheckin(){
  S={week:null,dadMode:null,momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'',attachment:null,changeAgreed:null,changePressured:null,changeContextNext:null,changeContextBack:null};
  easyOpts=[];diaryOrigin='';
  ['diary','other'].forEach(removeAttachment);
  resetWeekCards();
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
  resetWeekCards();
  document.getElementById('wk-'+w).classList.add(w==='mom'?'sel-mom':w==='other'?'sel-other':'sel');
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
  if(mode==='normal')setTimeout(()=>{goToAllKidsStep('s-dad-mode')},250);
  else if(mode==='dad-helped-mom')setTimeout(()=>{KIDS.forEach(k=>kidBtn('mhk',k).className='kid-btn');S.momHelpedOnDadWeek={};S.momHadKidsOnDadWeek=[];document.getElementById('mom-helped-next').disabled=true;updateMomHelpedSummary();setProg('prog-mom-helped-kids',1,5);show('s-mom-helped-kids')},250);
  else setTimeout(()=>{KIDS.forEach(k=>kidBtn('dwm',k).className='kid-btn');document.getElementById('dwm-all').className='kid-btn';S.momHadKidsOnDadWeek=[];updateDadWkMomSummary();document.getElementById('dwm-next').disabled=true;setProg('prog-dad-wk-mom-had',2,5);show('s-dad-wk-mom-had')},250);
}

function toggleMomHelpedKid(name){
  const btn=kidBtn('mhk',name),idx=S.momHadKidsOnDadWeek.indexOf(name);
  if(idx>=0){S.momHadKidsOnDadWeek.splice(idx,1);btn.classList.remove('with-mom')}else{S.momHadKidsOnDadWeek.push(name);btn.classList.add('with-mom')}
  document.getElementById('mom-helped-next').disabled=S.momHadKidsOnDadWeek.length===0;updateMomHelpedSummary();
}
function updateMomHelpedSummary(){const el=document.getElementById('mom-helped-summary');if(!S.momHadKidsOnDadWeek.length){el.textContent='Tap the kids '+coParent()+' was involved with';return}el.innerHTML='<strong style="color:#993c1d">'+coParent()+' helped with:</strong> '+S.momHadKidsOnDadWeek.join(', ')}
function startMomHelpedLoop(){
  momHelpedQueue=[...S.momHadKidsOnDadWeek];momHelpedIdx=0;
  S._afterMomHelped=true;
  // Ask kid location first before activities
  goToAllKidsStep('s-mom-helped-kids');
}
function startMomHelpedActivities(){
  momHelpedIdx=0;showMomHelpedStep();
}
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
  setProg('prog-mom-helped-activity',2,5);show('s-mom-helped-activity');
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
  else{goToAllKidsStep('s-mom-helped-activity')}
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
function goDadWkMomDiary(){showChangeContext('s-dad-wk-mom-had','dad-to-mom')}
function goToDadWkViaContext(){goDadWkMomDiary()}

function goToAllKidsStep(backTarget){
  setProg('prog-allkids',1,4);
  if(KIDS.length===1){
    setAllKids(true,backTarget||'s-dad-mode');
    return;
  }
  show('s-allkids');
}

function setAllKids(all,confirmBackTarget){
  document.getElementById('ak-yes').classList.toggle('sel',all);document.getElementById('ak-no').classList.toggle('sel',!all);
  if(all){S.kidsWithDad=[...KIDS];setTimeout(()=>{
    if(S._afterMomHelped){S._afterMomHelped=false;startMomHelpedActivities();}
    else{showKidsConfirm(confirmBackTarget||'s-allkids');}
  },200)}
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
  if(!absentQueue.length){
    if(S._afterMomHelped){S._afterMomHelped=false;startMomHelpedActivities();return;}
    showKidsConfirm('s-whichkids');return;
  }
  showAbsentStep();
}
function showAbsentStep(){
  const kid=absentQueue[absentIdx],total=absentQueue.length;
  document.getElementById('absent-step-lbl').textContent='Kid '+(absentIdx+1)+' of '+total+' not home tonight';
  document.getElementById('absent-name').textContent=kid;document.getElementById('absent-avatar').textContent=kid[0];
  document.getElementById('absent-q').textContent='Where is '+kid+' tonight?';
  const saved=S.absentData[kid];
  document.getElementById('absent-note-input').value=saved?saved.note:'';
  document.querySelectorAll('#absent-opts .opt').forEach(o=>{
    o.classList.remove('sel');
    if(saved&&o.dataset.loc===saved.location)o.classList.add('sel');
  });
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
  else{
    if(S._afterMomHelped){S._afterMomHelped=false;startMomHelpedActivities();}
    else{showKidsConfirm('s-absent');}
  }
}
function goBackFromAbsent(){if(absentIdx>0){absentIdx--;showAbsentStep()}else show('s-whichkids')}
function goBackFromDiary(){show(diaryOrigin||'s-week')}

// ── KIDS CONFIRM SCREEN ───────────────────────────────────────
function showKidsConfirm(backTarget, context){
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
        <div style="font-size:11px;font-weight:500;color:#534AB7;line-height:1.3" data-kid-with="dad">🏠 With you<br>tonight</div>`;
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
  // Context-aware language — 'helped' means daytime, not overnight
  const isDay=(context==='helped');
  const qEl=document.getElementById('kids-confirm-q');
  const subEl=document.getElementById('kids-confirm-sub');
  if(qEl)qEl.textContent=isDay?'Does this look right?':'Everyone accounted for tonight?';
  if(subEl)subEl.textContent=isDay?'Confirm who you helped with today':'Confirm where each kid is — then continue to your diary';
  // Also update "With you tonight" label for day-only context
  list.querySelectorAll('[data-kid-with]').forEach(el=>{
    if(el.dataset.kidWith==='dad') el.textContent=isDay?'You helped today':'With you tonight';
  });
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
  if(key==='none'){easyOpts=['none'];document.querySelectorAll('#easy-opts .opt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');document.getElementById('easy-review-btn').disabled=false;return}
  document.querySelector('#easy-opts .opt[onclick*="none"]').classList.remove('sel');easyOpts=easyOpts.filter(o=>o!=='none');
  el.classList.toggle('sel');const i=easyOpts.indexOf(key);if(i>=0)easyOpts.splice(i,1);else easyOpts.push(key);
  document.getElementById('easy-review-btn').disabled=easyOpts.length===0;
}
function setMomMode(mode){
  S.momMode=mode;
  document.querySelectorAll('#s-mom-mode .scene-card').forEach(c=>c.className='scene-card');
  const idMap={easy:'ft-easy',helped:'ft-helped','dad-had':'ft-dad'};
  document.getElementById(idMap[mode]).classList.add(mode==='dad-had'?'sel-warn':'sel-dad');
  if(mode==='easy')setTimeout(()=>{setProg('prog-mom-easy',1,3);document.querySelectorAll('#easy-opts .opt').forEach(o=>o.classList.remove('sel'));easyOpts=[];document.getElementById('easy-note').value='';document.getElementById('easy-review-btn').disabled=true;show('s-mom-easy')},250);
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
  setProg('prog-helped-activity',2,3);show('s-helped-activity');
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
  else{showKidsConfirm('s-mom-helped-activity','helped')}
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
function goDadHadDiary(){showChangeContext('s-mom-dad-had','mom-to-dad')}
function goToDadHadViaContext(){goDadHadDiary()}

function showChangeContext(backTarget,kind){
  S.changeContextBack=backTarget;S.changeContextNext=kind;S.changeAgreed=null;S.changePressured=null;
  document.querySelectorAll('#s-change-context .change-yn-btn').forEach(b=>b.className='change-yn-btn');
  document.getElementById('pressure-section').style.display='none';
  document.getElementById('change-context-next').disabled=true;
  const dadToMom=kind==='dad-to-mom';
  document.getElementById('change-context-title').textContent=dadToMom?'Kids are with '+coParent():'Kids are with '+currentParent();
  document.getElementById('change-context-sub').textContent=dadToMom?'Your scheduled day changed.':'Their scheduled day changed.';
  setProg('prog-change-context',2,4);show('s-change-context');
}
function goBackFromChangeContext(){show(S.changeContextBack||'s-week')}
function setAgreed(value){
  S.changeAgreed=value;S.changePressured=null;
  document.getElementById('agreed-yes').className='change-yn-btn'+(value?' sel-yes':'');
  document.getElementById('agreed-no').className='change-yn-btn'+(!value?' sel-no':'');
  document.getElementById('pressure-yes').className='change-yn-btn';
  document.getElementById('pressure-no').className='change-yn-btn';
  document.getElementById('pressure-section').style.display=value?'block':'none';
  document.getElementById('change-context-next').disabled=value;
}
function setPressure(value){
  S.changePressured=value;
  document.getElementById('pressure-yes').className='change-yn-btn'+(value?' sel-pressure':'');
  document.getElementById('pressure-no').className='change-yn-btn'+(!value?' sel-ok':'');
  document.getElementById('change-context-next').disabled=false;
}
function goFromChangeContext(){
  diaryOrigin='s-change-context';
  document.getElementById('diary-q').textContent='Add a note about tonight';
  document.getElementById('diary-sub').textContent=S.changeContextNext==='dad-to-mom'?'Why did the kids end up at '+coParentPoss()+' during your day?':'Why did you end up with the kids during '+coParentPoss()+' day?';
  document.getElementById('diary-input').value=S.diary||'';
  document.getElementById('diary-next-btn').textContent='Review & save →';
  setProg('prog-diary',3,4);show('s-diary');
}

function handleAttachment(input,origin){
  const file=input.files&&input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{S.attachment={name:file.name,type:file.type,dataUrl:reader.result};renderAttachment(origin)};
  reader.readAsDataURL(file);
}
function renderAttachment(origin){
  const img=document.getElementById(origin+'-attach-img'),preview=document.getElementById(origin+'-attach-preview'),btn=document.getElementById(origin+'-attach-btn');
  if(!img||!preview||!btn)return;
  if(S.attachment){img.src=S.attachment.dataUrl;preview.style.display='block';btn.style.display='none'}
  else{img.src='';preview.style.display='none';btn.style.display='inline-flex'}
}
function removeAttachment(origin){
  S.attachment=null;
  const input=document.getElementById(origin+'-attach-input');if(input)input.value='';
  renderAttachment(origin);
}

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
  const schedule=[],kids=[],notes=[],context=[];
  const weekLabel=S.week==='dad'?currentParentPoss()+' scheduled day':S.week==='mom'?coParentPoss()+' scheduled day':'Special / other day';
  const weekTone=S.week==='dad'?'rt-dad':S.week==='mom'?'rt-mom':'rt-other';
  schedule.push(reviewSection('Day type',reviewChips([{label:weekLabel,cls:weekTone}]),S.week==='dad'?'s-dad-mode':S.week==='mom'?'s-mom-mode':'s-week'));

  if(S.week==='other'){
    notes.push(reviewSection('Exception note',reviewNote(S.diary||'No note added.'),'s-other-diary'));
  } else if(S.week==='dad'){
    // Dad mode
    const modeLabel=S.dadMode==='normal'?'I had the kids':S.dadMode==='dad-helped-mom'?coParent()+' helped out':'Kids ended up at '+coParentPoss();
    schedule.push(reviewSection('Situation',reviewChips([{label:modeLabel,cls:S.dadMode==='mom-had'?'rt-warn':'rt-dad'}]),'s-dad-mode'));
    if(S.dadMode==='normal'||S.dadMode==='dad-helped-mom'){
      const n=S.kidsWithDad.length;
      const kidsStr=n===KIDS.length?kidsListLabel():n===0?'None — all at '+coParentPoss():S.kidsWithDad.join(', ');
      kids.push(reviewSection('With you',reviewLine('Sleeping at your place',kidsStr),'s-allkids'));
      const absent=KIDS.filter(k=>!S.kidsWithDad.includes(k));
      if(absent.length){
        const abRows=absent.map(k=>{const d=S.absentData[k];return reviewLine(k,d?(LOC_LBL[d.location]||d.location)+(d.note?' — '+d.note:''):'Not set')}).join('');
        kids.push(reviewSection('Not home tonight',abRows,'s-whichkids'));
      }
      if(S.dadMode==='dad-helped-mom'&&S.momHadKidsOnDadWeek.length){
        const mhRows=S.momHadKidsOnDadWeek.map(k=>{const v=S.momHelpedOnDadWeek[k];return reviewLine(k,v?(v.acts.map(actLabel).join(', '))+(v.note?' — '+v.note:''):'Not set')}).join('');
        kids.push(reviewSection(coParentPoss()+" help",mhRows,'s-mom-helped-kids'));
      }
    }
    if(S.dadMode==='mom-had'){
      kids.push(reviewSection('Kids at '+coParentPoss(),reviewLine('Kids',S.momHadKidsOnDadWeek.join(', ')||'Not set'),'s-dad-wk-mom-had'));
    }
    notes.push(reviewSection('Diary note',reviewNote(S.diary||'No diary note added.'),'s-diary'));
  } else if(S.week==='mom'){
    const modeLabel=S.momMode==='easy'?coParent()+' had the kids':S.momMode==='helped'?'I helped with some kids':'Kids ended up with me';
    schedule.push(reviewSection('Situation',reviewChips([{label:modeLabel,cls:S.momMode==='dad-had'?'rt-warn':S.momMode==='easy'?'rt-mom':'rt-dad'}]),'s-mom-mode'));
    if(S.momMode==='easy'){
      const inv=S.momOpts.filter(o=>o!=='none');
      kids.push(reviewSection('Your involvement',reviewLine('Today',inv.length?inv.join(', '):'None — completely their day'),'s-mom-easy'));
    }
    if(S.momMode==='helped'&&S.helpedKids.length){
      const hRows=S.helpedKids.map(k=>{const v=S.helpedData[k];return reviewLine(k,v?(v.acts.map(actLabel).join(', '))+(v.note?' — '+v.note:''):'Not set')}).join('');
      kids.push(reviewSection('You helped with',hRows,'s-mom-helped-kids2'));
    }
    if(S.momMode==='dad-had'){
      kids.push(reviewSection('Kids with you',reviewLine('Kids',S.dadHadKids.join(', ')||'Not set'),'s-mom-dad-had'));
    }
    notes.push(reviewSection('Diary note',reviewNote(S.diary||'No diary note added.'),'s-diary'));
  }
  if(S.changeAgreed!==null){
    const badges=`<span class="context-badge ${S.changeAgreed?'badge-agreed':'badge-unexpected'}">${S.changeAgreed?'Agreed in advance':'Not agreed in advance'}</span>`+(S.changePressured===null?'':` <span class="context-badge ${S.changePressured?'badge-pressured':'badge-agreed'}">${S.changePressured?'Felt pressured':'No pressure noted'}</span>`);
    context.push(reviewSection('Agreement',`<div class="review-badge-row">${badges}</div>`,'s-change-context'));
  }
  if(S.attachment)notes.push(reviewSection('Attachment',`<div class="review-row"><img class="attach-thumb" src="${S.attachment.dataUrl}" alt="Attached screenshot"><span class="review-val">Screenshot attached</span></div>`,'s-diary'));

  rc.innerHTML=[
    reviewReceiptHero(),
    reviewGroup('Schedule',schedule),
    reviewGroup('Kids & involvement',kids),
    context.length?reviewGroup('Change context',context):'',
    reviewGroup('Notes',notes),
  ].join('');
  document.getElementById('review-timestamp-note').textContent='This entry will be timestamped at '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).toLowerCase()+' and becomes read-only after 24 hours.';
}

function reviewSection(label,content,editTarget){
  return`<section class="review-section">
    <div class="review-section-head">
      <div class="review-label">${label}</div>
      <button class="review-edit-btn" onclick="goEditFromReview('${editTarget}')">Edit</button>
    </div>
    <div class="review-card">${content}</div>
  </section>`;
}

function reviewGroup(title,sections){
  if(!sections.length)return'';
  return`<section class="review-group"><div class="review-group-title">${title}</div>${sections.join('')}</section>`;
}
function reviewReceiptHero(){
  return`<div class="review-receipt">
    <div class="review-receipt-mark">✓</div>
    <div><div class="review-receipt-title">Ready to log</div><div class="review-receipt-sub">Give this a quick scan before it joins your custody record.</div></div>
  </div>`;
}
function reviewLine(key,val){return`<div class="review-row"><span class="review-key">${escHtml(key)}</span><span class="review-val">${escHtml(val)}</span></div>`}
function reviewNote(text){return`<div class="review-note">"${escHtml(text)}"</div>`}
function reviewChips(chips){return`<div class="review-chip-row">${chips.map(c=>`<span class="review-tag ${c.cls||''}">${escHtml(c.label)}</span>`).join('')}</div>`}
function actLabel(a){return ACT_LBL[a]||String(a).replace(/-/g,' ')}
function escHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

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
    diary:S.diary,attachment:S.attachment,changeAgreed:S.changeAgreed,changePressured:S.changePressured,loggedAt:new Date().toISOString()};
  const saveDate=BACKFILL_DATE||todayStr();BACKFILL_DATE=null;
  if(isLockedEntry(saveDate)){alert('This entry is locked. Entries cannot be changed after 24 hours.');return;}
  entries[saveDate]=e;putEntries(entries);
  let ring='✅',summary='';
  if(S.week==='other'){ring='✨';summary='Special day logged'}
  else if(S.dadMode==='mom-had'){ring='🏡';summary="Your week · Kids at "+coParentPoss()+"\n"+S.momHadKidsOnDadWeek.join(', ')}
  else if(S.dadMode==='dad-helped-mom'){summary="Your week · "+coParent()+" helped: "+S.momHadKidsOnDadWeek.join(', ')}
  else if(S.momMode==='easy'){ring='✅';summary=coParentPoss()+" week · "+coParent()+" had the kids"}
  else if(S.momMode==='helped'){ring='🤝';summary=coParentPoss()+" week · You helped: "+S.helpedKids.join(', ')}
  else if(S.momMode==='dad-had'){ring='⚠️';summary=coParentPoss()+" week · You had: "+S.dadHadKids.join(', ')}
  else{const n=e.kidsWithDad.length;summary=(S.week==='dad'?'Your week · ':'')+(n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':e.kidsWithDad.join(', ')+' home')}
  document.getElementById('saved-ring').textContent=ring;
  document.getElementById('saved-summary').textContent=summary;
  renderSavedReceipt(e,saveDate);
  show('s-saved');
}

function renderSavedReceipt(e,saveDate){
  const dateEl=document.getElementById('saved-date');
  const receiptEl=document.getElementById('saved-receipt');
  if(dateEl)dateEl.textContent=fmtDate(saveDate);
  if(!receiptEl)return;
  const rows=[
    ['Logged',new Date(e.loggedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).toLowerCase()],
    ['Entry type',savedEntryType(e)],
    ['Kids',savedKidsLine(e)],
    ['Status','Read-only after 24 hours'],
  ];
  if(e.diary)rows.splice(3,0,['Note','Added']);
  if(e.attachment)rows.splice(3,0,['Attachment','Screenshot included']);
  receiptEl.innerHTML=rows.map(([key,val])=>`<div class="saved-receipt-row"><span>${escHtml(key)}</span><strong>${escHtml(val)}</strong></div>`).join('');
}
function savedEntryType(e){
  if(e.week==='other')return'Special day';
  if(e.dadMode==='mom-had')return'Your day changed';
  if(e.dadMode==='dad-helped-mom')return coParent()+' helped';
  if(e.momMode==='easy')return coParentPoss()+' day';
  if(e.momMode==='helped')return'You helped';
  if(e.momMode==='dad-had')return'Kids with you';
  return currentParentPoss()+' day';
}
function savedKidsLine(e){
  if(e.week==='other')return'Exception note';
  if(e.dadMode==='mom-had')return(e.momHadKidsOnDadWeek||[]).join(', ')||'Not specified';
  if(e.momMode==='dad-had')return(e.dadHadKids||[]).join(', ')||'Not specified';
  if(e.momMode==='helped')return(e.helpedKids||[]).join(', ')||'Not specified';
  const kids=e.kidsWithDad||[];
  if(kids.length===KIDS.length)return kidsCountLabel();
  if(kids.length===0)return'No kids with you';
  return kids.join(', ');
}
function goBackFromSaved(){goBackFromReview()}

// CALENDAR
function showCal(){
  calM=new Date().getMonth();calY=new Date().getFullYear();
  // Init trends month to current if not already set
  trendsM=trendsM!==undefined?trendsM:new Date().getMonth();
  trendsY=trendsY!==undefined?trendsY:new Date().getFullYear();
  const nav=document.getElementById('trends-month-nav');
  if(nav)nav.style.display='flex';
  if(!selectedCalDate)selectedCalDate=todayStr();
  renderCal();show('s-cal');document.getElementById('stats-lbl').textContent=MONTHS[calM]+' '+calY;renderStats()
}
function renderCal(){
  const entries=getEntries();
  document.getElementById('cal-title').textContent=MONTHS[calM]+' '+calY;
  const grid=document.getElementById('cal-grid');grid.innerHTML='';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d=>{const e=document.createElement('div');e.className='cal-lbl';e.textContent=d;grid.appendChild(e)});
  const first=new Date(calY,calM,1).getDay(),days=new Date(calY,calM+1,0).getDate(),today=todayStr();
  for(let i=0;i<first;i++)grid.appendChild(document.createElement('div'));
  for(let d=1;d<=days;d++){
    const ds=calY+'-'+pad(calM+1)+'-'+pad(d),e=entries[ds];
    const cell=document.createElement('div');cell.className='cal-cell';
    cell.dataset.date=ds;
    const num=document.createElement('span');num.className='cal-date-num';num.textContent=d;cell.appendChild(num);
    if(e){
      let cls='mom-day';
      if(e.week==='not-logged')cls='missed';
      else if(e.week==='other')cls='special';
      else if(e.week==='dad'&&e.dadMode==='mom-had')cls='dad-day-mom-has';
      else if(e.week==='dad')cls='dad-day';
      else if(e.week==='mom'&&e.momMode==='dad-had')cls='mom-day-dad-has';
      else if(e.week==='mom')cls='mom-day';
      cell.classList.add(cls);
      cell.onclick=()=>showDetail(ds,e);
    }else{
      cell.onclick=()=>showEmptyDetail(ds);
    }
    if(ds===selectedCalDate)cell.classList.add('selected');
    if(ds===today)cell.classList.add('today');grid.appendChild(cell);
  }
}
function showEmptyDetail(ds){
  selectedCalDate=ds;renderCal();
  const el=document.getElementById('cal-detail');el.style.display='block';
  const canBackfill=ds===yesterdayStr();
  const locked=isLockedDate(ds);
  el.innerHTML=`<div class="entry-card">
    <div class="entry-date-lbl">${fmtDate(ds)} <span class="tag tag-missed">Nothing logged</span></div>
    <div class="entry-row" style="color:#666">Nothing logged for this day.</div>
    ${(canBackfill&&!locked)?`<button class="btn primary" onclick="startBackfillForDate('${ds}')" style="width:100%;margin-top:12px">Log yesterday</button>`:''}
  </div>`;
}
function showDetail(ds,e){
  selectedCalDate=ds;renderCal();
  const el=document.getElementById('cal-detail');el.style.display='block';
  let tag,body;
  if(e.week==='not-logged'){
    tag='<span class="tag tag-missed">Nothing logged</span>';
    body='<div class="entry-row" style="color:#666">Nothing logged for this day.</div>';
    el.innerHTML=`<div class="entry-card"><div class="entry-date-lbl">${fmtDate(ds)} ${tag}</div>${body}</div>`;
    return;
  }
  if(e.week==='other'){tag='<span class="tag tag-other">✨ Special</span>';body=`<div class="entry-row" style="font-style:italic;color:#666">${e.diary||'No note'}</div>`}
  else if(e.dadMode==='mom-had'){tag='<span class="tag tag-teal">Your day · Kids at '+coParentPoss()+'</span>';body=`<div class="entry-row"><strong>At ${coParentPoss()}: ${(e.momHadKidsOnDadWeek||[]).join(', ')}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.dadMode==='dad-helped-mom'){tag='<span class="tag tag-dad">Your day</span>';const n=(e.kidsWithDad||[]).length;const acts=Object.entries(e.momHelpedOnDadWeek||{}).map(([k,v])=>`<div class="entry-row" style="color:#666">${k}: ${coParent()} — ${(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')}</div>`).join('');body=`<div class="entry-row"><strong>${n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')+' home'}</strong></div>${acts}${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.momMode==='easy'){tag='<span class="tag tag-mom">'+coParentPoss()+' day</span>';body=`<div class="entry-row">${coParent()} had ${kidsCountLabel()}</div>${e.diary?`<div class="entry-row" style="color:#666;margin-top:4px">${e.diary}</div>`:''}`}
  else if(e.momMode==='helped'){tag='<span class="tag tag-mom">'+coParentPoss()+' day · You helped</span>';const acts=Object.entries(e.helpedData||{}).map(([k,v])=>`<div class="entry-row" style="color:#666">${k}: ${(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')}${v.note?' — '+v.note:''}</div>`).join('');body=`<div class="entry-row"><strong>You helped: ${(e.helpedKids||[]).join(', ')}</strong></div>${acts}${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.momMode==='dad-had'){tag='<span class="tag tag-other">'+coParentPoss()+' day · You had</span>';body=`<div class="entry-row"><strong>You had: ${(e.dadHadKids||[]).join(', ')}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else{tag='<span class="tag tag-dad">Your day</span>';const n=(e.kidsWithDad||[]).length;const kids=n===KIDS.length?kidsCountLabel()+' home':n===0?'All at '+coParentPoss():(e.kidsWithDad||[]).join(', ')+' home';body=`<div class="entry-row"><strong>${kids}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  const locked=isLockedDate(ds);
  const lockBadge=locked?'<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;background:#f1eff0;color:#777;border-radius:8px;padding:2px 8px;margin-left:6px">🔒 Locked</span>':'';
  el.innerHTML=`<div class="entry-card"><div class="entry-date-lbl">${fmtDate(ds)} ${tag}${lockBadge}</div>${body}${entryMetaHtml(e,{fullAttachment:true})}</div>`;
}

// ── TRENDS STATE & NAVIGATION ────────────────────────────────
let trendsFilter='month';
let trendsM=new Date().getMonth(), trendsY=new Date().getFullYear();

function setTrendsFilter(val){
  trendsFilter=val;
  document.querySelectorAll('.trends-pill').forEach(p=>p.classList.remove('active'));
  document.getElementById('tpill-'+val).classList.add('active');
  // Show month nav arrows only when viewing a specific month
  const nav=document.getElementById('trends-month-nav');
  if(nav){
    const actions=nav.querySelector('.cal-nav-actions');
    if(actions)actions.style.visibility=(val==='month')?'visible':'hidden';
  }
  renderStats();
}

function changeTrendsMonth(dir){
  trendsM+=dir;
  if(trendsM>11){trendsM=0;trendsY++;}
  if(trendsM<0){trendsM=11;trendsY--;}
  document.getElementById('trends-month-label').textContent=MONTHS[trendsM]+' '+trendsY;
  renderStats();
}

function getTrendsEntries(){
  const all=getEntries();
  const sorted=Object.entries(all).sort((a,b)=>a[0].localeCompare(b[0]));
  if(trendsFilter==='month'){
    const px=trendsY+'-'+pad(trendsM+1)+'-';
    return sorted.filter(([k])=>k.startsWith(px));
  }
  if(trendsFilter==='all') return sorted;
  const days=parseInt(trendsFilter);
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-days);
  const cutoffStr=cutoff.getFullYear()+'-'+pad(cutoff.getMonth()+1)+'-'+pad(cutoff.getDate());
  return sorted.filter(([ds])=>ds>=cutoffStr);
}

function trendsFilterLabel(){
  if(trendsFilter==='month') return MONTHS[trendsM]+' '+trendsY;
  if(trendsFilter==='all') return 'All time';
  return 'Last '+trendsFilter+' days';
}
// ── END TRENDS STATE ─────────────────────────────────────────

function renderStats(){
  const me=getTrendsEntries();
  const label=trendsFilterLabel();

  const dadActual=me.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had')).length;
  const dadWkMomHad=me.filter(([,e])=>e.week==='dad'&&e.dadMode==='mom-had').length;
  const momWkDadHad=me.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had').length;
  const involvement=me.filter(([,e])=>(e.week==='mom'&&e.momMode==='helped')||(e.week==='dad'&&e.dadMode==='dad-helped-mom')).length;
  const missedDays=me.filter(([,e])=>e.week==='not-logged').length;
  const loggedDays=me.filter(([,e])=>e.week!=='not-logged').length;

  // Deviation breakdown — split by agreed vs pressured vs unexpected
  const deviations=me.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had');
  const pressuredDev=deviations.filter(([,e])=>e.changePressured===true);
  const agreedDev=deviations.filter(([,e])=>e.changeAgreed===true&&e.changePressured!==true);
  const unexpectedDev=deviations.filter(([,e])=>e.changeAgreed===false);
  const untaggedDev=deviations.filter(([,e])=>e.changeAgreed===null||e.changeAgreed===undefined);

  // Update month nav label
  const navLbl=document.getElementById('trends-month-label');
  if(navLbl)navLbl.textContent=MONTHS[trendsM]+' '+trendsY;

  // Stat cards
  document.getElementById('stats-lbl').textContent=label;
  document.getElementById('stat-grid').innerHTML=`
    <div class="stat-card"><div class="stat-num">${dadActual}</div><div class="stat-lbl">Days ${currentParent()} had kids</div></div>
    <div class="stat-card"><div class="stat-num stat-num-red">${momWkDadHad}</div><div class="stat-lbl">${coParentPoss()} nights — kids with you</div></div>
    <div class="stat-card"><div class="stat-num">${dadWkMomHad}</div><div class="stat-lbl">Your nights — kids at ${coParentPoss()}</div></div>
    <div class="stat-card"><div class="stat-num">${involvement}</div><div class="stat-lbl">Cross-week help days</div></div>`;

  // Deviation detail with pressure flags
  const devDetail=document.getElementById('trends-deviation-detail');
  if(devDetail){
    if(!deviations.length){
      devDetail.innerHTML='';
    } else {
      // Build rows for each deviation
      const rows=deviations.map(([ds,e])=>{
        const kids=(e.dadHadKids||[]).join(', ')||'Kids';
        let flags='';
        if(e.changePressured===true) flags+='<span class="flag-badge flag-pressured">😟 Felt pressured</span>';
        else if(e.changeAgreed===true) flags+='<span class="flag-badge flag-agreed">✅ Agreed</span>';
        else if(e.changeAgreed===false) flags+='<span class="flag-badge flag-unexpected">❌ Unexpected</span>';
        return `<div class="trends-deviation-row">
          <div class="trends-dev-date">${fmtShort(ds)}</div>
          <div class="trends-dev-kids">${kids}</div>
          <div class="trends-dev-flags">${flags}</div>
        </div>`;
      }).join('');

      // Footnote explaining the distinction
      const footnote=`<div class="trends-footnote">
        ✅ <strong>Agreed</strong> — you agreed to take the kids and felt fine about it.<br>
        😟 <strong>Felt pressured</strong> — you took the kids but felt pressured to agree.<br>
        ❌ <strong>Unexpected</strong> — not agreed in advance, schedule was not followed.
      </div>`;

      devDetail.innerHTML=`<div class="trends-deviation-card">
        <div class="trends-deviation-title">${coParentPoss()} nights — ${currentParent()} had kids (${deviations.length} total)</div>
        ${rows}
        ${footnote}
      </div>`;
    }
  }

  // Summary sentence
  let summaryText=`${label}: ${loggedDays} day${loggedDays!==1?'s':''} logged. ${currentParent()} had the kids on ${dadActual} day${dadActual!==1?'s':''}. During ${coParentPoss()} scheduled days, kids were with ${currentParent()} ${momWkDadHad} time${momWkDadHad!==1?'s':''} (${pressuredDev.length} pressured, ${agreedDev.length} agreed, ${unexpectedDev.length} unexpected).`;
  if(missedDays)summaryText+=` ${missedDays} day${missedDays!==1?'s were':' was'} not logged.`;
  document.getElementById('summary-box').textContent=summaryText;
}
function renderLog(){
  const entries=getEntries(),sorted=Object.entries(entries).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,30);
  const list=document.getElementById('log-list');
  if(!list)return;
  if(!sorted.length){list.innerHTML='<p style="color:#999;font-size:14px;padding:1rem 0">No entries yet.</p>';return}
  list.innerHTML=sorted.map(([date,e])=>{
    let tagCls,tagTxt,desc;
    if(e.week==='not-logged'){tagCls='tag-missed';tagTxt='Not logged';desc=e.intentional?'Skipped intentionally':'Nothing logged'}
    else if(e.week==='other'){tagCls='tag-other';tagTxt='Special';desc='Special day'}
    else if(e.dadMode==='mom-had'){tagCls='tag-teal';tagTxt=currentParent()+' day/'+coParent()+' had';desc='Kids at '+coParentPoss()+': '+(e.momHadKidsOnDadWeek||[]).join(', ')}
    else if(e.dadMode==='dad-helped-mom'){tagCls='tag-dad';tagTxt='Your day';desc=coParent()+' helped: '+(e.momHadKidsOnDadWeek||[]).join(', ')}
    else if(e.momMode==='easy'){tagCls='tag-mom';tagTxt=coParentPoss()+' day';desc=coParent()+' had kids'}
    else if(e.momMode==='helped'){tagCls='tag-mom';tagTxt=coParent()+'/'+currentParent()+' helped';desc='You helped: '+(e.helpedKids||[]).join(', ')}
    else if(e.momMode==='dad-had'){tagCls='tag-other';tagTxt=coParent()+'/'+currentParent()+' had';desc='You had: '+(e.dadHadKids||[]).join(', ')}
    else{tagCls='tag-dad';tagTxt='Your day';const n=(e.kidsWithDad||[]).length;desc=n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')}
    return`<div class="entry-card"><div class="entry-date-lbl">${fmtShort(date)} <span class="tag ${tagCls}">${tagTxt}</span></div><div class="entry-row">${desc}</div>${e.diary?`<div class="entry-row" style="color:#666;font-style:italic;font-size:13px;margin-top:3px">"${e.diary.substring(0,80)}${e.diary.length>80?'…':''}"</div>`:''}${entryMetaHtml(e)}</div>`;
  }).join('');
}
function changeMonth(dir){calM+=dir;if(calM>11){calM=0;calY++}if(calM<0){calM=11;calY--}document.getElementById('stats-lbl').textContent=MONTHS[calM]+' '+calY;renderCal();renderStats()}
function switchTab(t){
  ['cal','trends'].forEach(x=>{
    const tab=document.getElementById('t-'+x),panel=document.getElementById('tc-'+x);
    if(tab)tab.classList.toggle('active',x===t);
    if(panel)panel.style.display=x===t?'block':'none';
  });
  if(t==='trends')renderStats();
  if(t==='log')renderLog();
}

// EXPORT
function reportEntries(){
  const entries=Object.entries(getEntries());
  if(REPORT_FILTER==='all')return entries;
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-parseInt(REPORT_FILTER,10));
  return entries.filter(([ds])=>new Date(ds)>=cutoff);
}
function renderReportsStats(){
  const entries=reportEntries();
  const logged=entries.filter(([,e])=>e.week!=='not-logged').length;
  const deviations=entries.filter(([,e])=>e.dadMode==='mom-had'||e.momMode==='dad-had').length;
  const pressured=entries.filter(([,e])=>e.changePressured).length;
  const attachments=entries.filter(([,e])=>e.attachment).length;
  const el=document.getElementById('reports-stats-bar');if(!el)return;
  el.innerHTML=`
    <div class="reports-stats-bar">
      <div class="reports-stat-item"><div class="reports-stat-num">${logged}</div><div class="reports-stat-lbl">Logged days</div></div>
      <div class="reports-stat-item"><div class="reports-stat-num red">${deviations}</div><div class="reports-stat-lbl">Custody deviations</div></div>
      <div class="reports-stat-divider"></div>
      <div class="reports-stat-item"><div class="reports-stat-num">${pressured}</div><div class="reports-stat-lbl">Pressure flags</div></div>
      <div class="reports-stat-item"><div class="reports-stat-num blue">${attachments}</div><div class="reports-stat-lbl">Screenshots</div></div>
    </div>`;
}
function setReportFilter(range){
  REPORT_FILTER=range;
  document.querySelectorAll('.report-pill').forEach(p=>p.classList.toggle('active',p.id==='pill-'+range));
  renderReportsStats();
  if(currentExportType)selectExport(currentExportType);
}
function showExport(){currentExportType=null;document.querySelectorAll('.export-card').forEach(c=>c.classList.remove('sel'));document.getElementById('export-preview-section').style.display='none';renderReportsStats();show('s-export')}
function selectExport(type){
  currentExportType=type;document.querySelectorAll('.export-card').forEach(c=>c.classList.remove('sel'));document.getElementById('exp-'+type).classList.add('sel');
  currentReportText=buildReport(type);
  const titleMap={honest:'Custody deviation report',dadactual:'Actual time with kids',momsweek:coParentPoss()+' week',full:'Full diary',notes:'Diary notes only'};
  const title=document.getElementById('preview-title');if(title)title.textContent=titleMap[type]||'Preview';
  document.getElementById('preview-box').textContent=currentReportText||'No entries found.';
  document.getElementById('export-preview-section').style.display='block';document.getElementById('copy-toast').style.display='none';
  setTimeout(()=>document.getElementById('export-preview-section').scrollIntoView({behavior:'smooth',block:'start'}),0);
}
function buildReport(type){
  const sorted=reportEntries().sort((a,b)=>a[0].localeCompare(b[0]));
  if(!sorted.length)return'';
  const gen='Generated: '+new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+'\nNote: Entries are locked read-only after 24 hours and cannot be modified retroactively.';
  const D='─'.repeat(50);
  if(type==='full'){
    let L=['CUSTODY TRACKER — FULL DIARY','Kids: '+kidsListLabel(),gen,'',D,''];
    for(const[ds,e]of sorted){
      L.push('DATE: '+fmtDate(ds));
      L.push(...reportMetaLines(e));
      if(e.week==='other'){L.push('TYPE: Special/other day');L.push('NOTE: '+(e.diary||'—'))}
      else if(e.dadMode==='mom-had'){L.push('WEEK: '+currentParentPoss()+' scheduled week — KIDS AT '+coParent().toUpperCase());L.push('KIDS AT '+coParent().toUpperCase()+': '+(e.momHadKidsOnDadWeek||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.dadMode==='dad-helped-mom'){L.push('WEEK: '+currentParentPoss()+' scheduled week');const n=(e.kidsWithDad||[]).length;L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(n===KIDS.length?kidsCountLabel():n===0?'None':(e.kidsWithDad||[]).join(', ')));L.push(coParent().toUpperCase()+' HELPED:');Object.entries(e.momHelpedOnDadWeek||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')+(v.note?' ('+v.note+')':'')));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='easy'){L.push('WEEK: '+coParentPoss()+' scheduled week');L.push('STATUS: '+coParent()+' had the kids');if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='helped'){L.push('WEEK: '+coParentPoss()+' scheduled week');L.push(currentParent().toUpperCase()+' HELPED WITH: '+(e.helpedKids||[]).join(', '));Object.entries(e.helpedData||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')+(v.note?' ('+v.note+')':'')));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='dad-had'){L.push('WEEK: '+coParentPoss()+' scheduled week — KIDS WITH '+currentParent().toUpperCase());L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(e.dadHadKids||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary)}
      else{const n=(e.kidsWithDad||[]).length;L.push('WEEK: '+currentParentPoss()+' scheduled week');L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(n===KIDS.length?kidsCountLabel():n===0?'None':(e.kidsWithDad||[]).join(', ')));if(e.diary)L.push('NOTES: '+e.diary)}
      L.push(D,'');
    }return L.join('\n');
  }
  if(type==='dadactual'){
    const filt=sorted.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had'));
    if(!filt.length)return'No entries found.';
    let L=['CUSTODY TRACKER — '+currentParent().toUpperCase()+' ACTUAL TIME WITH KIDS','Includes '+currentParentPoss()+' scheduled days and '+coParentPoss()+' scheduled nights where the kids were with '+currentParent()+'.',gen,'Total: '+filt.length+' days','',D,''];
    for(const[ds,e]of filt){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));if(e.momMode==='dad-had'){L.push('*** '+coParent().toUpperCase()+'\'S WEEK — KIDS LEFT WITH '+currentParent().toUpperCase()+' ***');L.push('KIDS: '+(e.dadHadKids||[]).join(', '))}else{const n=(e.kidsWithDad||[]).length;L.push(currentParentPoss()+" scheduled week · "+(n===KIDS.length?kidsCountLabel():(e.kidsWithDad||[]).join(', ')))}if(e.diary)L.push('NOTE: '+e.diary);L.push(D,'');}return L.join('\n');
  }
  if(type==='honest'){
    const mhd=sorted.filter(([,e])=>e.week==='dad'&&e.dadMode==='mom-had');
    const dhm=sorted.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had');
    let L=['CUSTODY TRACKER — FULL HONESTY REPORT',gen,'',D,currentParent().toUpperCase()+"'S WEEK — KIDS ENDED UP AT "+coParent().toUpperCase()+' ('+mhd.length+' nights)',D,''];
    if(!mhd.length)L.push('None logged.','');else for(const[ds,e]of mhd){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));L.push('AT '+coParent().toUpperCase()+': '+(e.momHadKidsOnDadWeek||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary);L.push('')}
    L.push(D,coParent().toUpperCase()+"'S WEEK — KIDS ENDED UP WITH "+currentParent().toUpperCase()+' ('+dhm.length+' nights)',D,'');
    if(!dhm.length)L.push('None logged.','');else for(const[ds,e]of dhm){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));L.push('WITH '+currentParent().toUpperCase()+': '+(e.dadHadKids||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary);L.push('')}
    return L.join('\n');
  }
  if(type==='momsweek'){
    const filt=sorted.filter(([,e])=>e.week==='mom'&&(e.momMode==='helped'||e.momMode==='dad-had'));
    if(!filt.length)return'No '+coParentPoss()+' week entries with '+currentParent()+' involvement found.';
    let L=['CUSTODY TRACKER — '+coParent().toUpperCase()+"'S WEEK / "+currentParent().toUpperCase()+"'S INVOLVEMENT",gen,'Total: '+filt.length,'',D,''];
    for(const[ds,e]of filt){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));if(e.momMode==='dad-had'){L.push('Kids ended up with '+currentParent());L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(e.dadHadKids||[]).join(', '))}else{L.push(currentParent()+' helped out');Object.entries(e.helpedData||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(a=>ACT_LBL[a]).join(', ')+(v.note?' — '+v.note:'')))}if(e.diary)L.push('NOTE: '+e.diary);L.push(D,'');}return L.join('\n');
  }
  if(type==='notes'){
    const filt=sorted.filter(([,e])=>e.diary&&e.diary.trim());if(!filt.length)return'No diary notes found.';
    let L=['CUSTODY TRACKER — DIARY NOTES',gen,'',D,''];
    for(const[ds,e]of filt){
      let t='['+coParentPoss()+' day]';
      if(e.week==='other')t='[Special]';
      else if(e.dadMode==='mom-had')t='['+currentParentPoss()+' day/'+coParent()+' had]';
      else if(e.momMode==='dad-had')t='['+coParentPoss()+' day/'+currentParent()+' had]';
      else if(e.momMode==='helped')t='['+coParentPoss()+' day/'+currentParent()+' helped]';
      else if(e.week==='dad')t='['+currentParentPoss()+' day]';
      L.push(fmtDate(ds)+' '+t);L.push(e.diary.trim(),'');
    }return L.join('\n');
  }
  return'';
}
function shareReport(){
  if(!currentReportText)return;
  const names={full:'Full Diary',dadactual:currentParentPoss()+' Actual Time',honest:'Honesty Report',momsweek:coParentPoss()+' Week',notes:'Diary Notes'};
  const subject=encodeURIComponent('Custody Tracker — '+(names[currentExportType]||'Report')+' '+new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'}));
  const body=encodeURIComponent(currentReportText);
  if(navigator.share){navigator.share({title:'Custody Tracker',text:currentReportText}).catch(()=>{})}
  else window.location.href=`mailto:${MY_EMAIL}?subject=${subject}&body=${body}`;
}
async function copyReport(){
  if(!currentReportText)return;
  try{await navigator.clipboard.writeText(currentReportText);const el=document.getElementById('copy-toast');el.style.display='block';setTimeout(()=>el.style.display='none',2500)}catch(e){}
}
function printReport(){
  if(!currentReportText)return;
  const w=window.open('','_blank');
  if(!w)return;
  const reportTitle=document.getElementById('preview-title')?document.getElementById('preview-title').textContent:'Custody Tracker Report';
  const now=new Date();
  const printDate=now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const printTime=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  const parentName=APP_CONFIG.currentParentLabel||'Parent';
  const kids=(APP_CONFIG.children||[]).join(', ')||'Children';
  const totalEntries=Object.keys(getEntries()).filter(ds=>!isLockedDate(ds)===false||true).length;
  const lockedEntries=Object.entries(getEntries()).filter(([ds])=>isLockedDate(ds)).length;

  const attestation=`ATTESTATION
${'─'.repeat(60)}
This report was generated by Custody Tracker, a personal
custody documentation application.

Reporting parent: ${parentName}
Children: ${kids}
Report generated: ${printDate} at ${printTime}
Total entries in record: ${totalEntries}
Locked (read-only) entries: ${lockedEntries}

All entries in this report were logged through the Custody
Tracker application and timestamped at the time of logging.
Entries become permanently read-only after 24 hours and
cannot be edited or deleted thereafter.

The undersigned attests that the information contained in
this report is true and accurate to the best of their
knowledge and was recorded contemporaneously.

Signature: _________________________ Date: _____________

Printed name: ______________________
${'─'.repeat(60)}`;

  w.document.write(`<!doctype html><html><head><title>${reportTitle}</title>
  <style>
    @page{margin:2cm}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111;font-size:12px;line-height:1.6}
    .cover{margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #111}
    .cover-title{font-size:20px;font-weight:700;margin-bottom:4px}
    .cover-sub{font-size:13px;color:#555;margin-bottom:12px}
    .cover-meta{font-size:12px;color:#333;line-height:1.8}
    pre{white-space:pre-wrap;font-size:11px;line-height:1.7;font-family:'Courier New',monospace}
    .attestation{margin-top:48px;padding-top:24px;border-top:2px solid #111}
    .attestation pre{font-size:11px}
    .no-print{display:none}
    @media screen{body{max-width:800px;margin:0 auto;padding:32px}.no-print{display:block;margin-bottom:24px}}
  </style>
  </head><body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:10px 20px;background:#4430a0;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">🖨️ Print / Save as PDF</button>
    <span style="font-size:13px;color:#666;margin-left:12px">To save as PDF, choose 'Save as PDF' in the print dialog</span>
  </div>
  <div class="cover">
    <div class="cover-title">Custody Tracker — ${reportTitle}</div>
    <div class="cover-sub">Personal custody documentation record</div>
    <div class="cover-meta">
      <strong>Reporting parent:</strong> ${parentName}<br>
      <strong>Children:</strong> ${kids}<br>
      <strong>Generated:</strong> ${printDate} at ${printTime}<br>
      <strong>Total entries:</strong> ${totalEntries} &nbsp;·&nbsp; <strong>Locked entries:</strong> ${lockedEntries}
    </div>
  </div>
  <pre></pre>
  <div class="attestation"><pre></pre></div>
  </body></html>`);
  w.document.querySelectorAll('pre')[0].textContent=currentReportText;
  w.document.querySelectorAll('pre')[1].textContent=attestation;
  w.document.close();w.focus();
  setTimeout(()=>w.print(),600);
}

// SUNDAY EMAIL
function buildWeeklyReport(){
  const entries=getEntries(),sorted=Object.entries(entries).sort((a,b)=>a[0].localeCompare(b[0]));
  const now=new Date(),weekAgo=new Date(now);weekAgo.setDate(weekAgo.getDate()-7);
  const week=sorted.filter(([ds])=>new Date(ds)>=weekAgo);
  const dadActual=week.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had')).length;
  const momLeft=week.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had').length;
  const dadHelped=week.filter(([,e])=>e.week==='mom'&&e.momMode==='helped').length;
  let L=['CUSTODY TRACKER — WEEKLY REPORT','Week ending: '+now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),'','SUMMARY','───────────────────','Days logged: '+week.length,'Days '+currentParent()+' had kids: '+dadActual,coParentPoss()+' scheduled nights with kids at '+currentParentPoss()+': '+momLeft,coParentPoss()+' scheduled days '+currentParent()+' helped out: '+dadHelped,'','DAILY BREAKDOWN','───────────────────',''];
  for(const[ds,e]of week){
    L.push(fmtDate(ds).toUpperCase());
    if(e.week==='other')L.push('  Special: '+(e.diary||'—'));
    else if(e.dadMode==='mom-had')L.push('  Your week — kids at '+coParentPoss()+': '+(e.momHadKidsOnDadWeek||[]).join(', '));
    else if(e.momMode==='easy')L.push('  '+coParentPoss()+' week — '+coParent()+' had kids');
    else if(e.momMode==='helped')L.push('  '+coParentPoss()+' week — '+currentParent()+' helped: '+(e.helpedKids||[]).join(', '));
    else if(e.momMode==='dad-had')L.push('  '+coParentPoss()+' week — '+currentParent()+' had: '+(e.dadHadKids||[]).join(', '));
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

function seedJuneDemoData(){
  const kids=['Ava Penelope Montgomery-Sanderson','Benjamin Theodore Worthington-Harrington','Supercalifragilisticexpialidocious Junior'];
  saveConfig({
    currentParentLabel:'Ryan',
    coParentLabel:'Laura',
    email:'ryan@example.com',
    children:kids,
    purpose:'',
    termsAccepted:true,
  });
  putEntries({
    '2026-06-01':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[...kids],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Normal night at home. Dinner, homework, and bedtime routine.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-01T21:12:00-07:00'},
    '2026-06-02':{week:'dad',dadMode:'mom-had',momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[kids[0]],momHelpedOnDadWeek:{},diary:'Ava stayed with co-parent after a schedule change in the afternoon.',attachment:null,changeAgreed:false,changePressured:null,loggedAt:'2026-06-02T21:38:00-07:00'},
    '2026-06-03':{week:'mom',dadMode:null,momMode:'easy',kidsWithDad:[],absentData:{},momOpts:['call'],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Quick FaceTime before bed.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-03T20:44:00-07:00'},
    '2026-06-04':{week:'mom',dadMode:null,momMode:'dad-had',kidsWithDad:[kids[1]],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[kids[1]],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Ben ended up staying with me overnight after a late change.',attachment:null,changeAgreed:true,changePressured:false,loggedAt:'2026-06-04T22:05:00-07:00'},
    '2026-06-05':{week:'other',dadMode:null,momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'School event and schedule exception.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-05T19:25:00-07:00'},
    '2026-06-06':{week:'dad',dadMode:'dad-helped-mom',momMode:null,kidsWithDad:[kids[0],kids[1]],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[kids[2]],momHelpedOnDadWeek:{[kids[2]]:{acts:['activity'],note:'Co-parent handled evening activity pickup.'}},diary:'Co-parent helped with activity logistics while the other kids stayed with me.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-06T21:16:00-07:00'},
    '2026-06-07':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[kids[0],kids[2]],absentData:{[kids[1]]:{location:'sleepover',note:'Friend birthday sleepover.'}},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Split night: two kids home, Ben at sleepover.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-07T21:03:00-07:00'},
    '2026-06-08':{week:'not-logged',intentional:false,loggedAt:'2026-06-09T08:00:00-07:00'},
    '2026-06-09':{week:'mom',dadMode:null,momMode:'helped',kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[kids[0]],helpedData:{[kids[0]]:{acts:['school','food'],note:'School pickup and dinner.'}},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Helped with school pickup and dinner before drop-off.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-09T20:47:00-07:00'}
  });
}

const DEMO_PARAMS=new URLSearchParams(window.location.search);
if(DEMO_PARAMS.get('demo')==='june')seedJuneDemoData();
renderConfigurableUi();
if(hasSavedConfig()){
  initHome();
}else{
  initOnboarding();show('s-ob-welcome');
}
if(DEMO_PARAMS.get('demo')==='june')showCal();
