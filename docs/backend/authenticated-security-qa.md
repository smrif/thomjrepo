# Authenticated Security QA

## Status: Prepared, Not Live-Verified

October 13, 2026: the existing 165 local database checks and account-deletion
regressions passed. GET-only live anonymous probes returned HTTP 401 / SQLSTATE
42501 for all three app tables. These do not prove real JWT isolation or
retained-session behavior after deletion.

The new local QA tool passed 11 mock/core/server tests and desktop/mobile browser
tests against mocked Auth/Data APIs. No live account was created, changed, or
deleted. Real authenticated execution still requires disposable test identities
and owner-completed sign-ins. The dotted/undotted personal Gmail addresses have
both been used in earlier testing; do not treat existing accounts as disposable.
Fresh `+whoseday-qa-a` and `+whoseday-qa-b` aliases have been proposed. Approval and
an independent account-existence check remain pending.

The owner deferred hands-on QA on October 13, 2026. The temporary QA server was
stopped; restart it with the command below when QA resumes. No test emails have
been sent and no live test identities have been created. The central pending
queue is [owner QA](owner-qa.md).

## Run Locally

```sh
node --test scripts/security-qa/checks-test.mjs
node scripts/security-qa/ui-test.mjs
node scripts/security-qa/server.mjs
```

Open `http://127.0.0.1:8000/`, an existing allowed Supabase callback. The server
binds loopback only, serves an explicit file allowlist, rejects other Host
headers/methods, and sends no-store, no-referrer, CSP, and anti-framing headers.
It serves only the public publishable key and never proxies Auth. Callback tokens
are browser fragments and are immediately removed from the URL. The QA directory
is excluded from the production build; do not deploy/cache it.

Do not stop another server to claim port 8000 or change Auth redirects blindly.
If this origin has an app service worker, use a fresh browser profile/private
session, not cleared owner app data. Use exactly `127.0.0.1` for email callbacks.

## Live Workflow

1. Obtain approval for two exact disposable email addresses. First check
   Authentication > Users; do not adopt existing accounts without establishing
   that they and their records are disposable.
2. Request A's sign-in email in the QA screen. The owner opens its link in that
   same browser before requesting B's link. No mailbox access or verification
   link/token needs to be shared in chat. The two sessions use separate
   `whose-day-security-qa:` browser keys, not the normal app session key.
3. Confirm distinct displayed user IDs and expected emails. Gmail aliases use
   the same inbox, but the test must establish different Supabase identities.
4. Approve synthetic fixture creation. Both real Auth identities are verified,
   and both owners must have zero rows in all three tables before any write.
   Preflight selects only an owner ID, not private record contents. Non-empty,
   expired, or mismatched identities stop the run.
5. Six fixtures are created, with owner create/read/upsert positive controls:
   synthetic profile labels, empty/default child data, no fabricated legal
   acceptances, a December 30, 2099 custody date, and a unique device/run ID.
   Partial failures are never cleaned up automatically. Inspect them separately.
6. Obtain action-time confirmation for cross-account DELETE attempts against
   these exact synthetic rows. A broken policy could change/delete fixtures.
   The tool has an explicit checkbox and confirmation; no Auth account is deleted.
7. Run both A-to-B and B-to-A checks on all three tables. Foreign reads must be
   empty; a query restricted to the two test owners must show only the caller's
   fixture. Foreign PATCH/DELETE must affect zero rows. Foreign INSERT/upsert and
   ownership transfer must return HTTP 403 / SQLSTATE 42501. Unrelated constraint
   errors and server failures are not a pass. Both owners' snapshots must remain
   unchanged. The tool does not download unrelated users' records or repair RLS.

## Retained Session After Deletion

1. Keep the final QA page open after isolation passes. Record A's exact email/ID
   and B's control ID privately. Do not reload, clear sessions, or re-sign in.
   Auto-refresh is disabled, and the original sessions are captured in memory.
2. Obtain separate confirmation for permanent deletion of only disposable A.
   Have the owner delete A in Supabase. The QA tool has no privileged key, admin
   endpoint, or account-deletion command. This complements the previously tested
   production app deletion route; it does not retest that UI by itself.
3. Mark A deleted and run the retained-session check. Its original access token
   must have more than one minute until expiry; otherwise the result is
   inconclusive, not proof of revocation. Auth must no longer recognize A.
4. Original-token reads must be empty/unauthorized. Attempts to recreate A's rows
   must fail through Auth, RLS, or the deleted-user foreign key. B must still
   authenticate and retain unchanged control fixtures.
5. A's original refresh token must fail with a recognized missing token/user/
   session code. Generic failures or successful refresh stop the check.
6. Independently verify zero Auth/profile/log/device rows for A by the recorded
   user ID, and unchanged counts for B, in Supabase. Do not infer deletion from
   email alone. App-level second-device UX, retained local records, and deletion
   confirmation remain separate QA checks.

Clear QA sessions when finished. Only QA-prefixed browser keys and those local
sessions are cleared, not server data or the owner's production app data.
Permanent cleanup of B or remaining fixtures requires separate confirmation.

## Evidence

Record date, project, run ID, test user IDs, assertion labels, independent cascade
counts, and inconclusive checks. Never save/screenshot verification links, JWTs,
refresh tokens, or full Auth responses. The tool displays assertion labels, not
credentials or upstream error bodies, and writes no evidence files automatically.

References: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes),
[Gmail dots](https://support.google.com/mail/answer/7436150),
[Gmail aliases](https://support.google.com/mail/answer/22370).
