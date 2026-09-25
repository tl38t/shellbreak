/* 天壳 / SHELLBREAK — 核心协调层
 * 唯一持有 S（周目状态）与 meta（跨周目状态）的模块。
 * 其它模块一律通过 SB.game.run() / SB.game.meta() 取状态，并由本层负责渲染调度。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  var S = null;
  var meta = SB.state.loadMeta();
  var speed = 1;
  var tab = 'village';
  var dirty = true;
  var LOG_MAX = 40, logLines = [];

  function run() { return S; }
  function state() { return meta; }
  function getTab() { return tab; }
  function setTab(k) {
    tab = k; dirty = true;
    var keys = SB.ui.render.PANE_KEYS;
    for (var i = 0; i < keys.length; i++) {
      var node = document.getElementById('pane-' + keys[i]);
      if (node) node.classList.toggle('hidden', keys[i] !== k);
    }
    render();
  }
  function setSpeed(v) { speed = v; }
  // 破冰祭坛开关：开了不意味着立刻凿——地热不够会自动停摆，恢复供能自动继续
  function toggleMiracle(v) {
    if (!S) return;
    S.miracleOn = !!v;
    if (S.miracleOn && S.lvl.miracle <= 0) {
      S.miracleOn = false;
      log('还没有破冰祭坛。先建成祭坛才能启动工程。');
    } else {
      log(S.miracleOn ? '破冰祭坛启动，正在消耗地热凿壳。' : '破冰祭坛已停机。');
    }
    markDirty(); renderAll();
  }

  function log(msg) {
    logLines.push('· ' + msg);
    if (logLines.length > LOG_MAX) logLines.splice(0, logLines.length - LOG_MAX);
    var node = document.getElementById('log');
    if (node) {
      node.innerHTML = logLines.slice().reverse().map(function (x) { return '<div>' + x + '</div>'; }).join('');
    }
  }
  function clearLog() { logLines = []; var n = document.getElementById('log'); if (n) n.innerHTML = ''; }

  function startRun() {
    meta.cycle++;
    var prev = S;
    S = SB.state.freshRun(true);
    if (prev && prev.perk) S.perk = Object.assign(SB.state.emptyPerks(), prev.perk);
    SB.state.saveMeta(meta);
    clearLog();
    log('第 ' + meta.cycle + ' 周目开始。冰封壳厚度 ' + S.iceShell + '。');
    log('提示：开局只有 1 名族民、0 资源。在「巢穴」页点采集攒 15 藻食建第一座菌圃，再回「族民」页雇佣。');
    log('壳薄到 25% 会停手；凿穿最后一段要靠破冰祭坛，而祭坛吃地热。');
    dirty = true;
    renderAll();
    SB.state.saveRun(snapshot(S));   // 新周目必须立刻落盘，否则刷新会丢掉这一局
  }

  // 继续未完成的上一周目（刷新页面时）
  function resumeRun(saved) {
    S = saved;
    if (!S.perk) S.perk = SB.state.emptyPerks();
    meta.cycle = Math.max(1, meta.cycle);
    dirty = true;
    if (!S.broken) log('已恢复上次进度：' + (S.t / 3600).toFixed(2) + ' 小时，壳厚 ' + Math.round(S.shell) + '。');
    renderAll();
  }

  function nextCycle() {
    SB.ui.render.hideModal();
    SB.state.clearRun();
    startRun();
  }
  /* 软重置「重开本周目」：丢弃当前这局的建筑/资源/族民，但保留 meta——
   * 洋流点、破层级、已购增益、科技记录都还在。周目计数 +1，因为结构上这已经是新的一周目。 */
  function resetRun() {
    SB.ui.render.hideModal();
    startRun();
  }

  /* 硬重置「清空存档」：连 meta 一起抹掉，回第 1 周目的全新档。
   * 这是唯一会毁掉跨周目进度的操作，必须走弹窗 + 显式勾选确认，绝不做静默清空。 */
  function wipeSave() {
    SB.ui.render.hideModal();
    SB.state.clearRun();
    try { root.localStorage && root.localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {}
    meta = SB.state.emptyMeta();
    meta.cycle = 1;
    SB.state.saveMeta(meta);
    S = SB.state.freshRun(false);
    clearLog();
    log('存档已清空，回到第 1 周目。洋流点与破层级一并抹去。');
    dirty = true;
    renderAll();
    SB.state.saveRun(snapshot(S));
  }

  function stay() {
    if (S) S.broken = false;
    SB.ui.render.hideModal();
    dirty = true;
    renderAll();
  }

  function render() { if (dirty) { dirty = false; SB.ui.render.renderAll(); } }
  function renderAll() { dirty = false; SB.ui.render.renderAll(); }
  function markDirty() { dirty = true; }

  function emit(msg) { log(msg); markDirty(); }

  // ---- 主循环 ----
  var last = 0;
  var STEP = 0.1;                   // 逻辑步长（秒）。与渲染解耦，保证数值与帧率无关
  function loop() {
    var now = (root.performance && performance.now) ? performance.now() : Date.now();
    if (!last) last = now;
    var elapsed = Math.min(0.5, (now - last) / 1000);
    last = now;

    var times = Math.max(1, Math.round(speed));
    for (var i = 0; i < times; i++) {
      SB.economy.tick(S, STEP, emit);   // 天壳推进在 tick 内完成（基础削壳 + 祭坛削壳）
    }
    if (S && !S.broken) {
      if (dirty) renderAll(); else SB.ui.render.renderTick();
    }
    // 存档节流：localStorage 写入较贵，5 秒一次足够
    if (S && !S.broken && now - (loop._lastSave || 0) > 5000) {
      loop._lastSave = now;
      SB.state.saveRun(snapshot(S));
    }
  }
  function snapshot(s) {
    // 只存可恢复字段，避免把 _ 开头的临时量写进去
    var o = {};
    for (var k in s) if (k.charAt(0) !== '_') o[k] = s[k];
    return o;
  }

  function boot() {
    var saved = SB.state.loadRun();
    if (saved && !saved.broken && saved.shell !== undefined) { resumeRun(saved); }
    else { startRun(); }
    SB.ui.render.initTabs();
    SB.ui.render.initSpeeds();
    document.getElementById('btnBreak').onclick = function () {
      if (S.shell <= 0 && !S.broken) SB.prestige.doBreak(S, emit);
    };
    document.getElementById('btnReset').onclick = function () {
      var t = S ? (S.t / 3600).toFixed(2) + ' 小时 · 峰值族民 ' + S.peak + ' · 建筑 ' + SB.economy.lvlSum(S) + ' 级' : '';
      SB.ui.render.confirmPanel({
        title: '重开本周目？',
        body: '<div class="warnbox">当前这局的进度会全部作废：' + t + '。</div>' +
              '<div class="note">保留：洋流点、破层级、已购增益、科技记录。周目计数会 +1。</div>',
        ok: '重开',
        onOk: function () { SB.game.resetRun(); }
      });
    };
    document.getElementById('btnWipe').onclick = function () {
      SB.ui.render.confirmPanel({
        title: '清空存档？',
        body: '<div class="warnbox">这会删掉<b>全部跨周目进度</b>：洋流点、破层级、已购增益、科技记录，以及当前这局的一切。</div>' +
              '<div class="note">页面会回到第 1 周目的全新状态。此操作不可撤销。</div>',
        danger: true,
        requireCheck: '我明白这会抹掉全部洋流点与破层级，且无法撤销',
        ok: '清空存档',
        onOk: function () { SB.game.wipeSave(); }
      });
    };
    if (root.setInterval) root.setInterval(loop, 100);
  }

  SB.game = {
    run: run, meta: state, getTab: getTab, setTab: setTab, setSpeed: setSpeed,
    toggleMiracle: toggleMiracle,
    startRun: startRun, nextCycle: nextCycle, stay: stay,
    resetRun: resetRun, wipeSave: wipeSave,
    log: log, emit: emit, markDirty: markDirty,
    render: render, renderAll: renderAll, boot: boot, snapshot: snapshot,
    showBreakPanel: function (r) { SB.ui.render.showBreakPanel(r); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
