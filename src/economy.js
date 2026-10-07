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
    var lg = SB.prestige ? SB.prestige.legacy() : null;
    var add = lg ? 0.02 * lg.coldStoreLevel : 0;
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
  /* ERA5（2026-10-02）：轮回商店「广厦之基」给的人口上限永久加成从 s.perk.popcap 出。
   * 加在末尾、用 `|| 0` 兜空 —— s.perk 在 freshRun 总被 emptyPerks 初始化（已含 popcap:0），
   * 这里再兜一层是为了老档/桩环境里 s.perk 万一是 undefined 也不炸 NaN。 */
  function popCap(s) {
    var p = s.perk || {};
    var popBuildLev = (s.lvl.nest || 0) + (s.lvl.coralhouse || 0) + (s.lvl.tenement || 0);
    return SB.BLD.houseBase
      + s.lvl.nest * SB.BLD.house
      + s.lvl.coralhouse * SB.BLD.house2
      + s.lvl.tenement * SB.BLD.tenementPop
      + (p.popcap || 0)
      + (p.housePlan || 0) * popBuildLev;
  }
  /* 「住满」= 人口已经顶到上限，下一胎不会来。
   * tick 的生育步、UI 的生育行、两个 sim 的「该不该盖房」都读它——
   * 三处各写一遍 `pop >= popCap` 迟早会有一处写成 `>`，
   * 症状是「差一人满员时白等一胎」这种不报错的空转。 */
  function isFull(s) { return s.pop >= popCap(s); }
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
  /* 未在 CAP_BASE 中的资源（现在只剩 science）为无限，不设浪费判定。
   * ⚠️ 判「表外」必须写 `=== undefined`。旧版是 `!SB.CFG.CAP_BASE[k]`，而 `!0 === true`
   *    ⇒ stone / warmstone 这两条**「明写 0」**的资源被当成了表外 ⇒ 整局无上限。
   *    当时的注释还写着「明写 0 与表外等价，且更清楚」——两者恰恰相反：
   *      明写 0 = 基础容量 0，但仍吃全局增量；缺键 = 永远 Infinity。
   *    「把自己说服了的注释」比没有注释更危险：它让一个 bug 看起来像设计决定。 */
  function capOf(s, k) {
    var base = SB.CFG.CAP_BASE[k];
    if (base === undefined) return Infinity;
    /* ⚠️ 2026-09-26 第三轮：**删掉「每建筑级给全局容量」那一轴**（旧 CAP_PER_LVL）。
     *    上限现在是「起步容量 + 专门的仓库建筑」—— 猫国形态。两条线各认自己的仓
     *    （藻食 → 海藻仓、材料 → 压舱仓），**不共用一个 store**，理由见 config 的两座仓库注。
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
    var lgS = SB.prestige ? SB.prestige.legacy() : null;
    var matMul = lgS ? (1 + 0.05 * lgS.matStoreLevel) : 1;
    if (!(typeof matMul === 'number' && isFinite(matMul) && matMul > 0)) matMul = 1;
    if (k === 'kelp') {
      /* ⚠️ 扩容升级是**乘法**，整套仓储线里只有它这一条是乘法 —— 见下面的 matCap。 */
      var kelpCastle = castleCapBonus(s);
      if (!(typeof kelpCastle === 'number' && isFinite(kelpCastle) && kelpCastle >= 0)) kelpCastle = 0;
      var kelpStorage = (typeof s.lvl.kelpstore === 'number' && isFinite(s.lvl.kelpstore) && s.lvl.kelpstore >= 0)
        ? s.lvl.kelpstore : 0;
      var kelpCapPerLevel = (typeof SB.BLD.kelpCap === 'number' && isFinite(SB.BLD.kelpCap)) ? SB.BLD.kelpCap : 0;
      var kelpCap = base + _sm * kelpStorage * kelpCapPerLevel + techKelpCap + kelpCastle;
      if (!(typeof kelpCap === 'number' && isFinite(kelpCap) && kelpCap >= 0)) kelpCap = base;
      return kelpCap
        * capUpgradeMul(s, 'upg_kelpstore_1')
        * capUpgradeMul(s, 'upg_kelpstore_2')   /* 2026-10-01 II 级扩容：与压舱库 II 同构，补上这条乘法轴（漏接 = 死升级） */
        * matMul;
    }
    /* 其余资源：基础 + 压舱仓（材料容量的**唯一**增长通道）。 */
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
      + matBonus;
    if (!(typeof matCap === 'number' && isFinite(matCap) && matCap >= 0)) matCap = base;
    var matCastle = castleCapBonus(s);
    if (!(typeof matCastle === 'number' && isFinite(matCastle) && matCastle >= 0)) matCastle = 0;
    var cap = (matCap + matCastle) * capUpgradeMul(s, 'upg_ballast_1') * capUpgradeMul(s, 'upg_ballast_2') * matMul;
    return (typeof cap === 'number' && isFinite(cap) && cap >= 0) ? cap : base;
  }

  /* 某道扩容升级装了没有 ⇒ 返回它的乘数（没装返回 1）。
   * ⚠️ 查的是表里的 `capMul` 而不是这个数写死在判断里，理由见 capOf 那条注。
   * ⚠️ `s.upgrades` 是**新字段**（2026-09-28）：老存档里根本没有它，
   *    ⇒ 一律走 `|| 1`（没装），不能让它把整条容量算成 NaN。 */
  function capUpgradeMul(s, id) {
    if (!s || !s.upgrades || !s.upgrades[id]) return 1;
    var L = SB.UPGRADES || [], i;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i].capMul || 1;
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
  function castleCapBonus(s) {
    if (!(s.upgrades && s.upgrades.upg_castle)) return 0;
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
   *   ★ 城堡（upg_castle）把「减耗效果 +50%」：每级省耗率与软上限**同时** ×(1 + hallSaveMul)，
   *     保证「每级省得更多」与「天花板更高」是同一档 +50%，不互相打架（旧版硬墙也是同乘一处）。
   *   ⚠️ 把原始省耗率 `_n*rate` 先 `Math.min(., lim)` 再进 `getLimitedDR`：该函数对
   *     effect > lim 会算出 NaN（负数底 fractional 幂），而我们这里 lim 仅 0.90、rate 0.02，
   *     约 45 级就到 lim——比容量轴（lim=1000、约 20 级到 lim）更易踩中，故加这道下限闸。 */
  var HALL_SAVE = 0.02;            // 每级原始省耗率（线性段的斜率）
  var HALL_DR_LIMIT = 0.90;        // 软渐近上限：省耗最多逼近 90%，造价地板 = 10%
  function hallMul(s) {
    var _n = coreLvl(s);
    if (!_n) return 1;
    var rate = HALL_SAVE * (1 + upgSum(s, 'hallSaveMul'));
    var lim  = HALL_DR_LIMIT * (1 + upgSum(s, 'hallSaveMul'));
    var eff  = getLimitedDR(Math.min(_n * rate, lim), lim);   // 走和容量轴同一道衰减曲线
    return 1 - eff;
  }
  // 单级增量成本。递增系数是建筑自己的 `ratio`（猫国 priceRatio），不是全局常数——
  // 住房 2.5 贵到买不动，产能建筑 1.12 便宜到可以一路铺开，这是两条不同的曲线。
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
    for (var k in b.cost) o[k] = b.cost[k] * Math.pow(b.ratio, n) * hm * gm * wm * isb * hsb * bsb;
    return o;
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
    for (var k in c) if (!enough(s.res[k], c[k])) return false;
    return true;
  }
  function pay(s, c) { for (var k in c) s.res[k] -= c[k]; }

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
  function coralPactMul(s) { return 1 + 0.10 * (s.perk.coralPact || 0); }
  /* 矿脉税契：石头 + 金属 + 暖石各 +10%/级（2026-10-05 拍板，不设上限）。落点 = rates.silt/stone/warmstone + tick 对应三行。
   * ⚠️ 一项管三线（与砂矿坑 siltBonus 同样形状），但**不碰钛**：钛是 2026-09-30 才开的新线，
   *    塞进「矿脉税契」会让老玩家以为买了就该涨钛，实际口径要等标定再说。 */
  function mineTaxMul(s) { return 1 + 0.10 * (s.perk.mineTax || 0); }
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

  /* 【天壳观测站】科技产出 +x%，x = min(20, 25000 / 当前冰壳厚度)。
   * ⚠️ 单位是**百分点**：返回的是 1 + x/100 的乘数（x=20 ⇒ ×1.20）。
   * ⚠️ 冰壳厚度的唯一真源是 `s.shell`（state 字段，顶栏「壳厚」显示的就是它）。
   *    别再造一个 shell.thickness() 之类的取数函数 —— 那份第二实现迟早与这里漂移。
   * ⚠️【读的是**同一秒的快照** `s._shellSnap`，不是现场 `s.shell`】这是本条最容易被掰折的一处：
   *    tickShell 在每一 tick 的**第 8 步**才削壳，而科技产出在第 4 步就算完了 ⇒
   *    tick 用的是「削之前」的壳厚、面板（tick 之后调 rates）读到的是「削之后」的 ⇒
   *    两边差一点点（实测 1.9e-9，正好越过 e2e「tick === rates」那 1e-9 的容差）。
   *    那是标准的「面板撒谎」，而且是差值越小越难被发现的那种。
   *    ⇒ 每 tick 开头把 `s.shell` 冻成 `_shellSnap`，两条路都读它：
   *      「结算」与「面板」用的是**同一份**壳厚，`面板 === 结算` 这条铁律才守得住。
   *      rates() 在没跑过 tick 时（例如刚开局渲染第一帧）读不到快照 ⇒ 回落到 s.shell。
   * ⚠️ 到 +20 就停：Math.min 裹在最外层，别写成 1 + min(20, …) 之后又乘别的东西。 */
  function obsSciMul(s) {
    var sh = (s._shellSnap != null ? s._shellSnap : (s.shell || 0)) || 1;
    var x = Math.min(SB.BLD.obsMaxBonus, SB.BLD.obsShellAnchor / sh);
    return 1 + x / 100;
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
    if (lg) m *= (1 + lg.oldFaithAllProductionBonus);
    return m;
  }
  function globalMul(s) {
    /* ⚠️ happyMul 排除 luxury 自身（见 happyMul 注）；faith 自身产出经 faithRate 不调 globalMul，
     *    故也不吃 happyMul —— 两条「反自指」纪律互不冲突。 */
    var m = baseMul(s) * happyMul(s);
    /* 点击时间事件的全产 buff（信仰显圣）：墙钟毫秒戳，命中则所有产出 ×(1+10%)。
     * ⚠️ 走墙钟而非逻辑时间：buff 是「玩家点了一下」的实时奖励，30 真实秒，不随倍速缩水；
     *    离线补算期间若戳仍在（≤30s 真实），buff 自然生效——属 bonus，不影响 8–14h 窗核算。
     * ⚠️ `s.eventAllUntil` 缺键（旧档 / e2e 未触发）时为 undefined ⇒ 走 `&&` 短路恒为 1，安全。 */
    if (s.eventAllUntil && (typeof Date.now === 'function' ? Date.now() : 0) < s.eventAllUntil) m *= 1.10;
    return m;
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
    return s.pop * SB.CFG.FOOD_PER * (1 - save);
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
    var byJob = s.jobs.gather * SB.UNIT.kelp * farmMul(s) * algaeCropMul(s);  // 职业侧：不吃季节；farm 乘区 + 潮田轮作 perk
    /* 只放大食物，别把 gatherMul（礁石平台/深潜/洋流增益）乘进来——
     * 那些倍率是「采集产出」的，礁石平台不该让藻场增产。
     * 之前错乘进来，食物产出虚高到 38/秒而消耗只有 2.6/秒，
     * 藻食全都撞在仓储上限上白流，生育却仍被住房那道墙卡死。
     * 【2026-09-26】住房墙已按用户要求**恢复**（软容量那版实测几乎没有约束力），
     * 现在生育受「口粮 + 住满」两道门管，见第 6 步与 economy.isFull。 */
    return (byBuild + byJob) * (cold || 1)
      * (1 + (s.lvl.weir || 0) * SB.BLD.foodWeir)                // 增旋钮：两条来源一起放大
      * globalMul(s);                                          // 灯塔的全资源乘区（与 rates 同式）
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
  function ironFlow(s, cold, dt) {
    var lv = s.lvl.furnace || 0;
    if (!(lv > 0)) return 0;
    /* 热泉炉「开几座」（2026-09-30）：运行座数 = 等级 − 停用数，夹到 [0, lv]。
     *   全停（run=0）等价于原来的 `furnaceOn === false`，两条路（tick 结算 / rates 面板）
     *   都汇在这一处，门加这里天然同源。老档的布尔 furnaceOn 在 state.migrateRun 换算。 */
    var run = Math.max(0, lv - Math.max(0, s.furnaceStop || 0));
    if (run <= 0) return 0;
    var T = SB.tech ? SB.tech.mul(s) : null;
    var rate = SB.UNIT.iron * run * (T ? T.smelt : 1) * cold * (T ? T.craft : 1);
    /* 两种原料取**较小**的库存：哪样先见底就按哪样停，不会把一样抽成负数再白吃另一样。 */
    return Math.min(rate * dt, s.res.silt, s.res.warmstone);
  }

  /* ERA3 热液能系统（2026-09-29 起；2026-10-05 重做为 **flow 模型**）：
   * 热液能 = 电力式瞬态流，**不被储存**：汽轮机每台每 tick 产 `hydroOut` 流（受暖石门控），
   * 热液工坊 / 天穹钻机当场从这一 tick 的流里取用，取多少用多少，不留库存、不跨 tick 累积。
   * 优先级（用户拍板）：工坊（metalrefine 解锁，低阶科技）先吃满，天穹钻机（ERA5）吃剩的。
   * 纯函数 hydroAlloc 同时驱动 tick（steelFlow 副作用版）与 rates（steelRate 非变异版）⇒ 面板===结算。
   * ⚠️ 数值为待标定默认（config SB.UNIT.hydroOut / hydroWarm / hydroShopLvl / steelPerHydro / steelMetal）。 */
  function hydroAlloc(s, dt) {
    /* ⚠️ 热液汽轮机「开几座」（2026-10-07）：运行座数 = 等级 − 停用数（state.turbineStop），
     *   与热泉炉 furnaceStop 同口径。停产的汽轮机既不再供流、也不再参与暖石门控。 */
    var turL = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0)),
        shopL = Math.max(0, (s.lvl.hydroshop || 0) - (s.hydroshopStop || 0));
    /* ⚠️ 提前返回也必须**补齐全部键**（含三个 Rate）：少一个键，读它的人拿到 undefined
     *    而不是 0 —— steelFlow 的 `s.res.hydro = HF.supplyRate` 会把顶栏主数写成 undefined
     *    （解了 metalrefine 但一台汽轮机都没建时就是这样），rates().hydroSupply 同理。
     *    这种缺键不报错、只在面板上变成 NaN/undefined，属于「面板撒谎」家族。 */
    if (turL <= 0 && shopL <= 0)
      return { supply: 0, supplyRate: 0, shopDraw: 0, shopRate: 0, shopRatio: 0,
        skyDraw: 0, skyRate: 0, left: 0 };
    /* ERA5（2026-10-02）：高压热机管道(wonder_presspipe) 给热液能**供给侧 +10 绝对量**，
     *   走 wonder.hydroWonderMul 出口。与高压气泵升级的 hydroMul（乘区）是两回事，这里加法叠加。 */
    var _press = SB.wonder ? SB.wonder.hydroWonderMul(s) : 0;
    var supply = 0, rW = 1;
    if (turL > 0) {
      /* ⚠️ 暖石门控：暖石不够则汽轮机按比例降产（读 s.res.warmstone，但**不在此扣**——扣费只在 steelFlow）。 */
      var warmNeed = turL * SB.UNIT.hydroWarm * dt;
      var canWarm = Math.min(warmNeed, s.res.warmstone);
      rW = warmNeed > 0 ? canWarm / warmNeed : 0;
      /* ⚠️ 2026-09-30 ERA4：高压气泵(hydroMul) 只放大**汽轮机供给那一侧**，
       *    不放大工坊的需求 —— 反过来写会让「+50% 热液能」变成「多烧 50% 暖石」的方向错误。
       *   ⚠️ ERA5：_press 作为并联进汽口的绝对增量，同样乘 rW（按比例降产时管道也按比例供）。 */
      supply = (turL * SB.UNIT.hydroOut * (1 + upgSum(s, 'hydroMul')) + _press) * dt * rW
        * (SB.civic ? SB.civic.cardHydroMul(s) : 1);
    }
    /* 工坊（低阶科技先吃满）：从本 tick 流里取 min(需求, 供给)。 */
    var shopDemand = shopL * SB.UNIT.hydroShopLvl * dt;
    var shopDraw = Math.min(shopDemand, supply);
    var left = supply - shopDraw;
    /* 天穹钻机（ERA5）：从剩流里取 SKYDRILL_HYDRO/tick，且需共振钻头够（机器态判据见 shell.js）。
     * ⚠️ 2026-10-07 钻机改手动启动：这里也要认 skydrillOn——rates 与 tickShell 同源，
     *    否则钻机停着时顶栏速率行仍显示「钻机在吃热液能」（面板撒谎家族）。 */
    var skyDraw = 0;
    if (SB.wonder && SB.wonder.owned(s).wonder_skydrill && s.skydrillOn) {
      var hCost = SB.CFG.SKYDRILL_HYDRO * dt;
      if ((s.res.resonantDrill || 0) >= hCost && left >= hCost) skyDraw = hCost;
    }
    return { supply: supply, supplyRate: dt > 0 ? supply / dt : supply,
      shopDraw: shopDraw, shopRate: dt > 0 ? shopDraw / dt : shopDraw,
      skyDraw: skyDraw, skyRate: dt > 0 ? skyDraw / dt : skyDraw,
      shopRatio: shopDemand > 0 ? shopDraw / shopDemand : (shopL > 0 ? 1 : 0),
      left: left - skyDraw };
  }
  /* 副作用版（tick 调用）：算好流分配后**只扣暖石**，且把 s.res.hydro 写成「每秒供给」
   * （覆盖写，绝不再 += —— 这就是 flow 模型「不储存」的核心）。工坊据此产钢。
   * ⚠️ 单位铁律：这里存的是 **每秒**（÷dt 归一），不是「这一 tick 产多少」——
   *    顶栏主数要与速率行同口径（/s），否则 STEP 一变主数就跟着缩，量纲当场漂掉。 */
  function steelFlow(s, dt) {
    var HF = hydroAlloc(s, dt);
    s._hydroFlow = HF;                 // 留给 tickShell 的天穹钻机读剩流（同 tick 内 steelFlow 先于 tickShell）
    s.res.hydro = HF.supplyRate;       // ★ flow 模型：每 tick 覆盖写「每秒供给」，不累积库存
    /* 暖石扣费（唯一副作用落点）：按**运行座数**扣（state.turbineStop 已停的座不计）。 */
    var turL = Math.max(0, (s.lvl.hydroturbine || 0) - (s.turbineStop || 0));
    if (turL > 0) {
      var warmNeed = turL * SB.UNIT.hydroWarm * dt;
      s.res.warmstone -= Math.min(warmNeed, s.res.warmstone);
    }
    var shopL = s.lvl.hydroshop || 0;
    if (shopL <= 0) return 0;
    /* 工坊吃 from 流（HF.shopDraw），金属不足再按 metal 门控降钢（沿用旧口径，钢侧 metal 门控不进 rates）。
     * min 双限防抽成负数。 */
    var metalWant = HF.shopDraw * SB.UNIT.steelMetal;
    var canMetal = Math.min(metalWant, s.res.silt);
    var realHydro = metalWant > 0 ? HF.shopDraw * (canMetal / metalWant) : HF.shopDraw;
    s.res.silt -= canMetal;
    /* ERA5（2026-10-02）：废钢锻造(upg_wasteforge) 钢产出 +20%（steelBonus，加法乘区）。 */
    var out = realHydro * SB.UNIT.steelPerHydro * globalMul(s) * (1 + upgSum(s, 'steelBonus'));
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
    var HF = hydroAlloc(s, 1);
    var steel = HF.shopDraw * SB.UNIT.steelPerHydro * globalMul(s) * (1 + upgSum(s, 'steelBonus'));
    var hydro = -(HF.shopDraw + HF.skyDraw);
    return { steel: steel, hydro: hydro, hydroSupply: HF.supplyRate };
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
    var sqMulBase = ((s.jobs.scribe || 0) * SB.UNIT.culture * sqMul
      * (1 + upgSum(s, 'pressCul')) * scribeCiv
      + coreLvl(s) * SB.CFG.CIVIC.HALL_RATE
      + wonderBonus) * globalMul(s)
      * (SB.civic ? SB.civic.cardCivicOutMul(s) : 1);
    /* ERA4（2026-10-01）：历史哲学完成后，ERA1/2/3 每座奇观 +5 市政点/秒（wonderEraCivicBonus，
     * 绝对量、加在总量上、独立于乘区）。 */
    var lgC = SB.prestige ? SB.prestige.legacy() : null;
    var cMul = lgC ? (lgC.relicCultureMul * (1 + lgC.shopCivicBonus)) : 1;
    var cAdd = lgC ? lgC.oldArtworkCultureRate : 0;
    return (sqMulBase
      * (SB.wonder ? SB.wonder.cutterCivicMul(s) : 1)
      + (SB.civic ? SB.civic.wonderEraCivicBonus(s) : 0)
      + (SB.wonder ? SB.wonder.skydrillCivic(s) : 0))   // 天穹钻机破壳后（奇观态）：每秒 +100 市政点
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
    var base = s.pop * SB.CFG.FAITH_PER_POP;
    /* 2026-09-30 ERA3 两段新乘区：
     *   · castleFaithMul——政策卡「王权神授」装着时，城堡每级 +10%（没装卡 = 1）；
     *   · abbeyFaithMul——奇观「圣泰坦尼克修道院」建成时，每完成一个市政 +1%。
     * 都乘在**整段产出**上（含人口基础值），不进 faithMul（那是神庙段自己的乘区）。
     * ERA4（2026-10-01）：天赋神权卡给礁栖核心建筑每级 +10% 信仰（coreFaithMul，乘整段）；
     *   神权政体按学术区/市政区建筑等级给绝对量加成（theoFaithBonus，加在末尾、独立于乘区）。 */
    return base * faithMul(s)
      * (1 + 0.10 * (s.perk.sacrament || 0))            // 2026-10-05 拍板 祭祀唱诗 +10%/级（不设上限）
      * (SB.civic && SB.civic.castleFaithMul ? SB.civic.castleFaithMul(s) : 1)
      * (SB.civic && SB.civic.coreFaithMul ? SB.civic.coreFaithMul(s) : 1)
      * (SB.wonder && SB.wonder.abbeyFaithMul ? SB.wonder.abbeyFaithMul(s) : 1)
      + (SB.civic && SB.civic.theoFaithBonus ? SB.civic.theoFaithBonus(s) : 0);
  }

  /* ── 幸福度（陆地贸易，2026-09-28 落地）──
   * 两条轴：cost 面（消耗随 H 爬升，给 luxury 一个真实 sink）+ effect 面（台阶式全产乘区）。
   * 与 faith 轴正交：faith 是「攒得越多越强」的增益条；happy 是「断了就崩」的维护条。
   * ⚠️ 反自指：happyMul 不放大 luxury 产出（luxury 产出行用 baseMul，不调 globalMul），
   *    否则 幸福高→luxury多→幸福更高 正反馈 runaway。 */
  function happyCost(H) {
    /* 每人每秒消耗的奢侈品。H≤0 锁保底（luxury 不会在低谷堆积）；H>0 随 H 线性变贵。 */
    var c = SB.CFG.HAPPY_COST_BASE;
    if (H > 0) c += SB.CFG.HAPPY_COST_SLOPE * H;
    return c;
  }
  /* 幸福度的**机制值**（2026-10-06 用户报 bug：「消耗是不是把市政加的这些额外幸福度也算上去了」）。
   * 【根因】`s.happy` 里含政体 / 奇观 / 政策卡 / 天穹钻机的**常驻偏移量**，
   *   而本文件早先的 `happyCost(s.happy)` 把它们一并计进了**消耗单价** ⇒
   *   每 +1 加成 = 每人每秒多扣 0.010 × 人口。于是「政体 +1 幸福」这种纯增益，
   *   真实效果是**负的**（把居民养贵了），与设计意图正好相反。
   * 【tick 早就是对的】真正的结算（tick 的 _D）一直在用 `_Hmech = s.happy − _gb`
   *   算需求，注释也写着「+1 不额外烧 luxury，纯增益」——**只有这两个给 UI 用的
   *   读数函数漏剥了加成** ⇒ 面板显示的「耗」比真实扣的多。属面板撒谎家族。
   * 【本函数的作用】把那份偏移量单独算出来，供 happyBurn / happyCostPer /
   *   happyLedger 共用同一口径 —— 三处同源，不再各写一遍减法。 */
  function happyBonusTotal(s) {
    return ((SB.civic ? SB.civic.govHappyBonus(s) : 0)
      + (SB.wonder ? SB.wonder.happyBonus(s) : 0)
      + (SB.civic ? SB.civic.cardHappyOffset(s) : 0)
      + (SB.wonder ? SB.wonder.skydrillHappyOffset(s) : 0)) || 0;
  }
  /* 用于**计价**的幸福度 = s.happy − 加成。可以为负（加成大于当前幸福度时），
   *   happyCost 对 H≤0 走保底 0.005，与 tick 的 `_Hmech` 同一套分支，天然对齐。 */
  function happyMech(s) {
    return (s && s.happy ? s.happy : 0) - happyBonusTotal(s);
  }
  /* 居民侧「奢侈品减耗」的**全部来源**之和（2026-10-06 新增，替掉原先两处各写一遍的口径）。
   * 【为什么必须共用一个函数】它被两处读：**tick 的需求 D** 与 **rates 的 D**。
   *   此前那两处是同式复制（王国潮道 `canalLuxSave` + 三角贸易卡倍率），
   *   加第二条来源时极易「改了 tick 忘了 rates」⇒ 顶栏速率与真实扣费对不上。
   *   ⇒ 一处算完，两处只读。
   * 【来源清单（都是「居民侧」，语义不踩）】
   *   · 王国潮道 canal   每级 −0.3%（SB.BLD.canalLuxSave）
   *   · 三角贸易卡        运河那条额外 ×（2 = +100%），civic.canalSaveMul
   *   · 商队驿站 caravanserai 每级 **−1%**（SB.BLD.caravanseraiLuxSave，2026-10-06 用户拍板）
   *   两类都是「减需求 D、不动产出 S」，所以相加后统一乘 (1 − Σ)。
   *   Math.min(1, …) 是防负需求 D 的护栏：正常等级数远到不了 1（潮道受灯塔钳制，
   *   驿站 ratio 1.15 要 100 级才到 1.0）。 */
  function luxSaveAll(s) {
    /* ⚠️ `s.lvl` 必须判空：本函数被 happyBurn 读，而 happyBurn 是 **UI 面板的读数链**
     *   （happyLedger → paneCivic）。一旦这里抛错，市政页/顶栏的 innerHTML 会渲染到一半
     *   就断掉 —— 症状是「某页 DOM 缺节点」这种看起来毫不相干的红。
     *   （`happyMech` 早有同样的 `if (!s || !s.lvl) return 0` 防御，本函数跟上同一条纪律。） */
    var _lv = (s && s.lvl) || {};
    var canal = Math.min(1, (_lv.canal || 0) * (SB.BLD.canalLuxSave || 0)
      * (SB.civic ? SB.civic.canalSaveMul(s) : 1));
    var car = Math.min(1 - canal, (_lv.caravanserai || 0) * (SB.BLD.caravanseraiLuxSave || 0));
    return canal + car;
  }
  function happyBurn(s) {
    /* /秒 总消耗 = 人口 × 每人消耗。rates 与 tick 共用（同式，防面板撒谎）。
     * ERA4（2026-10-01）：商人共和国政体幸福度消耗 −30%（govHappyConsumeMul，乘整段）。
     * ⚠️ 2026-10-06：`happyCost` 的入参从 `s.happy` 改成 `happyMech(s)`（剥掉政体/奇观/卡
     *   的偏移）—— 与 tick 的 `_D` 逐项一致。加成不该让居民变贵，那笔账只在真实
     *   结算里算过一次，在这里再算一次就会与实际扣费对不上。
     * ⚠️⚠️ 2026-10-06 补乘 `luxSaveAll(s)`（王国潮道 + 商队驿站的居民侧减耗）。
     *   **这是本函数原先漏掉的一项**：tick 的 `_D` 一直乘着潮道减耗，而 `happyBurn` 没乘
     *   ⇒ 顶栏「产 X · 耗 Y」与真实扣费差着潮道那一份（面板撒谎）。
     *   上一轮加的「面板 burn == tick 实扣」断言没抓到，是因为夹具恰好没建潮道（canal=0）——
     *   **判据碰巧成立**，不是判据覆盖到了。教训：口径对齐的断言要**逐个来源**都跑一遍，
     *   否则漏掉的那项永远测不出来。 */
    return (s.pop || 0) * happyCost(happyMech(s)) * (1 - luxSaveAll(s))
      * (SB.civic ? SB.civic.govHappyConsumeMul(s) : 1)
      * (SB.wonder ? SB.wonder.happyConsumeMul(s) : 1);
  }
  /* 每人每秒消耗（2026-10-05 · 幸福度那行要摆出来给玩家看）。
   * ⚠️ 只给**政策调整前**的裸值：govHappyConsumeMul / happyConsumeMul 是政体与奇观给的
   *    减免，把它们算进去的话玩家会看到「每人 0.005」而实际被减免成 0.0035 ⇒ 对不上账。
   * ⚠️ 2026-10-06：入参同样改 `happyMech(s)`，这样「per × 人口 = burn」在加成存在时也成立。 */
  function happyCostPer(s) { return happyCost(happyMech(s)); }
  /* 贸易供给（产能）——**与 tick 里那个 _S 同式**，供 UI 报「供给/需求」。
   * ⚠️ 2026-10-05 用户报「没告诉玩家幸福度在被消耗」：面板原先只有幸福度一个静态数字，
   *    而奢侈品行的净速率在需求压倒产能时**恒为 0**（tick 是 `+= _S` 后 `-= min(_S,_D)`，
   *    min 取满 ⇒ 差额永远是 0）⇒ 从任何现有读数都看不出消耗。
   *    所以这里必须**独立复算产能**，把平衡式的两项原样摆给玩家。
   * ⚠️ 复算必须与 tick 的 _S 逐项一致（马具 toolMul · 政体 · 马镫升级 · bankMul · 大巴扎），
   *    漏一项就会让「面板说的供给」与「实际产出」不一致 —— 那是面板撒谎家族的标准成因。
   *    ✅ 银行那条直接复用现成的 `bankMul(s)`（不是自己写 `1 + lvl.bank×0.10`）：
   *    它里面还含 `civic.bankMerchantMul`，手写会漏掉市政那一半。
   * ⚠️ 若将来给商人加新的乘子，**这里要同步加** —— 又变成两套口径就会面板撒谎。
   *    e2e 有一条断言钉住「happySupply 与 tick 里 luxury 的毛产出相等」。 */
  function happySupply(s) {
    if (!s || !s.jobs || !s.jobs.merchant) return 0;
    return s.jobs.merchant * SB.UNIT.luxury
      * toolMul(s, 'merchant')
      * baseMul(s)
      * (SB.civic ? SB.civic.govLuxuryMul(s) : 1)
      * (1 + upgSum(s, 'luxuryMul'))
      * bankMul(s)
      * (SB.wonder ? SB.wonder.bazaarLuxMul(s) : 1);
  }
  /* 幸福度 → 全产乘区（台阶式，与文明6 同构：需求连续、效果分段）。
   * ⚠️ 排除 luxury 自身（luxury 产出行走 baseMul）：happy 增益不放大自己的燃料。 */
  function happyMul(s) {
    /* ⚠️ 读快照优先：tick 开头冻的 _happySnap 是「本 tick 开场 happy」，生产各行用的就是它
     *    （见 tick 里那段注释）。rates() 在 tick 之后调用时若读 s.happy（已被恒温器改小），
     *    面板会拿到下滑后的乘区而实账用下滑前的 ⇒ 面板撒谎。冻快照后两侧共用同一基准。
     *    无快照（未 tick 过 / 读旧档）回落 s.happy，行为不变。 */
    return happyTier(happyOf(s)).mul;
  }
  /* ⚠️ 幸福度读数统一走这一个口（2026-10-05 用户报「这里写得不清不楚」时收的）。
   *   【为什么抽出来】`happyMul` 与 UI 都需要 H，而它们必须读**同一份 H** ——
   *   读 s.happy 还是读 _happySnap 若各写一遍，tick 之后两侧就会拿到不同的 H
   *   （快照是开场值、s.happy 已被恒温器改小）⇒ 面板显示的档位与实账乘区对不上。 */
  function happyOf(s) {
    return (s._happySnap != null ? s._happySnap : (s.happy || 0));
  }
  /* 档位表**唯一真源**（2026-10-05）：档名 + 全产乘区 + 下一档门槛 + 下一档乘区。
   * ⚠️【为什么要收成一份】此前 render.js:183-184 把档名手抄了一遍、economy.js:995-1000
   *   把门槛手抄了一遍 —— 两份表**没有任何交叉校验**，改一侧漏另一侧不会报错，
   *   只会让「面板写着 ×0.92、结算实际按 ×0.80 算」这种错静悄悄生效。
   *   现在 UI 要显示「差多少到下一档」，必须知道 nextAt ⇒ 顺手把整张表收在这里。
   *   ⚠️ 下界 `lo` 只用于 UI 排序/取档，判定用 H 直接比大小即可，不要改成 lo 比较。 */
  var HAPPY_TIERS = [
    { name: '动荡',     lo: -2, mul: 0.80, nextAt: -1, nextName: '不满',     nextMul: 0.92 },
    { name: '不满',     lo: -1, mul: 0.92, nextAt: 0,  nextName: '安定',     nextMul: 1.00 },
    { name: '安定',     lo: 0,  mul: 1.00, nextAt: 1,  nextName: '愉悦',     nextMul: 1.05 },
    { name: '愉悦',     lo: 1,  mul: 1.05, nextAt: 2,  nextName: '欢欣',     nextMul: 1.10 },
    { name: '欢欣',     lo: 2,  mul: 1.10, nextAt: 3,  nextName: '欣喜若狂', nextMul: 1.20 },
    { name: '欣喜若狂', lo: 3,  mul: 1.20, nextAt: null, nextName: null,    nextMul: null }
  ];
  function happyTier(H) {
    for (var i = 0; i < HAPPY_TIERS.length; i++) {
      if (i === HAPPY_TIERS.length - 1 || H < HAPPY_TIERS[i + 1].lo) return HAPPY_TIERS[i];
    }
    return HAPPY_TIERS[0];
  }

  /* ⚠️ 全文件单位铁律：凡是「每秒速率」，写进资源池时必须 × dt。
   * tick 的默认步长 STEP=0.1 秒，也就是每秒跑 10 个 tick——任何漏乘 dt 的速率，
   * 实际产出都会是面板显示值的 10 倍。这条曾经坏过：tick 里只有 fuel 那行乘了 dt，
   * 于是地热相对其他产线弱 10 倍，祭坛在这套单位下根本不成立。
   * 判定标准（改代码时逐条过）：`rates()` 里的每一项 = tick 里同一项的 ×dt 形式在 dt=1 时的取值。 */
  function tick(s, dt, emit) {
    if (s.broken) return;
    s.t += dt;
    /* 换季判定必须排在读 cold 之前：冰封期是「这一季中没中」的状态，
     * 先换季再取 cold，否则开局那一 tick 会带着上一季的 frozen 跑。 */
    var _seasonChanged = seasonTurn(s);

    var cold = isCold(s) ? coldSeasonMul(s) : 1;
    var j = s.jobs;
    /* ⚠️【ERA4 天壳观测站的壳厚快照】把本 tick 开场时的冰壳厚度冻住，供 obsSciMul 两侧共用。
     *    为什么必须冻：削壳发生在本函数第 8 步（`SB.shell.tickShell`），
     *    而科技产出在第 4 步就算完了 —— 若不冻，同一秒内「结算用削前、面板用削后」，
     *    两边差一点点却天天存在，正是 `面板 === 结算` 这条铁律要拦的那一种。
     *    ⚠️ 这不是业务数据，不参与存档语义（读不回来就回落 s.shell，见 obsSciMul）。 */
    s._shellSnap = s.shell;
    /* ⚠️【happy 快照 · 与壳厚同一纪律】把本 tick 开场时的幸福度冻住，供 globalMul/happyMul
     *    两侧共用。为什么必须冻：本函数下面的恒温器会改 s.happy（断供时按 K·(S−D) 下滑），
     *    而**生产各行用的是 tick 开头缓存的 `_gm`**（即开场 happy 的乘区）。若 rates() 在 tick
     *    之后才读 s.happy（已被恒温器改小），面板会拿到「下滑后的 happyMul」而实账用的是
     *    「下滑前的」—— 这正是此前 5 条「面板石头/科技/市政点速率与 tick 不同源」红的根因
     *    （实账 0.96、面板 0.8832 = 0.96 × 0.92，0.92 正是 happy 掉到 −0.0001 那档乘区）。
     *    冻快照后 rates() 与 tick() 的生产共用同一份 happy 基准，面板 === 结算。
     *    ⚠️ 同样不参与存档语义（obsSciMul 那条同理）：读回旧档没有 _happySnap 时回落 s.happy。 */
    s._happySnap = s.happy;

    /* ⚠️ 2026-09-30 性能：tick 内聚合乘区缓存。
     *   globalMul / gatherMul 在一个 tick 内被重复调用多次（实测满档 globalMul 10 次、
     *   gatherMul 4 次），每次都遍历 TECHS/UPGRADES/TOOLS/CIVICS/WONDERS 全表。
     *   这些值在一个 tick 内恒定不变（自动解锁只在 game.js 实时泵里发生，tick 内部不写
     *   techs/civics/upg/wonder/tools；s.pop 虽在 tick 内会因生死变化，但上述乘区都不依赖
     *   pop），故在 tick 开头算一次、后面复用即可。纯性能优化，数学结果逐位不变
     *   （e2e「面板 == 实账」与「rates 各项」两条不变式守着）。
     *   ⚠️ 只有**同参同值**的调用才缓存（globalMul/gatherMul）；toolMul 按职业分四档、
     *   upgSum 按 key 分四档，每个都是唯一参数，缓存只是避免重复遍历，等价。 */
    var _gm = globalMul(s);
    var _gather = gatherMul(s);
    var _tCW = toolMul(s, 'coralwright');
    var _tQ = toolMul(s, 'quarrier');
    var _tM = toolMul(s, 'miner');
    var _tMer = toolMul(s, 'merchant');
    var _uSilt = upgSum(s, 'mineSilt');
    var _uWarm = upgSum(s, 'mineWarm');
    /* ⚠️ 2026-10-05 新增 6 条 perk 乘区的每 tick 缓存（与 _gm/_gather 同口径：
     *   tick 内 s.perk 不会被改 —— 买 perk 走 prestige.buyPerk，只写 meta.perks 与本局
     *   s.perk，而那发生在 tick 之外的游戏主循环里，故一个 tick 内恒定，可安全缓存）。
     * ⚠️ 别把这些改成惰性求值：`mineTaxMul(s)` 会被矿工那两行各调一次，
     *    不缓存等于每 tick 多跑 3 遍 —— 虽然纯函数不产生副作用，但与本段既有纪律不一致。 */
    var _cp = coralPactMul(s);
    var _mt = mineTaxMul(s);
    var _ac = algaeCropMul(s);
    var _fb = furnaceBoostMul(s);
    var _lp = luxuryPactMul(s);
    var _uInst = upgSum(s, 'instituteSci');
    var _uLux = upgSum(s, 'luxuryMul');
    /* ERA4（2026-09-30）：三条新乘区在 tick 这一侧也先算一次 —— 与 rates 侧读同一批函数，
     * 不允许在 tick 里另写一份算式（「面板 === 结算」那条铁律）。 */
    var _coralFarm = coralFarmMul(s);
    var _bank = bankMul(s);
    var _obs = obsSciMul(s);
    var _uPress = upgSum(s, 'pressSci');              // 雕版印刷机：学者 +30%
    var _cutter = SB.wonder ? SB.wonder.cutterSciMul(s) : 1;  // 天壳切削器：科技 +%（观测站等级）
    var _cv = SB.civic && SB.civic.flow ? SB.civic.flow(s) : null;
    /* ERA5（2026-10-02）：科技乘区在 tick 开头算一次（与 globalMul/gatherMul 同口径的
     *   每 tick 缓存），供下面的暖石/钛产出行读 warmMul / titaniumMul。rates 侧读 Tr（同函数）。 */
    var _T = SB.tech ? SB.tech.mul(s) : null;

    /* 1) 材料线两条入口。采集者产的是藻食（食物线，见 foodRate），不产材料。
     * 珊瑚 = 猫国 wood，原作 **只有 woodcutter 职业能产、没有产木材的建筑**，
     * 2026-09-25 用户拍板把「礁口采石场」建筑改回「珊瑚匠」职业，此处同构落地。
     * 【2026-09-26 金属归位】矿砂（silt id，显示名「金属」）同样改回**职业产出**：
     * 猫国 minerals 只由 miner 职业产（0.05/tick），mine 建筑不产矿、只给
     * mineralsRatio +0.2/级 —— 本行的 siltpit 自动产出是当年救断线的权宜，
     * 矿工职业上线后它就成了「建了砂坑凭空冒金属」，已删。
     * （旧注释「minerals 的对应物是 geologist」是错的：geologist 产煤。） */
    /* 工具按**职业**落点：斧只乘珊瑚匠，镐只乘采石工 + 矿工 ——
     * 买斧头石头不能涨、买镐珊瑚不能涨（2026-09-27 用户纠正）。
     * ⚠️ tick 与 rates 两处必须同式，否则「面板显示的值和实际进账不同」。 */
    if (j.coralwright > 0) {
      addRes(s, 'coral', j.coralwright * SB.UNIT.coral
        * _gather * _tCW * _coralFarm * _cp * cold * _gm * dt);
    }
    /* ⚠️ 2026-09-30 ERA4 · 钛：装了深层矿井(upg_deepmine) 后矿工伴生钛。
     *    门读的是 `s.upgrades`（买断升级），不是建筑等级 —— 与 rates.titanium 同一门同一式。 */
    if (j.miner > 0 && s.upgrades && s.upgrades.upg_deepmine) {
      addRes(s, 'titanium', j.miner * SB.UNIT.titanium * _gather * _tM * cold * _gm * (1 + (_T ? _T.titaniumMul : 0)) * dt);
    }
    /* 采石工产石头、矿工产金属（silt 这个 id）并**伴生暖石**。
     * 矿工是两条 addRes 而不是一条：暖石若淹死在金属那一行里，将来调 SB.UNIT.warmstone
     * 容易顺手以为它跟金属同量级，实际它是副产品（SB.UNIT.warmstone 0.05 vs SB.UNIT.silt 0.09）。
     * ⚠️ 两条都乘了 gatherMul —— 礁石平台/深潜是「采集」倍率，矿工手持的也是采集工具，
     *    与珊瑚匠同理；别把它当成加工倍率塞进 T.craft 那条线。
     * ⚠️ 金属那条还乘 siltMul（1 + 砂矿坑级数 × SB.BLD.siltBonus）——对标猫国 mine 的
     *    mineralsRatio；**暖石不乘**：砂矿坑给伴生副产品加成说不通（见 config SB.BLD.siltBonus 注）。
     * ⚠️ 青铜镐绑的是 **quarrier + miner 两个职业**，而矿工产两行（金属 + 暖石），
     *    所以金属与暖石这两处都得算上 miner 那套工具 —— 只乘金属会让暖石漏掉。 */
    if (j.quarrier > 0) {
      /* ⚠️ 2026-10-05 用户拍板：采石工也吃**砂矿坑**的 +20%/级（复用 siltBonus）。
       *    改前采石工是四家采集职业里**唯一没有建筑级乘区**的（矿工有砂矿坑、
       *    珊瑚匠/采集者都没有），而它的绝对产出 SB.UNIT.stone 0.30 却是除珊瑚匠外最高 ——
       *    「基数大但没有放大器」这条不对称让采石工在同一人口预算下永远弱于矿工
       *    （矿工 0.09 金属 + 0.05 暖石，却有 ×(1+0.2×级数) 可以一路涨）。
       *    【为什么复用 siltBonus 而不是新开 stoneBonus】两个乘区会变成两个旋钮，
       *    而「采石场」这个建筑已经被用户 2026-09-25 删掉（见 config.js:1551），
       *    采石线目前**根本没有专属建筑** ⇒ 新字段没有任何建筑能读它，必然变成死键。
       *    复用之后语义是「砂矿坑 = 矿脉设施，金属与石头同源」，与暖石不同：
       *    暖石仍是伴生副产品，**不乘**（见 SB.BLD.siltBonus 注）。 */
      var stonePit = 1 + (s.lvl.siltpit || 0) * SB.BLD.siltBonus;
      addRes(s, 'stone', j.quarrier * SB.UNIT.stone * stonePit
        * _gather * _tQ * cold * _gm * _mt * dt);
    }
    if (j.miner > 0) {
      var siltMul = 1 + (s.lvl.siltpit || 0) * SB.BLD.siltBonus;
      var mine = _tM;
      /* ERA3 矿场倍率（2026-09-29）：鱼骨矿井(upg_fishbonemine) 金属 +50%/暖石 +1000%，
       *   阿尔巴达热液大学(wonder_albada) 矿场产出 +人口数%。三条独立乘区，与砂矿坑 per-level 相加。 */
      var fishSilt = 1 + _uSilt;
      var fishWarm = 1 + _uWarm;
      var popMul = (s.wonders && s.wonders.wonder_albada) ? (1 + (s.pop || 0) * 0.01) : 1;
      addRes(s, 'silt', j.miner * SB.UNIT.silt * siltMul * fishSilt * popMul
        * _gather * mine * cold * _gm * _mt * dt);
      addRes(s, 'warmstone', j.miner * SB.UNIT.warmstone * fishWarm * popMul
        * _gather * mine * cold * _gm * (1 + (_T ? _T.warmMul : 0)) * _mt * dt);
    }

    // 2) 加工（2026-09-28 起改为**建筑自动**：熔炉建成就转，不再要匠人）
    /* ⚠️ 两样原料都按**同一份数**扣：fc 是「转了几份」，每份吃 1 金属 + 1 暖石、吐 1 精铁。
     *    ⚠️ 精铁产出是 `fc` 本身而不是 `fc × SB.UNIT.iron` —— 这个 1:1 是**沿袭**原有写法
     *       （改驱动方式之前也是这么算的），本轮只动「谁驱动 / 加哪种原料」，
     *       不动产出的量纲（量的标定留到那一步，见 ironFlow 上方那条 ⚠️④）。 */
    var fc = ironFlow(s, cold, dt);
    if (fc > 0) {
      /* ⚠️ 扣的两样原料用**未乘**的 fc（原料是按份扣的，灯塔不该让玩家少扣一份）；
       *    吐出来的精铁则乘 gm —— 与 rates.iron 那一行保持同一个 expr，别各写一套。 */
      s.res.silt -= fc;
      s.res.warmstone -= fc;
      addRes(s, 'iron', fc * _gm * (1 + upgSum(s, 'ironBonus')) * _fb);
    }

    // 2b) ERA3 热液能 → 钢（热液汽轮机产热液能、热液工坊吃能产钢；比例降产）
    steelFlow(s, dt);

    // 3) 地热（排在祭坛消耗之前，先产后烧）。这一行是唯一原本就乘了 dt 的，
    //    修单位时保持不动——它现在只是「铁律」的一个 conform 例子。
    if (j.craft > 0) addRes(s, 'fuel', fuelRate(s, cold) * dt);

    // 4) 科技
    /* 复用 tick 开头算好的 _T（与 globalMul/gatherMul 同口径的每 tick 缓存），避免重复遍历全表。 */
    var Tt = _T;
    /* ⚠️ 潮纹馆（2026-09-27 用户拍板）：不再是 `+0.05/级/秒` 的绝对产能，改成
     *    「每级 ×(1+lvl×sciRatio)」乘区，**只乘在学者产出上**。
     *    ⚠️ 括号位置是口径：乘区必须裹住 `j.scholar * SB.UNIT.sci` 这一项、且落在 library 项
     *    原来的位置上——写成 `(j.scholar*SB.UNIT.sci + ...) * (1+lvl*sciRatio)` 会把数值一起放大。
     *    ⚠️ scholar 为 0 时这项恒 0 ⇒ 潮纹馆完全无效，这是口径不是 bug（用户原话「加在学者的产出上」）。
     *    ⚠️ 下方 rates().science 必须与这里逐字同构（单位铁律：dt=1 时两者要相等）。 */
    /* ⚠️ 2026-09-28 研究所（institute）接在这里：`SB.BLD.instituteSci` 每级把学者产出
     *    再 ×(1+0.50)，与 library 的 `sciRatio` 同位置**相加**进同一个括号。
     *    ⚠️ 括号位置与 library 那条是同一个口径：乘区必须裹住 `j.scholar * SB.UNIT.sci`
     *        这一项，写成 `(j.scholar*SB.UNIT.sci + ...) * (1+...)` 会把数值一起放大。
     *    ⚠️ 这一行与下面 rates().science **必须逐字同构**（dt=1 时两者要相等）。
     *    ⚠️ 两处都要读 institute：只改这里 ⇒ 面板写 +50%、实际进账没变；
     *        只改 rates ⇒ 面板与结算打架。e2e「研究所的科技加成」两条各钉一路。
     * ⚠️ 2026-09-28 大图书馆与政策卡《历史记录》接在这里：
     *    · 图书馆那一项换成 `libraryLevel(s)`（真实等级 **+ 大图书馆虚级**）⇒
     *      「只加效果、不提高建筑所需材料」落在这一处：虚级只在这里被当成等级用。
     *    · 再乘 `libraryMul(s)`（政策卡《历史记录》的「图书馆效果翻倍」）。
     *      ⚠️【括号只裹图书馆那一份】`+ institute * instituteSci` 那一项在乘区**之外**
     *        ——翻倍的是「图书馆的效果」，不是研究所的。用户 2026-09-28 明确选了这一档。 */
    /* ⚠️ 2026-10-07 补漏（用户报「轮回遗产写着 +1.03/s 科技、实际不进账」）：
     *   tick 的科技三行（学者 / 市政卡 cv.science / 商人副产）都漏了 legacy 乘区
     *   （relicScienceMul 纪念奇观 +1%/座、shopScienceBonus 潮纹屏障 +10%/级），
     *   旧日潮纹碑石的固定速率（oldTideSteleScienceRate）更是**整条没有**——
     *   只在 rates() 有 ⇒ 面板撒谎家族。补齐后与 rates().science 逐字同构：
     *   乘区 ×1、平加项 ×dt（rates 是每秒口径，tick 是每 tick 口径）。 */
    var _lgSci = SB.prestige ? SB.prestige.legacy() : null;
    var _lgSciMul = _lgSci ? _lgSci.relicScienceMul * (1 + _lgSci.shopScienceBonus) : 1;
    s.res.science += j.scholar * SB.UNIT.sci
      * (1 + libraryLevel(s) * SB.BLD.sciRatio * (SB.civic ? SB.civic.libraryMul(s) : 1)
        + (s.lvl.institute || 0) * (SB.BLD.instituteSci + _uInst) * (SB.civic ? SB.civic.universityMul(s) : 1)
        + _uPress)
      * _obs * _cutter * (Tt ? Tt.sci : 1) * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * _gm
      * _lgSciMul * dt
      + (_lgSci ? _lgSci.oldTideSteleScienceRate : 0) * dt;

    /* 4b) 市政点的两条来源（书手 + 议事厅）与市政卡/政体的平坦加成。
     * 【为什么平坦加成走 SB.civic.flow 而不是塞进 tick 里】它们来源是玩家在市政页上的
     *    选择（政体 +5/s 藻食、神秘主义卡 +0.3/s 科技），属于市政模块；经济层只负责
     *    「把它们变成资源」，不替市政模块决定给多少。取不到就当没有，绝不参与运算。 */
    addRes(s, 'culture', cultureRate(s) * dt);
    var cv = _cv;
    if (cv) {
      /* ⚠️ 市政卡的平坦加成也是「产出」，同样吃灯塔的 +1% —— 与 rates 那两行同式
       *    （那里是 `(cv ? (cv.kelp || 0) : 0)` 各项各自乘）。 */
      if (cv.kelp) addRes(s, 'kelp', cv.kelp * _gm * dt);
      if (cv.science) s.res.science += cv.science * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * _gm * _lgSciMul * dt;
    }

    /* 4c) 商人产奢侈品（2026-09-28 用户规格 · 市政《对外贸易》解锁职业商人）。
     * ⚠️【此刻没有开销渠道，这是刻意的】用户明说「贸易系统与幸福度系统（这两个我们
     *    之后设计）」⇒ 本轮只铺资源线。等贸易规则落地，改动**只在这一行**加扣量，
     *    不必去翻别处。
     * ⚠️【乘 globalMul 与 cultureRate 同待遇】它是职业产出、不是加工产物，
     *    所以吃灯塔的全资源乘区（与 science / culture 那两行一致）。
     * ⚠️ 别漏 dt —— 本文件那条「写进资源池必须 × dt」的铁律就是被这行守着的。 */
    /* 4c) 幸福度恒温器 + 奢侈品产消（陆地贸易，2026-09-28 落地）。
     * ⚠️ 产出与消耗合在一处：luxury 既是 happy 的燃料，又有真实 sink（此前零消费端）。
     * 贸易供给 S = 商人产能（baseMul，不含 happy，防自激）；
     * 需求 D = 人口 × happyCost(H)（随 H 升变贵）；实际烧掉 = min(S, D)。
     * 恒温器 dH/dt = K·(S − D)：产能 > 需求 ⇒ H 升（欢欣），< ⇒ H 掉（动荡），自动收敛到均衡 H*。
     *   ⚠️ 上一版写成 supply=实际烧掉量，导致 supply−demand ≤ 0 恒成立 ⇒ H 永远只掉不升
     *      （数学上永远到不了正档）。改用「商人产能 S」作供给才正确。
     * ⚠️ 无贸易产能（商人=0）⇒ 民生轴中性（H=0 安定），不惩罚——与「神学前信仰不生效」同源：
     *    贸易系统不存在时，幸福度不应凭空扣全产。 */
    {
      /* 政体（2026-09-29）：寡头统治 +20% 奢侈品产出。与马具 toolMul **独立相乘**
       * （工具是职业乘区、政体是制度乘区），且**不含 happyMul**（防自激，见 happyMul 注）。 */
      /* ERA4（2026-09-30）：奇观「王国大交易所」的幸福度 +1 —— 与政体那条**同一类**：
       *    它是**常驻偏移量**，必须一并剥掉再算机制值，否则每帧累进 ⇒ 幸福度无限上漂。 */
      var _gb = (SB.civic ? SB.civic.govHappyBonus(s) : 0)
        + (SB.wonder ? SB.wonder.happyBonus(s) : 0)
        + (SB.civic ? SB.civic.cardHappyOffset(s) : 0)
        + (SB.wonder ? SB.wonder.skydrillHappyOffset(s) : 0);   // 天穹钻机：运行态 −1 / 破壳后 +1
      var _S = (s.jobs.merchant || 0) * SB.UNIT.luxury * _tMer * baseMul(s)
        * (SB.civic ? SB.civic.govLuxuryMul(s) : 1)        // /秒 贸易供给能力（马具 +50%、寡头 +20%）
        * (1 + _uLux)                                      // 马镫工坊升级 +50%（与马具独立相乘 ⇒ +100%）
        * _lp                                              // 2026-10-05 奢侈品契：+3%/级（≤+60%），乘 S 不乘净速率
        * _bank                                            // 银行：每级商人产出 +10%（职业专精乘区）
        * (SB.wonder ? SB.wonder.bazaarLuxMul(s) : 1);     // 大巴扎：每名鲛人 +1% 奢侈品获取（奇观出口，纪律③）
      /* ⚠️ 2026-10-05 用户拍板（方案 A）：**删掉 `if (_S <= 0) { s.happy = _gb; }` 那条断供分支。**
       *   【它是什么 bug】同一个状态量有**两条更新规则**：else 分支是积分器
       *   （`H += K·(S−D)·dt`，连续演进），而断供分支是**一次性赋值** `s.happy = _gb`。
       *   `_gb` 是政体/奇观的**偏移量**、通常为 0 ⇒ **玩家把商人拉到 0 的瞬间，
       *   攒了几小时的幸福度一秒蒸发**。用户报「商人拉到 0 之后幸福度也直接清空了」。
       *   两条罪状：① 同一状态量两条语义不同的更新路径；② 注释自称「无民生不惩罚」，
       *   而它的实际效果恰恰是**惩罚玩家已攒的进度**（与意图相反）。
       * 【删掉之后为什么自洽】`_S = 0` 时自然落进积分器：
       *   · `Math.min(_S, _D) = 0` ⇒ **不烧任何奢侈品**（断供时库存不会被扣成负数）；
       *   · `H += K·(0 − D)·dt` ⇒ 幸福度**按恒定速率下滑**到 `HAPPY_FLOOR` 停住；
       *   · 再雇回商人 ⇒ 供给恢复 ⇒ H**重新爬升**（不是从 0 重新开始）。
       *   ⇒ 「断供 = 慢慢崩」而不是「断供 = 归零」，恒温器语义全程统一。
       * ⚠️【这让 2026-09-28 那条「贸易系统不存在时不惩罚」的设计前提失效 —— 而那个前提
       *    已经被同日的另一个改动作废：显示门从 `{job:'merchant'}` 改成 `{civic:'trade'}`
       *    （完成对外贸易就常显，商人一个都没有也显示）。那条设计的前提是
       *    「商人=0 时这条线根本不存在」，现在玩家看得见它、也看得见自己缺商人，
       *    断供就该有代价。**别把 `if (_S <= 0)` 加回来。** */
      {
        /* ⚠️ 政体幸福度是**偏移量**不是收敛增量：先剥掉上一帧偏移得纯机制值，
         *    用机制值算需求/收敛，最后加回偏移。否则每帧把 bonus 累进 _H，
         *    幸福度会无限上漂（与「happy 是状态量」冲突）。换政体瞬间即跳新偏移，符合直觉。 */
        var _Hmech = (s.happy || 0) - _gb;                  // 上一帧机制值（剥离政体加成）
        var _D = (s.pop || 0) * happyCost(_Hmech) * (1 - luxSaveAll(s)); // /秒 需求（用机制值算 ⇒ +1 不额外烧 luxury，纯增益）
        /* ⚠️ 产出走 addRes（不是直写 s.res.luxury）：addRes 内部会累加 s.got.luxury
         *   （累计产出台账）。「中世纪集市」鼓舞 = 累计奢侈品产出 10000 读的就是它
         *   （civics.js:174 的 {t:'gathered',r:'luxury',n:10000} → tech.condMet gathered 分支）。
         *   之前这里直写存量、绕过了 addRes ⇒ s.got.luxury 恒 0 ⇒ 该鼓舞永远点不亮
         *   （state.js:242 当年专门给 got.luxury seed 的意图就是让它涨，结果没接上）。
         *   capOf('luxury')=Infinity（CAP_BASE 不含它），故存量行为与直写完全一致，
         *   只多出了台账累加这一增量。消耗那行保持直减：消费不计入累计产出，
         *   且 addRes 对 v<=0 直接 return，减耗无法借它表达。 */
        addRes(s, 'luxury', _S * dt);                      // 产出（走 addRes ⇒ s.got.luxury 增长，gathered 鼓舞才点亮）
        s.res.luxury -= Math.min(_S, _D) * dt;              // 消耗：够烧烧需求，不够断供烧产能
        /* ⚠️ 2026-10-05 用户拍板：民生轴跟贸易解锁走（resUnlocked(s,'luxury') ⇔ s.civics.trade）。
         *   【为什么】恒温器原先无条件跑：贸易未解锁时商人=0 ⇒ S=0，而 D=人口×每人消耗>0
         *   ⇒ H 从开局就一路滑到保底 −2；显示门也是 trade ⇒ 玩家完成《对外贸易》那一秒
         *   看到第一眼就是负值（「一上来就是负的」）。改成：未解锁 ⇒ 民生轴不存在，
         *   H 恒 0（安定）、不积累负值，解锁瞬间从 0 起步；else 分支顺带把旧档里
         *   已经滑下去的 H 归位。已解锁后断供照旧「慢慢崩」（恒温器语义不变）。 */
        s.happy = resUnlocked(s, 'luxury')
          ? Math.max(SB.CFG.HAPPY_FLOOR, _Hmech + SB.CFG.HAPPY_K * (_S - _D) * dt) + _gb
          : 0;   // 贸易未解锁：民生轴不存在，恒 0
      }
      /* 4c') 商人副产（2026-09-30 · 市政《中世纪集市》解锁2）：每名商人同时产出
       *   科学 +0.05/秒、市政点（culture）+0.05/秒。市政**完成即生效**（这是解锁2，
       *   不是政策卡——没有「装卡」这道闸）。走 globalMul，与学者/书手同待遇。
       *   ⚠️ 放在 4c 块里（商人=0 时这段也是 0，不多算）；直接 +=，与本块 cv 段同款。 */
      if (s.civics && s.civics.market && s.jobs.merchant) {
        /* ERA5（2026-10-02）：学校每级给商人 +0.5 科技/s（SB.BLD.schoolMerchantSci），
         *   与中世纪集市的 +0.05/商人 同式相加进同一括号（同为「每商人」口径）。 */
        s.res.science += s.jobs.merchant * ((SB.BLD.marketJobSci || 0) + (s.lvl.school || 0) * (SB.BLD.schoolMerchantSci || 0)) * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * _gm * _lgSciMul * dt;
        s.res.culture += s.jobs.merchant * (SB.BLD.marketJobCulture || 0) * _gm * dt;
      }
    }

    /* 4d) 信仰（2026-09-28 用户规格 · 市政《神学》解锁的资源线与建筑「神庙」）。
     * ⚠️【神学前恒为 0，这是门控不是漏接】2026-09-30 修：faithRate 内部读 resUnlocked(s,'faith')
     *    （⇔ s.civics.theology），神学前直接 return 0 ⇒ 信仰不增长、全产加成也不触发。
     *    完成《神学》后才有基础产出（人口 × FAITH_PER_POP），神庙乘区叠加上去。
     *    与面板 faith 行 gate 同一条 unlock 判定，不再出现「后台偷偷攒信仰」的口径漏洞。
     * ⚠️ 别漏 dt —— 与上面 luxury 那行同一条铁律。 */
    addRes(s, 'faith', faithRate(s) * dt);

    // 5) 口粮（产/增/省/储四件事都在这里汇合）
    /* 暖石开关：它必须在 foodRate 之前算——烧掉多少决定了这一 tick 顶住多少，
     * 反过来「这一 tick 顶住了多少」又决定了下一 tick 还烧不烧（石不够就顶不住）。
     * 【warmBurning 是本帧的瞬时标记，不是存档字段】见第 8 步末尾的清位。 */
    s.warmBurning = false;
    var warm = warmRelief(s, dt);
    addRes(s, 'kelp', foodRate(s, cold, warm) * dt);
    s.res.kelp -= foodUse(s) * dt;
    if (s.res.kelp < 0) {
      s.res.kelp = 0;
      s.famine++;
      if (s.famine >= 60 && s.pop > 1) {
        s.pop--; s.famine = 0; s.famineDeaths++;
        SB.folk.reconcile(s);   // 减员后超额职业位退回闲置池
        if (emit) emit('藻食耗尽，有人饿死了。');
      }
    } else s.famine = 0;

    /* 6) 生育（两道门：口粮 + 住房）
     * 【2026-09-26 第二次改判：软容量 → 真硬上限，见 economy.popCap 的注】
     * 上一版是「只要有余粮就一直生，超住只减速」——实测那点减速（每超 1 人 +5%）
     * 几乎不起作用：上限 0 也能 41 分钟养到 18 人，而屏幕上却写着
     * 「族民 7（人口上限 2）」，玩家读到的只能是 bug。
     * 现在住满即停，原因由 UI 写出来（旧版拆硬墙怕的是「原因读不出来」，不是墙本身）。
     * ⚠️ 停摆时把 _grow 归零（不攒进度）：否则「盖好住房那一瞬间白送一个人」，
     *   而且玩家能卡准——先攒满进度条再点建造。归零也让 UI 的「停摆」态名副其实。 */
    if (!isFull(s) && s.res.kelp > SB.CFG.GROW_KEEP) {
      s._grow += dt;
      if (s._grow >= SB.CFG.GROW_NEED) { s._grow = 0; s.pop++; }
    } else s._grow = 0;
    s.peak = Math.max(s.peak, s.pop);

    // 7) 冻伤（仅冰封期）
    if (cold < 1) {
      s.coldTicks += dt;
      var risk = SB.CFG.FREEZE_CHANCE * (1 - warmCap(s) * 2) * dt;
      /* ⚠️ 2026-09-28：这里原本**裸调 Math.random**，于是每次跑 e2e 的整局时长都在抖
       *    （实测 7.79h / 8.22h 交替出现）—— 时长不可复现就没法拿来标定。
       *    economy.js 第 54 行那条「随机源走 SB.rng 而不裸调 Math.random」的纪律
       *    一直**只有注释没有实现**，缺的就是这一句。补上后模拟可复现；
       *    生产侧没有 SB.rng 时仍走 Math.random，玩家看到的随机性一点没变。 */
      if (s.pop > 1 && risk > 0 && (SB.rng ? SB.rng() : Math.random()) < risk) {
        s.pop--; s.frostDeaths++;
        SB.folk.reconcile(s);   // 减员后超额职业位退回闲置池
        if (emit) emit('冰封期冻死了一名族民。');
      }
    }

    // 8) 天壳推进（基础削壳 + 祭坛削壳）
    SB.shell.tickShell(s, dt, emit);

    /* ERA4（2026-10-01）：换季那一发资源不在 tick 里直接发——tick 中途状态半更新，
     * 此刻读 rates() 拿到的数值口径是脏的。只置标记，由 game 主循环在 tick 返回后、
     * 状态已自洽的时机调用 seasonGrant 发放（见 seasonGrant 注）。 */
    if (_seasonChanged && s.civics && s.civics.explore && (s.lvl.caravanserai || 0) >= 1)
      s._seasonGrantPending = true;
  }

  /* 每种资源的**净**速率（/秒），给 UI 显示总获得速率用。
   * ⚠️ 不是另写一套公式：逐项复用 tick 里的同款算式（含加工的 min(速率, 库存) 上限、
   * 祭坛烧燃料、口粮消耗），保证「面板显示的速率」与「实际结算」永不脱节。
   * 此前 UI 完全不显示速率，玩家只能看数字涨跌猜产线是否为正——尤其是
   * 热泉炉把矿砂转成精铁这类「一进一出」的中间资源，
   * 净值可能是负的（转出 > 产出），不显示根本无从发现。 */
  function rates(s) {
    var lg = SB.prestige ? SB.prestige.legacy() : null;
    var cold = isCold(s) ? coldSeasonMul(s) : 1;
    var j = s.jobs;
    /* 传 dt=1，即「一秒窗口」的流量。tick 传的是真实 dt，同一个函数两种窗口，
     * 于是「面板显示的速率」天然等于「实际每秒结算」，不会各写一套公式。 */
    var fc = ironFlow(s, cold, 1);
    /* 破冰祭坛（原燃料消耗方）已于 2026-10-07 撤除，燃料净值不再扣祭坛一份。 */
    var burn = 0;
    var Tr = SB.tech ? SB.tech.mul(s) : null;
    /* 市政卡/政体的平坦加成：与 tick 同源（同一个 SB.civic.flow）。
     * ⚠️ rates() 是纯读数，**绝不能调用有副作用的 civics 函数**（那会在玩家盯着面板时
     *    偷偷记账）；flow 只读 s.gov / s.card，是安全的。 */
    var cv = SB.civic && SB.civic.flow ? SB.civic.flow(s) : null;
    /* ⚠️ 每加一项 `cv` 字段都要配 `|| 0`（2026-09-27 踩到）：civic.flow 只在**政体/卡片
     *    真的带那个键时**才往 out 里写，其余时候返回 `{}`（没装卡时就是空对象）。
     *    写成 `+ (cv ? cv.kelp : 0)` 看起来对，但空对象是 truthy ⇒ cv.kelp 是 undefined
     *    ⇒ 1.375 + undefined = NaN ⇒ 面板上藻食速率直接显示 NaN，整条食物线没人看得懂。
     *    这类断链不抛错、不报警，只能靠 e2e 里「rates() 全项都有穷」那一条兜住。 */
    /* ⚠️ 暖石顶回（relief）必须并进面板路（2026-09-30 补）。
     *    tick 走 foodRate(s, cold, warmRelief(s, dt))，面板原先走 foodRate(s, cold) ⇒
     *    拨开关时顶栏速率纹丝不动，而实账真的在顶 —— 又一个「面板撒谎」。
     *    用户报的原话就是症状：「开关暖石产出完全没区别」。
     *    这里取 warmBurningNow（纯查询、无副作用）算 relief，**不能调 warmRelief**
     *    （它有副作用：会烧石、会置 warmBurning ⇒ 渲染路径里调 = 玩家盯着面板就偷烧一 tick）。 */
    var relief = warmBurningNow(s) ? SB.CFG.WARM_RELIEF : 0;
    /* ⚠️ 一次算好热液能三个数（产钢 / 净消耗 / 总生产）：steelRate 内部会跑 hydroAlloc，
     *    在 return 里连写三次等于每秒多跑两遍流分配，而 rates() 本来就重。 */
    var _sr = steelRate(s);
    return {
      kelp:    foodRate(s, cold, relief) - foodUse(s) + (cv ? (cv.kelp || 0) : 0),
      /* ⚠️ 2026-09-27 删骨材：这一项原先还减 `bc`（工坊把珊瑚转骨材那一笔）。
       *    那条加工线整体作废 ⇒ 珊瑚再没有加工消耗，净额就是采集者的产出。
       *    ⚠️ 别顺手把变量 `bc` 加回来——它已经被一起删了，加回引用会直接 ReferenceError。 */
      /* 工具按职业落点：斧只放大珊瑚匠，镐只放大采石工 + 矿工（tick 同式）。
       * ⚠️ 2026-09-30 ERA4：珊瑚林是**职业专精**乘区（研究所→学者同构），
       *    乘在珊瑚匠这一行、与工具乘区**独立相乘** —— 它不是被删掉的 gatherMul 全局轴。 */
      coral:   (j.coralwright || 0) * SB.UNIT.coral
                 * gatherMul(s) * toolMul(s, 'coralwright') * coralFarmMul(s) * coralPactMul(s)
                 * cold * globalMul(s),
      /* 与 tick 同源：金属只来自矿工，且同样吃 siltMul（砂矿坑加成）。tick 那边
       * 把 siltpit 自动产出删了之后，这里若还留着「+ lvl.siltpit × SB.UNIT.silt」，
       * 面板就会凭空多报一份金属——「面板撒谎」家族的标准成因（tick 路 === 面板路）。 */
      /* ⚠️ 减掉的那份 fc 是**扣**不是产，不乘 globalMul —— 乘了会变成「灯塔让 furnace
       *    每转一份白扣两份原料」。产出那一段与 tick 的 miner 行逐字同式（含 globalMul）。 */
      silt:    (j.miner || 0) * SB.UNIT.silt
                 * (1 + (s.lvl.siltpit || 0) * SB.BLD.siltBonus)
                 * (1 + upgSum(s, 'mineSilt'))
                 * ((s.wonders && s.wonders.wonder_albada) ? (1 + (s.pop || 0) * 0.01) : 1)
                 * gatherMul(s) * toolMul(s, 'miner') * cold * globalMul(s) * mineTaxMul(s) - fc,
      /* ⚠️ 2026-09-30 ERA4 · 钛（深层矿井 upg_deepmine 上线后才有产出）：
       *    与上面 silt/warmstone 同源同式（同一批 gatherMul・toolMul(miner)・cold・globalMul），
       *    只是多一道「装了深层矿井才产」的门。装的是**买断升级**（s.upgrades），不是建筑等级。 */
      titanium: (s.upgrades && s.upgrades.upg_deepmine)
                 ? (j.miner || 0) * SB.UNIT.titanium
                   * gatherMul(s) * toolMul(s, 'miner') * cold * globalMul(s)
                   * (1 + (Tr ? Tr.titaniumMul : 0))
                 : 0,
      /* stone / warmstone：与 tick 同源（同一个 gatherMul・cold 乘子）。
       * ⚠️ 暖石**只有伴生这一条来源**，没有建筑产它——保温法那道开关要烧的暖石全靠矿工，
       *    所以「矿工几个人」直接决定保温法能不能用，这是「采矿」这条线真正的分量。
       * ⚠️ 2026-10-05：stone 与 tick 的采石工行**逐字同式**（含砂矿坑 ×(1+级数×siltBonus)）——
       *    面板路漏掉这个乘区就是「面板撒谎」，见上面 silt 那条的同源警告。 */
      stone:   (j.quarrier || 0) * SB.UNIT.stone
                 * (1 + (s.lvl.siltpit || 0) * SB.BLD.siltBonus)
                 * gatherMul(s) * toolMul(s, 'quarrier') * cold * globalMul(s) * mineTaxMul(s),
      /* 暖石的净速率要减掉**开关正在烧的**那一份：不减的话面板上写着暖石在涨，
       * 玩家开着他以为只是在攒，实际有一路正在往火里扔。
       * 判据直接取 warmBurningNow（与 tick 里的 warmRelief 同源），不在这里重写条件，
       * 否则同一秒的显示会和实际结算对不上。
       * ⚠️ 2026-09-28 补减「熔炉正在吃的那一份」：铁器改成金属+暖石之后，暖石有了
       *    第二个去处。不减的话，玩家会看到暖石一路在涨（伴生 > 保温消耗）而实际有
       *    一路正在被炉子吃掉——同一个「面板撒谎」的坑，只是这次是两口消耗。
       *    ⚠️ 这里复用 fc（本秒转出的份数），与 tick 里扣 warmstone 的那一行同源。 */
      warmstone: (j.miner || 0) * SB.UNIT.warmstone
                 * (1 + upgSum(s, 'mineWarm'))
                 * ((s.wonders && s.wonders.wonder_albada) ? (1 + (s.pop || 0) * 0.01) : 1)
                 * gatherMul(s) * toolMul(s, 'miner') * cold
                 * globalMul(s) * (1 + (Tr ? Tr.warmMul : 0)) * mineTaxMul(s)
                 - (warmBurningNow(s) ? SB.CFG.WARM_RATE : 0) - fc,
      /* ⚠️ `iron` 记的是**消耗掉的原料份数**，不是产出的精铁量 —— 沿用原有口径。
       *    铁是「一进一出」的中间资源，净额可能比看起来还负（这里没有把金属那一侧的
       *    消耗减掉，与改造之前一致）。改这一行前先读铁器产出那段的量纲注。 */
      iron:    fc * globalMul(s) * (1 + upgSum(s, 'ironBonus')) * furnaceBoostMul(s),
      /* ERA3 热液能系统（2026-10-05 flow 模型）：steelRate 非变异版，与 tick 的 steelFlow 同式（dt=1）。
       *   steel = 工坊实际产钢速率；hydro = 本 tick **实际消耗**（工坊吃 + 钻机吃），作顶栏速率行（−M/s）。
       *   ⚠️ 顶栏热液能**主数**是 s.res.hydro（tick 写的供给快照），速率行才是这里的消耗 —— 二者分工见 render.js。 */
      steel:   _sr.steel,
      hydro:   _sr.hydro,
      /* ⚠️ hydroSupply = 热液能**总生产**（供给侧 /s，恒 ≥0）。与上一行 hydro（净消耗，取负）
       *    是两个不同口径，别合并：顶栏速率行要「这行每秒怎么变」⇒ 读 hydro；
       *    尤里卡「热液能产出 10/s」要「汽轮机造出来多少」⇒ 读这个。 */
      hydroSupply: _sr.hydroSupply,
      /* ⚠️ 市政卡的 `cv.science` 那一份也乘（与 tick 的 4b 步同式）；
       *    ⚠️ 括号位置：乘区要裹住**两个加项**，不能只裹 scholar 那一段。 */
      /* ⚠️ 与上面 tick 里那一行**逐字同构**（含 institute 那一项、以及大图书馆
       *    libraryLevel / 政策卡 libraryMul 那两处）——
       *    面板路与结算路漏掉任何一路，玩家都会看到「写着 +50%、进账没变」。 */
      science: ((j.scholar || 0) * SB.UNIT.sci
                 * (1 + libraryLevel(s) * SB.BLD.sciRatio * (SB.civic ? SB.civic.libraryMul(s) : 1)
                    + (s.lvl.institute || 0) * (SB.BLD.instituteSci + upgSum(s, 'instituteSci')) * (SB.civic ? SB.civic.universityMul(s) : 1)
                    /* 2026-09-30 ERA4：雕版印刷机给学者 +30%（pressSci），与图书馆/研究所同一括号相加。 */
                    + upgSum(s, 'pressSci'))
                 * obsSciMul(s)                                  /* 天壳观测站：+x%（冰壳反比，上限 20） */
                 * (SB.wonder ? SB.wonder.cutterSciMul(s) : 1)   /* 天壳切削器：+% = 观测站等级 */
                 * (Tr ? Tr.sci : 1) + (cv ? (cv.science || 0) : 0)
                 /* 商人副产（2026-09-30 · 中世纪集市解锁2）：与 tick 4c' 同式，在 globalMul 乘区内。 */
                 /* ERA5（2026-10-02）：学校每级给商人 +0.5 科技/s（与 tick 4c' 同式相加进同一括号）。 */
                 + ((s.civics && s.civics.market) ? (j.merchant || 0) * ((SB.BLD.marketJobSci || 0) + (s.lvl.school || 0) * (SB.BLD.schoolMerchantSci || 0)) : 0)
                 ) * (SB.civic ? SB.civic.cardSciOutMul(s) : 1) * globalMul(s)
                 * (lg ? lg.relicScienceMul * (1 + lg.shopScienceBonus) : 1)
                 + (lg ? lg.oldTideSteleScienceRate : 0),
      fuel:    (j.craft > 0 ? fuelRate(s, cold) : 0) - burn,
      /* ⚠️ 与 tick 同源：同一个 cultureRate 函数（书手 + 议事厅）。
       *    别在这里另写 `j.scribe * SB.UNIT.culture`——那两份算式会各自演化。
       *    商人副产（中世纪集市解锁2）同样补进面板路，与 tick 4c' 同式。 */
      culture: cultureRate(s) +
               ((s.civics && s.civics.market) ? (j.merchant || 0) * (SB.BLD.marketJobCulture || 0) * globalMul(s) : 0),
      /* ⚠️ 2026-10-05 补漏（用户报「信仰怎么不体现每秒出率」· bug 不是标定）：
       *   faithRate 一直存在于 tick（`addRes(s,'faith',faithRate(s)*dt)`），
       *   但 rates() 的返回对象**漏了 faith 这个键** ⇒ renderRes 里 `rate['faith']||0` = 0
       *   ⇒ 顶栏信仰行永远不显示 `/s`，而实账在涨 —— 又一个「面板撒谎」。
       *   判据：凡 tick 里 addRes/add 的资源，rates() 必须有同名键（单源铁律）。
       *   faithRate 内部自带 resUnlocked(s,'faith') 门控（神学前恒 0），不会提前漏出行。 */
      faith:   faithRate(s),
      /* ⚠️ luxury 净速率（陆地贸易，2026-09-28）：产能(baseMul) − 实际消耗 min(产能, 需求)。
       *   与 tick 同式——tick 里 S 用 baseMul、消耗用 min(S,D)*dt。
       *   断供时实际烧=产能（烧光），净=0（不再累积）；充裕时净=产能−需求（盈余累积）。
       *   大巴扎（S 侧）与王国潮道（D 侧）2026-09-30 接进两条路——漏一路就是「面板撒谎」。
       * ⚠️ 2026-10-06：需求 D 的入参改成 `happyMech(s)`（剥掉政体/奇观/卡的幸福度加成），
       *   与 tick 的 `_D` 同源。此前这里与 tick 一致（都用 s.happy 之外的口径）纯属巧合——
       *   tick 早用 `_Hmech` 而此处用 `s.happy`，两者在「有政体/卡加成」时**读数不同**
       *   ⇒ 顶栏显示的净速率与真实扣费对不上。加成不该让居民变贵（见 happyMech 注释）。 */
      luxury: (function () {
        var S = (j.merchant || 0) * SB.UNIT.luxury * toolMul(s, 'merchant') * baseMul(s)
          * (SB.civic ? SB.civic.govLuxuryMul(s) : 1)    // 2026-09-29 马具 +50%、寡头 +20%，与 tick 同式
          * (1 + upgSum(s, 'luxuryMul'))                 // 马镫工坊升级 +50%（与马具独立相乘 ⇒ +100%）
          * luxuryPactMul(s)                             // 2026-10-05 奢侈品契 +3%/级（与 tick 的 _lp 同一个函数）
          * bankMul(s)                                   // 2026-09-30 ERA4：银行每级商人产出 +10%
          * (SB.wonder ? SB.wonder.bazaarLuxMul(s) : 1); // 大巴扎：每名鲛人 +1% 奢侈品获取
        if (S <= 0) return 0;
        var D = (s.pop || 0) * happyCost(happyMech(s)) * (1 - luxSaveAll(s));
        return S - Math.min(S, D);
      })()
    };
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

  SB.economy = {
    fmt: fmt, fmtAmt: fmtAmt,
    rOf: rOf, isCold: isCold, popCap: popCap, isFull: isFull, lvlSum: lvlSum,
    enough: enough,
    /* ⚠️ upgSum 导出（2026-09-29 工坊升级 craftRatio）：工坊效率的第五个加法来源
     *    （建筑级 / 奇观 / 科技 / 政体 / 工坊升级）读它就位，单一聚合函数避免各模块重算漏键。 */
    upgSum: upgSum,
    seasonIdx: seasonIdx, season: season, seasonMeta: seasonMeta, warmBurning: warmBurning,
    seasonTurn: seasonTurn, seasonGrant: seasonGrant, freezeChance: freezeChance, rollFreeze: rollFreeze,
    capOf: capOf, addRes: addRes, resUnlocked: resUnlocked,
    /* coreLvl（2026-10-06 城堡「真升级」）：统治核心等级 = 议事厅的等级。
     *   城堡是它买下工坊升级 `upg_castle` 之后的新**名字**，不是第二座建筑 ⇒ 就是 lvl.hall。
     *   三条每级效果（减耗 / 市政点 / 容量轴基数）与面板注脚都读它。
     *   导出是为了 e2e 与 UI 能直接断言这个读数，不必把口径抄四遍。 */
    coreLvl: coreLvl,
    costOf: costOf, costTxt: costTxt, costOwnedTxt: costOwnedTxt, canAfford: canAfford, pay: pay,
    /* farmMul / gatherMul 成对导出（2026-09-27 工坊工具）：工具就是插在这两条乘区上的，
     * 回归必须能直接读乘区本身 —— 读 foodRate 会被 byBuild 那一份稀释，测不出精确的 ×1.8。 */
    farmMul: farmMul, gatherMul: gatherMul,
    /* ⚠️ globalMul 一并导出（2026-09-28 灯塔）：它是「全资源产出」那条乘区的**宿主**，
     *    与 gatherMul / farmMul 同类。导出它，回归才能直接读乘区本身；只测 rates() 会被
     *    各项的减项稀释，测不出「乘区到底有没有挂上去」。 */
    globalMul: globalMul, baseMul: baseMul,
    /* ⚠️ 幸福度三函数导出（2026-09-28 陆地贸易）：回归取证用。
     *   happyMul 是台阶式全产乘区（排除 luxury，防自激）；
     *   happyCost / happyBurn 是消耗面（rates 与 tick 同式，防面板撒谎）。 */
    happyMul: happyMul, happyCost: happyCost, happyBurn: happyBurn,
    /* ⚠️ 2026-10-05：幸福度那行要向玩家摆「供给 / 需求」，所以把这两项导出去。
     *   `happySupply` 是**产能**（与 tick 的 _S 同式），`happyCostPer` 是裸的每人消耗。 */
    happySupply: happySupply, happyCostPer: happyCostPer,
    /* ⚠️ 2026-10-06 用户报「消耗把市政加的幸福度也算上了」：
     *   `happyMech` = 用于**计价**的幸福度（s.happy 剥掉政体/奇观/卡的常驻偏移），
     *   `happyBonusTotal` = 那份偏移本身。UI 要把两者摆出来（玩家才验得出
     *   「人口 × 每人 = 耗」这笔账），断言也要靠它们比对 tick 的 _D。 */
    happyMech: happyMech, happyBonusTotal: happyBonusTotal,
    /* luxSaveAll（2026-10-06 商队驿站接线）：居民侧奢侈品减耗的全部来源之和。
     *   导出是为了 e2e 能直接断言「每级 −1%」这条真的生效，而不必去反推 burn。 */
    luxSaveAll: luxSaveAll,
    /* ⚠️ 2026-10-05：档位表与 H 读数**收敛成一个口**，供 UI 显示「距下一档还差多少」。
     *   ⚠️ 别再在 render.js 里手抄档名/门槛 —— 此前 render:183 与本文件各存一份，
     *   改一处漏一处不报错，只会「面板写 ×0.92、结算按 ×0.80 算」。 */
    happyTier: happyTier, happyOf: happyOf, HAPPY_TIERS: HAPPY_TIERS,
    /* ⚠️ 2026-10-05 用户拍板「要在幸福度那里写明产出多少、扣减多少」：
     *   把收支**四项**一次算清交给 UI，避免 render 自己拼数字（拼 = 第二份口径 = 会漂）。
     *   字段：out 产出/秒、burn 扣减/秒、net 净值/秒（out−burn，>0 回升、<0 下滑）、
     *        per 每人扣减、pop 人口、cap 硬底、tier 档位对象。
     *   ⚠️ burn 用 happyBurn（含政体/奇观减免），per 用 happyCostPer（裸值）；
     *      两者**故意不同** —— per 摆出来是让玩家自己验「人口 × 每人」这个乘法，
     *      若 per 写成减免后的值，就会出现「per × 人口 ≠ burn」而玩家算不明白账。 */
    happyLedger: function (s) {
      var out = happySupply(s);
      var burn = happyBurn(s);
      var H = happyOf(s);
      var t = happyTier(H);
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
        per: happyCostPer(s), pop: (s.pop || 0),
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
    JOB_SINK: JOB_SINK, toolMul: toolMul,
    warmCap: warmCap, fuelRate: fuelRate, cultureRate: cultureRate,
    /* ⚠️ 2026-10-05 flow 模型：hydroAlloc 是「热液能流分配」唯一权威只读函数（tick 与 rates 共用），
     *   导出是为回归取证与 shell.js 的天穹钻机读剩流。纯函数只读 s，可安全调用。 */
    hydroAlloc: hydroAlloc,
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
    coralPactMul: coralPactMul, mineTaxMul: mineTaxMul, algaeCropMul: algaeCropMul,
    furnaceBoostMul: furnaceBoostMul, luxuryPactMul: luxuryPactMul,
    /* warmRelief 必须导出：它是「这一 tick 顶回几成」的唯一权威读数，
     * 结算面板的 burning 提示、回归里那几条断言都读它。
     * ⚠️ 它有副作用（会烧石、会置 warmBurning），所以别在渲染路径里调用它——
     *    那会在玩家盯着面板看的时候偷偷烧掉一 tick 的暖石。要看 burning 用 warmBurning。 */
    warmRelief: warmRelief, warmBurningNow: warmBurningNow,
    rates: rates,
    tick: tick
  };
})(typeof window !== 'undefined' ? window : globalThis);
