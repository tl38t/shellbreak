/* 天壳 / SHELLBREAK — UI 日夜配色
 * 主题属于浏览器端 UI 偏好，不写入周目存档；游戏进度与数值完全不受影响。 */
(function (root) {
  'use strict';

  var KEY = 'shellbreak.uiTheme';
  var BUBBLES_KEY = 'shellbreak.deepBubbles';
  var choices = ['day', 'night'];

  var RES_KEY = 'shellbreak.uiResolution';
  var RES_OPTIONS = ['auto', '720p', '1080p', '1440p', '2K'];
  var DESIGN_WIDTH = { '720p': 1280, '1080p': 1920, '1440p': 2560, '2K': 2048 };

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
      checkbox.title = reduced ? '系统已开启减少动态效果，气泡动画保持关闭' : '';
    }
    var hint = root.document.querySelector
      ? root.document.querySelector('[data-bubbles-hint]') : null;
    if (hint) hint.textContent = reduced
      ? '系统减少动态效果时自动关闭'
      : '仅在暗流纪偶尔上浮';
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
    try {
      var v = root.localStorage.getItem(RES_KEY);
      if (RES_OPTIONS.indexOf(v) >= 0) return v;
    } catch (e) {}
    return 'auto';
  }

  /* 游戏整体分辨率：桌面（fine pointer）且横屏时，把 .wrap 锁定到所选档位的设计宽度，
   * 再用 CSS zoom 等比缩放进视口宽度（contain-by-width）；竖屏/触摸/auto 下恢复自然响应式布局
   * （max-width:1080px 居中）。zoom 不创建包含块、不困住 position:fixed 的弹窗/常驻卡，且保留页面滚动。 */
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
    var useFixed = res !== 'auto' && !isTouch && isLandscape;
    if (!useFixed) {
      wrap.style.width = '';
      wrap.style.maxWidth = '';
      wrap.style.zoom = '';
      root.document.documentElement.dataset.uiResolution = 'auto';
    } else {
      var w = DESIGN_WIDTH[res] || 1920;
      var scale = root.innerWidth / w;
      if (!(scale <= 2.5)) scale = 2.5;
      wrap.style.width = w + 'px';
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

    // ---- 游戏分辨率（桌面/横屏固定渲染宽度，contain 缩放进视口；移动端/竖屏始终自适应） ----
    var res0 = currentResolution();
    applyResolution(res0, false);
    var resSelect = root.document.querySelector('[data-ui-resolution]');
    if (resSelect) resSelect.value = res0;
    root.document.addEventListener('change', function (event) {
      var t = event.target && event.target.closest ? event.target.closest('[data-ui-resolution]') : null;
      if (t) applyResolution(t.value, true);
    });
    function recomputeResolution() { applyResolution(currentResolution(), false); }
    root.addEventListener('resize', recomputeResolution);
    var orientQuery = root.matchMedia ? root.matchMedia('(orientation: landscape)') : null;
    if (orientQuery && orientQuery.addEventListener) orientQuery.addEventListener('change', recomputeResolution);
    else if (orientQuery && orientQuery.addListener) orientQuery.addListener(recomputeResolution);
  }

  if (root.document) boot();
})(typeof window !== 'undefined' ? window : globalThis);
