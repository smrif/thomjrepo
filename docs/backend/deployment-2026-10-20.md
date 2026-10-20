# October 20, 2026 Reports Production Release

Published at the owner's request after approval of the Reports changes.

- Main merge revision: `2b2a623`.
- Approved source revision: `5f13d8e`; the merge tree matched it exactly.
- Worker version: `54a29184-c51d-4069-ad1c-e8a70b8810b5`.
- Previous recorded production version: `3dd0d424-d925-4048-80af-fdd31f1c126b`.
- Canonical URL: https://whosedayapp.com; asset token: `reports-clarity-1`.
- Wrangler 4.149.0 build/dry run/deployment succeeded with existing bindings.
  No schema migration, secret change, or secret-value read was performed.

The final local suite passed all 32 checks. The
[approved revision's hosted run](https://github.com/smrif/thomjrepo/actions/runs/39359931812)
also passed. The [merge run](https://github.com/smrif/thomjrepo/actions/runs/39462807378)
was initially queued for a runner and subsequently started; its result was still
pending at verification. Production was deployed from the identical tested tree.

All 32 live static files matched `dist` byte-for-byte. The canonical `www` redirect
preserved its query; the legacy origin and API health endpoint returned 200.
Live browser checks at 390px/dark and 1280px/light passed for all five report
types, type-inclusion counts, outside/future range exclusion, family-date stats,
unknown timestamps/context, timezone labels, preview/print text parity, escaped
names, no stored-entry mutation, compact empty output and no horizontal overflow
or page errors.

Verification used fresh isolated browser contexts with mocked Auth and blocked
service workers. Synthetic fixtures stayed in those contexts' local storage.
No sign-in email, real account operation, cloud entry write or policy submission
was performed. Physical-device/live account QA remains in [owner QA](owner-qa.md).
