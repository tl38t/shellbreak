/* e2e suite: 轮回商店「天元突破」钻头倍率 1× / 2×（2026-11-05）
 *
 * 设计口径（用户拍板）：放在「钻机测绘 I→II→III」的终点（vision / layer 4 /
 * nest shellSurvey3），40 轮回点，解锁「可调倍率」能力；2× 档每秒投入两倍共振钻头、
 * 换两倍破壳速度。默认 1×，档位跨周目保留。
 *
 * 钉住的事故类型：
 *   ① 倍率只改了削壳速率没改钻头耗率（或反之）⇒ 白嫖加速 / 白烧材料；
 *   ② 热液能被顺手翻倍 ⇒ 用户只说「投入两倍钻头」，热液能 20/秒 必须逐位不变；
 *   ③ 倍率被塞进 breakCoef 或 s.perk 的数值键 ⇒ 前者污染暖石费率 / 星空槽，
 *      后者会被 syncDerivedPerks 按账本整表覆盖（读一次档就没了）；
 *   ④ 引擎两道钻头门（tickShell 的扣料、hydroAlloc 的取流）没同源 ⇒ 2× 档
 *      「取到流却扣不起料」或「扣了料却没取到流」，面板与结算互相撒谎；
 *   ⑤ 真实 DOM 没上屏 / 上屏了但文案仍写 0.1/秒、100 点/秒；
 *   ⑥ 前置链写反、扣费不是 40、买完不即时解锁、老档缺键出 NaN。
 *
 * ⚠️ 不 mock SB：夹具只改 meta 账本与运行态 perk / res 字段，走
 *    state.freshRun / shell.skydrillMul / shell.tickShell / economy.hydroAlloc /
 *    prestige.buyPerk / ui.input.toggleDrillMul / ui.renderParts.renderDrill 生产路径。
 *    所有临时状态都在 try/finally 里还原，套件放全量最尾部。
 */
