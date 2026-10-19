# Whose Day Backend & App Store Readiness Spec

**Status:** Draft

**Audience:** Product, engineering, legal/compliance reviewers
**Goal:** Define the smallest backend and release-readiness scope needed to move Whose Day from local alpha to a durable beta that can later ship through the iOS App Store and, potentially, Google Play.

## 1. Product Context

Whose Day is currently a private, browser-based custody logging app. Users configure parent labels, children, common activities, email, appearance, and terms acceptance. Daily custody entries, notes, timestamps, attachment metadata, report state, and onboarding/session flags are stored locally in the browser.

This has been appropriate for alpha testing, but the next release stage needs a backend so records can survive device loss, browser storage clearing, and eventual app-store distribution.

The backend should not make the product feel heavier. The core user promise remains:

- Log each day quickly.
- Keep sensitive custody records private.
- Export a clear record when needed.
- Avoid pretending the app provides legal advice.

## 2. Recommended First Milestone

Build a minimal private sync backend before wrapping the app for native stores.

The first backend milestone should support:

1. Account creation and sign-in.
2. Cloud backup and restore for app config and custody entries.
3. Export from synced data.
4. Account and data deletion.
5. Updated privacy, terms, and store-disclosure language.

This milestone intentionally excludes shared co-parent access, attorney portals, payments, push notifications, complex attachments, and collaborative editing.

## 3. Success Criteria

The backend beta is ready when a tester can:

- Create an account.
- Log out and back in on the same device.
- Log in on a second device and see the same profile and entries.
- Add, edit, and export entries without losing current local behavior.
- Delete their account and associated cloud data from within the app.
- Use the app offline temporarily, then sync safely when online again.
- Understand in plain language what data is stored locally, what is stored in the cloud, and how to delete it.

## 4. Architecture Recommendation

Use a managed backend for auth and data storage so the product team does not own low-level database operations, session plumbing, or storage infrastructure.

Recommended stack:

- **Supabase Auth:** Email magic-link or one-time-code sign-in.
- **Supabase Postgres:** Relational storage for profiles, entries, device sync metadata, and deletion support.
- **Supabase Row Level Security:** Required on every app table before client access.
- **Supabase Storage later:** Optional storage for full-size attachments. Do not include in the first milestone unless attachment sync becomes required.
- **Cloudflare static hosting:** Continue serving the app through the existing Worker/static-assets deployment flow.
- **Cloudflare Worker later:** Optional thin server layer for server-only actions such as account deletion orchestration, export packets, or webhook handling.

Initial client data surface:

- Supabase Auth for session management.
- `profiles` table for app settings.
- `custody_entries` table for dated logs.
- `sync_devices` table for device sync metadata.

Exports can remain client-generated in the first backend milestone after synced data is restored to the app. Add server-generated exports later only if PDF generation, large attachments, or cross-device export history require it.

## 5. Authentication Scope

Preferred first version:

- Supabase Email magic-link or one-time-code sign-in.
- No third-party/social login in the first milestone.
- If a third-party/social login is added later for iOS, confirm the current App Store login requirements and offer a compliant equivalent option. Sign in with Apple is the expected safest path, but it is not needed for a first-party email sign-in system.
- No passwords in the first milestone.

Email delivery setup:

