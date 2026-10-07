/* 天壳 / SHELLBREAK — 第一次轮回时长测算（真开局口径）
 *
 * 复用 e2e 的假 DOM + botStep 策略（与整局模拟同一份策略，不对账就两套账），
 * 唯一增量：bot 额外造共振钻头（天穹钻机耗材，e2e 的 bot 原本不造 ⇒ 钻机永远建不起来）。
 * 跑法：node sim/timing-first-rebirth.mjs  [SB_MAXFRAMES=600000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from './load-sb.mjs';

/* ---------------- 假 DOM（与 e2e 逐字同构）---------------- */
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
  const q = {};
  const doc = {
    _els: els, _q: q, readyState: 'complete',
    body: mkEl('body'),
    getElementById(id) { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag) { const e = mkEl('new-' + tag); e.tag = tag; return e; },
    querySelectorAll(sel) {
      if (q[sel]) return q[sel];
      let out = [];
      if (sel === '.tab') {
        out = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'meta'].map((t, i) => {
          const e = mkEl('tab-' + t); e.dataset.tab = t; e._tab = i; return e;
        });
      } else if (sel === '.spd') {
        out = [1, 5, 10, 20].map(s => { const e = mkEl('spd-' + s); e.dataset.spd = String(s); return e; });
      }
      q[sel] = out;
      return out;
    },
    querySelector(sel) {
      const m = /^\.tab\[data-tab="([^"]+)"\]$/.exec(sel || '');
      if (!m) return null;
      const list = this.querySelectorAll('.tab');
      for (const t of list) if (t.dataset.tab === m[1]) return t;
      return null;
    },
    addEventListener(type, fn) { (doc._ev[type] = doc._ev[type] || []).push(fn); },
    _ev: {}
  };
  return doc;
}

let fakeNow = 1000;
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

/* ---------------- 启动 ---------------- */
let SB;
try {
  ({ SB } = loadAll(sandbox));
  SB.game.run();
} catch (e) {
  console.log('  ✗ 启动即抛错:', e.message);
  console.log(e.stack);
  process.exit(1);
}

const doc = sandbox.document;
function fire(clk) {
  const fns = doc._ev['click'] || [];
  for (const fn of fns) fn({ target: clk });
}
function clickBuild(id) {
  const before = SB.game.run().lvl[id] || 0;
  fire({ dataset: { build: id } });
  return (SB.game.run().lvl[id] || 0) > before;
}
function tabOn(k) {
  for (const fn of doc._ev['click'] || []) fn({ target: { dataset: { tab: k } } });
}
const FRAME_MS = 100;
function frames(n) {
  for (let i = 0; i < n; i++) {
    fakeNow += FRAME_MS;
    for (const fn of sandbox._intervals) fn();
  }
}

const NEST_COST = ((SB.BUILDINGS.filter(b => b.id === 'nest')[0]) || {}).cost || {};

