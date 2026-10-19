# Cloud Disclosure Consistency

Technical copy pass: October 13, 2026. This documents current implementation,
not a legal/compliance approval or a change to collection/security settings.

Deployed as Worker `4a0cb13d-2111-4979-b275-18a3d0d1b570`
(`cloud-disclosures-1`) on the canonical and legacy app origins.

## Customer-Facing Changes

- Sign-in links to the Privacy Policy at the email collection step and discloses
  automatic signed-in sync.
- Onboarding and Settings no longer claim email is never shared or data always
  stays on the device. Profile/log sync is automatic, not a manual backup opt-in.
- Notes and attached screenshots are part of the synced custody-entry JSON.
- Offline edits stay local until the app is open/resumes with connectivity.
  Closing or suspending the app does not provide continuous background sync.
- Privacy storage wording identifies Supabase authentication/storage, Resend
  email delivery, and Cloudflare hosting/account-deletion handling. It includes
  device sync metadata and explains that the app does not add end-to-end
  encryption to custody records.
- Signing out keeps local records. Deletion removes the account's active cloud
  records, not local copies, exports, or all provider backup/log copies.
- CSV exports describe their local snapshot and possible unsynced changes. The
  existing `alpha_note` column name is retained for compatibility.
- No weekly email automation is promised; report export/sharing remains an
  explicit user action.

The technical storage paragraphs and document update dates were refreshed;
liability clauses, contractual acceptance rules, and no-legal-advice language
were not changed. No existing acceptance timestamps or versions were rewritten.

## Implementation Evidence

`profilePayloadFromConfig`, `localEntryRowsForBackup`, and the sync routine in
`app.js` define the stored fields and automatic retry behavior. `supabase-client.js`
sends entry JSON including screenshot data directly to Supabase. The Worker
verifies account deletion and Supabase foreign keys cascade active rows. Resend
SMTP and Cloudflare DNS/Worker setup were verified during backend setup.

The [FTC mobile app developer guide](https://www.ftc.gov/business-guidance/resources/marketing-your-mobile-app-get-it-right-start)
is a general disclosure-accuracy reference, not a certification of this app or
a substitute for review of applicable privacy obligations.

## Verification

`npm run test:disclosures` rejects stale local-only/no-sharing claims and checks
sync/provider/deletion wording, policy links, onboarding and Settings layout in
mobile/desktop light/dark configurations, and the real CSV download. No real
account, email, or custody record is used in these tests.

## Release Gates Still Open

- Owner/legal review of policy text, audiences, provider terms, and app-store
  privacy/data-safety disclosures. Do not treat this copy pass as compliance.
- Reliable policy-version capture at the moment of acceptance and a deliberate
  policy-update/re-consent approach. Explicit version/time capture, frozen document
  links, offline/account attribution, and non-destructive legacy upgrades are now
  implemented locally; deployment and owner QA remain pending. Mandatory future
  re-consent needs owner/legal review. Existing `alpha-local` records are not
  relabeled. See [policy tracking](policy-acceptance.md) and [owner QA](owner-qa.md).
- Provider backup/log retention and operational access documentation, without
  promising an unverified deletion deadline or exclusive-user access.
- A configured and tested support contact. The linked `Team@whoseday.com`
  address remains unverified. Google Workspace and the support alias to Ryan's
  work mailbox were configured October 13, 2026, but end-to-end delivery is not
  yet confirmed and public links remain unchanged. Send-as/reply-as setup is
  deferred at the owner's request.
- Real sign-in and restoration on the new production domain were confirmed by
  the owner on October 13, 2026. Separate new-domain cross-device/offline QA
  remains open in the production-domain checklist.
