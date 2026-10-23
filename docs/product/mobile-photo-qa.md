# iOS photo attachments — October 23, 2026

The account check-in now uses the iOS system `PHPickerViewController` through
the app-owned bridge. It returns only the selected image and does not request
photo-library authorization. The browser file input and Android camera adapter
retain their existing paths. Apple's [system-picker guidance](https://developer.apple.com/videos/play/wwdc2020/10652/)
describes the authorization boundary.

The bridge accepts one image, reads the provider's temporary file inside its
callback and rejects source files over 30 MiB. ImageIO downsamples during decode
to a maximum 1600px dimension and applies orientation before JPEG encoding at
75% quality. The processed attachment must fit within 3 MiB and the existing
record validator. The stored image is this processed copy; it is not a promise
to preserve the original camera file or its metadata. Cancel and adaptive sheet
dismissal resolve without replacing the draft attachment.
Each picker request has its own identity, so a late cancellation/dismissal
completion cannot settle a newly opened request. The combined UI sequence
exercises cancel → reopen → swipe-dismiss → reopen → choose/save.

The native Add screenshot control is a real button. Remove screenshot has an
explicit accessible name and a 44px target; the add target is at least 44px high.

## First-pass QA

The simulator-only `photo-write`/`photo-read` modes use a separate
`sim-photo-probe` account scope and synthetic Keychain identity. No server sync
or real authentication runs. The XCTest runner seeds the non-sensitive app-icon
image into the dedicated simulator and explicitly revokes photo-library access.
The read phase requires permission to remain denied.

The test covers picker cancellation, swipe dismissal, selecting the seeded image,
device save, process termination, reopened preview, and abandoning an unsaved
image-removal draft. The probe compares the complete saved record and image
hashes before/after restart, checks its pending-sync checkpoint, and verifies
that JSON and CSV retain the complete processed image. The host runner separately
reads the SQLite record and verifies those hashes before recording success.

The final combined native run passed all three cases with zero failures in
237 seconds on iPhone 15 Pro / iOS 17.5 at 13:50 PDT. The photo case took 72
seconds; all 16 screenshots were exported and visually checked. The stored JPEG
is 1024×1024 and 74,005 bytes; comparison to the 1024px source shows less than
0.5 mean byte-value difference per color channel after JPEG processing. Exact
processed-image/record hashes survive restart. The combined suite includes native
Files and backup cases, without choosing share recipients.

The combined sequence exposed a late dismissal completion that could clear a
newly opened photo request. Request identities now reject stale completions;
the final cancel/reopen/swipe/reopen/select sequence passes with this fix.

Earlier runs identified check-in locator differences and an XCTest interruption-
discovery stall on the visible remove control. The final test uses its asserted
visible center for that tap. The Photos/Albums segment consumed the initial swipe
attempt; dragging from the observed sheet edge dismisses it and unlocks the app.
The dismissal delegate is also installed after presentation. Incomplete runs are
not counted as passes.

All 73 mobile unit checks pass. Check-in and account UI regressions pass at
390px/320px, including removal/reselection, save failure/retry, offline recovery
and account separation. The 87-check accessibility/layout pass also passes at
320px/390px/844px. Browser QA uses isolated fixtures and blocked external calls.

## Reproduce and boundaries

```
pnpm --dir mobile probe:files:ios SIMULATOR_UUID photo
```

Omit `photo` to run Files, backup and photo cases together. Use a dedicated
booted simulator only: this adds a synthetic photo and revokes this prototype
app's photo permission on that simulator. Physical devices are rejected.

Evidence lives in ignored `mobile/.build/ios-files-ui-probe.json` and its
referenced XCTest screenshots/result bundle. It includes web, native and test
source hashes, the selected image file, permission status and record/image
hashes. Debug errors stay in synthetic `probe:photo-error` storage.

Final evidence: `mobile/.build/ios-files-ui-probe.json` and its preserved copy
`mobile/.build/ios-photo-ui-probe.json` have `passed: true`, `scenario: all` and
`photoPermission: denied`. Screenshots, manifest and the selected JPEG are under
`mobile/.build/ios-files-ui/whose-day-files-ui-nQbN37/`; all three source hashes
were checked against the current files before committing.

Physical iPhone/iPad behavior, iCloud-only assets and interrupted downloads,
large/rotated/HEIC images, VoiceOver, device keyboards and production signing
remain in [owner QA](mobile-owner-qa.md). This synthetic first pass does not
establish physical-device or cloud-provider readiness.
