# ERA11/12 市政实装 · 检查结论（v0.1）

> 生成时间：2026-11-24 09:30 GMT+8
> 检查对象：GPT 实装的 ERA11/12 市政内容（10 市政 + 2 政体 + 8 政策卡 + 3 奇观）
> 检查性质：**只读核对**。未改游戏代码、未改表格、未跑 e2e、未发版。
> 结论一句话：**23 条数据全部落地、字段口径正确、效果全部接通、i18n 登记完整；但当前 23 条里只有 10 条玩家真的能拿到**——另外 13 条被 2 条恒假 cond（gn 未开放 / 天灾未实装）锁死，且这两条都是用户明确接受的占位。**无回归结论（e2e 未跑）。**

---

## 一、检查基准（可用于复核）

| 项 | 值 |
|---|---|
| HEAD commit | `00b5a2a01cb89513ed70332dfb302f95cf4672ce` |
| 工作树变更条数 | 107（累积 11-22→11-24 全部未提交改动，非全属本批市政） |
| i18n 清单 | `outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx` |
| 清单 sha256 | `d3ea93a4256aa1e736e8ef1216e66691483f9881d8f1e7803e6bdb8f8e91abd1` |
| 清单行数 | 7687 行（sheet1 文案底表），SB 编号 `SB-007633`～`SB-007710`（78 个） |
| 清单 mtime | 2026-11-23 23:44（与市政实装同批落盘） |

复核命令：
```bash
git rev-parse HEAD
sha256sum outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx
```
⚠️ 若 HEAD 已变，本文 §三 的行号结论需重新验证。

---

## 二、检查方法与范围

| 手段 | 覆盖 | 结果 |
|---|---|---|
| 逐条对照大表 | 23 条（10 市政 / 2 政体 / 8 卡 / 3 奇观） | 见 §三 |
| 语法检查 `node --check` | 16 个改动 js（civics-data/civics/config-content/wonder/tech/techs/state/prestige/veil-effects/war/economy/economy-rates/economy-social/workshop/render-info/veil-hub-ui） | 16/16 通过 |
| 逻辑冒烟（非 e2e） | `tmp/_civic_check.mjs` 5 项 + `tmp/_civic_check2.mjs` | 5/5 通过 |
| **效果字段反向追链** | 8 张政策卡 + 3 座奇观的每个效果字段，逐个追到「谁调用它、乘在哪」 | 全部接通，无死字段（见 §3.3） |
| 表格核对 | 用 sheet-agent 按单元格读 + 直接读 `xl/worksheets/sheet1.xml` | 66 条文案全部在表 |
| 未做 | **e2e 回归**（须用户明说「跑」）、发版、实机 UI 视觉核验 | — |

---

## 三、逐条核对：23 条全部落地（数据层）

> ⚠️ 注意区分两件事：**「数据落地」**（本节，指字段/成本/效果都写对）与 **「玩家可达」**（见 §3.7，指当前代码下能研究到）。前者 23/23，后者只有 10/23。

### 3.1 十条市政（`src/civics-data.js:585-618`）

| # | 市政 | 成本 | 前置 reqs | 鼓舞 boost（代码字面） | 解锁 | 落点 |
|---|---|---|---|---|---|---|
| C1 | 窥见真实 | 1e9 / α / L1 | our_sea | `dysonPct{n:100}` | 卡 虚无主义、加速主义 | :585 |
| C2 | 拓展边界：内 | 1e10 / α / L2 | truth_revealed | `pathOpened{id:'gn'}` | 卡 全民基因调整 | :588 |
| C3 | 拓展边界：外 | 1e10 / α / L2 | truth_revealed | `pathOpened{id:'si'}` | 卡 全义体化协议 | :591 |
| C4 | 银河议会 | 1e10 / α / L2 | truth_revealed | `armadaAscension{n:4}` | 全产×1.2、军力×1.3、2 卡 | :594 |
| C5 | 感官边界 | 1e11 / α / L3 | boundary_inner | `ascensionInvestment{path:'gn',n:6}` | 奇观 突触神经节改造 | :599 |
| C6 | 意识上传 | 1e11 / α / L3 | boundary_outer | `ascensionInvestment{path:'si',n:6}` | 卡 网中之脑 | :602 |
| C7 | 星海卫士 | 1e11 / α / L3 | galactic_council | `cataclysm{n:75}` | 奇观 环带 | :605 |
| C8 | 统合 | 1e12 / Ω / L1 | sensory_boundary + consciousness_upload + star_sea_guardian | `ascensionSpent{n:51}` | 政体 格式塔/潮群、卡 飞向沙盒边界 | :608 |
| C9 | 真智 | 1e13 / Ω / L2 | integration | `ascensionSpent{n:101}` | 奇观 问答机 | :613 |
| C10 | 归一 | 1e14 / Ω / L3 | true_intelligence | `wonders{ids:['reality_aperture']}` | 显示飞升进度（不解锁） | :616 |

