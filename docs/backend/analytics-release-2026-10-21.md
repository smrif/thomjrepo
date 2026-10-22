# October 21, 2026 Analytics Release

Published at the owner's explicit request to https://whosedayapp.com/.

- Worker version: `944f08c4-252f-4e8f-a3b5-81e37ae5fb6a`.
- Previous version: `30f76121-9223-431f-b915-5131d51cf91a`.
- Includes signup/check-in funnels, feature usage and sanitized operational
  outcomes, browser analytics controls, updated support email links, and the
  approved `2026-10-21-v2` policy disclosure/snapshots.
- Existing routes/bindings retained; no database migration, forced reconsent,
  acceptance-history migration, Git commit or push.

Verification: all 48 local release results passed before deployment; analytics
and policy tests passed again with a fresh static build. All 48 published static
files matched the build byte-for-byte. Health and legacy origin returned 200;
www returned a query-preserving 308 redirect. Live browser analytics checks
passed at mobile/dark and desktop/light, covering signup, check-in, feature
views/filters/reports, CSV/JSON download and restore, missed-check-in choices,
delete failure/success, private-field exclusion and opt-out. Backend and tracking
requests were intercepted; no test account writes or live telemetry were sent.

Mixpanel retention, access and deletion-process verification remain follow-up
work. Physical-device and owner-involved QA remain deferred. See
[analytics documentation](../product/mixpanel-analytics.md) for event scope and
saved production-filtered funnels.
