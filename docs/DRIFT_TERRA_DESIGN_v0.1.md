# 流浪泰拉（drift_terra）挑战 · 设计稿 v0.1

> 状态：**设计阶段，未落代码**。所有数值均为**提议值**，标定权在用户。
> **挑战模式不核算单局时长**（用户 2026-10-28 拍板）：不改 `ICE_SHELL`、不改戴森球目标、不为时长调整任何常数。
> 一句话：把「戴森球竣工」从终局降级为**里程碑 + 供能站**，真正的结局是**在泰拉地表建起行星发动机阵列，并用热液能把它们充能灌满**。

---

## 0. 现状锚点（逐条读过代码，非记忆）

| 事实 | 位置 |
|---|---|
| 挑战占位定义（rule/reward 全是「待实装」，单档） | `challenges.js:49-51` |
| ⚠️ **破壳即误判通关**：`doBreak` 破壳后调 `resolveRun`，单档分支直接 `c[id]=true` | `prestige.js:204` → `challenges.js:196,208` |
| 严冬计划尤里卡 = 进入挑战即解锁（entered 语义） | `techs.js:942-946`，`tech.js:353` |
| 「戴森球 = 终局」**唯一**判定点（置 `dysonDone` + 弹窗 + 成就 + 榜） | `economy-tick.js:288-320` |
| 热液能 = **flow 模型**，不累积；`s.res.hydro` 是每秒供给快照 | `JUDGMENTS.md` 五点二十，`economy.js:1648-1651` |
| 流分配单一权威 = `hydroAlloc`，消费者只认自己那份 `xxxDraw` | `economy.js:1412`，出口 `:1621-1646` |
| 破壳后 shellbar 已有两态（星空 / 戴森球） | `render.js:304-341` |
| 建筑解锁三轴：`requiredTech` / `requiredCivic` / `unlockScheme`，**无「挑战门」** | `habitat.js:110-133`（`:116` 是「至少一族」判据） |
| 破壳已结算后再点轮回 ⇒ 走 `nextCycle()`（不再 doBreak） | `game.js:1539-1541` |
| `nextCycle()` → `startRun()` 无 options ⇒ `s.challenge = null` | `game.js:156-178`，`state.js:401` |
| 破界区（`break`）已存在且**当前没有任何建筑**（空区自动隐藏） | `config-buildings.js:872` |
| 太阳帆无限、每帆 +0.05 热液能/秒进供给侧 | `config.js:34-36`，`economy.js:1494-1499` |
| 戴森球目标：帆 10000 + 节点 1000（双达标取小） | `config.js:79-82`，`economy.js:956-960` |

**必须先承认的一条**：占位状态下，玩家进入流浪泰拉挑战后**只要凿穿天壳，挑战就显示「已完成」**（`resolveRun` 单档分支），奖励文案是「（待实装）」。实装第一件事是堵这条路，不是加内容。

---

## 1. 定位：这是「结局分歧」，不是「难度挑战」

主线与流浪泰拉共用同一条前中期（破壳 → 太空时代 → 戴森球），分叉点在戴森球竣工：

- **主线**：戴森球竣工 ⇒ `dysonDone` ⇒ 「驭星轮回 / 飞升虚境」终局演出 ⇒ 结束。
- **流浪泰拉**：戴森球竣工 ⇒ `dysonDone` 只作为**里程碑**（供电 + 解锁发动机）⇒ 建行星发动机 ⇒ 热液能充能灌满 ⇒ 「流浪启程」终局演出。

所以挑战的**限制**应该轻，**目标**应该重。它的价值是「另一条结局线」，不是数值惩罚。

### 1.1 唯一负面限制：太阳帆热液能产出减半（用户 2026-10-28 拍）

叙事：泰拉已经离开轨道，离恒星越来越远——戴森球捕到的能量传到母星只剩一半。

```
挑战内：sunSailSupply × 0.5
⇒ 竣工时供给侧 10000 帆 × 0.05 × 0.5 = 250 热液能/秒（主线是 500/s）
```