**「超过 N」→ `n: N+1` 的口径转换全部正确**：大表「超过 5」→`n:6`、「超过 3」→`n:4`、「超过 50」→`n:51`、「超过 100」→`n:101`。这是本轮做对的关键细节（`condMet` 是 `>=` 语义）。

### 3.2 两个政体（`src/civics-data.js:776-780`）

| 政体 | 代码槽位 | 大表 | 一致 |
|---|---|---|---|
| 格式塔意识 | `{wild:5, prod:1, sci:1, grow:2, military:2}` | 万能5/工造1/科技1/经济2/军事2 | ✅ |
| 潮群意识 | `{wild:5, prod:2, sci:1, grow:2, military:1}` | 万能5/工造2/科技1/经济2/军事1 | ✅ |

**槽位名映射依据**：`civics.js:809` 注释 —— `slotCraft→工造槽(prod) / slotEcon→民生槽(grow) / slotSci→科研槽(sci)`；`civics.js:820-821` 明确记载 **`SLOT_TYPES` 只有 `prod/sci/grow/relig/military/wild`，根本没有 `econ`**，旧的「经济槽」描述"从来无法实现"，已统一改称「民生槽」。大表的「经济槽×2」落成 `grow:2` 是**唯一可行解**，不是错译。

### 3.3 八张政策卡（`src/civics-data.js:1231-1255`）

⚠️ 8 张卡的 `effect: {}` **都是空对象**，效果字段全部写在**卡对象顶层**。已逐一验证读取端读的是顶层（不是 `effect` 子对象），**不是死字段**：

| 卡 | 槽位 | 效果字段（字面） | 读取点 | 与大表一致 |
|---|---|---|---|---|
| 虚无主义 | grow | `sciOutMul:2`、`civicOutMul:2` | `civics.js:428/429` `cardFieldMul` ← `economy-tick.js:478/512/572`、`economy.js:2911` | ✅ +100%/+100% |
| 加速主义 | grow | `resOutMul:{darkmatter:1.5}`、`hydroSupplyMul:2` | `civics.js:587`（逐资源乘）、`:430` `cardHydroMul` ← `economy.js:2133` | ✅ +50%/+100% |
| 全民基因调整 | wild | `jobOutMul:1.2` | `civics.js:479` ← `economy.js:1297/3084`、`economy-social.js:194` | ✅ 全岗位 +20% |
| 全义体化协议 | wild | `resOutMul:{iron/steel/thetaMetal/darkmatter:1.3}` | `civics.js:587` | ✅ 四资源 +30% |
| 网中之脑 | prod | `storeMul:7` | `civics.js:212` MUL_FIELD 白名单 + `:265` ← `economy.js:368` | ✅ 仓储 ×7 |
| 泛银河共同防卫协定 | military | `barracksBonusMul:3` | `war.js:179/233` 直读（链式互斥，非相乘） | ✅ 见下 |
| 泛银河市场 | wild | `bankMerchantMul:8` | `civics.js:224` 白名单 + `:343` ← `economy.js:1156` | ✅ 银行商人 ×8 |
| 飞向沙盒边界 | prod | `craftRatioRecipes:{craft_rocketengine:1, craft_strongprop:1, craft_relativisticengine:1}` | `civics.js:674` `cardCraftRatioRecipes`（**加法轴** `add +=`） | ✅ 三引擎 +100% |

