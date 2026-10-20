# ERA9 科技树规格 v0.2（纠正版 · 2026-10-19）

> 本文件取代 `ERA9_GEEK_SPEC_v0.1.md`（已标作废）与上一版 `ERA9_TECHS_SPEC_v0.1.md`（v0.1 不含 G.E.E.K）。
> 全部按用户 2026-10-19 给的权威表格重核，所有代码 id 已落地核对（核热厂=`fissionplant`、火箭引擎=`rocketEngine`、θ生物金属=`thetaMetal`、θ金属自适应薄膜=`thinafilm`、星空探索=`starExplore`/`STAR_CAP`、星际政治=`space_politics`）。
> **未改任何游戏代码。**

---

## 0. 我前面错在哪（逐条认错，避免再看错）

| # | 我之前的错误理解 | 实际正确（按权威表） |
|---|---|---|
| ① | G.E.E.K 是「星球改造(terraform) 免费送的建筑 / 任务奖励」 | G.E.E.K 是**生态重塑(ecological_restoration) 的 unlock1 奇观**；星球改造(terraform) 只负责「解锁启动泰拉」 |
| ② | "消耗回到三级之前" = 白送 +3 虚级（抄大潮纹馆 libBonus） | **完全反了**。这是一道**建筑升级花费削减**：把覆盖建筑的有效造价等级往下偏移（Rhea −3 / Terra −5），不是加等级 |
| ③ | 太阳帆 = 星海区可手动建造的建筑（+0.05 热液能/秒） | 太阳帆是**星图上的进度累加器**，不是建筑。由欧罗巴冰面发射场每运行 10s 推进 +1 进度；**每个太阳帆 +0.1 热液能/秒** |
| ④ | 核聚变 = 全体热液能 ×1.10/+0.15 乘区 | 核聚变是**针对核热厂单体**：铀耗 ×2、热液能产出 ×5（`s.techs.nuclear_fusion` 读位，economy 核热厂两处算式各乘） |
| ⑤ | 欧罗巴冰面发射场 = 母星产燃料建筑 | 它是**发射台**：每 s 耗 0.1 强工质火箭引擎 + 0.1 θ金属自适应薄膜 + 2 热液能；**正常运行 10s 后给星图 +1 太阳帆进度** |
| ⑥ | 强工质火箭引擎只作建筑造价 | 它先是被**工艺制造**出来（行星际航行解锁：燃料 500 + 10 θ金属 → 1），再作 mars_workshop / europa_launch / sun_sail 的造价或耗料 |

---

## 1. 9 科技完整规格（按权威表逐列）

> 通用：纪元九整簇尤里卡门槛 = `eraTechs{8, 9}`（纪元八 9 个科技全掌握 ⇒ ERA9 整簇可研究；见 tech.js:230 `eraTechs` 条件）。每科技各自还有下面 `cond` 单行门。

| 名称 | id | 前置 `reqs` | 尤里卡 `cond` | Layer | 解锁1（`eff` / `unlockBuild` / `unlockRes` / `unlockWonder`） | 解锁2 |
|---|---|---|---|---|---|---|
| 核聚变 | `nuclear_fusion` | `nanotech` | `{t:'built', b:'fissionplant', n:3}` 核热厂≥3级 | 1 | 核热厂：**铀耗 ×2、热液能产出 ×5**（`eff` 读 `s.techs.nuclear_fusion`，economy 核热厂供给侧 ×5、铀耗 ×2） | — |
| 生态重塑 | `ecological_restoration` | `gascloud`, `nanotech` | `{t:'starPct', n:50}` 星空探索>50% | 1 | **奇观 G.E.E.K**（unlockWonder） | 自然环境进度 UI：瑞亚星改造 30min → 覆盖建筑**成本回到 L3 之前** |
| 行星际航行 | `interplanetary` | `nanotech`, `protoai` | `{t:'gathered', r:'rocketEngine', n:500}` 累计产火箭引擎>500 | 1 | **工艺：强工质火箭引擎**（unlockRes `strongProp`；配方 燃料500+10θ金属→1） | **所有异星建筑每级 +5% 星空探索速度** |
| 超远距微波加热 | `microwave_heat` | `interplanetary` | `{t:'starPct', n:75}` 星空探索>75% | 2 | **建筑：欧罗巴冰面发射场** `europa_launch`（每 s 耗 0.1 strongProp+0.1 thinafilm+2 hydro；跑 10s→星图 +1 太阳帆） | **星图太阳帆进度：每 1 帆 +0.1 热液能/s** |
| 大型异星工程 | `alien_eng` | `ecological_restoration` | `{t:'lvlSum', ids:['rheamine','titancloud','mars_workshop'], n:20}` 异星建筑总等级>20 | 2 | **建筑：马尔斯工造中心** `mars_workshop`（造价 160θ金属+10 strongProp；产出 钛 + 钛合金板） | — |
| 黑历史蓝图 | `blackhistory` | `interplanetary` | `{t:'cycle', n:15}` 轮回次数>15 | 2 | **工艺效率 +120%**（eff `workshopEff:1.2`） | — |
| 星球改造 | `terraform` | `alien_eng` | `{t:'geekRhea'}`（**新 cond**：完成瑞亚星改造） | 3 | 可启动**泰拉**星球改造（需启动星球重构机 G.E.E.K） | 泰拉 1h → 覆盖建筑**成本回到 L5 之前** |
| 行星际快速物流 | `interlog` | `microwave_heat` | `{t:'civic', id:'space_politics'}` 完成星际政治市政 | 3 | **异星建筑产出 +20%**（eff `alienOutMul:0.2`，与星际物流网 ×1.3 加算） | — |
| 严冬计划 | `winter` | `blackhistory` | `{t:'challenge', id:'drift_terra'}`（**新 cond**：进入挑战流浪泰拉） | 3 | 暂时占位 | — |

