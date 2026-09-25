/* 天壳 / SHELLBREAK — 经济层
 * 每 tick 结算产出/消耗，顺序即平衡：
 *   采集 → 加工 → 地热 → 学问 → 口粮 → 生育 → 冻伤 → 天壳
 * 地热排在祭坛消耗之前，保证「先产后烧」；仓储上限在每个 add 处即时生效，
 * 超限部分直接浪费（S2：囤积不再是无收益的）。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG, SEASONS = SB.SEASONS, UNIT = SB.UNIT, BLD = SB.BLD;

  function fmt(n) {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return Math.floor(n).toLocaleString('en-US');
  }

  // ---- 派生量（只读） ----
  function rOf(s) { return s.iceShell > 0 ? s.shell / s.iceShell : 0; }
  // <= 而非 <：基础削壳会精确 clamp 在 FLOOR_AT，用 < 会造成「卡在 25% 却仍判定为未冻」的错位
  function isCold(s) { return rOf(s) <= CFG.FRAGILE_AT; }
  function houseCap(s) { return BLD.houseBase + s.lvl.nest * BLD.house; }
  function lvlSum(s) {
    var n = 0; for (var k in s.lvl) n += s.lvl[k]; return n;
  }
  function seasonIdx(t) { return Math.floor(t / CFG.SEASON_TICKS) % 4; }
  function season(t) { return SEASONS[seasonIdx(t)]; }

  // ---- 仓储（S2）----
  // 未在 CAP_BASE 中的资源（学问 / 地热）为无限，不设浪费判定。
  function capOf(s, k) {
    if (!CFG.CAP_BASE[k]) return Infinity;
    /* 菌毯例外：上限只由压舱仓给。若它照旧吃 CAP_PER_LVL 的全局增量，
     * 「多盖任何一座建筑」就等于谷仓，「储」这个旋钮会被稀释成不存在。
     * 这也是 CAP_BASE.kelp 能从 1200 压到 200 的前提——否则菌毯永远填不满。 */
    if (k === 'kelp') return CFG.CAP_BASE.kelp + (s.lvl.ballast || 0) * BLD.kelpCap;
    return CFG.CAP_BASE[k] + lvlSum(s) * CFG.CAP_PER_LVL;
  }
  function addRes(s, k, v) {
    if (v <= 0) return;
    var c = capOf(s, k);
    s.res[k] = Math.min(c, s.res[k] + v);
  }

  // 单级增量成本。递增系数是建筑自己的 `ratio`（猫国 priceRatio），不是全局常数——
  // 住房 2.5 贵到买不动，产能建筑 1.12 便宜到可以一路铺开，这是两条不同的曲线。
  function costOf(s, id) {
    var b = null;
    for (var i = 0; i < SB.BUILDINGS.length; i++) if (SB.BUILDINGS[i].id === id) b = SB.BUILDINGS[i];
    var n = s.lvl[id] || 0, o = {};
    for (var k in b.cost) o[k] = Math.ceil(b.cost[k] * Math.pow(b.ratio, n));
    return o;
  }
  function costTxt(c) {
    var out = [];
    for (var k in c) out.push(SB.RESS[k].name + ' ' + fmt(c[k]));
    return out.join(' + ');
  }
  function canAfford(s, c) {
    for (var k in c) if (s.res[k] < c[k]) return false;
    return true;
  }
  function pay(s, c) { for (var k in c) s.res[k] -= c[k]; }

  // 采集倍率：礁石平台 + 深潜 + 洋流增益
  function gatherMul(s) {
    return (1 + s.lvl.reef * BLD.reefMul)
      * (s.techs.dive ? 1.2 : 1)
      * (1 + 0.10 * (s.perk.gather || 0));
  }
  function warmCap(s) {
    return Math.min(0.5, s.lvl.hearth * BLD.warm + (s.techs.heat ? 0.15 : 0));
  }
  // 口粮消耗：保温巢省耗（−2%/级，封顶 60%）。渲染层用同一个函数标红，
  // 两处各算一遍就会出现「面板说够吃、实际在饿死」。
  function foodUse(s) {
    var save = Math.min(BLD.foodSaveCap, (s.lvl.warmnest || 0) * BLD.foodSave);
    return s.pop * CFG.FOOD_PER * (1 - save);
  }
  // 菌毯产出：菌圃基准 × 喷口导流堤（+3%/级）× 季节 × 环境系数
  function foodRate(s, cold) {
    return s.lvl.kelp * BLD.food * (1 + (s.lvl.weir || 0) * BLD.foodWeir) * season(s.t).mult * (cold || 1);
  }
  // 地热产出：热泉井 × 匠人 × 环境系数 × 点火术
  function fuelRate(s, cold) {
    if (s.lvl.geyser <= 0) return 0;
    return s.lvl.geyser * BLD.fuel * s.jobs.craft * cold * (s.techs.ignition ? 1.4 : 1);
  }

  function tick(s, dt, emit) {
    if (s.broken) return;
    s.t += dt;

    var cold = isCold(s) ? 0.6 : 1;
    var j = s.jobs;

    // 1) 采集
    addRes(s, 'coral', j.gather * UNIT.coral * gatherMul(s) * cold);
    addRes(s, 'silt', j.gather * UNIT.silt * gatherMul(s) * cold);

    // 2) 加工（匠人驱动，受环境系数）
    if (s.lvl.workshop > 0 && j.craft > 0) {
      var bc = Math.min(UNIT.bone * (s.techs.bonework ? 1.3 : 1) * j.craft * cold, s.res.coral);
      s.res.coral -= bc; addRes(s, 'bone', bc);
    }
    if (s.lvl.furnace > 0 && j.craft > 0) {
      var fc = Math.min(UNIT.iron * (s.techs.smelt ? 1.4 : 1) * j.craft * cold, s.res.silt);
      s.res.silt -= fc; addRes(s, 'iron', fc);
    }

    // 3) 地热（排在祭坛消耗之前，先产后烧）
    if (j.craft > 0) addRes(s, 'fuel', fuelRate(s, cold) * dt);

    // 4) 学问
    s.res.science += j.scholar * UNIT.sci + s.lvl.library * BLD.sci;

    // 5) 口粮（产/增/省/储四件事都在这里汇合）
    addRes(s, 'kelp', foodRate(s, cold));
    s.res.kelp -= foodUse(s);
    if (s.res.kelp < 0) {
      s.res.kelp = 0;
      s.famine++;
      if (s.famine >= 60 && s.pop > 1) {
        s.pop--; s.famine = 0; s.famineDeaths++;
        SB.folk.reconcile(s);   // 减员后超额职业位退回闲置池
        if (emit) emit('菌毯耗尽，有人饿死了。');
      }
    } else s.famine = 0;

    // 6) 生育（必须有余粮余房）
    if (s.res.kelp > CFG.GROW_KEEP && s.pop < houseCap(s)) {
      s._grow += dt;
      if (s._grow >= CFG.GROW_NEED) { s._grow = 0; s.pop++; }
    } else s._grow = 0;
    s.peak = Math.max(s.peak, s.pop);

    // 7) 冻伤（仅冰封期）
    if (cold < 1) {
      s.coldTicks += dt;
      var risk = CFG.FREEZE_CHANCE * (1 - warmCap(s) * 2) * dt;
      if (s.pop > 1 && risk > 0 && Math.random() < risk) {
        s.pop--; s.frostDeaths++;
        SB.folk.reconcile(s);   // 减员后超额职业位退回闲置池
        if (emit) emit('冰封期冻死了一名族民。');
      }
    }

    // 8) 天壳推进（基础削壳 + 祭坛削壳）
    SB.shell.tickShell(s, dt, emit);
  }

  SB.economy = {
    fmt: fmt,
    rOf: rOf, isCold: isCold, houseCap: houseCap, lvlSum: lvlSum,
    seasonIdx: seasonIdx, season: season,
    capOf: capOf, addRes: addRes,
    costOf: costOf, costTxt: costTxt, canAfford: canAfford, pay: pay,
    gatherMul: gatherMul, warmCap: warmCap, fuelRate: fuelRate,
    foodUse: foodUse, foodRate: foodRate,
    tick: tick
  };
})(typeof window !== 'undefined' ? window : globalThis);
