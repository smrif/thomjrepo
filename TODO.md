# Whose Day TODO Notes

## Deferred Owner QA

- Owner deferred hands-on QA October 13, 2026. Keep moving on independent work;
  do not send test emails or create/delete live QA accounts until resumed/approved.
- Central queue: [owner QA and approvals](docs/backend/owner-qa.md). Includes live
  isolation/deletion sessions, physical-device offline recovery, both conflict
  choices, old-origin transition, support delivery, and policy-acceptance QA.

## Backend / Cloud Sync Handoff

- [x] Declare the evening-journal illustration as the preferred link-preview
  image using static Open Graph/Twitter metadata. Deployed October 13 as Worker
  `77cf3d9c-0919-4344-be19-2eac962cda2c`; all 32 production files matched the
  tested build, crawler responses and JPEG delivery verified. Messaging-app
  caches may retain older cards. See `docs/backend/link-previews.md`.

- [x] Restore onboarding-first Sign up: all three homepage buttons and the
  login form's signup link open name/co-parent/children directly, with email
  and agreement last. Sign in remains the separate existing-account email flow.
  Responsive entry/sequence regressions and SDK login flags are covered.
  Deployed October 13 as Worker `d0452630-30ee-4b89-ae29-34a8c275b9e0`;
  all 31 production files and mobile/desktop navigation verified. See `docs/backend/signup-login.md`.

- Canonical production is `https://whosedayapp.com`. The legacy `https://thomjrepo.ryan-rifkin.workers.dev` remains available during the browser-data transition.
- Supabase project is wired with the public publishable key in `supabase-config.js`; no service-role or secret key is in the app.
- Working in production:
  - Sign-in send buttons disable immediately with a gray "Sending..." state; duplicate requests are blocked while sending, and logged-out resend cooldown remains in place.
  - Sign-in button feedback deployed as Worker version `ba689f53-ee7b-4c5a-a221-0ae529452d97` (`signin-busy-1`); browser tests cover both sign-in views, success/failure recovery, and repeated taps.
  - Email magic-link sign-in.
  - Settings Cloud account status.
  - Automatic profile sync to Supabase `profiles` while signed in.
  - Manual profile restore from Supabase `profiles`.
  - Automatic custody log sync to Supabase `custody_entries` while signed in.
  - Sync status in Settings with last-sync, offline, retry, and conflict states.
  - Conflict review in Settings lets a user choose this device's copy or the cloud copy for same-date differences.
  - Device sync metadata writes to Supabase `sync_devices`.
  - Logged-out onboarding includes an existing-account sign-in path that can restore profile and cloud entries.
  - Missing cloud-only custody dates are restored into local storage without overwriting local same-date entries.
  - Same-date cloud/local differences from another device are held as conflicts instead of overwritten.
- Last production session fix: `WhoseDayBackend.getSession()` now waits briefly for Supabase auth state after magic-link redirect before treating the user as signed out.
- Email-link continuation fix deployed October 12, 2026 (`auth-return-2`, Worker version `1cdd5847-43cf-4f92-bb57-5eb002a4eb96`):
  - Successful sign-in automatically advances to setup for new/incomplete profiles or restores an existing completed profile; Continue remains a retry after a failed profile read.
  - Returning to the sign-in tab rechecks the session on focus/visibility. Duplicate checks respect the auth busy lock, and leaving sign-in cancels automatic navigation.
  - Automatic sync now requires a saved local profile, preventing startup from writing default settings before onboarding/restoration completes.
  - Unit/browser regression checks pass for new, incomplete, and existing profiles, email callback return, tab focus, failed restore retry, and no premature default-profile upload. Production serves the exact tested source. The user confirmed successful real email-link sign-in on October 12, 2026.
