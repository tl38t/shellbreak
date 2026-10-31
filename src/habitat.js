/* 天壳 / SHELLBREAK — 玩家动作：建造与研究 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  function buildingById(id) {
    for (var i = 0; i < SB.BUILDINGS.length; i++) if (SB.BUILDINGS[i].id === id) return SB.BUILDINGS[i];
    return null;
  }

  /* 聚落名字：随纪元演进（家在长大：兽居 → 厝 → 镇 → 城 → 国）。
   * 纯显示层，s.era 在存档里现成（见 state.js），零迁移。
   * 命名与纪元 motto 咬合：
   *   一·暗流「摸到石头」→ 巢穴（开局兽居，教学文案不动）
   *   二·冷焰「第一次有光」→ 灯火山厝（有火有光，搬进厝）
   *   三·硫泉「材料革命」→ 锻火镇（精铁够用，出锻造业）
   *   四·洋流「借力」→ 潮机城（整座礁当一台机器）
   *   五·破壳「工业化」→ 渊海之国（2026-10-05 用户拍板：壳将破、往外走的国）
   *   ⚠️ ERA6+（2026-10-17）：聚落已迈入太空时代，硬编码演进名到头了。
   *   玩家可在巢穴页的命名框自建名（s.habitatName，本轮回有效，轮回重置）。
   *   未起名时沿用末档演进名「渊海之国」（用户拍板：无缝、一眼知道能改名）。
   *   纪元 < 6 仍是固定演进名（巢穴 → … → 渊海之国），保持原样。 */
  var HABITAT_NAMES = { 1: '巢穴', 2: '灯火山厝', 3: '锻火镇', 4: '潮机城', 5: '渊海之国' };
  var HABITAT_DEFAULT_ERA6 = '渊海之国';   // ERA6+ 未起名时的兜底名（与纪元五末档一致，过渡无缝）
  function habitatName(s) {
    var e = (s && s.era) || 1;
    if (e >= 6) {
      /* 政体后缀：只有三新政体（教权国/联盟/联邦）带后缀，其余政体（酋邦制/独裁/
       * 寡头/古典共和/神权）返回 ''。 */
      var suf = (SB.civic && SB.civic.govTitleSuffix) ? SB.civic.govTitleSuffix(s && s.gov) : '';
      /* 基础名：巢穴页「你的国度」输入框优先；没填时用政体弹窗起的名字（s.govName）。
       * 两者都算「玩家自己起的名字」，区别只是入口。
       * ⚠️ 后缀是**政体的一部分**，不因名字来自哪一处而被跳过——只要当前政体带后缀
       *    就一定拼上（用户 2026-10-18 明确：要「自己起的名字 + 政体带的名字」）。 */
      var base = (s && s.habitatName && ('' + s.habitatName).trim()) ||
                 (s && s.govName && ('' + s.govName).trim()) || '';
      if (base) {
        /* 玩家可能把后缀一起写进名字（如「深渊联邦」），再拼一次会变「深渊联邦联邦」。
         * 末尾已带该后缀 ⇒ 原样返回。 */
        if (suf && base.slice(-suf.length) !== suf) return base + suf;
        return base;
      }
      /* 一次都没起名 ⇒ 沿用纪元五末档「渊海之国」，不加政体后缀
       * （默认演进名不是玩家起的名字，拼上「联邦」反而像 bug）。 */
      return HABITAT_DEFAULT_ERA6;
    }
    return HABITAT_NAMES[e] || HABITAT_NAMES[1];
  }

  // 前置建筑：未满足则灰掉（提示而非静默失败）
  function needMet(s, b) { return !b.need || s.lvl[b.need] > 0; }

  /* 科技解锁的建筑：由 techs.js 各项 eff.unlockBuild 反查一张「建筑 id → 解锁它的科技 id」表。
   *
   * ⚠️ 上一版这段注释写的是「解锁来源只有一处」，**那是错的**，而且是最危险的一种错——
   * 注释说的是一套、代码做的是另一套。真相是 `unlocked()` 里**两道都查**：
   *   ① 建筑身上的 `requiredTech`（下面第 56 行那一段）
   *   ② 这里的反查 `techOpensBuild`（第 61 行）
   * 于是「两边都写」不是冗余而是**叠加**：两边写成不同科技时，玩家得研究两项才解锁，
   * 而 lockReason 只报其中一项 ⇒ 教科书式的「研究完还是灰的」。
   * 现状有 4 座建筑是双写且一致的（保温巢/压舱仓/礁石平台/热泉炉），
   * 有 3 座只写一边（聆听巢、祭坛写在建筑侧；热泉井写在科技侧）——都还能跑。
   * 【为什么不一刀切删掉建筑侧那份】聆听巢（历法）与祭坛（破冰工程学）目前全靠建筑侧那一份
   * 撑着，删了就得把解锁搬到科技表去，动 5 处定义。所以保留双写，
   * 一致性交给 `sim/e2e.mjs`「建筑解锁来源」那三条静态断言守住——改一处忘另一处会立刻红。 */
  var BUILD_TECH = {};
  function buildTechOf(bid) {
    if (!BUILD_TECH[bid] && SB.TECHS) {
      for (var i = 0; i < SB.TECHS.length; i++) {
        var e = SB.TECHS[i].eff;
        if (e && e.unlockBuild && e.unlockBuild.indexOf(bid) >= 0) BUILD_TECH[bid] = SB.TECHS[i].id;
      }
    }
    return BUILD_TECH[bid] || null;
  }
  function techOpensBuild(s, bid) {
    var tid = buildTechOf(bid);
    return !tid || !!s.techs[tid];
  }
  function techNameOf(tid) {
    if (!SB.TECHS) return null;
    for (var i = 0; i < SB.TECHS.length; i++) if (SB.TECHS[i].id === tid) return SB.TECHS[i].name;
    return null;
  }
  /* 市政名（2026-09-28 · requiredCivic 的解锁理由要用）。与 techNameOf 同型：
   * 找不到返回 null —— 调用方会退化成显示 id，至少不会把 undefined 印给玩家看。 */
  function civicNameOf(cid) {
    if (!SB.CIVICS) return null;
    for (var i = 0; i < SB.CIVICS.length; i++) if (SB.CIVICS[i].id === cid) return SB.CIVICS[i].name;
    return null;
  }

  /* 解锁判定：四种机制并存，照抄猫国建设者 js/buildings.js 的 Spec（315-319 行）与
   * game.js:6119 的判定 `item.val >= item.unlockScheme.threshold`。
   *   ① defaultUnlockable —— 挂了它就永远可建（本作只有 kelp，即猫国的猫薄荷田）
   *   ② requiredTech      —— 科技前置（科技树 eff.unlockBuild 经 techOpensBuild 反查，也走这条）
   *   ③ unlockScheme      —— 某资源持有量达到阈值
   * need（建筑前置）不在这里：它是加工链的物理依赖，跟解锁是两回事。
   * ⚠️ 2026-10-05 用户拍板：**移除 unlockRatio（库存达首级价 30% 才「露头」）**。
   *    解锁只认科技/资源门槛，不再为「还没攒够 30% 造价」藏整行——研究完科技就立刻能看到、只是买不起。 */
  /* 退役判定：被 `retiredBy` 指向的建筑已建成 ⇒ 本建筑退休。
   * ⚠️ 2026-10-06：城堡「真升级」实施过程中曾用这个机制让议事厅在城堡建成后整行隐藏，
   *   **现已撤回**（城堡不是第二座建筑，只是议事厅的新名字 ⇒ 没有退役这回事）。
   *   函数与导出**留着**：它是 BUILDINGS 表上合法的可选字段位，将来真有建筑被取代时直接可用；
   *   表里目前没有任何建筑写 `retiredBy`（e2e 有断言守着这一点）。 */
  function retired(s, b) {
    return !!(b && b.retiredBy && s && s.lvl && (s.lvl[b.retiredBy] || 0) > 0);
  }
  function unlocked(s, b) {
    if (b.noChallenge && s && s.challenge && b.noChallenge.indexOf(s.challenge.id) >= 0) return false;
    if (b.defaultUnlockable) return true;
    if (retired(s, b)) return false;
    /* 默认锁着。猫国的 `unlockable` 在 Spec 里是 MANDATORY（必填），
     * 漏写等于「忘了决定」。这里同样：没声明任何解锁条件的建筑一律不出现，
     * 否则一个只写了 need 的建筑（比如祭坛）会直接躺在开局列表里。 */
    if (!b.requiredTech && !b.unlockScheme && !b.requiredCivic) return false;
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) if (!s.techs[b.requiredTech[i]]) return false;
    }
    /* ⚠️【`requiredCivic` 是 2026-09-28 新加的解锁轴：由市政《戏剧与诗歌》解锁广场】
     *    其余建筑的解锁权都写在科技侧（requiredTech 或 eff.unlockBuild，两边双写）。
     *    广场的解锁权在市政身上，所以这里认 `requiredCivic` 这个字段名——
     *    ⚠️ 字段命中的是 `s.civics`（**已完成**），不是 `civShown`（已揭示）：
     *      揭示只打开「可以投点」那扇门，玩家还得自己花掉市政点才算数。
     *          ⇒ 这里判的是「市政点已经花出去了」，与《法典》那条 `if (c.gov && !s.gov)`
     *            同一个口径（完成才发东西，揭示只发机会）。 */
    if (b.requiredCivic && !(s.civics && s.civics[b.requiredCivic])) return false;
    /* 科技解锁：后墙。反查表不认识的新建筑默认锁着——与 requiredTech 同规则，
     * 漏声明等于「忘了决定」，玩家看到的是一座永远建不起来的建筑。 */
    if (!techOpensBuild(s, b.id)) return false;
    if (b.unlockScheme && !SB.economy.enough(s.res[b.unlockScheme.name], b.unlockScheme.threshold)) return false;
    return true;
  }

  /* 「露头」永久化（用户 2026-09-25：露头就该一直保持）。
   * 原实现是 `lv<=0 && !unlocked()` 就整行不渲染，于是玩家一花钱把库存压到阈值以下，
   * 刚冒出来的建筑会当场消失——上一次攒到 12 藻食露头的采石场，花了钱就又不见了。
   * 这里把「曾经露过一次头」记进 s.seen，UI 用 `lv>0 || seen` 判可见。
   * 猫国也是单向的：unlockable 一旦置位不会因花掉猫薄荷而回退。 */
  function reveal(s, b) {
    if (!s.seen) s.seen = {};
    s.seen[b.id] = 1;
  }

  // 给 UI 用的解锁理由：为什么要灰掉
  function lockReason(s, b) {
    if (b.noChallenge && s && s.challenge && b.noChallenge.indexOf(s.challenge.id) >= 0)
      return '流浪泰拉挑战期间不可建造';
    if (b.requiredTech) {
      for (var i = 0; i < b.requiredTech.length; i++) {
        if (!s.techs[b.requiredTech[i]]) {
          var t = b.requiredTech[i], nm = null;
          for (var j = 0; SB.TECHS && j < SB.TECHS.length; j++) if (SB.TECHS[j].id === t) nm = SB.TECHS[j].name;
          return '需先掌握科技：' + (nm || t);
        }
      }
    }
    /* 市政墙（2026-09-28 · `requiredCivic`）：排在科技墙之后、资源墙之前——
     * 「先花 200 市政点把《戏剧与诗歌》做完」是玩家当下就能执行的，
     * 而「再攒 150 珊瑚」只是时间问题，两种都列的顺序不该让时间问题抢在前。 */
    if (b.requiredCivic && !(s.civics && s.civics[b.requiredCivic])) {
      return '需先完成市政：' + civicNameOf(b.requiredCivic);
    }
    /* 王国潮道的跨建筑钳制：与 build() 同一条判定（两边不同源就会出现「按钮亮着点了没反应」）。 */
    if (b.id === 'canal' && (s.lvl.canal || 0) >= (s.lvl.lighthouse || 0)) {
      return '等级不能超过灯塔（当前灯塔 ' + (s.lvl.lighthouse || 0) + ' 级）';
    }
    if (b.unlockScheme && !SB.economy.enough(s.res[b.unlockScheme.name], b.unlockScheme.threshold)) {
      return SB.RESS[b.unlockScheme.name].name + ' ' + Math.floor(s.res[b.unlockScheme.name]) +
        ' / ' + b.unlockScheme.threshold;
    }
    /* 解锁理由按「从硬到软」报：科技与纪元是明确的墙，资源量只是时间问题。 */
    var tid = buildTechOf(b.id);
    if (tid && !s.techs[tid]) return '需先掌握科技：' + techNameOf(tid);
    if (b.requiredTech) {
      for (var i2 = 0; i2 < b.requiredTech.length; i2++) {
        if (!s.techs[b.requiredTech[i2]]) {
          var tn = techNameOf(b.requiredTech[i2]);
          return '需先掌握科技：' + (tn || b.requiredTech[i2]);
        }
      }
    }
    return null;
  }

  /* ERA10 市政（2026-10-20 · 虚境祭坛）：**人口造价**扣减（全仓第一处）。
   * 用户拍板原话：「就是扣当前人口，按当前职业分配比例扣，不扣上限」。
   *   ① 不扣人口上限（popCap 不变）——养祭坛花的是活人，不是居住空间；
   *   ② 各职业按「该职业占总人口的比例」等比缩水（闲置人口自然承担它那一份：
   *      总 pop 减 take，职业减 Σ(jobs×take/pop)，差额就落在闲置池上）；
   *   ③ 取整用**最大余数法**补齐，保证 Σ扣减 = round(总职业 × 比例)，不会因 floor
   *      让某些职业白嫖（那样重复建祭坛会系统性少扣人）。
   * ⚠️ 扣完 Σjobs ≤ pop 恒成立（比例不变），不会把状态推进 folk 的 over 分支。
   * ⚠️ 唯一实现：habitat.build 调它；economy.pay 刻意跳过 'pop' 键（见那里的注释）。 */
  function consumePop(s, n) {
    var pop = s.pop || 0;
    if (!(n > 0) || pop <= 0) return 0;
    var take = Math.min(n, pop);
    var ratio = take / pop;
    var ids = [], total = 0, k, i;
    for (k in s.jobs) if ((s.jobs[k] || 0) > 0) { ids.push(k); total += s.jobs[k]; }
    if (total <= 0) { s.pop = pop - take; return take; }   // 全员闲置：直接扣人
    var dec = {}, acc = 0, fracs = [];
    for (i = 0; i < ids.length; i++) {
      var jn = s.jobs[ids[i]] || 0;
      var ex = jn * ratio;
      var f = Math.min(jn, Math.floor(ex));
      dec[ids[i]] = f; acc += f;
      fracs.push({ id: ids[i], frac: ex - f });
    }
    var target = Math.min(total, Math.round(total * ratio));
    var rem = target - acc;
    fracs.sort(function (a, b) { return b.frac - a.frac; });
    for (i = 0; rem > 0 && i < fracs.length; i++) {
      var id = fracs[i].id;
      if (dec[id] < (s.jobs[id] || 0)) { dec[id]++; acc++; rem--; }
    }
    for (k in dec) if (dec[k] > 0) s.jobs[k] = Math.max(0, (s.jobs[k] || 0) - dec[k]);
    s.pop = pop - take;
    return take;
  }

  /* ══ 轻车熟路 → 本局首建免费（2026-10-28 用户拍板，采用「首建造价归零」而非「白送 1 级」）══
   * 【规则】某建筑的「<建筑名>：轻车熟路」成就已达成（累计建造 100 级）⇒ 之后每个周目里
   *   该建筑**第一次建造**的造价归零（资源项），玩家仍需自己点一下。
   * 【为什么不做「白送 1 级」】用户问的风险我全列过，最凶的两条都是「等级先出现」造成的：
   *   ① `s.lvl.x > 0` 是全仓「已建成」契约 —— 白送会让 game.js:23 的 `s.lvl.satellite >= 1`
   *      直接永久解锁星屑商店（免 tiplate 100 + rocketFuel 100，还跨周目），
   *      让 maybeWorkshopPopup（`s.lvl.workshop > 0`）每轮回弹一次工坊解锁叙事，
   *      还会破坏 canal ≤ lighthouse 的跨建筑钳制（白送 canal 1 级而灯塔 0 级）；
   *   ② 一票「吃料机器」（汽轮机/热泉炉/核热厂/发射场）默认「等级−停用数」即运转，
   *      白送 1 级 = 无人操作时直接开始吃料。
   *   「首建免费」走的是**完全相同的 build() 通道**：等级只在玩家真点之后才出现，
   *   于是 maxLvl / need / canal 钳制 / 人口造价 / 记账 / reveal / 星图同步全部照旧生效，
   *   上面那一整串连锁自动消失 —— 这就是选它当「风险最小」的全部理由。
   * 【为什么判据只看 `lvl === 0`】freshRun 的 lvl 是空表 ⇒ 新周目天然重置，不需要额外
   *   「本局是否已用过」旗标；建完一级后 lvl ≥ 1 ⇒ 后续各级自动回到原价（天然幂等）。
   * 【成就账本读哪个】必须读 `meta.achv`（本地账本，无 SDK 也会记），不能读
   *   `meta.achievements`（平台账本，没网/没回填 ID 时是空的）—— 读错的后果是「成就墙亮了
   *   但福利不发」，玩家完全无法理解。 */
  function freeFirstBuild(s, id) {
    if (!s || !id || !s.lvl) return false;
    /* 只对「本局还没建过」生效。这一步同时是幂等闸：建过就不再免。 */
    if ((s.lvl[id] || 0) > 0) return false;
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : null;
    if (!m || !m.achv) return false;
    return !!m.achv['bld_' + id];
  }

  function build(s, id, emit) {
    var b = buildingById(id);
    if (!b || !unlocked(s, b)) return false;
    if (!needMet(s, b)) return false;
    /* ERA10 市政（2026-10-20 · 虚境祭坛 `maxLvl:3`）：全仓第一条等级上限。
     * ⚠️ 拦在这里而不是 UI：autoTick 走的也是 build()，UI 灰按钮只挡手动点击，
     *    自动建造能一路买到 99 级（挂一晚就废档）。
     * ⚠️ 上限读建筑条目（不烤进存档）⇒ 将来调高上限对老档立即生效。 */
    if (b.maxLvl && (s.lvl[id] || 0) >= b.maxLvl) return false;
    var c = SB.economy.costOf(s, id);
    /* 轻车熟路首建免费（见 freeFirstBuild）：必须在 `s.lvl[id]++` **之前**取快照——
     * 加级之后 lvl>0，判据自己就变成 false 了，事后无法反推。文案靠它区分。 */
    var free = freeFirstBuild(s, id);
    if (!SB.economy.canAfford(s, c)) return false;
    /* 王国潮道（2026-09-30 · 市政《行政部门》解锁2）：等级 ≤ 灯塔等级（规格原文）。
     * 这是全仓第一条**跨建筑**等级钳制——灯塔 0 级时潮道一座都建不起来。
     * ⚠️ 判定读 s.lvl 而不是建筑定义，灯塔没有等级上限，两边永远同源。 */
    if (id === 'canal' && (s.lvl.canal || 0) + 1 > (s.lvl.lighthouse || 0)) return false;
    SB.economy.pay(s, c);
    /* ERA10 市政（2026-10-20 · 虚境祭坛）：人口造价在 pay 之后单独结算。
     * ⚠️ economy.pay 显式跳过 'pop' 键（人口不在 s.res 里，扣它会在存档里造垃圾键）；
     *    真正扣人只此一处，走 consumePop（按职业占比缩水，不碰人口上限）。 */
    if (typeof c.pop === 'number' && c.pop > 0) consumePop(s, c.pop);
    s.lvl[id]++;
    /* 2026-10-24 轻车熟路记账（docs/ACHV_DESIGN_v0.3.md §四·1）：本函数是全库唯一
     * 真实购买漏斗——手动建造（input.js）、区域自动建造泵（autoTick）、AI bot
     * （ai-strategy）全部走这里，故增量只此一处写。搭现有 5 秒 saveRun 节流落盘，
     * 不新增每购买一次的 meta 写盘。累计（跨周目账本 + 本周目增量）达 100 当周目
     * 即解锁，不等周目结算。 */
    s.buildingLvlRun = s.buildingLvlRun || {};
    s.buildingLvlRun[id] = (s.buildingLvlRun[id] || 0) + 1;
    if (SB.achv && SB.achv.unlockOnce) {
      var _m = (SB.game && SB.game.meta && SB.game.meta()) || null;
      if (_m) {
        var _tot = ((_m.buildingLvlTotal && _m.buildingLvlTotal[id]) || 0) + s.buildingLvlRun[id];
        if (_tot >= 100) SB.achv.unlockOnce('bld_' + id, _m);
      }
    }
    /* 首座轨道卫星是星屑商店的永久解锁条件；周目重开后不再因本局卫星等级归零而重新上锁。 */
    if (id === 'satellite' && SB.game && SB.game.unlockStardustShop) SB.game.unlockStardustShop();
    /* ⚠️ 这里**没有**「建城堡时把议事厅等级并过去」的转移逻辑——那是被撤回的误读。
   *   城堡 = 议事厅买下工坊升级 `upg_castle` 之后的新名字（render 改显示名），
   *   两者是同一座建筑、同一个 lvl.hall，不存在两座之间的等级搬运。 */
    reveal(s, b);
    /* 星图「造即发射」：轨道卫星/空间站建成本就多一颗在轨航天器（运行座数 = 等级 − 停用数），
     * 同步到 S.spacecraft 供星图展示（syncSpacecraft 幂等，重复调用无副作用）。 */
    if ((id === 'satellite' || id === 'spacestation') && SB.game && SB.game.syncSpacecraft) SB.game.syncSpacecraft(s);
    // 建造不再直接削壳：壳厚只由「系数驱动的持续削壳」表达，
    // 建造的贡献体现在 lvlSum 推高破壳系数上。这样玩家看得到因果，而不是看到一次跳变。
    if (emit) emit((free ? '「轻车熟路」免费建成 ' : '建成 ') + b.name + ' ×' + s.lvl[id] +
      '，破壳系数 ' + SB.shell.breakCoef(s).toFixed(2));
    return true;
  }

  /* 研究。判定与扣费都交给 tech.js（已揭示 / 前置 / 纪元闸门 / 扣科技），
   * 这里只做一层转发——两边各判一遍就会出现「面板说能研究、点了没反应」。 */
  function study(s, id, emit) {
    if (!SB.tech) {                       // tech.js 未加载时的兜底，避免整局假死
      var t = null;
      for (var i = 0; SB.TECHS && i < SB.TECHS.length; i++) if (SB.TECHS[i].id === id) t = SB.TECHS[i];
      if (!t || s.techs[id]) return false;
      /* 兜底折扣（2026-10-17）：tech.js 不可用时镜像 tech.researchCost 的同一条公式
       * （每级 −2%、封顶 0.90）——否则兜底扣原价、正常路径扣折后价，两套账。
       * 判定与扣费都用折后价，与 tech.canStudy/study 同口径。
       * ⚠️ 若将来改折扣公式，两处必须同步（tech.js 是权威，这里只是镜像）。 */
      var disc = ((s.lvl && s.lvl.researchlab) || 0) * ((SB.BLD && SB.BLD.researchLabSave) || 0);
      if (!(typeof disc === 'number' && isFinite(disc))) disc = 0;
      var cap = (SB.BLD && SB.BLD.researchLabSaveMax) || 0;
      if (disc > cap) disc = cap;
      var netCost = t.cost * (1 - disc);
      if (!SB.economy.enough(s.res.science, netCost)) return false;
      s.res.science -= netCost; s.techs[id] = true; s.techVer = (s.techVer | 0) + 1;   // ⚠️ tech.mul 缓存契约
      /* 2026-10-24「科技大成」：tech.js 未加载的降级路径同样转发（判定在 achv.checkTechAll）。 */
      if (SB.achv && SB.achv.checkTechAll && SB.game && SB.game.meta)
        SB.achv.checkTechAll(s, SB.game.meta());
      if (emit) emit('研究完成：' + t.name);
      return true;
    }
    return SB.tech.study(s, id, emit);
  }

  /* 区域建筑自动建造/升级（2026-09-30 用户规格 · 由市政逐区解锁）：
   *   每个市政通过 autoBuildZones 声明权限；开关逐建筑放 s.autoUpg[id]
   *   （state 初始化空表），执行语义 = **「买得起就买一级」**——与手动点建造走同一条
   *   build() 通道（解锁/前置/钳制/扣费全复用，自动与手动不可能出现两套规则）。
   * ⚠️ 调用点只在**在线**泵（game.js 的 2 秒周期）：离线补算只结算产出、不替玩家花
   *   资源——这是「离线闸门」同一精神；玩家回来看到的存档不该被后台偷偷改。
   * ⚠️ 2 秒一拍而不是每 tick：每 tick 买会把玩家攒着的缓冲资源瞬间烧穿，2 秒的颗粒度
   *   让玩家还能抢在自动升级前面把资源留给大件。 */
  /* 科技侧自动建造通道（2026-10-17 · ERA7 spec §4 火箭研究解锁1）：
   *   原先 autoZoneUnlocked 只认市政 autoBuildZones ⇒ techs.js:647 声称 modpart 解锁
   *   「工坊区自动建造」是死注释（全库无科技侧接线，开关从未出现）。
   *   现在开 TECH_AUTO_ZONES 一张表：rocket → 科研区（academy），modpart → 工坊区（workshop）。
   *   开关 UI / 在线泵 / 「买得起就买一级」语义全部复用现有系统，零新增。 */
  var TECH_AUTO_ZONES = { rocket: ['academy'], modpart: ['workshop'],
    /* ERA8（2026-10-18 · spec §2 大数据解锁）：礁栖核心（core 区）自动建造——
     *   礁口巢/珊瑚屋/议事厅那批住房与统治核心随大数据自动买级。 */
    bigdata: ['core'] };
  function autoZoneUnlocked(s, zone) {
    if (!s) return false;
    /* 星屑商店的一次性先行建造协议：所有分区开关可见，默认仍关闭；
     * 实际建造继续走 build() 的科技、前置与资源校验。 */
    /* 2026-10-20：原早期全开项拆成每区独立项（earlyAutoBuild<Zone>）。星海区（space）仅商店可开，
     * techs/civics 不挂星海区自动建造；perk 键用首字母大写后缀（earlyAutoBuildCore 等）。 */
    if (s.perk) {
      var _eab = zone.charAt(0).toUpperCase() + zone.slice(1);
      if (s.perk['earlyAutoBuild' + _eab] > 0) return true;
    }
    var C = SB.CIVICS || [];
    for (var i = 0; i < C.length; i++) {
      if (!(s.civics && s.civics[C[i].id]) || !Array.isArray(C[i].autoBuildZones)) continue;
      if (C[i].autoBuildZones.indexOf(zone) >= 0) return true;
    }
    /* 科技侧：s.techs 命中 TECH_AUTO_ZONES 即视为该区已授权（modpart 死注释就此修复）。 */
    if (s.techs) for (var tid in TECH_AUTO_ZONES) {
      if (s.techs[tid] && TECH_AUTO_ZONES[tid].indexOf(zone) >= 0) return true;
    }
    return false;
  }
  function autoTick(s, emit) {
    if (!s || !s.autoUpg) return;
    for (var i = 0; i < SB.BUILDINGS.length; i++) {
      var b = SB.BUILDINGS[i];
      if (!autoZoneUnlocked(s, b.zone) || !s.autoUpg[b.id]) continue;
      build(s, b.id, emit);
    }
  }

  SB.habitat = {
    buildingById: buildingById, build: build, study: study,
    needMet: needMet, unlocked: unlocked, lockReason: lockReason, reveal: reveal,
    /* retired（2026-10-06）：render 的可见性判定要用它滤掉已退役建筑的常驻行，
     *   与 unlocked() 里的那一判同源（同一个函数）。 */
    retired: retired,
    /* freeFirstBuild（2026-10-28）：轻车熟路首建免费的**唯一判据**。economy.costOf 用它把
     *   资源项乘 0，render 用它把按钮文案换成「免费」—— 两处都读这一个函数，不各写一份。 */
    freeFirstBuild: freeFirstBuild,
    autoZoneUnlocked: autoZoneUnlocked, autoTick: autoTick, habitatName: habitatName
  };
})(typeof window !== 'undefined' ? window : globalThis);
