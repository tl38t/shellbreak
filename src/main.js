/* 天壳 / SHELLBREAK — 启动入口
 * 加载顺序由 index.html 严格控制；本文件只做最后两步装配。
 */
(function (root) {
  'use strict';
  var SB = root.SB;
  function boot() {
    if (SB.ad && SB.ad.init) SB.ad.init();
    if (SB.achv && SB.achv.init) SB.achv.init();
    SB.ui.input.boot();
    /* 建造追踪小框（2026-10-29）：只绑一次。小框是 index.html 里的常驻节点，
     * 所以拖动/点击/关闭**直接挂它自己**，不参与任何面板重画。
     * 必须在 SB.game.boot() 之前不行（那时还没局），之后绑也一样（首帧 paint 在 renderTick）；
     * 放在这里是让它与 input 同批装上，转屏时那条 resize 重定位也跟着生效。 */
    if (SB.ui.track && SB.ui.track.init) SB.ui.track.init();
    SB.game.boot();
    if (SB.saveTransfer && SB.saveTransfer.boot) SB.saveTransfer.boot();
    if (SB.redeem && SB.redeem.boot) SB.redeem.boot();
    if (SB.ui.background && SB.ui.background.boot) SB.ui.background.boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
