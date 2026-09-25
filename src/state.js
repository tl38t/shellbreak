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
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
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
    loadMeta: loadMeta,
    saveMeta: saveMeta,
    loadRun: loadRun,
    saveRun: saveRun,
    clearRun: clearRun
  };
})(typeof window !== 'undefined' ? window : globalThis);
