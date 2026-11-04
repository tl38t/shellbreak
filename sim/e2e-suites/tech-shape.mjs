/* e2e suite: static technology-tree shape checks. */
export function run({ SB, check }) {

/* ---------------- 科技树形状（静态自查）----------------
 * 两条都只遍历数据表、不依赖某一次具体模拟：规则本身是静态的，
 * 把静态规则写进动态断言里，等于把违规藏进流程中偶尔才跑到的那一步。 */
console.log('\n=== 科技树形状 ===');
{
  const T = SB.TECHS, m = {};
  T.forEach(t => { m[t.id] = t; });

  /* ① 尤里卡条件不得指向本项自己解锁的东西。
   * 匠作就是栽在这上面：条件要「匠人 ≥ 2」，而匠人职业只有掌握本项才存在。 */
  const selfRef = [];
  T.forEach(t => {
    const eff = t.eff || {}, c = t.cond || {}, mine = (eff.unlockBuild || []).concat(eff.unlockJob || []);
    const bad = [];
    if (c.t === 'built' && mine.indexOf(c.b) >= 0) bad.push('建筑 ' + c.b);
    if (c.t === 'job' && mine.indexOf(c.j) >= 0) bad.push('职业 ' + c.j);
    if (bad.length) selfRef.push(t.id + ' 要求 ' + bad.join('、') + '，而那正是由它解锁的');
  });
  check('没有科技的尤里卡条件指向它自己解锁的东西', selfRef.length === 0, selfRef.join('；'));

  /* ③ 页签红点谓词 hasResearchable（2026-10-17）：复用 studyBlocked 同一门禁，与节点「可研究」状态同源。 */
  check('SB.tech.hasResearchable 是可调用函数', typeof SB.tech.hasResearchable === 'function');
  const tc = SB.state.freshRun(false);
  check('科技面板关（未建成 5 座巨藻场）⇒ 无红点', SB.tech.hasResearchable(tc) === false);
  const tf = SB.state.freshRun(false);
  tf.lvl.kelp = 5;                                  // 开门：建成 5 座巨藻场
  tf.eureka = tf.eureka || {}; tf.eureka['writing'] = true;  // 结绳已揭示
  check('面板开 + 结绳揭示（cost 0、无前置）⇒ 有红点', SB.tech.hasResearchable(tf) === true,
    'writing blocked=' + (SB.tech.studyBlocked(tf, 'writing') || 'null'));
  tf.techs['writing'] = true;                       // 研究掉
  check('结绳研究完成后 ⇒ 红点消（完成项不计入）', SB.tech.hasResearchable(tf) === false);

  /* ④ 效果文案的玩家向覆盖（2026-10-17）：数据里写了 effectDesc 就整条用它。
   *   起因：用户报「热泉回流」只印「原料消耗 ×0.6」——说不出是**哪栋建筑、哪样原料**，
   *   因为 bldEff 这个键名对玩家没有语义（LABEL 只能给通用词）。 */
  const effText = t => SB.tech.effectText(t);
  const descTech = T.filter(t => t.effectDesc);
  const notOverride = descTech.filter(t => effText(t) !== t.effectDesc).map(t => t.id);
  check('写了 effectDesc 的科技：效果文案整条用它（覆盖自动生成）', notOverride.length === 0,
    '未生效 ' + notOverride.join(','));

  const vr = m.ventrecir;
  const vrTxt = vr ? effText(vr) : '';
  check('热泉回流的效果文案点明「哪栋建筑 + 哪样原料」',
    !!vr && /热泉炉/.test(vrTxt) && /热液工坊/.test(vrTxt) && /金属/.test(vrTxt) && /暖石/.test(vrTxt),
    vrTxt || 'ventrecir 不存在');

  const keepAuto = T.filter(t => !t.effectDesc && t.eff && Object.keys(t.eff).length);
  const fellThrough = keepAuto.filter(t => effText(t) === '（无直接效果）').map(t => t.id);
  check('没写 effectDesc 的科技仍走自动生成（覆盖不外溢）', fellThrough.length === 0,
    '被吞掉 ' + fellThrough.join(','));

  /* ⚠️ 反向：自有 eff 的科技若同时写 effectDesc，等于把结构化数值从「效果」栏藏起来。
   *   这些例外是故意保留的：ventrecir 的 bldEff 需补充解释；invert 与 abyssgeo
   *   的 effectDesc 是数值效果的玩家可读说明 ⇒ 用白名单钉住，
   *   以后新增必须在这里补一行说明，不能默默加。 */
  const both = T.filter(t => t.effectDesc && t.eff && Object.keys(t.eff).length).map(t => t.id);
  const allowedBoth = ['abyssgeo', 'invert', 'ventrecir'];
  check('eff 与 effectDesc 同时存在的只允许白名单（abyssgeo/invert/ventrecir）',
    both.length === allowedBoth.length && allowedBoth.every(id => both.includes(id)), both.join(','));

  /* ② 依赖深度：reqs 决定「同一层能同时点亮几项」。压平前最深 10 层、主干一根直链。 */
  const d = {};
  T.forEach(t => { d[t.id] = 0; });
  for (let round = 0; round < T.length; round++)
    T.forEach(t => (t.reqs || []).forEach(r => {
      if (m[r] && d[r] + 1 > d[t.id]) d[t.id] = d[r] + 1;
    }));
  const maxD = Math.max.apply(null, T.map(t => d[t.id]));
  const at = n => T.filter(t => d[t.id] === n);
  /* ⚠️ 阈值取 14 有出处，不是跟着树长随手加的：
   *    ① 破壳链的物理下限仍是 6（techs.js 顶部推过：skydrill ≥ shellgeo+1 ≥
   *       invert+2 ≥ physics+3 ≥ … ≥ 天壳观测 → 教育 → 数学 → 导航 → 照明）；
   *    ② 纪元一 2026-09-26 按用户规格重排成**四层**（结绳 → 四个方向 → 加深 → 成事）；
   *    ③ era5 在 invert(d=6) 之上叠天壳地质学(d=7) + 天穹钻机(d=8)；
   *    ④ ERA6（2026-10 实装）在 skydrill(d=8) 之上再叠三层：
   *       minipump/modpart(d=9) → chemistry(d=10) → engraving/specfuel/exostruct(d=11)；
   *    ⑤ ERA7（2026-10-17 实装）在 exostruct(d=11) / rocket(d=11) 之上再叠三层：
   *       surface/crewed/architect(d=12) → ancient/spacestation/fission/complexf(d=13)，
   *       其中 ancient 链 = ancient(d=13) ← surface(d=12) ← rocket(d=11) ← refine/exostruct，
   *       再沿破壳链回溯 ⇒ 最深 14。深度直接由 approved 的 reqs 链推出，不是迁就现状。 */
  /* ⑥ ERA8（2026-10-18 实装 · spec docs/ERA8_TECHS_SPEC_v0.1.md v0.3）在 exostruct/rocket
   *    之上的三档：deepspace/biomat(d=14) → laser/robotics/xenoconst(d=15) →
   *    bigdata/gascloud/protoai/nanotech(d=16)。
   *    ⚠️ 口径：**链深度 = layer + 1** —— rocket→crewed 那条线（layer 11/12）深度差 1
   *       （基线最深 14 = layer 13 的 spacestation/complexf）。同差保留 ⇒ 最深 17。
   *       深度仍由 approved 的 reqs 链推出，不是迁就现状。 */
  /* ⑦ ERA9（寻光纪 · 2026-10-19 实装 · spec docs/ERA9_TECHS_SPEC_v0.1.md v0.2）在 ERA8
   *    之上的三叠层：microwave_heat/alien_eng/blackhistory(d=19) → terraform/interlog/winter(d=20)。
   *    深度由 approved 的 reqs 链推出（terraform←alien_eng←ecological_restoration←…），
   *    不是迁就现状；d=20 是纪元九正常加深上限 ⇒ 边界抬到 20。 */
  /* ⑧ ERA10（驭星纪 · 2026-10-20 实装 · 用户 ERA10 表）在 ERA9 之上再叠三层：
   *    L1 绝热材料/强人工智能/引力弹弓(d=21) → L2 近恒星轨道/空间矢量/继承繁星(d=22)
   *    → L3 大统一方程(d=23)。深度同样由 approved 的 reqs 链推出（不是迁就现状）⇒ 边界抬到 23。
   *    ⚠️ 这条不是「上限」，是「当前设计应该有多深」的账：下一次加纪元照此格式续写，
   *       并在括号里继续累加来源（本行是第 8 次追加）。 */
  check('最深科技 ≤ 23 层（破壳链 6 + era5 叠 2 + 纪元一 4 层 + ERA6 叠 3 + ERA7 叠 3 + ERA8 叠 3 + ERA9 叠 3 + ERA10 叠 3；深度=layer+1）', maxD <= 23,
    '最深 ' + maxD + ' 层：' + at(maxD).map(t => t.id).join(','));
  check('第二层 ≥ 3 项可并行（不是一根直链）', at(1).length >= 3, 'L1=' + at(1).length + ' 项');
  check('第三层 ≥ 4 项可并行', at(2).length + at(3).length >= 6,
    'L2=' + at(2).length + ' L3=' + at(3).length);

  const pumpCond = { t: 'upgrade', id: 'upg_hppump' };
  const pumpShort = SB.tech.condShort(SB.state.freshRun(false), pumpCond);
  const pumpText = SB.tech.condText(pumpCond);
  check('升级类尤里卡显示中文升级名，不泄漏 upg_hppump 内部 ID',
    pumpShort.txt === '完成工坊升级「高压气泵」' &&
    pumpText === '完成工坊升级「高压气泵」' &&
    !pumpShort.txt.includes('upg_hppump') && !pumpText.includes('upg_hppump'),
    pumpShort.txt + ' / ' + pumpText);

  const humanRun = SB.state.freshRun(false), conditionLeaks = [];
  const hasUnexpectedLatin = text => (text.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
    .some(token => !/^[IVXLCDM]+$/.test(token));
  T.forEach(t => {
    if (!t.cond) return;
    const short = SB.tech.condShort(humanRun, t.cond);
    [short && short.txt, SB.tech.condText(t.cond)].forEach(text => {
      if (text && hasUnexpectedLatin(text)) conditionLeaks.push(t.id + ': ' + text);
    });
  });
  SB.CIVICS.forEach(c => {
    if (!c.boost) return;
    const short = SB.tech.condShort(humanRun, c.boost);
    [short && short.txt, SB.civic.boostText(humanRun, c)].forEach(text => {
      if (text && hasUnexpectedLatin(text)) conditionLeaks.push(c.id + ': ' + text);
    });
  });
  check('全部科技尤里卡与市政鼓舞条件文案不含英文/内部键（允许名称中的罗马数字）', conditionLeaks.length === 0,
    conditionLeaks.join('；'));

  /* 空 eff 的科技不能再把设计备注塞进「效果」栏；玩家文案必须有明确归属。 */
  const noEffect = T.filter(t => !t.eff || Object.keys(t.eff).length === 0);
  const noCopy = noEffect.filter(t => !t.effectDesc && !t.unlockDesc).map(t => t.id);
  check('没有结构化数值效果的科技都有玩家可读的效果或解锁说明', noCopy.length === 0,
    noCopy.join(','));
  const devCopy = noEffect.filter(t => /Civ6:|\b(?:game|workshop|prestige|economy)\.|\bcycle\b|\btick\b|\bcost\b/i
    .test([t.effectDesc, t.unlockDesc].filter(Boolean).join(' '))).map(t => t.id);
  check('空效果科技的玩家文案不暴露对标来源或内部实现术语', devCopy.length === 0,
    devCopy.join(','));

  /* ③ 层（2026-09-26 暗流纪重排按用户规格分四层）。
   * ⚠️ 这条是**显示层的教训**：layer 曾经只写在 techs.js 的**注释**里，数据表与面板
   *    都不读它 ⇒ 结绳（层一）和历法（层二）在面板上平铺成并排，玩家根本看不出分层，
   *    重排成的四层形状等于白做。所以这里连「字段存在」+「与 reqs 自洽」一起测，
   *    真正的「面板分了组」由下面 ④ 那条 DOM 断言盯着。 */
  const L1 = T.filter(t => t.era === 1);
  const noLayer = L1.filter(t => typeof t.layer !== 'number');
  check('纪元一每项都带 layer（形状不写在注释里）', noLayer.length === 0,
    noLayer.map(t => t.id).join(','));
  check('结绳是层一唯一一项，历法在层二',
    m.writing && m.writing.layer === 1 &&
    L1.filter(t => t.layer === 1).length === 1 &&
    m.calendar && m.calendar.layer === 2,
    'L1=' + L1.filter(t => t.layer === 1).map(t => t.id).join(','));

  /* 层与 reqs 不许打架：前置必须在同层或更浅的层，否则「层」只是好看的装饰。 */
  const badLayer = [];
  T.forEach(t => (t.reqs || []).forEach(r => {
    if (!m[r] || m[t.id].layer == null || m[r].layer == null) return;
    if (m[r].layer > m[t.id].layer)
      badLayer.push(t.id + '(L' + m[t.id].layer + ') ← ' + r + '(L' + m[r].layer + ')');
  }));
  check('没有科技的前置比它自己更深一层', badLayer.length === 0, badLayer.join('；'));
}

/* ---------------- 多级科技读档后仍可继续升级（2026-11-03）----------------
 * 玩家实测「微波收敛研究 等级 3/5，按钮灰着写等级 3/5，点不动也不说原因」。
 * 根因是三处叠加：① state-migrate 每次读档 `out.eureka = {}`；
 * ② revealEra 与 discover 的守卫都是「已掌握跳过」⇒ 已掌握节点的 eureka 永远补不回来；
 * ③ canStudy/studyBlocked 只认 isRevealed（静态标记），而渲染侧 revealed 用 metOf
 *    （含 techs 兜底）⇒ 面板正常显示内容、按钮却是灰的，且 blockKind 判不出原因为空。
 * 这四条断言把「读档 → 仍可升级」的整条链路钉住。 */
{
  const raw = { res: { science: 1e9 }, techs: { microwave_heat: true, mwconverge: true },
    techLv: { mwconverge: 3 }, eureka: { mwconverge: 1 }, eurekaMet: { mwconverge: 1 },
    sunSails: 1200, lvl: {}, civics: {}, era: 9 };
  const s = SB.state.migrateRun(raw);
  check('迁移不再把纪元夹到 7（ERAS 已 10 个）', s.era === 9, 'era=' + s.era);
  check('迁移清空 eureka 后，已掌握的多级科技仍判「可研究」（isRevealed 假但 metOf 真）',
    SB.tech.canStudy(s, 'mwconverge') && SB.tech.studyBlocked(s, 'mwconverge') === null,
    'blocked=' + JSON.stringify(SB.tech.studyBlocked(s, 'mwconverge')));
  const before = !!s.eureka.mwconverge;
  SB.tech.discover(s);
  check('discover 会把「已掌握但缺 eureka」的节点补揭示（否则读档后永远卡住）',
    before === false && s.eureka.mwconverge === 1, 'before=' + before);
  const lv0 = SB.tech.level(s, 'mwconverge');
  const ok = SB.tech.study(s, 'mwconverge');
  check('实际升级成功：3/5 → 4/5，且科技点按 researchCost 扣',
    ok === true && SB.tech.level(s, 'mwconverge') === lv0 + 1,
    'lv=' + SB.tech.level(s, 'mwconverge'));
}

/* ---------------- 《天壳地质学》破壳门槛 75%（2026-11-04 用户拍板）----------------
 * 旧值 0.5 ⇒ 玩家「破壳不到一半钻头就造不了」。改成 0.75 后恰好卡在自动削壳的
 * 停手线 FLOOR_AT=0.25 上，所以除了数值本身，更要钉住**可达性**：
 * 若门槛 > 0.75，钻机建成前 brokenRatio 永远够不到，而钻机的科技链要过 shellgeo
 * ⇒ 整条破壳链死锁。这里同时锁住「面板文案跟着 n 走」，避免出现「面板说 50%、
 * 实际要 75%」的撒谎。 */
{
  const T = SB.TECHS;                 // 上面的 T/m 在各自块作用域里，这里另取
  const geo = T.find(t => t.id === 'shellgeo');
  const at = r => ({ iceShell: 500000, shell: 500000 * (1 - r) });
  const floorRatio = 1 - SB.CFG.FLOOR_AT;
  check('《天壳地质学》门槛 = 破壳 75%，与自动削壳停手线对齐',
    geo && geo.cond && geo.cond.t === 'shell' && geo.cond.n === 0.75 && floorRatio === 0.75,
    geo && JSON.stringify(geo.cond));
  check('条件文案输出「破壳 75%」（不写死旧值 50%）',
    SB.tech.condText(geo.cond) === '破壳 75%' && SB.tech.condShort(at(0.5), geo.cond).need === 0.75,
    SB.tech.condText(geo.cond));
  check('削掉 50% ⇒ 未达成（旧口径会在这一步放行）',
    SB.tech.condMet(at(0.5), geo.cond) === false);
  check('★ 自动段停手线 75% ⇒ 达成，破壳链没有循环依赖死锁',
    SB.shell.brokenRatio(at(floorRatio)) === 0.75 && SB.tech.condMet(at(floorRatio), geo.cond) === true,
    'br=' + SB.shell.brokenRatio(at(floorRatio)));
  check('破壳后 100% ⇒ 仍达成（条件不回退）', SB.tech.condMet(at(1), geo.cond) === true);
  const ones = T.filter(t => t.cond && t.cond.t === 'shell' && t.cond.n === 1);
  check('另一条「破壳 100%」条件不受牵连（75% 时不该提前成立）',
    ones.length >= 1 && ones.every(t => !SB.tech.condMet(at(0.75), t.cond) && SB.tech.condMet(at(1), t.cond)),
    ones.map(t => t.id).join(','));
}

}
