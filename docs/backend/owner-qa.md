# Owner QA Queue

Updated October 13, 2026. The owner has no time for manual QA right now. Keep these
items pending while independent implementation and automated checks continue.
Do not send test sign-in emails, create live test accounts, delete accounts, or
claim these checks passed merely because their local/mock tests passed.

## Deferred Tests

| ID | Owner Help Needed | Pass Evidence |
| --- | --- | --- |
| QA-01 | Approve two fresh disposable Supabase identities and complete their email links in the same QA browser. Proposed aliases: `ryanrifkin+whoseday-qa-a@gmail.com` and `ryanrifkin+whoseday-qa-b@gmail.com`. Approval is pending; do not use existing dotted/undotted accounts as disposable. | Distinct real Auth user IDs, empty-account preflight, successful owner operations, and symmetric API isolation checks on all three tables. |
| QA-02 | Separately confirm permanent deletion of exact test account A while its other session stays open. Confirm cleanup targets separately too. | Independent zero Auth/profile/log/device counts for A; its still-unexpired old session cannot read/recreate data or refresh; account B unchanged. Verify production app logout/confirmation and retained local records separately. |
| QA-03 | On a physical iPhone, visit the current canonical domain online, finish cache installation, then reopen/reload offline and log a synthetic day. Reconnect without opening Settings; check a second device. | Offline reopening works; the second device receives the day automatically. The earlier old-domain reconnect test passed, but new-domain physical-device/offline recovery is not yet confirmed. |
| QA-04 | Create an intentional two-sided edit to a disposable date on two devices; exercise both conflict choices with separate conflicts. | Both copies remain intact until a choice; the selected copy converges on both devices; unrelated dates keep syncing. |
| QA-05 | Confirm old-origin records are synced/exported and finish an older-origin email link. | No unsynced records left behind; older sign-in link still completes. Only then consider redirecting/retiring the old origin and removing its Auth redirect. Never clear browser data as part of this check. |
| QA-06 | Send a real message to `support@whosedayapp.com` and confirm receipt in `ryan@whosedayapp.com`. | Actual message arrives before public contact links are replaced. Workspace, MX/SPF/DKIM, and the alias are configured. Sending/replying as support is optional and explicitly deferred. |
| QA-07 | After the policy-tracking release is approved/deployed, exercise one fresh signup and one existing-account settings edit/restore. Optionally repeat fresh acceptance offline. | New signup records the linked document versions and submission time; later sync/reload preserves them; older acceptances are not relabeled/restamped; only an explicit renewed checkbox submission updates acceptance. |

## Decisions and Approvals

- [ ] Owner/legal review of terms, privacy, and app-store disclosures. Code and
  copy consistency checks are not a legal/compliance sign-off. Decide whether a
  future policy change should require mandatory re-consent; none is silently enabled.
- [ ] Confirm provider plans, backup/log destinations, Auth audit retention, and
  support-mail retention; approve support-case expiry and backup-restore deletion
  reconciliation. Published limits and the proposed procedure are prepared in
  [provider retention](provider-retention.md).
- [x] Policy tracking deployed with the owner's explicitly requested October 13
  release, Worker `d0452630-30ee-4b89-ae29-34a8c275b9e0`. Live acceptance QA
  (QA-07) and owner/legal review remain pending; no old acceptance rows were migrated.
- [ ] Choose/approve a fresh Supabase staging environment before platform-level
  migration replay/recovery tests. Do not replay the baseline in production.
- [x] First hosted GitHub Actions result verified October 19: checkpoint
  `a1df43c` on `codex/release-hygiene` passed
  [Release Checks #1](https://github.com/smrif/thomjrepo/actions/runs/39314170916).
- [ ] Approve developer-account enrollment and any paid app-store/service changes
  when packaging reaches that step; no purchases are authorized by this checklist.

## Already Confirmed: Do Not Repeat Without Reason

- Real Resend sign-in email/link delivery: October 12, 2026.
- Basic disposable-account deletion and independent active-record cascade counts:
  October 12, 2026. Separate control-account/retained-session checks above remain.
- Phone-to-desktop offline/reconnect receiving on the old domain: October 13, 2026.
- New-domain sign-in and profile/log restoration: October 13, 2026.

See [authenticated security QA](authenticated-security-qa.md),
[production domain migration](production-domain.md),
[account deletion](account-deletion.md), and [policy tracking](policy-acceptance.md).
