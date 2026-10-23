const $=id=>document.getElementById(id);
export function deletionUI({accounts,remove,online,complete,restore,signOut,view,preview=false}){
  let busy=false;
  const legacy=document.querySelector('[data-settings-page="delete"] .settings-auth-card');legacy.hidden=true;
  const host=document.createElement('div');host.className='settings-card settings-auth-card';legacy.after(host);
  const copy=document.createElement('p');copy.textContent=preview?'This deletes the sample account from this browser’s two-device preview. Its family and check-ins are removed from the shared preview store. Device copies remain hidden.':'Permanently delete this test sign-in account, cloud family profile, check-ins and device sync records. This cannot be undone. Saved copies on this device and downloaded files remain; they will not move to another account.';
  const label=document.createElement('label');label.htmlFor='mobile-delete-confirm';label.textContent='Type DELETE to confirm';
  const input=document.createElement('input');input.id='mobile-delete-confirm';input.autocomplete='off';input.maxLength=6;
  const button=document.createElement('button');button.id='mobile-delete-account';button.className='btn mobile-delete-button';button.textContent='Delete test account';
  const status=document.createElement('p');status.id='mobile-delete-message';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  host.append(copy,label,input,button,status);
  function refresh(){
    button.disabled=busy||!remove||!online()||input.value!=='DELETE';
    if(!busy)status.textContent=!remove?'The separate test deletion service is not configured in this build. Your account and device records are kept.':!online()?'Reconnect before deleting this test account.':'';
  }
  async function perform(confirmation){
    if(busy||!remove||!online()||confirmation!=='DELETE')return;
    busy=true;for(const id of ['app','shell-header','shell-tabs'])$(id).inert=true;button.disabled=true;$('mobile-delete-retry').disabled=true;input.disabled=true;
    const owner=accounts.state.account?.scope;
    try{
      const result=await accounts.deleteAccount(confirmation,remove);
      if(result?.status==='deleted'&&accounts.state.account.scope===owner)await complete();
    }catch{
      if(accounts.state.account?.scope!==owner)return;
      if(accounts.state.status==='deletion-failed'){
        view('deletion');$('account-deletion-title').textContent='Account deletion did not complete';$('account-deletion-message').textContent='The service rejected the request. Your saved device copies are kept. Reopen the account to try again.';$('mobile-delete-reopen').hidden=false;$('mobile-delete-pending').hidden=true;
      }else if(accounts.state.status==='deletion-pending')pending();
      else status.textContent='Could not prepare a verified deletion request. Your account is still open here. Try again or reopen the app.';
    }finally{busy=false;for(const id of ['app','shell-header','shell-tabs'])$(id).inert=false;input.disabled=false;$('mobile-delete-retry').disabled=!remove||!online()||$('mobile-delete-retry-confirm').value!=='DELETE';button.disabled=!remove||!online()||input.value!=='DELETE';}
  }
  function pending(){
    view('deletion');$('account-deletion-title').textContent='Check account deletion';$('account-deletion-message').textContent='Deletion was requested, but the result could not be confirmed. This account stays locked here to prevent further sync. Its saved device copies are kept. Reconnect and retry, or sign out.';$('mobile-delete-pending').hidden=false;$('mobile-delete-reopen').hidden=true;
  }
  input.oninput=refresh;button.onclick=()=>perform(input.value);
  $('mobile-delete-retry').onclick=()=>perform($('mobile-delete-retry-confirm').value);
  $('mobile-delete-reopen').onclick=restore;$('mobile-delete-signout').onclick=signOut;
  $('mobile-delete-retry-confirm').oninput=()=>{$('mobile-delete-retry').disabled=!remove||!online()||$('mobile-delete-retry-confirm').value!=='DELETE'};
  return {refresh,pending,reset(){input.value='';$('mobile-delete-retry-confirm').value='';refresh()}};
}
