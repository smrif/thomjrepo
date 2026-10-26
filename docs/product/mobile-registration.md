# Mobile server registration contract — October 26, 2026

The release registration transaction is implemented against the website profile
schema and was applied October 26 only to **Whose Day Mobile Test**
(`ijewfmltnlqpydwuiedb`). Hosted permission checks pass and the ignored local test
flag is enabled. Production authentication remains blocked by the existing
test-project guard. No production configuration, real signup, email or user
acceptance record was changed by this activation.

## Account and data mapping

`profile-mapping.js` maps the website's parent/co-parent labels, children,
activities and appearance into the existing mobile account store. The verified
Auth account supplies sign-in email and user ID. A website report recipient is
not a sign-in identity. Unknown/older/future profile acceptance snapshots are
preserved on the server; restoration never turns them into a new device receipt.
Existing website accounts need no bulk profile copy or acceptance backfill.
Check-in transport and account-qualified compare-and-set updates are reused.
Invalid/unsupported stored data continues to block restoration rather than being
replaced with defaults. Real production-account/history QA remains outstanding.

## Atomic server registration

Prepared migration:
`supabase/migrations/20261026000100_mobile_registration.sql`.

The authenticated `complete_mobile_registration` RPC accepts one attempt UUID,
the intended email, family profile, exact policy versions and client acceptance
timestamp. It takes the account ID and confirmed email from Auth, locks that
account row for registration/deletion serialization, and validates the input.
The function has an empty fixed search path and explicitly qualified tables;
PUBLIC/anonymous execution is revoked. See [Supabase function security](https://supabase.com/docs/guides/database/functions)
and [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html).

- A new profile and `mobile_policy_acceptances` row commit in one transaction.
  An error leaves neither half behind. The profile's legacy agreement columns
  receive this explicit submission only when the profile is newly created.
- Retrying the same account/attempt and exact payload returns the original
  receipt. A changed payload for that attempt is refused. The original timestamp
  is preserved; `recorded_at` is separately stamped by the database.
- If another device or the website already created the profile, the RPC returns
  it without updating it or adding acceptance history. Website edits made after
  a successful attempt are also preserved when its response is retried.
- History is owner-readable under RLS. API clients cannot insert, update,
  delete or truncate it directly. Actual Auth account deletion cascades history
  with the account. This is durable client-reported agreement history, not proof
  of a human gesture or a legal/compliance determination; administrators retain
  database authority. Existing mutable website metadata is not imported as history.

The mobile adapter verifies the returned account, profile version and exact
receipt before committing local profile/receipt/checkpoint and consuming its
pending intent. A lost response or failed local save keeps the draft/intent;
reopening restores the already committed cloud profile without duplicating the
server receipt. Switching accounts cannot publish the old completion locally.
Ordinary profile sync cannot bypass registration to create a new cloud profile
when this adapter is enabled. Settings updates omit email/agreement columns.

## Enablement and remaining release configuration

The optional ignored local configuration is explicit:

```json
{
  "auth": { "enabled": true },
  "sync": { "enabled": true },
  "registration": { "enabled": true, "contractVersion": 1 }
}
```

This is only the relevant fragment; keep the existing separate test-project URL,
publishable key and approved test-inbox restrictions. Enable it only after the
migration is applied and verified in the separate test project. That step is
complete for **Whose Day Mobile Test**. Missing flags preserve the current test app. An enabled
contract with missing auth/sync, an unknown version or the production URL is
refused by the build/runtime. October 26 activation changes only this flag in
the existing ignored local test configuration; auth, sync and inbox restrictions
are preserved.

Before hosted application, review the exact additive migration and target. Never
replay the baseline/bootstrap into an existing project. After application, run
the read-only `supabase/checks/mobile-registration.sql`: exactly one row with all
values true is expected. Record metadata evidence separately from actual user QA.
No server key is needed by the client RPC. Creating an authenticated database
endpoint changes hosted security access and requires action-time confirmation
when performed through the dashboard.

The release candidate still needs final bundle/callback identity, environment
selection and an approved removal of the production auth block. The current
callback remains `whoseday-feasibility://auth/callback`; changing that string
alone does not configure iOS URL schemes or provider redirects. Review those
together, keep test/production secure-session and record namespaces distinct,
and verify existing-user restoration before release activation. Production
deployment, real emails and disposable identity/deletion QA retain their gates.

## Local QA

`pnpm --dir mobile test` includes the isolated PostgreSQL migration/RLS/RPC tests
and actual Supabase SDK requests with an in-memory fetch transport. No network
or real account is used. Cases cover verified identity/email, current versions,
expired/future agreement, malformed family data, injected receipt failure and
rollback, exact retry, changed attempts, protected history, two-account RLS,
legacy profile preservation, deletion cascade/stale identity, local storage
failure, lost server response, a profile created during email return, invalid
receipt responses, stale drafts, offline completion and account changes.

Hosted schema/access verification is complete as recorded below. Real signup,
server receipt recovery through an email return and physical-device checks
remain deferred in [owner QA](mobile-owner-qa.md).

October 26 evidence: all 86 mobile unit/integration tests pass. The rebuilt iOS
17.5 simulator onboarding regression also passes (168 seconds, zero failures):
actual form entry, unfinished draft, explicit agreement, pending-link Save and
leave, synthetic verification and completed-account cold reopen. Nine screenshots
were exported; agreement, pending leave and completed reopen were visually checked.
This is a regression check of the default local flow, not a hosted RPC/device
sign-off. Source hashes and receipt are in ignored
`mobile/.build/ios-onboarding-ui-probe.json`; the result bundle is
`whose-day-files-ui-bit4kZ/result.xcresult`.

The affected onboarding, account, sync, Settings, policy and accessibility browser
suites pass at their phone/landscape sizes. One Settings scroll assertion failed
during the combined pass; both a diagnostic run and the unchanged original
Settings rerun passed. No product defect/root cause was established or marked
fixed. Keep this observation if it recurs on hosted/device QA.

Local logs: `/tmp/whose-day-registration-unit-final.log`,
`/tmp/whose-day-registration-browser-final.log`,
`/tmp/whose-day-registration-browser-followup.log`,
`/tmp/whose-day-registration-settings-diagnostic.log` and
`/tmp/whose-day-registration-native.log`. The preceding `ac17848` hosted run
[passed both jobs](https://github.com/smrif/thomjrepo/actions/runs/40347930607);
the registration implementation's own
[hosted run also passed both jobs](https://github.com/smrif/thomjrepo/actions/runs/40357744730).

## Hosted test-project activation

The owner approved proceeding after reviewing the migration and its new
authenticated endpoint. The Supabase dashboard showed **Whose Day Mobile Test**,
project `ijewfmltnlqpydwuiedb`, and a healthy database. Read-only preflight found
the existing `profiles` table and no registration table/function. The complete
reviewed SQL was pasted, copied back and compared before execution. The editor
reported success. It was applied through the SQL editor; Supabase migration
history metadata was not repaired or changed.

- The read-only metadata query returned one row with all ten checks true,
  including RLS, owner reads, no direct client/anonymous history mutations,
  authenticated-only RPC execution, fixed search path and Auth deletion cascade.
- API requests using only the existing public test-project key returned HTTP 401
  and PostgreSQL `42501` for both history reads (`limit=0`) and RPC execution.
  No real identity or user record was used.
- A transaction-local authenticated role with no JWT subject reached the RPC and
  received exactly `22023: Verified account does not match setup`. The check
  rolled back and wrote no user data. This verifies function execution/refusal,
  not a positive real-user signup.
- The ignored local configuration now enables registration contract v1. The
  test-project, sync and approved-inbox settings are preserved. Production
  refusal remains enforced. No email, new identity or acceptance row was created.
- The simulator build with this test flag succeeds. The browser bundle, copied
  iOS assets and compiled app have matching hashes and include the enabled v1
  flag. Build log: `/tmp/whose-day-registration-enabled-ios-build.log`. This is
  build/configuration evidence, not a real authenticated signup test.

Evidence: ignored `mobile/.build/registration-hosted.json` and
`mobile/.build/registration-hosted-security.png`. Live signup/email return,
receipt/retry and existing-user restoration still require the approved real
account QA pass. Production activation and final callback/signing identity
remain separate release gates.
