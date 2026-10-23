const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
export function canonical(value){
  if(value===undefined)return 'undefined';
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export const equal=(a,b)=>canonical(a)===canonical(b);
export async function fingerprint(value){
  const bytes=new TextEncoder().encode(canonical(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function validateSync(sync){
  if(!sync||Object.keys(sync).sort().join(',')!=='baseHash,version'||sync.version!==null&&(typeof sync.version!=='string'||sync.version.length>100||!sync.version))throw new Error('Invalid sync checkpoint.');
  if(sync.baseHash!==null){if(!/^[a-f0-9]{64}$/.test(sync.baseHash)||sync.version===null)throw new Error('Invalid sync checkpoint.');}
  else if(sync.version!==null)throw new Error('Invalid sync checkpoint.');
  return sync;
}
// Value and a hash of the last agreed cloud copy share one durable row. An interrupted
// upload never clears a pending edit; a late acknowledgement keeps newer edits.
export function createSyncStore({load,persist,validate}){
  let items={},ready=false,closed=false,uncertain=false,pending=0,opening=false,queue=Promise.resolve();const listeners=new Set();
  const assertOpen=()=>{if(!ready||closed)throw new Error('Records are not ready.');};
  const notify=kind=>{for(const listener of listeners)try{listener(kind)}catch{/* UI observers do not undo a verified save. */}};
  const serialized=operation=>{pending++;const next=queue.then(()=>{assertOpen();return operation()}).finally(()=>{pending--});queue=next.catch(()=>{});return next};
  async function write(id,item,kind){
    item={...item,hash:await fingerprint(item.value)};
    if(closed)throw new Error('The account changed during saving.');
    try{await persist(id,clone(item));uncertain=false;}catch(error){uncertain=true;throw error;}
    if(closed)throw new Error('The account changed during saving.');
    items={...items,[id]:clone(item)};notify(kind);
  }
  return {
    async open(){
      if(closed||opening||pending)throw new Error('Storage is closed or busy.');ready=false;opening=true;
      try{
        const loaded=await load();
        for(const [id,item] of Object.entries(loaded)){validate(id,item.value);validateSync(item.sync);item.hash=await fingerprint(item.value);}
        if(closed)throw new Error('Storage is closed.');items=loaded;ready=true;uncertain=false;
      }finally{opening=false;}
    },
    close(){closed=true;ready=false;items={};listeners.clear();return queue;},
    values(){assertOpen();return Object.fromEntries(Object.entries(items).map(([id,item])=>[id,clone(item.value)]));},
    syncItems(){assertOpen();if(uncertain)throw new Error('Retry the unverified save or reopen before syncing.');return clone(items);},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    local(id,value,expected){
      validate(id,value);
      return serialized(async()=>{
        if(!equal(items[id]?.value,expected))throw new Error('This date changed. Reopen it before saving again.');
        await write(id,{value:clone(value),sync:clone(items[id]?.sync||{baseHash:null,version:null})},'local');
      });
    },
    async accept(id,remote,expected){
      validate(id,remote.value);if(typeof remote.version!=='string'||!remote.version)throw new Error('Missing cloud version.');
      const baseHash=await fingerprint(remote.value);
      return serialized(async()=>{
        if(uncertain)throw new Error('Retry the unverified save or reopen before syncing.');
        if(!equal(items[id],expected))return false;
        await write(id,{value:remote.value,sync:{baseHash,version:remote.version}},'remote');return true;
      });
    },
    async acknowledge(id,remote,uploaded){
      validate(id,remote.value);if(!equal(remote.value,uploaded)||typeof remote.version!=='string'||!remote.version)throw new Error('Cloud acknowledgement did not match.');
      const baseHash=await fingerprint(remote.value);
      return serialized(async()=>{
        if(uncertain)throw new Error('Retry the unverified save or reopen before syncing.');
        if(!items[id])throw new Error('Missing local record.');
        await write(id,{value:items[id].value,sync:{baseHash,version:remote.version}},'ack');
      });
    }
  };
}
