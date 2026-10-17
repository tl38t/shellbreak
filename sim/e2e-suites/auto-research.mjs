/* e2e suite: 轮回商店解锁的科技 / 市政自动研究器。 */
export function run({ SB, check }) {
  console.log('\n=== 轮回商店·自动研究 ===');
  const auto = SB.autoResearch;
  const noop = () => {};
  check('自动研究 API 已加载', !!auto && typeof auto.tick === 'function');
  check('新存档的两个自动研究开关默认关闭',
    SB.state.emptyMeta().autoResearch.tech === false && SB.state.emptyMeta().autoResearch.civic === false);

  const techMeta = { perks: { autoStudy: 1 }, autoResearch: { tech: false, civic: false } };
  const makeTechRun = () => {
    const s = SB.state.freshRun(false);
    s.perk.autoStudy = 1;
    s.techs.writing = true;
    s.eureka = { coralcut: true };
    s.eurekaMet = { coralcut: true };
    s.res.science = 25;
    return s;
  };
  const disabledTech = makeTechRun();
  auto.tick(disabledTech, techMeta, noop);
  check('自动研究默认关闭时不擅自投入科技点',
    !disabledTech.techs.coralcut && disabledTech.res.science === 25);
  techMeta.autoResearch.tech = true;
  const enabledTech = makeTechRun();
  const techResult = auto.tick(enabledTech, techMeta, noop);
  check('开启且购买科技自动研究后，自动完成可研究科技并扣除科技点',
    techResult.tech === 1 && enabledTech.techs.coralcut === true && enabledTech.res.science === 0,
    JSON.stringify({ result: techResult, researched: enabledTech.techs.coralcut, science: enabledTech.res.science }));
  techMeta.perks.autoStudy = 0;
  const unownedTech = makeTechRun();
  auto.tick(unownedTech, techMeta, noop);
  check('未购买升级时，即使开关数据为开启也不会自动研究', !unownedTech.techs.coralcut);

  const civicMeta = { perks: { autoCivic: 1 }, autoResearch: { tech: false, civic: true } };
  const civicRun = SB.state.freshRun(false);
  civicRun.perk.autoCivic = 1;
  civicRun.lvl.hall = 1;
  civicRun.civics.laws = true;
  civicRun.civShown.craft = true;
  civicRun.res.culture = 100;
  const civicResult = auto.tick(civicRun, civicMeta, noop);
  check('开启且购买市政自动研究后，自动完成已揭示且可研究的市政',
    civicResult.civic === 1 && !!civicRun.civics.craft && civicRun.res.culture === 0,
    JSON.stringify({ result: civicResult, researched: civicRun.civics.craft, culture: civicRun.res.culture }));

  const liveMeta = SB.game.meta();
  const saved = {
    autoResearch: Object.assign({}, liveMeta.autoResearch),
    autoStudy: liveMeta.perks.autoStudy,
    autoCivic: liveMeta.perks.autoCivic
  };
  liveMeta.autoResearch = { tech: false, civic: false };
  liveMeta.perks.autoStudy = 1;
  liveMeta.perks.autoCivic = 0;
  const enabled = SB.prestige.toggleAutoResearch('tech');
  const persisted = SB.state.loadMeta().autoResearch.tech === true;
  const disabled = SB.prestige.toggleAutoResearch('tech');
  const locked = SB.prestige.toggleAutoResearch('civic');
  check('商店开关可开/关、开关状态写入 meta，未购买的类别不能开启',
    enabled === true && disabled === false && locked === null && liveMeta.autoResearch.tech === false &&
    liveMeta.autoResearch.civic === false && persisted);
  const metaHtml = SB.ui.renderParts.paneMeta();
  check('已购买的自动研究升级在商店显示显式开关与关闭状态',
    /data-auto-research="tech" aria-pressed="false"/.test(metaHtml) && /开启科技自动研究/.test(metaHtml));
  liveMeta.autoResearch = saved.autoResearch;
  if (saved.autoStudy === undefined) delete liveMeta.perks.autoStudy;
  else liveMeta.perks.autoStudy = saved.autoStudy;
  if (saved.autoCivic === undefined) delete liveMeta.perks.autoCivic;
  else liveMeta.perks.autoCivic = saved.autoCivic;
  SB.state.saveMeta(liveMeta);
}
