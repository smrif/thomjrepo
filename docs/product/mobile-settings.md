# Mobile Settings — October 23, 2026

The account entry reuses the shared Settings screens, with mobile adapters for
verified account storage and test-only sync. The website's Settings source and
production deployment are unchanged.

## Connected controls

- Parent and co-parent labels, child addition/rename/removal, activity choices
  (including custom activities), and system/light/dark appearance.
- Saves are written and read back through the account's SQLite profile before
  changing the active app config or displaying Saved. A failed save preserves
  the field/child editor for retry. Concurrent or stale saves cannot replace a
  newer profile or another account's state.
- Each save updates only its own setting against the captured profile snapshot;
  the signed-in email, policy acceptance and existing check-ins remain intact.
  At least one child and one activity are required; duplicate names/activities
  and over-limit values are rejected. Appearance uses the same durable flow.
- Local changes queue profile sync. Offline edits restore after reopen. Divergent
  profiles use the existing explicit conflict review. Opening Settings applies
  the latest cached cloud profile; downloads pause while a Settings editor is
  open so drafts are not replaced. A previously in-flight change forces review
  before a stale save can succeed.
- Saved check-ins keep their original values and child-name keys when the profile
  changes. No historical record rewrite/name migration is performed.
- Email is read-only and identifies the signed-in account. Sign out uses the
  existing verified native sign-out path. Sync status links to account/conflict
  review. JSON backup/import now connects through native Files and atomic restore; see
  [mobile backups](mobile-backups.md). [CSV/report actions](mobile-reports.md) are now connected. The inactive browser analytics checkbox and policy agreement
  are excluded; this increment does not create acceptance history.

The standalone `checkin/` sample keeps Settings disabled. The `account/` entry
connects it; the `preview/` demo remains separate. None imports browser demo data.

## Account deletion

Settings includes a typed DELETE confirmation. The two-device browser preview
implements deletion of its fictional account in a transactional shared mock
store. A tombstone prevents old pending writes from recreating the mock cloud
rows, and other preview devices close the account when they reconnect. Other
accounts/project scopes and retained local rows are preserved.

Native deletion has a pinned test-service client and a prepared separate worker
in `mobile/server/`. It reuses the website's token-verified self-deletion handler,
with restricted native-origin CORS and a test-project guard. The server key is
never a mobile setting or binary asset. The worker is not deployed/configured;
live native deletion is visibly disabled until its endpoint and test secret are
set up. See [test service setup](../../mobile/server/README.md). No real account
was deleted or new sign-in email requested by this increment.

Before a deletion request, the app persists a per-account pending checkpoint,
closes stores, drains in-flight sync, and blocks new writes. Confirmed success
persists the deleted state and signs out. A definite rejection permits reopening
with saved copies intact. A lost/uncertain response remains locked across restart,
with explicit retry or sign-out; it cannot claim success or automatically upload
retained data. Another account never adopts the retained rows. Already-offline
other devices can retain cached local access until reconnect/auth verification;
there is no remote-erasure promise for device files or downloaded exports.

## Review and verification

Use `http://127.0.0.1:4179/account/index.html?sync=preview&device=one` and sample A.
Open Settings from the bottom navigation. Edit names, children and activities,
change appearance, close/reopen offline, then compare the same account on preview
device two. Make differing offline profile edits on each to exercise review.
The deletion flow in this URL affects only the synthetic preview account; the
ordinary local-only preview and real test accounts are separate.

Reproducible checks:

```sh
pnpm --dir mobile build
pnpm --dir mobile test
pnpm --dir mobile test:settings
pnpm --dir mobile test:sync
pnpm --dir mobile test:accounts
pnpm --dir mobile test:checkin
pnpm --dir mobile test:ui
pnpm --dir mobile build:test-api
```

The unit/contract suite covers verified profile changes, stale writes, account
switches, deletion journaling, rejected/uncertain outcomes, sync draining, service
origin/project guards and expected-user requests. Browser checks exercise phone
widths, failure/retry, children/history, activities, appearance, offline reopen,
profile conflicts, sign-out/account isolation and simulated deletion. Screenshot
evidence goes to ignored `mobile/.build/settings/`.

The signed iOS 17.5 account probe passed October 23: it saved the parent label and
dark appearance through the shared Settings UI and recovered both from SQLite
after process termination. Pending check-in/image, Keychain recovery, separate
account isolation and offline sign-out also passed. Evidence is in ignored
`mobile/.build/ios-account-probe.json`. This is a synthetic simulator probe,
not real authenticated or physical-iPhone QA.
Live test deletion service activation, real authenticated sync/email return,
physical-device layout/accessibility and Apple provisioning remain release gates.
