/* 天壳 / SHELLBREAK — 天壳层
 *
 * 两档削壳，职责严格分开，这是整个一期的核心机制：
 *
 *   ① 基础削壳（自动，永远开着）
 *      速率 = BREAK_BASE × breakCoef，冰封期另乘 COLD 加成。
 *      只把壳削到 FLOOR_AT（25%）就停手——冻到最薄，然后卡住。
 *
 *   ② 天穹钻机（ERA5 破壳终章，wonder）
 *      基础削壳卡在 25% 后，由天穹钻机（建成后在自然环境卡手动启动）凿穿最后一段天壳，
 *      吃共振钻头 + 热液能。2026-10-07 起，原「破冰祭坛」这条持续机器路线已撤除，
 *      终局凿壳完全交给钻机；同日由「自动运转」改为「手动启动」。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  function techCount(s) {
    var n = 0;
    for (var k in s.techs) if (s.techs[k]) n++;
    return n;
  }

  /* 破壳系数：玩家可见的单一驱动量。
   * 每项来源都有独立的墙（人口受住房、级数受成本、科技受科技），
   * 所以系数是一条会走平的曲线，而不是一开局就到顶的直线。 */
  function breakCoef(s) {
    var C = SB.CFG.COEF;
    var c = C.POP * Math.pow(s.pop, C.POP_POW)
      + C.LVL * Math.pow(SB.economy.lvlSum(s), C.LVL_POW)
      + C.TECH * techCount(s)
      + C.PERK * (s.perk.coef || 0);
    if (SB.economy.isCold(s)) c *= C.COLD;   // 越冷越拼命
    /* 政策卡「总动员令」（2026-10-24 用户拍「接线到破壳系数」）：每点闲置鲛人 +1%，乘区乘在整段上
     *   （与 COLD 同层：先加各来源项，再乘）。读数单一落点 = civics.cardBreakCoefMul（没装卡 = 1）。 */
    if (SB.civic && SB.civic.cardBreakCoefMul) c *= SB.civic.cardBreakCoefMul(s);
    return c;
  }

  /* 破壳比例 = 1 − rOf（壳剩余比例）。autoRate 把壳削到 FLOOR_AT=0.25 就停，
   * 于是 brokenRatio 在区间 [0.75, 1] 收口；中途必经过 0.5 ⇒ 尤里卡「破壳 50%」可达。 */
  function brokenRatio(s) {
    return 1 - SB.economy.rOf(s);
  }

  function autoRate(s) { return SB.CFG.BREAK_BASE * breakCoef(s); }

  /* 一个 tick 的天壳推进。dt 为秒。
   * 返回本次实际削掉的壳量，供渲染层显示「正在以 X 点/秒 推进」。 */
  function tickShell(s, dt, emit, opts) {
    if (s.shell < 0) s.shell = 0;   // 修复破壳后钻机凿出的历史负壳（显示漂移，如 -235602）
    if (s.broken) return 0;
    var cut = 0;
    /* G.E.E.K 运行态闸门（与天穹钻机同纪律）：已建成且玩家手动启动才跑。 */
    var geekOn = !!(s.geek && s.geek.geekOn);
    var geekOwned = !!(SB.wonder && SB.wonder.owned(s).wonder_geek);

    // ① 基础削壳：卡在 FLOOR_AT，不越过
    //    判定用的是 <= 语义——壳精确停在 25% 时也必须停手，否则会来回抖动
    if (SB.economy.rOf(s) > SB.CFG.FLOOR_AT) {
      var floor = s.iceShell * SB.CFG.FLOOR_AT;
      var r = autoRate(s) * dt;
      s.shell = Math.max(floor, s.shell - r);
      cut += r;
      s._cutBase = (s._cutBase || 0) + r;   // 累计，供回归脚本拆解削壳构成
    }

    // ② 天穹钻机（ERA5 破壳终章）：建成后在「自然环境」卡手动启动（2026-10-07 用户改，
    //    原「建成即自动运转」废弃），凿穿最后一段天壳。
    //    ⚠️ 2026-10-05 flow 模型：热液能是「每 tick 的瞬态流」，钻机从**本 tick 剩流**里取
    //       SKYDRILL_HYDRO，不再读 s.res.hydro 库存池（那里现在是供给快照，不累积）。
    //       剩流由 economy.steelFlow 同一 tick 算好的 s._hydroFlow.left 给出（工坊低阶先吃满）。
    //    ⚠️ 不判 FLOOR_AT：钻机只在 ERA5 建成，届时壳已被 ① 削到 25%；让它从任意厚度都能削，
    //       等价于「从 25% 继续削到 0」，语义一致且更鲁棒（即便将来有人早建也能用）。
    //    ⚠️ 资源见底自动停摆（补足后下一 tick 自动继续）；停摆是**运行态的暂停**，
    //       不回拨 skydrillOn——补料后不用玩家再点一次。
    if (s.skydrillOn && SB.wonder && SB.wonder.owned(s).wonder_skydrill && s.shell > 0) {
      var dCost = SB.CFG.SKYDRILL_DRILL * dt;
      var hCost = SB.CFG.SKYDRILL_HYDRO * dt;
      // 热液能侧：hydroAlloc 已是「本 tick 流分配」唯一权威（含钻机吃剩流的那一份），
      //   skyDraw>0 即表示「工坊吃完后剩流够钻机取 SKYDRILL_HYDRO 且共振钻头够」⇒ 钻机这一份已被占走。
      var _HF = s._hydroFlow || (SB.economy ? SB.economy.hydroAlloc(s, dt) : { skyDraw: 0 });
      var hydroOK = _HF.skyDraw > 0;
      if ((s.res.resonantDrill || 0) >= dCost && hydroOK) {
        s.res.resonantDrill -= dCost;
        // 流不进库存：扣共振钻头即可，热液能已从本 tick 流中被钻机这一份占走（HF.left 已计入）。
        /* 潮汐之树（2026-10-23）：壳面测绘节点（shellSurvey1/2/3）替代旧 shellSurvey；
         *   直接读 s.perk.shellSurvey（每级 +5% 削壳速率，与旧 shellSurveyLevel 同口径）。 */
        var _ss = 1 + 0.05 * ((s.perk && s.perk.shellSurvey) || 0);
        var sWant = SB.CFG.SKYDRILL_RATE * _ss * dt;
        s.shell -= sWant;
        cut += sWant;
        s._cutSky = (s._cutSky || 0) + sWant;
        s.skydrillRun = (s.skydrillRun || 0) + dt;
        s.skydrillStarved = false;
      } else if (!s.skydrillStarved) {
        s.skydrillStarved = true;
        if (emit) emit('天穹钻机缺少共振钻头或热液能，停转——补足后自动继续。');
      }
    }

    // ③ 星球重构机 G.E.E.K（ERA9 · 生态重塑解锁奇观）：建成后在「自然环境」卡手动启动，
    //    依次改造恩克拉多斯星（1800s）→ 研究 terraform 后改造泰拉星（3600s）。
    //    ⚠️ 抄天穹钻机 flow 模型：热液能是「每 tick 瞬态流」，从本 tick 剩流里取 GEEK_HYDRO，不再读 s.res.hydro 库存池。
    //       剩流由 economy.hydroAlloc 同一 tick 算好的 s._hydroFlow.left 给出（工坊低阶先吃满）。
    //    ⚠️ 库存耗 kelp(藻食)/silt(金属)/stone(石头)/coral(珊瑚) 在扣费**之前**判足（扣费先于置位，失败一分不扣），与 skydrill 同纪律；
    //       任一不足或断流 = 暂停、进度保留（enceladusRun/terraRun 累加，绝不回拨 geekOn——补料后下一 tick 自动续转）。
    //    ⚠️ 唯一效果 = 覆盖建筑造价等级偏移（costOffset，落点 economy.costOf）；无幸福度/市政/产出额外效果（用户拍板不加）。
    if (geekOn && geekOwned) {
      var _gkHydro = SB.CFG.GEEK_HYDRO * dt;
      var _HF2 = s._hydroFlow || (SB.economy ? SB.economy.hydroAlloc(s, dt) : { geekDraw: 0 });
      var hydroOK = _HF2.geekDraw > 0;
      var _gkKelp = SB.CFG.GEEK_KELP * dt, _gkMetal = SB.CFG.GEEK_METAL * dt, _gkStone = SB.CFG.GEEK_STONE * dt, _gkCoral = SB.CFG.GEEK_CORAL * dt;
      // 两阶段改造都已完成（或等待 terraform 研究）⇒ 没有活儿可干，自动停：不扣料、不走 starvation。
      var _geekActive = !s.geek.enceladusDone || (s.techs.terraform && !s.geek.terraDone);
      if (_geekActive && hydroOK && (s.res.kelp || 0) >= _gkKelp && (s.res.silt || 0) >= _gkMetal && (s.res.stone || 0) >= _gkStone && (s.res.coral || 0) >= _gkCoral) {
        s.res.kelp -= _gkKelp; s.res.silt -= _gkMetal; s.res.stone -= _gkStone; s.res.coral -= _gkCoral;
        if (!s.geek.enceladusDone) {
          // 阶段一：恩克拉多斯星改造。完成 ⇒ costOffset=3（覆盖建筑升级回到 L3 之前）。
          s.geek.enceladusRun = (s.geek.enceladusRun || 0) + dt;
          var _encTime = SB.economy && SB.economy.starTerraformDuration
            ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_ENCELADUS_SECONDS) : SB.CFG.GEEK_ENCELADUS_SECONDS;
          if (s.geek.enceladusRun >= _encTime) {
            s.geek.enceladusDone = true;
            s.geek.costOffset = 3;
            if (emit) emit('星球重构机 G.E.E.K 完成恩克拉多斯星改造：人口/速生珊瑚林/矿井/生息区建筑升级花费回到 L3 之前。');
          }
        } else if (s.techs.terraform && !s.geek.terraDone) {
          // 阶段二：泰拉星改造（需先研究 terraform 解锁）。完成 ⇒ costOffset 叠加 +5 = 8（回到 L5 之前）。
          s.geek.terraRun = (s.geek.terraRun || 0) + dt;
          var _terraTime = SB.economy && SB.economy.starTerraformDuration
            ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_TERRA_SECONDS) : SB.CFG.GEEK_TERRA_SECONDS;
          if (s.geek.terraRun >= _terraTime) {
            s.geek.terraDone = true;
            s.geek.costOffset = 8;   // 叠加 Rhea(3)+Terra(5)
            if (emit) emit('星球重构机 G.E.E.K 完成泰拉星改造：覆盖建筑升级花费回到 L5 之前（叠加后合计 L8）。');
          }
        }
        s.geekStarved = false;
      } else if (_geekActive && !s.geekStarved) {
        s.geekStarved = true;
        var _need = '每 s 需 ' + SB.CFG.GEEK_HYDRO + ' 热液能（剩流）+ ' + SB.CFG.GEEK_KELP + ' 藻食 + ' + SB.CFG.GEEK_METAL +
          ' 金属 + ' + SB.CFG.GEEK_STONE + ' 石头 + ' + SB.CFG.GEEK_CORAL + ' 珊瑚';
        if (emit) emit('星球重构机 G.E.E.K 缺少热液能或材料（' + _need + '），停转——补足后自动继续。');
      }
    }

    if (s.shell <= 0 && !s.shellOpened && !s.breakSettled) { s.shell = 0; onShellZero(s, emit, opts); }
    return cut;
  }

  function onShellZero(s, emit, opts) {
    s.shell = 0;
    /* 破壳先展示当前结算预估；只有玩家选择轮回时才真正入账。留在本局后，
     * shellOpened 保持为真，文明可继续发展，之后再次按最新状态结算。 */
    s.shellOpened = true;
    s.broken = true;
    /* 2026-10-24 成就「首次破壳」（docs/ACHV_DESIGN_v0.3.md §四·2）：本函数是壳真正
     * 归 0 的唯一事件（基础削壳卡到 25% 停手，最后一段只能靠天穹钻机凿穿）。
     * 与 firstRebirth（首次合格轮回结算）口径互不覆盖：资格玩家不破壳直接轮回
     * 也拿得到后者；破壳后选「留在本局」不发轮回点也照发本条。一次性，
     * 离线补算期同样置位（unlockOnce 不是 UI，不受 deferBreakUI 影响）。 */
    if (SB.achv && SB.achv.unlockOnce && SB.game && SB.game.meta) SB.achv.unlockOnce('shellBreak', SB.game.meta());
    var report = SB.prestige.breakReport(s);
    if (!SB.prestige.qualified(s)) { report.tidePoints = 0; report.locked = true; }
    /* 离线补算期间由结算器统一接管弹窗：不要让动画先弹出、又被离线总结覆盖。 */
    if (!(opts && opts.deferBreakUI)) (SB.game.showBreakAnimation || SB.game.showBreakPanel)(report);
    if (emit) emit('冰壳裂开了。');
  }

  /* 星空槽推进（2026-10-13 镜像破壳：破壳后把「破壳槽」翻转为「星空槽」）。
   * 破壳前（!s.broken）或已达成（s.starComplete）直接 return。
   * 速率来自 economy.starRate（= STAR_BASE × breakCoef + 升级加成 + 太空建筑运行座数贡献），
   *   按 dt 累加、cap 到 STAR_CAP。太空建筑各自的「开几座」开关（satelliteStop / spacestationStop）
   *   决定它们贡献多少，基础文明推力部分始终在跑（不再有全局暂停开关）。
   * 满槽 ⇒ 置 s.starComplete（只触发一次）+ 调 render.showStarComplete 弹占位结算面板。 */
  function tickStar(s, dt, emit) {
    if (!s || s.shell > 0 || !(s.broken || s.shellOpened || s.breakSettled) || s.starComplete) return;
    var rate = (SB.economy && SB.economy.starRate) ? SB.economy.starRate(s) : 0;
    if (!(rate > 0)) return;
    var cap = SB.CFG.STAR_CAP || 0;
    var cur = s.res.starExplore || 0;
    var next = Math.min(cap, cur + rate * dt);
    s.res.starExplore = next;
    /* 累计产出台账（gathered 尤里卡读它）：星空槽直写 res、不经过 addRes，
     * 所以这里把本帧增量手动同步进 got，否则 crewed（累计星空探索 30000）永远卡死。 */
    if (s.got) s.got.starExplore = (s.got.starExplore || 0) + (next - cur);
    if (cap > 0 && next >= cap) {
      s.starComplete = true;
      /* 2026-10-24 成就「太空时代」（docs/ACHV_DESIGN_v0.3.md §四·5）：星空槽满槽唯一事件。 */
      if (SB.achv && SB.achv.unlockOnce && SB.game && SB.game.meta) SB.achv.unlockOnce('starComplete', SB.game.meta());
      if (emit) emit('星空槽已填满——太空时代达成。');
      if (SB.ui && SB.ui.render && SB.ui.render.showStarComplete) SB.ui.render.showStarComplete(s);
    }
  }

  SB.shell = {
    techCount: techCount,
    breakCoef: breakCoef,
    brokenRatio: brokenRatio,
    autoRate: autoRate,
    tickShell: tickShell,
    tickStar: tickStar,
    onShellZero: onShellZero
  };
})(typeof window !== 'undefined' ? window : globalThis);
