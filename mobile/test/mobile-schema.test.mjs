import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('mobile test bootstrap enforces owner RLS, least client privileges, version CAS and refuses existing schemas',async()=>{
 const db=new PGlite(),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to authenticated;`);
  const sql=await readFile(new URL('../../supabase/mobile-test/20261022_sync.sql',import.meta.url),'utf8');await db.exec(sql);
  const audit=(await db.query(await readFile(new URL('../../supabase/mobile-test/verify.sql',import.meta.url),'utf8'))).rows;assert.equal(audit.length,3);for(const row of audit)for(const [key,value] of Object.entries(row))if(key!=='table_name')assert.equal(value,true,key);
  for(const uid of [A,B])await db.query('insert into auth.users values ($1)',[uid]);
  await db.exec('set role authenticated');await db.query("select set_config('test.uid',$1,false)",[A]);
  await db.query("insert into profiles(user_id,current_parent_label)values($1,'A')",[A]);
  for(const table of ['profiles','custody_entries','sync_devices']){
   assert.equal((await db.query("select has_table_privilege('anon',$1,'SELECT') allowed",['public.'+table])).rows[0].allowed,false);
   for(const priv of ['TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query("select has_table_privilege('authenticated',$1,$2) allowed",['public.'+table,priv])).rows[0].allowed,false);
  }
  const first=(await db.query("insert into custody_entries(user_id,entry_date,entry_json)values($1,'2026-10-22','{}')returning updated_at::text version",[A])).rows[0].version;
  const updated=await db.query("update custody_entries set entry_json='{\"edit\":1}' where user_id=$1 and entry_date='2026-10-22' and updated_at=$2::timestamptz returning updated_at::text version",[A,first]);assert.equal(updated.rows.length,1);assert.notEqual(updated.rows[0].version,first);
  assert.equal((await db.query("update custody_entries set entry_json='{\"edit\":2}' where user_id=$1 and updated_at=$2::timestamptz returning user_id",[A,first])).rows.length,0);
  await db.query("select set_config('test.uid',$1,false)",[B]);
  assert.deepEqual((await db.query('select * from profiles')).rows,[]);assert.deepEqual((await db.query('select * from custody_entries')).rows,[]);
  assert.equal((await db.query('update custody_entries set entry_json=\'{}\' where user_id=$1 returning user_id',[A])).rows.length,0);
  await assert.rejects(db.query("insert into profiles(user_id)values($1)",[A]),e=>e.code==='42501');
  await assert.rejects(db.query("insert into custody_entries(user_id,entry_date,entry_json)values($1,'2026-10-21','{}')",[A]),e=>e.code==='42501');
  await db.exec('reset role');await assert.rejects(db.exec(sql),/already exist/);await db.exec('rollback');assert.equal((await db.query('select count(*)::int n from custody_entries')).rows[0].n,1);
 }finally{await db.close()}
});
