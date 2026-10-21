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
  /* ERA6–10 星海/新建筑回填（2026-10-19 · docs/ERA9_TECHS_SPEC §9；ERA10 2026-10-20 续）：
   *   旧档 W 只到 5、META_ERA 只到 era5，
   *   导致 era6+ 建筑（科研所/太空建筑/异星建筑/光帆纪建筑）在破壳结算 buildingScore 里被 `if(!e) continue` 静默跳过。
   *   W 续 Fibonacci（1/2/3/5/8/13/21/34/55/89）；META_ERA 按建筑真实纪元回填（researchlab 属 era6，此前漏登；
   *   太阳星环属 era10，2026-10-20 补登——**漏登记 = 玩家花钱建满一座新建筑，发展分一分不涨，且不报错**）。
   *   ⚠️ 具体权重数值属标定范畴（建议值，待用户另拍），但「这些建筑必须登记」是结构性硬要求。 */
  var W = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8, 6: 13, 7: 21, 8: 34, 9: 55, 10: 89 };
  var META_ERA = {
    kelp: 1, nest: 1, coralhouse: 1, siltpit: 1, hall: 1, weir: 1, warmnest: 1, kelpstore: 1, workshop: 1, library: 1,
    ballast: 2, lighthouse: 2, furnace: 2, institute: 2, square: 2, temple: 2,
    hydroturbine: 3, hydroshop: 3, canal: 3,
    observatory: 4, coralfarm: 4, bank: 4, caravanserai: 4, museum: 4,
    hotforge: 5, school: 5, theater: 5, tenement: 5,
    researchlab: 6,
    satellite: 7, spacestation: 7,
    biomatlab: 8, rheamine: 8, titancloud: 8, robotbay: 8,
    mars_workshop: 9, europa_launch: 9,
    /* ERA10（2026-10-20）：太阳星环归纪元十。⚠️ 与 W[10] 必须同时登记：
     *   只加 META_ERA ⇒ W[10] 为 undefined ⇒ buildingScore 变 NaN（比跳过更糟）。
     * ERA10 市政（2026-10-20）：泰拉/恩克拉多斯星轨道发射场 + 虚境祭坛同样归纪元十
     *   （虚境祭坛虽是"无产出"建筑，但它吃 30 人口/级，理应在发展分里算数）。 */
    solar_ring: 10, terra_launch: 10, enceladus_launch: 10, void_altar: 10
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
    var starPerkBoost = 1 + ((m.starPerks && m.starPerks.starInfinite) || 0);
    function finiteOr(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
    return {
      relicCount: relicCount,
      relicCultureMul: 1 + 0.01 * relicCount,
      relicScienceMul: 1 + 0.01 * relicCount,
      oldArtworkCultureRate: 0.15 * harmonic(finiteOr(m.oldArtworkEarnedTotal, 0)),
      oldTideSteleScienceRate: 0.15 * harmonic(finiteOr(m.oldTideStelesEarnedTotal, 0)),
      oldFaithAllProductionBonus: 0.005 * faithTier,
      shopCivicBonus: 0.10 * (p.civicArchive || 0) * starPerkBoost,   // 星屑轮回共鸣放大每级效果
      shopScienceBonus: 0.10 * (p.tideProof || 0) * starPerkBoost,
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
    var challengeCompletions = SB.challenges ? SB.challenges.completedCount(SB.game.meta()) : 0;
    var pointMul = 1 + challengeCompletions * 0.1;
    return {
      P: P, popScore: popScore, buildingScore: bScore,
      craftScore: w.score, workshopCount: w.count, developmentScore: dev,
      q: q, shellFactor: shellFactor,
      baseTidePoints: earned, challengePointMul: pointMul,
      tidePoints: earned * pointMul,
      /* 星屑预估与最终入账共用同一份结算报告。 */
      stardust: qualified(s) ? stardustGain(s) : 0,
      relicTourism: 0, oldArtwork: 0, oldTideStele: 0,
      locked: false
    };
  }

  /* 执行结算并写入跨周目账本。emit 用于日志。
   * 未达资格门：轮回点与星屑归 0、不发放遗产、不解锁商店（与「普通重开」同口径）。 */
  function doBreak(s, emit, options) {
    options = options || {};
    if (s.breakSettled) return null;
    var meta = SB.game.meta();
    var r = breakReport(s);
    /* 破壳结算只允许进入一次；否则主循环在 shell<=0 时会每 100ms 重播结算/动画。 */
    s.broken = true;
    s.shellOpened = true;
    s.breakSettled = true;
    /* runBuffs（单局 buff，如旧日遗产自动制作标记等）在破壳结算这一刻清零：
     *   无论随后轮回（freshRun 重建 runBuffs）还是留在本局继续，效果都从结算这一刻起失效。 */
    s.runBuffs = {};
    if (!qualified(s)) {
      r.tidePoints = 0;
      r.locked = true;
      if (s.shell <= 0 && SB.challenges) {
        var unqualifiedChallengeOutcome = SB.challenges.resolveRun(s, meta);
        if (unqualifiedChallengeOutcome && unqualifiedChallengeOutcome.failed) r.challengeFailure = unqualifiedChallengeOutcome;
      }
      /* ⛔ 通关榜排除这一局（用户 2026-10-07 拍板：只认「凿穿 + 已建神学」）。
       * 仍然上报 wonder/cycle ——「建成了什么」不因没建神学而失效。*/
      if (SB.game.submitRankOnBreak) SB.game.submitRankOnBreak(s, r);
      if (SB.state && SB.game.snapshot && SB.game.run && SB.game.run() === s)
        SB.state.saveRun(SB.game.snapshot(s));
      /* 动画属于「壳归零」事件，由 shell.onShellZero 唯一触发。
       * 手动提前重开/轮回只展示结算，不把它伪装成凿穿天壳。 */
      if (!options.silent) (SB.game.showBreakPanel || SB.game.showBreakAnimation)(r);
      if (emit) emit('本局未达《神学》资格门，不发放轮回点。');
      return r;
    }
    // ① 轮回点（唯一可消费货币）
    /* ERA6 市政《文明构造》：拥有则**本轮回**轮回点 +20%（拥有当轮 tidePoints ×1.2，
     * 不跨周目累积）。在写入 meta.tide 之前乘，与「本局结算」口径一致；未拥有 = 不乘。 */
    if (s.civics && s.civics.civilization) r.tidePoints *= 1.2;
    meta.tide += r.tidePoints;
    meta.tideEarnedTotal = (meta.tideEarnedTotal || 0) + r.tidePoints;
    /* 挑战必须完成《神学》资格并真正凿穿天壳；普通结算/重开不兑现挑战奖励。 */
    if (s.shell <= 0 && SB.challenges) {
      var challengeOutcome = SB.challenges.resolveRun(s, meta);
      if (challengeOutcome && challengeOutcome.failed) r.challengeFailure = challengeOutcome;
      else r.challengeClear = challengeOutcome;
    }
    // ② 旧日信仰：本局剩余信仰并入总量
    /* ERA8 市政《信仰回响》（2026-10-18 用户表解锁2）：本轮回入账 ×1.2（仅当轮，不跨周目累积）。 */
    meta.oldFaith = (meta.oldFaith || 0)
      + Math.max(0, (s.res && s.res.faith) || 0) * ((s.civics && s.civics.faith_echo) ? 1.2 : 1);
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
    // ⑥ 星屑：轨道与异星设施等级、星空探索进度和戴森球进度共同决定本轮结算。
    var _sd = r.stardust || 0;
    r.stardust = _sd;
    meta.stardust = (meta.stardust || 0) + _sd;
    meta.stardustEarned = (meta.stardustEarned || 0) + _sd;
    if (s.got) s.got.stardust = meta.stardustEarned;
    // 首次合格轮回即解锁商店
    if (!meta.shopUnlocked) meta.shopUnlocked = true;
    /* TapTap 成就：合格破壳时解锁「首次轮回」与挑战通关（幂等，靠 meta.achievements 去重）。 */
    if (SB.achv && SB.achv.onBreak) SB.achv.onBreak(r, meta);
    SB.state.saveMeta(meta);
    if (SB.state && SB.game.snapshot && SB.game.run && SB.game.run() === s)
      SB.state.saveRun(SB.game.snapshot(s));
    /* ✅ 有效通关（已建神学）⇒ 报最快时间 / 综合发展分 / 奇观 / 轮回数。 */
    if (SB.game.submitRankOnBreak) SB.game.submitRankOnBreak(s, r);
    /* 破壳动画已由 shell.onShellZero 播放；这里可能是未破壳就主动轮回，不能再播放动画。 */
    if (!options.silent) (SB.game.showBreakPanel || SB.game.showBreakAnimation)(r);
    if (emit) emit('轮回结算完成。获得轮回点 ' + r.tidePoints.toFixed(2) + '、星屑 ' + _sd + '。');
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

  function stardustFacilityLevels(s) {
    var n = 0, buildings = SB.BUILDINGS || [];
    for (var i = 0; i < buildings.length; i++) {
      if (buildings[i].stardustFacility) n += Math.max(0, (s.lvl && s.lvl[buildings[i].id]) || 0);
    }
    return n;
  }
  function stardustGain(s) {
    var levels = stardustFacilityLevels(s);
    var starPct = (SB.CFG.STAR_CAP > 0) ? Math.min(1, ((s.res && s.res.starExplore) || 0) / SB.CFG.STAR_CAP) : 0;
    var dysonPct = SB.economy && SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0;
    var mul = (1 + starPct) * (1 + 0.5 * dysonPct);
    if (s.civics && s.civics.ancestor_heritage) mul *= 1.2;
    if (s.civics && s.civics.star_ruins) mul *= 1 + 0.01 * levels;
    if (s.techs && s.techs.heir_of_stars) mul *= 2;
    return Math.floor(levels * 0.1 * mul);
  }
  function starPerkDef(id) {
    var defs = SB.STAR_PERKS || [];
    for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i];
    return null;
  }
  function starPerkState(id) {
    var p = starPerkDef(id);
    if (!p) return null;
    var meta = SB.game.meta();
    var levels = meta.starPerks || {};
    var lv = levels[id] || 0;
    var next = p.costs ? p.costs[lv] : (p.cost || 0) + (p.costStep || 0) * lv;
    return { perk: p, lv: lv, max: p.n || 1, next: next,
      done: lv >= (p.n || 1), afford: (meta.stardust || 0) >= next };
  }
  function buyStarPerk(id) {
    var st = starPerkState(id);
    if (!st || st.done || !isFinite(st.next) || !st.afford) return false;
    var meta = SB.game.meta();
    if (!meta.starPerks || typeof meta.starPerks !== 'object') meta.starPerks = {};
    meta.stardust -= st.next;
    meta.starPerks[id] = st.lv + 1;
    var s = SB.game.run();
    if (s && s.perk) {
      var a = st.perk.apply || {};
      for (var k in a) s.perk[k] = (s.perk[k] || 0) + a[k];
    }
    SB.state.saveMeta(meta);
    return true;
  }
  function exchangeTideForStardust() {
    var meta = SB.game.meta();
    if (!meta || (meta.tide || 0) < 10) return false;
    meta.tide -= 10;
    meta.spent = (meta.spent || 0) + 10;
    meta.stardust = (meta.stardust || 0) + 1;
    SB.state.saveMeta(meta);
    return true;
  }
  function exchangeStardustForTide() {
    var meta = SB.game.meta();
    if (!meta || (meta.stardust || 0) < 1) return false;
    meta.stardust -= 1;
    meta.tide = (meta.tide || 0) + 10;
    SB.state.saveMeta(meta);
    return true;
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

  /* 自动研究购买后默认关闭，由玩家在轮回商店单独切换；开关跨周目保留。 */
  function toggleAutoResearch(kind) {
    if (kind !== 'tech' && kind !== 'civic') return null;
    var m = SB.game && SB.game.meta ? SB.game.meta() : null;
    if (!m || !m.perks) return null;
    var perkId = kind === 'tech' ? 'autoStudy' : 'autoCivic';
    if (!(m.perks[perkId] > 0)) return null;
    if (!m.autoResearch || typeof m.autoResearch !== 'object') m.autoResearch = { tech: false, civic: false };
    m.autoResearch[kind] = !m.autoResearch[kind];
    SB.state.saveMeta(m);
    return m.autoResearch[kind];
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
    stardustFacilityLevels: stardustFacilityLevels,
    stardustGain: stardustGain,
    starPerkDef: starPerkDef,
    starPerkState: starPerkState,
    buyStarPerk: buyStarPerk,
    exchangeTideForStardust: exchangeTideForStardust,
    exchangeStardustForTide: exchangeStardustForTide,
    applyPerk: applyPerk,
    toggleAutoResearch: toggleAutoResearch
  };
})(typeof window !== 'undefined' ? window : globalThis);
