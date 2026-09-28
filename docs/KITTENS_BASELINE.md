# 猫国（Kittens Game）对照基准 — 实证值

> 出处：`D:/kg-play/kittensgame-master/index.html`（本地副本，非本仓库；引用前重拉官方 master 复核）。
> ⚠️ 这是**引用型事实**，不是本作规格。本作只在「对齐猫国」被拍板时才抄系数，抄之前先追消费点。
> 首次实证日期 2026-09-24，复核 2026-09-26。逐日细节见 `.workbuddy/memory/archive/2026-09-25.md`。

## 一、开局与资源

- 开局资源全 0，职业除 `woodcutter` 外全 0 ⇒ 唯一出路是手动点 Gather catnip（+1/次），攒 10 建第一座 field。
- **woodcutter 开局默认可用**（本作据此解锁珊瑚匠）。
- `catnipPerKitten: -0.85`（`calcResourcePerTick` **语句顺序即设计，不可重排**：
  建筑侧 → ×季节（只打建筑侧）→ 加职业侧（不吃季节）→ ×(1+catnipRatio)）。

## 二、职业产出（⚠️ 源码值一律是 **per tick**，不是每秒）

> ⚠️ **2026-09-27 重大订正：本表原表头写「（每秒）」，整表错了 5 倍。**
> 猫国 `game.js:2289` 是 `ticksPerSecond: 5`，而 `js/village.js` 里所有 job 的
> `modifiers` **全是 per tick**；UI 才在显示时乘回每秒——
> `village.js:138`：`game.getDisplayValueExt(perTick * game.ticksPerSecond, ...)`。
>
> **实证（2026-09-27 截图）**：1 个学者的 tooltip 显示「科学每秒 +0.175」
> = 0.035 × 5 ✓ 逐位吻合；8 级图书馆显示「产出加成 10.00%」也吻合
> `buildings.js` 的固定 `scienceRatio: 0.1`（见下）。
>
> ⇒ **引用本表必须先 ×5。** 直接把源码值当「每秒」，会低估 5 倍——
> 2026-09-26 就是这么把 scholar `0.035/tick` 读成 `0.035/s`，进而判
> 「本作 `UNIT.sci` 0.03/s = 猫国的 86%，属正常档」；**正确是 0.175/s 对 0.03/s = 17.1%**。
> ⚠️ 但**单看这一格并不能推出「本作该抬高」**——还必须比成本侧，
> 见本节末的对照表（结论：本作同时段反而快 4.5 倍）。

| 职业 | 产出 | per tick（源码值） | 每秒（×5，= UI 显示值） |
|---|---|---|---|
| woodcutter | wood | 0.018 | 0.09 |
| farmer | catnip | 1.0 | 5.0 |
| scholar | science | 0.035 | **0.175** |
| hunter | manpower | 0.06 | 0.30 |
| miner | minerals | 0.05 | 0.25 |
| priest | faith | 0.0015 | 0.0075 |
| geologist | coal | 0.015 | 0.075 |

- `catnipPerKitten: -0.85` 同样是 **per tick**（`village.js:9` 的注释自己写着
  "amount of catnip per tick that kitten consumes"）⇒ **每秒 −4.25 / 猫**。
  本作任何对标「口粮/猫」的地方都要按 −0.85 而不是 −4.25 去比，反之亦然。

### 与「学者产出」配套的**成本侧**（缺了它就会得出反向结论）

| | 猫国 | 本作 |
|---|---|---|
| 学者**每秒**产出 | **0.175**（0.035 × 5） | **0.15**（学者 ×5 后） |
| ⇒ 单产比 | — | **85.7%** |
| 同期科技点数 | 前 13 项（calendar 30 → writing 3600）**14630** | era1 12 项（结绳 0 → 保温法 500）**2875** |
| ⇒ 成本比 | — | **19.65%** |
| **1 名学者跑完这 12 项** | 14630 ÷ 0.175 = **23.2 h** | 2875 ÷ 0.15 = **5.32 h** |

⇒ **成本侧才是真差距**：单产已是猫国的 85.7%，但同期点价只有猫国的 19.65% ⇒
   「1 名学者跑完同一段科技」本作 5.32h vs 猫国 23.2h，**仍快 4.4 倍**。
   「本作学者偏慢」这条在学者 ×5 + 点价重定之后**基本不成立**了。
⚠️ 反向的坑仍在：只比产出会推出「该把学者砍回猫国」；只比成本会推出「抬成本 5 倍即对齐」。
   **比产出必须配成本。**
