# Custody Tracker TODO Notes

## Testing / Release Hygiene

- Before pushing UI changes, run:
  - `node scripts/contract-test.mjs`
  - `npm run test:smoke` once npm dependencies are installed

- The contract test catches missing inline handler functions, missing core screens, and missing CSS hooks.
- The browser smoke test covers Settings nav, check-in card styling, split-night absent kid defaults, Brief Visit review state, schedule-change context, Calendar selected-day state, Calendar metadata, screenshot previews, Reports preview/filter behavior, Calendar trends, custom parent/co-parent labels across Review, Saved, Calendar, and Reports, and long parent/child names without stale labels or horizontal overflow.
- Next testing improvement: make browser smoke testing part of a simple pre-push checklist or CI run.

## Calendar / Logging Follow-ups

- Product decision: only yesterday can be backfilled.
  Older empty days should remain read-only and show "Nothing logged" to preserve log credibility.

- Verified timestamps, change-context badges, screenshot previews, Reports stats, and exported metadata across Calendar details and Reports.
- Continue watching long-label copy in report cards. It now wraps safely, but very long configured names can still make report titles visually dense.

## Future Product Areas

- Review the current decision tree in `DECISION_TREE.md` and decide which strange paths should be simplified.
- Trends page still needs to be speced.
- Reports still needs to be speced.
- Settings still needs to be speced, including whether child profile fields should eventually include birthdays, nicknames, or display initials.
- Keep the bottom navigation visible on the Settings screen.

## Design Polish

- Do a full pass on better icons.
  This can happen near the end after the core flows are settled.
