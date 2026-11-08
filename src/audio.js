/* 天壳 / SHELLBREAK — 背景音乐 BGM 引擎（2026-10-31 新增 / 2026-11-07 改按纪元分段）
 *
 * 设计要点：
 *   ⚠️ 所有曲目元数据与分段规则都在 config.js 的 CFG.AUDIO（tracks + pools），本模块
 *      只负责「按 s.era 选池 → 池内 shuffle → 播放 → 静音/音量 → 交叉淡入淡出」，不写死曲名。
 *   ⚠️ 2026-11-07 定案：不再按 s.broken 二分破壳前/后，改按 s.era 三段池（1-4 / 5-7 / 8-10）。
 *      ERA5 仍是壳内破壳纪、ERA6 才是壳外初生纪 ⇒ 破壳瞬间**不**单独换曲，这是有意的设计。
 *      （旧 docs/BGM_BRIEF_v0.1.md 的「两首 = 破壳前后」已作废，别拿它当判据。）
 *   ⚠️ 池内 shuffle：el.loop = false，靠 ended 事件换下一首。为什么不能 loop=true：
 *      HTMLAudioElement 循环播放时 ended **不触发**，池内永远换不了曲。后台切走时 ended
 *      可能被浏览器节流吞掉 ⇒ sync() 每 2 秒用 currentTime/duration 兜底补一次。
 *   ⚠️ 驱动：game.js 的 renderAll() 每次调一次 sync()（2 秒 PANE_REFRESH 兜底 + 任意交互即时）。
 *      2026-11-07 前这里**零调用**，导致「第一首切第二首要重开游戏」—— sync 是唯一对外驱动，
 *      静态锁见 sim/probe_audio_bgm.mjs 的 H 段，删掉它必须同步改探针。
 *   ⚠️ 自动播放策略：gestureReady 之前绝不调 play()（否则 NotAllowedError 刷控制台）。
 *      手势监听是**常驻**的，不是一次性 —— play() 被拒后任何后续点击都能重试；
 *      旧版一次性监听 remove 掉之后，破壳换曲的 play() 被拒就永远没有重试通道。
 *   ⚠️ 静音/音量来自运行态 s.audioMuted / s.audioVolume（由 game.js 的自动点击范式同源管理，
 *      并镜像到 meta 做跨周目继承）。本模块只读这两个字段、并在 setMuted/setVolume 时即时生效，
 *      落盘交给 game.js。
 *   ⚠️ 手动锁定（2026-11-07 用户拍板）优先级最高：s.audioTrack 是合法曲目 id 时，
 *      sync() 顶部短路，「跨纪元换池 / 破壳 / 轮回 / 播完轮换 / nearEnd 补刀」全部不生效，
 *      直到玩家改回「自动」或改选另一首。锁定曲用**原生 el.loop=true** 单曲循环
 *（loop=true 时 ended 不触发，且后台被节流也不会停在曲尾）；离开手动态必须把所有
 *      loop 复位成 false，否则那首曲以后在自动池里再被抽中会永远循环、shuffle 悄悄死掉。
 *      落盘与跨周目继承在 game.js（meta.audioTrack ↔ s.audioTrack），本模块只管本局与出声。
 *   ⚠️ 淡变定时器拆成两支：fadeTimer（换曲交叉淡变）/ gainTimer（同曲音量淡变）互不 clear。
 *      旧版共用一支，破壳 800ms 内拖音量条会把交叉淡变半途清掉 ⇒ 旧曲不 pause 不归零、两首同时响。
 *   ⚠️ 防御式：缺 Audio / 缺 CFG.AUDIO / 资源加载失败 / SB.game 未就绪，全部静默降级，
 *      绝不让 BGM 代码把游戏主循环拖崩（与 envWarm / renderAd 同一条「绝不反向污染」纪律）。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var A = root.Audio;

  var els = {};            // trackId -> HTMLAudioElement（懒创建，避免无谓解码）
  var activeId = null;      // 当前在播曲目 id（交叉淡入淡出完成后的落点）
  var pendingId = null;     // 手势前「将播」的曲目：设置面板读它，避免「文案已切、声音没切」的假切换
  var gestureReady = false; // 是否已经发生过用户手势（浏览器允许 play）
  var fadeTimer = null;     // 交叉淡变定时器
  var gainTimer = null;     // 同曲音量淡变定时器（与 fadeTimer 分开）
  var armed = false;        // 是否已挂过手势监听
  var noop = function () {};

  function cfg() { return (SB.CFG && SB.CFG.AUDIO) || null; }
  function S() { return (SB.game && SB.game.run) ? SB.game.run() : null; }
  function enabled() { var c = cfg(); return !!(c && c.enabled !== false && A); }
  function track(id) {
    var c = cfg();
    // ⚠️ hasOwnProperty：存档里若塞 '__proto__' / 'constructor' 之类，直接取会拿到
    //    Object.prototype，ensureEl 会把它当曲目用进而污染 activeId。白名单必须真校验。
    return (c && c.tracks && Object.prototype.hasOwnProperty.call(c.tracks, id)) ? c.tracks[id] : null;
  }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  /* 手动锁定（2026-11-07 用户拍板）：s.audioTrack 存曲目 id，优先级高于一切自动逻辑。
   * ⚠️ 必须校验白名单：这个值来自存档，玩家改档 / 旧版本残留的任意串都不能当曲目用
   *    （否则 ensureEl(null) 静默返回、activeId 被写成脏值，音乐整个哑掉）。
   * ⚠️ 空串 / 'auto' / 非法 id 一律返回 null = 自动按纪元分池；老存档缺字段天然是自动。 */
  function manualId() {
    var s = S(), c = cfg();
    if (!s || !c || !c.tracks) return null;
    var id = s.audioTrack;
    if (typeof id !== 'string' || !id || id === 'auto') return null;
    return Object.prototype.hasOwnProperty.call(c.tracks, id) ? id : null;
  }

  /* 按 s.era 取池。越界/缺字段一律夹到 1；没有命中就用最后一个池兜底。
   * ⚠️ 只读 s.era，不读 s.broken：离线补算可能一次跨好几个纪元，按最终值取值天然稳。 */
  function poolFor(s) {
    var c = cfg();
    if (!c || !c.pools || !c.pools.length) return null;
    var era = (s && typeof s.era === 'number' && isFinite(s.era)) ? Math.floor(s.era) : 1;
    if (era < 1) era = 1;
    for (var i = 0; i < c.pools.length; i++) {
      var p = c.pools[i];
      if (p.eras && p.eras.indexOf(era) >= 0) return p;
    }
    return c.pools[c.pools.length - 1];
  }

  /* 池内随机抽一首；池 >1 时排除当前曲，避免连续重复。配置里有坏 id 也要跳过。 */
  function pickFrom(pool, exclude) {
    if (!pool || !pool.tracks || !pool.tracks.length) return null;
    var list = pool.tracks, cand = [], i;
    for (i = 0; i < list.length; i++) if (track(list[i])) cand.push(list[i]);
    if (!cand.length) return null;
    if (cand.length > 1 && exclude) {
      var other = [];
      for (i = 0; i < cand.length; i++) if (cand[i] !== exclude) other.push(cand[i]);
      if (other.length) cand = other;
    }
    return cand[Math.floor(Math.random() * cand.length)];
  }

  function desiredGain() {
    var s = S(), c = cfg() || { defaultVolume: 1 };
    if (s && s.audioMuted) return 0;
    var v = (s && typeof s.audioVolume === 'number') ? s.audioVolume : c.defaultVolume;
    return (v < 0 ? 0 : v > 1 ? 1 : v);
  }

  function ensureEl(t) {
    if (!t) return null;
    var el = els[t.id];
    if (el) return el;
    try {
      el = new A();
      el.loop = false;                 // ⚠️ shuffle 靠 ended；loop=true 时 ended 不触发
      el.preload = 'auto';
      el.volume = 0;
      // 资源加载失败（404 / 格式不支持）只静默标记，不让它抛到主循环
      el.addEventListener('error', function () { el._failed = true; });
      el.addEventListener('ended', function () { onEnded(t.id); });
      el.src = t.file;
      els[t.id] = el;
    } catch (e) { el = null; }
    return el;
  }

  function clearFade() { if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; } }
  function clearGain() { if (gainTimer) { clearInterval(gainTimer); gainTimer = null; } }

  /* 除 toEl / fromEl 外全部停掉：打断上一次未完成的淡变时，
   * 别把旧曲留在中途音量（否则玩家会同时听到两首甚至三首）。 */
  function stopOthers(keepId, fromEl) {
    for (var k in els) {
      if (!Object.prototype.hasOwnProperty.call(els, k)) continue;
      if (k === keepId) continue;
      var e = els[k];
      if (fromEl && e === fromEl) continue;
      try { e.pause(); } catch (x) {}
      e.volume = 0;
    }
  }

  // 交叉淡入淡出到目标曲目；无活跃曲目时直接起播。每帧重读 desiredGain，音量滑块即时生效。
  function crossfadeTo(id, onDone) {
    var toEl = ensureEl(track(id));
    if (!toEl) { if (onDone) onDone(); return; }
    var fromEl = (activeId && els[activeId] && els[activeId] !== toEl) ? els[activeId] : null;
    clearFade();
    clearGain();
    stopOthers(id, fromEl);
    /* 手动锁定用**原生 loop** 实现「播完原地重播、不换曲」：loop=true 时 ended 不触发，
     * 浏览器自己接着放，后台标签页被节流也不会停在曲尾（比 ended + JS 重播可靠）。
     * ⚠️ 每次换曲都把全部元素先复位成 loop=false：否则锁定过的那首以后在自动池里
     *    再被抽中时会永远单曲循环，自动 shuffle 悄悄死掉。 */
    for (var lk in els) if (Object.prototype.hasOwnProperty.call(els, lk)) els[lk].loop = false;
    toEl.loop = (manualId() === id);
    if (gestureReady && desiredGain() > 0 && toEl._failed !== true) {
      try { toEl.volume = 0; var p = toEl.play(); if (p && p.catch) p.catch(noop); } catch (e) {}
    }
    var ms = (cfg() && cfg().crossfadeMs) || 600;
    var t0 = now();
    fadeTimer = setInterval(function () {
      var k = ms > 0 ? Math.min(1, (now() - t0) / ms) : 1;
      var g = desiredGain();
      if (!toEl._failed) toEl.volume = g * k;
      if (fromEl && !fromEl._failed) fromEl.volume = g * (1 - k);
      if (k >= 1) {
        clearFade();
        if (fromEl) { try { fromEl.pause(); } catch (e) {} fromEl.volume = 0; }
        if (g <= 0) { try { toEl.pause(); } catch (e) {} }
        if (onDone) onDone();
      }
    }, 50);
    activeId = id;
    pendingId = id;
  }

  // 同曲目、只改音量（静音/取消静音/拖动滑块）。交叉淡变进行中时交给它每帧重读，别抢。
  function rampGain() {
    if (fadeTimer) return;
    var el = activeId ? els[activeId] : null;
    if (!el) return;
    var g = desiredGain();
    var from = el.volume;
    if (Math.abs(from - g) < 0.01) {            // 已经到位：只处理静音后的暂停 / 取消静音后的恢复
      if (g <= 0) { try { el.pause(); } catch (e) {} }
      else if (el.paused && gestureReady) { try { var p = el.play(); if (p && p.catch) p.catch(noop); } catch (e) {} }
      return;
    }
    var ms = (cfg() && cfg().crossfadeMs) || 600;
    var t0 = now();
    if (g > 0 && el.paused && gestureReady) { try { var p2 = el.play(); if (p2 && p2.catch) p2.catch(noop); } catch (e) {} }
    clearGain();
    gainTimer = setInterval(function () {
      var k = ms > 0 ? Math.min(1, (now() - t0) / ms) : 1;
      el.volume = from + (g - from) * k;
      if (k >= 1) {
        clearGain();
        if (g <= 0) { try { el.pause(); } catch (e) {} }
      }
    }, 50);
  }

  function nearEnd(el) {
    try {
      if (el.ended) return true;
      var d = Number(el.duration), t = Number(el.currentTime);
      return isFinite(d) && d > 0 && t >= d - 0.25;
    } catch (e) { return false; }
  }

  /* 一首播完 ⇒ 同池随机换下一首。ended 在后台被节流吞掉时，sync() 会用 nearEnd 补刀。
   * 迟到事件（旧曲的 ended 在换曲之后才到）必须忽略，否则会连锁乱切。 */
  function onEnded(id) {
    if (!enabled() || !activeId || id !== activeId) return;
    /* 手动态：原生 loop 本不该触发 ended（loop=true）。若某些 WebView 仍发了，
     * 也只原地重头播同一首，绝不走自动池 shuffle —— 手动优先级不能被底层事件绕过去。 */
    if (manualId()) {
      var me = els[activeId];
      if (me) {
        try { me.currentTime = 0; var mp = me.play(); if (mp && mp.catch) mp.catch(noop); } catch (e) {}
      }
      return;
    }
    crossfadeTo(pickFrom(poolFor(S()), activeId));
  }

  /* 对外唯一驱动：game.js 的 renderAll() 每次调一次。读当前纪元与音量，
   * 决定「跨段换池 / 池内换曲 / 重试起播 / 只改音量」。 */
  function sync() {
    if (!enabled()) return;
    var m = manualId();

    /* ⚠️ 手动锁定优先级最高：只要 s.audioTrack 是合法曲目，跨段换池 / nearEnd 补刀 /
     *    ended shuffle / 破壳 / 轮回全部短路。唯一能改变曲目的是 setTrack() 或存档里值变了。 */
    if (m) {
      if (!activeId) {
        if (pendingId !== m) { pendingId = m; ensureEl(track(m)); }
        if (!gestureReady) return;           // 手势前只预建，绝不起播
        crossfadeTo(m);
        return;
      }
      if (activeId !== m) { crossfadeTo(m); return; }
      var me = els[m];
      if (me && !me._failed && me.paused && desiredGain() > 0 && gestureReady) {
        try { var pm = me.play(); if (pm && pm.catch) pm.catch(noop); } catch (e) {}
        return;
      }
      rampGain();
      return;
    }

    /* 不变量：自动态下**不允许**任何元素还开着 loop=true。
     * 离开手动（改回自动 / 读档 / 轮回重置 / 外部改存档）时，若只把 s.audioTrack 清掉
     * 而不复位 loop，那首曲会永远单曲循环、自动 shuffle 悄悄死掉。这里做兜底，
     * 并顺手立即交叉淡变回当前纪元池，兑现「改回自动 = 立即切回按纪元」。 */
    var leftManual = false;
    for (var rk in els) {
      if (!Object.prototype.hasOwnProperty.call(els, rk)) continue;
      if (els[rk].loop) { els[rk].loop = false; leftManual = true; }
    }
    if (leftManual && activeId) {
      var back = pickFrom(poolFor(S()), activeId);
      if (back && back !== activeId) { crossfadeTo(back); return; }
    }

    var pool = poolFor(S());
    if (!pool) return;

    if (!activeId) {
      // 手势前只预建、绝不起播（play() 在无手势上下文里必被拒）
      if (!pendingId || pool.tracks.indexOf(pendingId) < 0) {
        pendingId = pickFrom(pool);
        ensureEl(track(pendingId));
      }
      if (!gestureReady) return;
      crossfadeTo(pendingId);
      return;
    }

    if (pool.tracks.indexOf(activeId) < 0) {   // 跨段：立即交叉淡变到新池
      crossfadeTo(pickFrom(pool));
      return;
    }
    var el = els[activeId];
    if (el && !el._failed && nearEnd(el)) { onEnded(activeId); return; }
    if (el && el.paused && desiredGain() > 0 && gestureReady) {
      // 自动播放策略曾拒播 / 切后台被暂停：手势上下文里重试（常驻 fire 保证有机会）
      try { var p = el.play(); if (p && p.catch) p.catch(noop); } catch (e) {}
      return;
    }
    rampGain();
  }

  function currentTrack() { return track(activeId || pendingId); }
  function currentPool() { return poolFor(S()); }

  // 设置面板滑块/复选框即时生效（落盘由 game.js 负责）
  function setMuted(b) {
    var s = S();
    if (s) s.audioMuted = !!b;
    if (activeId === null) { sync(); return; }
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

  // 首次手势后才真正出声；监听常驻，后续任何手势都能重试被拒的 play()。
  function armOnGesture() {
    if (armed || !enabled()) return;
    armed = true;
    var fire = function () {
      gestureReady = true;
      sync();   // 这时 play() 在用户手势上下文里，浏览器允许
    };
    try {
      root.addEventListener('pointerdown', fire, true);
      root.addEventListener('keydown', fire, true);
      root.addEventListener('touchstart', fire, true);
    } catch (e) { armed = false; }
  }

  /* 手动选曲：写运行态 + 立即生效。返回归一化后的 id（'' = 自动）。
   * ⚠️ 落盘（meta.audioTrack）由 game.js 的 setAudioPref 负责，这里只管本局与出声，
   *    与 setMuted / setVolume 同一条分层纪律。 */
  function setTrack(id) {
    var s = S();
    var next = (id && track(id)) ? id : '';
    if (s) s.audioTrack = next;
    if (enabled()) sync();
    return next;
  }
  /* 面板读它判断「手动锁定」语义：返回当前锁定的曲目 id，自动态返回 null。 */
  function manualTrack() { return manualId(); }

  function init() {
    if (!enabled()) return;
    /* 只预建元素、抽定开局曲，绝不调 play()。真正起播交给 armOnGesture 那次手势。
     * ⚠️ 读档后开局就带手动偏好时，预建的必须是锁定曲，否则首帧面板会显示错曲名。 */
    if (!pendingId) {
      pendingId = manualId() || pickFrom(poolFor(S()));
      ensureEl(track(pendingId));
    }
    armOnGesture();
  }

  SB.audio = {
    init: init,
    sync: sync,
    setMuted: setMuted,
    setVolume: setVolume,
    setTrack: setTrack,
    manualTrack: manualTrack,
    currentTrack: currentTrack,
    currentPool: currentPool,
    isMuted: function () { var s = S(); return !!(s && s.audioMuted); },
    volume: function () { var s = S(); return (s && typeof s.audioVolume === 'number') ? s.audioVolume : (cfg() ? cfg().defaultVolume : 1); },
    enabled: enabled
  };
})(typeof window !== 'undefined' ? window : this);