⚠️ 2026-09-27 订正：本节原写「前 12 项 13430 / 成本比 3.8% / 21.3h」——**13430 是笔误**，
   前 12 项应为 **11030**（14630 − writing 3600）；原表的口径与算式已按上述一并重算。

### ⚠️ 猫国图书馆**不产科学**（易与学者产出混读）

- `js/buildings.js:603-620` `library.calculateEffects` 返回的是**固定值**：
  `scienceRatio: 0.1`（+10% 加成）、`scienceMax: 250`（上限），
  **两项都不乘 `self.val`（级数）** ⇒ 8 级图书馆依然只有 +10% / 250（截图正是如此）。
  科技项里的「每一级使科学产出增加 10%」是**描述文案，与实现不符**，别照它推公式。
- 猫国**没有任何建筑直接产 science**（`buildings.js` 里 "science" 只出现在
  `scienceMax` 与价格里，没有产出型 `modifiers`）⇒ 产科学的**只有学者**。
- ⚠️ 本作**不同**：潮纹馆 `BLD.sci = 0.05` 是 **+0.05/级/秒直接产科学**，
  1 级就顶 1.67 个学者。**本作给图书馆加了猫国没有的产能角色**，
  这是「盖楼 vs 养人」取舍失衡的源头，别当成「对齐猫国」的既有事实。

### 2026-09-27 追到 `scienceRatio` 的消费点（此前只抄了定义，未追读者）

| 问题 | 实证（`kg-play/kittensgame-master`） |
|---|---|
| 学者产出吃不吃 `scienceRatio`？ | **不吃**。`village.js:42-45` scholar 的 `calculateEffects` 只返回 `{"science": 0.035}`，全文件无一处把 `scienceRatio` 接到 scholar 上 |
| `scienceRatio` 加在哪？ | 只加在**天文/事件类固定值产出**上，且是 `(1 + getEffect(...))` **乘在绝对值外面**——`calendar.js:257` `sciBonus = 25 * celestialBonus * (1 + getEffect("scienceRatio"))`、`calendar.js:582` `15 * (1 + ...)`、`calendar.js:758 / 786` 同形 |
| `scienceMax` 是什么？ | **硬上限 clamp**。`resources.js:964-965`：`if (res.name == "science") maxValue *= (1 + getEffect("technocracyScienceCap"))`，与建筑级 `scienceMax` 一起进 `res.maxValue` |

⇒ **「潮纹馆改回猫国形态」的准确含义**：① 删掉 `BLD.sci` 这条直接产能（猫国没有）；
② 建筑提供 **+10%/级 的 `scienceRatio` 式加成**，但它的加成对象在本作是空的
（本作没有天文事件那条产出线）⇒ **照抄会得到一个永远不生效的乘区**，属于 §五「别把字段当机制」的典型。
  ⚠️ 真要抄，得连事件产出线一起抄，否则图书馆会退化成纯装饰。

## 三、科技

- 科技 **零前置链**（175/175 无 requires），前期 12 项里 11 项纯解锁 —— 这条最该抄。
- `maxKittens` 硬上限。
- ⚠️ 2026-09-26 修正：原文写「128 项科技无一项直接给容量」，**区分度不够**。
  `workshop.js` 里的那些叫 **工坊升级（upgrades）** 不叫科技；科技确实不给容量，
  但工坊升级给 —— 它们就是仓储的主要增长手段（见六）。下次引用别把两者混成一句。

### 2026-09-27 era1 逐项对照（首次逐项实证，非推断）

> 本作 `src/techs.js` 里 `era: 1` 的全部条目；猫国 `js/science.js` techs 数组前 13 项。
> ⚠️ 与本作对齐的是**累计序列**，不是一一对应 —— 两边解锁的东西不同，只比「点价 + 同期产能」。

| # | 猫国 | 点数 | 本作 era1 | 点数 |
|---|---|---|---|---|
| 1 | calendar | 30 | 历法 | 40 |
| 2 | agriculture | 100 | 采石 | 30 |
| 3 | archery | 300 | 种植 | 30 |
| 4 | mining | 500 | 凿珊瑚 | 25 |
| 5 | metal | 900 | **结绳**（free，cost 0） | 0 |
| 6 | animal | 500 | 海潮占卜 | 350 |
| 7 | brewery | 1200 | 畜牧 | 200 |
| 8 | civil | 1500 | 书写 | 400 |
| 9 | math | 1000 | 采矿 | 200 |
| 10 | construction | 1300 | 石工 | 500 |
| 11 | engineering | 1500 | 青铜术 | 600 |
| 12 | currency | 2200 | 保温法 | 500 |
| 13 | **writing** | **3600** | — | — |
| | **合计** | **14630** | **合计** | **2875** |

