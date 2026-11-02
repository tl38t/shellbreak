# 水体污染挑战 · 设计规格（v11 定稿 · **已实装 2026-11-02**）

> **状态**：**已实装**（`src/` 全量落地 + `sim/e2e-suites/waterpollution.mjs` 50 条断言全绿）。
> 实装与本文档逐条对得上；落点细节以 §6 为准，实现新增的判据沉淀在 `docs/JUDGMENTS.md` 五点三十三。
> 数值由用户 2026-11-02 直接给定（与 v1/v2 的"提议占位"不同，**本节数值视为用户权威值**，未拍板项见 §9/§10）。  
> **范围决策（已定）**：① 挑战专属（不碰基游戏平衡）② 污染 = 存量累积 ③ 通关 = 建戴森球或飞升虚境，按污染阶段评分。  
> **纪律**：数值只改 `src/config.js`；改游戏代码前须用户明确同意；标定权在用户。



---

## 0. 一句话

开启挑战后，五类"脏"热液源持续排污染；污染存量分五阶段逐级施加**幸福度/藻食/珊瑚/人口死亡**惩罚；玩家靠新建筑（潮汐往复机/太阳能基站/风场产洁净热液）、净化建筑（保护区）、政策卡（减率/减死亡）、医院、墓地、科技（装罐填埋）把污染压在可控区，最终在污染未崩坏前提下达戴森球/飞升虚境。

---

## 1. 核心模型

### 1.1 状态字段

- `s.pollution`：净污染存量，`≥0`，初值 0。
- `s.pollutionGross`：累计排放（毛），`= ∫ emit dt`（`emit` 是 §1.2 逐源折算后的合计，不是 `rates().hydroSupply`）。⚠️ **已改为纯诊断字段**（原比例法评分随「改单档」作废，见 §5.2）——留着只为面板/调试能看「这局一共排了多少」，**不参与任何判据**；嫌多余可以不实现。
- `s.pollutionDeaths`：因污染死亡人数累计（市政"公众墓地"解锁条件读它）。
- ~~`s.pollutionRunaway`~~ **不实现**：阶段 5「崩坏 + runaway ×1.5」是早期草案（当时六阶段），v2 起已作废 —— 现行五阶段 0~4，最高阶段（腐渊）靠 `−95% + 2%/s 死亡` 自己拖死玩家，不需要不可逆加速开关。
- `migrateRun` 给以上三个字段补 0，老档不崩。

### 1.2 每 tick 结算

⚠️ **v10 修正：`rateMul` 不能乘在汇总值上。** 装罐填埋只削汽轮机，若乘在 `emit` 总额上，核热厂 / 泰坦站 / 管道 / 轨道工厂会被一起减半（用户规格只写了汽轮机）。**必须逐源折算再相加**：

```
// ① 逐源取有效产出（单位：热液能/s，与 hydroAlloc 局部变量同源，见 §1.3）
emitTur  = turL × 1 × (1 + hydroMul) × rW                    // 热液汽轮机
emitPipe = (10 + 30) × rW                                     // 高压热机管道 + 轨道工厂
emitFis  = fisL × 10 × _nf × (1 + 重核聚变比)                  // 核热厂
emitTita = tcL × 6                                            // 泰坦星气云采集站

// ② 乘区：全局排放乘区对所有源生效；装罐填埋只乘汽轮机
rateMul = 污染治理 0.8 / 绿色运动 0.6（两者互斥，只取一张；都没有 = 1）
turMul  = rateMul × (装罐填埋 ? 0.5 : 1)        // ⚠️ 0.5 只挂这一枝

emit = ( emitTur × turMul + (emitPipe + emitFis + emitTita) × rateMul ) × k

// ③ 存量
s.pollutionGross += emit * dt                                   // 纯诊断，见 §1.1
s.pollution = max(0, s.pollution + (emit − cleanupRate(s)) × dt)
```

- `k`：污染系数，**已定 = 1**（用户 2026-11-02 定：按"等值"字面 1:1，每 1 热液能/s 脏产出 = 1 污染/s；不另调 k，改靠阈值控节奏）。
- `cleanupRate(s)`：保护区(-8/s/座) + 保护星球卡(每鲛人-0.1/s) + 最终手段卡(每级异星建筑-0.5/s) + 奇观卫星网(-15/s)。**净化是总存量扣减，不分源。**
- `rateMul`：污染治理(-20%) / 绿色运动(-40%，替代污染治理)。**装罐填埋不进 `rateMul`**，它是 `turMul` 专属因子（见上）。

### 1.3 pollutionSupply（脏源分解，按 hydroAlloc 源码逐字对齐）

⚠️ 只算"脏"热液源；**洁净源（潮汐往复机/太阳能基站/风场）一律不计**。星屑树乘区豁免（统一原则）。

| 脏源             | 污染项 = 有效产出                     | ✅ 计入乘区                             | ⛔ 豁免                      |
| -------------- | ------------------------------ | ---------------------------------- | ------------------------- |
| 热液汽轮机          | `turL × 1 × (1+hydroMul) × rW` | 高压气泵、热能优先卡、平等主义、productionMul、暖石rW | —                         |
| 高压热机管道(+10)    | `10 × rW`                      | 热能优先卡、平等主义、productionMul、rW        | 高压气泵                      |
| 气态巨行星轨道工厂(+30) | `30 × rW`                      | 同上                                 | 高压气泵                      |
| 核热厂            | `fisL × 10 × _nf × (1+重核聚变比)`  | 核聚变(×5)、重核聚变(+100%)、productionMul  | 星屑树 `starNuclearHydroMul` |
| 泰坦星气云采集站       | `tcL × 6`                      | productionMul                      | 星屑树 `starAlienOutputMul`  |

- 实现落点：在 `economy.hydroAlloc` 内增算 `pollutionRate`（脏源局部变量 rW/fisL/\_nf 都在手边，零漂移），tick 读它。
- 洁净源（新增建筑）走 hydroAlloc 的正常 `supply`，但**不进** `pollutionSupply`。玩家面板看到的总热液能含洁净源。

---

## 2. 五阶段（用户给定阈值与 debuff）

| 阶段       | 阈值            | 幸福度    | 藻食       | 珊瑚       | 污染死亡几率/秒  | 死亡→幸福消耗(墓限额内) | 死亡→幸福消耗(限额外) |
| -------- | ------------- | ------ | -------- | -------- | --------- | ------------- | ------------ |
| **0 初始** | `< 1,000`     | 0      | —        | —        | 0         | —             | —            |
| **1**    | `≥ 1,000`     | **−1** | **−30%** | —        | **0.05%** | **+0.3%/死**   | **+3%/死**    |
| **2**    | `≥ 40,000`    | **−2** | **−45%** | **−45%** | **0.1%**  | **+0.3%/死**   | **+3%/死**    |
| **3**    | `≥ 160,000`   | **−4** | **−70%** | **−70%** | **0.5%**  | **+0.3%/死**   | **+3%/死**    |
| **4**    | `≥ 6,400,000` | **−8** | **−95%** | **−95%** | **2%**    | **+0.3%/死**   | **+3%/死**    |

- 阶段名（**已定 · 2026-11-02 21:27 用户拍**）：**0 澄海 / 1 浊流 / 2 赤潮 / 3 死区 / 4 腐渊**（备选 净海 / 窒息 / 绝海 作废）。上屏形态 `污染 12,480 · 浊流`；进度条按「本级起点 → 下一级起点」算百分比（到 160k 以后不能按绝对总量算，否则条子长期卡在 2% 像卡住）。
- 阶段判定用**绝对阈值**（实时 debuff）。**阶段不进评分**（挑战已改单档，见 §5.2）。

### 2.1 debuff 接入通道（2026-11-02 复核后的**真实**接点）

