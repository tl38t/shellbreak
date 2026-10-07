/* 天壳 / SHELLBREAK — 第一次轮回耗时测算（澄清版）
 *
 * ⚠️ 目标澄清（2026-10-02 用户）：「第一次轮回」= 解锁 **神学 (theology)**，
 *   即 era2 市政节点（cost 600, reqs drama）。不是破壳/轮回点（那是天穹钻机那条线）。
 *
 * 测算方法：复用 e2e 的假 DOM + 真实脚本加载通道（loadAll），用与 e2e botStep
 * 完全同源的策略（手动采珊瑚 / 食物优先派工 / wantBuild / 研究 / 市政）驱动整局，
 * 在 `s.civics.theology` 首次成立时停表，记录各里程碑时刻。
 *
 * 这条路不碰工具/升级/政体/分区/奇观耗材（那些是 era3+ 才需要），
 * 因此不存在 e2e 整局卡 era3 的问题——神学在 era1→era2 内即可达。
 *
 * 用法：node sim/timing-theology.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAll, ROOT, mulberry32 } from './load-sb.mjs';

/* ---------------- 假 DOM（与 e2e 同源） ---------------- */
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
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); } });
  return el;
}
function makeDoc() {
  const els = new Map(); const q = {};
  const doc = {
    _els: els, _q: q, readyState: 'complete', body: mkEl('body'),
    getElementById(id) { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag) { const e = mkEl('new-' + tag); e.tag = tag; return e; },
    querySelectorAll(sel) { if (q[sel]) return q[sel]; let out = []; q[sel] = out; return out; },
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
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  performance: { now: () => fakeNow },
  _intervals: [],
  setInterval(fn) { sandbox._intervals.push(fn); return sandbox._intervals.length; },
  clearInterval() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
let fakeNow = 1000;

const { SB } = loadAll(sandbox);
const doc = sandbox.document;
const g = (id) => doc.getElementById(id)._html || '';
const step = sandbox._intervals[0];
function fire(clk) { const fns = doc._ev['click'] || []; for (const fn of fns) fn({ target: clk }); }
function clickBuild(id) { const before = SB.game.run().lvl[id] || 0; fire({ dataset: { build: id } }); return (SB.game.run().lvl[id] || 0) > before; }
function tabOn(k) { for (const fn of doc._ev['click'] || []) fn({ target: { dataset: { tab: k } } }); }
const FRAME_MS = 100, GAME_STEP = 0.1;
function frames(n) { for (let i = 0; i < n; i++) { fakeNow += FRAME_MS; for (const fn of sandbox._intervals) fn(); } }

/* ---------------- 建造策略（与 e2e wantBuild 同源，去掉 era3+ 奇观/石梁部分） ---------------- */
/* 人口目标：theology 的 boost 是 {t:'pop',n:25}，condMet 用 `>=` ⇒ pop 达 25 即揭示。
 * popCap=25 即可让人口长到 25，故目标 25（不取 26，省得 bot 再去买石屋 L4 抬高虚耗）。 */
const TARGET_POPCAP = 25;
function freeB(s, id) {
  const b = SB.habitat.buildingById(id);
  if (!b || !SB.habitat.unlocked(s, b) || !SB.habitat.needMet(s, b)) return false;
  return SB.economy.canAfford(s, SB.economy.costOf(s, id));
}
function bedsPerLevel(s, id) { const before = SB.economy.popCap(s); s.lvl[id] += 1; const after = SB.economy.popCap(s); s.lvl[id] -= 1; return after - before; }
function pickHouse(s) {
  /* ⚠️ 为清空 theology 的 pop>=25 鼓舞，主动把人口容量顶到 TARGET_POPCAP（而非「满员才盖」）。
   * 真实玩家会持续盖房把人口顶过 25；e2e 母本那句 `cap >= pop 即停` 在这里会把人口
   * 钉在 ~23，永远够不到 25 ⇒ theology 永远揭示不了。这里改成目标容量 25。 */
  if (SB.economy.popCap(s) >= TARGET_POPCAP) return null;
  let best = null, bestUnit = Infinity;
  for (const id of ['nest', 'coralhouse']) {
    if (!freeB(s, id)) continue;
    const c = SB.economy.costOf(s, id);
    if (!SB.economy.canAfford(s, c)) continue;
    const per = bedsPerLevel(s, id); if (per <= 0) continue;
    const unit = (c.coral || 0) / per;
    if (unit < bestUnit) { bestUnit = unit; best = id; }
  }
  return best;
}
function wantBuild(s) {
  /* kelp 宽松：原 min(kelp+99, ...) 看似 bug，实测却是启动关键——多建藻场带来食物巨量盈余，
   * 把工人从采集中解放去产珊瑚/科技。kelp 建筑不吃珊瑚，故无害。保留宽松。 */
  if (freeB(s, 'kelp') && s.lvl.kelp < Math.min(s.lvl.kelp + 99, Math.ceil(s.pop / 3) + 2)) return 'kelp';
  if (freeB(s, 'weir') && s.lvl.kelp > 0 && s.lvl.weir < 12) return 'weir';
  /* 住房优先于耗珊瑚的产能建筑：theology 要 pop>=25，必须专门建房才到得了 */
  const h = pickHouse(s); if (h) return h;
  /* 一次性解锁建筑（siltpit/hall/workshop/furnace/library）即便在攒料模式也允许——
   * 它们是进度所需且只建一次，成本有限，不会长期吸血。 */
  const unlock = ['siltpit', 'hall', 'workshop', 'furnace', 'library'];
  for (const id of unlock) if (freeB(s, id) && s.lvl[id] === 0) return id;
  /* ⚠️ 攒料模式（人口未达标）：不再把珊瑚/石头花在 siltpit/kelpstore/warmnest/额外工坊上，
   * 而是攒够首座奇观（海潮方碑要 20 石梁+300 珊瑚）后，再砸进压舱仓把上限抬过
   * 976（巢L6）/ 937（石屋L4），然后攒钱买房。
   * ⚠️ 压舱仓必须等奇观建成后才建：否则石梁被它吃光，奇观永远凑不齐 20 石梁，
   *    drama/theology 整条线起不来——这是本轮卡死的真正死穴。*/
  if (SB.economy.popCap(s) < TARGET_POPCAP) {
    const wonderDone = !!(s.wonders && Object.keys(s.wonders).length >= 1);
    if (wonderDone && freeB(s, 'ballast') && s.lvl.ballast < 8) return 'ballast';
    return null; // 攒料等奇观/上限抬够
  }
  /* 人口达标后：正常扩张（与 e2e 同源） */
  if (freeB(s, 'warmnest') && s.pop >= 6 && s.lvl.warmnest < 8) return 'warmnest';
  if (freeB(s, 'kelpstore') && s.lvl.kelp > 0 && s.lvl.kelpstore < 12) return 'kelpstore';
  if (freeB(s, 'ballast') && s.lvl.ballast < 8) return 'ballast';
  for (const id of ['kelp', 'siltpit', 'nest', 'coralhouse', 'workshop', 'furnace', 'library'])
    if (freeB(s, id)) return id;
  return null;
}

/* 石梁（压舱仓耗材）：石工 + 工坊后才有。buffer 提到 25，供 ballast 连续升级。 */
function wantBeam(s) {
  if (!s.techs || !s.techs.masonry) return false;
  if (!(s.lvl.workshop || 0)) return false;
  return (s.res.stoneBeam || 0) < 25;
}
/* 硬化珊瑚（压舱仓耗材）：珊瑚 100 → 1，由工坊造。
 * ⚠️ 这是破 23 死锁的关键——旧版 bot 只造石梁不造硬化珊瑚，
 *   ⇒ 压舱仓永远缺一半耗材、建不起来 ⇒ 珊瑚/石头上限永远卡在方碑的 +200 ⇒
 *   nest L6 的 976 珊瑚永远攒不够。这里补上。 */
function wantHardCoral(s) {
  if (!s.techs || !s.techs.masonry) return false;
  if (!(s.lvl.workshop || 0)) return false;
  return (s.res.hardCoral || 0) < 25;
}
function clickCraft(id, amt) {
  const before = SB.game.run().res.stoneBeam || 0;
  SB.workshop.craft(SB.game.run(), id, amt, () => {});
  return (SB.game.run().res.stoneBeam || 0) > before;
}
/* 奇观：石工是门；建成即买断，不重复。排在 wantBuild 之前（里程碑只此一次）。 */
function wantWonder(s) {
  if (!s.techs || !s.techs.masonry) return null;
  const L = SB.WONDERS || [];
  for (const w of L) {
    if (s.wonders && s.wonders[w.id]) continue;
    if (SB.workshop.wonderBlocked(s, w.id) === null) return w.id;
  }
  return null;
}
function clickWonder(id) {
  const before = !!(SB.game.run().wonders || {})[id];
  SB.workshop.build(SB.game.run(), id, () => {});
  return !before && !!(SB.game.run().wonders || {})[id];
}

/* ---------------- 开局指纹 ---------------- */
SB.game.startRun();
const s0 = SB.game.run();
console.log('=== 开局指纹 ===');
console.log(' pop=' + s0.pop + ' coral=' + (s0.res.coral||0) + ' 科技=' + Object.keys(s0.techs).length + ' 市政=' + Object.keys(s0.civics||{}).length);
console.log(' 神学的门槛：era2 市政，cost ' + (SB.CIVICS.find(c=>c.id==='theology')||{}).cost + '，reqs ' + JSON.stringify((SB.CIVICS.find(c=>c.id==='theology')||{}).reqs));
console.log('  -> 揭示需 tech era>=2（清 era1 key: calendar+masonry）；drama(300) -> theology(600) 共 900 市政点');

const NEST_COST = (SB.BUILDINGS.find(b => b.id === 'nest') || {}).cost || {};
console.log(' 礁口巢造价(珊瑚): ' + (NEST_COST.coral || 0));

/* ---------------- botStep（与 e2e 完整同源：含石梁/奇观/研究/市政/祭坛） ---------------- */
function botStep() {
  const s = SB.game.run();
  /* 手动采珊瑚：真开局唯一进项（玩家点「采珊瑚」按钮的等价）。
   * ⚠️ 不能用 `!s.lvl.nest` 当门槛——那样首座巢建成后，低位（pop 小）时 autoAssign 把闲人全塞
   *   给学者、珊瑚匠恒 0、珊瑚恒 0、巢 L2 永远买不起、人口永久卡 3。
   *   正确做法：只要人口还没顶到目标，就持续手采珊瑚攒够「下一座巢」的钱（巢是纯珊瑚、永远可建，
   *   是低位唯一的住房杠杆）。石屋要的石头由 quarrier 在高 pop 时自动产出。*/
  const needCoral = (SB.economy.popCap(s) < TARGET_POPCAP)
    ? (SB.economy.costOf(s, 'nest').coral || 0) : 0;
  if (needCoral > 0 && (s.res.coral || 0) < needCoral) {
    const per = (SB.GATHER ? SB.GATHER.coral : 0.1) || 0.1;
    for (let gI = 0; gI < 5 && (s.res.coral || 0) < needCoral; gI++) SB.economy.addRes(s, 'coral', per);
  }
  const cold = SB.economy.isCold(s);
  const byBuild = s.lvl.kelp * SB.BLD.food * SB.economy.season(s.t).mult * (cold ? 0.6 : 1);
  let need = Math.ceil((s.pop * SB.CFG.FOOD_PER - byBuild) / SB.UNIT.kelp);
  need = s.pop > 1 ? Math.min(need, s.pop - 1) : s.pop;
  SB.folk.autoAssign(s, Object.assign({ gather: need },
    cold ? { coralwright: 0.06, quarrier: 0.05, craft: 0.34, scholar: 0.10, miner: 0.26, scribe: 0.04 }
         : { coralwright: 0.10, quarrier: 0.06, craft: 0.13, scholar: 0.18, miner: 0.11, scribe: 0.03 }));
  /* 石梁/硬化珊瑚只供压舱仓升级用：ballast 到顶后停造，免得把珊瑚/石头拿去换耗材、
   * 反而拖慢「攒 976 珊瑚买房」的进度（攒料模式的核心）。
   * ⚠️ 硬化珊瑚 + 压舱仓必须等「首座奇观（海潮方碑，要 20 石梁+300 珊瑚）」建成后才动：
   *   否则石梁全被压舱仓吃掉，奇观永远凑不齐 20 石梁，drama/theology 整条线起不来。*/
  const wonderDone = !!(s.wonders && Object.keys(s.wonders).length >= 1);
  if (s.lvl.ballast < 8) {
    if (wantBeam(s)) clickCraft('craft_stonebeam', 1);
    if (wonderDone && wantHardCoral(s)) clickCraft('craft_hardcoral', 1);
  }
  for (let n = 0; n < 3; n++) {
    if (!(s.wonders && Object.keys(s.wonders).length >= 1)) {
      const wid = wantWonder(s);
      if (wid) { if (!clickWonder(wid)) break; continue; }
    }
    const id = wantBuild(s);
    if (!id || !SB.habitat.build(s, id, () => {})) break;
    SB.game.pumpTech(s, () => {});
  }
  for (const t of SB.TECHS) if (SB.habitat.study(s, t.id, () => {})) { SB.game.pumpTech(s, () => {}); break; }
  if (SB.civic.panelOpen(s)) {
    for (const c of SB.CIVICS) if (SB.civic.canResearch(s, c.id)) { SB.civic.research(s, c.id, () => {}); SB.game.pumpCivic(s, () => {}); break; }
  }
}

/* ---------------- 跑 ---------------- */
SB.game.setSpeed(20);   // 每帧 2 游戏秒（与 e2e 同）
let frame = 0, done = false, runHours = 0;
const marks = {};
function mark(key) { if (marks[key] === undefined) { marks[key] = SB.game.run().t / 3600; console.log(`  [${String(frame).padStart(6)}] ${key} = ${(marks[key]).toFixed(2)}h  (pop=${SB.game.run().pop}, era=${SB.game.run().era}, cul=${(SB.game.run().res.culture||0).toFixed(0)}, civ=${Object.keys(SB.game.run().civics||{}).length})`); } }

const MAX_FRAMES = 14000;
while (frame < MAX_FRAMES) {
  const s = SB.game.run();
  if (s.civics && s.civics.theology) { runHours = s.t / 3600; done = true; break; }
  botStep();
  frames(1); frame++;
  if (frame <= 25 || frame === 3000 || frame === 10000 || frame === 20000 || frame === 30000 ||
      (frame >= 3200 && frame <= 7600 && frame % 400 === 0)) {
    const s = SB.game.run();
    const wb = wantBuild(s);
    console.log('DBG f' + frame + ' pop=' + s.pop + ' popCap=' + SB.economy.popCap(s) +
      ' nest=' + (s.lvl.nest||0) + ' coralhouse=' + (s.lvl.coralhouse||0) + ' ballast=' + (s.lvl.ballast||0) +
      ' coral=' + (s.res.coral||0).toFixed(0) + '(' + SB.economy.capOf(s,'coral').toFixed(0) + ')' +
      ' stone=' + (s.res.stone||0).toFixed(0) + '(' + SB.economy.capOf(s,'stone').toFixed(0) + ')' +
      ' hC=' + (s.res.hardCoral||0).toFixed(0) + ' sB=' + (s.res.stoneBeam||0).toFixed(0) +
      ' kelp=' + (s.lvl.kelp||0) + ' warmnest=' + (s.lvl.warmnest||0) + ' sci=' + (s.res.science||0).toFixed(0) +
      ' cw=' + (s.jobs.coralwright||0) + ' q=' + (s.jobs.quarrier||0) + ' sch=' + (s.jobs.scholar||0) +
      ' W=' + JSON.stringify(s.wonders||{}) + ' wW=' + wantWonder(s) +
      ' WN=' + (SB.WONDERS ? SB.WONDERS.length : 'UNDEF') + ' wblk=' + SB.workshop.wonderBlocked(s, 'wonder_tide_stele') +
      ' pick=' + pickHouse(s) + ' freeCH=' + freeB(s,'coralhouse') + ' want=' + wb);
  }
  if (frame === 3000) {
    const s = SB.game.run();
    console.log('DBG f3000 popCap=' + SB.economy.popCap(s) + ' nest=' + (s.lvl.nest||0) + ' coralhouse=' + (s.lvl.coralhouse||0) +
      ' coral=' + (s.res.coral||0).toFixed(0) + ' stone=' + (s.res.stone||0).toFixed(0) +
      ' freeNest=' + freeB(s,'nest') + ' freeCH=' + freeB(s,'coralhouse') + ' pick=' + pickHouse(s) +
      ' lvlNestInc=' + bedsPerLevel(s,'nest'));
  }
  const cur = SB.game.run();
  if ((cur.lvl.hall || 0) >= 1) mark('hall建成(panelOpen)');
  if (cur.techs && cur.techs.masonry) mark('石工完成');
  if (cur.era >= 2) mark('tech era=2');
  if (cur.wonders && Object.keys(cur.wonders).length >= 1) mark('首座奇观建成(drama鼓舞)');
  if (cur.civics && cur.civics.laws) mark('法典完成');
  if (cur.civics && cur.civics.drama) mark('戏剧与诗歌完成');
  if (cur.pop >= 25) mark('人口达25(theology门槛)');
  if (cur.civics && cur.civics.theology) mark('神学完成');
  if (frame % 2000 === 0) {
    console.log(`  [${String(frame).padStart(6)}] t=${(cur.t/3600).toFixed(2)}h pop=${cur.pop} era=${cur.era} shell=${cur.shell.toFixed(0)} cul=${(cur.res.culture||0).toFixed(0)} culRate=${SB.economy.cultureRate(cur).toFixed(2)}/s civ=${Object.keys(cur.civics||{}).length} techs=${Object.keys(cur.techs).length}`);
  }
}

const sf = SB.game.run();
console.log('\n=== 结果 ===');
if (done) {
  console.log('✅ 第一次轮回（解锁 神学/theology）耗时 = ' + runHours.toFixed(2) + 'h  (' + (runHours*60).toFixed(0) + ' 分钟)');
  console.log('  里程碑：');
  for (const k of ['hall建成(panelOpen)','石工完成','tech era=2','首座奇观建成(drama鼓舞)','法典完成','戏剧与诗歌完成']) {
    if (marks[k] !== undefined) console.log('    ' + k + ' = ' + marks[k].toFixed(2) + 'h');
  }
  console.log('  终态：pop=' + sf.pop + ' era=' + sf.era + ' 市政=' + JSON.stringify(sf.civics) + ' 科技数=' + Object.keys(sf.techs).length + ' 书手=' + (sf.jobs.scribe||0) + ' 市政点率=' + SB.economy.cultureRate(sf).toFixed(2) + '/s');
} else {
  console.log('❌ 在 ' + (MAX_FRAMES*2/3600).toFixed(1) + 'h 上限内未解锁神学。终态 pop=' + sf.pop + ' era=' + sf.era + ' 科技=' + Object.keys(sf.techs).length + ' 市政=' + JSON.stringify(sf.civics||{}) + ' 市政点=' + (sf.res.culture||0).toFixed(0));
}
process.exit(0);
