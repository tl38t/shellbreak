# ERA11「α」与二层轮回「帷幕之后」规格 v0.1

> 状态：**P0 骨架已实装（2026-11-17）**，初稿 2026-11-14，修订 2026-11-16（三项拍板见 §0 #7–#9；按钮落点 + 飞升点换算见 #10–#11）。
> **2026-11-17 实装记录**：按下述落点改了生产代码（techs/tech/state/state-migrate/civics/prestige/render/game + 新增 ui/veil-hub-ui.js + css/99-veil.css + assets/veil/）。真实浏览器（headless Chrome）全链路核验通过：掀幕按钮显示、预估换算、doVeil 清档发点、三路径逐次解锁 1→3、装配台 10 热区 + LV3 红字。数值仍为占位待标定；**未 commit / 封包 / 上传**。
> **2026-11-17 修阻塞（用户静态核查 #1/#5 + 复查中发现的三处口径偏差）**：
> 1. **首次掀幕死锁已修**：`emptyMeta()` 的 `veil` 必须是 null（#4 口径 A 判据），而 `doBreak` 只在账本已存在时才累加周期账 ⇒ 首次掀幕门禁 `cycleStar≥1000` **永不成立**。
>    修法 = 新增 `prestige.veilPeriod(meta, s)` 作为**唯一真源**：账本不存在时用「存档至今累计」(`tideEarnedTotal` / `stardustEarned`) 引导周期起点，并**并入本周目尚未结算的结算值**（原本掀幕会白打一局，§3.1 第①步那条「先结算本局」此前没落地）。
>    预估 / 底栏提示 / 确认面板 / `doVeil` 四处同源调用它。
> 2. **`s.got.stardust` 口径 A 补实装**：`state.starEarnedSeed(meta)` 单点收口 —— 未掀幕档读历史累计（存量档行为零变化），掀幕后读 `veil.cycleStar`（`freshRun` 的 got 初始化 + `doBreak` 结算当场两处都调它）。
> 3. **清列修正**：`doVeil` 此前把 `tideEarnedTotal` / `stardustEarned` 一起清零、`spent` 也归零，违反 §2 保留列与决策 #1。改为 §3.2 的写法：`spent += tide; tide = 0`，历史总量一字不动，定损残差 `E − T − S ≡ 0` 仍成立（e2e 已钉）。
> 4. **大厅常驻重开入口**：掀幕主界面此前只在「刚掀完」自动弹一次，关掉即失联（核查 #4）。轮回商店页新增 `.meta-veil` 分区 + `data-veil-open` 按钮（document 级委托，扛住 2 秒整页重写）。
> 5. **e2e 覆盖**（核查 #6）：新增 `sim/e2e-suites/veil.mjs`（32 项），并把两处夹具缺口补上（假 DOM 缺 `createTextNode`、`techSeg` 未声明）——此前 `node sim/e2e.mjs` **启动即抛，一行都跑不了**。
> 6. 械飞升 30 档效果全部接完（见 `VEIL_SI_ORGAN_SPEC_v0.2.md` §7 表末状态）。
> 真实浏览器核验：首次掀幕（veil=null）→ 预估 25.00 → 掀幕 → 第 1 重 / 只开 si / 历史保留 / 残差 0；`node sim/e2e.mjs` 1927/1998（失败 143 项与改动前逐条同名，零新增）。
> **2026-11-17 晚 · 界面形态**：帷幕从全屏遮罩弹窗改为**独立页签**（用户：「加一个新的标签，就叫帷幕，
> 点了就切换到帷幕页面，不是弹窗那种」）。页签门 = `meta.veil` 非 null；正文在 `#pane-veil`；
> 页内大厅 → 路径操作界面（硅基装配台）为**页内切换**，带「← 返回帷幕」。轮回商店页底部
> `.meta-veil` 入口卡与 `#veilHub`/`#veilModal` 两个遮罩层已删除。同批把页签名「轮回商店」缩短为「轮回」。
> 详见 `VEIL_HUB_SPEC_v0.1.md` 顶部形态变更说明。
> **待标定 / 待接**：VEIL_TREE 23 节点未建（首层软着陆待做）；装配台 30 效果档中 §7 七项未解挂点（礁口巢上限/工艺独立乘区/按岗位产出/食物需求/钻机被动破壳两轴/软实力消耗/敌国上限）暂只记等级、未接生产乘区；虚境界面仍占位，基因目前只有不写档的只读界面演示。
> 决策来源：2026-11-14 两轮用户拍板 + 2026-11-16 三项拍板（编号见 §0）。
> ⚠️ **覆盖声明**：本稿**作废**前几轮的「ERA11 局内三选一飞升路径 + ERA12 三型天灾」分层方案。
> 现行分层 = 飞升是 **meta 层二层轮回**，ERA11 是一个大轮回周期末尾的唯一新纪元，ERA12 本期不做。

