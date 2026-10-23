import website from '../../src/worker.js';
const origins=new Set(['capacitor://localhost','https://localhost']);
const reply=(body,status=400,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
// Separate test deployment only. Reuse the website's verified-token deletion
// handler; permit native origins only after validating the test project.
export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('origin');
    if(url.pathname!=='/api/account')return reply({error:'not_found'},404);
    let project;
    try{const target=new URL(env.SUPABASE_URL);if(target.protocol!=='https:'||target.pathname!=='/'||target.port||target.username||target.password||target.search||target.hash||!/^([a-z0-9-]{1,30})\.supabase\.co$/.test(target.hostname))throw Error();project=target.hostname.split('.')[0];}catch{return reply({error:'test_service_unavailable'},503)}
    if(project==='hdfuknggfkmaycnantxv'||project!==env.MOBILE_TEST_PROJECT||env.MOBILE_TEST_API_ENABLED!=='true')return reply({error:'test_service_unavailable'},503);
    if(!origin||!origins.has(origin))return reply({error:'forbidden'},403);
    const cors={'access-control-allow-origin':origin,'vary':'Origin'};
    if(request.method==='OPTIONS'){
      const headers=(request.headers.get('access-control-request-headers')||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
      if(request.headers.get('access-control-request-method')!=='DELETE'||headers.some(h=>!['authorization','content-type'].includes(h)))return reply({error:'forbidden'},403,cors);
      return new Response(null,{status:204,headers:{...cors,'cache-control':'no-store','access-control-allow-methods':'DELETE','access-control-allow-headers':'authorization, content-type'}});
    }
    const headers=new Headers(request.headers);headers.delete('origin');headers.delete('sec-fetch-site');
    const response=await website.fetch(new Request(request,{headers}),env);
    const resultHeaders=new Headers(response.headers);for(const [key,value] of Object.entries(cors))resultHeaders.set(key,value);
    return new Response(response.body,{status:response.status,headers:resultHeaders});
  }
};
