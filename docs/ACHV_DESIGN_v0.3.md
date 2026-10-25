# 天壳 · 成就系统扩充设计 v0.3

> 状态：**已实装（2026-10-24，后端钩子 + 游戏内成就墙；未 commit / 未重封包 / 未发布）**。
> §八 十条待拍已于 2026-10-24 全部落定（见文首落定表）；
> 名称/简介文案另出《assets/achievements/成就文案_v0.1.md》，待用户评审。
> v0.3 变更：① §八 十条全关（平台可追加 / 老档要补偿 / 只算轮回 / 遗珍 10+25 双条 /
> capstone 可行性已验证 / 计入范围解释 / 图标用户自理 / 可选加强进本批 / 文案先写待审）；
> ② 计数勘误：科技 83、市政 69（v0.2 的 86/80 为错数，见附录 B）；③「第十周目」
> 改「十次轮回」并换计数器；④ 新增「遗珍全集」「半程星环」两条；⑤ 总量 57 新 + 5 旧 = 62。
>
> **实装记录（2026-10-24）**：代码落点 = achv.js（重写：62 DEFS + unlockOnce/syncMeta/
> sweep/checkTechAll/checkCivicAll/progressOf）、config.js（ACHV 57 占位）、state.js
> （meta.achv/achievements/rebirths/buildingLvlTotal + s.buildingLvlRun + normalizeMeta 守卫）、
> game.js（startRun 合并 / resumeRun seed 三保险 / religion / boot syncMeta）、habitat.js
> （build 唯一漏斗记账 + 实时解锁）、prestige.js（rebirths++）、shell.js（shellBreak /
> starComplete）、economy-tick.js（dysonEnd/voidEnd/halfDyson）、tech.js·civics.js
> （双 capstone）、render-pane-challenges.js + input.js + 50-module-polish.css（成就墙）。
> 验证：sim/_smoke_achv.mjs 83✓/0✗；e2e 四连跑 1198✓/102✗ 与基线失败名集合逐条一致。
> §四·1 的 seed 片段已按实装加固为三保险版（见该节 ⚠️ 注）。**文案仍待用户评审**——
> DEFS_BASE 的 name/desc 是提议值，评审后如需改动只改 achv.js 一处。

**§八 十条落定表（2026-10-24 用户批复）**

| # | 事项 | 决定 |
|---|---|---|
| 1 | 平台能否后台追加 | **可以**，随版本提交即可，无流程障碍 |
| 2 | 轻车熟路口径 | 按本稿：逐建筑、跨周目累计 ≥100 |
| 3 | 老档补偿 | **要**——按最后一次存档的 s.lvl 给每座建筑兜底一笔（§四·1） |
| 4 | 十次轮回口径 | **只算轮回**（合格 doBreak），神学之前的重置不算（§四·6） |
| 5 | 遗珍刻度 | **10 和 25 各一条**（旧日遗珍 + 遗珍全集） |
| 6 | capstone 可行性 | **已读码验证**：可达但非纯新档，需 15+ 周目与遗产门槛（§四·5） |
| 7 | 市政大成计入范围 | CIVICS 全表 69 项；两条「特殊 id」不在 CIVICS 表（§五） |
| 8 | 图标路线 | **用户自理**（安排 GPT 生成），文案稿已附画面建议 |
| 9 | 可选加强 | **进本批**：半程星环 + 遗珍全集 + 游戏内成就墙（墙先 demo） |
| 10 | 名称与简介 | **文案先写**（成就文案_v0.1.md），用户评审后再进后台 |

---

## 一、背景与平台约束

1. 成就是 **TapTap 平台成就**（后台手建 → ID 回填 `CFG.ACHV` → 代码解锁），不是本地成就。
   MCP 无建成就工具，必须用户在开发者后台逐条创建。
2. 已发布的 5 条**锁死不可改不可删**；本批为**新增**。后台可直接追加（用户已确认，事项 1）。
3. 平台要求 ≥5 条普通成就才能发布；扩到 **62 条**（5 旧 + 57 新）不违反。
4. 平台规格：名称 ≤40 字、简介 ≤200 字、ID ≤40 位英文数字；图标 512×512 PNG
   （平台自动生成灰度未解锁版）。
