# 天壳 · ERA2–7 政策卡扩充设计（仿 Civ6，只设计不落码）

> 目标：在不新增任何市政（civic）的前提下，给纪元二～七多设计一批政策卡，
> 抄 Civ6 政策卡的「一个市政解锁若干张、靠有限槽位做取舍」的思路。
> 所有数值均为**提议值，待标定**；标定权归用户。

## 0. 结构约束（动手前已知事实，避免设计出不落地的东西）

1. **一个 civic 现已可挂多张卡。** 卡库 `render-pane-research.js:546` 遍历 `SB.POLICIES`，
   只要 `cardOwned(s, p.id)`（即 `s.civics[p.civic]` 为真）就显示。civic 表里的 `card` 单值字段
   只是市政树节点的标签，**不决定卡解锁**。⇒ 给已有 civic 加第 2/3 张卡，只需在 `POLICIES`
   加一条 `civic:'已有id'` 即可；顺手在该 civic 的 `desc` 补一句提及，树节点更清楚。
2. **类型 = 取舍张力。** `cardFits`：wild 吃一切，缺 type 视为 wild。早期政体万能槽少
   （酋邦/三纪元二政体各 3 wild、君主 5 wild），给卡标 `prod/sci/grow/relig` 才有「塞不进」的取舍感。
3. **通道优先复用，缺口才开新通道**（见 §4）。卡只在装进槽时才生效，与所有现役卡同纪律。
4. **退役链**仍走 `retiredBy`（指向**市政 id**）。新卡若定位为「上位替代」，必须写 `retiredBy`，
   否则会和旧卡叠加。

## 1. 现有可直接复用的读数通道（加字段即生效，无需新代码）

| 通道字段 | 语义 | 读取函数 |
|---|---|---|
| `craftRatio` | 工坊效率 +%（加法轴，可多卡叠加） | `cardCraftRatio` |
| `resOutMul:{res:k}` | 指定资源产出 ×k（现仅 iron/steel/thetaMetal 被 economy 读） | `cardResOutMul` |
| `civicOutMul` / `sciOutMul` | 市政 / 科技产出 ×k | `cardCivicOutMul` / `cardSciOutMul` |
| `jobOutMul` | 全职业产出 ×k | `cardJobOutMul` |
| `hydroSupplyMul` | 热液能（蒸汽）供给 ×k | `cardHydroMul` |
| `storeMul` | 仓储区容量 ×k | `storeMul` |
| `squareMul` / `theaterMul` | 广场 / 歌剧院市政乘区 ×k | `squareMul` / `theaterMul` |
| `libraryMul` / `universityMul` / `obsSciMul` | 潮纹馆 / 研究所 / 观测站科技乘区 ×k | `libraryMul` / `universityMul` / `cardObsSciMul` |
| `templeMul` / `templeFaithMul` | 神庙信仰（×k / ×k 整段） | `templeMul` / `templeFaithMul` |
| `bankMerchantMul` | 银行商人产出 ×k | `bankMerchantMul` |
| `canalMul` | 王国潮道奢侈减免 ×k | `canalSaveMul` |
| `coreFaithMul` | 核心建筑每级 +k 信仰（**现硬编码只认 card_divine_right**，泛化见 §4） | `coreFaithMul` |
| `spaceBuildSave` | 太空建筑建造 −k | `cardSpaceBuildSave` |
| `wonderBuildSave` | 奇观建造 −k | `cardWonderBuildSave` |
| `wonderLuxSave` | 每座奇观 −k 奢侈消耗 | `cardWonderLuxSaveMul` |
| `starPerPop` | 星空探索 +k%×人口 | `cardFeverStarMul` |
| `civicPerPop` / `popCapFlat` / `popGrowthTimeMul` / `popCapPerPopBldg` | 市政点/人、人口上限、生育时长、人口建筑上限/级 | 各 `cardXxx` |
| `happyOffset`（可正） | 幸福度偏移（正=涨幸福） | `cardHappyOffset` |
| `happyConsumeMul` / `luxConsumeMul`（可负） | 幸福消耗 / 奢侈消耗 ×k（求和） | `cardHappyConsumeMul` / `cardLuxConsumeMul` |
| `planetOutMul` | 异星建筑产出 ×k | `cardPlanetOutMul` |
| `craftRatioRecipes:{id:k}` | 指定配方工坊效率 +k（加法） | `cardCraftRatioRecipes` |
| `faithSatMul` / `coreSpaceFaithMul` | 卫星/核心+太空 每级信仰 ×(1+k·级) | `dynFaithCardMul` |
| `effect:{res:k}` | 平坦加值/秒（flow 通道，不随规模缩放） | `flow` |
| `launchCycle` / `launchHydroMul` | 发射节律 −k（加法）/ 发射热液 ×k | `cardLaunchCycle` / `cardLaunchHydroMul` |

