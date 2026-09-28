/* 天壳 / SHELLBREAK — 状态层
 * 周目内状态 S 与跨周目状态 meta 分离。
 * 冻结规则：derivatives（派生值）一律在本层计算，其它层不得直接改 S 的结构字段。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  function emptyMeta() {
    return { tide: 0, spent: 0, perks: {}, cycle: 0, layers: 0, techLog: {}, lastRun: null };
  }
  function emptyPerks() { return { gather: 0, coef: 0, thin: 0 }; }

  /* 生成一周目。inherit: true 时继承上一周目的增益（洋流点/破层级/已购增益）。
   * 注意：破层级 layers 一期恒为 1（破冰 = 第 1 层），结构上留给二期大气壳。 */
  function freshRun(keepPerks) {
    var prev = SB.S;
    var perk = emptyPerks();
    if (keepPerks && prev && prev.perk) {
      perk = Object.assign(emptyPerks(), prev.perk);
    }
    var thin = perk.thin || 0;
    var iceShell = Math.round(CFG.ICE_SHELL * Math.pow(0.9, thin));
    return {
      t: 0,
      // 对齐猫国开局：资源全空（猫国 resources.js 全部 value:0），收入靠手动采集起步
      /* ⚠️ res 的键必须覆盖 SB.RESS。漏 stone / warmstone 的后果比 NaN 更难查：
       *   它们不是被 NaN 污染，而是**凭空消失** —— 「石工」的尤里卡条件是
       *   `res stone 100`，读到 undefined 时 `undefined >= 100` 静默为 false，
       *   纪元一的关键节点（历法 + 石工）永远清不掉 ⇒ 纪元闸门把纪元二/三的科技
       *   全挡住 ⇒ 冶炼术学不到 ⇒ 热泉炉建不起来 ⇒ 精铁恒 0 ⇒ 祭坛永远建不成。
       *   整条链断掉的样子是「时长看起来只是慢」，跟设计上那道墙一模一样。 */
      /* ⚠️ 2026-09-27 加 culture（市政点）：键必须覆盖 SB.RESS，理由与 stone/warmstone 那条
       *    注完全同源——漏键不是 NaN，是**凭空消失**：`undefined >= 100` 静默为 false，
       *    「攒够市政点解锁技艺」这条判定永远不成立，而面板上看不出任何异常。 */
      /* ⚠️ 2026-09-27 加 stoneBeam（石梁）：规则与上面 culture 那条注同源——
       *    res 的键必须覆盖 SB.RESS，漏一个键不会报错，只会在制造时静默失败。
       * ⚠️ 石梁**不给它 lvl**：它是工艺制作反复制造出来的，不是建筑等级。
       * ⚠️ 2026-09-28 加 ironBracket（铁制支架）/ rope（绳）：era2 第三层那两张扩容
       *    升级项的**唯一成本**，成批消耗 ⇒ 按石梁同一口径（不给 CAP_BASE、不给 UNIT）。
       *    这里漏它们的后果不是「少一件东西」，而是 **NaN**：`s.res.ironBracket` 是
       *      undefined ⇒ addRes 里 `undefined + 5.25 = NaN` ⇒ `Math.min(Infinity, NaN)`
       *      还是 NaN ⇒ 产物进了资源池却读出来是 NaN，面板显示 `NaN 铁制支架`，
       *      而升级项扣费 `undefined - 50 = NaN` 又把池子整个污染。
       *    与上面 stone/warmstone/culture/stoneBeam 那几条注完全同源，不是新纪律。 */
      res: { kelp: 0, coral: 0, stone: 0, silt: 0, warmstone: 0, iron: 0, science: 0, fuel: 0, culture: 0,
        stoneBeam: 0, ironBracket: 0, rope: 0 },
      /* lvl 的键必须与 SB.BUILDINGS 的 id 一一对应（quarry 已随「采石场改职业」移除）。
       * ⚠️ 漏一个键 = 一次 NaN 事故：`undefined * 0.12` 经 addRes 的 Math.min
       * 污染资源池，再顺着 lvlSum 污染破壳系数。与「加职业漏加表」「存档缺键」同类。 */
      /* ⚠️ lvl 的键必须与 SB.BUILDINGS 的 id 一一对应（coralhouse 于 2026-09-26 随
       * 「巢筑改判为解锁住房第二档」加入）。缺键 = undefined * number = NaN，
       * 经 addRes 的 Math.min 污染资源池，再顺着 lvlSum 污染破壳系数。 */
      /* ⚠️ hall（议事厅）是 2026-09-26 暗流纪重排新增的建筑。加在这里是因为
       *    economy.costOf 会读 `s.lvl.hall`——漏了这个键，议事厅的效果 halMul 变成
       *    `undefined * 0.02 = NaN`，再顺着 Math.ceil 把**所有建筑的成本**变成 NaN，
       *    玩家一研究石工就买不起任何东西。与 lvl 表缺键同类的那次 NaN 事故。 */
      /* ⚠️ hearth（暖壳石）已于 2026-09-26 随骨材线删除，冻伤减免改由暖石供给
     *    （economy.warmCap）。**不要**为了「兼容老档」把它加回来：老档这份 lvl 键读不到
     *    任何东西（warmCap 已不读它），加回来只会让人误以为机制还在建筑上。 */
      /* ⚠️ kelpstore（海藻仓）是 2026-09-26 第三轮新增——藻食容量从压舱仓拆出来
       *   独立成一座（对标猫国 barn）。漏这个键的后果与上面 lvl 缺键那条同源：
       *   `s.lvl.kelpstore * BLD.kelpCap` 成 NaN，经 addRes 的 Math.min 污染藻食池。 */
      lvl: { kelp: 0, kelpstore: 0, weir: 0, warmnest: 0, ballast: 0, nest: 0, coralhouse: 0, hall: 0, reef: 0, siltpit: 0, workshop: 0, furnace: 0, library: 0, geyser: 0, miracle: 0 },
      // 职业全 0（猫国 jobs[] 全部 value:0，开局没人被分配职业），人口靠闲置池分配
      /* 职业表必须与 SB.JOBS 一一对应，少一个键就是一次 NaN 事故：
       * 缺 gather 时 economy 里 `s.jobs.gather * UNIT.kelp` 变成
       * `undefined * 0.5 = NaN`，经 addRes 的 Math.min 污染整个藻食池、
       * 再顺着 lvlSum 污染破壳系数（与存档迁移那次同源）。
       * 今后加职业，这里、migrateRun 的默认表都得同步。 */
      /* 职业表：quarrier（采石工）与 miner（矿工）是 2026-09-26 暗流纪重排新增。
       * 缺键的后果见上面 lvl 那条注——economy 里 `s.jobs.quarrier * UNIT.stone`
       * 会变成 NaN 并顺着 addRes 污染石头池，再经 lvlSum 碰破壳系数。 */
      /* ⚠️ 2026-09-27 加 scribe（书手）：规则与上面 lvl/jobs 那几条注同源——
       *    `s.jobs.scribe * UNIT.culture` 在缺键时成 NaN，顺着 addRes 污染市政点池。 */
      jobs: { gather: 0, coralwright: 0, quarrier: 0, miner: 0, craft: 0, scholar: 0, scribe: 0 },
      /* seen = 建筑「曾经露过头」的黑名单（habitat.reveal 写入，UI 判可见用）。
       * 没有它，玩家把库存花到 unlockRatio 阈值以下时，刚冒出来的建筑会当场消失。
       * 与 lvl/jobs 同理：新增字段要同时在 freshRun 与 migrateRun 两边补上。 */
      seen: {},
      /* 暖石开关（保温法那道开关）。与 miracleOn 同一套设计：
       *   ① 它不是存档里推演出来的量，玩家显式拨的；
       *   ② 拨了也未必生效（暖石不够 / 不在惩罚季），所以旁边必须显示「正在烧 / 石不够」。
       * warmBurning 是**每帧重算的瞬时标记**，不进存档（见 economy.tick 第 5 步的清位），
       * 存进去的话读档那一刻 UI 会把它当真。 */
      warmOn: false, warmBurning: false,
      /* 冰封期状态（2026-09-27 新增：从「壳≤25% 恒真」改成「寒流季掷骰」）。
       * `frozen` 是**本季是否冰封**，换季那一刻由 economy.seasonTurn 写入；
       * `_seasonIdx` 是换季检测的游标（记住上次是哪一季）。
       * ⚠️ 缺这两个键的后果与其他缺键同类：`frozen` 为 undefined ⇒ 永不挨冻（不至于 NaN），
       *   但 `_seasonIdx` 为 undefined ⇒ 第一次 tick 就会误判成「刚换季」并额外掷一次骰。
       *   老档靠 migrateRun 补（见下）。 */
      frozen: false, _seasonIdx: -1,
      pop: CFG.POP_START,
      peak: CFG.POP_START,
      deaths: 0,
      coldTicks: 0,
      frostDeaths: 0,
      famineDeaths: 0,
      shell: iceShell,
      iceShell: iceShell,
      baseShell: CFG.ICE_SHELL,
      perk: perk,
      /* 科技树四件套（2026-09-25 五纪元改造，数据见 src/techs.js，玩法见 src/tech.js）：
       *   techs  —— 已掌握。**结绳不再在这里预置**：它的尤里卡条件是「建成第 5 座深海藻场」，
       *            与「科技面板开门」是同一件事（tech.panelOpen 读的就是它）。开局预置会让
       *            面板在没开门时就已经有一项「已掌握」。
       *   era    —— 当前纪元（1..5）。研究不得越纪元，这是「循环往复」的那道闸门。
       *   eureka —— 尤里卡已揭示。未揭示的科技不进可研究列表，条件也不显示。
       *   got    —— 各资源「累计产出」台账，供 gathered 类尤里卡条件判定。
       * 四个字段都要在 freshRun 与 migrateRun 两边同步，规则与 lvl/jobs/seen 一致。 */
      techs: {},
      /* 科技面板（科技页）开门时刻的叙事弹窗，一次性记账。门本身是派生的
       * （tech.panelOpen 读结绳的 cond），这里只记「弹过了」。老档玩家早就见过
       * 这个面板，见 migrateRun 里的兼容处理。 */
      techPopup: false,
      era: 1,
      eureka: {},
      eurekaMet: {},
      got: { kelp: 0, coral: 0, silt: 0, iron: 0, science: 0, fuel: 0, culture: 0, stoneBeam: 0 },
      /* ---- 市政四件套（2026-09-27，数据见 src/civics.js，玩法见同文件头部注释）----
       *   civics —— 已完成（研究过）的市政。
       *   civBoost —— 鼓舞条件**达成过**的台账（与技术树的 eurekaMet 同构：
       *       rate 类条件会回落，但「达成过」不该被撤回）。
       *   civShown —— 首次**揭示**的时机，只用来决定「这一趟要不要播报」。
       *       ⚠️ 它与 civBoost 必须分成两个键，与技术树那条「一个键兼任两件事」的 bug 同源：
       *          合成一个键的话，揭示会被整批刷真，玩家看到「条件写着 0/60、市政却已摊在面前」。
       *   gov  —— 当前采用的政体 id，null = 还没选。
       *   card —— 当前装填的政策卡 id，null = 空槽。
       * ⚠️ 面板要不要开（议事厅有没有建起来）是**派生的**，不存——见 civics.panelOpen。 */
      civics: {},
      civBoost: {},
      civShown: {},
      gov: null,
      card: null,
      /* 政策卡槽**人生第一次**装填过没有。
       * ⚠️ 它不能省：换卡收费若按「槽当前空不空」判，「拔下→再装填」就能无限免费换效果。
       *    一次性标记才堵得住。见 civics.cardBlocked 那条注。 */
      cardEver: false,
      /* 工坊青铜工具（2026-09-27）：`{ tool_sickle: true, ... }`，键是 config.TOOLS 的 id。
       * ⚠️ 工具是**买断一次**的（不是等级、不重复购买），所以存的是布尔表而不是计数。
       *    影响面是 economy.toolMul → farmMul / gatherMul 两条采集乘区。 */
      tools: {},
      /* 奇观（2026-09-27）：`{ wonder_tide_stele: true }`，键是 config.WONDERS 的 id。
       * ⚠️ 与 tools 同理是**买断表**，且同样不重复购买——但两者形态不同：
       *    工具在工坊上半区（买断，改职业产出）；奇观在「奇观」栏（买断，改全局效率与仓储）。
       * ⚠️ 老档靠 migrateRun 补（tools 那条注的 fixTable 口径，这里同样按 ref 遍历兜底）。 */
      wonders: {},
      /* 工艺升级项（2026-09-28 · era2 第三层）：`{ upg_ballast_1: true }`，键是 config.UPGRADES 的 id。
       * ⚠️ 与 tools / wonders 同属「买断表」，但**形态又不同**：工具改职业产出、奇观改全局效率，
       *    而这里改的是仓储上限（economy.capOf 里那条唯一的乘法轴）。
       * ⚠️ 值为布尔即可，没有等级 —— 「扩容 I」装一次就是 ×1.5，不重复计价。 */
      upgrades: {},
      famine: 0,
      broken: false,
      // 破壳状态：miracleOn 是玩家开关，miracleRun 是本次连续供能秒数（用于结算与提示）
      miracleOn: false,
      miracleRun: 0,
      starved: false,
      _grow: 0,
      _cutBase: 0,   // 累计：基础削壳削掉的点数
      _cutMir: 0,    // 累计：破冰祭坛削掉的点数
      /* 存档墙钟：game.snapshot() 写入，离线补算据此算「玩家离开了多久」。
       * 必须放在基础表里，否则 migrateRun 会把它当成未知字段丢掉，离线补算永远为 0。
       * 读取当次会手删（game.boot），不进运行状态。 */
      _ts: 0
    };
  }

  // ---- 跨周目持久化 ----
  function loadMeta() {
    var m = emptyMeta();
    try {
      var raw = root.localStorage && root.localStorage.getItem(CFG.SAVE_KEY);
      if (raw) m = Object.assign(m, JSON.parse(raw));
    } catch (e) { /* 存档损坏就当新档，不打断启动 */ }
    return m;
  }
  function saveMeta(meta) {
    try { root.localStorage && root.localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(meta)); } catch (e) {}
  }
  function loadRun() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(CFG.RUN_KEY);
      return raw ? migrateRun(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  /* 存档迁移：旧档缺新键（如 P1 新增的 weir/warmnest/ballast）时，
   * undefined 会顺着 lvlSum / costOf 污染成 NaN——破壳系数、壳厚、建筑成本全灭，
   * 玩家看到的是「NaN / 200000」和一排 NaN 价格。以 freshRun 为底逐键合并，
   * 非有限数（含 JSON 里的 null）一律回默认值，未知顶层字段丢弃。
   * 旧档永远能安全载入，新加字段不再需要玩家清档。 */
  function migrateRun(raw) {
    var base = freshRun(false);
    if (!raw || typeof raw !== 'object') return base;
    var out = {}, k;
    for (k in base) out[k] = base[k];
    for (k in raw) if (k in base) out[k] = raw[k];
    function fixTable(obj, ref) {
      var o = {}, key;
      for (key in ref) {
        var v = obj ? obj[key] : undefined;
        o[key] = (typeof v === 'number' && isFinite(v)) ? v : ref[key];
      }
      return o;
    }
    out.res = fixTable(raw.res, base.res);
    out.lvl = fixTable(raw.lvl, base.lvl);
    out.jobs = fixTable(raw.jobs, base.jobs);
    /* 市政台账加固。⚠️ 这里**不能**用上面的 fixTable：那是按 `ref` 的键遍历的，
     *    而 base.civics 是空表 `{}` ⇒ 遍历出空对象 ⇒ **所有已完成的市政被清空**，
     *    症状是「刷新之后市政树重置了，政体却还在」（政体/政策卡是标量、走的是
     *    上面 173-174 行的直接拷贝，只有这张表整张没了）。2026-09-27 实证复现。
     *   ⇒ 正确做法 = 按**数据定义**（SB.CIVICS）逐个 id 取，缺的补 false。
     *   ⚠️ 顺带兜住「存档里有、数据里已删」的 id：它照原样留下，而不是被静默丢弃
     *    ——那种 id 只影响一次读档，丢掉它换不回任何好处，反而让「存档凭空少东西」。 */
    out.civics = {};
    var rawCivics = (raw.civics && typeof raw.civics === 'object') ? raw.civics : {};
    if (SB.CIVICS && typeof SB.CIVICS.forEach === 'function') {
      /* ⚠️ 值统一归一成布尔：`!!`（且只认**真值**）。
       *    早期 civics.research 写的是 `1`，而这里是 `true` —— 同一个存档里两种值都可能
       *    存在（`if (s.civics[id])` 都算已完，但 `=== 1` / `=== true` 这种逐个比对就会
       *    一半错一半对）。归一之后读回的值域只有一种，别处不必猜。 */
      SB.CIVICS.forEach(function (c) { out.civics[c.id] = !!rawCivics[c.id]; });
    } else {
      out.civics = Object.assign({}, rawCivics);
    }
    for (k in rawCivics) if (!(k in out.civics)) out.civics[k] = !!rawCivics[k];
    /* 奇观买断表加固，口径与上面 civics 那条同源：
     *   ⚠️ 不能用 fixTable(raw.wonders, base.wonders) —— base.wonders 是空表 `{}`，
     *      按 ref 遍历会得出空对象，**所有已建成的奇观被清空**。
     *   按数据定义 SB.WONDERS 逐个 id 取，缺的补 false；存档里多出来的（数据已删的）原样保留。 */
    out.wonders = {};
    var rawWonders = (raw.wonders && typeof raw.wonders === 'object') ? raw.wonders : {};
    var _WL = (SB.WONDERS && SB.WONDERS.length) || [];
    for (var _wi = 0; _wi < _WL; _wi++) out.wonders[SB.WONDERS[_wi].id] = !!rawWonders[SB.WONDERS[_wi].id];
    for (k in rawWonders) if (!(k in out.wonders)) out.wonders[k] = !!rawWonders[k];
    /* 工艺升级项买断表（2026-09-28），与上面 wonders 同口径：
     *   ⚠️ 老档根本没有这个键 —— 但这里不必按 SB.UPGRADES 逐个 id 取（upgrades 只装
     *      「已装」而不表达顺序，且按数据定义逐个取也 OK）：上面那段 `for (k in base)` 的
     *      拷贝已经把 freshRun 的 `{}` 带了过来，缺键的存档落在这里 ⇒ 按没装处理。
     *      需要防御的是另一头：存档里若带了**非对象**的值（旧版本或手工改档），
     *      `s.upgrades[id]` 会读出字符串/数字 ⇒ capOf 里 `matCap * capMul` 变 NaN
     *      ⇒ 整条资源线容量 NaN ⇒ 玩家什么都攒不了。所以非对象一律退回空表。 */
    out.upgrades = (raw.upgrades && typeof raw.upgrades === 'object')
      ? Object.assign({}, raw.upgrades) : (out.upgrades || {});
    out.perk = Object.assign(emptyPerks(), (raw.perk && typeof raw.perk === 'object') ? raw.perk : {});
    /* 老档科技名 → 新树 id。2026-09-25 之前只有 8 项平铺科技（calendar/heat/bonework/
     * smelt/pick/ignition/dive/siegeT），不做映射的话玩家研究过的科技会凭空消失、
     * 破壳系数凭空掉一截，看起来像「存档坏了」。映射完再按新树过滤一遍：
     * 指向新树里不存在的 id 直接丢弃，不把垃圾带进运行状态。 */
    out.techs = {};
    var rawTechs = (raw.techs && typeof raw.techs === 'object') ? raw.techs : {};
    var legacy = SB.LEGACY_MAP || {};
    for (k in rawTechs) {
      if (!rawTechs[k]) continue;
      var nid = legacy[k] || k;
      if (SB.TECHS) {
        var hit = false;
        for (var ti = 0; ti < SB.TECHS.length; ti++) if (SB.TECHS[ti].id === nid) hit = true;
        if (!hit) continue;
      }
      out.techs[nid] = true;
    }
    /* 老档没有「科技面板开门」这个机制，玩家的科技页一直是开着的。
     * 于是这里直接记账为「弹窗已播」，不回去播一次结绳叙事——
     * 那句话的语境是「第一次知道有今天和明天」，对玩了几小时的老档是废话。
     * ⚠️ 面板开不开仍然由 tech.panelOpen 派生（读结绳的 cond），这里不存那个状态。 */
    out.techPopup = true;

    out.era = (typeof raw.era === 'number' && isFinite(raw.era))
      ? Math.max(1, Math.min(5, Math.floor(raw.era))) : 1;
    /* ⚠️ 尤里卡一律重来：老档根本没有这个字段，而它记录的是「这些条件当时达成了」。
     * 保留一个空壳会让 UI 声称「已揭示」却没揭示。下一 tick 的 discover() 会
     * 按当前真实状态补上，玩家看到的是同一批条件被重新点亮一次。 */
    out.eureka = {};
    /* 达成台账只做类型收口，**不按 eureka 回填**：老档的 eureka 是被 revealEra 整批
     * 刷真的，拿它当「达成过」正是用户指出的那个 bug（条件 0/60、内容却亮着）。
     * 留空之后由 discover() 按真实条件补记，补不上的就该是「未揭露」。 */
    out.eurekaMet = (raw.eurekaMet && typeof raw.eurekaMet === 'object') ? raw.eurekaMet : {};
    /* 补揭示当前纪元。eureka 被清空重来是刻意的（见上面那段注释），
     * 但清空之后若不让当前纪元的节点转可见，回到纪元三的存档打开面板就是一页问号，
     * 玩家会以为存档把科技吃了。条件已达成的不受影响——下一点滴的 discover() 会照常处理。 */
    if (SB.tech && SB.tech.revealEra) SB.tech.revealEra(out, out.era, true);
    out.got = {};
    for (var gk in base.got) {
      out.got[gk] = (raw.got && typeof raw.got[gk] === 'number' && isFinite(raw.got[gk]))
        ? raw.got[gk] : 0;
    }

    /* seen 只收建筑表里真实存在的 id，且值必须是真值——存档手改也进不了坏状态。 */
    out.seen = {};
    for (var si = 0; si < SB.BUILDINGS.length; si++) {
      var bid = SB.BUILDINGS[si].id;
      if (raw.seen && raw.seen[bid]) out.seen[bid] = 1;
    }
    var nums = ['t', 'shell', 'iceShell', 'baseShell', 'pop', 'peak', 'coldTicks',
      'deaths', 'frostDeaths', 'famineDeaths', 'famine'];
    for (var i = 0; i < nums.length; i++) {
      var v2 = out[nums[i]];
      if (typeof v2 !== 'number' || !isFinite(v2)) out[nums[i]] = base[nums[i]];
    }
    return out;
  }
  function saveRun(run) {
    try { root.localStorage && root.localStorage.setItem(CFG.RUN_KEY, JSON.stringify(run)); } catch (e) {}
  }
  function clearRun() {
    try { root.localStorage && root.localStorage.removeItem(CFG.RUN_KEY); } catch (e) {}
  }

  SB.state = {
    emptyMeta: emptyMeta,
    emptyPerks: emptyPerks,
    freshRun: freshRun,
    migrateRun: migrateRun,
    loadMeta: loadMeta,
    saveMeta: saveMeta,
    loadRun: loadRun,
    saveRun: saveRun,
    clearRun: clearRun
  };
})(typeof window !== 'undefined' ? window : globalThis);
