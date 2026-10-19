-- Read-only summary. Expected: RLS true, signed-in CRUD true, other checks false.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as anon_any_access,
       (has_table_privilege('authenticated', c.oid, 'SELECT')
        and has_table_privilege('authenticated', c.oid, 'INSERT')
        and has_table_privilege('authenticated', c.oid, 'UPDATE')
        and has_table_privilege('authenticated', c.oid, 'DELETE')) as signed_in_crud,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as signed_in_admin_access,
       has_schema_privilege('authenticated', 'public', 'CREATE') as signed_in_schema_create
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles', 'custody_entries', 'sync_devices')
order by c.relname;
