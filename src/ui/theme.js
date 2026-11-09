/* 天壳 / SHELLBREAK — UI 日夜配色
 * 主题属于浏览器端 UI 偏好，不写入周目存档；游戏进度与数值完全不受影响。 */
(function (root) {
  'use strict';

  var KEY = 'shellbreak.uiTheme';
  var BUBBLES_KEY = 'shellbreak.deepBubbles';
  var choices = ['day', 'night'];

  var RES_KEY = 'shellbreak.uiResolution';
  /* 档位语义（2026-11-08 改）：不再是「固定设计宽度」，而是「界面放大倍率」。
     旧实现用 scale = innerWidth / DESIGN_WIDTH[res]，视口窄于设计宽时 scale 恒 < 1，
     把 7–9px 小字压到中文可读下限以下；且倍率只有上限没有下限（首帧 innerWidth=0 会 zoom:0 白屏）。
     新实现 scale 恒 ≥ 1，由倍率表直接给出，布局宽度反而是因变量。数值为待标定档位，改这里即可。 */
  var RES_OPTIONS = ['auto', 's100', 's115', 's130', 's150'];
  var UI_SCALE = { s100: 1.00, s115: 1.15, s130: 1.30, s150: 1.50 };
  /* 旧档位值已从设置面板移除，但老 localStorage 里可能还有。
     ⚠️ 不写映射会让老玩家的设置静默掉回 auto（界面从「铺满视口」变成 1080px 居中窄栏）。
     统一迁到 100%：保持「铺满视口」的既有观感，只去掉 zoom<1 压小字体的行为。 */
  var LEGACY_RES = { '720p': 's100', '1080p': 's100', '1440p': 's100', '2K': 's100' };

  function translated(key, fallback) {
    var i18n = root.SB && root.SB.i18n;
    return i18n && i18n.t ? (i18n.t(key) || fallback) : fallback;
  }

  function prefersReducedMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function savedBubblesPreference() {
    try {
      var value = root.localStorage.getItem(BUBBLES_KEY);
      if (value === '1') return true;
      if (value === '0') return false;
    } catch (e) {}
    return !prefersReducedMotion();
  }

  function applyBubbles(enabled, persist) {
    var reduced = prefersReducedMotion();
    enabled = !!enabled && !reduced;
    root.document.documentElement.dataset.deepBubbles = enabled ? 'on' : 'off';
    var checkbox = root.document.querySelector
      ? root.document.querySelector('[data-ui-effect="deep-bubbles"]') : null;
    if (checkbox) {
      checkbox.checked = enabled;
      checkbox.disabled = reduced;
      checkbox.title = reduced
        ? translated('ui.theme.deep_bubbles.reduced_motion_tooltip', '系统已开启减少动态效果，气泡动画保持关闭')
        : '';
    }
    var hint = root.document.querySelector
      ? root.document.querySelector('[data-bubbles-hint]') : null;
    if (hint) hint.textContent = reduced
      ? translated('ui.theme.deep_bubbles.reduced_motion_hint', '系统减少动态效果时自动关闭')
      : translated('ui.settings.bubbles.hint', '只在暗流纪偶尔上浮');
    if (persist) {
      try { root.localStorage.setItem(BUBBLES_KEY, enabled ? '1' : '0'); } catch (e) {}
    }
  }

  function apply(theme, persist) {
    theme = choices.indexOf(theme) >= 0 ? theme : 'night';
    root.document.documentElement.dataset.uiTheme = theme;
    root.document.querySelectorAll('[data-ui-theme-choice]').forEach(function (button) {
      var active = button.dataset.uiThemeChoice === theme;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (persist) {
      try { root.localStorage.setItem(KEY, theme); } catch (e) {}
    }
  }

  function currentResolution() {
    var v = null;
    try { v = root.localStorage.getItem(RES_KEY); } catch (e) {}
    if (RES_OPTIONS.indexOf(v) >= 0) return v;
    if (v && Object.prototype.hasOwnProperty.call(LEGACY_RES, v)) {
      var migrated = LEGACY_RES[v];
      /* 一次性写回，避免每次 resize / orientation 变更都要重做映射。
         只写 UI 偏好键，不触碰周目存档。 */
      try { root.localStorage.setItem(RES_KEY, migrated); } catch (e) {}
      return migrated;
    }
    return 'auto';
  }

  /* 界面缩放：桌面（fine pointer）且横屏时，按所选倍率用 CSS zoom 放大整页 UI；
   * 竖屏 / 触屏 / auto 下不施加 zoom，恢复自然响应式布局（max-width:1080px 居中）。
   * ⚠️ zoom 只是布局级缩放，不改变 canvas backing store / dpr，因此与「游戏分辨率」「省 GPU」无关。
   * zoom 不创建包含块、不困住 position:fixed 的弹窗/常驻卡，且保留页面滚动。 */
  function applyResolution(res, persist) {
    res = RES_OPTIONS.indexOf(res) >= 0 ? res : 'auto';
    var wrap = root.document.querySelector ? root.document.querySelector('.wrap') : null;
    if (!wrap) {
      if (persist) { try { root.localStorage.setItem(RES_KEY, res); } catch (e) {} }
      return;
    }
    var mq = root.matchMedia || function () { return { matches: false }; };
    var isTouch = mq('(pointer: coarse)').matches;
    var isLandscape = mq('(orientation: landscape)').matches;
    var scale = UI_SCALE[res];
    var useFixed = !!scale && !isTouch && isLandscape;
    if (!useFixed) {
      wrap.style.width = '';
      wrap.style.maxWidth = '';
      wrap.style.zoom = '';
      root.document.documentElement.dataset.uiResolution = 'auto';
    } else {
      /* ⚠️ width:100% 是 headless Chrome 五场景实测量出来的写法，三种替代都有实测反例：
         · Chromium 的 zoom 会把百分比基数按 1/zoom 处理 ⇒ 100% 布局宽 = clientWidth/scale，
           zoom 后视觉宽恰为 clientWidth（已扣垂直滚动条），横向不溢出。
         · calc(100% / scale) 多除一次：1707 宽下视觉宽只剩 1484px（右留白 222px）。
         · innerWidth / scale 含垂直滚动条：900 窄横屏实测 +15px 横向溢出。
         全程不读 innerWidth ⇒ 首帧 innerWidth=0 也不会写出 zoom:0 白屏。
         前提：三端（TapTap WebView / Electron / 桌面浏览器）均为 Chromium；换宿主内核须重验。 */
      wrap.style.width = '100%';
      wrap.style.maxWidth = 'none';
      wrap.style.zoom = String(scale);
      root.document.documentElement.dataset.uiResolution = res;
    }
    if (persist) {
      try { root.localStorage.setItem(RES_KEY, res); } catch (e) {}
    }
  }

  function boot() {
    var docRoot = root.document.documentElement;
    /* e2e 的轻量假 DOM 没有 documentElement；生产浏览器始终有，缺失时安静跳过。 */
    if (!docRoot) return;
    var initial = docRoot.dataset.uiTheme || 'night';
    apply(initial, false);
    applyBubbles(savedBubblesPreference(), false);
    root.addEventListener('shellbreak:locale-changed', function () {
      applyBubbles(savedBubblesPreference(), false);
    });

    // ---- 新手引导开关（与 uiResolution 同模式：localStorage 'shellbreak.onboarding'，默认开） ----
    var obToggle = root.document.querySelector('[data-onboarding-toggle]');
    if (obToggle) {
      var obStored = root.localStorage && root.localStorage.getItem('shellbreak.onboarding');
      obToggle.checked = (obStored !== '0');
      root.document.addEventListener('change', function (event) {
        var t = event.target && event.target.closest
          ? event.target.closest('[data-onboarding-toggle]') : null;
        if (!t) return;
        var on = t.checked;
        try { if (root.localStorage) root.localStorage.setItem('shellbreak.onboarding', on ? '1' : '0'); } catch (e) {}
        if (SB.onboarding && SB.onboarding.setEnabled) SB.onboarding.setEnabled(on);
      });
    }
    root.document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest('[data-ui-theme-choice]') : null;
      if (button) apply(button.dataset.uiThemeChoice, true);
    });
    root.document.addEventListener('change', function (event) {
      var checkbox = event.target && event.target.closest
        ? event.target.closest('[data-ui-effect="deep-bubbles"]') : null;
      if (checkbox) applyBubbles(checkbox.checked, true);
    });
    var motionQuery = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (motionQuery && motionQuery.addEventListener) {
      motionQuery.addEventListener('change', function () { applyBubbles(savedBubblesPreference(), false); });
    } else if (motionQuery && motionQuery.addListener) {
      motionQuery.addListener(function () { applyBubbles(savedBubblesPreference(), false); });
    }

    // ---- 界面缩放（桌面/横屏按倍率放大 UI；触屏 / 竖屏 / auto 始终走自然响应式） ----
    var res0 = currentResolution();
    applyResolution(res0, false);
    /* ⚠️ 必须限定 select：applyResolution 会把档位写进 documentElement.dataset.uiResolution，
       也就是给 <html> 加了 data-ui-resolution 属性。不带标签名的 querySelector 会先命中 <html>
       （文档顺序在前），导致启动时写的是 <html>.value、下拉框初值永远停在第一个 option；
       且任何控件的 change 事件都会经 closest 误命中 <html> 触发一次多余的 applyResolution。
       2026-11-08 真 DOM 验证抓到，属既有 bug。 */
    var resSelect = root.document.querySelector('select[data-ui-resolution]');
    if (resSelect) resSelect.value = res0;
    root.document.addEventListener('change', function (event) {
      var t = event.target && event.target.closest ? event.target.closest('select[data-ui-resolution]') : null;
      if (t) applyResolution(t.value, true);
    });

    // ---- 大数字显示格式（紧凑 K/M/B/T ↔ 科学计数法；localStorage 跨周目保留，默认 compact） ----
    var NF_KEY = 'shellbreak.numberFormat';
    function currentNumberFormat() {
      var stored = root.localStorage && root.localStorage.getItem(NF_KEY);
      return (stored === 'sci') ? 'sci' : 'compact';
    }
    function setNumberFormatMode(mode, persist) {
      mode = (mode === 'sci') ? 'sci' : 'compact';
      if (SB.economy && SB.economy.setNumberFormat) SB.economy.setNumberFormat(mode);
      if (persist && root.localStorage) { try { root.localStorage.setItem(NF_KEY, mode); } catch (e) {} }
    }
    var nf0 = currentNumberFormat();
    setNumberFormatMode(nf0, false);
    var nfSelect = root.document.querySelector('[data-ui-number-format]');
    if (nfSelect) nfSelect.value = nf0;
    root.document.addEventListener('change', function (event) {
      var t = event.target && event.target.closest ? event.target.closest('[data-ui-number-format]') : null;
      if (!t) return;
      setNumberFormatMode(t.value, true);
      // 立即刷新可见数字（顶栏存量/上限、成本等），不必等下一 tick
      if (SB.ui && SB.ui.render && SB.ui.render.renderPanes) SB.ui.render.renderPanes();
    });
    /* width 用百分比后 resize 由浏览器自动重算，这里重跑一次主要是为了让
       orientation 切换时重判 useFixed 门控；applyResolution 幂等，重设 inline style 无副作用。 */
    function recomputeUiScale() { applyResolution(currentResolution(), false); }
    root.addEventListener('resize', recomputeUiScale);
    var orientQuery = root.matchMedia ? root.matchMedia('(orientation: landscape)') : null;
    if (orientQuery && orientQuery.addEventListener) orientQuery.addEventListener('change', recomputeUiScale);
    else if (orientQuery && orientQuery.addListener) orientQuery.addListener(recomputeUiScale);
  }

  if (root.document) boot();
})(typeof window !== 'undefined' ? window : globalThis);
