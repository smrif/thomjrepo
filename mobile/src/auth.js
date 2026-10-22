import { CALLBACK, callbackCode } from './domain.js';
export function createAuth({config,vault,createClient,onSession,onError}) {
  if(!config?.enabled)return null;
  const url=new URL(config.url);
  if(url.protocol!=='https:' || !url.hostname.endsWith('.supabase.co') || url.hostname==='hdfuknggfkmaycnantxv.supabase.co' || !/^sb_publishable_/.test(config.publishableKey||''))throw new Error('Use a separate Supabase test project with a publishable key.');
  const storage={
    getItem:async key=>(await vault.readSecret({key})).value,
    setItem:async(key,value)=>{await vault.writeSecret({key,value})},
    removeItem:async key=>{await vault.removeSecret({key})}
  };
  const client=createClient(config.url,config.publishableKey,{auth:{storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce',storageKey:'whose-day-lab-auth'}});
  let exchange=null,completedCode=null;
  client.auth.onAuthStateChange((_event,session)=>onSession(session));
  return {
    async start(){const {data,error}=await client.auth.getSession();if(error)throw error;onSession(data.session)},
    async send(email){if(config.approvedTestEmail && email.toLowerCase()!==config.approvedTestEmail.toLowerCase())throw new Error('Use the approved test inbox.');const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:config.createApprovedTestUser===true && !!config.approvedTestEmail,emailRedirectTo:CALLBACK}});if(error)throw error},
    async callback(url){
      try {
        const code=callbackCode(url);
        if(code===completedCode)return;
        if(exchange)return await exchange;
        exchange=(async()=>{const {data,error}=await client.auth.exchangeCodeForSession(code);if(error)throw error;completedCode=code;onSession(data.session)})();
        await exchange;
      }catch{onError('Could not complete sign-in. Request a new link from this app.')}finally{exchange=null}
    },
    async foreground(active){if(active){client.auth.startAutoRefresh();await this.start()}else client.auth.stopAutoRefresh()},
    async signOut(){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;onSession(null)}
  };
}
