/* e2e suite: reincarnation challenges, run restrictions, rewards, and settlement gates. */
import fs from 'node:fs';
export function run({ SB, check, noop }) {
  console.log('\n=== 轮回挑战 ===');
  const meta = SB.game.meta();
  const savedProgress = JSON.parse(JSON.stringify(meta.challenges || {}));
  const savedAchv = JSON.parse(JSON.stringify(meta.achv || {}));
  const savedAchievements = JSON.parse(JSON.stringify(meta.achievements || {}));
  const savedChallengePopupPending = meta.challengePopupPending;
  const empty = () => ({ completed: { cold: false, small: false, science: 0, abyss: 0, speedrun: 0, dyson_rush: 0, drift_terra: false, waterpollution: false } });
  try {
    meta.challenges = empty();
    const api = SB.challenges;
    let s = SB.state.freshRun(false);

    /* 2026-11-02：挑战开放重打后，「能开」与「还有新档」是两件事 —— canStart 含重打，
     * canStartFresh 只认未通关档。这里两侧都钉，防止将来有人把两个函数合成一个。 */
    /* 2026-11-02：水体污染加入 ⇒ 挑战总数 6 → 7（本条断言刻意写死数字：
     *   加挑战必须是有意识的动作，顺手改这里就是「我知道自己在改内容表」。）
     * 2026-11-04：四项终局挑战（安那其 / 美好旧日 / 三地发射网 / 掌握永远与须臾）
     *   实装 ⇒ 7 → 11。它们的定义、assets、civics 与 economy-tick 配套同批落地；
     *   断言的其余条件（canStart/canStartFresh 两路）不受数量影响。 */
    /* 2026-11-07：星海竞速（限时戴森）⇒ 11 → 12。 */
    /* 2026-11-12：和平主义者（终局挑战）实装 ⇒ 12 → 13。 */
    /* 2026-11-12：批判的武器（原名和平主义者）+ 武器的批判 + 早打大打打核大战 + grubby + 征服者 ⇒ 13 → 17。 */
    check('十七类挑战已注册；全部通关后仍可开（重打），但「新档」入口关闭', api.list().length === 17 &&
      api.canStartFresh('science', s, meta) && api.canStart('science', s, meta) &&
      !api.canStartFresh('science', s, { challenges: { completed: { science: 3 } } }) &&
      api.canStart('science', s, { challenges: { completed: { science: 3 } } }),
      '挑战数=' + api.list().length);
    let pane = SB.ui.render.paneChallenges();
    /* 2026-11-05：流浪泰拉加了「第 15 周目」开启前置 ⇒ 前置未满足时它不给开始按钮，
     * 入口数是 10 而不是 11。这是规格变更，不是把断言放宽：仍逐项点名 11 个挑战，
     * 期望值由生产门禁同源给出（不许在这里再写死一个数字掩盖分叉）。 */
    const expectedStarts = api.prereqOk('drift_terra', meta) ? 17 : 16;
    check('挑战独立页展示十六项挑战与首次开始入口',
      ['寒流禁火', '小国寡民', '忽视科文', '深渊重压', '流浪泰拉', '水体污染'].every(name => pane.includes(name)) &&
      pane.includes('暖石产出 -30%') && pane.includes('学者、书手各 ≤ 15 人') &&
      pane.includes('总人口、职业人数门槛豁免') &&
      (pane.match(/data-challenge-start=/g) || []).length === expectedStarts,
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
    /* 2026-11-02 规则变更（玩家要求「可以反复挑战刷排行榜」）：已通关不再关闭入口，
     * 改成「再次挑战」；未通关的分档挑战仍只放下一档。旧断言要求 cold/small 无按钮，
     * 已被这条规则推翻，故整条重写而不是删掉。 */
    /* 入口数 = 挑战总数（2026-11-02 加水体污染后 6 → 7；2026-11-04 加四项终局挑战后 7 → 11）。
     * 2026-11-05：再减去被「第 15 周目」前置挡住的流浪泰拉（口径同上，同源读门禁）。 */
    check('已通关的挑战保留「再次挑战」入口，未通关的分档挑战只放下一档',
      (pane.match(/data-challenge-start=/g) || []).length === (api.prereqOk('drift_terra', meta) ? 12 : 11) &&
      pane.includes('再次挑战 · 完成挑战') && pane.includes('结算并挑战 · 第二档') &&
      !pane.includes('此挑战入口已关闭'),
      '入口数=' + ((pane.match(/data-challenge-start=/g) || []).length));
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
    /* ⚠️ 夹具必须排除 challengeOnly 项（2026-11-02）：这里测的是「科文总数不受限」，
     *   拿一个**当前周目不许可**的挑战专属项当夹具，测的就不是那条性质了。 */
    const nextTech = [...SB.TECHS].reverse().find(t => t.cost && t.reqs && !t.challengeOnly && t.reqs.every(id => s.techs[id]));
    if (nextTech) {
      s.techs[nextTech.id] = false;
      s.eurekaMet[nextTech.id] = true;
      s.eureka[nextTech.id] = true;
    }
    check('忽视科文不限制已掌握科技总数', !!nextTech &&
      SB.tech.study(s, nextTech.id, noop) && s.techs[nextTech.id],
      nextTech ? nextTech.name : '没有合适的科技夹具');
    const nextCivic = [...SB.CIVICS].reverse().find(c => c.cost && !c.challengeOnly && c.reqs.every(id => s.civics[id]));
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

    /* 2026-11-07 用户报「水体 +2、小国寡民 +3，开局该 6 人却跳回 4」：
     * 旧实现把奖励只写进 freshRun 的 pop/peak，popCap 完全不读 ⇒ 开局必然 pop > cap，
     * 被 economy-tick 的超额离场与 state-migrate 的读档硬钳两处赶回去，奖励等于没发。
     * 下面钉死「奖励与容器同源」：裸开局、买满天赋、读档、两项叠加、面板文案。 */
    const bonusRun = SB.state.freshRun(false);
    check('★ 挑战起始人口奖励同步进上限：裸开局 pop = popCap',
      bonusRun.pop === api.startingPopulation() &&
      SB.economy.popCap(bonusRun) === api.startingPopulation() &&
      bonusRun.pop <= SB.economy.popCap(bonusRun),
      'pop=' + bonusRun.pop + ' cap=' + SB.economy.popCap(bonusRun));
    const bonusPerk = SB.state.freshRun(false);
    bonusPerk.perk.startPop = 3;
    check('★ 买满繁衍生息 III 不再把起始人口钳回 4',
      bonusPerk.pop === api.startingPopulation() &&
      SB.economy.popCap(bonusPerk) === api.startingPopulation() + 3 &&
      bonusPerk.pop <= SB.economy.popCap(bonusPerk),
      'pop=' + bonusPerk.pop + ' cap=' + SB.economy.popCap(bonusPerk));
    check('★ 读档迁移不再把起始人口砍回上限',
      SB.state.migrateRun(JSON.parse(JSON.stringify(bonusRun))).pop === bonusRun.pop,
      '读档后 pop=' + SB.state.migrateRun(JSON.parse(JSON.stringify(bonusRun))).pop);
    /* 真实用户场景：small + waterpollution 都通关 ⇒ 起始 6 人。 */
    meta.challenges = { completed: { cold: true, small: true, waterpollution: true, science: 2, abyss: 1 } };
    const bothBonus = SB.state.freshRun(false);
    check('★ 小国寡民 + 水体污染叠加：起始 6 人且上限同步到 6',
      api.startingPopulation() === SB.CFG.POP_START + 5 &&
      bothBonus.pop === api.startingPopulation() &&
      SB.economy.popCap(bothBonus) === api.startingPopulation() &&
      bothBonus.pop <= SB.economy.popCap(bothBonus),
      'pop=' + bothBonus.pop + ' cap=' + SB.economy.popCap(bothBonus));
    /* paneVillage 挂在 SB.ui.renderParts（不是 SB.ui.render，与 paneChallenges 不同）。 */
    const villagePane = SB.ui.renderParts && SB.ui.renderParts.paneVillage;
    const villageHtml = typeof villagePane === 'function' ? villagePane() : '';
    check('★ 巢穴页教程文案的开局上限与引擎同源（不再写 1 → 3）',
      !!villageHtml && villageHtml.includes('人口上限 ' + api.startingPopulation() + ' → ' + (api.startingPopulation() + (SB.BLD.house || 0))),
      'paneVillage 可用=' + !!villageHtml + ' startingPopulation=' + api.startingPopulation());

    /* ── 2026-11-08 方案 B：挑战专属内容标注 ──────────────────────────────
     * 判据：信息必须落在决策点；角标文本必须是**挑战显示名**而不是内部 id
     * （2026-11-02「w / a / t / e / r…」事故）；基游戏不挂；
     * 6 项无 challengeOnly 字段的「间接专属」也要纳管；7 处渲染共用同一个 helper。 */
    const tagFn = SB.ui.renderCommon && SB.ui.renderCommon.challengeTag;
    const idsFn = SB.ui.renderCommon && SB.ui.renderCommon.challengeTagIds;
    const tagAll = [];
    for (const tn of ['BUILDINGS', 'TECHS', 'CIVICS', 'WONDERS', 'UPGRADES', 'CRAFTS']) {
      for (const o of (SB[tn] || [])) if (o && o.id) tagAll.push(o);
    }
    /* 政策卡表在不同导出名下只取一份，绝不叠三重导致计数重复。 */
    for (const o of (SB.CARDS || SB.POLICY_CARDS || SB.POLICIES || [])) if (o && o.id) tagAll.push(o);
    const explicit = tagAll.filter(o => !!o.challengeOnly);
    const indirectIds = ['terra_vat', 'terra_engine', 'wonder_terra_core', 'wonder_crustplate',
      'upg_crustmine', 'upg_reheavfusion'];
    const indirect = tagAll.filter(o => indirectIds.indexOf(o.id) >= 0 && !o.challengeOnly);
    const baseS = SB.state.freshRun(false);
    const waterS = SB.state.freshRun(false); waterS.challenge = { id: 'waterpollution', tier: 0 };
    const terraS = SB.state.freshRun(false); terraS.challenge = { id: 'drift_terra', tier: 0 };

    check('★ 挑战角标归一化：true / string / array 三态都解成 id 数组',
      !!idsFn && JSON.stringify(idsFn({ challengeOnly: true })) === '["drift_terra"]' &&
      JSON.stringify(idsFn({ challengeOnly: 'waterpollution' })) === '["waterpollution"]' &&
      JSON.stringify(idsFn({ challengeOnly: ['cold', 'small'] })) === '["cold","small"]' &&
      JSON.stringify(idsFn({})) === '[]');

    check('★ 24 项显式 + 6 项间接专属全部被同一个 helper 纳管',
      !!tagFn && explicit.length === 24 && indirect.length === 6 &&
      explicit.every(o => {
        const ids = idsFn(o);
        const s = ids.indexOf('waterpollution') >= 0 ? waterS
          : ids.indexOf('drift_terra') >= 0 ? terraS : baseS;
        return /class="co-tag"/.test(tagFn(s, o)) && tagFn(baseS, o) === '';
      }) &&
      indirect.every(o => /class="co-tag"/.test(tagFn(terraS, o)) && tagFn(baseS, o) === '' &&
        tagFn(waterS, o) === ''),
      '显式=' + explicit.length + ' 间接=' + indirect.length + ' 间接 id=' + indirect.map(o => o.id).join(','));

    const waterTag = tagFn(waterS, explicit.find(o => o.challengeOnly === 'waterpollution'));
    const terraTag = tagFn(terraS, indirect.find(o => o.id === 'upg_crustmine'));
    check('★ 角标文案用挑战显示名、不含内部 id，且桌面 title 与触屏 ⓘ 同源',
      /水体污染限定/.test(waterTag) && !/waterpollution/.test(waterTag) &&
      /流浪泰拉限定/.test(terraTag) && !/drift_terra/.test(terraTag) &&
      /挑战专属内容，仅在当前周目出现/.test(waterTag) &&
      /class="hover-info-btn co-info"/.test(waterTag) &&
      /SB\.ui\.showHoverInfo/.test(waterTag) &&
      waterTag.indexOf('title="') !== waterTag.lastIndexOf('title="'),
      'water=' + waterTag.slice(0, 90));

    /* 静态接线锁：7 处渲染逐字调用同一个 helper，少了任意一处都会掉到 6。
     * 用源码而不是 toString()：techNode / civicNode / pool 是闭包内函数，拿不到引用。 */
    let tagWires = 0;
    for (const f of ['render-pane-village.js', 'render-pane-research.js',
      'render-pane-wonder.js', 'render-pane-workshop.js']) {
      const src = fs.readFileSync(new URL('../../src/ui/' + f, import.meta.url), 'utf8');
      tagWires += (src.match(/renderCommon\.challengeTag\(s,/g) || []).length;
    }
    check('★ 7 处渲染拼接全走共用 helper（不多不少）', tagWires === 7, '实测接线=' + tagWires);

    /* 真实渲染冒烟：paneVillage 读 SB.game.run()，构造全解锁的水体污染周目，
     * 确认角标真的上屏（不是只在 helper 单测里绿）。try/finally 逐字段还原。 */
    const tagRun = SB.game.run();
    const tagBak = {
      challenge: tagRun.challenge, techs: tagRun.techs, civics: tagRun.civics,
      civShown: tagRun.civShown, seen: tagRun.seen
    };
    let villageTagHtml = '';
    try {
      tagRun.challenge = { id: 'waterpollution', tier: 0 };
      tagRun.techs = {}; for (const t of (SB.TECHS || [])) tagRun.techs[t.id] = true;
      tagRun.civics = {}; for (const c of (SB.CIVICS || [])) tagRun.civics[c.id] = true;
      tagRun.civShown = {}; for (const c of (SB.CIVICS || [])) tagRun.civShown[c.id] = true;
      tagRun.seen = {}; for (const b of (SB.BUILDINGS || [])) tagRun.seen[b.id] = 1;
      villageTagHtml = SB.ui.renderParts.paneVillage();
    } catch (e) { villageTagHtml = 'ERR:' + (e && e.message); }
    finally { Object.assign(tagRun, tagBak); }
    const villageBadges = (villageTagHtml.match(/class="co-tag"/g) || []).length;
    check('★ 真实建造页面板在挑战周目确有角标上屏，基游戏为 0',
      villageBadges >= 1 && /水体污染限定/.test(villageTagHtml) &&
      !/waterpollution 限定/.test(villageTagHtml),
      '挑战周目角标=' + villageBadges + ' html头=' + villageTagHtml.slice(0, 60));
    tagRun.challenge = null;
    const villageBaseHtml = SB.ui.renderParts.paneVillage();
    tagRun.challenge = tagBak.challenge;
    check('★ 基游戏建造页面板角标数 = 0',
      (villageBaseHtml.match(/class="co-tag"/g) || []).length === 0,
      '基游戏角标=' + (villageBaseHtml.match(/class="co-tag"/g) || []).length);

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
      challengeMeta.challenges.completed.small === true &&
      !api.canStartFresh('small', candidate, challengeMeta) &&
      api.canStart('small', candidate, challengeMeta),
      cleared ? cleared.name + '：' + cleared.reward : '挑战未完成');

    /* ── 2026-11-02 挑战可反复重打（玩家反馈「想反复挑战刷排行榜」）────────────
     * 口径（用户拍板）：全部通关后仍可开；重打已通**最高档**；不重复发奖、
     * 不再累加「轮回点 +10%」；只有排行榜成绩被刷新。
     * 判据三条要点：① 档位必须夹在 length-1（否则 d.tiers[tier].label 抛错）；
     *   ② 账本逐字节不变（不是「值看起来一样」）；③ 重打仍受本档限制约束。 */
    {
      const replayMeta = { challenges: empty() };
      replayMeta.challenges.completed = { cold: true, small: true, science: 3, abyss: 3, speedrun: 3, drift_terra: true };
      const idle = SB.state.freshRun(false);
      check('全部通关后仍可开挑战，重打档位夹在最高档上，且「新档」入口已关闭',
        api.canStart('science', idle, replayMeta) && api.isReplay('science', replayMeta) &&
        api.startTier('science', replayMeta) === 2 && !api.canStartFresh('science', idle, replayMeta),
        'tier=' + api.startTier('science', replayMeta));

      const ledgerBefore = JSON.stringify(replayMeta.challenges.completed);
      const mulBefore = SB.prestige.breakReport(SB.state.freshRun(false)).challengePointMul;
      const re = SB.state.freshRun(false);
      re.challenge = { id: 'science', tier: 2, replay: true };
      re.civics.theology = true;
      re.shell = 0; re.broken = true;
      re.pop = 20; re.peak = 20; re.jobs.scholar = 5; re.jobs.scribe = 5;
      const reOut = api.resolveRun(re, replayMeta);
      check('重复通关只报成绩：挑战账本一字不改，+10% 轮回点加成不变',
        !!reOut && reOut.replay === true && reOut.reward === null &&
        JSON.stringify(replayMeta.challenges.completed) === ledgerBefore &&
        SB.prestige.breakReport(SB.state.freshRun(false)).challengePointMul === mulBefore,
        reOut ? 'reward=' + reOut.reward : '未结算');

      const over = SB.state.freshRun(false);
      over.challenge = { id: 'science', tier: 2, replay: true };
      over.civics.theology = true;
      over.shell = 0; over.broken = true;
      over.pop = 20; over.peak = 20; over.jobs.scholar = 6; over.jobs.scribe = 0;
      check('重打不能绕过本档限制：学者超第三档上限则该局不算通关',
        api.resolveRun(over, replayMeta) === null, '学者=' + over.jobs.scholar);
    }
    {
      /* 流浪泰拉是唯一有专属榜的挑战：重打必须再提交一次 drift，否则「刷排行榜」是空话；
       * 同时不能再塞 challengePopupPending（那会重播分镜并谎称「永久奖励已生效」）。 */
      const driftMeta = { challenges: empty() };
      driftMeta.challenges.completed.drift_terra = true;
      const dr = SB.state.freshRun(false);
      dr.challenge = { id: 'drift_terra', tier: 0, replay: true };
      dr.lvl.terra_engine = 50; dr.res.coreCharge = 50000000; dr.wallT = 1234;
      const sent = [];
      const savedSubmit = SB.rank && SB.rank.submitRun;
      if (SB.rank) SB.rank.submitRun = (entries) => { if (entries) sent.push(...entries); };
      let driftOut = null;
      try { driftOut = api.evaluate(dr, driftMeta); }
      finally { if (SB.rank && savedSubmit) SB.rank.submitRun = savedSubmit; }
      check('流浪泰拉重复达成：不发奖、不弹永久奖励面板，但重新提交「最快流浪启程」榜',
        !!driftOut && driftOut.replay === true && driftOut.reward === null &&
        !driftMeta.challengePopupPending &&
        sent.length === 1 && sent[0].key === 'drift' && sent[0].value === 1234,
        driftOut ? '榜=' + JSON.stringify(sent) : '未结算');
    }

    /* ── 星海竞速：限时 goal 型（2026-11-07）──────────────────────────────
     * 终点从「破壳」推到「戴森竣工」，但 goal 型不走 resolveRun 的超时分支，
     * 所以必须单独锁住「计时泛化」「award 超时早退」「三档奖励」三件事。 */
    {
      const rush = api.byId('dyson_rush');
      check('星海竞速定义：timed 标记 + 戴森 goal + 16/8/4 小时三档',
        !!rush && rush.timed === true && !!rush.goal && rush.goal.t === 'dyson' &&
        rush.tiers.length === 3 && rush.tiers[0].cap === 16 * 3600 &&
        rush.tiers[1].cap === 8 * 3600 && rush.tiers[2].cap === 4 * 3600,
        rush ? JSON.stringify(rush.tiers.map(t => t.cap)) : '无定义');
      check('星海竞速已进进度白名单（老档读回不会把通关账清零）',
        api.progress({}).dyson_rush === 0);

      const mk = (tier, agoHours, done) => {
        const st = SB.state.freshRun(false);
        st.challenge = { id: 'dyson_rush', tier: tier, replay: false,
          startedAt: Date.now() - agoHours * 3600 * 1000 };
        st.dysonDone = !!done;
        return st;
      };
      const pending = mk(0, 1, false);
      check('限时计时对新挑战生效（不是只认 speedrun）',
        api.timedOut(pending) === false && api.remainingSeconds(pending) > 0,
        '剩余=' + api.remainingSeconds(pending));

      const late = mk(2, 5, true);
      check('第三档超时判定成立', api.timedOut(late) === true);
      const lateMeta = { challenges: empty() };
      const lateOut = api.evaluate(late, lateMeta);
      check('超时后即使戴森已竣工也不发奖 / 不写账本 / 不弹完成面板',
        lateOut === null && !lateMeta.challengePopupPending &&
        (lateMeta.challenges.completed.dyson_rush | 0) === 0,
        lateOut ? JSON.stringify(lateOut) : '未结算（正确）');

      const fast = mk(0, 1, true);
      fast.wallT = 4321;
      const fastMeta = { challenges: empty() };
      const rushSent = [];
      const rushSavedSubmit = SB.rank && SB.rank.submitRun;
      if (SB.rank) SB.rank.submitRun = (entries) => { if (entries) rushSent.push(...entries); };
      let fastOut = null;
      try { fastOut = api.evaluate(fast, fastMeta); }
      finally { if (SB.rank && rushSavedSubmit) SB.rank.submitRun = rushSavedSubmit; }
      check('限时内戴森竣工 ⇒ 首档发奖、账本 +1、弹完成面板',
        !!fastOut && fastOut.reward === '永久全产出 +5%' && !fastOut.replay &&
        (fastMeta.challenges.completed.dyson_rush | 0) === 1 &&
        !!fastMeta.challengePopupPending,
        fastOut ? JSON.stringify(fastOut) : '未结算');
      check('星海竞速达标提交「最快星海竞速」榜（成绩 = 本局墙钟秒，不复用 dyson 全局榜）',
        rushSent.length === 1 && rushSent[0].key === 'dysonrush' && rushSent[0].value === 4321,
        '榜=' + JSON.stringify(rushSent));

      meta.challenges.completed.dyson_rush = 3;
      const mul3 = api.productionMul(SB.state.freshRun(false));
      meta.challenges.completed.dyson_rush = 0;
      check('星海竞速三档奖励确实进全产出倍率（1 → 1.15）',
        Math.abs(mul3 - 1.15) < 1e-9, '倍率=' + mul3);
    }

    /* ── 破壳即判定（2026-11-03）─────────────────────────────────────────
     * 破壳不再等于本局结束：破壳之后还有 ERA10（发射场 → 戴森球 → 星图），
     * 所以破壳型挑战（寒流禁火 / 小国寡民 / 忽视科文 / 深渊重压 / 逐光竞速）的
     * 判定必须挪到「壳归零那一刻」，并且读破壳快照 —— 否则破壳后继续玩的人口、
     * 岗位、现实计时会把已经赢下的局改写掉。 */
    {
      const m1 = { challenges: empty() };
      const s1 = SB.state.freshRun(false);
      s1.challenge = { id: 'cold', tier: 0, replay: false };
      s1.civics.theology = true;
      s1.shell = 1; s1.peak = 20; s1.pop = 20;
      check('破壳型挑战：壳还没归零时不判定', api.resolveRun(s1, m1) === null && !m1.challenges.completed.cold,
        'shell=' + s1.shell);
      s1.shell = 0; s1.broken = true; s1.shellOpened = true;
      s1.challengeSeal = api.seal(s1);
      const out1 = api.sealRun(s1, m1);
      check('破壳瞬间即判定并落账（不等轮回结算）', !!out1 && !!out1.reward &&
        m1.challenges.completed.cold === true && s1.challengeDone === true,
        out1 ? 'reward=' + out1.reward : '未判定');
      check('破壳快照冻结了计时/峰值人口/神学状态', !!s1.challengeSeal &&
        typeof s1.challengeSeal.elapsed === 'number' && s1.challengeSeal.peak === 20 &&
        s1.challengeSeal.qualified === true, JSON.stringify(s1.challengeSeal));
    }
    {
      /* 小国寡民的上限是 15。破壳后挑战限制自动解除（active() 的 !s.broken），
       * 玩家可以随便把人口堆回去 —— 判定必须读破壳快照，不能用实时人口。 */
      const m2 = { challenges: empty() };
      const s2 = SB.state.freshRun(false);
      s2.challenge = { id: 'small', tier: 0, replay: false };
      s2.civics.theology = true;
      s2.shell = 0; s2.broken = true; s2.shellOpened = true;
      s2.peak = 12; s2.pop = 12;
      s2.challengeSeal = api.seal(s2);
      s2.pop = 40; s2.peak = 40;            // 破壳后继续玩，人口远超上限
      const out2 = api.sealRun(s2, m2);
      check('小国寡民：判定读破壳快照，破壳后人口涨到 40 不会把已赢的局判输',
        !!out2 && m2.challenges.completed.small === true,
        out2 ? '快照 peak=' + s2.challengeSeal.peak + ' 实时=' + s2.peak : '未判定');
    }
    {
      /* 逐光竞速的计时是 Date.now() - startedAt，破壳后还在走。判定留到结算，
       * 玩家破壳后挂机十几小时，16 小时档就被判超时。
       * ⚠️ 档位必须与 tierDone 对齐：三档挑战的常规判据是 `tier === tierDone`，
       *   直接拿 tier=2 又不预置完成度会被 resolveRun 当成「跳过前两档」而返回 null。 */
      const m3 = { challenges: empty() };
      const s3 = SB.state.freshRun(false);
      s3.challenge = { id: 'speedrun', tier: 0, replay: false, startedAt: Date.now() - 3 * 3600 * 1000 };
      s3.civics.theology = true;
      s3.shell = 0; s3.broken = true; s3.shellOpened = true;
      s3.challengeSeal = api.seal(s3);                        // 破壳时用了 3 小时
      s3.challenge.startedAt = Date.now() - 20 * 3600 * 1000;  // 破壳后又挂了 17 小时
      const out3 = api.sealRun(s3, m3);
      check('逐光竞速：破壳后继续挂机不会把 16 小时档判成超时（按破壳快照定格）',
        !!out3 && !out3.failed && (m3.challenges.completed.speedrun | 0) === 1,
        out3 ? 'failed=' + !!out3.failed + ' 快照用时=' + Math.round(s3.challengeSeal.elapsed) + 's' : '未判定');
    }
    {
      /* 破壳时还没学《神学》：先挂起，补学之后按同一份快照补判。
       * 这是 2026-10 以来的既有行为，不能借这次改造静默收紧成「必须破壳前学完」。 */
      const m4 = { challenges: empty() };
      const s4 = SB.state.freshRun(false);
      s4.challenge = { id: 'cold', tier: 0, replay: false };
      s4.shell = 0; s4.broken = true; s4.shellOpened = true;
      s4.challengeSeal = api.seal(s4);
      const hang = api.sealRun(s4, m4);
      check('破壳时还没学《神学》：判定挂起、不写账本',
        hang === null && !m4.challenges.completed.cold && s4.challengeDone === false, '挂起=' + (hang === null));
      s4.civics.theology = true;
      const later = api.evaluate(s4, m4);
      check('补学《神学》后按同一份破壳快照补判', !!later && m4.challenges.completed.cold === true,
        later ? 'reward=' + later.reward : '未补判');
    }
    {
      /* 结算只做账本：doBreak 里不许再调 resolveRun。
       * 否则破壳后补学的局会按结算那一刻的人口/岗位重判一次，把定格的成绩改写。 */
      const savedTide = meta.tide, savedSubmit = SB.game.submitRankOnBreak;
      SB.game.submitRankOnBreak = function () {};
      const s5 = SB.state.freshRun(false);
      s5.challenge = { id: 'cold', tier: 0, replay: false };
      s5.civics.theology = true;
      s5.shell = 0; s5.broken = true; s5.shellOpened = true;
      const before = JSON.stringify(meta.challenges);
      try { SB.prestige.doBreak(s5, null, { silent: true }); }
      finally { meta.tide = savedTide; SB.game.submitRankOnBreak = savedSubmit; }
      check('结算只做账本：doBreak 不再代为判定挑战', JSON.stringify(meta.challenges) === before,
        '挑战账本前后一致');
    }
    {
      /* 破壳后经济必须继续跑 —— 否则造不出发射场，ERA10 与水体污染（goal = 戴森球）都玩不动。 */
      const s6 = SB.state.freshRun(false);
      s6.broken = true; s6.shell = 0; s6.shellOpened = true;
      const t0 = Number(s6.t) || 0;
      SB.economy.tick(s6, 10, null, { skipFoodPop: true, skipHappy: true });
      check('破壳后经济照常运转（t 继续累加，不再整条停摆）', Number(s6.t) > t0 + 9,
        't ' + t0.toFixed(1) + ' → ' + Number(s6.t).toFixed(1));
      s6.res.starExplore = 0; s6.lvl.satellite = 2; s6.breakSettled = false;
      SB.shell.tickStar(s6, 100, null);
      check('破壳后星空槽立即累积（不再需要先「结算」才解冻）', Number(s6.res.starExplore) > 0,
        'star=' + Number(s6.res.starExplore).toFixed(1));
    }
    {
      /* 2026-11-03（用户拍板）：破壳不再自动解除挑战限制 —— 成绩在壳归零那刻定格，
       * 门禁什么时候撤由玩家自己选，且只有一次机会。 */
      const rs = SB.state.freshRun(false);
      rs.challenge = { id: 'small', tier: 0 };
      rs.shell = 0; rs.broken = true; rs.shellOpened = true;
      rs.challengeDone = true; rs.challengeReleased = false;
      check('破壳后挑战限制仍在（人口上限还是本档 15，不再随 broken 自动解除）',
        api.populationLimit(rs) === 15 && !!api.active(rs), '上限=' + api.populationLimit(rs));
      const rel1 = api.release(rs), rel2 = api.release(rs);
      check('解除限制一次性：首调 true、再调 false，且不碰 broken/shell',
        rel1 === true && rel2 === false && rs.challengeReleased === true && rs.broken === true && rs.shell === 0,
        'release=' + rel1 + '/' + rel2);
      check('解除后人口上限回到基础设施上限（Infinity，不再被本档压住）',
        api.populationLimit(rs) === Infinity && !api.active(rs), '上限=' + api.populationLimit(rs));

      /* goal 型挑战的终点在壳外（50 座发动机 / 戴森球）：破壳后必须正常发育。
       * 2026-11-04 修：active() 不再返回 null —— 旧的「破壳即解除」会让挑战页退回
       * 「尚未完成」并给出可点的重开入口（点一下丢掉当前 ERA10）。
       * 但「不压人口/产出/岗位」这条性质必须仍然成立：那些限制都按 id 分支
       * （small / abyss / science / cold），goal 型全部落到默认值。 */
      const gs = SB.state.freshRun(false);
      gs.challenge = { id: 'drift_terra', tier: 0 };
      gs.shell = 0; gs.broken = true; gs.shellOpened = true;
      check('goal 型挑战破壳后仍在进行，但不施加人口/岗位/保温限制，也不要求玩家解除',
        !!api.active(gs) && api.populationLimit(gs) === Infinity &&
        api.jobLimit(gs, 'scholar') === Infinity && api.warmHeatingBlocked(gs) === false &&
        gs.challengeReleased !== true,
        'active=' + !!api.active(gs) + ' popCap=' + api.populationLimit(gs) +
        ' 保温禁=' + api.warmHeatingBlocked(gs));
    }
    {
      /* 迁移：老档没有 challengeReleased 这个键，必须默认「已解除」——反了就是读档瞬间
       * 深渊重压的 -60% 产出回来、小国寡民人口上限掉到 15、忽视科文把学者从 20 砍到 5。 */
      const legacy = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {},
        challenge: { id: 'abyss', tier: 0 }, broken: true, shellOpened: true, shell: 0 });
      check('迁移：破壳过的老档默认「限制已解除」', legacy.challengeReleased === true,
        'released=' + legacy.challengeReleased);
      const freshFalse = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {},
        challenge: { id: 'abyss', tier: 0 }, broken: true, shellOpened: true, shell: 0,
        challengeDone: true, challengeReleased: false });
      check('迁移：新档的 challengeReleased=false 原样保留（不能当成缺字段补成 true）',
        freshFalse.challengeReleased === false, 'released=' + freshFalse.challengeReleased);
      const midRun = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {},
        challenge: { id: 'small', tier: 0 }, broken: false });
      check('迁移：还在挑战途中的老档保持受限', midRun.challengeReleased === false,
        'released=' + midRun.challengeReleased);
    }
    {
      /* 2026-11-03：水体污染 2026-11-02 实装时**漏了成就条目**（achv.js 无定义 + CFG.ACHV 无键
       * + 挑战定义无 onComplete）⇒ 通关能发奖励、能写 meta.challenges.completed，但成就墙与
       * 平台都不会亮。这里钉三处：定义存在、达成时写本地账本、CFG 里留了占位键。 */
      const ws = SB.state.freshRun(false);
      ws.challenge = { id: 'waterpollution', tier: 0 };
      ws.dysonDone = true;
      const out = api.evaluate(ws, meta);
      check('水体污染通关解锁成就「海渊澄明」（原先连成就定义都没有）',
        !!out && out.id === 'waterpollution' && !!(meta.achv && meta.achv.pollutionClear) &&
        !!(SB.achv && SB.achv.defOf('pollutionClear')),
        'outcome=' + (out && out.id) + ' achv=' + !!(meta.achv && meta.achv.pollutionClear));
      check('水体污染成就登记了 CFG.ACHV 键（占位待回填，不能是 undefined）',
        typeof SB.CFG.ACHV.pollutionClear === 'string' && SB.CFG.ACHV.pollutionClear.length > 0,
        'id=' + SB.CFG.ACHV.pollutionClear);
      meta.challengePopupPending = null;

      /* B：挑战页进度行原先按 id 写死，水体污染没有分支 ⇒ 落进 else，把**寒流禁火**的文案
       * 显示给自己（玩家完全看不到污染阶段与戴森进度）。 */
      const cur = SB.game.run();
      const snap = { challenge: cur.challenge, done: cur.challengeDone, broken: cur.broken,
        shell: cur.shell, opened: cur.shellOpened, pollution: cur.pollution, engines: cur.lvl.terra_engine };
      cur.challenge = { id: 'waterpollution', tier: 0 };
      cur.challengeDone = false; cur.broken = false; cur.pollution = 5000;
      const wpPane = SB.ui.render.paneChallenges();
      check('水体污染挑战页显示自己的阶段与戴森进度，不再借用寒流禁火的文案',
        wpPane.includes('浊流') && wpPane.includes('戴森') &&
        !wpPane.includes('非寒流季：保温法可正常使用'), '含浊流=' + wpPane.includes('浊流'));

      /* C：破壳后 goal 型挑战必须仍是「进行中」（2026-11-04 修）。
       * 修复前 active() 在破壳后返回 null ⇒ 卡片整块消失、退回「尚未完成」，
       * 还给出可点的「结算并挑战」按钮（begin() 会直接 startRun，丢掉当前 ERA10 进度）。
       * 修好后走正常卡片：徽标「进行中」、进度行照旧 x / 50、且没有重开入口。 */
      cur.challenge = { id: 'drift_terra', tier: 0 };
      cur.challengeDone = false; cur.lvl.terra_engine = 7;
      cur.broken = true; cur.shell = 0; cur.shellOpened = true;
      const driftPane = SB.ui.render.paneChallenges();
      check('破壳后 goal 型挑战仍是进行中，显示行星发动机 x/50 且不给重开入口',
        driftPane.includes('challenge-status active">进行中') &&
        driftPane.includes('行星发动机 7 / 50') &&
        !driftPane.includes('壳外推进') &&
        !driftPane.includes('data-challenge-start="drift_terra"') &&
        !driftPane.includes('非寒流季：保温法可正常使用'),
        'x/50=' + driftPane.includes('行星发动机 7 / 50') +
        ' 重开按钮=' + driftPane.includes('data-challenge-start="drift_terra"'));
      cur.challenge = snap.challenge; cur.challengeDone = snap.done; cur.broken = snap.broken;
      cur.shell = snap.shell; cur.shellOpened = snap.opened; cur.pollution = snap.pollution;
      cur.lvl.terra_engine = snap.engines;
    }
    {
      /* 2026-11-12：和平主义者挑战。与 anarchy / good_old_days 同构的终局挑战
       * （goal=dyson），整局禁止战争行动（war.js executeAction 预防性拦截），吞并 /
       * 软实力不受限；通关奖励 = 终局挑战 +10% 星屑基线 + 软实力成本 -20%。 */
      const def = api.byId('pacifist');
      check('和平主义者：终局挑战、goal=dyson、单档',
        !!def && def.kind === '终局挑战' && def.goal && def.goal.t === 'dyson' && def.tiers.length === 1,
        'kind=' + (def && def.kind));
      const ps = SB.state.freshRun(false);
      ps.challenge = { id: 'pacifist', tier: 0 }; ps.challengeDone = false;
      check('和平主义者：active 期内 warBlocked 为真', api.warBlocked(ps) === true);
      const blockedAct = SB.war.executeAction(ps, 'europa', 'raid');
      check('和平主义者：executeAction 被拦截（reason=pacifist）',
        blockedAct && blockedAct.ok === false && blockedAct.reason === 'pacifist',
        JSON.stringify(blockedAct));
      /* 软实力折扣：pacifist 通关后 softPowerCost ×0.8（吞并 / 软实力本就不受限）。 */
      const enemyStub = { faithActions: 0, cultureActions: 0 };
      const baseCost = SB.war.softPowerCost({}, enemyStub, 'faith');
      meta.challenges.completed.pacifist = true;
      const discCost = SB.war.softPowerCost({}, enemyStub, 'faith');
      meta.challenges.completed.pacifist = false;
      check('和平主义者：通关后软实力成本 -20%（1000→800）',
        baseCost === 1000 && discCost === 800, 'base=' + baseCost + ' disc=' + discCost);
      /* 星屑基线计入：与其它终局挑战共享 +10%。 */
      const mulBefore = api.stardustRewardMul({ challenges: { completed: {} } });
      const mulAfter = api.stardustRewardMul({ challenges: { completed: { pacifist: true } } });
      check('和平主义者：计入终局挑战 +10% 星屑基线',
        mulBefore === 1 && Math.abs(mulAfter - 1.1) < 1e-9, 'before=' + mulBefore + ' after=' + mulAfter);
      ps.challenge = savedLiveChallenge; ps.challengeDone = savedLiveChallengeDone;
    }
    {
      /* 2026-11-12：军事挑战系列（批判的武器改名 + 武器的批判 + 早打大打打核大战 +
       * grubby + 征服者）。与 pacifist 同构的终局挑战 / 三档挑战，约束走预防性拦截。 */
      const pac = api.byId('pacifist');
      check('批判的武器（原和平主义者）：显示名已改为「批判的武器」',
        !!pac && pac.name === '批判的武器', 'name=' + (pac && pac.name));
      const ids = ['weapon_critique', 'totalwar_doctrine', 'raider', 'conqueror'];
      check('新增四项军事挑战已注册', ids.every(id => !!api.byId(id)), ids.join(','));
      const wc = api.byId('weapon_critique'), tw = api.byId('totalwar_doctrine'),
        rd = api.byId('raider'), cq = api.byId('conqueror');
      check('武器的批判 / 早打大打打核大战 / grubby：终局挑战、goal=dyson、单档',
        wc.kind === '终局挑战' && wc.goal.t === 'dyson' && wc.tiers.length === 1 &&
        tw.kind === '终局挑战' && tw.goal.t === 'dyson' && tw.tiers.length === 1 &&
        rd.kind === '终局挑战' && rd.goal.t === 'dyson' && rd.tiers.length === 1,
        'kinds');
      check('征服者：三档挑战、goal=戴森+吞并7、档位倍率 1.5/2/3',
        cq.kind === '三档挑战' && cq.goal.t === 'all' &&
        cq.goal.of[0].t === 'dyson' && cq.goal.of[1].t === 'annex' && cq.goal.of[1].n === 7 &&
        cq.tiers.length === 3 && cq.tiers[0].cap === 1.5 && cq.tiers[1].cap === 2 && cq.tiers[2].cap === 3,
        'goal=' + JSON.stringify(cq.goal));
      /* 细粒度战争动作拦截：批判的武器禁全部；早打只许全面战争；grubby 只许劫掠。 */
      const mk = (id, tier) => { const s = SB.state.freshRun(false); s.challenge = { id, tier: tier || 0 }; s.challengeDone = false; return s; };
      const wpcs = mk('weapon_critique'), tws = mk('totalwar_doctrine'), rds = mk('raider');
      check('武器的批判：战争动作不在此列（warActionBlockedReason 为 null）',
        api.warActionBlockedReason(wpcs, 'raid') === null &&
        api.warActionBlockedReason(wpcs, 'totalWar') === null, 'wc');
      check('早打大打打核大战：只许全面战争（raid/invasion 被拦，totalWar 放行）',
        api.warActionBlockedReason(tws, 'raid') === 'totalwar_only' &&
        api.warActionBlockedReason(tws, 'invasion') === 'totalwar_only' &&
        api.warActionBlockedReason(tws, 'totalWar') === null, 'tw');
      check('grubby：只许劫掠（invasion/totalWar 被拦，raid 放行）',
        api.warActionBlockedReason(rds, 'invasion') === 'raider_only' &&
        api.warActionBlockedReason(rds, 'totalWar') === 'raider_only' &&
        api.warActionBlockedReason(rds, 'raid') === null, 'rd');
      /* 武器的批判：禁软实力 + 禁商路（预防性拦截）。 */
      const softS = SB.state.freshRun(false);
      softS.challenge = { id: 'weapon_critique', tier: 0 }; softS.challengeDone = false;
      softS.war.enemies.europa = { id: 'europa', nameKey: 'x', stage: 1, baseScale: 1000,
        currentScale: 100, faithReduction: 0, cultureReduction: 0, faithActions: 0, cultureActions: 0, status: 'active' };
      softS.civics.sovereign = true;
      check('武器的批判：softPowerBlocked 为真', api.softPowerBlocked(softS) === true);
      const softRes = SB.war.executeSoftPowerAction(softS, 'europa', 'faith');
      check('武器的批判：executeSoftPowerAction 被拦截（reason=weapon_critique）',
        softRes && softRes.ok === false && softRes.reason === 'weapon_critique', JSON.stringify(softRes));
      const routeS = SB.state.freshRun(false);
      routeS.challenge = { id: 'weapon_critique', tier: 0 }; routeS.challengeDone = false;
      routeS.civics.trade = true; routeS.war.tradeRouteLevel = 0; routeS.res.stone = 999999;
      check('武器的批判：tradeRouteBlocked 为真', api.tradeRouteBlocked(routeS) === true);
      const routeRes = SB.war.establishTradeRoute(routeS);
      check('武器的批判：establishTradeRoute 被拦截（reason=weapon_critique）',
        routeRes && routeRes.ok === false && routeRes.reason === 'weapon_critique', JSON.stringify(routeRes));
      /* 征服者：敌方恢复倍率读档位 cap。 */
      const cqS1 = mk('conqueror', 0), cqS3 = mk('conqueror', 2);
      check('征服者：enemyRecoveryMul 读档位（一档 1.5 / 三档 3）',
        Math.abs(api.enemyRecoveryMul(cqS1) - 1.5) < 1e-9 && api.enemyRecoveryMul(cqS3) === 3,
        'r1=' + api.enemyRecoveryMul(cqS1) + ' r3=' + api.enemyRecoveryMul(cqS3));
      /* goalMet 新增 annex 分支：统计已吞并敌国数。 */
      const annexS = { dysonDone: true, war: { enemies: { e1: { status: 'annexed' }, e2: { status: 'annexed' }, e3: { status: 'annexed' } } } };
      check('goalMet(annex,7)：不足 7 为 false', api.goalMet(annexS, { t: 'annex', n: 7 }) === false);
      annexS.war.enemies.e4 = { status: 'annexed' }; annexS.war.enemies.e5 = { status: 'annexed' };
      annexS.war.enemies.e6 = { status: 'annexed' }; annexS.war.enemies.e7 = { status: 'annexed' };
      check('goalMet(annex,7)：满 7 为 true', api.goalMet(annexS, { t: 'annex', n: 7 }) === true);
      check('goalMet(all[dyson+annex7])：戴森+吞并7 同时满足才 true',
        api.goalMet(annexS, { t: 'all', of: [{ t: 'dyson' }, { t: 'annex', n: 7 }] }) === true);
      /* 永久奖励基线：四项终局挑战各 +10%，征服者三档再 +10%/档。 */
      const mulBase = api.stardustRewardMul({ challenges: { completed: {} } });
      const mulAll = api.stardustRewardMul({ challenges: { completed: {
        pacifist: true, weapon_critique: true, totalwar_doctrine: true, raider: true, conqueror: 3 } } });
      check('星屑基线：四项单档 + 征服者三档 = 1 + 0.7 = 1.7',
        mulBase === 1 && Math.abs(mulAll - 1.7) < 1e-9, 'base=' + mulBase + ' all=' + mulAll);
      /* 永久奖励 hook：武器行动 -10% / 士兵 +15% / 战利品 +20%（tierDone 后生效）。 */
      const enemyStub = { faithActions: 0, cultureActions: 0 };
      meta.challenges.completed.weapon_critique = true;
      const wcCost = SB.war.actionCost({}, enemyStub, 'raid');
      meta.challenges.completed.weapon_critique = false;
      check('武器的批判：通关后战争行动成本 -10%（基线 ×0.9）', wcCost > 0 && Math.abs(wcCost / (1000 * 0.05) - 0.9) < 1e-6, 'cost=' + wcCost);
      meta.challenges.completed.totalwar_doctrine = true;
      const soldierMul = api.soldierOutputMul({});
      meta.challenges.completed.totalwar_doctrine = false;
      check('早打大打打核大战：通关后士兵产出 +15%', Math.abs(soldierMul - 1.15) < 1e-9, 'mul=' + soldierMul);
      meta.challenges.completed.raider = true;
      const lootMul = api.lootYieldMul({});
      meta.challenges.completed.raider = false;
      check('grubby：通关后战利品产出 +20%', Math.abs(lootMul - 1.2) < 1e-9, 'mul=' + lootMul);
    }

    /* ── 2026-11-04：挑战页「结算并挑战」必须真的结算本局 ──────────────────
     * 旧判据 `!s.broken` 在 11-03「破壳 ≠ 本局结束」之后语义反转：破壳后点那颗按钮
     * 整段跳过 doBreak，startRun 直接丢局 ⇒ 确认面板承诺的轮回点 / 星屑一分不发。
     * 这里跑**真实的** begin()：隔离账本 + 临时桩，跑完 finally 全还原，不污染全局 S / meta。 */
    {
      const src = api.begin.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      check('begin() 结算判据读 breakSettled，不再读 !s.broken',
        src.includes('!s.breakSettled') && !src.includes('!s.broken'), src.slice(0, 140));

      const G = SB.game, St = SB.state;
      const hasAchv = !!SB.achv, hasTransfer = !!SB.saveTransfer;
      const saved = {
        run: G.run, meta: G.meta, snapshot: G.snapshot, startRun: G.startRun,
        setTab: G.setTab, log: G.log, renderAll: G.renderAll, emit: G.emit,
        submit: G.submitRankOnBreak, saveRun: St.saveRun, saveMeta: St.saveMeta,
        achvOnBreak: hasAchv ? SB.achv.onBreak : null,
        backupSoon: hasTransfer ? SB.saveTransfer.backupSoon : null
      };
      const fac = (SB.BUILDINGS || []).filter(b => b.stardustFacility).slice(0, 2).map(b => b.id);
      function scenario(broken, settled, qual) {
        const fm = {
          tide: 0, tideEarnedTotal: 0, stardust: 0, stardustEarned: 0,
          rebirths: 0, oldFaith: 0, oldArtworkEarnedTotal: 0, oldTideStelesEarnedTotal: 0,
          shopUnlocked: false, perks: {}, challenges: { completed: {} },
          achievements: {}, achv: {}, memorialWonders: {}
        };
        const rs = SB.state.freshRun(false);
        rs.civics.theology = qual;
        rs.peak = 120; rs.pop = 100;
        (SB.BUILDINGS || []).filter(b => !b.stardustFacility).slice(0, 3)
          .forEach(b => { rs.lvl[b.id] = 8; });
        fac.forEach(id => { rs.lvl[id] = 30; });
        rs.shell = broken ? 0 : 200000;
        rs.shellOpened = broken; rs.broken = broken; rs.breakSettled = settled;
        let starts = 0;
        G.run = () => rs; G.meta = () => fm;
        G.snapshot = () => ({}); G.startRun = () => { starts++; };
        G.setTab = noop; G.log = noop; G.renderAll = noop; G.emit = noop;
        G.submitRankOnBreak = noop; St.saveRun = noop; St.saveMeta = noop;
        if (hasAchv) SB.achv.onBreak = noop;
        if (hasTransfer) SB.saveTransfer.backupSoon = noop;
        const rep = SB.prestige.breakReport(rs);
        const before = { tide: fm.tide, sd: fm.stardust };
        let threw = null;
        try { api.begin('waterpollution'); } catch (e) { threw = e; }
        return { rs: rs, fm: fm, rep: rep, before: before, starts: starts, threw: threw };
      }
      let A, B, C, D;
      try {
        A = scenario(true, false, true);    // 破壳后未结算 ← 玩家报的场景
        B = scenario(false, false, true);   // 破壳前（对照组）
        C = scenario(true, true, true);     // 已结算（幂等组）
        D = scenario(true, false, false);   // 未学神学（普通重开，不发点）
      } finally {
        G.run = saved.run; G.meta = saved.meta; G.snapshot = saved.snapshot;
        G.startRun = saved.startRun; G.setTab = saved.setTab; G.log = saved.log;
        G.renderAll = saved.renderAll; G.emit = saved.emit;
        G.submitRankOnBreak = saved.submit;
        St.saveRun = saved.saveRun; St.saveMeta = saved.saveMeta;
        if (hasAchv) SB.achv.onBreak = saved.achvOnBreak;
        if (hasTransfer) SB.saveTransfer.backupSoon = saved.backupSoon;
      }
      check('四条路径 begin() 都不抛错且各切一次周目',
        !A.threw && !B.threw && !C.threw && !D.threw &&
        A.starts === 1 && B.starts === 1 && C.starts === 1 && D.starts === 1,
        'A=' + A.starts + ' B=' + B.starts + ' C=' + C.starts + ' D=' + D.starts);
      check('★ 破壳后「结算并挑战」按预估发放轮回点（旧代码发 0）',
        A.fm.tide - A.before.tide === A.rep.tidePoints && A.rep.tidePoints > 0,
        '预估=' + A.rep.tidePoints + ' 实发=' + (A.fm.tide - A.before.tide));
      check('★ 破壳后「结算并挑战」同步发放星屑（旧代码发 0）',
        A.fm.stardust - A.before.sd === A.rep.stardust && A.rep.stardust > 0,
        '预估=' + A.rep.stardust + ' 实发=' + (A.fm.stardust - A.before.sd));
      check('破壳后结算确实发生（breakSettled 置真）', A.rs.breakSettled === true);
      check('破壳前同一按钮仍按预估入账（提前轮回不被改坏）',
        B.fm.tide - B.before.tide === B.rep.tidePoints && B.rep.tidePoints > 0,
        '预估=' + B.rep.tidePoints + ' 实发=' + (B.fm.tide - B.before.tide));
      check('已结算局不重复入账（doBreak 幂等锁）',
        C.fm.tide === C.before.tide && C.fm.stardust === C.before.sd);
      check('未学《神学》仍走普通重开：不发点、不写 breakSettled',
        D.fm.tide === 0 && D.fm.stardust === 0 && D.rs.breakSettled === false);
    }

    /* ── 2026-11-09 「永远与须臾」竣工面板分母塌陷（玩家报「怎么没有翻倍」）────
     * goal 型一达成 active() 返回 null ⇒ multiplier 掉回 1 ⇒ 帆/节点/星空三个目标分母
     * 在 4 段分镜结束、showDysonCompletePanel 渲染时早已塌回基础值（截图 258,358 / 10,000）。
     * 目标分母属于「本局档位快照」，必须达成前后恒等；研究成本属于「限制」，达成后解除。
     * 这里直接切 challengeDone 模拟 award() 之后的状态，读真实 production 函数，不 mock。 */
    {
      const em = SB.state.freshRun(false);
      em.challenge = { id: 'eternity_moment', tier: 0, replay: false };
      em.challengeDone = false;
      const sailBefore = api.dysonSailCap(em), nodeBefore = api.dysonNodeCap(em),
        starBefore = api.starCap(em), shellBefore = api.shellTarget(em);
      const limitBefore = api.multiplier(em);
      em.challengeDone = true;
      check('★ 永远与须臾：达成后目标分母仍是本局 ×5 快照，不随挑战完成塌陷',
        api.dysonSailCap(em) === sailBefore && api.dysonNodeCap(em) === nodeBefore &&
        api.starCap(em) === starBefore && api.shellTarget(em) === shellBefore &&
        api.runMultiplier(em) === 5 &&
        sailBefore === (Number(SB.CFG.DYSON_SAIL_CAP) || 10000) * 5 &&
        nodeBefore === (Number(SB.CFG.DYSON_NODE_CAP) || 1000) * 5 &&
        starBefore === Number(SB.CFG.STAR_CAP || 0) * 5,
        '帆 ' + sailBefore + ' / 节点 ' + nodeBefore + ' / 星空 ' + starBefore);
      check('★ 永远与须臾：研究成本属限制口径，达成后解除；目标分母不受影响',
        limitBefore === 5 && api.multiplier(em) === 1 &&
        api.dysonSailCap(em) === sailBefore,
        '限制倍率 ' + limitBefore + ' → ' + api.multiplier(em));
    }
  } finally {
    meta.challenges = savedProgress;
    meta.achv = savedAchv;
    meta.achievements = savedAchievements;
    meta.challengePopupPending = savedChallengePopupPending;
    SB.state.saveMeta(meta);
  }
}
