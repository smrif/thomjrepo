import {createRepository,reportText} from './domain.js';
const fixture={schema:1,day:'2000-01-01',week:'dad',diary:'Synthetic force-quit recovery test — αβ.',attachment:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',loggedAt:'2000-01-01T12:00:00Z'};
// Explicit debug-launch probe: exercise native bridges, without UI automation or network.
export async function runProbe(vault,mode) {
  if(!['write','read'].includes(mode))return null;
  const repo=createRepository(vault);
  try{
    if(mode==='write'){
      await repo.save(fixture);
      await vault.writeSecret({key:'probe-session',value:'synthetic-session-persisted'});
      if((await vault.readSecret({key:'probe-session'})).value!=='synthetic-session-persisted')throw new Error('Secure write readback failed');
    }else{
      const restored=await repo.load(fixture.day);
      if(JSON.stringify(restored)!==JSON.stringify(fixture))throw new Error('Record or image recovery mismatch');
      if((await vault.readSecret({key:'probe-session'})).value!=='synthetic-session-persisted')throw new Error('Secure session did not survive relaunch');
      await vault.removeSecret({key:'probe-session'});
      if((await vault.readSecret({key:'probe-session'})).value!==null)throw new Error('Secure removal failed');
    }
    const {uri}=await vault.makeReport({text:reportText(fixture)+'\n'+('Synthetic line for pagination.\n'.repeat(100))});
    const result={mode,passed:true,attachmentBytes:fixture.attachment.length,pdf:uri,at:new Date().toISOString()};
    await vault.write({key:'probe:'+mode,value:JSON.stringify(result)});return result;
  }catch(error){await vault.write({key:'probe:'+mode,value:JSON.stringify({mode,passed:false,error:error.message,at:new Date().toISOString()})});throw error}
}
