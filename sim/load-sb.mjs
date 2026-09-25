/* 在 Node 里加载天壳的真实 src（无 DOM 子集）。
 * 目的：让回归脚本跑的是生产代码本身，而不是另一份复制的数值。
 * config → state → economy → shell → habitat → folk → prestige 可在无 DOM 下运行；
 * game / ui 需要 document，由 e2e.mjs 单独提供假 DOM 后再加载。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const NO_DOM = [
  'src/config.js',
  'src/state.js',
  'src/economy.js',
  'src/shell.js',
  'src/habitat.js',
  'src/folk.js',
  'src/prestige.js',
];

export function loadNoDom(sandbox = {}) {
  /* game 层依赖 document，无 DOM 环境下用最小替身：只提供 doBreak 需要的两个入口。
   * 替身不参与任何游戏规则计算，生产代码 game.js 一旦被加载（e2e）就会覆盖它。 */
  const metaStub = { tide: 0, spent: 0, perks: {}, cycle: 1, layers: 0, techLog: {} };
  sandbox.SB = { game: { meta: () => metaStub, showBreakPanel: () => {} } };
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
