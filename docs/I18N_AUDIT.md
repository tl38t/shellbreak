# i18n 前置盘点

日期：2026-11-04

## 结论

需要解耦。当前简体中文同时承担默认界面语言、内容数据和运行时提示；文案直接写在 HTML、配置表、游戏逻辑和渲染器中。按源码检索，`index.html` 与 `src/` 共 62 个文件含中文文本，主要内容表中有约 1,076 行 `name` / `desc` / `label` / `title` 等展示字段。这个规模不适合靠逐个页面复制或全局替换来国际化。

项目没有构建步骤，页面用经典 `<script>` 加载并依赖固定顺序。建议先沿用现有 `SB` 全局命名空间，做轻量运行时词典和格式化接口，不引入需要打包器的依赖。

## 文案所在位置

| 类型 | 代表位置 | 处理方式 |
|---|---|---|
| 静态界面、无障碍文案 | `index.html`：设置、页签、页脚按钮、`title`、`aria-label` | 用稳定的 `data-i18n` 键初始化；启动时设置 `<html lang>` 并翻译静态节点 |
| 游戏内容 | `src/config-content.js`、`src/config-buildings.js`、`src/config-catalog.js`、`src/techs.js`、`src/civics-data.js`、`src/challenges.js`、`src/wonder.js`、`src/companies.js` | 保留稳定 ID 和数值/条件；名称、描述、奖励等展示文本按 ID 放入语言资源 |
| 实时 UI 与动态提示 | `src/ui/render-*.js`、`src/ui/render-info.js`、`src/ui/track-dock.js` | 将按钮、提示、状态句、详情文案改为带参数的翻译调用；按当前语言渲染 |
| 操作反馈与系统消息 | `src/game.js`、`src/prestige.js`、`src/habitat.js`、`src/events.js`、`src/ui/input.js`、`src/save-transfer.js`、`src/redeem.js`、`src/ad.js`、`src/rank.js` | 让逻辑发出稳定消息键和参数，UI 层再翻译；平台返回值要有本地化兜底 |
| 更新日志 | `src/config.js` 的 `CFG.CHANGELOG` | 单独按语言维护，避免持续更新的长文案继续混在玩法配置里 |
| 日期、数字、单位 | 多个 renderer、存档面板和排行榜 | 集中使用 `Intl.NumberFormat` / `Intl.DateTimeFormat` 和可复用的时长、速率格式化函数 |

## 必须保持非本地化的内容

- `id`、资源键、科技/市政/建筑键、存档键、TapTap 接口字段、DOM `data-*` 事件协议：这些是程序标识，不是展示文案。
- 数值、解锁条件、效果计算与规则标志：语言切换不能改变玩法。
- 玩家输入的国度名、信仰名等自定义文本：按原样保存和显示。
- 存档中历史字段先兼容旧版本。尤其挑战结算对象目前会保存 `name`、`label`、`reward`、`goalText` 等展示字符串；新格式应以挑战 `id`、档位和参数为准，读取旧字符串时保留兜底，不能因切换语言或迁移而丢掉未领取的结算面板。

## 建议的最小架构

1. 新增早加载的 `src/i18n.js`，只提供 `SB.i18n.t(key, params)`、`setLocale(locale)`、`getLocale()`、`apply(root)` 和格式化入口。保持无依赖、可在经典脚本中使用；缺键时回退到简体中文并在开发诊断中记录。
2. 建立 `src/locales/zh-CN.js` 作为现有文案的基线资源；目标语言确定后再添加对应词典。键名用稳定语义命名空间，例如 `ui.settings.audio.mute`、`resource.kelp.name`、`challenge.cold.goal`，不要用中文原文或数组下标作键。
3. 语言偏好单独保存（例如 `shellbreak.locale`），不要写进周目状态或作为玩法存档迁移字段。启动时先读偏好，再渲染界面；偏好存储可沿用现有 UI 设置模式，之后如需跨设备同步再接平台存储。
4. 内容数据继续由稳定 ID 驱动；渲染器在展示时取当前语言的名称/描述。动态文案使用参数占位，不把数字拼接在已翻译句子外，例如 `challenge.progress` 配 `{current, total}`。

## 迁移顺序

1. 先接入词典、语言偏好与缺键回退；将 `index.html` 的静态界面文案迁入词典，验证启动加载顺序和页面 `lang`。
2. 迁移资源、建筑、科技、市政、工坊、奇观、挑战等内容目录；让既有逻辑仍只依赖 ID 和数值。
3. 迁移面板渲染、提示、弹窗、日志、存档/平台错误等动态字符串；统一日期、数字、时长格式。
4. 逐批补齐目标语言，做键覆盖率扫描和全流程界面核对；缺译时始终回退中文，避免显示裸键。

## 当前状态

底表 outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx 已登记到 SB-006497；新增文案仍按“先登记、再写代码”维护。当前中文基线与 Electron 英文资源各有 3,911 个 key，分别位于 src/locales/zh-CN.js 与 electron/locales/en-US.js，由 scripts/export_i18n_runtime.py 生成。

除页面标题、品牌、设置、主题、无障碍文案、自动点击状态、曲目提示、气泡和拾取按钮外，已接入自然环境面板、首页切片、信仰页词条、输入操作日志、建筑自动化与多类建筑运行控制、发射场模式与资源提示。星图外层建筑管理和 iframe 内的星图说明现从父页面接收当前语言词条。建筑名、资源名和分区名已走语义 key。巢穴页只迁入了部分建筑描述；其余参数化建筑描述、科技与市政树、工坊和详情卡、挑战/奇观/成就、弹窗、引导、错误、存档与平台反馈仍需继续接线。当前不代表全游戏已英文化。

英文只在 Electron 中启用。Electron 主进程通过 Steamworks 读取 Steam 当前游戏语言；未设置手动偏好时跟随 Steam，设置页也可切到简体中文或英语。Steam 返回不支持的语言、API 初始化失败或取不到语言时回退简体中文。TapTap 与未知运行时固定使用中文，不读取已保存的语言偏好，且隐藏语言选择器。

游戏标题当前使用 “From the Abyss to the Stars: A Deep-Sea Civilization Builder”。内容表中的游戏文本和译文已按校对版本导入词典；运行时接线仍在进行。每批改动后应继续核对 key 覆盖、占位符、缓存版本与双平台隔离，并在发布前复核动态文案和界面完整度。