⚠️ v9 只写了「`SOCIAL.happyBurn`」一处，那是**面板读数链**，不是实际扣费。这里按源码逐条改正：

| debuff | 接入点（源码锚） | 形态 | ⚠️ 漏一处会怎样 |
| --- | --- | --- | --- |
| **幸福度 −N** | **三处**：① `economy.js:2388` `happyStep` 的 `_gb` 偏移链（加第 6 项）② `economy-social.js:28` `happyBonusTotal`（必须同 6 项）③ `economy.js:2587` `happyLedger.bonusParts`（加一行 label「水体污染」） | `pollutionHappyOffset(s)` 返回 0 或负值 | 只改①不改② ⇒ `happyMech(s) = s.happy − happyBonusTotal(s)` 没剥掉这项 ⇒ `happyCost` 反而变贵，**污染让居民变贵**（方向相反的 bug）。不改③ ⇒ 面板摆的偏移之和 ≠ 机制值（面板撒谎家族） |
| **藻食 −X%** | `economy.foodRate` 的藻食乘区，与 `pollutionKelpMul(s)` 同位置 | 返回 `1−X` | 面板与结算各写一份 ⇒ 漂 |
| **珊瑚 −X%** | 珊瑚产出行 / `coralFarmMul` 同族乘区 | `pollutionCoralMul(s)` 返回 `1−X` | 同上 |
| **死亡→幸福消耗 +%** | **三处同乘**（与 `cardHappyConsumeMul` 完全同构）：① `economy-social.happyBurn`（面板）② `economy.js:2420` `happyStep` 的 `_D`（在线 tick 实扣）③ `economy-rates.js:447` 的 `D`（速率面板） | `pollutionHappyBurnMul(s) = 1 + penaltyPct`（§2.2 公式） | **只改 `happyBurn` ⇒ 面板涨了、实扣纹丝不动**。这不是假想：`economy-social.js:123` 那条注释就是 2026-10-28 同一形态的事故记录（《节能减耗》漏乘两路，潜伏 8 天） |
| **死亡几率** | **两条时间轴**：`economy-tick` 人口段 ＋ `offline-scheduler.foodAdvanceMicro` | 见 §2.3 | 只改 tick ⇒ 高速/离线**不死亡**，或大 dt 只掷一次骰（`2%/s` 的 8h 离线变成掷一次） |

### 2.2 污染死亡机制（复用 famine/frost 死亡路径）

**概率口径（**已定 · Q**，2026-11-02 21:27 用户拍）：整个人口每步掷一次、最多死 1 人，"每秒 X% 概率死亡 1 人口"按字面；死亡概率**不随人口数量放大**，只按步长换算。**

- 若按「每人独立掷骰」，20 人时 0.05%/s 会变成 ≈1%/s、200 人时 2%→98%，量级直接错两个数量级。**用户原话是"每秒有 X% 概率死亡 1 人口"，即整个人口一次、最多死 1 人**，与 `famine`/`frost` 完全同构。
- 概率先剥减伤、再按 dt 折算：
  ```
  pBase  = p_stage × (1 − 卡) × (1 − p_hosp)        // 卡∈{0, 0.15, 0.30}，互斥只取一张
  p_tick = 1 − (1 − pBase)^dt                        // ← dt 折算，三种速度一致
  ```
- `p_hosp` = 医院 `1 − 0.6^(L/15)`（**E 已定**，`maxLvl 15`，L=15 恰好 40%）。
- 命中则 `s.pop--; s.pollutionDeaths++; SB.folk.reconcile(s)`；`s.pop > 1` 才掷（**与饥荒/冻伤同一条护栏，人口最低 1、永不为 0** —— Q 已定，见 §10-Q）。
- **C 已定 · 死亡永久累积，惩罚按当前配额重算**：
  ```
  Q = 4 × 墓地等级 + (装告解圣事 ? 神庙等级 : 0)        // 当前墓地限额
  D = s.pollutionDeaths                                 // 累计污染死亡（只增不减）
  penaltyPct = 0.3% × min(D, Q) + 3% × max(0, D − Q)
  happyBurnMul = 1 + penaltyPct
  ```
  - **扩建墓地 ⇒ 3% 自动降为 0.3%**：Q 增大使 `min(D,Q)` 上升、`max(0,D−Q)` 下降，超额死亡被"回填"进限额，按重算后的配额计价（不锁死历史 3%）。
  - ⚠️ `penaltyPct` 无硬上限；死亡极多时 happyBurn 可被放大到很高（设计风险，实测若失控再谈上限）。

### 2.3 死亡结算的两条时间轴（**只改 tick = 高速/离线不死亡**）

游戏有两条互斥的人口推进路径，**同一次 tick 只会走其中一条**（`game.js:1134` / `game.js:1327`）：

| 时间轴 | 触发 | 入口 | 改法 |
| --- | --- | --- | --- |
| **在线常规** | 1× 常规帧 | `economy-tick` 的 `if (!(opts && opts.skipFoodPop))` 段内（紧跟第 7 步冻伤之后） | `p_tick = 1−(1−pBase)^dt`，掷一次 |
| **高速 / 离线补算** | `speed ≥ FAST_SPEED_THRESHOLD`、`drainCatchUp` | `offline-scheduler.foodAdvanceMicro(s, mdt, at, emit)`，`mdt ≤ 0.1s`，`happyStep` 之后 | 与冻伤同构：`1−(1−pBase)^(mdt/0.1)`，**每 0.1s 微步掷一次** |

- 两条路都走 `{skipFoodPop:true}` 分流的同一段逻辑，**不会双算**（tick 那段被整块跳过）。
- ⚠️ 污染**存量**推进（§1.2 ②③）留在 tick 主体、允许大步；**死亡掷骰绝不允许大步**——这是两条独立的纪律，别一起处理。
- ⚠️ 离线时 `emit` 用的是该步起点状态（生产链不由离线积分器重算）⇒ 离线污染增速是"步内冻结"的近似值。8h 大块离线会低估后期增速，但不会 NaN、不会负增长，可接受（若要精确得像食物那样切步，是另一个量级的工程）。

---

## 3. 污染内容清单（用户给定）

### 3.1 建筑（6）

| 建筑            | 造价                        | ratio | 效果                         | 前置        | 文案                                  |
| ------------- | ------------------------- | ----- | -------------------------- | --------- | ----------------------------------- |
| **潮汐往复机**     | 石100+金属100+珊瑚200          | ×1.5  | 热液能 **+1/s**，**不污染**       | 科技 金属精炼   | 将建设潮道的相关知识运用到热液能的开发上，潮汐推动着精妙的连杆飞速运转 |
| **太阳能基站**     | 钢3500+钛2500               | ×1.5  | 热液能 **+3/s**，**不污染**       | 科技 化学     | 凹面收集着来自恒星的永恒热量。                     |
| **恩拉多克斯阵列风场** | θ生物金属100+石梁10000+钛金板材3000 | ×2    | 热液能 **+15/s/级**，**不污染**    | 科技 大型异星工程 | 钢铁的三叶草海在风中摇曳……                      |
| **墓地**        | 石200+珊瑚200                | ×1.5  | **墓地限额 +4**                | 市政 公众墓地   | 静谧之地。                               |
| **医院**        | 钢100+石1000                | ×1.5  | 污染死亡几率 **−6%/级（边际递减，L≤15，15 级到顶 = −40%）** | 市政 公共卫生   | 死神前的最后一道防线。                         |
| **保护区**       | 藻食10000+珊瑚5000            | ×2    | **污染 −8/s**                | 市政 保护地球   | 愿我们的后代仍能在水草与珊瑚间嬉戏。                  |

> 潮汐/太阳能/风场是**洁净热液源**（进 hydroAlloc supply，不进 pollutionSupply）。墓地/医院/保护区是治理件。

### 3.2 政策卡（7）

