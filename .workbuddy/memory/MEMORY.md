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

## 工程纪律（本项目）
- sim 回归必须跑绿：`node sim/balance.mjs`、`node sim/e2e.mjs`；数值只改 `src/config.js`。
- cache-buster：`src/*.js` 与 `index.html` 的 `?v=` 版本号同步 bump。
- 冻结/只读约定：不做未授权的发布类动作。
