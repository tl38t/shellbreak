# Project instructions

## Player-facing text and i18n

- Follow [docs/I18N_TEXT_GUIDELINES.md](docs/I18N_TEXT_GUIDELINES.md) for every user-visible string, including buttons, tooltips, accessibility labels, dialogs, logs, onboarding, changelog and player-facing error fallbacks.
- Update the current text registry at [outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx](outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx) before adding or changing visible copy. Give new text a semantic key and context; code should reference the key instead of adding a new literal to UI/render logic.
- Translated UI text is allowed only in Steam/Electron builds. TapTap must always show zh-CN, ignore saved/system locale preferences and omit the locale switcher. If the runtime cannot be positively identified as Steam/Electron, use zh-CN.
- Keep program IDs, save/API keys, numbers/rules, code comments and player-entered names out of translation strings. Never delete or reuse a retired text key.
