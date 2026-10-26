-- Read-only metadata after the additive registration migration. No user rows.
select
  t.relrowsecurity as history_rls,
  has_table_privilege('authenticated',t.oid,'SELECT') as owner_history_read,
  not has_table_privilege('authenticated',t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as no_client_history_mutation,
  not has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as no_anonymous_history_access,
  p.prosecdef as registration_definer,
  p.proconfig = array['search_path=""']::text[] as fixed_empty_search_path,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_registration,
  not has_function_privilege('anon',p.oid,'EXECUTE') as no_anonymous_registration,
  (select count(*)=1 from pg_policies where schemaname='public'
    and tablename='mobile_policy_acceptances' and cmd='SELECT'
    and roles=array['authenticated']::name[] and qual like '%auth.uid()%user_id%') as owner_read_policy,
  (select count(*)=1 from pg_constraint where conrelid=t.oid
    and contype='f' and confrelid='auth.users'::regclass and confdeltype='c') as auth_delete_cascade
from pg_class t join pg_namespace n on n.oid=t.relnamespace
cross join pg_proc p join pg_namespace f on f.oid=p.pronamespace
where n.nspname='public' and t.relname='mobile_policy_acceptances'
  and f.nspname='public' and p.proname='complete_mobile_registration'
  and pg_get_function_identity_arguments(p.oid)='p_attempt uuid, p_email text, p_profile jsonb, p_terms_version text, p_privacy_version text, p_accepted_at timestamp with time zone';