- Configure custom SMTP before inviting external testers. Supabase's built-in sender is restricted to project team addresses and currently two messages per hour.
- Recommended starting provider: Resend, with a verified sending domain we control.
- Use sender name `Whose Day` and an address on the verified domain.
- Resend SMTP settings: host `smtp.resend.com`, port `465`, username `resend`, password supplied by a Resend API key. Store the credential in Supabase SMTP settings, never in frontend files or source control.
- Follow the provider's DNS verification instructions and disable email link tracking so sign-in URLs are not rewritten.
- Keep a per-user resend interval and test delivery, link redemption, and restoration from a fresh production browser session.
- References: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend Supabase SMTP setup](https://resend.com/docs/send-with-supabase-smtp).

Session expectations:

- Sessions should be revocable.
- Sessions should expire.
- Device identity should be tracked only for sync conflict handling and basic security visibility.

Open decision:

- Whether to require accounts for all users after backend launch, or allow "local-only mode" with an upgrade prompt. Product recommendation: keep local-only mode available until native app release, then revisit.

## 6. Data Model

### User

Stores account-level identity through Supabase Auth.

Fields:

- `id`
- `email`
- `email_verified_at`
- `created_at`
- `updated_at`
- `deleted_at`

### Profile

Stores user-facing configuration.

Fields:

- `user_id`
- `current_parent_label`
- `co_parent_label`
- `children_json`
- `activities_json`
- `theme_mode`
- `report_email`
- `terms_version`
- `terms_accepted_at`
- `privacy_version`
- `privacy_accepted_at`
- `created_at`
- `updated_at`

### Custody Entry

Stores one dated custody log.

Fields:

- `id`
- `user_id`
- `entry_date`
- `entry_json`
- `entry_version`
- `created_at`
- `updated_at`
- `deleted_at`
- `client_created_at`
- `client_updated_at`
- `device_id`

The initial backend can store the existing entry object as JSON to avoid a risky migration. Add normalized columns later only when reporting, search, or analytics requirements demand them.

### Sync State

Tracks client/server reconciliation.

Fields:

- `user_id`
- `device_id`
- `last_sync_at`
- `client_schema_version`
- `server_schema_version`

### Deletion Request

Tracks account deletion completion without retaining sensitive log contents.

Fields:

- `id`
- `user_id`
- `requested_at`
- `completed_at`
- `status`
- `reason_code`

## 7. Sync Behavior

The first sync model should be simple and predictable.

Recommended approach:

- Entries are keyed by date.
- The app syncs the full profile and changed entries.
- Each entry carries `updated_at`, `client_updated_at`, and `device_id`.
- If the same date differs between two devices, the client detects the conflict before upload, skips overwriting either copy, and records a "needs review" state.
- The first backend pass may show only the conflict count. Before beta, add a simple review screen where the user chooses the local or cloud copy for each conflicted date.

Offline behavior:

- The user can keep logging offline.
- Changes queue locally.
- The next successful sync uploads pending changes.
- If sync fails, local logging still works and the app shows a quiet warning.

Important custody-record principle:

- Treat edits as normal product behavior, but preserve enough metadata to show when an entry was created and last updated. Do not imply court-grade immutability unless the product actually implements append-only records and cryptographic verification.

## 8. Privacy & Security Requirements

Minimum requirements before beta:

- HTTPS-only API.
- Server-side authorization on every user data request.
- No cross-user data access by email, entry ID, or guessed date.
- Rate limiting on auth endpoints.
- Structured server logs that avoid custody notes, child names, and entry bodies.
- Documented encryption posture for cloud records, including whether entry bodies and notes are encrypted only at rest by infrastructure or also encrypted at the application layer before storage.
- Backups and operational access documented.
- In-app account deletion.
- Privacy Policy updated before the first cloud-enabled release.
- Terms updated to remove alpha-only local-storage language.

Current implementation note:

- `DELETE /api/account` verifies the user's bearer token through Supabase Auth, then hard-deletes that same Auth user using a server-only credential. The client cannot select another user ID.
- Live foreign keys from `profiles`, `custody_entries`, and `sync_devices` to `auth.users` were verified to use `ON DELETE CASCADE` on October 12, 2026. Account deletion removes these active records together; no schema migration is needed for this step.
- Settings requires typed DELETE, blocks automatic sync during deletion, and clears this device's session only after server-confirmed success. Local records and exports are not erased.
- The owner saved the encrypted Cloudflare `SUPABASE_SECRET_KEY` secret and the implementation was deployed on October 12, 2026. Live rejection checks pass. The owner deleted a disposable account; independent counts confirmed zero Auth users and zero rows in all three account-owned tables afterward. Success returns to the logged-out home with a dismissible confirmation while retaining local records. Cross-account control, local retention, and second-device checks still need production QA. See `docs/backend/account-deletion.md`. Provider backups/log retention must be documented before beta.
- Database security review on October 12, 2026 captured app schema/policies in versioned migrations and removed unnecessary client administrative grants live. Live read-role/anonymous API checks and 165 local PostgreSQL regression checks pass. Two real authenticated-browser isolation tests, actual old-session behavior, fresh-Supabase migration replay, and CLI history adoption remain pending. See `docs/backend/database-security.md`.

Sensitive data to call out in policy language:

- Parent or guardian labels.
- Co-parent label.
- Children names.
- Email address.
- Custody schedule/log entries.
- Notes and timestamps.
- Attachment metadata and screenshot content, which currently sync inside the custody-entry JSON.
- Exported reports created by user action.

Recommended product language:

- "Your records are private to your account."
- "Whose Day is not legal advice."
- "Exports may contain sensitive custody information."
- "You can delete your account and associated cloud records from Settings."

Avoid language that overpromises:

- "Court-proof"
- "Tamper-proof"
- "Guaranteed admissible"
- "Always private"

## 9. Legal & Store Readiness

Before iOS submission:

- Join or confirm Apple Developer Program access.
- Prefer an organization developer account rather than an individual account because the app handles sensitive family and child-related records.
- Add an in-app Privacy Policy link.
- Provide App Store privacy details matching actual data collection.
- Include account deletion inside the app if accounts exist.
- Prepare App Review notes explaining sign-in, test credentials or review flow, and any sensitive-use context.
- Confirm current login requirements based on chosen auth options.

Before Google Play submission:

- Join or confirm Google Play Console access.
- Complete Data Safety disclosures.
- Provide privacy policy URL.
- Provide account/data deletion path in the app and through a web resource if accounts exist.
- Confirm target API and Android packaging requirements at time of implementation.

Legal review should happen before public store submission, especially because the app involves custody records, children, family conflict, and potentially legal-adjacent reports.

## 10. Native App Path

Recommended path:

1. Finish backend beta on the web.
2. Stabilize auth, sync, export, and deletion.
3. Add Capacitor.
4. Build iOS shell.
5. Test on TestFlight.
6. Submit iOS.
7. Decide whether Android follows immediately or after iOS learning.

Capacitor is preferred because the app is already a working web experience and does not yet require a native rewrite.

Before App Store submission, the native build should feel like a real app rather than a thin website wrapper. At minimum, confirm strong offline behavior, safe local storage, native-feeling navigation, share/export handling, and review notes that explain why the app provides durable utility on device.

Potential native features later:

- Local reminders.
- Share-sheet export.
- Secure local storage.
- Biometric app lock.
- Push notifications.
- Native file attachment flow.

## 11. Migration Plan

Existing users have local data. Do not risk overwriting it.

Migration flow:

1. User opens cloud-enabled app.
2. App detects local entries/config.
3. Sign-in copy explains that profile and custody logs sync automatically while signed in.
4. App reconciles local and cloud data after sign-in without requiring a separate backup opt-in.
5. Local changes upload and missing cloud dates restore automatically.
6. Same-date differences that require review are held for the user to resolve.
7. App shows sync status and keeps a local cache for offline use.

If the account already has cloud data:

- Preserve both sets where dates do not overlap.
- Show conflicts in the review UI when same-date copies differ; the user chooses this device's copy or the cloud copy.
- Do not overwrite an unresolved conflict based only on a client timestamp.

## 12. Reporting & Export Scope

The first backend should not redesign reporting. It should make current reports work from synced data.

Required:

- Existing CSV export still works.
- Existing legal-style reports still work.
- Export generation uses the same data the user sees in Calendar/Reports.
- Export files include generated timestamp.

Later:

- Server-side PDF generation.
- Export history.
- Attorney-ready packet builder.
- Signed/tamper-evident export manifest.

## 13. Beta Checklist

Product:

- Backend behavior documented.
- Local-only vs account-required decision made.
- Account deletion UX designed.
- Sync conflict UX designed.
- Store listing positioning drafted.

Engineering:

- Supabase schema created and captured in repo documentation or migration files.
- Row Level Security policies enabled and tested.
- Public Supabase config added behind feature flags.
- Auth implemented.
- Local-to-cloud migration implemented.
- Offline queue implemented.
- Contract tests updated.
- Browser smoke tests updated.
- Manual two-device sync test completed.

Compliance:

- Privacy Policy updated.
- Terms updated.
- Account deletion documented.
- Data retention documented.
- App Store privacy answers drafted.
- Google Play Data Safety answers drafted.

Release:

- Production Cloudflare environment configured.
- App migrated to `https://whosedayapp.com` with HTTPS and a canonical `www` redirect.
- Supabase Site URL, redirect allowlist, and client auth redirect updated for the production domain.
- Old-origin local records synced or exported before the old app URL is redirected; sign-in and cloud restoration verified on the new origin.
- Support/contact links and privacy/terms URLs updated for the production domain, with a working support address.
- Staging environment configured.
- Error logging reviewed for sensitive data.
- Backup/restore plan documented.
- Test account available for app review.

## 14. Suggested Build Order

1. Add backend feature flag and environment config.
2. Create Supabase project and configure Auth redirect URLs.
3. Add Supabase tables and Row Level Security policies.
4. Add public Supabase config behind a disabled feature flag.
5. Implement Supabase auth UI.
6. Implement profile sync.
7. Implement entry sync.
8. Add local-to-cloud migration prompt.
9. Add account deletion.
10. Update privacy/terms copy.
11. Expand smoke tests for sign-in, sync, export, and delete.
12. Run closed beta on web.
13. Add Capacitor and begin iOS packaging.

## 15. Open Decisions

- Should cloud accounts be required or optional?
- Which auth provider should be used for the first version?
- Should custody entry bodies be application-layer encrypted before storage, and if so, how should account recovery work?
- Should entries be editable after save, or should edits create visible revision history?
- Should attachment content sync in milestone one, or only attachment metadata?
- How long should deletion take operationally?
- Is Android part of the first store release or a follow-up?
- What exact language should be used to describe legal-report usefulness without promising admissibility?

## 16. Non-Goals For This Milestone

- Shared co-parent accounts.
- Attorney access.
- Payments or subscriptions.
- Push notifications.
- Server-side legal advice or recommendations.
- AI summaries.
- Full native rewrite.
- Public analytics on sensitive user behavior.

## 17. Reference Starting Points

- Apple App Review: https://developer.apple.com/app-store/review/
- Apple account deletion guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- Supabase Auth docs: https://supabase.com/docs/guides/auth
- Supabase Row Level Security docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
