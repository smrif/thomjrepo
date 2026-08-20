# Release Notes

## August 19, 2026

- Renamed the app experience from Custody Tracker to Whose Day across visible app copy, reports, documents, and share/feedback text.
- Added the new moodboard-driven visual direction as a shared `theme.css` layer with CSS custom properties for day, night, and legal-report modes.
- Self-hosted Fraunces, DM Sans, and Source Serif 4 font files so the PWA can keep the new typography offline.
- Added a Settings Appearance control for System, Light, and Dark theme testing.
- Updated the daily check-in, Home, Calendar, Diary, Logged/Saved, Settings, Reports, and Onboarding screens to the new cream/sage/night visual system.
- Improved Calendar deviation visibility with stronger changed-day treatment, clearer Trends flags, and refreshed calendar/report detail styling.
- Reworked Reports with legal-report styling, clearer report period pills, brighter dark-mode report icons, and inline SVG icons for each report type.
- Added an onboarding preview mode for safe first-run testing without overwriting saved local app data.
- Fixed dark-mode app-frame/background leaks across Home, Calendar, Reports, Settings, Onboarding, and check-in screens.
- Hardened check-in screen transitions so fast tapping cannot leave multiple decision screens visibly stacked.
- Expanded smoke coverage for themed frame backgrounds, onboarding preview, report icons, report preview, fast check-in transitions, single-child/two-child flows, and saved/logged confirmation.
- Verified the update with contract tests, browser smoke tests, static build checks, and broad light/dark visual audits across mobile and desktop preview widths.

## August 12, 2026

- Removed the Review step from the daily check-in flow so entries save directly from the final Details/notes screen.
- Updated the check-in progress header from four phases to three: Schedule, Kids, and Details.
- Removed the old Review screen markup, styling, and review-specific routing now that the Logged screen handles post-save editing.
- Updated the Logged screen primary action from `Back to today` to `Back to Home`.
- Added a lightweight success overlay with small confetti after a fresh entry is logged, with auto-dismiss behavior and reduced-motion support.
- Changed `Edit today` from the Home screen to reopen the saved entry at the Schedule step, with the saved day type selected, so users can adjust schedule, kids, or details from the top of the flow.
- Changed the Logged screen `Edit` action to also reopen the saved entry at the Schedule step instead of dropping users into the diary/details screen.
- Renamed the co-parent-day easy-flow internal continue button from review-oriented naming to continue-oriented naming.
- Updated weekly/report email sharing to use the email address saved in Settings instead of the prior hardcoded recipient.
- Expanded contract and browser smoke coverage for the removed Review screen, direct-save flow, success overlay, Logged/Home edit routes, and Settings email-based report sharing.
- Verified the update with the contract test and browser smoke test suite.

## August 7, 2026

- Added an alpha feedback button that opens the Whose Day Google Form in a new tab.
- Added an alpha notice during onboarding explaining that records are stored on-device during alpha, should be exported regularly, and are not legal advice.
- Added a Settings Data section with CSV export for local backups, including profile labels, children, dated entries, notes, change context, attachment details, timestamps, and missed/skipped flags.
- Added basic Terms of Use and Privacy Policy pages and wired the onboarding/settings agreement links to open them.
- Added a local `?reset=1` helper for clearing app storage during testing and returning to onboarding.
- Added a static build pipeline that copies the deployable app into `dist/`.
- Added Cloudflare Worker static-assets deployment configuration and npm build/deploy scripts for production hosting.
- Deployed the alpha build successfully through Cloudflare.
- Improved iPhone/Safari touch handling by expanding bottom navigation hit targets, adding mobile tap behavior hints, preserving native checkbox styling, and cache-busting the Safari touch stylesheet update.
- Verified the alpha updates with contract tests, browser smoke tests, static build checks, focused CSV export checks, and iPhone-sized bottom-nav hit target checks.

## August 5, 2026

- Removed the Special Day check-in path so pre-agreed schedule changes are recorded under either `My day` or `Co-parent's day`.
- Simplified the decision tree so parents first choose whose scheduled day it was, then choose whether the kids stayed with them or with the co-parent.
- Nested `I helped` / `co-parent helped` follow-ups under the appropriate custody-location branch instead of showing them as top-level custody outcomes.
- Replaced inconsistent numeric check-in progress indicators with stable phase labels: Schedule, Kids, Details, and Review.
- Updated schedule-change context screens to use the newer decision-card UI style.
- Removed overnight-only activity copy from helped flows where the help may have been daytime involvement.
- Added one-time home-screen personalization prompting on the third app session.
- Hid Weekly report on the home screen until at least two real days have been logged.
- Updated the home Today card so it changes from `Log today` to `Already logged` after today's entry is saved.
- Added an `Edit today` path that opens the populated Review screen for today's existing entry instead of starting a blank check-in.
- Tightened the Review and Logged screens so primary actions are easier to reach on mobile.
- Changed logged-entry summary copy from `Your week` / co-parent week language to day-based language.
- Improved Calendar changed-day visibility: actual custody stays represented by the main cell color, while changed days now get a stronger amber outline and corner marker.
- Fixed Calendar legend colors so `You`, `Co-parent`, and `Changed` match the cells shown in the calendar.
- Fixed single-child decision-tree pickers so redundant `one kid` shortcut buttons no longer appear.
- Expanded smoke coverage for the new nested decision tree, one-time prompts, Weekly report gating, Already logged / Edit today behavior, compact saved screen, calendar layout, and single-child picker states.
- Verified the update with contract tests and the browser smoke test suite.

## June 26, 2026

- Added directional slide transitions across the daily check-in decision flow, with forward screens sliding in from the right and back navigation reversing direction.
- Added cache-busted asset versions for recent UI updates so local browsers reliably pick up changed JavaScript and CSS.
- Reworked the Review screen into a clearer confirmation receipt with grouped Schedule, Kids & involvement, Change context, and Notes sections.
- Moved the timestamp/read-only reassurance below the Review actions and restyled it as a quiet footnote.
- Polished the Saved confirmation screen with a logged date, compact receipt details, Calendar and Reports follow-up actions, and a final Edit option inside the logged card.
- Fixed the co-parent-day helped activity route so it opens the correct activity screen.
- Added single-child check-in logic that skips the redundant "all kids home?" screen and goes straight to confirmation when the user has one child.
- Fixed single-child Back navigation so the confirmation screen returns to the previous meaningful step instead of the skipped "all kids home?" screen.
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