---

## 0. 决策汇总（已拍）

| # | 决策 | 结果 |
|---|---|---|
| 1 | 清零档位 | **全部清零（基本等于删档重来）**，但保留「历史获得过的轮回点 / 星屑」记录 |
| 1a | 成本基准（上轮 #1） | `unified_field` 44,700,000 →《掀起帘幕》**447,000,000** 科技点（基础 cost，实付仍吃科技折扣） |
| 2 | 四项旧日遗产 | **要清**（`oldFaith` / `memorialWonders` / `oldArtworkEarnedTotal` / `oldTideStelesEarnedTotal`） |
| 3 | 飞升树每轮掀幕 | **重买** |
| 4 | `stardustEarned` 口径 | **口径 A：历史只记账，`s.got.stardust` 切本周期累计**（细则见 §4） |
| 5 | 纪元名 / 二层名 | ERA11 = **α**（2026-11-16 改，覆盖原「窥虚纪」）；二层 = **帷幕之后**；《飞升虚境》= **假结局** |
| 7 | 终极科技名（2026-11-16 拍） | 原《帷幕之后》→ **《掀起帘幕》**（id `beyond_veil` 不变）。二层系统仍叫「帷幕之后」，不再与科技同名 |
| 8 | 终极科技尤里卡（2026-11-16 拍） | 原戴森竣工 `dysonPct:100` → **本帷幕周期累计星屑 ≥ 1000**，即 `cond:{t:'gathered',r:'stardust',n:1000}`；口径沿用 #4，读 `s.got.stardust`（掀幕后 = `veil.cycleStar`） |
| 9 | 大统一方程（2026-11-16 拍） | `unified_field` 的尤里卡 `dysonPct:80` **不动**，只改《掀起帘幕》自己的尤里卡 |
| 10 | 掀幕按钮落点（2026-11-16 拍） | 放在**轮回按钮下方**（`#btnBreak` / `#btnCycle` 那一行 `.foot` 的下一行），不放在原稿的「自然环境横幅行」；显示条件仍 = `s.techs.beyond_veil`（学完才出现） |
| 11 | 帷幕点算法（2026-11-16 拍） | `points = round( cycleTide/10000 + cycleStar/1000, 2 )`——两项各自除门槛后相加、**保留两位小数不取整**（用户拍「不取整，留两位小数」）；星屑满 1000 恰 = 1.00 点，与尤里卡自洽 |
| 6 | ERA12 天灾 | **本期不做** |
| — | 层次 | **覆盖**（非叠加） |
| — | 首层飞升 perk | 一开始就能点，且**当局就要获得**（见 §5） |

**未拍 / 默认取法**（不阻塞骨架，见 §10）：`meta.cycle` 加成例外默认不动；难度档、postGoal 挑战、第三条飞升线一律不做。

---

## 1. 两层循环结构

