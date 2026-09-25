/* 天壳 / SHELLBREAK — 端到端冒烟
 * 用假 DOM 加载 index.html 里声明的全部脚本（含 game / ui / main），
 * 再驱动真实点击事件跑完整一局：铺基建 → 冰封期 → 剥壳 → 破冰 → 结算 → 下一周目。
 * 目的不是「不崩」，而是证明这条链路真的走得通。
 * 用法：node sim/e2e.mjs
 */
import { loadAll } from './load-sb.mjs';

const errors = [];
const checks = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
}

/* ---------------- 假 DOM ---------------- */
function mkEl(id) {
  const el = {
    id, _html: '', textContent: '', value: '', checked: false,
    dataset: {}, style: {}, children: [], onclick: null,
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
      toggle(c, on) { if (on === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else if (on) el._classes.add(c); else el._classes.delete(c); }
    },
    appendChild(c) { el.children.push(c); },
    removeChild() {},
    addEventListener() {},
    getAttribute() { return null; }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); }
  });
  return el;
}

function makeDoc() {
  const els = new Map();
  const doc = {
    _els: els,
    readyState: 'complete',
    getElementById(id) { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag) { const e = mkEl('new-' + tag); e.tag = tag; return e; },
    querySelectorAll(sel) {
      if (sel === '.tab') {
        return ['village', 'folk', 'tech', 'dig', 'meta'].map((t, i) => {
          const e = mkEl('tab-' + t); e.dataset.tab = t; e._tab = i; return e;
        });
      }
      if (sel === '.spd') return [1, 5, 10, 20].map(s => { const e = mkEl('spd-' + s); e.dataset.spd = String(s); return e; });
      return [];
    },
    querySelector() { return null; },
    addEventListener(type, fn) { (doc._ev[type] = doc._ev[type] || []).push(fn); },
    _ev: {}
  };
  return doc;
}

const store = new Map();
const sandbox = {
  console,
  document: makeDoc(),
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k)
  },
  performance: { now: () => fakeNow },
  _intervals: [],
  setInterval(fn) { sandbox._intervals.push(fn); return sandbox._intervals.length; },
  clearInterval() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
let fakeNow = 1000;

/* ---------------- 启动 ---------------- */
let SB, order;
try {
  ({ SB } = loadAll(sandbox));
  const g = SB.game.run();
  check('全部脚本按 index.html 顺序加载并完成 boot', !!g && !!SB.game, '共 ' + (sandbox.document._els.size ? '已建 DOM' : ''));
} catch (e) {
  errors.push('启动异常: ' + e.message + '\n' + e.stack);
  console.log('  ✗ 启动即抛错:', e.message);
}

const doc = sandbox.document;
const g = (id) => doc.getElementById(id)._html || '';
const step = sandbox._intervals[0];

function fire(clk) {
  const fns = doc._ev['click'] || [];
  for (const fn of fns) fn({ target: clk });
}
function click(sel, val, extra) {
  const t = { dataset: Object.assign({}, extra || {}) };
  if (sel.dataset) Object.assign(t.dataset, sel.dataset);
  t.dataset[sel.key] = val;
  fire(t);
}
// 建造按钮：data-build="kelp"
function clickBuild(id) {
  const before = SB.game.run().lvl[id] || 0;
  fire({ dataset: { build: id } });
  return (SB.game.run().lvl[id] || 0) > before;
}
function clickJob(job, d) {
  const s = SB.game.run();
  const before = s.jobs[job];
  fire({ dataset: { job, d: String(d) } });
  return s.jobs[job] !== before;
}
function tabOn(k) {
  for (const fn of doc._ev['click'] || []) fn({ target: { dataset: { tab: k } } });
}

/* ---------------- 帧驱动 ---------------- */
const FRAME_MS = 100;
const GAME_STEP = 0.1;          // 与 game.js 内部 STEP 一致
function frames(n) {
  for (let i = 0; i < n; i++) {
    fakeNow += FRAME_MS;
    for (const fn of sandbox._intervals) fn();
  }
}

