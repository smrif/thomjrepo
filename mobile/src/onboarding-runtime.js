import {onboardingStore,defaultActivities,normalizeEmail,validateSetup,validateIntent} from './onboarding-store.js';
const $=id=>document.getElementById(id),documents=__WHOSE_DAY_POLICIES__;
const versions={terms:documents.terms.version,privacy:documents.privacy.version};
const headings=['What should we call you?','Who is your co-parent?','Who are your children?','What does everyday life include?','Your account and agreement'];
const activities={school:'School',afterschool:'After-school care',medical:'Medical appointments',practice:'Practice',birthday:'Birthdays',camp:'Camp',therapy:'Therapy',religious:'Religious activities'};
export function mountOnboarding({vault,project,native,accounts,auth,previewAccounts,choosePreview,setView,policies}){
  let store=null,scope='',step=0,busy=false,generation=0,revision=0,waiting=false,active=false,draftBroken=false,resendUntil=0,resendTimer=null;
  const form=$('onboarding-form');
  for(const id of defaultActivities){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=id;input.name='onboarding-activity';input.checked=true;label.append(input,document.createTextNode(activities[id]));$('onboarding-activities').append(label);}
  policies.controls($('onboarding-policy-links'));
  $('onboarding-policy-versions').textContent='Please review both policies before continuing.';
  function answers(){return {currentParentLabel:$('onboarding-parent').value,coParentLabel:$('onboarding-coparent').value,children:$('onboarding-children').value,activityIds:[...form.querySelectorAll('[name="onboarding-activity"]:checked')].map(el=>el.value),email:$('onboarding-email').value};}
  function fields(value){for(const [id,key] of [['parent','currentParentLabel'],['coparent','coParentLabel'],['children','children'],['email','email']])$('onboarding-'+id).value=value[key]||'';for(const el of form.querySelectorAll('[name="onboarding-activity"]'))el.checked=(value.activityIds||defaultActivities).includes(el.value);}
  function feedback(value){$('onboarding-message').textContent=value;}
  function submitControl(){
    const seconds=native&&!scope?Math.max(0,Math.ceil((resendUntil-Date.now())/1000)):0;
    $('onboarding-next').textContent=step<4?'Continue':scope?'Save and start tracking':native?(waiting?'Send a new sign-up link':'Send sign-up link')+(seconds?' ('+seconds+'s)':''):'Continue with sample account';
    $('onboarding-next').disabled=busy||draftBroken||step===4&&seconds>0;
  }
  function countdown(until=0){clearInterval(resendTimer);resendUntil=until;submitControl();if(until>Date.now())resendTimer=setInterval(()=>{submitControl();if(Date.now()>=resendUntil)clearInterval(resendTimer)},1000);}
  function setBusy(value){busy=value;form.setAttribute('aria-busy',String(value));for(const el of form.querySelectorAll('input,select,textarea,button'))el.disabled=value;submitControl();}
  function render(focus=true){
    for(const el of form.querySelectorAll('[data-onboarding-step]'))el.hidden=Number(el.dataset.onboardingStep)!==step;
    $('onboarding-progress').textContent='Step '+(step+1)+' of 5';$('onboarding-heading').textContent=headings[step];
    $('onboarding-back').hidden=step===0;submitControl();
    $('onboarding-email').readOnly=!!scope||!native;$('onboarding-preview-choice').hidden=native||!!scope;
    if(focus){window.scrollTo(0,0);$('onboarding-heading').focus();}
  }
  async function persist(){
    if(!store)return;const current=generation,write=++revision;$('onboarding-save-status').textContent='Saving setup progress…';
    try{await store.save(answers(),step);if(current!==generation||write!==revision)return;$('onboarding-save-status').textContent='Setup progress saved on this '+(native?'device.':'browser.');}
    catch{if(current!==generation||write!==revision)return;$('onboarding-save-status').textContent='Could not save setup progress. Keep this screen open and try Continue again.';throw Error('Could not save setup progress.');}
  }
  function profile(){const value=answers();return {currentParentLabel:value.currentParentLabel,coParentLabel:value.coParentLabel,children:value.children.split(/\r?\n/).map(v=>v.trim()).filter(Boolean),activityIds:value.activityIds};}
  function validateStep(){
    const value=answers();
    if(step===0&&!value.currentParentLabel.trim())throw Error('Enter your name or label.');
    if(step===1&&!value.coParentLabel.trim())throw Error('Enter your co-parent’s name or label.');
    if(step===2){const children=profile().children;if(!children.length||children.length>20||children.some(v=>v.length>100)||new Set(children).size!==children.length)throw Error('Enter one to twenty different child names, up to 100 characters each.');}
    if(step===3&&!value.activityIds.length)throw Error('Choose at least one activity.');
  }
  async function begin(owner=null){
    const current=++generation;scope=owner?.scope||'';store=onboardingStore(vault,project,scope||'guest');active=true;waiting=false;draftBroken=false;
    countdown();setBusy(true);feedback('');$('onboarding-save-status').textContent='';$('onboarding-agree').checked=false;$('onboarding-restart').hidden=true;
    fields({activityIds:defaultActivities});step=0;setView('onboarding');
    try{const saved=await store.load();if(current!==generation)return;if(saved){fields(saved.answers);step=saved.step;}if(owner)$('onboarding-email').value=owner.email;else if(!native)$('onboarding-email').value=previewAccounts[Number($('onboarding-preview-account').value)].user.email;
      if(native&&!owner){const pending=await store.pending();if(current!==generation)return;if(pending){try{validateIntent(pending.value,versions);waiting=true;countdown(Date.now()+Math.min(60000,Math.max(0,Date.parse(pending.value.acceptedAt)+60000-Date.now())));feedback('Open the newest email link to finish setup, or request another link when the timer ends.');}catch{/* Changed policy versions require a new explicit submission. */}}}setBusy(false);render();}
    catch(error){if(current!==generation)return;draftBroken=true;setBusy(false);feedback('Saved setup could not be read. Start a new setup to replace only this unfinished draft.');for(const el of form.querySelectorAll('input,textarea,select'))el.disabled=true;$('onboarding-restart').hidden=false;render();}
  }
  form.addEventListener('input',event=>{if(busy||!active||draftBroken)return;feedback('');if(event.target.id==='onboarding-agree')return;waiting=false;persist().catch(()=>{});});
  $('onboarding-preview-account').onchange=()=>{$('onboarding-email').value=previewAccounts[Number($('onboarding-preview-account').value)].user.email;$('onboarding-agree').checked=false;persist().catch(()=>{});};
  $('onboarding-back').onclick=async()=>{if(busy)return;try{setBusy(true);step--;feedback('');render();await persist();}catch(error){feedback(error.message);}finally{setBusy(false)}};
  $('onboarding-leave').onclick=async()=>{if(busy)return;setBusy(true);try{if(!draftBroken){await persist();await store.intent(null);}active=false;generation++;countdown();$('onboarding-agree').checked=false;if(scope)await auth().signOut();else setView('welcome');}catch(error){feedback(error.message);}finally{setBusy(false)}};
  $('onboarding-restart').onclick=async()=>{if(busy)return;try{await store.clear();await begin(accounts.state.status==='needs-profile'?accounts.state.account:null)}catch{feedback('Could not replace the saved draft. Close and reopen to retry.')}};
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||draftBroken)return;const current=generation;setBusy(true);feedback('');
    try{
      validateStep();await persist();if(current!==generation)return;
      if(step<4){step++;render();await persist();return;}
      const email=normalizeEmail($('onboarding-email').value),input=validateSetup(profile(),email);
      if(!$('onboarding-agree').checked)throw Error('Agree to the Terms of Use and acknowledge the Privacy Policy to continue.');
      const intent={schema:1,attempt:crypto.randomUUID(),scope,email,profile:input,draftRaw:await store.snapshot(),termsVersion:versions.terms,privacyVersion:versions.privacy,acceptedAt:new Date().toISOString()};
      validateIntent(intent,versions);const previous=await store.pending();await store.intent(intent);if(current!==generation)return;
      if(scope){const pending=await store.pending();await complete(store,pending,accounts.state);}
      else if(native){
        try{await auth().send(email,{signup:true});}catch(error){await store.intent(previous?.value||null);throw error;}
        if(current!==generation)return;waiting=true;countdown(Date.now()+60000);render(false);feedback('Check your email on this device. Open the newest link to verify your account and finish setup. Your answers are saved.');
      }else await choosePreview(Number($('onboarding-preview-account').value));
    }catch(error){if(current===generation)feedback(error.message?.startsWith('Setup')||error.message?.startsWith('This setup')||error.message?.startsWith('New test')||error.message?.startsWith('Use the approved')||/^(Enter|Choose|Agree|Review|Could not save setup)/.test(error.message)?error.message:'Could not save or finish setup. Your answers are still here. Retry, or reopen the app to check its saved copy.');}
    finally{if(current===generation)setBusy(false);}
  };
  async function complete(target,pending,state){
    const intent=validateIntent(pending.value,versions);
    if(intent.email!==normalizeEmail(state.account.email)||intent.scope&&intent.scope!==state.account.scope)return false;
    await accounts.completeOnboarding({pendingKey:target.intentKey,pendingRaw:pending.raw,versions,environment:native?'mobile-test':'browser-preview'});
    // Only the consumed attempt may clean up its associated unfinished answers.
    await target.discardMatching(state.account.email);await onboardingStore(vault,project).discardMatching(state.account.email);return true;
  }
  return {
    beginSignup:()=>begin(),
    async needsProfile(state){
      // A verified different email never receives the guest's names or consent.
      for(const target of [onboardingStore(vault,project,state.account.scope),onboardingStore(vault,project)]){
        const pending=await target.pending();if(pending){try{if(await complete(target,pending,state))return true;}catch(error){
          await begin(state.account);
          if(pending.value.email===normalizeEmail(state.account.email)&&(!pending.value.scope||pending.value.scope===state.account.scope)){
            try{const latest=await target.load();if(latest&&normalizeEmail(latest.answers.email)===normalizeEmail(state.account.email)){fields(latest.answers);step=latest.step;}else{const saved=validateSetup(pending.value.profile,pending.value.email);fields({...saved,children:saved.children.join('\n'),email:state.account.email});step=4;}render();await persist();}catch{/* Invalid saved values cannot populate another setup. */}
          }
          feedback(error.message?.startsWith('Review')?error.message:'Could not finish saved setup. Your answers are still here. Review your agreement, then try again.');return true;
        }}
      }
      if(!native)return false; // Explicit browser-only synthetic profile shortcuts.
      await begin(state.account);return true;
    },
    async signIn(){generation++;active=false;countdown();await onboardingStore(vault,project).intent(null);setView('welcome');},
    ready(owner){generation++;active=false;countdown();setBusy(false);onboardingStore(vault,project).discardMatching(owner.email).catch(()=>{});},
    authError(text){if(!active)return false;feedback(text);return true;},
  };
}
