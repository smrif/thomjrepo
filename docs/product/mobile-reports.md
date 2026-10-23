# Account reports and native exports — October 23, 2026

The account entry now connects the five existing report types and all/30/60/90-day
filters to verified account records. It reuses the website's content, coverage,
family-date counts, context, note/history and attachment-reference rules. Shared
`reportDocument()` and `allDataCsv()` builders feed both browser and mobile export
adapters; website printing/downloading remains supported. Production is unchanged.

## Connected actions

- Reports navigation, saved-screen report access and the home report shortcut.
  Native home/Sunday actions open report review; they do not launch an email.
- Preview and Copy use the selected type/period. Native Copy uses the OS clipboard;
  browser review uses its clipboard API and reports failure without losing records.
- Save PDF uses a locally generated, paginated native PDF and the system Files/
  document picker. Share PDF prepares the same document and opens the native
  share sheet. A closed chooser is not claimed as recipient delivery.
- Settings → Data & export saves or shares the complete CSV, including full note
  content, historical names and attachment data URLs. This is all stored records,
  independently of the selected report period. It is not a JSON restore file or
  an attachment-file package. Browser review downloads CSV and uses its print
  dialog for PDF; native share actions stay informational there.

Opening Reports applies the latest verified cached profile. Downloads pause while
reviewing reports. The exporter captures account/data/type/range/text and checks
it before and after every async file/clipboard/destination boundary. A changed
snapshot requires reviewing a refreshed preview; file generation cannot silently
continue into another account. No export changes the records or imports credentials.

## Native file behavior

PDFs include the shared document metadata, exact selected report content, and the
existing unsigned attestation/signature section. There is no automatic signature
or independent verification of entries. The signature section begins on its own
page, and every page has an app/page footer. Reports reference attachments; PDF
images are not embedded, matching the website report. JSON backups retain images.

Both platforms use bounded native layout and explicit failure when content cannot
fit or finish; there is no silent truncation. Report text is limited to 1 MB UTF-8,
CSV to 25 MB, prepared files to 25 MB and PDFs to 1,000 pages. Choose a shorter
report period or use JSON backup when a limit is reached. iOS uses CoreText with
an explicit per-page text transform; Android uses StaticLayout and full-line
pagination. Prepared text files are read back before returning their URI.

Files are created in unique, account-namespaced app-private temporary/cache
folders. New exports do not delete an older file that a share destination may
still be reading. Files-picker saves/cancellation are distinct from file creation;
iOS removes the exported temporary source after the picker finishes. Share cache
files can remain until OS/cache cleanup. These are not password-protected exports.
No external recipient is contacted in automated QA.

## First QA pass

- Final regression pass: all mobile UI suites (shell, check-in, accounts, sync,
  Settings, backup and reports) and all 49 repository local release checks pass.
  No deployment, new email or live-account operation was part of these checks.

- 73 mobile unit/contract checks passed, including export sequencing, cancellation,
  failure, account/record/filter changes at async boundaries, full clipboard text
  and UTF-8 bounds. No successful delivery is inferred from preparation alone.
- Phone browser report walkthroughs passed at 390px and 320px: all five types,
  filter/count parity, complete long notes, shared-help labels, keyboard selection,
  pressed states, 44px controls, copy/failure, print-document parity, CSV/images,
  offline reopen and account isolation. Website report clarity checks pass too.
- Signed iOS 17.5 simulator generated all five report PDFs and exact CSV bytes.
  The synthetic reports contain long notes and Japanese text; PDFs are 4–8 pages
  each. `verify-report-pdfs.py` checks complete text using Unicode NFKC/whitespace
  normalization, every text transform, page footers and an intact final signature
  page. All 29 final rendered pages were visually inspected. Visual QA found and fixed
  reflected text on later pages, orphaned signature lines and a blank page
  before the Notes signature.
- The report-integrated iOS increment also passed account/Settings/pending-sync/sign-out and
  backup/atomic-rollback/restart probes. All scopes are synthetic; no sign-in email
  or live-account operation was needed.
- Android debug build/lint and native process-restart reports probe pass. All
  five PDFs (29 total pages) pass the same content/orientation/signature/no-empty-
  page checks and visual rendering. QA caught/fixed duplicated invisible text
  from clipping the whole layout. One cold emulator launch stalled before
  account startup; restart/retry and the final fresh-install probe passed.
- Actual AOSP emulator Downloads PDF/CSV saves and cancellations pass; saved PDF
  text matches and all eight CSV records/notes/images are intact. The real
  share sheet opens and cancels cleanly without choosing a recipient. These
  checks do not establish iPhone/iCloud or recipient-app delivery.
- iOS 17.5 native UI tests pass real PDF/CSV Files cancellation, CSV swipe
  dismissal and PDF/CSV share-sheet closure without selecting recipients.
  The complete diary report is unchanged afterward. Both native UI cases pass
  together; see [native Files/share QA](mobile-native-file-qa.md).

Reproduce with `pnpm --dir mobile test:reports`, `node scripts/reports-clarity-test.mjs`,
`pnpm --dir mobile probe:reports:ios SIMULATOR_UUID`, or
`pnpm --dir mobile probe:reports:android emulator-5554`. After native generation,
run the bundled Python interpreter with `mobile/scripts/verify-report-pdfs.py`
(and optionally the Android output directory). Render all PDFs with Poppler and
inspect them. Evidence is ignored under `mobile/.build/reports/` and the native
probe JSON files.

Physical iPhone Files/share/clipboard destinations, interruption and VoiceOver are
tracked in [owner QA](mobile-owner-qa.md). Physical iPhone provisioning, real auth
handoff/sync, deletion activation and App Store approval remain separate gates.
