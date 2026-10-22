import {localDay} from './domain.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const note='Synthetic full-product check-in — reopen and verify.';
// Called only when the native DEBUG bridge returns an explicit probe launch mode.
export async function runCheckinProbe(vault,mode){
  const day=localDay(),stored=()=>getEntries()[day];
  if(mode==='checkin-write'){
    startCheckin();
    S={...blankCheckinState(),week:'dad',dadMode:'normal',kidsWithDad:['Alex','Sam'],diary:note,attachment:{name:'synthetic.png',type:'image/png',dataUrl:image}};
    goToDiary('s-dad-help-choice','Anything else to note?','Synthetic test only.',3,4);
    document.getElementById('diary-input').value=note;
    await saveEntry();
    if(document.body.dataset.activeScreen!=='s-saved')throw new Error('Product saved screen was not reached.');
  }else if(mode==='checkin-read'){
    if(document.body.dataset.activeScreen!=='s-home'||!document.getElementById('home-checkin-card').classList.contains('logged'))throw new Error('Today did not recover the check-in.');
    startTodayEdit();prepareEditTarget('s-diary');
    if(document.getElementById('diary-input').value!==note||S.attachment?.dataUrl!==image)throw new Error('Edit did not recover the note or image.');
  }else return;
  const entry=stored();
  if(entry?.week!=='dad'||entry?.dadMode!=='normal'||entry?.diary!==note||entry?.attachment?.dataUrl!==image||entry?.kidsWithDad?.join(',')!=='Alex,Sam')throw new Error('Full record mismatch.');
  await vault.write({key:'probe:'+mode,value:JSON.stringify({passed:true,day,noteRecovered:true,attachmentBytes:image.length,productScreen:document.body.dataset.activeScreen,at:new Date().toISOString()})});
}
