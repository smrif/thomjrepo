import {Capacitor,registerPlugin} from '@capacitor/core';
import {createRecordStore} from './record-store.js';
import {browserVault} from './browser-vault.js';
import {runCheckinProbe} from './checkin-probe.js';
import {mountProduct} from './product-runtime.js';
const native=Capacitor.isNativePlatform(),$=id=>document.getElementById(id);
const config={currentParentLabel:'Parent A',coParentLabel:'Parent B',email:'',children:['Alex','Sam'],purpose:'Synthetic mobile check-in',termsAccepted:false,activityIds:['school','afterschool','medical','practice','birthday','camp','therapy','religious'],themeMode:'system'};
let vault,mode='',store;
async function start(){
  $('checkin-retry').hidden=true;
  try{
    if(new URLSearchParams(location.search).has('demo'))throw new Error('Demo seeding is not allowed in the persistent check-in build.');
    vault=native?registerPlugin('WhoseDayVault'):await browserVault();
    if(native)mode=(await vault.testMode()).mode;
    store=createRecordStore(vault,{scope:mode.startsWith('checkin-')?'native-probe-v1':native?'native-sample-v1':'browser-sample-v1'});
    await store.open();
    await mountProduct({config,store});
    if(mode.startsWith('checkin-'))await runCheckinProbe(vault,mode);
  }catch(error){
    document.body.dataset.checkinState='error';
    $('checkin-loading').hidden=false;$('checkin-loading-title').textContent="Couldn't open your check-ins";
    $('checkin-loading-message').textContent='Your saved records have not been replaced. Close and reopen, or retry opening them.';
    $('checkin-retry').hidden=false;
    if(native&&mode.startsWith('checkin-'))await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:false,error:error.message})}).catch(()=>{});
  }
}
$('checkin-retry').onclick=()=>location.reload();start();
