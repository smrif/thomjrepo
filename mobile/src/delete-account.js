import {testProject} from './auth.js';
export function deletionEndpoint(config){
  if(!config.deletion?.enabled)return null;
  if(!config.auth?.enabled)throw new Error('Deletion requires test auth.');
  const project=testProject(config.auth),url=new URL(config.deletion.url);
  if(config.deletion.project!==project||url.protocol!=='https:'||url.port||url.username||url.password||url.pathname!=='/api/account'||url.search||url.hash||!/^whose-day-mobile-test(?:-[a-z0-9-]+)?\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname))throw new Error('Use a separate mobile test deletion service for this auth project.');
  return url.href;
}
export function accountDeletion(auth,config,{fetcher=fetch,timeout=15000}={}){
  const endpoint=deletionEndpoint(config);if(!endpoint)return null;
  return owner=>auth.withSession(owner.id,async(client,check)=>{
    const {data,error}=await client.auth.getSession();check();
    if(error||!data.session?.access_token||data.session.user?.id!==owner.id){const denied=new Error('Sign in before deleting this test account.');denied.definite=true;throw denied;}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetcher(endpoint,{method:'DELETE',headers:{authorization:'Bearer '+data.session.access_token,'content-type':'application/json'},body:JSON.stringify({confirmation:'DELETE'}),credentials:'omit',redirect:'error',signal:controller.signal});check();
      const result=await response.json();
      if(!response.ok||result?.deleted!==true){const failed=new Error('Account deletion could not be confirmed.');failed.definite=[400,401,403,405,415,503].includes(response.status);throw failed;}
      return {deleted:true};
    }finally{clearTimeout(timer)}
  });
}
