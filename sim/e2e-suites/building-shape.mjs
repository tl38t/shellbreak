/* e2e suite: building unlock declarations, save shape, and zone assignments. */
export function run({ SB, check }) {

/* ---------------- 建筑解锁来源（静态自查）----------------
 * 解锁声明散在两个地方：建筑身上的 requiredTech、科技表里的 eff.unlockBuild。
 * habitat.unlocked 两道都查（见那个函数上方的注释），所以两边不一致 = 玩家要研究两项
 * 才解锁，而 lockReason 只报一项 ⇒ 教科书式的「研究完还是灰的」。
 * 一致性不靠人记，靠下面三条断言。 */
console.log('\n=== 建筑解锁来源 ===');
{
  const T = SB.TECHS || [], B = SB.BUILDINGS || [];

  /* 反查：哪几项科技声明解锁这座建筑。与 habitat.buildTechOf 同一套规则。 */
  const fromTech = {};
  T.forEach(t => ((t.eff && t.eff.unlockBuild) || []).forEach(b => {
    (fromTech[b] = fromTech[b] || []).push(t.id);
  }));

  const clash = [], orphan = [], halfDeclared = [];
  B.forEach(b => {
    const side = b.requiredTech || [], tech = fromTech[b.id] || [];
    /* ① 两边都写了，必须指向同一项科技 */
    if (side.length && tech.length && side.join() !== tech.join())
      clash.push(b.id + '：建筑侧 ' + side.join('/') + ' vs 科技侧 ' + tech.join('/'));
    /* ② 完全没有解锁声明 ⇒ unlocked() 首行直接挡死，永远建不起来 */
    /* ⚠️ requiredCivic（2026-09-28 新增的解锁轴，广场走它）也算一份声明：
     *    habitat.unlocked 首行守卫生效了吗？我加了 requiredCivic 一起认——
     *    漏在这里等于宣布「挂着市政声明的建筑会被首行挡死」，恰恰是最该抓的那类哑锁。 */
    const any = b.defaultUnlockable || side.length || tech.length || b.unlockScheme || b.unlockRatio
      || !!b.requiredCivic;
    if (!any) orphan.push(b.id);
    /* ③ 只写在科技侧、建筑侧又没有 unlockScheme/unlockRatio ⇒ 同样被首行挡死：
     *    那行只认 requiredTech/unlockScheme/unlockRatio，**不认科技侧的 unlockBuild**。
     *    热泉井现在能活只因为它还挂着 unlockScheme（铁 60）。 */
    if (tech.length && !side.length && !b.unlockScheme && !b.unlockRatio)
      halfDeclared.push(b.id + '（由 ' + tech.join('/') + ' 解锁）');
  });

  check('建筑侧 requiredTech 与科技侧 unlockBuild 不冲突', clash.length === 0, clash.join('；'));
  check('没有「无任何解锁声明」的建筑（永远建不起来）', orphan.length === 0, orphan.join(','));
  check('没有「只在科技侧声明」的建筑（会被 unlocked 首行挡死）', halfDeclared.length === 0, halfDeclared.join('；'));

  /* ⚠️【第三道：state.js 的 lvl 表必须与建筑表一一对应】
   *    `out.lvl = fixTable(raw.lvl, base.lvl)` —— fixTable 按 **ref 的键**遍历
   *    （state.js 第 213 行）⇒ base.lvl 里没有的建筑 id，**读档时整条被丢掉**。
   *    2026-09-28 实证：建起广场 → 存档 → 刷新 ⇒ 广场等级静默归零，不报错、
   *    症状只有「它没了」。institute 早已漏了，square 是新漏的（两条一起补在 state.js）。
   *    这条断言按 SB.BUILDINGS 逐个对，比「补一个键」更通用：下一次加建筑还会漏。 */
  const baseLvl = SB.state.freshRun(false).lvl;
  const missLvl = B.filter(b => !(b.id in baseLvl)).map(b => b.id);
  check('每座建筑都在状态表的 lvl 里（漏了会在读档时被静默丢弃）',
    missLvl.length === 0, missLvl.join(','));
  /* 反向也不许有：表里的键在 BUILDINGS 里找不到 ⇒ 玩家永远点不到它、而它占着存档位。 */
  const ghostLvl = Object.keys(baseLvl).filter(k => !B.some(b => b.id === k));
  check('lvl 表没有建筑表里已删掉的幽灵键', ghostLvl.length === 0, ghostLvl.join(','));
}

/* ---------------- 建筑分区（静态自查 · 2026-09-30 纯 UI 分区 A）----------------
 * 每座建筑必须落进恰好一个区，且八区覆盖全表、归属符合用户拍板。 */
{
  const B = SB.BUILDINGS || [], Z = SB.BUILD_ZONES || [];
  const zIds = Z.map(z => z.id);
  const noZone = B.filter(b => !b.zone || zIds.indexOf(b.zone) < 0).map(b => b.id);
  check('每座建筑都归属一个已定义的区', noZone.length === 0, noZone.join(','));
  const counted = B.filter(b => b.zone).length;
  check('分区覆盖全部建筑（无遗漏无重叠）', counted === B.length, '有 zone ' + counted + '/' + B.length);
  const expect = { lighthouse: 'trade', kelpstore: 'trade', ballast: 'trade',
    temple: 'faith', square: 'civic', nest: 'core', kelp: 'food', workshop: 'workshop',
    library: 'academy' };
  const wrong = Object.keys(expect).filter(k => {
    const b = B.find(x => x.id === k); return !b || b.zone !== expect[k];
  });
  check('关键建筑分区归属符合用户拍板（灯塔/海藻仓/压舱仓→贸易区域等）',
    wrong.length === 0, wrong.map(k => k + '≠' + (B.find(x => x.id === k) || {}).zone).join(','));
  check('贸易区域含灯塔/海藻仓/压舱仓三座',
    ['lighthouse', 'kelpstore', 'ballast'].every(id => (B.find(x => x.id === id) || {}).zone === 'trade'),
    'trade=' + B.filter(b => b.zone === 'trade').map(b => b.id).join(','));
}

}
