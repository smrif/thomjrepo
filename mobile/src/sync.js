import {equal,fingerprint} from './sync-store.js';

// The same three-way rule as the website: only a change on one side is
// automatic. Divergent copies remain intact until the owner chooses one.
export async function syncDecision(local,remote){
  if(remote?.deleted)return local?'conflict':'none';
  if(!local)return remote?'download':'none';
  if(!remote)return 'upload';
  if(equal(local.value,remote.value))return 'matched';
  if(local.sync.baseHash===await fingerprint(remote.value))return 'upload';
  if(local.sync.baseHash===(local.hash??await fingerprint(local.value)))return 'download';
  return 'conflict';
}
export function createSync({store,transport,onState=()=>{},online=()=>globalThis.navigator?.onLine!==false,canDownload=()=>true}){
  let closed=false,running=null,deferred=false,conflicts={},status={status:'idle',pending:0,conflicts:[]};
  const check=()=>{if(closed)throw new Error('Sync account closed.');};
  function publish(name){
    if(closed)return;
    let rows;try{rows=store.syncItems();}catch{status={...status,status:'error'};onState(status);return;}const dirty=Object.values(rows).map(row=>row.hash!==row.sync.baseHash);status={status:name,pending:dirty.filter(Boolean).length,conflicts:Object.values(conflicts)};
    onState(status);
  }
  async function reconcile(id,local,remote){
    check();
    const choice=await syncDecision(local,remote);check();
    if(choice==='conflict'){conflicts[id]={id,local:local?.value??null,remote};return;}
    delete conflicts[id];
    if(choice==='download'){
      if(!canDownload()){deferred=true;return;}
      await store.accept(id,remote,local);check();
    }else if(choice==='matched'){
      if(local.sync.baseHash===await fingerprint(remote.value)&&local.sync.version===remote.version)return;
      // Matching values also refresh the CAS version after a remote no-op edit.
      await store.acknowledge(id,remote,local.value);check();
    }else if(choice==='upload'){
      const saved=await transport.compareAndSet(id,local.value,remote?.version??null);check();
      if(saved)await store.acknowledge(id,saved,local.value);
      else{const latest=await transport.get(id);check();conflicts[id]={id,local:store.syncItems()[id]?.value??null,remote:latest};}
    }
  }
  async function execute(){
    if(!online()){await publish('offline');return;}
    deferred=false;await publish('syncing');
    try{
      const remote=await transport.list();check();const local=store.syncItems();
      for(const id of new Set([...Object.keys(local),...Object.keys(remote)]))await reconcile(id,local[id],remote[id]);
      check();await publish(Object.keys(conflicts).length?'conflict':deferred?'waiting':'synced');
    }catch(error){if(!closed)await publish(online()?'error':'offline');}
  }
  return {
    get state(){return status},
    run(){if(closed)return Promise.resolve();if(running)return running;running=execute().finally(()=>{running=null});return running;},
    close(){closed=true;conflicts={};return running??Promise.resolve();},
    async resolve(id,choice,review=conflicts[id]){
      if(running)await running;check();
      const conflict=conflicts[id];if(!conflict||!['local','cloud'].includes(choice))throw new Error('Reopen conflict review.');
      if(!equal(conflict,review)){await publish('conflict');return false;}
      const local=store.syncItems()[id];
      if(!equal(local?.value??null,conflict.local)){await this.run();return false;}
      if(!online()){await publish('offline');return false;}
      // Keep the entire review serialized with automatic sync. A failed CAS or
      // new remote version always requires a fresh decision, including cloud use.
      let resolved=false;
      running=(async()=>{
        await publish('syncing');
        try{
          const latest=await transport.get(id);check();
          if(!equal(latest,conflict.remote)){conflicts[id]={id,local:store.syncItems()[id]?.value??null,remote:latest};await publish('conflict');return;}
          if(choice==='cloud'){
            if(!latest||latest.deleted||!canDownload())throw new Error('Cloud copy cannot be applied now.');
            resolved=await store.accept(id,latest,local);check();
          }else{
            const saved=await transport.compareAndSet(id,local.value,latest?.version??null);check();
            if(saved){await store.acknowledge(id,saved,local.value);check();resolved=true;}
            else{const newer=await transport.get(id);check();conflicts[id]={id,local:store.syncItems()[id]?.value??null,remote:newer};}
          }
          if(resolved)delete conflicts[id];await publish(Object.keys(conflicts).length?'conflict':deferred?'waiting':'synced');
        }catch{if(!closed)await publish(online()?'error':'offline');}
      })().finally(()=>{running=null});
      await running;return resolved;
    }
  };
}
