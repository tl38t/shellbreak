/* 天壳 / SHELLBREAK — 「传承」三选一浮层与外交页只读收藏墙的数据源。
 * 2026-11-11：吞并敌国后从对应纪元窗的政策卡里抽 3 张，择其一收录。
 *
 * 【定案口径】
 *   · 抽到即生效、单纯收藏墙；不做分类、不做品阶、不做风味文案；阶数戳 Ⅰ–Ⅶ 只标来源阶。
 *   · 只做本局层，轮回由 freshRun 清零；不做跨周目永久层。
 *   · 卡面文案读 SB.heritage.descOf(id)（清洗表，源 POLICIES[].desc 一字不动）。
 *
 * 【为什么是独立浮层】
 *   #pane-diplomacy 每 2 秒墙钟整块 innerHTML 重写 ⇒ 弹窗内嵌会被冲掉；
 *   #modal 是全局单例（更新日志 / 叙事 / 政体选择器 / 破壳结算 / 离线汇总都在抢）；
 *   #warToastStack 是 role=status 播报层，塞可交互控件语义不对。
 *   ⇒ 独立常驻 #heritageDraftLayer，榜单状态只存 s.war.heritage.pending，容器只是渲染层。
 *
 * 【环境纪律】sim/e2e 假 DOM 的 removeChild 是空实现、children 不会缩短
 *   ⇒ 节点一律由本模块自维护的 nodes[] 管理，绝不读 children.length 做 while 收敛。
 *   className 与 classList 双写（假 DOM 桩不同步）；dataset 显式赋值（桩不从 setAttribute 同步）。
 *   无 DOM 环境（loadNoDom / aibot）整体 no-op，但结构化返回值仍可供断言。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};

  var LAYER_ID = 'heritageDraftLayer';
  var nodes = [];
  var openState = false;
  var current = null;   /* { stage, options:[{id,name,desc}], pendingIndex, pendingCount } */

  function tr(key, params, fallback) {
    var text = SB.i18n && SB.i18n.t ? (SB.i18n.t(key, params) || '') : '';
    return text || fallback || '';
  }
  function H() { return SB.heritage; }
  function layer() {
    var d = root.document;
    return d && d.getElementById ? d.getElementById(LAYER_ID) : null;
  }
  function make(tag, cls, text) {
    var d = root.document;
    if (!d || !d.createElement) return null;
    var e = d.createElement(tag);
    if (cls) {
      e.className = cls;
      if (e.classList && e.classList.add) {
        var parts = cls.split(' ');
        for (var i = 0; i < parts.length; i++) if (parts[i]) e.classList.add(parts[i]);
      }
    }
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function attr(e, name, value) {
    if (!e) return;
    if (e.setAttribute) e.setAttribute(name, value);
    /* 假 DOM 桩的 dataset 不从 setAttribute 同步 ⇒ 双写，保证 input.js 的委托在 e2e 里可测。 */
    var key = name.replace(/^data-/, '').replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
    if (e.dataset) e.dataset[key] = value;
  }
  function clearNodes() {
    var L = layer();
    for (var i = 0; i < nodes.length; i++) {
      if (L && L.removeChild) L.removeChild(nodes[i]);
    }
    nodes = [];
  }
  function setHidden(hidden) {
    var L = layer();
    if (!L) return;
    L.className = hidden ? 'heritage-draft-layer hidden' : 'heritage-draft-layer';
    if (L.classList) {
      if (hidden && L.classList.add) L.classList.add('hidden');
      if (!hidden && L.classList.remove) L.classList.remove('hidden');
    }
  }
  function push(parent, child) {
    if (!parent || !child || !parent.appendChild) return;
    parent.appendChild(child);
    nodes.push(child);
  }

  /* ── 渲染：只画 pending[0]，逐榜各选一次，不合并 ───────────────────────── */
  function render(draft) {
    var L = layer(), d = root.document;
    if (!L || !d || !d.createElement) return;
    clearNodes();
    setHidden(false);
    if (L.setAttribute) L.setAttribute('aria-label', tr('ui.heritage.draft_title', null, '择取传承'));

    var box = make('div', 'heritage-draft');
    push(L, box);

    var hd = make('div', 'heritage-draft-hd');
    push(box, hd);
    push(hd, make('span', 'heritage-draft-mark', tr('ui.heritage.title', null, '传承')));
    push(hd, make('span', 'heritage-draft-title', tr('ui.heritage.draft_title', null, '择取传承')));
    var x = make('button', 'heritage-draft-x', '×');
    if (x) {
      attr(x, 'type', 'button');
      attr(x, 'data-heritage-close', '1');
      attr(x, 'aria-label', tr('ui.action.close', null, '关闭'));
      push(hd, x);
    }

    push(box, make('div', 'heritage-draft-sub',
      tr('ui.heritage.draft_sub', null, '抽到即生效 · 轮回后清零')));
    push(box, make('div', 'heritage-draft-stage',
      tr('ui.heritage.draft_stage', { stage: H().roman(draft.stage), count: draft.pendingCount },
        '第 ' + H().roman(draft.stage) + ' 阶传承 · 待选 ' + draft.pendingCount + ' 张')));

    var cards = make('div', 'heritage-draft-cards');
    push(box, cards);
    for (var i = 0; i < draft.options.length; i++) {
      var opt = draft.options[i];
      var card = make('article', 'heritage-card');
      push(cards, card);
      push(card, make('span', 'heritage-card-stage', H().roman(draft.stage)));
      push(card, make('div', 'heritage-card-name', opt.name));
      push(card, make('div', 'heritage-card-desc', opt.desc));
      var btn = make('button', 'btn buy heritage-card-pick', tr('ui.heritage.pick', null, '择取'));
      if (btn) {
        attr(btn, 'type', 'button');
        attr(btn, 'data-heritage-pick', String(draft.pendingIndex));
        attr(btn, 'data-heritage-card', opt.id);
        push(card, btn);
      }
    }
    var later = make('button', 'heritage-draft-later', tr('ui.heritage.close', null, '暂不择取'));
    if (later) {
      attr(later, 'type', 'button');
      attr(later, 'data-heritage-close', '1');
      push(box, later);
    }
  }

  /* ── 对外 API ─────────────────────────────────────────────────────────── */
  function showHeritageDraft(s) {
    var h = H();
    if (!h || !s) return null;
    var pend = h.pendingOf(s);
    if (!pend.length) { closeHeritageDraft(); return null; }
    var d = pend[0], opts = [];
    for (var i = 0; i < d.options.length; i++) {
      var id = d.options[i];
      opts.push({ id: id, name: h.nameOf(id), desc: h.descOf(id) });
    }
    current = {
      stage: (typeof d.stage === 'number' && d.stage >= 1 && d.stage <= 7) ? d.stage : 1,
      options: opts, pendingIndex: 0, pendingCount: pend.length
    };
    openState = true;
    render(current);
    return current;
  }
  function closeHeritageDraft() {
    openState = false;
    current = null;
    clearNodes();
    setHidden(true);
  }
  function heritageDraftOpen() { return openState; }
  function lastHeritageDraft() { return current; }

  /* 择取成功后的 UI 收口：还有榜就画下一张，否则关闭。逻辑（choose）不在这里。 */
  function afterHeritagePick(s) {
    var h = H();
    if (!h || !s) { closeHeritageDraft(); return null; }
    if (h.pendingOf(s).length) return showHeritageDraft(s);
    closeHeritageDraft();
    return null;
  }

  SB.ui.showHeritageDraft = showHeritageDraft;
  SB.ui.closeHeritageDraft = closeHeritageDraft;
  SB.ui.heritageDraftOpen = heritageDraftOpen;
  SB.ui.lastHeritageDraft = lastHeritageDraft;
  SB.ui.afterHeritagePick = afterHeritagePick;
})(typeof window !== 'undefined' ? window : globalThis);
