/* 离线补算性能探针 —— 回答「为什么离线计算这么慢」
 * 方法：载入真实 src（无 DOM 子集 + civics/companies，顺序与 index.html 一致），
 * 造一个晚期局状态，实测：
 *   ① economy.tick 单次耗时（µs/tick）
 *   ② tech.pump / civic.pump 单次耗时（离线每 2 游戏秒一拍）
 *   ③ 对照旧版 0.1 秒逐 tick 与当前 2 秒事件分段，推算 8h 满档离线的纯算量与墙钟耗时
 * 只测量、不改任何生产代码。
 */
import { loadNoDom } from './load-sb.mjs';

const files = ['src/civics.js', 'src/companies.js'];   // 额外补载（顺序在 state 之前）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

const { ctx, SB } = loadNoDom();
for (const rel of files) {
  // civics/companies 必须在 state 之前 —— loadNoDom 已载了 state，这里补载只为补齐 SB.civic/SB.companies
  // 模块只往 SB 上挂接口，晚载不影响已存在的 economy（tick 调用时才解引用）。
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
}

// ---- 造一个「晚期局」状态 ----
const s = SB.state.freshRun(null);
s.pop = 120; s.peak = 120;
s.jobs = { coralwright: 30, quarrier: 25, miner: 30, craft: 6, scholar: 15, merchant: 10 };
s.lvl = { siltpit: 30, institute: 12, library: 20, school: 12, kelp: 40, researchlab: 6,
  caravanserai: 5, temple: 10, furnace: 12, hydro: 12, workshop: 8, bank: 8, press: 6 };
s.upgrades = { upg_deepmine: 1, upg_fishbonemine: 1 };
s.wonders = { wonder_albada: 1 };
s.civics = { trade: 1, theology: 1, market: 1, explore: 1 };
s.res = Object.assign(s.res, { kelp: 1e6, coral: 1e6, stone: 1e6, silt: 1e6, warmstone: 1e5,
  iron: 1e4, steel: 1e3, science: 1e5, culture: 1e4, luxury: 1e4, faith: 1e5, titanium: 1e3, fuel: 1e3 });
// 晚期局：大部分科技/市政已达成（eurekaMet 永久台账 ⇒ 不再重跑 rates），留几条未达成的 rate 类条件
const TECHS = SB.TECHS || [];
let nMet = 0;
for (const t of TECHS) {
  if (t.era <= 6 && nMet < TECHS.length - 6) { s.eurekaMet = s.eurekaMet || {}; s.eurekaMet[t.id] = 1; s.techs[t.id] = true; nMet++; }
}
// civics 的台账字段（civics.pump 扫的是 s.civics + 自己的 cond）；照 tech 同理塞满已达成
try { if (SB.CIVICS) for (const c of SB.CIVICS) s.civicsMet = s.civicsMet || {}, (s.civicsMet[c.id] = 1); } catch (e) {}

const tick = SB.economy.tick;
const pumpTech = SB.tech.pump;
const pumpCivic = SB.civic && SB.civic.pump;

function bench(fn, n, warm) {
  for (let i = 0; i < warm; i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn();
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1000 / n;   // µs/call
}

const usTick = bench(() => tick(s, 0.1, null), 20000, 2000);
const usTechPump = pumpTech ? bench(() => pumpTech(s, null), 500, 20) : 0;
const usCivicPump = pumpCivic ? bench(() => pumpCivic(s, null), 500, 20) : 0;
const usRates = bench(() => SB.economy.rates(s), 200, 10);

// ---- 按生产分帧参数推算 8h 满档离线 ----
const OFF_CAP = 8 * 3600;             // OFFLINE_CAP（无离潮 perk）
const STEP = 0.1, OFFLINE_STEP = 2, TECH_PUMP = 2;
function scenario(name, adMul) {
  const totalTicks = adMul / STEP * OFF_CAP;
  const totalPumps = adMul / TECH_PUMP * OFF_CAP;
  const fastTicks = adMul / OFFLINE_STEP * OFF_CAP;
  const pureTick = totalTicks * usTick / 1e6;
  const purePump = totalPumps * (usTechPump + usCivicPump) / 1e6;
  const pure = pureTick + purePump;
  const fastPure = fastTicks * usTick / 1e6 + purePump;
  const wall = pure / 0.9;
  const fastWall = fastPure / 0.9;
  console.log(`\n【${name}】adMul=${adMul}`);
  console.log(`  旧版 0.1s：${totalTicks.toLocaleString()} tick + ${totalPumps.toLocaleString()} 泵拍 = ${wall.toFixed(2)}s 墙钟`);
  console.log(`  2s 分段：  ${fastTicks.toLocaleString()} tick + ${totalPumps.toLocaleString()} 泵拍 = ${fastWall.toFixed(2)}s 墙钟（事件边界会增加少量调用）`);
  console.log(`  估算节省：${(100 * (1 - fastWall / wall)).toFixed(1)}%（约 ${(wall / fastWall).toFixed(1)}×）`);
}
console.log('=== 单位耗时（晚期局实测） ===');
console.log(`economy.tick  : ${usTick.toFixed(1)} µs/tick`);
console.log(`tech.pump     : ${usTechPump.toFixed(0)} µs/拍`);
console.log(`civic.pump    : ${usCivicPump.toFixed(0)} µs/拍`);
console.log(`economy.rates : ${usRates.toFixed(0)} µs/次（未达成 rate 类科技每拍各跑一趟）`);
scenario('满档 8h · 无广告银行', 1);
scenario('满档 8h · 全程 2× 覆盖', 2);

// ---- 逐项拆账：tick 里每类调用的单位成本 ----
console.log('\n=== tick 内部逐项成本 ===');
const probe = (name, fn, n) => console.log(`${name.padEnd(28)}: ${bench(fn, n || 2000, 50).toFixed(2)} µs/次`);
probe('globalMul (tick 缓存后 1 次)', () => SB.economy.globalMul ? SB.economy.globalMul(s) : 0);
probe('cultureRate (tick 里 2 次!)', () => SB.economy.cultureRate(s));
probe('prestige.legacy (每 tick 1 次)', () => SB.prestige.legacy());
probe('companyMul (每产出行 1 次)', () => SB.companies ? SB.companies.mul(s, 'coral') : 0);
probe('civic.flow (每 tick 1 次)', () => SB.civic.flow(s));
probe('tech.mul (每 tick 1 次)', () => SB.tech.mul(s));
probe('faithRate (每 tick 1 次)', () => SB.economy.faithRate(s));
probe('foodRate+foodUse (每 tick)', () => { SB.economy.foodRate(s, 1, 0); SB.economy.foodUse(s); });
probe('shell.tickShell (每 tick)', () => SB.shell.tickShell(s, 0.1, null));
