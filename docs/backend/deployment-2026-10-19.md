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

## Subsequent Trends release

The owner approved publishing Trends clarity and its revised compact empty state.
Merged to main as `855e758`. The final local release suite passed all 31 results,
zero failures/skips, in about 95 seconds;
[hosted main checks](https://github.com/smrif/thomjrepo/actions/runs/39324112618)
also passed. Wrangler 4.149.0 dry run and deployment succeeded.

- Production Worker version: `3dd0d424-d925-4048-80af-fdd31f1c126b`.
- Previously recorded version: `e159d2e4-1d3b-496b-9089-93e93a05055f`.
- App token: `trends-clarity-1`; no schema or secret changes.
- All 32 live static files matched the tested build byte-for-byte.
- Canonical redirect preserved its query, legacy origin and health returned 200.
- Live browser checks at 390px and 1280px passed all signup entry buttons, Back,
  login/signup switching, and the compact Trends empty state: a single message,
  no coverage paragraph, empty direction cards, or context legend. No page errors
  or horizontal overflow were observed.

Browser checks used fresh contexts, blocked service workers, and mocked Auth.
Synthetic empty-state setup affected browser-local storage only; no live account,
email, cloud entry or policy acceptance was created or changed. Deferred owner QA
remains pending. The deployment record is a documentation-only follow-up.
