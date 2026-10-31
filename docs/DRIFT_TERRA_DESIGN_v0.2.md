# 流浪泰拉（drift_terra）设计稿 v0.2

> 状态：**设计阶段，未落代码**。所有数值均为**提议值**，标定权在用户。
> 一句话：挑战内戴森球不再是终局，而是**供能站**；终点是在泰拉地表建成 **50 座行星发动机**，并把**星核炉芯池灌满 50M 热液能**。
> v0.1 中「充能池结局」「永冻限制」「破壳 = 终点」三块已作废，本稿以 v0.2 为准。

---

## 0. 本轮更正（必读，这是 v0.1 犯的错）

### 0.1 破壳是 ERA5 的事，不是挑战终点

| 事实 | 证据 |
|---|---|
| 破壳 = **ERA5「破壳纪」末尾** | `techs.js:93` ERAS[4] desc：「凿穿最后 25% 壳厚是这一纪元的全部内容」；ERAS[5] 初生纪 desc：「**壳已破**」 |
| 壳厚归零 → 置 `broken` + 弹结算窗 | `shell.js:161 onShellZero`：`s.shellOpened = true; s.broken = true;` |
| 玩家选「留在本局」→ **立刻清回 false** | `game.js:294 stay()`：`if (S) S.broken = false;` |
| 之后经济继续跑，一路到 ERA6–10 | 戴森球竣工判定 `economy-tick.js:299` 就在这个 tick 内部 |
| 续档时只有「破壳未结算」才保留 broken | `game.js:222`：`if (S.shellOpened && !(S.broken && !S.breakSettled)) S.broken = false;` |

**结论：`s.broken` 是 ERA5 结算窗那几秒的暂停标记，不是永久停摆。** v0.1 把它当成「破壳后经济停摆、发动机建不了」，结论完全反了。

### 0.2 现有 5 个挑战为什么「看起来」绑在破壳上

`prestige.js:254` 是唯一的挑战结算入口：

```js
if (s.shell <= 0 && SB.challenges) { var challengeOutcome = SB.challenges.resolveRun(s, meta); ... }
```

它只在**轮回那一次**（`doBreak`）触发。现有 5 个挑战的 goal 恰好都落在 ERA5 及之前（速通 / 人口上限 / 科研上限 / 寒流 / 深渊），所以这条路径对它们成立 —— **数据巧合，不是机制耦合**。

流浪泰拉的终点在 **ERA10**，比破壳晚 5 个纪元，`s.shell <= 0` 这道门在那时已经过去 5 个纪元，这条路**一次都不会触发**。

### 0.3 因此：挑战必须 goal 化，且达成即结算

这是用户提出「之后的挑战会有很多不同的结束点，不能一直复用破壳」的根因。v0.1 的方案骨架（`evaluate` / `award` 拆分）是对的，错的是把「终点」挂在了破壳上。

---

## 1. 挑战生命周期（唯一正确的时序）

```
挑战开局（s.challenge = {id, tier}）
   │
   ├─ 每 tick：evaluate(s, meta) 判 goal ──→ 达成 ──→ award() 当场入账
   │                                                     └→ 弹结局窗，永久奖励生效
   │                                                     本局继续（仍在 ERA10）
   │
   ├─ ERA5 壳归零 → 结算窗（broken=true）─── 与挑战判定无关
   │        ├→ 轮回 → 本局终止；未达成的挑战 = 放弃（不是失败）
   │        └→ 留局 → broken=false → 继续玩到 ERA10
   │
   └─ 任意时刻破壳/轮回：挑战判定不参与，已有 award 有幂等守卫
```

### 1.1 三条硬规则

1. **挑战判定只认 goal**，不认 `broken`、不认 `s.shell`、不认破壳。`evaluate` 独立于 `economy.tick` 调用。
2. **达成即结算**，不等轮回。原地发永久奖励、弹结局窗，玩家还在 ERA10 继续玩。
3. **破壳轮回 = 本局终止**。未达成的挑战算放弃，不新增「失败」状态。

