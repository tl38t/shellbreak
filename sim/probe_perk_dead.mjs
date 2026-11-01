/* 定向探针（2026-11-01）：玩家报「轮回商店很多项目没生效，特别是加政策卡槽的」。
 *
 * A 组已按用户拍板修好（A 方案：真给政策卡槽；价格 50→75；「经济槽」改「民生槽」），
 * 本文件现在充当**回归锁**：
 *   A 三个「之位」→ civic.slotList 各 +1，类型分别是 工造(prod)/民生(grow)/科研(sci)
 *   B 「轮回工巧」craftLoop（15 点）→ craftRatio 加法轴；cycle=10 时 +50%
 *   C 「轮回炉火」furnaceHydroLoop（15 点）→ furnaceEffMul / hydroshopEffMul；cycle=10 时 +50%
 *   B/C 于 2026-11-01 按用户拍板接线（系数不动 0.05、不设上限）。
 *   ⚠️ B/C 的夹具**必须走 freshRun 生产路径**，不许手写键值 —— 键里存的是分数
 *     （0.05×cycle×lv），不是等级数。手写 `craftLoop = 5` 会把 +50% 写成 +500%。
 *
 * 全部走生产函数，只读，不写档。跑法：node sim/probe_perk_dead.mjs
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) {
  if (c) { pass++; console.log('  PASS ' + n); }
  else { fail++; fails.push(n + (e ? ' :: ' + e : '')); console.log('  FAIL ' + n + (e ? ' :: ' + e : '')); }
}

/* 中立状态：酋邦制（1 万能槽），建筑给一点基数，不装任何轮回天赋。
 * ⚠️ 必须给 s.gov：slotList 首行是 `if (!g || !g.slots) return []`，未采用政体时
 *   **所有**政策槽（含奇观/市政/轮回天赋送的）一律返回空 —— 不是本探针要测的东西。 */
const run = () => {
  const s = SB.state.freshRun(false);
  s.era = 8;
  s.gov = 'tribe';
  Object.assign(s.lvl, { kelp: 10, coral: 8, hall: 6, forge: 8, hotforge: 6, hydroshop: 6, mine: 6, quarry: 6 });
  s.jobs = { gatherer: 10, miner: 6, coralwright: 4, scholar: 4, scribe: 3 };
  s.civics = { laws: true };
  s.upgrades = {};
  return s;
};
const types = s => SB.civic.slotList(s).map(x => x.type);

console.log('\n=== A 三个「之位」（A 方案已实装）===');
const base = run();
console.log('  基线槽位：[' + types(base).join(', ') + '] / 自动制作槽 ' + SB.workshop.slotCap(base));

const CASES = [
  { id: 'slotCraft', type: 'prod', name: '工造槽' },
  { id: 'slotEcon', type: 'grow', name: '民生槽' },
  { id: 'slotSci', type: 'sci', name: '科研槽' }
];
for (const c of CASES) {
  const s = run();
  const before = types(s);
  s.perk[c.id] = 1;
  const after = types(s);
  ok('「' + c.id + '」给出 1 个' + c.name, after.length === before.length + 1 &&
    after.filter(t => t === c.type).length === before.filter(t => t === c.type).length + 1,
    '[' + before.join(',') + '] → [' + after.join(',') + ']');
}

{
  const s = run();
  const before = SB.workshop.slotCap(s);
  for (const c of CASES) s.perk[c.id] = 1;
  ok('「之位」不再动工坊自动制作槽（摘除旧接线）', SB.workshop.slotCap(s) === before,
    '自动槽 ' + before + ' → ' + SB.workshop.slotCap(s));
  ok('三个全买 ⇒ 政策槽 +3', SB.civic.slotList(s).length === SB.civic.slotList(base).length + 3,
    SB.civic.slotList(s).length + ' vs ' + SB.civic.slotList(base).length);
  ok('perkPolicySlots 直读与 slotList 合并同源',
    SB.civic.perkPolicySlots(s).length === 3 &&
    SB.civic.perkPolicySlots(s).map(x => x.type).join(',') === 'prod,grow,sci',
    JSON.stringify(SB.civic.perkPolicySlots(s)));
}

/* 关键回归：旧实现在「自动工坊买满」时被 SLOT_MAX 夹死，现在必须不受影响 */
{
  const s = run();
  s.upgrades.upg_autoshop = true;
  s.perk.autoCraft = 3;                 // 自动工坊 I/II/III 全买 ⇒ 自动槽已到上限 4
  const capFull = SB.workshop.slotCap(s);
  const before = SB.civic.slotList(s).length;
  for (const c of CASES) s.perk[c.id] = 1;
  ok('自动工坊买满时「之位」仍然生效（不再被 SLOT_MAX 吃掉）',
    capFull === SB.CFG.AUTO.SLOT_MAX && SB.civic.slotList(s).length === before + 3,
    '自动槽 ' + capFull + ' / 政策槽 ' + before + ' → ' + SB.civic.slotList(s).length);
}

