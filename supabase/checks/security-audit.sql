-- Read-only catalog audit. Contains schema metadata, never application rows or keys.
with app_tables as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
         c.reloptions, c.relacl::text as acl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
)
select 'tables' as section, coalesce(jsonb_agg(to_jsonb(t) - 'oid' order by relname), '[]'::jsonb) as definition
from app_tables t
union all
select 'columns', coalesce(jsonb_agg(jsonb_build_object(
  'table', table_name, 'name', column_name, 'type', udt_name,
  'nullable', is_nullable, 'default', column_default, 'position', ordinal_position
) order by table_name, ordinal_position), '[]'::jsonb)
from information_schema.columns where table_schema = 'public'
union all
select 'constraints', coalesce(jsonb_agg(jsonb_build_object(
  'table', c.conrelid::regclass::text, 'name', c.conname, 'type', c.contype,
  'definition', pg_get_constraintdef(c.oid, true)
) order by c.conrelid::regclass::text, c.conname), '[]'::jsonb)
from pg_constraint c where c.conrelid in (select oid from app_tables)
union all
select 'indexes', coalesce(jsonb_agg(to_jsonb(i) order by tablename, indexname), '[]'::jsonb)
from pg_indexes i where schemaname = 'public'
union all
select 'policies', coalesce(jsonb_agg(to_jsonb(p) order by tablename, policyname), '[]'::jsonb)
from pg_policies p where schemaname = 'public'
union all
select 'grants', coalesce(jsonb_agg(to_jsonb(g) order by table_name, grantee, privilege_type), '[]'::jsonb)
from information_schema.table_privileges g
where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
union all
select 'column_grants', coalesce(jsonb_agg(jsonb_build_object(
  'table', a.attrelid::regclass::text, 'column', a.attname, 'acl', a.attacl::text
)), '[]'::jsonb)
from pg_attribute a where a.attrelid in (select oid from app_tables) and a.attacl is not null
union all
select 'functions', coalesce(jsonb_agg(jsonb_build_object(
  'name', p.proname, 'identity', pg_get_function_identity_arguments(p.oid),
  'security_definer', p.prosecdef, 'config', p.proconfig,
  'definition', pg_get_functiondef(p.oid), 'acl', p.proacl::text
) order by p.proname), '[]'::jsonb)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
union all
select 'triggers', coalesce(jsonb_agg(jsonb_build_object(
  'table', t.tgrelid::regclass::text, 'name', t.tgname,
  'definition', pg_get_triggerdef(t.oid, true)
) order by t.tgname), '[]'::jsonb)
from pg_trigger t where t.tgrelid in (select oid from app_tables) and not t.tgisinternal
union all
select 'default_privileges', coalesce(jsonb_agg(jsonb_build_object(
  'owner', r.rolname, 'schema', n.nspname, 'type', d.defaclobjtype, 'acl', d.defaclacl::text
)), '[]'::jsonb)
from pg_default_acl d join pg_roles r on r.oid = d.defaclrole
left join pg_namespace n on n.oid = d.defaclnamespace where n.nspname = 'public'
union all
select 'event_triggers', coalesce(jsonb_agg(jsonb_build_object(
  'name', evtname, 'event', evtevent, 'enabled', evtenabled,
  'function', evtfoid::regproc::text, 'tags', evttags
)), '[]'::jsonb) from pg_event_trigger;