**`barracksBonusMul:3` 的口径已验算正确**：`war.js:184` 公式为
```
soldierOutput = soldiers * baseSoldierRate * (1 + barracksLevel * barracksBonus * (1 + barracksBonusMul))
```
是 `(1 + mul)` 形态 ⇒ `3` = 军营加成 **+300%**（旧卡观舰式 `1.5` = +150%）。若按"×3"理解就会误算成 +200%，实际不是。

**替代/互斥实现**：

| 卡 | 机制 | 字段（写在**旧卡**侧） |
|---|---|---|
| 虚无主义 ⇄ 加速主义 | 永久二选一 | 两张都带 `mutexGroup:'permanent_ascension_doctrine'` + `locked:true` |
| 全民基因调整 | 替代 超凡入圣 | `card_transcendence`：`retiredBy:'boundary_inner'` + `replacedBy:'card_gene_adjustment'` |
| 全义体化协议 | 替代 血肉苦弱 | `card_flesh_weak`：`retiredBy:'boundary_outer'` + `replacedBy:'card_full_cybernetics'` |
| 网中之脑 | 取代 洲际物流 | `card_interlog`：`retiredBy:'consciousness_upload'` + `replacedBy:'card_brain_in_net'` |
| 泛银河市场 | 取代 跨国经济 | `card_transnational`：`retiredBy:'galactic_council'` + `replacedBy:'card_pan_galactic_market'` |
| 飞向沙盒边界 | 替代 星际后勤保障 | `card_interstellar_logi`：`retiredBy:'integration'` + `replacedBy:'card_sandbox_border'` |
| 泛银河共同防卫协定 | 替代 观舰式 | `card_fleet_review`：`retiredBy:'galactic_council'` + `replacedBy:'card_pan_galactic_defense'` |

⚠️ **新卡对象里没有 `retiredBy`/`replacedBy`** —— 这是**正确**的：本项目约定「`retiredBy` 设在**被替代卡**上」（`civics-data.js:437` 注释），方向为 `retiredBy:<触发退役的市政id>` + `replacedBy:<接替的新卡id>`。GPT 六对全部写在了旧卡侧且方向正确（见 P2-2 的唯一例外）。

**互斥已核实为自洽的「永久二选一」**：`mutexGroup` 让另一张被 `cardBlocked` 拒绝，`locked:true` 让自己卸不下 —— 这正是交叉确认报告 Q5 的 (b) 方案。

### 3.4 三座奇观（`src/config-content.js:1050-1060`）

| 奇观 | 成本 | needCivic | 效果落点（已接数值层） |
|---|---|---|---|
| 突触神经节改造 | 冷冻仓 600 + 封闭藻仓 6000 + 藻食 40000 | sensory_boundary | `wonder.js:55-59` `darkmatterBonusPercent` + `synapticDarkMul` → 出口 `economy.js` `darkmatterOutMul` |
| 环带 | 相对论引擎 700 + θ金属薄膜 5000 + 钛金板件 100000 | star_sea_guardian | `wonder.js:62-70` `warMilitaryCostMul` / `invasionSuccessMul` → 接 `war.js` |
| 问答机 | 暗物质 5000 | true_intelligence | `wonder.js:75+` → 下次轮回科技/市政成本 ×0.5 |

### 3.5 三条原断链的实装情况

| 原断链 | 实装 | 结论 |
|---|---|---|
| C4「本次飞升船团累积>3」 | 新增 `meta.armada.cycleCount`：`prestige.js:341` 小轮回 +1、`prestige.js:558` 飞升清零、`prestige.js:927` 读取；`state.js:101` 初始化、`state.js:915-919` 清洗 | ✅ **已接通**（原报告断链已解决） |
| C6「机械飞升投入点>5」 | 新增 `veil-effects.js:63 organInvestmentPoints()`，按器官等级×成本表现折算 | ✅ **已接通** |
| C7「天灾总额 75%」 | 仍是 `tech.js:480 case 'cataclysm': return false`，note 写明「天灾系统暂未开放」 | ⚠️ **恒假**（有意占位，用户已接受，见 §五） |

### 3.6 「飞升点总投入」的落法（原 Q4）

