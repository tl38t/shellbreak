/* 天壳 / SHELLBREAK — 每帧资源与人口结算。
 * 纯结算流程拆自 economy.js；常量和共享公式从 economyInternals 读取。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG, UNIT = SB.UNIT, BLD = SB.BLD, SOCIAL = SB.economySocial;
  var P = SB.economyInternals;
  var addRes = P.addRes, algaeCropMul = P.algaeCropMul, bankMul = P.bankMul;
  var baseMul = P.baseMul, coldSeasonMul = P.coldSeasonMul, coralFarmMul = P.coralFarmMul;
  var coralPactMul = P.coralPactMul, cultureRate = P.cultureRate, faithRate = P.faithRate;
  var foodRate = P.foodRate, foodUse = P.foodUse, fuelRate = P.fuelRate;
  var furnaceBoostMul = P.furnaceBoostMul, gatherMul = P.gatherMul, globalMul = P.globalMul;
  /* ERA10（2026-10-20）：globalMulX = globalMul × unifiedMul（大统一方程轴）。
   * 科技/市政/信仰三行**继续用 globalMul**（用户表明文排除）；其余产横行切 _gmx。 */
  var globalMulX = P.globalMulX;
  var autoDrillOutputMul = P.autoDrillOutputMul;
  var activeSiltpit = P.activeSiltpit;
  /* ERA10 市政（2026-10-20）：发射场三座合计等级 / 制造节律 / 每级热液耗——全部走 economy 的
   * 单一落点（rates 同源），绝不在本文件再写一份「求和 + 节律 + 耗流」的公式。 */
  var launchBids = P.launchBids, launchRunLvl = P.launchRunLvl, launchActiveLvl = P.launchActiveLvl;
  var launchProcOf = P.launchProcOf;
  var setLaunchProc = P.setLaunchProc, launchNodeMode = P.launchNodeMode, launchMaterialPer = P.launchMaterialPer;
  var launchCycleOf = P.launchCycleOf, launchHydroPer = P.launchHydroPer;
  var ironFlow = P.ironFlow, isCold = P.isCold, isFull = P.isFull;
  var libraryLevel = P.libraryLevel, luxuryPactMul = P.luxuryPactMul;
  var mineTaxMul = P.mineTaxMul, obsSciMul = P.obsSciMul, resUnlocked = P.resUnlocked;
  var seasonTurn = P.seasonTurn, steelFlow = P.steelFlow, toolMul = P.toolMul;
  var upgSum = P.upgSum, warmCap = P.warmCap, warmEff = P.warmEff, warmRelief = P.warmRelief;

  function tick(s, dt, emit, opts) {
    if (s.broken) return;
    s.t += dt;
    /* 换季判定必须排在读 cold 之前：冰封期是「这一季中没中」的状态，
     * 先换季再取 cold，否则开局那一 tick 会带着上一季的 frozen 跑。 */
    var _seasonChanged = seasonTurn(s);

    var cold = isCold(s) ? coldSeasonMul(s) : 1;
    var j = SB.folk.effJobs(s);   // ERA8 B7：合并人类 + 机器人×1.2（剔除 scribe/scholar）
    /* ⚠️【ERA4 天壳观测站的壳厚快照】把本 tick 开场时的冰壳厚度冻住，供 obsSciMul 两侧共用。
     *    为什么必须冻：削壳发生在本函数第 8 步（`SB.shell.tickShell`），
     *    而科技产出在第 4 步就算完了 —— 若不冻，同一秒内「结算用削前、面板用削后」，
     *    两边差一点点却天天存在，正是 `面板 === 结算` 这条铁律要拦的那一种。
     *    ⚠️ 这不是业务数据，不参与存档语义（读不回来就回落 s.shell，见 obsSciMul）。 */
    s._shellSnap = s.shell;
    /* ⚠️【happy 快照 · 与壳厚同一纪律】把本 tick 开场时的幸福度冻住，供 globalMul/happyMul
     *    两侧共用。为什么必须冻：本函数下面的恒温器会改 s.happy（断供时按 K·(S−D) 下滑），
     *    而**生产各行用的是 tick 开头缓存的 `_gm`**（即开场 happy 的乘区）。若 rates() 在 tick
     *    之后才读 s.happy（已被恒温器改小），面板会拿到「下滑后的 happyMul」而实账用的是
     *    「下滑前的」—— 这正是此前 5 条「面板石头/科技/市政点速率与 tick 不同源」红的根因
     *    （实账 0.96、面板 0.8832 = 0.96 × 0.92，0.92 正是 happy 掉到 −0.0001 那档乘区）。
     *    冻快照后 rates() 与 tick() 的生产共用同一份 happy 基准，面板 === 结算。
     *    ⚠️ 同样不参与存档语义（obsSciMul 那条同理）：读回旧档没有 _happySnap 时回落 s.happy。 */
    s._happySnap = s.happy;

    /* ⚠️ 2026-09-30 性能：tick 内聚合乘区缓存。
     *   globalMul / gatherMul 在一个 tick 内被重复调用多次（实测满档 globalMul 10 次、
     *   gatherMul 4 次），每次都遍历 TECHS/UPGRADES/TOOLS/CIVICS/WONDERS 全表。
     *   这些值在一个 tick 内恒定不变（自动解锁只在 game.js 实时泵里发生，tick 内部不写
     *   techs/civics/upg/wonder/tools；s.pop 虽在 tick 内会因生死变化，但上述乘区都不依赖
     *   pop），故在 tick 开头算一次、后面复用即可。纯性能优化，数学结果逐位不变
     *   （e2e「面板 == 实账」与「rates 各项」两条不变式守着）。
     *   ⚠️ 只有**同参同值**的调用才缓存（globalMul/gatherMul）；toolMul 按职业分四档、
     *   upgSum 按 key 分四档，每个都是唯一参数，缓存只是避免重复遍历，等价。 */
    var _gm = globalMul(s);
    /* ERA10（2026-10-20）：非科技/市政/信仰产横行共用的大统一方程轴缓存（与 _gm 同口径：
     * tick 内 s.techs/s.res 不变——科技研究发生在 tick 外的游戏主循环，res.science/civic
     * 虽在 tick 内增长，但 unifiedMul 只读 log10 档位，一拍内不会跨档 ⇒ 缓存安全）。
     * ⚠️ 科技行（4b/4c'）与市政行（商人副产）必须继续用 _gm——用户表把这两样排除在外。 */
    var _gmx = globalMulX(s);
    var _gather = gatherMul(s);
    var _tCW = toolMul(s, 'coralwright');
    var _tQ = toolMul(s, 'quarrier');
    var _tM = toolMul(s, 'miner');
    var _tMer = toolMul(s, 'merchant');
    var _uSilt = upgSum(s, 'mineSilt');
    var _uWarm = upgSum(s, 'mineWarm');
    /* ⚠️ 2026-10-05 新增 6 条 perk 乘区的每 tick 缓存（与 _gm/_gather 同口径：
     *   tick 内 s.perk 不会被改 —— 买 perk 走 prestige.buyPerk，只写 meta.perks 与本局
     *   s.perk，而那发生在 tick 之外的游戏主循环里，故一个 tick 内恒定，可安全缓存）。
     * ⚠️ 别把这些改成惰性求值：`mineTaxMul(s)` 会被矿工那两行各调一次，
     *    不缓存等于每 tick 多跑 3 遍 —— 虽然纯函数不产生副作用，但与本段既有纪律不一致。 */
    var _cp = coralPactMul(s);
    var _mt = mineTaxMul(s);
    var _ac = algaeCropMul(s);
    var _fb = furnaceBoostMul(s);
    var _lp = luxuryPactMul(s);
    var _uInst = upgSum(s, 'instituteSci');
    var _uLux = upgSum(s, 'luxuryMul');
    /* ERA4（2026-09-30）：三条新乘区在 tick 这一侧也先算一次 —— 与 rates 侧读同一批函数，
     * 不允许在 tick 里另写一份算式（「面板 === 结算」那条铁律）。 */
    var _coralFarm = coralFarmMul(s);
    var _bank = bankMul(s);
    var _obs = obsSciMul(s);
    var _uPress = upgSum(s, 'pressSci');              // 雕版印刷机：学者 +30%
    var _cutter = SB.wonder ? SB.wonder.cutterSciMul(s) : 1;  // 天壳切削器：科技 +%（观测站等级）
    var _cv = SB.civic && SB.civic.flow ? SB.civic.flow(s) : null;
    /* ERA5（2026-10-02）：科技乘区在 tick 开头算一次（与 globalMul/gatherMul 同口径的
     *   每 tick 缓存），供下面的暖石/钛产出行读 warmMul / titaniumMul。rates 侧读 Tr（同函数）。 */
    var _T = SB.tech ? SB.tech.mul(s) : null;
    /* ⚠️ 2026-10-16 用户拍板：运行中的砂矿坑放大所有矿工/采石工产出（含暖石/钛/未来伴生矿物）。
     *   与 rates() 的 mineBonus 同源同值；stone/silt/暖石/钛四条产出行都必须乘它。 */
    var _siltPit = 1 + activeSiltpit(s) * SB.BLD.siltBonus;
    /* 自动化钻探：每座开启矿井只翻倍自身份额，总加成按开启 / 总矿井数折算。 */
    var _adMul = autoDrillOutputMul(s);

    /* 1) 材料线两条入口。采集者产的是藻食（食物线，见 foodRate），不产材料。
     * 珊瑚 = 猫国 wood，原作 **只有 woodcutter 职业能产、没有产木材的建筑**，
     * 2026-09-25 用户拍板把「礁口采石场」建筑改回「珊瑚匠」职业，此处同构落地。
     * 【2026-09-26 金属归位】矿砂（silt id，显示名「金属」）同样改回**职业产出**：
     * 猫国 minerals 只由 miner 职业产（0.05/tick），mine 建筑不产矿、只给
     * mineralsRatio +0.2/级 —— 本行的 siltpit 自动产出是当年救断线的权宜，
     * 矿工职业上线后它就成了「建了砂坑凭空冒金属」，已删。
     * （旧注释「minerals 的对应物是 geologist」是错的：geologist 产煤。） */
    /* 工具按**职业**落点：斧只乘珊瑚匠，镐只乘采石工 + 矿工 ——
     * 买斧头石头不能涨、买镐珊瑚不能涨（2026-09-27 用户纠正）。
     * ⚠️ tick 与 rates 两处必须同式，否则「面板显示的值和实际进账不同」。 */
    if (j.coralwright > 0) {
      addRes(s, 'coral', j.coralwright * SB.UNIT.coral
        * _gather * _tCW * _coralFarm * _cp * cold * _gmx
        * (SB.civic && SB.civic.cardResOutMul ? SB.civic.cardResOutMul(s, 'coral') : 1)
        * SOCIAL.companyMul(s, 'coral') * dt);
    }
    /* ⚠️ 2026-09-30 ERA4 · 钛：装了深层矿井(upg_deepmine) 后矿工伴生钛。
     *    门读的是 `s.upgrades`（买断升级），不是建筑等级 —— 与 rates.titanium 同一门同一式。 */
    if (j.miner > 0 && s.upgrades && s.upgrades.upg_deepmine) {
      addRes(s, 'titanium', j.miner * SB.UNIT.titanium * _siltPit * _gather * _tM * cold * _gmx * (1 + (_T ? _T.titaniumMul : 0)) * (SB.wonder ? SB.wonder.mineMul(s) : 1) * _adMul * dt);
    }
    /* ERA7（2026-10-17 · spec §2）：铀 —— 矿工伴生（0.002/秒/人，暖石 0.05 的 1/25，稀有度对齐）。
     *   门=科技《自动化钻探》（s.techs.autodrill，spec 拍的是科技门，与钛的升级门不同源）。
     *   乘区照钛那行同族：砂矿坑（矿脉设施放大一切伴生产出）+ 采集 + 矿镐 + 季节 + 全产；
     *   ⚠️ 与 rates 的 uranium 行逐字同构，漏一路就是面板撒谎。 */
    if (j.miner > 0 && s.techs && s.techs.autodrill) {
      addRes(s, 'uranium', j.miner * SB.UNIT.uranium * _siltPit * _gather * _tM * cold * _gmx * (SB.wonder ? SB.wonder.mineMul(s) : 1) * _adMul * dt);
    }
    /* ERA7（2026-10-17 · 2026-10-21 调整）：核热厂每级耗铀 0.35/秒（fissionUranium）。
     *   ⚠️ 直接消耗（不进 hydroAlloc 流）；铀是带上限普通资源，扣到 0 止。
     *   ⚠️ addRes 对负数早退（v <= 0 直接忽略），故此处用直接减法并 Math.max(0,…) 钳底。 */
    if (s.lvl.fissionplant > 0) {
      /* ERA9（2026-10-19 · 核聚变 nuclear_fusion）：铀耗 ×2（读 s.techs.nuclear_fusion 直读，无通用 mul 键）。 */
      var _nfu = (s.techs && s.techs.nuclear_fusion) ? 2 : 1;
      s.res.uranium = Math.max(0, (s.res.uranium || 0) - s.lvl.fissionplant * (SB.BLD.fissionUranium || 0) * dt * _nfu);
    }
    /* 采石工产石头、矿工产金属（silt 这个 id）并**伴生暖石**。
     * 矿工是两条 addRes 而不是一条：暖石若淹死在金属那一行里，将来调 SB.UNIT.warmstone
     * 容易顺手以为它跟金属同量级，实际它是副产品（SB.UNIT.warmstone 0.05 vs SB.UNIT.silt 0.09）。
     * ⚠️ 两条都乘了 gatherMul —— 礁石平台/深潜是「采集」倍率，矿工手持的也是采集工具，
     *    与珊瑚匠同理；别把它当成加工倍率塞进 T.craft 那条线。
     * ⚠️ 金属那条乘 _siltPit（1 + 砂矿坑级数 × SB.BLD.siltBonus）——对标猫国 mine 的
     *    mineralsRatio；**2026-10-16 起暖石也乘同一乘子**（矿脉设施放大一切矿工伴生产出，含暖石/钛），与 rates() 的 mineBonus 同源。
     * ⚠️ 青铜镐绑的是 **quarrier + miner 两个职业**，而矿工产两行（金属 + 暖石），
     *    所以金属与暖石这两处都得算上 miner 那套工具 —— 只乘金属会让暖石漏掉。 */
    if (j.quarrier > 0) {
      /* ⚠️ 2026-10-05 用户拍板：采石工也吃**砂矿坑**的 +20%/级（复用 siltBonus）。
       *    改前采石工是四家采集职业里**唯一没有建筑级乘区**的（矿工有砂矿坑、
       *    珊瑚匠/采集者都没有），而它的绝对产出 SB.UNIT.stone 0.30 却是除珊瑚匠外最高 ——
       *    「基数大但没有放大器」这条不对称让采石工在同一人口预算下永远弱于矿工
       *    （矿工 0.09 金属 + 0.05 暖石，却有 ×(1+0.2×级数) 可以一路涨）。
       *    【为什么复用 siltBonus 而不是新开 stoneBonus】两个乘区会变成两个旋钮，
       *    而「采石场」这个建筑已经被用户 2026-09-25 删掉（见 config.js:1551），
       *    采石线目前**根本没有专属建筑** ⇒ 新字段没有任何建筑能读它，必然变成死键。
     *    复用之后语义是「砂矿坑 = 矿脉设施，金属/石头/暖石/钛同源」——2026-10-16 起
     *    所有矿工伴生产出都乘砂矿坑等级（见 _siltPit，与 rates() 的 mineBonus 同源）。 */
      addRes(s, 'stone', j.quarrier * SB.UNIT.stone * _siltPit
        * _gather * _tQ * cold * _gmx * _mt * dt);
    }
    if (j.miner > 0) {
      var mine = _tM;
      /* ERA3 矿场倍率（2026-09-29；暖石值于 2026-10-17 调整）：鱼骨矿井(upg_fishbonemine) 金属 +50%/暖石 +400%，
       *   阿尔巴达热液大学(wonder_albada) 矿场产出 +人口数%。三条独立乘区，与砂矿坑 per-level 相加。 */
      var fishSilt = 1 + _uSilt;
      var fishWarm = 1 + _uWarm;
      var popMul = (s.wonders && s.wonders.wonder_albada) ? (1 + (s.pop || 0) * 0.01) : 1;
      addRes(s, 'silt', j.miner * SB.UNIT.silt * _siltPit * fishSilt * popMul
        * _gather * mine * cold * _gmx * _mt * (SB.wonder ? SB.wonder.mineMul(s) : 1) * dt);
      addRes(s, 'warmstone', j.miner * SB.UNIT.warmstone * _siltPit * fishWarm * popMul
        * _gather * mine * cold * _gmx * (1 + (_T ? _T.warmMul : 0)) * _mt
        * (SB.challenges ? SB.challenges.warmstoneMul(s) : 1) * (SB.wonder ? SB.wonder.mineMul(s) : 1) * dt);
    }

    // 2) 加工（2026-09-28 起改为**建筑自动**：熔炉建成就转，不再要匠人）
    /* ⚠️ 两样原料都按**同一份数**扣：fc 是「转了几份」，每份吃 1 金属 + 1 暖石、吐 1 精铁。
     *    ⚠️ 精铁产出是 `fc` 本身而不是 `fc × SB.UNIT.iron` —— 这个 1:1 是**沿袭**原有写法
     *       （改驱动方式之前也是这么算的），本轮只动「谁驱动 / 加哪种原料」，
     *       不动产出的量纲（量的标定留到那一步，见 ironFlow 上方那条 ⚠️④）。 */
    var fc = ironFlow(s, cold, dt);
    if (fc > 0) {
      /* ⚠️ 扣的两样原料用**未乘**的 fc（原料是按份扣的，灯塔不该让玩家少扣一份）；
       *    吐出来的精铁则乘 gm —— 与 rates.iron 那一行保持同一个 expr，别各写一套。 */
      /* ⚠️ 原料按 **bldEff 折扣**扣：同产出只耗 e× 原料（效率，不是产出）。未乘 gm —— 灯塔不该让玩家少扣一份原料。 */
      var _e = (_T ? _T.bldEff : 1);
      s.res.silt -= fc * _e;
      /* ⚠️ 暖石实扣乘 warmEff（refine/specfuel 降耗），与 ironFlow 门控同乘子 ⇒ 面板===结算。 */
      s.res.warmstone -= fc * _e * warmEff(s);
      addRes(s, 'iron', fc * _gmx * (1 + upgSum(s, 'ironBonus')) * _fb * SB.economy.smeltingOutMul(s)
        * (1 + (SB.wonder && SB.wonder.nationalLogisticsMul ? SB.wonder.nationalLogisticsMul(s) : 0)));
    }

    // 2b) ERA3 热液能 → 钢（热液汽轮机产热液能、热液工坊吃能产钢；比例降产）
    steelFlow(s, dt);

    // 2c) ERA8 θ生物金属（生物材料研究所：耗 藻食/精铁/钛/铀 ⇒ 产 θ；开工率=最紧原料）。
    //     ⚠️ 在 steelFlow 之后调：hydroAlloc 的 labDraw（研究所耗流）已在同一 tick 分配好。
    SB.economy.thetaFlow(s, dt);

    // 2d) ERA8 瑞亚星矿井（星海区在地开采）：每级 石梁/硬化珊瑚/铀 三行，吃 globalMul。
    //     石梁/硬化珊瑚是无上限 craft 资源（capOf 恒 Infinity），addRes 直进不钳。
    //     ⚠️ 与 rates 的 stoneBeam/hardCoral/uranium 三行逐字同构（面板===结算）。
    //     ERA8→ERA9 市政（2026-10-18 / 2026-10-19）：星际物流网卡 planetOutMul ×1.3 罩异星建筑三行（装卡才 >1），
    //       另加 ERA9 行星际快速物流 interlog 的 alienOutMul +20%（与网卡乘区加算，与 rates._planetMulR 同口径）。
    var _planetMul = (SB.civic ? SB.civic.cardPlanetOutMul(s) : 1)
      * (1 + (_T ? _T.alienOutMul : 0));
    if (s.lvl.rheamine > 0) {
      var _rl = s.lvl.rheamine;
      addRes(s, 'stoneBeam', _rl * (SB.BLD.rheamineBeam || 0) * _gmx * _planetMul * dt);
      addRes(s, 'hardCoral', _rl * (SB.BLD.rheamineCoral || 0) * _gmx * _planetMul * dt);
      addRes(s, 'uranium', _rl * (SB.BLD.rheamineUranium || 0) * _gmx * _planetMul * dt);
    }
    // 2e) ERA9 马尔斯工造中心（星海区在地制造）：每级 钛金板件/钛，吃 globalMul + 星际物流网（与 rheamine 同口径）。
    //     计入 lvlSum 异星建筑总等级（techs 已含 mars_workshop）；吃 alienOutMul（行星际快速物流 +20%，rates 侧加算）。
    if (s.lvl.mars_workshop > 0) {
      var _ml = s.lvl.mars_workshop;
      addRes(s, 'tiplate', _ml * (SB.BLD.marsTiplate || 0) * _gmx * _planetMul * dt);
      addRes(s, 'titanium', _ml * (SB.BLD.marsTitanium || 0) * _gmx * _planetMul * dt);
    }

    // 3) 地热（排在祭坛消耗之前，先产后烧）。这一行是唯一原本就乘了 dt 的，
    //    修单位时保持不动——它现在只是「铁律」的一个 conform 例子。
    /* ERA8（2026-10-18 · spec §4）：燃料行并入两个新来源——
     *   泰坦星气云采集站每级 +5/秒（BLD.titancloudFuel）、萨图恩 effect.fuelBonus 30/秒
     *   （wonder.wonderFuelBonus 出口）。都是绝对量、不依赖匠人职业 ⇒ 门改成 _fuelOut > 0
     *   （原 `j.craft > 0` 门会让「没雇匠人但建了采集站」的燃料凭空消失）。
     *   ⚠️ 与 rates().fuel 逐字同构，漏一路就是面板撒谎。 */
    var _fuelOut = fuelRate(s, cold)
      + (s.lvl.titancloud || 0) * (SB.BLD.titancloudFuel || 0) * _planetMul
      + (SB.wonder ? SB.wonder.wonderFuelBonus(s) : 0);
    if (_fuelOut > 0) addRes(s, 'fuel', _fuelOut * dt);

    // 2f) 三座发射场的进度各自按周期前进；等级只决定周期完成时发射多少帆/节点。
    //     所有发射场每运行 1 秒，每级耗铀 0.5、strongProp 0.3、thinafilm 0.3、hydro 4（帆模式）。
    //     缺料/断流时计时暂停、不清零；hydro 耗流由 hydroAlloc 统一分配。
    /* ── ERA10（2026-10-20 · 用户 ERA10 表「绝热材料」解锁1）三处改口径 ──
     * ① **模式切换**：完成《绝热材料》后 s.launchMode 可在 'sail'（太阳帆，默认）/ 'node'
     *    （戴森球节点）间切（UI 在发射场建筑行出切换钮，科技门控两侧同源）。
     *    节点模式每级每秒耗铀 5、强工质火箭引擎 3、θ金属自适应薄膜 3、钛合金板 30、热液能 4；库存材料受星屑减耗。
     * ② **每座场独立计时**：该场启用至少一级时余数 += dt，不乘启用等级；周期完成时按本场启用等级发射。
     *    停用整座场时保留余数并暂停；三座场不共用进度，建筑等级不改变百分比速度。
     * ③ **节律可被科技压**：_cyc = max(1, CFG.LAUNCH_CYCLE + T.launchCycle)，
     *    《空间矢量控制》−2s ⇒ 10s→8s；帆/节点同吃。钳下限 1 防 0/负节律。 */
    var _el = launchRunLvl(s);
    if (_el > 0) {
      var _elHydroNeed = _el * launchHydroPer(s);
      /* 满供判据：hydroAlloc 给到足额 europaRate（最低优先级，剩流够才满）。与 hydroAlloc 同源 ⇒ 面板===结算。 */
      var _elRunning = (s._hydroFlow && s._hydroFlow.europaRate >= _elHydroNeed - 1e-6);
      /* 节点模式科技门：没完成《绝热材料》恒按帆模式走（防改档把 launchMode 写坏后凭空产节点）。 */
      var _nodeMode = launchNodeMode(s);
      var _cyc = launchCycleOf(s);
      var _elCosts = launchMaterialPer(s);
      var _uNeed = _el * _elCosts.uranium * dt;
      var _spNeed = _el * _elCosts.strongProp * dt, _tfNeed = _el * _elCosts.thinafilm * dt;
      var _tpNeed = _el * _elCosts.tiplate * dt;
      if (_elRunning && (s.res.uranium || 0) >= _uNeed
        && (s.res.strongProp || 0) >= _spNeed && (s.res.thinafilm || 0) >= _tfNeed
        && (!_tpNeed || (s.res.tiplate || 0) >= _tpNeed)) {
        s.res.uranium -= _uNeed;
        s.res.strongProp -= _spNeed;
        s.res.thinafilm -= _tfNeed;
        if (_tpNeed) s.res.tiplate -= _tpNeed;
        var _launchIds = launchBids();
        for (var _li = 0; _li < _launchIds.length; _li++) {
          var _lid = _launchIds[_li], _padLvl = launchActiveLvl(s, _lid);
          if (!_padLvl) continue;
          var _padProc = launchProcOf(s, _lid, _nodeMode) + dt;
          var _padCycles = Math.floor(_padProc / _cyc);
          if (_padCycles > 0) {
            _padProc -= _padCycles * _cyc;
            if (_nodeMode) s.dysonNodes = (s.dysonNodes || 0) + _padCycles * _padLvl;
            else s.sunSails = (s.sunSails || 0) + _padCycles * _padLvl;
          }
          setLaunchProc(s, _lid, _nodeMode, _padProc);
        }
        /* ERA10 通关判定：dysonPct（双达标取小）达 1 ⇒ 置 dysonDone（只一次）+ 播通关弹窗。
         * 弹窗走 SB.ui.render.showDysonComplete（镜像星空槽满槽 showStarComplete 先例，
         * shell.js:175 同款调用路径）；dysonPopupSeen 防重播——玩家选「继续游玩」后不再弹。 */
        if (!s.dysonDone && SB.economy && SB.economy.dysonPct && SB.economy.dysonPct(s) >= 1) {
          s.dysonDone = true;
          if (!s.dysonPopupSeen) {
            s.dysonPopupSeen = true;
            /* ERA10 市政《飞升虚境》（2026-10-20 用户表）：已掌握该市政 ⇒ 走**乱码结局**弹窗，
             * 否则走普通竣工弹窗。两个弹窗互斥（同一次竣工只该弹一个）。
             * ⚠️ 判据读 s.civics（已完成市政），不是 s.cards —— 飞升是永久掌握的。
             * ⚠️ e2e / headless 无 DOM 时 SB.ui.render 不存在，必须走存在判（原代码就是
             *    `SB.ui && SB.ui.render &&` 三重短路，别在这一行丢掉保护）。 */
            var _R = (SB.ui && SB.ui.render) ? SB.ui.render : null;
            if (_R && s.civics && s.civics.ascend_void && _R.showAscendVoid) _R.showAscendVoid(s);
            else if (_R && _R.showDysonComplete) _R.showDysonComplete(s);
          }
        }
      }
    }

    // 4) 科技
    /* 复用 tick 开头算好的 _T（与 globalMul/gatherMul 同口径的每 tick 缓存），避免重复遍历全表。 */
    var Tt = _T;
    /* ⚠️ 潮纹馆（2026-09-27 用户拍板）：不再是 `+0.05/级/秒` 的绝对产能，改成
     *    「每级 ×(1+lvl×sciRatio)」乘区，**只乘在学者产出上**。
     *    ⚠️ 括号位置是口径：乘区必须裹住 `j.scholar * SB.UNIT.sci` 这一项、且落在 library 项
     *    原来的位置上——写成 `(j.scholar*SB.UNIT.sci + ...) * (1+lvl*sciRatio)` 会把数值一起放大。
     *    ⚠️ scholar 为 0 时这项恒 0 ⇒ 潮纹馆完全无效，这是口径不是 bug（用户原话「加在学者的产出上」）。
     *    ⚠️ 下方 rates().science 必须与这里逐字同构（单位铁律：dt=1 时两者要相等）。 */
    /* ⚠️ 2026-09-28 研究所（institute）接在这里：`SB.BLD.instituteSci` 每级把学者产出
     *    再 ×(1+0.50)，与 library 的 `sciRatio` 同位置**相加**进同一个括号。
     *    ⚠️ 括号位置与 library 那条是同一个口径：乘区必须裹住 `j.scholar * SB.UNIT.sci`
     *        这一项，写成 `(j.scholar*SB.UNIT.sci + ...) * (1+...)` 会把数值一起放大。
     *    ⚠️ 这一行与下面 rates().science **必须逐字同构**（dt=1 时两者要相等）。
     *    ⚠️ 两处都要读 institute：只改这里 ⇒ 面板写 +50%、实际进账没变；
     *        只改 rates ⇒ 面板与结算打架。e2e「研究所的科技加成」两条各钉一路。
     * ⚠️ 2026-09-28 大图书馆与政策卡《历史记录》接在这里：
     *    · 图书馆那一项换成 `libraryLevel(s)`（真实等级 **+ 大图书馆虚级**）⇒
     *      「只加效果、不提高建筑所需材料」落在这一处：虚级只在这里被当成等级用。
     *    · 再乘 `libraryMul(s)`（政策卡《历史记录》的「图书馆效果翻倍」）。
     *      ⚠️【括号只裹图书馆那一份】`+ institute * instituteSci` 那一项在乘区**之外**
     *        ——翻倍的是「图书馆的效果」，不是研究所的。用户 2026-09-28 明确选了这一档。 */
    /* ⚠️ 2026-10-07 补漏（用户报「轮回遗产写着 +1.03/s 科技、实际不进账」）：
     *   tick 的科技三行（学者 / 市政卡 cv.science / 商人副产）都漏了 legacy 乘区
     *   （relicScienceMul 纪念奇观 +1%/座、shopScienceBonus 潮纹屏障 +10%/级），
     *   旧日潮纹碑石的固定速率（oldTideSteleScienceRate）更是**整条没有**——
     *   只在 rates() 有 ⇒ 面板撒谎家族。补齐后与 rates().science 逐字同构：
     *   乘区 ×1、平加项 ×dt（rates 是每秒口径，tick 是每 tick 口径）。 */
    var _lgSci = SB.prestige ? SB.prestige.legacy() : null;
    var _lgSciMul = _lgSci ? _lgSci.relicScienceMul * (1 + _lgSci.shopScienceBonus) : 1;
    var _challengeSciCulture = SB.challenges ? SB.challenges.scienceCultureMul(s) : 1;
    /* ERA7（2026-10-17 · spec §5）：轨道卫星每级学者产出 +25%（乘区挂学者线，与 _obs/_cutter 并列）。
     *   ⚠️ 与 rates().science 的对应位置逐字同构，漏一路就是面板撒谎。 */
    var _satScholar = 1 + (s.lvl.satellite || 0) * (SB.BLD.satelliteScholar || 0);
    /* ERA8（2026-10-18 · spec §4 旅行者1号巡航档）：星空进度 ≥25% 后学者产出 ×1.10
     *   （voyagerScholarMul，未满档恒 1）。与 _satScholar 独立相乘；rates 同位置逐字同构。
     * ERA8 市政奇观：哈'利法宇宙望远镜满档学者 ×1.10（khalifaScholarMul，与旅行者独立叠加）。 */
    var _voySch = (SB.wonder ? SB.wonder.voyagerScholarMul(s) : 1)
      * (SB.wonder && SB.wonder.khalifaScholarMul ? SB.wonder.khalifaScholarMul(s) : 1);
    s.res.science += (j.scholar * SB.UNIT.sci
      * (1 + libraryLevel(s) * SB.BLD.sciRatio * (SB.civic ? SB.civic.libraryMul(s) : 1)
        + (s.lvl.institute || 0) * (SB.BLD.instituteSci + _uInst) * (SB.civic ? SB.civic.universityMul(s) : 1)
        + _uPress
        /* ERA6（2026-10 实装）：科研所每级 +10% 科技产出（researchLabSci，与 library/institute 同括号相加）。 */
        + (s.lvl.researchlab || 0) * SB.BLD.researchLabSci
        /* ERA6：温水藻场升级（upg_warmalgalfarm）解锁后，每级（× 藻场等级）额外 +0.5 科技/s。
         *   ⚠️ 本作无独立「温水藻场」建筑，按「藻场等级」兑现（待标定口径，用户可调）。 */
        + (SB.economy ? SB.economy.upgSum(s, 'algalfarmSci') : 0) * (s.lvl.kelp || 0))
      * _obs * _cutter * _satScholar * _voySch * (SB.wonder ? SB.wonder.throneSciMul(s) : 1) * (Tt ? Tt.sci : 1) * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * (SB.civic ? SB.civic.govSciOutMul(s) : 1) * (SB.companyMul ? SB.companyMul(s, 'sci') : 1) * _gm
      * _lgSciMul * dt
      + (_lgSci ? _lgSci.oldTideSteleScienceRate : 0) * dt) * _challengeSciCulture;

    /* 4b) 市政点的两条来源（书手 + 议事厅）与市政卡/政体的平坦加成。
     * 【为什么平坦加成走 SB.civic.flow 而不是塞进 tick 里】它们来源是玩家在市政页上的
     *    选择（政体 +5/s 藻食、神秘主义卡 +0.3/s 科技），属于市政模块；经济层只负责
     *    「把它们变成资源」，不替市政模块决定给多少。取不到就当没有，绝不参与运算。 */
    /* ⚠️ 2026-10-13 性能：cultureRate 是纯读函数，下面两行用的是同一个值 ⇒ 只算一次
     *   （离线补算每 tick 白跑一遍，sim/_hoist-probe.mjs 实测 ~1µs/tick）。 */
    var _cult = cultureRate(s) * _challengeSciCulture;
    addRes(s, 'culture', _cult * dt);
    /* ⚠️ 意识形态「累计市政产出 ≥ X」必须查累计量而非存量：市政点采纳时被消费
     *    （civics.js 采纳分支 s.res.culture -= c.cost），存量会归零 ⇒ 必须单独累计追踪。 */
    s.lifetimeCulture = (s.lifetimeCulture || 0) + _cult * dt;
    var cv = _cv;
    if (cv) {
      /* ⚠️ 市政卡的平坦加成也是「产出」，同样吃灯塔的 +1% —— 与 rates 那两行同式
       *    （那里是 `(cv ? (cv.kelp || 0) : 0)` 各项各自乘）。 */
      if (cv.kelp) addRes(s, 'kelp', cv.kelp * _gmx * dt);
      if (cv.science) s.res.science += cv.science * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * (SB.civic ? SB.civic.govSciOutMul(s) : 1) * (SB.companyMul ? SB.companyMul(s, 'sci') : 1) * _gm * _lgSciMul * _challengeSciCulture * dt;
    }

    /* 4c) 商人产奢侈品（2026-09-28 用户规格 · 市政《对外贸易》解锁职业商人）。
     * ⚠️【此刻没有开销渠道，这是刻意的】用户明说「贸易系统与幸福度系统（这两个我们
     *    之后设计）」⇒ 本轮只铺资源线。等贸易规则落地，改动**只在这一行**加扣量，
     *    不必去翻别处。
     * ⚠️【乘 globalMul 与 cultureRate 同待遇】它是职业产出、不是加工产物，
     *    所以吃灯塔的全资源乘区（与 science / culture 那两行一致）。
     * ⚠️ 别漏 dt —— 本文件那条「写进资源池必须 × dt」的铁律就是被这行守着的。 */
    /* 4c) 幸福度恒温器 + 奢侈品产消（陆地贸易，2026-09-28 落地）。
     * ⚠️ 产出与消耗合在一处：luxury 既是 happy 的燃料，又有真实 sink（此前零消费端）。
     * 贸易供给 S = 商人产能（baseMul，不含 happy，防自激）；
     * 需求 D = 人口 × happyCost(H)（随 H 升变贵）；实际烧掉 = min(S, D)。
     * 恒温器 dH/dt = K·(S − D)：产能 > 需求 ⇒ H 升（欢欣），< ⇒ H 掉（动荡），自动收敛到均衡 H*。
     *   ⚠️ 上一版写成 supply=实际烧掉量，导致 supply−demand ≤ 0 恒成立 ⇒ H 永远只掉不升
     *      （数学上永远到不了正档）。改用「商人产能 S」作供给才正确。
     * ⚠️ 无贸易产能（商人=0）⇒ 民生轴中性（H=0 安定），不惩罚——与「神学前信仰不生效」同源：
     *    贸易系统不存在时，幸福度不应凭空扣全产。 */
    {
      /* 政体（2026-09-29）：寡头统治 +20% 奢侈品产出。与马具 toolMul **独立相乘**
       * （工具是职业乘区、政体是制度乘区），且**不含 happyMul**（防自激，见 happyMul 注）。 */
      /* ERA4（2026-09-30）：奇观「王国大交易所」的幸福度 +1 —— 与政体那条**同一类**：
       *    它是**常驻偏移量**，必须一并剥掉再算机制值，否则每帧累进 ⇒ 幸福度无限上漂。
       * （偏移量/供给/需求/收敛 全部抽到 SB.economy.happyStep 单一真源，见 economy.js，下方直接调用。） */
      /* ⚠️ 2026-10-05 用户拍板（方案 A）：删掉 `if (_S <= 0) { s.happy = _gb; }` 那条断供分支。**
       *   【它是什么 bug】同一个状态量有**两条更新规则**：else 分支是积分器
       *   （`H += K·(S−D)·dt`，连续演进），而断供分支是**一次性赋值** `s.happy = _gb`。
       *   `_gb` 是政体/奇观的**偏移量**、通常为 0 ⇒ **玩家把商人拉到 0 的瞬间，
       *   攒了几小时的幸福度一秒蒸发**。用户报「商人拉到 0 之后幸福度也直接清空了」。
       *   两条罪状：① 同一状态量两条语义不同的更新路径；② 注释自称「无民生不惩罚」，
       *   而它的实际效果恰恰是**惩罚玩家已攒的进度**（与意图相反）。
       * 【删掉之后为什么自洽】`_S = 0` 时自然落进积分器：
       *   · `Math.min(_S, _D) = 0` ⇒ **不烧任何奢侈品**（断供时库存不会被扣成负数）；
       *   · `H += K·(0 − D)·dt` ⇒ 幸福度**按恒定速率下滑**到 `HAPPY_FLOOR` 停住；
       *   · 再雇回商人 ⇒ 供给恢复 ⇒ H**重新爬升**（不是从 0 重新开始）。
       *   ⇒ 「断供 = 慢慢崩」而不是「断供 = 归零」，恒温器语义全程统一。
       * ⚠️【这让 2026-09-28 那条「贸易系统不存在时不惩罚」的设计前提失效 —— 而那个前提
       *    已经被同日的另一个改动作废：显示门从 `{job:'merchant'}` 改成 `{civic:'trade'}`
       *    （完成对外贸易就常显，商人一个都没有也显示）。那条设计的前提是
       *    「商人=0 时这条线根本不存在」，现在玩家看得见它、也看得见自己缺商人，
       *    断供就该有代价。**别把 `if (_S <= 0)` 加回来。** */
      {
        /* ⚠️ 政体幸福度是**偏移量**不是收敛增量：先剥掉上一帧偏移得纯机制值，
         *    用机制值算需求/收敛，最后加回偏移。否则每帧把 bonus 累进 _H，
         *    幸福度会无限上漂（与「happy 是状态量」冲突）。换政体瞬间即跳新偏移，符合直觉。 */
        /* 恒温器逻辑已抽成 SB.economy.happyStep(s, dt) 单一真源（见 economy.js）：
         * 在线逐 tick 与离线半解耦积分器共用同一份，保证 happy 轨迹逐位一致（面板===结算）。
         * skipHappy：离线半解耦路径下，幸福度由 integrateFoodPop 在 0.1s 微步内自行推进
         * （与食物同栅格重采样），避免在 tick 里整块推进一次导致 happy 整段偏旧；此时此处让位。 */
        if (!(opts && opts.skipHappy)) SB.economy.happyStep(s, dt);
      }
      /* 4c') 商人副产（2026-09-30 · 市政《中世纪集市》解锁2）：每名商人同时产出
       *   科学 +0.05/秒、市政点（culture）+0.05/秒。市政**完成即生效**（这是解锁2，
       *   不是政策卡——没有「装卡」这道闸）。走 globalMul，与学者/书手同待遇。
       *   ⚠️ 放在 4c 块里（商人=0 时这段也是 0，不多算）；直接 +=，与本块 cv 段同款。 */
      if (s.civics && s.civics.market && j.merchant) {
        /* ERA5（2026-09-30 · 中世纪集市解锁2）：每名商人 +0.05 科技/s、+0.05 市政点/s，
         *   走 globalMul 与学者/书手同待遇（与 4c' 主注释一致）。
         *   ⚠️ 学校加成已于 2026-10-21 从「每商人」改为「每名鲛人」（见下方 4c'' 独立块），此处移除旧耦合。 */
        s.res.science += j.merchant * (SB.BLD.marketJobSci || 0) * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * (SB.civic ? SB.civic.govSciOutMul(s) : 1) * (SB.companyMul ? SB.companyMul(s, 'sci') : 1) * _gm * _lgSciMul * _challengeSciCulture * dt;
        s.res.culture += j.merchant * (SB.BLD.marketJobCulture || 0) * _gm * _challengeSciCulture * dt;
      }
      /* 4c'') 学校（ERA5 · 2026-10-21 改）：每名鲛人 +schoolMermanSci 科技/s（每级），
       *   与学者/商人同乘区（cardSciOutMul·govSciOutMul·companyMul·globalMul·legacy·challenge）。
       *   ⚠️ 不再门控「中世纪集市 / 商人>0」——学校对全人口 s.pop 生效，与职业无关。
       *   ⚠️ 与 rates().science 内的学校项逐字同构（漏一路 = 面板撒谎）。 */
      if ((s.lvl.school || 0) > 0 && (s.pop || 0) > 0) {
        s.res.science += (s.pop || 0) * (s.lvl.school || 0) * (SB.BLD.schoolMermanSci || 0)
          * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * (SB.civic ? SB.civic.govSciOutMul(s) : 1)
          * (SB.companyMul ? SB.companyMul(s, 'sci') : 1) * _gm * _lgSciMul * _challengeSciCulture * dt;
      }
    }

    /* 4d) 信仰（2026-09-28 用户规格 · 市政《神学》解锁的资源线与建筑「神庙」）。
     * ⚠️【神学前恒为 0，这是门控不是漏接】2026-09-30 修：faithRate 内部读 resUnlocked(s,'faith')
     *    （⇔ s.civics.theology），神学前直接 return 0 ⇒ 信仰不增长、全产加成也不触发。
     *    完成《神学》后才有基础产出（人口 × FAITH_PER_POP），神庙乘区叠加上去。
     *    与面板 faith 行 gate 同一条 unlock 判定，不再出现「后台偷偷攒信仰」的口径漏洞。
     * ⚠️ 别漏 dt —— 与上面 luxury 那行同一条铁律。 */
    addRes(s, 'faith', faithRate(s) * dt);

    // 5) 口粮（产/增/省/储四件事都在这里汇合）
    /* 暖石开关：它必须在 foodRate 之前算——烧掉多少决定了这一 tick 顶住多少，
     * 反过来「这一 tick 顶住了多少」又决定了下一 tick 还烧不烧（石不够就顶不住）。
     * 【warmBurning 是本帧的瞬时标记，不是存档字段】见第 8 步末尾的清位。 */
    s.warmBurning = false;
    if (!(opts && opts.skipFoodPop)) {
    var warm = warmRelief(s, dt);
    addRes(s, 'kelp', foodRate(s, cold, warm) * dt);
    s.res.kelp -= foodUse(s) * dt;
    if (s.res.kelp < 0) {
      s.res.kelp = 0;
      s.famine += dt / 0.1; // 保持旧口径：60 个 0.1 秒步长后饿死
      if (s.famine >= 60 && s.pop > 1) {
        s.pop--; s.famine = 0; s.famineDeaths++;
        SB.folk.reconcile(s);   // 减员后超额职业位退回闲置池
        SB.folk.reconcileRobot(s);   // B7：robotbay 降级后机器人超额退回（防御性）
        if (emit) emit('藻食耗尽，有人饿死了。');
      }
    } else s.famine = 0;

    /* 6) 生育（两道门：口粮 + 住房）
     * 【2026-09-26 第二次改判：软容量 → 真硬上限，见 economy.popCap 的注】
     * 上一版是「只要有余粮就一直生，超住只减速」——实测那点减速（每超 1 人 +5%）
     * 几乎不起作用：上限 0 也能 41 分钟养到 18 人，而屏幕上却写着
     * 「族民 7（人口上限 2）」，玩家读到的只能是 bug。
     * 现在住满即停，原因由 UI 写出来（旧版拆硬墙怕的是「原因读不出来」，不是墙本身）。
     * ⚠️ 停摆时把 _grow 归零（不攒进度）：否则「盖好住房那一瞬间白送一个人」，
     *   而且玩家能卡准——先攒满进度条再点建造。归零也让 UI 的「停摆」态名副其实。 */
    if (!isFull(s) && s.res.kelp > SB.CFG.GROW_KEEP) {
      s._grow += dt;
      var growNeed = SB.economy ? SB.economy.growthDuration(s) : SB.CFG.GROW_NEED;
      if (s._grow >= growNeed) { s._grow = 0; s.pop++; if (emit) emit('生育：一名族民降生。'); }
    } else s._grow = 0;
    s.peak = Math.max(s.peak, s.pop);
    /* ERA7（2026-10 实装）：政策卡《公摊面积》取下时其 +0.5/人口建筑 的加成消失 ⇒ 人口上限可能跌破当前人口。
     * 此处把人口钳回上限（「超额人口消失」）——isFull 只停生育、不主动减员，拆卡不会自动掉人，故在此收口。
     * ⚠️ popCap 定义在 economy.js（SB.economy.popCap），本模块不自带 ⇒ 走 SB.economy 单一真源。 */
    if (s.pop > (SB.economy ? SB.economy.popCap(s) : Infinity)) s.pop = (SB.economy ? SB.economy.popCap(s) : s.pop);

    // 7) 冻伤（仅冰封期）
    if (cold < 1) {
      s.coldTicks += dt;
      var perStepRisk = SB.CFG.FREEZE_CHANCE * (1 - warmCap(s) * 2) * 0.1;
      var risk = perStepRisk > 0 ? 1 - Math.pow(1 - perStepRisk, dt / 0.1) : 0;
      /* ⚠️ 2026-09-28：这里原本**裸调 Math.random**，于是每次跑 e2e 的整局时长都在抖
       *    （实测 7.79h / 8.22h 交替出现）—— 时长不可复现就没法拿来标定。
       *    economy.js 第 54 行那条「随机源走 SB.rng 而不裸调 Math.random」的纪律
       *    一直**只有注释没有实现**，缺的就是这一句。补上后模拟可复现；
       *    生产侧没有 SB.rng 时仍走 Math.random，玩家看到的随机性一点没变。 */
      if (s.pop > 1 && risk > 0 && (SB.rng ? SB.rng() : Math.random()) < risk) {
        s.pop--; s.frostDeaths++;
        SB.folk.reconcile(s);   // 减员后超额职业位退回闲置池
        SB.folk.reconcileRobot(s);   // B7：robotbay 降级后机器人超额退回（防御性）
        if (emit) emit('冰封期冻死了一名族民。');
      }
    }

    } // 闭合 if (!(opts && opts.skipFoodPop))：food/pop 段整体交给 integrateFoodPop 接管

    // 8) 天壳推进（基础削壳 + 祭坛削壳）
    SB.shell.tickShell(s, dt, emit, opts);
    /* ⚠️ 星空槽（starExplore）的累积**不放这里**：economy.tick 在 s.broken 时于顶部直接早退
     *   （line 1335 `if (s.broken) return;`），破壳后这条路径根本不跑。
     *   星空槽是破壳后的终局资源，累积由 game.loop()（在线）/ drainCatchUp()（离线）直接调
     *   SB.shell.tickStar 推进——见 game.js。放这里只会变成永远到不了的死代码。 */

    /* ERA4（2026-10-01）：换季那一发资源不在 tick 里直接发——tick 中途状态半更新，
     * 此刻读 rates() 拿到的数值口径是脏的。只置标记，由 game 主循环在 tick 返回后、
     * 状态已自洽的时机调用 seasonGrant 发放（见 seasonGrant 注）。 */
    if (_seasonChanged && s.civics && s.civics.explore && (s.lvl.caravanserai || 0) >= 1)
      s._seasonGrantPending = true;
  }

  /* 每种资源的**净**速率（/秒），给 UI 显示总获得速率用。
   * ⚠️ 不是另写一套公式：逐项复用 tick 里的同款算式（含加工的 min(速率, 库存) 上限、
   * 祭坛烧燃料、口粮消耗），保证「面板显示的速率」与「实际结算」永不脱节。
   * 此前 UI 完全不显示速率，玩家只能看数字涨跌猜产线是否为正——尤其是
   * 热泉炉把矿砂转成精铁这类「一进一出」的中间资源，
   * 净值可能是负的（转出 > 产出），不显示根本无从发现。 */
  SB.economyTickParts = SB.economyTickParts || {};
  SB.economyTickParts.tick = tick;
})(typeof window !== 'undefined' ? window : globalThis);
