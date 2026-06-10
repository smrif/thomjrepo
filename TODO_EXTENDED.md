# Custody Tracker — TODO for Ryan
**From:** TJ  
**Date:** June 2026  
**Purpose:** Consolidated list of what's left to build, prioritized

---

## Status Check — What's Done

Before the list, here's what's been completed across recent sessions so we're aligned:

- ✅ Full check-in decision tree — all paths, back buttons, review screen
- ✅ Calendar with parent-aware color scheme (green = your days, blue = co-parent days, outer ring = deviation)
- ✅ Schedule change context screen — agreed/pressured tracking on deviation nights
- ✅ Screenshot attachment on diary entries
- ✅ Timestamps on every entry (loggedAt)
- ✅ 24-hour entry lock — entries read-only after yesterday, saveEntry() blocks overwrites
- ✅ Missed-night detection with one-night backfill
- ✅ Kids confirm screen after location selection
- ✅ Bottom nav on all screens
- ✅ Reports screen — stats bar, date filter, deviation report, print with attestation
- ✅ Decision tree odd paths fixed (activity-before-location loop, sleeping language on day visits, FaceTime removed)
- ✅ Print report with cover page, entry counts, and signature/attestation line

---

## Priority 1 — New User Setup & Onboarding

**This is the most important thing to build next.** The current setup screen is functional but bare — it asks for labels and kid names, and that's it. A new user who opens this app cold has no idea what it does, why it matters, or what they're setting up.

### What needs to be built:

**Welcome screen (before setup)**
A single screen shown on first launch only. Two paragraphs explaining what the app does and why it matters. Two buttons: Get started and Skip to demo. This is the moment we earn trust before asking anything.

**Setup Step 1 — Who are you?**
- Your label: Dad / Mom / Parent / Guardian / Type your own (free text)
- Co-parent label: same options (supports TJ/Kelly, Parent/Co-parent, same-sex couples — no hardcoded Mom/Dad assumptions)

**Setup Step 2 — Your children**
- Already built (individual name fields, Add another child) — good
- Add optional: recurring activities per child (tennis, dance, soccer, medical)
- These activities pre-populate the activity buttons in the check-in loop so it feels personal

**Setup Step 3 — Your custody schedule (optional)**
- Alternating weeks / 2-2-3 rotation / Custom / No fixed schedule / Prefer not to say
- If alternating weeks: anchor date + whose week starts when
- This enables smart plan-check on home screen (re-enables the schedule detection you removed)
- If no fixed schedule: always ask during check-in as current behavior

**Setup Step 4 — Why are you here? (optional, one tap)**
- Just keeping a record
- Documenting for legal reasons
- Not sure yet
- This single answer shapes what gets surfaced first — Reports front-and-center for legal users, simpler home for casual users

**Key rule:** Steps 1 and 2 are required. Steps 3 and 4 are skippable. Every extra tap in setup loses users.

### Label audit needed
`currentParent()` and `coParent()` are used well throughout but there are still hardcoded strings in a few places. Before launch, needs a full pass to ensure every user-facing string uses config labels. Internal state names (dadMode, momMode, kidsWithDad) are fine to leave as-is.

---

## Priority 2 — Cloud Backup & Data Integrity

**This is the biggest legal credibility gap.** All data currently lives in localStorage on the user's device. Two problems:

1. If the phone is lost, cleared, or browser reinstalled — months of documentation is gone with no recovery
2. No third-party verification of timestamps — opposing counsel can argue data was manufactured locally

### Options to discuss:

**Option A — Lightweight backend (recommended long-term)**
Each entry written to a server at save time. Server generates its own timestamp independently of the device. That server timestamp is the legally defensible record — it shows "entry for June 9 was received by the server at 9:47pm on June 9." Enables attorney access, data portability, multi-device sync. Supabase or Firebase would work with minimal backend code.

**Option B — Weekly email backup (quick ship)**
User emails themselves a JSON export every Sunday — we already have the Sunday email prompt. Just attach the data as a file. Creates a timestamped email record in their inbox that's hard to dispute. Low-tech but ships immediately.

