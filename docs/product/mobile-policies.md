# Offline policy access — October 23, 2026

The account welcome, profile setup, account panel and Settings overview offer
Terms of Use and Privacy Policy buttons. The reader stays inside the app and
returns to the source screen, focus and scroll position. Unsaved profile fields
remain available. The Terms-to-Privacy link and document footer return also stay
inside the reader/account flow.

The build reads the shared app's current terms/privacy version constants and
embeds the corresponding checked-in `assets/legal/<version>/` documents. It
checks version metadata and rejects unexpected active content or links. Reading
does not require a network request or a new native plugin. The complete approved
policy text is preserved; the app frame supplies the heading and navigation.

This is read-only access. It does not change policy wording, create acceptance
history, infer consent or alter native test-profile validation. The current
native test profile still forces `termsAccepted:false`; release registration and
acceptance storage require the final policy/environment review. The existing
website's acceptance behavior is unchanged.

## First QA pass

- `test:policies` walks through both phone widths with browser offline mode:
  both complete versioned documents, light/dark and enlarged-text rendering,
  internal cross-link, keyboard Escape,
  return focus, draft preservation, Settings/account return, close/reopen and no
  profile/record/acceptance mutation. External requests are blocked.
- The signed iOS account restart probe exercises the actual reader and verifies
  return to the ready product with identical saved data. Both write/read processes
  passed the required policy markers. iOS build and Android build/lint pass.
- 73 mobile unit checks and account, Settings, sync, backup, reports, policy and
  accessibility browser suites pass. Existing reports/accessibility commit
  `7ab956a` also passed hosted CI.
- Native build commands now bundle/sync current assets before compiling. QA
  caught an initial stale-asset build; the iOS account probe now rejects a build
  without the current reader markers instead of counting old evidence.
- Browser screenshots are ignored under `mobile/.build/policies/`. Physical
  VoiceOver, keyboard/safe-area and return navigation remain in IOS-QA-05.

Run `pnpm --dir mobile test:policies` after building. The existing
`pnpm --dir mobile probe:account:ios SIMULATOR_UUID` includes native reader checks.
