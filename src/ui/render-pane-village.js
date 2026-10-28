/* 天壳 / SHELLBREAK — 巢穴 pane 渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function launchProgressPct(s, buildingId) {
    if (!s || !SB.economy || !SB.economy.launchCycleOf) return 0;
    var cycle = SB.economy.launchCycleOf(s);
    if (!(cycle > 0)) return 0;
    var nodeMode = SB.economy.launchNodeMode ? SB.economy.launchNodeMode(s) : false;
    var proc = Number(SB.economy.launchProcOf ? SB.economy.launchProcOf(s, buildingId, nodeMode) : 0);
    if (!isFinite(proc) || proc < 0) proc = 0;
    return Math.max(0, Math.min(100, Math.floor(((proc % cycle) / cycle) * 100)));
  }

  /* renderTick 每帧调用；每条只读本发射场计数器，并在整数百分比变化时改两处 DOM，
   * 不重画建筑列表，也不另开定时器。满发后的计时余数由结算逻辑清零/保留。 */
  function refreshLaunchProgress(s) {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    var bars = document.querySelectorAll('[data-launch-progress]');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i], id = bar.getAttribute('data-launch-progress');
      var pct = launchProgressPct(s, id), stamp = String(pct);
      if (bar.getAttribute('data-pct') === stamp) continue;
      bar.setAttribute('data-pct', stamp);
      bar.setAttribute('aria-valuenow', stamp);
      var fill = bar.querySelector('.launch-progress-track i');
      if (fill) fill.style.width = stamp + '%';
      var value = bar.querySelector('.launch-progress-value');
      if (value && value.textContent !== stamp + '%') value.textContent = stamp + '%';
    }
  }

  function paneVillage() {
    var s = SB.game.run(); let h = '';
    var buildingIconsShown = !!(SB.ui.render && SB.ui.render.buildingIconsShown && SB.ui.render.buildingIconsShown());
    /* 猫国开局唯一产能是手动点 "Gather catnip"（点一下 +1 猫薄荷）。
     * 本作对应物：点一下 +1 藻食——对齐 docs/DESIGN_v0.3.md §4「采集者 gatherer |
     * 藻食（手动也能点）」。手动采集产珊瑚是错的：那会把采集接到材料线上，
     * 珊瑚线从此由「采集」白送，珊瑚匠这个职业就没有存在理由了（见 config.js UNIT）。
     * 【开局路径（2026-09-26 硬上限 + 撤回「凿珊瑚」免费之后）】首座住房吃珊瑚
     *   （猫国 hut = wood），且人口是**硬上限** ⇒ 珊瑚那条线才是第一步：
     *   手动点「采珊瑚」100 下（0.1/次）→ 建礁口巢 → 上限 1 变 3 → 才有空位生人；
     *   生人同时还要口粮藻食 > GROW_KEEP。**先藻食后珊瑚那个顺序在硬上限下是错的**
     *   （建了菌圃也不生人），旧注释照 2026-09-25 的软容量写的，已改。 */
    /* 开局两条手动进项：藻食（食物线，攒够 15 建第一座深海菌圃）与珊瑚（材料线，
     * 攒够 10 建第一座礁口巢）。珊瑚给 0.1/次是刻意的——它是起步的零钱不是产线，
     * 真要用还得雇珊瑚匠（见 config.js 的 GATHER）。 */
    /* ⚠️ 按钮上的读数直接取 SB.GATHER，不在这里写死「+1 / +0.1」——
     * 写死的那一版曾经和 input.js 里真正入账的量对不上（那次是路径取错，
     * 这次是常数取错），玩家点一下发现和按钮上写的不一样。同源了之后
     * e2e 那条「读数与常数同源」断言才真的在守什么东西。 */
    var GA = SB.GATHER || { kelp: 1, coral: 1 };
    /* 自动点击角标（2026-10-28 用户：「只是提示正在自动点击」）。
     * 自动点击现在是**静默**的——不重画面板、只加资源（见 src/autoplay.js 的 ⑤），
     * 于是玩家唯一能感知它在跑的地方就是这一枚角标。读 s.perk.autoClick（0/1/2/3 = 次/秒），
     * 与 state.rebuildPerks 里 autoClicker1/2/3 三档叠加的口径同源，不自己数商品。
     * ⚠️ 刻意不加 animation / 呼吸灯：玩家报的问题就是「一直闪」，再给个动效等于换个方式闪。
     * ★ 2026-10-28 补：设置里可以暂停（s.autoClickOn === false）⇒ 角标改成「已暂停」灰态。
     *   若暂停时角标直接消失，玩家会以为 perks 丢了（买了东西却什么都没显示）。 */
    var _acRate = (s.perk && s.perk.autoClick) || 0;
    var _acOn = _acRate > 0 && !(s.autoClickOn === false);
    var _acTag = _acRate <= 0 ? ''
      : (_acOn
        ? '<span class="auto-click-tag" title="轮回商店「潮讯自拾」：自动替你点这两个按钮，' +
          '不随游戏倍速放大。可在 ⚙ 设置 → 自动 里暂停">自动点击中 · ' + _acRate + ' 次/秒</span>'
        : '<span class="auto-click-tag is-off" title="已在 ⚙ 设置 → 自动 里暂停；' +
          '手动点这两个按钮不受影响">自动点击已暂停</span>');
    /* ⚠️ 2026-10-16 用户「这里也统一一下」：两个采集按钮包进 .gather-btns，行加 .gather-row ——
     *   旧状两钮是 .row 的裸 flex 子项、无宽度约束，被文本列挤成逐字竖排，且「+1 / +0.1」
     *   宽窄不一。尺寸统一写进 CSS（见 50-module-polish）。 */
    h += '<div class="row gather-row"><div><div class="nm">手动采集' + _acTag + '</div>' +
      '<div class="ds">开局 1 人、0 自动收入，靠这个起步：先攒 5 珊瑚盖起礁口巢' +
      '（人口上限 1 → 3），再攒 15 藻食建深海菌圃让口粮跟上。' +
      /* 2026-10-27 用户：「是不是应该说明藻食低于 20 人口就不会增长」——
       * 这条规则原先只写在族民页的生育那一行，而玩家绝大多数时间待在巢穴页，
       * 于是出现「建完菌圃以为就会生人、结果人数纹丝不动」的困惑。
       * ⚠️ 门槛读 CFG.GROW_KEEP，不写死 20（改常数时文案自动跟）。 */
      '<b>人口要涨得同时满足两条：住房没住满，且藻食高于 ' + SB.CFG.GROW_KEEP +
      '（低于此值会一直停摆）。</b></div></div>' +
      '<div class="gather-btns">' +
      '<button class="btn buy" data-gather="kelp">采藻食 +' + GA.kelp + '</button>' +
      '<button class="btn buy" data-gather="coral">采珊瑚 +' + GA.coral + '</button>' +
      '</div></div>';

    /* ── 海底火山周期已挪走（2026-09-26 用户要求）──
     * 它是**读天候的**，和天壳（冰封层厚度）是一类东西，摆在「巢穴」这堆建造动作里
     * 没有归属感。现在两条一起住在顶上的「自然环境」卡里，实现见 renderEnv。
     * 拆分口径：巢穴页只答「我要做什么」，自然环境只答「外面现在什么样」。 */

    /* ── 暖石开关已搬走（2026-09-27 用户要求）──
     * 它原来在这一页，现在住顶上「自然环境」卡里的独立容器 #envWarm（实现见 renderWarm）。
     * 搬的理由：它的效果**完全由天候决定**（只在寒流季烧），摆在建造成那一堆里，
     * 玩家是在「外面什么天候」的语境下才会想到它——那正是自然环境卡的语境。
     * 它**不是**一条环境读数而是一项玩家动作，所以不能塞进同样每帧重画的 #envVolcano，
     * 而是另开一个容器 + 状态签名节流（细节见 renderWarm）。 */
    /* ── 建筑按区分组渲染（2026-09-30 纯 UI 分区 A 方案）──
     * 外层按 BUILD_ZONES 顺序分区，区内沿用上面「露头/解锁」判定；
     * 某区零可见建筑时整段区标题隐藏（开局只露出礁栖核心 + 生息区，其余随进度展开）。
     * 露头逻辑与原平铺版完全一致，只是多了一层分区外壳。 */
    /* 消耗标注（2026-10-17 用户：「所有有消耗的建筑，消耗的东西也要写明，不光是暖石」）。
     * 只标暖石是**半截口径**：热泉炉同时吃金属、热液工坊吃热液能+金属，玩家挑「开几座」
     * 时看不到另一样就会开到缺料停摆。三个数全部来自 economy.consumeRates（与结算同式），
     * UI 不自己算乘区 —— 面板===结算家族。
     * 顺序由 SB.ui.consumeMeta.BUILDING_CONSUME 维护（与信息卡同源），天然对齐「金属在前 / 热液能在前」的语序。
     * ⚠️ 行为：该建筑吃的所有类型**始终列出**——满转给数值、停产给「（停产时为 0）」占位，不再「全 0 就不出行」。 */
    /* 2026-10-17 收口：消耗类型表统一走 SB.ui.consumeMeta（由 render-info.js 挂出），
     * 巢穴页控件行与信息卡共用同一份「吃哪几样 + IDLE 文案」，不再各写一份（单一数据源）。
     * ⚠️ 关键行为变更：之前「全 0（停产）就不出行」⇒ 玩家把工坊座数全关（让流给天穹钻机）
     *   时整行没有任何消耗标注，看着像「热液能消耗漏标」。现在改为**始终列出该建筑吃的所有类型**，
     *   满转给数值、停产给「（停产时为 0）」占位——与信息卡口径对齐，消耗类型永远可见。 */
    /* 2026-10-21：drawTag 已提升为共享 SB.ui.drawTag（render-info.js），巢穴页控件行直接调它，
     * 与信息卡、星图建筑管理三处同源，不再各写一份。 */
    for (var zi = 0; zi < (SB.BUILD_ZONES || []).length; zi++) {
      var z = SB.BUILD_ZONES[zi];
      var zRows = '';
      var zShown = 0;
      for (var i = 0; i < SB.BUILDINGS.length; i++) {
        var b = SB.BUILDINGS[i];
        if (b.zone !== z.id) continue;
        /* 没解锁的建筑整行不渲染——开局列表里只有深海菌圃一张脸，
         * 其余随 unlockScheme / requiredTech / 科技 eff.unlockBuild 逐个出现。
         * 露头是单向的：露过一次就永久可见（lv>0 或已记进 s.seen）。
         * 否则玩家一花藻食把库存压回阈值以下，刚冒出来的采石场/导流堤会当场消失，
         * 看着像「建筑自己跳出来又自己没了」——猫国 unlockable 同样只进不退。 */
        var lv = s.lvl[b.id] || 0;
        var isUnlocked = SB.habitat.unlocked(s, b);
        if (SB.habitat.retired && SB.habitat.retired(s, b)) continue;
        if (lv <= 0 && !(s.seen && s.seen[b.id]) && !isUnlocked) continue;
        if (isUnlocked) SB.habitat.reveal(s, b);
        /* ⚠️⚠️ 建筑升级型 = 同一座建筑改名字（2026-10-06 用户两次纠偏定死）。
         *   本作有四条升级项 desc 写的是「X升级：…」——鱼骨矿井 / 大学 / 城堡 / 深层矿井。
         *   它们的语义都是**那座建筑买下之后就地改名**，不是另造一座：
         *     砂矿坑 → 鱼骨矿井 → 深层矿井（两级链）
         *     研究所 → 大学
         *     议事厅 → 城堡
         *   ⇒ 这一行的 id、等级键、造价曲线**全程不变**，只有显示名与效果文案变。
         *   判据读 UPGRADES 的 `upgradesBuilding` 字段（声明在数据侧，见 config 那段注释），
         *   UI 侧只做一次通用查找 ⇒ 加第五个这种升级时不必再动这个文件。
         *   ⚠️【为什么不能靠改 `b.name` 实现】建筑定义是全局常量，被 costOf / 科技 / 分区
         *      多处共读，在那里改名会让所有跨模块读数一起变。改显示名是**纯 UI 动作**。
         *   ⚠️【链式取最深一级】矿坑有两级升级（鱼骨矿井 → 深层矿井），两件都装了时
         *      面板要显示**最后一级**的名字（深层矿井），所以按 UPGRADES 的声明顺序遍历、
         *      命中即记、继续往后覆盖 —— 而不是「命中就 break」。 */
        /* ⚠️ 变量名不许叫 `ui`：`SB.ui` 是本模块在文件末尾挂上去的**全局命名空间**
         *   （SB.ui.openIntro / SB.ui.render）。在这里 `var ui` 会把它遮蔽成循环下标，
         *   于是模块末尾 `SB.ui = SB.ui || {}` 读到数字 0 → falsy → 整个命名空间重建为空对象，
         *   页面启动即 `querySelector is not a function`。踩过一次，改名 `_upi`。 */
        /* 2026-10-21（用户拍板）：描述走共享出口 SB.ui.buildingDescText —— 凡「科技改写数值」
         *   的建筑（当前=核热厂）按本局实际状态出数，不写「如果研究了会是多少」的条件句。 */
        var dispName = b.name,
            dispDesc = (SB.ui && SB.ui.buildingDescText) ? SB.ui.buildingDescText(s, b) : b.desc;
        for (var _upi = 0; SB.UPGRADES && _upi < SB.UPGRADES.length; _upi++) {
          var _u = SB.UPGRADES[_upi];
          if (_u.upgradesBuilding === b.id && s.upgrades && s.upgrades[_u.id]) {
            dispName = _u.name;
            /* `buildingDesc` 是给建筑行准备的完整文案；没写就退回 `desc`。
             *   两者主语不同：desc 说「砂矿坑升级：…」（升级面板里正确），buildingDesc
             *   直接陈述效果（那一行已经叫鱼骨矿井了）。见 config 那段分工注释。 */
            dispDesc = _u.buildingDesc || _u.desc;
          }
        }
        var c = SB.economy.costOf(s, b.id);
        var ok = SB.economy.canAfford(s, c);
        var blocked = !SB.habitat.needMet(s, b);
        /* 按钮文案**一律带成本**。旧写法是「够钱写『建造』、不够才写成本」，于是
         * 恰好在最该看成本的那一刻（攒够了）成本从按钮上消失，而按钮宽度还会随库存
         * 反复跳变（够 → 变窄 → 花掉 → 又变宽），点起来像在躲手指。
         * 等级 >0 用「升级」、首级用「建造」：买的是同一件事，但玩家心里问的是
         * 「这一级要多少」，用词跟着等级走比一律写「建造」更答得上话。
         * 前置没满足时只说「需 XX」——那时按钮点不动，成本不是当下该看的信息。 */
        var label = blocked ? '需 ' + (SB.habitat.buildingById(b.need) || {}).name
          : (lv > 0 ? '升级 ' : '建造 ') + SB.economy.buildCostTxt(s, b.id, c);
        /* 轻车熟路首建免费（2026-10-28）：costOf 已把资源项乘 0，buildCostTxt 会输出「免费」。
         *   优先级：blocked / canalCap / maxReached 都在它上面 —— 那三个是「点不动」，
         *   免费只表示「不用花钱」，不能让一个点不动的按钮看起来可以点。 */
        /* 王国潮道的跨建筑钳制与 build()/lockReason() 同一条判定——不判它按钮会
         * 「亮着但点了没反应」（build 内部静默 return false）。 */
        var canalCap = b.id === 'canal' && (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0);
        if (canalCap) label = '需先升灯塔（现 ' + (s.lvl.lighthouse || 0) + ' 级）';
        /* ERA10 市政（2026-10-20 · 虚境祭坛 `maxLvl:3`）：等级上限与 habitat.build **同判据**
         * （都读建筑条目的 maxLvl，不烤死数字）。跑到上限时按钮灰掉且文案直说，
         * 绝不能留一个「亮着但点了静默 return false」的按钮（与 canalCap 同一纪律）。 */
        var maxReached = !!(b.maxLvl && lv >= b.maxLvl);
        if (maxReached) label = '已达上限 ' + b.maxLvl + ' 级';
        /* 区域建筑自动建造/升级开关：权限由已完成市政的 autoBuildZones 决定，
         * 生息区归封建主义、贸易区域归重商主义；仍复用 s.autoUpg 与 data-auto。 */
        var autoBtn = '';
        if (SB.habitat.autoZoneUnlocked(s, z.id)) {
          var _au = !!(s.autoUpg && s.autoUpg[b.id]);
          /* 和升级按钮并排组成紧凑按钮组；保留独立的 data-auto 点击区。 */
          autoBtn = '<button type="button" class="btn tog auto-upgrade-toggle' + (_au ? ' on' : '') + '" data-auto="' + b.id + '"' +
            ' aria-pressed="' + (_au ? 'true' : 'false') + '"' +
            ' aria-label="自动建造 / 升级' + (_au ? '已启用' : '已停用') + '"' +
            ' title="自动建造 / 升级' + (_au ? '已启用，点击停用' : '已停用，点击启用') + '">自动</button>';
        }
        /* 热泉炉「开几座」（2026-09-30 用户：「这行应该是选择开几个」）：建成（lv>0）后才出现。
         * 炉子是「金属+暖石 → 精铁」的持续消耗口，玩家按原料供给决定开几座。
         * 运行座数 = lv − 停用数（s.furnaceStop），结算在 economy.ironFlow。
         * ± 按钮走 document 级委托，所以 pane 每 2 秒重画也不会丢点击。 */
        var furnBtn = '';
        if (b.id === 'furnace' && lv > 0) {
          var _frun = Math.max(0, lv - Math.max(0, s.furnaceStop || 0));
          furnBtn = '<span class="furnctl' + (_frun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-furnace-dec="1" title="少开一座"' +
            (_frun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _frun + '/' + lv + '</b>' +
            '<button class="fbtn" data-furnace-inc="1" title="多开一座"' +
            (_frun >= lv ? ' disabled' : '') + '>＋</button>' +
            /* 金属 + 暖石 两样都标（2026-10-17）：原来只标暖石，玩家会以为炉子只烧石头。 */
            SB.ui.drawTag(s, 'furnace') +
            '</span>';
        }
        /* 砂矿坑「开几座」：矿坑本身是可停用建筑，按 furnaceStop 一类的停用数量控制。
         * 运行矿坑数同时决定矿脉产出加成；装有自动化钻探时，还决定钛/铀加成与热液能需求。 */
        var siltpitBtn = '';
        /* 2026-10-26 修复：开关是《自动化钻探》(upg_autodrill) 的效果（config-content.js:560
         *   「在巢穴面板启停砂矿坑」），未研究时不该出现——否则前期玩家停了矿坑只有亏
         *   （基础矿脉加成零成本纯正收益），与热泉炉「建出来就有」的口径不同。 */
        if (b.id === 'siltpit' && lv > 0 && s.upgrades && s.upgrades.upg_autodrill) {
          var _spstop = Math.max(0, Math.min(lv, Math.floor(s.siltpitStop || 0)));
          var _sprun = lv - _spstop;
          var _spAuto = !!(s.upgrades && s.upgrades.upg_autodrill);
          var _spExtra = '';
          if (_spAuto) {
            var _spPct = lv > 0 ? Math.round(_sprun / lv * 100) : 0;
            var _spHydro = _sprun * (SB.UNIT.drillHydro || 0.3);
            _spExtra = '<span class="fdraw" title="自动化钻探按运行矿坑占比增加钛与铀总产出">钛/铀总产出 +' +
              _spPct + '% · 热液能 −' + _spHydro.toFixed(2) + '/秒</span>';
          }
          siltpitBtn = '<span class="furnctl' + (_sprun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-siltpit-dec="1" title="停用一座矿坑"' +
            (_sprun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _sprun + '/' + lv + '</b>' +
            '<button class="fbtn" data-siltpit-inc="1" title="启用一座矿坑"' +
            (_sprun >= lv ? ' disabled' : '') + '>＋</button>' + _spExtra +
            '</span>';
        }
        /* 工坊「开几座」：基础工艺效率、工业机器人加成与耗流都按运行的工坊数量计算。 */
        var workshopBtn = '';
        /* 2026-10-26 修复：开关是《工业机器人》(upg_indrobot) 的效果（config-content.js:591
         *   「在巢穴面板启停工坊」），未研究时不渲染——理由同砂矿坑（停用前零成本纯亏）。 */
        if (b.id === 'workshop' && lv > 0 && s.upgrades && s.upgrades.upg_indrobot) {
          var _wsstop = Math.max(0, Math.min(lv, Math.floor(s.workshopStop || 0)));
          var _wsrun = lv - _wsstop;
          var _wsExtra = '';
          if (s.upgrades && s.upgrades.upg_indrobot) {
            var _wsPct = lv > 0 ? Math.round(_wsrun / lv * 100) : 0;
            var _wsHydro = _wsrun * (SB.UNIT.robotHydro || 3);
            _wsExtra = '<span class="fdraw" title="工业机器人按运行工坊占比增加工艺总产出">工艺总产出 +' +
              _wsPct + '% · 热液能 −' + _wsHydro.toFixed(2) + '/秒</span>';
          }
          workshopBtn = '<span class="furnctl' + (_wsrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-workshop-dec="1" title="停用一座工坊"' +
            (_wsrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _wsrun + '/' + lv + '</b>' +
            '<button class="fbtn" data-workshop-inc="1" title="启用一座工坊"' +
            (_wsrun >= lv ? ' disabled' : '') + '>＋</button>' + _wsExtra +
            '</span>';
        }
        /* 热液汽轮机「开几座」（2026-10-07，与热泉炉 furnaceStop 同口径）：建成（lv>0）后才出现。
         * 汽轮机每台恒烧暖石 5/s、产热液能流 1/s；玩家要省暖石（或没工坊/钻机吃流）时按下几座。
         * 运行座数 = lv − 停用数（s.turbineStop），结算在 economy.hydroAlloc（供给）/ steelFlow（暖石扣费）。
         * 复用 .furnctl 样式（−/＋/数字，绿=运转中），± 走 document 级委托防丢点击。 */
        var turbBtn = '';
        if (b.id === 'hydroturbine' && lv > 0) {
          var _trun = Math.max(0, lv - Math.max(0, s.turbineStop || 0));
          turbBtn = '<span class="furnctl' + (_trun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-turbine-dec="1" title="停一座"' +
            (_trun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _trun + '/' + lv + '</b>' +
            '<button class="fbtn" data-turbine-inc="1" title="开一座"' +
            (_trun >= lv ? ' disabled' : '') + '>＋</button>' +
            /* 汽轮机只烧暖石，走同一条 drawTag（口径统一：以后它若多吃一样不用再改这里）。 */
            SB.ui.drawTag(s, 'hydroturbine') +
            '</span>';
        }
        /* 热液工坊「开几座」（2026-10-07，与汽轮机 turbineStop / 热泉炉 furnaceStop 同口径）：建成（lv>0）后才出现。
         * 工坊吃热液能流产钢；玩家要「把流让给天穹钻机」或不想产钢时按下几座。
         * 运行座数 = lv − 停用数（s.hydroshopStop），结算在 economy.hydroAlloc（shopL）。复用 .furnctl 样式。 */
        var shopBtn = '';
        if (b.id === 'hydroshop' && lv > 0) {
          var _srun = Math.max(0, lv - Math.max(0, s.hydroshopStop || 0));
          shopBtn = '<span class="furnctl' + (_srun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-shop-dec="1" title="停一座"' +
            (_srun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _srun + '/' + lv + '</b>' +
            '<button class="fbtn" data-shop-inc="1" title="开一座"' +
            (_srun >= lv ? ' disabled' : '') + '>＋</button>' +
            /* 工坊原先一个消耗都没标（用户 2026-10-17 截图指出）：它吃 热液能 + 金属 两样。 */
            SB.ui.drawTag(s, 'hydroshop') +
            '</span>';
        }
        /* 轨道卫星「开几座」（2026-10-17 · spec §5，与 furnaceStop 同口径）：建成（lv>0）后才出现。
         * 卫星每级 +5/s 星空探索、运转耗 1 热液能/秒（与空间站同口径，停产停耗与星空贡献）；玩家要省星空推进时按下几颗。
         * 运行座数 = lv − 停用数（s.satelliteStop），结算在 economy.starRate。复用 .furnctl 样式。 */
        var satBtn = '';
        if (b.id === 'satellite' && lv > 0) {
          var _satrun = Math.max(0, lv - Math.max(0, s.satelliteStop || 0));
          satBtn = '<span class="furnctl' + (_satrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-satellite-dec="1" title="少开一颗"' +
            (_satrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _satrun + '/' + lv + '</b>' +
            '<button class="fbtn" data-satellite-inc="1" title="多开一颗"' +
            (_satrun >= lv ? ' disabled' : '') + '>＋</button>' +
            /* ERA7（2026-10-18 · 用户纠正补）：卫星每级耗 1 热液能/秒，与空间站同口径，
             * 走 drawTag 显示总额（drawTag 读 BUILDING_CONSUME + consumeRates 同式）。 */
            SB.ui.drawTag(s, 'satellite') +
            '</span>';
        }
        /* 空间站「开几座」（2026-10-17 · spec §5，与 satelliteStop 同口径）：建成（lv>0）后才出现。
         * 空间站每级 +10/s 星空探索、耗 2 热液能/秒；玩家要省热液能（或不想推星空）时按下几座。
         * 运行座数 = lv − 停用数（s.spacestationStop），结算在 economy.starRate（星空产出）+ hydroAlloc（热液耗）。
         * 复用 .furnctl 样式，并标出它的热液能消耗（drawTag 走 consumeRates 同式）。 */
        var ssBtn = '';
        if (b.id === 'spacestation' && lv > 0) {
          var _ssrun = Math.max(0, lv - Math.max(0, s.spacestationStop || 0));
          ssBtn = '<span class="furnctl' + (_ssrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-spacestation-dec="1" title="停一座"' +
            (_ssrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _ssrun + '/' + lv + '</b>' +
            '<button class="fbtn" data-spacestation-inc="1" title="开一座"' +
            (_ssrun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'spacestation') +
            '</span>';
        }
        /* ERA8 生物材料研究所「开几座」：一并控制四种原料、θ产出和热液能耗。 */
        var biomatlabBtn = '';
        if (b.id === 'biomatlab' && lv > 0) {
          var _blrun = Math.max(0, lv - Math.max(0, s.biomatlabStop || 0));
          biomatlabBtn = '<span class="furnctl' + (_blrun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-biomatlab-dec="1" title="停一座"' +
            (_blrun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _blrun + '/' + lv + '</b>' +
            '<button class="fbtn" data-biomatlab-inc="1" title="开一座"' +
            (_blrun >= lv ? ' disabled' : '') + '>＋</button>' +
            SB.ui.drawTag(s, 'biomatlab') + '</span>';
        }
        /* ERA10（2026-10-20 · 用户 ERA10 表「绝热材料」解锁1）：发射场制造模式切换。
         * ERA10 市政（2026-10-20）：判据从写死 `europa_launch` 改成建筑上的 `launchpad` 标记
         * ——泰拉/瑞亚两座新发射场自动获得同一个钮（三座共用一个 s.launchMode，
         * 它们是同一套制造体系，分开切只会让玩家以为是两套规则）。
         * 建成（lv>0）且完成《绝热材料》后才出钮（科技门与 economy-tick 2f 的 _nodeMode 同源）。
         * 点它在「太阳帆 ⇄ 戴森球节点」间切（s.launchMode，state.js seed 默认 'sail'）。
         * 复用 .furnctl 样式；按钮写当前制造品，并用 ⇄ 提示可切换。 */
        var elBtn = '';
        var launchCtl = '';
        if (b.launchpad && lv > 0) {
          var _launchRun = SB.economy && SB.economy.launchActiveLvl
            ? SB.economy.launchActiveLvl(s, b.id) : lv;
          launchCtl = '<span class="furnctl launch-count' + (_launchRun > 0 ? ' on' : '') + '">' +
            '<button class="fbtn" data-launch-dec="' + b.id + '" title="停用本场一级"' +
            (_launchRun <= 0 ? ' disabled' : '') + '>−</button>' +
            '<b class="fnum">开 ' + _launchRun + '/' + lv + '</b>' +
            '<button class="fbtn" data-launch-inc="' + b.id + '" title="启用本场一级"' +
            (_launchRun >= lv ? ' disabled' : '') + '>＋</button></span>';
        }
        if (b.launchpad && lv > 0 && s.techs && s.techs.adiabatic) {
          var _nodeOn = (s.launchMode === 'node');
          elBtn = '<span class="furnctl launch-mode' + (_nodeOn ? ' on' : '') + '">' +
            '<button class="fbtn launch-mode-toggle" data-launch-mode="1" title="' +
            (_nodeOn ? '点击切换到「太阳帆」（每级每秒耗铀 0.5、火箭引擎 0.3、θ金属薄膜 0.3、热液能 4；周期完成时按本场等级同时发射）'
                     : '点击切换到「戴森球节点」（每级每秒耗铀 5、火箭引擎 3、θ金属薄膜 3、钛合金板 30、热液能 4；周期完成时按本场等级同时发射）') +
            '"><span class="launch-mode-text">' + (_nodeOn ? '制造节点' : '制造太阳帆') + '</span>' +
            '<span class="launch-mode-swap" aria-hidden="true">⇄</span></button></span>';
        }
        // 等级标签显式标注“等级”，避免孤立数字被误认成其他状态。
        // 潮纹馆带「虚级」（大潮纹馆 +3，按效果算、按建筑不算，见 wonder.libBonus）：
        // 等级直接写成「等级 1+3」——真实等级在前、虚级在后，一眼看出哪部分是白送的。
        // 其它建筑没有虚级通道，照旧只写一个数。
        var lvValueTxt = (b.id === 'library' && SB.wonder && SB.wonder.libBonus(s) > 0)
          ? lv + '+' + SB.wonder.libBonus(s) : lv;
        /* ERA10 市政：带等级上限的建筑显示「当前/上限」，让玩家一眼看到还剩几级可建。 */
        if (b.maxLvl) lvValueTxt = lv + '/' + b.maxLvl;
        var lvTitle = b.maxLvl ? '建筑等级（当前/上限）' : '建筑等级';
        if (b.id === 'library' && SB.wonder && SB.wonder.libBonus(s) > 0 && !b.maxLvl) {
          lvTitle = '含大潮纹馆虚级（只算科技产出效果，不算建筑等级、不加建造成本）';
        }
        var rowState = 'bld-row' + (lv > 0 ? ' is-owned' : '') + (blocked || canalCap ? ' is-blocked' : '') +
          (!blocked && !canalCap && ok ? ' is-ready' : '');
        /* ERA10 市政（2026-10-20 · 虚境祭坛「每升一级按钮上就加一些血纹」）：
         * 血纹是**纯 CSS 装饰**（不做结算、不进 save）：按等级给行加 `void-lv-N`，
         * `60-star-map.css` 之外另开一块在 `40-atmosphere-theme.css`? 不——血纹放
         * `50-module-polish.css` 的祭坛段，纯伪元素，不引图片、不影响点击热区。 */
        if (b.id === 'void_altar') rowState += ' void-altar void-lv-' + lv;
        if (b.id === 'black_monolith') rowState += ' faith-monolith';
        var buildingIconHTML = buildingIconsShown && b.icon
          ? '<img class="building-icon" src="' + b.icon + '" alt="" aria-hidden="true" width="32" height="32">' : '';
        var launchProgressHTML = '';
        /* 缺料徽标（2026-10-28）：只在 b.launchpad 分支里被赋值，其余建筑恒为空串。
         * 声明在此处是因为它要拼进下面**名称行**的字符串里。 */
        var _lpLackHTML = '';
        if (b.launchpad && lv > 0) {
          var _lpNodeMode = SB.economy && SB.economy.launchNodeMode ? SB.economy.launchNodeMode(s) : false;
          var _lpPct = launchProgressPct(s, b.id);
          var _lpCosts = SB.economy && SB.economy.launchMaterialPer ? SB.economy.launchMaterialPer(s) : {};
          var _lpHydroPer = SB.economy && SB.economy.launchHydroPer ? SB.economy.launchHydroPer(s) : 4;
          var _lpCostRows = [
            { key: 'uranium', short: '铀', full: '铀', per: _lpCosts.uranium || 0 },
            { key: 'strongProp', short: '引擎', full: '强工质火箭引擎', per: _lpCosts.strongProp || 0 },
            { key: 'thinafilm', short: 'θ薄膜', full: 'θ金属自适应薄膜', per: _lpCosts.thinafilm || 0 },
            { key: 'tiplate', short: '钛板', full: '钛合金板', per: _lpCosts.tiplate || 0 },
            { key: 'hydro', short: '热液能', full: '热液能', per: _lpHydroPer }
          ];
          var _lpCostShort = [], _lpCostFull = [];
          for (var _lpc = 0; _lpc < _lpCostRows.length; _lpc++) {
            var _lpCost = _lpCostRows[_lpc];
            if (_lpCost.per <= 0) continue;
            var _lpTotal = _lpCost.per * _launchRun;
            _lpCostShort.push(_lpCost.short + ' −' + _lpTotal.toFixed(2) + '/秒');
            _lpCostFull.push(_lpCost.full + ' −' + _lpTotal.toFixed(2) + '/秒');
          }
          /* ── 缺料 / 断流状态徽标（2026-10-28）──────────────────────────
           * 【为什么需要】三座发射场缺料时进度条就是不走，而「为什么」原本只写在
           *   `.launch-consumption` 的 title 里 —— 手机端没有 hover，等于永远看不见。
           *   与热泉炉那一批同一个病（JUDGMENTS 五点二十六），只是落点不同。
           * 【判据不在这里算】全部来自 `economy.launchStatus`（与 rates 的 `_elRunR`、
           *   tick 2f 的 && 链三处同源）。渲染层只负责把 lack 键翻成中文短名。
           * 【正常时一个字符都不加】避免制造噪声。
           * ⚠️ 徽标放在**操作列 .bld-ops**（flex），不是名称行 .bld-label ——
           *   后者是 `grid-template-columns: minmax(0,1fr) 64px` 两列网格，塞第三个子元素
           *   会占掉「第二行第一列」并被 1fr **拉成整条横幅**，同时把「制造太阳帆」按钮
           *   挤到右列（实测截图就是这样，难看且会跳位）。操作列是 flex，按内容宽度排，
           *   而且紧邻 −/＋ 与进度条，语义上更近。
           * ⚠️ 也不要塞进 .launch-progress：那个在 >900px 是 `position:absolute; bottom:-14px`，
           *   多一行会让它**向上**长高、压住本行文字。
           * ⚠️ 必须在本段之前算好，因为下面的 title 要带着它一起拼。 */
          var _lpLackName = '';
          var _lpSt = (SB.economy && SB.economy.launchStatus) ? SB.economy.launchStatus(s, b.id) : null;
          if (_lpSt && _lpSt.lack) {
            for (var _lpl = 0; _lpl < _lpCostRows.length; _lpl++) {
              if (_lpCostRows[_lpl].key === _lpSt.lack) { _lpLackName = _lpCostRows[_lpl].short; break; }
            }
            if (_lpLackName) {
              /* 发射场是**全有或全无**的门（够则满速、不够则整场停），所以恒为 is-stop；
               * 不给「开工 N%」——那是比例型建筑（工坊/研究所）的说法，用在这里就是撒谎。 */
              _lpLackHTML = '<b class="lack-tag is-stop">缺' + _lpLackName + ' · 暂停</b>';
            }
          }
          var _lpCostTitle = '本场当前启用等级的额定每秒需求；缺料或热液能不足时制造暂停：' + _lpCostFull.join(' · ');
          if (_lpLackName) _lpCostTitle += '。当前状态：缺' + _lpLackName + '，本场已暂停，补足后自动继续';
          var _lpCostHTML = '<span class="launch-consumption" title="' + _lpCostTitle + '">' + _lpCostShort.join(' · ') + '</span>';
          launchProgressHTML = '<div class="launch-progress" id="launch-progress-' + b.id + '" data-launch-progress="' + b.id + '" title="本场按制造周期独立推进；停用时保留进度。' + _lpCostTitle + '" role="progressbar" aria-label="' +
            (_lpNodeMode ? '戴森球节点' : '太阳帆') + '发射进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + _lpPct + '" data-pct="' + _lpPct + '">' +
            '<span class="launch-progress-label">发射</span><div class="launch-progress-track"><i style="width:' + _lpPct + '%"></i></div>' +
            '<span class="launch-progress-value">' + _lpPct + '%</span>' + _lpCostHTML + '</div>';
        }
        zRows += '<div class="row ' + rowState + '"><div class="bld-main' + (buildingIconHTML ? ' has-building-icon' : '') + '">' + buildingIconHTML +
          '<div class="bld-copy"><div class="nm"><span class="bld-label"><button type="button" class="building-name" data-build-info="' + b.id +
          '" aria-haspopup="dialog" title="查看' + dispName + '的效果与建造信息">' + dispName + '</button>' +
          ' <span class="tag" data-lv="' + b.id + '" title="' + lvTitle + '">等级 ' + lvValueTxt + '</span>' +
          (elBtn ? '<span class="launch-mode-anchor">' + elBtn + '</span>' : '') +
          '</span><span class="bld-ops">' + _lpLackHTML + siltpitBtn + workshopBtn + furnBtn + turbBtn + shopBtn + satBtn + ssBtn + biomatlabBtn + launchCtl + launchProgressHTML + '</span></div>' +
          '<div class="ds">' + dispDesc + (blocked ? '（需先建成' + (SB.habitat.buildingById(b.need) || {}).name + '）' : '') +
          '</div></div></div>' +
          '<div class="buy-actions' + (autoBtn ? ' has-auto-toggle' : '') + '">' + autoBtn + '<button class="btn buy" data-build="' + b.id + '"' + (ok && !blocked && !canalCap && !maxReached ? '' : ' disabled') + '>' + label + '</button></div></div>';
        zShown++;
      }
      /* 区标题按区着色（2026-09-30 晚）：--hc 交给 CSS 画左色条 + 同色文字，
       * 与最外层 cardhd 同一套语言（见 ZONE_COLOR）。
       * 2026-09-30 晚再补折叠：外包一层 .bzone，标题带 data-zfold（点击委托），
       * 正文进 .bzbody；折叠态从 ZONE_FOLDED 重拼（pane 每 2 秒重画，落类会被冲掉）。 */
      if (zShown > 0) {
        h += '<div class="bzone' + (SB.ui.render.isZoneFolded(z.id) ? ' folded' : '') +
          '" data-zone="' + z.id + '">' +
          '<div class="bztitle" data-zfold="' + z.id + '" style="--hc:' +
          (SB.ui.render.zoneColor(z.id) || 'var(--dim)') + '" title="点击折叠 / 展开">' +
          '<span class="bzcv">▾</span>' + z.name + '</div>' +
          '<div class="bzbody">' + zRows + '</div></div>';
      }
    }
    return h;
  }

  parts.paneVillage = paneVillage;
  parts.refreshLaunchProgress = refreshLaunchProgress;
})(typeof window !== 'undefined' ? window : globalThis);
