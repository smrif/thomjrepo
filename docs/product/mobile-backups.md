# Mobile JSON backup and restore — October 23, 2026

The account entry connects Settings → Download full backup / Restore from backup.
iOS uses the system Files document picker. Android uses the system create/open
document activities. Browser review uses a JSON download and file input. The
standalone check-in sample keeps these tools disabled. CSV/report sharing remains
separate work; no production deployment or live-account operation is included.

## Format and ownership

The implementation reuses `backup.js`, its `whose-day-backup` v1 envelope,
SHA-256 payload checksum, record comparison, historical locks and profile opt-in.
A mobile backup adds optional `account.project` inside the checked payload. The
current shared parser accepts that field and requires an exact match with the
active environment, including whether the field is absent. Existing website
backups without it retain their existing behavior. The separate mobile test app
rejects unqualified website backups and other projects, even for a matching user
ID/email; it does not import production data. Older website clients reject the
new project-qualified files rather than silently importing test data.

Profiles, notes, original timestamps, historical child names and full images are
included. Tokens, sign-in state, device IDs and cloud comparison checkpoints are
excluded. A file cannot sign a user in or restore a deleted account. The checksum
detects alteration/damage, not authorship; these JSON files are not encrypted.
The shared backup screen explains their sensitivity before exporting.

All imported records must also pass the mobile record validator. This prototype
supports JPEG, PNG and WebP images under the existing per-record limit, up to
20,000 combined records and a 25 MB UTF-8 backup file. Unsupported legacy child
activity settings or wider website record/image shapes fail explicitly; the
file and current records are preserved. Mobile imports do not fabricate policy
acceptance or change sign-in email.

## Review and durable restore

Choosing a file verifies it locally and shows additions, identical dates,
differing copies, expandable details/images and optional profile/preferences.
Nothing is written until Restore selected data. Differing dates default to the
current copy; existing read-only history stays protected. Missing historical
dates and replaceable unknown-day markers follow the shared recovery rules.
Unrelated current dates remain. Navigation/cancellation/account changes discard
pending review; changed in-memory data requires a fresh review and choices.

At apply, the account closes its stores, drains pending writes/sync, validates
the expected raw rows and account ownership, then performs a single guarded
SQLite transaction for all selected records and optional profile. The browser
uses one IndexedDB transaction. A competing record/profile write or deletion
checkpoint rejects the entire transaction. Each committed row is read back
before reporting success. The prior stores stay revoked, and the user reopens
the account before normal UI/sync resumes.

A transaction interruption keeps either all prior data or the complete restore;
there is no multi-row partial state to roll back in JavaScript. If commit or
readback cannot be confirmed, the app says to reopen and check the saved copy,
without claiming that nothing changed. Fresh startup reads the actual committed
data before entering the product. Restored rows reset comparison checkpoints so
different cloud copies enter review; matching copies can reconcile normally.
They do not silently replace differing cloud data.

## Files behavior

Exports use a fixed safe JSON filename and report the native picker result.
Cancellation returns to Settings; an Android provider write failure does not
claim success and can leave a partial destination file. Import reads are bounded
and UTF-8 checked before JavaScript parsing. iOS reads a coordinated copy with
security-scoped access when needed and removes its temporary export/import copy;
user-selected provider originals are kept. No broad storage permission or
persistent provider access is requested.

Implementation references: [Apple document picker](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller),
[Android document storage](https://developer.android.com/training/data-storage/shared/documents-files).

## Verification

- `pnpm --dir mobile test`: 68 checks, including mobile format/ownership, selected
  restore, locked history, stale review/CAS, account changes, deletion races,
  failed transactions and lost successful responses, and subsequent cloud review.
- `node --test scripts/backup-test.mjs`: 12 shared format/merge/recovery checks,
  including existing unqualified files and new project-qualified files.
- `pnpm --dir mobile test:backup`: actual JSON download and image round-trip,
  file preview/cancel, injected second-write failure with transaction rollback,
  reopen/retry, selected records/profile and offline recovery, locked history,
  damaged files and project/account refusal at 390px and 320px. Screenshots are
  in ignored `mobile/.build/backup/`.
- `pnpm --dir mobile probe:backup:ios SIMULATOR_UUID`: dedicated synthetic
  `sim-backup-probe` scope. Exercises the production file codec, injects a SQLite
  failure after the first write to prove rollback, restores a selected image/note
  plus profile, and relaunches to verify their recovery and pending checkpoints.
  The file/rollback probe entry points require DEBUG simulator launch arguments.

The signed iOS 17.5 simulator backup probe passed October 23: UTF-8 JSON file
round-trip, actual SQLite rollback after the first write, selected restore and
profile/note/image/checkpoint recovery across process termination. Evidence is in
ignored `mobile/.build/ios-backup-probe.json`. No network was used.

Android debug compilation and lint also passed October 23. Generated build
outputs and a fresh copy of the current source now live in a temporary build
workspace to avoid duplicate generated resources/bytecode in the cloud-managed
checkout. This is compile/lint evidence, not Android provider runtime QA.

The separate simulator-only XCTest bundle also saves a uniquely named backup
to On My iPhone, selects it through Files and validates its checksum/account
preview (eight records, one screenshot). Import/export cancellation and cancelling
the preview preserve the complete diary report. Both UI cases pass together;
see [native file QA](mobile-native-file-qa.md).

Physical/cloud Files-provider behavior, large histories, physical-device
accessibility and real authenticated sync remain owner/device QA. This does not
claim physical-iPhone sign-off or a production migration path.
