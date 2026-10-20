# Authenticated App Entry

Owner direction, October 20, 2026: signed-out users land on welcome, then Sign in
or Sign up. Sign-in no longer appears inside Settings. Saved profile data alone
does not open Today, Calendar, Reports, Settings, or check-in screens.

## Routing and continuity

- A confirmed session plus saved setup opens Today. During the initial check,
  returning users see a short loading screen; private screens are not initially
  active in HTML.
- A session without completed setup follows onboarding. Signup still asks name,
  co-parent and children before email/agreement. Its final submission saves a
  device-local draft and sends a signup link; Today requires a verified session.
- A matching verified account can continue that draft. A different account must
  finish setup; it cannot automatically upload the draft as its own profile.
- Sign-out immediately locks app navigation and returns to welcome, preserving
  local records. The SDK signs out this device, stops refresh, and clears its
  stored auth state even when remote logout fails. An explicit sign-out marker
  prevents offline/reload fallback to retained credentials.
- A previously authenticated device can reopen offline using its cached session
  or last authenticated-account marker and saved setup. New/explicitly signed-out
  devices cannot use that fallback. A new unverified signup draft is not offline
  authorization. Offline access queues local edits without cloud writes.
- Reconnect, focus and visibility recheck the session; a missing/rejected session
  returns to welcome. Retryable network trouble can retain cached local access.
  History restoration and cross-tab sign-out also close protected screens. Late
  checks cannot reopen the app after sign-out.
- The initial session check has a 12-second network fallback bound. The SDK's
  existing short callback wait is used only for actual auth-return URLs, avoiding
  repeated waits for ordinary signed-out visits.

Demo/sample and onboarding theme-preview routes remain explicit preview paths.
This is application-entry behavior, not encryption of browser-local records;
Supabase authentication and owner-only database policies continue to enforce
cloud access. No records are deleted or migrated by the entry check.

## Session duration

The client retains `persistSession:true` and `autoRefreshToken:true`. No maximum
lifetime or inactivity timeout was added. Supabase documents indefinite sessions
by default; actual hosted-project timeout overrides were not inspected or changed.
See [Supabase sessions](https://supabase.com/docs/guides/auth/sessions).

## Verification

`scripts/auth-entry-test.mjs` uses mocked identities to cover saved-profile entry
denial, protected navigation, no private-screen flash, sign-out/reload with cached
tokens, offline continuity and exclusion, stale responses, refresh rejection
versus network failure, mismatched signup drafts, history/cross-tab sign-out and
verified signup continuation. SDK tests cover local logout cleanup, singleton
client initialization, unchanged session persistence and callback-only waiting.
Existing UI fixtures now explicitly authenticate rather than assuming a local
profile grants access. No live emails, accounts, policy submissions or provider
settings were used. Physical-device and real-account QA remain separate.

The client uses `auth-entry-1` and the Settings app uses `settings-pages-1`.
Owner approved and deployed October 20, 2026; see
[Settings production release](deployment-2026-10-20-settings.md).