| 卡    | 解锁市政  | 槽        | 效果                              | 文案                                    |
| ---- | ----- | -------- | ------------------------------- | ------------------------------------- |
| 隔离病患 | 卫生法令  | 民生(grow) | 疾病死亡概率 −15%（不受医院软上限影响）          | 「德'罗丽丝女王陛下有令，所有病人必须集中居住。」             |
| 告解圣事 | 公众墓地  | 民生(grow) | 每个神庙 **+1 墓地限额**                | 「求主欣然地使他得享安息与永福……」                    |
| 保护星球 | 保护星球  | 民生(grow) | 每个鲛人 **−0.1/s 污染**              | 「我们的星球，我们的摇篮。」                        |
| 最终手段 | 我们的摇篮 | 民生(grow) | 每级异星建筑 **−0.5/s 污染**            | 「阿克西斯的后部会因引力坠向地球，你们努力过头了！」            |
| 疾控防治 | 城市化   | 民生(grow) | 疾病死亡概率 −30%（不受医院软上限），**替代隔离病患** | 「请在这里排队检测核酸。」                         |
| 污染治理 | 启蒙运动  | 工造(prod) | 污染产出 **−20%**                   | 「伦'尼姆，帝国的明珠，但贫民窟的孩子很难在这里的工业废水中活过14岁。」 |
| 绿色运动 | 全球化   | 工造(prod) | 污染产出 **−40%**，**替代污染治理**        | 「How dare you！」                       |

### 3.3 市政（5，全部"仅水体污染挑战显示"）

| 市政        | 费用        | 纪元     | 层 | 前置   | 解锁条件       | 解锁内容                    | 鼓舞       |
| --------- | --------- | ------ | - | ---- | ---------- | ----------------------- | -------- |
| **卫生法令**  | 10000     | 硫泉纪(3) | 3 | 行政部门 | 污染 ≥1000   | 政策卡：隔离病患                | 污染 ≥1000 |
| **公众墓地**  | 10000     | 硫泉纪(3) | 3 | 行政部门 | 因污染而死 ≥1   | 建筑：墓地 + 政策卡：告解圣事        | —        |
| **公共卫生**  | 65000     | 洋流纪(4) | 3 | 启蒙运动 | 污染 ≥40000  | 建筑：医院                   | —        |
| **保护地球**  | 550000    | 观星纪(7) | 2 | 现代思潮 | 污染 ≥160000 | 政策卡：保护地球 + 建筑：保护区       | —        |
| **我们的摇篮** | 3,000,000 | 探星纪(8) | 3 | 星际政治 | 污染 ≥6400000 | 政策卡：最终手段 + 奇观：星球气候调节卫星网 | —        |

> ✅ **阈值已对齐（原 §10-J 已定，用户 2026-11-02 拍「要改」）**：解锁条件已改为 `≥40000 / ≥160000 / ≥6400000`，与阶段 2/3/4 阈值一致。

### 3.4 科技（1）

| 科技       | 前置     | 费用               | 效果                           |
| -------- | ------ | ---------------- | ---------------------------- |
| **装罐填埋** | 科技 工业化 | 金属4000 + 科技80000 | 热液汽轮机**额外**每秒耗 5 金属（暖石耗照旧），该汽轮机污染产出 **−50%** |

### 3.5 奇观（1）

| 奇观            | 解锁       | 造价（**用户 2026-11-02 20:32 定**）                                  | 效果                   |
| ------------- | -------- | ------------------------------------------------------------ | -------------------- |
| **星球气候调节卫星网** | 市政 我们的摇篮 | 火箭引擎 **200** + 封闭藻仓 **400** + **轨道卫星 10 级**（消耗建筑）            | **污染 −15/s**（永久、无等级） |

> ⚠️ **"消耗 10 级轨道卫星"是新增能力：奇观造价支持扣建筑等级**（现有代码不支持，见 §6.1）。配两个字段而不是塞进 `cost`：
> ```js
> cost:      { rocketEngine: 200, sealbin: 400 },
> costBuild: { satellite: 10 }        // 扣 s.lvl.satellite 10 级
> ```
> **为什么不写 `cost.satellite: 10`**：`buildWonder` 是裸 `s.res[k] -= wc[k]`（`workshop.js:623`），`s.res.satellite` 不存在 ⇒ 直接写出 **`NaN` 进存档**；`costOwnedTxt`/`lackText` 也都会读成「现有 0」永远凑不齐。分字段能让既有 `for k in cost` 循环一个字都不用改。

**造价量级核算（该知道有多贵）**：

| 项 | 折算 |
|---|---|
| 200 火箭引擎 | 每台 = 火箭燃料 200 + 封闭藻仓 10 ⇒ **火箭燃料 40,000 + 藻仓 2,000** |
| 400 封闭藻仓（直接） | 藻仓 **400** |
| 10 级轨道卫星（先造后拆） | 卫星 base 钛金板件100+燃料100、ratio 1.5 ⇒ 10 级累计 ≈ **钛金板件 11,333 + 火箭燃料 11,333** |
| **合计** | 火箭燃料 ≈ **51,300** · 封闭藻仓 ≈ **2,400** · 钛金板件 ≈ **11,300** |

对比 ERA8 的旅行者1号（100 引擎 = 燃料 20,000 + 藻仓 1,000 + 板件 1,600）⇒ **本奇观约 2.5 倍旅行者**。作为「我们的摇篮」（市政 300 万点）之后的终局奇观，这个量级说得通，但玩家会感到痛；若要降档，最先砍 200→100 引擎。

> **时代相近奇观造价参照（源码实测）**：
> | 时代 | 奇观 | 造价 |
> |---|---|---|
> | ERA7 | 摇篮 | 火箭燃料 10,000 |
> | ERA7 | 至高圣座 | 火箭引擎 30 |
> | ERA7 | 博洛西洛漂浮发射场 | 钛金板件 1,000 + 封闭藻仓 80 |
> | ERA8 | 旅行者1号 | 火箭引擎 100 + 钛金板件 1,600 |
> | ERA8 | 萨图恩气行星轨道采集站 | θ金属 500 + 火箭引擎 50 |
> | ERA8 | 哈'利法宇宙望远镜 | 火箭引擎 100 + 钛金板件 400 |
> | ERA8 | 魔鱼世界VR | 自适应薄膜 10 |

---

## 4. 污染率/净化汇总（数值即用户给定）

- 污染产出降低：污染治理 −20% / 绿色运动 −40%（替代）/ 装罐填埋 汽轮机 −50%。
- 净化（-污染/s）：保护区 −8/s/座；保护星球 −0.1/s/鲛人；最终手段 −0.5/s/异星建筑级；**奇观 星球气候调节卫星网 −15/s（永久）**。
- 死亡概率降低：隔离病患 −15% / 疾控防治 −30%（替代，二者互斥）/ 医院（L≤15）：`p_hosp(L) = 1 − 0.6^(L/15)`，L=1 约 3.4%、L=5 约 15.7%、L=10 约 28.9%、**L=15 = 40%**（连续递减、无空转等级）。
  - 叠加：`p_tick = 1 − (1 − p_stage × (1−卡) × (1−p_hosp))^dt`（**F 已定**：`base × (1−卡) × (1−医院)`，两卡互斥不乘两次）。
- **死亡→幸福消耗（永久累积，按当前配额重算）**：`0.3% × min(D,Q) + 3% × max(0,D−Q)`，Q=墓地限额、D=累计污染死亡。扩建墓地 ⇒ 超额部分自动 0.3%。
- 墓地限额：墓地 +4/座；告解圣事 每个神庙 +1。

---

## 5. 挑战入口与结算（**已改单档**，2026-11-02 20:47 用户拍板）

### 5.1 DEFINITION

