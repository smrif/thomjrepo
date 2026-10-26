import {validateProfile} from './profile-store.js';

// The website and mobile use the same server columns. Account identity comes
// from Auth; report_email and legacy acceptance snapshots are never copied into
// sign-in identity or inferred as a fresh agreement on this device.
export function profileFromRow(row,owner){
  if(!row||row.user_id!==owner.id||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw Error('Invalid cloud profile ownership or version.');
  return {value:validateProfile({currentParentLabel:row.current_parent_label,coParentLabel:row.co_parent_label,children:row.children,activityIds:row.activities,themeMode:row.theme_mode},owner.email),version:row.updated_at};
}
export function profileToColumns(value,email){
  const profile=validateProfile(value,email);
  return {current_parent_label:profile.currentParentLabel,co_parent_label:profile.coParentLabel,children:profile.children,activities:profile.activityIds,theme_mode:profile.themeMode};
}
