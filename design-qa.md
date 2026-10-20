# Settings overview and subpages — design QA

- Source visual truth: the user-supplied inline attachment **Dark-Mode Settings App Wireframe.png**, 1024 × 1536 pixels. Its referenced `/Users/ryanrifkin/Downloads/Dark-Mode Settings App Wireframe.png` filesystem copy is unavailable; the visible conversation attachment supplies the reference.
- Scope: adopt the supplied grouped overview and progressive disclosure approach in the existing product. Preserve existing app colors, fonts, bottom navigation, real account behavior, co-parent editing, and policy acceptance.
- Implementation: http://127.0.0.1:57413/#settings, isolated sample account; no production connection.
- Desktop full view: `/tmp/settings-overview-desktop.png`, 1024 × 1678 pixels, 1024 × 900 CSS viewport, density 1.
- Mobile full view: `/tmp/settings-overview-mobile-final.png`, 390 × 1645 pixels, 390 × 844 CSS viewport, density 1.
- Focused child editor: `/tmp/settings-child-mobile-final.png`, 390 × 844 pixels, density 1.
- Handoff viewport capture: `/tmp/settings-overview-ready.png`; normal browser viewport restored.
- State: signed-in sample account, dark theme, overview and child editor. Responsive automated checks also cover desktop/light.

## Comparison

The supplied inline reference and opened implementation captures were reviewed together for hierarchy, density, grouped card structure, readable summary rows, child rows, segmented appearance controls, export, and safety management. Desktop comparison uses the reference's 1024-pixel width with no density scaling. Mobile is a separate responsive check, not a pixel match to the wider reference. The focused editor capture confirms that form controls are on a dedicated page rather than appended to the overview.

Intentional adaptations: co-parent is an Account row; all common-activity controls move to a detail page; sync controls, restore/conflict review, export explanation, and deletion confirmation have separate pages. The app's persistent bottom navigation and feedback control remain. Full-page screenshots show fixed navigation at its capture position; bottom padding keeps the final controls reachable when scrolling.

## Fidelity surfaces

- Typography: existing DM Sans UI font, sans-serif overview headings, clear detail headings, consistent readable row labels and secondary values. Child page heading corrected to match this hierarchy.
- Spacing/layout: bordered rounded groups, repeated section headers, aligned summaries and chevrons, touch-sized buttons, wrapping headings, ellipsized long values. No horizontal overflow in mobile/dark and desktop/light regressions.
- Colors/tokens: existing dark/light surface, sage accent, border, muted text, and danger tokens. Sync state is actual app state, including offline and conflict labels.
- Image/icon quality: no raster illustration is needed. Official Heroicons outline assets provide the section icons and navigation arrows, with their MIT license retained. Existing app navigation is preserved.
- Copy/content: brief overview descriptions and accurate detail copy; no invented parental controls, email-change mechanism, or restorable CSV import. Actual deletion and retained-record disclosures remain on the deletion page.

## Comparison history and fixes

1. Initial rendered overview established the intended compact card/row structure. Child editor still used the older serif modal heading [P2]. Replaced it with the detail-page sans-serif heading and captured `/tmp/settings-child-mobile-final.png`; final mobile overview captured in `/tmp/settings-overview-mobile-final.png`.
2. Interaction checks found that restoring a legacy profile could leave its explicit policy-review controls hidden [P1]. Refreshing a Settings form now reapplies the current page's action visibility. Policy browser regressions pass, including restore and explicit upgrades.
3. Back navigation, canceled new-child edits, saving, authenticated detail-page reload, and deletion-confirmation reset were checked. No actionable P0/P1/P2 issue remains.

## Verification

- All 34 local release checks passed; log: `/tmp/settings-pages-release-final.log`.
- Final production build and `git diff --check` passed.
- Mocked Settings regressions exercise name save/cancel/validation, browser Back, detail reload, child add/remove/cancel, activities, live sync/offline state, isolated deletion, CSV download, and offline sign-out.
- Deletion failure/retry, retained local records, policy history, sync, offline shell, and whole-app smoke regressions pass.
- In-app browser inspected overview, name save, and child detail/back at desktop and mobile widths. Browser error log was empty. Preview uses a mocked backend; no real email or production account was changed.

## Implementation checklist

- [x] Compact grouped overview and focused detail pages.
- [x] Save, cancel/back, keyboard Escape, history, and authenticated reload.
- [x] Preserve sync/conflicts, export, account deletion, and policy behavior.
- [x] Keep sample preview open and restore normal browser sizing.

## Follow-up polish

No blocking visual findings. This adapts the supplied direction to the existing product rather than replacing its design system.

final result: passed
