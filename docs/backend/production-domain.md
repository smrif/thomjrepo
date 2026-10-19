# Production Domain Transition

## Current State

Deployed October 13, 2026, Worker version
`b0911422-17bf-48c6-8286-43227281ee9f` (`production-domain-1`).

- Canonical app: `https://whosedayapp.com/`.
- `https://www.whosedayapp.com/` redirects to the canonical host with HTTP 308.
- Legacy app: `https://thomjrepo.ryan-rifkin.workers.dev/` stays available without
  an automatic redirect, so existing devices can finish syncing/exporting.
- All three hostnames use the existing `thomjrepo` Worker and Supabase project
  `hdfuknggfkmaycnantxv`. No accounts, schemas, or custody records were migrated
  to another database, and no RLS permissions were changed.
- Cloudflare created root and `www` Worker DNS records. The two Resend CNAMEs
  and DKIM TXT record were inspected before/after and remain DNS-only/unchanged.

## Configuration

`wrangler.jsonc` declares both custom domains and explicitly sets
`workers_dev: true`. All requests pass through the Worker before assets so the
canonical `www` redirect also applies to static pages. The Worker only redirects
the exact `www.whosedayapp.com` host and preserves the path/query; browser
fragment preservation was checked in a live browser. Same-origin API protections
continue to apply separately on the canonical and legacy origins.

Supabase Authentication > URL Configuration:

- Site URL: `https://whosedayapp.com/`.
- Exact allowed production returns: `https://whosedayapp.com/` and
  `https://thomjrepo.ryan-rifkin.workers.dev/`.
- Existing development returns retained: `http://127.0.0.1:8000`,
  `http://127.0.0.1:8000/`, `http://localhost:8000`, `http://localhost:8000/`.

The owner approved the new trusted authentication destination before saving it.
The client defaults to the canonical domain, but requests made from the legacy
origin still return to that legacy origin. Local file previews now return to
the canonical domain. `www` is not an auth destination: it canonicalizes before
the sign-in screen is used. SMTP/sender credentials were not changed.

## Browser Data Transition

Browser storage, offline caches, and login sessions are separate per origin.
They cannot move automatically just because both domains serve the same app.

1. Finish syncing intended records on each old-origin device; export anything
   that is still local or awaiting review before retiring the old origin.
2. Open `https://whosedayapp.com/` and sign in with the existing account email.
3. Complete the email link on the new domain and verify profile/log restoration.
4. Confirm automatic cross-device sync and offline reopening on the new domain.

Do not clear the old site's browser data or redirect/disable it until those
checks pass. If a record is missing, preserve the old local copy and diagnose it
there. Do not use `localStorage.clear()` as a migration step.

## Verification And Remaining Work

`npm run test:domain` checks host routing, path/query preservation, unchanged
database configuration, origin-specific sign-in returns, old-origin availability,
and account-deletion protections. Auth, sync, two-device receiving, deletion,
offline, contract, and smoke tests also passed before deployment.

Read-only live checks passed for trusted HTTPS on both app origins, `www`
redirects including browser fragments, health endpoints, new-domain offline
reload/cached SDK/legal page, and origin storage isolation with preserved legacy
offline access. These checks did not create, alter, or delete real account data.

The owner confirmed sign-in and profile/log restoration on the new domain on
October 13, 2026. Physical-device cross-device/offline recovery on the new domain
remains pending. Old email links remain allowed, but their real
completion should be checked before removing the legacy allowlist entry.

Support email is a separate release task: `Team@whoseday.com` is currently linked
but unverified. On October 13, 2026, Google Workspace verified the new domain,
activated Gmail, and completed SPF/2048-bit DKIM setup. Google's receiving MX and
authentication TXT records were added without changing Resend or website records.
The saved `support@whosedayapp.com` alias routes to `ryan@whosedayapp.com` with
owner approval; Cloudflare forwarding was not configured. Actual delivery must
still be confirmed before publishing the replacement contact. The owner deferred
Gmail send-as/reply-as configuration; it remains unconfigured and untested.

References: [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
