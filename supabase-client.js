(function(){
  let sdkPromise=null;
  let client=null;

  function authStorageKey(){
    return 'sb-'+new URL(settings().url).hostname.split('.')[0]+'-auth-token';
  }

  function settings(){
    return window.WHOSE_DAY_SUPABASE || {};
  }

  function isConfigured(){
    const config=settings();
    return Boolean(config.url && config.publishableKey);
  }

  function isEnabled(){
    return settings().enabled === true && isConfigured();
  }

  function loadSdk(){
    if(window.supabase)return Promise.resolve(window.supabase);
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const config=settings();
      const script=document.createElement('script');
      script.src=config.sdkUrl;
      script.async=true;
      script.onload=()=>window.supabase?resolve(window.supabase):reject(new Error('Supabase SDK did not load.'));
      script.onerror=()=>reject(new Error('Could not load Supabase SDK.'));
      document.head.appendChild(script);
    });
    return sdkPromise;
  }

  async function getClient(){
    if(!isEnabled())throw new Error('Supabase is not enabled.');
    if(client)return client;
    const sdk=await loadSdk();
    const config=settings();
    client=sdk.createClient(config.url,config.publishableKey,{
      auth:{
        storageKey:authStorageKey(),
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    });
    return client;
  }

  async function getSession(){
    const supabaseClient=await getClient();
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    if(data.session)return data.session;
    return waitForSession(supabaseClient);
  }

  function waitForSession(supabaseClient,timeoutMs=5000){
    return new Promise(resolve=>{
      let settled=false;
      let subscription=null;
      const finish=session=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        if(subscription)subscription.unsubscribe();
        resolve(session||null);
      };
      const timer=setTimeout(()=>finish(null),timeoutMs);
      const result=supabaseClient.auth.onAuthStateChange((_event,session)=>{
        if(session)finish(session);
      });
      subscription=result.data.subscription;
      supabaseClient.auth.getSession().then(({data})=>{
        if(data.session)finish(data.session);
      }).catch(()=>finish(null));
    });
  }

  async function signInWithEmail(email,redirectTo,{createUser=false}={}){
    const supabaseClient=await getClient();
    const {error}=await supabaseClient.auth.signInWithOtp({
      email,
      options:{
        shouldCreateUser:createUser,
        emailRedirectTo:redirectTo || settings().redirectTo || window.location.href
      }
    });
    if(error)throw error;
  }

  async function signOut(){
    const supabaseClient=await getClient();
    const {error}=await supabaseClient.auth.signOut();
    if(error)throw error;
  }

  async function getProfile(userId){
    const supabaseClient=await getClient();
    const {data,error}=await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id',userId)
      .maybeSingle();
    if(error)throw error;
    return data;
  }

  async function upsertProfile(profile){
    const supabaseClient=await getClient();
    const {data,error}=await supabaseClient
      .from('profiles')
      .upsert(profile,{onConflict:'user_id'})
      .select('*')
      .single();
    if(error)throw error;
    return data;
  }

  async function upsertCustodyEntries(entries){
    const supabaseClient=await getClient();
    const {data,error}=await supabaseClient
      .from('custody_entries')
      .upsert(entries,{onConflict:'user_id,entry_date'})
      .select('entry_date');
    if(error)throw error;
    return data || [];
  }

  async function getCustodyEntries(userId){
    const supabaseClient=await getClient();
    const {data,error}=await supabaseClient
      .from('custody_entries')
      .select('entry_date, entry_json, updated_at, client_updated_at, device_id')
      .eq('user_id',userId)
      .is('deleted_at',null)
      .order('entry_date',{ascending:true});
    if(error)throw error;
    return data || [];
  }

  async function saveCustodyEntry(entry,expectedUpdatedAt=null){
    const supabaseClient=await getClient();
    const columns='entry_date, entry_json, updated_at, client_updated_at, device_id';
    const request=expectedUpdatedAt
      ? supabaseClient.from('custody_entries').update(entry)
        .eq('user_id',entry.user_id).eq('entry_date',entry.entry_date)
        .eq('updated_at',expectedUpdatedAt).select(columns).maybeSingle()
      : supabaseClient.from('custody_entries').insert(entry).select(columns).single();
    const {data,error}=await request;
    if(error?.code==='23505')return null;
    if(error)throw error;
    return data;
  }

  async function upsertSyncDevice(device){
    const supabaseClient=await getClient();
    const {data,error}=await supabaseClient
      .from('sync_devices')
      .upsert(device,{onConflict:'user_id,device_id'})
      .select('device_id, last_sync_at')
      .single();
    if(error)throw error;
    return data;
  }

  async function deleteAccount(){
    if(!['https:','http:'].includes(window.location.protocol)){
      throw new Error('Open the hosted Whose Day app to delete your account.');
    }
    const supabaseClient=await getClient();
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    if(!data.session?.access_token)throw new Error('Sign in before deleting your account.');
    const response=await fetch('/api/account',{
      method:'DELETE',
      credentials:'omit',
      headers:{
        'content-type':'application/json',
        authorization:'Bearer '+data.session.access_token
      },
      body:JSON.stringify({confirmation:'DELETE'})
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.deleted!==true){
      throw new Error(result?.message||'Could not confirm account deletion. Please try again.');
    }
    // A deleted user cannot refresh; clear this device even if the logout request fails.
    try{
      await supabaseClient.auth.stopAutoRefresh();
      const {error:signOutError}=await supabaseClient.auth.signOut({scope:'local'});
      if(signOutError)throw signOutError;
    }catch{
      localStorage.removeItem(authStorageKey());
      localStorage.removeItem(authStorageKey()+'-code-verifier');
      localStorage.removeItem(authStorageKey()+'-user');
    }
    client=null;
    return true;
  }

  window.WhoseDayBackend = {
    isConfigured,
    isEnabled,
    settings,
    getClient,
    getSession,
    signInWithEmail,
    signOut,
    getProfile,
    upsertProfile,
    upsertCustodyEntries,
    getCustodyEntries,
    saveCustodyEntry,
    upsertSyncDevice,
    deleteAccount
  };
})();
