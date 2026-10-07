/* 天壳 / SHELLBREAK —— 工坊（青铜工具）
 * 2026-09-27 用户拍板：工坊内容从青铜工具三件起头
 *   （「首先肯定是青铜镰、青铜斧和青铜镐，各 +80% 农民、珊瑚匠和采石工/矿工的工作效率」）
 *   映射经用户当次确认：**镰 = 采集者（藻食）｜斧 = 珊瑚匠｜镐 = 采石工 + 矿工**。
 *
 * 三条纪律（改这个文件前先读）：
 *  ① **买断，不是等级**。工具买过一次就永久生效，没有 lvN、没有重复购买。
 *  ② **工具绑在职业上**。镰 → 采集者、斧 → 珊瑚匠、镐 → 采石工 + 矿工。
 *     具体展开到哪几条产出行，由 economy.js 的 `JOB_SINK` 那张表回答（矿工产金属+暖石两行，
 *     一套工具两行都吃）。
 *     ⚠️ 用户 2026-09-27 纠正过两版：先是斧和镐同挂 gatherMul（⇒「买斧头石头也涨」），
 *        再是绑到资源行上。绑职业最贴合「这个人手里那把家伙」这个直觉，
 *        而且同一职业的两件工具才会互乘 —— 买齐三件仍是三条线各 ×1.8，不是 ×5.83。
 *  ③ **只提升指定职业**，不是「买了就全局采集 +X%」。三件都买也只是各自那条线变强。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;
  /* ⚠️【断链事故 · 2026-09-27】下面 craftRatio 里曾写 `SB.BLD.workshopCraft`，两处都踩空：
   *    ① `BLD` 在本文件**从未声明** ⇒ 严格模式下 craftRatio() 一调用就抛 ReferenceError；
   *    ② `BLD`（config.js:347）是**缩放系数表**（`food: 0.09` 那一类），没有 workshopCraft 键。
   *    ⇒ 工坊每级系数只能从**建筑条目**上取：BUILDINGS 里 `id:'workshop'` 那条挂 `craftRatio`。
   *  ⚠️ 这类「系数加了却没接线」既不报错也不报警，只会静默返回 0 ⇒ 由 e2e 断言兜（见 e2e 石梁四条）。 */
  var BUILDINGS = SB.BUILDINGS || [];

  function tools() { return SB.TOOLS || []; }
  function byId(id) {
    var L = tools();
    for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }

  /* ══ 工艺制作 ════════════════════════════════════════════════════════
   * 工坊的**下半区**，与上半区的青铜工具（买断）是两种形态：配方可以反复制造。
   * 形参照猫国 `js/workshop.js` 的 crafts + `js/jsx/left.jsx.js` 的四颗按钮。 */

  function craftRows() { return SB.CRAFTS || []; }
  function list() { return SB.WONDERS || []; }

  /* ── 工艺制作效率（工坊顶部那一个数）──────────────────────────────
   * 猫国原作里它叫 `craftRatio`：`js/buildings.js:1522-1524`
   *   effects: { "craftRatio": 0.06 }   ← 每级工坊 +6% 工艺制作产出
   * 玩家在猫国工坊顶部看到的那行「工艺制作效率: +6%」就是它。
   * ⚠️ 本作系数取 0.05/级（待标定），与用户口径的「+5%」对齐。
   * ⚠️ 叠加是**加法**（用户 2026-09-27 拍「加法」），与猫国同一条式：`1 + craftRatio`。
   *    两个 +5% 来源是 105%，不是 110.25%。 */
  /* 工坊每级提供多少工艺制作效率 —— 从**建筑条目**上读 craftRatio（见文件头断链教训）。 */
  function craftPerLevel() {
    var i;
    for (i = 0; i < SB.BUILDINGS.length; i++) {
      if (BUILDINGS[i] && BUILDINGS[i].id === 'workshop') return BUILDINGS[i].craftRatio || 0;
    }
    return 0;
  }

  function craftRatio(s) {
    var m = 0, i;
    /* ① 工坊建筑等级（每级 +5%） */
    if (s.lvl && s.lvl.workshop > 0) m += (s.lvl.workshop || 0) * craftPerLevel();
    /* ② 奇观（海潮方碑 +5%）—— 走 SB.wonder 而不是散读 s.wonders，
     *    保持「效果只从一处进」的口径，将来再加奇观不用改这里。 */
    if (SB.wonder) m += SB.wonder.wonderCraftRatio(s);
    /* ③ 科技给的工艺制作效率（2026-09-28「构架术」+5%）。
     * ⚠️ 这条曾经**整段不存在** —— mul() 老老实实把 0.05 算进了 T.craftRatio，
     *    面板也照着显示「工艺制作效率 +5%」，但工坊效率纹丝不动，研究完什么都没发生。
     *    与文件头那次 `SB.BLD.workshopCraft` 是同一类病：数据在科技表里、读的人在别处，
     *    两边都没错，中间那段线没人接。⇒ 每加一个 effect 键，都要问一次「谁在读它」。
     * ⚠️ 与上面两源一样是**加法档**（与 ADD 名单同口径），三个来源各 +5% 是 15%，
     *    不是 1.05³。⚠️ 别把它读成 `T.craft`（加工产出那条精铁线，烟囱炉 +15%/
     *    壳铸 +30%），那两处读的是 T.craft，与这条轴互不干涉 —— 键名都带 craft。 */
    var T = SB.tech ? SB.tech.mul(s) : null;
    if (T) m += T.craftRatio || 0;
    /* ④ 政体（2026-09-29）：独裁统治 +10% 工坊效率。走与建筑级/科技/奇观**同一条加法乘区**，
     *    所以三个 +5% + 独裁 +10% = 25%，不是 1.05³×1.10。读当前采用的政体，没采用 = 0。
     *    ⚠️ 接法同构于上面三源：数据在政体表、读在这里，每加一个效果键都要问「谁在读它」。
     *    ⚠️ `SB.civic` 可能晚加载，用存在判保护（craftRatio 在结算时才调用，模块顶层不碰它）。 */
    if (SB.civic) m += SB.civic.govCraftRatio(s) || 0;
    /* ⑤ 工坊升级（2026-09-29）：自动工坊 upg_autoshop 给 craftRatio:0.10。
     *    与上面四源同一条加法乘区 ⇒ 三个 +5% + 独裁 +10% + 自动工坊 +10% = 35%。
     *    读 SB.economy.upgSum（聚合函数统一藏在 economy，避免各模块重算漏键）。
     *    ⚠️ `SB.economy` 可能晚加载，用存在判保护（craftRatio 结算时才调用，模块顶层不碰它）。 */
    if (SB.economy && SB.economy.upgSum) m += SB.economy.upgSum(s, 'craftRatio') || 0;
    /* ⑥ 政策卡（2026-09-30）：技艺卡 +20% 工坊效率。与上面五源同一条加法乘区，
     *    装在卡槽里才生效（cardCraftRatio 读 s.cards，没装 = 0）。
     *    ⚠️ `SB.civic` 可能晚加载，用存在判保护（craftRatio 结算时才调用，模块顶层不碰它）。 */
    if (SB.civic) m += SB.civic.cardCraftRatio(s) || 0;
    /* ⑦ 热锻工厂（ERA5 · 2026-10-02）：每级 +7% 工艺制作效率（SB.BLD.hotforgeCraft）。
     *   与上面六源同一条加法乘区（工坊级 + 奇观 + 科技 + 政体 + 升级 + 政策卡），
     *   同档相加，不是乘区相乘。 */
    if (s.lvl && s.lvl.hotforge > 0) m += (s.lvl.hotforge || 0) * (SB.BLD.hotforgeCraft || 0);
    /* ⑧ 工坊定额（2026-10-05 · perk.craftQuota）：工坊制作产出 +10%/级，不设上限（2026-10-05 晚拍板）。
     *   与上面七源同一条**加法乘区**（用户 2026-09-27 拍「加法」的口径），
     *   所以工坊满级 + 科技 + 政体 + 卡 + 热锻 + 配额是**相加**，不是相乘。
     *   ⚠️ 别误读成 `T.craft`（那是加工产出/精铁那条线，与本条互不干涉）。
     *   ⚠️ 这条只管**工艺制作产出**（craftMul → 产出那截），投入/成本端从不打折
     *   （见 craft 里的 prices 循环与 craftMul 上方注）。 */
    m += 0.10 * (s.perk && s.perk.craftQuota ? s.perk.craftQuota : 0);
    return m;
  }
  /* 产出倍率。猫国：`craftAmt = amt * (1 + craftRatio)`（workshop.js:2660）。
   * ⚠️ 投入不变、产出乘 (1+ratio) —— 是「100 石头出 1.05 石梁」，
   *    **不是**「95 石头出 1 石梁」。成本端从不打折（见 craft 里的 prices 循环）。 */
  function craftMul(s) { return 1 + craftRatio(s); }

  function craftById(id) {
    var L = craftRows(), i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }

  /* 库存最多能造几个：**每种原料分别算「总量÷单价」，取最小的那个**。
   * 照猫国 `workshop.js:2787 getCraftAllCount` —— 哪个原料最先见底就卡玩家。 */
  function maxCraftable(s, c) {
    var n = Infinity, k;
    for (k in c.in) {
      var have = (s.res && s.res[k]) || 0;
      var per = c.in[k];
      n = Math.min(n, per > 0 ? have / per : Infinity);
    }
    return isFinite(n) ? n : 0;
  }

  /* 四颗按钮的档位。形参照猫国 `left.jsx.js:502-505`：
   *   craftFixed 是**固定下限**，craftPercent 是「库存能造数量的百分比」，
   *   **取大**。⚠️ 百分比不是主效果（用户实证：+100 就是 100），它只是把固定数往上顶。 */
  var CRAFT_STEPS = [
    { id: 'x1',   label: '+1',   fixed: 1,   pct: 0.01 },
    { id: 'x25',  label: '+25',  fixed: 25,  pct: 0.05 },
    { id: 'x100', label: '+100', fixed: 100, pct: 0.10 },
    { id: 'max',  label: '100%', fixed: 0,   pct: 1 }
  ];
  /* 这一档实际制造多少个。fixed 为 0 表示 MAX（有多少造多少）。 */
  function stepAmt(s, c, st) {
    var all = maxCraftable(s, c);
    if (st.fixed <= 0) return all;
    var byPct = Math.floor(all * st.pct);
    return Math.max(st.fixed, byPct);
  }

  /* 制造。amt 是**基准份数**，实际产出 = amt × (1+效率)。返回实际造出多少。
   * ⚠️ 2026-09-28：产物资源由 `c.res` 给出（石梁条目上补的，两道新配方各写了自己的），
   *    不再硬编码 `'stoneBeam'` —— 硬编码那版每加一道新配方就要改这里一次，
   *    漏改的后果是「 rhs 造出 0 个铁制支架，却扣了材料」，不报错。 */
  function craft(s, id, amt, emit) {
    var c = craftById(id);
    if (!c) return 0;
    if (!c.res) return 0;
    /* ⚠️ 造之前必须过一遍 craftBlocked：它现在会读 `need` 门（下面那条的注）。
     *    不在这道门，玩家能研究「工程学」之前就把配方点起来造，解锁权就成了摆设。 */
    if (craftBlocked(s, id) !== null) return 0;
    amt = Math.floor(amt);
    if (!(amt > 0)) return 0;
    /* 先算能付多少份：按**成本端**算，够几份造几份（猫国 craftAll 的 forceAll 口径）。 */
    var afford = maxCraftable(s, c), k;
    for (k in c.in) if (c.in[k] * amt > ((s.res && s.res[k]) || 0)) {
      /* 原料不够就按买得起的份数往下压，别整单失败——
       * 否则玩家点 MAX 只塞进 0 个材料时会看到「什么都没发生」。 */
      var can = Math.floor(((s.res && s.res[k]) || 0) / c.in[k]);
      if (can < amt) amt = can;
    }
    if (amt <= 0) return 0;
    for (k in c.in) s.res[k] -= c.in[k] * amt;
    var gain = amt * c.out * craftMul(s);
    /* 产出**不设上限**：无 CAP_BASE 的资源（石梁与两道新制品）仓储恒 Infinity，
     * 与猫国 beam 一致。⚠️ 走 addRes 仍然是对的 —— 它内部有 Math.min 与 NaN 兜底，
     * 这一趟不会截掉任何东西，将来给某道配方补上 CAP_BASE 时也不用回来改这里。 */
    /* ⚠️ 累计产出台账**只由 addRes 记**：它在里面已经写了一次 `s.got[c.res] += v`。
     *    2026-09-28 这里还多写了一条，于是工艺制品的累计产出被**记了两遍**
     *    （实测造一次得 5.25，台账上是 10.5）。s.got 正是 `{t:'gathered'}` 尤里卡
     *    条件的读端 ⇒ 造 100 条石梁会点亮「累计产出 200」的条件，不报错，就是错。
     *     ⇒ 一个量只该有一个写点，别在调用方再补一笔。 */
    SB.economy.addRes(s, c.res, gain);
    if (emit) emit('造出 ' + SB.economy.fmtAmt(gain) + ' ' + c.name + '（用了 ' + amt + ' 份材料）。');
    return gain;
  }

  /* ══ 自动制作槽（2026-10-07 用户拍板）══════════════════════════════════
   * 两个来源：**工坊升级项「自动工坊」自带 1 个**（装了就有，见 SB.UPGRADES.upg_autoshop），
   * 轮回商店 `autoCraft1/2/3` 每级 +1（写进 s.perk.autoCraft）。上限 SB.CFG.AUTO.SLOT_MAX。
   *
   * 【槽 = 配方 + 一档百分比，语义是「满了才造」】
   *   触发：该配方**任一原料达到仓储上限**（capOf）—— 满了再产也是溢出浪费，转制才留住它。
   *   造多少：当时可造份数 × 该档百分比（25 / 50 / 75 / 100%）。
   * ⚠️ 为什么不是「够一份就造」：那是把玩家的建材直接吃掉（石头刚够 100 就被转成石梁，
   *    想建的房子永远差那点料）。「满了才造」只在**本来就要浪费**的那一刻动手，
   *    玩家不需要再设一道预留线——这就是用户选阈值而不是固定份数的原因。
   * ⚠️ 无上限原料（capOf = Infinity：钢、各工艺制品）**不参与「满」判定**：
   *    它永远不会溢出，拿它当触发条件 ⇒ 那种配方的槽永远不动。
   *    全部原料都无上限时退化成「够一份就造」（见 autoReady 的返回值注）。
   * ⚠️ 调用点只在**在线**泵（game.js 的 TECH_PUMP 周期，与 habitat.autoTick 并列）：
   *    离线补算只结算产出、不替玩家花资源（离线闸门同一精神）。
   * ⚠️ 一档百分比 = 造**当时可造量**的这一比例，不是「造到 25% 仓位」——
   *    后者在原料满仓时等于造 0 份（已经在 100% 了），槽会永远不动。 */

  /* 槽位上限与档位表从 SB.CFG.AUTO 读（写在数据侧，实现里不硬编码，见 config 那条注）。 */
  function slotMax() { return (SB.CFG.AUTO && SB.CFG.AUTO.SLOT_MAX) || 4; }
  function pcts() { return (SB.CFG.AUTO && SB.CFG.AUTO.PCTS) || [0.25, 0.5, 0.75, 1]; }

  /* 当前可用槽数 = 自动工坊升级自带 + 轮回商店买的，夹在 [0, 上限]。
   * ⚠️ 判据读 `s.upgrades.upg_autoshop`（装了才给槽）—— 它就是那个「自带槽」的来源，
   *    不另设一个开关：升级项本身已经是买断的，装没装是唯一事实。 */
  function slotCap(s) {
    if (!s) return 0;
    var n = 0;
    if (s.upgrades && s.upgrades.upg_autoshop) n += (SB.CFG.AUTO && SB.CFG.AUTO.SLOT_BASE) || 1;
    n += (s.perk && s.perk.autoCraft) || 0;
    return Math.max(0, Math.min(n, slotMax()));
  }

  /* 某配方当前占着哪个槽（返回下标，-1 = 没占）。
   * ⚠️ 一个配方**只占一个槽**：同一配方挂两槽等于把阈值判定跑两遍，
   *    第二遍读到的已经是第一遍造完后的库存（会出现「只造了一半」的假象）。 */
  function slotIndexOf(s, id) {
    var L = (s && s.autoSlots) || [];
    for (var i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return i;
    return -1;
  }
  function slotPct(s, id) {
    var i = slotIndexOf(s, id);
    return i < 0 ? 0 : (s.autoSlots[i].pct || 0);
  }

  /* 分配 / 改档。返回真 = 真的坐进了槽；返回假 = 槽位不够（UI 该显示「槽位已满」）。
   * ⚠️ 幂等：同一配方再点一次只改档位，不会占第二个槽（见 slotIndexOf 那条注）。
   * ⚠️ pct 只认 SB.CFG.AUTO.PCTS 里的档位，其它值一律拒绝 ——
   *    存档里被人手改出一个 0.9 的档位时，宁可不动也别按着怪值造。 */
  function setSlot(s, id, pct) {
    if (!s || !craftById(id)) return false;
    var ok = false, P = pcts(), i;
    for (i = 0; i < P.length; i++) if (P[i] === pct) ok = true;
    if (!ok) return false;
    var idx = slotIndexOf(s, id);
    if (idx >= 0) { s.autoSlots[idx].pct = pct; return true; }
    s.autoSlots = s.autoSlots || [];
    if (s.autoSlots.length >= slotCap(s)) return false;
    s.autoSlots.push({ id: id, pct: pct });
    return true;
  }
  /* 释放槽。**真的从数组里删掉**而不是置 null：槽位是玩家看得到的资源，
   * 留一个 null 洞会让「第 2 槽」在 UI 上变成三个槽里的空位。 */
  function clearSlot(s, id) {
    var idx = slotIndexOf(s, id);
    if (idx < 0) return false;
    s.autoSlots.splice(idx, 1);
    return true;
  }

  /* 「满了吗」——自动制造的触发判据。
   *   返回 true  ⇒ 该动手了；
   *   返回 false ⇒ 还没满，别动（玩家的料还在涨，现在转制是抢他的建材）。
   * ⚠️ 全部原料都无上限时返回 true（退化成「够一份就造」）：那种配方没有「溢出」这回事，
   *    只有「够不够」，否则槽会永远不动（见上面那段设计注）。 */
  function autoReady(s, c) {
    var anyFinite = false, k;
    for (k in c.in) {
      var cap = SB.economy ? SB.economy.capOf(s, k) : Infinity;
      if (!isFinite(cap)) continue;          // 无上限原料不参与「满」判定
      anyFinite = true;
      if (((s.res && s.res[k]) || 0) >= cap) return true;
    }
    return !anyFinite;
  }

  /* 在线泵每 TECH_PUMP 秒跑一次：逐槽判定、满了就按档位造。
   * ⚠️ 走的是**同一个 craft()**（含 craftBlocked 门、成本端夹取、craftMul、addRes 台账），
   *    不是另写一条结算 —— 自动与手动不可能出现两套规则（与 habitat.autoTick 走 build() 同口径）。
   * ⚠️ emit 传 null：2 秒一条「造出 N 石梁」会把日志冲掉，玩家看面板上石梁在涨就够了。
   * ⚠️ 槽数可能被中途改小（比如读档后 perk 没生效）⇒ 每次都按 slotCap 截断遍历范围。 */
  function autoTick(s, emit) {
    if (!s || !s.autoSlots || !s.autoSlots.length) return 0;
    if (!(s.lvl && s.lvl.workshop > 0)) return 0;      // 工坊没建，槽整个不成立
    var n = Math.min(s.autoSlots.length, slotCap(s)), made = 0, i;
    for (i = 0; i < n; i++) {
      var sl = s.autoSlots[i];
      if (!sl || !sl.id) continue;
      var c = craftById(sl.id);
      if (!c) continue;
      if (!autoReady(s, c)) continue;
      var all = maxCraftable(s, c);
      if (!(all > 0)) continue;
      /* ⚠️ `Math.max(1, …)`：满仓时可造量通常远大于 1，但边缘情况（刚够 1 份就满仓）
       *    25% 档会算出 floor(0.25)=0 ⇒ 这个槽**永远不动**，而 UI 上它明明是开着的。
       *    至少造 1 份只在这种边缘生效，不会把 25% 变成「每次都造满」。 */
      var amt = Math.max(1, Math.floor(all * (sl.pct || 0)));
      var got = craft(s, sl.id, amt, null);
      if (got > 0) made += got;
    }
    if (made > 0 && SB.game) SB.game.markDirty();
    return made;
  }

  /* 为什么造不了 —— 与 blocked 同口径，要说得出该做什么。 */
  function craftBlocked(s, id) {
    var c = craftById(id);
    if (!c) return '没有这道配方';
    if (!(s.lvl && s.lvl.workshop > 0)) return '需要先建成工坊';
    /* ── `c.need` 这道门（2026-09-28 补）──
     * ⚠️ 读之前它是个**死字段**：craftBlocked 从头到尾不读 need，所以 CRAFTS 表上
     *    写着 need 也不会有任何作用 —— 与 TOOLS[].need 那次是同一种病（见 blocked 那条注）。
     *    本条把它接通，两道新配方（铁制支架 / 绳）的「研究工程学或构架术之前造不出来」
     *    就靠这道门落地。
     * ⚠️ 顺序刻意排在「建成工坊」之后：工坊没建连页面都进不去，先报工坊，
     *    玩家才不会在工坊页里撞见一条看不懂的科技提示。
     * ⚠️ 报科技**名**而不是 id，与 tool 那条同口径（玩家认识「工程学」，不认识 `engineeringT`）。
     * ⚠️ 顺带一提：石梁原来的 `need:'workshop'` 已删（见 config 那条注）—— 它指向的
     *    科技在 techs.js 里不存在，这道门一起就会把石梁永久锁死。 */
    if (c.need && !(s.techs && s.techs[c.need])) {
      var ct = SB.tech && SB.tech.byId ? SB.tech.byId(c.need) : null;
      return '需要先研究「' + (ct ? ct.name : c.need) + '」';
    }
    /* ── `c.needCivic` 这道门（2026-10-01 ERA4 补）──
     * 与 WONDERS[].needCivic 同构（workshop.wonderBlocked 已读它）：判 **已完成**的市政。
     * 历史哲学解锁的两张工艺配方走这道门，避免写成 tech id 被 craftBlocked 的 need 门永久锁死。
     * 报市政**名**而不是 id，与上面 need 那道同口径。 */
    if (c.needCivic && !(s.civics && s.civics[c.needCivic])) {
      var cn = '市政';
      if (SB.CIVICS) for (var _ci = 0; _ci < SB.CIVICS.length; _ci++) if (SB.CIVICS[_ci].id === c.needCivic) { cn = SB.CIVICS[_ci].name; break; }
      return '需要先完成市政「' + cn + '」';
    }
    var lack = lackText(s, c.in);
    if (lack) return '还缺 ' + lack;
    return null;
  }

  /* ── 工艺升级项（2026-09-28 用户规格 · era2 第三层）─────────────────
   * 与上半区「工具」（买断，放 s.tools）、下半区「配方」（可反复造，放各资源池）
   * 是**第三种**形态：**一次性装填、永久生效、存 s.upgrades**，装完还要能被
   * economy.capOf 读到。形参照猫国工坊升级（docs/KITTENS_BASELINE.md 那张表）。 */
  function upgradeRows() { return SB.UPGRADES || []; }
  function upgradeById(id) {
    var L = upgradeRows(), i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }
  function upgradeBlocked(s, id) {
    var u = upgradeById(id);
    if (!u) return '没有这项升级';
    if (s.upgrades && s.upgrades[id]) return '已经装上了';
    /* `u.need` 同样是真字段，由这里真读（与 tool 的 need 同构）。 */
    if (u.need && !(s.techs && s.techs[u.need])) {
      var ut = SB.tech && SB.tech.byId ? SB.tech.byId(u.need) : null;
      return '需要先研究「' + (ut ? ut.name : u.need) + '」';
    }
    var lack = lackText(s, u.cost);
    if (lack) return '还缺 ' + lack;
    return null;
  }
  function upgradeCanBuy(s, id) { return upgradeBlocked(s, id) === null; }
  function upgradeBuy(s, id, emit) {
    var u = upgradeById(id);
    if (!u || !upgradeCanBuy(s, id)) return false;
    /* 扣费先于置位、失败一分不扣 —— 与 buy / habitat.build 同口径，
     * 否则「点了之后材料少了、升级却没装上」会写进存档。 */
    var k;
    for (k in u.cost) s.res[k] -= u.cost[k];
    s.upgrades = s.upgrades || {};
    s.upgrades[id] = true;
    if (emit) emit('装上了「' + u.name + '」：' + u.desc + '。');
    return true;
  }

  /* 为什么建不了 —— 奇观。 */
  function wonderById(id) {
    var L = SB.WONDERS || [], i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }
  function wonderBlocked(s, id) {
    var w = wonderById(id);
    if (!w) return '没有这座奇观';
    if (s.wonders && s.wonders[id]) return '已经建成了';
    /* ⚠️ 2026-09-28 修：`w.need &&` 这一层**不能省**。
     *    奇观可以**没有** need（大图书馆在「通识」删掉后就是这种状态），而少了这道判据，
     *    `s.techs[undefined]` 是 undefined ⇒ `!undefined` 恒 true ⇒ **没有门的奇观被判成
     *    「需要先研究『undefined』」锁住** —— 玩家看到的是一个不存在的科技名，而真正拦着
     *    的是下面那条成本（大图书馆要 1000 精铁，早就超过基础容量）。
     *    这与文件里另外三处 need 门（`c.need` / `u.need` / `t.need`）的写法already不一致，
     *    那边都带了判据 —— 只有这里漏了，等于奇观这条路上多出一道「字段缺失就凭空锁死」的门。
     *    落回打不出名字时（need 指向一个已删的科技 id）它打的是 **id 而不是 undefined**，
     *    这样悬空的 need 至少在界面上露得出来，不会变成一个看不懂的空门。 */
    if (w.need && s.techs && !s.techs[w.need]) {
      var t = SB.tech && SB.tech.byId ? SB.tech.byId(w.need) : null;
      return '需要先研究「' + (t ? t.name : w.need) + '」';
    }
    /* 市政门（2026-09-30 ERA3）：圣泰坦尼克修道院 / 大巴扎的解锁权在市政身上
     *   （needCivic 字段，与建筑的 requiredCivic 同名同口径——判 s.civics **已完成**，
     *    不是 civShown 已揭示；揭示只发机会，市政点花出去才算完成）。 */
    if (w.needCivic && s.civics && !s.civics[w.needCivic]) {
      var cn = null;
      if (SB.CIVICS) for (var ci = 0; ci < SB.CIVICS.length; ci++) if (SB.CIVICS[ci].id === w.needCivic) cn = SB.CIVICS[ci].name;
      return '需要先完成市政「' + (cn || w.needCivic) + '」';
    }
    var lack = lackText(s, SB.wonder ? SB.wonder.discountedCost(s, id) : w.cost);
    if (lack) return '还缺 ' + lack;
    return null;
  }
  function buildWonder(s, id, emit) {
    var w = wonderById(id);
    if (!w || wonderBlocked(s, id) !== null) return false;
    var k;
    var wc = SB.wonder ? SB.wonder.discountedCost(s, id) : w.cost;
    for (k in wc) s.res[k] -= wc[k];
    s.wonders = s.wonders || {};
    s.wonders[id] = true;
    /* 一次性奖励（大图书馆的 +1000 科技点，2026-09-28 用户规格）。
     * ⚠️ 排在**置位之后**、也只在这里发一次：奇观是买断制（上面 wonderBlocked 会拦
     *    第二次），所以「只发一次」是买断制自带的，不需要另设防重标记。
     * ⚠️ 走 wonder.oneShot 那条出口而不是在这重写 `s.res.science += 1000`——
     *    数值写在 config 的数据表里，别处不许散读（wonder.js 纪律③的同一条道理）。
     * ⚠️ 用 addRes 而不是直接赋值：科技点无上限是对的，但 addRes 顺手做了
     *    `Math.min(cap, ...)` 那层保护，直接赋值等于绕过它（将来给 science 设上限时
     *    这一处会漏）。 */
    var grant = SB.wonder && SB.wonder.oneShot ? SB.wonder.oneShot(s) : null;
    if (grant) {
      for (k in grant) SB.economy.addRes(s, k, grant[k]);
      if (emit) emit('一次性获得 ' + grant.science + ' 科技点。');
    }
    if (emit) emit('建成了「' + w.name + '」：' + w.desc);
    return true;
  }

  /* 为什么买不了 —— 要说得出**该做什么**，与 tech.studyBlocked / civic.cardBlocked 同口径。 */
  function blocked(s, id) {
    var t = byId(id);
    if (!t) return '没有这项工具';
    /* ⚠️ `wip` 那道门排在**所有**门之前（2026-09-28 用户拍「暂时做个不能点的占位」）。
     *    顺序是有意的：先于「建成工坊」与 `need`，于是玩家看到的是「尚未设计」而不是
     *    「还缺 XX」—— 前者会让人问「这是什么」，后者会让人以为自己攒钱攒得不够。
     *    ⚠️ 只拦 blocked / canBuy，不动列表渲染：占位件要**看得见**，只是点不动。
     *    ⚠️ 摘掉 wip 就等于上线，效果必须已经在 config 里写全（target / bonus / desc）。 */
    if (t.wip) return '尚未设计（效果待定）';
    if (s.tools && s.tools[id]) return '已经买过了';
    /* 门槛 = 建成工坊（用户拍板）。不是青铜术：它是 era1 最贵的科技（cost 600，
     *  按 1 学者 0.15/s 要攒约 67 分钟），挂上去工具会晚到玩家已经打完半个 era1。 */
    if (!(s.lvl && s.lvl.workshop > 0)) return '需要先建成工坊';
    /* ⚠️ `t.need` 到这里**才第一次被真正读到**（2026-09-28）。
     *    ⚠️ 改之前它是个死字段：blocked 只认上面那句硬编码的「建成工坊」，从头到尾
     *       不读 need。于是任你在 config 的 TOOLS 表里写 need 也不会有任何作用 ——
     *       与 craftRatio、capOf 少括号、及本次要避免的 unlockTool 是同一类静默断链：
     *       数据层写了、实现层没读，跑起来不报错，只是永远不生效。
     *    ⚠️ 顺序是刻意的：工坊那道门排在 need 前面。工具在工坊页买，工坊没建连页面都
     *       进不去；先报「建成工坊」，玩家才不会在工坊页里撞见一条看不懂的科技提示。 */
    if (t.need && !(s.techs && s.techs[t.need])) {
      var nt = SB.tech && SB.tech.byId ? SB.tech.byId(t.need) : null;
      return '需要先研究「' + (nt ? nt.name : t.need) + '」';
    }
    var lack = lackText(s, t.cost);
    if (lack) return '还缺 ' + lack;
    return null;
  }
  function canBuy(s, id) { return blocked(s, id) === null; }

  /* 缺哪样、缺多少。只报**真正不够**的那几种，全够时返回空串。 */
  function lackText(s, cost) {
    var out = [], k;
    for (k in cost) {
      var have = (s.res && s.res[k]) || 0;
      if (have < cost[k]) out.push((SB.RESS && SB.RESS[k] ? SB.RESS[k].name : k) +
        ' ' + cost[k] + '（现有 ' + Math.floor(have) + '）');
    }
    return out.join('、');
  }

  function buy(s, id, emit) {
    var t = byId(id);
    if (!t || !canBuy(s, id)) return false;
    /* 扣费**先于**置位，且失败了一分不扣 —— 与 habitat.build 同口径，
     * 否则「点了之后钱少了、工具却没到手」这种半截状态会写进存档。 */
    var k;
    for (k in t.cost) s.res[k] -= t.cost[k];
    s.tools = s.tools || {};
    s.tools[id] = true;
    if (emit) emit('买下了「' + t.name + '」：' + t.desc + '。');
    return true;
  }

  /* 四颗按钮的档位，供渲染与 e2e 共用：
   * ⚠️ 形参照猫国 `js/jsx/left.jsx.js:502-505`，fixed 是**固定下限**、pct 是库存百分比，取大。 */
  SB.workshop = {
    tools: tools, byId: byId,
    blocked: blocked, canBuy: canBuy, buy: buy,
    lackText: lackText,
    /* 工艺制作下半区 */
    crafts: craftRows, craftById: craftById,
    craftRatio: craftRatio, craftMul: craftMul,
    maxCraftable: maxCraftable, stepAmt: stepAmt, craftBlocked: craftBlocked,
    craft: craft, steps: CRAFT_STEPS,
    /* 自动制作槽（2026-10-07）：槽数 / 占槽 / 改档 / 释放 / 满仓判定 / 泵 */
    slotMax: slotMax, pcts: pcts, slotCap: slotCap, slotPct: slotPct,
    setSlot: setSlot, clearSlot: clearSlot, autoReady: autoReady, autoTick: autoTick,
    /* 工艺升级项（第三种形态：一次性装填，存 s.upgrades） */
    upgrades: upgradeRows, upgradeById: upgradeById,
    upgradeBlocked: upgradeBlocked, upgradeCanBuy: upgradeCanBuy,
    upgradeBuy: upgradeBuy,
    /* 奇观 */
    wonders: list, wonderById: wonderById,
    wonderBlocked: wonderBlocked, build: buildWonder
  };
})(typeof window !== 'undefined' ? window : globalThis);