```js
{ id:'waterpollution', name:'水体污染', icon:'🌊', kind:'单次挑战',
  summary:'热液开发污染深海，须在生态崩坏中把文明推到戴森球。',
  rule:'脏热液源持续排污染；污染分五阶段施加幸福/藻食/珊瑚/死亡惩罚。',
  reward:'永久星屑产出 +10% · 商人奢侈品产出 +50% · 初始人口 +2',
  goal:{ t:'dyson' },
  goalText:'建成戴森球（飞升虚境亦算达成）',
  /* 2026-11-02 复核补：把两处原本硬编码在 award() 里的东西搬进数据表，
   * 否则「加 DEFINITION」仍发不了奖（见 §5.5）。 */
  rank:  'waterpollution',        // 对应 config.RANK.LB 的键
  achvId:'waterpollution',        // 对应 config.ACHV / achv.DEFS 的键（可选，见 §5.4）
  tiers:[ {label:'澄海远征', cap:null} ] }
```

> 与「流浪泰拉」同构：**单档 + goal 即时结算**。本挑战需要新 goal 类型 `{t:'dyson'}` ⇒ `goalMet` 加一行 `if (goal.t === 'dyson') return !!(s && s.dysonDone);`（`challenges.js:141` 那层 return false 之前）。

### 5.2 通关判定

- 胜利 = `s.dysonDone === true`（**戴森球建成即达成，无需另判飞升**：`achv.voidEnd` 的描述就是「掌握《飞升虚境》之后竣工戴森球」⇒ 两条终局线都收敛到 `dysonDone`）。
- **无档位、无比例法**：污染阶段只作为过程压力与面板读数，**不进评分**（原「净/毛比值 ≤0.30/0.15/0.05」三档设计作废）。
- 阶段4 腐渊**不设硬失败**——它靠 `−95% 藻食/珊瑚 + 2%/s 死亡` 自己把玩家拖死，不需要另一个判据。
- 重复挑战（已通关后再打）：照 `canStart`/`isReplay` 现有规则，**只刷榜不发奖**。
- ⚠️ **`resolveRun()` 跳过 goal 挑战是正确行为，不要改**（`challenges.js:283`）：goal 型由 `evaluate()` 在每帧即时结算（`game.js:1200` 在线 / `game.js:1330` 离线补算都会调），`resolveRun` 那条是给「破壳/轮回时结算」的旧路径用的。**真正的拦路虎是 `award()` 硬编码（见 §5.5 #1）。**

### 5.3 永久奖励（单档三件，全部走基游戏既有通道）

| 奖励 | 值 | 通道 | 改动量 |
|---|---|---|---|
| **星屑产出** | **+10%** | `prestige.stardustGain` 的 `mul` 链（与 质量效应×1.15 / 先民遗产×1.2 / heir_of_stars×2 **独立相乘**） | 加 1 个 `if (tierDone('waterpollution')) mul *= 1.1` |
| **商人奢侈品产出** | **+50%** | 商人 luxury 产出乘区。⚠️ **三处同源**：`economy-social.happySupply`（面板/供给）、`economy-tick` 的 luxury 产出行、`economy-rates` 的商人产出明细 | 建议新开 `SB.economy.luxuryOutMul(s)` 一个函数，三处都调它（有 e2e 断言钉「happySupply === tick 毛产出」，写成三份必翻车） |
| **初始人口** | **+2** | `challenges.startingPopulation()` | 加一行 `+ (tierDone('waterpollution') ? 2 : 0)` |

> ### ⚠️ 第 4 项奖励：**轮回点获取 +10%（通用规则，v9 漏列；R 已定 · 保留）**
>
> `prestige.breakReport`（`prestige.js:187-188`）：`pointMul = 1 + completedCount() × 0.1`。而 `completedCount()` 遍历 `DEFINITIONS` 全表 —— **新挑战一进表就自动被计入**，等于白送一条「轮回点获取 +10%」。
>
> - **定性（已定）**：这是**所有挑战共享的通用规则**（7 项挑战现在都是这条），不是本挑战专属奖励 ⇒ **不写进 `reward` 文案**（否则要和另外 6 项一起改文案，反而制造不一致），但**写进共享规则与 e2e 断言**。
> - **⚠️ 不能当作「没有」**：它是玩家真实收益，规则文档必须列出来，否则玩家/策划都会以为只给了三项。
> - **`noPointBonus` 方案作废**（用户 2026-11-02 21:27 拍：保留通用规则，不引入例外分支）。
> - 顺带确认：重打**不会**重复领这条 —— `resolveRun` 的 replay 分支一个字都不写账本（`challenges.js:297-300`），`completedCount` 不变。

折扣/叠加说明：
- 星屑是**跨周目**资源，只在破壳结算发放 ⇒ 该奖励在「本次通关后的所有后续周目」生效，符合「标准奖励」定位。
- 商人奢侈品 +50% 与 马具（`toolMul` +50%）/ 寡头政体（`luxuryMul 1.2`）/ 马镫升级（`luxuryMul` 求和）**各自独立相乘**，不合并进任何一条。奢侈品目前只有商人与公司两条进项、且已有真实 sink（`happyBurn`），这条奖励不会变成死数值。

### 5.5 结算接线（v9 缺的 6 个接点，不补就「加了 DEFINITION 也不发奖」）

| # | 位置 | 现状 | 必须改成 | 漏了会怎样 |
|---|---|---|---|---|
| **1** | `challenges.award()`（`challenges.js:143-144`） | 首行 `s.challenge.id !== 'drift_terra'` 直接 return null | 改成读 `d = BY_ID[s.challenge.id]`；`if (!d \|\| !d.goal) return null;` 再走 `goalMet(s, d.goal)`；把 drift 专属副作用（`lockSeasonLengths` / `unlockOnce('driftTerra')` / `rank.submitRun('drift')` / 日志文案）抽成 `d.onComplete(s, meta)` | **本挑战永远发不了奖**（这就是你说的「只加 goal 判定仍不会发奖」） |
| **2** | `challenges.emptyProgress()`（`:54`） | 硬编码 6 个 id | 加 `waterpollution: false` | `tierDone`/`completedCount`/`progress` 全读不到它 ⇒ 奖励不生效 |
| **3** | `state.js:739` `challengeIds` 白名单 | 硬编码 6 个 id + `:742` 的单次挑战布尔名单 | 两处都加 `waterpollution` | **读档即丢**（`migrateMeta` 只保留白名单内的键）⇒ 玩家重启后奖励消失 |
| **4** | `state-migrate.js:29` | `out.challengeDone = !!(raw.challengeDone && out.challenge && out.challenge.id === 'drift_terra')` | 改成「`challenge` 非空 且 `byId(id).goal` 存在」即保留 | 读档后 `challengeDone` 被抹成 false ⇒ 本局可**重复领奖**（重放分镜 + 重复写 meta） |
| **5** | `challenges.js` 的 `award` replay 分支 | 只对 drift 提交 `key:'drift'` | 用 `d.rank` 提交 | 重打不刷榜（挑战少了重复驱动力） |
| **6** | `config.RANK.LB` / `MAP` + 平台榜 | 无 `waterpollution` 键 | 见 §5.4 | `rank.submitRun` 静默跳过（`if (!lb[k])`） |

> 顺带一句：**`resolveRun` 那条 `if (d && d.goal) return null` 保持原样**，它不是 bug（理由见 §5.2）。

### 5.4 排行榜

建议建一条「**最低污染通关**」榜（成绩 = 通关瞬间 `s.pollution` 取整，`numeric` + `asc` + `best`），与现有 `dyson`/`void` 时间榜并列。挑战没有榜就少一半重打动力。

