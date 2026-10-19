-- Read-only preflight: expect three foreign keys, each ending in ON DELETE CASCADE.
select c.conrelid::regclass::text as table_name,
       c.conname,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass
  and c.conrelid in (
    'public.profiles'::regclass,
    'public.custody_entries'::regclass,
    'public.sync_devices'::regclass
  )
order by table_name, c.conname;
