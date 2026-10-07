/* 天壳 / SHELLBREAK — 纪元氛围背景
 * 只读 SB.game.run()，不改游戏状态，不参与 pane 重绘。
 * 每个纪元四帧同场景序列，定时交叉淡入，形成更明显的环境活动。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var sceneA = null, sceneB = null;
  var currentEra = 0, frameIndex = 0, timer = 0, active = null;
  var INTERVAL = 5200;
  var frames = {};

  for (var i = 1; i <= 5; i++) {
    frames[i] = [
      'assets/backgrounds/sequence/era-' + i + '/frame-01.webp',
      'assets/backgrounds/sequence/era-' + i + '/frame-02.webp',
      'assets/backgrounds/sequence/era-' + i + '/frame-03.webp',
      'assets/backgrounds/sequence/era-' + i + '/frame-04.webp'
    ];
  }

  function reduced() {
    var q = (root.location && root.location.search) || '';
    if (/[?&]fx=off(?:&|$)/.test(q)) return true;
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function preload(list) {
    if (!root.Image) return;
    for (var i = 0; i < list.length; i++) {
      var im = new root.Image();
      im.src = list[i];
    }
  }

  function setScene(url, immediate) {
    if (!sceneA || !sceneB) return;
    var next = active === sceneA ? sceneB : sceneA;
    next.style.backgroundImage = 'url("' + url + '")';
    if (immediate || !active) {
      sceneA.classList.remove('is-visible');
      sceneB.classList.remove('is-visible');
      next.classList.add('is-visible');
    } else {
      next.classList.add('is-visible');
      active.classList.remove('is-visible');
    }
    active = next;
  }

  function stopTimer() {
    if (timer) {
      root.clearInterval(timer);
      timer = 0;
    }
  }

  function startTimer() {
    stopTimer();
    if (reduced() || document.hidden) return;
    timer = root.setInterval(function () {
      if (!frames[currentEra] || frames[currentEra].length < 2) return;
      frameIndex = (frameIndex + 1) % frames[currentEra].length;
      setScene(frames[currentEra][frameIndex], false);
    }, INTERVAL);
  }

  function applyEra(era) {
    era = Math.max(1, Math.min(5, +era || 1));
    currentEra = era;
    frameIndex = 0;
    var list = frames[era];
    preload(list);
    document.body.setAttribute('data-bg-era', String(era));
    setScene(list[0], !active);
    startTimer();
  }

  function sync() {
    if (!SB.game || !SB.game.run) return;
    var s = SB.game.run();
    var era = s && s.era ? s.era : 1;
    if (era !== currentEra) applyEra(era);
  }

  function boot() {
    sceneA = document.querySelector('#atmosphere .scene-a');
    sceneB = document.querySelector('#atmosphere .scene-b');
    if (!sceneA || !sceneB) return;
    applyEra((SB.game.run() || {}).era || 1);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) sync();
      startTimer();
    });
    root.setInterval(sync, 2000);
  }

  SB.ui = SB.ui || {};
  SB.ui.background = { boot: boot, sync: sync, applyEra: applyEra };
})(typeof window !== 'undefined' ? window : globalThis);