**落点必须精确，不许接进 `challenges.productionMul`**：
`productionMul` 是全局乘区，同时乘在汽轮机、核热厂、泰坦气云上（`economy.js:1469,1481,1488`）——那会把「恒星能源衰减」误伤成「全族热液能腰斩」，语义完全变了。

正确做法：新开 `SB.challenges.sunSailHydroMul(s)`，**只**在 `economy.js:1496` 乘一次（单一落点）。`rates()` 的 `starSailRate` 直接读 `hydroAlloc` 的返回值，天然同源，不需要第二处。

---

## 2. 目标链条

| # | 阶段 | 达成条件 | 面板读数 | 状态位 |
|---|---|---|---|---|
| 1 | 凿穿天壳 | `s.shell <= 0` | 天壳条（现状） | `shellOpened / breakSettled` |
| 2 | 太空时代 | `s.res.starExplore >= STAR_CAP` | 星空槽（现状） | `starComplete` |
| 3 | 戴森球工程 | `min(帆/10000, 节点/1000) >= 1` | 戴森球条（现状） | `dysonDone` ← **不再终局** |
| 4 | 建设行星发动机 | `s.lvl.terra_engine >= 1`（第 4 阶段门） | 建筑卡 | `lvl.terra_engine` |
| 5 | 热液能充能灌满 | `s.engineCharge >= ENGINE_CHARGE_CAP` | 天壳条第三态 | `s.driftDone` |
| 6 | 流浪启程 | 玩家点确认 | 结局分镜 + 结算面板 | `meta.challenges.completed.drift_terra = true` |

**为什么第 4、5 是两个独立阶段**：发动机等级 = 吸流上限，供给 = 戴森球帆数 × 0.05/s。发动机不够就吃不满供给，充能就慢。于是后半段形成一个持续优化循环：

> 堆帆（提高供给）↔ 堆发动机（提高吸流上限）↔ 充能池上涨

这个循环完全复用现成机制，不需要新增任何产线。

---

## 3. 挑战定义改写

```
kind: '单次挑战'（保留）
name: 流浪泰拉
summary: 泰拉脱离轨道，恒星远去，太阳帆供能只剩一半。戴森球不是终点——你必须在母星地表建起行星发动机，把它们灌满。
rule: 太阳帆热液能产出 -50%；戴森球竣工不触发终局，通关目标改为「建成行星发动机并以热液能充能灌满」。
reward: 永久：星球改造（恩克拉多斯 / 泰拉）耗时减半
tiers: 单档 { label: '完成挑战', cap: null }
```

### 3.1 进入挑战时的行为
- 沿用 `begin()`（`challenges.js:162`）：结算当前周目 + `startRun({challenge:{id:'drift_terra',tier:0}})`。
- 无需额外清档：`freshRun()` 已把 `dysonDone / sunSails / engineCharge` 归 0。

### 3.2 挑战内 dysonDone 的特殊分支（核心改动 ①）
`economy-tick.js:288` 的块内要**新增挑战分支**：

```
if (isDriftChallenge(s)) {
  // 里程碑，不是终局：不上榜终结、不弹终局窗、不置 dysonPopupSeen 的终局语义
  // 弹「戴森球竣工 · 行星发动机解锁」（一次性，用 s.engineUnlockSeen 防重播）
  // 成就 dysonEnd/voidEnd 仍然发放（它确实是戴森球竣工，与结局无关）
  // 排行榜 dyson（最快建立戴森球）照常提交
} else { 原逻辑 }
```

⚠️ 判据：**不要**在挑战里复用 `showDysonComplete`——它有两个出口（立即轮回 / 继续游玩），语义与「流浪泰拉继续」冲突。新写 `showEngineUnlock(s)` 更安全，也更省回归成本。

---

## 4. 新内容

### 4.1 建筑：泰拉行星发动机 `terra_engine`

落在**破界区**（`break`）——该分区已存在、当前空置、空区自动隐藏，等于官方预留位。

