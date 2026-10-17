/* 天壳 / SHELLBREAK — 轮回商店自动研究器
 *
 * 只在在线主循环调用。研究资格仍分别由 tech.canStudy / civic.canResearch 判定，
 * 因此不会绕过尤里卡、前置、纪元、面板或资源门槛。单次最多研究 24 项，避免
 * 极端配置造成一个在线泵长时间占住主线程；每项完成后重跑揭示泵，再检查下一项。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var MAX_PER_PUMP = 24;

  function unlocked(s, m, kind) {
    var perkId = kind === 'tech' ? 'autoStudy' : 'autoCivic';
    /* meta.perks 是买断事实源；不要依赖旧周目快照里的 s.perk，老档可能尚未带该运行时镜像。 */
    return !!(s && m && m.perks && m.perks[perkId] > 0 &&
      m.autoResearch && m.autoResearch[kind] === true);
  }

  function researchTech(s, m, emit) {
    if (!unlocked(s, m, 'tech') || !SB.tech || !SB.tech.canStudy || !SB.tech.study) return 0;
    var T = SB.TECHS || [], done = 0;
    while (done < MAX_PER_PUMP) {
      var found = false;
      for (var i = 0; i < T.length; i++) {
        if (!SB.tech.canStudy(s, T[i].id)) continue;
        if (!SB.tech.study(s, T[i].id, emit || null)) continue;
        found = true; done++;
        if (SB.game) {
          if (SB.game.markDirty) SB.game.markDirty();
          if (SB.game.pumpTech) SB.game.pumpTech(s, emit || null);
          if (SB.game.pumpCivic) SB.game.pumpCivic(s, emit || null);
        }
        break;
      }
      if (!found) break;
    }
    return done;
  }

  function researchCivic(s, m, emit) {
    if (!unlocked(s, m, 'civic') || !SB.civic || !SB.civic.panelOpen(s) ||
        !SB.civic.canResearch || !SB.civic.research) return 0;
    var C = SB.CIVICS || [], done = 0;
    while (done < MAX_PER_PUMP) {
      var found = false;
      for (var i = 0; i < C.length; i++) {
        if (!SB.civic.canResearch(s, C[i].id)) continue;
        if (!SB.civic.research(s, C[i].id, emit || null)) continue;
        found = true; done++;
        if (SB.game) {
          if (SB.game.markDirty) SB.game.markDirty();
          if (SB.game.pumpCivic) SB.game.pumpCivic(s, emit || null);
          if (SB.game.pumpTech) SB.game.pumpTech(s, emit || null);
        }
        break;
      }
      if (!found) break;
    }
    return done;
  }

  function tick(s, m, emit) {
    if (!s || !m || s.broken) return { tech: 0, civic: 0 };
    var tech = researchTech(s, m, emit);
    var civic = researchCivic(s, m, emit);
    return { tech: tech, civic: civic };
  }

  SB.autoResearch = { tick: tick, _researchTech: researchTech, _researchCivic: researchCivic };
})(typeof window !== 'undefined' ? window : globalThis);
