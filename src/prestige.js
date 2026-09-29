/* 天壳 / SHELLBREAK — 周目层：破冰结算 / 轮回点 / 轮回商店
 * 结算沿用猫国的「重置收益 = 人口」：峰值族民是唯一主指标，建筑存量只是零头。
 * 开方压缩保留（防滚雪球）。
 * 双轨货币：轮回点（软，买增益）+ 破层级（硬，二期大气壳的门票）。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  /* 轮回点由「峰值族民」决定，建筑存量只作零头。
   * 峰值族民 ≤ TIDE.POP_GATE 时直接发 0：不是给一点点，而是干脆不给——
   * 半吊子的奖励会让玩家以为门槛不存在，反而不如明确告诉他「这局白干」。 */
  function breakReport(s) {
    var d = 1;                       // 一期只破一层（冰封壳）
    var B = SB.economy.lvlSum(s), P = s.peak;
    var T = CFG.TIDE;

    var pPart = 0;
    if (P > T.POP_GATE) {
      pPart = (P - T.POP_GATE) * T.POP_SLOPE;
      if (P > T.POP_ESC.at) pPart += (P - T.POP_ESC.at) * T.POP_ESC.k;
    }

    // 建筑存量：保留分段（越后期一级越值钱），但只按 B_W 折算成零头
    var bRaw = 0;
    if (B > 300) bRaw = 100 * 5 + 200 * 12 + (B - 300) * 30;
    else if (B > 100) bRaw = 100 * 5 + (B - 100) * 12;
    else bRaw = B * 5;
    var bPart = bRaw * T.B_W;

    var gateMiss = P <= T.POP_GATE;
    var shellScore = T.LAYER * d + bPart + pPart;
    var tidePoints = gateMiss ? 0 : (Math.sqrt(1 + 8 * shellScore / 40) - 1) / 2;
    return {
      d: d, B: B, P: P,
      bPart: bPart, pPart: pPart,
      gateMiss: gateMiss, shellScore: shellScore, tidePoints: tidePoints
    };
  }

  // 结算写入跨周目存档。identity：破层进度 + 已购增益 + 科技记录（重玩新鲜感），其余清空。
  function doBreak(s, emit) {
    if (s.broken) return;
    s.broken = true;
    var r = breakReport(s);
    var meta = SB.game.meta();
    /* 解锁轮回前（未建立宗教）不得获取轮回点：granted 直接按 0 计。
     * 结算面板与 emit 都用 granted，避免「算出来有、实际没给」的误导。 */
    var seen = !!meta.religionSeen;
    var granted = seen ? r.tidePoints : 0;
    meta.tide += granted;
    meta.layers = Math.max(meta.layers, r.d);
    for (var k in s.techs) if (s.techs[k]) meta.techLog[k] = true;   // 科技「记录」而非继承
    /* 第一次真实轮回 ⇒ 解锁轮回商店。判定用 religionSeen（而非 granted>0）：
     * 哪怕这局峰值族民没过门槛、granted 为 0，只要「建立宗教 + 破冰」发生过就是一次轮回，
     * 商店照样开（玩家只是这局没拿到点）。未建立宗教的破冰 seen=false，商店保持锁死。 */
    if (seen) meta.shopUnlocked = true;
    SB.state.saveMeta(meta);
    r.tidePoints = granted;
    r.samsaraLocked = !seen;
    SB.game.showBreakPanel(r);
    if (emit) emit('冰壳裂开了。获得轮回点 ' + granted.toFixed(2) + '。');
  }

  /* 轮回商店。p.n 是可叠层数；nest 是前置。
   * 扣款用「累计消费」口径：meta.spent + cost <= meta.tide，避免退款式重买。 */
  function perkLevel(id) { return SB.game.meta().perks[id] || 0; }
  function perkLocked(p) { return !!p.nest && perkLevel(p.nest) <= 0; }
  function perkState(id) {
    var p = null;
    for (var i = 0; i < SB.PERKS.length; i++) if (SB.PERKS[i].id === id) p = SB.PERKS[i];
    if (!p) return null;
    var lv = perkLevel(id), max = p.n || 1;
    var meta = SB.game.meta();
    return {
      perk: p, lv: lv, max: max,
      done: lv >= max,
      locked: perkLocked(p),
      afford: meta.spent + p.cost <= meta.tide
    };
  }
  function buyPerk(id) {
    var st = perkState(id);
    if (!st || st.done || st.locked || !st.afford) return false;
    var meta = SB.game.meta();
    meta.tide -= st.perk.cost;
    meta.spent += st.perk.cost;
    meta.perks[id] = st.lv + 1;
    SB.state.saveMeta(meta);
    applyPerk(SB.game.run(), st.perk);
    return true;
  }
  function applyPerk(s, p) {
    if (!s) return;
    var a = p.apply || {};
    if (!s.perk) s.perk = SB.state.emptyPerks();
    for (var k in a) s.perk[k] = (s.perk[k] || 0) + a[k];
    // 起始资源类立即到账；薄壳类在下一周目 freshRun 时通过 perk.thin 生效
    if (p.id === 'food') s.res.kelp += 200;
    if (p.id === 'coral') s.res.coral += 150;
  }

  SB.prestige = {
    breakReport: breakReport,
    doBreak: doBreak,
    perkState: perkState,
    perkLevel: perkLevel,
    perkLocked: perkLocked,
    buyPerk: buyPerk
  };
})(typeof window !== 'undefined' ? window : globalThis);
