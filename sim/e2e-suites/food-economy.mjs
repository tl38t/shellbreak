/* e2e suite: food production, consumption, storage, and resource sources. */
export function run({ SB, check, noop }) {
/* ---------------- 食物三旋钮（产 / 增 / 省 / 储）---------------- */
/* P1 落地的核心。四个断言各盯一个旋钮，任何一个接线漏了都会红。 */
console.log('\n=== 食物三旋钮 ===');
{
  const s = SB.game.run();
  const base = SB.CFG.CAP_BASE.kelp;
  check('基础菌毯上限已收紧到 200（否则储旋钮是废的）', base === 200, 'CAP_BASE.kelp=' + base);
  check('未建压舱仓时上限即基础值', SB.economy.capOf(s, 'kelp') === base, 'capOf=' + SB.economy.capOf(s, 'kelp'));

  // 增：喷口导流堤 +3%/级
  s.lvl.kelp = 1; s.lvl.weir = 0; s.t = 0;
  const rate0 = SB.economy.foodRate(s, 1);
  s.lvl.weir = 1;
  const rate1 = SB.economy.foodRate(s, 1);
  check('喷口导流堤 1 级让菌毯产出 +3%', Math.abs(rate1 / rate0 - 1.03) < 1e-9,
    rate0.toFixed(4) + ' → ' + rate1.toFixed(4) + '/秒');
  s.lvl.weir = 0;

  /* 人口硬上限（2026-09-26 恢复真硬上限）——新机制的护栏，缺了它等于没有回归保护。
   * 旧规则是 `pop >= popCap` 就停生；2026-09-25 那版改成「超住只减速」，实测没约束力
   * （一座住房都不建、上限 0，41 分钟也能养到 18 人，比建 1 座礁口巢只慢 7%），
   * 而屏幕上同时写着「族民 7（人口上限 2）」自相矛盾（用户报的 bug）⇒ 改回来。
   * 注意「人口写不进上限」不报错，只会让住房这条线空转，所以下面全部用真跑来验证。 */
  {
    /* 造一局并锁死藻食：这里要验证的是**住房这道闸门**，不是经济能否自给自足
     * （后者由别的断言管），别让饿死污染这条。 */
    const mk = (pop, nest) => {
      const g = SB.state.freshRun(false);
      g.pop = pop; g.lvl.nest = nest; g.res.kelp = 500;
      return g;
    };
    const run = (g, ticks) => {
      for (let i = 0; i < ticks; i++) { SB.economy.tick(g, 0.1, null); g.res.kelp = 500; }
    };
    /* ⚠️ 口径：`BLD.houseBase = 1`（2026-09-26 用户拍板「开局是1/1」），
     *   所以 popCap = 1 + nest×2 —— 下面每个上限都比「纯建筑」多 1。 */
    const CAP = (nest) => SB.CFG.BLD ? SB.CFG.BLD.houseBase + nest * 2 : 1 + nest * 2;
    /* ① 0 座住房 ⇒ 上限就只有开局那 1 个底数：600 秒也生不出第二人（不是「生得很慢」）。 */
    const g0 = mk(1, 0);
    run(g0, 6000);
    check('住房 0 座 ⇒ 人口恒为开局那 1 人（住满是墙，不是减速）', g0.pop === 1 && SB.economy.isFull(g0),
      '上限 ' + SB.economy.popCap(g0) + '，600s 后 pop=' + g0.pop);
    /* ② 住满时人口不增，且 _grow 每帧归零 —— 不攒进度才不会有
     *    「先攒满进度条、再点建造白送一个人」这类卡准漏洞。 */
    const gFull = mk(5, 2);                     // 上限 1+4=5，正好住满
    run(gFull, 3000);
    check('住满时人口不增且 _grow 归零（不攒白送的进度）',
      gFull.pop === 5 && gFull._grow === 0, 'pop=' + gFull.pop + ' _grow=' + gFull._grow);
    /* ③ 住房是人口线唯一的解药：同一段时间里，还剩位置的对照组应当长到顶。 */
    const gRoom = mk(4, 3);                     // 上限 1+6=7，还剩 3 个位置
    run(gRoom, 6000);
    check('有空位就能继续生育，且长到上限为止', gRoom.pop === 7,
      '有空位 ' + gFull.pop + '→' + gRoom.pop + ' 人（上限 ' + CAP(3) + '），住满组仍是 ' + gFull.pop + ' 人');
    /* ④ 边界必须是 `pop == popCap`（写成 > 会差一人白等一胎，写成 < 会漏最后一胎）。 */
    check('isFull 的边界是 pop == popCap',
      SB.economy.isFull(mk(CAP(3), 3)) && !SB.economy.isFull(mk(CAP(3) - 1, 3)),
      'nest=3 ⇒ 上限 ' + CAP(3) + '：pop ' + CAP(3) + ' 应住满、pop ' + (CAP(3) - 1) + ' 不应');
    /* ⑤ 旧机制的函数必须彻底消失，否则将来有人照 2026-09-25 的注释重新调它。 */
    check('旧的生育减速/人口上限函数已彻底移除',
      SB.economy.growRate === undefined && SB.economy.houseCap === undefined,
      'growRate=' + typeof SB.economy.growRate + ' houseCap=' + typeof SB.economy.houseCap);
  }

  /* 省：保温巢 −0.5%/级、无减免上限（2026-09-26 用户拍板照抄猫国 pasture catnipDemandRatio，
     撤掉本作自造的 −60% 护栏）。三条断言各守一件事：每级步值 / 线性叠加 / 100% 防错边界。 */
  s.pop = 10; s.lvl.warmnest = 0;
  const use0 = SB.economy.foodUse(s);
  s.lvl.warmnest = 1;
  const use1 = SB.economy.foodUse(s);
  check('保温巢 1 级让口粮 −0.5%（对齐猫国 pasture 的 −0.005/级）',
    Math.abs(use1 / use0 - 0.995) < 1e-9,
    use0.toFixed(4) + ' → ' + use1.toFixed(4) + '/秒');
  s.lvl.warmnest = 100;      // 无上限 ⇒ 线性：100 级正好省 50%
  check('保温巢省耗无上限：100 级线性省 50%',
    Math.abs(SB.economy.foodUse(s) / use0 - 0.50) < 1e-9,
    (SB.economy.foodUse(s) / use0 * 100).toFixed(1) + '% 原消耗');
  s.lvl.warmnest = 400;      // 越界档：减免不许翻过 100%，否则消耗变负 = 白送口粮
  check('省耗减免被夹在 100%（400 级也不许倒贴口粮）', SB.economy.foodUse(s) >= 0,
    'use=' + SB.economy.foodUse(s).toFixed(4) + '（须 ≥ 0）');
  s.lvl.warmnest = 0;

  // 储：海藻仓 +5000/级（对标猫国 barn 的 catnipMax 5000），且不吃全局增量
  s.lvl.kelpstore = 1;
  const cap1 = SB.economy.capOf(s, 'kelp');
  check('海藻仓 1 级把菌毯上限提到 5200', cap1 === base + 5000, cap1 + '（基础 ' + base + '）');
  s.lvl.kelpstore = 0;

  /* ---- 仓储形态（2026-09-26 第三轮·用户拍板「除了基础仓储之外的都改成和猫国一致，
   *      通过专门的仓库建筑和科技给库存」）----
   * 三条规格：
   *   ① 常规材料按 CAP_BASE 管容量；kind:'craft' 的工艺资源全部无上限。
   *      旧版 `if (!CFG.CAP_BASE[k])` 把「明写 0」也判成表外 ⇒ stone / warmstone 整局无上限，那是 bug。
   *   ② 上限不再有「每建筑级给一点全局容量」那一轴（旧 CAP_PER_LVL 已删）——
   *      猫国的容量 100% 来自专门的仓库建筑（barn / warehouse / harbor / 对撞机）。
   *   ③ 藻食与材料**两条线各认自己的仓**：藻食 → 海藻仓（era1「种植」解锁）、
   *      材料 → 压舱仓（era2 解锁）。一个 store 管两件事会让「储」这个旋钮失焦。
   * 反向对照：科技与全部工艺资源必须表外无上限；材料仓对藻食必须零作用。
   * ⚠️ 这里要盯的**不是数值大小**（那是标定，用户来定），而是「哪条线归谁、接没接上」。 */
  {
    const zero = SB.state.freshRun(false);
    const RESS = Object.keys(SB.RESS);
    const co = (g, k) => SB.economy.capOf(g, k);

    /* ⚠️ res 的键必须覆盖 SB.RESS —— 这条是 2026-09-28 那次 NaN 事故的钉子。
     *    加资源时只往 RESS 里加条目、忘了改 freshRun 的 res 字面量，就会得到
     *    `res.ironBracket === undefined` ⇒ addRes 里 `undefined + 5.25 = NaN` ⇒
     *    `Math.min(Infinity, NaN)` 还是 NaN ⇒ 产物进了池子、读出来却是 NaN，
     *    面板显示「NaN 铁制支架」，升级项扣费 `undefined - 50` 又把池子整个污染。
     *    ⚠️ 它跟「漏一个建筑键」是同一类：不报错，只是那一格凭空变成 NaN。
     *    ⇒ 每加一种资源，这条都会替你兜一次。 */
    const resMiss = RESS.filter(k => !(k in zero.res) || typeof zero.res[k] !== 'number' ||
      !isFinite(zero.res[k]));
    check('freshRun 的 res 键覆盖 SB.RESS 且每个都是有限数（漏键 = 资源变 NaN，不报错）',
      resMiss.length === 0,
      resMiss.length ? '缺/非数：' + resMiss.join(', ')
        : RESS.length + ' 种资源全部就位');

    const noCap = RESS.filter(k => !isFinite(co(zero, k)));
    check('石头 / 暖石必须吃仓储（旧版把「明写 0」当成表外 ⇒ 整局无上限）',
      noCap.indexOf('stone') === -1 && noCap.indexOf('warmstone') === -1,
      '无上限的资源 = [' + noCap.join(', ') + ']');
    /* 工艺资源统一不设上限：`kind:'craft'` 是 UI 分类，不受仓储容量约束；
     *   无上限名单覆盖全部当前工艺资源，新增时也会被显式审查。
     * ⚠️ 2026-09-27：`culture`（市政点）也进表外了，与 science 同类——
     *    两条都是「只用于解锁、不存在花不掉」的资源，撞上仓储上限只会让玩家
     *    在快够 100 点时被卡住。以后再加这类线，都要走「不给 CAP_BASE 键」。
     * ⚠️ 同日还多出一条 `stoneBeam`（石梁）——**是用户拍的，不是漏写**：
     *    它是「工艺制作的产物」（100 石头 → 1 石梁），与采集出来的资源性质不同；
     *    照猫国 beam 也不给 beamMax（warehouse 的 effects 只有 catnipMax/woodMax/
     *    mineralsMax/coalMax/ironMax/titaniumMax/goldMax，压根没有 beamMax ⇒ 恒 MAX_VALUE）。
     *    ⇒ 这里把批准无上限的资源列成**白名单**：将来谁再想让某种资源不受仓储约束，
     *      这条就会红，逼人回来显式拍一次，而不是悄悄漏过去。 */
    /* ⚠️ 2026-09-28 批准名单加 `ironBracket`（铁制支架）与 `rope`（绳）：
     *    这两位是 era2 第三层「工艺升级项」的消耗品，由工坊配方造出来、成批消耗。
     *    **是同 `stoneBeam` 那一类（工艺制作的产物），不是漏写 CAP_BASE** ——
     *    若给它们上限，玩家会在「攒够 50 条绳准备扩容」的途中被仓储卡住，
     *    而升级项的成本又是按 50 份计的，那一刀就正好落在最难受的位置上。
     *    ⚠️ 这个白名单的意义是「将来谁再想新增表外资源，这里会红，逼人回来显式拍一次」，
     *       所以批准一个就得在注释里写出**理由**，不能只加键。 */
    /* ⚠️ 2026-09-28 批准名单加 `luxury`（奢侈品）：商人产它、贸易系统待设计。
     *    **批准理由是「现在没有开销渠道」，不是「永远没有」** —— 贸易规则一旦落地
     *    必然要设上限（否则无限囤货能把贸易买空），那时候这条批准要撤销、给 CAP_BASE
     *    补键。注释就是留给那时候的：看见这句就去改 config.js 的 CAP_BASE。
     *    ⚠️ 与上面 ironBracket/rope 那两条的区别：那两位是「工艺制品」，这位是
     *       「贸易货物」，将来要加上限的是它。别把两条的理由看混。 */
    /* ⚠️ 2026-09-28 批准名单加 faith（信仰）：理由与 luxury 逐字同源——宗教界面待设计，
     *    此刻没有任何开销渠道，设上限只会卡住「攒着等宗教」的玩家。
     *    ⚠️ 宗教规则拍板时必须**撤销这条批准**（加 CAP_BASE.faith），那条注释也是留给它俩的。 */
    /* ⚠️ 2026-09-29 批准名单加 hardCoral（硬化珊瑚）：与 stoneBeam/ironBracket/rope 同属
     *    「工艺制作的产物」一类——由工坊配方造出来、成批消耗（压舱仓建造成本吃 2 份）。
     *    **不是漏写 CAP_BASE**，照石梁那套口径（猫国 warehouse 的 effects 也没有 beamMax，
     *    beam 恒无上限）。若给上限，玩家会在「攒 2 份硬化珊瑚建压舱仓」途中被仓储卡死。
     *    它和 stoneBeam 是猫国 warehouse 的「两种初级结构件」分工（beam + slab 对标）。 */
    var CAPLESS_OK = { science: 1, culture: 1, stoneBeam: 1, ironBracket: 1, rope: 1, hardCoral: 1, luxury: 1, faith: 1,
      /* ERA3 热液能系统（2026-09-29）：钢 / 热液能 / 钢制零件均无 CAP_BASE 上限键 ⇒ capOf 自动
       *    Infinity（钢无上限抄猫国）。三者与石梁同口径——由工坊/建筑产、成批消耗（钢制零件吃 50 份建
       *    阿尔巴达），给上限会卡死建造。加进白名单，反向对照才不会把正当无上限误报成漏写 CAP_BASE。 */
      steel: 1, hydro: 1, steelPart: 1,
      /* ERA4（2026-09-30）：脚手架 = 工艺制作的产物（硬化珊瑚 100 + 绳 100 → 1），与石梁/铁制支架同口径。
       *   不给 CAP_BASE 键 ⇒ capOf 恒 Infinity（无仓储上限）；给上限会卡死「攒材料造脚手架」的进度。
       *   钛是采集材料、有仓储上限；工艺资源统一无上限。 */
      scaffold: 1,
      /* ERA4（2026-09-30）：artwork（艺术品）/ tidalRecord（潮汐志录）。
       *   与 stoneBeam/ironBracket/rope 同属「工艺制作的产物」一类 —— 由工坊配方造出来、
       *   成批消耗（历史哲学的 crafting 入口），照猫国 beam 也无 warehouse 上限键 ⇒ 恒无上限。
       *   给上限会卡死「攒材料造艺术品」的进度。两者都不是漏写 CAP_BASE。 */
      artwork: 1, tidalRecord: 1,
      /* ERA5（2026-10-02）：共振钻头（resonantDrill）。与 stoneBeam/ironBracket/rope/hardCoral 同属
       *   「工艺制作的产物」一类 —— 由工坊配方 craft_drill 造出来、成批消耗（天穹钻机机器运行每 tick
       *   扣 0.1，建一座就吃 20 份）。照石梁那套口径（猫国 warehouse 没有 beamMax ⇒ 恒无上限）。
       *   不给 CAP_BASE 上限键，否则「攒 20 钻头建天穹钻机」会被仓储卡死。不是漏写 CAP_BASE。 */
      resonantDrill: 1,
      /* 用户要求：所有 craft 资源无上限；θ金属现为普通限量资源，因此不在白名单。 */
      /* ERA9（2026-10-19）：强工质火箭引擎（strongProp）—— craft 资源，与 thinafilm/rocketFuel/
       *   rocketEngine 同口径（工艺制造产物，无仓储上限）。mars_workshop/europa_launch 造价与
       *   运行耗料，不设 CAP_BASE 键 ⇒ capOf 恒 Infinity。漏进白名单会被反向对照误报成漏写 CAP_BASE。 */
      tiplate: 1, thinafilm: 1, rocketFuel: 1, rocketEngine: 1, strongProp: 1,
      /* ERA6（2026-10 实装）：封闭藻仓（sealbin）。与 artwork/tidalRecord/stoneBeam 同属
       * 「工艺制作的产物」一类 —— 由工坊配方 craft_sealbin（钛金板件 5 + 温水藻 200 → 1）造出来、
       *   成批消耗（温水藻场升级材料）。照石梁那套口径（猫国 warehouse 没有 beamMax ⇒ 恒无上限）。
       *   不给 CAP_BASE 上限键，否则「攒材料造封闭藻仓」会被仓储卡死。不是漏写 CAP_BASE。 */
      sealbin: 1,
      /* ERA7（2026-10-17 · spec §7）：星屑（stardust）—— 跨周目局外资源，与科技/市政点同口径无上限
       *   （存 meta 存档，不进 res 池上限）。故意不给 CAP_BASE 键（与 science/culture 同处理由）。
       *   本周目只作为 eureka 累计台账（s.got.stardust = meta seed）读到，不是可囤资源。 */
      stardust: 1 };
    check('反向对照：科技 / 市政点 / 石梁 / 工艺制品仍表外无上限（批准名单，加别的必红）',
      noCap.length > 0 && noCap.every(k => !!CAPLESS_OK[k]),
      '[' + noCap.join(', ') + ']');
    const cappedCraft = RESS.filter(k => SB.RESS[k].kind === 'craft' && isFinite(co(zero, k)));
    check('所有工艺资源无仓储上限', cappedCraft.length === 0, '有上限=' + cappedCraft.join(','));

    /* ⑤ 钢的顶栏位置（2026-10-06 用户拍板：「钢应该放到精铁下面一格，而不是放到工艺资源里」）。
     *   位置由两件事决定，缺一不可：
     *     ① RESS 的**键顺序**（renderRes 按 `for (var k in SB.RESS)` 遍历 ⇒ 顺序 = 显示顺序）；
     *     ② `kind:'craft'` 会被 renderRes 分到独立的 res-craft 折叠区。
     *   所以这条钉两半：紧跟在 iron 后面（①）、且不带 kind:'craft'（②）。 */
    {
      const rkeys = Object.keys(SB.RESS);
      const iIron = rkeys.indexOf('iron'), iSteel = rkeys.indexOf('steel');
      check('钢紧跟在精铁下面一格（顶栏显示顺序 = RESS 键顺序）',
        iIron >= 0 && iSteel === iIron + 1, 'iron@' + iIron + ' steel@' + iSteel);
      check('钢不再被分到「工艺资源」折叠区（无 kind:craft ⇒ 走顶栏主区）',
        SB.RESS.steel.kind !== 'craft', 'kind=' + SB.RESS.steel.kind);
      /* 同区判定：与精铁同 kind（都没有 ⇒ 都进主区）。这条防止以后有人只给其中一条加 craft。 */
      check('钢与精铁同区（两者 kind 一致，都不在工艺区）',
        (SB.RESS.steel.kind || 'base') === (SB.RESS.iron.kind || 'base'));
      /* 其余口径不许被这次移位顺手改掉：无上限 + 仍挂金属精炼科技。 */
      check('钢仍无仓储上限（2026-09-29 用户拍「抄猫国」，CAP_BASE 不加键）',
        SB.CFG.CAP_BASE.steel === undefined && SB.economy.capOf(SB.state.freshRun(false), 'steel') === Infinity);
      check('钢的解锁门仍是金属精炼科技', !!SB.RESS.steel.unlock && SB.RESS.steel.unlock.tech === 'metalrefine',
        JSON.stringify(SB.RESS.steel.unlock));
      /* 反向：工艺资源里不该再有钢（否则等于没挪）。 */
      const stillCraft = Object.keys(SB.RESS).filter(k => k !== 'steel' && SB.RESS[k].kind === 'craft');
      check('工艺资源区仍有其他成员（钢不是唯一一条，测试本身有意义）',
        stillCraft.length > 0, '剩=' + stillCraft.join(','));
    }

    /* ② 建筑等级**不再**给容量：把每座非仓库建筑各抬 10 级，上限必须纹丝不动。
     *    这条是「删掉 CAP_PER_LVL」的正面证据 —— 旧形态下它们会一起涨。 */
    const many = SB.state.freshRun(false);
    /* ⚠️ 2026-09-28 例外列表加 lighthouse：灯塔**故意**给容量（+120/级，与压舱仓同档），
     *    用户规格「大灯塔获得仓库的作用，但资源上限量为其一半」⇒ 灯塔得先有仓储基准，
     *    大灯塔那「一半」才有出处。它是**有意效仿 ballast/kelpstore** 的容量建筑，
     *    不是「全局增量」复活 —— 所以排除它的理由与那两座相同，不是放宽这条断言。
     *    ⚠️ 加仓库建筑时报「会涨」是预期行为；加**非仓库**建筑时报才是真漏。 */
    for (const b of SB.BUILDINGS) {
      if (!['kelpstore', 'ballast', 'lighthouse'].includes(b.id)) many.lvl[b.id] = 10;
    }
    const moved = RESS.filter(k => co(many, k) !== co(zero, k));
    check('每建筑级的全局增量已彻底删除（铺满建筑也不涨容量）',
      moved.length === 0, '会涨的资源 = [' + moved.join(', ') + ']');

    /* ③ 两条线各认自己的仓，且**不互相串**。 */
    const w0 = SB.state.freshRun(false);
    const w1 = SB.state.freshRun(false); w1.lvl.kelpstore = 1;
    const b1 = SB.state.freshRun(false); b1.lvl.ballast = 1;
    check('海藻仓只给藻食（+5000/级，对标猫国 barn 的 catnipMax）',
      co(w1, 'kelp') - co(w0, 'kelp') === SB.BLD.kelpCap &&
      co(w1, 'coral') === co(w0, 'coral'),
      '藻食 +' + (co(w1, 'kelp') - co(w0, 'kelp')) + '，珊瑚 ' + (co(w1, 'coral') - co(w0, 'coral')));
    check('压舱仓只给材料（+120/级），对藻食零作用',
      co(b1, 'coral') - co(w0, 'coral') === SB.BLD.ballastCap &&
      co(b1, 'kelp') === co(w0, 'kelp'),
      '珊瑚 +' + (co(b1, 'coral') - co(w0, 'coral')) + '，藻食 ' + (co(b1, 'kelp') - co(w0, 'kelp')));

    /* 科技侧那条容量通道必须真的活着。它**曾经是死键**：mul() 算出了值、UI 也照着
     * 显示「藻食上限 +200」，但 capOf 从来没读过它 ⇒ 储藻术研究完什么也没发生。
     * 这正是用户要的「通过仓库建筑和科技给库存」，所以补一条只盯接线的断言。 */
    const t0 = SB.state.freshRun(false);
    /* ⚠️ 2026-09-28：科技名从「储藻术」换成「照明」，加的那 200 是同一个 eff.kelpCap。 */
    const t1 = SB.state.freshRun(false); t1.techs = { lighting: true };
    check('科技给的容量真的进了上限（旧版是「UI 声称 +200、实际没接线」的死键）',
      co(t1, 'kelp') - co(t0, 'kelp') === 200,
      '藻食 +' + (co(t1, 'kelp') - co(t0, 'kelp')));
  }

  // 产 ≠ 省：两者不是同一件事，别把符号搞反
  check('口粮与产出互不串味', SB.economy.foodRate(s, 1) > 0 && SB.economy.foodUse(s) > 0,
    '产 ' + SB.economy.foodRate(s, 1).toFixed(3) + ' / 吃 ' + SB.economy.foodUse(s).toFixed(3));
  s.lvl.kelp = 0;
}

/* ---------------- 食物双源（建筑 + 采集者）---------------- */
/* 照猫国 game.js:3666 calcResourcePerTick("catnip") 的语句顺序落地。
 * 这里最容易改错的一条：季节那行（源码 3685 行）必须夹在「取建筑侧」与
 * 「加职业侧」之间。谁把它挪到 (建筑+职业)×季节，采集者一到寒流季就集体饿死，
 * 而单看暖流季的代码永远发现不了——所以下面三条必须分开断言。 */
console.log('\n=== 食物双源 ===');
{
  const s = SB.game.run();
  const M = SB.SEASONS;
  const SEASON_TICKS = SB.CFG.SEASON_TICKS;
  /* 采集者是开局唯一职业、且产食（docs/DESIGN_v0.3.md §4）。
   * 上一轮自创的「圃丁」已删——它与采集者产同一资源，玩家无从取舍。 */
  check('职业表只有采集者产食', SB.JOBS.filter(j => /藻食|菌毯/.test(j.desc)).map(j => j.id).join() === 'gather',
    SB.JOBS.map(j => j.id).join(' / '));
  check('已无圃丁残留职业', !SB.JOBS.some(j => j.id === 'planter'), SB.JOBS.map(j => j.id).join(' / '));

  /* 季索引**按表查**，不写死第几季：2026-09-27 删掉浊流季（4→3），
   * 旧断言写死 `M[3]`（第 4 季 = 寒流季）直接读 undefined。季节表是最容易被增删的表，
   * 取索引跟着表走，别再硬编码一次。 */
  const WARM_IDX = M.findIndex(x => x.mult >= 1);
  const COLD_IDX = M.findIndex(x => x.mult < 1);

  // 建筑侧：只有菌圃在产
  s.lvl.kelp = 1; s.lvl.weir = 0; s.jobs.gather = 0; s.pop = 1;
  s.t = SEASON_TICKS * WARM_IDX;             // 暖流季
  const warmB = SB.economy.foodRate(s, 1);
  s.t = SEASON_TICKS * COLD_IDX;             // 寒流季
  const coldB = SB.economy.foodRate(s, 1);
  check('季节减产只打建筑侧', Math.abs(coldB / warmB - M[COLD_IDX].mult / M[WARM_IDX].mult) < 1e-9,
    '暖流 ' + warmB.toFixed(4) + ' → 寒流 ' + coldB.toFixed(4));

  // 职业侧：只有采集者在产
  s.lvl.kelp = 0; s.jobs.gather = 1;
  s.t = SEASON_TICKS * WARM_IDX;
  const warmJ = SB.economy.foodRate(s, 1);
  s.t = SEASON_TICKS * COLD_IDX;
  const coldJ = SB.economy.foodRate(s, 1);
  check('采集者产出不吃季节减产', Math.abs(coldJ / warmJ - 1) < 1e-9,
    '暖流 ' + warmJ.toFixed(4) + ' / 寒流 ' + coldJ.toFixed(4));

  // 两条来源相加进同一池
  s.t = 0; s.lvl.kelp = 1; s.jobs.gather = 1;
  const both = SB.economy.foodRate(s, 1);
  check('建筑与采集者的产出相加进同一池', Math.abs(both - (warmB + warmJ)) < 1e-9,
    '建筑 ' + warmB.toFixed(4) + ' + 采集者 ' + warmJ.toFixed(4) + ' = ' + both.toFixed(4));

  // 采集者必须真的比菌圃值钱，否则「雇人 vs 铺田」这条取舍不存在
  check('采集者单位产出高于菌圃（雇人 vs 铺田有意义）', SB.UNIT.kelp > SB.BLD.food * 2,
    '采集者 ' + SB.UNIT.kelp + ' vs 菌圃 ' + SB.BLD.food + '/级');

  /* ══ 商队驿站：两条效果按等级接线（2026-10-06 用户报「就这点效果？」）══
   * 【根因不是量级小，是「等级没接线」】原实现只判 `lvl >= 1` ⇒ 1 级与 5 级效果完全相同，
   * 而 ratio 1.15 意味着满级比 1 级多花 1.75 倍的钱。属「承诺了没接线」。
   * 【用户给定的数值】① 每级 +1 分钟产量（每季发放）② 每级 −1% 居民奢侈品消耗。 */
  {
    /* ① 发放量随等级线性：1 级 60 秒（与原口径一致 ⇒ 零回归）、3 级 180 秒、5 级 300 秒。 */
    const car = SB.state.freshRun(false);
    car.civics = { explore: true };
    car.jobs = { gather: 2 }; car.res.kelp = 0; car.res.coral = 0;
    car.lvl.hall = 0; car.lvl.caravanserai = 0; car.lvl.weir = 0; car.lvl.warmnest = 0;
    /* 只留采集者（纯时产、池子最小 ⇒ 抽中确定），先测速率基准 */
    const base = SB.economy.rates(car);
    const pool = Object.keys(base).filter(k => typeof base[k] === 'number' && base[k] > 0);
    check('发放池非空（至少有一个时产资源）', pool.length > 0, '池=' + pool.join(','));
    /* seasonGrant 内部随机抽池 ⇒ 无法断言「抽中哪个」，
     *   但可以断言「总量 = 速率 × 60 × 等级」：把池子收窄到只剩一个资源 ⇒ 抽中它是确定的。 */
    const single = SB.state.freshRun(false);
    single.civics = { explore: true };
    single.jobs = { gather: 1 };
    single.lvl.kelp = 0; single.lvl.weir = 0; single.lvl.warmnest = 0; single.lvl.ballast = 0;
    single.lvl.hall = 0; single.lvl.siltpit = 0; single.lvl.nest = 0; single.lvl.coralhouse = 0;
    single.lvl.lighthouse = 0; single.lvl.kelpstore = 0; single.lvl.workshop = 0; single.lvl.furnace = 0;
    single.lvl.library = 0; single.lvl.institute = 0; single.lvl.square = 0; single.lvl.temple = 0;
    single.res.kelp = 0;
    const kelpRate = SB.economy.rates(single).kelp || 0;
    check('发放池已收窄到只剩藻食（随机抽池因此确定）',
      Object.keys(SB.economy.rates(single)).filter(k => SB.economy.rates(single)[k] > 0).join() === 'kelp',
      'kelpRate=' + kelpRate);
    [1, 3, 5].forEach(function (lv) {
      const x = SB.state.freshRun(false);
      x.civics = { explore: true };
      x.jobs = { gather: 1 };
      x.lvl.kelp = 0; x.lvl.weir = 0; x.lvl.warmnest = 0; x.lvl.ballast = 0;
      x.lvl.hall = 0; x.lvl.siltpit = 0; x.lvl.nest = 0; x.lvl.coralhouse = 0;
      x.lvl.lighthouse = 0; x.lvl.kelpstore = 0; x.lvl.workshop = 0; x.lvl.furnace = 0;
      x.lvl.library = 0; x.lvl.institute = 0; x.lvl.square = 0; x.lvl.temple = 0;
      x.lvl.caravanserai = lv;
      x.res.kelp = 0;
      const r0 = SB.economy.rates(x).kelp;
      SB.economy.seasonGrant(x);
      check('🚨 商队驿站 ' + lv + ' 级 ⇒ 每季发放 = 速率×60×' + lv + '（线性接线）',
        Math.abs(x.res.kelp - r0 * 60 * lv) < 1e-6,
        '实得=' + x.res.kelp.toFixed(4) + ' 预期=' + (r0 * 60 * lv).toFixed(4));
    });
    /* 没建驿站 ⇒ 一分不发（接线不能反过来让 0 级也开始发）。 */
    const x0 = SB.state.freshRun(false);
    x0.civics = { explore: true }; x0.jobs = { gather: 1 };
    x0.lvl.caravanserai = 0; x0.res.kelp = 0;
    const r0b = SB.economy.rates(x0).kelp;
    SB.economy.seasonGrant(x0);
    check('商队驿站 0 级 ⇒ 不发放（门仍在）', x0.res.kelp === 0,
      '实得=' + x0.res.kelp.toFixed(4) + ' 速率=' + r0b.toFixed(4));
    /* ② 每级 −1% 居民奢侈品消耗：直接读 luxSaveAll，并验 tick/rates/UI 三处同源。 */
    const ls = SB.state.freshRun(false);
    ls.lvl.caravanserai = 0; ls.lvl.canal = 0;
    const l0 = SB.economy.luxSaveAll(ls);
    ls.lvl.caravanserai = 1;
    const l1 = SB.economy.luxSaveAll(ls);
    ls.lvl.caravanserai = 5;
    const l5 = SB.economy.luxSaveAll(ls);
    check('商队驿站：luxSaveAll 随等级线性 +1%/级（0/1/5 级 ⇒ 0 / 1% / 5%）',
      Math.abs(l0) < 1e-9 && Math.abs(l1 - 0.01) < 1e-9 && Math.abs(l5 - 0.05) < 1e-9,
      'l0=' + l0 + ' l1=' + l1 + ' l5=' + l5);
    /* 与王国潮道并列相加（不是覆盖）：潮道 1 级(0.3%) + 驿站 1 级(1%) = 1.3% */
    const both = SB.state.freshRun(false);
    both.lvl.canal = 1; both.lvl.caravanserai = 1;
    check('驿站与王国潮道**并列相加**（1+1 级 ⇒ 1.3%，不是取大也不是覆盖）',
      Math.abs(SB.economy.luxSaveAll(both) - 0.013) < 1e-9,
      '实=' + SB.economy.luxSaveAll(both));
    /* happyBurn（UI 读数）必须含驿站减耗 —— 这正是原先漏掉潮道的那类漏 */
    const hb = SB.state.freshRun(false);
    hb.civics = { trade: true }; hb.pop = 10; hb.jobs.merchant = 0; hb.happy = 0;
    const h0 = SB.economy.happyBurn(hb);
    hb.lvl.caravanserai = 5;
    const h5 = SB.economy.happyBurn(hb);
    check('🚨 happyBurn 含驿站减耗（5 级 ⇒ ×0.95，原实现会漏这条）',
      Math.abs(h5 / h0 - 0.95) < 1e-9, 'h0=' + h0.toFixed(6) + ' h5=' + h5.toFixed(6) + ' 比=' + (h5 / h0).toFixed(6));
    /* rates 的 D 侧同源：净速率应等于 供给 − happyBurn */
    hb.jobs.merchant = 1;
    const rt = SB.economy.rates(hb);
    check('rates 的 D 侧与 happyBurn 同源（净速率 = 供给 − burn）',
      Math.abs(rt.luxury - (SB.economy.happySupply(hb) - SB.economy.happyBurn(hb))) < 1e-9,
      'rates=' + rt.luxury.toFixed(8) + ' 手算=' + (SB.economy.happySupply(hb) - SB.economy.happyBurn(hb)).toFixed(8));
    /* ③ 廉租社区每级 +5% 居民奢侈品消耗（增耗，与王国潮道/商队驿站的减耗反号）。
     *   直接读 tenementLuxAdd，并验 tick/happyBurn/rates 三处同源。
     *   ⚠️ 夹具必须让 供给 > 需求（merchant=2 ⇒ S=0.10 > D=0.0625），否则 deficit 时
     *      rates.luxury 被夹成 0 而 happySupply−happyBurn 为负，两式不等（那是引擎正确行为，
     *      不是判据 bug，见上方商队驿站段同款约束）。 */
    const ts = SB.state.freshRun(false);
    ts.lvl.tenement = 0;
    const t0 = SB.economy.tenementLuxAdd(ts);
    ts.lvl.tenement = 1;
    const t1 = SB.economy.tenementLuxAdd(ts);
    ts.lvl.tenement = 5;
    const t5 = SB.economy.tenementLuxAdd(ts);
    check('廉租社区：tenementLuxAdd 随等级线性 +5%/级（0/1/5 级 ⇒ 0 / 5% / 25%）',
      Math.abs(t0) < 1e-9 && Math.abs(t1 - 0.05) < 1e-9 && Math.abs(t5 - 0.25) < 1e-9,
      't0=' + t0 + ' t1=' + t1 + ' t5=' + t5);
    /* happyBurn（UI 读数）必须含廉租社区增耗 —— 与驿站减耗同一类「不能漏」的接线 */
    const tb = SB.state.freshRun(false);
    tb.civics = { trade: true }; tb.pop = 10; tb.jobs.merchant = 0; tb.happy = 0;
    const tb0 = SB.economy.happyBurn(tb);
    tb.lvl.tenement = 5;
    const tb5 = SB.economy.happyBurn(tb);
    check('🚨 happyBurn 含廉租社区增耗（5 级 ⇒ ×1.25，增耗而非减耗）',
      Math.abs(tb5 / tb0 - 1.25) < 1e-9, 'tb0=' + tb0.toFixed(6) + ' tb5=' + tb5.toFixed(6) + ' 比=' + (tb5 / tb0).toFixed(6));
    /* rates 的 D 侧同源：净速率应等于 供给 − happyBurn（供给需 > 需求，见上方说明） */
    tb.jobs.merchant = 2;
    const trt = SB.economy.rates(tb);
    check('rates 的 D 侧与 happyBurn 同源（廉租社区增耗在 rates 也生效）',
      Math.abs(trt.luxury - (SB.economy.happySupply(tb) - SB.economy.happyBurn(tb))) < 1e-9,
      'rates=' + trt.luxury.toFixed(8) + ' 手算=' + (SB.economy.happySupply(tb) - SB.economy.happyBurn(tb)).toFixed(8));
    /* ── ④ 2026-10-14 用户拍板：增耗（公司/传媒卡/廉租）与居民减耗（潮道/驿站）
     *      合并 luxDemandMul **单括号先抵消**：(1 + 增Σ − 减Σ)，钳 ≥ 0。
     *      政体 0.7 / 国会 0.9 是政体·奇观乘区，独立相乘、不参与抵消。 ── */
    const nd = SB.state.freshRun(false);
    nd.lvl.caravanserai = 5; nd.lvl.tenement = 2;
    check('🚨 luxDemandMul 净括号：增耗与减耗**相加抵消**（驿站−5% + 廉租+10% ⇒ ×1.05，不是乘法 1.045）',
      Math.abs(SB.economy.luxDemandMul(nd) - 1.05) < 1e-9,
      '实=' + SB.economy.luxDemandMul(nd));
    /* 与旧乘法口径的区分断言：若实现退回 (1−减)×(1+增)，这里会得 0.95×1.10=1.045 ⇒ 红 */
    check('🚨 luxDemandMul 不是乘法合并（1.05 ≠ 0.95×1.10）',
      Math.abs(SB.economy.luxDemandMul(nd) - 0.95 * 1.10) > 1e-3,
      '净=' + SB.economy.luxDemandMul(nd) + ' 乘法口径=' + (0.95 * 1.10));
    /* 钳 ≥ 0：极端减耗（潮道 400 级 ⇒ luxSaveAll 钳到 1）下净需求不为负 */
    const nz = SB.state.freshRun(false);
    nz.lvl.canal = 400;
    check('🚨 luxDemandMul 钳 ≥ 0（减耗抵穿增耗时净需求 = 0，不出负需求）',
      SB.economy.luxDemandMul(nz) === 0,
      'luxSaveAll=' + SB.economy.luxSaveAll(nz) + ' net=' + SB.economy.luxDemandMul(nz));
    /* 三处同源：happyBurn 比值 == luxDemandMul 比值（burn 除单价×人口×政体/奇观外只剩这一个因子） */
    const s3a = SB.state.freshRun(false); s3a.pop = 10; s3a.happy = 0; s3a.lvl.tenement = 2;
    const s3b = SB.state.freshRun(false); s3b.pop = 10; s3b.happy = 0; s3b.lvl.tenement = 2; s3b.lvl.caravanserai = 5;
    check('🚨 happyBurn 与 luxDemandMul 同源（burn 比 = 净系数比 = 1.05/1.10）',
      Math.abs(SB.economy.happyBurn(s3b) / SB.economy.happyBurn(s3a) - 1.05 / 1.10) < 1e-9,
      'burn比=' + (SB.economy.happyBurn(s3b) / SB.economy.happyBurn(s3a)).toFixed(8));
    /* 政体乘区独立：商人共和国下 burn = 基准 ×0.7（0.7 不进净括号参与抵消）。
     *   ⚠️ s3c 与 s3a 廉租同为 2 级 ⇒ 净系数同为 1.10，比值应恰为 0.7（2026-10-14 修：原期望误抄 s3b 组的 1.05/1.10）。 */
    const s3c = SB.state.freshRun(false); s3c.pop = 10; s3c.happy = 0; s3c.lvl.tenement = 2; s3c.gov = 'merchant_republic';
    check('🚨 政体 −30% 是独立乘区（商人共和国 burn = 净括号 burn ×0.7）',
      Math.abs(SB.economy.happyBurn(s3c) / SB.economy.happyBurn(s3a) - 0.7) < 1e-9,
      'burn比=' + (SB.economy.happyBurn(s3c) / SB.economy.happyBurn(s3a)).toFixed(8) + ' 期望=0.70000000');
    /* rates 补齐后与 tick 同式：商人共和国下 rates 净速率 = 供给 − burn（旧实现 rates 漏乘 0.7 ⇒ 红） */
    s3c.jobs.merchant = 2;
    const rr = SB.economy.rates(s3c);
    check('🚨 rates 的 D 含政体乘区（商人共和国下 净速率 = 供给 − burn，旧漏乘 0.7 会红）',
      Math.abs(rr.luxury - (SB.economy.happySupply(s3c) - SB.economy.happyBurn(s3c))) < 1e-9,
      'rates=' + rr.luxury.toFixed(8) + ' 手算=' + (SB.economy.happySupply(s3c) - SB.economy.happyBurn(s3c)).toFixed(8));
  }

  // 口粮必须真的构成约束：一个采集者养不到 2 个人，否则前期永远不会缺粮
  const perGather = SB.UNIT.kelp / SB.CFG.FOOD_PER;
  check('一个采集者养不饱两个人（食物是前期真约束）', perGather < 2,
    perGather.toFixed(2) + ' 人/采集者（猫国 ' + (1.0 / 0.85).toFixed(2) + '）');

  /* 珊瑚只由「珊瑚匠」职业出（猫国 wood 同构：wood 只有 woodcutter 能产）。
   * 采集者若顺手产珊瑚，材料线就又绕回了食物线，
   * 开局那条「点采集 → 攒藻食 → 建菌圃」的循环会被资源种类稀释。 */
  const t = SB.state.freshRun(false);
  t.jobs.gather = 2;
  SB.economy.tick(t, 1, noop);
  check('采集者不产珊瑚', t.res.coral === 0, 'coral=' + t.res.coral.toFixed(3));
  t.lvl.kelp = 0; t.jobs.gather = 0; t.jobs.coralwright = 2; t.res.coral = 0;
  SB.economy.tick(t, 1, noop);
  check('珊瑚匠是珊瑚唯一入口', t.res.coral > 0, 'coral=' + t.res.coral.toFixed(3));

  /* 金属同构断言（2026-09-26 对齐猫国）：砂矿坑不再自动产金属（旧「建了砂坑凭空冒」
   * 的反向对照），金属唯一入口 = 矿工；砂矿坑只把矿工产出乘 (1 + 级数 × siltBonus)。
   * 比值写法：两条 freshRun 在同一 t=0 ⇒ 季节/采集倍率完全一致，
   * silt 增量之比只来自砂矿坑加成，不用去复算 cold/gatherMul（漏一项就是假红）。 */
  const m0 = SB.state.freshRun(false); m0.jobs.miner = 2; m0.res.silt = 0; m0.res.warmstone = 0;
  SB.economy.tick(m0, 1, noop);
  const m3 = SB.state.freshRun(false); m3.jobs.miner = 2; m3.lvl.siltpit = 3;
  m3.res.silt = 0; m3.res.warmstone = 0;
  SB.economy.tick(m3, 1, noop);
  const mNo = SB.state.freshRun(false); mNo.lvl.siltpit = 3; mNo.res.silt = 0;
  SB.economy.tick(mNo, 1, noop);
  check('砂矿坑不自动产金属（金属唯一入口=矿工）', mNo.res.silt === 0, 'silt=' + mNo.res.silt);
  check('矿工产金属，砂矿坑加成 = 1+级数×siltBonus（3 级 ⇒ ×1.6）',
    Math.abs(m3.res.silt / m0.res.silt - 1.6) < 1e-9,
    '比值=' + (m3.res.silt / m0.res.silt).toFixed(6) + '（m0=' + m0.res.silt.toFixed(4) + ' m3=' + m3.res.silt.toFixed(4) + '）');
  check('砂矿坑加成也放大暖石（2026-10-16 起伴生矿物同吃矿坑等级，3 级 ⇒ ×1.6）',
    Math.abs(m3.res.warmstone / m0.res.warmstone - 1.6) < 1e-9,
    '比值=' + (m3.res.warmstone / m0.res.warmstone).toFixed(6) + '（m0=' + m0.res.warmstone.toFixed(4) + ' m3=' + m3.res.warmstone.toFixed(4) + '）');

  /* 2026-10-05 用户拍板：采石工也吃砂矿坑的 +20%/级（复用 siltBonus，与矿工同值）。
   * 【为什么必须钉这条】改之前采石工是四家采集职业里唯一没有建筑级乘区的，
   * 而 UNIT.stone 0.30 却是除珊瑚匠外最高 ⇒ 「基数大却不能放大」，同人口下永远弱于矿工。
   * 钉的是**比值**（1+3×0.2=1.6），同 freshRun ⇒ 季节/采集倍率完全一致，不用复算 cold。
   * ⚠️ 2026-10-16 起：上面那条暖石断言已翻转为「暖石同样被砂矿坑放大」（见 economy-tick.js 的 _siltPit
   *    与 rates() 的 mineBonus）——矿脉设施现在放大一切矿工伴生产出。此反向保护已不再成立。 */
  const q0 = SB.state.freshRun(false); q0.jobs.quarrier = 2; q0.res.stone = 0;
  SB.economy.tick(q0, 1, noop);
  const q3 = SB.state.freshRun(false); q3.jobs.quarrier = 2; q3.lvl.siltpit = 3; q3.res.stone = 0;
  SB.economy.tick(q3, 1, noop);
  const qNo = SB.state.freshRun(false); qNo.lvl.siltpit = 3; qNo.res.stone = 0;
  SB.economy.tick(qNo, 1, noop);
  check('采石工产石头（石头仍只由采石工产，砂矿坑不自产）', qNo.res.stone === 0,
    'stone=' + qNo.res.stone);
  check('采石工吃砂矿坑加成 = 1+级数×siltBonus（3 级 ⇒ ×1.6，与矿工同值）',
    Math.abs(q3.res.stone / q0.res.stone - 1.6) < 1e-9,
    '比值=' + (q3.res.stone / q0.res.stone).toFixed(6) + '（q0=' + q0.res.stone.toFixed(4) +
    ' q3=' + q3.res.stone.toFixed(4) + '）');
  /* 🚨 面板不许撒谎：rates() 的石头那一行必须与 tick 的采石工行同式。
   *    漏掉乘区时这一条会红（面板显示 0.30 而实际进池 0.48）。 */
  check('🚨 面板石头速率与 tick 同源（砂矿坑乘区不许只在 tick 侧）',
    Math.abs(SB.economy.rates(q3).stone - q3.res.stone / 1) < 1e-9,
    'rates=' + SB.economy.rates(q3).stone.toFixed(6) + ' tick 增量=' + q3.res.stone.toFixed(6));

  s.lvl.kelp = 0; s.jobs.gather = 0;
}
}
