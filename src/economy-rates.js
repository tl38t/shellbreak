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
  var gatherMul = P.gatherMul, globalMul = P.globalMul, ironFlow = P.ironFlow;
  var isCold = P.isCold, libraryLevel = P.libraryLevel, luxuryPactMul = P.luxuryPactMul;
  var mineTaxMul = P.mineTaxMul, obsSciMul = P.obsSciMul, steelRate = P.steelRate;
  var toolMul = P.toolMul, upgSum = P.upgSum, warmBurningNow = P.warmBurningNow;
  var warmEff = P.warmEff;

  function rates(s) {
    var lg = SB.prestige ? SB.prestige.legacy() : null;
    var cold = isCold(s) ? coldSeasonMul(s) : 1;
    var j = s.jobs;
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
    /* ⚠️ 2026-10-16 用户拍板：砂矿坑（鱼骨/深层矿井）建筑等级对**所有矿工/采石工产出**生效，
     *   含暖石、钛以及以后新增的矿工伴生矿物（此前只乘了 stone/silt，暖石/钛被排除）。
     *   本乘子必须与 economy-tick.js 的 _siltPit 同值同源，保证面板===结算。
     *   ⚠️ 任何新增矿工伴生矿物，都必须在 rates() 与 tick() 两侧都乘它，否则又变面板撒谎。 */
    var mineBonus = 1 + (s.lvl.siltpit || 0) * SB.BLD.siltBonus;
    return {
      kelp:    foodRate(s, cold, relief) - foodUse(s) + (cv ? (cv.kelp || 0) : 0),
      /* ⚠️ 2026-09-27 删骨材：这一项原先还减 `bc`（工坊把珊瑚转骨材那一笔）。
       *    那条加工线整体作废 ⇒ 珊瑚再没有加工消耗，净额就是采集者的产出。
       *    ⚠️ 别顺手把变量 `bc` 加回来——它已经被一起删了，加回引用会直接 ReferenceError。 */
      /* 工具按职业落点：斧只放大珊瑚匠，镐只放大采石工 + 矿工（tick 同式）。
       * ⚠️ 2026-09-30 ERA4：珊瑚林是**职业专精**乘区（研究所→学者同构），
       *    乘在珊瑚匠这一行、与工具乘区**独立相乘** —— 它不是被删掉的 gatherMul 全局轴。 */
      coral:   (j.coralwright || 0) * SB.UNIT.coral
                 * gatherMul(s) * toolMul(s, 'coralwright') * coralFarmMul(s) * coralPactMul(s)
                 * cold * globalMul(s) * SOCIAL.companyMul(s, 'coral'),
      /* 与 tick 同源：金属只来自矿工，且同样吃 siltMul（砂矿坑加成）。tick 那边
       * 把 siltpit 自动产出删了之后，这里若还留着「+ lvl.siltpit × SB.UNIT.silt」，
       * 面板就会凭空多报一份金属——「面板撒谎」家族的标准成因（tick 路 === 面板路）。 */
      /* ⚠️ 减掉的那份 fc 是**扣**不是产，不乘 globalMul —— 乘了会变成「灯塔让 furnace
       *    每转一份白扣两份原料」。产出那一段与 tick 的 miner 行逐字同式（含 globalMul）。 */
      silt:    (j.miner || 0) * SB.UNIT.silt
                 * mineBonus
                 * (1 + upgSum(s, 'mineSilt')
                    /* ERA7：自动化钻探（upg_autodrill）每级 +100%，受 s.autoDrillOn 开关——与 tick 同式。 */
                    + ((s.autoDrillOn !== false && s.upgrades && s.upgrades.upg_autodrill) || 0))
                 * ((s.wonders && s.wonders.wonder_albada) ? (1 + (s.pop || 0) * 0.01) : 1)
                 * gatherMul(s) * toolMul(s, 'miner') * cold * globalMul(s) * mineTaxMul(s)
                 * (SB.wonder ? SB.wonder.mineMul(s) : 1) - fc * (Tr ? Tr.bldEff : 1),
      /* ⚠️ 2026-09-30 ERA4 · 钛（深层矿井 upg_deepmine 上线后才有产出）：
       *    与上面 silt/warmstone 同源同式（同一批 gatherMul・toolMul(miner)・cold・globalMul），
       *    只是多一道「装了深层矿井才产」的门。装的是**买断升级**（s.upgrades），不是建筑等级。 */
      titanium: (s.upgrades && s.upgrades.upg_deepmine)
                 ? (j.miner || 0) * SB.UNIT.titanium * mineBonus
                   * gatherMul(s) * toolMul(s, 'miner') * cold * globalMul(s)
                   * (SB.wonder ? SB.wonder.mineMul(s) : 1)
                   * (1 + (Tr ? Tr.titaniumMul : 0))
                 : 0,
      /* ERA7（2026-10-17 · spec §2）：铀 —— 与 tick 的 uranium 行逐字同构（同一批
       *   mineBonus・gatherMul・toolMul・cold・globalMul），门=科技 autodrill（面板路与结算路同源）。 */
      uranium: (s.techs && s.techs.autodrill)
                 ? (j.miner || 0) * SB.UNIT.uranium * mineBonus
                   * gatherMul(s) * toolMul(s, 'miner') * cold * globalMul(s)
                   * (SB.wonder ? SB.wonder.mineMul(s) : 1)
                 : 0,
      /* stone / warmstone：与 tick 同源（同一个 gatherMul・cold 乘子）。
       * ⚠️ 暖石是矿工**伴生**产物（唯一来源 = 矿工人数 × 矿工乘子），没有别的建筑单独产它；
       *    2026-10-16 起**也吃砂矿坑等级加成**（mineBonus，与 stone/silt 同式）——矿脉设施现放大一切
       *    矿工伴生产出（含暖石/钛及未来新增）。"矿工几个人"仍决定保温法能不能烧，只是基准随矿坑等级上浮。
       * ⚠️ 2026-10-05：stone 与 tick 的采石工行**逐字同式**（含砂矿坑 ×(1+级数×siltBonus)）——
       *    面板路漏掉这个乘区就是「面板撒谎」，见上面 silt 那条的同源警告。 */
      stone:   (j.quarrier || 0) * SB.UNIT.stone
                 * mineBonus
                 * gatherMul(s) * toolMul(s, 'quarrier') * cold * globalMul(s) * mineTaxMul(s),
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
                 * globalMul(s) * (1 + (Tr ? Tr.warmMul : 0)) * mineTaxMul(s)
                 * (SB.challenges ? SB.challenges.warmstoneMul(s) : 1)
                 * (SB.wonder ? SB.wonder.mineMul(s) : 1)
                 - (warmBurningNow(s) ? SB.CFG.WARM_RATE : 0) - fc * ((Tr ? Tr.bldEff : 1)) * warmEff(s)
                 - _turL * SB.UNIT.hydroWarm * warmEff(s),
      /* ⚠️ `iron` 记的是**消耗掉的原料份数**，不是产出的精铁量 —— 沿用原有口径。
       *    铁是「一进一出」的中间资源，净额可能比看起来还负（这里没有把金属那一侧的
       *    消耗减掉，与改造之前一致）。改这一行前先读铁器产出那段的量纲注。 */
      iron:    fc * globalMul(s) * (1 + upgSum(s, 'ironBonus')) * furnaceBoostMul(s)
        * (1 + (SB.wonder && SB.wonder.nationalLogisticsMul ? SB.wonder.nationalLogisticsMul(s) : 0)),
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
      science: (((j.scholar || 0) * SB.UNIT.sci
                 * (1 + libraryLevel(s) * SB.BLD.sciRatio * (SB.civic ? SB.civic.libraryMul(s) : 1)
                    + (s.lvl.institute || 0) * (SB.BLD.instituteSci + upgSum(s, 'instituteSci')) * (SB.civic ? SB.civic.universityMul(s) : 1)
                    /* 2026-09-30 ERA4：雕版印刷机给学者 +30%（pressSci），与图书馆/研究所同一括号相加。 */
                    + upgSum(s, 'pressSci')
                    /* ERA6（2026-10 实装）：科研所每级 +10% 科技产出（researchLabSci，与上面同括号相加）。 */
                    + (s.lvl.researchlab || 0) * SB.BLD.researchLabSci
                    /* ERA6：温水藻场升级解锁后，每级（× 藻场等级）额外 +0.5 科技/s（待标定口径）。 */
                    + upgSum(s, 'algalfarmSci') * (s.lvl.kelp || 0))
                 * obsSciMul(s)                                  /* 天壳观测站：+x%（冰壳反比，上限 20） */
                 * (SB.wonder ? SB.wonder.cutterSciMul(s) : 1)   /* 天壳切削器：+% = 观测站等级 */
                 /* ERA7（2026-10-17 · spec §5）：轨道卫星每级学者产出 +25%，与 tick 学者行 _satScholar 逐字同构。 */
                 * (1 + (s.lvl.satellite || 0) * (SB.BLD.satelliteScholar || 0))
                 * (SB.wonder ? SB.wonder.throneSciMul(s) : 1)
                 * (Tr ? Tr.sci : 1) + (cv ? (cv.science || 0) : 0)
                 /* 商人副产（2026-09-30 · 中世纪集市解锁2）：与 tick 4c' 同式，在 globalMul 乘区内。 */
                 /* ERA5（2026-10-02）：学校每级给商人 +0.5 科技/s（与 tick 4c' 同式相加进同一括号）。 */
                 + ((s.civics && s.civics.market) ? (j.merchant || 0) * ((SB.BLD.marketJobSci || 0) + (s.lvl.school || 0) * (SB.BLD.schoolMerchantSci || 0)) : 0)
                 ) * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * (SB.civic ? SB.civic.govSciOutMul(s) : 1) * globalMul(s)
                 * (lg ? lg.relicScienceMul * (1 + lg.shopScienceBonus) : 1)
                 + (lg ? lg.oldTideSteleScienceRate : 0)) * (SB.challenges ? SB.challenges.scienceCultureMul(s) : 1),
      fuel:    (j.craft > 0 ? fuelRate(s, cold) : 0) - burn,
      /* ERA6→ERA7：星空探索每秒产出。基础文明推力 + 星空观测站升级（upg_starscope）+ 太空建筑运行座数贡献，
       *   读 economy.starRate（与 tick 同口径；太空建筑的「开几座」开关在此生效）。 */
      starExplore: SB.economy.starRate(s),
      /* ⚠️ 与 tick 同源：同一个 cultureRate 函数（书手 + 议事厅）。
       *    别在这里另写 `j.scribe * SB.UNIT.culture`——那两份算式会各自演化。
       *    商人副产（中世纪集市解锁2）同样补进面板路，与 tick 4c' 同式。 */
      culture: (cultureRate(s) +
               ((s.civics && s.civics.market) ? (j.merchant || 0) * (SB.BLD.marketJobCulture || 0) * globalMul(s) : 0))
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
          * (SB.wonder ? SB.wonder.happyConsumeMul(s) : 1);
        return S - Math.min(S, D);
      })()
    };
  }

  SB.economyRateParts = SB.economyRateParts || {};
  SB.economyRateParts.rates = rates;
})(typeof window !== 'undefined' ? window : globalThis);
