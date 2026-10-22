# Signup and Check-in Funnels

Prepared October 21, 2026. Owner chose Mixpanel and supplied the public project
token; project `899617` settings confirm US residency and US/Pacific timezone.
The token matches the selected project. App implementation remains local and
has not been deployed. A synthetic 49-event sequence labeled `environment=qa`
was accepted by Mixpanel's API to verify ingestion and populate event names.

Saved board: [Whose Day — Signup and Check-in](https://mixpanel.com/project/899617/view/2590983/app/boards#id=11602424).
It contains a per-step started/completed report (hold `visit_id`, breakdown by
`step`) and an overall flow completion report (hold `flow_id`, breakdown by
`flow`). Both use total conversions, a one-day window, first-step attribution,
and `environment=production`, excluding all setup events. The account's existing
five-report-per-user/project limit was respected; no upgrade was selected.

Verification: all 48 local release results passed with zero failures/skips in
about 108 seconds. Final focused analytics unit and mobile/desktop browser
reruns passed after adding the fixed environment property. The browser tests
intercept all requests and cover real signup validation/backtracking, email-link
versus verified completion, real check-in save, excluded private inputs and
Settings opt-out. Saved reports `93544743` and `93544777` were visibly confirmed
on board `11602424`; both show zero production data as expected. Screenshot:
`/private/tmp/whose-day-mixpanel-board.jpg`.

## Event contract

| Event | Meaning |
| --- | --- |
| Flow Started | New signup or check-in attempt begins. |
| Step Started | A particular step visit becomes visible. Repeated per-child screens use new visit IDs without child identity or child index. |
| Step Completed | Forward navigation accepted the step, the next repeated item was reached, or the final save/verified-signup completion succeeded. A back click, invalid form, or leaving the workflow does not complete the step. |
| Step Back | Navigation returns to an earlier step. The departing visit is not completed. |
| Flow Exited | User explicitly navigates out with an unfinished active step. Closing a tab is not guaranteed to produce an exit event; infer dropoff from lack of subsequent completion. |
| Signup Link Requested / Sent / Failed | Signup link API attempt and outcome. Sent means the provider accepted the request, not inbox delivery or account verification. Failure sends no raw provider message. |
| Signup Verified | A verified session matches this browser's pending signup email. Once per attempt. No email or Auth ID is transmitted. |
| Flow Completed | Verified signup reaches the app, or a check-in was read back successfully after local save. Local completion does not assert cloud sync succeeded. |

Properties: `schema_version`, fixed `environment=production`, `flow` (`signup`/`checkin`), random `flow_id`,
`step`, random `visit_id`, and elapsed `duration_ms` for completed visits.
Mixpanel delivery properties add project token, random browser `distinct_id`,
event timestamp, and stable retry `$insert_id`. No URLs/referrers, names/emails,
Auth IDs/tokens, answers, dates being logged, notes, attachments, reports, counts
of children, or selected activities are serialized. Elapsed duration includes
time the tab is in the background; it is not an attention measurement.

The identity is a pseudonymous browser identity, not an authenticated person.
Same-browser email-link tabs share signup context; another browser/device cannot
be stitched to it. Clearing storage or opting out resets that identity. Shared
browsers can include more than one person. Do not label unique browser counts as
unique accounts or promise cross-device signup attribution.

## Step dictionary

Signup: `name`, `coparent`, `children`, `email_agreement`, `email_verification`.
The unused legacy `child_count` screen is mapped if ever displayed; it is not
an expected funnel step in the current flow. Skipping optional co-parent input
is a completed transition, without sending whether a value was entered.

| Check-in step | App screen |
| --- | --- |
| schedule | s-week |
| overnight_a / overnight_b | s-dad-mode / s-mom-mode |
| all_children | s-allkids (automatically bypassed for one child) |
| children_a | s-whichkids |
| location | s-absent (repeats) |
| children_b | s-mom-helped-kids |
| activities_a | s-mom-helped-activity (repeats) |
| children_c | s-dad-wk-mom-had |
| help_question_b | s-mom-easy |
| activities_b | s-helped-activity (repeats) |
| children_d | s-mom-dad-had |
| help_question_a | s-dad-help-choice |
| context / context_followup | s-change-context, including its conditional follow-up question |
| notes | s-diary |

Step identifiers do not encode answers, but screen reachability can imply which
parts of the custody workflow were used. Treat the analytics dataset as sensitive
product-usage data with limited access; no claim of fully anonymous data is made.

## Reports to save in Mixpanel

1. **Signup to verified access:** `Flow Started` filtered to signup → `Step
   Completed` name → coparent → children → email_agreement → `Signup Link Sent`
   → `Signup Verified` → `Flow Completed`. Use a 24-hour conversion window and
   hold `flow_id` constant. Do not require the legacy child-count screen.
2. **Signup step conversion:** `Step Started` → `Step Completed`, filter signup,
   hold `visit_id` constant and break down by `step`. This distinguishes a
   viewed form from a valid forward submission, including repeated visits.
3. **Check-in completion:** `Flow Started` → `Flow Completed`, filter checkin,
   hold `flow_id` constant, use a one-hour conversion window initially.
4. **Check-in step conversion:** `Step Started` → `Step Completed`, filter
   checkin, hold `visit_id` constant and break down by `step`. Review volume as
   well as completion rates; repeated per-child visits count separately.
5. **Branch funnels:** build separate funnels from the actual step dictionary.
   Do not force all steps into one linear check-in funnel: branches and
   automatically bypassed screens would look like false dropoffs.

Counts are browser/attempt-based. Use total conversions and hold-constant
properties for attempt analysis rather than assuming the default unique-user
count measures every nightly attempt. Backtracking generates new step visits.
Compare step rates with event volume and inspect sample synthetic sequences
before interpreting beta dropoff percentages.

## Delivery and user choice

Explicit requests use Mixpanel's Track API, bypassing SDK default page/referrer
metadata and autocapture. No session replay or People profiles. US/EU/IN endpoints
are allowlisted; configuration selects US. `ip=0`, omitted credentials, and
`no-referrer` prevent IP enrichment and URL/header leakage from the application;
the receiving service necessarily sees network traffic. This is not a claim that
IP never reaches Mixpanel infrastructure.

Local queues hold at most 200 events, discard events older than four days, send
up to 50 per request, and retry with capped exponential delay and the same event
IDs. Analytics failure never blocks signup, save, navigation or authentication.
The source event times are retained on retries. Flow context expires after 24
hours. Browser crashes, storage loss/limits, blocking software and opt-out can
lose analytics; event collection is best effort, not an accounting ledger.

Only the canonical/legacy HTTPS production hosts can send. Local/file previews,
demo/preview queries, browser GPC/DNT signals and local opt-out suppress collection.
The welcome footer and Settings provide the same browser-local opt-out control.
Opt-out clears queued data and browser identifiers; it does not delete historical
Mixpanel events. No analytics state is included in JSON backups or cloud profiles.

## Expanded usage instrumentation

Verification: the final full release rerun passed all 48 results with zero
failures/skips in about 102 seconds. Focused analytics tests additionally passed
after final view-deduplication and failure-isolation changes. Browser coverage
includes actual CSV/JSON downloads and restore, missed-check-in log/skip actions,
server-mocked failed/successful deletion, enum properties, background-refresh
exclusion and privacy controls at mobile/dark and desktop/light. Older isolated
function harnesses were updated for their analytics dependencies. A synthetic
deletion test was corrected to wait for the Settings authentication check before
invoking deletion. No real deletion, email or additional live analytics was sent.

Added Today/Calendar/Reports/Settings views, selected-day views (today/record/empty
only), Trends views and changed presets, report generation/filter/print/share/copy,
CSV/JSON export attempts and download requests, JSON restore preview/apply outcomes,
custom activity additions (draft chips, without labels), deletion attempts and
confirmed server outcomes, weekly email-composer requests, missed-check-in prompt
views and log/skip actions, and locally first/repeat successful check-in saves.

Sign-in link and verification health uses category-only errors; a verified session
whose profile restoration fails is recorded as Account Restore Failed rather
than a verification failure. Sync records one failure per episode and one recovery,
with no successful-background-poll events. Conflict views are recorded only when
the review screen is visible; resolutions send device/cloud choice only.

All usage properties have per-event enum allowlists. Report type is one of
`full`, `dadactual`, `honest`, `momsweek`, `notes`; ranges are preset codes
`all`, `month`, `30`, `60`, `90` as applicable. No arbitrary text, dates, record
counts, child counts, selected activities or error messages are accepted.
Only `showDetail(..., {reveal:true})` generates a record-view event; background
sync rerenders do not. Page views reflect navigation/reopening, not every render.

Export Download Requested means the file was prepared and the browser download
was triggered. It does not establish a filesystem write. Report Share Requested
distinguishes native sharing from the email composer and does not establish
delivery. Account Deletion Completed is emitted immediately after the backend
confirms deletion, before local UI cleanup; later UI failures do not relabel a
successful server deletion as failed. No live deletions are used in tests.

Suggested additional Insights: feature adoption by event, report generation by
type/range, and failure counts by sanitized category. Existing saved funnels still
exclude QA events; this increment sends no additional live setup events or changes
to report/plan/sharing settings. The published v2 policy covers this scope.

## Publication and remaining follow-up

- Owner authorized deployment October 21. Published analytics and the
  `2026-10-21-v2` Privacy Policy as Worker
  `944f08c4-252f-4e8f-a3b5-81e37ae5fb6a`. Earlier October 13/21 snapshots
  remain untouched. No automatic re-consent or acceptance migration is enabled.
- Residency is verified. Confirm the project's retention window, access list and
  deletion process separately; no retention or sharing settings were changed.
- The two core reports are saved and synthetic API acceptance is verified.
  Production reports are empty until the app is released and eligible
  browser traffic arrives. The longer signup funnel and branch recipes above are
  optional additional reports, not claims of already saved reports.
- Any live verification should use synthetic data and be identified/excluded
  from the production funnel period. Local tests intercept all tracking requests.

References checked October 21:
[Mixpanel Track API](https://docs.mixpanel.com/reference/track-event),
[JavaScript SDK defaults and options](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript).
