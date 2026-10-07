/* 天壳 / SHELLBREAK — UI 日夜配色
 * 主题属于浏览器端 UI 偏好，不写入周目存档；游戏进度与数值完全不受影响。 */
(function (root) {
  'use strict';

  var KEY = 'shellbreak.uiTheme';
  var choices = ['day', 'night'];

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
    root.document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest('[data-ui-theme-choice]') : null;
      if (button) apply(button.dataset.uiThemeChoice, true);
    });
  }

  if (root.document) boot();
})(typeof window !== 'undefined' ? window : globalThis);