function freeB(s, id) {
  const b = SB.habitat.buildingById(id);
  if (!b || !SB.habitat.unlocked(s, b) || !SB.habitat.needMet(s, b)) return false;
  return SB.economy.canAfford(s, SB.economy.costOf(s, id));
}
function bedsPerLevel(s, id) {
  const before = SB.economy.popCap(s);
  s.lvl[id] += 1;
  const after = SB.economy.popCap(s);
  s.lvl[id] -= 1;
  return after - before;
}
function pickHouse(s) {
  if (SB.economy.popCap(s) >= s.pop) return null;
  let best = null, bestUnit = Infinity;
  for (const id of ['nest', 'coralhouse']) {
    if (!freeB(s, id)) continue;
    const c = SB.economy.costOf(s, id);
    if (!SB.economy.canAfford(s, c)) continue;
    const per = bedsPerLevel(s, id);
    if (per <= 0) continue;
    const unit = (c.coral || 0) / per;
    if (unit < bestUnit) { bestUnit = unit; best = id; }
  }
  return best;
}
function wantBuild(s) {
  if (freeB(s, 'kelp') && s.lvl.kelp < Math.min(s.lvl.kelp + 99, Math.ceil(s.pop / 3) + 2)) return 'kelp';
  if (freeB(s, 'weir') && s.lvl.kelp > 0 && s.lvl.weir < 12) return 'weir';
  if (freeB(s, 'warmnest') && s.pop >= 6 && s.lvl.warmnest < 30) return 'warmnest';
  if (freeB(s, 'kelpstore') && s.lvl.kelp > 0 && s.lvl.kelpstore < 12) return 'kelpstore';
  if (freeB(s, 'ballast') && s.lvl.kelp > 0 && s.lvl.ballast < 12) return 'ballast';
  const h = pickHouse(s);
  if (h) return h;
  const unlock = ['siltpit', 'hall', 'workshop', 'furnace', 'library'];
  for (const id of unlock) if (freeB(s, id) && s.lvl[id] === 0) return id;
  for (const id of ['kelp', 'siltpit', 'nest', 'coralhouse', 'workshop', 'furnace', 'library', 'kelpstore', 'ballast'])
    if (freeB(s, id)) return id;
  return null;
}
function wantBeam(s) {
  if (!s.techs || !s.techs.masonry) return false;
  if (!(s.lvl.workshop || 0)) return false;
  return (s.res.stoneBeam || 0) < 20;
}
function clickCraft(id, amt) {
  const before = SB.game.run().res.stoneBeam || 0;
  fire({ dataset: { craft: id, craftAmt: String(amt) } });
  return (SB.game.run().res.stoneBeam || 0) > before;
}
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
  fire({ dataset: { wonder: id } });
  return !before && !!(SB.game.run().wonders || {})[id];
}

/* bot 的每一步决策（与 e2e botStep 同构，唯一增量：造共振钻头）。 */
function botStep() {
  const s = SB.game.run();
  const nestCost = NEST_COST.coral || 0;
  if (!(s.lvl.nest || 0) && (s.res.coral || 0) < nestCost) {
    for (let g = 0; g < 5 && s.res.coral < nestCost; g++) fire({ dataset: { gather: 'coral' } });
  }
  const cold = SB.economy.isCold(s);
  const byBuild = s.lvl.kelp * SB.BLD.food * SB.economy.season(s.t).mult * (cold ? 0.6 : 1);
  let need = Math.ceil((s.pop * SB.CFG.FOOD_PER - byBuild) / SB.UNIT.kelp);
  need = s.pop > 1 ? Math.min(need, s.pop - 1) : s.pop;
  SB.folk.autoAssign(s, Object.assign({ gather: need },
    cold ? { coralwright: 0.06, quarrier: 0.05, craft: 0.34, scholar: 0.10, miner: 0.26, scribe: 0.04 }
         : { coralwright: 0.10, quarrier: 0.06, craft: 0.13, scholar: 0.18, miner: 0.11, scribe: 0.03 }));
  if (wantBeam(s)) clickCraft('craft_stonebeam', 1);
  // 共振钻头（天穹钻机耗材）：shellgeo 解锁后持续攒，攒够再建钻机（建耗 20 + 运行耗 ~6）
  if (s.techs && s.techs.shellgeo && (s.res.resonantDrill || 0) < 30) {
    clickCraft('craft_drill', 1);
  }
  // 钻机改手动启动（2026-10-07）：建成即拨开，否则长模拟永远卡在 25% 壳厚跑不完。
  if (s.wonders && s.wonders.wonder_skydrill && !s.broken && !s.skydrillOn) s.skydrillOn = true;
  for (let n = 0; n < 3; n++) {
    const wid = wantWonder(s);
    if (wid) { if (!clickWonder(wid)) break; continue; }
    const id = wantBuild(s);
    if (!id || !clickBuild(id)) break;
  }
  for (const t of SB.TECHS) if (SB.tech.canStudy(s, t.id)) { fire({ dataset: { tech: t.id } }); break; }
  if (SB.civic.panelOpen(s)) {
    for (const c of SB.CIVICS) if (SB.civic.canResearch(s, c.id)) { fire({ dataset: { civic: c.id } }); break; }
    if (s.gov && !s.card) {
      const hasFx = p => Object.keys(p.effect || {}).length > 0 || typeof p.squareMul === 'number';
      for (const p of SB.POLICIES) {
        if (hasFx(p) && SB.civic.canSetCard(s, p.id)) { fire({ dataset: { card: p.id } }); break; }
      }
    }
  }
}

