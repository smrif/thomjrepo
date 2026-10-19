# Policy Acceptance Tracking

## Scope

Deployed October 13, 2026 as Worker `d0452630-30ee-4b89-ae29-34a8c275b9e0`
with the owner's requested release; live acceptance QA remains pending. Existing
Supabase profile columns are sufficient; no migration or production edit is needed.
This records the latest client-reported acceptance, not an immutable audit ledger
or a legal/compliance determination. A user can modify their own profile through
the existing API; timestamps use the device clock, not a server attestation.

## Capture and Sync

- Onboarding records both document versions and the submission time only after
  the user checks the agreement box and submits a valid form. Duplicate submissions
  are disabled while account identity is resolved. Navigating away cancels saving.
- Onboarding preview does not persist consent, attribute a real account, or sync,
  even when a returning user's saved profile exists in that browser.
- Settings prechecks agreement only when local metadata records the current
  versions and valid timestamps. A legacy/stale record is not presented as current
  agreement. Normal Settings edits preserve the old record and do not force re-consent.
- An explicitly checked/submitted Settings agreement captures current versions.
  Unchecking a prefilled box is not treated as retroactive revocation/deletion of
  the previous acceptance record; no new acceptance is recorded for that action.
- Signed-in acceptance records the current account ID. Offline/signed-out capture
  remains pending for the entered email and binds once to the first matching
  authenticated identity during profile sync. A different user ID cannot inherit
  it later, even if that user has the same email after account recreation.
- Retry, normal sync, and reload reuse the original timestamp. An old local Boolean
  can be labeled `alpha-local` for a matching new profile but receives no invented
  time. Existing cloud versions/times, including unknown or missing metadata, are
  preserved unless a newer explicit current-version acceptance legitimately applies.
- When comparing with the fetched profile, a stale client preserves unknown/future
  cloud versions and later cloud timestamps. Restore replaces local acceptance metadata with the restored
  account's metadata instead of combining different accounts' records.

Profile upserts are still mutable, last-write-wins operations. This client-side
comparison is not a server-enforced concurrency guard; an older client or a
concurrent write can still replace profile metadata. Server-enforced acceptance
history/concurrency protection needs separate design before treating these fields
as authoritative legal evidence. No such guarantee is claimed by this release.

## Versioned Documents

Both current documents are version `2026-10-13`. Agreement links point to the
frozen HTML copies in `assets/legal/2026-10-13/`, not mutable latest-policy pages.
Their hashes are recorded in `assets/legal/manifest.json`. Current public policy
text is unchanged; only version metadata was added to the latest pages.

For a future substantive update, add new versioned copies, update the current
version constants and agreement links, add hashes, and test the consistency.
Keep old copies available; do not edit them under their existing version/path.
The static build and service-worker asset list already include nested assets,
so the exact linked policy copies are available after offline shell installation.

Mandatory re-consent/blocking is deliberately not enabled. An owner/legal decision
must establish when and how a policy change requires it. Existing profiles are
not bulk-updated and earlier acceptances are not relabeled as the current policy.

## Verification

```sh
node scripts/policy-acceptance-test.mjs
node scripts/policy-acceptance-ui-test.mjs
```

Unit cases cover timestamp capture/retry, offline attribution, account switching,
legacy uncertainty, cloud restore, explicit upgrades, future/newer preservation,
archived hashes, and agreement links. Browser cases use a mocked backend only,
covering onboarding, disabled duplicate submission, Settings save/restore,
explicit renewal, offline/reconnect, and responsive immutable policy pages.

Verification on October 13, 2026: 53 targeted checks and five browser scenarios
passed against local/mocked backends, including preview and navigation guards.
The full local release command is recorded separately in `release-checks.md`.

Owner QA remains in [the deferred QA queue](owner-qa.md). Deployment occurred
with the owner's requested release; see [verification](deployment-2026-10-13.md).
