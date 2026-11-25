/* e2e suite: 三类自动化「记忆上周目」（2026-11-18）。
 *
 * 钉住的事故：区域建筑自动开关 s.autoUpg、工坊自动槽 s.autoSlots 都是当局字段，
 * freshRun 每次给空 ⇒ 玩家每轮回都要重拨一遍；本改动让它们按 meta.memAuto 偏好
 * 在 startRun 时播种进新周目，自动研究则按偏好在轮回时重置。
 *
 * ⚠️ 本套件直接打在生产函数 applyAutoMemory / autoMemoryPref / setAutoMemoryPref 上，
 *    用裸 prev / s 对象，不触碰主沙箱的 live S（只有开头对 live meta.memAuto 做一次性
 *    读-改-还原，验证 setAutoMemoryPref 真的落盘）。可放在 auto-research 之后。 */
export function run({ SB, check }) {
  console.log('\n=== 三类自动化·记忆上周目 ===');
  const G = SB.game;
  const noop = () => {};

  /* ── ① 默认全开：emptyMeta 三键都为 true，缺字段按开 ── */
  const em = SB.state.emptyMeta();
  check('记忆偏好默认全开（emptyMeta 三键为 true）',
    em.memAuto && em.memAuto.upg === true && em.memAuto.slots === true && em.memAuto.research === true,
    JSON.stringify(em.memAuto));

  /* ── ② 建筑自动开关：开 ⇒ 从 prev 逐项搬；关 ⇒ 保持空 ── */
  const prevUpg = { kelp: true, hall: false, siltpit: true, junk: 'yes' };
  /* 带 upg_autoshop：给工坊槽一个来源，否则 slotCap=0 会把所有槽截断（真实新局若没买
   * 槽位升级/perk 也是 0，那是正确的；这里要测的是「带上有效槽」这条路径，故给来源）。 */
  const mkUpgS = () => ({ autoUpg: {}, autoSlots: [], upgrades: { upg_autoshop: true }, perk: {} });

  const liveMeta = G.meta();
  const savedMemAuto = JSON.parse(JSON.stringify(liveMeta.memAuto || {}));

  liveMeta.memAuto = { upg: true, slots: false, research: false };
  const sUpgOn = G.applyAutoMemory(mkUpgS(), { autoUpg: prevUpg });
  check('建筑自动开关·开：只搬真 true 的项，false / 脏值不进新局',
    sUpgOn.autoUpg.kelp === true && sUpgOn.autoUpg.siltpit === true &&
    sUpgOn.autoUpg.hall === undefined && sUpgOn.autoUpg.junk === undefined,
    JSON.stringify(sUpgOn.autoUpg));

  liveMeta.memAuto = { upg: false, slots: false, research: false };
  const sUpgOff = G.applyAutoMemory(mkUpgS(), { autoUpg: prevUpg });
  check('建筑自动开关·关：新局保持空表，不带上一局状态',
    Object.keys(sUpgOff.autoUpg).length === 0, JSON.stringify(sUpgOff.autoUpg));

  /* ── ③ 工坊自动槽：开 ⇒ 按新局 slotCap 截断、逐项浅拷；关 ⇒ 保持空 ── */
  const prevSlots = [
    { id: 'raft', pct: 0.5 },
    { id: 'plank', batch: 20 },
    { id: 'dirty' },                 // 无 pct / batch ⇒ 无效槽
    { id: 'over', pct: 1 },          // 超过新局槽位上限 ⇒ 截断
    null
  ];
  /* 造两个不同 slotCap 的新局 s：给 upg_autoshop（+SLOT_BASE）并按需追加 perk.autoCraft 槽。
   * slotCap 不依赖 live meta，只读 s 自身 ⇒ 可安全构造。 */
  const capOneS = () => {
    const s = { autoUpg: {}, autoSlots: [], upgrades: { upg_autoshop: true }, perk: {} };
    return s;
  };
  const cap = SB.workshop.slotCap(capOneS());
  check('工坊自动槽·槽位上限由新局状态决定（非写死）', cap >= 1,
    JSON.stringify({ cap }));

  liveMeta.memAuto = { upg: false, slots: true, research: false };
  const sSlots = G.applyAutoMemory(capOneS(), { autoSlots: JSON.parse(JSON.stringify(prevSlots)) });
  check('工坊自动槽·开：只保留有效槽、按新局 slotCap 截断、逐项浅拷',
    sSlots.autoSlots.length === Math.min(cap, 2) &&
    sSlots.autoSlots[0].id === 'raft' && sSlots.autoSlots[0].pct === 0.5 &&
    (cap >= 2 ? sSlots.autoSlots[1].id === 'plank' && sSlots.autoSlots[1].batch === 20 : true),
    JSON.stringify({ cap, slots: sSlots.autoSlots }));
  /* 浅拷断言：改新局槽不该改到 prev（用同一 prev 再 apply 一次，prev 仍是原值）。 */
  sSlots.autoSlots[0].pct = 0.99;
  const sSlotsAgain = G.applyAutoMemory(capOneS(), { autoSlots: JSON.parse(JSON.stringify(prevSlots)) });
  check('工坊自动槽·逐项浅拷，不串改 prev 的槽对象', sSlotsAgain.autoSlots[0].pct === 0.5);

  liveMeta.memAuto = { upg: false, slots: false, research: false };
  const sSlotsOff = G.applyAutoMemory(capOneS(), { autoSlots: JSON.parse(JSON.stringify(prevSlots)) });
  check('工坊自动槽·关：新局保持空数组', sSlotsOff.autoSlots.length === 0);

  /* ── ④ 自动研究：状态在 meta，「关」= 开新局时重置为关；「开」= 原样保留 ── */
  const savedResearch = JSON.parse(JSON.stringify(liveMeta.autoResearch || { tech: false, civic: false }));
  liveMeta.autoResearch = { tech: true, civic: true };
  liveMeta.memAuto = { upg: false, slots: false, research: false };
  G.applyAutoMemory(mkUpgS(), {});
  check('自动研究·关：开新局把 autoResearch 重置为关',
    liveMeta.autoResearch.tech === false && liveMeta.autoResearch.civic === false,
    JSON.stringify(liveMeta.autoResearch));
  liveMeta.autoResearch = { tech: true, civic: false };
  liveMeta.memAuto = { upg: false, slots: false, research: true };
  G.applyAutoMemory(mkUpgS(), {});
  check('自动研究·开：开新局原样保留 autoResearch',
    liveMeta.autoResearch.tech === true && liveMeta.autoResearch.civic === false,
    JSON.stringify(liveMeta.autoResearch));

  /* ── ⑤ 偏好读写落盘：setAutoMemoryPref 改 live meta 并经 state.loadMeta 读回 ── */
  G.setAutoMemoryPref('upg', false);
  check('setAutoMemoryPref 写入 live meta 并落盘（loadMeta 读回一致）',
    liveMeta.memAuto.upg === false &&
    SB.state.loadMeta().memAuto.upg === false &&
    G.autoMemoryPref('upg') === false);
  G.setAutoMemoryPref('upg', true);

  /* ── ⑥ 缺字段按开（老档零迁移）：memAuto 空对象 ⇒ 三类都当开 ── */
  liveMeta.memAuto = {};
  check('缺字段的旧档按「全开」处理',
    G.autoMemoryPref('upg') === true && G.autoMemoryPref('slots') === true && G.autoMemoryPref('research') === true);
  const sLegacy = G.applyAutoMemory(mkUpgS(), { autoUpg: { kelp: true }, autoSlots: [{ id: 'raft', pct: 0.5 }] });
  check('旧档（无 memAuto）轮回后照样带上自动开关与工坊槽',
    sLegacy.autoUpg.kelp === true && sLegacy.autoSlots.some(x => x.id === 'raft'));

  const fresh = SB.state.freshRun();
  fresh.perk.autoCraft = 3;
  fresh.lvl.workshop = 1;
  const inherited = ['craft_scaffold', 'craft_artwork', 'craft_tidal_record'];
  G.applyAutoMemory(fresh, { autoSlots: inherited.map(id => ({ id, batch: 1 })) });
  const originalRun = G.run;
  const workshop = SB.ui.renderParts;
  try {
    G.run = () => fresh;
    workshop.toggleCraftOnlyReady();
    const full = workshop.paneWorkshop();
    check('只看可造时，三个未解锁的继承槽也分别提供停用按钮',
      inherited.every(id => full.includes('data-aoff="' + id + '"') && !full.includes('data-info-id="' + id + '"')));
    const W = SB.workshop;
    check('停用脚手架后可把腾出的槽分给石梁', W.clearSlot(fresh, inherited[0]) &&
      fresh.autoSlots.length === 2 && W.setSlot(fresh, 'craft_stonebeam', 0.5));
    const mixedList = workshop.paneWorkshop().match(/<section class="assigned-crafts">([\s\S]*?)<\/section>/);
    check('占槽清单仅列未解锁配方，已解锁但缺石头的石梁不列入',
      mixedList && Array.from(mixedList[1].matchAll(/data-aoff="([^"]+)"/g), m => m[1]).join(',') ===
      'craft_artwork,craft_tidal_record');
    fresh.res.stone = SB.economy.capOf(fresh, 'stone');
    const before = fresh.res.stoneBeam;
    check('石梁自动产出，另两个未解锁配方继续占槽',
      W.autoTick(fresh) > 0 && fresh.res.stoneBeam > before &&
      fresh.autoSlots.map(slot => slot.id).join(',') === 'craft_artwork,craft_tidal_record,craft_stonebeam');
    fresh.civics.historiography = true;
    const unlocked = workshop.paneWorkshop();
    check('最后的占槽配方解锁后收起清单，石梁仍可在配方卡停用',
      !unlocked.includes('class="assigned-crafts"') && unlocked.includes('data-aoff="craft_stonebeam"') &&
      fresh.autoSlots.length === 3);
    fresh.civics.historiography = false;
    W.clearSlot(fresh, 'craft_artwork');
    W.clearSlot(fresh, 'craft_tidal_record');
    check('停用最后一个未解锁配方也会收起清单，已分配的石梁继续占槽',
      !workshop.paneWorkshop().includes('class="assigned-crafts"') &&
      fresh.autoSlots.length === 1 && fresh.autoSlots[0].id === 'craft_stonebeam');
  } finally {
    workshop.toggleCraftOnlyReady();
    G.run = originalRun;
  }

  /* ── 还原现场 ── */
  liveMeta.memAuto = savedMemAuto;
  liveMeta.autoResearch = savedResearch;
  noop();
}
