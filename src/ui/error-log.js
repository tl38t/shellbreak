/* 前端报错捕获（2026-10-31）
 *
 * 【为什么加】玩家报「人口分配面板没加载出来」：族民面板前四行在，职业分配区与末尾那条
 *   **无条件追加**的 note 都没了。这个形状只有「渲染中途抛异常」能解释，但全仓此前
 *   `grep window.onerror` **零命中** ⇒ 现场一个字节都没留下，只能靠截图猜。
 *   这类「玩家说坏了、我们看不到」的反馈，先把取证通道建起来，否则下一轮还是猜。
 *
 * 【为什么必须排在第一个 <script>】模块**初始化期**（config/config-catalog 那一批）抛的错
 *   同样要抓。排在它们后面，那一整段就是盲区 —— 而初始化失败恰好是最难从截图看出来的。
 *
 * 【为什么只进内存缓冲，不直接写诊断盘】本文件可能跑在 save-storage.js 之前，那时
 *   `SB.store` 还不存在。所以这里只做两件事：①入环形缓冲；②留一个 sink 挂钩。
 *   - 展示：save-storage 的 `diagText()` 在玩家点「复制诊断信息」时读取缓冲；
 *   - 持久化：save-storage 加载后注册 sink，把**头几条**错误立刻写进诊断 key。
 *     为什么必须持久化：玩家看到白屏的第一反应是重启，内存缓冲一重启就没了，
 *     而重启后重新进游戏往往一次都不复现（那正是这个 bug 的特征）。
 *
 * 【为什么 e2e 里是空转】sim/load-sb.mjs 的 vm 沙箱顶层只有 document/element 桩带
 *   addEventListener，`root.addEventListener` 是 undefined ⇒ 监听器不装。
 *   但 `SB.errs` 依然导出，定向探针可以用 `push()` 注入错误验证格式化与去重。
 *
 * 【不做的事】不 try/catch 包渲染、不改任何行为。本轮只加观测：
 *   把「面板崩了」变成「哪一行抛的」是下一步，得先有现场数据才敢动渲染路径。
 */
