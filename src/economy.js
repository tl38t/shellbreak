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
    var p = CFG.FREEZE_MAX * (1 - rOf(s));
    if (!(p > 0)) return 0;
    return p > CFG.FREEZE_MAX ? CFG.FREEZE_MAX : p;
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
   *   在盖起第一座礁口巢（珊瑚 10）之前不会增加。这是「上限」二字应有的含义；
   *   `houseBase` 只为让开局显示 1/1，不是免费配额（它 1 个人占 1 个位置，照样是满的）。
   * ⚠️ 2026-09-26 改判：原本这里要读 tech.mul 的 `house`（巢筑/壳骨各 +2），
   *   但猫国 128 项科技没有任何一项给 maxKittens —— 那个写法在猫国没有对应物，
   *   而 popCap 也从未读它，等于花 80 科技买了零。现改为巢筑解锁「石屋」，
   *   人口回到建筑身上。
   * ⚠️ 壳骨（纪元三）的 eff.house 目前**仍是空效果**（popCap 不读 tech.mul），
   *   按用户「一个一个解决」的节奏留到纪元三那轮处理，别在这里顺手接线。 */
  function popCap(s) { return BLD.houseBase + s.lvl.nest * BLD.house + s.lvl.coralhouse * BLD.house2; }
  /* 「住满」= 人口已经顶到上限，下一胎不会来。
   * tick 的生育步、UI 的生育行、两个 sim 的「该不该盖房」都读它——
   * 三处各写一遍 `pop >= popCap` 迟早会有一处写成 `>`，
   * 症状是「差一人满员时白等一胎」这种不报错的空转。 */
  function isFull(s) { return s.pop >= popCap(s); }
  function lvlSum(s) {
    var n = 0; for (var k in s.lvl) n += s.lvl[k]; return n;
  }
  /* ⚠️ 取模必须用 SEASONS.length，不能写死季数：2026-09-27 删掉浊流季（4→3），
   * 旧版这里写死 `% 4` ⇒ 索引会落到表里没有的位置（undefined.name 直接炸）。
   * 季节表是最容易被增删的那种表，取模跟着表走才不会每次都漏改一处。 */
  function seasonIdx(t) { return Math.floor(t / CFG.SEASON_TICKS) % SEASONS.length; }
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

  // ---- 仓储（S2）----
  /* 未在 CAP_BASE 中的资源（现在只剩 science）为无限，不设浪费判定。
   * ⚠️ 判「表外」必须写 `=== undefined`。旧版是 `!CFG.CAP_BASE[k]`，而 `!0 === true`
   *    ⇒ stone / warmstone 这两条**「明写 0」**的资源被当成了表外 ⇒ 整局无上限。
   *    当时的注释还写着「明写 0 与表外等价，且更清楚」——两者恰恰相反：
   *      明写 0 = 基础容量 0，但仍吃全局增量；缺键 = 永远 Infinity。
   *    「把自己说服了的注释」比没有注释更危险：它让一个 bug 看起来像设计决定。 */
  function capOf(s, k) {
    var base = CFG.CAP_BASE[k];
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
    if (k === 'kelp') {
      /* ⚠️ 扩容升级是**乘法**，整套仓储线里只有它这一条是乘法 —— 见下面的 matCap。 */
      return (base + (s.lvl.kelpstore || 0) * BLD.kelpCap + (T ? T.kelpCap : 0))
        * capUpgradeMul(s, 'upg_kelpstore_1');
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
    var matCap = base + (s.lvl.ballast || 0) * BLD.ballastCap
      /* ⚠️ 2026-09-28 灯塔也仓库（+120/级，与压舱仓同档）。
       *    【为什么是**并列相加**而不是乘】两座仓是两条独立的容量来源，各自的量纲
       *       都是「每级 +120」。写成 `(1 + lvl.ballast*120) * (1 + lvl.lighthouse*120)`
       *       会在两座都盖起来时把效果放大成平方，那是「同一个东西被计价两次」。
       *    【大灯塔的 +60 走下面的 matMax，不在这里】它是**常数**，由 wonder.matMaxBonus
       *       供给，与建筑等级这条轴互不干涉 —— 用户拍「写死常数」，规则才清楚。 */
      + (s.lvl.lighthouse || 0) * BLD.lighthouseCap +
      /* ⚠️ 奇观「海潮方碑」的「各材料仓储 +200」。
       *   ⚠️ **只加给材料，不加石梁** —— 石梁是无上限资源（用户拍），给它加 200 没有意义。
       *    ⚠️ 用**白名单**而不是「除 stoneBeam 之外全加」：将来加新资源时，
       *        白名单会逼着人决定「新资源吃不吃这个加成」，黑名单则让人默认漏掉。 */
      (SB.wonder ? SB.wonder.matMaxBonus(s, k) : 0);
    return matCap * capUpgradeMul(s, 'upg_ballast_1');
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
  function addRes(s, k, v) {
    if (v <= 0) return;
    var c = capOf(s, k);
    /* ⚠️ 2026-09-28：`s.res[k]` 可能是 undefined（新资源加进了 RESS，却漏了 freshRun 的
     *    res 字面量）⇒ `undefined + 5.25 = NaN` ⇒ `Math.min(Infinity, NaN)` **仍是 NaN**
     *    ⇒ 产物落进池子却读出来是 NaN，不报错也不截图，只污染一切读到它的算式。
     * ⚠️ 兜底只把**非数字**洗成 0，NaN 原样留下：NaN 的 typeof 就是 'number'，
     *    这层判断拦不住它，于是它会照常一路红到断言上。把 NaN 也洗成 0 的话，
     *    「资源凭空变 0」和「资源凭空变 NaN」就都看不出来了，那是本次要避免的事。 */
    var have = (typeof s.res[k] === 'number' && isFinite(s.res[k])) ? s.res[k] : 0;
    s.res[k] = Math.min(c, have + v);
    /* 累计产出台账：record 类（gathered）尤里卡条件读它。
     * 记的是「流进来的量」而不是「留在池里的量」——仓储溢出的部分也算采到过，
     * 否则玩家一路爆仓却永远点不亮「累计产出 500」这类条件。 */
    if (s.got) s.got[k] = (s.got[k] || 0) + v;
  }

  /* 议事厅的「议价」：每座议事厅把所有建筑**下一级**的成本乘 (1 − 0.02)。
   * ⚠️ 作用在 `ratio^n` 这一侧而不是首级成本上——首级只有一次，
   *   压首级等于只帮玩家省开头那一次，后期指数曲线一动不动，那不是议事厅该有的分量。
   * ⚠️ 封顶 30%：不封顶的话 15 座议事厅就把所有成本乘到 0.74，指数函数会被整体拽平，
   *   「盖不动」这道天然的刹车就没了（ratio 1.12 的建筑本来也不该能无限铺）。 */
  var HALL_SAVE = 0.02, HALL_CAP = 0.30;
  function hallMul(s) {
    if (!s.lvl.hall) return 1;
    return 1 - Math.min(HALL_CAP, s.lvl.hall * HALL_SAVE);
  }
  // 单级增量成本。递增系数是建筑自己的 `ratio`（猫国 priceRatio），不是全局常数——
  // 住房 2.5 贵到买不动，产能建筑 1.12 便宜到可以一路铺开，这是两条不同的曲线。
  function costOf(s, id) {
    var b = null;
    for (var i = 0; i < SB.BUILDINGS.length; i++) if (SB.BUILDINGS[i].id === id) b = SB.BUILDINGS[i];
    var n = s.lvl[id] || 0, o = {}, hm = hallMul(s);
    for (var k in b.cost) o[k] = Math.ceil(b.cost[k] * Math.pow(b.ratio, n) * hm);
    return o;
  }
  function costTxt(c) {
    var out = [];
    for (var k in c) out.push(SB.RESS[k].name + ' ' + fmt(c[k]));
    return out.join(' + ');
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
    var i = seasonIdx(s.t), n = SEASONS.length;
    var left = CFG.SEASON_TICKS - (s.t % CFG.SEASON_TICKS);
    return {
      idx: i, name: SEASONS[i].name, mult: seasonMul(s),
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
    return (s.res.warmstone || 0) >= CFG.WARM_RATE;
  }

  /* ⚠️ 三条「顶不住」的出口都要把 warmBurning 落成 false，不能只管置 true：
   *    warmBurning 的含义是「**这一瞬间**真的在烧」。它是每帧瞬时标记（tick 开头清位），
   *    但如果只有烧得起的那一支写它，任何在 tick 之外读到它的调用方（面板的 burning
   *    提示、回归断言）都会看到上一次「烧得动」留下的 true —— 面板就会在石见底之后
   *    还亮着「正在烧」，等于骗玩家。落位是这段自己的职责，别指望调用方记得清。 */
  function warmRelief(s, dt) {
    if (!warmBurningNow(s)) { s.warmBurning = false; return 0; }
    var need = CFG.WARM_RATE * (dt == null ? 1 : dt);
    if (!(s.res.warmstone >= need)) { s.warmBurning = false; return 0; }
    s.res.warmstone -= need;
    s.warmBurning = true;
    return CFG.WARM_RELIEF;
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
    miner:       ['silt', 'warmstone']   // 矿工：金属 + 伴生暖石
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
  function toolMul(s, job) {
    var L = SB.TOOLS || [], sum = 0, i, j;
    /* ⚠️ 必须用 Array.isArray 而不是 `job.length !== undefined` ——
     *    字符串也有 length，那样会把单职业（'coralwright'）当成「逐字比对」，
     *    于是 t.target[0] 永远对不上 want[0]（'c'）⇒ 工具买了不生效，还不报错。 */
    var want = Array.isArray(job) ? job : [job];
    for (i = 0; i < L.length; i++) {
      var t = L[i], hit = false, k;
      /* ⚠️ `t.target` **缺失**必须能过（2026-09-28 那件 wip「马具」就是没有目标职业的）。
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
    /* ⚠️ `s.lvl.reef` 必须 `|| 0` 兜底（2026-09-28 踩到）：这是全文件**唯一一处**不加兜底的
     *    `s.lvl.x` 读法（旁边的 `lvl.lighthouse || 0` 等写法都有）。缺了它，任何一个只填了
     *    部分等级字段的 state（旧存档、测试夹具、将来的建筑预览）都会让 `undefined * 0.08 = NaN`
     *    ⇒ 珊瑚 / 石头 / 砂矿 / 暖石四条产线**静默变 NaN**：不抛错、不报警，整条经济线废掉。 */
    return (1 + (s.lvl.reef || 0) * BLD.reefMul)
      * (T ? T.gather : 1)
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
  function globalMul(s) {
    var m = 1 + (s.lvl.lighthouse || 0) * BLD.lighthouseProd;
    if (SB.wonder) m += SB.wonder.globalBonus(s);
    return m;
  }
  /* 冻伤减免 = **这一瞬间暖石在烧**（2026-09-26：暖壳石 / hearth 随骨材线一并删除，
   * 减免口从「建筑等级」换轴到「消耗品」）。
   * 【为什么读 warmBurning 而不是自己再算一遍】warmRelief 在第 5 步就把 warmBurning 落位了，
   * 第 7 步冻伤才轮到，同一 tick 内先后有序。若这里重写「开关开了没、石够不够」，
   * 就会出现与 warmRelief 差一 tick 的读数（面板写着正在烧、结算按没烧算）。
   * ⚠️ 绝不能退回 `s.lvl.hearth * BLD.warm`：键一删，`undefined * 0.10 = NaN`
   *   ⇒ warmCap NaN ⇒ 顺着 FREEZE_CHANCE 污染整条结算链。这类断链不抛错也不报警，
   *   症状是「冰封期莫名其妙掉人」，排查时极易误判成「设计上那道墙」。
   * 【0.5 是什么】结算里是 (1 − warmCap × 2)，0.5 恰好把概率打到 0 ⇒ 烧着就不冻死。 */
  function warmCap(s) {
    return warmBurningNow(s) ? CFG.WARM_FREEZE_CAP : 0;
  }
  /* 口粮消耗：保温巢（深海鱼牧场）省耗 −0.5%/级，**线性叠加、无减免上限**
   * （2026-09-26 用户拍板对齐猫国 pasture 的 catnipDemandRatio，撤掉本作自造的 60% 护栏）。
   * ⚠️ 渲染层用同一个函数标红：两处各算一遍就会出现「面板说够吃、实际在饿死」。
   * 【那一道 Math.min 是什么】它只夹在 **100%**（减免到满为止），不是设计护栏——
   *   少了它，暖壳石叠到 200 级以上时 (1-save) 变负数 ⇒ 消耗翻成产出 ⇒ 白送口粮，
   *   而且不报任何错。防御边界归防御边界，别把它读成「还剩一道 −60% 上限」。 */
  function foodUse(s) {
    var save = Math.min(1, (s.lvl.warmnest || 0) * BLD.foodSave);
    return s.pop * CFG.FOOD_PER * (1 - save);
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
    var byBuild = s.lvl.kelp * BLD.food * seasonMul(s, relief); // 建筑侧：吃季节（历法收窄减产 + 暖石顶回）
    var byJob = s.jobs.gather * UNIT.kelp * farmMul(s);        // 职业侧：不吃季节・「种植」的 farm 乘区
    /* 只放大食物，别把 gatherMul（礁石平台/深潜/洋流增益）乘进来——
     * 那些倍率是「采集产出」的，礁石平台不该让藻场增产。
     * 之前错乘进来，食物产出虚高到 38/秒而消耗只有 2.6/秒，
     * 藻食全都撞在仓储上限上白流，生育却仍被住房那道墙卡死。
     * 【2026-09-26】住房墙已按用户要求**恢复**（软容量那版实测几乎没有约束力），
     * 现在生育受「口粮 + 住满」两道门管，见第 6 步与 economy.isFull。 */
    return (byBuild + byJob) * (cold || 1)
      * (1 + (s.lvl.weir || 0) * BLD.foodWeir)                // 增旋钮：两条来源一起放大
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
  function fuelRate(s, cold) {
    if (s.lvl.geyser <= 0) return 0;
    var T = SB.tech ? SB.tech.mul(s) : null;
    var gross = s.lvl.geyser * BLD.fuel * s.jobs.craft * cold * (T ? T.fuel : 1);
    /* ⚠️ 这里必须读 BLD.upkeep（定义在 config 的 BLD 表里）。曾经写成 CFG.UPKEEP
     * 而那个键不存在——fuelRate 恒为 NaN，顺着 addRes 污染地热池，祭坛一秒没开过，
     * 而 NaN 不抛错、只在「fuel >= burn」这类比较里静默变 false，极难察觉。 */
    /* ⚠️ 末尾那一项是灯塔的全资源乘区，与 tick 那行同源。
     *    【为什么放在这里而不是两个调用点各乘一次】fuelRate 同时被 tick 与 rates 调用，
     *       把乘区收在函数内部 ⇒ 两条路自动同式，少一处漏乘的机会。 */
    return Math.max(0, (gross - BLD.upkeep * lvlSum(s)) * globalMul(s));
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
   *    ⚠️ ② 速率仍然**不随熔炉等级变化**（升级熔炉暂时不影响转铁速度）：等级乘数一旦
   *       加上（比如 ×`s.lvl.furnace`），玩家每升一级熔炉就多一份抽料，无人值守的炉子
   *       会越建越饿。等「要不要给熔炉一个开关」定了，再把等级乘数一起补。
   *    ⚠️ ③ 暖石是**第二个原料**（用户规格原文「消耗金属和暖石生成铁」）。
   *       ⚠️ ⚠️ **这条与 config.js 那处「一份暖石只许有一个消耗口」的规格相冲突**：
   *           2026-09-26 删掉暖壳石时留下的规矩是「暖石的全部去处就是保温法开关，
   *           一个消耗口」，而熔炉现在是第二个 ⇒ 同一份暖石会被保温法和熔炉各抢一份。
   *           用户当次的规格优先，这里按「暖石 = 两口」实现，但**这条冲突必须回头裁决**。
   *    ⚠️ ④ 配比暂时是 **1:1 不限量**：暖石伴生只有 UNIT.warmstone = 0.05/人/秒，
   *       而转一份要 0.06/秒 ⇒ 单个矿工**供不上一座炉子**，炉子会在暖石上长期卡着。 */
  function ironFlow(s, cold, dt) {
    if (!(s.lvl.furnace > 0)) return 0;
    var T = SB.tech ? SB.tech.mul(s) : null;
    var rate = UNIT.iron * (T ? T.smelt : 1) * cold * (T ? T.craft : 1);
    /* 两种原料取**较小**的库存：哪样先见底就按哪样停，不会把一样抽成负数再白吃另一样。 */
    return Math.min(rate * dt, s.res.silt, s.res.warmstone);
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
    return ((s.jobs.scribe || 0) * UNIT.culture + (s.lvl.hall || 0) * CFG.CIVIC.HALL_RATE
      + wonderBonus) * globalMul(s);
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
    seasonTurn(s);

    var cold = isCold(s) ? 0.6 : 1;
    var j = s.jobs;

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
      addRes(s, 'coral', j.coralwright * UNIT.coral
        * gatherMul(s) * toolMul(s, 'coralwright') * cold * globalMul(s) * dt);
    }
    /* 采石工产石头、矿工产金属（silt 这个 id）并**伴生暖石**。
     * 矿工是两条 addRes 而不是一条：暖石若淹死在金属那一行里，将来调 UNIT.warmstone
     * 容易顺手以为它跟金属同量级，实际它是副产品（UNIT.warmstone 0.05 vs UNIT.silt 0.09）。
     * ⚠️ 两条都乘了 gatherMul —— 礁石平台/深潜是「采集」倍率，矿工手持的也是采集工具，
     *    与珊瑚匠同理；别把它当成加工倍率塞进 T.craft 那条线。
     * ⚠️ 金属那条还乘 siltMul（1 + 砂矿坑级数 × BLD.siltBonus）——对标猫国 mine 的
     *    mineralsRatio；**暖石不乘**：砂矿坑给伴生副产品加成说不通（见 config BLD.siltBonus 注）。
     * ⚠️ 青铜镐绑的是 **quarrier + miner 两个职业**，而矿工产两行（金属 + 暖石），
     *    所以金属与暖石这两处都得算上 miner 那套工具 —— 只乘金属会让暖石漏掉。 */
    if (j.quarrier > 0) {
      addRes(s, 'stone', j.quarrier * UNIT.stone
        * gatherMul(s) * toolMul(s, 'quarrier') * cold * globalMul(s) * dt);
    }
    if (j.miner > 0) {
      var siltMul = 1 + (s.lvl.siltpit || 0) * BLD.siltBonus;
      var mine = toolMul(s, 'miner');
      addRes(s, 'silt', j.miner * UNIT.silt * siltMul
        * gatherMul(s) * mine * cold * globalMul(s) * dt);
      addRes(s, 'warmstone', j.miner * UNIT.warmstone
        * gatherMul(s) * mine * cold * globalMul(s) * dt);
    }

    // 2) 加工（2026-09-28 起改为**建筑自动**：熔炉建成就转，不再要匠人）
    /* ⚠️ 两样原料都按**同一份数**扣：fc 是「转了几份」，每份吃 1 金属 + 1 暖石、吐 1 精铁。
     *    ⚠️ 精铁产出是 `fc` 本身而不是 `fc × UNIT.iron` —— 这个 1:1 是**沿袭**原有写法
     *       （改驱动方式之前也是这么算的），本轮只动「谁驱动 / 加哪种原料」，
     *       不动产出的量纲（量的标定留到那一步，见 ironFlow 上方那条 ⚠️④）。 */
    var fc = ironFlow(s, cold, dt);
    if (fc > 0) {
      /* ⚠️ 扣的两样原料用**未乘**的 fc（原料是按份扣的，灯塔不该让玩家少扣一份）；
       *    吐出来的精铁则乘 gm —— 与 rates.iron 那一行保持同一个 expr，别各写一套。 */
      s.res.silt -= fc;
      s.res.warmstone -= fc;
      addRes(s, 'iron', fc * globalMul(s));
    }

    // 3) 地热（排在祭坛消耗之前，先产后烧）。这一行是唯一原本就乘了 dt 的，
    //    修单位时保持不动——它现在只是「铁律」的一个 conform 例子。
    if (j.craft > 0) addRes(s, 'fuel', fuelRate(s, cold) * dt);

    // 4) 科技
    var Tt = SB.tech ? SB.tech.mul(s) : null;
    /* ⚠️ 潮纹馆（2026-09-27 用户拍板）：不再是 `+0.05/级/秒` 的绝对产能，改成
     *    「每级 ×(1+lvl×sciRatio)」乘区，**只乘在学者产出上**。
     *    ⚠️ 括号位置是口径：乘区必须裹住 `j.scholar * UNIT.sci` 这一项、且落在 library 项
     *    原来的位置上——写成 `(j.scholar*UNIT.sci + ...) * (1+lvl*sciRatio)` 会把数值一起放大。
     *    ⚠️ scholar 为 0 时这项恒 0 ⇒ 潮纹馆完全无效，这是口径不是 bug（用户原话「加在学者的产出上」）。
     *    ⚠️ 下方 rates().science 必须与这里逐字同构（单位铁律：dt=1 时两者要相等）。 */
    /* ⚠️ 2026-09-28 研究所（institute）接在这里：`BLD.instituteSci` 每级把学者产出
     *    再 ×(1+0.50)，与 library 的 `sciRatio` 同位置**相加**进同一个括号。
     *    ⚠️ 括号位置与 library 那条是同一个口径：乘区必须裹住 `j.scholar * UNIT.sci`
     *        这一项，写成 `(j.scholar*UNIT.sci + ...) * (1+...)` 会把数值一起放大。
     *    ⚠️ 这一行与下面 rates().science **必须逐字同构**（dt=1 时两者要相等）。
     *    ⚠️ 两处都要读 institute：只改这里 ⇒ 面板写 +50%、实际进账没变；
     *        只改 rates ⇒ 面板与结算打架。e2e「研究所的科技加成」两条各钉一路。 */
    s.res.science += j.scholar * UNIT.sci
      * (1 + s.lvl.library * BLD.sciRatio + (s.lvl.institute || 0) * BLD.instituteSci)
      * (Tt ? Tt.sci : 1) * globalMul(s) * dt;

    /* 4b) 市政点的两条来源（书手 + 议事厅）与市政卡/政体的平坦加成。
     * 【为什么平坦加成走 SB.civic.flow 而不是塞进 tick 里】它们来源是玩家在市政页上的
     *    选择（政体 +5/s 藻食、神秘主义卡 +0.3/s 科技），属于市政模块；经济层只负责
     *    「把它们变成资源」，不替市政模块决定给多少。取不到就当没有，绝不参与运算。 */
    addRes(s, 'culture', cultureRate(s) * dt);
    var cv = SB.civic && SB.civic.flow ? SB.civic.flow(s) : null;
    if (cv) {
      /* ⚠️ 市政卡的平坦加成也是「产出」，同样吃灯塔的 +1% —— 与 rates 那两行同式
       *    （那里是 `(cv ? (cv.kelp || 0) : 0)` 各项各自乘）。 */
      if (cv.kelp) addRes(s, 'kelp', cv.kelp * globalMul(s) * dt);
      if (cv.science) s.res.science += cv.science * globalMul(s) * dt;
    }

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
    if (!isFull(s) && s.res.kelp > CFG.GROW_KEEP) {
      s._grow += dt;
      if (s._grow >= CFG.GROW_NEED) { s._grow = 0; s.pop++; }
    } else s._grow = 0;
    s.peak = Math.max(s.peak, s.pop);

    // 7) 冻伤（仅冰封期）
    if (cold < 1) {
      s.coldTicks += dt;
      var risk = CFG.FREEZE_CHANCE * (1 - warmCap(s) * 2) * dt;
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
  }

  /* 每种资源的**净**速率（/秒），给 UI 显示总获得速率用。
   * ⚠️ 不是另写一套公式：逐项复用 tick 里的同款算式（含加工的 min(速率, 库存) 上限、
   * 祭坛烧燃料、口粮消耗），保证「面板显示的速率」与「实际结算」永不脱节。
   * 此前 UI 完全不显示速率，玩家只能看数字涨跌猜产线是否为正——尤其是
   * 热泉炉把矿砂转成精铁这类「一进一出」的中间资源，
   * 净值可能是负的（转出 > 产出），不显示根本无从发现。 */
  function rates(s) {
    var cold = isCold(s) ? 0.6 : 1;
    var j = s.jobs;
    /* 传 dt=1，即「一秒窗口」的流量。tick 传的是真实 dt，同一个函数两种窗口，
     * 于是「面板显示的速率」天然等于「实际每秒结算」，不会各写一套公式。 */
    var fc = ironFlow(s, cold, 1);
    var burn = (s.miracleOn && (s.lvl.miracle || 0) > 0) ? SB.shell.miracleBurn(s) : 0;
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
    return {
      kelp:    foodRate(s, cold) - foodUse(s) + (cv ? (cv.kelp || 0) : 0),
      /* ⚠️ 2026-09-27 删骨材：这一项原先还减 `bc`（工坊把珊瑚转骨材那一笔）。
       *    那条加工线整体作废 ⇒ 珊瑚再没有加工消耗，净额就是采集者的产出。
       *    ⚠️ 别顺手把变量 `bc` 加回来——它已经被一起删了，加回引用会直接 ReferenceError。 */
      /* 工具按职业落点：斧只放大珊瑚匠，镐只放大采石工 + 矿工（tick 同式）。 */
      coral:   (j.coralwright || 0) * UNIT.coral
                 * gatherMul(s) * toolMul(s, 'coralwright') * cold * globalMul(s),
      /* 与 tick 同源：金属只来自矿工，且同样吃 siltMul（砂矿坑加成）。tick 那边
       * 把 siltpit 自动产出删了之后，这里若还留着「+ lvl.siltpit × UNIT.silt」，
       * 面板就会凭空多报一份金属——「面板撒谎」家族的标准成因（tick 路 === 面板路）。 */
      /* ⚠️ 减掉的那份 fc 是**扣**不是产，不乘 globalMul —— 乘了会变成「灯塔让 furnace
       *    每转一份白扣两份原料」。产出那一段与 tick 的 miner 行逐字同式（含 globalMul）。 */
      silt:    (j.miner || 0) * UNIT.silt
                 * (1 + (s.lvl.siltpit || 0) * BLD.siltBonus)
                 * gatherMul(s) * toolMul(s, 'miner') * cold * globalMul(s) - fc,
      /* stone / warmstone：与 tick 同源（同一个 gatherMul・cold 乘子）。
       * ⚠️ 暖石**只有伴生这一条来源**，没有建筑产它——保温法那道开关要烧的暖石全靠矿工，
       *    所以「矿工几个人」直接决定保温法能不能用，这是「采矿」这条线真正的分量。 */
      stone:   (j.quarrier || 0) * UNIT.stone
                 * gatherMul(s) * toolMul(s, 'quarrier') * cold * globalMul(s),
      /* 暖石的净速率要减掉**开关正在烧的**那一份：不减的话面板上写着暖石在涨，
       * 玩家开着他以为只是在攒，实际有一路正在往火里扔。
       * 判据直接取 warmBurningNow（与 tick 里的 warmRelief 同源），不在这里重写条件，
       * 否则同一秒的显示会和实际结算对不上。
       * ⚠️ 2026-09-28 补减「熔炉正在吃的那一份」：铁器改成金属+暖石之后，暖石有了
       *    第二个去处。不减的话，玩家会看到暖石一路在涨（伴生 > 保温消耗）而实际有
       *    一路正在被炉子吃掉——同一个「面板撒谎」的坑，只是这次是两口消耗。
       *    ⚠️ 这里复用 fc（本秒转出的份数），与 tick 里扣 warmstone 的那一行同源。 */
      warmstone: (j.miner || 0) * UNIT.warmstone * gatherMul(s) * toolMul(s, 'miner') * cold
                 * globalMul(s)
                 - (warmBurningNow(s) ? CFG.WARM_RATE : 0) - fc,
      /* ⚠️ `iron` 记的是**消耗掉的原料份数**，不是产出的精铁量 —— 沿用原有口径。
       *    铁是「一进一出」的中间资源，净额可能比看起来还负（这里没有把金属那一侧的
       *    消耗减掉，与改造之前一致）。改这一行前先读铁器产出那段的量纲注。 */
      iron:    fc * globalMul(s),
      /* ⚠️ 市政卡的 `cv.science` 那一份也乘（与 tick 的 4b 步同式）；
       *    ⚠️ 括号位置：乘区要裹住**两个加项**，不能只裹 scholar 那一段。 */
      /* ⚠️ 与上面 tick 里那一行**逐字同构**（含 institute 那一项）——
       *    面板路与结算路漏掉任何一路，玩家都会看到「写着 +50%、进账没变」。 */
      science: ((j.scholar || 0) * UNIT.sci
                 * (1 + (s.lvl.library || 0) * BLD.sciRatio + (s.lvl.institute || 0) * BLD.instituteSci)
                 * (Tr ? Tr.sci : 1) + (cv ? (cv.science || 0) : 0)) * globalMul(s),
      fuel:    (j.craft > 0 ? fuelRate(s, cold) : 0) - burn,
      /* ⚠️ 与 tick 同源：同一个 cultureRate 函数（书手 + 议事厅）。
       *    别在这里另写 `j.scribe * UNIT.culture`——那两份算式会各自演化。 */
      culture: cultureRate(s)
    };
  }

  SB.economy = {
    fmt: fmt, fmtAmt: fmtAmt,
    rOf: rOf, isCold: isCold, popCap: popCap, isFull: isFull, lvlSum: lvlSum,
    enough: enough,
    seasonIdx: seasonIdx, season: season, seasonMeta: seasonMeta, warmBurning: warmBurning,
    seasonTurn: seasonTurn, freezeChance: freezeChance, rollFreeze: rollFreeze,
    capOf: capOf, addRes: addRes,
    costOf: costOf, costTxt: costTxt, canAfford: canAfford, pay: pay,
    /* farmMul / gatherMul 成对导出（2026-09-27 工坊工具）：工具就是插在这两条乘区上的，
     * 回归必须能直接读乘区本身 —— 读 foodRate 会被 byBuild 那一份稀释，测不出精确的 ×1.8。 */
    farmMul: farmMul, gatherMul: gatherMul,
    /* ⚠️ globalMul 一并导出（2026-09-28 灯塔）：它是「全资源产出」那条乘区的**宿主**，
     *    与 gatherMul / farmMul 同类。导出它，回归才能直接读乘区本身；只测 rates() 会被
     *    各项的减项稀释，测不出「乘区到底有没有挂上去」。 */
    globalMul: globalMul,
    /* JOB_SINK 导出是为了回归取证：e2e 拿这张表逐个职业查「economy.js 里有没有真的
     * 消费这个职业」，写错职业 id（'gather' 打成 'gatherer'）不报错、只会静默不生效。 */
    JOB_SINK: JOB_SINK, toolMul: toolMul,
    warmCap: warmCap, fuelRate: fuelRate, cultureRate: cultureRate,
    foodUse: foodUse, foodRate: foodRate, seasonMul: seasonMul,
    /* warmRelief 必须导出：它是「这一 tick 顶回几成」的唯一权威读数，
     * 结算面板的 burning 提示、回归里那几条断言都读它。
     * ⚠️ 它有副作用（会烧石、会置 warmBurning），所以别在渲染路径里调用它——
     *    那会在玩家盯着面板看的时候偷偷烧掉一 tick 的暖石。要看 burning 用 warmBurning。 */
    warmRelief: warmRelief, warmBurningNow: warmBurningNow,
    rates: rates,
    tick: tick
  };
})(typeof window !== 'undefined' ? window : globalThis);
