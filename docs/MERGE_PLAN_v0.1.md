# 渊海天壳 TIDEBREAK · 合并方案 v0.1（**未执行，等定稿**）

> 状态：**本文件只是盘点与提案，一行代码都没动。**
> 生成时间：2026-09-25

---

## 0. 为什么会有两份

`D:/shellbreak` 与 `D:/tidebreak` 是**同一份游戏的两半**，不是两个项目。

- `shellbreak` 有**天壳**——破冰循环、破壳系数、洋流点、周目。即第一阶段终极目标。
- `tidebreak` 有**文明6式科技树**——44 项科技数据表 + 节点图渲染。

缺任何一份都成不了一个完整的游戏。此前把两者当作平行项目在比，是判断错误。

---

## 1. 现状盘点（代码级实测）

### 1.1 D:/shellbreak — 1402 行

```
index.html (?v=3)   css/main.css
src/  config.js 217 · state.js 88 · economy.js 161 · shell.js 108
      habitat.js 90 · folk.js 85 · prestige.js 102 · game.js 191
      main.js 13 · ui/render.js 284 · ui/input.js 63
sim/  load-sb.mjs · balance.mjs · e2e.mjs · speed-probe.mjs
docs/ PHASE1_DESIGN.md（仅此一份）
```

| 系统 | 实现 |
|---|---|
| 天壳 | `ICE_SHELL 200000`，自动削壳下限 `0.25` |
| 破壳系数 | `0.26·pop^0.62 + 0.14·lvl^0.72 + 0.80·科技数 + 1.30·祭坛级`（冰封期 ×1.35） |
| 自动削壳 | `0.40 × 系数` 点/秒，削到 25% 停手 |
| 祭坛削壳 | `1.10 × 级` 点/秒；耗地热 `0.55 × 级 ×(1+0.35×(级−1))`/秒 |
| 地热产出 | `热泉井级 × 0.010 × 匠人数 × 环境系数 ×(点火术 1.4)` |
| 资源（7） | `kelp` 菌毯 · `coral` 珊瑚 · `silt` 矿砂 · `bone` 骨材 · `iron` 精铁 · `science` 科技 · `fuel` 地热 |
| 职业（3） | `gather` 采集者 · `craft` 匠人 · `scholar` 学者 |
| 建筑（10） | 深海菌圃 / 礁石平台 / 珊瑚巢 / 砂矿坑 / 骨材工坊 / 熔炉 / 聆听巢 / 取暖石 / 热泉井 / 破冰祭坛 |
| 科技（8） | `calendar` `heat` `bonework` `smelt` `pick` `ignition` `dive` `siegeT` |
| 解锁机制 | `defaultUnlockable` / `unlockRatio` / `unlockScheme` / `requiredTech` 四种 |
| 主循环 | `game.js` 直接持有 `S`；`economy.tick` 七步内联（采集→加工→地热→科技→口粮→生育→冻伤→天壳） |
| P1 新增 | `weir` 喷口导流堤（菌毯 +3%/级）· `warmnest` 保温巢（口粮 −2%/级，封顶 −60%）· `ballast` 压舱仓（菌毯上限 +800/级） |
| 回归 | `balance 6/6` · `e2e 44/44` |
| README 基线 | rational 10.65h / rush 9.80h / e2e 10.42h / 峰值 54 人 / 建筑总级 365 / 破壳系数 73.4 |

### 1.2 D:/tidebreak — 1353 行

```
index.html   css/main.css   visual-proto.html (22375)
js/  config.js 67 · data.js 361 · state.js 75 · actions.js 275
     render.js 444 · game.js 76 · main.js 55
sim/ load-tb.mjs · balance.mjs · e2e.mjs · perf-probe.mjs · _probe.mjs.js ⚠残留
docs/ 11 份（DESIGN v0.1~v0.3 · ERA_OVERVIEW v0.1~v0.2 · EUROPA_SETTING · TECH_TREE v0.1~v0.2 · WAR_TERRITORY · ART_VISION）
```

| 系统 | 实现 |
|---|---|
| 开局 | `pop 1` / `jobs {gatherer:1}` / `res {mat:0}` / `buildings {}` —— 资源全空 |
| 手动采集 | `+1 菌毯/次`，间隔 ≥120ms |
| 人口 | 每 20s +1；`popCap` 与 `pop` 是两个独立量 |
| 研究 | `0.5 /学者/秒`；`scholarUnlockTech: 'writing'` |
| 两极耦合 | 产能 ∝ `min(上极 10, 下极 8) = 0.8`，任一侧见底全文明停摆 |
| 科技（44） | era 1–4 × 三支（survive 生存 / live 生计 / know 求知） |
| 科技字段 | `id · name · era · cost · branch · free · reqs · cond · eff · note` |
| `cond` 类型 | `{t:'built', b:'guildHall', n:2}` / `{t:'expedition', n:1}` |
| `eff` 类型 | `gatherPct` `researchPct` `matCap` `shellPct` `globalPct` |
| 节点图 | `TW=154 TH=96 GAP=30` 定宽高网格；`layout()` 算前置深度、`edgePath()` 画连线、`nodeHTML()` 四态（`?`占位 / 可研究 / 条件未满足 / 已完成）、`focusEra()` 聚焦纪元 |
| 脏标记 | `techSig / bldSig / jobSig / resSig` 分别合并 |
| 铁律 | **渲染不得改状态；状态变更只走 `actions.*`** |
| 回归基线 | 理性 756s 全清暗流纪 / 激进 1104s / 新手 1046s |

