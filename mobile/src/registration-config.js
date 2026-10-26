import {testProject} from './auth.js';

// A missing flag preserves the existing lab. An enabled contract must never
// silently fall back to local-only registration or activate the production URL.
export function registrationEnabled(config){
  if(config.registration?.enabled!==true)return false;
  if(config.registration.contractVersion!==1||config.auth?.enabled!==true||config.sync?.enabled!==true)throw Error('Registration contract v1 requires test authentication and sync.');
  testProject(config.auth);
  return true;
}
