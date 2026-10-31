/* 天壳 / SHELLBREAK — 自然环境与持久状态行渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  var CFG = SB.CFG;
  function el(id) { return root.document.getElementById(id); }

  /* ── 奇观机器横幅小图标（2026-10-23 用户拍：自然环境卡里两台奇观机器挂奇观图标）──
   * 图源**单点复用** render-content.js 的 WONDER_ART（奇观页 36×36 同一张表）——
   * 在这里再写一份路径就是「同一张路径表抄两遍」，改一处忘另一处必漂。
   * 尺寸缩到 22px 适配横幅行高；图缺失时回退 ✦ 字符（与奇观页 fallback 同形态）。
   * 纯展示、无事件：两条横幅的按钮都在 .nm 之外的兄弟节点，不受每帧签名重建影响。 */
  function envWonderIcon(id) {
    var art = SB.ui.renderContent && SB.ui.renderContent.WONDER_ART && SB.ui.renderContent.WONDER_ART[id];
    return art
      ? '<img class="env-wonder-icon" src="' + art + '" alt="" aria-hidden="true" width="22" height="22" loading="lazy" decoding="async">'
      : '<span class="env-wonder-icon env-wonder-icon-fallback" aria-hidden="true">✦</span>';
  }

  /* ── 自然环境：天壳（上面那条 shellbar）+ 海底火山（这里这行）─────────────
   * 【为什么这两件事归到一张卡】用户 2026-09-26 指出：海底火山是**读天候的**，
   *   和天壳是同一类东西，摆在「巢穴」页那堆建造动作里没有归属感。
   *   拆分口径：巢穴页只答「我要做什么」，自然环境只答「外面现在什么样」。
   * 【为什么内容在这里拼、不写进 index.html】它随「历法」是否掌握整块换文案 ——
   *   静态 HTML 只能写「没掌握」的那一半，掌握之后那一半无处可放。
   * 没掌握历法时不显示读数，只给一句「看不出规律」——**这条信息缺口本身就是奖励**，
   * 玩家因此知道有件事还没解锁，而不是盯着一个没有解释的百分比。
   * 读数走 economy.seasonMeta，它读的是 seasonMul(s, relief)（玩家已享受到的那个数），
   * 不是 SEASONS[i].mult 的裸值——否则学了历法反而看到倍率“变差了”。
   * ⚠️ 2026-09-30：relief 也要并进去——烧暖石时这一格会从 0.573 抬到 0.947。
   *   卡片写的是「这一季深海藻场产出」，漏掉 relief 就是「面板撒谎」：
   *   拨开关数字不动，玩家只能得出「开关没用」。
   * ⚠️ 这个容器是每帧重画的（季节会变），所以**它里面不许放按钮**：每帧重建 DOM 会让
   *    「按下与抬起之间元素被换掉」的那次点击整个丢失。要塞东西进来先确认它是纯读数。
   *    （暖石开关曾经因此留在巢穴页；2026-09-27 用户要求搬到这张卡，于是另开一个
   *     #envWarm 容器 + **状态签名节流**——见下面 renderWarm，同样每帧刷但不无谓重建。）
   * ⚠️ 文案一样就不写回 innerHTML：内容其实只在换季那一刻变，10 次/秒的无谓重建
   *    既费 DOM 又会让文本选中被反复清掉。 */
  var envCache = '';
  function renderEnv(s) {
    if (!s) return;
    var box = el('envVolcano'); if (!box) return;
    var sm = SB.economy.seasonMeta(s);
    var html = '<div><div class="nm">海底火山 · ' +
      (sm.known ? sm.name : '看不出规律') + '</div><div class="ds">' +
      (sm.known
        ? '这一季深海藻场产出 ×' + sm.mult.toFixed(3) +
          '；约 ' + sm.left + ' 潮日后转<b>' + sm.next + '</b>。'
          + (sm.mult < 1 ? '<span style="color:var(--red)">减产季。</span>' : '')
        : '族民记下的次数对不上潮水的涨落——「历法」能把这一季的周期与减产幅度读出来。')
      + '</div></div>';
    if (html === envCache) return;
    envCache = html;
    box.innerHTML = html;
  }

  /* ── 暖石开关（「保温法」那道开关）────────────────────────────────────
   * 【为什么它住在这一卡而不是巢穴页】用户 2026-09-27 拍板：开关效果**只在寒流季发生**
   *   （见 economy.warmBurningNow 的季节闸），而寒流季是海底火山那条周期的一部分。
   *   摆在「建造 / 我要做什么」那一堆里，玩家是在考虑造什么时才找开关——
   *   恰好是永远用不上它的语境。自然环境卡才是「外面现在什么天候」的语境。
   * 【为什么它不能塞进 #envVolcano】那个容器每帧重画、纯读数。按钮在里面会被反复换掉，
   *   input.js 是 document 级委托，换掉之后 pointerup 落在已移除的元素上 ⇒ 那次点击整个丢。
   * 【怎么做到「也每帧刷、又不丢点击」】状态签名节流：
   *   签名 = 开/关 × 寒流季/非 × 正在烧/否 —— 三个量一季最多变几次，
   *   签名不变就**一个 DOM 节点都不动**，按钮元素始终在位。
   *   库存数字（每帧都可能变）走独立 span 的 textContent 单独刷，不进签名。
   * ⚠️ 别把库存数字并回签名：暖石烧起来时它每秒变 10 次（STEP=0.1），
   *   那会让按钮每 100ms 重建一次，点击必然丢——正是这套节流要防的事。
   * 面板四种状态，少写一种玩家就会以为开关坏了：
   *   没这项科技（整行不显示）/ 已关 / 待命（非寒流季，不耗石）/ 石不够 / 正在烧。 */
  var warmSig = '';
  function renderWarm(s) {
    var box = el('envWarm'); if (!box) return;
    var hasThermal = !!(s.techs && s.techs.thermal);
    if (!hasThermal) {
      if (warmSig !== '') { warmSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    /* 闸的判据在 economy.warmBurningNow（mult<1），这里只做展示层的归类：
     * 用 season 而不是 burning 反推「非寒流季」——烧不烧还叠加了石够不够，
     * 反推会把「石不够」误报成「不在寒流季」，提示就自相矛盾了。 */
    var inCold = SB.economy.season(s).mult < 1;
    var challengeBlocksHeating = !!(SB.challenges && SB.challenges.warmHeatingBlocked(s));
    var burning = SB.economy.warmBurning(s);
    var sig = (s.warmOn ? 'on' : 'off') + '|' + (inCold ? 'c' : 'w') + '|' +
      (challengeBlocksHeating ? 'x' : '-') + '|' + (burning ? 'b' : '-');
    if (sig !== warmSig) {
      warmSig = sig;
      var live = s.warmOn && (s.res.warmstone || 0) > 0;
      box.innerHTML = '<div><div class="nm">暖石开关 <span class="tag" id="envWarmWs">0</span></div>' +
        '<div class="ds">保温法：烧暖石（' + SB.CFG.WARM_RATE +
        '/秒）<b>只在寒流季生效</b>——顶回藻场减产（不是全额，留一点残余），' +
        '寒流季若触发冰封期则冻伤归零。一份暖石两件事都靠它，其余季不耗石。' +
        (challengeBlocksHeating ? '<br><b>寒流禁火挑战：寒流季保温法停用；热泉炉和热液设备仍照常运行。</b>' : '') +
        '</div></div>' +
        /* 按钮文案 = **当前状态**（底色表态：绿=启用 / 灰=停用），不是「点了会怎样」——
         * 原先写「开/关」两可，玩家读不出此刻到底是开是关（用户 2026-09-30 报）。
         * 正在烧时再加一圈琥珀描边，把「已启用」与「真在烧」两个状态分开。 */
        '<button class="btn tog' + (s.warmOn ? ' on' : '') + (burning ? ' burning' : '') +
        '" data-warm="1"' + (challengeBlocksHeating ? ' disabled' : '') +
        ' title="' + (challengeBlocksHeating ? '寒流禁火挑战：寒流季禁止保温燃烧' : '点击切换启用 / 停用') + '">' +
        (challengeBlocksHeating ? '寒流禁用' : s.warmOn ? '启用' : '停用') + '</button>';
    }
    /* 库存数字单独刷：不进签名，所以烧起来时它是唯一在动的节点，按钮不动。 */
    var ws = el('envWarmWs');
    if (ws) ws.textContent = Math.floor(s.res.warmstone || 0);
  }

  function renderCore(s) {
    var box = el('envCore'); if (!box) return;
    var owned = !!(SB.wonder && SB.wonder.owned && SB.wonder.owned(s).wonder_terra_core);
    if (!owned) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    var charge = Math.max(0, Math.min(50000000, (s.res && s.res.coreCharge) || 0));
    var pct = charge / 50000000 * 100;
    var flow = SB.economy.hydroAlloc(s, 1);
    var net = flow.coreNetRate || 0;
    var sign = net > 0 ? '+' : '';
    var vat = SB.economy.activeTerraVat(s);
    var html = '<div><div class="nm">' + envWonderIcon('wonder_terra_core') + '泰拉中央星核炉芯' +
      '<span class="tag">' + pct.toFixed(2) + '%</span></div>' +
      '<div class="ds">储能 ' + SB.economy.fmtAmt(charge) + ' / 50M · 净增 ' + sign + net.toFixed(2) + '/秒' +
      (vat ? ' · 水舱运行 ' + vat + ' 座（优先耗池，池空后占热液能流）' : '') + '</div>' +
      '<div class="tree-progress"><i style="width:' + pct.toFixed(2) + '%"></i></div></div>';
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  /* ── 天穹钻机启动行（2026-10-07）────────────────────────────────────
   * 【为什么它住在这一卡】与暖石开关同一个归属逻辑：钻机是「读着天壳才用得上」的动作
   *   （壳削到 25% 下限后才有意义），看壳的地方就是用它的地方。原「剥壳工程」页签
   *   同日删除（用户：「这个标签不需要保留」），钻机的入口从页签收成这一行。
   * 【状态签名节流】与 renderWarm 同一套纪律：#envDrill 是每帧刷的容器，但只在
   *   签名（启动/停 × 运转/停摆）变化时才重写 innerHTML，按钮元素始终在位不丢点击；
   *   共振钻头库存（每帧都可能变）走独立 span 的 textContent 单独刷，不进签名。
   * 【面板三态】未启动（灰按钮）/ 运转中 / 停摆——停摆 = 开着但缺料，是 shell.tickShell
   *   的 skydrillStarved 位；原因只有两种：共振钻头见底，或热液能剩流 < 20/s。
   *   每种都把「为什么」写全，否则玩家读不出该去补哪条线。
   * 【隐藏态】未建成奇观——整行不显示。
   * 【阶段转换】破壳后机器不再作为操作项，改显示已生效的奇观属性。 */
  var drillSig = '';
  function renderDrill(s) {
    var box = el('envDrill'); if (!box) return;
    var owned = !!(SB.wonder && SB.wonder.owned(s).wonder_skydrill);
    if (!owned) {
      if (drillSig !== '') { drillSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    if (SB.wonder.skydrillPostBreak(s)) {
      var postBreakSig = 'post-break';
      if (drillSig !== postBreakSig) {
        drillSig = postBreakSig;
        var civicBonus = SB.wonder.skydrillCivic(s);
        var happyBonus = SB.wonder.skydrillHappyOffset(s);
        box.innerHTML = '<div><div class="nm">' + envWonderIcon('wonder_skydrill') + '天穹钻机 <span class="tag ok">破壳后奇观效果</span></div>' +
          '<div class="ds">市政点 +' + civicBonus + '/秒；幸福度 ' + (happyBonus >= 0 ? '+' : '') +
          happyBonus + '。此处显示的是破壳后的常驻效果。</div></div>';
      }
      return;
    }
    var starved = !!s.skydrillStarved && !!s.skydrillOn;
    /* ⚠️ 2026-10-07 用户报「已启动还是没反应」：停摆文案原是「钻头见底，或剩流不足」二选一
     *   的泛化句，玩家读不出自己卡在哪条。改为**带实测数字**的诊断：
     *   hydroAlloc(s,1) 是纯函数（dt=1 ⇒ 各字段已是每秒口径），直接给出供/吃/剩三数，
     *   并按「哪条线缺」分流文案——缺钻头说钻头，缺剩流就报汽轮机供给与工坊吃量。
     * ⚠️ 剩流整数部分纳入签名：玩家升汽轮机时这行数字跟着刷新（每 +1/s 重写一次），
     *    否则「补足了但文案还报旧数」又是一条面板撒谎。 */
    var _HF = (SB.economy && SB.economy.hydroAlloc) ? SB.economy.hydroAlloc(s, 1) : null;
    var _left = _HF ? Math.max(0, _HF.left) : 0;
    /* 停摆子因（缺钻头 / 缺剩流）**读引擎的 skyStopWhy**，面板不再自算阈值：
     *   旧写法 `(s.res.resonantDrill||0) < SKYDRILL_DRILL` 是「每秒 0.1」的口径，
     *   而引擎那道门当时错写成「热液能 20×dt」⇒ 这个分支永不触发，徽标与文案
     *   一律甩锅给热液能，玩家（2026-10-29）反馈「看不出钻头不够」正是这里。
     *   现在两边同一判据 ⇒ 补完钻头徽标自动切回「停摆：热液能」，不会二次撒谎。 */
    var _stopWhy = (starved && _HF && _HF.skyStopWhy) ? _HF.skyStopWhy : null;
    var _drillNoBit = starved && (_stopWhy ? _stopWhy === 'bit'
      : (s.res.resonantDrill || 0) < SB.CFG.SKYDRILL_DRILL);
    var sig = (s.skydrillOn ? 'on' : 'off') + '|' + (starved ? 's' : '-') + '|' +
      (starved ? (_drillNoBit ? 'd' : 'h') : '-') + '|' +
      Math.min(999, Math.floor(_left));
    if (sig !== drillSig) {
      drillSig = sig;
      var ds;
      if (!s.skydrillOn) {
        ds = '建成即就绪，尚未启动。点右侧按钮开始凿穿最后 ' + (CFG.FLOOR_AT * 100) +
          '% 壳厚——运转期间持续吃共振钻头（' + SB.CFG.SKYDRILL_DRILL + '/秒）与热液能（' +
          SB.CFG.SKYDRILL_HYDRO + '/秒，从热液工坊吃剩的流里取）。';
      } else if (starved) {
        if ((s.res.resonantDrill || 0) < SB.CFG.SKYDRILL_DRILL) {
          /* ⚠️ 不能 Math.floor：库存按 0.1/秒扣，常态是小数（0.4 / 0.9），
           *    floor 会印成「现存 0」——玩家以为自己一个钻头都没有，实际只是不足 1 个。 */
          ds = '停摆：共振钻头不足（现存 ' + (s.res.resonantDrill || 0).toFixed(1) +
            '，运转每秒耗 ' + SB.CFG.SKYDRILL_DRILL + '）。去工坊打「共振钻头」补货，补足后自动恢复，无需重启。';
        } else {
          var _tur = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
          ds = '停摆：热液能剩流 ' + _left.toFixed(1) + '/秒，不足 ' + SB.CFG.SKYDRILL_HYDRO +
            '/秒——汽轮机运行 ' + _tur + ' 座供 ' + (_HF ? _HF.supplyRate.toFixed(1) : '?') +
            '/秒，热液工坊吃 ' + (_HF ? _HF.shopRate.toFixed(1) : '?') + '/秒。' +
            '升汽轮机（每级 +1/秒）或停用热液工坊；暖石断供汽轮机也会停产。补足后自动恢复，无需重启。';
        }
      } else {
        ds = '运转中：钻头以 ' + SB.CFG.SKYDRILL_RATE + ' 点/秒削壳（轮回「壳层勘探」可再加成），吃完停摆、补足自动续。';
      }
      box.innerHTML = '<div><div class="nm">' + envWonderIcon('wonder_skydrill') + '天穹钻机' +
        (starved ? '<b class="lack-tag is-stop">缺' + (_drillNoBit ? '钻头' : '热液能') + ' · 停摆</b>' : '') +
        ' <span class="tag" id="envDrillCt">0</span></div>' +
        '<div class="ds">' + ds + '</div></div>' +
        '<button class="btn tog' + (s.skydrillOn ? ' on' : '') +
        '" data-skydrill="1" title="点击启动 / 停机">' + (s.skydrillOn ? '已启动' : '已停机') + '</button>';
    }
    var ct = el('envDrillCt');
    if (ct) {
      /* ⚠️ 不能 floor：钻头按 0.1/秒扣，库存常态是小数（0.9 会显示成「0 钻头」）。
       *    ≥10 取整（小数位无意义），否则保留 1 位。 */
      var _bits = s.res.resonantDrill || 0;
      ct.textContent = (_bits >= 10 ? Math.floor(_bits) : _bits.toFixed(1)) + ' 钻头';
    }
  }

  /* ── 星球重构机 G.E.E.K 开关（ERA9 · 生态重塑解锁奇观，2026-10-19 实装）──
   * 【面板三态】未启动（灰按钮）/ 运转中（带进度条）/ 停摆（开着但缺料或断流）。
   *   停摆 = shell.tickShell ③段的 geekStarved 位；原因：藻食/金属/珊瑚见底，或热液能剩流不足。
   * 【隐藏态】未建成奇观（wonder.need='ecological_restoration' 未满足）——整行不显示。
   * 【阶段转换】瑞亚完成 → 泰拉阶段（需研究 terraform）；两段共用同一启动开关，进度条切换文案。
   * 【无幸福度副作用】运行态不加 −1（用户拍板）。 */
  /* 倒计时格式化（游戏内剩余秒 → H:MM:SS / MM:SS）。G.E.E.K 改造耗时 1800/3600 游戏秒，
   * 1× 下与真实秒等价；2× 广告加速下真实等待减半——这里显示的是进度口径的「游戏内剩余时间」。 */
  function fmtGeekDur(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  var geekSig = '';
  function renderGeek(s) {
    var box = el('envGeek'); if (!box) return;
    var owned = !!(SB.wonder && SB.wonder.owned(s).wonder_geek);
    if (!owned) {
      if (geekSig !== '') { geekSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    var starved = !!(s.geekStarved && s.geek && s.geek.geekOn);
    var enceladusDone = !!(s.geek && s.geek.enceladusDone);
    var terraDone = !!(s.geek && s.geek.terraDone);
    var terraUnlocked = !!((s.techs && s.techs.terraform) && !terraDone);
    var phaseKey, phaseTxt, prog, total;
    /* ★ 2026-10-21（用户拍）：G.E.E.K 开工要有**进度条 + 倒计时**。
     *   ⚠️ 根因：原进度条用 class="progbar"，而全站 CSS 只定义了 .prog / .prog i（grep 全仓无 .progbar 规则）
     *     ⇒ 那条 <i> 没有高度/背景，width 设了也**看不见**——用户实测「没有进度条」。修正 = 改用 .prog。
     *   倒计时 = 剩余游戏内秒，每帧实时刷（不进签名、不重建 DOM，平滑且避免点击丢）。 */
    if (!enceladusDone) {
      phaseKey = 'e'; phaseTxt = '恩克拉多斯星改造';
      prog = s.geek ? s.geek.enceladusRun || 0 : 0;
      total = SB.economy && SB.economy.starTerraformDuration
        ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_ENCELADUS_SECONDS) : SB.CFG.GEEK_ENCELADUS_SECONDS;
    } else if (terraUnlocked) {
      phaseKey = 't'; phaseTxt = '泰拉星改造';
      prog = s.geek ? s.geek.terraRun || 0 : 0;
      total = SB.economy && SB.economy.starTerraformDuration
        ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_TERRA_SECONDS) : SB.CFG.GEEK_TERRA_SECONDS;
    } else { phaseKey = 'E'; phaseTxt = '恩克拉多斯已完成'; prog = 0; total = 1; }
    var _pct = total > 0 ? Math.max(0, Math.min(100, 100 * prog / total)) : 0;
    var _pctInt = Math.floor(_pct);
    var _HF = (SB.economy && SB.economy.hydroAlloc) ? SB.economy.hydroAlloc(s, 1) : null;
    var _left = _HF ? Math.max(0, _HF.left) : 0;
    var _running = !!(s.geek && s.geek.geekOn) && !starved && phaseKey !== 'E';
    /* 停摆子因（四样材料见底 / 热液能不足）：与下面 ds 分支**同一条件**，按同一顺序取第一个见底的。
     * 纳入签名让徽标跟着切，避免「补完这样、徽标还写着这样」。 */
    var _geekLackName = '';
    if (starved) {
      if ((s.res.kelp || 0) < SB.CFG.GEEK_KELP) _geekLackName = '藻食';
      else if ((s.res.silt || 0) < SB.CFG.GEEK_METAL) _geekLackName = '金属';
      else if ((s.res.stone || 0) < SB.CFG.GEEK_STONE) _geekLackName = '石头';
      else if ((s.res.coral || 0) < SB.CFG.GEEK_CORAL) _geekLackName = '珊瑚';
      else _geekLackName = '热液能';
    }
    var sig = (s.geek && s.geek.geekOn ? 'on' : 'off') + '|' + (starved ? 's' : '-') + '|' +
      _geekLackName + '|' + phaseKey + '|' + _pctInt;
    if (sig !== geekSig) {
      geekSig = sig;
      var ds;
      if (!s.geek || !s.geek.geekOn) {
        ds = '星球重构机已就绪，尚未启动。点右侧按钮开始' + (enceladusDone ? '泰拉星改造' : '恩克拉多斯星改造') +
          '——运转期间持续吃热液能（' + SB.CFG.GEEK_HYDRO + '/秒，从热液工坊剩流取）+ 藻食(' + SB.CFG.GEEK_KELP +
          '/秒)+金属(' + SB.CFG.GEEK_METAL + '/秒)+石头(' + SB.CFG.GEEK_STONE + '/秒)+珊瑚(' + SB.CFG.GEEK_CORAL + '/秒)。';
      } else if (starved) {
        if ((s.res.kelp || 0) < SB.CFG.GEEK_KELP || (s.res.silt || 0) < SB.CFG.GEEK_METAL || (s.res.stone || 0) < SB.CFG.GEEK_STONE || (s.res.coral || 0) < SB.CFG.GEEK_CORAL) {
          ds = '停摆：材料见底（现存 藻食 ' + Math.floor(s.res.kelp || 0) + ' / 金属 ' + Math.floor(s.res.silt || 0) +
            ' / 石头 ' + Math.floor(s.res.stone || 0) + ' / 珊瑚 ' + Math.floor(s.res.coral || 0) +
            '，运转每秒耗 ' + SB.CFG.GEEK_KELP + '/' + SB.CFG.GEEK_METAL + '/' + SB.CFG.GEEK_STONE + '/' +
            SB.CFG.GEEK_CORAL + '）。补足后自动恢复，无需重启。';
        } else {
          ds = '停摆：热液能剩流 ' + _left.toFixed(1) + '/秒，不足 ' + SB.CFG.GEEK_HYDRO + '/秒——汽轮机供 ' +
            (_HF ? _HF.supplyRate.toFixed(1) : '?') + '/秒，热液工坊吃 ' + (_HF ? _HF.shopRate.toFixed(1) : '?') +
            '/秒。升汽轮机或停用热液工坊；补足后自动恢复，无需重启。';
        }
      } else if (phaseKey === 'E') {
        ds = '恩克拉多斯星改造已完成。研究《星球改造》后可启动泰拉星改造。';
      } else {
        ds = '运转中：' + phaseTxt + '。缺料暂停、进度保留，补足自动续。';
      }
      var _remTag = _running ? '<span class="tag" id="envGeekRemain"></span>' : '';
      box.innerHTML = '<div><div class="nm">' + envWonderIcon('wonder_geek') + '星球重构机 G.E.E.K ' +
        (starved ? '<b class="lack-tag is-stop">缺' + _geekLackName + ' · 停摆</b>' : '') +
        (enceladusDone ? '<span class="tag ok">恩克拉多斯已完成</span>' : '') +
        (terraDone ? '<span class="tag ok">泰拉已完成</span>' : '') + _remTag + '</div>' +
        '<div class="prog"><i id="envGeekBar" style="width:' + _pct.toFixed(2) + '%"></i></div>' +
        '<div class="ds" id="envGeekDs">' + ds + '</div></div>' +
        '<button class="btn tog' + ((s.geek && s.geek.geekOn) ? ' on' : '') +
        '" data-geek="1" title="点击启动 / 停机">' + ((s.geek && s.geek.geekOn) ? '已启动' : '已停机') + '</button>';
    }
    /* 每帧实时刷新：进度条宽度（Fractional，平滑）+ 倒计时（剩余游戏内秒）。
     * 不进签名 ⇒ 即使 <1% 的细微推进也看得见，倒计时也不跳格。 */
    if (_running) {
      var _bar = el('envGeekBar'); if (_bar) _bar.style.width = _pct.toFixed(2) + '%';
      var _cd = el('envGeekRemain');
      if (_cd) _cd.textContent = '倒计时 ' + fmtGeekDur(Math.max(0, total - prog));
    }
    /* 每帧实时刷新「停摆原因」文案（材料见底/热液能不足的子因 + 现存数量），
     * 不进签名 ⇒ 即便仍处 starved（签名不变），子因切换 / 现存数值变化也能即时反映。 */
    if (starved && phaseKey !== 'E') {
      var _d = el('envGeekDs');
      if (_d) {
        if ((s.res.kelp || 0) < SB.CFG.GEEK_KELP || (s.res.silt || 0) < SB.CFG.GEEK_METAL || (s.res.stone || 0) < SB.CFG.GEEK_STONE || (s.res.coral || 0) < SB.CFG.GEEK_CORAL) {
          _d.innerHTML = '停摆：材料见底（现存 藻食 ' + Math.floor(s.res.kelp || 0) + ' / 金属 ' + Math.floor(s.res.silt || 0) +
            ' / 石头 ' + Math.floor(s.res.stone || 0) + ' / 珊瑚 ' + Math.floor(s.res.coral || 0) +
            '，运转每秒耗 ' + SB.CFG.GEEK_KELP + '/' + SB.CFG.GEEK_METAL + '/' + SB.CFG.GEEK_STONE + '/' +
            SB.CFG.GEEK_CORAL + '）。补足后自动恢复，无需重启。';
        } else {
          _d.innerHTML = '停摆：热液能剩流 ' + _left.toFixed(1) + '/秒，不足 ' + SB.CFG.GEEK_HYDRO + '/秒——汽轮机供 ' +
            (_HF ? _HF.supplyRate.toFixed(1) : '?') + '/秒，热液工坊吃 ' + (_HF ? _HF.shopRate.toFixed(1) : '?') +
            '/秒。升汽轮机或停用热液工坊；补足后自动恢复，无需重启。';
        }
      }
    }
  }

  /* ── 星空观测站开关（2026-10-12 用户拍板「可开关」）────────────────
   * 【为什么住在这一卡】与暖石/钻机同归属逻辑：观测站是「看星空进度才有用」的动作，
   *   自然环境卡就是它的天然位置。星空探索资源行在 #res（每帧刷），但开关是**手动动作**，
   *   按 warm/drill 同纪律放在持久容器 #envStar，签名节流避免点击丢。
   * 【状态签名节流】签名固定为 'fixed'（顶栏已无开关，2026-10-17 重构）；只有隐藏↔显示翻转才重写 innerHTML。
   *   星空探索速率（每帧可能变，热液剩流不够会降）走独立 span 的 textContent 单独刷，不进签名。
   * 【隐藏两态】破壳前（s.broken 未置）整行不显示；破壳后星空槽才开始被动累积。 */
  var starSig = '';
  function renderStar(s) {
    var box = el('envStar'); if (!box) return;
    /* 闸门：破壳后（s.broken）星空槽才开始累积。顶栏已无全局暂停开关（2026-10-17 重构）。 */
    if (!(s.shell <= 0 && (s.broken || s.shellOpened || s.breakSettled))) {
      if (starSig !== '') { starSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    /* 顶栏不再有全局暂停开关（2026-10-17 重构）：基础文明推力始终累积，
     *   卫星/空间站各自的「开几座」开关只控制它们的贡献。本卡只显示速率与说明。 */
    if (starSig !== 'fixed') {
      starSig = 'fixed';
      box.innerHTML = '<div><div class="nm">星空槽 <span class="tag" id="envStarRt">0</span></div>' +
        '<div class="ds">破壳后由文明推力（人口/建筑/科技/轮回增益）被动累积星空探索，满槽即太空时代达成。' +
        '卫星/空间站各自的「开几座」开关可单独停掉它们的星空贡献。</div></div>';
    }
    /* 速率单独刷：不进签名，所以文明推力变化时它是唯一在动的节点，按钮不动。 */
    var rt = el('envStarRt');
    if (rt) {
      var _sr = (SB.economy && SB.economy.starRate) ? SB.economy.starRate(s) : 0;
      rt.textContent = (_sr != null ? _sr : 0).toFixed(2) + '/秒';
    }
  }

  /* ── 热液能流（ERA3+）：能源读数放在自然环境卡底部，脱离材料库存栏。
   * 热液能是瞬时流而不是库存：hydroAlloc(s,1) 与本 tick 的供需分配同源，
   * 展示总供给、开启负载的总需求与可正可负的净余量；不把流量快照误读成库存。
   * 容器与子节点只在解锁后创建一次，之后仅更新 textContent / 宽度，避免每帧重建。 */
  var hydroBuilt = false;
  function renderHydro(s) {
    var box = el('envHydro'); if (!box) return;
    var unlocked = !!(SB.economy && SB.economy.resUnlocked(s, 'hydro'));
    if (!unlocked) { box.style.display = 'none'; return; }
    box.style.display = '';
    if (!hydroBuilt) {
      hydroBuilt = true;
      box.innerHTML = '<section class="hydro-panel">' +
        '<div class="hydro-head"><span class="hydro-icon" aria-hidden="true"><img src="assets/resource-icons/hydro.png?v=2" alt="" width="30" height="30"></span>' +
        '<div class="hydro-title"><b>热液能流</b><span>即产即用 · 净余量 = 供给 − 需求</span></div>' +
        '<span class="hydro-live" id="hydroLive"><i></i><span id="hydroLiveLabel">实时分配</span></span></div>' +
        '<div class="hydro-metrics">' +
        '<div class="hydro-metric"><span>总供给</span><b><span id="hydroSupply">0.0</span><small>/秒</small></b></div>' +
        '<div class="hydro-metric"><span>总需求</span><b><span id="hydroDemand">0.0</span><small>/秒</small></b></div>' +
        '<div class="hydro-metric hydro-metric-balance" id="hydroBalanceMetric"><span>净余量</span><b><span id="hydroBalance">+0.0</span><small>/秒</small></b></div>' +
        '</div>' +
        '<div class="hydro-track" role="img" aria-label="热液能供给覆盖需求比例">' +
        '<i class="hydro-supply-fill" id="hydroSupplyFill"></i><i class="hydro-deficit-fill" id="hydroDeficitFill"></i></div>' +
        '<div class="hydro-routing">' +
        '<div class="hydro-route"><b>来处</b><span id="hydroSources">暂无供给来源</span></div>' +
        '<div class="hydro-route"><b>去处</b><span id="hydroUses">暂无设备取用</span></div>' +
        '</div>' +
        '<div class="hydro-shortage" id="hydroShortage" hidden>' +
        '<b id="hydroShortageTitle"></b><span id="hydroShortageItems"></span></div>' +
        '<div class="hydro-foot"><span id="hydroFlowHint">余流不会累积到下一秒</span></div>' +
        '</section>';
    }
    var flow = SB.economy.hydroAlloc(s, 1);
    var supply = Math.max(0, flow.supplyRate || 0);
    var demand = Math.max(0, flow.demandRate || 0);
    var balance = isFinite(flow.balanceRate) ? flow.balanceRate : supply - demand;
    var supplyCover = demand > 0 ? Math.max(0, Math.min(100, supply / demand * 100)) : (supply > 0 ? 100 : 0);
    var deficitPct = demand > supply && demand > 0 ? Math.max(0, Math.min(100, (demand - supply) / demand * 100)) : 0;
    var supplyEl = el('hydroSupply'), demandEl = el('hydroDemand'), balanceEl = el('hydroBalance');
    var supplyFill = el('hydroSupplyFill'), deficitFill = el('hydroDeficitFill');
    if (supplyEl) supplyEl.textContent = supply.toFixed(1);
    if (demandEl) demandEl.textContent = demand.toFixed(1);
    if (balanceEl) balanceEl.textContent = (balance >= 0 ? '+' : '') + balance.toFixed(1);
    if (supplyFill) supplyFill.style.width = supplyCover.toFixed(2) + '%';
    if (deficitFill) deficitFill.style.width = deficitPct.toFixed(2) + '%';
    var balanceMetric = el('hydroBalanceMetric'), live = el('hydroLive'), liveLabel = el('hydroLiveLabel');
    var inDeficit = balance < -0.005;
    if (balanceMetric) balanceMetric.classList.toggle('is-negative', inDeficit);
    if (balanceMetric) balanceMetric.classList.toggle('is-positive', !inDeficit);
    if (live) live.classList.toggle('is-deficit', inDeficit);
    if (liveLabel) liveLabel.textContent = inDeficit ? '供能短缺' : '实时分配';
    var sources = [
      ['热液汽轮机', flow.turbineRate], ['高压热机管道', flow.pressRate],
      ['核热厂', flow.fissionRate], ['泰坦气云采集站', flow.titancloudRate], ['太阳帆', flow.sunSailRate]
    ].filter(function (item) { return item[1] > 0.005; }).map(function (item) {
      return item[0] + ' +' + item[1].toFixed(1) + '/秒';
    });
    /* 取用方清单：ERA10（2026-10-20）补齐此前漏列的四路 —— 机器人充能站 / 欧罗巴发射场 /
     *   星球重构机 / 朱庇特质量加速站。它们**本来就在** hydroAlloc 里扣流（所以「已用/余流」总数
     *   一直是对的），只是这一行清单没列出来 ⇒ 玩家看到供给被分配，清单里却找不到是谁吃的。 */
    var consumers = [
      ['工坊', flow.shopRate], ['天穹钻机', flow.skyRate], ['自动化钻探', flow.drillRate],
      ['空间站', flow.stationRate], ['生物材料研究所', flow.labRate],
      ['工业机器人', flow.robotRate], ['机器人充能站', flow.robotbayRate], ['魔鱼世界VR', flow.vrRate],
      /* ERA10 市政（2026-10-20）：这里吃的是**三座发射场合计**耗流（欧罗巴 + 泰拉星 + 瑞亚星），
       * 标签必须跟着改——写成「欧罗巴发射场」会让玩家以为多建的两座不耗能。 */
      ['发射场（三座合计）', flow.europaRate], ['星球重构机', flow.geekRate], ['朱庇特质量加速站', flow.jupitorRate]
    ].filter(function (item) { return item[1] > 0.005; }).map(function (item) {
      return item[0] + ' −' + item[1].toFixed(1) + '/秒';
    });
    var sourceLabel = el('hydroSources'), useLabel = el('hydroUses'), hint = el('hydroFlowHint');
    if (sourceLabel) sourceLabel.textContent = sources.length ? sources.join(' · ') : '暂无供给来源';
    if (useLabel) useLabel.textContent = consumers.length ? consumers.join(' · ') : '暂无设备取用';
    var shortages = [];
    if (flow.shopNeed > flow.shopRate + 0.005) shortages.push('热液工坊：产钢降载，缺 ' + (flow.shopNeed - flow.shopRate).toFixed(1) + '/秒');
    /* 钻机停摆按引擎给的子因分流：缺钻头不是「热液能缺口」，
     *   旧写法一律印「缺 N/秒」，玩家照它去升汽轮机永远没用（2026-10-29 玩家反馈）。 */
    if (flow.skyStopWhy === 'bit') shortages.push('天穹钻机：停摆，缺共振钻头（与热液能无关）');
    else if (flow.skyNeed > flow.skyRate + 0.005) shortages.push('天穹钻机：停摆，缺 ' + (flow.skyNeed - flow.skyRate).toFixed(1) + '/秒');
    if (flow.europaNeed > flow.europaRate + 0.005) shortages.push('发射场（三座合计）：产线暂停，缺 ' + (flow.europaNeed - flow.europaRate).toFixed(1) + '/秒');
    if (flow.geekNeed > flow.geekRate + 0.005) shortages.push('星球重构机 G.E.E.K：改造暂停，缺 ' + (flow.geekNeed - flow.geekRate).toFixed(1) + '/秒');
    var shortageBox = el('hydroShortage'), shortageTitle = el('hydroShortageTitle'), shortageItems = el('hydroShortageItems');
    if (shortageBox) shortageBox.hidden = !inDeficit;
    if (shortageTitle && inDeficit) shortageTitle.textContent = '热液能缺口 −' + Math.abs(balance).toFixed(1) + '/秒';
    if (shortageItems && inDeficit) shortageItems.textContent = shortages.length
      ? shortages.join(' · ')
      : '当前无满供即停摆设备；其余负载按优先级限流。';
    if (hint) hint.textContent = inDeficit
      ? '补足供给后，停摆设备会自动恢复；净余量按总供给 − 总需求计算。'
      : supply > demand + 0.005 ? '余流 +' + (supply - demand).toFixed(1) + '/秒，不会累积到下一秒'
        : '供需平衡；热液能不会存入库存';
  }

  /* ── 宗教命名框（2026-09-29）────────────────────────────────────
   * 【为什么是持久容器、不走 #res / pane 每帧重建】信仰资源行在 #res（每帧 innerHTML 重写），
   *   civic pane 每 2 秒重写 —— 里面塞 <input> 每敲一字就被换掉、丢焦点。
   *   所以宗教名框是 index.html 里的一个**持久**节点 #religionBox，这里用签名节流只管 gate：
   *   签名 = 神学前/后。theology 一解锁才渲染一次输入框，之后只在 gate 翻转时重建；
   *   玩家打字只写 state、不触发本函数重建 ⇒ 焦点不丢。
   * 【写回时机】走 input.js 的 onChange（blur/回车）→ 写 s.religionName。不用 input 事件，
   *   避免每键都 markDirty；faith 行（#res）每帧读 s.religionName，改名后下一帧即刷新。 */
  var relSig = '';
  function renderReligion(s) {
    var box = el('religionBox'); if (!box) return;
    var open = !!(s.civics && s.civics.theology);
    if (!open) {
      if (relSig !== '') { relSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    /* ERA9 虚境信仰卡装填后：信仰更名「虚境」并锁死（覆盖玩家自定义名，输入框禁用 + 提示）。 */
    var locked = !!(SB.civic && SB.civic.faithNameLocked && SB.civic.faithNameLocked(s));
    var sig = locked ? 'open-locked' : 'open';
    if (relSig !== sig) {
      relSig = sig;
      var nm = SB.civic && SB.civic.faithDisplayName ? SB.civic.faithDisplayName(s) : ((s.religionName || '').trim());
      if (locked) {
        box.innerHTML = '<div class="nm">你的信仰</div>' +
          '<input class="relname locked" data-religion="1" type="text" maxlength="16" value="' +
            nm.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" disabled>' +
          '<div class="ds">信仰已更名为「<b>虚境</b>」并<b>锁死</b>（虚境信仰永恒锚定，不可更改）。</div>';
      } else {
        box.innerHTML = '<div class="nm">你的信仰</div>' +
          '<input class="relname" data-religion="1" type="text" maxlength="16" placeholder="给信仰起个名字…"' +
          (nm ? ' value="' + nm.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' : '') + '>' +
          '<div class="ds">这个名字会显示在你的信仰资源上。改名随时可改，无消耗。</div>';
      }
    }
  }

  /* ── 聚落命名框（2026-10-17 · ERA6+）─────────────────────────────────
   * 【为什么是持久容器、不走 pane 每 2 秒重建】与宗教名框同理：输入框塞进每 2 秒重画的
   *   #pane-village-body 会被换掉、丢焦点。所以聚落名框是 index.html 里的持久节点 #habitatBox，
   *   这里用签名节流只管 gate：签名 = 纪元是否 ≥ 6（ERA6 起聚落迈入太空时代、演进名到头，
   *   改由玩家自建）。门一开渲染一次输入框，之后只在 gate 翻转时重建；
   *   玩家打字只写 state、不触发本函数重建 ⇒ 焦点不丢。
   * 【写回时机】走 input.js 的 onChange（blur/回车）→ 写 s.habitatName。改名后下一帧 renderAll
   *   把 tab 名与卡片头名同步刷新。本轮回有效：nextCycle → startRun → freshRun 重置为 ''。 */
  var habSig = '';
  function renderHabitatName(s) {
    var box = el('habitatBox'); if (!box) return;
    var open = !!(s && s.era >= 6);
    if (!open) {
      if (habSig !== '') { habSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    box.style.display = '';
    if (habSig !== 'open') {
      habSig = 'open';
      var nm = (s.habitatName || '').trim();
      box.innerHTML = '<div class="nm">你的国度</div>' +
        '<input class="relname" data-habitat="1" type="text" maxlength="16" placeholder="给你的国度起个名字…"' +
        (nm ? ' value="' + nm.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' : '') + '>' +
        '<div class="ds">名字会显示在巢穴页签与标题上，本轮回有效、轮回后重新起。改名随时可改，无消耗。</div>';
    }
  }
  parts.renderEnv = renderEnv;
  parts.renderWarm = renderWarm;
  parts.renderCore = renderCore;
  parts.renderDrill = renderDrill;
  parts.renderGeek = renderGeek;
  parts.renderStar = renderStar;
  parts.renderHydro = renderHydro;
  parts.renderReligion = renderReligion;
  parts.renderHabitatName = renderHabitatName;
})(typeof window !== 'undefined' ? window : globalThis);
