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
    /* 2026-10-24 成就「十次轮回」（docs/ACHV_DESIGN_v0.3.md §四·4，事项 4 用户拍「只算轮回」）：
     * rebirths 是合格轮回的**新计数器**（软重置 / 神学前重置 / 未过资格门全不计，
     * 与 meta.cycle 的「周目」语义故意分开——cycle 对软重置也 +1）。
     * ⚠️ 老档无此键 ⇒ 从 0 起算，不追溯（历史轮回次数无法从 cycle 反推，见设计稿 §四·4）。 */
    meta.rebirths = (meta.rebirths || 0) + 1;
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
    if (SB.saveTransfer && SB.saveTransfer.backupSoon) SB.saveTransfer.backupSoon();
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
    var starPct = (SB.CFG.STAR_CAP > 0) ? Math.min(1, ((s.res && s.res.starExplore) || 0) / SB.CFG.STAR_CAP) : 0;
    var dysonPct = SB.economy && SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0;
    var mul = (1 + starPct) * (1 + 0.5 * dysonPct);
    if (s.civics && s.civics.ancestor_heritage) mul *= 1.2;
    if (s.civics && s.civics.star_ruins) mul *= 1 + 0.01 * levels;
    if (s.techs && s.techs.heir_of_stars) mul *= 2;
    /* ERA2-7 扩卡（2026-10-22）：质量效应卡（breakStardustMul 1.15）本轮回星屑获取 ×1.15。
     * 结算 / 预览同源（breakReport 也调 stardustGain）。 */
    if (SB.civic && SB.civic.cardBreakStardustMul) mul *= SB.civic.cardBreakStardustMul(s);
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
    var next = p.costs ? p.costs[lv] : (p.cost || 0) + (p.costStep || 0) * lv;
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
    applyPerk: applyPerk,
    toggleAutoResearch: toggleAutoResearch
  };
})(typeof window !== 'undefined' ? window : globalThis);