/* ---------------- 开局解锁链（对齐猫国：开局只有猫薄荷田）---------------- */
console.log('\n=== 开局解锁链 ===');
{
  const s = SB.game.run();
  const open = SB.BUILDINGS.filter(b => SB.habitat.unlocked(s, b)).map(b => b.id);
  check('新开局只有深海菌圃可建', open.length === 1 && open[0] === 'kelp', open.join(',') || '（无）');

  // 藻田之外不能硬建：解锁判定必须拦得住
  const blocked = SB.habitat.build(s, 'workshop') || SB.habitat.build(s, 'nest');
  check('未解锁的建筑建不起来', !blocked, 'workshop/nest 均被拦下');

  // 攒够珊瑚后工坊该自己露头
  s.res.coral = 400;
  check('库存达首级价 30% 时工坊解锁', SB.habitat.unlocked(s, SB.habitat.buildingById('workshop')), 'coral 400 ≥ 120');

  // 骨材链条：骨材达阈值才解锁珊瑚巢
  s.res.coral = 0; s.res.bone = 0;
  check('骨材不足时珊瑚巢仍锁着', !SB.habitat.unlocked(s, SB.habitat.buildingById('nest')), 'bone 0 < 60');
  s.res.bone = 60;
  check('骨材达 60 时珊瑚巢解锁', SB.habitat.unlocked(s, SB.habitat.buildingById('nest')), 'bone 60');
  s.res.bone = 0;

  // 科技前置：熔炉要「冶炼术」
  s.res.coral = 9e5; s.res.bone = 9e5;
  const furnace = SB.habitat.buildingById('furnace');
  const techsBefore = JSON.stringify(s.techs);
  check('未研究冶炼术时熔炉锁着', !SB.habitat.unlocked(s, furnace), 'requiredTech: smelt');
  SB.TECHS.forEach(t => { s.techs[t.id] = true; });
  check('研究该科技后熔炉解锁', SB.habitat.unlocked(s, furnace), 'requiredTech 已满足');
  s.techs = JSON.parse(techsBefore);
}

/* ---------------- 食物三旋钮（产 / 增 / 省 / 储）---------------- */
/* P1 落地的核心。四个断言各盯一个旋钮，任何一个接线漏了都会红。 */
console.log('\n=== 食物三旋钮 ===');
{
  const s = SB.game.run();
  const base = SB.CFG.CAP_BASE.kelp;
  check('基础菌毯上限已收紧到 200（否则储旋钮是废的）', base === 200, 'CAP_BASE.kelp=' + base);
  check('未建压舱仓时上限即基础值', SB.economy.capOf(s, 'kelp') === base, 'capOf=' + SB.economy.capOf(s, 'kelp'));

  // 增：喷口导流堤 +3%/级
  s.lvl.kelp = 1; s.lvl.weir = 0; s.t = 0;
  const rate0 = SB.economy.foodRate(s, 1);
  s.lvl.weir = 1;
  const rate1 = SB.economy.foodRate(s, 1);
  check('喷口导流堤 1 级让菌毯产出 +3%', Math.abs(rate1 / rate0 - 1.03) < 1e-9,
    rate0.toFixed(4) + ' → ' + rate1.toFixed(4) + '/秒');
  s.lvl.weir = 0;

  // 省：保温巢 −2%/级，封顶 60%
  s.pop = 10; s.lvl.warmnest = 0;
  const use0 = SB.economy.foodUse(s);
  s.lvl.warmnest = 1;
  const use1 = SB.economy.foodUse(s);
  check('保温巢 1 级让口粮 −2%', Math.abs(use1 / use0 - 0.98) < 1e-9,
    use0.toFixed(4) + ' → ' + use1.toFixed(4) + '/秒');
  s.lvl.warmnest = 30;
  check('保温巢省耗封顶 60%', Math.abs(SB.economy.foodUse(s) / use0 - 0.40) < 1e-9,
    (SB.economy.foodUse(s) / use0 * 100).toFixed(1) + '% 原消耗');
  s.lvl.warmnest = 0;

  // 储：压舱仓 +800/级，且不吃全局 CAP_PER_LVL
  s.lvl.ballast = 1;
  const cap1 = SB.economy.capOf(s, 'kelp');
  check('压舱仓 1 级把菌毯上限提到 1000', cap1 === base + 800, cap1 + '（基础 ' + base + '）');
  s.lvl.ballast = 0;

  // 产 ≠ 省：两者不是同一件事，别把符号搞反
  check('口粮与产出互不串味', SB.economy.foodRate(s, 1) > 0 && SB.economy.foodUse(s) > 0,
    '产 ' + SB.economy.foodRate(s, 1).toFixed(3) + ' / 吃 ' + SB.economy.foodUse(s).toFixed(3));
  s.lvl.kelp = 0;
}

/* ---------------- 一局 Real Player ---------------- */
/* 必须与 sim/balance.mjs 同构。注意 free() 要连买得起一起判：
 * 只判「未满级」会让 geyser（要精铁）永远排在队首且永远失败，
 * 而精铁只有熔炉能产 —— 整局会冻结在 25% 之前的空转里。 */
