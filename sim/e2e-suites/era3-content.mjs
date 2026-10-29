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
    um.upg_fishbonemine.mineSilt === 0.5 && um.upg_fishbonemine.mineWarm === 1.0,
    'fishbonemine=' + JSON.stringify(um.upg_fishbonemine));
  {
    const m0 = SB.state.freshRun(false), m1 = SB.state.freshRun(false);
    m0.jobs.miner = 2; m1.jobs.miner = 2;
    m1.upgrades.upg_fishbonemine = true;
    const r0 = SB.economy.rates(m0).warmstone, r1 = SB.economy.rates(m1).warmstone;
    check('鱼骨矿井暖石产出 +100%（对应 ×2）', Math.abs(r1 / r0 - 2) < 1e-9,
      '暖石=' + r0 + '→' + r1 + '（×' + (r1 / r0).toFixed(2) + '）');
  }
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

  /* ⭐ 议价曲线 = **等比递减**（2026-10-29 用户拍板「改成真边际效益」，上限 60%）。
   * 这里钉的是**曲线形状**，不是具体数值：rate / 上限属标定，用户随时可能调档；
   * 而「每级增量等比递减 / 严格单调 / 永不越过上限」是契约，谁把它改回凸曲线（旧
   * getLimitedDR 的 0.75 次幂末段会回升）这几条必红。
   * 历史：上一版曾出现「议事厅 19 级 +1.55%、24 级 +3.16%」，与「越升越少」的文案正好相反。 */
  {
    const A = SB.state.freshRun(false);          // 议事厅态
    const Bd = SB.state.freshRun(false);         // 城堡态
    Bd.upgrades.upg_castle = true;
    const discAt = (st, n) => { st.lvl.hall = n; return SB.economy.hallDiscount(st); };
    A.lvl.hall = 0; Bd.lvl.hall = 0;
    const ia = SB.economy.hallInfo(A), ib = SB.economy.hallInfo(Bd);

    check('议价第 1 级增量 == 首级省耗率（面板 rate 与结算同源）',
      Math.abs(discAt(A, 1) - ia.rate) < 1e-12,
      'rate=' + ia.rate + ' 第1级=' + discAt(A, 1));

    check('议价渐近上限：议事厅与城堡同为 60%，城堡不抬上限',
      Math.abs(ia.limit - 0.60) < 1e-12 && Math.abs(ib.limit - 0.60) < 1e-12,
      'hall=' + ia.limit + ' castle=' + ib.limit);

    check('城堡 rate = 议事厅 ×1.5（hallSaveMul 0.5 只加快递减、不抬上限）',
      Math.abs(ib.rate - ia.rate * 1.5) < 1e-12,
      'rate ' + ia.rate + ' → ' + ib.rate);

    let mono = true, below = true, ratioErr = 0, worst = '';
    for (let n = 1; n <= 40; n++) {
      const d0 = discAt(A, n - 1), d1 = discAt(A, n), d2 = discAt(A, n + 1);
      const gPrev = d1 - d0, gNext = d2 - d1;
      if (!(d1 > d0)) mono = false;
      if (!(d1 < ia.limit)) below = false;
      if (gPrev > 0) {
        const r = gNext / gPrev;
        if (Math.abs(r - ia.rho) > ratioErr) {
          ratioErr = Math.abs(r - ia.rho);
          worst = 'n=' + n + ' 比值=' + r.toFixed(9);
        }
      }
    }
    check('议价每级增量严格等比递减（相邻比值恒为 ρ，1~40 级）',
      ratioErr < 1e-9,
      '最大偏差=' + ratioErr + (worst ? '（' + worst + '，ρ=' + ia.rho.toFixed(9) + '）' : '') +
      '；议事厅 1/10/25/40 级=' + [1, 10, 25, 40].map(n => (discAt(A, n) * 100).toFixed(1) + '%').join('/'));
    check('议价折扣严格单调递增且永不越过上限（1~40 级）',
      mono && below,
      '单调=' + mono + ' 恒低于上限=' + below + ' 40级=' + (discAt(A, 40) * 100).toFixed(2) + '%');
  }
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
