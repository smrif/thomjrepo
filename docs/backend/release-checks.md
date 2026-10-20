# Automated Release Checks

Run `node scripts/release-check.mjs` (or `pnpm test:release`) before a release.
This builds the static app, verifies the build boundary/public configuration,
and runs the explicit local/mock regression suite serially, including database
roles, authentication, sync, two-device receiving, deletion, policy tracking,
offline shell updates, responsive UI, exports, and the local QA tool.

No live sign-in emails, authenticated production mutations, or account deletion
are part of this command. It takes no credential/live-project arguments and uses
no service key. Owner-assisted/live verification remains in [owner QA](owner-qa.md).
Dependencies and Playwright's Chromium must be installed before running locally.

`.github/workflows/checks.yml` runs the same command on pushes, pull requests,
or manual dispatch once the workflow is committed/pushed and Actions is enabled.
It uses Node 24, pnpm 11.25.0, the frozen pnpm lockfile, disabled dependency
install scripts, and an explicit Chromium install. Actions are pinned to verified
official tag commits. Its token is read-only, checkout does not persist credentials,
and it has no deployment step, production secrets, or artifact upload.

This workflow has only been prepared locally. No push, hosted Actions run,
branch-protection change, or production deployment was performed. A local pass
does not establish a Linux/GitHub-hosted pass. Confirm the first hosted result
after an approved code push; any GitHub Actions billing/availability follows the
repository owner's account settings, which this change does not modify.

October 13, 2026: the local release command passed all 28 test results and the
31-file build-boundary check, including the new policy/preview and offline-policy
coverage. A later Settings copy correction was separately rebuilt and checked
with the contract/disclosure suites; it changes no runtime logic.

October 13 independent readiness follow-up: reran the complete release command
against the current working tree using the desktop bundled Node executable
(Node was not on the shell PATH). All 28 results passed, zero failed/skipped,
in about 84 seconds; the build boundary again passed for 31 static files.
No runtime fixes were needed. Reviewed the workflow's explicit local/mock command,
read-only token, disabled persisted checkout credentials, frozen install, and
absence of production/deployment steps. Hosted execution remains unverified.

October 13 subsequent independent cleanup: fixed rolling-date boundaries shared
by Reports/Trends and stale answers when changing check-in branches. Added
four-timezone date regressions, branch-state/save checks, and two actual browser
edit/save cases. The expanded full release suite passed all 30 results with zero
failures/skips in about 91 seconds; the 31-file build boundary passed. Updated the
app script cache token to `checkin-dates-1` for a future release. These changes are
local and have not been deployed. Remaining product scope is drafted in
`docs/product/remaining-product-spec.md`; live migration adoption and QA remain
separate from these automated results.

Cache-token follow-up: rebuilt the static app and passed the contract check.
The standalone offline test first timed out reopening the app during the worker
update at `offline-shell-test.mjs:138`; an immediate unchanged rerun passed both
viewports and all update/recovery assertions. The same test had passed in the
full 30-result suite. Record this intermittent navigation timeout for the first
hosted run; no production failure or root cause is established by this evidence.

October 13 signup/login follow-up: all homepage signup buttons now select explicit
account creation, while login uses existing-account-only OTP requests. The final
30-result release suite passed with zero failures/skips in about 93 seconds,
including the expanded auth-request/browser tests and offline update checks.
Mobile/desktop signup screenshots were inspected. See `signup-login.md`; local
assets use `separate-auth-1` and have not been deployed.

October 13 onboarding-entry correction: restored signup to the original
introduction/name/co-parent/children/email-and-agreement sequence, without an
email-link gate before the profile questions. The release command passed 29
results; smoke failed on a stale email-first dark-preview expectation. Corrected
that assertion and reran the complete smoke test successfully. Signup entry and
sequence tests passed in both responsive viewports. App cache token is now
`onboarding-entry-1`; no deployment or live email test was performed.

October 13 intro-screen removal: deleted the redundant promises/marketing screen
and routed fresh signup and incomplete-account continuation to the name question.
All 30 release results passed with zero failures/skips in about 89 seconds.
App cache token is `onboarding-direct-1`; this change remains local, not deployed.

Deployment follow-up: the owner requested publishing this tested build. Worker
`d0452630-30ee-4b89-ae29-34a8c275b9e0` is live; all 31 static assets matched
`dist` byte-for-byte and mobile/desktop signup/login navigation checks passed.
See [deployment verification](deployment-2026-10-13.md). Earlier “local only” notes
above describe pre-deployment evidence. Live owner QA and hosted CI remain pending.

Link-preview follow-up: all 30 release results passed with a 32-file static build.
Deployed Worker `77cf3d9c-0919-4344-be19-2eac962cda2c`; all 32 production assets
matched the build byte-for-byte. Three crawler user-agent requests received the
preferred illustration metadata without JavaScript; image MIME/status and
mobile/desktop navigation passed. Actual recipient-app cache refresh is unverified.
See [link previews](link-previews.md).