| 字段 | 值（提议） | 说明 |
|---|---|---|
| `id` | `terra_engine` | |
| `name` | 泰拉行星发动机 | 1 级 = 1 座，多座叠建 |
| `zone` | `break` | `BUILD_ZONE_OF` 加一行 |
| `ratio` | 1.5 | 与卫星/空间站/发射场同档（多实例建筑） |
| `cost` | `{ tiplate: 2000, thetaMetal: 500, strongProp: 100, rocketEngine: 50 }` | **待标定**；全部是 ERA8-10 现成资源键 |
| `requiredTech` | `['winter']` | 严冬计划（已有科技，`techs.js:942`） |
| `requiredChallenge` | `'drift_terra'` | **新解锁轴**（见 §4.2） |
| `desc` | 「建在泰拉地表的行星发动机。每座每秒最多吸收 100 热液能并灌入推进储备；推进储备充满即启程。」 | |
| `stardustFacility` | **不标** | 避免进入星屑结算的设施等级统计（`prestige.js:229` 口径） |

⚠️ **不标 `stardustFacility`** 的理由：它不产星屑、不占轨道，标了会污染 `facilityLvls` 的读数；且 `costOf` 的 `spaceCostMul` 只对 `zone==='space'` 生效，破界区不吃，无需额外处理。

### 4.2 新解锁轴 `requiredChallenge`（唯一新增的框架能力）

`habitat.js:110 unlocked()` 需要三处联动，否则建筑**恒不可见**（`:116` 那条「三族都没有 = 忘了决定」会把新建筑判死）：

```js
// ① :116 的「至少一族」判据加一项
if (!b.requiredTech && !b.unlockScheme && !b.requiredCivic && !b.requiredChallenge) return false;

// ② 科技/市政墙之后，加挑战墙
if (b.requiredChallenge) {
  var _ca = SB.challenges && SB.challenges.active(s);
  if (!_ca || _ca.id !== b.requiredChallenge) return false;
}

// ③ lockReason（:147 起）加一条可读理由
if (b.requiredChallenge) {
  var _d = SB.challenges && SB.challenges.byId(b.requiredChallenge);
  return '需在进行中的挑战：' + (_d ? _d.name : b.requiredChallenge);
}
```

⚠️ 顺序要求：挑战墙要排在 `techOpensBuild` 之前还是之后？**放在 tech/civic 墙之后**，理由 = 叙事顺序（先学科技，再谈挑战），且 `lockReason` 的报错优先级与 `unlocked()` 的 `false` 顺序必须一一对应，否则「研究完了还是灰的，且理由是错的」。

### 4.3 剧情科技改造（严冬计划）
`techs.js:942` 现在 `eff: {}`、`unlockDesc: '暂时占位（流浪泰拉挑战相关机制随后设计）'`。改为：

- `eff: { unlockBuild: ['terra_engine'] }`（与 `requiredTech` 双写一致，本项目惯例，e2e「建筑解锁来源」守着）
- `unlockDesc: '解锁建筑「泰拉行星发动机」（仅流浪泰拉挑战期间建造）。'`

### 4.4 可选市政《移山计划》（**可砍**，待拍）
给充能速率 +25%，或把「全族总动员」类乘区接进 `engineDraw`。建议**本版不做**——链条已经够长，先验证核心循环。

---

## 5. 充能机制（核心改动 ②）

### 5.1 字段

```
s.engineOn      : boolean   // 手动启动（与 skydrillOn / geekOn 同范式）
s.engineCharge  : number    // 充能池，0..ENGINE_CHARGE_CAP
s.driftDone     : boolean   // 一次性旗
s.engineUnlockSeen : boolean // 竣工提示防重播
```

⚠️ `engineCharge` 是**新开的池子**，绝不允许复用 `s.res.hydro`——那条是 flow，写 `+=` 就破坏 `JUDGMENTS` 五点二十「判据一」。

### 5.2 取流（`economy.js hydroAlloc`）

**优先级：最高**（排在工坊 `shopDraw` 之前）。理由：叙事上全族工业为启程让路；机制上「终局目标必须先拿到流」，否则玩家会陷入「充能永远差一点」的隐性死锁。

