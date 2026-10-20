> ⚠️ **本文件已作废（2026-10-19）** —— 我对 G.E.E.K 的理解从根上错了（把"消耗回到三级之前"读成"白送三级虚级"、把太阳帆当建筑）。正确且完整的规格见 **`docs/ERA9_TECHS_SPEC_v0.1.md`（v0.2 纠正版）**。本文件不要再照着落码。

# ERA9 · G.E.E.K（星球重构机）奇观机制规格 v0.1（作废）

> 状态：已作废。正确规格见 ERA9_TECHS_SPEC_v0.1.md v0.2。

## 0. 纠正记录（先厘清概念，避免再错）

- **大潮纹馆 ≠ G.E.E.K**。`wonder_great_library`（ERA2 奇观，config-content.js:665）是独立的，"虚级 +3（升级消耗不变）"的先例（`libBonus`，wonder.js:148）。G.E.E.K 借用它的**虚级模式**，但不是同一座。
- **运行态 + 进度 + 缺料暂停的模板来自天穹钻机** `wonder_skydrill`（`shell.js` tickShell block② + `skydrillOn`/`skydrillStarved`/`skydrillRun` 状态位 + `input.toggleSkydrill` + `renderDrill`），不是大潮纹馆。
- **G.E.E.K 在代码里完全不存在**，是待建 ERA9 奇观。
- 前一轮 P1「大型异星工程直接发三级建筑」理解**作废**：那座"三级建筑"就是 G.E.E.K 本身，触发链是「建好 → 启动 → 跑 30min → 给覆盖建筑 +3 虚级」，不是某科技直接送建筑。

## 1. 基本属性

| 字段 | 值 |
|---|---|
| id | `wonder_geek` |
| name | 星球重构机（用户称 G.E.E.K） |
| era | 9 |
| 解锁 | `need: 'terraform'`（星球改造科技，ERA9；**terraform 实装前临时放开解锁以便测试**，不在生产判定里留死锁） |
| cost | `{ thetaMetal: 1000, steel: 4000, iron: 6000, coral: 10000, kelp: 10000 }` |
| 形态 | 买断制（wonder 纪律①：建一次永久，无重复购买） |

**资源 id 核对（config-content.js，无误）：**
- θ金属 = `thetaMetal`
- 钢 = `steel`
- 精铁 = `iron`（config-content.js:49：`iron: { name: '精铁' }` —— 注意精铁不是独立 id，就是 `iron`）
- 珊瑚 = `coral`
- 藻食 = `kelp`

## 2. 运行态（抄天穹钻机）

新增状态位（state.js，`s.geekOn / s.geekRun / s.geekStarved`，migrate 给默认值）：
- `geekOn`: 启动开关，默认 `false`。
- `geekRun`: 进度累积（游戏秒），默认 `0`。**缺料暂停不清零**（与钻机 `skydrillRun` 同口径）。
- `geekStarved`: 缺料停摆位，默认 `false`。
- `geekDone`: 完成位（或判定 `geekRun >= GEEK_DURATION`），默认 `false`。

**启动/停机**：`input.toggleGeek`（抄 `toggleSkydrill`）—— 自然环境卡按钮，闸门 = 奇观已建成且未 `geekDone`。

**每 tick 结算**（挂在 game.js 在线泵 / `shell.tickShell` 之后，抄钻机 block；flow 模型已就位）：
1. 热液能：仅 `geekOn` 且未 `geekDone` 时，从本 tick 剩流取 `GEEK_HYDRO = 40`（flow，不进库存）。抄 `hydroAlloc` 取流段（`skydrillOn → skyDraw` 同口径）。
2. 库存消耗（非 flow，从 `s.res` 扣，抄工坊"扣费先于置位、失败一分不扣"）：每秒 `GEEK_KELP=500` 藻食 + `GEEK_IRON=100` 金属 + `GEEK_CORAL=100` 珊瑚。
3. 缺料判定：热液能剩流 < 40 **或** 库存任一不足当秒扣 ⇒ `geekStarved = true`、本 tick **不扣料、不累积进度**。补料后自动继续（`geekStarved` 复位），`geekRun` 不清零。
4. 进度：料足且 `geekOn` ⇒ `geekRun += dt`（游戏内秒，受加速/离线影响）。`geekRun >= GEEK_DURATION(1800)` ⇒ 置 `geekDone`，运行态结束（停耗、停扣），虚级永久生效（§3）。

## 3. 完成效果：虚级 +3（用户定 A，同 libBonus）

新增 `wonder.geekBuildingBonus(s, id)`：若 `owned(wonder_geek)` 且 `geekDone` ⇒ 返回该建筑 `+3`，否则 `0`。

**覆盖建筑（用户拍四类全选，按代码真实 id）：**
| 类别 | 建筑 id | 备注 |
|---|---|---|
| 人口建筑 | `nest` / `coralhouse` / `tenement` | `castle` 实为 `hall` 升级形态、无独立 `lvl.castle`（已删归 hall）→ **映射 `hall`**，待确认是否计入人口上限 |
| 速生珊瑚林 | `coralfarm` | |
| 矿井 | `siltpit` / `furnace` | furnace 的虚级+3 同时让运行炉座数 +3（白送产能），与 furnaceStop 停用座数交互需特判 |
| 生息区其余 | `kelp` / `weir` / `warmnest` | |

