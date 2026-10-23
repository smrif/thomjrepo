# Native iOS Files and sharing QA — October 23, 2026

`NativeExportQA` is a separate simulator-only XCTest bundle. It drives the real
Files pickers and share sheets through the debug app's synthetic account scope.
It does not require desktop Simulator UI automation or a signed-in Apple account.
The test source is not compiled into the App application target.

## Current first-pass results

| Path | Observed result |
| --- | --- |
| Save PDF → Browse → Cancel | Pass: returns “PDF save cancelled.” and unlocks the app. |
| Share PDF → Close | Pass: returns “Sharing cancelled.” without choosing a recipient. |
| Save CSV → swipe-dismiss sheet | Pass: adaptive dismissal returns “CSV export cancelled.” and unlocks the app. |
| Share CSV → Close | Pass: returns cancellation without choosing a recipient. |
| JSON backup save → Cancel | Pass: returns “Backup export cancelled.” |
| JSON import → Cancel | Pass: returns “No backup selected.” |
| Records after the cancellation sequence | Pass: the complete selected diary report matches its pre-test text. |
| Local JSON save and re-selection | Pass: a uniquely named JSON backup is saved to On My iPhone, selected back through Files, and accepted by checksum/account validation. Preview shows eight records and one screenshot; cancelling preview preserves the original complete diary report. |

The final combined run passed both cases with zero failures in 151 seconds on
the iPhone 15 Pro / iOS 17.5 simulator, October 23 at 12:27 PDT. All ten screenshots
were exported and visually reviewed. The local backup case took 72 seconds and
the cancellation case 79 seconds. The system picker exposes Cancel at the Browse
root; inside a folder, the test first returns through Browse. A separate swipe
gesture exercises adaptive dismissal.

An earlier combined run exposed a test locator/timing failure after the local
save changed the picker's remembered folder. The test now waits for either
Cancel or Browse and finds Browse across the picker hierarchy. The final run
includes that same local-save → cancellation sequence. No production adapter
change was required. All 73 mobile unit checks, project plist validation and
the application-only release inventory also pass.

Final ignored evidence: `mobile/.build/ios-files-ui-probe.json` has
`passed: true`, `scenario: all`, web/test source hashes and the result bundle.
Its ten screenshots and manifest are under
`mobile/.build/ios-files-ui/whose-day-files-ui-chjnJH/`; the result bundle is
`$TMPDIR/whose-day-files-ui-chjnJH/result.xcresult`.

## Reproduce

Use a dedicated booted iOS 17.5-or-later simulator, with the normal locked mobile
dependencies and Xcode installed:

```
pnpm --dir mobile probe:files:ios SIMULATOR_UUID
```

Optional final arguments `cancellation` and `local-backup` select one case. The
default runs both. The runner rejects physical devices, bundles/syncs current
assets, builds the separate test scheme, and seeds only synthetic report records.
It uses bounded process timeouts and never counts an observed failed XCTest as
a successful run. A failed run is marked failed even if Xcode stalls during
diagnostic cleanup.

Evidence is ignored under `mobile/.build/ios-files-ui-probe.json`, including the
scenario, result-bundle path, exported screenshots and source hashes. Each run
uses a separate temporary `.xcresult`. Simulator-local files use a `uiqa` name;
they are test exports, not copies of the owner's real records.

## Remaining owner/provider checks

Physical iPhone installation, actual iCloud/third-party Files providers, receiving
apps, clipboard, interruption/locked-device behavior and VoiceOver remain in
[owner QA](mobile-owner-qa.md). Cancellation and file preparation do not establish
recipient delivery. No email, message, real account creation/deletion, production
deployment or App Store/TestFlight action is performed by this runner.