/* 类型对口：工造槽只吃 prod 卡，民生槽只吃 grow 卡，科研槽只吃 sci 卡 */
{
  const craft = SB.civic.policyById('card_craft');       // prod
  const mystic = SB.civic.policyById('card_mystic');     // sci
  const town = SB.civic.policyById('card_town_meeting'); // grow
  ok('工造槽吃工造卡、不吃科研卡',
    SB.civic.cardFits(craft, 'prod') && !SB.civic.cardFits(mystic, 'prod'));
  ok('民生槽吃民生卡、不吃工造卡',
    SB.civic.cardFits(town, 'grow') && !SB.civic.cardFits(craft, 'grow'));
  ok('科研槽吃科研卡、不吃民生卡',
    SB.civic.cardFits(mystic, 'sci') && !SB.civic.cardFits(town, 'sci'));
}

/* 装卡前置：s.cards 必须随槽数扩容，否则新槽「看得见装不进」 */
{
  const s = run();
  s.perk.slotCraft = 1; s.perk.slotEcon = 1; s.perk.slotSci = 1;
  SB.civic.setCard(s, null, null);   // 触发 ensureCards
  ok('s.cards 按新槽数扩容（新槽能装卡）',
    s.cards.length === SB.civic.slotList(s).length,
    'cards ' + s.cards.length + ' vs slots ' + SB.civic.slotList(s).length);
}

/* 端到端：手上真有工造卡时，能装进「工造之位」给的那个槽 */
{
  const s = run();
  s.gov = 'tribe';
  s.civics = { laws: true, craft: true };   // 《工艺》⇒ 拿到 card_craft（type=prod）
  s.perk.slotCraft = 1;
  SB.civic.setCard(s, null, null);          // 先按新槽数扩容
  const idx = SB.civic.slotList(s).findIndex(x => x.type === 'prod');
  const set = SB.civic.setCard(s, 'card_craft', null, idx);
  ok('工造卡真的装进了「工造之位」给的那一格',
    idx >= 0 && set === true && s.cards[idx] === 'card_craft',
    'slot#' + idx + ' set=' + set + ' cards=' + JSON.stringify(s.cards));
}

/* 价格：用户 2026-11-01 拍 75 */
{
  const tree = SB.TIDE_TREE || [];
  const bad = CASES.map(c => tree.find(p => p.id === c.id)).filter(p => !p || p.cost !== 75);
  ok('三个「之位」价格均为 75', bad.length === 0,
    bad.map(p => (p ? p.id + '=' + p.cost : 'missing')).join(','));
}

/* ── B/C 组夹具：必须走**生产写入路径**，不许手写键值 ──────────────────────
 * ⚠️ 2026-11-01 教训：这两条原来写 `s.perk.craftLoop = 5`（当成「等级数」），
 *   而生产写入的是**分数** `a[k] × 0.05 × cycle × lv`（cycle=10 时 = 0.5）。
 *   单位一错，接上读数点以后探针会以 +500% 的假数据「通过」，掩盖真问题。
 *   ⇒ 现在改成「改 meta → freshRun 让 loop5 分支自己算」，与玩家开新局逐字同源。 */
const loopRun = (perks, cycle) => {
  const m = SB.game.meta();
  const keepP = m.perks, keepC = m.cycle;
  m.perks = Object.assign({}, perks);
  m.cycle = cycle;
  const s = SB.state.freshRun(false);
  m.perks = keepP; m.cycle = keepC;
  return s;
};
/* 任意配方壳：craftMul 只读 c.id / c.out（out 取 1 让乘区数字直接可读） */
const DUMMY = { id: 'craft_steelpart', out: 1 };