5. 边界纪律不变（achv.js 头部）：**无 tap 或 ID 未回填 ⇒ 不调用、不"假装成功"**；
   `meta.achievements` 只在 unlock 真的发出时才记账，老玩家宽限补发的逻辑继续保持。
   ⇒ 代码钩子可以先于后台建成就落地（全部占位 `'0'`），互不阻塞。

---

## 二、现有 5 条盘点（不重设计，仅列缺口）

| key | 名称 | 口径 |
|---|---|---|
| cold / small | 寒流禁火 / 小国寡民 | 单次挑战通关 |
| science / abyss | 忽视科文 / 深渊重压 | 三档挑战最高档 |
| firstRebirth | 首次轮回 | 首次合格破壳结算（qualified doBreak） |

**缺口**：`speedrun`（逐光竞速，16h/8h/4h 三档限时）是唯一**没有成就**的挑战 —— 本批补上，
且它是**纯配置增量**（现有 `onBreak` 的通用挑战分支已覆盖任意挑战 id，零新钩子）。

---

## 三、新成就总表（57 条）

| # | key | 名称 | 成就 ID | 图标 | 触发条件 | 钩子落点 | 类型 |
|---|---|---|---|---|---|---|---|
| 1–45 | `bld_<建筑id>` | `<建筑名>：轻车熟路` | `SHELLBREAK_BLD_<ID>` | achv-bld-<id>.png | 该建筑**跨周目累计等级 ≥ 100** | habitat.js:241 + game.js:156 + resumeRun:178 | 累计型 ×45 |
| 46 | shellBreak | 首次破壳 | `SHELLBREAK_SHELL_BREAK` | achv-shell-break.png | 第一次真正凿穿天壳 | shell.js:153 | 事件型 |
| 47 | dysonEnd | 控星之人 | `SHELLBREAK_DYSON_END` | achv-dyson-end.png | 竣工戴森球且**未**掌握《飞升虚境》 | economy-tick.js:288 | 事件型 |
| 48 | voidEnd | 虚境飞升 | `SHELLBREAK_VOID_END` | achv-void-end.png | 已掌握《飞升虚境》的前提下竣工戴森球（乱码结局） | 同上，ascend_void 分支 | 事件型 |
| 49 | speedrun | 逐光竞速 | `SHELLBREAK_SPEEDRUN` | achv-speedrun.png | 4 小时档（最高档）限时通关 | **无新钩子**，onBreak 通用分支 | 挑战型 |
| 50 | starComplete | 太空时代 | `SHELLBREAK_STAR_COMPLETE` | achv-star-complete.png | 破壳后星空槽填满 | shell.js:184 | 事件型 |
| 51 | religion | 立教 | `SHELLBREAK_RELIGION` | achv-religion.png | 第一次为文明命名（religionSeen 首真） | game.js:526 | 事件型 |
| 52 | rebirth10 | 十次轮回 | `SHELLBREAK_REBIRTH_10` | achv-rebirth-10.png | **合格轮回**累计 10 次（新计数器，软重置不计） | prestige.js:188 同侧 | 累计型 |
| 53 | relic10 | 旧日遗珍 | `SHELLBREAK_RELIC_10` | achv-relic-10.png | 独特奇观跨周目入藏满 10 座 | prestige.js:204 | 累计型 |
| 54 | relic25 | 遗珍全集 | `SHELLBREAK_RELIC_25` | achv-relic-25.png | 独特奇观跨周目入藏满 25 座（全表） | 同上 | 累计型 |
| 55 | techAll | 科技大成 | `SHELLBREAK_TECH_ALL` | achv-tech-all.png | **单周目**掌握全部科技（83/83） | tech.js:785 | 事件型 |
| 56 | civicAll | 市政大成 | `SHELLBREAK_CIVIC_ALL` | achv-civic-all.png | **单周目**完成全部市政（69/69） | civics.js:847 | 事件型 |
| 57 | halfDyson | 半程星环 | `SHELLBREAK_HALF_DYSON` | achv-half-dyson.png | 戴森球进度 ≥50%（dysonPct ≥ 0.5） | economy-tick.js:288 同块 | 事件型 |

