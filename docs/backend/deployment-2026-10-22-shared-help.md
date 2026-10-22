# October 22, 2026 Shared Help Release

Published at the owner's request to https://whosedayapp.com/ after local smoke
testing. Both help branches now collect activities and an optional note once
for all applicable children, then continue directly to the diary. Shared help
displays together in Calendar, reports and backup previews. Unchanged historical
child-specific answers retain their original data.

- Worker version: `e7f736c3-59c0-4d7b-88fd-5b55431d2441`.
- Previous version: `944f08c4-252f-4e8f-a3b5-81e37ae5fb6a`.
- Published from the local working tree based on `9f4011f`; no Git commit,
  push or hosted CI run was created by this release.
- Production comparison identified only `app.js`, `index.html` and generated
  `sw.js` changes. All other 45 public assets matched before deployment.
- Shared JavaScript includes the optional mobile platform adapters; the website
  continues using browser storage. Native projects and test configuration are
  outside the production build. This is a website release, not an App Store release.
- Existing Worker routes, bindings, database schema and provider settings retained.

Verification:

- Full local release suite: 48 passed, zero failures/skips, about 120 seconds.
- Static build boundary passed for all 48 public files.
- Wrangler 4.149.0 deployment succeeded, uploading exactly three changed assets.
- All 48 published static files matched the tested build byte-for-byte.
- Production API health and legacy origin returned 200; www returned a
  query-preserving 308 redirect.
- Live browser checks passed for both help directions at 390px/dark and
  1280px/light: one shared screen, required activity choice, direct diary
  continuation, Back recovery, save/reload/edit recovery, and one shared help
  row in Calendar and reports. No horizontal overflow or page errors occurred.

Live browser checks used isolated synthetic browser-local records and a mocked
sign-in/backend. Service workers were blocked in these browser checks; external
requests and non-GET/HEAD production requests were blocked. No real account
writes, sign-in emails or test analytics were sent. Offline update behavior was
covered by the local release suite. Physical-device/account QA remains separate.