### 1.2 为什么 `evaluate` 不能挂在 `economy.tick` 里

`economy-tick.js:32` 是 `if (s.broken) return;`。破壳结算窗期间 tick 停摆，若 `evaluate` 挂在里面，那几秒内达成的 goal 会漏判。必须挂在主循环（`game.js` 的帧循环里，与 `tickStar` 同层）。

### 1.3 幂等与弹窗

| 关注点 | 处理 |
|---|---|
| 重复发奖 | `award()` 复用现有 `tierDone` 门（`challenges.js:199`）：`if (tier !== tierDone(d.id, meta)) return null;` |
| 离线补算期间达成 | 与 `dysonPopupPending` 同款：挂 `s.challengePopupPending`，结算窗关闭后再播 |
| 达成后继续玩 | 本局保留，`s.challengeDone = true` 只作 UI 标记；不强制轮回 |

---

## 2. 流浪泰拉目标链

```
进入挑战（ERA1 起）
  │
  ├─ ERA9 严冬计划 ──→ 泰拉地壳密闭水舱巨构（可建，每座 +20 人口 / 吃 100 热液能每秒）
  │
  ├─ ERA10 重核聚变 ──→ 泰拉中央星核炉芯（奇观）
  │                        └→ 炉芯池开始蓄能（吃 hydroAlloc 的 left）
  │                        └→ 抵消冰封期
  │
  ├─ ERA10 超临界致密材料 ──→ 大陆板块加固构件（奇观）→ 砂矿坑/瑞亚星 ×1.3
  │
  ├─ ERA10 流浪泰拉 ──→ 行星发动机（可建，50 座）
  │
  └─ 达成：50 座发动机 + 炉芯池 50M ──→ **挑战完成（当场结算）**
```

### 2.1 goal 声明

```js
{ id: 'drift_terra', ...,
  goal: { t: 'all', of: [
    { t: 'built', b: 'terra_engine', n: 50 },
    { t: 'res',   r: 'coreCharge', n: 50000000 }
  ]},
  goalText: '建成 50 座行星发动机，并把星核炉芯的热液能灌满 50M' }
```

**不写戴森球硬门**（用户拍板）：戴森球不竣工则太阳帆不翻倍、净增极低，50M 自然灌不满，靠流量卡住。**代价是面板必须把「净增 +X/秒」印出来**，否则玩家不知道卡在哪（见 §5.1）。

### 2.2 新增 cond 类型（2 种）

| 类型 | 签名 | 用途 |
|---|---|---|
| `all` | `{t:'all', of:[cond...]}` | 挑战 goal 组合；严冬计划的「挑战 + 泰拉改造完成」也用它 |
| `geekTerra` | `{t:'geekTerra'}` | 读 `s.geek.terraDone`，严冬计划尤里卡用 |

现有 `challenge`（进入挑战，`tech.js` 已实现）与 `built` / `res` / `wonders` 可直接复用。

---

## 3. 内容清单

### 3.1 科技（5 条）

| 字段 | 严冬计划 | 重核聚变 | 微波收敛研究 | 超临界致密材料 | 流浪泰拉 |
|---|---|---|---|---|---|
| id | `winter`（已有） | `reheavfusion` | `mwconverge` | `supercrit` | `drift_tech` |
| 纪元 | 9 光帆纪 | 10 戴森纪 | 9 光帆纪 | 10 戴森纪 | 10 戴森纪 |
| 分支 | `know` 求知 | `live` 生计 | `know` 求知 | `live` 生计 | `live` 生计 |
| layer | 19 | 20 | 19 | 21 | 22 |
| 成本 | 600 万 | 1000 万 | 500 万 | 3000 万 | 5000 万 |
| 前置 | `blackhistory` | `winter` + `nuclear_fusion` | `microwave_heat` | `reheavfusion` | `supercrit` |
| 尤里卡 | `all{challenge drift_terra, geekTerra}` | `built fissionplant 5` | `sunSails 1000` | 水舱累计 3 级 | `wonders[两奇观]` |
| 效果 | 解锁建筑 `terra_vat` | 解锁奇观 `wonder_terra_core` + 升级项 `upg_reheavfusion` | 太阳帆热液能 +30%/级（5 级） | 解锁奇观 `wonder_crustplate` + 升级项 `upg_crustmine` | 解锁建筑 `terra_engine` |
| 范围 | `challengeOnly` | `challengeOnly` | **主线可研究** | `challengeOnly` | `challengeOnly` |