> 类型说明：**事件型** = 本周目事件，跨周目可复现，靠 `meta.achievements` 去重只发一次；
> **累计型** = meta 级条件恒持久化，每次复核都能补发（ID 未回填时自愈）。
> 45 座建筑的完整 id → 名称 → key 对照见**附录 A**；全部名称/简介见《成就文案_v0.1.md》。

---

## 四、重点详设

### 1. 「<建筑名>：轻车熟路」系列（45 条，bld_\*）

**口径**：每座建筑一条独立成就（45 条 = `SB.BUILDINGS` 全表，附录 A）。
达成条件 = **该建筑跨周目累计购买的等级总数 ≥ 100**。
- 保留用户原口径的两个要素——阈值 **100**、**周目合计（跨周目累计）**；
  只把「所有建筑求和成一条」拆成「逐建筑各一条」。
- 城堡不是建筑（`upg_castle` 是议事厅买下工坊升级后的**改名**，e2e:743 断言守着
  「建筑表无 id==='castle'」）⇒ 无此条。九个**分区**（礁栖核心/生息区/…/破界区）
  也不是建筑 ⇒ 无此条。
- ⚠️ **为什么必须是「跨周目累计」而不是「单周目 100 级」**：建筑造价按 ratio 指数增长
  （工坊 ratio 1.15，高纪元建筑普遍 1.3~1.5），单周目 100 级的末级价是首级价的
  1.15⁹⁹≈10⁶ ~ 1.5⁹⁹≈4×10¹⁷ 倍，物理上不可达；且**虚境祭坛 maxLvl=3**（全仓第一条
  等级上限，habitat.js 拦在 UI 与自动建造之前）⇒ 单周目口径下它永远不可能达成。
  跨周目累计对 45 座一律可达（虚境祭坛最慢：约 34 个周目 × 3 级）。

**记账模型（增量记账）**：

- 新增周目内计数器 `s.buildingLvlRun`（**按建筑 id 的表**，`{}` 起），唯一写入点 =
  `habitat.build` 的 `s.lvl[id]++`（habitat.js:241）。该点是全库**唯一真实购买漏斗**：
  手动建造（input.js:188）、区域自动建造泵（habitat.js:324 autoTick）、AI bot
  （ai-strategy.js:2214）全部走它；ai-strategy.js:375 的 `s.lvl[id]=old+1` 是试算后回滚的
  探针，不计。
- 新增跨周目账本 `meta.buildingLvlTotal`（**按建筑 id 的表**），在 `startRun`
  （game.js:153，周目切换唯一入口：nextCycle / resetRun / 挑战开始三条路都过它）
  离开本周目前合并：`for (k in prev.buildingLvlRun) meta.buildingLvlTotal[k] += prev.buildingLvlRun[k]`。
- 解锁判定 `(meta.buildingLvlTotal[id]||0) + (s.buildingLvlRun[id]||0) >= 100`：
  - 实时点：build 内（第 100 级买下的当周目即刻弹成就，不等结算）；
  - 兜底点：doBreak 的 meta 清扫（见 §七），防 ID 未回填时漏账。
- 持久化：计数器搭现有 5 秒 saveRun 节流落盘（game.js:874），**不新增任何每购买一次的 meta 写盘**。

**老档补偿（事项 3，用户拍「要」）**：

- 落点 = `resumeRun`（game.js:178）。它是 boot 续档的**唯一入口**（game.js:1240；
  导入档 / 恢复原始档都会 reload 页面再过 boot ⇒ 同一条路全覆盖）。
- 逻辑（幂等，只 seed 一次）：
  ```js
  if (S && S.lvl && meta && !meta.bldLvlSeeded &&
      (!S.buildingLvlRun || Object.keys(S.buildingLvlRun).length === 0)) {
    var _t = {};
    for (var _bid in S.lvl) if (S.lvl[_bid] > 0) _t[_bid] = S.lvl[_bid];
    if (Object.keys(_t).length) meta.buildingLvlTotal = _t;   // 有货才覆盖，空表不动已有账本
    meta.bldLvlSeeded = true;
    SB.state.saveMeta(meta);
  }
  ```