```
第 1 层（现行）：单局 → 破壳 → 主动「轮回」→ doBreak → 发 tide / stardust → 买 TIDE_TREE / STAR_PERKS → 下一局
第 2 层（本稿）：攒够 → ERA11《掀起帘幕》→ 自然环境「掀开帷幕」→ 大轮回
                 → 清资产 → 发「帷幕点」→ 重买 VEIL_TREE → 回到第 1 层，规则按新树重跑
```

- 游戏从「一层 prestige + 线性树」变成**两层**。后续拓展靠「换姿态 / 重买二层树」的乘积，而不是加 ERA13/14（每纪元 = 科技 + 市政 + 建筑 + 奇观 + 图标 + 双语 + 存档迁移 + e2e，且 era5→破冰已占整局 68% 时长）。
- **ERA11/12 不再承担「加时赛」语义**：`dysonDone` 仍是硬终局旗，17 个 `goal:{t:'dyson'}`、`voidEnd`/`dysonEnd`、4 条榜、四段分镜、AI bot 共 9 类消费方**一字不动** ⇒ 挑战成绩在竣工定格。
- 帷幕点只买**规则**（一层 tide/stardust 获取倍率、树节点解锁、后续可拓展的强度上限），**不买裸数值乘区**。三棵树（TIDE / STAR / VEIL）若都进 `globalMul` 会指数滚雪球；沿用「加法轴 + 封顶」。

---

## 2. 清零边界（「删档重来」的精确定义）

| 清（资产 / 加成 / 进度） | 保留（身份 / 防作弊 / 统计 / 版本） |
|---|---|
| `tide`、`perks`、`stardust`、`starPerks` | `tideEarnedTotal`、`stardustEarned`（#1 要的历史记录） |
| `veil.perks`（#3 重买）、`veil.cycleTide` / `veil.cycleStar` 归零 | `veil.points` 余额跨掀幕保留并加上本次新得点数；`cycle`、`runs`、`rebirths`、`layers` |
| 四项旧日遗产：`oldFaith`、`memorialWonders`、`oldArtworkEarnedTotal`、`oldTideStelesEarnedTotal`（#2） | `achv`、`achievements`、`challenges.completed`、`redeemed` |
| `techLog`、`buildingLvlTotal`、`lastRun`、`track`、`challengePopupPending` | `seenVersion`、`onboardSeen`、`compensationTotal`、`driftTerraVersion` |
| 本局 `s` 全部（走 `startRun` 重建） | `religionSeen`、`shopUnlocked`、`stardustShopUnlocked` |
| | `perksVersion`、`starPerksVersion`、`autoResearch`、`skydrillMul`、`adRebirth` |
| | `govPassiveCards`、`govEverAdopted`（2026-11-28 改判，见下） |
| | `veil.count`（第几重帷幕，只增不减） |

**四条不能清的理由**：

1. `shopUnlocked` / `stardustShopUnlocked`（`game.js:58` 挡 meta 页）——清掉则掀幕后连轮回商店都打不开，玩家有帷幕点也没地方花，**死局**。
2. `redeemed`——`config.js:1001` 明写本地码共用防重表，清了 = 同一礼包码每档无限领。
3. `achv` / `achievements` / `challenges.completed`——清了成就墙与挑战通关记录全空，`achv.js:294` 的兜底清扫只读 meta，不会补回。
4. `cycle`——`loop5`（`0.05×cycle`）、《黑历史蓝图》尤里卡 ≥15、市政鼓舞 3/7/10/15、艺术品 +10%/cycle、轮回次数榜、流浪泰拉 `prereq:{t:'cycle',n:15}`（`challenges.js:79`）共 6 处读它；`normalizeMeta:865` 会把 <1 拉回 1，`hasProgress`（`state.js:877`）靠 `cycle>1` 判「有进度」，清了会误触三态扫描「不确定一律不开新局」。
   ⚠️ 见 §8 已知例外。

`govEverAdopted` 与 `govPassiveCards` 曾放「清」列：只清 `govPassiveCards` 而留 `govEverAdopted`，「首次采用政体时生成被动卡」不会重跑 ⇒ 卡永久丢失，比两个都清更怪。