- 点价比 **19.65%**（2875 ÷ 14630）；按「1 名学者跑完」换算（本作 `UNIT.sci = 0.15/秒`，
  猫国 0.035/tick × 5 = 0.175/秒）⇒ **5.32 小时 vs 23.2 小时，差 4.4 倍**。
- ⚠️ 2026-09-27 用户按猫国形态重新定价 era1（畜牧 200 / 采矿 200 / 海潮占卜 350 /
  书写 400 / 石工 500 / 青铜术 600 / 保温法 500；结绳、历法、采石、种植、凿珊瑚按指示
  **未动**）⇒ 合计 330 → **2875**，点价比 3.8%（旧口径）→ **19.65%**。
- ⚠️ **涨价没有线性拉长时长**：同一份 e2e bot 的读数，改前 4.35h → 改后 **4.73h**
  （+0.38h），而点价抬了 8.7 倍。**era1 的节奏仍由人口 / 藻场 / 住房托底，不是点价。**
  想真正拉长 era1，要动的是那几个 cond（`herd` 的藻场 6 级、`masonry` 的石头 100 等）。
- ⚠️ **口径自洽性已核**：本作 scholar 由 `writing`（`free: true`，开局即掌握）解锁
  ⇒ era1 一开始就有一个学者在产出，**不存在「没学者所以这段数据没意义」的窗口**。
- ⚠️ 这条只回答「点价偏不偏小」，**不回答「改成多少」**：
  `CURRENT_FACTS` 判据明确 —— era1 的时长**不是被科技成本决定的**，是被人口 / 藻场 / 住房节律托底的
  （把 layer3/4 成本抹成 0，科技更快但 48h 凿不穿冰）。**抬成本不一定把 era1 拉长。**
- 若真要按时间反推：2h ⇒ 需 **1080 点 = 现值的 3.27 倍**（7200 s × 0.15）。

## 四、住房与容量

- 住房三档：`hut` / `logHouse` / `mansion`；容量只由住房建筑给，科技不直接给。
- 建筑解锁主流是**条件**不是科技：`unlockRatio` 28 处 / `unlockScheme` 10 处 /
  `defaultUnlockable` 8 处 / `requiredTech` **0 处**。

## 五、⚠️ 别把字段当机制

- `catnipDemandRatio` / `catnipDemandWorkerRatioGlobal` / `getResConsumption` 在 master 里
  **只有定义、没有调用**（同一作者的 `luxuryDemandRatio` 在 village.js:813 却有读者）
  ⇒ 引用前必须追到消费点，否则是抄了一个「不生效」的系数。
- 完整对照见 skill `shellbreak-from-prototype` 三·五。

## 六、仓储上限（2026-09-26 逐行实证）

### 公式（`js/resources.js:784-807`）

```js
var maxValue = game.getEffect(res.name + "Max") || 0;          // L792
maxValue = Math.min(this.addResMaxRatios(res, maxValue), Number.MAX_VALUE);
res.maxValue = Math.max(maxValue, 0);
```

- ⚠️ **猫国没有「基础容量」这个概念**：`|| 0` 意味着一条容量建筑都没有时上限就是 0。
  本作的 `CAP_BASE` 是自有设计，别当成「抄猫国」。
- **没有 Infinity 资源**：只有 `temporalFlux` / `zebras` 在 `addResMaxRatios` 里提前 return；
  `science` 也有上限（`technocracyScienceCap` 政策，resources.js:964）。
  ⇒ 本作 `science` 无上限是**用户拍板的例外**，与猫国相反，别当缺口。

### 容量建筑（每级固定量，`js/buildings.js:790-994`）

| 建筑 | catnip | wood | minerals | coal | iron | titanium | gold | 造价 | priceRatio |
|---|---|---|---|---|---|---|---|---|---|
| 粮仓 `barn` | 5000 | 200 | 250 | 60 | 50 | 2 | 10 | wood 50 | **1.75** |
| 仓库 `warehouse` | **0**（研究 `silos` 后 750） | 150 | 200 | 30 | 25 | 10 | 5 | beam 1.5 + slab 2 | 1.15 |
| 港口 `harbor` | 2500 | 700 | 950 | 100 | 150 | 50 | 25 | slab 50 + plate 75 + scaffold 5 | 1.15 |
| 粒子对撞机 `accelerator` | 30000 | 20000 | 25000 | 2500 | 7500 | 750 | 250 | 要 `energyRifts` | 1.15 |

