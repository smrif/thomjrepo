import {testBackend} from './test-backend.js';
import {profileFromRow,profileToColumns} from './profile-mapping.js';
import {validateIntent,normalizeEmail} from './onboarding-store.js';
import {equal} from './sync-store.js';

// Exercises the release database contract against a separate test project.
// Production remains refused by testBackend/auth until release activation review.
export function registrationBackend(auth,config,owner){
  const backend=testBackend(auth,config,owner),update=backend.profile.compareAndSet;
  backend.profile.compareAndSet=(id,value,version)=>{
    if(version===null)throw Error('Complete account setup before creating a cloud profile.');
    return update(id,value,version);
  };
  backend.registration={async complete(intent,versions){
    validateIntent(intent,versions);
    if(intent.email!==normalizeEmail(owner.email)||intent.scope&&intent.scope!==owner.scope||!/^[0-9a-f-]{36}$/i.test(intent.attempt))throw Error('This setup belongs to a different account.');
    const columns=profileToColumns(intent.profile,owner.email);
    return auth.withSession(owner.id,async(client,check)=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const {data,error}=await client.rpc('complete_mobile_registration',{
          p_attempt:intent.attempt,p_email:intent.email,p_profile:columns,
          p_terms_version:intent.termsVersion,p_privacy_version:intent.privacyVersion,p_accepted_at:intent.acceptedAt
        }).abortSignal(controller.signal);
        check();if(error)throw error;
        if(!data||!['completed','existing'].includes(data.status))throw Error('Registration could not be verified. Reopen the app to check its saved copy.');
        const profile=profileFromRow(data.profile,owner),receipt=data.receipt;
        if(data.status==='existing'){
          if(receipt!==null)throw Error('Unexpected acceptance for an existing profile.');
          return {profile,receipt:null};
        }
        if(!receipt||receipt.user_id!==owner.id||receipt.attempt!==intent.attempt||receipt.verified_email!==intent.email||receipt.source!=='mobile'||receipt.terms_version!==intent.termsVersion||receipt.privacy_version!==intent.privacyVersion||Date.parse(receipt.accepted_at)!==Date.parse(intent.acceptedAt)||!equal(receipt.profile,columns)||typeof receipt.recorded_at!=='string'||!Number.isFinite(Date.parse(receipt.recorded_at))||Date.parse(receipt.recorded_at)>Date.now()+300000)throw Error('Server agreement receipt could not be verified.');
        return {profile,receipt:{attempt:receipt.attempt,userId:receipt.user_id,termsVersion:receipt.terms_version,privacyVersion:receipt.privacy_version,acceptedAt:receipt.accepted_at,recordedAt:receipt.recorded_at,source:receipt.source}};
      }finally{clearTimeout(timer)}
    });
  }};
  return backend;
}
