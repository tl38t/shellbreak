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

  /* 破壳比例 = 1 − rOf（壳剩余比例的补）。autoRate 削到 FLOOR_AT=0.25 就停手 ⇒
   * brokenRatio 精确收在 0.75，随后由天穹钻机继续削到 1（破壳后 rOf=0）。
   * ⚠️ 0.75 是 `cond:{t:'shell'}` 在「钻机建成前」能取到的**可达上限**，不是任何科技的
   *    门槛值：《天壳地质学》门槛 2026-11-05 已纠正为 0.25（techs.js:670）。
   *    别把 FLOOR_AT 单独调高，否则上限跌破门槛时那条科技永远揭示不了、钻机也建不起来。 */
  function brokenRatio(s) {
    return 1 - SB.economy.rOf(s);
  }

  /* 万众热忱（2026-11-05 用户拍板）：基础自动削壳的**独立乘区**，加算 1+0.2×级数。
   * ⚠️ 绝不可并进 breakCoef —— 那里还被暖石费率 warmRate(0.03×coef)、星空槽 starRate、
   *    coef 型尤里卡阈值与建造日志共用，且 COLD ×1.35 / 总动员令乘在整段上。
   *    并进去 ⇒ 买「破壳加速」会顺带加重寒流季暖石消耗（静默惩罚）、破壳后星空槽变快。
   * ⚠️ 只影响 ① 自动削壳段：FLOOR_AT 是硬停手线（买满也不会跳过 ERA5 科技链），
   *    ② 天穹钻机 SKYDRILL_RATE 不读这里，故 desc 写「基础削壳速度」而非「破壳速度」。 */
  function autoRate(s) {
    var lv = (s.perk && s.perk.shellDrive) || 0;   // 老档缺键按 0 处理，不依赖存档迁移
    var drive = 1 + (SB.CFG.SHELL_DRIVE_STEP || 0) * lv;
    return SB.CFG.BREAK_BASE * breakCoef(s) * drive;
  }

  /* 天元突破：天穹钻机钻头倍率的**唯一读数口**（2026-11-05）。
   * 门 = 本局已解锁（s.perk.drillOverdrive > 0）；档 = meta.skydrillMul（1 / 2，跨周目）。
   * ⚠️ 倍率绝不写进 s.perk 的数值键：那是已购天赋派生表，会被 syncDerivedPerks 按账本
   *    整表覆盖 ⇒ 玩家拨的档一读档就丢。也不要在别处再判一次门（同源铁律）。
   * ⚠️ 热路径（tickShell / hydroAlloc 每 tick 各一次）调用，故只读一次 meta() 且带守卫：
   *    读不到 meta、脏档值、没买天赋 ⇒ 一律 1×，老档与离线补算口径自动一致。 */
  function skydrillMul(s) {
    if (!s || !s.perk || !(s.perk.drillOverdrive > 0)) return 1;
    var m = null;
    try { if (SB.game && SB.game.meta) m = SB.game.meta(); } catch (e) { return 1; }
    var max = Number(SB.CFG.SKYDRILL_OVERDRIVE_MUL) || 2;
    return (m && m.skydrillMul === max) ? max : 1;
  }

  /* ── G.E.E.K「还有活要干」的唯一判据（2026-11-04 抽出）────────────────────
   * 无活干的两态：① 恩克拉多斯已完成、但还没研究《星球改造》（在等）② 两阶段都完成。
   * ⚠️ 三处读点必须同源，不许再各写一遍（历史上已散成三份各自漂移的副本）：
   *     · shell.tickGeek      —— 真结算（推进 / 扣料）
   *     · economy.hydroAlloc  —— 流分配（没活干就不该占 40/秒 热液能）
   *     · economy-rates       —— 面板里每 s 扣的料
   */
  function geekActive(s) {
    if (!s || !s.geek) return false;
    if (!s.geek.enceladusDone) return true;
    return !!(s.techs && s.techs.terraform) && !s.geek.terraDone;
  }

  /* ── 星球重构机 G.E.E.K 的每 tick 推进（ERA9 · 生态重塑解锁奇观）──────────────
   * 建成后在「自然环境」卡手动启动，依次改造恩克拉多斯星（1800s）→ 研究 terraform
   * 后改造泰拉星（3600s）。唯一效果 = 覆盖建筑造价等级偏移（economy.costOf 的
   * COST_OFFSET_COVERED 分档）；无幸福度 / 市政 / 产出额外效果（用户拍板不加）。
   *
   * ⚠️ 2026-11-04 从 tickShell 的 ③ 段独立出来，**必须在 broken 门之外跑**。
   *   原因：tickShell 首行 `if (s.broken) return 0` 本身是对的（破壳后无壳可削），
   *   但它把「改造别的星球」和「削天壳」绑进了同一个函数 ⇒ 破壳后 G.E.E.K 进度被
   *   永久冻结。而且早退发生在 geekStarved 置位之前 ⇒ 面板仍显示「运转中」、倒计时
   *   冻住、不给任何原因（玩家报「星球改造器卡着不动」）。
   *   更重的一条：terraDone 永假 ⇒ geekTerra 永假 ⇒《严冬计划》永不揭示（techs.js 的
   *   cond 是硬门槛）⇒ 重核聚变 → 超临界 → 流浪泰拉科技全断 ⇒ 行星发动机永不解锁
   *   ⇒ 流浪泰拉挑战无法通关（它的 goal 是 50 座行星发动机）。
   *
   * 破壳后仍会继续吃 GEEK_HYDRO/秒 热液能 —— 这是有意的：改造进度是既有投入，不该
   * 因为凿穿冰壳而作废；不想要这份开销的玩家可以自己点停机。
   *
   * ⚠️ 抄天穹钻机 flow 模型：热液能是「每 tick 瞬态流」，从本 tick 剩流里取 GEEK_HYDRO，
   *   不读 s.res.hydro 库存池。剩流由 economy.hydroAlloc 同一 tick 算好（工坊低阶先吃满，
   *   G.E.E.K 排在发射场之后、朱庇特之前）。
   * ⚠️ 库存耗 kelp(藻食)/silt(金属)/stone(石头)/coral(珊瑚) 在扣费**之前**判足
   *   （扣费先于置位，失败一分不扣），与 skydrill 同纪律；任一不足或断流 = 暂停、
   *   进度保留（enceladusRun/terraRun 累加，绝不回拨 geekOn——补料后下一 tick 自动续转）。
   */
  function tickGeek(s, dt, emit) {
    /* 运行态闸门（与天穹钻机同纪律）：已建成 + 玩家手动启动 + 还有活要干。 */
    if (!(s.geek && s.geek.geekOn)) return;
    if (!(SB.wonder && SB.wonder.owned(s).wonder_geek)) return;
    /* 没活干：顺手把停摆位清掉 —— 否则「改造做完」之后面板会永远挂着
     * 「缺×× · 停摆」徽标（starved 是上一阶段留下的，没人再把它落回 false）。 */
    if (!geekActive(s)) { s.geekStarved = false; return; }
    var _HF2 = s._hydroFlow || (SB.economy ? SB.economy.hydroAlloc(s, dt) : { geekDraw: 0 });
    var hydroOK = _HF2.geekDraw > 0;
    var _gkKelp = SB.CFG.GEEK_KELP * dt, _gkMetal = SB.CFG.GEEK_METAL * dt,
        _gkStone = SB.CFG.GEEK_STONE * dt, _gkCoral = SB.CFG.GEEK_CORAL * dt;
    if (hydroOK && (s.res.kelp || 0) >= _gkKelp && (s.res.silt || 0) >= _gkMetal
        && (s.res.stone || 0) >= _gkStone && (s.res.coral || 0) >= _gkCoral) {
      s.res.kelp -= _gkKelp; s.res.silt -= _gkMetal; s.res.stone -= _gkStone; s.res.coral -= _gkCoral;
      if (!s.geek.enceladusDone) {
        /* 阶段一：恩克拉多斯星改造。完成 ⇒ COST_OFFSET_COVERED.enc（默认 3 级、廉租社区 1 级）。 */
        s.geek.enceladusRun = (s.geek.enceladusRun || 0) + dt;
        var _encTime = SB.economy && SB.economy.starTerraformDuration
          ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_ENCELADUS_SECONDS) : SB.CFG.GEEK_ENCELADUS_SECONDS;
        if (s.geek.enceladusRun >= _encTime) {
          s.geek.enceladusDone = true;
          if (emit) emit('星球重构机 G.E.E.K 完成恩克拉多斯星改造：覆盖建筑升级花费下调最多 3 级（廉租社区 1 级）。');
        }
      } else if (s.techs.terraform && !s.geek.terraDone) {
        /* 阶段二：泰拉星改造（需先研究 terraform）。完成 ⇒ 再叠加 COST_OFFSET_COVERED.terra
         *   （默认 5 级 ⇒ 合计 8；廉租社区 2 级 ⇒ 合计 3）。 */
        s.geek.terraRun = (s.geek.terraRun || 0) + dt;
        var _terraTime = SB.economy && SB.economy.starTerraformDuration
          ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_TERRA_SECONDS) : SB.CFG.GEEK_TERRA_SECONDS;
        if (s.geek.terraRun >= _terraTime) {
          s.geek.terraDone = true;
          if (emit) emit('星球重构机 G.E.E.K 完成泰拉星改造：覆盖建筑升级花费下调最多 8 级（廉租社区合计 3 级）。');
        }
      }
      s.geekStarved = false;
    } else if (!s.geekStarved) {
      s.geekStarved = true;
      var _need = '每 s 需 ' + SB.CFG.GEEK_HYDRO + ' 热液能（剩流）+ ' + SB.CFG.GEEK_KELP + ' 藻食 + ' + SB.CFG.GEEK_METAL +
        ' 金属 + ' + SB.CFG.GEEK_STONE + ' 石头 + ' + SB.CFG.GEEK_CORAL + ' 珊瑚';
      if (emit) emit('星球重构机 G.E.E.K 缺少热液能或材料（' + _need + '），停转——补足后自动继续。');
    }
  }

  /* 一个 tick 的天壳推进。dt 为秒。
   * 返回本次实际削掉的壳量，供渲染层显示「正在以 X 点/秒 推进」。 */
  function tickShell(s, dt, emit, opts) {
    if (s.shell < 0) s.shell = 0;   // 修复破壳后钻机凿出的历史负壳（显示漂移，如 -235602）
    var cut = 0;
    /* ⚠️ 2026-11-04：G.E.E.K 必须在 broken 门**之前**推进 —— 见 tickGeek 的注释。
     *   破壳后 ① 削壳与 ② 天穹钻机都无壳可做，只有它还有活要干。 */
    tickGeek(s, dt, emit);
    if (s.broken) return 0;

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
      /* 天元突破 2×：钻头耗率与削壳速率同乘 _dm；热液能 hCost 不放大。 */
      var _dm = skydrillMul(s);
      var dCost = SB.CFG.SKYDRILL_DRILL * _dm * dt;
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
        var sWant = SB.CFG.SKYDRILL_RATE * _ss * _dm * dt
          * (SB.faith && SB.faith.shellDrillSpeedMul ? SB.faith.shellDrillSpeedMul(s) : 1);
        s.shell -= sWant;
        cut += sWant;
        s._cutSky = (s._cutSky || 0) + sWant;
        s.skydrillRun = (s.skydrillRun || 0) + dt;
        s.skydrillStarved = false;
      } else if (!s.skydrillStarved) {
        s.skydrillStarved = true;
        /* 2026-10-29：日志原为「缺共振钻头或热液能」二合一，玩家读不出该补哪条
         *   （与面板同一个病因）。按两个门的实际结果分流，与 hydroAlloc 的 skyStopWhy 同源。 */
        if (emit) {
          var _bitOK = (s.res.resonantDrill || 0) >= dCost;
          emit(_bitOK
            ? '天穹钻机缺热液能（工坊吃完后剩流不足 ' + SB.CFG.SKYDRILL_HYDRO + '/秒），停转——补足后自动继续。'
            : '天穹钻机缺共振钻头（现存 ' + (s.res.resonantDrill || 0).toFixed(1) + '，每秒耗 ' +
              (SB.CFG.SKYDRILL_DRILL * _dm) + '），停转——去工坊补货后自动继续。');
        }
      }
    }

    if (s.shell <= 0 && !s.shellOpened && !s.breakSettled) { s.shell = 0; onShellZero(s, emit, opts); }
    return cut;
  }

  function onShellZero(s, emit, opts) {
    s.shell = 0;
    /* ⚠️ 2026-11-02（玩家报「破壳后钻机不运行了还在吃 −20/秒热液」）：这里补上**关机**。
     *   破壳后机头没有壳可凿，但 skydrillOn 一直是 true ⇒ hydroAlloc 会继续按 20/秒 给它留份额
     *   （那份是从流里**真扣**的，不是显示）。两处一起修：
     *     · 本条：破壳即把开关落下（状态说真话，存档里不会留一个「开着却没活干」的机器）；
     *     · economy.hydroAlloc：机器态判据补 `!s.broken && shell > 0`，救已经破壳的老存档。
     *   ⚠️ 不要只做本条：它是**一次性事件**，老档早已过去，只靠它那批档照样漏 20/秒。 */
    s.skydrillOn = false;
    s.skydrillStarved = false;
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
    /* 破壳即判定破壳型挑战（2026-11-03）。
     * 【为什么在这里，而不是结算时】破壳型挑战（寒流禁火 / 小国寡民 / 忽视科文 /
     *   深渊重压 / 逐光竞速）的胜负都以「凿穿天壳」为终点；破壳之后玩家还要继续玩
     *   ERA10（发射场 → 戴森球），人口、岗位、现实计时全都还会变。
     *   判定留到结算 ⇒ 破壳后多挂机两小时会把 4 小时档判成超时。
     * ⇒ 先冻 seal（判据快照），再当场判定。之后无论玩家玩多久、什么时候轮回，
     *   这次挑战的成绩都定格在破壳这一秒。
     * ⚠️ seal 必须在 sealRun 之前写：resolveRun 内部优先读 s.challengeSeal。 */
    var chOutcome = null;
    if (SB.challenges && SB.challenges.seal && SB.game && SB.game.meta) {
      s.challengeSeal = SB.challenges.seal(s);
      chOutcome = SB.challenges.sealRun(s, SB.game.meta());
    }
    var report = SB.prestige.breakReport(s);
    if (!SB.prestige.qualified(s)) { report.tidePoints = 0; report.locked = true; }
    if (chOutcome) {
      if (chOutcome.failed) report.challengeFailure = chOutcome;
      else report.challengeClear = chOutcome;
    }
    /* ⚠️ 2026-11-03：破壳不再弹「轮回结算」面板。破壳只是本局中段的一个里程碑，
     *   后面还有整个 ERA10。结算只发生在玩家主动点底栏「轮回」时（askResetRun）。
     *   这里给的是「破壳结果」：挑战判定 + 壳外时代开启。 */
    if (!(opts && opts.deferBreakUI)) {
      if (SB.ui && SB.ui.render && SB.ui.render.showBreakAnimation)
        SB.ui.render.showBreakAnimation(report, function () { SB.ui.render.showBreakResult(report); });
      else if (SB.ui && SB.ui.render && SB.ui.render.showBreakResult)
        SB.ui.render.showBreakResult(report);
      else if (SB.game.showBreakPanel) SB.game.showBreakPanel(report);
    }
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
    var cap = SB.challenges && SB.challenges.starCap ? SB.challenges.starCap(s) : (SB.CFG.STAR_CAP || 0);
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
    /* 天元突破：tickShell / economy.hydroAlloc / UI / bot 备料都必须读这一个口。 */
    skydrillMul: skydrillMul,
    /* G.E.E.K「还有活要干」—— economy.hydroAlloc 与 economy-rates 都必须读这个，
     * 不许各自再写一遍（同源铁律，见函数注释）。 */
    geekActive: geekActive,
    tickGeek: tickGeek,
    tickShell: tickShell,
    tickStar: tickStar,
    onShellZero: onShellZero
  };
})(typeof window !== 'undefined' ? window : globalThis);
