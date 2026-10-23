// Browser-only persistence for review. It never substitutes for the native
// bridge on a device and is deliberately labeled as browser storage in the UI.
export async function browserVault(){
  const database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('whose-day-checkin-synthetic-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('records');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Close other test tabs and retry.'));
  });
  function transaction(mode,operation){return new Promise((resolve,reject)=>{
    const tx=database.transaction('records',mode),request=operation(tx.objectStore('records'));
    let value;request.onsuccess=()=>{value=request.result};
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Write interrupted.'));
  });}
  return {
    async keys({prefix}){return {keys:await transaction('readonly',store=>store.getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff')))}},
    async read({key}){return {value:await transaction('readonly',store=>store.get(key))??null}},
    async write({key,value}){await transaction('readwrite',store=>store.put(value,key))},
    compareAndSwap({key,expected,value}){return new Promise((resolve,reject)=>{
      const tx=database.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.get(key);let matched=false;
      read.onsuccess=()=>{if((read.result??null)===expected){matched=true;store.put(value,key)}};
      tx.oncomplete=()=>resolve(matched);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Write interrupted.'));
    })}
  };
}