**范围决定**（用户拍板）：5 条全部主线可见，只有微波收敛主线可研究。另 4 条靠 cond / 前置链锁死，玩家看到一条灰着的链、文案会把他引向挑战。

`challengeOnly` 的用途只有一个：`achv.js:255 checkTechAll` 数全表时跳过它们，否则「科技大成」从 83 项永久差 1（**这是现在就存在的 bug**：严冬计划的 cond 主线永远达不成）。

### 3.2 建筑（2 新增 + 1 禁建）

#### 泰拉地壳密闭水舱巨构 `terra_vat`

| 项 | 值 |
|---|---|
| 成本（L1） | `tiplate 3000` + `thetaMetal 500` + `stoneBeam 100000` + `resonantDrill 1000` |
| ratio | **1.5**（造价按等级指数增长） |
| 等级上限 | **无**（用户拍板） |
| 效果 | 人口上限 **+20/级**；**消耗 100 热液能/级/秒**（优先从炉芯池扣，池空再占流量） |
| 需求 | 科技 `winter` |
| 分区 | 工坊区（热液产线家族） |
| desc | 城市规模的小小水族箱。 |

⚠️ 无上限 ⇒ **必须加停用开关** `s.terraVatStop`（与 `s.siltpitStop`、`s.biomatlabStop` 同形），否则玩家建多了会把炉芯池灌满时间无限拉长，且建筑不可拆。

⚠️ ~~断电不降人口上限~~ **2026-10-31 用户改判：断电后上限立刻降、人口缓慢降。**
- `popCap` 读 **`activeTerraVat(s)`（运行座数）**，停用即断电、上限当场少 20/座；
- 人口不瞬间蒸发：tick 的超额段按整数秒离开 `max(1, 超额 × CFG.POP_OVER_LEAVE 0.05)` 人
  （超额 40 人 ⇒ 2 人/秒；超额 2 人 ⇒ 1 人/秒），累加器 `s._overT` 保证 0.1 / 1 / 离线补算三种 dt 同速；
- 减员照旧走 `folk.trimJobsToPop`（只钳 pop 不回收岗位 ⇒ idle 变负，2026-10-27 的复现路径）。
- **仍未覆盖的口径**：池空且剩流不足时（真·断流）只少抢能、床位照给。要连这个也算断电，
  得让 tick 落一个「通电座数」再给 popCap 读，且会引入「人口↓→采石工↓→核热厂断料→更少电」的螺旋，未做。

#### 行星发动机 `terra_engine`

| 项 | 值 |
|---|---|
| 成本 | `thetaMetal 10000` + `strongProp 1000` + `tiplate 7500` + `resonantDrill 4000` |
| ratio | **1**（50 座同价） |
| 等级上限 | 无（靠造价自然收敛） |
| 效果 | 无。**建成 50 座 = 挑战达成条件之一** |
| 需求 | 科技 `drift_tech` |
| 分区 | **破界区 `break`**（`config-buildings.js:873` 已有该区且目前为空） |
| desc | 今晚我就要远航。 |

#### 虚境祭坛 `void_altar`（已有，加禁建）

`config-buildings.js:850` 加 `noChallenge: ['drift_terra']`，`habitat.js:110 unlocked()` 命中即返回 false。

