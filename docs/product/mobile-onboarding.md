# Guided mobile onboarding — October 23, 2026

The account entry now separates **Create an account** from **Sign in**. Guided
signup collects parent label, co-parent label, children and activities, followed
by email and explicit agreement to the currently approved Terms of Use and
acknowledgment of the Privacy Policy. The documents remain available in the
in-app offline reader. The website's signup and acceptance behavior are unchanged.

## Behavior and persistence

- Each step validates before advancing; Back preserves answers. Children must
  have distinct labels (one to twenty), and at least one activity is required.
  Setup fields use labeled controls and phone-safe spacing. Activity choices
  persist into Settings and the check-in tree.
- Drafts save through the platform vault with verified readback: native SQLite
  or the clearly labeled browser preview's IndexedDB. Saves are serialized;
  failures retain visible answers and offer retry. Progress resumes at the saved
  step after closing/reopening. Save and leave preserves the unfinished answers.
  Unreadable drafts require an explicit new setup; they cannot silently replace
  completed accounts or receipt history.
- Draft scope is the separate project and guest, or the authenticated account
  when setup follows sign-in. No checked agreement is stored in the draft.
  Reopening a draft requires an explicit agreement before a new submission.
- The final submission freezes the profile, exact draft, email, policy versions,
  timestamp and attempt ID. This pending intent survives process termination
  while the user follows the email link. A different verified email/account
  cannot inherit its family labels or agreement. Pending agreement expires after
  24 hours (answers remain saved), and future-dated submissions require review.
  The storage key must match the guest or exact verified-account scope.
  Save and leave after requesting a link preserves the pending submission so a
  verified return can finish without asking for the family details again.
- Native signup uses the existing test-only PKCE client and requests creation
  only for the explicitly approved inbox when that configuration allows it.
  Sign in always requests `shouldCreateUser:false`, including when signup is
  configured. Resend is held for 60 seconds, including after reopening a pending
  request; failed requests preserve the prior pending submission. No email or real
  identity was created during this increment's QA.
- A verified account with no existing profile commits profile, account-scoped
  receipt and consumed intent/draft in one guarded transaction. Profile and
  receipt are read back before entry. Changed drafts/intents, an existing profile
  or deletion gate prevent completion. An uncertain readback asks for reopening
  to inspect the saved copy; it does not claim completion.
- The receipt records project, account ID/scope, verified email, exact Terms and
  Privacy versions, accepted/recorded timestamps, attempt ID and test/preview
  source. The approved wording/version is reused; no legal wording was changed.
- Existing local/cloud profiles restore directly and are not replaced by signup
  answers. No mandatory re-consent is introduced for returning users. Reading
  policies, Settings edits, sync and backup import cannot create/rewrite receipts.

## Environment and release boundaries

This is the separate **test app**, not production account registration. Receipts
are local account records by default; ordinary profile sync omits acceptance columns.
The optional [server registration contract](mobile-registration.md) now supplies
an atomic server profile/history transaction, tested locally and applied only to
the separate mobile test project. Hosted access checks pass and the ignored local
flag is enabled; real signup/email return remains unverified.
The legacy profile field remains `termsAccepted:false` to avoid implying the
website/server's acceptance contract has been met. New explicit agreement is
represented by the separate receipt, not inferred from that legacy field.
Production server acceptance history, production environment/callback setup and
final policy/release review remain prerequisites for a production release.
Receipts do not travel through JSON backup or profile sync; restoring a profile
on another device never fabricates an agreement there.

Browser review (isolated from the previous sample profiles): open `http://127.0.0.1:4179/account/index.html?onboarding=preview` and choose **Create
an account**. The final step selects sample A or B; it sends no email and labels
receipts `browser-preview`. Existing sample-account shortcuts remain explicitly
labeled test utilities and retain their basic synthetic profile form. Normal
native missing-profile setup uses the guided flow. Final packaging must remove
or deliberately gate all lab routes/shortcuts.

## First QA pass

- 79 mobile unit/integration checks pass, including durable draft isolation,
  stale policy/invalid intent rejection, exact verified-account matching,
  atomic completion, transaction failure/retry, changed draft/intent guards,
  deletion/account switches, duplicate completion and receipt preservation.
