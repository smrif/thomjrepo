import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// In-memory PostgreSQL only. No network, real users, or production credentials.
const db = new PGlite();
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const C = '10000000-0000-4000-8000-000000000003';
const tables = [
  { name: 'profiles', columns: 'user_id,current_parent_label', values: "$1,'Synthetic parent'", conflict: 'user_id', update: "current_parent_label='Updated'" },
  { name: 'custody_entries', columns: 'user_id,entry_date,entry_json', values: "$1,'2026-10-12','{\"test\":true}'::jsonb", conflict: 'user_id,entry_date', update: "entry_json='{\"updated\":true}'::jsonb" },
  { name: 'sync_devices', columns: 'user_id,device_id', values: "$1,'synthetic-device'", conflict: 'user_id,device_id', update: 'last_sync_at=now()' }
];
let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
async function denied(sql, params = [], code = '42501') {
  await assert.rejects(db.query(sql, params), error => error.code === code, `Expected ${code}: ${sql}`);
  checks++;
}
async function asUser(role, id = null) {
  assert(['postgres', 'authenticated', 'anon'].includes(role));
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, ...(id ? { sub: id } : {}) })]);
  const { rows } = await db.query('select current_user as role,auth.uid() as uid');
  equal(rows[0], { role, uid: id }, 'Tests must run as the API role, not the table owner');
}
async function insertOwn(table, id) {
  return db.query(`insert into public.${table.name} (${table.columns}) values (${table.values}) returning user_id`, [id]);
}

