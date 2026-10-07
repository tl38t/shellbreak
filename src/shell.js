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
  function tickShell(s, dt, emit) {
    if (s.broken) return 0;
    var cut = 0;

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
    if (s.skydrillOn && SB.wonder && SB.wonder.owned(s).wonder_skydrill) {
      var dCost = SB.CFG.SKYDRILL_DRILL * dt;
      var hCost = SB.CFG.SKYDRILL_HYDRO * dt;
      // 热液能侧：hydroAlloc 已是「本 tick 流分配」唯一权威（含钻机吃剩流的那一份），
      //   skyDraw>0 即表示「工坊吃完后剩流够钻机取 SKYDRILL_HYDRO 且共振钻头够」⇒ 钻机这一份已被占走。
      var _HF = s._hydroFlow || (SB.economy ? SB.economy.hydroAlloc(s, dt) : { skyDraw: 0 });
      var hydroOK = _HF.skyDraw > 0;
      if ((s.res.resonantDrill || 0) >= dCost && hydroOK) {
        s.res.resonantDrill -= dCost;
        // 流不进库存：扣共振钻头即可，热液能已从本 tick 流中被钻机这一份占走（HF.left 已计入）。
        var _lg = SB.prestige ? SB.prestige.legacy() : null;
        var _ss = _lg ? (1 + 0.05 * _lg.shellSurveyLevel) : 1;
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

    if (s.shell <= 0 && !s.broken) { s.shell = 0; onShellZero(s, emit); }
    return cut;
  }

  function onShellZero(s, emit) {
    s.shell = 0;
    /* 注意：这里绝不能先置 s.broken。prestige.doBreak 开头有「已结算则返回」的守卫，
     * 若在调用前把 broken 置位，doBreak 会立刻 return，结算面板与洋流点全部丢失——
     * broken 的置位权只属于 doBreak。 */
    SB.prestige.doBreak(s, emit);
    if (emit) emit('冰壳裂开了。');
  }

  SB.shell = {
    techCount: techCount,
    breakCoef: breakCoef,
    brokenRatio: brokenRatio,
    autoRate: autoRate,
    tickShell: tickShell,
    onShellZero: onShellZero
  };
})(typeof window !== 'undefined' ? window : globalThis);