- Guided browser walkthroughs pass at 320px and 390px with external requests
  blocked: forward/back/validation, offline draft/reload, unchecked agreement
  after reload, offline reader/focus return, injected receipt-write rollback,
  preserved answers/retry, exact receipt metadata, completed-account reopen,
  existing-profile protection and second-account isolation. The 320px agreement
  is also checked with enlarged text. Screenshots/results are ignored under
  `mobile/.build/onboarding/`.
  The ordinary preview and `?onboarding=preview` have separate identities, profiles
  and drafts; the unreadable-draft restart path also passes.
- Native simulator UI and storage checks passed on iPhone 15 Pro / iOS 17.5. The DEBUG-only
  `onboarding-write/read` fixture uses a fresh synthetic project scope and separate
  Keychain marker. It simulates verification locally; it cannot send email or
  use the normal native test session. The XCTest walks the actual WebView form,
  terminates with an unfinished draft, resumes it, reads the policy, explicitly
  agrees, verifies the resend timer, terminates while verification is pending,
  then completes from the synthetic returned identity and reopens the account.
  SQLite receipt/profile readback is required by the wrapper. Nine screenshots
  were exported, including leaving the pending signup; visual review also covers
  the return to the account screen. A safe-area mask fixes scrolled text behind
  the status bar.
  Initial incomplete XCTest runs are not counted as passes; waits now confirm
  saved progress and each screen, and close the native keyboard before continuing.
- The extended native account write/read probe also passes: unfinished onboarding
  answers survive process termination independently of agreement, native atomic
  profile/receipt completion verifies exact versions/account, completed state
  reopens, and account isolation/offline sign-out/pending note/image sync still pass.

Commands after building:

```sh
pnpm --dir mobile test
pnpm --dir mobile test:onboarding
pnpm --dir mobile test:accounts
pnpm --dir mobile probe:files:ios SIMULATOR_UUID onboarding
pnpm --dir mobile probe:account:ios SIMULATOR_UUID
```

Real email delivery/expired links/Safari return, production registration and
physical keyboard/VoiceOver behavior remain deferred in
[owner QA](mobile-owner-qa.md). Synthetic verification establishes local wiring
and storage behavior, not provider delivery or server acceptance history.

Native evidence is kept in ignored `mobile/.build/ios-onboarding-ui-probe.json`,
with source hashes, XCTest result bundle, screenshots and exact synthetic receipt;
`mobile/.build/ios-account-probe.json` records the extended storage restart cases.
The runner rejects physical devices and all verification is labeled synthetic.

Final simulator UI run: 88 seconds, zero failures at 15:08 PDT on October 23.
Result bundle: `whose-day-files-ui-ca6Lio/result.xcresult`; nine exported screenshots
include the successful Save and leave/pending-verification recovery sequence. Source/build hashes in the evidence match the tested
WebView bundle, native bridge and XCTest source. No physical install, provider
change, email, production deployment or App Store action was performed.

October 26 completion after the rate-limit interruption: browser checks at 320px
and 390px now explicitly cover leaving/resuming before requesting a link. The
assertions wait for draft loading to finish. Combined with the October 23 native
pending-link leave/reopen pass, this verifies both Save and leave paths.

The hosted run for `7ee4d76` passed onboarding but failed two older assertions:
the website offline check read text inside a hidden signed-in status panel, and
the mobile policy check expected Today after reopening a saved Settings route.
The tests now wait for offline account startup and assert the visible status,
and wait for account mounting on the restored Settings route. Both targeted
checks pass locally. These fixes change test assertions only; native source and
the simulator evidence above are unchanged.

October 26 full local verification also passes: 79 mobile unit tests, all ten
mobile browser suites (including 87 accessibility checkpoints and both policy
viewports), and all 49 website release results. Logs are in
`/tmp/whose-day-onboarding-unit-current.log`,
`/tmp/whose-day-onboarding-mobile-final.log` and
`/tmp/whose-day-onboarding-release-final.log`. Hosted CI is separate evidence.
