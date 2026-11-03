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
    { id: 'drift_terra', name: '流浪泰拉', icon: '🪐', badge: 'assets/challenges/challenge-drift_terra-v3.png?v=2', kind: '单次挑战',
      summary: '泰拉脱离轨道流浪，严冬将至。',
      rule: '寒流季必定冰封且持续时间 ×2；太阳帆热液能产出 ×0.5。允许烧暖石；建成星核炉芯后解除冰封。',
      reward: '永久暖流季全产 +30% · 寒流季时长 ×0.5 · G.E.E.K 环境改造时间 ×0.5',
      goal: { t: 'all', of: [{ t: 'built', b: 'terra_engine', n: 50 }, { t: 'res', r: 'coreCharge', n: 50000000 }] },
      goalText: '建成 50 座行星发动机，并把星核炉芯池灌满 50M 热液能',
      rankKey: 'drift', rankValue: function (s) { return s.wallT; },
      onComplete: function (s, meta) {
        /* 奖励立即生效：本局后续寒流季采用「奖励 ×0.5，再乘挑战 ×2」的 600 秒时长。
         * 保留上次季节标记，避免奖励落账时把当前冰封季重新掷一次。 */
        if (SB.economy && SB.economy.lockSeasonLengths) SB.economy.lockSeasonLengths(s, meta, true);
        if (SB.achv && SB.achv.unlockOnce) SB.achv.unlockOnce('driftTerra', meta);
      },
      tiers: [{ label: '星际远航', cap: null }] },
    /* ── 水体污染（2026-11-02 实装 · docs/challenge-ocean-pollution-design.md v11）───────
     * 单档、goal 型（`t:'dyson'`）：戴森球竣工即通关，飞升虚境同样收敛到 dysonDone。
     * 全部污染机制住在 economy.js 的 pollution* 函数族里，**只在 `s.challenge.id ===
     * 'waterpollution'` 的周目生效**；本定义只负责「怎么开始 / 怎么算赢 / 发什么奖」。
     * ⚠️ 通用奖励「每档 +10% 轮回点获取」不在 reward 文案里（用户定案 R）：那是六项挑战
     *   共享的规则，由 prestige.breakReport 的 challengePointMul 统一给，写进单项文案会让人
     *   以为只有这项才给。 */
    { id: 'waterpollution', name: '水体污染', icon: '☣', badge: 'assets/challenges/challenge-waterpollution.svg', kind: '单次挑战',
      summary: '热液能产出即排污，五个阶段逐级侵蚀幸福、藻食与人口。',
      rule: '热液能建筑每秒排放与产出等值的污染（星屑树乘区不计）；污染达 1000 / 4 万 / 16 万 / 640 万依次进入浊流、赤潮、死区、腐渊，逐级扣幸福、削藻食与珊瑚，并按秒掷死亡；每名死者永久提高幸福消耗（墓地限额内 0.3%、超限 3%）。',
      reward: '永久星屑产出 +10% · 商人奢侈品产出 +50% · 初始人口 +2',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成飞升虚境亦算）',
      /* 排行榜「最低污染通关」（db 待建 · CFG.RANK.MAP.pollution，asc + best）：
       * 成绩 = 达成瞬间的 `s.pollution` 存量（取整）。⚠️ 不存 peak —— 玩家要的是
       * 「通关时海有多脏」，峰值会随经营风格抖动，不可比。 */
      rankKey: 'pollution', rankValue: function (s) { return Math.round(s.pollution || 0); },
      /* 2026-11-03 补：原先没有 onComplete ⇒ 通关只发账本奖励，成就墙不亮。
       * 与 drift_terra 用同一把锁（achv.unlockOnce 内部幂等，重复达成不会重发）。 */
      onComplete: function (s, meta) {
        if (SB.achv && SB.achv.unlockOnce) SB.achv.unlockOnce('pollutionClear', meta);
      },
      tiers: [{ label: '海渊澄明', cap: null }] }
  ];
  var BY_ID = {};
  for (var i = 0; i < DEFINITIONS.length; i++) BY_ID[DEFINITIONS[i].id] = DEFINITIONS[i];

  /* ⚠️ 这个对象是**进度白名单**：`state-migrate` 与 `progress()` 都靠它兜底，新增挑战
   *   漏登记 ⇒ 老档读回来的 completed 里没有这个键 ⇒ tierDone 恒 0 ⇒ 每次进游戏都像没通过、
   *   重打还能再领一次奖（2026-11-02 加 waterpollution 时同步补上）。 */
  function emptyProgress() { return { completed: { cold: false, small: false, science: 0, abyss: 0, speedrun: 0, drift_terra: false, waterpollution: false } }; }
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
  /* 挑战限制「是否仍生效」。2026-11-03 用户拍板：破壳不再自动解除限制 ——
   * 破壳型挑战的成绩在壳归零那一刻已定格（见 sealRun），但门禁什么时候撤由玩家自己选。
   * 旧判据 `!s.broken` 的问题：破壳瞬间人口上限从 15 跳到 241、-60% 产出同时回正，
   * 玩家看到的「挑战」在破壳那一刻就自己消失了，等于限制从没起过作用。
   * ⚠️ 老档迁移必须补成 true（见 state-migrate 的对应注释），否则读档瞬间限制全回来。 */
  function active(s) {
    var a = s && s.challenge, d = a && BY_ID[a.id];
    if (!d) return null;
    /* goal 型（流浪泰拉 / 水体污染）的终点在壳外 —— 破壳后要造 50 座行星发动机、要打到戴森球，
     * 人口与产出不能还压着，所以它们沿用旧判据「破壳即解除」。
     * 破壳型五项才走「玩家显式解除」（2026-11-03 用户拍板：成就要现做，限制不能自己消失）。 */
    if (d.goal) return s.broken ? null : a;
    return s.challengeReleased ? null : a;
  }
  /* 解除本轮挑战限制：一次性，不可再打开（否则等于「打不过就关、想刷榜再开」）。
   * 非挑战局 / 已解除 ⇒ false，不重复写日志。 */
  function release(s) {
    var a = s && s.challenge, d = a && BY_ID[a.id];
    if (!d || s.challengeReleased) return false;
    s.challengeReleased = true;
    if (SB.game && SB.game.log)
      SB.game.log('已解除「' + d.name + '」的限制，本局按正常规则继续（之后无法再打开）。');
    return true;
  }
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
  /* 起始人口：小国寡民 +3、水体污染 +2（两项都通过则叠加）。 */
  function startingPopulation() {
    var meta = SB.game && SB.game.meta ? SB.game.meta() : null;
    var done = tierDone('small', meta), pol = tierDone('waterpollution', meta);
    return SB.CFG.POP_START + (done ? 3 : 0) + (pol ? 2 : 0);
  }
  function warmHeatingBlocked(s) {
    var a = active(s);
    if (!a || a.id !== 'cold' || !SB.economy || !SB.economy.season) return false;
    return SB.economy.season(s).mult < 1;
  }
  function goalMet(s, goal) {
    if (!goal) return false;
    if (goal.t === 'all') {
      for (var i = 0; i < (goal.of || []).length; i++) if (!goalMet(s, goal.of[i])) return false;
      return true;
    }
    if (goal.t === 'built') return !!(s.lvl && (s.lvl[goal.b] || 0) >= goal.n);
    if (goal.t === 'res') return !!(s.res && (s.res[goal.r] || 0) >= goal.n);
    /* 戴森球竣工（ERA10 终局，2026-11-02 加）：`s.dysonDone` 是 economy-tick 里
     *   dysonPct(s) >= 1 时置位的一次性旗；飞升虚境（civics.ascend_void）也收敛到它，
     *   所以这里不需要额外的 `|| s.ascendVoidDone` 分支。 */
    if (goal.t === 'dyson') return !!s.dysonDone;
    if (goal.t === 'wonders') {
      var ow = SB.wonder && SB.wonder.owned ? SB.wonder.owned(s) : {};
      return (goal.ids || []).every(function (id) { return !!ow[id]; });
    }
    return false;
  }
  /* ── goal 型挑战的通用结算（2026-11-02 泛化）────────────────────────────────
   * 这一段原先整段写死 drift_terra（id 判断、排行榜 key、季长副作用全是硬编码），
   * 加「水体污染」时若照抄一份，两套结算必然各自演化（「面板撒谎」家族的同构版本：
   * 一个改了一个没改，玩家在两处遇到同一份规则却表现不同）。现在把**挑战个性**收进
   * DEFINITION：
   *   d.goal        达成条件（goalMet 通用求值）
   *   d.goalText    通关目标文案
   *   d.rankKey     排行榜键（CFG.RANK.LB / MAP 的 key）
   *   d.rankValue   成绩取值 (s) => number
   *   d.onComplete  达成瞬间的本局副作用（drift 重掷季长 / 置成就）
   * ⚠️ 副作用若写在**本局**（s.xxx）上，onComplete 里还得自己 saveRun —— 见下面那段注。
   * ⚠️ 重复达成（replay）分支**一个字都不写账本**：meta.challenges.completed 保持原值
   *   ⇒ completedCount() 不变 ⇒「每档 +10% 轮回点获取」不会被重复领取（用户定案 R）。 */
  function award(s, meta) {
    var ch = s && s.challenge, d = ch && BY_ID[ch.id];
    if (!d || !d.goal || s.challengeDone) return null;
    var tier = Math.max(0, Math.min(d.tiers.length - 1, ch.tier | 0));
    var replay = ch.replay === true || tierDone(d.id, meta) >= d.tiers.length;
    if (replay) {
      if (!goalMet(s, d.goal)) return null;
      var replayOutcome = { id: d.id, name: d.name, tier: tier, label: d.tiers[tier].label,
        reward: null, goalText: d.goalText, replay: true };
      s.challengeDone = true;
      s.challengeOutcome = replayOutcome;
      /* 重复达成也要刷榜（这就是玩家要的东西）。平台 calcType='best' 自动留更好的一次，
       * 所以重复提交只会改善、不会覆盖掉旧成绩。 */
      if (d.rankKey && SB.rank && SB.rank.submitRun)
        SB.rank.submitRun([{ key: d.rankKey, value: d.rankValue ? d.rankValue(s) : 0 }]);
      /* ⛔ 不写 meta.challengePopupPending：那会重播四段分镜，并弹出「永久奖励已生效」——
       *   重复挑战根本没发奖，那句话是假的。 */
      if (SB.state && SB.state.saveRun) SB.state.saveRun(s);
      if (SB.game && SB.game.log)
        SB.game.log('再次达成' + d.name + '：' + d.goalText + '。本局不重复发奖，成绩已提交排行榜。');
      return replayOutcome;
    }
    if (tier !== tierDone(d.id, meta) || !goalMet(s, d.goal)) return null;
    if (!meta.challenges) meta.challenges = emptyProgress();
    meta.challenges.completed = meta.challenges.completed || {};
    meta.challenges.completed[d.id] = true;
    var outcome = { id: d.id, name: d.name, tier: tier, label: d.tiers[tier].label, reward: d.reward, goalText: d.goalText };
    s.challengeDone = true;
    s.challengeOutcome = outcome;
    meta.challengePopupPending = outcome;
    if (d.onComplete) d.onComplete(s, meta);
    if (d.rankKey && SB.rank && SB.rank.submitRun)
      SB.rank.submitRun([{ key: d.rankKey, value: d.rankValue ? d.rankValue(s) : 0 }]);
    if (SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
    /* ⚠️ 季长奖励落在**本局**（s.seasonLengths），saveMeta 管不到它。
     * 不立刻落盘 ⇒ 自动存档（5 秒）之间刷新 / 切后台被杀 ⇒ 读回来是「已完成 + 旧季长」，
     * 而 resumeRun 只在 seasonLengthsVersion 缺失时重算 ⇒ 寒流 600→300 这条奖励静默丢失
     * （2026-10-31 检查发现）。这一行是奖励入账的一部分，不是可选的保险。 */
    if (SB.state && SB.state.saveRun) SB.state.saveRun(s);
    if (SB.game && SB.game.log) SB.game.log(d.name + '挑战达成：' + d.goalText + '。永久奖励已生效。');
    return outcome;
  }
  /* 破壳瞬间的判定入口（2026-11-03）：由 shell.onShellZero 在壳归零那一刻调用。
   * 与 resolveRun 的差别只有「落盘时机」：判定完立刻把 meta 与本局一起存掉 ——
   *   破壳后玩家还要继续玩，若不立刻落盘，中途崩溃 / 切后台被杀会丢掉这次判定，
   *   而 seal 还在 ⇒ 下次启动按同一份快照补判，结果一致。
   * ⚠️ 幂等靠两处：s.challengeDone（本局）与 tierDone（账本，resolveRun 里的 tier 判据）。
   *   两处都在，补判不会重复发奖、也不会重复上榜（平台 calcType='best' 兜底）。 */
  function sealRun(s, meta) {
    if (!s || s.challengeDone) return null;
    var out = resolveRun(s, meta);
    if (!out) return null;
    s.challengeDone = true;
    s.challengeOutcome = out;
    if (SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
    if (SB.state && SB.state.saveRun && SB.game && SB.game.run && SB.game.run() === s)
      SB.state.saveRun(SB.game.snapshot(s));
    if (SB.game && SB.game.log) {
      SB.game.log(out.failed
        ? out.name + '挑战未通关：已超过 ' + formatClock(out.limit) + '，本档奖励未领取。'
        : out.name + '挑战达成：' + out.label + (out.replay ? '（重复挑战，仅刷新排行榜）。' : '，永久奖励已生效。'));
    }
    return out;
  }
  function evaluate(s, meta) {
    if (!s || !s.challenge || !meta) return null;
    var out = award(s, meta);
    if (out) return out;
    /* 破壳型补判（2026-11-03）：破壳那一刻还没学《神学》⇒ resolveRun 直接返回 null，
     *   判定被挂起。补学之后在这里按破壳时冻下的 seal 补判一次 —— 判据仍是破壳瞬间的
     *   计时/人口/岗位，不是补学那一刻的。
     * ⚠️ 三个条件缺一不可：seal 存在（破壳过）、未判过、壳已归零。
     *   少写 !challengeDone 就会每帧重判一次（每帧一次存档写入）。 */
    var d = BY_ID[s.challenge.id];
    if (d && !d.goal && s.challengeSeal && !s.challengeDone && s.shell <= 0)
      return sealRun(s, meta);
    return null;
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
  /* ── 重打（2026-11-02 玩家反馈「挑战模式不能反复挑战刷排行榜」）─────────────
   * 规则（用户拍板）：全部 6 项通关后仍可再战；分档挑战重打**已通的最高档**；
   *   重复通关不再发放永久奖励、不再累加「轮回点获取 +10%」，只把成绩刷进现有排行榜。
   * ⇒ 「能不能开」必须分两个函数，不许混用：
   *     canStart       = 能开（含重打）—— UI 按钮用
   *     canStartFresh  = 还有未通关的档位 —— 机器人选挑战用。若让 ai-player 继续用
   *                      canStart，它会在已通关的挑战上无限重开，永远走不到虚境终局。
   * ⚠️ 重打时 tier 必须夹到 tiers.length-1：直接拿 tierDone() 会等于 length，
   *   `d.tiers[tier].label` 立刻抛 TypeError（旧实现正是靠 canStart 挡住这一档才没炸）。 */
  function startTier(id, meta) {
    var d = BY_ID[id];
    if (!d) return 0;
    return Math.max(0, Math.min(d.tiers.length - 1, tierDone(id, meta)));
  }
  function isReplay(id, meta) {
    var d = BY_ID[id];
    return !!d && tierDone(id, meta) >= d.tiers.length;
  }
  function canStart(id, s, meta) {
    var d = BY_ID[id];
    if (!d || active(s)) return false;
    return true;
  }
  function canStartFresh(id, s, meta) {
    var d = BY_ID[id];
    if (!d || active(s)) return false;
    return tierDone(id, meta) < d.tiers.length;
  }
  function begin(id) {
    var s = SB.game.run(), meta = SB.game.meta(), d = BY_ID[id];
    if (!canStart(id, s, meta)) return false;
    var tier = startTier(id, meta), replay = isReplay(id, meta);
    /* 自动结算当前周目；没有《神学》时沿用普通重开的规则，不发轮回点。 */
    if (s && !s.broken && SB.prestige.qualified(s))
      SB.prestige.doBreak(s, SB.game.emit, { silent: true, challengeStart: true });
    SB.game.startRun({ challenge: { id: id, tier: tier, replay: replay } });
    SB.game.setTab('challenges');
    SB.game.log((replay ? '再次挑战：' : '挑战开始：') + d.name + ' · ' + d.tiers[tier].label +
      (replay ? '（重复挑战不发奖，成绩计入排行榜）。' : '。'));
    SB.game.renderAll();
    return true;
  }
  function prepareStart(id) {
    var s = SB.game.run(), meta = SB.game.meta(), d = BY_ID[id];
    if (!canStart(id, s, meta)) return false;
    var tier = startTier(id, meta), replay = isReplay(id, meta), t = d.tiers[tier];
    var qualified = SB.prestige.qualified(s), report = qualified ? SB.prestige.breakReport(s) : null;
    var payout = report ? report.tidePoints : 0;
    var selectedRule = d.id === 'speedrun' ? '必须在 ' + formatClock(t.cap) + ' 内完成《神学》并凿穿天壳；离线时间也计入。' :
      d.id === 'science' ? '学者与书手岗位人数各不得超过 ' + t.cap + ' 人。' :
        d.id === 'abyss' ? '本轮全产出 -' + Math.round(t.cap * 100) + '%。' : d.rule;
    SB.ui.render.confirmPanel({
      title: replay ? '再次开始这项挑战？' : '结算并开始挑战？',
      body: '<div class="warnbox">当前周目将自动结算并重开。' +
        (qualified ? '预计获得 <b>' + payout.toFixed(2) + ' 轮回点</b>。' : '尚未完成《神学》，本次不会获得轮回点。') +
        '</div><div class="note"><b>' + d.name + ' · ' + t.label + (replay ? ' · 重复挑战' : '') + '</b><br>' +
        selectedRule +
        '</div><div class="note">本局进度会重置；轮回点、已完成挑战与永久奖励保留。' +
        (replay ? '<br>本次为重复挑战：通关不再发放永久奖励，也不会再次提高轮回点获取，只刷新排行榜成绩。' : '') +
        '</div>',
      ok: replay ? '再次挑战' : '结算并开始',
      onOk: function () { begin(id); }
    });
    return true;
  }
  /* 破壳快照（2026-11-03）：破壳型挑战的判据全都吃「此刻」的量 ——
   *   逐光竞速算现实秒、小国寡民看峰值人口、忽视科文看学者/书手岗位。
   *   破壳之后玩家还要继续玩 ERA10（发射场 → 戴森球），这些量都会继续变。
   *   若把判定留到结算时再读，等于允许玩家在破壳后用操作改写已完成的挑战成绩
   *   （最刺眼的是逐光竞速：破壳后多挂机两小时，4 小时档直接判超时）。
   * ⇒ 破壳那一刻把判据所需的量冻成 seal 存进本局，之后的判定一律读 seal。
   * ⚠️ qualified 也进快照，但**不参与判定**：它只记录「破壳那一刻有没有《神学》」，
   *   供排障用。判定仍用**当前**的 qualified —— 破壳时没学的局先挂起、补学后补判，
   *   这是 2026-10 以来的既有行为，不借这次改动悄悄收紧成「必须破壳前学完」。 */
  function seal(s) {
    if (!s) return null;
    /* ⚠️ elapsed 必须落成有限数：非限时挑战没有 startedAt，elapsedSeconds 返回 Infinity，
     *   而 Infinity 进 JSON 会变成 null ⇒ 存档落盘后这份快照就废了（migrateRun 会判非法）。
     *   -1 = 「本局没有有效计时」，判定侧据此回落实时值（与改动前同口径）。 */
    var el = elapsedSeconds(s);
    return {
      at: Date.now(),
      elapsed: isFinite(el) ? el : -1,
      peak: Math.max(0, s.peak || 0, s.pop || 0),
      scholar: (s.jobs && s.jobs.scholar) || 0,
      scribe: (s.jobs && s.jobs.scribe) || 0,
      qualified: !!(s.civics && s.civics.theology)
    };
  }

  /* sealOverride 显式传入时用它，否则读本局的 challengeSeal。
   * ⚠️ 老档（2026-11-03 之前破壳）没有 challengeSeal ⇒ 回落到实时值，与改动前同口径。 */
  function resolveRun(s, meta, sealOverride) {
    var a = s && s.challenge, d = a && BY_ID[a.id];
    if (d && d.goal) return null; // goal 挑战由 evaluate() 即时结算，不依赖破壳/轮回
    if (!d || !s || s.shell > 0) return null;
    var seal0 = sealOverride || s.challengeSeal || null;
    var tier = Math.max(0, Math.min(d.tiers.length - 1, a.tier | 0));
    /* 重打：tierDone 已等于 length，常规判据 `tier !== tierDone` 会把这次通关整个吞掉。
     * 标记优先读 s.challenge.replay（存档迁移会保留它），读不到再按进度反推，
     * 避免「老档里一局没标 replay 的重打局」白打。 */
    var replay = a.replay === true || tierDone(d.id, meta) >= d.tiers.length;
    if (!replay && tier !== tierDone(d.id, meta)) return null;
    var elapsed = (seal0 && typeof seal0.elapsed === 'number' && seal0.elapsed >= 0)
      ? seal0.elapsed : elapsedSeconds(s);
    if (d.id === 'speedrun' && elapsed >= d.tiers[tier].cap)
      return { id: d.id, name: d.name, tier: tier, label: d.tiers[tier].label,
        failed: true, elapsed: elapsed, limit: d.tiers[tier].cap };
    if (!SB.prestige.qualified(s)) return null;
    if (d.id === 'science') {
      /* 岗位上限必须读破壳快照：破壳后挑战限制自动解除（active() 的 !s.broken），
       * 玩家此时可以随便把学者堆回上限以上 —— 用实时值判会把已赢的局判成输。 */
      var capS = d.tiers[tier].cap;
      var schN = seal0 ? seal0.scholar : ((s.jobs && s.jobs.scholar) || 0);
      var scrN = seal0 ? seal0.scribe : ((s.jobs && s.jobs.scribe) || 0);
      if (schN > capS || scrN > capS) return null;
    }
    if (d.id === 'small') {
      var peakN = seal0 ? seal0.peak : (s.peak || s.pop);
      if (peakN > d.tiers[tier].cap) return null;
    }
    /* 重打只报成绩，**一个字都不写账本**：meta.challenges.completed 保持原值 ⇒
     * completedCount() 不变 ⇒「每档 +10% 轮回点获取」不会被重复领取（用户拍板口径）。 */
    if (replay) return { id: d.id, name: d.name, tier: tier, label: d.tiers[tier].label,
      replay: true, reward: null };
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
    warmHeatingBlocked: warmHeatingBlocked, canStart: canStart, canStartFresh: canStartFresh,
    startTier: startTier, isReplay: isReplay,
    begin: begin, prepareStart: prepareStart,
    resolveRun: resolveRun, rewardFor: rewardFor, goalMet: goalMet, evaluate: evaluate,
    seal: seal, sealRun: sealRun, release: release,
    entered: function (s, id) { return !!(s && s.challenge && s.challenge.id === id); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