- ⚠️ v0.3→实装加固两道闸（2026-10-24 实装时补，防两个数据事故）：
  ① `buildingLvlRun` 为空才 seed——新代码跑过的存档该表非空（§四·1 唯一漏斗在记增量），
     非空说明等级已由/将由 startRun 合并计入，再按 lvl 兜底会**双计**；
  ② `_t` 非空才覆盖——新玩家第 2+ 周目续档时 lvl 全 0，无条件覆盖会把上周目
     已合并进账本的等级**抹成 0**（数据丢失）。
  两道闸与 `bldLvlSeeded` 旗合为三保险；旗随 meta 持久化，刷新不重复 seed。
- 语义：按**最后一次存档的当前周目等级**给每座建筑兜底一笔；此前周目的等级早已转化为
  轮回点与旧日遗产，不追溯（与用户确认的口径一致）。wipeSave 清 meta ⇒ 标记自然消失，
  新档从 0 起算。
- 新档无感：freshRun 的 s.lvl 全 0 ⇒ seed 出空表。

### 2. 首次破壳（shellBreak）

- 判据 = `shell.onShellZero`（shell.js:153）—— 壳真正归 0 的**唯一事件**（基础削壳卡 25%，
  最后一段只能靠天穹钻机凿穿）。
- 与 **firstRebirth（首次轮回）的分界**：firstRebirth 的口径是「首次合格轮回结算」
  （qualified doBreak），资格玩家**不破壳直接轮回**也能拿到；「首次破壳」是物理凿穿，
  且破壳后选「留在本局」不发轮回点也照发成就。两条互不覆盖，都值得存在。
- 一次性（meta.achievements 去重）；离线补算期同样置位（unlock 不是 UI，不受 deferBreakUI 影响）。

### 3. 控星之人（dysonEnd）

- 判据：`economy-tick.js:288` `s.dysonDone = true` 且**未**掌握《飞升虚境》
  （`s.civics.ascend_void` 为假）⇒ 普通竣工弹窗（showDysonComplete）那条线。
- key 保留 `dysonEnd`（描述事件，内部用）；展示名「控星之人」。

### 4. 虚境飞升（voidEnd）

- 判据：同一点位，`s.dysonDone && s.civics.ascend_void` ⇒ 乱码结局弹窗（showAscendVoid）。
- 单周目内两结局互斥（现有设计）；**同一玩家可以先后拿两条**：一个周目不学《飞升虚境》
  走竣工线，下一周目学了走飞升线。这正是两条成就并存的意义。
- 判据读 `s.civics`（已掌握市政），不读 `s.cards`（政策卡是临时的）—— 与弹窗分流同口径。

### 5. 科技大成（techAll）+ 市政大成（civicAll）—— 双 capstone（事项 6，已读码验证）

**触发点** = 完成 funnel 置位处：`tech.js:785` `s.techs[id] = true` / `civics.js:847`
`s.civics[id] = 1`。完成后数一遍全表（83/69 项 O(n)，只在完成事件发生，不进 tick），
相等即解锁 —— 即时反馈，且不依赖走哪条退出口径。

**可行性结论（2026-10-24 读码核实，非估算）**：

两条「全清」路线的真正门槛不在资源，而在**跨周目硬门**——科技/市政的尤里卡（鼓舞）
条件不达成时，`canStudy` 的 `metOf` 门（tech.js:737）与市政揭示门
（civics.js:787 `s.civics[id] || boostMet(s,c)`）会**永久拒绝研究**：

| 表 | 条目 | 跨周目条件 | 位置 |
|---|---|---|---|
| 科技 | 超古代科技 ancient | 累计星屑 ≥5 | techs.js:772 |
| 科技 | 黑历史蓝图 blackhistory | **轮回数 ≥15**（meta.cycle） | techs.js:917 |
| 科技 | 继承繁星之人 heir_of_stars | 累计星屑 ≥70 | techs.js:1000 |
| 市政 | 考古学 | 轮回数 ≥3 | civics-data.js:335 |
| 市政 | 文明构造 | 轮回数 ≥7 | civics-data.js:344 |
| 市政 | 超古代市政 | 累计星屑 ≥5 | civics-data.js:385 |
| 市政 | 先民遗产 | 轮回数 ≥10 | civics-data.js:401 |
| 市政 | 信仰回响 | **旧日信仰 ≥50,000** | civics-data.js:435 |
| 市政 | 星间遗迹 | 累计星屑 ≥30 | civics-data.js:463 |
| 市政 | 神们自己 | 轮回数 ≥15 | civics-data.js:494 |

