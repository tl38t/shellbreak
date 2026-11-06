/* e2e suite: 潮汐之树「万众热忱」三级基础削壳加速（2026-11-05）
 *
 * 设计口径（用户拍板）：vision 子树第三条独立根链，layer 1/2/3、cost 8/15/25，
 * 每级 +20% **加算**（1+0.2×n，满级 ×1.6，不是 1.2³）；局中点亮即时生效。
 * 数值唯一落点 = shell.js autoRate 的独立乘区，绝不并进 breakCoef。
 *
 * 钉住的事故类型：
 *   ① 有人图省事把 apply 键改成 coef（复用死键）⇒ 买破壳加速顺带加重寒流季暖石消耗、
 *      破壳后星空槽变快、coef 型尤里卡提前揭示 —— 静默副作用，只能靠数值逐位比对抓；
 *   ② 加算被误做成复利（1.2³=1.728）⇒ desc 写 +60% 而实装 +72.8%（薄壳之智同类事故）；
 *   ③ 新 apply 键漏进 emptyPerks ⇒ 老档缺键、autoRate 算出 NaN；
 *   ④ 乘区越过硬停手线 FLOOR_AT ⇒ ① 段直接把壳削到 0，跳过 ERA5 钻机科技链；
 *   ⑤ 三级链 nest 写反 / 成本写错 / 局中买完不生效；
 *   ⑥ 轮回商店是动态按 subtree 过滤的（不像星屑商店有硬编码白名单），
 *      但仍要真实 DOM 断言，防数据层有、上屏没有。
 *
 * ⚠️ 不 mock SB：夹具只改 meta 账本与运行态 perk 字段，走
 *    state.freshRun / shell.autoRate / shell.tickShell / prestige.buyPerk /
 *    ui.render.paneMeta 生产路径。所有临时字段都在 try/finally 里还原。
 */
