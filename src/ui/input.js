/* 天壳 / SHELLBREAK — 事件层
 * 全部交互走事件委托；数据变更一律调用动作函数，不在事件里直接改状态。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var E = null;

  function run() { return SB.game.run(); }
  function emit(msg) { SB.game.emit(msg); }

  function onClick(e) {
    var t = e.target || {};
    var d = t.dataset || {};
    var s = run();
    if (!s) return;

    if (d.build) {
      if (SB.habitat.build(s, d.build, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    if (d.tech) {
      if (SB.habitat.study(s, d.tech, emit)) { SB.game.markDirty(); SB.game.renderAll(); }
      return;
    }
    if (d.miracle) {
      /* 复选框在 click 时刻的 checked 仍是旧值——浏览器先 click 后 change。
       * 所以这里必须取反求目标态。若照原样把 s.miracleOn 传回去，等于「把它设成它现在的值」，
       * 开关永远打不开：地热只产不烧，冰壳就永远卡在 25% 那道墙上。
       * change 监听会再按真实 checked 兜一次，两边结果一致。 */
      SB.game.toggleMiracle(!(t.checked === true));
      SB.game.markDirty(); SB.game.renderAll();
      return;
    }
    if (d.perk) {
      if (SB.prestige.buyPerk(d.perk)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
    if (d.job) {
      if (SB.folk.assign(s, d.job, +d.d)) {
        SB.game.markDirty(); SB.game.renderAll();
      }
      return;
    }
  }

  function onChange(e) {
    var t = e.target || {};
    if (t.id === 'miracleToggle') {
      SB.game.toggleMiracle(t.checked);
    }
  }

  function boot() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
  }

  SB.ui = SB.ui || {};
  SB.ui.input = { boot: boot };
})(typeof window !== 'undefined' ? window : globalThis);