- 新增 `meta.veil.spentPoints`（`veil-effects.js:77 recordSpentPoints`，`state.js` 清洗）
- UI 购买点全部记账（veil-hub-ui 4 处调用）——**这是「实际花掉」而非「历史获得」，语义正确**，不会因为退款/重置而虚高。

### 3.7 可达性量化（当前代码状态下的真实代价）

按 reqs 链 + 鼓舞 cond 推演，**23 条里 10 条可研究、13 条不可达**：

| 类别 | 可得 | 不可得 | 不可得原因 |
|---|---|---|---|
| 市政（10） | C1 窥见真实、C3 拓展边界:外、C4 银河议会、C6 意识上传 = **4** | C2、C5、C7、C8、C9、C10 = **6** | C2/C5 → gn 未开；C7 → 天灾；C8/C9/C10 → 前置断 |
| 政体（2） | **0** | 格式塔、潮群 = **2** | 都需 C8 统合 |
| 政策卡（8） | 虚无主义、加速主义、全义体化协议、网中之脑、泛银河共同防卫协定、泛银河市场 = **6** | 全民基因调整（需 C2）、飞向沙盒边界（需 C8）= **2** | 前置市政不可达 |
| 奇观（3） | **0** | 突触神经节改造（需 C5）、环带（需 C7）、问答机（需 C9）= **3** | 前置市政不可达 |
| **合计** | **10** | **13** | — |

**这张表的意义**：数据层做对了 100%，但**玩家实际能接触到的只有 43%**。两条占位（gn 不开放 + 天灾不做）的连锁代价远大于字面——它们卡掉了整条 α 左支的下半段和整个 Ω 纪（3 市政 + 2 政体 + 2 卡 + 3 奇观）。

**若将来要激活**，按此表只需两处改动即可把 13 条全部救活：
1. `prestige.js:371` 把 `gn` 加入 `OPENABLE_IDS`（配套：基因路径的开放 UI + `geneInvestmentPoints` 分支核对）
2. 实装天灾系统，让 `tech.js:480` 的 `cataclysm` 返回真实值（按 `n:75` 判总额 75%）

---

## 四、问题清单（按优先级）

### P0-1【真断链 · 用户已拍板不修】基因路径 `gn` 未开放

- **证据**：`prestige.js:371 var OPENABLE_IDS = ['si'];` —— 掀幕时玩家只能选机械（si），`gn` 永远进不了 `opened`。
- **后果链**（冒烟实证）：
  - C2 鼓舞 `pathOpened{id:'gn'}` → **恒 false** ⇒ 永不揭示 ⇒ 不可研究
  - C5 鼓舞 `ascensionInvestment{path:'gn'}` → **恒 false**（`geneLv` 守卫要求 gn∈opened）⇒ 不可研究
  - C2/C5 不可达 ⇒ C8 统合 reqs 缺一项 ⇒ **C8/C9/C10 全部不可达**
  - 即：**α 左支 + 整个 Ω 纪（3 条市政 + 2 政体 + 问答机奇观 + 突触神经节奇观）在本局拿不到**
- **反证**：冒烟中手动 `opened.push('gn')` 后 C2 立即转 true，证明只差"开放入口"这一步。
- **状态**：**用户 2026-11-24 明确「不开放」**，作为占位保留。此条不计为缺陷，记为**已知占位**。
- **给接手者的提醒**：若将来开放 gn，需同步确认 C5 的 `ascensionInvestment` 阈值（`n:6`）与 `veil-effects.js` 的 `geneInvestmentPoints` 分支是否对得上。

### P0-2【恒假 · 用户已接受占位】天灾 cond

- **证据**：`tech.js:480 case 'cataclysm': return false;`（`n:75` 完全不参与判定）
- **后果**：C7 星海卫士不可研究 ⇒ 环带奇观拿不到 ⇒ 且 C7 是 C8 的 reqs 之一。
- **状态**：GPT 在 note 写「天灾系统暂未开放」= 有意占位，**用户 2026-11-24 明确「接受」**。
- **文案处理正确**：`tech.js:707` / `:1679` 走 `cataclysm_not_implemented`（「尚未实装：击败天灾」），不会给玩家假承诺。✅

