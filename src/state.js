/* 天壳 / SHELLBREAK — 状态层
 * 周目内状态 S 与跨周目状态 meta 分离。
 * 冻结规则：derivatives（派生值）一律在本层计算，其它层不得直接改 S 的结构字段。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;
  var metaLoadProblem = null;
  var runLoadProblem = null;

  function preserveRawSave(key, raw) {
    if (!raw) return;
    var ls = null;
    try { ls = root.localStorage; } catch (e) { return; }
    if (!ls) return;
    var backupKey = key === CFG.SAVE_KEY ? CFG.SAVE_BACKUP_KEY : CFG.RUN_BACKUP_KEY;
    try {
      /* 只创建一次救援副本，之后绝不让一次失败的恢复/导入覆盖那份旧副本。 */
      if (ls.getItem(backupKey) === null) ls.setItem(backupKey, raw);
    } catch (e) { /* quota/权限受限时仍保留原主档 */ }
  }

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
    return { tide: 0, spent: 0, tideEarnedTotal: 0, perks: {}, cycle: 0, layers: 0, techLog: {}, lastRun: null,
      religionSeen: false, shopUnlocked: false,
      autoResearch: { tech: false, civic: false },
      oldFaith: 0, memorialWonders: {}, oldArtworkEarnedTotal: 0, oldTideStelesEarnedTotal: 0,
      challenges: { completed: { cold: false, small: false, science: 0, abyss: 0, speedrun: 0 } },
      /* 「看广告 +1 轮回点」每日次数计数（跨周目保留，但按本地日期重置）。
       * date 为本地日期串（YYYY-M-D），与 todayKey() 同源；跨天或旧档无此键 ⇒ 视为重置。
       * count 为当日已看次数，达 AD.REBIRTH_DAILY_MAX（10）即封顶。 */
      adRebirth: { date: '', count: 0 },
      /* 更新日志：上次看过弹窗的版本号。空串 = 从未看过 ⇒ 首次进入会弹。
       * 存 meta（跨周目保留），软重置不触发重复弹；清空存档会归零 ⇒ 重装后还会弹一次。 */
      seenVersion: '',
      /* ERA7（2026-10-17 · spec §7）：星屑跨周目局外资源。只在周目结算时累加（prestige.doBreak），
       *   与轮回点同侧；freshRun 时 seed 进 s.got.stardust 供超古代科技 eureka 读。 */
      stardust: 0, stardustEarned: 0,
      starPerks: { starInfinite: 0, starSmelt: 0, starFolk: 0,
        earlyAutoBuildCore: 0, earlyAutoBuildFood: 0, earlyAutoBuildWorkshop: 0, earlyAutoBuildTrade: 0,
        earlyAutoBuildAcademy: 0, earlyAutoBuildCivic: 0, earlyAutoBuildFaith: 0, earlyAutoBuildSpace: 0,
        starLaunchSpeed: 0, starDysonCost: 0, starSailHydro: 0, starTerraform: 0, starExplore: 0 } };
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
      autoClick: 0, autoEvent: 0,
      /* 星屑商店运行态增益；等级从 meta.starPerks 派生。 */
      starInfinite: 0, starSmelt: 0, starFolk: 0,
      earlyAutoBuildCore: 0, earlyAutoBuildFood: 0, earlyAutoBuildWorkshop: 0, earlyAutoBuildTrade: 0,
      earlyAutoBuildAcademy: 0, earlyAutoBuildCivic: 0, earlyAutoBuildFaith: 0, earlyAutoBuildSpace: 0,
      starLaunchSpeed: 0, starDysonCost: 0, starSailHydro: 0, starTerraform: 0, starExplore: 0 };
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
    if (!m) return out;
    out.applied = true;
    var PL = SB.PERKS || [], i;
    for (i = 0; i < PL.length; i++) {
      var p = PL[i];
      var lv = (m.perks && m.perks[p.id]) || 0;
      if (!lv) continue;
      var a = p.apply || {};
      for (var k in a) out.perk[k] = (out.perk[k] || 0) + a[k] * lv;
      if (p.id === 'food') out.kelp += 200 * lv;
      if (p.id === 'coral') out.coral += 150 * lv;
      if (p.id === 'scienceStart') out.science += 100 * lv;
    }
    var SPL = SB.STAR_PERKS || [];
    for (i = 0; i < SPL.length; i++) {
      var sp = SPL[i], slv = (m.starPerks && m.starPerks[sp.id]) || 0;
      if (!slv) continue;
      var sa = sp.apply || {};
      for (var sk in sa) out.perk[sk] = (out.perk[sk] || 0) + sa[sk] * slv;
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
    /* 星屑跨周目局外资源：freshRun 把累计结算发放量 seed 进 got.stardust；余额兑换不改变尤里卡进度。 */
    var _meta = null;
    try { if (SB.game && SB.game.meta) _meta = SB.game.meta(); } catch (e) { _meta = null; }
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
        artwork: 0, tidalRecord: 0, resonantDrill: 0,
        /* ERA6（2026-10 实装）：钛金板件 / 星空探索 / 封闭藻仓。seed 只防 addRes 漏键染 NaN
         *   （与上面那条同源事故）。钛金板件与封闭藻仓都是 craft ⇒ 无仓储上限；
         *   starExplore 是进度资源，有专用阶段上限。θ生物金属是普通有限仓储资源（CAP_BASE=200）。 */
        tiplate: 0, starExplore: 0, sealbin: 0,
        /* ERA7（2026-10-17 · spec §2）：燃料/铀/火箭引擎/星屑。铀有 CAP_BASE 键（200）；
         *   火箭燃料与引擎都是 craft，无仓储上限；星屑是跨周目局外资源。
         *   stardust 波次4 起由 meta 存档 seed 进来（freshRun(false) 时保持 0）。 */
        uranium: 0, rocketFuel: 0, rocketEngine: 0, strongProp: 0,
        /* got.stardust 记结算实际发放累计值；商店兑换不增加该尤里卡台账。 */
        stardust: 0, thetaMetal: 0, thinafilm: 0 },
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
        hydroturbine: 0, hydroshop: 0, civichall: 0,
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
        theater: 0, tenement: 0,
        /* ERA6（2026-10 实装）：研究实验室（chemistry 解锁）。 */
        researchlab: 0,
        /* ERA7（2026-10-17 · spec §5/§4）：轨道卫星 / 空间站（星海区）/ 核热厂（工坊区）。
         *   漏键 = 读档静默丢 + costOf 读到 undefined ⇒ 全表造价 NaN（与上面每一条同源）。
         *   migrateRun 的 fixTable 以本 seed 为 ref ⇒ 同步覆盖，无需第二处补。 */
        satellite: 0, spacestation: 0, fissionplant: 0,
        /* ERA7（2026-10 实装 · 竞技体育市政解锁）：体育场（civic 区域，ratio 1.5 多实例）。
         * 漏键 = 读档静默丢 + costOf 读到 undefined ⇒ 全表造价 NaN（与上面每一条同源）。 */
        stadium: 0,
        /* ERA8（2026-10-18 · spec §4）：生物材料研究所 / 瑞亚星矿井 / 泰坦星气云采集站。
         *   漏键 = 读档静默丢 + costOf 读到 undefined ⇒ 全表造价 NaN（与上面每一条同源）；
         *   thetaFlow 读 lvl.biomatlab 也依赖本 seed（undefined > 0 恒 false 是侥幸不是保障）。 */
        biomatlab: 0, rheamine: 0, titancloud: 0, robotbay: 0,
        /* ERA9（光帆纪 · 本次实装）：马尔斯工造中心（火星在地制造，space 区）/ 欧罗巴冰面发射场（母星 core 区）。
         * 漏键 = 读档静默丢 + costOf 读到 undefined ⇒ 全表造价 NaN（与上面每一条同源）。
         * europa_launch 虽在母星（core 区），但发射台每 10s 向星图推进太阳帆（s.sunSails 累加器），
         * 故另需 sunSails / sunSailProc 运行态种子（见下方 geek 段旁）。 */
        mars_workshop: 0, europa_launch: 0,
        /* ERA9（2026-10-20 市政《神们自己》解锁建筑）：黑色方碑（信仰产出 ×1.2）。
         * 漏键 = 读档静默丢 + costOf 读到 undefined ⇒ 全表造价 NaN（与上面每一条同源）。 */
        black_monolith: 0,
        /* ERA10（戴森纪 · 2026-10-20）：太阳星环（space 区，近恒星轨道建设解锁）。
         * 漏键 = 读档静默丢 + costOf 读到 undefined ⇒ 全表造价 NaN（与上面每一条同源）。
         * ⚠️ e2e「每座建筑都在状态表的 lvl 里」当场抓到这条漏写——这正是那条断言存在的理由。 */
        solar_ring: 0,
        /* ERA10 市政（2026-10-20 · 用户 ERA10 市政规格）：泰拉/恩克拉多斯星轨道发射场（space 区，公共工程局解锁）
         * + 虚境祭坛（faith 区，虚境探索解锁）。三条漏键都会让读档静默丢等级 / costOf 读 undefined。
         * ⚠️ void_altar 是本作第一座带 maxLvl 的建筑，等级上限由建筑条目上的 maxLvl 决定，
         *    状态表这边只存等级、不存上限（上限改了老档要跟着生效，不能烤进存档）。 */
        terra_launch: 0, enceladus_launch: 0, void_altar: 0 },
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
      /* ERA8（2026-10-19 · B7 机器人机制）：机器人分配表，与 jobs 平行但**不进 s.pop**
       *   ⇒ 不影响信仰点（faithRate 直读 s.pop）。键 = 职业 id，值 = 该职业的机器人数量；
       *   仅能担任非书手/学者的岗位（folk.robotJobAllowed）。robotPop = 4 × lvl.robotbay。 */
      robotJobs: {},
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
       *   结算在 shell.tickShell block②（闸门读它）；UI 在 ui/render-environment.js 的 renderDrill / input.toggleSkydrill。 */
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
      /* ERA8：生物材料研究所「开几座」停用数，默认全开；原料消耗、θ产出和热液需求共用此开关。 */
      biomatlabStop: 0,
      /* ERA7（2026-10-17 · spec §5）：轨道卫星「开几座」（与 furnaceStop / turbineStop 同口径）：
       *   存**停了几座** satelliteStop，默认 0 = 全开。运行座数 = max(0, lvl.satellite − satelliteStop)，
       *   结算在 economy.starRate（星空产出随运行座数缩放）。卫星每级耗 1 热液能/秒（挂 satelliteStop 开关，与空间站同口径）；停产停耗与星空贡献。
       *   旧档无 satelliteStop 键 ⇒ 0（全开），`|| 0` 兜底，无需迁移。 */
      satelliteStop: 0,
      /* ERA7（2026-10-17 · spec §5）：空间站「开几座」（与 satelliteStop 同口径）：
       *   存**停了几座** spacestationStop，默认 0 = 全开。运行座数 = max(0, lvl.spacestation − spacestationStop)，
       *   结算在 economy.starRate（星空产出）与 economy.hydroAlloc（每级耗 2 热液能/秒）两处，
       *   面板 rates 与 tick 同源。旧档无此键 ⇒ 0（全开），`|| 0` 兜底，无需迁移。 */
      spacestationStop: 0,
      /* 冰封期状态（2026-09-27 新增：从「壳≤25% 恒真」改成「寒流季掷骰」）。
       * `frozen` 是**本季是否冰封**，换季那一刻由 economy.seasonTurn 写入；
       * `_seasonIdx` 是换季检测的游标（记住上次是哪一季）。
       * ⚠️ 缺这两个键的后果与其他缺键同类：`frozen` 为 undefined ⇒ 永不挨冻（不至于 NaN），
       *   但 `_seasonIdx` 为 undefined ⇒ 第一次 tick 就会误判成「刚换季」并额外掷一次骰。
       *   老档靠 migrateRun 补（见下）。 */
      frozen: false, _seasonIdx: -1,
      pop: SB.challenges ? SB.challenges.startingPopulation() : SB.CFG.POP_START,
      /* 幸福度（陆地贸易，2026-09-28 落地）。顶层派生状态，不进 res 池——
       * 它不是资源、不进资源台账、不被 capOf 限制。夹 [HAPPY_FLOOR, ∞)。
       * ⚠️ 不是 res 键：renderRes 的资源循环按 SB.RESS 走，happy 单独成行显示。 */
      happy: 0,
      peak: SB.challenges ? SB.challenges.startingPopulation() : SB.CFG.POP_START,
      challenge: null,
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
        faith: 0, luxury: 0,
        /* ERA6（2026-10 实装）：与 res 那批同口径 seed，防 addRes 漏键染 NaN。 */
        tiplate: 0, starExplore: 0, sealbin: 0,
        /* 星屑尤里卡读累计结算发放量；兑换只改余额，不影响这份台账。 */
        uranium: 0, rocketFuel: 0, rocketEngine: 0, stardust: (_meta ? (_meta.stardustEarned || 0) : 0), thetaMetal: 0, thinafilm: 0 },
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
      govAdopted: {},       // 已采用过的政体 id；每个政体仅首次采用免费
      cards: [],            // 政策卡槽（数组，逐槽；2026-09-29 由 s.card 单值升维）
      card: null,          // 第 0 号槽镜像（旧代码/回归读方便，非事实来源）
      religionName: '',     // 玩家给信仰起的名字（空 = 未命名；神学解锁后可改，无消耗）
      habitatName: '',      // 玩家给聚落起的名字（空 = 未起名；ERA6+ 可在巢穴页改名，本轮回有效）
      /* ERA6 市政（2026-10 实装）—— 意识形态门槛 / 政体命名 / 公司系统所需的顶层字段：
       *   lifetimeCulture —— 累计市政点**产出**（不是存量，存量采纳时已被消费）。
       *       意识形态「累计市政产出 ≥ 900000」读它，用 `||0` 兜底（旧档无此键 = 0）。
       *   govName —— 玩家给当前政体起的名字（空 = 未命名；选 3 个新政府之一且空则弹窗起名）。
       *   companyNames —— 已成立公司的固定名（行业 res → 名，写存档不刷新）。空 = 宏观经济学未解锁。
       *       逐家成立时刻 / 关闭态见 companyState（2026-10-13 改「单独关闭」后拆出）。 */
      lifetimeCulture: 0,
      govName: '',
      /* ERA6（2026-10-13 改「单独关闭」）：公司系统逐家状态，键 = 行业 res。
       *   { kelp: {epoch, closed}, coral: {epoch, closed} }
       *   epoch —— 该公司成立时刻（s.t 逻辑秒）。0 = 尚未成立。>0 才判等级 / 奢侈加成。
       *   closed —— 是否已被玩家主动解散（单独关闭）。true = 已解散（不自动复建，需手动「重建」）。
       *   关闭后重新「重建」该公司 ⇒ 重设成立时刻 ⇒ 从乡镇企业（tier 0）重新开始成长。
       * ⚠️ 顶层字段，由 companies.js 的 SB.companyState(s, res) 读写（含旧档迁移）。 */
      companyState: {},
      companyNames: {},
      /* ERA7（2026-10-21）：自动化钻探实际开启的矿井数，范围由 state-migrate 按砂矿坑等级钳制。 */
      autoDrillCount: 0,
      /* ERA8（2026-10-18）：工坊升级「工业机器人」（upg_indrobot）的可开关状态。 */
      indRobotOn: true,
      /* ERA8（2026-10-18 · spec §4）：**单局 buff 标记表**（run-scoped）。
       *   laserEngrave —— 激光快速雕版（upg_laserengrave）「本周目制造成本 −30%」。
       *   只由 workshop.upgradeBuy 置位、prestige.doBreak 清除；craftCostMul 只读标记。
       *   freshRun 全新重建 ⇒ 轮回自然失效，「失效需重买」语义单一事实来源。 */
      runBuffs: {},
      /* 政策卡槽**人生第一次**装填过没有。
       * ⚠️ 它不能省：换卡收费若按「槽当前空不空」判，「拔下→再装填」就能无限免费换效果。
       *    一次性标记才堵得住。见 civics.cardBlocked 那条注。 */
      cardEver: false,
      /* 免费卸下机会（2026-10-14）：每完成一个市政 +1，可累积、无上限。
       *   卸下政策卡时优先消耗 1 次（见 civics.setCardAt / cardBlocked），消耗完再走市政点收费。
       *   动机：让玩家有节奏地调整政策卡，不被「卸下收费」门槛卡死。
       *   ⚠️ 迁移：旧档无此键 ⇒ migrateRun 里补 0（见 state.migrateRun）。 */
      cardFreeRemoves: 0,
      /* 区域建筑自动建造/升级开关（2026-09-30 起）：
       *   `{ kelp: true, lighthouse: false, ... }`，键 = 建筑 id，真 = 开着自动买级。
       *   可用区域由市政 autoBuildZones 声明；在线泵每 TECH_PUMP 秒扫一遍，买得起就 build 一级。
       *   ⚠️ 刻意**不进离线补算**：离线批量花钱买级会把离线结算从「纯产出回放」变成
       *      「产出 + 消费决策」，与离线闸门（先算完才能操作）的口径冲突。 */
      autoUpg: {},
      /* 工坊自动制作槽：**数组，逐槽**，元素为 null（空槽）或
       *   `{ id: 'craft_stonebeam', pct: 0.25 }`（有上限原料：满仓转制比例）/
       *   `{ id: 'craft_scaffold', batch: 80 }`（全无上限原料：库存达到批次数后造这一批）。
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
      shellOpened: false, // 天壳已打开；星图解锁且留在本局后仍可继续推进
      breakSettled: false, // 本周目轮回奖励/遗产已入账
      spacecraft: [],     // 本周目发射的卫星与空间站；新周目重置
      starComplete: false,   // 星空槽满槽（太空时代达成）标记；仅占位结算，无机制奖励（2026-10-13）
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
      _ts: 0,
      /* ERA9（光帆纪 · 本次实装）：星图太阳帆累加器 + G.E.E.K 运行态种子。
       *   sunSails     —— 太阳帆总数（**无限**，无上限）；由欧罗巴冰面发射场每运行 10s 推 +1 帆。
       *                   每帆 +0.05 热液能/秒（进 hydroAlloc 供给侧，不进库存）。
       *   sunSailProc  —— 发射场推进太阳帆的**累计运行秒数**游标（每 +10s 触发一次 +1 帆）。
       *   geek         —— G.E.E.K 星球重构机运行态：
       *                    geekOn        = 自然环境卡手动启动开关（与 skydrillOn 同纪律）；
       *                    enceladusDone / terraDone = 恩克拉多斯 / 泰拉改造完成旗（terraform 尤里卡 / 减消耗管线读它）；
       *                    costOffset = 覆盖建筑的有效造价等级偏移（Enceladus=3 / Terra 叠 +5=8，减消耗落点）；
       *                    enceladusRun / terraRun = 改造进度秒数（自然环境卡 UI 读它）。
       *   ⚠️ 旧档无这些键 ⇒ 走 migrateRun 的 base 兜底（state-migrate.js 的 geek 深合并），自动带出默认值。 */
      sunSails: 0, sunSailProc: 0,
      geek: { geekOn: false, enceladusDone: false, terraDone: false, costOffset: 0, enceladusRun: 0, terraRun: 0 },
      /* ERA10（戴森纪 · 2026-10-20 实装）：戴森球子系统状态。
       *   dysonNodes     —— 戴森球节点总数（发射场节点模式每运行满 1 节律 +1，无限）。
       *   dysonProc      —— 节点模式累计运行秒数游标（每 +1 节律触发一次 +1 节点）。
       *   launchMode     —— 发射场制造模式：'sail'（太阳帆，默认）/ 'node'（戴森球节点）；
       *                     完成《绝热材料》后 UI 才给切换钮（adiabatic 门控在渲染侧）。
       *   dysonDone      —— 戴森球 100% 达成旗（双达标取小口径达 1）；只置一次。
       *   dysonPopupSeen —— 通关弹窗已播旗（弹窗只播一次；继续游玩后不再弹）。
       * ⚠️ 旧档无这些键 ⇒ 走 migrateRun 的 base 兜底自动带出默认值（与 geek 同机制）。 */
      dysonNodes: 0, dysonProc: 0, launchMode: 'sail',
      dysonDone: false, dysonPopupSeen: false
    };
  }

  // ---- 跨周目持久化 ----
  function normalizeMeta(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('跨周目存档格式无效');
    if (!Object.keys(parsed).length) throw new Error('跨周目存档为空');
    var m = Object.assign(emptyMeta(), parsed);
    if (!m.perks || typeof m.perks !== 'object' || Array.isArray(m.perks)) m.perks = {};
    if (!(typeof m.tideEarnedTotal === 'number' && isFinite(m.tideEarnedTotal)))
      m.tideEarnedTotal = Math.max(0, (Number(m.tide) || 0) + (Number(m.spent) || 0));
    m.tideEarnedTotal = Math.max(0, m.tideEarnedTotal);
    if (!(typeof m.stardust === 'number' && isFinite(m.stardust))) m.stardust = 0;
    m.stardust = Math.max(0, Math.floor(m.stardust));
    if (!(typeof m.stardustEarned === 'number' && isFinite(m.stardustEarned))) m.stardustEarned = m.stardust;
    m.stardustEarned = Math.max(0, Math.floor(m.stardustEarned));
    if (!m.starPerks || typeof m.starPerks !== 'object' || Array.isArray(m.starPerks)) m.starPerks = {};
    /* 2026-10-20 迁移：原「先行建造协议」(earlyAutoBuild) 一次性全开，拆成每区独立项（含 space——
     * 商店保留星海区先行建造，techs/civics 不挂星海区自动建造）。老存档已购 earlyAutoBuild ⇒ 转成 8 个区的
     * 对应 starPerk 等级，再删旧键（幂等：删后下次不再触发）。 */
    if (m.starPerks && m.starPerks.earlyAutoBuild) {
      var _eabLv = m.starPerks.earlyAutoBuild;
      var _eabZones = ['core', 'food', 'workshop', 'trade', 'academy', 'civic', 'faith', 'space'];
      for (var _zi = 0; _zi < _eabZones.length; _zi++) {
        var _nk = 'earlyAutoBuild' + _eabZones[_zi].charAt(0).toUpperCase() + _eabZones[_zi].slice(1);
        m.starPerks[_nk] = Math.max(m.starPerks[_nk] || 0, _eabLv);
      }
      delete m.starPerks.earlyAutoBuild;
    }
    var starPerkDefaults = emptyMeta().starPerks;
    for (var starPerkId in starPerkDefaults) {
      var starPerkLevel = m.starPerks[starPerkId];
      if (!(typeof starPerkLevel === 'number' && isFinite(starPerkLevel))) starPerkLevel = 0;
      var starPerkMax = Infinity, starDefs = SB.STAR_PERKS || [];
      for (var spi = 0; spi < starDefs.length; spi++) if (starDefs[spi].id === starPerkId) starPerkMax = starDefs[spi].n || 1;
      m.starPerks[starPerkId] = Math.min(starPerkMax, Math.max(0, Math.floor(starPerkLevel)));
    }
    if (!m.autoResearch || typeof m.autoResearch !== 'object' || Array.isArray(m.autoResearch)) m.autoResearch = {};
    m.autoResearch = { tech: m.autoResearch.tech === true, civic: m.autoResearch.civic === true };
    if (!m.challenges || typeof m.challenges !== 'object' || Array.isArray(m.challenges)) m.challenges = { completed: {} };
    if (!m.challenges.completed || typeof m.challenges.completed !== 'object' || Array.isArray(m.challenges.completed)) m.challenges.completed = {};
    var challengeIds = { cold: true, small: true, science: true, abyss: true, speedrun: true, drift_terra: true };
    for (var challengeId in challengeIds) {
      var completed = m.challenges.completed[challengeId];
      if (challengeId === 'cold' || challengeId === 'small' || challengeId === 'drift_terra') m.challenges.completed[challengeId] = completed === true;
      else m.challenges.completed[challengeId] = Math.max(0, Math.min(3, completed | 0));
    }
    /* 旧档没有 religionSeen / shopUnlocked，但已有跨周目进度时保留老玩家解锁。 */
    if (parsed.religionSeen === undefined) {
      var hasProgress = (m.tide > 0) || (m.layers > 0) ||
        (m.cycle > 1) || (m.perks && Object.keys(m.perks).length > 0);
      if (hasProgress) { m.religionSeen = true; m.shopUnlocked = true; }
    }
    return m;
  }
  function loadMeta() {
    var rawStr = null;
    try {
      rawStr = root.localStorage && root.localStorage.getItem(CFG.SAVE_KEY);
      if (!rawStr) { metaLoadProblem = null; return emptyMeta(); }
      var m = normalizeMeta(JSON.parse(rawStr));
      metaLoadProblem = null;
      return m;
    } catch (e) {
      preserveRawSave(CFG.SAVE_KEY, rawStr);
      metaLoadProblem = { raw: rawStr, message: e && e.message ? e.message : String(e) };
      return emptyMeta();
    }
  }
  function saveMeta(meta) {
    try { root.localStorage && root.localStorage.setItem(SB.CFG.SAVE_KEY, JSON.stringify(meta)); } catch (e) {}
  }
  /* 迁移算法拆在 state-migrate.js；freshRun / emptyPerks 通过参数注入，避免重复维护默认模板。 */
  function migrateRun(raw) {
    return SB.stateMigrations.migrateRun(raw, freshRun, emptyPerks);
  }
  function loadRun() {
    var raw = null;
    try {
      raw = root.localStorage && root.localStorage.getItem(CFG.RUN_KEY);
      if (!raw) { runLoadProblem = null; return null; }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
          || !parsed.res || typeof parsed.res !== 'object'
          || !parsed.lvl || typeof parsed.lvl !== 'object'
          || !parsed.jobs || typeof parsed.jobs !== 'object'
          || typeof parsed.shell !== 'number' || !isFinite(parsed.shell))
        throw new Error('本周目存档缺少必要字段');
      var loaded = migrateRun(parsed);
      if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('本周目存档迁移结果无效');
      runLoadProblem = null;
      return loaded;
    } catch (e) {
      preserveRawSave(CFG.RUN_KEY, raw);
      runLoadProblem = { raw: raw, message: e && e.message ? e.message : String(e) };
      return null;
    }
  }
  function loadProblems() { return { meta: metaLoadProblem, run: runLoadProblem }; }
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
    normalizeMeta: normalizeMeta,
    saveMeta: saveMeta,
    loadRun: loadRun,
    loadProblems: loadProblems,
    saveRun: saveRun,
    clearRun: clearRun
  };
})(typeof window !== 'undefined' ? window : globalThis);
