/* 天壳 / SHELLBREAK — 战争结果轻量提示（toast）与「上一次结果」常驻行。
 * 2026-11-11：战争行动 / 入侵防御此前只写一行会滚走的事件日志，代价（军人阵亡、
 * 材料扣除、建筑降级）极易漏看。这里补一层不抢焦点的顶部 toast + 外交页常驻回看行。
 *
 * 【口径纪律】war.js:104-129 / 785-837
 *   · state.power = 军力储备；cost = 有效规模上限 × costShare，L800 无条件先扣，与成败无关。
 *   · s.jobs.soldier = 军人；popLost 才是随成败变化的代价（按国家人口比率 ceil 计，不可被调岗规避）。
 *   · scaleLoss = cost × 系数，失败也会削减敌国规模。
 *   · 被动入侵完全不扣军力储备，只改敌国规模 + 三类惩罚。
 *   ⇒ 本组件所有系数一律从 SB.war.ACTIONS / war.js 的结算结果读取，禁止硬编码。
 *
 * 【环境纪律】sim/e2e 的假 DOM 没有 requestAnimationFrame / matchMedia，
 *   removeChild 是空实现、children 不会缩短 ⇒ 堆叠只能用本模块自维护的 active[] 管理，
 *   绝不读 container.children.length 做 while 收敛（会死循环）。文案全走 textContent，
 *   不依赖 innerHTML / querySelector。无 DOM 环境（loadNoDom / aibot）整体 no-op。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};

  var STACK_ID = 'warToastStack';
  var MAX_VISIBLE = 4;
  var TTL_ACTION = 5200;
  var TTL_BREACH = 6000;
  var OFFLINE_DELAY = 500;   /* 离线结算报表 modal 先渲染，再弹，避免盖住报表顶部 */

  var active = [];           /* 自维护的活跃 toast，见上方环境纪律 */
  var lastResult = null;     /* { text, variant } 供 render-pane-war.js 常驻行读 */
  var pendingOffline = [];   /* 离线入侵报告：延迟弹但立即写常驻行 */

  function tr(key, params, fallback) {
    var text = SB.i18n && SB.i18n.t ? (SB.i18n.t(key, params) || '') : '';
    return text || fallback || '';
  }
  function fmt(value) {
    return SB.economy && SB.economy.fmtAmt
      ? SB.economy.fmtAmt(value) : String(Math.floor(Number(value) || 0));
  }
  function resourceName(id) {
    var fallback = SB.RESS && SB.RESS[id] ? SB.RESS[id].name : (id || '');
    return SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(id, fallback) : fallback;
  }
  function actionName(id) {
    return tr(id === 'raid' ? 'ui.war.action.raid'
      : id === 'invasion' ? 'ui.war.action.invasion' : 'ui.war.action.total_war', null, id);
  }
  function outcomeName(id) {
    return tr(id === 'greatSuccess' ? 'ui.war.outcome.great_success'
      : id === 'success' ? 'ui.war.outcome.success' : 'ui.war.outcome.failure', null, id);
  }
  function specOf(result) {
    var actions = SB.war && SB.war.ACTIONS;
    return actions && actions[result.action] ? actions[result.action] : null;
  }
  function outcomeSpecOf(result) {
    var spec = specOf(result);
    return spec && spec.outcomes && spec.outcomes[result.outcome] ? spec.outcomes[result.outcome] : null;
  }
  function line(text, cls) { return { text: text, cls: cls || '' }; }

  /* ── 主动行动：把 executeAction 的结构化结果翻成 toast 行 ─────────────────── */
  function actionModel(result) {
    var spec = specOf(result), outcomeSpec = outcomeSpecOf(result);
    var lootSeconds = spec ? spec.lootSeconds : 0;
    var isFailure = result.outcome === 'failure';
    var isGreat = result.outcome === 'greatSuccess';
    var cost = Number(result.cost) || 0;
    var popLost = Number(result.popLost) || 0;
    var lootAmount = Number(result.lootAmount) || 0;
    var popCap = Number(result.populationCapAward) || 0;
    var refund = Number(result.refund) || 0;
    /* 人口损失不再有「全灭」概念（popLoss 最高 0.08，不会 100%），原 wiped 判据作废 */
    var wiped = false;
    var failureStillHits = isFailure && !!outcomeSpec && Number(outcomeSpec.scaleLoss) > 0;

    var lines = [];
    lines.push(line(tr('ui.war.toast.power_cost', { cost: fmt(cost) },
      '军力储备 −' + fmt(cost) + '（行动成本 · 与成败无关）'), 'is-cost'));
    lines.push(line(tr(failureStillHits ? 'ui.war.toast.scale_loss_failure' : 'ui.war.toast.scale_loss',
      { scaleLoss: fmt(result.scaleLoss) },
      '敌国规模 −' + fmt(result.scaleLoss) + (failureStillHits ? '（失败仍有削减）' : '')), 'is-pos'));
    if (popLost > 0) {
      lines.push(line(tr('ui.war.toast.pop_loss',
        { popLost: fmt(popLost) },
        '人口损失 ' + fmt(popLost) + ' 人'), 'is-neg'));
    } else {
      lines.push(line(tr('ui.war.toast.pop_loss_none', null, '人口无损失'), 'is-neu'));
    }
    if (lootAmount > 0) {
      lines.push(line(tr('ui.war.toast.loot', {
        lootAmount: fmt(lootAmount), resourceName: resourceName(result.resourceId),
        lootSeconds: lootSeconds
      }, '掠得 ' + fmt(lootAmount) + ' ' + resourceName(result.resourceId) + '（' + lootSeconds + ' 秒毛产出）'), 'is-pos'));
    } else {
      lines.push(line(tr('ui.war.toast.no_loot', null, '无战利品'), 'is-neu'));
    }
    if (popCap > 0) lines.push(line(tr('ui.war.toast.pop_cap', { popCap: popCap }, '人口上限 +' + popCap), 'is-pos'));
    if (refund > 0) lines.push(line(tr('ui.war.toast.refund', { refund: fmt(refund) }, '「殉道者誓言」返还军力 +' + fmt(refund)), 'is-cost'));
    else if (isFailure) lines.push(line(tr('ui.war.toast.refund_hint', null, '若装备「殉道者誓言」：失败返还 25% 军力'), 'is-neu is-minor'));

    /* 常驻行复用现有完整日志文案（已含全部字段），不另造一条口径 */
    var lastText = tr('ui.war.result.action', {
      actionName: actionName(result.action), outcomeName: outcomeName(result.outcome),
      scaleLoss: fmt(result.scaleLoss), popLost: fmt(popLost),
      lootAmount: fmt(lootAmount), resourceName: resourceName(result.resourceId),
      populationCapAward: popCap
    }, '');
    return {
      variant: isFailure ? 'fail' : isGreat ? 'great' : 'success',
      icon: isFailure ? '×' : isGreat ? '★' : '✓',
      title: tr('ui.war.toast.action_title', {
        actionName: actionName(result.action), outcomeName: outcomeName(result.outcome)
      }, actionName(result.action) + ' · ' + outcomeName(result.outcome)),
      lines: lines,
      ttl: TTL_ACTION,
      lastText: lastText
    };
  }

  /* ── 被动入侵：复用 war.js 的 invasionReportMessages，保证与事件日志逐字一致 ── */
  function invasionModel(report, offline) {
    var breached = report && report.type === 'success';
    var messages = SB.war && SB.war.invasionReportMessages
      ? SB.war.invasionReportMessages(report) : [];
    var lines = [];
    for (var i = 0; i < messages.length; i++) {
      lines.push(line(String(messages[i]), i === 0 ? (breached ? 'is-neg' : 'is-pos') : 'is-neg'));
    }
    lines.push(line(tr('ui.war.toast.no_power_loss', null,
      '军力储备不受影响（被动入侵只扣材料 / 族民 / 建筑）'), 'is-neu is-minor'));
    var title = tr(breached ? 'ui.war.toast.breach_title' : 'ui.war.toast.repel_title', null,
      breached ? '入侵得手！' : '成功击退入侵');
    if (offline) title = tr('ui.war.toast.offline_tag', null, '离线期间') + ' · ' + title;
    return {
      variant: breached ? 'breach' : 'success',
      icon: breached ? '!' : '✓',
      title: title,
      lines: lines,
      ttl: breached ? TTL_BREACH : TTL_ACTION,
      lastText: title + ' · ' + messages.join(' ')
    };
  }

  /* ── DOM 渲染（无 DOM 环境整体 no-op）──────────────────────────────────── */
  function render(model) {
    var doc = root.document;
    if (!doc || !doc.createElement || !doc.getElementById) return;
    var stack = doc.getElementById(STACK_ID);
    if (!stack) return;

    var el = doc.createElement('div');
    if (!el.classList || !el.appendChild) return;
    el.className = 'war-toast is-' + model.variant;
    /* className 与 classList 双写：真实 DOM 本就同步，假 DOM 桩不同步 ⇒ 不补这一句，
       e2e 无法从 _classes 断言 toast 变体（红/绿/金/被攻入）。逐个 add 以兼容单参桩。 */
    if (el.classList.add) { el.classList.add('war-toast'); el.classList.add('is-' + model.variant); }

    var hd = doc.createElement('div'); hd.className = 'war-toast-hd';
    var ico = doc.createElement('span'); ico.className = 'war-toast-ico'; ico.textContent = model.icon;
    var title = doc.createElement('span'); title.className = 'war-toast-title'; title.textContent = model.title;
    var close = doc.createElement('button');
    close.className = 'war-toast-x'; close.textContent = '×';
    if (close.setAttribute) close.setAttribute('aria-label', tr('ui.action.close', null, '关闭'));
    hd.appendChild(ico); hd.appendChild(title); hd.appendChild(close);

    var body = doc.createElement('div'); body.className = 'war-toast-body';
    for (var i = 0; i < model.lines.length; i++) {
      var row = doc.createElement('div');
      row.className = 'war-toast-line ' + model.lines[i].cls;
      row.textContent = model.lines[i].text;
      body.appendChild(row);
    }
    /* 进度条纯 CSS 动画，JS 只设 duration —— 不依赖 requestAnimationFrame */
    var bar = doc.createElement('i');
    bar.className = 'war-toast-bar';
    if (bar.style) bar.style.animationDuration = model.ttl + 'ms';
    el.appendChild(hd); el.appendChild(body); el.appendChild(bar);
    stack.appendChild(el);
    active.push(el);

    /* 用 active[] 裁堆叠；绝不读 stack.children.length（假 DOM 不缩短） */
    while (active.length > MAX_VISIBLE) {
      var oldest = active.shift();
      if (stack.removeChild) stack.removeChild(oldest);
    }

    var closed = false;
    function dismiss() {
      if (closed) return;
      closed = true;
      var at = active.indexOf(el);
      if (at >= 0) active.splice(at, 1);
      if (el.classList && el.classList.add) el.classList.add('is-out');
      /* vm 沙箱可能不注入 setTimeout；守卫后组件退化为「常驻不自动退」，绝不抛错。 */
      if (root.setTimeout) root.setTimeout(function () {
        if (stack && stack.removeChild) stack.removeChild(el);
      }, 320);
    }
    if (close.addEventListener) close.addEventListener('click', dismiss);
    if (root.setTimeout) root.setTimeout(dismiss, model.ttl);
  }

  /* ── 对外 API ───────────────────────────────────────────────────────────
   * showWarToast(kind, payload, opts)：kind = 'action' | 'invasion'
   *   opts.offline = true 时延迟渲染（离线报表 modal 先出现），但常驻行立即更新。
   * 返回 model（便于回归断言取结构化文案）；无 DOM 环境仍返回 model，只是不画。 */
  function showWarToast(kind, payload, opts) {
    if (!payload) return null;
    var options = opts || {};
    var model = kind === 'action' ? actionModel(payload)
      : kind === 'invasion' ? invasionModel(payload, !!options.offline) : null;
    if (!model) return null;
    lastResult = { text: model.lastText, variant: model.variant };
    if (options.offline) {
      pendingOffline.push(model);
      if (root.setTimeout) {
        root.setTimeout(function () {
          var at = pendingOffline.indexOf(model);
          if (at >= 0) pendingOffline.splice(at, 1);
          render(model);
        }, OFFLINE_DELAY);
      }
    } else {
      render(model);
    }
    return model;
  }

  function lastWarResult() { return lastResult; }
  function clearWarToasts() {
    var doc = root.document;
    var stack = doc && doc.getElementById ? doc.getElementById(STACK_ID) : null;
    for (var i = 0; i < active.length; i++) {
      if (stack && stack.removeChild) stack.removeChild(active[i]);
    }
    active = [];
    pendingOffline = [];
    lastResult = null;
  }

  SB.ui.showWarToast = showWarToast;
  SB.ui.lastWarResult = lastWarResult;
  SB.ui.clearWarToasts = clearWarToasts;
})(typeof window !== 'undefined' ? window : globalThis);