function freeB(s, id) {
  const b = SB.habitat.buildingById(id);
  if (!b || !SB.habitat.unlocked(s, b) || !SB.habitat.needMet(s, b)) return false;
  return SB.economy.canAfford(s, SB.economy.costOf(s, id));
}
function wantBuild(s) {
  if (freeB(s, 'kelp') && s.lvl.kelp < Math.min(s.lvl.kelp + 99, Math.ceil(s.pop / 3) + 2)) return 'kelp';
  // 食物三旋钮：与 sim/balance.mjs 同一套「买够就停」规则
  if (freeB(s, 'weir') && s.lvl.kelp > 0 && s.lvl.weir < 12) return 'weir';
  if (freeB(s, 'warmnest') && s.pop >= 6 && s.lvl.warmnest < 30) return 'warmnest';
  if (freeB(s, 'ballast') && s.lvl.kelp > 0 && s.lvl.ballast < 12) return 'ballast';
  if (freeB(s, 'nest') && s.pop >= SB.economy.houseCap(s) - 1) return 'nest';
  const unlock = ['workshop', 'geyser', 'miracle', 'furnace', 'library', 'hearth', 'reef', 'siltpit'];
  for (const id of unlock) if (freeB(s, id) && s.lvl[id] === 0) return id;
  for (const id of ['kelp', 'nest', 'workshop', 'furnace', 'library', 'hearth', 'reef', 'siltpit', 'geyser', 'miracle'])
    if (freeB(s, id)) return id;
  return null;
}

console.log('\n=== 端到端：跑完整一局 ===');
tabOn('village');
frames(2);
check('主循环已启动且资源面板有内容', g('res').length > 0, g('res').length + ' 字节');
const startShell = SB.game.run().iceShell;

let frame = 0, breakPanel = false, runHours = 0;
const MAX_FRAMES = 40000;
SB.game.setSpeed(20);                 // 挂 20×，每帧推进 2 游戏秒
while (frame < MAX_FRAMES) {
  const s = SB.game.run();
  if (!s || s.broken) { runHours = s.t / 3600; break; }

  // 职业调配
  const cold = SB.economy.isCold(s);
  SB.folk.autoAssign(s, cold ? { gather: 0.30, craft: 0.60, scholar: 0.10 } : { gather: 0.60, craft: 0.20, scholar: 0.20 });
  // 建造
  for (let n = 0; n < 3; n++) {
    const id = wantBuild(s);
    if (!id || !clickBuild(id)) break;
  }
  // 研究
  for (const t of SB.TECHS) if (!s.techs[t.id] && s.res.science >= t.cost) { fire({ dataset: { tech: t.id } }); break; }
  // 祭坛：建成就合闸。它自动凿、燃料见底自动停摆，玩家这边只剩这一个开关
  // 祭坛：建成就合闸。checked 传旧值，与真实浏览器 click 时刻的语义一致
  if ((s.lvl.miracle || 0) > 0 && !s.miracleOn) fire({ dataset: { miracle: '1' }, checked: s.miracleOn });

  frames(1);
  frame++;
  if (frame % 2000 === 0) {
    console.log(`  [frame ${frame}] t=${(s.t / 3600).toFixed(2)}h pop=${s.pop} shell=${s.shell.toFixed(0)} craft=${s.jobs.craft} mir=${s.lvl.miracle || 0}${s.miracleOn ? '开' : '关'} 热=${s.res.fuel.toFixed(1)}${s.starved ? ' 停摆' : ''}`);
  }
}

// 破冰面板
const modal = doc.getElementById('modal');
if (!modal.classList.contains('hidden')) {
  breakPanel = true;
  const box = g('modalBox');
  const m = box.match(/获得洋流点<\/span><b[^>]*>([\d.]+)/);
  check('破冰结算面板弹出', true);
  check('结算面板给出洋流点数值', !!m, m ? m[1] + ' 点' : '');
  const meta = SB.game.meta();
  check('洋流点已记入跨周目存档', meta.tide > 0, 'tide=' + meta.tide.toFixed(2));
  // 进入下一周目
  const cycleBefore = meta.cycle;
  const nextBtn = doc.getElementById('mNext');   // 结算按钮是直接绑定 onclick，不走委托
  if (typeof nextBtn.onclick === 'function') nextBtn.onclick();
  else fire({ target: { id: 'mNext' } });
  const s2 = SB.game.run();
  check('可进入下一周目', SB.game.meta().cycle === cycleBefore + 1, '第 ' + SB.game.meta().cycle + ' 周目');
  check('新周目清空建筑与资源', SB.economy.lvlSum(s2) === 0 && s2.res.coral === 0);
  check('新周目继承增益结构', !!s2.perk, JSON.stringify(s2.perk));
  check('新周目冰壳按 perk 重算', s2.iceShell === Math.round(SB.CFG.ICE_SHELL * Math.pow(0.9, s2.perk.thin || 0)), 'iceShell=' + s2.iceShell);
} else {
  check('破冰结算面板弹出', false, frame >= MAX_FRAMES ? '跑满 ' + MAX_FRAMES + ' 帧未破冰' : '');
}