```js
// 在 shopDemand 之前插入
var engL = s.engineOn ? Math.max(0, Math.floor(s.lvl.terra_engine || 0)) : 0;
var engNeed = engL * (SB.CFG.ENGINE_HYDRO_PER || 100) * dt;
var engDraw = Math.min(engNeed, supply);
var left = supply - engDraw;          // ← 原来这一行是 supply - shopDraw，改为链式
var shopDraw = Math.min(shopDemand, left);
left -= shopDraw;
```

**把 `engineDraw` 放最前面是一笔划算交易**：`left` 只需在源头减一次，后面 12 处 `left - xxxDraw` 的链式扣减全都不用动（`economy.js:1525-1615`）。若放在中间，要改 12 行，正是本仓「并行 Edit 覆盖」的高危区。

⚠️ 三个必须同步的落点（缺一个就是「面板撒谎 / NaN」家族）：
1. **早退分支补键**（`economy.js:1445-1452`）：`engineDraw / engineRate / engineNeed` 三个键都要补齐，否则 `steelFlow` 的 `s.res.hydro = HF.supplyRate` 会把顶栏写成 NaN。
2. **返回对象**（`:1621-1646`）：同上三键。
3. **`rates()` 的 hydro 求和**（`:1759`）：`var hydro = -(HF.shopDraw + ... + HF.engineDraw)`，否则顶栏热液能读数比实际少一截（`JUDGMENTS` 五点二十四：结算端每一路直扣都要同时进 rates）。

### 5.3 累加与判定（新模块 `src/drift.js`）

```js
function cap() { return SB.CFG.ENGINE_CHARGE_CAP || 0; }
function pct(s) { var c = cap(); return c > 0 ? Math.max(0, Math.min(1, (s.engineCharge || 0) / c)) : 0; }

function tickDrift(s, dt, emit, opts) {
  if (!isDrift(s) || s.driftDone) return 0;
  if (!s.engineOn || !(s.lvl.terra_engine > 0)) return 0;
  var HF = s._hydroFlow || { engineDraw: 0 };
  var gain = HF.engineDraw;              // ⚠️ 已乘 dt，是「本 tick 量」，不要再 ×dt
  if (!(gain > 0)) return 0;
  var before = s.engineCharge || 0;
  s.engineCharge = Math.min(cap(), before + gain);
  var got = s.engineCharge - before;
  if (s.engineCharge >= cap()) { s.engineOn = false; onFull(s, emit, opts); }
  return got;
}
```

⚠️ **量纲判据**：`HF.engineDraw` 已经含 `dt`（`supply` 是乘过 dt 的），这里「不再乘 dt」与「`s.res.hydro = HF.supplyRate` 要 `÷dt`」是同一枚硬币的两面。追加断言：`dt=0.1` 与 `dt=1` 在相同总时长下 `engineCharge` 必须相等（照抄 flow 模型那条 dt 归一断言，反方向）。

调用点：`economy-tick.js` 的 `steelFlow` **之后**、`shell.tickShell` 附近（同一 tick 内 `s._hydroFlow` 已写好在 `economy.js:1703`）。

### 5.4 `onFull`

```
s.driftDone = true
SB.challenges.awardDrift(s, meta)   // 立刻入账，绝不等到玩家点按钮
成就 driftEnd
演出（§7）+ 结算面板
```

---

## 6. 结算路径（核心改动 ③ · 最容易做错的地方）

**现状陷阱**：破壳那一刻 `doBreak` 已经跑完并把 `breakSettled = true`（`prestige.js:156,170`），之后再调 `doBreak` 会 **直接 `return null`**。所以：

> ❌ 不能把「充能满」挂进 `resolveRun` 或 `doBreak`。
> ✅ 必须新开一个即时入账入口。

```js
// challenges.js 新增
function awardDrift(s, meta) {
  if (!s || s.driftDone !== true) return null;
  var d = BY_ID.drift_terra;
  if (!meta.challenges) meta.challenges = emptyProgress();
  if (meta.challenges.completed.drift_terra) return null;   // 幂等
  meta.challenges.completed.drift_terra = true;
  SB.state.saveMeta(meta);
  return { id: 'drift_terra', name: d.name, tier: 0, label: d.tiers[0].label, reward: d.reward };
}
```

