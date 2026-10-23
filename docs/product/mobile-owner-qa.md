# iOS owner QA and decisions

Updated October 23, 2026. The owner asked Codex to continue implementation while
away, run a first QA pass and collect checks requiring owner help. Keep this list
current as each increment finishes. Local/synthetic results do not substitute for
physical-device, real-provider, real-account or owner judgment checks.

| ID | Deferred check and owner action | Expected evidence | First pass / status |
| --- | --- | --- | --- |
| IOS-QA-01 | Resolve the Apple Developer account restriction with Apple Support, then install the signed test build on an iPhone. | Build installs and launches; app identity/team/signing confirmed. | Simulator build/restart passes. Physical installation remains blocked by the last-recorded account restriction. No enrollment/purchase performed. |
| IOS-QA-02 | Finish a fresh sign-in email link on the physical iPhone and return through Safari without replaying the callback. | Correct account opens, survives termination, signs out durably and cannot reopen the old session. | Prior simulator code exchange and Keychain checks passed; uninterrupted Safari return and physical handoff remain. New test emails remain deferred. |
| IOS-QA-03 | Using approved test identities, check two physical devices through offline edit/reopen, reconnect and both conflict choices. | Same-account convergence, explicit divergence review, no cross-account records. | Two-device browser and synthetic native persistence/checkpoint tests pass. Real authenticated sync through the full account entry remains pending. |
| IOS-QA-04 | Save a JSON backup to a chosen Files provider; cancel once, then choose the saved file and restore selected records/profile. | File exists in the selected destination; cancel changes nothing; notes/images restore and survive offline reopen. Repeat with a damaged/wrong-account file. | Browser export/import, atomic rollback and refusal tests pass; iOS file codec/SQLite restart probe passes. Native iOS picker cancellation passes; simulator-local JSON save/re-selection, checksum/account preview and unchanged-record checks pass. Physical/provider behavior remains. |
| IOS-QA-05 | Review Settings and offline policies with the iPhone keyboard, larger accessibility text and VoiceOver; select a real synthetic photo. | Controls remain reachable and labeled; back/navigation/drafts work; image survives save/restart and export boundaries are clear. | Phone-width browser Settings/check-in tests pass. Offline policy text/draft/return tests and signed iOS reader markers pass. 87 local control-label/44px/clipping/enlarged-text checkpoints pass; fixes cover custom activity, Account sizing, tab overlap and Settings wrapping. Device keyboard/VoiceOver/photo-picker checks remain. |
| IOS-QA-06 | Save/share each PDF type and CSV to an actual destination app/provider, cancel each sheet once, and inspect a long Unicode report. | Correct account/period/content, every page present and legible; no false success on cancellation; recipient app receives the chosen file. | Five report types, phone flows, async account guards, native iOS/Android PDF/CSV and full text/render checks passed. Android Downloads save/cancel and share-sheet cancellation passed. Native iOS PDF/CSV save/share cancellation (including swipe dismissal) also passes. Visual QA caught/fixed later-page reflection and split signature sections. No recipients are contacted by automated QA. |
| IOS-QA-07 | Configure the separate test deletion service with the test server secret entered directly into its encrypted worker binding; separately approve a disposable identity and permanent deletion. | Correct exact account deleted, old session denied, separate account retained; uncertain outcome stays gated. | Synthetic service/ownership, two-device deletion, rejection/lost-response tests pass. Live service/secret and irreversible disposable QA remain pending. |
| IOS-QA-08 | Review final app name, bundle identifier, developer team, support/policy links, listing copy, privacy answers and release screenshots. | Owner-approved identity/listing and disclosures matching the actual release behavior. | Current identifier is the feasibility identifier; no TestFlight or App Store release exists. The native test profile still forces acceptance false; final registration/acceptance wiring needs the release contract. Draft listing/data inventory and screenshot/review plan are in [release preparation](mobile-release-preparation.md). Owner/legal decisions remain separate. |

## Codex first-pass record

- Offline policies: complete current versioned text, internal links, source focus/
  drafts, offline reopen and unchanged records/acceptance pass. Signed iOS reader
  markers are present in both restart phases.

- Native Files/sharing: a separate simulator-only XCTest runner exercises actual
  iOS PDF/CSV/JSON chooser cancellations and unchanged-report checks. Local JSON
  save/re-selection and checksum/account preview pass with eight records and one
  screenshot; cancelling preview preserves the complete diary report. Physical/
  provider delivery checks still need an iPhone. See
  [native Files evidence](mobile-native-file-qa.md).

- Accessibility/layout: 87 checkpoints across 320px/390px/landscape, keyboard
  report selection and enlarged text pass. Field labeling and clipping/overlap
  fixes are documented in [accessibility QA](mobile-accessibility-qa.md). Native
  VoiceOver/Dynamic Type and actual keyboard behavior still need an iPhone.

- Settings: 390px/320px controls, failures/retry, history preservation, offline
  reopening, profile conflicts and account separation passed. Signed iOS 17.5
  Settings/profile/theme recovery passed.
- Backup/restore: shared checksum/project/account checks, preview/cancel,
  read-only history, injected transaction failure, uncertain committed response
  and reopen/recovery passed. Signed iOS file/SQLite rollback/restart probe passed.
- Reports/PDF/CSV: five types and filters, long notes, image CSV, account switches,
  offline reopen, copy/failure and print parity passed at both phone widths.
  iOS and Android each generated all five PDFs; 29 final pages per platform were
  checked, with text/orientation/blank-page regressions fixed. Android Downloads
  saves/cancels and share cancellation passed without selecting recipients.
  Physical/provider/recipient delivery remains unverified; see
  [report evidence](mobile-reports.md).

See the central [owner QA queue](../backend/owner-qa.md) for existing website,
account-deletion, policy, provider-retention and domain-transition approvals.
No duplicate disposable identity should be created to bypass those approvals.
