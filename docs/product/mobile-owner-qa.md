# iOS owner QA and decisions

Updated October 26, 2026. The owner asked Codex to continue implementation while
away, run a first QA pass and collect checks requiring owner help. Keep this list
current as each increment finishes. Local/synthetic results do not substitute for
physical-device, real-provider, real-account or owner judgment checks.

| ID | Deferred check and owner action | Expected evidence | First pass / status |
| --- | --- | --- | --- |
| IOS-QA-01 | Resolve the Apple Developer account restriction with Apple Support, then install the signed test build on an iPhone. | Build installs and launches; app identity/team/signing confirmed. | Simulator build/restart passes. Owner reconfirmed October 23 that they are still waiting on Apple; physical installation remains pending. No enrollment/purchase performed. |
| IOS-QA-02 | Finish a fresh sign-in email link on the physical iPhone and return through Safari without replaying the callback. | Correct account opens, survives termination, signs out durably and cannot reopen the old session. | Prior simulator code exchange and Keychain checks passed; uninterrupted Safari return and physical handoff remain. New test emails remain deferred. |
| IOS-QA-03 | Using approved test identities, check two physical devices through offline edit/reopen, reconnect and both conflict choices. | Same-account convergence, explicit divergence review, no cross-account records. | Two-device browser and synthetic native persistence/checkpoint tests pass. Real authenticated sync through the full account entry remains pending. |
| IOS-QA-04 | Save a JSON backup to a chosen Files provider; cancel once, then choose the saved file and restore selected records/profile. | File exists in the selected destination; cancel changes nothing; notes/images restore and survive offline reopen. Repeat with a damaged/wrong-account file. | Browser export/import, atomic rollback and refusal tests pass; iOS file codec/SQLite restart probe passes. Native iOS picker cancellation passes; simulator-local JSON save/re-selection, checksum/account preview and unchanged-record checks pass. Physical/provider behavior remains. |
| IOS-QA-05 | Review Settings and offline policies with the iPhone keyboard, larger accessibility text and VoiceOver; select a real synthetic photo. | Controls remain reachable and labeled; back/navigation/drafts work; image survives save/restart and export boundaries are clear. | Phone-width browser Settings/check-in tests pass. Offline policy text/draft/return tests and signed iOS reader markers pass. 87 local control-label/44px/clipping/enlarged-text checkpoints pass; fixes cover custom activity, Account sizing, tab overlap and Settings wrapping. Native system-picker selection/save/reopen passes with library access denied; physical photo/provider, keyboard and VoiceOver checks remain. |
| IOS-QA-06 | Save/share each PDF type and CSV to an actual destination app/provider, cancel each sheet once, and inspect a long Unicode report. | Correct account/period/content, every page present and legible; no false success on cancellation; recipient app receives the chosen file. | Five report types, phone flows, async account guards, native iOS/Android PDF/CSV and full text/render checks passed. Android Downloads save/cancel and share-sheet cancellation passed. Native iOS PDF/CSV save/share cancellation (including swipe dismissal) also passes. Visual QA caught/fixed later-page reflection and split signature sections. No recipients are contacted by automated QA. |
| IOS-QA-07 | Configure the separate test deletion service with the test server secret entered directly into its encrypted worker binding; separately approve a disposable identity and permanent deletion. | Correct exact account deleted, old session denied, separate account retained; uncertain outcome stays gated. | Synthetic service/ownership, two-device deletion, rejection/lost-response tests pass. Live service/secret and irreversible disposable QA remain pending. |
| IOS-QA-08 | Review final app name, bundle identifier, developer team, support/policy links, listing copy, privacy answers and release screenshots. | Owner-approved identity/listing and disclosures matching the actual release behavior. | Current identifier is the feasibility identifier; no TestFlight or App Store release exists. Guided onboarding records a separate explicit local receipt; production/server acceptance integration still needs the release contract. Draft listing/data inventory and screenshot/review plan are in [release preparation](mobile-release-preparation.md). Owner/legal decisions remain separate. |
| IOS-QA-09 | Approve a fresh test signup/email when ready, then check unfinished setup, email return, expired/duplicate links and completed-account reopen on an iPhone. | Correct verified email receives its own setup/receipt; existing accounts restore without overwritten names or inferred agreement; keyboard and VoiceOver remain usable. | Guided browser/atomic storage tests pass with synthetic data. Native WebView form, unfinished draft, pending-verification termination, explicit receipt and cold reopen pass with synthetic verification. No fresh emails, live identity creation or production acceptance writes were performed. |
| IOS-QA-10 | Separately approve a fresh test signup for actual server receipt/email-return recovery QA. | Atomic profile/history, exact retry and existing-account restoration work through a real verified identity on Supabase. | October 26: migration applied only to Whose Day Mobile Test; all ten hosted security checks pass, anonymous table/RPC access is denied (401/42501), authenticated missing identity is rejected (22023), and the ignored local v1 flag is enabled. No real signup/email was performed. Final production identity/callback/activation needs separate review. See [registration contract](mobile-registration.md). |
| IOS-QA-11 | After release identity/signing/configuration are approved and the native archive uses the candidate profile, review that installed build on an iPhone. | Correct account onboarding and recovery work; lab/sample routes and probe launch modes do not appear; archive payload hashes match the reviewed candidate. | October 26: separate candidate web packaging, explicit config isolation, staged rejection/recovery and browser boundaries pass. Native build commands still use development assets. The browser native-platform shim is DOM-only evidence; no installed candidate, archive, production activation or submission is claimed. See [candidate packaging](mobile-candidate-packaging.md). |

