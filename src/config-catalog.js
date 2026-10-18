/* 天壳 / SHELLBREAK — 配置目录表
 * 轮回商品、职业与工坊工具的静态定义；由 config.js 先建立 CFG 后加载。
 */
(function (root) {
  'use strict';
  var NS = (root.SB = root.SB || {});

  /* 轮回增益（跨周目）。cost 单位 = 轮回点。
   * 三类：起始资源 / 产出效率 / 系数减免（门槛减免最贵——它砍掉一局的重复劳动）。
   * 价格按 2026-09-24 重标定后的量级排：首局（54 人）约 6.5 点，只够买 1–2 项便宜的；
   * 一条 nest 链要跑 3–5 周目才吃满。相对关系照旧：起始 < 效率 < 门槛。 */
  /* 轮回商店商品（方案文档 §轮回点 全量目录）。
   * 字段：id / name / desc / kind（分组显示用）/ n（最大等级，默认 1）/ apply（写入 s.perk 的累加键）
   *      / cost（单级价）/ costs（分级独立价数组，价目表 3/6/12 即各单级价、不累计）/ nest（前置 perk id）。
   * ⚠️ 数值为接入真实结算前的首轮报价，待实跑校准；标定只改 cost/costs/apply，结构不动。
   * ⚠️ apply 键必须与 state.emptyPerks 的键一致（economy 按这些键读数）。 */
  var PERKS = [
    /* ── 开局便利 ── */
    { id: 'food',  name: '前朝藻席',   cost: 1,  desc: '每局开局 +200 藻食',          kind: 'start' },
    { id: 'coral', name: '沉船残骸',   cost: 2,  desc: '每局开局 +150 珊瑚',          kind: 'start' },
    /* ── 重复操作自动化：采集 ── */
    { id: 'g1', name: '异族鳍肢', costs: [3, 6, 12], desc: '采集产出 +10%/级', kind: 'gather', n: 3, apply: { gather: 1 } },
    { id: 'g2', name: '深鳃',     costs: [6],      desc: '采集产出再 +10%',   kind: 'gather', n: 3, apply: { gather: 1 }, nest: 'g1' },
    { id: 'g3', name: '流线体形', costs: [12],     desc: '采集产出再 +10%',   kind: 'gather', n: 3, apply: { gather: 1 }, nest: 'g2' },
    /* ── 重复操作自动化：破壳 ── */
    { id: 'c1', name: '祖先之热', costs: [3, 7],    desc: '破壳系数 +0.20/级',     kind: 'break', n: 2, apply: { coef: 1 } },
    { id: 'c2', name: '脉息',     costs: [7],       desc: '破壳系数再 +0.20',   kind: 'break', n: 2, apply: { coef: 1 }, nest: 'c1' },
    { id: 'd1', name: '薄壳一代', costs: [4, 9, 18], desc: '冰壳厚度 −10%/级',    kind: 'break', n: 3, apply: { thin: 1 } },
    { id: 'd2', name: '裂脉',     costs: [9],        desc: '冰壳再薄 10%',       kind: 'break', n: 3, apply: { thin: 1 }, nest: 'd1' },
    { id: 'd3', name: '内生热泉', costs: [18],       desc: '冰壳再薄 10%',       kind: 'break', n: 3, apply: { thin: 1 }, nest: 'd2' },
    /* ── 重复操作自动化：人口与住房 ── */
    { id: 'popcap', name: '广厦之基', costs: [2, 4, 6], desc: '永久人口上限 +1/级（最多 3 级）', kind: 'pop', n: 3, apply: { popcap: 1 } },
    { id: 'housePlan', name: '生息建筑规划', cost: 20, desc: '所有人口建筑每级各 +1 人口上限（买断）', kind: 'pop', n: 1, apply: { housePlan: 1 } },
    { id: 'coldStore', name: '寒潮储备', costs: [2, 4, 8, 12], desc: '寒季资源产出倍率 +0.02/级（最多 4 级）', kind: 'pop', n: 4, apply: { coldStore: 1 } },
    { id: 'offline', name: '离潮计时', costs: [2, 4, 8, 12], desc: '单次离线上限 +25%/级（最多 4 级）', kind: 'pop', n: 4, apply: { offline: 1 } },
    { id: 'matStore', name: '材料总仓', costs: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80], desc: '所有普通资源容量 +5%/级（最多 20 级）', kind: 'pop', n: 20, apply: { matStore: 1 } },
    /* ── 重复操作自动化：模板与自动制作 ── */
    /* ⚠️ 2026-10-07：`s.perk.autoCraft` 此前是**零读端死字段**（买了扣轮回点、等级真涨、
     *   但没有任何代码读它 ⇒ 不报错、也不生效）。现在由 workshop.slotCap 读它，
     *   语义 = **额外**自动制作槽（自动工坊升级自带第 1 个）。槽数上限 CFG.AUTO.SLOT_MAX。 */
    { id: 'autoCraft1', name: '自动制作槽 I', cost: 6, desc: '自动制作槽 +1（自动工坊已自带 1 个）', kind: 'auto', n: 3, apply: { autoCraft: 1 } },
    { id: 'autoCraft2', name: '自动制作槽 II', cost: 12, desc: '自动制作槽再 +1（累计 +2）', kind: 'auto', n: 3, apply: { autoCraft: 1 }, nest: 'autoCraft1' },
    { id: 'autoCraft3', name: '自动制作槽 III', cost: 24, desc: '自动制作槽再 +1（累计 +3）', kind: 'auto', n: 3, apply: { autoCraft: 1 }, nest: 'autoCraft2' },
    { id: 'legacyCraft', name: '轮回前遗产制作', cost: 8, desc: '解锁轮回结算前自动制作艺术品与潮纹记录（买断）', kind: 'auto', n: 1, apply: { legacyCraft: 1 } },
    /* ── 奇观、破壳与分区自动建造 ── */
    { id: 'wonderBlueprint', name: '遗址施工图 I', costs: [2, 4, 6, 8], desc: '所有奇观建造成本 −5%/级（最多 −20%）', kind: 'wonder', n: 4, apply: { wonderBlueprint: 1 } },
    { id: 'shellSurvey', name: '破界测绘 I', costs: [3, 6, 9], desc: '天穹钻机每单位功率削壳量 +5%/级（最多 +15%）', kind: 'break', n: 3, apply: { shellSurvey: 1 } },
    /* ── 市政与政策 ── */
    { id: 'civicArchive', name: '旧典编纂 I', costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], desc: '市政点获取 +10%/级（不设上限）', kind: 'civic', n: Infinity, apply: { civicArchive: 1 } },
    { id: 'civicPlan', name: '政令档案 I', costs: [2, 4, 6], desc: '保存 1/2/3 份政体与政策卡方案', kind: 'civic', n: 3, apply: { civicPlan: 1 } },
    { id: 'govRoutine', name: '议事惯例 I', costs: [1, 2, 3, 4, 5], desc: '换政策卡/政体费用 −10%/级（最多 −50%）', kind: 'civic', n: 5, apply: { govRoutine: 1 } },
    /* ── 科研 ── */
    { id: 'tideProof', name: '潮纹校勘 I', costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], desc: '科技点获取 +10%/级（不设上限）', kind: 'science', n: Infinity, apply: { tideProof: 1 } },
    { id: 'scienceStart', name: '旧学开篇 I', costs: [2, 4, 6], desc: '每局初始科技点 +100/级（取最高档，最多 +300）', kind: 'science', n: 3, apply: { scienceStart: 100 } },
    { id: 'autoStudy', name: '旧学自动研究', cost: 6, desc: '解锁科技自动研究器（买断，默认关闭）', kind: 'auto', n: 1, apply: { autoStudy: 1 } },
    { id: 'autoCivic', name: '市政自动研究', cost: 6, desc: '解锁市政自动研究器（买断，默认关闭）', kind: 'auto', n: 1, apply: { autoCivic: 1 } },
    /* ── 资源线专项乘区（2026-10-05 用户拍板：1~5 全做 + 补奢侈品线）──
     *  ⚠️【为什么每条线一个独立键，而不是全塞 gatherMul】
     *    gatherMul 是「通用采集」轴（珊瑚/石头/金属/暖石），farmMul 是藻食轴 ——
     *    两条已经分开了。而采集者(farm) 与 g1-g3 走的是 gatherMul，**根本没覆盖藻食**，
     *    所以下面 3/4 两条（藻食、精铁）不是重复建设，是补两个真实缺口。
     *  ⚠️【每条线的读数落点】全部读 `s.perk.<key>`，是**纯加法系数**，
     *    结算侧一律写成 `* (1 + 0.xx * (s.perk.<key> || 0))`：
     *      · 珊瑚   → rates.coral + tick 珊瑚匠行（独立于 gatherMul，可叠加）
     *      · 采矿   → rates.silt/stone/warmstone + tick 对应三行（同一条 perk 管三线）
     *      · 藻食   → rates.kelp(职业侧) —— farmMul 只放大职业，藻场走建筑侧不受影响
     *      · 精铁   → rates.iron/steel + tick steelFlow（地热线重设前收益有限，但结构先通）
     *      · 信仰   → faithRate 内（与神庙乘区 faithMul **并列相乘**，不吃 globalMul 反自指）
     *      · 工坊   → craftRatio 内（只做效率，与工坊建筑/科技/升级的 craftRatio 同一个加法池）
     *      · 奢侈   → luxury 供给 S 侧（tick 4c + rates.luxury 两处，漏一路=面板撒谎）
     *  ⚠️ 2026-10-05 晚用户拍板：本段 9 条全部改为 **+10%/级、不设等级上限**（n:Infinity）。
   *    价目沿用各自现有等差曲线：数组内照读，数组耗尽后由 prestige.perkNextCost 等差外推
   *    （珊瑚/奢侈 +2/级、矿脉/工坊 +3/级、炉心 +4/级、藻食/旧典/校勘/祭祀 +1/级）。 */
    { id: 'coralPact', name: '珊瑚礁契', costs: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40], desc: '珊瑚产出 +10%/级（不设上限）', kind: 'gather', n: Infinity, apply: { coralPact: 1 } },
    { id: 'mineTax', name: '矿脉税契', costs: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60], desc: '石头 + 金属 + 暖石产出各 +10%/级（不设上限）', kind: 'gather', n: Infinity, apply: { mineTax: 1 } },
    { id: 'algaeCrop', name: '潮田轮作', costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], desc: '采集者藻食产出 +10%/级（不设上限）', kind: 'gather', n: Infinity, apply: { algaeCrop: 1 } },
    { id: 'furnaceBoost', name: '炉心增压', costs: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80], desc: '精铁产出 +10%/级（不设上限）', kind: 'gather', n: Infinity, apply: { furnaceBoost: 1 } },
    { id: 'sacrament', name: '祭祀唱诗', costs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], desc: '信仰产出 +10%/级（不设上限）', kind: 'faith', n: Infinity, apply: { sacrament: 1 } },
    { id: 'craftQuota', name: '工坊定额', costs: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60], desc: '工坊制作产出 +10%/级（不设上限）', kind: 'gather', n: Infinity, apply: { craftQuota: 1 } },
    { id: 'luxuryPact', name: '奢侈品契', costs: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40], desc: '奢侈品产出 +10%/级（不设上限）', kind: 'gather', n: Infinity, apply: { luxuryPact: 1 } },
    /* ⚠️ 建造消耗减耗 perk（用户拍板「-1%/级建造消耗」）：
     *  【为什么不复用 hallMul / invertBuildSave 的键】那三个是**建筑给的**减耗，
     *  而这一项是**轮回商店给**的，来源不同就该独立相乘（与 costOf 里
     *  「议事厅 × 君主制 × 大交易所 × 倒置搭建」同一条乘区纪律：来源之间互不踩定义域）。
     *  【落点】economy.costOf 收口那一行 `o[k] = ... * isb * hsb`，加一个 `bsb`——
     *  只改 costOf 一处 ⇒ 面板显示的造价与真实扣的天然同源（与另外三条减耗同源）。 */
    { id: 'buildSave', name: '匠作省料', costs: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40], desc: '所有建筑消耗 −1%/级（最多 −20%）', kind: 'build', n: 20, apply: { buildSave: 1 } },
    /* ── 重复操作自动化：点击（2026-10-06 新增）──
     *   自动采集（藻食+珊瑚）分三档，每档 apply {autoClick:1} ⇒ 三档叠加后 s.perk.autoClick = 档数 = 次/秒；
     *   自动拾取点击事件 = 复刻手动点 #omen 横幅的 claim（src/events.js），出现即领。
     *   ⚠️ 价目为接入真实结算前的首轮报价，待实跑校准；标定只改 cost，结构不动。 */
    { id: 'autoClicker1', name: '自动采集 I', cost: 4, desc: '藻食+珊瑚 自动点击 1 次/秒', kind: 'auto', n: 1, apply: { autoClick: 1 } },
    { id: 'autoClicker2', name: '自动采集 II', cost: 8, desc: '自动点击 2 次/秒（需先购 I）', kind: 'auto', n: 1, apply: { autoClick: 1 }, nest: 'autoClicker1' },
    { id: 'autoClicker3', name: '自动采集 III', cost: 16, desc: '自动点击 3 次/秒（需先购 II）', kind: 'auto', n: 1, apply: { autoClick: 1 }, nest: 'autoClicker2' },
    { id: 'autoEvent', name: '自动拾取', cost: 6, desc: '天壳震动等点击事件出现即自动拾取', kind: 'auto', n: 1, apply: { autoEvent: 1 } }
  ];

  /* 职业表。对齐 docs/DESIGN_v0.3.md §4「开局 **1 名族民，职业 = 采集者，资源 = 藻食**」：
   *   「采集者 gatherer | 藻食（手动也能点） | **开局唯一**」
   * 所以本表开局只有 gather 挂着（其余在 UI 里不露头，靠 habitat 的解锁判定），
   * 它产的是藻食而非珊瑚——珊瑚是「礁凿」科技那条线的产物。
   * 上一轮自创的 `planter 圃丁` 已删除：文档里 farmer 是「藻食 +40%（采集者降级为保底）」、
   * 靠「藻圃」科技解锁的**第二条**职业，让它在开局就产 0.5/秒等于越级，
   * 且与采集者产同一资源，玩家无从取舍。
   * 猫国 master 参照（2026-09-25 实拉官方源码）：
   *   woodcutter  defaultUnlocked，wood 0.018/tick
   *   farmer      研究 agriculture(100 science) 解锁，catnip 1.0/tick
   *   scholar     建筑 library(25 wood) 解锁，science 0.035/tick
   *   miner       建筑 mine(100 wood) 解锁，minerals 0.05/tick
   * ⚠️ 上列一律是 **per tick**，猫国 `ticksPerSecond: 5`（game.js:2289）⇒ 每秒要 **×5**
   *   （scholar 实为 **0.175/s**，UI 显示的就是这个数）。
   *   2026-09-26 曾把 0.035 读成「/秒」去比本作的每秒值，判「0.03 = 86%，正常档」——**错**（实 17.1%）。
   *   但**比产出必须配成本**：本作 era1 12 项共 510 点、猫国同期 13430 点 ⇒ 1 学者跑完
   *   4.72h vs 21.3h，本作反而**快 4.5 倍**。完整对照见 `docs/KITTENS_BASELINE.md` §二。 */
  var JOBS = [
    /* 珊瑚匠 = 猫国 woodcutter（樵夫）的对位。猫国 js/village.js 里 wood **只有职业能产**，
     * 没有任何产木材的建筑；本作原先拿「礁口采石场」建筑顶替，等于给木材线加了一个
     * 原作没有的产能建筑，材料线也从「靠人」变成了「靠地」。2026-09-25 用户拍板改回职业。
     * 开局即可雇佣（猫国 woodcutter 就是 defaultUnlocked），所以前期唯一的一名族民
     * 要在「当采集者攒粮」和「当珊瑚匠攒料」之间选——这与猫国「一只猫只能干一份活」同源。 */
    /* ⚠️ 2026-09-26「种植」改判：采集者**不是被替换成另一个职业**，而是**进阶为农民**。
     *   所以这里不新增 farmer 职业 id，走的是 `jobName(s,'gather')` 的随科技改称
     *   （见 folk.js）+ 产出乘区 farm（默认 1，种植给 1.5）。
     *   【为什么不另开一个 farmer id】那会让「种植」变成「多一个产同一资源的职业」，
     *   玩家在两个都产藻食的职业之间无从取舍；而用户要的是**同一个人换了身份**。 */
    { id: 'gather',     name: '采集者', desc: '采集藻食，手动点击也能点' },
    { id: 'coralwright', name: '珊瑚匠', desc: '凿珊瑚——材料线（珊瑚）的入口' },
    /* ---- 暗流纪重排新增的两个职业（2026-09-26 用户拍板）----
     * 采石工：产「石头」（材料线第三格，由「采石」科技解锁）。
     * 矿工：产「金属」（silt 这个 **id** 对应的显示名，2026-09-26 由「矿砂」改称），
     *       **并伴生「暖石」**——暖石不是矿工的产出主线，是采矿时的附带收获
     *       （量小是故意的：它只在保温法那道开关里被消耗，见 techs.js 保温法那项）。 */
    { id: 'quarrier',   name: '采石工', desc: '采石头' },
    { id: 'miner',      name: '矿工',   desc: '采金属，伴生暖石' },
    /* ⚠️ 2026-10-04 用户指令：**「匠人」这一项已删除**（原话「根本没有这个职业，删掉」）。
     *   它是 2026-09-28 删掉「匠作」科技后遗留的幽灵行：
     *   ① `jobs.craft` 在全树**没有任何解锁口**（craftT 已删，唯一解锁通路 eff.unlockJob 空了）；
     *   ② 但 folk.jobUnlocked 对「既无科技声明也无市政声明」的职业返回 true（`return !tid`）
     *      ⇒ 它被当成「开局无条件解锁」⇒ 族民页永远渲染「匠人 0 / 驱动加工、地热」，
     *      玩家点 ＋ 还真雇得到人 —— 而**雇了零产出**：加工早改「建筑自动」（见 economy 那条注）、
     *      地热唯一产出口（热泉井）已删 ⇒ economy.fuelRate 恒 0。
     *   ⇒ 一个看得见、雇得动、却什么都不产的职业，就是用户说的「根本没有」。
     * ⚠️ 删职业不是只删这一行，同步点：state.js 的 jobs 字面量、folk.js autoAssign 的 craft 兜底、
     *    sim/e2e.mjs 的夹具与断言。老档里的 `jobs.craft` 由 migrateRun 的 fixTable 按 ref 键遍历
     *    自动丢弃（那个人退回闲置池），无需单独写迁移。 */
    { id: 'scholar',    name: '学者',   desc: '产出科技' },
    /* 书手 = 市政点的主来源（2026-09-27 用户拍板「新增书手这个职业，可以获得市政点」）。
     * ⚠️ 它**不是**学者的分身：书手走的是市政树那条线，与科技树互不牵连——
     *    这正是当初否决「学者分流」方案（CIVICS §3 方案 A）的理由。
     * ⚠️ 代价说在前面：era1 的瓶颈是人口（CIVICS §2 约束 4），多一个职业就是多一道
     *    从采集者/珊瑚匠手里抽人的压力。它会压慢整局，但**不等于 bug**——
     *    判据是「让断言变绿」还是「让 NaN/死锁消失」，见 docs/JUDGMENTS.md。 */
    { id: 'scribe',     name: '书手',   desc: '抄录编纂——市政点（主来源）' },
    /* 商人 = 市政《对外贸易》解锁的职业（2026-09-28 用户规格）。
     * ⚠️【它不是第 8 个「随便产点什么」的职业】它是**奢侈品这条资源线的唯一进项**，
     *    而奢侈品此刻没有开销渠道（贸易系统待设计），所以这名职业在贸易落地前
     *    纯粹存在感稀薄。这是刻意的：先把「谁产奢侈品」钉对，贸易规则之后再挂上去。
     * ⚠️【解锁来源不在科技树上】其余职业都靠 `eff.unlockJob` 反查科技解锁，商人
     *    例外——它的解锁权写在**市政**《对外贸易》的 `job` 字段上（folk.jobUnlocked
     *    同时反查两侧）。写在这里是为了让「谁解锁它」一眼能看见，与职业表并列。 */
    { id: 'merchant',   name: '商人',   desc: '奔走贸易——奢侈品（唯一来源）' }
  ];

  /* ── 工坊：青铜工具三件（2026-09-27 用户拍板）───────────────────────
   * 用户原话：「首先肯定是青铜镰、青铜斧和青铜镐，各 +80% 农民、珊瑚匠和
   *   采石工/矿工的工作效率」；映射由用户当次确认：**镰 = 采集者（藻食），
   *   斧 = 珊瑚匠，镐 = 采石工 + 矿工**。
   *
   * ⚠️ 落点必须分两条函数，因为它们本来就是分开的：
   *   · `gatherMul`（economy.js）管 珊瑚匠 / 采石工 / 矿工 ⇒ 斧、镐挂这里。
   *   · `farmMul`（economy.js）管 采集者（藻食），注释明写「别把 gatherMul
   *     乘进来」⇒ 镰挂这里。当初错乘那条让食物虚高到 38/秒糊掉仓储上限，
   *     这条纪律是有血的，别顺手把镰并进 gatherMul。
   *
   * 【bonus 0.8 是加法档位，落点是乘法】三项各买一次 ⇒ gatherMul 上连乘
   *   (1.8)×(1.8)=3.24（镰不在此列）。两个工具都在手时是 3.24 倍，不是 +160%。
   *   ⚠️ 暂不给递减/封顶：用户尚未拍叠加约束（见 sim/e2e.mjs「工坊工具」那节）。
   *      这个数是标定权，等用户拍完再动，别自己顺手加。
   *
   * 【为什么前置是「建成工坊」而不是科技】青铜术(bronze) 是 era1 最贵的科技
   *   （cost 600，按 1 学者 0.15/s 要攒约 67 分钟）。拿它当前置，工具会晚到
   *   玩家已经打完 era1 的一半。用户拍板「建成工坊开工坊界面」⇒ 门槛 = 工坊等级 ≥ 1
   *   （工坊首级 coral 400），即珊瑚线自身的进度，不需要科学。
   *
   * 【成本量级怎么定的】参照同期同类：礁石平台 coral 87（采集 +8%/级）、
   *   砂矿坑 coral 200（金属 +20%/级）。工具是**一次性买断的效率提升**，
   *   比「等级可叠的建筑」贵是对的：镰 150（最早、最便宜，采集者开局就有）、
   *   斧 200（珊瑚匠是材料线主）、镐 200 + 金属 50（矿工 UNIT.silt 仅 0.09/s，
   *   是四条采集线里最贵的 ⇒ 多收一份合理）。
   * ⚠️ 以上均为**待标定**的提议值，改之前先跑 e2e 看「工坊工具」那节是否仍绿。 */
  /* ⚠️ `target` 是本工具**绑在哪个职业上**，一个数组 = 同时绑多个职业。
   *    「绑到哪些产出行上去」由 economy.js 的 JOB_SINK 那张表回答 —— 工具认的是**人**，
   *    不是资源行（用户 2026-09-27 拍）。改之前先读 economy.js toolMul 上那段注释。
   *    当初斧和镐都写同一个落点（同一条线叠两个数 ⇒ 买斧头石头也涨），已被用户否决。
   *    三件各绑一个职业，买齐是三条线各 +80%，不是「全局 +583%」。 */
  /* ⚠️ 2026-09-28 重排：`need` 这个键**只有铁质三件才有**，且值必须是**真实存在的科技 id**
   *    —— 由 workshop.blocked() 真读（读之前它一直是死字段，见 workshop.js 的 blocked）。
   * ⚠️ 为什么青铜三件不写 need：它们原来的 `need:'workshop'` 是个**歧义字段** ——
   *    workshop 既是**建筑 id**（工坊）也是 era1 那项**科技 id**，一个值两种解释；
   *    而 blocked 从不读它（门槛是硬编码「建成工坊」）⇒ 那个字段一个作用是零。
   *    留着它只会让人以为「买工具要先研究工坊科技」。⇒ 青铜三件的门槛就只有「建成工坊」。
   * ⚠️ 铁质三件的 need 指向「铁器」⇒ 没研究铁器，铁质工具在工坊里**买不到**（而不是灰着）。 */
  var TOOLS = [
    { id: 'tool_sickle', name: '青铜镰', target: ['gather'],
      bonus: 0.80, cost: { coral: 150 },
      desc: '采集者（种植后称农民）采藻食 +80%' },
    { id: 'tool_axe', name: '青铜斧', target: ['coralwright'],
      bonus: 0.80, cost: { coral: 200 },
      desc: '珊瑚匠凿珊瑚 +80%（不影响石头与金属）' },
    { id: 'tool_pick', name: '青铜镐', target: ['quarrier', 'miner'],
      bonus: 0.80, cost: { coral: 200, silt: 50 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +80%（不影响珊瑚）' },

    /* ── 铁质三件（2026-09-28 纪元二重排新增） ──
     * 形参照猫国 `js/workshop.js:1-95` 的成对结构（mineralHoes→ironHoes / mineralAxes→ironAxes）：
     *   mineralHoes  +0.5 (minerals 275 + science 100) ⇒ ironHoes  +0.3 (iron 25 + science 200)
     *   mineralAxes  +0.7 (minerals 500 + science 100) ⇒ ironAxes  +0.5 (iron 50 + science 200)
     * ⚠️ 猫国的一个反直觉点：铁质的**数值比矿质低**（0.3 < 0.5）。那不是负升级 ——
     *    猫国 core.js 的 effects 合并是 `globalEffects[name] += effect`（**同一 key 相加**），
     *    `registerMeta("research", upgrades, null)` ⇒ 矿锄+铁锄一起 = catnipJobRatio 0.8
     *    ⇒ 农民 ×1.8，两份都买才划算。铁质卖的是「解锁下一层 + 换材料」，不是「变强」。
     * ⚠️ 本作对齐的是**合并语义**（同职业相加，见 economy.toolMul），数值另定：
     *    用户拍的范围 +0.80~1.00，这里取 0.80 —— 与青铜平级。若也压到 0.3 那档，
     *    买齐镰+镰只等于 +0.3（相对青铜是**负升级**，没人会买）。
     *    真正的代价在**材料**：精铁要热泉炉产（UNIT.iron 0.06/份），比珊瑚贵一个量级。
     * ⚠️ `need: 'ironwork'` 是**真字段**：workshop.blocked() 会读它去拦「没研究铁器」。
     * ⚠️ 成本（精铁 25/50/75）按猫国铁质工具的价格比例照搬，量纲对得上，数值待标定。 */
    { id: 'tool_ironSickle', name: '铁镰', need: 'ironwork', target: ['gather'],
      bonus: 0.80, cost: { iron: 25 },
      desc: '农民采藻食 +80%（与青铜镰同档，材料换成精铁）' },
    { id: 'tool_ironAxe', name: '铁斧', need: 'ironwork', target: ['coralwright'],
      bonus: 0.80, cost: { iron: 50 },
      desc: '珊瑚匠凿珊瑚 +80%（与青铜斧同档，材料换成精铁）' },
    { id: 'tool_ironPick', name: '铁镐', need: 'ironwork', target: ['quarrier', 'miner'],
      bonus: 0.80, cost: { iron: 75 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +80%（与青铜镐同档）' },

    /* ── 钢质三件（2026-09-30 用户拍板：金属精炼线延伸）──
     * 与铁质同构：门挂 TOOLS[].need（metalrefine——钢资源本身就是它解锁的），
     * 不写 eff.unlockTool（techs.js:319 判据：两个解锁口 = 断链）。
     * ⚠️ 与铁质「纯换材料」不同：bonus 取用户拍过的上限档 1.00 —— 钢层卖「真强度」，
     *    镰线全买 = 1 + 0.8(青铜) + 0.8(铁) + 1.0(钢) = **×3.6**（加法合并，见 economy.toolMul）。
     *    代价在材料：钢走 steelFlow（热液工坊 × steelPerHydro 0.05，无上限但产能慢），
     *    且与潮道(5/座)、钢制零件(25/件)、大巴扎(50)抢钢。三件共 105 钢 ≈ 中期 12~17 分钟专职产能。 */
    { id: 'tool_steelSickle', name: '钢镰', need: 'metalrefine', target: ['gather'],
      bonus: 1.00, cost: { steel: 20 },
      desc: '农民采藻食 +100%（与青铜/铁镰相加合并，三件全买 = ×3.6）' },
    { id: 'tool_steelAxe', name: '钢斧', need: 'metalrefine', target: ['coralwright'],
      bonus: 1.00, cost: { steel: 35 },
      desc: '珊瑚匠凿珊瑚 +100%（不影响石头与金属）' },
    { id: 'tool_steelPick', name: '钢镐', need: 'metalrefine', target: ['quarrier', 'miner'],
      bonus: 1.00, cost: { steel: 50 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +100%（不影响珊瑚）' },

    /* ── 马具（2026-09-29 用户拍板实装：商人奢侈品产出 +50%）──
     * ⚠️ 2026-09-28 它曾是 wip 占位（「不能点的占位」），2026-09-29 用户拍
     *    「马术 +50% 商人奢侈品产出」⇒ 摘掉 `wip: true` 即上线。
     *    workshop.blocked 的 wip 门机制保留，将来再有占位件仍走它。
     * ⚠️ 通道 = `economy.toolMul(s, 'merchant')`（JOB_SINK 里 merchant 绑 ['luxury']）：
     *    tick 与 rates 两处 luxury 产出行**都要**乘它，只改一处 = 面板撒谎。
     *    合并语义是**加法**（1 + 0.5），与青铜三件同口径。
     * ⚠️ `need: 'horsemanship'`：没研究马术 → blocked 返回「需要先研究「马术」」。
     * ⚠️ cost 珊瑚 300 沿用占位时的价（用户未改价）。 */
    { id: 'tool_harnes', name: '马具', need: 'horsemanship',
      target: ['merchant'], bonus: 0.5,
      cost: { coral: 300 },
      desc: '商人产奢侈品 +50%' },

    /* ── θ生物金属工具三件套（2026-10-18 ERA8 实装 · spec §4）──
     * 与青铜/铁/钢三件同构：target 逐件绑职业、加法合并（economy.toolMul）。
     * ⚠️ bonus = 2.00（spec §4 用户拍：上一级钢质 1.00 的 2 倍）
     *    ⇒ 镰线全买 = 1 + 0.8(青铜) + 0.8(铁) + 1.0(钢) + 2.0(θ) = **×5.6**。
     * 【need: 'biomat'】真字段（workshop.blocked 读）；生物材料的尤里卡是「藻食上限 30000」，
     *    与产线无关，无死锁。cost 用 θ金属（θ 由生物材料研究所产，CAP_BASE 200），
     *    数量 30/40/50 对齐 θ 是「era8 建筑造价主料」的稀缺定位（三件共 120 θ ≈ 大半仓）。 */
    { id: 'tool_thetaSickle', name: 'θ镰', need: 'biomat', target: ['gather'],
      bonus: 2.00, cost: { thetaMetal: 30 },
      desc: '农民采藻食 +200%（与青铜/铁/钢镰相加合并，四件全买 = ×5.6）' },
    { id: 'tool_thetaAxe', name: 'θ斧', need: 'biomat', target: ['coralwright'],
      bonus: 2.00, cost: { thetaMetal: 40 },
      desc: '珊瑚匠凿珊瑚 +200%（不影响石头与金属）' },
    { id: 'tool_thetaPick', name: 'θ镐', need: 'biomat', target: ['quarrier', 'miner'],
      bonus: 2.00, cost: { thetaMetal: 50 },
      desc: '采石工采石头、矿工采金属并伴生暖石，三项各 +200%（不影响珊瑚）' }
  ];

  NS.PERKS = PERKS;
  NS.JOBS = JOBS;
  NS.TOOLS = TOOLS;
})(typeof window !== 'undefined' ? window : globalThis);
