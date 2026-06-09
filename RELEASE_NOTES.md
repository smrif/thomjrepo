# Release Notes

## June 9, 2026

- Pulled and repaired the latest check-in/reporting update after smoke testing found several regressions.
- Restored the calm card-based styling on the "What kind of day is it?" check-in screen.
- Fixed split-night absent-child location options so no location is preselected.
- Fixed the co-parent-day "Brief visit" path so Review & save becomes tappable.
- Restored Settings navigation and guarded removed setup fields so Settings no longer crashes.
- Wired missing schedule-change context, screenshot attachment, report filter, report print, and calendar color-class handlers.
- Updated empty calendar days to show "Nothing logged"; only yesterday can be backfilled from the calendar.
- Added a no-dependency contract test and a Playwright browser smoke test script to catch missing inline handlers and core flow regressions before pushing.
- Cleaned up remaining visible parent/co-parent labels in review, saved, calendar, log, and report copy so configured names show more consistently.
- Added smoke-test coverage for custom parent/co-parent labels across Review, Saved, Calendar, Trends, and Reports.
- Fixed stale label rendering after changing parent/co-parent names in Settings, including Calendar legend, report cards, and profile chips.
- Added long-name stress coverage and wrapping fixes for long parent/co-parent names and long child names.

## June 8, 2026

- Simplified the check-in decision tree so parents choose whose scheduled day it was during the daily flow instead of configuring a schedule up front.
- Updated the first check-in screens, Dad's day branch, review screen, and saved confirmation screen to the newer calm card-based UI.
- Finished moving the full decision-tree check-in flow, including co-parent day and Special Day branches, into the newer calm card-based UI.
- Replaced visible "week" language with "day" language across the updated check-in flow screens.
- Made more parent/co-parent labels render from setup configuration instead of hardcoded Mom/Dad copy.
- Removed the old planned-schedule setup fields and unused planned-schedule check screen.
- Fixed split-night location options so absent-child location choices no longer appear preselected.
- Removed the misleading "Log another day" action from the saved confirmation screen until date-specific logging exists.
- Refreshed the Calendar screen with Calendar / Trends tabs, color-based day states, cleaner day details, and demo preview mode for placeholder calendar data.
