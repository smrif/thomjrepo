# Whose Day mobile feasibility build

Owner approved the Capacitor approach and small feasibility build October 21,
2026. This directory is an isolated native integration experiment; the production
website and its dependencies are unchanged.

## What is implemented

- Pinned Capacitor 8.5.3 iOS and Android projects, using bundled assets rather than
  a hosted-site URL. Provisional debug app ID: `com.whoseday.feasibility`.
- Small synthetic check-in with SQLite commit/readback before success, a bounded
  JPEG/PNG attachment stored atomically with the record, and reopening by local day.
- Custom small native bridge: iOS SQLite/Keychain/CoreText PDF; Android
  SQLite/Keystore-backed AES-GCM session storage/PdfDocument. The database is
  app-private, not application-encrypted. This is synthetic-data-only code, not
  the final production storage selection or schema migration.
- Native photo selection and PDF share sheet. PDF is a test report; attachments
  are preserved in the database but not embedded in that test PDF.
- Supabase email-link PKCE client with asynchronous secure session storage,
  strict callback validation, duplicate handling and app lifecycle refresh.
  Disabled by default; explicitly refuses the production Supabase project.
  Existing-account flow by default; an ignored local configuration can allow
  creation only for the owner-approved test inbox. No custody sync.
- Offline copy of the current website UI at `preview/index.html?demo=july`.
  Its demo browser storage is separate from the native test record. Backend and
  analytics scripts are excluded and network connections blocked by CSP.
- Mobile app shell around those shared screens: one safe-area-aware header,
  Today/Calendar/Reports/Settings navigation, per-screen scroll restoration,
  contextual check-in/Settings back controls, dark theme and keyboard-aware tabs.
  Both help branches now ask once for all applicable children, using the shared
  product flow; activities and the optional note survive Back and editing.
  Open **iPhone app shell** from the lab. This is a sample-data interface preview;
  the lab launch screen and native auth/storage tests remain separate.
- Persistent Today/check-in slice at `checkin/index.html`. It uses the actual
  shared check-in rules/screens, an asynchronously hydrated record store and
  verified per-date SQLite writes on native platforms. The browser uses its own
  IndexedDB review store and is labeled **Browser test**. Sample profiles and
  records stay in fixed synthetic namespaces, separate from the July demo,
  lab persistence probes and the test sign-in session. No cloud sync or live
  account binding is enabled in this slice. Reports/Settings are disabled here;
  they remain reviewable in the original shell preview.
- No store release, signing enrollment, production deployment or production
  provider configuration changes.

## Build and run

Run from `mobile/`, using Node >=22 and pnpm:

```
pnpm install --frozen-lockfile
pnpm sync
pnpm test
pnpm test:ui
pnpm test:checkin
pnpm ios
```

`test:ui` uses the repository's existing Playwright Chromium installation. It
checks the browser fallback, four tabs, Settings detail reload/back, check-in
back, scroll restoration, touch target sizes, and simulated safe-area/keyboard
changes at small-phone, iPhone, landscape, dark and desktop sizes. Screenshots
are saved under ignored `.build/shell/`. Native keyboard, VoiceOver and actual
iPhone inset behavior still need device QA; this does not test native persistence.

To review locally after `pnpm build`, serve **only** `mobile/www` on loopback
(for example, from the repository root: `python3 -m http.server 4179 --bind
127.0.0.1 --directory mobile/www`) and open
`http://127.0.0.1:4179/preview/index.html?demo=july`. Do not serve the repository
root, which contains local configuration. Shell source is in `src/shell.*` and is
added by the mobile build; it does not change the production website's layout.

For the persistent check-in slice, open `http://127.0.0.1:4179/checkin/index.html`
or **Open check-in build** in the lab. Use sample data only. Complete a check-in,
add a small test image, save, close and reopen. Today should show **Edit today**;
walking through the same answers restores the note and image. The native build
uses SQLite with one date/attachment per atomic row, then verifies readback
before publishing the new in-memory state or the saved confirmation. The
browser review uses committed IndexedDB transactions; browser results alone do
not establish native persistence. Neither mode imports old localStorage records.