**落地要动 4 处（不是 1 处）**：
1. `config.js` `RANK.LB` 加键（空串占位也行，但**必须初始化为 `''`**，见该处 ⛔ 注释）；
2. `config.js` `RANK.MAP` 加同键参数表（`scoreType:'numeric'`, `scoreOrder:'asc'`, `calcType:'best'`）；
3. **平台侧建榜拿 ID 回填**（MCP `create_leaderboard`，996563）——这一步只有你能拍；
4. `challenges` 的 `award` 走 `d.rank` 提交（§5.5 #5）。

⚠️ 成绩必须整数（平台 Integer）⇒ `Math.round(s.pollution)`；空串占位期间 `rank.submitRun` 会自动跳过，不会报 500001。

---

## 6. 代码落点（**已实装**，下表即真实改动清单）

| 模块                                           | 改动                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `state.js`/`migrateRun`                      | `pollution`/`pollutionGross`/`pollutionDeaths` 初始化 + 老档补 0                              |
| `economy.hydroAlloc`                         | 增算并返回 `pollutionRate`（脏源，星屑树豁免）；新增洁净源 supply（潮汐/太阳能/风场）                                 |
| `economy-tick`                               | tick 加 pollution 结算 + 死亡判定（按 dt 折算）/ `s.pollutionDeaths`                                |
| `economy`（happy/kelp/coral/globalMul/popCap） | 加 `pollutionHappyOffset`/`pollutionKelpMul`/`pollutionCoralMul`/`pollutionHappyBurnMul` |
| 污染面板                                         | 仅 `entered(s,'waterpollution')` 渲染，每帧读阶段                                                         |
| `challenges.js`                              | `waterpollution` DEFINITION（单档）+ `goalMet` 增 `{t:'dyson'}`（读 `s.dysonDone`）+ `pollutionStage(s)` + `startingPopulation()` +2 |
| `prestige.stardustGain`                      | 星屑 +10%：`if (tierDone('waterpollution', meta)) mul *= 1.1`（与既有 4 条乘区独立相乘，结算/预览同源） |
| `economy` luxury 三处                           | 新增 `luxuryOutMul(s)`：`economy-social.happySupply` / `economy-tick` luxury 产出行 / `economy-rates` 商人明细**三处同调**（有 e2e 钉等式，写三份必翻车） |
| `config-buildings`                           | 6 座新建筑（潮汐/太阳能/风场/墓地/医院/保护区）                                                             |
| `techs.js`                                   | 装罐填埋                                                                                    |
| `civics-data.js`                             | 5 市政 + 7 政策卡                                                                            |
| `config-content`/`wonder.js`                 | 星球气候调节卫星网 + **`costBuild` 建筑造价通道**（见 §6.1）                                          |
| `habitat.unlocked()`/`lockReason()`          | **新增 `challengeOnly` 白名单**（现只有 `noChallenge` 黑名单），见 §6.2 |
| `tech.js` / `ai-strategy.js` / `achv.js`      | `challengeOnly` 现**硬编码 drift_terra**，须泛化，见 §6.2 |
| `civics.js` / 政策卡                          | **完全没有挑战门控**，须新增，见 §6.2 |

### 6.1 新增通道：奇观造价可扣建筑等级（`costBuild`）

**现状**：奇观目前只认资源 key（`cost` 里每项都当 `s.res[k]` 处理），**不支持扣建筑**。虚境祭坛的 `cost.pop` 是唯一先例（非 RESS 键靠特判绕开），照它做。

⚠️ v9 只列了 4 处，**实际有 9 处**。漏任何一处，症状分别是「静默出负等级」「永远显示缺料」「追踪框假绿」「TypeError 炸整页」——都不是小事：

| # | 位置 | 现状 | 改法 | 漏了会怎样 |
|---|---|---|---|---|
| **1** | `workshop.wonderBlocked`（`workshop.js:589`，成本检查在 `:614`） | 只 `lackText(s, discountedCost(s,id))`，**只查资源** | 在 `lackText` 之后追加 costBuild 检查：`for (k in w.costBuild) if ((s.lvl[k]\|\|0) < w.costBuild[k]) return '还缺 人造卫星 ' + lv + '/' + need` | **卫星 0 级也能点建** ⇒ 扣成负等级 |
| **2** | `workshop.buildWonder`（`:618-623`） | `for (k in wc) s.res[k] -= wc[k]` | 资源循环**不动**；另读 `w.costBuild`：`s.lvl[k] -= n`、**clamp ≥ 0**；`s.satelliteStop = Math.min(s.satelliteStop\|\|0, s.lvl.satellite)`；再调 `SB.game.syncSpacecraft(s)` 重排星图卫星清单 | `s.lvl.satellite = -10` **写进存档** |
| **3** | `workshop.lackText`（`:676`） | 读 `s.res[k]`（有 `SB.RESS[k] ? name : k` 判空，不抛错） | **不要复用它做 costBuild**：它读的是 `s.res`，而卫星在 `s.lvl` ⇒ 永远算出「现有 0」 | 永远显示「人造卫星 9/10」建不了 |
| **4** | `wonder.discountedCost`（`wonder.js:291-305`） | 对 `cost` 逐项乘折扣（蓝图 −5%/级、心胜于物 −30%、征夫发役…） | `costBuild` **原样透传、不乘折扣**（与 `pop` 同理：拆建筑不是材料） | 折扣卡把要求的 10 级卫星减成 7 级 |
| **5** | `economy.costTxt`（`economy.js:701`） | `SB.RESS[k].name`，**完全没判空** | **绝不能把 costBuild 塞进 cost 传进来**；面板层自己拼 | **`SB.RESS['satellite']` 是 undefined ⇒ TypeError 炸整页** |
| **6** | `economy.costOwnedTxt`（`:712`，`:726`） | 只有 `pop` 特判，其余 `SB.RESS[k].name` 无判空 | 同 #5（可在函数内加 `k === 'costBuild'` 分支，或面板层拼） | 同上，**炸整页** |
| **7** | `render-pane-wonder.js:61`（`costTxt`）＋ `:68`（`costOwnedTxt`） | 两处都只拼资源 | 两处都追加建筑项文案（「人造卫星 5/10」） | 面板只显示材料，玩家看不出还要拆卫星 |
| **8** | `track-dock.js:146` 追踪面板 | `rows` 只来自 `discountedCost` | 追加 costBuild 行（have 取 `s.lvl[k]`） | **追踪框变绿（材料够了）但点不动** = 假绿，和 §1 的 `sunSailRate=0` 假绿同族 |
| **9** | `render-info.js:644/651`（奇观点开的详情卡） | `costTxt(cost)` + `costOwnedTxt(s, cost)` | 同 #7 | 详情卡看不到、或（若误塞进 cost）炸整页 |

**扣等级会顺带削掉的产出（要认）**：卫星每级 `satelliteHydro +1/s`（洁净热液，不涉污染）、`satelliteStar +5 星空/s`、`satelliteScholar +25% 学者`、`s.lvlSum` 类市政鼓舞。`s.lvl.satellite` 若被扣到 0 不会回锁已解锁的星屑商店（`unlockStardustShop` 只增不回退），可接受。
⚠️ **卫星是戴森线的重要星空来源**：如果玩家把唯一的 10 级卫星拆掉，可能连带卡住本挑战的通关目标（戴森球）。这是它自带的代价，不是 bug，但**标定时要知道**（要不要给奇观补一条星空补偿由你定，§10-S）。

---

### 6.2 挑战专属内容门控（建筑 / 科技 / 市政 / 政策卡，四类都要）

**现状盘点（2026-11-02 复核）——只有建筑有半套，其余三类基本空白**：

