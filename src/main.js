/* 天壳 / SHELLBREAK — 启动入口
 * 加载顺序由 index.html 严格控制；本文件只做最后两步装配。
 */
(function (root) {
  'use strict';
  var SB = root.SB;
  function boot() {
    if (SB.ad && SB.ad.init) SB.ad.init();
    SB.ui.input.boot();
    SB.game.boot();
    if (SB.ui.background && SB.ui.background.boot) SB.ui.background.boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
