# Separate mobile test deletion service

This worker is prepared for the mobile test project only. It has **not** been
deployed or given a server key. Both enabled flags are false. The mobile build
keeps live deletion disabled until an explicit test endpoint is configured.

`worker.mjs` reuses the website's verified-token self-deletion handler. Its wrapper
refuses the production Supabase project, requires the configured test reference,
and permits only `capacitor://localhost` and `https://localhost`. Preflight accepts
DELETE with authorization/content-type; responses use an exact origin, no
cookies, no wildcard and no cache. The token determines the deleted user; a
caller-supplied user ID is rejected by the shared handler.

From the repository root, `pnpm --dir mobile build:test-api` bundles the worker
into ignored `mobile/.build/test-api/worker.mjs`. This performs no deployment,
key lookup or account request. `pnpm --dir mobile test` checks rejected origins,
project guards, preflight, confirmation, token identity and sanitized failures.
The production worker source and its deployed configuration are unchanged.

To activate a later live test, use this directory's `wrangler.jsonc`, its separate
worker name, and only the owner-created project `ijewfmltnlqpydwuiedb`. The owner
must enter that project's server key directly as the worker's encrypted
`SUPABASE_SECRET_KEY` secret. Do not send the key in chat, put it in mobile config,
copy the production binding, or expose it in a static build. Enable the two flags
only for this test deployment and verify the actual deployed origin/preflight.
No paid service, production change, or real deletion is authorized by this file.

The ignored mobile config then needs:

```json
"deletion": {
  "enabled": true,
  "project": "ijewfmltnlqpydwuiedb",
  "url": "https://whose-day-mobile-test.YOUR-SUBDOMAIN.workers.dev/api/account"
}
```

Replace the placeholder with the actual separate worker URL, then build/sync the
mobile app. The client accepts only the matching test project and a
`whose-day-mobile-test*.workers.dev` service with the exact `/api/account` path.
It rejects production/custom arbitrary origins, credentials in URLs, redirects
and query strings. Live QA requires an explicitly approved disposable test
identity and a separate confirmation before irreversible deletion. Current
browser deletion tests use isolated synthetic data and a browser-only mock cloud.
