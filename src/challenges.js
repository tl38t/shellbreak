/* 天壳 / SHELLBREAK — 轮回挑战
 * 挑战定义、限制与永久奖励集中在此；页面只渲染本模块提供的数据，规则入口复用它。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  var DEFINITIONS = [
    { id: 'cold', name: '寒流禁火', icon: '❄', badge: 'assets/challenges/challenge-cold.webp', kind: '单次挑战',
      summary: '寒流压境，保温法停用，暖石产出降低。',
      rule: '寒流季禁止启用保温法；本轮暖石产出 -30%',
      reward: '永久暖石产出 +20%', tiers: [{ label: '完成挑战', cap: null }] },
    { id: 'small', name: '小国寡民', icon: '◉', badge: 'assets/challenges/challenge-small.webp', kind: '单次挑战',
      summary: '人口上限 15，忽略科技与市政中的人口门槛。',
      rule: '人口不得超过 15；科技与市政的总人口、职业人数门槛豁免', reward: '永久初始人口 +3 · 生育时间 -50%',
      tiers: [{ label: '完成挑战', cap: 15 }] },
    { id: 'science', name: '忽视科文', icon: '⌘', badge: 'assets/challenges/challenge-science.webp', kind: '三档挑战',
      summary: '限制学者与书手人数，考验基础经营。',
      rule: '学者与书手岗位人数各不得超过本档上限',
      rewards: ['科文产出 +50%', '科文产出 +100%', '科文产出 +200%'],
      tiers: [
        { label: '第一档', cap: 15 },
        { label: '第二档', cap: 10 },
        { label: '第三档', cap: 5 }
      ] },
    { id: 'abyss', name: '深渊重压', icon: '⬇', badge: 'assets/challenges/challenge-abyss.webp', kind: '三档挑战',
      summary: '全局产出被压低，仍需推进文明。', rule: '本轮全产出降低',
      rewards: ['全产出 +20%', '全产出 +40%', '全产出 +60%'],
      tiers: [
        { label: '第一档', cap: 0.20 },
        { label: '第二档', cap: 0.40 },
        { label: '第三档', cap: 0.60 }
      ] }
  ];
  var BY_ID = {};
  for (var i = 0; i < DEFINITIONS.length; i++) BY_ID[DEFINITIONS[i].id] = DEFINITIONS[i];

  function emptyProgress() { return { completed: { cold: false, small: false, science: 0, abyss: 0 } }; }
  function progress(meta) {
    var c = meta && meta.challenges && meta.challenges.completed;
    return c || emptyProgress().completed;
  }
  function tierDone(id, meta) {
    var c = progress(meta), d = BY_ID[id];
    if (!d) return 0;
    return d.tiers.length === 1 ? (c[id] ? 1 : 0) : Math.max(0, Math.min(d.tiers.length, c[id] | 0));
  }
  function completedCount(meta) {
    var n = 0;
    for (var j = 0; j < DEFINITIONS.length; j++) n += tierDone(DEFINITIONS[j].id, meta);
    return n;
  }
  function active(s) { return s && !s.broken && s.challenge && BY_ID[s.challenge.id] ? s.challenge : null; }
  function activeTier(s) {
    var a = active(s), d = a && BY_ID[a.id];
    return a && d ? d.tiers[Math.max(0, Math.min(d.tiers.length - 1, a.tier | 0))] : null;
  }
  function ignorePopulationGates(s) {
    var a = active(s);
    return !!(a && a.id === 'small');
  }
  function jobLimit(s, job) {
    var a = active(s);
    if (!a || a.id !== 'science' || (job !== 'scholar' && job !== 'scribe')) return Infinity;
    var tier = activeTier(s);
    return tier ? tier.cap : Infinity;
  }
  function jobLimitReason(s, job) {
    var cap = jobLimit(s, job), count = s && s.jobs ? (s.jobs[job] || 0) : 0;
    if (count < cap) return null;
    var label = job === 'scholar' ? '学者' : '书手';
    return '忽视科文挑战限制：' + label + '已达 ' + cap + ' 人上限';
  }
  function jobLimitExceeded(s, capOverride) {
    var cap = capOverride === undefined ? jobLimit(s, 'scholar') : capOverride;
    return (s.jobs.scholar || 0) > cap || (s.jobs.scribe || 0) > cap;
  }
  function productionMul(s) {
    var m = 1, meta = SB.game && SB.game.meta ? SB.game.meta() : null;
    var done = tierDone('abyss', meta), a = active(s);
    if (done) m *= 1 + [0, 0.2, 0.4, 0.6][done];
    if (a && a.id === 'abyss') m *= 1 - activeTier(s).cap;
    return m;
  }
  function scienceCultureMul(s) {
    var done = tierDone('science', SB.game && SB.game.meta ? SB.game.meta() : null);
    return 1 + [0, 0.5, 1, 2][done];
  }
  function warmstoneMul(s) {
    var earned = tierDone('cold', SB.game && SB.game.meta ? SB.game.meta() : null) ? 1.2 : 1;
    var a = active(s);
    return earned * (a && a.id === 'cold' ? 0.7 : 1);
  }
  function populationLimit(s) {
    var a = active(s);
    return a && a.id === 'small' ? 15 : Infinity;
  }
  function growthDuration(s) {
    var done = tierDone('small', SB.game && SB.game.meta ? SB.game.meta() : null);
    return SB.CFG.GROW_NEED * (done ? 0.5 : 1);
  }
  function startingPopulation() {
    var done = tierDone('small', SB.game && SB.game.meta ? SB.game.meta() : null);
    return SB.CFG.POP_START + (done ? 3 : 0);
  }
  function warmHeatingBlocked(s) {
    var a = active(s);
    if (!a || a.id !== 'cold' || !SB.economy || !SB.economy.season) return false;
    return SB.economy.season(s.t).mult < 1;
  }
  function rewardFor(d, tier) {
    return d.tiers.length === 1 ? d.reward : d.rewards[tier];
  }
  function canStart(id, s, meta) {
    var d = BY_ID[id];
    if (!d || active(s)) return false;
    var next = tierDone(id, meta);
    return next < d.tiers.length;
  }
  function begin(id) {
    var s = SB.game.run(), meta = SB.game.meta(), d = BY_ID[id];
    if (!canStart(id, s, meta)) return false;
    var tier = tierDone(id, meta);
    /* 自动结算当前周目；没有《神学》时沿用普通重开的规则，不发轮回点。 */
    if (s && !s.broken && SB.prestige.qualified(s))
      SB.prestige.doBreak(s, SB.game.emit, { silent: true, challengeStart: true });
    SB.game.startRun({ challenge: { id: id, tier: tier } });
    SB.game.setTab('challenges');
    SB.game.log('轮回挑战开始：' + d.name + ' · ' + d.tiers[tier].label + '。');
    SB.game.renderAll();
    return true;
  }
  function prepareStart(id) {
    var s = SB.game.run(), meta = SB.game.meta(), d = BY_ID[id];
    if (!canStart(id, s, meta)) return false;
    var tier = tierDone(id, meta), t = d.tiers[tier];
    var qualified = SB.prestige.qualified(s), report = qualified ? SB.prestige.breakReport(s) : null;
    var payout = report ? report.tidePoints : 0;
    SB.ui.render.confirmPanel({
      title: '结算并开始挑战？',
      body: '<div class="warnbox">当前周目将自动结算并重开。' +
        (qualified ? '预计获得 <b>' + payout.toFixed(2) + ' 轮回点</b>。' : '尚未完成《神学》，本次不会获得轮回点。') +
        '</div><div class="note"><b>' + d.name + ' · ' + t.label + '</b><br>' +
        (d.id === 'science' ? '学者与书手岗位人数各不得超过 ' + t.cap + ' 人。' :
          d.id === 'abyss' ? '本轮全产出 -' + Math.round(t.cap * 100) + '%。' : d.rule) +
        '</div><div class="note">本局进度会重置；轮回点、已完成挑战与永久奖励保留。</div>',
      ok: '结算并开始',
      onOk: function () { begin(id); }
    });
    return true;
  }
  function resolveRun(s, meta) {
    var a = s && s.challenge, d = a && BY_ID[a.id];
    if (!d || !s || s.shell > 0 || !SB.prestige.qualified(s)) return null;
    var tier = Math.max(0, Math.min(d.tiers.length - 1, a.tier | 0));
    if (tier !== tierDone(d.id, meta)) return null;
    if (d.id === 'science' && jobLimitExceeded(s, d.tiers[tier].cap)) return null;
    if (d.id === 'small' && (s.peak || s.pop) > d.tiers[tier].cap) return null;
    var c = progress(meta);
    if (d.tiers.length === 1) c[d.id] = true;
    else c[d.id] = Math.max(c[d.id] | 0, tier + 1);
    if (!meta.challenges) meta.challenges = emptyProgress();
    meta.challenges.completed = c;
    return { id: d.id, name: d.name, tier: tier, label: d.tiers[tier].label, reward: rewardFor(d, tier) };
  }

  SB.challenges = {
    list: function () { return DEFINITIONS; }, byId: function (id) { return BY_ID[id] || null; },
    progress: progress, tierDone: tierDone, completedCount: completedCount,
    active: active, activeTier: activeTier, ignorePopulationGates: ignorePopulationGates,
    jobLimit: jobLimit, jobLimitReason: jobLimitReason, jobLimitExceeded: jobLimitExceeded,
    productionMul: productionMul, scienceCultureMul: scienceCultureMul,
    warmstoneMul: warmstoneMul, populationLimit: populationLimit,
    growthDuration: growthDuration, startingPopulation: startingPopulation,
    warmHeatingBlocked: warmHeatingBlocked, canStart: canStart, begin: begin, prepareStart: prepareStart,
    resolveRun: resolveRun, rewardFor: rewardFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