## 2. Civ6 可抄清单（适配映射，哪些能直接搬、哪些本作没有对应物）

| Civ6 卡 | 天壳对应机制 | 本作有无现通道 | 能抄？ |
|---|---|---|---|
| 三角贸易（商队 +金+信） | 商人奢侈品 / 王国潮道 | luxOutMul（无）/ canalMul（有） | 部分（见 §3 远洋商路 / 三角贸易已存在） |
| 城市规划（每区 +住房） | 人口建筑上限/级 | popCapPerPopBldg（有） | ✅ |
| 伊尔库姆（增长 +10%） | 生育时长 | popGrowthTimeMul（有） | ✅ |
| 神王（每城 +宜居+金） | 人口上限 + 幸福 | popCapFlat + happyOffset（有） | ✅ |
| 理性主义（学院区科技） | 学术区信仰 / 科技乘区 | academyFaithMul（无）/ libraryMul（有） | 部分 |
| 废材利用（改良资源 +25%） | 资源产出 | resOutMul（有，扩 stone） | ✅ |
| 自由贸易（1 金/公民） | 市政点/人 | civicPerPop（有） | ✅ |
| 公会制度（廉价移民） | 建造减耗 | cardBuildSave（无，需新） | 否（见 §4） |
| 五年计划（4+区加成） | 建筑总级加成 | 无直通道 | 否 |
| 论坛/公共工程（奇观 −建造） | 奇观建造减 | wonderBuildSave（有） | ✅ |
| 遗产旅游（奇观 +旅游） | 奇观减奢侈 / 市政增益 | wonderLuxSave / wonderCivicGainMul（有） | ✅ |
| 理性主义/冷战/太空署（科技/星空） | 科技 / 星空探索 | sciOutMul / starPerPop（有） | ✅ |
| 媒体狂热（意识形态） | 各意识形态市政卡 | 已有 national_solidarity 等 | 可补分支 |
| 环境/碳捕（幸福） | 幸福正向 | happyOffset（有） | ✅ |
| 重商主义（银行商人） | 银行商人 ×k | bankMerchantMul（有） | ✅ |
| **军事类（阿戈格/纪律/机动…）** | **本作无军事单位** | — | ❌ 不抄 |
| **外交类（联盟/冷战/北约…）** | **本作无城邦外交** | — | ❌ 不抄（除非做成「公司/贸易」变体） |

## 3. 各纪元新增卡提案（23 张，全部挂在已有 civic 下）

> 字段写法 = 真实通道；标注「⚠️新通道」的需 economy 加一行读 + civics.js 加一个 cardXxx（同构 <10 行）。
> 标注「⚠️需泛化」的 = 现读数硬编码了某张特定卡，要把它改成扫同名字段。
> 数值一律**提议值，待标定**。

### 纪元二（era 2）
1. **远洋商路** · civic:`trade`(现无卡) · type:`prod` · Civ6 三角贸易/贸易联盟
   - 效果：商人奢侈品产出 ×1.25。⚠️新通道 `luxOutMul`（economy 商人行读）。
   - 提议 1.25。注：`trade` 正是解锁商人职业的市政，给商人正反馈。
2. **城邦守望** · civic:`political`(现无卡) · type:`grow` · Civ6 城市规划
   - 效果：人口上限 +4（`popCapFlat:4`）、幸福 +1（`happyOffset:+1`）。
   - 提议 +4 / +1。注：`political` 现只解锁三政体，补一张民生卡制造早期槽位取舍。
3. **缮写室** · civic:`records`(已有 card_records) · type:`sci` · Civ6 理性主义
   - 效果：学术区（academy 分区）每级 +0.4 信仰/秒。⚠️新通道 `academyFaithMul`（与 `theoFaithBonus` 同构但走卡）。
   - 提议 0.4。注：与神权政体错位——更早、更弱，不重复。