try {
  // Supabase owns its Auth schema; emulate only the contract used by app policies.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'
      )::uuid;
    $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    revoke create on schema public from public;
    alter default privileges for role postgres in schema public
      grant truncate,references,trigger,maintain on tables to anon,authenticated,service_role;
  `);
  const baseline = await readFile(new URL('../supabase/migrations/20261012000100_app_baseline.sql', import.meta.url), 'utf8');
  const hardening = await readFile(new URL('../supabase/migrations/20261012000200_limit_client_privileges.sql', import.meta.url), 'utf8');
  await db.exec(baseline);
  equal((await db.query("select has_table_privilege('authenticated','public.profiles','TRUNCATE') as allowed")).rows[0].allowed, true, 'Reproduce the observed broad grants before hardening');
  await db.exec(hardening);
  await db.exec(hardening); // Applying the narrow-grant migration again is harmless.
  for (const id of [A, B, C]) await db.query('insert into auth.users values ($1)', [id]);

  const audit = await db.query(await readFile(new URL('../supabase/checks/security-audit.sql', import.meta.url), 'utf8'));
  const metadata = Object.fromEntries(audit.rows.map(row => [row.section, row.definition]));
  equal(metadata.tables.map(table => table.relname), ['custody_entries', 'profiles', 'sync_devices']);
  equal(metadata.tables.every(table => table.relrowsecurity), true);
  equal(metadata.columns.length, 31);
  equal(metadata.constraints.filter(constraint => constraint.type !== 'n').length, 7);
  equal(metadata.triggers.length, 3);
  equal(metadata.policies.length, 3);
  equal(metadata.column_grants, []);

  for (const table of tables) {
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) {
        const { rows } = await db.query('select has_table_privilege($1,$2,$3) as allowed', [role, `public.${table.name}`, privilege]);
        equal(rows[0].allowed, role === 'authenticated' && ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(privilege), `${role} ${privilege} on ${table.name}`);
      }
    }
    // Positive control for both owners, including the app's actual upsert path.
    for (const id of [A, B]) {
      await asUser('authenticated', id);
      equal((await insertOwn(table, id)).rows.length, 1);
      equal((await db.query(`insert into public.${table.name} (${table.columns}) values (${table.values}) on conflict (${table.conflict}) do update set ${table.update} returning user_id`, [id])).rows.length, 1);
      equal((await db.query(`select user_id from public.${table.name}`)).rows, [{ user_id: id }], 'Unfiltered SELECT returns only the owner');
    }
    await asUser('authenticated', A);
    equal((await db.query(`select * from public.${table.name} where user_id=$1`, [B])).rows, []);
    equal((await db.query(`update public.${table.name} set ${table.update} where user_id=$1 returning user_id`, [B])).rows, []);
    equal((await db.query(`delete from public.${table.name} where user_id=$1 returning user_id`, [B])).rows, []);
    await denied(`insert into public.${table.name} (${table.columns}) values (${table.values})`, [B]);
    await denied(`insert into public.${table.name} (${table.columns}) values (${table.values}) on conflict (${table.conflict}) do update set ${table.update}`, [B]);
    await denied(`update public.${table.name} set user_id=$1 where user_id=$2`, [C, A]);
    equal((await db.query(`update public.${table.name} set updated_at='2000-01-01' where user_id=$1 returning updated_at > '2000-01-01' as stamped`, [A])).rows[0].stamped, true, 'Timestamp trigger still works');
    equal((await db.query(`delete from public.${table.name} where user_id=$1 returning user_id`, [A])).rows.length, 1, 'Owner DELETE still works');
    await insertOwn(table, A);
    await denied(`truncate public.${table.name}`);

    await asUser('authenticated'); // Missing subject must not grant access.
    equal((await db.query(`select * from public.${table.name}`)).rows, []);
    await denied(`insert into public.${table.name} (${table.columns}) values (${table.values})`, [A]);
    await asUser('anon');
    await denied(`select * from public.${table.name}`);
    await denied(`insert into public.${table.name} (${table.columns}) values (${table.values})`, [A]);
    await denied(`update public.${table.name} set ${table.update}`);
    await denied(`delete from public.${table.name}`);
    await denied(`truncate public.${table.name}`);
    await asUser('postgres');
  }

  // Confirm future app tables do not inherit the obsolete broad client grants.
  await db.exec('create table public.security_test_new_table (id integer);');
  for (const role of ['anon', 'authenticated']) {
    equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', [role, 'public.security_test_new_table', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'])).rows[0].allowed, false);
  }
  await db.exec('drop table public.security_test_new_table;');
  equal((await db.query(await readFile(new URL('../supabase/checks/client-privileges.sql', import.meta.url), 'utf8'))).rows.every(row => row.rls_enabled && row.policy_count === 1 && !row.anon_any_access && row.signed_in_crud && !row.signed_in_admin_access && !row.signed_in_schema_create), true);
  await db.exec(await readFile(new URL('../supabase/checks/live-read-isolation.sql', import.meta.url), 'utf8'));
  checks++;

  const controlBefore = {};
  for (const table of tables) controlBefore[table.name] = (await db.query(`select * from public.${table.name} where user_id=$1`, [B])).rows;
  // Simulate Auth's hard deletion locally; no production account is touched.
  await db.query('delete from auth.users where id=$1', [A]);
  for (const table of tables) {
    equal((await db.query(`select * from public.${table.name} where user_id=$1`, [A])).rows, [], 'Cascade removes every owned row');
    equal((await db.query(`select * from public.${table.name} where user_id=$1`, [B])).rows, controlBefore[table.name], 'The other account must remain unchanged');
    await asUser('authenticated', A); // Stale JWT subject, after account deletion.
    equal((await db.query(`select * from public.${table.name}`)).rows, []);
    await denied(`insert into public.${table.name} (${table.columns}) values (${table.values})`, [A], '23503');
    equal((await db.query(`update public.${table.name} set ${table.update} where user_id=$1 returning user_id`, [B])).rows, []);
    await asUser('postgres');
  }
  console.log(`Database security passed (${checks} checks: migration replay, role grants, owner CRUD/upserts, cross-account denial, anonymous denial, cascades, stale subjects, future defaults).`);
} finally {
  await db.close();
}