⇒ **techAll 需 cycle ≥15 且累计星屑 ≥70；civicAll 需 cycle ≥15、旧日信仰 ≥5 万、
累计星屑 ≥30。** 其余 cond（built/zoneLvl/cap/civic/dysonPct/sunSails/lvlSum/challenge/
geekEnceladus 等）都是单周目量。

- 纯新档第一周目**不可能**全清；第 15 周目及以后、遗产达标的单个周目内全清**可达**
  （其余都是单周目资源/时间问题，放置游戏拉长线必然满足）。
- 结论：**capstone 语义成立（终局认证），阈值不改**。这正是「大成」二字的含金量——
  它认证的是「遗产攒够之后的单周目执行力」，而不是肝度。
- ⚠️ 口径提示：上表的「轮回数」读 `meta.cycle`，**含软重置**（现游戏语义，科技/市政
  cond 都靠它）；本批「十次轮回」成就另立 qualified 计数器（§四·6），两者不是一回事，
  文案与代码都不要混。
- e2e 断言：钉「差一项不解锁、齐项才解锁」；探针直接置 cond 满足态（不必真跑 15 个周目）。

### 6. 十次轮回（rebirth10，v0.3 更名 + 换计数器）

- v0.2 的「第十周目」读 `meta.cycle`（软重置也 +1）。用户拍板（事项 4）：
  **只算轮回，神学之前的重置不算** ⇒ 必须换口径。
- 新增跨周目计数器 `meta.rebirths`（emptyMeta 补 `rebirths: 0`；
  normalizeMeta 的 `Object.assign(emptyMeta(), parsed)` 自动给老档补 0，零迁移代码）。
- 落点 = `prestige.doBreak` 的**合格分支内**（prestige.js:166 的 `!qualified` 提前返回
  之后，与 `meta.shopUnlocked` 置位同侧，约 :188）：
  `meta.rebirths = (meta.rebirths || 0) + 1;`
- 不计数的路径全部天然排除：软重置（resetRun，未建《神学》）、未过资格门的 doBreak
  （:166-182 提前 return）、破壳后「留在本局」（不调 doBreak）。
- `breakSettled` 门（:156）保证一次破壳只结算一次 ⇒ 不会重复 +1。
- 名称从「第十周目」改「**十次轮回**」——口径从「周目数」变「合格轮回数」，名字跟着变；
  如想保留旧名可说，一行文案即可改回。
- ⚠️ **不改 `meta.cycle` 语义**（顶栏周目显示、科技/市政 cond、循环类增益都读它），
  只新增旁路计数器。

### 7. 旧日遗珍（relic10）+ 遗珍全集（relic25）（事项 5：10 和 25 各一条）

- 落点 = `prestige.js:204-208` 入藏循环（`meta.memorialWonders[wid] = true`）之后，
  数 `Object.keys(meta.memorialWonders).length`：≥10 解锁 relic10，≥25 解锁 relic25。
- 25 = 全表（`SB.WONDERS` 25 座，已加载核实）；10 是「认真玩过几个周目」的舒适刻度。
- 两条都是 meta 级累计型，doBreak 兜底清扫天然覆盖。

### 8. 半程星环（halfDyson，事项 9 进本批）

- 判据：`economy.dysonPct(s) >= 0.5`（economy.js:939 单一读数源，min(帆/10000, 节点/1000)，
  双达标取小）。
- 钩子：`economy-tick.js:288` dysonDone 判定**同块**追加 0.5 分支 +
  `s.halfDysonSeen` 周目内旗（防重复判定；解锁去重仍靠 `meta.achievements`）。
- 与「控星之人」同族不同档：半程是「走在半路」，竣工是「走到头」。

### 9. 逐光竞速 / 太空时代 / 立教（沿用 v0.2 论证）

