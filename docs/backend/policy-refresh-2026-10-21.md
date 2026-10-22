# October 21 Terms and Privacy Review

## Publication follow-up

The owner reviewed and approved the policy language October 21. Published as
Worker `30f76121-9223-431f-b915-5131d51cf91a`, replacing
`e0536c73-6d74-43c4-8284-1c7b2c60ce8e`. The local candidate/review notes below
record preparation context. The owner accepted the current wording without new
contact or fixed-retention promises. Provider-setting verification, support
delivery, and eventual App Store review remain separate backlog work. No new
mandatory re-consent requirement or acceptance migration was requested or enabled.

Post-deployment verification: all 44 production static files matched the approved
build byte-for-byte, including both policy versions, the manifest, current public
pages, and agreement links in the app. The www redirect, legacy origin, and health
endpoint passed. The final focused policy run passed 56 checks; the full 46-result
release suite passed during preparation.

Verification: full local release suite passed all 46 results with zero failures
or skips (about 105 seconds), including responsive policy pages, agreement
version capture, offline behavior, sync and backup regressions. The build boundary
passed with 44 static files. A final focused policy run passed 56 checks,
including hashes of both unchanged October 13 archives and preservation of
October 13 account acceptance. No production policy or account state was changed.

Prepared locally against the deployed web app. The new public pages and frozen
`assets/legal/2026-10-21/` copies are candidates for publication, not a record of
legal approval. The October 13 snapshots remain unchanged. Agreement links and
client version constants now select October 21 for future explicit submissions;
existing acceptance records are not migrated or restamped. No mandatory
re-consent gate was added.

## Changes for review

- Identify Pueblo Apps LLC as operator and use early access wording.
- Explain verified email-link access, offline access for returning devices,
  local storage separation by browser/domain, and retained records after sign-out.
- Explain full JSON contents, lack of password protection, local import preview,
  same-account restriction, deleted/recreated account limitation, and sync after
  restore. Distinguish JSON recovery from CSV and report exports.
- Correct account deletion to Settings → Delete account and describe separate
  local files, browser records, recipient copies, and provider backup/log copies.
- Explain use of account/content/agreement/device information; distinguish the
  absence of product analytics from provider operational processing.
- Replace automatic continued-use acceptance language with the app's actual
  explicit agreement/version behavior. No new legal enforcement mechanism is
  implemented by this copy change.

## Decisions and verification still needed

1. Confirm the public support/privacy contact. `support@whosedayapp.com` is
   configured but delivery remains unverified. No new unverified address was
   inserted into either policy; a usable contact should be finalized before
   publishing this revision.
2. Confirm actual provider retention, support-message handling, access practices,
   and any data-location/transfer commitments before adding specific promises.
   The draft preserves the existing provider-retention boundary without inventing
   purge dates. See [retention inventory](provider-retention.md).
3. Owner/legal review: operator details, intended users/age eligibility, privacy
   requests and applicable rights, disclosure/access exceptions, retention and
   governing terms need review for the jurisdictions and launch scope selected.
   This technical consistency pass does not establish legal completeness.
4. Decide whether this revision needs a notice or mandatory re-consent before
   publication. The current implementation keeps the existing nonblocking behavior.
5. Reconcile with the eventual iOS build and its SDKs before App Store submission.
   The policies describe the current web app; they do not claim native functionality.

## iOS disclosure preparation

Apple requires disclosure of collected data, including third-party partner
practices, even when it is used for functionality rather than analytics:
[App privacy details](https://developer.apple.com/app-store/app-privacy-details/),
checked October 21, 2026. Preliminary inventory for review:

| Current information | Candidate disclosure categories | Current purpose |
| --- | --- | --- |
| Email, names/labels entered by users | Contact Info; review third-party names in user content | Authentication, profile and reports |
| Notes, custody entries, screenshots, feedback | User Content, Photos or Videos, Customer Support; review sensitive information in content | Record keeping, sync, export and support |
| Account ID and generated sync-device ID | Identifiers; confirm Apple's device-ID definition for the final implementation | Account ownership and sync coordination |
| Agreement, timestamps, sync versions and provider logs | Review Other Data/Diagnostics and actual provider collection | Agreement tracking, operation and recovery |

These are engineering candidates, not submitted App Store answers. Synced content
is account-associated; do not select “Data Not Collected” merely because there is
no analytics SDK. Native SDK collection, purpose/linkage/tracking classifications,
optional feedback exemptions, and privacy manifests require final-build review.

Supabase's [user-management documentation](https://supabase.com/docs/guides/auth/managing-user-data)
was also checked. App deletion disclosure is grounded in this repository's
server-side delete and cascading account-owned rows, rather than assuming that
deleting an Auth user removes arbitrary unrelated data or every issued session.
