# Database Security Review

## Verified October 12, 2026

Project: `hdfuknggfkmaycnantxv`. Review used catalog metadata and aggregate/read-only
role checks. No application row contents, credentials, or real JWTs were exported.

- The only public tables are `profiles`, `custody_entries`, and `sync_devices`.
- Each has RLS enabled and one authenticated owner-only policy for ALL commands.
  Both USING and WITH CHECK require `(select auth.uid()) = user_id`.
- Each user foreign key references `auth.users(id) ON DELETE CASCADE`.
- No public views or ordinary data-returning SECURITY DEFINER RPCs were found.
  `set_updated_at` is an invoker trigger. `rls_auto_enable` is a platform-installed
  event-trigger function, not an ordinary data-reading RPC. The platform event
  trigger remains untouched; app migrations explicitly enable RLS themselves.
- Signed-in clients cannot CREATE objects in the public schema.

## Finding and Live Fix

Authenticated had ALL table privileges, including TRUNCATE, REFERENCES, TRIGGER,
and MAINTAIN. Anonymous had no current table grants, but postgres default table
privileges still gave anonymous and authenticated the extra administrative grants.
TRUNCATE and REFERENCES are not filtered by row security. No directly callable
data RPC exposing those operations was observed; this was unnecessary privilege,
not evidence that records had been exposed or lost.

Applied `20261012000200_limit_client_privileges.sql` through SQL Editor:

- Revoked all current table grants from PUBLIC, anon, and authenticated.
- Restored only SELECT, INSERT, UPDATE, DELETE to authenticated. Existing owner-only
  policies still apply; sync/upsert and own-row operations remain supported.
- Revoked future postgres-owned public-table defaults from PUBLIC, anon, and
  authenticated. New app tables must explicitly opt into client access.
- Did not change rows, columns, constraints, indexes, policies, or server-role grants.
  Supabase-managed owners such as `supabase_admin` have separate defaults and are
  outside this app change. Audit every new exposed table regardless of its owner.

Live checks afterward confirmed RLS=true, one policy/table, signed-in CRUD=true,
anonymous access=false, administrative client privileges=false, schema CREATE=false.
A before/after catalog comparison also confirmed unchanged tables, columns,
constraints, indexes, policies, functions, table triggers, and platform event triggers.

## Evidence and Scope

- Production `live-read-isolation.sql` passed using the actual authenticated and
  anon database roles. A real existing owner was the positive control. Unfiltered
  owner reads matched owner-filtered admin counts; no other owner was visible.
- The previously deleted test subject and a missing subject saw zero rows in all
  three tables. Anonymous SELECT raised insufficient privilege on every table.
- GET-only Data API checks using the public publishable key returned HTTP 401 with
  SQLSTATE 42501 for all three tables. `limit=0` prevented returning records even
  if a grant had unexpectedly allowed a request.
- Local tests replay both migrations in an in-memory PostgreSQL engine (PGlite)
  and pass 165 checks: grants, owner CRUD/upserts, cross-owner reads/writes/upserts,
  ownership transfer denial, anonymous denial, timestamp triggers, cascade cleanup,
  unchanged control-account rows, stale-subject writes rejected by foreign keys,
  and safe future defaults. Supabase's minimal Auth table/UID helper is simulated;
  its real JWT verifier, GoTrue, PostgREST, and platform configuration are not.
- Real account deletion was separately verified by the owner earlier this day.
  No real users were created, updated, or deleted by this review.

Still required before beta: two real authenticated browser sessions, attempts at
cross-account API reads/writes, a second device retaining an actual old session
after deletion, offline recovery, and both conflict-resolution choices. SQL role
simulation is not proof of end-to-end token refresh/revocation or multi-device UX.

October 13 follow-up: reran the 165 local checks, account-deletion regressions,
and live GET-only anonymous probes successfully. A local-only two-session QA tool
now prepares fixture-scoped authenticated checks and retained-token deletion
checks; see [the runbook](authenticated-security-qa.md). Its own tests use mocks.
Real authenticated execution is still pending approved disposable test identities
and owner-completed email sign-ins. No live account was created or deleted.

## Repeatable Checks

```sh
node scripts/database-security-test.mjs
node scripts/live-anonymous-security-check.mjs --live
```

The first is local-only and needs no secrets or Docker. The second explicitly
contacts the configured Supabase project, performs only GETs, and accepts only a
public publishable key. Neither is bundled into the application.

SQL Editor checks:

- `supabase/checks/security-audit.sql`: full schema/policy/grant/trigger metadata.
- `supabase/checks/client-privileges.sql`: compact effective access summary.
- `supabase/checks/live-read-isolation.sql`: transactional, read-only role assertions.
  Run as postgres, with batch execution stopping on the first error. It requires
  an existing profile and checks that the recorded deleted subject is still absent.

## Baseline Adoption

An explicit comparison/adoption/recovery checklist is prepared in
[migration adoption](migration-adoption.md). Preparation is complete; a current
live comparison and approved fresh-platform execution remain pending.

`20261012000100_app_baseline.sql` captures app-owned tables, defaults, keys, indexes,
triggers, policies, and pre-hardening grants. It deliberately preserves the redundant
sync-device index; removing it is not part of this security change. Supabase-managed
schemas, roles, default ACLs, and platform event triggers are provisioned by Supabase,
not recreated by this app baseline. The hardening migration narrows the grants.

Do not paste the baseline into this existing project: its objects already exist.
Do not use CREATE IF NOT EXISTS to hide schema drift or run `db push` blindly.
The SQL Editor application of the hardening migration does not register CLI migration
history. No history entries were created during this review.

Before adopting the Supabase CLI, initialize/link it to the intended project,
compare the live catalog with these files, and inspect migration history. Only
after confirming equivalence, mark these already-applied versions as applied:

```sh
supabase migration repair 20261012000100 20261012000200 --status applied
```

This records history rather than executing the baseline. Check `migration list`
afterward. A fresh Supabase environment should replay both files in order, then
run the checks against its actual platform. Local PGlite tests are useful but do
not replace that fresh-environment integration check. Future schema changes should
be new migrations with explicit grants/RLS tests, not ad hoc dashboard changes.

Sources: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[PGlite](https://pglite.dev/docs/),
[Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).