**连带效果（零代码）**：《飞升虚境》的 boost 是 `{t:'built', b:'void_altar', n:3}`（`civics-data.js:552`），祭坛建不了 ⇒ `boostMet` 恒假 ⇒ `civShown['ascend_void']` 永不置位 ⇒ 市政不出现 ⇒ 飞升弹窗（`economy-tick.js:327`）自然不弹。

**不禁市政**（用户拍板）：《虚境探索》仍可研究，只是祭坛不出现。

### 3.3 奇观（2 座）

#### 泰拉中央星核炉芯 `wonder_terra_core`

| 项 | 值 |
|---|---|
| 需求 | 科技 `reheavfusion` |
| 成本 | `thinafilm 300` + `strongProp 1000` + `steel 5000` |
| 效果 1 | 自然环境面板新增「星核炉芯」面板：存储所有剩余热液能，**满值 50M** |
| 效果 2 | **抵消冰封期**：`rollFreeze` 返回 false，并清 `s.frozen` |
| desc | 星核炉芯已点亮。 |

#### 大陆板块加固构件 `wonder_crustplate`

| 项 | 值 |
|---|---|
| 需求 | 科技 `supercrit` |
| 成本 | `thinafilm 600` + `strongProp 2000` + `scaffold 6000` + `steelPart 10000` |
| 效果 | **砂矿坑乘区整条 ×1.3**；**瑞亚星三条产出各 ×1.3**（石梁 / 硬化珊瑚 / 铀） |
| desc | 银灰色的架构体深深扎入大陆板块中，直至无垠的远方…… |

**算法选择**（用户拍板 A）：砂矿坑走「乘整条」`_siltPit × 1.3`，不走「档位 0.20→0.26」。0 级时也白给 ×1.3，但 ERA10 建这件奇观时砂矿坑不可能 0 级。

### 3.4 升级项（2 条，不是工艺）

⚠️ 两条**都没有 out**，是永久效果，必须落 `UPGRADES` 而非 `CRAFT`。

#### 重核聚变 `upg_reheavfusion`

| 项 | 值 |
|---|---|
| 需求 | 科技 `reheavfusion` |
| 成本 | `thetaMetal 200` + `science 10000000` |
| 效果 | 核热厂**每座**额外消耗 **1000 石头/秒**，热液能输出 **+100%** |
| 断料 | **按比例降产**（照生物材料研究所口径，用户拍板） |

「每座 1000 石头」可行性已复核：拉满档采石工约 230 石头/秒·人，15 座需 65 人（占 800 人口 8%）；常规档约 50/人，需 300 人（37%）。有真实取舍，可行。

#### 地壳深层矿井 `upg_crustmine`

| 项 | 值 |
|---|---|
| 需求 | 科技 `supercrit` |
| 成本 | `stoneBeam 40000` + `resonantDrill 3000` + `science 10000000` |
| 效果 | 砂矿坑**伴生**：矿工每人 **+0.05 金属/秒**、**+0.005 θ生物金属/秒** |
| 形态 | `upgradesBuilding: 'siltpit'`（砂矿坑的第三个升级形态） |

**为什么 θ 取 0.005 而不是原方案 0.03**：伴生不吃任何原料，只吃人力。0.03 在 200–400 矿工下等于 27–126 θ/秒，是研究所线的 2.4–3.2 倍且零原料，会直接化解全游戏最硬的瓶颈（戴森球 660 万 θ）。0.005 约等于研究所线的 40–50%。

⚠️ **名字冲突待定**：`upg_deepmine` 已叫「深层矿井」。新条目在同一建筑行上会撞名，见 §8 Q1。

---

## 4. 限制与奖励

### 4.1 挑战内限制（drift_terra）