| 成就 | 一句话理由 |
|---|---|
| **逐光竞速**（speedrun） | 补既有缺口：唯一无成就的挑战。**纯配置增量**——onBreak 通用分支已按「最高档」发放，只加 DEFS + ACHV + 后台建 ID。口径与 science/abyss 一致：只认 4 小时档 |
| **太空时代**（starComplete） | 破壳→戴森之间最大的可见里程碑（星空槽从 0 填到 STAR_CAP，shell.js:184 已有置位点与弹窗），钩子与破壳同文件、同模式 |
| **立教**（religion） | 整个轮回系统的门户事件（religionSeen 首真即解锁轮回 + 商店），叙事权重最高；与「最快立教」榜同点位（game.js:526），互不干扰 |

---

## 五、市政大成的计入范围（事项 7 解释）

用户问「什么意思」——这条说的是「69 项市政」的分子口径，v0.2 稿把它写错了，更正如下：

- **计入**：`SB.CIVICS` 表全部 **69** 项（Node 直载核实，v0.2 的「80」是错数）。
- **`upg_ballast_2` 不在 CIVICS 表**——它在 `UPGRADES` 表（26 个工坊升级之一，
  「压舱库扩容 II」），只是《矿物章程》等市政的**鼓舞对象**（boost 指向它），
  它本身不是市政 ⇒ 不计入 civicAll。
- **`card_cycle_terminus` 不在 CIVICS 表**——它在 `POLICIES` 表（62 张政策卡之一，
  「轮回之终末」wild 卡），是《虚境探索》的鼓舞对象 ⇒ 不计入 civicAll。
- **不计入**：政体（GOVS 13 个）、政策卡（POLICIES 62 张）、工坊配方（CRAFTS 15）、
  工坊升级（UPGRADES 26）——它们各有各的表，「全部市政」只数 CIVICS。
- ⇒ civicAll 判定 = `s.civics` 全表置真计数 = 69。

---

## 六、游戏内成就墙（事项 9 进本批，先 demo 后实装）

- 现状：「挑战与成就」页（render-pane-challenges.js）**只渲染挑战**，62 条成就全靠
  平台 toast——玩家在游戏内看不到自己的成就墙。
- 方案（独立 UI 需求，按惯例先 demo 再实装）：该页加一节「成就」，读 `CFG.ACHV`
  （key→ID）+ `meta.achievements`（已解锁记账），分三区展示：旧 5 条 / 通用 12 条 /
  轻车熟路 45 条（后者按 zone 分组折叠，默认只展开已解锁与差一级以内的）。
- ID 未回填的条显示为「???’’（不假装存在）；无 tap 环境不显示平台入口。
- demo 边界：只做静态渲染 demo（HTML 原型或沙箱页），不碰生产 render 文件；
  用户过目后才进实装排期。

---

## 七、系统层改动清单（拍板后实施）

### 代码落点

| 文件 | 改动 |
|---|---|
| `src/achv.js` | ① 新增 `unlockOnce(key)`：meta.achievements 去重 → unlock → 仅发出才记账 + saveMeta（把现有 onBreak 内联去重逻辑收编为通用函数）；② DEFS 加 12 条静态键（shellBreak/dysonEnd/voidEnd/speedrun/starComplete/religion/rebirth10/relic10/relic25/techAll/civicAll/halfDyson）；③ **45 条 `bld_*` 不手写进 DEFS**——改为从 `SB.BUILDINGS` 自动派生（`readyKeys`/`missingKeys`/`onBreak` 遍历时并入），将来新增建筑自动获得成就槽位，ID 未回填则自动跳过；④ onBreak 增补 `sweepMeta(meta)` 兜底：religionSeen / rebirths≥10 / memorialWonders≥10、≥25 / buildingLvlTotal 全表复判 |
| `src/config.js` | `CFG.ACHV` 加 12 条静态键 + 45 条 `bld_*`，全部占位 `'0'`（未回填自动跳过，现有机制） |
| `src/state.js` | `emptyMeta` 加 `rebirths: 0`、`buildingLvlTotal: {}`；`freshRun` 加 `buildingLvlRun: {}`。normalizeMeta 的 Object.assign 自动给老档补键，**零迁移代码** |
| `src/game.js` | ① startRun：合并 `prev.buildingLvlRun` 进 `meta.buildingLvlTotal`；② resumeRun：老档 seed（§四·1，含 `bldLvlSeeded` 标记）；③ maybeReligionPopup：religion 解锁（onBreak 清扫兜底） |
| `src/habitat.js` | build() 的 `s.lvl[id]++` 后：`s.buildingLvlRun[id]++` + 该建筑累计达 100 实时解锁（`unlockOnce('bld_'+id)`） |
| `src/prestige.js` | ① doBreak 合格分支：`meta.rebirths++`；② 入藏循环后：relic10 / relic25 判定 |
| `src/shell.js` | onShellZero：shellBreak；tickStar 满槽：starComplete |
| `src/economy-tick.js` | dysonDone 块：按 `s.civics.ascend_void` 分流解锁 voidEnd / dysonEnd；同块追加 halfDyson（dysonPct≥0.5 + seen 旗） |
| `src/tech.js` | study 完成置位（:785）后：全表计数 = 83 ⇒ 解锁 techAll |
| `src/civics.js` | research 完成置位（:847）后：全表计数 = 69 ⇒ 解锁 civicAll |
| `src/ui/render-pane-challenges.js` | 成就墙 UI（§六，demo 过目后） |

