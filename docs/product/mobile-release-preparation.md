# iOS release preparation — October 23, 2026

This is a draft review packet for the next TODO item. It describes the current
test app and the decisions needed for TestFlight and App Store preparation.
Nothing has been uploaded, submitted, purchased or changed in production.
Owner checks are tracked by ID in [mobile owner QA](mobile-owner-qa.md).

## Build and identity inventory

| Item | Observed now | Before a release candidate |
| --- | --- | --- |
| Display name | Whose Day Lab | Owner approves final name; update Capacitor and native identity together. |
| Bundle identifier | `com.whoseday.feasibility` | Owner confirms registered identifier and developer team. Do not migrate signed-in storage by silently changing identifiers. |
| Version/build | Xcode marketing version 1.0, build 1 | Choose version/build for the release and advance uploaded build numbers. |
| Deployment target | iOS 15.0 in the application target; first native runtime evidence is iOS 17.5 | Confirm the release minimum and test its APIs/layout. The separate UI-test bundle requires 17.5+. |
| Supported device family | iPhone and iPad (`1,2`) | Decide iPad scope; current first-pass phone checks do not establish iPad readiness. |
| Authentication | Separate Supabase test project; `whoseday-feasibility` custom callback | Confirm release environment and callback identity; keep the production block until separately reviewed. Real Safari return remains IOS-QA-02. |
| Signing | Personal-team development settings; simulator build works | Resolve Apple account restriction and verify physical signing (IOS-QA-01). No enrollment purchase is authorized by this packet. |
| Icon | Existing 1024px prototype asset | Owner reviews final artwork/brand and rendered icon. |
| Photo purpose text | Explicitly says non-sensitive feasibility test | Replace with an accurate final attachment purpose after release scope is approved. |
| Native account deletion | Client/service prepared, live test endpoint disabled | Configure separate test service and complete approved disposable QA (IOS-QA-07). |
| Policy access and agreement | Approved documents are available offline; guided signup atomically records a separate account/version-bound local receipt | Integrate the production/server acceptance contract and complete final policy/release review. Legacy test profile acceptance remains false; reading alone does not record consent. |
| Privacy manifest | Tracking false, collected-data array empty; timestamp/disk-space reasons present | Review shipped app and dependencies; empty lab declarations do not describe the signed-in cloud product. |
| Test routes | Lab, shell preview and standalone synthetic check-in routes remain bundled | Remove or deliberately gate prototype tools and banners for the final release. |
| Native analytics | Website analytics scripts removed; native build has no telemetry adapter | Decide native collection before writing final disclosures; website Mixpanel is a separate implemented data path. |

Run `pnpm --dir mobile release:inventory` to refresh the local, read-only inventory.
It does not read auth keys, contact providers, sign a build or certify release
readiness. The output always retains the owner/device gates.

## Draft listing copy for owner review

Proposed name: **Whose Day**. Proposed subtitle: **Custody notes and reports**.
Both fit Apple's 30-character name/subtitle limits; availability is unverified.
See [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/).

Draft description:

> Keep a personal record of parenting days, changes and the ways each parent
> helped. Add notes and screenshot attachments, review your calendar and generate
> reports for a selected period.
>
> Whose Day saves entries on your device and supports account sync. Export a
> report as PDF, download CSV records or create a full JSON backup with your
> saved attachments. Restore a backup after reviewing its contents and choices.
>
> Whose Day is a personal record-keeping tool. Entries are supplied by the user;
> the app does not independently verify events or provide legal advice.

This describes the intended release behavior, subject to the remaining native
auth/sync/provider checks. Do not claim court acceptance, certified evidence,
co-parent collaboration, automatic email delivery or encrypted exported files.
There are no native purchases/subscriptions implemented. Pricing, category,
age-rating answers, territories, copyright and developer contact need owner input.