| # | 限制 | 落点 |
|---|---|---|
| 1 | **寒流季必冰封** | `rollFreeze` 挑战内恒定 true（炉芯建成后恒定 false） |
| 2 | **寒流季时长 ×2**（600 → 1200s） | `seasonLens(s)` 动态表 |
| 3 | **太阳帆热液能 ×0.5** | `economy.js` 的 `starSailHydroMul`，与挑战乘区相乘 |
| 4 | 允许烧暖石（**保留**） | 撤回 v0.1 的「禁用暖石」 |

**为什么撤回禁用暖石**：不烧暖石时 `warmCap = 0`，冻伤按 `FREEZE_CHANCE 0.003 × 人口/秒`，人口会锁在 **8 人**平衡点（生育 0.025/秒 ÷ 0.003），永远建不出炉芯。这不是难度，是死锁。

### 4.2 永久奖励（通关后）

| # | 奖励 | 落点 |
|---|---|---|
| 1 | **暖流季全产 +30%** | `SEASONS[0].mult` 1.50 → 1.95 |
| 2 | **寒流季时长 ×0.5**（600 → 300s） | `seasonLens(s)` 永久系数 |
| 3 | **G.E.E.K 环境改造时长 ×0.5** | `economy.js:1083 starTerraformDuration`，在 `(1 - s.perk.starTerraform)` 之后再乘 0.5（**相乘不相加**），读 `meta` 不读 `s.challenge` |

**叠加规则**（用户拍板）：永久奖励先算（600→300），挑战限制再乘 2（300→600）。即二次通关时寒流季仍是 600s，比首次 1200s 轻松。

### 4.3 全局改动（不限挑战）

**戴森球竣工后太阳帆热液能 ×2** —— `economy.js` 的 `starSailHydroMul` 读 `s.dysonDone`，**本局生效**、主线同样适用（用户原话：「不限定在这个挑战里，整个游戏都要这样」）。

---

## 5. 机制细则

### 5.1 星核炉芯池 `s.res.coreCharge`

**为什么不能复用 `s.res.hydro`**：热液能是纯 flow 模型，`s.res.hydro` 只存每秒供给快照，不累积。炉芯需要一个真正的累积池。

| 项 | 设计 |
|---|---|
| 字段 | `s.res.coreCharge`（照 `s.res.starExplore` 先例：非 RESS 键放进 `s.res`） |
| 上限 | 50,000,000 |
| 灌入 | `left = hydroAlloc` 的返回值（所有消费者吃剩的剩余流），每 tick `+= left × dt` |
| 放出 | 水舱优先从这里扣（§5.2），其余无消耗方 |
| 面板 | 自然环境面板新增炉芯区块，**必须显示「净增 +X/秒」**（用户拍板不写戴森球硬门，这个数就是唯一的导航） |

⚠️ **必须先查 `s.res` 的遍历假设**：若有 `for (var k in s.res)` 去做「资源总量」统计，加非 RESS 键会污染面板。`starExplore` 已经踩过一次，解法照抄。

### 5.2 水舱取能优先级

`hydroAlloc` 是纯函数（只读 `s`，返回结果由 tick 扣减），所以水舱取能不能在函数内直接改池：

```
返回 { vatPoolDraw, vatFlowDraw }
tick 里：s.res.coreCharge -= vatPoolDraw;
          s.res.coreCharge += left;
```

| 规则 | 内容 |
|---|---|
| 优先池 | `vatPoolDraw = min(池量, 需求 × dt)` |
| 池空占流 | 池不够的部分从 `left` 扣（`vatFlowDraw`） |
| ⚠️ dt 同式 | `dt` 必须与 tick 同式；否则 rates 用 `dt=1` 算出池扣量，面板与实际扣减不一致 |
| 净增 | `left − vatPoolDraw` |

### 5.3 重核聚变断料

照生物材料研究所：原料最紧者决定开工率，断供按比例降产，面板与结算同源。买了不亏、也不白给。

### 5.4 地壳深层矿井伴生

伴生的标准形状（`economy-tick.js:120` 深层矿井钛的现成实现）：

