# Provider Retention and Deletion Boundaries

Research checked October 13, 2026. This is an engineering inventory for owner/legal
review. Published plan limits below are not verification of this project's paid
plan, dashboard settings, contractual exceptions, or provider-internal retention.

## What the app deletes

`DELETE /api/account` hard-deletes the verified Supabase Auth user; foreign keys
cascade its active profile, custody entries, and sync-device rows. Local browser
records, screenshots in those local records, downloaded exports, shared copies,
mailbox messages, and provider backup/log copies are outside this operation.
Screenshots sync inside custody records; there is currently no Supabase Storage
object cleanup to perform. See [account deletion](account-deletion.md).

## Published provider limits

| Provider/data | Published retention | Project-specific verification still needed |
| --- | --- | --- |
| Supabase database backups, including account-owned rows present at backup time | Daily backup access: Pro 7 days, Team 14, Enterprise up to 30. Free projects should maintain their own exports. Optional point-in-time recovery has 7/14/28-day recovery windows. | Confirm plan, enabled recovery window, and any manual/off-site copies. These are recovery windows, not a blanket promise about every internal copy. |
| Supabase API/database logs | Standard plan table: Free 1 day, Pro 7, Team 28, Enterprise 90. | Confirm actual plan, log drains, and any exported logs. Usage restrictions can shorten accessible retention. Auth audit records need separate review; do not assume this table covers them. |
| Cloudflare Workers Logs | Until December 1, 2026: Free 3 days, Paid 7 days; maximum 7 days in current Workers Logs documentation. | Confirm whether logging is enabled in the dashboard, plan, destinations, and any Logpush/Tail exports. Recheck after the announced December pricing transition. |
| Resend sign-in email content and delivery logs | Free/Pro/Scale: 30 days. Backups: 7 days. Remaining customer data after termination of the Resend customer account: within 90 days. | Confirm plan/custom terms. Deleting a Whose Day user does not terminate the operator's Resend account or trigger that 90-day process. |
| Support mailbox and recipient email copies | No app-enforced expiry. | Establish a support retention policy and verify Workspace/Vault rules, forwarding, trash, and recovery settings. Recipient mailbox retention is controlled by the recipient/provider. |

Sources: [Supabase backups](https://supabase.com/docs/guides/platform/backups),
[Supabase plan log limits](https://supabase.com/pricing),
[Supabase log-query restrictions](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query),
[Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/),
[Resend security and retention](https://resend.com/security).

## Code/configuration findings

- `src/worker.js` has no application console logging and returns generic deletion
  errors without upstream response bodies. This does not disable provider request,
  security, authentication, or infrastructure logging.
- `wrangler.jsonc` has no explicit observability, Tail, or Logpush configuration.
  Dashboard-managed logging and account-level settings cannot be inferred from it.
- Profile/log sync goes directly from the browser to Supabase. Resend handles
  authentication messages; the app does not email custody exports through Resend.
- `privacy.html` already explains that deletion removes active cloud records and
  provider backup/log copies may remain. No frozen policy document was changed by
  this research.

## Proposed operating procedure for approval

1. Record plan names and retention settings without copying credentials or user
   content. Inventory backup exports, log destinations, and support mail retention.
2. For a deletion inquiry, explain the active-record/local-copy boundary. Verify
   identity through an approved process; never ask for an access token or password.
   Keep only the minimum case metadata needed for the approved retention period.
3. Route requests concerning residual provider copies to the relevant provider
   process. Do not promise an individual backup purge or a universal deletion date
   unless the provider confirms it for the applicable data and contract.
4. Before restoring a backup to service, reconcile previously completed deletions
   so deleted accounts and custody records are not unintentionally made available
   again. Design and approve the minimum deletion ledger and its own expiry before
   relying on this procedure; no such ledger is implemented by this document.
5. Recheck this inventory on plan/logging changes and before beta legal review.

## Remaining release decisions

- [ ] Verify actual Supabase, Cloudflare, and Resend plans/settings and exports.
- [ ] Confirm Supabase Auth audit retention and provider-internal backup/log
  boundaries where published recovery windows do not answer the question.
- [ ] Approve support-case retention and backup-restore deletion reconciliation.
- [ ] Owner/legal review the resulting disclosures. Research completion alone
  does not close the pre-beta retention sign-off.