### 资产与文档

| 项 | 内容 |
|---|---|
| 图标 | 57 个 512×512 PNG（45 建筑条 + 12 通用条），命名 `achv-bld-<id>.png` / `achv-<key>.png` 进 `assets/achievements/`。**用户自理（安排 GPT 生成）**——《成就文案_v0.1.md》§五已备好每条提示词；本会话不调用 ImageGen（按约定需用户当次明说 + 成本确认） |
| `assets/achievements/成就文案_v0.1.md` | **本批文案稿**（62 条名称/简介/ID/图标画面建议），待用户评审 |
| `assets/achievements/填报清单.md` | 文案评审通过后升版为 62 条版（后台创建表 + 回填代码块）；§三「ID 已锁定预填」改为「新 ID 为提议值，后台建成后回填」 |
| e2e 断言 | 每条新钩子补探针：`?achvtest` 模拟解锁 + `meta.achievements` 落盘断言；bld_\* 钉「累计合并只算一次」（startRun 二连调不翻倍）、「老档 seed 只 seed 一次」（连开两档不翻倍）、「试算探针不计入」；rebirths 钉「软重置不加、合格轮回 +1」；techAll/civicAll 钉「差一项不解锁、齐项才解锁」。回归纪律不变：连跑 3 次看分布 |
| 发版 | 若随版本发布：按四步走（CFG.VERSION / CHANGELOG 头插 / index.html `?v=` bump / `_repack.py`）—— **发布动作等用户当次明说** |

---

## 八、待拍清单（全部关闭）

| # | 事项 | 状态 |
|---|---|---|
| 1 | 平台追加流程 | ✅ 可后台追加 |
| 2 | 轻车熟路口径 | ✅ 逐建筑跨周目累计 ≥100 |
| 3 | 老档补偿 | ✅ 要（§四·1 方案） |
| 4 | 十次轮回口径 | ✅ 只算合格轮回（新计数器） |
| 5 | 遗珍刻度 | ✅ 10 + 25 双条 |
| 6 | capstone 可行性 | ✅ 已验证（§四·5 门槛表），阈值不改 |
| 7 | 市政大成计入范围 | ✅ CIVICS 全表 69（§五） |
| 8 | 图标路线 | ✅ 用户自理（GPT） |
| 9 | 可选加强 | ✅ 三条全进本批（墙先 demo） |
| 10 | 名称与简介 | 🔵 文案已写（成就文案_v0.1.md），**待用户评审** |

**剩余门禁**（不在本稿范围）：
1. 文案评审（用户「到时候我再看」）→ 通过后才升版填报清单、后台建成就、回填 ID。
2. 实装授权：代码钩子可先于文案落地（占位 ID 自动跳过），但是否现在动代码待用户明说；
   e2e 连跑 3 次的成本随之发生。
3. 发布节奏：随哪个版本、是否单独发，等用户当次明说。

---

## 九、实现顺序（文案评审与代码钩子可并行，ID 回填前新条全部自动跳过）

