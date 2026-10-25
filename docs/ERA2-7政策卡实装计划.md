# 天壳 · ERA2–7 政策卡实装计划（用户 2026-10-22 拍板）

> 状态：**修道院 已实装**（本次会话，`src/civics.js` 泛化 `coreFaithMul` + 新增 `card_monastery`，11/11 探针通过，未提交）。
> 本文件是**其余 8 张已同意卡**的实装计划，**先不改代码**，等用户拍「开始实装」再落。
> 所有改动遵循铁律：面板/结算同源、改一处必 bump `index.html` 对应 `?v=`、落完跑 `node --max-old-space-size=8192 sim/e2e.mjs`（**启蒙沙龙**因动到 tick/rates 需连跑 3 次看分布）。

## 0. 一个要先拍板的分叉（征夫发役 vs 王室特许）

用户在同一条消息里先写「奇观减消耗叫**征夫发役**、放技艺、era1-3、减耗 20%」，又写「**王室特许**同意，改成覆盖 era1-5、代替征夫发役」。
这两句话指向**同一张奇观减耗卡**，且后者取代前者。本计划按以下结论拟：

- **最终只留一张奇观减耗卡 = `王室特许`**，覆盖 **era1–5**、减耗 **20%**，挂在 **技艺（craft）**（因 `征夫发役` 原定就在技艺，且 era1 解锁才能覆盖到 era1–5 的奇观；放归正会 era4 太晚，帮不上 era1–3 奇观）。
- `征夫发役` 这个名字/方案**废弃**（被代替）。
- ⚠️ **待你确认**：① 最终卡名用「王室特许」还是仍想叫「征夫发役」；② 挂 `技艺` 还是保留 `归正会(reformed)`。计划其余部分默认「王室特许 / 技艺」。

## 1. 卡清单与落点总表

| # | 卡名 | 挂接 civic | type | 效果（提议值） | 通道 | 代码改动量 |
|---|------|-----------|------|--------------|------|-----------|
| 1 | **王室特许** | craft（技艺） | prod | era1–5 奇观建造 −20% | `wonderBuildSaveEra` 新字段（需 era 闸） | 中（wonder.js + civics.js 读器 + 泛化） |
| 2 | **五年计划** | rationing（工业化配给） | prod | 精铁 +30%、钢 +30% | `resOutMul:{iron,steel}`（**已有通道**，iron/steel 已被 `cardResOutMul` 读） | **零代码** |
| 3 | **庄园制** | feudalism | grow | 食物（藻食）产出 ×1.20 | `foodOutMul`（**新通道**，落点 `foodRate`） | 小（civics.js 读器 + economy.js 一行 ×） |
| 4 | **启蒙沙龙** | enlightenment | sci | 科技产出的 15% 加到市政点上 | `sciToCivic`（**跨资源接线**，最复杂） | 大（tick + rates 双路同源） |
| 5 | **公司税** | macroeconomics | prod | 公司产出加成 & 幸福度消耗加成 ×1.3 | `companyBonusMul`（**新通道**，落点 `companyMul`/`companyLuxMul`） | 小 |
| 6 | **考古发掘** | archaeology | prod | 艺术品/潮纹记录 工艺效率 +25% | `craftRatioRecipes`（**已有通道**，workshop.js:143 已读） | **零代码** |
| 7 | **质量效应**（原星屑回流） | ancestor_heritage | sci | 星屑获取 ×1.15 | `breakStardustMul`（**新通道**，落点破壳结算；星屑无逐秒产出，只能作用于结算/兑换） | 小（prestige + 结算预览同源） |
| 8 | 修道院 | sovereign | 万能 | 核心建筑每级 +5% 信仰 | `coreFaithMul`（已泛化） | **已完成** |

> 零代码 = `POLICIES` 加条目 + 对应 civic 的 `desc` 补一句 + bump `?v=` 即可，无 economy/civics 读数改动。
> 拒绝的卡（远洋商路/城邦守望/缮写室/行会学徒/冶铁监工/航海学校/矿业宪章Ⅱ/深海牧场/钢厂总工/国会津贴/自动化配给/快速通道/联邦津贴/古文明研究/环球贸易/竞技赞助）**不进任何文件**。

## 2. 逐卡实装要点

### 1 · 王室特许（era1–5 奇观 −20%）— 中改动
- **civics-data.js `POLICIES`** 加：
  ```js
  { id:'card_royal_charter', name:'王室特许', civic:'craft', type:'prod', effect:{},
    wonderBuildSaveEra:0.20, wonderBuildSaveEraCap:5,
    desc:'era1–5 的奇观建造消耗 −20%（装在卡槽里才生效）。' },
  ```