**2026-11-28 改判（用户拍板）**：两张表改为**跨帷幕保留**。理由：《美好旧日》的奖励文案承诺「永久解锁你在各周目采用过的政体的被动卡」(`zh-CN.js` 的 `changelog.challenge.good_old_days`)，而清表 = 每飞升一次奖励归零；且 `govEverAdopted` 一并清掉后连重建依据都没有（`civics.unlockAdoptedGovPassiveCards` 只按现存记录补卡）。两表同进同出，`ensureGovPassiveCards` 每次读档按 `govPassiveCards` 重新 push 卡，不会出现「有标记没卡」的中间态。落点：`prestige.js` 的 `doVeil` 与 `beginAscensionCycle` 均不再清。

---

## 3. 原子事务与定损方程

### 3.1 事务顺序（不可换序）

```
doBreak(silent)        // ① 先结算本局，否则本局收益凭空消失
  → 计帷幕点            // ② 用周期增量，不是历史总量
  → 原子清零            // ③ 见 §3.2，一次 saveMeta
  → veil.points += gained / veil.count++ / cycleTide,cycleStar = 0
  → startRun            // ④ game.js:174 / :203 → freshRun(true)
  → 新局买 VEIL_TREE 首层节点（当场到账）
```

`breakSettled` 时走 `nextCycle` 同款分支（`game.js:2996-3000`）。

### 3.2 定损方程必须不动（硬阻塞）

`sim/e2e-suites/redeem.mjs` 锁定残差恒等式（JUDGMENTS:1475）：

```
tideEarnedTotal − tide − spent ≡ 0
```

若 `tide→0`、`spent→0` 而历史总量保留，残差瞬间变成整笔历史量 ⇒ 补偿判「又丢了 N 点」⇒ 重复补发且不可回收。

**做法**：把被清的余额记成一笔 `spent`：

```
spent += tide;  tide = 0;   // tideEarnedTotal 一字不动
验算：E − 0 − (S + T₀) = E − S − T₀ = 0  ✅（原式 E − T₀ − S = 0）
```

`spent` 只在 `prestige.js:470 / :488` 写、`render-pane-meta.js:175` 显示「累计消费 / 兑出」，语义上正是「被帷幕核销」。**回归残差断言一行不改**。

### 3.3 帷幕点不能按历史总量算（硬阻塞）

`tideEarnedTotal` / `stardustEarned` 只增不减 ⇒ 连点掀幕可无限刷点。

新增**本周期累计** `veil.cycleTide` / `veil.cycleStar`：
- 只在 `doBreak` 结算时累加，与 `prestige.js:300` 的 `meta.stardustEarned += _sd` **同一事务、同一个 `_sd`**；tide 侧同理。
- 掀幕时归零（但 `veil` 对象本身保留，`count++`）。
- `帷幕点 = f(cycleTide, cycleStar)`，系数**占位待标定**。历史总量只管展示、榜、历史口径。

---

## 4. #4 口径 A：`s.got.stardust` 切本周期累计（本轮拍板）

### 4.1 为什么必须切

`meta.stardustEarned` 不是纯展示数字，它经 `s.got.stardust` 给下一局**发加成**：

| 读点 | 作用 |
|---|---|
| `game.js:1296` | 排行榜「最多星屑」（`calcType:best` 自动取历史最大） |
| 商店面板 | 「累计结算获得 X」 |
| `state.js:551` | **每次开新局把这笔总数整笔 seed 进 `s.got.stardust`** |
| `techs.js:1064` | 《继承繁星之人》尤里卡 `cond:{t:'gathered',r:'stardust',n:70}`，读 `s.got.stardust` |
| `workshop.js:130` | 工坊效率 `m += s.got.stardust / 100`，**无封顶**（:129 注释明写） |
| `ai-strategy.js:447` | bot 对同一尤里卡的判断 |

