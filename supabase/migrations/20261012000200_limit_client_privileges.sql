-- Narrow client privileges without changing rows, schema, or owner-only policies.
begin;

revoke all privileges on table public.profiles, public.custody_entries, public.sync_devices
from public, anon, authenticated;
grant select, insert, update, delete on table public.profiles, public.custody_entries, public.sync_devices
to authenticated;

-- Future postgres-owned tables must opt into client access explicitly.
-- Supabase-managed owners/defaults are outside this app migration's scope.
alter default privileges for role postgres in schema public
revoke all privileges on tables from public, anon, authenticated;

commit;
