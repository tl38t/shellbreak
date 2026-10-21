/* 天壳 / SHELLBREAK — UI 日夜配色
 * 主题属于浏览器端 UI 偏好，不写入周目存档；游戏进度与数值完全不受影响。 */
(function (root) {
  'use strict';

  var KEY = 'shellbreak.uiTheme';
  var BUBBLES_KEY = 'shellbreak.deepBubbles';
  var choices = ['day', 'night'];

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

  function boot() {
    var docRoot = root.document.documentElement;
    /* e2e 的轻量假 DOM 没有 documentElement；生产浏览器始终有，缺失时安静跳过。 */
    if (!docRoot) return;
    var initial = docRoot.dataset.uiTheme || 'night';
    apply(initial, false);
    applyBubbles(savedBubblesPreference(), false);
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
  }

  if (root.document) boot();
})(typeof window !== 'undefined' ? window : globalThis);
