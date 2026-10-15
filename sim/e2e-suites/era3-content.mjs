/* e2e suite: era 3 tech conditions and content wiring; shared run fixture. */
export function run({ SB, check }) {

/* ---------------- 纪元三（硫泉）：钢与热液能（ERA3 终版口径，2026-09-29）----------------
 * 整表替换旧 6 项（冶炼术/烟囱炉/机械/精铁术/深潜/壳骨），新线 5 项。
 * 这里同时钉「数据形状」和「cond 真的能算」两类命题——前者靠遍历表，后者靠造态喂 condMet。 */
console.log('\n=== 纪元三 · 钢与热液能 ===');
{
  const T = SB.TECHS, m = {};
  T.forEach(t => { m[t.id] = t; });
  const e3 = T.filter(t => t.era === 3).map(t => t.id).sort();
  const e3want = ['apprentice', 'blacksmoker', 'castle', 'education', 'horseshoe', 'metalrefine'];
  check('纪元三恰好 6 项（apprentice/blacksmoker/castle/education/horseshoe/metalrefine）',
    e3.length === e3want.length && e3want.every(x => e3.indexOf(x) >= 0) && e3.every(x => e3want.indexOf(x) >= 0),
    '实=' + e3.join(','));

  /* key 节点 = 学徒制 + 金属精炼（纪元推进的门槛）。 */
  const keys3 = SB.tech.keysOf(3).map(t => t.id).sort();
  check('纪元三 key = [学徒制, 金属精炼]',
    keys3.length === 2 && keys3[0] === 'apprentice' && keys3[1] === 'metalrefine',
    'keys=' + keys3.join(','));

  /* 五项尤里卡类型各就各位（数据形状）。 */
  const c = id => (m[id] && m[id].cond) || {};
  check('学徒制尤里卡 = 买齐三件铁制工具',
    c('apprentice').t === 'tools' &&
    (c('apprentice').ids || []).join() === 'tool_ironSickle,tool_ironAxe,tool_ironPick',
    'cond=' + JSON.stringify(c('apprentice')));
  check('马镫尤里卡 = 5 名商人',
    c('horseshoe').t === 'job' && c('horseshoe').j === 'merchant' && c('horseshoe').n === 5,
    'cond=' + JSON.stringify(c('horseshoe')));
  check('教育尤里卡 = 三级研究所',
    c('education').t === 'built' && c('education').b === 'institute' && c('education').n === 3,
    'cond=' + JSON.stringify(c('education')));
  check('金属精炼尤里卡 = 完成鱼骨矿井（装填升级）',
    c('metalrefine').t === 'upgrade' && c('metalrefine').id === 'upg_fishbonemine',
    'cond=' + JSON.stringify(c('metalrefine')));
  check('城堡尤里卡 = 启用三槽政体（排除酋邦制）',
    c('castle').t === 'gov' && c('castle').wild === 3,
    'cond=' + JSON.stringify(c('castle')));

  /* 金属精炼解锁热液汽轮机 + 热液工坊（与建筑侧 requiredTech 双写一致，见下块）。 */
  check('金属精炼解锁 热液汽轮机 + 热液工坊',
    (m.metalrefine.eff.unlockBuild || []).join() === 'hydroturbine,hydroshop',
    'unlockBuild=' + JSON.stringify(m.metalrefine.eff.unlockBuild));

  /* ⚠️ cond 真的能算（功能验证，不是只看形状）：造态喂 condMet，逐项证「达成/未达成」分流正确。
   *    只测形状不测算，等于默认 condMet 那五个新分支都对——而它们正是本轮新加的代码。 */
  const st = SB.state.freshRun(false);
  check('学徒制: 三件铁制工具未买齐 ⇒ 未达成', !SB.tech.condMet(st, c('apprentice')));
  st.tools = { tool_ironSickle: true, tool_ironAxe: true, tool_ironPick: true };
  check('学徒制: 三件铁制工具买齐 ⇒ 达成', SB.tech.condMet(st, c('apprentice')));

  check('马镫: 商人 < 5 ⇒ 未达成', !SB.tech.condMet(st, c('horseshoe')));
  st.jobs = st.jobs || {}; st.jobs.merchant = 5;
  check('马镫: 商人 = 5 ⇒ 达成', SB.tech.condMet(st, c('horseshoe')));

  check('教育: 研究所 < 3 ⇒ 未达成', !SB.tech.condMet(st, c('education')));
  st.lvl = st.lvl || {}; st.lvl.institute = 3;
  check('教育: 研究所 = 3 ⇒ 达成', SB.tech.condMet(st, c('education')));

  check('金属精炼: 鱼骨矿井未装 ⇒ 未达成', !SB.tech.condMet(st, c('metalrefine')));
  st.upgrades = st.upgrades || {}; st.upgrades.upg_fishbonemine = true;
  check('金属精炼: 鱼骨矿井已装 ⇒ 达成', SB.tech.condMet(st, c('metalrefine')));

  check('城堡: 酋邦制(1 槽) ⇒ 未达成', !SB.tech.condMet(st, c('castle')));
  st.gov = 'autocracy';
  check('城堡: 三槽政体(autocracy) ⇒ 达成', SB.tech.condMet(st, c('castle')));
}

/* ---------------- 纪元三：新资源 / 建筑 / 工坊升级 / 奇观 / 制造（数据自查）----------------
 * 钢与热液能系统落地后，所有「新增条目」必须两边对账：声明在 config、落点在 state/economy。 */
console.log('\n=== 纪元三 · 资源/建筑/升级/奇观 落地 ===');
{
  /* ① 三种新资源都进了 RESS，且 freshRun 台账 seed 了初值（防 addRes 漏键染 NaN）。 */
  const newRes = ['steel', 'hydro', 'steelPart'];
  const missingDef = newRes.filter(r => !SB.RESS[r]);
  check('钢/热液能/钢制零件 都已进 RESS', missingDef.length === 0, '缺=' + missingDef.join(','));
  const fr = SB.state.freshRun(false);
  const seedMiss = newRes.filter(r => fr.res[r] !== 0 || fr.got[r] !== 0);
  check('freshRun 的 res/got 台账都 seed 了三种新资源初值 0', seedMiss.length === 0,
    '漏=' + seedMiss.join(','));

  /* ② 热液汽轮机 / 热液工坊 建筑存在且 requiredTech=['metalrefine']（与 metalrefine.unlockBuild 双写）。 */
  const B = SB.BUILDINGS || [], bm = {};
  B.forEach(b => { bm[b.id] = b; });
  check('热液汽轮机存在且 requiredTech=[metalrefine]',
    !!bm.hydroturbine && (bm.hydroturbine.requiredTech || []).join() === 'metalrefine',
    'hydroturbine=' + JSON.stringify(bm.hydroturbine && bm.hydroturbine.requiredTech));
  check('热液工坊存在且 requiredTech=[metalrefine]',
    !!bm.hydroshop && (bm.hydroshop.requiredTech || []).join() === 'metalrefine',
    'hydroshop=' + JSON.stringify(bm.hydroshop && bm.hydroshop.requiredTech));

  /* ③ 工坊升级五项（第三种形态，存 s.upgrades）need 与 effect 键都对账。 */
  const U = SB.UPGRADES || [], um = {};
  U.forEach(u => { um[u.id] = u; });
  check('upg_fishbonemine: need=apprentice, mineSilt/mineWarm 生效',
    um.upg_fishbonemine && um.upg_fishbonemine.need === 'apprentice' &&
    um.upg_fishbonemine.mineSilt === 0.5 && um.upg_fishbonemine.mineWarm === 10.0,
    'fishbonemine=' + JSON.stringify(um.upg_fishbonemine));
  check('upg_autoshop: need=metalrefine, craftRatio=0.10',
    um.upg_autoshop && um.upg_autoshop.need === 'metalrefine' && um.upg_autoshop.craftRatio === 0.10,
    'autoshop=' + JSON.stringify(um.upg_autoshop));
  check('upg_university: need=education, instituteSci=0.5（与 BLD.instituteSci 相加 +100%）',
    um.upg_university && um.upg_university.need === 'education' && um.upg_university.instituteSci === 0.5,
    'university=' + JSON.stringify(um.upg_university));
  check('upg_castle: need=castle, hallSaveMul/castleCap 生效',
    um.upg_castle && um.upg_castle.need === 'castle' &&
    um.upg_castle.hallSaveMul === 0.5 && um.upg_castle.castleCap === 50,
    'castle=' + JSON.stringify(um.upg_castle));
  check('upg_horseshoe: need=horseshoe, luxuryMul=0.5（与马具相乘 +100%）',
    um.upg_horseshoe && um.upg_horseshoe.need === 'horseshoe' && um.upg_horseshoe.luxuryMul === 0.5,
    'horseshoe=' + JSON.stringify(um.upg_horseshoe));

  /* ④ 阿尔巴达热液大学奇观：need=education，effect.minePop。 */
  const W = SB.WONDERS || {}, wm = {};
  W.forEach(w => { wm[w.id] = w; });
  check('wonder_albada: need=education, effect.minePop',
    wm.wonder_albada && wm.wonder_albada.need === 'education' && wm.wonder_albada.effect &&
    wm.wonder_albada.effect.minePop === true,
    'albada=' + JSON.stringify(wm.wonder_albada));

  /* ⑤ 钢制零件制造：need=metalrefine，25 钢→1 件。 */
  const C = SB.CRAFTS || [], cm = {};
  C.forEach(x => { cm[x.id] = x; });
  check('craft_steelpart: need=metalrefine, 25 钢→1 件',
    cm.craft_steelpart && cm.craft_steelpart.need === 'metalrefine' &&
    cm.craft_steelpart.in && cm.craft_steelpart.in.steel === 25 && cm.craft_steelpart.out === 1,
    'steelpart=' + JSON.stringify(cm.craft_steelpart));
}

}