若不切：历史 300 星屑 ⇒ 掀幕后新局第一帧 `s.got.stardust = 300` ⇒ 尤里卡开局白送、工坊 `+300%`，且随历史总量越滚越大永不回落，与该科技「本轮回星屑 ×2」形成正反馈。这与「删档重来」直接冲突。

### 4.2 精确落点（写入点只有 2 处，已全仓 grep 核实）

| # | 位置 | 现状 | 改为 |
|---|---|---|---|
| W1 | `state.js:551` `freshRun` 的 `got` 初始化 | `stardust: (_meta ? (_meta.stardustEarned || 0) : 0)` | seed 本周期累计（分叉见 4.3） |
| W2 | `prestige.js:301` `doBreak` 结算当场 | `if (s.got) s.got.stardust = meta.stardustEarned;` | 写本周期累计（先累加 `veil.cycleStar`，再写） |

**读点 3 处一行不动**：`workshop.js:130`、`techs.js:1064`、`ai-strategy.js:447` 只读 `s.got.stardust`，自动跟随。

**`state-migrate.js:545-549` 一行不动**：`out.got` 每次读档清空后按 `base.got` 的**键列表**从 `raw.got` 拷回数值（`base = freshRun(false)` 见 `state-migrate.js:13`），它持久化的是上一局结算值，不重新 seed。掀幕后 `startRun → freshRun(true)`（`game.js:203`）会写对新值，无需迁移干预。

⚠️ `s.res.stardust`（`state.js:292`，本局余额，初始 0）与 `s.got.stardust`（累计台账）是**两个不同字段**，不要一起改。

⚠️ **必须同时改 W1 与 W2**：只改 `freshRun`，掀幕前那一局的工坊效率照样爆；只改 `doBreak`，掀幕后新局 seed 仍旧值。

### 4.3 切换口径（对 #4 的细化，待用户确认）

⚠️ **本功能尚未实装** ⇒ 上线那一刻不存在「掀过幕的玩家」，所有现存存档都没有 `veil` 账本、
`veil.count` 皆为 0。要防的不是「兼容两拨老玩家」，而是：

> **删档重来只能由玩家主动掀幕触发，不能变成版本更新的副作用。**

游戏已上线在跑，玩家手里有存档。若 W1/W2 直接一律改读新账本，玩家仅更新版本、下次开新局
就会发现《继承繁星之人》尤里卡灭了、工坊效率掉下来，而他什么都没点。

**简化做法**：`veil` 账本**在掀幕那一刻才创建**。账本不存在就走旧口径，存在就走新口径。
这不是「两套玩家兼容判断」，是数据结构的自然结果，连显式 `count >= 1` 判断都不必刻意写。

| 条件 | W1 seed / W2 写入值 | 效果 |
|---|---|---|
| `meta.veil` 未创建（尚未掀幕；上线瞬间所有存档皆属此类） | `meta.stardustEarned`（**保持旧口径**） | 行为零变化，现有基线与 e2e 全不动 |
| `meta.veil` 已创建（掀幕后） | `meta.veil.cycleStar` | 尤里卡重新变灰、工坊效率回落，重新攒星屑 |

- ⚠️ `emptyMeta()` **不要预先放 `veil` 对象**：`normalizeMeta`（`state.js:731`）是
  `Object.assign(emptyMeta(), parsed)`，预置对象会让「账本是否存在」这个判据对老档失效。
  要么置 `null`，要么退回判 `veil.count >= 1`。
- 建议收口成单一函数（如 `SB.state.starEarnedSeed(meta)`）供 W1/W2 共用，防「UI 用 A、门禁用 B」。
- 掀幕后本周期尚未结算 ⇒ `cycleStar = 0` ⇒ 尤里卡不亮，符合删档重来。

### 4.4 注释同步清单（不改则实现与注释分叉）

