(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  /* ══ 传承（Heritage）══════════════════════════════════════════════════
   * 吞并敌国后从「政策卡」里三选一抽取一张 **身份**，由本模块单独模拟出同等加成。
   *
   * ⚠️ 三条不可协商的口径：
   *   1. 传承 **不写 s.cards** —— 政策卡槽 / 装填收费 / 退役链 / AI bot /
   *      《安那其主义》「全程不得装备政策卡」判据全部不受影响。
   *   2. 传承 **不读 s.civics**（影子态屏蔽）⇒ 抽到后永不退役。
   *      退役由「完成 retiredBy 市政」触发，与这张卡来自哪个纪元无关。
   *   3. 效果数值 **唯一来源是 SB.POLICIES 的字段**，不另抄一份常数，
   *      否则日后改政策卡数值必然两套漂移。
   *
   * 效果接线见本文件末段 install()：运行时包装 SB.civic 的效果出口，
   * 产线（economy-tick / economy-social / workshop / prestige）一行不改。
   * ═══════════════════════════════════════════════════════════════════ */

  /* 七阶敌国 → 政策卡纪元窗（含端点）。ENEMIES 里没有 era 字段，这是本系统新造的表。 */
  var WINDOWS = [[1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9]];
  var ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];

  /* 卡面文案：只删「退役 / 取代 / 装卡槽 / 卸下」语境，效果文字与数值一字不动。
   * ⚠️ 绝不改 POLICIES[].desc —— 政策卡 UI 也读它，那些描述对政策卡本身是正确的。
   *    读不到本表时 fallback 到原 desc。 */
  var HERITAGE_DESC = {
    card_craft: '工坊效率 +20%（工艺制作产出）。',
    card_mystic: '科技产出 +0.3/秒。',
    card_town_meeting: '人口上限 +3，人口生产时间 −50%。',
    card_drama: '广场的市政点乘区 ×2（即「广场效果 +100%」）。',
    card_theology: '神庙的信仰产出乘区 ×2（即「神庙效果 +100%」）。',
    card_records: '潮纹馆的科技加成 ×2（即「图书馆效果」翻倍，不含研究所那一份）。',
    card_sovereign: '城堡每级增加 10% 信仰产出。',
    card_monastery: '人口产出信仰 +50%。',
    card_serfdom: '每级牧场给藻场效果 +1%，每级藻场给牧场效果 +1%（互乘）。',
    card_market: '仓储区所有建筑的仓储 +100%（即海藻仓/压舱仓/灯塔的容量贡献翻倍）。',
    card_guild: '工坊效率 +40%。',
    card_divine_right: '礁栖核心所有建筑每级 +10% 信仰产出。',
    card_mercantilism: '银行的商人产出加成 +100%。',
    card_mercenary: '军营提供的军力加成 +100%。',
    card_fleet_review: '军营提供的军力加成 +150%。',
    card_official_business: '根据商路等级大幅降低战争行动的军力消耗。',
    card_enlightenment: '潮纹馆、大学的科技加成 +100%，神庙信仰加成 −50%。',
    card_rationing: '幸福度 −1；工坊（工艺制作）效率 +40%。',
    card_political_econ: '广场的市政点乘区 ×2.5、歌剧院的官员市政点乘区 ×2.5。',
    card_logistics: '仓储区建筑容量 ×3。',
    card_city_supply: '人口上限 +5，人口生产时间 −50%。',
    card_mobilization: '每点闲置鲛人 +1% 破壳系数（破壳速度随之提升）。',
    card_massmedia: '每名鲛人 +0.5 市政点/秒；但奢侈品消耗 +50%。',
    card_national_solidarity: '工坊效率 +80%。',
    card_public_share: '所有人口建筑（巢/珊瑚屋/廉租社区）每级 +0.5 人口上限；奢侈品消耗 +100%。',
    card_live_comp: '体育场额外产出 = 人口数 × 体育场等级 的市政点/秒（需建造体育场）。',
    card_no_god_here: '潮纹馆科技 ×3、研究所科技 ×3、神庙信仰 −50%、星空观测站产出 ×1.5。',
    card_transnational: '银行的商人产出加成 ×4。',
    card_future_theology: '神庙信仰 ×5、科技产出 −30%。',
    card_interlog: '仓储区建筑容量 ×5。',
    card_we_are_here: '礁栖核心、星海区所有建筑每级 +10% 信仰产出。',
    card_social_network: '每名鲛人 +3 市政点/秒；但奢侈品消耗 +80%。',
    card_fever: '星空探索速率 +x%，x = 人口数（%）。',
    card_federal_privy: '广场的市政点乘区 ×4、歌剧院的官员市政点乘区 ×4。',
    card_egal_work: '工艺效率 +140%、幸福度 −2。',
    card_transcendence: '科技产出 +300/秒。',
    card_brilliant_star_map: '人口信仰产出 −50%、科技产出 ×3.5。',
    card_corvee: '纪元 1–3 奇观建造消耗 −20%。',
    card_royal_charter: '纪元 1–5 奇观建造消耗 −20%。'
  };

  /* ── 池 ──────────────────────────────────────────────────────────────── */
  var eraMap = null;
  function civicEraMap() {
    if (eraMap) return eraMap;
    eraMap = {};
    var C = SB.CIVICS || [];
    for (var i = 0; i < C.length; i++) eraMap[C[i].id] = C[i].era;
    return eraMap;
  }
  function policyById(id) {
    var P = SB.POLICIES || [];
    for (var i = 0; i < P.length; i++) if (P[i].id === id) return P[i];
    return null;
  }
  function isPoolCard(p) {
    /* 7 张水体污染挑战专属卡在普通局效果恒 0；locked 永恒卡语义冲突。
     * ERA10 三张按用户定案「阶 Ⅶ 就 7-9」明确弃用。 */
    if (!p || p.challengeOnly || p.locked) return false;
    var era = civicEraMap()[p.civic];
    return typeof era === 'number' && era >= 1 && era <= 9;
  }
  function poolIds() {
    var out = [], P = SB.POLICIES || [];
    for (var i = 0; i < P.length; i++) if (isPoolCard(P[i])) out.push(P[i].id);
    return out;
  }
  function windowOf(stage) { return WINDOWS[stage - 1] || null; }
  function poolForStage(stage) {
    var w = windowOf(stage), em = civicEraMap(), out = [], P = SB.POLICIES || [];
    if (!w) return out;
    for (var i = 0; i < P.length; i++) {
      var p = P[i], era = em[p.civic];
      if (isPoolCard(p) && era >= w[0] && era <= w[1]) out.push(p.id);
    }
    return out;
  }

  /* ── 状态 ────────────────────────────────────────────────────────────── */
  function freshHeritage() { return { owned: [], pending: [] }; }
  function ensure(s) {
    if (!s) return freshHeritage();
    if (!s.war) s.war = {};
    var h = s.war.heritage;
    if (!h || typeof h !== 'object') h = s.war.heritage = freshHeritage();
    if (!Array.isArray(h.owned)) h.owned = [];
    if (!Array.isArray(h.pending)) h.pending = [];
    return h;
  }
  function ownedRecords(s) { return ensure(s).owned; }
  function ownedIds(s) {
    var a = ownedRecords(s), out = [], i;
    for (i = 0; i < a.length; i++) {
      var id = (typeof a[i] === 'string') ? a[i] : (a[i] && a[i].id);
      if (id) out.push(id);
    }
    return out;
  }
  function has(s, id) {
    var a = ownedRecords(s);
    for (var i = 0; i < a.length; i++) {
      var v = (typeof a[i] === 'string') ? a[i] : (a[i] && a[i].id);
      if (v === id) return true;
    }
    return false;
  }
  function pendingOf(s) { return ensure(s).pending; }
  function stageOf(record, index) {
    if (record && typeof record.stage === 'number') return record.stage;
    return index + 1;
  }

  /* ── 抽榜 ────────────────────────────────────────────────────────────── */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function takenIds(s) {
    var taken = {}, owned = ownedIds(s), pend = pendingOf(s), i, j;
    for (i = 0; i < owned.length; i++) taken[owned[i]] = true;
    for (i = 0; i < pend.length; i++) {
      var opts = pend[i] && pend[i].options;
      if (Array.isArray(opts)) for (j = 0; j < opts.length; j++) taken[opts[j]] = true;
    }
    return taken;
  }
  /* 吞并成功时发一榜。7 榜全堆也验过每榜凑得满 3 张（池最窄 19 张）。 */
  function onAnnex(s, stage) {
    if (!s) return null;
    var h = ensure(s), taken = takenIds(s), pool = poolForStage(stage), avail = [], i;
    for (i = 0; i < pool.length; i++) if (!taken[pool[i]]) avail.push(pool[i]);
    shuffle(avail);
    var options = avail.slice(0, 3);
    if (!options.length) return null;
    h.pending.push({ stage: stage, options: options });
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    return h.pending[h.pending.length - 1];
  }
  /* 选卡统一入口：UI 只负责调，逻辑不散在 input / render 两处。 */
  function choose(s, pendingIndex, cardId) {
    var h = ensure(s), pend = h.pending;
    if (pendingIndex < 0 || pendingIndex >= pend.length) return false;
    var d = pend[pendingIndex];
    if (!d || !Array.isArray(d.options) || d.options.indexOf(cardId) < 0) return false;
    if (has(s, cardId)) return false;
    var st = (typeof d.stage === 'number' && d.stage >= 1 && d.stage <= 7)
      ? d.stage : (pendingIndex + 1);
    h.owned.push({ id: cardId, stage: st });
    /* 逐榜各选一次；移除该榜即释放另外 2 张占位，避免池泄漏。 */
    pend.splice(pendingIndex, 1);
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    return true;
  }
  function descOf(id) {
    if (Object.prototype.hasOwnProperty.call(HERITAGE_DESC, id)) return HERITAGE_DESC[id];
    var p = policyById(id);
    return (p && p.desc) || '';
  }
  function nameOf(id) { var p = policyById(id); return (p && p.name) || id; }
  function roman(stage) { return ROMAN[stage - 1] || String(stage); }
  function maxStage() { return 7; }

  /* ── 效果接线 ──────────────────────────────────────────────────────────
   * 所有政策卡效果最终都通过 SB.civic 的汇总函数出口被产线读取，而这些函数
   * 内部一律「逐槽扫 s.cards + cardEffective(s,id)」。
   *
   * ⇒ 包装法：临时把 s.cards 换成「政策卡 + 传承卡」、s.civics 换成空对象
   *   （让 cardRetired 恒 false ⇒ 传承永不退役），调原函数两次取增量：
   *     extra = f(政策卡+传承, 无退役) − f(政策卡, 无退役)
   *   再叠加到权威值 f(真 s) 上。
   *
   *   为什么「加法增量」对乘区函数也成立：设政策卡乘区 P、传承乘区 H，
   *   则 baseP = P、total = P×H、real = P ⇒ real + (total − baseP) = P×H ✓
   *   对求和函数：baseP = A、total = A+B、real = A ⇒ A + B ✓
   *   一个公式同时覆盖乘区与加值，且无除零风险（cardSciToCivic 空卡=0）。
   *
   * ⚠️ 退役防护靠两件事同时成立：
   *    ① 两次影子调用屏蔽 s.civics ⇒ 传承卡（哪怕原 policy 带 retiredBy）永不退役；
   *    ② baseCards 先按真 s 的 cardEffective 过滤 ⇒ 已退役的政策卡不会在影子态「复活」，
   *       否则 baseP 与 real 的生效集分叉、乘区增量算错。政策卡部分始终由 real 决定。
   * ⚠️ s.__heritageBusy 是重入哨兵：若某出口内部又调了另一个包装出口，
   *    内层直接透传，避免同一份加成被叠两次。
   * ⚠️ 无传承卡时直接透传 real，零额外开销。
   * ═══════════════════════════════════════════════════════════════════ */
  var EFFECT_FNS = [
    'flow', 'govCraftRatio', 'cardCraftRatio', 'govLuxuryMul', 'govHappyBonus', 'govBuildCostMul',
    'storeMul', 'castleFaithMul', 'serfKelpMul', 'serfWarmMul',
    'squareMul', 'templeMul', 'libraryMul', 'theaterMul',
    'govHappyConsumeMul', 'canalSaveMul', 'bankMerchantMul', 'coreFaithMul', 'universityMul',
    'templeFaithMul', 'museumCivicMul', 'scribeCivicMul', 'theaterCivicMul',
    'cardCivicOutMul', 'cardSciOutMul', 'cardHydroMul', 'cardHappyOffset', 'cardHappyOffsetFor',
    'cardLuxConsumeMul', 'cardPopCapFlat', 'cardPopGrowthTimeMul', 'cardJobOutMul',
    'cardSpaceBuildSave', 'cardObsSciMul', 'stadiumCivic', 'cardWonderLuxSaveMul',
    'civicPerPop', 'popCapPerPopBldg', 'cardVrCraftRatio',
    'dynFaithCardMul', 'cardFeverStarMul', 'cardPlanetOutMul',
    'govAllOutMul', 'govFaithMul', 'govOldFaithMul',
    'cardResOutMul', 'cardPopFaithMul', 'cardBreakCoefMul', 'cardWonderBuildSave',
    'cardWonderBuildSaveEra', 'cardFoodOutMul', 'cardCompanyBonusMul', 'cardBreakStardustMul',
    'cardSciToCivic', 'cardFaithAllProdDouble', 'cardCraftRatioRecipes',
    'cardLaunchCycle', 'cardLaunchHydroMul', 'cardFaithOutMul', 'cardHappyConsumeMul',
    'cardOurSeaCraftMul'
  ];
  function toArgs(args) {
    var a = [], i;
    for (i = 0; i < args.length; i++) a[i] = args[i];
    return a;
  }
  var shadowBusy = false;
  function shadowCall(fn, s, args, cards) {
    var oc = s.cards, ov = s.civics, ob = shadowBusy;
    s.cards = cards; s.civics = {}; shadowBusy = true;
    try { return fn.apply(null, args); }
    finally { s.cards = oc; s.civics = ov; shadowBusy = ob; }
  }
  /* ⚠️ 唯一特例：cardCraftRatio 走 cardOwned（要求 s.civics[p.civic] 已完成），
   * 不是 cardEffective。影子态 civics 置空会把它拦成 0 ⇒ 传承《技艺》加工坊效率失效。
   * 这里直接按 POLICIES 字段算加法增量（数值源仍是同一张表），不走影子。 */
  var SPECIAL_SUM = {
    cardCraftRatio: function (s, owned) {
      var add = 0, i, p;
      for (i = 0; i < owned.length; i++) {
        p = policyById(owned[i]);
        if (!p) continue;
        if (typeof p.craftRatio === 'number') add += p.craftRatio;
        if (typeof p.craftPerPop === 'number') add += p.craftPerPop * (s.pop || 0);
      }
      return add;
    }
  };
  function combine(real, baseP, total) {
    if (real && typeof real === 'object' && !Array.isArray(real)
        && total && typeof total === 'object' && !Array.isArray(total)) {
      var out = {}, k, bp = (baseP && typeof baseP === 'object') ? baseP : {};
      for (k in real) if (Object.prototype.hasOwnProperty.call(real, k)) out[k] = real[k];
      for (k in total) {
        if (!Object.prototype.hasOwnProperty.call(total, k)) continue;
        var rv = (typeof out[k] === 'number') ? out[k] : 0;
        var tv = (typeof total[k] === 'number') ? total[k] : 0;
        var bv = (typeof bp[k] === 'number') ? bp[k] : 0;
        out[k] = rv + (tv - bv);
      }
      return out;
    }
    if (typeof real !== 'number' || typeof baseP !== 'number' || typeof total !== 'number') return real;
    return real + (total - baseP);
  }
  function wrap(name, fn) {
    return function () {
      var s = arguments[0];
      if (!s) return fn.apply(null, arguments);
      var real = fn.apply(null, arguments);
      if (shadowBusy) return real;
      var owned = ownedIds(s);
      if (!owned.length) return real;
      if (SPECIAL_SUM[name]) return real + SPECIAL_SUM[name](s, owned);
      /* ⚠️ 必须剔除「真 s 下不生效」的政策卡（尤其是已退役但仍残留 s.cards 的脏档）：
       *    影子态把 s.civics 置空会让这些卡复活 ⇒ baseP 的生效集与 real 分叉，
       *    乘区函数的加法增量随之算错（实测《戏剧与诗歌》退役残留时 squareMul 出 3 而非 2）。
       *    cardEffective 是政策卡系统统一判据（civics.js），此处复用而非自己写 indexOf。 */
      var baseCards = [], rawCards = Array.isArray(s.cards) ? s.cards : [], bi, cid;
      for (bi = 0; bi < rawCards.length; bi++) {
        cid = rawCards[bi];
        if (!cid) continue;
        if (SB.civic && typeof SB.civic.cardEffective === 'function'
            && !SB.civic.cardEffective(s, cid)) continue;
        baseCards.push(cid);
      }
      var allCards = baseCards.concat(owned);
      var args = toArgs(arguments);
      var baseP = shadowCall(fn, s, args, baseCards);
      var total = shadowCall(fn, s, args, allCards);
      return combine(real, baseP, total);
    };
  }
  function install() {
    var C = SB.civic;
    if (!C) return 0;
    var n = 0;
    for (var i = 0; i < EFFECT_FNS.length; i++) {
      var k = EFFECT_FNS[i];
      if (typeof C[k] === 'function' && !C[k].__heritageWrapped) {
        var w = wrap(k, C[k]);
        w.__heritageWrapped = true;
        C[k] = w;
        n++;
      }
    }
    return n;
  }

  SB.heritage = {
    WINDOWS: WINDOWS, ROMAN: ROMAN, HERITAGE_DESC: HERITAGE_DESC,
    freshHeritage: freshHeritage, ensure: ensure,
    ownedRecords: ownedRecords, ownedIds: ownedIds, has: has,
    pendingOf: pendingOf, poolIds: poolIds, poolForStage: poolForStage, windowOf: windowOf,
    onAnnex: onAnnex, choose: choose, takenIds: takenIds,
    descOf: descOf, nameOf: nameOf, roman: roman, maxStage: maxStage,
    policyById: policyById, isPoolCard: isPoolCard,
    EFFECT_FNS: EFFECT_FNS, install: install, combine: combine
  };
  install();
})(typeof window !== 'undefined' ? window : globalThis);
