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
      ] },
    { id: 'speedrun', name: '逐光竞速', icon: '⏱', badge: 'assets/challenges/challenge-speedrun.svg', kind: '三档限时挑战',
      summary: '与时间赛跑，在期限内完成《神学》并凿穿天壳；退出游戏后计时仍继续。',
      rule: '从开始挑战起按现实时间计时，离线时间也计入；超时后本轮不能领取竞速奖励。',
      rewards: ['永久全产出 +5%', '永久全产出 +10%', '永久全产出 +15%'],
      tiers: [
        { label: '16 小时档', cap: 16 * 60 * 60 },
        { label: '8 小时档', cap: 8 * 60 * 60 },
        { label: '4 小时档', cap: 4 * 60 * 60 }
      ] },
    /* ERA9（寻光纪 · 本次实装占位）：流浪泰拉（drift_terra）。
     * ⚠️ 当前**纯占位**：无规则、无奖励、单档，仅用于承接 ERA9 科技《严冬计划》的尤里卡
     *   cond `{ t: 'challenge', id: 'drift_terra' }`（entered 语义 = 进入本挑战即可解锁严冬计划）。
     *   G.E.E.K 运行态 + 流浪泰拉挑战的真实规则/奖励留待最后单独实装；在此之前进入它只触发
     *   标准挑战流程（结算当前周目并重开），不施加任何限制、不给任何永久奖励（reward 占位文案）。
     * ⚠️ kind 用「单次挑战」、tiers 单档，与 cold/small 同构，避免 resolveRun 走三档分支报错。 */
    { id: 'drift_terra', name: '流浪泰拉', icon: '🪐', badge: 'assets/challenges/challenge-drift_terra.png', kind: '单次挑战',
      summary: '（占位）泰拉脱离轨道流浪，严冬将至。', rule: '（待实装）',
      reward: '（待实装）', tiers: [{ label: '进入挑战', cap: null }] }
  ];
  var BY_ID = {};
  for (var i = 0; i < DEFINITIONS.length; i++) BY_ID[DEFINITIONS[i].id] = DEFINITIONS[i];

  function emptyProgress() { return { completed: { cold: false, small: false, science: 0, abyss: 0, speedrun: 0, drift_terra: false } }; }
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
    var label = SB.folk && SB.folk.jobName ? SB.folk.jobName(s, job) : job === 'scholar' ? '学者' : '书手';
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
    var speedDone = tierDone('speedrun', meta);
    if (speedDone) m *= 1 + [0, 0.05, 0.10, 0.15][speedDone];
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
  function elapsedSeconds(s) {
    var challenge = s && s.challenge, started = challenge && Number(challenge.startedAt);
    if (!(started > 0) || !isFinite(started)) return Infinity;
    return Math.max(0, (Date.now() - started) / 1000);
  }
  function remainingSeconds(s) {
    var a = active(s), tier = activeTier(s);
    if (!a || a.id !== 'speedrun' || !tier) return null;
    return Math.max(0, tier.cap - elapsedSeconds(s));
  }
  function timedOut(s) {
    var challenge = s && s.challenge, d = challenge && BY_ID[challenge.id];
    if (!challenge || !d || d.id !== 'speedrun') return false;
    var tier = d.tiers[Math.max(0, Math.min(d.tiers.length - 1, challenge.tier | 0))];
    return elapsedSeconds(s) >= tier.cap;
  }
  function formatClock(seconds) {
    if (!isFinite(seconds)) return '计时数据无效';
    var whole = Math.max(0, Math.ceil(seconds));
    var hours = Math.floor(whole / 3600), minutes = Math.floor((whole % 3600) / 60), secs = whole % 60;
    return hours + ':' + (minutes < 10 ? '0' : '') + minutes + ':' + (secs < 10 ? '0' : '') + secs;
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
    SB.game.log('挑战开始：' + d.name + ' · ' + d.tiers[tier].label + '。');
    SB.game.renderAll();
    return true;
  }
  function prepareStart(id) {
    var s = SB.game.run(), meta = SB.game.meta(), d = BY_ID[id];
    if (!canStart(id, s, meta)) return false;
    var tier = tierDone(id, meta), t = d.tiers[tier];
    var qualified = SB.prestige.qualified(s), report = qualified ? SB.prestige.breakReport(s) : null;
    var payout = report ? report.tidePoints : 0;
    var selectedRule = d.id === 'speedrun' ? '必须在 ' + formatClock(t.cap) + ' 内完成《神学》并凿穿天壳；离线时间也计入。' :
      d.id === 'science' ? '学者与书手岗位人数各不得超过 ' + t.cap + ' 人。' :
        d.id === 'abyss' ? '本轮全产出 -' + Math.round(t.cap * 100) + '%。' : d.rule;
    SB.ui.render.confirmPanel({
      title: '结算并开始挑战？',
      body: '<div class="warnbox">当前周目将自动结算并重开。' +
        (qualified ? '预计获得 <b>' + payout.toFixed(2) + ' 轮回点</b>。' : '尚未完成《神学》，本次不会获得轮回点。') +
        '</div><div class="note"><b>' + d.name + ' · ' + t.label + '</b><br>' +
        selectedRule +
        '</div><div class="note">本局进度会重置；轮回点、已完成挑战与永久奖励保留。</div>',
      ok: '结算并开始',
      onOk: function () { begin(id); }
    });
    return true;
  }
  function resolveRun(s, meta) {
    var a = s && s.challenge, d = a && BY_ID[a.id];
    if (!d || !s || s.shell > 0) return null;
    var tier = Math.max(0, Math.min(d.tiers.length - 1, a.tier | 0));
    if (tier !== tierDone(d.id, meta)) return null;
    if (d.id === 'speedrun' && elapsedSeconds(s) >= d.tiers[tier].cap)
      return { id: d.id, name: d.name, tier: tier, label: d.tiers[tier].label,
        failed: true, elapsed: elapsedSeconds(s), limit: d.tiers[tier].cap };
    if (!SB.prestige.qualified(s)) return null;
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
    elapsedSeconds: elapsedSeconds, remainingSeconds: remainingSeconds, timedOut: timedOut, formatClock: formatClock,
    warmHeatingBlocked: warmHeatingBlocked, canStart: canStart, begin: begin, prepareStart: prepareStart,
    resolveRun: resolveRun, rewardFor: rewardFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
