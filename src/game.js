/* 天壳 / SHELLBREAK — 核心协调层
 * 唯一持有 S（周目状态）与 meta（跨周目状态）的模块。
 * 其它模块一律通过 SB.game.run() / SB.game.meta() 取状态，并由本层负责渲染调度。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  var S = null;
  var meta = SB.state.loadMeta();
  var speed = 1;
  var tab = 'village';
  var dirty = true;
  var LOG_MAX = 40, logLines = [];

  function run() { return S; }
  function state() { return meta; }
  function getTab() { return tab; }
  function setTab(k) {
    /* 科技面板的门（SB.tech.panelOpen 读结绳的尤里卡条件，见 tech.js）。
     * 这里与 render 的 tab onclick 是两道闸，同一件事写两遍是刻意的：
     * setTab 是公开 API，弹窗回调之类不经过 tab 的事件委托也能调到它。 */
    if (k === 'tech' && S && SB.tech && !SB.tech.panelOpen(S)) return;
    /* 工坊页的门是「建成工坊」这座建筑。与科技页同一套两道闸的写法，
     * 免得将来某条直达路径（比如工坊建造成功后的提示）绕过 tab onclick 把灰页签点亮。 */
    if (k === 'workshop' && S && !(S.lvl && S.lvl.workshop > 0)) return;
    /* 奇观页的门是「研究过石工」那项科技（用户要的「第一个就让石工解锁」）。
     * ⚠️ 与上面两道闸同理：就算页签已经因为灰态切换被点亮，直达路径也进不去。 */
    if (k === 'wonder' && S && !(S.techs && S.techs.masonry)) return;
    /* 轮回商店（meta 页）的门：首次轮回后才开。与科技/奇观同两道闸写法，
     * 直达路径（弹窗/测试）走 setTab 也进不去。 */
    if (k === 'meta' && !meta.shopUnlocked) return;
    /* 信仰页的门 = 完成「神学」（与资源行/产出线的 gate 同源，走 resUnlocked 这一处定义）。
     * 与上面几道闸同一套写法：直达路径（弹窗/测试）走 setTab 也进不去。 */
    if (k === 'faith' && S && !(SB.economy && SB.economy.resUnlocked(S, 'faith'))) return;
    /* 剥壳工程（dig 页）的门 = 研究「天壳观测」（2026-10-05 用户：开局不开）。
     * 与上面几道闸同一套写法：直达路径（弹窗/测试）走 setTab 也进不去。 */
    if (k === 'dig' && S && !(S.techs && S.techs.shellwatch)) return;
    tab = k; dirty = true;
    var keys = SB.ui.render.PANE_KEYS;
    for (var i = 0; i < keys.length; i++) {
      var node = document.getElementById('pane-' + keys[i]);
      if (node) node.classList.toggle('hidden', keys[i] !== k);
    }
    /* ⚠️ 页签高亮也在这里同步。它原先**只**写在 tab 的 onclick 里，于是任何走
     *    setTab 的路径（最典型的是开门弹窗里那句「去看看」——它直接调 setTab('tech')）
     *    都只换了 pane，把高亮留在「巢穴」上：页签写着巢穴、底下画着科技。
     *    放在这里之后，onclick 那段就只剩「点了谁」这一件事，两边不再各记一份状态。
     *    （2026-09-26 写探针时撞见：截图里科技页是好的，页签却没亮。） */
    var tabs = document.querySelectorAll('.tab');
    for (i = 0; i < tabs.length; i++)
      tabs[i].classList.toggle('on', tabs[i].dataset.tab === k);
    render();
  }
  function setSpeed(v) { speed = v; }
  // 破冰祭坛开关：开了不意味着立刻凿——地热不够会自动停摆，恢复供能自动继续
  function toggleMiracle(v) {
    if (!S) return;
    S.miracleOn = !!v;
    if (S.miracleOn && S.lvl.miracle <= 0) {
      S.miracleOn = false;
      log('还没有破冰祭坛。先建成祭坛才能启动工程。');
    } else {
      log(S.miracleOn ? '破冰祭坛启动，正在消耗地热凿壳。' : '破冰祭坛已停机。');
    }
    markDirty(); renderAll();
  }

  function log(msg) {
    logLines.push('· ' + msg);
    if (logLines.length > LOG_MAX) logLines.splice(0, logLines.length - LOG_MAX);
    var node = document.getElementById('log');
    if (node) {
      node.innerHTML = logLines.slice().reverse().map(function (x) { return '<div>' + x + '</div>'; }).join('');
    }
  }
  function clearLog() { logLines = []; var n = document.getElementById('log'); if (n) n.innerHTML = ''; }

  function startRun() {
    meta.cycle++;
    /* 轮回商店只在「第一次真正的轮回」后解锁——即【建立宗教】（religionSeen）之后的那次
     * 破冰结算 doBreak。未建立宗教时玩家只能「重开本周目」（普通重置，cycle 同样 +1），
     * 但那不是轮回：doBreak 发 0 点，且 shopUnlocked 保持 false，轮回商店整页锁死。
     * 故 startRun 此处不碰 shopUnlocked；它的解锁由 prestige.doBreak 在真实轮回发生时置位，
     * 旧档（已有跨周目进度）由 loadMeta 迁移补双解锁。 */
    var prev = S;
    S = SB.state.freshRun(true);
    if (prev && prev.perk) S.perk = Object.assign(SB.state.emptyPerks(), prev.perk);
    SB.state.saveMeta(meta);
    clearLog();
    log('第 ' + meta.cycle + ' 周目开始。冰封壳厚度 ' + S.iceShell + '。');
    log('提示：开局只有 1 名族民、0 资源。在「' + SB.habitat.habitatName(S) + '」页点采集攒 15 藻食建第一座藻场，再回「族民」页雇佣。');
    log('壳薄到 25% 会停手；凿穿最后一段要靠破冰祭坛，而祭坛吃地热。');
    dirty = true;
    renderAll();
    SB.state.saveRun(snapshot(S));   // 新周目必须立刻落盘，否则刷新会丢掉这一局
  }

  // 继续未完成的上一周目（刷新页面时）
  function resumeRun(saved) {
    S = saved;
    if (!S.perk) S.perk = SB.state.emptyPerks();
    meta.cycle = Math.max(1, meta.cycle);
    dirty = true;
    if (!S.broken) log('已恢复上次进度：' + (S.t / 3600).toFixed(2) + ' 小时，壳厚 ' + Math.round(S.shell) + '。');
    renderAll();
  }

  function nextCycle() {
    SB.ui.render.hideModal();
    SB.state.clearRun();
    startRun();
  }
  /* 软重置「重开本周目」：丢弃当前这局的建筑/资源/族民，但保留 meta——
   * 轮回点、破层层级、已购增益、科技记录都还在。周目计数 +1，因为结构上这已经是新的一周目。 */
  function resetRun() {
    SB.ui.render.hideModal();
    startRun();
  }
  /* 重开按钮的结算分流（2026-10-05 拍板）：本局研究完《神学》⇒ 走真正轮回结算（doBreak），
   * 否则仅软重置。判据与 prestige.qualified 同源，不另写第二份。暴露出来供 e2e 钉住。 */
  function routeReset(s) { return SB.prestige.qualified(s) ? 'break' : 'reset'; }

  /* 硬重置「清空存档」：连 meta 一起抹掉，回第 1 周目的全新档。
   * 这是唯一会毁掉跨周目进度的操作，必须走弹窗 + 显式勾选确认，绝不做静默清空。 */
  function wipeSave() {
    SB.ui.render.hideModal();
    SB.state.clearRun();
    try { root.localStorage && root.localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {}
    meta = SB.state.emptyMeta();
    meta.cycle = 1;
    SB.state.saveMeta(meta);
    S = SB.state.freshRun(false);
    clearLog();
    log('存档已清空，回到第 1 周目。轮回点与破层层级一并抹去。');
    dirty = true;
    renderAll();
    SB.state.saveRun(snapshot(S));
  }

  function stay() {
    if (S) S.broken = false;
    SB.ui.render.hideModal();
    dirty = true;
    renderAll();
  }

  function render() { if (dirty) { dirty = false; SB.ui.render.renderAll(); } }
  function renderAll() { dirty = false; SB.ui.render.renderAll(); }
  function markDirty() { dirty = true; }

  function emit(msg) { log(msg); markDirty(); }

  /* 科技泵：尤里卡揭示 + 纪元推进（实现见 tech.js 的 SB.tech.pump）。
   *
   * 【为什么节流】尤里卡条件里有 `rate` 类（要跑一遍 rates()，含加工限流、地热、祭坛烧燃料），
   * 每 tick 全扫一遍等于把最贵的那部分算 10 次/秒，而揭示结果通常几秒才变一次。
   * 于是按累计逻辑时间每 TECH_PUMP 秒扫一次，并在建造/研究/雇佣/采集后**立刻补一次**——
   * built / total / job 这几类条件正是靠这些动作改变的，让它们等 2 秒等于「点了没反应」。
   * 【为什么 emit 可为 null】离线补算一秒内要跑几千 tick，揭示播报得攒到最后统一发。
   *
   * ⚠️ 置脏（markDirty）**只在这个泵真的改了东西时**（2026-09-26 修）。
   *    以前这里无条件 markDirty()，于是每 2 秒（而且是**逻辑秒** —— 10× 速下就是 0.2 秒）
   *    五个 pane 被整块重建一次。两个后果：
   *      ① 科技长卷的 scrollLeft 归零 —— innerHTML 一重写，滚动容器就换了一个元素，
   *         玩家刚滑到后面的纪元就被拽回最左边（用户 2026-09-26 报的那个现象）；
   *      ② pane 里的按钮都会经历「按下与抬起之间被换掉」，那一次点击整个丢失
   *         （render.js 里那条「每帧重画的容器里不许放按钮」讲的就是这件事，
   *          而无条件的泵等于悄悄把「只在脏标记时重画」变成了「每 0.2 秒重画」）。
   *    面板读数的周期刷新不靠这里，挪到 loop 里的 PANE_REFRESH（**墙钟**，不随倍速放大）。 */
  var TECH_PUMP = 2;
  function pumpTech(s, emit) {
    if (!s || !SB.tech || !SB.tech.pump) return;
    var eraBefore = s.era;
    var revealed = SB.tech.pump(s, emit || null) || 0;
    maybeSciencePopup(s);      // 它自己在真弹的时候置脏
    /* 推进纪元也算「变了」：advanceEra 会把新纪元的节点整批转可见，那一帧必须重画。
     * 用 s.era 前后对比判断，而不是让 pump 返回更多东西 —— 返回值已经是「新揭示条数」，
     * 两件事共用一个返回值，将来只改一处就会漏掉另一处。 */
    if (revealed > 0 || s.era !== eraBefore) markDirty();
  }

  /* 市政泵（2026-09-27）。与技术泵同构、同一节奏（TECH_PUMP 逻辑秒一次），
   * 于是「鼓舞条件达成 → 市政揭示」与「尤里卡达成 → 科技揭示」在玩家眼里是同一件事。
   * ⚠️ 必须**单独**有这一个泵：civics.pump 只扫市政表，塞进 tech 的 pump 里会在
   *    技术表迭代时顺带扫一遍无关数据，将来两边各自加条件就分不清谁该重画了。 */
  function pumpCivic(s, emit) {
    if (!s || !SB.civic || !SB.civic.pump) return;
    if (SB.civic.pump(s, emit || null) > 0) markDirty();
  }

  /* 科研面板开门那一刻（docs/TECH_TREE_v0.3.md §2.1，台词由用户 2026-09-25 给定）：
   * 建成第 5 座深海藻场 ⇒ 一个叙事弹窗 + 科技页翻开 + 结绳已在树上（已掌握）。
   * 【为什么挂在 pump 上而不是挂在建造按钮里】门的开合本身是派生的（panelOpen 读结绳的
   * cond），要触发只需「条件一旦跨过就播一次」；pump 恰好每 2 秒跑一次、
   * 玩家动作后又补跑一次，两类情况都覆盖：
   *   ① 玩家自己建到第 5 座 → 建造按钮末尾的那次补跑立刻弹；
   *   ② 离线期间跨过去的 → 补算里的 pump 会弹，不会像离线播报那样被吞掉。
   * 【为什么记账先于弹窗】弹窗回调里要切页、要重渲染，把置位放到回调之后，
   * 同一帧的第二次 pump（构建循环里 2 秒一次 + 动作补跑）就会再弹一遍。 */
  function maybeSciencePopup(s) {
    if (!s || !SB.tech || !SB.tech.panelOpen || SB.tech.popupSeen(s)) return;
    if (!SB.tech.panelOpen(s)) return;
    SB.tech.markPopupSeen(s);
    /* 攒到现在的尤里卡一次性摊开（用户 2026-09-26：「尤里卡等解锁科技之后一起展示」）。
     * 放在弹窗**之前**：玩家被弹窗截住注意力时，日志已经把「这段时间亮了哪些科技」铺好了，
     * 关掉弹窗正好接上按钮那句「进入科技页」。
     * 这条路径同时覆盖在线与离线：离线补算期间 pumpTech 传的是 emit=null（不刷屏），
     * 回来时 finishCatchUp 会走同一个 maybeSciencePopup，攒下的一条都不会丢。 */
    SB.tech.flushEureka(s, emit);
    markDirty();
    /* 【为什么把那段解释性 body 删掉（2026-09-26 用户要求）】
     * 原来那段「分得清今天与明天，就得有人去想明天……」是在替玩家解释这一页是什么，
     * 而按钮、页签名、树上高亮的「结绳（已掌握）」已经把同一件事说了三遍。
     * 用户的原话是「这个不要，就显示『科技页解锁』，按钮是『进入科技页』」。
     * 那两句鲛人打结的台词是用户 2026-09-25 亲自给的（见 TECH_TREE_v0.3.md §2.1），
     * 保留 —— 它们是叙事，不是说明。 */
    SB.ui.render.storyPanel({
      title: '科技页解锁',
      lines: [
        '鲛人将细小坚韧的深海藻类打了个结，「这代表今天，」他说。',
        '随后，他又打了第二个结，「这代表明天。」'
      ],
      ok: '进入科技页',
      onOk: function () {
        if (S === s) setTab('tech');
        var node = document.getElementById('techrow-writing');
        /* ⚠️ 必须显式写 `inline:'center'`。科技页是**横卷**（树比视口宽得多），
         *    默认 inline 是 'nearest' —— 目标在右侧视口外时它不会把 scrollLeft 推过去，
         *    玩家点「进入科技页」之后看到的还是左边空白，结绳在屏幕外几百像素。 */
        if (node && node.scrollIntoView) {
          node.scrollIntoView({ block: 'center', inline: 'center' });
        }
      }
    });
  }

  /* 宗教弹窗（用户 2026-09-29）：建立宗教（神学完成）那一刻播一次叙事弹窗，
   * 并永久解锁「轮回」系统。写法刻意镜像 maybeSciencePopup——挂在泵上、记账先于弹窗、
   * 一次性置脏、离线/读档都靠同样的兜底补播。
   * 【触发点 = 玩家写入宗教名】「建立宗教」= 玩家在命名框敲下第一个名字的那一刻，
   *   而不是神学完成——神学只是点亮命名框的前置。把弹窗挂在对 `s.religionName`
   *   非空的判据上，并在 input.js 的命名框 change 里即时调用，覆盖在线；
   *   泵与读档兜底则保证程序化写入 / 老档也能补播。
   * 【记账先于弹窗】同科技弹窗同理：置位放回调之前，避免同一帧第二次泵又弹一遍。
   * 【永久解锁】religionSeen 写进 meta（跨周目），之后每周目重新命名也不会再弹。 */
  function maybeReligionPopup(s) {
    if (!s || !(s.religionName && s.religionName.trim())) return;
    if (meta.religionSeen) return;
    meta.religionSeen = true;
    SB.state.saveMeta(meta);
    markDirty();
    SB.ui.render.storyPanel({
      title: '轮回系统解锁',
      lines: [
        '鲛人的诵经声伴随深海的浪潮传遍王国的角落，',
        '祭司们说周期性的暖流与浪潮象征着文明的轮回……',
        '从此，每一次终结这一局都将开启一段新的轮回——轮回点可在轮回商店换取永恒的增益。'
      ],
      ok: '了解'
    });
  }

  // ---- 主循环（墙钟驱动）----
  var last = 0;
  var STEP = 0.1;                   // 逻辑步长（秒）。与渲染解耦，保证数值与帧率无关
  /* 时间真值有两个：
   *   ① 墙钟（Date.now）→ 用来判断「玩家离开过多久」，补算离线收益；
   *   ② 帧钟（performance.now）→ 用来决定这一帧推进多少逻辑时间。
   * 以前只跑「回调次数 × 固定步长」，后台标签页里浏览器把定时器节流到 1 次/秒
   * （Chrome 满 5 分钟进一步降到约 1 次/分），时间就跟着被稀释甚至冻住。 */
  var MAX_STEP = 5;                 // 单次回调最多推进 5 秒逻辑时间，防止切回前台一次算爆
  var CATCHUP_BUDGET = 50;          // 离线补算每帧的毫秒预算（占空比 = 50 ÷ 主循环间隔100ms ≈ 50%）
  var PANE_REFRESH = 2000;          // 面板（整块重画那种）的刷新周期，毫秒 **墙钟**

  function loop() {
    var now = (root.performance && performance.now) ? performance.now() : Date.now();
    var wall = Date.now();
    if (!last) last = now;

    /* 离开过的间隙：后台期间定时器基本不跑，这里在下次回调时才算得出来，
     * 于是「离线补算」和「切回前台补算」是同一条路径。 */
    if (S && !S.broken && loop._lastWall) {
      var gap = (wall - loop._lastWall) / 1000;
      if (gap >= CFG.OFFLINE_MIN && !loop.job) planCatchUp(S, gap);
    }
    if (loop.job) drainCatchUp(CATCHUP_BUDGET);
    loop._lastWall = wall;

    var elapsed = Math.min(MAX_STEP, (now - last) / 1000);
    last = now;
    loop.acc = Math.min((loop.acc || 0) + elapsed * speed, Math.max(MAX_STEP, CFG.OFFLINE_MIN));
    /* 补算进行中时暂停实时推进：这段墙钟时间已经在补算里算过了，
     * 再叠加实时 tick 就是重复计时。 */
    while (!loop.job && loop.acc >= STEP && S && !S.broken) {
      SB.economy.tick(S, STEP, emit);   // 天壳推进在 tick 内完成（基础削壳 + 祭坛削壳）
      /* ERA4（2026-10-01）：换季发放资源。标记在 tick 内由 economy.seasonTurn 置位，
       * 这里在 tick 返回后、状态已自洽处发放——避免在 tick 内 call rates() 触发原生段错误。 */
      if (S._seasonGrantPending) { SB.economy.seasonGrant(S); S._seasonGrantPending = false; }
      loop.acc -= STEP;
      loop._tp = (loop._tp || 0) + STEP;
      if (loop._tp >= TECH_PUMP) { loop._tp = 0; pumpTech(S, emit); pumpCivic(S, emit); maybeReligionPopup(S);
        /* 生息区自动升级（2026-09-30 · 封建主义解锁2）：只挂在线泵——离线补算（line ~363）
         * 不调它，离线只结算产出、不替玩家花资源（与离线闸门同一精神）。 */
        if (SB.habitat && SB.habitat.autoTick) SB.habitat.autoTick(S, emit); }
    }

    if (S && !S.broken) {
      /* 面板读数的周期刷新：**墙钟** 2 秒一次，与倍速无关。
       * 【为什么不在泵里顺手置脏】泵按逻辑秒节流，10× 速下等于 0.2 秒一趟，
       * 那是拿「整块重建五个 pane（含 33 个节点的科技长卷）」当代价去刷几个数字，
       * 既把长卷的横向位置冲掉、又会吃掉点击（见 pumpTech 的注释）。
       * 这里用 now（帧钟）而不是逻辑时间：倍速只该加快世界，不该加快 UI 重建。
       * renderTick 仍然是每帧（100ms）走的便宜通道：顶栏、天壳、环境卡、生育条。 */
      if (!dirty && now - (loop._lastPane || 0) >= PANE_REFRESH) {
        loop._lastPane = now; dirty = true;
      }
      if (dirty) renderAll(); else SB.ui.render.renderTick();
    }
    // 存档节流：localStorage 写入较贵，5 秒一次足够
    if (S && !S.broken && now - (loop._lastSave || 0) > 5000) {
      loop._lastSave = now;
      SB.state.saveRun(snapshot(S));
    }
  }

  function offlineCap(s) {
    var step = CFG.OFFLINE_PERK_STEP || 0;
    var lv = (s && s.perk && s.perk.offline) || 0;
    return CFG.OFFLINE_CAP * (1 + step * lv);
  }
  function fmtDur(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? h + ' 小时 ' + m + ' 分' : m + ' 分 ' + Math.floor(sec % 60) + ' 秒';
  }
  function RESS_KEYS() { return SB.RESS ? Object.keys(SB.RESS) : []; }

  /* 离线补算：把 gap 秒按 STEP 切碎喂给同一个 economy.tick，
   * 走的是线上完全相同的结算路径（食物/饿死/生育/削壳/祭坛都包含），不另写一套公式。
   * 【为什么必须分帧】8 小时 = 288000 tick。一次性算完就是一次肉眼可见的卡顿，
   *   而且这是**玩家刚刷新页面时**发生，正好卡在加载上。
   * 于是拆成「计划 → 每帧只花 CATCHUP_BUDGET 毫秒 → 做完发一条播报」。
   * 墙钟耗时 = 纯算量 ÷ 占空比，占空比 = CATCHUP_BUDGET ÷ 主循环间隔(100ms)。
   *   CATCHUP_BUDGET=8  ⇒ 占空比 8%  ⇒ 同样纯算量摊到 12.5 倍墙钟（满档 8h 离线曾达十几秒）；
   *   CATCHUP_BUDGET=50 ⇒ 占空比 50% ⇒ 仅摊到 2 倍。配合 economy.tick 内聚合缓存
   *   （globalMul/gatherMul 等每 tick 只算一次），满档离线从「十几秒」降到「亚秒级」。 */
  function planCatchUp(s, gap) {
    var cap = offlineCap(s);
    var secs = Math.max(0, Math.min(gap, cap));
    var n = Math.floor(secs / STEP);
    if (n <= 0) return;
    var before = {}, k;
    for (k in s.res) before[k] = s.res[k];
    loop.job = {
      s: s, left: n, total: n, secs: secs, cap: cap,
      before: before, bPop: s.pop, bShell: s.shell,
      bFam: s.famineDeaths, bFrost: s.frostDeaths
    };
    /* 离线闸门：补算期间锁住整个界面（#modal 全屏遮罩挡点击），不给确认按钮，
     * 强制等算完（用户 2026-09-29：「离线回来先算完才能操作」）。 */
    SB.ui.render.showOfflineModal({
      title: '离线进度补算中…',
      body: '<div class="note">正在回放你离开期间的产出（食物 / 饿死 / 生育 / 削壳 / 祭坛都包含，与在线同一条结算路径）。</div>' +
            '<div class="note" style="margin-top:8px;color:var(--dim)">离线时长 ' + fmtDur(secs) +
            (secs < gap ? '（封顶 ' + fmtDur(cap) + '，超出部分不计）' : '') + '</div>',
      showProgress: true
    });
    log('离线 ' + fmtDur(secs) + '，正在补算…');
    if (secs < gap) log('补算有上限（' + fmtDur(cap) + '），剩余 ' + fmtDur(gap - secs) + ' 不计。');
  }
  function drainCatchUp(budgetMs) {
    var j = loop.job; if (!j) return;
    if (j.s !== S) { loop.job = null; return; }   // 补算途中重开了周目，作废这一批
    var t0 = Date.now();
    while (j.left > 0 && Date.now() - t0 < budgetMs) {
      SB.economy.tick(j.s, STEP, null);   // emit=null：不刷屏，做完统一播报
      if (j.s._seasonGrantPending) { SB.economy.seasonGrant(j.s); j.s._seasonGrantPending = false; }
      j.left--;
      j.tp = (j.tp || 0) + STEP;
      if (j.tp >= TECH_PUMP) { j.tp = 0; pumpTech(j.s, null); pumpCivic(j.s, null); }
    }
    if (j.total) SB.ui.render.setOfflineProgress((j.total - j.left) / j.total);
    if (j.left <= 0) finishCatchUp(j);
  }
  function finishCatchUp(j) {
    loop.job = null;
    var lines = [], any = false, rk = RESS_KEYS(), i, k, d;
    for (i = 0; i < rk.length; i++) {
      k = rk[i]; d = j.s.res[k] - j.before[k];
      if (Math.abs(d) >= 0.5) { lines.push(SB.RESS[k].name + ' ' + (d >= 0 ? '+' : '') + d.toFixed(0)); any = true; }
    }
    if (j.s.pop !== j.bPop) { lines.push('族民 ' + j.bPop + '→' + j.s.pop); any = true; }
    if (j.s.shell !== j.bShell) { lines.push('壳厚 ' + Math.round(j.bShell) + '→' + Math.round(j.s.shell)); any = true; }
    if (j.s.famineDeaths > j.bFam) { lines.push('饿死 ' + (j.s.famineDeaths - j.bFam)); any = true; }
    if (j.s.frostDeaths > j.bFrost) { lines.push('冻死 ' + (j.s.frostDeaths - j.bFrost)); any = true; }
    var summary = '<div class="note">离开期间结算完成：</div><div style="margin:8px 0;line-height:1.9">' +
      (any ? lines.join('　') : '资源几乎没变（没人干活，或产出被口粮吃光）') + '</div>';
    log('离线结算：' + (any ? lines.join('，') : '资源几乎没变（没人干活，或产出被口粮吃光）') + '。');
    /* 离线闸门第二阶段：把「补算中」换成结算面板，只有点「继续」才解锁界面
     * （否则玩家边补算边点建造，就会看到材料飞快被灌满）。科研 / 宗教开门弹窗
     * 顺延到关掉本面板之后，否则会被本面板覆盖、玩家看不到。 */
    SB.ui.render.showOfflineModal({
      title: '离线结算',
      body: summary,
      ok: '继续',
      onOk: function () { maybeSciencePopup(j.s); maybeReligionPopup(j.s); markDirty(); }
    });
  }
  /* 存档字段取舍：`_` 前缀曾被当成「不落盘」的依据，那是错的——
   * `_grow` 是生育计时（进度条读它，刷新后归零就是漏存），
   * `_cutBase` / `_cutMir` 是削壳累计量（漏存会让破壳面板少算刷新前的部分）。
   * 真正需要排除的临时字段请显式写进 TEMP_KEYS；未登记的字段一律落盘
   * （migrateRun 会按 freshRun 的键过滤未知顶层字段，写进去也不会污染下次读取）。 */
  var TEMP_KEYS = ['_ts'];   // `_ts` 是墙钟时间戳：落盘、读取时手删，不进运行状态
  function snapshot(s) {
    var o = {}, k;
    for (k in s) if (TEMP_KEYS.indexOf(k) < 0) o[k] = s[k];
    o._ts = Date.now();   // 离线补算的墙钟真值，随存档一起落盘
    return o;
  }

  function boot() {
    var saved = SB.state.loadRun();
    if (saved && !saved.broken && saved.shell !== undefined) {
      /* 启动时的离线补算：存档里记了墙钟时间戳 _ts（snapshot 写入），
       * 这一次性补完（沿用 economy.tick 同一条路径），随后 _lastWall 对齐到「现在」
       * ——否则接下来每帧都会把这个已被补掉的间隙再补一遍。 */
      /* 把「上次存档的墙钟时刻」直接当作 _lastWall：下一个回调就会算出真实的离线间隙，
       * 于是启动补算与运行期补算共用同一条路径（boot 里不写第二套判定）。 */
      var ts = saved._ts;
      delete saved._ts;
      if (typeof ts === 'number' && ts > 0) loop._lastWall = ts;
      resumeRun(saved);
    } else {
      startRun();
    }
    SB.ui.render.initTabs();
    SB.ui.render.initSpeeds();
    maybeSciencePopup(S);   // 兜底：读档 / 硬重置后若门槛已过，仍然把开门那一刻补播
    maybeReligionPopup(S);  // 兜底：读档 / 硬重置后若神学已过，仍然把宗教弹窗补播
    document.getElementById('btnBreak').onclick = function () {
      if (S.shell <= 0 && !S.broken) SB.prestige.doBreak(S, emit);
    };
    document.getElementById('btnReset').onclick = function () {
      var t = S ? (S.t / 3600).toFixed(2) + ' 小时 · 峰值族民 ' + S.peak + ' · 建筑 ' + SB.economy.lvlSum(S) + ' 级' : '';
      /* 结算分流（2026-10-05 拍板）：本局研究完《神学》⇒ 走真正轮回结算 doBreak
       * （发点 + 并入旧日遗产账本）；未研究 ⇒ 仅软重置 resetRun，不结算、不发点。
       * 分流判据与 prestige.qualified 同源（本局 civics.theology 真值），不另写第二份。 */
      var qual = SB.game.routeReset(S) === 'break';
      var rep = qual ? SB.prestige.breakReport(S) : null;
      var gained = rep ? rep.tidePoints : 0;
      /* 旧日遗产入账预览：与 doBreak ②③④⑤ 完全同口径（剩余信仰 / 未入藏奇观 / 完整件数），
       * 只做展示不落账——真正的写入只发生在 onOk 的 doBreak 里，这里不产生第二份真相。 */
      var faithAmt = 0, artN = 0, steleN = 0, newW = 0;
      if (qual && S) {
        faithAmt = Math.max(0, (S.res && S.res.faith) || 0);
        artN = Math.floor(Math.max(0, (S.res && S.res.artwork) || 0));
        steleN = Math.floor(Math.max(0, (S.res && S.res.tidalRecord) || 0));
        var meta0 = state();
        if (S.wonders && meta0.memorialWonders)
          for (var wid in S.wonders)
            if (S.wonders[wid] && !meta0.memorialWonders[wid]) newW++;
      }
      SB.ui.render.confirmPanel({
        title: qual ? '轮回（结算并发放轮回点）？' : '重开本周目？',
        body: '<div class="warnbox">当前这局的进度会全部作废：' + t + '。</div>' +
          (qual
            ? '<div class="note">本次轮回将结算并发放：<b>' + gained.toFixed(2) + ' 轮回点</b>' +
              '（按峰值族民 + 建筑纪元 + 工坊解锁项 + 破壳进度计算）。</div>' +
              '<div class="note">旧日遗产入账：剩余信仰 <b>' + SB.economy.fmtAmt(faithAmt) + '</b>' +
              '（并入跨周目总量，按数量级给全产加成）；纪念奇观新入藏 <b>' + newW + '</b> 座' +
              '（每座 +1% 科技/市政获取）；旧日艺术品 <b>' + artN + '</b> 件（固定市政点/秒）；' +
              '旧日潮纹碑石 <b>' + steleN + '</b> 件（固定科技点/秒）。</div>' +
              '<div class="note">已持有的跨周目资产（轮回点、破层层级、已购增益、科技记录）继续保留。周目计数会 +1。</div>'
            : '<div class="note">（未研究《神学》）此次仅重开本周目：不结算、不发放轮回点、不入账旧日遗产。</div>' +
              '<div class="note">已持有的跨周目资产继续保留。周目计数会 +1。</div>'),
        ok: qual ? '轮回' : '重开',
        onOk: function () { if (qual) SB.prestige.doBreak(S, emit); else SB.game.resetRun(); }
      });
    };
    document.getElementById('btnWipe').onclick = function () {
      SB.ui.render.confirmPanel({
        title: '清空存档？',
        body: '<div class="warnbox">这会删掉<b>全部跨周目进度</b>：轮回点、破层层级、已购增益、科技记录，以及当前这局的一切。</div>' +
              '<div class="note">页面会回到第 1 周目的全新状态。此操作不可撤销。</div>',
        danger: true,
        requireCheck: '我明白这会抹掉全部轮回点与破层层级，且无法撤销',
        ok: '清空存档',
        onOk: function () { SB.game.wipeSave(); }
      });
    };
    /* 关标签页 / 刷新前立刻落盘：有 5 秒节流在，玩家在这一窗口里刷新就会丢最后几秒，
     * 具体丢掉的是生育计时 _grow 这类累加量——进度条看着像「刷新归零」。 */
    function flush() { if (S && !S.broken) SB.state.saveRun(snapshot(S)); }
    if (root.addEventListener) root.addEventListener('pagehide', flush);
    if (document && document.addEventListener) document.addEventListener('visibilitychange', function () {
      if (document.hidden) flush();
    });
    if (root.setInterval) root.setInterval(loop, 100);
  }

  SB.game = {
    run: run, meta: state, getTab: getTab, setTab: setTab, setSpeed: setSpeed,
    toggleMiracle: toggleMiracle,
    startRun: startRun, nextCycle: nextCycle, stay: stay,
    resetRun: resetRun, routeReset: routeReset, wipeSave: wipeSave,
    log: log, emit: emit, markDirty: markDirty, pumpTech: pumpTech, pumpCivic: pumpCivic,
    maybeReligionPopup: maybeReligionPopup,
    render: render, renderAll: renderAll, boot: boot, snapshot: snapshot,
    showBreakPanel: function (r) { SB.ui.render.showBreakPanel(r); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
