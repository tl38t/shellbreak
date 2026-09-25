/* 天壳 / SHELLBREAK — 渲染层
 * 只读：渲染函数不得修改游戏状态，需要改数据时走 SB.game 暴露的动作。
 * 脏标记合并：一帧内多次改数据只重渲染一次，避免「点一下卡一下」。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;
  var E = null, P = null;   // 延迟取，避免加载顺序耦合

  var PANE_KEYS = ['village', 'folk', 'tech', 'dig', 'meta'];

  function res() { return SB.game.run(); }
  function meta() { return SB.game.meta(); }

  function el(id) { return document.getElementById(id); }

  function renderRes() {
    var s = res(), g = el('res');
    if (!s || !g) return;
    var need = SB.economy.foodUse(s);
    var html = '';
    for (var k in SB.RESS) {
      var v = s.res[k];
      var cls = 'res' + (k === 'kelp' && v < need ? ' neg' : '');
      html += '<div class="' + cls + '"><b data-res="' + k + '" data-raw="' + (+v).toFixed(2) + '">' +
        SB.economy.fmt(v) + '</b><span>' + SB.RESS[k].name + '</span></div>';
    }
    g.innerHTML = html;
    var se = SB.economy.season(s.t);
    el('seasonLine').textContent =
      '洋流季：' + se.name + ' ×' + se.mult.toFixed(2) +
      '｜族民 ' + s.pop + '/' + SB.economy.houseCap(s) +
      '｜峰值 ' + s.peak + '（洋流点门槛 ' + CFG.TIDE.POP_GATE + '）' +
      '｜饿死 ' + s.famineDeaths + '｜冻死 ' + s.frostDeaths +
      '｜冰封期 ' + Math.floor(s.coldTicks / 60) + ' 分 ' + Math.floor(s.coldTicks % 60) + ' 秒';
  }

  function renderShell() {
    var s = res(); if (!s) return;
    var p = SB.economy.rOf(s) * 100;
    var f = el('shellFill');
    f.style.width = Math.max(0, p) + '%';
    f.className = 'shellfill' + (SB.economy.isCold(s) ? ' cold' : '');
    el('shellTxt').innerHTML =
      Math.round(s.shell) + ' / ' + s.iceShell + '（' + p.toFixed(1) + '%）' +
      (SB.economy.isCold(s) ? ' <span class="coldbadge">· 冰封期</span>' : '');
    var hint = '基础削壳持续中：系数越高削得越快，族民、建筑、科技、祭坛都在推高它。';
    if (SB.economy.rOf(s) <= CFG.FLOOR_AT) {
      hint = '壳已薄到下限，基础削壳停手——凿穿最后一段只剩破冰祭坛一条路。';
    }
    if (SB.economy.isCold(s)) hint += ' 冰封期：全局产出 ×0.6，族民会冻伤。';
    el('shellHint').textContent = hint;
  }

  function paneVillage() {
    var s = res(); let h = '';
    for (var i = 0; i < SB.BUILDINGS.length; i++) {
      var b = SB.BUILDINGS[i];
      /* 照猫国建设者：没露头的建筑整行不渲染——开局列表里只有深海菌圃一张脸，
       * 其余随 unlockRatio(0.3) / unlockScheme / requiredTech 逐个出现。
       * 建过一级的永久可见，避免资源花掉跌破阈值时整行闪烁消失。 */
      var lv = s.lvl[b.id] || 0;
      if (lv <= 0 && !SB.habitat.unlocked(s, b)) continue;
      var c = SB.economy.costOf(s, b.id);
      var ok = SB.economy.canAfford(s, c);
      var blocked = !SB.habitat.needMet(s, b);
      var label = blocked ? '需 ' + (SB.habitat.buildingById(b.need) || {}).name
        : (ok ? '建造' : ' ' + SB.economy.costTxt(c));
      // 没有等级上限，所以只显示当前级数，不显示 x/上限
      h += '<div class="row"><div><div class="nm">' + b.name +
        ' <span class="tag" data-lv="' + b.id + '">' + lv + '</span></div>' +
        '<div class="ds">' + b.desc + (blocked ? '（需先建成' + (SB.habitat.buildingById(b.need) || {}).name + '）' : '') +
        '</div></div>' +
        '<button class="btn buy" data-build="' + b.id + '"' + (ok && !blocked ? '' : ' disabled') + '>' + label + '</button></div>';
    }
    return h;
  }

  function paneFolk() {
    var s = res();
    var T = CFG.TIDE;
    var gap = Math.max(0, T.POP_GATE - s.peak);
    var h = '<div class="row"><div><div class="nm">族民 ' + s.pop + ' / 住房上限 ' + SB.economy.houseCap(s) + '</div>' +
      '<div class="ds">菌毯见底会饿死；冰封期会冻死。保温巢能省口粮，菌圃不够就先补圃。</div></div></div>';
    /* 峰值族民是破冰结算的唯一主指标（洋流点 = 门槛以上每 1 人 36 分）。
     * 不把它摆到玩家眼前，「养人口」这条第二条线就不存在——玩家只会继续堆建筑。 */
    h += '<div class="row"><div><div class="nm">峰值族民 <b>' + s.peak + '</b> ' +
      '<span class="tag' + (gap > 0 ? '' : ' ok') + '">' +
      (gap > 0 ? '还差 ' + gap + ' 人有洋流点' : '已过门槛 ' + T.POP_GATE) + '</span></div>' +
      '<div class="ds">破冰时超过 ' + T.POP_GATE + ' 的部分才折算洋流点，每 1 人 ' + T.POP_SLOPE +
      ' 分（' + T.POP_ESC.at + ' 人以上 ' + T.POP_ESC.k + ' 分）。住房没有硬上限，堆珊瑚巢就是养人口。</div></div></div>';
    for (var i = 0; i < SB.JOBS.length; i++) {
      var j = SB.JOBS[i];
      h += '<div class="row"><div><div class="nm">' + j.name + ' <b id="j-' + j.id + '">' + s.jobs[j.id] + '</b></div>' +
        '<div class="ds">' + j.desc + '</div></div>' +
        '<div style="display:flex;gap:4px">' +
        '<button class="btn" data-job="' + j.id + '" data-d="-1"' + (s.jobs[j.id] <= 0 ? ' disabled' : '') + '>−</button>' +
        '<button class="btn" data-job="' + j.id + '" data-d="1">＋</button></div></div>';
    }
    h += '<div class="note">手动调配职业比例是这局的主要操作——尤其是冰封期该堆几个匠人。</div>';
    return h;
  }

  function paneTech() {
    var s = res(); let h = '';
    for (var i = 0; i < SB.TECHS.length; i++) {
      var t = SB.TECHS[i];
      var done = !!s.techs[t.id], ok = s.res.science >= t.cost;
      h += '<div class="row"><div><div class="nm">' + t.name +
        ' <span class="tag ' + (done ? 'ok' : '') + '">' + (done ? '已掌握' : '未掌握') + '</span></div>' +
        '<div class="ds">' + t.desc + '</div></div>' +
        '<button class="btn buy" data-tech="' + t.id + '"' + (done ? ' disabled' : ok ? '' : ' disabled') + '>' +
        (done ? '—' : '研究 ' + t.cost) + '</button></div>';
    }
    return h;
  }

  /* 破壳面板：让玩家看清「系数从哪来」和「祭坛为什么停」。
   * 这两件事一旦变成黑箱，玩家不知道自己该做什么，机制就白设了。 */
  function paneMiracle() {
    var s = res(), C = CFG.COEF, sum = SB.economy.lvlSum(s);
    var lv = s.lvl.miracle || 0;

    var parts = [
      ['族民 ' + s.pop, C.POP * Math.pow(s.pop, C.POP_POW)],
      ['建筑 ' + sum + ' 级', C.LVL * Math.pow(sum, C.LVL_POW)],
      ['科技 ' + SB.shell.techCount(s), C.TECH * SB.shell.techCount(s)],
      ['祭坛 ' + lv, C.MIR * lv]
    ];
    if (s.perk.coef) parts.push(['洋流 ' + s.perk.coef, C.PERK * s.perk.coef]);

    var h = '<div class="row"><div><div class="nm">破壳系数 <b>' + SB.shell.breakCoef(s).toFixed(2) + '</b></div>' +
      '<div class="ds">' + parts.map(function (p) { return p[0] + ' ' + p[1].toFixed(2); }).join(' ＋ ') +
      (SB.economy.isCold(s) ? '，再 ×' + C.COLD + ' 冰封期' : '') +
      '</div></div></div>';

    h += '<div class="row"><div><div class="nm">基础削壳 <b>' + SB.shell.autoRate(s).toFixed(2) + '</b> 点/秒</div>' +
      '<div class="ds">自动推进，但只把壳削到 ' + (CFG.FLOOR_AT * 100) + '% 就停手。</div></div></div>';

    h += '<div class="row"><div><div class="nm">破冰祭坛 ' + lv + '</div>' +
      '<div class="ds">' + (lv > 0
        ? '速率 ' + SB.shell.miracleRate(s).toFixed(2) + ' 点/秒 ｜ 地热消耗 ' + SB.shell.miracleBurn(s).toFixed(2) + '/秒'
        : '凿穿最后 ' + (CFG.FLOOR_AT * 100) + '% 壳厚的唯一手段。') + '</div></div>' +
      '<label style="display:flex;align-items:center;gap:6px">' +
      '<input type="checkbox" id="miracleToggle" data-miracle="1"' + (s.miracleOn ? ' checked' : '') +
      (lv > 0 ? '' : ' disabled') + '><span style="font-size:12px;color:var(--dim)">' +
      (s.miracleOn ? '启动中' : '已停机') + '</span></label></div>';

    h += '<div class="row"><div><div class="nm">地热 <b>' + SB.economy.fmt(s.res.fuel) + '</b></div>' +
      '<div class="ds">热泉井 × 匠人产出。供给跟不上祭坛，祭坛就停摆。</div></div></div>';

    if (s.starved) h += '<div class="note" style="color:var(--red)">地热耗尽，祭坛停摆——把匠人调去热泉井，或再建一级。</div>';
    else h += '<div class="note">祭坛按速率自动凿壳，地热断了自动停、恢复自动继续。你要管的是燃料，不是点击。</div>';
    return h;
  }

  function paneMeta() {
    var m = meta();
    var h = '<div class="row"><div><div class="nm">洋流点 ' + m.tide.toFixed(2) + '</div>' +
      '<div class="ds">已消费 ' + m.spent.toFixed(2) + '｜周目 ' + m.cycle + '｜破层 ' + m.layers + '</div></div></div>';
    for (var i = 0; i < SB.PERKS.length; i++) {
      var p = SB.PERKS[i], st = SB.prestige.perkState(p.id);
      h += '<div class="row"><div><div class="nm">' + p.name +
        ' <span class="tag">' + st.lv + '/' + st.max + '</span>' +
        ' <span class="tag">' + (p.kind === 'start' ? '起始' : p.kind === 'thin' ? '门槛' : '效率') + '</span></div>' +
        '<div class="ds">' + p.desc + (st.locked ? '（需先解锁上一层）' : '') + '</div></div>' +
        '<button class="btn buy" data-perk="' + p.id + '"' +
        (st.done || st.locked || !st.afford ? ' disabled' : '') + '>' + p.cost + ' 点</button></div>';
    }
    h += '<div class="note">洋流点跨周目保留。门槛减免类最贵——它砍掉一局的重复劳动。</div>';
    return h;
  }

  var PANES = { village: paneVillage, folk: paneFolk, tech: paneTech, dig: paneMiracle, meta: paneMeta };

  function renderPanes() {
    for (var k in PANES) {
      var node = el('pane-' + k);
      if (node) node.innerHTML = PANES[k]();
    }
  }

  function renderBreakBtn() {
    var s = res(); if (!s) return;
    var ready = s.shell <= 0 && !s.broken;
    el('btnBreak').disabled = !ready;
    el('breakHint').textContent = ready ? '壳已归零——凿下去。'
      : s.shell > 0 ? '壳厚还剩 ' + Math.round(s.shell) + '，持续削壳中。'
      : '冰壳停住了：需要建成「破冰祭坛」并供上地热才能凿穿。';
  }

  function clock() {
    var s = res(); if (!s) return;
    el('clock').textContent = '存续 ' + (s.t / 3600).toFixed(2) + ' 小时｜已削壳 ' + Math.max(0, s.baseShell - s.shell).toFixed(0);
  }

  function renderAll() {
    renderRes(); renderShell(); renderPanes(); renderBreakBtn(); clock();
  }
  function renderTick() {
    renderRes(); renderShell(); renderBreakBtn(); clock();
  }

  function showBreakPanel(r) {
    var m = meta();
    var box = el('modalBox');
    box.innerHTML =
      '<h3>冰壳裂开了</h3>' +
      '<div class="kv"><span>最深破层</span><b>' + r.d + ' 层（冰封壳）</b></div>' +
      '<div class="kv"><span>峰值族民 P</span><b>' + r.P + (r.gateMiss ? '（未达门槛 ' + CFG.TIDE.POP_GATE + '）' : '（门槛 ' + CFG.TIDE.POP_GATE + '）') + '</b></div>' +
      '<div class="kv"><span>建筑存量 B</span><b>' + r.B + ' 级 → ' + r.bPart.toFixed(0) + ' 分</b></div>' +
      '<div class="kv"><span>积累分 shellScore</span><b>' + r.shellScore + '</b></div>' +
      '<div class="kv" style="border:0;margin-top:8px"><span>获得洋流点</span><b style="color:var(--amber);font-size:17px">' + r.tidePoints.toFixed(2) + '</b></div>' +
      (r.gateMiss
        ? '<div class="note" style="color:var(--red)">峰值族民没过 ' + CFG.TIDE.POP_GATE + '，这一局剥出的洋流点是 0——养人口比铺建筑更划算。</div>'
        : '<div class="note">洋流点由峰值族民决定：这一局超门槛 ' + Math.max(0, r.P - CFG.TIDE.POP_GATE) + ' 人，建筑存量只折算成零头。</div>') +
      '<div class="note">下一局继承：洋流点、破层层级、已购增益、<b>科技记录</b>。清空：建筑、资源、族民。</div>' +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="btn" id="mStay">留在这一局</button>' +
      '<button class="big" id="mNext">开始下一周目</button></div>';
    el('modal').classList.remove('hidden');
    el('mStay').onclick = function () { SB.game.stay(); };
    el('mNext').onclick = function () { SB.game.nextCycle(); };
  }

  function hideModal() { el('modal').classList.add('hidden'); }

  /* 通用确认框。danger: true 时确认键走红色配色。
   * requireCheck 存在时确认键初始禁用，必须勾上才能执行——不可逆操作靠这一步兜底，
   * 不靠「再点一次」这种玩家会顺手连点的惯性。 */
  function confirmPanel(o) {
    var box = el('modalBox');
    box.innerHTML =
      '<h3>' + (o.title || '确认') + '</h3>' + (o.body || '') +
      (o.requireCheck
        ? '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:10px 0;color:var(--dim);line-height:1.6">' +
          '<input type="checkbox" id="mChk" style="margin-top:2px">' + o.requireCheck + '</label>'
        : '') +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="btn" id="mCancel">取消</button>' +
      '<button class="btn' + (o.danger ? ' danger' : '') + '" id="mOk">' + (o.ok || '确定') + '</button></div>';
    el('modal').classList.remove('hidden');
    var okBtn = el('mOk'), chk = el('mChk');
    el('mCancel').onclick = hideModal;
    if (chk) {
      okBtn.disabled = true;
      chk.onchange = function () { okBtn.disabled = !chk.checked; };
    }
    okBtn.onclick = function () { hideModal(); if (o.onOk) o.onOk(); };
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.tab'), i;
    for (i = 0; i < tabs.length; i++) {
      tabs[i].onclick = (function (node) {
        return function () {
          var all = document.querySelectorAll('.tab');
          for (var k = 0; k < all.length; k++) all[k].classList.remove('on');
          node.classList.add('on');
          SB.game.setTab(node.dataset.tab);
        };
      })(tabs[i]);
    }
  }
  function initSpeeds() {
    var btns = document.querySelectorAll('.spd'), i;
    for (i = 0; i < btns.length; i++) {
      btns[i].onclick = (function (node) {
        return function () {
          var all = document.querySelectorAll('.spd');
          for (var k = 0; k < all.length; k++) all[k].classList.remove('on');
          node.classList.add('on');
          SB.game.setSpeed(+node.dataset.spd);
        };
      })(btns[i]);
    }
  }

  SB.ui = SB.ui || {};
  SB.ui.render = {
    renderAll: renderAll, renderTick: renderTick, renderPanes: renderPanes,
    showBreakPanel: showBreakPanel, hideModal: hideModal, confirmPanel: confirmPanel,
    initTabs: initTabs, initSpeeds: initSpeeds,
    PANE_KEYS: PANE_KEYS
  };
})(typeof window !== 'undefined' ? window : globalThis);
