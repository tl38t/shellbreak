/* e2e suite: reincarnation challenges, run restrictions, rewards, and settlement gates. */
export function run({ SB, check, noop }) {
  console.log('\n=== 轮回挑战 ===');
  const meta = SB.game.meta();
  const savedProgress = JSON.parse(JSON.stringify(meta.challenges || {}));
  const savedAchv = JSON.parse(JSON.stringify(meta.achv || {}));
  const savedAchievements = JSON.parse(JSON.stringify(meta.achievements || {}));
  const savedChallengePopupPending = meta.challengePopupPending;
  const empty = () => ({ completed: { cold: false, small: false, science: 0, abyss: 0, speedrun: 0, drift_terra: false } });
  try {
    meta.challenges = empty();
    const api = SB.challenges;
    let s = SB.state.freshRun(false);

    check('六类挑战已注册，分档挑战只开放顺序下一档', api.list().length === 6 &&
      api.canStart('science', s, meta) && !api.canStart('science', s, { challenges: { completed: { science: 3 } } }),
      '挑战数=' + api.list().length);
    let pane = SB.ui.render.paneChallenges();
    check('挑战独立页展示六项挑战与首次开始入口',
      ['寒流禁火', '小国寡民', '忽视科文', '深渊重压', '流浪泰拉'].every(name => pane.includes(name)) &&
      pane.includes('暖石产出 -30%') && pane.includes('学者、书手各 ≤ 15 人') &&
      pane.includes('总人口、职业人数门槛豁免') &&
      (pane.match(/data-challenge-start=/g) || []).length === 6,
      '开始入口=' + ((pane.match(/data-challenge-start=/g) || []).length));
    check('挑战页总说明不再误称所有挑战都要完成神学并破壳',
      !pane.includes('完成《神学》资格并凿穿天壳，才算挑战通关') && pane.includes('各项挑战有各自的目标'),
      '通关说明按各挑战目标执行');
    const liveRun = SB.game.run();
    const savedLiveChallenge = liveRun.challenge, savedLiveChallengeDone = liveRun.challengeDone;
    liveRun.challenge = { id: 'drift_terra', tier: 0 };
    liveRun.challengeDone = false;
    const activePane = SB.ui.render.paneChallenges();
    check('流浪泰拉挑战卡说明目标达成时立即发奖',
      activePane.includes('达成目标时永久奖励会立即生效') &&
      activePane.includes('行星发动机 0 / 50'));
    liveRun.challenge = savedLiveChallenge;
    liveRun.challengeDone = savedLiveChallengeDone;
    {
      const drift = SB.state.freshRun(false);
      drift.challenge = { id: 'drift_terra', tier: 0 };
      drift.lvl.terra_engine = 50;
      drift.res.coreCharge = 50000000;
      drift.shell = 0; drift.broken = true;
      const lockedLengths = SB.economy.lockSeasonLengths(drift, empty());
      const outcome = api.evaluate(drift, meta);
      const repeated = api.evaluate(drift, meta);
      check('流浪泰拉目标同时要求 50 座发动机与 50M 炉芯池，破壳状态不影响达成结算',
        !!outcome && outcome.id === 'drift_terra' && drift.challengeDone === true &&
        meta.challenges.completed.drift_terra === true && meta.challengePopupPending === outcome &&
        api.resolveRun(drift, meta) === null,
        outcome ? outcome.goalText : '未达成');
      check('流浪泰拉奖励幂等，已达成后重复 evaluate 不会再次发奖', repeated === null &&
        api.evaluate(drift, meta) === null, '重复 evaluate 返回 null');
      check('挑战起始寒流季为 1200 秒，奖励入账后本局即时降为 600 秒',
        lockedLengths[2] === 1200 && drift.seasonLengths[2] === 600,
        lockedLengths.join('/') + ' → ' + drift.seasonLengths.join('/'));
    }
    {
      const regular = SB.state.freshRun(false);
      regular.challenge = { id: 'drift_terra', tier: 0 };
      const withoutReward = SB.economy.lockSeasonLengths(regular, empty());
      const afterRewardMeta = { challenges: empty() };
      afterRewardMeta.challenges.completed.drift_terra = true;
      const rewarded = SB.economy.lockSeasonLengths(SB.state.freshRun(false), afterRewardMeta);
      check('季长奖励：普通周目寒流季 300 秒，奖励与挑战叠加后 600 秒',
        withoutReward[2] === 1200 && rewarded[2] === 300 &&
        SB.economy.lockSeasonLengths(regular, afterRewardMeta)[2] === 600,
        withoutReward[2] + ' / ' + rewarded[2] + ' / ' + regular.seasonLengths[2]);
    }
    {
      const base = SB.state.freshRun(false);
      const challenge = SB.state.freshRun(false);
      challenge.challenge = { id: 'drift_terra', tier: 0 };
      base.sunSails = challenge.sunSails = 100;
      const baseRate = SB.economy.hydroAlloc(base, 1).sunSailRate;
      const challengeRate = SB.economy.hydroAlloc(challenge, 1).sunSailRate;
      check('流浪泰拉太阳帆热液能减半（相同帆数）',
        baseRate > 0 && Math.abs(challengeRate / baseRate - 0.5) < 1e-9,
        baseRate + ' / ' + challengeRate);
    }
    {
      const mainline = SB.state.freshRun(false);
      const challenge = SB.state.freshRun(false);
      mainline.era = challenge.era = 10;
      mainline.eureka.mwconverge = challenge.eureka.mwconverge = true;
      mainline.eurekaMet.mwconverge = challenge.eurekaMet.mwconverge = true;
      mainline.techs.microwave_heat = challenge.techs.microwave_heat = true;
      mainline.sunSails = challenge.sunSails = 1000;
      mainline.res.science = challenge.res.science = 1e9;
      challenge.challenge = { id: 'drift_terra', tier: 0 };
      const studies = [];
      for (let i = 0; i < 5; i++) studies.push(SB.tech.study(mainline, 'mwconverge', noop));
      check('微波收敛可在主线研究五级，并按等级提高太阳帆热液能',
        studies.every(Boolean) && mainline.techLv.mwconverge === 5 &&
        SB.tech.level(mainline, 'mwconverge') === 5 &&
        SB.tech.studyBlocked(mainline, 'mwconverge') === '已掌握' &&
        SB.economy.hydroAlloc(mainline, 1).sunSailRate > SB.economy.hydroAlloc(challenge, 1).sunSailRate,
        '研究=' + studies.join('/') + ' 等级=' + (mainline.techLv.mwconverge || 0));
    }
    {
      const mainline = SB.state.freshRun(false);
      const challenge = SB.state.freshRun(false);
      mainline.era = challenge.era = 10;
      mainline.eureka.reheavfusion = true;
      mainline.eurekaMet.reheavfusion = true;
      mainline.techs.winter = mainline.techs.nuclear_fusion = true;
      mainline.res.science = 1e9;
      challenge.challenge = { id: 'drift_terra', tier: 0 };
      check('限定科技仅流浪泰拉挑战可研究，灰态原因明确',
        !SB.tech.canStudy(mainline, 'reheavfusion') &&
        SB.tech.studyBlocked(mainline, 'reheavfusion') === '仅限流浪泰拉挑战期间研究',
        SB.tech.studyBlocked(mainline, 'reheavfusion'));
    }
    {
      const drift = SB.state.freshRun(false);
      drift.challenge = { id: 'drift_terra', tier: 0 };
      drift.era = 9;
      SB.TECHS.filter(t => t.era < 9 || (t.era === 9 && t.id !== 'winter' && t.id !== 'mwconverge'))
        .forEach(t => { drift.techs[t.id] = true; });
      const goal = SB.aiStrategy.researchGoal(drift);
      check('自动 bot 把「严冬计划」组合尤里卡拆成当前待办的 G.E.E.K 泰拉改造',
        goal.key && goal.key.id === 'winter' && goal.cond && goal.cond.t === 'geekTerra',
        '目标=' + (goal.key && goal.key.id) + ' 条件=' + (goal.cond && goal.cond.t));
      drift.wonders = { wonder_geek: true };
      drift.geek = { geekOn: false, enceladusDone: true, terraDone: false };
      const decision = SB.aiStrategy.step(drift, { emit: noop });
      check('自动 bot 在等待泰拉改造尤里卡时启动已建成的 G.E.E.K',
        drift.geek.geekOn === true && decision.condition === 'geekTerra',
        'G.E.E.K=' + drift.geek.geekOn + ' 条件=' + decision.condition);
    }
    {
      const drift = SB.state.freshRun(false);
      drift.challenge = { id: 'drift_terra', tier: 0 };
      drift.era = 10; drift.eureka.void_altar = true;
      drift.techs.ascend_void = true; drift.res.faith = 1e9;
      drift.lvl.hall = 10; drift.res.stone = 1e9;
      check('流浪泰拉禁建虚境祭坛',
        SB.habitat.unlocked(drift, 'void_altar') === false &&
        SB.habitat.build(drift, 'void_altar', noop) === false,
        'unlocked=' + SB.habitat.unlocked(drift, 'void_altar'));
    }
    {
      const poolFirst = SB.state.freshRun(false);
      poolFirst.challenge = { id: 'drift_terra', tier: 0 };
      poolFirst.wonders = { wonder_terra_core: true };
      poolFirst.lvl.terra_vat = 1;
      poolFirst.res.coreCharge = 20;
      const before = poolFirst.res.coreCharge;
      const expected = SB.economy.hydroAlloc(poolFirst, 0.1);
      SB.economy.tick(poolFirst, 0.1, noop);
      check('水舱先从炉芯池取能，dt=0.1 时池扣 10，不重扣或漏乘 dt',
        expected.vatPoolDraw === 10 && expected.vatFlowDraw === 0 &&
        Math.abs(poolFirst.res.coreCharge - (before - 10)) < 1e-9,
        '池取=' + expected.vatPoolDraw + ' 流取=' + expected.vatFlowDraw + ' 池变化=' + (poolFirst.res.coreCharge - before));
    }
    {
      const freeze = SB.state.freshRun(false);
      freeze.challenge = { id: 'drift_terra', tier: 0 };
      const beforeCore = SB.economy.rollFreeze(freeze);
      freeze.frozen = true;
      freeze._seasonIdx = SB.economy.seasonIdx(freeze);
      freeze.wonders = { wonder_terra_core: true };
      SB.economy.seasonTurn(freeze);
      const afterCore = SB.economy.rollFreeze(freeze);
      const vat = SB.state.freshRun(false);
      vat.lvl.terra_vat = 2;
      const activeCap = SB.economy.popCap(vat);
      vat.terraVatStop = 2;
      check('流浪泰拉在炉芯建成前必定冰封；炉芯建成后解除冰封，停用水舱即刻少 40 上限',
        beforeCore === true && afterCore === false && freeze.frozen === false &&
        activeCap === SB.economy.popCap(SB.state.freshRun(false)) + 40 &&
        SB.economy.popCap(vat) === activeCap - 40,
        '冻结=' + beforeCore + '/' + afterCore + ' 人口上限=' + activeCap + '（停用后 ' + SB.economy.popCap(vat) + '）');
    }
    {
      /* 2026-10-31 用户拍：断电后上限立刻降、人口缓慢降低（不是瞬间蒸发）。 */
      const slow = SB.state.freshRun(false);
      slow.challenge = { id: 'drift_terra', tier: 0 };
      slow.lvl.terra_vat = 2;
      const fullCap = SB.economy.popCap(slow);
      slow.pop = fullCap;
      slow.res.kelp = 1e6;
      slow.terraVatStop = 2;
      const capAfterStop = SB.economy.popCap(slow);
      SB.economy.tick(slow, 0.1, noop);
      const afterTenth = slow.pop;
      SB.economy.tick(slow, 1, noop);
      const afterOne = slow.pop;
      for (let i = 0; i < 90; i++) SB.economy.tick(slow, 1, noop);
      check('水舱断电后人口按秒缓慢离场（0.1 秒不掉人、1 秒掉 2 人、最终回到上限）',
        capAfterStop === fullCap - 40 && afterTenth === fullCap && afterOne === fullCap - 2 &&
        slow.pop === capAfterStop,
        '上限 ' + fullCap + '→' + capAfterStop + ' / 人口 0.1s=' + afterTenth +
        ' 1.1s=' + afterOne + ' 最终=' + slow.pop);
    }
    {
      const base = SB.state.freshRun(false);
      base.lvl.fissionplant = 1; base.techs.nuclear_fusion = true; base.res.stone = 1000;
      const boosted = SB.state.freshRun(false);
      boosted.lvl.fissionplant = 1; boosted.techs.nuclear_fusion = true;
      boosted.upgrades.upg_reheavfusion = true; boosted.res.stone = 1000;
      const starved = SB.state.freshRun(false);
      starved.lvl.fissionplant = 1; starved.techs.nuclear_fusion = true;
      starved.upgrades.upg_reheavfusion = true; starved.res.stone = 500;
      const baseRate = SB.economy.hydroAlloc(base, 1).fissionRate;
      const full = SB.economy.hydroAlloc(boosted, 1);
      const partial = SB.economy.hydroAlloc(starved, 1);
      check('重核聚变升级耗石充足时热液能翻倍，石料短缺时按供料比例降低增产',
        full.fissionRate === baseRate * 2 && partial.fissionStoneDraw === 500 &&
        partial.fissionRate === baseRate * 1.5,
        '基础=' + baseRate + ' 满料=' + full.fissionRate + ' 半料=' + partial.fissionRate);
    }
    {
      const base = SB.state.freshRun(false);
      base.lvl.siltpit = 1; base.jobs.miner = 10;
      const crust = SB.state.freshRun(false);
      crust.lvl.siltpit = 1; crust.jobs.miner = 10; crust.upgrades.upg_crustmine = true;
      const baseRates = SB.economy.rates(base), crustRates = SB.economy.rates(crust);
      const expectedMetal = 10 * 0.05 * SB.economy.siltPitMul(crust);
      const expectedTheta = 10 * 0.005 * SB.economy.siltPitMul(crust);
      const plated = SB.state.freshRun(false);
      plated.lvl.siltpit = 1; plated.wonders = { wonder_crustplate: true };
      const plainMul = SB.economy.siltPitMul(base);
      check('地壳钻井伴生金属与 θ 生物金属；板块构件同时放大矿坑与瑞亚星产出',
        Math.abs((crustRates.silt - baseRates.silt) - expectedMetal) < 1e-9 &&
        Math.abs(crustRates.thetaMetal - expectedTheta) < 1e-9 &&
        Math.abs(SB.economy.siltPitMul(plated) / plainMul - 1.3) < 1e-9 &&
        SB.economy.rheaMul(plated) === 1.3,
        '金属=' + (crustRates.silt - baseRates.silt) + ' θ=' + crustRates.thetaMetal + ' 矿坑×' + SB.economy.siltPitMul(plated) + ' 瑞亚×' + SB.economy.rheaMul(plated));
    }
    {
      const flow = SB.state.freshRun(false);
      flow.challenge = { id: 'drift_terra', tier: 0 };
      flow.wonders = { wonder_terra_core: true };
      flow.lvl.terra_vat = 1;
      flow.sunSails = 6000;
      const before = flow.res.coreCharge;
      const expected = SB.economy.hydroAlloc(flow, 0.1).coreNetRate;
      SB.economy.tick(flow, 0.1, noop);
      check('水舱池空时占用剩余热液能流，炉芯净增速率与实际结算一致',
        expected > 0 && Math.abs((flow.res.coreCharge - before) / 0.1 - expected) < 1e-7,
        '预期=' + expected.toFixed(4) + '/秒 实得=' + ((flow.res.coreCharge - before) / 0.1).toFixed(4) + '/秒');
    }
    {
      const full = SB.state.freshRun(false);
      full.wonders = { wonder_terra_core: true };
      full.sunSails = 1000;
      full.res.coreCharge = 50000000 - 1;
      SB.economy.tick(full, 1, noop);
      check('星核炉芯池封顶 50M，超出流量不会溢出上限',
        full.res.coreCharge === 50000000, '存量=' + full.res.coreCharge);
    }
    meta.challenges = { completed: { cold: true, small: true, science: 1, abyss: 1 } };
    pane = SB.ui.render.paneChallenges();
    check('单次挑战完成后关闭入口，分档挑战只显示下一档入口',
      !pane.includes('data-challenge-start="cold"') && !pane.includes('data-challenge-start="small"') &&
      pane.includes('data-challenge-start="science"') && pane.includes('data-challenge-start="abyss"') &&
      pane.includes('第一档') && pane.includes('第二档'),
      '已完成单次挑战无重开按钮');
    /* 2026-10-24：成就墙从挑战页尾拆到独立页签（paneAchievements）。
     * 两侧都要钉：挑战页**不再**含墙（否则拆分静默失效），成就页含三区结构。 */
    const paneAchv = SB.ui.render.paneAchievements();
    check('成就墙已拆到独立页签：挑战页不含 achv-wall，成就页含',
      !pane.includes('achv-wall') && !pane.includes('成就墙') &&
      paneAchv.indexOf('achv-wall') !== -1 && paneAchv.indexOf('成就墙') !== -1,
      '挑战页含墙=' + pane.includes('achv-wall') + ' 成就页含墙=' + (paneAchv.indexOf('achv-wall') !== -1));
    check('成就页含轻车熟路分区与旧成就组',
      paneAchv.indexOf('挑战与轮回') !== -1 && paneAchv.indexOf('文明里程碑') !== -1 &&
      paneAchv.indexOf('data-achv-zone=') !== -1 && paneAchv.indexOf('data-achv-fold=') !== -1 &&
      /* ⚠️ 只钉下界 17（5 旧 + 12 新，无条件露出）：跑到本 suite 时主流程已产出真实
       * 建筑进度，「有进度就展开」会让分区条目多出来（实测 49），钉死 17 会误红。
       * 计数正则锚在类名结束（" 或空格）：见下方注释的两种错法。 */
      (paneAchv.match(/class="achv-item[" ]/g) || []).length >= 17,
      '露出条目数=' + ((paneAchv.match(/class="achv-item[" ]/g) || []).length));
    meta.challenges = empty();
    s.challenge = { id: 'cold', tier: 0 };
    s.t = 2 * SB.CFG.SEASON_TICKS;
    s.lvl.workshop = 1;
    s.techs.ironwork = true;
    s.res.stone = 1e6; s.res.silt = 1e6;
    check('寒流禁火不禁止建造热泉炉', SB.habitat.build(s, 'furnace', noop) && s.lvl.furnace === 1,
      '热泉炉等级=' + s.lvl.furnace);
    s = SB.state.freshRun(false);
    s.challenge = { id: 'cold', tier: 0 };
    s.t = 0;
    check('非寒流季保温法可正常使用', !api.warmHeatingBlocked(s));
    s.t = 2 * SB.CFG.SEASON_TICKS;
    check('寒流季期间保温法限制生效', api.warmHeatingBlocked(s));
    s.warmOn = true; s.res.warmstone = 20;
    const warmBefore = s.res.warmstone;
    check('寒流季保温开关不消耗暖石', !SB.economy.warmBurningNow(s) && SB.economy.warmRelief(s, 0.1) === 0 &&
      s.res.warmstone === warmBefore, '暖石=' + s.res.warmstone);

    const coldHydro = SB.state.freshRun(false);
    coldHydro.challenge = { id: 'cold', tier: 0 };
    coldHydro.t = 2 * SB.CFG.SEASON_TICKS;
    coldHydro.lvl.hydroturbine = 1;
    coldHydro.res.warmstone = 100;
    SB.economy.tick(coldHydro, 0.1, noop);
    check('寒流禁火不暂停热液汽轮机及其暖石消耗', coldHydro.res.warmstone < 100 && coldHydro.res.hydro > 0,
      '暖石=' + coldHydro.res.warmstone + ' 热液能=' + coldHydro.res.hydro);
    coldHydro.t = 0; coldHydro._seasonIdx = 0;
    SB.economy.tick(coldHydro, 0.1, noop);
    check('非寒流季热液汽轮机仍正常消耗暖石', coldHydro.res.warmstone < 100 && coldHydro.res.hydro > 0,
      '暖石=' + coldHydro.res.warmstone + ' 热液能=' + coldHydro.res.hydro);

    const coldFurnace = SB.state.freshRun(false);
    coldFurnace.challenge = { id: 'cold', tier: 0 };
    coldFurnace.t = 2 * SB.CFG.SEASON_TICKS;
    coldFurnace._seasonIdx = 2;
    coldFurnace.lvl.furnace = 1;
    coldFurnace.res.silt = 100;
    coldFurnace.res.warmstone = 100;
    SB.economy.tick(coldFurnace, 0.1, noop);
    check('寒流禁火不暂停热泉炉及其暖石消耗', coldFurnace.res.warmstone < 100 && coldFurnace.res.silt < 100 && coldFurnace.res.iron > 0,
      '暖石=' + coldFurnace.res.warmstone + ' 金属=' + coldFurnace.res.silt);

    s = SB.state.freshRun(false);
    s.challenge = { id: 'small', tier: 0 };
    s.lvl.nest = 12;
    s.pop = 15;
    check('小国寡民将人口硬上限压到 15', SB.economy.popCap(s) === 15 && SB.economy.isFull(s),
      '人口上限=' + SB.economy.popCap(s));
    s.pop = 1;
    check('小国寡民豁免科技与市政的所有总人口门槛', api.ignorePopulationGates(s) &&
      SB.tech.condMet(s, { t: 'pop', n: 25 }) && SB.tech.condMet(s, { t: 'pop', n: 55 }) &&
      SB.tech.condMet(s, { t: 'job', j: 'scholar', n: 1 }) &&
      SB.tech.condShort(s, { t: 'pop', n: 25 }) === null &&
      SB.tech.condShort(s, { t: 'job', j: 'scholar', n: 1 }) === null,
      '挑战中 1 人满足 25/55 人与学者人数条件；实际人口上限仍为 ' + SB.economy.popCap(s));
    const normalPopGate = SB.state.freshRun(false);
    check('小国寡民之外总人口与职业人数门槛照常生效',
      !SB.tech.condMet(normalPopGate, { t: 'pop', n: 25 }) &&
      !SB.tech.condMet(normalPopGate, { t: 'job', j: 'scholar', n: 1 }));

    s = SB.state.freshRun(false);
    s.challenge = { id: 'science', tier: 0 };
    const sciencePeopleGates = SB.TECHS.filter(t => t.cond && (t.cond.t === 'pop' || t.cond.t === 'job'));
    const civicPeopleGates = SB.CIVICS.filter(c => c.boost && (c.boost.t === 'pop' || c.boost.t === 'job'));
    /* 科技与市政人数门槛按当前数据表计数；新增门槛必须一起接受挑战门禁回归。 */
    check('忽视科文仍保留尤里卡与鼓舞中的所有人数门槛', !api.ignorePopulationGates(s) &&
      sciencePeopleGates.length === 4 && civicPeopleGates.length === 4 &&
      sciencePeopleGates.every(t => !SB.tech.condMet(s, t.cond)) &&
      civicPeopleGates.every(c => !SB.civic.boostMet(s, c)),
      '人数门槛仍由正常条件判定');
    s.techs = Object.fromEntries(SB.TECHS.map(t => [t.id, true]));
    s.civics = Object.fromEntries(SB.CIVICS.map(c => [c.id, true]));
    for (const tech of SB.TECHS) s.eureka[tech.id] = true;
    s.era = 99; s.res.science = 1e9;
    const nextTech = [...SB.TECHS].reverse().find(t => t.cost && t.reqs && t.reqs.every(id => s.techs[id]));
    if (nextTech) {
      s.techs[nextTech.id] = false;
      s.eurekaMet[nextTech.id] = true;
      s.eureka[nextTech.id] = true;
    }
    check('忽视科文不限制已掌握科技总数', !!nextTech &&
      SB.tech.study(s, nextTech.id, noop) && s.techs[nextTech.id],
      nextTech ? nextTech.name : '没有合适的科技夹具');
    const nextCivic = [...SB.CIVICS].reverse().find(c => c.cost && c.reqs.every(id => s.civics[id]));
    if (nextCivic) {
      s.civics[nextCivic.id] = false;
      s.civShown[nextCivic.id] = true;
    }
    s.res.culture = 1e9;
    check('忽视科文不限制已完成市政总数', !!nextCivic &&
      SB.civic.research(s, nextCivic.id, noop) && !!s.civics[nextCivic.id],
      nextCivic ? nextCivic.name : '没有合适的市政夹具');

    const jobCaps = [15, 10, 5];
    let jobCapsOk = true;
    for (let tier = 0; tier < jobCaps.length; tier++) {
      const workerRun = SB.state.freshRun(false);
      workerRun.challenge = { id: 'science', tier };
      workerRun.pop = 40; workerRun.peak = 40;
      workerRun.techs = Object.fromEntries(SB.TECHS.map(t => [t.id, true]));
      workerRun.civics = Object.fromEntries(SB.CIVICS.map(c => [c.id, true]));
      workerRun.jobs = Object.fromEntries(SB.folk.IDS.map(id => [id, 0]));
      const cap = jobCaps[tier];
      const scholarAdded = SB.folk.assign(workerRun, 'scholar', 40);
      const scribeAdded = SB.folk.assignMax(workerRun, 'scribe');
      jobCapsOk = jobCapsOk && scholarAdded && scribeAdded &&
        workerRun.jobs.scholar === cap && workerRun.jobs.scribe === cap &&
        !SB.folk.assign(workerRun, 'scholar', 1) &&
        !SB.folk.assign(workerRun, 'scribe', 1) && !api.jobLimitExceeded(workerRun);
      if (tier === 2) {
        workerRun.jobs.scholar = 6;
        jobCapsOk = jobCapsOk && api.jobLimitExceeded(workerRun) && api.resolveRun({
          ...workerRun, shell: 0, broken: true, civics: { theology: true }
        }, { challenges: empty() }) === null;
      }
    }
    check('忽视科文三档分别限制学者与书手人数，不能手动超额', jobCapsOk,
      '各档岗位上限=' + jobCaps.join('/'));

    const autoRun = SB.state.freshRun(false);
    autoRun.challenge = { id: 'science', tier: 2 };
    autoRun.pop = 20; autoRun.peak = 20;
    autoRun.techs = Object.fromEntries(SB.TECHS.map(t => [t.id, true]));
    autoRun.civics = Object.fromEntries(SB.CIVICS.map(c => [c.id, true]));
    SB.folk.autoAssign(autoRun, { gather: 0, scholar: 1, scribe: 1 });
    check('忽视科文的自动配工也遵守学者与书手上限', autoRun.jobs.scholar <= 5 && autoRun.jobs.scribe <= 5 &&
      SB.folk.sum(autoRun) <= autoRun.pop,
      '学者=' + autoRun.jobs.scholar + ' 书手=' + autoRun.jobs.scribe);

    meta.challenges = { completed: { cold: true, small: true, science: 2, abyss: 1 } };
    check('寒流禁火奖励永久提高暖石产出 20%', api.warmstoneMul(s) === 1.2);
    check('忽视科文采用最高档奖励：科文产出 +100%', api.scienceCultureMul(s) === 2);
    check('深渊重压采用最高已通关档全产出 +20%', api.productionMul(s) === 1.2);
    check('小国寡民奖励让新周目人口 +3、生育时间减半',
      api.startingPopulation() === SB.CFG.POP_START + 3 && api.growthDuration(s) === SB.CFG.GROW_NEED / 2);

    meta.challenges = empty();
    const warmBase = SB.state.freshRun(false);
    const warmTrial = SB.state.freshRun(false);
    warmBase.jobs.miner = 1;
    warmTrial.jobs.miner = 1;
    warmTrial.challenge = { id: 'cold', tier: 0 };
    const warmBaseRate = SB.economy.rates(warmBase).warmstone;
    const warmTrialRate = SB.economy.rates(warmTrial).warmstone;
    SB.economy.tick(warmBase, 0.1, noop);
    SB.economy.tick(warmTrial, 0.1, noop);
    check('寒流禁火挑战期间暖石产出降低 30%（面板与实际结算）',
      Math.abs(warmTrialRate / warmBaseRate - 0.7) < 1e-9 &&
      Math.abs(warmTrial.res.warmstone / warmBase.res.warmstone - 0.7) < 1e-9,
      'rates=' + warmTrialRate.toFixed(8) + '/' + warmBaseRate.toFixed(8) +
      ' tick=' + warmTrial.res.warmstone.toFixed(8) + '/' + warmBase.res.warmstone.toFixed(8));
    meta.challenges = { completed: { cold: true, small: true, science: 1, abyss: 0 } };
    check('三次挑战通关会让轮回点获取永久 +30%',
      SB.prestige.breakReport(SB.state.freshRun(false)).challengePointMul === 1.3);

    meta.challenges = empty();
    const trial = SB.state.freshRun(false);
    trial.challenge = { id: 'abyss', tier: 0 };
    trial.jobs.scholar = 1;
    trial._seasonIdx = 0;
    const beforeScience = trial.res.science;
    SB.economy.tick(trial, 0.1, noop);
    const realized = (trial.res.science - beforeScience) / 0.1;
    const displayed = SB.economy.rates(trial).science;
    check('挑战倍率下科技面板速率与实际进账一致', Math.abs(realized - displayed) < 1e-7,
      realized.toFixed(8) + ' / ' + displayed.toFixed(8));

    const hydroTrial = SB.state.freshRun(false);
    hydroTrial.lvl.hydroturbine = 1;
    hydroTrial.res.warmstone = 100;
    const hydroBase = SB.economy.hydroAlloc(hydroTrial, 1).supply;
    hydroTrial.challenge = { id: 'abyss', tier: 0 };
    const hydroRestricted = SB.economy.hydroAlloc(hydroTrial, 1).supply;
    check('深渊重压的全产出惩罚覆盖热液能流', Math.abs(hydroRestricted / hydroBase - 0.8) < 1e-9,
      hydroRestricted.toFixed(6) + ' / ' + hydroBase.toFixed(6));

    const challengeMeta = { challenges: empty() };
    const candidate = SB.state.freshRun(false);
    candidate.challenge = { id: 'small', tier: 0 };
    candidate.shell = 0;
    check('未完成神学资格不能领取挑战奖励', api.resolveRun(candidate, challengeMeta) === null);
    candidate.civics.theology = true;
    candidate.shell = 1;
    check('完成神学但未凿穿天壳仍不能通关', api.resolveRun(candidate, challengeMeta) === null);
    candidate.shell = 0;
    const cleared = api.resolveRun(candidate, challengeMeta);
    candidate.challenge = null;
    check('完成神学并凿穿天壳后记录单次挑战', !!cleared &&
      challengeMeta.challenges.completed.small === true && !api.canStart('small', candidate, challengeMeta),
      cleared ? cleared.name + '：' + cleared.reward : '挑战未完成');
  } finally {
    meta.challenges = savedProgress;
    meta.achv = savedAchv;
    meta.achievements = savedAchievements;
    meta.challengePopupPending = savedChallengePopupPending;
    SB.state.saveMeta(meta);
  }
}
