# Electron desktop package

The desktop shell is a separate Electron entry point in `electron/`. It serves the existing game from the privileged `shellbreak://game/` origin and loads the same game source and assets as the web build.

The preload exposes one read-only platform marker: `window.shellbreakPlatform`. Translated UI is eligible only when `runtime` is `electron` and `localizationEnabled` is `true`. Missing or unknown markers must always resolve to Simplified Chinese. Browser language and TapTap user-agent checks are not localization signals.

Put runtime locale resources under `electron/locales/`. The TapTap packaging script copies `index.html`, `src/`, `css/` and its asset allowlist; it does not copy `electron/`, so locale files remain out of TapTap uploads. Keep the workbook as the source inventory and register each semantic key before adding translated runtime strings.

## Commands

- `pnpm install` installs the pinned desktop build tools.
- `pnpm start` runs the game in its Electron shell.
- `pnpm package:win` creates a Windows x64 NSIS installer under `dist/electron/`.
- `pnpm package:dir` creates an unpacked Windows x64 app under `dist/electron/` for local inspection.
- `pnpm package:steam` creates an unpacked Windows x64 Steam depot payload under `dist/steam-depot/win-unpacked/`. Use that folder's contents as the depot content root and set the Steam launch executable to `Shellbreak.exe`; do not upload the NSIS `Setup.exe`. The payload intentionally omits `steam_appid.txt`, since Steam supplies the App ID when it launches the game.

The Electron package loads locale resources for English and Traditional Chinese from `electron/locales/`; the Simplified Chinese baseline is shared from `src/locales/`. The in-game Traditional Chinese option and Steam's `tchinese` language are enabled only when the generated dictionary has an approved translation for every active semantic key. Until then, the game falls back to Simplified Chinese. Untranslated English keys also fall back to Simplified Chinese.

The current i18n package gate is:

    python scripts/export_i18n_runtime.py --check --require-complete

It checks that locale bundles match the registry and that every active key has an approved translation. A failing gate means the declared locale coverage is not ready for the package. This does not replace TapTap-only features such as ads, cloud saves, rankings, achievements or redemption codes.
