import { CALLBACK, callbackCode } from './domain.js';
export const AUTH_STORAGE_KEY='whose-day-lab-auth';
const LOCK_KEY=AUTH_STORAGE_KEY+'-signed-out';
export function projectAuthVault(vault,project){
  if(!/^[a-z0-9-]{1,30}$/.test(project))throw new Error('Invalid auth project.');
  return Object.fromEntries(['readSecret','writeSecret','removeSecret'].map(method=>[method,({key,...rest})=>vault[method]({key:'account-auth:'+project+':'+key,...rest})]));
}
export function testProject(config){
  const url=new URL(config.url);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^[a-z0-9-]{1,30}\.supabase\.co$/.test(url.hostname)||url.hostname==='hdfuknggfkmaycnantxv.supabase.co'||!/^sb_publishable_/.test(config.publishableKey||''))throw new Error('Use a separate Supabase test project with a publishable key.');
  return url.hostname.split('.')[0];
}
export function createAuth({config,vault,createClient,onSession,onError,online=()=>globalThis.navigator?.onLine!==false}) {
  if(!config?.enabled)return null;
  testProject(config);
  const storage={
    getItem:async key=>(await vault.readSecret({key})).value,
    setItem:async(key,value)=>{await vault.writeSecret({key,value})},
    removeItem:async key=>{await vault.removeSecret({key})}
  };
  const client=createClient(config.url,config.publishableKey,{auth:{storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce',storageKey:AUTH_STORAGE_KEY}});
  let exchange=null,completedCode=null,locked=false,epoch=0,lastUser=null;
  async function publish(session,version=epoch){
    const marker=await storage.getItem(LOCK_KEY);
    if(version!==epoch)return;
    if(locked||marker==='1'){onSession(null);return;}
    onSession(session);
  }
  async function cachedSession(){
    const raw=await storage.getItem(AUTH_STORAGE_KEY);if(!raw)return null;
    const session=JSON.parse(raw);
    return session?.user?.id&&typeof session.refresh_token==='string'&&typeof session.access_token==='string'?session:null;
  }
  client.auth.onAuthStateChange((event,session)=>{
    // Leave the SDK's auth lock before reading asynchronous Keychain storage.
    if(event==='SIGNED_OUT'||lastUser&&lastUser!==session?.user?.id)epoch++;
    lastUser=session?.user?.id??null;
    const version=epoch;
    setTimeout(()=>{if(version===epoch)publish(session,version).catch(()=>{if(version===epoch){onSession(null);onError('Could not read the saved sign-in. Reopen the app.');}})},0);
  });
  return {
    async withSession(userId,operation){
      const version=epoch;
      const assertCurrent=()=>{if(locked||version!==epoch)throw new Error('The signed-in account changed.');};
      assertCurrent();
      if(await storage.getItem(LOCK_KEY)==='1')throw new Error('The account is signed out.');
      assertCurrent();const {data,error}=await client.auth.getSession();assertCurrent();
      if(error||!data.session||data.session.user.id!==userId)throw new Error('The signed-in account changed.');
      const result=await operation(client,assertCurrent);assertCurrent();return result;
    },
    async start(){
      const version=epoch,marker=await storage.getItem(LOCK_KEY);if(version!==epoch)return;
      if(locked||marker==='1'){onSession(null);return;}
      if(!online()){await publish(await cachedSession(),version);return;}
      const {data,error}=await client.auth.getSession();
      if(version!==epoch)return;
      if(error){
        if(error.name==='AuthRetryableFetchError'){await publish(await cachedSession(),version);return;}
        onSession(null);throw error;
      }
      await publish(data.session,version);
    },
    async send(email,{signup=false}={}){email=email.trim().toLowerCase();if(config.approvedTestEmail && email!==config.approvedTestEmail.toLowerCase())throw new Error('Use the approved test inbox.');if(signup&&!(config.createApprovedTestUser===true&&config.approvedTestEmail))throw Error('New test accounts are not enabled. Use Sign in for an existing account.');const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:signup,emailRedirectTo:CALLBACK}});if(error)throw error},
    async callback(url){
      try {
        const code=callbackCode(url);
        if(code===completedCode)return;
        if(exchange)return await exchange;
        const version=++epoch;
        exchange=(async()=>{
          const {data,error}=await client.auth.exchangeCodeForSession(code);if(error||!data.session)throw error||new Error('No session returned.');
          if(version!==epoch)return;
          await storage.removeItem(LOCK_KEY);
          if(version!==epoch){await storage.setItem(LOCK_KEY,'1');return;}
          locked=false;completedCode=code;await publish(data.session);
        })();
        await exchange;
      }catch{onError('Could not complete sign-in. Request a new link from this app.')}finally{exchange=null}
    },
    async foreground(active){if(active){await this.start();if(!locked&&(await storage.getItem(LOCK_KEY))!=='1')client.auth.startAutoRefresh()}else client.auth.stopAutoRefresh()},
    async signOut(){
      locked=true;epoch++;onSession(null);
      await storage.setItem(LOCK_KEY,'1');
      if(await storage.getItem(LOCK_KEY)!=='1')throw new Error('Sign-out could not be saved. Try again.');
      try{await client.auth.signOut({scope:'local'});}finally{
        client.auth.stopAutoRefresh();
        const results=await Promise.allSettled(['','-code-verifier','-user'].map(suffix=>storage.removeItem(AUTH_STORAGE_KEY+suffix)));
        if(results.some(r=>r.status==='rejected'))throw new Error('Sign-in cleanup failed. The account remains locked.');
      }
    }
  };
}
