/* 天壳 / SHELLBREAK — 天壳层
 *
 * 两档削壳，职责严格分开，这是整个一期的核心机制：
 *
 *   ① 基础削壳（自动，永远开着）
 *      速率 = BREAK_BASE × breakCoef，冰封期另乘 COLD 加成。
 *      只把壳削到 FLOOR_AT（25%）就停手——冻到最薄，然后卡住。
 *
 *   ② 祭坛削壳（破冰祭坛，吃地热）
 *      只有祭坛能凿穿最后那 25%。它按速率自动削，地热耗尽就自动停摆，
 *      恢复供能自动继续——玩家的操作对象是「燃料供应」，不是点击次数。
 *
 * 这样「系数」的每一次撞墙（人口住房卡、级数成本卡、学问卡）都会逼玩家
 * 去动祭坛，而祭坛又把玩家拉回「采集还是烧热」的取舍上。
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
   * 每项来源都有独立的墙（人口受住房、级数受成本、科技受学问、祭坛受铁骨），
   * 所以系数是一条会走平的曲线，而不是一开局就到顶的直线。 */
  function breakCoef(s) {
    var C = CFG.COEF;
    var c = C.POP * Math.pow(s.pop, C.POP_POW)
      + C.LVL * Math.pow(SB.economy.lvlSum(s), C.LVL_POW)
      + C.TECH * techCount(s)
      + C.MIR * (s.lvl.miracle || 0)
      + C.PERK * (s.perk.coef || 0);
    if (SB.economy.isCold(s)) c *= C.COLD;   // 越冷越拼命
    return c;
  }

  function autoRate(s) { return CFG.BREAK_BASE * breakCoef(s); }
  function miracleMul(s) { return s.techs.siegeT ? 1.25 : 1; }
  function miracleRate(s) { return CFG.MIRACLE_RATE * (s.lvl.miracle || 0) * miracleMul(s); }
  /* 燃料消耗随等级加剧（每级再 +ESCALATE），而不是线性。
   * 线性的话第 5 级祭坛只是第 1 级的 5 倍，地热永远喂得饱，
   * 「要不要再升一级」就变成一个没有代价的选择。 */
  function miracleBurn(s) {
    var lv = s.lvl.miracle || 0;
    if (lv <= 0) return 0;
    return CFG.MIRACLE_BURN * lv * (1 + CFG.MIRACLE_ESCALATE * (lv - 1));
  }

  /* 一个 tick 的天壳推进。dt 为秒。
   * 返回本次实际削掉的壳量，供渲染层显示「正在以 X 点/秒 推进」。 */
  function tickShell(s, dt, emit) {
    if (s.broken) return 0;
    var cut = 0;

    // ① 基础削壳：卡在 FLOOR_AT，不越过
    //    判定用的是 <= 语义——壳精确停在 25% 时也必须停手，否则会来回抖动
    if (SB.economy.rOf(s) > CFG.FLOOR_AT) {
      var floor = s.iceShell * CFG.FLOOR_AT;
      var r = autoRate(s) * dt;
      s.shell = Math.max(floor, s.shell - r);
      cut += r;
      s._cutBase = (s._cutBase || 0) + r;   // 累计，供回归脚本拆解削壳构成
    }

    // ② 祭坛：有燃料就自动凿，没燃料自动停摆
    if (s.miracleOn && (s.lvl.miracle || 0) > 0) {
      var burn = miracleBurn(s) * dt;
      var want = miracleRate(s) * dt;
      if (s.res.fuel >= burn) {
        s.res.fuel -= burn;
        s.miracleRun += dt;
        s.starved = false;
        s.shell -= want;
        cut += want;
        s._cutMir = (s._cutMir || 0) + want;
      } else if (!s.starved) {
        s.starved = true;
        if (emit) emit('地热耗尽，破冰祭坛停摆——恢复供能才能继续凿。');
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
    autoRate: autoRate,
    miracleRate: miracleRate,
    miracleBurn: miracleBurn,
    tickShell: tickShell,
    onShellZero: onShellZero
  };
})(typeof window !== 'undefined' ? window : globalThis);
