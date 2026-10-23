/* 天壳 / SHELLBREAK — 从真实源码头 dump 内容清单 JSON。
 *
 * 复用 load-sb.mjs 的 loadNoDom()（文件清单与顺序由那一个地方管，与 index.html 同源），
 * 把 SB 命名空间里内容清单需要的数据原样序列化到 sim/_content.json；build.py 再转成 xlsx。
 * 只 dump 字段，不复制任何数值 —— 源是代码，清单是派生。
 *
 * ⚠️ 2026-10-20：本脚本原先自己维护一份 FILES 清单，与 load-sb.mjs 的 NO_DOM 各写一份。
 *    新增 economy-social.js 后这里没跟着加 ⇒ 每次跑都崩（economy.js 读不到 SOCIAL.happyMul）。
 *    这正是 load-sb.mjs 注释里警告过的「两份清单顺序分叉」——已改为单一来源，不再各写一份。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadNoDom, ROOT } from './load-sb.mjs';

const sandbox = {
  console,
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {}, body: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  performance: { now: () => 0 },
  setInterval() {}, clearInterval() {},
};

const { SB } = loadNoDom(sandbox);

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
  TIDE_TREE: SB.TIDE_TREE,
  /* 分区名（config-buildings.js:823）：清单里 zoneLvl 条件要把它写成中文，
   * 从源码 dump 而不是在 build.py 里再抄一份清单。 */
  ZONES: SB.BUILD_ZONES,
};

const out = path.join(ROOT, 'sim', '_content.json');
fs.writeFileSync(out, ser(D));

// 简要统计，便于核对
const stat = Object.fromEntries(Object.entries(D).map(([k, v]) => [k, Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0)]));
console.log('dumped:', out);
console.log('counts:', JSON.stringify(stat));