```js
if (j.miner > 0 && s.upgrades && s.upgrades.upg_crustmine) {
  addRes(s, 'silt', j.miner * 0.05 * _siltPit * _gather * _tM
    * cold * _gmx * (1 + _T.siltMul) * wonder.mineMul(s) * _adMul * dt);
  addRes(s, 'thetaMetal', j.miner * 0.005 * ...同上乘区...);
}
```

三个要素：**门**（`s.upgrades` 布尔）、**基数**（人数 × 单元值，不按建筑等级）、**乘区**（把矿工原行乘区原样抄一遍，`rates` 侧还要抄第三次）。

### 5.5 加固构件 ×1.3

单一读数口，避免面板与结算分叉：

| 函数 | 内容 |
|---|---|
| `wonderMineMul(s)` | `s.wonders.wonder_crustplate ? 1.3 : 1` |
| `siltPitMul(s)` | `(1 + activeSiltpit(s) × 0.20) × wonderMineMul(s)` |
| `rheaMul(s)` | `wonderMineMul(s)` |

落点：`economy.js` 的 `_siltPit` 一行 + `economy-rates.js` 的 `mineBonus` 一行 + 瑞亚星 tick 三行 + rates 三行。

**为什么不改 `s.lvl.siltpit`**：会连带改变下一级造价（ratio 1.15 按等级指数增长）、`siltpitStop` 的停用上限、建筑面板显示等级，且 `autoDrillOutputMul`（运行数/总数）的分母会被污染。

### 5.6 微波收敛研究：单卡 5 级

| 项 | 设计 |
|---|---|
| 形态 | **同一张科技卡研究 5 次**（不是 5 张独立卡） |
| 每级 | 太阳帆热液能 **+30%**（`1 + 0.30 × lv`） |
| 成本 | `500 万 × 1.5^lv`（首级 500 万，末级 2531 万） |
| 字段 | `s.techLv[id]`，**同时仍写 `s.techs[id] = true`** |

**为什么必须同时写布尔**：有 4 处按「科技是否存在于 `s.techs`」计数 —— `techCount()`、`eraTechCount()`、成就「科技大成」全表判定、尤里卡揭示扫描。只写 `s.techLv` 会让研究 5 次的科技被当成没研究。

**关键读数口**：`lvOf(s, id) = s.techs[id] ? (s.techLv[id] ?? 1) : 0`。`?? 1` 自动覆盖旧档，零迁移。

**缓存**：`study()` 已有 `s.techVer++`，`tech.mul` 的缓存键就是它，升级时天然失效。

### 5.7 太阳帆翻倍

`economy.js` 的 `starSailHydroMul` 当前读 `s.perk.starSailHydro`，加一条 `× (s.dysonDone ? 2 : 1)`。全仓只有这一个调用点，rates 天然同源。

### 5.8 不等长季节

现状是**等长**（`economy.js:138`）：`seasonIdx(t) = floor(t / SEASON_TICKS) % SEASONS.length`，一个全局 600 秒。

改法（4 处）：

| 落点 | 改法 |
|---|---|
| `config-content.js:13` SEASONS | 每项加 `ticks: 600` |
| `economy.js:138 seasonIdx` | 按累积时长查表取模 |
| `economy.js:710 seasonMeta` | 「本季剩余」从累积表算 |
| `game.js:1173` | 同上（玩家面板读季节进度） |

挑战内 / 奖励后的季长由 `seasonLens(s)` 统一返回，**唯一落点**。

### 5.9 虚境祭坛禁建

`noChallenge: ['drift_terra']` + `unlocked()` 早退。通用字段，将来别的挑战禁别的建筑可直接复用。

---

## 6. 数值表（全部待标定）

### 6.1 行星发动机折算（单座 → 底层）

