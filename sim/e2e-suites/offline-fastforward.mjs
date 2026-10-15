/* e2e suite: event-batched offline catch-up stays close to the 0.1s reference. */
export function run({ SB, check }) {
  const oldRng = SB.rng;
  const STEP = 0.1;
  const OFFLINE_SECONDS = 1800;

  function configure(s) {
    s.t = 0;
    s._seasonIdx = 0;
    s.frozen = false;
    s.broken = false;
    s.era = 7;
    s.pop = 30;
    s.peak = 30;
    s.jobs = Object.assign(s.jobs, { gather: 35, coralwright: 2, quarrier: 1, miner: 1, scholar: 1, scribe: 0, merchant: 1 });
    s.lvl = Object.assign(s.lvl, { kelp: 40, kelpstore: 2, ballast: 100, nest: 20, siltpit: 10, library: 8, institute: 4, school: 3,
      researchlab: 2, furnace: 4, hydroturbine: 2, hydroshop: 2, caravanserai: 2, temple: 3 });
    s.res = Object.assign(s.res, { kelp: 10000, coral: 10000, stone: 10000, silt: 10000,
      warmstone: 10000, iron: 1000, science: 1000, culture: 1000, luxury: 1000,
      faith: 1000, fuel: 1000, hydro: 0, steel: 0 });
    s.civics = { trade: 1, theology: 1, explore: 1, market: 1 };
    s.civShown = {};
    s.techs = {};
    for (const t of SB.TECHS || []) s.techs[t.id] = true;
    s.eurekaMet = {};
    s._grow = 0;
    s.famine = 0;
    s.warmOn = false;
    s.ad.on = false;
    s.ad.ms = 0;
    s.pop = SB.economy.popCap(s); // Keep population fixed during the resource comparison.
    s.peak = s.pop;
  }

  function reference(s) {
    let ticks = 0;
    for (let i = 1; i <= OFFLINE_SECONDS / STEP; i++) {
      SB.economy.tick(s, STEP, null);
      ticks++;
      if (s._seasonGrantPending) {
        SB.economy.seasonGrant(s);
        s._seasonGrantPending = false;
      }
      if (i % 20 === 0) {
        SB.game.pumpTech(s, null);
        SB.game.pumpCivic(s, null);
      }
    }
    return ticks;
  }

  function runOne() {
    SB.game.resetRun();
    const s = SB.game.run();
    configure(s);
    SB.rng = () => 0.999999; // Keep seasonal freeze rolls deterministic in both paths.
    return s;
  }

  try {
    const base = runOne();
    const before = JSON.parse(JSON.stringify(base));
    const ref = JSON.parse(JSON.stringify(before));
    const referenceTicks = reference(ref);

    const fast = runOne();
    const origTick = SB.economy.tick;
    let fastTicks = 0;
    SB.economy.tick = function (s, dt, emit, opts) {
      fastTicks++;
      return origTick(s, dt, emit, opts);
    };
    SB.game.planCatchUp(fast, OFFLINE_SECONDS);
    SB.game.drainCatchUp(1000000);
    SB.economy.tick = origTick;

    const resourceKeys = ['kelp', 'coral', 'stone', 'silt', 'warmstone', 'iron', 'science', 'culture', 'luxury', 'faith', 'fuel', 'steel'];
    let worst = { key: '', error: 0, ref: 0, fast: 0 };
    for (const key of resourceKeys) {
      const expected = ref.res[key] || 0;
      const actual = fast.res[key] || 0;
      const error = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
      if (error > worst.error) worst = { key, error, ref: expected, fast: actual };
    }

    check('离线批量推进 30 分钟仍完整覆盖逻辑时间', Math.abs(fast.t - OFFLINE_SECONDS) < 1e-6,
      't=' + fast.t.toFixed(1));
    check('离线事件分段将 tick 调用降到 0.1 秒基准的 20% 以下', fastTicks <= referenceTicks / 5,
      fastTicks + ' / ' + referenceTicks + ' 次');
    check('晚期资源对照误差控制在用户接受的 20% 内', worst.error <= 0.2,
      worst.key + ' ' + (worst.error * 100).toFixed(2) + '%（ref=' + worst.ref.toFixed(2) + ', fast=' + worst.fast.toFixed(2) +
        '；人口 ref=' + ref.pop + '/fast=' + fast.pop + ', 饥荒 ref=' + ref.famineDeaths + '/fast=' + fast.famineDeaths + '）');

    // Cover the food -> famine -> death feedback path that a stable, full-storage run cannot exercise.
    const starvationSeconds = 120;
    function configureStarvation(s) {
      s.jobs = Object.assign(s.jobs, {});
      for (const job of Object.keys(s.jobs)) s.jobs[job] = 0;
      s.lvl.kelp = 0;
      s.res.kelp = 0.5;
      s.pop = Math.min(4, SB.economy.popCap(s));
      s.peak = s.pop;
      s.famine = 0;
      s.famineDeaths = 0;
      s._grow = 0;
      s.techs = {};
      s.civics = {};
    }
    const starveRef = runOne();
    configureStarvation(starveRef);
    for (let i = 1; i <= starvationSeconds / STEP; i++) {
      SB.economy.tick(starveRef, STEP, null);
      if (starveRef._seasonGrantPending) {
        SB.economy.seasonGrant(starveRef);
        starveRef._seasonGrantPending = false;
      }
      if (i % 20 === 0) {
        SB.game.pumpTech(starveRef, null);
        SB.game.pumpCivic(starveRef, null);
      }
    }
    const starveFast = runOne();
    configureStarvation(starveFast);
    SB.game.planCatchUp(starveFast, starvationSeconds);
    SB.game.drainCatchUp(1000000);
    check('断粮后死亡/人口匹配，饥荒进度误差小于 0.1 秒',
      starveFast.pop === starveRef.pop && starveFast.famineDeaths === starveRef.famineDeaths &&
        Math.abs(starveFast.famine - starveRef.famine) <= 1,
      '人口 ' + starveRef.pop + '/' + starveFast.pop + '，饿死 ' + starveRef.famineDeaths + '/' + starveFast.famineDeaths +
        '，饥荒进度 ' + starveRef.famine.toFixed(3) + '/' + starveFast.famine.toFixed(3));
  } finally {
    SB.economy.tick = SB.economyTickParts.tick;
    SB.rng = oldRng;
    SB.game.resetRun();
  }
}
