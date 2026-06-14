# Custody Tracker — Onboarding Design Memo
**From:** TJ  
**Date:** June 2026  
**Topic:** New multi-step onboarding flow — what we built and why

---

## What We Were Trying to Accomplish

The previous setup was a single scrollable form. Users would land on it, see a wall of fields, and either rush through it or abandon it. Neither outcome is good — rushed setup means wrong labels and missing kids, abandoned setup means no users.

We rebuilt it as a true multi-step onboarding flow, one question per screen, modeled on what the best apps and games do. The goal was three things:

1. **Get users to their first check-in as fast as possible** — every second spent in setup is a second away from experiencing the actual value
2. **Make setup feel personal, not administrative** — by the time they finish, the app knows their name, their kids, and greets them like it already knows them
3. **Apply psychological principles that drive completion** — the same ones Duolingo, Headspace, and Calm use

---

## The Four Principles We Applied

**1. Time to Value (TTV)**
Users decide in 60–90 seconds whether an app is worth their time. We cut the welcome screen to three elements — logo, one line, one button. Nothing else. The promise cards appear *after* they tap Get Started, not before, so the first action happens immediately.

**2. Endowed Progress Effect**
People complete things they feel they've already started. Every step has a progress bar and "Step X of 5" — you arrive at step 1 already feeling like you're underway, not at the beginning.

**3. Commitment and Consistency (Cialdini)**
Once someone takes a small action, they're more likely to take the next one. We ask for the easiest, most personal thing first — your name. After typing their name and hitting Continue, they're invested. The harder asks (email, terms) come last.

**4. Anxiety Reduction**
The very first thing users see — before the logo, before anything — is "🔒 Private · Secure · Yours." The promise cards explicitly address the two biggest anxieties: data privacy and time commitment. "Nothing is permanent" removes the fear of getting setup wrong.

---

## The Flow — Step by Step

**Screen 1 — Welcome**
Logo, app name, one punchy line: *"Your co-parenting schedule, clearly documented."* One button: "Get started →". No skip, no escape. If someone doesn't want to set up, they don't want the app.

**Screen 2 — Promises**
Appears after Get Started tap — user chose to engage, now we tell them what they signed up for. Four cards covering: 2 mins/night, private and secure, built to stand up legally, nothing permanent. Then "Let's do it →"

**Screen 3 — Your name**
One field. Three example chips to tap instead of typing (Dad / Mom / Parent). Continue unlocks the moment anything is typed. Fast, personal, first moment of commitment.

**Screen 4 — Co-parent label**
Opens with *"Nice to meet you, [name]!"* — first moment the app talks back. Feels alive. The co-parent question has context now: you just named yourself, naming them makes sense. Skippable — this field is genuinely optional.

**Screen 5 — How many kids?**
Tactile 3×2 number grid. Tap a number, it highlights, auto-advances after 250ms. No button needed — the selection is the action. Feels like a game.

**Screen 6 — Kids names**
Exactly the right number of fields based on what they picked. Labeled "First child's name, Second child's name" etc. — not generic placeholders. Continue unlocks when at least one name is entered.

**Screen 7 — Last step**
Email + Terms of Service. Placed last because by this point the user is fully committed. Button says "Start tracking →" not just "Continue." Privacy note: "🔒 Your data stays on your device. Always."

**Completion**
🎉 "You're all set!" — emotional payoff for finishing. Immediate transition to home screen.

---

## What We Removed

**Activity selection from onboarding.**
We default all 12 activities for all kids silently at setup completion. After 48 hours of use, a gentle banner appears on the home screen: *"You've been logging for 2 days — want to personalize the activity list for your kids?"* This follows the same principle: don't ask for personalization before the user has experienced the value. Wait until they're invested.

**The skip button.**
"Skip — set up later" was removed from the welcome screen entirely. Setup is required — the app doesn't make sense without a name and at least one kid. The only optional step is co-parent label, which has its own "Skip for now."

---

## For Ronald R. Rifkin — What Needs to Happen Next

**1. Wire the onboarding into the app startup correctly**
The new flow uses `s-ob-welcome` through `s-ob-finish` screens. The old `s-setup` screen is kept for returning users accessing Settings. Make sure `hasSavedConfig()` correctly routes returning users to `s-home` and new users to `s-ob-welcome`.

**2. The 48-hour activity prompt**
`checkActivityPrompt()` is called from `initHome()`. It checks if the user has entries spanning 48+ hours and shows the activity banner if they do. The dismiss button writes to localStorage so it only shows once.

**3. Smoke test the full onboarding → first check-in flow**
The most important regression to catch: does completing onboarding correctly populate `APP_CONFIG` with the right labels and kids so the first check-in uses them immediately?

**4. Terms of Use and Privacy Policy**
Placeholder links in the onboarding finish screen. These need real pages before launch.

---

*End of memo.*
