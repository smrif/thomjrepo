import {validateProfile} from './profile-store.js';
import {equal} from './sync-store.js';
export const defaultActivities=['school','afterschool','medical','practice','birthday','camp','therapy','religious'];
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail=value=>String(value).trim().toLowerCase();
export function validateSetup(input,email){
  const profile=validateProfile(input,email);
  if(!profile.activityIds.length||new Set(profile.activityIds).size!==profile.activityIds.length)throw Error('Choose at least one activity.');
  if(!emailPattern.test(email)||email.length>254)throw Error('Enter a valid email address.');
  return profile;
}
export function validateIntent(intent,versions){
  if(!intent||Object.keys(intent).sort().join(',')!=='acceptedAt,attempt,draftRaw,email,privacyVersion,profile,schema,scope,termsVersion'||intent.schema!==1||!/^[-a-z0-9]{16,64}$/i.test(intent.attempt)||typeof intent.scope!=='string'||intent.scope.length>120||intent.email!==normalizeEmail(intent.email)||!emailPattern.test(intent.email)||!/^\d{4}-\d{2}-\d{2}T/.test(intent.acceptedAt)||!Number.isFinite(Date.parse(intent.acceptedAt))||intent.termsVersion!==versions.terms||intent.privacyVersion!==versions.privacy||typeof intent.draftRaw!=='string'||intent.draftRaw.length>16000)throw Error('Review the current policies and continue setup again.');
  const age=Date.now()-Date.parse(intent.acceptedAt);
  if(age>24*60*60*1000||age< -5*60*1000)throw Error('Review your agreement and submit setup again. Your saved answers are still available.');
  const draft=JSON.parse(intent.draftRaw),answers=draft?.answers;
  if(draft.schema!==1||draft.step!==4||!answers||normalizeEmail(answers.email)!==intent.email||typeof answers.children!=='string')throw Error('Review the saved setup again.');
  const saved=validateSetup({...answers,children:answers.children.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)},intent.email),profile=validateSetup(intent.profile,intent.email);
  if(!equal(saved,profile))throw Error('Setup answers changed after agreement. Review them again.');return intent;
}
export function policyReceipt(intent,owner,project,environment){
  if(normalizeEmail(owner.email)!==intent.email||intent.scope&&intent.scope!==owner.scope)throw Error('This setup belongs to a different account.');
  return {schema:1,project,scope:owner.scope,userId:owner.id,email:normalizeEmail(owner.email),termsVersion:intent.termsVersion,privacyVersion:intent.privacyVersion,acceptedAt:intent.acceptedAt,recordedAt:new Date().toISOString(),attempt:intent.attempt,source:environment};
}
// Draft answers never include a checked agreement. Intent is a separate explicit
// submission, bound to the verified email, and consumed in the profile transaction.
export function onboardingStore(vault,project,scope='guest'){
  const prefix='onboarding:v1:'+project+':'+scope,draftKey=prefix+':draft',intentKey=prefix+':intent';let queue=Promise.resolve();
  const enqueue=operation=>{const result=queue.catch(()=>{}).then(operation);queue=result;return result};
  async function write(key,value){await vault.write({key,value});if((await vault.read({key})).value!==value)throw Error('Could not verify saved setup progress.');}
  return {
    intentKey,
    async snapshot(){await queue;return (await vault.read({key:draftKey})).value;},
    async load(){await queue.catch(()=>{});const {value}=await vault.read({key:draftKey});if(!value||value==='null')return null;const row=JSON.parse(value);
      if(row.schema!==1||Object.keys(row).sort().join(',')!=='answers,schema,step'||!Number.isInteger(row.step)||row.step<0||row.step>4||!row.answers||Object.keys(row.answers).sort().join(',')!=='activityIds,children,coParentLabel,currentParentLabel,email'||[row.answers.currentParentLabel,row.answers.coParentLabel,row.answers.children,row.answers.email].some(v=>typeof v!=='string'||v.length>2020)||!Array.isArray(row.answers.activityIds)||row.answers.activityIds.length>30||!row.answers.activityIds.every(v=>typeof v==='string'&&v.length<=100))throw Error('Saved setup could not be read. Start a new setup to replace this unfinished draft.');return row;},
    save(answers,step){const value=JSON.stringify({schema:1,answers,step});return enqueue(()=>write(draftKey,value));},
    intent(value){return enqueue(()=>write(intentKey,value===null?'null':JSON.stringify(value)));},
    async pending(){await queue.catch(()=>{});const {value}=await vault.read({key:intentKey});return value&&value!=='null'?{raw:value,value:JSON.parse(value)}:null;},
    discardMatching(email){return enqueue(async()=>{
      const intent=(await vault.read({key:intentKey})).value;if(!intent||intent==='null')return;
      const pending=JSON.parse(intent);if(pending.email!==normalizeEmail(email)||typeof pending.draftRaw!=='string')return;
      await vault.compareBatch({rows:[{key:intentKey,expected:intent,value:'null'},{key:draftKey,expected:pending.draftRaw,value:'null'}]});
    });},
    clear(){return enqueue(async()=>{await write(intentKey,'null');await write(draftKey,'null')});}
  };
}
