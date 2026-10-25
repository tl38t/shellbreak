/* 天壳 / SHELLBREAK — 科技与市政研究面板。Classic script component; view state stays ephemeral. */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  function res() { return SB.game.run(); }
  var techViewEra = 0;
  var civicViewEra = 0, civicEraChosen = false;
  function eraOf(n) {
    var E = SB.ERAS || [];
    for (var i = 0; i < E.length; i++) if (E[i].id === n) return E[i];
    return { id: n, name: n + ' 纪元', motto: '', color: '#6FE3D2', desc: '' };
  }
  /* ── 科技树本体（文明 6 式横卷）─────────────────────────────────────
   * 【为什么不是「第 N 层」小标题的竖排列表】用户 2026-09-26 明确纠正过两次：
   *   竖排列表里层一和层二读起来是**上下并列**，玩家看不出先后；文明 6 是把节点
   *   摆成 (列, 行) 的横卷，列 = 推进方向，跨列画连线，图比视口宽、横向滚动看后面。
   *   上一轮做成带「第 N 层」标题的分桶列表，被驳回 —— 它仍然是个列表。
   *
   * 【几何来自 tech.layout()，这里一行算术都不自己算】列号在 techs.js 里声明，
   *   行号是排版的产物。渲染只读 `data-x/data-y`，不重算 —— 重算就等于有两份真相，
   *   改了数据那边、这边还按旧公式摆，树会自己长歪。
   *
   * ⚠️ 未揭示的节点不上图（isRevealed 是尤里卡条件的可见性）⇒ 连线只在**两端都可见**
   *   时才画。否则会画出一条指向空气、而空气过一会儿又变成别的节点的线。
   * ⚠️ 节点宽度/高度走内联 style 而不是写死在 CSS 里：尺寸是几何的一部分，
   *   它和 PITCH 必须一起改，分开写在两个文件里迟早对不上。 */
  function techTree(s) {
    if (!SB.tech || !SB.tech.layout) return '<div class="note">科技树几何尚未加载。</div>';
    var L = SB.tech.layout(), G = L.geo, CP = SB.tech.pitch.col;
    var era = s.era || 1, T = SB.TECHS || [], i, b;

    var h = '<div class="techscroll tree-tech" id="techScroll"><div class="techcanvas"' +
      ' style="width:' + L.w + 'px;height:' + L.h + 'px">';

    /* ── 纪元轨道（横幅，钉在树顶当刻度）── */
    for (b = 0; b < L.blocks.length; b++) {
      var blk = L.blocks[b], er = eraOf(blk.era);
      var bx = G.PADX + blk.offset, bw = blk.cols * CP - G.COL;
      h += '<div class="tnband' + (blk.era === era ? ' on' : '') +
        '" style="left:' + bx + 'px;width:' + bw + 'px;color:' +
        (blk.era < era ? '#5b6b80' : er.color) + '">' +
        '<span class="tng">' + (er.glyph || '') + '</span>' + er.name +
        '<span class="tnc">' + blk.cols + ' 列</span></div>';
    }

    /* ── 连线：一层 SVG 压在节点底下 ── */
    h += '<svg class="techlines" width="' + L.w + '" height="' + L.h + '">' ;
    for (i = 0; i < L.edges.length; i++) {
      var e = L.edges[i], a = e.from, c = e.to;
      var ta = byIdOf(T, a), tc = byIdOf(T, c);
      if (!ta || !tc) continue;
      var va = visOf(s, ta, era), vb = visOf(s, tc, era);
      if (!va || !vb) continue;
      var cls = 'tel' + (s.techs[a] && s.techs[c] ? ' done' :
        (s.techs[a] ? ' open' : ''));
      h += '<path class="' + cls + '" d="' + e.d + '"></path>';
    }
    h += '</svg>';

    /* ── 节点 ── */
    for (i = 0; i < T.length; i++) {
      var t = T[i], cell = L.cells[t.id];
      if (!cell) continue;
      if (!visOf(s, t, era)) continue;              // 未揭示的不上图
      h += techNode(s, t, cell, G.W, G.H, G);
    }

    h += '</div></div>';
    return h;
  }

  function byIdOf(T, id) {
    for (var i = 0; i < T.length; i++) if (T[i].id === id) return T[i];
    return null;
  }

  /* 可见性 = 「这个节点在图上有位置」。判据只有一条：**当前纪元与更早的纪元全部上图**，
   * 未来纪元不上图（那纪元的悬念留到抵达时）。
   *
   * ⚠️ 2026-09-26 改：原判据里还有一条 `SB.tech.isRevealed`，于是「可见」与「亮出内容」
   *    被绑成同一件事 —— 进新纪元时 revealEra 把整批节点刷成已揭示，玩家看到的就是
   *    「尤里卡写着 0/60、科技名称与效果却已经摊在面前」（用户截图里报的那个问题）。
   *    现在两者分开：
   *      可见（本函数）⇒ 卡片出现在图上，未达成时是「未揭露的科技」占位 + 条件进度
   *      亮出（techNode 的 lit）⇒ 才显示科技名称与效果
   *    分开之后，「进新纪元是一整页空白」与「整批泄露内容」两个坏法同时消失了。 */
  function visOf(s, t, era) {
    return t.era <= era;
  }

  /* 科技卡片两态（用户 2026-09-26 截图指出：未达成尤里卡却已亮出科技内容/按钮，不对）。
   *   lit（metOf 为真 = 已掌握 / 达成过尤里卡至少一次）
   *     ⇒ 亮出科技名称与效果，**不再显示尤里卡进度**（用户原话：达到过就直接显示内容）。
   *   !lit（尤里卡没达成过）
   *     ⇒ 标题写「未揭露的科技」，效果行藏掉，只保留条件 + 进度条（用户选「保留条件+进度条」），
   *        研究按钮因 studyBlocked 返回「尤里卡未达成」而灰掉。
   * 两态的判据统一走 SB.tech.metOf —— 那本是 canStudy 的第四条门禁，渲染复用它，
   * 避免「亮没亮」与「能不能研究」各算各的而错位。 */
  function techNode(s, t, cell, w, hh, G) {
    var done = !!s.techs[t.id];
    var lit = SB.tech.metOf(s, t);          // 已掌握 / 达成过尤里卡 = 亮出内容
    var eureka = !lit ? SB.tech.condShort(s, t.cond) : null;
    var why = done ? null : SB.tech.studyBlocked(s, t.id);
    var fut = t.era > (s.era || 1);
    var status = done ? '已掌握' : !lit ? '未揭示' : why ? '暂不可研究' : '可研究';
    var eurekaPct = eureka && eureka.need > 0
      ? Math.max(0, Math.min(100, eureka.now / eureka.need * 100)) : 0;
    var cls = 'technode st' + (done ? ' done' : why ? ' lock' : ' open') + (fut ? ' fut' : '') + ' tree-node';
    var h = '<button type="button" class="' + cls + '" id="techrow-' + t.id + '"' +
      ' data-node="' + t.id + '" data-x="' + cell.x + '" data-y="' + cell.y + '"' +
      ' data-layer="' + cell.layer + '"' +
      ' data-lit="' + (lit ? 1 : 0) + '"' +
      ' data-tree-node="1" data-tree-type="tech" data-tree-id="' + t.id + '"' +
      ' aria-label="' + (lit ? t.name : '未揭露的科技') + '，' + status + '，打开详情"' +
      ' style="left:' + cell.x + 'px;top:' + cell.y + 'px;width:' + w + 'px;height:' + hh + 'px">';
    h += '<span class="tnhd">' + SB.ui.renderCommon.treeIconHTML(t, lit, 'tree-node-icon branch-' + (t.branch || 'know')) +
      '<span class="tnm">' + (lit ? t.name : '未揭露的科技') + '</span>' +
      (t.key ? '<span class="tntag">关键</span>' : '') + '</span>' +
      (!lit ? '<span class="tree-eureka">尤里卡 · ' + (eureka ? eureka.txt : '达成条件后揭示') + '</span>' +
        (eureka && eureka.need > 0 ? '<span class="tree-eureka-meter"><span class="tree-eureka-track"><i style="width:' + eurekaPct.toFixed(1) + '%"></i></span><b>' + eurekaPct.toFixed(0) + '%</b></span>' : '') : '') +
      '<span class="tree-node-foot"><i class="tree-state-dot"></i>' +
      '<span class="tree-node-status">' + status + '</span>' +
      '<span class="tree-open-hint">查看详情　›</span></span></button>';
    return h;
  }

  /* 科技面板未开门时的空态。
   * 【为什么要有这一屏而不是什么都不画】关闭条件是「建成 5 座深海藻场」，
   * tab 被 gate 掉之后玩家不会从 tab 进来到这里；但如果他记得 tab 位置，或
   * 存档从别的路径带进来，空面板 + 一句「为什么是空的」比空白强得多。
   * 门是派生的，所以这一屏的门槛数字也从 cond 读，不写死成 5。 */
  function paneTechLocked() {
    var w = SB.tech && SB.tech.byId ? SB.tech.byId('writing') : null;
    var need = (w && w.cond && w.cond.n) || 5;
    return '<div class="row"><div><div class="nm">科技 · 未翻开</div>' +
      '<div class="ds">族里还分不出「今天」和「明天」——没有值得记下来的事，' +
      '也就没有「明天」。建成 ' + need + ' 座深海藻场之后，这页才会打开。</div></div></div>' +
      '<div class="note">在「' + SB.habitat.habitatName(SB.game.run()) + '」页铺藻场就行，它的产出就是「今天」；第 ' + need + ' 座落成时' +
      '你会知道的。</div>';
  }

  /* ── 纪元导航（2026-09-26 用户第三次重构科技页）────────────────────
   * 原状是「当前纪元横幅 + 五张竖排纪元卡片 + 长卷」三块。五张卡各约 130px，
   * 手机上要滑过一整屏才够到树，而每张卡里真正的新信息只有一句描述。用户的话：
   *   「这部分文本内容能不能放在科技树标题这里，然后在这里设计几个按钮，
   *     点一下就自动跳转到该纪元的科技树」。
   * 于是长卷标题区只剩两块：
   *   · 一排纪元按钮 —— 名称 + 该纪元进度。点它选中该纪元；已抵达的还会把长卷
   *     横向滚到那一纪元的左边界（纪元按钮就是这张图的目录）。
   *   · **只出选中那一个**纪元的详情卡（名/箴言/描述）。选中的恰好是当前纪元时，
   *     再把关键节点钥匙、进度条、现有科技与下一纪元一并摊开 —— 那是原横幅的内容，
   *     挪进来而不是删掉：它是「我现在该干什么」的部分，每趟进这页都得看见。
   * ⚠️ e2e 盯着「详情卡只有一张」：五张全展开正是这次要消灭的东西，而它长得跟正确
   *    版本**一模一样**（都是 .eracard），只能靠条数钉住。
   * ⚠️ 未来纪元的按钮**不置灰**：它点下去不改长卷位置（那一纪元的节点还没现身，
   *    滚过去只有空白和一条位置横幅 —— 那正是「点了没反应」的观感），但描述是有
   *    信息量的预告，读得到。详情卡会自己说清「尚未抵达」，不用按钮的灰态暗示。 */
  function eraStats(s, e) {
    var T = SB.TECHS || [], list = [], learned = 0, i;
    for (i = 0; i < T.length; i++) if (T[i].era === e) list.push(T[i]);
    for (i = 0; i < list.length; i++) if (s.techs[list[i].id]) learned++;
    return { total: list.length, learned: learned };
  }
  /* 纪元三条状态。已过去的用冷灰 —— 它的名字不该和正在做的那个一样亮。 */
  function eraState(era, sel) {
    return sel < era ? '已过去' : sel === era ? '进行中' : '未抵达';
  }
  function eraColor(era, sel) {
    return sel < era ? '#5b6b80' : eraOf(sel).color;
  }

  function eraNav(s, era, sel) {
    var E = SB.ERAS || [], h = '<div class="eranav" id="eraNav">', e;
    for (e = 1; e <= E.length; e++) {
      var er = eraOf(e), st = eraStats(s, e), col = eraColor(era, e);
      var label = eraState(era, e);
      h += '<button type="button" class="erabtn' + (e === sel ? ' on' : '') +
        (e === era ? ' cur' : '') + '" data-era="' + e + '"' +
        ' title="' + er.name + '「' + er.motto + '」· ' + label + ' ' +
        st.learned + '/' + st.total + (e <= era ? '　点它跳到这一纪元' : '　尚未抵达') + '">' +
        '<span class="g" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
        '<span class="n" style="color:' + col + '">' + er.name + '</span>' +
        '<span class="c">' + st.learned + '/' + st.total + '</span></button>';
    }
    /* 怎么读这张图 —— 原来挂在纪元一那张卡片里（只在当前纪元可见），
     * 现在它是长卷的图注，谁看这张图都该看到，所以不再挂条件。 */
    h += '</div><div class="note">这张长卷按列推进：同一个纪元的每一项占一列，' +
      '列号越往右越深，前置到本项之间画连线。图比这一屏宽，按住拖动（鼠标）或横向滑动（手指）' +
      '看后面的纪元，也可以点上面的纪元按钮直接跳过去。</div>';
    return h;
  }

  function eraDetail(s, era, sel, prog, sci) {
    var er = eraOf(sel), st = eraStats(s, sel), col = eraColor(era, sel);
    var label = eraState(era, sel);
    var h = '<div class="eracard' + (sel === era ? ' active' : '') + '" id="eraDetail"' +
      ' style="border-left-color:' + col + '">' +
      '<div class="erahd"><span class="glyph" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
      '<span class="enm" style="color:' + col + '">' + er.name + '</span>' +
      '<span class="emotto">' + er.motto + '</span>' +
      '<span class="estate" style="background:' + (sel === era ? '#123a52' : '#153048') +
      ';color:' + col + '">' + label + ' · ' + st.learned + '/' + st.total + '</span></div>' +
      '<div class="edesc">' + er.desc + '</div>';

    if (sel === era) {
      /* 当前纪元：把「还差什么」摊开。这一段是原「当前纪元横幅」的内容，
       * 逐句搬过来 —— 删掉它这页就只剩一张地图，玩家不知道该往哪使力。
       * ⚠️ ERA10（2026-10-20）：**终局纪元必须单独分支**。keysOf(10) = 0（没有关键节点闸门，
       *    advanceEra 靠 `p.era >= E.length` 兜底，既不会瞬跳也不可能再推进），沿用通用文案会打出
       *    「本纪元关键节点 0 / 0。全部掌握即进入下一纪元」——一句在终局完全不成立的谎，
       *    0/0 的迷你进度条还像页面坏了。终局真正该说清的是「通关条件去哪看」。 */
      var isLast = era >= (SB.ERAS || []).length;
      if (isLast) {
        h += '<div class="edesc">终局纪元：本纪元不设关键节点闸门，也没有下一纪元，七项科技点完为止。' +
          '通关看<b>戴森球</b>——星图页的戴森球面板到 100%（太阳帆 10000 ＋ 戴森球节点 1000）即竣工。</div>';
      } else {
        var keys = SB.tech.keysOf(era), kl = '', i;
        for (i = 0; i < keys.length; i++) {
          var k = keys[i];
          kl += '<span class="' + (s.techs[k.id] ? 'done' : '') + '">' +
            (s.techs[k.id] ? '✓ ' : '○ ') + k.name + '</span>';
        }
        h += '<div class="keysline">' + kl + '</div>';
        h += '<div class="minibar" style="margin-top:7px"><i style="width:' +
          (prog.keysTotal ? (prog.keysDone / prog.keysTotal * 100).toFixed(0) : 0) + '%"></i></div>';
        h += '<div class="edesc">本纪元关键节点 ' + prog.keysDone + ' / ' + prog.keysTotal +
          '。全部掌握即进入下一纪元——越纪元研究是不可能的，这是硬闸门。</div>';
      }
      var next = era < (SB.ERAS || []).length ? eraOf(era + 1) : null;
      h += '<div class="teaser">现有科技 <b>' + Math.floor(s.res.science) + '</b>（+' +
        sci.toFixed(2) + '/ 秒）' + (next ? '　下一纪元：<b>' + next.name + '</b>「' +
        next.motto + '」' + next.desc : '　这是终局纪元。') + '</div>';
    } else if (sel < era) {
      h += '<div class="edesc">这个纪元已经过去：它的节点全部摊在长卷左边那一段里，' +
        '随时可以回头补完（补不再卡纪元闸门）。</div>';
    } else {
      /* ⚠️ 说清「长卷上目前只有它那条位置横幅」，否则玩家点完按钮看见一片空白
       *    会以为是坏了（纪元横幅是画给所有纪元的，节点才要等抵达）。 */
      h += '<div class="edesc">尚未抵达——把 ' + eraOf(era).name + ' 的关键节点全部掌握，' +
        '闸门才会打开，这一纪元的尤里卡条件到那时才现身。长卷上目前只有它一条位置横幅，' +
        '所以点它不会滚过去。</div>';
    }
    h += '</div>';
    return h;
  }

  function civicEraStats(s, era) {
    var C = SB.CIVICS || [], total = 0, completed = 0, revealed = 0;
    for (var i = 0; i < C.length; i++) {
      if ((C[i].era || 1) !== era) continue;
      total++;
      if (s.civics && s.civics[C[i].id]) completed++;
      if (SB.civic.isRevealed(s, C[i].id)) revealed++;
    }
    return { total: total, completed: completed, revealed: revealed };
  }

  function civicEraNav(s, gameEra, visibleEra, sel) {
    var E = SB.ERAS || [], h = '<div class="eranav" id="civicEraNav">';
    for (var e = 1; e <= E.length; e++) {
      var er = eraOf(e), st = civicEraStats(s, e), col = eraColor(visibleEra, e);
      var treeLabel = e < visibleEra ? '树已展开' : e === visibleEra ? '当前展开' : '树未展开';
      var gateLabel = e <= gameEra ? '科技纪元已抵达' : '尚未到达科技纪元';
      h += '<button type="button" class="erabtn civic-erabtn' + (e === sel ? ' on' : '') +
        (e === visibleEra ? ' cur' : '') + '" data-civic-era="' + e + '"' +
        ' title="' + er.name + '「' + er.motto + '」· ' + treeLabel + ' · ' + gateLabel + ' · 已完成 ' +
        st.completed + '/' + st.total + ' · 已揭示 ' + st.revealed + '/' + st.total +
        (e <= visibleEra ? '　点它跳到这一纪元' : '　可查看揭示条件') + '">' +
        '<span class="g" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
        '<span class="n" style="color:' + col + '">' + er.name + '</span>' +
        '<span class="c">' + st.completed + '/' + st.total + '</span></button>';
    }
    return h + '</div><div class="note">每完成一个纪元的任意一项市政，就揭露下一个纪元的市政树结构；' +
      '市政名称与效果仍需满足各自的鼓舞条件才会揭示。</div>';
  }

  function civicEraDetail(s, gameEra, visibleEra, sel) {
    var er = eraOf(sel), st = civicEraStats(s, sel), col = eraColor(visibleEra, sel);
    var treeState = sel < visibleEra ? '树已展开' : sel === visibleEra ? '当前展开' : '树未展开';
    var h = '<div class="eracard' + (sel === visibleEra ? ' active' : '') + '" id="civicEraDetail"' +
      ' style="border-left-color:' + col + '">' +
      '<div class="erahd"><span class="glyph" style="color:' + col + '">' + (er.glyph || '') + '</span>' +
      '<span class="enm" style="color:' + col + '">' + er.name + '</span>' +
      '<span class="emotto">' + er.motto + '</span>' +
      '<span class="estate" style="background:' + (sel === visibleEra ? '#123a52' : '#153048') +
      ';color:' + col + '">' + treeState + ' · ' + (sel <= gameEra ? '科技纪元已抵达' : '科技纪元未抵达') +
      ' · 已完成 ' + st.completed + '/' + st.total +
      ' · 已揭示 ' + st.revealed + '/' + st.total + '</span></div>' +
      '<div class="edesc">' + er.desc + '</div>';
    if (sel < visibleEra) {
      h += '<div class="edesc">这个纪元的市政树已经展开，可以查看其中的节点。</div>';
    } else if (sel > visibleEra) {
      var prev = eraOf(sel - 1);
      h += '<div class="edesc">完成' + prev.name + '任意一项市政后，才会揭露这一纪元的市政树结构。</div>';
    } else {
      var next = eraOf(sel + 1), maxEra = (SB.ERAS || []).length;
      h += '<div class="teaser">本纪元完成 ' + st.completed + ' / ' + st.total + ' 项市政，已揭示 ' +
        st.revealed + ' 项。' + (sel < maxEra
          ? '完成本纪元任意一项市政，即揭露' + next.name + '的市政树结构。'
          : '全部纪元的市政树结构都已揭露。') +
        '市政名称与效果仍需满足各自的鼓舞条件才会揭示。</div>';
    }
    if (sel > gameEra) h += '<div class="edesc">' + (sel <= visibleEra
      ? '该纪元市政树已揭露，但要等科技纪元推进到' + er.name + '后才能研究其中的市政。'
      : '即使之后揭露了该纪元市政树，也要等科技纪元推进到' + er.name + '后才能研究其中的市政。') + '</div>';
    return h + '</div>';
  }

  function paneTech() {
    var s = res();
    /* 门与 tab 的灰读同一份派生值（SB.tech.panelOpen），不在这里另算一次。 */
    if (SB.tech && SB.tech.panelOpen && !SB.tech.panelOpen(s)) return paneTechLocked();
    var era = s.era || 1, E = SB.ERAS || [];
    var prog = SB.tech.eraProgress(s);
    var sci = SB.economy.rates(s).science || 0;
    /* 归一化后写回模块状态：按钮、详情卡、techGoEra 三处读的必须是同一个值。
     * （techViewEra 存 0 = 跟随当前纪元，这里把它翻译成具体的 era。） */
    var sel = (techViewEra >= 1 && techViewEra <= E.length) ? techViewEra : era;
    techViewEra = sel;

    var h = eraNav(s, era, sel);
    h += eraDetail(s, era, sel, prog, sci);
    h += techTree(s);
    h += '<div class="note">尤里卡只「揭示」节点本身，不折算研究进度（设计已定）。' +
      '研究是即时扣费：科技够了点一下就掌握，没有队列。</div>';
    return h;
  }

  /* 破壳面板：让玩家看清「系数从哪来」和「祭坛为什么停」。
   * 这两件事一旦变成黑箱，玩家不知道自己该做什么，机制就白设了。 */
  /* ── 市政页（2026-09-27 兑现「议事厅开启市政树」那条欠账）────────────
   * 三块由上到下：**政体 → 政策卡槽 → 市政树**。这个顺序就是玩家的决策顺序——
   *   先看自己处在哪个政体（决定有几个槽），再选装哪张卡（槽之间的取舍），
   *   最后才是「为了拿某个卡，要不要先点出某条市政」。
   * ⚠️ 它**不是科技页的复制**：科技是「解锁什么」，市政是「你是谁、按哪套规矩办事」，
   *    所以政体与卡占了上面两整块，树只占下面一块。
   * ⚠️ 面板未开门时整页不渲染（与 paneTechLocked 同一手法），页面签上才不会
   *    出现「一个空壳页」。 */
  var civicView = 'government';
  function setCivicView(view) {
    if (view !== 'government' && view !== 'tree') return false;
    civicView = view;
    return true;
  }
  function emptyCivicSlotCount(s, C, list) {
    var slots = list || C.slotList(s), count = 0;
    for (var i = 0; i < slots.length; i++) {
      var cardId = s.cards && s.cards[i];
      if (!cardId || !C.policyById(cardId)) count++;
    }
    return count;
  }
  function civicNoticeState(s) {
    var C = SB.civic;
    if (!s || !C || !C.panelOpen(s)) return { emptySlots: 0, researchable: false };
    return {
      emptySlots: emptyCivicSlotCount(s, C),
      researchable: !!(C.hasResearchable && C.hasResearchable(s))
    };
  }
  function paneCivic() {
    var s = res();
    if (!SB.civic || !SB.civic.panelOpen(s)) return paneCivicLocked();
    var notice = civicNoticeState(s);
    var govHint = notice.emptySlots > 0
      ? '<span class="civic-subtab-status" aria-label="有空政策卡槽"><i aria-hidden="true"></i>有空槽 ' + notice.emptySlots + '</span>' : '';
    var treeHint = notice.researchable
      ? '<span class="civic-subtab-status" aria-label="有可研究市政"><i aria-hidden="true"></i>可研究市政</span>' : '';
    var h = '<div class="panel-subtabs civic-subtabs" role="group" aria-label="市政分区">' +
      '<button type="button" class="subtab' + (civicView === 'government' ? ' on' : '') +
      '" data-civic-view="government" aria-pressed="' + (civicView === 'government') + '">政体' + govHint + '</button>' +
      '<button type="button" class="subtab' + (civicView === 'tree' ? ' on' : '') +
      '" data-civic-view="tree" aria-pressed="' + (civicView === 'tree') + '">市政树' + treeHint + '</button></div>';
    return h + (civicView === 'tree'
      ? '<div class="subtab-panel civic-tree-panel">' + civicTree(s) + '</div>'
      : '<div class="subtab-panel civic-government-panel">' + paneCivicGov(s) + paneCivicSlot(s) + '</div>');
  }

  function paneCivicLocked() {
    var s = res();
    var why = SB.civic ? SB.civic.panelBlock(s) : '市政系统尚未解锁。';
    var scribeName = SB.folk.jobName(s, 'scribe');
    return '<div class="secttl">市政</div>' +
      '<div class="row"><div class="nm">市政页未开启</div>' +
      '<div class="ds">' + (why || '') + '</div></div>' +
      '<div class="note">议事厅由「石工」解锁，它同时是' + scribeName + '这个职业的来源——' +
      '建起来之后这里会给出：政体、政策卡槽，以及三条市政。</div>';
  }

  /* 政体符号：统一的线性徽记，用几何关系表达权力结构，不依赖 emoji 字体。 */
  var GOV_SYMBOL_ART = {
    tribe: '<circle cx="16" cy="16" r="3"/><circle cx="16" cy="5.5" r="2"/><circle cx="6.7" cy="22" r="2"/><circle cx="25.3" cy="22" r="2"/><path d="m14.4 7.2-6.1 12.9m9.4-12.9 6.1 12.9M9 23h14"/>',
    autocracy: '<path d="M16 4v24M16 5 7 12m9-7 9 7M7 12h18M10 12v9m6-9v9m6-9v9M7 23h18M5 27h22"/>',
    oligarchy: '<circle cx="16" cy="16" r="3.2"/><circle cx="8" cy="9" r="2.2"/><circle cx="24" cy="9" r="2.2"/><circle cx="8" cy="23" r="2.2"/><circle cx="24" cy="23" r="2.2"/><path d="m10 10.5 3.7 3.7m4.6 0 3.7-3.7m-12 11 3.7-3.7m4.6 0 3.7 3.7"/>',
    classical_republic: '<path d="M5 12q11-10 22 0M7 13h18M9 14v9m7-9v9m7-9v9M6 24h20M8 27h16"/>',
    monarchy: '<path d="m5 10 5 5 6-9 6 9 5-5-2 13H7L5 10Z"/><path d="M8 26h16M10 18h12"/><circle cx="16" cy="11" r="1.3"/>',
    merchant_republic: '<circle cx="16" cy="16" r="11"/><path d="M8 13h12l-2.5-2.5M24 19H12l2.5 2.5M7 16h2m14 0h2"/>',
    theocracy: '<circle cx="16" cy="8" r="4"/><path d="M16 12v14m-7-5h14M11 26h10M8 8h2m12 0h2"/>',
    theo_state: '<path d="M16 4 18.4 11.6 26 14l-7.6 2.4L16 24l-2.4-7.6L6 14l7.6-2.4L16 4Z"/><path d="M8 26h16M11 23v3m10-3v3"/>',
    egalitarianism: '<path d="M7 8h18M7 16h18M7 24h18"/><circle cx="5" cy="8" r="1"/><circle cx="5" cy="16" r="1"/><circle cx="5" cy="24" r="1"/>',
    federalism: '<path d="m16 7 7 4v9l-7 4-7-4v-9l7-4Z"/><circle cx="16" cy="16" r="2.3"/><path d="M16 7V4M23 11l3-2M23 20l3 2M9 20l-3 2M9 11 6 9M16 24v4"/>',
    interstellar_federation: '<ellipse cx="16" cy="16" rx="12" ry="5.5" transform="rotate(-28 16 16)"/><ellipse cx="16" cy="16" rx="12" ry="5.5" transform="rotate(48 16 16)"/><path d="m16 10 1.7 4.3L22 16l-4.3 1.7L16 22l-1.7-4.3L10 16l4.3-1.7L16 10Z"/>',
    star_sea_coop: '<circle cx="16" cy="16" r="3"/><circle cx="16" cy="5.5" r="2"/><circle cx="25" cy="11" r="2"/><circle cx="22" cy="22.5" r="2"/><circle cx="10" cy="22.5" r="2"/><circle cx="7" cy="11" r="2"/><path d="m16 8 7.2 2.2 1 7.3-5.8 5.7h-7.8l-5.8-5.7 1-7.3L16 8Z"/>',
    universal_church: '<circle cx="16" cy="16" r="3"/><circle cx="16" cy="16" r="8"/><path d="M16 3v3m0 20v3M3 16h3m20 0h3M6.8 6.8 9 9m14 14 2.2 2.2m0-18.4L23 9M9 23l-2.2 2.2"/>'
  };
  function govSymbol(id, extraClass) {
    return '<span class="gov-symbol gov-symbol-' + id + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true">' +
      '<svg viewBox="0 0 32 32" focusable="false">' + (GOV_SYMBOL_ART[id] || GOV_SYMBOL_ART.tribe) + '</svg></span>';
  }

  /* 政体（Civ6 式）：政体是「一份被动 + 一份槽位配方」，不是一条标签。
   * ⚠️ 三条信息必须同框才叫政体：被动（这政体自己给了什么）、槽位配方（我能摆几张什么卡）、
   *    及第 0 号槽空不空。Civ6 的政体选择之所以有分量，全在这三样拼在一起。 */
  function paneCivicGov(s) {
    var C = SB.civic;
    /* ⚠️ 2026-10-05 用户「政体不解锁就不要露出来」：与资源 unlock 描述符、
     *   建筑移除 unlockRatio 同一条纪律——未解锁的政体**整张卡都不渲染**，
     *   只渲染 govOwned 成立的。避免开局就摆一排灰着的独裁/寡头/神权提前剧透。
     *   govOwned 读对应市政 s.civics[c.id]，与 setGov 同一判据（civics.js）。 */
    var owned = [];
    for (var i = 0; i < SB.GOVS.length; i++) if (C.govOwned(s, SB.GOVS[i].id)) owned.push(SB.GOVS[i]);
    var h = '<div class="secttl">政体</div>';
    if (!owned.length) {
      /* 一个都没解锁：政体系统整体还没开，给一句指引而不是一堆灰卡。
       * ⚠️ 硬编码《法典》是因为它是当前唯一解锁 tribe 的市政
       *   （e2e:2320「研究《法典》⇒ 自带酋邦制」），与 govOwned 的反查同源。 */
      h += '<div class="row"><div class="ds">政体系统尚未开启——研究《法典》开启酋邦制。</div></div>';
      return h;
    }
    var currentGov = null;
    for (var ci = 0; ci < owned.length; ci++) if (owned[ci].id === s.gov) currentGov = owned[ci];
    if (!currentGov) {
      return h + '<div class="row gov-current-missing"><div class="ds">当前没有生效的政体。</div>' +
        '<button type="button" class="btn buy" data-gov-picker-open>选择政体</button></div>';
    }
    var currentTitle = C.govTitleName ? C.govTitleName(s) : currentGov.name;
    return h + '<article class="gov-picker-card gov-current-card is-expanded is-current">' +
      '<div class="gov-picker-detail">' +
        '<div class="gov-current-identity">' + govSymbol(currentGov.id, 'gov-symbol-current') + '<div class="gov-current-copy">' +
          '<div class="gov-expanded-kicker">当前政体 <i class="is-current">生效中</i></div>' +
          '<h3 class="gov-expanded-title">' + currentTitle + '</h3></div></div>' +
        '<p class="gov-picker-desc">' + currentGov.desc + '</p>' +
        (currentGov.flavor ? '<p class="gov-picker-flavor b-flavor">' + currentGov.flavor + '</p>' : '') +
        '<div class="gov-picker-slots"><span>政策卡槽</span><strong>' + recipeText(currentGov) + '</strong></div>' +
        '<div class="gov-picker-footer"><span>当前政体正在生效' + SB.ui.renderCommon.happyBonusNote(s, 'gov') + '</span>' +
          '<button type="button" class="btn buy" data-gov-picker-open>更换政体</button></div>' +
      '</div></article>';
  }

  /* 政体选择器仅由 render.js 装入弹窗；主页面始终保留当前政体摘要。 */
  function paneGovPicker(s) {
    var C = SB.civic, owned = [];
    for (var i = 0; i < SB.GOVS.length; i++) if (C.govOwned(s, SB.GOVS[i].id)) owned.push(SB.GOVS[i]);
    if (!owned.length) return '<div class="gov-picker-empty">尚未解锁可选政体。</div>';
    var options = '';
    for (var k = 0; k < owned.length; k++) {
      var v = owned[k], on = s.gov === v.id;
      var firstFree = !on && C.govFirstAdoptionFree(s, v.id);
      var why = on ? null : C.govBlocked(s, v.id);
      var tileState = on ? '当前' : (firstFree ? '首次免费' : (why ? '条件不足' : '可采纳'));
      var statusClass = on ? 'is-current' : (why ? 'is-blocked' : (firstFree ? 'is-free' : 'is-ready'));
      var adoptionCost = C.govCost(s);
      options += '<article class="gov-picker-card gov-option-card' + (on ? ' is-current' : '') + '">' +
        '<header class="gov-option-head">' + govSymbol(v.id) + '<h3>' + v.name + '</h3><i class="' + statusClass + '">' + tileState + '</i></header>' +
        '<p class="gov-option-desc">' + v.desc + '</p>' +
        (v.flavor ? '<p class="gov-option-flavor b-flavor">' + v.flavor + '</p>' : '') +
        '<div class="gov-option-slots"><span>政策卡槽</span><strong>' + recipeText(v) + '</strong></div>' +
        '<footer class="gov-option-footer"><span>' + (on ? '当前政体正在生效' : (firstFree ? '首次采用免费' : ('更换费用：' + adoptionCost + ' 市政点'))) +
          (why ? '<small>' + why + '</small>' : '') + '</span>' +
          '<button type="button" class="btn buy gov-adopt" data-gov="' + v.id + '"' + ((on || why) ? ' disabled' : '') +
          '>' + (on ? '当前生效' : (why ? '条件不足' : (firstFree ? '免费采纳' : '采纳政体'))) + '</button></footer>' +
        '</article>';
    }
    var h = '<div class="gov-picker-list">' + options + '</div>';
    /* 每个政体各自首次采用免费；重采用收费规则也要明示。 */
    if (C.topCost(s) > 0) {
      h += '<div class="note">每个政体首次采用免费一次；之后更换需 ' + C.govCost(s) +
        ' 市政点（当前最高已完成市政研究成本的 1/5）。</div>';
    }
    return h;
  }
  /* 槽位配方的中文说明，如「1 万能槽」「1 工造槽 + 1 万能槽」。
   * ⚠️ 从 slots 配方**现算**，不另存一句写死的文案 —— 改配方时文案跟不上的 bug
   *    是那种「玩家看到描述与实际槽位对不上」的静默错。 */
  function recipeText(g) {
    var n = 0, k, out = [];
    for (k in (g.slots || {})) {
      if (!(g.slots[k] > 0)) continue;
      out.push(g.slots[k] + ' ' + SB.civic.slotTypeName(k));
      n += g.slots[k];
    }
    if (!n) return '不提供政策卡槽';
    return out.join(' ＋ ');
  }

  /* 政策卡槽（Civ6 式）：一个个**带类型的格子**，空格子也画出来 ——
   * 玩家得看见「还有个工造槽空着」，才会想到去解锁那张工造卡。 */
  /* 2026-10-13：政策卡「点卡→点槽」两步选位。armedCard 存待装卡 id（render 模块级视图状态，不存档）。
   * 点池里一张卡 = 选中它（paneCivicSlot 高亮可装槽）；点一个对口槽 = 装进去；再点同一张卡 = 取消。 */
  var armedCard = null;
  function armCard(id) { armedCard = id; }
  function disarmCard() { armedCard = null; }
  function getArmedCard() { return armedCard; }

  /* 族民分配步长（2026-10-14 方案 B）：×1 → ×5 → ×10 循环，全局记忆（所有职业共用）。
   * 视图状态，不进存档——重载回 ×1 是故意的（大多数调整是 ±1）。 */
  var jobStep = 1;
  function cycleJobStep() { jobStep = jobStep === 1 ? 5 : (jobStep === 5 ? 10 : 1); return true; }
  function getJobStep() { return jobStep; }

  function paneCivicSlot(s) {
    var C = SB.civic, list = C.slotList(s), i;
    var armedCard = SB.ui.render.armedCard();
    var emptyCount = emptyCivicSlotCount(s, C, list);
    var h = '<div class="secttl civic-policy-heading">政策卡槽 <span class="tag">' + list.length + '</span>' +
      (emptyCount > 0 ? '<span class="civic-slot-warning"><i aria-hidden="true"></i>空槽 ' + emptyCount + '</span>' : '') + '</div>';
    if (!list.length) {
      h += '<div class="row"><div class="ds">当前政体不提供政策卡槽——换个政体才能装卡。</div></div>';
      return h + pool(s, armedCard);
    }
    h += '<div class="policy-slot-grid">';
    var slotGlyphs = { wild: '◇', prod: '⚙', sci: '✦', grow: '♧', relig: '☼' };
    for (i = 0; i < list.length; i++) {
      var st = list[i].type, filled = (s.cards && s.cards[i]) ? C.policyById(s.cards[i]) : null;
      var _terminusSlot = !!(filled && filled.id === 'card_cycle_terminus');
      var slotGlyph = slotGlyphs[st] || '▣';
      /* 2026-10-13：点卡选位两步法——armedCard 命中且本槽对口时高亮成 slot-target，提示「点这里装」。 */
      var _armed = armedCard && C.policyById(armedCard);
      var _locked = !!(filled && filled.locked);
      var _alreadySlotted = !!(armedCard && s.cards && s.cards.indexOf(armedCard) >= 0);
      var _canHere = !!(_armed && C.cardFits(_armed, st) && !_locked && !_alreadySlotted);
      /* 「轮回之终末」装入后不可解除：不再渲染成插槽，直接以虚境圣物面板占据原位置。 */
      if (_terminusSlot) {
        h += '<article class="terminus-relic-card" aria-label="轮回之终末，虚境永恒锚定">' +
          '<div class="terminus-relic-kicker"><span>虚境信仰</span><b><i aria-hidden="true"></i>永恒锚定</b></div>' +
          '<div class="terminus-relic-main">' +
            '<div class="terminus-relic-sigil" aria-hidden="true"><span>✦</span></div>' +
            '<div class="terminus-relic-copy"><strong>' + filled.name + '</strong>' +
              '<span class="terminus-relic-effect">信仰全产加成 <b>×2</b></span></div>' +
          '</div>' +
          '<div class="terminus-relic-desc">信仰更名为「虚境」 · 此契约已与文明共生</div>' +
          '<div class="terminus-relic-seal"><span>∞</span> 永久生效 · 不可卸下</div>' +
        '</article>';
        continue;
      }
      /* 逐槽：第 i 槽装的是 s.cards[i]。2026-10-07 曾拍板「不给拔下按钮，装新卡直接覆盖」，
       * 但玩家明确要能卸下（否则空槽/换思路无从下手，且说明文案已写「卸下收费」却没有入口）。
       * 故对「已装卡」的槽补一个「卸下」按钮（data-remove=i），空槽不显示。
       * 费用按当前模型由 removeCard → setCardAt 在卸下时扣（装填免费、卸下收费）。 */
      var _fit = filled && C.cardFits(filled, st);
      /* 2026-10-14：按钮 title 反映「免费卸下机会」——有令牌时写「免费（剩 N 次）」，否则写市政点花费。 */
      var _freeN = s.cardFreeRemoves || 0;
      var _rCost = _freeN > 0 ? ('免费（剩 ' + _freeN + ' 次）') : ('收取 ' + C.cardCost(s) + ' 市政点');
      /* ERA9 虚境信仰卡（locked）：永恒锚定、不可卸下——槽里不显示「卸下」按钮，改成锁死提示。 */
      h += '<div class="slotbox slot-type-' + st + (_canHere ? ' slot-target' : '') + (!filled ? ' civic-slot-empty' : '') + '" id="slotrow-' + i + '" data-slot="' + i + '">' +
        '<div class="slottt"><i class="slot-type-glyph" aria-hidden="true">' + slotGlyph + '</i>' +
        '<span class="slot-type-name">' + C.slotTypeName(st) + '</span><span class="tg">#' + (i + 1) + '</span>' +
        (_canHere ? '<span class="slot-target-flag">' + (filled ? '可替换' : '可插入') + '</span>' :
          !filled ? '<span class="civic-slot-empty-flag"><i aria-hidden="true"></i>空槽</span>' : '') + '</div>' +
        (filled
          ? '<div class="slotcard' + (_fit ? '' : ' bad') + (_locked ? ' locked-vr' : '') + '">' +
              '<i class="slot-module-mark" aria-hidden="true">▰</i><span class="slot-module-name">' + filled.name + '</span>' +
              (_locked ? ' <span class="eye" title="虚境信仰 · 永恒锚定">👁</span>' : '') + '</div>' +
            '<div class="slotsub' + (_fit ? '' : ' bad') + '">' +
              (_fit ? (filled.effectText ? C.effectText(filled.effect) : filled.desc)
                    : '与这个槽不对口，装填新卡可覆盖') +
            '</div>' +
            (_locked
              ? '<div class="locknote" title="虚境信仰已永恒锚定，不可卸下">🔒 永恒锚定 · 不可卸下</div>'
              : '<button class="btn danger slot-eject" data-remove="' + i + '" ' +
                'title="卸下此政策卡（' + _rCost + '）">卸下</button>')
          : '<div class="slotcard empty"><span class="slot-empty-glyph" aria-hidden="true">＋</span>' +
            '<span>' + (_canHere ? '点击插入' : '等待装入') + '</span></div>' +
            '<div class="slotsub">' + (_canHere ? '已选政策卡 · 点击此槽安装' : '选择兼容政策卡后插入') + '</div>') +
        '</div>';
    }
    h += '</div>';
    if (armedCard && C.policyById(armedCard)) {
      h += '<div class="note">已选「' + C.policyById(armedCard).name + '」：点高亮的卡槽完成安装（再点这张卡取消）。</div>';
    }
    var _fn = s.cardFreeRemoves || 0;
    h += '<div class="note">装填（安装）永远免费；<b>卸下</b>政策卡通常收取 ' +
      C.cardCost(s) + ' 市政点（当前最高已完成市政研究成本的 1/5），但每完成一个市政会积 1 次<b>免费卸下机会</b>（当前剩 ' +
      _fn + ' 次，可累积）。</div>';
    return h + pool(s, armedCard);
  }

  /* 政策卡库：**只显示已解锁的卡**（完成对应市政才出现），未解锁的不再列出。
   * 用户 2026-09-30：没解锁就不要显示。
   * ⚠️ 代价：玩家失去「我还差哪条市政能拿到下一张卡」的预览——这正是要的克制。
   *   卡是否解锁仍由 cardOwned（= 对应市政已完成）判定，与装填、政体、槽类型都无关。 */
  function pool(s, armedCard) {
    var C = SB.civic, h = '';
    var own = [], i, p;
    var categoryOrder = ['prod', 'sci', 'grow', 'relig', 'wild'];
    var categories = { prod: [], sci: [], grow: [], relig: [], wild: [] };
    for (i = 0; i < SB.POLICIES.length; i++) {
      p = SB.POLICIES[i];
      if (C.cardOwned(s, p.id)) {
        own.push(p);
        /* 老卡未标 type 时按规则视为万能卡；未知类型也安全回落，避免 UI 出现 undefined。 */
        var category = categories[p.type] ? p.type : 'wild';
        categories[category].push(p);
      }
    }
    h += '<div class="secttl">政策卡库 <span class="tag">' + own.length + '</span></div>';
    if (own.length === 0) {
      h += '<div class="row"><div class="ds">尚未解锁任何政策卡——完成市政树上的条目即可解锁对应卡片。</div></div>';
      return h;
    }
    for (var g = 0; g < categoryOrder.length; g++) {
      var groupType = categoryOrder[g], group = categories[groupType];
      if (!group.length) continue;
      var groupName = groupType === 'wild' ? '万能类' : C.slotTypeName(groupType).replace(/槽$/, '') + '类';
      h += '<section class="policy-group policy-group-' + groupType + '" data-policy-category="' + groupType + '">' +
        '<div class="policy-group-title"><span>' + groupName + '</span><span class="policy-group-count">' + group.length + '</span></div>' +
        '<div class="policy-card-grid">';
      for (var j = 0; j < group.length; j++) {
        var q = group[j], why = C.cardBlocked(s, q.id), on = (s.cards && s.cards.indexOf(q.id) >= 0);
        var fits = C.cardFits(q, C.currentSlotType(s));
        /* ERA9 虚境信仰卡（q.locked）：紫红色卡面 + 眼睛图标，池里标「永恒卡」，装填后仍不可卸下。 */
        var _qlocked = !!q.locked;
        var qFlavor = q.flavor || '';
        var voidCard = q.id === 'card_cycle_terminus';
        if (voidCard && qFlavor && SB.ui.render && typeof SB.ui.render.voidCorrupt === 'function') {
          qFlavor = SB.ui.render.voidCorrupt(qFlavor, 127, 1);
        }
        h += '<article class="policy-card policy-card-' + groupType + (on ? ' is-installed' : '') +
          (_qlocked ? ' is-locked-vr' : '') +
          (armedCard === q.id ? ' is-armed' : '') + '">' +
          '<div class="policy-card-top"><span class="tag t' + groupType + '">' + C.slotTypeName(groupType) + '</span>' +
          (_qlocked ? '<span class="tag vr">👁 永恒卡</span>' : (on ? '<span class="tag ok">已装填</span>' : '')) + '</div>' +
          '<div class="policy-card-name">' + q.name + '</div>' +
          /* 幸福度提示按当前卡自己的 happyOffset 显示；不能把所有已装卡的合计重复贴到每张卡上。 */
          (on ? SB.ui.renderCommon.happyBonusNote(s, 'card', q.id) : '') +
          '<div class="policy-card-desc">' + q.desc +
          (on ? '' : fits ? '' : '<br><span class="policy-card-warning">⚠ 与当前槽型不对口：需要 ' + C.slotTypeName(groupType) + '</span>') +
          '</div>' +
          (qFlavor ? '<div class="policy-card-flavor' + (voidCard ? ' void-flavor' : '') + '">' + qFlavor + '</div>' : '') +
          '<button class="btn' + (on || why ? '' : ' buy') + '" data-card="' + q.id + '"' +
          /* ⚠️ 2026-10-14 修：只有「硬拦」才禁用按钮——没解锁 / 槽型不对；
           *   「缺市政点」是软拦，必须放行点卡 arm，否则两步选槽对买不起的卡
           *   永远点不动（disabled 按钮不触发 click）。点槽时 setCard 会据实返回
           *   false 并在 log 报「换卡需 X 市政点」。 */
          ((why && armedCard !== q.id && why.indexOf('市政点') === -1) ? ' disabled' : '') +
          ' title="' + (why || (on ? (_qlocked ? '虚境信仰 · 永恒锚定' : '已装填') : '')) + '">' +
          (on ? (_qlocked ? '永恒·不可卸下' : '在槽') : (armedCard === q.id ? '点槽安装' :
            (why ? (why.indexOf('市政点') >= 0 ? '需市政点' : '装不了') : '装填'))) + '</button></article>';
      }
      h += '</div></section>';
    }
    return h;
  }

  /* 市政树 —— **与科技树同一张横卷**（用户 2026-09-27：「市政树要做成科技树这样」）。
   * 几何来自 SB.civic.layout()，CSS 直接复用 .techscroll / .technode / .tel，
   * 于是两张树在玩家眼里是同一种东西，排布规则也一致（列 = layer，行 = 排版产物）。
   *
   * ⚠️ 两处刻意与科技树不同：
   *   ① 容器 id 是 **civicScroll**，不是 techScroll —— render.js 的 scrollLeft 留存
   *      与 input.js 的拖动都按 id 取容器，共用 id 会两边抢一个元素。
   *   ② 节点是三态（已完成 / 已揭示 / 未揭露），比科技的「亮 / 不亮」多一档：
   *      未揭露时**藏名字与 desc**，与科技一致；差别在于市政的「鼓舞」是揭示的前置，
   *      所以未揭露态要连鼓舞条件与进度一起摆出来，玩家的下一步动作才是明确的。 */
  function civicTree(s) {
    if (!SB.civic || !SB.civic.layout) return '<div class="note">市政树几何尚未加载。</div>';
    var L = SB.civic.layout(), G = L.geo;
    var gameEra = s.era || 1, E = SB.ERAS || [];
    var visibleEra = SB.civic.visibleEra ? SB.civic.visibleEra(s) : gameEra;
    var sel = civicEraChosen && civicViewEra >= 1 && civicViewEra <= E.length ? civicViewEra : visibleEra;
    civicViewEra = sel;
    var C = SB.CIVICS || [], visible = {};
    for (var i = 0; i < C.length; i++) visible[C[i].id] = (C[i].era || 1) <= visibleEra;
    var treeW = G.PADX, treeMaxRow = 0;
    for (i = 0; i < C.length; i++) {
      if (!visible[C[i].id]) continue;
      var visibleCell = L.cells[C[i].id];
      if (!visibleCell) continue;
      treeW = Math.max(treeW, visibleCell.x + G.W + G.PADX);
      treeMaxRow = Math.max(treeMaxRow, visibleCell.row);
    }
    var treeH = G.PADY * 2 + treeMaxRow * (G.H + 20) + G.H;

    var h = civicEraNav(s, gameEra, visibleEra, sel) + civicEraDetail(s, gameEra, visibleEra, sel) +
      '<div class="techscroll tree-civic" id="civicScroll"><div class="techcanvas"' +
      ' style="width:' + treeW + 'px;height:' + treeH + 'px">';

    /* 纪元轨道（只有一条时不画：单纪元的横幅是纯噪音）。 */
    if (L.blocks.length > 1) {
      for (var b = 0; b < L.blocks.length; b++) {
        var blk = L.blocks[b], er = eraOf(blk.era);
        if (blk.era > visibleEra) continue;
        h += '<div class="tnband' + (blk.era === visibleEra ? ' on' : '') + '" style="left:' + (G.PADX + blk.offset) + 'px;width:' +
          (blk.cols * L.pitch - G.W) + 'px">' +
          '<span class="tng">' + (er.glyph || '') + '</span>' + er.name +
          '<span class="tnc">' + blk.cols + ' 列</span></div>';
      }
    }

    /* 连线先画，压在节点底下。虚境终局线单独着色，仍沿用同一张市政树。 */
    var voidPathIds = { void_faith: 1, void_explore: 1, ascend_void: 1 };
    h += '<svg class="techlines" width="' + treeW + '" height="' + treeH + '">';
    for (i = 0; i < L.edges.length; i++) {
      var e = L.edges[i];
      if (!visible[e.from] || !visible[e.to]) continue;
      var doneEdge = s.civics[e.from] && s.civics[e.to];
      h += '<path class="tel' + (doneEdge ? ' done' : s.civics[e.from] ? ' open' : '') +
        (voidPathIds[e.from] || voidPathIds[e.to] ? ' void-path-edge' : '') +
        '" d="' + e.d + '"></path>';
    }
    h += '</svg>';

    for (i = 0; i < C.length; i++) {
      var cell = L.cells[C[i].id];
      if (cell && visible[C[i].id]) h += civicNode(s, C[i], cell, G.W, G.H);
    }
    h += '</div></div>';

    var rate = SB.economy.cultureRate(s);
    /* ⚠️ 2026-10-06 城堡「真升级」：注脚里这座建筑在买下 `upg_castle` 之后**改叫城堡**，
     *   等级是同一个 `coreLvl`（= lvl.hall）。切名判据与建筑行那处同源（同一个 upgrades 键），
     *   否则这里会显示「＋ 议事厅 8 级」而上面那行写着「城堡 8」——同一局两种名字。 */
    var _coreName = (s.upgrades && s.upgrades.upg_castle) ? '城堡' : '议事厅';
    /* ERA6（2026-10-12）：采用三个新政体之一 ⇒ 城堡随政体更名（圣座居所/人民大厅/国会）。
     * castleDisplayName 返回 null 时沿用默认的城堡/议事厅，不覆盖。判据与这里同源。 */
    if (SB.civic && SB.civic.castleDisplayName) {
      var _castleOverride = SB.civic.castleDisplayName(s);
      if (_castleOverride) _coreName = _castleOverride;
    }
    h += '<div class="note">市政点 ' + SB.economy.fmtAmt(s.res.culture) +
      '（+' + rate.toFixed(2) + '/秒 ＝ ' + SB.folk.jobName(s, 'scribe') + ' ' + (s.jobs.scribe || 0) + ' × ' + SB.UNIT.culture +
      ' ＋ ' + _coreName + ' ' + SB.economy.coreLvl(s) + ' 级 × ' + SB.CFG.CIVIC.HALL_RATE + '）。' +
      '鼓舞只揭示这条路，不替你付市政点。</div>';
    return h;
  }

  /* 市政卡片三态，走与 techNode 同一套 class：
   *   done（已投入市政点）⇒ 标题挂绿标「已完成」，不再渲染按钮（诚实，不留假按钮）
   *   revealed（鼓舞达成过）⇒ 亮出名字与 desc，挂「N 市政点」，给研究按钮
   *   !revealed（未揭露）    ⇒ 标题写「未揭露的市政」，藏 desc，只留鼓舞条件 + 进度条
   * 三态的判据分别走 SB.civic 的三个函数（已完成 / isRevealed / blocked），
   * 不在这里另算一遍 —— 与「亮没亮」和「能不能研究」各算各的而错位是同一类错。 */
  function civicNode(s, c, cell, w, hh) {
    var C = SB.civic, done = !!s.civics[c.id], rev = C.isRevealed(s, c.id);
    var why = done ? null : C.blocked(s, c);
    var boost = !rev ? SB.tech.condShort(s, c.boost) : null;
    var boostPct = boost && boost.need > 0
      ? Math.max(0, Math.min(100, boost.now / boost.need * 100)) : 0;
    var status = done ? '已完成' : !rev ? '未揭示' : why ? '暂不可研究' : '可研究';
    var cls = 'technode st' + (done ? ' done' : why ? ' lock' : ' open') + ' tree-node' +
      (/^(void_faith|void_explore|ascend_void)$/.test(c.id) ? ' void-path-node' : '');
    var h = '<button type="button" class="' + cls + '" id="civicrow-' + c.id + '"' +
      ' data-node="' + c.id + '" data-x="' + cell.x + '" data-y="' + cell.y + '"' +
      ' data-layer="' + cell.layer + '"' +
      ' data-revealed="' + (rev ? 1 : 0) + '"' +
      ' data-tree-node="1" data-tree-type="civic" data-tree-id="' + c.id + '"' +
      ' aria-label="' + (rev ? c.name : '未揭露的市政') + '，' + status + '，打开详情"' +
      ' style="left:' + cell.x + 'px;top:' + cell.y + 'px;width:' + w +
      'px;height:' + hh + 'px">';
    h += '<span class="tnhd">' + SB.ui.renderCommon.treeIconHTML(c, rev, 'tree-node-icon civic-icon') +
      '<span class="tnm">' + (rev ? c.name : '未揭露的市政') + '</span>' +
      '</span>' + (!rev ? '<span class="tree-eureka">鼓舞 · ' +
        (boost ? boost.txt : c.boost ? '达成鼓舞条件后揭示' : '无需鼓舞') + '</span>' +
        (boost && boost.need > 0 ? '<span class="tree-eureka-meter"><span class="tree-eureka-track"><i style="width:' + boostPct.toFixed(1) + '%"></i></span><b>' + boostPct.toFixed(0) + '%</b></span>' : '') : '') +
      '<span class="tree-node-foot"><i class="tree-state-dot"></i>' +
      '<span class="tree-node-status">' + status + '</span>' +
      '<span class="tree-open-hint">查看详情　›</span></span></button>';
    return h;
  }

  function techGoEra(n) {
    var s = res(), era = (s && s.era) || 1;
    if (!(n >= 1 && n <= (SB.ERAS || []).length)) return false;
    if (n <= era) SB.ui.render.scheduleTechJumpTo(SB.tech.eraAnchorX(n));
    var changed = n !== (techViewEra || era);
    techViewEra = n;
    return changed || n <= era;
  }

  function civicGoEra(n) {
    var s = res(), visibleEra = s && SB.civic.visibleEra ? SB.civic.visibleEra(s) : (s && s.era) || 1;
    if (!(n >= 1 && n <= (SB.ERAS || []).length)) return false;
    if (n <= visibleEra) SB.ui.render.scheduleCivicJumpTo(SB.civic.eraAnchorX(n));
    var changed = n !== civicViewEra;
    civicViewEra = n;
    civicEraChosen = true;
    return changed || n <= visibleEra;
  }

  SB.ui = SB.ui || {};
  SB.ui.renderParts = SB.ui.renderParts || {};
  SB.ui.renderParts.research = {
    paneTech: paneTech, paneCivic: paneCivic,
    paneCivicGov: paneCivicGov, paneGovPicker: paneGovPicker, paneCivicSlot: paneCivicSlot,
    setCivicView: setCivicView, civicNoticeState: civicNoticeState,
    armCard: armCard, disarmCard: disarmCard, getArmedCard: getArmedCard,
    cycleJobStep: cycleJobStep, getJobStep: getJobStep,
    techGoEra: techGoEra, civicGoEra: civicGoEra
  };
})(typeof window !== 'undefined' ? window : globalThis);