### 6.1 堵掉「破壳即通关」（必须做的第一件事）

```js
// challenges.js resolveRun 开头加
if (d && d.id === 'drift_terra') return null;   // 本挑战只认 awardDrift，不认破壳
```

不修这条，玩家凿穿天壳瞬间挑战就显示「已完成」，而充能还没开始。

### 6.2 挑战中断
玩家破壳后点「轮回」⇒ `game.js:1541` `nextCycle()` ⇒ `s.challenge = null` ⇒ 挑战周目结束、`tierDone` 仍为 0（可重来）。
必须在「轮回」确认面板上补一句：**「离开本周目将放弃流浪泰拉挑战进度。」**（仅当 `active(s).id==='drift_terra'` 且 `!s.driftDone`）。否则玩家会以为进度会自动延续。

---

## 7. 结局演出

复用 `render.js` 现成的四段分镜播放器（`_dysonAnimationTimers` 那套 `playDysonStory` 结构，`:535-640`），新增一条 story：

| 段 | 阶段名 | 画面（文案锚点） |
|---|---|---|
| 1 | 点火 | 泰拉地表，行星发动机阵列同时亮起，光柱穿透冰壳 |
| 2 | 推进 | 巨大的等离子焰流把母星推离轨道，冰壳碎裂剥落 |
| 3 | 掠过 | 泰拉掠过木星，戴森球在身后缩成一枚星环 |
| 4 | 启程 | 泰拉成为一颗移动的星，驶向深空 |

出口按钮：**「流浪启程」**（结束本局 ⇒ `nextCycle()`）。不再给「继续游玩」——充能池已满，留局无意义。

---

## 8. 数值（一条已定档，其余待标定）

### 8.1 已定档

| 常量 | 值 | 备注 |
|---|---|---|
| `ENGINE_CHARGE_CAP` | **1,800,000** | 用户 2026-10-28 拍板 |
| 挑战内太阳帆热液能乘区 | **×0.5** | 用户 2026-10-28 拍板（§1.1） |
| 单局时长 | **不核算、不改任何常数** | 用户 2026-10-28 拍板 |

### 8.2 供给侧推导（挑战内）

```
竣工时太阳帆供给 = 10000 帆 × 0.05 × 0.5 = 250 热液能/秒
```

| 附加供给（核热厂 10/级/s、泰坦 6/级/s） | 合计 | 1,800,000 满速耗时 |
|---|---|---|
| 0 | 250/s | 7200s ≈ 2h00m |
| +200/s（约 20 级核热厂） | 450/s | 4000s ≈ 1h07m |
| +400/s（核热+泰坦堆满） | 650/s | 2770s ≈ 0h46m |

⚠️ **这是两条已定决策叠加的必然结果，不是 bug**：原估「60 分钟」是在 500/s 口径下算的，而太阳帆减半把供给侧砍到 250/s，于是满速时间翻倍。如果实际手感太长，**唯一该调的是 `ENGINE_CHARGE_CAP`**——不要去动 0.5 这个帆系数，它是限制轴的叙事核心（恒星远去）。

### 8.3 待标定

| 常量 | 提议值 | 推导 / 关系 |
|---|---|---|
| `ENGINE_HYDRO_PER` | 100 /s/座 | 挑战内供给 250/s ⇒ **3 座吃满**；加核热厂后 4-7 座。这个数与 `CHARGE_CAP` 共同决定「要不要继续建发动机」 |
| 发动机造价 | tiplate 2000 / θ 500 / 强工质 100 / 火箭引擎 50 | 对标 3 座发射场（steel 1000 + θ 200 + 火箭 50）≈ ×2.5 量级 |
| 发动机多座上限 | 无（靠造价自然收敛） | 与卫星/空间站同形 |

### 8.4 奖励（已定）：环境改造时间减半