### P2-1【文案口径】归一的进度显示与用户大表不一致

- **代码**：`render-pane-research.js:705-706` 显示 `tr('ui.veil.hub.ascend.progress', {current, total:10}, '第 N/10 次')`
- **大表要求**：归一「研究完成后这里显示数字，还差多少次完成现实透孔仪后飞升的次数就能游戏通关」
- **差异**：代码显示「第 N/10 次」（已飞升几次），大表语义是「还差几次通关」（10 − N）。数值方向相反。
- **判断**：不影响功能（都是只读提示，不解锁），但玩家读起来意思相反。**建议改文案为「还差 {remain} 次飞升」，是否改待用户拍。**

### P2-2【规格×机制冲突】6 对替代里 2 对的卡类型不同类

替代机制 `replaceRetiredAt`（`civics.js:1429`）的注释明确要求：**「数据侧已统一成与前卡同类型」**，原槽塞不进才走兜底。实测 6 对：

| 旧卡（type） | 新卡（type） | 同类 | 结果 |
|---|---|---|---|
| card_flesh_weak (wild) | card_full_cybernetics (wild) | ✅ | 原槽直接接替 |
| card_interlog (prod) | card_brain_in_net (prod) | ✅ | 原槽直接接替 |
| card_interstellar_logi (prod) | card_sandbox_border (prod) | ✅ | 原槽直接接替 |
| card_fleet_review (military) | card_pan_galactic_defense (military) | ✅ | 原槽直接接替 |
| **card_transcendence (sci)** | **card_gene_adjustment (wild)** | ❌ | 见下 |
| **card_transnational (grow)** | **card_pan_galactic_market (wild)** | ❌ | 见下 |

**兜底行为**（`civics.js:1433-1436`）：原槽 `cardFits(np, 'sci')` 返回 false（`cardFits` 要求 `card.type === slotType`，wild 卡只有在 `slotType==='wild'` 时通吃）⇒ 调 `firstFitSlot(s, np, false)` 找**空的原生槽**，wild 卡只能进 `wild` 槽 ⇒
- 有空闲万能槽 → 接替成功，但**装到万能槽而不是腾出来的科技/民生槽**
- 无空闲万能槽 → `return false`，**旧卡退役、新卡不装**（静默留空槽）

**根因判定**：这不是 GPT 写错——大表这两张本来就是「**任意槽**」（=wild），而旧卡是 sci/grow。是**规格（任意槽）与替代机制（要求同类）本身冲突**。
**影响**：不崩、不产生负收益，最坏情况是"替代后新卡没装上"。**建议**：是否接受该行为，或把这两张的 type 改成与旧卡同类（但那会失去"任意槽"特性）——待用户拍。

### P2-3【验证缺口】e2e 未跑

- 按纪律（用户「我让你跑才跑」）本轮**没有跑 e2e**。
- 因此：**没有整体回归结论**。语法 + 冒烟只能证明"没写错"，不能证明"没碰坏别处"。
- 获准运行后应 `node --max-old-space-size=8192 sim/e2e.mjs` **连跑 3 次看分布**，并与跑前失败清单按**断言名** comm 比对（基线 79 条旧红，判"是否引入新红"只看差集）。

### P3【注释过时 · 不影响功能】旧卡加了 `retiredBy` 但原注释仍写「不应有」

`card_transnational`（跨国经济）现在带 `retiredBy:'galactic_council'`，但紧邻的注释仍写着：

> ⚠️ 2026-10-21 纠错：原误带 `retiredBy:'planet_village'`（=自身 civic）⇒ 解锁即退役…**本卡是链尾，不应有 retiredBy**。

**判断**：代码是对的（它现在不再是链尾，被 `card_pan_galactic_market` 替代，`retiredBy` 指向 `galactic_council` 不是自身 civic，不会出生即死）；**过时的是注释**。同类情况：`card_transcendence` 的注释也没跟上它新增的 `retiredBy:'boundary_inner'`。

**风险**：未来维护者按注释判断"不该有 retiredBy"会误删，导致替代链断掉。**建议**同步改写这两条注释（纯注释改动，不影响运行）——待用户拍。

---

