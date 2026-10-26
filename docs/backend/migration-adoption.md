# Migration Adoption and Recovery Checklist

Prepared October 13, 2026. Production already contains the app baseline and
privilege hardening according to the October 12 catalog review. This preparation
does not establish that today's catalog is unchanged or register migration history.
See [database security](database-security.md) for prior evidence and the repair
command. Never replay the baseline into the existing production project.

## Files and intended final state

Apply these files in order only to a fresh approved Supabase environment:

1. `supabase/migrations/20261012000100_app_baseline.sql`: app tables, keys, indexes,
   timestamps, triggers and owner policies, with observed pre-hardening grants.
2. `supabase/migrations/20261012000200_limit_client_privileges.sql`: remove broad
   client grants and postgres-owned default client table privileges; restore
   authenticated SELECT/INSERT/UPDATE/DELETE.

Compare production against the combined final state, not the baseline's temporary
grants. Supabase provisions Auth, API roles and platform objects separately.

October 26 release preparation adds a **separate** migration,
`20261026000100_mobile_registration.sql`, for mobile registration/history. It is
not part of the already-deployed baseline comparison or history repair above.
Review its target and additive changes separately; never replay the baseline to
install it in an existing project. It was subsequently applied only to Whose Day
Mobile Test with passing catalog/API access checks; production is unchanged.
See [mobile registration](../product/mobile-registration.md)
and its read-only `supabase/checks/mobile-registration.sql` metadata check.

| Object | Expected app-owned contract |
| --- | --- |
| `profiles` | `user_id` primary key; labels, children/activities JSON, theme, report email, policy version/acceptance fields, created/updated timestamps. |
| `custody_entries` | UUID primary key; unique `(user_id, entry_date)`; entry JSON/version, created/updated/deleted timestamps, client timestamps and device ID. |
| `sync_devices` | Composite `(user_id, device_id)` primary key; last-sync/schema-version fields and timestamps; redundant unique index intentionally retained. |
| Account ownership | Each table's `user_id` references `auth.users(id)` with DELETE CASCADE. |
| RLS | Enabled on all three tables; one authenticated ALL policy each; both USING and WITH CHECK constrain `auth.uid()` to `user_id`. |
| Updated timestamps | One BEFORE UPDATE trigger per table calls invoker `public.set_updated_at()` with its configured search path. |
| Client privileges | Authenticated CRUD only; no anonymous/PUBLIC table access, authenticated administrative table grants or schema CREATE. |
| Future table defaults | No PUBLIC/anon/authenticated grants for postgres-owned new public tables; other owners audited separately. |

The SQL files are the exact authority for types, defaults, names and expressions;
this table is a comparison aid, not a replacement schema.

## Read-only production comparison

- [ ] Confirm the intended project identity and collect only schema/catalog
  metadata using `supabase/checks/security-audit.sql` and
  `supabase/checks/client-privileges.sql`. Avoid copying application records,
  connection strings, access tokens or credentials into evidence.
- [ ] Compare columns/types/nullability/defaults, primary/unique/foreign keys,
  indexes, functions/search paths, triggers, policies, RLS, grants and default ACLs.
  Normalize harmless catalog formatting differences; investigate semantic drift.
- [ ] Inspect existing migration history before any repair. A version already
  recorded must not be assumed to refer to equivalent SQL without review.
- [ ] Classify platform-owned objects separately. Do not drop platform event
  triggers or broaden managed-schema privileges to make a diff disappear.
- [ ] Record project ID, time, migration file hashes, reviewer, observed drift and
  comparison outcome. If there is drift, prepare a separate reconciliation change;
  do not hide it with IF NOT EXISTS or mark mismatched migrations applied.

## Adoption boundary

Only after equivalence is established, record the already-applied migration
versions using the repair procedure in `database-security.md`, then inspect the
resulting history. This is a remote metadata write requiring an explicitly
reviewed target/outcome; no repair or push is part of this document.

## Fresh-platform recovery rehearsal

- [ ] Choose an approved non-production Supabase project. Confirm that its project
  ID differs from production and that no real user records are present.
- [ ] Replay both migrations in order through the intended migration mechanism.
  Stop on any error; do not weaken privileges or silently skip failed statements.
- [ ] Run the catalog/grant checks above against the actual platform. The local
  PGlite suite already checks 165 SQL behaviors but simulates Auth/API roles.
- [ ] Complete the approved disposable-authenticated security QA runbook against
  staging; verify positive owner controls and symmetric cross-account denials.
  Stage-specific URLs/keys must be used without modifying production app config.
- [ ] Verify real Auth deletion cascades, a control account remains unchanged,
  and retained sessions cannot recreate rows or refresh after deletion.
- [ ] Exercise fresh sign-in/profile restoration, custody sync, conflicts and
  offline recovery on staging. Record client/server versions and results.
- [ ] Reconcile prior deletions before any recovered data is made available;
  see [provider retention](provider-retention.md). Schema replay alone is not a
  recovery of user data or proof of the backup-restore procedure.
- [ ] Confirm fixture cleanup separately and preserve only minimal test evidence.

Readiness status: local migration/RLS tests pass; current production comparison,
history adoption, fresh Supabase replay and real authenticated platform checks
remain pending. No live data, history, schema or provider settings were changed.
