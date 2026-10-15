/* 天壳 / SHELLBREAK — 巢穴 pane 渲染。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  SB.ui = SB.ui || {};
  var parts = SB.ui.renderParts || (SB.ui.renderParts = {});

  function paneVillage() {
    var s = SB.game.run(); let h = '';
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
    h += '<div class="row"><div><div class="nm">手动采集</div>' +
      '<div class="ds">开局 1 人、0 自动收入，靠这个起步：先攒 5 珊瑚盖起礁口巢' +
      '（人口上限 1 → 3），再攒 15 藻食建深海菌圃让口粮跟上。</div></div>' +
      '<button class="btn buy" data-gather="kelp">采藻食 +' + GA.kelp + '</button>' +
      '<button class="btn buy" data-gather="coral">采珊瑚 +' + GA.coral + '</button></div>';

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
        var dispName = b.name, dispDesc = b.desc;
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
          : (lv > 0 ? '升级 ' : '建造 ') + SB.economy.costOwnedTxt(s, c);
        /* 王国潮道的跨建筑钳制与 build()/lockReason() 同一条判定——不判它按钮会
         * 「亮着但点了没反应」（build 内部静默 return false）。 */
        var canalCap = b.id === 'canal' && (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0);
        if (canalCap) label = '需先升灯塔（现 ' + (s.lvl.lighthouse || 0) + ' 级）';
        /* 生息区自动升级开关（2026-09-30 · 封建主义解锁2）：逐建筑开关放 s.autoUpg[id]，
         * 点击走 input.js 的 data-auto 分支。执行在 game.js 在线泵的 habitat.autoTick。 */
        var autoBtn = '';
        if (z.id === 'food' && s.civics && s.civics.feudalism) {
          var _au = !!(s.autoUpg && s.autoUpg[b.id]);
          /* 与暖石开关同一套「启用 / 停用 + 绿 / 灰」（2026-09-30 用户：开/关分不清）——
           * 同一页里两种开关语言会让人以为它们不是一回事。 */
          autoBtn = '<button class="btn tog' + (_au ? ' on' : '') + '" data-auto="' + b.id + '"' +
            ' title="自动升级：点击切换启用 / 停用">' +
            (_au ? '自动·启用' : '自动·停用') + '</button>';
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
            '</span>';
        }
        // 没有等级上限，所以只显示当前级数，不显示 x/上限
        // 潮纹馆带「虚级」（大潮纹馆 +3，按效果算、按建筑不算，见 wonder.libBonus）：
        // 徽章直接写成「1+3」——真实等级在前、虚级在后，一眼看出哪部分是白送的。
        // 其它建筑没有虚级通道，照旧只写一个数。
        var lvTxt = (b.id === 'library' && SB.wonder && SB.wonder.libBonus(s) > 0)
          ? lv + '+' + SB.wonder.libBonus(s) : lv;
        var rowState = 'bld-row' + (lv > 0 ? ' is-owned' : '') + (blocked || canalCap ? ' is-blocked' : '') +
          (!blocked && !canalCap && ok ? ' is-ready' : '');
        zRows += '<div class="row ' + rowState + '"><div><div class="nm"><button type="button" class="building-name" data-build-info="' + b.id +
          '" aria-haspopup="dialog" title="查看' + dispName + '的效果与建造信息">' + dispName + '</button>' +
          ' <span class="tag" data-lv="' + b.id + '"' +
          (lvTxt !== String(lv) ? ' title="含大潮纹馆虚级（只算科技产出效果，不算建筑等级、不加建造成本）"' : '') +
          '>' + lvTxt + '</span>' + autoBtn + furnBtn + turbBtn + shopBtn + '</div>' +
          '<div class="ds">' + dispDesc + (blocked ? '（需先建成' + (SB.habitat.buildingById(b.need) || {}).name + '）' : '') +
          '</div></div>' +
          '<button class="btn buy" data-build="' + b.id + '"' + (ok && !blocked && !canalCap ? '' : ' disabled') + '>' + label + '</button></div>';
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
})(typeof window !== 'undefined' ? window : globalThis);