- Custom SMTP configured and delivery tested on October 12, 2026:
  - `whosedayapp.com` registered through Cloudflare and verified in Resend.
  - Resend DKIM TXT and two required DNS-only CNAME records saved in Cloudflare and confirmed through public DNS.
  - Supabase uses Resend SMTP (`smtp.resend.com`, port `465`) with sender `Whose Day <noreply@whosedayapp.com>` and a 60-second per-user resend interval.
  - User created a sending-only key restricted to `whosedayapp.com` and saved it directly in Supabase. No SMTP credential is stored in the app or repo.
  - Production sign-in request succeeded; Resend reported the test email as Delivered, and the user confirmed that the email link worked.
  - Owner confirmed sign-in and profile/log restoration on the new production domain on October 13, 2026.
- Full account deletion implementation (deployed; basic live deletion verified):
  - `DELETE /api/account` verifies the user's access token on the server and hard-deletes that Supabase Auth user. No caller-supplied user ID is accepted.
  - Live foreign keys on `profiles`, `custody_entries`, and `sync_devices` were verified on October 12, 2026: all cascade from `auth.users`. No schema change is needed.
  - Settings requires typed DELETE, waits for an in-flight sync, and blocks new sync while deleting. Local profile/logs and downloaded exports remain.
  - [x] Owner saved `SUPABASE_SECRET_KEY` as an encrypted Cloudflare Worker secret. Verified the encrypted binding without reading its value. See `docs/backend/account-deletion.md`.
  - [x] Deployed October 12, 2026, version `d00957f8-f6ae-4cc1-88bf-901e6e4d613e`. Live app/client versions are current; missing/invalid tokens return 401, a foreign origin returns 403, and GET returns 405. Local contract, API, auth-routing, account-deletion, responsive deletion UI, and app smoke tests pass. These checks do not establish that a real Auth deletion succeeds.
  - [x] Owner deleted a disposable production account on October 12, 2026. Before deletion: one profile, one active log, one device row. Independent counts by recorded user ID afterward: zero Auth users, profiles, custody entries, and sync devices.
  - Success returns to the logged-out home with a dismissible confirmation; a local marker preserves that state on reload until setup/restoration completes. Mobile dark and desktop light regression tests verify navigation, confirmation, failure/retry, and retained local records. Deployed October 12, 2026 as Worker version `d3fbb88b-4715-4a24-9841-1dd6c41168a1` (`account-deletion-2`).
  - [ ] Finish production QA: confirm retained local records, a separate control account is unaffected, and old sessions on a second device cannot restore/sync the deleted account.
  - [ ] Finalize provider backup/log retention before beta. Published limits and proposed support/restore handling are documented in `docs/backend/provider-retention.md` (October 13); actual plans/settings, Auth audit retention, and owner/legal sign-off remain pending. Account deletion removes active records, not previously downloaded files or provider backups.
- Database security review completed October 12, 2026 (see `docs/backend/database-security.md`):
  - [x] Captured app schema, indexes, triggers, owner-only policies, and grants in a baseline migration, plus repeatable catalog/read-isolation checks.
  - [x] Removed unnecessary authenticated TRUNCATE/REFERENCES/TRIGGER/MAINTAIN access and obsolete postgres-owned default client table grants in Supabase; authenticated owner CRUD remains enabled.
  - [x] Live read-only owner/foreign/deleted/missing-subject checks passed. Anonymous Data API reads are denied on all three tables.
  - [x] Added local PostgreSQL migration/RLS regression tests: 165 checks, including owner CRUD/upserts, cross-account writes denied, anonymous denial, cascades, unchanged control rows, and stale-subject writes denied. No production fixture writes were used.
  - [ ] Adopt Supabase CLI migration history after catalog comparison. Baseline objects and hardening already exist in production; do not replay the baseline or blindly push it.
  - [x] Prepare the combined-state catalog comparison and fresh-platform recovery
    checklist in `docs/backend/migration-adoption.md`; no history/schema writes performed.
  - [ ] Run two real authenticated-browser API isolation tests and a second-device old-session deletion test; local SQL/role tests do not establish end-to-end JWT refresh behavior.
  - October 13 QA preparation: local-only `scripts/security-qa/` tool added for two real sign-ins, empty-account preflight, synthetic positive controls, symmetric fixture-scoped read/write/upsert/DELETE isolation, and retained-token checks after separately confirmed deletion. Its 11 core/server tests and desktop/mobile browser tests passed against mocks. Existing 165 database checks, deletion regressions, and live GET-only anonymous denials also passed again. Live authenticated execution remains pending approved fresh test aliases and email sign-ins; no real account was created/changed/deleted. See `docs/backend/authenticated-security-qa.md`.