- **civics.js** 加读器（与 `cardWonderBuildSave` 同形，但按奇迹 `era` 闸）：
  ```js
  function cardWonderBuildSaveEra(s, wonderEra){
    var sum=0,arr=(s&&s.cards)||[],i,cd;
    for(i=0;i<arr.length;i++){ if(!arr[i])continue; cd=policyById(arr[i]);
      if(cd&&typeof cd.wonderBuildSaveEra==='number'
         &&(cd.wonderBuildSaveEraCap==null||wonderEra<=cd.wonderBuildSaveEraCap)) sum+=cd.wonderBuildSaveEra; }
    return sum; }
  ```
  并在 `SB.civic` 导出 `cardWonderBuildSaveEra`。
- **wonder.js `discountedCost`（≈289）** 改 `save` 一行：
  ```js
  var save = (SB.civic?SB.civic.cardWonderBuildSave(s):0)
            + (SB.civic?SB.civic.cardWonderBuildSaveEra(s,w.era):0);
  var mul = Math.max(0,1-0.05*lv)*Math.max(0,1-Math.min(save,0.95));
  ```
  `w.era` 已确认存在于奇观数据（config-content.js 各 wonder 带 `era:`）。显示/扣费/可建造判定三处都走 `discountedCost` ⇒ 同源自动成立。
- **注意**：`craft` 现已有 `card_craft`（retiredBy:'guild'），第二张卡同挂 craft 无碍；type=prod 进万能/工造槽都能装（技艺 era1 万能槽充足）。

### 2 · 五年计划（精铁+钢 +30%）— 零代码
- `POLICIES` 加：`{ id:'card_five_year', name:'五年计划', civic:'rationing', type:'prod', effect:{},
  resOutMul:{iron:1.3, steel:1.3}, desc:'精铁、钢产出 +30%。' }`
- 通道 `cardResOutMul(s,res)`（civics.js:379）已按 res 通用扫卡，**iron/steel 直接生效**，无需扩 economy。
- 与既有 `card_steel_guild`(钢 +15%, era3)、`card_flesh_weak`(铁/钢 +30%, era9) 乘法叠加，符合预期。
- `rationing` 的 `desc` 补一句提及。

### 3 · 庄园制（食物 ×1.20）— 小改动
- `POLICIES` 加：`{ id:'card_manorialism', name:'庄园制', civic:'feudalism', type:'grow', effect:{},
  foodOutMul:1.20, desc:'食物（藻食）产出 ×1.20。' }`
- **civics.js** 加读器 `cardFoodOutMul(s)=cardFieldMul(s,'foodOutMul')`，导出。
- **economy.js `foodRate`（≈1099）** 在 return 行末乘 `*(SB.civic?SB.civic.cardFoodOutMul(s):1)`。
  因 `foodRate` 被 tick 与 rates 共用 ⇒ 面板/结算同源自动成立。
- ⚠️ 「食物」= 藻食（kelp）：`foodRate` 的 `byBuild`(`s.lvl.kelp*SB.BLD.food`)+`byJob`(`effJobs.gather*SB.UNIT.kelp`) 即藻食/秒，乘区落这里语义正确。

### 4 · 启蒙沙龙（科技 15% → 市政点）— 大改动（最复杂）
- `POLICIES` 加：`{ id:'card_salon', name:'启蒙沙龙', civic:'enlightenment', type:'sci', effect:{},
  sciToCivic:0.15, desc:'科技产出的 15% 等值加到市政点（装在卡槽里才生效）。' }`
- **civics.js** 加读器 `cardSciToCivic(s)=cardFieldMul(s,'sciToCivic')`，导出。
- **接线（必须 tick + rates 双路同源）**：
  - economy-tick.js 科技块（≈341–441）前记 `var _sciBefore=s.res.science`，块末算 `_sciDelta=s.res.science-_sciBefore`，随后 `if(_sciDelta>0) addRes(s,'culture', _sciDelta*cardSciToCivic(s));`（已含 dt，不再乘）。
  - economy-rates.js 文化行里加 `cardSciToCivic(s)*sciOut(s)`，其中 `sciOut(s)` 需新增 = 与 tick 科技块**逐字同构**的「每秒科技产出」函数（提议抽到 economy.js 复用，避免两份算式漂移）。
- ⚠️ 这是唯一跨资源接线卡：科技仍全额进账（不截留），只是额外把 15% 的等值的市政点补进 culture。e2e 必须 tick vs rates 对拍（连跑 3 次看分布）。

