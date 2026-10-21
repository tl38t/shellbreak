/* 天壳 / SHELLBREAK — 幸福度与公司机制。
 * 保持 happiness/company 规则独立；经济 tick 与 rates 通过同一组函数读取。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

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
    /* ERA7（2026-10 实装）：体育场每级 −5% 族民奢侈品消耗（BLD.stadiumLuxSave），单源封顶 75%；
     *   旅游观光卡每座已建奇观 −3%（civic.cardWonderLuxSaveMul）。两者均为居民侧减耗，并列相加。 */
    var stadium = Math.min(0.75, (_lv.stadium || 0) * (SB.BLD.stadiumLuxSave || 0));
    var tourism = (SB.civic ? SB.civic.cardWonderLuxSaveMul(s) : 0);
    return Math.min(1, canal + car + stadium + tourism);
  }
  /* 廉租社区每级 +5% 居民奢侈品**消耗**（2026-10-13 新增；与 luxSaveAll 减耗反号）。
   * 【为什么是加项不是减项】王国潮道/商队驿站是「省耗」（乘 (1 − Σ)），廉租社区是
   *   「塞更多鲛人进来 ⇒ 奢侈品更不够烧」（乘 (1 + Σ)）。两者语义相反，不能进同一个括号。
   * 【三处同源】它被 tick 的 `_D`、rates 的 `D`、happyBurn 三处读 —— 与 luxSaveAll 同一个
   *   「一处算、三处读」铁律，漏一路就会面板撒谎。 */
  function tenementLuxAdd(s) {
    var _lv = (s && s.lvl) || {};
    return (_lv.tenement || 0) * (SB.BLD.tenementLuxAdd || 0);
  }
  /* 核热厂每级 +10% 居民奢侈品消耗（2026-10-17 · ERA7 spec §4，§0-3 用户拍板的负面效果）。
   * 【与 tenementLuxAdd 同构】建筑级增耗走同一条通道；三处同源纪律不变——
   *   tick 的 _D、rates 的 D、happyBurn 都只读 luxDemandMul，本函数只被 luxDemandMul 调。 */
  function fissionLuxAdd(s) {
    var _lv = (s && s.lvl) || {};
    return (_lv.fissionplant || 0) * (SB.BLD.fissionLuxAdd || 0);
  }
  /* 居民奢侈品消耗的**净系数**（2026-10-14 用户拍板：增耗与减耗合并成一个括号互相抵消）。
   * 【旧口径为什么改】增耗三项（公司 +10% / 大众传媒卡 +50% / 廉租社区每级 +5%）原先与
   *   居民减耗（luxSaveAll）分属两个乘区相乘：(1−减Σ)×(1+增Σ) —— 玩家无法把两边看成
   *   一笔账。新口径：**先抵消、剩余才是净负担** ⇒ 净系数 = clamp(1 + 增Σ − 减Σ, 0, +∞)。
   * 【三处同源】tick 的 `_D`、rates 的 `D`、happyBurn 三处**只读这一个函数**——
   *   漏一路就是面板撒谎。e2e 有断言钉「三处同值」。 */
  function luxDemandMul(s) {
    /* ERA7：核热厂 fissionLuxAdd 加入增耗三项（2026-10-17）——仍是单括号先抵消口径。 */
    var inc = companyLuxMul(s) + (SB.civic ? SB.civic.cardLuxConsumeMul(s) : 0)
      + tenementLuxAdd(s) + fissionLuxAdd(s);
    var net = 1 + inc - luxSaveAll(s);
    return net < 0 ? 0 : net;      // 护栏：极端减耗下净需求不为负
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
    /* ⚠️⚠️ 2026-10-14：增耗/减耗合并进 luxDemandMul 单括号（先抵消再算净负担）。
     *   此处旧注释记录的历史（2026-10-06 漏乘 luxSaveAll / 漏剥加成）仍有效——
     *   教训不变：口径对齐的断言要**逐个来源**都跑一遍，漏掉的那项永远测不出来。 */
    return (s.pop || 0) * happyCost(happyMech(s))
      * luxDemandMul(s)                                                            // 2026-10-14 净系数（增耗三项 − 居民减耗，先抵消）
      * (SB.civic ? SB.civic.govHappyConsumeMul(s) : 1)
      * (SB.wonder ? SB.wonder.happyConsumeMul(s) : 1)   // 政体：商人共和国 −30% / 奇观：国会大厦 −10%（政体·奇观乘区，不参与居民侧抵消）
      /* ERA10 市政《节能减耗》（2026-10-20 用户表「居民幸福度消耗 +50%」）：居民侧增耗乘区 ×1.5。
       * ⚠️ 与上面两条减免是**同一乘区链相乘**（先各自成乘区，最后整体相乘），不做「先加后乘」抵消——
       *    用户表里它是独立的卡面代价，与政体/奇观给的减免互不吞并。
       * ⚠️ 落点在 happyBurn（rates 与 tick 共用同一个函数），所以面板 burn 与实扣天然同源。 */
      * ((SB.civic && SB.civic.cardHappyConsumeMul) ? SB.civic.cardHappyConsumeMul(s) : 1);
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
   *    ✅ 银行那条直接复用现成的 `SB.economy.bankMul(s)`（不是自己写 `1 + lvl.bank×0.10`）：
   *    它里面还含 `civic.bankMerchantMul`，手写会漏掉市政那一半。
   * ⚠️ 若将来给商人加新的乘子，**这里要同步加** —— 又变成两套口径就会面板撒谎。
   *    e2e 有一条断言钉住「happySupply 与 tick 里 luxury 的毛产出相等」。 */
  function happySupply(s) {
    /* ⚠️ 2026-10-21：商人数量改读 `effJobs(s).merchant`（人类 + 机器人×robotMult），
     *    与 tick 的 happyStep `_S`、rates() 的 luxury 产能**三方同口径**——
     *    否则给商人分配机器人时，面板「供给」和真实产出又是两个数（面板撒谎家族）。
     *    ⚠️ 顺带补上此前漏乘的 `folkOutputMul`：它本来就该在（tick 的 _S 一直乘着），
     *       而 effJobs 内部已乘过一次 ⇒ 这里**不能再单独乘**，否则双重放大。
     *    守卫也要跟着换：只看 `s.jobs.merchant` 的话，机器人独占商人岗时会被判 0。 */
    if (!s) return 0;
    var _ej = (SB.folk && SB.folk.effJobs) ? SB.folk.effJobs(s) : null;
    var _mer = _ej ? (_ej.merchant || 0)
      : ((s.jobs && s.jobs.merchant ? s.jobs.merchant : 0) * (SB.economy.folkOutputMul ? SB.economy.folkOutputMul(s) : 1));
    if (!_mer) return 0;
    return _mer * SB.UNIT.luxury
      * SB.economy.toolMul(s, 'merchant')
      * SB.economy.baseMul(s)
      /* ERA10（2026-10-20）：大统一方程全产轴同样罩奢侈品（与旧日信仰同在 baseMul 轴，
       * 用户表「除科技、市政、信仰之外的全产」字面包含它；与 happyStep 的 _S 同式）。 */
      * (SB.economy.unifiedMul ? SB.economy.unifiedMul(s) : 1)
      * (SB.civic ? SB.civic.govLuxuryMul(s) : 1)
      * (1 + SB.economy.upgSum(s, 'luxuryMul'))
      * SB.economy.bankMul(s)
      * (SB.wonder ? SB.wonder.bazaarLuxMul(s) : 1)
      * (SB.civic ? SB.civic.cardJobOutMul(s) : 1);   // ERA7 延长工时卡：商人产出 +30%（职业产出口径）
  }
  /* 幸福度 → 全产乘区（台阶式，与文明6 同构：需求连续、效果分段）。
   * ⚠️ 排除 luxury 自身（luxury 产出行走 baseMul）：happy 增益不放大自己的燃料。 */
  function happyMul(s) {
    /* ⚠️ 读快照优先：tick 开头冻的 _happySnap 是「本 tick 开场 happy」，生产各行用的就是它
     *    （见 tick 里那段注释）。rates() 在 tick 之后调用时若读 s.happy（已被恒温器改小），
     *    面板会拿到下滑后的乘区而实账用下滑前的 ⇒ 面板撒谎。冻快照后两侧共用同一基准。
     *    无快照（未 tick 过 / 读旧档）回落 s.happy，行为不变。 */
    return happyTier(happyOf(s), s).mul;
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
    { name: '欣喜若狂', lo: 3,  mul: 1.20, nextAt: 4,  nextName: '兴盛',     nextMul: 1.30 },
    /* ERA6 市政《大众传媒》解锁2「拓展幸福度等级」（2026-10-12 用户拍）：新增三档。
     * ⚠️ 仅当拥有大众传媒时生效（happyTier 按 s.civics.massmedia 夹到索引 5；未拥有则封顶「欣喜若狂」）。
     *   happyMul 进 globalMul 放大全资源产出（排除 luxury 自身，防自激），×1.55 为终局档，乘区为提议值待标定。 */
    { name: '兴盛',     lo: 4,  mul: 1.30, nextAt: 5,  nextName: '繁荣',     nextMul: 1.42 },
    { name: '繁荣',     lo: 5,  mul: 1.42, nextAt: 6,  nextName: '黄金时代', nextMul: 1.55 },
    { name: '黄金时代', lo: 6,  mul: 1.55, nextAt: null, nextName: null,    nextMul: null }
  ];
  function happyTier(H, s) {
    var nat = 0;
    for (var i = 0; i < HAPPY_TIERS.length; i++) {
      if (i === HAPPY_TIERS.length - 1 || H < HAPPY_TIERS[i + 1].lo) { nat = i; break; }
    }
    /* 大众传媒门控：未拥有时封顶「欣喜若狂」（索引 5），不让高档生效。 */
    var maxIdx = (s && s.civics && s.civics.massmedia) ? HAPPY_TIERS.length - 1 : 5;
    return HAPPY_TIERS[Math.min(nat, maxIdx)];
  }

  /* 门控后的**档位表**（UI 用，2026-10-17 用户报「黄金时代都有了条没改」时收口）：
   * 未拥有大众传媒时只露出前 6 档（与 happyTier 的封顶索引 5 同一条规则，别再手抄第二份）。
   * 用途：幸福度条的标签行 + 比例尺上限（high = 门控表末档 lo）——
   * 漏门控 ⇒ 没研究大众传媒的玩家看到一条「拉宽到 6 却永远到不了」的假比例尺。 */
  function happyTierList(s) {
    var maxIdx = (s && s.civics && s.civics.massmedia) ? HAPPY_TIERS.length - 1 : 5;
    return HAPPY_TIERS.slice(0, maxIdx + 1);
  }

  /* ── ERA6 公司系统（宏观经济学解锁的「公司」标签，2026-10-12）──
   * 设计：拥有市政「宏观经济学」后自动成立两家公司（藻食→kelp / 珊瑚→coral），玩家无手动操作。
   *   公司成立后的**游戏内时长**（s.t − s.companyState[res].epoch，逐家独立）决定等级（乡镇→地方→全国），产出加成随之提升；
   *   奢侈品消耗恒 +10%（不随级变）。名字池见 src/companies.js（按行业分池，加行业=加一项）。
   * ⚠️ 初期只藻食/珊瑚两家 ⇒ companyMul 只对 kelp/coral 生效，其余资源恒 1（预留其他行业扩展）。 */
  /* ⚠️ 2026-10-13 改「单独关闭」：等级/关闭态逐家存于 s.companyState[res]，故改为按 res 判定。
   *   旧版用全局 s.companyEpoch 做唯一成立时刻，改成逐家 epoch 后这里必须收 res 参数。 */
  function companyByRes(res) {
    if (!SB.COMPANIES) return null;
    for (var i = 0; i < SB.COMPANIES.length; i++) if (SB.COMPANIES[i].res === res) return SB.COMPANIES[i];
    return null;
  }
  function companyTierIndex(s, res) {
    var st = (s && s.companyState && s.companyState[res]) || null;
    if (!st || !st.epoch || !(st.epoch > 0) || st.closed) return -1;
    var elapsed = (s.t || 0) - st.epoch;
    var c = companyByRes(res);
    var tiers = (c && c.tiers) ? c.tiers : SB.COMPANY_TIERS;
    return SB.companyTierIndex ? SB.companyTierIndex(elapsed, tiers) : 0;
  }
  function companyMul(s, res) {
    var idx = companyTierIndex(s, res);
    if (idx < 0) return 1;
    var c = companyByRes(res);
    if (!c || c.craft) return 1;   // craft 型公司走 companyCraftRatio，不进资源产出乘区
    var tiers = c.tiers || SB.COMPANY_TIERS;
    return 1 + ((tiers[idx] && tiers[idx].bonus) || 0);
  }
  /* 工艺效率公司（companies.js craft:true）的加成：进 workshop.craftRatio 同一条加法乘区。
   * 与建筑级/科技/奇观/政策卡/升级同档相加，不是相乘。 */
  function companyCraftRatio(s) {
    if (!s || !SB.COMPANIES) return 0;
    var m = 0;
    for (var i = 0; i < SB.COMPANIES.length; i++) {
      var c = SB.COMPANIES[i];
      if (!c.craft) continue;
      var idx = companyTierIndex(s, c.res);
      if (idx < 0) continue;
      var tiers = c.tiers || SB.COMPANY_TIERS;
      m += (tiers[idx] && tiers[idx].bonus) || 0;
    }
    return m;
  }
  /* 公司系统给的奢侈品消耗额外加成：逐家 sum（每家恒 +10%，关掉哪家居然就少哪家）。
   * 旧版全局 0.10，现在只统计「存活且已成立」的公司，匹配「单独关闭」语义。 */
  function companyLuxMul(s) {
    var total = 0;
    if (!s || !SB.COMPANIES) return 0;
    for (var i = 0; i < SB.COMPANIES.length; i++) {
      var c = SB.COMPANIES[i];
      var st = s.companyState && s.companyState[c.res];
      if (st && st.epoch > 0 && !st.closed) total += (c.luxBonus || 0);
    }
    return total;
  }

  SB.economySocial = {
    happyCost: happyCost, happyBonusTotal: happyBonusTotal, happyMech: happyMech,
    luxSaveAll: luxSaveAll, tenementLuxAdd: tenementLuxAdd, fissionLuxAdd: fissionLuxAdd, luxDemandMul: luxDemandMul,
    happyBurn: happyBurn, happyCostPer: happyCostPer, happySupply: happySupply,
    happyMul: happyMul, happyOf: happyOf, happyTier: happyTier, HAPPY_TIERS: HAPPY_TIERS,
    happyTierList: happyTierList,
    companyTierIndex: companyTierIndex, companyMul: companyMul, companyLuxMul: companyLuxMul,
    companyCraftRatio: companyCraftRatio
  };
})(typeof window !== 'undefined' ? window : globalThis);