| Listing field | Draft / decision |
| --- | --- |
| Marketing URL | `https://whosedayapp.com` — verify final release messaging. |
| Privacy URL | `https://whosedayapp.com/privacy.html` — reconcile final native behavior before submission. |
| Support URL | Pending public support-page decision. The existing landing page exposes `support@whosedayapp.com`; inbox delivery remains deferred in central owner QA. |
| Keywords | Draft: `parenting,custody,journal,calendar,notes,reports` — owner review before entry. |
| App Review access | Pending approved review identity and a repeatable email-code/link path. No credentials belong in this repository. |

Apple requires a privacy URL and a support URL with real contact information.
The packet does not establish inbox delivery or final policy approval. See
[Apple privacy setup](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
and [version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).

## Draft data inventory for privacy review

This inventory comes from the implementation, not a submitted privacy label.
Cloud records are tied to the account. User-selected file/clipboard/share
destinations receive exported content only after the relevant explicit action.
Device-only processing and cloud collection must be distinguished in final answers.

| Data path | Actual implementation | Candidate Apple data type / review |
| --- | --- | --- |
| Email and account ID | Supabase Auth, email delivery and account-scoped records | Email Address; User ID. Authentication/account functionality. |
| Parent, co-parent and child labels | Local profile, synced when enabled; historical labels in records | Name, linked to the account when synced. |
| Custody entries, dates, activities and diary notes | Local SQLite, pending sync and account cloud rows | Other User Content for record keeping and sync. |
| Screenshot attachments | User-selected image payload in local/synced entry and JSON/CSV export | Photos or Videos when uploaded; no whole-library upload. |
| Sync device/checkpoint metadata | Device identifier and sync state coordinate account changes | Review device-ID classification and linkage; this is not an advertising identifier. |
| Auth/service diagnostic retention | Provider configuration and residual logs/retention are not fully resolved | Reconcile [provider retention](../backend/provider-retention.md) with actual collection before final labels. |
| Support messages | Existing email contact, no native support-upload pipeline | Review Customer Support and email-provider retention once delivery is confirmed. |
| Usage analytics | Website Mixpanel exists; native bundling strips website collection | Include actual cross-platform collection in the App Store record where applicable; do not infer native telemetry from the website. |

Apple's taxonomy includes names, email, user IDs, photos and other user content;
generic free-form notes are reviewed as Other User Content. Responses must cover
the actual app and third-party practices, including linkage and purposes. Review
[Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/)
before entering final answers. No tracking/advertising use was added by mobile
implementation; an owner must approve final answers after checking all providers.

## Screenshot and review walkthrough

Use synthetic Alex/Jordan/Avery/Sam data; never real custody details or tokens.
Capture the final signed build after removing feasibility-only branding and
confirming the chosen device families. Existing browser QA images are evidence,
not store screenshots. Verify current dimensions in
[Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
at capture time.

1. Today with saved check-in and clear date.
2. A check-in showing one shared help answer for all children.
3. Calendar/history with editable and read-only dates explained.
4. Report type/period preview, followed by a legible exported PDF.
5. Settings with data export/backup and account controls.

For TestFlight notes, describe what to test: sign-in return, offline save/reopen,
account isolation, both sync-conflict choices, image recovery, Files restore,
PDF/CSV destination/cancellation and accessibility. Keep any reviewer account
outside Git and ensure review access works without the owner being present.
See [Apple beta test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information).

Account creation also requires an in-app account-deletion initiation path under
[Apple's deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
The disabled native test service is a release blocker, even though synthetic
service tests and the separate website deletion flow pass.

## Next execution order

1. Complete local accessibility/layout QA and preserve any device-only checks.
2. Owner resolves identity/signing and chooses device scope (IOS-QA-01/08).
3. Resume approved real auth/sync and test-deletion QA (02/03/07).
4. Perform physical Files/share/photo/VoiceOver QA (04/05/06).
5. Reconcile privacy, support delivery, listing and screenshot evidence with the
   actual candidate, then prepare an archive for owner-approved TestFlight.
6. TestFlight review and explicit owner release approval precede submission.
