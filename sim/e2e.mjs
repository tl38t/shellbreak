/* 天壳 / SHELLBREAK — 端到端冒烟
 * 用假 DOM 加载 index.html 里声明的全部脚本（含 game / ui / main），
 * 再驱动真实点击事件跑完整一局：铺基建 → 冰封期 → 剥壳 → 破冰 → 结算 → 下一周目。
 * 目的不是「不崩」，而是证明这条链路真的走得通。
 * 用法：node sim/e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAll, ROOT, mulberry32 } from './load-sb.mjs';

const errors = [];
const checks = [];
const deferred = [];                   // 挂起的「全局标定类」断言：默认不计入成败
const noop = () => {};                 // emit 的空实现：本文件里部分断言直接跑 economy.tick
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
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
    _els: els,
    _q: q,
    readyState: 'complete',
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
        out = ['village', 'folk', 'tech', 'civic', 'workshop', 'dig', 'meta'].map((t, i) => {
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
  /* ⚠️ 2026-09-28：`jobs.craft`（匠人）**这一项从本条里摘出去了** —— 匠作(craftT)已随用户
   *    指令删除，而「职业解锁」全仓只有一条通路（techs.js 里各科技的 `eff.unlockJob`，
   *    folk.js 反查建表）⇒ `jobs.craft` 从此**恒为 0**。留着那一项，本条会退化成
   *    **恒绿的空跑**（预分配改成什么样都是绿），正是「夹具还在、力已经不作用了」那种假绿。 */
  check('开局职业全 0（没人被预分配）',
    s.jobs.gather === 0 && s.jobs.scholar === 0,
    'gather=' + s.jobs.gather + ' craft=' + s.jobs.craft + ' scholar=' + s.jobs.scholar);
  /* ⚠️ 2026-09-28：把「匠人恒 0」钉成**真命题**——钉的是「全树没有任何科技给它发解锁口」，
   *    而不是「它现在是 0」（后者在 craftT 删掉后已经恒真，不构成任何约束）。
   *    这条红的唯一含义是：但又有人在给匠人挂解锁口，或 folk 的反查表漏读了一项。 */
  {
    const craftUnlockers = [];
    for (let e = 1; e <= 5; e++) (SB.tech.byEra(e) || []).forEach(t => {
      if (((t.eff || {}).unlockJob) && t.eff.unlockJob.indexOf('craft') >= 0) craftUnlockers.push(t.id);
    });
    check('匠人职业没有任何解锁口（craftT 已删 ⇒ jobs.craft 恒 0）',
      craftUnlockers.length === 0, '给 craft 发解锁口的科技：' + (craftUnlockers.join(',') || '无'));
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
  /* 按钮的读数必须与常数同源：这里把「渲染出来的文案」和「实际入账的量」焊在一起，
   * 免得以后改了常数忘了改提示，玩家点一下发现和按钮上写的不一样。 */
  check('采集按钮的读数与 GATHER 常数同源',
    g('pane-village').indexOf(SB.GATHER.coral + '') !== -1 && SB.GATHER.coral > 0,
    '珊瑚读数 ' + SB.GATHER.coral + ' / 面板含 =' + (g('pane-village').indexOf('+0.1') >= 0));

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
  const pane0 = g('pane-village');
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
  check('库存达首级价 30% 时工坊解锁', SB.habitat.unlocked(s, SB.habitat.buildingById('workshop')), 'coral 400 ≥ 120');
  SB.game.markDirty(); SB.game.render();
  check('露头后建筑面板同步出现工坊行', g('pane-village').indexOf('工坊') !== -1);
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
    const pv = g('pane-village');
    const ck = SB.economy.costTxt(SB.economy.costOf(s, 'kelp'));
    const cb = SB.economy.costTxt(SB.economy.costOf(s, 'ballast'));
    check('建筑按钮始终摊开成本（够钱时也写着要多少）',
      pv.indexOf('升级 ' + ck) !== -1 && pv.indexOf('建造 ' + cb) !== -1,
      '升级文案「升级 ' + ck + '」 / 建造文案「建造 ' + cb + '」');
    check('反向对照：没有「光秃秃的建造/升级」按钮（把成本去掉这条就该红）',
      !/>(建造|升级)</.test(pv), '');
    s.lvl.kelp = bak.lv; s.res.kelp = bak.kelp; s.res.coral = bak.coral;
    if (!bak.lighting) delete s.techs.lighting;
    SB.game.markDirty(); SB.ui.render.renderPanes();
  }

  /* unlockScheme 链条：精铁达阈值才解锁祭坛。
   * ⚠️ 2026-09-28 **换载体**：原先钉的是**热泉井**（`unlockScheme:{iron,60}`），而热泉井
   *    已随用户指令删除 ⇒ 那份 `unlockScheme` 一并没了。全仓扫下来 **unlockScheme 现在只剩
   *    破冰祭坛一处**（`{iron, 300}`）⇒ 这条断言改挂祭坛，语义一字未改：
   *    「资源不足 ⇒ 锁着，与科技无关」这一道墙。
   *    具体做法与原来**同构**：先把另一道墙（祭坛的纪元闸门 MIRACLE_ERA=5）拆掉，
   *    否则测出来的失败其实是纪元那道墙，断言名不副实。用一次性状态，
   *    免得把 era=5 / iron 这类夹具漏进后面的端到端整局跑。 */
  const ts = SB.state.freshRun(false);
  ts.era = SB.CFG.MIRACLE_ERA; ts.techs.siegeT = true;
  check('精铁不足时祭坛仍锁着', !SB.habitat.unlocked(ts, SB.habitat.buildingById('miracle')), 'iron 0 < 300');
  ts.res.iron = 300;
  check('精铁达 300 时祭坛解锁（纪元墙与科技墙都已拆）',
    SB.habitat.unlocked(ts, SB.habitat.buildingById('miracle')), 'iron 300');
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

  /* 奇迹装置的硬纪元闸门 —— 用户明确要的「到工业时代才能建造破除天壳的奇迹装置」。
   * 这条断言盯的是**光有科技不够**：先把祭坛的科技前置全部满足（线上做不到，
   * 这里直接写死来单独检验纪元那道墙），再把纪元压回四，祭坛仍必须锁着。
   * 少了这条，跳级研究就能提前把祭坛偷出来，用户要的那道闸门等于没设。
   * 用一份一次性状态来测，避免把 iron 这类夹具值漏进后面的章节。
   * ⚠️ 2026-09-28：`t2.lvl.geyser = 1` **一并删除**——热泉井已删，写这个键不会报错，
   *    只会在一堆看不出问题的夹具里多出一个**永远为 0 的等级**。 */
  const miracle = SB.habitat.buildingById('miracle');
  const t2 = SB.state.freshRun(false);
  t2.era = 4;
  t2.techs.siegeT = true; t2.techs.shellBreaker = true;
  t2.res.iron = 9e5;
  check('纪元四：科技前置全满足，祭坛仍锁着',
    !SB.habitat.unlocked(t2, miracle), 'MIRACLE_ERA=' + SB.CFG.MIRACLE_ERA);
  check('纪元四：锁着的理由说的是纪元，不是资源',
    /破壳纪/.test(SB.habitat.lockReason(t2, miracle) || ''), SB.habitat.lockReason(t2, miracle));
  t2.era = SB.CFG.MIRACLE_ERA;
  check('纪元五：纪元闸门解除，祭坛解锁', SB.habitat.unlocked(t2, miracle), 'era=' + t2.era);

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
  /* ⚠️ 阈值取 7 有出处，不是跟着树长随手加的：
   *    ① 破壳链的物理下限仍是 6（techs.js 顶部推过：shellBreaker ≥ siegeT+1 ≥
   *       ballistics+2 ≥ turbine+3 ≥ ignition+4 ≥ hearthfire+5）；
   *    ② 纪元一 2026-09-26 按用户规格重排成**四层**（结绳 → 四个方向 → 加深 → 成事），
   *       两者叠加 ⇒ 最深 7。
   *    要压到 6 只能动纪元一那四层本身（改 reqs 压不动，它是形状不是深度）。 */
  check('最深科技 ≤ 7 层（破壳链下限 6 + 纪元一重排后的 4 层）', maxD <= 7,
    '最深 ' + maxD + ' 层：' + at(maxD).map(t => t.id).join(','));
  check('第二层 ≥ 3 项可并行（不是一根直链）', at(1).length >= 3, 'L1=' + at(1).length + ' 项');
  check('第三层 ≥ 4 项可并行', at(2).length + at(3).length >= 6,
    'L2=' + at(2).length + ' L3=' + at(3).length);

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

/* ---------------- 纪元三（硫泉）：钢与热液能（ERA3 终版口径，2026-09-29）----------------
 * 整表替换旧 6 项（冶炼术/烟囱炉/机械/精铁术/深潜/壳骨），新线 5 项。
 * 这里同时钉「数据形状」和「cond 真的能算」两类命题——前者靠遍历表，后者靠造态喂 condMet。 */
console.log('\n=== 纪元三 · 钢与热液能 ===');
{
  const T = SB.TECHS, m = {};
  T.forEach(t => { m[t.id] = t; });
  const e3 = T.filter(t => t.era === 3).map(t => t.id).sort();
  const e3want = ['apprentice', 'castle', 'education', 'horseshoe', 'metalrefine'];
  check('纪元三恰好 5 项（apprentice/castle/education/horseshoe/metalrefine）',
    e3.length === e3want.length && e3want.every(x => e3.indexOf(x) >= 0) && e3.every(x => e3want.indexOf(x) >= 0),
    '实=' + e3.join(','));

  /* key 节点 = 学徒制 + 金属精炼（纪元推进的门槛）。 */
  const keys3 = SB.tech.keysOf(3).map(t => t.id).sort();
  check('纪元三 key = [学徒制, 金属精炼]',
    keys3.length === 2 && keys3[0] === 'apprentice' && keys3[1] === 'metalrefine',
    'keys=' + keys3.join(','));

  /* 五项尤里卡类型各就各位（数据形状）。 */
  const c = id => (m[id] && m[id].cond) || {};
  check('学徒制尤里卡 = 买齐三件铁制工具',
    c('apprentice').t === 'tools' &&
    (c('apprentice').ids || []).join() === 'tool_ironSickle,tool_ironAxe,tool_ironPick',
    'cond=' + JSON.stringify(c('apprentice')));
  check('马镫尤里卡 = 5 名商人',
    c('horseshoe').t === 'job' && c('horseshoe').j === 'merchant' && c('horseshoe').n === 5,
    'cond=' + JSON.stringify(c('horseshoe')));
  check('教育尤里卡 = 三级研究所',
    c('education').t === 'built' && c('education').b === 'institute' && c('education').n === 3,
    'cond=' + JSON.stringify(c('education')));
  check('金属精炼尤里卡 = 完成鱼骨矿井（装填升级）',
    c('metalrefine').t === 'upgrade' && c('metalrefine').id === 'fishbonemine',
    'cond=' + JSON.stringify(c('metalrefine')));
  check('城堡尤里卡 = 启用三槽政体（排除酋邦制）',
    c('castle').t === 'gov' && c('castle').wild === 3,
    'cond=' + JSON.stringify(c('castle')));

  /* 金属精炼解锁热液汽轮机 + 热液工坊（与建筑侧 requiredTech 双写一致，见下块）。 */
  check('金属精炼解锁 热液汽轮机 + 热液工坊',
    (m.metalrefine.eff.unlockBuild || []).join() === 'hydroturbine,hydroshop',
    'unlockBuild=' + JSON.stringify(m.metalrefine.eff.unlockBuild));

  /* ⚠️ cond 真的能算（功能验证，不是只看形状）：造态喂 condMet，逐项证「达成/未达成」分流正确。
   *    只测形状不测算，等于默认 condMet 那五个新分支都对——而它们正是本轮新加的代码。 */
  const st = SB.state.freshRun(false);
  check('学徒制: 三件铁制工具未买齐 ⇒ 未达成', !SB.tech.condMet(st, c('apprentice')));
  st.tools = { tool_ironSickle: true, tool_ironAxe: true, tool_ironPick: true };
  check('学徒制: 三件铁制工具买齐 ⇒ 达成', SB.tech.condMet(st, c('apprentice')));

  check('马镫: 商人 < 5 ⇒ 未达成', !SB.tech.condMet(st, c('horseshoe')));
  st.jobs = st.jobs || {}; st.jobs.merchant = 5;
  check('马镫: 商人 = 5 ⇒ 达成', SB.tech.condMet(st, c('horseshoe')));

  check('教育: 研究所 < 3 ⇒ 未达成', !SB.tech.condMet(st, c('education')));
  st.lvl = st.lvl || {}; st.lvl.institute = 3;
  check('教育: 研究所 = 3 ⇒ 达成', SB.tech.condMet(st, c('education')));

  check('金属精炼: 鱼骨矿井未装 ⇒ 未达成', !SB.tech.condMet(st, c('metalrefine')));
  st.upgrades = st.upgrades || {}; st.upgrades.fishbonemine = true;
  check('金属精炼: 鱼骨矿井已装 ⇒ 达成', SB.tech.condMet(st, c('metalrefine')));

  check('城堡: 酋邦制(1 槽) ⇒ 未达成', !SB.tech.condMet(st, c('castle')));
  st.gov = 'autocracy';
  check('城堡: 三槽政体(autocracy) ⇒ 达成', SB.tech.condMet(st, c('castle')));
}

/* ---------------- 纪元三：新资源 / 建筑 / 工坊升级 / 奇观 / 制造（数据自查）----------------
 * 钢与热液能系统落地后，所有「新增条目」必须两边对账：声明在 config、落点在 state/economy。 */
console.log('\n=== 纪元三 · 资源/建筑/升级/奇观 落地 ===');
{
  /* ① 三种新资源都进了 RESS，且 freshRun 台账 seed 了初值（防 addRes 漏键染 NaN）。 */
  const newRes = ['steel', 'hydro', 'steelPart'];
  const missingDef = newRes.filter(r => !SB.RESS[r]);
  check('钢/热液能/钢制零件 都已进 RESS', missingDef.length === 0, '缺=' + missingDef.join(','));
  const fr = SB.state.freshRun(false);
  const seedMiss = newRes.filter(r => fr.res[r] !== 0 || fr.got[r] !== 0);
  check('freshRun 的 res/got 台账都 seed 了三种新资源初值 0', seedMiss.length === 0,
    '漏=' + seedMiss.join(','));

  /* ② 热液汽轮机 / 热液工坊 建筑存在且 requiredTech=['metalrefine']（与 metalrefine.unlockBuild 双写）。 */
  const B = SB.BUILDINGS || [], bm = {};
  B.forEach(b => { bm[b.id] = b; });
  check('热液汽轮机存在且 requiredTech=[metalrefine]',
    !!bm.hydroturbine && (bm.hydroturbine.requiredTech || []).join() === 'metalrefine',
    'hydroturbine=' + JSON.stringify(bm.hydroturbine && bm.hydroturbine.requiredTech));
  check('热液工坊存在且 requiredTech=[metalrefine]',
    !!bm.hydroshop && (bm.hydroshop.requiredTech || []).join() === 'metalrefine',
    'hydroshop=' + JSON.stringify(bm.hydroshop && bm.hydroshop.requiredTech));

  /* ③ 工坊升级五项（第三种形态，存 s.upgrades）need 与 effect 键都对账。 */
  const U = SB.UPGRADES || [], um = {};
  U.forEach(u => { um[u.id] = u; });
  check('upg_fishbonemine: need=apprentice, mineSilt/mineWarm 生效',
    um.upg_fishbonemine && um.upg_fishbonemine.need === 'apprentice' &&
    um.upg_fishbonemine.mineSilt === 0.5 && um.upg_fishbonemine.mineWarm === 10.0,
    'fishbonemine=' + JSON.stringify(um.upg_fishbonemine));
  check('upg_autoshop: need=metalrefine, craftRatio=0.10',
    um.upg_autoshop && um.upg_autoshop.need === 'metalrefine' && um.upg_autoshop.craftRatio === 0.10,
    'autoshop=' + JSON.stringify(um.upg_autoshop));
  check('upg_university: need=education, instituteSci=0.5（与 BLD.instituteSci 相加 +100%）',
    um.upg_university && um.upg_university.need === 'education' && um.upg_university.instituteSci === 0.5,
    'university=' + JSON.stringify(um.upg_university));
  check('upg_castle: need=castle, hallSaveMul/castleCap 生效',
    um.upg_castle && um.upg_castle.need === 'castle' &&
    um.upg_castle.hallSaveMul === 0.5 && um.upg_castle.castleCap === 50,
    'castle=' + JSON.stringify(um.upg_castle));
  check('upg_horseshoe: need=horseshoe, luxuryMul=0.5（与马具相乘 +100%）',
    um.upg_horseshoe && um.upg_horseshoe.need === 'horseshoe' && um.upg_horseshoe.luxuryMul === 0.5,
    'horseshoe=' + JSON.stringify(um.upg_horseshoe));

  /* ④ 阿尔巴达热液大学奇观：need=education，effect.minePop。 */
  const W = SB.WONDERS || {}, wm = {};
  W.forEach(w => { wm[w.id] = w; });
  check('wonder_albada: need=education, effect.minePop',
    wm.wonder_albada && wm.wonder_albada.need === 'education' && wm.wonder_albada.effect &&
    wm.wonder_albada.effect.minePop === true,
    'albada=' + JSON.stringify(wm.wonder_albada));

  /* ⑤ 钢制零件制造：need=metalrefine，25 钢→1 件。 */
  const C = SB.CRAFTS || [], cm = {};
  C.forEach(x => { cm[x.id] = x; });
  check('craft_steelpart: need=metalrefine, 25 钢→1 件',
    cm.craft_steelpart && cm.craft_steelpart.need === 'metalrefine' &&
    cm.craft_steelpart.in && cm.craft_steelpart.in.steel === 25 && cm.craft_steelpart.out === 1,
    'steelpart=' + JSON.stringify(cm.craft_steelpart));
}

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

  /* ④ 资源可见性（2026-09-30）：解锁前不显示，工艺资源独立分区。 */
  const core = ['kelp', 'coral', 'stone', 'silt', 'warmstone', 'iron'];
  const hiddenCore = core.filter(r => !SB.economy.resUnlocked(fr, r));
  check('核心资源开局即显示（无 unlock）', hiddenCore.length === 0, '被隐藏=' + hiddenCore.join(','));
  const craftHidden = ['stoneBeam', 'ironBracket', 'rope', 'hardCoral', 'steel', 'hydro', 'steelPart']
    .filter(r => SB.economy.resUnlocked(fr, r));
  check('工艺资源解锁前全部隐藏', craftHidden.length === 0, '误显示=' + craftHidden.join(','));
  check('科技未研究 ⇒ 科技点不显示', !SB.economy.resUnlocked(fr, 'science'));
  check('神庙未建 ⇒ 市政点不显示', !SB.economy.resUnlocked(fr, 'culture'));
  check('商人未派 ⇒ 奢侈品不显示', !SB.economy.resUnlocked(fr, 'luxury'));
  check('神学未解锁 ⇒ 信仰不显示', !SB.economy.resUnlocked(fr, 'faith'));
  check('热泉井已删 ⇒ 地热永不显示', !SB.economy.resUnlocked(fr, 'fuel'));
  fr.lvl = fr.lvl || {}; fr.lvl.workshop = 1;
  check('建成工坊 ⇒ 石梁/硬化珊瑚显示',
    SB.economy.resUnlocked(fr, 'stoneBeam') && SB.economy.resUnlocked(fr, 'hardCoral'));
  fr.techs = fr.techs || {}; fr.techs.metalrefine = true;
  check('研究金属精炼 ⇒ 钢/热液能/钢制零件显示',
    SB.economy.resUnlocked(fr, 'steel') && SB.economy.resUnlocked(fr, 'hydro') && SB.economy.resUnlocked(fr, 'steelPart'));
  fr.techs.scholarT = true; fr.lvl.temple = 1; fr.jobs = { merchant: 1 }; fr.civics = { theology: true };
  check('科技/神庙/商人/神学解锁后对应资源显示',
    SB.economy.resUnlocked(fr, 'science') && SB.economy.resUnlocked(fr, 'culture') &&
    SB.economy.resUnlocked(fr, 'luxury') && SB.economy.resUnlocked(fr, 'faith'));
  const craftKind = ['stoneBeam', 'ironBracket', 'rope', 'hardCoral', 'steel', 'hydro', 'steelPart']
    .filter(r => SB.RESS[r].kind !== 'craft');
  check('7 个工艺资源均标 kind:craft', craftKind.length === 0, '未标=' + craftKind.join(','));
}

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
    library: 'academy', miracle: 'break' };
  const wrong = Object.keys(expect).filter(k => {
    const b = B.find(x => x.id === k); return !b || b.zone !== expect[k];
  });
  check('关键建筑分区归属符合用户拍板（灯塔/海藻仓/压舱仓→贸易区域等）',
    wrong.length === 0, wrong.map(k => k + '≠' + (B.find(x => x.id === k) || {}).zone).join(','));
  check('贸易区域含灯塔/海藻仓/压舱仓三座',
    ['lighthouse', 'kelpstore', 'ballast'].every(id => (B.find(x => x.id === id) || {}).zone === 'trade'),
    'trade=' + B.filter(b => b.zone === 'trade').map(b => b.id).join(','));
}

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

  /* 设计意图断言（2026-09-27 按用户拍的新配比重写）。
   * 旧版问的是「第 5 座礁口巢起石屋更划算」，拿**不同等级**的两个房子比：ratio 1.15 年代
   * 那是真交叉点，ratio 2.5 之后**交叉点不存在了** —— 两档同为 2.5、石屋 +4 / 巢 +2，
   * 每人口成本之比恒为 (C首/4)÷(10/2) = C首/20 = 40/20 = **2**，与等级无关。
   * 所以这条断言现在锁的是**现状**（石屋恒贵一倍），不再锁「石屋更划算」。
   * ⚠️ 要它重新出现交叉点，只有把石屋首级压到 20 珊瑚（比值 1，与巢同价）。 */
  let houseRatioBad = null;
  for (let n = 1; n <= 8 && !houseRatioBad; n++) {
    const sn = SB.state.freshRun(false); sn.lvl.nest = n - 1;
    const sh = SB.state.freshRun(false); sh.lvl.coralhouse = n - 1;
    const perNest = SB.economy.costOf(sn, 'nest').coral / 2;
    const perHouse = SB.economy.costOf(sh, 'coralhouse').coral / 4;
    // 容差 0.1：costOf 对每级成本做 Math.ceil，2.5^n 的小数部分会被抹平，比值在 1.98 附近抖
    if (perHouse < perNest || Math.abs(perHouse / perNest - 2) > 0.1)
      houseRatioBad = `第${n}级 巢${perNest} vs 屋${perHouse}（比值 ${(perHouse / perNest).toFixed(3)}）`;
  }
  check('住房两档同等级比：石屋每人口成本恒为礁口巢的 2 倍（ratio 2.5 后无交叉点）',
    !houseRatioBad, houseRatioBad || '巢 5.00 / 屋 10.00 珊瑚每人口，逐级恒 2 倍');
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

  /* 人口硬上限（2026-09-26 恢复真硬上限）——新机制的护栏，缺了它等于没有回归保护。
   * 旧规则是 `pop >= popCap` 就停生；2026-09-25 那版改成「超住只减速」，实测没约束力
   * （一座住房都不建、上限 0，41 分钟也能养到 18 人，比建 1 座礁口巢只慢 7%），
   * 而屏幕上同时写着「族民 7（人口上限 2）」自相矛盾（用户报的 bug）⇒ 改回来。
   * 注意「人口写不进上限」不报错，只会让住房这条线空转，所以下面全部用真跑来验证。 */
  {
    /* 造一局并锁死藻食：这里要验证的是**住房这道闸门**，不是经济能否自给自足
     * （后者由别的断言管），别让饿死污染这条。 */
    const mk = (pop, nest) => {
      const g = SB.state.freshRun(false);
      g.pop = pop; g.lvl.nest = nest; g.res.kelp = 500;
      return g;
    };
    const run = (g, ticks) => {
      for (let i = 0; i < ticks; i++) { SB.economy.tick(g, 0.1, null); g.res.kelp = 500; }
    };
    /* ⚠️ 口径：`BLD.houseBase = 1`（2026-09-26 用户拍板「开局是1/1」），
     *   所以 popCap = 1 + nest×2 —— 下面每个上限都比「纯建筑」多 1。 */
    const CAP = (nest) => SB.CFG.BLD ? SB.CFG.BLD.houseBase + nest * 2 : 1 + nest * 2;
    /* ① 0 座住房 ⇒ 上限就只有开局那 1 个底数：600 秒也生不出第二人（不是「生得很慢」）。 */
    const g0 = mk(1, 0);
    run(g0, 6000);
    check('住房 0 座 ⇒ 人口恒为开局那 1 人（住满是墙，不是减速）', g0.pop === 1 && SB.economy.isFull(g0),
      '上限 ' + SB.economy.popCap(g0) + '，600s 后 pop=' + g0.pop);
    /* ② 住满时人口不增，且 _grow 每帧归零 —— 不攒进度才不会有
     *    「先攒满进度条、再点建造白送一个人」这类卡准漏洞。 */
    const gFull = mk(5, 2);                     // 上限 1+4=5，正好住满
    run(gFull, 3000);
    check('住满时人口不增且 _grow 归零（不攒白送的进度）',
      gFull.pop === 5 && gFull._grow === 0, 'pop=' + gFull.pop + ' _grow=' + gFull._grow);
    /* ③ 住房是人口线唯一的解药：同一段时间里，还剩位置的对照组应当长到顶。 */
    const gRoom = mk(4, 3);                     // 上限 1+6=7，还剩 3 个位置
    run(gRoom, 6000);
    check('有空位就能继续生育，且长到上限为止', gRoom.pop === 7,
      '有空位 ' + gFull.pop + '→' + gRoom.pop + ' 人（上限 ' + CAP(3) + '），住满组仍是 ' + gFull.pop + ' 人');
    /* ④ 边界必须是 `pop == popCap`（写成 > 会差一人白等一胎，写成 < 会漏最后一胎）。 */
    check('isFull 的边界是 pop == popCap',
      SB.economy.isFull(mk(CAP(3), 3)) && !SB.economy.isFull(mk(CAP(3) - 1, 3)),
      'nest=3 ⇒ 上限 ' + CAP(3) + '：pop ' + CAP(3) + ' 应住满、pop ' + (CAP(3) - 1) + ' 不应');
    /* ⑤ 旧机制的函数必须彻底消失，否则将来有人照 2026-09-25 的注释重新调它。 */
    check('旧的生育减速/人口上限函数已彻底移除',
      SB.economy.growRate === undefined && SB.economy.houseCap === undefined,
      'growRate=' + typeof SB.economy.growRate + ' houseCap=' + typeof SB.economy.houseCap);
  }

  /* 省：保温巢 −0.5%/级、无减免上限（2026-09-26 用户拍板照抄猫国 pasture catnipDemandRatio，
     撤掉本作自造的 −60% 护栏）。三条断言各守一件事：每级步值 / 线性叠加 / 100% 防错边界。 */
  s.pop = 10; s.lvl.warmnest = 0;
  const use0 = SB.economy.foodUse(s);
  s.lvl.warmnest = 1;
  const use1 = SB.economy.foodUse(s);
  check('保温巢 1 级让口粮 −0.5%（对齐猫国 pasture 的 −0.005/级）',
    Math.abs(use1 / use0 - 0.995) < 1e-9,
    use0.toFixed(4) + ' → ' + use1.toFixed(4) + '/秒');
  s.lvl.warmnest = 100;      // 无上限 ⇒ 线性：100 级正好省 50%
  check('保温巢省耗无上限：100 级线性省 50%',
    Math.abs(SB.economy.foodUse(s) / use0 - 0.50) < 1e-9,
    (SB.economy.foodUse(s) / use0 * 100).toFixed(1) + '% 原消耗');
  s.lvl.warmnest = 400;      // 越界档：减免不许翻过 100%，否则消耗变负 = 白送口粮
  check('省耗减免被夹在 100%（400 级也不许倒贴口粮）', SB.economy.foodUse(s) >= 0,
    'use=' + SB.economy.foodUse(s).toFixed(4) + '（须 ≥ 0）');
  s.lvl.warmnest = 0;

  // 储：海藻仓 +5000/级（对标猫国 barn 的 catnipMax 5000），且不吃全局增量
  s.lvl.kelpstore = 1;
  const cap1 = SB.economy.capOf(s, 'kelp');
  check('海藻仓 1 级把菌毯上限提到 5200', cap1 === base + 5000, cap1 + '（基础 ' + base + '）');
  s.lvl.kelpstore = 0;

  /* ---- 仓储形态（2026-09-26 第三轮·用户拍板「除了基础仓储之外的都改成和猫国一致，
   *      通过专门的仓库建筑和科技给库存」）----
   * 三条规格：
   *   ① 每种资源都必须**真的有上限** —— 旧版 `if (!CFG.CAP_BASE[k])` 把「明写 0」
   *      也判成表外 ⇒ stone / warmstone 整局无上限。那是 bug，不是设计。
   *   ② 上限不再有「每建筑级给一点全局容量」那一轴（旧 CAP_PER_LVL 已删）——
   *      猫国的容量 100% 来自专门的仓库建筑（barn / warehouse / harbor / 对撞机）。
   *   ③ 藻食与材料**两条线各认自己的仓**：藻食 → 海藻仓（era1「种植」解锁）、
   *      材料 → 压舱仓（era2 解锁）。一个 store 管两件事会让「储」这个旋钮失焦。
   * 反向对照两条：科技必须仍然表外无上限；材料仓对藻食必须零作用。
   * ⚠️ 这里要盯的**不是数值大小**（那是标定，用户来定），而是「哪条线归谁、接没接上」。 */
  {
    const zero = SB.state.freshRun(false);
    const RESS = Object.keys(SB.RESS);
    const co = (g, k) => SB.economy.capOf(g, k);

    /* ⚠️ res 的键必须覆盖 SB.RESS —— 这条是 2026-09-28 那次 NaN 事故的钉子。
     *    加资源时只往 RESS 里加条目、忘了改 freshRun 的 res 字面量，就会得到
     *    `res.ironBracket === undefined` ⇒ addRes 里 `undefined + 5.25 = NaN` ⇒
     *    `Math.min(Infinity, NaN)` 还是 NaN ⇒ 产物进了池子、读出来却是 NaN，
     *    面板显示「NaN 铁制支架」，升级项扣费 `undefined - 50` 又把池子整个污染。
     *    ⚠️ 它跟「漏一个建筑键」是同一类：不报错，只是那一格凭空变成 NaN。
     *    ⇒ 每加一种资源，这条都会替你兜一次。 */
    const resMiss = RESS.filter(k => !(k in zero.res) || typeof zero.res[k] !== 'number' ||
      !isFinite(zero.res[k]));
    check('freshRun 的 res 键覆盖 SB.RESS 且每个都是有限数（漏键 = 资源变 NaN，不报错）',
      resMiss.length === 0,
      resMiss.length ? '缺/非数：' + resMiss.join(', ')
        : RESS.length + ' 种资源全部就位');

    const noCap = RESS.filter(k => !isFinite(co(zero, k)));
    check('石头 / 暖石必须吃仓储（旧版把「明写 0」当成表外 ⇒ 整局无上限）',
      noCap.indexOf('stone') === -1 && noCap.indexOf('warmstone') === -1,
      '无上限的资源 = [' + noCap.join(', ') + ']');
    /* ⚠️ 2026-09-27：`culture`（市政点）也进表外了，与 science 同类——
     *    两条都是「只用于解锁、不存在花不掉」的资源，撞上仓储上限只会让玩家
     *    在快够 100 点时被卡住。以后再加这类线，都要走「不给 CAP_BASE 键」。
     * ⚠️ 同日还多出一条 `stoneBeam`（石梁）——**是用户拍的，不是漏写**：
     *    它是「工艺制作的产物」（100 石头 → 1 石梁），与采集出来的资源性质不同；
     *    照猫国 beam 也不给 beamMax（warehouse 的 effects 只有 catnipMax/woodMax/
     *    mineralsMax/coalMax/ironMax/titaniumMax/goldMax，压根没有 beamMax ⇒ 恒 MAX_VALUE）。
     *    ⇒ 这里把批准无上限的资源列成**白名单**：将来谁再想让某种资源不受仓储约束，
     *      这条就会红，逼人回来显式拍一次，而不是悄悄漏过去。 */
    /* ⚠️ 2026-09-28 批准名单加 `ironBracket`（铁制支架）与 `rope`（绳）：
     *    这两位是 era2 第三层「工艺升级项」的消耗品，由工坊配方造出来、成批消耗。
     *    **是同 `stoneBeam` 那一类（工艺制作的产物），不是漏写 CAP_BASE** ——
     *    若给它们上限，玩家会在「攒够 50 条绳准备扩容」的途中被仓储卡住，
     *    而升级项的成本又是按 50 份计的，那一刀就正好落在最难受的位置上。
     *    ⚠️ 这个白名单的意义是「将来谁再想新增表外资源，这里会红，逼人回来显式拍一次」，
     *       所以批准一个就得在注释里写出**理由**，不能只加键。 */
    /* ⚠️ 2026-09-28 批准名单加 `luxury`（奢侈品）：商人产它、贸易系统待设计。
     *    **批准理由是「现在没有开销渠道」，不是「永远没有」** —— 贸易规则一旦落地
     *    必然要设上限（否则无限囤货能把贸易买空），那时候这条批准要撤销、给 CAP_BASE
     *    补键。注释就是留给那时候的：看见这句就去改 config.js 的 CAP_BASE。
     *    ⚠️ 与上面 ironBracket/rope 那两条的区别：那两位是「工艺制品」，这位是
     *       「贸易货物」，将来要加上限的是它。别把两条的理由看混。 */
    /* ⚠️ 2026-09-28 批准名单加 faith（信仰）：理由与 luxury 逐字同源——宗教界面待设计，
     *    此刻没有任何开销渠道，设上限只会卡住「攒着等宗教」的玩家。
     *    ⚠️ 宗教规则拍板时必须**撤销这条批准**（加 CAP_BASE.faith），那条注释也是留给它俩的。 */
    /* ⚠️ 2026-09-29 批准名单加 hardCoral（硬化珊瑚）：与 stoneBeam/ironBracket/rope 同属
     *    「工艺制作的产物」一类——由工坊配方造出来、成批消耗（压舱仓建造成本吃 2 份）。
     *    **不是漏写 CAP_BASE**，照石梁那套口径（猫国 warehouse 的 effects 也没有 beamMax，
     *    beam 恒无上限）。若给上限，玩家会在「攒 2 份硬化珊瑚建压舱仓」途中被仓储卡死。
     *    它和 stoneBeam 是猫国 warehouse 的「两种初级结构件」分工（beam + slab 对标）。 */
    var CAPLESS_OK = { science: 1, culture: 1, stoneBeam: 1, ironBracket: 1, rope: 1, hardCoral: 1, luxury: 1, faith: 1,
      /* ERA3 热液能系统（2026-09-29）：钢 / 热液能 / 钢制零件均无 CAP_BASE 上限键 ⇒ capOf 自动
       *    Infinity（钢无上限抄猫国）。三者与石梁同口径——由工坊/建筑产、成批消耗（钢制零件吃 50 份建
       *    阿尔巴达），给上限会卡死建造。加进白名单，反向对照才不会把正当无上限误报成漏写 CAP_BASE。 */
      steel: 1, hydro: 1, steelPart: 1 };
    check('反向对照：科技 / 市政点 / 石梁 / 工艺制品仍表外无上限（批准名单，加别的必红）',
      noCap.length > 0 && noCap.every(k => !!CAPLESS_OK[k]),
      '[' + noCap.join(', ') + ']');

    /* ② 建筑等级**不再**给容量：把每座非仓库建筑各抬 10 级，上限必须纹丝不动。
     *    这条是「删掉 CAP_PER_LVL」的正面证据 —— 旧形态下它们会一起涨。 */
    const many = SB.state.freshRun(false);
    /* ⚠️ 2026-09-28 例外列表加 lighthouse：灯塔**故意**给容量（+120/级，与压舱仓同档），
     *    用户规格「大灯塔获得仓库的作用，但资源上限量为其一半」⇒ 灯塔得先有仓储基准，
     *    大灯塔那「一半」才有出处。它是**有意效仿 ballast/kelpstore** 的容量建筑，
     *    不是「全局增量」复活 —— 所以排除它的理由与那两座相同，不是放宽这条断言。
     *    ⚠️ 加仓库建筑时报「会涨」是预期行为；加**非仓库**建筑时报才是真漏。 */
    for (const b of SB.BUILDINGS) {
      if (!['kelpstore', 'ballast', 'lighthouse'].includes(b.id)) many.lvl[b.id] = 10;
    }
    const moved = RESS.filter(k => co(many, k) !== co(zero, k));
    check('每建筑级的全局增量已彻底删除（铺满建筑也不涨容量）',
      moved.length === 0, '会涨的资源 = [' + moved.join(', ') + ']');

    /* ③ 两条线各认自己的仓，且**不互相串**。 */
    const w0 = SB.state.freshRun(false);
    const w1 = SB.state.freshRun(false); w1.lvl.kelpstore = 1;
    const b1 = SB.state.freshRun(false); b1.lvl.ballast = 1;
    check('海藻仓只给藻食（+5000/级，对标猫国 barn 的 catnipMax）',
      co(w1, 'kelp') - co(w0, 'kelp') === SB.BLD.kelpCap &&
      co(w1, 'coral') === co(w0, 'coral'),
      '藻食 +' + (co(w1, 'kelp') - co(w0, 'kelp')) + '，珊瑚 ' + (co(w1, 'coral') - co(w0, 'coral')));
    check('压舱仓只给材料（+120/级），对藻食零作用',
      co(b1, 'coral') - co(w0, 'coral') === SB.BLD.ballastCap &&
      co(b1, 'kelp') === co(w0, 'kelp'),
      '珊瑚 +' + (co(b1, 'coral') - co(w0, 'coral')) + '，藻食 ' + (co(b1, 'kelp') - co(w0, 'kelp')));

    /* 科技侧那条容量通道必须真的活着。它**曾经是死键**：mul() 算出了值、UI 也照着
     * 显示「藻食上限 +200」，但 capOf 从来没读过它 ⇒ 储藻术研究完什么也没发生。
     * 这正是用户要的「通过仓库建筑和科技给库存」，所以补一条只盯接线的断言。 */
    const t0 = SB.state.freshRun(false);
    /* ⚠️ 2026-09-28：科技名从「储藻术」换成「照明」，加的那 200 是同一个 eff.kelpCap。 */
    const t1 = SB.state.freshRun(false); t1.techs = { lighting: true };
    check('科技给的容量真的进了上限（旧版是「UI 声称 +200、实际没接线」的死键）',
      co(t1, 'kelp') - co(t0, 'kelp') === 200,
      '藻食 +' + (co(t1, 'kelp') - co(t0, 'kelp')));
  }

  // 产 ≠ 省：两者不是同一件事，别把符号搞反
  check('口粮与产出互不串味', SB.economy.foodRate(s, 1) > 0 && SB.economy.foodUse(s) > 0,
    '产 ' + SB.economy.foodRate(s, 1).toFixed(3) + ' / 吃 ' + SB.economy.foodUse(s).toFixed(3));
  s.lvl.kelp = 0;
}

