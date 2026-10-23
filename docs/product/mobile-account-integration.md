# Mobile account and local check-in integration — October 22, 2026

This increment connects the test-project email sign-in client to a first-run
family profile and the shared Today/check-in/Calendar flow. It is for synthetic
data only. It does not connect production accounts, restore the website's cloud
profile, synchronize custody records, or make this a release-ready mobile app.

## Entry and storage

- Normal installed-app launch opens `account/index.html`. Native lab tools are
  available through `index.html?lab=1`; the original sample check-in and full UI
  previews remain separate.
- The native account entry uses the configured separate Supabase test project,
  PKCE return validation, and asynchronous Keychain storage. Sessions are scoped
  by project and remain separate from the earlier lab's sign-in keys. Request a
  new link from the account screen to test that entry; a prior lab sign-in is
  not silently adopted. No sign-in email is automatically requested.
- First sign-in asks for sample parent/child names. The local profile is written
  and read back before entering the product screens. It is not a cloud profile
  import or a new policy acceptance; no acceptance history is fabricated.
- Profile rows and check-in keys include both project and authenticated user ID.
  Profiles carry their owner/schema and are validated before the record store
  opens. Notes and attachments retain the existing atomic, verified save format.
- Missing/corrupt/misowned profiles or records cannot open the account screens
  with another account's data. Existing sample/demo/old lab data is not imported.
- Same-account auth refresh leaves profile drafts and current edits intact.
  Changed identities close the old store immediately and reload the product
  context. Closed stores reject held snapshots and cannot publish pending writes.

## Offline access and sign-out

The app can reopen the previously authenticated local account using its secure
cached session when offline or when SDK refresh reports a transient network
failure. Explicit authentication rejection closes account access. Offline local
access does not establish current server authorization; cloud sync is absent.

Sign-out closes the account UI immediately and verifies a durable secure lock
before attempting SDK cleanup. Cached credentials/verifiers are removed; network
failure cannot reopen the old account on restart. A late callback or stale
startup result cannot undo a newer sign-out/sign-in. A new successful explicit
callback can unlock the account again. If the lock itself cannot be saved, the
UI remains closed and offers a retry instead of claiming durable sign-out.

The retained local profile/records are not erased by sign-out. They reopen only
when that account is selected again through the appropriate auth/preview path.
The prototype database still lacks application-level encryption and remains
excluded from native backup. Use synthetic data only.

## Browser review and checks

Serve only `mobile/www` on loopback, then open
`http://127.0.0.1:4179/account/index.html`. The browser entry offers two fixed,
fictional accounts and stores their separate profiles/check-ins in IndexedDB.
It never sends sign-in requests or uses native credentials. The native entry
does not accept browser-selected identities.

Reproducible commands from `mobile/`:

```sh
pnpm sync
pnpm test
pnpm test:ui
pnpm test:checkin
pnpm test:accounts
WHOSE_DAY_IOS_PACKAGES=/private/tmp/whose-day-checkin-packages pnpm build:ios
pnpm probe:account:ios SIMULATOR_UUID
```

The account probe uses DEBUG-only iOS simulator launch arguments. It recovers
an isolated synthetic Keychain identity, local profile, and the actual shared
product note/image after process termination; it also checks a second account's
empty records, revoked old store access, and persistent offline sign-out. Probe
credentials use dedicated keys and do not replace the real test session. Results
are in ignored `mobile/.build/ios-account-probe.json`. These are simulated auth
identities, not a new real email handoff test.

Local checks cover 28 unit/integration cases, the existing five shell layouts,
the original check-in walkthrough, and the new two-account UI at 390px and
320px. Account UI checks include failed-profile-save retry, note/image recovery,
offline reopen, sign-out/reload, and separate profiles/records after switching.
All browser requests outside the intercepted test origin are blocked. A mobile
job was added to the existing read-only GitHub Actions workflow; hosted results
must be checked separately from local passes.

The signed iOS 17.5 simulator build passed both account probes October 22:
profile, secure cached test identity, note and attachment recovered across
termination/relaunch; the second account was empty, old store access was revoked,
and local sign-out stayed signed out when auth was reopened. No network was used.

Owner browser smoke test passed October 22: sample account A worked as expected;
the follow-up sign-out, account B separation, and return to account A also behaved
as expected. This confirms the browser preview flow; real email handoff and
physical-device checks remain separate.

Follow-up: [test-only profile restoration and custody sync](mobile-sync.md) are
implemented with explicit conflict review, two-device browser checks and pending
sync recovery on iOS. The separate test schema is installed/verified and enabled in local native
configuration; real authenticated sync QA remains pending. The [Settings follow-up](mobile-settings.md) connects family/preferences and
prepares native test deletion; backup/import and sharing follow next. Real email
handoff through this account entry, physical-device behavior, and store release
remain separate checks. Apple's last-recorded provisioning block is unchanged.