| 文件:行 | 现状描述 |
|---|---|
| `state.js:74` | 「freshRun 时 seed 进 s.got.stardust 供超古代科技 eureka 读」 |
| `state.js:228` | 「freshRun 把累计结算发放量 seed 进 got.stardust」 |
| `state.js:289-291` | 「stardust 波次4 起由 meta 存档 seed 进来」（讲 `res`，需核对措辞不误伤） |
| `state.js:550` | 「星屑尤里卡读累计结算发放量」 |
| `prestige.js:296-301` | 结算 ⑥ 星屑段 |
| `redeem.js:156` | 「③ freshRun 把它 seed 进 s.got.stardust，喂…尤里卡」 |
| `workshop.js:126` | 「x = 星屑点累计结算发放数…freshRun 从 meta.stardustEarned seed，跨周目累积」；`:129` 「无封顶…待标定」 |
| `techs.js:1062-1063` | 「freshRun 把 meta.stardustEarned seed 进 s.got.stardust，跨周目累计」 |
| `techs.js:1069` `unlockDesc` | 「x 为星屑点累计数（跨周目累积）」← **面向玩家的文案，需同步** |

`techs.js:1068`、`workshop.js:127-128` 讲「动态值写读数」的机制说明不变。

---

## 5. 帷幕点与飞升树 `VEIL_TREE`

> 本节只是骨架摘要。**完整飞升系统设计见 `docs/VEIL_ASCENSION_SPEC_v0.1.md`**
> （掀幕后的 8 步时序、帷幕点公式、23 节点 / 5 组节点表、循环闭合、账本、UI、验收）；以该稿为准。

- **形状照 `TIDE_TREE`**（`cost` / `n` / `nest` / `apply`），新表 `SB.VEIL_TREE`，渲染复用 `render-pane-meta.js` 的树容器。
- 加成写既有 `s.perk` 键（走 `derivePerksFromMeta`），**不新造第二套乘区**。
- **首层节点**必须是「获取轮回点」「获取星屑」两类，且：
  - 价格 ≤ 首次掀幕必得帷幕点数（**占位待标定**），保证「一开始就能点」；
  - **当局就要获得** ⇒ **不能做成 `TIDE_TREE.give`**（那是「每局开局给一次」，`state.js:265`、`prestige.js:515` ⇒ 买一次每局重复发 = 无限刷）。必须**购买时一次性入账**，以 `veil.perks[id]` 等级作幂等哨兵，`apply` 当场写 `s.perk`。本稿按「掀幕后立刻开始的这一局、当场到账、不隔一次轮回」理解。
- #3 重买：掀幕时 `veil.perks = {}`。首层软着陆每轮都要能重新发币，否则第二重帷幕开局卡死。

---

## 6. ERA11「α」与掀幕落点

