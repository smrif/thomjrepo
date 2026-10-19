-- App-owned schema captured from production on 2026-10-12.
-- Existing production already has these objects: baseline it, do not replay it.
-- Supabase supplies auth.users, auth.uid(), and the API roles.
begin;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid not null,
  current_parent_label text not null default 'Me',
  co_parent_label text not null default 'Co-parent',
  children jsonb not null default '[]'::jsonb,
  activities jsonb not null default '[]'::jsonb,
  theme_mode text not null default 'system',
  report_email text,
  terms_version text,
  terms_accepted_at timestamptz,
  privacy_version text,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_pkey primary key (user_id),
  constraint profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table public.custody_entries (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  entry_date date not null,
  entry_json jsonb not null,
  entry_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_created_at timestamptz,
  client_updated_at timestamptz,
  device_id text,
  constraint custody_entries_pkey primary key (id),
  constraint custody_entries_user_id_entry_date_key unique (user_id, entry_date),
  constraint custody_entries_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table public.sync_devices (
  user_id uuid not null,
  device_id text not null,
  last_sync_at timestamptz,
  client_schema_version integer,
  server_schema_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_devices_pkey primary key (user_id, device_id),
  constraint sync_devices_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create index custody_entries_user_date_idx on public.custody_entries (user_id, entry_date desc);
-- Kept to match production; redundant with the PK, but cleanup is a separate change.
create unique index sync_devices_user_device_key on public.sync_devices (user_id, device_id);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger custody_entries_set_updated_at before update on public.custody_entries
for each row execute function public.set_updated_at();
create trigger sync_devices_set_updated_at before update on public.sync_devices
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.custody_entries enable row level security;
alter table public.sync_devices enable row level security;

create policy "Users can manage their own profile" on public.profiles
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can manage their own custody entries" on public.custody_entries
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can manage their own sync devices" on public.sync_devices
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Preserve the observed pre-hardening grants here; the next migration narrows them.
grant all on public.profiles, public.custody_entries, public.sync_devices to authenticated;
grant truncate, references, trigger, maintain on public.profiles, public.custody_entries, public.sync_devices to service_role;

commit;
