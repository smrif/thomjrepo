# Offline App Loading

## Behavior

After an online visit installs the service worker, the hosted app can reopen or
reload without connectivity. Local profile and custody records remain in the
existing browser storage. Logging, Calendar, Settings, and static legal pages
are available offline. Pending custody edits sync automatically when the app
is open and connectivity returns; focus/resume also triggers a sync pass.
Visible, signed-in apps check for custody changes every 15 seconds after sync,
so a receiving device does not have to reconnect after the sender's upload.
Hidden/offline/signed-out apps stop these checks. Downloaded changes refresh
active Calendar/details and Reports/previews as well as Today, without navigating
away from the current view. Idle receiving checks do not rewrite profile settings.

First visits, fresh email sign-in, account deletion, and cloud restoration need
connectivity. Closed or suspended browser apps do not run continuous sync.
Browser-cleared or evicted storage removes offline availability and may remove
unsynced local records. This does not add guaranteed background execution or
change the account-deletion policy of retaining local records.

The `file://` preview does not register a service worker. Offline QA must use
the hosted app or serve `dist/` over localhost after building.

## Implementation

- `scripts/build-static.mjs` copies the installed, lockfile-pinned Supabase UMD
  SDK into `dist/vendor/`, then generates `dist/sw.js` from the worker template.
- The cache version hashes the worker template and all deployed static files.
  Installation downloads a complete shell; a failed download discards that
  installation's incomplete cache and leaves the active worker alone.
- Fetch handling is network-first with static fallback. Only allowlisted
  same-origin shell paths are eligible. Non-GET, Authorization-bearing, API,
  Supabase, and other external requests bypass the worker. No API or auth
  responses are written to Cache Storage.
- Cached HTML responses are normalized when Cloudflare redirects to canonical
  paths, and both extensionless and `.html` legal-page paths work offline.
- Root/index navigation falls back to static index HTML without caching the
  incoming query string, including email-link callback parameters. This does
  not make fresh email-link sign-in available offline; that flow needs connectivity.
- New workers wait for old app tabs to close. They do not force a reload during
  an edit. Activation removes obsolete shell caches, not localStorage records.
- No Supabase schema changes are required.

The lifecycle follows the browser's standard
[service-worker install/activate model](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Verification

Run `npm run test:offline`. The test serves the built deployment, exercises the
real bundled SDK with a synthetic local Supabase API, and never contacts a real
Supabase account. It checks mobile/dark and desktop/light offline reload/reopen,
navigation, retained local edits, automatic reconnect upload without Settings,
API cache exclusion, Cloudflare-style HTML redirects, failed precache safety,
and update activation/cleanup.

`npm run test:sync:devices` uses two isolated browser contexts. The desktop
reconnects first, then receives the phone's later offline upload without a focus
event, reload, Settings visit, or manual sync. It also checks visible Calendar
and Report updates, no periodic profile writes, and protection of an unrelated
older date awaiting conflict review.

For physical-device QA:

1. Visit the deployed app online and allow installation to complete.
2. Disable connectivity, reload or reopen the same browser app, and log a day.
3. Restore connectivity while leaving the app open; do not visit Settings.
4. Resume the app on another signed-in device and verify the new log appears.

The first worker installation requires all static assets to download. Storage
availability and service-worker behavior should also be verified in Safari on
a physical iPhone; Chromium automation alone does not establish that result.