- ⚠️ 量级本身就是资源权重：矿 250 > 木 200、钛 2 ≪ 金 10 ⇒ 与「本作逐资源给量级」同构。
- ⚠️ **仓库不给粮**（`catnipMax: 0`，需 `silos` 才变 750）—— 与「本作藻食只由压舱仓给」同构。
- `barn` 的 `priceRatio` 是 **1.75**，其余容量建筑 1.15 ⇒ 粮仓是**最贵的那档**，容量也最高。

### 后续仓库怎么增加：两条永久乘区（`js/resources.js:896-918`）

```js
if (name == "woodMax" || name == "mineralsMax" || name == "ironMax") {   // 三主材
    effect *= 1 + barnRatio;  effect *= warehouseRatio;                  // 双吃
}
if (name == "coalMax" || name == "titaniumMax" || name == "goldMax") {   // 三副材
    effect *= 1 + warehouseRatio;                                        // 单吃
}
if (name === "catnipMax" && silos.researched) effect *= 1 + barnRatio * 0.25;
```

- ⚠️ **是乘法不是加法**：乘区作用在**已有容量**上。建筑越贵、线性部分涨得越慢，
  乘区正好补这一刀 —— 这套是本作现在缺的（本作 `lvlSum≈90` 就到底了）。
- 乘区来源全部是工坊升级（`js/workshop.js:186-347`，累积叠加）：

| 升级 | 给 | 造价 |
|---|---|---|
| `stoneBarns` | barnRatio +0.75 | wood 1000 / minerals 750 / iron 50 / science 500 |
| `reinforcedBarns` | barnRatio +0.80 | iron 100 / science 800 / beam 25 / slab 10 |
| `titaniumBarns` | barnRatio +1 | titanium 25 / science 60000 / steel 200 / scaffold 250 |
| `alloyBarns` | barnRatio +1 | science 75000 / plate 750 / alloy 20 |
| `concreteBarns` | barnRatio +0.75 | titanium 2000 / science 100000 / concrate 45 |
| `reinforcedWarehouses` | warehouseRatio +0.25 | science 15000 / plate 50 / steel 50 / scaffold 25 |
| `titaniumWarehouses` | warehouseRatio +0.5 | titanium 50 / science 70000 / steel 500 / scaffold 500 |
| `alloyWarehouses` | warehouseRatio +0.45 | titanium 750 / science 90000 / alloy 50 |
| `concreteWarehouses` | warehouseRatio +0.35 | titanium 1250 / science 100000 / concrate 35 |
| `storageBunkers` | warehouseRatio +0.20 | unobtainium 500 / science 25000 / concrate 1250 |
| `strenghtenBuild` | 两者各 +0.05 | science 100000 / concrate 50 |

- **满级累积** = barnRatio 4.35（×5.35）、warehouseRatio 1.80（×2.80）
  ⇒ 三主材全乘区 **×14.98**，三副材只吃 warehouseRatio **×2.80**。
   ⇒ 「主材涨 15 倍、副材涨 2.8 倍」正是「越到后期重心越往主材压」的表达。
- 单点跳变也走容量：`silos` ⇒ catnipMax 0→750；`lhc` ⇒ scienceMax +2500（buildings.js:1665）；
  `accelerator` + `energyRifts` ⇒ 一次性开 catnip 30k / wood 20k / minerals 25k。

### 与本作的差异（供决策，非规格）

| 维度 | 猫国 | 天壳（2026-09-26 版） |
|---|---|---|
| 基础容量 | 无，`\|\| 0` | 有（`CAP_BASE`，最低 200） |
| 增长方式 | 建筑级线性 + **科技乘区（乘法）** | 基础 + 等级增量 + 压舱仓（**全加法**） |
| 上限天花板 | 乘区累积可一直推 | `lvlSum≈90` 后只能买压舱仓（+120/级） |
| 容量建筑数 | 3 座主 + 1 座跳变 | 压舱仓 1 座（藻食 +800 / 其他 +120） |
| 主副材区别 | 主材吃双乘区、副材单乘区 | 按产出速率给量级，无主副之分 |
| `science` | 有上限（政策） | 无上限（用户拍板） |
