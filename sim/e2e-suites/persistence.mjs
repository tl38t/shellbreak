/* e2e suite: save, refresh, migration, reset; uses the caller's shared run fixture. */
export async function run({ SB, check, sandbox, doc, makeDoc, loadAll, errors }) {

/* ---------------- 存档恢复 ---------------- */
console.log('\n=== 刷新恢复（localStorage）===');
const savedMeta = JSON.parse(sandbox.localStorage.getItem(SB.CFG.SAVE_KEY) || '{}');
check('跨周目存档已落盘', !!savedMeta && savedMeta.perks && savedMeta.perks.food === 1, 'tide=' + (savedMeta.tide || 0).toFixed(2));
check('周目存档已落盘', !!sandbox.localStorage.getItem(SB.CFG.RUN_KEY));

/* ⚠️⚠️ 刷新恢复这一节有两个坑，都不是「测刷新」，而是「把第一份沙箱弄坏了」：
 *
 *   ① **不能拿 Object.assign({}, sandbox) 造第二个沙箱。** 沙箱被 vm.createContext
 *      就地 contextify 之后，SB / game / ui 这些属性都变成了 sandbox 的自有属性；
 *      浅拷贝会把 `SB` 这个**对象引用**一起复制过去。于是第二次 loadAll 里那句
 *      `root.SB || (root.SB = {})` 命中了已存在的 SB —— 两套脚本往同一个命名空间里灌：
 *        · SB.ui.render / SB.game 被第二次那套顶掉，而它们闭包里的 `document`
 *          指向新沙箱 ⇒ 后面所有 UI 断言都在跟一个「看不见的副本」较劲：
 *          手动调 confirmPanel() 也改不动 modalEl 的 class，因为写的是另一份 doc；
 *        · 更隐蔽的是第二次 loadAll 又会跑一次 main.js 的 boot，把 click 监听器
 *          挂到新的 doc 上。若再犯 ② 的错（共用 doc），就等于「一次点击被两个 onClick
 *          各消费一遍」—— 暖石开关开了又关、净变化 0，而且这类症状只在跑完这一节
 *          之后才出现，前面全绿、恰好最后一节红。
 *      ⇒ 刷新 = **新上下文 + 同一份 localStorage**，别的什么都不继承。这里显式列出
 *        要带过去的东西，SB 一律不带。
 */
const sandbox2 = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
  isNaN, parseInt, parseFloat,
  performance: sandbox.performance,
  localStorage: sandbox.localStorage,      // 刷新前后同一份存档，这正是要测的
  document: makeDoc(),                     // 刷新后是新 document
  _intervals: [],
  setInterval(fn) { sandbox2._intervals.push(fn); return sandbox2._intervals.length; },
  clearInterval() {},
  _timeouts: [],
  setTimeout(fn) { sandbox2._timeouts.push(fn); return sandbox2._timeouts.length; },
  clearTimeout() {}
};
let SB2;
try {
  const loaded = await loadAll(sandbox2);
  SB2 = loaded.SB;
} catch (e) {
  errors.push('恢复加载异常: ' + e.message + '\n' + e.stack);
  console.log('  · 恢复加载抛错:', e.message);
}
check('刷新后可从存档恢复', !!(SB2 && SB2.game && SB2.game.run() && SB2.game.run().lvl),
  SB2 && SB2.game.run() ? '恢复建筑级 ' + SB2.game.run().lvl.kelp : '');

/* ---------------- 存档迁移 ---------------- */
/* 用户真实事故：P1 加了 weir/warmnest/ballast 三个新 lvl 键后，旧档载入全是
 * undefined/NaN（成本 NaN、破壳系数 NaN、壳厚 NaN/200000）。迁移层必须兜住。 */
