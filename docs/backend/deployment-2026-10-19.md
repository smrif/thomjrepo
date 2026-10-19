# October 19, 2026 Production Checkpoint

Deployed at the owner's explicit request from tested main revision `5cf22ee`.
The full local suite passed all 30 results, and both the release-branch and
[main hosted run](https://github.com/smrif/thomjrepo/actions/runs/39316594880)
passed before deployment.

- Worker: `thomjrepo`; canonical URL: https://whosedayapp.com.
- Production version: `e159d2e4-1d3b-496b-9089-93e93a05055f`.
- Previous production version: `ccdeddda-f6b8-4e75-82d6-6a27ac4ecb29`.
- Used Wrangler 4.149.0 and the existing Cloudflare OAuth session.
- Build/contract checks and deployment dry run passed. No static assets needed
  uploading: the existing 32 production files already matched the tested build.
- Existing bindings and the encrypted `SUPABASE_SECRET_KEY` binding were present;
  no secret value was read. No database migration was run.

After publishing, GETs for all 32 static files matched local `dist` byte-for-byte.
The `www` origin returned a 308 canonical redirect preserving the query; the legacy
Worker origin and health endpoint returned 200. Browser checks at 390px and 1280px
passed for all three signup buttons, Back navigation, existing-account login and
its signup switch. No page errors or horizontal overflow were observed.

Browser verification mocked Auth and blocked service workers for fresh navigation
checks. No sign-in email, account creation/deletion, live data write, or policy
submission was performed. Physical-device/live QA remains in
[owner QA](owner-qa.md). This deployment does not complete beta approval.
