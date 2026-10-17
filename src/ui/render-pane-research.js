/* 天壳 / SHELLBREAK — 科技与市政研究面板。Classic script component; view state stays ephemeral. */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  function res() { return SB.game.run(); }
  var techViewEra = 0;
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
       * 逐句搬过来 —— 删掉它这页就只剩一张地图，玩家不知道该往哪使力。 */
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
  var govExpanded = {};
  function setCivicView(view) {
    if (view !== 'government' && view !== 'tree') return false;
    civicView = view;
    return true;
  }
  function toggleGovDetail(id) {
    if (!id) return false;
    govExpanded[id] = !govExpanded[id];
    return true;
  }
  function paneCivic() {
    var s = res();
    if (!SB.civic || !SB.civic.panelOpen(s)) return paneCivicLocked();
    var h = '<div class="panel-subtabs civic-subtabs" role="group" aria-label="市政分区">' +
      '<button type="button" class="subtab' + (civicView === 'government' ? ' on' : '') +
      '" data-civic-view="government" aria-pressed="' + (civicView === 'government') + '">政体</button>' +
      '<button type="button" class="subtab' + (civicView === 'tree' ? ' on' : '') +
      '" data-civic-view="tree" aria-pressed="' + (civicView === 'tree') + '">市政树</button></div>';
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
    var current = null, options = '';
    for (var j = 0; j < owned.length; j++) {
      var v = owned[j], on = s.gov === v.id;
      var why = on ? null : C.govBlocked(s, v.id);
      if (on) {
        current = '<div class="gov-current" id="govrow-' + v.id + '">' +
          '<div class="gov-current-label">当前政体 <span class="tag ok">生效中</span></div>' +
          '<div class="gov-current-main"><strong>' + ((SB.civic && SB.civic.govTitleName) ? SB.civic.govTitleName(s) : v.name) + '</strong><span>' + v.desc + '</span></div>' +
          '<div class="gov-current-meta"><span class="govslots">' + recipeText(v) + '</span>' +
          /* 幸福度偏移只在采用中成立，不在未采用的预览卡上暗示为常驻效果。 */
          SB.ui.renderCommon.happyBonusNote(s, 'gov') + '</div></div>';
        continue;
      }
      var expanded = !!govExpanded[v.id];
      var firstFree = C.govFirstAdoptionFree(s, v.id);
      options += '<div class="gov-choice' + (expanded ? ' expanded' : '') + '" id="govrow-' + v.id + '">' +
        '<div class="gov-choice-main"><button type="button" class="inline-info-link gov-choice-name"' +
        ' data-gov-detail="' + v.id + '" aria-expanded="' + expanded + '" aria-controls="govdetail-' + v.id + '">' +
        v.name + '<span class="gov-choice-chevron" aria-hidden="true">⌄</span></button>' +
        '<div class="gov-choice-preview">' + v.desc + '</div>' +
        '<div class="gov-choice-slots">' + recipeText(v) + '</div></div>' +
        '<button class="btn buy gov-adopt" data-gov="' + v.id + '"' + (why ? ' disabled' : '') +
        ' title="' + (why || (firstFree ? '该政体首次采用免费' : '采用此政体')) + '">' +
        (firstFree ? '首次免费' : '采用') + '</button>' +
        (expanded ? '<div class="gov-choice-detail" id="govdetail-' + v.id + '"><b>完整效果</b><p>' + v.desc +
          '</p><span>政策卡槽：' + recipeText(v) + '</span>' + (why ? '<small>' + why + '</small>' : '') + '</div>' : '') +
        '</div>';
    }
    h += current || '';
    if (options) h += '<div class="gov-options-heading"><b>可选政体</b><span>' + (owned.length - (current ? 1 : 0)) + ' 项</span></div>' +
      '<div class="gov-choice-grid">' + options + '</div>';
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
    var h = '<div class="secttl">政策卡槽 <span class="tag">' + list.length + '</span></div>';
    if (!list.length) {
      h += '<div class="row"><div class="ds">当前政体不提供政策卡槽——换个政体才能装卡。</div></div>';
      return h + pool(s, armedCard);
    }
    h += '<div class="policy-slot-grid">';
    for (i = 0; i < list.length; i++) {
      var st = list[i].type, filled = (s.cards && s.cards[i]) ? C.policyById(s.cards[i]) : null;
      /* 2026-10-13：点卡选位两步法——armedCard 命中且本槽对口时高亮成 slot-target，提示「点这里装」。 */
      var _armed = armedCard && C.policyById(armedCard);
      var _canHere = _armed && C.cardFits(_armed, st);
      /* 逐槽：第 i 槽装的是 s.cards[i]。2026-10-07 曾拍板「不给拔下按钮，装新卡直接覆盖」，
       * 但玩家明确要能卸下（否则空槽/换思路无从下手，且说明文案已写「卸下收费」却没有入口）。
       * 故对「已装卡」的槽补一个「卸下」按钮（data-remove=i），空槽不显示。
       * 费用按当前模型由 removeCard → setCardAt 在卸下时扣（装填免费、卸下收费）。 */
      var _fit = filled && C.cardFits(filled, st);
      /* 2026-10-14：按钮 title 反映「免费卸下机会」——有令牌时写「免费（剩 N 次）」，否则写市政点花费。 */
      var _freeN = s.cardFreeRemoves || 0;
      var _rCost = _freeN > 0 ? ('免费（剩 ' + _freeN + ' 次）') : ('收取 ' + C.cardCost(s) + ' 市政点');
      h += '<div class="slotbox' + (_canHere ? ' slot-target' : '') + '" id="slotrow-' + i + '" data-slot="' + i + '">' +
        '<div class="slottt">' + C.slotTypeName(st) + ' <span class="tg">#' + (i + 1) + '</span></div>' +
        (filled
          ? '<div class="slotcard' + (_fit ? '' : ' bad') + '">' + filled.name + '</div>' +
            '<div class="slotsub' + (_fit ? '' : ' bad') + '">' +
              (_fit ? (filled.effectText ? C.effectText(filled.effect) : filled.desc)
                    : '与这个槽不对口，装填新卡可覆盖') +
            '</div>' +
            '<button class="btn danger" data-remove="' + i + '" ' +
              'title="卸下此政策卡（' + _rCost + '）">卸下</button>'
          : '<div class="slotcard empty">空置</div>' +
            '<div class="slotsub">点击装填</div>') +
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
        h += '<article class="policy-card policy-card-' + groupType + (on ? ' is-installed' : '') +
          (armedCard === q.id ? ' is-armed' : '') + '">' +
          '<div class="policy-card-top"><span class="tag t' + groupType + '">' + C.slotTypeName(groupType) + '</span>' +
          (on ? '<span class="tag ok">已装填</span>' : '') + '</div>' +
          '<div class="policy-card-name">' + q.name + '</div>' +
          /* 幸福度提示按当前卡自己的 happyOffset 显示；不能把所有已装卡的合计重复贴到每张卡上。 */
          (on ? SB.ui.renderCommon.happyBonusNote(s, 'card', q.id) : '') +
          '<div class="policy-card-desc">' + q.desc +
          (on ? '' : fits ? '' : '<br><span class="policy-card-warning">⚠ 与当前槽型不对口：需要 ' + C.slotTypeName(groupType) + '</span>') +
          '</div>' +
          '<button class="btn' + (on || why ? '' : ' buy') + '" data-card="' + q.id + '"' +
          /* ⚠️ 2026-10-14 修：只有「硬拦」才禁用按钮——没解锁 / 槽型不对；
           *   「缺市政点」是软拦，必须放行点卡 arm，否则两步选槽对买不起的卡
           *   永远点不动（disabled 按钮不触发 click）。点槽时 setCard 会据实返回
           *   false 并在 log 报「换卡需 X 市政点」。 */
          ((why && armedCard !== q.id && why.indexOf('市政点') === -1) ? ' disabled' : '') +
          ' title="' + (why || (on ? '已装填' : '')) + '">' +
          (on ? '在槽' : (armedCard === q.id ? '点槽安装' :
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
   * ⚠️ 三处刻意与科技树不同：
   *   ① 容器 id 是 **civicScroll**，不是 techScroll —— render.js 的 scrollLeft 留存
   *      与 input.js 的拖动都按 id 取容器，共用 id 会两边抢一个元素。
   *   ② CSS 类名共用，但**滚动位置不共用**（市政现在只有一个纪元、没有纪元跳转按钮，
   *      不需要 persist/restore 那一套）。
   *   ③ 节点是三态（已完成 / 已揭示 / 未揭露），比科技的「亮 / 不亮」多一档：
   *      未揭露时**藏名字与 desc**，与科技一致；差别在于市政的「鼓舞」是揭示的前置，
   *      所以未揭露态要连鼓舞条件与进度一起摆出来，玩家的下一步动作才是明确的。 */
  function civicTree(s) {
    if (!SB.civic || !SB.civic.layout) return '<div class="note">市政树几何尚未加载。</div>';
    var L = SB.civic.layout(), G = L.geo;
    var h = '<div class="techscroll tree-civic" id="civicScroll"><div class="techcanvas"' +
      ' style="width:' + L.w + 'px;height:' + L.h + 'px">';

    /* 纪元轨道（只有一条时不画：单纪元的横幅是纯噪音）。 */
    if (L.blocks.length > 1) {
      for (var b = 0; b < L.blocks.length; b++) {
        var blk = L.blocks[b], er = eraOf(blk.era);
        h += '<div class="tnband" style="left:' + (G.PADX + blk.offset) + 'px;width:' +
          (blk.cols * L.pitch - G.W) + 'px">' +
          '<span class="tng">' + (er.glyph || '') + '</span>' + er.name +
          '<span class="tnc">' + blk.cols + ' 列</span></div>';
      }
    }

    /* 连线先画，压在节点底下。 */
    h += '<svg class="techlines" width="' + L.w + '" height="' + L.h + '">';
    for (var i = 0; i < L.edges.length; i++) {
      var e = L.edges[i];
      var doneEdge = s.civics[e.from] && s.civics[e.to];
      h += '<path class="tel' + (doneEdge ? ' done' : s.civics[e.from] ? ' open' : '') +
        '" d="' + e.d + '"></path>';
    }
    h += '</svg>';

    var C = SB.CIVICS;
    for (i = 0; i < C.length; i++) {
      var cell = L.cells[C[i].id];
      if (cell) h += civicNode(s, C[i], cell, G.W, G.H);
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
    var cls = 'technode st' + (done ? ' done' : why ? ' lock' : ' open') + ' tree-node';
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

  SB.ui = SB.ui || {};
  SB.ui.renderParts = SB.ui.renderParts || {};
  SB.ui.renderParts.research = {
    paneTech: paneTech, paneCivic: paneCivic,
    paneCivicGov: paneCivicGov, paneCivicSlot: paneCivicSlot,
    setCivicView: setCivicView, toggleGovDetail: toggleGovDetail,
    armCard: armCard, disarmCard: disarmCard, getArmedCard: getArmedCard,
    cycleJobStep: cycleJobStep, getJobStep: getJobStep,
    techGoEra: techGoEra
  };
})(typeof window !== 'undefined' ? window : globalThis);
