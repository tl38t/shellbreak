# Electron desktop package

The desktop shell is a separate Electron entry point in `electron/`. It serves the existing game from the privileged `shellbreak://game/` origin and loads the same game source and assets as the web build.

The preload exposes one read-only platform marker: `window.shellbreakPlatform`. Translated UI is eligible only when `runtime` is `electron` and `localizationEnabled` is `true`. Missing or unknown markers must always resolve to Simplified Chinese. Browser language and TapTap user-agent checks are not localization signals.

Put runtime locale resources under `electron/locales/`. The TapTap packaging script copies `index.html`, `src/`, `css/` and its asset allowlist; it does not copy `electron/`, so locale files remain out of TapTap uploads. Keep the workbook as the source inventory and register each semantic key before adding translated runtime strings.

## Commands

- `pnpm install` installs the pinned desktop build tools.
- `pnpm start` runs the game in its Electron shell.
- `pnpm package:win` creates a Windows x64 NSIS installer under `dist/electron/`.
- `pnpm package:dir` creates an unpacked Windows x64 app under `dist/electron/` for local inspection.

The Electron package loads the approved English locale resource and the current home-screen localization slice. Choose Settings → Language → English to inspect it, or choose Follow Steam Language to use Steam's current game language. Untranslated or not-yet-approved strings fall back to Simplified Chinese. This does not replace TapTap-only features such as ads, cloud saves, rankings, achievements or redemption codes; Steam release readiness remains a separate checklist.
