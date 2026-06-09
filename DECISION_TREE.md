# Custody Tracker Decision Tree

This document describes the current check-in flow as implemented in `index.html` and `app.js`.

## Main Flow

```mermaid
flowchart TD
  Start["Home: Log today"] --> DayType["What kind of day is it?"]

  DayType --> MyDay["My day"]
  DayType --> TheirDay["Other parent's day"]
  DayType --> Special["Special day"]

  Special --> SpecialDiary["Special-day diary + optional screenshot"]
  SpecialDiary --> Review["Review"]
  Review --> Saved["Saved"]

  MyDay --> MyDayActual["Were the kids with you today?"]
  MyDayActual --> MyNormal["I had the kids"]
  MyDayActual --> CoParentHelped["Co-parent helped"]
  MyDayActual --> KidsAtCoParent["Kids ended up with co-parent"]

  MyNormal --> AllKidsHome["Are all kids sleeping at your house?"]
  AllKidsHome --> AllYes["Yes, all kids"]
  AllKidsHome --> SplitNight["No, split night"]
  AllYes --> KidsConfirm["Confirm each kid's location"]
  SplitNight --> PickKidsHome["Pick kids with you"]
  PickKidsHome --> AbsentLoop["For each absent kid: where are they?"]
  AbsentLoop --> KidsConfirm
  KidsConfirm --> Diary["Diary + optional screenshot"]
  Diary --> Review

  CoParentHelped --> PickCoParentHelpedKids["Pick kids co-parent helped with"]
  PickCoParentHelpedKids --> CoParentHelpedActivity["For each kid: what did co-parent do?"]
  CoParentHelpedActivity --> AllKidsHome

  KidsAtCoParent --> PickKidsAtCoParent["Pick kids at co-parent's tonight"]
  PickKidsAtCoParent --> ChangeContextDadDay["Schedule change context"]
  ChangeContextDadDay --> Diary

  TheirDay --> TheirDayActual["Were the kids with your co-parent today?"]
  TheirDayActual --> CoParentHadKids["Co-parent had the kids"]
  TheirDayActual --> IHelped["I helped"]
  TheirDayActual --> KidsWithMe["Kids ended up with me"]

  CoParentHadKids --> EasyInvolvement["Choose involvement: none, call, pickup, brief visit"]
  EasyInvolvement --> Review

  IHelped --> PickHelpedKids["Pick kids you helped with"]
  PickHelpedKids --> HelpedActivity["For each kid: what did you do?"]
  HelpedActivity --> KidsConfirm

  KidsWithMe --> PickKidsWithMe["Pick kids who ended up with you"]
  PickKidsWithMe --> ChangeContextTheirDay["Schedule change context"]
  ChangeContextTheirDay --> Diary
```

## Schedule Change Context

This screen appears when custody differs from the scheduled day:

- My day -> kids ended up with co-parent
- Other parent's day -> kids ended up with me

```mermaid
flowchart TD
  Change["Schedule change context"] --> Agreed{"Was this agreed to in advance?"}
  Agreed --> Yes["Yes, agreed"]
  Agreed --> No["No, unexpected"]
  Yes --> Pressure{"Did you feel pressured to agree?"}
  Pressure --> Pressured["Felt pressured"]
  Pressure --> Fine["No, I was fine helping"]
  No --> Notes["Continue to notes"]
  Pressured --> Notes
  Fine --> Notes
  Notes --> Review["Review"]
```

## Stored Entry Fields

Core shape:

- `week`: `dad`, `mom`, `other`, or `not-logged`
- `dadMode`: `normal`, `dad-helped-mom`, or `mom-had`
- `momMode`: `easy`, `helped`, or `dad-had`
- `kidsWithDad`
- `absentData`
- `momOpts`
- `helpedKids`
- `helpedData`
- `dadHadKids`
- `momHadKidsOnDadWeek`
- `momHelpedOnDadWeek`
- `diary`
- `attachment`
- `changeAgreed`
- `changePressured`
- `loggedAt`

## Product Decisions

- Users can backfill only yesterday.
- Older empty calendar days show "Nothing logged" and remain read-only.
- Schedule-change context is captured only for true custody deviations, not ordinary involvement such as calls, pickups, or brief visits.

## Odd Paths To Review

- On "My day -> Co-parent helped," the flow asks what co-parent did, then returns to "Are all kids sleeping at your house tonight?" This may be correct, but it can feel like a loop because the help activity comes before the final location question.
- On "Other parent's day -> I helped," the flow ends at the same kids-confirm screen used for overnight location confirmation. That screen language says "where each kid is sleeping," which may not match a daytime help-only scenario.
- On "Other parent's day -> Co-parent had the kids," choosing "Brief visit," "Phone / FaceTime," or "Drop-off or pick-up" goes straight to Review without asking which kid was involved. That may be intentionally lightweight, but it limits report detail.
- Some internal state names still use Dad/Mom terminology. User-facing copy now mostly renders from the configured parent labels, but internal naming could be clarified later during a larger refactor.
- The progress bars use different totals depending on branch. Some branches with schedule-change context may feel longer than the indicator suggests.

## Good Low-Oversight Cleanup Work

- Split decision-tree state helpers into named sections without changing behavior.
- Add browser smoke-test assertions for custom parent/co-parent labels in review, saved, calendar, and report views.
- Add browser smoke-test assertions for the two schedule-change branches.
- Add a small regression checklist to release notes before each push.
