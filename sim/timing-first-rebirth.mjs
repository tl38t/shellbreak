/* 天壳 / SHELLBREAK — 第一次轮回时长测算（真开局口径）
 *
 * 复用 e2e 的假 DOM + botStep 策略（与整局模拟同一份策略，不对账就两套账），
 * 唯一增量：bot 额外造共振钻头（天穹钻机耗材，e2e 的 bot 原本不造 ⇒ 钻机永远建不起来）。
 * 跑法：node sim/timing-first-rebirth.mjs  [SB_MAXFRAMES=600000]
 * 单挑战：SB_CHALLENGE=science SB_CHALLENGE_TIER=3 node sim/timing-first-rebirth.mjs
 * 高档会在内存中预置更早档位进度/奖励；SB_DIAG=1 输出卡住的科技/市政门槛。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAll, mulberry32 } from './load-sb.mjs';

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
    querySelector() { return null; },
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
  /* 破壳动画会安排几段 UI 定时器；模拟只验证状态流，不播放动画。 */
  _timeouts: [],
  setTimeout(fn) { sandbox._timeouts.push(fn); return sandbox._timeouts.length; },
  clearTimeout() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

/* ---------------- 启动 ---------------- */
let SB;
try {
  ({ SB } = loadAll(sandbox));
  /* 与 load-sb / e2e 同源：固定冷流随机序列，让人口与挑战终态可复现。 */
  SB.rng = mulberry32(Number(process.env.SB_SEED || 20260928));
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
let lastBotDecision = null;
function botStep() {
  lastBotDecision = SB.aiStrategy.step(SB.game.run());
  return;
  const s = SB.game.run();
  const nestCost = NEST_COST.coral || 0;
  if (!(s.lvl.nest || 0) && (s.res.coral || 0) < nestCost) {
    for (let g = 0; g < 5 && s.res.coral < nestCost; g++) fire({ dataset: { gather: 'coral' } });
  }
  /* 深渊重压 ×0.8 会让单名开局采集者产食刚好抵消口粮，无法攒出首座藻场。
   * 模拟真实玩家的开局手动采集：只补到首座藻场造价，不给后续资源开挂。 */
  if (challengeId === 'abyss' && !(s.lvl.kelp || 0)) {
    const kelpCost = SB.habitat.buildingById('kelp').cost.kelp || 0;
    for (let g = 0; g < 25 && (s.res.kelp || 0) < kelpCost; g++) fire({ dataset: { gather: 'kelp' } });
  }
  const cold = SB.economy.isCold(s);
  const byBuild = s.lvl.kelp * SB.BLD.food * SB.economy.season(s.t).mult * (cold ? 0.6 : 1)
    * (SB.challenges ? SB.challenges.productionMul(s) : 1);
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

/* ---------------- 真开局跑整局 / 指定挑战 ---------------- */
const challengeId = process.env.SB_CHALLENGE || '';
const challengeTier = Number(process.env.SB_CHALLENGE_TIER || 1); // 1-based; higher tiers are isolated with earlier tiers pre-completed
if (challengeId) {
  const def = SB.challenges && SB.challenges.byId(challengeId);
  if (!def || !Number.isInteger(challengeTier) || challengeTier < 1 || challengeTier > def.tiers.length) {
    console.error('无效挑战档位：' + challengeId + ' · ' + challengeTier);
    process.exit(2);
  }
  /* 本脚本用于隔离验证任一挑战档位；高档的先前档位进度/奖励在内存中预置，
   * 不写入存档，也不伪称这些前置档位已经通过真实周目。 */
  const meta = SB.game.meta();
  meta.shopUnlocked = true; // 模拟玩家已通过首次轮回解锁挑战页
  if (!meta.challenges) meta.challenges = { completed: { cold: false, small: false, science: 0, abyss: 0 } };
  if (!meta.challenges.completed) meta.challenges.completed = { cold: false, small: false, science: 0, abyss: 0 };
  meta.challenges.completed[challengeId] = def.tiers.length === 1 ? false : challengeTier - 1;
  if (!SB.challenges.canStart(challengeId, SB.game.run(), meta) || !SB.challenges.begin(challengeId)) {
    console.error('无法启动挑战：' + challengeId);
    process.exit(2);
  }
} else {
  SB.game.startRun();
}
const SIM_SPEED = Math.max(1, Number(process.env.SB_SIM_SPEED || 1));
SB.game.setSpeed(SIM_SPEED);
const st0 = SB.game.run();
  console.log('挑战=' + (challengeId || '无') + (challengeId ? ' · 第 ' + challengeTier + ' 档' +
    (challengeTier > 1 ? '（先前档位进度/奖励为模拟预置）' : '') : '') +
    '；开局指纹：pop=' + st0.pop + ' / res=' + JSON.stringify(st0.res) + ' / lvl=' + JSON.stringify(st0.lvl));

const MAX_FRAMES = Number(process.env.SB_MAXFRAMES || 600000);
const PROGRESS_EVERY = Math.max(1, Number(process.env.SB_PROGRESS_EVERY || 100000));
/* 可选扩展验收：破壳时模拟玩家点「探索壳外的星空」留在本局，继续跑 ERA7。
 * ancient 需要跨周目结算发放的星屑，首周目不作为 ERA7 完成门槛。 */
const CONTINUE_AFTER_BREAK = process.env.SB_CONTINUE_AFTER_BREAK === '1';
const REQUIRE_ERA7 = process.env.SB_REQUIRE_ERA7 === '1';
/* 浏览器 AI 实际约每 400ms 做一次决策；20× 下相当于每 8 个游戏秒。
 * 模拟仍逐 0.1 秒精确推进经济，只节流重复的策略计算，默认约减少 80 倍 bot 调用。 */
const AI_EVERY_FRAMES = Math.max(1, Number(process.env.SB_AI_EVERY_FRAMES || Math.round(80 / SIM_SPEED)));
const eraMarks = [{ era: 1, t: 0 }];
let frame = 0, runHours = 0, skyStarted = null, skyDone = null;
let breakReachedAt = null, continuedAfterBreak = false, completionReason = null;
let nextBotFrame = 0;
const startShell = SB.game.run().iceShell;
console.log('iceShell = ' + startShell + '  SPEED=' + SIM_SPEED + '×  MAX_FRAMES=' + MAX_FRAMES + '（≈' + (MAX_FRAMES * 0.1 * SIM_SPEED / 3600).toFixed(1) + 'h 上限）' +
  '  AI_EVERY=' + AI_EVERY_FRAMES + ' 帧（' + (AI_EVERY_FRAMES * 0.1 * SIM_SPEED).toFixed(1) + ' 游戏秒）');

while (frame < MAX_FRAMES) {
  const s = SB.game.run();
  if (!s) break;
  if (s.broken) {
    if (CONTINUE_AFTER_BREAK && s.shellOpened && !s.breakSettled) {
      if (breakReachedAt === null) {
        breakReachedAt = s.t / 3600;
        console.log('  ★ 破壳 @ ' + breakReachedAt.toFixed(2) + 'h；自动选择「探索壳外的星空」，继续验证 ERA7。');
      }
      SB.game.stay();
      continuedAfterBreak = true;
    } else {
      runHours = s.t / 3600;
      break;
    }
  }
  if (REQUIRE_ERA7 && s.shellOpened && s.shell <= 0) {
    const era7Reachable = SB.TECHS.filter(t => t.era === 7 && t.id !== 'ancient');
    const allEra7Reachable = era7Reachable.every(t => !!(s.techs && s.techs[t.id]));
    const allWondersNow = (SB.WONDERS || []).every(w => !!(s.wonders && s.wonders[w.id]));
    if (allEra7Reachable && (process.env.SB_REQUIRE_ALL_WONDERS !== '1' || allWondersNow)) {
      completionReason = 'ERA7 可达科技完成' + (process.env.SB_REQUIRE_ALL_WONDERS === '1' ? '且全部奇观建成' : '');
      runHours = s.t / 3600;
      break;
    }
  }
  if (frame >= nextBotFrame) {
    botStep();
    nextBotFrame = frame + AI_EVERY_FRAMES;
  }
  frames(1);
  frame++;
  if (s.skydrillRun && skyStarted === null) { skyStarted = s.t / 3600; console.log('  ★ 天穹钻机开始破壳 @ ' + skyStarted.toFixed(2) + 'h'); }
  if (s.skydrillRun && s.broken && skyDone === null) { skyDone = s.t / 3600; }
  const cur = SB.game.run();
  if (cur.era !== eraMarks[eraMarks.length - 1].era) eraMarks.push({ era: cur.era, t: cur.t });
  if (process.env.SB_QUIET !== '1' && frame % PROGRESS_EVERY === 0) {
    const cut = s._cutBase || 0, sky = s._cutSky || 0;
    const goal = SB.aiStrategy.researchGoal(cur);
    const wonderCount = Object.keys(cur.wonders || {}).filter(id => cur.wonders[id]).length;
    console.log(`  [frame ${frame}] t=${(s.t/3600).toFixed(2)}h pop=${s.pop} era=${s.era} shell=${s.shell.toFixed(0)}` +
      ` 削壳[基${cut.toFixed(0)}/钻${sky.toFixed(0)}] 钻机运行=${(s.skydrillRun||0).toFixed(1)}s` +
      ` 钻头=${(s.res.resonantDrill||0).toFixed(1)} 科技=${Object.keys(s.techs).filter(k=>s.techs[k]).length}` +
      ` 奇观=${wonderCount}/${SB.WONDERS.length} 目标=${goal.id || '完成'}(${goal.cond && goal.cond.t || '-'})` +
      ` starv=${s.skydrillStarved?1:0}`);
  }
}
if (SB.game.run() && (!SB.game.run().broken || continuedAfterBreak)) runHours = SB.game.run().t / 3600;

console.log('\n================ 第一次轮回测算 ================');
console.log('  ★ 是否达成破冰（第一次轮回）：' + (SB.game.run().shellOpened && SB.game.run().shell <= 0 ? '是' : '否（未达成，可能撞到 MAX_FRAMES 上限或资源卡死）'));
if (continuedAfterBreak) console.log('  ★ 破壳后留在本局：是（' + (breakReachedAt || 0).toFixed(2) + 'h 破壳）');
if (completionReason) console.log('  ★ 模拟停止原因：' + completionReason);
{
  const s = SB.game.run();
  const era7 = SB.TECHS.filter(t => t.era === 7);
  const done = era7.filter(t => s.techs && s.techs[t.id]).map(t => t.id);
  const missing = era7.filter(t => !s.techs || !s.techs[t.id]).map(t => t.id);
  console.log('  ★ ERA7 科技：' + done.length + '/' + era7.length + '（已完成 ' + done.join(', ') +
    (missing.length ? '；未完成 ' + missing.join(', ') : '') + '；首周目星屑门槛除外时需完成 ' +
    era7.filter(t => t.id !== 'ancient').length + ' 项）');
}
if (challengeId) {
  const c = SB.challenges.progress(SB.game.meta());
  const clearedTier = SB.challenges.byId(challengeId).tiers.length === 1
    ? c[challengeId] === true : (c[challengeId] | 0) >= challengeTier;
  console.log('  ★ 本档挑战通关记录：' + (clearedTier ? '已记录' : '未记录') +
    '；科技=' + Object.keys(SB.game.run().techs || {}).filter(k => SB.game.run().techs[k]).length +
    '；市政=' + Object.keys(SB.game.run().civics || {}).filter(k => SB.game.run().civics[k]).length +
    '；神学资格=' + (SB.prestige.qualified(SB.game.run()) ? '有' : '无') +
    '；壳剩余=' + Math.round(SB.game.run().shell) + ' / ' + SB.game.run().iceShell);
}
console.log('  ★ 第一次轮回耗时：' + runHours.toFixed(2) + ' 小时（' + (runHours*60).toFixed(1) + ' 分钟）');
if (skyStarted !== null) console.log('  ★ 天穹钻机开始破壳时刻：' + skyStarted.toFixed(2) + 'h（此前壳被基础削壳卡在 25% = ' + (startShell*0.25).toFixed(0) + ' 点）');
{
  const s = SB.game.run();
  const builtWonderIds = Object.keys(s.wonders || {}).filter(id => s.wonders[id]);
  const missingWonders = (SB.WONDERS || []).filter(w => !s.wonders[w.id]).map(w => w.id);
  const allWondersBuilt = missingWonders.length === 0;
  const cut = s._cutBase || 0, sky = s._cutSky || 0, total = cut+sky;
  if (total > 0) {
    console.log('  ★ 削壳构成：基础 ' + cut.toFixed(0) + '（' + (cut/total*100).toFixed(0) + '%）' +
      ' / 天穹钻机 ' + sky.toFixed(0) + '（' + (sky/total*100).toFixed(0) + '%）');
    console.log('  ★ 天穹钻机破壳耗时：' + (sky>0 ? (sky/100).toFixed(2) : '0') + ' 秒（' + (CFG_SKYDRILL_RATE()/1).toFixed(0) + ' 点/秒）');
  }
  console.log('  ★ 终态：era=' + s.era + ' pop=' + s.pop + ' peak=' + s.peak +
    ' 科技=' + Object.keys(s.techs).filter(k=>s.techs[k]).length + '/' + SB.TECHS.length +
    ' 奇观=' + builtWonderIds.length + '/' + SB.WONDERS.length +
    '（' + (allWondersBuilt ? '全部建成' : '未建：' + missingWonders.join(', ')) + '）');
  if (process.env.SB_REQUIRE_ALL_WONDERS === '1' && !allWondersBuilt) process.exitCode = 1;
  if (REQUIRE_ERA7) {
    const missingEra7 = (SB.TECHS || []).filter(t => t.era === 7 && t.id !== 'ancient' && !s.techs[t.id]);
    if (missingEra7.length) process.exitCode = 1;
  }
  console.log('  ★ 资源：食物=' + (s.res.kelp || 0).toFixed(1) + ' 珊瑚=' + (s.res.coral || 0).toFixed(1) +
    ' 暖石=' + (s.res.warmstone || 0).toFixed(1) + ' 精铁=' + (s.res.iron || 0).toFixed(1) +
    ' 科技=' + (s.res.science || 0).toFixed(1) + ' 市政=' + (s.res.culture || 0).toFixed(1));
  if (process.env.SB_DIAG === '1') {
    const aiGoal = SB.aiStrategy.researchGoal(s);
    const rates = SB.economy.rates(s);
    const steelBuilds = ['hydroturbine', 'hydroshop'].map(id => {
      const def = SB.habitat.buildingById(id);
      return { id, level: s.lvl[id] || 0, unlocked: SB.habitat.unlocked(s, def),
        needMet: SB.habitat.needMet(s, def), blocked: SB.habitat.lockReason(s, def),
        cost: SB.economy.costOf(s, id), canAfford: SB.economy.canAfford(s, SB.economy.costOf(s, id)) };
    });
    const storageUpgrades = ['upg_ballast_1', 'upg_ballast_2'].map(id => ({ id,
      owned: !!(s.upgrades && s.upgrades[id]), blocked: SB.workshop.upgradeBlocked(s, id),
      cost: (SB.workshop.upgradeById(id) || {}).cost }));
    const progressionUpgrades = ['upg_deepmine', 'upg_hppump', 'upg_thermrecover'].map(id => ({ id,
      owned: !!(s.upgrades && s.upgrades[id]), blocked: SB.workshop.upgradeBlocked(s, id),
      cost: (SB.workshop.upgradeById(id) || {}).cost }));
    const wonderTargets = ['wonder_shellcutter', 'wonder_presspipe', 'wonder_skydrill'].map(id => {
      const def = SB.workshop.wonderById(id), cost = def && def.cost || {}, shortages = {};
      for (const r in cost) shortages[r] = Math.max(0, cost[r] - (s.res[r] || 0));
      return { id, owned: !!(s.wonders && s.wonders[id]), blocked: SB.workshop.wonderBlocked(s, id), cost, shortages };
    });
    const progressionMaterials = ['steel', 'steelPart', 'hardCoral', 'titanium', 'rope', 'scaffold', 'resonantDrill', 'stoneBeam']
      .map(id => ({ id, stock: s.res[id] || 0, cap: SB.economy.capOf(s, id), rate: rates[id] }));
    const steelPartRecipe = SB.workshop.crafts().filter(c => c.res === 'steelPart')[0];
    console.log('  ★ Bot目标：' + JSON.stringify({ key: aiGoal.key && aiGoal.key.id, id: aiGoal.id, cond: aiGoal.cond }) +
      '；人口容量=' + SB.economy.popCap(s) + '；城堡扩容=' + (s.upgrades && s.upgrades.upg_castle) +
      '（' + SB.workshop.upgradeBlocked(s, 'upg_castle') + '）');
    console.log('  ★ Bot决策：' + JSON.stringify(lastBotDecision) +
      '；钢产线=' + JSON.stringify({ steel: s.res.steel, steelRate: rates.steel, hydroRate: rates.hydro,
        warmstoneRate: rates.warmstone, tools: s.tools, buildings: steelBuilds }));
    console.log('  ★ 仓储扩容升级=' + JSON.stringify(storageUpgrades) +
      '；珊瑚/石头速率=' + rates.coral + '/' + rates.stone +
      '；压舱仓成本=' + JSON.stringify(SB.economy.costOf(s, 'ballast')));
    console.log('  ★ 钻机前置升级=' + JSON.stringify(progressionUpgrades) +
      '；关键材料=' + JSON.stringify(progressionMaterials) +
      '；钢制零件配方=' + JSON.stringify(steelPartRecipe && {
        blocked: SB.workshop.craftBlocked(s, steelPartRecipe.id),
        cost: steelPartRecipe.in, out: steelPartRecipe.out
      }));
    console.log('  ★ 钻机奇观材料=' + JSON.stringify(wonderTargets) +
      '；绳/珊瑚原料=' + JSON.stringify({ kelp: s.res.kelp, kelpRate: rates.kelp,
        coral: s.res.coral, coralRate: rates.coral, hardCoral: s.res.hardCoral }));
    console.log('  ★ 市政/政策=' + JSON.stringify({ market: !!s.civics.market, gov: s.gov,
      cards: s.cards, luxury: s.res.luxury, luxuryTotal: s.got && s.got.luxury,
      merchant: s.jobs.merchant, marketBoost: SB.civic.boostMet(s, SB.civic.byId('market')),
      marketCardBlocked: SB.civic.cardBlocked(s, 'card_market'), slots: SB.civic.slotList(s),
      storeMul: SB.civic.storeMul(s) }));
    console.log('  ★ 仓储/住房：' + JSON.stringify({ coral: [s.res.coral, SB.economy.capOf(s, 'coral')],
      stone: [s.res.stone, SB.economy.capOf(s, 'stone')], stoneBeam: s.res.stoneBeam, hardCoral: s.res.hardCoral,
      nextNest: SB.economy.costOf(s, 'nest'), nextCoralhouse: SB.economy.costOf(s, 'coralhouse'),
      nextHall: SB.economy.costOf(s, 'hall') }));
    console.log('  ★ 职业：' + JSON.stringify(s.jobs));
    console.log('  ★ 建筑：' + JSON.stringify(s.lvl));
    console.log('  ★ 未研究且已揭示的本纪元科技：' + JSON.stringify(SB.TECHS
      .filter(t => t.era <= s.era && !s.techs[t.id] && SB.tech.isRevealed(s, t.id))
      .map(t => ({ id: t.id, name: t.name, blocked: SB.tech.studyBlocked(s, t.id), eureka: t.cond }))));
    console.log('  ★ 未完成且已揭示的本纪元市政：' + JSON.stringify(SB.CIVICS
      .filter(c => (!c.era || c.era <= s.era) && !s.civics[c.id] && SB.civic.isRevealed(s, c.id))
      .map(c => ({ id: c.id, name: c.name, blocked: SB.civic.blocked(s, c), boost: c.boost }))));
  }
  if (process.env.SB_REQUIRE_CHALLENGE === '1' && challengeId) {
    const c = SB.challenges.progress(SB.game.meta());
    const def = SB.challenges.byId(challengeId);
    const tierDone = def.tiers.length === 1 ? c[challengeId] === true : (c[challengeId] | 0) >= challengeTier;
    if (!s.broken || !tierDone) process.exitCode = 1;
  }
}
function CFG_SKYDRILL_RATE() { return SB.CFG.SKYDRILL_RATE; }
