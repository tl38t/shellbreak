/* 天壳 / SHELLBREAK — 状态层
 * 周目内状态 S 与跨周目状态 meta 分离。
 * 冻结规则：derivatives（派生值）一律在本层计算，其它层不得直接改 S 的结构字段。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;

  function emptyMeta() {
    /* religionSeen：是否建立过宗教（解锁「轮回」系统）。一旦置真，永久保留（跨周目），
     *   因为「以后每周目都是这样」——重置按钮改名轮回、轮回点可获取，都是它的副作用。
     * shopUnlocked：轮回商店（meta 页）的解锁开关，仅在「首次合格轮回」后翻真。
     *   它与 religionSeen 是两件事：建立宗教后已能攒轮回点，但花点要等真正轮回过一次。
     * 旧日遗产账本（方案文档 §跨周目账本）：
     *   oldFaith                 本局剩余信仰并入的跨周目总量（对数档位给全产加成）
     *   memorialWonders          已入藏独特奇观 id 表（每座 +1% 科技/市政获取；观光点=其计数）
     *   oldArtworkEarnedTotal    旧日艺术品累计获得总数（固定市政点/秒，递减曲线）
     *   oldTideStelesEarnedTotal 旧日潮纹碑石累计获得总数（固定科技点/秒，递减曲线） */
    return { tide: 0, spent: 0, perks: {}, cycle: 0, layers: 0, techLog: {}, lastRun: null,
      religionSeen: false, shopUnlocked: false,
      oldFaith: 0, memorialWonders: {}, oldArtworkEarnedTotal: 0, oldTideStelesEarnedTotal: 0 };
  }
  function emptyPerks() {
    /* 轮回商店增益的运行时累加表。键必须与 config.PERKS 各商品的 apply 键一致；
     * 漏一个键会让 economy 读数 undefined ⇒ 被当成 0（通常无害），但显式列全避免歧义。 */
    return { gather: 0, coef: 0, thin: 0, popcap: 0, housePlan: 0, coldStore: 0, offline: 0,
      matStore: 0, civicArchive: 0, tideProof: 0, wonderBlueprint: 0, shellSurvey: 0,
      autoStudy: 0, autoCivic: 0, autoCraft: 0, civicPlan: 0, wonderPlan: 0,
      /* ⚠️ 2026-10-05 新增 8 键（资源线专项 + 建造减耗）。**同文件多处改动必须串行**，
       * 写完必须回盘 grep 终值确认没被后一次覆盖（同判据见 JUDGMENTS §五点十一）。 */
      coralPact: 0, mineTax: 0, algaeCrop: 0, furnaceBoost: 0,
      sacrament: 0, craftQuota: 0, luxuryPact: 0, buildSave: 0,
      /* ⚠️ govRoutine 此前**漏在这个表外**（apply 键存在但 economy 无任何读取点）——
       *  列在这里只是让「它确实是死 perk」有据可查，不改变任何行为。 */
      govRoutine: 0,
      /* 轮回商店「自动点击」系列：autoClick = 每秒自动点击次数（0/1/2/3，三档叠加），
       * autoEvent = 点击事件自动拾取（0/1）。键与 config.PERKS 的 apply 键一致。 */
      autoClick: 0, autoEvent: 0 };
  }

  /* 从跨周目商店账本（meta.perks）重建本局运行时增益表：每个已购等级的 apply 值 × 等级，
   * 累加到运行时 perk 表；起始资源类（food/coral/scienceStart）折算成开局资源量一并返回。
   * ⚠️ 这是「轮回商店增益每局生效」的唯一落点：freshRun 永远从这里重建 s.perk，
   *   不依赖上一局残留（上一局的 s.perk 本就由这里派生，重算即幂等）。
   *   中途在商店买增益只写 meta.perks（prestige.buyPerk 不碰当前局 s.perk），
   *   故「购买在下一局开局生效」，与方案文档「freshRun 后继续生效」口径一致。 */
  function derivePerksFromMeta() {
    var out = { perk: emptyPerks(), kelp: 0, coral: 0, science: 0, applied: false };
    var m = null;
    try { if (SB.game && SB.game.meta) m = SB.game.meta(); } catch (e) { m = null; }
    if (!m || !m.perks) return out;
    out.applied = true;
    var PL = SB.PERKS || [], i;
    for (i = 0; i < PL.length; i++) {
      var p = PL[i];
      var lv = m.perks[p.id] || 0;
      if (!lv) continue;
      var a = p.apply || {};
      for (var k in a) out.perk[k] = (out.perk[k] || 0) + a[k] * lv;
      if (p.id === 'food') out.kelp += 200 * lv;
      if (p.id === 'coral') out.coral += 150 * lv;
      if (p.id === 'scienceStart') out.science += 100 * lv;
    }
    return out;
  }

  /* 生成一周目。inherit: true 时继承上一周目的增益（轮回点/破层级/已购增益）。
   * 注意：破层级 layers 一期恒为 1（破冰 = 第 1 层），结构上留给二期大气壳。 */
  function freshRun(keepPerks) {
    var prev = SB.S;
    var d = derivePerksFromMeta();
    var perk;
    if (d.applied) {
      perk = d.perk;
    } else if (keepPerks && prev && prev.perk) {
      perk = Object.assign(emptyPerks(), prev.perk);
    } else {
      perk = emptyPerks();
    }
    var thin = perk.thin || 0;
    var iceShell = Math.round(SB.CFG.ICE_SHELL * Math.pow(0.9, thin));
    return {
      t: 0,
      /* wallT = 墙钟秒（真实流逝的时间），排行榜专用。
       * ⚠️ 为什么不直接用 `t`：`t` 是**逻辑秒**（economy.tick 里 `s.t += dt`，
       *   dt = STEP = 0.1），它吃游戏倍速（广告 2×、各种加速）⇒ 拿它当「最快通关」
       *   等于奖励氪金与挂机。wallT 走 performance.now() 差值，**不吃倍速**。
       * ⚠️ 离线也照涨（游戏本就支持离线补算，那段时间确实在推进文明）——
       *   若要做「有效游玩时长」得扣离线段，那是另一个口径，别混用。
       * ⚠️ 提交时必须 Math.floor 成整数（TapTap 的 score 只收integer）。 */
      wallT: 0,
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
      /* ⚠️ 2026-09-28 加 luxury（奢侈品）：与 culture / stoneBeam / ironBracket 那条
       *    注同源漏洞键 ⇒ NaN（商人产它、addRes 收它）。它的特别之处是**有产出
       *    没有开销**：tick 里那条 `addRes(s,'luxury',...)` 现在每帧都跑，漏了这一键
       *    会在开局几秒内就把 s.res 整个染成 NaN——比石梁那次更慢、更难发现。 */
      res: { kelp: d.kelp, coral: d.coral, stone: 0, silt: 0, warmstone: 0, iron: 0, science: d.science, fuel: 0, culture: 0,
        stoneBeam: 0, ironBracket: 0, rope: 0, hardCoral: 0, luxury: 0, faith: 0,
        /* ERA3 热液能系统（2026-09-29）：钢 / 热液能 / 钢制零件。三者均无 CAP_BASE 上限键
         *   ⇒ capOf 自动 Infinity（钢无上限抄猫国）。这里只 seed 初始台账，防止 addRes 漏键染 NaN。
         *   hydro 是每 tick 净流入（汽轮机产 - 工坊耗），单局会有正负波动，但落点恒定记 0。 */
        steel: 0, hydro: 0, steelPart: 0,
        /* ERA4（2026-09-30）：钛 / 脚手架。seed 只防 addRes 漏键染 NaN（与上面那条同族事故）。
         *   ⚠️ 钛 2026-10-07 用户拍板**加了 CAP_BASE.titanium=200**（从工艺区重分类回资源主区），
         *      不再是 Infinity；脚手架仍是工艺制品 ⇒ 无 CAP_BASE 键（capOf 恒 Infinity）。 */
        titanium: 0, scaffold: 0,
        /* ERA4（2026-09-30）：历史哲学解锁的两件工艺制品 artwork / tidalRecord。
         *   与石梁/铁制支架同口径 —— 由工坊配方造出来、成批消耗、无 CAP_BASE 上限键
         *   （capOf 自动 Infinity）。这里只 seed 初始台账，漏键的后果是 addRes 把资源池染成 NaN
         *   （与上面那条同源事故）。got 台账不记工艺制品，故不进 got（见 stoneBeam 那条口径）。 */
        artwork: 0, tidalRecord: 0, resonantDrill: 0 },
      /* lvl 的键必须与 SB.BUILDINGS 的 id 一一对应（quarry 已随「采石场改职业」移除）。
       * ⚠️ 漏一个键 = 一次 NaN 事故：`undefined * 0.12` 经 addRes 的 Math.min
       * 污染资源池，再顺着 lvlSum 污染破壳系数。与「加职业漏加表」「存档缺键」同类。 */
      /* ⚠️ lvl 的键必须与 SB.BUILDINGS 的 id 一一对应（coralhouse 于 2026-09-26 随
       * 「巢筑改判为解锁住房第二档」加入）。缺键 = undefined * number = NaN，
       * 经 addRes 的 Math.min 污染资源池，再顺着 lvlSum 污染破壳系数。 */
      /* ⚠️ hall（议事厅）是 2026-09-26 暗流纪重排新增的建筑。加在这里是因为
       *    economy.costOf 会读统治核心等级（`economy.coreLvl` = lvl.hall）——
       *    缺了这个键，减耗就变成 `undefined * 0.02 = NaN`，再顺着 Math.ceil 把**所有建筑
       *    的成本**变成 NaN，玩家一研究石工就买不起任何东西。与 lvl 表缺键同类的那次 NaN 事故。
       *    ⚠️ 2026-10-06 城堡「真升级」后，城堡是这座建筑的新名字而不是第二个键。 */
      /* ⚠️ hearth（暖壳石）已于 2026-09-26 随骨材线删除，冻伤减免改由暖石供给
     *    （economy.warmCap）。**不要**为了「兼容老档」把它加回来：老档这份 lvl 键读不到
     *    任何东西（warmCap 已不读它），加回来只会让人误以为机制还在建筑上。 */
      /* ⚠️ kelpstore（海藻仓）是 2026-09-26 第三轮新增——藻食容量从压舱仓拆出来
       *   独立成一座（对标猫国 barn）。漏这个键的后果与上面 lvl 缺键那条同源：
       *   `s.lvl.kelpstore * SB.BLD.kelpCap` 成 NaN，经 addRes 的 Math.min 污染藻食池。
       * ⚠️⚠️【这张表还是 migrateRun 里 fixTable 的 ref，不只是"开局全 0"】
       *    fixTable 按 **ref 的键**遍历 ⇒ 表里没有的建筑 id，**读档时会被整条丢掉**。
       *    2026-09-28 实证：建起广场 → 存档 → 刷新，广场等级静默归零（不报错，
       *    症状只有"它没了"）。institute 早就漏了，square 是新漏的。
       *    ⇒ 加建筑必须回来补这一个键；e2e 有一条断言按 SB.BUILDINGS 逐个对，漏了会红。 */
      /* ⚠️⚠️【temple 又是一处漏键】2026-09-28 加神庙时只改了 BUILDINGS，忘了这里 ⇒
       *    e2e「每座建筑都在状态表的 lvl 里」当场红。这个键漏掉不是 NaN，是**读档静默丢**：
       *    fixTable 按 ref 的键遍历 ⇒ 老档里建着的神庙整条被丢掉，等级从 0 开始。
       *    同一批已经漏过三次（square / institute / lighthouse），现在这里补齐，
       *    断言每条钉正反两面（有幽灵键 / 有缺键），下次加建筑前先跑一遍它。 */
      lvl: { kelp: 0, kelpstore: 0, weir: 0, warmnest: 0, ballast: 0, nest: 0, coralhouse: 0, hall: 0, siltpit: 0, workshop: 0, furnace: 0, library: 0, institute: 0, square: 0, temple: 0, lighthouse: 0,
        /* ERA3 热液能系统（2026-09-29）：金属精炼解锁的两座建筑。lvl 漏键 = undefined × 数 = NaN，
         *   经 lvlSum / costOf 污染破壳系数；与「加建筑漏 lvl」同类，必须一一对应。 */
        hydroturbine: 0, hydroshop: 0,
        /* ERA3 市政扩展（2026-09-30）：王国潮道（贸易区域）。
         * ⚠️ 2026-10-06：**castle 键已删**。城堡不是独立建筑，而是议事厅买下工坊升级
         *   `upg_castle` 之后的新名字（同一座建筑、同一个 `lvl.hall`）——那座误造的建筑
         *   已从 config.BUILDINGS 删除。留着一个没人读也没人写的 `castle: 0`，会让
         *   「lvl 的键与 BUILDINGS 一一对应」这条纪律看起来被破例。
         *   老档里真有的 `lvl.castle` 由 migrateRun 并回 hall（见那里）。 */
        /* ERA4（2026-09-30）：三座新建筑。漏键的后果由上面那条注写清楚了
         *    （costOf 读到 undefined ⇒ 全表造价 NaN），这里必须每座都落地。 */
        canal: 0, observatory: 0, coralfarm: 0, bank: 0,
        /* ERA4（2026-09-30）：商队驿站（探索解锁）/ 博物馆（启蒙运动解锁）。漏键的后果
         *   由上面那条 lvl 注写清楚了（costOf 读到 undefined ⇒ 全表造价 NaN / 读档静默丢），
         *   这里必须每座都落地，断言按 SB.BUILDINGS 逐个对、漏了会红。 */
        caravanserai: 0, museum: 0,
        /* ERA5（2026-10-02）：热锻工厂（industrialize 解锁）/ 学校（pubedu 解锁）。
         *   漏键 = costOf 读到 undefined ⇒ 全表造价 NaN / 读档静默丢（与上面每一条同源）。 */
        hotforge: 0, school: 0,
        /* ERA5（2026-10-02）：歌剧院（sharksong 解锁）/ 廉租社区（urbanization 解锁）。
         *   漏键 = costOf 读到 undefined ⇒ 全表造价 NaN / 读档静默丢（与上面每一条同源）。 */
        theater: 0, tenement: 0 },
      // 职业全 0（猫国 jobs[] 全部 value:0，开局没人被分配职业），人口靠闲置池分配
      /* 职业表必须与 SB.JOBS 一一对应，少一个键就是一次 NaN 事故：
       * 缺 gather 时 economy 里 `s.jobs.gather * SB.UNIT.kelp` 变成
       * `undefined * 0.5 = NaN`，经 addRes 的 Math.min 污染整个藻食池、
       * 再顺着 lvlSum 污染破壳系数（与存档迁移那次同源）。
       * 今后加职业，这里、migrateRun 的默认表都得同步。 */
      /* 职业表：quarrier（采石工）与 miner（矿工）是 2026-09-26 暗流纪重排新增。
       * 缺键的后果见上面 lvl 那条注——economy 里 `s.jobs.quarrier * SB.UNIT.stone`
       * 会变成 NaN 并顺着 addRes 污染石头池，再经 lvlSum 碰破壳系数。 */
      /* ⚠️ 2026-09-27 加 scribe（书手）：规则与上面 lvl/jobs 那几条注同源——
       *    `s.jobs.scribe * SB.UNIT.culture` 在缺键时成 NaN，顺着 addRes 污染市政点池。
       * ⚠️ 2026-09-28 加 merchant（商人）：**这次漏了，而且漏法比 NaN 更阴**——
       *    economy 那侧全都写了 `(s.jobs.merchant || 0)`，所以没有 NaN 事故；
       *    真正出事的是 UI：`render.js` 的那道守卫是 `s.jobs[j.id] <= 0`，而
       *      `undefined <= 0` 是 **false** ⇒ 守卫以为「这行有人」⇒ 还没解锁的商人
       *      **照样被渲染出来**。玩家看到职业行、点 ＋ 却雇不到人，而没有任何报错。
       *    ⇒ 加职业时这份字面量必须与 res / lvl 一样当场补齐，别等回归红。 */
      /* ⚠️ 2026-10-04：`craft`（匠人）键已随职业删除（用户「根本没有这个职业」）——
       *    职业表必须与 SB.JOBS 一一对应，同步删这一键即可；老档多出的 `jobs.craft`
       *    由 migrateRun 的 fixTable 按 ref 键遍历自动丢弃。 */
      jobs: { gather: 0, coralwright: 0, quarrier: 0, miner: 0, scholar: 0, scribe: 0, merchant: 0 },
      /* seen = 建筑「曾经露过头」的黑名单（habitat.reveal 写入，UI 判可见用）。
       * 没有它，玩家把库存花到 unlockRatio 阈值以下时，刚冒出来的建筑会当场消失。
       * 与 lvl/jobs 同理：新增字段要同时在 freshRun 与 migrateRun 两边补上。 */
      seen: {},
      /* 暖石开关（保温法那道开关）。与玩家显式拨的其他开关同套设计：
       *   ① 它不是存档里推演出来的量，玩家显式拨的；
       *   ② 拨了也未必生效（暖石不够 / 不在惩罚季），所以旁边必须显示「正在烧 / 石不够」。
       * warmBurning 是**每帧重算的瞬时标记**，不进存档（见 economy.tick 第 5 步的清位），
       * 存进去的话读档那一刻 UI 会把它当真。 */
      warmOn: false, warmBurning: false,
      /* 天穹钻机手动启动开关（2026-10-07 用户：「钻机造好之后……增加个启动钻机的按钮」）。
       *   原设计「建成即自动运转」改成了「建成后在自然环境卡里手动启动」——玩家看得见
       *   它吃什么、缺什么再决定开不开。默认 false（旧档无此键 ⇒ falsy = 未启动，语义正好）。
       *   结算在 shell.tickShell block②（闸门读它）；UI 在 render.renderDrill / input.toggleSkydrill。 */
      skydrillOn: false,
      /* 看广告加速（TapTap 激励视频）：`ms` = 剩余加速时间（墙钟真实毫秒），`on` = 2× 开关。
       * 默认 on=true：看完广告立即生效；玩家可在顶栏拨开关暂停（暂停时 ms 不流逝 = 囤着不用）。
       * 不进离线补算：离线只回放产出，不替玩家消耗广告时间银行。 */
      ad: { ms: 0, on: true },
      /* 热泉炉「开几座」（2026-09-30 用户：「这行应该是选择开几个」）。
       *   存的是**停了几座** `furnaceStop`，不是「开了几座」——因为「开几座」的默认值
       *   是 `lvl.furnace`（建成即开），而等级会随建造上涨：存「停用数」让新建的炉子
       *   自动投入运转，玩家只需在要省料（矿砂/暖石）时按下几座。
       *   运行座数 = max(0, lvl.furnace − furnaceStop)，见 economy.ironFlow。
       *   旧档的布尔 furnaceOn 在 migrateRun 里换算（false ⇒ 全停）。 */
      furnaceStop: 0,
      /* 热液汽轮机「开几座」（2026-10-07，与热泉炉 furnaceStop 同口径）：存**停了几座** turbineStop，
       *   默认 0 = 全开。运行座数 = max(0, lvl.hydroturbine − turbineStop)，结算在 economy.hydroAlloc
       *   （热液能供给）与 steelFlow（暖石扣费）两处，面板 rates 与 tick 同源。
       *   玩家要省暖石（汽轮机每台恒烧 5/s）时按下几座；新建的汽轮机自动投入运转。 */
      turbineStop: 0,
      /* 热液工坊「开几座」（2026-10-07，与 furnaceStop / turbineStop 同口径）：存**停了几座** hydroshopStop，
       *   默认 0 = 全开。运行座数 = max(0, lvl.hydroshop − hydroshopStop)，结算在 economy.hydroAlloc（钢的产出随运行座数缩放）。
       *   热液工坊吃的是**流**（热液能，不进库存），停产不省任何可囤资源，唯一意义是把流让给天穹钻机。 */
      hydroshopStop: 0,
      /* 冰封期状态（2026-09-27 新增：从「壳≤25% 恒真」改成「寒流季掷骰」）。
       * `frozen` 是**本季是否冰封**，换季那一刻由 economy.seasonTurn 写入；
       * `_seasonIdx` 是换季检测的游标（记住上次是哪一季）。
       * ⚠️ 缺这两个键的后果与其他缺键同类：`frozen` 为 undefined ⇒ 永不挨冻（不至于 NaN），
       *   但 `_seasonIdx` 为 undefined ⇒ 第一次 tick 就会误判成「刚换季」并额外掷一次骰。
       *   老档靠 migrateRun 补（见下）。 */
      frozen: false, _seasonIdx: -1,
      pop: SB.CFG.POP_START,
      /* 幸福度（陆地贸易，2026-09-28 落地）。顶层派生状态，不进 res 池——
       * 它不是资源、不进资源台账、不被 capOf 限制。夹 [HAPPY_FLOOR, ∞)。
       * ⚠️ 不是 res 键：renderRes 的资源循环按 SB.RESS 走，happy 单独成行显示。 */
      happy: 0,
      peak: SB.CFG.POP_START,
      deaths: 0,
      coldTicks: 0,
      frostDeaths: 0,
      famineDeaths: 0,
      shell: iceShell,
      iceShell: iceShell,
      baseShell: SB.CFG.ICE_SHELL,
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
      /* 各系统页签首次开门时的叙事弹窗，一次性记账。门本身都是派生的，
       * 这里只记「弹过了」；老档的兼容处理见 migrateRun。 */
      techPopup: false,
      civicPopup: false,
      faithPopup: false,
      workshopPopup: false,
      wonderPopup: false,
      era: 1,
      eureka: {},
      eurekaMet: {},
      /* ⚠️ luxury 原本不在 got 里——那时奢侈品没有开销渠道、也没有任何条件读它。
       *    2026-09-30 市政《中世纪集市》的鼓舞 = 「累计奢侈品产出 10000」⇒ 补进来：
       *    记的是**产出**（tick 里贸易供给 _S），不是净额（烧掉的 happy 那份不扣）。
       *    faith 同批补：王权神授的鼓舞 = 「累计信仰产出 10000」（addRes 会动态建键，
       *    但 seed 在这里与 res/steel 那批同口径，读档迁移也有据可依）。 */
      got: { kelp: 0, coral: 0, silt: 0, iron: 0, science: 0, fuel: 0, culture: 0, stoneBeam: 0, hardCoral: 0,
        /* ERA3 热液能系统（2026-09-29）：钢 / 热液能 / 钢制零件累计产出台账，与 res 同口径 seed。 */
        steel: 0, hydro: 0, steelPart: 0,
        /* ERA4（2026-09-30）：钛 / 脚手架累计产出台账，与 res 那批同口径 seed。 */
        titanium: 0, scaffold: 0,
        faith: 0, luxury: 0 },
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
      cards: [],            // 政策卡槽（数组，逐槽；2026-09-29 由 s.card 单值升维）
      card: null,          // 第 0 号槽镜像（旧代码/回归读方便，非事实来源）
      religionName: '',     // 玩家给信仰起的名字（空 = 未命名；神学解锁后可改，无消耗）
      /* 政策卡槽**人生第一次**装填过没有。
       * ⚠️ 它不能省：换卡收费若按「槽当前空不空」判，「拔下→再装填」就能无限免费换效果。
       *    一次性标记才堵得住。见 civics.cardBlocked 那条注。 */
      cardEver: false,
      /* 生息区自动升级开关（2026-09-30 用户规格 · 市政《封建主义》解锁2）：
       *   `{ kelp: true, weir: false, ... }`，键 = 生息区建筑 id，真 = 开着自动买级。
       *   泵在 game.pumpAuto（每 TECH_PUMP 秒扫一遍，买得起就 habitat.build 一级）。
       *   ⚠️ 刻意**不进离线补算**：离线批量花钱买级会把离线结算从「纯产出回放」变成
       *      「产出 + 消费决策」，与离线闸门（先算完才能操作）的口径冲突。 */
      autoUpg: {},
      /* 工坊自动制作槽（2026-10-07 用户拍板）：**数组，逐槽**，元素为 null（空槽）或
       *   `{ id: 'craft_stonebeam', pct: 0.25 }`（配方 id + 满仓后转制的比例）。
       *   ⚠️ 用数组而不是 `{craftId: pct}` 映射：槽是**有位置**的资源（槽数由升级项与
       *     轮回商店决定，"第几槽"本身就是玩家看得到的东西），映射表表达不了「槽位已满」。
       *   ⚠️ 长度**不预填**到上限：槽数是派生的（slotCap 现算），预填会让「买了 perk 之后
       *     数组长度对不上」这类问题变成存档迁移问题。
       *   ⚠️ 与 autoUpg 同口径**不进离线补算**：离线只结算产出、不替玩家把资源转成制品。 */
      autoSlots: [],
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
      /* 点击时间事件的临时全产 buff（信仰显圣）：墙钟毫秒戳，globalMul 读它判定是否仍在生效。
       * 默认 0（已过期）。不进离线补算的真值、不污染存档迁移（migrateRun 以 freshRun 为底座，自动带出）。
       * 独立 RNG 之外、事件系统唯一需要落进状态表的字段——因为它要改 economy.globalMul 这条产出主轴。 */
      eventAllUntil: 0,
      autoClickAcc: 0,            // 自动点击的帧钟累计预算（真实秒 × 次/秒），见 src/autoplay.js
      _grow: 0,
      _cutBase: 0,   // 累计：基础削壳削掉的点数
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
      var rawStr = root.localStorage && root.localStorage.getItem(SB.CFG.SAVE_KEY);
      if (rawStr) {
        var parsed = JSON.parse(rawStr);
        m = Object.assign(m, parsed);
        /* 旧档（本更新前）没有 religionSeen / shopUnlocked 字段：
         * 若已积过跨周目进度（轮回点 / 破层 / 走过 ≥2 周目 / 已购增益），
         * 视为「早就建立过宗教、也轮回过」，把两轮解锁都补上，
         * 免得老玩家升级后突然发现轮回商店被锁、攒的点花不出去。
         * 全新档（无任何进度）保持 false，按新流程从建立宗教开始。
         * ⚠️ 判据用 `=== undefined` 而非真值：新档 saveMeta 会写出 religionSeen:false，
         *   那种不算旧档，不该被这里的宽限误伤（新玩家即便 轮回 过一次、只要没建立宗教，
         *   商店仍按主流程在「首次轮回后」解锁，不走这条宽限）。 */
        if (parsed.religionSeen === undefined) {
          var hasProgress = (m.tide > 0) || (m.layers > 0) ||
            (m.cycle > 1) || (m.perks && Object.keys(m.perks).length > 0);
          if (hasProgress) { m.religionSeen = true; m.shopUnlocked = true; }
        }
      }
    } catch (e) { /* 存档损坏就当新档，不打断启动 */ }
    return m;
  }
  function saveMeta(meta) {
    try { root.localStorage && root.localStorage.setItem(SB.CFG.SAVE_KEY, JSON.stringify(meta)); } catch (e) {}
  }
  function loadRun() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(SB.CFG.RUN_KEY);
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
    var repairedResources = [];
    function fixTable(obj, ref, repairKeys) {
      var o = {}, key;
      for (key in ref) {
        var v = obj ? obj[key] : undefined;
        if (repairKeys && obj && Object.prototype.hasOwnProperty.call(obj, key)
            && !(typeof v === 'number' && isFinite(v))) repairKeys.push(key);
        o[key] = (typeof v === 'number' && isFinite(v)) ? v : ref[key];
      }
      return o;
    }
    out.res = fixTable(raw.res, base.res, repairedResources);
    /* 这是一次性诊断信息，不参与游戏数据，也不落盘。
     * JSON.stringify(NaN) 会把 NaN 写成 null；读档保护只能把它回落到默认值 0，
     * 但玩家需要知道这是旧档损坏的结果，而不是资源产出逻辑主动清零。 */
    Object.defineProperty(out, '_repairedResources', {
      value: repairedResources,
      enumerable: false,
      configurable: true
    });
    out.lvl = fixTable(raw.lvl, base.lvl);
    /* 热泉炉「开几座」迁移（2026-09-30）：旧档只有布尔 `furnaceOn`（见 freshRun 那条注）。
     *   false ⇒ 全部停（停用数 = 当前等级）；true / 缺键 ⇒ 全开（0）。
     *   再夹到 [0, lv]：存了一个比等级还大的停用数时，运行座数会算成负数。
     *   ⚠️ 必须在 fixTable(raw.lvl) 之后——判据要用到迁移后的等级。 */
    if (raw.furnaceOn === false) out.furnaceStop = out.lvl.furnace || 0;
    if (!(typeof out.furnaceStop === 'number' && isFinite(out.furnaceStop))) out.furnaceStop = 0;
    out.furnaceStop = Math.max(0, Math.min(Math.floor(out.furnaceStop), out.lvl.furnace || 0));
    /* 热液汽轮机「开几座」迁移（2026-10-07）：与 furnaceStop 同口径——无旧档布尔，仅夹到 [0, lv]
     *   防存档里写入非法的超大停用数（运行座数会算成负数）。必须在 fixTable(raw.lvl) 之后。 */
    if (!(typeof out.turbineStop === 'number' && isFinite(out.turbineStop))) out.turbineStop = 0;
    out.turbineStop = Math.max(0, Math.min(Math.floor(out.turbineStop), out.lvl.hydroturbine || 0));
    /* 热液工坊「开几座」迁移（2026-10-07）：与 turbineStop 同口径——无旧档布尔，仅夹到 [0, lv]。 */
    if (!(typeof out.hydroshopStop === 'number' && isFinite(out.hydroshopStop))) out.hydroshopStop = 0;
    out.hydroshopStop = Math.max(0, Math.min(Math.floor(out.hydroshopStop), out.lvl.hydroshop || 0));
    /* ⚠️ 城堡「真升级」老档迁移（2026-10-06）。
     *   背景：`castle` 建筑是 2026-09-30 起的误读实装（把「由议事厅升级而来」做成
     *   need:'hall' 前置 + 一座**独立**建筑），已于本轮从 BUILDINGS 删除。删掉之后
     *   `fixTable(raw.lvl, base.lvl)` 会**静默丢掉**存档里的 `lvl.castle`
     *   ——玩家在那座误造建筑上花掉的石头/珊瑚买来的等级会凭空消失。
     *   所以这里先把它并回 `lvl.hall`（城堡本就是议事厅的升级形态，等级理应归它）。
     *   ⚠️ 幂等：读一次之后存档里 castle=0，重复读档不会二次相加。 */
    var _legacyCastle = (raw.lvl && typeof raw.lvl.castle === 'number' && isFinite(raw.lvl.castle))
      ? Math.max(0, Math.floor(raw.lvl.castle)) : 0;
    if (_legacyCastle > 0) {
      out.lvl.hall = (out.lvl.hall || 0) + _legacyCastle;
      out.lvl.castle = 0;
    }
    out.jobs = fixTable(raw.jobs, base.jobs);
    /* ⚠️ 职业总和必须 ≤ pop（folk 的恒等式）。2026-09-30 之前 `merchant` 漏在 folk.IDS 之外，
     *    商人不计入 sum ⇒ 可以被**无限雇**，被污染的档里 jobs 总和会远超 pop
     *    （玩家实测：族民 34、上限 35，却挂着 100 名商人）。folk.IDS 已改为从 JOBS 派生，
     *    这里负责把**已经污染的老档**收回来，否则 UI 会打出「闲置 −99」这种自相矛盾的读数。
     * 回收顺序 = **从尾部职业往前**（越新的职业越是超额来源，且商人在贸易落地前近乎无用）——
     *    这样保住采集者/农民这些人命关天的老职业，而不是照 reconcile「从最大的退」把农民一起切掉。 */
    var _jids = (SB.JOBS || []).map(function (j) { return j.id; });
    var _jsum = 0, _ji;
    for (_ji = 0; _ji < _jids.length; _ji++) _jsum += (out.jobs[_jids[_ji]] || 0);
    var _jover = _jsum - out.pop;
    for (_ji = _jids.length - 1; _ji >= 0 && _jover > 0; _ji--) {
      var _jid = _jids[_ji], _jv = out.jobs[_jid] || 0;
      var _jcut = Math.min(_jv, _jover);
      out.jobs[_jid] = _jv - _jcut; _jover -= _jcut;
    }
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
    /* 工坊自动制作槽（2026-10-07）：数组逐槽，元素是 null 或 `{id, pct}`。
     *   老档没有这个键 ⇒ freshRun 的 `[]` 已由上面 `for (k in base)` 带过来，不必补默认值；
     *   要防的是另一头：存档里塞了**非数组**或被手改成怪值 ⇒ workshop.autoTick 遍历它时
     *   读 `.pct` 得 undefined ⇒ 不报错、只是那个槽永远不造（又一条静默断链）。
     *   ⇒ 非数组一律退回空表；元素逐个校验：id 必须是 CRAFTS 里真有的配方、
     *     pct 必须是 SB.CFG.AUTO.PCTS 里的档位，否则该槽作废（宁可空着也别造出怪东西）。 */
    out.autoSlots = [];
    var _rawSlots = Array.isArray(raw.autoSlots) ? raw.autoSlots : null;
    if (_rawSlots) {
      var _CL = SB.CRAFTS || [], _PL = (SB.CFG && SB.CFG.AUTO && SB.CFG.AUTO.PCTS) || [0.25, 0.5, 0.75, 1];
      for (var _ai = 0; _ai < _rawSlots.length; _ai++) {
        var _sl = _rawSlots[_ai];
        if (!_sl || typeof _sl !== 'object') continue;
        var _hit = false, _pi;
        for (_pi = 0; _pi < _CL.length; _pi++) if (_CL[_pi].id === _sl.id) _hit = true;
        if (!_hit) continue;
        var _pOk = false;
        for (_pi = 0; _pi < _PL.length; _pi++) if (_PL[_pi] === _sl.pct) _pOk = true;
        if (!_pOk) continue;
        out.autoSlots.push({ id: _sl.id, pct: _sl.pct });
      }
    }
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
    /* 政策卡槽升维（2026-09-29）：s.card 单值 → s.cards 数组。
     * ⚠️ 老档只有 `card`（单值）⇒ 迁成 `cards: [card]`（装在第 0 号槽）。
     *    新档直接有 `cards` ⇒ 原样保留。两者都没有 ⇒ 空数组。
     *    s.card 保留为第 0 号槽镜像（与 freshRun 默认一致），方便旧代码读。 */
    if (Array.isArray(raw.cards)) out.cards = raw.cards.map(function (x) { return x || null; });
    else if (raw.card) out.cards = [raw.card];
    else out.cards = [];
    out.card = out.cards[0] || null;
    /* 宗教名（2026-09-29）：老档没有这个字段 ⇒ 迁成 ''（未命名）。新档原样保留。 */
    out.religionName = (typeof raw.religionName === 'string') ? raw.religionName : '';
    /* 老档没有「科技面板开门」这个机制，玩家的科技页一直是开着的。
     * 于是这里直接记账为「弹窗已播」，不回去播一次结绳叙事——
     * 那句话的语境是「第一次知道有今天和明天」，对玩了几小时的老档是废话。
     * ⚠️ 面板开不开仍然由 tech.panelOpen 派生（读结绳的 cond），这里不存那个状态。 */
    out.techPopup = true;
    /* 其余页签的叙事弹窗也是新加的：老档若已经跨过对应门槛，就视为已经见过，
     * 不把一段「首次发现」的文案倒灌给已经玩过的存档。新档 / 新代码产生的字段
     * 已经在 base 里存在，只有字段缺失时才走这里的兼容判定。 */
    if (!Object.prototype.hasOwnProperty.call(raw, 'civicPopup'))
      out.civicPopup = !!(raw.lvl && raw.lvl.hall > 0);
    if (!Object.prototype.hasOwnProperty.call(raw, 'faithPopup'))
      out.faithPopup = !!(raw.civics && raw.civics.theology);
    if (!Object.prototype.hasOwnProperty.call(raw, 'workshopPopup'))
      out.workshopPopup = !!(raw.lvl && raw.lvl.workshop > 0);
    if (!Object.prototype.hasOwnProperty.call(raw, 'wonderPopup'))
      out.wonderPopup = !!(raw.techs && raw.techs.masonry);

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
    var nums = ['t', 'wallT', 'shell', 'iceShell', 'baseShell', 'pop', 'peak', 'coldTicks',
      'deaths', 'frostDeaths', 'famineDeaths', 'famine', 'happy'];
    for (var i = 0; i < nums.length; i++) {
      var v2 = out[nums[i]];
      if (typeof v2 !== 'number' || !isFinite(v2)) out[nums[i]] = base[nums[i]];
    }

    /* ⚠️⚠️ 壳厚版本迁移（2026-10-07 用户把 ICE_SHELL 从 100000 拍到 500000 时补上）
     * 【为什么必须在这里补，否则改壳厚等于只对新人生效】
     *   上面那段 nums 循环只校验「是不是数字」，**不重算**。而 `game.resumeRun(saved)`
     *   是**无条件拿存档当本局**的 —— 于是任何改配置前创建的存档，会永远跑在旧厚度上
     *   （实测：CFG 已是 500000，但老档 run() 读出来仍是 iceShell=100000 / shell=25000，
     *   上屏显示「25000 / 100000（25.0%）」，看起来像改动没生效）。
     * 【判据：用存档里的 baseShell 当版本戳】
     *   baseShell 是「这局开始时的总厚」，不随破壳进度变化 ⇒ 它与当前 CFG.ICE_SHELL
     *   不等，就说明这份存档是**另一个厚度版本**留下的。相等则原样放过（幂等，
     *   反复迁移不会把壳越翻越厚）。
     * 【等比重算，不是直接赋值】
     *   直接赋 iceShell = 新值会把「已经凿到 25%」的进度重置成满壳 = 白送进度；
     *   按 shell/iceShell 的比例缩放，玩家看到的剩余百分比不变，只是分母变大。
     *   另有 perk.thin（冰壳永久削弱，每级 ×0.9）：它已经体现在存档的 iceShell 里，
     *   所以按比例缩放天然继承，不重复乘。 */
    var curBase = SB.CFG.ICE_SHELL;
    if (typeof out.baseShell === 'number' && out.baseShell > 0 && out.baseShell !== curBase) {
      var keepRatio = out.iceShell > 0 ? out.shell / out.iceShell : 1;
      if (!(keepRatio >= 0 && keepRatio <= 1)) keepRatio = 1;   // 存档被手改成越界值时按满壳处理
      out.iceShell = Math.round(curBase * Math.pow(0.9, (out.perk && out.perk.thin) || 0));
      out.baseShell = curBase;
      out.shell = Math.round(out.iceShell * keepRatio);
    }
    return out;
  }
  function saveRun(run) {
    try {
      if (!root.localStorage || !run || !run.res) return;
      /* 存档是最后一道防线：JSON.stringify(NaN) 会静默写成 null，
       * 下一次刷新时迁移层只能把它当成坏值回落为 0。不要让一帧坏状态覆盖
       * 上一份可用存档；运行态的 addRes 守卫负责修复，之后下一次合法快照再落盘。 */
      var key, value;
      for (key in (SB.RESS || {})) {
        value = run.res[key];
        if (!(typeof value === 'number' && isFinite(value))) return;
      }
      root.localStorage.setItem(SB.CFG.RUN_KEY, JSON.stringify(run));
    } catch (e) {}
  }
  function clearRun() {
    try { root.localStorage && root.localStorage.removeItem(SB.CFG.RUN_KEY); } catch (e) {}
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
