// Browser-only two-device review: one shared mock server, separate local vaults.
// No credential, email or real Supabase call is used here.
export function deviceVault(vault,device){
  if(!['one','two'].includes(device))throw new Error('Invalid preview device.');
  const prefix='device-'+device+':';
  return {
    read:({key})=>vault.read({key:prefix+key}),write:({key,value})=>vault.write({key:prefix+key,value}),
    keys:async({prefix:part})=>({keys:(await vault.keys({prefix:prefix+part})).keys.map(key=>key.slice(prefix.length))})
  };
}
export function previewBackend(vault,owner,online){
  function transport(kind){
    const prefix='preview-cloud:v1:'+owner.scope+':'+kind+':';
    const check=()=>{if(!online())throw new Error('Preview device is offline.');};
    return {
      async list(){check();const rows={};for(const key of (await vault.keys({prefix})).keys){const {value}=await vault.read({key});rows[key.slice(prefix.length)]=JSON.parse(value);}check();return rows;},
      async get(id){check();const {value}=await vault.read({key:prefix+id});check();return value?JSON.parse(value):null;},
      async compareAndSet(id,value,version){
        check();const key=prefix+id,raw=(await vault.read({key})).value,current=raw?JSON.parse(raw):null;
        if((current?.version??null)!==version)return null;
        const next={value,version:crypto.randomUUID()};
        return await vault.compareAndSwap({key,expected:raw,value:JSON.stringify(next)})?next:null;
      }
    };
  }
  return {profile:transport('profile'),entries:transport('entries')};
}