---

## 2. 冲突清单（合并必须先解掉）

| # | 项 | shellbreak | tidebreak | 严重度 |
|---|---|---|---|---|
| 1 | 破壳系数科技项 | `0.80/项`，8 项 = +6.4 | 无此项 | **🔴 炸** |
| 2 | 科技量级 | 8 项扁平数组 | 44 项带 era/branch/cond/eff | 🔴 |
| 3 | 科技效果 | 只存布尔 `s.techs[id]`，无效果 | `eff` 是死数据，未接线 | 🔴 |
| 4 | `cond` 判定 | 无 | 定义了「建 N 座」「远征 N 次」，无处判定 | 🟠 |
| 5 | 食物 id | `kelp` | `mat` | 🟠 名字同为「菌毯」 |
| 6 | 开局 | pop3 + coral60（部分资源非 0） | pop1 + 全空 | 🟠 |
| 7 | 职业 id | `gather`/`craft`/`scholar` | `gatherer` | 🟠 |
| 8 | 科技 UI | `paneTech` 文字列表 | Civ6 SVG 节点图 | 🟠 |
| 9 | 架构 | `game.js` 持 `S`，`economy.tick` 内联七步 | `actions.*` 单一入口 | 🟡 |
| 10 | 资源集 | 7 种全开 | 1 种，其余「未解锁」 | 🟡 |
| 11 | 人口上限 | 靠 `nest` 的 `house 6` | `popCap()` 独立函数 | 🟡 |
| 12 | 存档 key | `shellbreak.*` | `tidebreak.save.v1` | 🟡 |

### 🔴 头号风险：破壳系数会被 44 项科技掀翻

`src/shell.js:30 breakCoef()` = `0.80 × 科技数`。

| 科技数 | 贡献 | 破壳系数（其余项不变时） |
|---|---|---|
| 8（现状） | +6.4 | 与 README 基线 73.4 对齐 |
| 44（全研完） | **+35.2** | 约 100+，**中期一研科技就跳阶段** |

README 里所有标定（10.65h / 9.80h / 不供燃料必卡 25%）随之作废，必须重跑 `balance.mjs`。

---

## 3. 已定（不必再讨论）

- 品牌：**渊海天壳 TIDEBREAK**
- 蓝本：**猫国建设者**（前期资源/职业/建筑/科技全表已从官方 master 源码核过）
- 科技树形态：**文明6式节点图**
- 第一阶段终极目标：**钻破天壳**
- 数值只改 config 层，不散落
- 改任何数值后 `balance.mjs` 与 `e2e.mjs` 必须重跑，退出码 0 为通过

---

## 4. 待定（**需你逐条拍板，我不擅自选**）

| # | 问题 | 候选 |
|---|---|---|
| A | 合并落点 | 合到 shellbreak（天壳在，sim 齐全）／ 合到 tidebreak ／ 另开新目录 |
| B | 破壳系数科技项口径 | era 加权递减（总量 ≈+18，保留单调性）／ 保持 0.80 改抬 `ICE_SHELL` ／ 第一阶段只实装 era1（≈11 项） |
| C | 食物 id 统一 | 迁 `kelp → mat` ／ 迁 `mat → kelp` |
| D | 开局取哪份 | pop1 + 资源全空（9-25 已定过，但 shellbreak 未跟上）／ 保留 pop3 + coral60 |
| E | 职业 id 统一 | `gather/craft/scholar` ／ `gatherer`（+其余两个待命名） |
| F | 架构取向 | `economy.tick` 内联 ／ `actions.*` 单一入口 |
| G | `eff` 接线范围 | 哪些效果真正进 `economy` |
| H | 天壳定位 | 本阶段终极目标 ／ 由科技树解锁的新阶段 |

> 还有两条小事：① `tidebreak/sim/_probe.mjs.js` 是残留临时文件；② 两份 README 标题撞名（「天壳」 vs 「渊海天壳」）。

---

## 5. 建议执行顺序（**选定后才动**）

| 阶段 | 内容 | 前置 |
|---|---|---|
| 0 | 定 A–H 八条口径 | — |
| 1 | 定落点；统一资源/职业 id；开局对齐 | A C D E |
| 2 | 科技扩到 44 项；`eff` 接线；`cond` 落地 | B F G |
| 3 | 科技 UI 换成 Civ6 节点图 | — |
| 4 | 破壳系数重标定；重跑两套 sim | B |
| 5 | 倍速 + 重置补进主工作区 | — |

---

## 6. 备注

本方案里的所有数字与文件名，均为 2026-09-25 当天实际读取代码得到，不是从 README 抄的。
README 与代码的偏差继续存在，引用代码现状前请现场复核。
