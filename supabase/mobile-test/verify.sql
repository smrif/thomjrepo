-- Read-only metadata verification. Run only in Whose Day Mobile Test.
select c.relname as table_name,
       c.relrowsecurity as rls,
       (select count(*)=1 and bool_and(p.polroles=array[(select oid from pg_roles where rolname='authenticated')])
          and bool_and(pg_get_expr(p.polqual,p.polrelid) like '%auth.uid()%')
          and bool_and(pg_get_expr(p.polwithcheck,p.polrelid) like '%auth.uid()%')
          from pg_policy p where p.polrelid=c.oid) as owner_only,
       (has_table_privilege('authenticated',c.oid,'SELECT') and has_table_privilege('authenticated',c.oid,'INSERT')
        and has_table_privilege('authenticated',c.oid,'UPDATE') and has_table_privilege('authenticated',c.oid,'DELETE')) as crud,
       not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_blocked,
       not has_table_privilege('authenticated',c.oid,'TRUNCATE,REFERENCES,TRIGGER') as ddl_blocked,
       (select count(*)=1 from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as timestamps
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','custody_entries','sync_devices')
order by c.relname;
