# Mobile test sync — October 22, 2026

The account entry now implements profile restoration and custody sync through a
separate test-only adapter. It remains a synthetic-data feasibility build.
Production accounts, provider settings and website assets are unchanged.

## Behavior

Check-ins save and read back on the device before the product shows Saved.
Sync is a separate status in Today and Account. Offline or failed uploads keep
the durable local edit. Foreground, reconnect, local save and a bounded retry
trigger sync; there is no continuous background-sync promise.

A returning account restores its validated cloud profile before onboarding when
no local profile exists. An unreachable backend cannot silently replace a cloud
profile with a new one. Previously saved local profiles can still open offline.
Cloud family changes are cached, with an explicit Apply updated profile action
when no check-in draft is open. Policy acceptance and report-email columns are
never written or fabricated by this adapter.

Record/profile envelopes use schema 2, retaining the schema 1 keys/owner checks.
The current value, SHA-256 hash of its last agreed cloud value, and server version
share one verified SQLite row. Hashes avoid duplicating attachment bytes in the
checkpoint. They are comparison metadata, not encryption. Schema 1 rows upgrade
on their next verified write; older prototype builds cannot read schema 2 and
will fail closed on those rows, so downgrade recovery is not established; an unknown divergent cloud copy requires review.
A lost acknowledgement remains retryable after restart. A late acknowledgement
cannot replace a newer local edit. An unverified local write blocks sync until a
successful retry or reopen establishes the durable state.

Three-way reconciliation follows the website rule: upload a device-only change,
download a cloud-only change, and hold two different edits for owner review.
Review shows the readable notes, family/child details and attachment for each
copy. Keep this device and Use cloud copy are explicit actions. A changed cloud
version during review forces a new choice. Server writes use owner/date/version
compare-and-set or insert, with duplicate insertion treated as a race; no upsert
can blindly replace another device's edit.

Downloads pause while a check-in is open. A download that was already in flight
cannot let an older draft overwrite the changed date. Both copies stay intact
when a cloud deletion meets a retained local check-in; applying cloud deletion is
not implemented. The owner can review the removal on the website or explicitly
restore the device copy. Tombstones for dates never saved locally are ignored.

The adapter uses the existing Keychain-backed auth client. Every operation checks
its expected account and session generation. Closing an account closes its sync
managers/stores immediately; late results cannot publish into another account.
Cloud responses are validated for owner/date/schema, and history uses stable
250-row cursor pages, capped at 20,000 dates. Large-history/device performance
still needs separate measurement.

## Browser smoke test

Build and serve only `mobile/www` on loopback, then open:

- Device one: `http://127.0.0.1:4179/account/index.html?sync=preview&device=one`
- Device two: `http://127.0.0.1:4179/account/index.html?sync=preview&device=two`

This is explicitly a mock cloud stored in the same browser's IndexedDB. It never
sends email, connects to Supabase, or uses native credentials. Each device has
its own local profile/records/session choice, and both use a shared transactional
mock cloud. The original account preview URL stays local-only and retains its
existing sample data.

1. Choose sample account A on device one, create a sample profile, and save a
   check-in. Account → Sync now should finish with Up to date.
2. Choose A on device two. Its family and saved date should restore.
3. In each account panel, choose Go offline on this device. Edit the same date
   differently on both. Close/reopen one tab to check pending-edit recovery.
4. Reconnect one, then the other. Review both copies and try either choice.
5. Sign out and choose B to check that A's family, notes and conflicts stay hidden.

## Test backend setup

Native sync is opt-in with `"sync":{"enabled":true}` in ignored
`mobile/config.local.json`. Auth must also be enabled with a validated separate
Supabase project/publishable key. Production project `hdfuknggfkmaycnantxv` is
explicitly rejected. Default builds and existing local-only previews stay offline.

Read-only preflight against the owner-created project `ijewfmltnlqpydwuiedb`
returned PGRST205 for both application tables: authentication existed but the
application tables did not. The prepared bootstrap is
`supabase/mobile-test/20261022_sync.sql`, outside the production migration queue.
It creates production-compatible profiles, custody_entries and sync_devices,
owner-only RLS, timestamp triggers and narrow client CRUD privileges. It aborts
if application tables already exist, including production, and does not delete
accounts or application data. Verify the dashboard's exact test-project URL
before applying it once.

The bootstrap was applied October 22 after verifying the exact test-project
name and reference in the dashboard. The read-only `verify.sql` audit returned
all checks true for all three tables: RLS, authenticated owner policy, client
CRUD, anonymous denial, restricted privileged actions and timestamp triggers.
Zero-row REST preflights for profiles/custody_entries returned HTTP 401 / 42501,
confirming anonymous denial. Sanitized screenshot evidence is in ignored
`mobile/.build/sync/test-schema-verified.png`.

The ignored local native configuration now enables test sync. Checked-in defaults
remain disabled. This does not establish real authenticated two-device sync:
that requires the approved test identity through the account entry. No new email,
production-account access or production setting change was performed. The initial
locked/stale browser connection was recovered through a fresh tab in the same
browser session; it is no longer blocking schema setup.

## Verification

- 46 mobile unit/integration checks: offline and restart recovery, both conflict
  choices for dates/profiles, stale review/version races, late acknowledgements,
  failed writes, paused downloads, account changes and protected-session use.
- Actual Supabase SDK query checks cover owner/version filters, narrow profile
  payloads, duplicate insert races, invalid responses and pagination.
- In-memory PostgreSQL executes the exact bootstrap and verifies owner RLS,
  anonymous denial, narrow privileges, timestamp CAS and replay refusal. This
  does not establish the live project's configuration.
- Two-device browser walkthroughs pass at 390px and 320px, including restoration,
  separate offline devices, process/tab reopen, both choices and account B.
  Saved-screen edits pause downloads, and sync preserves the browsed calendar month.
- Signed iOS 17.5 simulator probes pass: the actual shared product note/image and
  pending hash/version survive termination; the isolated synthetic transport
  uploads that pending edit after restart. Account isolation, Keychain recovery,
  store revocation and durable offline sign-out also pass. No network is used.

Run `pnpm --dir mobile test`, `test:ui`, `test:checkin`, `test:accounts`, and
`test:sync`. After `sync` and `build:ios`, run
`pnpm --dir mobile probe:account:ios SIMULATOR_UUID`. Evidence is in ignored
`mobile/.build/sync/` and `mobile/.build/ios-account-probe.json`.

Real authenticated sync, uninterrupted email handoff, physical-device QA and
Apple provisioning remain separate gates. Native Settings/deletion, backup/import
and report sharing are the following implementation work.
