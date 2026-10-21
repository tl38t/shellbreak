/* 天壳 / SHELLBREAK — 经济内容数据表。
 * 季节、资源、配方、工艺升级、奇观与职业产出常量在此集中维护；不包含玩法逻辑。
 * 必须在 config.js 后、消费这些表的模块前加载。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  /* 海底火山活动的周期表（三季轮转）。
   * ⚠️ 2026-09-27 删掉「浊流季」：它的 mult 与平流季**逐位相同**（都是 1.00），
   *   且除本表这一行外**全仓没有任何读者** —— 名字不同、效果为零。
   * ⚠️ 增删本表时必须确认 `economy.seasonIdx` 取的是 `SEASONS.length` 而不是写死的 3
   *   （旧版写死 4，删季不跟着改会直接索引越界）。 */
  var SEASONS = [
    { name: '暖流季', mult: 1.50 },
    { name: '平流季', mult: 1.00 },
    { name: '寒流季', mult: 0.25 }
  ];

  // 资源表。get 用于渲染层读值（渲染不得直接摸 s.res）。
  /* ⚠️ 2026-09-26 暗流纪（纪元一）重排，用户拍板「石头新增、矿砂改成金属、暖石新增」：
   *   stone     石头 —— 新资源，由「采石」解锁的采石工产出（材料线第三格）
   *   silt      显示名由「矿砂」改为「金属」，**id 故意不改**：改 id 要动存档默认表与
   *             所有算式，而「矿砂」这个概念在我们的经济里已经贯通（砂矿坑→精铁），
   *             要换的只是玩家看到的那个词。见下方 CAP_BASE 与 BLD 的注释。
   *   warmstone 暖石 —— 新资源，采矿时伴生；保温法可消耗它抵消休眠期的产出下降
   *              （「暖石」这个消耗品在别的资源上不成立，必须独立，见 techs.js 保温法那项）。
   * 【为什么三个都能安全加入】economy.capOf 对 CAP_BASE 里没有的资源返回 Infinity，
   *   且 UNIT 里没有它们的默认值 ⇒ 它们从 0 开始、只能由特定职业产出，
   *   不会像「改错一个 id」那样污染别的资源池（见 state.js 那条 NaN 事故注）。 */
  /* ⚠️ 资源显示纪律（2026-09-30）：`kind:'craft'` 进「工艺资源」分区；带 `unlock` 的资源
   *   解锁前不显示。unlock 描述符：{tech:'X'} 研究 X / {build:'X'} 建成 X / {job:'X'} 指派 X
   *   / {civic:'X'} 解锁 X；省略 = 开局即显示（核心资源）。判定见 economy.resUnlocked。 */
  var RESS = {
    kelp:    { name: '藻食', short: '藻', storageEra: 1 },
    coral:   { name: '珊瑚', short: '珊', storageEra: 1 },
    /* 材料线四条也有门（2026-09-30 用户报「开局不该看到石头/暖石/精铁/金属」）：
     *   石头=研究「采石」（采石工上岗才有进项）；金属/暖石=研究「采矿」（矿工）；
     *   精铁=建成热泉炉（它是 金属+暖石→精铁 的唯一转换口，见 economy.ironFlow）。
     * ⚠️ 建筑成本标签里的资源名仍照显（上一轮已拍），这里藏的只是顶栏存量行。 */
    stone:   { name: '石头', short: '石', unlock: { tech: 'quarry' }, storageEra: 1 },
    silt:    { name: '金属', short: '金', unlock: { tech: 'mining' }, storageEra: 1 },
    warmstone: { name: '暖石', short: '暖', unlock: { tech: 'mining' }, storageEra: 1 },
    /* ⚠️ 骨材 bone 已于 2026-09-27 用户拍板删除（原「珊瑚→骨材」这条加工线整体作废）。
     *   连带删除：UNIT.bone / CAP_BASE.bone / state 的 res·got 键 / boneFlow / 骨工法科技。
     *   原挂在 bone 上的三处建筑成本**落到珊瑚上**（热泉炉 112 / 热泉井 175 / 破冰祭坛 400），
     *   理由与 A/B 实证见下面 furnace 那节的注 —— 别改回精铁。
     *   ⚠️ 工坊（workshop）原本的效果正是「解锁珊瑚→骨材」⇒ **它现在是空壳**，效果待设计。
     *   保暖术（hearthfire）的尤里卡 cond 原为「骨材 50」，已改挂「建成工坊」。 */
    iron:    { name: '精铁', short: '铁', unlock: { build: 'furnace' }, storageEra: 2 },
    /* 钢（2026-10-06 用户拍板移位）：**放在精铁下面一格**，顶栏与精铁同区（不再是工艺资源）。
     *   ⚠️【为什么从工艺区挪出来】用户原话「钢应该放到精铁下面一格，而不是放到工艺资源里」。
     *      语义依据：钢与精铁是**同一条金属链的相邻两级**（精铁 = 金属+暖石经热泉炉，
     *      钢 = 精铁经金属精炼/热液工坊），玩家在顶栏找钢时，眼睛是从精铁往下扫的；
     *      之前把钢丢进「工艺资源」那个折叠区，等于把主线材料藏进配件抽屉。
     *   ⚠️【位置由定义顺序决定】renderRes 按 `for (var k in SB.RESS)` 遍历，
     *      而 `kind:'craft'` 会被分到独立的 res-craft 区（见 ui/render.js）。两件事都要改：
     *      ① 这条必须紧跟在 iron 之后（键顺序 = 显示顺序）；② kind 摘掉 ⇒ 进主区。
     *   ⚠️【其余口径不动】不给 CAP_BASE 键 ⇒ capOf 恒 Infinity（无仓储上限，2026-09-29 用户
     *      拍的「钢上限抄猫国」，猫国 steel 的 effects 里也没有 cap 字段）；unlock 仍挂
     *      金属精炼科技；UNIT 键照旧没有（钢不按时产出，走 hydroshop 吃热液能）。 */
    steel:    { name: '钢', short: '钢', unlock: { tech: 'metalrefine' } },
    /* 钛（ERA4 · 2026-09-30 产出 / 2026-10-07 用户拍板重分类）：由工坊升级「深层矿井」在矿工线上伴生产出，
     *   是**采集类材料**（与石头/矿砂/暖石/精铁同族，由职业按时产出），不是工艺制品 ⇒ 摘掉 kind:'craft'、
     *   从「工艺资源」折叠区挪回资源主区（对标猫国 titanium：后期稀疏副材，有自身仓储档位）。
     * ⚠️ 给 CAP_BASE.titanium 键（=200，对齐 iron/silt 档）⇒ capOf 有有限上限（不再是 Infinity）。
     *   猫国原版钛主要来自斑马贸易、矿井直产是本作变体；基准产率见 UNIT.titanium。
     *   满仓浪费判定现已对它生效；自动槽对 resonantDrill（吃 10 钛）的「满仓判定」也随之激活。
     *   ⚠️ 位置 = 定义顺序：放在 steel 之后，顶栏跟其他矿石扎堆；别挪回 ERA4 块（会掉到 faith 后面）。 */
    titanium:  { name: '钛', short: '钛', unlock: { tech: 'physics' }, storageEra: 4 },
    /* ERA7（2026-10-17 实装 · spec docs/ERA7_TECHS_SPEC_v0.1.md §2）：铀 —— 矿工伴生采集材料
     *   （0.002/秒/人，暖石 0.05 的 1/25，稀有度对齐），研究《自动化钻探》（autodrill）后出现。
     *   ⚠️ 与钛的门不同：钛挂买断升级 upg_deepmine，铀按 spec 直接挂科技门（spec §2 拍板）。
     *   CAP_BASE.uranium=200（对齐 iron/silt 档）。位置=定义顺序：跟钛扎堆（同为稀有采集材料）。 */
    uranium:   { name: '铀', short: '铀', unlock: { tech: 'autodrill' }, storageEra: 7 },
    /* ERA6：钛金板件 —— 工坊用钛合成的「壳外」制造料（对标猫国钛合金走工坊），
     *   属工艺资源（kind:'craft'），按统一规则无仓储上限。
     *   解锁权双写：craft_tiplate 配方的 need:'minipump' 真读（与铁制支架/绳同构），科技侧 eff 留空不写死键。 */
    tiplate:    { name: '钛金板件', short: '板', kind: 'craft', unlock: { tech: 'minipump' } },
    /* ERA8（2026-10-18）：θ生物金属是普通库存资源，由生物材料研究所制造，基础仓储上限 200；
     *   与工艺资源区分开，不标 kind:'craft'。解锁权挂科技『生物材料』（biomat）。 */
    thetaMetal: { name: 'θ生物金属', short: 'θ', unlock: { tech: 'biomat' }, storageEra: 8 },
    /* ERA8 市政（2026-10-18 · 用户市政表 H2 拍板）：θ金属自适应薄膜成为**可持有资源**——
     *   上一波实装时工艺产出折算成了钛金板件（避免「无 CAP 无去处的工艺资源」），
     *   但用户市政表《虚拟现实》解锁的奇观「魔鱼世界VR」造价是「薄膜 ×10」，
     *   折算方案下薄膜这个持有物不存在 ⇒ 造价无附着点。改为独立资源，
     *   craft_thinafilm 产出同步改指 thinafilm；作为工艺资源不设仓储上限。 */
    thinafilm: { name: 'θ金属自适应薄膜', short: '膜', kind: 'craft', unlock: { tech: 'nanotech' } },
    /* ERA9（2026-10-19 实装）：强工质火箭引擎 —— 由「行星际航行」工艺制造（燃料500 + θ金属10 → 1），
     *   是 mars_workshop / europa_launch 的造价与运行耗料（用户规格）。工艺资源，不设仓储上限，与 thinafilm 同纪律。 */
    strongProp: { name: '强工质火箭引擎', short: '箭', kind: 'craft', unlock: { tech: 'interplanetary' } },
    /* ERA6（2026-10 实装）：星空探索 —— 轻量版「星图进度」替代资源（星图系统晚点立项）。
     *   exostruct 解锁资源显示（0/s）；实际产出由星空观测站升级（upg_starscope）每 tick +1 提供，耗 1 热液能。
     *   有 CAP_BASE.starExplore 上限键（1e9 占位，见 config.js CAP_BASE.starExplore；ERA7 完工后标定为太空时代结局阈值）。 */
    starExplore:{ name: '星空探索', short: '星', unlock: { tech: 'exostruct' }, storageEra: 6 },
    /* 科技（科技点）：门控挂在「结绳」(writing) 上，而不是「书写」(scholarT)。
     * 学者职业由免费项结绳解锁、且科技面板在结绳完成时才开门——这正是玩家
     * 开始产出/消耗科技点的时点。若挂在 scholarT，整段前期（凿珊瑚/采石/种植/
     * 历法/畜牧/采矿/海潮占卜/书写本身）都看不到科技存量，等于盲打研究。 */
    science: { name: '科技', short: '科', unlock: { tech: 'writing' } },
    fuel:    { name: '地热', short: '热', unlock: { build: 'geyser' }, storageEra: 1 },  // 热泉井已删 ⇒ 永不显示
    /* 市政点（2026-09-27 用户拍板「对标科技点」新开的资源线，见 docs/CIVICS_v0.1.md §3）。
     * 与科技分属两个池子 ⇒ 两条树可以错开冲刺，这是 Civ6 那条「文化是独立资源」的落地。
     * ⚠️ **CAP_BASE 里故意不给 culture 键**：沿用 science 的做法（走 Infinity）——
     *    市政点唯一的去处是解锁市政，撞上仓储上限只会让玩家在「快够 100 点」时被卡住、
     *    而那 100 点又不存在「花不掉」的问题。加键前先想清楚这条。
     * ⚠️ 2026-10-05 用户拍板：显示门 **`{build:'temple'}` → `{build:'hall'}`**（修死锁）。
     *   【原门是死循环】culture 显示 ⇐ 建成神庙 ⇐ 完成《神学》⇐ **花 600 市政点** ⇐
     *   书手产出。而神学还要 25 人口（civics.js:112）⇒ 玩家「看不到自己有多少市政点，
     *   却要花 600 点去解锁让市政点显形的东西」，且议事厅没建之前那格永远不出现。
     *   【为什么挂议事厅】① `masonry`（石工）**同时**解锁议事厅与书手
     *   （techs.js:249-251）⇒ 石工一研究完，市政点立刻可见，而那正是你开始产点的时刻；
     *   ② 议事厅本来就是市政树的门（`civics.panelOpen` = 议事厅建成 ≥ 1），
     *   市政点在自家门厅显形，语义闭环；③ 神庙是**era2 信仰建筑**（requiredCivic:'theology'
     *   + 石头150/金属50），拿它当「市政点可见性」的门是把资源线绑到另一条树上。
     *   （2026-10-06 曾为城堡「真升级」短暂改成 `unlockBuildAny:['hall','castle']`，
     *     那是按「两座建筑并存」的误读加的；城堡既然只是议事厅的新名字，这里照旧单挂 hall。） */
    culture: { name: '市政点', short: '政', unlock: { build: 'hall' } },
    /* 奢侈品（2026-09-28 用户规格 · 市政《对外贸易》解锁商人后取得的货物）。
     * 【它现在的地位】陆地贸易系统（用户明说「之后设计」）此刻**还不存在**，
     *   所以奢侈品是一条**只有进项、没有开销**的资源线：商人会把它产出来，
     *   但没有任何东西会吃掉它。这不是漏接，是用户拍的顺序——先把资源线铺出来，
     *   贸易规则等设计完再挂（挂在 tick 的资源行上，届时只加一处消耗）。
     * ⚠️【CAP_BASE 里照样不给 luxury 键】与 science / culture 同口径 ⇒ capOf 恒
     *   返回 Infinity。理由更深一层：贸易系统一旦落地**必然要设上限**（否则玩家
     *   可以靠无限囤货把贸易买空），但在有开销之前设上限只会让「攒着等贸易」的
     *   玩家被莫名其妙卡住。等贸易规则拍板，这里要跟着加键——那条注释就是留给它
     *   的，别在这儿偷偷加。 */
    /* ⚠️ 2026-10-05 用户拍板：显示门从 `{job:'merchant'}` 改成 **`{civic:'trade'}`**
     *   （完成市政《对外贸易》）—— 原门是「商人已上岗」，于是**没人派商人时这两格
     *   整个消失**，用户报「是因为没有商人工作的时候，奢侈品和幸福度就消失了，不行」。
     *   【为什么对照易贸易而不是继续用 job】① 对外贸易是**解锁商人**的那一项
     *   （civics.js:88 `job:'merchant'`），也就是「奢侈品这条线存在了」这个事实本身；
     *   ② 用 job 门时玩家要「先雇一个人」才看得见那条线的资源与维护条 ——
     *   而雇人本身要花人口、且人口不足时雇不了 ⇒ 玩家在最需要看懂这条线时看不见它；
     *   ③ 对照易之后即使一个商人都不派，也照样显示「供给 0.000 / 需求 X」，
     *   玩家能直接看到「我缺商人」这件事本身，这正是他要的信息。
     * ⚠️ **只改显示门，不改产出线**：贸易供给（happySupply）与消耗（happyBurn）
     *   仍然是「商人=0 ⇒ 供给 0」，`tick` 那个 `if (_S <= 0)` 分支照旧（幸福度保底）。
     *   也就是说这纯粹是「把仪表盘提前装上」，不给任何免费产出。
     * ⚠️【CAP_BASE 里照样不给 luxury 键】与 science / culture / faith 同口径 ⇒ capOf 恒
     *   Infinity。理由：贸易系统尚未落地，撞仓储上限只会让攒着等贸易的玩家被卡住。 */
    luxury: { name: '奢侈品', short: '奢', unlock: { civic: 'trade' } },
    /* 信仰（2026-09-28 用户规格 · 市政《神学》完成后解锁的资源线）。
     * 【它现在的地位，与奢侈品完全同形】宗教界面是用户明说「之后设计」的东西，
     *   所以信仰此刻也是一条**只有进项通道、没有开销**的资源：神庙已经把
     *   「每级 +10%」的乘区接好了，但**没有任何东西消耗它**，宗教系统落地时
     *   才有第一笔开销（多半挂在 tick 的资源行上，届时只加一处）。
     * ⚠️【CAP_BASE 里照样不给 faith 键】与 science / culture / luxury 同口径 ⇒ capOf 恒
     *   返回 Infinity。理由与奢侈品一致：宗教一旦落地必然要设「信仰盈余」这类上限，
     *   但在有开销之前设上限，只会让攒着等宗教的玩家被莫名其妙卡住。
     *   等宗教规则拍板，这里要跟着加键——注释是留给它俩的，别在这儿偷偷加。 */
    faith: { name: '信仰', short: '信', unlock: { civic: 'theology' } },
    /* 石梁（2026-09-27 用户拍）：**工艺制作的产物**，不是采集出来的。
     * ⚠️ **故意不给 CAP_BASE.stoneBeam 键** ⇒ economy.capOf 恒返回 Infinity ⇒ 石梁无仓储上限。
     *    ⚠️ 这不是「忘了写」，是**用户拍过的设计**（跟猫国 beam 一致：
     *       猫国 warehouse 的 effects 只有 catnipMax/woodMax/mineralsMax/coalMax/ironMax/
     *       titaniumMax/goldMax，**没有 beamMax**，于是 maxValue=0 → falsy → Number.MAX_VALUE）。
     *       后果是玩家可以在石头满仓时把石头全刷成石梁（仓库对石头失去意义），
     *       这是**已接受的代价**，见 docs/CRAFTS_WONDER_DESIGN.md §2.3。
     * ⚠️ **UNIT 里也不给 stoneBeam**：UNIT[k] 的语义是「每职业每人每秒产出」，
     *    石梁不是按时产出的（只能手动制造），所以没有 UNIT 条目是对的，
     *    不是「漏了」。别顺手补，补了也没人读。 */
    stoneBeam: { name: '石梁', short: '梁', kind: 'craft', unlock: { build: 'workshop' } },

    /* ── 工艺制品 · 铁制支架 / 绳（2026-09-28 · era2 第三层）──
     * 【它们是什么】下面两张「工艺升级项」的**唯一成本**，用户规格原文
     *   「各自消耗 50 铁制支架和 50 绳」。既然要**成批消耗**，它们就必须是反复可造的
     *   消耗品，不能是买断的工具 —— 这正是它们落到 RESS + CRAFTS 而不是 TOOLS 的原因。
     * ⚠️ 完全照石梁那套口径来（那条的注里有完整论证，不重复）：
     *    · 不给 CAP_BASE 键 ⇒ capOf 恒 Infinity ⇒ 无仓储上限；
     *    · 不给 UNIT 键 ⇒ 不按时产出，只能由工坊造。
     * ⚠️ 为什么**资源本身**也要加（有配方不就够了吗）：升级项要吃 50 份，而
     *    workshop.lackText 报的是「还缺 ironBracket 50（现有 0）」。若制品只是配方
     *    产物而没有 RESS 条目，扣费时 `s.res[k]` 全是 undefined，blocked 会报
     *    「还缺 undefined 50」，玩家看不懂自己到底缺什么。 */
    ironBracket: { name: '铁制支架', short: '架', kind: 'craft', unlock: { tech: 'engineeringT' } },
    rope:        { name: '绳',      short: '绳', kind: 'craft', unlock: { tech: 'scaffoldT' } },
    /* 硬化珊瑚（2026-09-29 用户拍）：**工艺制作的产物**，对标猫国 beam（木 175→1 的木结构件）。
     * 珊瑚 ≈ 猫国 wood，海洋题材里「硬化珊瑚」就是珊瑚二次加工成的初级木结构件等价物。
     * 完全照石梁/铁制支架/绳那套口径：不给 CAP_BASE 键（capOf 恒 Infinity，无仓储上限）、
     * 不给 UNIT 键（不按时产出，只能由工坊造）。压舱仓（对标猫国 warehouse）的建造成本
     * 吃 2 份，对应猫国 warehouse 每级吃 beam 1.5 + slab 2 的「两种初级结构件」分工。 */
    hardCoral:  { name: '硬化珊瑚', short: '硬', kind: 'craft', unlock: { build: 'workshop' } },
    /* 钢（steel）已于 2026-10-06 按用户拍板**上移到 iron（精铁）下面一格**、并摘掉
     *   `kind:'craft'`（不再进顶栏的「工艺资源」折叠区）。定义现在在 iron 那条之后，
     *   理由与口径见那里的注释。别在这里加回来 —— 位置 = 键顺序，一份定义只能有一处。 */
    /* 热液能（2026-09-29 ERA3 · 2026-10-05 重做为 flow 模型）：汽轮机产流、工坊/钻机当场吃流，
     *   **不进库存、不跨 tick 累积**——是电力式瞬态流（见 economy.hydroAlloc）。
     *   不给 CAP_BASE 键 ⇒ capOf 恒 Infinity（无仓储上限，也本就不该囤）。
     *   ⚠️ flow:true = 顶栏按「电力」样式渲染（renderRes）：主数=每秒供给、速率行=消耗(负向红)。
     *      判据是「这行主数不是存量」——存量资源的 rate 是净值涨落，flow 资源的 rate 是被吃掉的量。 */
    hydro:      { name: '热液能', short: '液', kind: 'craft', flow: true, unlock: { tech: 'metalrefine' } },
    /* 钢制零件（2026-09-29 ERA3 · 工艺制品）：25 钢 → 1，对标铁制支架口径
     * （不给 CAP_BASE 键 ⇒ 无仓储上限；不给 UNIT 键 ⇒ 不按时产出，只能工坊造）。
     *   阿尔巴达热液大学(50) 与 大学升级(50) 吃它。 */
    steelPart:  { name: '钢制零件', short: '件', kind: 'craft', unlock: { tech: 'metalrefine' } },
    /* ── ERA4（2026-09-30 用户规格）──
     * 【脚手架】工艺制品：硬化珊瑚 100 + 绳 100 → 1（天壳切削器的原料）。
     *   与石梁/铁制支架同口径：不给 CAP_BASE 键 ⇒ capOf 恒 Infinity（无仓储上限）、
     *   不给 UNIT 键 ⇒ 不按时产出、只能工坊造。
     *   ⚠️【钛已移走】钛 2026-10-07 用户拍板**重分类为资源主区材料**（摘 kind:'craft' +
     *   CAP_BASE.titanium=200），定义挪到 steel 之后；它的 ERA4 产出/标定注见那里。 */
    scaffold:   { name: '脚手架', short: '架', kind: 'craft', unlock: { tech: 'physics' } },
    /* ── ERA4 工艺制品（2026-10-01 用户设计稿）──
     * 艺术品 / 潮纹记录：由《历史哲学》解锁的工艺制品（craft 表）。cost 用户拍定
     * （艺术品 5000 市政+100 绳 / 潮纹记录 5000 科技+10 钢零件）。产出物当前无消费者
     * （pending 重设计），按「工艺制品」占位，kind:'craft'、不给 CAP_BASE 键（无仓储上限）。 */
    artwork:     { name: '艺术品', short: '艺', kind: 'craft', unlock: { civic: 'historiography' } },
    tidalRecord: { name: '潮纹记录', short: '录', kind: 'craft', unlock: { civic: 'historiography' } },
    /* ── ERA5（2026-10-02 实装）──
     * 【共振钻头】由「天穹钻机」机器运行时消耗（每 tick 扣 0.1，见 wonder_skydrill 的机器逻辑占位）；
     *   工艺制品，对标石梁/钢制零件口径：不给 CAP_BASE 键（capOf 恒 Infinity，无仓储上限）、
     *   不给 UNIT 键（不按时产出，只能由工坊造）。unlock 挂在 shellgeo（天壳地质学，钻机的前置科技）。 */
    resonantDrill: { name: '共振钻头', short: '钻', kind: 'craft', unlock: { tech: 'shellgeo' } },
    /* ERA6（2026-10 实装）：封闭藻仓 —— 工艺物品（craft_sealbin 制造，need:'sealbin' 科技门）。
     *   与石梁/铁制支架同口径：由工坊配方造出来、无 CAP_BASE 上限键（capOf 恒 Infinity）。 */
    sealbin:    { name: '封闭藻仓', short: '舱', kind: 'craft', unlock: { tech: 'sealbin' } },
    /* ── ERA7（2026-10-17 实装 · spec docs/ERA7_TECHS_SPEC_v0.1.md §2）──
     * 【燃料 rocketFuel】工艺制品：100 暖石 → 1（craft_rocketfuel，need:'refine'）。
     *   ⚠️ id 不能叫 fuel —— 被已删除的「地热」占用（RESS.fuel 那条永不显示），不可复用（spec §1）。
     *   工艺资源无仓储上限，摇篮奇观消耗 10000 不会被容量挡住。
     * 【火箭引擎 rocketEngine】工艺制品：燃料 200 + 封闭藻仓 10 → 1（craft_rocketengine，need:'crewed'）。
     *   火箭引擎同样无仓储上限。
     * 【星屑 stardust】跨周目局外资源：结算发放并可在星穹商店兑换，不做逐秒产出
     *   ⇒ 无 UNIT 键、无 tick/rates 行；故意不给 CAP_BASE 键（同 science/culture 口径 ⇒ capOf 恒 Infinity）。
     *   显示门=首个太空建筑建成（satellite 由波次3实装，门先挂上不阻塞）。 */
    rocketFuel:   { name: '燃料', short: '燃', kind: 'craft', unlock: { tech: 'refine' } },
    rocketEngine: { name: '火箭引擎', short: '引', kind: 'craft', unlock: { tech: 'crewed' } },
    stardust:     { name: '星屑', short: '尘', unlock: { build: 'satellite' } }
  };

  /* ── 工艺制作配方（2026-09-27 用户拍）───────────────────────────────
   * 工坊的**下半区**。与上半区的「青铜工具」（买断、永久）是两种完全不同的形态：
   *   工具 = 买一次就完事；配方 = 可以反复制造。
   * ⚠️ 形参照猫国 `js/workshop.js` 的 crafts 数组 + `js/jsx/left.jsx.js` 的四颗按钮。 */
  var CRAFTS = [
    /* ⚠️ `need` 现在是**真字段**，由 workshop.craftBlocked 真读（2026-09-28 补的门，
     *    见 workshop.js craftBlocked 那条注）。
     * ⚠️ 石梁原来写的 `need:'workshop'` 已**删除**：`workshop` 既是**建筑 id**（工坊），
     *    也读起来像某个科技 id，但 techs.js 里**根本没有 id 为 workshop 的科技** ⇒
     *    那个 need 指向一个不存在的科技。以前 craftBlocked 不读 need 所以无害，
     *    一旦开始读它，石梁就会因为「没研究一个不存在的东西」而**永远造不出来**。
     *    石梁的门槛本来就是「建成工坊」（那道硬编码的门已经拦着了），need 留着只会误导。
     * ⚠️ 与此同源的还有 BUILDINGS 里 furnace 的 `need:'workshop'`（死字段，注释已自认）。 */
    { id: 'craft_stonebeam', name: '石梁',
      /* in = 每次制造消耗的原料；out = 每次制造的**基准**产出。
       * ⚠️ 实际产出 = out × (1 + 工艺制作效率)，不是 out × out×(1+ratio) —— 见 workshop.craft。 */
      in: { stone: 100 }, out: 1, res: 'stoneBeam',
      desc: '把石头凿成可搬运的梁。暂时供海潮方碑使用，以后给更多建筑。' },

    /* ── 初级结构件 · 硬化珊瑚（2026-09-29 用户拍 · era1 · 对标猫国 beam）──
     * 【对标】猫国 beam = wood 175 → 1 的「木结构件」，是全游戏最基础的初级结构件，
     *   被 warehouse / 3 个工坊升级 / 2 个工坊配方吃。本作珊瑚 ≈ 猫国 wood，
     *   「硬化珊瑚」就是珊瑚二次加工成的木梁等价物（海洋题材里珊瑚就是脊梁）。
     * 【need 留空】与石梁同口径：门槛是「建成工坊」那道硬编码门，不需要再写一个
     *   不存在的 need（见石梁那条注，写死 need 会让配方永远造不出来）。
     * 【in = coral 100】用户拍定终值（不再写「待标定」）。
     *   压舱仓建造成本吃 2 份（见 BUILDINGS.ballast），对应猫国 warehouse 每级吃
     *   beam 1.5 + slab 2 的「两种初级结构件」分工；藻食库那边仍由石梁承接（slab 对标）。 */
    { id: 'craft_hardcoral', name: '硬化珊瑚',
      in: { coral: 100 }, out: 1, res: 'hardCoral',
      desc: '把珊瑚硬化成可承力的结构件。压舱仓的建造成本之一。' },

    /* ── 工艺制品两件（2026-09-28 · era2 第三层 · 由下面 UPGRADE 表消耗）──
     * 【为什么 need 指向真实科技】'engineering'（工程学）/ 'scaffoldT'（构架术）
     *   两项都在 era2 第三层，写的是真 id。写死一个不存在的 id 会让配方永远造不出来
     *   —— 这类断链不报错、不 NaN，只是「研究完了什么都没发生」，本项目已踩过多次。
     * 【in 的量是 2026-09-29 用户拍定的终值】（不再写「待标定」）：
     *   · 铁制支架 iron 20 ⇒ 凑齐 50 个要 1000 精铁（全网还需压舱库/藻食库两道升级各 50，
     *     合计 150 个 ⇒ 3000 精铁）。CAP_BASE.iron = 200，要堆压舱仓才够得着，是有意门槛。
     *   · 绳 kelp 100 ⇒ 50 条要 5000 藻食（全网 150 条 ⇒ 15000 藻食）。CAP_BASE.kelp = 200，
     *     海藻仓 +5000/级 ⇒ 3 级即够；但 藻食库扩容 I 本身要 50 绳（5000 藻食），
     *     先做绳再买升级是天然序 —— 别把藻食造价推到超过玩家届时拿得到的仓储。 */
    { id: 'craft_ironbracket', name: '铁制支架', need: 'engineeringT',
      in: { iron: 20 }, out: 1, res: 'ironBracket',
      desc: '热泉炉里取出的支撑件。压舱库 / 藻食库扩容的原料。' },
    { id: 'craft_rope', name: '绳', need: 'scaffoldT',
      in: { kelp: 100 }, out: 1, res: 'rope',
      desc: '搓出来的捆扎件。压舱库 / 藻食库扩容的原料。' },

    /* ── 钢制零件（2026-09-29 ERA3 · 金属精炼解锁的工艺制品）──
     * 【对标铁制支架口径】RESS.steelPart 那条已写：不给 CAP_BASE 键（无上限）、不给 UNIT 键
     *   （只能工坊造）。这里只补配方。阿尔巴达热液大学(50) 与 大学升级(50) 吃它。
     * 【need: 'metalrefine'】解锁权写在这里（与 TOOLS[].need 同构），金属精炼那项只负责
     *   把它标成可研究，不在科技 eff 里写 unlockCraft 死键。 */
    { id: 'craft_steelpart', name: '钢制零件', need: 'metalrefine',
      in: { steel: 25 }, out: 1, res: 'steelPart',
      desc: '把钢锻成结构件。阿尔巴达热液大学与大学升级的原料。' },

    /* ── 脚手架（2026-09-30 ERA4 · 由工艺制作用）：硬化珊瑚 100 + 绳 100 ⇒ 1 ──
     * 【need: 'physics'】同一性写在配方这儿，科技那边只负责把它标成可研究（与 TOOLS[].need 同构）。
     * 【去处】天壳切削器（奇观）吃掉 100 个（2026-10-17 全局脚手架消耗减半）；将来其它高价施工也可复用。 */
    { id: 'craft_scaffold', name: '脚手架', need: 'physics',
      in: { hardCoral: 100, rope: 100 }, out: 1, res: 'scaffold',
      desc: '把硬化珊瑚与绳捆成作业面。天壳切削器的原料。' },

    /* ── 工艺制品两件（2026-10-01 ERA4 · 历史哲学解锁）──
     * 【解锁】走 needCivic（与奇观 needCivic 同构，见 workshop.craftBlocked）：
     *   完成《历史哲学》前这两张配方整条锁住，避免「研究完了什么都没发生」那类静默断链。
     *   ⚠️ 不写 need（tech id）—— craftBlocked 的 need 门只读 s.techs，写成科技 id 会永远造不出来。
     * 【in 的量是设计稿提议值，时长核算未启动前先按此落地，待统一重做时再校准】：
     *   · artwork：culture 5000 + rope 100；
     *   · tidalRecord：science 5000 + steelPart 10。 */
    { id: 'craft_artwork', name: '艺术品', needCivic: 'historiography',
      in: { culture: 5000, rope: 100 }, out: 1, res: 'artwork',
      desc: '把文明凝成可陈列的造物。历史哲学的造物之一。' },
    { id: 'craft_tidal_record', name: '潮纹记录', needCivic: 'historiography',
      in: { science: 5000, steelPart: 10 }, out: 1, res: 'tidalRecord',
      desc: '把潮纹读成可传承的知识。历史哲学的造物之一。' },

    /* ── ERA6 工艺制品（2026-10 实装 · 热液泵小型化 / 密闭水仓 解锁）──
     * 【钛金板件】由「热液泵小型化」解锁（craft_tiplate 的 need:'minipump'）。纯钛 50 → 1 板件：
     *   矿工伴生钛（upg_deepmine）是唯一来源，工坊把它压成「壳外」才用得上的结构件。
     *   ⚠️ 钛已存在（ERA4 矿工伴生），本项**不是首次引入钛**——解锁的是工坊的「钛→板件」配方。
     * 【封闭藻仓】由「密闭水仓」解锁（craft_sealbin 的 need:'sealbin'）。工艺物品（kind:'craft'），
     *   是温水藻场升级（upg_warmalgalfarm）的制造前置。in 的量是提议值，待标定。 */
    { id: 'craft_tiplate', name: '钛金板件', need: 'minipump',
      in: { titanium: 50 }, out: 1, res: 'tiplate',
      desc: '把钛压成壳外才用得上的结构件。每 50 钛出 1 板件。' },
    { id: 'craft_sealbin', name: '封闭藻仓', need: 'sealbin',
      in: { tiplate: 5, kelp: 200 }, out: 1, res: 'sealbin',
      desc: '用钛金板件封住藻仓，存住温水藻场。温水藻场升级的材料。' },

    /* ── ERA5 工艺制品（2026-10-02 实装）──
     * 【共振钻头】天穹钻机机器运行时每 tick 消耗的耗材（wonder_skydrill 机器逻辑占位）。
     *   对标石梁/钢制零件口径：不给 CAP_BASE 键（无仓储上限）、不给 UNIT 键（只能工坊造）。
     *   need 指向 shellgeo（天壳地质学）—— 与 RESS.resonantDrill 的解锁轴一致（双写）。 */
    { id: 'craft_drill', name: '共振钻头', need: 'shellgeo',
      in: { steelPart: 10, titanium: 10, rope: 100 }, out: 1, res: 'resonantDrill',
      desc: '把钢制零件、钛与绳锻成可以啃穿天壳的钻头。天穹钻机的耗材。' },

    /* ── ERA7 工艺配方（2026-10-17 实装 · spec §2）──
     * 【燃料】100 暖石 → 1。need='refine'（ERA6 精炼）：火箭研究的尤里卡是「累计燃料 1000」，
     *   配方门必须**早于**火箭研究本身，否则「攒燃料的门被火箭锁死」= 死锁。
     *   100:1 维持用户拍板（§0-1「不用管，没问题」）。
     * 【火箭引擎】燃料 200 + 封闭藻仓 10 → 1。need='crewed'（载人航天）——与 RESS.unlock 双写一致。 */
    { id: 'craft_rocketfuel', name: '燃料', need: 'refine',
      in: { warmstone: 100 }, out: 1, res: 'rocketFuel',
      desc: '把暖石高压精炼成火箭燃料。每 100 暖石出 1 份燃料。' },
    { id: 'craft_rocketengine', name: '火箭引擎', need: 'crewed',
      in: { rocketFuel: 200, sealbin: 10 }, out: 1, res: 'rocketEngine',
      desc: '燃料与封闭藻仓组装成的火箭引擎。空间站的建造材料。' },

    /* ── ERA9 工艺配方（2026-10-19 实装）──
     * 【强工质火箭引擎】燃料 500 + θ金属 10 → 1。need='interplanetary'（行星际航行，与 RESS.unlock 双写轴同构）。
     *   工艺资源 strongProp（RESS.unlock:{tech:'interplanetary'} 同源门），不设仓储上限。 */
    { id: 'craft_strongprop', name: '强工质火箭引擎', need: 'interplanetary',
      in: { rocketFuel: 500, thetaMetal: 10 }, out: 1, res: 'strongProp',
      desc: '行星际航行解锁的工艺制造：燃料 500 + θ金属 10 合成 1 枚强工质火箭引擎。' },

    /* ── ERA8 工艺配方（2026-10-18 实装 · spec §4）──
     * 【θ金属自适应薄膜】need='nanotech'（纳米技术，与 RESS.unlock 双写轴同构——
     *   纳米技术的尤里卡是「θ金属产出 5/秒」，配方门天然晚于产线存在，无死锁）。
     * 【产出 = tiplate】把 100 θ生物金属压成 1 块高规格钛金板件——
     *   薄膜是 θ 金属的「降维出口」：θ 是 era8 新材料，出产时还没有自己的消费链，
     *   折回 tiplate 这条已有全链消费（奇观/太空建筑/合金仓储）的板件，
     *   不引入第三个无 CAP 无去处的工艺资源（石梁那条注的同一条纪律）。
     *   100:1 与燃料（100 暖石）、火箭引擎（200 燃料）同档偏贵——θ 同时是建筑造价主料，刻意稀缺。 */
    { id: 'craft_thinafilm', name: 'θ金属自适应薄膜', need: 'nanotech',
      in: { thetaMetal: 100 }, out: 1, res: 'thinafilm',
      /* 2026-10-18 市政表 H2：产出从折算 tiplate 改为独立资源 thinafilm——
       *   魔鱼世界VR 造价「薄膜 ×10」需要它可持有；工艺资源统一无上限。 */
      desc: '把 θ生物金属压成自适应薄膜。每 100 θ 出 1 卷薄膜（魔鱼世界VR 的建造材料）。' }
  ];

  /* ── 工艺升级项（2026-09-28 用户规格 · era2 第三层）───────────────
   * 【形参照猫国的工坊升级】`docs/KITTENS_BASELINE.md` §仓库乘区那张表：
   *     stoneBarns        barnRatio +0.75   wood 1000 / minerals 750 / iron 50 / science 500
   *     reinforcedBarns   barnRatio +0.80   iron 100 / science 800 / beam 25 / slab 10
   *     reinforcedWarehouses warehouseRatio +0.25  science 15000 / plate 50 / steel 50 / scaffold 25
   *   猫国那批是**满级累积**到 barnRatio 4.35（×5.35）/ warehouseRatio 1.80（×2.80），
   *   本作用户规格只给「+50%」，所以这里是 ×1.5 的**第一级**。名字后缀 `I` 就是用来
   *   提醒「后面还有 II / III」的 —— 将来加级**只改这张表**，economy.capOf 那条乘区
   *   通道已经架好（读 s.upgrades），不用回头改实现。
   * 【两条的分工 = 猫国的主材/副材分工】catnipMax 吃 barnRatio、其余吃 warehouseRatio。
   *   所以「藻食库扩容」只动藻食、「压舱库扩容」只动其余材料 —— 这是用户拍的口径
   *   （选项 A）。⚠️ 反过来若两条都挂全局 ×1.5，两件都买会平方成 ×2.25，
   *   那是同一个东西被计价两次，属于重复计价。
   * 【成本 = 本层新造的两件工艺制品，各 50 + 50】用户规格原文「各自消耗 50 铁制支架和
   *    50 绳」。⚠️ 是**每条各自都要** 50+50，不是两条加起来 50 —— 别自己省。
   * 【`need: 'engineeringT'`】解锁权写在这里而不是科技表里，与 TOOLS[].need 同构：
   *   「解锁某件东西」属于工坊，科技只负责把它标成可研究。在科技 eff 里再写一个
   *   `unlockUpgrade` 键会造出全仓无人读取的死键（同 unlockTool 那个教训）。 */
  /* ⚠️ `capMul` 是 economy.capOf 读的那个数（见那里），**不写死在 economy 里** ——
   *    将来加级只改这一张表。⚠️ 乘的是「基础 + 等级增量 + 科技/奇观加成」**整体**
   *    （`× 1.5` 作用在整条容量上），不是只乘增量 —— 与猫国 `effect *= 1 + ratio` 同式；
   *    但只覆盖 `capEra` 及之前解锁的资源，不再预抬后期资源的上限。
   *    若只乘增量，玩家基础容量 0 时买升级等于没买，这是「乘区作用错了对象」。 */
  var UPGRADES = [
    { id: 'upg_ballast_1', name: '压舱库扩容 I', need: 'engineeringT', capEra: 2,
      capMul: 1.5,
      cost: { ironBracket: 50, rope: 50 },
      desc: '已解锁至纪元二的材料仓储上限 ×1.5（藻食除外）' },
    { id: 'upg_kelpstore_1', name: '藻食库扩容 I', need: 'engineeringT', capEra: 2,
      capMul: 1.5,
      cost: { ironBracket: 50, rope: 50 },
      desc: '藻食上限 ×1.5' },
    /* ── 压舱库 / 藻食库 扩容 II（2026-10-01 用户拍：放城堡科技解锁，成本对标猫国）──
     * 形制与 I 同构：need=城堡(科技) 解锁门；capMul=1.5 与 I 的 1.5 **连乘** ⇒ 两档都装 ⇒ 整条容量 ×2.25。
     * 成本对标猫国仓储乘区升级的「二阶」档：reinforcedBarns（铁 100 / 科技 800 / 梁 25 / 板 10）
     *   较首档 stoneBarns（木 1000 / 矿 750 / 铁 50 / 科技 500）≈ 材料 2 倍 + 引入更高阶料。
     * 本作升级只吃材料（不耗科技点），故把猫国「二阶多出的那笔科技闸门」折算成更高阶材料 hardCoral，
     * 终值 ironBracket 100 + hardCoral 150（≈ I 的 3.5 倍、且改用 era3 高阶料，符合「城堡才解锁」档位）。
     * ⚠️ 未设「需先装 I」的前置：与猫国各乘区升级相互独立同构；若要强制 II 依赖 I，需在 workshop.upgradeBlocked 加 reqUpg 判据。 */
    { id: 'upg_ballast_2', name: '压舱库扩容 II', need: 'castle', capEra: 3,
      capMul: 1.5,
      cost: { ironBracket: 100, hardCoral: 150 },
      desc: '已解锁至纪元三的材料仓储上限再 ×1.5（与 I 叠加，藻食除外）' },
    /* ERA6 通用仓储扩容：只作用于已解锁至纪元六的有上限材料；后续纪元的新资源
     *   不继承旧升级加成。藻食仍走独立扩容线。成本参照猫国 alloyWarehouses 的钛 / 科技 / 合金组合。 */
    { id: 'upg_alloy_warehouse', name: '合金仓储', need: 'minipump', capEra: 6,
      capMul: 1.5,
      cost: { tiplate: 50, titanium: 750, science: 200000 },
      desc: '已解锁至纪元六的非藻食资源仓储容量 ×1.5' },
    { id: 'upg_kelpstore_2', name: '藻食库扩容 II', need: 'castle', capEra: 3,
      capMul: 1.5,
      cost: { ironBracket: 100, hardCoral: 150 },
      desc: '藻食上限 再 ×1.5（与 I 叠加 ⇒ 合计 ×2.25）' },

    /* ── ERA3 工艺升级项（2026-09-29 · 学徒制/金属精炼/教育/城堡/马镫 解锁）──
     * 【形制与 era2 两道扩容同构】need 字段是解锁门（科技只负责把它标成可研究），
     *   cost 吃对应层的制品。效果键分两类：capMul 走 economy.capOf（已架好通道）；
     *   其余键（mineSilt / mineWarm / instituteSci / hallSaveMul / castleCap / luxuryMul /
     *   craftRatio）由 economy / workshop 各自读取——不在 effect 里写死。
     * ⚠️ 城堡/大学「不设上限、衰减抄猫国 getLimitedDR」（用户 2026-09-29 拍）：
     *   升级本身可反复装（need 满足即可再装），但 castleCap 那一条走 getLimitedDR 衰减，
     *   所以「每级 +50」的实际增量随总量渐近收口，不会无限膨胀。数值等用户拍。 */
    /* ⚠️⚠️【建筑升级型 = 同一座建筑改名字，不是新建筑】2026-10-06 用户两次纠偏定死这条。
     *   本表有四项的 desc 是「X升级：…」，它们的真实语义是**那座建筑买下之后就地改名**：
     *     upg_fishbonemine 砂矿坑 → 鱼骨矿井 →（upg_deepmine）→ 深层矿井
     *     upg_university  研究所 → 大学
     *     upg_castle      议事厅 → 城堡
     *   ⇒ 面板上永远是**同一行**：id / 等级键 / 造价曲线全都不变，只换显示名与效果文案。
     *   【`upgradesBuilding` 字段】声明「我顶替哪座建筑」。render 读它决定这一行叫什么，
     *      读数层（costOf / 各效果函数）压根不关心名字 —— 名字是纯 UI 表现。
     *   【为什么不写在 render 里硬编码三段 if】三处各写一遍判据 = 三份会漂的事实来源。
     *      声明在数据侧、判定在 UI 侧，两者分离，加第四个这种升级时只改这张表。
     *   ⚠️ 别再把「X由Y升级而来」读成「另造一座 X 建筑」——本轮已因此返工两次，
     *      第一次还 e2e 全绿（见 .workbuddy/memory/2026-10-06.md 判据一）。
     *   【`upgradesBuilding` vs `buildingDesc` 两个字段的分工】前者说「我顶替哪座建筑」
     *      （判定用），后者是**升级之后那一行该显示的完整效果文案**（显示用）。
     *      为什么要后者而不是直接复用 `desc`：`desc` 的主语是「砂矿坑升级：…」，写在升级
     *      面板里是正确的主语（它确实是在说升级什么），但同一句显示在建筑行上时，
     *      那一行已经叫「鱼骨矿井」了，主语自相矛盾。⇒ 两处各用各的文案。 */
    /* 鱼骨矿井（砂矿坑升级）：need=学徒制（学徒制的尤里卡=买齐三件铁制工具 ⇒ 研究完即解锁）。
     *   效果：矿工金属 +50%（mineSilt 0.5）、暖石 +100%（mineWarm 1.0，即 ×2）。
     *   cost 50 铁制支架 + 50 硬化珊瑚（用户规格终值）。 */
    { id: 'upg_fishbonemine', name: '鱼骨矿井', need: 'apprentice', upgradesBuilding: 'siltpit',
      buildingDesc: '矿工金属产出 +50%、伴生暖石 +100%。每级矿工都吃这份加成。',
      mineSilt: 0.5, mineWarm: 1.0,
      cost: { ironBracket: 50, hardCoral: 50 },
      desc: '砂矿坑升级：矿工金属产出 +50%、伴生暖石 +100%。' },
    /* 自动工坊：need=金属精炼。效果：工艺制作效率 +10%（craftRatio，与工坊每级 +5% 同通道相加）。
     *   cost 600 绳（用户规格终值）。
     * ⚠️ 2026-10-07 用户拍板：**它自带 1 个自动制作槽**（此前名字叫「自动」却不会自动制造，
     *   玩家买了只拿到 +10% 效率 —— 名字与效果对不上）。槽数来源见 CFG.AUTO。 */
    { id: 'upg_autoshop', name: '自动工坊', need: 'metalrefine',
      craftRatio: 0.10,
      cost: { rope: 600 },
      desc: '工坊自动化：工艺制作效率 +10%，并自带 1 个自动制作槽。' },
    /* 大学：need=教育。效果：研究所学者产出 +100%（instituteSci 0.5 加到 BLD.instituteSci 0.50
     *   ⇒ 合计每级 ×100%，用户规格「学者科技 +50% 变 +100%」）。cost 100 石头 + 50 铁制支架。 */
    { id: 'upg_university', name: '大学', need: 'education', upgradesBuilding: 'institute',
      buildingDesc: '学者科技产出 +100%（每级合计 ×100%）。',
      instituteSci: 0.5,
      cost: { stone: 100, ironBracket: 50 },
      desc: '研究所升级：学者科技产出 +100%（每级合计 ×100%）。' },
    /* 城堡：need=城堡(科技)。效果：① 议价减耗（hallSaveMul 0.5，HALL_SAVE 每级 ×1.5、
     *   软上限固定基础 50%、其它仓库叠加到最高 75%，走 getLimitedDR 边际递减）；
     *   ② 每级议事厅给纪元三及之前有上限资源 +50 容量（castleCap 50），走 getLimitedDR 衰减。
     *   cost 50 石梁 + 50 硬化珊瑚。 */
    { id: 'upg_castle', name: '城堡', need: 'castle', capEra: 3, upgradesBuilding: 'hall',
      buildingDesc: '随统治核心等级降低所有建筑下一级成本；' +
        '每级给纪元三及之前有上限资源 +50 容量；市政点 +0.05/级/秒。' +
        '装政策卡「王权神授」每级再 +10% 信仰产出',
      hallSaveMul: 0.5, castleCap: 50,
      cost: { stoneBeam: 50, hardCoral: 50 },
      desc: '议事厅升级：降低所有建筑建造成本，每级议事厅给纪元三及之前有上限资源 +50 容量。' },
    /* 马镫：need=马镫(科技，尤里卡=5 名商人)。效果：奢侈品 +50%（luxuryMul 0.5，
     *   与马具 tool_harnes 的 +50% 独立相乘 ⇒ 合计 +100%）。cost 400 绳（用户规格终值）。 */
    { id: 'upg_horseshoe', name: '马镫', need: 'horseshoe',
      luxuryMul: 0.5,
      cost: { rope: 400 },
      desc: '马术的工坊升级：商人奢侈品产出 +50%（与马具叠加 → +100%）。' },

    /* ── ERA4 工艺升级三项（2026-09-30 用户规格表）──
     * 形制同上：need 是解锁门，效果键由 economy 各处读取，不写在 effect 死字段里。
     * ⚠️【深层矿井的成本是我提的、未拍板】规格表只给了「矿井中可以生产钛」，没给造价，
     *    先按 era3 量级取 steelPart 50 + hardCoral 200；要改请拍。 */
    { id: 'upg_printpress', name: '雕版印刷机', need: 'printing',
      pressSci: 0.30, pressCul: 0.30,
      cost: { steelPart: 100, science: 10000 },
      desc: '学者产出 +30%（走 pressSci），书手产出 +30%（走 pressCul）。' },
    { id: 'upg_deepmine', name: '深层矿井', need: 'physics', upgradesBuilding: 'siltpit',
      buildingDesc: '矿工开始伴生钛。',
      mineTitanium: true,
      cost: { steelPart: 50, hardCoral: 200 },
      desc: '砂矿坑升级：矿工开始伴生钛。' },
    { id: 'upg_hppump', name: '高压气泵', need: 'thermo',
      hydroMul: 0.5,
      cost: { steelPart: 100, titanium: 100 },
      desc: '热液汽轮机的热液能产出 +50%（hydroMul，与钢铁 100 + 钛 100 同成本）。' },

    /* ── ERA5 工艺升级三项（2026-10-02 实装）──
     * 形制同 era3/era4：need 是解锁门（科技只标成可研究），效果键由 economy 各处读取。
     * ⚠️【造价是提议值，未拍板】规格表没给这三项的造价，量级对齐 era4 顺延
     *   （science 10万 + 高阶料 scaffold/steelPart/titanium），要调请拍。 */
    { id: 'upg_invertbuild', name: '倒置工程学', need: 'shellgeo',
      invertBuildSave: 0.20,
      cost: { science: 100000, scaffold: 150 },
      desc: '倒置搭建的延伸：所有建筑造价 −20%。' },
    { id: 'upg_thermrecover', name: '热回收改造', need: 'highthermo',
      hydroBuildSave: 0.30,
      cost: { science: 100000, steelPart: 300, titanium: 100 },
      desc: '高压热机的余热回收：热液汽轮机造价 −30%。' },
    { id: 'upg_wasteforge', name: '废钢锻造', need: 'highthermo',
      steelBonus: 0.20, ironBonus: 0.20,
      cost: { science: 120000, titanium: 100 },
      desc: '把废钢重新锻入产线：精铁产出 +20%、钢产出 +20%。' },
    /* ── ERA5 工艺升级（2026-10-17 新增 · 市政《工坊学校》解锁）──
     * 【形制与废钢锻造同构】needCivic 是市政解锁门（upg_wasteforge 用 need=科技），
     *   由 workshop.upgradeBlocked 真读（本次补的门，与 craft 表 needCivic 同口径）。
     *   steelBonus 走 economy.js 的 upgSum(s,'steelBonus') —— 与废钢锻造的 +20% **加法叠加**
     *   （两个都装 ⇒ 钢产出 ×1.20 × 1.25 = ×1.50），零经济代码改动。
     *   未点出《工坊学校》时该卡按 render-pane-workshop.js:335 的「需要先」规则**隐藏**。
     * ⚠️【造价是提议值，未标定】量级对齐 era5 高阶升级（steelPart/titanium/hardCoral 高阶料），
     *   要调请拍（改它 = 标定，会动整局时长）。 */
    { id: 'upg_steelforge', name: '精炼钢厂', needCivic: 'civ_steelschool',
      steelBonus: 0.25,
      cost: { steelPart: 200, titanium: 100, hardCoral: 200 },
      desc: '把钢产线升级为精炼钢厂：钢产出 +25%（与废钢锻造的 +20% 加法叠加）。' },

    /* ── ERA6 工艺升级两项（2026-10 实装）──
     * 【星空观测站】need=壳外建筑（exostruct）。upgradesBuilding='observatory'：
     *   天壳观测站就地升级为星空观测站，科技产出 +40%（obsSciBoost，走 obsSciMul），
     *   并每 tick +1 星空探索（破壳后被动累积，见 economy.starRate 的 starExplore 项；
     *   旧的热液能第三级消费者 starDraw 路线已废弃，starDraw 恒 0，不再耗热液能、无可开关）。
     *   cost 为提议值（tiplate 300 + 科技 20 万），待标定。
     * 【温水藻场升级】need=密闭水仓（sealbin）。效果：每级（× 藻场等级）额外 +0.5 科技/秒
     *   （algalfarmSci 走 tick/rates 科学输出同式），不受季节、耗 0.05 热液能（季节/耗能在首版
     *   简化为科学加成，其余维度待补）。cost 为提议值，待标定。 */
    { id: 'upg_starscope', name: '星空观测站', need: 'exostruct', upgradesBuilding: 'observatory',
      buildingDesc: '天壳观测站→星空观测站：科技产出 +40%、每 tick +1 星空探索（破壳后累积）。',
      obsSciBoost: 0.40, starExplore: true,
      cost: { tiplate: 300, science: 200000 },
      desc: '观测站升级为星空观测站：科技产出 +40%，并开始积累星空探索。' },
    { id: 'upg_warmalgalfarm', name: '温水藻场升级', need: 'sealbin',
      algalfarmSci: 0.5,
      cost: { tiplate: 300, science: 200000 },
      desc: '温水藻场：每级（× 藻场等级）额外 +0.5 科技/秒，不受季节、耗 0.05 热液能（首版简化为科学加成）。' },

    /* ── ERA7 工艺升级（2026-10-21 调整 · 自动化钻探）──
     * 【自动化钻探】在巢穴面板启停砂矿坑；每座运行矿坑给钛、铀对应产线的自身份额 +100%，
     *   总加成按开启数 / 总矿井数折算，最多 +100%，不按矿井数重复叠乘；每座开启矿井耗 0.3 热液能/秒。
     *   总矿井数取砂矿坑等级；运行数量由巢穴面板的 s.siltpitStop（停用数）计算。
     *   cost 科技点 450,000 = 解锁它的科技自身 cost（§0-4 用户拍板开先例）；
     *   工坊升级 cost 的 science 键由 workshop 通用 for-in 扣费天然支持（无需改 afford/spend）。 */
    { id: 'upg_autodrill', name: '自动化钻探', need: 'autodrill',
      cost: { tiplate: 300, resonantDrill: 300, science: 450000 },
      desc: '在巢穴面板启停砂矿坑。每座运行矿坑对应的钛与铀产出份额 +100%；总加成按运行矿坑占比计算，最多 +100%。每座运行矿坑耗 0.3 热液能/秒。' },
    /* ERA7（spec §4）：物流仓库 —— 顶替商队驿站（upgradesBuilding），买下后商队驿站更名「物流仓库」。
     *   每级给纪元七及之前解锁的有上限材料 +200 容量（capOf 材料分支，BLD.logiwareCap）。
     *   cost 科技点 1,000,000 = 解锁它的科技《大型架构》自身 cost（§0-4 开先例）；材料为提议值（与另两条 era7 升级同口径，不含脚手架）。 */
    { id: 'upg_logiware', name: '物流仓库', need: 'architect', capEra: 7, upgradesBuilding: 'caravanserai',
      cost: { tiplate: 500, science: 1000000 },
      buildingDesc: '商队驿站→物流仓库：每级纪元七及之前解锁的有上限材料 +200 容量。',
      desc: '商队驿站升级为物流仓库：每级纪元七及之前解锁的有上限材料 +200 容量。' },
    /* ERA7（spec §4）：可控爆炸工艺 —— 给 craftRatio 乘区 ×1.05（新增乘区，不改基值）。
     *   boomcraftMul=0.05 ⇒ 整条工艺产出 ×1.05。cost 科技点 1,000,000 = 《载人航天》自身 cost；材料提议值。 */
    { id: 'upg_boomcraft', name: '可控爆炸工艺', need: 'crewed',
      cost: { tiplate: 400, resonantDrill: 200, science: 1000000 },
      boomcraftMul: 0.05,
      desc: '工艺制作产出 ×1.05（新增乘区，不影响成本）。' },
    /* ERA7（spec §4）：复合型工厂 —— +1 自动工艺槽位（workshop.slotCap 同源叠加）。
     *   cost 科技点 2,100,000 = 《复合型工厂》自身 cost；材料提议值。 */
    { id: 'upg_complexf', name: '复合型工厂', need: 'complexf',
      cost: { tiplate: 800, rocketEngine: 5, science: 2100000 },
      desc: '自动工艺槽位 +1。' },

    /* ── ERA8 工艺升级 ──
     * 【激光快速雕版】need=激光技术（laser）。购买后只给潮纹记录配方制造产出 +50%，不打折成本。
     * 【工业机器人】need=机器人技术（robotics）。巢穴面板按工坊建筑数量启停；每座运行工坊
     *   对应的工艺产出份额 +100%，总加成按运行工坊占比折算（最多 ×2）；每座耗 3 热液能/秒。
     *   cost 科技点 3,000,000 = 《机器人技术》自身 cost（§0-4 先例）；材料提议值。 */
    { id: 'upg_laserengrave', name: '激光快速雕版', need: 'laser',
      recipeCraft: { craft_tidal_record: 0.5 },
      cost: { thetaMetal: 120, science: 2000000 },
      desc: '潮纹记录制造产出 +50%（不降低原料消耗）。' },
    { id: 'upg_indrobot', name: '工业机器人', need: 'robotics',
      cost: { thetaMetal: 200, science: 3000000 },
      desc: '在巢穴面板启停工坊。每座运行工坊对应的工艺产出份额 +100%，总加成按运行工坊占比计算，最多 +100%；每座运行工坊耗 3 热液能/秒。' },
    /* ── ERA10（2026-10-20 实装 · 用户 ERA10 表「强人工智能」解锁）──
     * 【强人工智能】need=强人工智能（strong_ai）。消耗 1000 θ金属（用户表原值）。
     * 效果两件（用户拍 Q3「进人口基项」）：
     *   ① 机器人产出 ×1.2 → ×1.5：folk.robotMult(s) 读数替代写死的 ROBOT_MULT，effJobs 合并时用；
     *   ② 机器人按人口口径产信仰：economy.faithRate 人口基项 +robotPop(s)，**升级门控**
     *      （没买升级前机器人仍不进信仰基项，robotbay 原 desc「不影响信仰点」随之改口径）。 */
    { id: 'upg_strongai', name: '强人工智能', need: 'strong_ai',
      cost: { thetaMetal: 1000 },
      desc: '机器人产出 ×1.2 → ×1.5，且机器人按人口口径产出信仰（消耗 1000 θ金属）。' }
  ];

  /* ── 奇观（2026-09-27 用户拍）───────────────────────────────────────
   *   奇观 wonder   = 一次性**里程碑建筑**（买断、永久、不重复）。
   *   （终局破壳的「持续机器」角色原由破冰祭坛承担，2026-10-07 已撤除，改由
   *    天穹钻机 wonder 承担，见 shell.js 的钻机 block。）
   * ⚠️ 第一座「海潮方碑」由**石工 masonry** 解锁（用户要的「第一个就让石工解锁」），
   *    成本以石梁为主 —— 这正是石梁的去处（用户口径「石梁暂时给海潮方碑做材料」）。 */
  var WONDERS = [
    { id: 'wonder_tide_stele', name: '海潮方碑', era: 1, need: 'masonry',
      cost: { stoneBeam: 20, coral: 300 },
      /* craftRatio：加法叠进工艺制作效率（用户拍「加法」）。
       *  matMax：各**材料**仓储 +200。⚠️ 不含石梁——石梁无上限，加它没意义。 */
      effect: { craftRatio: 0.05, matMax: 200 },
      desc: '石工技法的凭证：工艺制作效率 +5%，各材料仓储 +200。' },

    /* ── 大灯塔（2026-09-28 纪元二重排 · 由「导航」解锁） ──
     * 【两种效果的量纲，各走各的通道，别混】：
     *   · `civic: 2`  —— 市政点 +2/秒。走 economy.cultureRate → **每秒绝对量**，不是乘区。
     *                     ⚠️ 原始规格是 +5/秒，但现有市政点只有两个来源（书手 0.15/人/秒、
     *                    议事厅 0.05/级/秒），+5 相当于一次性白送 33 个书手 ⇒ 书手这条
     *                    职业线从建成那一刻起失去意义。用户拍 **2**（≈13 个书手，仍是
     *                    一笔看得见的跃升，但书的产出还占有一席）。
     *   · `effect: { civic: 2 }` —— 只留市政点 +2/秒。⚠️ 旧版 `matMax: 60`（所有材料一次性 +60）
     *                    已被 2026-10-06 用户拍板**删除**：那是对「大灯塔获得灯塔一半仓储」的误读。
     *                    正确机制是「大灯塔建成后，**每座灯塔**额外 +60/级」（= 压舱仓一半），
     *                    由 economy.capOf 的灯塔项读 `BLD.lighthouseCapGreat` 并挂
     *                    `wonder.owned('wonder_great_lighthouse')` 条件，随灯塔数量/等级缩放。
     * 【为什么没有全资源产出加成】「灯塔 +1%」是**灯塔建筑的**效果；用户规格里大灯塔
     *   只给了市政点与仓储两件，所以这里没有 globalProd 键。
     * ⚠️ 别为了「对称」随手加一个：奇观是买断的，+1% × 一座灯塔 = 重复计价。 */
    /* ⚠️【2026-09-28 用户改价：珊瑚 500 → 精铁 500】石头/珊瑚这两个「一级材料」换成了
     *    **精铁**——奇观从此吃加工线的成品，而不是拿原料堆。
     * ⚠️【2026-09-29 用户改价：精铁 500 撤掉 → 硬化珊瑚 50】大灯塔不再吃裸精铁，
     *    改为吃 era1 初级结构件（珊瑚 100→1 的硬化珊瑚，对标猫国 beam）。这样 era2 两座
     *    奇观都不吃裸精铁，结构件全线回流进奇观；精铁只剩熔炉/铁制支架这条加工线在用。
     *    容量门槛从「精铁 500」转成「硬化珊瑚 50 ⇒ 5000 珊瑚」，靠珊瑚匠/点采即可，
     *    量级比之前低很多（不再是 CAP_BASE.iron 撞车那条）。 */
    { id: 'wonder_great_lighthouse', name: '大灯塔', era: 2, need: 'navigation',
      cost: { stoneBeam: 30, hardCoral: 50 },
      effect: { civic: 2 },
      desc: '灯塔的高塔版本：每秒 +2 市政点；建成后每座灯塔的仓储额外 +60/级（= 压舱仓一半），随灯塔数量与等级缩放。' },

    /* ── 大潮纹馆（原「大图书馆」，2026-10-05 改名 · 2026-09-28 用户规格 · 市政《历史记录》解锁） ──
     * 【两个效果，各走各的通道，且一个是「持续」一个是「一次性」】：
     *   · `libLvl: 3` —— 图书馆**虚 +3 级**。⚠️ 它加的是**效果**，不是建筑等级：
     *     不写进 `s.lvl.library`（那会让「建筑总级数」「need 判定」「升级成本」一并
     *     被顶上去），而是单独一条通道（`wonder.libBonus`），只在 economy 算科技产出时
     *     被读走。用户原话「只加效果，不提高建筑所需材料」就是这个意思——
     *     虚级的语义是「按效果算，按建筑不算」，一旦落进 s.lvl 就成了第三种东西。
     *   · `grant: { science: 1000 }` —— **一次性** 1000 科技点，建成那一下就到账
     *     （用户拍的发放时点 = 建成奇观时，不是研究出市政时）。走 wonder.oneShot，
     *     由 workshop.buildWonder 在置位 `s.wonders` 之前/之后结算一次；因为奇观是买断
     *     制（wonderBlocked 会拦第二次），它天然只发一次。
     * 【⚠️ `need` 已随「通识」一起删除（2026-09-28 用户指令：通识删掉，等都重新设计）】
     *   `need` 在**奇观表里是科技 id**（与海潮方碑的 masonry 同一字段同一语义；在
     *   BUILDINGS 表里它才是建筑 id，两个上下文别抄混）。原先指向 `loreway`（通识），
     *   现在**不指向任何科技** ⇒ 大图书馆的「科技这一道门」暂时敞开，只剩市政《历史记录》
     *   那一道管着。重设时把 need 填回任一科技 id 即可，字段语义不变。
     * ⚠️ 2026-09-29 改价（用户拍）：精铁 1000 撤掉，改吃 era2 工坊制品 ——
     *   **铁制支架 50 + 绳 50**（石梁 50 保留）。这样 era2 第三层造的两种制品
     *   终于回流进 era2 奇观（之前它们只被两道扩容升级吃，是「奇观孤儿」）。
     *   ⚠️ 连带的容量门槛从「精铁」转成「铁制支架(iron 20/个) / 绳(kelp 100/个)」：
     *     全网要 150 铁制支架 ⇒ 3000 精铁、150 绳 ⇒ 15000 藻食，都得靠压舱仓/海藻仓堆出来，
     *     这条**不是 bug 而是量纲门槛**，已写进 `docs/JUDGMENTS.md` 待对账。
     *   ⚠️ 注意：大灯塔已于 2026-09-29 同步撤掉裸精铁（改吃 硬化珊瑚 50），
     *      era2 两座奇观现在都不吃裸精铁了。 */
    /* ⚠️ 2026-10-05 用户报 bug 修：**`needCivic: 'records'` 是补上的门，之前根本没有**。
     *   `civics.js` 的《历史记录》明写「解锁奇观『大图书馆』」（`wonder:'wonder_great_library'`），
     *   但那一行只是**登记「本项送的是什么」**（见 civics.js:123-125 的注），
     *   不产生任何门控 —— 奇观的门只由 `workshop.wonderBlocked` 读 `need` / `needCivic` 两个字段。
     *   ⇒ 缺字段 = 裸奔：`wonderBlocked` 判不出门，**没研究《历史记录》就能建大图书馆**，
     *   而且它那 1000 精铁的成本远低于「潮纹馆 6 级」那个真正的解锁条件 ⇒ 门形同虚设。
     *   口径与另两座市政奇观同构（`wonder_stt_abbey` → `sovereign`、`wonder_grand_bazaar` → `guild`）。
     * ⚠️ 这条门同时是「奇观未解锁不显示」那套过滤的**唯一合法例外来源**：
     *   它补上之后，全库 14 座奇观**全部**有门（此前只有大图书馆无门，
     *   而 e2e 有一条「无门奇观必须仍显示」在保护那个状态）。 */
    { id: 'wonder_great_library', name: '大潮纹馆', era: 2, needCivic: 'records',
      cost: { stoneBeam: 50, ironBracket: 50, rope: 50 },
      effect: { libLvl: 3, grant: { science: 1000 } },
      desc: '潮纹馆的高塔版本：按效果视为 +3 潮纹馆等级（不提高潮纹馆的建造成本），建成时一次性 +1000 科技点。' },

    /* ── 阿尔巴达热液大学（2026-09-29 ERA3 · 教育解锁的奇观）──
     * 【用户规格：矿场产出 +x%，x = 人口数量】⇒ effect.minePop = true：所有矿场产出
     *   （金属 silt + 伴生暖石）额外 ×(1 + 人口 × 1%)。与砂矿坑的 per-level 加成、鱼骨矿井
     *   的金属 +50% / 暖石 +400% 是独立乘区，落在 economy 矿工那两行。
     * 【cost 用户规格终值】500 石梁 + 200 铁制支架 + 50 钢制零件（钢制零件由金属精炼的工坊配方造）。
     *   need='education'（教育科技，与建筑侧 requiredTech 同一项，解锁权双写一致）。 */
    { id: 'wonder_albada', name: '阿尔巴达热液大学', era: 3, need: 'education',
      cost: { stoneBeam: 500, ironBracket: 200, steelPart: 50 },
      effect: { minePop: true },
      desc: '热液大学的尖塔：矿场产出额外 +人口数%（金属与伴生暖石）。' },

    /* ── ERA3 市政扩展的两座奇观（2026-09-30 用户规格表）──
     * 【解锁轴是市政不是科技】现有奇观的 need 全是科技 id（workshop.wonderBlocked 读
     *   s.techs），这两座由市政解锁 ⇒ 用新字段 needCivic（wonderBlocked 补一道市政门）。
     * 【效果都是「按动态数量乘」型，挂在 effect 新键上、由 wonder.js 两个新出口读】
     *   · faithPerCivic：圣泰坦尼克修道院——每完成一个市政，信仰产出 +1%
     *     （「完成」= s.civics 里真值为 1 的条数，不是「已揭示」）。
     *   · luxPerPop：大巴扎——每名鲛人 +1% 奢侈品获取（乘在贸易供给 S 上，
     *     tick 与 rates 两处同式）。 */
    { id: 'wonder_stt_abbey', name: '圣泰坦尼克修道院', era: 3, needCivic: 'sovereign',
      cost: { stoneBeam: 300, hardCoral: 300 },
      effect: { faithPerCivic: 0.01 },
      desc: '信仰的里程碑：每研发完成一个市政，信仰产出 +1%。' },
    { id: 'wonder_grand_bazaar', name: '大巴扎', era: 3, needCivic: 'guild',
      cost: { rope: 500, ironBracket: 50, steel: 50 },
      effect: { luxPerPop: 0.01 },
      desc: '万商云集：每名鲛人 +1% 奢侈品获取。' },

    /* ── ERA4 两座奇观（2026-09-30 用户规格表）──
     * 【王国大交易所】need=banking（银行业）。两个效果是**两件不同的事**，别合成一个：
     *   · happyBonus 1   —— 幸福度 +1（wonder.js 新出口 happyBonus，由 economy 的 happy 目标值读）；
     *   · tradeSave 0.10 —— 贸易区域建筑的**建造消耗** -10%（costOf 新分支，按 BUILD_ZONE_OF 判分区）。
     *     ⚠️ 现有只有君主制的全局 buildSave（所有建筑），分区降耗是新机制。
     * 【天壳切削器】need=invert（倒置搭建）。效果 cutterMul：`x = 天壳观测站等级`（每级 +1%），
     *   同时作用**科技与市政**两条产出 ⇒ wonder.js 两个出口都要读它，少读一路就是「面板撒谎」。
     *   ⚠️ 待用户确认：x 的单位按**百分点**算（等级 10 ⇒ +10%）；要改比率只动 wonder.js 一处。 */
    { id: 'wonder_grand_exchange', name: '王国大交易所', era: 4, need: 'banking',
      cost: { steelPart: 50, ironBracket: 600, stoneBeam: 1000 },
      effect: { happyBonus: 1, tradeSave: 0.10 },
      desc: '幸福的里程碑：幸福度 +1；贸易区域建筑消耗 -10%。' },
    { id: 'wonder_shellcutter', name: '天壳切削器', era: 4, need: 'invert',
      cost: { steelPart: 200, scaffold: 100, titanium: 1000 },
      effect: { cutterMul: true },
      desc: '把天壳当工地：科技与市政产出各 +x%，x = 天壳观测站等级。' },

    /* ── ERA4 奇观（2026-10-01 用户设计稿）──
     * 【欧'洛瓦宗座教堂】由《归正会》解锁（needCivic）。
     *   效果 religSlot 1 = 额外送 1 个宗教槽（civics.js slotList 经 wonderReligSlots 读）。
     *   ⚠️ cost 是提议值（用户拍「先这样，后续重做」）。 */
    { id: 'wonder_olo_wa_cathedral', name: '欧\'洛瓦宗座教堂', era: 4, needCivic: 'reformed',
      cost: { stoneBeam: 300, hardCoral: 300 },
      effect: { religSlot: 1 },
      desc: '信仰的丰碑：额外提供 1 个宗教政策卡槽。' },

    /* ── ERA5 三座奇观（2026-10-02 实装）──
     * 【卢\'卢卡工坊】need=industrialize（工业化）。效果 craftRatio:0.5 —— 复用既有加法乘区
     *   （与工坊建筑每级 +5% + 自动工坊 +10% + 奇观方碑 +5% + 科技 + 政体 + 政策卡同一条加法轴），
     *   用户 2026-09 拍板「+50% 变 75%」即此（无需新键，见 techs.js 注释）。
     * 【高压热机管道】need=highthermo（高压热机）。效果 hydroBonus:10 —— 热液能供给侧 +10（绝对量，
     *   走 wonder.hydroWonderMul 出口，与高压气泵升级的 hydroMul 乘区是两回事）。
     * 【天穹钻机】need=skydrill（天穹钻机科技，关键节点）。机器启动、消耗与凿壳逻辑在 shell.js；
     *   破壳前启动后消耗共振钻头 / 热液能并凿穿最后 25% 天壳，运行时幸福度 −1。
     *   破壳后转为奇观态，每秒 +100 市政点、幸福度 +1。effect 留空是因为效果随破壳阶段切换，
     *   由 wonder.js 专属函数结算，不能写成建成即生效的静态加成。
     * ⚠️【cost 为提议值，未拍板】量级对齐 era4 奇观顺延（scaffold/steelPart/resonantDrill 高阶料）。 */
    { id: 'wonder_luluka', name: '卢\'卢卡工坊', era: 5, need: 'industrialize',
      cost: { scaffold: 50, steelPart: 500 },
      effect: { craftRatio: 0.5 },
      desc: '工坊的里程碑：工厂 / 工坊效果 +50%（加法叠进工艺制作效率）。' },
    { id: 'wonder_presspipe', name: '高压热机管道', era: 5, need: 'highthermo',
      cost: { scaffold: 112.5, steelPart: 500 },
      effect: { hydroBonus: 10 },
      desc: '热机的高压血脉：热液能供给侧 +10/s（并联进汽口，不随汽轮机台数缩放）。' },
    { id: 'wonder_skydrill', name: '天穹钻机', era: 5, need: 'skydrill',
      cost: { scaffold: 200, resonantDrill: 20 },
      effect: {},
      desc: '破壳后效果：每秒 +100 市政点，幸福度 +1。' },

    /* ── ERA9 奇观（2026-10-19 实装 · 生态重塑 解锁）──
     * 【星球重构机 G.E.E.K】need='ecological_restoration'（与 wonder_skydrill.need 同机制：
     *   workshop/wonderBlocked 读 w.need 拦「先研究生态重塑」；非 tech 的 unlockWonder 字段，那个键全 src 无消费点）。
     *   effect 空：G.E.E.K 唯一效果是「覆盖建筑升级花费削减」(s.geek.costOffset)，落点 economy.costOf，
     *   不经 wonder.effect 通道（无幸福度/市政/产出效果，用户拍板「不加」）。运行态在 shell.tickShell ③段。 */
    { id: 'wonder_geek', name: '星球重构机 G.E.E.K', era: 9, need: 'ecological_restoration',
      cost: { thetaMetal: 1000, steel: 4000, iron: 6000, coral: 10000, kelp: 10000 },
      effect: {},
      desc: '生态重塑的丰碑：建成后于「自然环境」卡启动，依次改造恩克拉多斯星（1800s）与泰拉星（3600s）。' +
            '完成后人口/速生珊瑚林/矿井/生息区建筑升级花费大幅削减（恩克拉多斯回到 L3 之前、泰拉再叠回 L5 之前）。' },

    /* ── ERA5 市政奇观（2026-10-02 实装 · 渊潜鲛歌/社会科学 解锁）──
     * 【夏'多桑大剧院】needCivic='sharksong'。effect.civic:5 = 每秒 +5 市政点（走 wonder.civicBonus，
     *   绝对量，与现有奇观同通道）；effect.civicSlots:1 = 额外送 1 个政策卡槽（走 civics.wonderCivicSlots，
     *   slotList 叠加，type 用 'wild' 即通用政策槽）。
     * 【国会大厦】needCivic='socialscience'。effect.happyConsume:0.10 = 幸福度消耗 −10%（走
     *   wonder.happyConsumeMul，economy.happyBurn 读，与 govHappyConsumeMul 同乘区）。
     * ⚠️【cost 为提议值，未拍板】量级对齐 era5 奇观顺延（scaffold/stoneBeam/steelPart 高阶料）。 */
    { id: 'wonder_shadow_theater', name: '夏\'多桑大剧院', era: 5, needCivic: 'sharksong',
      cost: { scaffold: 200, stoneBeam: 1000 },
      effect: { civic: 5, civicSlots: 1 },
      desc: '市政的丰碑：每秒 +5 市政点；额外提供 1 个政策卡槽。' },
    { id: 'wonder_congress', name: '国会大厦', era: 5, needCivic: 'socialscience',
      cost: { scaffold: 300, steelPart: 400 },
      effect: { happyConsume: 0.10 },
      desc: '立法的丰碑：鲛人幸福度消耗 −10%。' },

    /* ── ERA6 奇观（2026-10 实装 · 现代化交通 解锁）──
     * 【总物流站】need=现代化交通（modtrans，尤里卡=王国潮道 20 级）。
     *   效果：王国潮道每级 +1% 工艺效率（craftRatio 加法乘区，economy 读 wonder.owned +
     *   lvl.canal 乘 BLD.canalCraft，见 workshop.craftRatio）。
     *   与市政《城市设计》「全国快速物流通道」互锁翻倍：同时拥有该奇观时本效果 ×2（双向，见 wonder.js:logisticsCraftRatio）。
     *   cost 为提议值，待标定。 */
    { id: 'wonder_logistics', name: '总物流站', era: 6, need: 'modtrans',
      cost: { tiplate: 500, scaffold: 100 },
      effect: { canalCraft: 0.01 },
      desc: '王国潮道每级 +1% 工艺效率（同时拥有全国快速物流通道则翻倍）。' },
    /* 【全国快速物流通道】needCivic=城市设计（urbandesign）。
     *   效果：王国潮道每级 +1% 精铁 / 钢产能（canalCraftIronSteel 加法乘区，economy 读 wonder.nationalLogisticsMul）。
     *   ⚠️ 与总物流站（wonder_logistics）互锁翻倍：同时拥有总物流站时，本效果 ×2（鲛货两用物流管网）。
     *   cost 为提议值，待标定。 */
    { id: 'wonder_national_logistics', name: '全国快速物流通道', era: 6, needCivic: 'urbandesign',
      cost: { tiplate: 500, scaffold: 100 },
      effect: { canalCraftIronSteel: 0.01 },
      desc: '王国潮道每级 +1% 精铁/钢产能（同时拥有总物流站则翻倍）。' },

    /* ── ERA7 奇观（2026-10-17 实装 · spec §4）──
     * 【摇篮】need=surface（地表探测）。效果 mineMul:0.20 —— 矿线全产出 +20%
     *   （金属 silt / 伴生暖石 / 铀 / 钛，economy 矿工各行 ×1.2）。
     *   cost 燃料 10000（工艺资源无仓储上限，不会因容量卡住）。
     * 【至高圣座】need=spacestation（空间站）。效果 stationBonus:3（空间站有效等级 +3，免费不收差价）
     *   + 政体分支 +10%（theo_state 信仰 / egalitarianism 工艺 / federalism 科技，互斥三目，wonder.throne*Mul 读）。
     *   cost 火箭引擎 30（提议值，待标定）；渲染层按政体显示分支名称与专属加成。 */
    { id: 'wonder_cradle', name: '摇篮', era: 7, need: 'surface',
      cost: { rocketFuel: 10000 },
      effect: { mineMul: 0.20 },
      desc: '地表勘探计划：矿线全产出 +20%（金属、暖石、铀、钛）。' },
    { id: 'wonder_throne', name: '至高圣座', era: 7, need: 'spacestation',
      cost: { rocketEngine: 30 },
      effect: { stationBonus: 3, throneGov: true },
      desc: '空间站有效等级 +3（免费、不收差价）；按政体分支额外 +10%：教权国信仰 / 平等主义工艺 / 联邦制科技。' },
    /* 【博洛西洛漂浮发射场】needCivic=太空竞赛（space_race），与市政《太空竞赛》的 wonder 字段互锁。
     *   效果 mannedRocket:1.0 —— 载人火箭工艺效率 +100%（乘区 ×2，读 wonder.mannedRocketMul）。
     *   cost = 1000 钛金板件 + 80 封闭藻仓（均为 craft 资源，可作奇观 cost，与 rocketEngine/sealbin 同构）。
     *   ⚠️ cost 为提议值，待标定。 */
    { id: 'wonder_bolocillo', name: '博洛西洛漂浮发射场', era: 7, needCivic: 'space_race',
      cost: { tiplate: 1000, sealbin: 80 },
      effect: { mannedRocket: 1.0 },
      desc: '载人火箭工艺效率 +100%（工艺制作乘区 ×2，economy 载人火箭工艺段读 wonder.mannedRocketMul）。' },

    /* ── ERA8 奇观两座（2026-10-18 实装 · spec §4）──
     * 【旅行者1号】need=深空力学（deepspace）。效果**随星空进度切换两档**，不能写成静态
     *   effect 键（那会在建成时就定死档位）——走 wonder.js 专属出口 voyagerStarRate /
     *   voyagerScholarMul（同天穹钻机 skydrillPostBreak 的「条件效果」模式）：
     *     星空进度 <25% ⇒ +100 星空探索/秒（追赶档）；≥25% ⇒ +25/秒 且学者产出 +10%（巡航档）。
     *   阈值与两档数值在 CFG（VOYAGER_PCT / VOYAGER_STAR_FULL / VOYAGER_STAR_AFTER）。
     *   cost 火箭引擎 100 + **tiplate 1600**（§0-B6 用户拍：400→1600，×4 拉开与太空建筑的量级）。
     * 【萨图恩巨星气行星轨道采集站】need=气云采集（gascloud）。三个效果都是**绝对量**：
     *   hydroBonus: 30 走既有 hydroWonderMul（与高压热机管道同一供给侧通道，零新代码）；
     *   fuelBonus: 30 / starBonus: 10 走新出口 wonder.wonderFuelBonus / wonder.wonderStarFlat
     *   （economy 燃料行 / starRate 各接一路）。
     *   cost 500 θ金属 + 50 火箭引擎（spec §4 用户规格原值）。 */
    { id: 'wonder_voyager', name: '旅行者1号', era: 8, need: 'deepspace',
      cost: { rocketEngine: 100, tiplate: 1600 },
      effect: {},
      desc: '星际探测的起点：星空进度未满 25% 时每秒 +100 星空探索，满 25% 后转为每秒 +25 且学者产出 +10%。' },
    { id: 'wonder_saturn', name: '萨图恩巨星气行星轨道采集站', era: 8, need: 'gascloud',
      cost: { thetaMetal: 500, rocketEngine: 50 },
      effect: { hydroBonus: 30, fuelBonus: 30, starBonus: 10 },
      desc: '气态巨行星的轨道工厂：热液能 +30/秒、燃料 +30/秒、星空探索 +10/秒。' },

    /* ── ERA8 市政奇观（2026-10-18 · 用户市政表）──
     *   哈利法：解锁权在市政《宇宙冷漠》（needCivic，与博洛西洛 needCivic:space_race 同构）。
     *   星空两档与学者 +10% 走专属出口（wonder.khalifaStarRate/khalifaScholarMul），
     *   阈值/数值在 CFG.KHALIFA_*；与旅行者1号的两档**独立叠加**（同进度两座都满档 = +50/s）。
     *   cost「400 钛合金」= 钛金板件 tiplate（游戏内该档资源名，已与用户对齐口径）。
     *   魔鱼世界VR：effect.happyBonus 走既有 happyBonus 通道（与王国大交易所同款，零新代码）；
     *   「持续耗热液能 5/秒」（用户拍 H1=C）走 hydroAlloc 新 draw（vrDraw，CFG.FISHVR_HYDRO）。 */
    { id: 'wonder_khalifa', name: '哈\'利法宇宙望远镜', era: 8, needCivic: 'cosmic_indifference',
      cost: { rocketEngine: 100, tiplate: 400 },
      effect: {},
      desc: '轨道巨眼：星空进度未满 25% 时每秒 +100 星空探索，满 25% 后转为每秒 +25 且书手产出 +10%。' },
    { id: 'wonder_fishvr', name: '魔鱼世界VR', era: 8, needCivic: 'virtual_reality',
      cost: { thinafilm: 10 },
      effect: { happyBonus: 1 },
      desc: '全域沉浸幻境：幸福度 +1；运转持续消耗热液能 5/秒（断流只停幻境不停幸福加成，与空间站同口径）。' },

    /* ── ERA10（2026-10-20 实装 · 用户 ERA10 表「引力弹弓」解锁）──
     * 【朱庇特质量加速站】need=引力弹弓（gravity_sling）。建造 20 强工质火箭引擎 + 100 θ金属自适应薄膜（用户表原值）。
     *   · 运转耗 20 热液能/秒（用户表「消耗热液能20」按 G.E.E.K/europa 先例做成 /秒 运行耗流，
     *     hydroAlloc 新 draw jupitorDraw，最低优先级，断流只停耗）——CFG.JUPITOR_HYDRO。
     *   · 生物材料研究所产出 +100%：effect.biomatlabOut = 1.0，wonder.js 新增 wonderBiomatlabOut
     *     读数（乘区，默认 1，与纳米技术 biomatlabOut ×1.10 独立相乘 ⇒ 合计 ×2.10），
     *     接 economy.thetaOut（tick/rates 两处同式）。 */
    { id: 'wonder_jupitor_mas', name: '朱庇特质量加速站', era: 10, need: 'gravity_sling',
      cost: { strongProp: 20, thinafilm: 100 },
      effect: { biomatlabOut: 1.0 },
      desc: '气态巨星的质量投射器：每秒耗 20 热液能，生物材料研究所产出 +100%。' }
  ];

  /* 手动采集：开局唯一的两条进项，点一下拿多少。
   * ⚠️ 2026-09-26 用户要求「开局可以点击采集藻食和珊瑚两种资源」——原来只有藻食一个按钮，
   * 珊瑚全靠雇珊瑚匠慢慢产，前几十秒玩家对材料线没有任何操作空间。
   *   藻食 1/次    —— 照猫国 Gather catnip（点一下 +1 猫薄荷）。
   *   珊瑚 0.1/次  —— 刻意远低于职业产出（UNIT.coral 0.5/秒 ≈ 5 次/秒的等效），
   *                   否则珊瑚匠这个职业摆着就没意义了（详见 input.js 的注释）。
   * 【为什么不给采集加成】手动采集是起步手段不是主产线，倍率类 perks（异族鳍肢等）
   *   刻意只作用于职业侧，让「雇人」始终优于「猛点」。 */
  var GATHER = { kelp: 1, coral: 0.1 };

  /* 每采集者每秒基础产出。
   * ⚠️ 开局唯一职业「采集者」产的是 **藻食**，不是珊瑚。这条对齐 docs/DESIGN_v0.3.md §4：
   *   「采集者 gatherer | 藻食（手动也能点） | 开局唯一」。
   * ⚠️ 注意 §4 与 §5 是两条不同的约束，别混：§4 说采集者产藻食（仍然有效）；
   *   §5 那句「首建用藻食而非珊瑚」已于 2026-09-25 作废——住房改吃珊瑚后，
   *   开局那 1 人可以转去当珊瑚匠，珊瑚才有着落。见 BUILDINGS 里 nest 的注释。
   * 珊瑚是第二条线，在猫国对应 wood，由 woodcutter（樵夫）这个职业产出、无对应建筑；
   * 本阶段科技树不在跑，所以「珊瑚匠」这个职业直接开局可雇，不挂科技门槛（见 JOBS）。
   * 把采集做成产珊瑚 = 把食物线和材料线接反，开局就多一条玩家用不上的资源。 */
  /* coral = 猫国 wood，silt = 猫国 minerals，两条是分开的线：
   * silt →(furnace) iron。改成采集者顺手产两边之后，
   * furnace 没有原料、iron 恒为 0，geyser/miracle 全建不起来，整局卡死在 25%。 */
  /* ⚠️ 2026-09-26 暗流纪重排补的两个产能常数：
   *   stone     —— 采石工产石头。取值 0.30 低于珊瑚匠的 0.50：石头由「采石」这一项
   *                科技解锁，位置在材料线第三格，若给到与珊瑚同量级，
   *                采石工一解锁就顶替珊瑚匠，材料线从「珊瑚/金属」二元变二元失效。
   *   warmstone —— 采矿**伴生**（不是主产）。取 0.05 是为了让它像个副产品：
   *                暖石只在保温法那道开关里被消耗，量小才逼玩家去取舍「采矿还是深化冶炼」。
   *   两个都是新 id，UNIT 里原本没有 ⇒ 现在加上之后，任何漏配职业也不会再凭空产出
   *   （这正是 state.js 那条 NaN 事故的形状：`undefined * n` 污染资源池）。 */
  /* sci = 学者每秒产出的科学（绝对值，唯一无条件的科学入口）。
   * ⚠️ 2026-09-27 由 0.03 上调到 0.15（用户拍板的「学者 ×5」）。
   *    这次上调不是「猫国 scholar 是 0.175/s 所以我们慢」——实为 17.1%，确实慢，
   *    但同期猫国前 12 项 13430 点 vs 本作 era1 510 点，配成本后本作反而快 4.5 倍
   *    （见 docs/KITTENS_BASELINE.md）。本次上调的收益是**体验**（era1 的层次间隔
   *    从 20-29min 压到分钟级），不是平衡修正 —— 改这个数必须同时重算科技成本。 */
  /* culture = 书手每秒产出的市政点（"对标科技点" 的兑现，2026-09-27 用户口径）。
   * ⚠️ 与 sci 同值 0.15 是**对标**而不是「同量级」：市政树的条目数比科技树少一个数量级
   *    （era1 三条 vs 十二项），所以同样的速率下市政线会明显跑在科技线前面。
   *    这是形状差异，不是数值失配——要改请先读 docs/CIVICS_v0.1.md §8.6 那张表。 */
  /* ⚠️【UNIT.luxury 的 0.05 是待标定提议值，不是拍板值】用户只拍了「商人产奢侈品」
   *  这个结构与落点（UNIT 里加率），没拍数值。参照系：culture 0.15、iron 0.06、
   *  warmstone 0.05。奢侈品是「贸易物」，现在没有开销渠道 ⇒ 定高了纯粹是虚空膨胀，
   *  定低了等贸易系统落地要重调。改这一行即可，别去别处找第二次。 */
  var UNIT = { kelp: 2.50, coral: 0.50, silt: 0.09, stone: 0.30, warmstone: 0.05,
    iron: 0.12, sci: 0.15, culture: 0.15, luxury: 0.05,
    /* ⚠️ ERA3 热液能系统（2026-09-29，待标定默认值，数值等用户拍）：
     *   · hydroOut  热液汽轮机每台每秒产热液能（用户规格「1 台产 1 能」⇒ 1/级/秒）
     *   · hydroWarm 热液汽轮机每台每秒耗暖石（用户规格「能耗 5 暖石/s」⇒ 5/级/秒）
     *   · hydroShopLvl 热液工坊每级每秒耗热液能（用户规格「每级 1 热液能」⇒ 1/级/秒）
     *   · steelPerHydro 每消耗 1 热液能产的钢（取 UNIT.iron 同量级 0.05）
     *   · steelMetal   每消耗 1 热液能吃的金属（silt，1:1） */
    hydroOut: 1, hydroWarm: 5, hydroShopLvl: 1, steelPerHydro: 0.10, steelMetal: 1,
    /* 钛产出率（2026-10-17 用户确认）：每名矿工每秒 0.005。
     *   产出还会吃砂矿坑等级、矿镐、采集/全产倍率与《渊海地质学》，因此基准值压低，
     *   避免深层矿井之后 1000 钛的终局需求被过快堆满；调产出只改此处。 */
    titanium: 0.005,
    /* ERA7（2026-10-17 · spec §2 提议值）：铀 —— 每名矿工每秒 0.002（暖石 0.05 的 1/25，稀有度对齐）。
     *   门=科技 autodrill（tick/rates 两处同式）；调产出只改此处。 */
    uranium: 0.002,
    /* ERA7（2026-10-21 用户确认）：自动化钻探每座开启矿井每秒耗热液能。 */
    drillHydro: 0.3,
    /* ERA8（2026-10-21 用户确认）：每座运行工坊的工业机器人每秒耗 3 热液能。 */
    robotHydro: 3,
    /* ERA8（2026-10-19 · B7）：机器人充能站（robotbay）每级每秒耗热液能（spec §4 列 8）。 */
    robotbayHydro: 8,
    /* ERA9：太阳帆/戴森节点模式各自每级每秒消耗；节点库存材料吃星屑减耗，热液能不减。 */
    launchSailUranium: 0.5, launchSailStrongProp: 0.3, launchSailThinafilm: 0.3,
    launchSailHydro: 4,
    dysonNodeUranium: 5, dysonNodeStrongProp: 3, dysonNodeThinafilm: 3, dysonNodeTiplate: 30,
    dysonNodeHydro: 4 };
  SB.SEASONS = SEASONS;
  SB.RESS = RESS;
  SB.CRAFTS = CRAFTS;
  SB.UPGRADES = UPGRADES;
  SB.WONDERS = WONDERS;
  SB.GATHER = GATHER;
  SB.UNIT = UNIT;
})(typeof window !== 'undefined' ? window : globalThis);