| 件 | 落点 | 纪律 |
|---|---|---|
| 纪元 | `techs.js:84` `ERAS` 加第 11 项 name `'α'` | `tech.js:1290` 英文 slug 表只到 10；TapTap zh-CN 走中文字段无碍，将来英文版需补 `alpha` 之类 key |
| 科技 | `TECHS` 尾加 `{id:'beyond_veil', name:'掀起帘幕', era:11, key:true, layer:23, reqs:['unified_field'], cost:447000000}` | 尤里卡 = 本帷幕周期累计星屑 ≥ 1000：`cond:{t:'gathered',r:'stardust',n:1000}`，复用现成 `gathered` 类型（`techs.js:1064`《继承繁星之人》同款），读 `s.got.stardust`（#4 口径：掀幕后 = `veil.cycleStar`）；`condShort` / `condText` 已支持 ⇒ 零新增 cond 类型，但**尤里卡文案需改**（见 §4.4 清单精神） |
| 前置 | `unified_field`（`techs.js:1071`，ERA10 最后科技，44,700,000，`cond:{t:'dysonPct',n:80}`） | 10 × 44,700,000 = **447,000,000**（基础 cost，实付吃折扣）。⚠️ 其戴森 80% 尤里卡**不动**（#9） |
| 市政树 | `civics.js:919` `visibleEra()` 按 `SB.ERAS.length` 循环 ⇒ ERA11 无市政会渲染出空的「第 11 纪元」 | 上限夹到「有市政的最大纪元」= 10 |
| 按钮 | `index.html` 轮回按钮那一行 `.foot`（`#btnBreak` / `#btnCycle` / `#breakHint`）**下方新增一行 `.foot`**，放 `#btnVeil` + `#veilHint`；事件委托走 `src/ui/input.js:773` 同款 `closest()` 分支 | ⚠️ 每帧重画的容器**不许放按钮**——放在 `.foot` 静态行，由 `renderBreakBtn()` 同款函数切 `hidden`（**不是**原稿的 `render-environment.js` 横幅行）。显示条件 = `s.techs.beyond_veil`（学完才出现，已拍）；点开先出**重置预览**确认面板，明写「将得多少帷幕点 / 将失去什么」 |
| 预估文字 | `#breakHint` 右侧同款位置新增 `#veilHint`，显示 `当前掀幕预估：N.NN 飞升点（本周期 X 轮回点 + Y 星屑）` | 点数**实时只读展示**，公式只用周期累计 `cycleTide/cycleStar`；真正结算只在确认掀幕那一刻算一次写入 `veil.points`（防刷三条见下位稿 §3）。`X/Y` 读同一份周期账，与点数同源 |
| 状态 | `emptyMeta()` 加 `veil` 默认 + `normalizeMeta()` 收口 | `state-migrate.js:530` 已动态读 `SB.ERAS.length`，只需把 fallback 常量 10 → 11 |
| 文案 | 先登 `src/locales/zh-CN.js` 再写 UI | 非琐碎 UI 先做 demo 再实装；退休 key 永不复用 |

**触发时机**：学完《掀起帘幕》即可在自然环境点「掀开帷幕」，**不需要等 ERA12**（本期不做 ERA12）。
⚠️ 现在《掀起帘幕》尤里卡 = 本周期累计 1000 星屑，与前置《大统一方程》的戴森 80% 是**两道独立门槛**：玩家仍需先把戴森推到 80% 学完大统一方程，再在本帷幕周期里累计满 1000 星屑，才学得会《掀起帘幕》、才看得见掀幕按钮。

---

## 7. 必拆的门（漏一处就是「玩家永远见不到」）

1. **ERA10 零 key → 老档瞬跳（硬阻塞）**：`tech.js:1252 keysOf(10)` 返回空 ⇒ `eraProgress(10).done = 0>=0 = 真`（`:1260`）。`ERAS.length` 10→11 后下一拍 `pump → advanceEra`（`:1318`）会把**所有停在 ERA10 的存档**直接推进 ERA11，戴森没建完也能看见帷幕科技（`techs.js:107 / :968` 记的是同一次事故）。
   **修法**：给表尾 `unified_field` 加 `key:true`（它本就是 ERA10 最后科技），引擎一行不改；ERA11 那条也设 `key:true`，学完 `p.era >= E.length` 自然停，不需要 ERA12。
2. **AI bot 在 `dysonDone` 后收手**：`ai-player.js:390`、`ai-strategy.js:917,926` ⇒ bot 永远学不到《掀起帘幕》。要在**调用方**拆，与当年 9 处 `!broken` 门禁同构（只删首行早退是零效果）。
   ⚠️ 尤里卡改成星屑后新增一处分叉：`ai-strategy.js:442 deferredCycleStardustTech` 已会判 `gathered/stardust` 未达标就跳过该科技——bot 在周期星屑 <1000 时会主动延期《掀起帘幕》，这是期望行为（与真人门槛一致），不要误当 bug 拆掉。
