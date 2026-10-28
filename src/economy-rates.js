/* 天壳 / SHELLBREAK — 纯只读经济速率表。
 * tick 的结算仍由 economy.js 唯一负责；这里复用同一组内部公式计算每秒净流量。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var SOCIAL = SB.economySocial;
  var P = SB.economyInternals;
  var bankMul = P.bankMul, baseMul = P.baseMul, coldSeasonMul = P.coldSeasonMul;
  var coralFarmMul = P.coralFarmMul, coralPactMul = P.coralPactMul;
  var cultureRate = P.cultureRate, faithRate = P.faithRate, foodRate = P.foodRate;
  var foodUse = P.foodUse, fuelRate = P.fuelRate, furnaceBoostMul = P.furnaceBoostMul;
  var gatherMul = P.gatherMul, globalMul = P.globalMul, globalMulX = P.globalMulX, ironFlow = P.ironFlow;
  var autoDrillOutputMul = P.autoDrillOutputMul;
  var activeSiltpit = P.activeSiltpit;
  var isCold = P.isCold, libraryLevel = P.libraryLevel, luxuryPactMul = P.luxuryPactMul;
  var minerPactMul = P.minerPactMul, quarryPactMul = P.quarryPactMul, furnaceEffMul = P.furnaceEffMul, scholarPactMul = P.scholarPactMul, obsSciMul = P.obsSciMul, steelRate = P.steelRate;
  var toolMul = P.toolMul, upgSum = P.upgSum, warmBurningNow = P.warmBurningNow;
  var warmEff = P.warmEff;
  /* ERA10 市政（2026-10-20）：发射场读数与 tick 同源（三座合计等级 / 节律 / 每级耗流）。 */
  var launchRunLvl = P.launchRunLvl, launchNodeMode = P.launchNodeMode, launchMaterialPer = P.launchMaterialPer;
  var launchCycleOf = P.launchCycleOf, launchHydroPer = P.launchHydroPer;
  /* ERA2-7 扩卡（2026-10-22）：科技产出读数（启蒙沙龙卡把 15% 科技转市政点，与 tick 同源）。 */
  var sciOut = P.sciOut;

  function rates(s) {
    var lg = SB.prestige ? SB.prestige.legacy() : null;
    var cold = isCold(s) ? coldSeasonMul(s) : 1;
    var j = SB.folk.effJobs(s);   // ERA8 B7：合并人类 + 机器人×1.2（剔除 scribe/scholar）
    /* 传 dt=1，即「一秒窗口」的流量。tick 传的是真实 dt，同一个函数两种窗口，
     * 于是「面板显示的速率」天然等于「实际每秒结算」，不会各写一套公式。 */
    var fc = ironFlow(s, cold, 1);
    /* 破冰祭坛（原燃料消耗方）已于 2026-10-07 撤除，燃料净值不再扣祭坛一份。 */
    var burn = 0;
    var Tr = SB.tech ? SB.tech.mul(s) : null;
    /* 市政卡/政体的平坦加成：与 tick 同源（同一个 SB.civic.flow）。
     * ⚠️ rates() 是纯读数，**绝不能调用有副作用的 civics 函数**（那会在玩家盯着面板时
     *    偷偷记账）；flow 只读 s.gov / s.cards（逐槽）且纯读，是安全的。
     * ⚠️ 2026-10-14 更正：这里原先写「flow 只读 s.gov / s.card」——**错了**。
     *    flow（civics.js）自 2026-09-29 多槽升维起就是**逐槽遍历 s.cards**，
     *    s.card 只是第 0 号槽镜像。照旧注释理解会以为「卡装在 1 号及以后不生效」，
     *    进而写出「为省事先读 s.card」的错误逻辑。 */
    var cv = SB.civic && SB.civic.flow ? SB.civic.flow(s) : null;
    /* ⚠️ 每加一项 `cv` 字段都要配 `|| 0`（2026-09-27 踩到）：civic.flow 只在**政体/卡片
     *    真的带那个键时**才往 out 里写，其余时候返回 `{}`（没装卡时就是空对象）。
     *    写成 `+ (cv ? cv.kelp : 0)` 看起来对，但空对象是 truthy ⇒ cv.kelp 是 undefined
     *    ⇒ 1.375 + undefined = NaN ⇒ 面板上藻食速率直接显示 NaN，整条食物线没人看得懂。
     *    这类断链不抛错、不报警，只能靠 e2e 里「rates() 全项都有穷」那一条兜住。 */
    /* ⚠️ 暖石顶回（relief）必须并进面板路（2026-09-30 补）。
     *    tick 走 foodRate(s, cold, warmRelief(s, dt))，面板原先走 foodRate(s, cold) ⇒
     *    拨开关时顶栏速率纹丝不动，而实账真的在顶 —— 又一个「面板撒谎」。
     *    用户报的原话就是症状：「开关暖石产出完全没区别」。
     *    这里取 warmBurningNow（纯查询、无副作用）算 relief，**不能调 warmRelief**
     *    （它有副作用：会烧石、会置 warmBurning ⇒ 渲染路径里调 = 玩家盯着面板就偷烧一 tick）。 */
    var relief = warmBurningNow(s) ? SB.CFG.WARM_RELIEF : 0;
    /* ⚠️ 汽轮机暖石消耗（第三路）必须并进暖石净速率：否则面板上暖石一直是涨的，
     *    实际库存却被汽轮机按「运行座数 × hydroWarm × warmEff」每秒烧掉 ——
     *    正是用户报的「明明是正的却一直在消耗」。与 steelFlow 第 1003 行同源同式（dt=1）。 */
    var _turL = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
    /* ⚠️ 一次算好热液能三个数（产钢 / 净消耗 / 总生产）：steelRate 内部会跑 hydroAlloc，
     *    在 return 里连写三次等于每秒多跑两遍流分配，而 rates() 本来就重。 */
    var _sr = steelRate(s);
    /* 研究所原料消耗与 tick 共用相同库存开工率，净速率不能只显示生产端。 */
    var _thetaIn = SB.economy.thetaInputRates(s);
    /* 核聚变会把核热厂铀耗翻倍；速率面板需与 economy-tick 的直扣公式保持一致。 */
    var _fissionUraniumMul = (s.techs && s.techs.nuclear_fusion) ? 2 : 1;
    /* ⚠️ 2026-10-16 用户拍板：砂矿坑（鱼骨/深层矿井）建筑等级对**所有矿工/采石工产出**生效，
     *   含暖石、钛以及以后新增的矿工伴生矿物（此前只乘了 stone/silt，暖石/钛被排除）。
     *   只按运行中的砂矿坑计数，必须与 economy-tick.js 的 _siltPit 同值同源，保证面板===结算。
     *   ⚠️ 任何新增矿工伴生矿物，都必须在 rates() 与 tick() 两侧都乘它，否则又变面板撒谎。 */
    var mineBonus = 1 + activeSiltpit(s) * SB.BLD.siltBonus;
    /* ERA8 市政（2026-10-18）：星际物流网卡 planetOutMul ×1.3 罩异星建筑（瑞亚/泰坦）各行，装卡才 >1。
     *   必须在 return 对象**之前**声明（对象字面量里不能写 var——上一次落点就是踩了这个）。 */
    var _planetMulR = (SB.civic ? SB.civic.cardPlanetOutMul(s) : 1)
      * (1 + (Tr ? Tr.alienOutMul : 0)) * P.starAlienOutputMul(s);   // ERA9 行星际快速物流：异星建筑产出 +20%（与星际物流网卡 ×1.3 加算）
    /* ERA9：发射场库存耗料净速率（uranium/strongProp/thinafilm/tiplate），与 tick 2f 同判据
     *   （hydro 满供 + 库存够才扣）。_sr.europaRate 即 hydroAlloc 的 europaRate（dt=1），与 tick 同源。
     * ERA10（2026-10-20 · 用户 ERA10 表「绝热材料」）：节点模式（launchMode='node' 且已完成
     *   《绝热材料》）节点耗料按铀 5 + 强工质引擎 3 + θ薄膜 3 + 钛合金板 30 /秒/级（星屑树不再减少节点材料消耗）；
     *   每座场独立走周期，完成时按该场启用等级发射；总帆/节点速率为「启用等级总和 ÷ 节律」。
     *   ⚠️ 本段必须与 tick 2f 逐字同构：模式门（科技门）、各类耗料量、满供判据（含 tiplate）、
     *      节律（CFG.LAUNCH_CYCLE + Tr.launchCycle，矢量控制 −2s）。漏一路就是面板撒谎。 */
    var _elR = launchRunLvl(s);
    var _nodeR = launchNodeMode(s);
    var _cycR = launchCycleOf(s);
    var _elHydNeedR = _elR * launchHydroPer(s);
    var _elCostsR = launchMaterialPer(s);
    var _elUUnitR = _elCostsR.uranium, _elSpUnitR = _elCostsR.strongProp;
    var _elTfUnitR = _elCostsR.thinafilm, _elTpUnitR = _elCostsR.tiplate;
    var _elRunR = (_sr.europaRate >= _elHydNeedR - 1e-6)
      && (s.res.uranium || 0) >= _elR * _elUUnitR
      && (s.res.strongProp || 0) >= _elR * _elSpUnitR && (s.res.thinafilm || 0) >= _elR * _elTfUnitR
      && (!_elTpUnitR || (s.res.tiplate || 0) >= _elR * _elTpUnitR);
    var _elURate = _elRunR ? _elR * _elUUnitR : 0;
    var _elSpRate = _elRunR ? _elR * _elSpUnitR : 0;
    var _elTfRate = _elRunR ? _elR * _elTfUnitR : 0;
    var _elTpRate = _elRunR ? _elR * _elTpUnitR : 0;
    /* 产出速率（/秒）：满供满料时 = 启用等级总和 ÷ 节律（每场独立累加周期）。 */
    var _elOutRate = _elRunR ? _elR / _cycR : 0;
    var _elSailRate = _nodeR ? 0 : _elOutRate;
    var _elNodeRate = _nodeR ? _elOutRate : 0;
    /* ── ERA9-GEEK（2026-10-21 · 用户报 bug）：「珊瑚明明在减少，速率却写 +450/s」。 ──
     * GEEK 运转时在 shell.tickShell ③段**直扣**四样库存（藻食/金属(silt)/石头/珊瑚），
     * 而 rates() 一直只写产出、一分没减 ⇒ 面板 = 毛产，不是净额。珊瑚是唯一「毛产 < 500」
     * 的那一样，于是只有它露馅（20.9k/328.4k 一路掉、面板还绿着 +450/s）；藻食/金属/石头
     * 毛产远大于消耗、库存还在满仓，肉眼看不出，其实同样每秒少报 1500/500/500。
     * ⚠️ 判据必须与 shell.js ③段**逐字同构**，否则从「少报」直接变成「停摆时照扣」：
     *   tick 是 `hydroOK && 四样库存都 >= 本 tick 消耗` 才扣（dt 窗口），这里 dt=1 同式取每秒量。
     *   hydroOK 取 _sr.geekRate > 0（steelRate 透传的 hydroAlloc.geekRate，与 tick 判 geekDraw 同源）。
     * ⚠️ 这四笔是**扣**不是产，不许乘 globalMul/冷季等任何乘区——乘了会变成
     *   「科技越高、GEEK 每份料吃得越多」。 */
    var _gkKelpRate = 0, _gkSiltRate = 0, _gkStoneRate = 0, _gkCoralRate = 0;
    if ((s.geek && s.geek.geekOn) && (SB.wonder && SB.wonder.owned(s).wonder_geek)) {
      /* 与 shell.js ③段逐字同构：两阶段改造都已完成 ⇒ 无活可干，自动停、不扣料。
       * ⚠️ 这份「是否还在改造」的判断是面板不撒谎的关键——不然改造做完后面板还一直显示 −500/s。 */
      var _geekActive = !s.geek.enceladusDone || (s.techs.terraform && !s.geek.terraDone);
      var _gkKNeed = SB.CFG.GEEK_KELP || 0, _gkMNeed = SB.CFG.GEEK_METAL || 0;
      var _gkSNeed = SB.CFG.GEEK_STONE || 0, _gkCNeed = SB.CFG.GEEK_CORAL || 0;
      if (_geekActive && _sr.geekRate > 0
          && (s.res.kelp || 0) >= _gkKNeed && (s.res.silt || 0) >= _gkMNeed
          && (s.res.stone || 0) >= _gkSNeed && (s.res.coral || 0) >= _gkCNeed) {
        _gkKelpRate = _gkKNeed; _gkSiltRate = _gkMNeed;
        _gkStoneRate = _gkSNeed; _gkCoralRate = _gkCNeed;
      }
    }
    return {
      kelp:    foodRate(s, cold, relief) - foodUse(s) + (cv ? (cv.kelp || 0) : 0) - _thetaIn.kelp - _gkKelpRate,
      /* ⚠️ 2026-09-27 删骨材：这一项原先还减 `bc`（工坊把珊瑚转骨材那一笔）。
       *    那条加工线整体作废 ⇒ 珊瑚再没有加工消耗，净额就是采集者的产出。
       *    ⚠️ 别顺手把变量 `bc` 加回来——它已经被一起删了，加回引用会直接 ReferenceError。 */
      /* 工具按职业落点：斧只放大珊瑚匠，镐只放大采石工 + 矿工（tick 同式）。
       * ⚠️ 2026-09-30 ERA4：珊瑚林是**职业专精**乘区（研究所→学者同构），
       *    乘在珊瑚匠这一行、与工具乘区**独立相乘** —— 它不是被删掉的 gatherMul 全局轴。 */
      coral:   (j.coralwright || 0) * SB.UNIT.coral
                 * gatherMul(s) * toolMul(s, 'coralwright') * coralFarmMul(s) * coralPactMul(s)
                 * cold * globalMulX(s)
                 * (SB.civic && SB.civic.cardResOutMul ? SB.civic.cardResOutMul(s, 'coral') : 1)
                 * SOCIAL.companyMul(s, 'coral') - _gkCoralRate,
      /* 与 tick 同源：金属只来自矿工，且同样吃 siltMul（砂矿坑加成）。tick 那边
       * 把 siltpit 自动产出删了之后，这里若还留着「+ lvl.siltpit × SB.UNIT.silt」，
       * 面板就会凭空多报一份金属——「面板撒谎」家族的标准成因（tick 路 === 面板路）。 */
      /* ⚠️ 减掉的那份 fc 是**扣**不是产，不乘 globalMul —— 乘了会变成「灯塔让 furnace
       *    每转一份白扣两份原料」。产出那一段与 tick 的 miner 行逐字同式（含 globalMul）。 */
      silt:    (j.miner || 0) * SB.UNIT.silt
                 * mineBonus
                 * (1 + upgSum(s, 'mineSilt'))
                 * ((s.wonders && s.wonders.wonder_albada) ? (1 + (s.pop || 0) * 0.01) : 1)
                 * gatherMul(s) * toolMul(s, 'miner') * cold * globalMulX(s) * minerPactMul(s)
                 * (SB.wonder ? SB.wonder.mineMul(s) : 1) - fc * (Tr ? Tr.bldEff : 1) - _gkSiltRate,
      /* ⚠️ 2026-09-30 ERA4 · 钛（深层矿井 upg_deepmine 上线后才有产出）：
       *    与上面 silt/warmstone 同源同式（同一批 gatherMul・toolMul(miner)・cold・globalMul），
       *    只是多一道「装了深层矿井才产」的门。装的是**买断升级**（s.upgrades），不是建筑等级。 */
      titanium: ((s.upgrades && s.upgrades.upg_deepmine)
                 ? (j.miner || 0) * SB.UNIT.titanium * mineBonus
                   * gatherMul(s) * toolMul(s, 'miner') * cold * globalMulX(s)
                   * (SB.wonder ? SB.wonder.mineMul(s) : 1)
                   * (1 + (Tr ? Tr.titaniumMul : 0))
                   * autoDrillOutputMul(s)
                 : 0)
                 /* ERA9（2026-10-19）：马尔斯工造中心每级 +2 钛/秒（与 tick 的 mars 块逐字同构，含星际物流网乘区）。 */
                 + (s.lvl.mars_workshop || 0) * (SB.BLD.marsTitanium || 0) * globalMulX(s) * _planetMulR
                 - _thetaIn.titanium,
      /* ERA9（2026-10-19）：马尔斯工造中心每级 +3 钛金板件/秒（craft 资源，无上限，与 tick 同式相加）。
         ERA10（2026-10-21）：戴森节点钛合金板耗料通过 _elTpRate 计入，数值取 launchMaterialPer。 */
      tiplate:  (s.lvl.mars_workshop || 0) * (SB.BLD.marsTiplate || 0) * globalMulX(s) * _planetMulR - _elTpRate,
      /* ERA9（2026-10-19）：发射场库存耗料与 tick 2f 同判据；断料/断流时 0（面板===结算）。
         ERA10（2026-10-21）：节点模式使用 launchMaterialPer 扣除铀/引擎/薄膜/钛板；sunSailRate/dysonNodeRate 为
         当前模式的产出速率（/秒，满供满料才非 0）——戴森面板与发射场建筑行读这两键。 */
      strongProp: -_elSpRate,
      thinafilm: -_elTfRate,
      sunSailRate: _elSailRate,
      dysonNodeRate: _elNodeRate,
      /* ERA7（2026-10-17 · spec §2）：铀 —— 与 tick 的 uranium 行逐字同构（同一批
       *   mineBonus・gatherMul・toolMul・cold・globalMul），门=科技 autodrill（面板路与结算路同源）。 */
      uranium: ((s.techs && s.techs.autodrill)
                 ? (j.miner || 0) * SB.UNIT.uranium * mineBonus
                   * gatherMul(s) * toolMul(s, 'miner') * cold * globalMulX(s)
                   * (SB.wonder ? SB.wonder.mineMul(s) : 1)
                   * autoDrillOutputMul(s)
                 : 0)
      /* ERA8：瑞亚星矿井每级 +0.25 铀/秒（与 tick 的 rheamine 铀行同式相加；含星际物流网乘区）。 */
               + (s.lvl.rheamine || 0) * (SB.BLD.rheamineUranium || 0) * globalMulX(s) * _planetMulR
               - (s.lvl.fissionplant || 0) * (SB.BLD.fissionUranium || 0) * _fissionUraniumMul - _thetaIn.uranium - _elURate,
      /* ERA8（2026-10-18 · spec §4 瑞亚星矿井）：石梁/硬化珊瑚行，与 tick 的 rheamine 块
       *   逐字同构（吃 globalMul + 星际物流网乘区）。⚠️ 这两项此前 rates 无键（只能工坊造、速率恒 0），
       *   矿井上线后必须有键，否则 renderRes 拿到的 rate 是 undefined（面板撒谎家族）。 */
      stoneBeam:  (s.lvl.rheamine || 0) * (SB.BLD.rheamineBeam || 0) * globalMulX(s) * _planetMulR,
      hardCoral:  (s.lvl.rheamine || 0) * (SB.BLD.rheamineCoral || 0) * globalMulX(s) * _planetMulR,
      /* stone / warmstone：与 tick 同源（同一个 gatherMul・cold 乘子）。
       * ⚠️ 暖石是矿工**伴生**产物（唯一来源 = 矿工人数 × 矿工乘子），没有别的建筑单独产它；
       *    2026-10-16 起**也吃砂矿坑等级加成**（mineBonus，与 stone/silt 同式）——矿脉设施现放大一切
       *    矿工伴生产出（含暖石/钛及未来新增）。"矿工几个人"仍决定保温法能不能烧，只是基准随矿坑等级上浮。
       * ⚠️ 2026-10-05：stone 与 tick 的采石工行**逐字同式**（含砂矿坑 ×(1+级数×siltBonus)）——
       *    面板路漏掉这个乘区就是「面板撒谎」，见上面 silt 那条的同源警告。 */
      stone:   (j.quarrier || 0) * SB.UNIT.stone
                 * mineBonus
                 * gatherMul(s) * toolMul(s, 'quarrier') * cold * globalMul(s) * quarryPactMul(s) - _gkStoneRate,
      /* 暖石的净速率要减掉**开关正在烧的**那一份：不减的话面板上写着暖石在涨，
       * 玩家开着他以为只是在攒，实际有一路正在往火里扔。
       * 判据直接取 warmBurningNow（与 tick 里的 warmRelief 同源），不在这里重写条件，
       * 否则同一秒的显示会和实际结算对不上。
       * ⚠️ 2026-09-28 补减「熔炉正在吃的那一份」：铁器改成金属+暖石之后，暖石有了
       *    第二个去处。不减的话，玩家会看到暖石一路在涨（伴生 > 保温消耗）而实际有
       *    一路正在被炉子吃掉——同一个「面板撒谎」的坑，只是这次是两口消耗。
       *    ⚠️ 这里复用 fc（本秒转出的份数），与 tick 里扣 warmstone 的那一行同源。 */
      warmstone: (j.miner || 0) * SB.UNIT.warmstone * mineBonus
                 * (1 + upgSum(s, 'mineWarm'))
                 * ((s.wonders && s.wonders.wonder_albada) ? (1 + (s.pop || 0) * 0.01) : 1)
                 * gatherMul(s) * toolMul(s, 'miner') * cold
                 * globalMulX(s) * (1 + (Tr ? Tr.warmMul : 0)) * minerPactMul(s)
                 * (SB.challenges ? SB.challenges.warmstoneMul(s) : 1)
                 * (SB.wonder ? SB.wonder.mineMul(s) : 1)
                 - (warmBurningNow(s) ? SB.CFG.WARM_RATE : 0) - fc * ((Tr ? Tr.bldEff : 1)) * warmEff(s)
                 - _turL * SB.UNIT.hydroWarm * warmEff(s),
      /* ⚠️ `iron` 记的是**消耗掉的原料份数**，不是产出的精铁量 —— 沿用原有口径。
       *    铁是「一进一出」的中间资源，净额可能比看起来还负（这里没有把金属那一侧的
       *    消耗减掉，与改造之前一致）。改这一行前先读铁器产出那段的量纲注。 */
      iron:    fc * globalMulX(s) * (1 + upgSum(s, 'ironBonus')) * furnaceBoostMul(s) * furnaceEffMul(s) * P.smeltingOutMul(s)
        * (1 + (SB.wonder && SB.wonder.nationalLogisticsMul ? SB.wonder.nationalLogisticsMul(s) : 0))
        - _thetaIn.iron,
      /* ERA3 热液能系统（2026-10-05 flow 模型）：steelRate 非变异版，与 tick 的 steelFlow 同式（dt=1）。
       *   steel = 工坊实际产钢速率；hydro = 本 tick **实际消耗**（工坊吃 + 钻机吃），作顶栏速率行（−M/s）。
       *   ⚠️ 顶栏热液能**主数**是 s.res.hydro（tick 写的供给快照），速率行才是这里的消耗 —— 二者分工见 render.js。 */
      steel:   _sr.steel,
      hydro:   _sr.hydro,
      /* ⚠️ hydroSupply = 热液能**总生产**（供给侧 /s，恒 ≥0）。与上一行 hydro（净消耗，取负）
       *    是两个不同口径，别合并：顶栏速率行要「这行每秒怎么变」⇒ 读 hydro；
       *    尤里卡「热液能产出 10/s」要「汽轮机造出来多少」⇒ 读这个。 */
      hydroSupply: _sr.hydroSupply,
      /* ⚠️ 市政卡的 `cv.science` 那一份也乘（与 tick 的 4b 步同式）；
       *    ⚠️ 括号位置：乘区要裹住**两个加项**，不能只裹 scholar 那一段。 */
      /* ⚠️ 与上面 tick 里那一行**逐字同构**（含 institute 那一项、以及大图书馆
       *    libraryLevel / 政策卡 libraryMul 那两处）——
       *    面板路与结算路漏掉任何一路，玩家都会看到「写着 +50%、进账没变」。 */
      science: (((j.scholar || 0) * SB.UNIT.sci * P.starOrbitalJobMul(s)
                 * (1 + libraryLevel(s) * SB.BLD.sciRatio * (SB.civic ? SB.civic.libraryMul(s) : 1)
                    + (s.lvl.institute || 0) * (SB.BLD.instituteSci + upgSum(s, 'instituteSci')) * (SB.civic ? SB.civic.universityMul(s) : 1)
                    /* 2026-09-30 ERA4：雕版印刷机给学者 +30%（pressSci），与图书馆/研究所同一括号相加。 */
                    + upgSum(s, 'pressSci')
                    /* ERA6（2026-10 实装）：科研所每级 +10% 科技产出（researchLabSci，与上面同括号相加）。 */
                    + (s.lvl.researchlab || 0) * SB.BLD.researchLabSci
                    /* ERA6：温水藻场升级解锁后，每级（× 藻场等级）额外 +0.5 科技/s（待标定口径）。 */
                    + upgSum(s, 'algalfarmSci') * (s.lvl.kelp || 0))
                 * obsSciMul(s)                                  /* 天壳观测站：建成后按削壳进度提供 0–20% 学者科技加成 */
                 * (SB.wonder ? SB.wonder.cutterSciMul(s) : 1)   /* 天壳切削器：+% = 观测站等级 */
                 /* ERA7（2026-10-17 · spec §5）：轨道卫星每级学者产出 +25%，与 tick 学者行 _satScholar 逐字同构。 */
                 * (1 + (s.lvl.satellite || 0) * (SB.BLD.satelliteScholar || 0))
                 /* ERA8：旅行者1号巡航档学者 +10%（voyagerScholarMul，与 tick 的 _voySch 同源）。 */
                 * (SB.wonder ? SB.wonder.voyagerScholarMul(s) : 1)
                 /* ERA8 市政奇观：哈'利法满档学者 +10%（khalifaScholarMul，与 tick 同源、独立叠加）。 */
                 * (SB.wonder && SB.wonder.khalifaScholarMul ? SB.wonder.khalifaScholarMul(s) : 1)
                 * (SB.wonder ? SB.wonder.throneSciMul(s) : 1)
                 * (Tr ? Tr.sci : 1) + (cv ? (cv.science || 0) : 0)
                 /* 商人副产（2026-09-30 · 中世纪集市解锁2）：与 tick 4c' 同式，在 globalMul 乘区内。 */
                 + ((s.civics && s.civics.market) ? (j.merchant || 0) * (SB.BLD.marketJobSci || 0) : 0)
                 /* 学校（2026-10-21 改）：每名鲛人 +schoolMermanSci 科技/s（每级），与 tick 4c'' 同式，不依赖商人/集市。 */
                 + ((s.lvl.school || 0) > 0 ? (s.pop || 0) * (s.lvl.school || 0) * (SB.BLD.schoolMermanSci || 0) : 0)
                 ) * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * (SB.civic ? SB.civic.govSciOutMul(s) : 1) * ((SB.companyMul) ? SB.companyMul(s, 'sci') : 1) * scholarPactMul(s) * globalMul(s)
                 * (lg ? lg.relicScienceMul * (1 + lg.shopScienceBonus) : 1)
                 + (lg ? lg.oldTideSteleScienceRate : 0)) * (SB.challenges ? SB.challenges.scienceCultureMul(s) : 1),
      /* ERA8：泰坦星气云采集站每级 +5/秒 + 萨图恩 effect.fuelBonus（与 tick 的 _fuelOut 逐字同构，含星际物流网乘区）。 */
      fuel:    (j.craft > 0 ? fuelRate(s, cold) : 0)
               + (s.lvl.titancloud || 0) * (SB.BLD.titancloudFuel || 0) * _planetMulR
               + (SB.wonder ? SB.wonder.wonderFuelBonus(s) : 0) - burn,
      /* ERA8：θ生物金属产线（thetaRate 与 thetaFlow 同式不扣料，开工率按当前库存现算）。 */
      thetaMetal: SB.economy.thetaRate(s),
      /* ERA6→ERA7：星空探索每秒产出。基础文明推力 + 星空观测站升级（upg_starscope）+ 太空建筑运行座数贡献，
       *   读 economy.starRate（与 tick 同口径；太空建筑的「开几座」开关在此生效）。 */
      starExplore: SB.economy.starRate(s),
      /* ⚠️ 与 tick 同源：同一个 cultureRate 函数（书手 + 议事厅）。
       *    别在这里另写 `j.scribe * SB.UNIT.culture`——那两份算式会各自演化。
       *    商人副产（中世纪集市解锁2）同样补进面板路，与 tick 4c' 同式。 */
      /* ⚠️ 启蒙沙龙卡（sciToCivic 0.15）：科技产出的 15% 转为市政点，计入累计市政产出（意识形态门槛）。
       *   与 tick 同源——都用 P.sciOut(s) × 挑战乘区，保证面板===结算。 */
      culture: ((cultureRate(s) +
               ((s.civics && s.civics.market) ? (j.merchant || 0) * (SB.BLD.marketJobCulture || 0) * globalMul(s) : 0))
               + ((SB.civic && SB.civic.cardSciToCivic) ? SB.civic.cardSciToCivic(s) : 0) * sciOut(s))
               * (SB.challenges ? SB.challenges.scienceCultureMul(s) : 1),
      /* ⚠️ 2026-10-05 补漏（用户报「信仰怎么不体现每秒出率」· bug 不是标定）：
       *   faithRate 一直存在于 tick（`addRes(s,'faith',faithRate(s)*dt)`），
       *   但 rates() 的返回对象**漏了 faith 这个键** ⇒ renderRes 里 `rate['faith']||0` = 0
       *   ⇒ 顶栏信仰行永远不显示 `/s`，而实账在涨 —— 又一个「面板撒谎」。
       *   判据：凡 tick 里 addRes/add 的资源，rates() 必须有同名键（单源铁律）。
       *   faithRate 内部自带 resUnlocked(s,'faith') 门控（神学前恒 0），不会提前漏出行。 */
      faith:   faithRate(s),
      /* ⚠️ luxury 净速率（陆地贸易，2026-09-28）：产能(baseMul) − 实际消耗 min(产能, 需求)。
       *   与 tick 同式——tick 里 S 用 baseMul、消耗用 min(S,D)*dt。
       *   断供时实际烧=产能（烧光），净=0（不再累积）；充裕时净=产能−需求（盈余累积）。
       *   大巴扎（S 侧）与王国潮道（D 侧）2026-09-30 接进两条路——漏一路就是「面板撒谎」。
       * ⚠️ 2026-10-06：需求 D 的入参改成 `happyMech(s)`（剥掉政体/奇观/卡的幸福度加成），
       *   与 tick 的 `_D` 同源。此前这里与 tick 一致（都用 s.happy 之外的口径）纯属巧合——
       *   tick 早用 `_Hmech` 而此处用 `s.happy`，两者在「有政体/卡加成」时**读数不同**
       *   ⇒ 顶栏显示的净速率与真实扣费对不上。加成不该让居民变贵（见 happyMech 注释）。 */
      luxury: (function () {
        var S = (j.merchant || 0) * SB.UNIT.luxury * toolMul(s, 'merchant') * baseMul(s)
          * (SB.civic ? SB.civic.govLuxuryMul(s) : 1)    // 2026-09-29 马具 +50%、寡头 +20%，与 tick 同式
          * (1 + upgSum(s, 'luxuryMul'))                 // 马镫工坊升级 +50%（与马具独立相乘 ⇒ +100%）
          * luxuryPactMul(s)                             // 2026-10-05 奢侈品契 +3%/级（与 tick 的 _lp 同一个函数）
          * bankMul(s)                                   // 2026-09-30 ERA4：银行每级商人产出 +10%
          * (SB.wonder ? SB.wonder.bazaarLuxMul(s) : 1); // 大巴扎：每名鲛人 +1% 奢侈品获取
        if (S <= 0) return 0;
        /* ⚠️ 2026-10-14 双修：① 需求换 luxDemandMul 净系数（增耗三项 − 居民减耗单括号抵消）；
         *   ② **补齐此前漏乘的政体/奇观两项**（商人共和国 0.7 / 国会 0.9）——
         *      旧式只有 (1−luxSaveAll)×(1+tenement)，与 tick 的 _D 不同式，
         *      装政体/奇观后顶栏净速率与真实扣费对不上（面板撒谎家族）。 */
        var D = (s.pop || 0) * SOCIAL.happyCost(SOCIAL.happyMech(s))
          * SOCIAL.luxDemandMul(s)
          * (SB.civic ? SB.civic.govHappyConsumeMul(s) : 1)
          * (SB.wonder ? SB.wonder.happyConsumeMul(s) : 1)
          /* ⚠️ 2026-10-28 补乘：《节能减耗》card_saving 的 happyConsumeMul ×1.5 原先只活在
           *   economy-social.happyBurn 里，本行与 economy.js 的 _D 都漏了 ⇒ 面板撒谎。
           *   三处（本行 / economy.js _D / economy-social.happyBurn）必须同乘这一个乘区。 */
          * ((SB.civic && SB.civic.cardHappyConsumeMul) ? SB.civic.cardHappyConsumeMul(s) : 1);
        return S - Math.min(S, D);
      })()
    };
  }

  SB.economyRateParts = SB.economyRateParts || {};
  SB.economyRateParts.rates = rates;
})(typeof window !== 'undefined' ? window : globalThis);
