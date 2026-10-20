/* e2e suite: 纪元十 · 戴森纪 · 市政（ERA10 CIVICS）数据 / 接线 / UI 契约。
 * 2026-10-20 用户 ERA10 市政表实装（授权「实装吧」）后固化。
 *
 * ⚠️ 这一族几乎全部是「改别的系统」：三座发射场共用一套节律与耗流、政策卡改发射场节律与
 *    热液能耗、工坊乘区、信仰乘区、幸福度乘区、人口造价、等级上限。数据落了没人读是本项目
 *    最老的毛病（静默为 0、不报错、面板纹丝不动）⇒ 这里一律**行为断言**：造最小态真跑
 *    rates/tick，比对该变的数变了、不该变的数没动。
 *
 * ⚠️ 数值今后要改时改 config-buildings.js / civics-data.js / config-content.js；
 *    本文件的期望值若被改，必须连带说明「谁拍的板」：
 *    · 节律 10s −2（科技《空间矢量控制》）−2（卡《至高指令》）
 *    · 发射场每级耗流 2/s（欧罗巴原值，用户 2026-10-20「三座制造消耗相同」）
 *    · 虚境祭坛 30 人口/级、最高 3 级（用户表）
 *    · 我们的海 信仰/科研 −30%、工坊乘区 ×2（用户表 + 用户拍「乘区」）
 *    · 节能减耗 热液 −50%、幸福度消耗 +50%（用户表）

export function run({ SB, check, noop }) {} */
export function run({ SB, check, noop }) {
  console.log('\n=== 纪元十 · 戴森纪 · 市政 ===');
  const fr = () => SB.state.freshRun(false);
  const f4 = v => (typeof v === 'number' ? (Math.abs(v) < 1e-9 ? '0' : v.toFixed(4)) : String(v));
  const near = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);

  /* ---------------- ① 5 项市政形状 ---------------- */
  {
    const C10 = (SB.CIVICS || []).filter(c => c.era === 10);
    const m = {}; C10.forEach(c => { m[c.id] = c; });
    const want = ['public_works', 'supreme_directive', 'void_explore', 'ascend_void', 'our_sea'];
    check('纪元十恰好 5 项市政且 id 齐全',
      C10.length === 5 && want.every(id => !!m[id]), C10.map(c => c.id).join(','));
    check('layer 分布与用户表一致：公共工程局 L1 / 至高指令·虚境探索 L2 / 飞升虚境·我们的海 L3',
      m.public_works.layer === 1 && m.supreme_directive.layer === 2 &&
      m.void_explore.layer === 2 && m.ascend_void.layer === 3 && m.our_sea.layer === 3,
      [m.public_works.layer, m.supreme_directive.layer, m.void_explore.layer,
        m.ascend_void.layer, m.our_sea.layer].join(','));
    check('前置链：公共工程局←太阳系后勤保障；至高指令←公共工程局；我们的海←至高指令；虚境探索←太阳系后勤保障+虚境信仰；飞升虚境←虚境探索',
      m.public_works.reqs.join() === 'solar_logistics' &&
      m.supreme_directive.reqs.join() === 'public_works' &&
      m.our_sea.reqs.join() === 'supreme_directive' &&
      m.void_explore.reqs.join() === 'solar_logistics,void_faith' &&
      m.ascend_void.reqs.join() === 'void_explore',
      [m.public_works.reqs, m.supreme_directive.reqs, m.void_explore.reqs,
        m.ascend_void.reqs, m.our_sea.reqs].map(a => a.join('+')).join(' | '));
    check('鼓舞条件类型：built(发射场≥2) / tech(绝热材料) / card(已装备轮回之终末) / built(祭坛=3) / dysonPct(60)',
      m.public_works.boost.t === 'built' && m.public_works.boost.b === 'europa_launch' && m.public_works.boost.n === 2 &&
      m.supreme_directive.boost.t === 'tech' && m.supreme_directive.boost.id === 'adiabatic' &&
      m.void_explore.boost.t === 'card' && m.void_explore.boost.id === 'card_cycle_terminus' &&
      m.ascend_void.boost.t === 'built' && m.ascend_void.boost.b === 'void_altar' && m.ascend_void.boost.n === 3 &&
      m.our_sea.boost.t === 'dysonPct' && m.our_sea.boost.n === 60,
      [m.public_works.boost.t, m.supreme_directive.boost.t, m.void_explore.boost.t,
        m.ascend_void.boost.t, m.our_sea.boost.t].join(','));
  }

  /* ---------------- ② 三座发射场建筑 + 虚境祭坛 ---------------- */
  {
    const bs = SB.BUILDINGS || [];
    const byId = id => bs.filter(b => b.id === id)[0] || null;
    const el = byId('europa_launch'), tl = byId('terra_launch'), rl = byId('rhea_launch'), va = byId('void_altar');
    check('两座异星发射场存在且都带 launchpad 标记（三座共用同一套结算）',
      !!tl && !!rl && !!tl.launchpad && !!rl.launchpad && !!el && !!el.launchpad,
      [el && el.launchpad, tl && tl.launchpad, rl && rl.launchpad].join('/'));
    check('两座异星发射场由市政《公共工程局》解锁（requiredCivic，不是科技）',
      tl.requiredCivic === 'public_works' && rl.requiredCivic === 'public_works' && !tl.requiredTech && !rl.requiredTech,
      (tl.requiredCivic || '') + '/' + (rl.requiredCivic || ''));
    check('虚境祭坛由市政《虚境探索》解锁 + 等级上限 3 + 人口造价 30',
      !!va && va.requiredCivic === 'void_explore' && va.maxLvl === 3 && va.cost.pop === 30,
      va ? ('civic=' + va.requiredCivic + ' maxLvl=' + va.maxLvl + ' pop=' + va.cost.pop) : '缺失');
    check('虚境祭坛归信仰区、两座异星发射场归星海区（与同族建筑同区）',
      va.zone === 'faith' && tl.zone === 'space' && rl.zone === 'space',
      [va.zone, tl.zone, rl.zone].join(','));

    /* 造价「从 1 级开始」= **不进 COST_OFFSET_COVERED**（G.E.E.K 改造不给它们打折）。
     * 行为取证：把 geek.costOffset 调到 8，两座新场的造价必须纹丝不动（欧罗巴也不该动，
     * 因为它同样不在覆盖名单里）；而 nest（在名单里）必须变便宜——那是反向对照。 */
    const s = fr();
    /* ⚠️ 必须先把两座都升到 n>0：costOffset 的落点是 `Math.pow(ratio, max(0, n−offset))`，
     *    n=0 时偏移量为 0 ⇒ 造价不变，断言会**恒真**（假阳性）。第一版就踩过这个。 */
    s.lvl.terra_launch = 4; s.lvl.nest = 5;
    const c0 = SB.economy.costOf(s, 'terra_launch').steel;
    const n0 = SB.economy.costOf(s, 'nest').coral;
    s.geek = { geekOn: false, rheaDone: true, terraDone: true, costOffset: 8, rheaRun: 0, terraRun: 0 };
    const c1 = SB.economy.costOf(s, 'terra_launch').steel;
    const n1 = SB.economy.costOf(s, 'nest').coral;
    check('★ 异星发射场造价不吃 G.E.E.K 等级偏移（用户「消耗从 1 级开始」）；对照：nest 会变便宜',
      near(c0, c1, 1e-9) && n1 < n0 - 1e-6, '发射场 ' + f4(c0) + '→' + f4(c1) + '；对照 nest ' + f4(n0) + '→' + f4(n1));
  }

  /* ---------------- ③ 发射场读数：合计等级 / 节律 / 每级耗流 ---------------- */
  {
    const s = fr();
    check('launchLvl 三座求和（2+3+1=6）',
      (s.lvl.europa_launch = 2, s.lvl.terra_launch = 3, s.lvl.rhea_launch = 1, SB.economy.launchLvl(s) === 6),
      '合计=' + SB.economy.launchLvl(s));
    const s2 = fr();
    const base = SB.economy.launchCycleOf(s2);
    s2.techs.vector_ctrl = true; s2.techVer = (s2.techVer | 0) + 1;   // ⚠️ tech.mul 缓存契约
    const afterTech = SB.economy.launchCycleOf(s2);
    s2.cards = ['card_supreme_directive'];
    const afterCard = SB.economy.launchCycleOf(s2);
    check('★ 节律 10s −2（科技空间矢量）−2（卡至高指令）= 6s（钳下限 1）',
      base === 10 && afterTech === 8 && afterCard === 6,
      base + ' → ' + afterTech + ' → ' + afterCard);
    const s3 = fr();
    const h0 = SB.economy.launchHydroPer(s3);
    s3.cards = ['card_saving'];
    const h1 = SB.economy.launchHydroPer(s3);
    check('★ 每级热液耗流 2→1（节能减耗 −50%，三处读取同走这一个函数）',
      near(h0, 2, 1e-9) && near(h1, 1, 1e-9), f4(h0) + ' → ' + f4(h1));
  }

  /* ---------------- ④ 面板===结算：rates 与 tick 同源 ---------------- */
  {
    const mk = () => {
      const s = fr();
      s.lvl.europa_launch = 1; s.lvl.terra_launch = 1; s.lvl.rhea_launch = 1;
      s.lvl.hydroturbine = 400; s.res.warmstone = 1e8;
      s.res.strongProp = 1e6; s.res.thinafilm = 1e6; s.res.tiplate = 1e6;
      return s;
    };
    const s = mk();
    const r = SB.economy.rates(s);
    check('★ 三座各 1 级 ⇒ 帆速率 3/10 = 0.3/秒（rates 口径）',
      near(r.sunSailRate, 0.3, 1e-9), 'sunSailRate=' + f4(r.sunSailRate));

    s.cards = ['card_supreme_directive'];
    const r2 = SB.economy.rates(s);
    check('★ 装《至高指令》后速率变 3/8 = 0.375（卡字段真的进了结算，不是死线）',
      near(r2.sunSailRate, 0.375, 1e-9), 'sunSailRate=' + f4(r2.sunSailRate));

    const before = s.sunSails || 0;
    for (let i = 0; i < 30; i++) SB.economy.tick(s, 1, noop);
    const got = (s.sunSails || 0) - before;
    check('★ tick 跑 30s 实得 11 帆（30/8×3=11.25，节律量化取整）——面板速率与实摔一致',
      got === 11, '实得=' + got);

    /* 反向：库存断料时 tick 不产、rates 也报 0（同一条满料判据）。 */
    const s2 = mk(); s2.res.strongProp = 0; s2.cards = [];
    const rB = SB.economy.rates(s2);
    const b2 = s2.sunSails || 0;
    for (let i = 0; i < 10; i++) SB.economy.tick(s2, 1, noop);
    check('★ 缺强工质火箭引擎时 rates 与 tick 同步归零（不是只有一边停）',
      near(rB.sunSailRate, 0, 1e-9) && (s2.sunSails || 0) === b2,
      'rate=' + f4(rB.sunSailRate) + ' 实得=' + ((s2.sunSails || 0) - b2));
  }

  /* ---------------- ⑤ 我们的海：信仰/科研 −30%，工坊乘区 ×2 ---------------- */
  {
    const mk = on => {
      const s = fr();
      s.civics.theology = true; s.res.faith = 100; s.pop = 40; s.jobs.gather = 20;
      s.jobs.scholar = 10; s.lvl.library = 20; s.lvl.workshop = 5;
      s.cards = on ? ['card_our_sea'] : [];
      return s;
    };
    const A = mk(false), B = mk(true);
    const rA = SB.economy.rates(A), rB = SB.economy.rates(B);
    check('★ 信仰产出 ×0.7（−30%）', near(rB.faith / rA.faith, 0.7, 1e-6),
      f4(rA.faith) + '→' + f4(rB.faith) + ' 比=' + f4(rB.faith / rA.faith));
    check('★ 科研产出 ×0.7（−30%，走现成 sciOutMul 通道）', near(rB.science / rA.science, 0.7, 1e-6),
      f4(rA.science) + '→' + f4(rB.science) + ' 比=' + f4(rB.science / rA.science));
    const cA = SB.workshop.craftMul(A, { id: 'craft_plate' });
    const cB = SB.workshop.craftMul(B, { id: 'craft_plate' });
    check('★ 工坊效率乘区 ×2（用户拍「乘区」；不是加法轴 +100%）', near(cB / cA, 2, 1e-6),
      f4(cA) + '→' + f4(cB) + ' 比=' + f4(cB / cA));
    /* 反向：没装卡时 craftMul 不含这条乘区（不污染产线）。 */
    check('没装《我们的海》时乘区恒 1（SB.civic.cardOurSeaCraftMul 返回 1）',
      near(SB.civic.cardOurSeaCraftMul(A), 1, 1e-12), f4(SB.civic.cardOurSeaCraftMul(A)));
  }

  /* ---------------- ⑥ 节能减耗：幸福度消耗 +50% ---------------- */
  {
    const A = fr(), B = fr();
    A.pop = 50; B.pop = 50; B.cards = ['card_saving'];
    check('★ 居民幸福度消耗 ×1.5（happyBurn 共用函数，rates 与 tick 同源）',
      near(SB.economy.happyBurn(B) / SB.economy.happyBurn(A), 1.5, 1e-9),
      f4(SB.economy.happyBurn(A)) + '→' + f4(SB.economy.happyBurn(B)));
  }

  /* ---------------- ⑦ 虚境祭坛：人口造价 / 职业等比缩 / 等级上限 ---------------- */
  {
    const s = fr();
    s.pop = 120; s.jobs = { gather: 40, coralwright: 30, miner: 20, scholar: 10 };
    s.civics.void_explore = true;
    const c = SB.economy.costOf(s, 'void_altar');
    check('costOf(虚境祭坛) 只含 pop=30，**不含任何资源键**（人口不是 SB.RESS 条目）',
      c.pop === 30 && Object.keys(c).length === 1,
      JSON.stringify(c));
    check('canAfford 认人口：120 ≥ 30 可建',
      SB.economy.canAfford(s, c), 'pop=' + s.pop);

    const lump = Object.values(s.jobs).reduce((a, b) => a + b, 0);
    const ok1 = SB.habitat.build(s, 'void_altar', noop);
    const sum = Object.values(s.jobs).reduce((a, b) => a + b, 0);
    check('★ 建成扣 30 人口（120→90），jobs 按占比等比缩（100→75），Σjobs ≤ pop 恒成立',
      ok1 && s.pop === 90 && lump === 100 && sum === 75 && sum <= s.pop,
      'pop=' + s.pop + ' Σjobs ' + lump + '→' + sum);
    check('★ 各职业按比例缩（gather 40→30 / coralwright 30→22 / miner 20→15 / scholar 10→8）',
      s.jobs.gather === 30 && s.jobs.coralwright === 22 && s.jobs.miner === 15 && s.jobs.scholar === 8,
      JSON.stringify(s.jobs));

    const ok2 = SB.habitat.build(s, 'void_altar', noop);
    const ok3 = SB.habitat.build(s, 'void_altar', noop);
    const ok4 = SB.habitat.build(s, 'void_altar', noop);
    check('★ 等级上限 3：前三次成功、第四次被拦（build 内拦 ⇒ 自动建造同样拦住）',
      ok1 && ok2 && ok3 && !ok4 && s.lvl.void_altar === 3,
      '结果=' + [ok1, ok2, ok3, ok4].join(',') + ' lvl=' + s.lvl.void_altar);
    check('★ 三级共吃 90 人（120→30），人口上限不受影响（maxLvl 不扣 popCap）',
      s.pop === 30 && SB.economy.popCap(s) === SB.economy.popCap(fr()), 'pop=' + s.pop);

    /* 人口不足：canAfford 必须为 false（否则按钮亮着点了没反应）。 */
    const s2 = fr(); s2.pop = 20; s2.civics.void_explore = true;
    check('人口不足（20 < 30）时 canAfford=false、build 静默 false（不放行）',
      !SB.economy.canAfford(s2, SB.economy.costOf(s2, 'void_altar')) && !SB.habitat.build(s2, 'void_altar', noop),
      'pop=' + s2.pop);
  }

  /* ---------------- ⑧ card 条件类型（鼓舞「已装备政策卡」） ---------------- */
  {
    const c = { t: 'card', id: 'card_cycle_terminus' };
    const on = fr(); on.cards = ['card_cycle_terminus'];
    const off = fr();
    check('condMet(card)：装了=真、没装=假（判 s.cards，不是 s.civics）',
      SB.tech.condMet(on, c) === true && SB.tech.condMet(off, c) === false,
      SB.tech.condMet(on, c) + '/' + SB.tech.condMet(off, c));
    const sh = SB.tech.condShort(on, c);
    check('condShort(card) 有真实文案（不是空白默认分支）+ condText 有名字',
      !!sh && typeof sh.txt === 'string' && sh.txt.indexOf('轮回之终末') >= 0 &&
      SB.tech.condText(c).indexOf('轮回之终末') >= 0,
      sh && sh.txt);
  }

  /* ---------------- ⑨ 替代链 + 飞升虚境乱码 ---------------- */
  {
    const fever = (SB.POLICIES || []).filter(p => p.id === 'card_fever')[0];
    check('《至高指令》取代《星际探索热潮》（retiredBy 设在被替代卡上）',
      !!fever && fever.retiredBy === 'supreme_directive', fever && fever.retiredBy);

    /* 乱码：确定性 + 真的把字改成叠加形态（长度 > 原文）+ 没有零宽字符 */
    const R = SB.ui && SB.ui.render;
    if (R && R.voidCorrupt) {
      const a = R.voidCorrupt('飞升虚境', 3), b = R.voidCorrupt('飞升虚境', 3);
      check('★ 乱码确定性：同输入同 seed 两次结果完全一致（重绘不抖）', a === b, a);
      check('★ 乱码是「叠加」而非替换：长度 > 原文且仍含原字',
        a.length > 4 && a.indexOf('飞') >= 0 && a.indexOf('境') >= 0, '长度 ' + a.length);
      check('乱码不含零宽字符（U+200B–U+200F / U+FEFF 会把排版与复制搞坏）',
        !/[\u200b-\u200f\ufeff]/.test(a), 'ok');
      /* ⚠️ 2026-10-20 实测踩坑的永久护栏：中文字体（雅黑等）不含 U+0300–U+036F 组合变音符
       * 与 U+20DD–U+20E4 组合封闭符，叠在汉字上会渲染成 tofu 方块 □；且组合符必须与基字同字体，
       * 追加 font-family 回退救不了。汉字路径必须只用「中文字体确有字形」的独立符号。
       * 这条断言是纯文本层的，不依赖 DOM/字体 —— 一旦有人把汉字改回复合符就会红。 */
      check('★ 汉字乱码不使用组合符 U+0300–U+036F / U+20DD–U+20E4（中文字体无字形 ⇒ tofu 方块）',
        !/[\u0300-\u036f\u20dd-\u20e4]/.test(a), a.replace(/[\u4e00-\u9fff]/g, '汉'));
      check('汉字乱码叠加的是中文字体确有字形的怪异符号（方框/迭代符/半角假名/盲文）',
        /[\u2500-\u257f\u3005\u3006\u309d\u309e\u30fd\u30fe\uff66-\uff9f\u2800-\u28ff]/.test(a),
        a.replace(/[\u4e00-\u9fff]/g, '汉'));
      check('★ 拉丁乱码仍走组合符真叠加（西文字体有字形，正经 Zalgo）',
        /[\u0300-\u036f]/.test(R.voidCorrupt('Zalgo has come.', 13)), 'ok');
      check('不同 seed 腐蚀结果不同（否则所有行会长成一样）',
        R.voidCorrupt('飞升虚境', 3) !== R.voidCorrupt('飞升虚境', 7), 'ok');
    } else {
      check('render.voidCorrupt 已导出（无 DOM 环境下跳过内容断言）', false, 'SB.ui.render 不可用');
    }
  }

  /* ---------------- ⑩ 结算账：三座新建筑必须被破壳发展分登记 ---------------- */
  {
    const a = fr(), b = fr();
    b.lvl.terra_launch = 8; b.lvl.rhea_launch = 8; b.lvl.void_altar = 3;
    const d = SB.prestige.breakReport(b).buildingScore - SB.prestige.breakReport(a).buildingScore;
    /* 89 × [log2(9) ×2 + log2(4)] —— 一条都不能漏（漏登 = if(!e) continue 静默跳过）。 */
    const want = 89 * (Math.log2(9) * 2 + Math.log2(4));
    check('★ 泰拉/瑞亚发射场 + 虚境祭坛都进发展分（漏登会被 if(!e) continue 静默跳过）',
      isFinite(d) && near(d, want, 1e-6),
      'Δ=' + f4(d) + ' 期望=' + f4(want));
  }
}
