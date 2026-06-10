# Custody Tracker — New User Setup & Onboarding Memo
**Prepared for:** TJ & Ryan  
**Date:** June 8, 2026  
**Topic:** First-run experience, setup flow, and personalization

---

## The Core Problem

Right now the app has a setup screen that asks for parent labels and kids' names. That's a start, but it's not enough. A new user who opens this app for the first time has no idea:

- What the app does or why it matters
- What information they need to have ready
- How their answers will shape their experience
- Whether the app is even right for their situation

The setup isn't just configuration — it's the moment we earn the user's trust and teach them what this tool is for.

---

## Who Is This User?

Before designing setup, we need to be honest about who opens this app:

**Primary user:** A parent in a co-parenting situation who feels their custody agreement isn't being honored, or who wants to document their involvement for legal or personal reasons.

**Secondary user:** Any co-parent who just wants a clean daily log — not necessarily in conflict, just organized.

**Edge cases we must design for:**
- Same-sex couples (Mom/Mom, Dad/Dad)
- Non-binary parents
- Grandparent or guardian as primary caregiver
- Three-parent situations (blended families)
- Single child vs multiple children
- Informal custody (no formal agreement)
- Formal custody order with specific schedule

The app cannot assume "Dad" and "Mom." It needs to be label-agnostic from the ground up.

---

## Recommended Setup Flow — 4 Steps, Under 2 Minutes

### Step 1: Who are you in this picture?
*Your label — what should we call you in the app?*

Options to present as tappable chips:
- **Dad**
- **Mom**  
- **Parent**
- **Guardian**
- **Type your own** → free text (e.g. "TJ", "Papa", "Grandma")

Then: "What should we call the other parent?"
Same options + free text (e.g. "Kelly", "Co-parent", "Mama")

> This replaces hardcoded Dad/Mom everywhere in the app — every label, every report, every prompt becomes personal.

---

### Step 2: Your children
*Who are we tracking custody for?*

- Enter each child's name (comma separated or one at a time)
- For each child, optional: age or grade (helps with activity suggestions)
- Optional: any recurring activities worth tracking (tennis, dance, soccer, medical needs)

The activities list becomes the pre-filled options in the check-in activity grid — instead of generic "Tennis / Camp / School run," it shows "Thomas's tennis / Presley's dance / Hayden's soccer."

---

### Step 3: Your custody arrangement
*What does your schedule look like? (This helps the app make smarter suggestions — it's never shared.)*

Options:
- **Alternating weeks** — one week on, one week off
- **2-2-3 rotation** — two days, two days, three days alternating
- **Custom split** — e.g. weekdays with one parent, weekends with other
- **No fixed schedule** — it varies, I'll log it as I go
- **Prefer not to say**

If they pick alternating weeks or 2-2-3: ask whose week starts when (anchor date + starting parent). This re-enables Ryan's smart schedule detection — the app can pre-fill "Is today your scheduled day?" accurately.

If they pick no fixed schedule or prefer not to say: skip schedule detection entirely, always ask during check-in.

---

### Step 4: Why are you here? (optional but powerful)
*One tap — helps us show you the most relevant features first.*

- 📋 **Just keeping a record** — organized, no conflict
- ⚖️ **Documenting for legal reasons** — custody dispute or concern
- 🤝 **Co-parenting communication** — want to stay on the same page
- 🔍 **Not sure yet** — just exploring

This single answer shapes what gets surfaced:
- Legal → Reports screen is front and center, pressure tracking is explained upfront
- Record keeping → simpler UI, less emphasis on deviation tracking
- Communication → future feature hint (shared log?)

---

## How Answers Roll Into the App

| Setup answer | Where it appears |
|---|---|
| Your label ("TJ") | Every screen header, report titles, export filenames |
| Co-parent label ("Kelly") | All prompts, calendar legend, deviation language |
| Kids' names | Kid picker grid, diary prompts, report text |
| Kids' activities | Pre-filled activity buttons in check-in loop |
| Schedule type + anchor | Smart plan-check on home screen, calendar overlay |
| Why you're here | Default report shown first, onboarding tips |

---

## Language That Needs to Change

Currently the app has hardcoded or semi-hardcoded language that assumes Mom/Dad. Every instance needs to pull from config:

- "Mom left the kids with me" → "[Kelly] left the kids with me"
- "Mom had the kids" → "[Kelly] had the kids"  
- "Did you feel pressured to agree?" → stays neutral, already good
- "Dad's actual time with kids" (report title) → "[TJ]'s actual time with kids"
- Calendar legend: "Mom's day" → "[Kelly]'s day"
- "Mom's week — Dad's involvement" → "[Kelly]'s days — [TJ]'s involvement"
- Export filenames: `family-log-moms-week.txt` → `family-log-kellys-days.txt`

Ryan has started this with `currentParentLabel` and `coParentLabel` — needs to go further.

---

## The Entry Point Question

There are two ways someone finds this app:

**A) Organic / word of mouth** — they heard about it, they open it cold. Setup needs to be warm and explain the value in the first 10 seconds before asking anything.

**B) Legal referral** — an attorney or mediator suggested it. They arrive knowing exactly why they're here and want to get logging immediately. Setup needs to be fast and not feel like homework.

**Recommendation:** A single welcome screen before setup that says something like:

> *"Custody Tracker is a private daily log for co-parents. It takes about 90 seconds each night to log, and builds a clear, timestamped record of your custody schedule over time. Your data stays on your device."*

Two buttons: **Get started** (goes to setup) and **Skip setup, start logging** (uses defaults, can configure later).

---

## What Ryan Should Know Before Building This

1. **The label system needs to be complete** — every string in app.js and index.html that references Mom, Dad, Mother, Father needs to route through the config helpers. Ryan has `currentParent()` and `coParent()` — needs an audit pass.

2. **Activity personalization is high-value, low-effort** — storing a list of 3-5 recurring activities per child during setup and pre-populating the activity grid would make the nightly check-in feel genuinely personal rather than generic.

3. **The schedule anchor is worth doing right** — if the app knows the custody schedule, it can flag deviations automatically rather than waiting for the user to select the "unexpected" option. That's a much stronger legal record.

4. **Don't over-ask in setup** — Steps 1 and 2 are required. Steps 3 and 4 should feel optional and skippable. Every extra tap in setup is a user who doesn't finish and never comes back.

5. **Settings should let them change everything later** — nothing from setup should feel permanent. The Settings screen (not yet built) needs to expose all of this cleanly.

---

## Suggested Questions for Ryan

- How much of the label system is already in config vs still hardcoded? (Needs an audit)
- Do we want to support multiple children of different ages with different activity lists, or one shared activity list?
- Should the schedule anchor be required, or always optional?
- Is there a plan for the Settings screen? That's where all of this lives after setup.

---

*End of memo. Ready to build when you are.*