/* ---------------- 食物双源（建筑 + 采集者）---------------- */
/* 照猫国 game.js:3666 calcResourcePerTick("catnip") 的语句顺序落地。
 * 这里最容易改错的一条：季节那行（源码 3685 行）必须夹在「取建筑侧」与
 * 「加职业侧」之间。谁把它挪到 (建筑+职业)×季节，采集者一到寒流季就集体饿死，
 * 而单看暖流季的代码永远发现不了——所以下面三条必须分开断言。 */
console.log('\n=== 食物双源 ===');
{
  const s = SB.game.run();
  const M = SB.SEASONS;
  const SEASON_TICKS = SB.CFG.SEASON_TICKS;
  /* 采集者是开局唯一职业、且产食（docs/DESIGN_v0.3.md §4）。
   * 上一轮自创的「圃丁」已删——它与采集者产同一资源，玩家无从取舍。 */
  check('职业表只有采集者产食', SB.JOBS.filter(j => /藻食|菌毯/.test(j.desc)).map(j => j.id).join() === 'gather',
    SB.JOBS.map(j => j.id).join(' / '));
  check('已无圃丁残留职业', !SB.JOBS.some(j => j.id === 'planter'), SB.JOBS.map(j => j.id).join(' / '));

  /* 季索引**按表查**，不写死第几季：2026-09-27 删掉浊流季（4→3），
   * 旧断言写死 `M[3]`（第 4 季 = 寒流季）直接读 undefined。季节表是最容易被增删的表，
   * 取索引跟着表走，别再硬编码一次。 */
  const WARM_IDX = M.findIndex(x => x.mult >= 1);
  const COLD_IDX = M.findIndex(x => x.mult < 1);

  // 建筑侧：只有菌圃在产
  s.lvl.kelp = 1; s.lvl.weir = 0; s.jobs.gather = 0; s.pop = 1;
  s.t = SEASON_TICKS * WARM_IDX;             // 暖流季
  const warmB = SB.economy.foodRate(s, 1);
  s.t = SEASON_TICKS * COLD_IDX;             // 寒流季
  const coldB = SB.economy.foodRate(s, 1);
  check('季节减产只打建筑侧', Math.abs(coldB / warmB - M[COLD_IDX].mult / M[WARM_IDX].mult) < 1e-9,
    '暖流 ' + warmB.toFixed(4) + ' → 寒流 ' + coldB.toFixed(4));

  // 职业侧：只有采集者在产
  s.lvl.kelp = 0; s.jobs.gather = 1;
  s.t = SEASON_TICKS * WARM_IDX;
  const warmJ = SB.economy.foodRate(s, 1);
  s.t = SEASON_TICKS * COLD_IDX;
  const coldJ = SB.economy.foodRate(s, 1);
  check('采集者产出不吃季节减产', Math.abs(coldJ / warmJ - 1) < 1e-9,
    '暖流 ' + warmJ.toFixed(4) + ' / 寒流 ' + coldJ.toFixed(4));

  // 两条来源相加进同一池
  s.t = 0; s.lvl.kelp = 1; s.jobs.gather = 1;
  const both = SB.economy.foodRate(s, 1);
  check('建筑与采集者的产出相加进同一池', Math.abs(both - (warmB + warmJ)) < 1e-9,
    '建筑 ' + warmB.toFixed(4) + ' + 采集者 ' + warmJ.toFixed(4) + ' = ' + both.toFixed(4));

  // 采集者必须真的比菌圃值钱，否则「雇人 vs 铺田」这条取舍不存在
  check('采集者单位产出高于菌圃（雇人 vs 铺田有意义）', SB.UNIT.kelp > SB.BLD.food * 2,
    '采集者 ' + SB.UNIT.kelp + ' vs 菌圃 ' + SB.BLD.food + '/级');

  // 口粮必须真的构成约束：一个采集者养不到 2 个人，否则前期永远不会缺粮
  const perGather = SB.UNIT.kelp / SB.CFG.FOOD_PER;
  check('一个采集者养不饱两个人（食物是前期真约束）', perGather < 2,
    perGather.toFixed(2) + ' 人/采集者（猫国 ' + (1.0 / 0.85).toFixed(2) + '）');

  /* 珊瑚只由「珊瑚匠」职业出（猫国 wood 同构：wood 只有 woodcutter 能产）。
   * 采集者若顺手产珊瑚，材料线就又绕回了食物线，
   * 开局那条「点采集 → 攒藻食 → 建菌圃」的循环会被资源种类稀释。 */
  const t = SB.state.freshRun(false);
  t.jobs.gather = 2;
  SB.economy.tick(t, 1, noop);
  check('采集者不产珊瑚', t.res.coral === 0, 'coral=' + t.res.coral.toFixed(3));
  t.lvl.kelp = 0; t.jobs.gather = 0; t.jobs.coralwright = 2; t.res.coral = 0;
  SB.economy.tick(t, 1, noop);
  check('珊瑚匠是珊瑚唯一入口', t.res.coral > 0, 'coral=' + t.res.coral.toFixed(3));

  /* 金属同构断言（2026-09-26 对齐猫国）：砂矿坑不再自动产金属（旧「建了砂坑凭空冒」
   * 的反向对照），金属唯一入口 = 矿工；砂矿坑只把矿工产出乘 (1 + 级数 × siltBonus)。
   * 比值写法：两条 freshRun 在同一 t=0 ⇒ 季节/采集倍率完全一致，
   * silt 增量之比只来自砂矿坑加成，不用去复算 cold/gatherMul（漏一项就是假红）。 */
  const m0 = SB.state.freshRun(false); m0.jobs.miner = 2; m0.res.silt = 0; m0.res.warmstone = 0;
  SB.economy.tick(m0, 1, noop);
  const m3 = SB.state.freshRun(false); m3.jobs.miner = 2; m3.lvl.siltpit = 3;
  m3.res.silt = 0; m3.res.warmstone = 0;
  SB.economy.tick(m3, 1, noop);
  const mNo = SB.state.freshRun(false); mNo.lvl.siltpit = 3; mNo.res.silt = 0;
  SB.economy.tick(mNo, 1, noop);
  check('砂矿坑不自动产金属（金属唯一入口=矿工）', mNo.res.silt === 0, 'silt=' + mNo.res.silt);
  check('矿工产金属，砂矿坑加成 = 1+级数×siltBonus（3 级 ⇒ ×1.6）',
    Math.abs(m3.res.silt / m0.res.silt - 1.6) < 1e-9,
    '比值=' + (m3.res.silt / m0.res.silt).toFixed(6) + '（m0=' + m0.res.silt.toFixed(4) + ' m3=' + m3.res.silt.toFixed(4) + '）');
  check('砂矿坑加成不波及暖石（伴生副产品不吃建筑加成）',
    Math.abs(m3.res.warmstone - m0.res.warmstone) < 1e-9,
    'm0=' + m0.res.warmstone.toFixed(4) + ' m3=' + m3.res.warmstone.toFixed(4));

  s.lvl.kelp = 0; s.jobs.gather = 0;
}

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
   *    ⚠️ 后果要说清：**地热产出口没有了 ⇒ fuelRate 恒 0 ⇒ bot 永远攒不到足以开动祭坛的
   *       燃料 ⇒ 整局跑到这里凿壳进度会停住**。这是删热泉井的**必然结果**，不是回归坏了。
   *       等地热线重设时，这张单子要**跟着重排**（不然这里会静默退化成「bot 干等」。） */
  const unlock = ['siltpit', 'hall', 'workshop', 'miracle', 'furnace', 'library'];
  for (const id of unlock) if (freeB(s, id) && s.lvl[id] === 0) return id;
  for (const id of ['kelp', 'siltpit', 'nest', 'coralhouse', 'workshop', 'furnace', 'library', 'miracle', 'kelpstore', 'ballast'])
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
SB.game.setSpeed(20);                 // 挂 20×，每帧推进 2 游戏秒

/* 礁口巢的造价：开局破局要用它当「珊瑚攒够了没有」的门槛。 */
const NEST_COST = ((SB.BUILDINGS.filter(b => b.id === 'nest')[0]) || {}).cost || {};

/* bot 的每一步决策。⚠️ 整局模拟与「era1 真开局专项核算」必须共用同一份策略 ——
 * 策略一旦分叉，两个时长就是两回事，对不上账。 */
function botStep() {
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
  // 祭坛：建成就合闸。它自动凿、燃料见底自动停摆，玩家这边只剩这一个开关
  // 祭坛：建成就合闸。checked 传旧值，与真实浏览器 click 时刻的语义一致
  if ((s.lvl.miracle || 0) > 0 && !s.miracleOn) fire({ dataset: { miracle: '1' }, checked: s.miracleOn });
}