console.log('\n=== 存档迁移 ===');
{
  // 模拟 P1 之前的旧档：lvl 缺三个新键，且带一个被 JSON 固化成 null 的坏值
  const oldSave = {
    t: 7200, res: { kelp: 199, coral: 300, silt: 0, iron: 0, science: 5, fuel: 0 },
    lvl: { kelp: 35, nest: 2, workshop: 1, weir: null },
    jobs: { gather: 3, craft: 1, scholar: 0 }, pop: 9, peak: 9,
    shell: 150000, iceShell: 200000, baseShell: 200000,
    perk: { gather: 1 }, techs: { calendar: true }, broken: false
  };
  const m = SB.state.migrateRun(oldSave);
  check('旧档缺失的新建筑键补零',
    m.lvl.weir === 0 && m.lvl.warmnest === 0 && m.lvl.ballast === 0 && m.lvl.kelpstore === 0,
    'weir=' + m.lvl.weir + ' warmnest=' + m.lvl.warmnest + ' ballast=' + m.lvl.ballast +
    ' kelpstore=' + m.lvl.kelpstore);
  check('旧档 null 值被消毒为 0', m.lvl.weir === 0 && m.lvl.nest === 2);
  /* 与 lvl 同类：新职业在旧档里不存在，缺键会顺着 `undefined * UNIT.coral` 变 NaN。 */
  check('旧档缺失的新职业键补零', m.jobs.coralwright === 0, 'coralwright=' + m.jobs.coralwright);
  /* ⚠️ 2026-09-30：被「商人不吃人口」污染过的档，迁移时必须把超编的职业收回来，
   *   否则 UI 会打出「闲置 −99」这种自相矛盾的读数。回收从尾部（最新职业）往前，
   *   把商人这类新增职业先退掉，保住采集者/农民。 */
  /* ⚠️ 2026-10-04：夹具里保留 `craft: 1` 是**故意的** —— 匠人职业已删除（config.JOBS），
   *   这里模拟「老档仍带着已删职业的键」：migrateRun 的 fixTable 按 ref 键遍历 ⇒ 该键被丢弃。
   *   ⚠️ 超编量必须与职业表同步：原含 craft 的 sum 是 133（超编 99）；craft 被丢弃后，
   *     把它那 1 点转记到 scholar，令 IDS 内 sum 仍为 133 ⇒ 「从尾部切 merchant 到 1」的期望不变。 */
  {
    const polluted = SB.state.migrateRun({
      pop: 34,
      jobs: { gather: 16, coralwright: 6, quarrier: 4, miner: 4,
              craft: 1, scholar: 2, scribe: 1, merchant: 100 }
    });
    const jsum = SB.folk.IDS.reduce((n, id) => n + (polluted.jobs[id] || 0), 0);
    check('迁移收回超编职业：jobs 总和 ≤ pop（且保住农民）',
      jsum <= polluted.pop && polluted.jobs.gather === 16 && polluted.jobs.merchant === 1,
      'sum=' + jsum + ' pop=' + polluted.pop + ' gather=' + polluted.jobs.gather +
      ' merchant=' + polluted.jobs.merchant);
    /* 匠人职业删除后的直接后果：老档里的 `jobs.craft` 不该残留（残留会让 UI 若再引用它时读到脏值）。 */
    check('已删职业（craft）的旧档键被迁移丢弃（不残留、不占人口）',
      polluted.jobs.craft === undefined, 'craft=' + polluted.jobs.craft);
  }
  check('旧档已有进度原样保留',
    m.lvl.kelp === 35 && m.res.coral === 300 && m.pop === 9 && m.t === 7200 && m.peak === 9);
  check('迁移后 lvlSum 无 NaN 污染', SB.economy.lvlSum(m) === 38, 'lvlSum=' + SB.economy.lvlSum(m));
  check('旧档科技与增益保留', m.techs.calendar === true && m.perk.gather === 1);
  const bare = SB.state.migrateRun({ t: '垃圾数据' });
  check('残缺存档迁移后仍是完整可跑结构',
    !!bare.lvl && !!bare.res && !!bare.jobs && typeof bare.shell === 'number' && isFinite(bare.shell));
  /* 用本轮新上线的建筑测：缺键回到旧表时 costOf 会返回 undefined，isFinite(undefined) 是 false。
   * 注意我们ir 走的是矿砂线（对齐猫国 aqueduct=minerals），不是藻食——
   * 这里按资源线逐项取自己的成本字段，别再按旧表写死 kelp。 */
  check('迁移后成本计算恢复有穷值',
    isFinite(SB.economy.costOf(m, 'weir').silt) &&
    isFinite(SB.economy.costOf(m, 'ballast').stoneBeam) &&
    isFinite(SB.economy.costOf(m, 'ballast').hardCoral),
    'weir=' + JSON.stringify(SB.economy.costOf(m, 'weir')) + ' ballast=' + JSON.stringify(SB.economy.costOf(m, 'ballast')));
}

/* ---------------- 重置 / 清档 ---------------- */
console.log('\n=== 重置与清档 ===');
const metaPre = SB.game.meta();
metaPre.tide = 12.5;                                  // 埋一批跨周目进度
const cyclePre = metaPre.cycle;

/* 6a) 未研究《神学》⇒ 纯软重置：清空本局、保留跨周目资产、cycle+1（不发点、不结算）。
 *     ⚠️ 必须显式把本局 civics 清空：前面测试若残留 theology=true，routeReset 会误判为
 *     轮回结算分支（选项 B 的资格门 = 本局《神学》真值）。 */
