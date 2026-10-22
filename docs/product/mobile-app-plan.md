# Whose Day: iOS and future Android plan

Prepared October 21, 2026. Owner approved the Capacitor direction and small
feasibility build. Implementation is in progress in `mobile/`; see
[feasibility status](mobile-feasibility-status.md). Full-product migration,
physical-device acceptance and store distribution are not complete.

## Recommendation and alternatives

Start with a Capacitor feasibility build: bundle the existing HTML/CSS/JavaScript
application in an installed iOS app and add native integrations behind shared
interfaces. Prove a small Android build during that work, while releasing iOS
first. Capacitor supports both platforms without requiring a React or Ionic UI
rewrite. Its interface remains web-rendered; it does not turn HTML into native
UIKit/Android controls. [Capacitor overview](https://capacitorjs.com/docs)

This is the recommended starting point because Whose Day already has a responsive,
working form/calendar/report application with substantial regression coverage.
It is an engineering judgment based on this repository, not a measured promise
of a specific reuse percentage, delivery date or App Review outcome.

| Approach | Existing work reused | Work and tradeoff | Assessment |
| --- | --- | --- | --- |
| Capacitor | Most screen markup/styles; business rules, backend and event definitions | Refactor platform dependencies; native storage/auth/files and mobile interaction work. UI remains in a WebView. | Recommended first feasibility build. |
| React Native, with Expo tooling as an option | Backend, data contracts, assets, extracted JavaScript rules and event definitions | Rebuild screens, navigation and styling as native components. Existing DOM handlers cannot be pasted across. Web UI stays separate unless deliberately rebuilt too. | Strong alternative if native interaction/design needs justify a screen rewrite. |
| Separate native iOS and Android applications | Backend, schemas, product rules/specifications, assets and test cases | Implement and maintain two mobile frontends, plus the website. | More platform control; least aligned with the present reuse goal. |

React Native renders platform-backed components rather than the current HTML
screens. That makes it a real UI migration for this project, even though both
applications would use JavaScript. [React Native components](https://reactnative.dev/docs/intro-react-native-components)

Reconsider Capacitor if physical-device testing exposes unacceptable keyboard,
accessibility, scrolling or large-history performance, or essential integrations
cannot be maintained reliably on both platforms. Use the feasibility build to
make that decision before broad production refactoring.

## Current repository: reuse and gaps

The app is plain HTML/CSS/JavaScript, not an existing React app. `app.js` combines
screen rendering, navigation, local persistence, synchronization and reporting.
`supabase-client.js` handles Supabase sessions and direct profile/log/device
access. Cloudflare serves static assets and the authenticated account-deletion
endpoint. The reserved Worker auth/sync routes are not the current sync backend.

| Area | Keep | Adapt for an installed app |
| --- | --- | --- |
| Product/UI | Today, signup, full check-in tree, Calendar, Trends, five report types, Settings, themes | Safe areas, keyboard/focus, text scaling, screen-reader behavior, navigation and native dialogs |
| Rules | Family-date counting, yesterday-only backfill, read-only history, report selection, conflict semantics | Extract pure functions where presently tied to DOM/storage; maintain web/mobile parity |
| Backend | Existing Supabase accounts/tables/owner policies and Cloudflare deletion service | Mobile callback configuration, session persistence/lifecycle and explicit API URLs/origins |
| Offline records | Current record format and backup compatibility | Replace native reliance on synchronous browser localStorage with durable, transactional persistence |
| Attachments | Existing image content and metadata | Native selected-photo/file import, durable files, memory limits and backup/sync serialization |
| Reports/backup | Report content, CSV/JSON formats, import validation and recovery rules | Files/share sheet, local PDF/print integration and import picker |
| Analytics | Mixpanel project, events, enum/property restrictions and opt-out | Native build gating, durable queue/preferences, platform/version fields and lifecycle tests |
| Packaging | Current web build stays supported | Separate bundled mobile build and signed iOS/Android projects |

Specific breakpoints found in current source:

- Supabase redirects default to `https://whosedayapp.com/`; callback detection
  expects the browser URL. Session fallback/cleanup reads browser storage.
- `getEntries`/`putEntries`, profile/settings, sync conflicts/bases, restore
  journal and pending signup use localStorage directly. Backup commit/recovery
  expects a synchronous storage object.
- CSV/JSON use Blob URLs and download anchors. Print opens a browser window;
  sharing uses `navigator.share` or `mailto:`. These need mobile implementations.
- Account deletion uses relative `/api/account`, rejects non-http(s) protocols,
  and the Worker rejects foreign origins. It will not work unchanged in the
  default native container.
- Analytics explicitly allows only the two production HTTPS website hosts;
  native collection would currently be disabled.
- The service worker is the web offline/update mechanism. The mobile app should
  boot bundled assets and use store-managed app versions instead.

## Shared architecture

Keep one repository with shared product code and small platform adapters:

- Product layer: date/record validation, check-in state, reports, import/export
  contracts and conflict rules.
- UI layer: existing screens with mobile refinements, shared across web/iOS/Android
  where feasible.
- Platform layer: records/preferences, secure session storage, auth callbacks,
  attachments, report files/sharing, app lifecycle and analytics configuration.
- Native hosts: iOS project and Android project, each with signing, permissions,
  domain association and platform configuration.

Avoid platform checks scattered throughout the check-in tree. Introduce the
interfaces incrementally with a browser implementation first. Do not combine
this with an unrelated framework or visual redesign.

## Storage, sessions and data safety

Proposed native storage: SQLite for records, profile, sync metadata and durable
pending operations; protected app-private files for attachments; lightweight
preferences for UI choices; OS-backed secure storage for authentication material.
Select maintained iOS/Android bridges only after testing transactions, migrations,
large attachments, licensing and current runtime compatibility. Encryption/key
management, device-backup behavior and recovery must be explicit selection criteria.
No encrypted-database or end-to-end-encryption claim is established by this plan.

Capacitor warns that localStorage can be cleared by the OS, and its Preferences
plugin is for small settings rather than a database. Preferences alone is not
the records/attachment solution. [Preferences guidance](https://capacitorjs.com/docs/apis/preferences)

The current synchronous storage API cannot simply be swapped for asynchronous
SQLite calls. Load a validated state before entering protected screens, await
durable commits before displaying Saved, and synchronize only after that commit.
Keep native writes, attachment references, schema migrations and import recovery
crash-safe. Preserve the existing backup format through serialization adapters.
Namespace records and pending sync by account; verify switching users never uploads
another account's retained local data. Make explicit which local copies remain
after sign-out/deletion and how users can remove them; never silently migrate
them into a different account.

Use OS-backed session protection rather than treating Preferences as a credential
vault. Audit every direct cached-session/read/logout path, not just SDK storage.
Test fresh install, update, uninstall/reinstall, device restore and token expiry;
do not assume Keychain lifecycle matches application database lifecycle.

Sync on foreground/reconnect and after successful local writes. Handle suspension
and process termination without promising continuous background synchronization.
Retain the existing user-visible conflict decisions and never silently overwrite
a divergent record on another device.

## Sign-in and existing-user migration

Keep existing Supabase email accounts; no second account system is proposed.
Implement a dedicated HTTPS auth-return path with iOS Universal Links and future
Android App Links. Configure association files/domain routing and exact allowed
redirects. Validate incoming callbacks and handle cold/warm launch, expired links,
duplicate delivery and a missing app with a useful website fallback.
[Capacitor deep links](https://capacitorjs.com/docs/guides/deep-links),
[Supabase mobile callbacks](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)

Evaluate explicit PKCE/code exchange in the feasibility build. Its verifier must
remain available in the requesting app: a callback consumed in Safari cannot
assume access to the native app's verifier/session. Test actual email-client and
browser handoffs, including a link opened on a second device. Consider a typed
email-code fallback if handoff reliability warrants it; that would require a
deliberate template/UI change rather than an assumed existing feature.
[Supabase PKCE limitations](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

Safari and the installed app have separate local storage. Successfully cloud-synced
records can restore after signing into the same account. Unsynced Safari records
need a sync or explicit JSON export/import before transfer; installation cannot
read them automatically. Keep source data until counts and attachment contents
are verified. Account-less legacy data needs an explicit ownership/migration
route; do not assume the current same-account import accepts every legacy file.

Use an explicit production API base URL for mobile deletion. Implement narrowly
scoped CORS/preflight and native-origin handling where needed, while keeping
verified bearer authentication and server-derived identity. Native Origin strings
are not an authentication mechanism. Preserve current web protections and never
ship service-role credentials in either mobile binary.

## Native interaction and first-release scope

Aim for current core feature parity: onboarding/sign-in, Today/check-in,
attachments, Calendar/Trends, all report types, Settings, sync/conflict review,
JSON backup/import, CSV export, deletion and analytics controls.

Implement selected-photo/file picking, share-to-Files/mail, report PDF/printing,
keyboard-safe forms, safe areas and accessible focus/navigation. Generate report
output locally through a tested native renderer/bridge, preserving the selected
records, headings and attestation. Do not upload custody reports to a conversion
service. Use app-private temporary export files and a cleanup policy; distinguish
share-sheet presentation from a confirmed save/send. Capacitor's Share plugin
supports native file sharing but Android file locations require configuration.
[Share API](https://capacitorjs.com/docs/apis/share)

Start with iPhone/US distribution as a proposed first scope. Choose minimum OS
versions after runtime/plugin/toolchain validation. Explicitly decide iPad support;
do not assume that an iPhone-first layout has completed tablet QA.

Reminders, widgets, push, biometrics and subscriptions are separate product
decisions. Do not add them merely to make an app appear native. Assume no new
billing in the feasibility build; if charging for launch, plan entitlements,
purchase/restore and applicable storefront rules before the release scope is fixed.

## Analytics and store readiness

Retain the existing Mixpanel event definitions and content exclusions. Introduce
explicit platform (`web`, `ios`, `android`), app version/build and environment
configuration so TestFlight/internal tests do not contaminate production funnels.
Use an installation-scoped identifier unless a different identity design is
deliberately approved; it will not automatically connect a user's web and app
activity. Preserve the native opt-out and retry/dedup behavior without requiring
a native Mixpanel SDK solely to collect the existing events.

Apple reviews utility and app-like behavior beyond a repackaged website; choosing
Capacitor or another framework does not guarantee approval. Package executable
assets with the release and use normal store updates initially. Provide a reliable
review-access procedure compatible with email authentication. Own email login
does not by itself require social login; revisit Apple's login rule if adding
Google or another social provider. Review the current required-account gate
against account-sign-in guidance and explain why account-backed functionality
needs it. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

Validate the existing deletion flow in-app, including retained-local-copy messaging
and backend acknowledgement. [Apple deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

Complete privacy labels for actual Supabase content/account processing and Mixpanel
usage data, rather than assuming content excluded from analytics is excluded from
all collection. [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
Inventory plugin manifests, required-reason APIs and permissions in the archive.
[Capacitor privacy manifests](https://capacitorjs.com/docs/ios/privacy-manifest)
ATT depends on cross-company tracking practices, not simply the presence of
analytics. The intended design excludes advertising identifiers/cross-company
tracking; verify the actual integrations before finalizing disclosures.
[Apple data-use guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/)

## Android decisions to make now

- Choose storage/auth/files plugins with both iOS and Android support and isolate
  any custom Swift/Kotlin implementations behind the same interface.
- Prove sign-in, a durable offline save and file sharing on Android during the
  feasibility build. Android remains a separate tested/signed release, not a
  checkbox that automatically produces a finished second app.
- Keep shared account IDs, backup formats and sync semantics. Handle Android Back,
  process recreation, keyboard/system bars and file URI permissions explicitly.
- Design the HTTPS callback path for both association-file formats. Add Android
  signing identifiers only when known; do not invent production identifiers.
- Plan Play Console Data safety and the required external deletion-request resource
  alongside in-app deletion. The current Settings button is not proof the external
  requirement is fulfilled. [Google deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

## Delivery sequence and evidence

| Stage | Deliverable | Completion evidence |
| --- | --- | --- |
| 1. Feasibility | Bundled iOS app plus minimal Android build; candidate storage/security/file integrations and auth handoff | Physical iPhone email return, saved offline record after force quit, attachment/report sharing; Android equivalents for the small slice. Record limitations and choose/confirm architecture. |
| 2. Shared foundations | Browser/native adapters, extracted rules, account-scoped durable storage and migration handling | Existing web regressions pass; crash/failed-write/import recovery and account-switch tests establish no false Saved state or cross-account upload. |
| 3. Feature parity | Complete core app, native files/PDF/import, lifecycle sync, settings/deletion, analytics | Both themes, keyboard/large text/VoiceOver, all check-in branches, large-history/attachment performance, offline restore and opt-out verified. |
| 4. TestFlight | Signed build, privacy inventory, review-access instructions and beta distribution | Physical-device test matrix and resumed owner-assisted account/conflict/deletion QA pass using approved test identities. |
| 5. App Store | Final listing, screenshots, support/policy URLs, disclosures and reviewed build | Owner approves release scope/listing; submission completed and any review issues resolved. Android release follows its own testing/store checklist. |

Keep existing deferred live-account tests deferred until resumed; use synthetic
fixtures/mocks for independent work. A mobile release cannot be declared complete
from browser tests alone. Use an isolated test backend before destructive migration
or recovery experiments; never replay a baseline into production.

Release testing must include fresh install, update with pending offline writes,
kill/reopen, session expiry/rejection vs network loss, multiple devices, both
conflict choices, account deletion with an old second session, attachment recovery,
timezone/day boundaries, denied/cancelled pickers, and imported backup parity.

The next implementation milestone is the feasibility build, not a full rewrite.
Before signing/distribution, confirm Apple Developer ownership/team access,
toolchain setup, app identifiers, device availability and proposed commercial
scope. Current Capacitor tooling requirements should be pinned at implementation
time. [Environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
Estimate the remainder after the auth/storage/report slice is measured; no App
Review turnaround or delivery date is promised by this plan.