Sources: [checkout](https://github.com/actions/checkout),
[setup-node](https://github.com/actions/setup-node),
[pnpm action setup](https://github.com/pnpm/action-setup).

## October 19, 2026 release hygiene

Reviewed the pending source, tests, assets, migration files, and release workflow
for a Git checkpoint on `codex/release-hygiene`. Generated `dist`, dependencies,
local environment files, and Wrangler state remain ignored. The credential-pattern
scan found only the deliberately invalid `sb_secret_never-use` test fixture;
the static build boundary passed for 32 files. All three pinned Actions commits
were checked against the official release tags.

The first release run passed 29 of 30 results. The reconnect browser test used
an October 12 fixture; startup now generated intervening missed-day records that
its single-row mock could not persist, keeping sync pending even though the edited
record uploaded. Changed the fixture to the current local date and passed that
test in the full-suite rerun. No application behavior changed for this fix.

The complete rerun passed all 30 results, zero failures/skips, in about 88 seconds
using Node 24.19.0. The offline update/reopen check also passed. Staged whitespace
review found and removed two trailing-space Markdown line breaks in the readiness
specification.

Pushed checkpoint `a1df43c` to `codex/release-hygiene`. The
[first hosted run](https://github.com/smrif/thomjrepo/actions/runs/39314170916)
completed successfully on GitHub/Linux in 2m 16s, including locked dependency
installation, Chromium/system dependencies, and the complete release suite.
The offline update/reopen test passed on both local and hosted runs; the older
intermittent timeout remains a monitoring item, not an established product bug.
This evidence-only follow-up changes documentation and uses `[skip ci]` to avoid
repeating the unchanged application/test suite.
Production deployment and deferred owner QA are separate from this checkpoint.

## October 19, 2026 Trends clarity

The owner approved the first Trends increment. Added coverage by family date,
separate lists for both schedule-change directions, explicit incomplete-context
labels, date buttons opening the historical Calendar month/detail, and distinct
no-custody/no-change empty states. Names are escaped in the new markup; filters
and the four overview cards remain, with day-based labels and an accurate range
heading. Trends refreshes through the existing cloud-receive hook.

Added `scripts/trends-clarity-test.mjs` to the release suite. Browser coverage
checks both themes/viewports, split-day counting, legacy notes/markers, exclusive
context counts, incomplete answers, historical navigation, escaping, sync refresh,
and empty states. The full local release suite passed all 31 results with zero
failures/skips in about 88 seconds. Mobile/dark and desktop/light screenshots
were inspected. App asset token: `trends-clarity-1`.

The owner requested a shorter empty state and approved production release.
Periods without custody records now hide coverage, empty direction cards and the
context legend, leaving one message. Periods with custody but no changes retain
coverage and a factual no-change message, with no empty cards or legend.
Extended mobile/dark and desktop/light assertions cover both states.

## October 19, 2026 Reports clarity

Implemented the owner's requested Reports increment on `codex/reports-clarity`.
All five types use a shared inclusion selector; outputs identify type, period,
period records and included records separately. Custody statistics count family
dates and exclude legacy notes/unknown days. Both change directions retain
explicit incomplete context and unknown timestamps, with the displayed timezone
identified. Full diary marks not-logged dates as unknown custody; legacy notes
do not imply agreement or overnight location. Empty reports stay compact.

Preview/print use the same report body. Print totals and locked counts are scoped
to the selected period/type, cover names are escaped, and the signature attestation
remains. Collapsed help explains counting, screenshot references and CSV limits;
no CSV schema or screenshot packaging behavior changed. App token is
`reports-clarity-1`; no backend/schema change or production deployment.

Added `scripts/reports-clarity-test.mjs` to the release command, exercising all
five type counts, outside/future range exclusion, split-day statistics, context,
unknown timestamps, timezone labels, preview/print parity, escaped names, no
stored-entry mutation, compact empty output and both responsive themes. Inspected
mobile/dark and desktop/light screenshots. The first suite run found a stale
week-label smoke expectation and a Reports-help/Trends-legend class collision;
both were corrected. Final full local suite: 32 passed, zero failed/skipped,
about 90 seconds, with a 32-file build boundary pass.

## October 20, 2026 Unified Account Settings

The owner rejected separate Account and Cloud account concepts. Settings now has
one Account section containing profile fields, authenticated status, sync,
conflict review, restore, sign-out and deletion controls. Removed the duplicate
sign-in email field. The remaining email shows authenticated identity read-only
while signed in and accepts the sign-in address while signed out. Report email
recipients prefer the current authenticated identity, refreshed by sync/restore
and cleared by sign-out. Saving profile uses the displayed address; no Auth email
change API, schema migration, or acceptance restamping was introduced.

Retained sync disclosures in both sign-in states. Existing sync and deletion
logic/controls remain; no live account operations were performed. Added
`scripts/settings-account-test.mjs` for one-section/one-email structure, identity
and report-recipient consistency, read-only email, profile saving without policy
restamping, sign-out and signed-out sign-in in mobile/dark and desktop/light.
Updated the sign-in button test to use the unified field. Inspected both layouts.
App token is `unified-account-1`; this increment is not deployed.

The first full run caught the sync disclosure removed with the old heading;
restored it in both Account states. The final complete local suite passed all
33 results, zero failures/skips, in about 97 seconds; 32-file build boundary
passed. No production email, account, or data mutations were used.

## October 20, 2026 Authenticated Entry Follow-up

The owner clarified that signed-out users should land on welcome/login, with
Settings reserved for signed-in/offline returning users. Implemented startup and
navigation checks, verification before signup enters Today, matching-draft
continuation, immediate device-local sign-out with retained records, offline
continuity for previously authenticated devices, reconnect/session-loss checks,
and history/cross-tab/stale-response guards. Removed Settings sign-in controls.
Session persistence/refresh remains enabled; no provider session timeout changed.
See [authenticated entry](auth-required-entry.md) for behavior and limitations.

Added mocked entry tests and SDK logout/callback tests, and made older UI fixtures
explicit about authentication. The first full pass caught deletion-reload and
legacy local-profile fixture assumptions; both were corrected. The final complete
local suite passed all 34 results, zero failures/skips, in about 87 seconds, with
the 32-file build boundary passing. Offline shell/update, policy acceptance,
security, sync and responsive smoke checks passed. No live accounts/emails,
provider setting changes or production deployment were performed.