const sPre = SB.game.run();
sPre.civics = {}; sPre.lvl.kelp = 3; sPre.res.coral = 500; sPre.pop = 20;
const rBtn = doc.getElementById('btnReset');
check('页脚「重开/轮回」按钮已接线', typeof rBtn.onclick === 'function');
rBtn.onclick();
const modalEl = doc.getElementById('modal');
check('点重置先弹确认框（不静默执行）', !modalEl.classList.contains('hidden'));
check('确认框同时给出确认与取消',
  typeof doc.getElementById('mOk').onclick === 'function' && typeof doc.getElementById('mCancel').onclick === 'function');
doc.getElementById('mCancel').onclick();
check('点取消后弹窗关闭且状态不变', modalEl.classList.contains('hidden') && SB.game.run().lvl.kelp === 3 && SB.game.run().res.coral === 500);
rBtn.onclick();
doc.getElementById('mOk').onclick();
const sReset = SB.game.run();
check('未研究神学：软重置清空本局进度',
  SB.economy.lvlSum(sReset) === 0 && sReset.res.coral === 0 && sReset.pop === SB.CFG.POP_START);
check('未研究神学：软重置保留轮回点、cycle+1（不结算、不发点）',
  SB.game.meta().tide === 12.5 && SB.game.meta().cycle === cyclePre + 1,
  'tide=' + SB.game.meta().tide + ' cycle=' + SB.game.meta().cycle);
check('软重置后立即落盘新局', !!sandbox.localStorage.getItem(SB.CFG.RUN_KEY));

/* 6b) 已研究《神学》⇒ 真正轮回结算（选项 B）：走 doBreak 发点 + 入账旧日遗产，弹结算面板，
 *     点「开始轮回」后才进下一周目（cycle+1、本局清空）。 */
const sQ = SB.game.run();
sQ.civics = { theology: true }; sQ.peak = 50; sQ.lvl.kelp = 5; sQ.religionName = '深渊教';
const tideQ = SB.game.meta().tide, cycleQ = SB.game.meta().cycle;
rBtn.onclick();
check('已研究神学：确认框标题为「轮回（结算并发放轮回点）」',
  doc.getElementById('modalBox').innerHTML.indexOf('结算并发放轮回点') >= 0);
doc.getElementById('mOk').onclick();
check('已研究神学：点击后进入真实轮回结算（doBreak 发放轮回点）',
  SB.game.meta().tide > tideQ, 'tide ' + tideQ + '→' + SB.game.meta().tide.toFixed(2));
/* 2026-10-07 破壳终章动画（showBreakAnimation）先上，结算面板（含 mNext）要点
 * 「跳过动画」触发 finish() 后才渲染 ⇒ 走真实跳过路径，别直接摸 mNext。 */
check('破壳终章动画先上（breakContinue 可点）', typeof doc.getElementById('breakContinue').onclick === 'function');
doc.getElementById('breakContinue').onclick();
check('已研究神学：跳过动画后结算面板出现且「开始轮回」已接线',
  typeof doc.getElementById('mNext').onclick === 'function');
doc.getElementById('mNext').onclick();              // 开始轮回 ⇒ nextCycle ⇒ startRun
check('已研究神学：轮回后进下一周目（cycle+1、本局清空）',
  SB.game.meta().cycle === cycleQ + 1 && SB.economy.lvlSum(SB.game.run()) === 0,
  'cycle=' + SB.game.meta().cycle);

const wBtn = doc.getElementById('btnWipe');
check('页脚「清空存档」已接线', typeof wBtn.onclick === 'function');
wBtn.onclick();
const chk = doc.getElementById('mChk');
check('清档确认框强制勾选后才解禁',
  !!chk && typeof chk.onchange === 'function' && doc.getElementById('mOk').disabled === true);
chk.checked = true; chk.onchange();
check('勾选后确认键解禁', doc.getElementById('mOk').disabled === false);
SB.game.meta().tide = 30;                             // 再堆一笔跨周目进度，验证这次真被抹掉
doc.getElementById('mOk').onclick();
const mWipe = SB.game.meta();
check('硬重置抹掉全部跨周目进度',
  mWipe.tide === 0 && mWipe.cycle === 1 && Object.keys(mWipe.perks || {}).length === 0,
  'tide=' + mWipe.tide + ' cycle=' + mWipe.cycle);
check('硬重置后是新开局的周目状态',
  SB.game.run().t === 0 && SB.economy.lvlSum(SB.game.run()) === 0 && SB.game.run().res.coral === 0);

}
