# 更新日志草稿（Ver1.2.2 · 待发布）

> 生成时间：2026-11-13 ／ 覆盖范围：**Ver1.2.1 之后全部已提交未发布改动**（commit `46f06e1a` 四战争奖励定稿、`f98315eb` 战争失败损失改人口比率 + 军力弹窗、`4b382fc2` 攻城学读档重复研究修复）
> 状态：本稿为**内容草案**。`CFG.CHANGELOG` 条目、i18n 语义 key 登记、`VERSION` 升版与 `?v` 重封包**均未动手**——按纪律这些属于「升版 / 发布」动作，待你明说「升版」后再落地。
> `CFG.VERSION` 当前 = `Ver1.2.1`。

---

## 一、版本号建议

| 方案 | 版本名 | 说明 |
|---|---|---|
| **A ✅ 建议** | `Ver1.2.2` | 紧接线上 `Ver1.2.1`（2026-11-12 的择取区域/面板闪动修复）。本批只是 4 条玩家可见改动，无机制大改，小版本号递进最干净 |
| B（未采纳） | `Ver1.2.1-hotfix` | 若后台显示 1.2.1 仍在审核未上线、想直接覆盖同一版本名，可用；但会打乱已读/红点判定，不推荐 |

**A 与 B 的区别只有版本名**，条目内容一致。建议 A。

---

## 二、玩家可见条目（中文，待写入 `CFG.CHANGELOG`）

```js
{ v: 'Ver1.2.2', date: '2026-11-13', items: [
  // —— 修复 ——
  'changelog.fix.siege_research_repeat_on_reload',
  'changelog.fix.war_loss_population_ratio',
  // —— 新增 / 改进 ——
  'changelog.ui.military_power_popup',
  // —— 新增四个战争挑战 ——
  'changelog.war.challenge_weapon_critique',
  'changelog.war.challenge_totalwar_doctrine',
  'changelog.war.challenge_raider',
  'changelog.war.challenge_conqueror'
] }
```

### 对应玩家文案（即 `zh-CN.js` 里上述 key 应登记的文本）

1. **`changelog.fix.siege_research_repeat_on_reload`**
   > 修复「研究过《攻城学》，重新进游戏又提示要研究、红点复燃、导致重复研究」：存档迁移时《攻城学》被误写成另一个科技的存档键，已修正，已研究的《攻城学》读档后正常保留。

2. **`changelog.fix.war_loss_population_ratio`**
   > 战争行动失败损失改为按国家人口比率计算，不再能被「行动前把军人全部调去其他岗位」规避；失败 / 成功 / 大成功按行动类型区分比率、向上取整，优先扣减军人岗位、其余计入普通人口。

3. **`changelog.ui.military_power_popup`**
   > 新增：点击顶栏「军力」资源可查看明细弹窗，分项展示军人基数与王立士官学院的加成来源。

4. **`changelog.war.challenge_weapon_critique`**（武器的批判 · 终局挑战）
   > 新增挑战「武器的批判」：全程不得进行传播文化 / 传道信仰（软实力），也不得修建贸易路线；战争行动与吞并不受限制。完成奖励：永久星屑获取 +10% · 战争行动军力消耗 −10%。

5. **`changelog.war.challenge_totalwar_doctrine`**（早打，大打，打核大战 · 终局挑战）
   > 新增挑战「早打，大打，打核大战」：全程只能进行「全面战争」；劫掠与入侵被禁止。完成奖励：永久星屑获取 +10% · 士兵职业产出 +15%。

6. **`changelog.war.challenge_raider`**（grubby · 终局挑战）
   > 新增挑战「grubby（狼骑跑家式劫掠）」：全程只能进行「劫掠」；入侵与全面战争被禁止。完成奖励：永久星屑获取 +10% · 战利品产出 +20%。

7. **`changelog.war.challenge_conqueror`**（征服者 · 三档挑战）
   > 新增三档挑战「征服者」：戴森球竣工时须已吞并全部 7 个敌国，且本挑战敌方规模恢复速度按档位 ×1.5 / ×2 / ×3。逐档奖励：敌国规模上限 −5% / −10% / −15%（每档另含永久星屑 +10%）。

