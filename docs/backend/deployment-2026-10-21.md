# October 21, 2026 Backup and Login Message Release

Published at the owner's request, including the pending October 20 portable
backup/restore changes and the approved login-message visibility improvement.

- Worker version: `e0536c73-6d74-43c4-8284-1c7b2c60ce8e`.
- Previous version: `e0c935c1-bc15-4890-9f0d-e0cf0db73c70`.
- Canonical site: https://whosedayapp.com/.
- Deployed from the reviewed local working tree based on `9f4011f`;
  this release did not create a Git commit, push, or hosted CI run.
- Existing routes and bindings retained; no database migration or provider
  configuration change.

Settings now supports full JSON backup downloads, embedded screenshots,
same-account import previews, conflict choices, and rollback/restart recovery.
See [portable backups](portable-backups.md). Login messages now appear directly
under the send button, with larger left-aligned text and a contrasting bordered
error panel in both themes.

## Verification

- Full local release suite: 46 passed, zero failures/skips, about 111 seconds.
- Fresh production build and Wrangler 4.149.0 packaging/deployment succeeded.
- All 42 live static files matched the build byte-for-byte.
- Canonical www redirect returned 308 and preserved the query; legacy origin
  and API health returned 200.
- Live browser checks passed at 390px/light, 390px/dark, and 1280px/light:
  error styling/placement, no horizontal overflow, actual JSON download and
  parsing, and same-account import preview. No page errors occurred.

Live browser checks used synthetic browser-local records and a mocked backend,
blocked service workers and non-GET/HEAD production requests, and sent no real
sign-in emails or cloud writes. An initial verification fixture returned no
session during backup download; correcting that synthetic fixture allowed the
checks to pass without any application change. Real-device/account QA remains
separate from these automated checks.
