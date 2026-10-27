/* 天壳 / SHELLBREAK — 建筑系数与目录数据层。
 * 只声明可调数据；生产逻辑继续由 economy / habitat / render 等模块消费。
 * 必须在 config.js 后、tech/state/economy 前加载。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  /* 每建筑每级的效果。food 系列是食物三旋钮，照抄猫国建设者的四条食物路径
   * （js/game2.js:3666 calcResourcePerTick("catnip")）里的「产 / 增 / 省 / 储」：
   *   产 = catnipPerTickBase        ← kelp 藻场（本作唯一产食物处）
   *   增 = aqueduct catnipRatio +0.03
   *   省 = pasture catnipDemandRatio −0.005（✓ 已对齐：本作 foodSave 同为 −0.005/级、无上限）
   *   储 = barn catnipMax +7500
   * 三条旋钮的产出／消耗／上限数值都取自猫国，本作只做替换系数，不改结构。 */
  var BLD = {
    /* 藻场：藻食 +0.45/级/秒。2026-09-30 随 FOOD_PER ×5 **同步放大**，
     * 维持「一块田养 0.30 人」的原角色（0.45 / 1.50 = 0.30；猫国 0.125/0.85 = 0.147，本作仍宽松）。
     * 若不放大，FOOD_PER ×5 会让藻场相对贡献缩水 5 倍（掉到 0.06 人/田，低于猫国），
     * 整条食物线自相矛盾、bot 跑不通。这个比值决定开局到底会不会缺粮——
     * 原先取 0.55 时比值变成「养 9 人」，食物永远吃不完，前期没有任何取舍。 */
    food: 0.45,
    foodWeir: 0.03,    // 喷口导流堤：藻食产出 +3%/级
    /* ⚠️【−0.5%/级 与「无上限」的出处：2026-09-26 用户拍板对齐猫国】
     * 猫国对「省口粮」的全部身家只有两个字段：pasture 的 `catnipDemandRatio: -0.005`
     * （−0.5%/级）与 unicornPasture 的 -0.0015，而它们在猫国 master 里**一处消费点都没有**
     * （全仓库 grep `catnipDemand` 只有这两行定义；同一作者写的 luxuryDemandRatio 在
     *  village.js:813 是被正经读走的，单单 catnip 这支漏了）。
     * 但**数字本身是猫国写下的**：pasture 就是「−0.5%/级、无上限」，本作照抄它的量级。
     * 【上限的来历】旧值 −2%/级 × 自造上限 60%（30 级封顶）。2026-09-26 用户直接拍板
     * 「降到 −0.005 然后取消上限」——把这条线退回猫国形态：线性叠加、不设护栏。
     * 【为什么敢撤】旧上限当初存在的理由是「−2% × 50 级 = 口粮全免 ⇒ 食物线失去约束」；
     *  每级降到 −0.5% 之后，同样的 50 级只省 25%，那条理由自动失效。
     * 【仍然留的那一道 clamp】见 economy.foodUse：减免在数值上必须 ≤ 100%，否则消耗会翻成
     *  负数、等于白送口粮——那是防错边界，不是设计护栏，与本项无关。 */
    foodSave: 0.005,   // 深海鱼牧场：族口粮 −0.5%/级（照抄猫国 pasture catnipDemandRatio）
    /* ── ERA3 市政扩展（2026-09-30 用户规格表）三个新常数 ──
     * serfCrossRatio：政策卡「农奴制」的互乘系数——每级牧场给藻场效果 ×(1+0.01)、
     *   每级藻场给牧场效果 ×(1+0.01)，两条互乘读同一个系数（用户口径「1 级 1.01、两级 1.02」）。
     * castleFaithRatio：政策卡「王权神授」——城堡每级 +10% 信仰产出（装卡才生效，civics 读）。
     * canalLuxSave：建筑「王国潮道」——每级减少居民奢侈品消耗 0.3%（economy 的奢侈需求 D 读）。
     * caravanseraiLuxSave：建筑「商队驿站」——**每级 −1%** 居民奢侈品消耗
     *   （2026-10-06 用户拍板，与「每级 +1 分钟产量」同属商队驿站的两条效果）。
     *   ⚠️ 与 canalLuxSave **并列相加**、不是覆盖：两者都是「居民侧减耗」，
     *   语义（王国潮道＝运河省水 / 商队驿站＝商队自带补给）与来源（建筑 id）都不同，
     *   踩彼此的定义域没有意义。合并到同一个 `1 − 渠道` 里（economy 的 `_cs`）。 */
    serfCrossRatio: 0.01,
    castleFaithRatio: 0.10,
    canalLuxSave: 0.003,
    caravanseraiLuxSave: 0.01,
    /* stadiumLuxSave：建筑「体育场」——每级减少族民奢侈品消耗 5%（economy.luxSaveAll 读）。
     * 总减免封顶 75%（至多 15 级的有效减免，超出部分按 0.75 截断），由读数处 clamp。 */
    stadiumLuxSave: 0.05,
    /* 商人副产（2026-09-30 用户规格 · 市政《中世纪集市》解锁2）：商人同时产出科学与市政点。
     * 「+0.05/s 科学 +0.05/s 市政」是**每名商人**的量，走 globalMul（与学者/书手同待遇）。 */
    marketJobSci: 0.05, marketJobCulture: 0.05,
    /* ── ERA5 新常数（2026-10-02 实装，2026-10-21 改效果口径）──
     * schoolMermanSci / schoolMermanCivic：学校每级给「每名鲛人」+0.1 科技/s 与 +0.1 市政点/s
     *   （原 schoolMerchantSci 是「每级给商人 +0.5 科技/s」，2026-10-21 改为对全人口 s.pop 生效）。
     *   ⚠️ 不再门控中世纪集市 / 商人：学校对全体鲛人生效，与职业无关。
     *   ⚠️ 读点：schoolMermanSci → economy-tick 4c'' + economy-rates.science（两处同式）；
     *       schoolMermanCivic → economy.cultureRate 内绝对量（与大众传媒 civicPerPop 同口径）。
     *   ⚠️【均为待标定值，数值等用户拍。】
     * hotforgeCraft：热锻工厂每级 +7% 工艺制作效率（加法乘区，与工坊级/奇观/科技同一条轴）。 */
    schoolMermanSci: 0.1, schoolMermanCivic: 0.1, hotforgeCraft: 0.07,
    /* ── ERA5 市政建筑（2026-10-02 实装）──
     * theaterCivRatio：歌剧院每级给官员（书手）市政点产出 +15%（economy.cultureRate 的 theaterCivicMul 读）。
     * tenementPop：廉租社区每级给人口上限 +10（economy.popCap 读 s.lvl.tenement * 此值）。 */
    theaterCivRatio: 0.15, tenementPop: 10,
    /* tenementLuxAdd：廉租社区每级 +5% 居民奢侈品**消耗**（增耗，与王国潮道/商队驿站的
     * luxSaveAll 减耗反号）。economy.tenementLuxAdd 读，tick/happyBurn/rates 三处同源。
     * ⚠️ 这是 2026-10-13 用户拍板补的属性（此前 tenement 只有人口上限，消耗侧是空轴）。 */
    tenementLuxAdd: 0.05,
    /* ── ERA4（2026-09-30 用户规格表）三个新常数 ──
     * coralFarmCW：建筑「速生珊瑚林」——每级珊瑚匠产出 +10%（用户 2026-09-30 把
     *   原「珊瑚产出 +10%/级」改成了「珊瑚匠产出」，与研究所→学者同构，
     *   走的是**职业专精**那条轴，不是 gatherMul 全局采集轴）。
     * bankLux：建筑「银行」——每级商人产出 +10%（乘在 luxury 供给 S 上）。
     * obsMaxBonus：建筑「天壳观测站」——建成后，学者科技产出随本局削壳进度线性增加，
     *   每削薄 5% 得 1 个百分点，完全削穿时 +20%；同一周目的观测站等级不再放大这项效果。 */
    coralFarmCW: 0.10,
    bankLux: 0.10,
    /* 博物馆每级给书手市政点产出 +20%（civics.museumCivicMul 与详情卡共用）。 */
    museumCivRatio: 0.20,
    /* 公民会堂每级给议事厅 / 城堡的基础市政点产出 +50%（economy.cultureRate 与详情卡共用）。 */
    civicHallRatio: 0.50,
    obsMaxBonus: 20,
    /* ⚠️ 这里原来还挂着一段讲「−2%/级 + 60% 上限 / 30 级封顶」的注释，2026-09-26 删。
     *   那段描述的是**已被删除的 foodSaveCap**：留着它有两个害处——① 与上面的 0.005
     *   互相矛盾，同一件事两套说法；② 它挂在 kelpCap 上面，暗示省口粮这件事归压舱仓管，
     *   而实际上限额早就不在它身上了。「注释把实现说成另一回事」正是同一天 stone/warmstone
     *   无上限那个 bug 的成因（见 CFG.CAP_BASE 注释），所以这类残句一律清掉，不留。 */
    /* kelpCap：**海藻仓**给的藻食上限（对标猫国 barn 的 `catnipMax: 5000`）。
     * ⚠️ 2026-09-26 第三轮以前，这条线挂在**压舱仓**名下（+800/级），一个 store
     *   同时供藻食和材料两件性质不同的事。用户拍板拆成两座：藻食归海藻仓（对标
     *   猫国 barn 管 catnip）、材料归压舱仓（对标猫国 warehouse 管材料）。
     * 5000 是猫国 barn 的逐级 catnipMax **原值**，照抄不另标。 */
    kelpCap: 5000,     // 海藻仓：藻食上限 +5000/级
    /* ballastCap：**压舱仓**给其余资源的上限。
     * ⚠️ 2026-09-26 起这是材料容量的**唯一**增长通道 —— 旧版还有一条「每建筑级给
     *   一点全局容量」（CAP_PER_LVL），已随「改成猫国形态」删掉（见 CFG 仓储节注释）。
     *   所以后期深堆建筑全靠它 —— 取舍交给玩家，这是设计，不是缺口。
     * ⚠️ 别拿「工坊 lvN」当这条线的标尺（2026-09-27 实证纠正，我踩过）：
     *   rational bot 破冰时工坊停在 **lv12**，而末态单笔最大需求是**珊瑚厝的石头 3004**
     *   （工坊 2141 只排第 7）。「盖到 lv25 要 105 座仓」是我随手在指数曲线上选的点，
     *   bot 永远走不到。要判容量够不够，就扫「末态各建筑下一级造价 vs 上限」，别挑一座建筑代言。 */
    ballastCap: 120,   // 压舱仓：其他资源上限 +120/级
    /* ⚠️ 灯塔这一档是 2026-09-28 纪元二重排的**新乘区**（「全资源产出 +1%/级」，用户拍）。
     *    【为什么不是把 +1% 塞进 gatherMul】gatherMul 是**采集**倍率，只管珊瑚/石头/金属/
     *    暖石这四种由职业采集出来的资源——藻食走 farmMul、科技走 sci、地热走 fuel、
     *    市政点走 culture，各有一条自己的乘区。「全资源」是**另一条轴**，硬塞进 gatherMul
     *    会让灯塔只放大采集四种，玩家一看「明明说全资源」就成了又一次面板撒谎。
     *    ⚠️ 落点在 economy.globalMul，由 tick 与 rates 两条路同时读（面板 === 结算）。 */
    lighthouseProd: 0.01,  // 灯塔：全资源产出 +1%/级
    /* 灯塔自己也是仓库（材料仓储 +120/级，与压舱仓同档）。
     * 【为什么要有这座」大灯塔「的仓储基准】用户规格「大灯塔获得仓库的作用，但资源上限量为
     *  其一半」——「其」指的就是灯塔。灯塔若不产仓储，大灯塔那「一半」就没有基准可依。
     *    ⇒ 灯塔 +120/级，大灯塔写死 +60。⚠️ 大灯塔那个数是**常数**（用户拍「写死常数」），
     *      不随灯塔等级走——后期工坊要加存储上限，走的是 matMax 那条通道，不是这里。 */
    lighthouseCap: 120,    // 灯塔：其余资源上限 +120/级
    /* ⚠️ 大灯塔建成后，每座灯塔额外 +60/级 仓储 = 压舱仓(ballastCap 120)的一半。
     *   【机制，不是 flat】这是**按灯塔等级缩放**的条件增益：建了 N 座、每座 L 级 ⇒
     *    这层 = N×L×60。挂在大灯塔建成上（SB.wonder.owned(s).wonder_great_lighthouse），
     *    不建成则 0。替代了旧「所有材料一次性 +60」(matMax:60) 写法（用户 2026-10-06 拍板：
     *    旧写法是对「灯塔之半」的误读，与压舱仓一半的量纲（每级）对不上）。 */
    lighthouseCapGreat: 60, // 大灯塔：每座灯塔 +60/级 仓储（= 压舱仓一半）
    /* house / house2：两档住房各自的**每级人口上限**（礁口巢 +2、石屋 +4）。
     * 容量 100% 在建筑上，科技只负责解锁下一档住房（照猫国：hut/logHouse/mansion）。
     * ⚠️ 2026-09-26 术语统一「床位 → 人口」（用户原话：床位就是人口，都改成人口）；
     *   同一天又把「超住只减速」改回**硬上限**——理由与量测见 CFG 的住房注。
     * ⚠️ 底数 `houseBase: 1`（2026-09-26 用户拍板「开局是1/1，开局自带一个人口上限」）：
     *   硬上限第一版没有这个底数，开局读出来是「族民 1（人口上限 0）住满」——
     *   1 个人占 0 个位置，两行话自相矛盾，跟用户最初报的那个 bug 是同一类。
     *   6 那个老值不能回来（白送 6 会让首座礁口巢 +2 毫无存在感），1 只是让那 1 名族民
     *   「真的住得下」，开局显示 1/1。
     *   ⚠️ 于是开局那 1 人是**顶着上限**的：首座礁口巢只能靠他自己凿珊瑚换
     *   （手动点 0.1/次，或派他去当珊瑚匠）——这正是硬上限该有的开局张力。
     * ⚠️ 这个分工是照抄猫国建设者的，别凭直觉改成「第二档给更多」：
     *   猫国 hut(cost 5 / ratio 2.5 / maxKittens +2) 与 logHouse(cost 200+250 / ratio 1.15 / +1)
     *   正是「第一档每座给得多但涨得飞快，第二档每座给得少但能一路铺」。
     *   ⚠️ house2 由 1 抬到 **4**（2026-09-26 暗流纪重排，用户规格「石屋增加 4 人口上限」）。
     *   这一改把第二档从「补零头的备胎」变成「中期主力」，但**算盘打错了**——
     *   ⚠️【2026-09-27 订正】原文「10 珊瑚/人口，比礁口巢的 20 珊瑚/人口便宜一半」是**错的**：
     *    石屋其实**贵一倍**（10.0 vs 5.0 珊瑚/人口），不是便宜一半。
     *   真实形状（累计某资源 ÷ 总人口，实测）：
     *     礁口巢  L1 5.00 / L2 6.25 / L3 10.42 / L4 19.53 珊瑚/人口（ratio 2.5，陡升）
     *     石  屋  L1 10.00 / L2 10.75 / L3 11.58 / L4 12.49 珊瑚/人口（ratio 1.15，缓升）
     *   ⇒ 交叉点在「巢第 2 座 (6.25)」与「巢第 3 座 (10.42)」之间。目标 20 人口：
     *     全铺礁口巢 Lv10 = **63,572 珊瑚**；全铺石屋 Lv5 = **270 珊瑚 + 405 石头**。**差 235 倍。**
     *   ⚠️ 所以「石屋性价比」的真身**不是石屋太便宜，是礁口巢的 ratio 2.5 太陡** ——
     *     越过交叉点后住房这条线**没有任何取舍**，珊瑚无脑进石屋。要恢复取舍，
     *     该动的是巢的 ratio（往 1.5 靠），不是砍 house2。标定那轮要重算
     *     （见 sim/e2e.mjs「住房两档」节锁住的每人口成本对比）。
     *   ⚠️ 上面的口径只算珊瑚：石屋那 60 石头是新手刚开的第二条材料线，产能远低于珊瑚，
     *     隐性成本可能高于同等的珊瑚，标定那轮必须连石头一起算。
     * ⚠️ 曾经这里还有个 `eff.house`（科技直接给床位），2026-09-26 按猫国改判删掉：
     *   猫国 128 项科技**没有一项**给 maxKittens，容量 100% 在建筑上。 */
    /* ⚠️【BLD.warm 已删除（2026-09-26）】冻伤减免不再是「每级 +0.10」的建筑乘区，
     *    改成由暖石开关供给（CFG.WARM_FREEZE_CAP）。这两个机制换轴时容易漏：
     *    建筑侧是 lvl 累加，暖石侧是「这一瞬间烧不烧」，不是一个量纲。 */
    /* ⚠️【BLD.sci 已删除 · 2026-09-27 用户拍板】潮纹馆不再「+0.05/级/秒直接产科学」，
     *    改成 sciRatio：**每级把学者产出 ×(1 + 0.10)**（乘区，不是加绝对值）。
     *    「加在学者的产出上」是用户当次原话——所以 **scholar 为 0 时潮纹馆完全无效**，
     *    这是口径而不是 bug；与猫国同构（猫国 library 的 scienceRatio 也只加成
     *    事件类科学，见 docs/KITTENS_BASELINE.md §二）。
     *    0.10 这个数照抄猫国 library 的 scienceRatio: 0.1（引用型事实，不是标定值）。 */
    sciRatio: 0.10,
    /* ⚠️【BLD.squareCivRatio · 2026-09-28 新增】广场是**潮纹馆的对位建筑**：
     *    用户拍的是「换资源对位」——图书馆（潮纹馆）把学者产出 ×0.10/级，
     *    广场把书手产出 ×0.10/级。姊妹两座同构，只换产出对象。
     * 【为什么必须是一个新键而不是复用 sciRatio】复用会让「潮纹馆给科技」
     *    与「广场给市政点」在同一次乘法里混成一笔；将来想把它们分开调就得拆。
     *    与 instituteSci 那一条的道理一样：**结构与系数分开放**。
     * ⚠️ 0.10 照抄猫国 library 的 scienceRatio 0.1（引用型事实，不是标定值）。
     * ⚠️ 乘区只在 `s.lvl.scribe > 0` 时才咬得动，书手为 0 时广场完全无效——
     *    与潮纹馆「scholar 为 0 时完全无效」是同一个口径，不是 bug。 */
    squareCivRatio: 0.10,
    /* ⚠️【BLD.instituteSci · 2026-09-28 新增】研究所**每级**给学者产出的乘区，
     *   与 sciRatio 同构但**系数不同**（0.50 vs 0.10）。分开两个键而不是复用
     *   sciRatio：`sciRatio` 这个名字里没有「谁的」，复用会让「潮纹馆 +10%」与
     *   「研究所 +50%」在同一次乘法里混成一笔，将来想单独调其中一个就得拆开 ——
     *   结构与系数分开放，改的时候不会牵连另一条线。
     * ⚠️ 0.50 是**待标定**的提议值（用户规格「科技产出 ×50%」是数字口径，
     *   这里定的是「每级 ×50%」那个形式）。
     * 【读取点】economy-tick.js 的结算与 economy-rates.js 的速率读数（与 library 那条必须逐字同构）。
     * ⚠️ 只加这一处系数是不够的：读它的那两行是手写的，漏一处就变成
     *   「面板写着 +50%、实际进账没有」—— 由 e2e「研究所科技加成」那条逐项钉死。 */
    instituteSci: 0.50,
    /* ⚠️【BLD.templeFaithRatio · 2026-09-28 新增】神庙是**潮纹馆的第二座对位建筑**：
     *    潮纹馆把「学者产出」×0.10/级、广场把「书手产出」×0.10/级、神庙把
     *    「信仰产出」×0.10/级。三座同构、各管一条资源线，系数都是猫国 library 那个 0.1。
     * 【为什么又是新键】与 squareCivRatio 同一条理由：结构与系数分开放，
     *    将来要把「信仰线」单独调档时不会牵连另外两条。
     * ⚠️【此刻它咬不动任何东西，这是口径不是 bug】信仰此刻**没有基础产出**
     *    （宗教系统用户明说之后设计，见 RESS.faith 那条注）。神庙是纯乘区，
     *    乘的那一截是 0 ⇒ 建多少级信仰都还是 0。这与「书手为 0 时广场完全无效」
     *    是同一个口径。宗教落地时改的是 **economy.faithRate 里加一项基础产出**，
     *    这一行系数不用动。e2e 有断言钉着这条，防止有人把它当成漏接去「修」。 */
    templeFaithRatio: 0.10,
    /* ⚠️【`reefMul` 已随礁石平台一起删除（2026-09-28 用户拍板）】原来是 0.08，
     *    由 economy.gatherMul 读（`1 + lvl.reef × reefMul`）。删建筑就必须删它，
     *    否则留下一个「没有任何读取者的系数」——那正是本仓记过多次的**死键**形态，
     *    下一个人会以为「采集倍率通道还在、只是建筑没建」。
     *    ⇒ 采集侧现在只有 T.gather（科技）与 perk.gather 两条来源，没有建筑级乘区。 */
    house: 2, house2: 4, houseBase: 1, fuel: 0.010,
    /* ── ERA6（2026-10 实装）新常数 ──
     * researchLabSci：科研所每级给科技产出 +10%（乘区，与 sciRatio / instituteSci 同型，
     *   只是对象换成 researchlab 建筑等级；读 tick 与 rates 两处，两处逐字同构）。
     *   ⚠️ 0.10 为**提议值，待标定**。
     * researchLabSave / researchLabSaveMax：科研所每级让研究科技消耗 −2%，合计不超过
     *   researchLabSaveMax（防成本翻负）。读 tech.study / tech.studyBlocked（扣费与「够不够」
     *   判定共用同一折扣入口，避免按钮灰错的断链）。
     */
    researchLabSci: 0.10, researchLabSave: 0.02, researchLabSaveMax: 0.90,
    /* ── ERA7（2026-10-17 · spec §5/§4 提议值，待标定）──
     * satelliteStar / stationStar：轨道卫星/空间站每级星空探索 +5/+10 每秒（economy.starRate 读）。
     * satelliteScholar：轨道卫星每级学者产出 +25%（tick/rates 学者行乘区）。
     * stationHydro：空间站每级运转耗 2 热液能/秒（hydroAlloc 的 stationDraw，挂 spacestationStop「开几座」开关）。
     * fissionHydro / fissionUranium / fissionLuxAdd：核热厂每级 +10 热液能/秒（不烧暖石的新热液源）、
     *   基础 −0.35 铀/秒、居民奢侈品消耗 +10%（§0-3 用户拍板的负面效果，走 luxDemandMul 同一括号）。 */
    satelliteStar: 5, stationStar: 10, satelliteScholar: 0.25, stationHydro: 2, satelliteHydro: 1,
    fissionHydro: 10, fissionUranium: 0.35, fissionLuxAdd: 0.10,
    /* ERA7（spec §4）：物流仓库（upg_logiware）每级给纪元七及之前解锁的有上限材料 +200 容量。 */
    logiwareCap: 200,
    /* ── ERA8（2026-10-18 · spec §3/§4 提议值，AI 定待标定）──
     * biomatlabKelp/Iron/Ti/U：生物材料研究所每级每秒的四种原料消耗（thetaFlow 读，×bldEff 原料效率）。
     * biomatlabOutRate：生物材料研究所每级每秒产 θ生物金属（原料最紧者决定开工率，断供按比例降产）。
     * biomatlabHydro：生物材料研究所每级每秒耗热液能（hydroAlloc 的 labDraw，优先级最后；
     *   断流只停耗、产出照给——与空间站 stationDraw 同一口径）。
     * rheamineBeam/Coral/Uranium：瑞亚星矿井每级每秒产 石梁/硬化珊瑚/铀；
     *   按用户要求，三项产出均较原值提高 50 倍。
     * titancloudHydro / titancloudFuel：泰坦星气云采集站每级 +6 热液能/秒（hydroAlloc 供给侧，
     *   与核热厂同类不烧暖石）、+5 燃料/秒（tick/rates 燃料行绝对量）。 */
    biomatlabKelp: 100, biomatlabIron: 4, biomatlabTi: 2, biomatlabU: 0.35,
    biomatlabOutRate: 0.0625, biomatlabHydro: 3,
    /* ERA10（2026-10-20）：太阳星环每级每秒产 θ金属（用户 ERA10 表「近恒星轨道建设」原值 0.05）。
     * 平产（不吃 biomatlab 开工率/globalMul），economy.solarRingOut 读。 */
    solarRingOut: 0.05,
    rheamineBeam: 2.5, rheamineCoral: 2.5, rheamineUranium: 0.25,
    titancloudHydro: 6, titancloudFuel: 5,
    /* ERA9（2026-10-19 实装）：马尔斯工造中心每级每秒产 钛金板件/钛（用户拍 P7①：tiplate+3、titanium+2）。
     *   与 rheamine/titancloud 同族，吃 _planetMul（星际物流网卡 ×1.3 + 行星际快速物流 +20% 加算）。 */
    marsTiplate: 3, marsTitanium: 2,
    /* siltBonus：砂矿坑对**矿工金属产出**的加成（+20%/级）。
     * 2026-09-26 金属归位（对齐猫国）：砂矿坑不再自动产金属，改吃这条——
     * 1 + 运行中的砂矿坑数 × siltBonus 乘进矿工的 silt 产出（economy.js 矿工那两行），
     * 数值照抄猫国 mine 的 mineralsRatio 0.2/级。⚠️ 只乘金属、不乘暖石：
     * 暖石是伴生副产品，砂矿坑凭什么给它加成说不通，量级也该留在「取舍」那一档。
     * ⚠️ 2026-10-05 用户拍板：**这个乘区现在同时罩采石工的石头产出**（economy.js
     *   采石工那行同式复用）—— 采石工此前是四家采集职业里唯一没有建筑级乘区的，
     *   而它的 UNIT.stone 0.30 却是除珊瑚匠外最高，「基数大却不能放大」导致它在
     *   同人口下永远弱于矿工（0.09 金属 + 0.05 暖石却有 ×(1+0.2×级数)）。
     *   【为什么复用而不是新开 stoneBonus】采石线**没有任何专属建筑**（「礁口采石场」
     *   已于 2026-09-25 按用户指令改成「珊瑚匠」职业，见下面 JOBS.quarrier 那条注），
     *   新字段没有建筑能读它 ⇒ 必然变成死键。复用后语义 = 「砂矿坑是矿脉设施，
     *   金属与石头同源」。⚠️ 暖石**仍然不乘**（伴生副产品那条纪律不变）。 */
    siltBonus: 0.20,
    /* 每级建筑的地热维护（ economy.fuelRate 的净产出扣项）。
     * ⚠️ 这个键曾经被 economy.js 读取却没在这里定义过，fuelRate 因此恒为 NaN，
     * 顺着 addRes 污染地热池 → 祭坛启动判据 `fuel >= need` 永远为假 → 祭坛一秒没开过，
     * 而 coef/MIR 只吃 lvl 不吃 fuel，所以「祭坛削壳 0%」看上去像标定问题，其实是 NaN。
     * 量级参考：gross = geyser × 0.010 × craft，后期约 0.5–0.8/s，而 lvlSum 后期 200–350，
     * 所以 0.0015 是「300 级吃掉约 0.45/s」——中期起有压痛但不至于把 gross 直接打回 0。 */
    upkeep: 0.0015
  };

  /* 建筑表。四条字段照抄猫国建设者（github.com/nuclear-unicorn/kittensgame，js/buildings.js）：
   *   ratio              每建筑自己的成本递增系数（猫国叫 priceRatio，在官方 Spec 里标为 MANDATORY，
   *                      且没有全局统一值——猫薄荷田 1.12、木屋 2.5、谷仓 1.75、酿造厂 1.5）。
   *                      本作分工：产能建筑走低 ratio（鼓励铺开），住房 2.5（靠贵把人口闸门压住——见本文件「住房」节）。
   *   defaultUnlockable   true = 永远可建。只有 kelp 与 nest 挂着它（同猫国 field+hut 开局并列）。
   *   unlockScheme        {name, threshold}：某资源持有量达阈值才解锁（猫国判定在 game.js:6119）。
   *   requiredTech        必须已研究这些科技。
   *   need                建筑前置。属于加工链的物理依赖，不是解锁手段，所以与上面四项并存。
   *
   * 没有等级上限（同猫国）：升到买不动为止，成本是唯一刹车。 */
  /* ---- 开局两座 ----
   * 对齐猫国「开局列表里只有猫薄荷田一张脸」：defaults unlockable 只有 kelp 与 nest 两座。
   * ⚠️ 成本栏的资源线（不是价格）逐条照猫国 master 实拉值（见 BUILDINGS 顶部注释）：
   *   本作 kelp↔catnip、coral↔wood、silt↔minerals、iron↔alloy。
   *   猫国 hut（人口）= wood 5、aqueduct（食物增）= minerals 75、library = wood 25、
   *   pasture（省口粮）= catnip 100 + wood 10。
   * 因此 **住房吃材料（珊瑚）、食物建筑吃食物（藻食）**，两条线从第一座起就分开。
   * 珊瑚只由「珊瑚匠」职业产出（无对应建筑，同猫国 wood 只有 woodcutter 能产），
   * 于是开局那 1 名族民必须在「当采集者攒粮」和「当珊瑚匠攒料」之间选——
   * 这与猫国「一只猫只能干一份活」同源，是本作的**取舍点**而不是缺陷。
   * 【与 docs/DESIGN_v0.3.md §5 的关系】该文档原写「开局可建 2 座，**成本都是藻食**」并把它
   * 列为红线，与猫国 hut=wood 正面冲突。2026-09-25 用户拍板 **对齐猫国**（选项 A），
   * 本节表已按猫国改，§5 文档同日改（见该处批注）。 */
  var BUILDINGS = [
    /* ⚠️ 显示名三度改判（只改 name，id 不动，不触发 migrateRun 与标定）：
     * 「深海藻场」→ 文档 §2.3 定的「深海藻田」→ 2026-09-25 用户拍「深海藻场」。
     * 建筑清单、成本、算式全不认这个名字，它只出现在 UI。 */
    { id: 'kelp', icon: 'assets/building-icons/era-1/era1-kelp.png',     name: '深海藻场', ratio: 1.12, cost: {kelp: 15},    desc: '自动产藻食 +0.45/级/秒，吃季节减产',
      defaultUnlockable: true },
    /* 住房的程序化说明：它给的就是**人口位**，照猫国 maxKittens —— 住满即停止生育
     * （economy.isFull / tick 第 6 步），住房是人口线唯一的闸门。
     * ⚠️ 旧文案写「拥挤时生得更快」是反的：住房从来只决定「能不能再生成一个」，不加速。
     *    【2026-09-26 第二次改判】上一版把硬上限换成「超住只减速」，实测没约束力
     *    （上限 0 也能 41 分钟养到 18 人，比建 1 座礁口巢只慢 7%），屏幕上还写着
     *    「族民 7（人口上限 2）」自相矛盾 —— 已改回硬上限，见本文件 CFG 里的「住房」节。
     * 成本：猫国 hut = wood 5（材料线）⇒ 本作 **coral 5**。人口建筑吃材料、不吃食物，
     * 这样「养人」不与「吃饭」抢同一笔预算，两条线各自独立（猫国即如此）。 */
    { id: 'nest', icon: 'assets/building-icons/era-1/era1-nest.png',     name: '礁口巢',   ratio: 2.50, cost: {coral: 5},    desc: '人口上限 +2，住满后不再生育',
      defaultUnlockable: true },
    /* ---- 住房第二档（猫国 Log House 的对应物，2026-09-26 新增）----
     * 【为什么要有第二档】礁口巢 ratio 2.5 是指数：第 5 座就要 390 珊瑚、第 7 座 2441，
     * 光靠它撑不到破壳，所以要有第二档接人口。
     * ⚠️ 2026-09-27 用户拍板 **ratio 1.15 → 2.5**（「石屋性价比太高，需求增多、ratio 拉到 2.5」）：
     *    ⇒ 两档同陡，每人口成本比值恒 = 首级成本比 ÷ 人口倍率比 = 40/20 = **2**（无交叉点），
     *    ⇒ 石屋从第 2 座起就永远比礁口巢贵一倍、无人建造，它退化成「早期补 4 个位置的过渡件」。
     *    ⇒ **整局代价实测 4.73h → 7.41h**（住房是人口硬上限，人口是所有职业的上游）。
     *    想要回交叉点，唯一办法是把首级压到 **20 珊瑚 + 30 石头**（比值正好 1）。
     * 【解锁权只写一处】由「石工 masonry」解锁：科技侧 masonry 的 eff.unlockBuild 反查
     *   （techOpensBuild），建筑侧 requiredTech 与之双写一致（见 e2e「建筑解锁来源」三断言）。
     *   2026-10-05 起不再用 unlockRatio 藏行：科技过了就露头，卡点只剩「买不买得起」。
     * ── 2026-09-26 暗流纪重排：珊瑚厝 →「石屋」（用户拍板，第四层「石工」解锁）──
     * 【id 故意不改】仍是 coralhouse。改 id 会污染存档默认表与所有按 id 取值的算式，
     *   而这里要换的只是玩家看到的名字与成本资源；`s.lvl.coralhouse` 里的旧档也照常读得到。
     * 【为什么成本里多了一样石头】用户规格是「用石头和珊瑚建造」。石头是新资源、
     *   只由采石工产出，所以石屋同时是「采石」这条线的第一个建筑出口——
     *   材料线从「珊瑚/金属/骨材/精铁」四元变成五元，石头一进来就占了一座建筑，
     *   这是它该有的分量。
     * ⚠️ 数值（stone+coral / 人口 +4）为**提议值，待标定**，ratio 已由用户 2026-09-27 拍定 2.5。
     *   +4 是用户原话「增加 4 人口上限」按现机制（硬上限）的翻译。
     * ⚠️【2026-09-27 ratio 1.15 → 2.5（用户拍板「石屋性价比太高，需求增多、ratio 拉到 2.5」）】
     *   这条不是调参，是**把石屋从「主力住房」改成「早期补人口、之后谁也不盖」的过渡建筑**：
     *   两档同为 ratio 2.5 时，每人口成本之比 = 首级成本之比 ÷ 人口倍数之比，恒为常数：
     *     (cost_n/subpop)屋 ÷ (cost_n/subpop)巢 = (C首/4) ÷ (10/2) = C首/20 = 40/20 = **2**
     *   ——**与等级 n 无关**。所以石屋从第 2 座起（25 vs 12.5 珊瑚/人口）就永远比礁口巢贵一倍，
     *   没有交叉点（第 5 座巢 390.6 与石屋第 5 座 390.6 恰好相等，e2e 那条严格 > 会红）。
     *   ⇒ 三个连带后果，改这里之前必须知道：
     *     ① 「石工」科技存在的全部意义是解锁石屋（eff.unlockBuild），石屋不被盖 ⇒ 石工白研究；
     *     ② 石头线的建筑出口只剩议事厅（stone 80），采石工（UNIT.stone 0.30/人）产出无处可去
     *        （不是断链，只是永久囤积，但任何以石头为 cond 的科技都会因此断）；
     *     ③ 珊瑚从「住房唯一消耗」变成「住房只吃礁口巢」，珊瑚匠的产能全部压在一档住房上。
     *   交叉点若还要，唯一办法是把首级成本压到 **20 珊瑚 + 30 石头**（比值正好 1，与巢同价）。 */
    /* ⚠️ 2026-09-26 用户拍板：**去掉库存门槛**，解锁权只在「石工」一项，且**双写一致**
     *   （建筑侧 requiredTech 与科技侧 masonry 的 eff.unlockBuild 指向同一项，见 e2e
     *   「建筑解锁来源」三条断言）。玩家研究完石工立刻就能建，卡点只剩「买不买得起」。 */
    { id: 'coralhouse', icon: 'assets/building-icons/era-1/era1-coralhouse.png', name: '石屋', ratio: 2.5, cost: {stone: 100}, desc: '人口上限 +4/级，可一路铺',
      requiredTech: ['masonry'] },
    /* ---- 矿砂线（猫国 minerals，与珊瑚是两条独立的线）----
     * 采集者只产藻食之后，矿砂曾一度没有任何来源：furnace 转不出精铁，
     * iron 恒为 0，geyser（要 iron 62）与 miracle（要 iron 300）永远建不起来，
     * 整局卡死在 25% 那道墙上——那次卡死不是设计，是断线。
     * 【2026-09-26 二次改判（用户拍板「对齐猫国」）】当初救断线的手段是「让本建筑
     *   自动产金属」，暗流纪重排又加了矿工职业，于是出现「建了砂坑凭空冒金属」。
     *   实拉猫国源码（js/village.js）：minerals **只由 miner 职业产**（0.05/tick），
     *   mine 建筑自己一克不产，只解锁职业 + mineralsRatio +0.2/级。
     *   ⚠️ 本文件与 economy.js 旧注释曾写「minerals 的对应物是 geologist」——
     *      **是错的**，geologist 产的是煤（0.015/tick，后期 +金）。
     *   现在照猫国归位：金属唯一来源 = 矿工职业，本建筑只给产出加成，
     *   解锁权并入「采矿」科技（与矿工同门，见 techs.js mining）。
     * 【不写 unlockRatio】同 warmnest/ballast 的规矩：解锁权只在科技一处，
     *   玩家看到「需先掌握科技：采矿」一句话就知道卡在哪，不用猜「是科技没开还是珊瑚不够」。 */
    { id: 'siltpit', icon: 'assets/building-icons/era-1/era1-siltpit.png',  name: '砂矿坑',     ratio: 1.15, cost: {coral: 200},
      desc: '矿工金属产出 +20%/级（升级为鱼骨矿井/深层矿井后更高）',
      requiredTech: ['mining'] },
    /* ---- 议事厅（2026-09-26「石工」解锁项）----
     * 【为什么要有它】用户规格里石工同时解锁石屋与「议事厅（开启市政树）」，
     *   而**本作没有市政树系统**——用户已拍「先只做建筑，市政树以后」。
     *   一个没有效果的建筑会变成第二个「承诺了没接线」的空效果（docs §2.6 记过那种），
     *   所以这里给的是**当场能兑现**的那一半：每级把**所有建筑的下一级成本**压一点。
     * 【为什么选「降成本」而不是别的效果】它对应议事厅的本义——人多口杂，规模化之后
     *   每一座都比上一座便宜一点；而且它作用于 ratio（指数递增那一侧），
     *   越到后期越省，天然是个「后期建筑」而不是又一个前期产能。
     * ⚠️ 实现在 economy.costOf（读 s.lvl.hall），改这里不改那边会静默失效。 */
    /* 同石屋：解锁权双写在「石工」（建筑侧 requiredTech === 科技侧 eff.unlockBuild），无库存门槛。
     * ⚠️ 2026-10-06 城堡「真升级」：**城堡不是另一座建筑，而是这座建筑升级后的名字。**
     *   买下工坊升级 `upg_castle`（议价减耗 +50% / 每级 +50 容量）后，面板这一行
     *   从「议事厅」改写成「城堡」——**等级、造价曲线、建造动作全是同一条**，只是名字与
     *   每级效果升级了（render 读 `s.upgrades.upg_castle` 切名，见 ui/render.js）。
     *   ⇒ 不存在「议事厅退役」这回事，也就**不需要** `retiredBy` 字段。 */
    { id: 'hall', icon: 'assets/building-icons/era-1/era1-hall.png',     name: '议事厅',   ratio: 1.2, cost: {stone: 80, coral: 60}, desc: '随等级降低所有建筑下一级成本；升级为城堡后议价效果 +50%、并额外给纪元三及之前有上限资源 +50 容量/级',
      requiredTech: ['masonry'] },

    /* ---- 食物三旋钮（猫国 pasture / aqueduct / barn 的对应物）----
     * 顺序照猫国的调用顺序排：产（kelp）→ 增（weir）→ 省（warmnest）→ 储（ballast）。
     * 三个 id 都是新的，零存档成本。
     * 【成本线】猫国 aqueduct = minerals 75（同 pasture 走材料线）⇒ 本作落 **silt 60**。
     * ⚠️ 2026-09-26 金属归位后时点又晚一档：金属唯一来源 = 矿工（采矿科技解锁，
     * 砂矿坑只给加成），所以 weir 要等「采矿学完 + 矿工上工 + 库存到 18（首级 60 的 0.3）」
     * 才露头——食物三旋钮里的「增」因此排在整条矿线之后。
     * 好处是材料线多了一个建筑出口（正是这次对齐想达成的），代价是食物线前推一档。
     * 若标定时认为「增」不该等这么久，把它换成 coral（一级材料、珊瑚匠即时可产）即可，
     * 一行改动，不需要动任何算式。 */
    /* ⚠️ 2026-09-26 用户拍板：**放弃库存门槛，改挂「保温法」（thermal，纪元一，reqs 采矿、
     *   cond 暖石 20）**。食物线的「增」因此排在 采矿 → 矿工上工 → 攒够伴生暖石 → 保温法 之后。
     *   这是玩家要的「解锁权只认科技」，代价是它比单纯的库存门槛晚约一整段纪元一。 */
    { id: 'weir', icon: 'assets/building-icons/era-1/era1-weir.png',     name: '喷口导流堤', ratio: 1.15, cost: {silt: 60},   desc: '藻食产出 +3%/级',
      requiredTech: ['thermal'] },
    /* warmnest / ballast 两座的解锁权在科技树上（保温法/储藻术的 eff.unlockBuild），
     * **不写 unlockRatio**——两种机制同时挂着会让「到底卡在哪」变成两句话，玩家看不出来。
     * ⚠️ 原来这条写的是「三座」，第三座「礁石平台」已于 2026-09-28 删除
     *    （见 802 行那段的说明），所以这里同步改成两座。 */
    /* 猫国 pasture = catnip 100 + wood 10——**食物打底 + 材料只占零头**，正好换反了：
     * 本作原先是纯 coral 150，等于「省口粮」这条要花一整条材料线。按猫国改回
     * 藻食为主（100）+ 珊瑚少量（10，对应那 10 wood）。省耗是缓释增益，让它便宜是对的。 */
    /* 猫国 pasture = catnip 100 + wood 10——**食物打底 + 材料只占零头**。
     * ⚠️ 2026-09-26 暗流纪重排：显示名由「保温巢」改为**深海鱼牧场**（用户拍板，
     *   「畜牧」那一项解锁的就是它），成本保持猫国 pasture 那个配比（藻食 + 少量珊瑚）。
     * ⚠️ requiredTech 由 `herd`（畜牧）——纪元一重排后原本指着的纪元二那项已整项删除，
     *    「保温法」那一项改成了暖石开关（不再解锁建筑），省口粮这个位必须由畜牧来开，
     *    否则它会在整棵树里没有任何解锁项。 */
    /* ⚠️ 2026-10-27 用户两轮收紧：先说「效果没说清楚」，补完又说「0.5% 之后的全部删掉」。
     *   最终只留一句最短的——减的是什么（族民口粮消耗）+ 每级多少（−0.5%）。
     * ⚠️ **不要再往这句后面加「10 级 −5%」「可无限叠加」「造价 ×1.15」之类的换算**，
     *   玩家要看具体数字时建筑行旁边就有等级，自己乘一下即可；写多了反而喧宾夺主。
     * ⚠️ 这里的百分比是**基准值**：农奴制卡会让它按藻场等级再放大（serfWarmMul），
     *     动态实际数走 buildingEffectText 那条统一格式（「每级/当前」），不在 desc 里重复。 */
    { id: 'warmnest', icon: 'assets/building-icons/era-1/era1-warmnest.png', name: '深海鱼牧场', ratio: 1.15, cost: {kelp: 100, coral: 10},
      desc: '每级让族民的口粮消耗 −0.5%',
      requiredTech: ['herd'] },
    /* ---- 两座仓库（2026-09-26 第三轮：按猫国拆成 barn / warehouse 两座）----
     * 猫国的容量 100% 来自专门的仓库建筑，且粮仓与材料仓是**两座独立建筑**
     * （barn 给 catnip 5000 / wood 200 / minerals 250；warehouse 给 wood 150 /
     *  minerals 200 / …，且 warehouse 明写 `catnipMax: 0`，要 silos 才给 750）。
     * 本作照这个分工：藻食归海藻仓、其余材料归压舱仓，两条线不共用一个 store。 */
    /* 海藻仓（对标猫国 barn）。用户原话：「种植解锁海藻仓，对标粮仓」。
     * 【造价全珊瑚】用户拍板，不抄猫国 barn 的「木材打底」配比。
     * 【ratio 用 1.15，不是猫国的 1.75】猫国 barn 是 1.75，但那是猫国前期的经济节奏；
     *   本作 era1 珊瑚上限才 600，1.75 会在第 4 级（643）就买不动，等于把「藻食能
     *   存多少」钉死在 3 座。1.15 与本作其余建筑一致，能一路铺。
     * 【解锁权双写】plant 的 eff.unlockBuild 与这里的 requiredTech 指向同一项，
     *   同 ballast/lighting 的规矩（e2e「建筑解锁来源」守着两边）。 */
    { id: 'kelpstore', icon: 'assets/building-icons/era-1/era1-kelpstore.png', name: '海藻仓', ratio: 1.15, cost: {stone: 60, coral: 60},  desc: '藻食上限 +5000/级',
      requiredTech: ['plant'] },
    /* 压舱仓（对标猫国 warehouse）。材料容量的唯一增长通道（全局增量已删）。
     * ⚠️ 2026-09-26 第三轮：藻食那条线（+800/级）已拆出去给海藻仓，这里只剩材料。
     * ⚠️ 2026-09-29 建造成本改为 {stoneBeam:2, hardCoral:2}（对标猫国 warehouse 每级
     *   beam 1.5 + slab 2 的「两种初级结构件」分工）：石梁 = slab 对标、硬化珊瑚 = beam 对标。
     *   珊瑚不再直接进造价，只作硬化珊瑚的原料（珊瑚 100 → 1）。2 份是按「建造成本」给的
     *   一次性门槛，不是猫国那种每级重复付——本作建筑是「一次建成 + 每级 ratio 涨」，
     *   与猫国「每级付结构件」结构不同，但「仓库吃两种初级结构件」的语义已对齐。 */
    { id: 'ballast', icon: 'assets/building-icons/era-2/era2-ballast.png',  name: '压舱仓',   ratio: 1.15, cost: {stoneBeam: 2, hardCoral: 2},  desc: '其余资源上限 +120/级',
      requiredTech: ['lighting'] },
    /* ⚠️ 2026-09-28：礁石平台（reef）**已删除**（用户拍板：它是纪元一整段的老设计，
     *    在本轮纪元二重排里不再保留）。
     *    【删它的连带后果，一并记下，别再找】
     *    ① 「采集产出 +8%/级」这条**效果轴整个空了** → `BLD.reefMul` 同步删除，
     *       `economy.gatherMul` 里那一项也跟着拆掉。现在全仓**没有任何建筑**给采集倍率，
     *       采集侧只剩科技（T.gather）与 perk.gather 两条来源。
     *       ⇒ 将来要给采集加「建筑级」乘区，是**新开一条通道**，不是把这里加回来。
     *    ② 它原先的解锁项「礁石术」(reefwork) 早在纪元二重排时就删了，本座一直临时挂在
     *       「照明」上——删掉之后，照明只解锁压舱仓（`lighting.eff.unlockBuild`），
     *       两边终于一致。
     *    ③ `state.base.lvl` 里的 `reef: 0` 一并删除（留着会让读档时凭空多出一个键）。 */
    /* ── 灯塔（2026-09-28 纪元二重排 · 由「导航」解锁） ──
     * 【它是什么】纪元二第二层的产出项：不解锁新职业、不加新资源，而是把**已经在产
     *   的每一样东西**都抬 1%。这在放置类里的定位是「节奏项」而不是「新内容项」——
     *   它让前面攒下的所有线一起加速，玩家的手感是「突然Everywhere都快了一点」。
     * 【成本为什么吃金属（2026-09-28 用户改价：石头 120 → 金属 120）】
     *   原先的理由是「石头只由采石工产、没有别的用途抢，顺手带起采石工」；
     *   改用金属后那条不成立了（金属由矿工产，要整条矿线撑），换来的是另一条：
     *   金属第一次成了**纪元二建筑的计价材料**（本层灯塔 / 神庙 / 研究所三座都收它），
     *   采矿业从此不只喂精铁、也喂建筑。⚠️ 石头不会因此变废：广场 200、石梁 100/根、
     *   绳 20/条 仍是它的去处。
     * ⚠️ 两类效果（`lighthouseProd` 与 `lighthouseCap`）分属**两条不同的乘区**：
     *   前者在 economy.globalMul（全资源产出，与 tick/rates 两条路都有关），
     *   后者在 economy.capOf（容量）。改任一条前先看 BLD 表里那两处注释。 */
    { id: 'lighthouse', icon: 'assets/building-icons/era-2/era2-lighthouse.png', name: '灯塔',  ratio: 1.15, cost: {stone: 200, silt: 120},
      desc: '全资源产出 +1%/级，其余资源上限 +120/级',
      requiredTech: ['navigation'] },
    /* ⚠️ 订正（2026-09-29，用户纠正「工坊里有各自升级」）：旧注「工坊现在是空壳」已删——
     *    工坊的内容 = 每座运行中 +5% 工艺制作效率（下方 craftRatio）+ 工坊页全部商品
     *    （TOOLS 七件 / CRAFTS 两件 / UPGRADES 两道，见 config 顶部那几张表）。
     *    作废的只是「珊瑚→骨材」那条加工线（2026-09-27 骨材线废），工坊不是空壳。 */
    { id: 'workshop', icon: 'assets/building-icons/era-1/era1-workshop.png', name: '工坊',      ratio: 1.15, cost: {stone: 200, coral: 200},   desc: '加工线入口',
      /* ⚠️【解锁权双写】科技侧 bronze（青铜术）的 eff.unlockBuild 反查给工坊，
       *    这里必须再显式写 requiredTech：habitat.unlocked 首行的 guard 只认
       *    requiredTech / unlockScheme / requiredCivic 四种显式源，否则「只有科技侧声明」
       *    的建筑会被挡死（2026-10-05 移除了 unlockRatio 后更显必要——它之前顶着这个位子）。
       *    e2e「建筑解锁来源」断言会静态查两边一致。 */
      requiredTech: ['bronze'],
      /* ⚠️【工坊的第二个效果：每级 +5% 工艺制作效率】
       * 形参照猫国 `js/buildings.js:1522-1524` 的 `"craftRatio": 0.06`（每级工坊 +6% 工艺制作产出）——
       * 玩家在猫国工坊顶部那行「工艺制作效率: +6%」就是它。
       * ⚠️ 它是**加法**叠在产出上（`产出 = out × (1 + 各来源相加)`），用户 2026-09-27 拍「加法」。
       * ⚠️ 是**等级**，不是买断 —— 这与上半区的青铜工具（买断）是两种形态，别搞混。 */
      craftRatio: 0.05 },
    /* ⚠️【hearth / 暖壳石 已删除（2026-09-26）】它的唯一职责就是压冻伤概率，
     * 现在改由暖石供给（economy.warmCap 读「开关烧着没有」），不再有任何建筑参与。
     * ⚠️ 不要把它加回来当「冻伤出口」：那样暖石就会有两个消耗口，「一份暖石两个效果」
     *    的用户规格就不成立了。热泉炉/热泉井/破冰祭坛的骨材成本另议（用户：之后再定）。 */
    /* ⚠️ 2026-09-28：本建筑的解锁项从「冶炼术」(smelt) 改成「铁器」(ironwork) ——
     *    用户重做纪元二第一层时，热泉炉被划给了铁器（规格原文「铁器解锁炽泉熔炉」）。
     *    副作用：冶炼术现在只剩 eff.smelt 一份乘区（+40% 精铁产出），不再兼解锁。
     * ⚠️ `need:'workshop'` 是**死字段**（workshop.blocked 从不读它），含义待定，先留着。 */
    /* ⚠️ 2026-10-05 用户拍板：热泉炉造价加**金属 50**（`silt`）。
     *   【为什么是 silt（矿工直产的金属）而不是 iron（精铁）】
     *   ① 语义自洽：这座炉子的全部职责就是「金属 → 精铁」，而它的造价此前是**纯珊瑚 112**，
     *      也就是炉子造出来完全不消费上游矿工产的金属 —— **金属线在炉子前断了一截**。
     *      加它自己的原料最自洽。
     *   ② 撞不了硬上限：金属走矿工直产（`UNIT.silt 0.09`/人/秒，产能充裕），
     *      而 `CAP_BASE.iron = 200` 那道墙是给精铁的。⚠️ 折精铁有实证前科：
     *      2026-09-27 删骨材时成本落到珊瑚而非折精铁，因为 A/B 实测「折精铁 ⇒ e2e 4 项红
     *      （峰值人口卡 18 以下、拿不到洋流点、进不了下一周目）」—— 别改回 iron。
     *   ③ 珊瑚那半**没动**（仍 112）：金属是**新增**的约束，不是替换 ⇒ 首建成本从
     *      112 珊瑚变成 112 珊瑚 + 50 金属，压力加在材料线而不是把珊瑚线压掉。 */
    { id: 'furnace', icon: 'assets/building-icons/era-2/era2-furnace.png',  name: '热泉炉',   ratio: 1.15, cost: {stone: 60, silt: 100},  desc: '解锁 金属→精铁',
      need: 'workshop', requiredTech: ['ironwork'] },
    /* ⚠️ 2026-09-27 删骨材：这三处的 `bone:` 成本**落到珊瑚上**（不是精铁），原总量不变：
     *   热泉炉 bone 112 → coral 112；热泉井 bone 175+iron 62 → coral 175+iron 62；
     *   破冰祭坛 bone 400 → coral 400。
     * 【为什么是珊瑚不是精铁】骨材本身就是「珊瑚→骨材」的产物 ⇒ 它的成本天然属于珊瑚线；
     *   换成精铁会让**精铁独扛三个高级建筑的造价**，而精铁唯一来源是热泉炉（要 smelt 科技 +
     *   匠人 + 金属），且 CAP_BASE.iron 只有 200 —— 折精铁后破冰祭坛要 700，超过上限 ⇒
     *   「仓储硬约束」被违反（上限必须 ≥ 下一级成本，否则是**不可能**不是慢）。
     * ⚠️ 实证（2026-09-27 A/B）：折精铁 ⇒ e2e 4 项红（峰值人口卡在 18 以下、拿不到洋流点、
     *   进不了下一周目）；折珊瑚 ⇒ 232/232 全绿。别把这三条改回 iron。 */
    /* 猫国 library = wood 25（首级，一级材料；后续 stage 才叠 steel 100 + concrete 10）
     * ⇒ 本作掉回材料线：bone 150 → **coral 150**。
     * ⚠️ 2026-09-27 订正一：原文写的是「need:'workshop' 与 requiredTech:'calendar'」，
     *   而 requiredTech 早由 calendar 改成了 scholarT（书写），这句注解没跟着改，
     *   读它会以为解锁权还在历法上。
     * ⚠️ 2026-09-27 订正二（用户拍板）：**删掉 need:'workshop'**。原先是「书写」+「建成工坊」
     *   两道门槛 ⇒ 研究完层三的书写按钮还灰着，得再研究层四的青铜术盖出工坊，跨两层才拿得到
     *   刚解锁的东西。猫国 library 的 stage 1 是 `stageUnlocked:true` + wood 25、零 require
     *   零 needs（见 docs/CURRENT_FACTS.md「解锁权口径」），我们这份 need 本来就不是参考来的。
     *   删掉后建筑解锁权只剩 scholarT 一道，与 coralhouse 那种「建筑侧 requiredTech 单写」
     *   的口径统一；首级吃珊瑚也就不构成「科技线绕过工坊」了。 */
    /* 猫国 library = wood 25（首级，一级材料；后续 stage 才叠 steel 100 + concrete 10）
     * ⇒ 本作掉回材料线：bone 150 → **coral 150**。
     * ⚠️ 2026-09-26：名字由「聆听巢」改为**潮纹馆**（用户规格「书写可以建立潮纹馆，
     *   对标猫国的图书馆」），id 仍是 library（存档与算式都按 id 走，改 id 要动五处）。
     * ⚠️ requiredTech 由 `calendar` 改为 `scholarT`（书写）：解锁权现在写在科技侧那一项的
     *    eff.unlockBuild 上，建筑身上这份要与之一致，否则会出现「研究完还是灰的」。
     *    e2e「建筑解锁来源」那节会检查两边一致。 */
    { id: 'library', icon: 'assets/building-icons/era-1/era1-library.png',  name: '潮纹馆',   ratio: 1.15, cost: {coral: 150},  desc: '科技产出 +10%/级（仅作用于学者）',
      requiredTech: ['scholarT'] },
    /* ── 研究所（2026-09-28 用户规格 · era2 第三层 · 由「数学」解锁）──
     * 【对标猫国 University】猫国 `js/buildings.js` 的 university：一次性建筑，
     *   cost 1200 minerals + 1000 iron + …，effects 里给的是**一批 science 向加成**
     *   （scienceMax / science / sciencePerAutocat / mineralStores …）。本作没有
     *   `scienceMax`（science 无上限是用户拍的例外，见 RESS 那条注），所以落地成
     *   **学者产出的乘区** —— 与潮纹馆同一条通道（BLD.sciRatio 那只乘学者，
     *   本条走 BLD.instituteSci），⚠️ 不是全局科技乘区：本作 science 目前只有
     *   学者一个来源，放大谁其实等价，但**口径与潮纹馆保持一致**，将来加了别的研究
     *   来源时不会因为「研究所只加成学者」而出现两个cience来源里有一个被漏掉。
     * 【成本口径已换（2026-09-28 用户改价）】原先是「吃石梁」（石梁是工坊成品，
     *   与「研究所是知识的成品」对得上，也顺手给石梁找个去处）——**那条已作废**：
     *   `{coral 500, stoneBeam 10}` → `{coral 100, silt 100}`，三笔后果：
     *    ① **石梁那 10 根删了** ⇒ 石梁在纪元二只剩两个去处（大灯塔 30、大图书馆 50），
     *       这条工艺线不再是「研究所的门槛」，纯粹成了奇观专用件。
     *    ② **金属第一次成了建筑的计价材料** —— 原先金属只喂熔炉转精铁，
     *       现在矿线（采矿 + 矿工 + 砂矿坑）多了一个直接的建筑出口。
     *    ③ 首级从 500 珊瑚降到 100 ⇒ 它成了本层最便宜的一座，位置上比原来早很多。
     *   ⚠️ 这是用户给的口径，不是标定建议；要改回来先问。
     * 【解锁权双写】requiredTech 与 mathematics 那一项的 eff.unlockBuild 指向同一项，
     *   e2e「建筑解锁来源」守着两边一致。
     * ⚠️ 死锁自查：数学的尤里卡条件是「库存科技 1000」，**不指向研究所本身**
     *   （若写成「建成研究所」就是尤里卡要求自己解锁的那座建筑 ⇒ 永远达不成）。 */
    { id: 'institute', icon: 'assets/building-icons/era-2/era2-institute.png', name: '研究所',   ratio: 1.15, cost: {stone: 100, silt: 100},
      desc: '科技产出 ×50%（仅作用于学者）；升级为大学后变 ×100%', requiredTech: ['mathematics'] },
    /* ── 广场（2026-09-28 用户规格 · 市政《戏剧与诗歌》解锁）──
     * 【对标物是潮纹馆，不是热泉井】潮纹馆（library）给科技、广场给市政点，
     *   **两座是姊妹不是同类**：同构的乘区系数（BLD.squareCivRatio 0.10）、
     *   同的人口代价（ratio 1.15）、同为「职业专属」的口径（书手 vs 学者）。
     * 【为什么 cost 是 coral 200 而不是照抄潮纹馆的 150】广场在 era2、潮纹馆在 era1，
     *   同价会让「再攒 50 珊瑚就能多一座乘区建筑」这一档变得毫无 PERIOD 感。
     *   ⚠️ 这仍是**待标定提议值**，用户没拍；改一行就够。
     * 【解锁走 requiredCivic 而不是 requiredTech】用户规格的解锁权在市政《戏剧与
     *   诗歌》身上，所以这里写的是新字段 `requiredCivic`，habitat.unlocked 要认它
     *   （folk 那侧同理有 `job` 字段）。它的读取点只有 habitat.unlocked 一处，
     *   ⚠️ 别在 UI 另写一遍判断，否则会出现「灰着但能建」。 */
    /* ⚠️ 2026-09-28 用户改价：纯珊瑚 200 → `{coral 50, stone 200}`。
     *    首级成本从「一条珊瑚」变成「两条线各出一点」：珊瑚那半降到 50（广场是市政线的
     *    对位建筑，不该跟材料线抢珊瑚），石头那半 200 是新加的——石头此后由采石工与
     *    石梁/绳共用，这条改动让广场也参与消耗它。 */
    { id: 'square', icon: 'assets/building-icons/era-2/era2-square.png', name: '广场', ratio: 1.15, cost: {coral: 50, stone: 200},
      desc: '市政点产出 ×10%/级（仅作用于市政点职业；装政策卡「戏剧与诗歌」后翻倍）',
      requiredCivic: 'drama' },
    /* 神庙（2026-09-28 用户规格 · 市政《神学》完成后解锁）——**潮纹馆的第三座对位**：
     * 潮纹馆给科技 +10%/级、广场给市政点 +10%/级、神庙给信仰 +10%/级。
     * 【为什么 requiredCivic 是 'theology' 而不是科技】与广场同一个道理：
     *   解锁权写在市政身上（用户规格「《神学》研究完成……解锁……建筑神庙」）。
     *   但注意这里读的是 `s.civics`（**已完成**）而不是 `civShown`（已揭示）——
     *   揭示只开门、完成才给东西，这两者不能混（habitat.unlocked 那条守卫就是它）。
     * ⚠️【信仰基础产出**已接通**（2026-10-24 校，旧结论作废）】：economy.faithRate 在完成《神学》后
     *   base = 人口 × CFG.FAITH_PER_POP(0.02)（economy.js:1925），再把 faithMul（神庙这段 ×10%/级）乘上去。
     *   故原文案「宗教系统落地后生效」已过期并删除；尚未做的只是「给信仰命名」那层宗教皮（cond `religion`）。
     * ⚠️ 2026-09-28 用户改价：珊瑚 250 → `{stone 150, silt 50}`。
     *    与广场同一个路子，但拆得更开：石头是**采石工那条线**的货、金属是**矿工那条线**的，
     *    ⇒ 建一座神庙要同时拉动两条采集线，而不是纯珊瑚。 */
    { id: 'temple', icon: 'assets/building-icons/era-2/era2-temple.png', name: '神庙', ratio: 1.15, cost: {stone: 150, silt: 50},
      desc: '信仰产出 ×10%/级（装政策卡「神学」后翻倍）',
      requiredCivic: 'theology' },
    /* ⚠️ 热泉井（geyser）**已按用户 2026-09-28 指令整体删除**——「这些都等着重新设计」。
     *    【它一拆，两条线同时断；重设时这两处必须一起重做，只补一处等于没补】
     *    ① 地热的**唯一产出口**：`economy.fuelRate` 读 `lvl.geyser × BLD.fuel × jobs.craft`。
     *       建筑没了 ⇒ 地热恒 0（函数已改成空实现，见 economy.js 那处注）。
     *    ② 点火术的 `eff.unlockBuild:['geyser']` 与涡轮的尤里卡条件 `cond:{t:'built',
     *        b:'geyser'}` —— **后者不修就是永假条件**（条件指向一座不存在的建筑，不报错、
     *        `condMet` 恒 false ⇒ 涡轮之后的纪元四整条链静默不动）。已在 techs.js 一并清掉。
     *    ⚠️ 这是**设计移除**不是 bug 修复：本作现在没有地热源 ⇒ 破冰祭坛（已随钻机化一并撤除）
     *       永远供不上能 ⇒ 终局「凿穿」改由天穹钻机承担。这是用户要的重新设计的起点，
     *       不是要我去补替代。 */

    /* ── 热液汽轮机 / 热液工坊（2026-09-29 ERA3 · 2026-10-05 flow 模型重做）──
     * 【解锁权双写】requiredTech='metalrefine' 与 metalrefine 的 eff.unlockBuild
     *   ['hydroturbine','hydroshop'] 指向同一项（e2e「建筑解锁来源」守着两边一致）。
     * 【两座的分工 = 用户规格的「汽轮机产能 / 工坊吃能产钢」，且热液能是瞬态流不储存】
     *   · 热液汽轮机：每台每 tick 产 1 热液能流（UNIT.hydroOut），耗 5 暖石/秒（UNIT.hydroWarm）。
     *     暖石不够时按比例降产（economy.hydroAlloc 算供给）。
     *   · 热液工坊：每级每 tick 耗 1 热液能流（UNIT.hydroShopLvl），吃金属产钢
     *     （UNIT.steelPerHydro / steelMetal）。流不够时按比例降产（工坊低阶科技先吃满）。
     *   ⚠️ 天穹钻机（ERA5）从工坊吃剩的流里再取 SKYDRILL_HYDRO/tick。
     * 【成本口径】（待标定默认，数值等用户拍）：汽轮机偏结构件、工坊偏材料。 */
    { id: 'hydroturbine', icon: 'assets/building-icons/era-3/era3-hydroturbine.png', name: '热液汽轮机', ratio: 1.15, cost: {stone: 300, hardCoral: 10},
      desc: '热液能 +1/级/秒，耗暖石 5/级/秒', requiredTech: ['metalrefine'] },
    { id: 'hydroshop', icon: 'assets/building-icons/era-3/era3-hydroshop.png', name: '热液工坊', ratio: 1.15, cost: {stone: 300, iron: 100},
      desc: '耗热液能产钢：每级耗 1 热液能/秒，吃金属产钢', requiredTech: ['metalrefine'] },

    /* ── 王国潮道（2026-09-30 ERA3 市政扩展 · 用户规格表）──
     * ⚠️ 2026-10-06：**这里原本还有一座独立的「城堡」建筑（`{id:'castle'}`），已删除。**
     *   用户设计里城堡**不是建筑**，而是工坊升级项 `upg_castle`：买下它的那一刻，
     *   议事厅这座建筑**就地变成城堡**（名字换成城堡、效果升级，等级还是原来那一座）。
     *   那座独立建筑是 2026-09-30 实装时的误读（「由议事厅升级而来」被落成 need:'hall' 前置），
     *   于是面板上出现「议事厅 7 + 城堡 1」两级并存（用户截图）。本轮按原设计删掉。
     *   ⇒ 城堡的等级恒等于议事厅等级，两处是**同一座**；`economy.coreLvl(s)` 读 lvl.hall，
     *     升级前显示「议事厅 N 级」、升级后显示「城堡 N 级」（render 读 upgrades.upg_castle 切名）。
     *   ⚠️ 因此 `s.lvl.castle` 这个键**不该再存在**（state.js / prestige.js 的残留已清），
     *     回归里也改成断言「建筑表里没有 id==='castle' 的建筑」。     * 【王国潮道】贸易区域新建筑（用户拍板归属），效果 = 每级减少居民奢侈品消耗 0.3%
     *   （economy 奢侈需求 D 读 luxSaveMul）；等级 ≤ 灯塔等级（habitat.build 钳制，
     *   灯塔 0 级时一座都建不起来——规格原文「等级最高不超过灯塔等级」）。
     *   成本按规格原文 100 石头 + 5 钢/级；ratio 提议 1.15（未拍板）。 */
    { id: 'canal', icon: 'assets/building-icons/era-3/era3-canal.png', name: '王国潮道', ratio: 1.15, cost: {stone: 100, steel: 5},
      desc: '每级减少居民奢侈品消耗 0.3%；等级最高不超过灯塔等级',
      requiredCivic: 'department' },

    /* ── 公民会堂（ERA3 · 2026-10-21）──
     * 夹在广场与博物馆之间，补强议事厅 / 城堡自身的基础市政点来源。
     * 独立作用于 coreLvl × HALL_RATE，不放大书手、奇观或其他来源；系数与详情卡共用 BLD.civicHallRatio。
     * 解锁由已有《行政部门》提供，不增加任何后续市政的前置条件。 */
    { id: 'civichall', icon: 'assets/building-icons/era-3/era3-civichall.svg', name: '公民会堂', ratio: 1.5, cost: { stone: 500, steel: 20 },
      desc: '议事厅／城堡市政点产出 +50%/级。',
      requiredCivic: 'department' },

    /* ── ERA4 三座建筑（2026-09-30 用户规格表）──
     * ⚠️【解锁双写】每座都在 techs.js 那一项写了 `eff.unlockBuild`，这里再写一次
     *   `requiredTech`（两边指向同一个科技 id），这是本表既有的双写口径
     *   （hydroturbine/hydroshop 那条已注明，e2e「建筑解锁来源」守着两边一致）。
     * 【天壳观测站】建成后，学者科技产出随本局削壳进度线性提高，每削薄 5% 得 +1 个百分点，
     *   壳体完全削穿时上限 +20%；加成不随观测站等级重复叠加。
     * 【速生珊瑚林】用户 2026-09-30 改口径为「+珊瑚匠产出」⇒ 与研究所→学者同构的
     *   **职业专精建筑**：每级 +10%，乘在珊瑚匠那一行的产出上、与工具乘区独立相乘。
     *   ⚠️ 它不是 gatherMul 那类**全局采集轴**（删礁石平台时禁的是那一类），所以不冲突。
     * 【银行】每级商人产出 +10%（走奢侈品供给 S 那一侧）。
     * ⚠️【造价】三项的成本都是用户表里定的终值；速生珊瑚林的成本成长 ratio 2.5
     *    （比常规 1.15 陡得多）也是用户指明要的，别顺手改回 1.15。 */
    { id: 'observatory', icon: 'assets/building-icons/era-4/era4-observatory.png', name: '天壳观测站', ratio: 1.15, cost: { steel: 20, stoneBeam: 200 },
      desc: '建成后，学者科技产出随本局削壳进度提高：每削薄 5% +1%，最高 +20%（不随等级叠加）',
      requiredTech: ['shellwatch'] },
    { id: 'coralfarm', icon: 'assets/building-icons/era-4/era4-coralfarm.png', name: '速生珊瑚林', ratio: 2.5, cost: { kelp: 1000 },
      desc: '每级珊瑚匠产出 +10%（职业专精建筑，与工具乘区独立相乘）',
      requiredTech: ['printing'] },
    { id: 'bank', icon: 'assets/building-icons/era-4/era4-bank.png', name: '银行', ratio: 2, cost: { steel: 30, stoneBeam: 400 },
      desc: '每级商人产出 +10%（走奢侈品供给那一侧）',
      requiredTech: ['banking'] },

    /* ── ERA4 两座建筑（2026-10-01 用户设计稿）──
     * 【商队驿站】由《探索》解锁（requiredCivic）。**两条效果都按等级生效**
     *   （2026-10-06 用户报「就这点效果？」后接线 —— 原实现只判 lvl>=1，于是 1 级与
     *   5 级效果**完全相同**，而 ratio 1.15 意味着满级比 1 级多花 1.75 倍的钱。属
     *   「承诺了没接线」那一类，这是被质疑的真正根因，不只是「量级偏小」）：
     *     ① 每季（economy.seasonGrant）随机给一份「任意时产资源 × **等级** 分钟产量」
     *        —— 1 级 = 60 秒，与原口径完全一致 ⇒ 零回归；5 级 = 300 秒。
     *     ② **每级 −1% 居民奢侈品消耗**（BLD.caravanseraiLuxSave）—— 走
     *        `economy.luxSaveAll` 与王国潮道**并列相加**，tick / rates / UI 三处同源。
     * 【博物馆】由《启蒙运动》解锁（requiredCivic）。效果 = 官员（书手）市政点产出 +20%/级，
     *   由 economy.cultureRate 的 museumCivicMul(s) 读（每级再加 +20%）。
     *   ⚠️ 两座的 cost/ratio 是提议值（用户拍「先这样，后续重做」），未标定。 */
    /* ⚠️ 2026-10-27 用户拍板：造价曲线 ratio 1.15 → **1.5**。
     *   起因是「物流仓库」(upg_logiware) 的 +200/级 修复（原来把布尔当数量用，恒 +200）。
     *   修好后每级真的给 200 材料容量，1.15 的线性造价压不住，故抬到 1.5。
     *   ⚠️ ratio 是**建筑级**参数，costOf 只有 `Math.pow(b.ratio, effN)` 一处（economy.js:521），
     *      没有「升级后单独一条曲线」⇒ 这条同时作用于**未升级的商队驿站**（ERA4 起），不只物流仓库。
     *   造价（base stone 200 / rope 100，未含各全局折扣）：1 级 200｜5 级 1012｜10 级 7688｜
     *      累计到 10 级 22666 石（旧 1.15 时为 704 / 4060）。 */
    { id: 'caravanserai', icon: 'assets/building-icons/era-4/era4-caravanserai.png', name: '商队驿站', ratio: 1.5,
      cost: { stone: 200, rope: 100 },
      desc: '每季节判定一次：获得任意时产资源「等级 × 1 分钟」产量；每级另减 1% 居民奢侈品消耗。',
      requiredCivic: 'explore' },
    { id: 'museum', icon: 'assets/building-icons/era-4/era4-museum.png', name: '博物馆', ratio: 2,
      cost: { stone: 400 },
      desc: '官员（书手）市政点产出 +20%/级。',
      requiredCivic: 'enlightenment' },

    /* ══ ERA9 建筑（2026-10-20 用户规格 · 由《神们自己》解锁）══
     * 黑色方碑：消耗 1000 石梁，每级造价 ×1.5（ratio:1.5）。
     * ⚠️ 2026-10-24 用户拍板改效果：原「建成即全局信仰产出 ×1.2（一次性，等级不叠加）」
     *    改为「**每级** ×1.05」（faithMulPerLvl:1.05）。
     *    读数：economy.faithRate 经 civics.buildingFaithMul 读，Math.pow(1.05, lvl)，乘整段。
     *    曲线：1.05^14 = 1.9799（未到 ×2）｜1.05^15 = 2.0789（首次越过 ×2）⇒ 软上限 ×2 需 15 级。
     *    ⚠️【对冲关系】收益 1.05^n 指数增长 vs 造价 1.5^(n-1) 指数增长，后者快得多
     *       ⇒ 等级越高边际越亏（15 级单级造价 291,929 石梁，累计 873,788 石梁）。
     * 无 zone（不参与分区/人口/产能统计），纯信仰增益建筑。解锁走 requiredCivic（神们自己）。 */
    { id: 'black_monolith', icon: 'assets/building-icons/era-9/era9-black-monolith-v2.png', name: '黑色方碑', ratio: 1.5,
      cost: { stoneBeam: 1000 },
      faithMulPerLvl: 1.05,
      desc: '每级使全局信仰产出 ×1.05（消耗 1000 石梁，每级造价 ×1.5）。',
      requiredCivic: 'gods_themselves' },

    /* ── ERA5 两座建筑（2026-10-02 实装）──
     * 【热锻工厂】由「工业化」解锁（requiredTech，与 techs.js industrialize 的 eff.unlockBuild 双写一致）。
     *   效果：每级 +7% 工艺制作效率，走 workshop.craftRatio 的加法乘区（读 BLD.hotforgeCraft），
     *   不在建筑表写 craftRatio 死字段（那只会造出无人读取的键）。
     *   ⚠️【cost 为提议值，未拍板】量级对齐 era4 建筑（钢 + 钛高阶料）。
     * 【学校】由「普及教育」解锁（requiredTech，与 techs.js pubedu 的 eff.unlockBuild 双写一致）。
     *   效果：每级给每名鲛人 +0.1 科技/s 与 +0.1 市政点/s（BLD.schoolMermanSci/schoolMermanCivic），
     *   tick/rates（科技）/cultureRate（市政）三处同式读；不再依赖商人或中世纪集市。
     *   ⚠️【cost 为提议值，未拍板】。 */
    { id: 'hotforge', icon: 'assets/building-icons/era-5/era5-hotforge.png', name: '热锻工厂', ratio: 1.5, cost: { steel: 400, titanium: 150 },
      desc: '工艺制作效率 +7%/级（加法乘区，与工坊级/奇观/科技同一条轴）',
      requiredTech: ['industrialize'] },
    { id: 'school', icon: 'assets/building-icons/era-5/era5-school.png', name: '学校', ratio: 1.15, cost: { steel: 300, titanium: 200 },
      desc: '每名鲛人 +0.1 科技/s、+0.1 市政点/s（每级；由 BLD.schoolMermanSci/schoolMermanCivic 读）',
      requiredTech: ['pubedu'] },

    /* ── ERA5 两座建筑（2026-10-02 实装 · 渊潜鲛歌/城市化 解锁）──
     * 【歌剧院】requiredCivic='sharksong'。效果 = 官员（书手）市政点产出 +15%/级
     *   （economy.cultureRate 的 theaterCivicMul 读，与博物馆 scribeCivicMul 同型，只裹书手那一截）。
     *   BLD.theaterCivRatio:0.15。
     * 【廉租社区】requiredCivic='urbanization'。效果 = 人口上限 +10/级（economy.popCap 读
     *   s.lvl.tenement * BLD.tenementPop）。⚠️ ratio 3 为用户原话「升级倍率设定为3」，待标定。
     * ⚠️【cost 为提议值，未拍板】量级对齐 era5 建筑（钢 + 钛/脚手架高阶料）。 */
    { id: 'theater', icon: 'assets/building-icons/era-5/era5-theater.png', name: '歌剧院', ratio: 1.5, cost: { steel: 100, stone: 400 },
      desc: '官员（书手）市政点产出 +15%/级（由 theaterCivicMul 读）。',
      requiredCivic: 'sharksong' },
    { id: 'tenement', icon: 'assets/building-icons/era-5/era5-tenement.png', name: '廉租社区', ratio: 3, cost: { scaffold: 25, steel: 100 },
      desc: '人口上限 +10/级（由 popCap 读）；每级额外 +5% 居民奢侈品消耗（增耗，economy.tenementLuxAdd 读）。',
      requiredCivic: 'urbanization' },
    /* ── ERA6（2026-10 实装）：科研所（chemistry 解锁，双写一致）：
     *   每级科技产出 +10%（researchLabSci，tick/rates 同式），且使研究科技消耗 −2%/级（researchLabSave，
     *   由 tech.study 读）。造价全 tiplate。
     *   ⚠️ ratio 2026-10-17 用户拍板 1.15 → 2（成本每级翻倍，收敛更快；收益曲线同步前移）。 */
    { id: 'researchlab', icon: 'assets/building-icons/era-6/era6-researchlab.png', name: '科研所', ratio: 2, cost: { tiplate: 200 },
      desc: '科技产出 +10%/级（researchLabSci）；研究科技消耗 −2%/级（researchLabSave）。',
      requiredTech: ['chemistry'] },

    /* ── ERA7（2026-10-17 实装 · spec §5 太空建筑系统 + §4 核裂变）──
     * 【星海区】新分区：1 级 = 1 颗/1 座。建造成本吃 spaceCostMul 软上限（economy.costOf 对 zone==='space'）。
     * 【轨道卫星】每级星空探索 +5/秒（starRate）+ 学者产出 +25%（学者线乘区）。ratio 1.5 用户拍板。
     * 【空间站】每级星空探索 +10/秒、运转耗 2 热液能/秒（hydroAlloc stationDraw，挂 spacestationStop「开几座」开关）。
     * 【核热厂】归工坊区（热液产线家族）：每级 +10 热液能/秒（不烧暖石，hydroAlloc 供给侧相加）、
     *   基础 −0.35 铀/秒（tick 直耗；研究核聚变后×2）、居民奢侈品消耗 +10%/级（tenementLuxAdd 同构通道，§0-3 负面）。 */
    { id: 'satellite', stardustFacility: true, icon: 'assets/building-icons/era-7/era7-satellite.png', name: '轨道卫星', ratio: 1.5, cost: { tiplate: 100, rocketFuel: 100 },
      desc: '星空探索 +5/秒、学者产出 +25%/级。运转耗 1 热液能/秒（可「开几座」）。1 级 = 1 颗。',
      requiredTech: ['rocket'] },
    { id: 'spacestation', stardustFacility: true, icon: 'assets/building-icons/era-7/era7-spacestation.png', name: '空间站', ratio: 1.5, cost: { rocketEngine: 5 },
      desc: '星空探索 +10/秒、运转耗 2 热液能/秒（建筑页可「开几座」）。1 级 = 1 座。',
      requiredTech: ['spacestation'] },
    { id: 'fissionplant', icon: 'assets/building-icons/era-7/era7-fissionplant.png', name: '核热厂', ratio: 1.15, cost: { tiplate: 2000, steel: 400 },
      /* ⚠️ 2026-10-21（用户拍板）：desc 只写**基础量**，不再带「（核聚变后×2）」这种条件句。
       *   卡面 / 建筑行的实际数由 SB.ui.buildingDescText 与 render-info 的 fissionplant 分支
       *   按本局是否已研究 nuclear_fusion 现算（产出 ×5 / 铀耗 ×2，判据与结算同源）。 */
      desc: '热液能 +10/秒/级（不烧暖石）；耗铀 0.35/秒/级；居民奢侈品消耗 +10%/级（负面）。',
      requiredTech: ['fission'] },
    /* ── ERA7（2026-10 实装 · 竞技体育 解锁）──
     * 【体育场】requiredCivic='athletics'。效果 = 族民奢侈品消耗 -5%/级（economy.luxSaveAll 读 BLD.stadiumLuxSave，
     *   总减免封顶 75%）；装填《直播竞技》卡时额外产出市政点（economy.cultureRate 读 liveCompCivic）。
     * 【多实例】ratio 1.5（1 级 = 1 座，可叠建，与轨道卫星/空间站同形）。cost 1600 钢为用户规格原值。 */
    { id: 'stadium', icon: 'assets/building-icons/era-7/era7-stadium.png', name: '体育场', ratio: 1.5, cost: { steel: 1600 },
      desc: '族民奢侈品消耗 -5%/级（封顶 -75%）；装填《直播竞技》时额外产出市政点 = 人口 × 体育场等级。',
      requiredCivic: 'athletics' },

    /* ── ERA8（2026-10-18 实装 · spec §4）──
     * 【生物材料研究所】学术区。θ生物金属的唯一产线：每级耗 藻食100/精铁4/钛2/铀0.35（×bldEff
     *   原料效率）⇒ 产 θ 0.0625（原料最紧者决定开工率，thetaFlow/thetaRate 单一真源）；
     *   每级耗热液能 3/秒（hydroAlloc labDraw，断流只停耗）；纳米技术后 产出×1.1 × 效率×1.3。
     *   ratio 1.15（多级收敛，与核热厂同档）；纳米技术尤里卡门槛仍为「θ 产出 5/秒」。
     * 【瑞亚星矿井】星海区。每级产 石梁 2.5 / 硬化珊瑚 2.5 / 铀 0.25（较原值提高 50 倍），
     *   吃 globalMul；气云采集的尤里卡「矿井 ≥3 级」是它的下游门。
     * 【泰坦星气云采集站】星海区。每级 +6 热液能/秒（供给侧，不烧暖石）+5 燃料/秒。
     * ⚠️ 三座都在星海区（space）⇒ 建造成本自动吃 spaceCostMul 软上限（costOf 对 zone==='space'），
     *    与轨道卫星/空间站同待遇，无需另接。 */
    { id: 'biomatlab', icon: 'assets/building-icons/era-8/era8-biomatlab.png', name: '生物材料研究所', ratio: 1.15, cost: { titanium: 200, tiplate: 60 },
      desc: '制造 θ生物金属：每级耗 藻食100/精铁4/钛2/铀0.35 ⇒ 产 θ +0.0625/秒；耗热液能 3/秒（断流只停耗）。',
      requiredTech: ['biomat'] },
    { id: 'rheamine', stardustFacility: true, icon: 'assets/building-icons/era-8/era8-rheamine.png', name: '瑞亚星矿井', ratio: 1.5, cost: { thetaMetal: 60, rocketEngine: 10 },
      desc: '异星在地开采：每级 石梁 +2.5/秒、硬化珊瑚 +2.5/秒、铀 +0.25/秒。1 级 = 1 座。',
      requiredTech: ['xenoconst'] },
    { id: 'titancloud', stardustFacility: true, icon: 'assets/building-icons/era-8/era8-titancloud.png', name: '泰坦星气云采集站', ratio: 1.5, cost: { thetaMetal: 100, rocketEngine: 10 },
      desc: '采集泰坦星气云：每级 热液能 +6/秒（不烧暖石）、燃料 +5/秒。1 级 = 1 座。',
      requiredTech: ['gascloud'] },
    /* ── ERA8（2026-10-19 · B7 机器人机制实装 · spec §6）──
     * 【机器人充能站】礁栖核心（核心区 · 2026-10-21 由工坊区迁入）。每级维持 4 机器人人口（folk.robotPop = 4 × lvl）；
     *   机器人仅能担任非书手/学者的岗位（folk.robotJobAllowed），产出 ×robotMult(s)
     *   （默认 1.2；ERA10 强人工智能升级后 1.5，effJobs 合并、剔除 scribe/scholar）。
     *   ERA10（2026-10-20）：买了升级「强人工智能」后机器人**按人口口径产信仰**
     *   （economy.faithRate 基项 +robotPop）—— desc 与注释同步改，别再写「不影响信仰点」。
     *   每级耗热液能 8/秒（hydroAlloc robotbayDraw，断流只停耗）。
     *   ratio 3（用户 2026-10-21 标定：每级造价 ×3，升级成本骤增；原 1.15 与核热厂/生物材料研究所同档已弃）；造价 100θ + 800 tiplate（spec §4 B6：200→800 ×4）。
     *   requiredTech='protoai' 与 protoai.unlockBuild 同源（都指向初级人工智能）。 */
    { id: 'robotbay', icon: 'assets/building-icons/era-8/era8-robotbay.png', name: '机器人充能站', ratio: 3, cost: { thetaMetal: 100, tiplate: 800 },
      desc: '维持 4 机器人人口/级：仅担任非书手/学者的岗位，产出 +20%。工坊升级「强人工智能」后产出 +50%，且按人口数量产出信仰。耗热液能 8/秒/级。',
      requiredTech: ['protoai'] },
    /* ── ERA9（2026-10-19 实装）──
     * 【马尔斯工造中心】星海区（用户拍 P5：马尔斯算异星，与 rheamine/titancloud 同区 ⇒ 吃 spaceCostMul）。
     *   ratio 1.5（与 rheamine/titancloud 同档）；造价 160θ生物金属 + 10 强工质火箭引擎（用户规格）；
     *   requiredTech='alien_eng' 与 alien_eng.unlockBuild 同源。每级 钛金板件 +3/秒、钛 +2/秒（P7①）。 */
    { id: 'mars_workshop', stardustFacility: true, icon: 'assets/building-icons/era-9/era9-mars-workshop.png', name: '马尔斯工造中心', ratio: 1.5, cost: { thetaMetal: 160, strongProp: 10 },
      desc: '火星在地制造中心：每级 钛金板件 +3/秒、钛 +2/秒。1 级 = 1 座。',
      requiredTech: ['alien_eng'] },
    /* 【欧罗巴冰面发射场】母星（欧罗巴）发射设施（用户拍 P6/⑥：欧罗巴是母星、不算异星 ⇒ 不进 lvlSum、归礁栖核心）。
     *   ratio 1.5；造价用户未给，按量级给 steel 1000 + θ金属 200 + 强工质火箭引擎 50（待标定）。
     *   每座场独立按周期计时；周期完成后按本场等级同时发射同等数量的帆/节点，等级不改变进度速度。
     *   帆模式每 s/级耗：铀 0.5 + 强工质火箭引擎 0.3 + θ金属自适应薄膜 0.3 + 热液能 4（flow）。
     *   requiredTech='microwave_heat' 与微波加热解锁同源；耗料与帆累加逻辑在 economy-tick / hydroAlloc。 */
    { id: 'europa_launch', launchpad: true, stardustFacility: true, icon: 'assets/building-icons/era-9/era9-europa-launch-v2.png', name: '欧罗巴冰面发射场', ratio: 1.5, cost: { steel: 1000, thetaMetal: 200, strongProp: 50 },
      desc: '每座发射场独立按制造周期计时，周期完成时按本场等级同时发射同等数量太阳帆；等级不改变进度速度。太阳帆模式每级每秒耗铀 0.5 + 强工质火箭引擎 0.3 + θ金属自适应薄膜 0.3 + 热液能 4。《绝热材料》完成后可切换制造戴森球节点（每级每秒耗铀 5 + 强工质火箭引擎 3 + θ金属自适应薄膜 3 + 钛合金板 30 + 热液能 4，周期完成时按本场等级同时发射）。',
      requiredTech: ['microwave_heat'] },
    /* 【太阳星环】ERA10（2026-10-20 实装 · 用户 ERA10 表「近恒星轨道建设」解锁）：近恒星轨道环形结构。
     *   ratio 1.5（与 era9 两座同档）；造价 300 θ金属 + 20 封闭藻仓（sealbin，ERA6 工艺物品，现成 key）。
     *   每级 +0.05 θ金属/秒（economy.thetaOut 新项，与 biomatlab 线**独立相加**）、人口上限 +1/级（economy.popCap）。
     *   requiredTech='near_star_orbit' 与科技侧 eff.unlockBuild 双写（解锁权两处同源，e2e 三断言口径）。 */
    { id: 'solar_ring', stardustFacility: true, icon: 'assets/building-icons/era-10/era10-solar-ring-v2.png', name: '太阳星环', ratio: 1.5, cost: { thetaMetal: 300, sealbin: 20 },
      desc: '近恒星轨道环：每秒产 0.05 θ金属/级；人口上限 +1/级。',
      requiredTech: ['near_star_orbit'] },

    /* ── ERA10 市政（2026-10-20 用户规格 · 实装）──
     * 【泰拉星轨道发射场 / 恩克拉多斯星轨道发射场】（市政《公共工程局》解锁）
     *   用户拍 Q1 = **新建两座独立建筑**，与欧罗巴发射场同功能（各自按周期计时，完成时按等级数发射）；
     *   用户追加「两个新发射场和欧罗巴原发射场制造消耗设计相同」⇒ 三座发射场在同一模式下耗料相同：
     *     帆模式 0.5 铀 + 0.3 强工质引擎 + 0.3 θ薄膜 + 4 热液能 /秒/级；节点模式 5 铀 + 3 引擎 + 3 薄膜 + 30 钛板 + 4 热液能。
     *   ⇒ 三座共用 economy 的 launch* 单一落点（launchLvl / launchCycleOf / launchHydroPer），
     *     绝不在 tick 与 rates 各写一份（那正是面板撒谎家族）。
     * 【造价「从 1 级开始」】用户表原文。落地 = **不进 COST_OFFSET_COVERED**
     *   （G.E.E.K 恩克拉多斯/泰拉改造会给覆盖建筑造价等级 −3/−5，新发射场刻意不吃这份折扣）。
     *   造价为提议值（欧罗巴 steel1000+θ200+火箭50 上浮），待标定。
     * 【解锁走 requiredCivic】解锁权在市政身上（与黑色方碑同一轴），不走科技 eff.unlockBuild。 */
    { id: 'terra_launch', launchpad: true, stardustFacility: true, icon: 'assets/building-icons/era-10/era10-terra-launch.png', name: '泰拉星轨道发射场', ratio: 1.5,
      cost: { steel: 1000, thetaMetal: 200, strongProp: 50 },
      desc: '每座发射场独立按制造周期计时，周期完成时按本场等级同时发射同等数量太阳帆；等级不改变进度速度。太阳帆模式每级每秒耗铀 0.5 + 强工质火箭引擎 0.3 + θ金属自适应薄膜 0.3 + 热液能 4。造戴森球节点时耗料与节律同欧罗巴发射场，周期完成时按本场等级同时发射。造价按 1 级起算（不吃星球改造的等级折扣）。',
      requiredCivic: 'public_works' },
    { id: 'enceladus_launch', launchpad: true, stardustFacility: true, icon: 'assets/building-icons/era-10/era10-enceladus-launch.png', name: '恩克拉多斯星轨道发射场', ratio: 1.5,
      cost: { steel: 1000, thetaMetal: 200, strongProp: 50 },
      desc: '每座发射场独立按制造周期计时，周期完成时按本场等级同时发射同等数量太阳帆；等级不改变进度速度。太阳帆模式每级每秒耗铀 0.5 + 强工质火箭引擎 0.3 + θ金属自适应薄膜 0.3 + 热液能 4。造戴森球节点时耗料与节律同欧罗巴发射场，周期完成时按本场等级同时发射。造价按 1 级起算（不吃星球改造的等级折扣）。',
      requiredCivic: 'public_works' },

    /* 【虚境祭坛】（市政《虚境探索》解锁）
     *   人口成本按目标等级固定阶梯：建造 1 级=30、升级至 2 级=75、升级至 3 级=200；最高 3 级。
     *   ⚠️ `cost.pop` 是**人口造价**，不是资源：economy.costOf 跳过它、canAfford 特判 s.pop、
     *      pay 不扣（扣人口走 habitat.consumePop，按用户拍板「扣当前人口，按当前职业分配比例扣」）。
     *   ⚠️ `maxLvl` 是全仓第一条等级上限：habitat.build / autoTick / 卡片 UI 三处都要认它，
     *      漏自动建造那一处 = 挂一晚自动买到 99 级。
     *   ⚠️ 无产出（用户未给效果）：它是《飞升虚境》的鼓舞门槛 + 血纹视觉。
     *   血纹纯 UI（render-pane-village 读 lvl 拼类名，CSS 画层），不进结算。 */
    { id: 'void_altar', icon: 'assets/building-icons/era-10/era10-void-altar-v2.png', name: '虚境祭坛', ratio: 1.5,
      cost: { pop: 30 }, popCostByLevel: [30, 75, 200], maxLvl: 3,
      desc: '以族民为祭：建造 1 级消耗 30 人口，升至 2 级消耗 75，升至 3 级消耗 200（按当前职业分配比例扣减）。三级俱成，虚境的门为你打开。',
      requiredCivic: 'void_explore' }
  ];

  /* ⚠️═══ 建筑分区（2026-09-30 用户拍板 · 纯 UI 分区 A 方案）═══
   * 命名与归属（用户最终拍板）：
   *   礁栖核心 / 生息区（原「生计区」，用户嫌不好听改名）/ 工坊区 /
   *   贸易区域（灯塔·海藻仓·压舱仓归此，原「仓储区」「灯塔区」撤销并入）/
   *   学术区 / 市政区（与信仰拆开）/ 信仰区 / 破界区（终局闸门区，目前无建筑常驻，空区自动隐藏）。
   * 顺序即 UI 呈现顺序。改分区只动 BUILD_ZONE_OF，不动 BUILDINGS 各对象的字段，
   * 避免 19 处并行编辑互相覆盖（本项目已踩过此坑）。 */
  var BUILD_ZONES = [
    { id: 'core',     name: '礁栖核心' },
    { id: 'food',     name: '生息区' },
    { id: 'workshop', name: '工坊区' },
    { id: 'trade',    name: '贸易区域' },
    { id: 'academy',  name: '学术区' },
    { id: 'civic',    name: '市政区' },
    { id: 'faith',    name: '信仰区' },
    /* ERA7（2026-10-17 · spec §5）：太空区 —— 轨道卫星/空间站。分区名为提议值，待用户拍。 */
    { id: 'space',    name: '星海区' },
    { id: 'break',    name: '破界区' }
  ];
  /* id → zone 归属表。改分区只动这张表（与 BUILDINGS 解耦，规避并行 Edit 覆盖坑）。 */
  var BUILD_ZONE_OF = {
    nest: 'core', coralhouse: 'core', hall: 'core',
    /* 城堡（2026-09-30）：由议事厅（core）升级而来，归礁栖核心。 */
    castle: 'core',
    kelp: 'food', weir: 'food', warmnest: 'food',
    siltpit: 'workshop', furnace: 'workshop', workshop: 'workshop',
    hydroturbine: 'workshop', hydroshop: 'workshop',
    /* 热锻工厂（2026-10-07 用户拍板）：归工坊区 —— 它是工艺制作效率建筑（与工坊/炉/汽轮机同区）。 */
    hotforge: 'workshop',
    lighthouse: 'trade', kelpstore: 'trade', ballast: 'trade',
    /* 王国潮道（2026-09-30 用户拍板）：归贸易区域。 */
    canal: 'trade',
    library: 'academy', institute: 'academy',
    /* 天壳观测站（2026-09-30 ERA4）：归学术区 —— 它的尤里卡要求学术区合计 35 级
     *   （2026-10-06 用户把门槛从 70 下调到 35）。 */
    observatory: 'academy',
    square: 'civic', civichall: 'civic', temple: 'faith', black_monolith: 'faith',
    /* 速生珊瑚林（2026-09-30 ERA4）：生息区 —— 它是「种珊瑚」，与藻食那批同区。 */
    coralfarm: 'food',
    /* 银行（2026-09-30 ERA4）：贸易区域 —— 它的尤里卡就要求贸易区合计 100 级。 */
    bank: 'trade',
    /* 商队驿站 / 博物馆（2026-10-01 ERA4）：商队驿站归贸易区域（贸易触发建筑）、
     *   博物馆归市政区（官员/行政相关）。 */
    caravanserai: 'trade', museum: 'civic',
    /* 学校 / 歌剧院（2026-10-07 用户报「地方放错了」）：两座此前漏登本表，
     *   zone 走了 `|| 'core'` 兜底掉进礁栖核心。学校归学术区（教育类）；
     *   歌剧院归市政区（效果就是官员市政点产出 +15%/级，且《渊潜鲛歌》鼓舞
     *   数的「市政区合计等级 30」理应把它算进去）。 */
    school: 'academy', theater: 'civic',
    /* 体育场（2026-10 实装 · 竞技体育 解锁）：归市政区（官员/行政/民生相关建筑同区）。 */
    stadium: 'civic',
    /* 廉租社区（2026-10-07 用户拍板）：就放礁栖核心（住房类，与巢/珊瑚屋同区）。 */
    tenement: 'core',
    /* ERA6（2026-10 实装）：科研所归学术区（科研类，与潮纹馆/研究所同区）。 */
    researchlab: 'academy',
    /* ERA7（2026-10-17 · spec §5）：太空两座归新分区「星海区」；核热厂归工坊区（热液产线家族）。 */
    satellite: 'space', spacestation: 'space', fissionplant: 'workshop',
    /* ERA8（2026-10-18）：生物材料研究所归工坊区（原料转换产线）；
     *   瑞亚星矿井/泰坦星气云采集站归星海区（在地工业，与卫星/空间站同区 ⇒ 吃 spaceCostMul）。 */
    biomatlab: 'workshop', rheamine: 'space', titancloud: 'space',
    /* ERA8（2026-10-19 · B7）：机器人充能站原归工坊区（机器人产线家族）；2026-10-21 用户拍板改归
     *   礁栖核心（核心区）—— 故其等级现计入 coreFaithMul（礁栖核心每级 +10% 信仰）与「我们在此」卡的
     *   coreSpaceFaithMul（core+space 每级 +10%）两项信仰乘区，且君主制政体下建造 −10%。
     *   ⚠️ 这些是按 zone 自动派生的副作用，非机器人机制本意；若只想挪 UI 分区不想加信仰需另写排除。 */
    robotbay: 'core',
    /* ERA9（2026-10-19）：马尔斯工造中心归星海区（异星制造，与 rheamine/titancloud 同区 ⇒ 吃 spaceCostMul）；
     *   欧罗巴冰面发射场归礁栖核心（欧罗巴是母星、不算异星，不进 lvlSum）。 */
    mars_workshop: 'space', europa_launch: 'core',
    /* ERA10（2026-10-20）：太阳星环归星海区（近恒星轨道建筑，与卫星/空间站同区 ⇒ 吃 spaceCostMul）。
     * 两座异星发射场同归星海区（在地工业 → 与 rheamine/titancloud/mars_workshop 同区，同样吃 spaceCostMul）；
     * 虚境祭坛归信仰区（与神庙/黑色方碑同区，纯 UI 分区，不吃 spaceCostMul）。 */
    solar_ring: 'space', terra_launch: 'space', enceladus_launch: 'space', void_altar: 'faith'
  };
  for (var _bzi = 0; _bzi < BUILDINGS.length; _bzi++) {
    BUILDINGS[_bzi].zone = BUILD_ZONE_OF[BUILDINGS[_bzi].id] || 'core';
  }
  SB.BLD = BLD;
  SB.BUILDINGS = BUILDINGS;
  SB.BUILD_ZONES = BUILD_ZONES;
  SB.BUILD_ZONE_OF = BUILD_ZONE_OF;
})(typeof window !== 'undefined' ? window : globalThis);
