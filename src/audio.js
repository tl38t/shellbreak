/* 天壳 / SHELLBREAK — 背景音乐 BGM 引擎（2026-10-31 新增）
 *
 * 设计要点：
 *   ⚠️ 游戏此前完全没有音频系统，本文件是从零加的。所有曲目元数据在 config.js 的 CFG.AUDIO，
 *      本模块只负责「按阶段选曲 + 播放 + 静音/音量 + 破壳交叉淡入淡出」，不写死任何曲名/作者。
 *   ⚠️ 选曲阶段：s.broken === false → 破壳前《冰壳之下》；s.broken === true → 破壳后《向着天穹》。
 *      （破壳的权威状态就是 s.broken，两处会把它置 true：prestige.doBreak 与 shell.onShellZero。）
 *   ⚠️ 静音/音量来自运行态 s.audioMuted / s.audioVolume（由 game.js 的自动点击范式同源管理，
 *      并镜像到 meta 做跨周目继承）。本模块只读这两个字段、并在 setMuted/setVolume 时即时生效，
 *      落盘交给 game.js。
 *   ⚠️ 自动播放策略兜底：浏览器/WebView 禁止无手势播放。init() 挂一次性手势监听（pointerdown/
 *      keydown/touchstart），首次手势后才真正 play()；play() 被拒就 catch 掉，下次手势再试。
 *   ⚠️ 防御式：缺 Audio / 缺 CFG.AUDIO / 资源加载失败 / SB.game 未就绪，全部静默降级，
 *      绝不让 BGM 代码把游戏主循环拖崩（与 envWarm / renderAd 同一条「绝不反向污染」纪律）。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  var A = root.Audio;
  var els = {};          // trackId -> HTMLAudioElement（懒创建，避免无谓解码）
  var activeId = null;   // 当前在播曲目 id（交叉淡入淡出完成后的落点）
  var fadeTimer = null;  // 单一淡变定时器：交叉淡入淡出 / 音量淡变共用，新一次总清掉旧的
  var armed = false;     // 是否已挂过手势监听
  var noop = function () {};

  function cfg() { return (SB.CFG && SB.CFG.AUDIO) || null; }
  function S() { return (SB.game && SB.game.run) ? SB.game.run() : null; }
  function enabled() { var c = cfg(); return !!(c && c.enabled !== false && A); }

  function trackFor(broken) {
    var c = cfg(); if (!c) return null;
    return broken ? c.tracks.firmament : c.tracks.underIce;
  }

  function desiredGain() {
    var s = S(), c = cfg() || { defaultVolume: 1 };
    if (s && s.audioMuted) return 0;
    var v = (s && typeof s.audioVolume === 'number') ? s.audioVolume : c.defaultVolume;
    return (v < 0 ? 0 : v > 1 ? 1 : v);
  }

  function ensureEl(track) {
    if (!track) return null;
    var el = els[track.id];
    if (el) return el;
    try {
      el = new A();
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      // 资源加载失败（404 / 格式不支持）只静默标记，不让它抛到主循环
      el.addEventListener('error', function () { el._failed = true; });
      el.src = track.file;
      els[track.id] = el;
    } catch (e) { el = null; }
    return el;
  }

  function clearFade() { if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; } }

  // 交叉淡入淡出到目标曲目；无活跃曲目时直接起播
  function crossfadeTo(track, onDone) {
    var toEl = ensureEl(track);
    if (!toEl) { activeId = null; if (onDone) onDone(); return; }
    var fromEl = (activeId && els[activeId] && els[activeId] !== toEl) ? els[activeId] : null;
    var g = desiredGain();
    try { toEl.volume = 0; var p = toEl.play(); if (p && p.catch) p.catch(noop); } catch (e) {}
    var ms = (cfg() && cfg().crossfadeMs) || 600;
    var t0 = (root.performance && performance.now) ? performance.now() : Date.now();
    clearFade();
    fadeTimer = setInterval(function () {
      var now = (root.performance && performance.now) ? performance.now() : Date.now();
      var k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      if (toEl && !toEl._failed) toEl.volume = g * k;
      if (fromEl && !fromEl._failed) fromEl.volume = g * (1 - k);
      if (k >= 1) {
        clearFade();
        if (fromEl) { try { fromEl.pause(); } catch (e) {} fromEl.volume = 0; }
        if (onDone) onDone();
      }
    }, 50);
    activeId = track.id;
  }

  // 同曲目、只改音量（静音/取消静音/拖动滑块）的淡变
  function rampGain() {
    var el = activeId ? els[activeId] : null;
    if (!el) return;
    var g = desiredGain();
    var from = el.volume;
    if (Math.abs(from - g) < 0.01) {            // 已经到位：只处理静音后的暂停 / 取消静音后的恢复
      if (g <= 0) { try { el.pause(); } catch (e) {} }
      else if (el.paused) { try { var p = el.play(); if (p && p.catch) p.catch(noop); } catch (e) {} }
      return;
    }
    var ms = (cfg() && cfg().crossfadeMs) || 600;
    var t0 = (root.performance && performance.now) ? performance.now() : Date.now();
    if (g > 0 && el.paused) { try { var p2 = el.play(); if (p2 && p2.catch) p2.catch(noop); } catch (e) {} }
    clearFade();
    fadeTimer = setInterval(function () {
      var now = (root.performance && performance.now) ? performance.now() : Date.now();
      var k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      el.volume = from + (g - from) * k;
      if (k >= 1) {
        clearFade();
        if (g <= 0) { try { el.pause(); } catch (e) {} }
      }
    }, 50);
  }

  /* 对外唯一驱动：renderAll 每次都会调一次。读当前阶段与音量，决定「换曲 or 只改音量」。
   * ⚠️ 不整块重建 Audio 元素（与设置面板「不整块重写 DOM」同一条纪律）：元素懒创建后复用，
   *   只动 src / volume / play / pause。 */
  function sync() {
    if (!enabled()) return;
    var s = S();
    var want = trackFor(s ? !!s.broken : false);
    if (!want) return;
    if (activeId !== want.id) {
      crossfadeTo(want);                  // 阶段变了（破壳）→ 交叉淡入淡出
    } else {
      rampGain();                         // 同曲，只把音量/静音淡变到目标
    }
  }

  function currentTrack() {
    var s = S();
    return trackFor(s ? !!s.broken : false);
  }

  // 设置面板滑块/复选框即时生效（落盘由 game.js 负责）
  function setMuted(b) {
    var s = S();
    if (s) s.audioMuted = !!b;
    if (activeId === null) { sync(); return; }   // 还没起播：下次 sync 自然 0 音量
    rampGain();
  }
  function setVolume(v) {
    v = (typeof v === 'number') ? v : parseFloat(v);
    if (isNaN(v)) return;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    var s = S();
    if (s) s.audioVolume = v;
    if (activeId === null) { sync(); return; }
    rampGain();
  }

  // 首次手势后才真正出声；play() 被拒就 catch，下次手势再调 sync()
  function armOnGesture() {
    if (armed || !enabled()) return;
    armed = true;
    var fire = function () {
      try {
        root.removeEventListener('pointerdown', fire, true);
        root.removeEventListener('keydown', fire, true);
        root.removeEventListener('touchstart', fire, true);
      } catch (e) {}
      sync();   // 这时 play() 在用户手势上下文里，浏览器允许
    };
    try {
      root.addEventListener('pointerdown', fire, true);
      root.addEventListener('keydown', fire, true);
      root.addEventListener('touchstart', fire, true);
    } catch (e) { armed = false; }
  }

  function init() {
    if (!enabled()) return;
    /* ⚠️ 这里**只预建元素**（拿 src / preload），绝不调 sync()。
     *   原因：sync() 在 activeId 为空时会走 crossfadeTo，而 crossfadeTo 第一件事就是 play()
     *   ⇒ 在无手势上下文里必然被浏览器拒绝（NotAllowedError，被 catch 掉但控制台留一条），
     *   而且会把 volume 淡到目标值后停在 paused 态。真正起播交给 armOnGesture 那次手势。 */
    var s = S();
    ensureEl(trackFor(s ? !!s.broken : false));
    armOnGesture();
  }

  SB.audio = {
    init: init,
    sync: sync,
    setMuted: setMuted,
    setVolume: setVolume,
    currentTrack: currentTrack,
    isMuted: function () { var s = S(); return !!(s && s.audioMuted); },
    volume: function () { var s = S(); return (s && typeof s.audioVolume === 'number') ? s.audioVolume : (cfg() ? cfg().defaultVolume : 1); },
    enabled: enabled
  };
})(typeof window !== 'undefined' ? window : this);
