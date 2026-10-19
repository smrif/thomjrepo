# October 13, 2026 Onboarding and Reliability Release

Published at the owner's explicit request to deploy the tested changes.

- Worker: `thomjrepo`.
- Current version: `d0452630-30ee-4b89-ae29-34a8c275b9e0` (100% deployment).
- Previous version/rollback reference: `4a0cb13d-2111-4979-b275-18a3d0d1b570`.
- Canonical URL: https://whosedayapp.com.
- App asset token: `onboarding-direct-1`.
- Deployment used the existing Cloudflare OAuth session and Wrangler 4.149.0.

## Included changes

- Homepage signup and login are separated. Signup starts with the name question,
  then co-parent, children and email/agreement. The redundant marketing intro is
  removed; login remains an existing-account email-link flow.
- Changing custody/check-in branches clears abandoned answers while retaining
  authored notes/screenshots. Rolling Reports/Trends date filters share local-date
  boundaries and exclude future dates.
- Current build includes policy-version acceptance tracking and frozen linked
  documents. No forced re-consent, bulk acceptance migration, or database schema
  change was enabled. Owner/legal review and live acceptance QA remain pending.

## Verification

- The pre-deployment full release suite passed all 30 results with zero failures
  or skips, including offline update, policy, security, sync and browser checks.
- Wrangler dry-run bundled successfully; deployment uploaded 10 changed assets
  and reused 21 existing files. The existing Worker bindings were retained.
- After deployment, GETs for all 31 static files matched local `dist` byte-for-byte.
- Production browser checks passed at 390px mobile and 1280px desktop: all three
  signup buttons reach the name question, Back returns home, login opens the
  returning-user form, and its signup switch reaches onboarding. The removed
  intro is absent and no page errors were observed.
- `www` still redirects to the canonical domain with the query preserved; the
  legacy Worker origin remains accessible for the data transition.

Production browser checks mocked Auth only. No real sign-in emails, new accounts,
account deletion, authenticated production writes, or policy-acceptance submissions
were performed. Physical-device/live QA remains in [owner QA](owner-qa.md).
No Git push, hosted CI run or migration-history repair was performed.