| 内容类型 | 现有门控 | 能否复用 |
| --- | --- | --- |
| 建筑 | `habitat` 的 `noChallenge` 是**黑名单**（`config-buildings.js:863` 用过一次：虚境祭坛禁入流浪泰拉） | ❌ 只有黑名单。新内容要的是**白名单**（只在挑战内出现） |
| 科技 | `t.challengeOnly` 在 `tech.js:755`/`:773` **硬编码 `=== 'drift_terra'`** | ❌ 必须泛化成 id / id 数组 |
| 市政 | **完全没有**（`civics.blocked` 只看 揭示/纪元/前置/点数） | ❌ 新造 |
| 政策卡 | 无，但 `cardOwned` 读 `s.civics[p.civic]` ⇒ 市政被门控则卡拿不到 | ⚠️ 半自动；**卡池 UI 仍会列出**并显示「需先完成市政 X」 |

**统一谓词**（四处都调它，别再各写一份判断）：

```js
/* challenges.js 新增导出：当前周目是否放行某挑战专属内容 */
function allowsChallenge(s, idOrIds) {
  var a = active(s);
  if (!a) return false;
  if (!idOrIds) return true;                    // 未声明 = 不限
  return [].concat(idOrIds).indexOf(a.id) >= 0;
}
```

| # | 位置 | 改法 | 漏了会怎样 |
| --- | --- | --- | --- |
| 1 | `habitat.unlocked`（`:110`）**＋** `habitat.lockReason`（`:147`） | 两处都加白名单判定（与 `noChallenge` 并列，一黑一白） | 基游戏里能看见/能建墓地·医院·保护区 ⇒ **直接破坏范围决策** |
| 2 | `tech.canStudy`（`:755`）**＋** `tech.studyBlocked`（`:773`） | 硬编码换成 `allowsChallenge(s, t.challengeOnly)` | 装罐填埋基游戏可研究 |
| 3 | `ai-strategy.js:317-323`（`inDrift` 变量 + 两处 `tech.challengeOnly` 判断） | 同上换谓词 | 普通主线 bot 会去研究挑战专属科技（新挑战下 `inDrift` 判断失效），卡住主线 |
| 4 | `achv.js:262`（`if (T[i].challengeOnly) continue;`） | **保持跳过**（成就墙不该数挑战专属科技）；但要确认新增科技不进「科技全掌握」类成就的分母 | 成就永久不可达 |
| 5 | `civics.blocked`（`:852`，唯一市政门禁） | 开头加 `if (c.challengeOnly && !allowsChallenge(s, c.challengeOnly)) return '仅限水体污染挑战期间';` | 5 个市政基游戏可见可点 |
| 6 | 政策卡池渲染（`render-pane-civic`） | 按 `p.civic` 的 `challengeOnly` 整张卡过滤（连"未解锁"也不摆） | 基游戏卡池多出 7 张永远拿不到的卡 |
| 7 | **`tech.condMet`（`:184`）** | 新增两个条件类型：`case 'pollution': return (s.pollution \|\| 0) >= c.n;`、`case 'pollutionDeaths': return (s.pollutionDeaths \|\| 0) >= c.n;` | ⚠️ **最容易漏**：5 个市政的解锁条件与鼓舞全是新类型（污染阈值 / 污染死亡数），`condMet` 现在只认 `built/res/rate/pop/wonders…`，不加分支 ⇒ **条件恒假、市政永远灰** |

> 好消息：`civics.condMet`（`:782`）直接转发 `SB.tech.condMet`，所以 **#7 只有一个落点**，加在 tech.js 就同时覆盖科技尤里卡与市政鼓舞/解锁条件。

### 6.3 实装补记：预览表之外**实际还改了**的地方

预览表（§6 主表）是设计期指路，实装时又带出这些接点，逐条记下来（下次做同类挑战可直接照抄）：

| 位置 | 为什么必须动 | 漏了会怎样（都实际踩过或当场被断言抓到） |
| --- | --- | --- |
| `economy.pollutionSplit(s, HF)` | 把「汽轮机那一枝 / 其他脏源」拆开的**唯一算式**，`pollutionEmitRate` 与面板都读它 | 拆项与总额各算一份 ⇒ 装罐填埋变成全局 −50%，或面板数与实账不符 |
| `economy.pollutionSources(s)` | 面板唯一读数口（`on/turbine/other/emit/clean/net`），内部调 `hydroAlloc(s,1)` | 面板自己再算一遍 ⇒ 数字与结算漂移 |
| `economy-rates` 的 `pollution` 行 | `rates()` 必须能报污染净变，与 tick 同源 | 面板/追踪只报「排放」不报净变，玩家看不出到底在恶化还是好转 |
| `offline-scheduler` `OWNERSHIP` | 新增 `pollution: 'economy-tick'`、`pollutionDeaths: 'food'` 两行归属声明 | 离线微步路径的死亡没登记 ⇒ 归因统计把死亡算到别人头上 |
| `tech.resCost`（新通道） | 《装罐填埋》要额外掏 4000 金属，而科技原本只收科技点 | 塞进 `cost` ⇒ `researchCost` 把它当科技点打折，四处不同源 |
| `challenges.startingPopulation` | 挑战初始人口 +2 与「小国寡民 +3」独立叠加 | 写成覆盖 ⇒ 两者只能吃到一个 |
| `challenges.emptyProgress` | 新增 `waterpollution: false` | 进度对象缺键 ⇒ 挑战页渲染 `undefined` 状态 |
| `state.freshRun` 三字段 + `singleTierChallenges` | 单档挑战没有分档进度数组 | 复用分档槽位 ⇒ 排行榜分数错位 |
| `state-migrate.challengeDone` 泛化 | 原判据写死 `drift_terra` | goal 型挑战读档被抹成 false ⇒ **重复领奖** |
| `render-pane-wonder` 的 `challengeOnly` 过滤 | 挑战专属奇观在基游戏整行不显示 | 基游戏列表里多一座永远建不了的奇观 |
| `assets/challenges/challenge-waterpollution.svg` | 挑战卡头像 | 空 `src` ⇒ 卡片裂图 |
| `config.RANK.LB.pollution` / `RANK.MAP.pollution` | 榜位 id 与排序口径（`asc`，越低越好） | 结算写榜时 key 不存在 ⇒ 静默不上榜 |

> ⚠️ **`challengeOnly` 是「多形态开关」（true / string / array）**，判定与文案各有一份，六处必须逐个归一化 ——
> 实装当天 `tech.challengeOnlyReason` 漏了 `typeof co === 'string'`，把 `'waterpollution'` 按**字符**遍历，
> 渲染成「仅限w / a / t / e / r…挑战期间研究」。**完整判据见 `docs/JUDGMENTS.md` 五点三十三**。

---

## 7. e2e 断言（须补）

- 五阶段阈值边界（999/1000、39999/40000、159999/160000、6399999/6400000 各两条）。
- 洁净源（潮汐/太阳能/风场）产热液但 `pollution` 不涨。
- 脏源（五源）按 `pollutionSupply` 涨；星屑树乘区豁免（fission/titancloud 点星屑树后污染不涨）。
- 污染死亡：低 dt 与大 dt（离线）死亡率一致（`1-(1-p)^dt`）。
- 墓地限额内/外死亡→幸福消耗口径正确。
- 医院边际效益曲线到顶 40%。
- 保护区/保护星球/最终手段实际扣 `pollution`。
- 卡片替代关系（绿色运动替代污染治理 / 疾控防治替代隔离病患）。
- 装罐填埋：汽轮机污染 −50% 且吃 5 金属/s。
- **`costBuild` 通道**（奇观扣卫星，对应 §6.1 九处）：
  - ① 卫星 9 级时 `wonderBlocked` 返回「还缺 人造卫星 9/10」；**卫星 0 级时也必须返回非 null**（这是最容易被漏的那条，因为 `lackText` 只查资源，卫星永远"够"）；
  - ② 建成后 `s.lvl.satellite` 精确 −10、`s.res` 无 NaN、`s.lvl` 无负数；
  - ③ `satelliteStop > 新等级` 时被 clamp，`spacecraft` 清单同步减少；
  - ④ 折扣卡（蓝图 / 心胜于物）不改变 `costBuild` 数值；
  - ⑤ **`costTxt` / `costOwnedTxt` 用假 key 必须不抛错**：直接断言 `costTxt({satellite:10})` 不 throw（现在会 `TypeError`）；
  - ⑥ `track-dock` 的 `wonder:` 追踪行在卫星不足时 `ready !== true`（防假绿）。
