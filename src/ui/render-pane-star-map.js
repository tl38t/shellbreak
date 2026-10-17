/* 星图面板：破壳后承载 GPT 制作的动画星图（src/ui/star-map-frame.html），
 * 通过 iframe 嵌入。渲染由 render.js 的 renderPanes 做「内容变化才重写」的守护，
 * 避免每 2 秒 PANE_REFRESH 整块重写 innerHTML 导致 iframe 重载、动画重启、浪费 CPU。
 * ⚠️ 当前是占位接法：frame 是独立文档、不读游戏状态（卫星/空间站/星空探索都还没接）。
 *   资源线 / 发射记录 / 星空探索进度接入见 docs/JUDGMENTS.md 太空系统扩展项。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneStarMap() {
    var s = SB.game && SB.game.run ? SB.game.run() : null;
    if (!s || !(s.shellOpened || s.breakSettled) || s.shell > 0)
      return '<div class="note">凿穿天壳后，本周目的星图将在这里解锁。</div>';
    return '<div class="starmap-frame-wrap">' +
      '<iframe class="starmap-frame" sandbox="allow-scripts" ' +
      'src="src/ui/star-map-frame.html?v=1" title="壳外星图" ' +
      'style="width:100%;height:780px;border:0;border-radius:12px;background:#07111d"></iframe></div>';
  }

  parts.paneStarMap = paneStarMap;
})(typeof window !== 'undefined' ? window : globalThis);