> `built`/`starPct`/`gathered`/`lvlSum`/`cycle`/`civic` 六种 cond **代码已存在**（tech.js:183-329）。只有 `geekRhea` 与 `challenge`（entered）需要**新增 cond 分支**（见 §6）。

---

## 2. 新资源：强工质火箭引擎 `strongProp`

- `RESS.strongProp`：`kind:'craft'`、无 CAP（与 thinafilm / rocketEngine 同纪律）、`unlock:{tech:'interplanetary'}`。
- 工艺配方 `craft_strongprop`：`in:{rocketFuel:500, thetaMetal:10}`、`out:1`、`res:'strongProp'`、`need:'interplanetary'`。
- 用途三处：① mars_workshop 造价（10 个）；② europa_launch 每 s 耗 0.1（运行耗料）；③ 太阳帆载体（由 europa 每 10s 推进 1 帆，europa 自身运行耗它）。

---

## 3. 新建筑：马尔斯工造中心 `mars_workshop`

- 分区 `space`（星海区，与 rheamine/titancloud 同档）；`ratio:1.5`（align ERA8 异星建筑）；`cost:{thetaMetal:160, strongProp:10}`；`requiredTech:['alien_eng']`。
- 产出（**用户未给速率，以下为建议值待拍**）：每级 `tiplate +3/s` + `titanium +2/s`（对标 rheamine 石梁2.5/硬珊瑚2.5、titancloud +6hydro/+5fuel；马尔斯定位"在地制造"，不带 hydro/fuel）。
- 计入"异星建筑总等级"（`lvlSum` 的 ids 已含 `mars_workshop`），并吃 `alienOutMul`（行星际快速物流 +20%）与"每级 +5% 星空探索速度"（行星际航行解锁2）。

---

## 4. 新建筑：欧罗巴冰面发射场 `europa_launch`

- 分区（待拍）：母星制造区更合理（用户说欧罗巴是母星、不算异星 ⇒ **不进 lvlSum**）。
- 运行耗料（每 s）：`strongProp 0.1` + `thinafilm 0.1`（库存扣，非 flow）+ `hydro 2`（flow，走 hydroAlloc 链、断流停耗）。
- **进度机制（新类型）**：正常运行累计满 **10s** ⇒ 星图 `sun_sail` 进度 +1（累加器，非资源库存）。缺料/断流时计时暂停、不清零（与 G.E.E.K 同口径）。
- 这是太阳帆的**唯一来源**；太阳帆本身不是建筑，是星图累加器（见 §5）。

---

## 5. 新星图累加器：太阳帆 `sun_sail`

- 挂在星图（star-map-frame.html / render.js 推送通道），与 `starExplore` 同级但**性质不同**：它是"热液能增益累加器"，不是终局进度资源。
- 每 1 帆 +0.1 热液能/s（进 hydro 供给侧，economy `hydroFlow` 加 `sunSailRate = sun_sail * 0.1`）。
- 来源：欧罗巴冰面发射场每运行 10s → +1。
- ⚠️ **平衡硬坑（必须拍）**：若 europa_launch 可无限建、每座 10s→+1 帆、每帆+0.1hydro 且无上限，则 hydro 会无限涨。需封顶（方案：太阳帆进度上限 N 帆 / 或 europa 建造数量上限 / 或单座 europa 帆进度封顶）。**用户未给上限，我先标为待拍，不擅自定**。

---

## 6. 奇观 G.E.E.K（星球重构机）