- **单档结算（§5.5 六接点）**：
  - ① `s.dysonDone` 置真 ⇒ `evaluate()` 通过、`meta.challenges.completed.waterpollution = true`、reward 文本入 `challengeOutcome`、`meta.challengePopupPending` 有值；
  - ② 再打一次：`isReplay` 为真且**不发奖**（`meta.challenges` 不变、星屑乘区不变、`pointMul` 不变）；
  - ③ **读档往返**：`saveMeta → loadMeta` 后 `completed.waterpollution` 仍是 `true`（钉 `state.js:739` 白名单）；
  - ④ **旧档迁移**：构造 `{challengeDone:true, challenge:{id:'waterpollution'}}` 的老 run ⇒ `migrateRun` 后 `challengeDone === true`（钉 `state-migrate.js:29`，否则可重复领奖）；
  - ⑤ `emptyProgress().completed` 含 `waterpollution:false`（钉 `challenges.js:54`）。
- **奖励四条**：①`prestige.stardustGain` 完成前后比值 = 1.10；②`happySupply` 与 tick luxury 毛产出**都**是完成前 1.50 倍且**仍相等**；③`startingPopulation()` 差 2；④**`breakReport().challengePointMul` 从 1.0 → 1.1**（这条是 §5.3 那个"漏写的第 4 项奖励"，必须显式断言，否则它不是"设计"而是"意外"）。
- **幸福消耗三处同源**（对应 §2.1）：造 5 名污染死亡 + 3 座墓地，断言 `happyBurn(s)`、`happyStep` 实扣 `_D`、`rates().luxury` 里的 `D` **三者相等**；再对比"污染死亡 0"的对照档，比值 = `1 + penaltyPct`。⚠️ 只比 `happyBurn` 一条会**恰好漏掉**真实 bug（2026-10-28 《节能减耗》就是这么潜伏 8 天的）。
- **`happyLedger` 五项对齐**（对应 §10 附注，本次一并修）：静态态造 `s.perk.happiness = 2`（**必须非零**，旧断言用 0 所以一直假绿）⇒ ① `happyLedger(s).bonusParts` 含 label「安乐之治」且 `bonus === happyBonusTotal(s)`；② `mechH === SB.economy.happyMech(s)`（1e-9）；③ `pop × per === burn`。挑战周目再加一条：`bonusParts` 含「水体污染」且其值 = `pollutionHappyOffset(s)`，非挑战周目该项为 0 且不出现在 `bonusParts`（非零才入表）。
- **Q 口径**（对应 §2.2）：固定种子、`s.pop = 1` 时连续 10 万步 `pollutionDeaths` 恒 0（人口不为 0）；`s.pop` 从 1 涨到 200 时**同种子同 dt 的每步命中率不随人口变化**（钉「每步掷一次、不按人口放大」）；`dt=1` 与 100 × `dt=0.01` 的累计死亡数差异在二项分布容差内（钉 dt 折算）。
- **R 通用规则**（对应 §5.3 第 4 项）：`breakReport().challengePointMul` 从 1.0 → 1.1（已有，此处只确认它**随本挑战计入**；文案上 `DEFINITION.reward` **不含**这一条，断言字符串里不出现「轮回点」）。
- **S 不补偿**（对应 §6.1）：建奇观后 `s.lvl.satellite` 精确 −10，**且**奇观效果里没有星空项 —— 断言 `starRate(s)` 的变化量 = 仅 −10 级卫星应掉的部分（无额外补偿）。
- **死亡两条时间轴**（对应 §2.3）：同一初始状态，① 走 1× 在线 tick 600 秒；② 走 `integrateFoodPop(s, 600)`。两者 `s.pollutionDeaths` 差值应落在统计容差内（用固定 `SB.rng` 种子 ⇒ 可断言**完全相等**）。⚠️ 只测在线那条 ⇒ 高速/离线不死亡这个 bug 永远测不出来。
- **装罐填埋只削汽轮机**（对应 §1.2）：建 1 座核热厂 + 1 座汽轮机，研究装罐填埋 ⇒ `pollutionRate` 下降幅度 = 汽轮机份额的一半，**不是**总额一半。
- **挑战门控四类**（对应 §6.2）：
  - ① 基游戏（无挑战）：`habitat.unlocked(s, 墓地) === false`、`tech.canStudy(s,'canfill') === false`、`civics.blocked(s, 卫生法令)` 非 null、卡池不含 7 张新卡；
  - ② 水体污染周目：上述四条全部放行；
  - ③ **条件类型**：`tech.condMet(s, {t:'pollution', n:1000})` 在 `s.pollution=999/1000` 两个边界上分别为 false/true；`{t:'pollutionDeaths', n:1}` 同理（钉 §6.2 #7，漏了市政永远灰）；
  - ④ `ai-strategy` 在非挑战周目不会选装罐填埋（钉 `inDrift` 泛化）。
- 非挑战时：pollution 恒 0、pollutionDeaths 恒 0、面板不渲染。
- **老档兼容**：`migrateRun` 后 `pollution/pollutionGross/pollutionDeaths` 均为有限数 0，且 `s.lvl.satellite` 不为负。

---

## 8. 主题反转（已采纳）

Civ6 地热/核电算清洁；本挑战核热厂/泰坦气云站也污染（§1.3）。唯一洁净大源是新增的潮汐/太阳能/风场 + 太阳帆。星屑树乘区豁免 = "投资星屑树拿到的额外热液不污染"。

---

## 9. 数值占位总表

用户已给全部数值（§2/§3/§4）。`k=1`、B（dt 折算）、C（永久累积 + 配额重算）、D~J（命名/医院曲线/叠加/改造金属/奇观/挑战 id/市政阈值）、K（单档 + 三条奖励）、**Q（死亡概率口径）/ R（第 4 项通用奖励）/ S（不补星空）/ 五阶段名（澄海·浊流·赤潮·死区·腐渊）均已定**（2026-11-02 21:27 用户拍）。

⇒ **设计规格已闭合，无待拍项**。唯一遗留是 §10 复核附注里那条 `happyLedger.bonusParts` 既有缺口，已并入本次实装范围（见 §10 附注）。

---

## 10. 决策清单（**全部已定**，保留作实装对照）

