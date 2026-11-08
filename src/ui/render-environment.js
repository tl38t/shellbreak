/* 天壳 / SHELLBREAK — 自然环境与持久状态行渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});
  var CFG = SB.CFG;
  function el(id) { return root.document.getElementById(id); }
  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    return value || fallback || '';
  }
  function activeLocale() {
    return SB.i18n && SB.i18n.getLocale ? SB.i18n.getLocale() : 'zh-CN';
  }
  function resourceName(id, fallback) {
    return SB.i18n && SB.i18n.resourceName ? SB.i18n.resourceName(id, fallback) : fallback;
  }
  function buildingName(id, fallback) {
    return SB.i18n && SB.i18n.buildingName ? SB.i18n.buildingName(id, fallback) : fallback;
  }
  function contentName(id, fallback) {
    return SB.i18n && SB.i18n.contentName ? SB.i18n.contentName(id, fallback) : fallback;
  }
  function seasonName(index, fallback) {
    var keys = ['content.season_warm.name', 'content.season_slack.name', 'content.season_cold.name'];
    return tr(keys[index], null, fallback);
  }

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
    var currentSeason = sm.known ? seasonName(sm.idx, sm.name) : tr('environment.season.pattern_unclear', null, '看不出规律');
    var heading = tr('environment.volcano.heading', { seasonName: currentSeason }, '海底火山 · ' + currentSeason);
    var note = sm.known
      ? tr('environment.season.kelp_forecast', {
          seasonMultiplier: sm.mult.toFixed(3),
          nextSeason: seasonName((sm.idx + 1) % 3, sm.next), tideDays: sm.left
        }, '这一季深海藻场产出 ×' + sm.mult.toFixed(3) + '；约 ' + sm.left + ' 潮日后转入' + sm.next + '。')
          + (sm.mult < 1 ? '<span style="color:var(--red)">' + tr('environment.season.reduced_output', null, '减产季。') + '</span>' : '')
      : tr('environment.season.pattern_note', null, '族民记下的次数对不上潮水的涨落——「历法」能把这一季的周期与减产幅度读出来。');
    var html = '<div><div class="nm">' + heading + '</div><div class="ds">' + note + '</div></div>';
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
  /* 动态费率读数（2026-11-05）：烧石 = 0.03 × 破壳系数，开局约 0.008/秒、
   * 规模铺开后到数 / 秒量级。一档小数位写死会把开局显示成「0.0/秒」（玩家以为不用烧石），
   * 所以按量级切精度。
   * ⚠️ 与库存数字同纪律：它不进状态签名，走独立 span 的 textContent 每帧刷，
   *    否则文明规模一变就重建整块 HTML，按钮按下与抬起之间被换掉 ⇒ 那次点击丢失。 */
  function warmRateText(v) {
    if (!isFinite(v) || v <= 0) return '0';
    if (v >= 100) return v.toFixed(0);
    if (v >= 10) return v.toFixed(1);
    if (v >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }

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
      (challengeBlocksHeating ? 'x' : '-') + '|' + (burning ? 'b' : '-') + '|' + activeLocale();
    if (sig !== warmSig) {
      warmSig = sig;
      box.innerHTML = '<div><div class="nm">' + tr('environment.warmstone.switch.name', null, '暖石开关') + ' <span class="tag" id="envWarmWs">0</span></div>' +
        '<div class="ds">' + tr('environment.warmstone.insulation.tip', {
          warmstoneRate: '<span id="envWarmRate">' + warmRateText(SB.economy.warmRate(s)) + '</span>'
        }, '保温法：烧暖石（{warmstoneRate}/秒），只在寒流季生效——部分抵消藻场减产（无法完全抵消）。寒流季若触发冰封期，冻伤会归零。暖石同时支撑这两种效果；其他季节不消耗暖石。') +
        (challengeBlocksHeating ? '<br>' + tr('environment.warmstone.challenge.note', null, '寒流禁火挑战：寒流季保温法停用；热泉炉和热液设备仍照常运行。') : '') +
        '</div></div>' +
        /* 按钮文案 = **当前状态**（底色表态：绿=启用 / 灰=停用），不是「点了会怎样」——
         * 原先写「开/关」两可，玩家读不出此刻到底是开是关（用户 2026-09-30 报）。
         * 正在烧时再加一圈琥珀描边，把「已启用」与「真在烧」两个状态分开。 */
        '<button class="btn tog' + (s.warmOn ? ' on' : '') + (burning ? ' burning' : '') +
        '" data-warm="1"' + (challengeBlocksHeating ? ' disabled' : '') +
        ' title="' + (challengeBlocksHeating
          ? tr('environment.warmstone.challenge.toggle_title', null, '寒流禁火挑战：寒流季禁止保温燃烧')
          : tr('environment.warmstone.toggle_title', null, '点击切换启用 / 停用')) + '">' +
        (challengeBlocksHeating
          ? tr('environment.warmstone.status.challenge_disabled', null, '寒流禁用')
          : s.warmOn
            ? tr('environment.warmstone.status.enabled', null, '启用')
            : tr('environment.warmstone.status.disabled', null, '停用')) + '</button>';
    }
    /* 库存数字单独刷：不进签名，所以烧起来时它是唯一在动的节点，按钮不动。
     * 费率同理（随破壳系数变化），也走独立 span，绝不并回签名。 */
    var ws = el('envWarmWs');
    if (ws) ws.textContent = Math.floor(s.res.warmstone || 0);
    var wr = el('envWarmRate');
    if (wr) wr.textContent = warmRateText(SB.economy.warmRate(s));
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
    var coreName = tr('wonder.terra_core.name', null, '泰拉中央星核炉芯');
    var statusKey = vat ? 'environment.terra_core.status.with_vats' : 'environment.terra_core.status';
    var statusText = tr(statusKey, {
      storedEnergy: SB.economy.fmtAmt(charge), capacity: '50M',
      netRate: sign + net.toFixed(2), vatCount: vat
    }, vat
      ? '储能 {storedEnergy} / {capacity} · 净增 {netRate}/秒 · 水舱运行 {vatCount} 座（优先耗池，池空后占热液能流）'
      : '储能 {storedEnergy} / {capacity} · 净增 {netRate}/秒');
    var html = '<div><div class="nm">' + envWonderIcon('wonder_terra_core') + coreName +
      '<span class="tag">' + pct.toFixed(2) + '%</span></div>' +
      '<div class="ds">' + statusText + '</div>' +
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
      var postBreakSig = 'post-break|' + activeLocale();
      if (drillSig !== postBreakSig) {
        drillSig = postBreakSig;
        var civicBonus = SB.wonder.skydrillCivic(s);
        var happyBonus = SB.wonder.skydrillHappyOffset(s);
        box.innerHTML = '<div><div class="nm">' + envWonderIcon('wonder_skydrill') + tr('wonder.skydrill.name', null, '天穹钻机') +
          ' <span class="tag ok">' + tr('wonder.skydrill.post_break.label', null, '破壳后奇观效果') + '</span></div>' +
          '<div class="ds">' + tr('wonder.skydrill.post_break_effect', {
            civicPointsPerSecond: civicBonus,
            happinessChange: (happyBonus >= 0 ? '+' : '') + happyBonus
          }, '市政点 +{civicPointsPerSecond}/秒；幸福度 {happinessChange}。此处显示的是破壳后的常驻效果。') + '</div></div>';
      }
      return;
    }
    var starved = !!s.skydrillStarved && !!s.skydrillOn;
    /* 天元突破（2026-11-05）：倍率只从引擎唯一读数口取，面板的耗率 / 速率必须同乘，
     * 否则玩家切到 2× 后文案还写「0.1/秒、100 点/秒」（面板撒谎家族）。
     * 没点亮天赋 ⇒ 按钮不上屏、_mul 恒 1 ⇒ 老存档 / 挑战周目的文案逐字不变。 */
    var _mul = (SB.shell && SB.shell.skydrillMul) ? SB.shell.skydrillMul(s) : 1;
    var _overdrive = !!(s.perk && s.perk.drillOverdrive > 0);
    var _bitRate = SB.CFG.SKYDRILL_DRILL * _mul;
    var _cutRate = SB.CFG.SKYDRILL_RATE * _mul;
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
      : (s.res.resonantDrill || 0) < _bitRate);
    var sig = (s.skydrillOn ? 'on' : 'off') + '|' + (starved ? 's' : '-') + '|' +
      (starved ? (_drillNoBit ? 'd' : 'h') : '-') + '|' +
      Math.min(999, Math.floor(_left)) + '|' + _mul + '|' + (_overdrive ? 'o' : '-') + '|' + activeLocale();
    if (sig !== drillSig) {
      drillSig = sig;
      var ds;
      if (!s.skydrillOn) {
        ds = tr('wonder.skydrill.status.unstarted', {
          shellPercent: CFG.FLOOR_AT * 100, drillUseRate: _bitRate,
          hydroUseRate: SB.CFG.SKYDRILL_HYDRO
        }, '已建成，尚未启动。点击右侧按钮开始凿穿天壳最后 {shellPercent}%——运行期间每秒消耗共振钻头 {drillUseRate} 个及热液能 {hydroUseRate}，热液能取自热液工坊使用后的余流。');
      } else if (starved) {
        if ((s.res.resonantDrill || 0) < _bitRate) {
          /* ⚠️ 不能 Math.floor：库存按 0.1/秒扣，常态是小数（0.4 / 0.9），
           *    floor 会印成「现存 0」——玩家以为自己一个钻头都没有，实际只是不足 1 个。 */
          ds = tr('wonder.skydrill.status.drill_shortage', {
            drillStock: (s.res.resonantDrill || 0).toFixed(1), drillUseRate: _bitRate
          }, '停摆：共振钻头不足（现存 {drillStock} 个，运行每秒消耗 {drillUseRate} 个）。请到工坊制作共振钻头补货；补足后会自动恢复，无需重启。');
        } else {
          var _tur = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
          ds = tr('wonder.skydrill.status.hydro_shortage', {
            availableHydro: _left.toFixed(1), requiredHydro: SB.CFG.SKYDRILL_HYDRO,
            turbineCount: _tur, turbineSupply: _HF ? _HF.supplyRate.toFixed(1) : '?',
            workshopUse: _HF ? _HF.shopRate.toFixed(1) : '?', hydroPerLevel: 1
          }, '停摆：热液能余流 {availableHydro}/秒，不足所需的 {requiredHydro}/秒——汽轮机运行 {turbineCount} 座，供给 {turbineSupply}/秒；热液工坊消耗 {workshopUse}/秒。请升级汽轮机（每级 +{hydroPerLevel}/秒）或停用热液工坊；暖石断供时汽轮机也会停产。补足后自动恢复，无需重启。');
        }
      } else {
        ds = tr('wonder.skydrill.status.running', { shellBreakRate: _cutRate },
          '运转中：钻头以 {shellBreakRate} 点/秒削薄天壳（轮回强化「壳层勘探」还可提高效率）；钻头耗尽后停摆，补足后自动继续。');
      }
      var missingResource = _drillNoBit ? resourceName('resonantDrill', '共振钻头') : resourceName('hydro', '热液能');
      box.innerHTML = '<div><div class="nm">' + envWonderIcon('wonder_skydrill') + tr('wonder.skydrill.name', null, '天穹钻机') +
        (starved ? '<b class="lack-tag is-stop">' + tr('wonder.skydrill.status.starved_tag', { missingResourceName: missingResource }, '缺{missingResourceName} · 停摆') + '</b>' : '') +
        ' <span class="tag" id="envDrillCt">0</span></div>' +
        '<div class="ds">' + ds + '</div></div>' +
        /* 天元突破按钮与启动按钮同组：只在已点亮天赋时出现，文案只报当前档，
         * 真实耗率 / 速率在上面的 ds 里（手机端没有 hover 也读得到）。 */
        '<div class="env-drill-ops">' +
        (_overdrive ? '<button class="btn tog' + (_mul > 1 ? ' on' : '') +
          '" data-drill-mul="1">' + tr('wonder.skydrill.overdrive.button', { multiplier: _mul }, '钻头 {multiplier}×') + '</button>' : '') +
        '<button class="btn tog' + (s.skydrillOn ? ' on' : '') +
        '" data-skydrill="1" title="' + tr('ui.action.start_stop.title', null, '点击启动 / 停机') + '">' +
        (s.skydrillOn ? tr('environment.machine.switch.enabled', null, '已启动') : tr('environment.machine.switch.disabled', null, '已停机')) + '</button>' +
        '</div>';
    }
    var ct = el('envDrillCt');
    if (ct) {
      /* ⚠️ 不能 floor：钻头按 0.1/秒扣，库存常态是小数（0.9 会显示成「0 钻头」）。
       *    ≥10 取整（小数位无意义），否则保留 1 位。 */
      var _bits = s.res.resonantDrill || 0;
      ct.textContent = tr('wonder.skydrill.drill_inventory', {
        drillCount: _bits >= 10 ? Math.floor(_bits) : _bits.toFixed(1)
      }, '{drillCount} 个共振钻头');
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
      phaseKey = 'enceladus'; phaseTxt = tr('wonder.geek.phase.enceladus', null, '恩克拉多斯星改造');
      prog = s.geek ? s.geek.enceladusRun || 0 : 0;
      total = SB.economy && SB.economy.starTerraformDuration
        ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_ENCELADUS_SECONDS) : SB.CFG.GEEK_ENCELADUS_SECONDS;
    } else if (terraUnlocked) {
      phaseKey = 'terra'; phaseTxt = tr('wonder.geek.phase.terra', null, '泰拉星改造');
      prog = s.geek ? s.geek.terraRun || 0 : 0;
      total = SB.economy && SB.economy.starTerraformDuration
        ? SB.economy.starTerraformDuration(s, SB.CFG.GEEK_TERRA_SECONDS) : SB.CFG.GEEK_TERRA_SECONDS;
    } else { phaseKey = 'enceladus_complete'; phaseTxt = tr('wonder.geek.phase.enceladus_complete', null, '恩克拉多斯已完成'); prog = 0; total = 1; }
    var _pct = total > 0 ? Math.max(0, Math.min(100, 100 * prog / total)) : 0;
    var _pctInt = Math.floor(_pct);
    var _HF = (SB.economy && SB.economy.hydroAlloc) ? SB.economy.hydroAlloc(s, 1) : null;
    var _left = _HF ? Math.max(0, _HF.left) : 0;
    var _running = !!(s.geek && s.geek.geekOn) && !starved && phaseKey !== 'enceladus_complete';
    /* 停摆子因（四样材料见底 / 热液能不足）：与下面 ds 分支**同一条件**，按同一顺序取第一个见底的。
     * 纳入签名让徽标跟着切，避免「补完这样、徽标还写着这样」。 */
    var _geekLackName = '';
    if (starved) {
      if ((s.res.kelp || 0) < SB.CFG.GEEK_KELP) _geekLackName = resourceName('kelp', '藻食');
      else if ((s.res.silt || 0) < SB.CFG.GEEK_METAL) _geekLackName = resourceName('silt', '金属');
      else if ((s.res.stone || 0) < SB.CFG.GEEK_STONE) _geekLackName = resourceName('stone', '石头');
      else if ((s.res.coral || 0) < SB.CFG.GEEK_CORAL) _geekLackName = resourceName('coral', '珊瑚');
      else _geekLackName = resourceName('hydro', '热液能');
    }
    var sig = (s.geek && s.geek.geekOn ? 'on' : 'off') + '|' + (starved ? 's' : '-') + '|' +
      _geekLackName + '|' + phaseKey + '|' + _pctInt + '|' + activeLocale();
    if (sig !== geekSig) {
      geekSig = sig;
      var ds;
      if (!s.geek || !s.geek.geekOn) {
        ds = tr('wonder.geek.status.unstarted', {
          terraformingTarget: enceladusDone
            ? tr('ui.star_map.body.terra.name', null, '泰拉')
            : tr('ui.star_map.body.enceladus.name', null, '恩克拉多斯'),
          hydroUse: SB.CFG.GEEK_HYDRO, kelpUse: SB.CFG.GEEK_KELP, metalUse: SB.CFG.GEEK_METAL,
          stoneUse: SB.CFG.GEEK_STONE, coralUse: SB.CFG.GEEK_CORAL
        }, '星球重构机 G.E.E.K 已就绪，尚未启动。点击右侧按钮开始{terraformingTarget}改造——运行期间每秒消耗热液能 {hydroUse}、藻食 {kelpUse}、金属 {metalUse}、石头 {stoneUse}、珊瑚 {coralUse}。');
      } else if (starved) {
        if ((s.res.kelp || 0) < SB.CFG.GEEK_KELP || (s.res.silt || 0) < SB.CFG.GEEK_METAL || (s.res.stone || 0) < SB.CFG.GEEK_STONE || (s.res.coral || 0) < SB.CFG.GEEK_CORAL) {
          ds = tr('wonder.geek.status.material_shortage', {
            kelpStock: Math.floor(s.res.kelp || 0), metalStock: Math.floor(s.res.silt || 0),
            stoneStock: Math.floor(s.res.stone || 0), coralStock: Math.floor(s.res.coral || 0),
            kelpUse: SB.CFG.GEEK_KELP, metalUse: SB.CFG.GEEK_METAL,
            stoneUse: SB.CFG.GEEK_STONE, coralUse: SB.CFG.GEEK_CORAL
          }, '停摆：材料不足（当前库存：藻食 {kelpStock}、金属 {metalStock}、石头 {stoneStock}、珊瑚 {coralStock}；每秒消耗：藻食 {kelpUse}、金属 {metalUse}、石头 {stoneUse}、珊瑚 {coralUse}）。补足后自动恢复，无需重启。');
        } else {
          ds = tr('wonder.geek.status.hydro_shortage', {
            availableHydro: _left.toFixed(1), requiredHydro: SB.CFG.GEEK_HYDRO,
            turbineSupply: _HF ? _HF.supplyRate.toFixed(1) : '?',
            workshopUse: _HF ? _HF.shopRate.toFixed(1) : '?'
          }, '停摆：热液能余流 {availableHydro}/秒，不足 {requiredHydro}/秒——汽轮机供给 {turbineSupply}/秒，热液工坊消耗 {workshopUse}/秒。请升级汽轮机或停用热液工坊；补足后会自动恢复，无需重启。');
        }
      } else if (phaseKey === 'enceladus_complete') {
        ds = tr('wonder.geek.status.enceladus_complete', null,
          '恩克拉多斯星改造已完成。研究《星球改造》后可启动泰拉星改造。');
      } else {
        ds = tr('wonder.geek.status.running', { terraformingPhase: phaseTxt },
          '运转中：{terraformingPhase}。缺料时会暂停并保留进度，补足后自动继续。');
      }
      var _remTag = _running ? '<span class="tag" id="envGeekRemain"></span>' : '';
      box.innerHTML = '<div><div class="nm">' + envWonderIcon('wonder_geek') + tr('wonder.geek.name', null, '星球重构机 G.E.E.K') + ' ' +
        (starved ? '<b class="lack-tag is-stop">' + tr('wonder.geek.status.starved_tag', { missingResourceName: _geekLackName }, '缺{missingResourceName} · 停摆') + '</b>' : '') +
        (enceladusDone ? '<span class="tag ok">' + tr('wonder.geek.phase.enceladus_complete', null, '恩克拉多斯已完成') + '</span>' : '') +
        (terraDone ? '<span class="tag ok">' + tr('wonder.geek.phase.terra_complete', null, '泰拉已完成') + '</span>' : '') + _remTag + '</div>' +
        '<div class="prog"><i id="envGeekBar" style="width:' + _pct.toFixed(2) + '%"></i></div>' +
        '<div class="ds" id="envGeekDs">' + ds + '</div></div>' +
        '<button class="btn tog' + ((s.geek && s.geek.geekOn) ? ' on' : '') +
        '" data-geek="1" title="' + tr('ui.action.start_stop.title', null, '点击启动 / 停机') + '">' +
        ((s.geek && s.geek.geekOn)
          ? tr('environment.machine.switch.enabled', null, '已启动')
          : tr('environment.machine.switch.disabled', null, '已停机')) + '</button>';
    }
    /* 每帧实时刷新：进度条宽度（Fractional，平滑）+ 倒计时（剩余游戏内秒）。
     * 不进签名 ⇒ 即使 <1% 的细微推进也看得见，倒计时也不跳格。 */
    if (_running) {
      var _bar = el('envGeekBar'); if (_bar) _bar.style.width = _pct.toFixed(2) + '%';
      var _cd = el('envGeekRemain');
      if (_cd) _cd.textContent = tr('wonder.geek.countdown', {
        remainingTime: fmtGeekDur(Math.max(0, total - prog))
      }, '倒计时 {remainingTime}');
    }
    /* 每帧实时刷新「停摆原因」文案（材料见底/热液能不足的子因 + 现存数量），
     * 不进签名 ⇒ 即便仍处 starved（签名不变），子因切换 / 现存数值变化也能即时反映。 */
    if (starved && phaseKey !== 'E') {
      var _d = el('envGeekDs');
      if (_d) {
        if ((s.res.kelp || 0) < SB.CFG.GEEK_KELP || (s.res.silt || 0) < SB.CFG.GEEK_METAL || (s.res.stone || 0) < SB.CFG.GEEK_STONE || (s.res.coral || 0) < SB.CFG.GEEK_CORAL) {
          _d.innerHTML = tr('wonder.geek.status.material_shortage', {
            kelpStock: Math.floor(s.res.kelp || 0), metalStock: Math.floor(s.res.silt || 0),
            stoneStock: Math.floor(s.res.stone || 0), coralStock: Math.floor(s.res.coral || 0),
            kelpUse: SB.CFG.GEEK_KELP, metalUse: SB.CFG.GEEK_METAL,
            stoneUse: SB.CFG.GEEK_STONE, coralUse: SB.CFG.GEEK_CORAL
          }, '停摆：材料不足（当前库存：藻食 {kelpStock}、金属 {metalStock}、石头 {stoneStock}、珊瑚 {coralStock}；每秒消耗：藻食 {kelpUse}、金属 {metalUse}、石头 {stoneUse}、珊瑚 {coralUse}）。补足后自动恢复，无需重启。');
        } else {
          _d.innerHTML = tr('wonder.geek.status.hydro_shortage', {
            availableHydro: _left.toFixed(1), requiredHydro: SB.CFG.GEEK_HYDRO,
            turbineSupply: _HF ? _HF.supplyRate.toFixed(1) : '?',
            workshopUse: _HF ? _HF.shopRate.toFixed(1) : '?'
          }, '停摆：热液能余流 {availableHydro}/秒，不足 {requiredHydro}/秒——汽轮机供给 {turbineSupply}/秒，热液工坊消耗 {workshopUse}/秒。请升级汽轮机或停用热液工坊；补足后会自动恢复，无需重启。');
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
    var starLocaleSig = 'fixed|' + activeLocale();
    if (starSig !== starLocaleSig) {
      starSig = starLocaleSig;
      box.innerHTML = '<div><div class="nm">' + tr('environment.starfield.slot.name', null, '星空槽') + ' <span class="tag" id="envStarRt">0</span></div>' +
        '<div class="ds">' + tr('environment.starfield.exploration.description', null,
          '破壳后由文明推力（人口/建筑/科技/轮回增益）被动累积星空探索，满槽即太空时代达成。') + ' ' +
        tr('environment.starfield.contributor_toggle.description', null,
          '卫星/空间站各自的「开几座」开关可单独停掉它们的星空贡献。') + '</div></div>';
    }
    /* 速率单独刷：不进签名，所以文明推力变化时它是唯一在动的节点，按钮不动。 */
    var rt = el('envStarRt');
    if (rt) {
      var _sr = (SB.economy && SB.economy.starRate) ? SB.economy.starRate(s) : 0;
      rt.textContent = tr('environment.starfield.exploration_rate', {
        rate: (_sr != null ? _sr : 0).toFixed(2)
      }, '{rate}/秒');
    }
  }

  /* ── 热液能流（ERA3+）：能源读数放在自然环境卡底部，脱离材料库存栏。
   * 热液能是瞬时流而不是库存：hydroAlloc(s,1) 与本 tick 的供需分配同源，
   * 展示总供给、开启负载的总需求与可正可负的净余量；不把流量快照误读成库存。
   * 容器与子节点只在解锁后创建一次，之后仅更新 textContent / 宽度，避免每帧重建。 */
  var hydroBuilt = false;
  var hydroBuiltLocale = '';
  function renderHydro(s) {
    var box = el('envHydro'); if (!box) return;
    var unlocked = !!(SB.economy && SB.economy.resUnlocked(s, 'hydro'));
    if (!unlocked) { box.style.display = 'none'; return; }
    box.style.display = '';
    if (!hydroBuilt || hydroBuiltLocale !== activeLocale()) {
      hydroBuilt = true;
      hydroBuiltLocale = activeLocale();
      var rateSuffix = tr('environment.hydro.metric.rate_per_second', { rate: '' }, '{rate}/秒').replace('{rate}', '').trim();
      box.innerHTML = '<section class="hydro-panel">' +
        '<div class="hydro-head"><span class="hydro-icon" aria-hidden="true"><img src="assets/resource-icons/hydro.png?v=2" alt="" width="30" height="30"></span>' +
        '<div class="hydro-title"><b>' + tr('environment.hydro.title', null, '热液能流') + '</b><span>' +
        tr('environment.hydro.flow.description', null, '即产即用 · 净余量 = 供给 − 需求') + '</span></div>' +
        '<span class="hydro-live" id="hydroLive"><i></i><span id="hydroLiveLabel">' +
        tr('environment.hydro.status.realtime_allocation', null, '实时分配') + '</span></span></div>' +
        '<div class="hydro-metrics">' +
        '<div class="hydro-metric"><span>' + tr('environment.hydro.metric.supply.label', null, '总供给') + '</span><b><span id="hydroSupply">0.0</span><small>' + rateSuffix + '</small></b></div>' +
        '<div class="hydro-metric"><span>' + tr('environment.hydro.metric.demand.label', null, '总需求') + '</span><b><span id="hydroDemand">0.0</span><small>' + rateSuffix + '</small></b></div>' +
        '<div class="hydro-metric hydro-metric-balance" id="hydroBalanceMetric"><span>' + tr('environment.hydro.metric.balance.label', null, '净余量') + '</span><b><span id="hydroBalance">+0.0</span><small>' + rateSuffix + '</small></b></div>' +
        '</div>' +
        '<div class="hydro-track" role="img" aria-label="' + tr('environment.hydro.supply_coverage.aria_label', null, '热液能供给覆盖需求比例') + '">' +
        '<i class="hydro-supply-fill" id="hydroSupplyFill"></i><i class="hydro-deficit-fill" id="hydroDeficitFill"></i></div>' +
        '<div class="hydro-routing">' +
        '<div class="hydro-route"><b>' + tr('environment.hydro.sources.heading', null, '来处') + '</b><span id="hydroSources">' + tr('environment.hydro.sources.empty', null, '暂无供给来源') + '</span></div>' +
        '<div class="hydro-route"><b>' + tr('environment.hydro.uses.heading', null, '去处') + '</b><span id="hydroUses">' + tr('environment.hydro.uses.empty', null, '暂无设备取用') + '</span></div>' +
        '</div>' +
        '<div class="hydro-shortage" id="hydroShortage" hidden>' +
        '<b id="hydroShortageTitle"></b><span id="hydroShortageItems"></span></div>' +
        '<div class="hydro-foot"><span id="hydroFlowHint">' + tr('environment.hydro.surplus', { surplusRate: '0.0' }, '余流 +{surplusRate}/秒，不会累积到下一秒') + '</span></div>' +
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
    if (liveLabel) liveLabel.textContent = inDeficit
      ? tr('environment.hydro.status.shortage', null, '供能短缺')
      : tr('environment.hydro.status.realtime_allocation', null, '实时分配');
    var sources = [
      [buildingName('hydroturbine', '热液汽轮机'), flow.turbineRate],
      [tr('wonder.high_pressure_thermal_pipe.name', null, '高压热机管道'), flow.pressRate],
      [buildingName('fissionplant', '核热厂'), flow.fissionRate],
      [buildingName('titan_cloud_harvester', '泰坦气云采集站'), flow.titancloudRate],
      [tr('village.launch.target.solar_sails.name', null, '太阳帆'), flow.sunSailRate]
    ].filter(function (item) { return item[1] > 0.005; }).map(function (item) {
      return tr('environment.hydro.flow_item', { systemName: item[0], flowSign: '+', rate: item[1].toFixed(1) }, '{systemName} {flowSign}{rate}/秒');
    });
    /* 取用方清单：ERA10（2026-10-20）补齐此前漏列的四路 —— 机器人充能站 / 欧罗巴发射场 /
     *   星球重构机 / 朱庇特质量加速站。它们**本来就在** hydroAlloc 里扣流（所以「已用/余流」总数
     *   一直是对的），只是这一行清单没列出来 ⇒ 玩家看到供给被分配，清单里却找不到是谁吃的。 */
    var consumers = [
      [buildingName('workshop', '工坊'), flow.shopRate], [tr('wonder.skydrill.name', null, '天穹钻机'), flow.skyRate],
      [tr('automation.autodrill.name', null, '自动化钻探'), flow.drillRate],
      [buildingName('spacestation', '空间站'), flow.stationRate],
      [tr('building.biomaterials_research_institute.name', null, '生物材料研究所'), flow.labRate],
      [tr('content.upg_indrobot.name', null, '工业机器人'), flow.robotRate], [buildingName('robotbay', '机器人充能站'), flow.robotbayRate],
      [tr('wonder.fish_vr.name', null, '魔鱼世界 VR'), flow.vrRate],
      /* ERA10 市政（2026-10-20）：这里吃的是**三座发射场合计**耗流（欧罗巴 + 泰拉星 + 瑞亚星），
       * 标签必须跟着改——写成「欧罗巴发射场」会让玩家以为多建的两座不耗能。 */
      [tr('environment.hydro.consumer.launch_sites', { siteCount: 3 }, '发射场合计（{siteCount} 座）'), flow.europaRate],
      [tr('wonder.geek.name', null, '星球重构机 G.E.E.K'), flow.geekRate],
      [tr('wonder.jupiter_mass_accelerator.name', null, '朱庇特质量加速站'), flow.jupitorRate]
    ].filter(function (item) { return item[1] > 0.005; }).map(function (item) {
      return tr('environment.hydro.flow_item', { systemName: item[0], flowSign: '−', rate: item[1].toFixed(1) }, '{systemName} {flowSign}{rate}/秒');
    });
    var sourceLabel = el('hydroSources'), useLabel = el('hydroUses'), hint = el('hydroFlowHint');
    if (sourceLabel) sourceLabel.textContent = sources.length ? sources.join(' · ') : tr('environment.hydro.sources.empty', null, '暂无供给来源');
    if (useLabel) useLabel.textContent = consumers.length ? consumers.join(' · ') : tr('environment.hydro.uses.empty', null, '暂无设备取用');
    var shortages = [];
    if (flow.shopNeed > flow.shopRate + 0.005) shortages.push(tr('environment.hydro.shortage.workshop', {
      shortfallRate: (flow.shopNeed - flow.shopRate).toFixed(1)
    }, '热液工坊：产钢降载，缺 {shortfallRate}/秒'));
    /* 钻机停摆按引擎给的子因分流：缺钻头不是「热液能缺口」，
     *   旧写法一律印「缺 N/秒」，玩家照它去升汽轮机永远没用（2026-10-29 玩家反馈）。 */
    if (flow.skyStopWhy === 'bit') shortages.push(tr('environment.hydro.shortage.skydrill.drills', null, '天穹钻机：停摆，缺共振钻头（与热液能无关）'));
    else if (flow.skyNeed > flow.skyRate + 0.005) shortages.push(tr('environment.hydro.shortage.skydrill', {
      shortfallRate: (flow.skyNeed - flow.skyRate).toFixed(1)
    }, '天穹钻机：停摆，缺 {shortfallRate}/秒'));
    if (flow.europaNeed > flow.europaRate + 0.005) shortages.push(tr('environment.hydro.shortage.launch_sites', {
      siteCount: 3, shortfallRate: (flow.europaNeed - flow.europaRate).toFixed(1)
    }, '发射场合计（{siteCount} 座）：产线暂停，缺 {shortfallRate}/秒'));
    if (flow.geekNeed > flow.geekRate + 0.005) shortages.push(tr('environment.hydro.shortage.geek', {
      shortfallRate: (flow.geekNeed - flow.geekRate).toFixed(1)
    }, '星球重构机 G.E.E.K：改造暂停，缺 {shortfallRate}/秒'));
    var shortageBox = el('hydroShortage'), shortageTitle = el('hydroShortageTitle'), shortageItems = el('hydroShortageItems');
    if (shortageBox) shortageBox.hidden = !inDeficit;
    if (shortageTitle && inDeficit) shortageTitle.textContent = tr('environment.hydro.deficit', {
      deficitRate: Math.abs(balance).toFixed(1)
    }, '热液能缺口 −{deficitRate}/秒');
    if (shortageItems && inDeficit) shortageItems.textContent = shortages.length
      ? shortages.join(' · ')
      : tr('environment.hydro.shortage.priority_throttle', null, '当前无满供即停摆设备；其余负载按优先级限流。');
    if (hint) hint.textContent = inDeficit
      ? tr('environment.hydro.shortage.auto_resume', null, '补足供给后，停摆设备会自动恢复；净余量按总供给 − 总需求计算。')
      : supply > demand + 0.005 ? tr('environment.hydro.surplus', {
        surplusRate: (supply - demand).toFixed(1)
      }, '余流 +{surplusRate}/秒，不会累积到下一秒')
        : tr('environment.hydro.status.balanced', null, '供需平衡；热液能不会存入库存');
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
    var sig = (locked ? 'open-locked' : 'open') + '|' + activeLocale();
    if (relSig !== sig) {
      relSig = sig;
      var nm = SB.civic && SB.civic.faithDisplayName ? SB.civic.faithDisplayName(s) : ((s.religionName || '').trim());
      if (locked) {
        box.innerHTML = '<div class="nm">' + tr('ui.faith.panel.your_faith.label', null, '你的信仰') + '</div>' +
          '<input class="relname locked" data-religion="1" type="text" maxlength="16" value="' +
            nm.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" disabled>' +
          '<div class="ds">' + tr('ui.faith.name.named_locked', { playerFaithName: nm }, '当前信仰名称：{playerFaithName}。虚境信仰已永久锚定，无法更改。') + '</div>';
      } else {
        box.innerHTML = '<div class="nm">' + tr('ui.faith.panel.your_faith.label', null, '你的信仰') + '</div>' +
          '<input class="relname" data-religion="1" type="text" maxlength="16" placeholder="' +
            tr('environment.faith_name.placeholder', null, '给信仰起个名字…') + '"' +
          (nm ? ' value="' + nm.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' : '') + '>' +
          '<div class="ds">' + tr('environment.faith_name.description', null,
            '这个名字会显示在你的信仰资源上。改名随时可改，无消耗。') + '</div>';
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
    var currentHabSig = 'open|' + activeLocale();
    if (habSig !== currentHabSig) {
      habSig = currentHabSig;
      var nm = (s.habitatName || '').trim();
      box.innerHTML = '<div class="nm">' + tr('environment.realm_name.heading', null, '你的国度') + '</div>' +
        '<input class="relname" data-habitat="1" type="text" maxlength="16" placeholder="' +
        tr('environment.habitat_name.placeholder', null, '给你的国度起个名字…') + '"' +
        (nm ? ' value="' + nm.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' : '') + '>' +
        '<div class="ds">' + tr('environment.realm_name.description', null,
          '名字会显示在巢穴页签与标题上，本轮回有效，轮回后重新起。改名随时可改，无消耗。') + '</div>';
    }
  }
  /* ── 水体污染面板（2026-11-02 · docs/challenge-ocean-pollution-design.md v11）────────
   * 只在 `challenge.id === 'waterpollution'` 的周目里出现（pollutionOn）；基游戏连容器都隐藏。
   * 放在「自然环境」卡：它回答的是「外面现在什么样」（与海底火山/天壳同一类），
   *   而不是「我要做什么」。
   * ⚠️ 与 #envWarm / #envDrill / #envStar 同一套纪律：**纯读数、不放按钮**（每帧重建 DOM 会丢点击），
   *   并且用状态签名节流——签名不变一个节点都不动。
   * ⚠️ 所有数字都从 `SB.economy.pollutionSources(s)` 与 `pollution*` 函数取 ——
   *   面板不许自己乘任何乘区、也不许重写阈值（面板撒谎家族）。 */
  var polSig = '';
  function pollutionEtaText(seconds) {
    seconds = Math.max(0, seconds);
    if (seconds < 60) return tr('environment.pollution.eta.under_minute', { minuteLimit: 1 }, '不足 {minuteLimit} 分钟');
    var minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return tr('environment.pollution.eta.minutes', { minutes: minutes }, '{minutes} 分钟');
    var hours = Math.floor(minutes / 60), remain = minutes % 60;
    if (hours < 24) return remain
      ? tr('environment.pollution.eta.hours_minutes', { hours: hours, minutes: remain }, '{hours} 小时 {minutes} 分钟')
      : tr('environment.pollution.eta.hours', { hours: hours }, '{hours} 小时');
    var days = Math.floor(hours / 24), remHours = hours % 24;
    return remHours
      ? tr('environment.pollution.eta.days_hours', { days: days, hours: remHours }, '{days} 天 {hours} 小时')
      : tr('environment.pollution.eta.days', { days: days }, '{days} 天');
  }
  function pollutionStageName(index) {
    var keys = [
      'challenge.pollution_stage.clear_sea', 'challenge.pollution_stage.turbid_flow',
      'challenge.pollution_stage.red_tide', 'challenge.pollution_stage.dead_zone',
      'challenge.pollution_stage.blighted_deep'
    ];
    var fallback = ['澄海', '浊流', '赤潮', '死区', '腐渊'];
    return tr(keys[index], null, fallback[index] || '');
  }
  function pollutionPercent(fraction) {
    return (Math.max(0, fraction) * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  }
  function pollutionForecastText(next, pollution, net) {
    if (!next) return tr('environment.pollution.forecast.highest', null, '已达最高阶段：生态产出与人口承受力都处于危险水平');
    var nextStage = pollutionStageName((CFG.POLLUTION.STAGES || []).indexOf(next));
    if (net > 0) return tr('environment.pollution.forecast.rising', {
      timeToNext: pollutionEtaText((next.at - pollution) / net), nextStage: nextStage
    }, '按当前净增速，约 {timeToNext} 进入{nextStage}');
    if (net < 0) return tr('environment.pollution.forecast.falling', null, '当前净化快于排放，污染存量正在回落');
    return tr('environment.pollution.forecast.stable', null, '当前排放与净化持平，污染存量暂时不变');
  }
  function renderPollution(s) {
    var box = el('envPollution'); if (!box) return;
    var E = SB.economy;
    if (!s || !E || !E.pollutionOn || !E.pollutionOn(s)) {
      if (polSig !== '') { polSig = ''; box.style.display = 'none'; box.innerHTML = ''; }
      return;
    }
    var st = E.pollutionStage(s), idx = E.pollutionStageIndex(s);
    var src = E.pollutionSources(s);
    var cap = E.pollutionBurialCap(s), deaths = s.pollutionDeaths || 0;
    var overBurial = Math.max(0, deaths - cap);
    var burn = E.pollutionHappyBurnMul(s);
    var pBase = E.pollutionDeathPBase(s);
    var stages = (CFG.POLLUTION && CFG.POLLUTION.STAGES) || [];
    idx = Math.max(0, Math.min(stages.length - 1, idx));
    var current = stages[idx] || {};
    var next = stages[idx + 1];
    var stageName = pollutionStageName(idx);
    var nextStageName = next ? pollutionStageName(idx + 1) : '';
    var pollution = Math.max(0, +s.pollution || 0);
    /* 环形进度 = 当前阶段起点 → 下一阶段起点；最高阶段封顶。 */
    var pct = 100;
    if (next) {
      var lo = current.at || 0;
      pct = Math.max(0, Math.min(100, (pollution - lo) / (next.at - lo) * 100));
    }
    var fmt = E.fmtAmt;
    var forecast = pollutionForecastText(next, pollution, src.net);
    var sig = [idx, Math.round(src.emit * 100), Math.round(src.clean * 100),
      Math.round(src.cleanRate * 100), Math.round(src.turbine * 100), Math.round(src.other * 100),
      src.rateMul, src.canfillMul, deaths, cap, Math.round(burn * 10000), Math.round(pBase * 1000000),
      st.happy, st.kelpMul, st.coralMul, activeLocale()].join('|');
    if (sig === polSig) {
      /* 小数变化时只增量更新读数与环，不重建整块。 */
      var num = el('polNowNum'), nextNum = el('polNextNum'), progress = el('polProgressValue');
      var score = el('polScoreNow'), ring = el('polRing');
      var eta = el('polEta');
      if (num) num.textContent = fmt(pollution);
      if (nextNum) nextNum.textContent = next ? fmt(Math.max(0, next.at - pollution)) : tr('environment.pollution.highest_stage.value', null, '最高阶段');
      if (progress) progress.textContent = Math.round(pct) + '%';
      if (score) score.textContent = fmt(pollution);
      if (eta && eta.innerHTML !== forecast) eta.innerHTML = forecast;
      if (ring) {
        ring.style.setProperty('--pol-progress', pct.toFixed(1) + '%');
        ring.setAttribute('aria-valuenow', String(Math.round(pct)));
        ring.setAttribute('aria-valuetext', tr('environment.pollution.progress.aria_value', {
          stageName: stageName, pollutionStock: fmt(pollution)
        }, '{stageName}阶段，污染存量 {pollutionStock}'));
      }
      return;
    }
    polSig = sig;
    box.style.display = 'block';
    var stageColors = ['var(--green)', 'var(--cyan)', 'var(--amber)', '#ff8f4d', 'var(--red)'];
    box.style.setProperty('--pol-stage', stageColors[idx] || 'var(--cyan)');
    var debuff = [];
    if (st.happy < 0) debuff.push({
      text: tr('environment.pollution.effect.happiness', { happinessPenalty: Math.abs(st.happy) }, '幸福 −{happinessPenalty}')
    });
    if (st.kelpMul < 1) debuff.push({
      text: tr('environment.pollution.effect.kelp', { kelpReduction: Math.round((1 - st.kelpMul) * 100) }, '藻食 −{kelpReduction}%')
    });
    if (st.coralMul < 1) debuff.push({
      text: tr('environment.pollution.effect.coral', { coralReduction: Math.round((1 - st.coralMul) * 100) }, '珊瑚 −{coralReduction}%')
    });
    if (pBase > 0) debuff.push({
      text: tr('environment.pollution.effect.death_risk', { deathProbability: pollutionPercent(pBase) }, '死亡概率 {deathProbability}/秒'),
      title: tr('environment.pollution.death_risk.tooltip', { populationRolls: 1, maxDeathsPerTick: 1 },
        '已计入医院与政策卡的减免。每个结算步对整个人口进行 {populationRolls} 次统一判定；每步最多死亡 {maxDeathsPerTick} 人。')
    });
    var segments = '';
    for (var i = 0; i < stages.length; i++) {
      segments += '<i class="pol-stage-seg' + (i < idx ? ' done' : i === idx ? ' current' : '') + '" aria-hidden="true"></i>';
    }
    var modifiers = [];
    if (src.rateMul < 1) modifiers.push(tr('environment.pollution.modifier.policy_reduction', {
      reductionPercent: Math.round((1 - src.rateMul) * 100)
    }, '政策减排 −{reductionPercent}%'));
    if (src.canfillMul < 1) modifiers.push(tr('environment.pollution.modifier.canned_landfill', {
      reductionPercent: Math.round((1 - src.canfillMul) * 100)
    }, '装罐填埋：汽轮机排放 −{reductionPercent}%'));
    var netClass = src.net > 0 ? 'up' : src.net < 0 ? 'down' : '';
    var deathCount = Math.floor(deaths);
    var burialText = overBurial > 0
      ? tr('environment.pollution.burial.over_capacity', {
        deathCount: deathCount, burialCapacity: cap, overCapacity: Math.floor(overBurial)
      }, '污染死亡 {deathCount} 人 · 墓地安息位 {burialCapacity} · 超限 {overCapacity} 人')
      : tr('environment.pollution.burial.within_capacity', {
        deathCount: deathCount, burialCapacity: cap
      }, '污染死亡 {deathCount} 人 · 墓地安息位 {burialCapacity}');
    var alert = idx >= 3
      ? '<div class="pol-alert" role="status"><b>' + tr(pBase > 0
          ? 'environment.pollution.alert.risk_enabled' : 'environment.pollution.alert.risk_enabled_no_current_deaths', {
            stageName: stageName, deathProbability: pollutionPercent(pBase)
          }, pBase > 0
            ? '生态危急 · {stageName}：藻食与珊瑚产出大幅降低，污染死亡风险已启用（当前 {deathProbability}/秒）。'
            : '生态危急 · {stageName}：藻食与珊瑚产出大幅降低，污染死亡风险已启用。') + '</b></div>'
      : '';
    var html = '<section class="pollution-panel" aria-labelledby="polTitle">' +
      '<header class="pol-head"><div class="pol-title-group"><img class="pol-icon" src="assets/challenges/challenge-waterpollution-illustrated.webp" alt="" aria-hidden="true">' +
      '<div><div class="pol-title" id="polTitle">' + tr('challenge.water_pollution.name', null, '水体污染') + '</div><div class="pol-sub">' + tr('environment.pollution.subtitle', null, '净污染存量 · 每秒变化') + '</div></div></div>' +
      '<span class="pol-stage"><i aria-hidden="true"></i>' + tr('environment.pollution.stage.label', {
        stageNumber: idx, stageName: stageName
      }, '阶段 {stageNumber} · {stageName}') + '</span></header>' +
      '<div class="pol-hero"><div class="pol-ring" id="polRing" role="progressbar" aria-label="' + tr('environment.pollution.progress.aria_label', { stageName: stageName }, '{stageName}阶段进度') + '" aria-valuetext="' + tr('environment.pollution.progress.aria_value', {
        stageName: stageName, pollutionStock: fmt(pollution)
      }, '{stageName}阶段，污染存量 {pollutionStock}') + '" aria-valuenow="' + Math.round(pct) + '" aria-valuemin="0" aria-valuemax="100" style="--pol-progress:' + pct.toFixed(1) + '%">' +
      '<div class="pol-ring-core"><b id="polNowNum">' + fmt(pollution) + '</b><span>' + tr('environment.pollution.stock.label', null, '净污染存量') + '</span></div></div>' +
      '<div class="pol-progress-copy"><div class="pol-next-label">' + (next
        ? tr('environment.pollution.next_stage.label', { nextStage: nextStageName }, '距下一阶段 · {nextStage}')
        : tr('environment.pollution.highest_stage.label', null, '已进入最高阶段')) + '</div>' +
      '<strong class="pol-next-value" id="polNextNum">' + (next ? fmt(Math.max(0, next.at - pollution)) : tr('environment.pollution.highest_stage.value', null, '最高阶段')) + '</strong>' +
      '<div class="pol-threshold">' + (next
        ? tr('environment.pollution.threshold.next', { currentThreshold: fmt(current.at || 0), nextThreshold: fmt(next.at) }, '阶段阈值 {currentThreshold} → {nextThreshold}')
        : tr('environment.pollution.threshold.highest', { threshold: fmt(current.at || 0) }, '腐渊 · 污染 ≥ {threshold}')) + '</div>' +
      '<div class="pol-stage-line" aria-hidden="true">' + segments + '</div>' +
      '<div class="pol-progress-label"><span>' + tr('environment.pollution.progress.aria_label', { stageName: stageName }, '{stageName}阶段进度') + '</span><b id="polProgressValue">' + Math.round(pct) + '%</b></div>' +
      '<div class="pol-eta" id="polEta">' + forecast + '</div></div></div>' +
      '<div class="pol-rates" aria-label="' + tr('environment.pollution.rates.aria_label', null, '污染收支') + '">' +
      '<div class="pol-rate"><span>' + tr('environment.pollution.rate.emissions.label', null, '污染排放') + '</span><b class="up">' + tr('environment.pollution.rate.value', { signedRate: '+' + fmt(src.emit) }, '{signedRate}/秒') + '</b></div>' +
      '<div class="pol-rate"><span>' + tr('environment.pollution.rate.purification.label', null, '净化') + '</span><b class="down">' + tr('environment.pollution.rate.value', { signedRate: '−' + fmt(src.clean) }, '{signedRate}/秒') + '</b></div>' +
      '<div class="pol-rate"><span>' + tr('environment.pollution.rate.net_change.label', null, '净变化') + '</span><b class="' + netClass + '">' + tr('environment.pollution.rate.value', {
        signedRate: (src.net > 0 ? '+' : src.net < 0 ? '−' : '') + fmt(Math.abs(src.net))
      }, '{signedRate}/秒') + '</b></div></div>' +
      '<div class="pol-effects"><span class="pol-effects-label">' + tr('environment.pollution.effects.heading', null, '当前影响') + '</span>' +
      (debuff.length ? debuff.map(function (item) {
        var title = item.title ? ' title="' + item.title + '"' : '';
        return '<span class="pol-effect"' + title + '>' + item.text + '</span>';
      }).join('') : '<span class="pol-effect neutral">' + tr('environment.pollution.effects.none', null, '暂无阶段惩罚') + '</span>') + '</div>' + alert +
      '<div class="pol-burial"><span>' + burialText + '</span>' +
      '<strong title="' + tr('environment.pollution.burial.tooltip', {
        withinCapacityPenalty: pollutionPercent(CFG.POLLUTION.BURIAL.IN_CAP),
        overCapacityPenalty: pollutionPercent(CFG.POLLUTION.BURIAL.OVER_CAP)
      }, '限额内每名死者增加 {withinCapacityPenalty} 幸福消耗，超限部分每人增加 {overCapacityPenalty}；墓地扩建后按当前限额重算。') + '">' +
      tr('environment.pollution.happiness_cost', { happinessIncrease: Math.max(0, (burn - 1) * 100).toFixed(1) }, '幸福消耗 +{happinessIncrease}%') + '</strong></div>' +
      '<div class="pol-source"><div><b>' + tr('environment.hydro.title', null, '热液能流') + '</b><span>' +
      tr('environment.pollution.source.polluting_emissions', { emissions: fmt(src.emit) }, '脏源排放 {emissions}/秒') + ' · ' +
      tr('environment.pollution.source.clean_supply', { cleanSupply: fmt(src.cleanRate) }, '洁净源供给 {cleanSupply}/秒') + '</span></div>' +
      '<div class="pol-source-detail">' + tr('environment.pollution.source.turbine_and_other', {
        turbineSupply: fmt(src.turbine), otherEmissions: fmt(src.other)
      }, '汽轮机 {turbineSupply}/秒 · 其他脏源 {otherEmissions}/秒') +
      (modifiers.length ? ' · ' + modifiers.join(' · ') : '') + '</div></div>' +
      '<div class="pol-score"><span>' + tr('environment.pollution.score_if_clear_now', null, '若此刻完成戴森球 · 通关污染存量（越低越好）') + '</span><b id="polScoreNow">' + fmt(pollution) + '</b></div></section>';
    box.innerHTML = html;
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
  parts.renderPollution = renderPollution;
})(typeof window !== 'undefined' ? window : globalThis);