| 项 | 写成 | 乘数 | 底层用量 |
|---|---|---|---|
| θ生物金属 | 10,000 | 直接 | θ **10,000** |
| 强工质火箭引擎 | 1,000 | 燃料 500 + θ 10 | 燃料 500,000／θ **10,000** |
| 钛金板材 | 7,500 | 钛 50 | 钛 **375,000** |
| 共振钻头 | 4,000 | 钢 250 + 钛 10 + 藻食 10,000 | 钢 1,000,000／钛 40,000／藻食 **40,000,000** |

**单座 = θ 20,000／钛 415,000／钢 1,000,000／藻食 4,000 万／燃料 50 万**
**×50 座 = θ 100 万／钛 2,075 万／钢 5,000 万／藻食 20 亿／燃料 2,500 万**

对照主线戴森球（θ 660 万、钛 1,500 万）：

| 资源 | 主线戴森球 | 挑战新增 | 比值 |
|---|---|---|---|
| 钛 | 1,500 万 | 2,075 万 | **1.38 倍** |
| θ | 660 万 | 100 万 | 0.15 倍 |
| 钢 | 0 | 5,000 万 | 全新线 |
| 藻食 | 0 | 20 亿 | 全新线 |
| 石头 | 0 | 4,750 万 | 全新线 |

刚性总量（钛 + 钢 + 藻食）确实压过主线，但**θ 反而只有主线的 15%** —— 全游戏最硬的瓶颈在挑战里没有加码，难度主要落在钛与两条新线（钢 / 藻食）上。这是已接受的设计，不是疏漏。

### 6.2 星核炉芯池灌满时间

基准：竣工 10,000 帆 × 0.05 = 500/秒，戴森翻倍 ×2 = 1000/秒，挑战 ×0.5 = **500/秒**。
固定开销：生物材料研究所 30 级 90/秒 + 朱庇特 20/秒 + 水舱 3 座 300/秒。

| 配置 | 供给 | 池净增 | 灌满 50M |
|---|---|---|---|
| 只有竣工的帆 | 500 | **+90/秒** | **154 小时** |
| + 15 座核热厂（核聚变 ×5、重核聚变 ×2 = 100/级/秒） | 2000 | +1590/秒 | 8.7 小时 |
| + 微波收敛 5 级（帆 ×2.5） | 2750 | +2340/秒 | 5.9 小时 |

**核热厂是这条曲线的唯一开关。** 不建 → 154 小时；建 15 座 → 8.7 小时。太阳帆被 ×0.5 砍半后已不是主力。

### 6.3 寒流季影响

`seasonMul = 1 − (1−raw)(1−relief)`；有历法 + 烧暖石时寒流季 = `1 − 0.75×0.25 = 0.8125`，再乘冰封 `0.6` = **0.4875**。

| 口径 | 全年平均 |
|---|---|
| 主线（寒流季占 33%，冰封概率 33%） | 1.068 |
| **流浪泰拉（寒流季占 50%，必冰封）** | **0.869** |

即**全产 −18.6%**，且是确定性的每季惩罚。

暖石收支：一季 1200s × 1.0/秒 = 1200 暖石；cap 600 + 赛季内 10 矿工产 600 = 1200，**刚好够**。低于 10 矿工会中途断暖石 → 冻伤重新生效。

### 6.4 奇观造价折算

| 奇观 | 写成 | 底层折算 |
|---|---|---|
| 星核炉芯 | 薄膜 300 / 强工质 1000 / 钢 5000 | θ 3 万 + θ 1 万 + 暖石 5000 万 + 钢 5000 |
| 大陆板块加固 | 薄膜 600 / 强工质 2000 / 脚手架 6000 / 钢制零件 10000 | θ 6 万 + θ 2 万 + 暖石 1 亿 + 珊瑚 60 万 + 藻食 60 万 + 钢 25 万 |
| 水舱 L1 | 钛板 3000 / θ 500 / 石梁 100000 / 钻头 1000 | 钛 15 万 + θ 500 + 石头 1000 万 + 藻食 1000 万 |

---

## 7. 结构改造清单（12 项）