The 15 mobile unit/integration checks cover verified saves, invalid stored data,
scope separation, stale edits, duplicate saves and preserving answers/backfill
dates on failure. `test:checkin` additionally exercises the shared UI at 390px
and 320px: save, close/offline reopen, attachment/edit recovery, injected failure
and retry, duplicate taps, the co-parent branch and corrupt-data startup blocking.
Screenshots are in ignored `.build/checkin/`.

For the native shared-product integration probe, after building and booting the
dedicated simulator, run `pnpm probe:checkin:ios SIMULATOR_UUID`. Debug-only launch
arguments exercise the actual product `saveEntry`, then terminate/relaunch and
verify Today/edit recovery in the separate `native-probe-v1` scope. Fresh markers
and results are recorded in `.build/ios-checkin-probe.json`. This sends no email,
does not sync, and does not prove a real photo picker or physical-device behavior.
If Xcode's existing package cache has missing artifacts, use a fresh pinned cache
with `WHOSE_DAY_IOS_PACKAGES=/private/tmp/whose-day-checkin-packages pnpm build:ios`.
Xcode verifies the package's pinned binary checksums when resolving that cache.

For a simulator build with normal local signing (no paid team needed):

```
pnpm build:ios
```

The build script keeps signing products in a temporary directory to avoid
cloud-folder Finder metadata failures. It records the app path in
`.build/ios-build.json`. Boot a simulator, then run `node scripts/probe-ios.mjs SIMULATOR_UUID` to install,
write a synthetic record/image and secure session, terminate/relaunch, verify
recovery, remove the synthetic session and validate multi-page native PDFs.
Add `--installed` to probe an already installed app without a new installation.
The debug probe is simulator-only on iOS. Results go to `.build/ios-probe.json`.
A simulator result does not establish physical-device behavior or actual email
handoff/sharing to another app.

For Android, use JDK 21, SDK platform 36, Build Tools 35.0.0 and Platform Tools.
The local setup uses ignored `.build/android-tools/jdk/Contents/Home` and
`.build/android-tools/sdk`; `JAVA_HOME` and `ANDROID_HOME`/`ANDROID_SDK_ROOT`
override those defaults. Gradle's cache defaults to the system temporary
directory, and the wrapper checks the pinned distribution's official SHA-256.
SDK installation requires the owner's agreement to Google's SDK terms. Build
and probe scripts do not download tools or accept licenses.

```
pnpm sync
pnpm build:android
pnpm probe:android emulator-5554
```

`build:android` runs `assembleDebug` and `lintDebug`, then records the APK path in
ignored `.build/android-build.json`. It does not upload or publish the app.
`probe:android` requires an explicitly named, running emulator, installs that
debug APK (or use `--installed`), force-stops between write/read passes, verifies
the SQLite record/image and Keystore-backed secret, removes the test secret,
and reads the actual native PDF to check its header and pagination. It rejects
physical-device serials and ignores stale success markers. Evidence is written
to ignored `.build/android-probe.json`. Photo/share UI and actual email handoff
require separate checks; a compile or headless probe alone does not establish
those behaviors. No signing keys or local SDK paths are tracked.

On this 8 GB Mac, finish the build before starting the emulator. The initial
concurrent build/boot restarted Android system services; the sequential retry
booted normally and passed the native probes. The local AVD is `WhoseDayLab`
(AOSP API 36 ARM64), with metadata in ignored `.build/android-avd`. To start it:

```
ANDROID_AVD_HOME="$PWD/.build/android-avd" \
ANDROID_HOME="$PWD/.build/android-tools/sdk" \
.build/android-tools/sdk/emulator/emulator -avd WhoseDayLab -port 5554 \
  -no-snapshot -no-boot-anim -no-audio -no-window -gpu swiftshader
```

