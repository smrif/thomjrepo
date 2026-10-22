# Mobile feasibility status — October 22, 2026

The owner approved Capacitor and the small feasibility build. Implementation is
isolated in `mobile/`, with small platform hooks and verified-save handling in
the shared website check-in source. The shared help fix and browser-compatible
platform hooks were subsequently deployed to the website October 22; the native
app has not been released. Production provider settings are unchanged.

## Implemented

- Account integration at `account/index.html`: test-project native sign-in,
  verified local family profile, per-project/account record scopes, offline
  session recovery, store revocation on account changes and durable local
  sign-out. The browser offers two separate fictional accounts. Normal native
  launch opens this flow; original lab tools remain accessible. Cloud profile
  restoration and custody sync are not connected. See
  [account integration](mobile-account-integration.md).
- Separate pinned native project/dependency lock for iOS and Android.
- Bundled current website UI preview, with production backend/analytics removed
  and network connections blocked.
- October 22 mobile shell: shared safe-area-aware header and four bottom tabs,
  contextual back navigation through check-in/Settings, per-screen scroll
  restoration, keyboard-aware tab visibility and existing theme support.
  Available from the lab's **Open iPhone app shell** link. It wraps the current
  product screens with sample browser data; the full native storage/auth product
  migration remains outstanding and the lab still launches its test tools.
- Synthetic native check-in using SQLite, commit/readback before success, bounded
  image payload in the same committed record, and local-day reopen.
- Persistent shared-product slice at `checkin/index.html`: Today → full check-in
  → verified save → reopen/edit, using the existing check-in rules and screens.
  Native records load before UI entry and commit atomically by date with the
  attachment, then read back before Saved. Failure keeps the answers/backfill
  date and offers retry; concurrent save taps share one pending operation.
  Record scopes are isolated; this build uses synthetic fixtures, not live
  account binding or sync. The browser review uses a separate IndexedDB store.
  It does not reseed July data or import legacy browser records. Reports and
  Settings remain in the shell preview pending their native integration.
- Native photo selection, local multi-page PDF generation and system file sharing.
- Small app-owned native bridge for iOS SQLite/Keychain and Android
  SQLite/Keystore-backed encrypted session storage. Record database is not
  application-encrypted; prototype is for synthetic data only.
- Test-project-only email authentication with PKCE, secure asynchronous session
  storage, validated custom-scheme cold/warm returns and foreground refresh.
  Disabled in the default build; ignored local configuration can permit creation
  only for the owner-approved test inbox. No custody-table sync.
- Repeatable debug-only native probes for record/image persistence and secure
  session recovery across process termination, removal, and multi-page PDF output.

## Evidence so far

- Mobile domain/auth/storage/product-save/account suite: 28 passed. Covers account
  scope/ownership, stale responses and saves during account changes, offline
  auth and durable sign-out, profile failures, and commit/readback failure behavior,
  attachment/date validation, strict callback routes, secure-storage adapter,
  PKCE/existing-account configuration, duplicate callbacks and production refusal.
- October 22 account probes passed on the signed iOS 17.5 simulator: isolated
  synthetic Keychain identity, profile and the shared product note/image recovered
  across process termination; a second account had no first-account records,
  closed stores rejected old snapshots, and offline sign-out survived auth reopen.
  Evidence: ignored `mobile/.build/ios-account-probe.json`. This does not establish
  real email handoff through the new account entry or physical-device behavior.
- Persistent check-in browser flow passed at 390px and 320px: actual UI save,
  duplicate taps, note/image recovery after closing/reopening with offline mode,
  edit and injected write failure/retry, co-parent branch, and fail-closed startup
  on corrupt/future data. No external requests or page errors. These are Chromium
  browser results; real iPhone keyboards, VoiceOver and photo selection remain QA.
- Shared product flow passed on iOS 17.5 simulator October 22: the actual
  `saveEntry` reached `s-saved`, a fresh process reopened Today as logged, and
  edit restored the note and 114-byte synthetic image. Debug-only probe scope is
  separate from normal sample records; no email or backend request was sent.
  Evidence: ignored `mobile/.build/ios-checkin-probe.json`.
- The updated Android project also compiled and linted after adding record-key
  enumeration to its SQLite bridge. This confirms build compatibility; the new
  full-product flow has not yet been runtime-tested on Android. Earlier native
  Android storage/PDF probe results below refer to the lab probes.
- Shell browser checks passed in Chromium at 320×568, 390×844, 844×390 and
  1280×900, including a dark-mode run. Checks cover all four tabs, visible page
  focus, Settings detail reload/back, check-in back, scroll restoration, 44px
  shell controls, simulated inset/keyboard changes and enlarged shell text.
  No external requests or page errors; native controls stay disabled in-browser.
  Screenshots are in ignored `mobile/.build/shell/`. These are browser checks,
  not Safari/WebKit, VoiceOver, native keyboard or physical-device verification.
- iOS simulator build compiles and signs successfully. Build products are kept
  outside the cloud-managed Documents folder to avoid Finder metadata being
  rejected by codesign. Simulator-only app/Keychain entitlements are scoped to
  the app target; physical-device provisioning remains blocked by Apple account
  setup (see below).
- Physical-device ARM64 compilation also passed with the iOS 27.1 SDK and
  signing disabled. This confirms device compilation only; installation and
  runtime checks still require signing and the connected phone.
