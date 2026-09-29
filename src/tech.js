/* 天壳 / SHELLBREAK — 科技树玩法层
 *
 * 三件事，与文明6 一一对应：
 *   1. **尤里卡（揭示）** —— 条件达成 ⇒ 节点从「未知」变成「可见」，并把差多少摊开。
 *      ⚠️ 2026-09-26 用户再次确认：**不折算**——不做 Civ6 原版「灵光一闪」白送部分进度那种事。
 *      这是**定案，不是待办**：条件是达成 ⇒ 整项从「未知」变「可研究」，科技该多少还是多少。
 *      ⚠️【2026-09-26 同日补：这条现在真的是门禁了】用户看到截图里「尤里卡写着 0/60，
 *      科技内容却已经亮着、按钮还能点」，指出这不对。于是「达成过」被拆成一本独立的
 *      台账（state.eurekaMet），canStudy 拿它当第四条门禁，渲染也拿它决定亮不亮内容。详见
 *      discover / metOf。**改这两处之前先读它们上面那段注释**——没达成过的科技现在
 *      既看不见名字、也买不了。
 *      以后别把它当成「还没做完的功能」顺着补上（首次拍板见 docs/TECH_TREE_v0.2.md §8，
 *      二次确认见 docs/TECH_TREE_v0.3.md §11）。
 *   2. **研究（投科技）** —— 即时扣费：科技够就点一下立刻掌握（用户拍板，沿用旧手感）。
 *      条件是「已揭示」+「前置科技已掌握」+「本纪元内」。
 *   3. **纪元推进** —— 本纪元关键节点（key）全部掌握 ⇒ 进入下一纪元，
 *      **下一纪元的尤里卡条件此刻才转为可见**。这就是「循环往复」的那道闸门。
 *
 * 奇迹装置（破冰祭坛）锁在纪元五，见 habitat.unlocked 的 era 判定。
 *
 * ⚠️ 尤里卡条件与 requiredTech 不能指向同一件东西（详见 techs.js 里 smelt 那条注释）：
 *    条件指建筑 → 建筑又被锁在该科技后面 ⇒ 永远建不起来，且看起来像「只是慢」。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  function byId(id) {
    var T = SB.TECHS || [];
    for (var i = 0; i < T.length; i++) if (T[i].id === id) return T[i];
    return null;
  }
  function byEra(n) {
    var T = SB.TECHS || [], out = [];
    for (var i = 0; i < T.length; i++) if (T[i].era === n) out.push(T[i]);
    return out;
  }

  /* ══ 树的几何（文明 6 式横卷）═════════════════════════════════════
   * 用户 2026-09-26 两次纠正都指向同一件事：他要的「文明 6 那种科技树」不是
   * 带「第 N 层」小标题的竖排列表 —— 列表里层一和层二读起来是**上下并列**，
   * 玩家看不出先后；文明 6 是把节点摆成 (列, 行) 的横卷，列 = 推进方向，
   * 前置到本项之间画连线，图比视口宽，靠横向滚动看后面的纪元。
   *
   *   x（列）= **数据里的 `layer`**（techs.js 里声明，纪元一是用户指定的四层形状，
   *                其余纪元按 `max(前置的 layer) + 1` 推算）；层号 1 起点，列坐标 0 起点，
   *                换算在 colOf() 里（那个 −1 有它自己的注释，改它之前先读）
   *   y（行）= 由下面 layout() 自动分配：同一列不许撞行，**其余尽量紧凑**
   *            —— 行是排版的产物，不是形状。形状必须落在数据里，只写在注释里的
   *            「层」已经骗过一次人（2026-09-26 那次就是形状只在注释里，面板照旧平铺）。
   *
   * ⚠️ 两个坑：
   *   ① 列基准（eraBase）是按「前一纪元用过的最大列 + 1」**累加**出来的，所以
   *      给任一纪元改 layer，后面所有纪元的位置都会平移 —— 改之前先跑 e2e 的
   *      「几何」一节，它把各纪元的列区间和层号都钉住了。
   *   ② 节点只渲染**已揭示**的。未揭示的节点不上图，于是连线也只在两端都可见时才画，
   *      否则会画出一条指向空气、而空气过一会儿又变成别的节点的线。 */
  /* ⚠️ W/H 是节点卡片的像素尺寸，改它等于改树里所有格子的大小；
   *    COL/ROW 是列/行之间留的空隙。
   *
   *    H 的来历（**真实浏览器量出来的，别凭手感改**）：一张卡最多要装四行 ——
   *      名字 18 + 效果（最多两行）26+2 + 尤里卡条件 14+2 + 进度条 3+3 + 研究按钮 20
   *      + 卡片内边距 4/5  =  99，实测最挤的一张（书写：两行效果 + 进度条）**102px**。
   *    76 那版装不下：`.technode` 是 flex 列 + overflow:hidden，超出的部分不是「溢出可见」，
   *    而是被 flex-shrink **压扁** —— 效果行与条件行拦腰截断，就是用户 2026-09-26 报的
   *    「这里显示不全」。106 = 实测 102 + 4px 余量（不同节点的「关键」标签与字体
   *    亚像素渲染会差一两像素）。改小它，e2e 的「卡片高够装四行」会立刻红。 */
  var GEO = { W: 156, H: 106, COL: 94, ROW: 20, PADX: 46, PADY: 52, ERAPAD: 30 };
  var COL_PITCH = GEO.W + GEO.COL;
  var ROW_PITCH = GEO.H + GEO.ROW;

  /* 列号 = 纪元基准 + 层号 − 1。
   *
   * ⚠️ 那个 **−1 不是笔误**，是两个坐标系的换算：`layer` 是数据里 1 起点的**层号**，
   *    而 `col` 是 0 起点的**画布列坐标**（x = PADX + col × 列距）。
   *    少了它，纪元一的第一列落在 col 1 ⇒ x = 46 + 250 = 296：长卷最左边凭空多出
   *    296px 死区。手机内容宽约 334px（390 视口 − 两级 padding），**整个首屏都落在
   *    死区里**，玩家一进科技页只看得见纪元标题那条线、看不见任何节点，以为树没画出来
   *    —— 这就是 2026-09-26 报的「科技树太靠右了，一开始根本看不到」。
   *    修完最左列 x = PADX = 46，开面板第一眼就是「结绳」。
   *    纪元基准（eraBase）是「前一纪元用满的列数 + 1 当分隔」，与 col 起点无关，不受它影响；
   *    纪元横幅的 left 也用 base，所以横幅和它那一纪元的首列天然对齐（两边都不用改）。 */
  function colOf(t, eraBase) {
    return (eraBase[t.era] || 0) + (t.layer || 1) - 1;
  }

  function layout() {
    var T = SB.TECHS || [];
    var byEra = {}, maxL = {}, e, i, t;
    for (i = 0; i < T.length; i++) {
      t = T[i];
      (byEra[t.era] = byEra[t.era] || []).push(t);
      maxL[t.era] = Math.max(maxL[t.era] || 1, t.layer || 1);
    }
    /* 纪元基准：前一个纪元用满之后空一列当分隔，既是视觉切分也给纪元标题一条轨道。 */
    var eraBase = {}, base = 0, blocks = [];
    for (e = 1; e <= 12; e++) {
      if (!byEra[e]) break;
      eraBase[e] = base;
      blocks.push({ era: e, x0: base, cols: maxL[e], start: base });
      base += maxL[e] + 1;
    }
    /* 行分配：按 (全局列, 声明序) 扫一遍，每列从 0 开始找第一个空行。
     * 于是「同列不撞行、跨列允许对齐」—— 树会排成一条整齐的齿梳状。 */
    var used = {}, order = [], cells = {};
    for (e = 1; e <= 12; e++) {
      if (!byEra[e]) break;
      for (i = 0; i < byEra[e].length; i++) order.push(byEra[e][i]);
    }
    order.sort(function (a, b) {
      var ca = colOf(a, eraBase), cb = colOf(b, eraBase);
      return ca - cb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    for (i = 0; i < order.length; i++) {
      t = order[i];
      var col = colOf(t, eraBase);
      var row = 0;
      while (used[col] && used[col][row]) row++;
      (used[col] = used[col] || {})[row] = true;
      cells[t.id] = {
        id: t.id, era: t.era, layer: t.layer || 1, col: col, row: row,
        x: GEO.PADX + col * COL_PITCH,
        y: GEO.PADY + row * ROW_PITCH
      };
    }
    var maxCol = 0, maxRow = 0;
    for (var k in cells) {
      if (cells[k].col > maxCol) maxCol = cells[k].col;
      if (cells[k].row > maxRow) maxRow = cells[k].row;
    }
    var w = GEO.PADX * 2 + maxCol * COL_PITCH + GEO.W;
    var h = GEO.PADY * 2 + maxRow * ROW_PITCH + GEO.H;

    /* 连线：从前置节点的右腰出发、到本节点的左腰，走一条三次贝塞尔。
     * 两端都必须在 cells 里（数据写错 id 时这里会静默少一条线，于是有断言盯着）。 */
    var edges = [];
    for (i = 0; i < T.length; i++) {
      t = T[i];
      if (!t.reqs || !t.reqs.length) continue;
      var to = cells[t.id];
      if (!to) continue;
      for (var r = 0; r < t.reqs.length; r++) {
        var from = cells[t.reqs[r]];
        if (!from) continue;
        var x1 = from.x + GEO.W, y1 = from.y + GEO.H / 2;
        var x2 = to.x, y2 = to.y + GEO.H / 2;
        var dx = Math.max(40, (x2 - x1) / 2);
        edges.push({
          from: t.reqs[r], to: t.id, done: false,
          d: 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 +
             ' ' + x2 + ' ' + y2
        });
      }
    }
    return {
      geo: GEO, w: w, h: h, cells: cells, edges: edges, blocks: blocks,
      colOf: function (id) { return cells[id] ? cells[id].col : -1; },
      rowOf: function (id) { return cells[id] ? cells[id].row : -1; }
    };
  }

  /* 某个纪元在长卷里的锚点 x —— 点纪元按钮时把横向滚动落在这里。
   *
   * ⚠️ 值是 `start × 列距`，**不是**纪元横幅的 left（那还要 + PADX）。差别就是这一下：
   *    横滚的目标是**画布坐标 − 视口左内边距**，于是滚过去之后纪元横幅恰好落在
   *    x = PADX 处 —— 与「长卷最左边没有死区」是同一条边距。纪元一的锚点因此是 0，
   *    也就是「点纪元一 = 回到开面板时的位置」，不需要为它写特例。
   * ⚠️ 用 blocks 的基准列而不是「该纪元节点的最小列」：纪元基准是累加算出来的，
   *    和树顶那条轨道同源；取节点最小列会在「某纪元第一个节点的 layer 不是 1」时错位。 */
  function eraAnchorX(era) {
    var L = layout();
    for (var i = 0; i < L.blocks.length; i++) {
      if (L.blocks[i].era === era) return L.blocks[i].start * COL_PITCH;
    }
    return 0;
  }

  // ── 尤里卡条件判定 ────────────────────────────────────────────────
  function condMet(s, c) {
    if (!c) return true;
    var i, n;
    switch (c.t) {
      case 'default': return true;
      case 'built': return (s.lvl[c.b] || 0) >= c.n;
      case 'total':
        n = 0;
        for (var k in s.lvl) n += s.lvl[k];
        return n >= c.n;
      case 'res': return s.res[c.r] >= c.n;
      case 'gathered': return (s.got && s.got[c.r] || 0) >= c.n;
      case 'rate':
        /* rates() 不算便宜（要跑一遍完整算式），判定与文案共用同一次结果，
         * 免得每帧重复算两遍还可能算出两个不同的数。 */
        if (!SB.economy || !SB.economy.rates) return false;
        return (SB.economy.rates(s)[c.r] || 0) >= c.n;
      case 'pop': return s.pop >= c.n;
      case 'job': return (s.jobs[c.j] || 0) >= c.n;
      case 'techs': return techCount(s) >= c.n;
      /* `tech` —— **是否已掌握某一项具体科技**（2026-09-27 为市政的鼓舞条件新加）。
       * ⚠️ 为什么不加在 `techs`（那是「已掌握多少个」的计数）：市政《神秘主义》的
       *    鼓舞要求原话是「完成科技海潮占卜」，指向**那一项**，不是「总数 ≥ N」。
       *    用计数表达会把「随便学够 N 项」当成达成，玩家永远读不懂自己差什么。 */
      case 'tech': return !!(s.techs && s.techs[c.id]);
      /* `wonder` —— **已经建成几座奇观**（2026-09-28 市政《戏剧与诗歌》的尤里卡条件）。
       * ⚠️ 走 `SB.wonder.count` 而不是直接读 `s.wonders`：wonder.js 的纪律③要求
       *    「效果只从 wonder.js 出」，尤里卡虽然不是效果，但同样不该在别处冒出
       *    第二个 s.wonders 读取点——那条纪律就是为了防止「加了奇观忘了接线」。 */
      case 'wonder': {
        var wc = (SB.wonder && SB.wonder.count) ? SB.wonder.count(s) : 0;
        return wc >= c.n;
      }
      case 'coef': return SB.shell.breakCoef(s) >= c.n;
      case 'eraTechs': return eraTechCount(s, c.era) >= c.n;
      /* `tools` —— **买齐一组指定工具**（2026-09-29 ERA3 学徒制尤里卡）。
       * ⚠️ 查的是 `s.tools[id]`（工坊买断后置真），与 toolMul 同源：工具买了才生效。
       *   ids 是数组，全部为真才算达成（「买齐三件铁制工具」）。 */
      case 'tools': {
        var _ids = c.ids || [], _k;
        for (_k = 0; _k < _ids.length; _k++) if (!(s.tools && s.tools[_ids[_k]])) return false;
        return true;
      }
      /* `gov` —— **启用指定槽位档的政体**（2026-09-29 ERA3 城堡尤里卡）。
       * ⚠️ 比的是政体槽位数（slots.wild），排除酋邦制 tribe 的 1 槽；
       *   三槽政体 = autocracy / oligarchy / classical_republic（civics.js GOVS）。 */
      case 'gov': {
        var _g = (SB.civic && SB.civic.govById) ? SB.civic.govById(s.gov) : null;
        return !!(s.gov && _g && _g.slots && (_g.slots.wild || 0) >= (c.wild || 3));
      }
      /* `upgrade` —— **已安装某件工坊升级**（2026-09-29 ERA3 金属精炼尤里卡）。
       * ⚠️ 查 `s.upgrades[id]`（workshop.upgradeBuy 置真）；与 unlockBuild 不同，
       *   这条指向工坊制品而非建筑，避免「尤里卡查自己解锁的建筑」那种死锁。 */
      case 'upgrade': return !!(s.upgrades && s.upgrades[c.id]);
      default: return false;
    }
  }

  // 给 UI 用的「还差多少」文案。返回 null 表示已达成。
  function condShort(s, c) {
    if (!c || c.t === 'default') return null;
    var now, n, k;
    switch (c.t) {
      case 'built': now = s.lvl[c.b] || 0;
        return { txt: '建成 ' + bName(c.b) + ' ' + now + ' / ' + c.n, now: now, need: c.n };
      case 'total':
        n = 0; for (k in s.lvl) n += s.lvl[k];
        return { txt: '建筑总级数 ' + n + ' / ' + c.n, now: n, need: c.n };
      case 'res': return { txt: '存量 ' + resName(c.r) + ' ' + Math.floor(s.res[c.r]) + ' / ' + c.n,
        now: Math.floor(s.res[c.r]), need: c.n };
      case 'gathered': return { txt: '累计产出 ' + resName(c.r) + ' ' + Math.floor(s.got && s.got[c.r] || 0) + ' / ' + c.n,
        now: Math.floor(s.got && s.got[c.r] || 0), need: c.n };
      case 'rate': {
        var r = (SB.economy && SB.economy.rates) ? (SB.economy.rates(s)[c.r] || 0) : 0;
        return { txt: resName(c.r) + ' 产出 ' + r.toFixed(2) + ' / 秒 · 需 ' + c.n, now: r, need: c.n };
      }
      case 'pop': return { txt: '人口 ' + s.pop + ' / ' + c.n, now: s.pop, need: c.n };
      case 'job': return { txt: '匠人 ' + (s.jobs[c.j] || 0) + ' 人 / ' + c.n, now: s.jobs[c.j] || 0, need: c.n };
      case 'techs': return { txt: '已掌握科技 ' + techCount(s) + ' / ' + c.n, now: techCount(s), need: c.n };
      case 'tech': return { txt: '掌握科技「' + byId(c.id).name + '」', now: (s.techs && s.techs[c.id]) ? 1 : 0, need: 1 };
      case 'wonder': {
        var wonderN = (SB.wonder && SB.wonder.count) ? SB.wonder.count(s) : 0;
        return { txt: '已建成奇观 ' + wonderN + ' / ' + c.n, now: wonderN, need: c.n };
      }
      case 'coef': {
        var cf = SB.shell.breakCoef(s);
        return { txt: '破壳系数 ' + cf.toFixed(1) + ' / ' + c.n, now: cf, need: c.n };
      }
      case 'eraTechs': return { txt: eraName(c.era) + '科技 ' + eraTechCount(s, c.era) + ' / ' + c.n,
        now: eraTechCount(s, c.era), need: c.n };
      /* 三类新尤里卡（2026-09-29）的「还差多少」文案，与 condMet 同口径。 */
      case 'tools': {
        var _ids2 = c.ids || [], _miss = 0;
        for (var _m = 0; _m < _ids2.length; _m++) if (!(s.tools && s.tools[_ids2[_m]])) _miss++;
        return { txt: '买齐铁制工具（缺 ' + _miss + ' 件）', now: _ids2.length - _miss, need: _ids2.length };
      }
      case 'gov': {
        var _g2 = (SB.civic && SB.civic.govById) ? SB.civic.govById(s.gov) : null;
        var _ok = !!(s.gov && _g2 && _g2.slots && (_g2.slots.wild || 0) >= (c.wild || 3));
        return { txt: _ok ? '已启用三槽政体' : '需启用三槽政体（独裁/寡头/古典共和）', now: _ok ? 1 : 0, need: 1 };
      }
      case 'upgrade': {
        var _up = !!(s.upgrades && s.upgrades[c.id]);
        return { txt: '完成工坊升级「' + c.id + '」', now: _up ? 1 : 0, need: 1 };
      }
    }
    return null;
  }

  function bName(id) {
    for (var i = 0; SB.BUILDINGS && i < SB.BUILDINGS.length; i++)
      if (SB.BUILDINGS[i].id === id) return SB.BUILDINGS[i].name;
    return id;
  }
  function resName(id) { return SB.RESS && SB.RESS[id] ? SB.RESS[id].name : id; }
  function eraName(n) {
    var E = SB.ERAS || [];
    for (var i = 0; i < E.length; i++) if (E[i].id === n) return E[i].name;
    return n + ' 纪元';
  }

  function techCount(s) {
    var n = 0;
    for (var k in s.techs) if (s.techs[k]) n++;
    return n;
  }
  function eraTechCount(s, era) {
    var n = 0, T = SB.TECHS || [];
    for (var i = 0; i < T.length; i++)
      if (T[i].era === era && s.techs[T[i].id]) n++;
    return n;
  }

  /* 揭示扫描。只扫「本纪元及更早」的科技：进入下一纪元才把下一纪元的条件转可见，
   * 这正是用户要的「显示下一个纪元的尤里卡条件」。
   * 返回本次新揭示的 id 列表（供播报，通常 0-2 个）。
   *
   * ⚠️【2026-09-26 一趟管两件事，**不许再合成一件事**】本函数现在同时记两本账：
   *   ① `eurekaMet` —— 尤里卡**达成过**的台账。达成一次就永久记着。
   *      为什么必须永久：rate 类条件（「科技产出 1/秒」这种）会随人力调走而回落，
   *      而用户的原话是「达到过**一次**就直接显示科技内容」。
   *      它现在是渲染（亮不亮出科技名称/效果）与 canStudy（能不能研究）的唯一判据。
   *   ② `eureka` —— 首次达成的**时机**，只用来决定「这一趟要不要播报」。
   *   过去这两件事由同一个键兼任，于是「已揭示」被 revealEra 在进纪元时整批刷成真，
   *   玩家看到的就是「条件写着 0/60，科技内容却已经摊在面前」——
   *   那正是用户 2026-09-26 截图里指出来的那个问题。 */
  function discover(s) {
    if (!s.eureka) s.eureka = {};
    if (!s.eurekaMet) s.eurekaMet = {};
    var T = SB.TECHS || [], got = [];
    for (var i = 0; i < T.length; i++) {
      var t = T[i];
      if (t.era > (s.era || 1)) continue;
      /* 已记过账的节点不必再算 cond：rate 类条件要跑一趟完整 rates() 算式，
       * 而本函数每秒（外加每次玩家动作后）都要跑，能省则省。 */
      if (!s.eurekaMet[t.id] && !condMet(s, t.cond)) continue;
      s.eurekaMet[t.id] = 1;                       // 台账：达成过就永久记着
      if (s.techs[t.id] || s.eureka[t.id]) continue;   // 已揭示/已掌握：不重复播报
      s.eureka[t.id] = 1;
      /* 免费项揭示即掌握。必须是「揭示 → 掌握」同时发生：
       * 结绳的 cost 是 0，而 canStudy 对 cost 为 0 的项直接返回 false
       * （`!t.cost` 那条守卫本意是挡「无成本项白送」，零成本科技同样被挡），
       * 于是它永远研究不了；可 scholarT 又拿它当 reqs，整条求知线断掉。 */
      if (t.free) s.techs[t.id] = true;
      got.push(t);
    }
    return got;
  }

  /* 「尤里卡达成过」——渲染与 canStudy 共用的**唯一判据**。
   * 三档取或，每一档都有它非有不可的理由：
   *   ① 已掌握即铁证 —— 研究出来的科技必须看得见名字。老档尤其会走到这一格：
   *      它们是在这道门禁存在之前研究掉的，台账里可能一条都没有；
   *      漏了这一档，卡片会写「未揭露的科技」而右上角挂着「已掌握」，自相矛盾。
   *   ② 历史台账 eurekaMet —— rate 类条件会回落，但「达成过」不该被撤回。
   *   ③ 现算 condMet —— 台账由 discover 按秒补记，这一档让面板不必慢半拍。 */
  function metOf(s, t) {
    if (!s || !t) return false;
    if (s.techs[t.id]) return true;
    if (s.eurekaMet && s.eurekaMet[t.id]) return true;
    return condMet(s, t.cond);
  }

  function isRevealed(s, id) { return !!s.eureka && !!s.eureka[id]; }

  /* 免费项（目前只有结绳）的「揭示即掌握」，**独立于揭示扫描单独跑一遍**。
   *
   * 为什么不能只在 discover 的揭示分支里顺手置位：revealEra 也会把节点标记为已揭示
   * （进新纪元、读档迁移时都跑它），而它压根不走 discover 的分支。于是会出现
   * 「结绳已揭示、cond 也早已达成，就是不掌握」——学者职业永远解锁不了，
   * 科技这条产线从根上断掉，而且看起来只是「科技卡住了」。
   * 这一遍只认 cond 本身，谁揭示的、揭示了几回都不影响结果，所以是幂等的。 */
  function settleFree(s) {
    if (!s || !s.eureka) return 0;
    var T = SB.TECHS || [], n = 0;
    for (var i = 0; i < T.length; i++) {
      var t = T[i];
      if (!t.free || s.techs[t.id] || !s.eureka[t.id]) continue;
      if (condMet(s, t.cond)) { s.techs[t.id] = true; n++; }
    }
    return n;
  }

  /* ── 科研面板的开门（纪元一的开场，docs/TECH_TREE_v0.3.md §2.1）──
   * 门槛就是结绳的尤里卡条件本身（`built kelp n=5`），**读同一份数据不另算一遍**：
   * 若 UI 里另写一个「建了 5 座藻田」，改 cond 时就会漏改，于是出现
   * 「面板没开但 Tab 已亮」或「Tab 亮着但面板空着」这类看起来像 bug 的错位。
   * 树上没有结绳这个节点时一律放行——别把整棵树锁死在一个不存在的 id 上。 */
  function panelOpen(s) {
    var w = byId('writing');
    if (!w || !s) return true;
    return condMet(s, w.cond);
  }
  /* 开门时刻的叙事弹窗只播一次。状态本身是派生的（panelOpen），但「播过」必须记账：
   * 离线补算、重开周目、读档都会再次跨过第 5 座藻场这个阈值，靠派生值判断就会重播。 */
  function popupSeen(s) { return !!(s && s.techPopup); }
  function markPopupSeen(s) { if (s) s.techPopup = true; }

  /* 把某个纪元的科技整批转为「已揭示」——**进入纪元时的默认态**。
   *
   * 为什么必须这样：尤里卡揭示是「状态驱动」的（建成 X 才现身），而新纪元的
   * 条件几乎都是「再建一座 / 再攒一点」的增量。若进纪元时该纪元一项都不揭示，
   * 玩家看到的是一整页问号，而用户要的是「显示下一个纪元的尤里卡条件」——
   * 那句话的前提是**看得见**，条件达不达成是另一回事。
   *
   * 已达成条件的部分下一次 pump 的 discover() 会顺手掌握免费项；
   * 其余的在面板上明码标价：条件是什么、还差多少，全摊开。 */
  function revealEra(s, era, allBefore) {
    if (!s.eureka) s.eureka = {};
    var T = SB.TECHS || [], n = 0;
    for (var i = 0; i < T.length; i++) {
      var t = T[i];
      /* allBefore：连它之前那些「尤里卡没达成过」的节点一起转可见。
       * 不做这一步会把玩家永久锁死——canStudy 要求已揭示，
       * 而过去纪元的节点再也不会有新条件来触发揭示。
       * 例：纪元晋级时从未建过礁口巢，礁石术就永远藏在暗处，玩家只能干看着。
       * 已过去的纪元对玩家没有悬念，摊开比藏着好。 */
      if (t.era === era || (allBefore && t.era < era)) {
        if (!s.techs[t.id] && !s.eureka[t.id]) { s.eureka[t.id] = 1; n++; }
      }
    }
    return n;
  }
  function reqsMet(s, t) {
    if (!t.reqs) return true;
    for (var i = 0; i < t.reqs.length; i++) if (!s.techs[t.reqs[i]]) return false;
    return true;
  }
  function known(s, id) { return !!s.techs[id]; }

  /* 能否研究。四条门禁缺一不可：已揭示 / 本纪元内 / 尤里卡达成过 / 前置已掌握。 */
  function canStudy(s, id) {
    var t = byId(id);
    if (!t || !t.cost) return false;
    if (s.techs[id] || !isRevealed(s, id)) return false;
    if (t.era > (s.era || 1)) return false;      // 纪元闸门：不能跳纪元偷研究
    /* 尤里卡门禁（2026-09-26 用户拍板「灰掉，必须先达成尤里卡」）。
     * 它才是本文件顶部那条设计（条件达成 ⇒ 整项从「不可研究」变「可研究」）的**真正落实**：
     * 在此之前那只是纸面条款 —— revealEra 会在进纪元时把整批节点刷成「已揭示」，
     * 于是条件没达成的科技照样买得到。 */
    if (!metOf(s, t)) return false;
    if (!reqsMet(s, t)) return false;
    return SB.economy.enough(s.res.science, t.cost);
  }
  function studyBlocked(s, id) {
    var t = byId(id);
    if (!t) return null;
    if (s.techs[id]) return '已掌握';
    if (!isRevealed(s, id)) return '尚未揭示——先达成尤里卡条件';
    if (t.era > (s.era || 1)) return '属于 ' + eraName(t.era) + '，先推进当前纪元';
    /* 文案要指得出**该做什么**，不能只说「不行」：这句话会挂成灰按钮的 title，
     * 而卡片上条件行还写着进度，两者合起来才是完整的一句「你还差什么」。 */
    if (!metOf(s, t)) return '尤里卡未达成——达成条件后才能研究';
    if (!reqsMet(s, t)) return '需先掌握：' + t.reqs.map(function (r) { return byId(r).name; }).join('、');
    if (!SB.economy.enough(s.res.science, t.cost)) return '科技 ' + Math.floor(s.res.science) + ' / ' + t.cost;
    return null;
  }

  /* 即时扣费研究（用户拍板）。返回 true 表示本次真的掌握。 */
  function study(s, id, emit) {
    if (!canStudy(s, id)) return false;
    var t = byId(id);
    s.res.science -= t.cost;
    s.techs[id] = true;
    if (emit) emit('研究完成：' + t.name + '（' + effectText(t) + '）');
    return true;
  }

  /* 与 mul() 的加区/乘区划分**必须是同一份名单**。
   * 之前 effectText 把所有 eff 键都按乘区打印，于是「藻食上限 +200」显示成
   * 「×201」——玩家照着读会以为这是个 201 倍乘区，实际是 +200 的仓储上限。 */
  /* ⚠️ `warm`（抗寒上限）已从这张名单里删掉（2026-09-26）：它最后一个生产者是
   *    纪元一层四的「保温法」，而用户规格里给保温法的兑现物是**暖石开关**，没有抗寒。
   *    保温法那项也就随之改成「没有 eff」——抗寒上限现在只剩建筑侧（保温巢/热泉炉等级）。
   * ⚠️ 删的时候必须同时改 economy.warmCap：那里读的是 T.warm，而 m.warm 没了之后
   *    T.warm 是 undefined，`数字 + undefined = NaN` ⇒ warmCap NaN ⇒ 顺着冰封风险
   *    污染整条结算链。这类「乘法表里的键删了、读的人没改」的断链不报任何错。
   * ⚠️ 2026-09-26 后续：冻伤出口又换了一次轴——从建筑侧（lvl.hearth，随骨材线一并删除）
   *    换成**消耗品侧**（economy 内部的 warmBurningNow：这一瞬间暖石在不在烧）。
   *    所以 warmCap 与这张乘区表**再无关系**，在本表加减任何键都不会再影响冻伤；
   *    反过来，以后想调冻伤要改 CFG.WARM_FREEZE_CAP，别来这里找。 */
  /* ⚠️ ADD 这张名单是**唯一真源**：`mul()` 判断某个键是加区还是乘区时读的也是它
   *    （2026-09-28 起），effectText 的加法档判定也是它。之前 mul() 里另写了一份
   *    硬编码的键名列表 —— 两份名单各说一套时会出现「面板按加法显示、结算按乘法算」
   *    这种对不上的情况。⇒ **加一个加区键只改这里一处**，mul 的默认表另加。
   * ⚠️ `craftRatio`（工艺制作效率）2026-09-28 加入，生产者是 era2 第三层的「构架术」。
   *    它与 `craft`（加工产出 / 烟囱炉 +15%、壳铸 +30%）**不是同一个东西**：
   *    前者进 workshop.craftRatio（工坊造石梁那条线），后者进 economy 的精铁线。
   *    名字都带 craft，是本项目最容易误接的一对。 */
  var ADD = { coef: 1, house: 1, kelpCap: 1, season: 1, craftRatio: 1 };
  var LABEL = {
    gather: '采集产出', food: '藻食产出', sci: '科技产出', craft: '加工产出',
    fuel: '地热产出', smelt: '金属→精铁', miracle: '祭坛削壳',
    farm: '采集者藻食产出', coef: '破壳系数',
    house: '人口上限', kelpCap: '藻食上限', craftRatio: '工艺制作效率'
  };
  function effectText(t) {
    var e = t.eff || {}, out = [], k;
    for (k in e) {
      var nm = LABEL[k] || k, v = e[k];
      if (k === 'unlockBuild') out.push('解锁建筑 ' + e[k].map(bName).join('、'));
      else if (k === 'unlockJob') out.push('解锁职业 ' + e[k].map(jobName).join('、'));
      else if (k === 'season') out.push('季节减产收窄 ' + Math.round(v * 100) + '%');
      else if (ADD[k]) out.push(nm + ' +' + v);
      else out.push(nm + ' ×' + (1 + v));
    }
    return out.join('，') || '（无直接效果）';
  }

  // ── 纪元推进 ─────────────────────────────────────────────────────
  function keysOf(era) {
    var T = byEra(era), out = [];
    for (var i = 0; i < T.length; i++) if (T[i].key) out.push(T[i]);
    return out;
  }
  function eraProgress(s) {
    var era = s.era || 1, ks = keysOf(era), done = 0;
    for (var i = 0; i < ks.length; i++) if (s.techs[ks[i].id]) done++;
    return { era: era, keysDone: done, keysTotal: ks.length, done: done >= ks.length };
  }
  /* 关键节点全清 ⇒ 进入下一纪元。返回被推进到的新纪元 id，未推进返回 0。 */
  function advanceEra(s, emit) {
    var p = eraProgress(s), E = SB.ERAS || [];
    /* E 按 id 顺序排列，下标 = id − 1，所以「下一个纪元」的下标就是当前 id。
     * 取 E[p.era - 1] 会拿回当前纪元自己，把 s.era 原地不动地写回去。 */
    /* 三重判据，顺序不能反：
     *   ----------------------------
     *   p.done  true ⇒ 推进。它**就是**触发条件，这里绝不能当成「不能推进」而 return——
     *     2026-09-25 就写反过这一条（`if (!s || p.done ...) return 0`），
     *     结果 key 全清后 s.era 永远原地不动，游戏停在纪元一，看起来像「科技加了个寂寞」。
     *   p.era >= E.length ⇒ 已是最后一纪元，没有下一站。
     *   ！p.done ⇒ 没清完，还没到推进的时候。 */
    if (!s || p.era >= E.length || !p.done) return 0;
    var next = E[p.era];
    if (!next || next.id !== p.era + 1) return 0;
    s.era = next.id;
    revealEra(s, next.id, true);
    /* 下一纪元的揭示不只是「把闸门打开」：这一批节点此刻就转可见（见 revealEra）。
     * 那些条件恰好已经达成的，下一次 pump 的 discover() 会立刻补上掌握。 */
    if (emit) emit('—— ' + next.name + '（' + next.motto + '）——' + next.desc);
    return next.id;
  }

  /* 科技泵：揭示 →（若关键节点全清）推进纪元。
   * 这是游戏中唯一该调科技层的地方：
   *   ① 每帧的循环   → 按秒节流调用（cond 里有 rate 类，跑一次不便宜）
   *   ② 玩家动作后   → 建造/研究/雇佣立刻补一次（built/total/job 类条件靠动作改变）
   * 拆成两个函数是为了让 UI 能只问「还差什么」而不触发推进。返回揭示条数，供播报判断。 */
  function pump(s, emit) {
    if (!s || !SB.tech) return 0;
    var got = discover(s), i;
    /* 播报的**时机**（用户 2026-09-26：「尤里卡等解锁科技之后一起展示」）：
     * 科技页解锁（popupSeen）之前一条都不写 —— 那段时间玩家手里还没有科技页，
     * 「尤里卡：凿珊瑚 已达成」不指向任何他能看见的东西，纯噪声。
     * 攒下的那些由 flushEureka 在开门那一刻一次性摊开（见 game.js 的 maybeSciencePopup）。
     * ⚠️ 只管播报：discover 照常揭示，面板一开该亮的都是亮的。 */
    if (emit && popupSeen(s)) {
      for (i = 0; i < got.length; i++) emit(eurekaLine(got[i]));
    }
    settleFree(s);          // 揭示路径不止 discover 一条，见那个函数上方的注释
    if (eraProgress(s).done) advanceEra(s, emit);
    return got.length;
  }

  /* 一条尤里卡播报的文案。
   * ⚠️ 默认条件（`{t:'default'}`，开局即揭示的那几项）没有「条件」可报，
   *    原先的拼法照样接一个破折号 ⇒ 打出「尤里卡：凿珊瑚 ——  已达成」这种半个句子
   *    （condText 对 default 返回空串，破折号后面就空了）。没有条件就别留那个破折号。 */
  function eurekaLine(t) {
    var c = condText(t.cond);
    return '尤里卡：' + t.name + (c ? ' —— ' + c + ' 已达成' : ' 已达成');
  }

  /* 开门那一刻把「已揭示」的整批摊开（用户要的「一起展示」）。
   * 按 SB.TECHS 原序（纪元 → 层）遍历，所以日志读起来是从早到晚那一条线，不是乱序。
   * 幂等性由**调用方**保证：只有 maybeSciencePopup 会调它，而那个入口被 s.techPopup 挡着
   * （老档迁移时 techPopup 直接记 true ⇒ 不会给玩了几小时的存档倒一屏尤里卡）。 */
  function flushEureka(s, emit) {
    if (!s) return 0;
    var T = SB.TECHS || [], n = 0;
    for (var i = 0; i < T.length; i++) {
      var t = T[i];
      if (t.era > (s.era || 1)) continue;      // 未来纪元的不报：它们此刻还没转可见
      if (!isRevealed(s, t.id)) continue;
      if (emit) emit(eurekaLine(t));
      n++;
    }
    return n;
  }

  /* 尤里卡条件的纯文案——**不碰状态**（不读 s，也不调 rates()）。
   * 播报是在游戏循环里同步发的，那里拿不到一个「稳定可读」的状态快照，
   * 让 condText 去读 s 只会把 UI 那套惰性求值带回循环里。 */
  function condText(c) {
    if (!c || c.t === 'default') return '';
    switch (c.t) {
      case 'built': return '建成 ' + bName(c.b) + ' ×' + c.n;
      case 'total': return '建筑总级数 ' + c.n;
      case 'res': return resName(c.r) + ' 存量 ' + c.n;
      case 'gathered': return '累计产出 ' + resName(c.r) + ' ' + c.n;
      case 'rate': return resName(c.r) + ' 产出 ' + c.n + '/秒';
      case 'pop': return '人口 ' + c.n;
      case 'job': return jobName(c.j) + ' ' + c.n + ' 人';
      case 'techs': return '已掌握科技 ' + c.n + ' 项';
      case 'coef': return '破壳系数 ' + c.n;
      case 'eraTechs': return eraName(c.era) + '科技 ' + c.n + ' 项';
    }
    return '';
  }
  function jobName(id) {
    for (var i = 0; SB.JOBS && i < SB.JOBS.length; i++) if (SB.JOBS[i].id === id) return SB.JOBS[i].name;
    return id;
  }

  // ── 闭合效果词表 ─────────────────────────────────────────────────
  /* ⚠️ 唯一出口。economy.js / shell.js 一律读这里，不再各自散读 s.techs.X：
   *   散读的坏处是「加了科技但忘了接线」——研究完什么都没发生，还查不出来。
   * 乘区默认 1、加区默认 0，未掌握的键就默认等价于「无效果」。 */
  function mul(s) {
    var T = SB.TECHS || [], m = {
      gather: 1, food: 1, sci: 1, craft: 1, fuel: 1, smelt: 1, miracle: 1,
      /* farm ——「种植」的藻食产出乘区（默认 1，种植给 +50%）。
       * 它**只作用于职业侧**（economy.foodRate 的 byJob），不碰建筑侧的藻场：
       * 「采集者变成农民」说的是那个人变能干了，不是那片藻田变能干了。
       * 与 food 的区别：food 是全局食物乘区（会连藻场一起放大），farm 只管采集者。 */
      farm: 1,
      coef: 0, house: 0, kelpCap: 0, season: 0, craftRatio: 0
    };
    for (var i = 0; i < T.length; i++) {
      var t = T[i], e = t.eff;
      if (!e || !s.techs[t.id]) continue;
      for (var k in e) {
        if (m[k] === undefined) continue;          // 未知键：忽略，不偷偷生效
        /* ⚠️ 加区/乘区看 ADD 而不是在这里重抄一份键名 —— 两份名单会走偏（见 ADD 那条注）。
         * ⚠️ 只在**默认表里**补 craftRatio 是不够的：这个 `m[k] === undefined` 的守卫
         *    是「未知键静默忽略」的闸门，漏补默认表 ⇒ 构架术研究完 craftRatio 恒为 0，
         *    工坊效率纹丝不动，且不报任何错。默认表与 ADD 要同时改。 */
        m[k] = ADD[k] ? m[k] + e[k] : m[k] * (1 + e[k]);
      }
    }
    return m;
  }

  SB.tech = {
    byId: byId, byEra: byEra, condMet: condMet, condShort: condShort,
    discover: discover, isRevealed: isRevealed, revealEra: revealEra, settleFree: settleFree,
    metOf: metOf,
    metOf: metOf,
    panelOpen: panelOpen, popupSeen: popupSeen, markPopupSeen: markPopupSeen,
    reqsMet: reqsMet, known: known,
    canStudy: canStudy, study: study, studyBlocked: studyBlocked, effectText: effectText,
    keysOf: keysOf, eraProgress: eraProgress, advanceEra: advanceEra, pump: pump,
    eurekaLine: eurekaLine, flushEureka: flushEureka,
    mul: mul, techCount: techCount, eraTechCount: eraTechCount,
    layout: layout, geo: GEO, pitch: { col: COL_PITCH, row: ROW_PITCH }, eraAnchorX: eraAnchorX,
    bName: bName, resName: resName, eraName: eraName, jobName: jobName, condText: condText
  };
})(typeof window !== 'undefined' ? window : globalThis);
