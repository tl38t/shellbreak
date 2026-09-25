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
      res: { kelp: 60, coral: 0, silt: 0, bone: 0, iron: 0, science: 0, fuel: 0 },
      lvl: { kelp: 0, weir: 0, warmnest: 0, ballast: 0, nest: 0, reef: 0, siltpit: 0, workshop: 0, furnace: 0, library: 0, hearth: 0, geyser: 0, miracle: 0 },
      jobs: { gather: 3, craft: 0, scholar: 0 },
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
      techs: {},
      famine: 0,
      broken: false,
      // 破壳状态：miracleOn 是玩家开关，miracleRun 是本次连续供能秒数（用于结算与提示）
      miracleOn: false,
      miracleRun: 0,
      starved: false,
      _grow: 0,
      _cutBase: 0,   // 累计：基础削壳削掉的点数
      _cutMir: 0     // 累计：破冰祭坛削掉的点数
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
    out.perk = Object.assign(emptyPerks(), (raw.perk && typeof raw.perk === 'object') ? raw.perk : {});
    out.techs = (raw.techs && typeof raw.techs === 'object') ? raw.techs : {};
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
