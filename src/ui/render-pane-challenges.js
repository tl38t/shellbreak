/* 天壳 / SHELLBREAK — 轮回挑战页渲染。挑战规则与进度由 SB.challenges 提供。
 * 2026-10-24：成就墙拆到独立页签（paneAchievements = 原 paneAchvWall），
 * 本文件只管挑战（docs/ACHV_DESIGN_v0.3.md §六「单独标签」）。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

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
      var progressText = '';
      var activeTimedOut = active.id === 'speedrun' && api.timedOut(s);
      var scribeName = SB.folk.jobName(s, 'scribe');
      if (active.id === 'drift_terra') progressText = s.challengeDone
        ? '挑战已达成 · 永久奖励已生效'
        : '行星发动机 ' + ((s.lvl && s.lvl.terra_engine) || 0) + ' / 50 · 星核炉芯池 ' +
          SB.economy.fmtAmt((s.res && s.res.coreCharge) || 0) + ' / 50M';
      else if (active.id === 'science') progressText = '学者 ' + (s.jobs.scholar || 0) + ' / ' + activeTier.cap +
        ' · ' + scribeName + ' ' + (s.jobs.scribe || 0) + ' / ' + activeTier.cap;
      else if (active.id === 'small') progressText = '当前人口 ' + s.pop + ' / ' + activeTier.cap;
      else if (active.id === 'abyss') progressText = '全产出 -' + Math.round(activeTier.cap * 100) + '%';
      else if (active.id === 'speedrun') progressText = activeTimedOut ? '已超时 · 本档不能领取奖励' :
        '剩余 ' + api.formatClock(api.remainingSeconds(s)) + ' · 离线继续计时';
      else progressText = api.warmHeatingBlocked(s) ? '寒流季：保温法禁用，产业仍可消耗暖石' : '非寒流季：保温法可正常使用';
      h += '<section class="challenge-active' + (activeTimedOut ? ' is-failed' : '') + '"><span class="challenge-active-mark">' +
        (activeTimedOut ? '已超时' : s.challengeDone && active.id === 'drift_terra' ? '已达成' : '进行中') + '</span>' +
        '<div><b>' + activeDef.name + ' · ' + activeTier.label + '</b><small>' + progressText + '</small></div>' +
        '<span class="challenge-active-hint">' + (activeTimedOut ? '重开本周目后可再次尝试，不消耗档位' :
          (activeDef.goalText || '通关目标：完成《神学》并凿穿天壳')) + '</span></section>';
    } else {
      h += '<div class="challenge-howto">每档挑战首次通关都会让之后的轮回点获取永久提高 10%。分档挑战必须逐档完成；单次挑战完成后不会再次开放。</div>';
    }

    h += '<section class="challenge-grid">';
    for (var i = 0; i < list.length; i++) {
      var d = list[i], done = api.tierDone(d.id, m), isActive = active && active.id === d.id;
      var scribeName = SB.folk.jobName(s, 'scribe');
      var summary = d.id === 'science' ? '限制学者与' + scribeName + '人数，考验基础经营。' : d.summary;
      var rule = d.id === 'science' ? '学者与' + scribeName + '岗位人数各不得超过本档上限' : d.rule;
      var exhausted = done >= d.tiers.length, next = Math.min(done, d.tiers.length - 1);
      var blocked = !!active && !isActive;
      var activeTimedOut = isActive && d.id === 'speedrun' && api.timedOut(s);
      var status = isActive ? (activeTimedOut ? '已超时' : s.challengeDone && d.id === 'drift_terra' ? '已达成' : '进行中') : exhausted ? '已完成' : blocked ? '等待当前挑战结束' : (d.tiers.length > 1 ? '下一档可挑战' : '尚未完成');
      h += '<article class="challenge-card' + (isActive ? ' is-active' : '') + (exhausted ? ' is-complete' : '') + '">';
      h += '<header class="challenge-card-head"><span class="challenge-icon" aria-hidden="true"><img src="' + d.badge + '" alt=""></span>' +
        '<div class="challenge-card-name"><h3>' + d.name + '</h3><small>' + d.kind + ' · ' + summary + '</small></div>' +
        '<span class="challenge-status' + (exhausted ? ' done' : activeTimedOut ? ' failed' : isActive ? ' active' : '') + '">' + status + '</span></header>';
      h += '<div class="challenge-card-rule"><small>本轮限制</small><p>' + rule + '</p>' +
        '<small>通关目标</small><p>' + (d.goalText || '完成《神学》并凿穿天壳') + '</p></div>';

      if (d.tiers.length > 1) {
        h += '<div class="challenge-tiers">';
        for (var ti = 0; ti < d.tiers.length; ti++) {
          var td = d.tiers[ti], tierActive = isActive && active.tier === ti;
          var tierState = ti < done ? '已通关' : tierActive ? (activeTimedOut ? '已超时' : '进行中') : ti === done && !blocked && !exhausted ? '下一档' : '锁定';
          var tierRule = d.id === 'science' ? '学者、' + scribeName + '各 ≤ ' + td.cap + ' 人' :
            d.id === 'speedrun' ? '限时 ' + api.formatClock(td.cap) + ' · 离线计时' : '本轮全产出 -' + Math.round(td.cap * 100) + '%';
          h += '<div class="challenge-tier' + (ti < done ? ' done' : tierActive ? (activeTimedOut ? ' active failed' : ' active') : ti === done && !blocked && !exhausted ? ' next' : '') + '">' +
            '<span class="challenge-tier-medal" aria-hidden="true"><img src="' + d.badge + '" alt=""><i>' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][ti] + '</i></span>' +
            '<div><b>' + td.label + '</b><span>' + tierState + '</span></div><small>' + tierRule + '</small>' +
            '<em>奖励：' + d.rewards[ti] + '</em></div>';
        }
        h += '</div>';
      } else {
        h += '<div class="challenge-reward"><small>永久奖励</small><b>' + d.reward + '</b></div>';
      }

      if (exhausted) {
        h += '<footer class="challenge-card-foot"><span>奖励已永久生效，此挑战入口已关闭。</span></footer>';
      } else if (isActive) {
        var activeFoot = activeTimedOut ? '已超时；重开本周目后可重试，档位不会消耗。' :
          s.challengeDone && d.id === 'drift_terra' ? '目标已完成，永久奖励已入账；可以继续发展或开始新周目。' :
            d.id === 'drift_terra' ? '达成目标时永久奖励会立即生效；你可以继续发展或开始新周目。' :
              '本轮限制生效中。通关后领取当前档奖励。';
        h += '<footer class="challenge-card-foot"><span>' + activeFoot +
          '</span><button class="btn" disabled>' + (activeTimedOut ? '本档已超时' : '本轮挑战中') + '</button></footer>';
      } else if (blocked) {
        h += '<footer class="challenge-card-foot"><span>先完成或重开当前挑战周目。</span><button class="btn" disabled>暂不可开始</button></footer>';
      } else {
        h += '<footer class="challenge-card-foot"><span>首次通关本档：轮回点获取永久 +10%。</span>' +
          '<button class="btn challenge-start" type="button" data-challenge-start="' + d.id + '">结算并挑战 · ' + d.tiers[next].label + '</button></footer>';
      }
      h += '</article>';
    }
    h += '</section><div class="challenge-footnote">挑战奖励跨周目保留。挑战失败或主动重开不会消耗档位，也不会领取奖励。</div>';
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
