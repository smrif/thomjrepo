-- Read-only production check. No data values, passwords, or JWTs are exported.
-- Run as postgres in Supabase SQL Editor. The batch must stop on the first error.
-- Uses one existing owner as a positive control and the deleted test subject as a negative control.
begin read only;

do $$
declare
  owner_id uuid;
begin
  select p.user_id into owner_id from public.profiles p
  join auth.users u on u.id = p.user_id order by p.user_id limit 1;
  if owner_id is null then raise exception 'Need an existing profile for the positive control'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('whose_day.expected_profiles', (select count(*)::text from public.profiles where user_id = owner_id), true);
  perform set_config('whose_day.expected_entries', (select count(*)::text from public.custody_entries where user_id = owner_id), true);
  perform set_config('whose_day.expected_devices', (select count(*)::text from public.sync_devices where user_id = owner_id), true);
end;
$$;

set local role authenticated;
do $$
begin
  if current_user <> 'authenticated' or auth.uid() is null then raise exception 'Not testing the API role'; end if;
  if (select count(*) from public.profiles) <> current_setting('whose_day.expected_profiles')::bigint
     or (select count(*) from public.custody_entries) <> current_setting('whose_day.expected_entries')::bigint
     or (select count(*) from public.sync_devices) <> current_setting('whose_day.expected_devices')::bigint then
    raise exception 'Owner read counts differ';
  end if;
  if exists(select 1 from public.profiles where user_id <> auth.uid())
     or exists(select 1 from public.custody_entries where user_id <> auth.uid())
     or exists(select 1 from public.sync_devices where user_id <> auth.uid()) then
    raise exception 'Cross-account row became visible';
  end if;
end;
$$;

reset role;
do $$
begin
  if exists(select 1 from auth.users where id = 'b9ce0052-ab89-46f7-b9cf-d08d92c39fbc') then
    raise exception 'Deleted-test subject exists again; choose a verified absent subject';
  end if;
  perform set_config('request.jwt.claims', '{"sub":"b9ce0052-ab89-46f7-b9cf-d08d92c39fbc","role":"authenticated"}', true);
end;
$$;
set local role authenticated;
do $$
begin
  if auth.uid() <> 'b9ce0052-ab89-46f7-b9cf-d08d92c39fbc'::uuid then raise exception 'Wrong negative-control subject'; end if;
  if exists(select 1 from public.profiles) or exists(select 1 from public.custody_entries) or exists(select 1 from public.sync_devices) then
    raise exception 'Absent subject can read account data';
  end if;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  if auth.uid() is not null then raise exception 'Missing-subject control did not clear the subject'; end if;
  if exists(select 1 from public.profiles) or exists(select 1 from public.custody_entries) or exists(select 1 from public.sync_devices) then
    raise exception 'Missing subject can read account data';
  end if;
end;
$$;

set local role anon;
do $$
declare table_name text;
begin
  if current_user <> 'anon' then raise exception 'Not testing the anonymous API role'; end if;
  foreach table_name in array array['profiles', 'custody_entries', 'sync_devices'] loop
    begin
      execute format('select 1 from public.%I limit 1', table_name);
      raise exception 'Anonymous SELECT unexpectedly succeeded on %', table_name;
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

reset role;
rollback;
select 'PASS' as result, 'Owner reads, foreign/deleted subject isolation, missing subject, and anonymous SELECT denial' as checked;