| #     | 问题                     | 影响                                  | 建议/选项                                                                                                                          |
| ----- | ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **A** | ~~污染系数 `k` 未给~~ **已定** | —                                   | **k=1**（等值字面 1:1）；阈值 **1000 / 40000 / 160000 / 6400000** 控节奏。⚠️ 原「×40/×4/×40 是否统一」的问题**已随单档作废**：阈值现在只决定 debuff 起点，不再参与评分，不需要等比值 |
| **B** | ~~死亡概率的 dt 折算~~ **已定** | 离线/2× 速下死亡率必须与 1× 一致 | 用 `p_tick = 1-(1-p)^dt`；离线走离线调度器分步                                                                                             |
| **C** | ~~死亡→幸福消耗是否永久累积~~ **已定** | —         | **永久累积**；`happyBurnMul = 1 + 0.3%×min(D,Q) + 3%×max(0,D−Q)`，按当前 Q 重算 ⇒ 扩建墓地时超额部分自动 0.3%（§2.2） |
| **D** | ~~卡片命名不一致~~ **已定** | 同一张卡 | **统一叫「告解圣事」**（"宗教葬仪"是旧稿残留，全文已改；市政 公众墓地 → 解锁 告解圣事） |
| **E** | ~~医院边际效益公式~~ **已定** | 用户拍「15 级到顶」 | `maxLvl = 15`，`p_hosp(L) = 1 − 0.6^(L/15)` ⇒ L=15 恰好 40%，全程递减无空转等级（不用 `1-0.94^L`，那个 9 级就顶到 40%，10~15 级白给） |
| **F** | ~~减死亡率叠加方式~~ **已定** | 用户同意 | `p = p_stage × (1−卡) × (1−医院)`，两卡互斥只取一张；再按 dt 折算（§4） |
| **G** | ~~装罐填埋金属是替代还是额外~~ **已定** | 用户拍「额外」 | 汽轮机**额外**吃 5 金属/s（暖石耗照旧）。⚠️ 全局科技 ⇒ 金属耗随汽轮机数量线性涨（50 台 = 250 金属/s），等于逼玩家削减脏源或转洁净源，需标定时确认金属产能扛得住 |
| **H** | ~~奇观"星球气候调节卫星网"~~ **已定** | 效果 **−15 污染/秒**；造价 引擎200 + 藻仓400 + **卫星10级**（`costBuild` 新通道，§6.1） | 已定 @2026-11-02 20:32 |
| **I** | ~~挑战 id/name~~ **已定** | — | **id `waterpollution`，名称「水体污染」**（旧稿 `ocean` 弃用） |
| **J** | ~~市政解锁阈值与新阶段阈值不同步~~ **已定（2026-11-02 用户拍「要改」）** | 三条解锁条件已改为 `≥40000 / ≥160000 / ≥6400000`，与阶段 2/3/4 对齐 | 无需再议                                                                       |
| **K** | ~~挑战档位~~ **已定：改单档**（2026-11-02 20:47） | 三档评分 + 比例法整体作废 | `kind:'单次挑战'`、`goal:{t:'dyson'}`、单档奖励 星屑+10% / 商人奢侈+50% / 初始人口+2（§5） |
| **Q** | ~~污染死亡概率的口径~~ **已定（2026-11-02 21:27 用户拍）** | 死亡速度量级 | **整个人口每步掷一次、最多死 1 人**（"每秒 X% 概率死亡 1 人口"按字面），概率按步长换算 `1−(1−pBase)^dt`，**不随人口数量放大**；`s.pop > 1` 才掷、人口最低 1 不降到 0（与饥荒/冻伤同护栏）。§2.2 已按此写死 |
| **R** | ~~第 4 项奖励：轮回点获取 +10%~~ **已定：保留**（2026-11-02 21:27 用户拍） | `completedCount()` 自动计入新挑战 ⇒ `pointMul` 1.0 → 1.1 | **保留**，定性为「挑战完成后轮回点获取 +10%」的**通用规则**：写进共享规则与 e2e 断言（`breakReport().challengePointMul`），**不进本挑战 `reward` 文案**（§5.3 第 4 项）。不引入 `noPointBonus`，与另外 6 项口径一致 |
| **S** | ~~拆 10 级卫星掉掉的星空要不要补~~ **已定：不补**（2026-11-02 21:27 用户拍） | 卫星每级 +5 星空/s 被 `costBuild` 扣掉 | **不补偿**：星空损失是"消耗 10 级卫星"这个建造成本的组成部分，也是"先攒够余量再建"的决策来源。奇观效果维持「污染 −15/s」一条，不加星空 |
| **T** | ~~五阶段名称~~ **已定：澄海 / 浊流 / 赤潮 / 死区 / 腐渊**（2026-11-02 21:27 用户拍） | 面板与阶段判定 | 0 澄海 `<1k` · 1 浊流 `≥1k` · 2 赤潮 `≥40k` · 3 死区 `≥160k` · 4 腐渊 `≥6.4M`（§2） |

---

### 复核附注（`happyLedger` 既有缺口 —— **已获用户批准，并入本次实装范围**）

**问题（2026-11-02 复核发现，非本挑战引入，但必须一起修）**：`happyLedger.bonusParts`（`economy.js:2587`）只列 **4 项**幸福偏移（政体 / 王国大交易所 / 政策卡 / 天穹钻机），而 `happyStep` 的 `_gb`（`economy.js:2388`）与 `happyBonusTotal`（`economy-social.js:28`）都是 **5 项** —— 少的是 `s.perk.happiness`（星屑树「安乐之治」）。

**症状**：买了安乐之治后，`mechH = H − bonus(4项)` 比 `happyMech(s) = H − happyBonusTotal(5项)` 多出 `perk.happiness` ⇒ 面板摆的「人口 × 每人 = 耗」对不上实际扣费（`netNeed` / `toNext` 同样偏）。**结算侧是对的**（`happyBurn` 走 `happyMech`），错的是面板读数。

**为什么必须一起修**：本挑战要往同一张表加第 5 项（污染偏移「水体污染」）。不先补齐第 5 项就加第 6 项，等于**把同一个形态再复制一遍**，且新增的 e2e「面板 mechH == happyMech(s)」在玩家点了安乐之治后必红。

**改法（1 行 + 1 条断言）**：

```js
var bonusParts = [
  { label: '政体', v: SB.civic ? SB.civic.govHappyBonus(s) : 0 },
  { label: '王国大交易所', v: SB.wonder ? SB.wonder.happyBonus(s) : 0 },
  { label: '政策卡', v: SB.civic ? SB.civic.cardHappyOffset(s) : 0 },
  { label: '天穹钻机', v: SB.wonder ? SB.wonder.skydrillHappyOffset(s) : 0 },
  { label: '安乐之治', v: (s && s.perk && s.perk.happiness) || 0 },   // ← 补这一行，与 happyBonusTotal 第 5 项同源
  { label: '水体污染', v: pollutionHappyOffset(s) }                    // ← 本挑战新增，仅挑战周目非零
];
```

- ⚠️ **顺序无关、项数必须等**：`bonus` 是求和、`bonusParts` 是非零明细，`mechH = H − bonus` 只依赖总和 —— 但**项数不等本身就是 bug**（少一项 ⇒ 总和少、mechH 偏大）。加污染项时三处（`_gb` / `happyBonusTotal` / `bonusParts`）**必须同批改**（§2.1）。
- `ui/render-common.js:17` 的 `HAPPY_BONUS_LABELS` **不需要动**：它是「各页就地说明」的 label→来源映射，只有 政体/奇观/卡/钻机 四页有这种说明位；安乐之治与污染偏移由族民页的幸福面板汇总行（`happyPanelHTML` 直接遍历 `bonusParts`）展示。
- **e2e 断言（本次一并补，见 §7）**：造 `s.perk.happiness = 2` 的静态态 ⇒ `happyLedger(s).mechH === happyMech(s)`（1e-9），且 `pop × per === burn`。**旧断言（`ui-accessibility.mjs:504`）只用 `perk.happiness = 0` 的夹具，所以一直假绿** —— 新的那条必须显式设成非零，否则测不到这个缺口。

---

*文档版本：DRAFT v11（2026-11-02 21:27 · 用户拍定 Q/R/S + 阶段名，设计闭合）。  
v11 变更：**①Q 定案**（整个人口每步掷一次、最多死 1 人、按步长换算、不随人口放大）**②R 定案**（保留「挑战完成后轮回点获取 +10%」通用规则，写进共享规则与 e2e，不进 `reward` 文案）**③S 定案**（不补偿拆卫星掉的星空，属建造成本）**④阶段名定案**（澄海 / 浊流 / 赤潮 / 死区 / 腐渊）**⑤§10 附注：`happyLedger.bonusParts` 缺 `s.perk.happiness` 从「范围外」升为「本次一并修」**（1 行 + 1 条 e2e，说明为什么必须同批改）**⑥§7 e2e 增四条**（五项对齐 / Q 口径 / R 通用规则 / S 不补偿）。  
**设计已无待拍项。实装须用户明确说"开始动代码"。** *
