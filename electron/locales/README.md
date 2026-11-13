# Electron locale resources

Runtime locale resources are generated from the `文案底表` sheet in
`outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx`:

- `src/locales/zh-CN.js` is the Simplified Chinese baseline and is used by all
  builds, including TapTap.
- `electron/locales/en-US.js` is the English runtime dictionary.
- `electron/locales/zh-TW.js` is the Traditional Chinese runtime dictionary.

The registry's Steam Store Traditional Chinese columns are separate from the
game runtime columns. Do not copy store copy into the runtime dictionary.

Regenerate a reviewed locale after updating its registry rows:

    python scripts/export_i18n_runtime.py --locale en-US
    python scripts/export_i18n_runtime.py --locale zh-TW

Check bundle drift with:

    python scripts/export_i18n_runtime.py --check

The check also scans literal translation calls and static `data-i18n` attributes
for keys missing from the registry. TapTap-only keys marked `平台不适用` remain
Simplified Chinese and are reported separately from Steam/Electron blockers.

Before packaging, require approved translations for every active semantic key:

    python scripts/export_i18n_runtime.py --check --require-complete

Only rows marked `已校对` are included in a translated dictionary. Other rows
fall back to Simplified Chinese at runtime. The Traditional Chinese selector
is shown only when the generated `zh-TW` coverage metadata confirms that every
active key has an approved translation. Steam language `tchinese` also falls
back to Simplified Chinese until that condition is met.

The exporter refuses to overwrite a bundle if that would delete an
unregistered key, an active but unapproved translation, or a key still
referenced by application source. Resolve such keys in the registry before
exporting; this preserves translations that have not yet been reconciled.

Translated resources are loaded only in an Electron runtime with the explicit
`localizationEnabled` platform marker. The TapTap packaging script does not copy
the `electron/` directory. When the marker is absent or unknown, the game keeps
Simplified Chinese, ignores saved locale preferences, and hides the selector.
