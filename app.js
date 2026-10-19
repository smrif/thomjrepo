const DEFAULT_CONFIG={
  currentParentLabel:'Dad',
  coParentLabel:'Mom',
  email:'',
  children:['Thomas','Presley','Hayden'],
  purpose:'',
  termsAccepted:false,
  termsVersion:null,
  termsAcceptedAt:null,
  privacyVersion:null,
  privacyAcceptedAt:null,
  policyAcceptanceOwnerId:null,
  policyAcceptanceEmail:null,
  activityIds:null,
  themeMode:'system',
};
const CONFIG_KEY='custody_tracker_config';
const SESSION_COUNT_KEY='custody_tracker_session_count';
const SESSION_COUNTED_KEY='custody_tracker_session_counted';
const ACTIVITY_PROMPT_SHOWN_KEY='activity_prompt_shown';
const ACTIVITY_PROMPT_DISMISSED_KEY='activity_prompt_dismissed';
const SYNC_CONFLICTS_KEY='whose_day_sync_conflicts';
const SYNC_STATUS_KEY='whose_day_sync_status';
const SYNC_BASE_KEY='whose_day_entry_sync_base';
const LOGGED_OUT_SIGNIN_COOLDOWN_KEY='whose_day_logged_out_signin_cooldown_until';
const ACCOUNT_DELETED_KEY='whose_day_account_deleted';
const CLIENT_SCHEMA_VERSION=1;
const SERVER_SCHEMA_VERSION=1;
const SIGN_IN_LINK_COOLDOWN_MS=65*1000;
const CURRENT_TERMS_VERSION='2026-10-13';
const CURRENT_PRIVACY_VERSION='2026-10-13';
const DEFAULT_ACTIVITIES=[
  {id:'school',label:'School pickup'},
  {id:'afterschool',label:'After school'},
  {id:'medical',label:'Medical'},
  {id:'practice',label:'Practice / lesson'},
  {id:'birthday',label:'Playdate'},
  {id:'camp',label:'Camp'},
  {id:'therapy',label:'Therapy'},
  {id:'religious',label:'Religious service'},
];
const ACTIVITY_ID_ALIASES={sports:'practice',dance:'practice',music:'practice'};
const REMOVED_DEFAULT_ACTIVITY_IDS=new Set(['volunteer','tournament']);
const CUSTOM_ACTIVITY_MAX_LENGTH=32;

let APP_CONFIG=loadConfig();
let KIDS=[...APP_CONFIG.children];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ACT_LBL={school:'School pickup',afterschool:'After school',medical:'Medical',practice:'Practice / lesson',sports:'Sports/practice',dance:'Dance/gymnastics',music:'Music/tutoring',birthday:'Playdate',camp:'Camp',therapy:'Therapy',religious:'Religious service',volunteer:'Volunteering',tournament:'Tournament/competition',other:'Other'};
const LOC_LBL={moms:"At Mom's",sleepover:'Sleepover',camp:'Overnight camp',activity:'Activity/event',other:'Other'};
const FEEDBACK_FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSfvZbvGndLbr6mFadw9oJrI3dw9ebEmyRJCpjlgK5s3w8qxTw/viewform?usp=sharing&ouid=103902362441684971194';
const FEEDBACK_EMAIL='thomas.j.gamble@gmail.com';

let S={week:null,dadMode:null,momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'',attachment:null,changeAgreed:null,changePressured:null,changeContextNext:null,changeContextBack:null};
let absentQueue=[],absentIdx=0,helpedQueue=[],helpedIdx=0,momHelpedQueue=[],momHelpedIdx=0;
let easyOpts=[];
let diaryOrigin='';   // which screen diary came from, for back nav
let successOverlayTimer=null;
let calM=new Date().getMonth(),calY=new Date().getFullYear();
let selectedCalDate=todayStr();
let currentExportType=null,currentReportText='';
let BACKFILL_DATE=null;
let REPORT_FILTER='all';
let setupValidationAttempted=false;
let setupPolicyAcceptancePending=false;
let policySaveBusy=false;
let policySaveNavigationToken=0;
let editingChildRow=null;
let cloudAuthBusy=false;
let loggedOutAuthBusy=false;
let loggedOutAuthMode='login';
let loggedOutSignInCooldownTimer=null;
let cloudSyncBusy=false;
let cloudSyncTimer=null;
let cloudSyncRefreshTimer=null;
let cloudSyncPending=false;
let cloudSyncTask=null;
let cloudDeletionBusy=false;
let cloudSyncGeneration=0;
let cloudSyncRetryAttempt=0;

function loadConfig(){
  try{
    const saved=localStorage.getItem(CONFIG_KEY);
    if(!saved)return{...DEFAULT_CONFIG,children:[...DEFAULT_CONFIG.children]};
    const parsed=JSON.parse(saved);
    const children=Array.isArray(parsed.children)&&parsed.children.length?parsed.children:DEFAULT_CONFIG.children;
    return{...DEFAULT_CONFIG,...parsed,children:children.map(cleanName).filter(Boolean),themeMode:normalizeThemeMode(parsed.themeMode)};
  }catch(e){return{...DEFAULT_CONFIG,children:[...DEFAULT_CONFIG.children]}}
}
function hasSavedConfig(){return !!localStorage.getItem(CONFIG_KEY)}
function accountDeletedOnDevice(){return localStorage.getItem(ACCOUNT_DELETED_KEY)==='1'}
function saveConfig(config,persist=true){
  APP_CONFIG={...DEFAULT_CONFIG,...config,themeMode:normalizeThemeMode(config.themeMode),children:config.children.map(cleanName).filter(Boolean)};
  if(!APP_CONFIG.children.length)APP_CONFIG.children=[...DEFAULT_CONFIG.children];
  KIDS=[...APP_CONFIG.children];
  if(persist){
    localStorage.setItem(CONFIG_KEY,JSON.stringify(APP_CONFIG));
    localStorage.removeItem(ACCOUNT_DELETED_KEY);
  }
  applyThemeMode();
  if(persist)scheduleCloudSync('profile-change');
}
function normalizeThemeMode(mode){return ['system','light','dark'].includes(mode)?mode:'system'}
function applyThemeMode(){
  const mode=normalizeThemeMode(APP_CONFIG.themeMode);
  if(mode==='system')document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme=mode;
  document.querySelectorAll('.theme-mode-btn').forEach(btn=>{
    const selected=btn.dataset.themeMode===mode;
    btn.classList.toggle('active',selected);
    btn.setAttribute('aria-pressed',String(selected));
  });
}
function setThemeMode(mode,persist=true){
  APP_CONFIG.themeMode=normalizeThemeMode(mode);
  applyThemeMode();
  if(persist&&hasSavedConfig())localStorage.setItem(CONFIG_KEY,JSON.stringify(APP_CONFIG));
}
function recordAppSession(){
  if(!hasSavedConfig()||sessionStorage.getItem(SESSION_COUNTED_KEY))return;
  const count=(parseInt(localStorage.getItem(SESSION_COUNT_KEY)||'0',10)||0)+1;
  localStorage.setItem(SESSION_COUNT_KEY,String(count));
  sessionStorage.setItem(SESSION_COUNTED_KEY,'1');
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
  if(extraButton&&KIDS.length>1)grid.appendChild(extraButton());
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
        <p>Used when a parent helps with plans.</p>
      </div>
    </div>
    <div class="settings-card activity-card-grid" id="setup-activity-chips"></div>
    <div class="activity-add-row">
      <input type="text" class="activity-custom-input" placeholder="Add custom activity..." id="setup-custom-activity" maxlength="${CUSTOM_ACTIVITY_MAX_LENGTH}" aria-describedby="setup-custom-activity-hint">
      <button type="button" class="activity-add-btn" onclick="addCustomActivity()">Add</button>
    </div>
    <div class="activity-limit-hint" id="setup-custom-activity-hint">${CUSTOM_ACTIVITY_MAX_LENGTH} characters max.</div>
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
  if(Array.isArray(APP_CONFIG.activityIds)&&APP_CONFIG.activityIds.length)return normalizeActivityIds(APP_CONFIG.activityIds);
  const legacy=APP_CONFIG.childActivities||{};
  const legacyIds=[...new Set(Object.values(legacy).flat().filter(Boolean))];
  return legacyIds.length?normalizeActivityIds(legacyIds):DEFAULT_ACTIVITIES.map(a=>a.id);
}

function normalizeActivityIds(ids){
  const defaultIds=new Set(DEFAULT_ACTIVITIES.map(a=>a.id));
  const normalized=[];
  ids.forEach(id=>{
    const next=ACTIVITY_ID_ALIASES[id]||id;
    if(REMOVED_DEFAULT_ACTIVITY_IDS.has(next))return;
    if(!defaultIds.has(next)&&REMOVED_DEFAULT_ACTIVITY_IDS.has(id))return;
    if(next&&!normalized.includes(next))normalized.push(next);
  });
  return normalized.length?normalized:DEFAULT_ACTIVITIES.map(a=>a.id);
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
  const val=input?input.value.trim().slice(0,CUSTOM_ACTIVITY_MAX_LENGTH):'';
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

function getDecisionTreeActivities(){
  const activities=getActivitiesForChild('');
  return activities.some(act=>act.id==='other')?activities:[...activities,{id:'other',label:'Other'}];
}

function activityLabel(id){
  const normalized=ACTIVITY_ID_ALIASES[id]||id;
  const def=DEFAULT_ACTIVITIES.find(act=>act.id===normalized);
  return ACT_LBL[id]||ACT_LBL[normalized]||def?.label||id;
}

function activityButtonId(button){
  if(button?.dataset?.actId)return button.dataset.actId;
  const match=button?.getAttribute('onclick')?.match(/'([^']+)'/);
  return match?match[1]:'';
}