| # | 改造 | 落点 |
|---|---|---|
| 1 | goal 化：`evaluate` / `award` 拆分 | `challenges.js` |
| 2 | 新增 cond `all` / `geekTerra` | `tech.js` |
| 3 | 不等长季节 | `config-content.js` / `economy.js` / `game.js` |
| 4 | `s.techLv` 等级制 + `lvOf` | `tech.js` / `techs.js` / `ui/render-pane-research.js` |
| 5 | `challengeOnly` + `checkTechAll` 跳过 | `achv.js:255` |
| 6 | `noChallenge` 禁建 | `habitat.js:110` |
| 7 | `src/drift.js` 独立模块 | 新增 |
| 8 | `s.res.coreCharge` | `economy.js` / `state.js` / `state-migrate.js` |
| 9 | 水舱停用开关 | `economy.js` / `ui/render-pane-village.js` |
| 10 | 行星发动机 → 破界区 | `config-buildings.js` |
| 11 | 老档 `drift_terra` 完成态重置 | `state-migrate.js` |
| 12 | 炉芯面板「净增 +X/秒」 | `ui/render-pane-*` |

已顺手修掉（本轮）：`economy-rates.js:295` `globalMul` → `globalMulX`（《大统一方程》研究后面板石头产出比实际少算）。

---

## 8. 待定项

| # | 问题 | 候选 |
|---|---|---|
| Q1 | `upg_crustmine` 的名字撞了 `upg_deepmine`（深层矿井） | 「超深矿井」/「地壳钻井」/ 用户定 |
| Q2 | 11 张图（5 科技 + 3 建筑 + 2 奇观 + 1 成就） | 出提示词文本，不出图 |
| Q3 | 排行榜「最快流浪启程」 | 需在 996563 后台建榜 + 回填 ID，属发布动作，后置 |

---

## 9. 实装顺序

1. `tech.js`：`all` / `geekTerra` cond + `lvOf` + `researchCost` 等级
2. `challenges.js`：goal 化（`evaluate` / `award`）+ 定义改写
3. `prestige.js`：删两处 `resolveRun` 调用，改读 `s.challengeCleared`
4. `game.js`：`evaluate` 挂主循环 + 不等长季节
5. `config-content.js`：SEASONS 加 `ticks`
6. `techs.js`：5 条科技（含 `challengeOnly`）
7. `config-buildings.js`：`terra_vat` / `terra_engine` / `void_altar.noChallenge` / 破界区
8. `config-content.js`：两座奇观 + 两条升级项
9. `habitat.js`：`noChallenge` 门
10. `economy.js`：`coreCharge` / `starSailHydroMul` / `siltPitMul` / `rheaMul` / `starTerraformDuration` / 季节
11. `economy-tick.js`：水舱取能、重核聚变、伴生、炉芯灌池
12. `src/drift.js`：新模块
13. UI 五处：炉芯面板 / 水舱行 / 发动机行 / 挑战面板 / 科技卡等级徽标
14. `state.js` / `state-migrate.js`：字段兜底 + 老档重置
15. `achv.js`：成就「流浪者」+ `checkTechAll` 跳过
16. `index.html` 加 `drift.js` + `?v=` bump
17. e2e 补断言 + `_repack.py`

---

## 10. 与 v0.1 的差异

| 项 | v0.1 | v0.2 |
|---|---|---|
| 终点 | 充能池灌满 1.8M | **50 座发动机 + 炉芯池 50M** |
| 结局触发 | 破壳时 `resolveRun` | **goal 达成即 award** |
| 限制 | 永冻（冰封翻倍 + 暖石 −20%） | **必冰封 + 寒流季 ×2 + 太阳帆 ×0.5**（暖石可烧） |
| 奖励 | 全产 +30% | **暖流季 +30% + 寒流季 ×0.5 + 改造时长 ×0.5** |
| 热液能 | 直充发动机 | **存进星核炉芯池** |
| 破壳 | 挑战终点 | **ERA5 里程碑，与挑战无关** |
