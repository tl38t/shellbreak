/* 天壳 · 可见的真实游戏 AI 玩家（浏览器内运行）
 * 面板和定时器只负责驱动/展示，决策统一交给 src/ai-strategy.js。
 */
(function (root) {
  'use strict';
  var SB = root.SB;
  if (!SB || !SB.game || !SB.aiStrategy) return;
  var panel, timer, lastDecision = 0, started = false, logNode;

  function el(tag, text) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    return n;
  }
  function initPanel() {
    var style = el('style');
    style.textContent = '#ai-player-panel{position:fixed;right:16px;bottom:16px;z-index:99999;width:290px;background:#10201f;color:#e6f1df;border:1px solid #719b72;border-radius:12px;padding:12px 14px;box-shadow:0 8px 32px #0008;font:13px/1.5 system-ui,sans-serif}#ai-player-panel b{color:#b8df8a}#ai-player-panel button{border:0;border-radius:7px;padding:7px 10px;margin:7px 6px 6px 0;background:#6d9f53;color:#10201f;font-weight:700;cursor:pointer}#ai-player-panel button.stop{background:#344a43;color:#fff}#ai-player-panel .stats{margin-top:5px;color:#d1dfd1}#ai-player-panel .log{max-height:100px;overflow:auto;color:#a8c4a9;font-size:11px}';
    document.head.appendChild(style);
    panel = el('section'); panel.id = 'ai-player-panel';
    var title = el('strong', 'AI 自动游玩 · 真实游戏'); title.style.fontSize = '15px'; panel.appendChild(title);
    var buttons = el('div');
    var stop = el('button', '暂停 AI'); stop.className = 'stop'; stop.onclick = pause; buttons.appendChild(stop);
    var resume = el('button', '继续 AI'); resume.onclick = start; buttons.appendChild(resume);
    panel.appendChild(buttons);
    var stats = el('div'); stats.className = 'stats'; stats.id = 'ai-player-stats'; panel.appendChild(stats);
    logNode = el('div'); logNode.className = 'log'; logNode.id = 'ai-player-log'; panel.appendChild(logNode);
    document.body.appendChild(panel);
  }
  function say(message) {
    if (!logNode) return;
    var row = el('div', '· ' + message); logNode.insertBefore(row, logNode.firstChild);
    while (logNode.children.length > 6) logNode.removeChild(logNode.lastChild);
  }
  function step() {
    if (!started) return;
    var s = SB.game.run();
    if (!s || s.broken) { pause(); say('本局已结束。'); return; }
    try {
      var result = SB.aiStrategy.step(s);
      if (result.changed) SB.game.renderAll();
    } catch (e) { say('策略异常：' + e.message); }
  }
  function refresh() {
    if (!panel) return;
    var s = SB.game.run(); if (!s) return;
    var stats = document.getElementById('ai-player-stats');
    var scienceRate = SB.economy.rates(s).science;
    stats.textContent = (started ? '运行中 · 20×' : '已暂停') + ' | Era ' + s.era + ' | ' +
      (s.t / 3600).toFixed(2) + ' 游戏小时 | 人口 ' + s.pop + '/' + SB.economy.popCap(s) +
      ' | 科技 ' + Object.keys(s.techs).filter(function (k) { return s.techs[k]; }).length + '/' + SB.TECHS.length +
      ' | 科研 ' + (s.res.science || 0).toFixed(0) + ' (' + scienceRate.toFixed(2) + '/秒)';
  }
  function start() {
    if (!started) {
      started = true; SB.game.setSpeed(20);
      var b = document.querySelector('.spd[data-spd="20"]'); if (b) b.classList.add('on');
      say('AI 正在通过共用策略和正式游戏 API 操作这一局。');
    }
    if (!timer) timer = root.setInterval(function () {
      var now = Date.now();
      if (now - lastDecision > 400) { lastDecision = now; step(); }
      refresh();
    }, 100);
  }
  function pause() {
    started = false;
    if (timer) { root.clearInterval(timer); timer = null; }
    refresh(); say('AI 已暂停；游戏仍按当前速度运行。');
  }
  function boot() {
    initPanel(); SB.game.setSpeed(20);
    var speedBtn = document.querySelector('.spd[data-spd="20"]'); if (speedBtn) speedBtn.classList.add('on');
    started = true;
    timer = root.setInterval(function () {
      var now = Date.now();
      if (now - lastDecision > 400) { lastDecision = now; step(); }
      refresh();
    }, 100);
    say('接管当前周目，游戏速度 20×。'); refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else root.setTimeout(boot, 0);
})(typeof window !== 'undefined' ? window : globalThis);