/* ---------------- 真开局跑整局 ---------------- */
SB.game.startRun();
const st0 = SB.game.run();
console.log('开局指纹：pop=' + st0.pop + ' / res=' + JSON.stringify(st0.res) + ' / lvl=' + JSON.stringify(st0.lvl));

const MAX_FRAMES = Number(process.env.SB_MAXFRAMES || 600000);
const eraMarks = [{ era: 1, t: 0 }];
let frame = 0, runHours = 0, skyStarted = null, skyDone = null;
const startShell = SB.game.run().iceShell;
console.log('iceShell = ' + startShell + '  MAX_FRAMES=' + MAX_FRAMES + '（≈' + (MAX_FRAMES * 0.1 / 3600).toFixed(1) + 'h 上限）');

while (frame < MAX_FRAMES) {
  const s = SB.game.run();
  if (!s || s.broken) { runHours = s ? s.t / 3600 : 0; break; }
  botStep();
  frames(1);
  frame++;
  if (s.skydrillRun && skyStarted === null) { skyStarted = s.t / 3600; console.log('  ★ 天穹钻机开始破壳 @ ' + skyStarted.toFixed(2) + 'h'); }
  if (s.skydrillRun && s.broken && skyDone === null) { skyDone = s.t / 3600; }
  const cur = SB.game.run();
  if (cur.era !== eraMarks[eraMarks.length - 1].era) eraMarks.push({ era: cur.era, t: cur.t });
  if (frame % 5000 === 0) {
    const cut = s._cutBase || 0, sky = s._cutSky || 0;
    console.log(`  [frame ${frame}] t=${(s.t/3600).toFixed(2)}h pop=${s.pop} era=${s.era} shell=${s.shell.toFixed(0)}` +
      ` 削壳[基${cut.toFixed(0)}/钻${sky.toFixed(0)}] 钻机运行=${(s.skydrillRun||0).toFixed(1)}s` +
      ` 钻头=${(s.res.resonantDrill||0).toFixed(1)} 科技=${Object.keys(s.techs).filter(k=>s.techs[k]).length}` +
      ` 奇观=${Object.keys(s.wonders||{}).filter(k=>s.wonders[k]).length} starv=${s.skydrillStarved?1:0}`);
  }
}

console.log('\n================ 第一次轮回测算 ================');
console.log('  ★ 是否达成破冰（第一次轮回）：' + (SB.game.run().broken ? '是' : '否（未达成，可能撞到 MAX_FRAMES 上限或资源卡死）'));
console.log('  ★ 第一次轮回耗时：' + runHours.toFixed(2) + ' 小时（' + (runHours*60).toFixed(1) + ' 分钟）');
if (skyStarted !== null) console.log('  ★ 天穹钻机开始破壳时刻：' + skyStarted.toFixed(2) + 'h（此前壳被基础削壳卡在 25% = ' + (startShell*0.25).toFixed(0) + ' 点）');
{
  const s = SB.game.run();
  const cut = s._cutBase || 0, sky = s._cutSky || 0, total = cut+sky;
  if (total > 0) {
    console.log('  ★ 削壳构成：基础 ' + cut.toFixed(0) + '（' + (cut/total*100).toFixed(0) + '%）' +
      ' / 天穹钻机 ' + sky.toFixed(0) + '（' + (sky/total*100).toFixed(0) + '%）');
    console.log('  ★ 天穹钻机破壳耗时：' + (sky>0 ? (sky/100).toFixed(2) : '0') + ' 秒（' + (CFG_SKYDRILL_RATE()/1).toFixed(0) + ' 点/秒）');
  }
  console.log('  ★ 终态：era=' + s.era + ' pop=' + s.pop + ' peak=' + s.peak +
    ' 科技=' + Object.keys(s.techs).filter(k=>s.techs[k]).length + '/' + SB.TECHS.length +
    ' 奇观=' + Object.keys(s.wonders||{}).filter(k=>s.wonders[k]).length + '/' + SB.WONDERS.length);
}
function CFG_SKYDRILL_RATE() { return SB.CFG.SKYDRILL_RATE; }
