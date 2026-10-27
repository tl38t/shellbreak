// 轮回按钮六态冒烟探针（2026-10-27 由「合并按钮三态」升级）：
// 验证 renderBreakBtn 在「重开本周目 / 轮回 / 破壳轮回 / 繁星轮回 / 驭星轮回 / 飞升虚境」六态下
// 的 #btnBreak 文案、可点性，以及 #btnCycle 的显隐与文案。
// 用 vm 加载真实 render.js（DOM 渲染层），深层 Proxy 把 SB 上未自定义成员桩成链式安全 no-op，
// 仅令 SB.game.run() 返回可控真实状态，从而安全跑通 renderAll 并读取按钮状态。
//
// ⚠️ 探针纪律：SB.prestige.qualified / breakReport 必须给**真实现**，不能吃 deepProxy 兜底——
//    Proxy 的返回值恒真，会让「有神学/无神学」两态都判成同一个，探针假绿（踩过）。
import fs from 'fs';
import vm from 'vm';

const code = fs.readFileSync('src/ui/render.js', 'utf8');
const noop = () => {};

function deepProxy() {
  const f = function () { return deepProxy(); };
  return new Proxy(f, {
    get: (t, k) => {
      if (k === 'then') return undefined;
      if (k === 'toString' || k === 'valueOf') return () => '';
      if (k === Symbol.toPrimitive) return () => '';
      return deepProxy();
    },
    apply: () => deepProxy(),
    construct: () => deepProxy(),
  });
}

function makeEl() {
  return {
    textContent: '', disabled: false, hidden: false, innerHTML: '', onclick: null, style: {}, value: '', title: '',
    classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    setAttribute: noop, getAttribute: () => null, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => makeEl(), appendChild: noop, removeChild: noop, insertBefore: noop,
    remove: noop, cloneNode: () => makeEl(), focus: noop, blur: noop,
  };
}
const els = {};
const document = {
  getElementById: (id) => els[id] || (els[id] = makeEl()),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop,
  body: { classList: { add: noop, remove: noop } },
  documentElement: { dataset: {} },
};

const realState = {
  shell: 999, shellOpened: false, dysonDone: false, broken: false, breakSettled: false,
  civics: {}, lvl: {},
};
const state = new Proxy(realState, {
  get: (t, k) => (k in t ? t[k] : deepProxy()),
  set: (t, k, v) => { t[k] = v; return true; },
});

const realSB = {
  CFG: { ERAS: Array(10).fill('x'), POP_START: 10 },
  ERAS: Array(10).fill('x'),
  game: { run: () => state, meta: () => ({}) },
  /* 真实现：与生产 prestige.js:91 同口径（只看本局《神学》真值）。
   * ⚠️ 外层必须是 Proxy 而不是裸对象：render.js 还会调 prestige 的其它方法
   * （如 stardustFacilityLevels），裸对象会让它们变成 undefined 直接抛错——
   * 已知键给真实现、未知键继续走 deepProxy 兜底。 */
  prestige: new Proxy({
    qualified: (s) => !!(s && s.civics && s.civics.theology),
    breakReport: () => ({ tidePoints: 1, stardust: 0 }),
  }, { get: (t, k) => (k in t ? t[k] : deepProxy()) }),
  /* ui 同样要 Proxy 兜底：render.js 的 paneStarDome 会调 SB.ui.talentTreeMarkup 等
   * 未在桩里声明的方法，裸对象会让它们是 undefined。 */
  ui: new Proxy(
    { render: {}, renderParts: deepProxy(), renderCommon: deepProxy(), renderContent: deepProxy() },
    { get: (t, k) => (k in t ? t[k] : deepProxy()) }),
};
const SB = new Proxy(realSB, { get: (t, k) => (k in t ? t[k] : deepProxy()) });

const ctx = { document, console, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, Proxy };
ctx.window = ctx;
ctx.SB = SB;
vm.createContext(ctx);
vm.runInContext(code, ctx);

const R = ctx.SB.ui.render;
let allOk = true;

function setState(o) {
  realState.shell = 999; realState.shellOpened = false; realState.dysonDone = false;
  realState.broken = false; realState.breakSettled = false;
  realState.civics = {}; realState.lvl = {};
  Object.assign(realState, o);
}

function checkState(label, o, exp) {
  setState(o);
  R.renderAll();
  const b = els['btnBreak'], c = els['btnCycle'];
  const bTxt = b.textContent, bDis = b.disabled, cHid = !!c.hidden, cTxt = c.textContent;
  const ok = bTxt === exp.b && bDis === exp.bd &&
    (exp.c === null ? cHid === true : (cHid === false && cTxt === exp.c));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label.padEnd(14)} btnBreak="${bTxt}" disabled=${bDis}` +
    `  btnCycle=${cHid ? 'hidden' : '"' + cTxt + '"'}` +
    `   (期望 "${exp.b}" disabled=${exp.bd} cycle=${exp.c === null ? 'hidden' : '"' + exp.c + '"'})`);
  if (!ok) allOk = false;
}

/* 六态（判定优先级与 renderBreakBtn 一致） */
checkState('① 无神学', { shell: 463102 }, { b: '凿穿冰壳', bd: true, c: '重开本周目' });
checkState('② 有神学未破壳', { shell: 463102, civics: { theology: true } }, { b: '凿穿冰壳', bd: true, c: '轮回' });
checkState('③ 破壳未发卫星', { shell: 0, shellOpened: true, broken: true, civics: { theology: true } }, { b: '破壳轮回', bd: false, c: null });
checkState('④ 已发卫星', { shell: 0, shellOpened: true, broken: true, lvl: { satellite: 1 }, civics: { theology: true } }, { b: '繁星轮回', bd: false, c: null });
checkState('⑤ 建戴森', { shell: 0, shellOpened: true, broken: true, dysonDone: true, lvl: { satellite: 1 } }, { b: '驭星轮回', bd: false, c: null });
checkState('⑥ 飞升虚境', { shell: 0, shellOpened: true, broken: true, dysonDone: true, lvl: { satellite: 1 }, civics: { ascend_void: true } }, { b: '飞升虚境', bd: false, c: null });

/* 回归护栏：已结算但留在本局（breakSettled=true）仍必须可点——那是 2026-10-21 修过的死局，
 * 同时 2026-10-27 起 disabled 也不再带 `!s.broken`（壳归零就放开）。 */
checkState('⑦ 已结算留在本局', { shell: 0, shellOpened: true, broken: true, breakSettled: true, civics: { theology: true } }, { b: '破壳轮回', bd: false, c: null });

console.log(allOk ? '\nALL PASS' : '\nSOME FAIL');
process.exit(allOk ? 0 : 1);
