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
    compareBatch({rows}){return new Promise((resolve,reject)=>{
      if(!Array.isArray(rows)||!rows.length||rows.length>20002||new Set(rows.map(r=>r.key)).size!==rows.length||rows.some(r=>!r||!String(r.key).match(/^[A-Za-z0-9:._-]{1,200}$/)||r.expected!==null&&typeof r.expected!=='string'||r.value!==undefined&&typeof r.value!=='string')||new TextEncoder().encode(JSON.stringify(rows)).length>64*1024*1024)return reject(Error('Invalid restore transaction.'));
      const tx=database.transaction('records','readwrite'),store=tx.objectStore('records');let matched=true,index=0;
      function next(){try{if(index===rows.length){for(const row of rows)if(row.value!==undefined)store.put(row.value,row.key);return;}const row=rows[index++],read=store.get(row.key);read.onsuccess=()=>{if((read.result??null)!==row.expected){matched=false;return;}next()};}catch(error){tx.abort();reject(error)}}next();
      tx.oncomplete=()=>resolve({matched});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Restore interrupted.'));
    })},
    deletePreviewAccount({prefix,marker}){return new Promise((resolve,reject)=>{
      const tx=database.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff'));
      read.onsuccess=()=>{for(const key of read.result)store.delete(key);store.put('deleted',marker)};
      tx.oncomplete=()=>resolve({deleted:true});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Deletion interrupted.'));
    })},
    compareAndSwap({key,expected,value,guard}){return new Promise((resolve,reject)=>{
      const tx=database.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.get(key);let matched=false;
      read.onsuccess=()=>{if((read.result??null)!==expected)return;if(guard){const check=store.get(guard.key);check.onsuccess=()=>{if((check.result??null)===guard.expected){matched=true;store.put(value,key)}}}else{matched=true;store.put(value,key)}};
      tx.oncomplete=()=>resolve(matched);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Write interrupted.'));
    })}
  };
}
