# Electron locale resources

The approved English dictionary lives in `electron/locales/en-US.js`.
Its **single source of truth** is `outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx`
(sheet `文案底表`). Proofread conclusions from the earlier proofread workbooks
have been merged back into that sheet by registration ID, together with the
`校对问题` / `术语定稿` / `术语表去重` / `游戏梗校对` worksheets. No second
workbook is read at build time, and no machine-only file is required: the
registry, the exporter and both generated bundles are checked into this repo.

Regenerate both locale bundles after approved registry changes:

    python scripts/export_i18n_runtime.py
    python scripts/export_i18n_runtime.py --check

`--check` fails when regeneration would change either bundle, so it can be used
to assert that the checked-in `zh-CN.js` / `en-US.js` are up to date. Generation
is deterministic (sorted keys, LF newlines); running it twice produces no diff.

Only rows whose English status is `已校对` are exported to `en-US.js`. Rows
marked `待校对` or any other non-approved status still export their
Simplified Chinese source to `zh-CN.js` but no English value, so
`SB.i18n.valueFor()` falls back to Chinese at runtime. Unreviewed
translations are never shipped silently.

As of 2026-11-06, `en-US.js` carries all 3885 approved keys present in
`zh-CN.js`. The registry includes the reviewed faith strings, home screen,
onboarding, and Save Manager copy; English changes are loaded only by
Steam/Electron builds.

Register each player-facing string and its semantic key in the inventory before
changing code. English resources stay under `electron/locales`, a directory
excluded by the TapTap upload builder; `src/locales/zh-CN.js` is the Chinese
baseline and **is** included in TapTap builds.

The renderer enables translated UI only when the explicit Electron platform
marker is present and `localizationEnabled` is true. The Electron main process
reads Steam's current game language through Steamworks and passes the language
code to the renderer. In Settings, players can follow Steam, choose Simplified
Chinese, or choose English; the choice is stored in Electron local storage
only. Unsupported Steam languages and Steam API failures use Simplified
Chinese.

If the runtime marker is absent or unknown, the renderer uses `zh-CN`, does not
read locale preferences, hides the language selector, and never loads
`en-US.js`. The connected home screen includes the header and settings,
resource and environment cards, navigation tabs, starting guidance, gathering
controls, and the visible building list. Other gameplay panes and later
era-specific controls still need to be connected to translation keys.