**实现（虚级框架）：** 集中函数 `effLvl(s, id) = (s.lvl[id]||0) + geekBuildingBonus(s, id)`（仅对覆盖建筑生效；其余建筑直读 `s.lvl`）。economy / civics 相关读数点改读 `effLvl`。

**A 方案影响点清单（≈10-12 处跨 4 文件，每处改读 `effLvl`，并保面板===结算 tick/rates 两路）：**
| 建筑 | 读数点（现读 `s.lvl.xxx`） | 文件 |
|---|---|---|
| 人口 nest/coralhouse/tenement（+hall 含 castle） | `economy.js:97-101` popCap | economy |
| 速生珊瑚林 coralfarm | `economy.js:661` coralFarmMul | economy |
| 矿井 siltpit | `economy-rates.js:62` + `economy-tick.js:92` | rates / tick（两路） |
| 矿井 furnace | `economy.js:961 / 992 / 1032` ironFlow（含 `furnaceStop`：`effLvl(furnace) - furnaceStop`） | economy |
| 生息区 kelp | `economy.js:859` + `economy-rates.js:168` + `economy-tick.js:260` | economy / rates / tick |
| 生息区 weir | `economy.js:870` | economy |
| 生息区 warmnest | `civics.js:128` + `economy.js:842` | civics / economy |

**A 的代价 / 收益：** 不进 `s.lvl` ⇒ 不污染 `lvlSum`（建筑总级数合计类鼓舞不被虚增）、不抬高 `need` 判定、后续手动升级花费**绝对不变**（满足「升级消耗不变」字面）。代价 = 上述读数点改动 + 回归风险。

## 4. UI（自然环境卡）

`render-environment.js` 新增 `renderGeek`（抄 `renderDrill`），挂在 `#env` 折叠卡（与钻机行同位置/邻近）。三态：
- 未建成：不显示。
- 已建成未启动：显示「星球重构机」+ 启动按钮 + 说明「开启后持续消耗 热液能40/s · 藻食500/s · 金属100/s · 珊瑚100/s」。
- 运行中：显示「**瑞亚星星球改造**」进度条 + 百分比（`geekRun / GEEK_DURATION`）+ 状态（运转中 / 缺料暂停）+ 当秒消耗明细。
- 已完成：显示「瑞亚星星球改造 完成」+ 已生效的 +3 虚级覆盖建筑清单。

进度条复用现有 progress 样式；状态签名节流（抄 `renderDrill` 的 sig，避免每帧重写 DOM）。

## 5. 数值常量（config.js `CFG`）

```
GEEK_HYDRO:  40,    // 热液能流 / 秒（flow）
GEEK_KELP:   500,   // 藻食 / 秒（库存）
GEEK_IRON:   100,   // 金属 / 秒（库存）
GEEK_CORAL:  100,   // 珊瑚 / 秒（库存）
GEEK_DURATION: 1800, // 30 游戏分钟（游戏内秒，受加速/离线影响）
GEEK_BONUS:  3,      // 虚级级数
```

## 6. e2e 断言草案（sim/e2e.mjs 新增 G.E.E.K 组）

1. 建造消耗命中 5 资源（cost 字段核对）。
2. `geekOn` 启动后 `rates().hydro` 反映 −40（与钻机同口径，面板===结算）。
3. tick 后库存 `kelp/iron/coral` 按 500/100/100 减少（料足时）。
4. 缺料（任一库存见底或热液能剩流 < 40）⇒ `geekStarved=true` 且 `geekRun` 不增。
5. 补料 ⇒ 自动继续，`geekRun` 累积且不清零。
6. `geekRun` 达 1800 ⇒ `geekDone`，虚级生效：`popCap` 等读数含覆盖建筑 +3×GEEK_BONUS。
7. tick / rates 两路同式（面板===结算）。

## 7. 待用户拍 / 待定

- **解锁条件**：最终绑 `terraform`（待 ERA9 科技实装）；实装前临时放开以便测试，不留死锁。
- **castle → hall 映射**：`castle` 无独立 `lvl`，虚级+3 落到 `hall`；当前 `popCap`（economy.js:97-101）**不计 hall/castle**（只算 nest/coralhouse/tenement）。是否要把 hall 纳入人口上限虚级，待确认（默认：覆盖建筑清单含 hall 即 +3 虚级，但 popCap 公式若不读 hall 则无效果——需同步改 popCap 或明确 castle 不算人口建筑）。
- **ERA9 其余**：9 科技 / 马尔斯工造中心(P7①) / 欧罗巴发射场 / 强工质资源 / 太阳帆(P3) / 流浪泰拉挑战占位(P6) / 纪元九元(P7④) 待 `ERA9_TECHS_SPEC` 定稿后一并实装。本奇观不硬依赖它们（仅依赖解锁科技 terraform）。

## 8. 实装文件清单（确认后）

`config-content.js`（wonder_geek 定义）· `config.js`（CFG.GEEK_*）· `state.js`（3 状态位 + migrate）· `shell.js` 或 `economy.js`（运行态结算）· `wonder.js`（geekBuildingBonus + 导出）· `economy.js`（popCap/coralFarmMul/ironFlow/kelp/weir/warmnest 改 effLvl）· `economy-rates.js` + `economy-tick.js`（siltpit/kelp 两路）· `civics.js`（warmnest）· `input.js`（toggleGeek）· `render-environment.js`（renderGeek + index.html 容器）· `sim/e2e.mjs`（断言组）· `assets/wonders/icons-demo-v1/geek.png`（占位图标）。