- Next backend work: multi-device recovery QA and cloud-copy polish.
  - [x] Automatic custody-log reconnect sync: compare against a per-account last-synced copy, automatically upload/download one-sided changes, retry transient failures, and guard writes against concurrent server changes. Genuine two-sided changes remain held for review.
  - [x] Regression tests cover reconnect, remote pulls, retries, edits during sync, concurrent writes, baseline persistence/account isolation, and real-browser offline/reconnect sync without opening Settings.
  - [x] Receiving-side follow-up: visible, signed-in apps check custody changes every 15 seconds so a receiver that reconnects before the sender uploads still catches up. Idle checks do not rewrite profiles. Downloaded changes refresh active Calendar/details and Reports/previews, not just Today. A two-context test preserves an unrelated legacy conflict while receiving newer dates automatically.
  - Receiving update deployed October 13, 2026 as Worker `e0827116-57ee-4621-a63a-4377d5781b92` (`receiving-sync-1`). Owner confirmed the phone-to-desktop offline/reconnect test passed on October 13, 2026; automated two-context, offline, sync, auth, deletion, contract, and smoke tests also passed.
  - Existing pre-comparison-tracking differences are still held for review to avoid losing unsynced local data; select the intended copy once to establish the baseline. An older held date does not block other dates syncing.
  - Deployed October 13, 2026 as Worker version `690014b5-102c-47d9-8fe5-97e4a6ebc2b8` (`auto-sync-1`). No Supabase schema changes required.
  - [x] Verify on two physical devices after refreshing the deployed app: edit offline, reconnect, and confirm the other device receives it without visiting Settings. Owner confirmed this test passed October 13, 2026.
  - [x] Offline app-shell loading: generated, versioned service worker caches static app files and the bundled Supabase SDK; previously visited hosted app opens/reloads offline. API responses are never cached. Mobile/desktop browser tests cover cold reload/reopen, local edits, reconnect sync, and safe updates. See `docs/backend/offline-loading.md`.
  - Deployed October 13, 2026 as Worker version `f90d2abe-5934-46fe-95fe-b9c139e25e11` (`offline-shell-1`), including cached-response normalization for Cloudflare HTML redirects.
  - [ ] Verify offline reopening on a physical iPhone after an online visit completes installation. Initial visits, cleared/evicted browser storage, and fresh sign-in still require connectivity.
  - [x] Updated onboarding, sign-in, Settings, privacy/storage wording, and CSV export notices to describe automatic signed-in sync, offline retry, notes/screenshots, and retained local records. Removed "never shared"/"stays on your device" claims. Provider/access disclosures match the current implementation; no security settings or acceptance records changed. See `docs/backend/cloud-disclosures.md`.
  - Copy update deployed October 13, 2026 as Worker `4a0cb13d-2111-4979-b275-18a3d0d1b570` (`cloud-disclosures-1`). Disclosure/CSV, auth, sync, deletion, domain, offline, contract, and smoke tests passed. Owner confirmed new-domain sign-in and profile/log restoration on October 13, 2026.
  - [ ] Complete owner/legal review of privacy/terms and app-store disclosures before beta. The copy consistency pass is not a compliance sign-off.
  - [x] Implement policy-version-at-acceptance capture and explicit upgrade handling locally. Current document versions are `2026-10-13`; submissions link to frozen hashed copies. Existing `alpha-local`/cloud records are not relabeled or restamped by normal sync/restore. Offline attribution binds to one matching account. See `docs/backend/policy-acceptance.md`.
  - [x] Deploy policy tracking with the owner's requested October 13 release,
    Worker `d0452630-30ee-4b89-ae29-34a8c275b9e0`.
  - [ ] Finish policy owner QA. Mandatory future re-consent still needs owner/legal review; no forced re-consent or production acceptance migration was enabled.
  - Multi-device QA: create a deliberate same-date conflict and verify both conflict-resolution choices.
  - Replay migrations in a fresh Supabase environment and run the same checks against its platform before relying on migration-based recovery.