### 5 · 公司税（公司加成 ×1.3）— 小改动
- `POLICIES` 加：`{ id:'card_corp_tax', name:'公司税', civic:'macroeconomics', type:'prod', effect:{},
  companyBonusMul:1.3, desc:'公司的产出加成与幸福度消耗加成均 ×1.3（装在卡槽里才生效）。' }`
- **civics.js** 加读器 `cardCompanyBonusMul(s)=cardFieldMul(s,'companyBonusMul')`，导出。
- **economy-social.js**：
  - `companyMul`（≈241）：`return 1 + ((tiers[idx]&&tiers[idx].bonus)||0) * (SB.civic?SB.civic.cardCompanyBonusMul(s):1);`（仅放大「加成部分」，非整条 ×1.3）。
  - `companyLuxMul`（≈266）：`total += (c.luxBonus||0) * (SB.civic?SB.civic.cardCompanyBonusMul(s):1);`
  - 两处都已在所有资源产出行（kelp/steel/thetaMetal/sci/coral）与奢侈消耗链被读取 ⇒ 全域生效。
- ⚠️ 「公司的幸福度消耗加成」= 各公司 `luxBonus`(+10%) 加进 `luxDemandMul` 的那一份（economy-social.js:90），乘 1.3 ⇒ 单家公司的奢侈增耗从 +10% 变 +13%。

### 6 · 考古发掘（艺术品/潮纹记录 工艺 +25%）— 零代码
- `POLICIES` 加：`{ id:'card_archaeology', name:'考古发掘', civic:'archaeology', type:'prod', effect:{},
  craftRatioRecipes:{craft_artwork:0.25, craft_tidal_record:0.25},
  desc:'艺术品、潮纹记录的工艺制作效率 +25%。' }`
- 通道 `cardCraftRatioRecipes`（civics.js:425）已被 workshop.js:143 读取；配方 id `craft_artwork`/`craft_tidal_record` 已确认存在（config-content.js:304/307）。零代码。
- `archaeology` 的 `desc` 已写「艺术品制造消耗 −20%」（市政被动），本卡是在其基础上**额外**给工艺加成，不冲突。

### 7 · 质量效应（星屑 ×1.15）— 小改动
- `POLICIES` 加：`{ id:'card_mass_effect', name:'质量效应', civic:'ancestor_heritage', type:'sci', effect:{},
  breakStardustMul:1.15, desc:'破壳结算的星屑获取 ×1.15。' }`
- **civics.js** 加读器 `cardBreakStardustMul(s)=cardFieldMul(s,'breakStardustMul')`，导出。
- **prestige.js `stardustGain`（≈283）** 返回值乘 `(SB.civic?SB.civic.cardBreakStardustMul(s):1)`。
- ⚠️ 星屑**无逐秒产出**（跨周目局外资源，仅破壳结算 `stardustGain` + 兑换发放），故本卡只能作用于**结算/预览**。`render.js:609` 的 `nextGain` 与 `:1226` 的 `breakPreview.stardust` 必须走同一 `stardustGain`（或同样乘 `cardBreakStardustMul`），否则面板/结算撒谎——落完需对拍。

## 3. 推荐实装顺序（分批，每批自测）

1. **批次 A（零代码，最安全）**：⑤ 五年计划、⑥ 考古发掘 → `POLICIES` 加条目 + `desc` 补句 + bump `?v=`（`civics-data.js`/`config.js` 无所谓，动的是 `civics-data.js`→ bump 其 `?v=`）。跑 e2e 1 次。
2. **批次 B（新通道小改）**：③ 庄园制、⑤ 公司税、⑦ 质量效应 → 各加读器 + 落点一行 + bump `?v=`（`economy.js`/`economy-social.js`/`prestige.js`/`civics.js`）。跑 e2e 1 次。
3. **批次 C（era 闸中改）**：① 王室特许 → wonder.js + civics.js + `?v=`。跑 e2e 1 次。
4. **批次 D（跨资源接线，最后做、最慎）**：④ 启蒙沙龙 → tick + rates 双路 + `sciOut` 复用函数 + bump。**连跑 e2e 3 次看分布**。

## 4. 待你拍板

- 0· 奇观卡最终名（王室特许 / 征夫发役）与挂接 civic（技艺 / 归正会）。
- 4· 启蒙沙龙的「科技 15%→市政点」是否要同样计入 `lifetimeCulture`（意识形态门槛 `lifetimeCulture≥900000`）——若计入，会显著加速意识形态解锁；建议**计入**（与现有 culture 同源），但请确认。
- 全部数值均为提议值（铁/钢 +30%、食物 ×1.20、公司 ×1.3、星屑 ×1.15、奇观 −20%、启蒙 15%）——标定权在你。
- 是否按批次 A→D 顺序逐步实装，还是一次性全落（我建议分批，便于回归定位）。
