/* Frame for the isolated mobile UI preview; no backend or native data access. */
(() => {
  const body=document.body, app=document.getElementById('app');
  const header=document.getElementById('shell-header'), tabs=document.getElementById('shell-tabs');
  const back=document.getElementById('shell-back'), profile=document.getElementById('shell-profile');
  const brand=document.getElementById('shell-brand'), context=document.getElementById('shell-context');
  const announcement=document.getElementById('shell-announcement');
  const roots=new Map([['s-home','Today'],['s-cal','Calendar'],['s-export','Reports'],['s-setup','Settings']]);
  const actions={'s-home':()=>show('s-home'),'s-cal':()=>showCal(),'s-export':()=>showExport(),'s-setup':()=>showSetup()};
  const scrollPositions=new Map();
  let activeKey='', activeScreen='', restoring=false, frame=0;

  history.scrollRestoration='manual';
  app.setAttribute('role','main'); app.tabIndex=-1;
  document.querySelector('.shell-skip').addEventListener('click',event=>{
    event.preventDefault();app.focus({preventScroll:true});
  });
  // Existing product titles become focus targets without changing their typography.
  for(const selector of ['#home-greeting','#cal-title','.screen .q']) {
    document.querySelectorAll(selector).forEach(el=>{el.setAttribute('role','heading');el.setAttribute('aria-level','1');el.tabIndex=-1;});
  }
  const pageHeading=()=>[...document.getElementById(activeScreen)?.querySelectorAll('h1,[role="heading"],.ob-q,h2')||[]].find(el=>el.getClientRects().length);
  const focusHeading=()=>{
    // Diary and child editors deliberately focus their fields when opened.
    if(document.getElementById(activeScreen)?.contains(document.activeElement)&&document.activeElement.matches('input,textarea,[contenteditable="true"]'))return;
    const heading=pageHeading();
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  };
  const saveScroll=()=>{if(activeKey&&!restoring)scrollPositions.set(activeKey,scrollY);};
  function state() {
    const screen=body.dataset.activeScreen;
    const detail=screen==='s-setup'&&!document.querySelector('#s-setup .settings-back').hidden;
    const page=detail?document.querySelector('#s-setup [data-settings-page]:not([hidden])')?.dataset.settingsPage:'overview';
    return {screen,detail,key:screen+(screen==='s-setup'?'/'+page:'')};
  }
  function refresh() {
    const {screen,detail,key}=state();
    if(!screen||key===activeKey)return;
    activeScreen=screen;activeKey=key;
    // The outgoing screen remains painted during the slide animation, but
    // should stop receiving taps or appearing in the accessibility tree.
    document.querySelectorAll('.screen').forEach(element=>{
      element.inert=element.id!==screen;
      element.setAttribute('aria-hidden',String(element.id!==screen));
    });
    const flow=!roots.has(screen), originalBack=document.querySelector(`#${screen} .top-bar .back-btn`);
    body.dataset.shellFlow=String(flow);
    tabs.hidden=flow;
    back.hidden=!(detail||originalBack);
    back.setAttribute('aria-label',detail?'Back to Settings':'Back');
    brand.hidden=!back.hidden;context.hidden=back.hidden;
    context.textContent=detail?'Settings':'Check-in';
    profile.hidden=flow||screen==='s-setup';
    tabs.querySelectorAll('button').forEach(button=>{
      if(button.dataset.shellTab===screen)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    document.title=`${roots.get(screen)||'Check-in'} · Whose Day`;
    announcement.textContent=roots.get(screen)||pageHeading()?.textContent||'Check-in';
    cancelAnimationFrame(frame);restoring=true;
    frame=requestAnimationFrame(()=>{
      window.scrollTo({top:scrollPositions.get(key)||0,behavior:'instant'});
      restoring=false;focusHeading();
    });
  }
  function navigate(screen) {
    if(!actions[screen])return;
    if(screen===activeScreen&&!state().detail)return;
    saveScroll();actions[screen]();refresh();
  }
  tabs.addEventListener('click',event=>{
    const button=event.target.closest('[data-shell-tab]');
    if(button)navigate(button.dataset.shellTab);
  });
  profile.addEventListener('click',()=>navigate('s-setup'));
  back.addEventListener('click',()=>{
    saveScroll();
    if(state().detail)backToSettings();
    else document.querySelector(`#${activeScreen} .top-bar .back-btn`)?.click();
    refresh();
  });
  window.addEventListener('scroll',saveScroll,{passive:true});
  new MutationObserver(refresh).observe(body,{attributes:true,attributeFilter:['data-active-screen']});
  new MutationObserver(refresh).observe(document.getElementById('s-setup'),{subtree:true,attributes:true,attributeFilter:['hidden']});
  const measure=()=>{
    body.style.setProperty('--shell-header-height',`${header.getBoundingClientRect().height}px`);
    // Preserve the last real nav height when hidden for check-in or keyboard.
    if(!tabs.hidden&&tabs.getBoundingClientRect().height)body.style.setProperty('--shell-tabs-height',`${tabs.getBoundingClientRect().height}px`);
  };
  // Insets are padding, so observe border boxes rather than content boxes.
  new ResizeObserver(measure).observe(header,{box:'border-box'});
  new ResizeObserver(measure).observe(tabs,{box:'border-box'});

  // Account for both overlay keyboards and native WebView viewport resizing.
  let restingHeight=window.visualViewport?.height||innerHeight, restingWidth=innerWidth;
  const textInput=el=>el?.matches('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="file"]),[contenteditable="true"]');
  const keyboard=()=>{
    const height=window.visualViewport?.height||innerHeight;
    if(Math.abs(innerWidth-restingWidth)>80){restingWidth=innerWidth;restingHeight=height;}
    const editing=textInput(document.activeElement);
    body.dataset.shellKeyboard=String(!!editing&&restingHeight-height>120);
    if(!editing)restingHeight=height;
  };
  document.addEventListener('focusin',keyboard);
  document.addEventListener('focusout',()=>requestAnimationFrame(keyboard));
  window.addEventListener('resize',keyboard);
  window.visualViewport?.addEventListener('resize',keyboard);
  window.visualViewport?.addEventListener('scroll',keyboard);
  if(location.hash.startsWith('#settings'))showInitialApp();else show('s-home');
  refresh();measure();
})();
