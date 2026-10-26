# Native candidate packaging — October 26, 2026

The candidate web profile now has an isolated native Release build path and an
unsigned device archive path. Existing development build commands continue to
use the lab assets. The current app name, bundle identifier, callback, version
and device scope are preserved; they still need final owner review.

## Commands

On a Mac with Xcode and installed locked mobile dependencies:

```sh
pnpm --dir mobile build:candidate:ios
pnpm --dir mobile probe:candidate:ios DEDICATED_WHOSE_DAY_SIMULATOR_UUID
pnpm --dir mobile archive:candidate:ios
```

The simulator build uses Release, the host architecture and local ad-hoc signing.
The archive uses Release for a generic iOS device with signing disabled and an
empty developer team. No provisioning update, signed export, upload, enrollment
or store submission is performed. The unsigned `.xcarchive` is for inspection;
it cannot be installed on an iPhone or submitted as-is.

Each build creates a workspace under the system temporary directory, outside the
cloud-managed repository. Only tracked native source paths are copied; generated
development public/config files and user workspace state are excluded. Locked
dependencies are linked for compilation. `cap copy ios` runs only in the isolated
project, using its own candidate web folder and generated native configuration.
The committed SPM graph is retained. `WHOSE_DAY_IOS_PACKAGES` can select an existing
local Xcode source-package cache; it is optional.

The pipeline rebuilds and validates the candidate web payload, verifies the native
resource copy, then verifies every web file again inside the compiled `.app` or
archive. Only Capacitor's two empty Cordova compatibility stubs may be added;
nonempty stubs, changed bytes, missing files and other extra files fail the build.
The built native config must match its staged copy. Bundle name/ID, callback and
platform must match the existing native project. Build settings must show Release
without DEBUG or a developer team. Executables containing lab arguments or native
probe markers fail verification. Archive verification also checks that it is
unsigned. All manifests retain `readyForRelease: false` and the owner gates.

The native bridge now omits probe registrations and method bodies in Release.
Debug simulator builds retain `testMode` and `probeBackupFile`; Debug device
builds retain only the inert `testMode` result needed by development startup.
Transaction failure injection remains rejected outside the explicit Debug
simulator probe path.

Development web output, copied native public/config, local auth config, Capacitor
config and the Xcode project are hashed before and after the isolated build.
Changes to those protected inputs fail verification. A native-operation lock
prevents overlapping candidate build/QA runs. If a process is forcibly killed,
inspect `.build/candidate-native.lock/owner.json` and confirm that its process has
ended before manually removing a stale lock; do not bypass an active operation.

## First QA pass and evidence

The UI runner requires an **unconfigured** candidate. A configured candidate is
refused so this automated pass cannot send email or use live provider accounts.
It creates a fresh simulator using the named dedicated simulator's runtime and
device type. It temporarily stops that reference device to limit memory use,
then restores its prior boot state and deletes the fresh QA device. The original
simulator's app/container is never replaced or reset.

Release XCTest checks welcome with disabled/unconfigured signup/sign-in, absence
of sample/lab links, both bundled policy readers and their return navigation,
termination/reopen, and ignored lab launch arguments. All six expected screenshots are required, so a skipped test cannot pass. Their
hashes are recorded; the screenshots were exported and visually inspected. This verifies actual installed candidate entry;
it does not verify authenticated records or provider behavior. Debug runs skip
this Release-only case.

All 94 mobile unit/integration checks pass, including native resource tampering,
source path/symlink refusal, signing/platform/DEBUG restrictions and native
identity/probe-marker rejection, and skipped/incomplete native UI runs. Candidate browser boundary checks remain part of
CI. The ordinary Debug build and synthetic account/backup/rollback restart probes
also pass after removing Release probe methods. Native compilation/XCTest evidence is local to this Mac, not hosted Linux CI.

Ignored evidence:

- `mobile/.build/ios-candidate-simulator.json`: inspected simulator app path,
  Release settings, identity, executable hash, web manifest and preservation check.
- `mobile/.build/ios-candidate-ui.json`: fresh-device XCTest result bundle,
  screenshot paths, inspected executable and boot-state restoration.
- `mobile/.build/ios-candidate-archive.json`: unsigned `.xcarchive`/app paths,
  device Release settings and the same resource/binary checks.
- `mobile/.build/ios-candidate-last-attempt.json`: latest build attempt status;
  a failed attempt does not replace a previous successful evidence record.

Temporary artifacts are recoverable while their system temp directories remain;
rebuild if macOS removes them. No credentials or real recipient data belong in
these evidence records.

## Remaining release gates

Approve and configure the final identity/team/callback and minimum OS/device scope;
complete approved signup/server-receipt/existing-account/deletion QA; review final
native purpose text, privacy/support/listing/assets; then build and verify the
signed archive and physical-device behavior. Production activation and any
TestFlight/App Store action still require their existing approvals. See
[owner QA](mobile-owner-qa.md), [release preparation](mobile-release-preparation.md)
and [candidate web packaging](mobile-candidate-packaging.md).
