/* e2e suite: 星屑商店「天外重压」三级减壳（2026-11-05）
 *
 * 设计口径（用户拍板）：独立新组「天壳压制」；三级累计 −10/−20/−30% 壳厚，
 * 与潮汐之树「薄壳之智」**加算、无硬顶**；成本 4/8/16 星屑，定位多周目。
 *
 * 钉住的事故类型：
 *   ① 新节点数据层有、但 `starTrees.ids` 白名单没登记 ⇒ 商店里根本不渲染（最易漏）；
 *   ② 另造一个 `shellPress` perk 键 ⇒ freshRun / shellTarget / 备料三处口径漂移；
 *   ③ 局中买完效果即时生效 ⇒ 与「壳厚开局算定」矛盾，desc 写「下一局生效」就成了假话；
 *   ④ 扣费误写 stardustEarned ⇒ 白拿排行榜与尤里卡进度；
 *   ⑤ 加算被误做成「30% 硬顶」⇒ 吃掉薄壳之智的一部分效果（行为变更）。
 *
 * ⚠️ 不 mock SB：夹具只改 `SB.game.meta()` 返回的账本对象字段，再走
 *    `state.freshRun` / `prestige.buyStarPerk` / `ui.render.paneStarDome` 生产路径重算。
 *    所有临时字段都在 try/finally 里还原，套件挂在全量尾部，不污染前面的整局 bot。
 */
