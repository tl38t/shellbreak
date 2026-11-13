/* 天壳 / SHELLBREAK — 轮回挑战
 * 挑战定义、限制与永久奖励集中在此；页面只渲染本模块提供的数据，规则入口复用它。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  var DEFINITIONS = [
    { id: 'cold', achievementKey: 'cold', name: '寒流禁火', icon: '❄', badge: 'assets/challenges/challenge-cold.webp', kind: '单次挑战',
      summary: '寒流压境，保温法停用，暖石产出降低。',
      rule: '寒流季禁止启用保温法；本轮暖石产出 -30%',
      reward: '永久暖石产出 +20%', tiers: [{ label: '完成挑战', cap: null }] },
    { id: 'small', achievementKey: 'small', name: '小国寡民', icon: '◉', badge: 'assets/challenges/challenge-small.webp', kind: '单次挑战',
      summary: '人口上限 15，忽略科技与市政中的人口门槛。',
      rule: '人口不得超过 15；科技与市政的总人口、职业人数门槛豁免', reward: '永久初始人口 +3 · 生育时间 -50%',
      tiers: [{ label: '完成挑战', cap: 15 }] },
    { id: 'science', achievementKey: 'science', name: '忽视科文', icon: '⌘', badge: 'assets/challenges/challenge-science.webp', kind: '三档挑战',
      summary: '限制学者与书手人数，考验基础经营。',
      rule: '学者与书手岗位人数各不得超过本档上限',
      rewards: ['科文产出 +50%', '科文产出 +100%', '科文产出 +200%'],
      tiers: [
        { label: '第一档', cap: 15 },
        { label: '第二档', cap: 10 },
        { label: '第三档', cap: 5 }
      ] },
    { id: 'abyss', achievementKey: 'abyss', name: '深渊重压', icon: '⬇', badge: 'assets/challenges/challenge-abyss.webp', kind: '三档挑战',
      summary: '全局产出被压低，仍需推进文明。', rule: '本轮全产出降低',
      rewards: ['全产出 +20%', '全产出 +40%', '全产出 +60%'],
      tiers: [
        { label: '第一档', cap: 0.20 },
        { label: '第二档', cap: 0.40 },
        { label: '第三档', cap: 0.60 }
      ] },
    { id: 'speedrun', achievementKey: 'speedrun', name: '逐光竞速', icon: '⏱', badge: 'assets/challenges/challenge-speedrun-illustrated.webp', kind: '三档限时挑战',
      timed: true,
      summary: '与时间赛跑，在期限内完成《神学》并凿穿天壳；退出游戏后计时仍继续。',
      rule: '从开始挑战起按现实时间计时，离线时间也计入；超时后本轮不能领取竞速奖励。',
      rewards: ['永久全产出 +5%', '永久全产出 +10%', '永久全产出 +15%'],
      tiers: [
        { label: '16 小时档', cap: 16 * 60 * 60 },
        { label: '8 小时档', cap: 8 * 60 * 60 },
        { label: '4 小时档', cap: 4 * 60 * 60 }
      ] },
    /* 星海竞速（2026-11-07）：逐光竞速的终局延长版 —— 终点从「破壳」推到「戴森球竣工」。
     * ⚠️ goal 型挑战不走 resolveRun 的超时分支（那段是破壳型专用 d.id === 'speedrun'），
     *    所以限时判据统一收在 award() 的 `d.timed && timedOut(s)` 早退里；
     *    goal 只写终点 { t:'dyson' }，三档时限由 tiers[].cap 经 timedOut() 通用求值 ——
     *    把秒数写进 goal 就没法分档（goalMet 只收 s 和 goal，读不到当前档位）。
     * ⚠️ 计时口径与竞速完全一致：startedAt 由 game.startRun 统一写 Date.now()，
     *    elapsedSeconds 读现实秒、离线照计入；不引入第二套计时。
     * ⚠️ 榜单（2026-11-07 于 996563 建，db 17618）：独立 `dysonrush` 榜，不复用 dyson
     *    全局榜 —— 普通局也提交那条，挑战局带额外时限不可能更快，复用等于永远不上榜。
     *    成绩取 s.wallT，与 fastest / dyson / void / drift 同一把尺子（不吃广告倍速）；
     *    不按「剩余时间」排：三档上限不同，跨档没法比。 */
    { id: 'dyson_rush', achievementKey: 'challengeDysonRush', name: '星海竞速', icon: '⌛', badge: 'assets/challenges/challenge-speedrun.svg', kind: '三档限时挑战',
      timed: true,
      summary: '在计时归零前建成戴森球；退出游戏后计时仍继续。',
      rule: '从开始挑战起按现实时间计时，离线时间也计入；超时后本档不能领取竞速奖励。',
      rewards: ['永久全产出 +5%', '永久全产出 +10%', '永久全产出 +15%'],
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成飞升虚境亦算）',
      rankKey: 'dysonrush', rankValue: function (s) { return s.wallT; },
      tiers: [
        { label: '16 小时档', cap: 16 * 60 * 60 },
        { label: '8 小时档', cap: 8 * 60 * 60 },
        { label: '4 小时档', cap: 4 * 60 * 60 }
      ] },
    { id: 'drift_terra', achievementKey: 'driftTerra', name: '流浪泰拉', icon: '🪐', badge: 'assets/challenges/challenge-drift_terra-v3.png?v=2', kind: '单次挑战',
      summary: '泰拉脱离轨道流浪，严冬将至。',
      rule: '寒流季必定冰封且持续时间 ×2；太阳帆热液能产出 ×0.5。允许烧暖石；建成星核炉芯后解除冰封。',
      reward: '永久暖流季全产 +30% · 寒流季时长 ×0.5 · G.E.E.K 环境改造时间 ×0.5',
      goal: { t: 'all', of: [{ t: 'built', b: 'terra_engine', n: 50 }, { t: 'res', r: 'coreCharge', n: 50000000 }] },
      goalText: '建成 50 座行星发动机，并把星核炉芯池灌满 50M 热液能',
      /* 2026-11-05：开启前置（不是「本轮限制」）。winter 的 reqs 是 blackhistory，
       *   而 blackhistory 的尤里卡是 cycle>=15（techs.js:950-952 / tech.js:333-336）。
       *   cycle 只在 prestige.doBreak 过资格门（已建《神学》）时 +1，startRun 只涨 runs
       *   （2026-11-06 口径）⇒ 低轮回数进了挑战，本局再也涨不上去，
       *   整条《严冬计划》链研究不了、50 座行星发动机永远解锁不了。
       *   数字只在**这一处**写，门禁 / 卡片 / 确认面板 / 通知条全读它。 */
      prereq: { t: 'cycle', n: 15 },
      rankKey: 'drift', rankValue: function (s) { return s.wallT; },
      onComplete: function (s, meta) {
        /* 奖励立即生效：本局后续寒流季采用「奖励 ×0.5，再乘挑战 ×2」的 600 秒时长。
         * 保留上次季节标记，避免奖励落账时把当前冰封季重新掷一次。 */
        if (SB.economy && SB.economy.lockSeasonLengths) SB.economy.lockSeasonLengths(s, meta, true);
      },
      tiers: [{ label: '星际远航', cap: null }] },
    /* ── 水体污染（2026-11-02 实装 · docs/challenge-ocean-pollution-design.md v11）───────
     * 单档、goal 型（`t:'dyson'`）：戴森球竣工即通关，飞升虚境同样收敛到 dysonDone。
     * 全部污染机制住在 economy.js 的 pollution* 函数族里，**只在 `s.challenge.id ===
     * 'waterpollution'` 的周目生效**；本定义只负责「怎么开始 / 怎么算赢 / 发什么奖」。
     * ⚠️ 通用奖励「每档 +10% 轮回点获取」不在 reward 文案里（用户定案 R）：那是六项挑战
     *   共享的规则，由 prestige.breakReport 的 challengePointMul 统一给，写进单项文案会让人
     *   以为只有这项才给。 */
    { id: 'waterpollution', achievementKey: 'pollutionClear', name: '水体污染', icon: '☣', badge: 'assets/challenges/challenge-waterpollution-illustrated.webp', kind: '单次挑战',
      summary: '热液能产出即排污，五个阶段逐级侵蚀幸福、藻食与人口。',
      rule: '热液能建筑每秒排放与产出等值的污染（星屑树乘区不计）；污染达 1000 / 4 万 / 16 万 / 640 万依次进入浊流、赤潮、死区、腐渊，逐级扣幸福、削藻食与珊瑚，并按秒掷死亡；每名死者永久提高幸福消耗（墓地限额内 0.3%、超限 3%）。',
      reward: '永久星屑产出 +10% · 商人奢侈品产出 +50% · 初始人口 +2',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成飞升虚境亦算）',
      /* 排行榜「最低污染通关」（db 待建 · CFG.RANK.MAP.pollution，asc + best）：
       * 成绩 = 达成瞬间的 `s.pollution` 存量（取整）。⚠️ 不存 peak —— 玩家要的是
       * 「通关时海有多脏」，峰值会随经营风格抖动，不可比。 */
      rankKey: 'pollution', rankValue: function (s) { return Math.round(s.pollution || 0); },
      tiers: [{ label: '海渊澄明', cap: null }] },
    { id: 'anarchy', achievementKey: 'challengeAnarchy', name: '安那其主义', icon: '⚑', badge: 'assets/challenges/challenge-anarchy.png', kind: '终局挑战',
      summary: '废除政策卡制度，只留下虚境信仰。',
      rule: '全程不得装备政策卡；「轮回之终末」是唯一例外。',
      reward: '永久星屑获取 +10% · 所有政体 +1 万能政策槽',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成虚境飞升亦算）',
      tiers: [{ label: '无政府纪元', cap: null }] },
    { id: 'good_old_days', achievementKey: 'challengeGoodOldDays', name: '美好旧日', icon: '⌛', badge: 'assets/challenges/challenge-good-old-days.png', kind: '终局挑战',
      summary: '始终保持酋邦制，沿用最初的社会秩序。',
      rule: '全程保持酋邦制；本挑战豁免要求采用多槽或指定政体的科技、市政门槛。',
      reward: '永久星屑获取 +10% · 解锁已采用政体的被动卡',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成虚境飞升亦算）',
      onComplete: function (s, meta) {
        if (SB.civic && SB.civic.unlockAdoptedGovPassiveCards)
          SB.civic.unlockAdoptedGovPassiveCards(meta, s.govAdopted);
      },
      tiers: [{ label: '旧制永存', cap: null }] },
    { id: 'three_launch_sites', achievementKey: 'challengeThreeLaunchSites', name: '三地发射网', icon: '🚀', badge: 'assets/challenges/challenge-three-launch-sites.png', kind: '终局挑战',
      summary: '三座行星发射场都要扩建到十一级。',
      rule: '戴森球竣工时，欧罗巴、泰拉、恩克拉多斯发射场都必须达到 11 级。',
      reward: '永久星屑获取 +10% · 三座发射场热液能消耗 -10%',
      goal: { t: 'dysonLaunchSites' }, goalText: '戴森球竣工时三座轨道发射场都达到 11 级（虚境飞升亦算）',
      tiers: [{ label: '三地并举', cap: null }] },
    { id: 'eternity_moment', achievementKey: 'challengeEternityMoment', name: '掌控永远与须臾程度的能力', icon: '☾', badge: 'assets/challenges/challenge-eternity-moment.png', kind: '三档终局挑战',
      summary: '研究与终局工程目标依档位提高五、十或二十倍。',
      rule: '科技与市政研究点成本乘以本档倍率；冰壳厚度、星空探索、太阳帆和戴森节点目标也乘以本档倍率。尤里卡、前置条件与科技额外材料成本不变。',
      rewards: [
        '永久星屑获取 +10% · 科技与市政研究点成本 -5%',
        '永久星屑获取 +10% · 科技与市政研究点成本 -10%',
        '永久星屑获取 +10% · 科技与市政研究点成本 -15%'
      ],
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成虚境飞升亦算）',
      tiers: [
        { label: '五倍永恒', cap: 5 },
        { label: '十倍永恒', cap: 10 },
        { label: '二十倍永恒', cap: 20 }
      ] },
    /* ── 批判的武器（2026-11-12 实装，原名和平主义者）────────────────────────
     * 与 anarchy / good_old_days / three_launch_sites 同构的**终局挑战**（goal 型，
     * 终点 = 戴森球竣工），约束在整局（含破壳后，goal 型 active 一直返回到 challengeDone）内生效。
     * ⚠️ 约束范围：只禁「战争行动」三项（war.js 的 ACTIONS：劫掠 / 入侵 / 全面战争）——
     *    那是 executeAction 唯一执行入口。吞并（annexEnemy）与软实力（executeSoftPowerAction）
     *    不算战争行动，用户拍板不拦。
     * ⚠️ 强制走「预防性拦截」：war.js 的 executeAction 顶部直接 return 拦截；
     *    正常游玩不可能违规，故不像 anarchy 那样需要「违规计数」兜底。
     * ⚠️ 奖励沿用终局挑战惯例基线「永久星屑获取 +10%」+ 自选副奖 C「软实力成本 -20%」
     *    （softPowerCost 读 tierDone('pacifist') 永久生效，见 war.js）。 */
    { id: 'pacifist', achievementKey: 'challengePacifist', name: '批判的武器', icon: '🕊', badge: 'assets/challenges/challenge-pacifist-illustrated.webp', kind: '终局挑战',
      summary: '整局不发动任何战争行动，以和平手段推进文明。',
      rule: '全程不得进行劫掠 / 入侵 / 全面战争；吞并与软实力（传播文化、传道信仰）不受限制，可照常使用。',
      reward: '永久星屑获取 +10% · 软实力（信仰 / 文化渗透）成本 -20%',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成虚境飞升亦算）',
      tiers: [{ label: '永久和平', cap: null }] },
    /* ── 武器的批判（2026-11-12 实装）──────────────────────────────────────
     * 与「批判的武器」（原和平主义者）正好相反：放开战争动作与吞并，但禁止一切软实力
     * （传播文化 / 传道信仰）与贸易路线。约束在整局（含破壳后）生效。
     * ⚠️ 强制走预防性拦截：war.js 的 executeSoftPowerAction / establishTradeRoute
     *    顶部直接 return 拦截；UI 对应按钮也禁用并提示原因。
     * ⚠️ 奖励沿用终局挑战惯例基线「永久星屑获取 +10%」+ 副奖「战争行动军力消耗 -10%」
     *    （actionCost 读 tierDone('weapon_critique') 永久生效，见 war.js）。 */
    { id: 'weapon_critique', achievementKey: 'challengeWeaponCritique', name: '武器的批判', icon: '⚔', badge: 'assets/challenges/challenge-weapon-critique-illustrated.webp', kind: '终局挑战',
      summary: '以武力推进文明，拒绝文化与信仰的渗透，也拒绝商路贸易。',
      rule: '全程不得进行传播文化 / 传道信仰（软实力），也不得修建贸易路线；战争行动与吞并不受限制。',
      reward: '永久星屑获取 +10% · 战争行动军力消耗 -10%',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成虚境飞升亦算）',
      tiers: [{ label: '以武止戈', cap: null }] },
    /* ── 早打，大打，打核大战（2026-11-12 实装）────────────────────────────
     * 与批判的武器 / 武器的批判正交：只许发动「全面战争」，劫掠与入侵被禁。
     * 约束在整局（含破壳后）生效，goal 型 active 一直返回到 challengeDone。 */
    { id: 'totalwar_doctrine', achievementKey: 'challengeTotalWarDoctrine', name: '早打，大打，打核大战', icon: '☢', badge: 'assets/challenges/challenge-totalwar-doctrine-illustrated.webp', kind: '终局挑战',
      summary: '只许发动全面战争，以最猛烈的手段碾碎一切。',
      rule: '全程只能进行「全面战争」；劫掠与入侵被禁止。',
      reward: '永久星屑获取 +10% · 士兵职业产出 +15%',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成虚境飞升亦算）',
      tiers: [{ label: '核平', cap: null }] },
    /* ── grubby（2026-11-12 实装）──────────────────────────────────────────
     * 只许劫掠，入侵与全面战争被禁。与批判的武器 / 武器的批判正交。 */
    { id: 'raider', achievementKey: 'challengeRaider', name: 'grubby', icon: '🪙', badge: 'assets/challenges/challenge-raider-illustrated.webp', kind: '终局挑战',
      summary: '只许劫掠，绝不做长期占领。',
      rule: '全程只能进行「劫掠」；入侵与全面战争被禁止。',
      reward: '永久星屑获取 +10% · 战利品产出 +20%',
      goal: { t: 'dyson' }, goalText: '完成戴森球工程（达成虚境飞升亦算）',
      tiers: [{ label: '蝇营狗苟', cap: null }] },
    /* ── 征服者（2026-11-12 实装）──────────────────────────────────────────
     * 三档挑战：戴森球竣工时须已吞并全部 7 个敌国；敌方规模恢复速度按档位 ×1.5 / ×2 / ×3。
     * ⚠️ goal 含 annex 类型：goalMet 新增 `annex` 分支统计 s.war.enemies 中
     *    status==='annexed' 的数量 ≥ 7。这是 goal 引擎的唯一改动，其它 goal 型
     *    （drift_terra / waterpollution / dyson_rush / 批判的武器 / 武器的批判）不受影响。
     * ⚠️ 敌方恢复倍率由 enemyRecoveryMul 在 war.js 的 recoverEnemy 应用，读 activeTier(s).cap。 */
    { id: 'conqueror', achievementKey: 'challengeConqueror', name: '征服者', icon: '👑', badge: 'assets/challenges/challenge-conqueror-illustrated.webp', kind: '三档挑战',
      summary: '吞并全部七个敌国，以铁蹄踏平星海。',
      rule: '戴森球竣工时，必须已吞并全部 7 个敌国；本挑战敌方规模恢复速度按档位 ×1.5 / ×2 / ×3。',
      rewards: [
        '永久星屑获取 +10% · 敌国规模上限 −5%',
        '永久星屑获取 +10% · 敌国规模上限 −10%',
        '永久星屑获取 +10% · 敌国规模上限 −15%'
      ],
      goal: { t: 'all', of: [{ t: 'dyson' }, { t: 'annex', n: 7 }] },
      goalText: '完成戴森球工程（虚境飞升亦算），并已吞并全部 7 个敌国',
      tiers: [
        { label: '一档', cap: 1.5 },
        { label: '二档', cap: 2 },
        { label: '三档', cap: 3 }
      ] }
  ];
  var BY_ID = {};
  for (var i = 0; i < DEFINITIONS.length; i++) BY_ID[DEFINITIONS[i].id] = DEFINITIONS[i];

  /* ⚠️ 这个对象是**进度白名单**：`state-migrate` 与 `progress()` 都靠它兜底，新增挑战
   *   漏登记 ⇒ 老档读回来的 completed 里没有这个键 ⇒ tierDone 恒 0 ⇒ 每次进游戏都像没通过、
   *   重打还能再领一次奖（2026-11-02 加 waterpollution 时同步补上）。 */
  function emptyProgress() { return { completed: { cold: false, small: false, science: 0, abyss: 0, speedrun: 0, dyson_rush: 0, drift_terra: false, waterpollution: false,
    anarchy: false, good_old_days: false, three_launch_sites: false, eternity_moment: 0, pacifist: false,
    weapon_critique: false, totalwar_doctrine: false, raider: false, conqueror: 0 } }; }
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
    /* goal 型（流浪泰拉 / 水体污染 / 四项终局挑战）的终点**全在壳外**：
     *   流浪泰拉要的 50 座行星发动机、水体污染要的戴森球，都是破壳之后才建得起来的。
     * ⇒ 破壳不是 goal 型的终点。旧判据 `s.broken && !d.persistAfterShell` 会让
     *   「进行中」在破壳那一刻消失（2026-11-04 用户报「一破壳挑战就被清除」），连带三个后果：
     *     · 挑战页整排退回「尚未完成 / 下一档可挑战」；
     *     · canStart 变 true（它只拦 active），卡片给出「结算并挑战」；
     *     · 那个按钮真的能点 —— begin() 会直接 startRun，当前 ERA10 进度当场丢掉。
     *   而真源从没丢：s.challenge 还在、evaluate() 照常按 goal 发奖、
     *   寒流必冰封与太阳帆 ×0.5 在 economy.js 里硬编码 id 判断、根本不看这里
     *   ⇒ 坏的不是挑战本身，是这一处状态与随之出现的入口。
     * ⚠️ 这里**不许再出现 s.broken**：goal 型的唯一结束条件是 challengeDone。
     * ⚠️ 与破壳型五项口径不同：那五项破壳即定格成绩，但限制撤不撤由玩家在卡片上点
     *   （s.challengeReleased，2026-11-03 用户拍板），所以它们读的是 challengeReleased。 */
    if (d.goal) {
      if (s.challengeDone) return null;
      return a;
    }
    return s.challengeReleased ? null : a;
  }
  /* 解除本轮挑战限制：一次性，不可再打开（否则等于「打不过就关、想刷榜再开」）。
   * 非挑战局 / 已解除 ⇒ false，不重复写日志。 */
  function release(s) {
    var a = s && s.challenge, d = a && BY_ID[a.id];
    if (!d || s.challengeReleased) return false;
    s.challengeReleased = true;
    if (SB.game && SB.game.log)
      SB.game.log(challengeTr('challenge.release.log', {
        challengeName: challengeDisplayText(d, 'name')
      }, '已解除「' + d.name + '」的限制，本局按正常规则继续（之后无法再打开）。'));
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
  function bypassGovernmentGates(s) {
    var a = active(s);
    return !!(a && a.id === 'good_old_days');
  }
  function governmentLocked(s) {
    var a = active(s);
    return !!(a && a.id === 'good_old_days' && s.gov !== 'tribe');
  }
  /* 战争行动是否被挑战禁用（2026-11-12）：细粒度拦截，返回禁用原因或 null。
   * · pacifist（批判的武器）        → 全部战争行动被禁（reason='pacifist'）
   * · totalwar_doctrine（早打…）    → 只许全面战争，劫掠/入侵被禁（reason='totalwar_only'）
   * · raider（grubby）             → 只许劫掠，入侵/全面战争被禁（reason='raider_only'）
   * war.js 的 executeAction 顶部据此预防性拦截；UI 三按钮也按 action.id 逐键禁用并提示。
   * ⚠️ 吞并 / 软实力不在此列（各有独立拦截点）。 */
  function warActionBlockedReason(s, actionId) {
    var a = active(s);
    if (!a) return null;
    if (a.id === 'pacifist') return 'pacifist';
    if (a.id === 'totalwar_doctrine' && actionId !== 'totalWar') return 'totalwar_only';
    if (a.id === 'raider' && actionId !== 'raid') return 'raider_only';
    return null;
  }
  /* 战争动作整组被禁（批判的武器）。保留给 UI「全部按钮禁用」与既有 e2e 断言。 */
  function warBlocked(s) {
    var a = active(s);
    return !!(a && a.id === 'pacifist');
  }
  /* 软实力（传播文化 / 传道信仰）是否被挑战禁用（武器的批判）。war.js 的
   * executeSoftPowerAction 顶部据此拦截；UI 软实力按钮也禁用。 */
  function softPowerBlocked(s) {
    var a = active(s);
    return !!(a && a.id === 'weapon_critique');
  }
  /* 贸易路线是否被挑战禁用（武器的批判）。war.js 的 establishTradeRoute 顶部据此拦截；
   * UI 商路按钮也禁用。 ⚠️ 战争页商路按钮用的是 civics.trade 门，本函数只在已解锁后追加禁。 */
  function tradeRouteBlocked(s) {
    var a = active(s);
    return !!(a && a.id === 'weapon_critique');
  }
  /* 敌方规模恢复倍率（征服者三档）。recoverEnemy 据此放大恢复速度；
   * 读 activeTier(s).cap（1.5 / 2 / 3）。非征服者或破壳后返回 1。 */
  function enemyRecoveryMul(s) {
    var a = active(s);
    if (!a || a.id !== 'conqueror') return 1;
    var tier = activeTier(s);
    return tier && typeof tier.cap === 'number' && tier.cap > 0 ? tier.cap : 1;
  }
  /* 战争行动军力消耗倍率（武器的批判通关奖励 -10%）。actionCost 据此永久生效。 */
  function warCostMul(s) {
    return tierDone('weapon_critique', SB.game && SB.game.meta ? SB.game.meta() : null) >= 1 ? 0.9 : 1;
  }
  /* 士兵职业产出倍率（早打大打打核大战通关奖励 +15%）。war.js 的 rate 据此永久生效。 */
  function soldierOutputMul(s) {
    return tierDone('totalwar_doctrine', SB.game && SB.game.meta ? SB.game.meta() : null) >= 1 ? 1.15 : 1;
  }
  /* 战利品产出倍率（grubby 通关奖励 +20%）。war.js 的 executeAction 据此永久生效。 */
  function lootYieldMul(s) {
    return tierDone('raider', SB.game && SB.game.meta ? SB.game.meta() : null) >= 1 ? 1.2 : 1;
  }
  /* 敌国规模上限永久乘区（征服者三档通关奖励）。
   * effectiveMaxScale 据此永久生效；读 tierDone('conqueror')（0/1/2/3）→ 1 / 0.95 / 0.90 / 0.85（−5%/−10%/−15%）。
   * 与 faith/culture/soft_power 对「单个敌国」按敌国累积的削减是不同轴：本函数是全局永久乘区，
   * 不写入 enemy.faithReduction 等字段。不放 s 参数——它只依赖 profile 的已完成档位。 */
  function enemyScaleCapMul() {
    var meta = SB.game && SB.game.meta ? SB.game.meta() : null;
    var conq = tierDone('conqueror', meta);
    return ([1, 0.95, 0.90, 0.85])[conq] || 1;
  }
  /* ══ 两个倍率读数，绝不可混用（2026-11-09 用户拍板 #1）═══════════════════
   * recordedMultiplier(s) ——「本局档位快照」，只依赖 s.challenge.id / tier。
   *   ⚠️ 不看 active()：goal 型一达成 active() 立刻返回 null（它的终点是 challengeDone），
   *      但本局依然是「五倍永恒」这一局。冰壳 / 星空 / 太阳帆 / 戴森节点是**目标分母**，
   *      与限制撤不撤无关。达成瞬间塌回基础值会造成两处可见错误：
   *        · 竣工面板显示 258,358 / 10,000（本该 / 50,000）—— 玩家报「怎么没翻倍」；
   *        · starPct 凭空变大 ⇒ 星屑结算、群星与神明信仰、星空尤里卡全被重算。
   *      ⚠️ 判定与面板之间还隔着 4 段分镜（render.showDysonEnding 0/1500/3200/4900ms），
   *          showDysonCompletePanel 读分母时 challengeDone 早已是 true，塌陷必然发生。
   *   ⇒ 目标类（shellTarget / starCap / dysonSailCap / dysonNodeCap）一律读这里。
   * multiplier(s) ——「限制是否仍生效」，依赖 active()，达成/解除后掉回 1。
   *   供限制类使用（researchCostMul）；研究成本 ×5 在达成后解除并叠加永久折扣是设计意图。
   * ⚠️ 禁止把任一出口改成直接乘 CFG 常量、或换用另一个读数 —— 口径分裂正是本次 bug 根因。 */
  function recordedMultiplier(s) {
    var a = s && s.challenge, d = a && BY_ID[a.id];
    if (!d || d.id !== 'eternity_moment') return 1;
    var tier = d.tiers[Math.max(0, Math.min(d.tiers.length - 1, a.tier | 0))];
    return tier && tier.cap ? tier.cap : 1;
  }
  function multiplier(s) {
    var a = active(s);
    return a && a.id === 'eternity_moment' ? recordedMultiplier(s) : 1;
  }
  /* 目标分母 = 基础常量 × 本局档位快照。竣工面板 / 挑战页进度 / 星屑结算 / 信仰加成 /
   * 星空尤里卡 / 戴森竣工判据 / AI bot 全部经由这三个函数，达成前后必须恒等。 */
  function starCap(s) { return (SB.CFG.STAR_CAP || 0) * recordedMultiplier(s); }
  function dysonSailCap(s) { return (SB.CFG.DYSON_SAIL_CAP || 10000) * recordedMultiplier(s); }
  function dysonNodeCap(s) { return (SB.CFG.DYSON_NODE_CAP || 1000) * recordedMultiplier(s); }
  function shellTarget(s) {
    var base = Number(s && s.baseShell) || Number(SB.CFG.ICE_SHELL) || 0;
    var thin = (s && s.perk && s.perk.thin) || 0;
    return Math.round(base * Math.max(0.1, 1 - 0.1 * thin) * recordedMultiplier(s));
  }
  function applyShellTarget(s) {
    if (!s || !s.challenge || s.challenge.id !== 'eternity_moment') return false;
    s.iceShell = shellTarget(s);
    s.shell = s.iceShell;
    return true;
  }
  function researchCostMul(s) {
    var meta = SB.game && SB.game.meta ? SB.game.meta() : null;
    var done = tierDone('eternity_moment', meta);
    /* ⚠️ 这里**故意**读 multiplier（限制口径），不是档位快照：研究点成本 ×5 是挑战期间的
     * 限制，达成后解除并叠加永久 -5%/-10%/-15% 奖励。与三个 cap 的口径分裂是设计意图，
     * 不是遗漏；把这一行改成 recordedMultiplier 会让通关后研究成本永远卡在 5 倍。 */
    return multiplier(s) * Math.max(0, 1 - 0.05 * done);
  }
  function stardustRewardMul(meta) {
    var count = tierDone('anarchy', meta) + tierDone('good_old_days', meta) +
      tierDone('three_launch_sites', meta) + tierDone('eternity_moment', meta) +
      tierDone('pacifist', meta) + tierDone('weapon_critique', meta) +
      tierDone('totalwar_doctrine', meta) + tierDone('raider', meta) +
      tierDone('conqueror', meta);
    return 1 + 0.10 * count;
  }
  function launchHydroRewardMul(meta) {
    return tierDone('three_launch_sites', meta) ? 0.9 : 1;
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
    var label = SB.folk && SB.folk.localizedJobName ? SB.folk.localizedJobName(s, job)
      : SB.folk && SB.folk.jobName ? SB.folk.jobName(s, job) : job === 'scholar' ? '学者' : '书手';
    return challengeTr('challenge.job_limit.reason', { jobName: label, cap: cap },
      '忽视科文挑战限制：' + label + '已达 ' + cap + ' 人上限');
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
    /* 星海竞速奖励与逐光竞速同款、独立叠加（2026-11-07）：三档各 +5/10/15% 全产出。
     * 不复用 speedDone 那一档账本 —— 两项挑战各有自己的 completed 计数。 */
    var rushDone = tierDone('dyson_rush', meta);
    if (rushDone) m *= 1 + [0, 0.05, 0.10, 0.15][rushDone];
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
  /* 起始人口：小国寡民 +3、水体污染 +2（两项都通过则叠加）。
   * ⚠️ 征服者奖励已改为「敌国规模上限 −5/−10/−15%」（永久全局乘区，见 enemyScaleCapMul），
   * 不再加起始人口，故此处不再读 conqueror 档位。 */
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
    /* 发射场门槛在 dysonDone 置位的同一 tick 冻结，不能竣工后再补等级通关。 */
    if (goal.t === 'dysonLaunchSites') return !!(s.dysonDone && s.dysonLaunchSitesReady);
    /* 戴森球竣工（ERA10 终局，2026-11-02 加）：`s.dysonDone` 是 economy-tick 里
     *   dysonPct(s) >= 1 时置位的一次性旗；飞升虚境（civics.ascend_void）也收敛到它，
     *   所以这里不需要额外的 `|| s.ascendVoidDone` 分支。 */
    if (goal.t === 'dyson') return !!s.dysonDone;
    /* 吞并计数（2026-11-12 征服者）：统计本局已吞并（status==='annexed'）的敌国数 ≥ n。
     * ⚠️ 只影响带 `annex` 的 goal；其余 goal 型（drift_terra / waterpollution /
     *    dyson_rush / 批判的武器 / 武器的批判）走各自既有分支，互不影响。 */
    if (goal.t === 'annex') {
      var enemies = s && s.war && s.war.enemies, annexed = 0, ek;
      if (!enemies) return false;
      for (ek in enemies) if (Object.prototype.hasOwnProperty.call(enemies, ek) && enemies[ek] && enemies[ek].status === 'annexed') annexed++;
      return annexed >= goal.n;
    }
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
    /* 限时 goal 型（星海竞速）：超时即本档失败 —— 不发奖、不写账本、不上榜、不弹完成面板。
     * ⚠️ 破壳型的超时在 resolveRun 里判（d.id === 'speedrun'），goal 型根本不走那段；
     *    少了这一行，超时后 goalMet(dyson) 仍可能成立 ⇒ 玩家超时通关照样领奖。
     *    判据与那处同源：tiers[当前档].cap，由 timedOut() 统一读。 */
    if (d.timed && timedOut(s)) return null;
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
      if (SB.game && SB.game.log) SB.game.log(challengeTr('challenge.award.replay_log', {
        challengeName: challengeDisplayText(d, 'name'),
        goalText: challengeDisplayText(d, 'goalText')
      }, '再次达成' + d.name + '：' + d.goalText + '。本局不重复发奖；如有对应排行榜，则会更新成绩。'));
      return replayOutcome;
    }
    if (tier !== tierDone(d.id, meta) || !goalMet(s, d.goal)) return null;
    if (!meta.challenges) meta.challenges = emptyProgress();
    meta.challenges.completed = meta.challenges.completed || {};
    meta.challenges.completed[d.id] = d.tiers.length === 1 ? true : tier + 1;
    var outcome = { id: d.id, name: d.name, tier: tier, label: d.tiers[tier].label, reward: rewardFor(d, tier), goalText: d.goalText };
    s.challengeDone = true;
    s.challengeOutcome = outcome;
    meta.challengePopupPending = outcome;
    if (d.onComplete) d.onComplete(s, meta);
    /* 每项挑战都有一个专属成就；分档挑战只在最高档首次完成时解锁。 */
    if (tier === d.tiers.length - 1 && d.achievementKey && SB.achv && SB.achv.unlockOnce)
      SB.achv.unlockOnce(d.achievementKey, meta);
    if (d.rankKey && SB.rank && SB.rank.submitRun)
      SB.rank.submitRun([{ key: d.rankKey, value: d.rankValue ? d.rankValue(s) : 0 }]);
    if (SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
    /* ⚠️ 季长奖励落在**本局**（s.seasonLengths），saveMeta 管不到它。
     * 不立刻落盘 ⇒ 自动存档（5 秒）之间刷新 / 切后台被杀 ⇒ 读回来是「已完成 + 旧季长」，
     * 而 resumeRun 只在 seasonLengthsVersion 缺失时重算 ⇒ 寒流 600→300 这条奖励静默丢失
     * （2026-10-31 检查发现）。这一行是奖励入账的一部分，不是可选的保险。 */
    if (SB.state && SB.state.saveRun) SB.state.saveRun(s);
    if (SB.game && SB.game.log) SB.game.log(challengeTr('challenge.award.success_log', {
      challengeName: challengeDisplayText(d, 'name'),
      goalText: challengeDisplayText(d, 'goalText')
    }, d.name + '挑战达成：' + d.goalText + '。永久奖励已生效。'));
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
      var def = BY_ID[out.id], challengeName = challengeDisplayText(def, 'name');
      var message = out.failed
        ? challengeTr('challenge.seal.failure_log', {
            challengeName: challengeName,
            limit: formatClock(out.limit)
          }, out.name + '挑战未通关：已超过 ' + formatClock(out.limit) + '，本档奖励未领取。')
        : out.replay
          ? challengeTr('challenge.seal.replay_success_log', {
              challengeName: challengeName,
              tierName: challengeDisplayText(def, 'tierLabel', out.tier)
            }, out.name + '挑战达成：' + out.label + '（重复挑战不再发奖；如有对应排行榜，则会更新成绩）。')
          : challengeTr('challenge.seal.success_log', {
              challengeName: challengeName,
              tierName: challengeDisplayText(def, 'tierLabel', out.tier)
            }, out.name + '挑战达成：' + out.label + '，永久奖励已生效。');
      SB.game.log(message);
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
  /* 2026-11-07 泛化：判据从「id === speedrun」改为「定义带 timed」，让限时 goal 型
   * （星海竞速）与破壳型（逐光竞速）共用同一套计时。⛔ 不能改成「tiers[].cap 是数字」——
   * eternity_moment 的 cap 是 5/10/20 倍率，会被当成秒数立刻判超时。 */
  function remainingSeconds(s) {
    var a = active(s), tier = activeTier(s), d = a && BY_ID[a.id];
    if (!a || !d || !d.timed || !tier) return null;
    return Math.max(0, tier.cap - elapsedSeconds(s));
  }
  function timedOut(s) {
    var challenge = s && s.challenge, d = challenge && BY_ID[challenge.id];
    if (!challenge || !d || !d.timed) return false;
    var tier = d.tiers[Math.max(0, Math.min(d.tiers.length - 1, challenge.tier | 0))];
    return elapsedSeconds(s) >= tier.cap;
  }
  function formatClock(seconds) {
    if (!isFinite(seconds)) return challengeTr('challenge.timer.invalid', {}, '计时数据无效');
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
  /* ── 挑战开启前置（2026-11-05 · 流浪泰拉第 15 次轮回）──────────────────────
   * ⚠️ 口径（2026-11-06 改）：点「结算并挑战」→ begin() 先 doBreak → startRun()。
   *    doBreak 只在**过资格门（已建《神学》）**时让 meta.cycle +1；未研究《神学》时走
   *    locked 分支，cycle 不动。startRun 现在只涨 meta.runs（局数），不碰 cycle。
   *    ⇒ 「进局后的轮回次数」= now + (本次会结算 ? 1 : 0)，不能再无条件 +1。
   *    旧口径是「startRun 必 +1 ⇒ after = now+1」，cycle 收紧后那条推导已失效。
   * ⚠️ ok / lack 给「还没开始」的卡片与门禁用；inRunOk / lackInRun 给「进行中」
   *    的通知条用（那时 cycle 已经加过了，不能再 +1，否则面板会撒谎）。
   * ⚠️ willBreak 是可选第三参：纯函数调用方（回归夹具）显式传 true/false，免得被当前
   *    真实局的状态污染；不传时按当前局推算（!breakSettled && qualified）。
   * ⚠️ 只对 DEFINITIONS 里带 prereq 的挑战生效，其余十项一行都不碰。 */
  function willBreakFrom(s) {
    return !!(s && !s.breakSettled && SB.prestige && SB.prestige.qualified && SB.prestige.qualified(s));
  }
  function prereqState(id, meta, willBreak) {
    var d = BY_ID[id], p = d && d.prereq;
    if (!p || p.t !== 'cycle') return null;
    var m = meta || (SB.game && SB.game.meta ? SB.game.meta() : null);
    var now = (m && Number(m.cycle)) || 0;
    var need = Number(p.n) || 0;
    if (willBreak === undefined) willBreak = willBreakFrom(SB.game && SB.game.run ? SB.game.run() : null);
    var after = now + (willBreak ? 1 : 0);
    return { need: need, now: now, after: after,
      ok: after >= need, lack: Math.max(0, need - after),
      inRunOk: now >= need, lackInRun: Math.max(0, need - now) };
  }
  function challengeTr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params || {}) : '';
    return value || fallback || '';
  }
  function challengeDisplayText(def, field, tierIndex) {
    var renderParts = SB.ui && SB.ui.renderParts;
    if (renderParts && typeof renderParts.challengeDefinitionText === 'function')
      return renderParts.challengeDefinitionText(def, field, tierIndex);
    if (!def) return '';
    if (field === 'tierLabel' && def.tiers[tierIndex]) return def.tiers[tierIndex].label;
    if (field === 'reward' && def.tiers.length > 1) return def.rewards[tierIndex] || '';
    return def[field] || '';
  }
  function prereqText(id, meta, willBreak) {
    var st = prereqState(id, meta, willBreak);
    if (!st) return '';
    var params = {
      requiredPrestiges: st.need,
      currentPrestiges: st.now,
      prestigesAfterStart: st.after,
      remainingPrestiges: st.lack
    };
    /* cycle 现在数已结算轮回次数；中英文提示都沿用同一组判据。 */
    return challengeTr(st.ok ? 'challenge.prerequisite.met' : 'challenge.prerequisite.unmet',
      params, st.ok
        ? '需完成 ' + st.need + ' 次轮回：已满足（当前 ' + st.now + ' 次，开始挑战后 ' + st.after + ' 次）。'
        : '需完成 ' + st.need + ' 次轮回（当前 ' + st.now + ' 次，开始挑战后 ' + st.after +
          ' 次，还差 ' + st.lack + ' 次）。轮回不足时《严冬计划》科技链的前置《黑历史蓝图》不会揭露，本局无法通关。');
  }
  function prereqOk(id, meta, willBreak) {
    var st = prereqState(id, meta, willBreak);
    return !st || st.ok;
  }
  function canStart(id, s, meta) {
    var d = BY_ID[id];
    if (!d || active(s)) return false;
    return prereqOk(id, meta, willBreakFrom(s));
  }
  function canStartFresh(id, s, meta) {
    var d = BY_ID[id];
    if (!d || active(s)) return false;
    return tierDone(id, meta) < d.tiers.length && prereqOk(id, meta, willBreakFrom(s));
  }
  function begin(id) {
    var s = SB.game.run(), meta = SB.game.meta(), d = BY_ID[id];
    if (!canStart(id, s, meta)) return false;
    var tier = startTier(id, meta), replay = isReplay(id, meta);
    /* 自动结算当前周目；没有《神学》时沿用普通重开的规则，不发轮回点。
     * ⚠️ 2026-11-04 修「挑战页结算并挑战吞掉整局结算」：判据必须是 **本局是否已结算**
     *   （breakSettled），不是 `!s.broken`。2026-11-03 起破壳 ≠ 本局结束，s.broken 从壳
     *   归零那一刻起一直是 true 直到换局，而结算只在玩家主动点轮回/本按钮时发生 ⇒
     *   旧判据让破壳后点这颗按钮整段跳过 doBreak，紧接着 startRun 把当前局丢掉，
     *   轮回点与星屑一分不发（确认面板却按 breakReport 承诺了一个数字）。
     *   破壳前的提前轮回也必须照常结算，故不能改成「必须已破壳」。
     *   重复结算不必在这里防：prestige.doBreak 首行有 breakSettled 幂等早退。 */
    if (s && !s.breakSettled && SB.prestige.qualified(s))
      SB.prestige.doBreak(s, SB.game.emit, { silent: true, challengeStart: true });
    SB.game.startRun({ challenge: { id: id, tier: tier, replay: replay } });
    SB.game.setTab('challenges');
    SB.game.log(challengeTr(replay ? 'challenge.begin.replay_log' : 'challenge.begin.start_log', {
      challengeName: challengeDisplayText(d, 'name'),
      tierName: challengeDisplayText(d, 'tierLabel', tier)
    }, replay
      ? '再次挑战：' + d.name + ' · ' + d.tiers[tier].label + '（不重复发放奖励；如有对应排行榜，则会更新成绩）。'
      : '挑战开始：' + d.name + ' · ' + d.tiers[tier].label));
    SB.game.renderAll();
    return true;
  }
  function prepareStart(id) {
    var s = SB.game.run(), meta = SB.game.meta(), d = BY_ID[id];
    if (!canStart(id, s, meta)) return false;
    var tier = startTier(id, meta), replay = isReplay(id, meta), t = d.tiers[tier];
    var qualified = SB.prestige.qualified(s), report = qualified ? SB.prestige.breakReport(s) : null;
    var payout = report ? report.tidePoints : 0;
    /* 2026-11-07 泛化：两项限时挑战共用「必须在 X 内 + 各自终点」；
     * 破壳型（逐光竞速）没有 goalText ⇒ 回落原文案，goal 型（星海竞速）读自己的 goalText。 */
    var selectedRule = d.timed
      ? challengeTr('ui.challenge.tier_rule.speedrun', { timeLimit: formatClock(t.cap) },
          '限时 ' + formatClock(t.cap) + ' · 离线计时') + '. ' + challengeDisplayText(d, 'goalText')
      : d.id === 'science'
        ? challengeTr('ui.challenge.tier_rule.science', {
            scribeName: SB.folk.jobName(s, 'scribe'),
            staffCap: t.cap
          }, '学者与书手各不得超过 ' + t.cap + ' 人')
        : d.id === 'abyss'
          ? challengeTr('ui.challenge.tier_rule.production_penalty', {
              productionPenaltyPercent: Math.round(t.cap * 100)
            }, '本轮全产出 -' + Math.round(t.cap * 100) + '%')
          : challengeDisplayText(d, 'rule');
    var prereqLine = prereqText(id, meta);
    var challengeName = challengeDisplayText(d, 'name');
    var tierName = challengeDisplayText(d, 'tierLabel', tier);
    var currentRunNotice = challengeTr('ui.challenge.start.confirm.current_run_notice', {},
      '当前周目将自动结算并重开。');
    var rewardNotice = qualified
      ? challengeTr('ui.challenge.start.confirm.estimated_prestige_reward', {
          prestigePointPayout: payout.toFixed(2)
        }, '预计获得 <b>' + payout.toFixed(2) + ' 轮回点</b>。')
      : challengeTr('ui.challenge.start.confirm.theology_required', {},
          '尚未完成《神学》，本次不会获得轮回点。');
    var resetNotice = challengeTr('ui.challenge.start.confirm.reset_notice', {},
      '本局进度会重置；轮回点、已完成挑战与永久奖励保留。');
    var replayNotice = replay
      ? '<br>' + challengeTr('ui.challenge.start.confirm.replay_notice', {},
          '本次为重复挑战：通关不再发放永久奖励，也不会再次提高轮回点获取，只刷新排行榜成绩。')
      : '';
    SB.ui.render.confirmPanel({
      title: challengeTr(replay ? 'ui.challenge.start.confirm.title.replay' : 'ui.challenge.start.confirm.title.fresh', {},
        replay ? '再次开始这项挑战？' : '结算并开始挑战？'),
      body: '<div class="warnbox">' + currentRunNotice + ' ' + rewardNotice +
        '</div><div class="note"><b>' + challengeName + ' · ' + tierName +
        (replay ? challengeTr('ui.challenge.start.confirm.replay_tag', {}, ' · 重复挑战') : '') + '</b><br>' +
        selectedRule + (prereqLine ? '<br>' + prereqLine : '') + '</div>' +
        '<div class="note">' + resetNotice + replayNotice + '</div>',
      ok: challengeTr(replay ? 'ui.challenge.start.confirm.button.replay' : 'ui.challenge.start.confirm.button.settle_and_start', {},
        replay ? '再次挑战' : '结算并开始'),
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
    active: active, activeTier: activeTier,     ignorePopulationGates: ignorePopulationGates,
    bypassGovernmentGates: bypassGovernmentGates, governmentLocked: governmentLocked,
    warBlocked: warBlocked, warActionBlockedReason: warActionBlockedReason,
    softPowerBlocked: softPowerBlocked, tradeRouteBlocked: tradeRouteBlocked,
    enemyRecoveryMul: enemyRecoveryMul, warCostMul: warCostMul,
    soldierOutputMul: soldierOutputMul, lootYieldMul: lootYieldMul,
    enemyScaleCapMul: enemyScaleCapMul,
    /* 限制口径 / 档位快照口径。shellMultiplier 是历史别名（壳厚目标最早只用在这一处），
     * 保留不删；新代码请用语义明确的 runMultiplier。 */
    multiplier: multiplier, runMultiplier: recordedMultiplier, shellMultiplier: recordedMultiplier,
    starCap: starCap, dysonSailCap: dysonSailCap, dysonNodeCap: dysonNodeCap,
    shellTarget: shellTarget, applyShellTarget: applyShellTarget,
    researchCostMul: researchCostMul, stardustRewardMul: stardustRewardMul,
    launchHydroRewardMul: launchHydroRewardMul,
    jobLimit: jobLimit, jobLimitReason: jobLimitReason, jobLimitExceeded: jobLimitExceeded,
    productionMul: productionMul, scienceCultureMul: scienceCultureMul,
    warmstoneMul: warmstoneMul, populationLimit: populationLimit,
    growthDuration: growthDuration, startingPopulation: startingPopulation,
    elapsedSeconds: elapsedSeconds, remainingSeconds: remainingSeconds, timedOut: timedOut, formatClock: formatClock,
    warmHeatingBlocked: warmHeatingBlocked, canStart: canStart, canStartFresh: canStartFresh,
    prereqState: prereqState, prereqText: prereqText, prereqOk: prereqOk,
    startTier: startTier, isReplay: isReplay,
    begin: begin, prepareStart: prepareStart,
    resolveRun: resolveRun, rewardFor: rewardFor, goalMet: goalMet, evaluate: evaluate,
    seal: seal, sealRun: sealRun, release: release,
    entered: function (s, id) { return !!(s && s.challenge && s.challenge.id === id); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