export function run({ SB, check, g }) {
  console.log('\n=== 潮汐之树：天元突破（天穹钻机钻头倍率） ===');
  const ID = 'tengenToppa';
  const meta = SB.game.meta();
  const cur = SB.game.run();
  const def = (SB.TIDE_TREE || []).filter(p => p.id === ID)[0];
  const empty = SB.state.emptyPerks();
  const MAX = Number(SB.CFG.SKYDRILL_OVERDRIVE_MUL) || 2;

  /* ① 数据层：节点结构 / 终点 / 成本 / 文案 */
  check('vision 新增「天元突破」：layer 4、nest shellSurvey3、cost 40、apply 只作开关位',
    !!def && def.name === '天元突破' && def.subtree === 'vision' && def.layer === 4 &&
    def.nest === 'shellSurvey3' && def.cost === 40 && (def.n || 1) === 1 &&
    def.apply && def.apply.drillOverdrive === 1 && Object.keys(def.apply).length === 1,
    def ? def.id + '(L' + def.layer + ',' + def.cost + ',' + def.nest + ')' : 'MISSING');
  check('落点确是钻机测绘链终点：前置节点存在且自己是唯一挂它尾上的倍率节点',
    (SB.TIDE_TREE || []).some(p => p.id === 'shellSurvey3') &&
    (SB.TIDE_TREE || []).filter(p => p.nest === 'shellSurvey3' && /倍率|突破/.test(p.name)).length === 1, '');
  check('apply 键在 emptyPerks 白名单内且默认 0（不靠存档兜底）',
    Object.prototype.hasOwnProperty.call(empty, 'drillOverdrive') && empty.drillOverdrive === 0,
    'drillOverdrive=' + empty.drillOverdrive);
  check('倍率常数只在 config.js，值为 2', MAX === 2, 'SKYDRILL_OVERDRIVE_MUL=' + MAX);
  check('desc 写清 2× / 默认 1× / 热液能不变（别让玩家以为买了就自动烧双份）',
    !!def && /2×/.test(def.desc) && /默认仍/.test(def.desc) && /热液能不变/.test(def.desc), '');

  /* ② 唯一读数口：门 = 已购天赋，档 = meta.skydrillMul（跨周目）。 */
  check('meta 默认档为 1×（新装 / 空档不会静默烧双份钻头）',
    SB.state.emptyMeta().skydrillMul === 1, 'default=' + SB.state.emptyMeta().skydrillMul);
  const probe = SB.state.freshRun(false);
  probe.perk.drillOverdrive = 1;
  check('读了档的 meta 也带 skydrillMul 键（normalizeMeta 不吞新字段）',
    Object.prototype.hasOwnProperty.call(SB.state.normalizeMeta(JSON.parse(JSON.stringify(meta))), 'skydrillMul'), '');

  const keep = {
    tide: meta.tide, spent: meta.spent, perks: meta.perks, mul: meta.skydrillMul,
    drive: cur && cur.perk ? cur.perk.drillOverdrive : 0
  };

  try {
    meta.skydrillMul = 2;
    probe.perk.drillOverdrive = 0;
    check('没点天赋：即使 meta 记着 2× 也恒 1×（能力是买来的）',
      SB.shell.skydrillMul(probe) === 1, 'mul=' + SB.shell.skydrillMul(probe));
    probe.perk.drillOverdrive = 1;
    check('点了天赋 + 档位 2 ⇒ 唯一读数口返回 2',
      SB.shell.skydrillMul(probe) === 2, 'mul=' + SB.shell.skydrillMul(probe));
    meta.skydrillMul = 7;
    check('脏档倍率 7 ⇒ 回落 1×（不许任意数乘进消耗与速率）',
      SB.shell.skydrillMul(probe) === 1, 'mul=' + SB.shell.skydrillMul(probe));
    const dirty = JSON.parse(JSON.stringify(meta)); dirty.skydrillMul = 7;
    const good = JSON.parse(JSON.stringify(meta)); good.skydrillMul = 2;
    check('normalizeMeta：脏档归 1、合法 2× 保留',
      SB.state.normalizeMeta(dirty).skydrillMul === 1 &&
      SB.state.normalizeMeta(good).skydrillMul === 2, '');
    delete probe.perk.drillOverdrive;
    check('老档缺 drillOverdrive 键 ⇒ 1×，不产生 NaN',
      SB.shell.skydrillMul(probe) === 1 && isFinite(SB.CFG.SKYDRILL_DRILL * SB.shell.skydrillMul(probe)), '');

    /* ③ 真结算：tickShell ② 段的钻头耗率与削壳速率同倍放大。
     *    ⚠️ 用 freshRun 的完整运行态（breakCoef 会经 cardBreakCoefMul → folk.idle 读 s.jobs）；
     *       rOf=0.2 < FLOOR_AT ⇒ ① 自动削壳段整段不跑，测到的 cut 全是钻机段。
     *       _hydroFlow 手工给 skyDraw>0 ⇒ 绕开流分配，单独钉「钻头段」这一份。 */
    function makeProbe() {
      const s = SB.state.freshRun(false);
      s.perk.shellSurvey = 0;
      s.shell = 100000; s.iceShell = 500000; s.baseShell = 500000;
      s.broken = false; s.shellOpened = false; s.breakSettled = false;
      s.skydrillOn = true;
      s.wonders.wonder_skydrill = 1;
      s.res.resonantDrill = 100;
      /* ⚠️ 夹具必须有热液供给侧：hydroAlloc 在「一台热液设备都没有」时会走
       *    economy.js:1809 的提前返回（全 0 对象，skyNeed/skyStopWhy 恒 0/null），
       *    根本走不到天穹钻机那段。裸 freshRun 会造出「门没生效」的假红。 */
      s.lvl.hydroturbine = 30;
      s._hydroFlow = { skyDraw: 1 };
      return s;
    }
    function cutOf(mul, extra) {
      const s = makeProbe();
      s.perk.drillOverdrive = 1;
      if (extra) extra(s);
      meta.skydrillMul = mul;
      const before = s._cutSky || 0, bits0 = s.res.resonantDrill;
      SB.shell.tickShell(s, 1, null, {});
      return { cut: (s._cutSky || 0) - before, burn: bits0 - s.res.resonantDrill, s: s };
    }
    const r1 = cutOf(1), r2 = cutOf(2);
    check('1× 基线：削壳 = SKYDRILL_RATE、钻头 = SKYDRILL_DRILL（口径没被别处改）',
      Math.abs(r1.cut - SB.CFG.SKYDRILL_RATE) < 1e-9 &&
      Math.abs(r1.burn - SB.CFG.SKYDRILL_DRILL) < 1e-9,
      'cut=' + r1.cut + ' burn=' + r1.burn);
    check('2×：削壳速率与钻头耗率同时翻倍（不是只改一边）',
      Math.abs(r2.cut - r1.cut * 2) < 1e-9 && Math.abs(r2.burn - r1.burn * 2) < 1e-9,
      'cut ' + r1.cut + '→' + r2.cut + ' / burn ' + r1.burn + '→' + r2.burn);
    check('两档的 breakCoef 逐位不变（倍率绝没并进破壳系数）',
      SB.shell.breakCoef(r1.s) === SB.shell.breakCoef(r2.s) &&
      SB.economy.warmRate(r1.s) === SB.economy.warmRate(r2.s), '');
    const ha1 = SB.economy.hydroAlloc(r1.s, 1), ha2 = SB.economy.hydroAlloc(r2.s, 1);
    check('热液能需求 20/秒不随倍率放大（用户只说「投入两倍钻头」）',
      Math.abs(ha1.skyNeed - SB.CFG.SKYDRILL_HYDRO) < 1e-9 &&
      Math.abs(ha2.skyNeed - SB.CFG.SKYDRILL_HYDRO) < 1e-9,
      'need1=' + ha1.skyNeed + ' need2=' + ha2.skyNeed +
      ' / shell=' + r2.s.shell + ' broken=' + r2.s.broken + ' on=' + r2.s.skydrillOn +
      ' owned=' + !!(SB.wonder.owned(r2.s).wonder_skydrill) + ' bits=' + r2.s.res.resonantDrill +
      ' why=' + ha2.skyStopWhy);
    const rSS = cutOf(2, s => { s.perk.shellSurvey = 4; });
    check('钻机测绘 _ss 仍与倍率相乘（2× 且 +20% ⇒ 240 点/秒，不是覆盖成 200）',
      Math.abs(rSS.cut - SB.CFG.SKYDRILL_RATE * 1.2 * 2) < 1e-9, 'cut=' + rSS.cut);
    const rDrive = cutOf(2, s => { s.perk.shellDrive = 3; });
    check('万众热忱只加速①自动削壳段，不污染②钻机段',
      Math.abs(rDrive.cut - r2.cut) < 1e-9, 'cut=' + rDrive.cut);

    /* ④ 两道钻头门同源：hydroAlloc 的 dCost 必须跟着 2× 一起变大。
     *    0.15 个钻头 @ dt=1：1× 够（0.1），2× 不够（0.2）⇒ skyStopWhy 从非 bit 变 bit。 */
    const gate = makeProbe();
    gate.perk.drillOverdrive = 1;      // ⚠️ 夹具必须自己点亮天赋，否则唯一读数口恒 1×（假红）
    gate.res.resonantDrill = 0.15;
    delete gate._hydroFlow;
    meta.skydrillMul = 1;
    const h1 = SB.economy.hydroAlloc(gate, 1);
    meta.skydrillMul = 2;
    const h2 = SB.economy.hydroAlloc(gate, 1);
    check('1× 下 0.15 钻头够取流（不报缺钻头）', h1.skyStopWhy !== 'bit', 'why=' + h1.skyStopWhy);
    check('2× 下 0.15 钻头不够 ⇒ skyDraw=0 且 skyStopWhy=bit（与 tickShell 的 dCost 同源）',
      h2.skyStopWhy === 'bit' && h2.skyDraw === 0,
      'why=' + h2.skyStopWhy + ' draw=' + h2.skyDraw + ' need=' + h2.skyNeed +
      ' / shell=' + gate.shell + ' on=' + gate.skydrillOn + ' bits=' + gate.res.resonantDrill +
      ' owned=' + !!(SB.wonder.owned(gate).wonder_skydrill));

    /* ⑤ 生产路径：前置门 / 扣费 / 局中即时解锁 / 派生 / 倍率切换。 */
    meta.tide = 100;
    meta.perks = {};
    meta.skydrillMul = 1;
    check('生产前置门：没买「钻机测绘 III」时 buyPerk 返回 false 且不扣费',
      SB.prestige.buyPerk(ID) === false && meta.tide === 100, 'tide=' + meta.tide);
    meta.perks = { shellSurvey3: 1 };
    check('点亮成功，恰好扣 40 轮回点并同步 spent',
      SB.prestige.buyPerk(ID) === true && meta.tide === 60 &&
      meta.spent === (keep.spent || 0) + 40 && meta.perks[ID] === 1,
      'tide=' + meta.tide + ' spent=' + meta.spent);
    check('局中点亮即时写 s.perk.drillOverdrive（按钮当场可用，不是下一局）',
      cur && cur.perk && cur.perk.drillOverdrive === keep.drive + 1,
      'drive ' + keep.drive + '→' + (cur && cur.perk && cur.perk.drillOverdrive));
    check('新局从 meta 派生开关位（derivePerksFromMeta / syncDerivedPerks 通用路径，零存档迁移）',
      SB.state.freshRun(false).perk.drillOverdrive === 1 &&
      (() => { const t = SB.state.freshRun(false); t.perk.drillOverdrive = 0; SB.state.syncDerivedPerks(t, meta); return t.perk.drillOverdrive === 1; })(), '');
    const tp = makeProbe();
    tp.perk.drillOverdrive = 1;
    check('拨档：1× → 2× → 1×，写的是 meta 且生产切换函数返回新档',
      SB.ui.input.toggleDrillMul(tp) === 2 && meta.skydrillMul === 2 &&
      SB.ui.input.toggleDrillMul(tp) === 1 && meta.skydrillMul === 1,
      'meta.skydrillMul=' + meta.skydrillMul);
    const noPerk = makeProbe();
    noPerk.perk.drillOverdrive = 0;
    check('没点天赋时拨档被挡住，不改 meta（防直达调用）',
      SB.ui.input.toggleDrillMul(noPerk) === false && meta.skydrillMul === 1, '');

    /* ⑥ 真实 DOM：倍率按钮只在已购时出现，文案显示真实耗率 / 速率。
     *    ⚠️ 放最后：toggleDrillMul 内部会 renderAll，可能把 #envDrill 清回隐藏态。 */
    meta.skydrillMul = 2;
    const ui = makeProbe();
    ui.perk.drillOverdrive = 1;
    SB.ui.renderParts.renderDrill(ui);
    const on2 = g('envDrill');
    check('真实 DOM（已购 + 2×，运转中）：倍率按钮 / 当前档 / 200 点/秒 / 启动按钮全上屏',
      on2.indexOf('data-drill-mul="1"') >= 0 && on2.indexOf('钻头 2×') >= 0 &&
      on2.indexOf('data-skydrill="1"') >= 0 &&
      on2.indexOf('200 点/秒') >= 0 && on2.indexOf('2× 档') >= 0,
      'htmlLen=' + on2.length + '\n' + on2.slice(0, 700));
    /* 钻头耗率只印在「未启动 / 停摆」两态，运转中那行只印削壳速率 ——
     * 按状态分开断言，别拿一个分支的文案去验另一个分支（上一版就是这么假红的）。 */
    ui.skydrillOn = false;
    SB.ui.renderParts.renderDrill(ui);
    const stopped2 = g('envDrill');
    check('真实 DOM（已购 + 2×，未启动）：耗率文案写 0.2/秒，不再是旧的 0.1/秒',
      stopped2.indexOf('0.2/秒') >= 0 && stopped2.indexOf('0.1/秒') < 0 &&
      stopped2.indexOf('data-drill-mul="1"') >= 0,
      'htmlLen=' + stopped2.length + '\n' + stopped2.slice(0, 700));
    ui.perk.drillOverdrive = 0;
    SB.ui.renderParts.renderDrill(ui);
    const off = g('envDrill');
    check('真实 DOM（未购，未启动）：无倍率按钮、耗率回落 0.1/秒',
      off.indexOf('data-drill-mul') < 0 && off.indexOf('0.1/秒') >= 0 &&
      off.indexOf('data-skydrill="1"') >= 0,
      'htmlLen=' + off.length + '\n' + off.slice(0, 700));
    ui.skydrillOn = true;
    SB.ui.renderParts.renderDrill(ui);
    const offRun = g('envDrill');
    check('真实 DOM（未购，运转中）：速率回落 100 点/秒，且始终没有倍率按钮',
      offRun.indexOf('100 点/秒') >= 0 && offRun.indexOf('data-drill-mul') < 0,
      'htmlLen=' + offRun.length + '\n' + offRun.slice(0, 700));
  } finally {
    meta.tide = keep.tide;
    meta.spent = keep.spent;
    meta.perks = keep.perks;
    meta.skydrillMul = keep.mul;
    if (cur && cur.perk) cur.perk.drillOverdrive = keep.drive;
    SB.state.saveMeta(meta);
  }
}