**Option C — iCloud / Google Drive sync**
Use the respective web APIs to write a backup file to the user's own cloud storage. No backend needed, user owns the data. Doesn't give server-side timestamps but does give an independent off-device backup.

Recommendation: ship Option B now as an interim measure, build Option A properly for v1.0.

---

## Priority 3 — Authentication

Right now there's nothing tying entries to the user specifically. Anyone who picks up the phone can log entries. In a legal challenge, opposing counsel could argue entries were made by someone else or manipulated.

**What to build:**
- Optional PIN or biometric (Face ID / Touch ID) required before logging a new entry
- Not required for viewing — the calendar and reports should always be visible
- Just the check-in flow needs the gate
- Can be toggled on/off in Settings

This is a lower priority than backup but worth flagging for the Settings spec.

---

## Priority 4 — Settings Screen

Currently "Settings" just opens the Setup screen — which is functional but not the right UX for a returning user who wants to change something. Needs a proper Settings screen with sections:

**Profile**
- Edit your label / co-parent label
- Edit children names and activities
- Edit custody schedule (if set)

**Log preferences**
- Reminder time (currently just a dropdown with no actual reminder)
- Nightly check-in reminder on/off
- Sunday weekly report email on/off

**Security (once built)**
- PIN / biometric toggle
- View lock status summary: "X of Y entries are locked"

**Data**
- Export all data (JSON download)
- Weekly email backup toggle
- Clear all data (with confirmation, destructive)

**About**
- Version number
- Link to privacy policy
- "How entries are protected" — one paragraph explaining the lock, timestamps, and what the attestation on reports means

---

## Priority 5 — Trends Page

Still not specced. Here's a starting point for discussion:

The Trends page should answer one question at a glance: **Is the pattern getting better or worse?**

Suggested charts:
- Month-by-month bar: your actual days vs scheduled days vs co-parent deviation nights
- Rolling 90-day line: deviation frequency over time (is the gap growing or shrinking?)
- Per-child breakdown: which kids are most often caught in schedule changes
- Pressure flag count over time: how often felt pressured vs agreed freely

This is the most powerful legal exhibit in the app — a trend showing 9 deviation months climbing from 2 → 4 → 5 per month is devastating evidence of a pattern. Worth building before launch.

---

## Priority 6 — Decision Tree Remaining Gaps

A few minor items still outstanding from the decision tree review:

**"Co-parent had kids → Brief visit / Pickup" path**
Goes straight to Review with no kid detail. Currently intentionally lightweight, but consider adding an optional "which kids?" step for pickups since that information can matter.

**Progress bar total normalization**
Main paths now use /5 but some sub-paths may still feel inconsistent. Worth a pass once setup is finalized and total step count is stable.

**"Why are you here" answer shaping the experience**
Once setup Step 4 is built, the home screen, reports screen, and first-launch tips should adapt based on the user's stated reason for using the app.

---

## Not Blocking — Do Later

**Better icons**
Ryan flagged this. Do it last, after flows are settled.

**Shared/co-parent view**
Longer-term — a read-only link a user could share with their attorney showing their calendar and reports without giving edit access.

**Push notifications**
Actual nightly reminders via web push. Currently just a preference setting with no implementation.

**Per-child activity lists**
Currently one shared activity list. Per-child lists (Thomas's tennis, Presley's dance, Hayden's soccer) would make the check-in feel more personal. Low effort, high value.

---

## What I Think Is Really Left Before Launch

Honestly the core is there. The app logs nights, tracks deviations, documents pressure, exports reports, and locks entries. That's the product.

The three things that matter most before this is ready for real users are:

1. **Setup / onboarding** — without a good first-run experience, users won't know what they're doing and will log inconsistently
2. **Cloud backup** — without it, a user who loses their phone loses their legal record
3. **Trends page** — the most powerful legal exhibit, and it's the thing that makes a 6-month record truly devastating as evidence

Everything else is polish. Those three are substance.

---

*End of memo.*
