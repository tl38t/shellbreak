/* 天壳 / SHELLBREAK — 轮回挑战页渲染。挑战规则与进度由 SB.challenges 提供。
 * 2026-10-24：成就墙拆到独立页签（paneAchievements = 原 paneAchvWall），
 * 本文件只管挑战（docs/ACHV_DESIGN_v0.3.md §六「单独标签」）。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  /* 当前挑战的一行进度文案（2026-11-03 抽出）。抽出的原因：
   *   ① 水体污染原先没有专属分支 ⇒ 落进最后的 else，把**寒流禁火**的文案显示给自己
   *      （「非寒流季：保温法可正常使用」），玩家完全看不到污染阶段和戴森进度；
   *   ② 进度要同时出现在卡片与顶部提示条，两处各写一份必然分叉 —— 在这里单一化，
   *      新增挑战只改这一处。
   * 2026-11-04 背景：破壳后 goal 型挑战一度让 active() 返回 null（已修，见 challenges.active），
   *   当时《流浪泰拉》的 50 台发动机整段看不到进度，临时加过一块「壳外推进」只读块。
   *   现在卡片的 if (active) 正常渲染它，那块兜底已无可达路径，随修复一并删除。
   * 兜底不再借用别人的文案：任何未登记分支一律回落到自己的 goalText。 */
  function progressLine(s, api, def, tier) {
    var scribeName = SB.folk.jobName(s, 'scribe');
    if (def.id === 'drift_terra') {
      if (s.challengeDone) return '挑战已达成 · 永久奖励已生效';
      /* 进行中的档要读 inRunOk：cycle 已在 startRun 加过一次，不能再 +1。 */
      var _pr = api.prereqState ? api.prereqState(def.id) : null;
      return '行星发动机 ' + ((s.lvl && s.lvl.terra_engine) || 0) + ' / 50 · 星核炉芯池 ' +
        SB.economy.fmtAmt((s.res && s.res.coreCharge) || 0) + ' / 50M' +
        ((_pr && !_pr.inRunOk) ? ' · ⚠ 第 ' + _pr.now + '/' + _pr.need + ' 周目，开启前置未满足，本局无法通关' : '');
    }
    if (def.id === 'waterpollution') {
      if (s.challengeDone) return '挑战已达成 · 永久奖励已生效';
      var pst = (SB.economy.pollutionStage && SB.economy.pollutionStage(s)) || {};
      return (pst.name || '澄海') + ' · 污染 ' + SB.economy.fmtAmt(s.pollution || 0) +
        ' · 戴森 ' + Math.floor((SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0) * 100) + '%';
    }
    if (def.id === 'anarchy') {
      var anarchyCards = (s.cards || []).filter(function (id) { return id && id !== 'card_cycle_terminus'; });
      return anarchyCards.length ? '政策卡违规 ' + anarchyCards.length + ' 张（允许「轮回之终末」）'
        : '未装备政策卡（「轮回之终末」例外）';
    }
    if (def.id === 'good_old_days')
      return '当前政体：' + (SB.civic.govTitleName ? SB.civic.govTitleName(s) : '酋邦制');
    if (def.id === 'three_launch_sites') {
      if (s.challengeDone) return '挑战已达成 · 永久奖励已生效';
      var launchText = '欧罗巴 ' + ((s.lvl && s.lvl.europa_launch) || 0) + '/11 · 泰拉 ' +
        ((s.lvl && s.lvl.terra_launch) || 0) + '/11 · 恩克拉多斯 ' + ((s.lvl && s.lvl.enceladus_launch) || 0) + '/11';
      if (s.dysonDone && !s.dysonLaunchSitesReady) return '戴森球已竣工，但当时发射场未达标 · 本轮需重开';
      return launchText + ' · 戴森 ' + Math.floor((SB.economy.dysonPct ? SB.economy.dysonPct(s) : 0) * 100) + '%';
    }
    if (def.id === 'eternity_moment') {
      var starCap = api.starCap ? api.starCap(s) : SB.CFG.STAR_CAP;
      var sailCap = api.dysonSailCap ? api.dysonSailCap(s) : SB.CFG.DYSON_SAIL_CAP;
      var nodeCap = api.dysonNodeCap ? api.dysonNodeCap(s) : SB.CFG.DYSON_NODE_CAP;
      return '倍率 ×' + tier.cap + ' · 天壳 ' + Math.round(Math.max(0, s.shell || 0)).toLocaleString() + '/' +
        api.shellTarget(s).toLocaleString() + ' · 星空 ' + Math.round((s.res && s.res.starExplore) || 0).toLocaleString() + '/' +
        starCap.toLocaleString() + ' · 太阳帆 ' + Math.floor(s.sunSails || 0).toLocaleString() + '/' +
        sailCap.toLocaleString() + ' · 戴森节点 ' + Math.floor(s.dysonNodes || 0).toLocaleString() + '/' + nodeCap.toLocaleString();
    }
    if (def.id === 'science') return '学者 ' + (s.jobs.scholar || 0) + ' / ' + tier.cap +
      ' · ' + scribeName + ' ' + (s.jobs.scribe || 0) + ' / ' + tier.cap;
    if (def.id === 'small') return '当前人口 ' + s.pop + ' / ' + tier.cap;
    if (def.id === 'abyss') return '全产出 -' + Math.round(tier.cap * 100) + '%';
    if (def.id === 'speedrun') return api.timedOut(s) ? '已超时 · 本档不能领取奖励' :
      '剩余 ' + api.formatClock(api.remainingSeconds(s)) + ' · 离线继续计时';
    if (def.id === 'cold') return api.warmHeatingBlocked(s) ? '寒流季：保温法禁用，产业仍可消耗暖石' : '非寒流季：保温法可正常使用';
    return def.goalText || '';
  }

  function paneChallenges() {
    var s = SB.game.run(), m = SB.game.meta(), api = SB.challenges;
    var list = api.list(), total = api.completedCount(m), active = api.active(s);
    var h = '<section class="challenge-overview"><div class="challenge-overview-title">' +
      '<span class="challenge-kicker">PRESTIGE TRIALS</span><h2>挑战</h2>' +
      '<p>开启挑战会结算当前周目并立即开始新周目。各项挑战有各自的目标，达成后会立即结算永久奖励。</p></div>' +
      '<div class="challenge-overview-stats"><div><small>挑战通关</small><b>' + total + '</b></div>' +
      '<div><small>轮回点获取</small><b>+' + (total * 10) + '%</b></div></div></section>';

    if (active) {
      var activeDef = api.byId(active.id), activeTier = activeDef.tiers[active.tier] || activeDef.tiers[0];
      var activeTimedOut = active.id === 'speedrun' && api.timedOut(s);
      var progressText = progressLine(s, api, activeDef, activeTier);
      h += '<section class="challenge-active' + (activeTimedOut ? ' is-failed' : '') + '"><span class="challenge-active-mark">' +
        (activeTimedOut ? '已超时' : s.challengeDone ? '已达成' : active.replay === true ? '重复挑战' : '进行中') + '</span>' +
        '<div><b>' + activeDef.name + ' · ' + activeTier.label + (active.replay === true ? ' · 重复挑战' : '') + '</b><small>' + progressText + '</small></div>' +
        '<span class="challenge-active-hint">' + (activeTimedOut ? '重开本周目后可再次尝试，不消耗档位' :
          s.challengeDone && !activeDef.goal ? '成绩已定格；挑战限制仍生效，可在卡片上解除' :
          (activeDef.goalText || '通关目标：完成《神学》并凿穿天壳')) + '</span></section>';
    } else {
      /* 2026-11-04：这里原先还有一块「壳外推进」只读进度（C 方案）。
       * 它是给「破壳后 goal 型 active() 返回 null」打的补丁；该判据已修
       * （challenges.active：goal 型只要未 challengeDone 就返回 a），
       * 未完成的 goal 挑战一定走上面 if (active) 分支 ⇒ 这段已无可达路径，删除。 */
      h += '<div class="challenge-howto">每档挑战首次通关都会让之后的轮回点获取永久提高 10%。分档挑战必须逐档完成。' +
        '全部通关后仍可再次挑战：重打已通的最高档，不再重复发奖，只刷新排行榜成绩。</div>';
    }

    h += '<section class="challenge-grid">';
    for (var i = 0; i < list.length; i++) {
      var d = list[i], done = api.tierDone(d.id, m), isActive = active && active.id === d.id;
      var scribeName = SB.folk.jobName(s, 'scribe');
      var summary = d.id === 'science' ? '限制学者与' + scribeName + '人数，考验基础经营。' : d.summary;
      var rule = d.id === 'science' ? '学者与' + scribeName + '岗位人数各不得超过本档上限' : d.rule;
      var exhausted = done >= d.tiers.length, next = Math.min(done, d.tiers.length - 1);
      var blocked = !!active && !isActive;
      /* 开启前置（2026-11-05）：只挡「还没开始」的入口；已在进行中的档不受影响，
       * 老档 / 改档也要能继续看到自己的进度，而不是被门禁静默抹掉。 */
      var prereq = api.prereqState(d.id, m), gateBlocked = !!prereq && !prereq.ok;
      var activeTimedOut = isActive && d.id === 'speedrun' && api.timedOut(s);
      /* 「已达成」判据：goal 型（2026-11-02 推广）+ 破壳型（2026-11-03 破壳即判定）。
       * 两种挑战的 challengeDone 都在局内就为真，所以这里不再按 d.goal 过滤。 */
      var status = isActive ? (activeTimedOut ? '已超时' : s.challengeDone ? '已达成' : '进行中') : exhausted ? '已完成' : blocked ? '等待当前挑战结束' : gateBlocked ? '周目不足' : (d.tiers.length > 1 ? '下一档可挑战' : '尚未完成');
      h += '<article class="challenge-card' + (isActive ? ' is-active' : '') + (exhausted ? ' is-complete' : '') + '">';
      h += '<header class="challenge-card-head"><span class="challenge-icon" aria-hidden="true"><img src="' + d.badge + '" alt=""></span>' +
        '<div class="challenge-card-name"><h3>' + d.name + '</h3><small>' + d.kind + ' · ' + summary + '</small></div>' +
        '<span class="challenge-status' + (exhausted ? ' done' : activeTimedOut ? ' failed' : isActive ? ' active' : gateBlocked ? ' locked' : '') + '">' + status + '</span></header>';
      h += '<div class="challenge-card-rule"><small>本轮限制' +
        (s.challengeReleased && !d.goal ? ' <em class="challenge-released">已解除</em>' : '') +
        '</small><p>' + rule + '</p>' +
        (prereq ? '<small>开启前置</small><p class="challenge-prereq' + (gateBlocked ? ' is-lack' : '') +
          '">' + api.prereqText(d.id, m) + '</p>' : '') +
        '<small>通关目标</small><p>' + (d.goalText || '完成《神学》并凿穿天壳') + '</p></div>';

      if (d.tiers.length > 1) {
        h += '<div class="challenge-tiers">';
        for (var ti = 0; ti < d.tiers.length; ti++) {
          var td = d.tiers[ti], tierActive = isActive && active.tier === ti;
          var tierState = tierActive ? (activeTimedOut ? '已超时' : '进行中') : ti < done ? '已通关' : ti === done && !blocked && !exhausted ? '下一档' : '锁定';
          var tierRule = d.id === 'science' ? '学者、' + scribeName + '各 ≤ ' + td.cap + ' 人' :
            d.id === 'speedrun' ? '限时 ' + api.formatClock(td.cap) + ' · 离线计时' :
            d.id === 'eternity_moment' ? '研究成本 ×' + td.cap + ' · 四项终局目标 ×' + td.cap :
              '本轮全产出 -' + Math.round(td.cap * 100) + '%';
          h += '<div class="challenge-tier' + (ti < done ? ' done' : tierActive ? (activeTimedOut ? ' active failed' : ' active') : ti === done && !blocked && !exhausted ? ' next' : '') + '">' +
            '<span class="challenge-tier-medal" aria-hidden="true"><img src="' + d.badge + '" alt=""><i>' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][ti] + '</i></span>' +
            '<div><b>' + td.label + '</b><span>' + tierState + '</span></div><small>' + tierRule + '</small>' +
            '<em>奖励：' + d.rewards[ti] + '</em></div>';
        }
        h += '</div>';
      } else {
        h += '<div class="challenge-reward"><small>永久奖励</small><b>' + d.reward + '</b></div>';
      }

      /* ⚠️ isActive 必须排在 exhausted 之前：重打已通关的挑战时两个条件同时为真，
       * 反过来的话「进行中」的卡会显示成「已完成」并再给一个开始按钮。 */
      if (isActive) {
        /* 破壳型挑战已判定（2026-11-03）：成绩定格，但门禁还挂着 —— 解除入口放在这张卡上，
         * 因为破壳结果面板是主路径，玩家关掉面板之后只有这里还找得到。一次性、不可逆。 */
        if (s.challengeDone && !d.goal && !activeTimedOut) {
          h += '<footer class="challenge-card-foot"><span>成绩已定格；<b>限制生效中</b>，解除后不可再打开。</span>' +
            '<button class="btn challenge-release" type="button" data-challenge-release="' + d.id + '">解除限制</button></footer>';
        } else {
          var activeFoot = activeTimedOut ? '已超时；重开本周目后可重试，档位不会消耗。' :
            active.replay === true ? '重复挑战：通关不重复发奖，只会把成绩刷进排行榜。' :
            s.challengeDone && d.goal ? '目标已完成，永久奖励已入账；可以继续发展或开始新周目。' :
              d.goal ? '达成目标时永久奖励会立即生效；你可以继续发展或开始新周目。' :
                '本轮限制生效中。通关后领取当前档奖励。';
          h += '<footer class="challenge-card-foot"><span>' + activeFoot +
            '</span><button class="btn" disabled>' + (activeTimedOut ? '本档已超时' : active.replay === true ? '重复挑战中' : '本轮挑战中') + '</button></footer>';
        }
      } else if (gateBlocked) {
        /* 门禁与 canStart 同源：按钮不给 data-challenge-start，委托永远不会触发 begin()。
         * 仍留一颗灰按钮（而不是整行消失），玩家能看见「为什么点不了」和差几周目。 */
        h += '<footer class="challenge-card-foot"><span>' +
          (blocked ? '先结束当前挑战周目；' : '') + '开启前置未满足：当前第 ' + prereq.now +
          ' 周目，开始后第 ' + prereq.after + ' 周目，还差 ' + prereq.lack + ' 周目。</span>' +
          '<button class="btn" disabled>需第 ' + prereq.need + ' 周目</button></footer>';
      } else if (exhausted) {
        /* 2026-11-02 玩家反馈「挑战不能反复打」：全部通关后仍留入口，重打最高档。
         * 只刷榜、不再发奖（规则见 SB.challenges 的 startTier / isReplay 注释）。 */
        h += blocked
          ? '<footer class="challenge-card-foot"><span>永久奖励已生效。先结束当前挑战周目再重打。</span><button class="btn" disabled>暂不可开始</button></footer>'
          : '<footer class="challenge-card-foot"><span>永久奖励已生效。再次挑战不再发奖，只刷新排行榜成绩。</span>' +
            '<button class="btn challenge-start" type="button" data-challenge-start="' + d.id + '">再次挑战 · ' + d.tiers[d.tiers.length - 1].label + '</button></footer>';
      } else if (blocked) {
        h += '<footer class="challenge-card-foot"><span>先完成或重开当前挑战周目。</span><button class="btn" disabled>暂不可开始</button></footer>';
      } else {
        h += '<footer class="challenge-card-foot"><span>首次通关本档：轮回点获取永久 +10%。</span>' +
          '<button class="btn challenge-start" type="button" data-challenge-start="' + d.id + '">结算并挑战 · ' + d.tiers[next].label + '</button></footer>';
      }
      h += '</article>';
    }
    h += '</section><div class="challenge-footnote">挑战奖励跨周目保留。挑战失败或主动重开不会消耗档位，也不会领取奖励。已通关的挑战可再次挑战，只刷新排行榜成绩、不重复发奖。</div>';
    return h;
  }

  /* ── 成就墙（2026-10-24 · docs/ACHV_DESIGN_v0.3.md）────────────────────────
   * 数据层全在 SB.achv：DEFS（allDefs）/ 本地账本 meta.achv（成就墙真源）/
   * 平台账本 meta.achievements / 进度 progressOf。本文件只做呈现，不写第二份口径。
   * 折叠态是纯视图状态：模块级 ACHV_FOLD + localStorage 持久化，每次重画从状态
   * **重拼进 HTML**——本 pane 每 2 秒被 PANE_REFRESH 整块重画，落 DOM 类会被冲掉
   * （与 render.js 的 ZONE_FOLDED 同款判据，见那里 110-116 行的注）。
   * 默认策略：有进度的区展开、零进度的区折叠——45 条轻车熟路全铺开会把页面撑爆。
   * 「待同步」chip = 本地已挣、平台 ID 已回填但尚未发过（下次 boot 的 syncMeta 补发）；
   *   ID 全未回填时不显示（否则每条都挂 chip，只是噪音）。 */
  var ACHV_FOLD = {};
  var ACHV_FOLD_SAVE = 'sb.achvfold.v1';
  function loadAchvFold() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(ACHV_FOLD_SAVE);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') ACHV_FOLD = o; }
    } catch (e) { ACHV_FOLD = {}; }
  }
  function saveAchvFold() {
    try { if (root.localStorage) root.localStorage.setItem(ACHV_FOLD_SAVE, JSON.stringify(ACHV_FOLD)); } catch (e) {}
  }
  function toggleAchvFold(id) {
    ACHV_FOLD[id] = !ACHV_FOLD[id];
    saveAchvFold();
    return ACHV_FOLD[id];
  }
  loadAchvFold();

  function achvItemHTML(def, m, s, ready) {
    var earned = !!(m.achv && m.achv[def.key]);
    var fired = !!(m.achievements && m.achievements[def.key]);
    var hasId = ready.indexOf(def.key) >= 0;
    var prog = earned ? null : SB.achv.progressOf(def.key, m, s);
    var icon = def.icon
      ? '<img src="' + def.icon + '" alt="">'
      : '<i class="achv-item-badge" aria-hidden="true">' + (def.bld ? '◈' : '★') + '</i>';
    var h = '<div class="achv-item' + (earned ? ' is-earned' : '') + (def.key === 'voidEnd' ? ' is-void-ending' : '') + '">';
    h += '<span class="achv-item-icon">' + icon + '</span>';
    h += '<div class="achv-item-body"><b>' + def.name + '</b><small>' + (def.desc || '') + '</small>';
    if (prog) {
      var pct = prog.max > 0 ? Math.max(2, Math.min(100, Math.round(prog.cur / prog.max * 100))) : 0;
      h += '<div class="achv-item-prog"><span style="width:' + pct + '%"></span></div><em>' + prog.label + '</em>';
    }
    h += '</div>';
    if (earned) {
      h += (hasId && !fired)
        ? '<span class="achv-item-chip" title="已在本机账本登记，平台成就尚未发送；重进游戏或下次破壳会自动补发">待同步</span>'
        : '<span class="achv-item-state is-done">已获得</span>';
    } else {
      h += '<span class="achv-item-state">未获得</span>';
    }
    return h + '</div>';
  }

  /* 成就墙（2026-10-24 · docs/ACHV_DESIGN_v0.3.md）：**独立页签**的渲染入口。
   * 原先是拼在挑战页尾部的（paneChallenges 里调 paneAchvWall），用户要求
   * 「成就在挑战与成就里单独做一个标签」后拆出：render.js 的 PANES.achievements
   * 直接指向 paneAchvWall 本体（单一实现，不写第二份逻辑，与 paneWonder 同手法）。
   * 门与挑战页一致（meta.shopUnlocked = 首次轮回），见 game.setTab 与 initTabs。 */
  function paneAchievements() {
    return paneAchvWall();
  }

  function paneAchvWall() {
    var s = SB.game.run(), m = SB.game.meta();
    if (!SB.achv || !SB.achv.allDefs) return '';
    var defs = SB.achv.allDefs(), ready = SB.achv.readyKeys() || [];
    var earned = 0, i;
    for (i = 0; i < defs.length; i++) if (m.achv && m.achv[defs[i].key]) earned++;
    var h = '<section class="achv-wall"><header class="achv-wall-head">' +
      '<div><span class="achv-kicker">ACHIEVEMENTS</span><h2>成就墙</h2>' +
      '<p>共 ' + defs.length + ' 项，跨周目保留。「轻车熟路」按建筑分区折叠，进度为跨周目累计等级。</p>' +
      /* 2026-10-28（用户要求）：把「首建免费」这条福利明写在页面上。
       * ⚠️ 游戏里它只表现为建造按钮变成「免费」，不解释成因 ⇒ 玩家会当成显示 bug；
       *    这里是**唯一讲清因果的地方**，改福利口径（SB.habitat.freeFirstBuild）时同步改这句。 */
      '<p class="achv-rule">「轻车熟路」成就达成后，该建筑在<b>每个轮回</b>首次建造<b>不花材料</b>。</p></div>' +
      '<div class="achv-wall-count"><small>已获得</small><b>' + earned + ' / ' + defs.length + '</b></div></header>';

    /* 通用两组：旧 5 条（挑战与轮回）+ 新 12 条（文明里程碑）。DEFS_BASE 顺序即此顺序。 */
    var baseEnd = 0;
    while (baseEnd < defs.length && !defs[baseEnd].bld) baseEnd++;
    var splitAt = 5;   // 前 5 条为旧成就（cold/small/science/abyss/firstRebirth）
    h += achvGroupHTML('挑战与轮回', defs, 0, splitAt, m, s, ready);
    h += achvGroupHTML('文明里程碑', defs, splitAt, baseEnd, m, s, ready);

    /* 轻车熟路 45 条：按 BUILD_ZONES 分区（顺序即 UI 顺序），空区自动隐藏。
     * 折叠默认策略（设计稿 §六）：**有进度就展开**——该区有任一成就已获得，
     * 或任一建筑累计等级 > 0（玩家正在养成），都默认铺开；全白区才折叠。 */
    var zones = SB.BUILD_ZONES || [];
    for (var zi = 0; zi < zones.length; zi++) {
      var zid = zones[zi].id;
      var zdefs = [];
      for (i = 0; i < defs.length; i++) if (defs[i].bld && defs[i].zone === zid) zdefs.push(defs[i]);
      if (!zdefs.length) continue;
      var zEarned = 0, zProgress = false;
      for (i = 0; i < zdefs.length; i++) {
        if (m.achv && m.achv[zdefs[i].key]) zEarned++;
        else {
          var zp = SB.achv.progressOf(zdefs[i].key, m, s);
          if (zp && zp.cur > 0) zProgress = true;
        }
      }
      var folded = (zid in ACHV_FOLD) ? !!ACHV_FOLD[zid] : (zEarned === 0 && !zProgress);
      h += '<section class="achv-zone' + (folded ? ' is-folded' : '') + '" data-achv-zone="' + zid + '">' +
        '<button class="achv-zone-head" type="button" data-achv-fold="' + zid + '" title="点击折叠 / 展开">' +
        '<span class="achv-zone-caret" aria-hidden="true">' + (folded ? '▸' : '▾') + '</span>' +
        '<b>' + zones[zi].name + '</b><small>' + zEarned + ' / ' + zdefs.length + '</small></button>';
      if (!folded) {
        h += '<div class="achv-zone-items">';
        for (i = 0; i < zdefs.length; i++) h += achvItemHTML(zdefs[i], m, s, ready);
        h += '</div>';
      }
      h += '</section>';
    }
    return h + '</section>';
  }

  function achvGroupHTML(title, defs, from, to, m, s, ready) {
    var h = '<div class="achv-group"><h3 class="achv-group-title">' + title + '</h3><div class="achv-items">';
    for (var i = from; i < to; i++) h += achvItemHTML(defs[i], m, s, ready);
    return h + '</div></div>';
  }

  parts.paneChallenges = paneChallenges;
  parts.paneAchievements = paneAchievements;
  parts.toggleAchvFold = toggleAchvFold;
})(typeof window !== 'undefined' ? window : globalThis);