function renderActivityChoiceGrid(gridId, handlerName){
  const grid=document.getElementById(gridId);
  if(!grid)return;
  grid.innerHTML='';
  getDecisionTreeActivities().forEach(act=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='act-btn';
    btn.dataset.actId=act.id;
    btn.textContent=act.label;
    btn.onclick=()=>window[handlerName](btn,act.id);
    grid.appendChild(btn);
  });
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
  setupKidGrid('dad-had-grid','dh','toggleDadHadKid',()=>allWithCoParentButton('dh-allThree',setDadHadAll,kidsCountLabel()));
  renderActivityChoiceGrid('mha-acts','toggleMomAct');
  renderActivityChoiceGrid('helped-acts','toggleAct');
  LOC_LBL.moms='At '+coParentPoss();
}
function initSetupForm(){
  if(policySaveBusy)policySaveNavigationToken++;
  const onboarding=document.getElementById('s-setup').classList.contains('onboarding-mode');
  setupValidationAttempted=false;
  setupPolicyAcceptancePending=false;
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
  document.getElementById('setup-terms').checked=!onboarding&&hasCurrentPolicyAcceptance(APP_CONFIG);
  document.getElementById('s-setup').classList.toggle('policy-update-available',!onboarding&&!hasCurrentPolicyAcceptance(APP_CONFIG));
  setThemeMode(APP_CONFIG.themeMode,false);
  document.getElementById('setup-continue').textContent=onboarding?'Start tracking →':'Save changes';
  validateSetup(false);
  initCloudAuthUi();
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
function handlePolicyAcceptanceInput(){
  setupPolicyAcceptancePending=document.getElementById('setup-terms').checked;
  handleSetupInput();
}
function hasCurrentPolicyAcceptance(config){
  return !!config.termsAccepted&&config.termsVersion===CURRENT_TERMS_VERSION&&
    config.privacyVersion===CURRENT_PRIVACY_VERSION&&
    Number.isFinite(Date.parse(config.termsAcceptedAt))&&Number.isFinite(Date.parse(config.privacyAcceptedAt));
}
async function capturePolicyAcceptance(email,{preview=false}={}){
  const acceptedAt=new Date().toISOString();
  let ownerId=null;
  if(!preview&&cloudBackendEnabled()&&navigator.onLine!==false){
    try{ownerId=(await window.WhoseDayBackend.getSession())?.user?.id||null}catch(error){}
  }
  return{
    termsAccepted:true,termsVersion:CURRENT_TERMS_VERSION,termsAcceptedAt:acceptedAt,
    privacyVersion:CURRENT_PRIVACY_VERSION,privacyAcceptedAt:acceptedAt,
    policyAcceptanceOwnerId:ownerId,policyAcceptanceEmail:String(email||'').trim().toLowerCase()
  };
}
function setPolicySaveBusy(busy,button){
  policySaveBusy=busy;
  button.disabled=busy;
  if(busy)button.setAttribute('aria-busy','true');
  else button.removeAttribute('aria-busy');
}
async function saveSetup(){
  if(policySaveBusy)return;
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
  const config={
    ...APP_CONFIG,
    currentParentLabel:cleanName(document.getElementById('setup-current-parent').value)||DEFAULT_CONFIG.currentParentLabel,
    coParentLabel:cleanName(document.getElementById('setup-co-parent').value)||DEFAULT_CONFIG.coParentLabel,
    email:document.getElementById('setup-email').value.trim(),
    children,
    activityIds,
    purpose:document.getElementById('setup-purpose')?.value||APP_CONFIG.purpose,
    themeMode:APP_CONFIG.themeMode,
  };
  const onboarding=document.getElementById('s-setup').classList.contains('onboarding-mode');
  const button=document.getElementById('setup-continue');
  const navigationToken=policySaveNavigationToken;
  try{
    setPolicySaveBusy(true,button);
    if(onboarding||setupPolicyAcceptancePending)Object.assign(config,await capturePolicyAcceptance(config.email,{preview:ONBOARDING_PREVIEW}));
    if(navigationToken!==policySaveNavigationToken||!document.getElementById('s-setup').classList.contains('active'))return;
    saveConfig(config,!ONBOARDING_PREVIEW);
  }finally{setPolicySaveBusy(false,button)}
  setOnboardingMode(false);
  renderConfigurableUi();
  initHome();
  show('s-home');
}
function skipSetup(){saveConfig(DEFAULT_CONFIG);setOnboardingMode(false);renderConfigurableUi();initHome();show('s-home')}
function cloudBackendEnabled(){
  return !!(window.WhoseDayBackend&&window.WhoseDayBackend.isEnabled&&window.WhoseDayBackend.isEnabled());
}
function cloudSyncAllowed(){
  const params=new URLSearchParams(window.location.search);
  return !cloudDeletionBusy&&!accountDeletedOnDevice()&&hasSavedConfig()&&cloudBackendEnabled()&&!params.has('demo')&&!params.has('onboarding-theme-preview')&&navigator.onLine!==false;
}
function cloudRedirectUrl(){
  const config=window.WhoseDayBackend?.settings?.()||{};
  if(config.redirectTo)return config.redirectTo;
  return window.location.protocol==='file:'?'https://whosedayapp.com/':window.location.href.split('#')[0];
}
function loggedOutAuthEnabled(){
  return cloudBackendEnabled()&&!new URLSearchParams(window.location.search).has('demo');
}
function setLoggedOutAuthMessage(message,tone=''){
  const el=document.getElementById('ob-login-message');
  if(!el)return;
  el.textContent=message||'';
  el.dataset.tone=tone;
}
function loggedOutSignInCooldownRemaining(){
  const until=parseInt(localStorage.getItem(LOGGED_OUT_SIGNIN_COOLDOWN_KEY)||'0',10)||0;
  return Math.max(0,until-Date.now());
}
function updateLoggedOutSignInButton(){
  const btn=document.getElementById('ob-login-send');
  if(!btn)return;
  const remaining=loggedOutSignInCooldownRemaining();
  clearTimeout(loggedOutSignInCooldownTimer);
  if(remaining>0){
    btn.disabled=true;
    btn.textContent=`Try again in ${Math.ceil(remaining/1000)}s`;
    loggedOutSignInCooldownTimer=setTimeout(updateLoggedOutSignInButton,Math.min(1000,remaining));
    return;
  }
  btn.disabled=loggedOutAuthBusy;
  btn.textContent=loggedOutAuthMode==='signup'?'Send sign-up link':'Send sign-in link';
}
function startLoggedOutSignInCooldown(){
  localStorage.setItem(LOGGED_OUT_SIGNIN_COOLDOWN_KEY,String(Date.now()+SIGN_IN_LINK_COOLDOWN_MS));
  updateLoggedOutSignInButton();
}
function setLoggedOutAuthBusy(busy){
  loggedOutAuthBusy=busy;
  ['ob-login-restore','ob-login-entry'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn)btn.disabled=busy;
  });
  document.querySelectorAll('#s-ob-login [onclick="showLoggedOutSignup()"],#s-ob-login [onclick="showLoggedOutLogin()"]').forEach(btn=>{btn.disabled=busy});
  updateLoggedOutSignInButton();
}
function setCloudAuthMessage(message,tone=''){
  const el=document.getElementById('cloud-auth-message');
  if(!el)return;
  el.textContent=message||'';
  el.dataset.tone=tone;
}
function setCloudAuthBusy(busy){
  busy=busy||cloudDeletionBusy;
  cloudAuthBusy=busy;
  ['cloud-auth-send','cloud-auth-refresh','cloud-auth-signout','profile-backup-btn','profile-restore-btn','entry-backup-btn','cloud-delete-btn'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn)btn.disabled=busy;
  });
  document.querySelectorAll('[data-conflict-action]').forEach(btn=>{btn.disabled=busy});
  if(!busy)updateCloudDeleteButton();
}
function setProfileSyncVisible(visible){
  const panel=document.getElementById('profile-sync-panel');
  if(panel)panel.hidden=!visible;
  const entryPanel=document.getElementById('entry-backup-panel');
  if(entryPanel)entryPanel.hidden=!visible;
  const syncPanel=document.getElementById('cloud-sync-status-panel');
  if(syncPanel)syncPanel.hidden=!visible;
  const conflictPanel=document.getElementById('cloud-conflict-panel');
  if(conflictPanel)conflictPanel.hidden=!visible||!getStoredSyncConflicts().length;
  const deletePanel=document.getElementById('cloud-delete-panel');
  if(deletePanel)deletePanel.hidden=!visible;
}
function scheduleCloudSync(reason='manual',delay=900){
  if(cloudDeletionBusy||accountDeletedOnDevice())return;
  if(!hasSavedConfig())return;
  if(!cloudBackendEnabled())return;
  clearTimeout(cloudSyncRefreshTimer);
  cloudSyncGeneration++;
  if(!cloudSyncAllowed()){
    cloudSyncPending=true;
    updateCloudSyncStatusUi({state:navigator.onLine===false?'offline':'pending',message:'Saved on this device. Changes will sync automatically when connected.'});
    return;
  }
  cloudSyncPending=true;
  updateCloudSyncStatusUi({state:'pending',message:'Waiting to sync latest changes.'});
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>syncCloudData({reason}),delay);
}
function scheduleCloudRefresh(){
  clearTimeout(cloudSyncRefreshTimer);
  if(!cloudSyncAllowed()||document.hidden)return;
  cloudSyncRefreshTimer=setTimeout(()=>document.hidden?null:syncCloudData({reason:'poll'}),15000);
}
function profilePayloadFromConfig(userId,existingProfile=null,userEmail=''){
  if(existingProfile?.user_id&&existingProfile.user_id!==userId)throw new Error('Profile owner does not match the signed-in account.');
  // Bind a recorded offline acceptance once; never carry it into another account.
  if(hasCurrentPolicyAcceptance(APP_CONFIG)&&!APP_CONFIG.policyAcceptanceOwnerId&&userEmail&&
    APP_CONFIG.policyAcceptanceEmail===String(userEmail).trim().toLowerCase()){
    APP_CONFIG.policyAcceptanceOwnerId=userId;
    localStorage.setItem(CONFIG_KEY,JSON.stringify(APP_CONFIG));
  }
  const localApplies=APP_CONFIG.policyAcceptanceOwnerId===userId;
  const acceptance={};
  for(const [kind,currentVersion] of [['terms',CURRENT_TERMS_VERSION],['privacy',CURRENT_PRIVACY_VERSION]]){
    const remoteVersion=existingProfile?.[kind+'_version']??null;
    const remoteAt=existingProfile?.[kind+'_accepted_at']??null;
    const localVersion=APP_CONFIG[kind+'Version'];
    const localAt=APP_CONFIG[kind+'AcceptedAt'];
    const explicitCurrent=localApplies&&APP_CONFIG.termsAccepted&&localVersion===currentVersion&&Number.isFinite(Date.parse(localAt));
    const knownRemote=remoteVersion===null||remoteVersion==='alpha-local'||remoteVersion===currentVersion;
    const newer=!remoteAt||(Number.isFinite(Date.parse(remoteAt))&&Date.parse(localAt)>Date.parse(remoteAt));
    // Unknown/future cloud versions and newer acceptance times are never downgraded.
    const useLocal=explicitCurrent&&knownRemote&&newer;
    const legacyLocal=APP_CONFIG.termsAccepted&&!APP_CONFIG.termsVersion&&!APP_CONFIG.termsAcceptedAt&&
      !APP_CONFIG.privacyVersion&&!APP_CONFIG.privacyAcceptedAt&&userEmail&&
      String(APP_CONFIG.email||'').trim().toLowerCase()===String(userEmail).trim().toLowerCase();
    acceptance[kind+'_version']=useLocal?localVersion:existingProfile?remoteVersion:legacyLocal?'alpha-local':null;
    acceptance[kind+'_accepted_at']=useLocal?localAt:remoteAt;
  }
  return{
    user_id:userId,
    current_parent_label:currentParent(),
    co_parent_label:coParent(),
    children:APP_CONFIG.children||[],
    activities:APP_CONFIG.activityIds||[],
    theme_mode:normalizeThemeMode(APP_CONFIG.themeMode),
    report_email:APP_CONFIG.email||null,
    ...acceptance
  };
}
function configFromProfile(profile){
  return{
    ...APP_CONFIG,
    currentParentLabel:profile.current_parent_label||APP_CONFIG.currentParentLabel,
    coParentLabel:profile.co_parent_label||APP_CONFIG.coParentLabel,
    email:profile.report_email||APP_CONFIG.email||'',
    children:Array.isArray(profile.children)&&profile.children.length?profile.children:APP_CONFIG.children,
    activityIds:Array.isArray(profile.activities)?profile.activities:APP_CONFIG.activityIds,
    themeMode:normalizeThemeMode(profile.theme_mode),
    termsAccepted:!!profile.terms_accepted_at,
    termsVersion:profile.terms_version??null,
    termsAcceptedAt:profile.terms_accepted_at??null,
    privacyVersion:profile.privacy_version??null,
    privacyAcceptedAt:profile.privacy_accepted_at??null,
    policyAcceptanceOwnerId:profile.user_id||null,
    policyAcceptanceEmail:null
  };
}
function updateProfileSyncDetail(profile){
  const detail=document.getElementById('profile-sync-detail');
  if(!detail)return;
  if(profile?.updated_at){
    detail.textContent='Last cloud profile update: '+new Date(profile.updated_at).toLocaleString();
  }else{
    detail.textContent='Settings sync automatically when you are signed in.';
  }
}
function getDeviceId(){
  const key='whose_day_device_id';
  let id=localStorage.getItem(key);
  if(!id){
    id=(crypto.randomUUID&&crypto.randomUUID())||('device-'+Date.now()+'-'+Math.random().toString(16).slice(2));
    localStorage.setItem(key,id);
  }
  return id;
}
function getStoredSyncStatus(){
  try{
    return JSON.parse(localStorage.getItem(SYNC_STATUS_KEY)||'{}')||{};
  }catch(error){
    return{};
  }
}
function setStoredSyncStatus(status){
  const next={...getStoredSyncStatus(),...status,updatedAt:new Date().toISOString()};
  localStorage.setItem(SYNC_STATUS_KEY,JSON.stringify(next));
  return next;
}
function getStoredSyncConflicts(){
  try{
    const conflicts=JSON.parse(localStorage.getItem(SYNC_CONFLICTS_KEY)||'[]');
    return Array.isArray(conflicts)?conflicts:[];
  }catch(error){
    return[];
  }
}
function setStoredSyncConflicts(conflicts){
  const normalized=Array.isArray(conflicts)?conflicts:[];
  localStorage.setItem(SYNC_CONFLICTS_KEY,JSON.stringify(normalized));
  renderCloudConflictReview();
  return normalized;
}
function stableStringify(value){
  if(Array.isArray(value))return'['+value.map(stableStringify).join(',')+']';
  if(value&&typeof value==='object'){
    return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableStringify(value[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}
function entriesMatch(localEntry,cloudEntry){
  return stableStringify(localEntry||null)===stableStringify(cloudEntry||null);
}
function getEntrySyncBase(userId){
  try{
    const base=JSON.parse(localStorage.getItem(SYNC_BASE_KEY+':'+userId)||'{}');
    return base&&typeof base==='object'&&!Array.isArray(base)?base:{};
  }catch{return{}}
}
function rememberEntrySyncBase(userId,rows){
  const base=getEntrySyncBase(userId);
  rows.forEach(row=>{if(row?.entry_date&&row.entry_json)base[row.entry_date]=row.entry_json});
  localStorage.setItem(SYNC_BASE_KEY+':'+userId,JSON.stringify(base));
}
function formatSyncTime(iso){
  if(!iso)return'Never synced on this device.';
  return 'Last synced '+new Date(iso).toLocaleString()+'.';
}
function updateCloudSyncStatusUi(status={}){
  const merged=status.persist===false?{...getStoredSyncStatus(),...status}:setStoredSyncStatus(status);
  const statusEl=document.getElementById('cloud-sync-status');
  const detailEl=document.getElementById('cloud-sync-detail');
  const conflictsEl=document.getElementById('cloud-sync-conflicts');
  if(!statusEl||!detailEl)return;
  const conflicts=getStoredSyncConflicts();
  const state=merged.state||'idle';
  const labels={
    idle:'Ready',
    pending:'Pending',
    syncing:'Syncing',
    synced:'Synced',
    offline:'Offline',
    conflict:'Needs review',
    error:'Retrying'
  };
  statusEl.textContent=labels[state]||'Ready';
  statusEl.dataset.state=state;
  detailEl.textContent=merged.message||formatSyncTime(merged.lastSyncedAt);
  if(conflictsEl){
    if(conflicts.length){
      conflictsEl.hidden=false;
      conflictsEl.textContent=`${conflicts.length} ${conflicts.length===1?'date has':'dates have'} cloud changes that need review before overwrite.`;
    }else{
      conflictsEl.hidden=true;
      conflictsEl.textContent='';
    }
  }
  renderCloudConflictReview();
}
function conflictTimeLabel(iso){
  if(!iso)return'Unknown update time';
  const date=new Date(iso);
  return Number.isNaN(date.getTime())?'Unknown update time':date.toLocaleString();
}
function conflictDateLabel(entryDate){
  return /^\d{4}-\d{2}-\d{2}$/.test(entryDate)?fmtDate(entryDate):'Unknown date';
}
function renderCloudConflictReview(){
  const panel=document.getElementById('cloud-conflict-panel');
  const list=document.getElementById('cloud-conflict-list');
  if(!panel||!list)return;
  const conflicts=getStoredSyncConflicts();
  panel.hidden=!conflicts.length;
  if(!conflicts.length){
    list.innerHTML='';
    return;
  }
  list.innerHTML=conflicts.map(conflict=>{
    const date=String(conflict.entry_date||'');
    return`
      <div class="conflict-review-item">
        <div class="conflict-review-copy">
          <strong>${conflictDateLabel(date)}</strong>
          <span>This device: ${conflictTimeLabel(conflict.local_updated_at)}</span>
          <span>Cloud copy: ${conflictTimeLabel(conflict.cloud_updated_at)}</span>
        </div>
        <div class="conflict-review-actions">
          <button class="auth-secondary-btn" type="button" data-conflict-action onclick="resolveCloudConflict('${date}','cloud')">Use cloud copy</button>
          <button class="settings-export-btn" type="button" data-conflict-action onclick="resolveCloudConflict('${date}','local')">Keep this device</button>
        </div>
      </div>`;
  }).join('');
}
function removeStoredSyncConflict(entryDate){
  const remaining=getStoredSyncConflicts().filter(conflict=>conflict.entry_date!==entryDate);
  setStoredSyncConflicts(remaining);
  const state=remaining.length?'conflict':'synced';
  const message=remaining.length
    ? `${remaining.length} ${remaining.length===1?'date still needs':'dates still need'} review.`
    : 'All sync conflicts are resolved.';
  updateCloudSyncStatusUi({state,message,lastSyncedAt:new Date().toISOString()});
  return remaining;
}
async function recordSyncDevice(userId,lastSyncAt=new Date().toISOString()){
  if(!window.WhoseDayBackend.upsertSyncDevice)return null;
  return window.WhoseDayBackend.upsertSyncDevice({
    user_id:userId,
    device_id:getDeviceId(),
    last_sync_at:lastSyncAt,
    client_schema_version:CLIENT_SCHEMA_VERSION,
    server_schema_version:SERVER_SCHEMA_VERSION
  });
}
function updateCloudDeleteButton(){
  const input=document.getElementById('cloud-delete-confirm');
  const btn=document.getElementById('cloud-delete-btn');
  if(!btn)return;
  btn.disabled=cloudAuthBusy||((input?.value||'').trim()!=='DELETE');
}
function localEntryRowsForBackup(userId){
  const deviceId=getDeviceId();
  return Object.entries(getEntries()).map(([entryDate,entry])=>{
    const loggedAt=entry?.loggedAt||null;
    return{
      user_id:userId,
      entry_date:entryDate,
      entry_json:entry,
      entry_version:1,
      client_created_at:loggedAt,
      client_updated_at:loggedAt,
      device_id:deviceId
    };
  });
}
function updateEntryBackupDetail(count){
  const detail=document.getElementById('entry-backup-detail');
  if(!detail)return;
  detail.textContent=count
    ? `${count} local custody ${count===1?'entry':'entries'} will sync automatically.`
    : 'No custody entries saved on this device yet.';
}
function reconcileLocalAndCloudRows(localRows,cloudRows,base={}){
  const cloudByDate=new Map((cloudRows||[]).map(row=>[row.entry_date,row]));
  const uploadRows=[];
  const downloadRows=[];
  const matchedRows=[];
  const conflicts=[];
  localRows.forEach(row=>{
    const cloudRow=cloudByDate.get(row.entry_date);
    if(!cloudRow){
      uploadRows.push(row);
      return;
    }
    if(entriesMatch(row.entry_json,cloudRow.entry_json)){
      matchedRows.push(cloudRow);
      return;
    }
    if(Object.hasOwn(base,row.entry_date)&&entriesMatch(base[row.entry_date],cloudRow.entry_json)){
      uploadRows.push(row);
      return;
    }
    if(Object.hasOwn(base,row.entry_date)&&entriesMatch(base[row.entry_date],row.entry_json)){
      downloadRows.push(cloudRow);
      return;
    }
    conflicts.push({
      entry_date:row.entry_date,
      local_updated_at:row.client_updated_at||null,
      cloud_updated_at:cloudRow.client_updated_at||cloudRow.updated_at||null,
      cloud_device_id:cloudRow.device_id||null
    });
  });
  cloudRows.forEach(row=>{if(!localRows.some(local=>local.entry_date===row.entry_date))downloadRows.push(row)});
  setStoredSyncConflicts(conflicts);
  return{uploadRows,downloadRows,matchedRows,conflicts};
}
function syncCloudData(options={}){
  if(cloudSyncBusy||!cloudSyncAllowed())return Promise.resolve(null);
  cloudSyncTask=performCloudSync(options);
  return cloudSyncTask;
}
async function performCloudSync({reason='manual',showMessage=false}={}){
  if(cloudSyncBusy||!cloudSyncAllowed())return null;
  const generation=cloudSyncGeneration;
  let retryDelay=900;
  let authenticated=false;
  try{
    cloudSyncBusy=true;
    clearTimeout(cloudSyncRefreshTimer);
    cloudSyncPending=false;
    updateCloudSyncStatusUi({state:'syncing',message:'Syncing latest changes...',persist:false});
    const session=await window.WhoseDayBackend.getSession();
    if(!session){
      cloudSyncPending=false;
      updateCloudSyncStatusUi({state:'pending',message:'Sign in before cloud sync can run.'});
      return null;
    }
    authenticated=true;
    if(reason!=='poll'){
      const existingProfile=await window.WhoseDayBackend.getProfile(session.user.id);
      const savedProfile=await window.WhoseDayBackend.upsertProfile(profilePayloadFromConfig(session.user.id,existingProfile,session.user.email));
      updateProfileSyncDetail(savedProfile);
    }
    const rows=localEntryRowsForBackup(session.user.id);
    const cloudRows=await window.WhoseDayBackend.getCustodyEntries(session.user.id);
    const {uploadRows,downloadRows,matchedRows,conflicts}=reconcileLocalAndCloudRows(rows,cloudRows,getEntrySyncBase(session.user.id));
    rememberEntrySyncBase(session.user.id,matchedRows);
    let uploaded=0;
    for(const row of uploadRows){
      const previous=cloudRows.find(cloud=>cloud.entry_date===row.entry_date);
      const saved=await window.WhoseDayBackend.saveCustodyEntry(row,previous?.updated_at||null);
      if(saved){
        rememberEntrySyncBase(session.user.id,[saved]);
        uploaded++;
      }else{
        // A concurrent writer won. Re-read before deciding whether this is a conflict.
        cloudSyncPending=true;
      }
    }
    const entries=getEntries();
    let added=0;
    const restoredDates=[];
    downloadRows.forEach(row=>{
      const original=rows.find(local=>local.entry_date===row.entry_date);
      if(!entriesMatch(entries[row.entry_date],original?.entry_json)){
        cloudSyncPending=true;
        return;
      }
      entries[row.entry_date]=row.entry_json;
      rememberEntrySyncBase(session.user.id,[row]);
      added++;
      restoredDates.push(row.entry_date);
    });
    if(added){putEntries(entries,{skipSync:true});refreshCloudEntryViews(restoredDates)}
    const syncedAt=new Date().toISOString();
    if(reason!=='poll'||uploaded||added)await recordSyncDevice(session.user.id,syncedAt);
    cloudSyncRetryAttempt=0;
    cloudSyncPending=cloudSyncPending||cloudSyncGeneration!==generation;
    updateEntryBackupDetail(Object.keys(getEntries()).length);
    const state=cloudSyncPending?'pending':conflicts.length?'conflict':'synced';
    const message=conflicts.length
      ? `Synced safely with ${conflicts.length} ${conflicts.length===1?'date':'dates'} held for review.`
      : cloudSyncPending?'Syncing remaining changes automatically...'
      : `Cloud sync complete. ${uploaded} ${uploaded===1?'entry':'entries'} updated, ${added} restored from cloud.`;
    updateCloudSyncStatusUi({state,lastSyncedAt:syncedAt,message});
    if(showMessage)setCloudAuthMessage(message,conflicts.length?'error':'success');
    return{reason,uploaded,cloud:cloudRows.length,added,conflicts:conflicts.length};
  }catch(error){
    cloudSyncPending=true;
    retryDelay=Math.min(60000,2000*2**Math.min(cloudSyncRetryAttempt++,5));
    updateCloudSyncStatusUi({state:navigator.onLine===false?'offline':'error',message:navigator.onLine===false?'Saved on this device. Changes will sync automatically when reconnected.':'Cloud sync interrupted. Retrying automatically...'});
    if(showMessage)setCloudAuthMessage(error.message||'Cloud sync failed. It will retry next time.','error');
    return null;
  }finally{
    cloudSyncBusy=false;
    if(cloudSyncPending&&cloudSyncAllowed())scheduleCloudSync('retry',retryDelay);
    else if(authenticated)scheduleCloudRefresh();
  }
}
function refreshCloudEntryViews(changedDates){
  initHome();
  if(document.getElementById('s-cal')?.classList.contains('active')){
    renderCal();
    renderStats();
    const entry=getEntries()[selectedCalDate];
    if(entry&&changedDates.includes(selectedCalDate)&&document.getElementById('cal-detail')?.style.display!=='none'){
      showDetail(selectedCalDate,entry,{reveal:false});
    }
  }
  if(document.getElementById('s-export')?.classList.contains('active')){
    renderReportsStats();
    if(currentExportType){
      currentReportText=buildReport(currentExportType);
      document.getElementById('preview-box').textContent=currentReportText||'No entries found.';
    }
  }
}
async function initCloudAuthUi(){
  const section=document.getElementById('cloud-account-section');
  if(!section)return;
  const enabled=cloudBackendEnabled();
  section.hidden=!enabled;
  if(!enabled)return;
  const email=document.getElementById('cloud-auth-email');
  if(email&&!email.value)email.value=APP_CONFIG.email||document.getElementById('setup-email')?.value||'';
  updateEntryBackupDetail(Object.keys(getEntries()).length);
  updateCloudSyncStatusUi({persist:false});
  await refreshCloudAuthUi(false);
}
async function refreshCloudAuthUi(showMessage=true){
  const title=document.getElementById('cloud-auth-title');
  const detail=document.getElementById('cloud-auth-detail');
  const pill=document.getElementById('cloud-auth-pill');
  const signOut=document.getElementById('cloud-auth-signout');
  if(!cloudBackendEnabled()||!title||!detail||!pill)return;
  try{
    setCloudAuthBusy(true);
    title.textContent='Checking account';
    detail.textContent='Looking for a saved Supabase session on this device.';
    pill.textContent='Checking';
    if(showMessage)setCloudAuthMessage('Checking cloud account status...');
    const session=await window.WhoseDayBackend.getSession();
    const email=session?.user?.email||'';
    if(session){
      title.textContent='Signed in';
      detail.textContent=email?'Connected as '+email:'Your cloud account is connected.';
      pill.textContent='Connected';
      pill.classList.add('connected');
      if(signOut)signOut.hidden=false;
      setProfileSyncVisible(true);
      try{
        updateProfileSyncDetail(await window.WhoseDayBackend.getProfile(session.user.id));
      }catch(error){
        updateProfileSyncDetail(null);
      }
      updateCloudSyncStatusUi({persist:false});
      scheduleCloudSync('signed-in',200);
      if(showMessage)setCloudAuthMessage('Cloud account connected. Sync runs automatically.','success');
    }else{
      title.textContent='Not signed in';
      detail.textContent='Send a secure email link to connect this device.';
      pill.textContent='Local';
      pill.classList.remove('connected');
      if(signOut)signOut.hidden=true;
      setProfileSyncVisible(false);
      updateProfileSyncDetail(null);
      setStoredSyncConflicts([]);
      updateCloudSyncStatusUi({state:'idle',message:'Sign in to turn on automatic sync.'});
      if(showMessage)setCloudAuthMessage('');
    }
  }catch(error){
    setCloudAuthMessage(error.message||'Could not check cloud sign-in status.','error');
  }finally{
    setCloudAuthBusy(false);
  }
}
async function sendCloudSignInLink(){
  if(cloudAuthBusy)return;
  const button=document.getElementById('cloud-auth-send');
  const input=document.getElementById('cloud-auth-email');
  const email=(input?.value||document.getElementById('setup-email')?.value||'').trim();
  if(!isValidEmail(email)){
    setCloudAuthMessage('Enter a valid email address first.','error');
    if(input)input.focus();
    return;
  }
  try{
    setCloudAuthBusy(true);
    if(button){button.textContent='Sending...';button.setAttribute('aria-busy','true')}
    setCloudAuthMessage('');
    await window.WhoseDayBackend.signInWithEmail(email,cloudRedirectUrl());
    setCloudAuthMessage('Sign-in link sent. Check your email, then return to Whose Day.','success');
  }catch(error){
    setCloudAuthMessage(error.message||'Could not send the sign-in link.','error');
  }finally{
    if(button){button.textContent='Send sign-in link';button.removeAttribute('aria-busy')}
    setCloudAuthBusy(false);
  }
}
async function signOutCloudAccount(){
  if(cloudAuthBusy)return;
  try{
    setCloudAuthBusy(true);
    await window.WhoseDayBackend.signOut();
    setCloudAuthMessage('Signed out. Local records are still on this device.','success');
    setProfileSyncVisible(false);
    updateEntryBackupDetail(Object.keys(getEntries()).length);
    setStoredSyncConflicts([]);
    updateCloudSyncStatusUi({state:'idle',message:'Sign in to turn on automatic sync.'});
    await refreshCloudAuthUi(false);
  }catch(error){
    setCloudAuthMessage(error.message||'Could not sign out.','error');
  }finally{
    setCloudAuthBusy(false);
  }
}
async function backupCloudProfile(){
  if(cloudAuthBusy)return;
  try{
    setCloudAuthBusy(true);
    const synced=await syncCloudData({reason:'manual-profile',showMessage:true});
    if(!synced)throw new Error('Sign in before syncing your profile.');
  }catch(error){
    setCloudAuthMessage(error.message||'Could not sync profile.','error');
  }finally{
    setCloudAuthBusy(false);
  }
}
async function restoreCloudProfile(){
  if(cloudAuthBusy)return;
  try{
    setCloudAuthBusy(true);
    const session=await window.WhoseDayBackend.getSession();
    if(!session)throw new Error('Sign in before restoring your profile.');
    const profile=await window.WhoseDayBackend.getProfile(session.user.id);
    if(!profile)throw new Error('No cloud profile found yet. Settings sync automatically while signed in.');
    saveConfig(configFromProfile(profile));
    renderConfigurableUi();
    initHome();
    initSetupForm();
    updateProfileSyncDetail(profile);
    setCloudAuthMessage('Profile restored on this device. Custody logs were not changed.','success');
  }catch(error){
    setCloudAuthMessage(error.message||'Could not restore profile.','error');
  }finally{
    setCloudAuthBusy(false);
  }
}
async function backupCustodyEntries(){
  if(cloudAuthBusy)return;
  try{
    const localCount=Object.keys(getEntries()).length;
    if(!localCount)throw new Error('No custody entries saved on this device yet.');
    setCloudAuthBusy(true);
    const synced=await syncCloudData({reason:'manual-entries',showMessage:true});
    if(!synced)throw new Error('Sign in before syncing custody logs.');
  }catch(error){
    setCloudAuthMessage(error.message||'Could not sync custody logs.','error');
  }finally{
    setCloudAuthBusy(false);
  }
}
async function deleteCloudAccount(){
  if(cloudAuthBusy||cloudDeletionBusy)return;
  const input=document.getElementById('cloud-delete-confirm');
  if((input?.value||'').trim()!=='DELETE'){
    setCloudAuthMessage('Type DELETE before deleting your account.','error');
    if(input)input.focus();
    return;
  }
  try{
    cloudDeletionBusy=true;
    setCloudAuthBusy(true);
    clearTimeout(cloudSyncTimer);
    setCloudAuthMessage('Deleting your account...');
    if(cloudSyncTask)await cloudSyncTask;
    if(!window.WhoseDayBackend.deleteAccount)throw new Error('Account deletion is not available in this version yet.');
    await window.WhoseDayBackend.deleteAccount();
    // Keep local records, but do not reopen or sync the deleted account on reload.
    localStorage.setItem(ACCOUNT_DELETED_KEY,'1');
    cloudSyncPending=false;
    setStoredSyncConflicts([]);
    updateProfileSyncDetail(null);
    updateEntryBackupDetail(Object.keys(getEntries()).length);
    if(input)input.value='';
    updateCloudDeleteButton();
    await refreshCloudAuthUi(false);
    updateCloudSyncStatusUi({state:'idle',message:'Account deleted. Local records remain on this device.'});
    setCloudAuthMessage('Your account and cloud records were deleted. Local records remain on this device.','success');
    setOnboardingMode(false);
    startWelcome();
    const notice=document.getElementById('account-deleted-notice');
    notice.hidden=false;
    notice.focus();
  }catch(error){
    setCloudAuthMessage(error.message||'Could not delete your account.','error');
  }finally{
    cloudDeletionBusy=false;
    setCloudAuthBusy(false);
  }
}
function dismissAccountDeletionNotice(){
  document.getElementById('account-deleted-notice').hidden=true;
  document.querySelector('#s-ob-welcome .landing-signin')?.focus();
}
async function resolveCloudConflict(entryDate,choice){
  if(cloudAuthBusy)return;
  const conflict=getStoredSyncConflicts().find(item=>item.entry_date===entryDate);
  if(!conflict){
    setCloudAuthMessage('That sync conflict is already resolved.','success');
    updateCloudSyncStatusUi({persist:false});
    return;
  }
  try{
    setCloudAuthBusy(true);
    clearTimeout(cloudSyncTimer);
    clearTimeout(cloudSyncRefreshTimer);
    if(cloudSyncTask)await cloudSyncTask;
    cloudSyncBusy=true;
    const session=await window.WhoseDayBackend.getSession();
    if(!session)throw new Error('Sign in before resolving sync conflicts.');
    if(choice==='local'){
      const entry=getEntries()[entryDate];
      if(!entry)throw new Error('This device no longer has that local entry.');
      const row=localEntryRowsForBackup(session.user.id).find(item=>item.entry_date===entryDate);
      if(!row)throw new Error('Could not prepare this local entry for cloud sync.');
      const cloudRows=await window.WhoseDayBackend.getCustodyEntries(session.user.id);
      const cloudRow=cloudRows.find(item=>item.entry_date===entryDate);
      const saved=await window.WhoseDayBackend.saveCustodyEntry(row,cloudRow?.updated_at||null);
      if(!saved)throw new Error('The cloud copy changed again. Review the latest copy before retrying.');
      rememberEntrySyncBase(session.user.id,[saved]);
      await recordSyncDevice(session.user.id);
      removeStoredSyncConflict(entryDate);
      setCloudAuthMessage(`Kept this device's entry for ${fmtDate(entryDate)}.`, 'success');
    }else if(choice==='cloud'){
      const cloudRows=await window.WhoseDayBackend.getCustodyEntries(session.user.id);
      const cloudRow=cloudRows.find(row=>row.entry_date===entryDate);
      if(!cloudRow?.entry_json)throw new Error('Could not find the cloud copy for that date.');
      const entries=getEntries();
      entries[entryDate]=cloudRow.entry_json;
      putEntries(entries,{skipSync:true});
      rememberEntrySyncBase(session.user.id,[cloudRow]);
      initHome();
      await recordSyncDevice(session.user.id);
      removeStoredSyncConflict(entryDate);
      setCloudAuthMessage(`Used the cloud entry for ${fmtDate(entryDate)}.`, 'success');
    }else{
      throw new Error('Choose which copy to keep.');
    }
    updateEntryBackupDetail(Object.keys(getEntries()).length);
  }catch(error){
    setCloudAuthMessage(error.message||'Could not resolve the sync conflict.','error');
    updateCloudSyncStatusUi({state:'conflict',message:'Conflict review still needs attention.'});
  }finally{
    cloudSyncBusy=false;
    setCloudAuthBusy(false);
    if(cloudSyncPending&&cloudSyncAllowed())scheduleCloudSync('conflict-resolved',200);
    else scheduleCloudRefresh();
  }
}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function pad(n){return String(n).padStart(2,'0')}
function fmtDate(ds){const[y,m,d]=ds.split('-');return MONTHS[parseInt(m)-1]+' '+parseInt(d)+', '+y}
function fmtShort(ds){const[y,m,d]=ds.split('-');return MONTHS[parseInt(m)-1].slice(0,3)+' '+parseInt(d)+', '+y}
function safeFilePart(value){
  return String(value||'custody-tracker').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'custody-tracker';
}
function csvCell(value){
  const text=value===null||value===undefined?'':String(value);
  return /[",\n\r]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}
function csvJoin(value){
  return Array.isArray(value)?value.join('; '):(value||'');
}
function exportAllData(){
  const exportDate=todayStr();
  const entries=getEntries();
  const headers=[
    'exported_at','alpha_note','user_label','co_parent_label','email','children',
    'entry_date','scheduled_day','your_day_outcome','co_parent_day_outcome',
    'kids_with_you','kids_with_co_parent_on_your_day','kids_you_helped',
    'kids_you_had_on_co_parent_day','absent_details','helped_details',
    'co_parent_helped_details','co_parent_options','change_agreed',
    'felt_pressured','diary_note','attachment_name','attachment_type',
    'attachment_data_url','logged_at','missed_entry','intentionally_skipped'
  ];
  const exportedAt=new Date().toISOString();
  const alphaNote='Exported from records saved on this device, which may include changes that have not synced. Keep this file secure.';
  const rows=Object.entries(entries).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,e])=>[
    exportedAt,
    alphaNote,
    currentParent(),
    coParent(),
    APP_CONFIG.email||'',
    csvJoin(APP_CONFIG.children),
    date,
    e.week||'',
    e.dadMode||'',
    e.momMode||'',
    csvJoin(e.kidsWithDad),
    csvJoin(e.momHadKidsOnDadWeek),
    csvJoin(e.helpedKids),
    csvJoin(e.dadHadKids),
    e.absentData?JSON.stringify(e.absentData):'',
    e.helpedData?JSON.stringify(e.helpedData):'',
    e.momHelpedOnDadWeek?JSON.stringify(e.momHelpedOnDadWeek):'',
    csvJoin(e.momOpts),
    e.changeAgreed===null||e.changeAgreed===undefined?'':String(e.changeAgreed),
    e.changePressured===null||e.changePressured===undefined?'':String(e.changePressured),
    e.diary||'',
    e.attachment?.name||'',
    e.attachment?.type||'',
    e.attachment?.dataUrl||'',
    e.loggedAt||'',
    e.week==='not-logged'?'true':'',
    e.intentional===undefined?'':String(e.intentional)
  ]);
  if(!rows.length){
    rows.push([exportedAt,alphaNote,currentParent(),coParent(),APP_CONFIG.email||'',csvJoin(APP_CONFIG.children),'','','','','','','','','','','','','','','','','','','','','']);
  }
  const csv=[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`${safeFilePart(currentParent())}-custody-tracker-backup-${exportDate}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
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
  const prompt=document.getElementById('missed-prompt');
  const todayCard=document.getElementById('home-checkin-card');
  if(!prompt)return false;
  prompt.style.display='none';
  prompt.classList.remove('primary-missed');
  const promptBeforeToday=todayCard&&todayCard.parentNode&&prompt.parentNode===todayCard.parentNode&&
    (prompt.compareDocumentPosition(todayCard)&Node.DOCUMENT_POSITION_FOLLOWING);
  if(promptBeforeToday){
    todayCard.insertAdjacentElement('afterend',prompt);
  }
  if(entries[yesterday])return false; // already logged or marked
  if(!Object.keys(entries).length)return false; // brand-new app, no history yet
  if(localStorage.getItem(dismissKey))return false; // already asked today
  // Find the first entry to make sure the app has been in use at least one day
  const allDates=Object.keys(entries).sort();
  if(!allDates.length||allDates[0]>=yesterday)return false;
  // Show it
  const yLabel=fmtShort(yesterday);
  document.getElementById('missed-date-label').textContent=yLabel;
  prompt.classList.add('primary-missed');
  prompt.style.display='block';
  if(todayCard&&todayCard.parentNode)todayCard.parentNode.insertBefore(prompt,todayCard);
  return true;
}
function dismissMissedPrompt(){
  // Mark yesterday as intentionally skipped (not-logged sentinel)
  const yesterday=yesterdayStr();
  const entries=getEntries();
  if(!entries[yesterday])entries[yesterday]={week:'not-logged',intentional:true,missedAt:new Date().toISOString()};
  putEntries(entries);
  localStorage.setItem('missed_dismissed_'+todayStr(),'1');
  document.getElementById('missed-prompt').style.display='none';
  initHome();
}
function startBackfill(){
  // Start check-in flow but target yesterday's date instead of today
  document.getElementById('missed-prompt').style.display='none';
  localStorage.setItem('missed_dismissed_'+todayStr(),'1');
  BACKFILL_DATE=yesterdayStr();
  startCheckin({keepDate:true});
}
function startBackfillForDate(ds){
  if(isLockedDate(ds)&&ds!==yesterdayStr())return;
  if(ds!==yesterdayStr())return;
  localStorage.setItem('missed_dismissed_'+todayStr(),'1');
  BACKFILL_DATE=ds;
  startCheckin({keepDate:true});
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
function putEntries(e,options={}){
  try{
    localStorage.setItem('familylog_entries',JSON.stringify(e));
    try{sessionStorage.setItem('familylog_backup',JSON.stringify(e))}catch(ex){}
    if(!options.skipSync)scheduleCloudSync('entries-change');
  }catch(e){}
}
function loggedEntryCount(entries=getEntries()){
  return Object.values(entries).filter(e=>e&&e.week&&e.week!=='not-logged').length;
}

const CHECKIN_FLOW_SCREENS=new Set([
  's-week','s-dad-mode','s-allkids','s-whichkids','s-absent','s-mom-helped-kids',
  's-mom-helped-activity','s-dad-wk-mom-had','s-mom-mode','s-mom-easy',
  's-helped-activity','s-mom-dad-had',
  's-dad-help-choice','s-change-context','s-diary'
]);
const FEEDBACK_VISIBLE_SCREENS=new Set(['s-home','s-cal','s-export','s-setup']);
let screenStack=[];
let screenTransitionTimer=null;

function syncFeedbackButton(screenId){
  const btn=document.getElementById('alpha-feedback-btn');
  if(!btn)return;
  btn.hidden=!FEEDBACK_VISIBLE_SCREENS.has(screenId);
}

function setActiveScreenMeta(screenId){
  const appEl=document.getElementById('app');
  document.documentElement.dataset.activeScreen=screenId;
  document.body.dataset.activeScreen=screenId;
  if(appEl)appEl.dataset.activeScreen=screenId;
}

function show(id,direction){
  const next=document.getElementById(id);
  if(!next)return;
  if(policySaveBusy&&document.querySelector('.screen.active')?.id!==id)policySaveNavigationToken++;
  if(id!=='s-ob-welcome')document.getElementById('account-deleted-notice').hidden=true;
  if(screenTransitionTimer){
    clearTimeout(screenTransitionTimer);
    screenTransitionTimer=null;
  }
  setActiveScreenMeta(id);
  const current=document.querySelector('.screen.active:not(.screen-leave)')||document.querySelector('.screen.active');
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
    document.querySelectorAll('.screen.active').forEach(s=>{if(s!==current&&s!==next)s.classList.remove('active')});
    current.classList.add('screen-leave',leaveClass);
    next.classList.add('active','screen-enter',enterClass);
    screenTransitionTimer=window.setTimeout(()=>{
      current.classList.remove('active','screen-leave',leaveClass);
      next.classList.remove('screen-enter',enterClass);
      screenTransitionTimer=null;
    },320);
  }else{
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    next.classList.add('active');
  }
  if(id==='s-home')initHome();
  syncFeedbackButton(id);
  window.scrollTo(0,0);
}
function blankCheckinState(){
  return {week:null,dadMode:null,momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'',attachment:null,changeAgreed:null,changePressured:null,changeContextNext:null,changeContextBack:null};
}
const CHECKIN_PHASES=['Schedule','Kids','Details'];
const CHECKIN_PHASE_BY_PROGRESS={
  'prog-week':'Schedule',
  'prog-dad-mode':'Kids',
  'prog-mom-mode':'Kids',
  'prog-allkids':'Kids',
  'prog-whichkids':'Kids',
  'prog-absent':'Kids',
  'prog-dad-wk-mom-had':'Kids',
  'prog-mom-dad-had':'Kids',
  'prog-dad-help-choice':'Details',
  'prog-mom-easy':'Details',
  'prog-mom-helped-kids':'Details',
  'prog-mom-helped-activity':'Details',
  'prog-helped-activity':'Details',
  'prog-change-context':'Details',
  'prog-diary':'Details',
};
function renderPhaseProgress(el,activePhase){
  el.innerHTML=CHECKIN_PHASES.map(phase=>`<span class="${phase===activePhase?'active':''}">${phase}</span>`).join('');
}
function setProg(id,step,total){
  const el=document.getElementById(id);if(!el)return;
  if(el.classList.contains('phase-progress')){
    renderPhaseProgress(el,CHECKIN_PHASE_BY_PROGRESS[id]||'Schedule');
    return;
  }
  el.innerHTML='';for(let i=0;i<total;i++){const d=document.createElement('div');d.className='pd'+(i<step?' done':'')+(i===step?' active':'');el.appendChild(d)}
}


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
  recordAppSession();
  initHome();
  show('s-home');
}

function showLoggedOutLogin(){
  showLoggedOutAuth('login');
}
function showLoggedOutSignup(){
  if(loggedOutAuthBusy)return;
  initOnboarding();
  show('s-ob-name');
}
function showLoggedOutAuth(mode){
  if(loggedOutAuthBusy)return;
  loggedOutAuthMode=mode;
  const signup=mode==='signup';
  document.getElementById('ob-auth-label').textContent=signup?'New account':'Welcome back';
  document.getElementById('ob-auth-title').textContent=signup?'Sign up':'Sign in';
  document.getElementById('ob-auth-description').textContent=signup
    ?"Create your account with a secure email link. Then we'll help you set up your parenting log."
    :"Use the email for your existing account. We'll send a secure link to restore your profile and records.";
  document.getElementById('ob-auth-switch-signup').hidden=signup;
  document.getElementById('ob-auth-switch-login').hidden=!signup;
  document.getElementById('ob-login-restore').hidden=true;
  setLoggedOutAuthMessage('');
  updateLoggedOutSignInButton();
  show('s-ob-login');
  initLoggedOutLoginUi();
}

async function initLoggedOutLoginUi(){
  const entry=document.getElementById('ob-login-entry');
  const email=document.getElementById('ob-login-email');
  if(entry)entry.hidden=!loggedOutAuthEnabled();
  if(!loggedOutAuthEnabled()){
    setLoggedOutAuthMessage('Cloud sign-in is not available in this build.','error');
    return;
  }
  if(email&&!email.value)email.value=APP_CONFIG.email||'';
  await refreshLoggedOutLoginUi(false);
}

function loggedOutLoginActive(){
  return !!document.getElementById('s-ob-login')?.classList.contains('active');
}

async function refreshLoggedOutLoginUi(showMessage=true){
  if(!loggedOutAuthEnabled()||loggedOutAuthBusy)return;
  const restoreBtn=document.getElementById('ob-login-restore');
  let session=null;
  try{
    setLoggedOutAuthBusy(true);
    if(showMessage)setLoggedOutAuthMessage('Checking sign-in status...');
    session=await window.WhoseDayBackend.getSession();
    if(session){
      if(restoreBtn)restoreBtn.hidden=false;
      setLoggedOutAuthMessage('Signed in. Opening your account...','success');
    }else{
      if(restoreBtn)restoreBtn.hidden=true;
      if(showMessage)setLoggedOutAuthMessage('Not signed in yet. Use the email link, then return here.');
    }
  }catch(error){
    setLoggedOutAuthMessage(error.message||'Could not check sign-in status.','error');
  }finally{
    setLoggedOutAuthBusy(false);
  }
  // Release the status-check lock before starting restoration.
  if(session&&loggedOutLoginActive())await restoreLoggedOutCloudAccount(session);
}

function resumeLoggedOutLogin(){
  if(loggedOutLoginActive())refreshLoggedOutLoginUi(false);
}

async function sendLoggedOutSignInLink(){
  if(loggedOutAuthBusy)return;
  const button=document.getElementById('ob-login-send');
  const cooldown=loggedOutSignInCooldownRemaining();
  if(cooldown>0){
    setLoggedOutAuthMessage(`A sign-in link was just sent. Check your inbox or spam folder, then try again in ${Math.ceil(cooldown/1000)} seconds if needed.`);
    updateLoggedOutSignInButton();
    return;
  }
  const input=document.getElementById('ob-login-email');
  const email=(input?.value||'').trim();
  if(!isValidEmail(email)){
    setLoggedOutAuthMessage('Enter a valid email address first.','error');
    if(input)input.focus();
    return;
  }
  try{
    setLoggedOutAuthBusy(true);
    if(button){button.textContent='Sending...';button.setAttribute('aria-busy','true')}
    setLoggedOutAuthMessage('');
    await window.WhoseDayBackend.signInWithEmail(email,cloudRedirectUrl(),{createUser:loggedOutAuthMode==='signup'});
    startLoggedOutSignInCooldown();
    setLoggedOutAuthMessage(`${loggedOutAuthMode==='signup'?'Sign-up':'Sign-in'} link sent. Check your inbox or spam folder, then return here from the email link.`,'success');
  }catch(error){
    const message=String(error?.message||'');
    if(/rate limit/i.test(message)){
      startLoggedOutSignInCooldown();
      setLoggedOutAuthMessage('Supabase is waiting before sending another link. Check your inbox or spam folder, then try again in about a minute if needed.','error');
    }else if(loggedOutAuthMode==='login'&&/signups not allowed|user not found/i.test(message)){
      setLoggedOutAuthMessage('Could not send a sign-in link for this email. Check the address or choose Sign up to create an account.','error');
    }else{
      setLoggedOutAuthMessage(message||'Could not send the sign-in link.','error');
    }
  }finally{
    if(button)button.removeAttribute('aria-busy');
    setLoggedOutAuthBusy(false);
  }
}

async function restoreLoggedOutCloudAccount(session=null){
  if(loggedOutAuthBusy)return;
  try{
    setLoggedOutAuthBusy(true);
    session=session||await window.WhoseDayBackend.getSession();
    if(!session)throw new Error('Sign in before restoring your cloud account.');
    const profile=await window.WhoseDayBackend.getProfile(session.user.id);
    if(!loggedOutLoginActive())return;
    // A profile written by an older startup sync is not completed onboarding.
    if(!profile?.terms_accepted_at){
      OB_STATE.email=session.user.email||'';
      document.getElementById('ob-email').value=OB_STATE.email;
      show('s-ob-name');
      return;
    }
    saveConfig(configFromProfile(profile));
    const cloudRows=await window.WhoseDayBackend.getCustodyEntries(session.user.id);
    const entries=getEntries();
    let restored=0;
    cloudRows.forEach(row=>{
      if(row?.entry_date&&row.entry_json&&!entries[row.entry_date]){
        entries[row.entry_date]=row.entry_json;
        restored++;
      }
    });
    if(restored)putEntries(entries,{skipSync:true});
    rememberEntrySyncBase(session.user.id,cloudRows.filter(row=>entriesMatch(entries[row.entry_date],row.entry_json)));
    await recordSyncDevice(session.user.id);
    setOnboardingMode(false);
    renderConfigurableUi();
    recordAppSession();
    initHome();
    setLoggedOutAuthMessage('');
    show('s-home');
  }catch(error){
    setLoggedOutAuthMessage(error.message||'Could not restore your cloud account.','error');
  }finally{
    setLoggedOutAuthBusy(false);
  }
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

async function obFinish(){
  if(policySaveBusy)return;
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

  const button=document.getElementById('btn-ob-finish');
  const navigationToken=policySaveNavigationToken;
  try{
    setPolicySaveBusy(true,button);
    const acceptance=await capturePolicyAcceptance(email,{preview:ONBOARDING_PREVIEW});
    if(navigationToken!==policySaveNavigationToken||!document.getElementById('s-ob-finish').classList.contains('active'))return;
    saveConfig({
      currentParentLabel:name,
      coParentLabel:coparent,
      children:kids.length?kids:DEFAULT_CONFIG.children,
      activityIds:defaultActIds,
      email,
      ...acceptance,
      purpose:'',
    },!ONBOARDING_PREVIEW);
  }finally{setPolicySaveBusy(false,button)}
  setOnboardingMode(false);
  renderConfigurableUi();
  if(!ONBOARDING_PREVIEW)recordAppSession();
  initHome();
  show('s-home');
}

// Kick off onboarding — init first kid row
function initOnboarding(){
  const list=document.getElementById('ob-kids-list');
  if(list&&!list.children.length) obAddKid();
  const entry=document.getElementById('ob-login-entry');
  if(entry)entry.hidden=!loggedOutAuthEnabled();
}
function shouldOpenLoggedOutLoginOnBoot(){
  return loggedOutAuthEnabled()&&(/(?:access_token|refresh_token|error)=/.test(window.location.hash)||new URLSearchParams(window.location.search).has('code'));
}
// ── END MULTI-STEP ONBOARDING ─────────────────────────────────────


// ── ACTIVITY PERSONALIZATION PROMPT ───────────────────────────────
function checkActivityPrompt(){
  if(localStorage.getItem(ACTIVITY_PROMPT_SHOWN_KEY)||localStorage.getItem(ACTIVITY_PROMPT_DISMISSED_KEY))return;
  const sessions=parseInt(localStorage.getItem(SESSION_COUNT_KEY)||'0',10)||0;
  if(sessions===3){
    localStorage.setItem(ACTIVITY_PROMPT_SHOWN_KEY,'1');
    document.getElementById('activity-prompt').style.display='block';
  }
}
function dismissActivityPrompt(){
  document.getElementById('activity-prompt').style.display='none';
  localStorage.setItem(ACTIVITY_PROMPT_SHOWN_KEY,'1');
  localStorage.setItem(ACTIVITY_PROMPT_DISMISSED_KEY,'1');
}
// ── END ACTIVITY PERSONALIZATION PROMPT ───────────────────────────

// ── WELCOME SCREEN ────────────────────────────────────
function startWelcome(){initOnboarding();show('s-ob-welcome');}
function skipWelcome(){obSkip();}
// ── END WELCOME ───────────────────────────────────────
function showSetup(){setOnboardingMode(false);initSetupForm();show('s-setup')}
function resetWeekCards(){
  const classes={dad:'checkin-decision-card planned',mom:'checkin-decision-card change'};
  Object.entries(classes).forEach(([w,cls])=>{const el=document.getElementById('wk-'+w);if(el)el.className=cls});
}

function initHome(){
  markMissedDays();
  checkMissedPrompt();
  checkActivityPrompt();
  const now=new Date();
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  document.getElementById('home-date').textContent=days[now.getDay()]+', '+MONTHS[now.getMonth()]+' '+now.getDate()+', '+now.getFullYear();
  const entries=getEntries(),dates=Object.keys(entries).sort().reverse();
  const todayEntry=entries[todayStr()];
  updateHomeTodayState(todayEntry);
  const canShowWeeklyReport=loggedEntryCount(entries)>=2;
  const weeklyRow=document.getElementById('weekly-report-row');
  if(weeklyRow)weeklyRow.style.display=canShowWeeklyReport?'grid':'none';
  const sundayPrompt=document.getElementById('sunday-prompt');
  if(sundayPrompt)sundayPrompt.style.display='none';
  if(sundayPrompt&&canShowWeeklyReport&&now.getDay()===0&&!localStorage.getItem('sunday_prompt_'+todayStr()))sundayPrompt.style.display='block';
  if(!dates.length)return;
  const last=dates[0],e=entries[last];
  let desc=describeEntry(e);
  document.getElementById('home-recent-inner').innerHTML=`<div class="entry-date-lbl">${fmtShort(last)}</div><div class="entry-row">${desc}</div>${e.diary?`<div class="entry-row" style="color:#666;font-style:italic;font-size:13px;margin-top:3px">"${e.diary.substring(0,90)}${e.diary.length>90?'…':''}"</div>`:''}`;
  document.getElementById('home-recent').style.display='block';
}
function updateHomeTodayState(entry){
  const card=document.getElementById('home-checkin-card');
  const title=document.getElementById('home-plan-title');
  const sub=document.getElementById('home-plan-sub');
  const button=document.getElementById('home-primary-btn');
  const label=document.getElementById('home-primary-label');
  const icon=document.getElementById('home-primary-icon');
  if(!card||!title||!sub||!button||!label||!icon)return;
  const hasLoggedToday=entry&&entry.week&&entry.week!=='not-logged';
  card.classList.toggle('logged',!!hasLoggedToday);
  if(hasLoggedToday){
    title.textContent='Already logged';
    sub.textContent=homeLoggedSummary(entry)+' You can still update today if something changed.';
    label.textContent='Edit today';
    icon.textContent='↺';
    button.onclick=startTodayEdit;
  }else{
    title.textContent='Ready to log today';
    sub.textContent='Track actual custody time in under 30 seconds.';
    label.textContent='Log today';
    icon.textContent='✓';
    button.onclick=startCheckin;
  }
}
function homeLoggedSummary(entry){
  if(entry.dadMode==='mom-had'||entry.momMode==='dad-had')return'Schedule change logged.';
  if(entry.week==='mom')return"Co-parent's scheduled day is logged.";
  return'Your scheduled day is logged.';
}
function describeEntry(e){
  if(e.week==='not-logged')return e.intentional?'Skipped intentionally':'Nothing logged';
  if(e.week==='other')return'Pre-agreed day note';
  if(e.dadMode==='mom-had')return"Your day · Kids at "+coParentPoss()+': '+(e.momHadKidsOnDadWeek||[]).join(', ');
  if(e.dadMode==='dad-helped-mom')return'Your day · '+coParent()+' helped: '+(e.momHadKidsOnDadWeek||[]).join(', ');
  if(e.momMode==='easy')return coParent()+' had kids';
  if(e.momMode==='helped')return'You helped: '+(e.helpedKids||[]).join(', ');
  if(e.momMode==='dad-had')return'You had: '+(e.dadHadKids||[]).join(', ');
  const n=(e.kidsWithDad||[]).length;return n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')+' home';
}

function startCheckin(options={}){
  S=blankCheckinState();
  if(!options.keepDate)BACKFILL_DATE=null;
  easyOpts=[];diaryOrigin='';
  removeAttachment('diary');
  resetWeekCards();
  document.getElementById('week-hint').style.display='none';
  show('s-week');
}

function startTodayEdit(){
  const entry=getEntries()[todayStr()];
  if(!entry||!entry.week||entry.week==='not-logged'){startCheckin();return}
  BACKFILL_DATE=todayStr();
  S=entryToCheckinState(entry);
  easyOpts=[...S.momOpts];
  diaryOrigin='';
  prepareEditTarget('s-week');
  show('s-week');
}

function entryToCheckinState(entry){
  const state=blankCheckinState();
  state.week=entry.week||null;
  state.dadMode=entry.dadMode||null;
  state.momMode=entry.momMode||null;
  state.kidsWithDad=[...(entry.kidsWithDad||[])];
  state.absentData={...(entry.absentData||{})};
  state.momOpts=[...(entry.momOpts||[])];
  state.helpedKids=[...(entry.helpedKids||[])];
  state.helpedData={...(entry.helpedData||{})};
  state.dadHadKids=[...(entry.dadHadKids||entry.kidsWithDad||[])];
  state.momHadKidsOnDadWeek=[...(entry.momHadKidsOnDadWeek||[])];
  state.momHelpedOnDadWeek={...(entry.momHelpedOnDadWeek||{})};
  state.diary=entry.diary||'';
  state.attachment=entry.attachment||null;
  state.changeAgreed=entry.changeAgreed??null;
  state.changePressured=entry.changePressured??null;
  if(state.dadMode==='mom-had'){state.changeContextBack='s-dad-wk-mom-had';state.changeContextNext='dad-to-mom'}
  if(state.momMode==='dad-had'){state.changeContextBack='s-mom-dad-had';state.changeContextNext='mom-to-dad'}
  return state;
}

function resetCheckinBranch(){
  // Keep authored notes/evidence when a user changes an answer, but discard
  // custody/help/context answers belonging to the abandoned branch.
  S={...blankCheckinState(),week:S.week,diary:S.diary,attachment:S.attachment};
  easyOpts=[];
}
function setWeek(w){
  if(S.week!==w)resetCheckinBranch();
  S.week=w;
  const hints={dad:'Your scheduled custody day — how did it actually go?',mom:coParentPoss()+" scheduled day — you'll describe how involved you were."};
  const hintEl=document.getElementById('week-hint');
  hintEl.style.display='block';hintEl.style.padding='10px 13px';
  hintEl.style.background=w==='mom'?'#faece7':'#f2f2f0';
  hintEl.style.color=w==='mom'?'#993c1d':'#666';
  hintEl.textContent=hints[w];
  resetWeekCards();
  document.getElementById('wk-'+w).classList.add(w==='mom'?'sel-mom':'sel');
  if(w==='dad')setTimeout(()=>{setProg('prog-dad-mode',0,4);document.querySelectorAll('#s-dad-mode .scene-card').forEach(c=>c.className='scene-card');show('s-dad-mode')},300);
  else if(w==='mom')setTimeout(()=>{setProg('prog-mom-mode',0,3);document.querySelectorAll('#s-mom-mode .scene-card').forEach(c=>c.className='scene-card');show('s-mom-mode')},300);
}

// DAD MODE
function setDadMode(mode){
  if(S.dadMode!==mode)resetCheckinBranch();
  S.dadMode=mode;
  document.querySelectorAll('#s-dad-mode .scene-card').forEach(c=>c.className='scene-card');
  const idMap={'normal':'sc-dad-normal','dad-helped-mom':'sc-dad-normal','mom-had':'sc-dad-momhad'};
  document.getElementById(idMap[mode]).classList.add(mode==='mom-had'?'sel-warn':'sel-dad');
  if(mode==='normal')setTimeout(()=>{goToAllKidsStep('s-dad-mode')},250);
  else if(mode==='dad-helped-mom')setTimeout(()=>{showDadHelpChoice()},250);
  else setTimeout(()=>{KIDS.forEach(k=>kidBtn('dwm',k).className='kid-btn');const all=document.getElementById('dwm-all');if(all)all.className='kid-btn';S.momHadKidsOnDadWeek=[];updateDadWkMomSummary();document.getElementById('dwm-next').disabled=true;setProg('prog-dad-wk-mom-had',2,5);show('s-dad-wk-mom-had')},250);
}

function toggleMomHelpedKid(name){
  const btn=kidBtn('mhk',name),idx=S.momHadKidsOnDadWeek.indexOf(name);
  if(idx>=0){S.momHadKidsOnDadWeek.splice(idx,1);btn.classList.remove('with-mom')}else{S.momHadKidsOnDadWeek.push(name);btn.classList.add('with-mom')}
  document.getElementById('mom-helped-next').disabled=S.momHadKidsOnDadWeek.length===0;updateMomHelpedSummary();
}
function updateMomHelpedSummary(){const el=document.getElementById('mom-helped-summary');if(!S.momHadKidsOnDadWeek.length){el.textContent='Tap the kids '+coParent()+' was involved with';return}el.innerHTML='<strong style="color:#993c1d">'+coParent()+' helped with:</strong> '+S.momHadKidsOnDadWeek.join(', ')}
function startMomHelpedLoop(){
  momHelpedQueue=[...S.momHadKidsOnDadWeek];momHelpedIdx=0;
  startMomHelpedActivities();
}
function startMomHelpedActivities(){
  momHelpedIdx=0;showMomHelpedStep();
}
function showMomHelpedStep(){
  const kid=momHelpedQueue[momHelpedIdx],total=momHelpedQueue.length;
  document.getElementById('mha-step-lbl').textContent='Kid '+(momHelpedIdx+1)+' of '+total;
  document.getElementById('mha-kid-name').textContent=kid;document.getElementById('mha-avatar').textContent=kid[0];
  document.getElementById('mha-q').textContent='What did '+coParent()+' help with?';
  if(!S.momHelpedOnDadWeek[kid])S.momHelpedOnDadWeek[kid]={acts:[],note:''};
  document.getElementById('mha-note').value=S.momHelpedOnDadWeek[kid].note||'';
  document.querySelectorAll('#mha-acts .act-btn').forEach(b=>{b.classList.toggle('sel',S.momHelpedOnDadWeek[kid].acts.includes(activityButtonId(b)))});
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
  else{goToDiary('s-mom-helped-activity','Anything else to note?','A quick diary — how was today?',4,5)}
}
function goBackFromMomHelped(){if(momHelpedIdx>0){momHelpedIdx--;showMomHelpedStep()}else show('s-dad-help-choice')}

function toggleDadWkMomKid(name){
  const all=document.getElementById('dwm-all');if(all)all.classList.remove('with-mom');
  const btn=kidBtn('dwm',name),idx=S.momHadKidsOnDadWeek.indexOf(name);
  if(idx>=0){S.momHadKidsOnDadWeek.splice(idx,1);btn.classList.remove('with-mom')}else{S.momHadKidsOnDadWeek.push(name);btn.classList.add('with-mom')}
  document.getElementById('dwm-next').disabled=S.momHadKidsOnDadWeek.length===0;updateDadWkMomSummary();
}
function setDadWkMomAll(){S.momHadKidsOnDadWeek=[...KIDS];KIDS.forEach(k=>kidBtn('dwm',k).classList.add('with-mom'));const all=document.getElementById('dwm-all');if(all)all.classList.add('with-mom');document.getElementById('dwm-next').disabled=false;updateDadWkMomSummary()}
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
  if(all){S.kidsWithDad=[...KIDS];S.absentData={};setTimeout(()=>{
    if(S._afterMomHelped){S._afterMomHelped=false;startMomHelpedActivities();}
    else{showDadHelpChoice(confirmBackTarget||'s-allkids');}
  },200)}
  else{KIDS.forEach(k=>kidBtn('kb',k).classList.remove('with-dad'));const allMom=document.getElementById('kb-allMom');if(allMom)allMom.classList.remove('all-mom');S.kidsWithDad=[];updateWhoSummary();setTimeout(()=>{setProg('prog-whichkids',2,4);show('s-whichkids')},200)}
}
function toggleKid(name){
  const allMom=document.getElementById('kb-allMom');if(allMom)allMom.classList.remove('all-mom');
  const btn=kidBtn('kb',name),idx=S.kidsWithDad.indexOf(name);
  if(idx>=0){S.kidsWithDad.splice(idx,1);btn.classList.remove('with-dad')}else{S.kidsWithDad.push(name);btn.classList.add('with-dad')}
  updateWhoSummary();
}
function setAllMom(){S.kidsWithDad=[];KIDS.forEach(k=>kidBtn('kb',k).classList.remove('with-dad'));const allMom=document.getElementById('kb-allMom');if(allMom)allMom.classList.toggle('all-mom');updateWhoSummary()}
function updateWhoSummary(){
  const allMomBtn=document.getElementById('kb-allMom');
  const el=document.getElementById('who-summary-text'),allMom=allMomBtn&&allMomBtn.classList.contains('all-mom');
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
    showDadHelpChoice('s-whichkids');return;
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
    else{showDadHelpChoice('s-absent');}
  }
}
function goBackFromAbsent(){if(absentIdx>0){absentIdx--;showAbsentStep()}else show('s-whichkids')}
function goBackFromDiary(){show(diaryOrigin||'s-week')}

function showDadHelpChoice(backTarget){
  const backBtn=document.getElementById('dad-help-back-btn');
  if(backBtn)backBtn.dataset.back=backTarget||'s-allkids';
  document.getElementById('dad-help-no').classList.remove('sel');
  document.getElementById('dad-help-yes').classList.remove('sel');
  setProg('prog-dad-help-choice',4,5);
  show('s-dad-help-choice');
}
function goBackFromDadHelpChoice(){
  const target=document.getElementById('dad-help-back-btn')?.dataset.back||'s-allkids';
  show(target);
}
function setDadHelpedChoice(helped){
  document.getElementById('dad-help-no').classList.toggle('sel',!helped);
  document.getElementById('dad-help-yes').classList.toggle('sel',helped);
  if(!helped){
    S.dadMode='normal';
    S.momHadKidsOnDadWeek=[];
    S.momHelpedOnDadWeek={};
    setTimeout(()=>goToDiary('s-dad-help-choice','Anything else to note?','A quick diary — how was today?',4,5),180);
    return;
  }
  S.dadMode='dad-helped-mom';
  S.momHadKidsOnDadWeek=[...S.kidsWithDad];
  S.momHelpedOnDadWeek={};
  setTimeout(()=>{
    if(!S.momHadKidsOnDadWeek.length){
      goToDiary('s-dad-help-choice','Anything else to note?','A quick diary — how was today?',4,5);
      return;
    }
    startMomHelpedLoop();
  },180);
}


// MOM MODE
function toggleEasyOpt(el,key){
  if(key==='none'){easyOpts=['none'];document.querySelectorAll('#easy-opts .opt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');document.getElementById('easy-continue-btn').disabled=false;return}
  document.querySelector('#easy-opts .opt[onclick*="none"]').classList.remove('sel');easyOpts=easyOpts.filter(o=>o!=='none');
  el.classList.toggle('sel');const i=easyOpts.indexOf(key);if(i>=0)easyOpts.splice(i,1);else easyOpts.push(key);
  document.getElementById('easy-continue-btn').disabled=easyOpts.length===0;
}
function continueMomEasy(){
  S.diary=document.getElementById('easy-note').value.trim();
  if(easyOpts.includes('helped')){
    S.momMode='helped';
    S.helpedKids=[...KIDS];
    S.helpedData={};
    setTimeout(()=>startHelpedLoop(),180);
    return;
  }
  S.momMode='easy';
  S.momOpts=[...easyOpts];
  saveEntry();
}
function setMomMode(mode){
  if(S.momMode!==mode)resetCheckinBranch();
  S.momMode=mode;
  document.querySelectorAll('#s-mom-mode .scene-card').forEach(c=>c.className='scene-card');
  const idMap={easy:'ft-easy',helped:'ft-easy','dad-had':'ft-dad'};
  document.getElementById(idMap[mode]).classList.add(mode==='dad-had'?'sel-warn':'sel-dad');
  if(mode==='easy')setTimeout(()=>{setProg('prog-mom-easy',1,3);document.querySelectorAll('#easy-opts .opt').forEach(o=>o.classList.remove('sel'));easyOpts=[];document.getElementById('easy-note').value='';document.getElementById('easy-continue-btn').disabled=true;show('s-mom-easy')},250);
  else if(mode==='helped')setTimeout(()=>{S.helpedKids=[...KIDS];S.helpedData={};startHelpedLoop()},250);
  else setTimeout(()=>{KIDS.forEach(k=>kidBtn('dh',k).classList.remove('with-dad'));const all=document.getElementById('dh-allThree');if(all)all.classList.remove('with-dad');S.dadHadKids=[];updateDadHadSummary();document.getElementById('dad-had-next').disabled=true;setProg('prog-mom-dad-had',1,3);show('s-mom-dad-had')},250);
}
function startHelpedLoop(){helpedQueue=[...S.helpedKids];helpedIdx=0;showHelpedStep()}
function showHelpedStep(){
  const kid=helpedQueue[helpedIdx],total=helpedQueue.length;
  document.getElementById('helped-step-lbl').textContent='Kid '+(helpedIdx+1)+' of '+total;
  document.getElementById('helped-kid-name').textContent=kid;document.getElementById('helped-avatar').textContent=kid[0];
  document.getElementById('helped-q').textContent='What did you help with?';
  if(!S.helpedData[kid])S.helpedData[kid]={acts:[],note:''};
  document.getElementById('helped-note').value=S.helpedData[kid].note||'';
  document.querySelectorAll('#helped-acts .act-btn').forEach(b=>{b.classList.toggle('sel',S.helpedData[kid].acts.includes(activityButtonId(b)))});
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
  else{goToDiary('s-helped-activity','Anything else to note?','A quick diary — how was today?',3,4)}
}
function goBackFromHelped(){if(helpedIdx>0){helpedIdx--;showHelpedStep()}else show('s-mom-easy')}
function toggleDadHadKid(name){
  const all=document.getElementById('dh-allThree');if(all)all.classList.remove('with-dad');
  const btn=kidBtn('dh',name),idx=S.dadHadKids.indexOf(name);
  if(idx>=0){S.dadHadKids.splice(idx,1);btn.classList.remove('with-dad')}else{S.dadHadKids.push(name);btn.classList.add('with-dad')}
  document.getElementById('dad-had-next').disabled=S.dadHadKids.length===0;updateDadHadSummary();
}
function setDadHadAll(){S.dadHadKids=[...KIDS];KIDS.forEach(k=>kidBtn('dh',k).classList.add('with-dad'));const all=document.getElementById('dh-allThree');if(all)all.classList.add('with-dad');document.getElementById('dad-had-next').disabled=false;updateDadHadSummary()}
function updateDadHadSummary(){const el=document.getElementById('dad-had-summary');if(!S.dadHadKids.length){el.textContent='Tap the kids who were actually with you';return}el.innerHTML='<strong style="color:#3c3489">With you:</strong> '+S.dadHadKids.join(', ')}
function goDadHadDiary(){showChangeContext('s-mom-dad-had','mom-to-dad')}
function goToDadHadViaContext(){goDadHadDiary()}

function showChangeContext(backTarget,kind){
  S.changeContextBack=backTarget;S.changeContextNext=kind;S.changeAgreed=null;S.changePressured=null;
  resetChangeContextButtons();
  document.getElementById('pressure-section').style.display='none';
  document.getElementById('change-context-next').disabled=true;
  const dadToMom=kind==='dad-to-mom';
  document.getElementById('change-context-title').textContent=dadToMom?'Kids are with '+coParent():'Kids are with '+currentParent();
  document.getElementById('change-context-sub').textContent=dadToMom?'Your scheduled day changed.':'Their scheduled day changed.';
  setProg('prog-change-context',2,4);show('s-change-context');
}
function goBackFromChangeContext(){show(S.changeContextBack||'s-week')}
function resetChangeContextButtons(){
  document.querySelectorAll('#s-change-context .change-yn-btn').forEach(b=>{
    b.className='change-yn-btn';
    b.setAttribute('aria-pressed','false');
  });
}
function setChangeButtonSelected(id,selectedClass){
  const btn=document.getElementById(id);
  if(!btn)return;
  btn.className='change-yn-btn '+selectedClass;
  btn.setAttribute('aria-pressed','true');
}
function setAgreed(value){
  S.changeAgreed=value;S.changePressured=null;
  document.getElementById('agreed-yes').className='change-yn-btn';
  document.getElementById('agreed-no').className='change-yn-btn';
  document.getElementById('agreed-yes').setAttribute('aria-pressed','false');
  document.getElementById('agreed-no').setAttribute('aria-pressed','false');
  setChangeButtonSelected(value?'agreed-yes':'agreed-no',value?'sel-yes':'sel-no');
  document.getElementById('pressure-yes').className='change-yn-btn';
  document.getElementById('pressure-no').className='change-yn-btn';
  document.getElementById('pressure-yes').setAttribute('aria-pressed','false');
  document.getElementById('pressure-no').setAttribute('aria-pressed','false');
  document.getElementById('pressure-section').style.display=value?'block':'none';
  document.getElementById('change-context-next').disabled=value;
}
function setPressure(value){
  S.changePressured=value;
  document.getElementById('pressure-yes').className='change-yn-btn';
  document.getElementById('pressure-no').className='change-yn-btn';
  document.getElementById('pressure-yes').setAttribute('aria-pressed','false');
  document.getElementById('pressure-no').setAttribute('aria-pressed','false');
  setChangeButtonSelected(value?'pressure-yes':'pressure-no',value?'sel-pressure':'sel-ok');
  document.getElementById('change-context-next').disabled=false;
}
function goFromChangeContext(){
  goToDiary(
    's-change-context',
    'Document the schedule change',
    S.changeContextNext==='dad-to-mom'?'Write why the kids ended up at '+coParentPoss()+' during your day.':'Write why you ended up with the kids during '+coParentPoss()+' day.',
    3,
    4
  );
}

function goToDiary(origin,title,subtitle,step,total){
  diaryOrigin=origin;
  const deviation=origin==='s-change-context';
  document.getElementById('diary-q').textContent=title;
  document.getElementById('diary-sub').textContent=subtitle;
  document.getElementById('diary-input').value=S.diary||'';
  document.getElementById('diary-input').placeholder=deviation?'What changed? Who asked? What was said?':'Quiet evening at home...';
  document.getElementById('diary-next-btn').textContent='Log it →';
  document.getElementById('s-diary').classList.toggle('deviation-doc-mode',deviation);
  document.getElementById('deviation-doc-callout').style.display=deviation?'block':'none';
  document.getElementById('deviation-empty-confirm').style.display='none';
  const attachOptional=document.getElementById('diary-attach-optional');
  const attachSub=document.getElementById('diary-attach-sub');
  if(attachOptional)attachOptional.textContent=deviation?'recommended':'optional';
  if(attachSub)attachSub.textContent=deviation?'Texts, emails, schedule messages, or anything that explains the change':'Text message, email, or anything relevant to this entry';
  renderAttachment('diary');
  setProg('prog-diary',step,total);
  show('s-diary');
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

function escHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

function prepareEditTarget(target){
  if(target==='s-week'){
    resetWeekCards();
    if(S.week){
      const el=document.getElementById('wk-'+S.week);
      if(el)el.classList.add(S.week==='mom'?'sel-mom':'sel');
    }
  }
  if(target==='s-dad-mode'){
    document.querySelectorAll('#s-dad-mode .scene-card').forEach(c=>c.className='scene-card');
    const idMap={'normal':'sc-dad-normal','dad-helped-mom':'sc-dad-normal','mom-had':'sc-dad-momhad'};
    const el=document.getElementById(idMap[S.dadMode]);
    if(el)el.classList.add(S.dadMode==='mom-had'?'sel-warn':'sel-dad');
    setProg('prog-dad-mode',0,4);
  }
  if(target==='s-mom-mode'){
    document.querySelectorAll('#s-mom-mode .scene-card').forEach(c=>c.className='scene-card');
    const idMap={easy:'ft-easy',helped:'ft-easy','dad-had':'ft-dad'};
    const el=document.getElementById(idMap[S.momMode]);
    if(el)el.classList.add(S.momMode==='dad-had'?'sel-warn':'sel-dad');
    setProg('prog-mom-mode',0,3);
  }
  if(target==='s-allkids'){
    const all=KIDS.length>0&&S.kidsWithDad.length===KIDS.length;
    document.getElementById('ak-yes').classList.toggle('sel',all);
    document.getElementById('ak-no').classList.toggle('sel',!all);
    setProg('prog-allkids',1,4);
  }
  if(target==='s-whichkids'){
    KIDS.forEach(k=>kidBtn('kb',k).classList.toggle('with-dad',S.kidsWithDad.includes(k)));
    const allMom=document.getElementById('kb-allMom');
    if(allMom)allMom.classList.toggle('all-mom',S.kidsWithDad.length===0);
    updateWhoSummary();
    setProg('prog-whichkids',2,4);
  }
  if(target==='s-dad-wk-mom-had'){
    KIDS.forEach(k=>kidBtn('dwm',k).classList.toggle('with-mom',S.momHadKidsOnDadWeek.includes(k)));
    const all=document.getElementById('dwm-all');
    if(all)all.classList.toggle('with-mom',KIDS.length>0&&S.momHadKidsOnDadWeek.length===KIDS.length);
    document.getElementById('dwm-next').disabled=S.momHadKidsOnDadWeek.length===0;
    updateDadWkMomSummary();
    setProg('prog-dad-wk-mom-had',2,5);
  }
  if(target==='s-mom-helped-kids'){
    KIDS.forEach(k=>kidBtn('mhk',k).classList.toggle('with-mom',S.momHadKidsOnDadWeek.includes(k)));
    document.getElementById('mom-helped-next').disabled=S.momHadKidsOnDadWeek.length===0;
    updateMomHelpedSummary();
    setProg('prog-mom-helped-kids',4,5);
  }
  if(target==='s-mom-easy'){
    easyOpts=[...(S.momOpts.length?S.momOpts:['none'])];
    document.querySelectorAll('#easy-opts .opt').forEach(o=>{
      const key=(o.getAttribute('onclick')||'').match(/'([^']+)'/)?.[1];
      o.classList.toggle('sel',easyOpts.includes(key));
    });
    document.getElementById('easy-note').value=S.diary||'';
    document.getElementById('easy-continue-btn').disabled=easyOpts.length===0;
    setProg('prog-mom-easy',1,3);
  }
  if(target==='s-mom-dad-had'){
    KIDS.forEach(k=>kidBtn('dh',k).classList.toggle('with-dad',S.dadHadKids.includes(k)));
    const all=document.getElementById('dh-allThree');
    if(all)all.classList.toggle('with-dad',KIDS.length>0&&S.dadHadKids.length===KIDS.length);
    document.getElementById('dad-had-next').disabled=S.dadHadKids.length===0;
    updateDadHadSummary();
    setProg('prog-mom-dad-had',1,3);
  }
  if(target==='s-change-context'){
    resetChangeContextButtons();
    document.getElementById('pressure-section').style.display=S.changeAgreed?'block':'none';
    if(S.changeAgreed!==null)setChangeButtonSelected(S.changeAgreed?'agreed-yes':'agreed-no',S.changeAgreed?'sel-yes':'sel-no');
    if(S.changePressured!==null)setChangeButtonSelected(S.changePressured?'pressure-yes':'pressure-no',S.changePressured?'sel-pressure':'sel-ok');
    document.getElementById('change-context-next').disabled=S.changeAgreed===null||S.changeAgreed===true&&S.changePressured===null;
    setProg('prog-change-context',2,4);
  }
  if(target==='s-diary'){
    diaryOrigin='s-saved';
    goToDiary('s-saved','Anything else to note?','A quick diary — how was today?',3,4);
    setProg('prog-diary',3,4);
  }
}
function needsDeviationDocumentationPrompt(){
  return diaryOrigin==='s-change-context'&&(S.changeAgreed===false||S.changePressured===true)&&!S.diary.trim()&&!S.attachment;
}
function returnToDeviationDocs(){
  document.getElementById('deviation-empty-confirm').style.display='none';
  document.getElementById('diary-input').focus();
}
function saveEntry(options={}){
  captureEntryInputs();
  if(!options.allowEmptyDeviation&&needsDeviationDocumentationPrompt()){
    document.getElementById('deviation-empty-confirm').style.display='block';
    return;
  }
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
  if(isLockedEntry(saveDate)){alert('This entry is locked. Entries for dates before yesterday cannot be changed in the app.');return;}
  entries[saveDate]=e;putEntries(entries);
  showSavedEntry(e,saveDate,{celebrate:true});
}

function captureEntryInputs(){
  if(document.getElementById('s-diary')?.classList.contains('active'))S.diary=document.getElementById('diary-input').value;
  if(document.getElementById('s-mom-easy')?.classList.contains('active')){
    S.momOpts=[...easyOpts];
    S.diary=document.getElementById('easy-note').value.trim();
  }
}

function showSavedEntry(e,saveDate,options={}){
  let ring='✅',summary='';
  if(S.dadMode==='mom-had'){ring='🏡';summary="Your day · Kids at "+coParentPoss()+"\n"+S.momHadKidsOnDadWeek.join(', ')}
  else if(S.dadMode==='dad-helped-mom'){summary="Your day · "+coParent()+" helped: "+S.momHadKidsOnDadWeek.join(', ')}
  else if(S.momMode==='easy'){ring='✅';summary=coParentPoss()+" day · "+coParent()+" had the kids"}
  else if(S.momMode==='helped'){ring='🤝';summary=coParentPoss()+" day · You helped: "+S.helpedKids.join(', ')}
  else if(S.momMode==='dad-had'){ring='⚠️';summary=coParentPoss()+" day · You had: "+S.dadHadKids.join(', ')}
  else{const n=e.kidsWithDad.length;summary=(S.week==='dad'?'Your day · ':'')+(n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':e.kidsWithDad.join(', ')+' home')}
  const savedRing=document.getElementById('saved-ring');
  if(savedRing)savedRing.textContent=ring;
  document.getElementById('saved-summary').textContent=summary;
  renderSavedReceipt(e,saveDate);
  show('s-saved');
  if(options.celebrate)showSuccessOverlay();
}

function showSuccessOverlay(){
  const overlay=document.getElementById('success-overlay');
  if(!overlay)return;
  clearTimeout(successOverlayTimer);
  overlay.hidden=false;
  overlay.setAttribute('aria-hidden','false');
  overlay.classList.remove('visible');
  requestAnimationFrame(()=>overlay.classList.add('visible'));
  successOverlayTimer=setTimeout(()=>hideSuccessOverlay(),1800);
}

function hideSuccessOverlay(){
  const overlay=document.getElementById('success-overlay');
  if(!overlay)return;
  overlay.classList.remove('visible');
  overlay.setAttribute('aria-hidden','true');
  clearTimeout(successOverlayTimer);
  successOverlayTimer=setTimeout(()=>{overlay.hidden=true},260);
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
    ['Status','Older dates are read-only'],
  ];
  if(e.diary)rows.splice(3,0,['Note','Added']);
  if(e.attachment)rows.splice(3,0,['Attachment','Screenshot included']);
  receiptEl.innerHTML=rows.map(([key,val])=>`<div class="saved-receipt-row"><span>${escHtml(key)}</span><strong>${escHtml(val)}</strong></div>`).join('');
}
function savedEntryType(e){
  if(e.week==='other')return'Pre-agreed day note';
  if(e.dadMode==='mom-had')return'Your day changed';
  if(e.dadMode==='dad-helped-mom')return coParent()+' helped';
  if(e.momMode==='easy')return coParentPoss()+' day';
  if(e.momMode==='helped')return'You helped';
  if(e.momMode==='dad-had')return'Kids with you';
  return currentParentPoss()+' day';
}
function savedKidsLine(e){
  if(e.week==='other')return'Logged note';
  if(e.dadMode==='mom-had')return(e.momHadKidsOnDadWeek||[]).join(', ')||'Not specified';
  if(e.momMode==='dad-had')return(e.dadHadKids||[]).join(', ')||'Not specified';
  if(e.momMode==='helped')return(e.helpedKids||[]).join(', ')||'Not specified';
  const kids=e.kidsWithDad||[];
  if(kids.length===KIDS.length)return kidsCountLabel();
  if(kids.length===0)return'No kids with you';
  return kids.join(', ');
}
function goBackFromSaved(){
  prepareEditTarget('s-week');
  show('s-week');
}

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
      else if(e.week==='other')cls='mom-day';
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
  revealCalendarDetail();
}
function revealCalendarDetail(){
  const el=document.getElementById('cal-detail');
  if(!el)return;
  requestAnimationFrame(()=>el.scrollIntoView({behavior:'smooth',block:'center'}));
}
function showDetail(ds,e,{reveal=true}={}){
  selectedCalDate=ds;renderCal();
  const el=document.getElementById('cal-detail');el.style.display='block';
  let tag,body;
  if(e.week==='not-logged'){
    tag='<span class="tag tag-missed">Nothing logged</span>';
    body='<div class="entry-row" style="color:#666">Nothing logged for this day.</div>';
    el.innerHTML=`<div class="entry-card"><div class="entry-date-lbl">${fmtDate(ds)} ${tag}</div>${body}</div>`;
    if(reveal)revealCalendarDetail();
    return;
  }
  if(e.week==='other'){tag='<span class="tag tag-mom">Pre-agreed day note</span>';body=`<div class="entry-row" style="font-style:italic;color:#666">${e.diary||'No note'}</div>`}
  else if(e.dadMode==='mom-had'){tag='<span class="tag tag-teal">Your day · Kids at '+coParentPoss()+'</span>';body=`<div class="entry-row"><strong>At ${coParentPoss()}: ${(e.momHadKidsOnDadWeek||[]).join(', ')}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.dadMode==='dad-helped-mom'){tag='<span class="tag tag-dad">Your day</span>';const n=(e.kidsWithDad||[]).length;const acts=Object.entries(e.momHelpedOnDadWeek||{}).map(([k,v])=>`<div class="entry-row" style="color:#666">${k}: ${coParent()} — ${(v.acts||[]).map(activityLabel).join(', ')}</div>`).join('');body=`<div class="entry-row"><strong>${n===KIDS.length?kidsCountLabel()+' home':n===0?'No kids':(e.kidsWithDad||[]).join(', ')+' home'}</strong></div>${acts}${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.momMode==='easy'){tag='<span class="tag tag-mom">'+coParentPoss()+' day</span>';body=`<div class="entry-row">${coParent()} had ${kidsCountLabel()}</div>${e.diary?`<div class="entry-row" style="color:#666;margin-top:4px">${e.diary}</div>`:''}`}
  else if(e.momMode==='helped'){tag='<span class="tag tag-mom">'+coParentPoss()+' day · You helped</span>';const acts=Object.entries(e.helpedData||{}).map(([k,v])=>`<div class="entry-row" style="color:#666">${k}: ${(v.acts||[]).map(activityLabel).join(', ')}${v.note?' — '+v.note:''}</div>`).join('');body=`<div class="entry-row"><strong>You helped: ${(e.helpedKids||[]).join(', ')}</strong></div>${acts}${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else if(e.momMode==='dad-had'){tag='<span class="tag tag-other">'+coParentPoss()+' day · You had</span>';body=`<div class="entry-row"><strong>You had: ${(e.dadHadKids||[]).join(', ')}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  else{tag='<span class="tag tag-dad">Your day</span>';const n=(e.kidsWithDad||[]).length;const kids=n===KIDS.length?kidsCountLabel()+' home':n===0?'All at '+coParentPoss():(e.kidsWithDad||[]).join(', ')+' home';body=`<div class="entry-row"><strong>${kids}</strong></div>${e.diary?`<div class="entry-row" style="font-style:italic;color:#666;margin-top:4px">"${e.diary}"</div>`:''}`}
  const locked=isLockedDate(ds);
  const lockBadge=locked?'<span class="cal-lock-badge">Locked</span>':'';
  el.innerHTML=`<div class="entry-card"><div class="entry-date-lbl">${fmtDate(ds)} ${tag} ${lockBadge}</div>${body}${entryMetaHtml(e,{fullAttachment:true})}</div>`;
  if(reveal)revealCalendarDetail();
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

// Rolling windows include today and the preceding N-1 local calendar dates.
// Compare date keys directly: parsing YYYY-MM-DD as UTC shifts local boundaries.
function filterRecentEntryDates(entries,days,now=new Date()){
  const dateKey=date=>date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  start.setDate(start.getDate()-(days-1));
  const first=dateKey(start),last=dateKey(now);
  return entries.filter(([ds])=>ds>=first&&ds<=last);
}
function getTrendsEntries(){
  const all=getEntries();
  const sorted=Object.entries(all).sort((a,b)=>a[0].localeCompare(b[0]));
  if(trendsFilter==='month'){
    const px=trendsY+'-'+pad(trendsM+1)+'-';
    return sorted.filter(([k])=>k.startsWith(px));
  }
  if(trendsFilter==='all') return sorted;
  return filterRecentEntryDates(sorted,parseInt(trendsFilter,10));
}

function trendsFilterLabel(){
  if(trendsFilter==='month') return MONTHS[trendsM]+' '+trendsY;
  if(trendsFilter==='all') return 'All time';
  return 'Last '+trendsFilter+' days';
}
// ── END TRENDS STATE ─────────────────────────────────────────

function trendsEscape(value){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function trendsContext(entry){
  if(entry.changePressured===true)return ['pressured','Felt pressured'];
  if(entry.changeAgreed===false)return ['unexpected','Unexpected'];
  if(entry.changeAgreed===true&&entry.changePressured===false)return ['agreed','Agreed'];
  return ['unknown','Context not recorded'];
}
function trendsCustodyRecord(entry){
  return entry?.week==='dad'&&['normal','mom-had','dad-helped-mom'].includes(entry.dadMode)||
    entry?.week==='mom'&&['easy','helped','dad-had'].includes(entry.momMode);
}
function openTrendsDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  const entry=getEntries()[date];
  if(!entry)return;
  const [year,month]=date.split('-').map(Number);
  calY=year;calM=month-1;
  switchTab('cal');
  showDetail(date,entry);
}
function renderStats(){
  const entries=getTrendsEntries();
  const custody=entries.filter(([,e])=>trendsCustodyRecord(e));
  const missed=entries.filter(([,e])=>e?.week==='not-logged').length;
  const other=entries.length-custody.length-missed;
  const label=trendsFilterLabel();
  const actual=custody.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had')).length;
  const withYou=custody.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had');
  const withCoparent=custody.filter(([,e])=>e.week==='dad'&&e.dadMode==='mom-had');
  const help=custody.filter(([,e])=>e.week==='mom'&&e.momMode==='helped'||e.week==='dad'&&e.dadMode==='dad-helped-mom').length;
  const navLbl=document.getElementById('trends-month-label');
  if(navLbl)navLbl.textContent=label;
  document.getElementById('stats-lbl').textContent=label;
  const cards=[[actual,'Days '+currentParent()+' had kids'],[withYou.length,coParentPoss()+' scheduled days — kids with you'],[withCoparent.length,'Your scheduled days — kids with '+coParent()],[help,'Help across scheduled days']];
  document.getElementById('stat-grid').innerHTML=cards.map(([count,title])=>`<div class="stat-card"><div class="stat-num">${count}</div><div class="stat-lbl">${trendsEscape(title)}</div></div>`).join('');
  const coverage=document.getElementById('trends-coverage');
  coverage.hidden=!custody.length;
  if(!custody.length){
    coverage.textContent='';
    document.getElementById('trends-deviation-detail').innerHTML='';
    document.getElementById('summary-box').textContent='No custody records in this period. Log a day or choose another period to see trends.';
    return;
  }
  document.getElementById('trends-coverage').textContent=`${custody.length} custody ${custody.length===1?'record':'records'} · ${missed} not-logged ${missed===1?'marker':'markers'} · ${other} other or legacy ${other===1?'note':'notes'}. Each custody record counts as one family date, including split days; it does not count children or hours. Unrecorded dates, not-logged markers, and other notes do not establish custody.`;
  const sections=[[withYou,coParentPoss()+' scheduled days — kids with '+currentParent(),'dadHadKids'],[withCoparent,'Your scheduled days — kids with '+coParent(),'momHadKidsOnDadWeek']];
  document.getElementById('trends-deviation-detail').innerHTML=sections.filter(([rows])=>rows.length).map(([rows,title,kidsField])=>`<section class="trends-deviation-card"><h3 class="trends-deviation-title">${trendsEscape(title)} (${rows.length})</h3>${rows.map(([date,e])=>{
    const [kind,context]=trendsContext(e);
    const kids=(e[kidsField]||[]).join(', ')||'Children not recorded';
    return `<div class="trends-deviation-row"><button class="trends-dev-date" type="button" onclick="openTrendsDate(this.dataset.date)" data-date="${trendsEscape(date)}" aria-label="View Calendar detail for ${trendsEscape(fmtDate(date))}">${trendsEscape(fmtDate(date))}</button><div class="trends-dev-kids">${trendsEscape(kids)}</div><div class="trends-dev-flags"><span class="flag-badge flag-${kind}">${context}</span></div></div>`;
  }).join('')}</section>`).join('')+(withYou.length||withCoparent.length?'<p class="trends-footnote">Context is user-reported: Agreed means agreement with no pressure reported; Felt pressured means pressure was reported; Unexpected means not agreed in advance. Context not recorded means the available answers are incomplete.</p>':'');
  const changes=[...withYou,...withCoparent];
  const counts={pressured:0,agreed:0,unexpected:0,unknown:0};
  changes.forEach(([,entry])=>counts[trendsContext(entry)[0]]++);
  const summary=!custody.length?'No custody records in this period.':!changes.length?'No recorded schedule changes in this period.':`${changes.length} family dates with recorded schedule changes: ${withYou.length} on ${coParentPoss()} scheduled days and ${withCoparent.length} on your scheduled days. Context across both directions: ${counts.pressured} felt pressured, ${counts.agreed} agreed, ${counts.unexpected} unexpected, ${counts.unknown} context not recorded.`;
  document.getElementById('summary-box').textContent=label+': '+summary;
}
function renderLog(){
  const entries=getEntries(),sorted=Object.entries(entries).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,30);
  const list=document.getElementById('log-list');
  if(!list)return;
  if(!sorted.length){list.innerHTML='<p style="color:#999;font-size:14px;padding:1rem 0">No entries yet.</p>';return}
  list.innerHTML=sorted.map(([date,e])=>{
    let tagCls,tagTxt,desc;
    if(e.week==='not-logged'){tagCls='tag-missed';tagTxt='Not logged';desc=e.intentional?'Skipped intentionally':'Nothing logged'}
    else if(e.week==='other'){tagCls='tag-mom';tagTxt='Pre-agreed note';desc='Pre-agreed day note'}
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
  return filterRecentEntryDates(entries,parseInt(REPORT_FILTER,10));
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
  const gen='Generated: '+new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+'\nNote: Entries for dates before yesterday are read-only in the app.';
  const D='─'.repeat(50);
  if(type==='full'){
    let L=['WHOSE DAY — FULL DIARY','Kids: '+kidsListLabel(),gen,'',D,''];
    for(const[ds,e]of sorted){
      L.push('DATE: '+fmtDate(ds));
      L.push(...reportMetaLines(e));
      if(e.week==='other'){L.push('TYPE: Pre-agreed day note');L.push('NOTE: '+(e.diary||'—'))}
      else if(e.dadMode==='mom-had'){L.push('WEEK: '+currentParentPoss()+' scheduled week — KIDS AT '+coParent().toUpperCase());L.push('KIDS AT '+coParent().toUpperCase()+': '+(e.momHadKidsOnDadWeek||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.dadMode==='dad-helped-mom'){L.push('WEEK: '+currentParentPoss()+' scheduled week');const n=(e.kidsWithDad||[]).length;L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(n===KIDS.length?kidsCountLabel():n===0?'None':(e.kidsWithDad||[]).join(', ')));L.push(coParent().toUpperCase()+' HELPED:');Object.entries(e.momHelpedOnDadWeek||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(activityLabel).join(', ')+(v.note?' ('+v.note+')':'')));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='easy'){L.push('WEEK: '+coParentPoss()+' scheduled week');L.push('STATUS: '+coParent()+' had the kids');if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='helped'){L.push('WEEK: '+coParentPoss()+' scheduled week');L.push(currentParent().toUpperCase()+' HELPED WITH: '+(e.helpedKids||[]).join(', '));Object.entries(e.helpedData||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(activityLabel).join(', ')+(v.note?' ('+v.note+')':'')));if(e.diary)L.push('NOTE: '+e.diary)}
      else if(e.momMode==='dad-had'){L.push('WEEK: '+coParentPoss()+' scheduled week — KIDS WITH '+currentParent().toUpperCase());L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(e.dadHadKids||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary)}
      else{const n=(e.kidsWithDad||[]).length;L.push('WEEK: '+currentParentPoss()+' scheduled week');L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(n===KIDS.length?kidsCountLabel():n===0?'None':(e.kidsWithDad||[]).join(', ')));if(e.diary)L.push('NOTES: '+e.diary)}
      L.push(D,'');
    }return L.join('\n');
  }
  if(type==='dadactual'){
    const filt=sorted.filter(([,e])=>(e.week==='dad'&&e.dadMode!=='mom-had'&&(e.kidsWithDad||[]).length>0)||(e.week==='mom'&&e.momMode==='dad-had'));
    if(!filt.length)return'No entries found.';
    let L=['WHOSE DAY — '+currentParent().toUpperCase()+' ACTUAL TIME WITH KIDS','Includes '+currentParentPoss()+' scheduled days and '+coParentPoss()+' scheduled nights where the kids were with '+currentParent()+'.',gen,'Total: '+filt.length+' days','',D,''];
    for(const[ds,e]of filt){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));if(e.momMode==='dad-had'){L.push('*** '+coParent().toUpperCase()+'\'S WEEK — KIDS LEFT WITH '+currentParent().toUpperCase()+' ***');L.push('KIDS: '+(e.dadHadKids||[]).join(', '))}else{const n=(e.kidsWithDad||[]).length;L.push(currentParentPoss()+" scheduled week · "+(n===KIDS.length?kidsCountLabel():(e.kidsWithDad||[]).join(', ')))}if(e.diary)L.push('NOTE: '+e.diary);L.push(D,'');}return L.join('\n');
  }
  if(type==='honest'){
    const mhd=sorted.filter(([,e])=>e.week==='dad'&&e.dadMode==='mom-had');
    const dhm=sorted.filter(([,e])=>e.week==='mom'&&e.momMode==='dad-had');
    let L=['WHOSE DAY — FULL HONESTY REPORT',gen,'',D,currentParent().toUpperCase()+"'S WEEK — KIDS ENDED UP AT "+coParent().toUpperCase()+' ('+mhd.length+' nights)',D,''];
    if(!mhd.length)L.push('None logged.','');else for(const[ds,e]of mhd){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));L.push('AT '+coParent().toUpperCase()+': '+(e.momHadKidsOnDadWeek||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary);L.push('')}
    L.push(D,coParent().toUpperCase()+"'S WEEK — KIDS ENDED UP WITH "+currentParent().toUpperCase()+' ('+dhm.length+' nights)',D,'');
    if(!dhm.length)L.push('None logged.','');else for(const[ds,e]of dhm){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));L.push('WITH '+currentParent().toUpperCase()+': '+(e.dadHadKids||[]).join(', '));if(e.diary)L.push('NOTE: '+e.diary);L.push('')}
    return L.join('\n');
  }
  if(type==='momsweek'){
    const filt=sorted.filter(([,e])=>e.week==='mom'&&(e.momMode==='helped'||e.momMode==='dad-had'));
    if(!filt.length)return'No '+coParentPoss()+' week entries with '+currentParent()+' involvement found.';
    let L=['WHOSE DAY — '+coParent().toUpperCase()+"'S WEEK / "+currentParent().toUpperCase()+"'S INVOLVEMENT",gen,'Total: '+filt.length,'',D,''];
    for(const[ds,e]of filt){L.push('DATE: '+fmtDate(ds));L.push(...reportMetaLines(e));if(e.momMode==='dad-had'){L.push('Kids ended up with '+currentParent());L.push('KIDS WITH '+currentParent().toUpperCase()+': '+(e.dadHadKids||[]).join(', '))}else{L.push(currentParent()+' helped out');Object.entries(e.helpedData||{}).forEach(([k,v])=>L.push('  '+k+': '+(v.acts||[]).map(activityLabel).join(', ')+(v.note?' — '+v.note:'')))}if(e.diary)L.push('NOTE: '+e.diary);L.push(D,'');}return L.join('\n');
  }
  if(type==='notes'){
    const filt=sorted.filter(([,e])=>e.diary&&e.diary.trim());if(!filt.length)return'No diary notes found.';
    let L=['WHOSE DAY — DIARY NOTES',gen,'',D,''];
    for(const[ds,e]of filt){
      let t='['+coParentPoss()+' day]';
      if(e.week==='other')t='[Pre-agreed day]';
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
  const subject=encodeURIComponent('Whose Day — '+(names[currentExportType]||'Report')+' '+new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'}));
  const body=encodeURIComponent(currentReportText);
  if(navigator.share){navigator.share({title:'Whose Day',text:currentReportText}).catch(()=>{})}
  else window.location.href=reportMailto(subject,body);
}
function openFeedback(){
  if(FEEDBACK_FORM_URL){
    window.open(FEEDBACK_FORM_URL,'_blank','noopener');
    return;
  }
  const active=document.querySelector('.screen.active:not(.screen-leave)')?.id||'unknown';
  const entries=loggedEntryCount();
  const subject=encodeURIComponent('Whose Day alpha feedback');
  const body=encodeURIComponent(`Hi,

I am testing the Whose Day alpha and wanted to share feedback.

What I was trying to do:

What worked well:

What felt confusing or broken:

Anything I expected but could not find:

Context:
- Screen: ${active}
- Entries logged: ${entries}
- User label: ${currentParent()}
- Children count: ${KIDS.length}
- Browser: ${navigator.userAgent}
`);
  window.location.href=`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}
async function copyReport(){
  if(!currentReportText)return;
  try{await navigator.clipboard.writeText(currentReportText);const el=document.getElementById('copy-toast');el.style.display='block';setTimeout(()=>el.style.display='none',2500)}catch(e){}
}
function printReport(){
  if(!currentReportText)return;
  const w=window.open('','_blank');
  if(!w)return;
  const reportTitle=document.getElementById('preview-title')?document.getElementById('preview-title').textContent:'Whose Day Report';
  const now=new Date();
  const printDate=now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const printTime=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  const parentName=APP_CONFIG.currentParentLabel||'Parent';
  const kids=(APP_CONFIG.children||[]).join(', ')||'Children';
  const totalEntries=Object.keys(getEntries()).filter(ds=>!isLockedDate(ds)===false||true).length;
  const lockedEntries=Object.entries(getEntries()).filter(([ds])=>isLockedDate(ds)).length;

  const attestation=`ATTESTATION
${'─'.repeat(60)}
This report was generated by Whose Day, a personal
custody documentation application.

Reporting parent: ${parentName}
Children: ${kids}
Report generated: ${printDate} at ${printTime}
Total entries in record: ${totalEntries}
Locked (read-only) entries: ${lockedEntries}

All entries in this report were logged through the Whose Day
application and timestamped at the time of logging.
Entries for dates before yesterday are read-only in the app.
These are personal records supplied by the reporting parent.

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
    <div class="cover-title">Whose Day — ${reportTitle}</div>
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
  let L=['WHOSE DAY — WEEKLY REPORT','Week ending: '+now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),'','SUMMARY','───────────────────','Days logged: '+week.length,'Days '+currentParent()+' had kids: '+dadActual,coParentPoss()+' scheduled nights with kids at '+currentParentPoss()+': '+momLeft,coParentPoss()+' scheduled days '+currentParent()+' helped out: '+dadHelped,'','DAILY BREAKDOWN','───────────────────',''];
  for(const[ds,e]of week){
    L.push(fmtDate(ds).toUpperCase());
    if(e.week==='other')L.push('  Pre-agreed day note: '+(e.diary||'—'));
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
  const subject=encodeURIComponent('Whose Day — Weekly Report '+new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}));
  window.location.href=reportMailto(subject,encodeURIComponent(report));
  localStorage.setItem('sunday_prompt_'+todayStr(),'sent');
  document.getElementById('sunday-prompt').style.display='none';
}
function reportMailto(subject,body){
  const recipient=encodeURIComponent((APP_CONFIG.email||'').trim());
  return `mailto:${recipient}?subject=${subject}&body=${body}`;
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
    '2026-06-05':{week:'mom',dadMode:null,momMode:'easy',kidsWithDad:[],absentData:{},momOpts:['text'],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Pre-agreed school event on co-parent day.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-05T19:25:00-07:00'},
    '2026-06-06':{week:'dad',dadMode:'dad-helped-mom',momMode:null,kidsWithDad:[kids[0],kids[1]],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[kids[2]],momHelpedOnDadWeek:{[kids[2]]:{acts:['activity'],note:'Co-parent handled evening activity pickup.'}},diary:'Co-parent helped with activity logistics while the other kids stayed with me.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-06T21:16:00-07:00'},
    '2026-06-07':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[kids[0],kids[2]],absentData:{[kids[1]]:{location:'sleepover',note:'Friend birthday sleepover.'}},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Split night: two kids home, Ben at sleepover.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-07T21:03:00-07:00'},
    '2026-06-08':{week:'not-logged',intentional:false,loggedAt:'2026-06-09T08:00:00-07:00'},
    '2026-06-09':{week:'mom',dadMode:null,momMode:'helped',kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[kids[0]],helpedData:{[kids[0]]:{acts:['school','food'],note:'School pickup and dinner.'}},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Helped with school pickup and dinner before drop-off.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-06-09T20:47:00-07:00'}
  });
}

function seedJulyDemoData(){
  const kids=['Thomas','Presley','Hayden'];
  saveConfig({
    currentParentLabel:'Dad',
    coParentLabel:'Mom',
    email:'dad@example.com',
    children:kids,
    purpose:'Calendar QA demo data',
    termsAccepted:true,
  });
  putEntries({
    '2026-07-01':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[...kids],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: normal overnight with all kids. Dinner, reading, and bedtime routine.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-01T21:08:00-07:00'},
    '2026-07-02':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[kids[0],kids[2]],absentData:{[kids[1]]:{location:'activity',note:'Placeholder: evening rehearsal with Mom handling pickup.'}},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: split evening. Two kids home, one at an activity.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-02T20:54:00-07:00'},
    '2026-07-03':{week:'dad',dadMode:'mom-had',momMode:null,kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[kids[1]],momHelpedOnDadWeek:{},diary:'Placeholder: Presley stayed with Mom after a schedule change.',attachment:null,changeAgreed:true,changePressured:false,loggedAt:'2026-07-03T21:22:00-07:00'},
    '2026-07-04':{week:'mom',dadMode:null,momMode:'easy',kidsWithDad:[],absentData:{},momOpts:['text'],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: pre-agreed July 4 holiday on Mom day.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-04T19:30:00-07:00'},
    '2026-07-05':{week:'mom',dadMode:null,momMode:'easy',kidsWithDad:[],absentData:{},momOpts:['call'],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: Mom had the kids. Short goodnight call.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-05T20:41:00-07:00'},
    '2026-07-06':{week:'mom',dadMode:null,momMode:'helped',kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[kids[0],kids[2]],helpedData:{[kids[0]]:{acts:['school','food'],note:'Placeholder: pickup and dinner.'},[kids[2]]:{acts:['sports'],note:'Placeholder: practice dropoff.'}},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: helped during Mom week with pickup and practice.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-06T21:10:00-07:00'},
    '2026-07-07':{week:'mom',dadMode:null,momMode:'dad-had',kidsWithDad:[kids[1]],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[kids[1]],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: Presley stayed overnight with Dad during Mom week.',attachment:null,changeAgreed:true,changePressured:false,loggedAt:'2026-07-07T22:02:00-07:00'},
    '2026-07-08':{week:'not-logged',intentional:false,loggedAt:'2026-07-09T08:00:00-07:00'},
    '2026-07-09':{week:'dad',dadMode:'dad-helped-mom',momMode:null,kidsWithDad:[kids[0],kids[1]],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[kids[2]],momHelpedOnDadWeek:{[kids[2]]:{acts:['medical'],note:'Placeholder: Mom handled appointment transportation.'}},diary:'Placeholder: Mom helped with Hayden appointment while others stayed with Dad.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-09T21:35:00-07:00'},
    '2026-07-10':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[...kids],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: all kids home for movie night.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-10T20:58:00-07:00'},
    '2026-07-11':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[...kids],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: pre-agreed tournament day on Dad day.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-11T18:44:00-07:00'},
    '2026-07-12':{week:'mom',dadMode:null,momMode:'easy',kidsWithDad:[],absentData:{},momOpts:['call','text'],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: Mom had all kids; text update received.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-12T20:20:00-07:00'},
    '2026-07-13':{week:'mom',dadMode:null,momMode:'helped',kidsWithDad:[],absentData:{},momOpts:[],helpedKids:[kids[0]],helpedData:{[kids[0]]:{acts:['camp'],note:'Placeholder: camp pickup and snack.'}},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: helped with camp pickup.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-13T19:52:00-07:00'},
    '2026-07-14':{week:'not-logged',intentional:true,loggedAt:'2026-07-14T23:10:00-07:00'},
    '2026-07-15':{week:'dad',dadMode:'normal',momMode:null,kidsWithDad:[kids[0],kids[1]],absentData:{[kids[2]]:{location:'camp',note:'Placeholder: overnight camp.'}},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Placeholder: current-day entry with one child at overnight camp.',attachment:null,changeAgreed:null,changePressured:null,loggedAt:'2026-07-15T20:15:00-07:00'}
  });
  calM=6;
  calY=2026;
  trendsM=6;
  trendsY=2026;
  selectedCalDate='2026-07-15';
}

const DEMO_PARAMS=new URLSearchParams(window.location.search);
const DEMO_MODE=DEMO_PARAMS.get('demo');
const ONBOARDING_PREVIEW=DEMO_PARAMS.has('onboarding-theme-preview');
if(DEMO_PARAMS.has('reset')){
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null,'',window.location.pathname);
}
if(DEMO_MODE==='june')seedJuneDemoData();
if(DEMO_MODE==='july')seedJulyDemoData();
renderConfigurableUi();
applyThemeMode();
window.addEventListener('online',()=>scheduleCloudSync('online',200));
window.addEventListener('focus',()=>{resumeLoggedOutLogin();scheduleCloudSync('focus',500)});
window.addEventListener('offline',()=>{
  clearTimeout(cloudSyncRefreshTimer);
  updateCloudSyncStatusUi({state:'offline',message:'Offline. New logs will sync when this device reconnects.'});
});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){
    resumeLoggedOutLogin();
    scheduleCloudSync('visible',500);
  }else clearTimeout(cloudSyncRefreshTimer);
});
if(ONBOARDING_PREVIEW){
  initOnboarding();show('s-ob-welcome');
}else if(hasSavedConfig()&&!accountDeletedOnDevice()){
  recordAppSession();
  initHome();
  setActiveScreenMeta('s-home');
  syncFeedbackButton('s-home');
}else{
  initOnboarding();
  if(shouldOpenLoggedOutLoginOnBoot())showLoggedOutLogin();
  else show('s-ob-welcome');
}
if(DEMO_MODE==='june'||DEMO_MODE==='july')showCal();
scheduleCloudSync('startup',1200);
if('serviceWorker' in navigator&&window.isSecureContext&&location.protocol!=='file:'){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(error=>{
      console.warn('Offline app loading is unavailable:',error.message);
    });
  });
}