- **解锁**：`ecological_restoration` 的 `unlockWonder:'geek'`（不是 terraform，纠正①）。
- **造价**：`{thetaMetal:1000, steel:4000, iron:6000, coral:10000, kelp:10000}`（精铁=`iron`，已核对）。
- **运行态（抄天穹钻机）**：启动后每 s 耗 `hydro 40`（flow，hydroAlloc 加 `geekHydroDraw=40`）+ `kelp 500` + `metal 100` + `coral 100`（库存，扣费先于置位、失败一分不扣）。缺料暂停、进度保留。
- **进度与 UI**：在**自然环境卡**（render-environment.js）显示进度条 + 文案「瑞亚星星球改造」。瑞亚耗时 = 游戏内 **1800s**（受 10× 加速/离线影响，与天穹钻机同口径）。完成后 `s.geek.rheaDone=true`。
- **第二次改造（泰拉）**：研究 `terraform` 后可在 G.E.E.K 启动泰拉；耗时游戏内 **3600s**（1h）；完成后 `s.geek.terraDone=true`。
- **两个新 cond**：
  - `geekRhea`：`s.geek && s.geek.rheaDone`（星球改造的尤里卡）。
  - `challenge`（entered）：见 §8 注。

---

## 7. ★ 核心纠正：成本削减机制（"消耗回到三级/五级之前"）

> 这是纠正②。它**不是**加等级、不是虚级，而是一道**升级花费削减**。

- **覆盖建筑**（四类，按用户原话）：
  - 人口建筑：`nest` / `coralhouse` / `tenement`（*`castle`→`hall` 无独立 lvl 键，是否计入待拍*）
  - 速生珊瑚林：`coralfarm`
  - 矿井：`siltpit` / `furnace`
  - 生息区：`kelp` / `weir` / `warmnest`
- **机制**：`s.geek.costOffset`（Rhea 后 =3，Terra 后 =5）。在建筑升级花费函数里，覆盖建筑的有效造价等级 = `max(0, n - costOffset)`。
- **落点**：`economy.js:421 costOf(s,id)` → L470 `Math.pow(b.ratio, n)` 改为对覆盖 id 用 `Math.max(0, n - (s.geek&&s.geek.costOffset||0))`。
- **效果**：只让这些建筑**未来升级更便宜**；**不**改当前等级、**不**抬高/压低建筑总级数、**不**动产出读数（economy 零改动，面板天然一致）。与"大潮纹馆虚级"完全是两回事——大潮纹馆是+效果级，这是−造价级。
- ⚠️ **待拍**：Terra 是「回到 L5 之前」**替换** Rhea（偏移=5，更便宜）还是**叠加**（偏移=8）？我按**替换（偏移 5）**理解，请你确认。

---

## 8. 新挑战：流浪泰拉 `drift_terra`（占位）

- `challenges.js` 现有 cold/small/science/abyss 四挑战；加 `drift_terra` 占位（骨架照抄、effect 留空/占位常量）。
- `winter` 尤里卡 = `{t:'challenge', id:'drift_terra'}`（**新 cond**，查"已进入"）。
- ⚠️ **待拍**：挑战系统目前只记 `meta.challenges.completed`（challenges.js:40），无"已进入/进行中"状态。"进入流浪泰拉"是按**已开始挑战**还是**已完成**？若按"已开始"需新增 entered 标志；若按"已完成"可直接复用 completed。我倾向按"已开始"（进入即解锁 winter），但需你拍。

---

## 9. ERA9 元数据 + prestige 权重回填

- 纪元九：`id:9`、`name:'光帆纪'`、`motto:'以光为帆'`、`color:'#FFC857'`、`glyph:'九'`、`key:false`（终局无 key，靠星图/星空线收尾，与 era7/era8 同口径）。
- `prestige.js` 的 `META_ERA` 只到 era5、`W` 权重只到 5。**ERA6–9 星海/新建筑必须回填** `W[6/7/8/9]`（建议顺 1/2/3/5/8 → 13），否则破壳结算 `buildingScore` 静默跳过这些建筑（`if(!e) continue`）。era6–8 星海建筑（satellite/spacestation/rheamine/titancloud 等）也还没登记，属历史欠账，一并回填。

---

## 10. 待用户拍的点（落码前必须定）

1. **mars_workshop 产出速率**：用户未给数字 → 我提议 `tiplate +3/s` + `titanium +2/s`（待拍）。
2. **成本偏移 Terra 语义**：替换（偏移 5）还是叠加（偏移 8）→ 我按替换（偏移 5）。
3. **人口建筑是否含 castle/hall**：用户说"人口建筑"，我列 nest/coralhouse/tenement；hall 是否算入待拍。
4. **太阳帆上限**：无限铺 europa→无限 hydro 的平衡坑 → 用户未给，必须拍（封顶 N 帆 / europa 数量上限 / 单座帆进度封顶 三选一）。
5. **挑战"进入"语义**：已开始 vs 已完成（影响 `challenge` cond 实现）。
6. **europa_launch 分区**：母星制造区（不算异星，不进 lvlSum）vs 星海区 → 我按母星区。

> 确认以上 6 点（或回"按你建议的来"）后，我再落码、跑 e2e 三连。G.E.E.K 仍是工作量最大的一块（运行态+进度+缺料暂停+自然环境 UI+成本削减注入 costOf），但结构上已和你其他科技解耦，可最后单独做。