export function run({ SB, check }) {
  console.log('\n=== 星屑商店：天外重压（三级减壳） ===');
  const BASE = SB.CFG.ICE_SHELL;
  const IDS = ['starShellPress1', 'starShellPress2', 'starShellPress3'];
  const meta = SB.game.meta();
  const cur = SB.game.run();
  const defs = IDS.map(id => (SB.STAR_PERKS || []).filter(p => p.id === id)[0]);

  /* ① 数据层：三节点结构 / 链式前置 / 成本 / 复用 thin 键 */
  check('星屑商店新增三节点「天外重压」，字段与拍板值一致',
    defs.every(Boolean) &&
    defs.every((p, i) => p.kind === 'shell' && p.layer === i + 1 && p.n === 1 &&
      p.cost === [4, 8, 16][i] && p.apply && p.apply.thin === 1 &&
      (i === 0 ? !p.nest : p.nest === IDS[i - 1])),
    defs.map(p => p ? p.id + '(L' + p.layer + ',' + p.cost + ')' : 'MISSING').join(' '));
  check('减幅复用现有 perk.thin，没有另造壳厚键',
    !!SB.state.emptyPerks().thin || Object.prototype.hasOwnProperty.call(SB.state.emptyPerks(), 'thin'),
    'emptyPerks 有 thin 键=' + Object.prototype.hasOwnProperty.call(SB.state.emptyPerks(), 'thin'));
  check('新节点的 apply 键都在 emptyPerks 白名单内（不靠存档兜底）',
    defs.every(p => p && Object.keys(p.apply || {}).every(k =>
      Object.prototype.hasOwnProperty.call(SB.state.emptyPerks(), k))),
    '');
  const em = SB.state.emptyMeta().starPerks;
  check('emptyMeta 账本白名单含三个新 id 且初值为 0',
    IDS.every(id => em[id] === 0), IDS.map(id => id + '=' + em[id]).join(' '));
  check('level 1 前置门：没买 I 就买不动 II / III',
    defs[1] && defs[1].nest === IDS[0] && defs[2] && defs[2].nest === IDS[1], '');

  /* ② 走 freshRun 生产路径：三级壳厚与减幅。
   *    期望值用独立算式 BASE×(1−0.1×thin) 算，不照抄实现里的 max(0.1,…)。 */
  function freshWith(starPerks, perks) {
    const keepS = meta.starPerks, keepP = meta.perks;
    meta.starPerks = starPerks; meta.perks = perks || {};
    try { return SB.state.freshRun(false); }
    finally { meta.starPerks = keepS; meta.perks = keepP; }
  }
  const lvRuns = [
    freshWith({}),
    freshWith({ starShellPress1: 1 }),
    freshWith({ starShellPress1: 1, starShellPress2: 1 }),
    freshWith({ starShellPress1: 1, starShellPress2: 1, starShellPress3: 1 })
  ];
  check('未点亮：壳厚 = ICE_SHELL、perk.thin = 0',
    lvRuns[0].iceShell === BASE && (lvRuns[0].perk.thin || 0) === 0, 'iceShell=' + lvRuns[0].iceShell);
  for (let i = 1; i <= 3; i++) {
    const s = lvRuns[i], want = Math.round(BASE * (1 - 0.1 * i));
    check('点亮 ' + i + ' 级：壳厚 ' + want + '、减幅 ' + (i * 10) + '%、开局满壳',
      s.iceShell === want && s.shell === want && s.baseShell === BASE &&
      (s.perk.thin || 0) === i && Math.abs((1 - s.iceShell / BASE) - 0.1 * i) < 1e-12,
      'iceShell=' + s.iceShell + ' thin=' + s.perk.thin + ' shell=' + s.shell);
  }
  check('挑战目标 shellTarget 与 freshRun 同源（读同一份 thin）',
    SB.challenges.shellTarget(lvRuns[3]) === lvRuns[3].iceShell,
    'shellTarget=' + SB.challenges.shellTarget(lvRuns[3]) + ' / iceShell=' + lvRuns[3].iceShell);

  /* ③ 加算无硬顶：薄壳之智 apply thin:2 + 三级星屑 thin:3 = 5 ⇒ 减 50%。
   *    若误做成「30% 硬顶」，这里会得到 350000（而不是 250000）。 */
  const combo = freshWith({ starShellPress1: 1, starShellPress2: 1, starShellPress3: 1 }, { thinShell: 1 });
  check('与「薄壳之智」加算且无 30% 硬顶：thin=5 ⇒ 壳厚 250000（−50%）',
    (combo.perk.thin || 0) === 5 && combo.iceShell === Math.round(BASE * 0.5),
    'thin=' + combo.perk.thin + ' iceShell=' + combo.iceShell);
  const floorS = freshWith({ starShellPress1: 20 });
  check('0.1 结构下限仍在：thin 远超 10 级也不会把壳厚算成 0 或负数',
    floorS.iceShell === Math.round(BASE * 0.1) && floorS.iceShell > 0,
    'thin=' + floorS.perk.thin + ' iceShell=' + floorS.iceShell);

  /* ④ 真实购买路径：前置 / 扣费 / 即时 perk 与固化壳厚的分叉 / 下一局生效。
   *    buyStarPerk 会真的调 saveMeta 与 applyPerk，所以整段必须完整还原。 */
  const keep = {
    stardust: meta.stardust, earned: meta.stardustEarned, sp: meta.starPerks,
    thin: cur && cur.perk ? cur.perk.thin : 0,
    iceShell: cur && cur.iceShell, shell: cur && cur.shell
  };
  let bought = [];
  try {
    meta.stardust = 100;
    meta.starPerks = { starShellPress1: 0, starShellPress2: 0, starShellPress3: 0 };
    const earned0 = meta.stardustEarned;
    check('生产前置门：未买 I 时 buyStarPerk(II) 返回 false（不扣费）',
      SB.prestige.buyStarPerk(IDS[1]) === false && meta.stardust === 100,
      'stardust=' + meta.stardust);
    for (let i = 0; i < 3; i++) bought.push(SB.prestige.buyStarPerk(IDS[i]));
    check('三级都能从生产购买路径点亮', bought.every(Boolean) && IDS.every(id => meta.starPerks[id] === 1),
      JSON.stringify(meta.starPerks));
    check('累计扣费 4+8+16=28 星屑，且分文不写 stardustEarned',
      meta.stardust === 72 && meta.stardustEarned === earned0,
      'stardust=' + meta.stardust + ' earned=' + meta.stardustEarned);
    check('局中购买即时写 s.perk.thin（applyPerk 通用路径），但 s.iceShell 不重算',
      cur.perk.thin === keep.thin + 3 && cur.iceShell === keep.iceShell && cur.shell === keep.shell,
      'thin ' + keep.thin + '→' + cur.perk.thin + ' / iceShell ' + cur.iceShell + '→' + keep.iceShell);
    const nextRun = SB.state.freshRun(false);
    check('因此「下一局起生效」成立：新局壳厚 350000，desc 不是假话',
      nextRun.iceShell === Math.round(BASE * 0.7),
      'next iceShell=' + nextRun.iceShell);
    check('读档 syncDerivedPerks 能把 thin 按账本整表对齐（老档不丢加成）',
      (function () {
        const tmp = SB.state.freshRun(false);
        tmp.perk.thin = 0;
        SB.state.syncDerivedPerks(tmp, meta);
        return tmp.perk.thin === 3;
      })(), '');
  } finally {
    meta.stardust = keep.stardust;
    meta.stardustEarned = keep.earned;
    meta.starPerks = keep.sp;
    if (cur && cur.perk) cur.perk.thin = keep.thin;
    if (cur) { cur.iceShell = keep.iceShell; cur.shell = keep.shell; }
    SB.state.saveMeta(meta);
  }

  /* ⑤ 真实 DOM：新组在 starTrees 白名单里，三节点上屏、图标不空、旧五组没被挤掉。
   *    直接调 paneStarDome（与 paneMeta 同范式），避开假 DOM 的 children 回填与签名节流。 */
  const html = SB.ui.render.paneStarDome();
  check('真实 DOM：新增「天壳压制」组上屏，副标题写明下一局生效',
    html.indexOf('天壳压制') >= 0 && html.indexOf('star-tree-shell') >= 0 &&
    html.indexOf('下一局') >= 0 && html.indexOf('局中购买不对本局生效') >= 0,
    'htmlLen=' + html.length);
  check('真实 DOM：三张节点卡都在，且都带生产购买属性 data-star-perk',
    IDS.every(id => html.indexOf('data-star-perk="' + id + '"') >= 0) &&
    [1, 2, 3].every(i => html.indexOf('天外重压 ' + ['I', 'II', 'III'][i - 1]) >= 0),
    '');
  check('真实 DOM：三节点与组图标都指向薄壳之智同款素材，无空 src',
    (html.match(/thinafilm\.png\?v=2/g) || []).length >= 4 && html.indexOf('src=""') < 0,
    'thinafilm 图标数=' + (html.match(/thinafilm\.png\?v=2/g) || []).length);
  check('真实 DOM：原有五组仍在（加第 6 组没挤掉旧树）',
    ['star-tree-civilization', 'star-tree-enterprise', 'star-tree-industry',
      'star-tree-frontier', 'star-tree-automation'].every(k => html.indexOf(k) >= 0), '');
  check('星屑商店节点总数随新组同步（进度条分母读 STAR_PERKS 全表）',
    (SB.STAR_PERKS || []).filter(p => p.kind === 'shell').length === 3 &&
    html.indexOf('/ ' + (SB.STAR_PERKS || []).length) >= 0,
    'STAR_PERKS=' + (SB.STAR_PERKS || []).length);
}
