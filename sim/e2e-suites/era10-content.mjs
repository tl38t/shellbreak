/* e2e suite: 纪元十 · 驭星纪（ERA10）数据 / 接线 / 终局面板。
 * 2026-10-20 用户 ERA10 表实装（授权「实装吧」）后固化。
 * ⚠️ 这一族的共同背景：ERA10 的 7 项科技**几乎全部是「改别的系统」**——发射场换模式、
 *    机器人倍率换读数、信仰基项加项、全产加一条轴、星屑乘区、发射场节律。数据落了没人读
 *    是这个项目最老的毛病（静默为 0、不报错、面板纹丝不动）。所以这里一律**行为断言**：
 *    给一个最小态，让 tick/rates 真跑，比对该变的数变了、不该变的数没动。
 * ⚠️ 数值今后要改时改 config.js / techs.js / config-content.js；本文件的期望值若被改，
 *    必须连带说明「谁拍的板」（例如节律 10→8 属用户表原值，不可随手调）。 */

export function run({ SB, check, noop, fs, path, ROOT }) {
  console.log('\n=== 纪元十 · 驭星纪 ===');
  const fr = () => SB.state.freshRun(false);
  const near = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);
  const f3 = v => (typeof v === 'number' ? (Math.abs(v) < 1e-9 ? '0' : v.toFixed(4)) : String(v));

  /* ---------------- ① 纪元元数据 + 7 科技形状 ---------------- */
  {
    const E = SB.ERAS || [];
    const e10 = E.filter(e => e.id === 10)[0];
    check('ERAS 末位是纪元十《驭星纪》（以星为盾）',
      !!e10 && e10.name === '驭星纪' && e10.motto === '以星为盾' && !!e10.desc,
      e10 ? e10.name + '/' + e10.motto : '缺失');
    check('纪元十不是最后一个之外的新坑：ERAS 长度 = 10（advanceEra 的 p.era>=E.length 兜底靠它）',
      E.length === 10, '长度=' + E.length);

    const T10 = SB.TECHS.filter(t => t.era === 10);
    const m = {}; T10.forEach(t => { m[t.id] = t; });
    const want = ['adiabatic', 'strong_ai', 'gravity_sling', 'near_star_orbit', 'vector_ctrl', 'heir_of_stars', 'unified_field'];
    check('纪元十恰好 7 项科技且 id 齐全',
      T10.length === 7 && want.every(id => !!m[id]), T10.map(t => t.id).join(','));
    check('三层分布：L1(d=20)=绝热材料/强人工智能/引力弹弓，L2(d=21)=近恒星轨道/空间矢量/继承繁星，L3(d=22)=大统一方程',
      m.adiabatic.layer === 20 && m.strong_ai.layer === 20 && m.gravity_sling.layer === 20 &&
      m.near_star_orbit.layer === 21 && m.vector_ctrl.layer === 21 && m.heir_of_stars.layer === 21 &&
      m.unified_field.layer === 22,
      [m.adiabatic.layer, m.strong_ai.layer, m.gravity_sling.layer, m.near_star_orbit.layer,
        m.vector_ctrl.layer, m.heir_of_stars.layer, m.unified_field.layer].join(','));
    check('前置与用户表逐条一致（继承繁星是孤儿节点：reqs 为空）',
      m.adiabatic.reqs.join() === 'terraform' &&
      m.strong_ai.reqs.join() === 'terraform' &&
      m.gravity_sling.reqs.join() === 'interlog' &&
      m.near_star_orbit.reqs.join() === 'adiabatic' &&
      m.vector_ctrl.reqs.join() === 'adiabatic,strong_ai' &&
      m.heir_of_stars.reqs.length === 0 &&
      m.unified_field.reqs.join() === 'near_star_orbit,vector_ctrl',
      want.map(id => id + '←[' + m[id].reqs.join('+') + ']').join(' '));
    const sum = T10.reduce((a, t) => a + t.cost, 0);
    check('成本阶梯合计 7200 万（800+850+900+1000+1050+1100+1500 万）',
      sum === 72000000, '合计=' + sum);
    check('尤里卡条件逐条：太阳帆50 / 充能站10 / 市政太阳系后勤 / 进度40% / 20% / 星屑70 / 进度80%',
      m.adiabatic.cond.t === 'sunSails' && m.adiabatic.cond.n === 50 &&
      m.strong_ai.cond.t === 'built' && m.strong_ai.cond.b === 'robotbay' && m.strong_ai.cond.n === 10 &&
      m.gravity_sling.cond.t === 'civic' && m.gravity_sling.cond.id === 'solar_logistics' &&
      m.near_star_orbit.cond.t === 'dysonPct' && m.near_star_orbit.cond.n === 40 &&
      m.vector_ctrl.cond.t === 'dysonPct' && m.vector_ctrl.cond.n === 20 &&
      m.heir_of_stars.cond.t === 'gathered' && m.heir_of_stars.cond.r === 'stardust' && m.heir_of_stars.cond.n === 70 &&
      m.unified_field.cond.t === 'dysonPct' && m.unified_field.cond.n === 80,
      want.map(id => id + ':' + m[id].cond.t + '/' + (m[id].cond.n === undefined ? m[id].cond.id : m[id].cond.n)).join(' '));
  }

  /* ---------------- ② 纪元闸门：ERA9 的漏 key 修好了，ERA10 终局不许瞬跳 ---------------- */
  {
    /* ⚠️ 2026-10-20 加 ERA10 时发现的地雷：ERA9 原本零 key ⇒ eraProgress.done 恒真
     *    ⇒ 玩家一进 ERA9、下一次 pump 就被 advanceEra 推走。修法是给 terraform 置 key。
     *    这条断言钉住「修好之后」的形状，将来谁把 key 摘掉会立刻红。 */
    check('纪元九恰有 1 个关键节点（terraform.key=true，防零 key 瞬跳）',
      SB.tech.keysOf(9).length === 1 && SB.tech.keysOf(9)[0].id === 'terraform',
      SB.tech.keysOf(9).map(t => t.id).join(','));
    {
      const s = fr(); s.era = 9;
      /* 只有 terraform 之外都学了 ⇒ 不推进（terrafor 是关键节点） */
      SB.TECHS.filter(t => t.era === 9 && t.id !== 'terraform').forEach(t => { s.techs[t.id] = true; });
      const adv = SB.tech.advanceEra(s, null);
      check('纪元九：terrafor 未学时 advanceEra 不推进（关键节点真的是闸门）',
        adv === 0 && s.era === 9, 'adv=' + adv + ' era=' + s.era);
      s.techs.terraform = true;
      const adv2 = SB.tech.advanceEra(s, null);
      check('纪元九：terraform 学完 ⇒ 推进到纪元十', adv2 === 10 && s.era === 10, 'adv=' + adv2 + ' era=' + s.era);
    }
    {
      /* ERA10 零 key（用户表没给关键节点）⇒ eraProgress.done 恒真，但终局无下一站。
       * 断言「done 为真但 advanceEra 返回 0 且 era 不动」——这才是「不瞬跳」的真正证据。 */
      const s = fr(); s.era = 10;
      const p = SB.tech.eraProgress(s);
      const adv = SB.tech.advanceEra(s, null);
      check('纪元十零关键节点：eraProgress.done 为真，但 advanceEra 返回 0 且 era 停在 10（终局不瞬跳）',
        p.keysTotal === 0 && p.done === true && adv === 0 && s.era === 10,
        'keysTotal=' + p.keysTotal + ' done=' + p.done + ' adv=' + adv + ' era=' + s.era);
    }
  }

  /* ---------------- ③ 新 cond 类型：sunSails / dysonPct ---------------- */
  {
    const tAd = SB.tech.byId('adiabatic'), tUni = SB.tech.byId('unified_field');
    const s = fr();
    s.sunSails = 49;
    check('sunSails 49 ⇒ 尤里卡未达成（门槛 50，卡在下面一条）',
      SB.tech.condMet(s, tAd.cond) === false, '太阳帆=' + s.sunSails);
    s.sunSails = 50;
    check('sunSails 50 ⇒ 尤里卡达成（≥ 口径，精确命中）',
      SB.tech.condMet(s, tAd.cond) === true, '太阳帆=' + s.sunSails);

    /* dysonPct 是「双达标取小」：帆满了节点零 ⇒ 进度仍是 0（这是用户拍 Q4 的核心）。 */
    const s2 = fr();
    s2.sunSails = 10000; s2.dysonNodes = 0;
    check('dysonPct 取小：帆 10000（满）＋ 节点 0 ⇒ 进度 0%，80% 门槛不达成',
      SB.economy.dysonPct(s2) === 0 && SB.tech.condMet(s2, tUni.cond) === false,
      'pct=' + SB.economy.dysonPct(s2));
    s2.dysonNodes = 200;
    check('dysonPct 取小：帆满 ＋ 节点 200（20%）⇒ 进度 20%（被慢的一侧卡住）',
      near(SB.economy.dysonPct(s2), 0.20, 1e-9), 'pct=' + SB.economy.dysonPct(s2));
    s2.sunSails = 5000; s2.dysonNodes = 500;
    check('dysonPct 双 50% ⇒ 0.50；超量（20000/2000）钳到 1',
      near(SB.economy.dysonPct(s2), 0.5, 1e-9) &&
      (function () { const x = fr(); x.sunSails = 20000; x.dysonNodes = 2000; return SB.economy.dysonPct(x) === 1; })(),
      'pct=' + SB.economy.dysonPct(s2));

    const shortSun = SB.tech.condShort(fr(), tAd.cond), shortPct = SB.tech.condShort(s2, tUni.cond);
    check('两种新 cond 的 condShort / condText 都有话可说（不是空串——空串会让面板留白）',
      !!shortSun.txt && shortSun.txt.indexOf('太阳帆') >= 0 && !!shortPct.txt && shortPct.txt.indexOf('%') >= 0 &&
      SB.tech.condText(tAd.cond).indexOf('太阳帆') >= 0 && SB.tech.condText(tUni.cond).indexOf('%') >= 0,
      shortSun.txt + ' | ' + shortPct.txt);
  }

  /* ---------------- ④ 解锁目标：建筑 / 升级 / 奇观 真的存在且双写 ---------------- */
  {
    const sr = SB.BUILDINGS.filter(b => b.id === 'solar_ring')[0];
    check('建筑「太阳星环」：300 θ金属 + 20 封闭藻仓，requiredTech=[near_star_orbit]',
      !!sr && sr.cost.thetaMetal === 300 && sr.cost.sealbin === 20 &&
      (sr.requiredTech || []).indexOf('near_star_orbit') >= 0,
      sr ? JSON.stringify(sr.cost) : '缺失');
    check('太阳星环走 space 分区（与卫星/空间站同区），平产 0.05 θ/秒/级进 BLD',
      (SB.BUILD_ZONE_OF || {}).solar_ring === 'space' && SB.BLD.solarRingOut === 0.05,
      'zone=' + (SB.BUILD_ZONE_OF || {}).solar_ring + ' out=' + SB.BLD.solarRingOut);
    check('科技 eff.unlockBuild 与建筑 requiredTech 双写一致（解锁权两处同写）',
      (SB.tech.byId('near_star_orbit').eff.unlockBuild || []).indexOf('solar_ring') >= 0);

    const upg = (SB.UPGRADES || []).filter(u => u.id === 'upg_strongai')[0];
    check('工坊升级「强人工智能」：need=strong_ai，造价 1000 θ金属',
      !!upg && upg.need === 'strong_ai' && upg.cost.thetaMetal === 1000,
      upg ? JSON.stringify(upg.cost) : '缺失');

    const w = (SB.WONDERS || []).filter(x => x.id === 'wonder_jupitor_mas')[0];
    check('奇观「朱庇特质量加速站」：need=gravity_sling，20 强工质火箭 + 100 θ薄膜，effect.biomatlabOut=1.0',
      !!w && w.need === 'gravity_sling' && w.cost.strongProp === 20 && w.cost.thinafilm === 100 &&
      w.effect && w.effect.biomatlabOut === 1.0,
      w ? JSON.stringify(w.cost) : '缺失');
    /* 🚨 这条是 2026-10-20 探针抓到的真 bug 的回归钉：常量曾落在 SB.UNIT.jupitorHydro，
     *    而 wonder.js 读 SB.CFG.JUPITOR_HYDRO ⇒ 读不存在的键恒 0，奇观建成一滴热液能都不耗。 */
    check('朱庇特耗流常量在 CFG.JUPITOR_HYDRO=20（奇观常量住 CFG，不留 UNIT 副本）',
      SB.CFG.JUPITOR_HYDRO === 20 && SB.UNIT.jupitorHydro === undefined,
      'CFG=' + SB.CFG.JUPITOR_HYDRO + ' UNIT=' + SB.UNIT.jupitorHydro);
    const sw = fr(); sw.wonders = { wonder_jupitor_mas: 1 };
    check('jupitorHydroDraw：建成 = 20/秒，没建 = 0（读数单一出处）',
      SB.wonder.jupitorHydroDraw(sw) === 20 && SB.wonder.jupitorHydroDraw(fr()) === 0,
      '建成=' + SB.wonder.jupitorHydroDraw(sw));

    check('戴森终局常量：LAUNCH_CYCLE=10 / 帆上限 10000 / 节点上限 1000',
      SB.CFG.LAUNCH_CYCLE === 10 && SB.CFG.DYSON_SAIL_CAP === 10000 && SB.CFG.DYSON_NODE_CAP === 1000,
      [SB.CFG.LAUNCH_CYCLE, SB.CFG.DYSON_SAIL_CAP, SB.CFG.DYSON_NODE_CAP].join('/'));
  }

  /* ---------------- ⑤ 太阳星环：平产 + 人口上限（biomatlab 停工也必须照产）---------------- */
  {
    const s = fr(); s.lvl.solar_ring = 2;
    const before = s.res.thetaMetal || 0;
    SB.economy.tick(s, 1, noop);
    check('2 级太阳星环、生物材料研究所 0 级 ⇒ 1 秒仍产 0.10 θ金属（早期 return 不吞星环）',
      near((s.res.thetaMetal || 0) - before, 0.10, 1e-9),
      'Δ=' + f3((s.res.thetaMetal || 0) - before));
    check('rates.thetaMetal 同值 0.10（面板 === 结算，dt=1 同式）',
      near(SB.economy.rates(s).thetaMetal, 0.10, 1e-9), 'rate=' + f3(SB.economy.rates(s).thetaMetal));
    const s0 = fr(), s3 = fr(); s3.lvl.solar_ring = 3;
    check('太阳星环 +1 人口上限/级（0→3 级合计 +3）',
      near(SB.economy.popCap(s3) - SB.economy.popCap(s0), 3, 1e-9),
      '0级=' + f3(SB.economy.popCap(s0)) + ' 3级=' + f3(SB.economy.popCap(s3)));
  }

  /* ---------------- ⑥ 发射场：帆 / 节点 两模式 + 节律 ---------------- */
  const launchState = (mode, techs) => {
    const s = fr();
    s.lvl.hydroturbine = 20; s.res.warmstone = 1e6;       // 供上热液能（发射场最低优先级，取剩流）
    s.lvl.europa_launch = 1;
    s.res.strongProp = 1e6; s.res.thinafilm = 1e6; s.res.tiplate = 1e6;
    s.launchMode = mode;
    (techs || []).forEach(id => { s.techs[id] = true; });
    return s;
  };
  {
    const sSail = launchState('sail');
    for (let i = 0; i < 20; i++) SB.economy.tick(sSail, 1, noop);
    check('帆模式：1 级发射场跑 20 秒 ⇒ 2 张太阳帆（节律 10s，产出按等级并行）',
      sSail.sunSails === 2 && (sSail.dysonNodes || 0) === 0,
      'sails=' + sSail.sunSails + ' nodes=' + sSail.dysonNodes);

    const sNo = launchState('node');                        // 节点模式但**没学《绝热材料》**
    for (let i = 0; i < 20; i++) SB.economy.tick(sNo, 1, noop);
    check('没学《绝热材料》却存着 launchMode=node（改档/旧档）⇒ 仍按帆模式走，不凭空产节点、不耗钛板',
      sNo.sunSails === 2 && (sNo.dysonNodes || 0) === 0 && near(1e6 - sNo.res.tiplate, 0, 1e-9),
      'sails=' + sNo.sunSails + ' nodes=' + sNo.dysonNodes + ' tiplate耗=' + f3(1e6 - sNo.res.tiplate));

    const sNode = launchState('node', ['adiabatic']);
    for (let i = 0; i < 20; i++) SB.economy.tick(sNode, 1, noop);
    check('节点模式（已学《绝热材料》）：20 秒 ⇒ 2 个节点，且按 1 引擎 + 1 薄膜 + 3 钛板/秒/级扣料',
      sNode.dysonNodes === 2 && (sNode.sunSails || 0) === 0 &&
      near(1e6 - sNode.res.strongProp, 20, 1e-6) && near(1e6 - sNode.res.thinafilm, 20, 1e-6) &&
      near(1e6 - sNode.res.tiplate, 60, 1e-6),
      'nodes=' + sNode.dysonNodes + ' 引擎耗=' + f3(1e6 - sNode.res.strongProp) +
      ' 薄膜耗=' + f3(1e6 - sNode.res.thinafilm) + ' 钛板耗=' + f3(1e6 - sNode.res.tiplate));

    const base = launchState('sail'), vec = launchState('sail', ['vector_ctrl']);
    for (let i = 0; i < 40; i++) { SB.economy.tick(base, 1, noop); SB.economy.tick(vec, 1, noop); }
    check('《空间矢量控制》把节律 10s 压到 8s：40 秒 4 帆 → 5 帆（launchCycle 加法键真的进 mul）',
      base.sunSails === 4 && vec.sunSails === 5,
      '无矢量=' + base.sunSails + ' 有矢量=' + vec.sunSails);
    check('launchCycle 键在 tech.mul：默认 0、矢量控制 −2（漏默认表会被「未知键静默忽略」吞掉）',
      SB.tech.mul({ techs: {} }).launchCycle === 0 &&
      SB.tech.mul({ techs: { vector_ctrl: true } }).launchCycle === -2,
      '空=' + SB.tech.mul({ techs: {} }).launchCycle + ' 矢量=' + SB.tech.mul({ techs: { vector_ctrl: true } }).launchCycle);
  }

  /* ---------------- ⑦ 戴森球 100%：置完成态 + 只弹一次通关窗 ---------------- */
  {
    const s = launchState('node', ['adiabatic']);
    s.sunSails = 10000; s.dysonNodes = 1000;
    /* 弹窗走 SB.ui.render.showDysonComplete（镜像星空槽满槽 showStarComplete）。
     * 这里**临时换成一个计数器**再还原：断言的是「tick 在 100% 那一刻调了它、且只调一次」，
     * 不是去验 DOM 长什么样（那是 ui-accessibility 的活）。 */
    const hadUi = !!(SB.ui && SB.ui.render && typeof SB.ui.render.showDysonComplete === 'function');
    let calls = 0;
    const orig = hadUi ? SB.ui.render.showDysonComplete : null;
    if (hadUi) SB.ui.render.showDysonComplete = function () { calls++; };
    SB.economy.tick(s, 1, noop);
    const doneAfter1 = s.dysonDone;
    for (let i = 0; i < 5; i++) SB.economy.tick(s, 1, noop);   // 再跑几秒：不许重复弹
    if (hadUi) SB.ui.render.showDysonComplete = orig;
    check('戴森球达 100% ⇒ dysonDone=true 且通关弹窗只调用 1 次（dysonPopupSeen 防重播）',
      hadUi && doneAfter1 === true && calls === 1 && s.dysonPopupSeen === true,
      'showDysonComplete=' + (hadUi ? '有' : '缺失') + ' calls=' + calls +
      ' done=' + doneAfter1 + ' seen=' + s.dysonPopupSeen);
    check('星图戴森面板渲染函数存在（refreshDysonPanel，与 iframe 签名分离）',
      !!(SB.ui && SB.ui.renderParts && typeof SB.ui.renderParts.refreshDysonPanel === 'function'));
  }

  /* ---------------- ⑧ 强人工智能：机器人倍率 + 信仰进人口基项 ---------------- */
  {
    const s = fr(); s.lvl.robotbay = 10; s.jobs = { miner: 2 }; s.robotJobs = { miner: 10 };
    const e1 = SB.folk.effJobs(s).miner;
    s.upgrades = { upg_strongai: true };
    const e2 = SB.folk.effJobs(s).miner;
    check('强人工智能：机器人 x1.2 → x1.5（2 人 + 10 机器人：14 → 17 等效工人）',
      near(e1, 14, 1e-9) && near(e2, 17, 1e-9) && SB.folk.robotMult(s) === 1.5 && SB.folk.robotPop(s) === 40,
      '前=' + f3(e1) + ' 后=' + f3(e2) + ' mult=' + SB.folk.robotMult(s));

    const faithOf = (upg, bay) => {
      const x = fr(); x.civics.theology = true; x.pop = 50; x.lvl.robotbay = bay;
      if (upg) x.upgrades = { upg_strongai: true };
      return SB.economy.rates(x).faith;
    };
    const f0 = faithOf(false, 0), f1 = faithOf(false, 10), f2 = faithOf(true, 10);
    check('信仰基项：买了升级后机器人按人口口径计入（50 人 + 40 机器人 ⇒ 1.0 → 1.8/秒）',
      near(f0, 1.0, 1e-9) && near(f1, 1.0, 1e-9) && near(f2, 1.8, 1e-9),
      f3(f0) + ' / ' + f3(f1) + ' / ' + f3(f2));
    check('没买升级时机器人**不**产信仰（门控在 upg_strongai，不在科技上）',
      near(f1, f0, 1e-12), 'bay0=' + f3(f0) + ' bay10=' + f3(f1));
  }

  /* ---------------- ⑨ 大统一方程：除科技/市政/信仰外的全产轴 ---------------- */
  {
    const uni = on => {
      const s = fr();
      s.techs.unified_field = !!on;
      s.res.science = 1e6; s.res.civic = 1e6;          // log10(2e6)=6.30 ⇒ floor=6 ⇒ +3%
      s.civics.theology = true; s.pop = 50;
      s.lvl.institute = 10; s.lvl.library = 10; s.lvl.mars_workshop = 10;
      s.jobs = { scribe: 5, scholar: 5, miner: 5 };
      return { s, r: SB.economy.rates(s) };
    };
    const A = uni(false), B = uni(true);
    check('unifiedMul = 1 + 0.005×floor(log10(科技点+市政点))：2e6 ⇒ 1.03，与旧日信仰同式',
      near(SB.economy.unifiedMul(A.s), 1, 1e-12) && near(SB.economy.unifiedMul(B.s), 1.03, 1e-12),
      '关=' + f3(SB.economy.unifiedMul(A.s)) + ' 开=' + f3(SB.economy.unifiedMul(B.s)));
    check('globalMulX = globalMul × unifiedMul（整轴比 1.03）',
      near(SB.economy.globalMulX(B.s) / SB.economy.globalMulX(A.s), 1.03, 1e-9),
      '比=' + f3(SB.economy.globalMulX(B.s) / SB.economy.globalMulX(A.s)));
    check('吃轴：钛产 20.0 → 20.6/秒（×1.03）',
      A.r.titanium > 0 && near(B.r.titanium / A.r.titanium, 1.03, 1e-9),
      f3(A.r.titanium) + ' → ' + f3(B.r.titanium));
    /* 排除项：科技与信仰**不许**被这条轴推起来（用户表明文「除科技、市政、信仰之外」）。
     * ⚠️ 这两条是「折进 globalMul」写法的守门员：一旦有人图省事把 unifiedMul 塞进 globalMul，
     *    科技行会自己推自己，比数就不再是 1。 */
    check('排除：科技产出比 1.000（不许自己推自己）',
      A.r.science > 0 && near(B.r.science / A.r.science, 1, 1e-12),
      f3(A.r.science) + ' → ' + f3(B.r.science));
    check('排除：信仰产出比 1.000（信仰不在轴内）',
      A.r.faith > 0 && near(B.r.faith / A.r.faith, 1, 1e-12),
      f3(A.r.faith) + ' → ' + f3(B.r.faith));
  }

  /* ---------------- ⑩ 朱庇特质量加速站：生物材料 ×2 + 20 热液能/秒 ---------------- */
  {
    const bio = won => {
      const s = fr(); s.lvl.biomatlab = 5; s.lvl.hydroturbine = 200; s.res.warmstone = 1e6;
      s.res.kelp = 1e6; s.res.iron = 1e6; s.res.titanium = 1e6; s.res.uranium = 1e6;
      if (won) s.wonders = { wonder_jupitor_mas: 1 };
      return s;
    };
    const w0 = bio(false), w1 = bio(true);
    const t0 = SB.economy.rates(w0).thetaMetal, t1 = SB.economy.rates(w1).thetaMetal;
    check('朱庇特：生物材料研究所产出 ×2（wonderBiomatlabOut 接进 thetaOut，非只写注释）',
      t0 > 0 && near(t1 / t0, 2, 1e-9), f3(t0) + ' → ' + f3(t1));
    const hf = SB.economy.hydroAlloc(w1, 1);
    check('朱庇特运转耗 20 热液能/秒（供给充足时全额取流）',
      hf.jupitorDraw === 20 && near(hf.jupitorRate, 20, 1e-9),
      'draw=' + f3(hf.jupitorDraw) + ' rate=' + f3(hf.jupitorRate));
    check('★ 净热液能速率含朱庇特那 20/s（hydro 汇总漏加 = 面板少算消耗）',
      near(SB.economy.rates(w1).hydro - SB.economy.rates(w0).hydro, -20, 1e-9),
      '无奇观=' + f3(SB.economy.rates(w0).hydro) + ' 有奇观=' + f3(SB.economy.rates(w1).hydro));
    /* 断流只停耗：供给不足时取流变小，但 biomatlab ×2 照给（effect 与流解耦）。 */
    const poor = bio(true); poor.lvl.hydroturbine = 2;
    const hfp = SB.economy.hydroAlloc(poor, 1);
    const poorTheta = SB.economy.rates(poor).thetaMetal;
    check('断流只停耗：供给不足 ⇒ 取流 < 20，但生物材料 ×2 照给',
      hfp.jupitorRate < 20 && near(poorTheta / t0, 2, 1e-9),
      'rate=' + f3(hfp.jupitorRate) + ' theta比=' + f3(poorTheta / t0));
  }

  /* ---------------- ⑪ 继承繁星之人：星屑 ×2 + 工坊动态效率 ---------------- */
  {
    const cr = (sd, tech) => {
      const s = fr(); s.got = s.got || {}; s.got.stardust = sd;
      if (tech) s.techs.heir_of_stars = true;
      return SB.workshop.craftRatio(s);
    };
    check('继承繁星：工坊效率 +x%，x = 星屑累计数（50 星屑 ⇒ +0.50，动态读数不是静态 eff）',
      near(cr(0, true), cr(0, false), 1e-12) && near(cr(50, true) - cr(50, false), 0.5, 1e-12),
      '0星屑=' + f3(cr(0, true)) + ' 50星屑=' + f3(cr(50, true)) + ' 无科技=' + f3(cr(50, false)));

    /* 星屑 ×2 在 prestige.doBreak 的星屑段（先民遗产/星间遗迹之后串联，floor 各自保留）。
     * 卫星 10 + 空间站 10、星空进度 0 ⇒ 基础 floor(20×0.1)=2 ⇒ 有科技 4。 */
    const sdOf = tech => {
      const s = fr();
      s.broken = true; s.civics.theology = true;
      s.lvl.satellite = 10; s.lvl.spacestation = 10;
      if (tech) s.techs.heir_of_stars = true;
      return SB.prestige.doBreak(s, noop, { silent: true }).stardust;
    };
    let sd0 = null, sd1 = null;
    try { sd0 = sdOf(false); sd1 = sdOf(true); } catch (e) { sd0 = 'ERR:' + e.message; }
    check('继承繁星：本轮回星屑 +100%（2 → 4）',
      sd0 === 2 && sd1 === 4, '无科技=' + sd0 + ' 有科技=' + sd1);

    /* 破壳发展分：META_ERA + W[10] 必须**双登记**——只登 META_ERA ⇒ W[10] 为 undefined ⇒ NaN；
     * 两处都不登 ⇒ `if(!e) continue` 静默跳过。两种都表现为「建满新建筑，发展分一分不涨」。 */
    const sA = fr(), sB = fr();
    sB.lvl.solar_ring = 8;
    const dScore = SB.prestige.breakReport(sB).buildingScore - SB.prestige.breakReport(sA).buildingScore;
    check('太阳星环计入破壳发展分（META_ERA + W[10]=89：8 级 ⇒ +89×log2(9)）',
      near(dScore, 89 * Math.log2(9), 1e-9), 'Δ=' + f3(dScore));
  }

  /* ---------------- ⑫ 资产落位：图标与五档阶段背景真的在磁盘上 ---------------- */
  if (fs && path && ROOT) {
    const techIcons = ['adiabatic', 'strong-ai', 'gravity-sling', 'near-star-orbit', 'vector-ctrl', 'heir-of-stars', 'unified-field']
      .map(n => 'assets/tech-icons/era-10/era10-' + n + '.png');
    const bldIcon = 'assets/building-icons/era-10/era10-solar-ring.png';
    const stages = [20, 40, 60, 80, 100].map(n => 'assets/dyson/stage-' + n + '.png');
    const missing = [], tiny = [];
    techIcons.concat([bldIcon], stages).forEach(rel => {
      const p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) { missing.push(rel); return; }
      if (fs.statSync(p).size < 400) tiny.push(rel + '(' + fs.statSync(p).size + 'B)');
    });
    check('13 个 ERA10 资产文件齐全（7 科技图标 + 1 建筑图标 + 5 档戴森背景）',
      missing.length === 0, missing.length ? '缺：' + missing.join(',') : '全在');
    check('资产非空壳（每个 > 400 字节，占位图也得真画了东西）',
      tiny.length === 0, tiny.length ? tiny.join(',') : '体积正常');
    /* 科技表里的 icon 路径必须逐条命中磁盘（改名/挪目录会静默变空图）。 */
    const dead = SB.TECHS.filter(t => t.era === 10 && t.icon).filter(t => !fs.existsSync(path.join(ROOT, t.icon)));
    check('纪元十科技的 icon 字段全部指向真实文件（无死链）',
      dead.length === 0, dead.map(t => t.id + '→' + t.icon).join(',') || '7/7 命中');
  }
}
