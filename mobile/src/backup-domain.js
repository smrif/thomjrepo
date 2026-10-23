import '../../backup.js';
import {validateEntry} from './record-store.js';
import {validateProfile} from './profile-store.js';
export const portable=globalThis.WhoseDayBackup;
export function mobileBackup(backup){
  portable.validate(backup);
  for(const [day,entry] of Object.entries(backup.entries))validateEntry(day,entry);
  if(backup.settings.childActivities!==undefined)throw Error('This backup uses child activity settings unavailable in this mobile build. Keep the file and use the website to review it.');
  const {currentParentLabel,coParentLabel,children,activityIds,themeMode,purpose}=backup.settings;
  validateProfile({currentParentLabel,coParentLabel,children,...(activityIds===undefined?{}:{activityIds}),...(themeMode===undefined?{}:{themeMode}),...(purpose===undefined?{}:{purpose})},backup.account.email);
  if(activityIds!==undefined&&(!activityIds.length||new Set(activityIds).size!==activityIds.length))throw Error('Choose a backup with one to thirty different activities.');
  return backup;
}
export async function parseBackup(text){return mobileBackup(await portable.parse(text))}
export function mergeBackup(backup,state,selection){
  mobileBackup(backup);const result=portable.merge(backup,state,selection);
  if(Object.keys(result.records).length>20000)throw Error('Restoring would exceed the 20,000-record limit.');
  result.config=validateProfile(result.config,state.account.email);return result;
}