1. achv.js `unlockOnce` + DEFS（12 静态 + 45 派生）+ config ACHV 占位 + state 两个新键
2. 老档 seed（resumeRun）+ rebirths 计数器（doBreak）
3. 事件型钩子（shellBreak / 控星之人 / 虚境飞升 / 太空时代 / 科技大成 / 市政大成 / 半程星环）—— 每条独立
4. 累计型（bld_\* 四落点 / 十次轮回 / 旧日遗珍 / 遗珍全集 / 立教）+ speedrun 纯配置
5. 成就墙 demo → 用户过目 → 实装
6. e2e 断言补齐 → 连跑 3 次 → 报告，停在发布前
7. 文案评审通过后：填报清单升版 62 条 → 后台建成就 → 回填 `CFG.ACHV` → 随版本发布

---

## 附录 A · 45 座建筑 → 轻车熟路对照表

> id / 名称以 `config-buildings.js` BUILDINGS 表为准（2026-10-24 Node 直载核实，45/45）。
> key = `bld_<id>`；ID = `SHELLBREAK_BLD_<ID大写>`；名称 = `<建筑名>：轻车熟路`。

| id | 建筑名 | id | 建筑名 |
|---|---|---|---|
| kelp | 深海藻场 | caravanserai | 商队驿站 |
| nest | 礁口巢 | museum | 博物馆 |
| coralhouse | 石屋 | black_monolith | 黑色方碑 |
| siltpit | 砂矿坑 | hotforge | 热锻工厂 |
| hall | 议事厅 | school | 学校 |
| weir | 喷口导流堤 | theater | 歌剧院 |
| warmnest | 深海鱼牧场 | tenement | 廉租社区 |
| kelpstore | 海藻仓 | researchlab | 科研所 |
| ballast | 压舱仓 | satellite | 轨道卫星 |
| lighthouse | 灯塔 | spacestation | 空间站 |
| workshop | 工坊 | fissionplant | 核热厂 |
| furnace | 热泉炉 | stadium | 体育场 |
| library | 潮纹馆 | biomatlab | 生物材料研究所 |
| institute | 研究所 | rheamine | 瑞亚星矿井 |
| square | 广场 | titancloud | 泰坦星气云采集站 |
| temple | 神庙 | robotbay | 机器人充能站 |
| hydroturbine | 热液汽轮机 | mars_workshop | 马尔斯工造中心 |
| hydroshop | 热液工坊 | europa_launch | 欧罗巴冰面发射场 |
| canal | 王国潮道 | solar_ring | 太阳星环 |
| civichall | 公民会堂 | terra_launch | 泰拉星轨道发射场 |
| observatory | 天壳观测站 | enceladus_launch | 恩克拉多斯星轨道发射场 |
| coralfarm | 速生珊瑚林 | void_altar | 虚境祭坛（maxLvl 3，最慢条约 34 周目） |
| bank | 银行 | | |

---

## 附录 B · 计数勘误（v0.2 → v0.3）

v0.2 稿的三个计数错在「用正则扫源码」——注释里的假命中与注释掉的条目都被算了进去。
v0.3 改用 **Node 直载配置表**（`globalThis.SB = {}` 后依次 eval 五个 config 文件读
`SB.TECHS.length` 等），数字以加载结果为准：

| 表 | v0.2 稿 | 实际（直载核实） | 说明 |
|---|---|---|---|
| TECHS | 86 | **83** | capstone 计数随改 |
| CIVICS | 80 | **69** | 「80 含两条特殊 id」作废，两条根本不在 CIVICS 表（§五） |
| GOVS | 13 | 13 | 不计入 civicAll |
| POLICIES | 62 | 62 | 不计入 civicAll |
| WONDERS | 25 | 25 | relic25 = 全表 |
| CRAFTS / UPGRADES | — | 15 / 26 | 不计入 civicAll |
| BUILDINGS | 45 | **45** | 数字对但过程有坑：正则曾把**注释里**的 `{id:'castle'}`（config-buildings.js:608 的说明文字）算成一座建筑得 46。这正是 JUDGMENTS「静态扫雷必须先剥注释」那条——e2e:743 的断言（建筑表无 castle）依然有效，castle 是议事厅升级后的改名，不是建筑 |

⇒ 总量：**57 新 + 5 旧 = 62 条**；图标 57 张。
