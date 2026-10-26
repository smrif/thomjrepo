-- Additive release preparation. Not applied to any hosted project by this file.
-- Existing profile acceptance fields remain legacy mutable snapshots; never
-- backfill this history from those fields or require returning users to re-agree.
begin;

create table public.mobile_policy_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt uuid not null,
  verified_email text not null,
  profile jsonb not null,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  source text not null default 'mobile' check (source = 'mobile'),
  primary key (user_id, attempt)
);
alter table public.mobile_policy_acceptances enable row level security;
create policy "Read own mobile acceptance history"
on public.mobile_policy_acceptances for select to authenticated
using ((select auth.uid()) = user_id);
revoke all on public.mobile_policy_acceptances from public, anon, authenticated;
grant select on public.mobile_policy_acceptances to authenticated;

create function public.complete_mobile_registration(
  p_attempt uuid, p_email text, p_profile jsonb,
  p_terms_version text, p_privacy_version text, p_accepted_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  verified_email text;
  current_profile public.profiles%rowtype;
  receipt public.mobile_policy_acceptances%rowtype;
begin
  -- Serialize registration with other registration attempts and Auth deletion.
  -- Identity and verified email come from Auth, never a caller-supplied user ID.
  -- NO KEY UPDATE still serializes calls/deletion while allowing the website's
  -- profile foreign-key KEY SHARE check (avoids an inverse FK/unique lock order).
  select lower(u.email) into verified_email from auth.users u
    where u.id = caller and u.email_confirmed_at is not null for no key update;
  if verified_email is null or p_email is distinct from verified_email then
    raise exception 'Verified account does not match setup' using errcode = '22023';
  end if;

  select * into receipt from public.mobile_policy_acceptances
    where user_id = caller and attempt = p_attempt;
  if found then
    if receipt.profile is distinct from p_profile
       or receipt.terms_version is distinct from p_terms_version
       or receipt.privacy_version is distinct from p_privacy_version
       or receipt.accepted_at is distinct from p_accepted_at
       or receipt.verified_email is distinct from p_email then
      raise exception 'Registration attempt changed' using errcode = '22023';
    end if;
    select * into current_profile from public.profiles where user_id = caller;
    if not found then
      raise exception 'Registered profile is missing' using errcode = '22023';
    end if;
    return jsonb_build_object('status','completed','profile',to_jsonb(current_profile),'receipt',to_jsonb(receipt));
  end if;

  -- Another device or the website may have completed setup while the link was
  -- open. Restore that profile without overwriting it or inventing an agreement.
  select * into current_profile from public.profiles where user_id = caller;
  if found then
    return jsonb_build_object('status','existing','profile',to_jsonb(current_profile),'receipt',null);
  end if;

  if p_attempt is null or p_accepted_at is null
     or p_accepted_at < now() - interval '24 hours'
     or p_accepted_at > now() + interval '5 minutes'
     or p_terms_version is distinct from '2026-10-21-v2'
     or p_privacy_version is distinct from '2026-10-21-v2'
     or jsonb_typeof(p_profile) is distinct from 'object'
     or not (p_profile ?& array['current_parent_label','co_parent_label','children','activities','theme_mode'])
     or (p_profile - array['current_parent_label','co_parent_label','children','activities','theme_mode']) <> '{}'::jsonb
     or jsonb_typeof(p_profile->'current_parent_label') is distinct from 'string'
     or jsonb_typeof(p_profile->'co_parent_label') is distinct from 'string'
     or length(btrim(p_profile->>'current_parent_label')) not between 1 and 100
     or length(btrim(p_profile->>'co_parent_label')) not between 1 and 100
     or jsonb_typeof(p_profile->'children') is distinct from 'array'
     or jsonb_typeof(p_profile->'activities') is distinct from 'array'
     or p_profile->>'theme_mode' not in ('system','light','dark')
     or jsonb_typeof(p_profile->'theme_mode') is distinct from 'string' then
    raise exception 'Review setup and current policies' using errcode = '22023';
  end if;
  if jsonb_array_length(p_profile->'children') not between 1 and 20
     or jsonb_array_length(p_profile->'activities') not between 1 and 30
     or exists (select 1 from jsonb_array_elements((p_profile->'children') || (p_profile->'activities')) v
       where jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) not between 1 and 100)
     or (select count(distinct btrim(v #>> '{}')) from jsonb_array_elements(p_profile->'children') v) <> jsonb_array_length(p_profile->'children')
     or (select count(distinct v) from jsonb_array_elements(p_profile->'activities') v) <> jsonb_array_length(p_profile->'activities') then
    raise exception 'Invalid family profile' using errcode = '22023';
  end if;

  insert into public.profiles(user_id,current_parent_label,co_parent_label,children,activities,theme_mode,
    report_email,terms_version,terms_accepted_at,privacy_version,privacy_accepted_at)
  values(caller,btrim(p_profile->>'current_parent_label'),btrim(p_profile->>'co_parent_label'),
    p_profile->'children',p_profile->'activities',p_profile->>'theme_mode',verified_email,
    p_terms_version,p_accepted_at,p_privacy_version,p_accepted_at)
  on conflict (user_id) do nothing returning * into current_profile;
  if not found then
    select * into current_profile from public.profiles where user_id = caller;
    return jsonb_build_object('status','existing','profile',to_jsonb(current_profile),'receipt',null);
  end if;
  insert into public.mobile_policy_acceptances(user_id,attempt,verified_email,profile,terms_version,privacy_version,accepted_at)
  values(caller,p_attempt,verified_email,p_profile,p_terms_version,p_privacy_version,p_accepted_at)
  returning * into receipt;
  return jsonb_build_object('status','completed','profile',to_jsonb(current_profile),'receipt',to_jsonb(receipt));
end;
$$;
revoke all on function public.complete_mobile_registration(uuid,text,jsonb,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.complete_mobile_registration(uuid,text,jsonb,text,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