export function run({ SB, check }) {
  console.log('\n=== 潮汐之树：万众热忱（基础削壳独立乘区） ===');
  const IDS = ['fanaticism1', 'fanaticism2', 'fanaticism3'];
  const meta = SB.game.meta();
  const cur = SB.game.run();
  const defs = IDS.map(id => (SB.TIDE_TREE || []).filter(p => p.id === id)[0]);
  const empty = SB.state.emptyPerks();

  /* ① 数据层：三节点结构 / 链式前置 / 成本 / 独立根 */
  check('vision 新增三节点「万众热忱」，字段与拍板值一致',
    defs.every(Boolean) &&
    defs.every((p, i) => p.subtree === 'vision' && p.layer === i + 1 && (p.n || 1) === 1 &&
      p.cost === [8, 15, 25][i] && p.apply && p.apply.shellDrive === 1 &&
      (i === 0 ? !p.nest : p.nest === IDS[i - 1])),
    defs.map(p => p ? p.id + '(L' + p.layer + ',' + p.cost + ')' : 'MISSING').join(' '));
  check('第一级是独立根：不用先买「钻机测绘」就能摸到',
    defs[0] && !defs[0].nest && !defs[0].nests, '');
  check('apply 键在 emptyPerks 白名单内（不靠存档兜底）',
    Object.prototype.hasOwnProperty.call(empty, 'shellDrive') && empty.shellDrive === 0 &&
    defs.every(p => p && Object.keys(p.apply || {}).every(k => Object.prototype.hasOwnProperty.call(empty, k))),
    'shellDrive=' + empty.shellDrive);
  check('每级倍率常数落在 config.js（数值不散进逻辑）',
    SB.CFG.SHELL_DRIVE_STEP === 0.2, 'SHELL_DRIVE_STEP=' + SB.CFG.SHELL_DRIVE_STEP);
  check('desc 写「基础削壳」而非「破壳速度」，且明说钻机段不变',
    defs.every(p => p && p.desc.indexOf('基础削壳') >= 0) &&
    defs[0].desc.indexOf('天穹钻机不变') >= 0, '');

  /* ② 数值：独立乘区、加算、老档缺键防御。
   *    probe 用 freshRun 造完整运行态，避免手搓对象漏字段让 breakCoef 读到 undefined。 */
  const probe = SB.state.freshRun(false);
  probe.perk.shellDrive = 0;
  const coef0 = SB.shell.breakCoef(probe);
  const rate0 = SB.shell.autoRate(probe);
  const warm0 = SB.economy.warmRate(probe);
  const net0 = SB.economy.rates(probe).warmstone;
  /* 星空槽只在破壳后非零，单独造一个 broken 探针，保证逐位比较不是拿两个 0 糊弄。 */
  const starProbe = SB.state.freshRun(false);
  starProbe.shell = 0; starProbe.broken = true; starProbe.starComplete = false;
  starProbe.perk.shellDrive = 0;
  const star0 = SB.economy.starRate(starProbe);
  check('基线：autoRate = BREAK_BASE × breakCoef（没点天赋时乘区为 1）',
    Math.abs(rate0 - SB.CFG.BREAK_BASE * coef0) < 1e-12, 'rate0=' + rate0);
  check('星空槽探针本身非零（下面的逐位比较有意义）', star0 > 0, 'star0=' + star0);

  for (let n = 1; n <= 3; n++) {
    probe.perk.shellDrive = n;
    const want = rate0 * (1 + 0.2 * n);
    check('点亮 ' + n + ' 级：autoRate = 基线 ×' + (1 + 0.2 * n).toFixed(1) + '（加算）',
      Math.abs(SB.shell.autoRate(probe) - want) < 1e-9,
      'autoRate=' + SB.shell.autoRate(probe).toFixed(6) + ' / 期望 ' + want.toFixed(6));
  }
  check('买满三级是 ×1.6 而不是 1.2³=1.728',
    Math.abs(SB.shell.autoRate(probe) / rate0 - 1.6) < 1e-12,
    '实装倍数=' + (SB.shell.autoRate(probe) / rate0).toFixed(6));

  /* 关键锁：A 不许进 breakCoef。四类读者逐位比对，改回去必红。 */
  probe.perk.shellDrive = 3;
  starProbe.perk.shellDrive = 3;
  check('买满后 breakCoef / 暖石费率 / 星空槽 / 暖石净速率逐位不变（A 不进 breakCoef）',
    SB.shell.breakCoef(probe) === coef0 &&
    SB.economy.warmRate(probe) === warm0 &&
    SB.economy.starRate(starProbe) === star0 &&
    SB.economy.rates(probe).warmstone === net0,
    'coef ' + coef0 + '→' + SB.shell.breakCoef(probe) +
    ' / warm ' + warm0 + '→' + SB.economy.warmRate(probe) +
    ' / star ' + star0 + '→' + SB.economy.starRate(starProbe));

  delete probe.perk.shellDrive;
  check('老档缺 shellDrive 键：按 0 处理，不产生 NaN 速率',
    isFinite(SB.shell.autoRate(probe)) && Math.abs(SB.shell.autoRate(probe) - rate0) < 1e-12,
    'autoRate=' + SB.shell.autoRate(probe));

  /* ③ 硬停手线：乘区再大也只能削到 FLOOR_AT，破壳仍必须靠天穹钻机。
   *    ⚠️ 夹具用 freshRun 的完整运行态再覆盖壳字段，不手搓对象 —— breakCoef 会经
   *    cardBreakCoefMul → folk.idle 读 s.jobs，手搓字典会在真 tickShell 里抛 TypeError。 */
  const fl = SB.state.freshRun(false);
  fl.shell = 260; fl.iceShell = 1000; fl.baseShell = 1000;
  fl.broken = false; fl.shellOpened = false; fl.breakSettled = false;
  fl.skydrillOn = false;
  fl.perk.shellDrive = 3;
  SB.shell.tickShell(fl, 100, null, {});
  const floor = 1000 * SB.CFG.FLOOR_AT;
  SB.shell.tickShell(fl, 100, null, {});       // 再跑一次：停手后不许抖动或继续削
  check('买满三级仍不越过 FLOOR_AT：壳精确停在 25%，且没触发破壳',
    fl.shell === floor && !fl.shellOpened && !fl.broken &&
    Math.abs(SB.economy.rOf(fl) - SB.CFG.FLOOR_AT) < 1e-12,
    'shell=' + fl.shell + ' / rOf=' + SB.economy.rOf(fl));

  /* ④ 真实购买路径：前置门 / 扣费 / 局中即时生效 / 新局派生 / 读档整表对齐。 */
  const keep = {
    tide: meta.tide, spent: meta.spent, perks: meta.perks,
    drive: cur && cur.perk ? cur.perk.shellDrive : 0
  };
  const rateBeforeBuy = SB.shell.autoRate(cur);
  try {
    meta.tide = 100;
    meta.perks = {};
    check('生产前置门：未买 I 时 buyPerk(II) 返回 false 且不扣费',
      SB.prestige.buyPerk(IDS[1]) === false && meta.tide === 100, 'tide=' + meta.tide);
    const bought = IDS.map(id => SB.prestige.buyPerk(id));
    check('三级都能从生产购买路径点亮', bought.every(Boolean) && IDS.every(id => meta.perks[id] === 1),
      JSON.stringify(meta.perks));
    check('累计扣费 8+15+25=48 轮回点，spent 同步记账',
      meta.tide === 52 && meta.spent === (keep.spent || 0) + 48,
      'tide=' + meta.tide + ' spent=' + meta.spent);
    check('局中购买即时写 s.perk.shellDrive，autoRate 当场变快（不是下一局才生效）',
      cur.perk.shellDrive === keep.drive + 3 &&
      Math.abs(SB.shell.autoRate(cur) - rateBeforeBuy * (1 + 0.2 * 3)) < 1e-9,
      'drive ' + keep.drive + '→' + cur.perk.shellDrive +
      ' / autoRate ' + rateBeforeBuy.toFixed(6) + '→' + SB.shell.autoRate(cur).toFixed(6));
    const nextRun = SB.state.freshRun(false);
    check('新局从 meta 派生 shellDrive=3（derivePerksFromMeta 通用路径，无需存档迁移）',
      nextRun.perk.shellDrive === 3, 'next shellDrive=' + nextRun.perk.shellDrive);
    const tmp = SB.state.freshRun(false);
    tmp.perk.shellDrive = 0;
    SB.state.syncDerivedPerks(tmp, meta);
    check('读档 syncDerivedPerks 按账本整表对齐新键（老档不丢加速）',
      tmp.perk.shellDrive === 3, 'sync 后 shellDrive=' + tmp.perk.shellDrive);
  } finally {
    meta.tide = keep.tide;
    meta.spent = keep.spent;
    meta.perks = keep.perks;
    if (cur && cur.perk) cur.perk.shellDrive = keep.drive;
    SB.state.saveMeta(meta);
  }

  /* ⑤ 真实 DOM：轮回商店按 subtree 动态过滤，仍要确认三张卡上屏、旧节点没被挤掉。 */
  const html = SB.ui.render.paneMeta();
  check('真实 DOM：「远见之人」副标题补了破壳，且三张卡各出现一次',
    html.indexOf('学者·钻机·薄壳·破壳') >= 0 && html.indexOf('meta-tree-vision') >= 0 &&
    IDS.every(id => (html.match(new RegExp('data-perk="' + id + '"', 'g')) || []).length === 1),
    'htmlLen=' + html.length);
  check('真实 DOM：卡名与加算文案上屏（I / II / III、累计 +60%）',
    ['万众热忱 I', '万众热忱 II', '万众热忱 III'].every(n => html.indexOf(n) >= 0) &&
    html.indexOf('累计 +60%') >= 0, '');
  check('真实 DOM：原有 vision 节点仍在，加三条没挤掉旧树',
    ['shellSurvey1', 'shellSurvey2', 'shellSurvey3', 'thinShell', 'vibrodrill']
      .every(id => html.indexOf('data-perk="' + id + '"') >= 0), '');
  check('TIDE_TREE 全表每个节点仍对应唯一购买按钮（含新链）',
    (SB.TIDE_TREE || []).every(p => (html.match(new RegExp('data-perk="' + p.id + '"', 'g')) || []).length === 1),
    '节点总数=' + (SB.TIDE_TREE || []).length);
}
