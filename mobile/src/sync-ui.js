import {equal} from './sync-store.js';
const $=id=>document.getElementById(id);
export function syncUI({accounts,previewDevice='',online,toggleOnline,canDownload=()=>true}){
  const states={};let reviewSignature='';
  function text(){
    const all=Object.values(states),conflicts=all.reduce((n,s)=>n+s.conflicts.length,0),pending=all.reduce((n,s)=>n+s.pending,0);
    if(conflicts)return `${conflicts} ${conflicts===1?'change needs':'changes need'} review. Both copies are kept until you choose.`;
    if(all.some(s=>s.status==='error'))return 'Couldn’t finish syncing. Device saves are kept. Reconnect or try Sync now.';
    if(!online()||all.some(s=>s.status==='offline'))return `Offline. Device saves are kept${pending?' and waiting to sync':''}.`;
    if(pending)return `${pending} ${pending===1?'change saved':'changes saved'} on this device, waiting to sync.`;
    if(all.some(s=>s.status==='syncing'))return 'Syncing with the test account…';
    if(all.some(s=>s.status==='waiting'))return 'Cloud changes will load when you return to Today.';
    return all.length?'Up to date with this test account.':'Waiting to sync.';
  }
  function copy(label,value){
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=label;details.append(summary);
    const line=(label,text)=>{
      const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label+': ';p.append(strong,document.createTextNode(text));details.append(p);
    };
    if(!value)line('Copy','No copy is available.');
    else if(value.children){
      for(const [key,label] of [['currentParentLabel','Your label'],['coParentLabel','Co-parent'],['children','Children'],['activityIds','Activities'],['themeMode','Appearance']])line(label,Array.isArray(value[key])?value[key].join(', '):value[key]||'Default');
    }else{
      line('Day',window.describeEntry?.(value)||value.week);
      line('Note',value.diary||'No note');
      for(const [key,label] of [['kidsWithDad','With you'],['helpedKids','You helped'],['dadHadKids','You had the children'],['momHadKidsOnDadWeek','With co-parent'],['momOpts','Co-parent help']])if(value[key]?.length)line(label,value[key].join(', '));
      for(const [key,label] of [['absentData','Away'],['helpedData','Your help'],['momHelpedOnDadWeek','Co-parent help']])for(const [name,detail] of Object.entries(value[key]||{})){
        line(label+' · '+name,[detail.location,detail.acts?.join(', '),detail.note].filter(Boolean).join(' · ')||'No additional detail');
      }
      if(typeof value.changeAgreed==='boolean')line('Schedule change agreed',value.changeAgreed?'Yes':'No');
      if(typeof value.changePressured==='boolean')line('Pressure to change the schedule',value.changePressured?'Yes':'No');
      if(value.loggedAt||value.missedAt)line('Recorded',new Date(value.loggedAt||value.missedAt).toLocaleString());
      if(value.attachment)line('Attachment',value.attachment.name);
    }
    if(value?.attachment){const image=document.createElement('img');image.src=value.attachment.dataUrl;image.alt='Check-in attachment';image.style.maxWidth='100%';details.append(image);}
    return details;
  }
  function render(){
    const label=text();$('account-sync-status').textContent=label;
    if(previewDevice){const toggle=$('account-preview-network');toggle.textContent=online()?'Go offline on this device':'Reconnect this device';toggle.disabled=navigator.onLine===false;}
    for(const el of document.querySelectorAll('[data-mobile-sync-status]'))el.textContent=label;
    const summary=$('settings-sync-summary');if(summary)summary.textContent=label;
    const home=$('account-sync-home');if(home)home.textContent=label+' Open sync.';
    const current=accounts().state;
    $('account-profile-apply').disabled=!canDownload();
    $('account-profile-apply').hidden=current.status!=='ready'||equal(current.config,current.profile.config());
    const signature=JSON.stringify(Object.entries(states).flatMap(([kind,s])=>s.conflicts.map(c=>({kind,...c}))));
    if(signature===reviewSignature)return;reviewSignature=signature;$('account-conflicts').replaceChildren();
    for(const [kind,state] of Object.entries(states))for(const conflict of state.conflicts){
      const box=document.createElement('article');box.className='account-conflict';box.dataset.conflictId=conflict.id;
      const title=document.createElement('h3');title.textContent=kind==='profile'?'Family profile changed':conflict.id+' · Two different check-ins';
      const note=document.createElement('p');note.textContent=conflict.remote?.deleted?'This date was removed in the cloud. The device copy is retained. Review the removal on the website, or explicitly restore the device copy.':'Compare both copies before choosing which one to keep.';
      box.append(title,note,copy('This device',conflict.local),copy('Cloud copy',conflict.remote?.value));
      for(const [choice,label] of [['local','Keep this device'],['cloud','Use cloud copy']]){
        const button=document.createElement('button');button.className='btn';button.textContent=label;button.dataset.syncChoice=choice;
        button.disabled=choice==='cloud'&&(!conflict.remote||conflict.remote.deleted)||choice==='local'&&!conflict.local;
        button.onclick=async()=>{
          for(const b of box.querySelectorAll('button'))b.disabled=true;
          const manager=accounts().syncs[kind==='profile'?0:1];
          try{
            const resolved=await manager.resolve(conflict.id,choice,conflict);
            if(!resolved)note.textContent='The copy changed again, syncing failed, or a check-in is still open. Review the current copies and retry after returning to Today.';
          }catch{note.textContent='Could not apply that choice. Both copies are kept. Try syncing again.';}
          finally{$('account-sync-status').tabIndex=-1;$('account-sync-status').focus();for(const b of box.querySelectorAll('button'))b.disabled=b.dataset.syncChoice==='cloud'&&(!conflict.remote||conflict.remote.deleted)||b.dataset.syncChoice==='local'&&!conflict.local;}
        };
        box.append(button);
      }
      $('account-conflicts').append(box);
    }
  }
  $('account-sync').hidden=false;$('account-no-sync').hidden=true;
  $('account-sync-environment').textContent=previewDevice?'Two-device browser preview. The mock cloud is stored in this browser; it does not contact a server.':'Separate mobile test backend. Production accounts are not connected.';
  $('account-sync-now').onclick=()=>accounts().sync();
  $('account-profile-apply').onclick=()=>location.reload();
  if(previewDevice){
    const toggle=$('account-preview-network');toggle.hidden=false;
    const updateToggle=()=>{toggle.textContent=online()?'Go offline on this device':'Reconnect this device';render()};
    toggle.onclick=async()=>{await toggleOnline();updateToggle();await accounts().sync()};
    const other=$('account-preview-other'),next=previewDevice==='one'?'two':'one';other.hidden=false;other.href='index.html?sync=preview&device='+next;other.textContent='Open preview device '+next;
    updateToggle();
  }
  return {update(kind,state){states[kind]=state;render()},render,reset(){for(const kind of Object.keys(states))delete states[kind];reviewSignature='';$('account-conflicts').replaceChildren();render()}};
}
