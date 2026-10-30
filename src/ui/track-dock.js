/* 建造追踪小框（2026-10-29 · 玩家「一人成罪」提议，用户拍板实装）
 * 需求原文：「在建造按钮旁边搞一个『追踪』的小按钮，按完之后在角上出来一个小的提示框，
 *   框里出来『工坊（石头：141/185.6）』这样的显示，材料不够的时候就标红；
 *   我在信仰界面看到材料够了，点一下小框它自动跳转过去。」
 * 2026-10-30 扩：**多目标**（用户拍板上限 4 个）+ 尤里卡 / 鼓舞（两处入口都放）。
 *
 * 三条硬纪律（照抄本仓既有踩坑记录）：
 *   ① 追踪态存在**周目状态** `s.track` 里，所以它必须同时出现在 `state.freshRun` 的字段表里
 *      —— `state-migrate.migrateRun` 是 `for (k in raw) if (k in base)` 的**白名单**，
 *      freshRun 里没有的键会在读档那一刻被静默丢掉（同族坑见 JUDGMENTS 五点）。
 *   ② 小框是 index.html 里的**常驻节点**，绝不能放进 `#pane-*`
 *      —— 那些面板每 2 秒整块重画（PANE_REFRESH），放进去的小框会被连节点一起换掉，
 *      表现是「拖动拖到一半框没了」「点不动」，而且不报错。
 *   ③ 数字只走 economy / tech 的同一套口径（建筑走 `costRows`，尤里卡与鼓舞走
 *      `SB.tech.condShort`）。**不许在这里自己算第二份** ——
 *      按钮写 141/185.6、小框写 140/185.6 那种「两套账」是玩家最先发现的一类 bug，
 *      尤里卡那边更严重：condMet 与 condShort 一旦分家，「显示 4/5 但点不动」就回来了。
 *
 * 追踪串格式：`kind:id[@lv]`，**多个用 `|` 连接**（`s.track` 仍是字符串，
 * 老存档里的单条天然兼容，不需要迁移；上限 MAX 个，超出部分在读取时截断）。
 *   · `bld:workshop@0`  巢穴 / 星图建筑。`@lv` 是**按下追踪那一刻的等级**，
 *     等级一变（手动建造 / 自动升级 / 离线补算）就说明这一级已经买过了 ⇒ 自动解除。
 *     没有它的话，挂机自动升级会把小框永远钉在一个「其实早就建好了」的目标上。
 *   · `wonder:wonder_lighthouse`  奇观（建成即解除，无等级概念）
 *   · `craft:craft_rope`          工坊配方（可反复制造，制造成功**不解除**）
 *   · `tech:industrialization`    科技的**尤里卡条件**（达成即解除）
 *   · `civic:code_of_laws`        市政的**鼓舞条件**（达成即解除）
 */