## Production Domain Migration

- [x] Deploy the app at `https://whosedayapp.com` before final beta QA. Deployed October 13, 2026 as Worker `b0911422-17bf-48c6-8286-43227281ee9f` (`production-domain-1`). See `docs/backend/production-domain.md`.
- [x] Attach `whosedayapp.com` and `www.whosedayapp.com` to the existing Cloudflare Worker and verify trusted HTTPS. `www` redirects to the canonical domain with paths, queries, and browser fragments preserved. Resend DNS records remain unchanged.
- [x] Add the exact new and legacy root URLs to Supabase's allowlist, retain all four local-development URLs, and set Site URL to `https://whosedayapp.com/` with owner approval. Client redirects use the new domain by default and keep old-origin sign-in on the old origin during transition.
- [ ] Verify that existing records have synced or been exported from the old origin before retiring it. Browser storage and login sessions do not automatically move between domains; sign in and restore on the new domain.
- [ ] Test email sign-in, profile/log restoration, automatic sync, and offline recovery on the new domain. Confirm required older-origin authentication links still work during the transition.
  - [x] Owner confirmed new-domain sign-in and profile/log restoration on October 13, 2026.
  - Automated/live checks pass for HTTPS, public release/configuration, canonical redirects, new-domain offline loading, and storage isolation with preserved old-origin access. Physical-device cross-device/offline recovery on the new domain and old-link completion remain to be confirmed separately.
- [ ] Update support/contact links, privacy/terms URLs, and release documentation for the new domain. Set up a working support inbox or forwarding address before publishing it.
  - Relative privacy/terms links already resolve on the new domain. The existing `Team@whoseday.com` support address is unverified.
  - [x] Google Workspace domain verification, Gmail activation, SPF, and 2048-bit DKIM setup completed October 13, 2026. Added Google's MX/TXT records in Cloudflare without changing Resend or website records.
  - [x] Added `support@whosedayapp.com` as an alias for `ryan@whosedayapp.com` with owner approval. Cloudflare forwarding was not configured; Google Workspace receives domain email instead.
  - [ ] Confirm actual delivery to the support alias before replacing public contact links. No end-to-end delivery confirmation yet.
  - [ ] Optional/later: configure Gmail to send/reply as `support@whosedayapp.com` and test it. Owner deferred this October 13, 2026; the Gmail setup popup did not open inside Codex. This does not prevent receiving at the saved alias.
- [ ] Redirect the old app URL after the data transition is verified, then remove obsolete auth redirect URLs when no longer needed.

## Testing / Release Hygiene

- [x] Deploy the reviewed main checkpoint `5cf22ee` on October 19, 2026.
  Worker `e159d2e4-1d3b-496b-9089-93e93a05055f`; all 32 production files matched
  the build and mobile/desktop navigation passed with mocked Auth. See
  `docs/backend/deployment-2026-10-19.md`. Deferred owner QA remains pending.

- Before pushing UI changes, run:
  - `node scripts/contract-test.mjs`
  - `node scripts/api-contract-test.mjs`
  - `node scripts/account-deletion-test.mjs`
  - `node scripts/account-deletion-ui-test.mjs`
  - `node scripts/database-security-test.mjs`
  - `node --test scripts/security-qa/checks-test.mjs`
  - `node scripts/security-qa/ui-test.mjs` (mocked APIs only; not live security evidence)
  - `node scripts/automatic-sync-test.mjs`
  - `node scripts/automatic-sync-ui-test.mjs`
  - `node scripts/multi-device-sync-test.mjs`
  - `node scripts/signin-button-test.mjs`
  - `node scripts/domain-migration-test.mjs`
  - `node scripts/cloud-disclosures-test.mjs`
  - `node scripts/policy-acceptance-test.mjs`
  - `node scripts/policy-acceptance-ui-test.mjs`
  - `npm run test:offline` (builds and tests the deployed app shell)
  - `npm run test:smoke` once npm dependencies are installed

