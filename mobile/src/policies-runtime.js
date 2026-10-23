// Approved, versioned repository documents are embedded at build time. Reading
// never creates acceptance history or navigates away from the account WebView.
const documents=__WHOSE_DAY_POLICIES__;
const $=id=>document.getElementById(id);
export function mountPolicies({setView,owner,status}){
  const page=$('account-policies'),content=$('mobile-policy-content'),heading=$('mobile-policy-heading');let source=null;
  function close(){
    if(!source||document.body.dataset.accountView!=='policies'||owner()!==source.owner||status()!==source.status)return;
    const previous=source;source=null;content.replaceChildren();setView(previous.view);document.body.dataset.checkinState=previous.checkin;
    requestAnimationFrame(()=>{if(document.body.dataset.accountView!==previous.view||owner()!==previous.owner)return;window.scrollTo(0,previous.scroll);if(previous.focus?.isConnected)previous.focus.focus({preventScroll:true});});
  }
  function render(kind){
    const policy=documents[kind];if(!policy)return;
    // HTML comes exclusively from the build-validated, checked-in policy main.
    const parsed=new DOMParser().parseFromString('<main>'+policy.html+'</main>','text/html'),main=parsed.querySelector('main');
    main.querySelector('.brand')?.remove();main.querySelector('h1')?.remove();
    for(const link of main.querySelectorAll('a')){
      const button=document.createElement('button');button.type='button';button.className='mobile-policy-link';button.textContent=link.textContent;
      const target=link.getAttribute('href');button.onclick=target==='privacy.html'?()=>render('privacy'):target==='terms.html'?()=>render('terms'):close;link.replaceWith(button);
    }
    content.replaceChildren(...main.childNodes);
    heading.textContent=policy.title;$('mobile-policy-version').textContent='Version '+policy.version;window.scrollTo(0,0);heading.focus({preventScroll:true});
  }
  function open(kind){
    if(!documents[kind])return;
    if(document.body.dataset.accountView!=='policies')source={view:document.body.dataset.accountView,checkin:document.body.dataset.checkinState,owner:owner(),status:status(),focus:document.activeElement,scroll:scrollY};
    setView('policies');render(kind);
  }
  function controls(host){
    const group=document.createElement('div');group.className='mobile-policy-actions';group.setAttribute('role','group');group.setAttribute('aria-label','Policies');
    for(const kind of ['terms','privacy']){const button=document.createElement('button');button.type='button';button.className='settings-export-btn';button.dataset.mobilePolicy=kind;button.textContent=documents[kind].title;button.onclick=()=>open(kind);group.append(button);}host.append(group);
  }
  for(const id of ['account-welcome','account-profile','account-panel'])controls($(id));
  $('mobile-policy-back').onclick=close;
  page.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close()}});
  return{addSettings(){controls(document.querySelector('[data-settings-page="overview"]'))}};
}
