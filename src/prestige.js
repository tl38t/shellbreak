/* 天壳 / SHELLBREAK — 周目层：轮回结算 / 旧日遗产 / 轮回商店
 *
 * 结算资格门 = 本局完成 Era 2 市政《神学》（s.civics.theology 为真值）。
 * 不要求壳已破、不要求宗教是否命名、不要求《归正会》。
 *
 * 轮回点由「人口 + 建筑纪元 + 工坊解锁项」决定（线性，无递减回报）：
 *   populationScore = 2 × 峰值人口 P
 *   buildingScore   = Σ W[metaEra_i] × log2(1 + 建筑等级 L_i)   （高纪元建筑权重更高）
 *   craftScore      = CRAFT_W × 已解锁工坊项目数（配方 / 工具 / 升级）
 *   developmentScore = populationScore + buildingScore + craftScore
 *   shellFactor = 0.5 + 0.5 × q      （q = 破壳进度 0..1）
 *   earnedTide = 1 + floor( developmentScore × TIDE.LINEAR_K × shellFactor )
 *
 * 4 类旧日遗产分别进入不同账本，绝不重复折成轮回点：
 *   · oldFaith              本局剩余信仰并入跨周目总量（对数档位给全产加成）
 *   · memorialWonders      首次建成的独特奇观入藏（每座 +1% 科技/市政获取）
 *   · oldArtworkEarnedTotal 本局持有的完整 artwork 件数（固定市政点/秒，递减曲线）
 *   · oldTideStelesEarnedTotal 本局持有的完整 tidalRecord 件数（固定科技点/秒，递减曲线）
 *
 * 双轨货币：轮回点（软，买增益）+ 破层级（硬，二期大气壳的门票，本稿暂不再发放）。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  /* 建筑 → 起始解锁纪元（metaEra）。按各建筑解锁所依赖的科技/市政纪元反查（见方案文档）：
   *   纪元权重 W: 1/2/3/5/8（暗流/冷焰/硫泉/洋流/破壳纪）。
   * 仅 defaultUnlockable / 仅 unlockRatio 的建筑归纪元 1。 */
  var W = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
  var META_ERA = {
    kelp: 1, nest: 1, coralhouse: 1, siltpit: 1, hall: 1, weir: 1, warmnest: 1, kelpstore: 1, workshop: 1, library: 1,
    ballast: 2, lighthouse: 2, furnace: 2, institute: 2, square: 2, temple: 2,
    hydroturbine: 3, hydroshop: 3, canal: 3,
    observatory: 4, coralfarm: 4, bank: 4, caravanserai: 4, museum: 4,
    hotforge: 5, school: 5, theater: 5, tenement: 5
  };

  /* 调和级数 H(n) = Σ_{k=1..n} 1/k，用于旧日艺术品/碑石的固定速率递减。 */
  function harmonic(n) {
    var s = 0;
    for (var k = 1; k <= n; k++) s += 1 / k;
    return s;
  }

  /* 跨周目遗产聚合：供 rates() / globalMul() 读取，不依赖本局状态。
   * 全部从 meta 派生，旧档无字段时按 0 兜底。 */
  function legacy() {
    var m = SB.game.meta();
    var relicCount = m.memorialWonders ? Object.keys(m.memorialWonders).length : 0;
    var oldFaith = m.oldFaith || 0;
    /* 对数档位：oldFaith 到 10/100/1e3/1e4 时全产 +0.5/1.0/1.5/2.0%。
     * 浮点边界 +1e-9，value<=0 时档位为 0。 */
    var faithTier = oldFaith > 0 ? Math.floor(Math.log10(oldFaith) + 1e-9) : 0;
    var p = m.perks || {};
    function finiteOr(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
    return {
      relicCount: relicCount,
      relicCultureMul: 1 + 0.01 * relicCount,
      relicScienceMul: 1 + 0.01 * relicCount,
      oldArtworkCultureRate: 0.15 * harmonic(finiteOr(m.oldArtworkEarnedTotal, 0)),
      oldTideSteleScienceRate: 0.15 * harmonic(finiteOr(m.oldTideStelesEarnedTotal, 0)),
      oldFaithAllProductionBonus: 0.005 * faithTier,
      shopCivicBonus: 0.10 * (p.civicArchive || 0),   // 2026-10-05 拍板 +10%/级、无上限
      shopScienceBonus: 0.10 * (p.tideProof || 0),    // 同上
      coldStoreLevel: p.coldStore || 0,
      matStoreLevel: finiteOr(p.matStore, 0),
      shellSurveyLevel: p.shellSurvey || 0,
      wonderBlueprintLevel: p.wonderBlueprint || 0
    };
  }

  /* 资格判定：本局《神学》为真值。代码里存的是整数 1（见 civics.js），
   * 故必须用真值判断，误用 === true 会因严格相等失败而让门永远关闭。 */
  function qualified(s) { return !!(s && s.civics && s.civics.theology); }

  /* 工坊解锁项目计入发展分：已解锁的配方 + 已购买的工具 + 已装填的升级。
   * 配方的「解锁」= 建成工坊且 need/needCivic 门已满足（与 workshop.craftBlocked
   * 同口径，但不看材料是否够——材料是运行时状态，不决定「这项你开没开」）。
   * 工具/升级看的是 s.tools / s.upgrades 是否已置位（即玩家实际拿到手）。 */
  function craftUnlocked(s, c) {
    if (!(s.lvl && s.lvl.workshop > 0)) return false;
    if (c.need && !(s.techs && s.techs[c.need])) return false;
    if (c.needCivic && !(s.civics && s.civics[c.needCivic])) return false;
    return true;
  }
  function workshopScore(s) {
    var Wt = (SB.CFG.TIDE && SB.CFG.TIDE.CRAFT_W) || 4;
    var count = 0, k;
    if (SB.CRAFTS) for (var i = 0; i < SB.CRAFTS.length; i++)
      if (craftUnlocked(s, SB.CRAFTS[i])) count++;
    if (SB.TOOLS && s.tools) for (var j = 0; j < SB.TOOLS.length; j++)
      if (s.tools[SB.TOOLS[j].id]) count++;
    if (SB.UPGRADES && s.upgrades) for (var m = 0; m < SB.UPGRADES.length; m++)
      if (s.upgrades[SB.UPGRADES[m].id]) count++;
    return { count: count, score: count * Wt };
  }

  /* 结算报告（无论是否合格都返回结构，供面板渲染）。 */
  function breakReport(s) {
    var P = s.peak || 0;
    var popScore = 2 * P;
    var bScore = 0;
    if (SB.BUILDINGS) {
      for (var i = 0; i < SB.BUILDINGS.length; i++) {
        var id = SB.BUILDINGS[i].id;
        var e = META_ERA[id];
        if (!e) continue;                       // 未登记纪元的建筑不计入（如未来新增忘填）
        var L = (s.lvl && s.lvl[id]) || 0;
        if (!L) continue;
        bScore += W[e] * Math.log2(1 + L);
      }
    }
    var w = workshopScore(s);
    var dev = popScore + bScore + w.score;
    var ice = s.iceShell || 1;
    var q = ice > 0 ? Math.max(0, Math.min(1, 1 - (s.shell || 0) / ice)) : 0;
    var shellFactor = 0.5 + 0.5 * q;
    var K = (SB.CFG.TIDE && SB.CFG.TIDE.LINEAR_K) || 0.04;
    var earned = 1 + Math.floor(dev * K * shellFactor);
    return {
      P: P, popScore: popScore, buildingScore: bScore,
      craftScore: w.score, workshopCount: w.count, developmentScore: dev,
      q: q, shellFactor: shellFactor,
      tidePoints: earned,
      relicTourism: 0, oldArtwork: 0, oldTideStele: 0,
      locked: false
    };
  }

  /* 执行结算并写入跨周目账本。emit 用于日志。
   * 未达资格门：tidePoints 归 0、不发任何遗产、不解锁商店（与「普通重开」同口径）。 */
  function doBreak(s, emit) {
    if (s.broken) return null;
    var meta = SB.game.meta();
    var r = breakReport(s);
    /* 破壳结算只允许进入一次；否则主循环在 shell<=0 时会每 100ms 重播结算/动画。 */
    s.broken = true;
    if (!qualified(s)) {
      r.tidePoints = 0;
      r.locked = true;
      /* ⛔ 通关榜排除这一局（用户 2026-10-07 拍板：只认「凿穿 + 已建神学」）。
       * 仍然上报 wonder/cycle ——「建成了什么」不因没建神学而失效。*/
      if (SB.game.submitRankOnBreak) SB.game.submitRankOnBreak(s, r);
      (SB.game.showBreakAnimation || SB.game.showBreakPanel)(r);
      if (emit) emit('本局未达《神学》资格门，不发放轮回点。');
      return r;
    }
    // ① 轮回点（唯一可消费货币）
    meta.tide += r.tidePoints;
    // ② 旧日信仰：本局剩余信仰并入总量
    meta.oldFaith = (meta.oldFaith || 0) + Math.max(0, (s.res && s.res.faith) || 0);
    // ③ 旧日遗迹观光点：首次建成的独特奇观入藏
    var newly = [];
    if (s.wonders && meta.memorialWonders) {
      for (var wid in s.wonders) {
        if (s.wonders[wid] && !meta.memorialWonders[wid]) {
          meta.memorialWonders[wid] = true;
          newly.push(wid);
        }
      }
    }
    r.relicTourism = newly.length;
    // ④ 旧日艺术品 / ⑤ 旧日潮纹碑石：只转完整件数
    r.oldArtwork = Math.floor(Math.max(0, (s.res && s.res.artwork) || 0));
    meta.oldArtworkEarnedTotal = (meta.oldArtworkEarnedTotal || 0) + r.oldArtwork;
    r.oldTideStele = Math.floor(Math.max(0, (s.res && s.res.tidalRecord) || 0));
    meta.oldTideStelesEarnedTotal = (meta.oldTideStelesEarnedTotal || 0) + r.oldTideStele;
    // 首次合格轮回即解锁商店
    if (!meta.shopUnlocked) meta.shopUnlocked = true;
    SB.state.saveMeta(meta);
    /* ✅ 有效通关（已建神学）⇒ 报最快时间 / 综合发展分 / 奇观 / 轮回数。 */
    if (SB.game.submitRankOnBreak) SB.game.submitRankOnBreak(s, r);
    (SB.game.showBreakAnimation || SB.game.showBreakPanel)(r);
    if (emit) emit('轮回结算完成。获得轮回点 ' + r.tidePoints.toFixed(2) + '。');
    return r;
  }

  /* ── 轮回商店 ───────────────────────────────────────────────────────────
   * 分级商品支持「独立逐级定价」：p.costs 为各级单级价数组（价目表 3/6/12 即各单级价、不累计），
   * 买第 k 级扣 costs[k]、须逐级买；单级商品用 p.cost。扣 meta.tide，等级存 meta.perks[id]。 */

  function perkLevel(id) { return (SB.game.meta().perks || {})[id] || 0; }
  function perkDef(id) {
    for (var i = 0; i < SB.PERKS.length; i++) if (SB.PERKS[i].id === id) return SB.PERKS[i];
    return null;
  }
  function perkNextCost(p, lv) {
    if (p.costs) {
      if (p.costs.length > lv) return p.costs[lv];
      /* 2026-10-05 用户拍板「不设上限」：等差曲线数组耗尽后按末两级步长外推。
       * ⚠️ 这同时治好了 g2/g3 只写 1 个价（costs:[6]/[12] 但 n:3）时
       *    第 2/3 级取价回退 p.cost=undefined ⇒ 购买把 tide 减成 NaN 的隐患：
       *    单元素数组按平价续费，不再掉进 undefined。 */
      if (p.costs.length >= 2) {
        var step = p.costs[p.costs.length - 1] - p.costs[p.costs.length - 2];
        return p.costs[p.costs.length - 1] + step * (lv - p.costs.length + 1);
      }
      if (p.costs.length === 1) return p.costs[0];
    }
    return p.cost;
  }
  function perkLocked(p) { return !!p.nest && perkLevel(p.nest) <= 0; }
  function perkState(id) {
    var p = perkDef(id);
    if (!p) return null;
    var lv = perkLevel(id), max = p.n || 1;
    var meta = SB.game.meta();
    var next = perkNextCost(p, lv);
    return {
      perk: p, lv: lv, max: max, next: next,
      done: lv >= max,
      locked: perkLocked(p),
      afford: meta.tide >= next
    };
  }
  function buyPerk(id) {
    var st = perkState(id);
    if (!st || st.done || st.locked || !st.afford) return false;
    var meta = SB.game.meta();
    meta.tide -= st.next;
    meta.spent = (meta.spent || 0) + st.next;
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

  /* 当局是否已建立宗教（**周目内**状态）= 玩家写入了非空宗教名。
   * 与 meta.religionSeen 分工：religionEstablished 管**文案**（底栏按钮）；
   * meta.religionSeen 管**机制**（maybeReligionPopup 永久解锁）。
   * 判据必须与 game.maybeReligionPopup 同源（非空名字 trim 后）。 */
  function religionEstablished(s) {
    return !!(s && s.religionName && s.religionName.trim());
  }

  SB.prestige = {
    breakReport: breakReport,
    doBreak: doBreak,
    qualified: qualified,
    legacy: legacy,
    harmonic: harmonic,
    religionEstablished: religionEstablished,
    perkState: perkState,
    perkLevel: perkLevel,
    perkDef: perkDef,
    perkLocked: perkLocked,
    buyPerk: buyPerk,
    applyPerk: applyPerk
  };
})(typeof window !== 'undefined' ? window : globalThis);