(function (root) {
  'use strict';

  var NS = (root.SB = root.SB || {});
  /* 幂等：双 include / 热重载时不许叠加监听器（叠加会让同一错记两次，
   * 而「记两次」会让人误判成「复现两次」）。 */
  if (NS.errs) return;

  var MAX = 6;          /* 环形缓冲上限：够看出「同一个错按 2 秒周期反复抛」，又不会把诊断撑到读不完 */
  var MAX_MSG = 160;
  var SINK_MAX = 3;     /* 落盘上限：坏机器可能每 2 秒抛一次，不做上限就变成拿写盘换噪声 */

  var list = [];        /* 最近的错误（去重后），旧→新 */
  var byKey = {};       /* 去重键 → 条目；同时用来统计「共几类」 */
  var total = 0;        /* 真实发生次数（含被折叠的重复） */
  var sink = null, sinkUsed = 0;

  /* 压成单行：诊断文本按行解析（见 sim/e2e-suites/boot-gate.mjs 对 diagText 的 split），
   * 消息里带换行会把「一行一件事」的结构撑乱。 */
  function clip(v, n) {
    var s = (v == null) ? '' : String(v);
    s = s.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return s.length > n ? (s.slice(0, n) + '…') : s;
  }
  /* 路径只留文件名：包内绝对路径随构建变化，留着既长又干扰跨反馈比对。 */
  function baseName(p) {
    var s = clip(p, 200);
    var i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return i >= 0 ? s.slice(i + 1) : s;
  }
  /* 栈只留**帧**，丢掉首行的「TypeError: 消息」——
   * 那一行与 msg 逐字重复，白占 40~80 字，而诊断文本是要玩家手抄/截图转发的东西。
   * 两种引擎的帧格式都要认：V8 `at fn (file:line:col)`、JSC `fn@file:line:col`。
   * 上限 3 帧：够看到「paneFolk ← renderPanes ← 谁调的」，再多就是噪声。 */
  function framesOf(stack) {
    /* ⚠️ 必须先按换行切、再逐段 clip。整段先过 clip() 会把 `\n` 压成空格，
     *    于是 `^\s*at ` 一条都命中不了，函数名（唯一能定位「哪个 pane 抛的」的信息）当场丢掉。
     *    2026-10-31 探针实测踩中过一次。 */
    var raw = (stack == null) ? '' : String(stack);
    if (!raw) return '';
    var parts = raw.split('\n'), out = [];
    for (var i = 0; i < parts.length && out.length < 3; i++) {
      var ln = clip(parts[i], 120);
      if (/^\s*at /.test(parts[i]) || ln.indexOf('@') > 0) out.push(ln);
    }
    /* 一条帧都没有（某些容器把 stack 压成单行）就退回原文前 120 字，聊胜于无。 */
    return out.length ? out.join(' ') : clip(raw, 120);
  }

  function record(kind, msg, src, line, col, stack) {
    /* 剥掉 Chrome 加的 "Uncaught " 前缀：kind 已经说明是未捕获异常，
     * 留着白占 9 个字，而这段文字玩家要截图转发。 */
    var m = clip(msg, MAX_MSG).replace(/^Uncaught\s+/i, '') || '(无消息)';
    var f = baseName(src);
    var ln = line || 0;
    var key = kind + '|' + m + '|' + f + '|' + ln;
    total++;
    var hit = byKey[key];
    if (hit) { hit.n++; return; }   /* 同一个错只计数，不占缓冲位 */
    var item = { kind: kind, msg: m, file: f, line: ln, col: col || 0,
      stack: framesOf(stack), at: Date.now(), n: 1 };
    byKey[key] = item;
    list.push(item);
    /* 挤出缓冲时**不删 byKey**：那个错误累计发生过几次仍要算进「共 N 次」，
     * 只是不再占展示位。计数比首屏那几行更不容易误导。 */
    while (list.length > MAX) list.shift();
    emit();
  }

  /* 一句话摘要：给诊断盘持久化 + 面板顶部那行常显用。 */
  function brief() {
    if (!total) return '';
    var it = list[list.length - 1] || { msg: '?', file: '', line: 0 };
    var kinds = 0;
    for (var k in byKey) { if (Object.prototype.hasOwnProperty.call(byKey, k)) kinds++; }
    return '共 ' + total + ' 次 / ' + kinds + ' 类　最近 ' + it.msg
      + (it.file ? (' @' + it.file + (it.line ? ':' + it.line : '')) : '');
  }

  /* 多行全文：每行都以「前端 」开头。
   * ⚠️ 前缀必须与既有诊断行（版本/能力/接口/启动/就绪/恢复/写盘/读回/落盘/尸检/错误）
   *   **都不重合**，否则 boot-gate 那种 `indexOf(前缀)===0` 的解析会串行。 */
  function text() {
    if (!total) return '前端 无报错（本次会话）';
    var kinds = 0, k;
    for (k in byKey) { if (Object.prototype.hasOwnProperty.call(byKey, k)) kinds++; }
    var out = ['前端 共 ' + total + ' 次 / ' + kinds + ' 类'];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      out.push('前端 ' + (i + 1) + '. ' + it.kind + ' ×' + it.n + ' ' + it.msg
        + (it.file ? (' @' + it.file + (it.line ? ':' + it.line : '')) : '')
        + (it.stack ? (' ↳ ' + it.stack) : ''));
    }
    return out.join('\n');
  }

  function emit() {
    if (!sink || sinkUsed >= SINK_MAX) return;
    sinkUsed++;
    try { sink(brief()); } catch (e) { /* 落盘失败绝不能反过来把页面带崩 */ }
  }

  /* ── 监听器 ──────────────────────────────────────────────────────── */
  function onError(e) {
    try {
      var t = e && e.target;
      /* 资源加载失败（<img>/<script>/<iframe> 404）不冒泡、没有 message，只有捕获阶段听得到。
       * 单列成 res：它意味着**包残缺**，与逻辑异常是两类故障，混在一起看会误判方向。 */
      if (t && t !== root && t.tagName) {
        record('res', '加载失败 ' + String(t.tagName).toLowerCase(), t.src || t.href || '', 0, 0, '');
        return;
      }
      var x = e && e.error;
      record('err',
        (e && e.message) || (x && x.message) || 'unknown',
        (e && e.filename) || (x && x.fileName) || '',
        (e && e.lineno) || (x && x.lineNumber) || 0,
        (e && e.colno) || 0,
        (x && x.stack) || '');
    } catch (ignore) { /* 监听器自身抛错会引发递归的 error 事件，这里必须全吞 */ }
  }

  function onRejection(e) {
    try {
      var r = e && e.reason;
      if (r && typeof r === 'object') {
        record('rej', r.message || String(r), r.fileName || '', r.lineNumber || 0, 0, r.stack || '');
      } else {
        record('rej', String(r), '', 0, 0, '');
      }
    } catch (ignore) {}
  }

  /* 捕获阶段：资源错误不冒泡，只有 capture=true 能收到。 */
  function install() {
    if (typeof root.addEventListener !== 'function') return;
    try {
      root.addEventListener('error', onError, true);
      root.addEventListener('unhandledrejection', onRejection);
    } catch (e) {}
  }

  NS.errs = {
    /* 快照副本：外部只读，不许直接改内部数组（否则去重表与实际内容脱节）。 */
    list: function () { return list.slice(); },
    total: function () { return total; },
    brief: brief,
    text: text,
    /* sink：save-storage 加载后注册，把错误写进诊断盘。传非函数即解除。 */
    setSink: function (fn) {
      sink = (typeof fn === 'function') ? fn : null;
      sinkUsed = 0;
    },
    /* 手动注入，走与真实错误同一个入口。只给定向探针 / ?diag 自测用，生产代码不调。 */
    push: function (msg, src, line, stack) { record('test', msg, src, line, 0, stack || ''); },
    /* 探针用：清空现场，避免同一进程里多次注入互相污染。 */
    reset: function () { list = []; byKey = {}; total = 0; sinkUsed = 0; }
  };

  install();
})(typeof window !== 'undefined' ? window : globalThis);