用户 2026-10-28 拍板：**永久，恩克拉多斯 / 泰拉星球改造耗时 ×0.5**。

落点唯一：`economy.js:1083 starTerraformDuration`，在现有 `(1 - s.perk.starTerraform)` 之后**再乘**一个挑战奖励乘区。

```js
function starTerraformDuration(s, base) {
  var reduction = Math.max(0, Math.min(0.95, (s.perk && s.perk.starTerraform) || 0));
  var m = (SB.challenges && SB.challenges.terraformDurationMul) ? SB.challenges.terraformDurationMul() : 1;
  return Math.max(0, base || 0) * (1 - reduction) * m;
}
// challenges.js
function terraformDurationMul() {
  var meta = SB.game && SB.game.meta ? SB.game.meta() : null;
  return tierDone('drift_terra', meta) ? 0.5 : 1;
}
```

三条判据：
1. **读 `meta`，不读 `s.challenge`**——这是永久奖励（跨周目），不是本局 buff。
2. **相乘不相加**：与 perk 的 `min(0.95)` 是乘法关系。perk 满级时 `(1-0.95) × 0.5 = 0.025` ⇒ 泰拉改造 3600s → 90s。允许叠加、不另设封顶（perk 那侧的 0.95 已经是封顶）。
3. **收益落在`shell.js:122-137` 与 `render-environment.js:223-229` 两处**：前者结算、后者显示，两者都调同一个 `starTerraformDuration` ⇒ 面板===结算天然成立，不需要额外同步。

这个奖励的实际价值：泰拉改造完成才给 `costOffset = 8`（覆盖建筑升级回到 L5 之前），所以「改造快一倍」等于**每周目提前拿到大半折扣**——对 ERA9-10 主线是实打实的提速，比 +30% 全产更贴「环境改造」这条主题线。

---

## 9. UI 落点

| 位置 | 改动 | 文件 |
|---|---|---|
| 挑战卡 | 通关目标文案从硬编码「完成《神学》并凿穿天壳」改为按 `d.id` 分支；`drift_terra` 显示「建成行星发动机并充能灌满」 | `render-pane-challenges.js:54,34,76` |
| 挑战页进行中条 | `drift_terra` 显示三行进度：戴森球 X% / 发动机 N 座 / 充能 Y% | 同上 `:19-34` |
| 天壳条第三态 | `dysonDone && challenge===drift_terra` ⇒ 「行星发动机充能 Y%」（进度条 `f`、标签 `shellLbl` 一并换） | `render.js:304-341` |
| 建筑卡 | 破界区自动出现；卡内加「启动 / 停止」按钮 + 「吸走 X/s（供给 Y/s）」读数 | `render-pane-village.js` + `ui/input.js` |
| 戴森球竣工窗 | 挑战内改弹 `showEngineUnlock`（不进 `showDysonComplete`） | `render.js:403` |
| 结局分镜 | 新增 `drift` story | `render.js:535-640` |

---

## 10. 存档迁移

| 字段 | 处理 |
|---|---|
| `s.engineOn / engineCharge / driftDone / engineUnlockSeen` | `freshRun` 默认值 + `migrateRun` 兜底（缺省 false/0） |
| `meta.challenges.completed.drift_terra` | `state.js:666-670` 已在白名单内，无需改 |
| 老档 `dysonDone === true` 且非挑战 | 不受影响（挑战分支只在 `s.challenge.id === 'drift_terra'` 时进入） |
| 老档 `s.challenge.id === 'drift_terra'`（占位期进入的局） | ⚠️ 可能已被错误标记完成（§6.1）。**建议**迁移时 `completed.drift_terra = false` 重置一次，用 `meta.driftPlaceholderReset` 旗防重复；否则老玩家白拿奖励 |

---

## 11. 已知坑与判据（本仓踩过的，逐条对应）