## 五、用户已拍板的三项（2026-11-24）

| # | 问题 | 决定 | 代码状态 |
|---|---|---|---|
| 1 | `gn` 基因路径是否开放 | **不开放** | 保持 `OPENABLE_IDS=['si']`，未改 |
| 2 | 天灾 cond 占位是否接受 | **接受** | 保持 `return false`，未改 |
| 3 | i18n 登记是否补 | **已核查：无需补**（见 §六） | 未改表格 |

---

## 六、我方前次误报的更正（重要）

**误报内容**：我在 2026-11-24 08:58 判定「23 条文案在 xlsx 里一条都没登记」，并据此请用户授权补登。

**误报根因**：我用 `zip + grep` 搜 `xl/sharedStrings.xml`。但 GPT 在 11-23 23:44 实装市政时，**同时就把文案登记进了 xlsx**，新行是**内联（inlineStr）写进 `xl/worksheets/sheet1.xml`** 的，不进共享字符串表 ⇒ 搜 sharedStrings 必然全 MISS。

**实际状态（用正确方法复核）**：
- `sheet1.xml` 实含：`civic.data.truth_revealed.name`、`government.data.gestalt_consciousness.name`、`policy.card.nihilism.name`、`content.answer_machine.name`、`tech.condition.progress.ascension_spent`、`civic.policy.mutex.selected` 等
- 66 条文案 + 10 条市政 inspiration + 互斥提示文案，全在 `SB-007633`～`SB-007710`，表 7687 行
- 政策卡 key 表内惯例 = `policy.card.nihilism.name`（去掉 `card_` 前缀），符合表内既有格式

**因此**：GPT 的 i18n 登记**完整**，本轮**无需任何补登动作**。

**教训（已写入项目记忆）**：判定「某个 key 在不在 xlsx」**绝不能只搜 sharedStrings.xml** —— 必须走表格工具按单元格读，或直接读 `xl/worksheets/sheetN.xml`。

---

## 七、总体评价

| 维度 | 结论 |
|---|---|
| 数据结构完整性 | ✅ 23 条全落地，无缺项、无错 id |
| 字段口径正确性 | ✅ 「超过 N」→`n:N+1`、成本、槽位映射、效果倍率全部正确 |
| **政策卡效果链路** | ✅ 8 张卡 8 个字段全部追到读取点（非死字段）；`barracksBonusMul:3` 经公式验算 = +300% 正确 |
| 跨轮回字段接线 | ✅ `armada.cycleCount` / `spentPoints` / `organInvestmentPoints` / `ascendBaseline` 四项新增均接通并清洗 |
| 互斥与锁定 | ✅ 永久二选一自洽，未破坏既有卡槽逻辑 |
| 替代链 | ✅ 6 对全部写在旧卡侧、方向正确；⚠️ 其中 2 对卡类型不同类（P2-2） |
| 奇观效果 | ✅ 三座全部接进数值层（`wonder.js:42-80`），非空壳 |
| 可达性 | ⚠️ **23 条只有 10 条可研究**，13 条被 2 条恒假 cond 锁死（见 §3.7）—— 两条 cond 均为用户明确接受的占位 |
| i18n | ✅ 登记完整（前次「漏登记」为我方误报） |
| 回归 | ❌ e2e 未跑，无回归结论 |

**可以交给下一位接手者的判断**：GPT 这批实装的**代码质量与口径正确性没有问题**，唯一的"死内容"是用户主动选择的占位（gn 不开放 + 天灾不做）。若以后要激活 ERA11/12 的完整内容，**只需两处**：①把 `gn` 加入 `OPENABLE_IDS` 并确认基因路径的开放 UI；②实装天灾系统。

---

## 八、相关文档

- 规格与拍板：`docs/ERA11_12_SPEC_v0.1.md`
- 实装计划：`docs/ERA11_12_IMPL_PLAN_v0.1.md`
- 实装全清单：`docs/ERA11_12_AUDIT_HANDOFF_v0.1.md`
- 大表交叉确认（检查基准）：`docs/ERA11_12_CIVICS_CROSSCHECK_v0.1.md`
- 出图要求：`docs/ERA11_12_ART_PROMPTS_v0.1.md`
