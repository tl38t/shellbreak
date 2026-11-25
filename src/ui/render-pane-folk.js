/* 天壳 / SHELLBREAK — 族民 pane 渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function tr(key, params) {
    return SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
  }

  var FOLK_FILTER_ALLOWED = ['all', 'assigned'];
  var FOLK_DENSITY_ALLOWED = ['detail', 'compact'];
  var folkFilterFallback = 'all';
  var folkDensityFallback = 'detail';
  function getFolkFilter() {
    var S = SB.store;
    if (S && S.prefGetStr) return S.prefGetStr('folk.filter', FOLK_FILTER_ALLOWED, 'all');
    return folkFilterFallback;
  }
  function setFolkFilter(val) {
    if (FOLK_FILTER_ALLOWED.indexOf(val) < 0) return false;
    folkFilterFallback = val;
    var S = SB.store;
    if (S && S.prefSetStr) S.prefSetStr('folk.filter', val, FOLK_FILTER_ALLOWED);
    return true;
  }
  function getFolkDensity() {
    var S = SB.store;
    if (S && S.prefGetStr) return S.prefGetStr('folk.density', FOLK_DENSITY_ALLOWED, 'detail');
    return folkDensityFallback;
  }
  function setFolkDensity(val) {
    if (FOLK_DENSITY_ALLOWED.indexOf(val) < 0) return false;
    folkDensityFallback = val;
    var S = SB.store;
    if (S && S.prefSetStr) S.prefSetStr('folk.density', val, FOLK_DENSITY_ALLOWED);
    return true;
  }

  function jobDescription(job) {
    var params = job.id === 'soldier' && SB.war
      ? { baseMilitaryPower: SB.war.soldierBaseRate().toFixed(1) } : null;
    return tr('job.' + job.id + '.description', params) || job.desc;
  }

  function paneFolk() {
    var s = SB.game.run();
    var T = SB.CFG.TIDE;
    /* ⚠️ 硬上限下 `pop` 永远 ≤ `popCap`，所以括号里的上限不会再和人数打架
     * （2026-09-25 那版软容量会打出「族民 7（人口上限 2）」，玩家报过一次 bug）。
     * 但光看数字，玩家仍会问「那为什么不再生人」⇒ 顶到时直接标红「住满」，
     * 下一行的生育进度条会写明原因（缺住房）。 */
    var h = '<div class="folk-census"><div class="row folk-summary"><div><div class="nm">' + tr('ui.folk.population_summary', {
      populationCount: s.pop, populationCap: SB.economy.popCap(s)
    }) + (SB.economy.isFull(s) ? '<span class="bad">' + tr('ui.folk.population.status.full') + '</span>' : '') + '</div>' +
      '<div class="ds">' + tr('ui.folk.population.survival_hint') + '</div></div></div>';
    /* 生育状态常驻一行：进度条只有 3px，且停摆时空着和漏存长得一样，
     * 这里用文字把「还需几秒」和「为什么走不动」摊开，手机上不靠 hover 也能看见。
     * 【为什么用 id 而不是整块重画】renderPanes 只在切页/置脏时跑，
     * 每帧的 renderTick 不碰 pane 的 innerHTML——这行要是拼死在字符串里就永远不会动
     * （实测：数字定格、条纹丝不动，刷新页面才更新）。于是挂 id，paintGrow 每帧只改这三处。 */
    h += '<div class="row folk-growth"><div><div class="nm" id="growNm"></div>' +
      '<div class="gbar"><i id="growFill" style="width:0%"></i></div>' +
      '<div class="ds" id="growWhy"></div></div></div>';
    h += '</div>';
    SB.ui.render.paintGrow(s);   // renderPanes 还没把 innerHTML 挂上时这里是空操作，下一帧（≤100ms）会补上
    /* 硬上限后开局的第一步是采珊瑚并建巢，不是先攒藻食；这条引导只在住房上限
     * 仍为 1 且只有 1 名族民时出现，扩建住房后收起。沿用登记过的原文案。 */
    if (SB.economy.popCap(s) <= 1 && s.pop <= 1) {
      h += '<div class="note folk-opening-tip">' + tr('ui.folk.opening.growth_tip', {
        habitatName: SB.habitat.habitatName(s), kelpThreshold: SB.CFG.GROW_KEEP
      }) + '</div>';
    }
    h += SB.ui.renderCommon.happyPanelHTML(s);
    h += '<div class="folk-overview-facts">';
    /* 峰值族民是破冰结算的主指标之一：人口越深、工坊解锁越多、破壳越彻底，轮回点越多。
     * 直接把 breakReport 的实时预计摆出来，避免再显示已废弃的 POP_GATE / POP_SLOPE 旧口径。 */
    var br = SB.prestige.breakReport(s);
    h += '<div class="row folk-peak"><div><div class="nm">' + tr('ui.folk.peak.summary', {
      peakPopulation: s.peak, estimatedPrestigePoints: br.tidePoints.toFixed(2)
    }) + '</div><div class="ds">' + tr('ui.folk.peak.prestige_formula', {
      linearMultiplier: T.LINEAR_K, workshopUnlockCount: br.workshopCount
    }) + '</div></div></div>';
    if (SB.war && SB.folk.jobUnlocked(s, 'soldier')) {
      var militaryPower = SB.war.power(s), militaryRate = SB.war.rate(s);
      var powerText = SB.economy && SB.economy.fmtAbbr
        ? SB.economy.fmtAbbr(militaryPower, militaryPower.toFixed(2)) : militaryPower.toFixed(2);
      var rateText = SB.economy && SB.economy.fmtAbbr
        ? SB.economy.fmtAbbr(militaryRate, militaryRate.toFixed(2)) : militaryRate.toFixed(2);
      h += '<div class="row folk-summary folk-power"><div><div class="nm">' + tr('ui.war.power.summary', {
        power: powerText, rate: rateText
      }) + '</div></div></div>';
    }
    h += '</div>';
    /* 照猫国：族民默认闲置，＋ 雇 / − 退。没有闲置时 ＋ 禁用，
     * 职业总和永远 ≤ pop——不搞「减 A 立刻补给 B」的转移制。 */
    var idle = SB.folk.idle(s);
    var fFilter = getFolkFilter();
    var fDensity = getFolkDensity();
    var stepSizeOptions = '×1 → ×5 → ×10';
    var stp = SB.ui.render.jobStep();
    h += '<div class="pane-toolbar" role="toolbar">' +
      '<div class="pane-filter-group">' +
        '<button type="button" class="pane-pill' + (fFilter === 'all' ? ' on' : '') + '" data-folk-filter="all" aria-pressed="' + (fFilter === 'all') + '">' + (tr('village.filter.all') || '全部') + '</button>' +
        '<button type="button" class="pane-pill' + (fFilter === 'assigned' ? ' on' : '') + '" data-folk-filter="assigned" aria-pressed="' + (fFilter === 'assigned') + '">' + (tr('folk.filter.assigned') || '已在岗') + '</button>' +
      '</div>' +
      '<div class="pane-density-group">' +
        '<button type="button" class="pane-pill' + (fDensity === 'detail' ? ' on' : '') + '" data-folk-density="detail" aria-pressed="' + (fDensity === 'detail') + '">' + (tr('village.density.detail') || '详细') + '</button>' +
        '<button type="button" class="pane-pill' + (fDensity === 'compact' ? ' on' : '') + '" data-folk-density="compact" aria-pressed="' + (fDensity === 'compact') + '">' + (tr('village.density.compact') || '简洁') + '</button>' +
      '</div></div>';
    h += '<div class="row folk-idle folk-workforce-head"><div><div class="nm">' + tr('ui.folk.idle_people.summary', {
      idlePeopleCount: idle
    }) + '</div><div class="ds">' + tr('ui.folk.idle_people.hint') + '</div></div>' +
      '<div class="folk-job-controls"><button class="btn fc-step" data-step="1" title="' +
        tr('ui.folk.assignment.step.tooltip', { stepSizeOptions: stepSizeOptions }) + '">×' + stp + '</button></div></div>';
    /* ⚠️ 未解锁的职业**整行不渲染**（用户 2026-09-26：「一开始不要把这些职业显示出来，
     *   解锁一个显示一个」）。判据只有一处：`SB.folk.jobUnlocked`，它反查 techs.js 的
     *   eff.unlockJob。开局族民页上有「采集者」与「珊瑚匠」两张脸
     *   （gather 无解锁条件；珊瑚匠随免费的「凿珊瑚」开局掌握，理由见 techs.js 那条注），
     *   采石/采矿/匠作/学者各点亮一项、就多出一行。
     * 【为什么职业不需要建筑那套 `s.seen` 单向表】建筑解锁挂在科技/资源门槛上，
     *   职业挂在 s.techs 上，而科技一旦掌握**永不回退**
     *   ⇒ 露头天然只进不退，不需要额外的记忆位。
     * 【为什么带 `s.jobs[j.id] > 0`】防御老档：若某人卡在未解锁职业上（早期版本的档），
     *   行必须留下来，否则那个人从界面上凭空消失、玩家只能在闲置池里看到总数对不上。 */
    h += '<div class="folk-job-grid">';
    var folkShown = 0;
    for (var i = 0; i < SB.JOBS.length; i++) {
      var j = SB.JOBS[i];
      /* ⚠️ `|| 0` 不是可省的小节：它是**根因侧的第二道闸**。2026-09-28 加商人时，
       *    state.js 的 jobs 字面量漏了 merchant ⇒ 这里是 `undefined <= 0` ⇒ **false** ⇒
       *    守卫以为「这行有人」⇒ 未解锁的商人被整行渲染出来，玩家看得见、点 ＋ 却雇不到。
       *    economy 那侧当时都写了 `(s.jobs.x || 0)` 才没出 NaN，说明数据层的覆盖纪律
       *    已经反复漏过；UI 不该把「存档一定给全了键」当前提。补这个 `|| 0` 是
       *    让下一份漏键至少不会长成「看得见但按不动」的哑控件。 */
      if ((s.jobs[j.id] || 0) <= 0 && !SB.folk.jobUnlocked(s, j.id)) continue;
      if (fFilter === 'assigned' && (s.jobs[j.id] || 0) <= 0) continue;
      /* ⚠️ 名字必须走 `SB.folk.jobName(s, id)` 而不是 `j.name`：采集者在掌握「种植」之后
       * 要改称「农民」（用户 2026-09-26 拍板：是同一个人换了身份，不是多一个职业）。
       * 改称机制写在 folk.js（FARM_JOB / FARM_TECH / FARM_NAME），但这里原先直接印
       * 数据表的 `j.name`，于是那套机制**只在科技页生效、族民页从不生效**——
       * 科技页说「…农民」，族民页同一行照旧写着「采集者」，两边打架且都不报错。
       * （与「科技面板从不渲染 note」同族：机制写好了、UI 不读它。） */
      var jobLimit = SB.folk.jobLimit(s, j.id);
      var atJobLimit = s.jobs[j.id] >= jobLimit;
      var jobLimitReason = SB.folk.jobLimitReason(s, j.id);
      h += '<div class="row folk-job-row" data-job-row="' + j.id + '"><div><div class="nm">' + SB.folk.localizedJobName(s, j.id) +
        ' <b id="j-' + j.id + '">' + s.jobs[j.id] + '</b>' + (isFinite(jobLimit) ? ' / ' + jobLimit : '') + '</div>' +
        '<div class="ds"' + (fDensity === 'compact' ? ' hidden' : '') + '>' + jobDescription(j, s) + '</div></div>' +
        '<div class="folk-job-controls">' +
        /* 2026-11-14：步长按钮已提升到闲置人口栏，全局人类/机器人共用；
         * 职业行只保留实际分配动作，减少重复控件和视觉噪声。
         * 步长仍由 folk.assign 双向钳制（加钳到 idle、减钳到在岗数）。 */
        '<button class="btn" data-job="' + j.id + '" data-d="-' + stp + '"' + (s.jobs[j.id] <= 0 ? ' disabled' : '') +
          ' title="' + tr('ui.folk.assignment.decrease.tooltip', { stepSize: stp }) + '">−</button>' +
        '<button class="btn" data-job="' + j.id + '" data-d="' + stp + '"' + (idle <= 0 || atJobLimit ? ' disabled' : '') +
          ' title="' + (jobLimitReason || tr('ui.folk.job.assign.tooltip', { stepSize: stp })) + '">＋</button>' +
        '</div></div>';
      folkShown++;
    }
    if (!folkShown) {
      h += '<div class="row"><div class="ds">' + (tr('village.filter.empty') || '当前筛选下没有可显示的条目，可点上方「全部」查看。') + '</div></div>';
    }
    h += '</div>';
    /* ERA8（2026-10-19 · B7）：机器人分配段。机器人是独立池，仅能担任非书手/学者的岗位，
     * 产出 ×1.2，不进 s.pop（不影响信仰）。布局与人类职业行同构，但用 data-robot-job 区分事件。 */
    var rpop = SB.folk.robotPop(s), ridle = SB.folk.robotIdle(s);
    if (rpop > 0) {
      /* ⚠️【根因侧读守卫】s.robotJobs 是 ERA8 B7 新增存档键。在「robotJobs 种子加入前就建了
       *    robotbay 的本局 / 读旧档」里，运行期这个键是 undefined。freshRun 已种子化，但
       *   当前内存态不一定有（迁移只在下次读档才补），render 又先于迁移跑 ⇒ 这里若直接
       *   读 `s.robotJobs[id]` 会抛「Cannot read properties of undefined」⇒ paneFolk 抛错 ⇒
       *   整页 renderAll 崩掉 ⇒ 族民页所有点击（人类＋/机器人＋/×N 步长）看起来全死。
       *   与 assignRobot 的 `if (!s.robotJobs) s.robotJobs = {}` 同源：读侧先兜底成空对象，
       *   迁移（state-migrate.js）再补种子，双闸防这一种「看得见但点了全没反应」的哑崩。 */
      var rjobs = s.robotJobs || {};
      h += '<div class="folk-robot-section">';
      h += '<div class="row folk-summary"><div><div class="nm">' + tr('ui.folk.robot_population.summary', {
        robotPopulationCount: rpop, robotOutputMultiplier: 1.2
      }) + '</div><div class="ds">' + tr('ui.folk.robot_job.restriction') + '</div></div></div>';
      h += '<div class="row folk-idle"><div><div class="nm">' + tr('ui.folk.idle_robots.summary', {
        idleRobotCount: ridle
      }) + '</div><div class="ds">' + tr('ui.folk.idle_robots.hint') + '</div></div></div>';
      h += '<div class="folk-job-grid">';
      var rstep = stp;
      for (var ri = 0; ri < SB.JOBS.length; ri++) {
        var rj = SB.JOBS[ri];
        if (!SB.folk.robotJobAllowed(rj.id)) continue;
        if ((rjobs[rj.id] || 0) <= 0 && !SB.folk.jobUnlocked(s, rj.id)) continue;
        var rjobLimit = SB.folk.jobLimit(s, rj.id);
        var ratJobLimit = (rjobs[rj.id] || 0) >= rjobLimit;
        var rjobLimitReason = SB.folk.jobLimitReason(s, rj.id);
        h += '<div class="row folk-job-row" data-robot-job-row="' + rj.id + '"><div><div class="nm">' +
          tr('ui.folk.robot_job.label', { jobName: SB.folk.localizedJobName(s, rj.id) }) + ' <b id="rj-' + rj.id + '">' + (rjobs[rj.id] || 0) + '</b>' +
          (isFinite(rjobLimit) ? ' / ' + rjobLimit : '') + '</div>' +
          '<div class="ds">' + jobDescription(rj) + '</div></div>' +
          '<div class="folk-job-controls">' +
          '<button class="btn" data-robot-job="' + rj.id + '" data-d="-' + rstep + '"' + ((rjobs[rj.id] || 0) <= 0 ? ' disabled' : '') +
            ' title="' + tr('ui.folk.assignment.decrease.tooltip', { stepSize: rstep }) + '">−</button>' +
          '<button class="btn" data-robot-job="' + rj.id + '" data-d="' + rstep + '"' + (ridle <= 0 || ratJobLimit ? ' disabled' : '') +
            ' title="' + (rjobLimitReason || tr('ui.folk.robot_job.assign.tooltip', { stepSize: rstep })) + '">＋</button>' +
          '</div></div>';
      }
      h += '</div>';
      h += '</div>';
    }
    return h;
  }

  parts.paneFolk = paneFolk;
  parts.setFolkFilter = setFolkFilter;
  parts.setFolkDensity = setFolkDensity;
})(typeof window !== 'undefined' ? window : globalThis);
