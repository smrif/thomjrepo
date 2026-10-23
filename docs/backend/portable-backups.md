# Portable Backup and Restore

Implemented locally October 20, 2026 on `codex/restorable-backups`. Production
release and owner-assisted QA are not part of this implementation request.

Release follow-up: the owner approved deployment October 21. The feature is live
with Worker `e0536c73-6d74-43c4-8284-1c7b2c60ce8e`; see
[deployment verification](deployment-2026-10-21.md). Real-device/account QA remains
separate.

## User flow

Settings → Data & export has three focused destinations: Download full backup,
Restore from backup, and the existing CSV export. Download creates a JSON file
from records currently saved on this device. Restore reads that file locally,
verifies it, and presents counts, date range, new dates, identical records,
different copies, and optional profile/preferences restoration. Different copies
can be expanded to compare their children/outcome, activity details, full notes,
logged time, context, and screenshot before selecting one. Reading or
canceling a file does not write app data. Restore selected data is the explicit
apply action; a plan with no selected changes cannot be applied.

Backups contain private family records and are not password-protected. The app
shows this before download. Records only on another device or in the cloud need
to sync here before they can be included. The downloaded file remains unchanged
by import; keep it as an independent recovery copy.

## Format v1

`backup.js` owns the pure format/validation/merge/storage functions. The envelope
contains `format: "whose-day-backup"`, `version: 1`, `exportedAt`, `account`,
`settings`, `entries`, and a canonical-payload SHA-256 `checksum`. It includes
complete embedded raster screenshot data URLs, original logged timestamps,
legacy/unknown-day markers, historical child names, notes, and profile settings.
No sign-in tokens, credentials, device IDs, cached sync baselines/status, or
browser/session bookkeeping are exported. Settings use an explicit field list.

The checksum detects damaged or changed files; it is not a signature, proof of
ownership, or independent verification of an entry. JSON is not encrypted.
Parsing rejects unsupported versions, unsafe object keys, invalid dates/shapes,
external/executable screenshot URLs, excessive depth/record counts, and files
over 25 MB. Supported embedded image types are PNG, JPEG/JPG, GIF, WebP, AVIF,
BMP, HEIC, and HEIF; no external image fetching occurs. CSV cannot be imported.

October 23 mobile integration adds optional `account.project` to v1. It is
checksum-protected and must match the active environment exactly, including
whether it is absent. Existing unqualified website files remain supported by
the website; the separate mobile test app refuses them and other projects.
See [mobile backups](../product/mobile-backups.md) for native storage/Files limits.
This shared format extension is local branch work; the production deployment
listed above predates it.

## Merge and account rules

- The backup's account ID must match the currently authenticated/cached returning
  account. Signing in is still necessary on a new device; a backup cannot sign a
  user in or recover a deleted/recreated account with a different Auth ID.
- Missing dates are restored with their original content and timestamps. Existing
  identical dates are skipped; unrelated current dates remain unchanged.
- Different dates default to keeping the current copy. The user may select the
  backup copy for editable dates. Existing historical read-only records cannot
  be replaced. Automatically generated `not-logged` markers with `missedAt` can
  be replaced during recovery; intentional skips and actual historical records
  stay protected. This exception restores missing records, not ordinary backfill.
- Profile/preferences restoration is opt-in. Parent labels, children, activities,
  purpose, and appearance may restore. Current sign-in email, identity, and policy
  acceptance are preserved, even though the file retains original policy metadata.
  Historical child display names in records are not rewritten.
- The app waits for an in-flight sync and rechecks the account and saved snapshot
  before committing. If data changed while previewing, it shows an updated review
  and resets choices; another apply is required. Navigation/account loss invalidates
  a pending file read and preview.
- Changed dates lose only their per-account sync comparison baselines. Therefore
  an identical cloud copy can match normally, but a different cloud copy is held
  for existing conflict review instead of being silently overwritten by the file.

## Storage failure and restart recovery

Restore pauses new cloud sync while waiting/committing. Before writing local
entries, optional settings, or affected sync baselines, it saves the prior raw
values in `whose_day_restore_journal_v1`. On a write failure it rolls them back;
if the tab closes mid-commit, startup rolls back before normal app access/sync.
The large entry value rolls back first. An unfinished/failed recovery blocks
protected screens and cloud sync and asks for reload while preserving the journal.
A missing recovery module with a pending journal also fails closed.

Browser quota still applies and can be much lower than the file-size limit.
The recovery journal needs space for a copy of current affected data. A restore
that cannot fit fails without clearing existing records. No general guarantee
of unlimited browser storage or cross-tab database transactions is made.

Imported text is escaped at rendering boundaries in Settings activities, Today,
check-in summaries, Calendar details, and the log. Original notes/names remain
unchanged in storage and re-export, including angle brackets and punctuation.

## Verification

- `scripts/backup-test.mjs`: full content/screenshot round-trip, checksum/schema/
  size/unsafe-data rejection, same-account restriction, locked/editable/placeholder
  conflicts, profile opt-in and policy preservation, sync-baseline handling,
  quota rollback, interrupted recovery and failed-rollback journal retention.
- `scripts/backup-ui-test.mjs`: actual download/file-input/preview/apply, reload,
  screenshot rendering and literal unsafe-looking text, profile/policy preservation,
  invalid/wrong-account files, conflict choices, stale preview, storage failure,
  canceled asynchronous reads, offline operation, cloud conflict preservation,
  restart recovery, and missing-module failure at mobile/dark and desktop/light.
- Existing auth, deletion, sync, policy, Reports, Trends, and app smoke tests remain
  in the release suite. The static build and service-worker shell include backup.js.

All test data is synthetic and cloud operations use mocks. No test emails,
production account writes/deletions, real policy submissions, or owner-assisted
QA are performed. Published policy snapshots are unchanged; the planned policy
refresh must describe this feature before a release that changes disclosures.

Cold offline follow-up: the existing service-worker regression now creates and
verifies a JSON backup after closing the tab and reopening the cached app offline.
It passes on both viewports. Optional profile restoration also removes stale
legacy activity preferences absent from the backup, while leaving current auth
and policy fields untouched.