- After clearing queued operations with a clean restart of the dedicated
  Whose Day Lab simulator (iPhone 15 Pro / iOS 17.5), both actual native probes
  passed. SQLite record and image payload matched after termination/relaunch;
  the synthetic Keychain value survived and was removed successfully. Both PDF
  runs produced valid three-page PDFs, 13,704 bytes. Evidence is in ignored
  `mobile/.build/ios-probe.json`; repeat with `--installed` to avoid reinstall.
- The initial unsigned probe exposed a Keychain write failure; later signed,
  entitlement-configured probes passed. Simulator install/launch operations also
  timed out during initial setup; the clean reboot resolved that run. No general
  cause of every simulator delay has been established.
- The shared-help website release passed all 48 local release checks and live
  asset/browser verification. Mobile account work changes no website source.
- Real test-project email authentication passed on the simulator October 22.
  The 07:59 PDT email's pending callback was delivered to the native app at
  08:01 after working around Safari's frozen first confirmation sheet. The
  native PKCE exchange produced a signed-in session. The success marker was
  cleared, the app process terminated/relaunched, and a new success marker was
  produced at 08:02 from the restored session, with no new email/code supplied.
  Sanitized evidence is in ignored `mobile/.build/ios-auth-probe.json`.
  This proves native code exchange and Keychain session recovery; it does not
  prove an uninterrupted Safari handoff or physical-device behavior.
- Android debug APK compilation and Android lint passed October 22. Actual native
  write/read probes passed on an isolated AOSP Android 16 / API 36 ARM64 emulator:
  SQLite record and image matched after force-stop/relaunch; the Keystore-backed
  encrypted test secret survived and was then removed. Both generated PDFs had
  valid headers, three pages and 29,911 bytes. Evidence is in ignored
  `mobile/.build/android-build.json` and `mobile/.build/android-probe.json`.
  These are native recovery/PDF checks, not photo-picker/share-destination or
  real Android email-return checks.
  The final APK's compiled manifest was inspected: legacy backup is disabled
  and the modern data-extraction resource is referenced. App lint has no errors
  and 15 remaining warnings about pinned dependency versions and template
  resources/icons; dependency modules retain their upstream lint configuration.

## External setup and unverified work

- Separate free Supabase project created by the owner and verified healthy:
  [Whose Day Mobile Test](https://supabase.com/dashboard/project/ijewfmltnlqpydwuiedb),
  East US (North Virginia). Public configuration is in ignored
  `mobile/config.local.json`; no database password or secret key was read.
- Exact test-project auth redirect `whoseday-feasibility://auth/callback` was
  saved and verified in the dashboard. Production configuration was not changed.
- Owner approved one inbox for test-account creation/sign-in messages. The lab
  restricts signup to that configured inbox. Receipt was confirmed by the owner;
  fresh October 22 messages were also verified directly in the approved inbox.
- Simulator Safari's initial "Open in Whose Day Lab?" sheet failed to respond
  to both automated and owner clicks. Restarting restored some controls.
  Replaying the observed pending callback through `simctl openurl` produced a
  working system confirmation and native app return. The fresh 07:59 email
  completed native authentication and session recovery through callback replay
  after restarting. No further emails were requested after that success.
  Uninterrupted Safari handoff remains unverified; no general cause of the
  simulator input problem has been established.
- The owner's iPhone 16 Pro is connected, paired, and has Developer Mode enabled.
  The owner added an Apple account and selected a Personal Team in Xcode.
  Device provisioning was attempted, but Apple returned "You are not allowed
  to perform this operation" and no development profile was created. The owner
  checked the Apple Developer website and reported account issues they need to
  resolve. The exact account restriction remains unknown; no paid enrollment
  was attempted. Device installation remains blocked by provisioning.
- Owner is resolving the Apple account restriction through Apple Support;
  physical iPhone installation and TestFlight remain pending that resolution.
- Independent Android validation started October 22. The owner accepted Google's
  SDK License Agreement. Local ignored tooling now includes Temurin JDK 21,
  SDK platform 36, Build Tools 35.0.0, Platform Tools and an isolated AOSP API 36
  ARM64 emulator. JDK/command-line-tools downloads matched official SHA-256
  values; the Gradle wrapper now pins its distribution checksum.
  The first compile exposed incorrect `PdfDocument` try-with-resources usage;
  explicit `finally` cleanup was added and compile/runtime checks passed.
  Android lint also identified missing modern backup rules; explicit cloud and
  device-transfer exclusions were added for all app data domains, alongside
  legacy backup disabling. These rules follow
  [Android backup configuration](https://developer.android.com/identity/data/autobackup);
  actual device transfer/restore behavior remains untested.
  The emulator restarted system services during its initial concurrent build/boot,
  before lab-app installation. Running the build and emulator sequentially on
  this 8 GB host produced a healthy boot and passing native probes; no broader
  emulator stability claim is established.
- Actual native photo-picker/share-sheet destination behavior, physical-device
  recovery and email handoff remain open. Current PDF is a synthetic report and
  does not embed attachment images.
- Full current-product native migration remains stage 2+: account-scoped storage,
  atomic restore/migrations, report/backup parity, API origin/deletion adaptation,
  Universal/App Links, release privacy review and physical-device QA.

See [mobile README](../../mobile/README.md) for reproducible build/probe commands
and [approved direction](mobile-app-plan.md) for the broader release plan.
