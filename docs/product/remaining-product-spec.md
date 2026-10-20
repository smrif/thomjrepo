# Trends, Reports, and Settings: Remaining Product Specification

Prepared October 13, 2026 from the current app. The owner approved the first
Trends clarity increment October 19 and subsequently approved its production
release with a compact empty state. Other proposed additions remain a reviewable draft.

The owner approved Reports clarity October 19. The local implementation shares
record selection across output and print totals, labels period totals and type
inclusion separately, counts custody by family date, preserves missing context
and timestamps, states the display timezone, and explains attachment/CSV limits.
It retains all five report types and the signature attestation. The owner approved
the increment, and it was deployed October 20, 2026; see
`docs/backend/deployment-2026-10-20.md`.

## Existing foundation

| Area | Already implemented | Remaining design/build work |
| --- | --- | --- |
| Onboarding | Welcome, demo, parent/child names, shared activities, email sign-in, explicit policy acceptance | Optional reason-for-use question and any adaptive home experience require a product decision. |
| Trends | Calendar subtab, month/rolling/all-time filters, custody/help counts; October 19 local increment adds both change directions, coverage, context labels and Calendar links | Optional time-series charts and child breakdown. |
| Reports | Five report types, period filters, statistics, preview, copy/email/print, metadata and attestation; October 19 local increment adds period/type scope, family-date definitions, coverage, attachment limits and neutral day wording | Review/release the clarity increment; future export packaging remains separate scope. |
| Settings | Profile/co-parent/child editing, appearance, cloud sync/restore/conflicts/deletion, CSV export, policy review, bottom navigation | Clarify editable email purpose, activity editing, export limitations, and optional future preferences. |

## Shared counting and date rules

1. A recorded date is one family-level record, not a count of children or hours.
   Do not describe a two-child split night as two full days of custody.
2. Scheduled parent is the user's answer for that date. There is no configured
   custody calendar, inferred holiday schedule, or automatic entitlement count.
3. A missing record or `not-logged` marker is unknown, never proof that custody
   followed the schedule. A legacy `other` note does not establish overnight location.
4. Rolling N-day filters include today and the previous N-1 dates in the viewer's
   local calendar, exclude future dates, and use the entry date rather than sync
   or save time. Month filters select the named month; all-time shows stored history.
5. Show both schedule-change directions separately. Agreed, felt pressured,
   unexpected, and context not recorded are descriptions of user-reported context.
6. Summaries should identify incomplete information. Do not silently classify old
   records with absent context fields as agreed, or interpret no entries as no changes.
7. Entries contain user-entered information and device timestamps. Avoid promises
   of independent verification, guaranteed court acceptance, or immutable evidence.

## Trends proposal

Goal: let a user understand their recorded pattern and open the underlying dates.
Keep Trends within Calendar for now; no new navigation destination is required.

Recommended first increment:

Implemented October 19, 2026 at the owner's request. Empty periods show one short
message; empty direction cards and the context legend are hidden when irrelevant.
Context categories
are exclusive: pressure takes precedence, explicit non-agreement is unexpected,
agreement with explicit no-pressure is agreed, and incomplete answers remain
unknown. Coverage counts recognized custody-flow records separately from
not-logged markers and other/legacy notes. No coverage percentage is inferred.

- Retain existing filters and four overview cards; use day-based wording throughout.
- Add a coverage line: qualifying custody records, explicit not-logged markers,
  and other/legacy notes in the selected window. Explain that unrecorded dates
  have unknown custody; a percentage needs a separately defined eligible period.
- Give each schedule-change direction its own list with date, named children,
  context badge, and a link to the existing day detail.
- Include an explicit “Context not recorded” badge for legacy records.
- Use factual empty states: “No recorded schedule changes in this period” and
  “No custody records in this period” describe different situations.

Later chart increment, after counting semantics are approved:

- Monthly bars for recorded scheduled/actual presence; split nights must be
  explicitly represented, not converted into inferred full-child nights.
- Context counts over months in both directions; show counts and coverage together.
- Accessible data table and date links alongside charts, with text labels rather
  than color alone. Do not interpolate across missing months as known zero custody.
- Per-child charts need a historical identity strategy before implementation:
  stored records currently identify children by display name, which can be renamed.

Acceptance examples: one date with two children counts as one family date; a
split date remains inspectable; an old deviation with no context is unclassified;
no-data periods differ from zero-deviation periods; all summaries update on sync.

## Reports proposal

Goal: produce a clear, traceable summary of the selected records.

- Keep the five existing types: custody deviations, actual time with kids,
  co-parent day, full diary, and diary notes.
- Show selected period and report type beside preview and in generated output.
  Distinguish records selected by period from records included by report type.
- Define each statistic visibly: family dates, recorded deviations in either
  direction, user-reported pressure flags, and records with screenshots.
- Include both scheduled-day directions in a deviation report and preserve
  unknown context. Use “scheduled day” rather than “week” for a per-date record.
- Preserve entry date, logged timestamp, context and notes without implying a
  timestamp proves when an event occurred. State which timezone is displayed.
- Explain export boundaries: the existing CSV includes attachment details;
  it is not a complete restorable JSON backup or a package of screenshot files.
- Preserve preview/print consistency, text wrapping, empty-state clarity, and
  the existing attestation. Mailto sharing relies on the user's mail application.

Acceptance examples: filtering excludes the preceding date at local midnight
and noon consistently; preview and print include the same records; names and
notes containing punctuation remain readable; missing timestamps are labeled
unknown; exporting does not edit, lock, or sync an entry as a side effect.

## Settings proposal

Goal: make saved profile changes, account identity, cloud state, and exports clear.

- Keep bottom navigation visible for returning-user Settings. First-run setup
  remains a distinct flow with its own progression.
- Owner decision October 20: show one Account section and one email, rather than
  separate account/cloud-account concepts. The signed-in email is read-only and
  used for report sharing. Subsequent owner direction moves signed-out users to
  welcome/login rather than Settings; previously signed-in devices retain offline
  access. Saving profile changes does not change Auth identity or restamp policy
  acceptance. See `docs/backend/auth-required-entry.md`.
- Keep child display-name editing; birthdays/nicknames/initials are optional future
  fields requiring a need and historical-identity plan. Do not collect them by default.
- Add shared-activity editing using the onboarding activity model when approved;
  preserve old entry activity identifiers/labels. Per-child lists are later scope.
- Retain automatic sync status, conflict review, retry/restore actions, and deletion
  confirmation. Deletion copy must explain retained local records and exports.
- Label CSV export accurately. A restorable export/import format needs a separate
  versioned schema, attachment strategy, validation and conflict/import design.
- Keep appearance options and explicit policy-review behavior. Show reminders
  or biometric settings only once the corresponding functionality exists.

Acceptance examples: the signed-in email cannot be edited as a profile field;
sign-out returns to welcome and remains effective after reload; changing a
child display name does not rewrite historical entries; failed profile save
preserves form input; local export works offline; long names do not hide navigation.

## Decisions reserved for the owner

- Whether to add reason-for-use personalization, real reminders, an entry PIN,
  biometric gating, or read-only sharing.
- Chart priorities and how to present family dates versus per-child custody.
- Historical child identity, restorable backup format, and new optional fields.
- Any claims about legal use and final policy wording.

Do not build custody schedule configuration: the existing product decision is
to ask whose scheduled day it was during each check-in.