3. **停在 `dysonDone` 的老档要能自然进 ERA11**：`revealEra` 补揭示 + 允许补学 `unified_field`；`state-migrate.js:536` 每次读档清 `out.eureka`，靠 `metOf` 三档兜底（`tech.js:859` 已有）。
4. **`dysonDone` 的 9 类消费方一字不动**（17 个 goal、`voidEnd`/`dysonEnd`、4 条榜、四段分镜、bot）⇒ 加时赛不计挑战成绩。
5. **《飞升虚境》降格基本零代码**：它现在本来就是乱码假结局（`render.js:930-956`，面板明写「这一局到此为止…也可以留在这里看着它继续」）。`voidEnd` 成就、`void` 榜（`config.js:352`）、底栏 `renderBreakBtn` 的 `'void'` 态（`render.js:1641`）**全留**，只补一句「帷幕之后才是真的」的指向。

---

## 8. 已知例外与不做清单

- ⚠️ **`meta.cycle` 是唯一「保留但还在发力」的履历字段**：`loop5` 一类按轮回次数给加成仍在（cycle=20 ⇒ +100% 工坊）。要真·零加成须把 5 处读点从 `meta.cycle` 切到「本帷幕周期轮回数」，改动面明显更大。**默认取不动**，仅把 §4 那条切干净。
- **本期不做**：ERA12 天灾三型、自称天灾线、局内三选一飞升路径、难度强度档、双天灾同时降临、第四条飞升路径、新排行榜（需平台建 ID，属发布动作）。
- **不做新资源**：新资源要接 `capOf`/`costOf`/`canAfford`/`pay`/`rates`/`tick`/UI/存档 八处，成本最高收益最低；优先「新状态 + 新表行」。
- **不做实时战斗 / 新引擎**。
- ⚠️ **顺序铁律**：单局总时长 / 8–14h 窗**最后统一算**，中途不为它调常数；本稿所有倍率、系数、价格一律**占位待用户标定**，不跑 `sim/balance.mjs`（已删，任何形式都不许跑）。

---

## 9. 分期与验收（不估工期）

| 期 | 交付 | 验收判据 |
|---|---|---|
| **P0 骨架** | `ERAS` 到 11 + `unified_field` 补 key、ERA10 key 修复、`veil` 状态与迁移、自然环境按钮 + 重置预览 demo、原子事务、4 处拆门 | 老档停在 ERA10 不瞬跳；掀幕后能 `startRun`；残差恒等式不变；e2e 按**失败清单 comm 对比**零新增（连跑 3 次，0xC0000005 崩溃遍不作结论） |
| **P1 内容** | 《掀起帘幕》科技 + `VEIL_TREE` 首层双节点 + 一次性入账 + 首层软着陆 | 掀幕 → 当场买到 tide/stardust perk → 当局到账；第二重帷幕可再买；本周期星屑 <1000 时《掀起帘幕》保持不可学、按钮不出现 |
| **P2 口径** | §4 两处写入 + 7 处注释 + 9 处文案同步 | 掀幕前老档尤里卡/工坊效率不变；掀幕后 `s.got.stardust` 归零、尤里卡变灰；`state-migrate` 读档不回弹 |
| **P3 验证** | 数值标定（用户拍板后）、e2e 新 suite、版本四件套 | 3 次连跑分布一致；`?v` bump 与 `_repack.py` 版本断言 |

---

## 10. 待拍

| # | 事项 | 建议 |
|---|---|---|
| 1 | §4.3「`veil` 账本掀幕时才创建、之前照旧」是否确认 | 确认；否则仅更新版本就会掉收益 |
| 2 | `meta.cycle` 加成例外 | 不动（§8） |
| 3 | 科技《掀起帘幕》与二层「帷幕之后」不再同名、ERA11 纪元名「α」 | 2026-11-16 已拍，仅登记 |
| 4 | 帷幕点公式与 `VEIL_TREE` 全部节点价格 / 效果 | **等标定，本稿只定结构** |
| 5 | 是否开始实装 | 等用户当次明说；本稿纯设计 |

---

> ⚠️ 本稿只定**结构与落点**：所有倍率、成本档、系数、时长一律占位，标定权在用户。