## Codex first-pass record

- Candidate web packaging: the emitted 48-file payload excludes lab/preview and
  standalone check-in routes, sample shortcuts, mock controls, demo/reset actions
  and JavaScript probes. Default/old QA URLs cannot open a browser identity or
  alter stored records; offline policies pass at 320px/390px. Configuration and
  failed-build preservation pass in an isolated fixture. All 88 unit checks plus
  the added isolated build check pass, along with affected development browser
  suites. CI now checks the unconfigured candidate profile separately.
  The freshly rebuilt development simulator onboarding regression passed on an
  unchanged rerun (83 seconds, zero failures). The first attempt failed to find
  Create an account after Save and leave setup; the cause remains unproven and
  should be investigated if it recurs. The native account probe also passes:
  records/image/checkpoints, policy reading, draft/receipt recovery, account
  separation and offline sign-out survive termination. This is regression
  evidence for the development app, not a native candidate archive. Evidence is
  in the ignored candidate manifest/QA files, `ios-onboarding-ui-probe.json` and
  `ios-account-probe.json`.

- Server registration preparation: website profile mapping and an atomic,
  retry-safe profile/acceptance RPC are implemented. Local database/client checks
  pass; direct history mutation and anonymous access are denied. Hosted test
  schema/access checks now pass and the local test flag is enabled; real signup
  remains unverified. See [contract and activation boundaries](mobile-registration.md).
  The simulator build with the enabled test flag passes; copied and compiled
  bundle hashes match the current source assets.
  The October 26 rebuilt native onboarding regression passes (168 seconds, zero
  failures), alongside 86 unit checks and the affected browser suites. A one-off
  Settings scroll assertion passed on unchanged rerun; its cause is unproven.

- Guided onboarding: five steps, resumable verified drafts, explicit versioned
  local agreement receipt, account guards and existing-profile protection are
  implemented. Browser rollback/retry and offline reopen pass at 320px/390px;
  native form/pending-verification/cold-reopen and account storage probes also pass.
  October 26 follow-up verifies Save and leave before and after requesting a
  link. CI exposed two older assertions: offline status must use the visible
  Settings status, and policy reopening must wait for the restored Settings
  route. Both corrected checks pass locally; no new owner QA is required.
  See [onboarding evidence and release boundaries](mobile-onboarding.md).

- Offline policies: complete current versioned text, internal links, source focus/
  drafts, offline reopen and unchanged records/acceptance pass. Signed iOS reader
  markers are present in both restart phases.

- Native Files/sharing: a separate simulator-only XCTest runner exercises actual
  iOS PDF/CSV/JSON chooser cancellations and unchanged-report checks. Local JSON
  save/re-selection and checksum/account preview pass with eight records and one
  screenshot; cancelling preview preserves the complete diary report. Physical/
  provider delivery checks still need an iPhone. See
  [native Files evidence](mobile-native-file-qa.md).

- Photo attachments: the iOS system picker opens with photo-library access denied.
  Native selection/cancel/swipe, verified device save, cold reopen and abandoning
  an unsaved removal draft pass with the seeded app icon. The processed 1024px
  JPEG matches the source visually; record/image hashes and pending checkpoint
  recover, and JSON/CSV retain the complete processed image. See
  [photo implementation and QA](mobile-photo-qa.md). Physical/HEIC/orientation,
  iCloud downloads, interruptions, VoiceOver and device keyboards still remain.

- Read-only device preflight October 23: one paired physical device was
  disconnected; only the dedicated simulator was connected. No install, signing
  change or enrollment was attempted. Evidence: ignored
  `mobile/.build/ios-device-preflight.json`. The owner reconfirmed October 23 that they are still waiting on Apple; this
  inventory does not verify Apple account access.

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
