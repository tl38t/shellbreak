/* 天壳 / SHELLBREAK — 奇观页 pane。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  function englishLocale() {
    return !!(SB.i18n && SB.i18n.getLocale && SB.i18n.getLocale() === 'en-US');
  }
  function tr(key, params, fallback) {
    if (!englishLocale()) return fallback || '';
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }
  function infoParts() { return SB.ui && SB.ui.renderParts && SB.ui.renderParts.info || {}; }
  function wonderName(s, id, fallback) {
    var info = infoParts();
    return info.localizedWonderName ? info.localizedWonderName(s, id, fallback) : fallback;
  }
  function wonderDescription(s, id, fallback) {
    var info = infoParts();
    return info.localizedWonderDescription ? info.localizedWonderDescription(s, id, fallback) : fallback;
  }
  function wonderRequirement(s, id, item, why) {
    var info = infoParts();
    return info.localizedWonderRequirement ? info.localizedWonderRequirement(s, id, item, why) : why;
  }
  function hasRequirementBlock(s, item) {
    var info = infoParts();
    return info.wonderHasRequirementBlock ? info.wonderHasRequirementBlock(s, item) : false;
  }
  function wonderBuildCost(s, id) {
    var info = infoParts();
    return info.localizedWonderBuildCost ? info.localizedWonderBuildCost(s, id) : SB.wonder.buildCostText(s, id);
  }
  /* 「隐藏已建成」的持久化口径与工坊完全一致（2026-11-05）：设备级、独立键、
   * 三通道镜像、默认不隐藏、清档不清。⚠️ 不缓存布尔 —— 读的是 SB.store 权威态，
   * 启动异步回填晚到时下一次 PANE_REFRESH 自然跟上，也不会顶掉玩家刚按下的值。 */
  var HIDE_DONE_KEY = 'wonderHideDone';
  function hideDone() {
    var S = SB.store;
    return !!(S && S.prefGet && S.prefGet(HIDE_DONE_KEY, false));
  }
  function toggleHideDone() {
    var v = !hideDone(), S = SB.store;
    if (S && S.prefSet) S.prefSet(HIDE_DONE_KEY, v);
    return v;
  }

  function hideDoneButton(completed) {
    if (!completed) return '';
    var hidden = hideDone();
    return '<button class="tgl" data-wonder-hidedone="1" aria-pressed="' + (hidden ? 'true' : 'false') +
      '" title="' + tr('wonder.filter.hide_done.title', null, '点击切换是否显示已建成的奇观') + '">' +
      (hidden ? tr('wonder.filter.show_done.button', { completedCount: completed }, '显示已完成（' + completed + '）')
        : tr('wonder.filter.hide_done.button', { completedCount: completed }, '隐藏已完成（' + completed + '）')) + '</button>';
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
      var wonderName = wonderNameForPane(s, w.id);
      var wonderDesc = wonderDescription(s, w.id, SB.wonder.displayDesc(s, w.id));
      var why = done ? null : SB.workshop.wonderBlocked(s, w.id);
      if (!done && why && /^需要先/.test(why)) continue;   // 未解锁 ⇒ 整行不显示
      /* 挑战专属奇观（2026-11-02）：不在本局就整行不显示。
       * ⚠️ 不能靠上面那条 `/^需要先/` 顺带过去 —— challengeOnly 的拒绝文案是
       *   「仅限…期间建造」，不以「需要先」开头 ⇒ 会被当成「已解锁但材料不够」显示出来，
       *   玩家看到一座永远建不了的奇观。判据走 civics 的同一道白名单门。 */
      if (!done && w.challengeOnly && SB.civic && SB.civic.challengeAllows && !SB.civic.challengeAllows(s, w)) continue;
      shown++;
      if (done) completed++;
      if (hideDone() && done) continue;
      visible++;
      var whyText = why ? wonderRequirement(s, w.id, w, why) : '';
      var locked = why ? hasRequirementBlock(s, w) : false;
      var art = SB.ui.renderContent && SB.ui.renderContent.WONDER_ART && SB.ui.renderContent.WONDER_ART[w.id];
      var icon = art ? '<img class="wonder-icon" src="' + art + '" alt="" aria-hidden="true" width="36" height="36" loading="lazy" decoding="async">' :
        '<span class="wonder-icon wonder-icon-fallback" aria-hidden="true">✦</span>';
      cards += '<div class="row' + (done ? ' is-owned' : '') + '"' + (done ? ' data-owned="1"' : '') + '>' +
        '<div class="nm">' + icon + '<div class="wonder-name-copy"><div class="wonder-name-line"><button type="button" class="building-name" data-wonder-info="' + w.id + '" aria-haspopup="dialog" title="' + tr('wonder.info.view.title', null, '查看奇观效果与建造条件') + '">' + wonderName + '</button>' + (done ? ' <span class="tag ok">' + tr('wonder.status.built', null, '已建成') + '</span>' : '') +
          (SB.ui.renderCommon.challengeTag ? SB.ui.renderCommon.challengeTag(s, w) : '') + '</div>' +
        (done ? SB.ui.renderCommon.happyBonusNote(s, 'wonder', w.id) : '') + '</div></div>' +
        '<div class="ds">' + wonderDesc + '<span class="wonder-cost">' + tr('wonder.cost.materials.label', null, '建造材料：') +
          (englishLocale() ? ' ' : '') + SB.economy.costTxt(SB.wonder ? SB.wonder.discountedCost(s, w.id) : w.cost) +
          /* 建筑等级成分（2026-11-02 · costBuild）：与材料分开写，因为它不是库存、
           * 也吃不到任何折扣（且 costTxt 只认资源名）。 */
          (function () {
            var bt = (SB.wonder && SB.wonder.buildCostText) ? wonderBuildCost(s, w.id) : '';
            return bt ? '<span class="wonder-cost">' + tr('wonder.cost.buildings_consumed.label', null, '消耗建筑：') +
              (englishLocale() ? ' ' : '') + bt + '</span>' : '';
          })() + '</div>' +
        (!done ? '<span class="wonder-state ' + (why ? 'waiting' : 'ready') + '">' +
          (why ? tr(locked ? 'wonder.status.locked' : 'wonder.status.materials_missing', null, locked ? '未解锁' : '材料不足')
            : tr('wonder.status.ready_to_build', null, '可建造')) + '</span>' : '') +
        '<span class="wonder-actions">' +
        '<button class="btn' + (done || why ? '' : ' buy') + '" data-wonder="' + w.id + '"' +
        (done || why ? ' disabled' : '') + ' title="' + (whyText || '') + '">' +
        (function () {
          var wcost = SB.wonder ? SB.wonder.discountedCost(s, w.id) : w.cost;
          var wtxt = SB.economy.costOwnedTxt(s, wcost);
          /* 建筑等级也算在「建不起」里（2026-11-02）：否则玩家会看到
           * 「建成（材料全齐）」而按钮是灰的 —— why 里写着缺建筑等级。 */
          var btxt = (SB.wonder && SB.wonder.buildCostLack && SB.wonder.buildCostLack(s, w.id).length)
            ? (englishLocale() ? ' + ' : '＋') + wonderBuildCost(s, w.id) : '';
          if (done) return tr('wonder.status.built', null, '已建成');
          if (why && locked) return tr('wonder.status.locked', null, '未解锁');
          if (why) return tr('wonder.button.cost_unavailable', { costSummary: wtxt + btxt }, '建不起 ' + wtxt + btxt);
          return tr('wonder.button.build', { costSummary: wtxt + btxt }, '建成 ' + wtxt + btxt);
        })() + '</button>' +
        /* 建造追踪（2026-10-29）：只在「材料不足」时给。未解锁的不给（连材料清单都还看不到），
         * 已建成的也不给。与巢穴建筑行同一个 s.track 与同一个 data-track 委托。
         * ⚠️ 外面必须包一层 .wonder-actions：本行是 grid-template-areas 布局，
         *    直接多插一个节点会掉到隐式行里、把卡片撑成一列。 */
        ((why && !done) ? (function () {
          var on = s.track === 'wonder:' + w.id;
          return '<button type="button" class="btn track-toggle' + (on ? ' on' : '') +
            '" data-track="wonder:' + w.id + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
            ' title="' + (on ? tr('wonder.track.tracked.title', null, '已追踪：材料够了会在屏幕角落提示')
              : tr('wonder.track.action.title', null, '追踪这座奇观：材料够了在屏幕角落提示你')) + '">' +
            (on ? tr('wonder.track.tracked.button', null, '已追踪') : tr('wonder.track.action.button', null, '追踪')) + '</button>';
        })() : '') +
        '</span></div>';
    }
    /* 一座都还没解锁时给一句说明，别留一个只有表头的空面板。
     *（末座奇观解锁后必然有一座可建，所以这里只在开局那段时间出现。） */
    var h = '<div class="wonder-overview"><div><small>' + tr('wonder.page.heading.kicker', null, 'WONDERS · 里程碑') + '</small><h2>' +
      tr('wonder.page.heading.title', null, '奇观') + '</h2><p>' +
      tr('wonder.page.intro', null, '建成后永久留存的独特建筑；名称可点开查看完整效果与条件。') + '</p></div>' +
      '<div class="wonder-overview-side"><div class="wonder-count"><b>' + completed + '<i> / </i>' + shown + '</b><small>' +
      tr('wonder.page.progress.label', null, '已建成 / 已揭晓') + '</small></div>' +
      hideDoneButton(completed) + '</div></div>' +
      '<div class="wonder-intro">' + tr('wonder.page.construction_note', null, '奇观不会重复建造或消耗维护。石梁是当前主要建造材料，例如海潮方碑需要 20 根。') + '</div>' +
      '<div class="wonder-grid">' + (visible ? cards : hideDone() && completed
        ? '<div class="note">' + tr('wonder.page.empty.hidden_completed', { completedCount: completed }, '已完成的奇观当前被隐藏（' + completed + ' 座）——点上方「显示已完成」把它们放回来。') + '</div>'
        : '<div class="note">' + tr('wonder.page.empty.revealed', null, '还没有任何奇观向你揭开。') + '</div>') + '</div>';
    return h;
  }

  function wonderNameForPane(s, id) {
    var fallback = SB.wonder.displayName(s, id);
    return wonderName(s, id, fallback);
  }

  parts.paneWonder = paneWonder;
  parts.toggleWonderHideDone = toggleHideDone;
})(typeof window !== 'undefined' ? window : globalThis);
