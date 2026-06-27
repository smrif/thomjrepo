# Release Notes

## June 26, 2026

- Added directional slide transitions across the daily check-in decision flow, with forward screens sliding in from the right and back navigation reversing direction.
- Added cache-busted asset versions for recent UI updates so local browsers reliably pick up changed JavaScript and CSS.
- Reworked the Review screen into a clearer confirmation receipt with grouped Schedule, Kids & involvement, Change context, and Notes sections.
- Moved the timestamp/read-only reassurance below the Review actions and restyled it as a quiet footnote.
- Polished the Saved confirmation screen with a logged date, compact receipt details, Calendar and Reports follow-up actions, and a final Edit option inside the logged card.
- Fixed the co-parent-day helped activity route so it opens the correct activity screen.
- Added single-child check-in logic that skips the redundant "all kids home?" screen and goes straight to confirmation when the user has one child.
- Verified the updated flows with contract tests, browser smoke tests, and focused Playwright checks for transitions, review rendering, saved confirmation, final edit, and the single-child skip.

## June 15, 2026

- Redesigned returning-user Settings into clearer Account, Co-parent, Children, and Common activities sections.
- Moved activities out of per-child configuration and into one shared Common activities list that applies to every child.
- Replaced activity emoji labels with cleaner line-style activity cards, selected states, and a custom activity input.
- Changed Children settings from crowded inline fields to compact child rows with a focused child profile editor modal.
- Fixed child profile modal action alignment so Remove and Done sit cleanly together.
- Updated onboarding Step 1 to focus only on the user display name and removed confusing Dad / Mom / Parent shortcut chips.
- Updated onboarding Step 2 copy for the other parent name or label and removed Mom / Dad / Co-parent shortcut chips.
- Clarified onboarding Step 4 to ask for kids' first names, show one field by default, and preserve adding another child.
- Added trim/required-field guards for onboarding name and child-name steps before advancing.
- Replaced the final intro promise card with "Lawyer-ready records" and a neutral file-check line icon.
- Expanded browser smoke coverage for Settings navigation, shared activity behavior, child-row rendering, onboarding copy, removed shortcut chips, add-child behavior, and the updated intro promise card.
- Updated design QA notes for the Settings redesign and refreshed the testing TODO notes.

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
- Replaced comma-separated child setup with explicit child-name fields and an Add another child action.
- Simplified the Calendar legend to a single-row state key: You, Co-parent, Changed, and Special.
- Added a local June demo preview hook at `?demo=june` for reviewing populated Calendar states.
- Fixed Calendar selected-day state so tapping a previous day moves the dark outline off today's date.
- Changed compact Calendar/log labels from `wk` to `day` for day-specific notes.
- Added shareable PNG/JPEG decision-tree exports plus a local renderer script for future updates.

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
