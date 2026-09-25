# 天壳 SHELLBREAK — 长期项目笔记

## 猫国建设者（Kittens Game）对照基准
反向调研的参照物。开局状态（2026-09-24 实证，raw 源码 + wiki 双证）：
- `js/village.js:3` `kittens: 0` / `maxKittens: 0` / `kittensPerTickBase: 0.01`；`resetState()` 里 `this.sim.kittens = []`。
- 职业 `jobs[]` 全部 `value: 0`，woodcutter 才 `defaultUnlocked: true` —— 开局没有任何人被分配职业。
- `js/buildings.js` 所有建筑 `val` 恒为 0（save 时 `val===0` 直接不落盘），**没有任何建筑开局带等级**。
- `js/resources.js` 所有资源 `value: 0`（构造/`resetState` 均置 0），开局资源全空。
- 唯一起步产能 = 手动点 "Gather catnip" 按钮（wiki: 点一下 +1 猫薄荷），
  攒 **10 猫薄荷**才能建第一座 Catnip Field（成本 10，priceRatio 1.12，产出 0.125/tick）。
- wiki 开场文本 "You begin with a single kitten gathering catnip in a forest" ——
  叙事上是 **1 只猫**，代码变量是 0，靠 ironWill（无猫不饿死）兜底。
⇒ 猫国开局 = **0-1 人口 / 0 资源 / 0 建筑 / 无自动产能**，玩家必须手动点十下起步。

## 开局对齐（2026-09-24 定案方向）
用户判断「一开始就不该有建筑」，读清后扩展为：我们凭空多了 3 个自动采集者。
- 现状开局：`pop 3` (`jobs.gather 3`)、`kelp 60`、建筑全 0、匠人 0（地热恒 0）。
- 实测首座藻田 277 秒（成本 100 珊瑚 ÷ 采集 0.36/秒），藻食 333 秒见底 —— 开局空转 4.6 分钟。
- 目标开局：1 人 / 职业全 0 / 资源全 0 / 首座建筑成本降到 10-25 / 手动采集起步。

## 猫国关键数值（2026-09-25 实拉 master 复核，引用前以此为准）
- **`agriculture` 科技没被删**，在 `js/sci.js:29-36`（`unlocks:{jobs:["farmer"], ...}`，100 science）。
  此前记「已从 master 删除」是 grep 范围不够导致的误判。
- 职业 modifier/秒：`woodcutter` wood 0.018(defaultUnlocked) / `farmer` catnip 1.0 /
  `scholar` science 0.035 / `hunter` 0.06 / `miner` minerals 0.05 / `priest` faith 0.0015 /
  `geologist` coal 0.015。
- 建筑解锁职业：`library`(wood 25, defaultUnlockable)→{jobs:["scholar"],tabs:["science"]}；
  `mine`(wood 100)→{jobs:["miner"]}。
- `field`：`catnipPerTickBase: 0.125`、priceRatio 1.12、unlockRatio 0.3、defaultUnlockable。
- `catnipPerKitten: -0.85` ⇒ **一块田养 0.147 人、一个 farmer 养 1.176 人**。
- ⚠️ **食物双源 `game.js:3666 calcResourcePerTick` 的语句顺序即设计，不可重排**：
  建筑侧 → `×季节`（只打建筑侧）→ 加职业侧（不吃季节）→ `×(1+catnipRatio)`。
  写成 `(建筑+职业)×季节` 会让圃丁在寒流季集体饿死，而暖流季永远测不出来。

## 工程纪律（本项目）
- sim 回归必须跑绿：`node sim/balance.mjs`、`node sim/e2e.mjs`；数值只改 `src/config.js`。
- cache-buster：`src/*.js` 与 `index.html` 的 `?v=` 版本号同步 bump。
- 冻结/只读约定：不做未授权的发布类动作。
- ⚠️ **加职业必须同时改三处**（缺一处就是 NaN 事故，已踩两次）：
  `SB.JOBS`(config) · `freshRun`/`migrateRun` 默认表(state) · 所有 `s.jobs.X` 算式。
  症状：`undefined * number = NaN` → 经 `addRes` 的 `Math.min` 污染资源池 → 顺 lvlSum 污染破壳系数。
  判据：**多个策略跑出逐位相同的结果，先怀疑 NaN 短路，不是「代码没生效」。**
- 照抄猫国时区分「机制照抄」与「数值照抄」：机制 100% 照源码（含语句顺序）；
  数值若时间尺度不同，只对齐 dimensionless 比值（如「一个圃丁养几个人」），别抄绝对值。
