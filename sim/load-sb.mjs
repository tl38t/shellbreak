/* 在 Node 里加载天壳的真实 src（无 DOM 子集）。
 * 目的：让回归脚本跑的是生产代码本身，而不是另一份复制的数值。
 * config → techs → tech → state → economy → shell → habitat → folk → prestige
 * 可在无 DOM 下运行（顺序必须与 index.html 一致：tech 层被 state/economy/shell 在
 * 首次调用时读取，反了会读到 undefined）；game / ui 需要 document，
 * 由 e2e.mjs 单独提供假 DOM 后再加载。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const NO_DOM = [
  'src/config.js',
  'src/techs.js',
  'src/tech.js',
  'src/state.js',
  /* workshop 排在 state 之后、economy 之前 —— **必须与 index.html 的 <script> 顺序逐字一致**。
   * 两份清单的顺序一旦分叉，e2e 绿而页面上白（或反之），是最难查的一类假回归。 */
  'src/workshop.js',
  /* ⚠️ 与上面 workshop 那行同一条纪律：这里的顺序就是 index.html 里 <script> 的顺序，
   *   新模块必须两边同时加、同时排序。 */
  'src/wonder.js',
  'src/economy.js',
  'src/shell.js',
  'src/habitat.js',
  'src/folk.js',
  'src/prestige.js',
];

/* 固定种子的 PRNG。⚠️ 2026-09-28： economy.js 里「冰封期冻死族民」那条判定**裸调
 * Math.random**，导致每次跑 e2e 的整局时长都在抖（实测 7.79h / 8.22h 交替出现）。
 * 时长一旦不可复现，就没法拿它做标定 —— 所以给模拟侧注入一个可复现的随机源，
 * 生产侧照旧用 Math.random（真实玩家本来就该随机），两边不互相污染。
 * 想换种子跑对照时，设环境变量 SB_SEED。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadNoDom(sandbox = {}) {
  /* game 层依赖 document，无 DOM 环境下用最小替身：只提供 doBreak 需要的两个入口。
   * 替身不参与任何游戏规则计算，生产代码 game.js 一旦被加载（e2e）就会覆盖它。 */
  const metaStub = { tide: 0, spent: 0, perks: {}, cycle: 1, layers: 0, techLog: {} };
  const seed = Number(process.env.SB_SEED || 20260928);
  sandbox.SB = { game: { meta: () => metaStub, showBreakPanel: () => {} }, rng: mulberry32(seed) };
  const ctx = vm.createContext(sandbox);
  for (const rel of NO_DOM) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  return { ctx, SB: ctx.SB };
}

/* 加载 index.html 中声明的全部脚本（按真实顺序），供假 DOM 端到端使用。
 * src/main.js 会自动 boot，调用方可在 boot 前注入假 DOM。 */
export function loadAll(sandbox) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // 剥掉 ?v= cache-buster 才能拿到真实文件路径
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
  const ctx = vm.createContext(sandbox);
  for (const rel of order) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  return { ctx, SB: ctx.SB, order };
}
