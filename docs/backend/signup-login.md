# Onboarding-first Sign-up and Separate Login

October 20 local follow-up, pending release: signed-out users now stay on
welcome/login, and signup verifies the email after the name/children/agreement
questions before opening Today. Settings no longer hosts sign-in. See
[authenticated entry](auth-required-entry.md); the deployment notes below are
historical behavior from October 13.

Deployed October 13, 2026 as Worker `d0452630-30ee-4b89-ae29-34a8c275b9e0`.
See [release verification](deployment-2026-10-13.md).

The original onboarding is still implemented in `index.html` and `app.js`.
`showLoggedOutSignup()` now initializes it and opens `s-ob-name` directly. The redundant marketing/intro screen has been removed.
The earlier email-first signup entry was incorrect for the intended experience.

The active signup sequence is:

1. Your name (`s-ob-name`).
2. Co-parent name/label (`s-ob-coparent`).
3. Children's names (`s-ob-kids`, including Add another child).
4. Email and explicit agreement (`s-ob-finish`).

All three homepage Sign up buttons and the login form's New here? Sign up
link use this entry point. They do not request an auth email or require a
verified session before collecting the profile information.

Sign in remains the existing-account email-link flow, with busy/cooldown/retry
behavior and automatic restoration. Its backend requests do not silently create
accounts. Verified accounts without completed profiles can still finish onboarding.

This reconnects the original onboarding; its final `obFinish()` behavior is
preserved: save the profile locally with explicit policy acceptance and open Today,
with automatic cloud sync when signed in. It does not add a new email-sending or
account-creation step to that final submission. Auth/provider settings and frozen
policy documents were not changed by this routing correction.

Browser regression checks cover all signup entry points, no email request on
entry, the name/co-parent/child sequence, preserved field values, email at the final
step, and separate login behavior on mobile and desktop. Existing smoke coverage
also completes the onboarding and checks the saved profile. Tests mock Auth;
no real accounts or emails are used.

The app script uses `onboarding-direct-1`; previous auth-wrapper/base-style cache
tokens remain `separate-auth-1`. Production static-file and navigation checks
passed; live email/account QA remains separate.

Validation: 29 release results passed initially; the remaining smoke test caught
an outdated email-first expectation in its dark-theme preview case. After updating
that assertion to the restored onboarding route, the complete browser smoke test
passed. The expanded entry/sequence test also passed on mobile and desktop.

Subsequent intro-screen removal: the final full release suite passed all 30
results with zero failures/skips (about 89 seconds). Fresh signup and verified
incomplete-account callbacks start at the name question; browser checks verify
that the removed screen is absent and Back returns to the marketing homepage.
