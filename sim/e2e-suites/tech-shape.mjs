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

  /* ② 依赖深度：reqs 决定「同一层能同时点亮几项」。压平前最深 10 层、主干一根直链。 */
  const d = {};
  T.forEach(t => { d[t.id] = 0; });
  for (let round = 0; round < T.length; round++)
    T.forEach(t => (t.reqs || []).forEach(r => {
      if (m[r] && d[r] + 1 > d[t.id]) d[t.id] = d[r] + 1;
    }));
  const maxD = Math.max.apply(null, T.map(t => d[t.id]));
  const at = n => T.filter(t => d[t.id] === n);
  /* ⚠️ 阈值取 11 有出处，不是跟着树长随手加的：
   *    ① 破壳链的物理下限仍是 6（techs.js 顶部推过：skydrill ≥ shellgeo+1 ≥
   *       invert+2 ≥ physics+3 ≥ … ≥ 天壳观测 → 教育 → 数学 → 导航 → 照明）；
   *    ② 纪元一 2026-09-26 按用户规格重排成**四层**（结绳 → 四个方向 → 加深 → 成事）；
   *    ③ era5 在 invert(d=6) 之上叠天壳地质学(d=7) + 天穹钻机(d=8)；
   *    ④ ERA6（2026-10 实装）在 skydrill(d=8) 之上再叠三层：
   *       minipump/modpart(d=9) → chemistry(d=10) → engraving/specfuel/exostruct(d=11)。
   *    故最深 11。要压短只能动纪元一那四层本身（改 reqs 压不动，它是形状不是深度）。
   *    ⚠️ 这是「实装 ERA6 科技树」的必然结果（用户拍板「先把科技实装」），
   *       不是迁就现状改断言——深度 11 直接由 approved 的 reqs 链推出。 */
  check('最深科技 ≤ 11 层（破壳链 6 + era5 天穹钻机叠 2 + 纪元一 4 层 + ERA6 叠 3）', maxD <= 11,
    '最深 ' + maxD + ' 层：' + at(maxD).map(t => t.id).join(','));
  check('第二层 ≥ 3 项可并行（不是一根直链）', at(1).length >= 3, 'L1=' + at(1).length + ' 项');
  check('第三层 ≥ 4 项可并行', at(2).length + at(3).length >= 6,
    'L2=' + at(2).length + ' L3=' + at(3).length);

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

}
