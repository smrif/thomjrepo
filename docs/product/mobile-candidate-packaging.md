# Candidate web packaging — October 26, 2026

The mobile build now has a separate candidate **web payload** profile. It removes
developer entry points while retaining the account, guided onboarding, Settings,
records and policy implementations. This is release preparation, not a signed
release candidate, production activation or store submission.

## Build and output

From the repository root:

```sh
pnpm --dir mobile build:candidate
pnpm --dir mobile test:candidate
```

Output is `mobile/.build/candidate/www`; its sibling `manifest.json` records
SHA-256 and byte counts for every bundled file, policy versions, configuration
state and remaining release gates. `readyForRelease` is deliberately false.
Builds validate configuration before creating output, validate the staged payload
before replacing the previous candidate, and recover the previous directory if
the final move fails. Failed source-boundary checks leave the last good candidate
intact. The candidate does not overwrite `mobile/www`, the running local preview
or copied native development assets.

Only the account route and its shared assets are included, with a small root
redirect. There is no lab entry/runtime, `/preview`, standalone `/checkin`, browser
sample identity chooser, shortcut profile form, mock-network control or native
JavaScript probe module. Shared website demo fixtures and the `?reset` action are
removed. Inline product handlers keep their existing global scope.

The build compiles `__WHOSE_DAY_LAB__` false and checks the actual emitted files
for forbidden routes and fixture markers. Source sanitizers fail on missing or
duplicated boundaries so markup drift cannot silently restore the removed tools.
Development builds compile the flag true and retain the existing QA routes.

## Configuration and entry

The optional ignored `mobile/config.candidate.local.json` is separate from
`config.local.json`. It is never automatically created or populated from the
development file. Without it, authentication is disabled; the native welcome
screen explains that sign-in is unconfigured and disables signup/sign-in.

Explicit candidate configuration still uses the existing test-project validator,
sync requirements and registration-v1 gate. Production auth remains refused.
Never put service credentials in a web payload. The manifest contains no keys,
emails or tokens; configured public client settings are bundled only when
explicitly supplied in the candidate file.

In a browser, candidate entry displays welcome and the bundled policy reader,
with signup/sign-in disabled. Existing browser preview identities and reserved QA
query parameters cannot mount account records. Installed native authentication
is the only account entry path. Test-build wording remains until release
environment and disclosures are reviewed.

## First QA pass

- Candidate sanitization and payload rejection checks pass, including renamed
  boundaries, extra routes/files, fixture leakage, symbolic links and missing
  entries.
- An isolated build fixture verifies that development config is ignored, an
  explicitly configured synthetic test project is accepted, production/malformed
  config is rejected, and early/late build failures preserve the last candidate
  and development output. No provider requests or credentials are used.
- Actual bundled browser QA passes at 320px/light and 390px/dark. Default and old
  lab/demo/reset/sync/onboarding URLs preserve browser storage and cannot enter
  sample accounts. Removed routes return 404. Policies work offline and preserve
  source navigation; no page errors or external requests occur.
- The unconfigured native branch's DOM wiring also passes with a browser platform
  shim. That shim does not verify the native bridge, installed candidate or auth.
- The 88 existing/new unit checks and the isolated build check pass. Development
  onboarding, account, sync and policy browser regressions also pass at both phone
  widths. CI runs the default candidate build and browser boundary checks without
  local auth configuration.

Ignored evidence: `mobile/.build/candidate/manifest.json`,
`mobile/.build/candidate-qa/result.json` and `320-welcome.png` / `390-welcome.png`
in that QA directory. Development native regression results are tracked in
[owner QA](mobile-owner-qa.md).

## Remaining release work

The ordinary `build:ios`, Capacitor config and native development artifact still
use `www`. Separate native candidate commands now stage Release simulator builds
and unsigned device inspection archives, with copied/compiled resource and binary
checks. Actual unconfigured candidate welcome/policy/reopen QA passes on a fresh
simulator. See [native candidate packaging](mobile-native-candidate.md) for commands
and evidence. Native probe methods are omitted from Release; development simulator
tools remain available.

Before a release, approve app identity/team/callback/device scope, complete the
approved account/provider checks, and verify the final signed archive and physical
device. The unsigned inspection archive does not satisfy these remaining gates.

Actual signup/email-return, server receipt/retry, production activation, live
deletion, privacy/store assets and TestFlight/App Store submission remain under
their existing owner approvals. See [release preparation](mobile-release-preparation.md)
and [owner QA](mobile-owner-qa.md). No production, account or recipient mutation
was part of this packaging increment.