Wait for Android to finish booting, then run the probe from another terminal.
Stop this test emulator with `.build/android-tools/sdk/platform-tools/adb
-s emulator-5554 emu kill` when finished. The lab disables legacy Android backup
and explicitly excludes app data from cloud backup and device transfer on newer
Android versions; these configuration rules are not proof of a completed
device-transfer/restore test.

## Test auth setup

The owner created the separate free US project `ijewfmltnlqpydwuiedb` and
approved a test inbox. Its public configuration is in ignored `config.local.json`.
Real email testing remains separate from local/mocked tests. Do not point
this build at production or copy beta user records into a test environment.

1. Create a free US test project named `Whose Day Mobile Test`; keep credentials
   out of source control. A database password must be entered by the owner when
   the dashboard requests it.
2. Set the exact auth redirect `whoseday-feasibility://auth/callback` in that test
   project. This custom scheme is for feasibility; production Universal/App Links
   and their association files are later work.
3. Copy `config.example.json` to ignored `config.local.json`, enable auth and set
   the test project URL and public publishable key. Never use a service-role key.
4. Arrange an owner-approved test identity and email delivery. Supabase's default
   email provider has restrictions; no live test email is authorized by this file.
   No existing production SMTP secret is copied or exposed.
5. Rebuild/sync and test cold/warm app return, expired/reused links, process
   relaunch, logout, and wrong-device behavior. Website-origin PKCE verifiers
   cannot be exchanged using the native app's storage.

For a physical iPhone, select the owner's development team in Xcode, connect a
trusted development device and complete required device setup. Developer account
fees, TestFlight and App Store submission remain later steps.

### Physical-device check once installed

1. Open **Whose Day Lab** and use a synthetic note and a non-sensitive test photo.
   Tap **Save test check-in** and wait for the native save/readback confirmation.
2. Close the app from the app switcher. Go offline, reopen it and confirm that
   the same parent, note and photo return. Restore connectivity afterward.
3. Tap **Share test PDF**, choose **Save to Files**, then open that file in Files.
   Check that the synthetic note is readable. This lab PDF does not embed photos.
4. Request a sign-in link inside the installed lab app using the approved inbox.
   Open that newest email on this same iPhone and allow it to open Whose Day Lab.
   A link requested by the simulator cannot sign in the physical app because the
   required verifier is stored on the requesting device.
5. Confirm **Test account signed in.**, close/reopen the app, and confirm that
   the signed-in state returns. Check both a running-app return and a closed-app
   return when email-provider limits allow.
6. Sign out and reopen to confirm the session is gone. Synthetic local records
   currently remain; account-bound storage is part of the later product migration.

Record observed results in the feasibility status. A successful compile or an
opened share sheet alone does not verify these checks.

## Evidence and remaining work

See [feasibility status](../docs/product/mobile-feasibility-status.md). The current
full application still needs the planned asynchronous storage/platform adapters;
this test app does not silently redirect its localStorage calls to native storage.
The full check-in tree in the bundled preview remains a browser demo.

Before real-user use: account-bound storage and migration, encryption/key recovery,
proper native backup/import and report parity, CORS/deletion adaptation, Universal
Links, accessibility/device QA and accurate release privacy disclosures are still
required. The lab privacy manifest is not an App Store disclosure review.

Native recovery, Keychain removal and three-page PDF probes passed on the
dedicated iOS 17.5 simulator after a clean restart. The first authorized email
request succeeded and the owner confirmed receipt. Real test-email PKCE exchange
and session recovery after process termination/relaunch passed October 22.
The simulator's first Safari return sheet did not respond to automated or owner
clicks, so the observed pending callback was replayed through `simctl openurl`
after restarting. Full Safari handoff and physical-device behavior remain open.
The connected iPhone has Developer Mode enabled and a Personal Team selected;
Apple is currently rejecting development provisioning, and the owner is resolving
account issues. See the status document for the current external block.

Android debug build and lint also passed October 22. The final APK passed both
native write/read probes: SQLite record/image recovery, Keystore-backed secret
recovery/removal, and three-page PDF output (29,911 bytes). Actual Android email
return, photo selection, share destinations and device transfer remain unverified.