- The contract test catches missing inline handler functions, missing core screens, and missing CSS hooks.
- The browser smoke test covers Settings nav, check-in card styling, split-night absent kid defaults, Brief Visit review state, schedule-change context, Calendar selected-day state, Calendar metadata, screenshot previews, Reports preview/filter behavior, Calendar trends, custom parent/co-parent labels across Review, Saved, Calendar, and Reports, and long parent/child names without stale labels or horizontal overflow.
- [x] Prepare a full local release check (`node scripts/release-check.mjs`) and read-only GitHub Actions workflow for the same suite, including smoke, offline, policy, and security QA-tool tests. Pinned actions; frozen dependency lock; no production credentials, live mutation tests, or deployment. See `docs/backend/release-checks.md`.
- [x] Commit/push the reviewed workflow and verify its first hosted run.
  - October 19 release-hygiene review: all 30 local release results and the
    32-file build boundary passed. Fixed the reconnect test's aging fixed-date
    fixture; see `docs/backend/release-checks.md`. Commit `a1df43c` pushed on
    `codex/release-hygiene`; [first hosted run](https://github.com/smrif/thomjrepo/actions/runs/39314170916)
    passed on GitHub/Linux in 2m 16s. No repository settings change or production
    deployment was performed.
- [ ] Watch the service-worker update/reopen test on hosted CI: one standalone
  run timed out at `offline-shell-test.mjs:138`; the unchanged rerun and preceding
  full suite passed. Investigate if it recurs; no root cause established.
  - October 19: passed both the full local rerun and first hosted run. Continue
    monitoring future runs; the earlier intermittent timeout has no proven cause.

## Calendar / Logging Follow-ups

- Product decision: only yesterday can be backfilled.
  Older empty days should remain read-only and show "Nothing logged" to preserve log credibility.

- Verified timestamps, change-context badges, screenshot previews, Reports stats, and exported metadata across Calendar details and Reports.
- Continue watching long-label copy in report cards. It now wraps safely, but very long configured names can still make report titles visually dense.
- [x] Unified Reports/Trends rolling date windows: today plus the previous N-1
  local dates, excluding future dates. Regression coverage includes four timezones,
  midnight/noon, DST, leap day, and year rollover. Deployed October 13 with
  `d0452630-30ee-4b89-ae29-34a8c275b9e0`.
- [x] Clear abandoned custody/help/context answers when changing a check-in
  branch, preserve notes/screenshots, and clear absent-child details when returning
  to all kids home. Added state/save and browser regressions. Deployed October 13
  with `d0452630-30ee-4b89-ae29-34a8c275b9e0`.

## Future Product Areas

- [x] Implement Reports clarity locally (October 19): selected period/type,
  family-date statistics, shared selection and print totals, unknown context and
  timestamps, timezone/export limitations, neutral day wording and compact empty
  reports. Browser coverage exercises all five types and preview/print parity.
  Review/release remains pending.

- [x] Implement the first Trends clarity increment locally (October 19): separate
  family-date coverage, both schedule-change directions, incomplete-context labels,
  historical Calendar links and distinct empty states. Automated coverage includes
  both themes/viewports and sync refresh. Owner approved the compact empty state
  and production release; deployed revision `855e758` as Worker
  `3dd0d424-d925-4048-80af-fdd31f1c126b`, with all 32 files and live mobile/desktop
  empty-state/navigation checks verified. See `docs/backend/deployment-2026-10-19.md`.

- [x] Review the current decision tree in `DECISION_TREE.md`; corrected stale
  screen/progress descriptions and documented the remaining product decisions.
- [x] Draft Trends, Reports, and Settings specifications from the implemented
  screens: `docs/product/remaining-product-spec.md`.
- [ ] Review/approve the proposed product increments, including charts/counting,
  child identity and optional fields, activity editing, and portable backup/import.
- [x] Returning-user Settings already keeps bottom navigation visible.
- [x] Reconcile `TODO_EXTENDED.md` with implemented features; original June memo
  remains clearly labeled historical context.

## Design Polish

- Do a full pass on better icons.
  This can happen near the end after the core flows are settled.