### 纪元三（era 3）
4. **修道院** · civic:`sovereign`(已有 card_sovereign) · type:`relig` · Civ6 主教/神权
   - 效果：礁栖核心建筑每级 +5% 信仰。⚠️需泛化 `coreFaithMul`（现硬编码只认 card_divine_right，改成扫所有卡的 `coreFaithMul` 字段）。
   - 提议 0.05。注：与天赋神权（0.10/级）可叠加，但 sovereign 早于 reformed。
5. **庄园制** · civic:`feudalism`(已有 card_serfdom) · type:`grow` · Civ6 庄园/农牧
   - 效果：食物产出 ×1.20。⚠️新通道 `foodOutMul`（生息区产出行读）。
   - 提议 1.20。注：农奴制只动了藻场↔牧场互乘，这张补食物总量。
6. **行会学徒** · civic:`guild`(已有 card_guild) · type:`prod` · Civ6 手工业行会
   - 效果：工坊效率 +15%（`craftRatio:0.15`，与职业行会 0.40 加法叠加）。
   - 提议 0.15。
7. **冶铁监工** · civic:`steel_guild`(已有 card_steel_guild) · type:`prod` · Civ6 矿业/冶金
   - 效果：θ金属产出 ×1.15（`resOutMul:{thetaMetal:1.15}`；现该资源仅 era9 血肉苦弱覆盖）。
   - 提议 1.15。

### 纪元四（era 4）
8. **王室特许** · civic:`reformed`(已有 card_divine_right) · type:`relig` · Civ6 公共工程/论坛
   - 效果：奇观建造 −20%（`wonderBuildSave:0.20`，与心胜于物 0.30 叠加求和）。
   - 提议 0.20。
9. **航海学校** · civic:`explore`(已有 card_triangular) · type:`sci` · Civ6 航海术
   - 效果：星空探索速率 +0.5%×人口（`starPerPop:0.5`，与星际探索热潮 1.0 叠加）。
   - 提议 0.5。
10. **矿业宪章Ⅱ** · civic:`mineral_charter`(已有 card_mineral_charter) · type:`prod` · Civ6 矿产章程（扩充）
    - 效果：石头产出 ×1.20。`resOutMul:{stone:1.20}` — ⚠️需 economy 把 `stone` 纳入 `cardResOutMul` 覆盖（现只 iron/steel/thetaMetal）。
    - 提议 1.20。注：石头目前没有任何卡加成，是明确的缺口。
11. **启蒙沙龙** · civic:`enlightenment`(已有 card_enlightenment) · type:`sci` · Civ6 启蒙沙龙
    - 效果：科技 +0.2/秒（`effect:{science:0.2}`，平坦，不随规模）。
    - 提议 0.2。

### 纪元五（era 5）
12. **深海牧场** · civic:`sharksong`(现无卡) · type:`grow` · Civ6 畜牧业
    - 效果：食物产出 ×1.25（`foodOutMul`，与庄园制叠加）。
    - 提议 1.25。注：`sharksong` 现只解锁剧院/奇观，补一张民生卡。
13. **钢厂总工** · civic:`civ_steelschool`(现无卡) · type:`prod` · Civ6 工业学校
    - 效果：钢产出 ×1.20（`resOutMul:{steel:1.20}`，与钢铁公会 1.15 叠加）。
    - 提议 1.20。
14. **国会津贴** · civic:`socialscience`(现无卡) · type:`grow` · Civ6 社会福利
    - 效果：鲛人幸福消耗 ×0.9（`happyConsumeMul:0.9`）。
    - 提议 0.9。
15. **自动化配给** · civic:`rationing`(已有 2 张) · type:`prod` · Civ6 流水线
    - 效果：工坊效率 +25%（`craftRatio:0.25`）。⚠️必须写 `retiredBy:'common_destiny'`（与工业化配给一起在共同命运后被各员一层取代），否则与 flesh_weak 双重叠加。
    - 提议 0.25。

### 纪元六（era 6）
16. **公司税** · civic:`macroeconomics`(现无卡) · type:`prod` · Civ6 重商主义（通用）
    - 效果：所有职业产出 ×1.15（`jobOutMul:1.15`）。
    - 提议 1.15。注：`macroeconomics` 现只触发公司系统，补一张产线卡。
