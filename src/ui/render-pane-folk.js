/* 天壳 / SHELLBREAK — 族民 pane 渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneFolk() {
    var s = SB.game.run();
    var T = SB.CFG.TIDE;
    /* ⚠️ 硬上限下 `pop` 永远 ≤ `popCap`，所以括号里的上限不会再和人数打架
     * （2026-09-25 那版软容量会打出「族民 7（人口上限 2）」，玩家报过一次 bug）。
     * 但光看数字，玩家仍会问「那为什么不再生人」⇒ 顶到时直接标红「住满」，
     * 下一行的生育进度条会写明原因（缺住房）。 */
    var h = '<div class="row folk-summary"><div><div class="nm">族民 ' + s.pop + '（人口上限 ' + SB.economy.popCap(s) + '）' +
      (SB.economy.isFull(s) ? '<span class="bad">住满</span>' : '') + '</div>' +
      '<div class="ds">藻场见底会饿死；冰封期会冻死。保温巢能省口粮，藻场不够就先补场。</div></div></div>';
    h += SB.ui.renderCommon.happyPanelHTML(s);
    /* 生育状态常驻一行：进度条只有 3px，且停摆时空着和漏存长得一样，
     * 这里用文字把「还需几秒」和「为什么走不动」摊开，手机上不靠 hover 也能看见。
     * 【为什么用 id 而不是整块重画】renderPanes 只在切页/置脏时跑，
     * 每帧的 renderTick 不碰 pane 的 innerHTML——这行要是拼死在字符串里就永远不会动
     * （实测：数字定格、条纹丝不动，刷新页面才更新）。于是挂 id，paintGrow 每帧只改这三处。 */
    h += '<div class="row folk-growth"><div><div class="nm" id="growNm"></div>' +
      '<div class="gbar"><i id="growFill" style="width:0%"></i></div>' +
      '<div class="ds" id="growWhy"></div></div></div>';
    SB.ui.render.paintGrow(s);   // renderPanes 还没把 innerHTML 挂上时这里是空操作，下一帧（≤100ms）会补上
    /* 峰值族民是破冰结算的主指标之一：人口越深、工坊解锁越多、破壳越彻底，轮回点越多。
     * 直接把 breakReport 的实时预计摆出来，避免再显示已废弃的 POP_GATE / POP_SLOPE 旧口径。 */
    var br = SB.prestige.breakReport(s);
    h += '<div class="row folk-peak"><div><div class="nm">峰值族民 <b>' + s.peak + '</b> ' +
      '<span class="tag ok">预计轮回点 ' + br.tidePoints.toFixed(2) + '</span></div>' +
      '<div class="ds">轮回点 = 1 + floor(发展分 × ' + (T.LINEAR_K) + ' × 破壳系数)，' +
      '发展分 = 2×峰值 + 建筑纪元分 + 工坊解锁项（' + br.workshopCount + ' 项）。' +
      '养人口、破壳、开工坊三条线都给点。</div></div></div>';
    /* 照猫国：族民默认闲置，＋ 雇 / − 退。没有闲置时 ＋ 禁用，
     * 职业总和永远 ≤ pop——不搞「减 A 立刻补给 B」的转移制。 */
    var idle = SB.folk.idle(s);
    h += '<div class="row folk-idle"><div><div class="nm">闲置 <b>' + idle + '</b></div>' +
      '<div class="ds">没活干的族民。点职业行的 ＋ 雇佣，− 退回闲置。</div></div></div>';
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
    for (var i = 0; i < SB.JOBS.length; i++) {
      var j = SB.JOBS[i];
      /* ⚠️ `|| 0` 不是可省的小节：它是**根因侧的第二道闸**。2026-09-28 加商人时，
       *    state.js 的 jobs 字面量漏了 merchant ⇒ 这里是 `undefined <= 0` ⇒ **false** ⇒
       *    守卫以为「这行有人」⇒ 未解锁的商人被整行渲染出来，玩家看得见、点 ＋ 却雇不到。
       *    economy 那侧当时都写了 `(s.jobs.x || 0)` 才没出 NaN，说明数据层的覆盖纪律
       *    已经反复漏过；UI 不该把「存档一定给全了键」当前提。补这个 `|| 0` 是
       *    让下一份漏键至少不会长成「看得见但按不动」的哑控件。 */
      if ((s.jobs[j.id] || 0) <= 0 && !SB.folk.jobUnlocked(s, j.id)) continue;
      /* ⚠️ 名字必须走 `SB.folk.jobName(s, id)` 而不是 `j.name`：采集者在掌握「种植」之后
       * 要改称「农民」（用户 2026-09-26 拍板：是同一个人换了身份，不是多一个职业）。
       * 改称机制写在 folk.js（FARM_JOB / FARM_TECH / FARM_NAME），但这里原先直接印
       * 数据表的 `j.name`，于是那套机制**只在科技页生效、族民页从不生效**——
       * 科技页说「…农民」，族民页同一行照旧写着「采集者」，两边打架且都不报错。
       * （与「科技面板从不渲染 note」同族：机制写好了、UI 不读它。） */
      var stp = SB.ui.render.jobStep();
      var jobLimit = SB.folk.jobLimit(s, j.id);
      var atJobLimit = s.jobs[j.id] >= jobLimit;
      var jobLimitReason = SB.folk.jobLimitReason(s, j.id);
      h += '<div class="row folk-job-row" data-job-row="' + j.id + '"><div><div class="nm">' + SB.folk.jobName(s, j.id) +
        ' <b id="j-' + j.id + '">' + s.jobs[j.id] + '</b>' + (isFinite(jobLimit) ? ' / ' + jobLimit : '') + '</div>' +
        '<div class="ds">' + j.desc + '</div></div>' +
        '<div class="folk-job-controls">' +
        /* 2026-10-14 方案 B（猫国式极简 + 步长胶囊）：可见 UI 只有一对 −/＋ 小按钮，
         * ±5/±10 收进「×N」胶囊（点击循环 ×1→×5→×10，全局记忆不每行一份）。
         * 大步长是交互问题不是按钮问题——修「8 个 40px 按钮喧宾夺主」。
         * 步长仍由 folk.assign 双向钳制（加钳到 idle、减钳到在岗数）。
         * ⚠️ 2026-10-16 用户：取消「双击 = 最大/最小」——容易误触整职业清零/塞满。 */
        '<button class="btn fc-step" data-step="1" title="点击切换步长：×1 → ×5 → ×10（所有职业共用）">×' + stp + '</button>' +
        '<button class="btn" data-job="' + j.id + '" data-d="-' + stp + '"' + (s.jobs[j.id] <= 0 ? ' disabled' : '') +
          ' title="−' + stp + '（不足则全退）">−</button>' +
        '<button class="btn" data-job="' + j.id + '" data-d="' + stp + '"' + (idle <= 0 || atJobLimit ? ' disabled' : '') +
          ' title="' + (jobLimitReason || ('＋' + stp + '（不足则加全部闲置）')) + '">＋</button>' +
        '</div></div>';
    }
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
      h += '<div class="row folk-summary"><div><div class="nm">机器人 <b>' + rpop + '</b>（产出 ×1.2，不占人口/不影响信仰）' +
        (ridle > 0 ? ' <span class="bad">闲置 ' + ridle + '</span>' : '') + '</div>' +
        '<div class="ds">机器人仅能担任非书手/学者的岗位。点 ＋ 分配、− 退回。</div></div>';
      var rstep = SB.ui.render.jobStep();
      for (var ri = 0; ri < SB.JOBS.length; ri++) {
        var rj = SB.JOBS[ri];
        if (!SB.folk.robotJobAllowed(rj.id)) continue;
        if ((rjobs[rj.id] || 0) <= 0 && !SB.folk.jobUnlocked(s, rj.id)) continue;
        var rjobLimit = SB.folk.jobLimit(s, rj.id);
        var ratJobLimit = (rjobs[rj.id] || 0) >= rjobLimit;
        var rjobLimitReason = SB.folk.jobLimitReason(s, rj.id);
        h += '<div class="row folk-job-row" data-robot-job-row="' + rj.id + '"><div><div class="nm">' +
          SB.folk.jobName(s, rj.id) + '（机器人） <b id="rj-' + rj.id + '">' + (rjobs[rj.id] || 0) + '</b>' +
          (isFinite(rjobLimit) ? ' / ' + rjobLimit : '') + '</div>' +
          '<div class="ds">' + rj.desc + '</div></div>' +
          '<div class="folk-job-controls">' +
          '<button class="btn fc-step" data-step="1" title="点击切换步长：×1 → ×5 → ×10（所有职业共用）">×' + rstep + '</button>' +
          '<button class="btn" data-robot-job="' + rj.id + '" data-d="-' + rstep + '"' + ((rjobs[rj.id] || 0) <= 0 ? ' disabled' : '') +
            ' title="−' + rstep + '（不足则全退）">−</button>' +
          '<button class="btn" data-robot-job="' + rj.id + '" data-d="' + rstep + '"' + (ridle <= 0 || ratJobLimit ? ' disabled' : '') +
            ' title="' + (rjobLimitReason || ('＋' + rstep + '（不足则加全部闲置机器人）')) + '">＋</button>' +
          '</div></div>';
      }
    }
    /* ⚠️ 硬上限之后开局的**第一步是珊瑚不是藻食**（2026-09-26）：那 1 名族民顶着
     * 人口上限 1，先把藻食堆到 20 以上也生不出人——必须先有礁口巢才有空位。
     * 旧文案只教「攒藻食建菌圃」，玩家照做会发现人口纹丝不动。 */
    h += '<div class="note">开局 1 名族民顶着人口上限：先在「' + SB.habitat.habitatName(SB.game.run()) + '」页点「采珊瑚」攒 5 建礁口巢' +
      '（上限 1 → 3），再让藻食超过 ' + SB.CFG.GROW_KEEP + '，才生得下第二人。</div>';
    return h;
  }

  parts.paneFolk = paneFolk;
})(typeof window !== 'undefined' ? window : globalThis);
