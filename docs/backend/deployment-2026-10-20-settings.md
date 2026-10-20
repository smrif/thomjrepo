# October 20, 2026 Settings and Authenticated Entry Release

Published at the owner's request after approval of the Settings overview and
focused subpages in the local sample-account preview.

- Main merge revision: `c6d10b3ea28a00c949a91569a3e17b4f8cd593be`.
- Approved source revision: `2c8d9050bcccefb3013eebd7f720b228495a9977`.
  The merge tree matched the approved source exactly.
- Worker version: `e0c935c1-bc15-4890-9f0d-e0cf0db73c70`.
- Previous production version: `54a29184-c51d-4069-ad1c-e8a70b8810b5`.
- Canonical URL: https://whosedayapp.com; app asset token: `settings-pages-1`;
  client asset token: `auth-entry-1`.
- Wrangler 4.149.0 dry run, build, and deployment succeeded using existing routes
  and bindings. No schema migration, secret change, provider session-duration
  change, or secret-value read was performed.

Settings now uses a compact grouped overview with focused name, email/sign-in,
co-parent, child, activities, sync/restore/conflicts, custody sync, export, and
deletion pages. Appearance remains inline. Save returns to Settings; Back cancels
draft changes; authenticated reload retains detail navigation. Deletion keeps
its existing safeguards and clears its typed confirmation when leaving the page.

The release also includes the earlier approved unified-account and authenticated
entry changes: signed-out users land on welcome/login, sign-out returns there,
and previously authenticated devices retain offline access. Saved records and
existing policy acceptance are preserved. See [authenticated entry](auth-required-entry.md).

## Evidence

- Final local release suite: 34 passed, zero failed/skipped, about 93 seconds;
  41-file build boundary passed.
- [Approved source hosted run](https://github.com/smrif/thomjrepo/actions/runs/39497602792):
  completed successfully before deployment.
- [Main merge hosted run](https://github.com/smrif/thomjrepo/actions/runs/39497952876):
  running when these deployment notes were recorded. The deployed merge has the
  same tested source tree as the successful approved-source run.
- All 41 live static files matched `dist` byte-for-byte. Canonical `www` redirect
  preserved its query and returned 308; legacy origin and API health returned 200.
- Production Settings regressions passed at 390px/dark and 1280px/light: summary
  overview, authenticated identity, name save/cancel/validation, browser Back,
  detail-page reload, child add/remove/cancel, activities, sync detail and errors,
  isolated deletion confirmation, real CSV download, offline sign-out, and
  signed-out navigation guards. No horizontal overflow or page errors occurred.
- In-app browser confirmed that the real production app opens to welcome while
  signed out, with visible Sign in and Sign up actions.

Production regression checks used fresh isolated browser contexts and a mocked
backend. Service workers were blocked for those checks; real provider requests
and all non-GET/HEAD production requests were denied. Synthetic fixtures stayed
in those contexts' browser storage. No sign-in email, real account operation,
cloud entry write, or policy submission occurred. Service-worker update/offline
behavior passed in the complete local and hosted release suites. Physical-device
and real-account QA remain separate in [owner QA](owner-qa.md).