while (frame < MAX_FRAMES) {
  const s = SB.game.run();
  if (!s || s.broken) { runHours = s.t / 3600; break; }
  botStep();
  frames(1);
  frame++;
  { const cur = SB.game.run();
    if (cur.era !== eraMarks[eraMarks.length - 1].era) eraMarks.push({ era: cur.era, t: cur.t });
    /* 逐项记录首次掌握时刻：这个数只有拆成行才对得账 ——
     * 否则「era1 花多久」永远是个没法复核的黑箱。 */
    for (const id of era1Ids) if (era1At[id] === null && cur.techs && cur.techs[id]) era1At[id] = cur.t;
    if (era1Done === null && era1Ids.every(id => era1At[id] !== null)) era1Done = cur.t; }
  if (frame % 2000 === 0) {
    console.log(`  [frame ${frame}] t=${(s.t / 3600).toFixed(2)}h pop=${s.pop} shell=${s.shell.toFixed(0)} craft=${s.jobs.craft} mir=${s.lvl.miracle || 0}${s.miracleOn ? '开' : '关'} 热=${s.res.fuel.toFixed(1)}${s.starved ? ' 停摆' : ''}`);
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
  check('单局跑完六个职业全部解锁（解锁链无死结）', missed.length === 0,
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

/* ---------------- 市政（2026-09-27 实装）---------------- */
/* 覆盖三条：市政点的产线、鼓舞＝揭示、政体/卡槽的收费。
 * ⚠️ 这批断言里**没有**任何标定类断言（整局时长、攒点快慢），那些走 defer()。
 *    判定口径照旧：改代码让断言变绿 = bug 修好了；改常数让断言变绿 = 标定，停下。 */
console.log('\n=== 市政 ===');
{
  const noop = function () {};

  // ① 面板开门就是议事厅：派生值，不存档
  const shut = SB.state.freshRun(false);
  check('未建议事厅 ⇒ 市政页不开', SB.civic.panelOpen(shut) === false);
  check('不开时给的是可执行的理由（不是空话）', /议事厅/.test(SB.civic.panelBlock(shut) || ''),
    String(SB.civic.panelBlock(shut)));
  shut.lvl.hall = 1;
  check('建成议事厅 ⇒ 市政页开', SB.civic.panelOpen(shut) === true);

  // ② 市政点产线：tick 与 rates 必须同式（面板/结算同源铁律）
  const cv = SB.state.freshRun(false);
  cv.jobs.scribe = 3; cv.lvl.hall = 4; cv.res.culture = 0;
  SB.economy.tick(cv, 1, noop);
  const want = 3 * SB.UNIT.culture + 4 * SB.CFG.CIVIC.HALL_RATE;
  check('书手＋议事厅产市政点，且 tick 与 rates 同式',
    Math.abs(cv.res.culture - want) < 1e-9 &&
    Math.abs(SB.economy.rates(cv).culture - want) < 1e-9,
    'tick=' + cv.res.culture.toFixed(4) + ' rates=' + SB.economy.rates(cv).culture.toFixed(4) +
    'tick=' + cv.res.culture.toFixed(4) + ' rates=' + SB.economy.rates(cv).culture.toFixed(4));

  /* 市政点是**独立线**：采集倍率不该管到书手上。
   * ⚠️ 2026-09-28 换载体：原先用 `g1.lvl.reef = 3`（礁石平台）当「采集倍率」的施力点，
   *    而**礁石平台已删除**、`BLD.reefMul` 与 gatherMul 那一项一并拆掉了 ⇒ 再用 reef
   *    会得到一个永远为 0 的等级键，这条断言会**变成空跑**（比值恒 1、恒绿），
   *    属于「夹具还在、力已经不作用了」的那种假绿。
   *    ⇒ 改用采集倍率**当前仅剩的**那条建筑外来源：`perk.gather`（gatherMul 里那份
   *    `1 + 0.10 × perk.gather`）。它才是这条断言要证的真命题：采集乘区不进书手那条线。 */
  const g0 = SB.state.freshRun(false); g0.jobs.scribe = 2;
  const g1 = SB.state.freshRun(false); g1.jobs.scribe = 2; g1.perk.gather = 3;
  SB.economy.tick(g0, 1, noop); SB.economy.tick(g1, 1, noop);
  check('市政点不吃采集倍率（书手持的是笔不是鳃）',
    Math.abs(g0.res.culture - g1.res.culture) < 1e-9 &&
    SB.economy.gatherMul(g1) > SB.economy.gatherMul(g0),
    '无采集加成=' + g0.res.culture.toFixed(4) + ' 采集 perk 3 级=' + g1.res.culture.toFixed(4) +
    ' gatherMul ' + SB.economy.gatherMul(g0).toFixed(3) + '→' + SB.economy.gatherMul(g1).toFixed(3));

  /* ②b 广场乘区（2026-09-28 用户规格「广场 = 图书馆的对位，加的是市政点获取」）。
   * ⚠️ 乘区的括号只裹「书手那一项」：议事厅与奇观是同一条产线上的另外两项，
   *    把乘区提到它们外面，会得到「广场顺带给议事厅加料」这种谁都没答应过的效果
   *    （那不是 +100% 广场，是 +100% 市政点总量）。 */
  const HALL2 = 2 * SB.CFG.CIVIC.HALL_RATE;          // 与书手那份分开比，才测得出谁被放大
  function sqFixture(sqLv, card) {
    const st = SB.state.freshRun(false);
    st.jobs.scribe = 10; st.lvl.hall = 2; st.lvl.square = sqLv;
    /* ⚠️ 多槽升维后事实来源是 s.cards 数组（s.card 只是第 0 号槽镜像）。
     *    装卡必须写 s.cards，否则 squareMul 读不到 ⇒ ×2 不生效。 */
    st.cards = card ? [card] : [];
    st.card = card || null;
    return st;
  }
  const scribePart = SB.economy.cultureRate(sqFixture(0)) - HALL2;
  check('广场 1 级 ⇒ 书手那一项 ×' + (1 + SB.BLD.squareCivRatio) + '，议事厅那份一点不动',
    Math.abs((SB.economy.cultureRate(sqFixture(1)) - HALL2) / scribePart -
             (1 + SB.BLD.squareCivRatio)) < 1e-9 &&
    Math.abs(SB.economy.cultureRate(sqFixture(0)) - scribePart - HALL2) < 1e-9,
    '基准=' + scribePart.toFixed(4) + ' 广场1级=' +
    (SB.economy.cultureRate(sqFixture(1)) - HALL2).toFixed(4));
  check('广场是线性的：2 级不是 1+0.1²',
    Math.abs((SB.economy.cultureRate(sqFixture(2)) - HALL2) / scribePart -
             (1 + 2 * SB.BLD.squareCivRatio)) < 1e-9);
  check('广场乘区 tick 与 rates 同式（面板不撒谎）',
    Math.abs(SB.economy.rates(sqFixture(1)).culture - SB.economy.cultureRate(sqFixture(1))) < 1e-9);
  /* 广场是**图书馆的对位**：“对标图书馆、不过加的是市政点获取” ⇒ 科技产出必须纹丝不动。
   * ⚠️ 两侧都给上书手，否则 culture 两份都是 0，`a > b` 这种比较会假绿（0 > 0 是 false，
   *    但「两边都没动」这个结论就测不出来了——要测的是**动了但只动一边**）。 */
  const sc0 = SB.state.freshRun(false);
  sc0.jobs.scholar = 3; sc0.jobs.scribe = 2;
  const sc1 = SB.state.freshRun(false);
  sc1.jobs.scholar = 3; sc1.jobs.scribe = 2; sc1.lvl.square = 5;
  check('广场不动科技产出（它是图书馆的姊妹，不是同一座）',
    Math.abs(SB.economy.rates(sc0).science - SB.economy.rates(sc1).science) < 1e-9 &&
    SB.economy.rates(sc1).culture > SB.economy.rates(sc0).culture,
    'science ' + SB.economy.rates(sc0).science.toFixed(4) + ' → ' +
    SB.economy.rates(sc1).science.toFixed(4) +
    ' / culture ' + SB.economy.rates(sc0).culture.toFixed(4) + ' → ' +
    SB.economy.rates(sc1).culture.toFixed(4));

  /* ②c 政策卡《戏剧与诗歌》=「广场效果 +100%」⇒ 乘区 ×2。
   * ⚠️ 这张卡的 effect 是**空的**（刻意）——乘区走 `squareMul` 那条通道，不是 flow 的
   *    平坦加值。若哪天有人「顺手补上 effect: {culture: ...}」，这里会红：那等于把
   *    「这座建筑变强」改成「凭空产两份市政点」，不是同一个东西。 */
  check('没装卡时 squareMul = 1（返回 1 是「没装」不是「0 倍」）',
    SB.civic.squareMul(sqFixture(1)) === 1);
  /* ⚠️ 比的是**书手那一段**而不是 cultureRate 全值：议事厅那份（2 × HALL_RATE）在
   *    乘区外面，全值一比会把「没被放大」的那部分也算进来 ⇒ 显示 1.94 而不是 2。 */
  const sqRate = sq => SB.economy.cultureRate(sq) - HALL2;
  check('装政策卡《戏剧与诗歌》⇒ 广场乘区 ×2，且 tick 与 rates 同式',
    SB.civic.squareMul(sqFixture(1, 'card_drama')) === 2 &&
    Math.abs(sqRate(sqFixture(1, 'card_drama')) / sqRate(sqFixture(1)) - 2) < 1e-9 &&
    Math.abs(SB.economy.rates(sqFixture(1, 'card_drama')).culture -
             SB.economy.cultureRate(sqFixture(1, 'card_drama'))) < 1e-9,
    '书手段 ' + sqRate(sqFixture(1)).toFixed(4) + ' → ' +
    sqRate(sqFixture(1, 'card_drama')).toFixed(4) + '（×2）');
  /* 拔下即失效（与 flow 那条「研究出 ≠ 白拿」同口径：卡在槽里才算选了它）。 */
  check('拔下《戏剧与诗歌》⇒ 乘区回到 1×（不是留在装填时的值）',
    SB.civic.squareMul(sqFixture(1, null)) === 1);

  /* ②d 商人 × 奢侈品（用户规格「对外贸易解锁职业商人，可获取叫奢侈品的资源」）。
   * ⚠️ 2026-09-28 陆地贸易落地：奢侈品**现在有开销渠道**——每人每秒按 happyCost(H)
   *    烧 luxury 维持幸福度（见 economy.js 4c 段）。所以这条线不再是「只有进项」，
   *    净速率 = 产能 − 幸福度消耗。上限仍无限（CAPLESS 白名单那条保留：luxury 不进仓储上限）。 */
  const mk = SB.state.freshRun(false);
  check('没完成《对外贸易》⇒ 商人雇不了（市政通路不通 ⇒ 没人产奢侈品）',
    SB.folk.jobUnlocked(mk, 'merchant') === false);
  check('商人的解锁权写在市政表上，不是某项科技（两条通路分开放）',
    SB.folk.jobCivicOf('merchant') === 'trade' && SB.folk.jobTechOf('merchant') === null,
    'civic=' + SB.folk.jobCivicOf('merchant') + ' tech=' + SB.folk.jobTechOf('merchant'));
  mk.civics.trade = true;
  check('完成《对外贸易》⇒ 商人解锁（OR 语义：另一条通路没写也不影响）',
    SB.folk.jobUnlocked(mk, 'merchant') === true);
  const ml = SB.state.freshRun(false);
  ml.jobs.merchant = 4; ml.res.luxury = 0;
  SB.economy.tick(ml, 1, noop);
  /* ⚠️ 落地后 luxury 有消耗端（幸福度）。验证两条不变量（不依赖 H 在 1 秒内的微小漂移）：
   *   ① rates.luxury 公式 = 产能(baseMul) − 实际消耗 min(产能, 需求)，精确；
   *   ② tick 1 秒真实净增量 ∈ (0, 产能)，证明「有产出、有消耗」两件事都发生。
   *   注：tick 累积与 rates 的微小差来自 H 随贸易充足度漂移（面板显示当前速率，非撒谎）。 */
  const _S = 4 * SB.UNIT.luxury * SB.economy.baseMul(ml);
  const _D = ml.pop * SB.economy.happyCost(ml.happy || 0);
  const _net = _S - Math.min(_S, _D);
  check('商人产奢侈品：净速率 = 产能 − 幸福度消耗（公式精确）',
    Math.abs(SB.economy.rates(ml).luxury - _net) < 1e-9,
    'rates=' + SB.economy.rates(ml).luxury.toFixed(5) + ' net=' + _net.toFixed(5));
  check('商人产奢侈品：tick 1 秒净增量 ∈ (0, 产能)（有产出有消耗）',
    ml.res.luxury > 1e-9 && ml.res.luxury < _S + 1e-12,
    'luxury=' + ml.res.luxury.toFixed(5) + ' 产能=' + _S.toFixed(5));
  /* ⚠️ 这条盯的是「状态表里有没有开好口子」：奢侈品每帧都进 addRes，缺键会在开局
   *    几秒内把整个 res 染成 NaN（jobs.merchant 那次就是这么漏的——economy 侧写了
   *    `(s.jobs.merchant || 0)`，所以没有 NaN，反而更晚才被发现）。 */
  const mf = SB.state.freshRun(false);
  check('状态表已开好 luxury / merchant 两个口子（有产出没开销 ⇒ 每帧都跑）',
    typeof mf.res.luxury === 'number' && typeof mf.jobs.merchant === 'number' &&
    typeof mf.lvl.square === 'number' &&
    typeof SB.state.freshRun(false).lvl.institute === 'number');
  /* 除商人外没有任何职业碰奢侈品——「唯一进项」是规格本身，别让它悄悄多一个来源。 */
  const mo = SB.state.freshRun(false);
  mo.res.luxury = 0; mo.jobs.coralwright = 3; mo.jobs.craft = 3;
  SB.economy.tick(mo, 1, noop);
  check('奢侈品是商人的独占产出（匠人/珊瑚匠都碰不到它）', mo.res.luxury === 0,
    'luxury=' + mo.res.luxury);

  /* ⚠️ 陆地贸易核心不变量（2026-09-28 落地）：钉住设计，而非迁就绿。 */
  // ① 无贸易产能（商人=0）⇒ 民生轴中性（H=0，不惩罚、不漂移）
  const ht0 = SB.state.freshRun(false);
  SB.economy.tick(ht0, 1, noop);
  check('无贸易产能 ⇒ 幸福度中性（H=0，全产不惩罚）',
    ht0.happy === 0 && SB.economy.happyMul(ht0) === 1.0, 'H=' + ht0.happy);
  // ② 档位映射（台阶式，与文明6 同构）
  const hM = s => SB.economy.happyMul(s);
  check('幸福度档位：动荡<−1→0.80｜不满→0.92｜安定→1.00｜愉悦→1.05｜欢欣→1.10｜欣喜若狂≥3→1.20',
    hM({happy:-2})===0.80 && hM({happy:-1})===0.92 && hM({happy:0})===1.00 &&
    hM({happy:1})===1.05 && hM({happy:2})===1.10 && hM({happy:3})===1.20 && hM({happy:99})===1.20,
    '');
  // ③ 贸易产能 < 需求 ⇒ H 下降（动荡惩罚方向正确）
  const htStarve = SB.state.freshRun(false);
  htStarve.jobs.merchant = 1; htStarve.pop = 100; htStarve.res.luxury = 0;  // 产能0.05 < 需求0.5
  SB.economy.tick(htStarve, 1, noop);
  check('贸易产能 < 需求 ⇒ 幸福度下降（断供惩罚方向）',
    htStarve.happy < 0, 'H=' + htStarve.happy.toFixed(4));
  // ④ 贸易产能 > 需求 ⇒ H 上升（欢欣增益方向正确）
  const htRich = SB.state.freshRun(false);
  htRich.jobs.merchant = 10; htRich.pop = 1;  // 产能0.5 >> 需求0.005
  SB.economy.tick(htRich, 1, noop);
  check('贸易产能 > 需求 ⇒ 幸福度上升（增益方向）',
    htRich.happy > 0, 'H=' + htRich.happy.toFixed(4));
  // ⑤ 反自指：luxury 产出走 baseMul（不含 happyMul），happy 增益不放大自己的燃料
  const htLux = SB.state.freshRun(false);
  htLux.jobs.merchant = 4; htLux.happy = 3;   // 欣喜若狂档
  const _cap = 4 * SB.UNIT.luxury * SB.economy.baseMul(htLux);   // 产能（baseMul，不含 happy）
  check('luxury 产出走 baseMul（不含 happyMul，防自激）',
    Math.abs(SB.economy.rates(htLux).luxury - (_cap - Math.min(_cap, htLux.pop * SB.economy.happyCost(3)))) < 1e-9 &&
    Math.abs(_cap - 4 * SB.UNIT.luxury) < 1e-9,   // happy=3 不影响 luxury 产能
    'lux=' + SB.economy.rates(htLux).luxury.toFixed(5) + ' 产能=' + _cap.toFixed(5));

  // ③ 鼓舞 = 揭示，不是解锁、也不是替玩家付点
  const cs = SB.state.freshRun(false);
  cs.lvl.hall = 1;
  SB.civic.pump(cs, noop);
  check('法典无鼓舞 ⇒ 面板一开就揭示', SB.civic.isRevealed(cs, 'laws'));
  check('技艺未建成工坊 ⇒ 仍是「未揭露」', !SB.civic.isRevealed(cs, 'craft'));
  check('神秘主义未掌握海潮占卜 ⇒ 仍是「未揭露」', !SB.civic.isRevealed(cs, 'mystic'));
  check('未揭露 ⇒ 投不进市政点（100 点的定价没被鼓舞免掉）',
    SB.civic.canResearch(cs, 'craft') === false);
  check('《技艺》的鼓舞条件正是「建成 1 级工坊」',
    SB.civic.byId('craft').boost.b === 'workshop' && SB.civic.byId('craft').boost.n === 1);
  check('《神秘主义》的鼓舞条件正是「掌握海潮占卜」这一项（不是计数量）',
    SB.civic.byId('mystic').boost.t === 'tech' && SB.civic.byId('mystic').boost.id === 'tiddivine');

  /* ③b era2 第一层两项：对外贸易 / 戏剧与诗歌（2026-09-28 用户规格）。
   * ⚠️ 【为什么两项都 reqs ['laws']，而不是各自接着《技艺》《神秘主义》】
   *    若各自挂到 era1 的末项上，玩家要先在「对外贸易 / 戏剧与诗歌」之间选一条走，
   *    而《技艺》《神秘主义》两张卡抢的是**同一个万能槽**——把新一层再吊进那次取舍，
   *    等于逼他在两条支线上做第二次互斥，而他根本没有余裕（槽位只有 1 个）。
   *    ⇒ 都挂根《法典》：两条支线都能走到这一层，真正在等他的是那两个产能。 */
  const ct = SB.civic.byId('trade'), cd = SB.civic.byId('drama');
  check('新一层两项都挂根《法典》、彼此不前置（不逼玩家再做一次二选一）',
    ct.reqs.join() === 'laws' && cd.reqs.join() === 'laws' &&
    (cd.reqs || []).indexOf('trade') < 0 && (ct.reqs || []).indexOf('drama') < 0 &&
    ct.id !== cd.id,
    'trade←[' + ct.reqs.join() + '] drama←[' + cd.reqs.join() + ']');
  check('《对外贸易》的鼓舞条件正是「完成照明科技」',
    ct.boost.t === 'tech' && ct.boost.id === 'lighting', JSON.stringify(ct.boost));
  /* ⚠️ `wonder` 这个条件类型是 2026-09-28 新加的：原先 12 种条件类型里**没有**
   *    「建成一座奇观」，只写 `boost: {t:'wonder'}` 会静默永远达不成（不报错、不红）。 */
  check('《戏剧与诗歌》的鼓舞条件正是「建成一座奇观」',
    cd.boost.t === 'wonder' && cd.boost.n === 1, JSON.stringify(cd.boost));
  const w0 = SB.state.freshRun(false);
  check('一座奇观都没建 ⇒ 该鼓舞不成立',
    SB.tech.condMet(w0, cd.boost) === false && SB.wonder.count(w0) === 0,
    'count=' + SB.wonder.count(w0));
  /* 建成一座 ⇒ 成立。这里不真跑一遍建造流程（那属于别的节），只把 s.wonders 摆成
   * 「已建成 1 座」—— w0.wonders 的键就是 SB.WONDERS 的 id，count 数的是它。
   * ⚠️ 走 condMet 而不是直接判 s.wonders：直接判读的是实现，走 condMet 读的是契约。 */
  w0.wonders[SB.WONDERS[0].id] = true;
  check('建成一座奇观 ⇒ 该鼓舞成立（condMet 认得 wonder 这个类型）',
    SB.wonder.count(w0) === 1 && SB.tech.condMet(w0, cd.boost) === true,
    'count=' + SB.wonder.count(w0) + ' condMet=' + SB.tech.condMet(w0, cd.boost));
  /* 达成后不能印「1 / 1」这种读数本身没意义，但要盯住「已达成」能被 boostText 改念
   *    （与上面 craft 那条同型：condShort 的原始读数照搬上屏会读成坏掉了）。 */
  const bt2 = SB.civic.boostText(w0, cd);
  check('鼓舞已达成时不显示「1 / 1」这种原始读数', bt2.indexOf('1 / 1') === -1,
    bt2 + '（原始读数 ' + SB.civic.condShort(w0, cd.boost).txt + '）');
  /* cardOwned 看的是 `s.civics`（已完成），所以要先记为已完成——上面那一组只摆了
   * 奇观数、没摆完成状态，这里补上，别把「没完成却拿到卡」当成 bug。 */
  w0.civics.drama = true;
  check('《戏剧与诗歌》同时放出政策卡「戏剧与诗歌」（广场 + 乘区两件一起给）',
    SB.civic.policyById('card_drama').civic === 'drama' &&
    SB.civic.cardOwned(w0, 'card_drama') === true);

  /* 广场的解锁轴是 `requiredCivic`（第四条，其余建筑走 requiredTech 或科技侧 unlockBuild）。
   * ⚠️ 命中的是 **s.civics（已完成）**，不是 civShown（已揭示）：揭示只打开「可以投点」
   *    那扇门，玩家还得自己花掉市政点。这里两条都测，别只测其中一条。 */
  const sqB = SB.habitat.buildingById('square');
  const sh = SB.state.freshRun(false);
  sh.civShown.drama = true;
  check('只揭示《戏剧与诗歌》不给广场（揭示只开门，花掉点才算数）',
    SB.habitat.unlocked(sh, sqB) === false, 'civics=' + JSON.stringify(sh.civics));
  check('锁着的广场给的是玩家当下能执行的理由（不是「再攒 200 珊瑚」）',
    /戏剧与诗歌/.test(SB.habitat.lockReason(sh, sqB) || ''),
    String(SB.habitat.lockReason(sh, sqB)));
  sh.civics.drama = true;
  check('完成《戏剧与诗歌》⇒ 广场解锁（requiredCivic 这条轴通了）',
    SB.habitat.unlocked(sh, sqB) === true);

  /* ③d era2 **第二层**两项：神学 / 历史记录（2026-09-28 用户规格）。
   * ⚠️ 两项的共同前置是《戏剧与诗歌》（用户原话「戏剧与诗歌引出神学市政」「……引出历史记录
   *    市政」）⇒ 它们同列、彼此不前置，几何与第一层同构，差别只在共同前置是「一条支线的
   *    末项」而不是根。与第一层那条判据是同一个道理换个前置。 */
  const cx = SB.civic.byId('theology'), cr = SB.civic.byId('records');
  check('第二层两项都由《戏剧与诗歌》引出、彼此不前置（几何与第一层同构）',
    cx.reqs.join() === 'drama' && cr.reqs.join() === 'drama' &&
    (cx.reqs || []).indexOf('records') < 0 && (cr.reqs || []).indexOf('theology') < 0 &&
    cx.era === 2 && cx.layer > cd.layer && cr.layer > cd.layer,
    'theology←[' + cx.reqs.join() + '] records←[' + cr.reqs.join() + '] layer=' +
    cx.layer + '/' + cr.layer);
  /* ⚠️ 两条鼓舞条件的**否定侧**都要摆出来：只测「达成后成立」是假绿——
   *    写错条件类型（比如把 pop 写成 job）时，达成侧照样能绿。 */
  const p24 = SB.state.freshRun(false); p24.pop = 24;
  const p25 = SB.state.freshRun(false); p25.pop = 25;
  check('《神学》的鼓舞条件正是「人口达 25」，且 24 人不成立',
    cx.boost.t === 'pop' && cx.boost.n === 25 &&
    SB.civic.boostMet(p24, cx) === false && SB.civic.boostMet(p25, cx) === true,
    JSON.stringify(cx.boost));
  /* ⚠️ `built` 读的是 `s.lvl[c.b]` ⇒ 必须传**建筑 id**。传科技 id（比如 'loreway'）
   *    不会报错，只会永远达不成——与 `wonder` 那条是同一类静默断链。 */
  const lb5 = SB.state.freshRun(false); lb5.lvl.library = 5;
  const lb6 = SB.state.freshRun(false); lb6.lvl.library = 6;
  check('《历史记录》的鼓舞条件正是「潮纹馆达 6 级」（传的是建筑 id 不是科技 id）',
    cr.boost.t === 'built' && cr.boost.b === 'library' && cr.boost.n === 6 &&
    SB.civic.boostMet(lb5, cr) === false && SB.civic.boostMet(lb6, cr) === true,
    JSON.stringify(cr.boost));
  check('两项各放出一张政策卡，且卡 ↔ 市政一一对应',
    SB.civic.policyById(cx.card).civic === 'theology' &&
    SB.civic.policyById(cr.card).civic === 'records',
    cx.card + ' / ' + cr.card);
  check('《历史记录》登记的那座奇观就是「大图书馆」（存在且是奇观表里的真条目）',
    cr.wonder === 'wonder_great_library' && !!SB.wonder.byId(cr.wonder),
    String(cr.wonder));

  /* 神庙的解锁轴 = 《神学》**完成**（与广场那个 requiredCivic 同一条轴）。
   * ⚠️ 命中的是 s.civics。这里正反两条都测，别只测「完成 ⇒ 解锁」。 */
  const tmB = SB.habitat.buildingById('temple');
  check('神庙挂在 requiredCivic「theology」上（不是科技、也不是 need）',
    tmB.requiredCivic === 'theology' && !tmB.requiredTech && !tmB.need);
  const th = SB.state.freshRun(false);
  th.civics.theology = true;
  check('完成《神学》⇒ 神庙解锁', SB.habitat.unlocked(th, tmB) === true);
  th.civics.theology = false;
  check('撤销《神学》⇒ 神庙重新锁上（解锁权真的挂在市政上）',
    SB.habitat.unlocked(th, tmB) === false);

  /* 《神学》解锁的**信仰资源**（宗教系统已落地，2026-09-28）：基础产出 = 人口 × FAITH_PER_POP，
   *   神庙乘区叠加上去；存量攒到 10/100/1000 时按对数刻度给全产加成，且加成进入 globalMul。
   *   ⚠️ 2026-09-30 修：信仰产出**必须等《神学》完成**——faithRate 内部读 resUnlocked(s,'faith')，
   *    神学前即使有人口也恒为 0（不开局偷偷攒、也不偷偷给全产加成）。这是把当初漏门控的漏洞堵上，
   *    也对齐了 RES S.faith 的 unlock:{civic:'theology'} 与面板 faith 行 gate 同一条判定。 */
  const fa0 = SB.state.freshRun(false);              // 神学前
  SB.economy.tick(fa0, 1, noop);
  check('神学前信仰产出恒为 0（与资源行 gate 同判，不开局偷偷攒）',
    SB.economy.faithRate(fa0) === 0 && fa0.res.faith === 0,
    'faithRate=' + SB.economy.faithRate(fa0) + ' 存量=' + fa0.res.faith);
  const fa = SB.state.freshRun(false);
  fa.civics = { theology: true };                    // 完成《神学》
  SB.economy.tick(fa, 1, noop);
  check('完成《神学》后信仰基础产出 = 人口 × 0.02/s（叠神庙乘区）',
    SB.RESS.faith && typeof fa.res.faith === 'number' && fa.res.faith > 0 &&
    Math.abs(SB.economy.faithRate(fa) - fa.pop * SB.CFG.FAITH_PER_POP) < 1e-9,
    'pop=' + fa.pop + ' faithRate=' + SB.economy.faithRate(fa).toFixed(4) + '/s 存量=' + fa.res.faith.toFixed(4));
  /* 信仰全产加成刻度：10→+1% / 100→+2% / 1000→+3%（<10 不加成）。 */
  const fAll = lv => { const r = SB.state.freshRun(false); r.res.faith = lv; return r; };
  check('信仰全产加成：9→0% / 10→+1% / 100→+2% / 1000→+3%',
    Math.abs(SB.economy.faithAllMul(fAll(9)) - 1) < 1e-9 &&
    Math.abs(SB.economy.faithAllMul(fAll(10)) - 1.01) < 1e-9 &&
    Math.abs(SB.economy.faithAllMul(fAll(100)) - 1.02) < 1e-9 &&
    Math.abs(SB.economy.faithAllMul(fAll(1000)) - 1.03) < 1e-9,
    '9=' + SB.economy.faithAllMul(fAll(9)).toFixed(3) + ' 10=' + SB.economy.faithAllMul(fAll(10)).toFixed(3) +
    ' 100=' + SB.economy.faithAllMul(fAll(100)).toFixed(3) + ' 1000=' + SB.economy.faithAllMul(fAll(1000)).toFixed(3));
  /* 全产加成确实进入 globalMul（作用于珊瑚/石头/…/奢侈品这些 tick 产出；不含信仰自身，反自指）。 */
  check('信仰全产加成进入 globalMul（基座无灯塔/奇观时 = 1.03 @1000 信仰）',
    Math.abs(SB.economy.globalMul(fAll(1000)) - 1.03) < 1e-9 &&
    SB.economy.globalMul(fAll(1000)) > SB.economy.globalMul(fAll(1)),
    'faith=1 ⇒ ' + SB.economy.globalMul(fAll(1)).toFixed(3) + ' / faith=1000 ⇒ ' + SB.economy.globalMul(fAll(1000)).toFixed(3));
  /* ⚠️ 神庙是纯乘区、没有基础产出可乘 ⇒ 乘区系数本身必须**独立可读**，
   *    否则「+10%/级」这条规则在宗教落地前完全测不出来（乘 0 恒等于没挂）。 */
  const tmf = lv => { const r = SB.state.freshRun(false); r.lvl.temple = lv; return r; };
  const tmRatio = SB.BLD.templeFaithRatio;
  check('神庙乘区系数独立可读且线性（' + tmRatio + '/级）',
    Math.abs(SB.economy.faithMul(tmf(0)) - 1) < 1e-9 &&
    Math.abs(SB.economy.faithMul(tmf(1)) - (1 + tmRatio)) < 1e-9 &&
    Math.abs(SB.economy.faithMul(tmf(2)) - (1 + 2 * tmRatio)) < 1e-9,
    '0级=' + SB.economy.faithMul(tmf(0)).toFixed(4) + ' 1级=' +
    SB.economy.faithMul(tmf(1)).toFixed(4) + ' 2级=' + SB.economy.faithMul(tmf(2)).toFixed(4));
  /* 政策卡《神学》= 「神庙效果 +100%」⇒ 乘区 ×2，且**拔下即失效**（与广场那条同一条纪律：
   *    卡在槽里才算选了它，研究出市政只是拿到它）。 */
  check('装《神学》⇒ 神庙乘区 ×2，拔下回 1×',
    SB.civic.templeMul(tmf(1)) === 1 &&
    SB.civic.templeMul(Object.assign(tmf(1), { cards: ['card_theology'] })) === 2 &&
    SB.civic.templeMul(Object.assign(tmf(1), { cards: [] })) === 1);

  /* 宗教命名（2026-09-29）：玩家可以给信仰起名，名字显示在信仰资源行上。
   * 数据层：freshRun 默认 ''；migrateRun 老档补 ''、新档原样保留。
   * 标签层：renderRes 信仰行用 s.religionName（非空时）代替「信仰」二字。 */
  const rnFresh = SB.state.freshRun(false);
  check('宗教名默认空（未命名）', rnFresh.religionName === '');
  const rnOld = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {} });
  check('读档迁移：老档无 religionName ⇒ 补空字符串', rnOld.religionName === '');
  const rnNew = SB.state.migrateRun({ res: {}, techs: {}, lvl: {}, civics: {}, religionName: '深渊低语' });
  check('读档迁移：新档 religionName 原样保留', rnNew.religionName === '深渊低语');
  /* 标签逻辑（与 renderRes 同源）：信仰行 rowName = 有名字用名字、否则用「信仰」。 */
  function faithRowName(st) { var rn = (st.religionName || '').trim(); return rn ? rn : SB.RESS.faith.name; }
  check('信仰行标签：命名后用宗教名、未命名用「信仰」',
    faithRowName({ religionName: '' }) === SB.RESS.faith.name &&
    faithRowName({ religionName: '深渊低语' }) === '深渊低语');

  /* ── 大图书馆（2026-09-28 用户规格 · 市政《历史记录》解锁）────────────
   * 【核心结构】「图书馆 +3 级」是**虚级**：只加效果，**不提高建筑所需材料**。
   *    ⇒ 它绝不写进 `s.lvl.library`：那会被 lvlSum（破壳系数）、need 判定、
   *      costOf（下一级的材料）一并读走。用户那句「只加效果，不提高材料」
   *      就是为这条定的，下面四条断言逐面钉住它。 */
  const sciFx = o => {                       // 学者 3 人 + 可选覆盖项（lvl / wonders）
    const r = SB.state.freshRun(false);
    r.jobs.scholar = 3;
    if (o) Object.assign(r, o);
    return r;
  };
  const gLib = sciFx();
  const gWon = sciFx();
  gWon.wonders = { wonder_great_library: true };
  check('大图书馆给的是虚级：s.lvl.library 纹丝不动',
    gWon.lvl.library === 0, 'lvl.library=' + gWon.lvl.library);
  check('虚级不进 lvlSum ⇒ 建筑总级数 / 破壳系数纹丝不动',
    SB.economy.lvlSum(gWon) === SB.economy.lvlSum(gLib),
    'lvlSum ' + SB.economy.lvlSum(gLib) + ' → ' + SB.economy.lvlSum(gWon));
  check('虚级只进效果侧：libraryLevel = 真实 0 + 虚 3',
    SB.economy.libraryLevel(gLib) === 0 && SB.economy.libraryLevel(gWon) === 3,
    'libraryLevel=' + SB.economy.libraryLevel(gWon));
  /* ⚠️ costOf 读的是 `s.lvl[id]` ⇒ 虚级若被写进 lvl.library，这条**当场红**。
   *    「不提高建筑所需材料」这句话的落点就在这一行上。 */
  check('大图书馆不提高图书馆的建造材料（costOf 读不到那 3 级）',
    JSON.stringify(SB.economy.costOf(gWon, 'library')) ===
    JSON.stringify(SB.economy.costOf(gLib, 'library')),
    JSON.stringify(SB.economy.costOf(gWon, 'library')));
  const real3 = sciFx(); real3.lvl.library = 3;
  check('虚级 3 级的效果 = 图书馆真 3 级（逐值相同，不是另算一套）',
    Math.abs(SB.economy.rates(gWon).science - SB.economy.rates(real3).science) < 1e-9,
    '虚3=' + SB.economy.rates(gWon).science.toFixed(6) +
    ' 真3=' + SB.economy.rates(real3).science.toFixed(6));
  check('虚级落点只有科技产出这一处（涨的只有 science）',
    Math.abs(SB.economy.rates(gWon).culture - SB.economy.rates(gLib).culture) < 1e-9 &&
    SB.economy.rates(gWon).science > SB.economy.rates(gLib).science,
    'culture ' + SB.economy.rates(gLib).culture.toFixed(4) + ' → ' +
    SB.economy.rates(gWon).culture.toFixed(4));

  /* 政策卡《历史记录》=「图书馆效果翻倍」⇒ 乘区 ×2，且**只裹图书馆那一份**。
   * ⚠️ 研究所是另一座建筑，它的 +50%/级 不在「图书馆效果」里面（用户 2026-09-28 明选）。 */
  /* ⚠️【装前 / 装后必须是**两个独立 fixture**】早期版本写成一个 `withCard(s)` 在
   *    断言表达式里来回切同一个对象，而断言参数是**从左到右**求值的 ⇒ 条件里先把卡装上去，
   *    同一条 check 的 detail（以及后面的 `rates(lib2)`）读到的已经是装卡态，
   *    症状是「比值恒 1、libraryMul 装前也报 2」这种自相矛盾的输出。
   *    ⚠️ 判据：凡是「X 装前 / X 装后」对照，一律先各自造好，别在同一个对象上切。 */
  const lib2  = sciFx(); lib2.lvl.library = 2;
  const lib2c = sciFx(); lib2c.lvl.library = 2; lib2c.cards = ['card_records'];
  const lib2i  = sciFx(); lib2i.lvl.library = 2; lib2i.lvl.institute = 1;
  const lib2ic = sciFx(); lib2ic.lvl.library = 2; lib2ic.lvl.institute = 1; lib2ic.cards = ['card_records'];
  const sciRatio = SB.BLD.sciRatio, instSci = SB.BLD.instituteSci;
  /* ⚠️⚠️【语义钉子：翻的是「那一截」而不是「那一条」】
   *    「图书馆效果翻倍」= 图书馆的每级 +10% 变成 +20%（乘区 ×2 落在
   *    `(1 + 图书馆等级 × sciRatio)` 这一截上），**不是**「图书馆 + 研究所合起来 ×2」。
   *    ⇒ 纯图书馆情形下总比值也**不是** 2，而是 (1+2×0.1×2)/(1+2×0.1) = 7/6 ≈ 1.1667。
   *    ⚠️ 两种读法的数字差得很远（1.17 vs 2），所以这条断言是「效果翻倍」这句话
   *       唯一的裁判；改乘区位置之前先回来读这一段。用户 2026-09-28 选的是「只翻
   *       图书馆那一份、研究所那份不翻」，即本条钉住的那一种。 */
  const wantLib = (1 + 2 * sciRatio * 2) / (1 + 2 * sciRatio);
  const gotLib = SB.economy.rates(lib2c).science / SB.economy.rates(lib2).science;
  check('装《历史记录》⇒ 图书馆那一截的效果翻倍（每级 +' + (sciRatio * 100) + '% → ×2）',
    SB.civic.libraryMul(lib2) === 1 && SB.civic.libraryMul(lib2c) === 2 &&
    Math.abs(gotLib - wantLib) < 1e-9,
    lib2.card + ' → ' + lib2c.card + ' 比值=' + gotLib.toFixed(6) + '（整条 ×2 的话会是 2）');
  /* ⚠️ 这条盯的是**括号位置**：研所有一级时比值必须退化成「只翻图书馆那一截」，
   *    而不是 2。写成「整条科技产出 ×2」会把研究所一起翻掉——用户否掉了那一档。 */
  const wantWithInst = (1 + 2 * sciRatio * 2 + instSci) / (1 + 2 * sciRatio + instSci);
  const gotInst = SB.economy.rates(lib2ic).science / SB.economy.rates(lib2i).science;
  check('研究所那份不跟着翻（括号没裹到研究所，有研究所时比值进一步回落）',
    Math.abs(gotInst - wantWithInst) < 1e-9 && Math.abs(gotInst - 2) > 1e-6,
    '比值=' + gotInst.toFixed(6) + '（只翻图书馆=' + wantWithInst.toFixed(6) +
    '；若研究所也被翻，这里会是 2）');
  const gCard = sciFx(); gCard.wonders = { wonder_great_library: true }; gCard.cards = ['card_records']; gCard.card = 'card_records';
  gCard.res.science = 0;
  SB.economy.tick(gCard, 1, noop);
  check('虚级 + 政策卡：tick 与 rates 同式（面板不撒谎）',
    Math.abs(gCard.res.science - SB.economy.rates(gCard).science) < 1e-9,
    'tick=' + gCard.res.science.toFixed(6) + ' rates=' +
    SB.economy.rates(gCard).science.toFixed(6));

  // ④ 研究《法典》⇒ 白送根节点 + 自带酋邦制
  check('法典 cost 0 ⇒ 面板一开就能研究', SB.civic.canResearch(cs, 'laws') === true);
  SB.civic.research(cs, 'laws', noop);
  check('法典完成即自带政体「酋邦制」', cs.gov === 'tribe', 'gov=' + cs.gov);
  check('酋邦制给 1 个政策卡槽（用户「就降到 1 吧」）', SB.civic.slots(cs) === 1);
  check('政体的加成：藻食平坦 +5/秒', SB.civic.flow(cs).kelp === 5);

  // ⑤ 政策卡：首次装填免费，之后每次换 = 1× 最高已完成市政
  cs.res.culture = 500;
  cs.civics.mystic = 1; cs.civics.craft = 1;   // 直接记为已完成，跳过攒点（攒点速度是标定）
  check('已完成的市政解锁它的政策卡', SB.civic.cardOwned(cs, 'card_mystic') === true);
  check('首次装填政策卡不收费', SB.civic.setCard(cs, 'card_mystic', noop) === true &&
    cs.res.culture === 500, 'culture=' + cs.res.culture);
  check('政策卡装填后才生效（神秘主义 科技 +0.3/秒）',
    Math.abs(SB.civic.flow(cs).science - 0.3) < 1e-9, 'science=' + SB.civic.flow(cs).science);
  check('换卡 = 1× 最高已完成市政 cost', SB.civic.cardCost(cs) === 100);
  /* ⚠️ 2026-09-27 用户拍板改口径：**拔下也收费**。
   *    旧口径「装新卡才收、拔下免费」留了一条后门：拔下 → 装另一张，
   *    中间槽空过一次就白嫖（旧实现按「槽空 ⇒ 免费」判，整条收费形同虚设）。 */
  check('拔下同样收费（它不是免费动作，是换卡的另一半）',
    SB.civic.setCard(cs, null, noop) === true && cs.res.culture === 400, 'culture=' + cs.res.culture);
  /* 槽空 ⇒ 加成整体消失（flow 里 policyById(null) 返回 null，不是「给了 0」）。
   * ⚠️ 断言要写在拔下之后：写在前面读到的是**装填中**的 0.3，会误判成没生效。 */
  check('拔下即失效（研究出市政 ≠ 白拿效果）',
    !SB.civic.flow(cs).science && cs.card === null,
    'science=' + SB.civic.flow(cs).science + ' card=' + cs.card);
  check('重新装填 = 换卡，扣 1×',
    SB.civic.setCard(cs, 'card_mystic', noop) === true && Math.abs(cs.res.culture - 300) < 1e-9,
    'culture=' + cs.res.culture);
  /* ⚠️ 这条是「换卡收费不能被绕过」的正面证据：早期实现按「槽空 ⇒ 免费」判，
   *    于是「拔下 → 再装填」可以无限次免费换效果，整条收费机制形同虚设。
   *    现在拔下也收 ⇒ 一个来回必扣两次（拔 1× + 装 1×）。 */
  check('「拔下 → 再装填」一个来回扣两次（拔下不再是免费通道）',
    SB.civic.setCard(cs, null, noop) === true &&
    SB.civic.setCard(cs, 'card_mystic', noop) === true &&
    Math.abs(cs.res.culture - 100) < 1e-9, 'culture=' + cs.res.culture);
  /* 余额只剩 100 ⇒ 刚好再换一次。这条同时证明「刚好够」不被误拦（判据是 < cost 而非 <=）。 */
  check('两张卡之间互换同样扣 1×（余额刚好够）',
    SB.civic.cardOwned(cs, 'card_craft') === true &&
    SB.civic.setCard(cs, 'card_craft', noop) === true &&
    Math.abs(cs.res.culture) < 1e-9, 'culture=' + cs.res.culture);
  /* 余额归零后拔下应被拦——拔下收费的**拦逆**一侧，别只测扣钱那一侧。 */
  check('余额为 0 时拔下被拦（拔下收费同样受付不起约束）',
    SB.civic.setCard(cs, null, noop) === false && cs.card === 'card_craft',
    'card=' + cs.card + ' culture=' + cs.res.culture);
  check('换政体 = 2×', SB.civic.govCost(cs) === 200);

  // ⑥ 付不起就禁止操作，绝不扣成负数
  /* ⚠️ 上一节结束时余额已被扣到 0（拔下也收费之后一个来回就是 200），
   *    所以这里必须先补钱再装回，否则这一行自己被拦、后面的断言测的就不是「付不起」了。 */
  cs.res.culture = 500;
  SB.civic.setCard(cs, 'card_mystic', noop);
  cs.res.culture = 10;
  check('付不起换卡 ⇒ 禁止（不扣成负数）',
    SB.civic.setCard(cs, 'card_craft', noop) === false && cs.res.culture === 10,
    'culture=' + cs.res.culture);

  /* ⚠️ 这条是「刷新之后市政树会不会重置」的正面证据，2026-09-27 实测复现过：
   *    state.js 里 `out.civics = fixTable(raw.civics, base.civics)` —— fixTable 按
   *    **ref 的键**遍历，而 base.civics 是空表 `{}` ⇒ 读回的是空对象 ⇒ 所有已完成的
   *    市政没了，政体/政策卡却还在（它们是标量、走 173-174 行的直接拷贝）。
   *    症状只有「树重置了」，不报错，极难察觉。改 state.js 的 civics 读档时先在这里停下。 */
  const sv = SB.state.freshRun(false);
  sv.civics.laws = 1; sv.civics.craft = 1; sv.gov = 'tribe'; sv.cards = ['card_craft'];
  const rv = SB.state.migrateRun(JSON.parse(JSON.stringify(sv)));
  check('刷新（存档 → migrateRun）不掉已完成的市政',
    rv.civics.laws === true && rv.civics.craft === true,
    JSON.stringify(rv.civics));
  check('读回的市政值域统一是真值（不是 1 / 非真值混着）',
    Object.keys(rv.civics).every(function (q) { return rv.civics[q] === true || rv.civics[q] === false; }),
    JSON.stringify(rv.civics));
  /* 老档缺新 id：补成 false，别留 undefined（undefined 会让 topCost 的「已完成」判定落空）。
   * ⚠️ 期望 topCost = 0 不是 100：老档只完成过 laws，而 **laws 的 cost 本身就是 0**
   *    （它是根节点，见 civics.js）；craft 读回是 false ⇒ 不算已完成 ⇒ topCost 就是 0。
   *    写成 100 是我把「缺的那项」当成了「已完成的那项」。 */
  const rv2 = SB.state.migrateRun({ civics: { laws: 1 } });
  check('老档缺新市政 id ⇒ 补 false，不是 undefined',
    rv2.civics.laws === true && rv2.civics.craft === false &&
    isFinite(SB.civic.topCost(rv2)) && SB.civic.topCost(rv2) === 0,
    JSON.stringify(rv2.civics) + ' topCost=' + SB.civic.topCost(rv2));

  // ⑦ 接进真实经济：政体 + 政策卡那两份平坦加值要真的进 tick 与面板
  const gi = SB.state.freshRun(false);
  gi.gov = 'tribe'; gi.cards = ['card_mystic']; gi.card = 'card_mystic';
  gi.lvl.hall = 2; gi.jobs.scribe = 2;
  SB.economy.tick(gi, 1, noop);
  /* ⚠️ 藻食那条是**净**的： tick 先 addRes(+5)，同一趟再减口粮消耗。
   *    pop=1 时正好吃掉 0.30（FOOD_PER），所以落点是 4.70 而不是 5。
   *    写成 5 就说明你没读 economy.tick 的顺序，会把「扣口粮」这条误判成 bug。 */
  check('tick 结出市政点、藻食 +5 净、科技 +0.3 三份',
    Math.abs(gi.res.culture - (2 * SB.UNIT.culture + 2 * SB.CFG.CIVIC.HALL_RATE)) < 1e-9 &&
    Math.abs(gi.res.science - 0.3) < 1e-9 &&
    Math.abs(gi.res.kelp - (5 - SB.CFG.FOOD_PER * gi.pop)) < 1e-9,
    'culture=' + gi.res.culture.toFixed(3) + ' science=' + gi.res.science.toFixed(3) +
    ' kelp=' + gi.res.kelp.toFixed(3) + '（5 − 口粮 ' + (SB.CFG.FOOD_PER * gi.pop) + '）');
  check('同样的三份也出现在 rates 上（面板不撒谎）',
    Math.abs((SB.economy.rates(gi).kelp + SB.economy.foodUse(gi)) - 5) < 1e-9 &&
    Math.abs(SB.economy.rates(gi).science - 0.3) < 1e-9);

  // ⑧ UI 落点：页签、面板容器、职业表
  /* ⚠️ 这条断言**直接读 index.html 而不是查假 DOM**：
   *    假 DOM 的 .tab 列表是手写的桩（见上面那处注释），查它只能证明「桩里有」。
   *    要证明的是**真实页面上写没写**，所以这里读文件、搜属性。 */
  const realHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('真实 index.html 里写着市政页签与面板容器',
    realHtml.indexOf('data-tab="civic"') >= 0 && realHtml.indexOf('id="pane-civic"') >= 0);
  check('真实 index.html 加载了市政脚本（且早于 state，被 economy 调用）',
    /civics\.js\?v=\d+/.test(realHtml) &&
    realHtml.indexOf('civics.js') < realHtml.indexOf('src/state.js'));
  check('市政页容器已就位', !!doc.getElementById('pane-civic'));
  check('市政页已注册进面板表', SB.ui.render.PANE_KEYS.indexOf('civic') >= 0,
    SB.ui.render.PANE_KEYS.join(','));
  check('书手三处表齐全：JOBS / folk.IDS / 状态默认表',
    SB.JOBS.some(j => j.id === 'scribe') &&
    SB.folk.IDS.indexOf('scribe') >= 0 &&
    SB.state.freshRun(false).jobs.scribe === 0);
  check('书手由「石工」解锁（与议事厅同一个科技）',
    SB.folk.jobTechOf('scribe') === 'masonry', '→ ' + SB.folk.jobTechOf('scribe'));

  /* ⑨ bot 是否真的跑过这条线。断言放在最后是因为它读的是**整局结束后的真实存档**——
   *    ⚠️ 「回归全绿」证明不了新东西在跑。书手若不在 bot 的配工权重表里（上面 ② 那处），
   *       市政点恒 0、市政页永不开、法典永远研究不了，而**不会有任何一条断言变红**。
   *    所以下面这三条是这条纪律的执行者，不是锦上添花。 */
  const fin = SB.game.run();
  check('整局跑完：议事厅建起 ⇒ 市政页开过', SB.civic.panelOpen(fin) === true, 'hall=' + fin.lvl.hall);
  check('整局跑完：市政点确实产过（书手与议事厅两条都在产）',
    (fin.got.culture || 0) > 0, '累计 ' + (fin.got.culture || 0).toFixed(1) + ' 点');
  check('整局跑完：法典已完成并自带政体', !!fin.civics.laws && fin.gov === 'tribe',
    'civics=' + JSON.stringify(fin.civics) + ' gov=' + fin.gov);

  /* ── 市政树横卷几何（用户 2026-09-27「市政树要做成科技树这样」）──
   * ⚠️ 只断言「页面上出现过市政三个字」是不够的：缩进列表也能过，而那正是这次要消灭的。
   *    几何是判据本身 —— 于是这里按 (列, 行) 把形状重新推一遍，与渲染用的是同一个 layout()。 */
  const CL = SB.civic.layout();
  const cellL = CL.cells.laws, cellC = CL.cells.craft, cellM = CL.cells.mystic;
  check('市政树是横卷：三条节点摊到 (列, 行) 上，不是一列竖排',
    !!cellL && !!cellC && !!cellM &&
    cellL.col === 0 && cellL.row === 0 &&
    cellC.col === 1 && cellM.col === 1 &&
    cellC.row !== cellM.row,
    `法典(c${cellL.col},r${cellL.row}) 技艺(c${cellC.col},r${cellC.row}) ` +
    `神秘主义(c${cellM.col},r${cellM.row})`);

  check('市政树用与科技树相同的卡片尺寸（两张树长得一样高）',
    CL.geo.W === SB.tech.geo.W && CL.geo.H === SB.tech.geo.H &&
    CL.geo.PADX === SB.tech.geo.PADX && CL.geo.PADY === SB.tech.geo.PADY,
    `市政 ${CL.geo.W}×${CL.geo.H} / 科技 ${SB.tech.geo.W}×${SB.tech.geo.H}`);

  /* 连线必须数与 reqs 数一致：少一条线时树是「断的」，而渲染层对此完全静默。 */
  const reqN = SB.CIVICS.filter(c => c.reqs && c.reqs.length)
    .reduce((n, c) => n + c.reqs.length, 0);
  check('市政树的连线条数与 reqs 总数一致（线不是漏画的）',
    CL.edges.length === reqN && CL.edges.length > 0,
    `${CL.edges.length} 条线 / ${reqN} 条 reqs`);

  /* 已达成的鼓舞不印 `2 / 1` 这种「超上限」读数（工坊 2 级 vs 条件 1 级）。
   * ⚠️ 这条盯的是 condShort 的原始读数**不能直接上屏**：它返回的 now 可以大于 need，
   *    照搬会读成「坏掉了」。boostText 必须在达成时改念条件本身。 */
  const cs2 = SB.state.freshRun(false);
  cs2.lvl.hall = 1; cs2.lvl.workshop = 2;          // 条件要 1 级，现给 2 级 ⇒ now > need
  const craftC = SB.civic.byId('craft');
  const bt = SB.civic.boostText(cs2, craftC);
  check('鼓舞已达成时不显示「2 / 1」这种超上限读数',
    bt.indexOf('2 / 1') === -1 && bt.indexOf('已达成') >= 0 &&
    SB.civic.condShort(cs2, craftC.boost).now > craftC.boost.n,
    bt + '（condShort 原始读数 ' + SB.civic.condShort(cs2, craftC.boost).txt + '）');

  /* ── 政体 / 政策卡（Civ6 式外壳，用户 2026-09-27「做成文明 6 那样」）──
   * ⚠️ 这批不是「UI 好看不好看」的断言。核心是三条机制真的存在：
   *      ① 政体带**槽位配方**（不只是槽位数），换政体 = 换被动 + 换配方；
   *      ② 政策卡带**类型**，且规则真的拦（cardFits 不是摆设）；
   *      ③ 状态层此刻只承载 1 个槽 —— 下面第 4 条把这个限制钉住，
   *         否则「只加配方不迁状态」会让面板画出两个空格子、装填第二个永远失败。 */
  const cs3 = SB.state.freshRun(false);
  cs3.lvl.hall = 1;
  cs3.civics.laws = 1; cs3.gov = 'tribe';
  const tribe = SB.GOVS.find(v => v.id === 'tribe');
  const cmyst = SB.POLICIES.find(p => p.id === 'card_mystic'); // type sci
  check('政体的 slots 是**槽位配方**（各类型各几个），不是槽位数',
    tribe && typeof tribe.slots === 'object' && tribe.slots.wild === 1 &&
    SB.civic.slotList(cs3).length === 1 &&
    SB.civic.slotTypeName(SB.civic.slotList(cs3)[0].type) === '万能槽',
    JSON.stringify(tribe.slots) + ' → ' + SB.civic.slotTypeName(SB.civic.slotList(cs3)[0].type));

  check('政策卡带类型，且规则真拦：科研槽装不下工造卡',
    cmyst.type === 'sci' &&
    SB.civic.cardFits(cmyst, 'sci') === true &&
    SB.civic.cardFits(cmyst, 'prod') === false &&
    SB.civic.cardFits(cmyst, 'wild') === true &&
    /* 老卡没标类型 ⇒ 不硬堵（缺省视同万能），否则一张卡会永久装不进去 */
    SB.civic.cardFits({ name: '没标类型的老卡' }, 'prod') === true,
    cmyst.name + '=' + cmyst.type + '：科研槽✓ 工造槽✗ 万能槽✓');

  /* ⚠️ 这条盯的是上面那个脱钩坑：只改配方、不动状态 ⇒ 面板画出两个槽而状态只记得一张。
   *    判据不用「配方有几个槽」，而用「**状态层能承载几个**」——
   *    因为单值 s.card 是此刻的唯一事实。加第二槽时这条会红，提醒你连状态一起升维。 */
  const cap = 3;                                    // 状态已升维到 s.cards 数组 ⇒ 承载 3 个槽
  const recipeN = (() => { let n = 0; for (const k in tribe.slots) n += tribe.slots[k]; return n; })();
  check('配方槽数不超过状态层能承载的槽数（状态已升维到 s.cards，cap=3）',
    recipeN <= cap, `tribe 配方 ${recipeN} 个 / 状态承载 ${cap} 个`);

  /* ── 多槽（2026-09-29：三种纪元二政体各 3 槽，状态升维 s.cards）── */
  const era2Govs = ['autocracy', 'oligarchy', 'classical_republic'];
  let allThree = true, badThree = [];
  for (const gid of era2Govs) {
    const g = SB.GOVS.find(v => v.id === gid);
    let n = 0; for (const k in g.slots) n += g.slots[k];
    const st = SB.state.freshRun(false); st.gov = gid;
    const L = SB.civic.slotList(st).length;
    if (n !== 3 || L !== 3) { allThree = false; badThree.push(gid + '=' + n + '/' + L); }
  }
  check('三种纪元二政体各给 3 个槽（用户「三个政体都给三个槽」），配方与状态一致',
    allThree, badThree.join(' '));

  /* 多槽可同时装多张卡：flow 逐槽聚合、乘区逐槽相乘。 */
  const g3 = SB.state.freshRun(false);
  g3.civics = { laws: 1, craft: 1, mystic: 1, drama: 1, records: 1, theology: 1, political: 1 };
  g3.gov = 'autocracy'; g3.cards = []; g3.res.culture = 9999;
  check('独裁统治给 3 个槽', SB.civic.slots(g3) === 3);
  check('可同时装 3 张卡（填满 3 槽）',
    SB.civic.setCard(g3, 'card_mystic', noop) &&
    SB.civic.setCard(g3, 'card_drama', noop) &&
    SB.civic.setCard(g3, 'card_records', noop) &&
    g3.cards.filter(Boolean).length === 3, 'cards=' + JSON.stringify(g3.cards));
  check('flow 逐槽聚合：3 槽里神秘主义贡献 science +0.3',
    Math.abs(SB.civic.flow(g3).science - 0.3) < 1e-9, 'science=' + SB.civic.flow(g3).science);
  check('乘区逐槽相乘：广场×2 与图书馆×2 各自生效',
    SB.civic.squareMul(g3) === 2 && SB.civic.libraryMul(g3) === 2,
    'squareMul=' + SB.civic.squareMul(g3) + ' libraryMul=' + SB.civic.libraryMul(g3));
  /* 换政体截断溢出槽：独裁(3) → 酋邦制(1) 只保留第 0 号槽。 */
  SB.civic.setGov(g3, 'tribe', noop);
  check('换政体截断溢出槽（独裁3槽→酋邦制1槽，保留第0号槽的卡）',
    SB.civic.slots(g3) === 1 && g3.cards.length === 1 && g3.cards[0] === 'card_mystic',
    'cards=' + JSON.stringify(g3.cards));
  /* 逐槽拔下：removeCard 只清指定槽，不碰其他槽。 */
  const g4 = SB.state.freshRun(false);
  g4.civics = { laws: 1, political: 1, mystic: 1, records: 1 };
  g4.gov = 'autocracy'; g4.res.culture = 9999;
  SB.civic.setCard(g4, 'card_mystic', noop); SB.civic.setCard(g4, 'card_records', noop);
  check('逐槽拔下只清指定槽，其余槽不动',
    SB.civic.removeCard(g4, 0, noop) &&
    g4.cards[0] === null && g4.cards[1] === 'card_records',
    'cards=' + JSON.stringify(g4.cards));

  /* 类型不匹配必须能被解释出来 —— 按钮灰着却不说话，玩家只会觉得坏了。 */
  const cs4 = SB.state.freshRun(false);
  cs4.lvl.hall = 1; cs4.civics.laws = 1; cs4.civics.craft = 1; cs4.civics.mystic = 1; cs4.gov = 'tribe';
  const prodCard = SB.POLICIES.find(p => p.id === 'card_craft');
  cs4.cards = ['card_craft']; cs4.card = 'card_craft';
  /* 造一个「非万能槽」的情形：酋邦制是万能槽，所以它装工造卡是合法的。
   * 于是拿**万能槽规则**去验证：任何卡都能塞 ⇒ 不该报「不对口」。 */
  const noFitWhy = SB.civic.cardBlocked(cs4, cmyst.id);
  check('万能槽装科研卡不报「不对口」（外壳上线但类型此刻不咬人，是预期的）',
    noFitWhy === null, 'cardBlocked → ' + (noFitWhy === null ? 'null（允许装填）' : noFitWhy));
  /* 直接验证规则层：把槽位换成工造槽，同一张卡就该被拒。 */
  const cs5 = SB.state.freshRun(false);
  cs5.lvl.hall = 1; cs5.civics.laws = 1; cs5.civics.craft = 1; cs5.civics.mystic = 1; cs5.gov = 'tribe';
  const tribeFake = SB.GOVS.find(v => v.id === 'tribe');
  const realSlots = tribeFake.slots;
  tribeFake.slots = { prod: 1 };                    // 临时改成工造槽
  const whyProd = SB.civic.cardBlocked(cs5, cmyst.id);
  tribeFake.slots = realSlots;                      // 还原，别污染后续断言
  check('工造槽装科研卡 ⇒ 明确报装不下并指出类型（灰按钮有话说，不是静默失败）',
    whyProd !== null &&
    whyProd.indexOf('装不下') >= 0 && whyProd.indexOf('神秘主义') >= 0 &&
    whyProd.indexOf('科研槽') >= 0,
    whyProd);

  /* ── 政治哲学 + 三种政体（2026-09-29 用户规格）──
   * ⚠️ 与政体外壳同批：核三件事真存在：
   *      ① 政治哲学解锁三条政体（govs 数组被 govOwned 认）；
   *      ② 三选一采用后各自效果真进结算（工坊效率/奢侈品/幸福度）；
   *      ③ 采用走 setGov（2× 收费），不自动锁死。 */
  const pol = SB.state.freshRun(false);
  pol.lvl.hall = 1; pol.civics.laws = 1; pol.gov = 'tribe';
  check('政治哲学未完成 ⇒ 三种政体都锁（govOwned=false）',
    SB.civic.govOwned(pol, 'autocracy') === false &&
    SB.civic.govOwned(pol, 'oligarchy') === false &&
    SB.civic.govOwned(pol, 'classical_republic') === false, 'govOwned 三者');
  pol.civics.political = 1;
  check('政治哲学完成 ⇒ 解锁三种政体（govs 数组生效，三选一）',
    SB.civic.govOwned(pol, 'autocracy') === true &&
    SB.civic.govOwned(pol, 'oligarchy') === true &&
    SB.civic.govOwned(pol, 'classical_republic') === true, 'govOwned 三者');

  /* 独裁 +10% 工坊效率：加法档，与建筑级/科技/奇观同聚合 */
  const au = SB.state.freshRun(false); au.gov = 'autocracy';
  check('独裁统治：工坊效率 +10%（craftRatio 含政体项，加法档）',
    Math.abs(SB.workshop.craftRatio(au) - 0.10) < 1e-9 &&
    Math.abs(SB.workshop.craftMul(au) - 1.10) < 1e-9,
    'craftRatio=' + SB.workshop.craftRatio(au) + ' craftMul=' + SB.workshop.craftMul(au));

  /* 技艺 +20% 工坊效率（政策卡，2026-09-30 用户拍）：走与政体同一条加法乘区，
   * 装在卡槽里才生效（cardCraftRatio 读 s.cards，与 mulOfField 同口径）。 */
  const cc = SB.state.freshRun(false); cc.cards = ['card_craft']; cc.card = 'card_craft';
  check('技艺卡：工坊效率 +20%（craftRatio 含卡片项，装槽才生效）',
    SB.civic.policyById('card_craft').craftRatio === 0.20 &&
    Math.abs(SB.workshop.craftRatio(cc) - 0.20) < 1e-9 &&
    Math.abs(SB.workshop.craftMul(cc) - 1.20) < 1e-9,
    'card craftRatio=' + SB.civic.policyById('card_craft').craftRatio +
    ' craftRatio(cc)=' + SB.workshop.craftRatio(cc));

  /* 寡头 +20% 奢侈品产出：与马具 toolMul 独立乘，tick/rates 同式 */
  const ol = SB.state.freshRun(false); ol.gov = 'oligarchy'; ol.jobs.merchant = 2; ol.pop = 0;
  const _luxCap = 2 * SB.UNIT.luxury * SB.economy.baseMul(ol);
  check('寡头统治：奢侈品产出 ×1.2（tick/rates 同式，与马具独立乘）',
    Math.abs(SB.economy.rates(ol).luxury - _luxCap * 1.2) < 1e-9,
    'rates.luxury=' + SB.economy.rates(ol).luxury + ' 期望=' + (_luxCap * 1.2).toFixed(4));

  /* ══ ERA3 市政扩展（2026-09-30 用户规格表，5 节点 + 君主制 + 4 卡 + 2 奇观 + 潮道）══ */

  /* ① 君主制：礁栖核心建筑造价 ×0.9，其他分区不动（规格原文「所有礁栖核心建筑」）。 */
  {
    const mo = SB.state.freshRun(false); mo.gov = 'monarchy';
    const tr = SB.state.freshRun(false); tr.gov = 'tribe';
    const coreM = SB.economy.costOf(mo, 'hall'), coreT = SB.economy.costOf(tr, 'hall');
    const tradeM = SB.economy.costOf(mo, 'ballast'), tradeT = SB.economy.costOf(tr, 'ballast');
    check('君主制：礁栖核心建筑造价 ×0.9（hall），贸易区域不动（ballast）',
      Math.ceil(coreT.stone * 0.9) === coreM.stone &&
      Math.ceil(coreT.coral * 0.9) === coreM.coral &&
      tradeM.stoneBeam === tradeT.stoneBeam && tradeM.hardCoral === tradeT.hardCoral,
      'hall ' + coreT.stone + '→' + coreM.stone + ' ballast ' + tradeT.stoneBeam + '=' + tradeM.stoneBeam);
  }

  /* ② 王国潮道：等级 ≤ 灯塔等级（灯塔 0 级建不起来；1 级灯塔只准 1 级潮道）。 */
  {
    const ca = SB.state.freshRun(false);
    ca.civics.department = 1; ca.res.stone = 1e6; ca.res.steel = 1e6;
    const locked = SB.habitat.build(ca, 'canal', null) === false;
    ca.lvl.lighthouse = 1;
    const first = SB.habitat.build(ca, 'canal', null) === true && ca.lvl.canal === 1;
    const second = SB.habitat.build(ca, 'canal', null) === false && ca.lvl.canal === 1;
    check('王国潮道：等级钳制在灯塔等级（0 级灯塔锁死 → 1 级放行一级 → 拒绝第二级）',
      locked && first && second,
      'lock=' + locked + ' first=' + first + ' second=' + second +
      ' reason=' + (SB.habitat.lockReason(ca, SB.habitat.buildingById('canal')) || 'null'));
  }

  /* ②' 王国潮道的效果面：每级 −0.3% 居民奢侈品消耗（需求 D 侧缩减，净速率上升）。 */
  {
    const cs = SB.state.freshRun(false);
    cs.jobs.merchant = 10; cs.pop = 1; cs.happy = 0;
    const n0 = SB.economy.rates(cs).luxury;
    cs.lvl.canal = 1;
    const n1 = SB.economy.rates(cs).luxury;
    const D0 = 1 * SB.economy.happyCost(0);
    check('王国潮道：1 级 −0.3% 居民奢侈品消耗（D 侧缩，Δnet = D×0.003）',
      Math.abs((n1 - n0) - D0 * 0.003) < 1e-9,
      'Δnet=' + (n1 - n0).toFixed(6) + ' 期望=' + (D0 * 0.003).toFixed(6));
  }

  /* ③ 商人副产（中世纪集市解锁2）：每名商人 +0.05/s 科学与市政点，面板与结算同式。 */
  {
    const mk = SB.state.freshRun(false);
    mk.jobs.merchant = 4; mk.pop = 0;
    mk.civics.market = 0;
    const rA = SB.economy.rates(mk);
    mk.civics.market = 1;
    const rB = SB.economy.rates(mk);
    const g = SB.economy.globalMul(mk);
    check('中世纪集市：商人副产 +0.05/s 科学 +0.05/s 市政（rates 路，×globalMul）',
      Math.abs((rB.science - rA.science) - 4 * 0.05 * g) < 1e-9 &&
      Math.abs((rB.culture - rA.culture) - 4 * 0.05 * g) < 1e-9,
      'Δsci=' + (rB.science - rA.science).toFixed(4) + ' Δcult=' + (rB.culture - rA.culture).toFixed(4) +
      ' 期望=' + (4 * 0.05 * g).toFixed(4));
  }

  /* ④ 中世纪集市卡：仓储区建筑容量贡献 ×2（基础容量与科技容量不翻）。
   * fresh 档 techCap=0 ⇒ cap0 = B + 3K、cap1 = B + 6K，等价于 cap1 − 3K === cap0。 */
  {
    const st = SB.state.freshRun(false);
    st.lvl.kelpstore = 3;
    const cap0 = SB.economy.capOf(st, 'kelp');
    st.cards = ['card_market']; st.card = 'card_market';
    const cap1 = SB.economy.capOf(st, 'kelp');
    check('中世纪集市卡：海藻仓容量贡献 ×2（base 与科技段不动）',
      Math.abs(cap1 - 3 * SB.BLD.kelpCap - cap0) < 1e-6,
      'cap0=' + cap0 + ' cap1=' + cap1 + ' kelpCap=' + SB.BLD.kelpCap);
  }

  /* ⑤ 农奴制卡：藻场↔牧场互乘（每级 ×1.01，互不吃自己的等级）。 */
  {
    const sf = SB.state.freshRun(false);
    sf.lvl.kelp = 5; sf.lvl.warmnest = 3;
    sf.cards = ['card_serfdom']; sf.card = 'card_serfdom';
    const noKelp = SB.state.freshRun(false);
    noKelp.lvl.kelp = 5; noKelp.lvl.warmnest = 3;
    check('农奴制卡：牧场 3 级给藻场 ×1.03、藻场 5 级给牧场减免 ×1.05',
      Math.abs(SB.civic.serfKelpMul(sf) - 1.03) < 1e-9 &&
      Math.abs(SB.civic.serfWarmMul(sf) - 1.05) < 1e-9 &&
      SB.civic.serfKelpMul(noKelp) === 1,
      'serfKelp=' + SB.civic.serfKelpMul(sf) + ' serfWarm=' + SB.civic.serfWarmMul(sf));
  }

  /* ⑥ 王权神授卡：城堡每级 +10% 信仰产出（装卡才生效）。 */
  {
    const so = SB.state.freshRun(false);
    so.lvl.castle = 2;
    so.cards = ['card_sovereign']; so.card = 'card_sovereign';
    const soOff = SB.state.freshRun(false); soOff.lvl.castle = 2;
    check('王权神授卡：城堡 2 级 → 信仰 ×1.2（不装卡 ×1）',
      Math.abs(SB.civic.castleFaithMul(so) - 1.2) < 1e-9 && SB.civic.castleFaithMul(soOff) === 1,
      'on=' + SB.civic.castleFaithMul(so) + ' off=' + SB.civic.castleFaithMul(soOff));
  }

  /* ⑦ 两座奇观：needCivic 门 + 效果（修道院每市政 +1% 信仰 / 大巴扎每人 +1% 奢侈）。 */
  {
    const wb = SB.state.freshRun(false);
    const abbeyLocked = SB.workshop.wonderBlocked(wb, 'wonder_stt_abbey');
    wb.civics.sovereign = 1;
    wb.civics.laws = 1; wb.civics.craft = 1; wb.civics.theology = 1; // 凑 4 个完成市政
    const abbeyOpen = SB.workshop.wonderBlocked(wb, 'wonder_stt_abbey') === null ||
      (SB.workshop.wonderBlocked(wb, 'wonder_stt_abbey') || '').indexOf('市政') < 0;
    wb.wonders = { wonder_stt_abbey: true };
    const fm = SB.wonder.abbeyFaithMul(wb);
    const bz = SB.state.freshRun(false);
    bz.civics.guild = 1; bz.wonders = { wonder_grand_bazaar: true }; bz.pop = 30;
    check('奇观：修道院 needCivic 门 + 4 市政 ×1.04；大巴扎 30 人 ×1.30',
      (abbeyLocked || '').indexOf('市政') >= 0 && abbeyOpen &&
      Math.abs(fm - 1.04) < 1e-9 && Math.abs(SB.wonder.bazaarLuxMul(bz) - 1.30) < 1e-9,
      'locked=' + abbeyLocked + ' faith=' + fm + ' lux=' + SB.wonder.bazaarLuxMul(bz));
  }

  /* ⑧ 卡退役：职业行会完成后技艺卡不可再装（cardOwned=false）。 */
  {
    const gd = SB.state.freshRun(false);
    gd.civics.craft = 1;
    const before = SB.civic.cardOwned(gd, 'card_craft');
    gd.civics.guild = 1;
    check('职业行会：完成后技艺卡退役（之前可装、之后不可装）',
      before === true && SB.civic.cardOwned(gd, 'card_craft') === false,
      'before=' + before + ' after=' + SB.civic.cardOwned(gd, 'card_craft'));
  }

  /* ⑨ 生息区自动升级：封建主义 + 开关 → 买得起就自动建一级；没开关/没市政不动作。 */
  {
    const aU = SB.state.freshRun(false);
    aU.res.kelp = 1e6;
    SB.habitat.autoTick(aU, null);                       // 没封建主义：不动
    const before = aU.lvl.kelp;
    aU.civics.feudalism = 1;
    SB.habitat.autoTick(aU, null);                       // 有封建主义但没开开关：不动
    const mid = aU.lvl.kelp;
    aU.autoUpg = { kelp: true };
    SB.habitat.autoTick(aU, null);                       // 开关打开：自动买一级
    check('生息区自动升级：封建主义+开关才动作（kelp 0→1），前两拍不动',
      before === 0 && mid === 0 && aU.lvl.kelp === 1,
      'before=' + before + ' mid=' + mid + ' after=' + aU.lvl.kelp);
  }

  /* ⑩ 职业行会卡：工坊效率 +40%（取代技艺的 +20% 通道，同一加法聚合）。 */
  {
    const gl = SB.state.freshRun(false);
    gl.cards = ['card_guild']; gl.card = 'card_guild';
    check('职业行会卡：工坊效率 +40%（craftMul=1.40）',
      Math.abs(SB.workshop.craftRatio(gl) - 0.40) < 1e-9,
      'craftRatio=' + SB.workshop.craftRatio(gl));
  }

  /* 古典共和 +1 幸福度：断供也保底（制度红利），有贸易时稳定高于无政体 +1（偏移非漂移） */
  const crRep = SB.state.freshRun(false); crRep.gov = 'classical_republic'; crRep.jobs.merchant = 0;
  SB.economy.tick(crRep, 1, noop);
  check('古典共和：幸福度 +1 常驻（断供也保底，不惩罚）',
    crRep.happy === 1 && SB.civic.govHappyBonus(crRep) === 1, 'happy=' + crRep.happy);
  const cr2 = SB.state.freshRun(false); cr2.gov = 'classical_republic'; cr2.jobs.merchant = 3; cr2.pop = 1;
  const noGov = SB.state.freshRun(false); noGov.jobs.merchant = 3; noGov.pop = 1;
  for (var _k = 0; _k < 50000; _k++) { SB.economy.tick(cr2, 1, noop); SB.economy.tick(noGov, 1, noop); }
  check('古典共和：有贸易时幸福度稳定高于无政体 +1（偏移量，非每帧累加漂移）',
    Math.abs(cr2.happy - (noGov.happy + 1)) < 0.1 && cr2.happy > noGov.happy && cr2.happy < 50,
    '共和 H=' + cr2.happy.toFixed(3) + ' 无政体 H=' + noGov.happy.toFixed(3));

  /* 采用政体走 setGov（2× 收费），不自动锁死 */
  const adopt = SB.state.freshRun(false);
  adopt.lvl.hall = 1; adopt.civics.laws = 1; adopt.civics.political = 1;
  adopt.gov = 'tribe'; adopt.res.culture = 2000;
  const _topC = SB.civic.topCost(adopt);
  check('采用独裁统治（换政体）= 2× 最高已完成市政',
    SB.civic.setGov(adopt, 'autocracy', noop) === true && adopt.gov === 'autocracy' &&
    Math.abs(adopt.res.culture - (2000 - _topC * 2)) < 1e-9,
    'culture=' + adopt.res.culture + ' 收费=' + (_topC * 2));

  const civicPane = g('pane-civic');
  check('市政页输出的是横卷容器（.techscroll + .technode），不是缩进列表',
    /class="techscroll"[^>]*id="civicScroll"/.test(civicPane) &&
    /class="technode st[^"]*"/.test(civicPane) &&
    civicPane.indexOf('civicrow-laws') >= 0,
    'canvas=' + /id="civicScroll"/.test(civicPane) +
    ' 节点=' + (civicPane.match(/class="technode/g) || []).length + ' 个');

  /* ⚠️ 这条是专门防上面那个 id 耦合 bug 的：市政 canvas 与科技 canvas 都带
   *    .techscroll 类，若拖动逻辑按 id 取容器，拖市政树会去动科技树的滚动位置。
   *    断言 = 拖市政 canvas，科技树的 scrollLeft 必须纹丝不动。 */
  const civicBox = doc.getElementById('civicScroll');
  const techBox = doc.getElementById('techScroll');
  if (civicBox && techBox) {
    civicBox.closest = sel => (sel === '.techscroll' ? civicBox : null);
    techBox.scrollLeft = 400;                       // 脏初值：0 与「没写」读数相同
    const ptrC = kind => (doc._ev[kind] || []).forEach(fn =>
      fn({ pointerType: 'mouse', button: 0, clientX: 900, target: civicBox, preventDefault() {} }));
    ptrC('pointerdown'); ptrC('pointermove'); ptrC('pointerup');
    check('拖市政长卷不会连带拖走科技长卷（两个容器各归各的 id）',
      techBox.scrollLeft === 400,
      '科技树 scrollLeft=' + techBox.scrollLeft + '（应仍是脏初值 400）');
  } else {
    check('拖市政长卷不会连带拖走科技长卷（两个容器各归各的 id）', false,
      ' civicScroll / techScroll 容器没找到');
  }
}

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
const s3 = SB.game.run();
SB.game.meta().tide = 30;                       // 给够点数，验证扣款与到账
const kelpBefore = s3.res.kelp;
fire({ dataset: { perk: 'food' } });            // 前朝藻席：+200 藻食，2 点
check('可购买起始资源类增益', s3.res.kelp >= kelpBefore + 200, '藻食 ' + kelpBefore.toFixed(0) + ' → ' + s3.res.kelp.toFixed(0));
check('购买后扣除轮回点', SB.game.meta().tide < 30, '剩余 ' + SB.game.meta().tide.toFixed(2));
check('已购增益写入跨周目记录', SB.game.meta().perks.food === 1);

fire({ dataset: { perk: 'g1' } });              // 异族鳍肢：采集 +10%
check('可购买产出效率类增益并累计层数', (s3.perk.gather || 0) > 0, 'gather=' + s3.perk.gather);

SB.game.meta().tide = 0;
fire({ dataset: { perk: 'coral' } });           // 没钱了
check('轮回点不足时无法购买', (SB.game.meta().perks.coral || 0) === 0);

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
  clearInterval() {}
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
const sPre = SB.game.run();
sPre.lvl.kelp = 3; sPre.res.coral = 500; sPre.pop = 20;   // 埋一批本局进度（测试夹具，直接写字段）
const cyclePre = metaPre.cycle;

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
check('软重置清空本局进度',
  SB.economy.lvlSum(sReset) === 0 && sReset.res.coral === 0 && sReset.pop === SB.CFG.POP_START);
check('软重置保留轮回点，周目计数 +1',
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

/* ---------------- 轮回系统（宗教 → 弹窗 → 轮回点 / 商店门控）----------------
 * 2026-09-29 新增：建立宗教解锁「轮回」；解锁前不发放轮回点；
 * 首次轮回后解锁轮回商店。这条与「破冰是否发生」无关（破冰走 geyser 线，当前恒 0），
 * 所以这里直接驱动 doBreak / maybeReligionPopup / startRun 验证门控本身。 */
console.log('\n=== 轮回系统门控 ===');
// 先把宗教/商店开关钉成「未解锁」，保证本段自包含（不受前面主流程是否触发过弹窗影响）
SB.game.meta().religionSeen = false;
SB.game.meta().shopUnlocked = false;
SB.state.saveMeta(SB.game.meta());
// 0) 负向：仅完成神学、未写宗教名 ⇒ 不视为建立宗教（不得解锁轮回）
var sR0 = SB.game.run();
sR0.civics.theology = true; sR0.religionName = '';
SB.game.maybeReligionPopup(sR0);
check('仅完成神学、未命名 ⇒ 不建立宗教（religionSeen 仍为 false）', SB.game.meta().religionSeen === false);
// 1) 解锁轮回前：doBreak 不发放轮回点
var sR = SB.game.run();
sR.peak = 120; sR.shell = 0; sR.broken = false;
var tideBefore = SB.game.meta().tide;
SB.prestige.doBreak(sR, null);
check('解锁轮回前 doBreak 不发放轮回点', SB.game.meta().tide === tideBefore, 'tide=' + SB.game.meta().tide.toFixed(2));
sR.broken = false;   // 还原，避免影响后续断言
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
SB.game.maybeReligionPopup(sR2);
check('写入宗教名后 meta.religionSeen = true', SB.game.meta().religionSeen === true);
check('宗教弹窗台词就位（文明的轮回）', /文明的轮回/.test(doc.getElementById('modalBox').innerHTML));
// 3) 解锁轮回后：doBreak 正常发放轮回点，且「第一次真实轮回」即解锁商店
sR2.peak = 120; sR2.shell = 0; sR2.broken = false;
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


/* ---------------- 科研面板开门（纪元一的开场，UI 三道闸）----------------
 * 状态层的关系在上一节验过了；这里验渲染层：tab 灰不灰、setTab 拦不拦、
 * 弹窗台词在不在、关掉弹窗有没有真翻到科技页。缺任何一道都会变成
 * 「面板亮了却点不开」或「弹窗关了页没翻」，这类错位只有跑完整 UI 才看得见。
 * 用的是硬重置之后那个全新周目，状态干净。 */
console.log('\n=== 科研面板开门 ===');
{
  const s = SB.game.run();
  check('开局：科技 tab 灰着，点了也翻不过去',
    SB.ui.render.techTabOpen() === false &&
    (SB.game.setTab('tech'), SB.game.getTab() !== 'tech'), 'tab=' + SB.game.getTab());
  check('开局：科技面板渲染「未翻开」空态而不是空白',
    g('pane-tech').indexOf('未翻开') !== -1, g('pane-tech').slice(0, 50).replace(/\n/g, ' '));

  /* 尤里卡播报的**时机**（用户 2026-09-26：尤里卡等解锁科技之后一起展示）。
   * 三条断言分别钉「不开门不播」「但揭示照常」「开了门一次性摊开且相邻」。 */
  s.res.kelp = 60;                     // 「种植」的尤里卡条件（藻食存量 60）已达成
  SB.game.pumpTech(s, noop);
  const eur = () => (g('log').match(/尤里卡：[^<]*/g) || []);
  check('科技页解锁前，尤里卡不写进日志（那时玩家手里还没有科技页）',
    eur().length === 0, '日志里的尤里卡=' + JSON.stringify(eur().slice(0, 3)));
  check('但揭示照常记账：条件达成了就该亮（开关只挡播报，不挡揭示）',
    SB.tech.isRevealed(s, 'plant') === true && SB.tech.isRevealed(s, 'coralcut') === true,
    'plant=' + SB.tech.isRevealed(s, 'plant') + ' coralcut=' + SB.tech.isRevealed(s, 'coralcut'));
  check('未达成的仍然不揭示（对照：采石要珊瑚 40，此刻珊瑚 0）',
    SB.tech.isRevealed(s, 'quarry') === false, 'quarry=' + SB.tech.isRevealed(s, 'quarry'));

  s.lvl.kelp = 5;                      // 等价于玩家建成第 5 座藻场
  SB.game.pumpTech(s, noop);           // 与线上同一条触发路径（建造动作后补跑的那一趟）
  const m = doc.getElementById('modal');
  check('第 5 座：弹出结绳叙事窗（两句台词都在）',
    !m.classList.contains('hidden') &&
    g('modalBox').indexOf('这代表今天') !== -1 && g('modalBox').indexOf('这代表明天') !== -1);
  check('叙事窗只播一次（记账后才弹，重跑 pump 不重播）',
    SB.tech.popupSeen(s) === true && (SB.game.pumpTech(s, noop), true));
  check('弹窗给出「进入科技页」的动作', typeof doc.getElementById('mStoryOk').onclick === 'function');

  /* 开门那一刻，攒下的尤里卡一起摊开。 */
  const lg0 = g('log');
  check('开门那一刻：攒下的尤里卡一起摊开（凿珊瑚 + 种植都在）',
    /尤里卡：凿珊瑚/.test(lg0) && /尤里卡：种植/.test(lg0),
    JSON.stringify(eur().slice(-4)));
  check('它们相邻展示，不被别的播报夹在中间',
    /<div>· 尤里卡：[^<]*<\/div><div>· 尤里卡：[^<]*<\/div>/.test(lg0),
    JSON.stringify(eur().slice(-2)));
  check('默认条件的尤里卡不再留一个空破折号',
    lg0.indexOf('——  已达成') === -1 && /尤里卡：凿珊瑚 已达成/.test(lg0),
    JSON.stringify(eur().filter(x => x.indexOf('凿珊瑚') >= 0)));
  /* 反向对照：上面那三条只证明「不开门不播」，证明不了「开了门会播」。
   * 少了这一条，把播报整个删掉也能全绿。 */
  s.res.coral = 40;                    // 「采石」的尤里卡条件（珊瑚存量 40）
  SB.game.pumpTech(s, SB.game.emit);
  check('开门之后，新达成的尤里卡立刻写进日志（不是从此静音）',
    /尤里卡：采石/.test(g('log')), JSON.stringify(eur().slice(0, 2)));
  s.res.coral = 0;

  doc.getElementById('mStoryOk').onclick();
  check('关掉弹窗即翻到科技页', SB.game.getTab() === 'tech', 'tab=' + SB.game.getTab());
  const paneT = g('pane-tech'), at = paneT.indexOf('id="techrow-writing"');
  check('科技页展开在结绳那一项上，且它是已掌握态',
    at !== -1 && /已掌握/.test(paneT.slice(at, at + 400)),
    at === -1 ? '找不到 #techrow-writing' : JSON.stringify(paneT.slice(at, at + 60)));
  check('开门后 tab 解除灰态且可以正常翻页',
    SB.ui.render.techTabOpen() === true && (SB.game.setTab('tech'), SB.game.getTab() === 'tech'));
}

/* ---------------- 顶栏读数 & 自然环境卡（用户 2026-09-26 的两条要求）----------------
 *   ① 顶栏的**存量**要带一位小数 —— 珊瑚有 0.1/次 的入口，取整显示时点十下都不动一格；
 *   ② 海底火山与天壳归到同一张「自然环境」卡（两者都是「外面现在什么样」）。
 * 两条都是**显示层**的改动，所以判据也落在显示层：读渲染出来的 HTML，不看数据。 */
console.log('\n=== 顶栏读数与自然环境卡 ===');
{
  /* ① 存量一位小数。夹具借用活的那一局 —— 假渲染层画的永远是 SB.game.run()，
   *    另开一份 freshRun 再渲染 = 测「A 状态渲染出来的 B 状态」。改完立刻还原。 */
  const s = SB.game.run();
  const bakKelp = s.res.kelp, bakCoral = s.res.coral;
  s.res.kelp = 18.04; s.res.coral = 10.36;
  SB.game.markDirty(); SB.game.render();
  const R = g('res');
  const amtOf = k => (R.match(new RegExp('data-res="' + k + '"[^>]*>([^<]*)<')) || [])[1] || '';
  check('存量带一位小数（0.1 量级的手动采集不再「点了没反应」）',
    amtOf('kelp') === '18.0' && amtOf('coral') === '10.4',
    '藻食=' + amtOf('kelp') + '　珊瑚=' + amtOf('coral'));
  check('进位正确（9.96 → 10.0，而不是 9.10）',
    SB.economy.fmtAmt(9.96) === '10.0' && SB.economy.fmtAmt(0.04) === '0.0',
    SB.economy.fmtAmt(9.96) + ' / ' + SB.economy.fmtAmt(0.04));
  check('千分位还在（一位小数不影响 2,600 这种写法）',
    SB.economy.fmtAmt(2600.44) === '2,600.4', SB.economy.fmtAmt(2600.44));
  check('上限仍是整数（只有存量带小数，成本/上限不跟着长尾巴）',
    SB.economy.fmt(2600.44) === '2,600' && /<i class="cap[^"]*">\/ [\d,]+<\/i>/.test(R),
    '格子里那半截=' + ((R.match(/<i class="cap[^"]*">[^<]*<\/i>/) || [''])[0]));
  s.res.kelp = bakKelp; s.res.coral = bakCoral;
  SB.game.markDirty(); SB.game.render();

  /* ② 同卡：判据从 index.html 的静态结构读 —— 假 DOM 的 getElementById 是平铺的，
   *    它没有父子关系，"同一张卡" 这件事只在源码里可观测。 */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const card = (html.split('<div class="card"').find(c => c.indexOf('envVolcano') >= 0) || '');
  check('自然环境卡：天壳与海底火山在同一张卡里',
    !!card && card.indexOf('自然环境') >= 0 && card.indexOf('shellTxt') >= 0 &&
    card.indexOf('shellFill') >= 0 && card.indexOf('envVolcano') >= 0, '');
  check('区块标题只挂一次（不是每张卡都加了一个标题）',
    (html.match(/class="secttl"/g) || []).length === 1,
    '共 ' + (html.match(/class="secttl"/g) || []).length + ' 处');
}

/* ---------------- 历法的信息型奖励 & 暖石开关 ----------------
 * 2026-09-26 暗流纪重排里这两件是**写了注释但没接线**的半成品：
 *   「历法」只在 techs.js 的 note 里说过「seasonMeta 掌握后才返回周期名」,
 *   「保温法」原本的 eff 只有抗寒上限, 用户规格里的「消耗暖石抵消减产」那一半没有任何代码。
 * 空效果是最难发现的债——玩家研究完一项什么都没发生, 而且没人会去查注释。
 * ⚠️ 抗寒上限随后随「御寒术」整项删除（2026-09-26 用户要求删掉规格外的东西），
 *    保温法现在**故意没有 eff**，全部兑现物是暖石开关。
 *    ⇒ 这条断言必须改成「证伪 tech 侧的抗寒」：谁要是哪天把 eff.warm 加回来，这里要红。
 * 这一节把两条线锁住。 */
console.log('\n=== 历法读数与暖石开关 ===');
{
  const s = SB.state.freshRun(false);
  s.lvl.kelp = 1;
  SB.game.markDirty(); SB.game.render();

  /* ⚠️ DOM 侧那两条断言必须在**活着的这一局**上做：假的渲染层画的永远是 SB.game.run()，
   *    拿上面那个 freshRun 的 `s` 去比对，等于测「A 状态渲染出来的 B 状态」，
   *    两边永远对不上（也永远测不到接线）。`s` 只用来测 economy.seasonMeta 这类纯函数口径。 */
  const live = SB.game.run();
  const wasCal = !!(live.techs && live.techs.calendar);

  /* ① 没掌握历法 ⇒ 读数必须**缺位**，而不是给个裸值。
   *    缺位本身就是奖励：玩家看到「看不出规律」，才知道还有一件事没解锁。
   * ⚠️ 2026-09-26 起它住在顶上那张「自然环境」卡里（与天壳同卡），不再在巢穴页 ——
   *    所以这里读的是 envVolcano（由 renderEnv 每帧填）而不是 pane-village。 */
  let sm = SB.economy.seasonMeta(s);
  check('未掌握历法：seasonMeta 标记 known=false', sm.known === false, 'known=' + sm.known);
  check('未掌握历法：面板不报季名，只说看不出规律',
    g('envVolcano').indexOf('看不出规律') !== -1, '');
  check('海底火山已离开巢穴页（它是环境读数，不是建造动作）',
    g('pane-village').indexOf('海底火山') === -1, '');

  /* ② 掌握了 ⇒ 报的是 seasonMul（实际生效值），不是 SEASONS 的裸倍率。
   *    报裸值会出现「学了历法反而看到倍率变差」，那纯属显示坑。 */
  s.techs.calendar = true;
  sm = SB.economy.seasonMeta(s);
  check('掌握历法：seasonMeta 报出季名与周期读数',
    sm.known === true && typeof sm.name === 'string' && sm.left > 0 && !!sm.next,
    JSON.stringify(sm));
  check('读数用的是实际生效倍率 seasonMul，不是 SEASONS 裸值',
    Math.abs(sm.mult - SB.economy.seasonMul(s)) < 1e-12,
    'seasonMeta=' + sm.mult + ' / seasonMul=' + SB.economy.seasonMul(s));

  /* ③ ⚠️ 面板 == 实账（2026-09-26 修掉的「面板撒谎」）。
   *    seasonMul 的第二参数原名 reliefOverride，语义是「**顶替** tech 的 relief」；
   *    而 tick 传进来的是 warmRelief(s, dt)，**没烧暖石时它返回 0（不是 null）**
   *    ⇒ `0 != null` 为真 ⇒ 历法那 0.25 被整个吞掉。
   *    症状：面板走 rates()（不传参）读得到历法、tick 走 foodRate(s, cold, 0) 读不到，
   *    实测 面板 0.196875 / 实账 0.112500，**面板撒谎 1.75 倍**，且不报错、只偏数值。
   *    ⇒ 这条不变式是这类 bug 的唯一防线：rates() 的每一项必须与 tick 同项在
   *      「不烧暖石」时逐位相等。改 seasonMul / foodRate / tick 任何一处都要看它。 */
  {
    /* 探的是季节乘区本身，不是 rates().kelp —— 后者是**净额**（已经减掉口粮消耗），
     * 拿它跟毛额比会得到「面板 -0.1875 / 实账 0.1125」这种假红。 */
    const ss = SB.state.freshRun(false);
    /* ⚠️ 同文件另一处一样的坑：旧版写死 `SEASON_TICKS * 3`（第 4 季 = 寒流季），
     * 2026-09-27 删季后 3 % 3 = 0 ⇒ 落到暖流季（mult 1.5），断言假红。按表查索引。 */
    ss.t = SB.CFG.SEASON_TICKS * SB.SEASONS.findIndex(x => x.mult < 1);   // 寒流季（减产最狠的一季）
    /* ① 没烧暖石 = tick 那条路传 0 ⇒ 必须与面板（不传参）**逐位相等**。
     *    这就是 bug 的形状：`0 != null` 为真 ⇒ tech 的 relief 被顶掉。 */
    check('暖石没烧时（tick 传 0）季节乘区与面板一致——历法不得被吞',
      Math.abs(SB.economy.seasonMul(ss, 0) - SB.economy.seasonMul(ss)) < 1e-12,
      'tick 路 ' + SB.economy.seasonMul(ss, 0).toFixed(6) +
      ' / 面板路 ' + SB.economy.seasonMul(ss).toFixed(6));
    const bare = SB.economy.season(ss.t).mult;
    check('未掌握历法：季节乘区就是裸倍率（两条路都对）',
      Math.abs(SB.economy.seasonMul(ss, 0) - bare) < 1e-12,
      'seasonMul=' + SB.economy.seasonMul(ss, 0) + ' SEASONS=' + bare);
    /* ② 掌握历法后，tick 那条路**也必须**读到收窄——旧代码正是在这一步返 0.25。 */
    ss.techs.calendar = true;
    const withTech = SB.economy.seasonMul(ss, 0);
    check('掌握历法：tick 那条路的季节乘区确实收窄了（不是只改面板读数）',
      withTech > bare + 1e-9 &&
      Math.abs(withTech - SB.economy.seasonMul(ss)) < 1e-12,
      '寒流季 ' + bare + ' → ' + withTech.toFixed(6) + '（面板同值 '
      + SB.economy.seasonMul(ss).toFixed(6) + '）');
    /* ③ 两条路是**相加**不是互斥：烧暖石要在历法的基础上再顶一层。 */
    const bothCh = SB.economy.seasonMul(ss, SB.CFG.WARM_RELIEF);
    check('暖石与历法相加而非互斥（烧暖石要在历法之上再顶一层）',
      bothCh > withTech + 1e-9 && bothCh <= 1,
      '历法 ' + withTech.toFixed(6) + ' → 历法+暖石 ' + bothCh.toFixed(6));
  }

  /* 掌握之后同一格要换成有内容的读数（换的是文案，不是换一格）。
   * 这一行只在活的那局上临时置位，测完立刻还原 —— 后面还有整局跑，别把夹具漏进去。 */
  live.techs = live.techs || {};
  live.techs.calendar = true;
  SB.game.markDirty(); SB.game.render();
  const ev = g('envVolcano');
  check('掌握历法后自然环境报出季名与周期（同一格，不再说看不出规律）',
    ev.indexOf('海底火山') !== -1 && ev.indexOf('看不出规律') === -1 &&
    ev.indexOf('×') !== -1 && /\d/.test(ev),
    '「' + ev.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64) + '」');
  check('自然环境文案不吐 undefined（读数换文案时最容易漏的分支）',
    ev.indexOf('undefined') === -1 && ev.indexOf('NaN') === -1, '');
  /* ③ 季节读数只此一处。2026-09-26 用户要求把顶栏那行读数**整行删掉**
   *    （原话：「这部分直接删掉，不是改成用海底火山活跃期代替了吗」）——
   *    ⚠️ 删一个 DOM 节点不会报错，坏法只在它哪天被加回来，所以这里钉两条：
   *    ① 静态结构里没有 `seasonLine` 这个 id（假 DOM 的 getElementById 对不存在的 id
   *       照样返回桩对象，靠渲染层测不出来，只能从 index.html 读）；
   *    ② 渲染出来的顶栏资源卡不再复述季名。
   *    族民 / 峰值 / 饿死 / 冻死不在这里查：那些读数归巢穴页与破壳结算，本就不在顶栏。 */
  const html2 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('顶栏那行季节读数已删（海底火山活跃期是唯一出处）',
    html2.indexOf('seasonLine') === -1 && g('res').indexOf('季') === -1,
    'index.html 里 seasonLine 出现 ' + (html2.match(/seasonLine/g) || []).length +
    ' 次；顶栏资源卡含「季」？' + (g('res').indexOf('季') >= 0));
  live.techs.calendar = wasCal;
  SB.game.markDirty(); SB.game.render();

  /* ③ 暖石开关：三件事——惩罚季才烧、石不够就顶不住、只顶建筑侧。 */
  const coldT = SB.state.freshRun(false);
  coldT.lvl.kelp = 10;
  coldT.techs.calendar = true;                       // 把 relief 固定在历法那一档
  coldT.res.kelp = 1e6;                              // 隔离口粮，只观察季节
  coldT.warmOn = true;
  coldT.res.warmstone = 100;
  /* 找一个惩罚季（mult < 1）。SEASONS 里只有寒流季 0.25 < 1，所以把 t 推到它头上。 */
  /* 把时间推到惩罚季的**下一季头**（seasonIdx 按 t/SEASON_TICKS 取模，取上一季的头也行，
   * 这里选下一季避免正好压在本季刚换的边界上）。 */
  const idx = SB.economy.seasonIdx(coldT.t);
  const coldIdx = SB.SEASONS.findIndex(x => x.mult < 1);
  coldT.t = (coldIdx - idx + SB.SEASONS.length) * SB.CFG.SEASON_TICKS;
  const before = coldT.res.warmstone;
  SB.economy.tick(coldT, 1, noop);
  check('惩罚季开开关：暖石真的被烧掉', coldT.res.warmstone < before,
    before + ' → ' + coldT.res.warmstone);

  /* 顶回的落点：藻场产出（建筑侧那只季节乘区）。
   * ⚠️ 不测 seasonMul——它不带这个参数，只有 foodRate 收 reliefOverride。
   *    等到「只顶建筑侧」那条断言里会再解释一次为什么必须是建筑侧。 */
  const r0 = SB.economy.foodRate(coldT, 1, 0);
  const r1 = SB.economy.foodRate(coldT, 1, SB.CFG.WARM_RELIEF);
  check('惩罚季开开关：藻场产出被顶回', r1 > r0, r0.toFixed(4) + ' → ' + r1.toFixed(4) + '/秒');
  check('开关只顶回一部分，不是全额抵消', SB.economy.seasonMul(coldT, SB.CFG.WARM_RELIEF) < 1,
    SB.economy.seasonMul(coldT, SB.CFG.WARM_RELIEF).toFixed(4));

  /* 与「职业侧不吃季节」同一条纪律：暖石不能变成全局乘区，
   * 否则寒流季的采集者跟着一起被抬高——看着像开关很划算，实际是绕过了季节设计。
   * 判据用「多雇采集者不改变顶回量」而不是抄公式：前者直接证伪后者。 */
  coldT.jobs.gather = 0;
  const d0 = SB.economy.foodRate(coldT, 1, SB.CFG.WARM_RELIEF) - SB.economy.foodRate(coldT, 1, 0);
  coldT.jobs.gather = 5;
  const d1 = SB.economy.foodRate(coldT, 1, SB.CFG.WARM_RELIEF) - SB.economy.foodRate(coldT, 1, 0);
  check('暖石只顶建筑侧：多雇采集者不改变顶回量（职业侧不吃季节）',
    Math.abs(d0 - d1) < 1e-9, 'gather=0 顶回 ' + d0.toFixed(4) + ' / gather=5 顶回 ' + d1.toFixed(4));

  /* 石够 vs 石不够，同一个 tick 的差别。
   * ⚠️ 不能写成「跑一 tick 前后比对 foodRate(…, 0)」：relief=0 那一支跟开关根本无关，
   *    前后必然逐位相等（实测 0.2250 → 0.2250），测的是空气。
   *    要看的是「开关实际顶回了多少」，所以直接问 warmRelief 这一 tick 顶回几成。 */
  coldT.jobs.gather = 0;
  coldT.warmOn = true;
  coldT.res.warmstone = 100;
  const wFull = SB.economy.warmRelief(coldT, 1);
  const rateFull = SB.economy.foodRate(coldT, 1, wFull);
  check('暖石充足：这一 tick 顶得上来', wFull > 0 && rateFull > r0,
    'warmRelief=' + wFull + ' 产出 ' + r0.toFixed(4) + ' → ' + rateFull.toFixed(4));
  check('暖石充足：burning 标记起来', SB.economy.warmBurning(coldT) === true, '');

  coldT.res.warmstone = 0.01;                        // 不够烧这一 tick 的
  const wDry = SB.economy.warmRelief(coldT, 1);
  const rateDry = SB.economy.foodRate(coldT, 1, wDry);
  check('暖石见底：这一 tick 顶不住，产出回落', wDry === 0 && rateDry < rateFull,
    '顶回 ' + wFull + ' → ' + wDry + '；产出 ' + rateFull.toFixed(4) + ' → ' + rateDry.toFixed(4));
  check('暖石见底：burning 标记落下去（不让面板骗玩家在烧）',
    SB.economy.warmBurning(coldT) === false, '');

  /* rates() 的暖石净速率必须与 warmRelief 同源。这条判据分叉的窗口很窄
   * （暖石剩不到一个 WARM_RATE 的那几秒），但症状是「面板说在烧、结算没烧」，
   * 而且只在这一个落点出现，别的数值回归碰不到它。 */
  const dryT = SB.state.freshRun(false);
  dryT.lvl.kelp = 10; dryT.res.kelp = 1e6;
  dryT.techs.calendar = true;
  dryT.jobs.miner = 1;                     // 暖石只有矿工这一条产线
  const di = SB.economy.seasonIdx(dryT.t);
  dryT.t = (coldIdx - di + SB.SEASONS.length) * SB.CFG.SEASON_TICKS;   // 推到惩罚季
  dryT.warmOn = false;
  const prod = SB.economy.rates(dryT).warmstone;
  check('暖石产出基线 > 0（伴生线是这条开关的燃料）', prod > 0, prod.toFixed(4) + '/秒');

  dryT.warmOn = true;
  dryT.res.warmstone = 0.5;                // WARM_RATE = 1：不够烧满一 tick
  const netThin = SB.economy.rates(dryT).warmstone;
  const relThin = SB.economy.warmRelief(dryT, 1);
  check('暖石剩不到一个 tick 的量：rates 与 warmRelief 都不认这口',
    Math.abs(netThin - prod) < 1e-9 && relThin === 0 && SB.economy.warmBurningNow(dryT) === false,
    'rates ' + netThin.toFixed(4) + ' / warmRelief ' + relThin + ' / 纯产出 ' + prod.toFixed(4));

  dryT.res.warmstone = 2;
  const netFull = SB.economy.rates(dryT).warmstone;
  check('暖石够烧：rates 扣掉那一口，与 warmRelief 同步',
    Math.abs(netFull - (prod - SB.CFG.WARM_RATE)) < 1e-9 && SB.economy.warmRelief(dryT, 1) > 0,
    'rates ' + netFull.toFixed(4) + ' / 期望 ' + (prod - SB.CFG.WARM_RATE).toFixed(4));

  /* 非惩罚季不烧：开关开着也不该白白扔暖石。 */
  const warmT = SB.state.freshRun(false);
  warmT.lvl.kelp = 10; warmT.res.kelp = 1e6;
  warmT.warmOn = true; warmT.res.warmstone = 100;
  const wi = SB.economy.seasonIdx(warmT.t);
  warmT.t = (SB.SEASONS.findIndex(x => x.mult >= 1) - wi + SB.SEASONS.length) % SB.SEASONS.length
    * SB.CFG.SEASON_TICKS;
  /* 非惩罚季不烧（2026-09-27 用户拍板回到季节闸）。历史：这条曾因「两轴不重合」被改判成
   * 反向对照（一开就烧）；冰封期改成寒流季随机触发后两轴重合，季节闸重新自洽 ⇒ 改回来。
   * 两层断言：暖石一粒不许少（囤货不许凭空消失）+ burning 标记不许亮（面板不许骗人）。 */
  warmT.warmOn = true;
  const st1 = warmT.res.warmstone;
  SB.economy.tick(warmT, 1, noop);
  check('非寒流季：开关拨开也不烧暖石（囤货不许凭空消失）',
    warmT.res.warmstone === st1, st1 + ' → ' + warmT.res.warmstone);
  check('非寒流季：burning 标记是落的（面板不许显示在烧）',
    SB.economy.warmBurning(warmT) === false, '');

  /* 【用户规格的正面断言：「一份暖石」同时达到两个效果】
   *    「同时」不只是时间上凑巧，它还意味着**一个 tick 只扣一份**。若将来有人给冻伤
   *    也加一次消耗（「防冻伤要多烧一倍暖石」），这条会红——而那正好会把用户的规格
   *    破坏回两个消耗口，正是这一轮要消掉的东西。
   *    ⚠️ 必须站在寒流季问：季节闸（2026-09-27）下暖流季根本不烧，站在暖流季测会
   *    假绿——量没动不是因为「只扣一次」而是因为「一口没烧」。 */
  const bothT = SB.state.freshRun(false);
  bothT.warmOn = true; bothT.res.warmstone = 100;
  const bothColdI = SB.SEASONS.findIndex(x => x.mult < 1);
  bothT.t = bothColdI * SB.CFG.SEASON_TICKS;
  const bs0 = bothT.res.warmstone;
  SB.economy.tick(bothT, 1, noop);
  check('一份暖石只扣一次：同一 tick 里减产与冻伤共用同一个消耗口',
    Math.abs((bs0 - bothT.res.warmstone) - SB.CFG.WARM_RATE) < 1e-9,
    '扣掉 ' + (bs0 - bothT.res.warmstone).toFixed(4) + '，期望 ' + SB.CFG.WARM_RATE);

  /* ⑤ 冰封期（2026-09-27 用户拍板：改成「每个寒流季随机触发、壳越薄概率越高、线性、封顶 33%」）
   * 旧形态是「壳 ≤ 25% 就恒定挨冻、且永不解除」——它让冰封期变成后期一个**永久状态**，
   * 而不是一件会发生的事。下面五条是新形态的正面证据，缺一条就可能被悄悄改回旧形态：
   *   ① 概率随壳厚线性、壳见底封顶 33%（满壳开局 = 0，不会莫名其妙挨冻）
   *   ② 挨冻与否**不再由壳厚单独决定**：壳见底但不在寒流季 ⇒ 不冻
   *   ③ 寒流季掷骰：中了整季冰封、没中就不冻
   *   ④ 季末自动解除
   * ⚠️ 掷骰必须 stub，否则这条断言自己也在掷骰子。随机源走 `SB.rng`（rollFreeze 内部读它），
   *   不是覆盖 SB.economy.rollFreeze —— 后者改不了 seasonTurn 里那次闭包内的调用。 */
  {
    const MAX = SB.CFG.FREEZE_MAX;
    const T = SB.CFG.SEASON_TICKS;
    const WARM_I = SB.SEASONS.findIndex(x => x.mult >= 1);
    const COLD_I = SB.SEASONS.findIndex(x => x.mult < 1);
    const chanceAt = (ratio) => {
      const x = SB.state.freshRun(false);
      x.shell = x.iceShell * ratio;
      return SB.economy.freezeChance(x);
    };
    check('冰封概率线性且封顶 33%：满壳 0 / 半壳 16.5% / 见底 33%',
      Math.abs(chanceAt(1)) < 1e-12 &&
      Math.abs(chanceAt(0.5) - MAX * 0.5) < 1e-12 &&
      Math.abs(chanceAt(0) - MAX) < 1e-12,
      '满壳 ' + chanceAt(1).toFixed(4) + ' / 半壳 ' + chanceAt(0.5).toFixed(4) +
      ' / 见底 ' + chanceAt(0).toFixed(4));
    check('封顶值就是用户拍的那个 33%', Math.abs(MAX - 0.33) < 1e-12, String(MAX));

    const thin = SB.state.freshRun(false);
    thin.shell = 1;                                  // 壳几乎见底
    thin.t = T * WARM_I;                             // 但还在暖流季
    SB.economy.seasonTurn(thin);
    check('壳见底但非寒流季 ⇒ 不挨冻（冰封期不再由壳厚单独决定）',
      SB.economy.isCold(thin) === false, '壳比 ' + SB.economy.rOf(thin).toFixed(6));

    /* 半壳 ⇒ p = 16.5% > 0，这时 rng 才有意义（满壳 p=0，掷什么都是不中）。 */
    const mk = (seasonI) => {
      const x = SB.state.freshRun(false);
      x.shell = x.iceShell * 0.5;
      x.t = T * seasonI;
      return x;
    };
    const hadRng = 'rng' in SB;
    SB.rng = () => 0;                                // 必中
    const hit = mk(COLD_I); SB.economy.seasonTurn(hit);
    SB.rng = () => 1;                                // 必不中
    const miss = mk(COLD_I); SB.economy.seasonTurn(miss);
    if (!hadRng) delete SB.rng;
    check('寒流季掷骰：中了整季冰封，没中就不冻',
      SB.economy.isCold(hit) === true && SB.economy.isCold(miss) === false,
      '中 ' + SB.economy.isCold(hit) + ' / 不中 ' + SB.economy.isCold(miss));

    SB.rng = () => 0;
    const carried = mk(COLD_I);
    SB.economy.seasonTurn(carried);
    const wasCold = SB.economy.isCold(carried);
    carried.t = T * WARM_I;                          // 换季到暖流季
    SB.economy.seasonTurn(carried);
    if (!hadRng) delete SB.rng;
    check('季末自动解除：换到非寒流季就不再冰封（旧形态是永不解除）',
      wasCold === true && SB.economy.isCold(carried) === false, '换季前 ' + wasCold);

    check('季节表三季且已无浊流季', SB.SEASONS.length === 3 &&
      !SB.SEASONS.some(x => x.name === '浊流季'), SB.SEASONS.map(x => x.name).join(' / '));
  }

  /* ④ UI 接线：按钮真的渲染出来，点了真的改状态。 */
  /* ⚠️ 这里必须用 SB.game.run() 而不是另开一份 freshRun：render 画的是**线上那一份**，
   *    拿另一份去渲染，等于测了「A 状态渲染出来的 B 状态」，永远测不到接线。 */
  const ui = SB.game.run();
  ui.techs.thermal = true; ui.res.warmstone = 5;
  SB.game.markDirty(); SB.game.render();
  /* ⚠️ 开关 2026-09-27 从巢穴页搬到了「自然环境」卡的 #envWarm（用户要求）：
   *    它只在寒流季生效，而寒流季是海底火山那条周期的一部分 —— 摆在建造成那一堆里，
   *    玩家是在「我要造什么」的语境下去找它，恰好是永远用不上它的语境。
   *    两条断言都得跟着走：一条钉它在哪、一条钉它不在别处（防止又出现两份）。 */
  check('保温法已掌握：开关出现在「自然环境」卡的 #envWarm',
    g('envWarm').indexOf('data-warm="1"') !== -1, '');
  check('开关已从巢穴页搬走（不在出现两份）',
    g('pane-village').indexOf('data-warm="1"') === -1, '');
  /* ⚠️ 搬容器带来一个真实风险，必须钉住：#envWarm 是每帧刷新的容器，
   *    input.js 是 document 级委托 ⇒ 按钮元素若被逐帧换掉，「按下与抬起之间元素被换掉」
   *    的那次点击会整个丢失（开关点了没反应，而且不报任何错）。
   *    renderWarm 用「状态签名」节流规避：签名 = 开/关 × 寒流季/非 × 正在烧/否，
   *    签名不变就一个 DOM 节点都不写。**库存数字故意不进签名**（烧起来时每秒变 10 次），
   *    改走独立 span 的 textContent。
   *    ⇒ 这条断言盯的就是「库存变了但 HTML 逐字节没变」——把库存并回签名会让它红，
   *      而那正好会把点击丢失这个 bug 放回来。 */
  const warmBox = doc.getElementById('envWarm');
  const html0 = warmBox._html;
  ui.res.warmstone = 4;                        // 还够烧（≥ WARM_RATE），签名里的「正在烧」不变
  /* ⚠️ 这里必须先 markDirty：SB.game.render() 是**脏标记门控**的
   *    （game.js:126 `if (dirty)`）。上一次 render 已经把 dirty 清了，直接调
   *    `render()` 会整帧压根不跑 —— 量没刷上去是测试的锅，不是节流的锅。
   *    真实游戏里开关每帧都被 renderTick 无脑刷新，不受 dirty 影响。 */
  SB.game.markDirty(); SB.game.render();
  check('库存数字在动时按钮不被重建（签名节流，防点击丢失）',
    warmBox._html === html0, warmBox._html === html0 ? '' : 'HTML 被重写了');
  check('但库存数字确实刷上了（节流没把读数冻住）',
    (doc.getElementById('envWarmWs').textContent === 4 ||
     doc.getElementById('envWarmWs').textContent === '4'),
    'envWarmWs=' + doc.getElementById('envWarmWs').textContent +
    ' ui.warmstone=' + ui.res.warmstone);
  /* 「一份暖石办两件事」是用户 2026-09-26 的规格落点，也是这一版最容易在文案重构里
   * 被顺手改掉的一句话——它没有数据流，删了不会红任何断言，只会悄悄退回「只顶减产」。 */
  /* 2026-09-27 用户拍板改回季节闸后，文案落点换成「只在寒流季生效」——
   * 「一份暖石两件事」仍在（同一季内顶减产 + 压冻伤），但宣传语必须说清季节能闸，
   * 否则玩家在暖流季看到开关烧不起来会以为坏了。 */
  check('面板讲清「只在寒流季生效」（季节闸必须让玩家看得见）',
    g('envWarm').indexOf('只在寒流季生效') !== -1, '');
  check('面板保留「一份暖石两件事」（同季内顶减产 + 压冻伤的规格落点）',
    g('envWarm').indexOf('一份暖石两件事') !== -1, '');
  check('不再宣传不分季节的旧口径「一份暖石办两件事」',
    g('envWarm').indexOf('一份暖石办两件事') === -1, '');
  const on = ui.warmOn;
  fire({ dataset: { warm: '1' } });
  check('点开关：状态真的翻转', ui.warmOn !== on, 'warmOn=' + ui.warmOn);

  /* ④ 树真的是「文明 6 那种」几何，不是列表换皮。
   * ⚠️ 用户 2026-09-26 连续两次纠正同一件事：先做成了带「第 N 层」标题的竖排分桶列表
   *    （列表里层一和层二读起来是上下并列，看不出先后），驳回；再做成横卷。
   *    两次的共同根因都是**形状只活在注释里、代码里没有可观测的形状**。所以这里不测
   *    文案（文案改一个字这条就红，但形状没变），去测 HTML 里的几何三元组
   *    `data-layer / data-x / data-y` —— 列 = 层 = 推进方向，行 = 排版的产物。 */
  /* ⚠️ 揭示记在 s.eureka 上，不是 s.techs —— 写错落点不会报错，只会让这一行看起来
   *    什么都没发生（那一项依旧不渲染，断言接着红在奇怪的地方）。 */
  /* 多揭示一个「有前置方」的节点：结绳→学者的那条边只有两端都揭示才画，
   * 只揭示结绳的话边数是 0，「连线一条不少」这条断言就退化成恒真、测不到东西。 */
  ui.eureka = ui.eureka || {}; ui.eureka.calendar = true; ui.eureka.scholarT = true;
  SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();
  const pt = g('pane-tech');
  const pos = id => pt.indexOf('data-node="' + id + '"');
  /* 从最终 HTML 里抓节点几何。同一个 id 在本该只画一次的长卷里出现了两次，
   * 八成是有人在每张纪元卡片里又嵌了一份树 —— 下面那条断言会揪出来。 */
  const nodes = [];
  const nRe = /data-node="([a-zA-Z]+)"\s+data-x="(\d+)"\s+data-y="(\d+)"\s+data-layer="(\d+)"/g;
  let nm;
  while ((nm = nRe.exec(pt))) {
    nodes.push({ id: nm[1], x: +nm[2], y: +nm[3], layer: +nm[4] });
  }

  check('长卷只画一份：每个节点在 HTML 里恰好出现一次',
    nodes.length > 0 && new Set(nodes.map(n => n.id)).size === nodes.length,
    nodes.length + ' 个节点，去重后 ' + new Set(nodes.map(n => n.id)).size + ' 个');

  const cnv = pt.match(/class="techcanvas"\s+style="width:(\d+)px;height:(\d+)px"/);
  check('画布比视口宽（横向滚动看后面的纪元）',
    !!cnv && +cnv[1] > 640,
    cnv ? cnv[1] + '×' + cnv[2] + ' px' : '（没找到 techcanvas）');

  /* 滚动容器必须带 id：renderPanes 整块重写 pane 的 innerHTML 会把容器元素换掉，
   * 而横向位置只存在 DOM 元素上 ⇒ 它在重写前后靠这个 id 把 scrollLeft 接回去。
   * ⚠️ 这条是**契约断言**（id 名是两个文件的接头处）。它测不出「接回去」这个行为本身
   *    —— 假 DOM 的 getElementById 永远返回同一个桩对象，scrollLeft 当然不会变，
   *    写成行为断言就成了恒真。真正的验证在真实浏览器里做（换个 id 不会报错，
   *    只会让「滑到一半被拽回最左边」静默复发，所以至少要钉住这个接头）。 */
  check('长卷滚动容器带 id（renderPanes 靠它接回横向位置）',
    /<div class="techscroll"[^>]*id="techScroll"/.test(pt),
    'techscroll 在 pane-tech 的第 ' + pt.indexOf('techscroll') + ' 字符处');

  const G = SB.tech.geo;
  const byId2 = id => nodes.find(n => n.id === id);

  /* ⚠️ 节点卡片高必须装得下「名字 / 效果（最多两行）/ 尤里卡条件 / 进度条 / 研究按钮」。
   *    76px 那版装不下：`.technode` 是 flex 列 + overflow:hidden，内容超高时默认的
   *    flex-shrink:1 不会「溢出可见」，而是把效果行与条件行**压扁** —— 字被拦腰截断，
   *    就是用户 2026-09-26 报的「这里显示不全」。
   *    102 这个下限是真实浏览器量出来的（headless Chrome 逐张 height:auto 读 offsetHeight，
   *    最挤的一张是「书写」：两行效果 + 进度条 = 102px）。把 H 调小，这条立刻红。 */
  const CARD_NEED = 102;
  check('节点卡片高装得下四行 + 进度条（不够会把效果行/条件行压扁 ⇒「显示不全」）',
    G.H >= CARD_NEED, 'H=' + G.H + '，真实浏览器实测最挤 ' + CARD_NEED + 'px');

  /* 契约断言：卡片子项的 flex-shrink 必须关掉。只把 H 改大不够 —— 哪天有人再把
   * shrink 打开，超高内容又会退化回「压扁」，而那时 H 看着完全正常。 */
  const cssTxt = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
  check('卡片子项禁止 flex 压缩（超高内容只会顶出框，不会被压成半截字）',
    /\.technode>\*\{[^}]*flex:none/.test(cssTxt),
    'css/main.css 里 .technode>*{flex:none} 的第 ' + cssTxt.indexOf('.technode>*') + ' 字符处');

  /* ⚠️ 长卷最左边**不许有死区**。x = PADX + col×列距，而 col 由 1 起点的 layer 换算而来：
   *    少减那个 1，首列就落在 col 1 ⇒ x = 46 + 250 = 296。手机内容宽约 334px，
   *    于是整个首屏都落在死区里，一进「科技」只看得见纪元标题那条线、看不到任何节点
   *    —— 用户 2026-09-26 报的「科技树太靠右了，一开始根本看不到」就是它。
   *    这里比的是**几何真值**（layout 的全部格子），不是「渲染出来的节点」：
   *    后者取决于谁已揭示，结绳恰好是第 0 列时这条断言会退化。 */
  const allX = Object.keys(SB.tech.layout().cells).map(k => SB.tech.layout().cells[k].x);
  check('首列贴在左边界上（长卷左边没有死区，手机上开面板就能看见第一个节点）',
    Math.min.apply(null, allX) === G.PADX,
    '最左列 x=' + Math.min.apply(null, allX) + '，PADX=' + G.PADX);

  /* 列 = 层。结绳层一在最左、历法层二在它右边 —— 这正是「不是并排」的判据：
   * 并列的话两项 x 相同（同一行），树里它们的 x 必须差整整一个列距。 */
  const wr = byId2('writing'), ca = byId2('calendar');
  check('列 = 层：结绳在最左列、历法往右一列（不是上下并列）',
    !!wr && !!ca && wr.layer === 1 && ca.layer === 2 &&
    wr.x < ca.x && ca.x - wr.x >= G.W,
    'writing L' + (wr && wr.layer) + '@x' + (wr && wr.x) +
    '　calendar L' + (ca && ca.layer) + '@x' + (ca && ca.x) + '　列距=' + G.W);

  /* 同列不许撞行。撞了会两块卡片叠在一起，树看着像坏了，而数据完全看不出来。 */
  const colRows = {};
  nodes.forEach(n => { (colRows[n.layer] = colRows[n.layer] || []).push(n.y); });
  let clash = 0;
  for (const k in colRows) if (new Set(colRows[k]).size !== colRows[k].length) clash++;
  check('同列不撞行（叠加的卡片在数据层完全看不出来）',
    clash === 0, clash + ' 列存在重叠行');

  /* ⚠️ 列倒流：这是横卷独有的、肉眼看不出来的坏法。
   *    边的方向是「前置在左、本项在右」，而左/右由**列号**决定。若某项 layer 比它
   *    同纪元前置的 layer 还小或相等，那根连线就会从右往左画 —— 树看起来像被谁
   *    打了结，但数据、渲染、日志全都正常，唯一的表现是「有几根线很怪」。
   *    列号是**手写在 techs.js 里的**（不是算出来的），改一个节点的层很容易漏掉它的
   *    前置还没到那列，所以这条必须钉住。跨纪元不看：纪元基准是累加的，天然有序。 */
  const layerOf = id => {
    const c = SB.tech.layout().cells[id];
    return c ? c.layer : null;
  };
  const backflow = [];
  (SB.TECHS || []).forEach(t => {
    if (!t.reqs || !t.reqs.length) return;
    const mine = layerOf(t.id);
    if (mine == null) return;
    t.reqs.forEach(r => {
      const p = SB.TECHS.filter(x => x.id === r)[0];
      if (!p || p.era !== t.era) return;
      const pl = layerOf(r);
      if (pl != null && pl >= mine) {
        backflow.push(t.id + '(L' + mine + ') ← ' + r + '(L' + pl + ')');
      }
    });
  });
  check('列号随依赖递增（没有从右往左倒着画的连线）',
    backflow.length === 0,
    backflow.length ? backflow.join('、') : '（各前置都在左侧）');

  /* 连线是树的核心可读性：有节点无连线 = 玩家看不出谁要求谁。
   * ⚠️ 不能只测「path > 0」—— 把树画成五个孤立方块也能过，那就等于没测。
   *    两端都可见才画，所以期望条数要按「两端都可见的 reqs 对数」算一遍再比。
   *    可见性判据必须和 render.visOf 逐字一致，否则这里测的是另一套规则。 */
  const eraNow = ui.era || 1;
  /* 可见性判据必须与 render.visOf **逐字一致**（见上方注释）。2026-09-26 把 visOf 改成
   * `t.era <= era`（当前与过去纪元的节点全部上图，未达成尤里卡的画成「未揭露的科技」），
   * 这里同步成同一条规则，否则会按旧的「只画已揭示的」算出 want=1，而 render 画了 7 条线。 */
  const vis = id => {
    const t = SB.tech.byId ? SB.tech.byId(id) : null;
    if (!t) return false;
    return t.era <= eraNow;
  };
  let want = 0;
  (SB.tech.layout().edges || []).forEach(e => { if (vis(e.from) && vis(e.to)) want++; });
  const paths = (pt.match(/<path class="tel/g) || []).length;
  check('前置连线一条不少（SVG path 数 = 两端均可见的 reqs 对数）',
    want > 0 && paths === want,
    'SVG path=' + paths + '　期望=' + want +
    '（已揭示节点 ' + nodes.length + '）');

  /* ══ 两态渲染契约（用户 2026-09-26 截图：未达成尤里卡却已亮出名称/效果/按钮，不对）══
   * 用一个**受控的小状态**驱动渲染，不依赖上面那局乱糟糟的进度：
   *   纪元一、清空科技与台账、建 5 座藻场 ⇒ 结绳的尤里卡达成（免费项揭示即掌握），
   *   其余纪元一节点尚未达成尤里卡 ⇒ 走「未揭露」暗态。
   * 判据：
   *   · 亮态（结绳）：亮出真名 + 效果，**不**出现「未揭露的科技」、**不**出现尤里卡进度；
   *   · 暗态（任一未达成尤里卡的纪元一节点）：标题写「未揭露的科技」、保留尤里卡条件、
   *     研究按钮灰且 title 点名「尤里卡未达成」。
   * 用 data-lit 与 data-node 把每个节点切块，避免「整页 HTML 里有没有某词」这种会误判的断言。 */
  {
    const _era = ui.era, _techs = ui.techs, _met = ui.eurekaMet, _eur = ui.eureka,
          _kelp = ui.lvl.kelp, _peak = ui.peak, _pop = ui.pop, _panelOpen = ui.techPopup;
    ui.era = 1; ui.techs = {}; ui.eurekaMet = {}; ui.eureka = {};
    ui.lvl.kelp = 5; ui.peak = Math.max(ui.peak, 5); ui.pop = Math.max(ui.pop, 5);
    SB.tech.discover(ui); SB.tech.settleFree(ui);
    SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();
    const html = g('pane-tech');
    /* 按节点切块：每个节点 div 带 id="techrow-<id>"。 */
    const nb = {};
    const nre = /id="techrow-([a-zA-Z]+)"([\s\S]*?)(?=id="techrow-|$)/g;
    let nx; while ((nx = nre.exec(html))) nb[nx[1]] = nx[2];
    const litId = 'writing';                       // 上面强制达成尤里卡并掌握
    let darkId = null;
    for (const t of SB.TECHS) if (t.era === 1 && !SB.tech.metOf(ui, t)) { darkId = t.id; break; }

    check('亮态：达成过尤里卡的节点亮出真名（结绳）',
      !!nb[litId] && nb[litId].indexOf('>结绳<') >= 0,
      'writing 块含真名=' + (nb[litId] ? nb[litId].indexOf('>结绳<') >= 0 : '无此块'));
    check('亮态：不再显示「未揭露的科技」字样',
      !!nb[litId] && nb[litId].indexOf('未揭露的科技') === -1, '');
    check('亮态：不再显示尤里卡进度行',
      !!nb[litId] && nb[litId].indexOf('尤里卡') === -1, '');
    check('暗态：未达成尤里卡的节点写「未揭露的科技」',
      !!darkId && !!nb[darkId] && nb[darkId].indexOf('未揭露的科技') >= 0,
      darkId ? ('暗态节点=' + darkId) : '（没有未达成尤里卡的纪元一节点）');
    check('暗态：保留尤里卡条件文案',
      !!darkId && !!nb[darkId] && nb[darkId].indexOf('尤里卡') >= 0, '');
    check('暗态：研究按钮灰且 title 说明不能研究（门禁生效）',
      !!darkId && !!nb[darkId] &&
      new RegExp('data-tech="' + darkId + '"[^>]*disabled').test(nb[darkId]) &&
      /尤里卡未达成|尚未揭示/.test(nb[darkId]), '');

    /* 不变式：每个上屏节点的 data-lit 必须 === metOf（亮没亮与能不能研究同源）。
     * 这条把 data-lit 从「没人读的装饰字段」变成有读者的契约：哪天有人把渲染的亮/暗
     * 判据从 metOf 换成别的（或漏改一处），这里立刻红，而不是等玩家发现「写着未揭露却能点」。 */
    let litMismatch = 0;
    for (const t of SB.TECHS) {
      if (t.era > (ui.era || 1)) continue;
      if (!nb[t.id]) continue;                       // 未上图的（未来纪元）不管
      const domLit = (nb[t.id].match(/data-lit="(\d)"/) || [])[1];
      const want = SB.tech.metOf(ui, t) ? '1' : '0';
      if (domLit !== want) litMismatch++;
    }
    check('不变式：每个上屏节点的 data-lit 与 metOf 逐项一致（渲染与门禁同源）',
      litMismatch === 0, litMismatch + ' 项不一致');

    /* 还原，避免影响后面纪元导航那节的渲染。 */
    ui.era = _era; ui.techs = _techs; ui.eurekaMet = _met; ui.eureka = _eur;
    ui.lvl.kelp = _kelp; ui.peak = _peak; ui.pop = _pop; ui.techPopup = _panelOpen;
    SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();
  }

  /* ⑤ 抗寒上限删干净了，但不能留下「加法读 undefined」。
   * ⚠️ tech.js 的乘区表里没了 `warm`，economy.warmCap 若还写着 `+ T.warm`，那一项就是
   *    undefined；`数字 + undefined = NaN` **不抛错也不报警**，只顺着 FREEZE_CHANCE
   *    烂掉整条结算链。排查时会误判成「设计上那道墙」。这里三连问：不该有、不是 NaN、
   *    建筑侧还在。 */
  const thermalDef = SB.TECHS.filter(t => t.id === 'thermal')[0];
  check('保温法不再给抗寒上限（规格外的东西，删掉就别加回来）',
    !thermalDef.eff || !('warm' in thermalDef.eff),
    'eff=' + JSON.stringify(thermalDef.eff || {}));
  const wc = SB.economy.warmCap(ui);
  check('warmCap 不是 NaN（删键之后最典型的静默断链）',
    typeof wc === 'number' && !isNaN(wc), 'warmCap=' + wc);
  /* 【2026-09-26：冻伤减免换轴，从「建筑等级 lvl.hearth」→「暖石在不在烧」】
   * ⚠️ 断言必须钉住**新**的供给口，不能只测「不是 NaN」——否则把 warmCap 改回读一个
   *    不存在的键，这条仍然全绿，机制已经静默失效（本作这类断链已有前科，见 MEMORY）。
   * ⚠️ 2026-09-27 季节闸：warmCap 跟着 warmBurningNow 走 ⇒ 只在寒流季非零。
   *    必须把 t 推进寒流季再问，站在暖流季这三条会**假绿**（恒 0 不是「关了」是「季不对」）。
   *    问完把 t 还原，别污染后面纪元导航那节的渲染。 */
  const wcColdI = SB.SEASONS.findIndex(x => x.mult < 1);
  const _wcT = ui.t;
  ui.t = wcColdI * SB.CFG.SEASON_TICKS;
  ui.warmOn = true; ui.res.warmstone = 50;
  check('冻伤减免改由暖石供给：开关拨开且石够（寒流季）⇒ warmCap 顶到上限',
    SB.economy.warmCap(ui) === SB.CFG.WARM_FREEZE_CAP, 'warmCap=' + SB.economy.warmCap(ui));
  ui.warmOn = false;
  check('开关拨回「关」⇒ warmCap 落回 0（冻伤照常，不给白嫖的减免）',
    SB.economy.warmCap(ui) === 0, 'warmCap=' + SB.economy.warmCap(ui));
  ui.warmOn = true; ui.res.warmstone = 0;
  check('开关开着但石不够 ⇒ warmCap 仍是 0（减免跟着消耗走，不是跟着开关走）',
    SB.economy.warmCap(ui) === 0, 'warmCap=' + SB.economy.warmCap(ui));
  ui.t = _wcT;
  ui.warmOn = true; ui.res.warmstone = 50;
  check('非寒流季：开关开着、石也够，warmCap 仍是 0（季节闸管住减免的另一半）',
    SB.economy.warmCap(ui) === 0, 'warmCap=' + SB.economy.warmCap(ui));

  /* ⑥ 保温法现在没有 eff，面板不能只回一句「（无直接效果）」。
   *    它的兑现物是暖石开关——一个玩家动作，不是一条数值，不给解释玩家看不懂学它干什么。
   * ⚠️ 科技面板从来不渲染 note（render.js 里 .note 零命中），所以这一行是全靠
   *    effectText 退路才出现在面板上的，改动 techRow 时别把它一起删了。 */
  ui.eureka.thermal = true;
  SB.game.markDirty(); SB.game.render();
  const trow = (g('pane-tech').match(/id="techrow-thermal"[\s\S]*?<\/div><\/div>/) || [''])[0];
  check('保温法那行说清了是暖石开关，不是「（无直接效果）」',
    trow.indexOf('（无直接效果）') === -1 && trow.indexOf('暖石') !== -1,
    '「' + trow.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) + '」');

  /* ⑦ 科技泵「没变东西就不置脏」—— 长卷横向位置与按钮点击的命门。
   * ⚠️ 泵过去无条件 markDirty()，而它按**逻辑秒**每 2 秒跑一趟（10× 速下 = 0.2 秒），
   *    于是「整块重建五个 pane（含 33 个节点的长卷）」成了每 0.2–2 秒一次的常态：
   *    长卷 scrollLeft 被冲掉（用户报的「被拉回最左边」），pane 里的按钮还会经历
   *    「按下与抬起之间被换掉」⇒ 那一次点击整个丢失。
   * 判据用 **DOM 哨兵**：脏标记会让 render() 整块重写 pane，哨兵就会消失。
   * ⚠️ 夹具必须是**确定无事可做的状态**，否则泵里真揭示一项、这条就误报：
   *    于是拿一份「全部科技已掌握 + 已在最后一个纪元」的克隆去跑 —— 没有可揭示的、
   *    也没有下一纪元可推进（advanceEra 在最后一纪元直接返回 0）。 */
  const settled = SB.game.snapshot(ui);
  settled.techs = {};
  SB.TECHS.forEach(t => { settled.techs[t.id] = true; });
  settled.era = (SB.ERAS || []).length;
  settled.eureka = Object.assign({}, settled.eureka);
  settled.techPopup = true;      // 否则开门弹窗会在回调里 markDirty，这条断言就测到别的东西上
  SB.game.pumpTech(settled, null);   // 幂等：先把可能的揭示跑完
  SB.game.render();
  doc.getElementById('pane-village').innerHTML = '<span id="SENT"></span>';
  const sentEra = settled.era;
  SB.game.pumpTech(settled, null);   // 这一趟应当什么都不改 ⇒ 不该置脏
  SB.game.render();
  check('科技泵没有新揭示 / 不推进时不置脏（否则每 0.2 秒重画一次长卷）',
    g('pane-village').indexOf('SENT') !== -1,
    '哨兵' + (g('pane-village').indexOf('SENT') !== -1 ? '还在' : '被重画冲掉') +
    '；era ' + sentEra + '（末纪元，无可推进）');

  /* ⑧ 纪元导航：文本搬进长卷标题 + 一排按钮跳转（用户 2026-09-26 的第三次返工）。
   * 原状是「当前纪元横幅 + 五张竖排纪元卡片 + 长卷」，五张卡各约 130px ——
   * 手机上要先滑过一整屏才够到树。用户的原话：
   *   「这部分文本内容能不能放在科技树标题这里，然后在这里设计几个按钮，
   *     点一下就自动跳转到该纪元的科技树」。
   * ⚠️ 这一节盯的是**条数与位置**，不是文案：五张卡展开的版本和正确版本长得
   *    一模一样（都是 .eracard），改一个字就红的那类断言在这里测不到东西。 */
  const eraSaved = ui.era;
  ui.era = 2;                        // 造一个「已有已过去的纪元」的视图，否则跳转无从谈起
  SB.game.setTab('tech'); SB.game.markDirty(); SB.game.render();

  /* 页签高亮与 pane 必须是**同一份状态**。原来高亮只写在 tab 的 onclick 里，于是
   * 任何走 setTab 的路径（最典型：开门弹窗里那句「去看看」）都只换 pane、不换高亮 ——
   * 页签写着「巢穴」、底下画着科技。
   * ⚠️ 这条只能靠「按选择器记忆化」的假 DOM 测（见 makeDoc 的注释）：每次发一批新桩
   *    的话，改 class 不会有后效，断言就成了恒真。 */
  const onTabs = doc.querySelectorAll('.tab').filter(t => t._classes.has('on')).map(t => t.dataset.tab);
  check('页签高亮跟着 setTab 走（不是只换 pane）',
    onTabs.length === 1 && onTabs[0] === SB.game.getTab(),
    '高亮的页签=' + (onTabs.join(',') || '（无）') + '，当前 pane=' + SB.game.getTab());

  const pt3 = g('pane-tech');
  const eraBtns = (pt3.match(/data-era="(\d+)"/g) || []).map(x => +x.match(/\d+/)[0]);

  check('五个纪元按钮都在，顺序照 ERAS 走',
    (SB.ERAS || []).length > 0 && eraBtns.join() === (SB.ERAS || []).map((e, i) => i + 1).join(),
    'data-era=' + eraBtns.join(','));

  let btnOk = true; const btnBad = [];
  (SB.ERAS || []).forEach((er, i) => {
    const blk = (pt3.match(new RegExp('<button[^>]*data-era="' + (i + 1) + '"[\\s\\S]*?</button>')) || [''])[0];
    if (blk.indexOf(er.name) === -1) { btnOk = false; btnBad.push((i + 1) + '缺「' + er.name + '」'); }
  });
  check('每个按钮带的是该纪元自己的名字（按钮 = 这张图的目录）',
    btnOk, btnOk ? (SB.ERAS || []).length + ' 个按钮逐个对上了名字' : btnBad.join('、'));

  /* ⚠️ 只能靠条数钉住：五张卡全展开是这次要消灭的东西，而它的 HTML 与正确版本
   *    完全同构（都是 .eracard），没有别的可观测差别。
   *    id=eraDetail 是给这条断言（以及日后的探针）留的抓手 —— 谁都能再写一个
   *    「详情卡」出来，但只有带这个 id 的那张才是这一张。 */
  const cardN = (pt3.match(/class="eracard/g) || []).length;
  const detailN = (pt3.match(/id="eraDetail"/g) || []).length;
  check('纪元详情只出选中那一个（五张全展开正是这次要消灭的）',
    cardN === 1 && detailN === 1, cardN + ' 张详情卡 / ' + detailN + ' 个 eraDetail 锚点');

  /* 未选中的纪元只留按钮：拿**纪元五**的描述来试 —— 不能用「下一个纪元」的描述，
   * 它本来就该出现在当前纪元的 teaser 里（那是对的信息，不是漏出来的）。 */
  const e5 = (SB.ERAS || [])[4];
  check('未选中的纪元的描述不出现在页面上（文本没有被复制成五份）',
    !e5 || pt3.indexOf(e5.desc) === -1,
    e5 ? (pt3.indexOf(e5.desc) === -1 ? '纪元五的描述只在点开它时才出现' : '纪元五的描述漏在页面上了') : '（没有纪元五）');

  /* 锚点是**几何真值**：纪元一必须 = 0（点它 = 回到开面板时的位置，与「长卷左边没有
   * 死区」是同一条边距），往后严格递增。写成「滚过去的数变大了」是恒真的，测不出跳对没有。 */
  const ancX = e => SB.tech.eraAnchorX(e);
  const nE = (SB.ERAS || []).length;
  let inc = ancX(1) === 0;
  for (let e = 2; e <= nE; e++) if (!(ancX(e) > ancX(e - 1))) inc = false;
  check('纪元锚点：纪元一 = 0、往后严格递增（跳转目标不是拍出来的）',
    inc, Array.from({ length: nE }, (_, i) => (i + 1) + '→' + ancX(i + 1)).join(' '));

  /* 行为断言：按钮真把长卷滚过去。假 DOM 里 getElementById 是按 id 记忆化的，
   * 所以那个桩元素的 scrollLeft 能跨重画留存 —— 正好用来验「写下去了没有」。
   * ⚠️ 先塞一个脏初值 777：否则「跳回纪元一」写出 0 与「根本没写」在读数上一样，
   *    而这两件事差一个 bug（`if (techScrollLeft)` 会把 0 当成「没什么可写的」跳过去，
   *    玩家点纪元一会发现树纹丝不动）。 */
  const tbox = doc.getElementById('techScroll');
  tbox.scrollLeft = 777;
  fire({ dataset: { era: '2' } });
  const jump2 = tbox.scrollLeft;
  fire({ dataset: { era: '1' } });
  const jump1 = tbox.scrollLeft;
  check('点纪元按钮真的把长卷滚过去（纪元一 = 写回 0，不是「不写」）',
    jump2 === ancX(2) && jump1 === 0,
    '纪元二 → ' + jump2 + '（锚点 ' + ancX(2) + '）　纪元一 → ' + jump1 + '（脏初值 777）');

  const pt4 = g('pane-tech');
  const e1 = (SB.ERAS || [])[0], e2 = (SB.ERAS || [])[1];
  check('选中项真的换了：按钮高亮 + 详情卡改念纪元一的描述，纪元二的描述退场',
    /class="erabtn on[^"]*" data-era="1"/.test(pt4) &&
    pt4.indexOf('<div class="edesc">' + e1.desc) !== -1 &&
    pt4.indexOf(e2.desc) === -1,
    '纪元一描述上屏？' + (pt4.indexOf(e1.desc) !== -1) +
    '　纪元二描述还在？' + (pt4.indexOf(e2.desc) !== -1));

  /* ── 长卷拖动 ────────────────────────────────────────────────────
   * 手机上手指滑是原生滚动（有惯性、能回弹，不该接管），**桌面鼠标按住左键拖是拖不动的**
   * ——浏览器里 overflow-x:auto 只认滚轮 / shift+滚轮 / 触屏。这条就是补桌面那一截。
   * ⚠️ 监听只能挂在 document 上做委托：挂在 .techscroll 上会随着每次重画一起失效，
   *    而「失效」是不报错的静默行为（拖了没反应，别的都正常），所以先断言监听在。 */
  const tbox2 = doc.getElementById('techScroll');
  tbox2.closest = sel => (sel === '.techscroll' ? tbox2 : null);
  const ptr = (type, x, kind) => {
    for (const fn of (doc._ev[type] || [])) {
      fn({ pointerType: kind || 'mouse', button: 0, clientX: x, target: tbox2, preventDefault() {} });
    }
  };
  const drag = (from, to, kind) => {
    ptr('pointerdown', from, kind);
    ptr('pointermove', to, kind);
    ptr('pointerup', to, kind);
  };

  check('长卷的指针拖拽挂在 document 上做委托（挂在容器上会随每次重画一起失效）',
    (doc._ev['pointerdown'] || []).length > 0 && (doc._ev['pointermove'] || []).length > 0,
    'pointerdown / pointermove 监听 ' + (doc._ev['pointerdown'] || []).length + ' / ' +
    (doc._ev['pointermove'] || []).length + ' 个');

  tbox2.scrollLeft = 600;
  drag(1000, 880);                                   // 往左拖 120px ⇒ 内容右移，scrollLeft +120
  check('鼠标按住往左拖 120px，长卷跟着走 +120',
    tbox2.scrollLeft === 720, 'scrollLeft=' + tbox2.scrollLeft);

  tbox2.scrollLeft = 600;
  drag(1000, 997);                                   // 只动 3px < 阈值
  check('位移不足阈值（3px）不算拖动 —— 否则「按在节点上想点它」会被判成拖',
    tbox2.scrollLeft === 600, 'scrollLeft=' + tbox2.scrollLeft);

  tbox2.scrollLeft = 600;
  drag(1000, 700, 'touch');
  check('触屏（pointerType=touch）不接管：原生滚动的惯性和回弹比手写的好',
    tbox2.scrollLeft === 600, 'scrollLeft=' + tbox2.scrollLeft);

  /* 拖完松手浏览器还会补一个 click，落在起点元素上 —— 必须被吞掉，
   * 否则「拖一把」等于「点了那个节点」（最典型的就是误触研究按钮）。 */
  const kelpA = SB.game.run().res.kelp;
  drag(1000, 880);
  fire({ dataset: { gather: 'kelp' } });
  check('拖完松手补发的那一次 click 被吞掉（拖动不被当成点节点）',
    SB.game.run().res.kelp === kelpA, 'kelp ' + kelpA + ' → ' + SB.game.run().res.kelp);

  const kelpB = SB.game.run().res.kelp;
  fire({ dataset: { gather: 'kelp' } });
  check('抑制标志没有残留：下一次真实点击照常生效',
    SB.game.run().res.kelp > kelpB, 'kelp ' + kelpB + ' → ' + SB.game.run().res.kelp);

  ui.era = eraSaved;
  SB.game.markDirty(); SB.game.render();
}

/* ---------------- 工坊：青铜工具 ---------------- *
 * 这一节存在唯一理由：**工具接错落点不会报错，只会静默无效**。
 * 三件都写同一个 target 也一样绿：玩家买了斧头，石头莫名其妙跟着涨 —— 这正是
 * 2026-09-27 用户纠正的那条（「斧子也是单独的采珊瑚加成，镐是单独的采矿/采石」）。
 * 所以既要断言乘区数字，也要断言**真的落到产出**上（economy.rates）。
 * 放在倒数第二节：它会改本局状态，避免影响前面的小节。 */
console.log('\n=== 工坊：青铜工具 ===');
{
  const w = SB.workshop, T = SB.TOOLS, wt = SB.game.run();

  /* ⚠️ 2026-09-28 纪元二重排：铁质三件加入 ⇒ 6 件。
   *    ⚠️ 这里**不能**只把 3 改成 6 就完事 —— 青铜三件与铁质三件的 `need` 是不同的，
   *       而 `need` 在 workshop.blocked 读它之前**完全没人读**（死字段）。
   *       ⇒ 数量对了不代表接线对了，所以下面补两条**行为断言**：
   *         没研究铁器时买不到铁镰 / 研究后买得到。 */
  /* ⚠️ 2026-09-28 第三件（马具）曾是 wip 占位（数量从 6 变 7）；
   *    2026-09-29 用户拍板实装（商人奢侈品产出 +50%）⇒ 原「占位三条」断言随实化作废，
   *    升级为钉**真件**的行为（见下块）。数量断言只守「表里还在」，行为归下块。 */
  check('工具表七件齐全（青铜镰斧镐 + 铁镰斧镐 + 马具）',
    T.length === 7 && !!w.byId('tool_sickle') && !!w.byId('tool_axe') && !!w.byId('tool_pick')
      && !!w.byId('tool_ironSickle') && !!w.byId('tool_ironAxe') && !!w.byId('tool_ironPick')
      && !!w.byId('tool_harnes'),
    T.map(t => t.id).join(','));

  /* ⚠️ 2026-09-29 马具实装后的四条行为断言：
   *      ① 数据：wip 已摘、target/bonus 写全（workshop.js 那道 wip 门机制保留，
   *         将来再有占位件仍走它）；
   *      ② 解锁门：need 'horsemanship' 真的被 blocked 读（没研究马术 → 说得出「马术」）；
   *      ③ 效果到账：toolMul(s,'merchant') 买前 1 → 买后 1.5（加法语义，与青铜三件同口径）；
   *      ④ 产能到账：rates.luxury 装/不装比值 = 1.5（pop=0 让需求=0、净=毛，
   *         断言不被消耗项稀释 —— 与 §五点十「装前/装后是两个独立 fixture」同一条纪律）。 */
  {
    const harnes = w.byId('tool_harnes');
    const hs = SB.game.run();
    const keep = { tools: hs.tools, horsemanship: !!hs.techs.horsemanship,
      merchant: hs.jobs.merchant, pop: hs.pop, happy: hs.happy, coral: hs.res.coral };
    check('马具已实装：不再是 wip 占位，target/bonus 写全',
      !harnes.wip && (harnes.bonus || 0) === 0.5
        && Array.isArray(harnes.target) && harnes.target.indexOf('merchant') >= 0,
      'wip=' + harnes.wip + ' bonus=' + harnes.bonus
        + ' target=' + (harnes.target || []).join(','));

    /* ② 解锁门取证（与铁质工具那条同构）：blocked 只读 s，先夺走科技再还。
     *    ⚠️ canBuy 必须在「还没研究」的状态下取 —— §五点十判据二：
     *    断言参数从左到右求值，把 canBuy 留到科技还回去之后，它测的是另一个世界。 */
    hs.tools = {}; hs.lvl.workshop = 1; delete hs.techs.horsemanship;
    const gate = w.blocked(hs, 'tool_harnes');
    const gateCanBuy = w.canBuy(hs, 'tool_harnes');
    hs.techs.horsemanship = true;
    hs.res.coral = 5000;
    const after = w.blocked(hs, 'tool_harnes');
    check('没研究马术时马具买不到（need 真的被 blocked 读了，不是死字段）',
      /马术/.test(String(gate)) && gateCanBuy === false,
      'blocked 返回「' + gate + '」');
    check('研究了马术之后马具就买得到',
      w.canBuy(hs, 'tool_harnes') === true, 'blocked 返回「' + after + '」');

    /* ③④ 效果与产能取证。⚠️ 乘区本身可读才测得准（与 farmMul/globalMul 同理）：
     *    只看 rates.luxury 会被「商人 = 0」恒乘 0，看不出 +50% 有没有挂上。 */
    hs.jobs.merchant = 3; hs.pop = 0; hs.happy = 0;
    hs.tools = {};
    const m0 = SB.economy.toolMul(hs, 'merchant');
    const r0 = SB.economy.rates(hs).luxury;
    hs.tools = { tool_harnes: true };
    const m1 = SB.economy.toolMul(hs, 'merchant');
    const r1 = SB.economy.rates(hs).luxury;
    check('马具效果到账：toolMul(merchant) 买前 1 → 买后 1.5（加法语义）',
      Math.abs(m0 - 1) < 1e-9 && Math.abs(m1 - 1.5) < 1e-9,
      'm0=' + m0 + ' m1=' + m1);
    check('马具产能到账：rates.luxury 装/不装比值 = 1.5（pop=0 ⇒ 净=毛）',
      r0 > 0 && Math.abs(r1 / r0 - 1.5) < 1e-9,
      'r0=' + r0 + ' r1=' + r1 + ' ratio=' + (r0 > 0 ? (r1 / r0) : 'NaN'));

    hs.tools = keep.tools;
    hs.jobs.merchant = keep.merchant; hs.pop = keep.pop; hs.happy = keep.happy;
    hs.res.coral = keep.coral;
    if (!keep.horsemanship) delete hs.techs.horsemanship;
  }

  /* 「need 是不是只写不读」的取证。⚠️ 这条是**行为**断言而不是字段断言：
   * 字段存在只说明数据里写了，worked 是否真去拦才说明接线上没断。 */
  {
    const noTech = w.byId('tool_ironSickle');
    check('铁质工具都声明了 need（解锁它的科技）',
      !!noTech.need, JSON.stringify(noTech.need));

    const wt0 = SB.game.run();
    const keep = { ironwork: !!wt0.techs.ironwork, tools: wt0.tools };
    wt0.tools = {}; wt0.lvl.workshop = 1;
    delete wt0.techs.ironwork;
    const gate = w.blocked(wt0, 'tool_ironSickle');
    wt0.techs.ironwork = true;
    const after = w.blocked(wt0, 'tool_ironSickle');
    check('没研究铁器时铁质工具买不到（need 真的被 blocked 读了，不是死字段）',
      /铁器/.test(String(gate)) && w.canBuy(wt0, 'tool_ironSickle') === false,
      'blocked 返回「' + gate + '」');
    check('研究了铁器之后铁质工具就买得到',
      /还缺|null/.test(String(after)) || w.blocked(wt0, 'tool_ironSickle') === null,
      'blocked 返回「' + after + '」');
    if (!keep.ironwork) delete wt0.techs.ironwork;
    wt0.tools = keep.tools;
  }

  /* ① 落点不是死数据 —— 直接对源码取证。
   *    工具绑在**职业**上（用户 2026-09-27 拍），所以三张表要互相对齐：
   *      · config.TOOLS[].target 里的每个职业 → 必须真出现在 economy 的 toolMul 调用里；
   *      · economy.JOB_SINK 里的每个职业      → 同样必须有消费点；
   *      · 两边都不能有对方不认领的孤儿。
   *    防的是同一类病：职业 id 写错（'gather' 打成 'gatherer'）不报错，
   *    只会「工具买了、那个人一点没变」—— 与「woodJobRatio 僵尸数据」同族。 */
  const ecoSrc = fs.readFileSync(path.join(ROOT, 'src/economy.js'), 'utf8');
  const consumed = new Set();
  const callRe = /toolMul\(s, (?:'([^']+)'|\[([^\]]*)\])/g;
  let cm;
  while ((cm = callRe.exec(ecoSrc))) {
    if (cm[1]) consumed.add(cm[1]);
    else (cm[2] || '').split(',').forEach(part => {
      const k = part.trim().replace(/^['"]|['"]$/g, '');
      if (k) consumed.add(k);
    });
  }
  const tset = {}; T.forEach(t => { (t.target || []).forEach(k => { tset[k] = 1; }); });
  const deadTargets = Object.keys(tset).filter(k => !consumed.has(k)).map(k => k);
  check('每件工具绑的职业在 economy.js 里都有消费点（不造僵尸绑定）',
    deadTargets.length === 0, deadTargets.join('；') || Object.keys(tset).join(' / '));

  const sink = SB.economy.JOB_SINK || {};
  const sinkJobs = Object.keys(sink);
  const deadSink = sinkJobs.filter(k => !consumed.has(k)).map(k => k);
  check('JOB_SINK 里每个职业也都有消费点（表写了却没人读 = 静默断链）',
    deadSink.length === 0, deadSink.join('；') || sinkJobs.join(' / '));
  const orphanSink = sinkJobs.filter(k => !tset[k]).map(k => k);
  check('JOB_SINK 与 config.TOOLS 双向对齐（没有没人认领的职业）',
    orphanSink.length === 0, orphanSink.join('；') || sinkJobs.join(' / '));
  /* 职业 id 必须出自 config.JOBS，不能是新造的词。 */
  const jobIds = (SB.CFG && SB.CFG.JOBS ? SB.CFG.JOBS : []).map(j => j.id);
  const badJob = sinkJobs.concat(Object.keys(tset))
    .filter(k => jobIds.length && jobIds.indexOf(k) < 0);
  check('所有职业 id 都出自 config.JOBS（不新造词）',
    badJob.length === 0, badJob.join('；') || jobIds.join(','));

  /* ⚠️ 2026-09-29 马具：乘区必须 **tick 与 rates 两处都接**（少一处 = 面板撒谎）。
   *    与上面「落点取证」同源：直接对源码数 toolMul(s, 'merchant') 的调用次数。
   *    2026-09-28 曾在 tick/rates 各写一份算式导致演化脱节 —— 这条计数就是那笔账的守卫。 */
  const merchCalls = (ecoSrc.match(/toolMul\(s, 'merchant'\)/g) || []).length;
  check('马具乘区在 tick 与 rates 两处都接了', merchCalls === 2,
    "toolMul(s, 'merchant') 出现 " + merchCalls + " 次（应为 2：tick 一处 + rates 一处）");

  /* ② 门槛：建成工坊（用户拍板）。不是青铜术 —— 它是 era1 最贵的科技（cost 600，
   *    按 1 学者 0.15/s 约 67 分钟），挂上去工具会晚到玩家已打完半个 era1。 */
  wt.lvl.workshop = 0; wt.tools = {};
  wt.res.coral = 5000; wt.res.silt = 500;
  check('没建工坊时买不了，且说得清该做什么',
    w.blocked(wt, 'tool_sickle') === '需要先建成工坊', String(w.blocked(wt, 'tool_sickle')));

  /* ③ 资源不足：不给买、不给扣、不给半截状态。 */
  wt.lvl.workshop = 1;
  wt.res.coral = 10;
  const lackMsg = w.blocked(wt, 'tool_sickle');
  check('资源不足时买不了，且点名缺哪一样、缺多少',
    /^还缺/.test(lackMsg || '') && /珊瑚 150/.test(lackMsg || ''), String(lackMsg));
  check('付不起时不扣钱 —— 点了不掉资源（否则存档里会留下「钱少了、工具没到手」）',
    w.buy(wt, 'tool_sickle', noop) === false && wt.res.coral === 10, 'coral=' + wt.res.coral);
  check('买失败不留半截状态（tools 里没有它）', !wt.tools.tool_sickle);

  /* ④ 买下：扣费 + 置位 + 不能二次购买（是买断，不是等级）。 */
  wt.res.coral = 500;
  const coral0 = wt.res.coral;
  check('条件齐了就买得到', w.canBuy(wt, 'tool_sickle'));
  check('买下即扣费（全额）',
    w.buy(wt, 'tool_sickle', noop) === true && wt.res.coral === coral0 - 150,
    coral0 + ' → ' + wt.res.coral);
  check('买过一次不能再买（买断制，不是 lvN）',
    w.blocked(wt, 'tool_sickle') === '已经买过了');

  /* ⑤ 乘区落点 —— 镰走 farm，斧/镐走 gather，两条线互不串。 */
  wt.tools = {}; wt.lvl.workshop = 1;
  wt.res.coral = 9999; wt.res.silt = 9999;
  /* ⚠️ 从这里就得把职业摆好：下面开始读 rates()（产出），那一行一行都要有人在做。
   *    先只摆职业、先不买工具，才能拿到没吃工具的干净基线。 */
  wt.jobs = { gather: 2, craft: 0, scholar: 0, coralwright: 4, quarrier: 3, miner: 2 };
  const bF = SB.economy.farmMul(wt), bG = SB.economy.gatherMul(wt);
  check('基线两条乘区都是正的（工具是**乘**在这个基准上的）', bF > 0 && bG > 0,
    'farm=' + bF.toFixed(3) + ' gather=' + bG.toFixed(3));

  w.buy(wt, 'tool_sickle', noop);
  check('青铜镰 ×1.8 落在 farmMul（采集者 / 藻食）',
    Math.abs(SB.economy.farmMul(wt) / bF - 1.8) < 1e-9,
    '×' + (SB.economy.farmMul(wt) / bF).toFixed(3));
  /* 这条是硬护栏：foodRate 里那句「别把 gatherMul 乘进来」，
   * 当年就是乘进去了 —— 食物虚高到 38/秒，几个 tick 把仓储上限糊穿。 */
  check('青铜镰对 gatherMul 零影响（食物线绝不吃采集倍率）',
    SB.economy.gatherMul(wt) === bG, bG.toFixed(3) + ' → ' + SB.economy.gatherMul(wt).toFixed(3));

  /* ⑤′ 斧 / 镐各有各的坑位：这是用户 2026-09-27 纠正的那条语义。
   *    旧实现里两者同挂 gatherMul ⇒ 买斧头石头也涨。现在必须各 ×1.8、互不牵连。
   *    ⚠️ 基线要在**买之前**取（镰已经买下，但它不影响珊瑚与石头，留着不影响读数）。 */
  wt.tools = { tool_sickle: true };
  const bCoral = SB.economy.rates(wt).coral, bStone = SB.economy.rates(wt).stone;
  check('基线：珊瑚与石头都还没吃工具', bCoral > 0 && bStone > 0,
    'coral=' + bCoral.toFixed(2) + ' stone=' + bStone.toFixed(2));

  w.buy(wt, 'tool_axe', noop);
  check('青铜斧 ×1.8 落在珊瑚那一条（珊瑚匠）',
    Math.abs(SB.economy.rates(wt).coral / bCoral - 1.8) < 1e-9,
    bCoral.toFixed(2) + ' → ' + SB.economy.rates(wt).coral.toFixed(2));
  check('🚨 青铜斧对采石零影响（旧实现「买斧头石头也涨」被用户否决，这条就是护栏）',
    SB.economy.rates(wt).stone === bStone, bStone.toFixed(2));
  w.buy(wt, 'tool_pick', noop);
  /* 镐同时管石头 / 金属 / 暖石三行，所以珊瑚那边不能跟着动。 */
  check('青铜镐 ×1.8 落在石头那一条（采石工 + 矿工）',
    Math.abs(SB.economy.rates(wt).stone / bStone - 1.8) < 1e-9,
    bStone.toFixed(2) + ' → ' + SB.economy.rates(wt).stone.toFixed(2));
  const rCoralAxe = SB.economy.rates(wt).coral;   // 买斧之后、买镐之前
  check('🚨 青铜镐对珊瑚零影响（珊瑚不该被采石工具抬起来）',
    SB.economy.rates(wt).coral === rCoralAxe, rCoralAxe.toFixed(2));
  check('三件买齐 = 三条线各 ×1.8，不是一条 ×5.83（互不叠加）',
    Math.abs(SB.economy.farmMul(wt) / bF - 1.8) < 1e-9 &&
    Math.abs(SB.economy.rates(wt).coral / bCoral - 1.8) < 1e-9 &&
    Math.abs(SB.economy.rates(wt).stone / bStone - 1.8) < 1e-9,
    'farm ×' + (SB.economy.farmMul(wt) / bF).toFixed(3) +
    ' / coral ×' + (SB.economy.rates(wt).coral / bCoral).toFixed(3) +
    ' / stone ×' + (SB.economy.rates(wt).stone / bStone).toFixed(3));

  /* ⚠️ 2026-09-28：同职业的两件工具（青铜镰 + 铁镰都落 gather）由「叠乘」改成**相加**，
   *    形参照猫国 core.js 的 effects 合并（`globalEffects[name] += effect`）。
   *    ⇒ 叠乘的 ×1.8 × 1.8 = ×3.24 不再是答案，正确答案是 1 + 0.8 + 0.8 = **×2.6**。
   *    ⚠️ 「取最高那件」会得到 ×1.8 —— 那样青铜镰买了之后买铁镰等于白扔 150 珊瑚，
   *       玩家一算就不买青铜，前期那件工具等于不存在。所以既不能叠乘也不能取高。
   *    ⚠️ 这条同时是回归护栏：谁把 toolMul 改回 `m *= (1+bonus)`，这里立刻红。 */
  wt.tools = { tool_sickle: true, tool_ironSickle: true };
  check('同一职业两件工具 = 相加 ×2.6（既不是叠乘 ×3.24，也不是取高 ×1.8）',
    Math.abs(SB.economy.farmMul(wt) / bF - 2.6) < 1e-9,
    'farm ×' + (SB.economy.farmMul(wt) / bF).toFixed(3));

  /* ⑥ 真的落到产出上 —— 乘区数字对了不等于珊瑚真的多。
   *    rates() 是纯读数（与 tick 同源），两个读数之间除 state.tools 外什么都没动。 */
  wt.tools = {};
  wt.jobs = { gather: 2, craft: 0, scholar: 0, coralwright: 4, quarrier: 3, miner: 2 };

  /* ⚠️ 常驻护栏（2026-09-27 抓到一例活的）：面板速率里任何一项是 NaN，
   *    都是「某个可选字段没配 || 0」这类断链 —— 不抛错、不上报，就是显示 NaN。 */
  const badRate = Object.keys(SB.economy.rates(wt))
    .filter(k => !isFinite(SB.economy.rates(wt)[k]));
  check('rates() 每一项都是有限数（面板不显示 NaN）',
    badRate.length === 0, badRate.join(',') || Object.keys(SB.economy.rates(wt)).join('/'));

  const rCoral0 = SB.economy.rates(wt).coral;
  const rStone0 = SB.economy.rates(wt).stone;

  /* 藻食那条线要单独隔离：foodRate =（建筑侧 + 职业侧）× 季节 × 导流堤，
   * 建筑侧那份（藻场）不吃 farmMul，会把比值稀释成 ×1.59（1.37 → 2.18 而不是 ×1.8）。
   * 把藻场清零，只剩职业侧，比值才是干净的 1.8 —— 测的正是「镰刀作用于采集者」。 */
  const kelpLvl0 = wt.lvl.kelp;
  wt.lvl.kelp = 0;
  const rFood0 = SB.economy.foodRate(wt);
  wt.tools.tool_sickle = true;
  const rFood1 = SB.economy.foodRate(wt);
  check('青铜镰抬藻食产出 ×1.8（乘区对了，产出就得跟着动）',
    Math.abs(rFood1 / rFood0 - 1.8) < 1e-9, rFood0.toFixed(2) + ' → ' + rFood1.toFixed(2));
  wt.lvl.kelp = kelpLvl0;
  check('青铜镰对珊瑚产出零影响（串线会在这里现形）',
    SB.economy.rates(wt).coral === rCoral0, rCoral0.toFixed(2));

  wt.tools.tool_axe = true;
  check('青铜斧抬珊瑚产出 ×1.8（珊瑚匠那条线）',
    Math.abs(SB.economy.rates(wt).coral / rCoral0 - 1.8) < 1e-9,
    rCoral0.toFixed(2) + ' → ' + SB.economy.rates(wt).coral.toFixed(2));

  /* 镐的落点是 stone + silt + warmstone 三行，所以金属与暖石要一起验
   * —— 只乘 stone 那一行会让「暖石」这款伴生品漏掉工具加成。 */
  const rSilt0 = SB.economy.rates(wt).silt, rWarm0 = SB.economy.rates(wt).warmstone;
  wt.tools.tool_pick = true;
  check('青铜镐抬石头产出 ×1.8（采石工那条线）',
    Math.abs(SB.economy.rates(wt).stone / rStone0 - 1.8) < 1e-9,
    rStone0.toFixed(2) + ' → ' + SB.economy.rates(wt).stone.toFixed(2));
  check('青铜镐同时管采矿：金属一同 ×1.8',
    Math.abs(SB.economy.rates(wt).silt / rSilt0 - 1.8) < 1e-9,
    rSilt0.toFixed(2) + ' → ' + SB.economy.rates(wt).silt.toFixed(2));
  check('青铜镐同时管伴生暖石（三行一起，漏一行就是「买了镐暖石没变」）',
    Math.abs(SB.economy.rates(wt).warmstone / rWarm0 - 1.8) < 1e-9,
    rWarm0.toFixed(2) + ' → ' + SB.economy.rates(wt).warmstone.toFixed(2));
  check('🚨 买了斧头又买镐，珊瑚仍是 ×1.8 —— 采石工具不许回头抬珊瑚',
    Math.abs(SB.economy.rates(wt).coral / rCoral0 - 1.8) < 1e-9,
    rCoral0.toFixed(2) + ' → ' + SB.economy.rates(wt).coral.toFixed(2));

  /* ⑦ 存档侧：tools 必须真的存进 / 读回来，否则刷新等于白买。 */
  const snap = JSON.parse(JSON.stringify(wt));
  const backRun = SB.state.migrateRun(snap);
  check('买过的工具能过存档往返（刷新不会白买）',
    !!backRun.tools && backRun.tools.tool_sickle && backRun.tools.tool_pick,
    JSON.stringify(backRun.tools));
  check('存档里的工具表是布尔买断表（不是计数）',
    JSON.stringify(backRun.tools) === '{"tool_sickle":true,"tool_axe":true,"tool_pick":true}',
    JSON.stringify(backRun.tools));
  const wtFresh = SB.state.migrateRun({ t: 0 });
  check('旧档缺 tools 键时补出空表（缺键 = undefined 会顺着 `s.tools &&` 变成不生效）',
    !!wtFresh.tools && typeof wtFresh.tools === 'object' &&
    Object.keys(wtFresh.tools).length === 0, JSON.stringify(wtFresh.tools));

  /* ⑧ 工坊界面 —— 用户拍板的是「建成工坊**开工坊界面**」，
   *    所以面板必须真的存在、真的会跟着状态翻，不能只是数据层对。 */
  wt.tools = {}; wt.lvl.workshop = 0;
  SB.game.setTab('workshop');
  check('没建工坊时进不去（灰页签就是点不动，不是装饰）',
    SB.game.getTab() !== 'workshop', 'tab=' + SB.game.getTab());
  check('没建工坊时面板写着「尚未建成」，不给玩家一块空白',
    /尚未建成/.test(doc.getElementById('pane-workshop').innerHTML));

  wt.lvl.workshop = 1;
  SB.game.setTab('workshop');
  check('建成工坊后页签放行', SB.game.getTab() === 'workshop', 'tab=' + SB.game.getTab());
  wt.res.coral = 9999; wt.res.silt = 9999;
  SB.game.setTab('workshop');
  const wpane = doc.getElementById('pane-workshop').innerHTML;
  check('工坊页列出三件工具，成本逐条摊开（够钱时也让看清要多少）',
    ['青铜镰', '青铜斧', '青铜镐'].every(n => wpane.indexOf(n) >= 0) &&
    /珊瑚 150/.test(wpane) && /珊瑚 200/.test(wpane) && /金属 50/.test(wpane),
    '三件齐 / 150·200·50');
  const wBtnBefore = wpane.match(/<button[^>]*data-tool="tool_sickle"[^>]*>/);
  check('买得起时按钮不带 disabled', !!wBtnBefore && !/disabled/.test(wBtnBefore[0]),
    wBtnBefore ? wBtnBefore[0] : '找不到按钮');

  wt.res.coral = 0; wt.res.silt = 0;
  SB.game.setTab('workshop');
  const wMsg = doc.getElementById('pane-workshop').innerHTML;
  /* ⚠️ ⚠️ 换成**受控复验**（2026-09-28 踩到）：上面那次渲染读的是全局 run()，而本文件
   *    前面几段断言改过它的 `techs.ironwork` 与 `lvl.workshop` —— 于是「面板上每件工具
   *    为什么是这个文案」变成一道随用例顺序漂移的题：同一件工具，此刻叫「买不起」、
   *    下一刻就可能是「未解锁」。在那份面板上逐件对答案，对的是**别人的历史状态**。
   *    ⇒ 这里自己造一份干净 state：研究铁器（让铁质三件过科技门，只留钱不够）
   *      + 三种资源清零 + 工坊已建（否则整页是「工坊尚未建成」），渲染后再逐件核。
   *    ⚠️ 验完**还原**：ironwork 原本是前面那段断言设上去的，不能顺手删掉。 */
  {
    const g = SB.game.run();
    /* ⚠️ 2026-09-29 马具实装：它从「wip 排除名单」进了正式工具名单 ⇒ 夹具必须
     *    同时给它开科技门（horsemanship），与铁器同一口径 —— 只留「钱不够」这一种拦法。 */
    const bakIron = g.res.iron, bakTech = !!g.techs.ironwork, bakHorse = !!g.techs.horsemanship;
    g.techs.ironwork = true;
    g.techs.horsemanship = true;
    g.res.iron = 0; g.res.coral = 0; g.res.silt = 0;
    SB.game.setTab('workshop');
    const msg = doc.getElementById('pane-workshop').innerHTML;
    g.res.iron = bakIron;
    if (!bakTech) delete g.techs.ironwork;
    if (!bakHorse) delete g.techs.horsemanship;

    /* 标签的取法跟着 render.js 的口径走（`/^需要先/.test(why) ? '未解锁' : '买不起'`），
     * 这里不重写那份规则 —— 一重写两边就各自演化，又变成两套逻辑。 */
    const labelOf = (id) => {
      const at = msg.indexOf('data-tool="' + id + '"');
      if (at < 0) return '未渲染';
      const m = msg.slice(at, at + 400).match(/>([^<]+)</);
      return m ? m[1] : '?';
    };
    const poor = SB.TOOLS.filter(t => !t.wip);
    const wrongPoor = poor.filter(t => labelOf(t.id) !== '买不起').map(t => t.id);
    check('资源不足时按钮改口叫「买不起」，并点出缺口（不是灰着还写「买」）',
      wrongPoor.length === 0 && /还缺/.test(msg),
      wrongPoor.length ? '没改口的：' + wrongPoor.join('、')
        : '共 ' + poor.length + ' 件全部改口｜' + (msg.match(/还缺[^<]*/) || ['没有缺口文案'])[0]);
    /* ⚠️ 钉住 wip 占位件在同一份面板上的表现：它该写「尚未设计」，绝不能
     *    跟着大伙儿叫「买不起」—— 那是「钱不够」的意思，会把方向说反。
     *    ⚠️ 2026-09-29 马具实装 ⇒ 表里**当前没有** wip 件；这条改判两态：
     *    「没有占位件」是当前真实性质；将来再放占位件进来，第二半自动接管查行为。 */
    const hw = SB.TOOLS.filter(t => t.wip);
    const badWip = hw.filter(t => !/尚未设计/.test(msg));
    check('wip 占位件要么当前不存在（马具已实装）、要么面板写「尚未设计」',
      hw.length === 0 || badWip.length === 0,
      hw.length === 0 ? '表内无 wip 件（全部已实装）'
        : badWip.length ? '说错话的：' + badWip.map(t => t.id + '=' + labelOf(t.id)).join('、')
          : hw.map(t => t.name + '=' + labelOf(t.id)).join('、'));
  }

  /* ── 工艺升级项的**面板入口**（2026-09-28）─────────────────────────
   * ⚠️ 这一条的由来：capOf 那条 ×1.5 的乘区早就通了、e2e 也绿了，但工坊面板上
   *    **根本没这一块** —— 玩家点不到，等于 ×1.5 不存在。与「系数加了没接线」是
   *    同一类病，缺的是入口。判据：**点不到的效果等于没做**，UI 少一块不算「以后再加」。
   * ⚠️ 照上面工具那段的受控复验口径：本段的全局 state 已被多处断言改过（铁器、
   *    工坊等级、三件资源），在那份面板上逐项对答案等于对别人的历史状态。
   *    ⇒ 自己造一份干净 state，验完还原。 */
  {
    const g = SB.game.run();
    const bak = {
      tech: !!g.techs.engineeringT, lvl: g.lvl.workshop,
      bracket: g.res.ironBracket, rope: g.res.rope, upg: g.upgrades
    };
    g.techs.engineeringT = true;      // 过了科技门，只剩钱不够
    g.lvl.workshop = 1;
    g.res.ironBracket = 0; g.res.rope = 0;
    SB.game.setTab('workshop');
    const pane0 = doc.getElementById('pane-workshop').innerHTML;
    check('工坊页出现「工艺升级项」那一块，两项都在（不是数据层加了、面板上没有）',
      /工艺升级项/.test(pane0) &&
      pane0.indexOf('data-upgrade="upg_ballast_1"') >= 0 &&
      pane0.indexOf('data-upgrade="upg_kelpstore_1"') >= 0,
      '区块=' + /工艺升级项/.test(pane0) + '，按钮=' +
      (pane0.match(/data-upgrade="[^"]+"/g) || []).join(' '));
    /* ⚠️ 取**按钮上那行字**，不要去匹配标签属性：`title` 里写的是「还缺 铁制支架 50」，
     *    那是缺口明细，按钮本身该写的「材料不够」在标签**外面**、紧跟着按钮的那段文本里。
     *    只测标签 ⇒ 断言永远读到 title，写着什么字都盖不住（这条自己踩过一次）。
     *    ⚠️ 取法照上面工具那段 `labelOf` 的口径：定位到 data-upgrade，向后取第一段文本。 */
    const upgLabel = (pane, id) => {
      const at = pane.indexOf('data-upgrade="' + id + '"');
      if (at < 0) return '未渲染';
      const m = pane.slice(at, at + 400).match(/>([^<>]+)</);
      return m ? m[1] : '?';
    };
    const b0 = pane0.match(/<button[^>]*data-upgrade="upg_ballast_1"[^>]*>/);
    check('材料不够时按钮灰着、并写「材料不够」（不是灰着还写「装上」）',
      !!b0 && /disabled/.test(b0[0]) && upgLabel(pane0, 'upg_ballast_1') === '材料不够',
      b0 ? 'disabled=' + /disabled/.test(b0[0]) + ' 文案=' + upgLabel(pane0, 'upg_ballast_1')
        : '找不到按钮');

    g.res.ironBracket = 50; g.res.rope = 50;
    SB.game.setTab('workshop');
    fire({ dataset: { upgrade: 'upg_ballast_1' } });
    const pane1 = doc.getElementById('pane-workshop').innerHTML;
    check('点「装上」真的装上了：s.upgrades 落袋 + 面板改口「已装上」+ 铁制支架+绳扣掉',
      !!(g.upgrades && g.upgrades.upg_ballast_1) &&
      (pane1.match(/已装上/g) || []).length === 1 &&
      (g.res.ironBracket || 0) === 0 && (g.res.rope || 0) === 0,
      'upgrades=' + JSON.stringify(g.upgrades) +
      ' ironBracket=' + (g.res.ironBracket || 0) + ' rope=' + (g.res.rope || 0));

    if (!bak.tech) delete g.techs.engineeringT;
    if (!bak.lvl) g.lvl.workshop = 0;
    g.res.ironBracket = bak.bracket; g.res.rope = bak.rope;
    g.upgrades = bak.upg;
    SB.game.setTab('workshop');
  }

  /* ═════════ 灯塔 / 大灯塔 / 全资源乘区（2026-09-28）═════════
   * ⚠️ 这一组的目的是钉住「+1% 有没有漏乘」：globalMul 是**新乘区**，要挨条挂到每种
   *    资源的产出行上。漏掉一种不会报错、不会 NaN，只是那种资源不吃加成 —— 典型的
   *    静默断链。所以这里逐项比，而不是只验一个总数。
   * ⚠️ 两份 state 除灯塔级数外**逐字段相同**（深拷贝再改一个键），否则比值对比会
   *    混进别的差异，红的时候分不清是谁造成的。 */
  {
    /* ⚠️ 造 state 的三个坑，全是实测踩出来的，改这段时别退回去：
     *   ① jobs / lvl 必须用 Object.assign **打补丁**，不能整体替换。整体替换会顺手删掉
     *      没写进字面量的键（如 lvl.library），而 tick 里的乘法会读它 ⇒ `undefined * 系数 = NaN`
     *      ⇒ 珊瑚 / 石头 / 砂矿 / 暖石几条产线**静默变 NaN**（不抛错，纯静默，最难查那种）。
     *      ⚠️ 2026-09-28：最初是在 `lvl.reef` 上踩到的，而礁石平台已删除 ⇒ 举一反三时
     *      别照抄那个键，报的是**这个坑本身**（任何 s.lvl.x 都适用）。
     *   ② frozen 要显式解掉：冰封期 cold=0，所有产出恒 0，比值无从比。
     *   ③ 库存初值必须**低于仓储上限**：砂矿基础上限 200，填 500 会被 addRes 夹回去，
     *      那一 tick 的主导量变成「削减库存」而不是「产出」，比值完全失真。 */
    const gm = 1 + SB.BLD.lighthouseProd;
    const mk = (lighthouse, extra) => {
      const c = SB.state.freshRun(false);
      c.pop = 0;                                    // 断掉口粮消耗（foodUse 刻意不吃 +1%）
      c.frozen = false;                             // 解冰封：cold=1，产出才不是恒 0
      Object.assign(c.jobs, { gather: 2, coralwright: 3, quarrier: 2, miner: 3, craft: 2,
        scholar: 2, scribe: 1 });
      /* ⚠️ 2026-09-28：`geyser: 60` 一并删除（热泉井已删）。留着它 = 一个**永远为 0 的
       *    等级键**：`Object.assign` 不报错，而任何读 `lvl.geyser` 的地方只会拿到 undefined。
       *    ⚠️ 这条就在 `fuelRate` 旁边——`undefined * 系数 = NaN` 是本项目出过的最贵的坑。 */
      Object.assign(c.lvl, { kelp: 10, library: 2, furnace: 1, workshop: 1 });
      c.res.silt = 100; c.res.warmstone = 100;      // < cap(200)，不被上限夹
      if (extra) extra(c);
      c.lvl.lighthouse = lighthouse;
      return c;
    };
    const A = mk(0), B = mk(1);
    const r0 = SB.economy.rates(A), r1 = SB.economy.rates(B);

    /* 「毛额」= 这一项真正进池的那一段产出。⚠️ silt / warmstone 在 rates() 里记的是**净额**：
     * 末尾减掉了熔炉正在吃的 fc（扣料，刻意不吃 +1%）。验乘区覆盖时必须把它加回去，
     * 否则「产出漏乘了」和「扣的那份被放大了」这两种错会混成同一个红，等于没测。
     * ⚠️ fc 从哪来：A 组没灯塔也没奇观 ⇒ globalMul(A) 恒为 1 ⇒ r0.iron 就是 fc 本身
     *    （iron 记的正是「扣掉的原料份数」）。这个等号是这个口径成立的前提，改之前先看懂。
     *    ⚠️ 但**补回去的那份必须是未放大的 fc**：iron 记的是 `fc × globalMul`，在 B 组里
     *       已经被放大；拿 r1.iron 去补 r1.silt 会重复计价 —— 实测 silt 比值从正确的
     *       1.010000 虚报成 1.012222，红是假的，会把排查方向带歪。 */
    const IS_CUT = k => (k === 'silt' || k === 'warmstone');
    const fc = r0.iron;
    const gross = (r, k) => (IS_CUT(k) ? r[k] + fc : r[k]);

    /* ① 纯产出线：整条表达式就是「产出 × globalMul」，没有任何不乘的加减项 ⇒
     *    比值必须**恰好** 1.01。这五行就是 globalMul 的覆盖清单，漏一条立刻红。 */
    const pure = ['coral', 'stone', 'science', 'culture', 'iron'];
    const miss = pure.filter(k => !(r1[k] > 0) || Math.abs(r1[k] / r0[k] - gm) > 1e-9);
    check('灯塔 +1% 覆盖全部纯产出线（珊瑚/石头/科技/市政点/精铁，漏一条这里红）',
      miss.length === 0,
      miss.length ? '没乘上：' + miss.map(k => k + ' ' +
        (r0[k] || 0).toFixed(4) + '→' + (r1[k] || 0).toFixed(4)).join('、')
        : pure.join('/') + ' 各 ×' + gm.toFixed(2));

    /* ② 扣料线：净额的增量必须恰好 = 1% × 毛额。这一条一次钉两件事 ——
     *    产出那一段乘上了，扣掉的那一份没乘（扣料放大 = 白扣，比漏乘更亏）。 */
    const cut = ['silt', 'warmstone'].filter(k =>
      Math.abs((r1[k] - r0[k]) - (gm - 1) * gross(r0, k)) > 1e-9);
    check('扣料线（矿砂/暖石）：产出那一段 ×1.01，熔炉扣的铁料那一份不放大',
      cut.length === 0,
      cut.length ? '差的：' + cut.map(k => k + ' 实增 ' + (r1[k] - r0[k]).toFixed(6)
        + '，应为 ' + ((gm - 1) * gross(r0, k)).toFixed(6)).join('、')
        : '毛额 ' + gross(r0, 'silt').toFixed(4) + '/' + gross(r0, 'warmstone').toFixed(4)
          + ' 各 ×' + gm.toFixed(2) + '，扣料那一份原样');

    /* ③ 地热：fuelRate 是「(毛产出 − 城邦维护) × globalMul」—— 维护是消耗，不放大
     *    （与口粮消耗 foodUse 同一个规矩）。
     *    ⚠️ 另一件容易漏的事：灯塔**本身也是建筑**，升一级会把 lvlSum 抬高 ⇒ 城邦维护
     *      凭空多 `BLD.upkeep` 一份，这一份也不放大。所以严格等式是：
     *          fuelRate(B) === (fuelRate(A) − BLD.upkeep) × gm
     *       写成「增量 = 1% × 净额」会差 0.0015×gm，看着像漏乘，其实是漏算了维护。
     *       （少一个灯塔 1.089 → 1.098375，用错公式会红在 1%×1.089=0.01089 上。） */
    const fa0 = SB.economy.fuelRate(A, 1), fa1 = SB.economy.fuelRate(B, 1);
    /* ⚠️ 2026-09-28 **挂起（不是改绿）**：热泉井（地热的唯一产出口）已删 ⇒ `fuelRate`
     *    恒返回 0 ⇒ 这条等式**没有输入可代**（`fa0 > 0` 恒假），公式本身仍在
     *    `economy.fuelRate` 里原样保留，等地热线重设时把断言改回 check() 即可：
     *        check('地热线：净额整体 ×1.01，…', fa0 > 0 && Math.abs(fa1 - (fa0 - SB.BLD.upkeep) * gm) < 1e-9, …)
     *    ⚠️ 但「维护不跟着放大」这条**规则本身仍然有效**，只是暂时没了回归覆盖 ——
     *       重设时优先把它验回来，别连公式一起重写。 */
    pending('地热线：净额整体 ×1.01，维护（含灯塔自己那一级的）不跟着放大',
      'fuelRate 恒 0（热泉井已删）⇒ 公式无输入；原断言：fa0>0 && |fa1-(fa0-upkeep)*1.01|<1e-9');
    /* 顺手钉住「恒 0」这个**当前真实性质**（不是空跑：它证的是没有 NaN、也没有残留产出口）。 */
    check('地热线当前恒为 0 且不产生 NaN（热泉井已删 ⇒ 无产出口）',
      fa0 === 0 && fa1 === 0 && !isNaN(fa0) && !isNaN(fa1),
      'fa0=' + fa0 + ' fa1=' + fa1 + '（若为 NaN 说明又有 `s.lvl.x` 少了 || 0 兜底）');

    /* ② 藻食：rates.kelp 是净额（毛产出 − 口粮消耗），消耗不吃 +1% ⇒
     *    整体比值不会等于 1.01。所以验**毛产出**函数本身必须 ×1.01。 */
    const f0 = SB.economy.foodRate(A, 1), f1 = SB.economy.foodRate(B, 1);
    check('灯塔对藻食**毛产出**也 +1%（foodRate 函数级：净额里的消耗项刻意不吃）',
      Math.abs(f1 / f0 - gm) < 1e-9, f0.toFixed(4) + ' → ' + f1.toFixed(4));

    /* ④ 面板 === 结算：rates() 是面板读数，tick 是真正进账。上面验的是面板，
     *    这里跑一个 dt 的 tick，看增量是否与面板同一比值。
     *    ⚠️ 口径与面板侧一致（走同一个 gross()）：silt / warmstone 的 tick 增量里
     *       也含着「被扣掉的那一份铁料」，不还原就对不上。
     *    ⚠️ 地热不列在这里：它的净额里含城邦维护，比值本就不是 1.01（上面 ③ 专测）。 */
    const t0 = mk(0), t1 = mk(1);
    const before = ['coral', 'stone', 'silt', 'science', 'culture', 'iron', 'kelp'];
    const d0 = {}, d1 = {}, g0 = {}, g1 = {};
    let k;
    for (k of before) { d0[k] = t0.res[k] || 0; d1[k] = t1.res[k] || 0; }
    SB.economy.tick(t0, 1, null); SB.economy.tick(t1, 1, null);
    /* ⚠️ 补回去的同样是**未放大**的那份铁料（= A 组的 iron 增量），理由与面板侧同一条注释：
     *    B 组的 iron 增量是 fc×1.01，而它从暖石/矿砂里扣掉的实际是没放大的 fc。 */
    const fc0 = (t0.res.iron || 0) - d0.iron;
    for (k of before) {
      g0[k] = (t0.res[k] || 0) - d0[k] + (IS_CUT(k) ? fc0 : 0);
      g1[k] = (t1.res[k] || 0) - d1[k] + (IS_CUT(k) ? fc0 : 0);
    }
    const drift = before.filter(key => !(g0[key] > 0) || Math.abs(g1[key] / g0[key] - gm) > 1e-9);
    check('灯塔的 +1% 在 tick 里也成立（面板路 === 结算路，漏乘一条就对不上）',
      drift.length === 0,
      drift.length ? '对不上的：' + drift.map(key => key + ' ×' +
        (g1[key] / (g0[key] || 1)).toFixed(6)).join('、')
        : before.join('/') + ' 与面板同比例');

    /* ④ 容量侧：灯塔 +120/级（与压舱仓并列相加，不是相乘）。 */
    const cap0 = SB.economy.capOf(A, 'coral'), cap1 = SB.economy.capOf(B, 'coral');
    check('灯塔给材料仓储 +120/级（与压舱仓并列相加，不叠乘）',
      Math.abs((cap1 - cap0) - SB.BLD.lighthouseCap) < 1e-9,
      cap0 + ' → ' + cap1 + '（+'
      + (cap1 - cap0).toFixed(0) + '，ballastCap=' + SB.BLD.ballastCap + '）');

    /* ⑤ 大灯塔：两笔效果各走各的通道，量纲不同，分别钉。 */
    /* ⚠️ 奇观是**买断**的：civicBonus 读的是 s.wonders，跟有没有灯塔建筑无关 ——
     *    所以这里要单独造一份「建了大灯塔」的 state，不能拿 B 顶替。 */
    const Bw = mk(1); Bw.wonders = { wonder_great_lighthouse: true };
    check('大灯塔 = 市政点 +2/秒（走 wonder.civicBonus 的绝对量，不是乘区）',
      SB.wonder.civicBonus(Bw) === 2 && SB.wonder.civicBonus(B) === 0,
      '未建 ' + SB.wonder.civicBonus(B) + ' → 建了 ' + SB.wonder.civicBonus(Bw) + '/秒');
    /* ⚠️ 反向：灯塔那座建筑也别偷加 civic —— 两件东西各管一段，重复计价是白送。 */
    check('灯塔自身**不给**市政点（+1% 归灯塔，+2/s 归大灯塔，别重复计价）',
      SB.wonder.civicBonus(mk(3)) === 0,
      '灯塔 3 级时 civicBonus=' + SB.wonder.civicBonus(mk(3)));

    const wCap = SB.economy.capOf(A, 'coral');
    A.wonders = { wonder_great_lighthouse: true };
    const wCap2 = SB.economy.capOf(A, 'coral');
    delete A.wonders;
    check('大灯塔各材料仓储 +60 = 灯塔每级 120 的一半，且**写死不随灯塔等级变**',
      Math.abs((wCap2 - wCap) - 60) < 1e-9 &&
      (() => { const c = mk(5); c.wonders = { wonder_great_lighthouse: true };
        return Math.abs(SB.economy.capOf(c, 'coral') - SB.economy.capOf(mk(5), 'coral') - 60) < 1e-9; })(),
      '固定 +60（灯塔 5 级时仍 +60）');
  }

  wt.res.coral = 9999; wt.res.silt = 9999;
  SB.game.setTab('workshop');
  fire({ dataset: { tool: 'tool_sickle' } });
  const wAfter = doc.getElementById('pane-workshop').innerHTML;
  check('点「买下」真的买到手：数据落袋 + 面板改口「已买下」',
    !!wt.tools.tool_sickle && (wAfter.match(/已买下/g) || []).length === 1,
    JSON.stringify(wt.tools));
  const wBtnAfter = wAfter.match(/<button[^>]*data-tool="tool_sickle"[^>]*>/);
  check('买过的那一行不给按钮（买断制，不是等级）',
    !!wBtnAfter && /disabled/.test(wBtnAfter[0]), wBtnAfter ? wBtnAfter[0] : '找不到按钮');

  /* ═════════ era2 第三层 · 工程学 / 数学 / 构架术（2026-09-28 用户规格）═════════
   * 这一层同时开了**三条新的通道**：配方解锁门（CRAFTS[].need）、仓储**乘法**轴
   * （扩容升级）、工坊效率加区（craftRatio）。三条都是本项目「数据表写了、实现层
   * 没读」的高发区，所以每一条都正反两面钉 —— 正面看它生效，反面看它被拦住。 */
  {
    const F = () => SB.state.freshRun(false);
    const byId = id => SB.TECHS.filter(t => t.id === id)[0];

    /* ① 科技 id 全表唯一 —— 加新科技最容易踩的坑，而且踩了不报错。
     *    era5 那一项已经占用了 `engineering`（工程兵团）。若 era2 这项也叫 engineering，
     *    `s.techs['engineering']` 就只有一个键：研究任一项都把另一项当成已掌握，
     *    byId 也只返回表里靠前那条。 ⇒ 每加一项科技都顺手体检一次全表。 */
    {
      const _ids = SB.TECHS.map(t => t.id);
      const _dup = [];
      _ids.forEach((v, i) => { if (_ids.indexOf(v) !== i && _dup.indexOf(v) < 0) _dup.push(v); });
      check('科技 id 全表唯一（era5「工程兵团」已占用 engineering，era2 这项须另取 id）',
        _dup.length === 0, _dup.length ? '重复 id：' + _dup.join('、') : _ids.length + ' 项，无一重复');
    }

    /* ② 所有 need / reqs 指向**真实存在**的科技 id。
     *    这条断言的由来：石梁配方原来写的 `need:'workshop'` 指的就是一个
     *    techs.js 里不存在的科技（workshop 只是**建筑** id）。CraftBlocked 补读 need
     *    之前它一直无害，一旦开始读，石梁就永久造不出来 —— 不报错，只是消失。 */
    {
      const broken = [];
      const chk = (label, list, key) => (list || []).forEach(o => {
        const n = o[key];
        if (n && !byId(n)) broken.push(label + '.' + o.id + ' → ' + n + '（无此科技）');
      });
      chk('CRAFT', SB.CRAFTS, 'need');
      chk('UPGRADE', SB.UPGRADES, 'need');
      chk('TOOL', SB.TOOLS, 'need');
      SB.TECHS.forEach(t => (t.reqs || []).forEach(r => {
        if (!byId(r)) broken.push('TECH.' + t.id + ' → ' + r + '（无此科技）');
      }));
      check('配方 / 升级项 / 工具 / 前驱指向的科技 id 全部真实存在（防指向不存在科技的死链）',
        broken.length === 0, broken.length ? broken.join('；') : '全部命中真实科技');

      /* ⚠️ 上一条**不够**，也说不清自己为什么不够：写入时若把 `engineeringT` 写成
       *    `engineering`，上面那条会**放过** —— 因为 `engineering` 是一个**真实存在的
       *    科技 id**（era5 的「工程兵团」）。它合法、可解析、不报错，只是 unlocking 的
       *    对象不是玩家以为的那一项（面板会显示「需要先研究『工程兵团』」）。
       *    ⇒ 再钉一条反向的：**解锁物必须指回解锁它的那一项科技**。 */
      const backRef = [];
      const expect = { craft_ironbracket: 'engineeringT', craft_rope: 'scaffoldT',
        upg_ballast_1: 'engineeringT', upg_kelpstore_1: 'engineeringT' };
      Object.keys(expect).forEach(id => {
        const o = (SB.CRAFTS || []).filter(x => x.id === id)[0] ||
                  (SB.UPGRADES || []).filter(x => x.id === id)[0];
        if (!o) { backRef.push(id + '（表上找不到）'); return; }
        if (o.need !== expect[id]) backRef.push(id + ' 的 need=' + o.need + '，应为 ' + expect[id]);
      });
      check('解锁物指回解锁它的那项科技（不只是「存在」，还要「对得上」）',
        backRef.length === 0, backRef.length ? backRef.join('；') : '解锁方与兑现物一一对应');
    }

    /* ③ 配方解锁门真的拦得住，且**执行路也拦得住**。
     *    「门只拦 blocked、不拦 craft()」= 解锁权是摆设：玩家照样能把配方点起来。 */
    {
      const noTec = F();
      noTec.lvl.workshop = 1;
      const why = String(SB.workshop.craftBlocked(noTec, 'craft_ironbracket'));
      check('没研究工程学时，铁制支架造不出（CRAFTS[].need 被 craftBlocked 真读）',
        /需要先研究「工程学」/.test(why), why);
      const gain0 = SB.workshop.craft(noTec, 'craft_ironbracket', 5, () => {});
      check('…而且 craft() 也造不出（门只拦 blocked 不拦执行 = 解锁权形同虚设）',
        gain0 === 0 && !(noTec.res.ironBracket > 0),
        'gain=' + gain0 + '，ironBracket=' + (noTec.res.ironBracket || 0));

      noTec.techs.engineeringT = true;
      noTec.res.iron = 200;
      const iron0 = noTec.res.iron;
      const gain = SB.workshop.craft(noTec, 'craft_ironbracket', 5, () => {});
      /* ⚠️ 这句里的 `20 - gain` 是**断言自己的算术错**，2026-09-28 修（2026-09-29 随配方改 iron:20 同步刷新数字）：
       *    gain 是**产出**（5×1×1.05=5.25，工坊那级 +5%），铁是**投入**（5×20=100）,
       *    两者不相等 ── 投入从不打折，只有产出乘效率（见 craft 里那句 craftMul 的注）。
       *    于是断言拿 5.25 去比实际的 100，永远不成立，而代码从头到尾是对的。
       *    ⇒ 这类「断言比错量纲」与「改常数让断言变绿」不是一回事：
       *      后者是标定（停），前者是量错了（修），改的是断言不是实现。
       * ⚠️ 顺带把它钉严：产物写成 `c.res` 那条键（不是硬编码的 stoneBeam），
       *    且**不往 stoneBeam 池里多写一笔**（写错资源 id 时两边会一起错）。 */
      const rec = SB.CRAFTS.filter(c => c.id === 'craft_ironbracket')[0];
      const ironSpent = rec.in.iron * 5;
      check('研究了工程学之后能造铁制支架，产物真落进资源池（c.res 接线，不是扣料产 0）',
        gain > 0 && (noTec.res.ironBracket || 0) === gain &&
        (noTec.res.iron || 0) === iron0 - ironSpent,
        '造出 ' + gain + '，ironBracket=' + (noTec.res.ironBracket || 0) +
        '，iron 剩 ' + (noTec.res.iron || 0) + '（' + iron0 + ' − ' + ironSpent + ' = ' + (iron0 - ironSpent) + '）');
      check('产物写的是本配方那条键，没顺手写进石梁池（c.res 跑偏时两边会一起错）',
        !(noTec.res.stoneBeam > 0) && String(rec.res) === 'ironBracket',
        'stoneBeam=' + (noTec.res.stoneBeam || 0) + '，配方 res=' + rec.res);
      /* ⚠️ 累计产出台账**只该记一笔**。addRes 内部已经写过 s.got[产物]，
       *    若 craft() 在调用端再补一笔，工艺制品的累计产出会**翻倍** ——
       *    s.got 正是 `{t:'gathered'}` 尤里卡条件的读端，不报错，就是错。 */
      check('工艺制品的累计产出台账不被重复记账（记两遍 ⇒ 累计产出条件提前点亮）',
        Math.abs((noTec.got.ironBracket || 0) - gain) < 1e-9,
        'got.ironBracket=' + (noTec.got.ironBracket || 0) + '，造出 ' + gain);

      /* 硬化珊瑚（2026-09-29 新增，对标猫国 beam）：无 need 门，建成工坊即可造。
       * 珊瑚 100/个 ⇒ 5 个吃 500 珊瑚，产物落 hardCoral 池、不串进石梁池。 */
      const hc = F(); hc.lvl.workshop = 1; hc.res.coral = 500;
      const coral0 = hc.res.coral;
      const hg = SB.workshop.craft(hc, 'craft_hardcoral', 5, () => {});
      const hrec = SB.CRAFTS.filter(c => c.id === 'craft_hardcoral')[0];
      const coralSpent = hrec.in.coral * 5;
      check('硬化珊瑚（对标猫国 beam）造得出，珊瑚真被扣、产物落 hardCoral 池',
        hg > 0 && (hc.res.hardCoral || 0) === hg &&
        (hc.res.coral || 0) === coral0 - coralSpent &&
        !(hc.res.stoneBeam > 0),
        '造出 ' + hg + '，hardCoral=' + (hc.res.hardCoral || 0) +
        '，coral 剩 ' + (hc.res.coral || 0) + '（' + coral0 + ' − ' + coralSpent + '）');
    }

    /* ④ 工坊效率 +5%：落在 craftRatio 那条轴，且必须是 mul 表的**加区**键。
     *    ⚠️ ⚠️ 最容易误接的一对：`craftRatio`（工艺制作效率，工坊造石梁那条线）
     *    与 `craft`（加工产出，烟囱炉 +15% / 壳铸 +30%，热泉炉那条线）。名字都带 craft，
     *    接错了不报错，只是「研究完了发现工坊没反应」。 */
    {
      const a = F(), b = F();
      b.techs.scaffoldT = true;
      const r0 = SB.workshop.craftRatio(a), r1 = SB.workshop.craftRatio(b);
      check('构架术给工坊效率 +5%（进 workshop.craftRatio，不是 T.craft 那条精铁线）',
        Math.abs(r1 - r0 - 0.05) < 1e-9,
        r0.toFixed(3) + ' → ' + r1.toFixed(3));
      /* ⚠️ 默认表里若没有 craftRatio，`m[k] === undefined` 那道守卫会把 effect 静默吞掉。 */
      const m = SB.tech.mul(b);
      check('craftRatio 确实是 mul 表的加区键（不在表里 ⇒ effect 被静默忽略，研究完毫无反应）',
        typeof m.craftRatio === 'number' && Math.abs(m.craftRatio - 0.05) < 1e-9,
        'mul().craftRatio = ' + m.craftRatio);
      check('工艺制作效率在面板路（craftMul）上同式（= 1 + ratio）',
        Math.abs(SB.workshop.craftMul(b) - (1 + r1)) < 1e-9,
        'craftMul=' + SB.workshop.craftMul(b).toFixed(4));
    }

    /* ⑤ 扩容升级项：解锁门 → 缺料文案 → 装了之后真的 ×1.5 且乘在**整条**容量上。 */
    {
      const s = F();
      s.lvl.workshop = 1;
      const g1 = String(SB.workshop.upgradeBlocked(s, 'upg_ballast_1'));
      check('扩容升级项没研究工程学时装不了（UPGRADES[].need 被真读，不是死字段）',
        /需要先研究「工程学」/.test(g1), g1);
      s.techs.engineeringT = true;
      const g2 = String(SB.workshop.upgradeBlocked(s, 'upg_ballast_1'));
      check('研究了工程学仍缺料，且缺哪样缺多少说得清（缺 undefined 50 就是没接线）',
        /铁制支架 50/.test(g2) && /绳 50/.test(g2), g2);

      /* ⚠️ 容量基线要够大，否则「×1.5」会被底数太小掩盖（比如底数 0）。 */
      const cap0 = SB.economy.capOf(s, 'coral');
      check('扩容前的材料上限不是 0（否则 ×1.5 恒等于 0，这条断言就空转了）',
        cap0 === SB.CFG.CAP_BASE.coral && cap0 > 0, 'baseline=' + cap0);

      s.res.ironBracket = 50; s.res.rope = 50;
      const ok = SB.workshop.upgradeBuy(s, 'upg_ballast_1', () => {});
      const cap1 = SB.economy.capOf(s, 'coral');
      check('「压舱库扩容 I」装得上，且 50 铁制支架 + 50 绳真的扣掉了',
        ok && (s.res.ironBracket || 0) === 0 && (s.res.rope || 0) === 0 &&
        !!s.upgrades.upg_ballast_1,
        'ironBracket=' + (s.res.ironBracket || 0) + ' rope=' + (s.res.rope || 0) +
        ' upgrades=' + JSON.stringify(s.upgrades));
      /* ⚠️ 乘的是**整条**容量（基础+等级+科技+奇观），不是只乘增量：
       *    只乘增量时「基础容量」那一截永远涨不上去，玩家会在低容量时买了个寂寞。 */
      check('材料上限 ×1.5，且乘在整条容量上（只乘增量 = 底数那截永远不涨）',
        Math.abs(cap1 - cap0 * 1.5) < 1e-9,
        cap0 + ' → ' + cap1 + '（×' + (cap1 / cap0).toFixed(3) + '）');
      check('压舱库扩容**不碰**藻食上限（两条各管一段，共用一个乘区就是重复计价）',
        Math.abs(SB.economy.capOf(s, 'kelp') - SB.CFG.CAP_BASE.kelp) < 1e-9,
        '藻食上限 ' + SB.economy.capOf(s, 'kelp') + '（CAP_BASE ' + SB.CFG.CAP_BASE.kelp + '）');
    }

    /* ⑥ 藻食库扩容反过来：只抬藻食，材料不动。 */
    {
      const s = F();
      s.techs.engineeringT = true;
      s.res.ironBracket = 50; s.res.rope = 50;
      const k0 = SB.economy.capOf(s, 'kelp');
      const ok = SB.workshop.upgradeBuy(s, 'upg_kelpstore_1', () => {});
      check('「藻食库扩容 I」只抬藻食上限，材料上限纹丝不动（主材/副材各吃一条乘区）',
        ok && Math.abs(SB.economy.capOf(s, 'kelp') - k0 * 1.5) < 1e-9 &&
        SB.economy.capOf(s, 'coral') === SB.CFG.CAP_BASE.coral,
        '藻食 ' + k0 + ' → ' + SB.economy.capOf(s, 'kelp') +
        '，珊瑚仍是 ' + SB.economy.capOf(s, 'coral'));
    }

    /* ⑦ 研究所：解锁权双写一致 + 尤里卡不自指 + 效果真的进科技产出。 */
    {
      const inst = SB.BUILDINGS.filter(b => b.id === 'institute')[0];
      check('研究所的 requiredTech 与「数学」的 unlockBuild 指向同一项（解锁权双写）',
        !!inst && (inst.requiredTech || []).indexOf('mathematics') >= 0 &&
        (byId('mathematics').eff.unlockBuild || []).indexOf('institute') >= 0,
        '建筑侧=' + JSON.stringify(inst && inst.requiredTech) +
        ' 科技侧=' + JSON.stringify(byId('mathematics').eff.unlockBuild));
      /* ⚠️ 尤里卡条件若指向自己解锁的那座建筑 ⇒ 永远达不成（解锁权还没到，条件先要它）。 */
      check('「数学」的尤里卡条件不指向研究所自己（自指 = 永远达不成的死锁）',
        !byId('mathematics').cond || byId('mathematics').cond.b !== 'institute',
        JSON.stringify(byId('mathematics').cond || null));

      const a = F(), b = F();
      [a, b].forEach(x => { x.techs.scholarT = true; x.techs.mathematics = true; x.jobs.scholar = 4; });
      b.lvl.institute = 1;
      const r0 = SB.economy.rates(a).science, r1 = SB.economy.rates(b).science;
      check('研究所建成后科技产出真的 ×1.5（面板路）',
        r0 > 0 && Math.abs(r1 / r0 - 1.5) < 1e-9,
        r0.toFixed(4) + '/秒 → ' + r1.toFixed(4) + '/秒');
      /* ⚠️ 只验面板路与结算路对不上 = 玩家看到 +50%、实际进账没变（本项目老病）。 */
      const ta = F(), tb = F();
      [ta, tb].forEach(x => { x.techs.scholarT = true; x.techs.mathematics = true; x.jobs.scholar = 4; });
      tb.lvl.institute = 1;
      SB.economy.tick(ta, 1, null); SB.economy.tick(tb, 1, null);
      const d0 = ta.res.science || 0, d1 = tb.res.science || 0;
      check('研究所的科技加成在 tick 里也成立（面板路 === 结算路，漏一路就红）',
        d0 > 0 && Math.abs(d1 / d0 - 1.5) < 1e-6,
        d0.toFixed(6) + ' → ' + d1.toFixed(6) + '（×' + (d1 / d0).toFixed(4) + '）');
    }

    /* ⑧ 尤里卡可达性 + 不自指。 */
    {
      const s = F();
      s.lvl.furnace = 3;
      check('「工程学」的尤里卡「拥有三级炽泉熔炉」能判成立',
        SB.tech.condMet(s, byId('engineeringT').cond), 'furnace=' + s.lvl.furnace);
      const t2 = F(); t2.res.science = 1000;
      check('「数学」的尤里卡「拥有 1000 科技点」读的是**当前库存**',
        SB.tech.condMet(t2, byId('mathematics').cond) && SB.tech.condMet(t2, { t: 'res', r: 'science', n: 1000 }),
        'res.science=' + t2.res.science);
      const t3 = F(); t3.got = { science: 1000 };
      check('…反证：只累计产出、手上没存下时不成立（口径没走偏成 gathered）',
        !SB.tech.condMet(t3, byId('mathematics').cond), 'got.science=1000 但 res=0 ⇒ 不成立');
      /* ⚠️ 尤里卡条件与 requiredTech 指向同一件东西 = 死锁，新增科技必自查。 */
      const selfRef = [];
      ['engineeringT', 'mathematics', 'scaffoldT'].forEach(id => {
        const t = byId(id), eff = t.eff || {}, cond = t.cond || {};
        const unlocks = [].concat(eff.unlockBuild || [], eff.unlockJob || [], eff.unlockTool || []);
        if (cond.b && unlocks.indexOf(cond.b) >= 0)
          selfRef.push(id + ' 的尤里卡要求自己解锁的 ' + cond.b);
      });
      check('新三项的尤里卡条件都不指向自己解锁的东西（自指 = 死锁）',
        selfRef.length === 0, selfRef.length ? selfRef.join('；') : '无自指');
    }
  }

  /* ---- 下半区「工艺制作」与奇观（2026-09-27 用户拍）----
   * 这五条专盯**静默断链**：系数加了却没接线，既不报错也不报警，
   * 玩家只会看到「工艺制作效率 +0%」却查不出为什么。断言就是用来钉这类事的。 */
  {
    const cb = SB.workshop.craftById('craft_stonebeam');
    const F = () => SB.state.freshRun(false);

    /* ① 工坊每级系数**真的接上了**。这条断言的由来：
     *    craftRatio() 里曾写成 `BLD.workshopCraft`，两处都踩空——
     *    BLD 在本文件从未声明（严格模式 ⇒ 一调用就抛 ReferenceError，工坊页直接崩），
     *    而 BLD 本身是缩放系数表（config.js 的 food: 0.09 那一类），压根没有这个键。
     *    ⇒ 系数只能从**建筑条目**上读。 */
    const bWorkshop = (SB.BUILDINGS || []).filter(b => b.id === 'workshop')[0];
    check('工坊条目挂着 craftRatio（系数在建筑条目上，不在缩放系数表里）',
      !!(bWorkshop && bWorkshop.craftRatio > 0),
      bWorkshop ? 'craftRatio=' + bWorkshop.craftRatio : '工坊条目缺失');
    const z0 = F(); z0.lvl.workshop = 0;
    const o1 = F(); o1.lvl.workshop = 1;
    check('工艺制作效率 = 工坊级数 × 条目系数（0 级 +0%，1 级 +5%）',
      SB.workshop.craftRatio(z0) === 0 &&
      Math.abs(SB.workshop.craftRatio(o1) - (bWorkshop.craftRatio || 0)) < 1e-9 &&
      Math.abs(SB.workshop.craftRatio(o1) - 0.05) < 1e-9,
      '0级=' + SB.workshop.craftRatio(z0) + ' 1级=' + SB.workshop.craftRatio(o1));

    /* ② 加法叠加（用户拍「加法」）：+5% 工坊 与 +5% 奇观 = 1.10，不是 1.05×1.05。 */
    const wd = F(); wd.lvl.workshop = 1; wd.techs.masonry = true;
    wd.res.stoneBeam = 99; wd.res.coral = 9999;
    const built = SB.workshop.build(wd, 'wonder_tide_stele', () => {});
    check('海潮方碑建成（石梁 20 + 珊瑚 300，两个来源都得给够）',
      !!built && wd.wonders.wonder_tide_stele === true,
      '石梁余 ' + wd.res.stoneBeam + '，珊瑚余 ' + wd.res.coral);
    check('叠加是加法不是乘法（+5% + +5% ⇒ ×1.10，不是 ×1.1025）',
      Math.abs(SB.workshop.craftRatio(wd) - 0.10) < 1e-9 &&
      Math.abs(SB.workshop.craftMul(wd) - 1.10) < 1e-9,
      'ratio=' + SB.workshop.craftRatio(wd) + '，mul=' + SB.workshop.craftMul(wd));
    check('奇观是买断：建过之后不能再建一次',
      SB.workshop.wonderBlocked(wd, 'wonder_tide_stele') !== null,
      SB.workshop.wonderBlocked(wd, 'wonder_tide_stele'));

    /* ③ 「+100」就是 100。用户实证：库存 15k 猫薄荷点 +100 也是造 100 个。
     *    百分比那一路只是把固定数往上顶，主效果是 fixed。 */
    const many100 = F(); many100.lvl.workshop = 1; many100.res.stone = 100000;
    const st100 = (SB.workshop.steps || []).filter(x => x.id === 'x100')[0];
    const got100 = st100 ? SB.workshop.stepAmt(many100, cb, st100) : -1;
    check('点「+100」就是造 100 份（不是库存的 100%）', got100 === 100, 'amt=' + got100);

    /* ④ 石梁无仓储上限——**用户拍的设计**，用断言钉住，
     *    免得将来有人顺手补个上限，还以为在修 bug。 */
    const nb = F();
    check('石梁不受仓储钳制（capOf = Infinity）', !isFinite(SB.economy.capOf(nb, 'stoneBeam')),
      'capOf(stoneBeam)=' + SB.economy.capOf(nb, 'stoneBeam'));
    nb.res.stoneBeam = 0;
    SB.economy.addRes(nb, 'stoneBeam', 1e6);
    check('塞 100 万石梁也留得下（addRes 不截断）', nb.res.stoneBeam >= 1e6,
      'stoneBeam=' + nb.res.stoneBeam);

    /* ⑤ 扣 100 石头 → 得 1.05 石梁：成本端不打折，产出端乘 (1+ratio)。 */
    const cr = F(); cr.lvl.workshop = 1; cr.res.stone = 100; cr.res.stoneBeam = 0;
    const gain = SB.workshop.craft(cr, 'craft_stonebeam', 1, () => {});
    check('100 石头出 1.05 石梁（成本端不打折，产出端才乘 (1+ratio)）',
      Math.abs(cr.res.stone) < 1e-9 && Math.abs(gain - 1.05) < 1e-9,
      '扣石头 ' + (100 - cr.res.stone) + '，得 ' + gain);

    /* ⑥ 奇观「各材料仓储 +200」只加材料，不加石梁（石梁压根没上限，加它无意义）。 */
    const mm = F(); mm.lvl.workshop = 1; mm.techs.masonry = true;
    mm.res.stoneBeam = 99; mm.res.coral = 9999;
    SB.workshop.build(mm, 'wonder_tide_stele', () => {});
    check('海潮方碑给各材料 +200 仓储，但**不给**石梁（白名单不是黑名单）',
      SB.wonder.matMaxBonus(mm, 'coral') === 200 &&
      SB.wonder.matMaxBonus(mm, 'stone') === 200 &&
      SB.wonder.matMaxBonus(mm, 'stoneBeam') === 0,
      '珊瑚+' + SB.wonder.matMaxBonus(mm, 'coral') +
      ' 石头+' + SB.wonder.matMaxBonus(mm, 'stone') +
      ' 石梁+' + SB.wonder.matMaxBonus(mm, 'stoneBeam'));
    check('仓储加成真的进 capOf（不是只写在效果表里没人读）',
      SB.economy.capOf(mm, 'coral') === SB.economy.capOf(F(), 'coral') + 200,
      'capOf(coral)=' + SB.economy.capOf(mm, 'coral'));

    /* ── 海潮方碑的**三面**：不给时怎么说、建成时扣得准不准、建成后尤里卡跟不跟得上 ──
     * ⚠️ 上面这几条全是**正面**断言（给了石工、给了料 ⇒ 建成 ⇒ 效果涨）。
     *    但「建成一座奇观」是《戏剧与诗歌》的尤里卡条件，而整局模拟里的 bot 从来不去
     *    建奇观（bot 的建造清单里没有它，见 wantWonder 那段注），所以这条链在回归里
     *    一直是**手工宣布建成**通过的 —— 手工摆 `s.wonders[id]=true` 会跳过所有门槛。
     *    正面断言只证明「给了就生效」，证明不了「不给时说得出为什么」。 */
    const pay = F(); pay.lvl.workshop = 1; pay.techs.masonry = true;
    pay.res.stoneBeam = 25; pay.res.coral = 320;          // 故意多给 5 根 / 20 珊瑚
    const okPay = SB.workshop.build(pay, 'wonder_tide_stele', () => {});
    check('建成后扣料**精确等于标价**（多给的 5 石梁 20 珊瑚一分不退）',
      okPay && pay.res.stoneBeam === 5 && pay.res.coral === 20,
      '余 ' + pay.res.stoneBeam + ' 石梁 / ' + pay.res.coral + ' 珊瑚');

    /* 扣料的反向也要钉：只给 19 根 ⇒ 建不成，且报得出**缺什么、现有多少**。
     * 少了这条，「石梁写了 20 实际扣 18」这类错会静默溜过去。 */
    const short = F(); short.lvl.workshop = 1; short.techs.masonry = true;
    short.res.stoneBeam = 19; short.res.coral = 320;
    const lackTxt = SB.workshop.wonderBlocked(short, 'wonder_tide_stele') || '';
    check('差 1 根石梁 ⇒ 建不成，且报得出缺什么/现有多少（不是静默失败）',
      /^还缺/.test(lackTxt) && /石梁 20/.test(lackTxt) && /现有 19/.test(lackTxt) &&
      SB.workshop.build(short, 'wonder_tide_stele', () => {}) === false &&
      !short.wonders.wonder_tide_stele,
      lackTxt || '（blocked=null ⇒ 按钮会是亮的，点了没反应）');

    const none = F();                                     // 一场石工都没有
    const noTech = SB.workshop.wonderBlocked(none, 'wonder_tide_stele') || '';
    check('没研究石工 ⇒ 建不成，且点明**该去研究哪一项**',
      noTech === '需要先研究「石工」' &&
      SB.workshop.build(none, 'wonder_tide_stele', () => {}) === false &&
      !none.wonders.wonder_tide_stele,
      noTech || '（blocked=null ⇒ 石工都没研究，按钮却是亮的）');

    /* 「建成一座奇观」这条尤里卡以前**只被手工夹具喂过**，这里换成真实建成后的状态走一遍。
     * 走 condMet 而不是直接判 s.wonders：直接判读的是实现，走 condMet 读的是契约。 */
    check('真实建成之后，「建成一座奇观」这条尤里卡**随之成立**（不靠手摆 s.wonders）',
      SB.wonder.count(pay) === 1 && SB.tech.condMet(pay, { t: 'wonder', n: 1 }) === true,
      'count=' + SB.wonder.count(pay) + ' condMet=' + SB.tech.condMet(pay, { t: 'wonder', n: 1 }));
    /* ⑦ **capOf 的绝对值要逐资源钉住**（2026-09-28 血案，别只比差值）。
     *    少了括号写成 `x + y + SB.wonder ? bonus : 0` 时，`+` 优先级高于 `?:`
     *    ⇒ 左半边整个成了条件，返回值只剩 bonus ⇒ 所有材料上限恒等于 0。
     *    「+200」那条断言比的是**差值**，两边一起错它照样成立，所以没抓住。
     *    判据：什么仓储都没建时，capOf(k) 必须**恰好等于** CAP_BASE[k]。 */
    const capBase = SB.CFG.CAP_BASE || {};
    const badCap = Object.keys(capBase).filter(k => SB.economy.capOf(F(), k) !== capBase[k]);
    check('每种材料的容量都拿得到 CAP_BASE（不是只剩奇观加成那一项）',
      badCap.length === 0,
      badCap.length
        ? badCap.map(k => k + '=' + SB.economy.capOf(F(), k) + '≠' + capBase[k]).join(' ')
        : Object.keys(capBase).map(k => k + ':' + capBase[k]).join(' '));
  }
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
    botStep();
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
  /* ⚠️ 2026-09-28 **挂起（不是改绿）**：终局那条链是
   *      shellBreaker ← siegeT +1 ← ballistics +2 ← turbine ← ignition
   *    而 **ballistics 的尤里卡条件是 `cond:{t:'rate', r:'fuel', n:0.5}`**（燃料产出 ≥ 0.5/s）。
   *    `fuelRate` 恒 0 ⇒ 该条件**永假** ⇒ ballistics 永远研究不了 ⇒ 后两条跟着断
   *    ⇒「整棵树能研究完 / 无永久死锁」结构性不成立。这就是删热泉井的直接代价。
   *    【重设后还原】把下面两条 pending 换回原 check()，它们原本钉的就是这个性质。 */
  pending('真实开局下整棵科技树能全部研究完（无永久死锁）',
    'ballistics 要求 fuelRate ≥ 0.5，而 fuelRate 恒 0（热泉井已删）⇒ 永久死锁；'
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
