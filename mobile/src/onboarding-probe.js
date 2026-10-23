import {previewAccounts} from './account-preview.js';
// Reachable only after the native bridge confirms a DEBUG simulator launch
// argument. Synthetic verification never uses Supabase or the real session keys.
export async function onboardingProbe(vault,mode,receive){
  const marker='probe:onboarding-ui-project';let project;
  if(mode==='onboarding-write'){project='sim-onboard-ui-'+crypto.randomUUID().slice(0,8);await vault.write({key:marker,value:project});await vault.write({key:'probe:onboarding-ui-ready',value:'null'});}
  else project=(await vault.read({key:marker})).value;
  if(!/^sim-onboard-ui-[a-f0-9]{8}$/.test(project||''))throw Error('Missing synthetic onboarding UI scope.');
  const key='probe-onboarding-ui:'+project+':identity',session=previewAccounts[0];
  return {project,auth:{
    async start(){const {value}=await vault.readSecret({key});await receive(value===session.user.id?session:null)},
    async send(email,{signup=false}={}){if(!signup||email!==session.user.email)throw Error('Use the approved synthetic email.');await vault.writeSecret({key,value:session.user.id});},
    async signOut(){await vault.removeSecret({key});await receive(null)}
  }};
}
