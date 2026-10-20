/* e2e suite: reusable bot strategy decisions that unblock progression. */
export function run({ SB, check, noop }) {
  console.log('\n=== Bot策略 ===');
  const s = SB.state.freshRun(false);
  s.era = 4;
  s.pop = 43; s.peak = 43;
  s.lvl.nest = 9;
  s.lvl.coralhouse = 6;
  s.lvl.kelp = 25;
  s.lvl.workshop = 1;
  s.lvl.hall = 20;
  s.lvl.ballast = 1;
  s.upgrades.upg_castle = true;
  s.challenge = { id: 'cold', tier: 0 };
  SB.TECHS.forEach(t => { if (t.era <= 4) s.techs[t.id] = true; });
  s.techs.invert = false;
  s.res.ironBracket = 50;
  s.res.rope = 50;

  const before = SB.economy.capOf(s, 'coral');
  const decision = SB.aiStrategy.step(s, { emit: noop });
  check('住房造价超过仓储时优先安装可用的压舱库扩容升级',
    !!s.upgrades.upg_ballast_1 && SB.economy.capOf(s, 'coral') > before,
    'decision=' + JSON.stringify(decision) + ' cap=' + before + '→' + SB.economy.capOf(s, 'coral'));

  const unlimitedCraft = SB.state.freshRun(false);
  unlimitedCraft.res.tiplate = 50;
  SB.economy.addRes(unlimitedCraft, 'tiplate', 60000);
  check('钛金板件累积不受仓储或合金仓储升级限制',
    SB.economy.capOf(unlimitedCraft, 'tiplate') === Infinity && unlimitedCraft.res.tiplate === 60050,
    'cap=' + SB.economy.capOf(unlimitedCraft, 'tiplate') + ' 板件=' + unlimitedCraft.res.tiplate);

  const coldBuffer = SB.state.freshRun(false);
  coldBuffer.era = 3; coldBuffer.pop = 31; coldBuffer.peak = 31;
  Object.assign(coldBuffer.lvl, { nest: 15, kelp: 20, workshop: 1, hall: 20,
    siltpit: 3, library: 6, ballast: 100 });
  Object.assign(coldBuffer.upgrades, { upg_castle: true, upg_ballast_1: true, upg_ballast_2: true });
  coldBuffer.challenge = { id: 'cold', tier: 0 };
  SB.TECHS.forEach(t => { if (t.era <= 3) coldBuffer.techs[t.id] = true; });
  Object.keys(coldBuffer.res).forEach(r => { coldBuffer.res[r] = 1000000000; });
  const coldCapBefore = SB.economy.popCap(coldBuffer);
  const coldDecision = SB.aiStrategy.step(coldBuffer, { emit: noop });
  check('寒流禁火挑战主动扩住房（目标 50，高于常规 30）',
    coldCapBefore === 31 && SB.economy.popCap(coldBuffer) > coldCapBefore,
    'decision=' + JSON.stringify(coldDecision) + ' capacity=' + coldCapBefore + '→' + SB.economy.popCap(coldBuffer));

  const civicWonder = SB.state.freshRun(false);
  civicWonder.era = 3;
  civicWonder.challenge = { id: 'cold', tier: 0 };
  Object.assign(civicWonder.lvl, { workshop: 1, hall: 1 });
  SB.TECHS.forEach(t => { if (t.era <= 3) civicWonder.techs[t.id] = true; });
  civicWonder.civics.laws = true;
  Object.keys(civicWonder.res).forEach(r => { civicWonder.res[r] = 1e9; });
  SB.aiStrategy.step(civicWonder, { emit: noop });
  check('住房目标未满时仍优先建解锁《戏剧与诗歌》所需的首座奇观',
    SB.wonder.count(civicWonder) > 0 && SB.economy.popCap(civicWonder) < 50,
    '奇观=' + SB.wonder.count(civicWonder) + ' popCap=' + SB.economy.popCap(civicWonder));

  const zoneGate = SB.state.freshRun(false);
  zoneGate.era = 4;
  zoneGate.pop = 39; zoneGate.peak = 39;
  Object.assign(zoneGate.lvl, { nest: 9, coralhouse: 5, kelp: 23, hall: 1,
    workshop: 1, ballast: 47, institute: 3, library: 6, siltpit: 3 });
  zoneGate.upgrades.upg_ballast_1 = true;
  zoneGate.challenge = { id: 'cold', tier: 0 };
  SB.TECHS.forEach(t => { if (t.era <= 4) zoneGate.techs[t.id] = true; });
  zoneGate.techs.shellwatch = false;
  zoneGate.techs.castle = false;
  SB.CIVICS.forEach(c => { zoneGate.civics[c.id] = true; });
  Object.keys(zoneGate.res).forEach(r => { zoneGate.res[r] = 1e9; });
  const zoneLibraryBefore = zoneGate.lvl.library;
  const zoneDecision = SB.aiStrategy.step(zoneGate, { emit: noop });
  check('住房被仓储卡住时继续推进当前区域尤里卡建筑',
    zoneDecision.goal === 'shellwatch' && zoneGate.lvl.library > zoneLibraryBefore,
    'decision=' + JSON.stringify(zoneDecision) + ' library=' + zoneLibraryBefore + '→' + zoneGate.lvl.library);

  s.upgrades.upg_ballast_2 = true;
  Object.assign(s.civics, { political: 1, theology: 1, records: 1, guild: 1, market: 1 });
  s.gov = 'autocracy';
  s.cards = ['card_theology', 'card_guild', 'card_records'];
  const beforeMarket = SB.economy.capOf(s, 'coral');
  SB.aiStrategy.step(s, { emit: noop });
  check('住房仍受仓储限制时识别并优先装填 storeMul 政策卡',
    s.cards.indexOf('card_market') >= 0 && SB.economy.capOf(s, 'coral') > beforeMarket,
    'cards=' + JSON.stringify(s.cards) + ' cap=' + beforeMarket + '→' + SB.economy.capOf(s, 'coral'));
  SB.aiStrategy.step(s, { emit: noop });
  check('仓储受限期间保留已装的容量政策卡，不与常规选卡来回覆盖',
    s.cards.indexOf('card_market') >= 0,
    'cards=' + JSON.stringify(s.cards));

  const hold = SB.state.freshRun(false);
  hold.era = 4; hold.pop = 49; hold.peak = 49;
  Object.assign(hold.lvl, { nest: 10, coralhouse: 7, kelp: 28, hall: 20, ballast: 43, workshop: 1 });
  Object.assign(hold.upgrades, { upg_castle: true, upg_ballast_1: true, upg_ballast_2: true });
  hold.challenge = { id: 'cold', tier: 0 };
  SB.TECHS.forEach(t => { if (t.era <= 4) hold.techs[t.id] = true; });
  hold.techs.invert = false;
  Object.assign(hold.civics, { political: 1, theology: 1, records: 1, guild: 1, market: 1 });
  hold.gov = 'autocracy';
  hold.cards = ['card_records', 'card_drama', 'card_theology'];
  const coralCap = SB.economy.capOf(hold, 'coral');
  const nestCost = SB.economy.costOf(hold, 'nest').coral;
  hold.res.coral = coralCap;
  check('回归夹具复现 pop49 的下一巢造价高于原珊瑚仓上限', coralCap < nestCost,
    'coral cap=' + coralCap + ' nest=' + nestCost);
  SB.aiStrategy.step(hold, { emit: noop });
  const expanded = SB.economy.capOf(hold, 'coral');
  check('容量卡把下一巢造价纳入仓储后，仍能保留到住房目标推进',
    hold.cards.indexOf('card_market') >= 0 && expanded >= nestCost && SB.economy.popCap(hold) < 50,
    'cards=' + JSON.stringify(hold.cards) + ' coral cap=' + coralCap + '→' + expanded + ' popCap=' + SB.economy.popCap(hold));
  SB.aiStrategy.step(hold, { emit: noop });
  check('住房资源尚未攒够时不会因瞬时解除容量阻塞而卸掉容量卡',
    hold.cards.indexOf('card_market') >= 0,
    'cards=' + JSON.stringify(hold.cards));

  const steel = SB.state.freshRun(false);
  steel.era = 5; steel.pop = 51; steel.peak = 51;
  Object.assign(steel.lvl, { nest: 11, coralhouse: 7, kelp: 29, hall: 20, ballast: 37,
    workshop: 1, siltpit: 3, hydroturbine: 1, hydroshop: 1 });
  Object.assign(steel.upgrades, { upg_castle: true, upg_ballast_1: true, upg_ballast_2: true,
    upg_fishbonemine: true });
  steel.challenge = { id: 'cold', tier: 0 };
  SB.TECHS.forEach(t => { if (t.era <= 5) steel.techs[t.id] = true; });
  steel.techs.abyssgeo = false; steel.techs.shellgeo = false; steel.techs.skydrill = false;
  steel.jobs.miner = 11;
  Object.assign(steel.civics, { political: 1, theology: 1, records: 1, market: 1 });
  steel.gov = 'autocracy';
  Object.assign(steel.res, { stone: 10000, hardCoral: 1000, iron: 1000, steelPart: 29.7,
    steel: 18, warmstone: 1000, science: 150000, culture: 100000 });
  const steelDecision = SB.aiStrategy.step(steel, { emit: noop });
  const steelTurbines = steel.lvl.hydroturbine - (steel.turbineStop || 0);
  const steelShops = steel.lvl.hydroshop - (steel.hydroshopStop || 0);
  const steelSupport = Math.floor((SB.economy.rates(steel).warmstone + 1e-9) / SB.UNIT.hydroWarm);
  check('钢制零件目标受暖石净产能约束，不盲目扩建/运行汽轮机',
    steelTurbines <= steelSupport && steelShops <= steelTurbines,
    'decision=' + JSON.stringify(steelDecision) + ' warmstone=' + SB.economy.rates(steel).warmstone +
      '/s running=' + steelTurbines + '/' + steelShops + ' sustainable=' + steelSupport);

  const thermal = SB.state.freshRun(false);
  thermal.era = 5; thermal.pop = 20; thermal.peak = 20;
  Object.assign(thermal.lvl, { kelp: 8, nest: 8, hall: 1, workshop: 1,
    hydroturbine: 8, hydroshop: 8 });
  Object.assign(thermal.jobs, { gather: 5, miner: 5, scholar: 2, scribe: 1 });
  thermal.challenge = { id: 'cold', tier: 0 };
  SB.TECHS.forEach(t => { if (t.era <= 5) thermal.techs[t.id] = true; });
  thermal.techs.abyssgeo = false;
  thermal.res.warmstone = 1000;
  SB.aiStrategy.step(thermal, { emit: noop });
  const hydroRun = thermal.lvl.hydroturbine - (thermal.turbineStop || 0);
  const shopRun = thermal.lvl.hydroshop - (thermal.hydroshopStop || 0);
  const sustainable = Math.floor((SB.economy.rates(thermal).warmstone + 1e-9) / SB.UNIT.hydroWarm);
  check('暖石供应不足时自动停用超出可持续产量的汽轮机/热液工坊',
    hydroRun <= sustainable && shopRun <= hydroRun,
    'warmstone=' + SB.economy.rates(thermal).warmstone + '/s running=' + hydroRun + '/' + shopRun +
      ' sustainable=' + sustainable);

  const steelTools = SB.state.freshRun(false);
  steelTools.era = 4; steelTools.pop = 80; steelTools.peak = 80; /* 2026-10-17：原 pop=31 工人被食物/其它职业挤到仅 13 矿工，
               * 暖石毛供 3.64/s < 单机 5/s（hydroWarm）⇒ 汽轮机被正常停用、running=0。
               * 抬到 80 解除工人瓶颈，AI 可分到 ~21 矿工、毛供 ~5.9/s ⇒ 汽轮机正常运行。
               * 暖石唯一来源是矿工（economy-rates.js:118），siltpit 只放大基准不增工人，故调 pop 而非 siltpit。 */
  Object.assign(steelTools.lvl, { kelp: 20, nest: 10, coralhouse: 6, hall: 20,
    ballast: 20, workshop: 1, siltpit: 3, hydroturbine: 1, hydroshop: 0, library: 12, institute: 8 });
  Object.assign(steelTools.upgrades, { upg_castle: true, upg_ballast_1: true, upg_ballast_2: true,
    upg_fishbonemine: true });
  steelTools.challenge = { id: 'cold', tier: 0 };
  SB.TECHS.forEach(t => { if (t.era <= 4 && t.id !== 'physics') steelTools.techs[t.id] = true; });
  steelTools.techs.physics = false;
  steelTools.jobs = { gather: 10, coralwright: 4, quarrier: 2, miner: 8, scholar: 4, scribe: 2, merchant: 1 };
  Object.assign(steelTools.civics, { political: 1, theology: 1, records: 1, market: 1 });
  steelTools.gov = 'autocracy';
  steelTools.cards = ['card_market', 'card_theology', 'card_records'];
  Object.assign(steelTools.res, { kelp: 10000, coral: 10000, stone: 100, hardCoral: 1000,
    iron: 0, silt: 1000, warmstone: 1000, science: 200000, culture: 100000 });
  const steelToolDecision = SB.aiStrategy.step(steelTools, { emit: noop });
  /* ⚠️ 2026-10-16：rates().warmstone 现在已扣掉**运行中**汽轮机的耗石（面板===结算，
   *   见 economy-rates 的 _turL 扣减行）。这条断言要的是「暖石毛供 ≥ 一台汽轮机一份」
   *   —— 即暖石线撑得起它 —— 所以把汽轮机自身那一份加回来（与 ai-strategy.hydroSupportCap 同口径）。 */
  const steelToolWarmRate = SB.economy.rates(steelTools).warmstone +
    (SB.economy.warmDraw ? SB.economy.warmDraw(steelTools, 'hydroturbine') : 0);
  const steelToolRunning = steelTools.lvl.hydroturbine - (steelTools.turbineStop || 0);
  check('钢工具尤里卡缺钢时配够矿工，并保留石料采集以建设热液生产线',
    steelTools.jobs.miner >= 10 && steelTools.jobs.quarrier > 0 &&
      steelToolWarmRate >= SB.UNIT.hydroWarm && steelToolRunning >= 1,
    'decision=' + JSON.stringify(steelToolDecision) + ' miners=' + steelTools.jobs.miner +
      ' quarriers=' + steelTools.jobs.quarrier + ' warmstone=' + steelToolWarmRate +
      '/s running=' + steelToolRunning);

  const cutter = SB.state.freshRun(false);
  cutter.era = 5; cutter.pop = 31; cutter.peak = 31;
  Object.assign(cutter.lvl, { kelp: 20, nest: 10, coralhouse: 6, hall: 20,
    ballast: 20, workshop: 1, siltpit: 3, hydroturbine: 8, hydroshop: 8, library: 12, institute: 8 });
  Object.assign(cutter.upgrades, { upg_castle: true, upg_ballast_1: true, upg_ballast_2: true,
    upg_fishbonemine: true, upg_deepmine: true });
  SB.TECHS.forEach(t => { if (t.era <= 5) cutter.techs[t.id] = true; });
  cutter.techs.highthermo = false;
  cutter.techs.skydrill = false;
  cutter.wonders.wonder_tide_stele = true;
  cutter.jobs = { gather: 6, coralwright: 4, quarrier: 2, miner: 8, scholar: 4, scribe: 5, merchant: 2 };
  Object.assign(cutter.res, { kelp: 100, coral: 100, stone: 10000, hardCoral: 0,
    iron: 10000, silt: 10000, warmstone: 10000, steel: 0, steelPart: 100,
    rope: 0, scaffold: 0, titanium: 10000, resonantDrill: 1000,
    science: 1000000, culture: 1000000 });
  const cutterDecision = SB.aiStrategy.step(cutter, { emit: noop });
  const cutterRates = SB.economy.rates(cutter);
  const finalGather = cutter.jobs.gather;
  cutter.jobs.gather = 0;
  const finalBuiltFood = SB.economy.foodRate(cutter);
  cutter.jobs.gather = 1;
  const finalGatherMarginal = SB.economy.foodRate(cutter) - finalBuiltFood;
  cutter.jobs.gather = finalGather;
  const finalFoodNeed = Math.max(0, Math.min(Math.ceil((SB.economy.foodUse(cutter) * 1.12 - finalBuiltFood) /
    Math.max(finalGatherMarginal, 0.000001)), cutter.pop - 1));
  check('关键奇观的科技门回溯到高压热机，并按珊瑚产速补藻食制绳',
    cutterDecision.goal === 'highthermo' && finalGather >= Math.max(0, finalFoodNeed - 1) &&
      cutter.jobs.gather <= finalFoodNeed + Math.ceil(cutter.pop * 0.25) &&
      cutterRates.kelp + 1e-9 >= Math.max(1, cutterRates.coral) &&
      cutter.jobs.coralwright >= 5 && cutter.upgrades.upg_hppump,
    'decision=' + JSON.stringify(cutterDecision) + ' gather=' + cutter.jobs.gather +
      ' food-only baseline=' + finalFoodNeed + ' kelp/coral=' + cutterRates.kelp + '/' +
      cutterRates.coral + ' coralwright=' + cutter.jobs.coralwright +
      ' hppump=' + !!cutter.upgrades.upg_hppump);

  const drillAtFloor = SB.state.freshRun(false);
  drillAtFloor.techs.shellgeo = true;
  drillAtFloor.shell = drillAtFloor.iceShell * SB.CFG.FLOOR_AT;
  check('钻头预算覆盖最后 25% 壳层与建造耗材',
    SB.aiStrategy.drillStockTarget(drillAtFloor) === 152,
    'target=' + SB.aiStrategy.drillStockTarget(drillAtFloor));

  const wonderTechGate = SB.state.freshRun(false);
  wonderTechGate.era = 5;
  SB.TECHS.forEach(t => { if (t.era <= 5) wonderTechGate.techs[t.id] = true; });
  wonderTechGate.techs.industrialize = false;
  wonderTechGate.techs.highthermo = false;
  wonderTechGate.techs.skydrill = false;
  wonderTechGate.wonders.wonder_shellcutter = true;
  const wonderGateGoal = SB.aiStrategy.researchGoal(wonderTechGate);
  check('关键科技的必需奇观被普通科技锁住时，bot 回溯到解锁科技及其前置',
    wonderGateGoal.id === 'industrialize' && wonderGateGoal.cond &&
      wonderGateGoal.cond.t === 'rate' && wonderGateGoal.cond.r === 'hydroSupply',
    'goal=' + wonderGateGoal.id + ' cond=' + JSON.stringify(wonderGateGoal.cond));

  wonderTechGate.pop = 51; wonderTechGate.peak = 51;
  Object.assign(wonderTechGate.lvl, { kelp: 29, nest: 11, coralhouse: 7, hall: 20,
    siltpit: 3, workshop: 1, ballast: 37, hydroturbine: 5, hydroshop: 5 });
  Object.assign(wonderTechGate.upgrades, { upg_castle: true, upg_ballast_1: true,
    upg_ballast_2: true, upg_fishbonemine: true, upg_deepmine: true, upg_hppump: true });
  Object.assign(wonderTechGate.jobs, { gather: 9, miner: 9, coralwright: 11,
    quarrier: 5, scholar: 11, scribe: 4, merchant: 2 });
  Object.keys(wonderTechGate.res).forEach(r => { wonderTechGate.res[r] = 1e9; });
  const supplyBefore = SB.economy.rates(wonderTechGate).hydroSupply;
  const supplyDecision = SB.aiStrategy.step(wonderTechGate, { emit: noop });
  check('追逐热液能供给尤里卡时自动扩建足够数量的汽轮机',
    supplyBefore < 10 && wonderTechGate.lvl.hydroturbine > 5,
    'supply=' + supplyBefore + ' turbine=' + wonderTechGate.lvl.hydroturbine +
      ' decision=' + JSON.stringify(supplyDecision));

  const shellGateWonders = SB.state.freshRun(false);
  shellGateWonders.era = 6;
  shellGateWonders.pop = 31; shellGateWonders.peak = 31;
  shellGateWonders.shell = 1;
  Object.assign(shellGateWonders.lvl, { nest: 15, workshop: 1, hall: 1 });
  SB.TECHS.forEach(t => { if (t.era <= 6) shellGateWonders.techs[t.id] = true; });
  shellGateWonders.techs.exostruct = false;
  SB.CIVICS.forEach(c => { shellGateWonders.civics[c.id] = true; });
  SB.WONDERS.forEach(w => { shellGateWonders.wonders[w.id] = true; });
  shellGateWonders.wonders.wonder_skydrill = false;
  shellGateWonders.wonders.wonder_cradle = false; // ERA7 奇观要破壳后科技，不能成为钻机前置死锁
  Object.keys(shellGateWonders.res).forEach(r => { shellGateWonders.res[r] = 1e9; });
  const shellGateDecision = SB.aiStrategy.step(shellGateWonders, { emit: noop });
  check('壳外科技被 100% 破壳门槛挡住时，允许钻机先打通时代门，再回来补 ERA7 奇观',
    shellGateDecision.goal === 'exostruct' && !!shellGateWonders.wonders.wonder_skydrill,
    'decision=' + JSON.stringify(shellGateDecision) + ' sky=' + !!shellGateWonders.wonders.wonder_skydrill +
      ' remaining=' + SB.WONDERS.filter(w => !shellGateWonders.wonders[w.id]).map(w => w.id).join(','));

  const optionalMaterial = SB.state.freshRun(false);
  optionalMaterial.era = 6;
  optionalMaterial.pop = 31; optionalMaterial.peak = 31;
  Object.assign(optionalMaterial.lvl, { nest: 15, kelp: 200, workshop: 1, hall: 1 });
  SB.TECHS.forEach(t => { optionalMaterial.techs[t.id] = true; });
  SB.CIVICS.forEach(c => { optionalMaterial.civics[c.id] = true; });
  SB.WONDERS.forEach(w => { optionalMaterial.wonders[w.id] = true; });
  optionalMaterial.wonders.wonder_shadow_theater = false;
  Object.keys(optionalMaterial.res).forEach(r => { optionalMaterial.res[r] = 1e9; });
  ['kelp', 'coral', 'hardCoral', 'rope', 'scaffold'].forEach(r => { optionalMaterial.res[r] = 0; });
  const materialDecision = SB.aiStrategy.step(optionalMaterial, { emit: noop });
  check('可选奇观的脚手架链缺藻食时，即使建筑口粮充足也派采集者供绳料',
    materialDecision.wonder === 'wonder_shadow_theater' && optionalMaterial.jobs.gather >= 8,
    'decision=' + JSON.stringify(materialDecision) + ' gather=' + optionalMaterial.jobs.gather);

  const optionalWonders = SB.state.freshRun(false);
  optionalWonders.era = 6;
  optionalWonders.lvl.nest = 15;
  optionalWonders.pop = SB.economy.popCap(optionalWonders);
  SB.TECHS.forEach(t => { optionalWonders.techs[t.id] = true; });
  SB.CIVICS.forEach(c => { optionalWonders.civics[c.id] = true; });
  optionalWonders.lvl.workshop = 1;
  Object.keys(optionalWonders.res).forEach(r => { optionalWonders.res[r] = 1e9; });
  optionalWonders.res.resonantDrill = 0;
  SB.WONDERS.forEach(w => { optionalWonders.wonders[w.id] = true; });
  optionalWonders.wonders.wonder_shadow_theater = false;
  optionalWonders.wonders.wonder_congress = false;
  optionalWonders.wonders.wonder_skydrill = false;
  SB.aiStrategy.step(optionalWonders, { emit: noop });
  check('全奇观策略先建其它可用奇观，不提前启动破壳钻机',
    optionalWonders.wonders.wonder_shadow_theater && optionalWonders.wonders.wonder_congress &&
      !optionalWonders.wonders.wonder_skydrill,
    'theater=' + !!optionalWonders.wonders.wonder_shadow_theater +
      ' congress=' + !!optionalWonders.wonders.wonder_congress +
      ' skydrill=' + !!optionalWonders.wonders.wonder_skydrill);
  check('其余奇观完成前不囤天穹钻机耗材', optionalWonders.res.resonantDrill === 0,
    'resonantDrill=' + optionalWonders.res.resonantDrill);

  const finalWonder = SB.state.freshRun(false);
  finalWonder.era = 6;
  finalWonder.lvl.nest = 15;
  finalWonder.pop = SB.economy.popCap(finalWonder);
  SB.TECHS.forEach(t => { finalWonder.techs[t.id] = true; });
  SB.CIVICS.forEach(c => { finalWonder.civics[c.id] = true; });
  finalWonder.lvl.workshop = 1;
  Object.keys(finalWonder.res).forEach(r => { finalWonder.res[r] = 1e9; });
  SB.WONDERS.forEach(w => { finalWonder.wonders[w.id] = true; });
  finalWonder.wonders.wonder_skydrill = false;
  SB.aiStrategy.step(finalWonder, { emit: noop });
  check('天穹钻机是全部奇观队列中的最后一座，并在建成后自动启动',
    finalWonder.wonders.wonder_skydrill && finalWonder.skydrillOn,
    'built=' + !!finalWonder.wonders.wonder_skydrill + ' on=' + !!finalWonder.skydrillOn);
}
