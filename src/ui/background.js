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

  for (var i = 1; i <= 8; i++) {
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
    var ds = root.document && root.document.documentElement && root.document.documentElement.dataset;
    if (ds && ds.powerSave === 'on') return true;
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function preloadOne(url) {
    if (!root.Image || !url) return;
    var im = new root.Image();
    im.src = url;
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
    var list = frames[currentEra];
    if (list && list[1]) preloadOne(list[1]);
    timer = root.setInterval(function () {
      var curList = frames[currentEra];
      if (!curList || curList.length < 2) return;
      frameIndex = (frameIndex + 1) % curList.length;
      setScene(curList[frameIndex], false);
      var upcoming = curList[(frameIndex + 1) % curList.length];
      preloadOne(upcoming);
    }, INTERVAL);
  }

  function applyEra(era) {
    era = Math.max(1, Math.min(8, +era || 1));
    /* ERA6–8 都有专属四帧序列；保留缺失资源时回退到破壳纪的保护逻辑。 */
    currentEra = frames[era] ? era : 5;
    frameIndex = 0;
    var list = frames[currentEra];
    preloadOne(list[0]);
    document.body.setAttribute('data-bg-era', String(era));
    setScene(list[0], !active);
    startTimer();
  }

  function sync() {
    if (!SB.game || !SB.game.run) return;
    var s = SB.game.run();
    var era = Math.max(1, Math.min(8, +(s && s.era) || 1));
    var sceneEra = frames[era] ? era : 5;
    if (sceneEra !== currentEra) applyEra(era);
  }

  function refresh() {
    if (reduced()) {
      stopTimer();
      var list = frames[currentEra];
      if (list && list[0] && frameIndex !== 0) {
        frameIndex = 0;
        setScene(list[0], true);
      }
      return;
    }
    startTimer();
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
  SB.ui.background = { boot: boot, sync: sync, applyEra: applyEra, refresh: refresh };
})(typeof window !== 'undefined' ? window : globalThis);
