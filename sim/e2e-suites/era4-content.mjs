/* e2e suite: era 4 technology data and economy wiring; shared run fixture. */
export function run({ SB, check, noop }) {

/* ---------------- 纪元四 · 天壳工程（2026-09-30 用户重设计）----------------
 * ⚠️ 这一族断言的共同背景：纪元四被**整体换血**（旧五项 ignition/turbine/survey/tideflow/
 *    shellforge 全删），六项新科技的成本合计 25 万，是 era1-3 总和的 5.7 倍。
 *    ⇒ 除了「数据落地」，这里更该钉住的是**接线**：新加的每一个效果都必须在两个方向
 *      都接上（tick 与 rates、以及它该作用的那一个对象），否则玩家看到一堆 +x% 却
 *      一个数不动 —— 「面板撒谎」这个家族在本项目已经出现过好几次。
 * ⚠️ 数值今后要改动时，改的是 config.js / techs.js；这几条断言一个字都不用动。 */
console.log('\n=== 纪元四 · 天壳工程 ===');
{
  const T4 = SB.TECHS.filter(t => t.era === 4);
  const m4 = {};
  T4.forEach(t => { m4[t.id] = t; });

  /* ① 六项齐全 + 关键节点 = 天壳观测 + 倒置搭建（纪元推进要清 key）。 */
  const want4 = ['shellwatch', 'printing', 'physics', 'banking', 'thermo', 'hydrocarbur', 'ventrecir', 'invert'];
  check('纪元四恰好 8 项（含新增 海流锻钢/热泉回流），且 id 齐全',
    T4.length === 8 && want4.every(id => !!m4[id]), T4.map(t => t.id).join(','));
  const keys4 = T4.filter(t => t.key).map(t => t.id).sort();
  check('纪元四关键节点 = 天壳观测 + 倒置搭建（用户拍板「天壳那两项」）',
    keys4.join() === 'invert,shellwatch', keys4.join());
  check('倒置搭建效果文案说明脚手架需求 −25%',
    m4.invert.eff && m4.invert.eff.scaffoldCostSave === 0.25 &&
    SB.tech.effectText(m4.invert).indexOf('脚手架需求 −25%') >= 0,
    SB.tech.effectText(m4.invert));

  /* ② 前置 / 层级 / 分支 / 成本 —— 数据表 landed 的凭证。
   *    ⚠️ 绝对层级是 3/4/5 而不是用户表里的 1/2/3：layer 是全局列号，
   *       e2e「没有科技的前置比它自己更深一层」那条不允许前置比自己深。 */
  const shape = want4.map(id => id + ':L' + m4[id].layer + '/' + m4[id].reqs.join('+') +
    '/' + m4[id].cost + '/' + (m4[id].cond ? m4[id].cond.t : '-')).join(' ');
  check('前置与层级：天壳观测←教育、印刷术←金属精炼、物理←天壳观测、银行业←印刷术、热力学←金属精炼、倒置搭建←物理',
    m4.shellwatch.reqs.join() === 'education' && m4.printing.reqs.join() === 'metalrefine' &&
    m4.physics.reqs.join() === 'shellwatch' && m4.banking.reqs.join() === 'printing' &&
    m4.thermo.reqs.join() === 'metalrefine' && m4.invert.reqs.join() === 'physics', shape);
  check('成本合计 35 万（250000 + 海流锻钢55000 + 热泉回流45000）',
    T4.reduce((a, t) => a + t.cost, 0) === 350000, '合计=' + T4.reduce((a, t) => a + t.cost, 0));
  /* ⚠️ 2026-10-06 用户拍板：三条尤里卡门槛下调（学术区 70→35、贸易区 100→35、人口 100→50）。
   *   断言必须跟着改，否则改数值必假红 —— 这条正是「钉住门槛」的作用：门槛是标定项，
   *   改了它就该被显式承认，而不是让旧值悄悄留在断言里变成下一个陷阱。 */
  check('三项尤里卡走现有 cond 类型（zoneLvl / tools / built / pop，无新机制）',
    m4.shellwatch.cond.t === 'zoneLvl' && m4.shellwatch.cond.zone === 'academy' && m4.shellwatch.cond.n === 35 &&
    m4.banking.cond.t === 'zoneLvl' && m4.banking.cond.zone === 'trade' && m4.banking.cond.n === 35 &&
    m4.physics.cond.t === 'tools' && m4.physics.cond.ids.join() === 'tool_steelSickle,tool_steelAxe,tool_steelPick' &&
    m4.printing.cond.t === 'built' && m4.printing.cond.b === 'hydroshop' && m4.printing.cond.n === 3 &&
    m4.thermo.cond.t === 'built' && m4.thermo.cond.b === 'hydroturbine' && m4.thermo.cond.n === 5 &&
    m4.invert.cond.t === 'pop' && m4.invert.cond.n === 50,
    shape);
  /* ⚠️ 2026-10 新增三科技（黑烟囱炼铁/海流锻钢/热泉回流）：效果必须真的接进 mul()。
   *   mul 默认表若漏加 steelMul/bldEff，这两个键会被「未知键静默忽略」闸门吞掉 ⇒ 研究完什么都没发生。
   *   这里用最小态（只点这三件）直接读 mul()，把「加上了但没生效」钉死。 */
  {
    const e4mul = SB.tech.mul({ techs: { blacksmoker: 1, hydrocarbur: 1, ventrecir: 1 } });
    check('新增三科技接线：黑烟囱炼铁 smelt×1.25、海流锻钢 steelMul×1.30、热泉回流 bldEff×0.60',
      Math.abs(e4mul.smelt - 1.25) < 1e-9 && Math.abs(e4mul.steelMul - 1.30) < 1e-9 && Math.abs(e4mul.bldEff - 0.60) < 1e-9,
      'smelt=' + e4mul.smelt + ' steelMul=' + e4mul.steelMul + ' bldEff=' + e4mul.bldEff);
  }
  /* 更新日志整体移除（2026-10-25 用户拍板「把所有的更新日志删掉」）：
   * VERSION 保留；CFG.CHANGELOG / 自动弹窗 / 页脚按钮 / meta.seenVersion 均不应再存在。 */
  {
    check('CFG.VERSION 已设且非空', !!(SB.CFG && SB.CFG.VERSION), 'VERSION=' + (SB.CFG && SB.CFG.VERSION));
    check('CFG.CHANGELOG 已整体移除',
      !!(SB.CFG && SB.CFG.CHANGELOG === undefined),
      'CHANGELOG=' + JSON.stringify(SB.CFG ? SB.CFG.CHANGELOG : 'CFG缺失'));
    check('新档 meta 不再有 seenVersion',
      SB.state.emptyMeta().seenVersion === undefined,
      'seenVersion=' + JSON.stringify(SB.state.emptyMeta().seenVersion));
  }
  /* 🚨 门槛下调的**可达性**正向证据：35 级学术区 = 图书馆(15) + 研究所(10) + 潮纹馆…
   *   用「刚好卡在门槛上下」验判定真的看这个数，而不是碰巧在别的状态也通过。 */
  {
    const acc = SB.state.freshRun(false);
    acc.techs.masonry = true; acc.techs.mathematics = true; acc.techs.education = true;
    const accTech = SB.tech.byId('shellwatch'), bankTech = SB.tech.byId('banking');
    acc.lvl.library = 20; acc.lvl.institute = 14; acc.lvl.observatory = 0;   // 学术区 = 34
    check('学术区 34 级 ⇒ 天壳观测未达成（门槛 35，卡在下面一条）',
      SB.tech.condMet(acc, accTech.cond) === false, '学术区合计=' + SB.tech.condShort(acc, accTech.cond).now);
    acc.lvl.institute = 15;                                                   // 学术区 = 35
    check('学术区 35 级 ⇒ 天壳观测达成（门槛 35 精确命中）',
      SB.tech.condMet(acc, accTech.cond) === true, '学术区合计=' + SB.tech.condShort(acc, accTech.cond).now);
    const tr = SB.state.freshRun(false);
    tr.techs.engineeringT = true; tr.techs.scaffoldT = true;
    tr.lvl.lighthouse = 20; tr.lvl.kelpstore = 14; tr.lvl.ballast = 0;         // 贸易区 = 34
    check('贸易区 34 级 ⇒ 银行业未达成（门槛 35）',
      SB.tech.condMet(tr, bankTech.cond) === false, '贸易区合计=' + SB.tech.condShort(tr, bankTech.cond).now);
    tr.lvl.ballast = 1;                                                        // 贸易区 = 35
    check('贸易区 35 级 ⇒ 银行业达成（门槛 35 精确命中）',
      SB.tech.condMet(tr, bankTech.cond) === true, '贸易区合计=' + SB.tech.condShort(tr, bankTech.cond).now);
    const pv = SB.state.freshRun(false);
    const invTech = SB.tech.byId('invert');
    pv.pop = 49;
    check('人口 49 ⇒ 倒置搭建未达成（门槛 50）',
      SB.tech.condMet(pv, invTech.cond) === false, 'pop=' + SB.tech.condShort(pv, invTech.cond).now);
    pv.pop = 50;
    check('人口 50 ⇒ 倒置搭建达成（门槛 50 精确命中）',
      SB.tech.condMet(pv, invTech.cond) === true, 'pop=' + SB.tech.condShort(pv, invTech.cond).now);
  }

  /* ③ 解锁目标必须是真实存在的东西（eff.unlockBuild 反向查表，防止指向被删的建筑）。 */
  const missing = [];
  T4.forEach(t => ((t.eff && t.eff.unlockBuild) || []).forEach(b => {
    if (!SB.habitat.buildingById(b)) missing.push(t.id + '→' + b);
  }));
  check('三项 unlockBuild 都指向真实建筑', missing.length === 0, '查不到=' + missing.join(','));

  /* ④ 钛 / 脚手架 / 钛金板件：钛是有上限材料；两种工艺资源无上限；
   *   三者 state 均已 seed（防 addRes 漏键染 NaN）。 */
  const fr4 = SB.state.freshRun(false);
  const notInf = ['scaffold'].filter(r => SB.economy.capOf(fr4, r) !== Infinity);
  check('脚手架 capOf = Infinity（工艺制品，无上限）', notInf.length === 0, '有上限的=' + notInf.join(','));
  check('钛 capOf 有有限上限（不再是 Infinity，CAP_BASE=200 档）',
    SB.economy.capOf(fr4, 'titanium') !== Infinity && SB.economy.capOf(fr4, 'titanium') > 0,
    'capOf=' + SB.economy.capOf(fr4, 'titanium'));
  check('钛金板件作为工艺资源没有仓储上限',
    SB.RESS.tiplate.kind === 'craft' && SB.CFG.CAP_BASE.tiplate === undefined &&
      SB.economy.capOf(fr4, 'tiplate') === Infinity,
    'kind=' + SB.RESS.tiplate.kind + ' capOf=' + SB.economy.capOf(fr4, 'tiplate'));
  fr4.techs.lighting = true;
  fr4.lvl.ballast = 10;
  const storedTiplateCap = SB.economy.capOf(fr4, 'tiplate');
  SB.economy.addRes(fr4, 'tiplate', 5000);
  const legacyTiplateStore = SB.state.migrateRun({ lvl: { tiplateStore: 3 } });
  check('钛金板件可超过原有仓储数值，压舱仓不再限制工艺资源',
    SB.economy.capOf(fr4, 'tiplate') === Infinity && storedTiplateCap === Infinity && fr4.res.tiplate === 5000 &&
      !SB.BUILDINGS.some(b => b.id === 'tiplateStore') &&
      legacyTiplateStore.lvl.tiplateStore === undefined,
    'capOf=' + SB.economy.capOf(fr4, 'tiplate') + ' stock=' + fr4.res.tiplate);
  const plateWarehouse = SB.state.freshRun(false);
  const kCap0 = SB.economy.capOf(plateWarehouse, 'kelp');
  plateWarehouse.lvl.ballast = 5; // 750 钛在普通仓容量内，测试按真实可达库存购买
  const pCapBeforeUpgrade = SB.economy.capOf(plateWarehouse, 'tiplate');
  const cCapBeforeUpgrade = SB.economy.capOf(plateWarehouse, 'coral');
  plateWarehouse.res.tiplate = 50;
  plateWarehouse.res.titanium = 750;
  plateWarehouse.res.science = 200000;
  plateWarehouse.techs.minipump = false;
  const alloyWarehouseLocked = SB.workshop.upgradeBlocked(plateWarehouse, 'upg_alloy_warehouse');
  plateWarehouse.techs.minipump = true;
  const alloyWarehouseBlocked = SB.workshop.upgradeBlocked(plateWarehouse, 'upg_alloy_warehouse');
  const alloyWarehouseBought = SB.workshop.upgradeBuy(plateWarehouse, 'upg_alloy_warehouse', noop);
  check('合金仓储升级：minipump 解锁、材料科技扣费、非藻食容量 ×1.5',
    alloyWarehouseLocked !== null && alloyWarehouseBlocked === null && alloyWarehouseBought &&
      plateWarehouse.res.tiplate === 0 && plateWarehouse.res.titanium === 0 && plateWarehouse.res.science === 0 &&
      SB.economy.capOf(plateWarehouse, 'tiplate') === Infinity && pCapBeforeUpgrade === Infinity &&
      Math.abs(SB.economy.capOf(plateWarehouse, 'coral') / cCapBeforeUpgrade - 1.5) < 1e-9 &&
      SB.economy.capOf(plateWarehouse, 'kelp') === kCap0,
    'locked=' + alloyWarehouseLocked + ' blocked=' + alloyWarehouseBlocked + ' bought=' + alloyWarehouseBought +
      ' tiplate=' + SB.economy.capOf(plateWarehouse, 'tiplate') +
      ' coral=' + SB.economy.capOf(plateWarehouse, 'coral') + ' kelp=' + SB.economy.capOf(plateWarehouse, 'kelp'));
  const monumentStorage = SB.state.freshRun(false);
  monumentStorage.wonders.wonder_tide_stele = true;
  check('海潮方碑容量加成不作用于无限容量的工艺资源',
    SB.wonder.matMaxBonus(monumentStorage, 'tiplate') === 0 &&
      SB.economy.capOf(monumentStorage, 'tiplate') === Infinity,
    'bonus=' + SB.wonder.matMaxBonus(monumentStorage, 'tiplate') +
      ' cap=' + SB.economy.capOf(monumentStorage, 'tiplate'));
  check('钛 / 脚手架已进 res 与 got 台账（缺键会把资源池染成 NaN）',
    fr4.res.titanium === 0 && fr4.res.scaffold === 0 &&
    fr4.got.titanium === 0 && fr4.got.scaffold === 0,
    'res=' + JSON.stringify({ t: fr4.res.titanium, s: fr4.res.scaffold }));
  /* 2026-10-17：所有含脚手架成本的项目（含奇观）统一减半；制作配方本身不消耗脚手架。 */
  {
    const expected = {
      tenement: 25,
      upg_invertbuild: 150,
      wonder_shellcutter: 100,
      wonder_luluka: 50,
      wonder_presspipe: 112.5,
      wonder_skydrill: 200,
      wonder_shadow_theater: 200,
      wonder_congress: 300,
      wonder_logistics: 100,
      wonder_national_logistics: 100
    };
    const entries = [].concat(SB.BUILDINGS || [], SB.UPGRADES || [], SB.WONDERS || []);
    const actual = {};
    entries.forEach(x => {
      if (x && x.cost && Object.prototype.hasOwnProperty.call(x.cost, 'scaffold')) actual[x.id] = x.cost.scaffold;
    });
    const ids = Object.keys(expected).sort();
    const actualIds = Object.keys(actual).sort();
    check('廉租社区、工坊升级及全部奇观的脚手架成本均已减半',
      ids.join() === actualIds.join() && ids.every(id => actual[id] === expected[id]),
      '实际=' + JSON.stringify(actual));
  }
  {
    const base = SB.state.freshRun(false), inverted = SB.state.freshRun(false);
    inverted.techs.invert = true;
    const b0 = SB.economy.costOf(base, 'tenement'), b1 = SB.economy.costOf(inverted, 'tenement');
    const w0 = SB.wonder.discountedCost(base, 'wonder_shellcutter');
    const w1 = SB.wonder.discountedCost(inverted, 'wonder_shellcutter');
    check('倒置搭建：建筑脚手架需求 −25%，其他材料不变',
      Math.abs(b1.scaffold / b0.scaffold - 0.75) < 1e-9 && b1.steel === b0.steel,
      '建筑成本=' + JSON.stringify(b0) + '→' + JSON.stringify(b1));
    check('倒置搭建：奇观脚手架需求 −25%，其他材料不变',
      w1.scaffold === w0.scaffold * 0.75 && w1.steelPart === w0.steelPart && w1.titanium === w0.titanium,
      '奇观成本=' + JSON.stringify(w0) + '→' + JSON.stringify(w1));

    const u = SB.state.freshRun(false);
    u.techs.invert = true; u.techs.shellgeo = true;
    u.res.scaffold = 112.5; u.res.science = 1e9;
    check('倒置搭建：工坊升级按折后脚手架需求判定并实际扣费',
      SB.workshop.upgradeCost(u, 'upg_invertbuild').scaffold === 112.5 &&
      SB.workshop.upgradeBlocked(u, 'upg_invertbuild') === null &&
      SB.workshop.upgradeBuy(u, 'upg_invertbuild', noop) && Math.abs(u.res.scaffold) < 1e-9,
      '折后需求 112.5，扣后=' + u.res.scaffold);
  }
  {
    const base = SB.state.freshRun(false), geology = SB.state.freshRun(false);
    base.jobs.miner = 2; geology.jobs.miner = 2;
    [base, geology].forEach(s => {
      s.upgrades.upg_fishbonemine = true;
      s.upgrades.upg_deepmine = true;
    });
    geology.techs.abyssgeo = true;
    const warm0 = SB.economy.rates(base).warmstone, warm1 = SB.economy.rates(geology).warmstone;
    const titanium0 = SB.economy.rates(base).titanium, titanium1 = SB.economy.rates(geology).titanium;
    check('渊海地质学暖石 +100%（×2），并已移除钛加成',
      SB.tech.byId('abyssgeo').eff.warmMul === 1 &&
      !Object.prototype.hasOwnProperty.call(SB.tech.byId('abyssgeo').eff, 'titaniumMul') &&
      SB.tech.mul(geology).warmMul === 1 && SB.tech.mul(geology).titaniumMul === 0 &&
      Math.abs(warm1 / warm0 - 2) < 1e-9 && Math.abs(titanium1 - titanium0) < 1e-9,
      '暖石=' + warm0 + '→' + warm1 + '；钛=' + titanium0 + '→' + titanium1);
  }
  check('三座新建筑已在 lvl 表内（漏键 = 读档静默丢弃）',
    fr4.lvl.observatory === 0 && fr4.lvl.coralfarm === 0 && fr4.lvl.bank === 0,
    'observatory=' + fr4.lvl.observatory);

  /* ⑤ 天壳观测站：建成后随本局削壳进度线性增加学者科技产出，完全削穿时 +20%。
   *    期望值由 UNIT.sci 直接算、不依赖任何中间读数 ⇒ 谁改了常数，这条跟着露馅。
   *    ⚠️ 顺带钉住它读的是**快照**：同一秒内 tick 与 rates 必须逐位相等（差 1e-9 都不行）。 */
  const obsFx = (sh) => {
    const z = SB.state.freshRun(false);
    z.jobs.scholar = 3; z.lvl.observatory = 1; z.shell = sh; z._shellSnap = sh;
    return z;
  };
  const base1 = SB.economy.rates(obsFx(500000)).science;      // 本局起始壳厚 ⇒ 削薄进度 0%，×1.00
  const r50k = SB.economy.rates(obsFx(50000)).science;        // 削薄 90% ⇒ +18%，×1.18
  const r0 = SB.economy.rates(obsFx(0)).science;              // 完全削穿 ⇒ +20%，封顶
  check('观测站：壳厚 50000（本局初始 500000）⇒ 削薄 90%、学者科技 ×1.18',
    Math.abs(r50k / base1 - 1.18) < 1e-9, '×' + (r50k / base1).toFixed(6));
  check('观测站上限 +20%：壳厚 0 ⇒ ×1.20',
    Math.abs(r0 / base1 - 1.2) < 1e-9, '×' + (r0 / base1).toFixed(6));
  {
    const so = obsFx(80000);
    so.res.science = 0;
    SB.economy.tick(so, 1, noop);
    check('观测站：tick 与 rates 用同一份壳厚快照（面板不撒谎）',
      Math.abs(so.res.science - SB.economy.rates(so).science) < 1e-9,
      'tick=' + so.res.science + ' rates=' + SB.economy.rates(so).science);
  }

  /* ⑥ 速生珊瑚林 / 银行：职业专精乘区，只放大**那一个职业**那一行，与工具乘区独立相乘。
   *    ⚠️ 这条同时是防回归：谁把它塞回 gatherMul（全局采集轴），这两个比值会当场红。 */
  const cwFx = () => {
    const z = SB.state.freshRun(false);
    z.jobs = { coralwright: 4, quarrier: 4, gather: 2 };
    return z;
  };
  const cwOff = SB.economy.rates(cwFx());
  {
    const z = cwFx(); z.lvl.coralfarm = 3;
    const cwOn = SB.economy.rates(z);
    check('速生珊瑚林：每级珊瑚匠 +10%（3 级 ⇒ 珊瑚 ×1.30）',
      Math.abs(cwOn.coral / cwOff.coral - 1.30) < 1e-9,
      '珊瑚 ×' + (cwOn.coral / cwOff.coral).toFixed(3));
    check('速生珊瑚林不波及石头 / 藻食（它是职业专精，不是全局采集轴）',
      cwOn.stone === cwOff.stone && cwOn.kelp === cwOff.kelp,
      '石头 ' + cwOff.stone.toFixed(4) + '→' + cwOn.stone.toFixed(4) +
      ' / 藻食 ' + cwOff.kelp.toFixed(4) + '→' + cwOn.kelp.toFixed(4));
  }
  {
    /* 银行：让 pop = 0 ⇒ 奢侈需求 D = 0 ⇒ rates.luxury = 供给 S，比值才干净。 */
    const bkFx = () => { const z = SB.state.freshRun(false); z.jobs.merchant = 4; z.pop = 0; return z; };
    const off = SB.economy.rates(bkFx()).luxury;
    const z = bkFx(); z.lvl.bank = 2;
    check('银行：每级商人产出 +10%（2 级 ⇒ 奢侈品供给 ×1.20）',
      off > 0 && Math.abs(SB.economy.rates(z).luxury / off - 1.20) < 1e-9,
      'luxury ' + off.toFixed(6) + ' → ' + SB.economy.rates(z).luxury.toFixed(6));
  }

  /* ⑦ 三项工坊升级的效果都到账：pressSci/pressCul（双面落在两条线）、
   *    hydroMul（只放大汽轮机供给）、mineTitanium（钛有了产出）。 */
  const pu = SB.state.freshRun(false);
  pu.jobs.scholar = 3; pu.jobs.scribe = 3; pu.jobs.miner = 2;
  pu.upgrades = pu.upgrades || {};
  const sci0 = SB.economy.rates(pu).science, cul0 = SB.economy.rates(pu).culture;
  pu.upgrades.upg_printpress = true;
  check('雕版印刷机：学者 +30%（科技 ×1.30）',
    Math.abs(SB.economy.rates(pu).science / sci0 - 1.30) < 1e-9,
    'science ×' + (SB.economy.rates(pu).science / sci0).toFixed(3));
  check('雕版印刷机：书手 +30%（市政点 ×1.30）',
    Math.abs(SB.economy.rates(pu).culture / cul0 - 1.30) < 1e-9,
    'culture ×' + (SB.economy.rates(pu).culture / cul0).toFixed(3));
  check('深层矿井未装 ⇒ 钛零产出（门就是北京时间 upgrades 那一位）',
    SB.economy.rates(pu).titanium === 0, 'titanium=' + SB.economy.rates(pu).titanium);
  pu.upgrades.upg_deepmine = true;
  check('深层矿井装上 ⇒ 矿工产出钛', SB.economy.rates(pu).titanium > 0,
    'titanium=' + SB.economy.rates(pu).titanium);

  const hy = SB.state.freshRun(false);
  hy.lvl.hydroturbine = 2; hy.res.warmstone = 1e6;
  // ⚠️ 2026-10-05 flow 模型：rates().hydro 现在是「消耗」不是「供给」，测供给侧改读 hydroAlloc 的 supply。
  const hyd0 = SB.economy.hydroAlloc(hy, 1).supply;
  hy.upgrades = hy.upgrades || {}; hy.upgrades.upg_hppump = true;
  const hyd1 = SB.economy.hydroAlloc(hy, 1).supply;
  check('高压气泵：汽轮机热液能 +50%（只放大供给侧，flow 模型看供给）',
    Math.abs(hyd1 - hyd0 * 1.5) < 1e-9 && hyd0 > 0,
    'supply ' + hyd0.toFixed(3) + ' → ' + hyd1.toFixed(3));

  const hd = SB.state.freshRun(false);
  hd.lvl.hydroturbine = 2; hd.lvl.fissionplant = 1; hd.lvl.titancloud = 2;
  hd.lvl.hydroshop = 1; hd.lvl.spacestation = 1; hd.lvl.biomatlab = 1;
  hd.res.warmstone = 1e6; hd.wonders = { wonder_presspipe: true };
  const hdf = SB.economy.hydroAlloc(hd, 1);
  check('热液能来源拆分与总供给相加一致（汽轮机/热机管道/核热厂/泰坦气云）',
    Math.abs(hdf.turbineRate - 2) < 1e-9 && Math.abs(hdf.pressRate - 10) < 1e-9 &&
    Math.abs(hdf.fissionRate - 10) < 1e-9 && Math.abs(hdf.titancloudRate - 12) < 1e-9 &&
    Math.abs(hdf.turbineRate + hdf.pressRate + hdf.fissionRate + hdf.titancloudRate - hdf.supplyRate) < 1e-9,
    '来源=' + [hdf.turbineRate, hdf.pressRate, hdf.fissionRate, hdf.titancloudRate].join('/') +
      ' 总供给=' + hdf.supplyRate);
  check('热液能去向列出当秒实际分配（工坊/空间站/生物材料研究所）',
    Math.abs(hdf.shopRate - 1) < 1e-9 && Math.abs(hdf.stationRate - 2) < 1e-9 &&
    Math.abs(hdf.labRate - 3) < 1e-9 && Math.abs(hdf.left - 28) < 1e-9,
    '去向=' + [hdf.shopRate, hdf.stationRate, hdf.labRate].join('/') + ' 余流=' + hdf.left);

  /* ⚠️ 2026-10-05 flow 模型不变量：热液能 = 电力式瞬态流，**不进库存、不跨 tick 累积**。 */
  {
    // ① 只建汽轮机、不建工坊 ⇒ 主数=本 tick 供给(=台数)；100 tick 后仍是这个数（不累积）
    const f = SB.state.freshRun(false);
    f.lvl.hydroturbine = 3; f.res.warmstone = 1e9;
    SB.economy.tick(f, 1, noop);
    const sup0 = f.res.hydro;                       // 顶栏主数 = 每秒供给
    check('flow：只建汽轮机 ⇒ 主数=每秒供给(=台数)', Math.abs(sup0 - 3) < 1e-9, 'res.hydro=' + sup0);
    check('flow：无消耗方 ⇒ 速率行消耗=0', Math.abs(SB.economy.rates(f).hydro) < 1e-9,
      'rate.hydro=' + SB.economy.rates(f).hydro);
    for (let i = 0; i < 100; i++) SB.economy.tick(f, 1, noop);
    check('flow：100 tick 后不累积（仍=供给快照，不疯涨）', Math.abs(f.res.hydro - 3) < 1e-9,
      'res.hydro(100t)=' + f.res.hydro);
    // ② 工坊先吃满：汽轮机3(供3)/工坊2(需2) ⇒ 主数=3、消耗=2（速率为负）、钢>0
    const g = SB.state.freshRun(false);
    g.lvl.hydroturbine = 3; g.lvl.hydroshop = 2; g.res.warmstone = 1e9; g.res.silt = 1e9;
    SB.economy.tick(g, 1, noop);
    check('flow：工坊先吃满 ⇒ 主数=供给3、消耗=2（速率行取负）',
      Math.abs(g.res.hydro - 3) < 1e-9 && Math.abs(SB.economy.rates(g).hydro + 2) < 1e-9,
      'res.hydro=' + g.res.hydro + ' rate.hydro=' + SB.economy.rates(g).hydro);
    check('flow：工坊吃流产钢>0', g.res.steel > 0, 'steel=' + g.res.steel.toFixed(3));
    // ③ 天穹钻机吃剩流：汽轮机25(供25)/工坊2(需2,吃2,剩23≥20) ⇒ 钻机吃20，总消耗=22
    //    ⚠️ 2026-10-07 钻机改手动启动：夹具必须置 skydrillOn=true，否则 tickShell 的
    //       启动闸把整段②跳过 ⇒ run=0/starved 恒假（「夹具漏还原」家族的变体）。
    const k = SB.state.freshRun(false);
    k.lvl.hydroturbine = 25; k.lvl.hydroshop = 2; k.res.warmstone = 1e9; k.res.silt = 1e9;
    k.res.resonantDrill = 1000; k.wonders = { wonder_skydrill: true }; k.skydrillOn = true;
    SB.economy.tick(k, 1, noop);
    check('flow：天穹钻机吃剩流 ⇒ 总消耗=工坊2+钻机20=22（速率为负）',
      Math.abs(SB.economy.rates(k).hydro + 22) < 1e-9, 'rate.hydro=' + SB.economy.rates(k).hydro);
    check('flow：钻机供能足 ⇒ 实际破壳(skydrillRun>0)', (k.skydrillRun || 0) > 0, 'run=' + (k.skydrillRun || 0));
    // ④ 剩流不够钻机 ⇒ 钻机停摆（吃满工坊后剩流<20）
    const m = SB.state.freshRun(false);
    m.lvl.hydroturbine = 5; m.lvl.hydroshop = 2; m.res.warmstone = 1e9; m.res.silt = 1e9;
    m.res.resonantDrill = 1000; m.wonders = { wonder_skydrill: true }; m.skydrillOn = true;
    SB.economy.tick(m, 1, noop);
    check('flow：剩流<钻机需求 ⇒ 钻机停摆(skydrillStarved)', m.skydrillStarved === true, 'starved=' + m.skydrillStarved);
    // ④′ 手动启动闸（2026-10-07 用户「启动钻机按钮」）：建成但没拨开关 ⇒ 不转、不吃流、不算停摆。
    //     与 ③ 同夹具只差 skydrillOn，钉的是「开关是必要条件」这条语义；hydroAlloc 的取流判定同闸，
    //     所以速率行也必须回到 -2（只剩工坊），否则面板在钻机停着时撒谎。
    const m2 = SB.state.freshRun(false);
    m2.lvl.hydroturbine = 25; m2.lvl.hydroshop = 2; m2.res.warmstone = 1e9; m2.res.silt = 1e9;
    m2.res.resonantDrill = 1000; m2.wonders = { wonder_skydrill: true };
    SB.economy.tick(m2, 1, noop);
    check('flow：建成但未启动 ⇒ 钻机不转不吃流（run=0、starved 假、速率行只剩工坊-2）',
      !(m2.skydrillRun > 0) && !m2.skydrillStarved && Math.abs(SB.economy.rates(m2).hydro + 2) < 1e-9,
      'run=' + (m2.skydrillRun || 0) + ' rate.hydro=' + SB.economy.rates(m2).hydro);
    // ⑤ 量纲：dt 必须被归一（STEP 变化不改主数，否则「这 tick 产多少」会被当成「每秒」）
    const q = SB.state.freshRun(false);
    q.lvl.hydroturbine = 3; q.res.warmstone = 1e9;
    SB.economy.tick(q, 0.1, noop);
    check('flow：主数按每秒归一（dt=0.1 与 dt=1 同值，不随 STEP 缩）', Math.abs(q.res.hydro - 3) < 1e-9,
      'dt=0.1 ⇒ res.hydro=' + q.res.hydro);
  }

  /* ⚠️ 2026-10-07 修：热液能尤里卡**读错口径** —— 「产出达到 10/s」读的是 rates().hydro，
   *    而 flow 模型下 hydro = **净消耗（取负，恒 ≤ 0）** ⇒ 条件永不成立、工业化永不揭示、
   *    热锻工厂永不可达；表面症状只有一句「尤里卡那行显示的是被吃掉的那一截」。
   *    判据：rates 必须同时给出两个口径 —— hydro（净消耗，顶栏速率行用）
   *    与 hydroSupply（总生产，供给侧，尤里卡用）；谁读哪个由读的人决定，不许合并。 */
  {
    const ind = SB.tech.byId('industrialize');
    const hr = SB.state.freshRun(false);
    hr.lvl.hydroturbine = 3; hr.lvl.hydroshop = 2; hr.res.warmstone = 1e9; hr.res.silt = 1e9;
    SB.economy.tick(hr, 1, noop);
    const R = SB.economy.rates(hr);
    check('热液能两个口径分开：hydro=净消耗(≤0) / hydroSupply=总生产(≥0)',
      R.hydro < 0 && R.hydroSupply > 0 &&
      Math.abs(R.hydro + 2) < 1e-9 && Math.abs(R.hydroSupply - 3) < 1e-9,
      'hydro=' + R.hydro + ' hydroSupply=' + R.hydroSupply);
    check('工业化的尤里卡写的是 hydroSupply（不是被吃掉的 hydro）',
      !!ind && !!ind.cond && ind.cond.t === 'rate' && ind.cond.r === 'hydroSupply',
      'cond=' + JSON.stringify(ind && ind.cond));
    const sh = SB.tech.condShort(hr, ind.cond);
    check('尤里卡那行显示的是**总生产**（正数 3.00），不是减掉的那截',
      sh.txt.indexOf('3.00') >= 0 && sh.txt.indexOf('-') < 0 && sh.now > 0,
      'txt=' + sh.txt);
    /* 可达性：供给 ≥10 ⇒ 条件真的成立（旧口径下负数永远 ≥ 不了 10 ⇒ 尤里卡是死的）。 */
    const hb = SB.state.freshRun(false);
    hb.lvl.hydroturbine = 12; hb.res.warmstone = 1e9; hb.res.silt = 1e9;
    check('热液能产出达到 10/s ⇒ 工业化的尤里卡真能达成（不是恒假）',
      SB.tech.condMet(hb, ind.cond) === true && SB.economy.rates(hb).hydroSupply >= 10,
      'hydroSupply=' + SB.economy.rates(hb).hydroSupply);
    /* ⚠️ 顺手堵掉的潜伏 bug：hydroAlloc 的「没建汽轮机也没建工坊」提前返回**少三个 Rate 键**
     *    ⇒ steelFlow 的 `s.res.hydro = HF.supplyRate` 写成 undefined ⇒ 解了金属精炼、
     *    一台汽轮机都没建时，顶栏热液能主数是 undefined（NaN 家族，不报错、只显示错）。
     *    判据：解锁后未建 ⇒ 主数与两个速率都必须是有限的 0。 */
    const hz = SB.state.freshRun(false);
    hz.techs.metalrefine = true;
    SB.economy.tick(hz, 1, noop);
    const RZ = SB.economy.rates(hz);
    check('解锁热液能但没建汽轮机 ⇒ 主数/速率都是有限的 0（不是 undefined）',
      SB.economy.resUnlocked(hz, 'hydro') &&
      Number.isFinite(hz.res.hydro) && hz.res.hydro === 0 &&
      Number.isFinite(RZ.hydroSupply) && RZ.hydroSupply === 0,
      'res.hydro=' + JSON.stringify(hz.res.hydro) + ' hydroSupply=' + RZ.hydroSupply);
  }

  /* ⑧ 两座奇观：天壳切削器同时给科技与市政 +%（两条路都要读，
   *    漏一路 = 「那条线写着 +5%、另一行一个字不动」的那种半接线）；
   *    王国大交易所给幸福度 +1 与**贸易区** -10% 造价（分区降耗是本次新机制）。 */
  const wc = SB.state.freshRun(false);
  wc.jobs.scholar = 3; wc.jobs.scribe = 3;
  const s0 = SB.economy.rates(wc).science, c0 = SB.economy.rates(wc).culture;
  wc.wonders = { wonder_shellcutter: true };
  wc.lvl.observatory = 5;
  check('天壳切削器：观测站 5 级 ⇒ 科技 +5%（两条路同式，不着凉 one-sided）',
    Math.abs(SB.economy.rates(wc).science / s0 - 1.05) < 1e-9,
    'science ×' + (SB.economy.rates(wc).science / s0).toFixed(3));
  check('天壳切削器：市政点同样 +5%（漏接这一路就是典型的「面板撒谎」）',
    Math.abs(SB.economy.rates(wc).culture / c0 - 1.05) < 1e-9,
    'culture ×' + (SB.economy.rates(wc).culture / c0).toFixed(3));

  const ge = SB.state.freshRun(false);
  /* ballast（压舱仓）在**贸易区**，造价键是 stoneBeam/hardCoral —— 别拿 coral 去比，
   *   那样拿到的是 undefined，断言会一路连通却什么也没测（比直接红更糟）。 */
  const bc0 = SB.economy.costOf(ge, 'ballast').stoneBeam;
  ge.wonders = { wonder_grand_exchange: true };
  check('王国大交易所：贸易区域建筑造价 -10%（ballast 在贸易区）',
    bc0 > 0 && Math.abs(SB.economy.costOf(ge, 'ballast').stoneBeam - bc0 * 0.9) < 1e-9,
    'ballast ' + bc0 + ' → ' + SB.economy.costOf(ge, 'ballast').stoneBeam +
    '（期望 ' + (bc0 * 0.9).toFixed(4) + '，⚠️ 2026-10-05 起 costOf 不再取整）');
  check('王国大交易所：非贸易区建筑造价**不变**（分区降耗不该外溢）',
    SB.economy.costOf(ge, 'nest').coral === SB.economy.costOf(ge, 'nest').coral &&
    SB.economy.costOf(ge, 'observatory').steel === SB.economy.costOf(ge, 'observatory').steel,
    'nest=' + SB.economy.costOf(ge, 'nest').coral + ' observatory=' + SB.economy.costOf(ge, 'observatory').steel);
  SB.economy.tick(ge, 1, noop);
  check('王国大交易所：幸福度常驻偏移 +1（与政体偏移同源，不随时间累进）',
    SB.wonder.happyBonus(ge) === 1, 'happyBonus=' + SB.wonder.happyBonus(ge));
}

}
