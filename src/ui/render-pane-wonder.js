/* 天壳 / SHELLBREAK — 奇观页 pane。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  var HIDE_DONE_KEY = 'sb.wonderHideDone.v1';
  var hideDone = false;
  try {
    hideDone = !!(root.localStorage && root.localStorage.getItem(HIDE_DONE_KEY) === '1');
  } catch (e) { hideDone = false; }

  function toggleHideDone() {
    hideDone = !hideDone;
    try { if (root.localStorage) root.localStorage.setItem(HIDE_DONE_KEY, hideDone ? '1' : '0'); } catch (e) {}
    return hideDone;
  }

  function hideDoneButton(completed) {
    if (!completed) return '';
    return '<button class="tgl" data-wonder-hidedone="1" aria-pressed="' + (hideDone ? 'true' : 'false') +
      '" title="点击切换是否显示已建成的奇观">' +
      (hideDone ? '显示已完成（' + completed + '）' : '隐藏已完成（' + completed + '）') + '</button>';
  }

  function paneWonder() {
    var s = SB.game.run();
    if (!s) return '';
    var L = SB.wonder ? SB.wonder.list() : [], cards = '', i, completed = 0, visible = 0;
    /* ⚠️ 2026-10-05 用户拍板：**未解锁的奇观不显示**（改前 14 座全列出来）。
     *   判据复用 `wonderBlocked` 的门控返回**前缀**（`/^需要先/`）——那是同文件里
     *   按钮文案区分「未解锁 / 建不起」时**已经在用**的判据（见下），不新立一套。
     *   为什么不新写 `wonderUnlocked()`：门只有一处定义（workshop.wonderBlocked），
     *   在 render 再写一份就是「同一道门写两遍」，改一处忘另一处就会门户不一致
     *   ——本仓记过多次（页签双闸就是这个形态）。
     * ⚠️【已建成的永远显示】`done` 排在过滤**之前**判：否则玩家拆了/读档后
     *   奇观从列表里消失，看不到自己建过什么。
     * ⚠️【无门奇观必须仍显示】`wonder_great_library`（大图书馆）在「通识」删除后
     *   **既无 need 也无 needCivic** ⇒ `wonderBlocked` 对它只可能返回成本不足或 null，
     *   永远不以「需要先…」开头 ⇒ 自动落在「显示」这一侧，正合需要。
     *   若这里写成「有门才显示」，大图书馆会永久消失（它那 1000 精铁本来就
     *   超基础容量，门早被 2026-09-28 删干净了）。 */
    var shown = 0;
    for (i = 0; i < L.length; i++) {
      var w = L[i];
      var done = !!(s.wonders && s.wonders[w.id]);
      var wonderName = SB.wonder.displayName(s, w.id);
      var wonderDesc = SB.wonder.displayDesc(s, w.id);
      var why = done ? null : SB.workshop.wonderBlocked(s, w.id);
      if (!done && why && /^需要先/.test(why)) continue;   // 未解锁 ⇒ 整行不显示
      shown++;
      if (done) completed++;
      if (hideDone && done) continue;
      visible++;
      var art = SB.ui.renderContent && SB.ui.renderContent.WONDER_ART && SB.ui.renderContent.WONDER_ART[w.id];
      var icon = art ? '<img class="wonder-icon" src="' + art + '" alt="" aria-hidden="true" width="36" height="36" loading="lazy" decoding="async">' :
        '<span class="wonder-icon wonder-icon-fallback" aria-hidden="true">✦</span>';
      cards += '<div class="row' + (done ? ' is-owned' : '') + '"' + (done ? ' data-owned="1"' : '') + '>' +
        '<div class="nm">' + icon + '<div class="wonder-name-copy"><div class="wonder-name-line"><button type="button" class="building-name" data-wonder-info="' + w.id + '" aria-haspopup="dialog" title="查看奇观效果与建造条件">' + wonderName + '</button>' + (done ? ' <span class="tag ok">已建成</span>' : '') + '</div>' +
        (done ? SB.ui.renderCommon.happyBonusNote(s, 'wonder', w.id) : '') + '</div></div>' +
        '<div class="ds">' + wonderDesc + '<span class="wonder-cost">建造材料：' + SB.economy.costTxt(SB.wonder ? SB.wonder.discountedCost(s, w.id) : w.cost) + '</span></div>' +
        (!done ? '<span class="wonder-state ' + (why ? 'waiting' : 'ready') + '">' + (why ? '材料不足' : '可建造') + '</span>' : '') +
        '<button class="btn' + (done || why ? '' : ' buy') + '" data-wonder="' + w.id + '"' +
        (done || why ? ' disabled' : '') + ' title="' + (why || '') + '">' +
        (function () {
          var wcost = SB.wonder ? SB.wonder.discountedCost(s, w.id) : w.cost;
          var wtxt = SB.economy.costOwnedTxt(s, wcost);
          return done ? '已建成' : why ? (/^需要先/.test(why) ? '未解锁' : '建不起 ' + wtxt) : '建成 ' + wtxt;
        })() + '</button></div>';
    }
    /* 一座都还没解锁时给一句说明，别留一个只有表头的空面板。
     *（末座奇观解锁后必然有一座可建，所以这里只在开局那段时间出现。） */
    var h = '<div class="wonder-overview"><div><small>WONDERS · 里程碑</small><h2>奇观</h2>' +
      '<p>建成后永久留存的独特建筑；名称可点开查看完整效果与条件。</p></div>' +
      '<div class="wonder-overview-side"><div class="wonder-count"><b>' + completed + '<i> / </i>' + shown + '</b><small>已建成 / 已揭晓</small></div>' +
      hideDoneButton(completed) + '</div></div>' +
      '<div class="wonder-intro">奇观不会重复建造或消耗维护。石梁是当前主要建造材料，例如海潮方碑需要 20 根。</div>' +
      '<div class="wonder-grid">' + (visible ? cards : hideDone && completed
        ? '<div class="note">已完成的奇观当前被隐藏（' + completed + ' 座）——点上方「显示已完成」把它们放回来。</div>'
        : '<div class="note">还没有任何奇观向你揭开。</div>') + '</div>';
    return h;
  }

  parts.paneWonder = paneWonder;
  parts.toggleWonderHideDone = toggleHideDone;
})(typeof window !== 'undefined' ? window : globalThis);