/* ---------------- 洋流商店 / 增益继承 ---------------- */
console.log('\n=== 洋流商店与跨周目继承 ===');
tabOn('meta');
const s3 = SB.game.run();
SB.game.meta().tide = 30;                       // 给够点数，验证扣款与到账
const kelpBefore = s3.res.kelp;
fire({ dataset: { perk: 'food' } });            // 前朝藻席：+200 藻食，2 点
check('可购买起始资源类增益', s3.res.kelp >= kelpBefore + 200, '藻食 ' + kelpBefore.toFixed(0) + ' → ' + s3.res.kelp.toFixed(0));
check('购买后扣除洋流点', SB.game.meta().tide < 30, '剩余 ' + SB.game.meta().tide.toFixed(2));
check('已购增益写入跨周目记录', SB.game.meta().perks.food === 1);

fire({ dataset: { perk: 'g1' } });              // 异族鳍肢：采集 +10%
check('可购买产出效率类增益并累计层数', (s3.perk.gather || 0) > 0, 'gather=' + s3.perk.gather);

SB.game.meta().tide = 0;
fire({ dataset: { perk: 'coral' } });           // 没钱了
check('洋流点不足时无法购买', (SB.game.meta().perks.coral || 0) === 0);

/* ---------------- 存档恢复 ---------------- */
console.log('\n=== 刷新恢复（localStorage）===');
const savedMeta = JSON.parse(sandbox.localStorage.getItem(SB.CFG.SAVE_KEY) || '{}');
check('跨周目存档已落盘', !!savedMeta && savedMeta.perks && savedMeta.perks.food === 1, 'tide=' + (savedMeta.tide || 0).toFixed(2));
check('周目存档已落盘', !!sandbox.localStorage.getItem(SB.CFG.RUN_KEY));

const sandbox2 = Object.assign({}, sandbox, { _intervals: [] });
sandbox2._intervals = [];
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

/* ---------------- 重置 / 清档 ---------------- */
console.log('\n=== 重置与清档 ===');
const metaPre = SB.game.meta();
metaPre.tide = 12.5;                                  // 埋一批跨周目进度
const sPre = SB.game.run();
sPre.lvl.kelp = 3; sPre.res.coral = 500; sPre.pop = 20;   // 埋一批本局进度（测试夹具，直接写字段）
const cyclePre = metaPre.cycle;

const rBtn = doc.getElementById('btnReset');
check('页脚「重开本周目」已接线', typeof rBtn.onclick === 'function');
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
check('软重置清空本局进度',
  SB.economy.lvlSum(sReset) === 0 && sReset.res.coral === 0 && sReset.pop === SB.CFG.POP_START);
check('软重置保留洋流点，周目计数 +1',
  SB.game.meta().tide === 12.5 && SB.game.meta().cycle === cyclePre + 1,
  'tide=' + SB.game.meta().tide + ' cycle=' + SB.game.meta().cycle);
check('软重置后立即落盘新局', !!sandbox.localStorage.getItem(SB.CFG.RUN_KEY));

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

console.log('\n================ 汇总 ================');
// B 档基线：首局（原始时代 → 破冰重置）挂机 8-14 小时
check('单局时长落在 8-14 小时', runHours >= 8 && runHours <= 14, runHours.toFixed(2) + 'h');

const failed = checks.filter(c => !c.ok);
console.log(`\n通过 ${checks.length - failed.length}/${checks.length}`);
if (errors.length) { console.log('\n运行时错误:'); errors.forEach(e => console.log('  ' + e)); }
if (failed.length) { console.log('\n失败项:'); failed.forEach(f => console.log('  ✗ ' + f.name + ' ' + f.detail)); }
process.exit(failed.length || errors.length ? 1 : 0);
