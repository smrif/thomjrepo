# Mobile accessibility first pass — October 23, 2026

The account/profile, Settings and Reports flows now have a repeatable local
browser pass at 320×568, 390×844 and 844×390. This supplements the existing shell
safe-area, keyboard-resize, focus, back-navigation and scroll-restoration checks.
Physical iPhone VoiceOver, Dynamic Type, keyboard and photo-picker testing remain
in [IOS-QA-05](mobile-owner-qa.md).

Run `pnpm --dir mobile test:accessibility` after building the mobile preview.
It uses isolated fictional account data, blocks external requests and checks 87
screen/layout checkpoints across those three viewports:

- Visible enabled buttons have names and at least 44×44 CSS-pixel targets.
- Visible editable fields have labels; button text does not overflow its box.
- Settings overview and ten detail pages fit without horizontal document overflow.
- A 24px text override exercises labels, fields and buttons, including tab labels.
- Report cards can be selected with the keyboard and expose their pressed state.

Screenshots and checkpoint JSON are ignored under
`mobile/.build/accessibility/`. Screenshot review remains necessary: the first
overflow-only assertions missed text clipped inside fixed-width controls. The
pass now settles navigation before checking and also checks button overflow.

## Fixed during the pass

- Added an accessible name to the shared custom-activity field.
- Allowed the Account button to grow with its text instead of inheriting the
  narrow prototype sample-badge limit.
- Wrapped enlarged bottom-tab labels within their buttons, preventing overlap.
- Allowed Settings action labels and appearance choices to wrap as text grows.
- Reports expose keyboard button semantics, selected/pressed states and visible
  focus; small report controls now meet the 44px height target.

This is a focused regression pass, not an accessibility conformance claim. It
does not simulate VoiceOver speech/order, native Dynamic Type behavior, every
contrast combination or system-provider accessibility. Native iOS/Android report
generation has separate [content/render QA](mobile-reports.md).
