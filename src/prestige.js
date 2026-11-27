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

  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }

  /* 建筑 → 起始解锁纪元（metaEra）。按各建筑解锁所依赖的科技/市政纪元反查（见方案文档）：
   *   纪元权重 W: 1/2/3/5/8（暗流/冷焰/硫泉/洋流/破壳纪）。
   * 仅 defaultUnlockable / 仅 unlockRatio 的建筑归纪元 1。 */
  /* ERA6–10 星海/新建筑回填（2026-10-19 · docs/ERA9_TECHS_SPEC §9；ERA10 2026-10-20 续）：
   *   旧档 W 只到 5、META_ERA 只到 era5，
   *   导致 era6+ 建筑（科研所/太空建筑/异星建筑/寻光纪建筑）在破壳结算 buildingScore 里被 `if(!e) continue` 静默跳过。
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
     *   （虚境祭坛虽是"无产出"建筑，但有人口阶梯造价，理应在发展分里算数）。 */
    solar_ring: 10, terra_launch: 10, enceladus_launch: 10, void_altar: 10
  };

  /* 调和级数 H(n) = Σ_{k=1..n} 1/k，用于旧日艺术品/碑石的固定速率递减。
   *
   * ⚠️⚠️ 2026-10-29 P0（玩家「三周目卡爆了·划一下十几秒才有反应」的根因）：
   *   本函数是 **O(n)**，而 n = meta.oldArtworkEarnedTotal / oldTideStelesEarnedTotal。
   *   这两个字段是**跨周目累加**的（见 doBreak ⑤：`+= r.oldArtwork`），而 artwork /
   *   tidalRecord 都是 `kind:'craft'` ⇒ **不设 CAP_BASE ⇒ capOf 恒 Infinity ⇒ 无上限**。
   *   于是「戴森球那一局」长时间挂机自动制作出来的件数（实测可到数万件）会全部折进 n。
   *
   *   致命之处不在 O(n) 本身，而在**调用频次**：legacy() 被 baseMul() → globalMul() →
   *   每个资源的每次取率都调一次。CDP 实测 **1100~4000 次/秒**（空闲态即如此）。
   *   n=0 时单次 0.3µs（无感）；n=6 万时单次 2.9ms ⇒ 一秒光 harmonic 就吃掉 546% CPU：
   *     · 遗产 5,000 件 → 占空比  71.8%（6× 降频，约等于中端手机）
   *     · 遗产 20,000 件 → 占空比 250.6%，主循环一拍 3.3s
   *     · 遗产 60,000 件 → 占空比 546.0%，主循环一拍 9.1s，loopAge 10.8s ← 与玩家「十几秒」逐字吻合
   *   而这两笔遗产**只在轮回结算那一刻写入** ⇒ 症状必然出现在「下一次开新周目」的瞬间，
   *   与「第一次轮回后做完戴森球，然后开三周目就卡爆」完全同形。
   *
   * 【修法】结果放缓存，按「已知的最大 n」增量续算 —— 摊还 O(1)，且**加法顺序与朴素写法
   *   逐位相同**（永远是从 1 顺着加到 n，只是从上次停下的地方接着加），所以
   *   harmonic(n) 的返回值与原实现**逐位相等**，任何数值/标定都不受影响。
   *   ⚠️ 不能只留「上一个 n」一个槽：实际有两个常驻输入（艺术品 + 碑石），
   *      单槽会在两者之间来回重置，等于没缓存。故留少量条目（升序查找 + 超限丢弃）。 */
  var _harmMemo = [{ n: 0, sum: 0 }];
  /* 数值护栏（2026-10-29）：n 超过 1e7 时改用闭式解 —— O(1)，把「异常/脏档把 n 写成天文
   * 数字」那一次性的 O(n) 首调（实测 1e8 ⇒ 冷启动 1058ms，手机 ≈ 6s）压到纳秒级。
   * ⚠️ 此分支**绝不写缓存**：近似值一旦成为增量 base，后续精确计算会从近似值接着加，
   *    结果既不是精确值也不是渐近值，误差被固化且无从察觉。
   * 精度（Euler–Maclaurin 保留到 1/n² 项，实测相对误差）：1e6 = 5.1e-14 / 1e7 = 1.6e-13 /
   *   1e8 = 7.1e-14 ⇒ 远低于双精度自身的累积噪声（~1e-13）。
   * 阈值以上玩家现实不可达（前台挂机约 890 件/小时 ⇒ 1e7 件要一年以上，且离线补算不跑工坊），
   * 故**所有玩家可及数值逐位不变**；这纯粹是防脏档/防改档的保险。 */
  var H_GAMMA = 0.5772156649015329, H_EXACT_MAX = 1e7;
  function harmonic(n) {
    n = Math.floor(n);
    if (!(n > 0)) return 0;
    if (n > H_EXACT_MAX) return Math.log(n) + H_GAMMA + 1 / (2 * n) - 1 / (12 * n * n);
    var i, base = _harmMemo[0];
    for (i = 0; i < _harmMemo.length; i++) {
      if (_harmMemo[i].n === n) return _harmMemo[i].sum;
      if (_harmMemo[i].n < n && _harmMemo[i].n > base.n) base = _harmMemo[i];
    }
    var sum = base.sum;
    for (var k = base.n + 1; k <= n; k++) sum += 1 / k;
    _harmMemo.push({ n: n, sum: sum });
    /* 只留最近几条，防止脏存档（每帧变化的大数）把缓存表撑爆。 */
    if (_harmMemo.length > 6) _harmMemo.splice(1, 1);
    return sum;
  }

  /* 遗产产出系数：0.15 → **1.5**（2026-10-29 用户拍板 ×10，目的是「第二周目开局更快」）。
   * 语义锚点（别丢）：CFG 里该值与 UNIT.sci / UNIT.culture 同量纲（0.15）
   *   ⇒ 0.15 = 「1 件遗产 = 1 个学者」，1.5 = 「1 件 = 10 个学者」。长注见 config.js。
   * ⚠️ 原先这里是硬编码的 0.15（两处各写一遍）；改成读 CFG 是为了让「数值只改 config.js」
   *    这条纪律在这一处也成立（它们曾是漏网的例外）。 */
  var LEGACY_RATE = (CFG && CFG.LEGACY && typeof CFG.LEGACY.RATE_PER_ITEM === 'number')
    ? CFG.LEGACY.RATE_PER_ITEM : 1.5;

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
      oldArtworkCultureRate: LEGACY_RATE * harmonic(finiteOr(m.oldArtworkEarnedTotal, 0)),
      oldTideSteleScienceRate: LEGACY_RATE * harmonic(finiteOr(m.oldTideStelesEarnedTotal, 0)),
      oldFaithAllProductionBonus: 0.005 * faithTier,
      shopCivicBonus: 0.10 * (p.civicArchive || 0) * starPerkBoost,   // 星屑轮回共鸣放大每级效果
      shopScienceBonus: 0.10 * (p.tideProof || 0) * starPerkBoost
      /* ⚠️ 2026-10-23 潮汐之树：coldStoreLevel / matStoreLevel / shellSurveyLevel / wonderBlueprintLevel
       *   四个旧档已迁移进 s.perk（coldPenalty / matStore / shellSurvey / wonderBlueprint），
       *   改由结算侧直接读 s.perk（见 economy.js coldSeasonMul/capOf、shell.js、ai-strategy.js、wonder.js），
       *   此处不再产出这四个字段，避免「永远为 0 的谎言口」。 */
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
    /* 轮回点通用奖励：每完成一档**轮回挑战** +10%（用户 2026-11-22 拍板选项 4B）。
     * ⚠️ 口径从 completedCount 收窄到 prestigeTierCount：飞升挑战的 14 档不再计入轮回点，
     *   它们走自己那条账（veilPeriod 的 ascMul，飞升点 +10%/档）。改前两条账双计，
     *   飞升挑战通关会同时加飞升点和轮回点。
     * ⚠️ 减法方向：已通关过飞升挑战的老档，本项倍率会**下降**——这是修正双计，不是丢奖励。 */
    var challengeCompletions = SB.challenges
      ? (SB.challenges.prestigeTierCount || SB.challenges.completedCount)(SB.game.meta()) : 0;
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
    /* ⚠️ 2026-10-27：**先快照「壳有没有真的归零」，再动任何状态**。
     * 用户 2026-10-27 拍板的六态里，「研究完《神学》就能轮回、不必等凿穿」是合法路径
     * （主控区 #btnCycle 走的就是这里）。这条路进本函数时壳还在（shell>0）——此时绝不能把
     * shellOpened 置真：submitRankOnBreak 靠它区分「真通关」与「提前轮回」，一旦置真，
     * 一局几分钟就能往「最快通关」榜提交记录，榜会被刷掉。
     * 正常破壳走 shell.onShellZero，那里已先把 shell 置 0，故本判据对它恒真。 */
    var wasOpened = !!(s.shell <= 0);
    r.wasOpened = wasOpened;
    /* 破壳结算只允许进入一次；否则主循环在 shell<=0 时会每 100ms 重播结算/动画。 */
    s.broken = true;
    if (wasOpened) s.shellOpened = true;
    s.breakSettled = true;
    /* runBuffs（单局 buff，如旧日遗产自动制作标记等）在破壳结算这一刻清零：
     *   无论随后轮回（freshRun 重建 runBuffs）还是留在本局继续，效果都从结算这一刻起失效。 */
    s.runBuffs = {};
    if (!qualified(s)) {
      r.tidePoints = 0;
      r.locked = true;
      /* 挑战已在破壳那一刻判定并落账（2026-11-03，见 shell.onShellZero → challenges.sealRun）。
       * 这里只把本局已判定的结果带回报告供面板展示，绝不再判一次 ——
       * 再判一次会让「破壳后才补学《神学》」的局按结算时的人口/岗位重算，把已经定格的成绩改写。 */
      if (s.challengeOutcome && s.challengeOutcome.failed) r.challengeFailure = s.challengeOutcome;
      /* ⛔ 通关榜排除这一局（用户 2026-10-07 拍板：只认「凿穿 + 已建神学」）。
       * 仍然上报 wonder/cycle ——「建成了什么」不因没建神学而失效。*/
      if (SB.game.submitRankOnBreak) SB.game.submitRankOnBreak(s, r);
      if (SB.state && SB.game.snapshot && SB.game.run && SB.game.run() === s)
        SB.state.saveRun(SB.game.snapshot(s));
      /* 动画属于「壳归零」事件，由 shell.onShellZero 唯一触发。
       * 手动提前重开/轮回只展示结算，不把它伪装成凿穿天壳。 */
      if (!options.silent) (SB.game.showBreakPanel || SB.game.showBreakAnimation)(r);
      if (emit) emit(tr('ui.log.prestige.not_eligible', null, '本局未达《神学》资格门，不发放轮回点。'));
      return r;
    }
    // ① 轮回点（唯一可消费货币）
    /* ERA6 市政《文明构造》：拥有则**本轮回**轮回点 +20%（拥有当轮 tidePoints ×1.2，
     * 不跨周目累积）。在写入 meta.tide 之前乘，与「本局结算」口径一致；未拥有 = 不乘。 */
    if (s.civics && s.civics.civilization) r.tidePoints *= 1.2;
    if (SB.voidFx && SB.voidFx.tideYieldMul) r.tidePoints *= SB.voidFx.tideYieldMul();
    meta.tide += r.tidePoints;
    meta.tideEarnedTotal = (meta.tideEarnedTotal || 0) + r.tidePoints;
    /* 2026-10-24 成就「十次轮回」（docs/ACHV_DESIGN_v0.3.md §四·4，事项 4 用户拍「只算轮回」）：
     * rebirths 是合格轮回计数器（软重置 / 神学前重置 / 未过资格门全不计）。
     * ⚠️ 老档无此键 ⇒ 从 0 起算，不追溯（历史轮回次数无法从 cycle 反推，见设计稿 §四·4）。 */
    meta.rebirths = (meta.rebirths || 0) + 1;
    /* 一往无前按本飞升周期内已完成的合格轮回计数；超出档位上限后，结算报告会带回失败结果。 */
    if (SB.challenges && SB.challenges.onQualifiedRebirth)
      SB.challenges.onQualifiedRebirth(s, meta);
    /* 2026-11-06 用户拍板：`meta.cycle` 从「局数」收紧为「**合格轮回次数**」，与 rebirths
     * 同侧同源 —— 这是它唯一 +1 的地方（startRun 只涨 runs，不再涨 cycle）。
     * 收紧的原因是 cycle 是老口径下唯一被收益读的点：潮汐之树 dyn:'loop5'（0.05×cycle，
     * 无上限）、《黑历史蓝图》尤里卡（cycle≥15）、市政鼓舞（3/7/10/15）、艺术品 +10%/cycle、
     * 「轮回次数」排行榜 —— 而旧 startRun 无条件 +1 ⇒「重开本周目」零成本刷这些。
     * ⚠️ 位置敏感：必须在下面 `SB.state.saveMeta(meta)` 和 `submitRankOnBreak` 之前，
     *    否则落盘与榜单会晚一拍（榜单那侧已改成直接报 m.cycle，不再 +1）。
     * ⚠️ 与 rebirths 保持同值但不合并：rebirths 从 0 起算、老档不追溯，而 cycle 在存量档里
     *    本来就带历史虚高值；两个字段各自保留才能既不收回既得利益、又保住成就的真实进度。 */
    meta.cycle = (meta.cycle || 1) + 1;
    /* 挑战必须完成《神学》资格并真正凿穿天壳；普通结算/重开不兑现挑战奖励。 */
    /* 同上：破壳型挑战在破壳那一刻就判完了（2026-11-03），结算只做账本。
     * 这里把结果带回报告，供「轮回结算」面板说明这次挑战赢没赢。 */
    if (s.challengeOutcome) {
      if (s.challengeOutcome.failed) r.challengeFailure = s.challengeOutcome;
      else r.challengeClear = s.challengeOutcome;
    }
    // ② 旧日信仰：本局剩余信仰并入总量
    /* ERA8 市政《信仰回响》（2026-10-18 用户表解锁2）：本轮回入账 ×1.2（仅当轮，不跨周目累积）。 */
    meta.oldFaith = (meta.oldFaith || 0)
      + Math.max(0, (s.res && s.res.faith) || 0) * ((s.civics && s.civics.faith_echo) ? 1.2 : 1)
      + (SB.faith && SB.faith.has && SB.faith.has(s, 'ancient_covenant')
        ? Math.max(0, Number(s.faithEarnedTotal) || 0) * 0.10 : 0);
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
    /* 帷幕周期账（ERA11 spec §3.3）：已掀幕的档每次合格轮回都把本局结算值累加进
     * veil.cycleTide / cycleStar，供掀幕预估与结算读取。未掀幕档（veil===null）不建账，
     * 避免给存量档凭空造出一份周期账（#4 口径 A）；首次掀幕的周期起点由
     * prestige.veilPeriod() 在读取时引导，这里不掺一脚。
     * ⚠️ 顺序敏感：必须排在下面写 s.got.stardust **之前**——那句读的是 cycleStar。 */
    if (meta.veil && typeof meta.veil === 'object') {
      meta.veil.cycleTide = (meta.veil.cycleTide || 0) + r.tidePoints;
      meta.veil.cycleStar = (meta.veil.cycleStar || 0) + _sd;
    }
    /* ⚠️ 2026-11-17（ERA11 #4 口径 A 的 W2）：这里原来直接写 meta.stardustEarned，
     * 掀幕后会把历史累计整笔喂回工坊效率与尤里卡（历史越滚越大、永不回落）。
     * 口径收口到 SB.state.starEarnedSeed：未掀幕=历史累计（行为零变化），
     * 掀幕后=本帷幕周期累计。与 state.js 的 freshRun 同一个函数，杜绝两套口径。 */
    if (s.got) s.got.stardust = (SB.state && SB.state.starEarnedSeed)
      ? SB.state.starEarnedSeed(meta) : meta.stardustEarned;
    /* 飞升资格按整个飞升周期锁存：任一已达门槛的周目结算后，后续普通轮回不撤销资格。 */
    var veilThreshold = SB.challenges && SB.challenges.veilStarThreshold
      ? SB.challenges.veilStarThreshold(s) : 1000;
    if (!meta.veilReady && s.techs && s.techs.beyond_veil && veilPeriod(meta, null).star >= veilThreshold)
      meta.veilReady = true;
    // 首次合格轮回即解锁商店
    if (!meta.shopUnlocked) meta.shopUnlocked = true;
    /* ═══ ERA11/12 跨轮回账（2026-11-23 · spec §0）════════════════════════════
     * ⚠️ 只认真轮回 doBreak；软重置/重开走 startRun，不写这份账。
     * 【逆时屋】本局新建及已激活的携带屋进入下局；未激活的携带屋会在本次轮回后丢失。 */
    if (meta.chrono && typeof meta.chrono === 'object') {
      var _chronoReactivatedCount = s.chrono ? Math.max(0, Math.floor(Number(s.chrono.reactivatedCount) || 0)) : 0;
      var _chronoBuiltCount = s.lvl ? Math.max(0, Math.floor(Number(s.lvl.chrono_house) || 0)) : 0;
      meta.chrono.carriedCount = _chronoReactivatedCount + _chronoBuiltCount;
    }
    /* 【船团】本局建成 ⇒ 跨轮回累计 +1 座、暗物质加成 +10%（100 tenths）。
     * 建成立即生效靠 darkmatterOutMul 读 bonusTenths，这里只做换局累积。 */
    if (meta.armada && typeof meta.armada === 'object'
      && s.wonders && s.wonders.starship_armada) {
      meta.armada.count = (Number(meta.armada.count) || 0) + 1;
      meta.armada.cycleCount = (Number(meta.armada.cycleCount) || 0) + 1;
      meta.armada.bonusTenths = (Number(meta.armada.bonusTenths) || 0) + 100;
    }
    if (SB.wonder && SB.wonder.onOrdinaryBreak) SB.wonder.onOrdinaryBreak(meta);
    /* 【升维基准】不在 doBreak 写——规格 §2 明定「首次建成 reality_aperture 那一 tick 快照
     * meta.veil.count」，且老档惰性补写也走读取口。落点属 P5（veil 进度接口），此处不碰。 */
    /* 平台成就：合格破壳时解锁「首次轮回」与挑战通关（幂等，由 achv.js 的平台账本去重）。 */
    if (SB.achv && SB.achv.onBreak) SB.achv.onBreak(r, meta);
    SB.state.saveMeta(meta);
    if (SB.state && SB.game.snapshot && SB.game.run && SB.game.run() === s)
      SB.state.saveRun(SB.game.snapshot(s));
    if (SB.saveTransfer && SB.saveTransfer.backupSoon) SB.saveTransfer.backupSoon();
    /* ✅ 有效通关（已建神学）⇒ 报最快时间 / 综合发展分 / 奇观 / 轮回数。 */
    if (SB.game.submitRankOnBreak) SB.game.submitRankOnBreak(s, r);
    /* 破壳动画已由 shell.onShellZero 播放；这里可能是未破壳就主动轮回，不能再播放动画。 */
    if (!options.silent) (SB.game.showBreakPanel || SB.game.showBreakAnimation)(r);
    if (emit) emit(tr('ui.log.prestige.completed', {
      prestigePoints: r.tidePoints.toFixed(2),
      stardust: _sd
    }, '轮回结算完成。获得轮回点 ' + r.tidePoints.toFixed(2) + '、星屑 ' + _sd + '。'));
    return r;
  }

  /* ════════════════════════ 帷幕之后 · 大轮回（二层 prestige）═══════════════════════
   * 2026-11-16 实装 · spec docs/ERA11_VEIL_SPEC_v0.1.md + VEIL_ASCENSION_SPEC_v0.1.md
   * + VEIL_HUB_SPEC_v0.1.md。学完《掀起帘幕》(s.techs.beyond_veil) 后，底栏出现掀幕按钮。 */

  var PATH_IDS = ['si', 'vo', 'gn'];   // 三条飞升路径：硅基承续 / 虚境升华 / 生命织章

  /* 可开启路径真源：硅基承续与生命织章可解锁；虚境升华当前仅提供只读预览。 */
  var OPENABLE_IDS = ['si', 'gn'];

  /* ── 帷幕周期账（唯一真源）────────────────────────────────────────────────
   * 2026-11-17 修「首次掀幕死锁」：`emptyMeta()` 的 `veil` 必须是 null（#4 口径 A 的
   * 「账本是否存在」判据），而 `doBreak` 又只在 veil 已是对象时才累加 cycleTide/cycleStar
   * ⇒ 首次掀幕时账本恒为 0 ⇒ 门禁 cycleStar ≥ 1000 永不成立 ⇒ 玩家学完《掀起帘幕》
   * 却永远掀不了幕。修法不是「给所有老档凭空建账」（那会让未掀幕档白拿一笔周期账），
   * 而是把「周期账」变成**读时引导**（本函数），写入时机不变（仍只由 doBreak 增量累加）。
   *
   * 引导口径（已与用户 2026-11-17 报的阻塞一致，具体金额待其复核）：
   *   · 账本已存在 → cycleTide / cycleStar。
   *   · 账本不存在（首次掀幕）→ 以历史累计量减去当前周期基准作为周期账：
   *     meta.tideEarnedTotal - veilCycleTideSeed / meta.stardustEarned - veilCycleStarSeed。
   *     新档基准为 0，因此首次掀幕仍按存档至今累计；未达门槛的飞升挑战若先开新周期，
   *     会把旧累计存成基准，避免旧周期被丢弃的资源以后再算进飞升点。星屑侧仍与
   *     《掀起帘幕》尤里卡读的 s.got.stardust 使用同一个周期基准，二者始终**同源**，
   *     所以「尤里卡点亮」与「够得着 1000 门槛」必然同时成立，不会再出第二个死锁。
   *   · 两种情形都要再加**本周目尚未结算的收益**（qualified 且未 breakSettled）：
   *     掀幕发生在局内，不并入就等于「打穿一整局却换不来一点飞升点」
   *     （ERA11 spec §3.1 第①步「先结算本局，否则本局收益凭空消失」）。
   *     这里只把 breakReport 的数值读进来参与算点，不落盘、不改 s ——
   *     掀幕后整个 meta 账与本周目都要清零，没有第二次读取的机会。
   * ⚠️ 预估 / 确认面板 / 底栏提示 / 最终结算四处必须调本函数，杜绝「显示 1.23 实发 1.20」。 */
  function veilPeriod(meta, s) {
    meta = meta || (SB.game && SB.game.meta && SB.game.meta()) || {};
    var v = (meta.veil && typeof meta.veil === 'object') ? meta.veil : null;
    var baseTide = v ? (v.cycleTide || 0)
      : Math.max(0, (Number(meta.tideEarnedTotal) || 0) - (Number(meta.veilCycleTideSeed) || 0));
    var baseStar = v ? (v.cycleStar || 0)
      : Math.max(0, (Number(meta.stardustEarned) || 0) - (Number(meta.veilCycleStarSeed) || 0));
    if (s === undefined) s = (SB.game && SB.game.run) ? SB.game.run() : null;
    var tide = baseTide, star = baseStar;
    var pending = { tide: 0, star: 0, active: false };
    if (s && !s.breakSettled && qualified(s)) {
      var rep = breakReport(s);
      /* 与 doBreak 同一个乘子位置（《文明构造》本轮回 +20%），否则「本局预估」与实际
       * 结算值会差 20%，玩家会以为显示错了。 */
      pending.tide = rep.tidePoints * ((s.civics && s.civics.civilization) ? 1.2 : 1)
        * ((SB.voidFx && SB.voidFx.tideYieldMul) ? SB.voidFx.tideYieldMul() : 1);
      pending.star = rep.stardust;
      tide += pending.tide;
      star += pending.star;
      pending.active = true;
    }
    /* 飞升挑战通用奖励（2026-11-20）：每完成一档飞升挑战 +10% 飞升点产出。
     * 三项挑战（飞升竞速/飞升苦旅/宇宙空洞）各带 ascension:true，各 3 档 ⇒ 全局 9 档 ⇒ ascMul 满值 1.9。
     * ⚠️ 必须挂在 points 这一处唯一真源：预估 / 确认面板 / 底栏 / doVeil 结算四处都调 veilPeriod，
     *    分散改必然出现「显示 1.23 实发 1.20」。doVeil 的 gained 直接取 per.points，实发同步生效。
     * ⚠️ 绝不碰轮回点的 challengePointMul（:193）——飞升点与轮回点是两套货币、两条账。 */
    var ascMul = 1;
    if (SB.challenges && SB.challenges.ascensionTierCount)
      ascMul = 1 + 0.10 * SB.challenges.ascensionTierCount(meta);
    return {
      hasLedger: !!v,
      tide: tide, star: star,
      baseTide: baseTide, baseStar: baseStar,
      pending: pending,
      points: Math.round((tide / 10000 + star / 1000) * ascMul * 100) / 100
    };
  }

  /* 本周目已达门槛，或本飞升周期曾经有周目达标后锁存的资格。 */
  function veilReady(meta, s) {
    meta = meta || (SB.game && SB.game.meta && SB.game.meta()) || {};
    if (meta.veilReady === true) return true;
    if (s === undefined) s = (SB.game && SB.game.run) ? SB.game.run() : null;
    var threshold = SB.challenges && SB.challenges.veilStarThreshold
      ? SB.challenges.veilStarThreshold(s) : 1000;
    return !!(s && s.techs && s.techs.beyond_veil && veilPeriod(meta, s).star >= threshold);
  }

  /* 飞升点预估（下位稿 §3，用户拍板不取整、留两位小数）。
   * 第二参数是**可选**的本局快照：不传就取当前局，传 null 表示「不算本局未结算部分」。 */
  function estimateVeilPoints(meta, s) {
    return veilPeriod(meta, s).points;
  }

  /* 掀幕预览：给确认面板展示「将得多少 / 将失去什么 / 开第几条路径」。
   * ⚠️ 未掀幕档（veil === null）**也要返回结构**——首次掀幕正是最需要预览的那一次。
   *    只有「连 meta 都读不到」才返回 null。 */
  function veilPreview(s) {
    var meta = SB.game && SB.game.meta && SB.game.meta();
    if (!meta) return null;
    if (s === undefined) s = (SB.game && SB.game.run) ? SB.game.run() : null;
    var per = veilPeriod(meta, s);
    var v = (meta.veil && typeof meta.veil === 'object') ? meta.veil : null;
    var opened = (v && v.paths && v.paths.opened) || [];
    var count = ((v && v.count) || 0) + 1;   // 本次掀幕后的重数
    var unopened = PATH_IDS.filter(function (p) { return opened.indexOf(p) < 0; });
    /* 玩家可选池 = 已实装（OPENABLE_IDS）且尚未开启。2026-11-18 改为玩家自选：
     * 当前 si / gn 在池里；vo 仍是只读预览。已开启的路径会从可选池移除，
     * 若池空则不开放新路径但照常掀幕（用户拍板「没可选就不开」）。选哪条由 doVeil
     * 的 chooseId 决定，这里只负责把池交给确认面板渲染单选区。 */
    var selectable = OPENABLE_IDS.filter(function (p) { return opened.indexOf(p) < 0; });
    return {
      points: per.points,
      count: count,
      cycleTide: per.tide,
      cycleStar: per.star,
      baseTide: per.baseTide,
      baseStar: per.baseStar,
      pendingTide: per.pending.tide,
      pendingStar: per.pending.star,
      pendingActive: per.pending.active,
      hasLedger: per.hasLedger,
      selectable: selectable,                          // 本次可选路径（新，UI 据此渲染单选区）
      nextPath: selectable.length ? selectable[0] : null,  // 兼容旧字段：默认/首选项
      allOpen: unopened.length === 0,
      opened: opened.slice()
    };
  }

  /* 掀幕：原子事务。当前周目学成《掀起帘幕》且周期星屑 ≥1000，或本飞升周期已锁存资格。
   * 顺序不可换（上位稿 §3.1）：先算点 → 清资产 → 发点建账 → 解锁路径 → startRun 重建本局。
   * 任何一步失败都抛错、不改状态——但这里全是同步纯内存操作，理论上不会中途失败。
   *
   * 2026-11-18 改「玩家自选路径」：第 3 参 chooseId 是玩家在确认面板选的 id。
   *   · 合法（∈ OPENABLE_IDS 且未开启）→ 开启该路径；
   *   · 省略 / null / 池空 → 不开新路径但照常掀幕（用户拍板「没可选就不开」）；
   *   · 非法 id（已开 / 未实装 / 不存在的字符串）→ 抛错，绝不悄悄开另一条。
   * 不传 chooseId 的旧调用（如历史 e2e）行为变为「不开路径」，符合新的默认语义。 */
  function doVeil(s, emit, chooseId, options) {
    var meta = SB.game && SB.game.meta && SB.game.meta();
    if (!meta) throw new Error('无法读取跨周目存档');
    if (!(s && s.techs && s.techs.beyond_veil) && meta.veilReady !== true)
      throw new Error('尚未学成《掀起帘幕》');
    /* ⓪ 路径选择校验（Must be before ANY mutation —— 抛错时账本必须一字未动）。
     * 先看当前 opened：首次掀幕 v 还不存在时视为空数组。 */
    var openedNow = (meta.veil && meta.veil.paths && meta.veil.paths.opened) || [];
    var chosenPath = null;
    if (chooseId !== undefined && chooseId !== null && chooseId !== '') {
      if (OPENABLE_IDS.indexOf(chooseId) < 0) {
        throw new Error('路径「' + chooseId + '」尚不可开启');
      }
      if (openedNow.indexOf(chooseId) >= 0) {
        throw new Error('路径「' + chooseId + '」已开启，无需重复开启');
      }
      chosenPath = chooseId;
    }
    /* ① 先算账（Must be before any mutation）：周期账 + 本周目未结算部分。
     * ⚠️ 必须在建 meta.veil 之前算 —— 建账后 veilPeriod 会走「账本已存在」分支，
     *    首次掀幕那笔「存档至今累计」的引导种子就丢了（回归到 0 点）。
     * 门禁也用这份账，而不是 v.cycleStar：首次掀幕 v 还不存在。 */
    var per = veilPeriod(meta, s);
    var threshold = SB.challenges && SB.challenges.veilStarThreshold
      ? SB.challenges.veilStarThreshold(s) : 1000;
    if (per.star < threshold) {
      throw new Error(tr('ui.veil.error.insufficient_stardust', {
        threshold: Math.round(threshold), current: Math.round(per.star)
      }, '本周期星屑不足 ' + Math.round(threshold) + '（当前 ' + Math.round(per.star) + '），无法掀幕'));
    }
    var gained = per.points;

    /* ② 建账（首次掀幕时才创建；之后只增不减 count） */
    if (!meta.veil || typeof meta.veil !== 'object') {
      meta.veil = {
        count: 0, points: 0, perks: {}, cycleTide: 0, cycleStar: 0,
        lifetimePoints: 0, spentPoints: 0,
        answerMachinePending: false, answerMachineActive: false,
        paths: { opened: [], organ: {}, void: {}, gene: {} }
      };
    }
    var v = meta.veil;
    if (!v.paths) v.paths = { opened: [], organ: {}, void: {}, gene: {} };
    if (!Array.isArray(v.paths.opened)) v.paths.opened = [];
    if (!v.paths.void || typeof v.paths.void !== 'object' || Array.isArray(v.paths.void)) v.paths.void = {};
    if (!v.paths.void.domains || typeof v.paths.void.domains !== 'object' || Array.isArray(v.paths.void.domains)) v.paths.void.domains = {};
    if (!v.paths.void.wonders || typeof v.paths.void.wonders !== 'object' || Array.isArray(v.paths.void.wonders)) v.paths.void.wonders = {};
    var openedBefore = v.paths.opened.slice();
    // ③ 清资产（上位稿 §2「清」列）——只清这些，保留列一字不动
    /* ⚠️ 2026-11-17 修正：此前这里写 `meta.spent = 0` 且把 tideEarnedTotal 也清零，
     * 与 §2 保留列（tideEarnedTotal / stardustEarned）和决策 #1「保留历史获得过的
     * 轮回点 / 星屑记录」直接冲突——掀一次幕就把玩家的历史成绩抹掉。
     * 正解照 §3.2：把被清的**余额**记成一笔 spent（语义正是「被帷幕核销」），
     * 定损方程 tideEarnedTotal − tide − spent ≡ 0 依然成立，历史总量一字不动。 */
    meta.spent = (meta.spent || 0) + (Number(meta.tide) || 0);
    meta.tide = 0;
    meta.perks = {};
    meta.stardust = 0;
    meta.starPerks = emptyStarPerks();
    meta.veilCycleTideSeed = 0;
    meta.veilCycleStarSeed = 0;
    meta.veilReady = false;
    meta.techLog = {};
    meta.lastRun = null;
    meta.oldFaith = 0;
    meta.memorialWonders = {};
    meta.oldArtworkEarnedTotal = 0;
    meta.oldTideStelesEarnedTotal = 0;
    /* ⚠️ 轻车熟路（bld_* 成就）跨周目累计账**不清**（2026-11-22 用户拍板）：
     *    meta.buildingLvlTotal 是成就墙进度的真源（achv.recheckBuildings / progressOf），
     *    清掉会让「章还在、进度倒退回 0」，与「成就不撤」同一口径。 */
    meta.govPassiveCards = {};
    meta.govEverAdopted = {};
    /* ⚠️ 挑战完成档位**不清**（2026-11-22 用户改判，推翻同日早先的「飞升清账」）：
     *    档位同时是十余处挑战永久奖励的唯一真源（productionMul / stardustRewardMul /
     *    scienceCultureMul / startingPopulation / warCostMul 等全读 tierDone），清档位
     *    等于连奖励一起撤；成就墙的挑战章却照旧保留 ⇒「章在、效果没了」。
     *    现口径：普通挑战与飞升挑战的档位、永久奖励、挑战页标记一律跨幕保留；
     *    玩家仍可重打刷榜（award 的 replay 分支不发奖、不写账）。 */
    meta.challengePopupPending = null;
    // veil 自身：点数余额跨重保留；本重飞升树重买、周期账归零，count +1 只增不减
    v.perks = {};
    v.cycleTide = 0;
    v.cycleStar = 0;

    // ④ 把本周期新得点数加进可用余额；按分取整，兼容广告奖励的 0.1 点增量。
    v.count = (v.count || 0) + 1;
    if (meta.armada && typeof meta.armada === 'object') meta.armada.cycleCount = 0;
    var carriedPoints = Number(v.points);
    if (!isFinite(carriedPoints) || carriedPoints < 0) carriedPoints = 0;
    v.points = Math.round((carriedPoints + gained) * 100) / 100;
    v.lifetimePoints = (v.lifetimePoints || 0) + gained;

    // ⑤ 解锁玩家所选路径（2026-11-18 自选；没选 / 没可选则不开，照常掀幕给点）。
    //    chosenPath 已在 ⓪ 校验过合法且未开，这里只写入；三条全开后卡保留为永久入口。
    if (chosenPath) v.paths.opened.push(chosenPath);

    /* ⑤.5 本局挑战结算（含飞升挑战；2026-11-21 用户拍板「必须点飞升才算通关」）。
     * 终点判定从「研成《掀起帘幕》」改回「掀幕成功」：只有走到这里（玩家真的点了
     * 底栏《掀起帘幕》按钮、前面所有门槛都过了）才把 veilDone=true 交给 evaluate。
     * 时机两点都要卡准：
     *   ① 必须在 ③ 清场（含 challengePopupPending=null）之后 —— 否则 award 刚写的
     *      完成面板会被清掉，玩家看不到「挑战完成」。
     *   ② 必须在 ⑥ startRun() 之前 —— 否则 s.challenge 被 freshRun 冲掉，无从判定。
     * veilDone 走参数透传（不写 s）：evaluate→award→goalMet 只认第三参，
     * 主循环 / 离线补算 / AI 都只传两参 ⇒ 研成科技本身不会再触发通关。
     * 幂等：award 内部 s.challengeDone / tierDone 双门槛，重复掀幕不会二次发奖。
     * ⚠️ 2026-11-22 改判后**不再只挑 ascension 挑战**：档位已不清，本局正在进行的
     *    普通挑战若已达成 goal，必须在掀幕这一刻照常结算，否则这一局白打。
     *    veilDone 第三参只有 goal:{t:'veil'} 的飞升挑战读，其它目标天然忽略；
     *    未达成则 award 返回 null、不写账，破壳型补判仍走 sealRun 的既有门槛。 */
    if (SB.challenges && SB.challenges.evaluate && s.challenge)
      SB.challenges.evaluate(s, meta, true);
    /* 掀幕结束当前飞升挑战；beginAscensionCycle 传入的新挑战会由后续 startRun 写入账本。 */
    if (!(options && options.challenge)) meta.activeAscensionChallenge = null;

    // ⑥ 落盘 + 重建本局（走 startRun，它负责 runs+1 与 freshRun）
    SB.state.saveMeta(meta);
    if (SB.game && SB.game.startRun) SB.game.startRun(options && options.challenge
      ? { challenge: options.challenge } : undefined);
    /* 枯荣起始奖励只在真实掀幕后发放，不能放进 startRun（那样普通重开也会反复领取）。
     * 轮回点同时记余额和历史获得量；星屑只增加余额，不计入累计结算/商店台账。 */
    var startingTide = SB.voidFx && SB.voidFx.startTide ? SB.voidFx.startTide() : 0;
    var startingStardust = SB.voidFx && SB.voidFx.startStardust ? SB.voidFx.startStardust() : 0;
    if (startingTide > 0) {
      meta.tide = (meta.tide || 0) + startingTide;
      meta.tideEarnedTotal = (meta.tideEarnedTotal || 0) + startingTide;
    }
    if (startingStardust > 0) meta.stardust = (meta.stardust || 0) + startingStardust;
    /* 宇宙空洞奖励（2026-11-20）：每重掀幕给新局初始星屑余额（20/40/60，按跨周目档位）。
     * ⚠️ 只加 meta.stardust 可消费余额，绝不写 meta.stardustEarned（排行榜「最多星屑」与尤里卡 seed 台账），
     *    也不写 s.got.stardust。设计意图：防止玩家飞升后一点星屑都没有。
     * ⚠️ 这是「doVeil 全文逐字未改」原则的唯一例外 —— 只在此加一段读档加余额，
     *    不碰路径选择 / popup 顺序 / 清场字段 / 那套作废的 t:'veil' 插桩。 */
    var veilStarveTier = SB.challenges && SB.challenges.tierDone ? SB.challenges.tierDone('veil_starve', meta) : 0;
    var veilStarveStart = veilStarveTier ? [0, 20, 40, 60][veilStarveTier] : 0;
    if (veilStarveStart > 0) meta.stardust = (meta.stardust || 0) + veilStarveStart;
    if ((startingTide > 0 || startingStardust > 0 || veilStarveStart > 0) && SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
    if (SB.saveTransfer && SB.saveTransfer.backupSoon) SB.saveTransfer.backupSoon();

    (emit || function () {})(tr('ui.veil.break_done', {
      points: gained.toFixed(2), count: v.count
    }, '帷幕掀起 · 第 ' + v.count + ' 重：获得 ' + gained.toFixed(2) + ' 飞升点。'));

    return {
      points: gained, count: v.count,
      opened: v.paths.opened.slice(),
      openedBefore: openedBefore,
      newPath: chosenPath,                 // 本次实际开启的 id；没选则为 null
      cycleTide: per.tide, cycleStar: per.star,
      pendingTide: per.pending.tide, pendingStar: per.pending.star,
      firstVeil: !per.hasLedger
    };
  }

  /* emptyStarPerks 的本地镜像：掀幕要把星屑商店的 40+ 键全清。
   * 不直接调 SB.state 私有函数，按 meta.starPerks 现有键逐个归零。 */
  function emptyStarPerks() {
    var out = {};
    var cur = (SB.game && SB.game.meta && SB.game.meta().starPerks) || {};
    for (var k in cur) out[k] = 0;
    return out;
  }

  /* 飞升挑战总是从新的飞升周期开局。
   * 若周期曾达掀幕门槛，走真实掀幕并结算飞升点；否则只丢弃旧周期，不增加掀幕次数或点数。 */
  function beginAscensionCycle(s, emit, challenge) {
    var meta = SB.game && SB.game.meta && SB.game.meta();
    if (!meta) throw new Error(tr('ui.veil.error.no_meta', {}, '无法读取跨周目存档'));
    var challengeOptions = challenge ? { challenge: challenge } : null;
    if (veilReady(meta, s)) return doVeil(s, emit, null, challengeOptions);

    /* 没有飞升门槛时仍沿用普通挑战的周目结算：结算产生的周期资产会在下方清空，
     * 但合格轮回次数和其他跨周期账照常记入。 */
    if (s && !s.breakSettled && qualified(s))
      doBreak(s, null, { silent: true, challengeStart: true });
    if (veilReady(meta, null)) return doVeil(s, emit, null, challengeOptions);

    /* 未达门槛也要切新周期。无飞升账本的老档用历史累计基准隔离被丢弃周期，
     * 避免下一次达标时把旧星屑或轮回点重新算进飞升点。 */
    var hasVeilLedger = !!(meta.veil && typeof meta.veil === 'object');
    meta.veilCycleTideSeed = hasVeilLedger ? 0 : Math.max(0, Number(meta.tideEarnedTotal) || 0);
    meta.veilCycleStarSeed = hasVeilLedger ? 0 : Math.max(0, Number(meta.stardustEarned) || 0);
    meta.spent = (meta.spent || 0) + (Number(meta.tide) || 0);
    meta.tide = 0;
    meta.perks = {};
    meta.stardust = 0;
    meta.starPerks = emptyStarPerks();
    meta.techLog = {};
    meta.lastRun = null;
    meta.oldFaith = 0;
    meta.memorialWonders = {};
    meta.oldArtworkEarnedTotal = 0;
    meta.oldTideStelesEarnedTotal = 0;
    meta.govPassiveCards = {};
    meta.govEverAdopted = {};
    meta.challengePopupPending = null;
    meta.veilReady = false;
    if (meta.veil && typeof meta.veil === 'object') {
      meta.veil.perks = {};
      meta.veil.cycleTide = 0;
      meta.veil.cycleStar = 0;
    }
    if (meta.armada && typeof meta.armada === 'object') meta.armada.cycleCount = 0;
    if (SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
    if (SB.game && SB.game.startRun) SB.game.startRun(challengeOptions || undefined);
    if (SB.saveTransfer && SB.saveTransfer.backupSoon) SB.saveTransfer.backupSoon();
    return { points: 0, count: meta.veil && meta.veil.count || 0, cycleTide: 0, cycleStar: 0 };
  }

  /* ── 轮回商店 ───────────────────────────────────────────────────────────
   * 分级商品支持「独立逐级定价」：p.costs 为各级单级价数组（价目表 3/6/12 即各单级价、不累计），
   * 买第 k 级扣 costs[k]、须逐级买；单级商品用 p.cost。扣 meta.tide，等级存 meta.perks[id]。 */

  function perkLevel(id) { return (SB.game.meta().perks || {})[id] || 0; }
  function perkDef(id) {
    var T = SB.TIDE_TREE || [];
    for (var i = 0; i < T.length; i++) if (T[i].id === id) return T[i];
    return null;
  }
  function perkNextCost(p, lv) {
    if (p.costs) {
      if (p.costs.length > lv) return p.costs[lv];
      /* 2026-10-05 用户拍板「不设上限」：等差曲线数组耗尽后按末两级步长外推。
       * ⚠️ 这同时治好了 g2/g3 只写 1 个价（costs:[6]/[12] 但 n:3）时
       *    第 2/3 级取价回退 p.cost=undefined ⇒ 购买把 tide 减成 NaN 的隐患：
       *    单元素数组按平价续费，不再掉进 undefined。 */
      /* ⚠️ 2026-10-23 潮汐之树：尾节点（craftQuotaTail 等）数组耗尽且带 scale 时，
       *    从末级价起按 scale 几何外推（向下取整），不再掉回等差。 */
      if (p.scale) {
        var base = p.costs[p.costs.length - 1];
        return Math.floor(base * Math.pow(p.scale, lv - p.costs.length + 1));
      }
      if (p.costs.length >= 2) {
        var step = p.costs[p.costs.length - 1] - p.costs[p.costs.length - 2];
        return p.costs[p.costs.length - 1] + step * (lv - p.costs.length + 1);
      }
      if (p.costs.length === 1) return p.costs[0];
    }
    /* 几何涨价尾节点（cost + scale + n:Infinity，无 costs 数组）：
     * 买第 (lv+1) 级价 = floor(cost × scale^lv)。lv=0 ⇒ 首级价 = cost。 */
    if (p.scale) return Math.floor(p.cost * Math.pow(p.scale, lv));
    return p.cost;
  }
  function perkPrerequisites(p) {
    if (!p) return [];
    var raw = p.nests !== undefined ? p.nests : p.nest;
    if (!raw) return [];
    var list = Array.isArray(raw) ? raw : [raw], out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && out.indexOf(list[i]) < 0) out.push(list[i]);
    }
    return out;
  }
  function perkLocked(p) {
    var required = perkPrerequisites(p);
    for (var i = 0; i < required.length; i++) if (perkLevel(required[i]) <= 0) return true;
    return false;
  }
  function perkState(id) {
    var p = perkDef(id);
    if (!p) return null;
    var lv = perkLevel(id), max = p.n || 1;
    var meta = SB.game.meta();
    var next = perkNextCost(p, lv);
    return {
      perk: p, lv: lv, max: max, next: next,
      prerequisites: perkPrerequisites(p),
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
    var starCap = SB.challenges && SB.challenges.starCap ? SB.challenges.starCap(s) : SB.CFG.STAR_CAP;
    var starPct = (starCap > 0) ? Math.min(1, ((s.res && s.res.starExplore) || 0) / starCap) : 0;
    var dysonPct = SB.economy && SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0;
    var mul = (1 + starPct) * (1 + 0.5 * dysonPct);
    if (s.civics && s.civics.ancestor_heritage) mul *= 1.2;
    if (s.civics && s.civics.star_ruins) mul *= 1 + 0.01 * levels;
    if (s.techs && s.techs.heir_of_stars) mul *= 2;
    /* ERA2-7 扩卡（2026-10-22）：质量效应卡（breakStardustMul 1.15）本轮回星屑获取 ×1.15。
     * 结算 / 预览同源（breakReport 也调 stardustGain）。 */
    if (SB.civic && SB.civic.cardBreakStardustMul) mul *= SB.civic.cardBreakStardustMul(s);
    /* 水体污染挑战奖励（2026-11-02）：永久星屑产出 +10%。
     * ⚠️ 与「祖先遗产 1.2」「星之遗构」等**独立相乘**，不要并进上面任何一行 ——
     *   合并后改一个挑战的奖励会顺带改动别的挑战/科技的实际收益。
     * ⚠️ 读 meta 不在 s 上：这是**跨周目**奖励，必须走 tierDone（老档 completed 里没这个键
     *   就是没通过，不能靠 s.challengeDone 判）。 */
    if (SB.challenges && SB.challenges.tierDone('waterpollution', SB.game && SB.game.meta ? SB.game.meta() : null)) mul *= 1.1;
    /* 飞升竞速奖励（2026-11-20）：星屑获取 +10/20/30% 独立第三行，档值原属宇宙空洞（15:32 用户转出）。
     * ⚠️ 不并进 stardustRewardMul（九项终局挑战共享）也不并水体污染那行 —— 一次改一项。
     * ⚠️ 读 tierDone(meta)，跨掀幕保留（飞升后不消失）。 */
    var veilRushDone = SB.challenges && SB.challenges.tierDone('veil_rush', SB.game && SB.game.meta ? SB.game.meta() : null);
    if (veilRushDone) mul *= 1 + [0, 0.10, 0.20, 0.30][veilRushDone];
    if (SB.challenges && SB.challenges.stardustRewardMul)
      mul *= SB.challenges.stardustRewardMul(SB.game && SB.game.meta ? SB.game.meta() : null);
    /* 星屑商店的「星尘回流」每级 +5%，末端无限「星尘共鸣」每级 +1%。
     * 直接读取跨周目 meta，结算预览与正式发放共用此函数。 */
    var starMeta = SB.game && SB.game.meta ? SB.game.meta() : null;
    var starPerks = starMeta && starMeta.starPerks || {};
    var returnLevels = 0;
    var returnIds = ['starStardustReturn1', 'starStardustReturn2', 'starStardustReturn3'];
    for (var si = 0; si < returnIds.length; si++)
      returnLevels += Math.min(1, Math.max(0, Math.floor(Number(starPerks[returnIds[si]]) || 0)));
    var resonanceLevels = Math.max(0, Math.floor(Number(starPerks.starStardustResonance) || 0));
    mul *= 1 + 0.05 * returnLevels + 0.01 * resonanceLevels;
    /* 硅基承续 · 鳞/眼/手 LV3（2026-11-17）：「工坊区每级建筑 +1% 结算星屑」，三处**叠加**成
     * +3%/级（SPEC §0 #1 已拍：不是三选一、不是只算一次）。乘在整条 mul 之后，
     * 与挑战奖励 / 祖先遗产等既有乘区各自独立。 */
    if (SB.veilFx) {
      var wLv = (s.lvl && s.lvl.workshop) || 0;
      mul *= SB.veilFx.breakStardustMul(wLv);
    }
    if (SB.voidFx && SB.voidFx.starYieldMul) mul *= SB.voidFx.starYieldMul();
    if (SB.faith && SB.faith.creedStarMul) mul *= SB.faith.creedStarMul(s);
    /* 宇宙空洞限制（2026-11-20）：星屑结算收益 -20/40/60%，读本局 active()。
     * ⚠️ 星屑是破壳一次性结算（shell.breakReport → 本函数），不是实时产出轴；
     *    goal 型挑战破壳时 active() 仍有效（resolveRun 对 goal 返回 null、不置 challengeDone），
     *    研成《掀起帘幕》那一刻 challengeDone 置位 ⇒ active() 返回 null ⇒ 限制自动结束。
     * ⚠️ 这条只压结算收益，不写入 meta.stardustEarned / s.got.stardust 台账。 */
    var veilStarveActive = SB.challenges && SB.challenges.active ? SB.challenges.active(s) : null;
    if (veilStarveActive && veilStarveActive.id === 'veil_starve') {
      var vsTier = SB.challenges.activeTier(s);
      if (vsTier) mul *= 1 - vsTier.cap;
    }
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
    var prereqRaw = p.nests !== undefined ? p.nests : p.nest;
    var prerequisites = !prereqRaw ? [] : (Array.isArray(prereqRaw) ? prereqRaw.slice() : [prereqRaw]);
    var locked = false;
    for (var pi = 0; pi < prerequisites.length; pi++) {
      if (prerequisites[pi] && !(levels[prerequisites[pi]] > 0)) { locked = true; break; }
    }
    if (lv > 0) locked = false; // 已拥有节点的旧档可继续使用；迁移后不强制追溯新前置。
    var next = p.costs ? p.costs[lv]
      : p.scale ? Math.floor((p.cost || 0) * Math.pow(p.scale, lv))
      : (p.cost || 0) + (p.costStep || 0) * lv;
    return { perk: p, lv: lv, max: p.n || 1, next: next,
      prerequisites: prerequisites, locked: locked,
      done: lv >= (p.n || 1), afford: (meta.stardust || 0) >= next };
  }
  function buyStarPerk(id) {
    var st = starPerkState(id);
    if (!st || st.done || st.locked || !isFinite(st.next) || !st.afford) return false;
    var meta = SB.game.meta();
    if (!meta.starPerks || typeof meta.starPerks !== 'object') meta.starPerks = {};
    meta.stardust -= st.next;
    meta.starPerks[id] = st.lv + 1;
    var s = SB.game.run();
    if (s && s.perk && id === 'starInfinite') {
      /* 每购一级轮回共鸣，给当前已购的每一级无限潮汐节点追加 100% 效果。 */
      var tideNodes = SB.TIDE_TREE || [], tideLevels = meta.perks || {}, cycle = meta.cycle || 0;
      for (var ti = 0; ti < tideNodes.length; ti++) {
        var tideNode = tideNodes[ti], tideLv = Math.max(0, Math.floor(Number(tideLevels[tideNode.id]) || 0));
        if (tideNode.n !== Infinity || tideLv <= 0) continue;
        var tideApply = tideNode.apply || {};
        for (var tk in tideApply) {
          var extra = tideNode.dyn === 'loop5' ? tideApply[tk] * 0.05 * cycle * tideLv : tideApply[tk] * tideLv;
          s.perk[tk] = (s.perk[tk] || 0) + extra;
        }
        if (tideNode.recipe) {
          if (!s.perk.recipeCraft) s.perk.recipeCraft = {};
          s.perk.recipeCraft[tideNode.recipe] = (s.perk.recipeCraft[tideNode.recipe] || 0) + (tideNode.rmul || 0.1) * tideLv;
        }
      }
    }
    if (s && s.perk) applyPerk(s, st.perk);
    SB.state.saveMeta(meta);
    return true;
  }
  /* ── 星屑炼金：双向固定汇率批量兑换（2026-11-15）──
   * ⚠️ 方向不对称，两处钳制基数不同，写反就会变成「扣 10 点得 10 星屑」：
   *    正向 tide-to-stardust：消耗 10 轮回点 → 得 1 星屑；可成交 floor(tide / 10) 笔；
   *    反向 stardust-to-tide：消耗 1 星屑 → 得 10 轮回点；可成交 floor(stardust / 1) 笔。
   * 汇率只从 CFG.STARDUST_EXCHANGE 读；展示（render.js）与钳制/扣费共用 exchangeRate /
   * exchangeMaxCount，不另写第二份。n 省略 = 1 笔（旧调用方零改动），n=Infinity = 「全部」。
   * 返回**实际成交笔数**（0 = 没成交），调用方据此决定要不要重绘。 */
  function exchangeRate() {
    var r = (SB.CFG && SB.CFG.STARDUST_EXCHANGE) || {};
    return { tide: r.tidePerStardust || 10, sd: r.stardustPerBatch || 1 };
  }
  function exchangeMaxCount(m, direction) {
    if (!m) return 0;
    var r = exchangeRate();
    var cap = direction === 'tide-to-stardust'
      ? Math.floor((m.tide || 0) / r.tide)
      : Math.floor((m.stardust || 0) / r.sd);
    return cap > 0 ? cap : 0;
  }
  function exchangeTideForStardust(n) {
    var meta = SB.game.meta();
    if (!meta) return 0;
    var r = exchangeRate();
    var want = (n === undefined || n === null) ? 1 : Math.floor(n);
    var count = Math.min(isFinite(want) ? want : Infinity, exchangeMaxCount(meta, 'tide-to-stardust'));
    if (!(count > 0) || !isFinite(count)) return 0;
    meta.tide -= count * r.tide;
    meta.spent = (meta.spent || 0) + count * r.tide;
    meta.stardust = (meta.stardust || 0) + count * r.sd;
    SB.state.saveMeta(meta);   /* 整批只落盘一次，别在循环里调 */
    return count;
  }
  function exchangeStardustForTide(n) {
    var meta = SB.game.meta();
    if (!meta) return 0;
    var r = exchangeRate();
    var want = (n === undefined || n === null) ? 1 : Math.floor(n);
    var count = Math.min(isFinite(want) ? want : Infinity, exchangeMaxCount(meta, 'stardust-to-tide'));
    if (!(count > 0) || !isFinite(count)) return 0;
    meta.stardust -= count * r.sd;
    meta.tide = (meta.tide || 0) + count * r.tide;
    /* ⚠️ 既有口径（2026-11-15 查证，本次**刻意不补**）：反向只加 tide，
     *    不动 spent / tideEarnedTotal ⇒ 台账残差 earned − tide − spent 每笔漂 −10，
     *    批量 N 笔漂 −10N。生产代码零个读取方（只有注释 + redeem.mjs 一条礼包码断言
     *    提到它），玩家可见数字 / 排行榜 / 存档都不受影响。补平要动 spent（可能变负）
     *    或 tideEarnedTotal（会抬高「最多轮回点」排行榜），都不是零风险，故留现状。
     *    新套件 star-exchange-batch.mjs 把这条钉死，别有人顺手「修」成守恒。 */
    SB.state.saveMeta(meta);
    return count;
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
  /* 把单个已购节点的效果落到当前运行态 s.perk / s.res。
   * ⚠️ 三处差异于旧 PERKS：
   *   · apply 键带 mode:'max'（如 startPop 三档互斥）⇒ 取最高档，不累加；
   *   · apply 键带 dyn:'loop5'（如 craftLoop）⇒ 效果 = 键系数 × 5% × 轮回次数 × 等级，
   *     每局 freshRun 从 meta 重算，故这里按「当前 meta.cycle」即时折一份（跨周目幂等）；
   *   · give（开局资源）/ recipe（配方折进 s.perk.recipeCraft）按节点字段即时到账。
   * 注意：常规节点仍是纯加法累加（每次购买 +a[k]），与 derivePerksFromMeta 口径一致。 */
  function applyPerk(s, p) {
    if (!s) return;
    if (!s.perk) s.perk = SB.state.emptyPerks();
    var a = p.apply || {};
    var cycle = (SB.game && SB.game.meta && SB.game.meta().cycle) || 0;
    var effectScale = 1;
    if (p.subtree && p.n === Infinity && SB.game && SB.game.meta) {
      effectScale += Math.max(0, Math.floor(Number(SB.game.meta().starPerks && SB.game.meta().starPerks.starInfinite) || 0));
    }
    for (var k in a) {
      if (p.mode === 'max') s.perk[k] = Math.max(s.perk[k] || 0, a[k]);
      else if (p.dyn === 'loop5') s.perk[k] = (s.perk[k] || 0) + a[k] * 0.05 * cycle * effectScale;
      else s.perk[k] = (s.perk[k] || 0) + a[k] * effectScale;
    }
    if (p.give) { for (var g in p.give) if (s.res[g] !== undefined) s.res[g] += p.give[g]; }
    if (p.recipe) {
      if (!s.perk.recipeCraft) s.perk.recipeCraft = {};
      s.perk.recipeCraft[p.recipe] = (s.perk.recipeCraft[p.recipe] || 0) + (p.rmul || 0.1) * effectScale;
    }
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

  function armadaCountThisAscension(s, meta) {
    if (!meta && SB.game && SB.game.meta) meta = SB.game.meta();
    if (!s && SB.game && SB.game.run) s = SB.game.run();
    var armada = meta && meta.armada;
    var completed = Math.max(0, Math.floor(Number(armada && armada.cycleCount) || 0));
    var builtThisRun = !!(s && s.wonders && s.wonders.starship_armada);
    return completed + (builtThisRun ? 1 : 0);
  }

  SB.prestige = {
    breakReport: breakReport,
    doBreak: doBreak,
    /* 帷幕之后（二层 prestige） */
    estimateVeilPoints: estimateVeilPoints,
    veilPeriod: veilPeriod,
    veilReady: veilReady,
    veilPreview: veilPreview,
    doVeil: doVeil,
    beginAscensionCycle: beginAscensionCycle,
    armadaCountThisAscension: armadaCountThisAscension,
    PATH_IDS: PATH_IDS,
    qualified: qualified,
    legacy: legacy,
    harmonic: harmonic,
    religionEstablished: religionEstablished,
    perkState: perkState,
    perkLevel: perkLevel,
    perkDef: perkDef,
    perkPrerequisites: perkPrerequisites,
    perkLocked: perkLocked,
    buyPerk: buyPerk,
    stardustFacilityLevels: stardustFacilityLevels,
    stardustGain: stardustGain,
    starPerkDef: starPerkDef,
    starPerkState: starPerkState,
    buyStarPerk: buyStarPerk,
    exchangeTideForStardust: exchangeTideForStardust,
    exchangeStardustForTide: exchangeStardustForTide,
    exchangeRate: exchangeRate, exchangeMaxCount: exchangeMaxCount,
    applyPerk: applyPerk,
    toggleAutoResearch: toggleAutoResearch
  };
})(typeof window !== 'undefined' ? window : globalThis);