---

## 三、逐条对应的实际改动（自查用，不发玩家）

| # | 条目 | 真实落点 | 是否已在线上 |
|---|---|---|---|
| 1 | 攻城学读档重复研究 | `state-migrate.js` 预建 `_curTechIds`，当前存活科技 id 直过 legacy 不再被迁走；`techs.js` 从 `LEGACY_MAP` 删 `siegeT`（保留真正已删旧 id `pick`/`dive`）；回归套件 `sim/e2e-suites/tech-migrate.mjs` | ❌ 未发 |
| 2 | 战争失败损失改人口比率 | `war.js`：`ACTIONS.soldierLoss`→`popLoss` 并标定，`executeAction` 改算 `lostPop=ceil(pop×popLoss)` + 优先减 `jobs.soldier` + `folk.trimJobsToPop` 兜底；`folk.js` 导出 `trimJobsToPop`；`render-pane-war.js`/`war-toast.js`/`input.js`/`ai-strategy.js` 字段与文案同步 | ❌ 未发 |
| 3 | 军力点击弹窗 | `render.js` 军力格加 `data-res-detail="militaryPower"` + `showResDetail` 新增 `isWarPower` 分支；`war.js` 新增 `powerParts(s)` 与 `tr()`；i18n key `changelog.ui.military_power_popup` 待登记 | ❌ 未发 |
| 4 | 新增四个战争挑战（武器的批判 / 早打，大打，打核大战 / grubby / 征服者） | `challenges.js` 定义四挑战（rule/reward/tiers）+ `war.js` 生效：`weapon_critique`→`warCostMul`(war.js:686)、`totalwar_doctrine`→`soldierOutputMul`(war.js:180)、`raider`→`lootYieldMul`(war.js:882)、`conqueror`→`enemyScaleCapMul`(war.js:220) | ❌ 未发 |

> ⚠️ **i18n 登记缺口（落地升版前必须补）**：第 3 条已在游戏内用 `ui.resource.detail.power.*`，但 `CFG.CHANGELOG` 要用的 7 个 `changelog.*` 新 key（`fix.siege_research_repeat_on_reload`、`fix.war_loss_population_ratio`、`ui.military_power_popup`、`war.challenge_weapon_critique`、`war.challenge_totalwar_doctrine`、`war.challenge_raider`、`war.challenge_conqueror`）目前**均未在 `zh-CN.js` / `en-US.js` 登记**。升版时需按 AGENTS.md 先在 `outputs/.../i18n_text_inventory.xlsx` 登 key，再回填两语言词库，最后回填 `CFG.CHANGELOG`。

---

## 四、发版前收尾（升版四步，待授权后执行）

1. `src/config.js`：`VERSION` = `Ver1.2.2`，`CHANGELOG` 头部插入第二节的结构块。
2. i18n：`zh-CN.js` / `electron/locales/en-US.js` 登记 7 个新 `changelog.*` key（中文 + 英文译文）；同步更新 `outputs/.../i18n_text_inventory.xlsx`。
3. `index.html` `?v=` bump：本次改过的 js/css 各自 bump（至少 `config.js`、`war.js`、`folk.js`、`render.js`、`render-pane-war.js`、`war-toast.js`、`input.js`、`ai-strategy.js`、`zh-CN.js`、`en-US.js`）。
4. 重跑 `_repack.py`（第 149 行硬编码版本断言，每版必改），确认四项结构判据 PASS。

---

## 五、待你拍板

1. **版本名**：取 A（`Ver1.2.2`）？
2. **是否现在升版落地**：即上面第四节四步全做（含 i18n 登记 + `?v` bump + `_repack.py` 封包）？还是只把本稿内容先放着？
3. **`dive → deepsea` 旧档丢失**（非本次引入、`deepsea` 已非当前 id，`dive` 老档早被丢弃）：是否一并修、该迁到哪个当前 id？
