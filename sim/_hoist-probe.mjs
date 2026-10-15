import { loadNoDom } from './load-sb.mjs';
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const { ctx, SB } = loadNoDom();
for (const rel of ['src/civics.js', 'src/companies.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
}
const s = SB.state.freshRun(null);
s.pop = 120; s.peak = 120;
s.jobs = { coralwright: 30, quarrier: 25, miner: 30, craft: 6, scholar: 15, merchant: 10 };
s.lvl = { siltpit: 30, institute: 12, library: 20, school: 12, kelp: 40, researchlab: 6, caravanserai: 5, temple: 10, furnace: 12, hydro: 12, workshop: 8, bank: 8, press: 6 };
s.upgrades = { upg_deepmine: 1, upg_fishbonemine: 1 };
s.wonders = { wonder_albada: 1 };
s.civics = { trade: 1, theology: 1, market: 1, explore: 1 };
s.res = Object.assign(s.res, { kelp: 1e6, coral: 1e6, stone: 1e6, silt: 1e6, warmstone: 1e5, iron: 1e4, steel: 1e3, science: 1e5, culture: 1e4, luxury: 1e4, faith: 1e5, titanium: 1e3, fuel: 1e3 });
const TECHS = SB.TECHS || [];
let n = 0;
for (const t of TECHS) if (t.era <= 6 && n++ < TECHS.length - 6) { s.eurekaMet = s.eurekaMet || {}; s.eurekaMet[t.id] = 1; s.techs[t.id] = true; }

function bench(fn, w, m) { for (let i = 0; i < w; i++) fn(); const t0 = process.hrtime.bigint(); for (let i = 0; i < m; i++) fn(); return Number(process.hrtime.bigint() - t0) / 1000 / m; }
const tick = SB.economy.tick;
console.log('tick 总成本      :', bench(() => tick(s, 0.1, null), 2000, 20000).toFixed(2), 'µs');

// 包裹计时：把 tick 内会调到的纯读函数逐个包一层计时
const targets = ['globalMul','gatherMul','toolMul','upgSum','coralFarmMul','bankMul','obsSciMul','faithRate','cultureRate','ironFlow','steelFlow','foodRate','foodUse','warmRelief','happyCost','warmEff','luxSaveAll','baseMul','isCold','coldSeasonMul','seasonTurn','libraryLevel'];
const costs = {};
for (const name of targets) {
  const orig = SB.economy[name];
  if (typeof orig !== 'function') continue;
  costs[name] = { n: 0, us: 0 };
  SB.economy[name] = function (...a) {
    const t0 = process.hrtime.bigint();
    const r = orig.apply(this, a);
    costs[name].us += Number(process.hrtime.bigint() - t0) / 1000;
    costs[name].n++;
    return r;
  };
}
// civic/tech/shell/prestige 模块上的读函数
var otherMap = {};
const otherTargets = [ [SB.civic, 'flow'], [SB.civic,'libraryMul'], [SB.civic,'universityMul'], [SB.civic,'cardSciOutMul'], [SB.civic,'govSciOutMul'], [SB.civic,'govLuxuryMul'], [SB.civic,'govHappyBonus'], [SB.civic,'cardHappyOffset'], [SB.civic,'cardLuxConsumeMul'], [SB.tech,'mul'], [SB.wonder,'cutterSciMul'], [SB.wonder,'happyBonus'], [SB.wonder,'skydrillHappyOffset'], [SB.wonder,'bazaarLuxMul'], [SB.prestige,'legacy'], [SB.shell,'tickShell'] ];
const savedOther = [];
for (const [obj, name] of otherTargets) {
  if (!obj || typeof obj[name] !== 'function') continue;
  const orig = obj[name];
  const c = { n: 0, us: 0 };
  savedOther.push([obj, name, orig]);
  obj[name] = function (...a) { const t0 = process.hrtime.bigint(); const r = orig.apply(this, a); c.us += Number(process.hrtime.bigint() - t0) / 1000; c.n++; return r; };
  otherMap = otherMap || {}; otherMap[name] = c;
}
const N = 20000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) tick(s, 0.1, null);
const totalUs = Number(process.hrtime.bigint() - t0) / 1000 / N;
console.log('\n包裹后 tick 总成本:', totalUs.toFixed(2), 'µs（包裹本身有开销，作上限参考）');
const rows = [];
for (const k in costs) if (costs[k].n) rows.push([k, costs[k].n / N, costs[k].us / N]);
for (const [obj, name, orig] of savedOther) if (otherMap[name] && otherMap[name].n) rows.push([name, otherMap[name].n / N, otherMap[name].us / N]);
rows.sort((a, b) => b[2] - a[2]);
let sum = 0;
for (const [k, cnt, us] of rows) { if (us > 0.01) { console.log(`${k.padEnd(18)} ×${cnt.toFixed(1).padStart(4)}/tick = ${us.toFixed(2)} µs`); sum += us; } }
console.log('可测函数合计     :', sum.toFixed(2), 'µs /', totalUs.toFixed(2), 'µs =', (100 * sum / totalUs).toFixed(0) + '%');
