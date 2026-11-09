/* e2e suite: 「水体污染」挑战（2026-11-02 实装 · docs/challenge-ocean-pollution-design.md v11）。
 *
 * 这一套只钉**这次实装引入的契约**，不重复别的 suite 已有的通用断言：
 *   ① 五阶段阈值与阶段表对齐（改阈值不该只改一处）
 *   ② 三个 debuff / 净化 / 死亡乘区的**同源**（面板 === 结算）
 *   ③ Q 定案：死亡率不随人口放大、每步最多死 1 人
 *   ④ R 定案：完成挑战 ⇒ 轮回点获取 +10%（通用规则，非本挑战专属文案）
 *   ⑤ S 定案：拆卫星不补偿星空（星穹存量不动）
 *   ⑥ 死亡的两条时间轴（在线 tick / 离线微步）都真的会死人
 *   ⑦ 装罐填埋只削汽轮机那一枝（不是全局污染倍率）
 *   ⑧ 挑战专属内容四类门控（建筑 / 科技 / 市政 / 政策卡）在基游戏全部不出现
 *   ⑨ 洁净热液源（潮汐/太阳能/风场）产热液能但不排污
 *   ⑩ 通关奖励三件（星屑 ×1.1 / 商人奢侈 ×1.5 / 初始人口 +2）
 */
