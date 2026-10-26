import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {candidateMarkup,candidateSharedApp,candidateManifest} from '../scripts/candidate-package.mjs';
const root=resolve(import.meta.dirname,'../..');
test('candidate sanitizers reject changed source boundaries instead of silently shipping tools',async()=>{
  const account=await readFile(join(root,'mobile/src/account.html'),'utf8'),onboarding=await readFile(join(root,'mobile/src/onboarding.html'),'utf8'),shared=await readFile(join(root,'app.js'),'utf8');
  const clean=candidateMarkup(account,onboarding);
  assert(!clean.account.includes('account-preview'));assert(!clean.account.includes('account-profile-form'));assert(!clean.onboarding.includes('onboarding-preview-account'));
  assert(clean.account.includes('account-login'));assert(clean.onboarding.includes('onboarding-agree'));
  const app=candidateSharedApp(shared);assert(!/seedJune|seedJuly|DEMO_MODE|DEMO_PARAMS|localStorage.clear\(\)/.test(app));
  assert(app.includes('function startCheckin('));assert(app.includes('const ONBOARDING_PREVIEW=false;'));
  assert.throws(()=>candidateMarkup(account.replace('id="account-preview"','id="renamed"'),onboarding),/source boundary/);
  assert.throws(()=>candidateMarkup(account+account,onboarding),/source boundary/);
  assert.throws(()=>candidateSharedApp(shared.replace('function seedJuneDemoData(){','function renamed(){')),/source boundary/);
});
test('candidate manifest rejects extra routes, runtime fixtures, links and missing entries',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'whose-day-candidate-test-'));
  try{
    await mkdir(join(dir,'account'));const paths=['index.html','entry.js','account/index.html','account/account-runtime.js','account/app.js','account/shell.js'];
    for(const path of paths)await writeFile(join(dir,path),'');
    const manifest=await candidateManifest(dir);assert.equal(manifest.readyForRelease,false);assert.equal(manifest.productionAuthAllowed,false);assert.equal(manifest.authConfigured,false);assert.equal(manifest.files['entry.js'].sha256.length,64);
    for(const path of ['lab.js','account/extra.js','account/checkin-runtime.js']){await writeFile(join(dir,path),'');await assert.rejects(candidateManifest(dir),/Unexpected|Developer/);await rm(join(dir,path));}
    await writeFile(join(dir,'account/account-runtime.js'),'parent-a@example.invalid');await assert.rejects(candidateManifest(dir),/Developer marker/);await writeFile(join(dir,'account/account-runtime.js'),'');
    await symlink(join(dir,'entry.js'),join(dir,'account/linked.js'));await assert.rejects(candidateManifest(dir),/symbolic link/);await rm(join(dir,'account/linked.js'));
    await rm(join(dir,'entry.js'));await assert.rejects(candidateManifest(dir),/Missing candidate entry/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