17. **快速通道** · civic:`urbandesign`(现无卡) · type:`prod` · Civ6 基建/五YearPlan
    - 效果：太空建筑建造 −15%（`spaceBuildSave:0.15`，与太空竞赛 0.20 叠加）。
    - 提议 0.15。
18. **考古发掘** · civic:`archaeology`(现无卡) · type:`grow` · Civ6 考古学
    - 效果：艺术品 / 潮纹记录 工艺效率 +25%（`craftRatioRecipes` 指向 `craft_artwork`/`craft_tidal_record` 各 +0.25，加法轴）。
    - 提议 0.25。
19. **联邦津贴** · civic:`federalism`(现无卡) · type:`grow` · Civ6 联邦制
    - 效果：科技 ×1.08、市政 ×1.08（`sciOutMul:1.08` + `civicOutMul:1.08`）。注：联邦制**政体**是永久 +10%，这张**卡**可卸、数值略低，做「不想换政体也能拿部分增益」的旁路。
    - 提议 1.08。

### 纪元七（era 7）
20. **星屑回流** · civic:`ancestor_heritage`(现无卡) · type:`sci` · Civ6 先民/遗产
    - 效果：星屑产出 ×1.15。⚠️新通道 `stardustOutMul`（星屑产出行读）。
    - 提议 1.15。注：现星屑只在破壳结算加成（祖先遗产市政 +20%），持续产出侧完全空白。
21. **古文明研究** · civic:`ancient_civics`(现无卡，本职 +1 政策槽) · type:`sci` · Civ6 古物研究
    - 效果：科技 +0.5/秒（`effect:{science:0.5}`，平坦）。
    - 提议 0.5。
22. **环球贸易** · civic:`planet_village`(已有 2 张) · type:`prod` · Civ6 全球化贸易
    - 效果：商人全局产出 ×1.20。⚠️新通道 `merchantOutMul`（商人行读，区别于 bankMerchantMul 的银行专项）。
    - 提议 1.20。
23. **竞技赞助** · civic:`athletics`(已有 card_live_comp) · type:`grow` · Civ6 奥林匹克/竞技
    - 效果：幸福 +1（`happyOffset:+1`）。
    - 提议 +1。

## 4. 落地时需要的代码侧小改（按 « 影响从小到大 » 排序）

1. **纯加字段、零代码**（18 张）：第 1/2/5/6/7/8/9/11/12/13/14/15/16/17/18/19/21/23 号卡，
   通道均已存在，只需在 `POLICIES` 加条目 + 在对应 civic 的 `desc` 补一句。
2. **读数泛化（2 处）**：
   - `coreFaithMul`（修道院 4 号）：把「只认 card_divine_right」改成扫所有卡 `coreFaithMul` 字段（同 `cardFieldMul` 写法）。
   - `cardResOutMul`（矿业宪章Ⅱ 10 号）：economy 里现只对 iron/steel/thetaMetal 调 `cardResOutMul`，补一行 stone。
3. **新通道（6 个，各 <10 行）**：`luxOutMul`(1) / `foodOutMul`(5,12) / `academyFaithMul`(3) /
   `stardustOutMul`(20) / `merchantOutMul`(22)。economy 加一行读 + civics.js 加一个 `cardXxx`
   （与 `cardPlanetOutMul` 等同构）。

## 5. 待用户拍板的取舍

- A. **密度**：以上 23 张是否全要，还是先落「现通道零代码」的 18 张、新通道 5 张（lux/food/academy/stardust/merchant）暂缓？
- B. **互斥分支**：是否要把某些 civic 做成「解锁 2–3 张、只能塞有限槽」的 Civ6 式二选一？
   （例如 `rationing` 已有 2 张、`planet_village` 已有 2 张，天然已是这种结构；其余可选择性加分支。）
- C. **数值标定**：所有提议值待拍；尤其早期卡（era2-3）数值会明显影响前中期节奏，建议单独过一遍。
- D. **石头/食物/星屑/商人 这四个新通道**，开还是不开？（不开则对应卡改用近似现通道，如石头改用 `craftRatio` 之类，但语义会歪。）
