# 天壳 UI 设计基线

Updated: 2026-11-21

## Direction

- **概念：** 深海文明在幽蓝海底建立秩序，并从旧文明遗迹中取得器物。
- **特质：** 深邃、易读、克制；金属与琥珀色只强调进展和珍贵物。
- **避免：** 平铺的管理后台卡片、无状态含义的装饰、过度发光和持续动效。
- **动效：** 交互变化短促、低幅；主要面板静态。尊重 `prefers-reduced-motion`。

## Code tokens

| 平台 | 文件 | 命名 |
| --- | --- | --- |
| Web / Electron | `css/00-core.css`, `css/30-visual-polish.css`, `css/40-atmosphere-theme.css` | CSS 自定义属性，如 `--bg`、`--txt`、`--line-soft` |
| 局部模块 | `css/50-module-polish.css` | 模块类名；颜色优先引用全局变量 |

单位使用 CSS px。夜间主题是默认值；日间主题由 `html[data-ui-theme="day"]` 提供。

## Fonts and type

| 角色 | 字体 | 尺寸 / 行高 | 用途 |
| --- | --- | --- | --- |
| 正文 | `-apple-system`, `"Segoe UI"`, `"PingFang SC"`, `"Microsoft YaHei"`, sans-serif | 14px / 1.5 | 全局正文，覆盖中英文 |
| 面板标题 | 正文栈 | 17–20px / 1.3 | 当前面板和分区标题 |
| 卡片正文 | 正文栈 | 12–14px / 1.45 | 重要条目名称、主数据 |
| 辅助信息 | 正文栈 | 10–12px / 1.5 | 描述、状态、说明 |
| 数值 | 正文栈，启用 `tabular-nums` | 随所在角色 | 资源、进度、计数对齐 |

局部原有字号存在 8–10px 的紧凑标签；新增长文和主要操作不得使用该字号。

## Color

| 角色 | 夜间 | 日间 | 代码 / 用途 |
| --- | --- | --- | --- |
| 画布 | `#070d18` | `#dce9e8` | `--bg` |
| 面板 | `#0d1727` | `#f4f8f6` | `--panel` |
| 抬升面板 | `#112036` | `#e8f0ee` | `--panel2` |
| 正文 | `#cfe3f7` | `#203943` | `--txt` |
| 辅助文字 | `#6f88a8` | `#58717a` | `--dim`；成就页日间文字局部加深为 `#526b74` |
| 交互强调 | `#4dd8e6` | `#147f87` | `--cyan` |
| 成就强调 | `#77d6d0` | `#287d7b` | `--challenge-accent` |
| 获得 / 珍贵 | `#d7bd80` | `#8a6a1f` | 金色边框、状态文字、奖章 |
| 边框 | `#1d3352` | `#afc4c5` | `--line`；细分边框用 `--line-soft` |

对比度（WCAG 相对亮度计算）：夜间正文 / 画布 14.8:1，夜间辅助文字 / 画布 5.34:1；日间正文 / 画布 9.76:1，成就页辅助文字 / 面板 5.26:1，日间交互强调 / 面板 4.55:1。状态同时使用文字、边框或图标，不只靠颜色表达。

## Era material identity

