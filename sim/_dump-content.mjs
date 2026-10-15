/* 天壳 / SHELLBREAK — 从真实源码头 dump 内容清单 JSON。
 *
 * 复用 load-sb.mjs 的 vm 加载通道（与生产同序），把 SB 命名空间里内容清单需要的
 * 数据原样序列化到 sim/_content.json；build.py 再把它转成 xlsx。
 * 只 dump 字段，不复制任何数值 —— 源是代码，清单是派生。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from './load-sb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'src/config.js',
  'src/config-content.js',
  'src/config-buildings.js',
  'src/techs.js',
  'src/tech.js',
  'src/state.js',
  'src/workshop.js',
  'src/wonder.js',
  'src/economy.js',
  'src/shell.js',
  'src/habitat.js',
  'src/folk.js',
  'src/prestige.js',
  // civic data 与 civics rules 都需显式加载：导出用前者的内容表、后者的规则接口。
  'src/civics-data.js',
  'src/civics.js',
];

const metaStub = { tide: 0, spent: 0, perks: {}, cycle: 1, layers: 0, techLog: {} };
const sandbox = {
  console,
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {}, body: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  performance: { now: () => 0 },
  setInterval() {}, clearInterval() {},
  SB: { game: { meta: () => metaStub, showBreakPanel() {} }, rng: mulberry32(20260928) },
};
const ctx = vm.createContext(sandbox);
for (const rel of FILES) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
}
const SB = ctx.SB;

// 序列化：丢函数、防循环引用（同一对象出现两次标 [Circular]，但本作数据定义是平铺列表，正常不会出现）
const seen = new WeakSet();
function ser(v) {
  return JSON.stringify(v, (_k, val) => {
    if (typeof val === 'function') return undefined;
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  }, 2);
}

  const D = {
  RESS: SB.RESS,
  TECHS: SB.TECHS,
  BUILDINGS: SB.BUILDINGS,
  JOBS: SB.JOBS,
  TOOLS: SB.TOOLS,
  UPGRADES: SB.UPGRADES,
  CRAFTS: SB.CRAFTS,
  WONDERS: SB.WONDERS,
  CIVICS: SB.CIVICS,
  GOVS: SB.GOVS,
  POLICIES: SB.POLICIES,
  ERAS: SB.ERAS,
  BRANCHES: SB.BRANCHES,
  PERKS: SB.PERKS,
};

const out = path.join(ROOT, 'sim', '_content.json');
fs.writeFileSync(out, ser(D));

// 简要统计，便于核对
const stat = Object.fromEntries(Object.entries(D).map(([k, v]) => [k, Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0)]));
console.log('dumped:', out);
console.log('counts:', JSON.stringify(stat));
