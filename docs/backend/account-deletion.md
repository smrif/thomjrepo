# Account Deletion

## Deployment Status

Deployed October 12, 2026 to `https://thomjrepo.ryan-rifkin.workers.dev`, Worker
version `d00957f8-f6ae-4cc1-88bf-901e6e4d613e`. The owner entered the server key
directly in Cloudflare; its encrypted binding was verified without reading it.
Local contract, API, auth-routing, deletion, responsive deletion UI, and app smoke
tests pass. Production serves the new assets and rejects missing/invalid tokens
(401), foreign origins (403), and GET (405). On October 12, 2026, the owner
deleted a disposable production account after its profile, one custody log, and
one device row were verified. Independent read-only counts by the recorded user
ID then confirmed zero Auth users, profiles, custody entries (including deleted
rows), and sync devices. Cross-account control and second-device QA remain open.
The logged-out home/confirmation follow-up was deployed the same day as Worker
version `d3fbb88b-4715-4a24-9841-1dd6c41168a1` (`account-deletion-2` assets).

## Implementation

The hosted app calls same-origin `DELETE /api/account` with its signed-in user's
bearer token and `{"confirmation":"DELETE"}`. The Worker verifies that token using
Supabase `auth.getUser(token)` and deletes only the returned user ID using
`auth.admin.deleteUser(id, false)`. It never trusts an ID supplied by the client.
The secret is used only inside the Worker, not bundled into static assets.

The existing foreign keys for `public.profiles`, `public.custody_entries`, and
`public.sync_devices` reference `auth.users(id) ON DELETE CASCADE`. Verified live
on October 12, 2026 with `supabase/checks/account-deletion.sql`. The Auth deletion
therefore removes those active rows in the same database transaction. No migration
is needed. Recheck this contract whenever adding another account-owned table.

The client waits for a running sync and prevents new syncs during deletion. A
failed server request leaves the session and local records intact. Success signs
out this device and returns to the logged-out home with a dismissible, focused
confirmation. A local deletion marker keeps reloads on the logged-out home and
blocks sync until setup/restoration saves a profile again. Local profile, logs,
and exports remain. Clearing browser data is
a separate local action. A lost network response can leave the outcome uncertain:
inspect Auth and table counts before claiming success or retrying manually.

## Activation

1. In Cloudflare, open the `thomjrepo` Worker, Settings, Variables and Secrets.
2. Add a **Secret** named `SUPABASE_SECRET_KEY`. Paste a server-side Supabase
   secret key (or legacy `service_role` key) from this project's API Keys settings.
   The account owner should enter and save it directly. Do not paste it into chat,
   use a plaintext variable, add it to `supabase-config.js`, or commit it.
3. `wrangler.jsonc` already sets the non-secret project URL and
   `ACCOUNT_DELETION_ENABLED=true`. Missing secrets or a disabled flag return 503.
   This feature does not enable any of the other reserved Worker API routes.
4. Build with `pnpm build`, deploy with `pnpm exec wrangler deploy` if Wrangler is
   installed, or `pnpm dlx wrangler deploy`. Use the HTTPS app, not `file://`.

For local Worker testing, put credentials only in ignored `.dev.vars`, build the
static assets, then run `wrangler dev`. Never use real accounts for destructive
tests. The automated tests mock Supabase and do not delete real users.

## Disposable-Account QA

- Sign in with a separate test email and sync a profile, log, and device row.
- Check its Auth user ID and rows; record a different account's row counts as a
  control. Never use the owner's account for this test.
- In Settings, verify the button stays disabled until DELETE is typed. Verify the
  warning explains permanent account deletion and retained local records.
- Delete the test account, then verify it is absent from Authentication > Users
  and all three app tables have zero rows for that ID. The control account's data
  must be unchanged.
- Verify this device is signed out and its local records remain. Test a second
  signed-in device: it must not restore or write records for the deleted ID.
- Verify the logged-out home and deletion confirmation appear on success; dismiss
  the confirmation and reload. The logged-out home must remain, local records
  must remain, and setup/restoration must release the local deletion marker.
- Try an expired token and verify no deletion occurs. With the feature disabled
  or secret missing, verify a helpful failure and preserved local/session state.

Deleting an Auth user removes its refresh sessions. Existing access JWTs may
remain cryptographically valid until expiry, but no rows for the deleted ID
remain, and the cascading foreign keys reject new app rows for that ID. Verify
RLS separately for cross-account isolation. Signing up again creates a new ID;
retained local records may sync to that new account.

## Operational Limits

- The server key is privileged. Restrict its use to the Worker and rotate it if
  exposed. No access tokens, upstream error bodies, or secrets are logged here.
- The current app has no Supabase Storage uploads. If Storage objects are added,
  add and test their cleanup before deletion; owned objects can block Auth deletion.
- Active-record deletion is not a promise to erase copies from provider backups,
  operational logs, downloaded reports, or recipients of shared exports. Published
  limits and a proposed support/restore procedure are documented in
  [provider retention](provider-retention.md). Actual plan/settings verification
  and owner/legal approval remain required before beta.

References: [Supabase deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[Auth user data](https://supabase.com/docs/guides/auth/managing-user-data),
[Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
