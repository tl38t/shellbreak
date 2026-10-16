/* 星图第一阶段：天体目录与本周目发射记录的只读视图。
 * 后续土星系、太阳系只扩充 BODIES 与导航层；发射行为由 game 层写 spacecraft。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  var BODIES = [
    { id: 'europa', name: '欧罗巴', subtitle: '木卫二 · 文明起点', kind: 'europa',
      note: '冰壳下的家园。壳外轨道将记录本周目从这里发射的卫星与空间站。' },
    { id: 'saturn', name: '土星', subtitle: '外行星 · 远方目标', kind: 'saturn',
      note: '当前只展示土星本体与抵达此处的航天器；土星系将在后续版本展开。' }
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bodyHTML(body, all) {
    var craft = [];
    for (var i = 0; i < all.length; i++) {
      var x = all[i];
      if (x && x.body === body.id && (x.type === 'satellite' || x.type === 'station')) craft.push(x);
    }
    var markers = '';
    var visible = Math.min(craft.length, 10);
    for (i = 0; i < visible; i++) {
      var angle = (i / visible) * Math.PI * 2 - Math.PI / 2;
      var left = (50 + 34 * Math.cos(angle)).toFixed(2);
      var top = (50 + 22 * Math.sin(angle)).toFixed(2);
      var title = craft[i].name || (craft[i].type === 'station' ? '空间站' : '卫星');
      markers += '<span class="starmap-craft ' + craft[i].type + '" style="left:' + left + '%;top:' + top + '%"' +
        ' title="' + esc(title) + '" aria-label="' + esc(title) + '"></span>';
    }
    var records = '';
    for (i = 0; i < craft.length; i++) {
      var item = craft[i], label = item.type === 'station' ? '空间站' : '卫星';
      records += '<li><span class="starmap-type ' + item.type + '">' + label + '</span>' +
        '<span>' + esc(item.name || label) + '</span></li>';
    }
    if (!records) records = '<li class="empty">暂无已发射的卫星或空间站</li>';
    return '<section class="starmap-body" aria-label="' + body.name + '">' +
      '<div class="starmap-visual ' + body.kind + '">' +
        '<div class="starmap-orbit" aria-hidden="true"></div>' +
        '<div class="starmap-planet" aria-hidden="true"></div>' + markers +
      '</div>' +
      '<div class="starmap-info"><div class="starmap-kicker">' + esc(body.subtitle) + '</div>' +
        '<h3>' + esc(body.name) + '</h3><p>' + esc(body.note) + '</p>' +
        '<div class="starmap-count">已发射 ' + craft.length + ' · 卫星 ' +
          craft.filter(function (x) { return x.type === 'satellite'; }).length + ' · 空间站 ' +
          craft.filter(function (x) { return x.type === 'station'; }).length + '</div>' +
        '<ul class="starmap-records">' + records + '</ul></div></section>';
  }

  function paneStarMap() {
    var s = SB.game && SB.game.run ? SB.game.run() : null;
    if (!s || !(s.shellOpened || s.breakSettled) || s.shell > 0)
      return '<div class="note">凿穿天壳后，本周目的星图将在这里解锁。</div>';
    var all = Array.isArray(s.spacecraft) ? s.spacecraft : [];
    var html = '<div class="starmap-intro"><strong>壳外星图</strong><span>本周目 · 已发射航天器 ' +
      all.length + '</span></div><div class="starmap-grid">';
    for (var i = 0; i < BODIES.length; i++) html += bodyHTML(BODIES[i], all);
    html += '</div><div class="starmap-footnote">欧罗巴是木星的卫星。当前星图是探索目标视图，' +
      '不表示欧罗巴围绕土星运行。</div>';
    return html;
  }

  SB.STAR_MAP_BODIES = BODIES;
  parts.paneStarMap = paneStarMap;
})(typeof window !== 'undefined' ? window : globalThis);
