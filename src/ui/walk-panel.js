/* 随行资源面板（2026-11-16 · 用户拍板定稿）
 *
 * 交互：右下角常驻「资源面板」按钮 → 角落可拖小窗（~300px，两列）。
 *   ⚠️ 无遮罩、不给 body 加锁：主页照常能点、不变黑；只有标题栏 .wp-hd 可拖，
 *      面板内部 .wp-scroll 仍要滚动（不能整窗 touch-action:none）。
 *   拖动位置存视口比例，转屏 / resize 后按比例重落并 clamp 进视口。
 *
 * 内容（2026-11-16 四次拍板「就显示这里有的资源，地热啊星屑啊什么的显示来干嘛」）：
 *   **只镜像顶栏资源卡 #res 的筛选口径**，不另立名单：
 *     - 排除 `hydro`（热液能=能流，在自然环境卡）、`starExplore`（星图）、`stardust`（轮回商店）、
 *       `kind==='craft'`（工艺资源在顶栏独立分区）——与 render.js:228-234 一致；
 *     - 额外排除 `fuel`（地热）：热泉井 geyser 已于 2026-09-28 删除，RESS.fuel 解锁门指向
 *       不存在的建筑 ⇒ resUnlocked 恒 false、没有任何产/耗端，游戏里根本没用到（config-content.js:100
 *       与 economy-tick.js:267-285 均有定案注释）。顶栏靠 resUnlocked 天然不显示，这里直接不建格，
 *       净效果一致且杜绝强制解锁的夹具让它冒出来；
 *     - 每格按 `economy.resUnlocked(s,k)` 显隐（顶栏 gate），军力按 soldier 职业解锁单独加；
 *     - 资源格视觉照搬顶栏 `.res`：图标 + fmtAmt 存量 + /上限 + 绿红净速率 + 名字
 *       （奢侈品「产/耗」、信仰「全产+X%」照抄 hideRate 口径）——同一套经济函数，逐字同源。
 *   ⚠️ 所以本面板**没有**热液能三数、没有工艺资源、没有星屑、没有地热 —— 那些各有归属或已废弃，不在这里重复。
 *
 * 三条硬纪律（逐条都是踩出来的）：
 *   ① 按钮 / 面板都是 index.html 常驻节点，绝不塞进 #pane-*（2 秒整块 innerHTML 重写吞 click）。
 *   ② 网格只在 build() 建一次；周期刷新只改缓存节点的 textContent / class / hidden。
 *   ③ paint 不调 rates()（rate 由 renderRes 传入）；资源解锁态走 resUnlocked(s,k)，不在本文件另算；
 *      面板关闭时 paint 直接 return —— 打开瞬间 open() 用缓存参数主动补一次。
 *   ④ pointerdown 绝不 preventDefault()（会连 click 一起吞）；touch-action:none 只给 .wp-hd。
 *   ⑤ 位置存视口比例而非像素（转屏后像素坐标会跑出屏幕），拖动与点击靠 TAP_SLOP 分开。
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var ui = SB.ui = SB.ui || {};

  var POS_KEY = 'shellbreak.walkPanelPos';
  var EDGE = 8;
  var TAP_SLOP = 6;

  var GROUPS = null;
  var BUILT = false;
  var CELLS = Object.create(null);      // k -> { box, value, cap, rate, name, luxOut, luxBurn, faith }
  var JUMPS = Object.create(null);      // tabId -> { box, label }  页签快速跳转按钮（镜像主 .tab）
  var POWER_ADDED = false;
  var LAST_S = null, LAST_RATE = null;
  var drag = null, moved = false;

  function doc() { return root.document || null; }
  function el(id) { var d = doc(); return d ? d.getElementById(id) : null; }
  function formatFallback(value, params) {
    return String(value == null ? '' : value).replace(/\{([A-Za-z0-9_]+)\}/g, function (match, name) {
      return params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || formatFallback(fallback, params);
  }
  function E() { return SB.economy || {}; }
  function setText(node, txt) { if (node && node.textContent !== txt) node.textContent = txt; }

  function resourceName(k, s) {
    var def = SB.RESS && SB.RESS[k];
    var name = def ? def.name : k;
    if (k === 'faith' && SB.civic && SB.civic.faithDisplayName && s) {
      name = SB.civic.faithDisplayName(s) || name;
    } else if (k === 'faith' && s && s.religionName && String(s.religionName).trim()) {
      name = String(s.religionName).trim();
    }
    if (k === 'militaryPower') name = tr('resource.military_power.name', null, '军力储备');
    return SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(k, name) : name;
  }
  /* 镜像 render.js:228-234 的顶栏 #res 筛选：排除能流/星图/局外/工艺，其余按 RESS 顺序建格。
   * 额外排除 fuel（地热）：见文件头定案注释；顶栏靠 resUnlocked 恒 false 不显示，这里直接不建格。
   * 解锁态不在 groups 里判（那会冻结在首次 build），改在 paint 里逐格 resUnlocked(s,k)。 */
  function groups() {
    if (GROUPS) return GROUPS;
    var list = [];
    if (SB.RESS) {
      for (var k in SB.RESS) {
        if (!Object.prototype.hasOwnProperty.call(SB.RESS, k)) continue;
        if (k === 'hydro' || k === 'starExplore' || k === 'stardust' || k === 'fuel') continue;
        if ((SB.RESS[k] || {}).kind === 'craft') continue;
        list.push(k);
      }
    }
    GROUPS = { main: list };
    return GROUPS;
  }
  function icon(d, k) {
    var img = d.createElement('img');
    img.className = 'res-icon';
    img.src = 'assets/resource-icons/' + k + '.png?v=2';
    img.alt = ''; img.setAttribute('aria-hidden', 'true');
    img.width = 24; img.height = 24; img.decoding = 'async';
    return img;
  }
  /* 与顶栏 renderRes 的 row 结构逐字同构，只是换成可原地刷新的节点缓存。 */
  function makeCell(d, k) {
    var box = d.createElement('div');
    box.className = 'res wp-cell';
    box.setAttribute('data-wp-key', k);

    var content = d.createElement('div');
    content.className = 'res-content';
    var b = d.createElement('b');
    var value = d.createElement('span');
    value.className = 'wp-val';
    value.textContent = '0.0';
    var cap = d.createElement('i');
    cap.className = 'cap';
    cap.hidden = true;
    b.appendChild(value); b.appendChild(cap);

    var details = d.createElement('span');
    details.className = 'res-details';
    var label = d.createElement('span');
    label.className = 'res-label';
    var name = d.createElement('span');
    name.className = 'res-name';
    name.textContent = resourceName(k, null);
    label.appendChild(name);
    details.appendChild(label);

    var luxOut = null, luxBurn = null, luxOutPrefix = null, luxBurnPrefix = null, faith = null;
    if (k === 'luxury') {
      var lux = d.createElement('i');
      lux.className = 'sd';
      luxOutPrefix = d.createTextNode(tr('ui.res.luxury.out_short', null, '产') + ' ');
      lux.appendChild(luxOutPrefix);
      luxOut = d.createElement('span');
      luxOut.className = 'lux-out';
      luxOut.textContent = '0.00';
      lux.appendChild(luxOut);
      luxBurnPrefix = d.createTextNode(' · ' + tr('ui.res.luxury.burn_short', null, '耗') + ' ');
      lux.appendChild(luxBurnPrefix);
      luxBurn = d.createElement('span');
      luxBurn.className = 'lux-burn';
      luxBurn.textContent = '0.00';
      lux.appendChild(luxBurn);
      details.appendChild(lux);
    }
    var rate = d.createElement('i');
    rate.className = 'rate';
    rate.hidden = true;
    details.appendChild(rate);
    if (k === 'faith') {
      faith = d.createElement('i');
      faith.className = 'rate up';
      faith.hidden = true;
      details.appendChild(faith);
    }

    content.appendChild(b);
    content.appendChild(details);
    box.appendChild(icon(d, k));
    box.appendChild(content);
    CELLS[k] = {
      box: box, value: value, cap: cap, rate: rate, name: name,
      luxOut: luxOut, luxBurn: luxBurn, luxOutPrefix: luxOutPrefix, luxBurnPrefix: luxBurnPrefix, faith: faith
    };
    return box;
  }
  function fill(d, hostId, nodes) {
    var host = el(hostId);
    if (!host || !host.appendChild) return;
    host.textContent = '';
    for (var i = 0; i < nodes.length; i++) host.appendChild(nodes[i]);
  }
  function labels() {
    var t = el('wpMainTitle');
    if (t) t.textContent = tr('ui.pane.resources.title', null, '资源');
    for (var k in CELLS) {
      if (Object.prototype.hasOwnProperty.call(CELLS, k)) setText(CELLS[k].name, resourceName(k, LAST_S));
    }
    if (CELLS.luxury && CELLS.luxury.luxOutPrefix) {
      setText(CELLS.luxury.luxOutPrefix, tr('ui.res.luxury.out_short', null, '产') + ' ');
      setText(CELLS.luxury.luxBurnPrefix, ' · ' + tr('ui.res.luxury.burn_short', null, '耗') + ' ');
    }
  }
  /* 页签快速跳转（2026-11-20 用户反馈）：按钮镜像主界面 .tab 清单，不另立名单。
   * ⚠️ 解锁门禁**不在这里判**：点击统一走 SB.game.setTab(id)，与点顶部页签完全同一条路径，
   *    setTab 里那套（科技/工坊/奇观/meta/veil/挑战/成就/信仰/星图）门禁原样生效，绝不绕过。
   *    这里只把主 tab 的 .locked / .on 视觉同步过来（含 disabled），玩家一眼看出哪些能点。
   * ⚠️ 按钮挂在 #wpJump（index.html 常驻骨架），仍遵守「不塞进 #pane-*」铁律。 */
  function tabLabel(tab) {
    var span = tab.querySelector ? tab.querySelector('[data-i18n]') : null;
    return span && span.textContent ? span.textContent.trim() : '';
  }
  function buildJumps(d) {
    var host = el('wpJump');
    if (!host || !host.appendChild) return;
    var tabs = d.querySelectorAll ? d.querySelectorAll('.tab[data-tab]') : [];
    var frag = d.createDocumentFragment ? d.createDocumentFragment() : host;
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i], id = tab.getAttribute('data-tab');
      if (!id || JUMPS[id]) continue;
      var box = d.createElement('button');
      box.type = 'button';
      box.className = 'wp-jump';
      box.setAttribute('data-jump-tab', id);
      var label = d.createElement('span');
      label.className = 'wp-jump-label';
      label.textContent = tabLabel(tab) || id;
      box.appendChild(label);
      frag.appendChild(box);
      JUMPS[id] = { box: box, label: label };
    }
    if (frag !== host) host.appendChild(frag);
    syncJumps();
  }
  function syncJumps() {
    var d = doc();
    if (!d || !d.querySelectorAll) return;
    var tabs = d.querySelectorAll('.tab[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i], id = tab.getAttribute('data-tab'), j = JUMPS[id];
      if (!j) continue;
      var locked = tab.classList.contains('locked');
      j.box.classList.toggle('locked', locked);
      j.box.classList.toggle('on', tab.classList.contains('on'));
      j.box.disabled = !!locked;
      var txt = tabLabel(tab);
      if (txt && j.label.textContent !== txt) j.label.textContent = txt;
    }
  }
  function onJump(e) {
    var t = e.target || {};
    var btn = t.closest && t.closest('[data-jump-tab]');
    if (!btn || btn.disabled) return;
    var id = btn.getAttribute('data-jump-tab');
    if (!id || !SB.game || !SB.game.setTab) return;
    SB.game.setTab(id);   // 与顶部页签同一路径，门禁原样生效
    close();              // 跳过去后收起小窗，免得挡住目标页
  }

  function build() {
    var d = doc();
    if (BUILT || !d || !d.createElement || !el('wpMain')) return;
    var g = groups(), main = [];
    for (var i = 0; i < g.main.length; i++) main.push(makeCell(d, g.main[i]));
    fill(d, 'wpMain', main);
    buildJumps(d);
    BUILT = true;
    labels();
  }
  function isOpen() {
    var p = el('walkPanel');
    return !!(p && p.classList && !p.classList.contains('hidden'));
  }

  /* ── 位置：视口比例 + 拖动 ──────────────────────────────────── */
  function viewport() { return { w: root.innerWidth || 360, h: root.innerHeight || 640 }; }
  function place(left, top, w, h) {
    var node = el('walkPanel'); if (!node) return;
    var vp = viewport();
    var maxL = Math.max(EDGE, vp.w - w - EDGE);
    var maxT = Math.max(EDGE, vp.h - h - EDGE);
    left = Math.min(Math.max(EDGE, left), maxL);
    top = Math.min(Math.max(EDGE, top), maxT);
    if (node.style) {
      node.style.left = left + 'px';
      node.style.top = top + 'px';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
    }
  }
  function applyPos() {
    var node = el('walkPanel'); if (!node || !node.getBoundingClientRect) return;
    var r = node.getBoundingClientRect(), vp = viewport();
    var w = r.width || 300, h = r.height || 420;
    var raw = null;
    try { if (root.localStorage) raw = root.localStorage.getItem(POS_KEY); } catch (e) {}
    var o = null;
    if (raw) { try { o = JSON.parse(raw); } catch (e) {} }
    if (o && typeof o.fx === 'number' && typeof o.fy === 'number') {
      place(o.fx * vp.w, o.fy * vp.h, w, h);
    } else {
      place(vp.w - w - 16, vp.h - h - 96, w, h);
    }
  }
  function savePos() {
    var node = el('walkPanel'); if (!node || !node.getBoundingClientRect) return;
    var r = node.getBoundingClientRect(), vp = viewport();
    try {
      if (root.localStorage) root.localStorage.setItem(POS_KEY, JSON.stringify({
        fx: r.left / Math.max(1, vp.w), fy: r.top / Math.max(1, vp.h)
      }));
    } catch (e) {}
  }
  function onDown(e) {
    var node = el('walkPanel'); if (!node || !isOpen()) return;
    var t = e.target || {};
    if (t.closest && t.closest('#wpClose')) return;
    var r = node.getBoundingClientRect();
    drag = { dx: (e.clientX || 0) - r.left, dy: (e.clientY || 0) - r.top,
      x0: e.clientX || 0, y0: e.clientY || 0, w: r.width, h: r.height };
    moved = false;
    if (node.classList) node.classList.add('is-dragging');
    if (e.currentTarget && e.currentTarget.setPointerCapture && e.pointerId !== undefined) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    }
  }
  function onMove(e) {
    if (!drag) return;
    var dx = (e.clientX || 0) - drag.x0, dy = (e.clientY || 0) - drag.y0;
    if (!moved && Math.abs(dx) + Math.abs(dy) < TAP_SLOP) return;
    moved = true;
    place((e.clientX || 0) - drag.dx, (e.clientY || 0) - drag.dy, drag.w, drag.h);
  }
  function onUp(e) {
    if (!drag) return;
    var node = el('walkPanel');
    if (node && node.classList) node.classList.remove('is-dragging');
    var wasMoved = moved;
    drag = null; moved = false;
    if (wasMoved) savePos();
  }

  function open() {
    build();
    var panel = el('walkPanel');
    if (!panel || !panel.classList) return;
    panel.classList.remove('hidden');
    applyPos();
    paint(LAST_S, LAST_RATE);
    var x = el('wpClose');
    if (x && x.focus) x.focus();
  }
  function close() {
    var panel = el('walkPanel');
    if (!panel || !panel.classList) return;
    panel.classList.add('hidden');
    var fab = el('walkFab');
    if (fab && fab.focus) fab.focus();
  }
  function toggle() { if (isOpen()) close(); else open(); }

  function addPowerCell(s) {
    if (POWER_ADDED || !BUILT) return;
    if (!(SB.war && SB.war.power && SB.folk && SB.folk.jobUnlocked && SB.folk.jobUnlocked(s, 'soldier'))) return;
    var d = doc(), host = el('wpMain');
    if (!d || !host) return;
    POWER_ADDED = true;
    host.appendChild(makeCell(d, 'militaryPower'));
    setText(CELLS.militaryPower.name, resourceName('militaryPower', s));
  }
  function paintCell(k, c, s, rate, need, LL, fam) {
    /* 顶栏 gate：未解锁的资源格整格隐藏（顶栏是 continue 不建行，这里 build 一次所以隐藏）。 */
    var unlocked = k === 'militaryPower' ? true : (E().resUnlocked ? E().resUnlocked(s, k) : true);
    c.box.hidden = !unlocked;
    if (!unlocked) return;

    var isPower = k === 'militaryPower';
    var v = isPower ? SB.war.power(s) : ((s.res && isFinite(s.res[k])) ? s.res[k] : 0);
    setText(c.value, E().fmtAmt ? E().fmtAmt(v) : String(v));

    var cap = isPower ? Infinity : E().capOf(s, k);
    var full = false;
    if (isFinite(cap)) {
      full = v >= cap;
      c.cap.hidden = false;
      setText(c.cap, '/ ' + (E().fmt ? E().fmt(cap) : String(cap)));
      if (c.cap.classList) c.cap.classList.toggle('full', full);
    } else {
      c.cap.hidden = true;
    }
    if (c.box.classList) c.box.classList.toggle('neg', !full && k === 'kelp' && v < need);

    var r = isPower ? SB.war.rate(s) : (rate && isFinite(rate[k]) ? rate[k] : 0);
    if (k !== 'luxury' && Math.abs(r) >= 0.005) {
      var sign = r > 0 ? '+' : '';
      var txt = sign + (E().fmtAbbr ? E().fmtAbbr(r, Math.abs(r) >= 100 ? Math.round(r) : r.toFixed(2)) : r.toFixed(2)) + '/s';
      c.rate.hidden = false;
      setText(c.rate, txt);
      if (c.rate.classList) {
        c.rate.classList.toggle('up', r > 0);
        c.rate.classList.toggle('down', r < 0);
      }
    } else {
      c.rate.hidden = true;
    }
    if (c.luxOut && LL) {
      if (c.luxOutPrefix) setText(c.luxOutPrefix, tr('ui.res.luxury.out_short', null, '产') + ' ');
      if (c.luxBurnPrefix) setText(c.luxBurnPrefix, ' · ' + tr('ui.res.luxury.burn_short', null, '耗') + ' ');
      setText(c.luxOut, LL.out.toFixed(2));
      setText(c.luxBurn, LL.burn.toFixed(2));
    }
    if (c.faith) {
      if (fam > 1) {
        c.faith.hidden = false;
        setText(c.faith, tr('ui.res.faith.all_prod_short', {
          percent: Math.round((fam - 1) * 100)
        }, '全产+' + Math.round((fam - 1) * 100) + '%'));
      } else {
        c.faith.hidden = true;
      }
    }
  }
  function paint(s, rate) {
    LAST_S = s || LAST_S;
    LAST_RATE = rate || LAST_RATE;
    if (!LAST_S || !BUILT || !isOpen()) return;
    syncJumps();   // 主 tab 的锁态/高亮会变（解锁、切页），每帧镜像
    addPowerCell(LAST_S);
    var need = E().foodUse ? E().foodUse(LAST_S) : 0;
    var LL = E().happyLedger ? E().happyLedger(LAST_S) : null;
    var fam = E().faithAllMul ? E().faithAllMul(LAST_S) : 1;
    for (var k in CELLS) {
      if (Object.prototype.hasOwnProperty.call(CELLS, k)) paintCell(k, CELLS[k], LAST_S, LAST_RATE, need, LL, fam);
    }
  }
  function init() {
    var d = doc();
    if (!d) return;
    var fab = el('walkFab'), hd = d.querySelector('.wp-hd'), x = el('wpClose'), jump = el('wpJump');
    if (fab && fab.addEventListener) fab.addEventListener('click', toggle);
    if (x && x.addEventListener) x.addEventListener('click', close);
    if (jump && jump.addEventListener) jump.addEventListener('click', onJump);
    if (hd && hd.addEventListener) {
      hd.addEventListener('pointerdown', onDown);
      hd.addEventListener('pointermove', onMove);
      hd.addEventListener('pointerup', onUp);
      hd.addEventListener('pointercancel', onUp);
    }
    if (root.addEventListener) {
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });
      root.addEventListener('shellbreak:locale-changed', function () { if (BUILT) labels(); });
      root.addEventListener('resize', function () { if (isOpen()) applyPos(); });
    }
  }

  ui.walkPanel = {
    init: init, paint: paint, open: open, close: close, toggle: toggle, isOpen: isOpen
  };
})(typeof window !== 'undefined' ? window : globalThis);