(function (root) {
  var SB = root.SB = root.SB || {};
  var ui = SB.ui = SB.ui || {};

  /* 位置存的是**视口比例**而不是像素：手机转屏 / 窗口缩放之后，像素坐标会跑到屏幕外，
   * 比例坐标还能落回同一个相对角落。 */
  var POS_KEY = 'shellbreak.trackPos';
  var EDGE = 8;          /* 距屏幕边缘的最小留白 */
  var TAP_SLOP = 6;      /* 位移小于它算「点」，大于它算「拖」（手指天然抖动约 3~5px） */
  var PAINT_MS = 200;    /* 数字最多 5 次/秒刷新。renderTick 是逐帧的，但资源本身按 tick 变，
                          * 每帧重算一次 costOf 纯属白烧 —— 5Hz 已比 tick 快。 */
  var MAX = 4;           /* 用户 2026-10-30 拍板：同时最多 4 个目标 */
  var SEP = '|';

  function doc() { return root.document || null; }
  function el(id) { var d = doc(); return d ? d.getElementById(id) : null; }
  function run() { return (SB.game && SB.game.run) ? SB.game.run() : null; }
  function cls(node, s) { if (node && node.classList) node.classList.toggle('hidden', s); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 追踪串 ⇄ 数组 ──────────────────────────────────────────
   * 读取时去重 + 截断：存档可能是上个版本写的（单条），也可能被外部改坏（重复 / 超长）。
   * 一律在**读取侧**收敛，写入侧只管拼 —— 这样「脏档」永远不会扩散到 UI。 */
  function keys(s) {
    if (!s || typeof s.track !== 'string' || !s.track) return [];
    var parts = s.track.split(SEP), out = [], i;
    for (i = 0; i < parts.length && out.length < MAX; i++) {
      var k = parts[i];
      if (k && out.indexOf(k) < 0) out.push(k);
    }
    return out;
  }
  function setKeys(s, arr) {
    if (!s) return;
    s.track = arr.slice(0, MAX).join(SEP);
  }

  /* ── 造价 → 展示行 ────────────────────────────────────────────
   * 与 economy.costOwnedTxt 完全同式：存量 floor、需求 fmtAmt、够不够走 enough 的容差。
   * 差别只有一处：这里**保留全部项**（够的也留着，只是不标红），
   * 因为玩家要一眼看出「就差石头」而不是「只剩一个数字不知道是哪个」。 */
  function costRows(s, cost) {
    var out = [], k;
    for (k in cost) {
      if (!cost[k]) continue;
      var need = cost[k], have;
      if (k === 'pop') {
        have = (typeof s.pop === 'number' && isFinite(s.pop)) ? Math.floor(s.pop) : 0;
      } else {
        var raw = s.res && s.res[k];
        /* 存档迁移会清洗旧 NaN，运行态也要防：坏的存量回落 0，绝不把 NaN 印给玩家。 */
        have = (typeof raw === 'number' && isFinite(raw)) ? Math.floor(raw) : 0;
      }
      out.push({
        name: k === 'pop' ? '人口' : ((SB.RESS && SB.RESS[k] && SB.RESS[k].name) || k),
        have: have,
        need: need,
        short: !(SB.economy && SB.economy.enough ? SB.economy.enough(have, need) : have >= need - 1e-9)
      });
    }
    return out;
  }

  /* 建筑显示名：与巢穴列表同源（升级链改名——砂矿坑→鱼骨矿井→深层矿井）。
   * 不共用的话会出现「小框写砂矿坑、列表面写着鱼骨矿井」，玩家会当成两个东西。 */
  function bldName(s, b) {
    var name = b.name;
    for (var i = 0; SB.UPGRADES && i < SB.UPGRADES.length; i++) {
      var u = SB.UPGRADES[i];
      if (u.upgradesBuilding === b.id && s.upgrades && s.upgrades[u.id]) name = u.name;
    }
    return name;
  }

  function civicById(id) {
    for (var i = 0; SB.CIVICS && i < SB.CIVICS.length; i++) {
      if (SB.CIVICS[i].id === id) return SB.CIVICS[i];
    }
    return null;
  }

  /* ── 追踪串 → 展示所需的一切；目标已失效则返回 null ────────────
   * 返回 { kind, id, title, rows, ready }：
   *   rows  = [{ name, have, need, short }] 或 [{ txt, short }]（尤里卡/鼓舞走 txt）
   *   ready = 所有 row 都够（尤里卡恒 false —— 达成那一刻整条就解除了） */
  function resolve(s, tracked) {
    if (!s || !tracked || typeof tracked !== 'string') return null;
    var raw = tracked.split('@');
    var head = raw[0].split(':');
    var kind = head[0], id = head.slice(1).join(':');
    var atLv = raw.length > 1 ? Number(raw[1]) : null;
    if (!id) return null;

    if (kind === 'bld') {
      var b = (SB.habitat && SB.habitat.buildingById) ? SB.habitat.buildingById(id) : null;
      if (!b) return null;
      var lv = (s.lvl && s.lvl[id]) || 0;
      if (b.maxLvl && lv >= b.maxLvl) return null;        // 已到上限，追它没有意义
      if (atLv !== null && isFinite(atLv) && lv !== atLv) return null;  // 这一级已经买过
      if (SB.habitat.retired && SB.habitat.retired(s, b)) return null;
      if (SB.habitat.needMet && !SB.habitat.needMet(s, b)) return null;  // 前置没了
      var rowsB = costRows(s, SB.economy.costOf(s, id));
      return { kind: kind, id: id, lv: lv, title: bldName(s, b), rows: rowsB, ready: allOk(rowsB) };
    }
    if (kind === 'wonder') {
      if (!SB.wonder || !SB.WONDERS) return null;
      var w = null;
      for (var i = 0; i < SB.WONDERS.length; i++) if (SB.WONDERS[i].id === id) { w = SB.WONDERS[i]; break; }
      if (!w) return null;
      if (s.wonders && s.wonders[id]) return null;        // 已建成
      if (SB.workshop && SB.workshop.wonderBlocked) {
        var why = SB.workshop.wonderBlocked(s, id);
        if (why && /^需要先/.test(why)) return null;       // 未解锁（列表里也不显示）
      }
      var rowsW = costRows(s, SB.wonder.discountedCost(s, id));
      return {
        kind: kind, id: id, title: SB.wonder.displayName(s, id),
        rows: rowsW, ready: allOk(rowsW)
      };
    }
    if (kind === 'craft') {
      if (!SB.workshop || !SB.workshop.crafts) return null;
      var L = SB.workshop.crafts(), c = null;
      for (var j = 0; j < L.length; j++) if (L[j].id === id) { c = L[j]; break; }
      if (!c) return null;
      if (SB.workshop.craftBlocked) {
        var why2 = SB.workshop.craftBlocked(s, id);
        if (why2 && /^需要先/.test(why2)) return null;     // 未解锁
      }
      var rowsC = costRows(s, c.in);
      return { kind: kind, id: id, title: c.name, rows: rowsC, ready: allOk(rowsC) };
    }

    /* ── 尤里卡 / 鼓舞 ──────────────────────────────────────────
     * 判据与文案**全部**走 tech.js：condMet（达成没有）/ condShort（差多少，含 now/need）。
     * ⚠️ 三条不能省的守卫：
     *   ① 已掌握 / 已完成 ⇒ 解除（达成后按钮就不该还在）；
     *   ② 未来纪元 ⇒ 解除（树上根本没这个节点，跳过去是空滚）；
     *   ③ 未揭示时**标题不许印真名** —— 「未揭露的科技」是面板既有纪律，
     *      追踪框漏一手等于把整棵树的悬念偷出来。 */
    if (kind === 'tech' || kind === 'civic') {
      var isTech = kind === 'tech', def = null, cond = null, revealed = false;
      if (isTech) {
        def = (SB.tech && SB.tech.byId) ? SB.tech.byId(id) : null;
        if (!def) return null;
        if (s.techs && s.techs[id]) return null;
        cond = def.cond;
        revealed = SB.tech.metOf ? SB.tech.metOf(s, def) : true;
      } else {
        def = civicById(id);
        if (!def) return null;
        if (s.civics && s.civics[id]) return null;
        cond = def.boost;
        revealed = (SB.civic && SB.civic.isRevealed) ? SB.civic.isRevealed(s, id) : true;
      }
      if (!cond || cond.t === 'default') return null;      // 无需条件 ⇒ 没什么可追
      if ((def.era || 1) > (s.era || 1)) return null;      // 未来纪元：树上还没有它
      var met = (SB.tech && SB.tech.condMet) ? SB.tech.condMet(s, cond) : true;
      if (met) return null;                                // 已达成 ⇒ 自动解除
      var sh = (SB.tech && SB.tech.condShort) ? SB.tech.condShort(s, cond) : null;
      if (!sh) return null;                                /* condShort 对少数类型返回 null
                                                            * （default / 挑战忽略人口门槛时的 pop）
                                                            * ⇒ 宁可不出这一行，也不印一句假进度。 */
      return {
        kind: kind, id: id,
        title: (isTech ? '尤里卡 · ' : '鼓舞 · ') +
          (revealed ? def.name : (isTech ? '未揭露的科技' : '未揭露的市政')),
        rows: [{ txt: sh.txt, short: true }],
        ready: false
      };
    }
    return null;
  }

  function allOk(rows) {
    for (var i = 0; i < rows.length; i++) if (rows[i].short) return false;
    return true;
  }

  /* ── 绘制 ─────────────────────────────────────────────────── */
  var lastHtml = '', lastState = '', lastMs = 0;
  /* 跳转高亮的「目标 + 截止时间」。为什么要记而不是直接 add 类：
   * 宿主行所在的 pane 每 2 秒整块重画，类会跟着旧节点一起消失。 */
  var flashSel = '', flashUntil = 0, flashNode = null;

  function syncFlash() {
    if (!flashSel) return;
    var d = doc(); if (!d) return;
    if (Date.now() > flashUntil) {
      if (flashNode && flashNode.classList) flashNode.classList.remove('is-track-flash');
      flashSel = ''; flashNode = null;
      return;
    }
    var node = d.querySelector(flashSel);
    if (!node) return;
    var row = node.closest('.bld-row') || node.closest('.row') || node;
    if (row !== flashNode) {
      if (flashNode && flashNode.classList) flashNode.classList.remove('is-track-flash');
      flashNode = row;
    }
    if (row.classList && !row.classList.contains('is-track-flash')) row.classList.add('is-track-flash');
  }

  function rowHtml(item) {
    var info = item.info, parts = [], i, r;
    /* 造价行与尤里卡行是两种形状：前者 {name,have,need}，后者自带整句 txt（来自 condShort）。
     * 统一在渲染处收口，resolve 不做字符串拼接 —— 免得两处各拼一份又漂。 */
    for (i = 0; i < info.rows.length; i++) {
      r = info.rows[i];
      var txt = r.txt ? r.txt
        : r.name + ' ' + r.have + '/' + (SB.economy.fmtAmt ? SB.economy.fmtAmt(r.need) : r.need);
      parts.push('<span class="td-item' + (r.short ? ' is-short' : '') + '">' + esc(txt) + '</span>');
    }
    var verb = (info.kind === 'bld' && info.lv > 0) ? '升级 ' : '';
    var title = verb + info.title;
    if (info.ready) title += ' · 可以' + (info.kind === 'craft' ? '制作' : '建造');
    return '<div class="td-row' + (info.ready ? ' is-ready' : '') + '" data-track-go="' + esc(item.key) + '">' +
      '<div class="td-row-main">' +
        '<span class="td-title">' + esc(title) + '</span>' +
        '<span class="td-cost">' + parts.join('<i class="td-sep">·</i>') + '</span>' +
      '</div>' +
      '<button type="button" class="td-x" data-track-drop="' + esc(item.key) + '" ' +
        'aria-label="取消追踪 ' + esc(title) + '" title="取消追踪">×</button>' +
      '</div>';
  }

  function paint(s) {
    var node = el('trackDock');
    if (!node) return;                       /* 无 DOM 的沙箱（e2e / loadNoDom）直接跳过 */
    syncFlash();
    if (!s) { cls(node, true); return; }

    var now = Date.now();
    if (now - lastMs < PAINT_MS) return;
    lastMs = now;

    var list = keys(s), alive = [], i;
    for (i = 0; i < list.length; i++) {
      var info = resolve(s, list[i]);
      if (info) alive.push({ key: list[i], info: info });
    }
    /* 目标失效（建成 / 达成 / 到上限 / 前置消失 / 存档脏值）⇒ 就地剔除。
     * 绝不能留一个「永远显示旧数字、点进去啥也没有」的小框 —— 那与 launchStatus
     * 那类「面板撒谎」是同一族病。 */
    if (alive.length !== list.length) setKeys(s, alive.map(function (x) { return x.key; }));

    if (alive.length) {
      cls(node, false);
    } else {
      /* 全部失效 ⇒ 收起，并把行清空。
       * ⚠️ 只隐藏不清行会留下「看不见的残留 DOM」，下次重新追踪时先闪一帧旧内容
       *   （探针抓到的就是这一帧：keys 已空、#trackRows 里还挂着 1 行）。 */
      if (s.track) s.track = '';
      var emptyBox = el('trackRows');
      if (emptyBox) emptyBox.innerHTML = '';
      if (!node.classList || !node.classList.contains('hidden')) cls(node, true);
      lastHtml = ''; lastState = '';
      return;
    }

    var html = '', allReady = true;
    for (i = 0; i < alive.length; i++) {
      if (!alive[i].info.ready) allReady = false;
      html += rowHtml(alive[i]);
    }
    /* 整块比字符串：只有真变了才写 innerHTML。
     * 每帧重写会让长按选中失败、也会把 :active 打断（同原实现的理由）。 */
    if (html !== lastHtml) {
      var box = el('trackRows');
      if (box) box.innerHTML = html;
      lastHtml = html;
    }
    var st = allReady ? 'ready' : 'waiting';
    /* 只有一行时用外层那颗「×」（原单目标体验不变），多行时每行自己带 ×、外层收起 ——
     * 否则第一行的 × 和外层的 × 会并排出现两个叉，玩家分不清哪个关哪个。 */
    if (node.classList) node.classList.toggle('is-multi', alive.length > 1);
    if (st !== lastState) {
      if (node.classList) {
        node.classList.toggle('is-ready', st === 'ready');
        node.classList.toggle('is-waiting', st === 'waiting');
      }
      lastState = st;
    }
  }

  function repaint(s) {
    lastHtml = ''; lastState = ''; lastMs = 0;
    paint(s);
  }

  /* ── 对外动作 ─────────────────────────────────────────────── */
  /* 返回 'on' / 'off' / 'full'（已满）/ false（无状态）。
   * ⚠️ 满的时候**不能**悄悄替换掉一个：玩家点的是「再加一个」，结果另一个消失了，
   *    那是比「没反应」更坏的体验。抖一下 + 返回 'full'，两者都在本函数内完成，
   *    调用方不用（也不该）各写一份提示。 */
  function track(kind, id) {
    var s = run();
    if (!s || !kind || !id) return false;
    var key = kind + ':' + id;
    if (kind === 'bld') {
      /* 记下当前等级：等级一变就自动解除（手动建造 / 自动升级 / 离线补算都覆盖） */
      key += '@' + ((s.lvl && s.lvl[id]) || 0);
    }
    var list = keys(s), at = list.indexOf(key);
    if (at >= 0) list.splice(at, 1);
    else {
      /* 满的时候**不能**悄悄替换掉一个：玩家点的是「再加一个」，结果另一个消失了，
       * 比「没反应」更坏。这里直接抖一下 —— 把反馈放在 track() 内部而不是交给调用方，
       * 是因为入口有两处（树上的 ★ / 详情面板），漏一处就有一处静默失败。 */
      if (list.length >= MAX) { hint(); return 'full'; }
      list.push(key);
    }
    setKeys(s, list);
    repaint(s);
    syncButtons();
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
    return at >= 0 ? 'off' : 'on';
  }

  /* 第三个参数是可选的局对象：UI 侧不传（走当前局），e2e / 探针要拿构造出来的局时传进来。
   * 不加这一条的话，测试只能 monkey-patch `SB.game.run`，而那样又会污染后面的 suite。 */
  function isTracked(kind, id, s) {
    var st = s || run();
    if (!st) return false;
    var pre = kind + ':' + id, list = keys(st);
    for (var i = 0; i < list.length; i++) {
      if (list[i] === pre) return true;
      /* 建筑那条带 `@lv` 后缀，不能直接全等（否则按钮永远显示「未追踪」） */
      if (kind === 'bld' && list[i].indexOf(pre + '@') === 0) return true;
    }
    return false;
  }

  function drop(key) {
    var s = run();
    if (!s || !key) return;
    var list = keys(s), at = list.indexOf(key);
    if (at >= 0) list.splice(at, 1);
    setKeys(s, list);
    repaint(s);
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
  }

  function clear() {
    var s = run();
    if (s) s.track = '';
    var node = el('trackDock');
    if (node) cls(node, true);
    lastHtml = ''; lastState = '';
    if (SB.game && SB.game.markDirty) SB.game.markDirty();
  }

  /* 把「已追踪」这个状态同步到所有入口按钮上（树节点里的 ★ 与详情面板里的按钮）。
   * 为什么不靠重画面板来同步：树节点在 tech 页，点的是**详情面板**里的按钮 ——
   * 只重画 panes 的话，面板上那颗按钮会一直写着「追踪」；
   * 反过来只重画面板，树上的 ★ 又不会变。两个入口就得有一个共同的收口，
   * 否则「两处都放」立刻变成「两处不同步」。 */
  function syncButtons() {
    var d = doc(); if (!d) return;
    var nodes = d.querySelectorAll('[data-track-toggle]'), i;
    for (i = 0; i < nodes.length; i++) {
      var spec = ((nodes[i].dataset && nodes[i].dataset.trackToggle) || '').split(':');
      if (spec.length < 2) continue;
      var kind = spec[0], on = isTracked(kind, spec.slice(1).join(':'));
      var what = kind === 'tech' ? '尤里卡' : kind === 'civic' ? '鼓舞' : '目标';
      if (nodes[i].classList) nodes[i].classList.toggle('on', on);
      /* 树节点那颗是纯图标（★），详情面板那颗是有字的按钮 —— 只有后者要换文案。 */
      if (nodes[i].dataset && nodes[i].dataset.trackKind === 'btn') {
        nodes[i].textContent = on ? '取消追踪' : '追踪' + what;
      }
      nodes[i].setAttribute('title', (on ? '取消追踪' : '追踪') + what);
    }
  }

  /* 满 4 个时的反馈：小框抖一下。静默失败会让人以为按钮坏了
   * （尤其树节点那颗 ★ 只有 14px，视觉反馈本来就弱）。 */
  function hint() {
    var node = el('trackDock');
    if (!node || !node.classList) return;
    node.classList.remove('is-full');
    /* 强制回流，否则连点两次第二次不会重新播动画 */
    void node.offsetWidth;
    node.classList.add('is-full');
    if (node._tdFullT) clearTimeout(node._tdFullT);
    node._tdFullT = setTimeout(function () {
      if (node.classList) node.classList.remove('is-full');
    }, 480);
  }

  /* 跳到目标所在页并把它滚到视野中央，闪一下高亮。
   * ⚠️ setTab 会触发一次整页重画 ⇒ 旧的 DOM 引用全部失效，必须**重画之后再查**。
   *    所以这里串三次 rAF：切页 → 展开分区 → 滚动。
   * ⚠️ 分区折叠时行节点仍在 DOM 里（只是 .bzbody 被 CSS 隐藏），
   *    所以「先查行、再拿它祖先的分区 id」这条路是可行的，不用另存区名。 */
  function jump(key) {
    var s = run();
    if (!s) return;
    var list = keys(s);
    var use = key || list[0];
    if (!use) return;
    var info = resolve(s, use);
    if (!info) { drop(use); return; }
    var d = doc(); if (!d) return;
    var raf = root.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

    /* 高亮闪烁不能只 `classList.add` 一次完事：巢穴/工坊/奇观的 pane 每 2 秒**整块重画**，
     * 落上去的类会随节点一起消失（实测工坊那条就丢过一次：跳过去了、但没闪）。
     * ⇒ 记「目标选择器 + 截止时间」，由 paint 每次重算时按当前 DOM 补回去。 */
    function markFlash(sel) {
      flashSel = sel; flashUntil = Date.now() + 1400; syncFlash();
    }
    function scrollTo(sel) {
      var node = d.querySelector(sel);
      if (!node) return;
      var row = node.closest('.bld-row') || node.closest('.row') || node;
      if (row.scrollIntoView) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      markFlash(sel);
    }

    if (info.kind === 'bld') {
      if (SB.game && SB.game.setTab) SB.game.setTab('village');
      raf(function () {
        var sel = '#pane-village [data-build="' + info.id + '"]';
        var node = d.querySelector(sel);
        var zone = node && node.closest ? node.closest('.bzone') : null;
        var zid = zone && zone.dataset ? zone.dataset.zone : '';
        if (zid && SB.ui.render && SB.ui.render.isZoneFolded && SB.ui.render.isZoneFolded(zid)) {
          SB.ui.render.toggleZoneFold(zid);
          if (SB.ui.render.renderPanes) SB.ui.render.renderPanes();
        }
        raf(function () { scrollTo(sel); });
      });
      return;
    }
    if (info.kind === 'wonder') {
      if (SB.game && SB.game.setTab) SB.game.setTab('wonder');
      raf(function () { raf(function () { scrollTo('#pane-wonder [data-wonder="' + info.id + '"]'); }); });
      return;
    }
    if (info.kind === 'craft') {
      if (SB.game && SB.game.setTab) SB.game.setTab('workshop');
      /* 工坊有二级标签（制造 / 升级项）。配方只可能在「制造」那一侧，
       * 停在「升级项」时切过去，否则滚到一个不存在的节点、看起来像点了没反应。 */
      if (SB.ui.render && SB.ui.render.setWorkshopView) {
        try { SB.ui.render.setWorkshopView('making'); } catch (e) {}
      }
      if (SB.ui.render && SB.ui.render.renderPanes) SB.ui.render.renderPanes();
      raf(function () { raf(function () { scrollTo('#pane-workshop [data-craft="' + info.id + '"]'); }); });
      return;
    }
    if (info.kind === 'tech' || info.kind === 'civic') {
      /* 科技与市政是**两个独立页签**（`data-tab="tech"` / `data-tab="civic"`），
       * 不是同一页的两个子视图 —— 所以这里分两条，别写成一个 'research'。 */
      if (SB.game && SB.game.setTab) SB.game.setTab(info.kind === 'tech' ? 'tech' : 'civic');
      if (info.kind === 'civic') {
        /* 市政页默认停在「政体」子视图，市政树不在 DOM ⇒ 必须切过去再重画，
         * 否则 querySelector 拿不到 `#civicrow-*`，表现为「点了框没反应」。 */
        var R = SB.ui.renderParts && SB.ui.renderParts.research;
        if (R && R.setCivicView) { try { R.setCivicView('tree'); } catch (e2) {} }
        if (SB.ui.render && SB.ui.render.renderPanes) SB.ui.render.renderPanes();
      }
      var sel2 = (info.kind === 'tech' ? '#techrow-' : '#civicrow-') + info.id;
      raf(function () { raf(function () { scrollTo(sel2); }); });
    }
  }

  /* ── 拖动 / 点击 ─────────────────────────────────────────────
   * 小框是常驻节点 ⇒ 监听可以**直接挂它自己身上**（不会像 pane 里那样被重画冲掉）。
   * 拖与点必须分开：拖动结束时浏览器不会补 click（指针移动过），
   * 但触屏上偶尔会给一个，所以用 justDragged 兜一层。 */
  var drag = null, moved = false, justDragged = false, tappedAt = 0;

  function viewport() {
    return { w: root.innerWidth || 360, h: root.innerHeight || 640 };
  }

  function place(left, top, w, h) {
    var node = el('trackDock'); if (!node) return;
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

  function savePos() {
    var node = el('trackDock'); if (!node || !node.getBoundingClientRect) return;
    var r = node.getBoundingClientRect(), vp = viewport();
    try {
      if (root.localStorage) root.localStorage.setItem(POS_KEY, JSON.stringify({
        fx: r.left / Math.max(1, vp.w), fy: r.top / Math.max(1, vp.h)
      }));
    } catch (e) {}
  }

  function applyPos() {
    var node = el('trackDock'); if (!node) return;
    var raw = null;
    try { if (root.localStorage) raw = root.localStorage.getItem(POS_KEY); } catch (e) {}
    if (!raw) return;                     /* 没存过 ⇒ 用 CSS 默认的左下角 */
    var o; try { o = JSON.parse(raw); } catch (e) { return; }
    if (!o || typeof o.fx !== 'number' || typeof o.fy !== 'number') return;
    var r = node.getBoundingClientRect(), vp = viewport();
    place(o.fx * vp.w, o.fy * vp.h, r.width || 150, r.height || 54);
  }

  /* 一次点按该干什么：× 关一个 / ×× 全清 / 行 → 跳到那一行。 */
  function act(target) {
    var t = target || {};
    var dropEl = t.closest && t.closest('[data-track-drop]');
    if (dropEl) { drop(dropEl.dataset ? dropEl.dataset.trackDrop : ''); return; }
    var clearEl = t.closest && t.closest('[data-track-clear]');
    if (clearEl) { clear(); return; }
    var goEl = t.closest && t.closest('[data-track-go]');
    if (goEl) { jump(goEl.dataset ? goEl.dataset.trackGo : ''); return; }
    jump('');                             /* 点到框的空白处 ⇒ 跳第一个（原单目标行为） */
  }

  function onDown(e) {
    var node = el('trackDock'); if (!node) return;
    if (node.classList && node.classList.contains('hidden')) return;
    /* 「×」不参与拖动：否则想关掉它时手指一抖就变成拖动，点不中关闭。 */
    var t = e.target || {};
    if (t.closest && t.closest('[data-track-clear], [data-track-drop]')) return;
    var r = node.getBoundingClientRect();
    drag = { dx: (e.clientX || 0) - r.left, dy: (e.clientY || 0) - r.top,
      x0: e.clientX || 0, y0: e.clientY || 0, w: r.width, h: r.height };
    moved = false;
    justDragged = false;
    if (node.classList) node.classList.add('is-dragging');
    if (node.setPointerCapture && e.pointerId !== undefined) {
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
    }
    /* ⚠️ 这里**绝不能** e.preventDefault()。
     *   Pointer Events 规范里 pointerdown 被取消 = 置上 PREVENT MOUSE EVENT 标志 ⇒
     *   浏览器随后**不再派发兼容鼠标事件，连 click 一起吞掉**。
     *   代价是「拖动不滚动页面」得靠 CSS 的 touch-action:none（已写），不是靠这里。
     *   （这条是踩出来的：探针里用 .click() 直调所以全绿，真手指点下去会毫无反应。） */
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
    var node = el('trackDock');
    if (node && node.classList) node.classList.remove('is-dragging');
    var wasMoved = moved;
    drag = null; moved = false;
    if (wasMoved) { savePos(); justDragged = true; return; }
    /* 手指在触屏上未必补一个 click（尤其配了 touch-action:none）⇒ 点按在这里就地处理，
     * 再用 tappedAt 把随后可能到来的那次 click 吃掉，避免「跳两次」。 */
    if (e && e.type === 'pointercancel') return;
    tappedAt = Date.now();
    act(e && e.target);
  }

  function bind() {
    var node = el('trackDock');
    if (!node || !node.addEventListener) return;
    if (node.addEventListener) {
      node.addEventListener('pointerdown', onDown);
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onUp);
      node.addEventListener('click', function (e) {
        if (justDragged) { justDragged = false; return; }
        /* pointerup 已经处理过这一次点按（触屏常见）⇒ 吃掉随后补来的 click。
         * 400ms 这个窗口只用于去重，不影响连点（连点也会被 jump 的幂等性吸收）。 */
        if (Date.now() - tappedAt < 400) return;
        act(e.target);
      });
    }
    if (root.addEventListener) {
      /* 转屏 / 缩放后把比例坐标重新落回视口内，否则小框会被顶出屏幕再也摸不到 */
      root.addEventListener('resize', function () { applyPos(); });
    }
    applyPos();
  }

  ui.track = {
    init: bind, paint: paint, track: track, untrack: drop, clear: clear, jump: jump,
    resolve: resolve, costRows: costRows, isTracked: isTracked, keys: keys,
    syncButtons: syncButtons, hint: hint, MAX: MAX
  };
})(typeof window !== 'undefined' ? window : globalThis);