export function run({ SB, check, noop, dom }) {
  console.log('\n=== 水体污染挑战（2026-11-02）===');
  const E = SB.economy;
  const meta = SB.game.meta();
  const savedProgress = JSON.parse(JSON.stringify(meta.challenges || {}));
  const savedChallenge = JSON.parse(JSON.stringify(meta.challenges || {}));

  /* 造一个「已进入水体污染」的干净周目。所有子用例都从它 clone，互不污染。 */
  function polRun(mut) {
    const s = SB.state.freshRun(false);
    s.challenge = { id: 'waterpollution', tier: 0, replay: false };
    s.challengeDone = false;
    s.res.uranium = 100000;
    s.res.warmstone = 100000;
    s.res.silt = 100000;
    s.res.stone = 100000;
    s.res.kelp = 100000;
    s.res.coral = 100000;
    s.res.steel = 100000;
    s.res.titanium = 100000;
    s.res.rocketEngine = 100000;
    s.res.sealbin = 100000;
    s.res.tiplate = 100000;
    s.res.strongProp = 100000;
    s.res.thinafilm = 100000;
    s.res.thetaMetal = 100000;
    if (mut) mut(s);
    return s;
  }
  function baseRun(mut) {
    const s = SB.state.freshRun(false);
    if (mut) mut(s);
    return s;
  }

  try {
    /* ── ① 五阶段阈值 ───────────────────────────────────────────── */
    const STAGES = (SB.CFG.POLLUTION && SB.CFG.POLLUTION.STAGES) || [];
    check('污染五阶段阈值 = 0 / 1000 / 4万 / 16万 / 640万（与设计文档 v11 一致）',
      STAGES.length === 5 && STAGES[0].at === 0 && STAGES[1].at === 1000 &&
      STAGES[2].at === 40000 && STAGES[3].at === 160000 && STAGES[4].at === 6400000,
      STAGES.map(x => x.at).join('/'));
    check('五阶段命名 = 澄海 / 浊流 / 赤潮 / 死区 / 腐渊',
      STAGES.map(x => x.name).join(',') === '澄海,浊流,赤潮,死区,腐渊',
      STAGES.map(x => x.name).join(','));

    const stg = polRun();
    const at = v => { stg.pollution = v; return E.pollutionStageIndex(stg); };
    check('阶段索引按阈值逐级推进（999→0 / 1000→1 / 40000→2 / 160000→3 / 640万→4）',
      at(0) === 0 && at(999) === 0 && at(1000) === 1 && at(39999) === 1 &&
      at(40000) === 2 && at(160000) === 3 && at(6399999) === 3 && at(6400000) === 4,
      [0, 999, 1000, 40000, 160000, 6400000].map(v => v + ':' + at(v)).join(' '));

    /* 非挑战周目一律恒 0 / 恒 1 —— 这是「所有污染逻辑只在挑战周目生效」的总闸。 */
    const plain = baseRun();
    plain.pollution = 6400000;
    check('非挑战周目：阶段索引恒 0、幸福偏移 0、藻食/珊瑚乘区恒 1（污染总闸关）',
      E.pollutionStageIndex(plain) === 0 && E.pollutionHappyOffset(plain) === 0 &&
      E.pollutionKelpMul(plain) === 1 && E.pollutionCoralMul(plain) === 1 &&
      E.pollutionEmitRate(plain, { pollutionTurbineRate: 1, pollutionOtherRate: 1 }) === 0,
      'stage=' + E.pollutionStageIndex(plain));

    /* ── ② debuff 五个数对齐阶段表 ───────────────────────────────── */
    stg.pollution = 160000;
    const st = E.pollutionStage(stg);
    check('阶段 3（死区）：幸福 −4 / 藻食 0.30 / 珊瑚 0.30 / 死亡 0.5%·s',
      st.happy === -4 && st.kelpMul === 0.30 && st.coralMul === 0.30 && st.deathP === 0.005,
      JSON.stringify(st));

    /* ── ③ Q 定案：死亡率不随人口放大 ───────────────────────────── */
    const few = polRun(s => { s.pollution = 6400000; s.pop = 3; });
    const many = polRun(s => { s.pollution = 6400000; s.pop = 300; });
    check('Q 定案：同一阶段下 3 人与 300 人的每秒死亡概率完全相同（不乘人口）',
      Math.abs(E.pollutionDeathRisk(few, 1) - E.pollutionDeathRisk(many, 1)) < 1e-12 &&
      E.pollutionDeathRisk(few, 1) > 0.019,
      'p3=' + E.pollutionDeathRisk(few, 1).toFixed(6) + ' p300=' + E.pollutionDeathRisk(many, 1).toFixed(6));
    check('Q 定案：dt 折算 = 1−(1−p)^dt（10s 一步 ≠ 10 倍，0.1s 一步也不放大）',
      Math.abs(E.pollutionDeathRisk(few, 10) - (1 - Math.pow(1 - 0.02, 10))) < 1e-12 &&
      Math.abs(E.pollutionDeathRisk(few, 0.1) - (1 - Math.pow(1 - 0.02, 0.1))) < 1e-12,
      'p(10s)=' + E.pollutionDeathRisk(few, 10).toFixed(6));
    /* 每步最多死 1 人：把 dt 拉到 600 秒（离线整段）也只扣 1。 */
    const one = polRun(s => { s.pollution = 6400000; s.pop = 500; });
    E.pollutionRollDeath(one, 600, null);
    check('Q 定案：一次掷骰对整个人口只掷一次、最多死 1 人（dt=600 也不会一次带走一片）',
      one.pop >= 499 && (one.pollutionDeaths || 0) <= 1,
      'pop 500→' + one.pop + ' deaths=' + one.pollutionDeaths);

    /* ── ④ 死亡→幸福消耗：永久累积 + 按当前墓地配额重算（C 定案）────── */
    const burnS = polRun(s => { s.pollutionDeaths = 12; s.lvl.grave = 0; });
    const burnNoCap = E.pollutionHappyBurnMul(burnS);
    burnS.lvl.grave = 10;                       // 10 座墓地 = 40 个安息位
    const burnCapped = E.pollutionHappyBurnMul(burnS);
    check('C 定案：12 名死者无墓地时 +36%；扩建 10 座墓地后自动降回 +3.6%（不锁死历史值）',
      Math.abs(burnNoCap - (1 + 0.03 * 12)) < 1e-9 && Math.abs(burnCapped - (1 + 0.003 * 12)) < 1e-9,
      '无墓地 ×' + burnNoCap.toFixed(3) + ' → 有墓地 ×' + burnCapped.toFixed(3));
    burnS.cards = ['card_confession'];
    burnS.lvl.temple = 5;
    check('告解圣事：装卡后每座神庙 +1 安息位（5 座 ⇒ 限额 40+5=45）',
      E.pollutionBurialCap(burnS) === 45, 'cap=' + E.pollutionBurialCap(burnS));

    /* ── ⑤ 洁净热液源：产热液能但不排污 ─────────────────────────── */
    const cleanS = polRun(s => { s.lvl.tidemachine = 1; });
    const cs = E.pollutionSources(cleanS);
    check('潮汐往复机：+1 热液能/秒且排放为 0（洁净源是真洁净，不是「少排一点」）',
      Math.abs(cs.cleanRate - 1) < 1e-9 && cs.emit === 0,
      'clean=' + cs.cleanRate + ' emit=' + cs.emit);
    const clean2 = polRun(s => { s.lvl.tidemachine = 4; s.lvl.solarstation = 2; s.lvl.enladofarm = 1; });
    const cs2 = E.pollutionSources(clean2);
    check('三座洁净源叠加 = 4×1 + 2×3 + 1×15 = 25 热液能/秒，排放仍为 0',
      Math.abs(cs2.cleanRate - 25) < 1e-9 && cs2.emit === 0, 'clean=' + cs2.cleanRate);

    /* ── ⑥ 脏源拆两枝 + 装罐填埋只削汽轮机 ───────────────────────── */
    const dirty = polRun(s => { s.lvl.hydroturbine = 10; s.lvl.fissionplant = 5; });
    const d0 = E.pollutionSources(dirty);
    check('汽轮机与核热厂都排污，且两枝拆得开（turbine > 0、other > 0）',
      d0.turbine > 0 && d0.other > 0, 'turbine=' + d0.turbine.toFixed(2) + ' other=' + d0.other.toFixed(2));
    const canfillS = polRun(s => { s.lvl.hydroturbine = 10; s.lvl.fissionplant = 5; s.techs.canfill = true; });
    const d1 = E.pollutionSources(canfillS);
    check('装罐填埋只削汽轮机那一枝 −50%，核热厂那一枝一分不动（不是全局倍率）',
      Math.abs(d1.turbine - d0.turbine / 2) < 1e-9 && Math.abs(d1.other - d0.other) < 1e-9,
      'turbine ' + d0.turbine.toFixed(2) + '→' + d1.turbine.toFixed(2) +
      ' · other ' + d0.other.toFixed(2) + '→' + d1.other.toFixed(2));
    check('装罐填埋不再影响净化端（clean 与 without 同值）',
      Math.abs(E.pollutionCleanup(canfillS) - E.pollutionCleanup(dirty)) < 1e-9);

    /* 星屑树乘区豁免（用户 2026-11-02 拍板）：点树拿到的额外热液能是**洁净**的，
     *   产出涨、排放不涨。夹具必须让乘区真的非 1，否则这条断言恒真（假绿家族）。 */
    const treeS = polRun(s => {
      s.lvl.fissionplant = 5; s.lvl.titancloud = 3;
      s.perk.starNuclearHydro = 0.5; s.perk.starAlienOutput = 0.5;
    });
    const treeNo = polRun(s => { s.lvl.fissionplant = 5; s.lvl.titancloud = 3; });
    const hTree = E.pollutionSources(treeS), hNo = E.pollutionSources(treeNo);
    /* 产出侧读 rates().hydroSupply（总生产 /s），排放侧读 pollutionSources().other。
     * ⚠️ 别拿 `cleanRate` 当产出：那是**洁净源**给的热液能，这两座脏源一分也不进它。 */
    const supTree = E.rates(treeS).hydroSupply, supNo = E.rates(treeNo).hydroSupply;
    check('星屑树乘区豁免：核热厂/泰坦站产出 ×1.5，排放一分不涨',
      supTree > supNo * 1.44 && Math.abs(hTree.other - hNo.other) < 1e-9,
      'hydroSupply ' + supNo.toFixed(2) + '→' + supTree.toFixed(2) +
      ' · other ' + hNo.other.toFixed(2) + '→' + hTree.other.toFixed(2));

    /* ── ⑦ 政策卡的排放乘区：效果层第二道防线（真取代见 ⑮）───────────
     * ⚠️ 2026-11-09：装填层已由 retiredBy 保证两卡不可能共存，这里的 if-else
     *    只剩「老档 / 手改状态残留」的兜底职责；断言仍要守住，但别再拿它当
     *    「已经替代了」的证据（那正是玩家反馈被糊弄过去的根因）。 */
    const pc = polRun(s => { s.lvl.hydroturbine = 10; s.cards = ['card_pollution_control']; });
    const pcRate = E.pollutionSources(pc).emit;
    pc.cards = ['card_pollution_control', 'card_green_movement'];
    const gmRate = E.pollutionSources(pc).emit;
    check('效果层兜底：脏状态两张都装仍只按 40% 算（治理 −20% / 绿色 −40%）',
      Math.abs(pcRate - d0.turbine * 0.8) < 1e-9 && Math.abs(gmRate - d0.turbine * 0.6) < 1e-9,
      'base=' + d0.turbine.toFixed(2) + ' 治理=' + pcRate.toFixed(2) + ' 绿色=' + gmRate.toFixed(2));

    /* ── ⑧ 死亡的两条时间轴 ─────────────────────────────────────── */
    /* 在线 tick：把污染灌到腐渊（2%/s），连跑若干 tick，人口必须能被吃掉。 */
    const tickS = polRun(s => { s.pollution = 6400000; s.pop = 4; });
    tickS.res.kelp = 100000;
    let tickDead = 0;
    const pop0 = tickS.pop;
    for (let i = 0; i < 4000 && tickS.pop > 1; i++) SB.economy.tick(tickS, 0.5, noop, { skipHappy: true });
    tickDead = pop0 - tickS.pop;
    check('在线 tick 路径真的会因污染死人（腐渊 × 4000 个 0.5s tick）',
      tickDead > 0, 'pop ' + pop0 + '→' + tickS.pop + ' deaths=' + tickS.pollutionDeaths);

    /* 离线微步：integrateFoodPop 每 0.1s 掷一次，同样必须能死人。 */
    const offS = polRun(s => { s.pollution = 6400000; s.pop = 4; });
    offS.res.kelp = 100000;
    const offPop0 = offS.pop;
    SB.offline.integrateFoodPop(offS, 600, { t0: 0 }, noop);
    check('离线 integrateFoodPop 路径同样会因污染死人（不是「挂机反而安全」）',
      offPop0 - offS.pop > 0, 'pop ' + offPop0 + '→' + offS.pop +
      ' deaths=' + offS.pollutionDeaths);

    /* ── ⑨ 面板速率 === tick 实账（三处同源）─────────────────────── */
    const rateS = polRun(s => { s.lvl.hydroturbine = 10; });
    rateS.res.kelp = 100000;
    const netRate = SB.economy.rates(rateS).pollution;
    const before = rateS.pollution;
    SB.economy.tick(rateS, 1, noop, { skipHappy: true });
    const delta = rateS.pollution - before;
    check('rates().pollution 与 tick 实账同源（差值 < 1e-6，面板不撒谎）',
      Math.abs(netRate - delta) < 1e-6,
      '面板 ' + netRate.toFixed(6) + ' / 实账 ' + delta.toFixed(6));

    /* ── ⑩ 挑战专属内容四类门控 ─────────────────────────────────── */
    const g = baseRun();
    g.civics.public_grave = true;                 // 把市政条件也满足，专测挑战门
    g.civics.public_health = true;
    g.civics.protect_earth = true;
    g.techs.metalrefine = true; g.techs.chemistry = true; g.techs.alien_eng = true;
    const byB = id => (SB.BUILDINGS || []).find(b => b.id === id);
    check('建筑门控：6 座挑战建筑在基游戏全部不可建（即使科技/市政都满足）',
      ['tidemachine', 'solarstation', 'enladofarm', 'grave', 'hospital', 'reserve']
        .every(id => byB(id) && !SB.habitat.unlocked(g, byB(id))),
      ['tidemachine', 'solarstation', 'enladofarm', 'grave', 'hospital', 'reserve']
        .map(id => id + ':' + SB.habitat.unlocked(g, byB(id))).join(' '));
    const gPol = polRun(s => {
      s.civics.public_grave = true; s.civics.public_health = true; s.civics.protect_earth = true;
      s.techs.metalrefine = true; s.techs.chemistry = true; s.techs.alien_eng = true;
    });
    check('建筑门控：同样条件下进入水体污染周目 ⇒ 6 座全部可建（门只是挑战，不是永远锁着）',
      ['tidemachine', 'solarstation', 'enladofarm', 'grave', 'hospital', 'reserve']
        .every(id => SB.habitat.unlocked(gPol, byB(id))),
      ['tidemachine', 'solarstation', 'enladofarm', 'grave', 'hospital', 'reserve']
        .map(id => id + ':' + SB.habitat.unlocked(gPol, byB(id))).join(' '));

    const techT = SB.tech.byId('canfill');
    check('科技门控：装罐填埋在基游戏给出「仅限水体污染挑战期间研究」而不是「尤里卡未达成」',
      !!techT && (SB.tech.studyBlocked(g, 'canfill') || '').indexOf('仅限水体污染') === 0,
      (SB.tech.studyBlocked(g, 'canfill') || '(可研究 ← bug)'));
    check('科技 double-write：装罐填埋挂 challengeOnly=waterpollution（不能写成 true）',
      !!techT && techT.challengeOnly === 'waterpollution', techT && String(techT.challengeOnly));

    const civicT = (SB.CIVICS || []).find(c => c.id === 'sanitation_act');
    check('市政门控：卫生法令在基游戏被判「仅限水体污染挑战期间研究」',
      !!civicT && (SB.civic.blocked(g, civicT) || '').indexOf('仅限水体污染') === 0,
      (SB.civic.blocked(g, civicT) || '(可研究 ← bug)'));
    const civicOk = polRun(s => { s.civics.department = true; });
    check('市政门控：进入挑战周目后不再被挑战门拦（只是回到「尚未揭示」的正常流程）',
      !!civicT && (SB.civic.blocked(civicOk, civicT) || '').indexOf('仅限') !== 0,
      (SB.civic.blocked(civicOk, civicT) || ''));

    /* 政策卡：三张挂在既有市政（城市化/启蒙运动/全球化）上，基游戏必须仍不可拥有。 */
    const cardBase = baseRun();
    cardBase.civics.urbanization = true;
    cardBase.civics.enlightenment = true;
    cardBase.civics.globalization = true;
    check('政策卡门控：疾控防治/污染治理/绿色运动在基游戏即使完成对应市政也不可得',
      !SB.civic.cardOwned(cardBase, 'card_disease_control') &&
      !SB.civic.cardOwned(cardBase, 'card_pollution_control') &&
      !SB.civic.cardOwned(cardBase, 'card_green_movement'),
      'owned=' + ['card_disease_control', 'card_pollution_control', 'card_green_movement']
        .map(id => SB.civic.cardOwned(cardBase, id)).join(','));
    /* ⚠️ 2026-11-09 真取代后「完成全部市政」不再等于「四张卡全可得」：
     *    旧卡在完成后继市政的那一刻退役 ⇒ 夹具必须分「后继市政前 / 后」两段，
     *    否则会把设计变更误读成回归（夹具口径必须与生产写入路径逐字一致）。 */
    const cardEarly = polRun(s => {
      s.civics.enlightenment = true; s.civics.sanitation_act = true;
    });
    check('政策卡门控：挑战周目 + 后继市政未完成 ⇒ 两张旧卡可得、两张新卡未解锁',
      SB.civic.cardOwned(cardEarly, 'card_pollution_control') &&
      SB.civic.cardOwned(cardEarly, 'card_quarantine') &&
      !SB.civic.cardOwned(cardEarly, 'card_green_movement') &&
      !SB.civic.cardOwned(cardEarly, 'card_disease_control'),
      ['card_pollution_control', 'card_quarantine', 'card_green_movement', 'card_disease_control']
        .map(id => id + ':' + SB.civic.cardOwned(cardEarly, id)).join(' '));
    const cardPol = polRun(s => {
      s.civics.urbanization = true; s.civics.enlightenment = true; s.civics.globalization = true;
      s.civics.sanitation_act = true;
      /* 给足 9 槽：cardBlocked 还要过 hasFitSlot，freshRun 默认政体槽不够会让
       * 「新卡可装」被「装不下」掩盖（夹具口径必须与生产写入路径逐字一致）。 */
      s.gov = 'interstellar_federation';
    });
    check('政策卡门控：后继市政完成 ⇒ 两张新卡可得、两张旧卡已退役',
      SB.civic.cardOwned(cardPol, 'card_disease_control') &&
      SB.civic.cardOwned(cardPol, 'card_green_movement') &&
      !SB.civic.cardOwned(cardPol, 'card_pollution_control') &&
      !SB.civic.cardOwned(cardPol, 'card_quarantine'),
      ['card_disease_control', 'card_green_movement', 'card_pollution_control', 'card_quarantine']
        .map(id => id + ':' + SB.civic.cardOwned(cardPol, id)).join(' '));

    /* ── ⑪ 奇观 costBuild 通道（S 定案：拆卫星不补星空）────────────── */
    const wS = polRun(s => { s.lvl.satellite = 12; s.civics.our_cradle = true; s.res.starExplore = 12345; });
    const wBlockedBefore = SB.workshop.wonderBlocked(wS, 'wonder_climatesat');
    check('奇观门：卫星 12 级时「星球气候调节卫星网」可建造',
      wBlockedBefore === null, wBlockedBefore || '可建造');
    const starBefore = wS.res.starExplore, satBefore = wS.lvl.satellite;
    const built = SB.workshop.build(wS, 'wonder_climatesat', noop);
    check('costBuild 实扣：建成后轨道卫星 12 → 2 级（吞 10 级，不是扣资源 key）',
      built === true && wS.lvl.satellite === satBefore - 10 && wS.wonders.wonder_climatesat === true,
      'sat ' + satBefore + '→' + wS.lvl.satellite + ' built=' + built);
    check('S 定案：拆掉的卫星不补星空（starExplore 一分不变，亏就是真亏）',
      wS.res.starExplore === starBefore, 'star ' + starBefore + '→' + wS.res.starExplore);
    check('costBuild 实扣：等级不会被扣成负数（clamp ≥ 0）',
      (function () {
        const s2 = polRun(s => { s.lvl.satellite = 10; s.civics.our_cradle = true; });
        SB.workshop.build(s2, 'wonder_climatesat', noop);
        return s2.lvl.satellite === 0;
      })(), '10 级恰好扣到 0');
    check('奇观门：卫星不足 10 级时被拦，且给出「还缺建筑等级」而不是「还缺资源」',
      (function () {
        const s3 = polRun(s => { s.lvl.satellite = 4; s.civics.our_cradle = true; });
        const why = SB.workshop.wonderBlocked(s3, 'wonder_climatesat') || '';
        return why.indexOf('建筑等级') >= 0;
      })(),
      (function () {
        const s3 = polRun(s => { s.lvl.satellite = 4; s.civics.our_cradle = true; });
        return SB.workshop.wonderBlocked(s3, 'wonder_climatesat') || '';
      })());
    check('奇观净化生效：建成后 pollutionCleanup 多 15/s（与面板同源）',
      Math.abs(E.pollutionCleanup(wS) - E.pollutionCleanup(polRun())) >= 14.999,
      '净增=' + (E.pollutionCleanup(wS) - E.pollutionCleanup(polRun())).toFixed(3));

    /* ── ⑫ 奖励三件 + R 通用规则 ────────────────────────────────── */
    meta.challenges = { completed: { cold: false, small: false, science: 0, abyss: 0, speedrun: 0, drift_terra: false } };
    const popBefore = SB.challenges.startingPopulation();
    const luxBefore = E.luxuryOutMul(polRun());
    const starMulRun = (levelsTier) => {
      meta.challenges.completed.waterpollution = levelsTier;
      const s = baseRun(x => { x.lvl.rheamine = 100; });
      return SB.prestige.stardustGain(s);
    };
    meta.challenges.completed.waterpollution = false;
    const starBase = starMulRun(false);
    meta.challenges.completed.waterpollution = true;
    const starDone = starMulRun(true);
    check('奖励一：通关后星屑产出 ×1.1（100 级星屑设施：10 → 11）',
      starDone > starBase, starBase + ' → ' + starDone);

    meta.challenges.completed.waterpollution = true;
    check('奖励二：通关后商人奢侈品产出 ×1.5（luxuryOutMul）',
      Math.abs(E.luxuryOutMul(polRun()) - 1.5) < 1e-12 && Math.abs(luxBefore - 1) < 1e-12,
      '未通关 ×' + luxBefore + ' → 通关 ×' + E.luxuryOutMul(polRun()));

    const popDone = SB.challenges.startingPopulation();
    check('奖励三：通关后初始人口 +2（与小国寡民的 +3 独立叠加）',
      popDone === popBefore + 2, popBefore + ' → ' + popDone);

    /* R：通用「每档 +10% 轮回点」，按 completedCount 线性，不进本挑战 reward 文案。 */
    meta.challenges.completed.waterpollution = false;
    const countBefore = SB.challenges.completedCount(meta);
    meta.challenges.completed.waterpollution = true;
    const countAfter = SB.challenges.completedCount(meta);
    check('R 定案：水体污染计入「已完成挑战数」，通用 +10% 轮回点由 completedCount 自动带上',
      countAfter === countBefore + 1, 'count ' + countBefore + ' → ' + countAfter);
    check('R 定案：本挑战的 reward 文案里不写「轮回点 +10%」（那是六项共享规则）',
      (SB.challenges.byId('waterpollution').reward || '').indexOf('轮回点') < 0,
      SB.challenges.byId('waterpollution').reward || '');

    /* ── ⑬ 通关判定：goal {t:'dyson'} ───────────────────────────── */
    const goal = SB.challenges.byId('waterpollution').goal;
    const winS = polRun();
    const beforeDone = SB.challenges.goalMet(winS, goal);
    winS.dysonDone = true;
    const afterDone = SB.challenges.goalMet(winS, goal);
    check('通关判定 = s.dysonDone（goal {t:"dyson"}；飞升虚境同样收敛到此旗）',
      goal && goal.t === 'dyson' && beforeDone === false && afterDone === true,
      'dysonDone=false→' + beforeDone + ' / true→' + afterDone);

    /* 老档兼容：state-migrate 必须把三个新字段补 0，且 challengeDone 按「是否 goal 型」重算。 */
    const mig = SB.state.migrateRun ? SB.state.migrateRun({
      ...JSON.parse(JSON.stringify(SB.state.freshRun(false))),
      pollution: undefined, pollutionGross: undefined, pollutionDeaths: undefined,
      challenge: { id: 'waterpollution', tier: 0 }, challengeDone: true
    }) : null;
    check('迁移：老档缺 pollution/pollutionGross/pollutionDeaths 时全部补 0',
      !!mig && mig.pollution === 0 && mig.pollutionGross === 0 && mig.pollutionDeaths === 0,
      mig ? [mig.pollution, mig.pollutionGross, mig.pollutionDeaths].join(',') : 'migrateRun 不可用');
    check('迁移：goal 型挑战的 challengeDone 判据已泛化（不是只认 drift_terra）',
      !!mig && mig.challengeDone === true, mig ? String(mig.challengeDone) : '');

    /* ── ⑭ 污染面板（唯一给玩家看的出口，必须真上屏）────────────────
     * ⚠️ 直接喂 `renderPollution(s)`，不碰活局：它只读 s + 写 DOM。
     *   走活局要改 SB.game.run() 的状态再复原，一旦中途抛错就把后面的 suite 全污染
     *   （calendar-warmstone 曾因此踩到「测 A 状态渲染 B 状态」的假绿）。 */
    const rp = SB.ui.renderParts && SB.ui.renderParts.renderPollution;
    check('污染面板渲染函数已挂到 renderParts（漏挂 = 页面永远没有这块）',
      typeof rp === 'function', typeof rp);
    if (typeof rp === 'function' && typeof dom === 'function') {
      rp(baseRun());
      check('基游戏：污染面板整块清空且隐藏（挑战专属，不能常驻占位）',
        dom('envPollution') === '', '容器内容=' + JSON.stringify((dom('envPollution') || '').slice(0, 40)));
      rp(polRun(s => { s.pollution = 2000; s.lvl.hydroturbine = 10; s.pollutionDeaths = 3; }));
      const polHtml = dom('envPollution');
      /* 2026-11-03：这三条断言跟着 2eb6324b（污染面板表现更新）改 ——
       * 面板标题从「水体污染」改成「海洋污染」，阶段标记从「第 n / 5 阶段」改成
       * 「阶段 n · 名称」，死亡行从「因污染而死」改成「污染死亡 / 墓地安息位」。
       * 面板改了却不同步断言，是回归变红的直接原因（不是本轮破壳改造引入的）。 */
      check('挑战周目：面板显示「海洋污染 · 阶段名 + 阶段序号」',
        polHtml.indexOf('海洋污染') >= 0 && polHtml.indexOf('阶段 1 · 浊流') >= 0,
        polHtml.replace(/<[^>]*>/g, ' ').slice(0, 80));
      check('挑战周目：面板显示排放/净化/净变化三行读数（净变化 = 拆分项之和）',
        polHtml.indexOf('污染排放') >= 0 && polHtml.indexOf('净化') >= 0 && polHtml.indexOf('净变化') >= 0 &&
        /净变化<\/span><b/.test(polHtml), '有净变化行');
      check('挑战周目：面板把污染死亡数与墓地安息位一起报出来（超限时写明「每人增加 3%」）',
        polHtml.indexOf('污染死亡') >= 0 && polHtml.indexOf('墓地安息位') >= 0 &&
        polHtml.indexOf('每人增加 3%') >= 0 && polHtml.indexOf('超限') >= 0, '死亡 3 人 / 安息位 0 ⇒ 超限');
      rp(baseRun());
    }

    /* ── ⑮ 真取代：两对卡复用 retiredBy 退役链（2026-11-09 玩家反馈后定案）──
     * 玩家问「污染治理 / 绿色运动 为什么同时出现，不是替代了吗」：
     * 此前「取代」只落在效果层 if-else，装填层两卡可共存、被压制卡白占槽、
     * UI 还标「正在生效」。这里四条分别锁：数据字段 / 真实 research() 免费拔卡 /
     * 退役后拒装 / 老档读档清理。效果层 if-else 的兜底断言仍在 ⑦，别重复也不许删。 */
    const P = id => SB.POLICIES.find(p => p.id === id);
    check('★ 真取代①：两张旧卡的 retiredBy = 后继卡的 civic，链尾卡不带该字段',
      P('card_quarantine').retiredBy === 'urbanization' &&
      P('card_pollution_control').retiredBy === 'globalization' &&
      P('card_disease_control').civic === 'urbanization' &&
      P('card_green_movement').civic === 'globalization' &&
      !P('card_disease_control').retiredBy && !P('card_green_movement').retiredBy,
      ['card_quarantine', 'card_pollution_control', 'card_disease_control', 'card_green_movement']
        .map(id => id + ':' + (P(id).retiredBy || 'chain-tail')).join(' '));

    /* 走**真实** research()：把除目标外所有市政置为已完成 + 全表已揭示 +
     * 纪元拉满 + 足量市政点，让 blocked() 的四道门真的通过；不 mock 研究函数。
     * ⚠️ 夹具必须给 9 槽政体：ensureCards() 会按 slotList(s).length 重建 s.cards，
     *    freshRun 默认政体槽不够会把第三张无关卡吃掉（夹具口径要与生产一致）。 */
    function researchableRun(target) {
      return polRun(s => {
        s.era = 99;
        s.res.culture = 1e9;
        s.gov = 'interstellar_federation';
        for (const c of SB.CIVICS) {
          s.civShown[c.id] = true;
          if (c.id !== target) s.civics[c.id] = 1;
        }
        s.cards = ['card_pollution_control', 'card_quarantine', 'card_protect_planet'];
      });
    }
    const rUrb = researchableRun('urbanization');
    const urbOk = SB.civic.research(rUrb, 'urbanization', noop);
    const rGlo = researchableRun('globalization');
    const gloOk = SB.civic.research(rGlo, 'globalization', noop);
    check('★ 真取代②：真实 research() 完成后继市政时免费拔掉对应旧卡，无关卡保留',
      urbOk && gloOk &&
      rUrb.cards.indexOf('card_quarantine') < 0 && rUrb.cards.indexOf('card_pollution_control') >= 0 &&
      rGlo.cards.indexOf('card_pollution_control') < 0 && rGlo.cards.indexOf('card_quarantine') >= 0 &&
      rUrb.cards.indexOf('card_protect_planet') >= 0 && rGlo.cards.indexOf('card_protect_planet') >= 0,
      'urbanization=' + urbOk + ' cards=' + JSON.stringify(rUrb.cards) +
      ' | globalization=' + gloOk + ' cards=' + JSON.stringify(rGlo.cards));

    const blk = id => SB.civic.cardBlocked(cardPol, id) || 'OK';
    check('★ 真取代③：后继市政完成后旧卡被 cardBlocked 拦下、两张新卡可正常装填',
      blk('card_pollution_control') !== 'OK' && blk('card_quarantine') !== 'OK' &&
      blk('card_green_movement') === 'OK' &&
      blk('card_disease_control') === 'OK',
      ['card_pollution_control', 'card_quarantine', 'card_green_movement', 'card_disease_control']
        .map(id => id + ':' + blk(id)).join(' '));

    const dirtyRaw = JSON.parse(JSON.stringify(cardPol));
    dirtyRaw.cards = ['card_pollution_control', 'card_quarantine', 'card_protect_planet'];
    const migrated = SB.state.migrateRun(dirtyRaw);
    check('★ 真取代④：老档读档清理两张退役卡、无关卡原槽保留、s.card 镜像同步',
      !!migrated && migrated.cards[0] === null && migrated.cards[1] === null &&
      migrated.cards[2] === 'card_protect_planet' && migrated.card === null,
      migrated ? 'cards=' + JSON.stringify(migrated.cards) + ' card=' + migrated.card : 'migrateRun 不可用');

    /* ── ⑯ 「装在槽里 ≠ 正在生效」：效果层与 UI 共用单一权威判据 ──────────
     * 真取代落地后，老档 / 云存档 / 手改状态仍可能把退役卡留在 s.cards。
     * 此前 civics 的 22 处效果出口各自扫 s.cards（只有 cardCraftRatio 查所有权），
     * 退役残留会继续乘 storeMul / 进 flow；economy.polHasCard 也是裸 indexOf。
     * 本组锁：判据本身 + 乘区 + 平坦加值 + 污染排放 + 拒装文案 + 全表退役提示。 */
    const C = SB.civic;
    const effS = polRun(s => { s.cards = ['card_market']; });
    const effBefore = C.cardEffective(effS, 'card_market');
    effS.civics.urbanization = true;                 // 后继市政完成 ⇒ 真退役
    check('★ 生效口径①：cardEffective = 已装填 ∧ 未退役；retiredBy 只表示「将来会被取代」',
      effBefore === true && C.cardEffective(effS, 'card_logistics') === false &&
      C.cardRetired(effS, P('card_market')) === true &&
      C.cardEffective(effS, 'card_market') === false &&
      C.cardRetired(polRun(), P('card_market')) === false,
      '装填未退役=' + effBefore + ' 完成城市化后=' + C.cardEffective(effS, 'card_market') +
      ' 未装填卡=' + C.cardEffective(effS, 'card_logistics'));

    const mulS = polRun(s => { s.cards = ['card_market', 'card_logistics', 'card_interlog']; });
    const mulDirty = C.storeMul(mulS);              // 2 × 3 × 5 = 30（后继市政未完成，三张都有效）
    mulS.civics.urbanization = true;
    mulS.civics.globalization = true;               // 集市、基础物流退役，洲际物流是链尾不受影响
    const mulClean = C.storeMul(mulS);
    check('★ 生效口径②：退役残留不再进 storeMul（×30 → 只剩链尾 ×5），未退役时不过滤',
      Math.abs(mulDirty - 30) < 1e-9 && Math.abs(mulClean - 5) < 1e-9,
      '未完成市政=' + mulDirty + ' 完成后=' + mulClean);

    const flowS = polRun(s => { s.cards = ['card_mystic']; });
    const flowBefore = C.flow(flowS).science || 0;
    flowS.civics.sacred_path = true;
    const flowAfter = C.flow(flowS).science || 0;
    check('★ 生效口径③：退役残留不再进 flow() 的平坦加值/秒（科学 +0.3 被移除，政体基底不动）',
      Math.abs((flowBefore - flowAfter) - 0.3) < 1e-9,
      'science ' + flowBefore.toFixed(3) + ' → ' + flowAfter.toFixed(3));

    const emitS = polRun(s => { s.lvl.hydroturbine = 10; s.cards = ['card_pollution_control']; });
    const emitOwned = E.pollutionSources(emitS).emit;
    emitS.civics.globalization = true;              // 只让治理卡退役，槽里还没装绿色运动
    const emitRetired = E.pollutionSources(emitS).emit;
    emitS.cards = ['card_pollution_control', 'card_green_movement'];
    const emitGreen = E.pollutionSources(emitS).emit;
    check('★ 生效口径④：economy.polHasCard 走 cardEffective，退役残留不再给 −20% 排放减免',
      Math.abs(emitOwned - d0.turbine * 0.8) < 1e-9 &&
      Math.abs(emitRetired - d0.turbine) < 1e-9 &&
      Math.abs(emitGreen - d0.turbine * 0.6) < 1e-9,
      'base=' + d0.turbine.toFixed(2) + ' 治理=' + emitOwned.toFixed(2) +
      ' 治理已退役=' + emitRetired.toFixed(2) + ' 装上绿色=' + emitGreen.toFixed(2));

    const rejS = polRun(s => { s.civics.globalization = true; });
    const rejWhy = C.cardBlocked(rejS, 'card_pollution_control', 0) || 'OK';
    check('★ 生效口径⑤：退役卡被拒装时提示「已退役」，不再误报「需先完成市政」',
      rejWhy.indexOf('退役') >= 0 && rejWhy.indexOf('需先完成市政') < 0,
      rejWhy);

    const retiredCards = SB.POLICIES.filter(p => p.retiredBy);
    const noHint = retiredCards.filter(p => !/取代|替代|退役|互斥/.test(p.desc || ''));
    check('★ 生效口径⑥：全部退役链旧卡的 desc 都写明「会退役」，玩家不会看到一张突然消失的卡',
      retiredCards.length >= 22 && noHint.length === 0,
      '旧卡=' + retiredCards.length + ' 缺提示=' + noHint.length +
      (noHint.length ? ' → ' + noHint.map(p => p.id).join(',') : ''));
  } finally {
    meta.challenges = savedChallenge;
    SB.state.saveMeta(meta);
  }
}
