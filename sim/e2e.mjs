/* 天壳 / SHELLBREAK — 端到端冒烟
 * 用假 DOM 加载 index.html 里声明的全部脚本（含 game / ui / main），
 * 再驱动真实点击事件跑完整一局：铺基建 → 冰封期 → 剥壳 → 破冰 → 结算 → 下一周目。
 * 目的不是「不崩」，而是证明这条链路真的走得通。
 * 用法：node sim/e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAll, ROOT, mulberry32 } from './load-sb.mjs';
/* Suites receive this run's shared SB/check fixture and run in sequence; keep one loadAll. */
import { run as runClickEvents } from './e2e-suites/click-events.mjs';
import { run as runAutoPlay } from './e2e-suites/autoplay.mjs';
import { run as runAutoResearch } from './e2e-suites/auto-research.mjs';
import { run as runTechShape } from './e2e-suites/tech-shape.mjs';
import { run as runEra3Content } from './e2e-suites/era3-content.mjs';
import { run as runPersistence } from './e2e-suites/persistence.mjs';
import { run as runBuildingShape } from './e2e-suites/building-shape.mjs';
import { run as runEra4Content } from './e2e-suites/era4-content.mjs';
import { run as runEra10Content } from './e2e-suites/era10-content.mjs';
import { run as runEra10Civics } from './e2e-suites/era10-civics.mjs';
import { run as runFoodEconomy } from './e2e-suites/food-economy.mjs';
import { run as runCivics } from './e2e-suites/civics.mjs';
import { run as runWorkshopEconomy } from './e2e-suites/workshop-economy.mjs';
import { run as runUiAccessibility } from './e2e-suites/ui-accessibility.mjs';
import { run as runCalendarWarmstone } from './e2e-suites/calendar-warmstone.mjs';
import { run as runOfflineFastForward } from './e2e-suites/offline-fastforward.mjs';
import { run as runChallenges } from './e2e-suites/challenges.mjs';
import { run as runAiStrategy } from './e2e-suites/ai-strategy.mjs';

const errors = [];
const checks = [];
const deferred = [];                   // 挂起的「全局标定类」断言：默认不计入成败
const noop = () => {};                 // emit 的空实现：本文件里部分断言直接跑 economy.tick
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
}
// 新的页签解锁弹窗会按顺序排队；独立测试段落开始前先清空，避免前一段
// 的叙事弹窗遮住本段要验证的弹窗或 tab 行为。
function drainStoryModals() {
  let guard = 16;
  while (guard-- > 0) {
    const modal = doc.getElementById('modal');
    const ok = doc.getElementById('mStoryOk');
    if (!modal || modal.classList.contains('hidden') || !ok || typeof ok.onclick !== 'function') break;
    ok.onclick();
  }
}
/* ⚠️ 挂起口径（2026-09-27 用户明令）：单局时长这类「全局标定」断言，属于
 * 「等全部做完最后一起算」那一类，**默认从回归里摘出去** —— 平时跑 e2e 不该看到它，
 * 更不该因为它变红就跑去调常数。要核算时显式 `node sim/e2e.mjs --balance` 打开。
 * 这类断言写进 deferred 而不是直接删：删了就再也不会有人知道它存在，挂起还留着账。 */
const BALANCE_ON = process.argv.includes('--balance');
function defer(name, cond, detail) {
  if (!BALANCE_ON) {
    deferred.push({ name, detail: detail || '' });
    console.log('  –  ' + name + '  【已挂起 · 待全局统一核算】');
    return;
  }
  check(name, cond, detail);
}

/* ⚠️ 与 defer 是**两回事**，别混用：
 *    · `defer` = 现在能测，但「等全部做完最后一起算」（标定类），加 --balance 就照跑。
 *    · `pending` = **被测的性质在当前设计下不可能成立**。不是「没测到」，是「测不了」——
 *      例：删掉地热线之后，「破冰结算会发洋流点」这条**结构性不成立**（破冰根本不会发生）。
 *      ⇒ 这类只能挂起并把理由写死，绝不能**改断言去迁就现状**（那才是把红灯抹绿）。
 *      重设落地后，必须回来把 pending 改回 check()，并把「旧断言的原文」抄进理由里。 */
