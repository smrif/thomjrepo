import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile),repo=resolve(import.meta.dirname,'../..');
test('candidate build isolates configuration and preserves both dev output and last good candidate on rejection',async()=>{
  // Isolate mutations from the owner's ignored configuration and running app.
  const fixture=await mkdtemp(join(tmpdir(),'whose-day-candidate-build-')),mobile=join(fixture,'mobile');
  try{
    await mkdir(mobile);
    for(const name of ['scripts','src'])await cp(join(repo,'mobile',name),join(mobile,name),{recursive:true});
    await writeFile(join(mobile,'package.json'),'{"type":"module"}');
    await symlink(join(repo,'mobile/node_modules'),join(mobile,'node_modules'),'dir');
    for(const name of ['app.js','backup.js','styles.css','theme.css','terms.html','privacy.html','index.html','assets'])await cp(join(repo,name),join(fixture,name),{recursive:true});
    await mkdir(join(mobile,'www'));await writeFile(join(mobile,'www/owner-sentinel'),'keep development assets');
    const candidateConfig=join(mobile,'config.candidate.local.json'),manifestPath=join(mobile,'.build/candidate/manifest.json');
    // A broken/production development config must never be implicitly reused.
    const forbidden={auth:{enabled:true,url:'https://hdfuknggfkmaycnantxv.supabase.co',publishableKey:'sb_publishable_DEV_SENTINEL'}};
    await writeFile(join(mobile,'config.local.json'),JSON.stringify(forbidden));
    const build=(args=['--candidate'])=>execute(process.execPath,[join(mobile,'scripts/build.mjs'),...args],{timeout:30000,maxBuffer:1024*1024});
    await build();let manifest=JSON.parse(await readFile(manifestPath));assert.equal(manifest.authConfigured,false);
    assert(!(await readFile(join(mobile,'.build/candidate/www/account/account-runtime.js'),'utf8')).includes('sb_publishable_DEV_SENTINEL'));
    const previous=await readFile(manifestPath,'utf8');
    await writeFile(candidateConfig,JSON.stringify(forbidden));await assert.rejects(build(),/separate Supabase test project/);assert.equal(await readFile(manifestPath,'utf8'),previous);
    await writeFile(candidateConfig,'{bad json');await assert.rejects(build());assert.equal(await readFile(manifestPath,'utf8'),previous);
    await rm(candidateConfig);await assert.rejects(build(['--candiate']),/Usage/);
    // A late source-boundary failure must also preserve the last good payload.
    const accountPath=join(mobile,'src/account.html'),account=await readFile(accountPath,'utf8');
    await writeFile(accountPath,account.replace('id="account-preview"','id="renamed"'));await assert.rejects(build(),/source boundary/);assert.equal(await readFile(manifestPath,'utf8'),previous);await writeFile(accountPath,account);
    await writeFile(candidateConfig,JSON.stringify({auth:{enabled:true,url:'https://candidate-fixture.supabase.co',publishableKey:'sb_publishable_CANDIDATE_SENTINEL'},sync:{enabled:true},registration:{enabled:true,contractVersion:1}}));
    await build();manifest=JSON.parse(await readFile(manifestPath));assert.equal(manifest.authConfigured,true);assert.equal(manifest.readyForRelease,false);
    assert((await readFile(join(mobile,'.build/candidate/www/account/account-runtime.js'),'utf8')).includes('sb_publishable_CANDIDATE_SENTINEL'));
    assert.equal(await readFile(join(mobile,'www/owner-sentinel'),'utf8'),'keep development assets');
    assert.deepEqual((await readdir(join(mobile,'.build'))).filter(name=>name.startsWith('candidate-stage-')),[]);
    await assert.rejects(readFile(join(mobile,'config.generated.json')),/ENOENT/);
  }finally{await rm(fixture,{recursive:true,force:true});}
});