1. **flow 资源不许 `+=`**（`JUDGMENTS` 五点二十·判据一）⇒ 充能池必须是新字段，不是 `s.res.hydro`。
2. **早退分支缺键 = 面板 NaN**（`economy.js:1441-1444` 注释明写）⇒ `engineDraw/engineRate/engineNeed` 三处补齐。
3. **结算端直扣必须进 rates**（五点二十四）⇒ `:1759` 求和加 `engineDraw`。
4. **分配函数只认自己那份**（五点二十·判据四）⇒ `drift.js` 只读 `HF.engineDraw`，绝不读 `HF.left`。
5. **建筑解锁「至少一族」判据**（`habitat.js:116`）⇒ 加 `requiredChallenge` 必须同步改这一行，否则建筑恒锁。
6. **夹具口径必须与生产一致**（MEMORY 硬纪律）⇒ e2e 造「挑战中」夹具时，`s.challenge` 必须是 `{id:'drift_terra',tier:0,startedAt:...}` 完整三键（生产 `game.js:178` 就写这三个）。
7. **`s.upgrades.<id>` 只有布尔**（同纪律）⇒ 本设计不用 upgrades 存任何数量。
8. **改全局常量要看老存档**（`resumeRun` 无条件用存档）⇒ `ENGINE_*` 是新键，老档走兜底，无迁移问题；但若调 `ENGINE_CHARGE_CAP` 数值，已在充能的存档进度百分比会跳变（可接受，池子语义）。

---

## 12. 决策清单

### 12.1 已拍（2026-10-28）

| # | 问题 | 结论 |
|---|---|---|
| Q1 | 负面限制 | **太阳帆热液能产出 ×0.5**（不是永冻，落点见 §1.1） |
| Q2 | 单局时长 | **挑战模式不核算时长**，不改 `ICE_SHELL`、不改戴森球目标 |
| Q3 | `ENGINE_CHARGE_CAP` | **1,800,000** |
| Q5 | 奖励 | **环境改造时间减半**（恩克拉多斯 / 泰拉改造 ×0.5，永久） |

### 12.2 仍待拍

| # | 问题 | 我的建议 |
|---|---|---|
| Q4 | 发动机造价 + `ENGINE_HYDRO_PER`（现提议 100/s/座 ⇒ 3 座吃满 250/s） | 提议值，可直接落代码再标定 |
| Q6 | 是否要市政《移山计划》（+25% 充能速率） | 本版**不做** |
| Q7 | 严冬计划是否就是发动机的解锁科技？还是另开一项科技 | 用严冬计划（已有、已是占位、语义贴） |
| Q8 | 结局入口「流浪启程」= 直接开新周目（不复用轮回结算，因为破壳时已结算过） | 是 |
| Q9 | 是否新增排行榜「最快流浪启程」+ 成就「流浪者」 | 成就**要**；排行榜后置（要先建榜、属发布动作） |
| Q10 | 老档占位期已误标完成的玩家，是否重置 `drift_terra` 完成态 | **重置**，否则白送 |

---

## 13. 实装顺序（等你拍板后执行）

1. `challenges.js`：`resolveRun` 堵口 + `awardDrift` + `sunSailHydroMul` + `terraformDurationMul` + 定义改写（规则/奖励文案）
2. `config-buildings.js`：`terra_engine` 建筑 + `BUILD_ZONE_OF` 加 `break`
3. `habitat.js`：`requiredChallenge` 三处联动
4. `techs.js`：严冬计划 `eff.unlockBuild` + `unlockDesc`
5. `config.js`：`ENGINE_HYDRO_PER / ENGINE_CHARGE_CAP`
6. `economy.js`：`hydroAlloc` 取流 + 三处同步（早退键 / 返回键 / rates 求和）+ `:1496` 帆乘区 + `:1083` 改造时长乘区
7. `src/drift.js`：新模块 + `economy-tick.js` 调用点
8. `economy-tick.js`：`dysonDone` 挑战分支
9. `render.js` / `render-pane-challenges.js` / `render-pane-village.js` / `ui/input.js`：UI 五处
10. `state.js` / `state-migrate.js`：字段兜底 + 占位误标重置
11. `index.html` 加 `drift.js` 与 `?v=` bump；e2e 补断言；`_repack.py`