console.log('\n=== B 轮回工巧 craftLoop（已接线 · 2026-11-01）===');
{
  const CYC = 10;
  const s = loopRun({ craftLoop: 1 }, CYC);
  ok('键按生产口径写入（分数，不是等级数）：1×0.05×10 = 0.5',
    Math.abs(s.perk.craftLoop - 0.5) < 1e-9, 'craftLoop=' + s.perk.craftLoop);

  const base = loopRun({}, CYC);
  const before = SB.workshop.craftMul(base, DUMMY);
  const after = SB.workshop.craftMul(s, DUMMY);
  ok('轮回工巧真的提高工坊制作乘区：1.00 → 1.50',
    Math.abs(before - 1) < 1e-9 && Math.abs(after - 1.5) < 1e-9,
    'craftMul ' + before.toFixed(4) + ' → ' + after.toFixed(4));

  const s0 = loopRun({ craftLoop: 1 }, 0);
  ok('第 1 周目（cycle=0）不加成 —— 符合「每轮回重算」',
    Math.abs(SB.workshop.craftMul(s0, DUMMY) - 1) < 1e-9,
    'craftMul=' + SB.workshop.craftMul(s0, DUMMY).toFixed(4));

  /* 量纲锁：loop5 键是分数，必须与 craftQuota（等级数 ×0.10）在**加法轴**上直接相加，
   *   cycle10 + 工坊定额 I 一级 ⇒ 1 + 0.50 + 0.10 = 1.60。
   *   ⚠️ 若哪天有人把读数写成 `0.10 * craftLoop`，这里会得到 1.15 而红。 */
  const sMix = loopRun({ craftLoop: 1, craftQuota1: 1 }, CYC);  // ⚠️ meta.perks 的键是**节点 id**，不是 apply 键
  ok('与工坊定额同轴相加（不是 ×0.10 缩水）：1.60',
    Math.abs(SB.workshop.craftMul(sMix, DUMMY) - 1.6) < 1e-9,
    'craftMul=' + SB.workshop.craftMul(sMix, DUMMY).toFixed(4));
}

console.log('\n=== C 轮回炉火 furnaceHydroLoop（已接线 · 2026-11-01）===');
{
  const CYC = 10;
  const s = loopRun({ furnaceHydroLoop: 1 }, CYC);
  ok('两个键都按生产口径写入：furnaceLoop/hydroLoop 各 0.5',
    Math.abs(s.perk.furnaceLoop - 0.5) < 1e-9 && Math.abs(s.perk.hydroLoop - 0.5) < 1e-9,
    'furnaceLoop=' + s.perk.furnaceLoop + ' hydroLoop=' + s.perk.hydroLoop);

  const base = loopRun({}, CYC);
  ok('热泉炉效率 1.00 → 1.50、热液工坊效率 1.00 → 1.50',
    Math.abs(SB.economy.furnaceEffMul(base) - 1) < 1e-9 &&
    Math.abs(SB.economy.hydroshopEffMul(base) - 1) < 1e-9 &&
    Math.abs(SB.economy.furnaceEffMul(s) - 1.5) < 1e-9 &&
    Math.abs(SB.economy.hydroshopEffMul(s) - 1.5) < 1e-9,
    '炉 ' + SB.economy.furnaceEffMul(base).toFixed(2) + '→' + SB.economy.furnaceEffMul(s).toFixed(2) +
    ' / 坊 ' + SB.economy.hydroshopEffMul(base).toFixed(2) + '→' + SB.economy.hydroshopEffMul(s).toFixed(2));

  /* 与「炉心调谐」+20%/级 同在**效率轴**相加：1 + 0.20×1 + 0.50 = 1.70。
   *   若写成 0.20 * furnaceLoop 会得到 1.30，这里会红。 */
  const sMix = loopRun({ furnaceHydroLoop: 1, furnaceEff1: 1 }, CYC);
  ok('与炉心调谐同轴相加（不是 ×0.20 缩水）：1.70',
    Math.abs(SB.economy.furnaceEffMul(sMix) - 1.7) < 1e-9,
    'furnaceEffMul=' + SB.economy.furnaceEffMul(sMix).toFixed(4));

  /* 结构锁：desc 说的是「效率」，只进效率轴；产出轴（furnaceBoost/hydroshopBoost）
   *   由「炉压/热坊」那条线独占，两者在 tick 里是**相乘**的两个乘区，别混。 */
  const b = loopRun({ furnaceHydroLoop: 1, furnaceBoost1: 1, hydroshopBoost1: 1 }, CYC);
  ok('不串到产出轴：furnaceBoost/hydroshopBoost 仍是 +10%×1 级 = 1.10',
    Math.abs(SB.economy.furnaceBoostMul(b) - 1.1) < 1e-9 &&
    Math.abs(SB.economy.hydroshopBoostMul(b) - 1.1) < 1e-9,
    'boost ' + SB.economy.furnaceBoostMul(b).toFixed(2) + '/' + SB.economy.hydroshopBoostMul(b).toFixed(2));
}

console.log('\n' + (fail ? '失败 ' + fail + ' / ' + (pass + fail) : '全部通过 ' + pass + ' 条'));
if (fail) { console.log('\n失败项：'); for (const f of fails) console.log('  - ' + f); }
process.exit(fail ? 1 : 0);