- The active era is carried by `html[data-era]`; its accent, panel shape, and material textures come from `css/70-era-skins.css` and `assets/ui-era/`, with its field illustration in `assets/backgrounds/sequence/`.
- The resource archive keeps its compact grid and active era's field illustration. Surface accents, textures, and panel shapes follow the era skin; Eras 3 and 4 intentionally share one skin.
- Era 2 draws from its early undersea settlement: charcoal basalt shelves, sparse amber lamplight, and broad broken strata. Use `assets/backgrounds/sequence/era-2/technology-field.webp` as the image reference and `assets/ui-era/era2-strata.svg` for low-contrast surface lines; keep vertical grid seams and dense hatching out of resource tiles.
- Era 3 draws from an undersea sulfur forge: soot-dark hammered iron, poured bronze edges, and concentrated orange heat at the kiln. Use `assets/ui-era/forge.jpg` for the worked metal surface and keep the heat marks around panel edges and open field areas, leaving resource values clear.
- Eras 3 and 4 share the same forged-metal skin: soot-dark worked metal, bevelled copper edges, warm accent, and restrained kiln glow. Use the same palette, texture, panel shapes, and resource-row treatment in both eras; do not use cyan accents or chart/current overlays for Era 4.
- Era 5 is a deep-sea heavy-industry skin, distinct from the shared Era 3–4 forge treatment: pressure-rated machine plates, dark steel, aged brass, and localized furnace glow. Let exposed panel backgrounds show joined hull plates, captive bolts, and cooling louvers through `assets/ui-era/era5-industrial-field.svg`; keep the drawing faint behind cards and controls. Keep black-yellow warning paint sparse on resource and building-module edges; do not stripe panel borders, title markers, buttons, or the natural-environment meter. Preserve the 25% shell-thickness limit as a narrow amber tick. Avoid adding the pipe-header illustration to the interface; use the Era 5 field illustration as the atmospheric art anchor and keep values readable.
- Era 11 (α / 帷幕之后) uses pale veil lavender `#E8D9FF` with spectral cyan `#80DFCF` and `assets/ui-era/era11-veil.svg`; the split curtain seam and scattered lights should remain subtle behind resource values.

## Spacing, alignment, and shape

- 常用间距：4、6、8、10、12、14、16、20、24、32px；列表由 grid / flex 容器统一排列。
- 面板沿用 12px 内边距；主要交互触控区保持至少 38px 高。
- 常用圆角：6px 控件、8px 紧凑条目、10px 卡片、12px 弹层、14px 页面容器、999px 胶囊。
- 纪元 1 的礁生资源条目与采集、建造按钮使用 `css/70-era-skins.css` 中的非对称圆角 token，作为海底材质形状；按钮仍保持至少 38px 高。
- 纪元 2 的资源板与操作按钮使用同文件中的非对称短切角，表现玄武岩台地；琥珀色只标出少量灯火和关键边缘，按钮仍保持至少 38px 高，绿色购买状态继续表达可建造。
- 卡片使用 1px 边线和轻表面差；阴影用于需要浮起的弹层，不给普通列表逐行加重投影。
- 计数和资源数值右对齐时使用等宽数字；标题、描述、状态共享图标后的文字起始线。

## Components

| 组件 | 尺寸与样式 | 状态 |
| --- | --- | --- |
| 通用按钮 | 至少 38px 高，使用 `.btn` 的主题颜色与 6px 圆角 | hover、active、disabled、focus-visible |
| 成就条目 | 桌面双栏，8px 间距；至少 76px 高；42px 成就图标；已获得时在角落叠 30×33px 奖章 | 当前进度、已获得、待同步、未获得 |
| 建筑成就行 | 按区域折叠；双栏紧凑行，至少 60px 高；34px 图标；奖章缩为 24×27px | 展开、折叠；当前进度优先，其次已获得和未开始 |
| 总成就进度 | 右侧计数与同宽 4px 进度条；小屏移至标题下方 | 0–100% |

## Icons and layout

- 使用项目已有 SVG 图标和独立主题插画；插画保留原色，奖章作为获得状态的叠层标记。
- 不新增第三方图标库。图标与相邻文字垂直居中，状态标签不能遮挡主要名称。
- 页面主容器最大宽度 1080px；使用内容驱动的双栏布局，窄屏单列。
- 已用响应断点：430、560、760、900px；成就页在 560px 以下改单列。

## Voice and copy

- 玩家界面以简体中文为默认；新增或修改文案先登记在 i18n 文案底表，再通过语义 key 引用。
- 用简短、可行动的表达；按钮说清动作，状态简洁且不重复邻近说明。
- TapTap 固定简体中文；仅明确识别 Steam/Electron 后才启用翻译。

## Exceptions

| 规则 | 范围 | 原因与影响 | 来源 |
| --- | --- | --- | --- |
| 日间全局 `--dim` 与画布对比度约 4.16:1 | 尚未局部覆盖的旧面板 | 低于普通文字 4.5:1；成就页已覆盖辅助文字，其它面板保留为后续可访问性修复项 | `css/40-atmosphere-theme.css` |