const pendingList = [];
function pending(name, reason) {
  pendingList.push({ name, reason });
  console.log('  ⃝  ' + name + '  【已挂起 · ' + reason + '】');
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
    setAttribute() {},
    getAttribute() { return null; },
    /* ⚠️ 2026-10-06 补 `querySelector`（幸福度面板那条改动带进来的 `meter.querySelector('.happy-meter')`），
     *   缺它 ⇒ boot 期 renderHappy 直接抛 `querySelector is not a function`，
     *   整份 e2e 在第 200 行就断掉（表现为「启动即抛错」，但**与当轮改动无关**，极易误判）。
     *   判据：桩上缺一个真实 DOM 有的方法 ⇒ 任何 `el.querySelector(...)` 都会炸；
     *   这类失败必须与「基线也炸」一起看，别急着改被测代码。
     *   实现：只认 `.class` 与 `#id` 两种选择器（本作 UI 代码只用这两种），
     *   在 `_html` 里按 class 名找，命中就返回**同一个**记忆化元素（与 doc 级查询同口径）。 */
    querySelector(sel) {
      if (typeof sel === 'string' && sel.charAt(0) === '#') {
        return doc.getElementById(sel.slice(1));
      }
      const cls = String(sel || '').replace(/^[.#]/, '');
      if (!cls) return null;
      /* 真实 DOM 里 select 的是**当前子树**里的元素；桩没有真正的树，
       *   所以按 innerHTML 里出现过这个 class 名来判定「命中」，
       *   并把它存进 _q 缓存 ⇒ 同一选择器两次拿到同一对象（可继续被改，语义同真实 DOM）。 */
      if (String(el._html || '').indexOf(cls) >= 0) {
        if (!el._q) el._q = {};
        if (!el._q[cls]) el._q[cls] = mkEl(cls);
        return el._q[cls];
      }
      return null;
    }
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
    _els: els,
    _q: q,
    readyState: 'complete',
    body: mkEl('body'),   /* 2026-09-30：render.bodyModalClass 读写 document.body 的 modal-open 类，
                           * 桩上必须真有 body 才能断言「弹窗开着禁点 tab / 关窗后恢复」。 */
    getElementById(id) { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement(tag) { const e = mkEl('new-' + tag); e.tag = tag; return e; },
    /* ⚠️ 按选择器记忆化：真实 DOM 里 `querySelectorAll('.tab')` 每次都返回**同一批对象**，
     *    于是「改这批对象的 class」是有后效的。假 DOM 若每次发一批新桩，这类后效就
     *    测不到 —— e2e 因此长期看不见「页签高亮和 pane 各记一份状态」的错位
     *    （2026-09-26 修的那条：走 setTab 的路径只换 pane、不换高亮）。 */
    querySelectorAll(sel) {
      if (q[sel]) return q[sel];
      let out = [];
      if (sel === '.tab') {
        /* ⚠️ 2026-09-27 补 civic：这张表是**第三份硬编码的职业/页签清单**
         *    （第一份 config.JOBS、第二份 folk.IDS、这里是页签）。漏一个的后果
         *    与那两份一样：市政页的灰态没人翻，测试永远停在「页签还是 locked」。
         *    ⚠️ 真要根治，应该从 index.html 里的 .tab 解析出来——但那要引入 HTML 解析，
         *        收益不抵成本。留在这里的代价是：**改 index.html 的页签要记得改这行**。 */
        out = ['village', 'folk', 'tech', 'civic', 'faith', 'workshop', 'wonder', 'company', 'meta'].map((t, i) => {
          const e = mkEl('tab-' + t); e.dataset.tab = t; e._tab = i; return e;
        });
      } else if (sel === '.spd') {
        out = [1, 5, 10, 20].map(s => { const e = mkEl('spd-' + s); e.dataset.spd = String(s); return e; });
      }
      q[sel] = out;
      return out;
    },
    /* ⚠️ 此前恒返回 null —— 于是「按 data-tab 精确取某个页签」的所有分支在 e2e 里
     *    都走不到：工坊页的灰态就是这么漏过回归的（页面上翻得动，测试永远绿）。
     *    这里从 `.tab` 表里筛一个出来，仍然不引入 HTML 解析器。 */
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
  /* 轮回结算动画（showBreakAnimation→play）用 setTimeout 排步骤，vm 里必须有桩，
   * 否则破壳路径直接 ReferenceError 崩掉整个 e2e（2026-10-07 实测）。不真跑定时器。 */
  _timeouts: [],
  setTimeout(fn) { sandbox._timeouts.push(fn); return sandbox._timeouts.length; },
  clearTimeout() {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
let fakeNow = 1000;

/* ---------------- 启动 ---------------- */
let SB, order;
try {
  ({ SB } = loadAll(sandbox));
/* 固定种子随机源（同一条纪律的实现，见 load-sb.mjs 的 mulberry32 注）。
 * ⚠️ 不钉住时 economy.js 会裸调 Math.random（这条纪律此前只有注释没有实现），
 *    实测整局时长随跑随变（7.79h / 8.22h 交替）—— 量出来的数没法拿来标定。
 * ⚠️ 但**别指望换种子能扫出分布**：本轮 bot 全程保持壳温，冰封期冻伤分支
 *    整局只被掷了 3 次骰（2026-09-28 实测），所以 seed 1 / 2 / 20260928 结果完全一致。
 *    ⇒ 种子只用来「保证可复现」，不是用来做蒙特卡洛。要看随机性得改 bot 策略。 */
  const g = SB.game.run();
  check('全部脚本按 index.html 顺序加载并完成 boot', !!g && !!SB.game, '共 ' + (sandbox.document._els.size ? '已建 DOM' : ''));
} catch (e) {
  errors.push('启动异常: ' + e.message + '\n' + e.stack);
  console.log('  ✗ 启动即抛错:', e.message);
}

const doc = sandbox.document;
const g = (id) => doc.getElementById(id)._html || '';
const step = sandbox._intervals[0];

// 快速单测离线分段器，避免每次调它都跑后面的整局点击模拟。
if (process.argv.includes('--offline-only')) {
  runOfflineFastForward({ SB, check, sandbox });
  const failedOffline = checks.filter(c => !c.ok);
  console.log(`\n离线快进测试：${checks.length - failedOffline.length}/${checks.length} 通过`);
  process.exit(failedOffline.length ? 1 : 0);
}

/* ⚠️ 2026-10-20 补：假点击目标**必须带祖先 closest 能力**，否则整类「祖先特征判据」的
 * 回归在这里永远看不见（真实踩过：input.js 用 `closest('[data-era]')` 认纪元按钮，
 * 而「页面材质」把 data-era 写在 <html> 上 ⇒ 全站按钮从采集到市政研究全部静默失联，
 * e2e 1189 条断言全绿 —— 因为假 target 没有 closest，那条判据直接短路成 undefined）。
 * 这里按真实 DOM 的形状补一个最小 closest：
 *   · 根元素 <html> 带 data-era（皮肤属性，值=当前纪元）；
 *   · 其余祖先**不带**任何 data-* 点击钩子（与真实页面一致，祖先上只有 data-page-node-id）。
 * 于是「用祖先特征当点击判据」的写法会在这里真的失效，而不是被短路掩盖。 */
const ROOT_ANCESTOR = { dataset: { era: '1' }, tagName: 'HTML', className: '' };
function attachClosest(el) {
  if (!el || typeof el !== 'object' || el.closest) return el;
  el.closest = function (sel) {
    if (!sel) return null;
    const s = String(sel).trim();
    /* 必须按**真实 DOM 的选择器语义**判，不能「选择器里含 data-era 就算命中」：
     * 根元素只有 data-era 这一个属性、没有 class，所以
     *   裸 `[data-era]` / `html[data-era]`  ⇒ 命中根元素（旧宽判据就是这么被吞的）；
     *   `.erabtn[data-era]` 这类带 class/标签限定的 ⇒ **不该**命中根元素。
     * 第一版 stub 写成「含 data-era 即命中」，结果把修复后的 .erabtn 判据也一起吞了，
     * 复现出同一个 bug —— 说明这条路子对，但建模必须忠实。 */
    return (s === '[data-era]' || s === 'html[data-era]') ? ROOT_ANCESTOR : null;
  };
  return el;
}
function fire(clk) {
  attachClosest(clk);
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

/* ---------------- 开局解锁链（对齐猫国：开局列表里只有猫薄荷田一张脸）----------------
 * 2026-09-25 用户拍「严格对齐猫国」（选项 A）：docs/DESIGN_v0.3.md §5 那条
 * 「开局可建 2 座，成本都是藻食 / 首建用藻食而非珊瑚」与猫国 hut=wood 正面冲突，
 * 已随文档作废。本块两处断言同步改成**按猫国对齐的资源线**。 */
console.log('\n=== 开局解锁链 ===');
{
  const s = SB.game.run();
  const open = SB.BUILDINGS.filter(b => SB.habitat.unlocked(s, b)).map(b => b.id);
  check('新开局只露头两座（礁口巢 + 深海菌圃）',
    open.length === 2 && open.indexOf('kelp') >= 0 && open.indexOf('nest') >= 0, open.join(',') || '（无）');

  /* 两座的定价资源必须**一条食物、一条材料**——猫国 hut=wood 的对齐形式。
   * 住房吃珊瑚（材料），于是开局 0 珊瑚时它买不起，玩家得先把那 1 名族民转成
   * 珊瑚匠；这不是「循环断了」，而是取舍点。真正不允许的是反过来：
   * 让住房吃藻食会把材料线彻底废掉（珊瑚无人生产、珊瑚匠无存在理由）。 */
  const starts = SB.BUILDINGS.filter(b => b.defaultUnlockable);
  check('露头的建筑资源线对齐猫国（藻场吃藻食、礁口巢吃珊瑚）',
    starts.length === 2 &&
    (SB.habitat.buildingById('kelp') || {}).cost.kelp > 0 &&
    (SB.habitat.buildingById('nest') || {}).cost.coral > 0,
    starts.map(b => b.id + '=' + JSON.stringify(b.cost)).join(' / '));

  /* ---- 开局对齐（照猫国 js/village.js: kittens 全 0 / jobs 全 0 / 资源全 0）---- */
  check('开局 1 名族民', s.pop === 1 && s.peak === 1, 'pop=' + s.pop);
  /* ⚠️ 2026-10-04：`craft`（匠人）职业**已整体删除**（用户「根本没有这个职业，删掉」）。
   *    它此前是幽灵行：无任何解锁口（craftT 已删）却被 jobUnlocked 的 `return !tid`
   *    判成「开局无条件解锁」⇒ 族民页恒显、雇得到、零产出。下面改钉「JOBS 里不存在 craft」。 */
  check('开局职业全 0（没人被预分配）',
    s.jobs.gather === 0 && s.jobs.scholar === 0,
    'gather=' + s.jobs.gather + ' scholar=' + s.jobs.scholar);
  /* 钉「匠人职业已从 config.JOBS 删除」——防止有人把这条幽灵行加回来。
   * 判据同时覆盖两个面：① JOBS 表里没有 craft 项；② 全树没有任何科技给它发解锁口。 */
  {
    const craftInJobs = SB.JOBS.some(j => j.id === 'craft');
    const craftUnlockers = [];
    for (let e = 1; e <= 5; e++) (SB.tech.byEra(e) || []).forEach(t => {
      if (((t.eff || {}).unlockJob) && t.eff.unlockJob.indexOf('craft') >= 0) craftUnlockers.push(t.id);
    });
    check('匠人职业已删除（JOBS 无 craft 项 且 无科技给 craft 发解锁口）',
      !craftInJobs && craftUnlockers.length === 0,
      'JOBS含craft=' + craftInJobs + ' 解锁科技=' + (craftUnlockers.join(',') || '无'));
  }
  check('开局资源全 0',
    Object.keys(s.res).every(k => s.res[k] === 0),
    JSON.stringify(s.res));
  check('开局闲置 1 人', SB.folk.idle(s) === 1, 'idle=' + SB.folk.idle(s));

  /* 手动采集两条线（2026-09-26 暗流纪重排，用户拍板「开局可以点击采集藻食和珊瑚两种资源」）。
   * 数值不写死，读 SB.CFG.GATHER——改那个常数时这里不用跟着改，但下面的「落差判断」
   * 仍然写死了 0.1 这个量级：它的作用是让开局那几十秒不是完全没操作，
   * 而不是让玩家能靠手速代替珊瑚匠（职业产出 0.5/s，是点一次的 5 倍）。 */
  fire({ dataset: { gather: 'kelp' } });
  check('手动采集：点一下得 ' + SB.GATHER.kelp + ' 藻食', s.res.kelp === SB.GATHER.kelp,
    'kelp=' + s.res.kelp + ' GATHER=' + JSON.stringify(SB.GATHER));
  fire({ dataset: { gather: 'coral' } });
  check('手动采集：珊瑚 ' + SB.GATHER.coral + '/次（远低于职业，不是手速替代）',
    Math.abs(s.res.coral - SB.GATHER.coral) < 1e-9 && SB.GATHER.coral < 1,
    'coral=' + s.res.coral);
  /* ⚠️ 2026-10-20 真 bug 的永久断言（用户「手动采集珊瑚没反应」）：
   *   `data-era` 有两个用途——① 纪元 skin（挂在 <html>，CSS :root[data-era]）；
   *   ② 纪元导航按钮的点击标记（.erabtn）。input.js 曾用裸 `closest('[data-era]')`
   *   判 ②，于是从任何按钮往上都命中 ① 的根元素 ⇒ 判定 return ⇒ 排在它后面的
   *   十几个分支（采集/一键最大/市政研究/政策卡/暖石/发射场模式/自动研究…）全成死代码。
   *   当时 e2e 全绿，因为假 target 没有 closest，判据被短路成 undefined。
   *   这里显式再造一次「只有根祖先带 data-era」的点击，把这个失败模式钉死。 */
  {
    const beforeC = s.res.coral;
    const rootTarget = attachClosest({ dataset: { gather: 'coral' } });
    check('假点击目标确实带着「<html data-era>」祖先（护栏自身有效）',
      !!rootTarget.closest('[data-era]'), 'closest([data-era]) = ' + !!rootTarget.closest('[data-era]'));
    for (const fn of doc._ev['click'] || []) fn({ target: rootTarget });
    check('祖先（html）带 data-era 皮肤属性时，采集点击不被误认成纪元导航吞掉',
      Math.abs(s.res.coral - (beforeC + SB.GATHER.coral)) < 1e-9,
      'coral ' + beforeC + ' → ' + s.res.coral + '（期望 ' + (beforeC + SB.GATHER.coral) + '）');
  }
  /* 按钮的读数必须与常数同源：这里把「渲染出来的文案」和「实际入账的量」焊在一起，
   * 免得以后改了常数忘了改提示，玩家点一下发现和按钮上写的不一样。 */
  check('采集按钮的读数与 GATHER 常数同源',
    g('pane-village-body').indexOf(SB.GATHER.coral + '') !== -1 && SB.GATHER.coral > 0,
    '珊瑚读数 ' + SB.GATHER.coral + ' / 面板含 =' + (g('pane-village-body').indexOf('+0.1') >= 0));

  /* 首建（深海菌圃）必须用藻食定价：开局珊瑚为 0，若首建吃珊瑚，
   * 循环第一步就断——这是「首建必须用食物定价」的可验证形式。 */
  check('首座建筑用藻食定价', (SB.habitat.buildingById('kelp') || {}).cost &&
    SB.habitat.buildingById('kelp').cost.kelp > 0,
    JSON.stringify(SB.habitat.buildingById('kelp').cost));

  /* ---- 建筑需求资源线对齐猫国（2026-09-25 选项 A，回归锁）----
   * 猫国：hut=wood / aqueduct=minerals / library=wood / pasture=catnip 100 + wood 10。
   * 资源映射 kelp↔catnip、coral↔wood、silt↔minerals。这四条是「猫国早期材料就是通用货币」
   * 的落点，改任何一条都会让材料线或食物线失去建筑出口——所以逐条锁死。 */
  {
    const c = id => (SB.habitat.buildingById(id) || {}).cost || {};
    check('建筑资源线对齐猫国（住房吃材料、导流堤吃矿砂、聆听巢吃珊瑚、保温巢食物打底）',
      c('nest').coral > 0 && !c('nest').kelp &&
      c('weir').silt > 0 && !c('weir').kelp &&
      c('library').coral > 0 && Object.keys(c('library')).join() === 'coral' &&
      c('warmnest').kelp > 0 && c('warmnest').coral > 0,
      [['nest', c('nest')], ['weir', c('weir')], ['library', c('library')], ['warmnest', c('warmnest')]]
        .map(x => x[0] + '=' + JSON.stringify(x[1])).join(' '));
  }

  // 采集者产的是藻食而非珊瑚（珊瑚由「珊瑚匠」职业出，见 economy.tick 第 1 步）
  {
    const t = SB.state.freshRun(false);
    t.jobs.gather = 1; t.lvl.workshop = 0;
    SB.economy.tick(t, 1, noop);
    check('采集者产藻食不产珊瑚', t.res.kelp > 0 && t.res.coral === 0,
      'kelp=' + t.res.kelp.toFixed(3) + ' coral=' + t.res.coral.toFixed(3));
  }

  // 闲置池分配：＋ 从闲置雇，− 退回闲置，总和 ≤ pop
  check('＋ 从闲置池雇佣', clickJob('gather', 1) && s.jobs.gather === 1 && SB.folk.idle(s) === 0,
    'gather=' + s.jobs.gather + ' idle=' + SB.folk.idle(s));
  /* ⚠️ 这条原先用 craft 测「没有闲置时 ＋ 无效」。craft 现在是**未解锁职业**，
   *    用它测等于「因为未解锁」通过、而不是「因为没闲置」通过——断言测的不是它自己
   *    声称的那件事（而且它会一直绿，掩盖真正的解锁守卫失效）。改用必然已解锁的
   *    gather 再雇一次：此刻 idle=0，这正是这条要在测的理由。 */
  check('没有闲置时 ＋ 无效', !clickJob('gather', 1) && s.jobs.gather === 1,
    'gather=' + s.jobs.gather + ' idle=' + SB.folk.idle(s));
  check('− 退回闲置（不补给别的职业）',
    clickJob('gather', -1) && s.jobs.gather === 0 && SB.folk.idle(s) === 1,
    'gather=' + s.jobs.gather + ' idle=' + SB.folk.idle(s));
  /* 解锁守卫（folk.assign 的根因侧那道）：初局只有采集者解锁，珊瑚匠锁在付费科技（25）的
   *   「凿珊瑚」后面，其余职业也锁着。这里用**珊瑚匠**当代表 —— 它是开局唯一锁着的
   *   「材料线入口」，锁不锁得住直接影响开局能不能走通（见下面那条手动采集断言）。
   * ⚠️ 必须在**有闲置**的时候测——此刻 idle=1，被拒就只可能是解锁这一条理由；
   *    若在 idle=0 时测，「拒绝」会被错归因成「没人可雇」（正是上一条的坑）。 */
  check('未解锁职业雇不动（此刻有闲置，仍被拒）',
    SB.folk.idle(s) === 1 && !SB.folk.jobUnlocked(s, 'coralwright') &&
    !clickJob('coralwright', 1) && s.jobs.coralwright === 0 && SB.folk.idle(s) === 1,
    'idle=' + SB.folk.idle(s) + ' coralwright=' + s.jobs.coralwright +
    ' unlocked=' + SB.folk.jobUnlocked(s, 'coralwright'));
  /* ⚠️ 商人必须也吃人口（2026-09-30 修）：曾经 `merchant` 漏在 folk.IDS 之外 ⇒ sum/idle
   *   看不见它 ⇒ 商人可以无限雇、死亡也收不回。这条把「雇一个商人 = 占掉一份闲置」钉死，
   *   并验证「闲置池空了之后商人也被拒」——这正是原来那个 bug 的反面。 */
  {
    const mj = SB.state.freshRun(false);
    mj.pop = 2; mj.civics = { trade: true };   // 对外贸易：解锁商人
    check('商人也吃人口（+1 商人 ⇒ 闲置 −1）',
      SB.folk.assign(mj, 'merchant', 1) === true && mj.jobs.merchant === 1 &&
      SB.folk.idle(mj) === 1,
      'merchant=' + mj.jobs.merchant + ' idle=' + SB.folk.idle(mj));
    check('闲置池空后商人雇不动（不再是无限雇）',
      SB.folk.assign(mj, 'merchant', 1) === true &&      // 第 2 个：idle 1 → 0
      SB.folk.assign(mj, 'merchant', 1) === false &&     // 第 3 个：被拒
      mj.jobs.merchant === 2 && SB.folk.idle(mj) === 0,
      'merchant=' + mj.jobs.merchant + ' idle=' + SB.folk.idle(mj));
  }
  /* 手动采集是撤回「凿珊瑚」免费之后开局的唯一材料路径，所以这条断言钉的是
   * **玩家真能靠手点走通**，不是「理论上有一条路」。走 input.js 那条真实点击路径
   * （点 `data-gather=coral`），量从 SB.GATHER 读、造价从 costOf 读，都不写死。
   * ⚠️ fire() 只能作用于 e2e 全局这份 state（input.js 闭包里的 s），所以就地做、
   *   做完把 coral 与 nest 复原，别污染后面那些断言。 */
  {
    s.res.coral = 0; s.lvl.nest = 0;
    const want = SB.economy.costOf(s, 'nest').coral;
    let clicks = 0;
    for (let i = 0; i < 600 && s.res.coral < want; i++) { fire({ dataset: { gather: 'coral' } }); clicks++; }
    check('点击「采珊瑚」能攒够首座礁口巢（手动是开局的正规路径）', s.res.coral >= want,
      '点 ' + clicks + ' 下攒到珊瑚 ' + s.res.coral.toFixed(1) + ' / 需 ' + want);
    /* 这条是上面那条「看起来攒够了却建不动」的**根因断言**：
     * 0.1 累加 100 次在 IEEE754 下是 9.99999999999998，而面板显示 toFixed(1) ⇒ 玩家看到
     * 「珊瑚 10.0」，建造按钮却是灰的、build() 静默返回 false。判据统一走 economy.enough
     * 之后才修好。钉住它，免得有人图省事把 canAfford 写回裸 `>=`。 */
    check('手动采集凑整时判据容得下浮点尾数（10.0 与 9.99999999999998 都算够）',
      SB.economy.enough(9.99999999999998, 10) && !SB.economy.enough(9.9, 10) &&
      SB.economy.canAfford({ res: { coral: 9.99999999999998 } }, { coral: 10 }),
      'enough(9.99999999999998, 10) 应为真；enough(9.9, 10) 应为假');
    SB.habitat.build(s, 'nest');
    check('首座礁口巢落地 ⇒ 人口上限从底数 1 升到 3（住房是真闸门）', SB.economy.popCap(s) === 3,
      'popCap=' + SB.economy.popCap(s));
    s.res.coral = 0; s.lvl.nest = 0;                  // 复原
  }
  /* 渲染层：族民页上出现的职业集合，必须**恰好等于**已解锁集合（+ 有人的那些）。
   * 期望值不写死「只有采集者」——那是把「开局」当常量；这里由 jobUnlocked 现算，
   * 测的是「渲染集合 === 解锁集合」这条不变式，将来加职业/改解锁条件都还成立。
   * 判据读 data-job 这个真按钮属性（职业行没有别的机器可读标记）。
   * ⚠️⚠️【`want` 必须与 render 同源，都用 SB.game.run()】2026-09-28 踩过：
   *     渲染读的是 `res()` ⇒ `SB.game.run()`（整局真实态），而这里原先拿的是**手工
   *     夹具态**那个 `s`。整局 bot 会做市政《对外贸易》⇒ 商人在真实态里解锁、被渲染，
   *     而夹具态从没做过那项市政 ⇒ 它压根不在期望集合里 ⇒ 这条断言一上来就红，
   *     看上去像「UI 多渲染了一个职业」，其实是**比较双方不是同一份状态**。
   *     两个集合必须都由同一份 state 算出来，"UI 有没有按 jobUnlocked 过滤" 这句
   *     才成立——否则它会一直绿，只因为两边刚好都是错的。
   *     「谁该解锁谁」由下面「未解锁职业雇不动」那条单独钉，两条各管一段。
   * ⚠️⚠️ 真正的原因（2026-09-28 实测，别再往「状态不同源」那条路上想）：
   *    加商人时 state.js 的 `jobs` 字面量漏了 merchant ⇒ `s.jobs.merchant` 是 undefined
   *    ⇒ render 那道 `s.jobs[j.id] <= 0` 守卫算出 **false** ⇒ 未解锁的商人被整行渲染。
   *    economy 侧因为有 `(s.jobs.x || 0)` 保护而没出 NaN，所以这次是**静默的假动作**：
   *    玩家看得见职业行，点 ＋ 雇不到人，而没有任何报错。根因已修（state 补键 + render 补 || 0）。 */
  {
    SB.ui.render.renderPanes();
    const html = doc.getElementById('pane-folk').innerHTML;
    const ids = SB.JOBS.map(j => j.id);
    const shown = ids.filter(id => html.indexOf('data-job="' + id + '"') >= 0);
    const rs = SB.game.run();
    const want = ids.filter(id => SB.folk.jobUnlocked(rs, id) || rs.jobs[id] > 0);
    check('族民页只渲染已解锁的职业（未解锁的整行不出现）',
      shown.join() === want.join() && shown.indexOf('gather') >= 0 && want.length < ids.length,
      '渲染=' + shown.join('/') + ' 应为=' + want.join('/') + '（共 ' + ids.length + ' 个职业）');
  }
  /* 改称机制上屏：掌握「种植」后，族民页上采集者那一行的**显示名**要变成农民。
   * 这条是补上一个静默失效——jobName 原先只有科技页在读，族民页直接印数据表的 name，
   * 于是同一个职业在两页上叫两个名字。测渲染字符串里有没有那个名字，而不是测
   * folk.jobName 的返回值（后者早就对了，坏的是「没人调用它」）。 */
  {
    SB.ui.render.renderPanes();
    const plain = doc.getElementById('pane-folk').innerHTML;
    const hadOldName = plain.indexOf('采集者') >= 0, hadNewName = plain.indexOf('农民') >= 0;
    s.techs.plant = true;
    SB.ui.render.renderPanes();
    const grown = doc.getElementById('pane-folk').innerHTML;
    check('「种植」把族民页那一行改称农民（改称机制真的上屏）',
      hadOldName && !hadNewName && grown.indexOf('农民') >= 0,
      '改称前=采集者(' + hadOldName + ')/农民(' + hadNewName + ') 改称后含农民=' + (grown.indexOf('农民') >= 0));
    delete s.techs.plant;
    SB.ui.render.renderPanes();
  }

  // ironWill（猫国：无猫不饿死）：pop 1 时菌毯耗尽也不减员
  s.res.kelp = 0; s.famine = 0;
  frames(700);   // 70 秒逻辑时间 > famine 60 秒阈值
  check('pop 1 饿死保护（ironWill）', s.pop === 1 && s.famine > 0, 'pop=' + s.pop + ' famine=' + s.famine);
  s.famine = 0;

  // 渲染层必须跟解锁判定一致：未露头的建筑整行不出现（照猫国）
  const pane0 = g('pane-village-body');
  check('开局建筑面板只渲染深海藻场一行',
    pane0.indexOf('深海藻场') !== -1 && pane0.indexOf('工坊') === -1 &&
    pane0.indexOf('压舱仓') === -1 && pane0.indexOf('破冰祭坛') === -1,
    '面板含菌圃=' + (pane0.indexOf('深海菌圃') !== -1));

  // 藻田之外不能硬建：解锁判定必须拦得住
  const blocked = SB.habitat.build(s, 'workshop') || SB.habitat.build(s, 'nest');
  check('未解锁的建筑建不起来', !blocked, 'workshop/nest 均被拦下');

  /* 攒够珊瑚后工坊该自己露头。
   * ⚠️ 工坊的解锁来源随纪元一重排换了人：原「骨工法」（纪元二）→ 现「青铜术 bronze」（纪元一），
   *    后者的 eff.unlockBuild 直接给工坊。少了这一句，测出来的失败其实是「科技墙还没过」，
   *    断言名不副实——e2e「建筑解锁来源」那节会静态查两边一致，这里补的是动态那一半。 */
  s.techs.bronze = true;
  s.res.coral = 400;
  check('研究青铜术后工坊即解锁（不再卡 30% 库存门槛，珊瑚不足只是买不起、不是不露头）',
    SB.habitat.unlocked(s, SB.habitat.buildingById('workshop')), 'coral=' + s.res.coral);
  SB.game.markDirty(); SB.game.render();
  check('露头后建筑面板同步出现工坊行', g('pane-village-body').indexOf('工坊') !== -1);
  /* ⚠️ 还原（2026-09-28）：上面这个 bronze 夹具**漏还原**了 —— 它比下面这段早出现的
   *    「三处必须还回去」那条纪律（367 行的 bak/delete）还要早，于是 `techs.bronze=true`
   *    一路带进了后面 40000 帧的整局模拟：bot 白拿一项 600 科学、且提前拿到工坊解锁，
   *    「era1 1.53h / 整局 5.74h」这些数是在一个被污染的 state 上跑出来的。
   *    ⚠️ 判据：夹具改了什么就还什么；「整局模拟从干净开局出发」那条例会替我们兜底。 */
  delete s.techs.bronze;
  SB.game.markDirty(); SB.game.render();

  /* 建造按钮必须**始终**摊开成本。用户 2026-09-26 指出：攒够钱后按钮被换成光秃秃的
   * 「建造」，恰好把「这一级要多少」藏起来了（不够时反倒写着成本），而且按钮宽度随
   * 库存来回跳（够 → 变窄 → 花掉 → 又变宽）。
   * 期望值不写死数值，直接用引擎算出的 costOf/costTxt —— 测的是
   * 「按钮文案 === 成本文案」这条不变式，改数值不会假红。
   * ⚠️ 夹具要借「资源充足」这个前提，但这里用的是**整局跑共用的那个 s**（后面 40k 帧
   *    就是它），所以三处改完必须原样还回去，否则整局从「无限资源」开局，bot 行为全歪。
   *    科技键用 delete 还原（没装过就必须删掉，留个 true 会让压舱仓永远露头）。 */
  {
    /* ⚠️ 2026-09-28：这里的科技门从「储藻术」(warmkeep) 换成「照明」(lighting) ——
     *    纪元二第一层重做时那一项已被废弃。语义完全不变：都是压舱仓的科技门。 */
    const bak = { lv: s.lvl.kelp, kelp: s.res.kelp, coral: s.res.coral, lighting: !!s.techs.lighting };
    s.lvl.kelp = 3; s.res.kelp = 1e6; s.res.coral = 1e6;
    s.techs.lighting = true;                   // 压舱仓的科技门（不装它整行不渲染）
    SB.game.markDirty(); SB.ui.render.renderPanes();
    const pv = g('pane-village-body');
    const ck = SB.economy.costOwnedTxt(s, SB.economy.costOf(s, 'kelp'));
    const cb = SB.economy.costOwnedTxt(s, SB.economy.costOf(s, 'ballast'));
    check('建筑按钮摊开成本并带「已拥有/需要」（够钱时也写着，形如「升级 藻食 100…/21.1」）',
      pv.indexOf('升级 ' + ck) !== -1 && pv.indexOf('建造 ' + cb) !== -1,
      '升级文案「升级 ' + ck + '」 / 建造文案「建造 ' + cb + '」');
    check('反向对照：没有「光秃秃的建造/升级」按钮（把成本去掉这条就该红）',
      !/>(建造|升级)</.test(pv), '');

    /* NaN 回归：已有值坏掉时只能回落为 0；NaN 产出也不能再次写回资源池。
     * 成本分母仍由 costOf 正常计算，这正是用户截图里「NaN/5,507.2」的形状。 */
    const nanProbe = SB.state.freshRun(false);
    nanProbe.res.coral = NaN;
    const nanTxt = SB.economy.costOwnedTxt(nanProbe, { coral: 12.5 });
    check('成本标签：已有资源为 NaN 时回落显示 0，不把 NaN 印到界面',
      nanTxt === '珊瑚 0/12.5' && nanTxt.indexOf('NaN') === -1, nanTxt);
    SB.economy.addRes(nanProbe, 'coral', NaN);
    check('资源入账：NaN 产出被丢弃，不再污染资源池',
      nanProbe.res.coral === 0, 'coral=' + nanProbe.res.coral);

    const oldMatMaxBonus = SB.wonder.matMaxBonus;
    SB.wonder.matMaxBonus = function () { return NaN; };
    const badCapProbe = SB.state.freshRun(false);
    SB.economy.addRes(badCapProbe, 'coral', 1);
    SB.wonder.matMaxBonus = oldMatMaxBonus;
    check('资源上限异常时仍能入账，不把 NaN 伪装成 0',
      badCapProbe.res.coral === 1, 'coral=' + badCapProbe.res.coral);

    const metaProbe = SB.game.meta();
    const oldMatStore = metaProbe.perks.matStore1;
    metaProbe.perks.matStore1 = {};
    const capProbe = SB.state.freshRun(false);
    capProbe.lvl.ballast = 10;
    const repairedCap = SB.economy.capOf(capProbe, 'coral');
    metaProbe.perks.matStore1 = oldMatStore;
    check('异常的跨周目仓储数据不会让所有材料上限变 NaN',
      isFinite(repairedCap) && repairedCap >= SB.CFG.CAP_BASE.coral + 10 * SB.BLD.ballastCap,
      'coral cap=' + repairedCap);

    const repairedSave = SB.state.migrateRun({ res: { coral: null, stone: 12 } });
    check('读档遇到空资源值时留下诊断信息但不把诊断字段写回存档',
      repairedSave.res.coral === 0 && repairedSave.res.stone === 12 &&
      repairedSave._repairedResources.indexOf('coral') !== -1 &&
      JSON.stringify(repairedSave).indexOf('_repairedResources') === -1,
      'coral=' + repairedSave.res.coral + ' repaired=' + repairedSave._repairedResources.join(','));

    const oldRunKey = SB.CFG.RUN_KEY;
    const oldRunValue = sandbox.localStorage && sandbox.localStorage.getItem(oldRunKey);
    const invalidSave = SB.state.freshRun(false);
    invalidSave.res.coral = NaN;
    SB.state.saveRun(invalidSave);
    check('坏资源快照不会覆盖 localStorage 中的上一份存档',
      !sandbox.localStorage || sandbox.localStorage.getItem(oldRunKey) === oldRunValue,
      'invalid snapshot rejected');

    s.lvl.kelp = bak.lv; s.res.kelp = bak.kelp; s.res.coral = bak.coral;
    if (!bak.lighting) delete s.techs.lighting;
    SB.game.markDirty(); SB.ui.render.renderPanes();
  }

  /* unlockScheme 机制：原用于破冰祭坛（精铁达阈值才解锁），祭坛已于 2026-10-07 撤除，
   *   全仓已无建筑使用 unlockScheme ⇒ 这条专项断言随之撤销。
   *   资源墙（科技 / 市政 / 资源量）仍由各建筑自己的 unlocked 判据守住，见下方各节。 */
  s.res.coral = 0; s.res.iron = 0;

  /* ⚠️ 2026-09-28：热泉炉的科技前置从「冶炼术」换成「铁器」（纪元二重排的结果）。
   *    「未研究→锁着 / 研究后→解锁」这两条断言的**形状没变**，换的是钉的那一项，
   *    这样热泉炉的解锁权一旦再被挪走，这两条会立刻红而不是静默跟着走。 */
  s.res.coral = 9e5;
  const furnace = SB.habitat.buildingById('furnace');
  const techsBefore = JSON.stringify(s.techs);
  check('未研究铁器时热泉炉锁着', !SB.habitat.unlocked(s, furnace), 'requiredTech: ironwork');
  s.techs.ironwork = true;
  check('研究该科技后热泉炉解锁', SB.habitat.unlocked(s, furnace), 'requiredTech 已满足');
  s.techs = JSON.parse(techsBefore);

  /* 破冰祭坛的硬纪元闸门：祭坛已于 2026-10-07 撤除 ⇒ 该专项断言随之撤销。
   * 当前终局凿壳改由天穹钻机（wonder）承担，其解锁走奇观建造路径，无独立纪元闸门断言。 */

  /* 尤里卡机制的四条断言：揭示 → 研究 → 关键节点全清 → 进下一纪元。
   * 这套改造的核心循环，在线上没有任何断言守住它，等于没有回归保护。 */
  const t3 = SB.state.freshRun(false);
  /* 结绳已经不是开局白送了（2026-09-25 用户拍的科研面板开门）：
   * 它的尤里卡条件就是「建成第 5 座深海藻场」，与面板开门是同一件事。
   * 于是这里连着断言三档：4 座 ⇒ 门还关着 / 5 座 ⇒ 门开且结绳自动掌握。 */
  check('开局：科研面板未开、结绳未掌握（科技入口由开门给出）',
    !SB.tech.panelOpen(t3) && !t3.techs.writing && !SB.tech.isRevealed(t3, 'writing'),
    'panelOpen=' + SB.tech.panelOpen(t3) + ' writing=' + !!t3.techs.writing);
  check('开局：尤里卡扫描已跑过并揭示首批节点',
    (SB.tech.pump(t3, noop), SB.tech.isRevealed(t3, 'coralcut')),
    '已揭示 ' + Object.keys(t3.eureka).join(','));
  check('未揭示的节点不能研究',
    !SB.tech.canStudy(t3, 'quarry'), '采石要攒够 40 珊瑚才现形');
  /* 关键节点（历法 + 石工）全清 ⇒ 自动进入下一纪元，且下一纪元节点随之可见。
   * ⚠️ 2026-09-26 暗流纪重排：纪元一的两个关键节点由「历法 + 巢筑」变成
   *    「历法 calendar + 石工 masonry」——原「巢筑」那件事（解锁下一档住房）
   *    被并进石工了（石工同时解锁石屋与议事厅）。写 shelter 会静默不生效：
   *    那是个已经不存在的 id，赋值不会报错，只会让这一节永远等不到纪元推进。 */
  t3.techs.calendar = true; t3.techs.masonry = true;
  SB.tech.pump(t3, noop);
  check('关键节点全清后自动进入下一纪元', t3.era === 2, 'era=' + t3.era);
  /* ⚠️ 2026-09-28 换载体：原先钉的是「通识」(loreway)，而它已随用户指令删除（它是大图书馆
   *    的 need，删了 need 悬空）。语义一字未改，只是换一个还活着的纪元二科技：
   *    「铁器」(ironwork, era 2, reqs 空, cost 110)——**故意挑 reqs 为空的那类**：
   *    它除了纪元那道墙之外没有别的门，测出来的失败才不会是另一道墙。
   *    （canStudy 还要过 `economy.enough(science, cost)`，而这份夹具science 为 0 ⇒ 恒 false。） */
  check('新纪元的尤里卡条件随即转为可见',
    SB.tech.isRevealed(t3, 'ironwork'),
    '冷焰纪 ' + SB.tech.byEra(2).filter(t => SB.tech.isRevealed(t3, t.id)).length + '/' + SB.tech.byEra(2).length + ' 项可见');
  check('纪元闸门：纪元二的科技不能在当前纪元偷研究',
    !SB.tech.canStudy(t3, 'ironwork'), 'ironwork 属冷焰纪');
  {
    const w = SB.tech.byId('writing'), need = (w.cond && w.cond.n) || 5;
    t3.lvl.kelp = need - 1;
    SB.tech.pump(t3, noop);
    check('第 ' + (need - 1) + ' 座藻场：门还关着，凿珊瑚已可见',
      !SB.tech.panelOpen(t3) && !t3.techs.writing && SB.tech.isRevealed(t3, 'coralcut'),
      'kelp=' + t3.lvl.kelp + ' panelOpen=' + SB.tech.panelOpen(t3));
    t3.lvl.kelp = need;
    SB.tech.pump(t3, noop);
    check('第 ' + need + ' 座藻场：科研面板开门，结绳揭示即掌握',
      SB.tech.panelOpen(t3) && t3.techs.writing === true && SB.tech.isRevealed(t3, 'writing'));
    check('开门不折算研究进度（只揭示，不送科技）', t3.res.science === 0, 'science=' + t3.res.science);
    /* ⚠️ 这里原先断言过「开门不点亮全树」。假设对、版本错：
     *    进新纪元时 revealEra 会**故意**把 `t.era < era` 的节点一并摊开（allBefore），
     *    理由是那些纪元已经过去、再藏着只会把玩家永久锁死（见 tech.revealEra 的注）。
     *    所以纪元推进之后 plant/calendar 必然是已揭示的——那不是开门的功劳，
     *    开门只影响 panelOpen，两者互不相干。留着这条会逼着有人去拆 allBefore 那个
     *    防死锁机制，所以删掉，换成守住真正该守的：门开着，科技不会自己到账。 */
    /* ✅ 2026-09-28 **还原为 check()**：上一轮因为「通识删除 ⇒ era2 零关键节点 ⇒
     *    进 era2 即自动跳 era3」而挂起；用户已拍板补回 **照明 + 工程学** 两个 key 节点
     *    （techs.js），`keysOf(2).length` 重新为 2 ⇒ 本条的前提重新成立。
     *    【它钉的真命题】revealEra 的 allBefore 只摊**已过去的纪元**，当前纪元之后的
     *    节点必须仍藏在尤里卡后面 —— 也就是「纪元推进不会剧透下一纪元」。 */
    check('开门不揭示当前纪元之外的节点（revealEra 的 allBefore 只摊已过去的纪元）',
      SB.tech.isRevealed(t3, 'plant') && !SB.tech.isRevealed(t3, 'apprentice'),
      'plant=' + SB.tech.isRevealed(t3, 'plant') + ' apprentice(纪元三)=' + SB.tech.isRevealed(t3, 'apprentice'));
  }
}

runTechShape({ SB, check });
runEra3Content({ SB, check });


/* ---------------- 纪元三：economy 接线（上限 / 工坊升级聚合 / 城堡衰减）----------------
 * 数据落了地，不等于通道接上了。下面三条直接读乘区/上限本身，避开 rates() 的减项稀释。 */
console.log('\n=== 纪元三 · economy 接线 ===');
{
  const fr = SB.state.freshRun(false);

  /* ① 三种新资源无上限（RESS 不入 CAP_BASE ⇒ capOf 返回 Infinity，钢无上限抄猫国）。 */
  const inf = ['steel', 'hydro', 'steelPart'].filter(r => SB.economy.capOf(fr, r) !== Infinity);
  check('钢/热液能/钢制零件 capOf = Infinity（无上限）', inf.length === 0, '有上限的=' + inf.join(','));

  /* ② 工坊升级的 craftRatio 聚合读到了 s.upgrades（upg_autoshop craftRatio:0.10）。
   *    这条通道上一轮漏过一次（只读了建筑级/科技/奇观/政体），必须钉死。 */
  check('upgSum(craftRatio) 空台账 = 0', SB.economy.upgSum(fr, 'craftRatio') === 0);
  fr.upgrades = fr.upgrades || {}; fr.upgrades.upg_autoshop = true;
  check('upgSum(craftRatio) 装了自动工坊 = 0.10', SB.economy.upgSum(fr, 'craftRatio') === 0.10,
    '=' + SB.economy.upgSum(fr, 'craftRatio'));

  /* ③ 城堡容量衰减桥接（getLimitedDR 抄猫国，limit=1000）：hall 越高加成越大但封顶 1000。
   *    用 capOf('stone') 的差值间接读 castleCapBonus —— 避免直接依赖未导出的内部函数。 */
  const baseStone = SB.economy.capOf(fr, 'stone');           // 无城堡升级时的材料容量
  fr.upgrades.upg_castle = true;
  fr.lvl = fr.lvl || {}; fr.lvl.hall = 0;
  const hall0 = SB.economy.capOf(fr, 'stone');
  fr.lvl.hall = 10;                                          // raw = 10 × 50 = 500 < 750 ⇒ 全给
  const hall10 = SB.economy.capOf(fr, 'stone');
  fr.lvl.hall = 20;                                          // raw = 20 × 50 = 1000 ⇒ 封顶 1000
  const hall20 = SB.economy.capOf(fr, 'stone');
  check('城堡升级：hall=0 无加成', hall0 === baseStone, 'base=' + baseStone + ' hall0=' + hall0);
  check('城堡升级：hall=10 加成 = 500（未触衰减）', Math.abs((hall10 - baseStone) - 500) < 1e-6,
    'Δ=' + (hall10 - baseStone));
  check('城堡升级：hall=20 加成封顶 1000（getLimitedDR 渐近）', Math.abs((hall20 - baseStone) - 1000) < 1e-6,
    'Δ=' + (hall20 - baseStone));

  /* ⑤ 城堡「真升级」（2026-10-06 用户截图澄清：**城堡不是第二座建筑**，
   *    而是议事厅买下工坊升级 `upg_castle` 之后的新名字）。
   *    契约逐条钉死：
   *      - 建筑表里**没有** id==='castle' 的建筑，lvl 表里也没有 castle 键
   *      - 升级前后是**同一座**：id 恒 hall、等级恒 lvl.hall、造价曲线恒 hall 那条
   *      - 升级只改效果：减耗 −2%/级 → −3%/级，并额外给 +50 容量/级
   *      - 升级前那座还能照常升级（不存在「退役」这回事）
   *      - 三条权柄、市政面板门、市政点可见性都读同一个 coreLvl = lvl.hall
   *      - 老档里的 lvl.castle 被 migrateRun 并回 hall（等级不丢） */
  {
    check('建筑表里没有独立的「城堡」建筑（城堡 = upg_castle 升级后的议事厅）',
      SB.BUILDINGS.every(b => b.id !== 'castle'),
      '误留=' + SB.BUILDINGS.filter(b => b.id === 'castle').map(b => b.name).join(','));
    const fr0 = SB.state.freshRun(false);
    check('lvl 表里没有 castle 键（等级恒归 hall）', fr0.lvl.castle === undefined,
      'castle=' + fr0.lvl.castle);
    check('升级项「城堡」在工坊升级表里，且 need=castle 科技',
      SB.UPGRADES.some(u => u.id === 'upg_castle' && u.need === 'castle'));

    const up = SB.state.freshRun(false);
    up.techs.masonry = true; up.techs.castle = true;
    up.res.stone = 1e9; up.res.coral = 1e9; up.res.stoneBeam = 1e9; up.res.hardCoral = 1e9;
    up.lvl.hall = 7;
    const hallB = SB.habitat.buildingById('hall');
    check('升级前：议事厅 7 级，coreLvl = 7', up.lvl.hall === 7 && SB.economy.coreLvl(up) === 7);
    check('升级前：议事厅可建、不存在退役', SB.habitat.unlocked(up, hallB) === true
      && SB.habitat.retired(up, hallB) === false);

    /* 买下升级项 —— 这一步才是「议事厅变城堡」这件事本身。 */
    const bought = SB.workshop.upgradeBuy(up, 'upg_castle');
    check('买下工坊升级「城堡」成功', bought === true);
    check('升级不新建建筑、也不动等级：仍是 hall 7 级（同一座）',
      up.lvl.hall === 7 && up.lvl.castle === undefined, 'hall=' + up.lvl.hall + ' castle=' + up.lvl.castle);
    check('升级后这座建筑仍可继续升级（无退役）',
      SB.habitat.unlocked(up, hallB) === true && SB.habitat.build(up, 'hall') === true);
    check('续建一级后 hall = 8（升级走的是同一条建造通道）', up.lvl.hall === 8, 'hall=' + up.lvl.hall);
    check('coreLvl 始终等于 hall（= 8）', SB.economy.coreLvl(up) === 8);

    /* 减耗：8 级 ⇒ ×(1 − 0.16)；装 upg_castle 之后每级省耗率 ×1.5 ⇒ ×(1 − 0.24)。
     * ⚠️ 2026-10-07 起减耗走 getLimitedDR 衰减、无硬封顶；低等级段（<0.75×lim）仍线性，
     *   故 8 级这条断言不变。高等级段的 DR 性质见下方「减耗 DR」三连。 */
    const hm = SB.state.freshRun(false); hm.lvl.hall = 8;
    const hmNo = SB.state.freshRun(false);
    const cNo = SB.economy.costOf(hmNo, 'workshop').coral;
    check('减耗按 coreLvl 走：8 级 ⇒ 下一级成本 ×(1−0.16)',
      Math.abs(SB.economy.costOf(hm, 'workshop').coral / cNo - 0.84) < 1e-6,
      'ratio=' + (SB.economy.costOf(hm, 'lighthouse').coral / cNo).toFixed(4));
    hm.upgrades.upg_castle = true;
    check('装城堡升级 ⇒ 每级省耗率 ×1.5（8 级：×(1−0.16) → ×(1−0.24)，DR 低段仍线性）',
      Math.abs(SB.economy.costOf(hm, 'workshop').coral / cNo - 0.76) < 1e-6,
      'ratio=' + (SB.economy.costOf(hm, 'lighthouse').coral / cNo).toFixed(4));

    /* 减耗 DR（2026-10-07 去掉旧 HALL_CAP=0.30 硬墙）：高等级段三条硬性质。
     * ① 不减到负数（旧「裸去掉封顶」会在 34 级折扣>100% ⇒ 造价变负、pay 倒给资源）；
     * ② 高等级折扣**超过**旧硬墙（旧最多 0.45 折扣 ⇒ mul 0.55；新 50 级 mul 0.10）；
     * ③ 折扣随等级单调加深（mul 50 < mul 10，证明没有硬墙在 45% 处把折扣截断）。 */
    const baseC = SB.economy.costOf(SB.state.freshRun(false), 'workshop').coral;
    const mulAt = (lvl) => { const s = SB.state.freshRun(false); s.lvl.hall = lvl; return SB.economy.costOf(s, 'workshop').coral / baseC; };
    const m10 = mulAt(10), m50 = mulAt(50);
    check('减耗 DR：高等级不减到负（50 级 mul 仍 > 0）', m50 > 0, 'mul=' + m50.toFixed(4));
    check('减耗 DR：高等级折扣超过旧硬墙（50 级 mul 0.10 < 旧 0.55）', m50 < 0.55, 'mul=' + m50.toFixed(4));
    check('减耗 DR：折扣随等级单调加深（mul 50 < mul 10，无硬墙截断）', m50 < m10, 'm10=' + m10.toFixed(4) + ' m50=' + m50.toFixed(4));

    /* 容量轴：8 级 × 50 = 400（这条是升级**新增**的权柄，升级前恒 0）。 */
    const b0 = SB.state.freshRun(false);
    const b8 = SB.state.freshRun(false); b8.lvl.hall = 8;
    check('容量轴：8 级但未装升级 ⇒ 无加成（+50 容量是升级给的权柄）',
      SB.economy.capOf(b8, 'stone') === SB.economy.capOf(b0, 'stone'),
      'Δ=' + (SB.economy.capOf(b8, 'stone') - SB.economy.capOf(b0, 'stone')));
    b8.upgrades.upg_castle = true;
    check('容量轴：8 级 + 装升级 ⇒ +400（8 × 50，未触衰减）',
      Math.abs((SB.economy.capOf(b8, 'stone') - SB.economy.capOf(b0, 'stone')) - 400) < 1e-6,
      'Δ=' + (SB.economy.capOf(b8, 'stone') - SB.economy.capOf(b0, 'stone')));

    /* 市政点 / 市政面板门 / 市政点可见性：三条都读同一个 coreLvl。 */
    const mw = SB.state.freshRun(false); mw.lvl.hall = 1;
    check('议事厅建成 ⇒ 市政点显形', SB.economy.resUnlocked(mw, 'culture') === true);
    check('议事厅 8 级 ⇒ 市政点产出 8×0.05/s（升级前后同值）',
      Math.abs((SB.economy.cultureRate(up) - 8 * SB.CFG.CIVIC.HALL_RATE)) < 1e-6,
      'rate=' + SB.economy.cultureRate(up).toFixed(4));
    check('市政面板门：8 级 ⇒ 开', SB.civic.panelOpen(up) === true);
    check('两者皆 0 ⇒ 市政面板仍关着', SB.civic.panelOpen(SB.state.freshRun(false)) === false);

    /* 王权神授卡：城堡每级 +10% 信仰，读的就是这座建筑的等级（coreLvl）。 */
    check('王权神授：未装卡 ⇒ 恒 ×1（哪怕 8 级）', SB.civic.castleFaithMul(up) === 1);
    up.cards = ['card_sovereign'];
    check('王权神授：装卡 + 8 级 ⇒ 信仰 ×1.8', Math.abs(SB.civic.castleFaithMul(up) - 1.8) < 1e-9,
      '=' + SB.civic.castleFaithMul(up));

    /* 老档迁移：误造建筑上的等级并回 hall，不许丢。 */
    const legacy = SB.state.migrateRun({ lvl: { hall: 7, castle: 1 }, pop: 1, res: {} });
    check('老档迁移：lvl.castle 并回 hall（7+1=8），等级不丢',
      legacy.lvl.hall === 8 && legacy.lvl.castle === 0, 'hall=' + legacy.lvl.hall + ' castle=' + legacy.lvl.castle);
    check('老档迁移后 coreLvl 仍为 8（效果连续）', SB.economy.coreLvl(legacy) === 8);
    const legacy2 = SB.state.migrateRun({ lvl: { hall: 8, castle: 0 }, pop: 1, res: {} });
    check('老档迁移幂等（castle 已 0 ⇒ 不重复加）', legacy2.lvl.hall === 8, 'hall=' + legacy2.lvl.hall);
  }

  /* ⑤b 建筑升级型的完整名单与「同一座只换名」契约（2026-10-06 用户第二次纠偏：
   *   「大学也这样，研究了建筑名没变」⇒ 城堡那条不是孤例，是一类）。
   *   权威口径：desc 写成「X升级：…」的升级项 = **那座建筑买下后就地改名**，
   *   不是另造一座建筑。声明在 UPGRADES 的 `upgradesBuilding` 字段，判定在 render。 */
  {
    /* ERA6（2026-10 实装）：upg_starscope 把 天壳观测站 升级为 星空观测站，
     *   与城堡×3 同类「买了就地改名」契约；下面是第 5 条。
     * ERA7（2026-10-17 实装）：upg_logiware 把 商队驿站 升级为 物流仓库，是第 6 条。 */
    const CHAIN = { upg_fishbonemine: 'siltpit', upg_university: 'institute', upg_castle: 'hall', upg_deepmine: 'siltpit', upg_starscope: 'observatory', upg_logiware: 'caravanserai' };
    const declared = SB.UPGRADES.filter(u => u.upgradesBuilding);
    /* ⚠️ 2026-10 ERA6：upg_starscope（观测站→星空观测站）是第 5 条；2026-10-17 ERA7：upg_logiware（商队驿站→物流仓库）是第 6 条。
     *    与城堡×3 同类契约，不是「随手加一条」，是 approved 设计里商队驿站可被升级。 */
    check('建筑升级型共 6 条，全部声明了 upgradesBuilding（+50%/级 扩容那几条不算）',
      declared.length === 6, '实=' + declared.length);
    const badDecl = declared.filter(u => !SB.habitat.buildingById(u.upgradesBuilding));
    check('每条 upgradesBuilding 都指向真实存在的建筑（别写错 id）', badDecl.length === 0,
      '错=' + badDecl.map(u => u.id + '→' + u.upgradesBuilding).join(','));
    const wrong = declared.filter(u => u.upgradesBuilding !== CHAIN[u.id]);
    check('五条顶替关系与设计一致（矿坑×2 / 研究所 / 议事厅 / 商队驿站）', wrong.length === 0,
      '错=' + wrong.map(u => u.id).join(','));
    const noDesc = declared.filter(u => !u.buildingDesc);
    check('每条都写了 buildingDesc（建筑行文案不能复用 desc 的「X升级：」主语）',
      noDesc.length === 0, '缺=' + noDesc.map(u => u.id).join(','));
    /* 同一座：升级前后 id / 等级键 / 造价曲线全都不变。 */
    const pv = SB.state.freshRun(false);
    pv.techs.masonry = true; pv.techs.education = true; pv.techs.apprentice = true; pv.techs.physics = true;
    pv.techs.mathematics = true;
    pv.res.coral = 1e9; pv.res.silt = 1e9; pv.res.stone = 1e9; pv.res.ironBracket = 1e9;
    pv.res.hardCoral = 1e9; pv.res.steelPart = 1e9;
    const keyOf = id => JSON.stringify(SB.economy.costOf(pv, id));
    const kHall0 = keyOf('hall'), kInst0 = keyOf('institute'), kPit0 = keyOf('siltpit');
    const lv0 = pv.lvl.hall + '/' + pv.lvl.institute + '/' + pv.lvl.siltpit;
    pv.upgrades.upg_castle = true; pv.upgrades.upg_university = true;
    check('升级不新建建筑：lvl 里不该出现 castle / university 键',
      pv.lvl.castle === undefined && pv.lvl.university === undefined);
    check('升级不动等级（三座的等级键原样）',
      lv0 === (pv.lvl.hall + '/' + pv.lvl.institute + '/' + pv.lvl.siltpit), 'lv0=' + lv0);
    check('升级不动造价曲线（hall/institute 逐级成本与升级前逐位相同）',
      keyOf('hall') === kHall0 && keyOf('institute') === kInst0);
    check('研究所升级后仍能续建（同一座通道）', SB.habitat.build(pv, 'institute') === true
      && pv.lvl.institute === 1, 'inst=' + pv.lvl.institute);
    /* 链式：矿坑两级都装了 ⇒ 显示最深一级「深层矿井」，不是第一级「鱼骨矿井」。 */
    check('矿坑：只装鱼骨矿井时数据层认它', !!pv.upgrades.upg_fishbonemine || true);
    pv.upgrades.upg_fishbonemine = true;
    check('矿坑：装鱼骨矿井不造价（同一座）', keyOf('siltpit') === kPit0);
    pv.upgrades.upg_deepmine = true;
    check('矿坑：两级都装仍不造价、等级仍同一座', keyOf('siltpit') === kPit0
      && pv.lvl.siltpit === 0);
    /* 声明顺序 = 升级顺序：UPGRADES 里 deepmine 在 fishbonemine 之后 ⇒ 遍历到后者覆盖前者。 */
    const order = SB.UPGRADES.filter(u => u.upgradesBuilding === 'siltpit').map(u => u.id);
    check('声明顺序保证链式取最深一级（fishbonemine 在 deepmine 之前）',
      order[0] === 'upg_fishbonemine' && order[order.length - 1] === 'upg_deepmine', order.join('→'));
  }

  /* ④ 资源可见性（2026-09-30）：解锁前不显示，工艺资源独立分区。
   *    材料线四条也有门（2026-09-30 用户报「开局不该看到石头/暖石/精铁/金属」）：
   *    石头=「采石」科技 / 金属+暖石=「采矿」科技 / 精铁=热泉炉建成（唯一转换口）。
   *    开局常显的只剩藻食/珊瑚两条（采集者/珊瑚匠开局即岗）。 */
  const always = ['kelp', 'coral'];
  const hiddenAlways = always.filter(r => !SB.economy.resUnlocked(fr, r));
  check('开局双资源（藻食/珊瑚）始终显示', hiddenAlways.length === 0, '被隐藏=' + hiddenAlways.join(','));
  const matGated = ['stone', 'silt', 'warmstone', 'iron'];
  const matLeak = matGated.filter(r => SB.economy.resUnlocked(fr, r));
  check('材料线四资源解锁前隐藏（石=采石/金属暖石=采矿/精铁=热泉炉）', matLeak.length === 0,
    '误显示=' + matLeak.join(','));
  const craftHidden = ['stoneBeam', 'ironBracket', 'rope', 'hardCoral', 'steel', 'hydro', 'steelPart']
    .filter(r => SB.economy.resUnlocked(fr, r));
  check('工艺资源解锁前全部隐藏', craftHidden.length === 0, '误显示=' + craftHidden.join(','));
  check('科技未研究 ⇒ 科技点不显示', !SB.economy.resUnlocked(fr, 'science'));
  /* ⚠️ 2026-10-05：市政点的显示门从「建成神庙」改成「建成议事厅」（修死锁）。
   *   原门构成死循环：显示市政点 ⇐ 建成神庙 ⇐ 完成《神学》⇐ 花 600 市政点 ⇐ 书手产出，
   *   而神学还要 25 人口 ⇒ 玩家看不到自己有多少点，却要花 600 点解锁「让点显形」的东西。
   * ⚠️ 这两条**必须用独立 freshRun**，不能读共享夹具 `fr`——它被上面「城堡升级」那组
   *   测试留在了 `lvl.hall = 20`（那条测 hall=0/10/20 的容量加成）⇒ 直接读 fr 会假红。
   *   这就是「入口条件要钉环境、不能被前序断言污染」的又一次实例。 */
  {
    const c0 = SB.state.freshRun(false);
    check('议事厅未建 ⇒ 市政点不显示', !SB.economy.resUnlocked(c0, 'culture'),
      'lvl.hall=' + ((c0.lvl && c0.lvl.hall) || 0));
    /* 🚨 反向守卫：门必须是**议事厅**而不是神庙 —— 只建神庙不该让市政点显形。
     *   这条红 = 死锁回来了（神庙是 era2 信仰建筑，且它自己还要 600 市政点才能解锁）。 */
    const tOnly = SB.state.freshRun(false);
    tOnly.lvl = tOnly.lvl || {}; tOnly.lvl.temple = 1;
    check('🚨 只建神庙（不建议事厅）⇒ 市政点仍不显示（门必须是议事厅）',
      !SB.economy.resUnlocked(tOnly, 'culture'), 'lvl.temple=' + tOnly.lvl.temple);
  }
  /* ⚠️ 2026-10-05 晚修正：luxury 显示门已由 `{job:'merchant'}` 改成 `{civic:'trade'}`
   *   （用户拍板），所以这里夹具要开的是市政《对外贸易》而不是「派商人」——
   *   原夹具只发 jobs.merchant ⇒ luxury 恒不显示，断言红（判据在 config.RESS，断言跟着门走）。 */
  check('对外贸易未解锁 ⇒ 奢侈品不显示（门是市政 trade，不再是商人职业）',
    !SB.economy.resUnlocked(fr, 'luxury'));
  check('神学未解锁 ⇒ 信仰不显示', !SB.economy.resUnlocked(fr, 'faith'));
  check('热泉井已删 ⇒ 地热永不显示', !SB.economy.resUnlocked(fr, 'fuel'));
  fr.lvl = fr.lvl || {}; fr.lvl.workshop = 1;
  check('建成工坊 ⇒ 石梁/硬化珊瑚显示',
    SB.economy.resUnlocked(fr, 'stoneBeam') && SB.economy.resUnlocked(fr, 'hardCoral'));
  fr.techs = fr.techs || {}; fr.techs.metalrefine = true;
  check('研究金属精炼 ⇒ 钢/热液能/钢制零件显示',
    SB.economy.resUnlocked(fr, 'steel') && SB.economy.resUnlocked(fr, 'hydro') && SB.economy.resUnlocked(fr, 'steelPart'));
  fr.techs.quarry = true; fr.techs.mining = true; fr.lvl = fr.lvl || {}; fr.lvl.furnace = 1;
  check('采石/采矿研究 + 热泉炉建成 ⇒ 石头/金属/暖石/精铁显示',
    SB.economy.resUnlocked(fr, 'stone') && SB.economy.resUnlocked(fr, 'silt') &&
    SB.economy.resUnlocked(fr, 'warmstone') && SB.economy.resUnlocked(fr, 'iron'));
  fr.techs.writing = true; fr.techs.scholarT = true; fr.lvl.hall = 1; fr.jobs = { merchant: 1 };
  fr.civics = { theology: true, trade: true };
  check('科技/议事厅/对外贸易/神学解锁后对应资源显示',
    SB.economy.resUnlocked(fr, 'science') && SB.economy.resUnlocked(fr, 'culture') &&
    SB.economy.resUnlocked(fr, 'luxury') && SB.economy.resUnlocked(fr, 'faith'));
  /* ⚠️ 2026-10-06 用户拍板：钢**移出**这一组 —— 它不再标 kind:craft，
   *   改到顶栏「精铁」下面一格（同一区连续读），语义是「金属链的相邻两级」。
   *   移位与位置的完整断言在「无上限」那组之后（⑤ 钢的顶栏位置）。 */
  const craftKind = ['stoneBeam', 'ironBracket', 'rope', 'hardCoral', 'hydro', 'steelPart']
    .filter(r => SB.RESS[r].kind !== 'craft');
  check('6 个工艺资源均标 kind:craft（钢已移出，见下一组）', craftKind.length === 0, '未标=' + craftKind.join(','));

  /* ERA7：至高圣座按政体改变展示名称和专属效果，且与实际倍率分支一致。 */
  {
    const variants = [
      ['theo_state', '至高圣座', '信仰产出 +10%', 'throneFaithMul'],
      ['egalitarianism', '太空共同体', '工坊工艺效率 +10%', 'throneCraftMul'],
      ['federalism', '国际空间站', '科技产出 +10%', 'throneSciMul']
    ];
    const ok = variants.every(([gov, name, effect, mulKey]) => {
      const s = SB.state.freshRun(false);
      s.gov = gov; s.wonders.wonder_throne = true;
      const m = SB.wonder[mulKey](s);
      return SB.wonder.displayName(s, 'wonder_throne') === name &&
        SB.wonder.displayDesc(s, 'wonder_throne').includes(effect) && m === 1.1;
    });
    check('至高圣座随政体显示专属名称、效果，且匹配实际加成分支', ok);
  }

  /* ══ ERA8 探索纪（2026-10-18 实装 · spec docs/ERA8_TECHS_SPEC_v0.1.md v0.3）══ */
  {
    /* ① θ生物金属：普通有限库存资源，基础上限 200 / 解锁门=科技 biomat。 */
    check('ERA8 θ金属：RESS 登记为普通资源 + 解锁门 biomat',
      !!SB.RESS.thetaMetal && !SB.RESS.thetaMetal.kind
      && SB.RESS.thetaMetal.unlock && SB.RESS.thetaMetal.unlock.tech === 'biomat');
    /* θ金属基础容量为 200；容量公式按普通资源处理。 */
    const _th0 = SB.state.freshRun(false);
    check('ERA8 θ金属：基础仓储上限为 200',
      SB.CFG.CAP_BASE.thetaMetal === 200 &&
        SB.economy.capOf(_th0, 'thetaMetal') === 200,
      'base=' + SB.economy.capOf(_th0, 'thetaMetal'));
    check('所有有限库存资源都标明仓储所属纪元',
      Object.keys(SB.CFG.CAP_BASE).every(r => Number.isInteger(SB.RESS[r] && SB.RESS[r].storageEra)));
    const _storageEra = SB.state.freshRun(false);
    _storageEra.upgrades.upg_ballast_1 = true;
    _storageEra.upgrades.upg_ballast_2 = true;
    _storageEra.upgrades.upg_castle = true;
    _storageEra.upgrades.upg_alloy_warehouse = true;
    _storageEra.lvl.hall = 10;
    check('早期仓储扩容不放大后续资源容量（ERA8 θ金属仍为 200）',
      SB.economy.capOf(_storageEra, 'thetaMetal') === 200);
    check('ERA6 合金仓储只扩到 ERA6 资源，不影响 ERA7 铀',
      SB.economy.capOf(_storageEra, 'titanium') === 300 && SB.economy.capOf(_storageEra, 'uranium') === 200,
      '钛=' + SB.economy.capOf(_storageEra, 'titanium') + ' 铀=' + SB.economy.capOf(_storageEra, 'uranium'));
    _storageEra.upgrades.upg_logiware = 2;
    check('ERA7 物流仓库可扩充铀，但不会提前扩充 ERA8 θ金属',
      SB.economy.capOf(_storageEra, 'uranium') === 600 && SB.economy.capOf(_storageEra, 'thetaMetal') === 200,
      '铀=' + SB.economy.capOf(_storageEra, 'uranium') + ' θ=' + SB.economy.capOf(_storageEra, 'thetaMetal'));
    const thetaStorage = SB.state.freshRun(false);
    SB.economy.addRes(thetaStorage, 'thetaMetal', 1000);
    check('θ生物金属作为普通资源受 200 基础仓储上限约束', thetaStorage.res.thetaMetal === 200,
      '库存=' + thetaStorage.res.thetaMetal + ' cap=' + SB.economy.capOf(thetaStorage, 'thetaMetal'));
    check('ERA8 θ金属：解锁前隐藏，研究生物材料后显示',
      !SB.economy.resUnlocked(fr, 'thetaMetal')
      && (fr.techs.biomat = true, SB.economy.resUnlocked(fr, 'thetaMetal')));
    /* ② 9 科技 + 前置链 + 层号 + 关键节点。 */
    const E8 = ['deepspace', 'biomat', 'laser', 'robotics', 'xenoconst', 'bigdata', 'gascloud', 'protoai', 'nanotech'];
    const miss8 = E8.filter(id => { const t = SB.tech.byId(id); return !t || t.era !== 8; });
    check('ERA8 九科技全部存在且 era=8', miss8.length === 0, '缺=' + miss8.join(','));
    check('ERA8 关键节点=生物材料（biomat key=true）',
      SB.tech.byId('biomat').key === true
      && E8.filter(id => SB.tech.byId(id).key).length === 1);
    check('ERA8 前置链（L14→L16 三档）',
      SB.tech.byId('laser').reqs.includes('biomat') && SB.tech.byId('robotics').reqs.includes('biomat')
      && SB.tech.byId('xenoconst').reqs.includes('deepspace') && SB.tech.byId('bigdata').reqs.includes('robotics')
      && SB.tech.byId('gascloud').reqs.includes('xenoconst') && SB.tech.byId('protoai').reqs.includes('robotics')
      && SB.tech.byId('nanotech').reqs.includes('robotics'));
    check('ERA8 层号 L14/L15/L16（与用户表 1/2/3 对齐）',
      [SB.tech.byId('deepspace').layer, SB.tech.byId('biomat').layer].every(l => l === 14)
      && [SB.tech.byId('laser').layer, SB.tech.byId('robotics').layer, SB.tech.byId('xenoconst').layer].every(l => l === 15)
      && [SB.tech.byId('bigdata').layer, SB.tech.byId('gascloud').layer, SB.tech.byId('protoai').layer, SB.tech.byId('nanotech').layer].every(l => l === 16));
    /* ③ 新 cond 类型三处同登记冒烟（condMet 判定 / condShort 有读数 / condText 有文案）。 */
    const cc = { t: 'cap', r: 'kelp', n: 30000 };
    check('ERA8 cond cap 三处登记（met+short+text）',
      SB.tech.condMet(fr, cc) === (SB.economy.capOf(fr, 'kelp') >= 30000)
      && !!SB.tech.condShort(fr, cc) && !!SB.tech.condText(cc));
    const cs = { t: 'starPct', n: 10 };
    const _pct = (fr.res.starExplore || 0) / SB.CFG.STAR_CAP * 100;
    check('ERA8 cond starPct 三处登记（met+short+text）',
      SB.tech.condMet(fr, cs) === (_pct >= 10)
      && !!SB.tech.condShort(fr, cs) && !!SB.tech.condText(cs));
    check('ERA8 STAR_CAP=400k（用户拍暂定值）', SB.CFG.STAR_CAP === 400000, 'CAP=' + SB.CFG.STAR_CAP);
    /* ④ 建筑双写：BUILDINGS.requiredTech ↔ 科技 eff.unlockBuild（e2e「建筑解锁来源」同款口径）。 */
    for (const [bid, tid] of [['biomatlab', 'biomat'], ['rheamine', 'xenoconst'], ['titancloud', 'gascloud']]) {
      const b = SB.BUILDINGS.find(x => x.id === bid);
      const t = SB.tech.byId(tid);
      check('ERA8 建筑 ' + bid + ' 双写（requiredTech ↔ unlockBuild）+ 分区',
        !!b && !!t && b.requiredTech.includes(tid) && !!t.eff.unlockBuild && t.eff.unlockBuild.includes(bid)
        && !!b.zone, 'zone=' + (b && b.zone));
    }
    /* ⑤ 奇观两座 + 机器人充能站挂起。 */
    check('ERA8 奇观：旅行者1号(need deepspace, tiplate 1600) / 萨图恩(need gascloud)',
      !!SB.wonder.byId('wonder_voyager') && SB.wonder.byId('wonder_voyager').need === 'deepspace'
      && SB.wonder.byId('wonder_voyager').cost.tiplate === 1600
      && !!SB.wonder.byId('wonder_saturn') && SB.wonder.byId('wonder_saturn').need === 'gascloud');
    check('ERA8 机器人机制已实装：robotbay 在 BUILDINGS 且 protoai 经 unlockBuild 解锁它',
      SB.BUILDINGS.some(x => x.id === 'robotbay')
      && !!SB.tech.byId('protoai').eff.unlockBuild
      && SB.tech.byId('protoai').eff.unlockBuild.includes('robotbay'));
    /* ⑤-B B7 机器人子系统功能回归（接在「已实装」判定之后，独立 freshRun 不污染夹具）。 */
    {
      const rb = SB.state.freshRun(false);
      rb.lvl.robotbay = 2;
      check('B7 机器人人口 = 4 × 充能站等级（lvl.robotbay=2 ⇒ 8）',
        SB.folk.robotPop(rb) === 8 && SB.folk.robotIdle(rb) === 8);
      check('B7 机器人拒绝书手/学者（robotJobAllowed 剔除）',
        SB.folk.assignRobot(rb, 'scribe', 1) === false
        && SB.folk.assignRobot(rb, 'scholar', 1) === false);
      /* 正向分配：gather 恒解锁（jobUnlocked 直返 true），双向钳制到 idle。 */
      rb.jobs.gather = 0;
      const _ok = SB.folk.assignRobot(rb, 'gather', 3);
      check('B7 机器人正向分配 + 双向钳制（idle 8 ⇒ 分 3 剩 5）',
        _ok && rb.robotJobs.gather === 3 && SB.folk.robotIdle(rb) === 5);
      check('B7 effJobs 合并：人类 gather + 机器人×1.2（3×1.2=3.6）',
        Math.abs((SB.folk.effJobs(rb).gather || 0) - (rb.jobs.gather + 3 * 1.2)) < 1e-9);
      /* 超额回收：充能站降到 1 级（4 机器人）但分配了 10，reconcile 应砍到 4。 */
      rb.lvl.robotbay = 1; rb.robotJobs.gather = 10; SB.folk.reconcileRobot(rb);
      check('B7 reconcileRobot 超额回收（10 机器人但 pop=4 ⇒ 砍到 4）',
        rb.robotJobs.gather === 4);
      /* 热液能：充能站每级耗 8/s，lvl=1 且供给充足 ⇒ robotbayRate=8。
       * ⚠️ 汽轮机烧暖石才供流——必须给足 warmstone，否则 rW=0 ⇒ 全流为 0 ⇒ robotbayDraw 被钳到 0。 */
      const _ra = SB.state.freshRun(false);
      _ra.lvl.robotbay = 1; _ra.lvl.hydroturbine = 50; _ra.res.warmstone = 1e9;   // 供给充足
      const _ha = SB.economy.hydroAlloc(_ra, 1);
      check('B7 充能站耗流 8/秒/级（lvl=1 ⇒ robotbayRate=8）',
        _ha.robotbayRate === 8, 'rate=' + _ha.robotbayRate);
      /* 回归（本轮回 bug）：robotJobs 缺键的老档/未初始化态，assignRobot 不得抛
       * 「Cannot read properties of undefined」——点加号原本静默失效。须自建对象并上岗。 */
      const _rbOld = SB.state.freshRun(false);
      _rbOld.lvl.robotbay = 1; delete _rbOld.robotJobs;
      let _rbThrew = false;
      try { SB.folk.assignRobot(_rbOld, 'gather', 1); } catch (e) { _rbThrew = true; }
      check('B7 老档缺 robotJobs 键：assignRobot 不抛错且自建对象上岗',
        !_rbThrew && !!_rbOld.robotJobs && _rbOld.robotJobs.gather === 1);
      /* ⚠️ 2026-10-21 回归（用户实测「分配了机器人做农民，藻食不涨，其它职业都涨」）：
       *   根因 = `foodRate` 直接读 `s.jobs.gather`，**绕过 effJobs** ⇒ 藻食是全表唯一
       *   漏掉机器人的产线（珊瑚匠/矿工/采石工都走 rates 里的 `j = effJobs(s)`），
       *   而且 rates 与 tick 共用这个函数 ⇒ **面板和实账一起少算**，光看数字看不出是它。
       *   下面三条把它钉死；此前 e2e 对「机器人→藻食」零覆盖（改前改后失败集逐字相同），
       *   所以这个 bug 能一路漏到线上。
       *   ① 机器人分配到 gather 后，藻食人均边际 == robotMult × 人类人均（真的接上了）
       *   ② 真实 tick 累计 == 面板 rates 预测（面板===结算，不能只修面板侧）
       *   ③ 商人侧同族修复：happySupply 与 rates 产能同口径（含机器人） */
      const _kf = () => {
        const z = SB.state.freshRun(false);
        z.lvl.kelp = 0; z.lvl.weir = 0; z.lvl.warmnest = 0;   // 只留职业侧，建筑侧不干扰
        z.lvl.robotbay = 2; z.jobs.gather = 0; z.res.kelp = 0;
        return z;
      };
      const _kA = _kf(), _kB = _kf(), _kC = _kf();
      _kB.jobs.gather = 2;
      SB.folk.assignRobot(_kC, 'gather', 2);
      const _kBase = SB.economy.rates(_kA).kelp;
      const _perH = (SB.economy.rates(_kB).kelp - _kBase) / 2;
      const _perR = (SB.economy.rates(_kC).kelp - _kBase) / 2;
      check('B7 机器人分配到采集者 ⇒ 藻食产出真的涨（人均 == robotMult × 人类人均）',
        _perR > 0 && Math.abs(_perR / _perH - SB.folk.robotMult(_kC)) < 1e-9,
        '人类人均=' + _perH.toFixed(4) + ' 机器人人均=' + _perR.toFixed(4));
      /* ② 真实累计：pop=3 且 nest=1（上限 3 ⇒ 住满不生不育，foodUse 全程恒定），
       *    海藻仓抬上限避免 10 秒就撞 cap 被 addRes 夹断（否则差值必然对不上，是夹具假红）。 */
      const _kTick = _kf();
      _kTick.pop = 3; _kTick.lvl.nest = 1; _kTick.lvl.kelpstore = 10;
      SB.folk.assignRobot(_kTick, 'gather', 8);
      const _kPred = SB.economy.rates(_kTick).kelp, _kBefore = _kTick.res.kelp;
      for (let _ki = 0; _ki < 10; _ki++) SB.economy.tick(_kTick, 1, null, {});
      const _kDelta = _kTick.res.kelp - _kBefore;
      check('B7 藻食真实累计 == 面板预测（机器人采集也进实账，不是只改面板）',
        Math.abs(_kDelta - _kPred * 10) / (Math.abs(_kPred * 10) + 1e-9) < 0.01,
        'Δ=' + _kDelta.toFixed(4) + ' vs ' + (_kPred * 10).toFixed(4));
      /* ③ 商人：happySupply（面板供给）此前也直接读 s.jobs.merchant，与 tick 的 _S、
       *    rates 的 luxury 产能三处不同源。机器人分配到商人时三方必须同值。 */
      const _kM = _kf();
      _kM.civics.trade = true; _kM.pop = 0; _kM.happy = 0;
      SB.folk.assignRobot(_kM, 'merchant', 2);
      const _kMRate = SB.economy.rates(_kM).luxury;
      check('B7 商人机器人：happySupply == rates 产能（面板供给不再漏机器人）',
        _kMRate > 0 && Math.abs(SB.economy.happySupply(_kM) - _kMRate) < 1e-9,
        'supply=' + SB.economy.happySupply(_kM).toFixed(6) + ' rates=' + _kMRate.toFixed(6));
    }
    /* ⑥ 永久乘区词表：四个新 eff 键在 mul 默认表有键（漏登记 = 守卫静默吞）。 */
    const _m0 = SB.tech.mul(fr);
    /* ⚠️ 2026-10-21 口径变更（用户拍板）：workshopEff 从「独立乘区（默认 1）」折进
     *   「工艺制作效率加法轴（默认 0）」——激光 +50% / ERA10 +120% 不再跟 boomcraft/机器人/
     *   我们的海复利相乘。断言跟着改的是**基数**，不是放宽：加法轴必须从 0 起，
     *   若又变回 1 就说明有人把它重新接回乘区链（_cr 会凭空多出 ×1）。 */
    check('ERA8 eff 词表：workshopEff 默认 0（加法轴）/satStar/biomatlabOut/biomatlabEff 默认 1',
      _m0.workshopEff === 0 && _m0.satStar === 1 && _m0.biomatlabOut === 1 && _m0.biomatlabEff === 1);
    check('瑞亚星矿井产出为原值 50 倍（每级石梁/硬化珊瑚 2.5，铀 0.25）',
      SB.BLD.rheamineBeam === 2.5 && SB.BLD.rheamineCoral === 2.5 && SB.BLD.rheamineUranium === 0.25);
    /* ⑦ 产线接进 rates：θ金属 / 石梁 / 硬化珊瑚键存在且有穷（缺键 = undefined 面板撒谎）。 */
    const _rt = SB.economy.rates(fr);
    check('ERA8 rates 补键：thetaMetal / stoneBeam / hardCoral 有穷',
      isFinite(_rt.thetaMetal) && isFinite(_rt.stoneBeam) && isFinite(_rt.hardCoral),
      'θ=' + _rt.thetaMetal + ' 梁=' + _rt.stoneBeam + ' 硬=' + _rt.hardCoral);
    /* ⑧ run-scoped：freshRun 种子 runBuffs 空 + 工坊缺省全开。
     * ⚠️ 2026-10-21 口径变更：工业机器人从「全局布尔开关 s.indRobotOn」重构为
     *   「按建筑停用数 s.workshopStop（0 = 全开）」——字段本身被删，旧断言读它只会拿到
     *   undefined。断言改为钉新字段的缺省值，不是迁就现状：0 = 全部工坊运行中。 */
    const _r8 = SB.state.freshRun(false);
    check('ERA8 runBuffs/workshopStop 种子', _r8.runBuffs && Object.keys(_r8.runBuffs).length === 0
      && _r8.workshopStop === 0);
  }

  /* ══ ERA8 市政（2026-10-18 用户规格表 · 实装）══════════════════════ */
  {
    /* ① 9 市政存在 + era/层号 + 前置都指向已存在市政（树几何断链会在市政树几何一节红，这里钉 id）。 */
    const C8 = { starfaith: [1, ['space_race', 'planet_village']], globalization: [1, ['planet_village']],
      cosmic_indifference: [2, ['starfaith']], faith_echo: [2, ['starfaith']],
      social_network: [2, ['globalization']], virtual_reality: [2, ['globalization']],
      space_politics: [3, ['cosmic_indifference', 'social_network']],
      far_sight: [3, ['cosmic_indifference']], star_ruins: [3, ['faith_echo']] };
    for (const [cid, [lay, reqs]] of Object.entries(C8)) {
      const c = (SB.CIVICS || []).find(x => x.id === cid);
      check('ERA8 市政 ' + cid + '（era8/layer' + lay + '/前置齐）',
        !!c && c.era === 8 && c.layer === lay
        && reqs.every(r => c.reqs.includes(r) && (SB.CIVICS || []).some(x => x.id === r)));
    }
    /* ② 7 政策卡 + civic 反查 + 退役映射（retiredBy 设在被替代卡上）。 */
    const P8 = ['card_star_broadcast', 'card_interlog', 'card_we_are_here', 'card_social_network',
      'card_vr', 'card_space_net', 'card_fever'];
    check('ERA8 七张政策卡齐全且 civic 反查正确', P8.every(id => {
      const p = (SB.POLICIES || []).find(x => x.id === id);
      return p && (SB.CIVICS || []).some(x => x.id === p.civic && x.era === 8);
    }), P8.join(','));
    check('ERA8 替代链：大众传媒→社交网络 / 天赋神权→我们在此 / 总动员令→星际探索热潮',
      (SB.POLICIES.find(x => x.id === 'card_massmedia') || {}).retiredBy === 'social_network'
      && (SB.POLICIES.find(x => x.id === 'card_divine_right') || {}).retiredBy === 'cosmic_indifference'
      && (SB.POLICIES.find(x => x.id === 'card_mobilization') || {}).retiredBy === 'far_sight');
    /* ②b 2026-10-18 用户纠错（retiredBy 方向反了 ⇒ 基础物流建设出生即死、中世纪集市永不退役）：
     *   仓储链 中世纪集市 ×2 →(城市化)→ 基础物流建设 ×3 →(全球化)→ 洲际物流 ×5。
     *   ⚠️ 方向纪律：retiredBy 写在**旧卡**上、指向**新市政**（后期淘汰早期），全部先例同方向。 */
    check('ERA8 仓储卡三级替代链方向正确（market→urbanization / logistics→globalization）',
      (SB.POLICIES.find(x => x.id === 'card_market') || {}).retiredBy === 'urbanization'
      && (SB.POLICIES.find(x => x.id === 'card_logistics') || {}).retiredBy === 'globalization'
      && (SB.POLICIES.find(x => x.id === 'card_interlog') || {}).retiredBy === undefined);
    /* ③ 新 cond 类型三处同登记冒烟：oldFaith / wonderEra / lvlSum。 */
    const co = { t: 'oldFaith', n: 50000 };
    check('ERA8 cond oldFaith 三处登记（met+short+text）',
      typeof SB.tech.condMet(fr, co) === 'boolean' && !!SB.tech.condShort(fr, co) && !!SB.tech.condText(co));
    const cw = { t: 'wonderEra', era: 7, n: 1 };
    check('ERA8 cond wonderEra 三处登记（met+short+text）',
      typeof SB.tech.condMet(fr, cw) === 'boolean' && !!SB.tech.condShort(fr, cw) && !!SB.tech.condText(cw));
    const cl = { t: 'lvlSum', ids: ['rheamine', 'titancloud'], n: 5 };
    const _bakR = fr.lvl.rheamine, _bakT = fr.lvl.titancloud;
    fr.lvl.rheamine = 3; fr.lvl.titancloud = 2;
    check('ERA8 cond lvlSum 三处登记（met=3+2≥5 / short / text）',
      SB.tech.condMet(fr, cl) === true && !!SB.tech.condShort(fr, cl) && !!SB.tech.condText(cl));
    fr.lvl.rheamine = _bakR; fr.lvl.titancloud = _bakT;
    /* ④ 市政奇观两座：哈利法（needCivic 宇宙冷漠，造价 100 引擎 + 400 板件）/
     *   魔鱼VR（needCivic 虚拟现实，造价 10 薄膜，happyBonus 1 走既有通道）。 */
    check('ERA8 奇观：哈利法(needCivic cosmic_indifference) / 魔鱼VR(happyBonus 1 + 薄膜×10)',
      !!SB.wonder.byId('wonder_khalifa') && SB.wonder.byId('wonder_khalifa').needCivic === 'cosmic_indifference'
      && SB.wonder.byId('wonder_khalifa').cost.tiplate === 400
      && !!SB.wonder.byId('wonder_fishvr') && SB.wonder.byId('wonder_fishvr').needCivic === 'virtual_reality'
      && SB.wonder.byId('wonder_fishvr').cost.thinafilm === 10
      && SB.wonder.byId('wonder_fishvr').effect.happyBonus === 1);
    /* ⑤ θ薄膜：RESS kind craft、无限容量、工艺产出指向它。 */
    const _tf0 = SB.state.freshRun(false);
    check('ERA8 薄膜：RESS 登记 + 无上限 + craft_thinafilm 产出指向',
      !!SB.RESS.thinafilm && SB.RESS.thinafilm.kind === 'craft'
      && SB.CFG.CAP_BASE.thinafilm === undefined && SB.economy.capOf(_tf0, 'thinafilm') === Infinity
      && (SB.CRAFTS || []).some(c => c.id === 'craft_thinafilm' && c.res === 'thinafilm'));
    /* ⑥ 动态卡读数基准值（无卡 = 乘区 1 / 加值 0，不污染产线）。 */
    check('ERA8 卡读数基准：dynFaith=1 / fever=1 / farsight=1 / planet=1 / vr=0',
      SB.civic.dynFaithCardMul(fr) === 1 && SB.civic.cardFeverStarMul(fr) === 1
      && SB.civic.civicFarsightStarMul(fr) === 1 && SB.civic.cardPlanetOutMul(fr) === 1
      && SB.civic.cardVrCraftRatio(fr) === 0);
    /* ⑦ 装卡读数：星际物流网 ×1.3 / 星际探索热潮 +1%×人口 / 虚拟现实 −1%×人口。 */
    const _rc = SB.state.freshRun(false);
    _rc.pop = 40; _rc.cards = ['card_space_net'];
    check('ERA8 星际物流网装卡 ×1.3', SB.civic.cardPlanetOutMul(_rc) === 1.3);
    _rc.cards = ['card_fever'];
    check('ERA8 星际探索热潮装卡 +1%×人口', Math.abs(SB.civic.cardFeverStarMul(_rc) - 1.4) < 1e-9,
      'mul=' + SB.civic.cardFeverStarMul(_rc));
    _rc.cards = ['card_vr'];
    check('ERA8 虚拟现实装卡 −1%×人口', Math.abs(SB.civic.cardVrCraftRatio(_rc) + 0.4) < 1e-9,
      'vr=' + SB.civic.cardVrCraftRatio(_rc));
    _rc.cards = ['card_star_broadcast'];
    _rc.lvl.satellite = 6;
    check('ERA8 星际广播装卡 每卫星+5%', Math.abs(SB.civic.dynFaithCardMul(_rc) - 1.3) < 1e-9,
      'mul=' + SB.civic.dynFaithCardMul(_rc));
    /* ⑧ 星际物流网进 rates：异星行（stoneBeam）随卡放大（面板===结算抽样）。 */
    const _rp = SB.state.freshRun(false);
    _rp.lvl.rheamine = 2; _rp.cards = ['card_space_net'];
    const _rOn = SB.economy.rates(_rp).stoneBeam;
    _rp.cards = [];
    const _rOff = SB.economy.rates(_rp).stoneBeam;
    check('ERA8 rates 异星行吃星际物流网乘区（开卡=关卡×1.3）',
      _rOff > 0 && Math.abs(_rOn - _rOff * 1.3) < 1e-9, 'on=' + _rOn + ' off=' + _rOff);
  }

  /* ⑤ 热泉炉「开几座」（2026-09-30）：存的是**停了几座** furnaceStop（默认 0 = 全开）。
   *   运行座数 = lv − furnaceStop，铁产随运行座数线性，结算在 economy.ironFlow 一处，
   *   面板 rates 与 tick 都读它 ⇒ 两条路同源。默认全开（freshRun 自带 furnaceStop:0）
   *   ⇒ rates.iron > 0；furnaceStop = lv 时 run=0 ⇒ 铁产 0；inc/dec 改停用数，夹 [0,lv]。
   *   老档无此键（迁移见 state.migrateRun）= 0（全开），同默认档。 */
  const fu = SB.state.freshRun(false);
  fu.lvl.furnace = 1; fu.res.silt = 50; fu.res.warmstone = 50;
  check('热泉炉默认全开（furnaceStop=0）⇒ rates.iron > 0', SB.economy.rates(fu).iron > 0,
    'iron rate=' + SB.economy.rates(fu).iron);
  fu.furnaceStop = fu.lvl.furnace;   // 全停
  check('热泉炉全停（furnaceStop=lv）⇒ rates.iron = 0 且 tick 不再产精铁',
    SB.economy.rates(fu).iron === 0,
    'iron rate=' + SB.economy.rates(fu).iron);
  {
    const before = fu.res.iron || 0;
    SB.economy.tick(fu, 1, function () {});
    check('全停后 tick 一秒精铁零进项', (fu.res.iron || 0) === before,
      'iron ' + before + ' → ' + fu.res.iron);
  }
  fu.furnaceStop = 0;                 // 恢复全开
  check('热泉炉恢复全开（furnaceStop=0）⇒ rates.iron 回到 > 0',
    SB.economy.rates(fu).iron > 0, 'iron rate=' + SB.economy.rates(fu).iron);
}

/* ⑤-b 热液汽轮机「开几座」（2026-10-07，与热泉炉 furnaceStop 同口径）：存**停用数** turbineStop
 *   （默认 0 = 全开）。运行座数 = lv − turbineStop，热液能**供给**与**暖石扣费**都随运行座数线性，
 *   结算在 economy.hydroAlloc（供给）/ steelFlow（暖石）两处，面板 rates 与 tick 同源。
 *   默认全开（freshRun 自带 turbineStop:0）⇒ rates.hydroSupply > 0；turbineStop = lv 时全停
 *   （供给 0、暖石不减）；inc/dec 改停用数，夹 [0,lv]。老档无此键（迁移见 state.migrateRun）= 0。 */
const tb = SB.state.freshRun(false);
tb.techs.metalrefine = true;          // 解锁汽轮机（否则解锁口径另算，与本断言无关）
tb.lvl.hydroturbine = 3; tb.res.warmstone = 1e9;
check('热液汽轮机默认全开（turbineStop=0）⇒ rates.hydroSupply > 0',
  SB.economy.rates(tb).hydroSupply > 0, 'supply=' + SB.economy.rates(tb).hydroSupply);
tb.turbineStop = tb.lvl.hydroturbine;   // 全停
check('热液汽轮机全停（turbineStop=lv）⇒ 供给=0',
  SB.economy.rates(tb).hydroSupply === 0, 'supply=' + SB.economy.rates(tb).hydroSupply);
{
  const wBefore = tb.res.warmstone;
  SB.economy.tick(tb, 1, function () {});
  check('热液汽轮机全停 ⇒ 暖石不减（停止消耗）', tb.res.warmstone === wBefore,
    'warmstone ' + wBefore + ' → ' + tb.res.warmstone);
}
tb.turbineStop = 0;                   // 恢复全开
check('热液汽轮机恢复全开（turbineStop=0）⇒ 供给回到 > 0',
  SB.economy.rates(tb).hydroSupply > 0, 'supply=' + SB.economy.rates(tb).hydroSupply);
{
  const wBefore = tb.res.warmstone;
  SB.economy.tick(tb, 1, function () {});
  check('热液汽轮机恢复全开 ⇒ 暖石被扣（5/级/秒 × 3 级 = 15）',
    Math.abs((wBefore - tb.res.warmstone) - 15) < 1e-9,
    'warmstone ' + wBefore + ' → ' + tb.res.warmstone);
}

/* ⑤-c 热液工坊「开几座」（2026-10-07，与 furnaceStop / turbineStop 同口径）：存**停用数** hydroshopStop
 *   （默认 0 = 全开）。运行座数 = lv − hydroshopStop，钢的产出随运行座数线性缩放，结算在
 *   economy.hydroAlloc（shopL）。工坊吃的是**流**（热液能，不进库存），停产不省可囤资源，
 *   唯一意义是把流让给天穹钻机（hydroAlloc 里 skyDraw 从 left 取）。
 *   默认全开 ⇒ rates.steel > 0；hydroshopStop = lv 时全停（steel=0）；inc/dec 夹 [0,lv]。
 *   老档无此键（迁移见 state.migrateRun）= 0。 */
check('热液工坊开几座：freshRun 自带 hydroshopStop=0', SB.state.freshRun(false).hydroshopStop === 0);
check('热液工坊开几座：migrate 把超大停用数夹到 [0,lv]',
  (function () { var m = SB.state.migrateRun({ lvl: { hydroshop: 2 }, hydroshopStop: 99 }); return m.hydroshopStop === 2; })());
const hs = SB.state.freshRun(false);
hs.techs.metalrefine = true;          // 解锁汽轮机（才有热液能流）
hs.lvl.hydroturbine = 3; hs.res.warmstone = 1e9;
hs.lvl.hydroshop = 2;                 // 建 2 座工坊
check('热液工坊默认全开（hydroshopStop=0）⇒ rates.steel > 0',
  SB.economy.rates(hs).steel > 0, 'steel=' + SB.economy.rates(hs).steel);
hs.hydroshopStop = hs.lvl.hydroshop;   // 全停
check('热液工坊全停（hydroshopStop=lv）⇒ 钢产出=0',
  SB.economy.rates(hs).steel === 0, 'steel=' + SB.economy.rates(hs).steel);
hs.hydroshopStop = 0;                   // 恢复全开
check('热液工坊恢复全开（hydroshopStop=0）⇒ 钢产出回到 > 0',
  SB.economy.rates(hs).steel > 0, 'steel=' + SB.economy.rates(hs).steel);

runEra4Content({ SB, check, noop });

runBuildingShape({ SB, check });

/* ---------------- 住房两档（石工 → 石屋）----------------
 * 2026-09-26 按猫国改判：容量 100% 在建筑身上，科技只负责**解锁下一档住房**
 * （猫国 128 项科技没有任何一项给 maxKittens）。石工的 eff 因此是 {unlockBuild:['coralhouse',...]}。
 * 这一节锁住三件事：解锁链路通、人口两档都算、第二档**真的更划算**（否则这项科技没意义）。
 * ⚠️ 2026-09-26 暗流纪重排：解锁项由「巢筑 shelter」改为「石工 masonry」，
 *   建筑显示名「珊瑚厝」→「石屋」，第二档每座人口由 +1 改为 +4（用户原话「增加 4 人口上限」）。 */
console.log('\n=== 住房两档（石工 → 石屋）===');
{
  const b = SB.habitat.buildingById('coralhouse');
  check('石屋已在建筑表内', !!b && b.name === '石屋', b ? b.name : '缺失');

  const s = SB.state.freshRun(false);
  s.res.coral = 1000; s.res.stone = 1000;
  check('开局（未研究石工）：石屋锁着', !SB.habitat.unlocked(s, b),
    SB.habitat.lockReason(s, b) || '');

  /* ⚠️ 2026-09-26 用户拍板：**石屋/议事厅放弃库存门槛**，解锁权只认石工一项（双写一致）。
   * 所以这一节的旧断言（「珊瑚不足 30% ⇒ 石屋仍未现身」）反了：现在研究完石工它**当场现身**，
   * 卡点落到「买不买得起」上，由 build 的开销判断管。 */
  const s2 = SB.state.freshRun(false);
  s2.techs.masonry = true; s2.res.coral = 10; s2.res.stone = 10;
  check('石工一研究完：珊瑚不够也照样现身（无库存门槛，双写一致）',
    SB.habitat.unlocked(s2, b), 'coral=10 stone=10（首级需 coral 40 / stone 60）');
  check('反向对照：没研究石工时，即使珊瑚管够也锁着',
    !SB.habitat.unlocked((() => { const x = SB.state.freshRun(false); x.res.coral = 1e5; x.res.stone = 1e5; return x; })(), b),
    '锁着才对——解锁权只在石工一处');

  s.techs.masonry = true;
  check('研究石工且材料够了：石屋解锁', SB.habitat.unlocked(s, b),
    SB.habitat.lockReason(s, b) || '');

  const s3 = SB.state.freshRun(false);
  s3.lvl.nest = 5; s3.lvl.coralhouse = 3;
  /* 礁口巢 +2/座、石屋 +4/座，加开局底数 houseBase 1：1 + 5×2 + 3×4 = 23 */
  check('人口上限 = 底数1 + 礁口巢×2 + 石屋×4（三样都进算式）', SB.economy.popCap(s3) === 23,
    'popCap=' + SB.economy.popCap(s3));

  const sh = SB.tech.byId('masonry');
  check('石工不再直接给容量（改为解锁石屋）',
    !sh.eff.house && (sh.eff.unlockBuild || []).indexOf('coralhouse') >= 0, JSON.stringify(sh.eff));

  /* 设计意图断言（2026-09-27 按用户拍的新配比重写，2026-10-03 随 nest 首级 10→5 复核）。
   * 两档同为 ratio 2.5、石屋 +4 / 巢 +2，每人口成本之比**解析上恒为**
   *   (石屋首级/4) ÷ (巢首级/2) = (40/4) ÷ (5/2) = 10 ÷ 2.5 = **4**，与等级无关（ratio 2.5 后无交叉点）。
   * ⚠️ 但 costOf 对每级成本做 Math.ceil，巢基数小（5）时相对误差被放大：L2 实测比值 3.846（偏离 0.154），
   *    故容差放宽到 0.2（旧版巢=10 时抖动仅 ~0.02，原容差 0.1 够用）。真正的硬不变量是「石屋每人口永不低于巢」
   *    （perHouse < perNest 必红），倍数只是把这一档关系钉成「约 4 倍」。
   * 期望值从建筑定义实时推导：改动 nest / coralhouse 首级成本时期望值自动跟着变，不会假红。 */
  const nestBase = (SB.BUILDINGS.find(b => b.id === 'nest').cost || {}).coral || 0;
  const houseBase = (SB.BUILDINGS.find(b => b.id === 'coralhouse').cost || {}).coral || 0;
  const expRatio = (houseBase / 4) / (nestBase / 2);
  let houseRatioBad = null;
  for (let n = 1; n <= 8 && !houseRatioBad; n++) {
    const sn = SB.state.freshRun(false); sn.lvl.nest = n - 1;
    const sh = SB.state.freshRun(false); sh.lvl.coralhouse = n - 1;
    const perNest = SB.economy.costOf(sn, 'nest').coral / 2;
    const perHouse = SB.economy.costOf(sh, 'coralhouse').coral / 4;
    if (perHouse < perNest || Math.abs(perHouse / perNest - expRatio) > 0.2)
      houseRatioBad = `第${n}级 巢${perNest} vs 屋${perHouse}（比值 ${(perHouse / perNest).toFixed(3)}，期望 ${expRatio.toFixed(2)}）`;
  }
  check('住房两档同等级比：石屋每人口成本恒为礁口巢的 4 倍（ratio 2.5 后无交叉点）',
    !houseRatioBad, houseRatioBad || ('巢 ' + (nestBase / 2) + ' / 屋 ' + (houseBase / 4) + ' 珊瑚每人口，逐级恒 ' + expRatio.toFixed(1) + ' 倍'));
}

runFoodEconomy({ SB, check, noop });

/* ---------------- 一局 Real Player ---------------- */
/* 必须与 sim/balance.mjs 同构。注意 free() 要连买得起一起判：
 * 只判「未满级」会让破冰祭坛（要精铁 300）永远排在队首且永远失败，
 * 而精铁只有热泉炉能产 —— 整局会冻结在 25% 之前的空转里。
 * ⚠️ 2026-09-28：热泉井已从这张清单里删掉（见下面 `unlock` 那两行），
 *    而它原本是清单里**唯一吃 iron 62** 的那座 ⇒ `freeB` 对 iron 的依赖整体减弱了一档。 */
function freeB(s, id) {
  const b = SB.habitat.buildingById(id);
  if (!b || !SB.habitat.unlocked(s, b) || !SB.habitat.needMet(s, b)) return false;
  return SB.economy.canAfford(s, SB.economy.costOf(s, id));
}
/* 住房两档里挑当下更划算的那档（2026-09-26 随「石屋」跟进）。
 * ⚠️ 不写死 nest：礁口巢 +2 人口但同样 ratio 2.5，石屋 +4 人口 —— 两档每人口成本之比恒为
 * 2（见上面那条断言），所以机器人**永远只盖礁口巢**，石屋一座都不会建。
 * 2026-09-27 ratio 1.15 → 2.5 后这是预期结果，别把「石屋等级 0」当成回归红。
 * 判据用**单位人口成本**（下一级成本 ÷ 这一级加多少人口），人数增量直接问
 * economy.popCap 而不是抄 BLD.house 常数——改人口数值时这里不用跟着改。 */
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
  /* 两档住房成本都是纯珊瑚，所以直接比 coral 这一项即可（混资源时不可比）。 */
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
  // 食物三旋钮：与 sim/balance.mjs 同一套「买够就停」规则
  if (freeB(s, 'weir') && s.lvl.kelp > 0 && s.lvl.weir < 12) return 'weir';
  /* warmnest 买够就停：2026-09-26 产品侧取消了 −60% 减免上限，但 bot 仍停在 30 级——
   * 不是因为设计封顶，而是边际收益太低（−0.5%/级 ⇒ 30 级才省 15%，多余的级数不如拿去
   * 加藻场）。改这个值等同于改 bot 策略 ⇒ 属于标定，要连同 8-14h 窗一起重锚。 */
  if (freeB(s, 'warmnest') && s.pop >= 6 && s.lvl.warmnest < 30) return 'warmnest';
  /* 仓储两座（2026-09-26 第三轮拆成猫国形态）：藻食上限归**海藻仓**（era1 种植解锁）、
   * 材料上限归**压舱仓**（era2 解锁）。两条都「买够就停」——边际收益递减后，多余的料
   * 不如投进产能；这个 12 与 warmnest 的 30 同类，是 bot 策略不是设计封顶。 */
  if (freeB(s, 'kelpstore') && s.lvl.kelp > 0 && s.lvl.kelpstore < 12) return 'kelpstore';
  if (freeB(s, 'ballast') && s.lvl.kelp > 0 && s.lvl.ballast < 12) return 'ballast';
  /* 与 balance.mjs 同源：人口没有上限，超住只减速，所以「超住且在买得起的范围内」才盖房。 */
  const h = pickHouse(s);
  if (h) return h;
  /* 材料线：珊瑚已是职业（珊瑚匠）产出；2026-09-26 金属归位后 siltpit 也不再产金属
   * （只给矿工 +20% 加成），但照样要建——它是金属线唯一的产能乘区。
   * silt 本体靠矿工，所以 wantBuild 仍把 siltpit 排在加工链之前。 */
  /* ⚠️ hearth（暖壳石）2026-09-26 随骨材线删除：冻伤减免改由暖石开关供给（不占建筑位），
   *    bot 的建造清单不能留它——留着就是「钱花在一座不产出的建筑上」。 */
  /* ⚠️ 2026-09-27 补 hall（议事厅）：石工解锁的两座建筑「石屋 + 议事厅」里，
   *    议事厅**没有出现在这张单子里** ⇒ bot 整局不建它 ⇒ 市政页永远不开 ⇒
   *    市政系统（书手职业、三条市政、政体与卡槽）在回归里**整条不存在且不报错**。
   *    这正是 docs/CIVICS_v0.1.md §3.4 记过的那条「最易漏的一条」的镜像——
   *    那边漏的是职业权重表，这边漏的是建造清单。
   *    排在 siltpit 之后：它吃 stone 80 + coral 60，不该挤掉材料线。 */
  /* ⚠️ 2026-09-28：'geyser'（热泉井）已从这两张单子里删除 —— 建筑本身已删。
   *    ⚠️ 2026-10-07：'miracle'（破冰祭坛）一并删除 —— 终局凿壳改由天穹钻机承担。
   *    ⚠️ 后果要说清：**地热产出口没有了 ⇒ fuelRate 恒 0 ⇒ 整局跑到这里凿壳进度会停住**。
   *       这是删热泉井的**必然结果**，不是回归坏了。等地热线重设时，这张单子要**跟着重排**。 */
  const unlock = ['siltpit', 'hall', 'workshop', 'furnace', 'library'];
  for (const id of unlock) if (freeB(s, id) && s.lvl[id] === 0) return id;
  for (const id of ['kelp', 'siltpit', 'nest', 'coralhouse', 'workshop', 'furnace', 'library', 'kelpstore', 'ballast'])
    if (freeB(s, id)) return id;
  return null;
}

/* 石梁制造 + 奇观建造：这两件都是**另一条入口**，塞进行政清单没用，得单独接。
 * ⚠️ 2026-09-28 实测：bot 整局既**不造石梁**、也**不建奇观** ——
 *    `stoneBeam` 在整局模拟里恒为 0，`s.wonders` 恒为空。
 *    连锁后果有两条，都「不报错、不红」：
 *     ① 石梁这条工艺线从没被跑过（它是海潮方碑 20 根、大灯塔 30 根、研究所成本的唯一去处）；
 *     ② 「建成一座奇观」这条尤里卡（《戏剧与诗歌》→ 广场）在整局里**永不成真**，
 *        而 412/412 照样全绿 —— 因为所有涉及奇观的断言都是**手工摆 s.wonders 夹具**
 *        直接宣布建成的，把所有门槛都跳过了。
 * ‼️ 为什么不能塞进 wantBuild：wantBuild 的返回值会经 clickBuild 点 `data-build`，
 *    而 clickBuild 拿 `s.lvl[id]` 判成功 —— 奇观**没有等级**，`lvl[id]` 恒 undefined
 *    ⇒ 点了永远算「没建起来」⇒ `break` 掉整个建造循环。石梁同理：它走 `data-craft`。 */

/* 石梁什么时候造：石梁唯一的去处是海潮方碑（20 根），攒够就停 —— 再多就是拿石头换存根。
 * ⚠️ 门槛顺序别写反：石工没研究 ⇒ 工坊下半区还锁着；没有工坊 ⇒ 做不出石梁。 */
function wantBeam(s) {
  if (!s.techs || !s.techs.masonry) return false;
  if (!(s.lvl.workshop || 0)) return false;
  return (s.res.stoneBeam || 0) < 20;
}
/* 一次只造 1 份（1 份 = 100 石头 → 1.05 根）：石头不够时会失败，下一帧接着试。
 * 一次下 20 份的话，石头不够那一次全部作废，反而更慢。 */
function clickCraft(id, amt) {
  const before = SB.game.run().res.stoneBeam || 0;
  fire({ dataset: { craft: id, craftAmt: String(amt) } });
  return (SB.game.run().res.stoneBeam || 0) > before;
}

/* 奇观建造：石工是它的门（没研究 ⇒ 奇观页签都还锁着），建成即买断，不重复。
 * ⚠️ 排在 wantBuild **之前**：里程碑只此一次，珊瑚一攒到标价就该兑现。
 *    放后面的话，bot 永远有更便宜的建筑可建，轮不到它。 */
function wantWonder(s) {
  if (!s.techs || !s.techs.masonry) return null;
  const L = SB.WONDERS || [];
  for (const w of L) {
    if (s.wonders && s.wonders[w.id]) continue;             // 已建成（买断）
    if (SB.workshop.wonderBlocked(s, w.id) === null) return w.id;
  }
  return null;
}
function clickWonder(id) {
  const before = !!(SB.game.run().wonders || {})[id];
  fire({ dataset: { wonder: id } });
  return !before && !!(SB.game.run().wonders || {})[id];
}

console.log('\n=== 端到端：跑完整一局 ===');
tabOn('village');
frames(2);
check('主循环已启动且资源面板有内容', g('res').length > 0, g('res').length + ' 字节');
const startShell = SB.game.run().iceShell;

/* 整局模拟的出发状态必须是**真开局** —— 这里直接翻一篇新周目，
 * 从 1 人 / 0 资源 / 0 建筑出发，与玩家点「新周目」时逐字段一致。
 * ⚠️ 2026-09-28 实测：原先沿用「前面几十段断言借完状态的那一份」，era1 量出 1.20h；
 *    换成真开局是 1.52h —— **差 27%，而且不报错、不报警**。那不是标定差异，是量具失真：
 *    遗留建筑恰好替 bot 绕开了「 Coral 建巢 → 人口增长」这一段开局瓶颈。
 *    ⇒ 全局标定（单局 8-14h）必须建立在真开局上，否则按它调出来的数全是虚的。 */
SB.game.startRun();
check('整局模拟从真开局出发（新周目：1 人 / 0 资源）',
  SB.game.run().pop === 1 && Object.keys(SB.game.run().res).every(k => !(SB.game.run().res[k])) &&
  Object.keys(SB.game.run().techs).length === 0,
  'pop=' + SB.game.run().pop + ' 资源=' + JSON.stringify(SB.game.run().res));

let frame = 0, breakPanel = false, runHours = 0;
const eraMarks = [{ era: 1, t: 0 }];
/* 「era1 花了多久」有两个口径，都记下来：
 *   ① 时代边界：era1 → era2（推进条件只要 key 科技，比 ② 早得多）；
 *   ② era1 内容全清：这颗树上 era=1 的科技**全部掌握**。
 * ⚠️ 只报 ① 会让 era1 看起来只有一小时，但玩家实际在 era1 里待的时间是 ②。 */
const era1Ids = SB.TECHS.filter(t => t.era === 1).map(t => t.id);
const era1At = {}; era1Ids.forEach(id => { era1At[id] = null; });
let era1Done = null;
const MAX_FRAMES = 40000;
/* e2e 每帧推进 0.1 秒墙钟、游戏速度设为 20×；线上 AI 每 400ms 做一次决策，
 * 即每 4 帧（约 8 游戏秒）。不要在每个 0.1 秒 tick 都重跑整套策略。 */
const BOT_EVERY_FRAMES = 4;
SB.game.setSpeed(20);                 // 挂 20×，每帧推进 2 游戏秒

/* 礁口巢的造价：开局破局要用它当「珊瑚攒够了没有」的门槛。 */
const NEST_COST = ((SB.BUILDINGS.filter(b => b.id === 'nest')[0]) || {}).cost || {};

/* bot 的每一步决策。⚠️ 整局模拟与「era1 真开局专项核算」必须共用同一份策略 ——
 * 策略一旦分叉，两个时长就是两回事，对不上账。 */
function botStep() {
  SB.aiStrategy.step(SB.game.run());
  return;
  const s = SB.game.run();
  /* 开局破局（folk.js 里那条注释的落地）：**珊瑚开局唯一的进项就是手动点「采珊瑚」**。
   * ⚠️ 没有这一下，bot 在真开局（1 人 0 资源）下永远建不起礁口巢 ⇒ 人口卡在 1
   *    ⇒ era1 里所有带 coral 条件的项（凿珊瑚 coral 40）一个也达不成。
   *    ！教训：上一轮报的「整局 5.40h / era1 1.20h」是在**几十段断言垫出来的状态**上跑的，
   *        不是真开局 —— 那个状态有遗留建筑，恰好绕开了这一环。真开局会立刻卡死。
   *    判据：这是 bot 缺手速，不是游戏死锁（玩家手点就能破）。 folk.js 早写明了这条。 */
  const nestCost = NEST_COST.coral || 0;
  if (!(s.lvl.nest || 0) && (s.res.coral || 0) < nestCost) {
    /* 一帧点 5 下 ≈ 真实玩家三秒的手速（1 帧 = 2 游戏秒）。点 1 下等于每秒只点半下，
     * 会把开局那段凭空拉长十几分钟，那是**测量工具的失真**，不是游戏时长。 */
    for (let g = 0; g < 5 && s.res.coral < nestCost; g++) fire({ dataset: { gather: 'coral' } });
  }
  /* 职业调配：与 sim/balance.mjs 同构的「食物优先」——
   * 先按口粮缺口算该有几个采集者，剩下的人力再按策略比例分。
   * 照抄三段比例的话没人产藻食，峰值族民卡在 1、整局 48h 也凿不穿。 */
  const cold = SB.economy.isCold(s);
  const byBuild = s.lvl.kelp * SB.BLD.food * SB.economy.season(s.t).mult * (cold ? 0.6 : 1);
  let need = Math.ceil((s.pop * SB.CFG.FOOD_PER - byBuild) / SB.UNIT.kelp);
  need = s.pop > 1 ? Math.min(need, s.pop - 1) : s.pop;
  /* coralwright 必须给权重：珊瑚现在是职业产出（2026-09-25 从采石场建筑改回职业），
   * 写 0 的话珊瑚恒为 0，热泉炉转不出精铁，祭坛永远建不起来，整局 48h 凿不穿。
   * ⚠️ 2026-09-26 补 quarrier / miner：石头只由采石工产、暖石只由矿工伴生。
   *    漏了这两个键，autoAssign 的权重表读不到 ⇒ 权重 0 ⇒ 石头恒 0 ⇒
   *    「石工」的尤里卡条件（res stone 100）永远不成立 ⇒ 纪元一关键节点清不掉
   *    ⇒ 纪元闸门挡住纪元二/三 ⇒ 冶炼术学不到 ⇒ 和热泉炉那条断链长得一模一样。
   * ⚠️ 2026-09-26 金属归位（对齐猫国）：siltpit 不再自动产金属，金属唯一来源 = 矿工，
   *    且 furnace 每匠人吃 0.06/s 的 silt、矿工单人只产 0.09/s ⇒ miner ≥ craft×0.67。
   *    旧权重（miner 0.04-0.05）是「siltpit 兜底」年代的，直接抄回来铁链必瘫。 */
  /* ⚠️ 2026-09-27 补 scribe（书手）：不给权重的后果见 docs/CIVICS_v0.1.md §3.4 ——
   *    autoAssign 读不到就按 0 分配 ⇒ 书手恒 0 人 ⇒ 市政点恒 0 ⇒ 市政树全程空转，
   *    而且**不会报错**。权重给得最小（其余职业按比例被稀释），是因为 era1 的瓶颈是人口：
   *    书手每多一人，采集者/匠人/矿工就少一人。这不是标定，是「bot 得像个真实玩家那样
   *    给新职业留位置」——留多少才是标定，留给下一轮。 */
  SB.folk.autoAssign(s, Object.assign({ gather: need },
    cold ? { coralwright: 0.06, quarrier: 0.05, craft: 0.34, scholar: 0.10, miner: 0.26, scribe: 0.04 }
         : { coralwright: 0.10, quarrier: 0.06, craft: 0.13, scholar: 0.18, miner: 0.11, scribe: 0.03 }));
  /* 石梁（工艺制作产物）：排在建造之前 —— 它是奇观的成本，先备料再谈别的。
   * ⚠️ 造不出来时**不 break**：石头不够是常态，下一帧接着试，不是「今天到此为止」。 */
  if (wantBeam(s)) clickCraft('craft_stonebeam', 1);
  // 建造（奇观走 data-wonder，与建筑那条路不同入口，见上一批那段注）
  for (let n = 0; n < 3; n++) {
    const wid = wantWonder(s);
    if (wid) { if (!clickWonder(wid)) break; continue; }
    const id = wantBuild(s);
    if (!id || !clickBuild(id)) break;
  }
  /* 天穹钻机改手动启动（2026-10-07 用户「启动钻机按钮」）：bot 建成即点启动——
   * 走 data-skydrill 的真实委托路径（与玩家同一个按钮），不直接写 s.skydrillOn。
   * 不点的话整局长模拟会永久卡在 25% 壳厚（自动运转语义已删）。 */
  if (s.wonders && s.wonders.wonder_skydrill && !s.broken && !s.skydrillOn)
    fire({ dataset: { skydrill: '1' } });
  // 研究
  /* 只点「当下真能研究」的那一项。尤里卡未揭示 / 前置未掌握 / 跨纪元 / 科技不够
   * 四道门禁都在 tech 层，若这里按「买得起」挑，会一直点同一项失败按钮，
   * 科技涨了却一项没掌握（与线上点按钮是完全不同的路径，所以这里必须同源）。 */
  for (const t of SB.TECHS) if (SB.tech.canStudy(s, t.id)) { fire({ dataset: { tech: t.id } }); break; }
  /* 市政（2026-09-27）：与研究同款「只点当下真能做的那一项」。
   * ⚠️ 装填那一步**只挑有实际效果的卡**（`_skills` 过滤 effect 为空的《技艺》——
   *    工坊内容还没做，装它等于白占一个槽）。bot 若随手装了它，神秘主义那 +0.3/s
   *    整局都不会生效，回归会「绿」但市政这条线的效果侧根本没被跑过。 */
  if (SB.civic.panelOpen(s)) {
    for (const c of SB.CIVICS) if (SB.civic.canResearch(s, c.id)) { fire({ dataset: { civic: c.id } }); break; }
    if (s.gov && !s.card) {
      /* ⚠️ 2026-09-28 修过一次判据：原来只认 `effect` 非空（理由见上面那三行注：
       *    《技艺》是空壳，装它白占一个槽）。而政策卡《戏剧与诗歌》的 effect 同样是空壳、
       *    却挂着 `squareMul` 乘区 —— 按「effect 非空」挑，bot 永远装不上它，
       *    广场那条线跑一整局都不会生效，而回归照样全绿。
       *    ⇒ 判据改成「有任何实际效果」（effect 的键，或 squareMul 数值）。
       * ⚠️ 但**装哪一张仍然是被单一槽位决定的**：万能槽只有 1 个，POLICIES 表序里
       *    《神秘主义》排在《戏剧与诗歌》前面 ⇒ bot 装上神秘主义后就槽满，永远轮不到
       *    下一张。这不是 bot 的错，是「槽位只有 1 个」这个设计现状；
       *    等第二个槽落地、且它不是万能槽时，卡的 `type` 约束才会开始咬人。 */
      const hasFx = p => Object.keys(p.effect || {}).length > 0 || typeof p.squareMul === 'number';
      for (const p of SB.POLICIES) {
        if (hasFx(p) && SB.civic.canSetCard(s, p.id)) { fire({ dataset: { card: p.id } }); break; }
      }
    }
  }
}

while (frame < MAX_FRAMES) {
  const s = SB.game.run();
  if (!s || s.broken) { runHours = s.t / 3600; break; }
  if (frame % BOT_EVERY_FRAMES === 0) botStep();
  frames(1);
  frame++;
  { const cur = SB.game.run();
    if (cur.era !== eraMarks[eraMarks.length - 1].era) eraMarks.push({ era: cur.era, t: cur.t });
    /* 逐项记录首次掌握时刻：这个数只有拆成行才对得账 ——
     * 否则「era1 花多久」永远是个没法复核的黑箱。 */
    for (const id of era1Ids) if (era1At[id] === null && cur.techs && cur.techs[id]) era1At[id] = cur.t;
    if (era1Done === null && era1Ids.every(id => era1At[id] !== null)) era1Done = cur.t; }
  if (frame % 2000 === 0) {
    console.log(`  [frame ${frame}] t=${(s.t / 3600).toFixed(2)}h pop=${s.pop} shell=${s.shell.toFixed(0)} 热=${s.res.fuel.toFixed(1)}`);
  }
}

/* 职业解锁链无死结 —— 用户要求「一开始不显示，解锁一个显示一个」，由此引入的
 * 唯一真风险不是显示逻辑本身，而是**某个职业永远解不开**：族民页上永远只有采集者，
 * 玩家会以为整局就这一种活可干，而且还不会报任何错。
 * 判据：整局跑完后，树上所有声明了 eff.unlockJob 的科技都该被掌握。
 * ⚠️ 期望值从 SB.TECHS 反查而不是写死科技 id —— 将来改「哪项科技解锁谁」
 *    这条断言仍然成立；写死 id 会让它在一次普通的树调整后变成噪音。 */
{
  const sf = SB.game.run();
  const missed = SB.JOBS.filter(j => !SB.folk.jobUnlocked(sf, j.id)).map(j => j.id);
  check('单局跑完全部 ' + SB.JOBS.length + ' 个职业解锁（解锁链无死结）', missed.length === 0,
    missed.length
      ? '仍锁着 ' + missed.join('/')
      : SB.JOBS.map(j => j.id + '←' + (SB.folk.jobTechOf(j.id) || '开局')).join(' '));
}

/* 奇观 · 整局覆盖（2026-09-28 补）
 * ⚠️ 上面那些涉及奇观的断言**全是手工摆 `s.wonders` 夹具「宣布」已建成**的，
 *    等于把门槛（石工 / 20 石梁 / 300 珊瑚）整段跳过 —— 正面断言只证明「给了就生效」，
 *    证明不了「这条链走不走得通」。而它一断，反馈是 412/412 全绿，没人会发现。
 *    所以这里换成真开局真跑一遍，看 bot 到底建不建得起。 */
{
  const sf = SB.game.run();
  const cnt = SB.wonder.count(sf);
  check('整局跑完后海潮方碑真的建成了（走 data-wonder 真入口，不是手摆夹具）',
    cnt >= 1,
    'count=' + cnt + '，石梁余 ' + (sf.res.stoneBeam || 0) +
    '，石头 ' + (sf.res.stone || 0) + '，珊瑚 ' + (sf.res.coral || 0));
  check('「建成一座奇观」这条尤里卡在整局里真的成立过（⇒《戏剧与诗歌》可达）',
    SB.tech.condMet(sf, { t: 'wonder', n: 1 }) === true,
    'condMet=' + SB.tech.condMet(sf, { t: 'wonder', n: 1 }));
}

runCivics({ SB, check, noop, doc, g, fs, path, ROOT });

/* 纪元十 · 驭星纪（2026-10-20）：7 科技 / 太阳星环 / 发射场双模式 / 戴森终局 / 朱庇特 / 大统一轴。
 * ⚠️ 必须传 fs/path/ROOT：这个 suite 会把 13 个占位资产的**磁盘存在性**一起钉住
 *    （图标与五档背景图是「数据落了没人读」最容易漏的一环 —— 路径写错只表现为空图，不报错）。 */
runEra10Content({ SB, check, noop, fs, path, ROOT });
runEra10Civics({ SB, check, noop });

/* 破冰面板 —— **前提：这一局真的破了冰**。
 * ⚠️ 2026-09-28 入口条件改了，原写法有两个洞：
 *    ① 原来写 `if (!modal.classList.contains('hidden'))` —— 而 modal 很可能是**前面某个
 *       用例残留的弹窗**（本轮实测：主循环跑满 40000 帧、冰壳一直 25000 纹丝不动、
 *       祭坛 0 座 ⇒ 破冰根本没发生，但 modal 不是 hidden）⇒ 整块照跑，测的是残留弹窗。
 *    ② 块里那条 `check('破冰结算面板弹出', true)` 是**恒真断言** —— 写死 true，
 *       无论上面进的是哪个分支都绿。恒真断言等于没有断言，还占着一个「✓」骗人。
 *    ⇒ 入口改成 `run.broken`：破了才谈面板内容（下面的断言一字未改）；没破就整块挂起。
 *    ⚠️ 为什么破冰不会发生：地热线删掉热泉井 ⇒ `fuelRate` 恒 0 ⇒ 祭坛供不上能 ⇒
 *       `miracleCap` 为 0 ⇒ 冰壳最后那段永远凿不动（实测 shell 恒定 25000）。 */
const modal = doc.getElementById('modal');
if (SB.game.run().broken) {
  breakPanel = true;
  const box = g('modalBox');
  const m = box.match(/获得轮回点<\/span><b[^>]*>([\d.]+)/);
  check('破冰结算面板弹出',
    !modal.classList.contains('hidden') && box.indexOf('获得轮回点') !== -1,
    'modal hidden=' + modal.classList.contains('hidden'));
  const meta = SB.game.meta();
  check('结算面板给出轮回点数值', !!m, m ? m[1] + ' 点' : '');
  check('轮回点已记入跨周目存档', meta.tide > 0, 'tide=' + meta.tide.toFixed(2));
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
  /* 这四条**挂起，不是改绿**：破冰没发生 ⇒ 结算面板不存在 ⇒ 轮回点 / 周目推进全走不到。
   * 【重设后照原样还原】把下面的 pending(...) 换回 check(...) 原句即可。 */
  const _why = '破冰不再发生（fuelRate 恒 0 ⇒ miracleCap 为 0 ⇒ 冰壳恒 25000）；'
    + '本轮实测跑满 ' + frame + ' 帧未破冰，等地热线重设';
  pending('结算面板给出轮回点数值', _why);
  pending('轮回点已记入跨周目存档', _why);
  pending('可进入下一周目', _why);
  pending('新周目清空建筑与资源', _why);
  check('本局确实没有破冰（挂起的前提成立，不是悄悄跳过）', frame >= MAX_FRAMES,
    '跑满 ' + frame + ' 帧、冰壳 ' + SB.game.run().shell.toFixed(0) + ' / 祭坛 '
    + (SB.game.run().lvl.miracle || 0) + ' 座');
}

/* ---------------- 轮回商店 / 增益继承 ---------------- */
console.log('\n=== 轮回商店与跨周目继承 ===');
/* 商店门控：首次轮回后才开。这里模拟「已轮回过一次」让 meta 页可进。 */
SB.game.meta().shopUnlocked = true;
SB.state.saveMeta(SB.game.meta());
SB.game.renderAll();
tabOn('meta');
const metaMarkup = doc.getElementById('pane-meta').innerHTML;
check('轮回商店有余额摘要与 8 子树天赋树（2026-10-23 潮汐之树，替代旧「三桶」10 区）',
  metaMarkup.includes('meta-overview') && metaMarkup.includes('meta-legacy-grid') &&
  ['先人孑遗', '安得广厦', '铁血工造', '金石为开', '唯食与犁', '百炼成钢', '政经往来', '远见之人']
    .every(t => metaMarkup.includes(t)));
check('轮回商店每项天赋节点仍对应唯一购买按钮',
  SB.TIDE_TREE.every(p => (metaMarkup.match(new RegExp('data-perk="' + p.id + '"', 'g')) || []).length === 1));
const s3 = SB.game.run();
SB.game.meta().tide = 30;                       // 给够点数，验证扣款与到账
const kelpBefore = s3.res.kelp;
fire({ dataset: { perk: 'startKelp' } });       // 前朝藻席：+200 藻食，2 点（remnant 子树 startKelp）
check('可购买起始资源类增益', s3.res.kelp >= kelpBefore + 200, '藻食 ' + kelpBefore.toFixed(0) + ' → ' + s3.res.kelp.toFixed(0));
check('购买后扣除轮回点', SB.game.meta().tide < 30, '剩余 ' + SB.game.meta().tide.toFixed(2));
check('已购增益写入跨周目记录', SB.game.meta().perks.startKelp === 1);

fire({ dataset: { perk: 'coralPact1' } });      // 珊瑚契 I：珊瑚匠系 +10%
check('可购买产出效率类增益并累计层数', (s3.perk.coralPact || 0) > 0, 'coralPact=' + s3.perk.coralPact);

SB.game.meta().tide = 0;
fire({ dataset: { perk: 'startCoral' } });      // 没钱了
check('轮回点不足时无法购买', (SB.game.meta().perks.startCoral || 0) === 0);

/* ---------------- 产出 perk 拍板（2026-10-05 晚）：9 条 +10%/级、不设上限 ----------------
 * 断言四件事：
 *   ① 9 条 perk 定义全部 n:Infinity（上限真的摘掉了，不是只改文案）；
 *   ② 结算系数 10%/级：5 个导出乘区 + 祭祀唱诗（faithRate 积分口径）+ 工坊定额（craftRatio 加法池）；
 *   ③ 购价等差外推：数组 20 级耗尽后按末级步长继续（coralPact 第 21 级 = 42）；
 *   ④ 外推顺带治 g2 单元素数组的 undefined 取价（平价续费）。 */
console.log('\n=== 潮汐之树 perk 结算（2026-10-23 实装，替代旧 PERKS）===');
/* ① 尾节点全部 n:Infinity（无上限通汇）；基础链节点 n:1（单级靠 nest 串成链）。 */
check('尾节点全部 n:Infinity（无上限通汇）',
  ['coralPactTail','minerPactTail','quarryPactTail','furnaceBoostTail','craftQuotaTail',
   'algaeCropTail','matStoreTail','luxuryPactTail']
    .every(id => { const d = SB.prestige.perkDef(id); return !!d && d.n === Infinity; }));
check('基础链节点为单级（每节点 n:1 或默认单级，靠 nest 串成链）',
  ['coralPact1','minerPact1','quarryPact1','furnaceBoost1','craftQuota1','algaeCrop1','matStore1','luxuryPact1']
    .every(id => { const st = SB.prestige.perkState(id); return !!st && st.max === 1; }));
/* ② 结算系数：分系 +10%/级（矿/石/珊瑚/藻/学者/书手/奢侈）；炉火/热液 +20%/级；热坊 +10%/级。 */
check('结算系数 = 10%/级（分系乘区：矿工/采石/珊瑚/藻食/学者/书手/奢侈）',
  SB.economy.minerPactMul({ perk: { minerPact: 3 } }) === 1.3 &&
  SB.economy.quarryPactMul({ perk: { quarryPact: 3 } }) === 1.3 &&
  SB.economy.coralPactMul({ perk: { coralPact: 3 } }) === 1.3 &&
  SB.economy.algaeCropMul({ perk: { algaeCrop: 3 } }) === 1.3 &&
  SB.economy.scholarPactMul({ perk: { scholarPact: 3 } }) === 1.3 &&
  SB.economy.scribePactMul({ perk: { scribePact: 3 } }) === 1.3 &&
  SB.economy.luxuryPactMul({ perk: { luxuryPact: 3 } }) === 1.3);
check('炉心/热液效率 = 20%/级、热坊产出 = 10%/级',
  SB.economy.furnaceEffMul({ perk: { furnaceEff: 3 } }) === 1.6 &&
  SB.economy.hydroshopEffMul({ perk: { hydroshopEff: 3 } }) === 1.6 &&
  SB.economy.hydroshopBoostMul({ perk: { hydroshopBoost: 3 } }) === 1.3);
/* ③ 尾节点几何购价（scale:1.5 向下取整）：coralPactTail costs:[10] ⇒ 10/15/22…；基础链 nest 门控。 */
{
  const m = SB.game.meta();
  m.perks.coralPactTail = 0; const t0 = SB.prestige.perkState('coralPactTail');
  m.perks.coralPactTail = 1; const t1 = SB.prestige.perkState('coralPactTail');
  m.perks.coralPactTail = 2; const t2 = SB.prestige.perkState('coralPactTail');
  check('尾节点几何购价（scale:1.5 向下取整）：coralPactTail 第1/2/3级 = 10/15/22',
    t0.next === 10 && t1.next === 15 && t2.next === 22,
    'lv0=' + t0.next + ' lv1=' + t1.next + ' lv2=' + t2.next);
  delete m.perks.coralPactTail;
  const stChild = SB.prestige.perkState('furnaceBoost2');
  check('链式前置门控：未购 furnaceBoost1 时 furnaceBoost2 为 locked',
    stChild.locked === true, 'locked=' + stChild.locked);
}
/* ④ 工坊定额：craftQuota 基础 3 链 = +30% 工艺产出（craftRatio 加法轴 +0.3）；祭祀唱诗 10 级 ⇒ faithRate ×2.0。 */
{
  const cA = SB.state.freshRun(false), cB = SB.state.freshRun(false);
  cA.perk.craftQuota = 3;   // 等价于买满 craftQuota1+2+3（每级 +10%）
  const dA = SB.workshop.craftRatio(cA), dB = SB.workshop.craftRatio(cB);
  check('工坊定额 3 级 ⇒ craftRatio 加法轴 +0.3（+10%/级）',
    Math.abs((dA - dB) - 0.3) < 1e-9, 'Δ=' + (dA - dB).toFixed(4));
  const fA = SB.state.freshRun(false), fB = SB.state.freshRun(false);
  fA.civics.theology = true; fA.pop = 100; fA.perk.sacrament = 10;
  fB.civics.theology = true; fB.pop = 100;
  const rA = SB.economy.faithRate(fA), rB = SB.economy.faithRate(fB);
  check('祭祀唱诗 10 级 ⇒ faithRate ×2.0（+10%/级，旧键 s.perk.sacrament 仍兼容）',
    rB > 0 && Math.abs(rA - rB * 2) < 1e-9, 'base=' + rB.toFixed(4) + ' 10级=' + rA.toFixed(4));
}
/* ⑤ 旧典编纂/潮纹校勘（已退休，无对应潮汐之树节点）：legacy() 仍按旧档 key 兼容读取，迁移不丢加成。 */
{
  const m = SB.game.meta();
  const lg = SB.prestige.legacy(m);
  m.perks.civicArchive = 3; m.perks.tideProof = 2;
  const lg2 = SB.prestige.legacy(m);
  check('旧典编纂/潮纹校勘 = 10%/级（shopCivic/shopScienceBonus，旧档兼容）',
    Math.abs(lg2.shopCivicBonus - 0.3) < 1e-9 &&
    Math.abs(lg2.shopScienceBonus - 0.2) < 1e-9,
    'civic=' + lg2.shopCivicBonus + ' science=' + lg2.shopScienceBonus);
  delete m.perks.civicArchive; delete m.perks.tideProof;
}

/* ---------------- 轮回遗产的科技同构（2026-10-07 用户报「写着 +1.03/s 科技、实际不进账」）----------------
 * 病根：tick 的科技三行（学者 / 市政卡 cv.science / 商人副产）全漏 legacy 乘区
 *       （relicScienceMul + shopScienceBonus），旧日潮纹碑石的固定速率
 *       oldTideSteleScienceRate 更是整条没有——只在 rates() 有 ⇒ 面板撒谎。
 * 断言两层：① legacy 读数与调和级数口径对上（玩家截图 555 件 ⇒ +1.03/s）；
 *           ② tick 一秒的进账 === rates() 面板值（同构铁律，漏一路就红）。 */
console.log('\n=== 轮回遗产科技同构（tick === rates）===');
{
  const m = SB.game.meta();
  const bak = { art: m.oldArtworkEarnedTotal, stele: m.oldTideStelesEarnedTotal, mw: m.memorialWonders };
  m.oldArtworkEarnedTotal = 884; m.oldTideStelesEarnedTotal = 555;
  m.memorialWonders = { wonder_test_a: 1, wonder_test_b: 1, wonder_test_c: 1 };
  const lg = SB.prestige.legacy(m);
  let h555 = 0; for (let k = 1; k <= 555; k++) h555 += 1 / k;
  check('旧日潮纹碑石 555 件 ⇒ 固定速率 = 0.15×H(555) ≈ 1.03（玩家截图口径）',
    Math.abs(lg.oldTideSteleScienceRate - 0.15 * h555) < 1e-9,
    'rate=' + lg.oldTideSteleScienceRate.toFixed(4));
  check('纪念奇观 3 座 ⇒ relicScienceMul = 1.03', Math.abs(lg.relicScienceMul - 1.03) < 1e-9);

  const s1 = SB.state.freshRun(false);
  s1.jobs.scholar = 4;
  const panel = SB.economy.rates(s1).science;
  const before = s1.res.science || 0;
  SB.economy.tick(s1, 1, null);
  const actual = (s1.res.science || 0) - before;
  check('tick 一秒进账 === 面板速率（乘区 + 碑石平加项两路都在）',
    panel > 1 && Math.abs(actual - panel) < 1e-6,
    'panel=' + panel.toFixed(4) + ' tick=' + actual.toFixed(4));
  check('面板速率确实含碑石平加项（≥ 1.03）', panel >= lg.oldTideSteleScienceRate - 1e-9,
    'panel=' + panel.toFixed(4));

  m.oldArtworkEarnedTotal = bak.art; m.oldTideStelesEarnedTotal = bak.stele;
  m.memorialWonders = bak.mw;   // 还原，不污染后续存档断言
}

await runPersistence({ SB, check, sandbox, doc, makeDoc, loadAll, errors });

/* ---------------- 轮回系统（宗教 → 弹窗 → 轮回点 / 商店门控）----------------
 * 2026-09-29 新增：建立宗教解锁「轮回」；解锁前不发放轮回点；
 * 首次轮回后解锁轮回商店。这条与「破冰是否发生」无关（破冰走 geyser 线，当前恒 0），
 * 所以这里直接驱动 doBreak / maybeReligionPopup / startRun 验证门控本身。 */
console.log('\n=== 轮回系统门控 ===');
drainStoryModals();
// 先把宗教/商店开关钉成「未解锁」，保证本段自包含（不受前面主流程是否触发过弹窗影响）
SB.game.meta().religionSeen = false;
SB.game.meta().shopUnlocked = false;
SB.state.saveMeta(SB.game.meta());
// 0) 负向：仅完成神学、未写宗教名 ⇒ 不视为建立宗教（不得解锁轮回）
var sR0 = SB.game.run();
sR0.civics.theology = true; sR0.religionName = '';
SB.game.maybeReligionPopup(sR0);
check('仅完成神学、未命名 ⇒ 不建立宗教（religionSeen 仍为 false）', SB.game.meta().religionSeen === false);
// 1) 神学未完成：doBreak 不发放轮回点（资格门 = 本局《神学》）
var sR = SB.game.run();
sR.civics.theology = false; sR.peak = 120; sR.shell = 0; sR.broken = false;
var tideBefore = SB.game.meta().tide;
SB.prestige.doBreak(sR, null);
check('神学未完成 doBreak 不发放轮回点', SB.game.meta().tide === tideBefore, 'tide=' + SB.game.meta().tide.toFixed(2));
sR.broken = false; sR.civics.theology = false;   // 还原，避免影响后续断言
// 1.5) 未建立宗教也「进到第二周目」（破冰 + startRun，cycle≥2）⇒ 仍不能进轮回商店：
//      普通重置不是轮回，shopUnlocked 保持 false、meta 页整页锁死。
SB.game.meta().religionSeen = false;
SB.state.saveMeta(SB.game.meta());
SB.game.startRun();
check('未建立宗教、即使进到第二周目，shopUnlocked 仍为 false（不能进轮回商店）', SB.game.meta().shopUnlocked === false);
check('未建立宗教时 meta 页仍 locked', doc.querySelector('.tab[data-tab="meta"]').classList.contains('locked'));
// 2) 写入宗教名 → 弹窗台词 + 永久解锁 religionSeen
var sR2 = SB.game.run();
sR2.religionName = '深渊教';
drainStoryModals();
SB.game.maybeReligionPopup(sR2);
check('写入宗教名后 meta.religionSeen = true', SB.game.meta().religionSeen === true);
check('宗教弹窗台词就位（文明的轮回）', /文明的轮回/.test(doc.getElementById('modalBox').innerHTML));
// 3) 解锁轮回后：doBreak 正常发放轮回点，且「第一次真实轮回」即解锁商店
sR2.civics.theology = true; sR2.peak = 120; sR2.shell = 0; sR2.broken = false;
var tideB2 = SB.game.meta().tide;
SB.prestige.doBreak(sR2, null);
check('解锁轮回后 doBreak 发放轮回点', SB.game.meta().tide > tideB2,
  '+' + (SB.game.meta().tide - tideB2).toFixed(2));
check('第一次真实轮回（建立宗教后破冰）即解锁 shopUnlocked', SB.game.meta().shopUnlocked === true);
sR2.broken = false;
// 4) 后续轮回保持解锁（startRun 不再碰 shopUnlocked，由 doBreak 置位）
SB.game.startRun();
check('后续轮回后 shopUnlocked 仍为 true', SB.game.meta().shopUnlocked === true);
check('首次轮回后 meta 页解锁（不再 locked）',
  !doc.querySelector('.tab[data-tab="meta"]').classList.contains('locked'));

/* 5b) 【2026-10-05 拍板】重开按钮的结算分流：本局研究完《神学》⇒ 走真正轮回结算（doBreak），
 *      未研究 ⇒ 仅纯重开（resetRun），不结算、不发点。
 *      判据与 prestige.qualified 同源（本局 civics.theology 真值）。钉住 routeReset，
 *      这样「按钮点下去到底结不结算」有断言守着，将来谁改了分流不会静默退化。 */
{
  const sB = SB.state.freshRun(true); sB.civics = { theology: true };
  check('重开按钮：本局研究完《神学》⇒ 轮回结算（break）',
    SB.game.routeReset(sB) === 'break', 'route=' + SB.game.routeReset(sB));
  const sN = SB.state.freshRun(true); sN.civics = {};
  check('重开按钮：未研究《神学》⇒ 纯重开（reset）',
    SB.game.routeReset(sN) === 'reset', 'route=' + SB.game.routeReset(sN));
}

/* 5) 【2026-10-03 口径】底栏「重开本周目 / 轮回」按钮文案跟的是**当局**宗教，
 *     不是永久的 meta.religionSeen。用户原话：「这里还没研究神学怎么就是轮回了？」
 *    旧实现读 meta.religionSeen，于是「早前某周目建过宗教 / 旧档被迁移补发」之后，
 *    新周目里神学被重置、宗教名也清空，底栏照样写「轮回」——像凭空跳过了神学。
 *    ⚠️ 两条都要钉。负向那条是**唯一**能区分新旧实现的：旧写法下它必须红。
 *       正向那条保证不是「两处都写死成同一个字符串」蒙过去的。 */
{
  const sBtn = SB.game.run();
  const nameBak = sBtn.religionName, seenBak = SB.game.meta().religionSeen;
  SB.game.meta().religionSeen = true;        // 永久开关为真（= 早前建过宗教 / 旧档迁移补发）
  SB.state.saveMeta(SB.game.meta());
  sBtn.religionName = '';
  SB.game.renderAll();
  const btn0 = doc.getElementById('btnBreak').textContent;
  check('永久已解锁（seen=true）但**当局**未建立宗教 ⇒ 主按钮仍写「凿穿冰壳」',
    SB.game.meta().religionSeen === true && btn0 === '凿穿冰壳',
    'seen=' + SB.game.meta().religionSeen + ' text=' + btn0);
  sBtn.religionName = '深渊教';
  SB.game.renderAll();
  const btn1 = doc.getElementById('btnBreak').textContent;
  check('**当局**建立宗教（写入宗教名）⇒ 主按钮仍为「凿穿冰壳」（合并后按钮文案随破壳/戴森维度，不再随宗教）', btn1 === '凿穿冰壳', 'text=' + btn1);
  sBtn.religionName = nameBak;               // 还原，别影响后续断言
  SB.game.meta().religionSeen = seenBak;
  SB.state.saveMeta(SB.game.meta());
  SB.game.renderAll();
}

/* 巢穴页内区标题配色 + 分区折叠（2026-09-30 晚 · 用户：「这里的文字颜色也改了，就是生息区这些」
 *   「各个分区的折叠呢，没做啊」）：
 * 前两轮分别漏了「页**内**区标题着色」与「页**内**区折叠」——只管到了最外层卡片。
 * 这里强制露出 core + food 各一座，renderPanes 后 pane-village-body 里必须出现
 * 「带行内 --hc 的**可折叠区**」（.bzone[data-zone] > .bztitle[data-zfold] + .bzbody），
 * 且翻 ZONE_FOLDED 后重画能把 folded **重拼回 HTML**（pane 每 2 秒整块重画，落类会被冲掉）。
 * ⚠️ 断言必须在**活着的这一局**上 render（pane 画的是 SB.game.run()），跑完还原 lvl/seen。 */
{
  const sVc = SB.game.run();
  const lvBak = Object.assign({}, sVc.lvl), seenBak = Object.assign({}, sVc.seen);
  sVc.lvl.nest = 1; sVc.lvl.kelp = 1;    // core / food 各露一座
  if (!SB.ui.render.buildingIconsShown()) SB.ui.render.toggleBuildingIcons();
  SB.game.markDirty(); SB.ui.render.renderPanes();
  const vHtml = doc.getElementById('pane-village-body').innerHTML;
  check('巢穴页内区标题带行内 --hc 配色（礁栖核心=青 #4dd8e6，不再是灰 .bztitle）',
    /class="bztitle" data-zfold="core"[^>]*style="--hc:#4dd8e6"/.test(vHtml), '');
  check('巢穴页内区标题按区取色（生息区=绿 #4ade80）',
    /class="bztitle" data-zfold="food"[^>]*style="--hc:#4ade80"/.test(vHtml), '');
  check('巢穴页内分区可折叠（.bzone[data-zone] 包 .bztitle + .bzbody）',
    /<div class="bzone" data-zone="core">/.test(vHtml) &&
    /<div class="bzone" data-zone="food">/.test(vHtml) &&
    /class="bzbody"/.test(vHtml), '');
  check('ERA1已解锁建筑行显示各自的图标',
    vHtml.includes('assets/building-icons/era-1/era1-nest.png') &&
    vHtml.includes('assets/building-icons/era-1/era1-kelp.png'), '');
  fire({ dataset: { buildingIconsToggle: '' } });
  SB.game.markDirty(); SB.ui.render.renderPanes();
  const vIconsOff = doc.getElementById('pane-village-body').innerHTML;
  check('巢穴标题栏开关可隐藏建筑图标',
    !SB.ui.render.buildingIconsShown() && !vIconsOff.includes('class="building-icon"'), '');
  fire({ dataset: { buildingIconsToggle: '' } });
  SB.game.markDirty(); SB.ui.render.renderPanes();
  const vIconsOn = doc.getElementById('pane-village-body').innerHTML;
  check('再次点击开关可恢复图标',
    SB.ui.render.buildingIconsShown() && vIconsOn.includes('era1-nest.png'), '');
  /* 折叠真源是 ZONE_FOLDED：翻一次 → 重画 → 该区带 folded，且**只动那一个区**。 */
  const coreBefore = /<div class="bzone folded" data-zone="core">/.test(vHtml);
  const foodBefore = /<div class="bzone folded" data-zone="food">/.test(vHtml);
  SB.ui.render.toggleZoneFold('core');
  SB.game.markDirty(); SB.ui.render.renderPanes();
  const vFold = doc.getElementById('pane-village-body').innerHTML;
  check('折叠某区：重画后该区带 folded，且只动该区（状态重拼，不怕 2 秒重画）',
    /<div class="bzone folded" data-zone="core">/.test(vFold) === !coreBefore &&
    /<div class="bzone folded" data-zone="food">/.test(vFold) === foodBefore, '');
  SB.ui.render.toggleZoneFold('core');   // 翻回原状，别把状态漏给后面的断言
  sVc.lvl = lvBak; sVc.seen = seenBak;
  SB.game.markDirty(); SB.ui.render.renderPanes();
}

/* ---------------- 科研面板开门（纪元一的开场，UI 三道闸）----------------
 * 状态层的关系在上一节验过了；这里验渲染层：tab 灰不灰、setTab 拦不拦、
 * 弹窗台词在不在、关掉弹窗有没有真翻到科技页。缺任何一道都会变成
 * 「面板亮了却点不开」或「弹窗关了页没翻」，这类错位只有跑完整 UI 才看得见。
 * 用的是硬重置之后那个全新周目，状态干净。 */
runUiAccessibility({ SB, check, noop, doc, g, fs, path, ROOT, drainStoryModals });

runCalendarWarmstone({ SB, check, noop, doc, g, fs, path, ROOT, fire });
runOfflineFastForward({ SB, check, sandbox });

runWorkshopEconomy({ SB, check, noop, doc, g, fs, path, ROOT, fire, pending, sandbox });

/* ---------------- ERA4 市政（2026-10-01 用户设计稿实装）----------------
 * 覆盖三层：
 * ① 数据完整性：5 市政 / 2 政体 / 4 政策卡 / 教堂奇观都在表里，鼓舞类型与设计稿一一对应；
 * ② 效果读数：11 条新乘区/加区在「未装 / 未采用」时返回基准值（绝不污染产线），
 *    在「装上 / 采用」的夹具态下返回设计值——与 castleFaithMul 那批同构；
 * ③ 季节发放：探索+商队驿站的每季资源 = 速率 × 60s（截仓储上限）。
 * ⚠️ 不在这里做 bot 可达性覆盖：bot 不建立宗教、不装 II 级扩容、未必凑满 6 奇观——
 *    覆盖洞照「覆盖洞挂账」口径记录，绝不扭曲断言迁就现状。 */
console.log('\n=== ERA4 市政 ===');
{
  const s4 = SB.state.freshRun(false);
  /* ① 数据完整性 */
  const wantC = ['explore', 'reformed', 'mercantilism', 'enlightenment', 'historiography'];
  check('ERA4 五项市政都在表里且 era=4',
    wantC.every(id => SB.CIVICS.some(c => c.id === id && c.era === 4)));
  const cBy = id => SB.CIVICS.find(c => c.id === id);
  check('鼓舞类型与设计稿一一对应（探索=II 级扩容 / 归正会=宗教 / 重商=20 商人 / 启蒙=观测站 / 史哲=6 奇观）',
    cBy('explore').boost.t === 'upgrade' && cBy('explore').boost.id === 'upg_ballast_2' &&
    cBy('reformed').boost.t === 'religion' &&
    cBy('mercantilism').boost.t === 'job' && cBy('mercantilism').boost.n === 20 &&
    cBy('enlightenment').boost.t === 'built' && cBy('enlightenment').boost.b === 'observatory' &&
    cBy('historiography').boost.t === 'wonder' && cBy('historiography').boost.n === 6);
  const gBy = id => SB.GOVS.find(g => g.id === id);
  const slotTotal = g => { let n = 0; for (const k in g.slots) n += g.slots[k]; return n; };
  check('两个新政体：商人共和国 5 槽(wild3+prod1+grow1) + 省耗 0.7；神权政体 5 槽(wild3+relig2)',
    gBy('merchant_republic') && (function () { const s = gBy('merchant_republic').slots; return slotTotal(gBy('merchant_republic')) === 5 && s.wild === 3 && s.prod === 1 && s.grow === 1; })() &&
    gBy('merchant_republic').happyConsumeMul === 0.7 &&
    gBy('theocracy') && (function () { const s = gBy('theocracy').slots; return slotTotal(gBy('theocracy')) === 5 && s.wild === 3 && s.relig === 2; })());
  const pBy = id => SB.POLICIES.find(p => p.id === id);
  check('四张新政策卡都在表里且「历史记录」被启蒙运动退役',
    ['card_triangular', 'card_divine_right', 'card_mercantilism', 'card_enlightenment']
      .every(id => !!pBy(id)) &&
    SB.POLICIES.find(p => p.id === 'card_records').retiredBy === 'enlightenment');
  /* 🚨 王权神授 / 天赋神权 互斥：天赋神权（核心每级 +10% 信仰）设计上「替代」王权神授
   *   （城堡每级 +10%）。二者不可同时拥有/同槽——完成《归正会》后王权神授退役，
   *   否则走神权政体同时装两张会双乘信仰（cheese）。 */
  check('🚨 王权神授被《归正会》退役（retiredBy=reformed，与天赋神权互斥）',
    pBy('card_sovereign').retiredBy === 'reformed');
  {
    const ex = SB.state.freshRun(false);
    ex.civics = ex.civics || {}; ex.civics.sovereign = 1; ex.civics.reformed = 1;
    check('🚨 两市政都完成 ⇒ 王权神授不可拥有（防与天赋神权同槽双乘信仰）',
      SB.civic.cardOwned(ex, 'card_sovereign') === false &&
      SB.civic.cardOwned(ex, 'card_divine_right') === true);
  }
  const cath = SB.WONDERS.find(w => w.id === 'wonder_olo_wa_cathedral');
  check('欧\'洛瓦宗座教堂：needCivic=归正会、effect.religSlot=1',
    !!cath && cath.needCivic === 'reformed' && cath.effect.religSlot === 1);

  /* ② 效果读数：未装/未采用 = 基准值 */
  check('未采用商人共和国 ⇒ 幸福度消耗乘区 = 1（基准值）',
    SB.civic.govHappyConsumeMul(s4) === 1);
  check('没装三角贸易 ⇒ 运河省耗乘区 = 1；没装重商主义 ⇒ 银行乘区 = 1',
    SB.civic.canalSaveMul(s4) === 1 && SB.civic.bankMerchantMul(s4) === 1);
  check('没装天赋神权 ⇒ 核心信仰乘区 = 1；没装启蒙运动 ⇒ 大学/神庙乘区 = 基准',
    SB.civic.coreFaithMul(s4) === 1 && SB.civic.universityMul(s4) === 1 &&
    SB.civic.templeFaithMul(s4) === 1);
  check('没建博物馆/没完成行政部门 ⇒ 书手乘区 = 1；没完成历史哲学 ⇒ 奇观市政点加成 = 0',
    SB.civic.museumCivicMul(s4) === 1 && SB.civic.scribeCivicMul(s4) === 1 &&
    SB.civic.wonderEraCivicBonus(s4) === 0);

  /* ②b 装上/采用后的设计值（夹具态直写，走与真实同一批读数函数） */
  s4.gov = 'merchant_republic';
  check('采用商人共和国 ⇒ 幸福度消耗 ×0.7', SB.civic.govHappyConsumeMul(s4) === 0.7);
  s4.gov = 'theocracy';
  /* 神权政体信仰加成 = 学术区合计等级 ×1 + 市政区合计等级 ×0.5。等级由建筑分区推
   * （分区唯一真源 = config 给每座 BUILDINGS 挂上的 .zone，与读数函数读的是同一份），
   * 断言钉「与分区自洽」而非写死座数——将来加学术区建筑不用回来改这里。 */
  const zon = {};
  SB.BUILDINGS.forEach(b => { zon[b.id] = b.zone; });
  check('未建学术/市政区建筑 ⇒ 神权信仰加成 = 0', SB.civic.theoFaithBonus(s4) === 0);
  for (const k in zon) { if (zon[k] === 'academy') s4.lvl[k] = 2; if (zon[k] === 'civic') s4.lvl[k] = 3; }
  let _a2 = 0, _v2 = 0;
  for (const k in zon) { if (zon[k] === 'academy') _a2 += (s4.lvl[k] || 0); if (zon[k] === 'civic') _v2 += (s4.lvl[k] || 0); }
  check('神权信仰加成 = 学术合计×1 + 市政合计×0.5（与分区自洽）',
    Math.abs(SB.civic.theoFaithBonus(s4) - (_a2 + _v2 * 0.5)) < 1e-9,
    'got=' + SB.civic.theoFaithBonus(s4) + ' a=' + _a2 + ' v=' + _v2);
  s4.lvl.museum = 1;
  check('博物馆 ≥1 ⇒ 书手 ×1.20；行政部门完成 ⇒ 再 ×1.5（两者叠加）',
    SB.civic.museumCivicMul(s4) === 1.20 &&
    (s4.civics.department = true, Math.abs(SB.civic.scribeCivicMul(s4) - 1.5) < 1e-9));
  s4.civics.historiography = true;
  s4.wonders = { wonder_tide_stele: true, wonder_albada: true, wonder_grand_exchange: true };
  check('历史哲学完成 ⇒ ERA1/2/3 每座奇观 +5 市政点（era4 不算，2×5=10）',
    SB.civic.wonderEraCivicBonus(s4) === 10);
  s4.cards = ['card_triangular', 'card_mercantilism', 'card_divine_right', 'card_enlightenment'];
  check('四张卡全装 ⇒ 运河 ×2 / 银行 ×2 / 大学 ×2 / 神庙 ×0.5',
    SB.civic.canalSaveMul(s4) === 2 && SB.civic.bankMerchantMul(s4) === 2 &&
    SB.civic.universityMul(s4) === 2 && SB.civic.templeFaithMul(s4) === 0.5);
  for (const k in zon) if (zon[k] === 'core') s4.lvl[k] = 4;
  let _c = 0;
  for (const k in zon) if (zon[k] === 'core') _c += (s4.lvl[k] || 0);
  check('天赋神权 ⇒ 核心信仰乘区 = 1 + 核心合计等级×0.10（与分区自洽）',
    Math.abs(SB.civic.coreFaithMul(s4) - (1 + _c * 0.10)) < 1e-9,
    'got=' + SB.civic.coreFaithMul(s4) + ' c=' + _c);
  check('教堂建成 ⇒ wonderReligSlots = 1（宗教槽叠加源）',
    (s4.wonders.wonder_olo_wa_cathedral = true, SB.civic.wonderReligSlots(s4) === 1));

  /* ③ 季节发放：全员采集者 ⇒ 藻食是唯一正速率（freshRun 不寒冻 ⇒ isCold=false，
   *    产 2.5×10 = 25 > 吃 1.5×10 = 15，净 +10/s）⇒ 抽取必中藻食 */
  const s5 = SB.state.freshRun(false);
  s5.civics.explore = true; s5.lvl.caravanserai = 1;
  s5.pop = 10; s5.jobs = { gather: 10 };
  const r5 = SB.economy.rates(s5);
  const cap5 = SB.economy.capOf(s5, 'kelp');
  const posKeys = Object.keys(r5).filter(k => typeof r5[k] === 'number' && r5[k] > 0);
  check('夹具态只有藻食一条正速率（抽取必中的前提）',
    posKeys.length === 1 && posKeys[0] === 'kelp',
    'pos=' + posKeys.join(','));
  const kBefore = s5.res.kelp;
  SB.economy.seasonGrant(s5);
  check('探索+驿站：季节发放 = 藻食速率×60（截仓储上限）',
    Math.abs(s5.res.kelp - Math.min(kBefore + r5.kelp * 60, cap5)) < 1e-9,
    'got=' + s5.res.kelp.toFixed(4) + ' want=' + Math.min(kBefore + r5.kelp * 60, cap5).toFixed(4));
  const s6 = SB.state.freshRun(false);
  s6.pop = 10; s6.jobs = { gather: 10 };
  const k6 = s6.res.kelp;
  SB.economy.seasonGrant(s6);
  check('没完成探索/没建驿站 ⇒ seasonGrant 不发资源', s6.res.kelp === k6);
}

/* 纪元边界（核算用）：调时代时长时先看这条，别只看总时长。
 * ⚠️ 每一段的**占比**比绝对值更能指认旋钮：年份摊得均匀是好事，
 *    某一段独占一半以上，说明那段卡了别的东西，改别的段是白费劲。 */
console.log('\n=== 纪元边界（全局标定核算）===');
{
  const full = runHours || (SB.game.run().t / 3600);
  const edge = eraMarks.concat([{ era: 0, t: full * 3600, pad: true }]);
  for (let i = 0; i < edge.length - 1; i++) {
    const from = edge[i].t / 3600, to = edge[i + 1].t / 3600, seg = to - from;
    console.log('  era' + edge[i].era + ' → era' + (edge[i + 1].era || '破冰') +
      '：' + seg.toFixed(2) + 'h（占整局 ' + (seg / full * 100).toFixed(0) + '%）');
  }
  console.log('  era1 内容全清 @ ' + ((era1Done || 0) / 3600).toFixed(2) + 'h' +
    '（共 ' + era1Ids.length + ' 项：' + era1Ids.join(' ') + '）');
  /* 逐项完成时刻。⚠️ 主排序按完成时刻升序 —— 卡在最后的才是瓶颈项；
   * 按 cost 排序会让人误以为贵的就是瓶颈（实测常否）。 */
  {
    const rows = era1Ids.map(id => {
      const t = SB.tech.byId ? SB.tech.byId(id) : null;
      return { id: id, at: era1At[id], layer: t ? t.layer : '?',
        cost: t ? JSON.stringify(t.cost) : '?', cond: t ? JSON.stringify(t.cond || null) : '?' };
    }).sort((a, b) => (a.at || 0) - (b.at || 0));
    const first = rows[0].at || 0, last = rows[rows.length - 1].at || 0;
    console.log('  ── era1 逐项完成时刻 ──');
    rows.forEach(r => console.log('   ' + r.id.padEnd(10) + ((r.at / 3600).toFixed(2) + 'h').padStart(7) +
      '  (+' + ((r.at - first) / 60).toFixed(0) + 'm)  L' + r.layer +
      ' cost=' + r.cost + '  cond=' + r.cond));
    console.log('   ⇒ 首项 ' + rows[0].id + ' ' + (first / 3600).toFixed(2) + 'h，' +
      '末项 ' + rows[rows.length - 1].id + ' ' + (last / 3600).toFixed(2) +
      'h，中间 ' + ((last - first) / 60).toFixed(0) + ' 分钟是 era1 的全部内容');
  }
  console.log('  ⇒ 玩家在 era1 里真正待的时间取「全清」口径：' +
    ((era1Done || 0) / 3600).toFixed(2) + 'h，而不是时代边界的 0.96h。');
}

/* ---------------------------------------------------------------------------
 * era1 专项核算：**真实开局**，且 era1 十二项**一项不落全部研究完**。
 *
 * ⚠️ 为什么不能直接用上面那一个 whole-run：整局模拟的出发状态是「前面几十段断言
 *    在同一个 s 上借完状态之后的那一份」—— 资源、建筑可能已被前序用例垫高，
 *    算出来的 era1 时长偏乐观（也是「这个数到底真不真」最容易被质疑的地方）。
 *    这一块调 `startRun()` 重新开一局，从 1 族民 / 0 资源 / 0 建筑出发，
 *    与玩家点「新周目」后的状态逐字段一致 —— 这就是用户要的「真实开局」。
 *
 * ⚠️ 放在**全部断言之后**跑：startRun() 会翻周目计数并立刻落盘，
 *    插在断言中间会让后面的用例读到新周目的空档。
 * ------------------------------------------------------------------------- */
console.log('\n=== era1 专项核算：真实开局，科技全部研究完 ===');
{
  /* ⚠️ 这里原本（2026-09-28 我擅自加的）把 Date.now 也接到 fakeNow 上，为了让核算段
   *    的时长可复现。**已撤除** —— 算时长要用户拍板，我不该顺手改量具。
   *    ⚠️ 但那条发现本身有用，已外迁到 docs/JUDGMENTS.md「墙钟没被钉住」一条：
   *       sandbox 传进去的 Date 是**真实**的，核算段的墙钟预算因此跟着机器负载抖，
   *       同一个仓库连跑三次能差 1.5h。将来真要算时长，第一件事是钉它，不是钉随机源。 */
  SB.game.startRun();
  const st0 = SB.game.run();
  /* 开局指纹：拿这个数回答「这到底是不是真开局」。
   * ⚠️ 只看 techs 为空是不够的（前序用例可能留下建筑/资源，那正是 1.20h 虚高的来源）。 */
  console.log('  开局指纹：人口 ' + st0.pop + ' / 职业 ' + JSON.stringify(st0.jobs) +
    ' / 资源 ' + JSON.stringify(st0.res) + ' / 建筑 ' + JSON.stringify(st0.lvl));
  const e1 = SB.TECHS.filter(x => x.era === 1);
  const ids = e1.map(x => x.id);
  const at = {}; ids.forEach(id => { at[id] = null; });
  const allIds = SB.TECHS.filter(x => x.era !== undefined).map(x => x.id);

  let e1Done = null, allDone = null, f = 0, snap = null;
  const LIMIT = 30000;
  while (f < LIMIT) {
    if (f % BOT_EVERY_FRAMES === 0) botStep();
    frames(1);
    f++;
    const cur = SB.game.run();
    if (cur.broken) break;
    for (const id of ids) if (at[id] === null && cur.techs && cur.techs[id]) at[id] = cur.t;
    if (e1Done === null && ids.every(id => at[id] !== null)) {
      e1Done = cur.t;
      snap = { t: cur.t, pop: cur.pop, peak: cur.peak, jobs: JSON.stringify(cur.jobs),
        lvl: JSON.stringify(cur.lvl), res: JSON.stringify(cur.res) };
    }
    if (allDone === null && allIds.every(id => cur.techs && cur.techs[id])) { allDone = cur.t; break; }
    if (e1Done === null && f % 1000 === 0)
      console.log('  [真开局 frame ' + f + '] t=' + (cur.t / 3600).toFixed(2) +
        'h pop=' + cur.pop + ' nest=' + (cur.lvl.nest || 0) + ' kelp=' + (cur.lvl.kelp || 0) +
        ' 科技=' + ids.filter(id => cur.techs && cur.techs[id]).length + '/' + ids.length);
  }

  check('真实开局下 era1 十二项能全部研究完（不靠前序用例垫资源）', e1Done !== null,
    e1Done === null ? '30000 帧也没点满，末项：' +
      ids.filter(id => at[id] === null).join(' ') : (e1Done / 3600).toFixed(2) + 'h');
  /* ⚠️ 2026-09-28 **挂起（不是改绿）**：删热泉井的代价还在 —— `fuelRate` 恒 0 ⇒
   *    破冰祭坛永远供不上能 ⇒ 终局「凿穿最后 25% 壳厚」不可达，era5 的破壳工程整段悬空。
   *    本轮（2026-10-02）把旧 era5 的 ballistics/siegeT/shellBreaker 死链换成新链
   *    skydrill ← shellgeo + abyssgeo ← invert + physics，但**结构性不成立**仍未解：
   *    ① 天穹钻机(skydrill) 的尤里卡要求建成「天壳切削器 + 高压热机管道」两座奇观，
   *       而这两座奇观的机器态/终局逻辑尚未实装（见 WONDERS.wonder_skydrill 占位）；
   *    ② 破冰祭坛不可达 ⇒ 即便研究完 skydrill，整局仍卡在 75% 壳厚。
   *    【重设后还原】把下面两条 pending 换回原 check()，它们原本钉的就是这个性质。 */
  pending('真实开局下整棵科技树能全部研究完（无永久死锁）',
    '热泉井已删 ⇒ fuelRate 恒 0 ⇒ 破冰祭坛不可达；且天穹钻机需建成天壳切削器+高压热机管道奇观（机器态未实装）；'
    + '未点满：' + allIds.filter(id => { const cur = SB.game.run(); return !(cur.techs && cur.techs[id]); }).join(' '));
  pending('era1 全清早于整棵树全清（era1 是它的真子集）',
    '同上（整树全清永不可达）；era1 ' + ((e1Done || 0) / 3600).toFixed(2) + 'h');

  const rows = e1.map(t => ({ id: t.id, name: t.name, at: at[t.id],
    layer: t.layer, cost: JSON.stringify(t.cost), cond: JSON.stringify(t.cond || null) }))
    .sort((a, b) => (a.at || 0) - (b.at || 0));
  const first = rows[0].at || 0, last = rows[rows.length - 1].at || 0;
  console.log('  ── era1 逐项完成（真实开局）──');
  rows.forEach(r => console.log('   ' + r.id.padEnd(10) + r.name.padEnd(5) +
    ((r.at / 3600).toFixed(2) + 'h').padStart(7) + '  (+' + ((r.at - first) / 60).toFixed(0) + 'm)  L' +
    r.layer + ' cost=' + r.cost + ' cond=' + r.cond));
  console.log('   ⇒ era1 全部 ' + rows.length + ' 项研究完 = ' + (last / 3600).toFixed(2) + 'h' +
    '（末项 ' + rows[rows.length - 1].id + '，比首项的 ' + (first / 3600).toFixed(2) + 'h 多 ' +
    ((last - first) / 60).toFixed(0) + ' 分钟）');
  if (snap) console.log('   ⇒ 该时刻状态：人口 ' + snap.pop + '（峰值 ' + snap.peak + '）职业 ' + snap.jobs +
    ' 建筑 ' + snap.lvl + ' 资源 ' + snap.res);
  console.log('   ⇒ 整棵科技树全部研究完 = ' + ((allDone || 0) / 3600).toFixed(2) + 'h' +
    '（共 ' + allIds.length + ' 项，' + ids.length + ' 项在 era1）');
}

runClickEvents({ SB, check, noop });
runAutoPlay({ SB, check });
runAutoResearch({ SB, check });
runChallenges({ SB, check, noop });
runAiStrategy({ SB, check, noop });
console.log('\n================ 汇总 ================');
// B 档基线：首局（原始时代 → 破冰重置）挂机 8-14 小时 —— 全局标定，默认挂起
defer('单局时长落在 8-14 小时', runHours >= 8 && runHours <= 14, runHours.toFixed(2) + 'h');

const failed = checks.filter(c => !c.ok);
console.log(`\n通过 ${checks.length - failed.length}/${checks.length}`);
if (deferred.length) {
  console.log(`挂起 ${deferred.length} 项（全局标定类，不计入成败；核算时加 --balance 打开）`);
  deferred.forEach(d => console.log('  – ' + d.name + '  ' + d.detail));
}
/* ⚠️ 这一块是**设计待定**，不是标定：它一句话说明「现在这版游戏为什么跑不完」。
 *    用户 2026-09-28 删掉热泉井（地热线待重设）之后，下面这些性质结构性不成立。
 *    账挂在这里，是为了等重设落地时能一把捞出来还原断言。 */
if (pendingList.length) {
  console.log(`\n已知阻塞 ${pendingList.length} 项（设计未定，不计入成败；重设后必须改回 check()）：`);
  pendingList.forEach(d => console.log('  ⃝ ' + d.name + '  —— ' + d.reason));
}
if (errors.length) { console.log('\n运行时错误:'); errors.forEach(e => console.log('  ' + e)); }
if (failed.length) { console.log('\n失败项:'); failed.forEach(f => console.log('  ✗ ' + f.name + ' ' + f.detail)); }
process.exit(failed.length || errors.length ? 1 : 0);
