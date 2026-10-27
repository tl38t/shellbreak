/* 天壳 / SHELLBREAK — 经济层
 * 每 tick 结算产出/消耗，顺序即平衡：
 *   采集 → 加工 → 地热 → 科技 → 口粮 → 生育 → 冻伤 → 天壳
 * 地热排在祭坛消耗之前，保证「先产后烧」；仓储上限在每个 add 处即时生效，
 * 超限部分直接浪费（S2：囤积不再是无收益的）。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG, SEASONS = SB.SEASONS, UNIT = SB.UNIT, BLD = SB.BLD;
  var SOCIAL = SB.economySocial;

  function fmt(n) {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return Math.floor(n).toLocaleString('en-US');
  }
  /* 顶栏格子里那个**存量**读数：固定一位小数（用户 2026-09-26 要求）。
   * ⚠️ 不能并进 fmt：fmt 是给**成本 / 上限**用的（Math.floor 取整，成本本来就是整数），
   *    而存量的进项里有 0.1 这个量级 —— 手动采珊瑚 +0.1/次、科技 0.03/秒、
   *    匠人加工前期的珊瑚 0.5/秒。取整显示时点十下数字都不动一格，
   *    玩家只会得出「按钮坏了 / 没接上」的结论。两种读数的精度需求相反，
   *    各留一个函数，别为了少写一行让其中一个迁就另一个。
   * 【为什么要固定一位，而不是「有小数才显示」】配合 CSS 的 tabular-nums，
   *    位数固定整排格子才不会随数值在 12 / 12.4 之间左右抖动。
   * 【为什么不用 toLocaleString 的 minimumFractionDigits】手拼千分位 + 小数位，
   *    只依赖 codebase 里已经验证过的 `toLocaleString('en-US')`（整数形态），
   *    不赌运行时有没有完整 ICU 数据。 */
  function fmtAmt(n) {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    var whole = Math.floor(n), dec = Math.round((n - whole) * 10);
    if (dec >= 10) { whole++; dec = 0; }   // 四舍五入进位：9.96 → 10.0 而不是 9.10
    return whole.toLocaleString('en-US') + '.' + dec;
  }

  // ---- 派生量（只读） ----
  function rOf(s) { return s.iceShell > 0 ? s.shell / s.iceShell : 0; }
  /* ── 冰封期（2026-09-27 改成随机触发）──
   * 旧形态：`rOf(s) <= FRAGILE_AT` ⇒ 壳薄到 25% 就**恒定**挨冻，且再也不会解除。
   * 新形态（用户拍板）：**每个寒流季开局掷一次骰子**，中则这一整季冰封，季末自动解除。
   *   概率 = FREEZE_MAX × (1 − 壳剩余比例) —— 线性，壳见底时封顶 FREEZE_MAX(0.33)。
   *   ⇒ 满壳开局 p = 0；壳剩一半 p ≈ 0.165；壳见底 p → 0.33。
   * ⚠️ 因此 `isCold` 不再是纯函数（从 s 推导），它读的是**状态** `s.frozen`
   *   （换季那一刻写入，见 `seasonTurn`）。任何跳过 tick 直接改 `s.t` 的测试
   *   都必须自己设 `s.frozen`，或直接 stub `rollFreeze`。 */
  function freezeChance(s) {
    var base = SB.CFG.FREEZE_MAX * (1 - rOf(s));
    if (!(base > 0)) return 0;
    return base > SB.CFG.FREEZE_MAX ? SB.CFG.FREEZE_MAX : base;
  }
  /* 掷骰单独成一个函数，是为了让回归可以把它换掉：
   * 冰封期是随机事件，若直接在 tick 里调 Math.random，`balance.mjs` 每跑一次结果都不同，
   * 「单局 8-14h」那条断言就会变成掷骰子。测试用 SB.economy.rollFreeze = () => true/false 顶掉。
   * ⚠️ 随机源走 SB.rng 而不裸调 Math.random，同理（离线补算与存档重放也走这条路）。 */
  function rollFreeze(s) {
    var rnd = SB.rng ? SB.rng() : Math.random();
    return rnd < freezeChance(s);
  }
  function isCold(s) { return !!s.frozen; }
  /* 冰封期资源产出倍率 = 基础 COLD_SEASON_MUL + 0.02 × 寒潮储备等级（轮回商店）。
   * ⚠️ 与方案文档 L248 的「基础 0.25」不一致：现有代码基底是 0.6，保留以免静默改平衡，待用户拍板。 */
  function coldSeasonMul(s) {
    /* 潮汐之树（2026-10-23）：寒冬续航节点（coldPenalty）替代旧「冰窖」(coldStore)；
     *   读 s.perk.coldPenalty（每级 −2% 寒冬惩罚，与旧 coldStoreLevel 同口径）。
     *   旧 legacy().coldStoreLevel 已随迁移剥离，改读 s.perk。 */
    var add = 0.02 * ((s.perk && s.perk.coldPenalty) || 0);
    return SB.CFG.COLD_SEASON_MUL + add;
  }
  /* 人口上限 = 两档住房之和。照猫国：容量 100% 在建筑身上（hut/logHouse/mansion），
   * 科技只负责**解锁下一档住房**，本身不给人口。
   * ⚠️ 2026-09-26 术语统一：这个函数原先叫 `beds`（床位）、UI 里写「床位 X」，
   *   用户拍板「床位就是人口，不要写什么床位了，都改成人口」。
   * 【2026-09-26 第二次改判：软容量 → 真硬上限】
   * 上一版是「超住只减速」（growRate = 1/(1+0.05×超住数)），理由是「满仓却不长人、
   * 原因读不出来」。但用户实测直接撞上了它的代价：屏幕上写着「族民 7（人口上限 2）」，
   * 两行自相矛盾。实测那个减速也几乎不起作用——**一座住房都不建（上限 0），
   * 41 分钟也能养到 18 人，比建 1 座礁口巢（38 分钟）只慢 7%**；
   * 于是「人口上限」既不是上限、也没有约束力，住房这条线整个是空转的，
   * 「堆珊瑚巢就是养人口」只是一句文案。
   * 现在 popCap 就是硬上限：到顶就不再生育（见 tick 第 6 步），
   * 住房从「装饰」变回「闸门」，「堆珊瑚巢就是养人口」从文案变成事实。
   * ⚠️ 硬上限的边界后果（已知、有意）：开局 0 住房 = 上限 `houseBase`(1) ⇒ 那 1 名族民
   *   在盖起第一座礁口巢（珊瑚 5）之前不会增加。这是「上限」二字应有的含义；
   *   `houseBase` 只为让开局显示 1/1，不是免费配额（它 1 个人占 1 个位置，照样是满的）。
   * ⚠️ 2026-09-26 改判：原本这里要读 tech.mul 的 `house`（巢筑/壳骨各 +2），
   *   但猫国 128 项科技没有任何一项给 maxKittens —— 那个写法在猫国没有对应物，
   *   而 popCap 也从未读它，等于花 80 科技买了零。现改为巢筑解锁「石屋」，
   *   人口回到建筑身上。
   * ⚠️ 壳骨（纪元三）的 eff.house 目前**仍是空效果**（popCap 不读 tech.mul），
   *   按用户「一个一个解决」的节奏留到纪元三那轮处理，别在这里顺手接线。 */
  /* 潮汐之树（2026-10-23）：人口上限永久加成改由 startPop 链（startPop1/2/3，max 三档）出，
   *   替代旧「广厦之基」(popcap)。s.perk.startPop = max 三档贡献（满购 =3）。
   * 加在末尾、用 `|| 0` 兜空 —— s.perk 在 freshRun 总被 emptyPerks 初始化（已含 startPop:0）。 */
  function popCap(s) {
    var p = s.perk || {};
    var popBuildLev = (s.lvl.nest || 0) + (s.lvl.coralhouse || 0) + (s.lvl.tenement || 0);
    var cap = SB.BLD.houseBase
      + s.lvl.nest * SB.BLD.house
      + s.lvl.coralhouse * SB.BLD.house2
      + s.lvl.tenement * SB.BLD.tenementPop
      + (s.lvl.tenement || 0) * (p.starModuleHousing || 0)
      /* ERA10（2026-10-20）：太阳星环每级 +1 人口上限（用户 ERA10 表「近恒星轨道建设」解锁2）。
       * 与住房三件同轴相加（不是乘区）——「+1 人口上限」字面就是加 1。 */
      + (s.lvl.solar_ring || 0)
      + (p.startPop || 0)
      + (p.housePlan || 0) * popBuildLev
      + (SB.civic && SB.civic.popCapPerPopBldg ? SB.civic.popCapPerPopBldg(s) * popBuildLev : 0)  // ERA7 公摊面积卡：人口建筑每级 +0.5 上限
      + (SB.civic && SB.civic.cardPopCapFlat ? SB.civic.cardPopCapFlat(s) : 0); // 人口政策卡：固定上限加值
    /* 人口按完整个体计数。公摊面积等效果可能给出 x.5 床位，按要求向上取整；
     * 挑战人口硬上限仍在取整后钳制（当前挑战上限均为整数）。 */
    return Math.min(Math.ceil(cap), SB.challenges ? SB.challenges.populationLimit(s) : Infinity);
  }
  /* 「住满」= 人口已经顶到上限，下一胎不会来。
   * tick 的生育步、UI 的生育行、两个 sim 的「该不该盖房」都读它——
   * 三处各写一遍 `pop >= popCap` 迟早会有一处写成 `>`，
   * 症状是「差一人满员时白等一胎」这种不报错的空转。 */
  function isFull(s) { return s.pop >= popCap(s); }
  /* 生育时长统一由在线 tick、离线补算和 UI 共用：轮回奖励先缩短基础时长，
   * 已装备的人口政策卡再应用乘区（乡镇集会/城市供给各 ×0.5）。 */
  function growthDuration(s) {
    var base = SB.challenges ? SB.challenges.growthDuration(s) : CFG.GROW_NEED;
    var cardMul = SB.civic && SB.civic.cardPopGrowthTimeMul ? SB.civic.cardPopGrowthTimeMul(s) : 1;
    /* 潮汐之树（2026-10-23）：勤耕节点（workSpeed1/2，族民生产时间 −10%/−20%）缩短生育间隔，
     * 与政策卡 popGrowthTimeMul 同口径（都是乘在 base 上的时间系数，<1 即更快）。s.perk.workSpeed 累计百分比。 */
    var workSpeedMul = 1 - ((s && s.perk && s.perk.workSpeed) || 0);
    if (!(workSpeedMul > 0)) workSpeedMul = 0;
    return base * cardMul * workSpeedMul;
  }
  function lvlSum(s) {
    var n = 0; for (var k in s.lvl) n += s.lvl[k]; return n;
  }
  /* ⚠️ 取模必须用 SB.SEASONS.length，不能写死季数：2026-09-27 删掉浊流季（4→3），
   * 旧版这里写死 `% 4` ⇒ 索引会落到表里没有的位置（undefined.name 直接炸）。
   * 季节表是最容易被增删的那种表，取模跟着表走才不会每次都漏改一处。 */
  function seasonIdx(t) { return Math.floor(t / SB.CFG.SEASON_TICKS) % SB.SEASONS.length; }
  function season(t) { return SEASONS[seasonIdx(t)]; }

  /* ── 换季：冰封期骰子只在这里掷 ──
   * 每个寒流季**开局**判一次：中则整季冰封（s.frozen = true），下一季自动解除。
   * 非寒流季一律清掉，不留上一季的残留。
   * ⚠️ 返回值是「是否刚换季」，tick 不需要它，但测试需要（跳过 tick 改 s.t 的场景）。 */
  function seasonTurn(s) {
    var i = seasonIdx(s.t);
    if (s._seasonIdx === i) return false;
    s._seasonIdx = i;
    s.frozen = SEASONS[i].mult < 1 ? rollFreeze(s) : false;
    return true;
  }
  /* ERA4（2026-10-01）· 市政《探索》每季发资源。
   * ⚠️ 调用时机：tick 内只置 `s._seasonGrantPending` 标记，由 game 主循环在 tick 返回后
   *   统一调本函数发放。为什么不在 tick 里直接算：tick 中途状态是半更新的（壳厚快照、
   *   各资源增量、happy 均衡都未就绪），此时读 rates() 拿到的是「上一秒与这一秒的混合体」，
   *   数值口径脏；挪到 tick 返回后，rates() 读到的就是自洽状态。
   *   （2026-10-01 排查记录：当天整局模拟出现过随机原生段错误，一度归因给「tick 内调
   *   rates()」——后经空跑对照实验推翻：seasonGrant 完全禁用时照样崩，且次日同代码
   *   多批次全绿。结论：段错误是当时的环境因素（内存压力类），与本函数无关；
   *   但「tick 返回后再发资源」的时机约定保留，它是数值口径问题不是崩溃问题。）
   * ⚠️⚠️ 2026-10-06 用户报「商队驿站就这点效果？」——**根因是等级根本没接线**：
   *   本函数原来只判 `lvl.caravanserai >= 1`，于是 1 级与 5 级效果**完全相同**
   *   （而 ratio 1.15 意味着满级比 1 级多花 1.75 倍的钱）。属「承诺了没接线」那一类。
   *   修法（用户 2026-10-06 给定数值）：发放量 = **等级 × 1 分钟产量**（60s × lvl）。
   *   1 级 = 60 秒（与原口径一致，零回归），5 级 = 300 秒。
   *   资源池仍是 rates() 中 > 0 的那些（用户口径「所有按时间产出的东西」），随机抽一个入账。
   * ⚠️ 随机源走 SB.rng（与 rollFreeze 同纪律）；addRes 仍走 capOf，超出仓储的部分被截掉。 */
  function seasonGrant(s) {
    var _lv = (s && s.lvl) || {};
    if (!(s.civics && s.civics.explore) || (_lv.caravanserai || 0) < 1) return;
    var _r = rates(s), _pool = [], _k;
    for (_k in _r) if (typeof _r[_k] === 'number' && _r[_k] > 0) _pool.push(_k);
    if (!_pool.length) return;
    var _ri = (SB.rng ? SB.rng() : Math.random());
    var _pick = _pool[Math.floor(_ri * _pool.length) % _pool.length];
    /* 60 秒 × 等级（2026-10-06 用户拍板）。1 级恰好等于原口径 ⇒ 老存档与首级行为不变。 */
    addRes(s, _pick, _r[_pick] * 60 * _lv.caravanserai);
  }

  // ---- 仓储（S2）----
  /* 未在 CAP_BASE 中配置的资源为无限，不设浪费判定（如 science、石梁、脚手架等）。
   * ⚠️ 判「表外」必须写 `=== undefined`。旧版是 `!SB.CFG.CAP_BASE[k]`，而 `!0 === true`
   *    ⇒ stone / warmstone 这两条**「明写 0」**的资源被当成了表外 ⇒ 整局无上限。
   *    当时的注释还写着「明写 0 与表外等价，且更清楚」——两者恰恰相反：
   *      明写 0 = 基础容量 0，但仍吃全局增量；缺键 = 永远 Infinity。
   *    「把自己说服了的注释」比没有注释更危险：它让一个 bug 看起来像设计决定。 */
  function capOf(s, k) {
    var base = SB.CFG.CAP_BASE[k];
    if (base === undefined) return Infinity;
    /* ⚠️ 2026-09-26 第三轮：**删掉「每建筑级给全局容量」那一轴**（旧 CAP_PER_LVL）。
     *    上限现在是「起步容量 + 专门仓库建筑 + 工坊扩容乘区」—— 猫国形态。
     *    藻食走海藻仓与藻食扩容；其余有上限资源走压舱仓与通用扩容，互不串线。
     * ⚠️ 科技侧对容量也有话说（`tech.mul(s).kelpCap`），这条通道**曾经是死键**：
     *    mul() 算出了值、UI 也照着显示「藻食上限 +200」，但 capOf 从来没读过它 ⇒
     *    「储藻术」研究完什么也没发生。这正是「加了科技但忘了接线」那一类静默断链。
     *    现接通：科技给的容量与建筑给的**相加**。猫国那套是乘法乘区（barnRatio ×
     *    warehouseRatio），本作科技是一次性的、没有「可反复研究的工坊升级」做载体，
     *    加法更直白；将来要加乘区时，通道就是这里。 */
    var T = SB.tech ? SB.tech.mul(s) : null;
    var techKelpCap = T && typeof T.kelpCap === 'number' && isFinite(T.kelpCap) ? T.kelpCap : 0;
    /* 仓储区容量乘区（2026-09-30 中世纪集市卡）：只乘**贸易区域三座建筑**的容量贡献段
     * （海藻仓/压舱仓/灯塔），基础容量、科技容量、奇观常数、扩容升级都不吃——
     * 规格原文是「仓储区所有建筑上限+100%」，翻倍的是建筑的贡献，不是整条容量。 */
    var _sm = (SB.civic && SB.civic.storeMul) ? SB.civic.storeMul(s) : 1;
    if (!(typeof _sm === 'number' && isFinite(_sm) && _sm >= 0)) _sm = 1;
    /* 轮回商店「材料总仓」：所有有上限的普通资源容量 ×(1 + 0.05 × 等级)（20 级 ⇒ +100%）。
     * ⚠️ 只作用于 CAP_BASE 有明确定义上限的资源（kelp / 各材料），不碰科技/市政/信仰/奢侈/
     *    无上限工艺品；与建筑仓储升级相乘（规格 L349）。 */
    /* 潮汐之树（2026-10-23）：材料总仓节点（matStore1/2/3 + 无限尾）替代旧「材料总仓」(matStore, n:20)；
     *   直接读 s.perk.matStore（累积值，每级 +0.05 容量乘区，与旧 matStoreLevel 同口径）。
     *   旧 legacy().matStoreLevel 已随迁移剥离。 */
    var matMul = 1 + 0.05 * ((s.perk && s.perk.matStore) || 0);
    if (!(typeof matMul === 'number' && isFinite(matMul) && matMul > 0)) matMul = 1;
    if (k === 'kelp') {
      /* ⚠️ 扩容升级是**乘法**，整套仓储线里只有它这一条是乘法 —— 见下面的 matCap。 */
      var kelpCastle = castleCapBonus(s, k);
      if (!(typeof kelpCastle === 'number' && isFinite(kelpCastle) && kelpCastle >= 0)) kelpCastle = 0;
      var kelpStorage = (typeof s.lvl.kelpstore === 'number' && isFinite(s.lvl.kelpstore) && s.lvl.kelpstore >= 0)
        ? s.lvl.kelpstore : 0;
      var kelpCapPerLevel = (typeof SB.BLD.kelpCap === 'number' && isFinite(SB.BLD.kelpCap)) ? SB.BLD.kelpCap : 0;
      var kelpCap = base + _sm * kelpStorage * kelpCapPerLevel + techKelpCap + kelpCastle;
      if (!(typeof kelpCap === 'number' && isFinite(kelpCap) && kelpCap >= 0)) kelpCap = base;
      return kelpCap
        * capUpgradeMul(s, 'upg_kelpstore_1', k)
        * capUpgradeMul(s, 'upg_kelpstore_2', k)   /* 2026-10-01 II 级扩容：与压舱库 II 同构，补上这条乘法轴（漏接 = 死升级） */
        * matMul;
    }
    /* 其余有上限资源：基础 + 压舱仓 + 通用扩容；表外资源已在上方直接返回 Infinity。 */
    /* ⚠️ **2026-09-28：这里少一对括号，把整条资源线的容量打成了 0。**
     *    原样是 `... + ballast*cap + SB.wonder ? bonus : 0`，而 `+` 的优先级高于 `?:`
     *    ⇒ 它被解析成 `(base + ballast*cap + SB.wonder) ? bonus : 0`，
     *      **左半边整个变成条件、返回值只剩三元那一项** ⇒ 上限恒等于奇观加成（0 或 200），
     *      CAP_BASE 与压舱仓全被丢掉 ⇒ coral/stone/iron 上限恒 0 ⇒
     *      手动采珊瑚点 600 下仍是 0，整局永远跑不穿，runHours 恒 0。
     *    ⚠️ 断言为什么没抓住：石梁那条测的是 stoneBeam（走 Infinity 路径），
     *       而「仓储加成」那条比的是**差值**（两边一起错，差值碰巧对）。
     *    ⇒ 判据：capOf 必须逐资源钉绝对值，不能只比差值。见 e2e「每种材料的容量都拿得到 CAP_BASE」。*/
    /* ⚠️ 2026-09-28：这里新增「工艺升级项」那条**乘法**轴（扩容升级），与上面
     *    几轴（等级相加 / 科技相加 / 奇观相加）不同量纲 —— 它是 `× capMul`，
     *    作用在**整条**容量上：不是「增量再乘 1.5」，而是「上限本身 ×1.5」。
     *    若只乘增量，玩家在压舱仓建起来之前买这个等于没买（相当于没这条规则）。
     * ⚠️ 乘数从 UPGRADES 表读（capMul 字段），不在 economy 里写死 ——
     *    将来加「扩容 II」只改 config，不用回头改这里。
     * ⚠️ 老档没有 s.upgrades ⇒ `s.upgrades &&` 短路成 1，按「没装」处理，不报 NaN。 */
    var matBonus = (SB.wonder && typeof SB.wonder.matMaxBonus === 'function') ? SB.wonder.matMaxBonus(s, k) : 0;
    if (!(typeof matBonus === 'number' && isFinite(matBonus) && matBonus >= 0)) matBonus = 0;
    var matBallast = (typeof s.lvl.ballast === 'number' && isFinite(s.lvl.ballast) && s.lvl.ballast >= 0) ? s.lvl.ballast : 0;
    var matLighthouse = (typeof s.lvl.lighthouse === 'number' && isFinite(s.lvl.lighthouse) && s.lvl.lighthouse >= 0) ? s.lvl.lighthouse : 0;
    var matCap = base + _sm * (matBallast * SB.BLD.ballastCap
      /* ⚠️ 2026-09-28 灯塔也仓库（+120/级，与压舱仓同档）。
       *    【为什么是**并列相加**而不是乘】两座仓是两条独立的容量来源，各自的量纲
       *       都是「每级 +120」。写成 `(1 + lvl.ballast*120) * (1 + lvl.lighthouse*120)`
       *       会在两座都盖起来时把效果放大成平方，那是「同一个东西被计价两次」。
       *    【大灯塔的 +60/级 走这里（灯塔项内），不在这里下面的 matMax】2026-10-06 起改为
       *       按灯塔等级缩放：大灯塔建成后，灯塔项 = `(lvl.lighthouse) × (lighthouseCap
       *       + lighthouseCapGreat)`，lighthouseCapGreat=60=压舱仓一半，挂 wonder.owned 条件；
       *       旧的「matMax:60 一次性」写法已删。 */
      + matLighthouse * (SB.BLD.lighthouseCap
        + ((SB.wonder && SB.wonder.owned(s).wonder_great_lighthouse) ? SB.BLD.lighthouseCapGreat : 0)))
      /* ⚠️ 奇观「海潮方碑」的「各材料仓储 +200」。
       *   ⚠️ **只加给材料，不加石梁** —— 石梁是无上限资源（用户拍），给它加 200 没有意义。
       *    ⚠️ 用**白名单**而不是「除 stoneBeam 之外全加」：将来加新资源时，
       *        白名单会逼着人决定「新资源吃不吃这个加成」，黑名单则让人默认漏掉。 */
      + matBonus
      + (resourceStorageEra(k) <= 7 && s.upgrades && s.upgrades.upg_logiware
      /* ERA7（2026-10-17 · spec §4）：物流仓库（upg_logiware，顶替商队驿站）每级给纪元七及之前解锁的有上限材料 +200 容量。
       *   ⚠️ 与 matBonus（海潮方碑，一次性 +200）同源相加：都是「材料容量加法轴」，互不踩定义域。
       * ⚠️⚠️【2026-10-27 修 bug：这里原先把**布尔**当数量用】
       *   原文是 `((s.upgrades && s.upgrades.upg_logiware) || 0) * logiwareCap`，
       *   而 `s.upgrades[id]` 只会有两种状态 —— `true`（workshop.js:553 `s.upgrades[id] = true`）
       *   或 undefined ⇒ `true * 200 = 200`，**永远 200，商队驿站等级根本没读**。
       *   症状：desc 写「每级 +200」，玩家把商队驿站升到 10 级，容量只 +200（少 1800），
       *   报「物流仓库/基础物流不生效」。从 v0.1.6 实装起从未对过。
       *   ⇒ 等级必须从**建筑**读，与 `castleCapBonus`（布尔当开关 + `coreLvl(s)` 取等级）完全同构。
       * 【为什么 e2e 一直绿】夹具 `e2e.mjs` 原先写 `upgrades.upg_logiware = 2`（当数字用），
       *   而生产路径只写 `true` ⇒ 测的是玩家永远到不了的状态（假绿）。
       *   判据：凡 `s.upgrades.<id>` 都只能当「在不在」用；任何把它做乘法/加减的写法都是错的。 */
          ? ((s.lvl && s.lvl.caravanserai) || 0) * (SB.BLD.logiwareCap || 0)
          : 0);
    if (!(typeof matCap === 'number' && isFinite(matCap) && matCap >= 0)) matCap = base;
    var matCastle = castleCapBonus(s, k);
    if (!(typeof matCastle === 'number' && isFinite(matCastle) && matCastle >= 0)) matCastle = 0;
    var cap = (matCap + matCastle) * capUpgradeMul(s, 'upg_ballast_1', k)
      * capUpgradeMul(s, 'upg_ballast_2', k) * capUpgradeMul(s, 'upg_alloy_warehouse', k) * matMul;
    return (typeof cap === 'number' && isFinite(cap) && cap >= 0) ? cap : base;
  }

  /* 某道扩容升级装了没有 ⇒ 返回它的乘数（没装返回 1）。
   * ⚠️ 查的是表里的 `capMul` 而不是这个数写死在判断里，理由见 capOf 那条注。
   * ⚠️ `s.upgrades` 是**新字段**（2026-09-28）：老存档里根本没有它，
   *    ⇒ 一律走 `|| 1`（没装），不能让它把整条容量算成 NaN。 */
  function resourceStorageEra(k) {
    var era = SB.RESS && SB.RESS[k] && SB.RESS[k].storageEra;
    /* 新增有限库存资源必须显式标注纪元；漏标时不吃任何旧扩容，避免默认套上早期倍率。 */
    return (typeof era === 'number' && isFinite(era) && era > 0) ? era : Infinity;
  }
  function capEraAllows(id, resourceId) {
    var L = SB.UPGRADES || [], i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) {
      return !L[i].capEra || resourceStorageEra(resourceId) <= L[i].capEra;
    }
    return true;
  }
  function capUpgradeMul(s, id, resourceId) {
    if (!s || !s.upgrades || !s.upgrades[id]) return 1;
    var L = SB.UPGRADES || [], i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) {
      /* 仓储扩容只覆盖解锁纪元不晚于升级自身的资源。
       * 早期扩容不会预先放大后续科技才加入的材料容量；后期升级仍可覆盖早期资源。 */
      if (resourceId && !capEraAllows(id, resourceId)) return 1;
      return L[i].capMul || 1;
    }
    return 1;
  }
  /* 读已安装工坊升级的某字段之和（2026-09-29 ERA3）。
   * ⚠️ 与 capUpgradeMul 同源但更通用：capMul 只服务容量，这里服务矿场/学院/减耗/奢侈品等
   *   一切写在 UPGRADES 表上的效果键（mineSilt / mineWarm / instituteSci / hallSaveMul /
   *   castleCap / luxuryMul / craftRatio）。安装判定统一走 s.upgrades[id]。 */
  function upgSum(s, key) {
    if (!s || !s.upgrades) return 0;
    var L = SB.UPGRADES || [], i, sum = 0;
    for (i = 0; i < L.length; i++) if (s.upgrades[L[i].id] && L[i][key]) sum += L[i][key];
    return sum;
  }
  /* 猫国 game.js:2726 getLimitedDR 直移植（2026-09-29 城堡容量衰减，用户拍「衰减抄猫国」）。
   * 语义：effect < 上限 75% 时原样给；超过部分只给渐近增量，整条逼近 limit 而不无限膨胀。
   * ⚠️ 本作只把它用在城堡「每级 +50 容量」这条轴（城堡升级可反复装、无等级上限，
   *   靠这条衰减把总量收口）。limit 是衰减参考上限（待标定默认：约 20 级议事厅 = 1000 容量处收口）。 */
  function getLimitedDR(effect, limit) {
    if (effect < limit * 0.75) return effect;
    var a = limit * 0.75;
    var b = (effect - a) / (limit - a);
    var c = 1 - Math.pow(1 - b, 0.75);
    return a + (limit - a) * c;
  }
  /* 统治核心等级 = 议事厅（升级后叫城堡）的等级。
   * ⚠️ 2026-10-06：城堡**不是另一座建筑**，而是议事厅买下工坊升级 `upg_castle` 之后的
   *   新名字——同一座建筑、同一个 `s.lvl.hall`、同一条造价曲线。所以这里就是**单读 hall**。
   *   （前一版曾按「两座并存」写成 `lvl.castle + lvl.hall` 求和，那是误读，已撤回；
   *     那座凭空多出来的 `castle` 建筑也一并从 config 的 BUILDINGS 删除。）
   *   为什么要留这个函数而不直接写 `s.lvl.hall`：三条效果（减耗 / 市政点 / 容量轴基数）
   *   与面板注脚都读它，而「升级后它叫城堡」这件事必须在注释里说清一次，
   *   否则下一个人又会以为存在第二个等级键。 */
  function coreLvl(s) {
    if (!s || !s.lvl) return 0;
    return s.lvl.hall || 0;
  }

  /* 城堡容量轴：每级统治核心 +50（装了 upg_castle 才生效），整体过 DR 衰减。 */
  var CASTLE_DR_LIMIT = 1000;
  function castleCapBonus(s, resourceId) {
    if (!(s.upgrades && s.upgrades.upg_castle)) return 0;
    if (resourceId && !capEraAllows('upg_castle', resourceId)) return 0;
    var raw = coreLvl(s) * upgSum(s, 'castleCap');
    return getLimitedDR(raw, CASTLE_DR_LIMIT);
  }
  function addRes(s, k, v) {
    /* ⚠️ 资源池的最后一道 NaN 闸门。`NaN <= 0` 是 false，若只写这一句，
     *    上游某个乘区一旦漏键，NaN 会穿过判断并把 `have + v` 再次写回 NaN。
     *    这正是面板后来出现「已有 NaN / 成本正常」的直接原因。
     *    非有限产出不能入账；存量异常则由下面的 have 兜底为 0，下一笔正常产出可以自愈。 */
    var have = (s.res && typeof s.res[k] === 'number' && isFinite(s.res[k])) ? s.res[k] : 0;
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
      if (s.res) s.res[k] = have;
      return;
    }
    var c = capOf(s, k);
    /* 产出速率正常、库存却永远是 0 的另一条故障路径：capOf 内任一乘区若返回 NaN，
     * `Math.min(NaN, ...)` 会把库存再次写成 NaN，render 又会把 NaN 格式化成 0，
     * 所以玩家只能看到「+80/s，但永远 0」。上限异常时退回该资源的基础容量；
     * 无基础上限的资源仍按 Infinity 处理，至少保证资源线继续可用。 */
    if (!(c === Infinity || (typeof c === 'number' && isFinite(c) && c >= 0))) {
      var baseCap = SB.CFG && SB.CFG.CAP_BASE ? SB.CFG.CAP_BASE[k] : undefined;
      c = (typeof baseCap === 'number' && isFinite(baseCap) && baseCap >= 0) ? baseCap : Infinity;
    }
    /* ⚠️ 2026-09-28：`s.res[k]` 可能是 undefined（新资源加进了 RESS，却漏了 freshRun 的
     *    res 字面量）⇒ `undefined + 5.25 = NaN` ⇒ `Math.min(Infinity, NaN)` **仍是 NaN**
     *    ⇒ 产物落进池子却读出来是 NaN，不报错也不截图，只污染一切读到它的算式。
     * ⚠️ 兜底只把**非数字**洗成 0，NaN 原样留下：NaN 的 typeof 就是 'number'，
     *    这层判断拦不住它，于是它会照常一路红到断言上。把 NaN 也洗成 0 的话，
     *    「资源凭空变 0」和「资源凭空变 NaN」就都看不出来了，那是本次要避免的事。 */
    var next = c === Infinity ? have + v : Math.min(c, have + v);
    if (!(typeof next === 'number' && isFinite(next))) {
      s.res[k] = have;
      return;
    }
    s.res[k] = next;
    /* 累计产出台账：record 类（gathered）尤里卡条件读它。
     * 记的是「流进来的量」而不是「留在池里的量」——仓储溢出的部分也算采到过，
     * 否则玩家一路爆仓却永远点不亮「累计产出 500」这类条件。 */
    if (s.got) s.got[k] = (s.got[k] || 0) + v;
  }

  /* 统治核心的「议价」：每一级降低所有建筑**下一级**的建造成本，但**边际收益递减**——
   * 低等级段近似线性省耗，高等级段每级省得越来越少，逼近一个软上限（造价永不到 0）。
   * ⚠️ 2026-10-06：读数走 `coreLvl(s)`（= 议事厅等级）而不是散写 `s.lvl.hall`——
   *   建筑在买下 `upg_castle` 之后改叫「城堡」，这个函数读的是同一个数，两处不会各写一份。
   * ⚠️ 作用在 `ratio^n` 这一侧而不是首级成本上——首级只有一次，
   *   压首级等于只帮玩家省开头那一次，后期指数曲线一动不动，那不是议事厅该有的分量。
   * ⚠️ 2026-10-07：去掉硬封顶（旧 `HALL_CAP=0.30` 的 `Math.min` 硬墙是我后加的、用户没拍过），
   *   改用 DR 衰减曲线 `getLimitedDR`（与城堡容量轴 `castleCapBonus` 完全同构）。
   *   ★ 为什么是软上限而非硬墙：`getLimitedDR` 下 `eff` 永远 < lim，hallMul 恒 > (1−lim)，
   *     造价永远 ≥ 10%（lim=0.90），不会出现「去掉封顶直接 `1−等级×0.03`」在 34 级折扣 >100%
   *     ⇒ 造价变负、`pay` 倒给资源 的真 bug（costOf 对 hallMul 没有下限钳制）。
   *   ★ 边际递减：`getLimitedDR` 在 effect < 0.75×lim 之前线性，之后拐点收缩、逼近 lim——
   *     正是用户要的「降低消耗、但边际效益越来越低」，且再没有 45% 那种一刀切的硬墙。
   *   ★ 城堡（upg_castle）把「减耗效果 +50%」：只提高每级省耗率 `rate`（×1.5，让每级省更多、
   *     更早逼近天花板）；软上限 `lim` **不**跟随抬高（见 hallMul 内 Math.min 锁回 0.90）。
   *   ⚠️ 2026-10-10 旧 bug：lim 曾 ×(1+hallSaveMul)=1.35 > 1，导致 hallMul=1-eff 越过 0 变负、
   *     造价成负数、按钮可无限刷级（10²⁴ 量级）。现 lim 锁死 0.90，hallMul 恒 ≥ 0.10。
   *   ⚠️ 把原始省耗率 `_n*rate` 先 `Math.min(., lim)` 再进 `getLimitedDR`：该函数对
   *     effect > lim 会算出 NaN（负数底 fractional 幂），而我们这里 lim 仅 0.90、rate 0.02，
   *     约 45 级就到 lim——比容量轴（lim=1000、约 20 级到 lim）更易踩中，故加这道下限闸。 */
  var HALL_SAVE = 0.02;            // 每级原始省耗率（线性段的斜率）
  var HALL_DR_BASE = 0.50;         // 基础软上限 50%：议事厅/城堡自身的折扣上限（造价地板 50%）
  var HALL_DR_MAX  = 0.75;         // 最高软上限 75%：含所有仓库建筑（城堡 + 其它 store）的折扣总硬顶
  var HALL_DR_CASTLE_HSM = 0.5;    // 城堡 upg_castle 的 hallSaveMul 基准值（剥出「城堡本体」以算额外加成）
  function hallDiscountLimit(s) {
    var hsm = upgSum(s, 'hallSaveMul');
    var extra = Math.max(0, hsm - HALL_DR_CASTLE_HSM);
    return Math.min(HALL_DR_BASE + extra, HALL_DR_MAX);
  }
  function hallMul(s) {
    var _n = coreLvl(s);
    if (!_n) return 1;
    /* hallSaveMul 是所有「减耗类仓库建筑」的加成之和（当前只有城堡 upg_castle=0.5，
     * 但 kelpstore/ballast/lighthouse/matStore 等其它仓库建筑若将来也挂这个键，
     * 一律走 upgSum 聚合 —— 不写第二份「哪些建筑算减耗」清单，避免漂移）。
     * 城堡把「每级省耗率 +50%」（rate ×1.5），只让折扣更早逼近天花板，不抬高天花板。 */
    var hsm = upgSum(s, 'hallSaveMul');
    var rate = HALL_SAVE * (1 + hsm);
    /* 软上限 = 基础(50%) + 超过城堡基准的额外仓库加成，但绝不越过最高软上限(75%)：
     * · 仅议事厅/城堡（hsm=0.5）→ lim=0.50（基础软上限 50%，造价地板 50%）
     * · 若其它仓库建筑也带 hallSaveMul，继续叠加到 0.75 封顶（最高软上限 75%）
     * ⚠️ 旧 bug：lim 曾 = 0.90×(1+hsm)=0.90×1.5=1.35 > 1 ⇒ hallMul=1-eff 越过 0 变负、
     *     造价成负数、按钮可无限刷级（10²⁴ 量级，2026-10-10 实测）。
     *   现 lim 直接取自聚合后的 hsm 并硬顶 0.75 ⇒ hallMul 恒 ∈ [0.25, 1]，彻底根绝负值，
     *   且任何仓库建筑叠加都不会突破 75%。 */
    var lim = hallDiscountLimit(s);
    var eff  = getLimitedDR(Math.min(_n * rate, lim), lim);   // 走和容量轴同一道衰减曲线
    return 1 - eff;
  }
  function hallDiscount(s) { return 1 - hallMul(s); }
  /* 倒置搭建：只减少脚手架材料，不影响同一造价中的其它资源。
   * 建筑、工坊升级与奇观共用此函数，保证显示、材料判定和实际扣费一致。 */
  function scaffoldCostMul(s) {
    var T = SB.tech ? SB.tech.mul(s) : null;
    return Math.max(0, 1 - (T ? (T.scaffoldCostSave || 0) : 0));
  }
  function scaffoldAdjustedCost(s, cost) {
    var out = {}, k, mul = scaffoldCostMul(s);
    if (!cost) return out;
    for (k in cost) out[k] = cost[k] * (k === 'scaffold' ? mul : 1);
    return out;
  }
  // 单级增量成本。递增系数是建筑自己的 `ratio`（猫国 priceRatio），不是全局常数——
  // 住房 2.5 贵到买不动，产能建筑 1.12 便宜到可以一路铺开，这是两条不同的曲线。
  /* ERA9（2026-10-19 · 用户纠正② / docs/ERA9_TECHS_SPEC §7）：星球重构机 G.E.E.K 完成
   *   恩克拉多斯/泰拉改造后，给覆盖建筑的有效造价等级往下偏移 `s.geek.costOffset`（Enceladus=3 / Terra=5 替换），
   *   **不是加等级/虚级**。落点只在 costOf 这一处（Math.pow(ratio, effN)），economy 零改动、
   *   面板天然一致（costOf 是造价显示与真实扣费的共用入口）。覆盖清单以「建筑 id」单一事实源登记，
   *   不要另写一份（那是第二份事实来源，必漂）。`hall` 是否计入属待拍，先不列入。
   *   ⚠️ `s.geek.costOffset` 默认 0（state.js freshRun），G.E.E.K 运行态未落地前本管线是 no-op。 */
  var COST_OFFSET_COVERED = { nest: 1, coralhouse: 1, tenement: 1, coralfarm: 1,
    siltpit: 1, furnace: 1, kelp: 1, weir: 1, warmnest: 1 };
  function costOf(s, id) {
    var b = null;
    for (var i = 0; i < SB.BUILDINGS.length; i++) if (SB.BUILDINGS[i].id === id) b = SB.BUILDINGS[i];
    var n = s.lvl[id] || 0, o = {}, hm = hallMul(s);
    /* 君主制建造减耗（2026-09-30 · 市政《行政部门》解锁政体）：只在 zone==='core' 生效，
     *   乘在这里而不是 habitat.build ⇒ 面板显示的造价与真实扣的是同一笔。
     *   ⚠️ 与 hallMul **并列相乘**：议事厅是「建筑给的减耗」、君主制是「制度给的」，
     *      两条独立来源，谁也不知道谁的存在。 */
    var gm = (SB.civic && SB.civic.govBuildCostMul) ? SB.civic.govBuildCostMul(s, id) : 1;
    /* ⚠️ 2026-09-30 ERA4 · 王国大交易所：**贸易区域**建筑消耗 -10%（effect.tradeSave）。
     *    分区归属读 `b.zone` —— 它来自 BUILD_ZONE_OF（config），是本作分区的唯一真源，
     *    这里不许另写一份「哪些建筑算贸易区」的清单（那是第二份事实来源，必漂）。
     *    三条减耗彼此独立相乘：议事厅(建筑) × 君主制(制度) × 大交易所(奇观，限贸易区)。 */
    var wm = (b && b.zone === 'trade' && SB.wonder) ? SB.wonder.tradeSaveMul(s) : 1;
    /* ⚠️ ERA5（2026-10-02）· 倒置搭建（upg_invertbuild）全建筑 −20% 造价（effect.invertBuildSave）；
     *    高压热机管道（upg_thermrecover）额外给**热液汽轮机** −30%（effect.hydroBuildSave）。
     *    两条独立相乘、且排在 hm/gm/wm 之后 —— 与「议事厅/君主制/大交易所」同一道乘区纪律：
     *    它们是「制度给的减耗」，互不踩对方的定义域。 */
    var isb = 1 - upgSum(s, 'invertBuildSave');
    var hsb = (id === 'hydroturbine') ? (1 - upgSum(s, 'hydroBuildSave')) : 1;
    /* ⚠️ 2026-10-05 · 匠作省料（perk.buildSave）：全建筑消耗 −1%/级，最多 −20%。
     *   【为什么不并进 isb / hallMul】那三个是「建筑/制度/奇观给的」减耗，这一个是
     *   **轮回商店给的**——来源不同就该独立相乘，与本函数「议事厅 × 君主制 × 大交易所
     *   × 倒置搭建」同一条乘区纪律：每条来源各守自己的定义域，谁也不踩谁。
     *   【为什么落在这里而不是 habitat.build】costOf 是面板显示与真实扣费**共用的那一份**，
     *   落在这里 ⇒ 显示的造价与扣的钱天然同源（改 habitat.build 会出现「显示不涨、实扣涨」）。
     *   ⚠️ 加了 clamp 下限 0.05：perk 只有 20 级 ⇒ 最小 0.8，数学上够不到底，
     *      但留一道闸防止将来把系数标定到 >0.95 时把造价乘成负数（那会让 pay 倒给玩家资源）。 */
    var bsb = Math.max(0.05, 1 - 0.01 * (s.perk.buildSave || 0));
    /* ⚠️ 2026-10-05 用户拍板：**去掉 `Math.ceil`，造价显示真实小数**。
     *   【为什么】原来是 `Math.ceil(2 × 1.15^n)`，而 1.15 的增长慢于取整粒度
     *   ⇒ 前几级连着两级显示同一个数（第 1→2 级都显示 3、第 3→4 级都显示 4…），
     *   看着像「升级不加消耗」。实测 raw 与显示的差：
     *     n=1 raw=2.300→3 ｜ n=2 raw=2.645→3（**与 n=1 相同**）
     *     n=3 raw=3.042→4 ｜ n=4 raw=3.498→4（**与 n=3 相同**）
     *   ⇒ 机制本来是通的（猫国 warehouse 同样是 `1.15^n` 每级付），只是被取整掩盖了。
     *   【为什么不引入浮点扣费的精度问题】`pay` 是 `s.res[k] -= c[k]` 的浮点减法，
     *   而 `enough` 已带 1e-9 容差（见那条注：手动采珊瑚 100 下会得 9.99999999999998），
     *   所以 2.3 这种小数造价不会造成「差一点点建不起来」。
     * ⚠️【但**扣费仍要整数**吗】不：现在扣的就是浮点本身（5 − 2.3 = 2.7），
     *   库存会带小数尾数。顶栏存量用 `fmtAmt`（一位小数）显示，正好接住。
     * ⚠️ 面板侧 `fmt()` 是 `Math.floor` + 千分位（给「成本/上限」用的），**会把 2.3 显示成 2** ——
     *   那是**显示层**的问题，不是这一行的问题。若面板要显示小数得单独改 fmt 的分档。
     *   本次只改 costOf（数据层），显示层要不要跟由用户另拍。 */
    var sc = scaffoldCostMul(s);
    /* ERA7（spec §6）：太空建筑（zone==='space'）建造成本吃软上限乘区——
     *   超古代科技 −20% 是第一个源，多源**乘法**叠加、地板 ×0.30（=70% 封顶）。
     *   作用域只限 space 区两座（卫星/空间站），不含奇观与地面建筑。 */
    var scm = (b.zone === 'space') ? spaceCostMul(s) : 1;
    /* ERA9（§7）：覆盖建筑的有效造价等级 = max(0, n − costOffset)。costOffset 来自 G.E.E.K
     *   改造完成（Enceladus=3 / Terra=5）；未改造时恒 0 ⇒ 本行与旧 `Math.pow(b.ratio, n)` 逐字等价。 */
    var _offset = (b && COST_OFFSET_COVERED[b.id]) ? ((s.geek && s.geek.costOffset) || 0) : 0;
    var _effN = Math.max(0, n - _offset);
    /* ERA10 市政（2026-10-20 · 虚境祭坛）：`cost.pop` 是**人口造价**，不是资源；
     *   若配置 `popCostByLevel`，数组按当前等级 n 取第 n 项（n=0 即建造 1 级）。
     *   ⚠️ 它**不进下面这条资源公式**：造价折扣（建造成本减免/太空区软上限/脚手架）
     *      都针对材料，人口不该被打折——而且 `k==='pop'` 在 SB.RESS 里没有条目，
     *      掉进循环会直接 `SB.RESS.pop.name` 抛 TypeError（整页 village 渲染炸掉）。
     *   ⇒ 原样写进返回对象（amount 不乘任何乘区），由 canAfford 特判 s.pop、
     *      pay 跳过它、habitat.build 调 consumePop 真正扣人。 */
    if (b && Array.isArray(b.popCostByLevel)) {
      if (typeof b.popCostByLevel[n] === 'number' && b.popCostByLevel[n] > 0) o.pop = b.popCostByLevel[n];
    } else if (b.cost && typeof b.cost.pop === 'number' && b.cost.pop > 0) {
      o.pop = b.cost.pop;
    }
    for (var k in b.cost) {
      if (k === 'pop') continue;
      o[k] = b.cost[k] * Math.pow(b.ratio, _effN) * hm * gm * wm * isb * hsb * bsb
        * scm * (k === 'scaffold' ? sc : 1);
    }
    return o;
  }
  /* ERA7（spec §6）：太空建筑建造成本软上限。
   * 规则：× Π(1−rᵢ)，乘积下限 0.30。乘法叠加的数学性质：每多一个 −20% 源边际递减
   * （20%→16%→12.8%…），永远摸不到 70%，×0.30 只是兜底硬地板；
   * 单源时精确兑现字面值（只有超古代 = ×0.80，不缩水——这是否决 tanh 方案的原因）。
   * ⚠️ 新减免源往这里加一行 `m *= 1 - r`，别写成加法。 */
  var SPACE_COST_FLOOR = 0.30;
  function spaceCostMul(s) {
    var m = 1;
    if (s.techs && s.techs.ancient) m *= 0.80;   // 超古代科技 −20%（叶子科技，spec §4）
    if (SB.civic && SB.civic.cardSpaceBuildSave) m *= (1 - SB.civic.cardSpaceBuildSave(s));  // ERA7 太空竞赛卡：太空建筑 −20%
    return m < SPACE_COST_FLOOR ? SPACE_COST_FLOOR : m;
  }
  /* ⚠️ 2026-10-05：成本标签改用 `fmtAmt`（**一位小数**）而不是 `fmt`（Math.floor 取整）。
   *   起因是同轮去掉了 `costOf` 里的 `Math.ceil` —— 造价变回浮点（2.3 / 2.645 / 3.042…），
   *   而 `fmt` 会把 2.3 显示成 **2** ⇒ 面板显示的数与实际要扣的数对不上，
   *   且用户报的正是「看不出升级加价」—— 显示层再取整就把这次修复抵消了。
   * ⚠️ 整数造价下两者输出相同（fmtAmt 对整数也补 `.0`）⇒ 不会影响其它读数的地方。
   * ⚠️ 别改 `fmt` 本身：它服务于**存量上限**那类天生整数的读数（仓储上限、ratio 折扣），
   *    改它会让「上限 1,200」印成「1,200.0」。这里是**成本标签单独换**。 */
  function costTxt(c) {
    var out = [];
    for (var k in c) out.push(SB.RESS[k].name + ' ' + fmtAmt(c[k]));
    return out.join(' + ');
  }
  /* ⚠️ 2026-10-05 用户需求：建造按钮「不只显示要多少，也显示已有多少」，形如「珊瑚 30/50」。
   *   用于建筑 / 科技 / 市政 / 工坊 / 奇观 的购买按钮，玩家一眼看出还差多少、攒到哪了。
   *   · 每个成本资源出一段「资源名 已拥有/需要」；多资源成本空格拼接（如「珊瑚 30/50 石梁 0/25」）。
   *   · owned 取 Math.floor：科技点 / 市政点 这类浮点池按整数展示，与顶栏同口径；
   *     资源缺失（新资源漏进 RESS 却没进 freshRun 的 res）兜底 0，绝不 NaN。
   *   · need 走 fmtAmt（一位小数），与 costTxt 同口径 —— 浮点造价（如 2.3）原样显示，不回退到 `fmt` 截断。 */
  function costOwnedTxt(s, c) {
    var out = [], k;
    for (k in c) {
      if (!c[k]) continue;
      /* ERA10 市政（2026-10-20 · 虚境祭坛）：人口造价也要在按钮上显示「有/需要」，
       * 否则玩家只看到「建造 是」却不知道这一步要吃 30 人（按钮标签 = 唯一的成本提示）。 */
      if (k === 'pop') {
        out.push('人口 ' + Math.floor((typeof s.pop === 'number' && isFinite(s.pop)) ? s.pop : 0) + '/' + fmtAmt(c.pop));
        continue;
      }
      var rawHave = s.res && s.res[k];
      /* 存档迁移会清洗旧 NaN，但面板也必须防住当前运行态的坏值：
       *    这里显示的是「已有 / 需要」，坏的已有值应回落为 0，绝不能把 NaN 印给玩家。 */
      var have = (typeof rawHave === 'number' && isFinite(rawHave)) ? Math.floor(rawHave) : 0;
      out.push(SB.RESS[k].name + ' ' + have + '/' + fmtAmt(c[k]));
    }
    return out.join(' ');
  }
  /* 资源够不够的**唯一**判据。所有「能不能建 / 学 / 解锁」的比较都必须走它，
   * 不许再裸写 `s.res[k] >= cost`。
   * 【为什么必须有容差（真实踩到，2026-09-26）】手动采集是「离散次数 × 小数常数」的累加：
   *   点「采珊瑚」100 下 = 100 × 0.1，在 IEEE754 下得到 **9.99999999999998** 而不是 10。
   *   面板显示的是 `toFixed(1)` ⇒ 玩家看到「珊瑚 10.0」，按钮却是灰的，而 **build() 内部
   *   静默返回 false**（判据不通过，没有任何报错、没有 reason）。
   *   裸 `>=` 把这种「视觉上已经凑够、只差 1e-14 尾数」判成不够，是纯噪声。
   * ⚠️ 容差只抹浮点尾数，不送资源：1e-9 相对任何成本量级都可以忽略，
   *   不会让「9.9999 珊瑚建起 10 珊瑚的巢」这种事发生（那要差 1e-4 才成立）。 */
  function enough(has, need) { return has >= need - 1e-9; }
  function canAfford(s, c) {
    /* ERA10 市政（2026-10-20）：`pop` 造价特判——人口不在 s.res 里，裸读会得 undefined ⇒
     * 虚境祭坛的按钮会永远灰着（玩家有 90 人也建不了）。 */
    for (var k in c) {
      if (k === 'pop') { if (!((s.pop || 0) >= c.pop)) return false; continue; }
      if (!enough(s.res[k], c[k])) return false;
    }
    return true;
  }
  /* ⚠️ `pay` **不扣 pop**（2026-10-20）：人口不是库存，扣人要按职业分配比例缩 jobs，
   * 那件事在 habitat.consumePop 里做（唯一实现）。这里跳过它，避免在 s.res 里
   * 凭空造一个 `res.pop` 垃圾键（那会污染存档与资源行渲染）。 */
  function pay(s, c) { for (var k in c) { if (k === 'pop') continue; s.res[k] -= c[k]; } }

  /* 季节倍率（只作用于建筑侧，见 foodRate 的注释）。
   * 历法把季节的**惩罚幅度**整体收窄 25%：mult=0.7 → 0.775，而不是把产出直接 +25%。
   * 这样「历法」的作用写的是「季节减产 −25%」，落到代码里就是减产这一项的幅度变小。
   * ⚠️【2026-09-26 修掉的吞并 bug】第二参数原名叫 reliefOverride，语义是「**顶替** tech 的 relief」
   *    （`relief != null ? 它 : tech`）。而 tick 里传进来的是 `warmRelief(s, dt)`，
   *    **没烧暖石时它也返回 0** ⇒ `0 != null` 为真 ⇒ 历法那 0.25 被整个吞掉：
   *    面板走 rates()（不传参数）读得到历法、tick 走 foodRate(s, cold, 0) 读不到，
   *    于是「面板 0.196875 / 实账 0.112500」—— 面板撒谎 1.75 倍（实测铁证）。
   *    ⇒ 现在两者是**相加而不是互斥**：relief = 历法 + 暖石顶回（上限 1，别把倍率推成负数）。
   *    判据：rates() 的每一项必须与 tick 同项在「不烧暖石」时逐位相等。 */
  function seasonMul(s, warmRelief) {
    var raw = season(s.t).mult;
    var tech = SB.tech ? SB.tech.mul(s).season : 0;
    var relief = (tech || 0) + (warmRelief || 0);
    if (relief > 1) relief = 1;
    return 1 - (1 - raw) * (1 - relief);
  }

  /* ── 历法的信息型奖励：把火山周期变成一句能背下来的算数 ──
   * 海底 lens 铁律 ③：科技不只会给效果，还负责「让玩家看见以前看不见的东西」。
   * 没掌握历法时返回 undefined —— 顶栏那一格显示的是「看不出规律」，
   * 玩家因此知道「还有一件事我没解锁」，而不是盯着一个没有解释的数字。
   * ⚠️ 读的是 seasonMul(s) 而不是 SEASONS[i].mult：玩家看到的是**他已经享受到的**
   *    那个数（历法之后寒流季已经从 0.25 缓和到 0.4375），报裸值会让他以为
   *    「学了历法反而更冷」。 */
  function seasonMeta(s) {
    var i = seasonIdx(s.t), n = SB.SEASONS.length;
    var left = SB.CFG.SEASON_TICKS - (s.t % SB.CFG.SEASON_TICKS);
    /* ⚠️ 这里也要并进暖石顶回（2026-09-30）：卡片上写的是「这一季深海藻场产出 ×N」，
     *    烧暖石时玩家实际享受到的已经是 seasonMul(s, WARM_RELIEF)，报不带 relief 的那个数
     *    就是同一个「面板撒谎」——拨开关卡片数字不变，玩家以为开关没用。
     *    取 warmBurningNow（纯查询）而不是 warmRelief（有副作用，见上方那段注）。 */
    var relief = warmBurningNow(s) ? SB.CFG.WARM_RELIEF : 0;
    return {
      idx: i, name: SEASONS[i].name, mult: seasonMul(s, relief),
      left: Math.round(left / 60),                 // 换算成「潮日」让读数有单位
      next: SEASONS[(i + 1) % n].name,
      known: !!(SB.tech && s.techs && s.techs.calendar)
    };
  }

  /* ── 暖石开关（保温法那道开关的经济侧）──
   * 返回值 = 这一瞬间**实际顶住**了多少季节 relief。顶不住的部分照旧生效：
   * 开关只表达「我想抵消」，能不能抵消取决于手里有没有暖石（伴生产物，会烧完）。
   * 【为什么烧的量按 dt 计而不是「每 tick 固定一口」】漏乘 dt 就会变成
   *    每秒烧 10 倍（STEP=0.1），一个寒流季把攒了半局的暖石一次烧光。 */
  /* 「这一瞬间开关会不会真的烧」——纯查询，无副作用。
   * ⚠️ 判据被 warmRelief 与 rates() 共用，不各写一遍：
   *    分开写的差别只在「暖石剩不到一个 need（`>= WARM_RATE`）」那几秒 —— numbers 上极小，
   *    症状却是面板写着正在烧、实际一 tick 都没烧（rates 提前扣了、结算没扣，两边对不上）。 */
  /* ⚠️【2026-09-27 用户拍板：改回「只在寒流季烧」】历史经历了三步：
   *    ① 原本就是季节闸（mult<1 才烧），当时理由是「暖石只顶回减产一个用途」；
   *    ② 2026-09-26 放开成一开就烧——理由是「冻伤看壳厚（轴 A）、减产看 t（轴 B），
   *       两条轴不重合，开关只在寒流季烧的话冰封期那一路一份暖石都吃不到」；
   *    ③ 冰封期改成「寒流季随机触发」后**两条轴重合了**（冰封只发生在寒流季），
   *       季节闸重新自洽 ⇒ 用户拍板改回来。
   *    现在的行为：寒流季烧（减产顶回 + 冰封冻伤归零共用这一份），其余季完全不耗石，
   *    玩家平流季囤的暖石不会再凭空消失。
   *    ⚠️ 判惩罚季用 `mult < 1`，**不写死季名/季数**——季节表是最容易增删的表，
   *       哪天再增删季，这条闸自己跟着表走。 */
  function warmBurningNow(s) {
    if (!s || !s.warmOn || !s.res) return false;
    if (SB.challenges && SB.challenges.warmHeatingBlocked(s)) return false;
    if (season(s.t).mult >= 1) return false;   // 只在惩罚季（mult<1，现为寒流季）烧
    return (s.res.warmstone || 0) >= SB.CFG.WARM_RATE;
  }

  /* ⚠️ 三条「顶不住」的出口都要把 warmBurning 落成 false，不能只管置 true：
   *    warmBurning 的含义是「**这一瞬间**真的在烧」。它是每帧瞬时标记（tick 开头清位），
   *    但如果只有烧得起的那一支写它，任何在 tick 之外读到它的调用方（面板的 burning
   *    提示、回归断言）都会看到上一次「烧得动」留下的 true —— 面板就会在石见底之后
   *    还亮着「正在烧」，等于骗玩家。落位是这段自己的职责，别指望调用方记得清。 */
  function warmRelief(s, dt) {
    if (!warmBurningNow(s)) { s.warmBurning = false; return 0; }
    var need = SB.CFG.WARM_RATE * (dt == null ? 1 : dt);
    if (!(s.res.warmstone >= need)) { s.warmBurning = false; return 0; }
    s.res.warmstone -= need;
    s.warmBurning = true;
    return SB.CFG.WARM_RELIEF;
  }
  function warmBurning(s) { return !!s.warmBurning; }
  /* 「种植」的藻食乘区：只放大采集者（职业侧），不碰建筑侧的藻场。
   * 单独抽成函数而不用 mul().farm 直接乘，是为了让 rates() 与 tick 走同一个函数——
   * 两处各算一遍就会出现「面板显示的值和实际进账不同」。 */
  /* ── 职业 → 工具落点 ──────────────────────────────────────────────────
   * 用户 2026-09-27 拍：**工具绑在职业上**，不是绑在资源行上。
   * 这张表回答「这个职业手里的家伙，乘在哪几个坑位上」。
   * ⚠️ 唯一那格特例是 gather：采集者挂的是 **farm 乘区**，不是某一行资源 ——
   *    食物是 `(建筑侧 + 职业侧)` 相加后再乘系数，压根不归某一行资源，
   *    所以采集者只能挂 farm，不能像其他职业那样挂一个资源 id。
   * ⚠️ miner 挂两格（金属 + 伴生暖石）：同一职业的多行吃同一套工具，将来给矿工
   *    添第二件工具时不必再手动记「暖石那行也算」。
   * ⚠️ craft / scholar / scribe **故意不在表里** —— 匠人走加工、学者产科技、
   *    书手攒市政点，手里没有青铜家伙。不写就天然不吃，比写 null 再到处
   *    防 undefined 省事，也少一条「写了却漏防」的断链。 */
  var JOB_SINK = {
    gather:      ['farm'],               // 采集者（「种植」改称农民后仍是这一格，随职业走）
    coralwright: ['coral'],              // 珊瑚匠
    quarrier:    ['stone'],              // 采石工
    miner:       ['silt', 'warmstone'],  // 矿工：金属 + 伴生暖石
    merchant:    ['luxury']              /* 商人（2026-09-29 马具实装）：乘 luxury 产出行。
                                           * ⚠️ tick 与 rates 两处都要乘（toolMul(s,'merchant')），
                                           *    只改一处 = 面板撒谎（e2e 有源码计数断言盯两处）。 */
  };

  /* 工具倍率：**按职业**查表。一件工具可同时绑多个职业（镐 = 采石工 + 矿工）。
   * ⚠️ ⚠️ 这是 2026-09-27 用户纠正的那条语义：**工具各自管自己的那条线，互不叠加**。
   *    当初斧和镐都挂在同一条 gatherMul 上，买斧头石头也涨 —— 用户明确否决了。
   *    现在 gatherMul（礁石平台 / 深潜 / 洋流增益 / 科技）是**通用采集倍率**，
   *    工具乘在它**之上**叠乘，且只落在自己声明的那几个职业上：
   *      镰 → 采集者｜斧 → 珊瑚匠｜镐 → 采石工 + 矿工
   *    ⚠️ 只有**落到同一职业**的两件工具才会合并；三件各管一个职业，
   *       买齐是三条线各 ×1.8，不是一条 ×5.83。 */
  /* ⚠️ 2026-09-28：同职业的几件工具由「叠乘」改成**相加**，形参照猫国 core.js 的
   *    effects 合并（`globalEffects[name] += effect`：同一个 key 由多个来源累加）。
   *    猫国的铁质工具就是这么算的 —— 矿锄(+0.5)与铁锄(+0.3)共用 catnipJobRatio 这个 key，
   *    一起买是 1+0.8=×1.8，铁质单独看数值小、但买到手**只会更强不会更弱**。
   *    【为什么不是叠乘】`m *= (1+bonus)` 时青铜镰+铁镰落同一职业会变成 ×1.8×1.8=×3.24，
   *    与猫国的 ×2.6 不是一个数，而且这种指数增长后面每加一件工具都会失控。
   *    【为什么不是「取最高那件」】取最高意味着买了铁镐之后青铜镐**完全作废**，
   *    玩家一算就发现先买青铜是纯亏 ⇒ 前期那件工具等于不存在（白花 200 珊瑚）。
   *    【为什么这次改动对现状是零影响】青铜三件各管一个职业、彼此不重叠，
   *    任一职业最多命中一件 ⇒ 相加结果就是 0.80，与相乘的 ×1.80 逐位相同。
   *    ⇒ 这条改动只影响「同一职业持有两件工具」这个新出现的情形。 */
  /* ── ERA4（2026-09-30 用户规格表）两条新乘区 ──────────────────────────
   * 【速生珊瑚林 / 银行】都是**职业专精建筑**：把系数乘在某一职业那一行的产出上，
   *   与工具乘区（toolMul）独立相乘 —— 这正是「职业专精」与「全局采集轴」的区别：
   *   gatherMul 那条全局轴在删礁石平台时已经拆掉（2026-09-28），这两条是另开的、
   *   与研究所在学者身上那条（`SB.BLD.instituteSci`）同构的职业级通道。 */
  function coralFarmMul(s) { return 1 + (s.lvl.coralfarm || 0) * SB.BLD.coralFarmCW; }

  /* ── 资源线专项 perk 乘区（2026-10-05 用户拍板）────────────────────────
   * 五个函数都是同一形状：`1 + 系数 × s.perk.<key>`，纯加法、无钳制、20 级封顶。
   * 【为什么全部独立成函数、不并进 gatherMul / farmMul】三条理由：
   *   ① **来源不同**：gatherMul 是「科技 T.gather + 通用采集 perk」，这里是「资源线专项 perk」，
   *      同一乘区混装会让「珊瑚专项」顺带涨石头，而资源线专项 perk 的卖点就是**只管一条线**。
   *   ② **可叠加性**：独立成轴后，珊瑚专项与通用采集 perk 是**相乘**而非互相覆盖，
   *      玩家两条都买时收益是叠乘的（×1.6 × ×1.3），符合「每条线独立投资」的直觉。
   *   ③ **单位铁律**：tick 与 rates 必须**逐字同式**调同一批函数，
   *      抽成函数才能保证「改一处两边一起变」；散写 `1+0.03*(s.perk.X||0)` 一定会漂。
   * ⚠️ 全部 `|| 0` 兜底：perk 表漏键 ⇒ undefined ⇒ NaN ⇒ 整条产线静默打死（不抛错）。
   * 【系数全是提议值】标定只动这里的 0.xx 与 config 的 costs，不动结构。 */
  /* 珊瑚礁契：珊瑚产出 +10%/级（2026-10-05 拍板，不设上限）。落点 = rates.coral + tick 珊瑚匠行。 */
  function smeltingOutMul(s) { return 1 + ((s.perk && s.perk.starSmelt) || 0); }
  function folkOutputMul(s) { return 1 + ((s.perk && s.perk.starFolk) || 0); }
  function coralPactMul(s) { return 1 + 0.10 * (s.perk.coralPact || 0); }
  /* 矿脉税契：石头 + 金属 + 暖石各 +10%/级（2026-10-05 拍板，不设上限）。落点 = rates.silt/stone/warmstone + tick 对应三行。
   * ⚠️ 一项管三线（与砂矿坑 siltBonus 同样形状），但**不碰钛**：钛是 2026-09-30 才开的新线，
   *    塞进「矿脉税契」会让老玩家以为买了就该涨钛，实际口径要等标定再说。 */
  /* 2026-10-23 潮汐之树：旧「矿脉税契」（mineTax，一键管三线）拆成矿工系 + 采石系两条独立轴：
   *   · minerPact（矿工系：金属 silt + 暖石 warmstone，+10%/级）
   *   · quarryPact（采石系：石头 stone，+10%/级）
   *   ERA6 平等主义（每名鲛人 +0.1% 矿井产出）两条轴都叠加。tick / rates 共享本批函数 ⇒ 面板===结算。 */
  function minerPactMul(s) { return (1 + 0.10 * (s.perk.minerPact || 0))
    * (SB.civic ? SB.civic.govMinePerPop(s) : 1); }
  function quarryPactMul(s) { return (1 + 0.10 * (s.perk.quarryPact || 0))
    * (SB.civic ? SB.civic.govMinePerPop(s) : 1); }
  /* 热泉炉（精铁）效率 / 热液工坊（钢）效率：+20%/级（系数 0.20）。
   * 落点 = ironFlow 的产出段（tick/rates 同式）× furnaceEffMul；钢产线（steelFlow/steelRate）× hydroshopEffMul。 */
  function furnaceEffMul(s) { return 1 + 0.20 * (s.perk.furnaceEff || 0); }
  function hydroshopEffMul(s) { return 1 + 0.20 * (s.perk.hydroshopEff || 0); }
  /* 热液工坊（钢）产出：+10%/级（与 furnaceBoost 同系数）。落点 = steelFlow/steelRate 产出段。 */
  function hydroshopBoostMul(s) { return 1 + 0.10 * (s.perk.hydroshopBoost || 0); }
  /* 学者系 / 书手系产出：+10%/级。落点 = 学者行（tick/rates 同式）× scholarPactMul；书手行（cultureRate）× scribePactMul。 */
  function scholarPactMul(s) { return 1 + 0.10 * (s.perk.scholarPact || 0); }
  function scribePactMul(s) { return 1 + 0.10 * (s.perk.scribePact || 0); }
  /* 潮田轮作：采集者藻食 +10%/级（2026-10-05 拍板，不设上限）。落点 = rates.kelp 的**职业侧**（farmMul 之后）。
   * ⚠️ 藻场（建筑侧）**不吃**这一条：farmMul 本来就只放大职业侧，注释已写明
   *    「只放大采集者（职业侧），不碰建筑侧的藻场」—— 本 perk 与它同定义域。 */
  function algaeCropMul(s) { return 1 + 0.10 * (s.perk.algaeCrop || 0); }
  /* 炉心增压：精铁 +10%/级（2026-10-05 拍板，不设上限）。落点 = rates.iron + tick steelFlow 的产出那一段。
   * ⚠️ 只乘**产出**不乘**原料扣减**（fc）——与 ironFlow 那条量纲注同源：
   *    乘在扣减上会让「炉心增压」变成「每转一份白扣两份原料」。 */
  function furnaceBoostMul(s) { return 1 + 0.10 * (s.perk.furnaceBoost || 0); }
  /* 奢侈品契：奢侈品产出 +10%/级（2026-10-05 拍板，不设上限）。落点 = tick 4c 的 S + rates.luxury 的 S（**两处都要**）。
   * ⚠️ 乘在 **S（供给）侧**，不是净速率上——净速率已被 min(S,D) 压过一遍，
   *    乘净速率会让「供给涨了但需求也涨」时面板与结算再次打架。
   * ⚠️ 仍走 baseMul（不吃 happyMul），保持反自指纪律不变。 */
  function luxuryPactMul(s) { return 1 + 0.10 * (s.perk.luxuryPact || 0); }
  function bankMul(s)      { return (1 + (s.lvl.bank || 0) * SB.BLD.bankLux) * SB.civic.bankMerchantMul(s); }

  /* 【天壳观测站】学者科技产出随本局削壳进度提高，最高 +20%。
   * ⚠️ 单位是**百分点**：返回的是 1 + x/100 的乘数（x=20 ⇒ ×1.20）。
   * 当前壳厚读 s.shell；削薄比例以 s.iceShell（本局初始壳厚）归一化，兼容轮回薄壳增益。
   * ⚠️【读的是**同一秒的快照** `s._shellSnap`，不是现场 `s.shell`】这是本条最容易被掰折的一处：
   *    tickShell 在每一 tick 的**第 8 步**才削壳，而科技产出在第 4 步就算完了 ⇒
   *    tick 用的是「削之前」的壳厚、面板（tick 之后调 rates）读到的是「削之后」的 ⇒
   *    两边差一点点（实测 1.9e-9，正好越过 e2e「tick === rates」那 1e-9 的容差）。
   *    那是标准的「面板撒谎」，而且是差值越小越难被发现的那种。
   *    ⇒ 每 tick 开头把 `s.shell` 冻成 `_shellSnap`，两条路都读它：
   *      「结算」与「面板」用的是**同一份**壳厚，`面板 === 结算` 这条铁律才守得住。
   *      rates() 在没跑过 tick 时（例如刚开局渲染第一帧）读不到快照 ⇒ 回落到 s.shell。
   * 上限由 obsMaxBonus 控制，并钳制壳厚比例，确保壳破后保持 +20%。 */
  function observatoryBonusPct(s) {
    var initial = Number(s && s.iceShell);
    if (!(initial > 0 && isFinite(initial))) initial = Number(CFG.ICE_SHELL) || 0;
    if (!(initial > 0)) return 0;
    var rawShell = s && s._shellSnap != null ? s._shellSnap : (s && s.shell);
    var sh = Number(rawShell);
    if (!isFinite(sh)) sh = initial;
    sh = Math.max(0, Math.min(initial, sh));
    var maxBonus = Math.max(0, Number(SB.BLD.obsMaxBonus) || 0);
    return maxBonus * (1 - sh / initial);
  }
  function obsSciMul(s) {
    if (!(s && s.lvl && s.lvl.observatory > 0)) return 1;
    var x = observatoryBonusPct(s);
    /* ERA6（2026-10 实装）：星空观测站升级（upg_starscope）额外 +40% 科技产出（obsSciBoost=0.40）。
     *   与壳体进度的百分点加成是**加法档**相加（0.40 = +40%），
     *   upgSum 读 UPGRADES 表的 obsSciBoost 字段，不在本函数写死。 */
    var boost = (SB.economy && SB.economy.upgSum) ? SB.economy.upgSum(s, 'obsSciBoost') : 0;
    if (!(typeof boost === 'number' && isFinite(boost))) boost = 0;
    var _obs = (SB.civic && SB.civic.cardObsSciMul) ? SB.civic.cardObsSciMul(s) : 1;  // ERA7 神不在此卡：观测站产出 ×1.5
    return (1 + x / 100 + boost) * ((typeof _obs === 'number' && isFinite(_obs)) ? _obs : 1);
  }

  function toolMul(s, job) {
    var L = SB.TOOLS || [], sum = 0, i, j;
    /* ⚠️ 必须用 Array.isArray 而不是 `job.length !== undefined` ——
     *    字符串也有 length，那样会把单职业（'coralwright'）当成「逐字比对」，
     *    于是 t.target[0] 永远对不上 want[0]（'c'）⇒ 工具买了不生效，还不报错。 */
    var want = Array.isArray(job) ? job : [job];
    for (i = 0; i < L.length; i++) {
      var t = L[i], hit = false, k;
      /* ⚠️ `t.target` **缺失**必须能过（历史上 wip 期的「马具」就是没有目标职业的；
       *    2026-09-29 马具已实装带上 target，但这层防御是一般性的，别删）。
       *    直接读 `t.target.length` 会抛 TypeError ⇒ 启动即崩、整局跑不起来。
       *    ⇒ 没有 target 的条目一律跳过：它本来就不该给任何职业加成。
       *    ⚠️ 这里是**兜底**而不是给 wip 打补丁：将来任何一件「效果还没设计」的工具，
       *       只要没写 target，都应该安静地不生效，而不是把玩家的游戏打挂。 */
      if (!t.target) continue;
      /* ⚠️ 集合**包含**判断，不是同下标比对。
       *    踩过：查询 'miner'（长度 1）去比对 target = ['quarrier','miner']，
       *    同下标比到的是 want[0]='miner' vs t.target[0]='quarrier' ⇒ 判不中，
       *    于是「买了镐，矿工产的金属一点没变」—— 不报错，纯静默。 */
      for (j = 0; j < want.length && !hit; j++) {
        for (k = 0; k < t.target.length; k++) {
          if (t.target[k] === want[j]) { hit = true; break; }
        }
      }
      if (hit && s.tools && s.tools[t.id]) sum += t.bonus;
    }
    /* ⚠️ 返回的是「倍率」而不是「乘数」：相乘时代这里是 `m *= (1+bonus)` 于是返回值是
     *    倍率本身；改成相加之后，倍率 = 1 + 各件加成之和。调用点一律写成 `基础 × toolMul()`，
     *    两边口径一致，改这行时不用动调用点。 */
    return 1 + sum;
  }

  function farmMul(s) {
    var T = SB.tech ? SB.tech.mul(s) : null;
    return (T ? T.farm : 1) * toolMul(s, 'gather');
  }
  // 采集倍率：礁石平台 + 深潜 + 洋流增益 + 科技 + 青铜工具（全部走闭合词表，不再散读 s.techs.X）
  /* ⚠️ gatherMul 里**不再有工具**：它是「采集」这条通用倍率（礁石平台 / 深潜 / 洋流 /
   * 科技 / 洋流 perk），工具那层各自乘在下面那几个坑位上（见 toolMul 的注释）。
   *    当初把斧和镐一起并进这里，买斧头会顺带涨石头 —— 2026-09-27 用户纠正：
   *    「斧子也是单独的采珊瑚加成，镐是单独的采矿/采石」。 */
  function gatherMul(s) {
    var T = SB.tech ? SB.tech.mul(s) : null;
    /* ⚠️ 2026-09-28：原来的 `(1 + (s.lvl.reef || 0) * SB.BLD.reefMul)` 那一项已随
     *    **礁石平台删除**一起拆掉（用户拍板），`SB.BLD.reefMul` 也删了。
     *    ⇒ 这里不再读任何 `s.lvl.*`，采集倍率只剩科技与 perk 两条来源。
     *    ⚠️【保留下来的教训，别丢】删掉的那一项曾经是全文件**唯一一处不加 `|| 0` 兜底**
     *       的 `s.lvl.x` 读法，而缺失的等级字段会让 `undefined * 0.08 = NaN`，
     *       顺着珊瑚 / 石头 / 砂矿 / 暖石四条产线**静默把整条经济线打成 NaN**：
     *       不抛错、不报警。将来凡在这条乘区里新加 `s.lvl.*`，兜底一个都不能少。 */
    return (T ? T.gather : 1)
      * (1 + 0.10 * (s.perk.gather || 0));
  }
  /* ── 全资源产出乘区（2026-09-28 灯塔上线）──
   * 【它和 gatherMul 不是一回事，别合并】gatherMul 是**采集**倍率，只罩得住
   *   珊瑚 / 石头 / 金属 / 暖石这四种职业采集物（藻食走 farmMul、科技、地热、
   *   市政点各有各的通道）。「全资源 +1%」要罩的是**进资源池的每一条产出行**，
   *   所以另起一条轴，乘在每条产出各行上。
   * 【两条路必须同式】tick（真正结算）与 rates（面板显示）都调它 —— 漏掉任何一条，
   *   就是「面板写着 +1%、实际进账没有」的面板撒谎。e2e 有一条断言在钉这件事：
   *   「建成灯塔后 rates() 每一项都恰好 ×1.01」。
   * 【覆盖清单】（新增一种资源进池时，这里要跟着加，否则它会静默地不吃 +1%）：
   *   珊瑚 · 石头 · 金属 · 暖石 · 精铁 · 科技 · 地热 · 藻食 · 市政点
   * ⚠️ 例外只有两处，都是有意的，别「顺手补上」：
   *   ① **口粮消耗** foodUse 不乘（那是消耗不是产出）；
   *   ② **精铁的 fc** 乘，但它同时被 rates.iron 用同一份值，两边必须一起改
   *      （ironFlow 那份是原料消耗量，乘之前先想清楚）。 */
  /* ⚠️ 2026-09-28 信仰落地 + 2026-09-28 陆地贸易落地：
   *   baseMul = 灯塔(乘) × 信仰全产加成(乘) ＋ 奇观全局加成(加) —— **不含 happy**。
   *   globalMul = baseMul × happyMul —— happy 是第二条全产轴。
   *   ⚠️ 为什么拆 baseMul：luxury 是 happy 的燃料（维持幸福度要烧它），
   *      若 happyMul 也放大 luxury 产出 → 幸福高→luxury多→幸福更高 自激（与 faith 反自指同一条坑）。
   *      所以 luxury 产出行用 baseMul，其余产出行用 globalMul。tick 与 rates 同式。 */
  function baseMul(s) {
    var m = (1 + (s.lvl.lighthouse || 0) * SB.BLD.lighthouseProd) * faithAllMul(s);
    if (SB.wonder) m += SB.wonder.globalBonus(s);
    var lg = SB.prestige ? SB.prestige.legacy() : null;
    /* ERA8 市政《信仰回响》（2026-10-18 用户拍 Q3）：本轮回旧日信仰全产加成档位 ×2
     *   （0.5%/档 → 1%/档；仅本轮回，轮回清掉 s.civics 后自动失效）。 */
    if (lg) m *= 1 + lg.oldFaithAllProductionBonus * ((s.civics && s.civics.faith_echo) ? 2 : 1);
    /* ERA9 寰宇教会政体（oldFaithMul=1.5）：旧日信仰全产档 ×1.5。
     * 轮回之终末卡（faithAllProdDouble）：信仰全产加成翻倍（装卡才 ×2）。
     * 两者都只放大于「旧日信仰全产档」这一项，不动 lighthouse/奇观/挑战乘区。 */
    m *= (SB.civic && SB.civic.govOldFaithMul) ? SB.civic.govOldFaithMul(s) : 1;
    m *= (SB.civic && SB.civic.cardFaithAllProdDouble) ? SB.civic.cardFaithAllProdDouble(s) : 1;
    if (SB.challenges) m *= SB.challenges.productionMul(s);
    return m;
  }
  function globalMul(s) {
    /* ⚠️ happyMul 排除 luxury 自身（见 happyMul 注）；faith 自身产出经 faithRate 不调 globalMul，
     *    故也不吃 happyMul —— 两条「反自指」纪律互不冲突。 */
    var m = baseMul(s) * SOCIAL.happyMul(s);
    /* 点击时间事件的全产 buff（信仰显圣）：墙钟毫秒戳，命中则所有产出 ×(1+10%)。
     * ⚠️ 走墙钟而非逻辑时间：buff 是「玩家点了一下」的实时奖励，30 真实秒，不随倍速缩水；
     *    离线补算期间若戳仍在（≤30s 真实），buff 自然生效——属 bonus，不影响 8–14h 窗核算。
     * ⚠️ `s.eventAllUntil` 缺键（旧档 / e2e 未触发）时为 undefined ⇒ 走 `&&` 短路恒为 1，安全。 */
    if (s.eventAllUntil && (typeof Date.now === 'function' ? Date.now() : 0) < s.eventAllUntil) m *= 1.10;
    /* ERA7（2026-10 实装）：政策卡《延长工时》所有职业产出 +30%（jobOutMul 走通用逐槽相乘，默认 1）。
     * 折叠进 globalMul ⇒ tick 与 rates 自动同式（面板===结算），天然覆盖珊瑚/石/金属/暖石/钛/铀/铁/钢/科技/市政点。
     * ⚠️ 副作用：铁/钢等加工产出也吃这 30%（globalMul 本就是「全资源产出」乘区）；若需把铁/钢排除出「职业产出」口径，
     *   改为只裹采集/职业那几行（更高改动风险），此处先按「全产出」口径落地。 */
    m *= (SB.civic && SB.civic.cardJobOutMul) ? SB.civic.cardJobOutMul(s) : 1;
    /* ERA9 市政《分布式主权》→ 政体星际联邦（allOutMul=0.10）：所有产出 +10%。
     * 折叠进 globalMul ⇒ tick 与 rates 同式（面板===结算），天然覆盖全资源轴。 */
    m *= (SB.civic && SB.civic.govAllOutMul) ? SB.civic.govAllOutMul(s) : 1;
    return m;
  }
  /* ERA10（2026-10-20 · 用户 ERA10 表「大统一方程」解锁）：除科技/市政/信仰外的全产加成轴。
   * 公式与旧日信仰**逐字同式**（已核 prestige.js:62/71：0.005×floor(log10(oldFaith)+1e-9)）：
   *   unifiedMul = 1 + 0.005 × floor(log10(科技点 + 市政点) + 1e-9)
   * ⚠️ 为什么单独开轴而不折进 globalMul：科技/市政产出行确实吃 globalMul（tick 科技/市政
   *    两行 + rates 同两行），折进去会误推它们自己——用户表明文「除科技、市政、信仰之外」。
   * ⚠️ 与 baseMul 里的旧日信仰项**互相独立**（一个读 meta.oldFaith，一个读本局 sci+civic），
   *    两者相乘不互斥；科技未完成时恒 1（s.techs.unified_field 门控）。 */
  function unifiedMul(s) {
    if (!s || !(s.techs && s.techs.unified_field)) return 1;
    var _v = (s.res && (s.res.science || 0) + (s.res.civic || 0)) || 0;
    if (_v <= 0) return 1;
    return 1 + 0.005 * Math.floor(Math.log10(_v) + 1e-9);
  }
  /* globalMulX = globalMul × unifiedMul —— 给「吃全产加成但不该被科技/市政排除」的产出行用。
   * ⚠️ 只有**非**科技/市政/信仰的产出行允许换成它；科技/市政两行必须继续用 globalMul。
   * ⚠️ tick 与 rates 必须同型切换（单位铁律：dt=1 时两边相等）。 */
  function globalMulX(s) {
    return globalMul(s) * unifiedMul(s);
  }
  /* ERA10（2026-10-20）：戴森球进度（0..1 小数）——**双达标取小**（用户拍 Q4）：
   *   min(太阳帆 / DYSON_SAIL_CAP, 戴森球节点 / DYSON_NODE_CAP)
   * 单一读数源：tick 通关判定、condMet('dysonPct')、星图面板都调它，不重算公式。
   * 旧档 / e2e 沙箱无键时按 0 兜底（sunSails/dysonNodes 均可能缺省）。 */
  function dysonPct(s) {
    if (!s) return 0;
    var _sail = Math.max(0, s.sunSails || 0) / (SB.CFG.DYSON_SAIL_CAP || 10000);
    var _node = Math.max(0, s.dysonNodes || 0) / (SB.CFG.DYSON_NODE_CAP || 1000);
    return Math.min(1, Math.min(_sail, _node));
  }

  /* ── 发射场共享成本/节律与独立进度的单一读数落点 ──
   * 【为什么必须是一个函数】发射场的三个量各有 2~3 处读取：
   *   总等级 → economy-tick 2f / economy-rates / hydroAlloc（europaL）
   *   节律   → economy-tick 2f / economy-rates
   *   每级热液耗 → economy-tick 2f / economy-rates / hydroAlloc（_euNeed）
   * 历史上「同一个量在三处各写一份」已经出过两次面板撒谎（潮道减耗、朱庇特耗流键错位）。
   * ⇒ 三处一律调这三个函数，任何新政策卡/科技只改这里。
   * 三座发射场共用模式、周期、总耗料口径；周期余数由 launchProcOf / setLaunchProc 按建筑 ID 分开保存。 */
  function launchBids() {
    /* 建筑表是唯一来源：挂 launchpad:true 的建筑即发射场，不另维护 id 清单
     * （那是第二份事实来源，加第四座场时必然脱钩）。 */
    var out = [], bs = SB.BUILDINGS || [];
    for (var i = 0; i < bs.length; i++) if (bs[i].launchpad) out.push(bs[i].id);
    return out;
  }
  function launchLvl(s) {
    var ids = launchBids(), n = 0;
    for (var i = 0; i < ids.length; i++) n += (s.lvl && s.lvl[ids[i]]) || 0;
    return n;
  }
  /* 发射场按级启停：停用数分别记在 launchStops[id]，所以每座场可独立调整；
   * 缺少此字段的旧状态默认全开。总启用等级统一供耗材、热液能和速率面板使用。 */
  function launchActiveLvl(s, id) {
    var total = Math.max(0, Math.floor((s && s.lvl && s.lvl[id]) || 0));
    var stops = s && s.launchStops && s.launchStops[id];
    stops = typeof stops === 'number' && isFinite(stops) ? Math.max(0, Math.floor(stops)) : 0;
    return Math.max(0, total - Math.min(total, stops));
  }
  function launchRunLvl(s) {
    var ids = launchBids(), n = 0;
    for (var i = 0; i < ids.length; i++) n += launchActiveLvl(s, ids[i]);
    return n;
  }
  /* 每座发射场各有自己的周期余数。旧档的全局余数迁到首个已建发射场；
   * 后续读写只走 launchProcs[id].sail / .node，不再让建筑等级加快进度条。 */
  function launchProcTable(s) {
    if (!s) return {};
    var ids = launchBids();
    if (!s.launchProcs || typeof s.launchProcs !== 'object' || Array.isArray(s.launchProcs)) {
      s.launchProcs = {};
      var target = '';
      for (var i = 0; i < ids.length; i++) {
        if ((s.lvl && s.lvl[ids[i]]) > 0) { target = ids[i]; break; }
      }
      if (!target && ids.length) target = ids[0];
      if (target) s.launchProcs[target] = {
        sail: typeof s.sunSailProc === 'number' && isFinite(s.sunSailProc) ? Math.max(0, s.sunSailProc) : 0,
        node: typeof s.dysonProc === 'number' && isFinite(s.dysonProc) ? Math.max(0, s.dysonProc) : 0
      };
    }
    for (var j = 0; j < ids.length; j++) {
      var p = s.launchProcs[ids[j]];
      if (!p || typeof p !== 'object' || Array.isArray(p)) p = s.launchProcs[ids[j]] = {};
      p.sail = typeof p.sail === 'number' && isFinite(p.sail) ? Math.max(0, p.sail) : 0;
      p.node = typeof p.node === 'number' && isFinite(p.node) ? Math.max(0, p.node) : 0;
    }
    return s.launchProcs;
  }
  function launchProcOf(s, id, nodeMode) {
    var table = launchProcTable(s), p = table[id];
    return p ? p[nodeMode ? 'node' : 'sail'] : 0;
  }
  function setLaunchProc(s, id, nodeMode, value) {
    var table = launchProcTable(s), p = table[id];
    if (!p) return;
    p[nodeMode ? 'node' : 'sail'] = typeof value === 'number' && isFinite(value) ? Math.max(0, value) : 0;
  }
  function resetLaunchProcs(s) {
    if (!s) return false;
    var table = launchProcTable(s), ids = launchBids();
    for (var i = 0; i < ids.length; i++) {
      table[ids[i]].sail = 0;
      table[ids[i]].node = 0;
    }
    return true;
  }
  function launchNodeMode(s) {
    return !!(s && s.launchMode === 'node' && s.techs && s.techs.adiabatic);
  }
  /* 每个运行等级每秒需要的库存原料；帆/节点模式的材料消耗分别读 UNIT 常量，热液能另走 launchHydroPer。
   * tick 与 rates 共用此表，避免面板和实际扣料分叉。 */
  function launchMaterialPer(s) {
    if (launchNodeMode(s)) {
      return {
        uranium: SB.UNIT.dysonNodeUranium || 5,
        strongProp: SB.UNIT.dysonNodeStrongProp || 3,
        thinafilm: SB.UNIT.dysonNodeThinafilm || 3,
        tiplate: SB.UNIT.dysonNodeTiplate || 30
      };
    }
    return {
      uranium: SB.UNIT.launchSailUranium || 0.5,
      strongProp: SB.UNIT.launchSailStrongProp || 0.3,
      thinafilm: SB.UNIT.launchSailThinafilm || 0.3,
      tiplate: 0
    };
  }
  /* 制造节律（秒）：CFG 基准 + 科技《空间矢量控制》−2s + 政策卡《至高指令》−2s，钳下限 1。
   * ⚠️ 卡字段走 civic.cardLaunchCycle（tech.mul 只认科技表——卡写进科技 mul 是死线）。 */
  function launchCycleOf(s) {
    var base = SB.CFG.LAUNCH_CYCLE || 10;
    var T = (SB.tech && SB.tech.mul) ? SB.tech.mul(s) : null;
    var add = (T ? (T.launchCycle || 0) : 0)
      + ((SB.civic && SB.civic.cardLaunchCycle) ? SB.civic.cardLaunchCycle(s) : 0)
      - ((s.perk && s.perk.starLaunchSpeed) || 0);
    return Math.max(1, base + add);
  }
  /* 星屑商店专属乘区：只放大太阳帆带来的热液供给。 */
  function starSailHydroMul(s) { return 1 + ((s.perk && s.perk.starSailHydro) || 0); }
  function starNuclearHydroMul(s) { return 1 + ((s.perk && s.perk.starNuclearHydro) || 0); }
  function starSolarRingMul(s) { return 1 + ((s.perk && s.perk.starSolarRing) || 0); }
  function starAlienOutputMul(s) { return 1 + ((s.perk && s.perk.starAlienOutput) || 0); }
  /* 轨道建筑每级分别放大学者与书手产出；调用侧仅套在对应职业产出项。 */
  function starOrbitalJobMul(s) {
    var orbitalLevels = ((s.lvl && s.lvl.satellite) || 0) + ((s.lvl && s.lvl.spacestation) || 0);
    return 1 + orbitalLevels * ((s.perk && s.perk.starExploreScholar) || 0);
  }
  /* 星屑加速只作用在卫星/空间站的探索项，不放大基础探索和其他来源。 */
  function starSpaceExploreMul(s) { return 1 + ((s.perk && s.perk.starExplore) || 0); }
  /* 恩克拉多斯与泰拉阶段按树中累计百分比缩短时长；新节点上限 20%，旧档额外等级保留。 */
  function starTerraformDuration(s, base) {
    var reduction = Math.max(0, Math.min(0.95, (s.perk && s.perk.starTerraform) || 0));
    return Math.max(0, base || 0) * (1 - reduction);
  }
  /* 每级每秒热液能耗（flow）：帆模式与节点模式均为 4；再乘政策卡《节能减耗》（−50% ⇒ ×0.5）。
   * tick / rates / hydroAlloc 都调它，绝不各写一份。 */
  function launchHydroPer(s) {
    var base = launchNodeMode(s) ? (SB.UNIT.dysonNodeHydro || 4) : (SB.UNIT.launchSailHydro || 4);
    var m = (SB.civic && SB.civic.cardLaunchHydroMul) ? SB.civic.cardLaunchHydroMul(s) : 1;
    return base * m;
  }
  /* 冻伤减免 = **这一瞬间暖石在烧**（2026-09-26：暖壳石 / hearth 随骨材线一并删除，
   * 减免口从「建筑等级」换轴到「消耗品」）。
   * 【为什么读 warmBurning 而不是自己再算一遍】warmRelief 在第 5 步就把 warmBurning 落位了，
   * 第 7 步冻伤才轮到，同一 tick 内先后有序。若这里重写「开关开了没、石够不够」，
   * 就会出现与 warmRelief 差一 tick 的读数（面板写着正在烧、结算按没烧算）。
   * ⚠️ 绝不能退回 `s.lvl.hearth * SB.BLD.warm`：键一删，`undefined * 0.10 = NaN`
   *   ⇒ warmCap NaN ⇒ 顺着 FREEZE_CHANCE 污染整条结算链。这类断链不抛错也不报警，
   *   症状是「冰封期莫名其妙掉人」，排查时极易误判成「设计上那道墙」。
   * 【0.5 是什么】结算里是 (1 − warmCap × 2)，0.5 恰好把概率打到 0 ⇒ 烧着就不冻死。 */
  function warmCap(s) {
    return warmBurningNow(s) ? SB.CFG.WARM_FREEZE_CAP : 0;
  }
  /* 口粮消耗：保温巢（深海鱼牧场）省耗 −0.5%/级，**线性叠加、无减免上限**
   * （2026-09-26 用户拍板对齐猫国 pasture 的 catnipDemandRatio，撤掉本作自造的 60% 护栏）。
   * ⚠️ 渲染层用同一个函数标红：两处各算一遍就会出现「面板说够吃、实际在饿死」。
   * 【那一道 Math.min 是什么】它只夹在 **100%**（减免到满为止），不是设计护栏——
   *   少了它，暖壳石叠到 200 级以上时 (1-save) 变负数 ⇒ 消耗翻成产出 ⇒ 白送口粮，
   *   而且不报任何错。防御边界归防御边界，别把它读成「还剩一道 −60% 上限」。 */
  function foodUse(s) {
    /* 农奴制（2026-09-30 封建主义卡）：每级藻场给牧场效果 +1%——
     * 乘在 foodSave 那一截上（封顶 100% 的 Math.min 照旧在外面兜底）。 */
    var serf = (SB.civic && SB.civic.serfWarmMul) ? SB.civic.serfWarmMul(s) : 1;
    var save = Math.min(1, (s.lvl.warmnest || 0) * SB.BLD.foodSave * serf);
    /* 2026-10-25 用户拍板：首名族民免口粮——开局 pop=1 且藻场未建时不饿死，
     * 计费人口 = pop − 1（s.pop 由生育 s.pop++ 整数递增，Math.max 防 0/1）。 */
    return Math.max(0, s.pop - 1) * SB.CFG.FOOD_PER * (1 - save)
      * (1 - (SB.civic ? SB.civic.govMermanFoodMul(s) : 0));   // ERA6 联邦制：鲛人食物消耗 −10%
  }
  /* 藻食产出。逐句照抄猫国 game.js:3666 calcResourcePerTick("catnip") 的语句顺序——
   * 顺序本身就是设计，不能重排：
   *   3670  perTick = getEffect("catnipPerTickBase")          ← 建筑侧（藻场）
   *   3685  perTick *= calendar.getWeatherMod(res)            ← 季节乘在这一步，只作用于建筑侧
   *   3700  perTick += village.getResProduction()["catnip"]   ← 职业侧（采集者）后加，
   *                                                            因此 **不被季节打折**
   *   3711  perTick *= 1 + getEffect("catnipRatio")           ← 喷口导流堤放大两条来源
   * 把季节挪到「(建筑+职业)×季节」会让采集者在寒流季集体饿死，与原作不符。 */
  function foodRate(s, cold, relief) {
    /* relief：暖石开关这一瞬间顶回来的部分（tick 里算好传进来）。
     * ⚠️ 只顶建筑侧那只季节乘区（seasonMul），与「职业侧不吃季节」是同一条纪律——
     *    把暖石的效果做成全局乘区，寒流季的采集者会跟着一起被抬高，
     *    那看起来像「开关很划算」，实际是绕过了季节设计。 */
    var byBuild = s.lvl.kelp * SB.BLD.food
      * ((SB.civic && SB.civic.serfKelpMul) ? SB.civic.serfKelpMul(s) : 1)  // 农奴制：每级牧场给藻场 +1%
      * seasonMul(s, relief); // 建筑侧：吃季节（历法收窄减产 + 暖石顶回）
    /* ⚠️ 2026-10-21 修「机器人分配到农民，藻食不涨」（用户实测：其它职业都涨，只有藻食不动）：
     *    这一行原先直接读 `s.jobs.gather`，**绕过了 effJobs** ⇒ 机器人被算进了珊瑚匠/矿工/
     *    采石工那些走 `j = effJobs(s)` 的行，唯独藻食这条漏掉。rates() 与 tick() 都调本函数，
     *    所以面板和实账一起错——不是「面板撒谎」，是**两头都少算机器人**。
     *    ⇒ 改成读 `effJobs(s).gather`（含 人类 + 机器人×robotMult）。
     *    ⚠️ **不能再乘 folkOutputMul**：effJobs 内部已经乘过一次（folk.js:355），再乘就是双重放大。
     *    ⚠️ folk.js 在 index.html 里排在 economy.js 之后（222 vs 232）⇒ 加载期读不到 SB.folk，
     *       必须运行期取值并带守卫；万一 folk 未就绪，回落到旧式算式（行为与改前逐位相同）。 */
    var _ejF = (SB.folk && SB.folk.effJobs) ? SB.folk.effJobs(s) : null;
    var byJob = (_ejF ? (_ejF.gather || 0) : (s.jobs.gather * folkOutputMul(s)))
      * SB.UNIT.kelp * farmMul(s) * algaeCropMul(s);  // 职业侧：不吃季节；farm 乘区 + 潮田轮作 perk
    /* 只放大食物，别把 gatherMul（礁石平台/深潜/洋流增益）乘进来——
     * 那些倍率是「采集产出」的，礁石平台不该让藻场增产。
     * 之前错乘进来，食物产出虚高到 38/秒而消耗只有 2.6/秒，
     * 藻食全都撞在仓储上限上白流，生育却仍被住房那道墙卡死。
     * 【2026-09-26】住房墙已按用户要求**恢复**（软容量那版实测几乎没有约束力），
     * 现在生育受「口粮 + 住满」两道门管，见第 6 步与 economy.isFull。 */
    return (byBuild + byJob) * SOCIAL.companyMul(s, 'kelp') * (cold || 1)
      * (1 + (s.lvl.weir || 0) * SB.BLD.foodWeir)                // 增旋钮：两条来源一起放大
      * globalMulX(s)                                          // 全资源乘区（灯塔/信仰/奇观/政体/大统一方程；与 rates 同式）
      * ((SB.civic && SB.civic.cardFoodOutMul) ? SB.civic.cardFoodOutMul(s) : 1);  // ERA2-7：庄园制卡 ×1.20（乘区，tick/rates 同源）
  }
  /* ERA2-7 扩卡（2026-10-22 实装）：科技产出（每秒，未乘挑战乘区），与 rates().science 的「基项」完全同构。
   * 落点：启蒙沙龙卡把 15% 科技产出转为市政点——tick 与 rates 都读本函数，保证面板===结算。
   * ⚠️ 此函数只返回 scholar + 市政卡 cv.science + 商人副产 + 学校 + 旧日潮纹碑石 那份「每秒基项」，
   *    不含挑战乘区（challenge）；挑战乘区由调用方（tick 的 _challengeSciCulture / rates 的 scienceCultureMul）补乘。 */
  function sciOut(s) {
    var lg = SB.prestige ? SB.prestige.legacy() : null;
    var j = (SB.folk && SB.folk.effJobs) ? SB.folk.effJobs(s) : { scholar: 0, merchant: 0 };
    var cv = (SB.civic && SB.civic.flow) ? SB.civic.flow(s) : null;
    var Tr = (SB.tech && SB.tech.mul) ? SB.tech.mul(s) : null;
    var lgMul = lg ? lg.relicScienceMul * (1 + lg.shopScienceBonus) : 1;
    var scholar = (j.scholar || 0) * SB.UNIT.sci * starOrbitalJobMul(s)
      * (1 + libraryLevel(s) * SB.BLD.sciRatio
           * ((SB.civic && SB.civic.libraryMul) ? SB.civic.libraryMul(s) : 1)
        + (s.lvl.institute || 0) * (SB.BLD.instituteSci + upgSum(s, 'instituteSci'))
           * ((SB.civic && SB.civic.universityMul) ? SB.civic.universityMul(s) : 1)
        + upgSum(s, 'pressSci')
        + (s.lvl.researchlab || 0) * SB.BLD.researchLabSci
        + upgSum(s, 'algalfarmSci') * (s.lvl.kelp || 0))
      * obsSciMul(s)
      * ((SB.wonder) ? SB.wonder.cutterSciMul(s) : 1)
      * (1 + (s.lvl.satellite || 0) * (SB.BLD.satelliteScholar || 0))
      * ((SB.wonder) ? SB.wonder.voyagerScholarMul(s) : 1)
      * ((SB.wonder && SB.wonder.khalifaScholarMul) ? SB.wonder.khalifaScholarMul(s) : 1)
      * ((SB.wonder) ? SB.wonder.throneSciMul(s) : 1)
      * (Tr ? Tr.sci : 1)
      + (cv ? (cv.science || 0) : 0)
      + ((s.civics && s.civics.market) ? (j.merchant || 0) * (SB.BLD.marketJobSci || 0) : 0)
      + ((s.lvl.school || 0) > 0 ? (s.pop || 0) * (s.lvl.school || 0) * (SB.BLD.schoolMermanSci || 0) : 0);
    var withMul = scholar
      * ((SB.civic && SB.civic.cardSciOutMul) ? SB.civic.cardSciOutMul(s) : 1)
      * ((SB.civic && SB.civic.govSciOutMul) ? SB.civic.govSciOutMul(s) : 1)
      * ((SB.companyMul) ? SB.companyMul(s, 'sci') : 1)   // 与 tick 4a 同源（科技公司的科技加成）
      * globalMul(s)
      * lgMul;
    return withMul + (lg ? lg.oldTideSteleScienceRate : 0);
  }
  /* 地热产出：热泉井 × 匠人 × 环境系数 × 点火术， **再减去全城维护**。
   *
   * 维护这一减是「两条路线有没有意义」的支点。没有它，每一级建筑都是对破壳系数
   * 的零成本投资，于是理性流（全建）单调地赢过燃料流（少建多烧）——实测无论怎么
   * 调 MIRACLE_RATE（1.10→6.0）、COEF.LVL/MIR 权重、还是给祭坛加供能上限，
   * 两条策略的顺序都不变（0.78-0.99×），快的一直是全建那一侧。
   *
   * 扣的是「净产出」而不是「库存」：库存扣到 0 就停，没有约束力；
   * 净产出被压下去才会真的让祭坛等级上不去（祭坛等级 = 净产出能养得起几级）。
   * 这样堆建筑与升祭坛就抢同一份地热，取舍才成立。 */
  /* ⚠️ 2026-09-28：**热泉井已删除**（用户指令：整条地热线「等着重新设计」）⇒ 地热目前
   *    **没有任何产出口** ⇒ 本函数**恒返回 0**。
   *    【这不是「暂时为 0 等修复」，是「地热线本身待重设」】：重设时把下面那段旧的产出口
   *    算式换回第一行即可，调用点（tick / rates / shell.miracleCap）都不用动。
   *    【为什么保留函数而不是删掉】祭坛容量、祭坛等级、凿壳进度全都读它，删掉会连着
   *    shell.js 那条链一起塌；恒 0 至少表达的是明确的「没有」，而不是 NaN / undefined。
   *    【⚠️ 原来这两行为什么必须改，别照抄】它们是全文件**唯一不带 `|| 0` 兜底**的 `s.lvl.*`
   *       读法。现在这个键连定义都没了 ⇒ `s.lvl.geyser <= 0` 变成 `undefined <= 0`
   *       （**false，所以不 return**），接着 `undefined * 0.010 * 0 = NaN` ⇒ 地热池被
   *       NaN 污染 ⇒ 祭坛一秒都没开过，而不抛错、不报警。**删掉任何一座建筑，都必须回手
   *       扫一遍所有 `s.lvl.x` 的读法**，这里就是活样本。 */
  function fuelRate(s, cold) {
    return 0;   // ← 地热线重设时，在这一行换成下面的算式
    /* var T = SB.tech ? SB.tech.mul(s) : null;
     * var gross = (s.lvl.geyser || 0) * SB.BLD.fuel * (s.jobs.craft || 0) * cold * (T ? T.fuel : 1); */
    /* 完整算式（含维护扣减），重设时配这一行一起换回：
     *   return Math.max(0, (gross - SB.BLD.upkeep * lvlSum(s)) * globalMul(s));
     * ⚠️ 维护那一减是「堆建筑 vs 升祭坛」这条取舍的支点，重设时**不要顺手删掉**：
     *    没有它，每级建筑都是对破壳系数的零成本投资，实测无论怎么调 MIRACLE_RATE /
     *    COEF 权重 / 祭坛供能上限，理性流（全建）都单调赢过燃料流（少建多烧）。
     * ⚠️ 末尾那个 globalMul 是灯塔的全资源乘区（与 tick 那行同源）；收在函数内部是
     *    故意的：fuelRate 同时被 tick 与 rates 调用，乘区放内部 ⇒ 两条路自动同式。 */
  }

  /* 加工的「窗口流量」：dt 秒之内能转多少。
   * 抽成函数是为了让 tick（传真实 dt）与 rates()（传 1，即一秒窗口）共用同一条判据——
   * 否则两边各写一遍 `Math.min(速率, 库存)`，一侧漏乘 dt 就会悄悄漂移成两套经济。
   * 限流按 dt 等比缩放：库存只剩一小半时，这一窗口也只转那一小半，不会把库存抽成负数。 */
  /* ⚠️ 原 boneFlow（珊瑚→骨材）已于 2026-09-27 随骨材线整体删除，函数体一并移除。
   *    它要求的「工坊 lv1 + 匠人」这条加工入口现在**没有任何产出附着**——
   *    工坊的新内容是下一步要设计的（见 config.js workshop 那处注）。 */
  /* ⚠️ 2026-09-28 用户拍板「建筑自动」⇒ 驱动方式从「匠人」改成「建筑本身」：
   *    原来还要 `s.jobs.craft > 0` 才转，现在只要熔炉建成就一直转，不占人口、不派人。
   *    ⚠️ 代价（尚未拍板，见下面三个 ⚠️）：熔炉变成一台**不停吃料的机器**，
   *       只要库存非空就每窗口抽 `rate` —— 现有 `Math.min(rate*dt, 库存)` 那条限流
   *       保证它抽不成负数，但也保证它会**一直抽到库存见底**。
   *    ⚠️ ① 「匠人会不会彻底没活干」→ **不会**：fuelRate（热泉炉产地热）同样乘
   *       `s.jobs.craft`（见上面那行），匠人的出口从「转铁」缩到「产地热」但是仍然存在。
   *    ⚠️ ② 速率**随运行座数线性**（2026-09-30 用户「这行应该是选择开几个」）：
   *       原来不乘等级，1 座与 13 座产的一样多 —— 那样「开几座」就没有意义。
   *       现在 `rate × 运行座数`，运行座数由玩家用 −/＋ 调（state.furnaceStop 记停了几座）。
   *       ⇒ **精铁产出从「单炉速率」变成「N × 单炉速率」**，这是「开几座」这条需求的
   *          必然结果（属数值面）；基础单价 SB.UNIT.iron 未动。下游精铁成本若显得过于便宜，
   *          那是用户标定的范畴，不在这里顺手改常数。
   *    ⚠️ ③ 暖石是**第二个原料**（用户规格原文「消耗金属和暖石生成铁」）。
   *       ⚠️ ⚠️ **这条与 config.js 那处「一份暖石只许有一个消耗口」的规格相冲突**：
   *           2026-09-26 删掉暖壳石时留下的规矩是「暖石的全部去处就是保温法开关，
   *           一个消耗口」，而熔炉现在是第二个 ⇒ 同一份暖石会被保温法和熔炉各抢一份。
   *           用户当次的规格优先，这里按「暖石 = 两口」实现，但**这条冲突必须回头裁决**。
   *    ⚠️ ④ 配比暂时是 **1:1 不限量**：暖石伴生只有 SB.UNIT.warmstone = 0.05/人/秒，
   *       而转一份要 0.06/秒 ⇒ 单个矿工**供不上一座炉子**，炉子会在暖石上长期卡着。 */
  /* ERA6（2026-10 实装）：暖石消耗折扣。refine / specfuel 两科研各让暖石扣减 ×0.7，
   *   两者叠加（都研究了就是 ×0.49）。集中在这里算一个乘子，IronFlow 的暖石门控、
   *   tick 的暖石实扣、hydroAlloc / steelFlow 的汽轮机耗暖石三处**共用同一乘子**，
   *   保证「面板===结算」不被拆成两套口径。
   * ⚠️ 只读 s.techs.refine / s.techs.specfuel（已掌握的科技），不散读别处。 */
  function warmEff(s) {
    var f = 1;
    if (s && s.techs && s.techs.refine) f *= 0.7;
    if (s && s.techs && s.techs.specfuel) f *= 0.7;
    return isFinite(f) && f > 0 ? f : 1;
  }

  /* 面板用：某设备**每秒暖石消耗**（额定口径，供巢穴页热泉炉 / 热液汽轮机控件行标注）。
   * 【为什么要它】用户 2026-10-16：「不要在这里写文案，直接在消耗暖石的地方写明消耗多少」——
   *   消耗量要落在**真正吃石的那一行**（设备的「开几座」控件行），而不是到环境卡说明段里去解释。
   * 【额定 ≠ 实扣】这里给的是「满转口径」（不按库存打折），回答「开这几座要烧多少」；
   *   与「这一 tick 实际扣了多少」是两件事（后者已并入顶栏净速率）。
   *   本式与引擎侧扣费（热泉炉 ironFlow 的暖石门控、汽轮机 steelFlow 的实扣）同源同式，
   *   也与顶栏净速率 rates().warmstone 里并入的那笔扣减同一口径 —— 几处数字必须一致，
   *   否则又是「同一个量两个面板两种说法」（面板撒谎家族）。纯函数只读 s。 */
  function warmDraw(s, id) {
    if (!s) return 0;
    if (id === 'hydroturbine') {
      var t = Math.max(0, (s.lvl.hydroturbine || 0) - Math.max(0, s.turbineStop || 0));
      return t * (SB.UNIT.hydroWarm || 0) * warmEff(s);
    }
    if (id === 'furnace') {
      var lv = s.lvl.furnace || 0;
      if (!(lv > 0)) return 0;
      var run = Math.max(0, lv - Math.max(0, s.furnaceStop || 0));
      if (run <= 0) return 0;
      var T = SB.tech ? SB.tech.mul(s) : null;
      var e = (T ? T.bldEff : 1);
      var cold = isCold(s) ? coldSeasonMul(s) : 1;
      var rate = SB.UNIT.iron * run * (T ? T.smelt : 1) * cold * (T ? T.craft : 1);
      return rate * e * warmEff(s);
    }
    return 0;
  }

  /* 面板用：某设备**每秒吃掉的每样原料**（额定 / 满转口径）。
   * 【为什么要有它】用户 2026-10-17：「所有有消耗的建筑，消耗的东西也要写明，不光是暖石」——
   *   之前只给暖石一项，导致热泉炉看着只烧石头（其实还吃金属）、热液工坊整行一个消耗都没标。
   *   三处 UI（巢穴页控件行 / 建筑信息卡）都读这一处，别再各写一份。
   * 【三个数与各自的结算式同源 —— 面板===结算家族】
   *   暖石  = warmDraw（汽轮机 turL×hydroWarm×warmEff；热泉炉 fc 口径×bldEff×warmEff）；
   *   金属  = 热泉炉 `fc × bldEff`（economy-tick.js:157 的扣除式）、热液工坊 `shopDraw × steelMetal × bldEff`
   *           （steelFlow 的 metalWant 同式）—— bldEff 是「同产出只耗 e× 原料」的效率折扣，必须跟着扣；
   *   热液能 = 工坊需求 `运行座数 × hydroShopLvl`（满转口径；flow 不储存，停产即 0）。
   * 【额定 ≠ 实扣】与 warmDraw 同纪律：这里回答「这几座开满要烧多少」，不按库存打折；
   *   实际那一 tick 因缺料降产的数字在顶栏净速率里。纯函数只读 s。 */
  function consumeRates(s, id) {
    var out = { metal: 0, warm: 0, hydro: 0, kelp: 0, iron: 0, titanium: 0, uranium: 0 };
    if (!s || !s.lvl) return out;
    var T = SB.tech ? SB.tech.mul(s) : null;
    var e = (T ? T.bldEff : 1);
    out.warm = warmDraw(s, id);      // 只有汽轮机 / 热泉炉 > 0
    if (id === 'furnace') {
      var flv = s.lvl.furnace || 0;
      var frun = Math.max(0, flv - Math.max(0, s.furnaceStop || 0));
      if (flv > 0 && frun > 0) {
        /* 与 ironFlow 的 rate 完全同式（那里是「转几份/秒」，这里乘 bldEff 得「吃几吨金属/秒」）。 */
        var cold = isCold(s) ? coldSeasonMul(s) : 1;
        var frate = SB.UNIT.iron * frun * (T ? T.smelt : 1) * cold * (T ? T.craft : 1);
        out.metal = frate * e;
      }
    } else if (id === 'hydroshop') {
      /* ⚠️ 工坊这里给的是**需求（满转）**而不是 hydroAlloc 的 shopDraw（已被供给打折）。
       *   同 warmDraw 的额定纪律：这一行回答「这几座开满要多少能/多少金属」，
       *   汽轮机不够、工坊被饿着的情况在顶栏净速率与热液能面板里看，不在这行重复打折
       *   （否则「开几座」这个控件就变成在问一个会随供给自己变小的数，没法用来规划）。 */
      var shopL = Math.max(0, (s.lvl.hydroshop || 0) - Math.max(0, s.hydroshopStop || 0));
      out.hydro = shopL * (SB.UNIT.hydroShopLvl || 0);
      out.metal = out.hydro * (SB.UNIT.steelMetal || 0) * e;
    } else if (id === 'spacestation') {
      /* ERA7（2026-10-17 · spec §5）：空间站每级耗 2 热液能/秒（额定口径，按运行座数）。
       *   与 hydroAlloc 的 stationDraw 同源同式（运行座数 = 等级 − spacestationStop）。 */
      var ssL = Math.max(0, (s.lvl.spacestation || 0) - Math.max(0, s.spacestationStop || 0));
      out.hydro = ssL * (SB.BLD.stationHydro || 0);
    } else if (id === 'satellite') {
      /* ERA7（2026-10-18 · 用户纠正补）：轨道卫星每级耗 1 热液能/秒（额定口径，按运行座数）。
       *   与 spacestation 同源同式（运行座数 = 等级 − satelliteStop）。 */
      var _satL = Math.max(0, (s.lvl.satellite || 0) - Math.max(0, s.satelliteStop || 0));
      out.hydro = _satL * (SB.BLD.satelliteHydro || 0);
    } else if (id === 'biomatlab') {
      /* ERA8：生物材料研究所额定每秒消耗四种生产原料，扣料端都乘 bldEff；
       * 热液能由 hydroAlloc 的 labDraw 分配，按等级额定需求展示，不随供给不足而缩小。 */
      var labL = Math.max(0, (s.lvl.biomatlab || 0) - Math.max(0, s.biomatlabStop || 0));
      out.kelp = labL * (SB.BLD.biomatlabKelp || 0) * e;
      out.iron = labL * (SB.BLD.biomatlabIron || 0) * e;
      out.titanium = labL * (SB.BLD.biomatlabTi || 0) * e;
      out.uranium = labL * (SB.BLD.biomatlabU || 0) * e;
      out.hydro = labL * (SB.BLD.biomatlabHydro || 0);
    }
    return out;
  }

  function ironFlow(s, cold, dt) {
    var lv = s.lvl.furnace || 0;
    if (!(lv > 0)) return 0;
    /* 热泉炉「开几座」（2026-09-30）：运行座数 = 等级 − 停用数，夹到 [0, lv]。
     *   全停（run=0）等价于原来的 `furnaceOn === false`，两条路（tick 结算 / rates 面板）
     *   都汇在这一处，门加这里天然同源。老档的布尔 furnaceOn 在 state.migrateRun 换算。 */
    var run = Math.max(0, lv - Math.max(0, s.furnaceStop || 0));
    if (run <= 0) return 0;
    var T = SB.tech ? SB.tech.mul(s) : null;
    /* bldEff（建筑原料效率，默认 1；「热泉回流」=0.6）：同产出只耗 e× 原料 ——
     *   产能（rate*dt）不变，但资源上限放宽到 ÷e，使 fc 能顶到产能、而实际扣减只 fc×e。
     *   与「铁器/黑烟囱」smelt（产出乘区）分工明确：那是多产，这是省料。 */
    var e = (T ? T.bldEff : 1);
    var rate = SB.UNIT.iron * run * (T ? T.smelt : 1) * cold * (T ? T.craft : 1)
      /* ERA9 血肉苦弱卡（resOutMul.iron=1.3）：精铁产出 +30%（装卡才生效）。 */
      * (SB.civic && SB.civic.cardResOutMul ? SB.civic.cardResOutMul(s, 'iron') : 1);
    /* 两种原料取**较小**的库存（已按效率放宽 ÷e）：哪样先见底就按哪样停，不会把一样抽成负数再白吃另一样。
     * ⚠️ 暖石门控同步乘 warmEff（refine/specfuel 降耗）：实际每吨铁耗暖石变少，同一份暖石能撑更多铁，
     *   门控必须跟着放宽，否则会「有暖石却不产铁」的假缺料；tick 实扣那行用同一个 warmEff 与之对应。 */
    return Math.min(rate * dt, s.res.silt / e, s.res.warmstone / (e * warmEff(s)));
  }

  /* ERA3 热液能系统（2026-09-29 起；2026-10-05 重做为 **flow 模型**）：
   * 热液能 = 电力式瞬态流，**不被储存**：汽轮机每台每 tick 产 `hydroOut` 流（受暖石门控），
   * 热液工坊 / 天穹钻机当场从这一 tick 的流里取用，取多少用多少，不留库存、不跨 tick 累积。
   * 优先级（用户拍板）：工坊先吃满，天穹钻机之后由自动化钻探取流，再分配给空间站等设备。
   * 纯函数 hydroAlloc 同时驱动 tick（steelFlow 副作用版）与 rates（steelRate 非变异版）⇒ 面板===结算。
   * 同时返回开启负载的额定需求与供需净额（供给 − 需求，可为负），供界面诊断短缺与停摆。
   * ⚠️ 数值为待标定默认（config SB.UNIT.hydroOut / hydroWarm / hydroShopLvl / steelPerHydro / steelMetal）。 */
  /* 砂矿坑本身可以在巢穴面板停用。基础矿脉加成与自动化钻探都只数运行中的矿坑。
   * 自动化钻探按运行矿坑占总矿坑等级的比例放大钛/铀产线，最多 ×2；每座运行矿坑耗 0.3 热液能/秒。 */
  function activeSiltpit(s) {
    var total = Math.max(0, Math.floor((s && s.lvl && s.lvl.siltpit) || 0));
    var stopped = Math.max(0, Math.floor((s && s.siltpitStop) || 0));
    return Math.max(0, total - Math.min(total, stopped));
  }
  function autoDrillCount(s) {
    if (!s || !(s.upgrades && s.upgrades.upg_autodrill)) return 0;
    return activeSiltpit(s);
  }
  function autoDrillOutputMul(s) {
    var total = Math.max(0, Math.floor((s && s.lvl && s.lvl.siltpit) || 0));
    return s && s.upgrades && s.upgrades.upg_autodrill && total > 0
      ? 1 + autoDrillCount(s) / total : 1;
  }
  /* 工坊也按建筑停用数量运行。基础工艺效率和工业机器人加成都只计算开启的工坊；
   * 工业机器人每座开启工坊获得自己的 +100% 份额，总加成最多 ×2。 */
  function activeWorkshops(s) {
    var total = Math.max(0, Math.floor((s && s.lvl && s.lvl.workshop) || 0));
    var stopped = Math.max(0, Math.floor((s && s.workshopStop) || 0));
    return Math.max(0, total - Math.min(total, stopped));
  }
  function industrialRobotOutputMul(s) {
    var total = Math.max(0, Math.floor((s && s.lvl && s.lvl.workshop) || 0));
    return s && s.upgrades && s.upgrades.upg_indrobot && total > 0
      ? 1 + activeWorkshops(s) / total : 1;
  }

  function hydroAlloc(s, dt) {
    /* ⚠️ 热液汽轮机「开几座」（2026-10-07）：运行座数 = 等级 − 停用数（state.turbineStop），
     *   与热泉炉 furnaceStop 同口径。停产的汽轮机既不再供流、也不再参与暖石门控。 */
    var turL = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0)),
        shopL = Math.max(0, (s.lvl.hydroshop || 0) - (s.hydroshopStop || 0)),
        /* ERA7：核热厂（不烧暖石的新热液源）与空间站（耗流方）都参与流分配，早退判据要带上。 */
        fisL = s.lvl.fissionplant || 0,
        staL = s.lvl.spacestation || 0,
        /* ERA7（2026-10-18 · 用户纠正补）：轨道卫星每级耗 1 热液能/秒，与空间站同口径，
         *   运行座数 = 等级 − satelliteStop（停掉的卫星不耗流、也不产星空）。 */
        satL = s.lvl.satellite || 0,
        satRunL = Math.max(0, satL - (s.satelliteStop || 0)),
        /* ERA8：泰坦星气云采集站（新热液源）与生物材料研究所/工业机器人（耗流方）同上。 */
        tcL = s.lvl.titancloud || 0,
        labL = Math.max(0, (s.lvl.biomatlab || 0) - Math.max(0, s.biomatlabStop || 0)),
        robotL = (s.upgrades && s.upgrades.upg_indrobot) ? activeWorkshops(s) : 0,
        /* ERA8（2026-10-19 · B7）：机器人充能站每级耗 8 热液能/秒（BUILDINGS.robotbay 的单元运转耗）。 */
        bayL = s.lvl.robotbay || 0,
        /* ERA9（2026-10-21）：三座发射场每级耗流随模式变化：帆与戴森节点均为 4 热液能/秒。
         *   最低优先级，断流只停耗（与空间站同口径）。
         * ERA10 市政（2026-10-20）：按**三座发射场启用等级总和**（欧罗巴 + 泰拉 + 恩克拉多斯星轨道发射场），
         *   单位耗流走 launchHydroPer(s)——政策卡《节能减耗》−50% 只在那一个函数里乘一次，
         *   本处/hydroAlloc 之外的 tick·rates 都不许自己再乘（三处同源铁律）。 */
        europaL = launchRunLvl(s),
        /* ERA9（2026-10-19）：星球重构机 G.E.E.K 运转耗（每 s 耗 40 热液能流）。
         *   与天穹钻机同纪律——只有「已建成且手动启动」才占流；否则面板会谎报它在吃能。 */
        geekOwned = !!(SB.wonder && SB.wonder.owned(s).wonder_geek),
        geekOn = !!(s.geek && s.geek.geekOn),
        _adCount = autoDrillCount(s);
    /* ⚠️ 提前返回也必须**补齐全部键**（含三个 Rate）：少一个键，读它的人拿到 undefined
     *    而不是 0 —— steelFlow 的 `s.res.hydro = HF.supplyRate` 会把顶栏主数写成 undefined
     *    （解了 metalrefine 但一台汽轮机都没建时就是这样），rates().hydroSupply 同理。
     *    这种缺键不报错、只在面板上变成 NaN/undefined，属于「面板撒谎」家族。 */
    if (turL <= 0 && shopL <= 0 && fisL <= 0 && staL <= 0 && tcL <= 0 && labL <= 0 && robotL <= 0 && bayL <= 0 && satRunL <= 0 && europaL <= 0 && _adCount <= 0 && (s.sunSails || 0) <= 0 && !(geekOn && geekOwned))
      return { supply: 0, supplyRate: 0, turbineRate: 0, pressRate: 0, fissionRate: 0, titancloudRate: 0, sunSailRate: 0,
        shopDraw: 0, shopRate: 0, shopRatio: 0, shopNeed: 0,
        demandRate: 0, balanceRate: 0, skyNeed: 0, europaNeed: 0, geekNeed: 0,
        skyDraw: 0, skyRate: 0, left: 0, starDraw: 0, starRate: 0, drillDraw: 0, drillRate: 0,
        stationDraw: 0, stationRate: 0, satelliteDraw: 0, satelliteRate: 0, labDraw: 0, labRate: 0, robotDraw: 0, robotRate: 0, robotbayDraw: 0, robotbayRate: 0,
        vrDraw: 0, vrRate: 0, europaDraw: 0, europaRate: 0, geekDraw: 0, geekRate: 0,
        jupitorDraw: 0, jupitorRate: 0 };
    /* ERA5（2026-10-02）：高压热机管道(wonder_presspipe) 给热液能**供给侧 +10 绝对量**，
     *   走 wonder.hydroWonderMul 出口。与高压气泵升级的 hydroMul（乘区）是两回事，这里加法叠加。 */
    var _press = SB.wonder ? SB.wonder.hydroWonderMul(s) : 0;
    var supply = 0, rW = 1, turbineSupply = 0, pressSupply = 0, fissionSupply = 0, titancloudSupply = 0;
    if (turL > 0) {
      /* ⚠️ 暖石门控：暖石不够则汽轮机按比例降产（读 s.res.warmstone，但**不在此扣**——扣费只在 steelFlow）。
       *   ⚠️ 同耗乘 warmEff（refine/specfuel 降耗）：门控与 steelFlow 实扣用同一乘子，保证面板===结算。 */
      var warmNeed = turL * SB.UNIT.hydroWarm * dt * warmEff(s);
      var canWarm = Math.min(warmNeed, s.res.warmstone);
      rW = warmNeed > 0 ? canWarm / warmNeed : 0;
      /* ⚠️ 2026-09-30 ERA4：高压气泵(hydroMul) 只放大**汽轮机供给那一侧**，
       *    不放大工坊的需求 —— 反过来写会让「+50% 热液能」变成「多烧 50% 暖石」的方向错误。
       *   ⚠️ ERA5：_press 作为并联进汽口的绝对增量，同样乘 rW（按比例降产时管道也按比例供）。 */
      var _turbineFactor = dt * rW
        * (SB.civic ? SB.civic.cardHydroMul(s) : 1)
        * (SB.civic ? SB.civic.govHydroPerPop(s) : 1)   // ERA6 平等主义：每名鲛人 +0.1% 热液能产出
        * (SB.challenges ? SB.challenges.productionMul(s) : 1);
      turbineSupply = turL * SB.UNIT.hydroOut * (1 + upgSum(s, 'hydroMul')) * _turbineFactor;
      pressSupply = _press * _turbineFactor;
      supply = turbineSupply + pressSupply;
    }
    /* ERA7（2026-10-17 · spec §4）：核热厂——每级 +10 热液能/秒，**不烧暖石**的新热液源
     *   （供给侧直接相加，与高压热机管道 _press 同类；×挑战乘区与汽轮机同口径）。
     *   ⚠️ 铀消耗不在此扣（tick 侧直耗），这里只管流；「断铀不停堆」为提议口径待标定。
     *   ERA9（2026-10-19 · 核聚变 nuclear_fusion）：热液能产出 ×5（读 s.techs.nuclear_fusion 直读，无通用 mul 键）。 */
    if (fisL > 0) {
      var _nf = (s.techs && s.techs.nuclear_fusion) ? 5 : 1;
      fissionSupply = fisL * (SB.BLD.fissionHydro || 0) * starNuclearHydroMul(s) * dt * _nf
        * (SB.challenges ? SB.challenges.productionMul(s) : 1);
      supply += fissionSupply;
    }
    /* ERA8（2026-10-18 · spec §4）：泰坦星气云采集站——每级 +6 热液能/秒（不烧暖石，
     *   与核热厂同一供给侧通道）+ 每级产 5 燃料/秒（燃料行在 tick/rates，不进流）。 */
    if (tcL > 0) {
      titancloudSupply = tcL * (SB.BLD.titancloudHydro || 0) * starAlienOutputMul(s) * dt
        * (SB.challenges ? SB.challenges.productionMul(s) : 1);
      supply += titancloudSupply;
    }
    /* ERA9（2026-10-19 · 用户确认④）：太阳帆（星图累加器，s.sunSails，无限、无上限）每帆 +0.05 热液能/秒，
     *   进 hydro 供给侧（与核热厂/泰坦气云同类并联相加）。断流/缺料不影响帆本身（帆是已累积的产能，
     *   不是发射场在转）。×挑战乘区与核电站同口径。 */
    var sunSailSupply = 0;
    if ((s.sunSails || 0) > 0) {
      sunSailSupply = (s.sunSails || 0) * (SB.CFG.SUNSAIL_HYDRO || 0.05) * starSailHydroMul(s) * dt
        * (SB.challenges ? SB.challenges.productionMul(s) : 1);
      supply += sunSailSupply;
    }
    /* 工坊（低阶科技先吃满）：从本 tick 流里取 min(需求, 供给)。 */
    var shopDemand = shopL * SB.UNIT.hydroShopLvl * dt;
    var shopDraw = Math.min(shopDemand, supply);
    var left = supply - shopDraw;
    /* 天穹钻机（ERA5）：从剩流里取 SKYDRILL_HYDRO/tick，且需共振钻头够（机器态判据见 shell.js）。
     * ⚠️ 2026-10-07 钻机改手动启动：这里也要认 skydrillOn——rates 与 tickShell 同源，
     *    否则钻机停着时顶栏速率行仍显示「钻机在吃热液能」（面板撒谎家族）。 */
    var skyDraw = 0, skyNeed = 0;
    if (SB.wonder && SB.wonder.owned(s).wonder_skydrill && s.skydrillOn) {
      var hCost = SB.CFG.SKYDRILL_HYDRO * dt;
      if ((s.res.resonantDrill || 0) >= hCost) {
        skyNeed = hCost;
        if (left >= hCost) skyDraw = hCost;
      }
    }
    /* ERA6→太空时代（2026-10-13）：星空探索改为「破壳后被动累积」终局资源，
     *   不再吃热液能（旧的热液能第三级消费者 starDraw 路线已废弃）。
     *   新累积在 shell.tickStar 里按 STAR_BASE × breakCoef 被动累加、cap 到 STAR_CAP。
     *   这里 starDraw 恒 0，仅保留键位以兼容 rates()/steelFlow 的结构读取。 */
    var starDraw = 0;
    /* ERA7（2026-10-21）：每座已开启矿井耗 0.3 热液能/秒；在工坊、天穹钻机之后取流。
     *   与巢穴面板砂矿坑开关共用 activeSiltpit：它同时控制钛/铀加成与热液能需求。 */
    var drillDraw = 0, drillNeed = 0;
    if (_adCount > 0) {
      drillNeed = _adCount * (SB.UNIT.drillHydro || 0.3) * dt;
      var _adLeft = Math.max(0, left - skyDraw);
      drillDraw = Math.min(drillNeed, _adLeft);
    }
    /* ERA7（2026-10-17 · spec §5）：空间站运转耗——每级 2 热液能/秒，挂 spacestationStop 开关。
     *   优先级在钻探之后（工坊→天穹钻机→钻探→空间站）；断流时只停耗、星空加成仍在
     *   （starRate 与本处解耦，见那里的注释）。停用座数 = spacestationStop，运行座数 = 等级 − 停用数。 */
    var stationDraw = 0, stationNeed = 0;
    var staRun = Math.max(0, staL - (s.spacestationStop || 0));
    if (staRun > 0) {
      /* ERA7（2026-10-17 · spec §4 至高圣座）：空间站有效等级 +stationBonus（throne 免费 +3），
       *   耗流也按有效等级算（与 starRate 同源；免费、不收差价）。 */
      var _stEff = staRun + (SB.wonder ? SB.wonder.stationBonus(s) : 0);
      stationNeed = _stEff * (SB.BLD.stationHydro || 0) * dt;
      var _stLeft = Math.max(0, left - skyDraw - drillDraw);
      stationDraw = Math.min(stationNeed, _stLeft);
    }
    /* ERA7（2026-10-17 · spec §5 补 · 用户 2026-10-18 纠正：轨道卫星每级耗 1 热液能/秒，
     *   与空间站运转耗同源，挂 satelliteStop「开几座」开关：运行座数 = 等级 − satelliteStop，
     *   停掉的不耗流、也不产星空（starRate 同开关）。优先级与空间站同档
     *   （工坊→钻机→钻探→空间站→卫星→研究所…）。 */
    var satelliteDraw = 0, satelliteNeed = 0;
    if (satRunL > 0) {
      satelliteNeed = satRunL * (SB.BLD.satelliteHydro || 0) * dt;
      var _satLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw);
      satelliteDraw = Math.min(satelliteNeed, _satLeft);
    }
    /* ERA8（2026-10-18 · spec §4）：生物材料研究所每级耗 3 热液能/秒（labDraw），
     *   优先级在空间站之后（工坊→钻机→钻探→空间站→研究所）。
     *   ⚠️ 断流只停耗、θ产出照给——与空间站「断流只停耗、星空加成仍在」同一提议口径；
     *      若要「断电停产」须把 thetaFlow 乘供电率（labDraw/labNeed），另拍。 */
    var labDraw = 0, labNeed = 0;
    if (labL > 0) {
      labNeed = labL * (SB.BLD.biomatlabHydro || 0) * dt;
      var _lbLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw);
      labDraw = Math.min(labNeed, _lbLeft);
    }
    /* ERA8（spec §4）：工业机器人（upg_indrobot）按运行工坊数耗流，优先级最后；
     *   与 workshop.craftMul 的输出加成读取 activeWorkshops(s) 同源。 */
    var robotDraw = 0, robotNeed = 0;
    if (robotL) {
      robotNeed = robotL * (SB.UNIT.robotHydro || 3) * dt;
      var _rbLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw - labDraw);
      robotDraw = Math.min(robotNeed, _rbLeft);
    }
    /* ERA8（2026-10-19 · B7）：机器人充能站每级耗 8 热液能/秒（robotbayDraw），
     *   优先级在工业机器人之后（…→研究所→机器人→充能站→魔鱼VR）；断流只停耗。
     *   机器人员工本身由 folk.effJobs 并入职业产出（×1.2、剔除 scribe/scholar），此处只算充能站自身运转耗。 */
    var robotbayDraw = 0, robotbayNeed = 0;
    if (bayL > 0) {
      robotbayNeed = bayL * ((SB.UNIT.robotbayHydro || 0) + 2 * ((s.perk && s.perk.starFoldableStructure) || 0)) * dt;
      var _rbayLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw - labDraw - robotDraw);
      robotbayDraw = Math.min(robotbayNeed, _rbayLeft);
    }
    /* ERA8 市政奇观（2026-10-18 · 用户市政表 H1=C）：魔鱼世界VR 运转持续耗 5 热液能/秒，
     *   优先级最后（…→研究所→机器人→魔鱼VR）。断流只停耗、幸福 +1 仍在（与空间站同口径，
     *   effect.happyBonus 与流解耦）。 */
    var vrDraw = 0, vrNeed = (SB.wonder && SB.wonder.fishvrHydroDraw ? SB.wonder.fishvrHydroDraw(s) : 0) * dt;
    if (vrNeed > 0) {
      var _vrLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw - labDraw - robotDraw - robotbayDraw);
      vrDraw = Math.min(vrNeed, _vrLeft);
    }
    /* ERA9（2026-10-21）：三座发射场运转耗 —— 帆与节点模式每级均为 4 热液能/秒，**最低优先级**
     *   （…→机器人→充能站→魔鱼VR→发射场）。断流只停耗。其**库存耗料**（铀/strongProp/thinafilm）
     *   与**帆进度累加**在 economy-tick.js 同 tick 内结算（同 s._hydroFlow 判据 ⇒ 面板===结算）。 */
    var europaDraw = 0, europaNeed = 0;
    if (europaL > 0) {
      /* ERA10 市政：单个发射场的每级耗流走 launchHydroPer（含《节能减耗》乘区），
       * 三座场共用同一单位值（用户拍「制造消耗与欧罗巴相同」）。 */
      europaNeed = europaL * launchHydroPer(s) * dt;
      var _euLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw - labDraw - robotDraw - robotbayDraw - vrDraw);
      /* 发射场需要整额热液能才推进；短缺时停摆并释放未满足的那部分流量给后续用户。 */
      if (_euLeft >= europaNeed - 1e-9) europaDraw = europaNeed;
    }
    /* ERA9（2026-10-19）：星球重构机 G.E.E.K 运转耗 —— 每 s 耗 40 热液能/秒，**最低优先级**
     *   （…→机器人→充能站→魔鱼VR→发射场→G.E.E.K）。断流只停耗。其**库存耗料**（kelp/metal/coral）
     *   与**改造进度累加**在 shell.tickShell ③段同 tick 内结算（同 s._hydroFlow 判据 ⇒ 面板===结算）。 */
    var geekDraw = 0, geekNeed = 0;
    if (geekOn && geekOwned) {
      geekNeed = SB.CFG.GEEK_HYDRO * dt;
      var _geekLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw - labDraw - robotDraw - robotbayDraw - vrDraw - europaDraw);
      /* G.E.E.K 需要整额热液能才能推进；短缺时停摆并释放流量给后续用户。 */
      if (_geekLeft >= geekNeed - 1e-9) geekDraw = geekNeed;
    }
    /* ERA10（2026-10-20）：朱庇特质量加速站运转耗 —— 20 热液能/秒（用户表「消耗热液能20」），
     *   **最低优先级**（…→发射场→G.E.E.K→朱庇特）。断流只停耗、biomatlabOut 乘区照给
     *   （与魔鱼VR「断流只停幻境不停幸福加成」同口径；effect 与流解耦）。
     *   读数走 wonder.jupitorHydroDraw（纪律③：奇观效果只从 wonder.js 出，不在此散读 s.wonders）。 */
    var jupitorDraw = 0, jupitorNeed = (SB.wonder && SB.wonder.jupitorHydroDraw ? SB.wonder.jupitorHydroDraw(s) : 0) * dt;
    if (jupitorNeed > 0) {
      var _jpLeft = Math.max(0, left - skyDraw - drillDraw - stationDraw - labDraw - robotDraw - robotbayDraw - vrDraw - europaDraw - geekDraw);
      jupitorDraw = Math.min(jupitorNeed, _jpLeft);
    }
    var demand = shopDemand + skyNeed + drillNeed + stationNeed + satelliteNeed + labNeed + robotNeed
      + robotbayNeed + vrNeed + europaNeed + geekNeed + jupitorNeed;
    var demandRate = dt > 0 ? demand / dt : demand;
    var supplyRate = dt > 0 ? supply / dt : supply;
    return { supply: supply, supplyRate: dt > 0 ? supply / dt : supply,
      turbineRate: dt > 0 ? turbineSupply / dt : turbineSupply,
      pressRate: dt > 0 ? pressSupply / dt : pressSupply,
      fissionRate: dt > 0 ? fissionSupply / dt : fissionSupply,
      titancloudRate: dt > 0 ? titancloudSupply / dt : titancloudSupply,
      sunSailRate: dt > 0 ? sunSailSupply / dt : sunSailSupply,
      shopDraw: shopDraw, shopRate: dt > 0 ? shopDraw / dt : shopDraw,
      skyDraw: skyDraw, skyRate: dt > 0 ? skyDraw / dt : skyDraw,
      shopRatio: shopDemand > 0 ? shopDraw / shopDemand : (shopL > 0 ? 1 : 0),
      shopNeed: dt > 0 ? shopDemand / dt : shopDemand,
      skyNeed: dt > 0 ? skyNeed / dt : skyNeed,
      europaNeed: dt > 0 ? europaNeed / dt : europaNeed,
      geekNeed: dt > 0 ? geekNeed / dt : geekNeed,
      demandRate: demandRate, balanceRate: supplyRate - demandRate,
      left: left - skyDraw - starDraw - drillDraw - stationDraw - satelliteDraw - labDraw - robotDraw - robotbayDraw - vrDraw - europaDraw - geekDraw - jupitorDraw,
      starDraw: starDraw, starRate: dt > 0 ? starDraw / dt : starDraw,
      drillDraw: drillDraw, drillRate: dt > 0 ? drillDraw / dt : drillDraw,
      stationDraw: stationDraw, stationRate: dt > 0 ? stationDraw / dt : stationDraw,
      satelliteDraw: satelliteDraw, satelliteRate: dt > 0 ? satelliteDraw / dt : satelliteDraw,
      labDraw: labDraw, labRate: dt > 0 ? labDraw / dt : labDraw,
      robotDraw: robotDraw, robotRate: dt > 0 ? robotDraw / dt : robotDraw,
      robotbayDraw: robotbayDraw, robotbayRate: dt > 0 ? robotbayDraw / dt : robotbayDraw,
      vrDraw: vrDraw, vrRate: dt > 0 ? vrDraw / dt : vrDraw,
      europaDraw: europaDraw, europaRate: dt > 0 ? europaDraw / dt : europaDraw,
      geekDraw: geekDraw, geekRate: dt > 0 ? geekDraw / dt : geekDraw,
      jupitorDraw: jupitorDraw, jupitorRate: dt > 0 ? jupitorDraw / dt : jupitorDraw };
  }
  /* 副作用版（tick 调用）：算好流分配后**只扣暖石**，且把 s.res.hydro 写成「每秒供给」
   * （覆盖写，绝不再 += —— 这就是 flow 模型「不储存」的核心）。工坊据此产钢。
   * ⚠️ 单位铁律：这里存的是 **每秒**（÷dt 归一），不是「这一 tick 产多少」——
   *    顶栏主数要与速率行同口径（/s），否则 STEP 一变主数就跟着缩，量纲当场漂掉。 */
  /* 星空槽被动累积速率（太空时代终局资源，2026-10-13 镜像破壳）。
   * 仅破壳后（s.broken）且未达成（s.starComplete）才 > 0；基础文明推力始终在跑。
   * 速率 = STAR_BASE × breakCoef（与破壳同一文明推力，复用 shell.breakCoef）
   *        + 每级星空观测站升级额外 +STAR_UPG_BONUS/s（保留旧升级语义）
   *        + 太空建筑运行座数贡献（轨道卫星每级 +5/s、空间站每级 +10/s，按「开几座」运行座数计）。
   * 实际落点与满槽判定在 shell.tickStar（每 tick 调用）。 */
  function starRate(s) {
    if (!s || s.shell > 0 || !(s.broken || s.shellOpened || s.breakSettled) || s.starComplete) return 0;
    var coef = (SB.shell && SB.shell.breakCoef) ? SB.shell.breakCoef(s) : 0;
    var upg = (upgSum ? upgSum(s, 'starExplore') : 0);
    /* ERA7（2026-10-17 · spec §5）：太空建筑入列——轨道卫星每级 +5/秒、空间站每级 +10/秒。
     *   按「开几座」运行座数计（卫星 satelliteStop / 空间站 spacestationStop，默认全开）；
     *   ⚠️ 与空间站的运转耗（hydroAlloc stationDraw，同一 spacestationStop 开关）**故意解耦**：
     *   断电不停观测（提议口径；若要「断电停摆」须把本行乘上供电率，另拍）。 */
    /* ERA7（2026-10-17 · spec §4 至高圣座）：空间站有效等级 +stationBonus（throne 免费 +3），
     *   这里只放大星空产出，不进 costOf / lvlSum（与图书馆虚级同构）。 */
    var satRun = Math.max(0, ((s.lvl && s.lvl.satellite) || 0) - (s.satelliteStop || 0));
    var staRun = Math.max(0, ((s.lvl && s.lvl.spacestation) || 0) - (s.spacestationStop || 0));
    var staEff = staRun + (SB.wonder ? SB.wonder.stationBonus(s) : 0);
    /* ERA8（2026-10-18 · spec §2 机器人技术解锁2 永久乘区）：人造卫星星空探索 +100%
     *   （satStar，乘区只罩卫星项——空间站/奇观的星空不受它放大，spec 原话「人造卫星」）。 */
    var _satStarMul = 1 + ((SB.tech && SB.tech.mul) ? (SB.tech.mul(s).satStar || 0) : 0);
    var spaceLvl = (satRun * (SB.BLD.satelliteStar || 0) * _satStarMul
      + staEff * (SB.BLD.stationStar || 0)) * starSpaceExploreMul(s);
    /* ERA8（spec §4 两奇观）：旅行者1号两档（voyagerStarRate，条件出口）+
     *   萨图恩 effect.starBonus（wonderStarFlat，绝对量）。都是平坦加项，与 spaceLvl 相加。
     * ERA8 市政奇观：哈'利法宇宙望远镜两档（khalifaStarRate）——与旅行者**独立叠加**（用户确认）。 */
    var _voy = (SB.wonder && SB.wonder.voyagerStarRate) ? SB.wonder.voyagerStarRate(s) : 0;
    var _satFlat = (SB.wonder && SB.wonder.wonderStarFlat) ? SB.wonder.wonderStarFlat(s) : 0;
    var _khal = (SB.wonder && SB.wonder.khalifaStarRate) ? SB.wonder.khalifaStarRate(s) : 0;
    /* ERA8 市政（2026-10-18 用户拍 Q2）：星际探索热潮卡 + 远见主义哲学被动，各 +1%×人口，
     *   并行叠加（相乘两份）。乘区罩整段（基础+卫星+奇观都随人口放大）。 */
    var _fever = (SB.civic && SB.civic.cardFeverStarMul) ? SB.civic.cardFeverStarMul(s) : 1;
    var _farsight = (SB.civic && SB.civic.civicFarsightStarMul) ? SB.civic.civicFarsightStarMul(s) : 1;
    /* ERA9（2026-10-19 · 行星际航行 unlock2）：所有异星建筑（星海区 rheamine/titancloud/mars_workshop）
     *   每级 +5% 星空探索速度。门=已研究 interplanetary；乘区罩整段（与 _fever/_farsight 同口径）。
     *   ⚠️ 仅星海区三建筑计入（europa_launch 归母星 core、不算异星，见 BUILD_ZONE_OF）。 */
    var _alienStarMul = 1;
    if (s.techs && s.techs.interplanetary) {
      var _alienLv = ((s.lvl && s.lvl.rheamine) || 0) + ((s.lvl && s.lvl.titancloud) || 0)
        + ((s.lvl && s.lvl.mars_workshop) || 0);
      _alienStarMul = 1 + 0.05 * _alienLv;
    }
    return ((SB.CFG.STAR_BASE || 0) * coef + upg * (SB.CFG.STAR_UPG_BONUS || 0)
      + spaceLvl + _voy + _satFlat + _khal) * _fever * _farsight * _alienStarMul;
  }

  function steelFlow(s, dt) {
    var T = SB.tech ? SB.tech.mul(s) : null;
    var e = (T ? T.bldEff : 1);   // 建筑原料效率（热泉回流）：热液工坊砂矿消耗 ×e
    var HF = hydroAlloc(s, dt);
    s._hydroFlow = HF;                 // 留给 tickShell 的天穹钻机读剩流（同 tick 内 steelFlow 先于 tickShell）
    s.res.hydro = HF.supplyRate;       // ★ flow 模型：每 tick 覆盖写「每秒供给」，不累积库存
    /* ERA6→太空时代（2026-10-13）：星空探索的累加已迁出热液能流，改由 shell.tickStar 被动处理
     *   （见 economy.starRate / shell.tickStar）。HF.starDraw 恒 0，此处不再落点。 */
    /* 暖石扣费（唯一副作用落点）：按**运行座数**扣（state.turbineStop 已停的座不计）。
     * ⚠️ 同耗乘 warmEff（refine/specfuel 降耗），与 hydroAlloc 门控同一乘子 ⇒ 面板===结算。 */
    var turL = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
    if (turL > 0) {
      var warmNeed = turL * SB.UNIT.hydroWarm * dt * warmEff(s);
      s.res.warmstone -= Math.min(warmNeed, s.res.warmstone);
    }
    var shopL = s.lvl.hydroshop || 0;
    if (shopL <= 0) return 0;
    /* 工坊吃 from 流（HF.shopDraw），金属不足再按 metal 门控降钢（沿用旧口径，钢侧 metal 门控不进 rates）。
     * min 双限防抽成负数。 */
    /* bldEff：同钢产量只耗 e× 砂矿（效率，不是产出）。metalWant 含 e ⇒ 砂矿够时 realHydro=shopDraw（满产），
     *   砂矿不够则按比例降产 —— 与铁器/海流锻钢的「产出乘区」分工明确。热液能是 flow，其效率=steelMul（见下）。 */
    var metalWant = HF.shopDraw * SB.UNIT.steelMetal * e;
    var canMetal = Math.min(metalWant, s.res.silt);
    var realHydro = metalWant > 0 ? HF.shopDraw * (canMetal / metalWant) : HF.shopDraw;
    s.res.silt -= canMetal;
    /* ERA5（2026-10-02）：废钢锻造(upg_wasteforge) 钢产出 +20%（steelBonus，加法乘区）。
     * ERA4（2026-10）：海流锻钢(hydrocarbur) 钢产出 ×steelMul（乘法乘区，与 steelBonus 独立相乘）。 */
    var out = realHydro * SB.UNIT.steelPerHydro * globalMulX(s) * (1 + upgSum(s, 'steelBonus')) * (T ? T.steelMul : 1)
      * (1 + (SB.wonder && SB.wonder.nationalLogisticsMul ? SB.wonder.nationalLogisticsMul(s) : 0))
      /* ERA9 血肉苦弱卡（resOutMul.steel=1.3）：钢产出 +30%（装卡才生效）。 */
      * (SB.civic && SB.civic.cardResOutMul ? SB.civic.cardResOutMul(s, 'steel') : 1)
      * (SB.companyMul ? SB.companyMul(s, 'steel') : 1)
      * hydroshopEffMul(s) * hydroshopBoostMul(s) * smeltingOutMul(s);
    addRes(s, 'steel', out);
    return out;
  }
  /* rates() 用的非变异版：与 steelFlow 同式（dt=1），不改 s.res。
   *   steel       = 工坊实际产钢；
   *   hydro       = **负的**消耗（工坊吃 + 钻机吃），作顶栏速率行；
   *   hydroSupply = **总生产**（汽轮机供给侧，恒 ≥0），给「热液能产出 N/s」这类尤里卡条件用。
   *   ⚠️ 取负不是装饰：顶栏 rate 的语义是「这行数字每秒怎么变」，消耗必须显示成红色负向
   *      （渲染层 r>0 才加 '+' 并染绿 ⇒ 传正数会被读成「热液能在涨」，与 flow 模型正好相反）。
   *   ⚠️【为什么必须分两个键】2026-10-07 修的正是把它们当成一个量：`industrialize` 的尤里卡
   *      写 `rates.hydro >= 10`，而 hydro 恒 ≤ 0 ⇒ 条件**永远不成立**，科技永不揭示
   *      （表面症状只是「尤里卡那行显示的是减掉的那部分」）。总生产与净消耗是两个口径，
   *      谁读哪个由读的人决定，不能在 rates 里合并成一个。 */
  function steelRate(s) {
    var T = SB.tech ? SB.tech.mul(s) : null;
    var HF = hydroAlloc(s, 1);
    /* 容量口径（砂矿充足假设）：bldEff 不改产能 ⇒ 不动此处；steelMul 放大钢产能（与 steelBonus 独立相乘）。 */
    var steel = HF.shopDraw * SB.UNIT.steelPerHydro * globalMulX(s) * (1 + upgSum(s, 'steelBonus')) * (T ? T.steelMul : 1)
      * (1 + (SB.wonder && SB.wonder.nationalLogisticsMul ? SB.wonder.nationalLogisticsMul(s) : 0))
      /* ERA9 血肉苦弱卡（resOutMul.steel=1.3）：钢产出 +30%（装卡才生效）。 */
      * (SB.civic && SB.civic.cardResOutMul ? SB.civic.cardResOutMul(s, 'steel') : 1)
      * (SB.companyMul ? SB.companyMul(s, 'steel') : 1)
      * hydroshopEffMul(s) * hydroshopBoostMul(s) * smeltingOutMul(s);
    /* ERA8：补 labDraw（生物材料研究所）/ robotDraw（工业机器人）/ robotbayDraw（机器人充能站）三个新耗流方——
     *   漏加 = 顶栏热液能净消耗少算几路（面板撒谎家族）。
     *   ERA10（2026-10-20）：再补 jupitorDraw（朱庇特质量加速站 20/s）——同一个坑，第三次踩到：
     *   hydroAlloc 里算得再准，净速率这一行漏掉就是「面板说没在烧、实际每秒掉 20」。 */
    var hydro = -(HF.shopDraw + HF.skyDraw + HF.starDraw + HF.drillDraw + HF.stationDraw + HF.labDraw + HF.robotDraw + HF.robotbayDraw + HF.vrDraw + HF.europaDraw + HF.geekDraw + HF.jupitorDraw);
    /* ERA9（2026-10-19）：europaRate 透传（hydroAlloc 的欧罗巴发射场满供判据），供 rates 算发射场库存耗料。
     * ERA9-GEEK（2026-10-21）：geekRate 同上透传 —— GEEK 的**库存耗料**（藻食/金属/石头/珊瑚）在
     *   shell.tickShell ③段直扣，rates 要减掉这四笔必须拿到「热液能是否给满」这一个判据，
     *   否则面板只能二选一：要么假装没耗（珊瑚被抽干还显示 +450/s，用户报的 bug），
     *   要么停摆时也照扣（反向撒谎）。同源取 HF.geekRate，与 tick 的 `_HF2.geekDraw > 0` 等价。 */
    return { steel: steel, hydro: hydro, hydroSupply: HF.supplyRate, starRate: HF.starRate,
      europaRate: HF.europaRate, geekRate: HF.geekRate };
  }

  /* ── ERA8（2026-10-18 · spec §3）：θ生物金属产线（生物材料研究所）────────
   * 形制照 steelFlow/steelRate 对：tick 走副作用版 thetaFlow（扣四样原料）、
   * rates 走纯读版 thetaRate（dt=1 同式不扣）⇒ 面板 === 结算。
   * 【开工率】四种原料（藻食/精铁/钛/铀，×bldEff 原料效率）各自「库存 ÷ 需求」取最小，
   *   钳 [0,1] —— 哪个先见底就按哪个比例降产（与热液工坊的 metal 门控同构）。
   * 【乘区】产出 = 每级基准 × 开工率 × globalMul × biomatlabOut×biomatlabEff
   *   （两键是 identity=1 的乘区，纳米技术研究后为 1.1×1.3=1.43）；原料扣减端吃 bldEff。
   * 【运转座数】按等级减 biomatlabStop；停用座不扣料也不产出。
   * 【热液能耗】不在这里——labDraw 由 hydroAlloc 统一分配（断流只停耗、产出照给，
   *   与空间站同口径，见 hydroAlloc 那条注）。 */
  function thetaRatio(s) {
    var T = SB.tech ? SB.tech.mul(s) : null;
    var lv = Math.max(0, (s.lvl.biomatlab || 0) - Math.max(0, s.biomatlabStop || 0));
    if (lv <= 0) return { ratio: 0, T: T, lv: 0 };
    var e = (T ? T.bldEff : 1);
    var nK = lv * (SB.BLD.biomatlabKelp || 0) * e;
    var nI = lv * (SB.BLD.biomatlabIron || 0) * e;
    var nT = lv * (SB.BLD.biomatlabTi || 0) * e;
    var nU = lv * (SB.BLD.biomatlabU || 0) * e;
    var ratio = 1;
    if (nK > 0) ratio = Math.min(ratio, (s.res.kelp || 0) / nK);
    if (nI > 0) ratio = Math.min(ratio, (s.res.iron || 0) / nI);
    if (nT > 0) ratio = Math.min(ratio, (s.res.titanium || 0) / nT);
    if (nU > 0) ratio = Math.min(ratio, (s.res.uranium || 0) / nU);
    ratio = Math.max(0, Math.min(1, ratio));
    return { ratio: ratio, T: T, lv: lv, nK: nK, nI: nI, nT: nT, nU: nU };
  }
  function thetaOut(s, lv, ratio, T) {
    return lv * (SB.BLD.biomatlabOutRate || 0) * ratio * globalMulX(s) * smeltingOutMul(s)
      * (T ? (T.biomatlabOut || 1) * (T.biomatlabEff || 1) : 1)
      /* ERA9 血肉苦弱卡（resOutMul.thetaMetal=1.3）：θ金属产出 +30%（装卡才生效）。 */
      * (SB.civic && SB.civic.cardResOutMul ? SB.civic.cardResOutMul(s, 'thetaMetal') : 1)
      * (SB.companyMul ? SB.companyMul(s, 'thetaMetal') : 1)
      /* ERA10 朱庇特质量加速站（wonder_jupitor_mas.effect.biomatlabOut=1.0）：研究所产出 ×2，
       * 与纳米技术的 biomatlabOut ×1.10 **独立相乘**（合计 ×2.10）。读数走 wonder.js（纪律③）。 */
      * (SB.wonder && SB.wonder.wonderBiomatlabOut ? SB.wonder.wonderBiomatlabOut(s) : 1);
  }
  /* ERA10（2026-10-20）：太阳星环平产量 —— 每级 +0.05 θ金属/秒（用户 ERA10 表原值）。
   * ⚠️ **平产**：不吃 biomatlab 开工率（无原料需求）、不吃 globalMul（字面「每秒生产」），
   *    与 biomatlab 线独立相加。独立成函数是因为 thetaFlow/thetaRate 两处都要读，
   *    且 biomatlab 停工（ratio=0 / lv=0）时这项**照产**——早期 return 会把它静吞掉。 */
  function solarRingOut(s) {
    return (s.lvl.solar_ring || 0) * (SB.BLD.solarRingOut || 0) * starSolarRingMul(s);
  }
  function thetaFlow(s, dt) {
    var q = thetaRatio(s);
    var _ring = solarRingOut(s) * dt;
    if (q.lv <= 0 || q.ratio <= 0) {
      /* 星环保留路径：biomatlab 没建/没料也照产（加进去再返回，防止早期 return 吞掉）。 */
      if (_ring > 0) addRes(s, 'thetaMetal', _ring);
      return _ring;
    }
    /* 扣四样原料（×开工率×dt，min 双限防抽负）。原料按 bldEff 折扣扣（与铁器同口径）。 */
    s.res.kelp -= Math.min(q.nK * q.ratio * dt, s.res.kelp || 0);
    s.res.iron -= Math.min(q.nI * q.ratio * dt, s.res.iron || 0);
    s.res.titanium -= Math.min(q.nT * q.ratio * dt, s.res.titanium || 0);
    s.res.uranium -= Math.min(q.nU * q.ratio * dt, s.res.uranium || 0);
    var out = thetaOut(s, q.lv, q.ratio, q.T) * dt;
    addRes(s, 'thetaMetal', out);
    return out + _ring;
  }
  function thetaRate(s) {
    var q = thetaRatio(s);
    var _ring = solarRingOut(s);
    if (q.lv <= 0) return _ring;
    return thetaOut(s, q.lv, q.ratio, q.T) + _ring;
  }
  /* 只读版 θ产线四种原料的实际消耗率；与 thetaFlow 使用同一个库存开工率。 */
  function thetaInputRates(s) {
    var q = thetaRatio(s);
    return {
      kelp: q.nK ? q.nK * q.ratio : 0,
      iron: q.nI ? q.nI * q.ratio : 0,
      titanium: q.nT ? q.nT * q.ratio : 0,
      uranium: q.nU ? q.nU * q.ratio : 0
    };
  }

  /* 市政点的产出：**书手 + 议事厅**两条（双来源，2026-09-27 用户拍板，见 CIVICS §3）。
   * ⚠️ 抽成函数而不用两处各写一遍，是为了守单位铁律：tick 传 dt 走这个函数的 ×dt 形式、
   *    rates() 传 1 走它本身。两边各写一遍迟早会漂成「面板 0.3/s 实际 3/s」。
   * 【为什么不乘 gatherMul】礁石平台/深潜那类倍率是**采集**倍率，书手持的是笔不是鳃；
   *    市政点从一开始就是独立的一条线，不该被采集侧的增益牵着走。 */
  /* ⚠️ 括号内是「这一秒的毛产出」，括号外乘的是灯塔的全资源乘区。
   *    顺序不能反（写成 `scribe*UNIT*civicBonus` 那种会错位），更不能把 civicBonus
   *    单独乘在 scribe 那项上 —— 奇观给的是**总量**，不是「书手产出的一部分」。
   *    ⚠️ 这个函数同时被 tick 与 rates 调用 ⇒ 面板与实际天然同式，别在外面重写一遍。 */
  function cultureRate(s) {
    var wonderBonus = SB.wonder ? SB.wonder.civicBonus(s) : 0;
    /* ⚠️【广场的乘区只裹「书手那一项」】与上面 science 行 library / institute 那条
     *   是同一个括号纪律：写成 `((scribe*UNIT + hall*HALL) * (1+sq))` 会让广场顺手
     *   放大议事厅与奇观的量，「广场 +10%/级」这句话当场变成假的。
     * ⚠️【政策卡《戏剧与诗歌》是**整段乘**而不是加】它是「广场效果 +100%」⇒
     *   把已经算好的广场那一段整体 ×2，不能写成 `+ 0.10*squareMul`。
     * ⚠️ 取不到 SB.civic 就当没有（乘 1）：这是取不到，不是 0，静默降级是对的。 */
    var sqMul = (1 + (s.lvl.square || 0) * SB.BLD.squareCivRatio)
      * ((SB.civic && SB.civic.squareMul) ? SB.civic.squareMul(s) : 1);
    /* ERA4（2026-09-30）：雕版印刷机给**书手** +30%（pressCul，只裹 scribe 那一截 ——
     *   与广场那条同一个括号纪律：神庙/议事厅/奇观那几份不能被它顺手放大）。
     *   天壳切削器给**市政点总量** +%（按观测站等级），落在 globalMul 之后 ——
     *   它给的是总量而不是「书手产出的一部分」，所以位置在括号外。 */
    /* ERA4（2026-10-01）：博物馆建筑给书手 +20%（museumCivicMul）、行政部门给书手 +50%
     *   （scribeCivicMul），都是**只裹书手那一截**的平坦乘区（与广场那条括号纪律同源：
     *   不能让它们顺手放大议事厅/奇观的量）。两者叠加后乘在 scribe 项上。 */
    var scribeCiv = (SB.civic ? SB.civic.scribeCivicMul(s) : 1)
      * (SB.civic ? SB.civic.museumCivicMul(s) : 1)
      * (SB.civic ? SB.civic.theaterCivicMul(s) : 1);
    /* ERA5（2026-10-02）：歌剧院建筑给书手 +15%/级（theaterCivicMul，只裹书手那一截）；
     *   热能优先卡把市政产出 −50%（cardCivicOutMul，整段乘，含议事厅/奇观的量）。 */
    var sqMulBase = ((s.jobs.scribe || 0) * folkOutputMul(s) * starOrbitalJobMul(s) * SB.UNIT.culture * sqMul
      * (1 + upgSum(s, 'pressCul')) * scribeCiv * scribePactMul(s)
      + coreLvl(s) * SB.CFG.CIVIC.HALL_RATE
        * (1 + (s.lvl.civichall || 0) * (SB.BLD.civicHallRatio || 0))
      + wonderBonus) * globalMul(s)
      * (SB.civic ? SB.civic.cardCivicOutMul(s) : 1)
      * (SB.civic ? SB.civic.govCivicOutMul(s) : 1);   // ERA6 联邦制：市政产出 +10%
    /* ERA4（2026-10-01）：历史哲学完成后，ERA1/2/3 每座奇观 +5 市政点/秒（wonderEraCivicBonus，
     * 绝对量、加在总量上、独立于乘区）。 */
    var lgC = SB.prestige ? SB.prestige.legacy() : null;
    var cMul = lgC ? (lgC.relicCultureMul * (1 + lgC.shopCivicBonus)) : 1;
    var cAdd = lgC ? lgC.oldArtworkCultureRate : 0;
    return (sqMulBase
      * (SB.wonder ? SB.wonder.cutterCivicMul(s) : 1)
      + (SB.civic ? SB.civic.wonderEraCivicBonus(s) : 0)
      + (SB.wonder ? SB.wonder.skydrillCivic(s) : 0)
      + (SB.civic ? SB.civic.civicPerPop(s) : 0)   // ERA6 大众传媒卡：每名鲛人 +0.5 市政点/秒（绝对量）
      + ((s.lvl.school || 0) > 0 ? (s.pop || 0) * (s.lvl.school || 0) * (SB.BLD.schoolMermanCivic || 0) : 0)  // ERA5 学校（2026-10-21 改）：每名鲛人 +0.5 市政点/秒（每级，绝对量，与大众传媒同口径）
      + (SB.civic ? SB.civic.stadiumCivic(s) : 0))   // ERA7 直播竞技卡：人口 × 体育场等级（装卡且建体育场）
      * (SB.civic ? SB.civic.wonderCivicGainMul(s) : 1)   // ERA7 文化遗产：每座奇观 +1% 市政点获取
      * cMul + cAdd;
  }

  /* 潮纹馆的**合计级数** = 真实等级 + 大图书馆送的虚级（2026-09-28 用户规格
   * 「效果是图书馆 +3 级，只加效果，不提高建筑所需材料」）。
   * ⚠️【虚级为什么不进 `s.lvl.library`】进了就会被 lvlSum、need 判定、以及建筑
   *    总级数那几条一并读走 ⇒ 玩家看到「图书馆 9 级」却建得起第 10 级，
   *    而图书馆那座建筑自己一点变化都没有。虚级的语义是「**按效果算、按建筑不算**」，
   *    ⇒ 只在这里与真实等级相加，落点只有下方那两行 science。
   * ⚠️ 读它的是 tick 与 rates 两处（必须逐字同构），别在别处另加。 */
  function libraryLevel(s) {
    return (s.lvl.library || 0) + (SB.wonder ? SB.wonder.libBonus(s) : 0);
  }

  /* 信仰的**乘区系数**（神庙那一段，不含基础产出）。
   * ⚠️ 括号纪律与 cultureRate 的广场那条、science 行的 library 那条完全同源：
   *    乘区只裹「神庙的那一截」，将来宗教系统加基础产出时它落在乘区**之外**
   *    （对位议事厅在 cultureRate 里的位置）。写成 `base * (1+lvl*ratio)` 会
   *    让「神庙 +10%/级」反过来放大基础产出。 */
  /* 信仰的**全产产出加成**（按存量对数刻度，2026-09-28 用户规格）。
   * 刻度：10 信仰→+1%、100→+2%、1000→+3%……即 `floor(log10(faith))` 个百分点的 1%。
   *   faith < 10 ⇒ 0%（还没攒到第一个数量级，不加成）。
   * ⚠️ 这是「信仰存量」的函数，不是「神庙等级」的函数——与 faithMul（神庙乘区）是两条独立轴：
   *   ① faithMul 管「信仰怎么产得快」（神庙 +10%/级 × 政策卡翻倍）；
   *   ② faithAllMul 管「信仰攒到多少后，全资源产出被推高多少」。
   *   两者都挂在信仰上，但一个作用于产出速率、一个作用于全局乘区，别混。
   * ⚠️【反自指】本函数**只**被 globalMul 调用（作用于珊瑚/石头/…/奢侈品这些 tick 产出），
   *   faithRate 本身不调 globalMul ⇒ 信仰自身产出不被自己的全产加成放大，避免指数自激。
   *   用户说「信仰按指数提供全产产出」= 信仰存量越高、全产加成越高，正是指这条轴。 */
  function faithAllMul(s) {
    var f = s.res.faith || 0;
    if (f < 10) return 1;
    var mag = Math.floor(Math.log10(f) + 1e-9);   // 10→1, 100→2, 1000→3（浮点边界 +ε）
    return 1 + mag * 0.01;
  }
  function faithMul(s) {
    var B = SB.BLD || {};
    return (1 + (s.lvl.temple || 0) * (B.templeFaithRatio || 0))
      * (SB.civic ? SB.civic.templeMul(s) : 1)
      * (SB.civic ? SB.civic.templeFaithMul(s) : 1);  // ERA4 启蒙运动卡：神庙信仰 −50%
  }
  /* 信仰的产出率（抽成函数是为守单位铁律：tick 与 rates 都调它）。
   * ⚠️ 基础产出在**完成《神学》后**才存在（人口 × FAITH_PER_POP，见下面正文）；
   *    神学前由 resUnlocked 门控恒 0。乘区照算不误（乘 0），所以不必为
   *    「基础为 0 时整条 return」写特例 —— 将来改基础公式只动这一处。 */
  function faithRate(s) {
    /* ⚠️ 2026-09-30 修漏门控：信仰产出**只在信仰资源解锁后**发生，与面板资源行的
     *    gate 用同一条判定（resUnlocked(s,'faith') ⇔ s.civics.theology）。神学前即使有人口也
     *    恒为 0 —— 不开局偷偷攒信仰、也不偷偷给全产加成（存量保持 0 ⇒ faithAllMul 退 1）。
     *    完成《神学》后：基础产出 = 人口 × FAITH_PER_POP（用户「每个人口 0.02/s」），再乘神庙乘区 faithMul。
     *    ⚠️ 不调 globalMul ⇒ 不吃自己的全产加成（反自指，见 faithAllMul 注）。 */
    if (!resUnlocked(s, 'faith')) return 0;
    /* ERA10（2026-10-20 · 用户拍 Q3「进人口基项」）：买了工坊升级「强人工智能」后，
     * 机器人按**人口口径**产信仰——基项加 robotPop（4×充能站等级），与 s.pop 同权。
     * ⚠️ 门控在升级上（upg_strongai），不在科技上：科技只解锁升级购买权，
     *    没买 1000θ 之前机器人仍不影响信仰（robotbay 原口径「不影响信仰点」保持）。 */
    var _faithPop = s.pop
      + ((s.upgrades && s.upgrades.upg_strongai && SB.folk && SB.folk.robotPop) ? SB.folk.robotPop(s) : 0);
    /* 璀璨星图卡（popFaithMul）：人口信仰产出乘区（默 1，装卡 = 0.5 ⇒ −50%）。
     * 只作用在「人口基础项」上，不波及神庙/城堡/奇观等结构性乘区。 */
    var base = _faithPop * SB.CFG.FAITH_PER_POP
      * (SB.civic && SB.civic.cardPopFaithMul ? SB.civic.cardPopFaithMul(s) : 1);
    /* 2026-09-30 ERA3 两段新乘区：
     *   · castleFaithMul——政策卡「王权神授」装着时，城堡每级 +10%（没装卡 = 1）；
     *   · abbeyFaithMul——奇观「圣泰坦尼克修道院」建成时，每完成一个市政 +1%。
     * 都乘在**整段产出**上（含人口基础值），不进 faithMul（那是神庙段自己的乘区）。
     * ERA4（2026-10-01）：天赋神权卡给礁栖核心建筑每级 +10% 信仰（coreFaithMul，乘整段）；
     *   神权政体按学术区/市政区建筑等级给绝对量加成（theoFaithBonus，加在末尾、独立于乘区）。 */
    return (base * faithMul(s)
      * (1 + 0.10 * (s.perk.sacrament || 0))
      * (SB.civic && SB.civic.castleFaithMul ? SB.civic.castleFaithMul(s) : 1)
      * (SB.civic && SB.civic.coreFaithMul ? SB.civic.coreFaithMul(s) : 1)
      /* ERA8 市政《群星与神明》（2026-10-18 用户表解锁1）：信仰产出 ×(1+星空进度)。
       *   进度 = starExplore / STAR_CAP 小数（5% ⇒ ×1.05），破壳前恒 ×1。市政完成即生效（非卡）。 */
      * (s.civics && s.civics.starfaith
          ? 1 + (SB.CFG.STAR_CAP > 0 ? (s.res.starExplore || 0) / SB.CFG.STAR_CAP : 0) : 1)
      /* ERA8 两张动态信仰卡（星际广播每卫星 +5% / 我们在此 core+space 每级 +10%，装卡才生效）。 */
      * (SB.civic && SB.civic.dynFaithCardMul ? SB.civic.dynFaithCardMul(s) : 1)
      * (SB.wonder && SB.wonder.abbeyFaithMul ? SB.wonder.abbeyFaithMul(s) : 1)
      * (SB.wonder && SB.wonder.throneFaithMul ? SB.wonder.throneFaithMul(s) : 1)
      /* ERA9 寰宇教会政体（faithMul=1.5）：信仰产出 ×1.5（乘整段，与 castle/core 同口径）。
       * 黑色方碑建筑（faithMulPerLvl=1.05，2026-10-24 用户拍板改）：每级全局信仰产出 ×1.05（乘整段）。
       * 曲线：1.05^14 = 1.9799（未到 ×2）｜1.05^15 = 2.0789（首次越过 ×2）⇒ 软上限 ×2 需 15 级。 */
      * (SB.civic && SB.civic.govFaithMul ? SB.civic.govFaithMul(s) : 1)
      * (SB.civic && SB.civic.buildingFaithMul ? SB.civic.buildingFaithMul(s) : 1)
      /* ERA10 市政《我们的海》（2026-10-20 用户表）：信仰产出 −30%（×0.7，乘整段，装卡才生效）。
       * ⚠️ faithRate 没有像 sciOutMul 那样的通用 cardFieldMul 通道（它是一长串硬编码乘区），
       *    所以这里单开一条读数；没装卡返回 1，不污染产线。 */
      * (SB.civic && SB.civic.cardFaithOutMul ? SB.civic.cardFaithOutMul(s) : 1)
      + (SB.civic && SB.civic.theoFaithBonus ? SB.civic.theoFaithBonus(s) : 0)
      + (SB.civic && SB.civic.faithPerBuildingBonus ? SB.civic.faithPerBuildingBonus(s) : 0))
      * (SB.challenges ? SB.challenges.productionMul(s) : 1);   // ERA6 教权国：所有建筑每级 +1 信仰/秒
  }

  /* ⚠️ 全文件单位铁律：凡是「每秒速率」，写进资源池时必须 × dt。
   * tick 的默认步长 STEP=0.1 秒，也就是每秒跑 10 个 tick——任何漏乘 dt 的速率，
   * 实际产出都会是面板显示值的 10 倍。这条曾经坏过：tick 里只有 fuel 那行乘了 dt，
   * 于是地热相对其他产线弱 10 倍，祭坛在这套单位下根本不成立。
   * 判定标准（改代码时逐条过）：`rates()` 里的每一项 = tick 里同一项的 ×dt 形式在 dt=1 时的取值。 */
  function tick(s, dt, emit, opts) {
    return SB.economyTickParts.tick(s, dt, emit, opts);
  }

  /* ⚠️ 幸福度恒温器（从 economy-tick.js 的 step 4c 抽出单一真源）：推进 s.happy 一个 dt。
   *   —— 离线半解耦路径里食物/人口积分器需要在 0.1s 栅格上重采样 happy（foodRate 读
   *      s._happySnap，逐 0.1s 重新冻），才能与「逐 0.1s tick」参考路径逐位一致；若只在
   *      2s 整块推进一次 happy，foodRate 会整段吃「开场 happy」而偏高（实测 +13.6 kelp/2s）。
   *   —— 这里只推进 happy 与奢侈品存量，「不」动 _happySnap（_happySnap 由调用方在每次
   *      重采样前自行置为当前 s.happy，与 tick 开头 line 43 同纪律）。
   *   —— 抽出后 tick 的 step 4c 直接调它，行为逐位不变（纯重构）。 */
  function happyStep(s, dt) {
    var _gb = (SB.civic ? SB.civic.govHappyBonus(s) : 0)
      + (SB.wonder ? SB.wonder.happyBonus(s) : 0)
      + (SB.civic ? SB.civic.cardHappyOffset(s) : 0)
      + (SB.wonder ? SB.wonder.skydrillHappyOffset(s) : 0)
      /* 潮汐之树（2026-10-23）：安乐之治（happiness）每级 +1 幸福度基线，与政体/奇观偏移同口径。 */
      + ((s && s.perk && s.perk.happiness) || 0);
    var _tMer = toolMul(s, 'merchant');
    var _uLux = upgSum(s, 'luxuryMul');
    var _lp = luxuryPactMul(s);
    var _bank = bankMul(s);
    /* ⚠️ 2026-10-21 同族修复（与 foodRate 那条一起）：商人原先也直接读 `s.jobs.merchant`，
     *    而 rates() 的 luxury 产能用的是 `j = effJobs(s)` ⇒ 机器人被分配到商人时
     *    **面板显示涨、实账不涨**（正好是 foodRate 的反向病：一边少算、一边多算）。
     *    改读 effJobs 后两侧同口径；同样**不能**再乘 folkOutputMul（effJobs 内部已乘）。
     *    ⚠️ scribe（市政点）那行**不改**：robotJobAllowed 明确剔除 scribe/scholar，
     *       effJobs 不会给它们加机器人口，两种写法逐位等价，改了只是多一次对象分配。 */
    var _ejM = (SB.folk && SB.folk.effJobs) ? SB.folk.effJobs(s) : null;
    var _S = (_ejM ? (_ejM.merchant || 0) : ((s.jobs.merchant || 0) * folkOutputMul(s)))
      * SB.UNIT.luxury * _tMer * baseMul(s) * unifiedMul(s)
      * (SB.civic ? SB.civic.govLuxuryMul(s) : 1) * (1 + _uLux) * _lp * _bank
      * (SB.wonder ? SB.wonder.bazaarLuxMul(s) : 1)
      * (SB.civic ? SB.civic.cardJobOutMul(s) : 1);   // ERA7 延长工时卡：商人产出 +30%（与面板 happySupply 同式，面板===结算）
    var _Hmech = (s.happy || 0) - _gb;
    var _D = (s.pop || 0) * SOCIAL.happyCost(_Hmech) * SOCIAL.luxDemandMul(s)
      * (SB.civic ? SB.civic.govHappyConsumeMul(s) : 1)
      * (SB.wonder ? SB.wonder.happyConsumeMul(s) : 1);
    addRes(s, 'luxury', _S * dt);
    s.res.luxury -= Math.min(_S, _D) * dt;
    s.happy = resUnlocked(s, 'luxury')
      ? Math.max(SB.CFG.HAPPY_FLOOR, _Hmech + SB.CFG.HAPPY_K * (_S - _D) * dt) + _gb
      : 0;
  }

  function rates(s) {
    return SB.economyRateParts.rates(s);
  }

  /* ⚠️ 资源可见性（2026-09-30 UI）：带 unlock 描述的资源在解锁前不显示。
   *   描述符：{tech:'X'} 研究 X / {build:'X'} 建成 X / {job:'X'} 指派 X / {civic:'X'} 解锁 X。
   *   省略 unlock = 核心资源，开局即显示。craft 资源另由 renderRes 分到「工艺资源」区。 */
  function resUnlocked(s, k) {
    if (!s) return true;
    var def = (SB.RESS && SB.RESS[k]) || {};
    var u = def.unlock;
    if (!u) return true;                       // 未声明 = 开局显示
    if (u.tech)  return !!(s.techs && s.techs[u.tech]);
    if (u.build) return !!(s.lvl && (s.lvl[u.build] || 0) > 0);
    if (u.job)   return !!(s.jobs && (s.jobs[u.job] || 0) > 0);
    if (u.civic) return !!(s.civics && s.civics[u.civic]);
    return true;                               // 未知描述符默认显示（不静默隐藏）
  }

  SB.economyInternals = {
    addRes: addRes, algaeCropMul: algaeCropMul, bankMul: bankMul, baseMul: baseMul,
    coldSeasonMul: coldSeasonMul, coralFarmMul: coralFarmMul, coralPactMul: coralPactMul,
    cultureRate: cultureRate, faithRate: faithRate, foodRate: foodRate, foodUse: foodUse,
    fuelRate: fuelRate, furnaceBoostMul: furnaceBoostMul, gatherMul: gatherMul,
    smeltingOutMul: smeltingOutMul, folkOutputMul: folkOutputMul,
    globalMul: globalMul, ironFlow: ironFlow, isCold: isCold, isFull: isFull,
    libraryLevel: libraryLevel, luxuryPactMul: luxuryPactMul,
    minerPactMul: minerPactMul, quarryPactMul: quarryPactMul, furnaceEffMul: furnaceEffMul,
    hydroshopEffMul: hydroshopEffMul, hydroshopBoostMul: hydroshopBoostMul,
    scholarPactMul: scholarPactMul, scribePactMul: scribePactMul,
    observatoryBonusPct: observatoryBonusPct, obsSciMul: obsSciMul, resUnlocked: resUnlocked, seasonTurn: seasonTurn,
    steelFlow: steelFlow, steelRate: steelRate, toolMul: toolMul, upgSum: upgSum,
    warmBurningNow: warmBurningNow, warmCap: warmCap, warmEff: warmEff, warmRelief: warmRelief,
    /* ERA8：θ生物金属产线（tick 走 thetaFlow、rates 走 thetaRate，与 steelFlow/steelRate 对同构）。 */
    thetaFlow: thetaFlow, thetaRate: thetaRate, thetaInputRates: thetaInputRates,
    /* ERA10（2026-10-20）：unifiedMul / globalMulX / dysonPct / solarRingOut 进 internals——
     * tick/rates 两文件从 P(economyInternals) 取读数，只挂 SB.economy 本体它们拿不到
     * （thetaFlow 首跑 e2e 崩过的同款坑）。 */
    unifiedMul: unifiedMul, globalMulX: globalMulX, dysonPct: dysonPct, solarRingOut: solarRingOut,
    /* ERA10 市政（2026-10-20）：三座发射场的单一读数落点——tick 2f 与 rates 都从 P 取，
     * 不在各自文件里重写「求和 / 节律 / 每级耗流」（三处同源铁律）。 */
    launchBids: launchBids, launchLvl: launchLvl, launchActiveLvl: launchActiveLvl,
    launchRunLvl: launchRunLvl, launchProcOf: launchProcOf,
    setLaunchProc: setLaunchProc, resetLaunchProcs: resetLaunchProcs, launchNodeMode: launchNodeMode,
    launchMaterialPer: launchMaterialPer, launchCycleOf: launchCycleOf, launchHydroPer: launchHydroPer,
    starTerraformDuration: starTerraformDuration, starNuclearHydroMul: starNuclearHydroMul, starAlienOutputMul: starAlienOutputMul,
    starOrbitalJobMul: starOrbitalJobMul,
    activeSiltpit: activeSiltpit, autoDrillCount: autoDrillCount, autoDrillOutputMul: autoDrillOutputMul,
    activeWorkshops: activeWorkshops, industrialRobotOutputMul: industrialRobotOutputMul,
    /* ERA2-7 扩卡（2026-10-22）：科技产出读数（启蒙沙龙卡把 15% 科技转市政点，tick/rates 同源）。 */
    sciOut: sciOut
  };
  SB.economy = {
    fmt: fmt, fmtAmt: fmtAmt,
    /* ERA8：θ生物金属产线（tick 走 thetaFlow、rates 走 thetaRate，与 steelFlow/steelRate 对同构）。
     * ⚠️ 必须挂在 SB.economy 本体——economy-rates.js 的 rates() 调 SB.economy.thetaRate，
     *    只进 economyInternals（sim 侧 P 表）运行时拿不到（首跑 e2e 即因此崩）。 */
    thetaFlow: thetaFlow, thetaRate: thetaRate, thetaInputRates: thetaInputRates,
    rOf: rOf, starRate: starRate, spaceCostMul: spaceCostMul, isCold: isCold, popCap: popCap, isFull: isFull,
    growthDuration: growthDuration, lvlSum: lvlSum,
    enough: enough,
    /* ⚠️ upgSum 导出（2026-09-29 工坊升级 craftRatio）：工坊效率的第五个加法来源
     *    （建筑级 / 奇观 / 科技 / 政体 / 工坊升级）读它就位，单一聚合函数避免各模块重算漏键。 */
    upgSum: upgSum, observatoryBonusPct: observatoryBonusPct,
    seasonIdx: seasonIdx, season: season, seasonMeta: seasonMeta, warmBurning: warmBurning,
    seasonTurn: seasonTurn, seasonGrant: seasonGrant, freezeChance: freezeChance, rollFreeze: rollFreeze,
    capOf: capOf, addRes: addRes, resUnlocked: resUnlocked,
    activeSiltpit: activeSiltpit, autoDrillCount: autoDrillCount, autoDrillOutputMul: autoDrillOutputMul,
    activeWorkshops: activeWorkshops, industrialRobotOutputMul: industrialRobotOutputMul,
    /* coreLvl（2026-10-06 城堡「真升级」）：统治核心等级 = 议事厅的等级。
     *   城堡是它买下工坊升级 `upg_castle` 之后的新**名字**，不是第二座建筑 ⇒ 就是 lvl.hall。
     *   三条每级效果（减耗 / 市政点 / 容量轴基数）与面板注脚都读它。
     *   导出是为了 e2e 与 UI 能直接断言这个读数，不必把口径抄四遍。 */
    coreLvl: coreLvl, hallDiscount: hallDiscount, hallDiscountLimit: hallDiscountLimit,
    costOf: costOf, scaffoldAdjustedCost: scaffoldAdjustedCost,
    costTxt: costTxt, costOwnedTxt: costOwnedTxt, canAfford: canAfford, pay: pay,
    /* farmMul / gatherMul 成对导出（2026-09-27 工坊工具）：工具就是插在这两条乘区上的，
     * 回归必须能直接读乘区本身 —— 读 foodRate 会被 byBuild 那一份稀释，测不出精确的 ×1.8。 */
    farmMul: farmMul, gatherMul: gatherMul,
    /* ⚠️ globalMul 一并导出（2026-09-28 灯塔）：它是「全资源产出」那条乘区的**宿主**，
     *    与 gatherMul / farmMul 同类。导出它，回归才能直接读乘区本身；只测 rates() 会被
     *    各项的减项稀释，测不出「乘区到底有没有挂上去」。 */
    globalMul: globalMul, baseMul: baseMul,
    /* ERA10（2026-10-20）：unifiedMul / globalMulX / dysonPct 导出。
     * unifiedMul = 大统一方程全产轴（除科技/市政/信仰）；globalMulX = globalMul × unifiedMul
     * （非科技/市政/信仰产出行专用）；dysonPct = 戴森进度单一读数源（tick 通关判定 /
     * condMet('dysonPct') / 星图面板三处共用，公式只此一处）。 */
    unifiedMul: unifiedMul, globalMulX: globalMulX, dysonPct: dysonPct,
    /* ERA10 市政：发射场读数落到公共 API（UI / e2e 要读——卡片切换钮与断言都调它）。 */
    launchLvl: launchLvl, launchActiveLvl: launchActiveLvl, launchRunLvl: launchRunLvl,
    launchProcOf: launchProcOf, setLaunchProc: setLaunchProc, resetLaunchProcs: resetLaunchProcs,
    launchNodeMode: launchNodeMode, launchMaterialPer: launchMaterialPer,
    launchCycleOf: launchCycleOf, launchHydroPer: launchHydroPer,
    starTerraformDuration: starTerraformDuration, starNuclearHydroMul: starNuclearHydroMul, starAlienOutputMul: starAlienOutputMul,
    starOrbitalJobMul: starOrbitalJobMul,
    /* ⚠️ 幸福度三函数导出（2026-09-28 陆地贸易）：回归取证用。
     *   happyMul 是台阶式全产乘区（排除 luxury，防自激）；
     *   happyCost / happyBurn 是消耗面（rates 与 tick 同式，防面板撒谎）。 */
    happyMul: SOCIAL.happyMul, happyCost: SOCIAL.happyCost, happyBurn: SOCIAL.happyBurn,
    /* ⚠️ 2026-10-05：幸福度那行要向玩家摆「供给 / 需求」，所以把这两项导出去。
     *   `happySupply` 是**产能**（与 tick 的 _S 同式），`happyCostPer` 是裸的每人消耗。 */
    happySupply: SOCIAL.happySupply, happyCostPer: SOCIAL.happyCostPer,
    /* ⚠️ 2026-10-06 用户报「消耗把市政加的幸福度也算上了」：
     *   `happyMech` = 用于**计价**的幸福度（s.happy 剥掉政体/奇观/卡的常驻偏移），
     *   `happyBonusTotal` = 那份偏移本身。UI 要把两者摆出来（玩家才验得出
     *   「人口 × 每人 = 耗」这笔账），断言也要靠它们比对 tick 的 _D。 */
    happyMech: SOCIAL.happyMech, happyBonusTotal: SOCIAL.happyBonusTotal,
    /* luxSaveAll（2026-10-06 商队驿站接线）：居民侧奢侈品减耗的全部来源之和。
     *   导出是为了 e2e 能直接断言「每级 −1%」这条真的生效，而不必去反推 burn。 */
    luxSaveAll: SOCIAL.luxSaveAll,
    /* luxDemandMul（2026-10-14 净系数）：增耗三项与居民减耗单括号先抵消的结果。
     *   导出供 e2e 直接断言「抵消语义 + 钳 0」，与 luxSaveAll 同一理由。 */
    luxDemandMul: SOCIAL.luxDemandMul,
    /* ⚠️ 2026-10-05：档位表与 H 读数**收敛成一个口**，供 UI 显示「距下一档还差多少」。
     *   ⚠️ 别再在 render.js 里手抄档名/门槛 —— 此前 render:183 与本文件各存一份，
     *   改一处漏一处不报错，只会「面板写 ×0.92、结算按 ×0.80 算」。 */
    happyTier: SOCIAL.happyTier, happyOf: SOCIAL.happyOf, HAPPY_TIERS: SOCIAL.HAPPY_TIERS,
    /* happyTierList（2026-10-17）：门控后的档位表，UI 标签行与比例尺上限共用这一口。 */
    happyTierList: SOCIAL.happyTierList,
    /* ⚠️ 2026-10-05 用户拍板「要在幸福度那里写明产出多少、扣减多少」：
     *   把收支**四项**一次算清交给 UI，避免 render 自己拼数字（拼 = 第二份口径 = 会漂）。
     *   字段：out 产出/秒、burn 扣减/秒、net 净值/秒（out−burn，>0 回升、<0 下滑）、
     *        per 每人扣减、pop 人口、cap 硬底、tier 档位对象。
     *   ⚠️ burn 用 happyBurn（含政体/奇观减免），per 用 happyCostPer（裸值）；
     *      两者**故意不同** —— per 摆出来是让玩家自己验「人口 × 每人」这个乘法，
     *      若 per 写成减免后的值，就会出现「per × 人口 ≠ burn」而玩家算不明白账。 */
    happyLedger: function (s) {
      var out = SOCIAL.happySupply(s);
      var burn = SOCIAL.happyBurn(s);
      var H = SOCIAL.happyOf(s);
      var t = SOCIAL.happyTier(H, s);
      /* ⚠️ 2026-10-05 用户报「政体 +1 幸福度没展示」。
       *   【根因】政体/奇观/政策卡的幸福度加成是**常驻偏移量**（进 tick 的 _gb 基线），
       *   早就加进 s.happy 了 —— 但它在 UI 上**完全不可见**：玩家只看到一个总数，
       *   不知道其中有多少来自政体，于是「采用古典共和 ⇒ 幸福度 +1」这条收益在面板上等于不存在。
       *   【为什么要单列而不是只给总数】偏移量是**可开关的**（换政体就消失），
       *   与供需驱动的那部分性质不同。混在一个数里，玩家会以为幸福度只能靠供需爬。
       * ⚠️ 四项之和必须与 tick 里那个 `_gb` **逐项一致**（那是恒定器的基线来源）：
       *   政体 happyBonus + 奇观 happyBonus + 政策卡 happyOffset + 天穹钻机 skydrill。
       *   漏一项 ⇒ 面板摆的偏移之和与实际机制值对不上（面板撒谎家族的标准成因）。
       *   ⚠️ 别在这里另写一份汇总：直接调那四个已导出的函数，与 tick 同源。 */
      var bonusParts = [
        { label: '政体', v: SB.civic ? SB.civic.govHappyBonus(s) : 0 },
        { label: '王国大交易所', v: SB.wonder ? SB.wonder.happyBonus(s) : 0 },
        { label: '政策卡', v: SB.civic ? SB.civic.cardHappyOffset(s) : 0 },
        { label: '天穹钻机', v: SB.wonder ? SB.wonder.skydrillHappyOffset(s) : 0 }
      ];
      var bonus = 0, nonzero = [];
      for (var bi = 0; bi < bonusParts.length; bi++) {
        var bv = bonusParts[bi].v || 0;
        bonus += bv;
        if (Math.abs(bv) > 1e-9) nonzero.push({ label: bonusParts[bi].label, v: bv });
      }
      return {
        out: out, burn: burn, net: out - burn,
        per: SOCIAL.happyCostPer(s), pop: (s.pop || 0),
        H: H, cap: SB.CFG.HAPPY_FLOOR, tier: t,
        toNext: t.nextAt == null ? null : t.nextAt - H,
        K: SB.CFG.HAPPY_K,
        /* 偏移量：bonus 是四项之和，parts 是非零项明细（UI 逐条摆，别只给和）。 */
        bonus: bonus, bonusParts: nonzero,
        /* ⚠️ 2026-10-06 用户报 bug 加的两个字段：
         *   `mechH` = **用于计价**的幸福度（H 剥掉上面那份 bonus）——消耗单价按它算，
         *     政体/奇观/卡的加成**不会**让居民变贵（与 tick 的 _D 同一口径）。
         *   UI 要把它摆出来，玩家才验得出「人口 × 每人 = 耗」这笔账。
         *   ⚠️ 这里的 mechH 用**本地那份 bonus 之和**而不是再调 happyMech(s) ——
         *     两者必须相等（本函数那四项与 happyBonusTotal 是同一组调用），
         *     e2e 有断言钉死这一点；用本地值是为了不把「面板与结算不同源」的风险引进来。 */
        mechH: H - bonus,
        /* bonus 计入 H ⇒ 玩家真正要靠供需去补的净需求其实是
         *   `burn − out − bonus`（政体替你付了一部分）。这行让「我该雇几个商人」算得准。 */
        netNeed: burn - out - bonus
      };
    },
    /* JOB_SINK 导出是为了回归取证：e2e 拿这张表逐个职业查「economy.js 里有没有真的
     * 消费这个职业」，写错职业 id（'gather' 打成 'gatherer'）不报错、只会静默不生效。 */
    JOB_SINK: JOB_SINK, toolMul: toolMul, bankMul: bankMul,
    warmCap: warmCap, fuelRate: fuelRate, cultureRate: cultureRate,
    /* ⚠️ 2026-10-05 flow 模型：hydroAlloc 是「热液能流分配」唯一权威只读函数（tick 与 rates 共用），
     *   导出是为回归取证与 shell.js 的天穹钻机读剩流。纯函数只读 s，可安全调用。 */
    hydroAlloc: hydroAlloc,
    /* ⚠️ 2026-10-13 导出 warmEff：暖石门控降耗乘子（refine/specfuel 各 ×0.7），
     *   暖石面板要显示汽轮机每秒暖石消耗的**真实值**（= 运行座数 × hydroWarm × warmEff），
     *   不导出则 UI 只能按基准值谎称，降耗科技上线后数字对不上（面板撒谎家族）。纯函数只读 s。 */
    warmEff: warmEff,
    /* ⚠️ 2026-10-16 导出 warmDraw：某设备每秒暖石消耗（额定口径），
     *   巢穴页热泉炉 / 热液汽轮机的「开几座」控件行直接标这个数，
     *   玩家不用去环境卡说明里找「它在吃多少石」。纯函数只读 s。 */
    warmDraw: warmDraw,
    /* ⚠️ 2026-10-17 导出 consumeRates：某设备每秒吃掉的**全部**原料（金属/暖石/热液能）。
     *   取代 UI 各拿到 warmDraw 就以为「消耗只有暖石」的半截口径（热泉炉还吃金属、
     *   热液工坊吃热液能+金属）。巢穴页控件行与建筑信息卡共用这一处，绝不允许再分叉。 */
    consumeRates: consumeRates,
    /* ⚠️ faithRate / faithMul 导出是为了回归取证：乘区本身可读才测得准
     *    （只测 rates.faith 会被「基础产出为 0」恒乘以 0，看不出乘区有没有挂上）。
     *    同理 libraryLevel 导出——虚级是「效果级」，只能直接读才知道有没有接进科技产出。 */
    faithRate: faithRate, faithMul: faithMul, faithAllMul: faithAllMul, libraryLevel: libraryLevel,
    foodUse: foodUse, foodRate: foodRate, seasonMul: seasonMul,
    /* ⚠️ 2026-10-05 新增 5 条资源线乘区的导出。
     *   【为什么必须导出】这些函数本来只在 economy 内部用（tick / rates / foodRate），
     *   但「乘区真的生效了吗」只能从模块表面直接读数来验 —— 不导出时回归 650/650 全绿，
     *   却**没有一条断言碰过它们**，等于新 perk 上线时裸奔（判据：新增乘区必须可从表面取证）。
     *   都是纯函数（只读 s.perk），渲染路径可安全调用。 */
    coralPactMul: coralPactMul, algaeCropMul: algaeCropMul,
    minerPactMul: minerPactMul, quarryPactMul: quarryPactMul, furnaceEffMul: furnaceEffMul,
    hydroshopEffMul: hydroshopEffMul, hydroshopBoostMul: hydroshopBoostMul,
    scholarPactMul: scholarPactMul, scribePactMul: scribePactMul,
    furnaceBoostMul: furnaceBoostMul, luxuryPactMul: luxuryPactMul,
    smeltingOutMul: smeltingOutMul, folkOutputMul: folkOutputMul,
    /* ⚠️ ERA6 公司系统（2026-10 实装）：公司产出加成 / 奢侈品消耗加成两读数。
     *   导出是因为公司页（render.paneCompany）要直接显示「藻食/珊瑚 产出 +X%」，
     *   不导出则 SB.companyMul 为 undefined、兜底走 1 ⇒ 加成恒显 +0%（面板撒谎）。 */
    companyMul: SOCIAL.companyMul, companyLuxMul: SOCIAL.companyLuxMul,
    companyCraftRatio: SOCIAL.companyCraftRatio,
    tenementLuxAdd: SOCIAL.tenementLuxAdd,
    /* warmRelief 必须导出：它是「这一 tick 顶回几成」的唯一权威读数，
     * 结算面板的 burning 提示、回归里那几条断言都读它。
     * ⚠️ 它有副作用（会烧石、会置 warmBurning），所以别在渲染路径里调用它——
     *    那会在玩家盯着面板看的时候偷偷烧掉一 tick 的暖石。要看 burning 用 warmBurning。 */
    warmRelief: warmRelief, warmBurningNow: warmBurningNow,
    rates: rates,
    tick: tick,
    happyStep: happyStep
  };
  /* ⚠️ 顶层挂 companyMul / companyLuxMul（与 companies.js 的 SB.companyTierIndex 同口径）：
   *   render.paneCompany 按顶层 SB.companyMul 读加成（沿用既有 `SB.companyMul ? ... : 1` 守卫），
   *   只导进 SB.economy 会让顶层为 undefined ⇒ 公司页加成恒显 +0%（面板撒谎家族）。 */
  SB.companyMul = SOCIAL.companyMul;
  SB.companyLuxMul = SOCIAL.companyLuxMul;
  SB.companyCraftRatio = SOCIAL.companyCraftRatio;
})(typeof window !== 'undefined' ? window : globalThis);
