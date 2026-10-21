// 合并按钮三态冒烟探针：验证 renderBreakBtn 在「凿穿冰壳 / 破壳轮回 / 繁星轮回」三态下输出正确。
// 用 vm 加载真实 render.js（DOM 渲染层），深层 Proxy 把 SB 上未自定义成员桩成链式安全 no-op，
// 仅令 SB.game.run() 返回可控真实状态，从而安全跑通 renderAll 并读取 btnBreak 文案。
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
    textContent: '', disabled: false, innerHTML: '', onclick: null, style: {}, value: '',
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

const realState = { shell: 999, shellOpened: false, dysonDone: false, broken: false, breakSettled: false };
const state = new Proxy(realState, {
  get: (t, k) => (k in t ? t[k] : deepProxy()),
  set: (t, k, v) => { t[k] = v; return true; },
});
const realSB = {
  CFG: { ERAS: Array(10).fill('x'), POP_START: 10 },
  ERAS: Array(10).fill('x'),
  game: { run: () => state, meta: () => ({}) },
  ui: { render: {}, renderParts: deepProxy(), renderCommon: deepProxy(), renderContent: deepProxy() },
};
const SB = new Proxy(realSB, { get: (t, k) => (k in t ? t[k] : deepProxy()) });

const ctx = { document, console, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, Proxy };
ctx.window = ctx;
ctx.SB = SB;
vm.createContext(ctx);
vm.runInContext(code, ctx);

const R = ctx.SB.ui.render;
let allOk = true;
function checkBtn(label, expectText, expectDisabled) {
  R.renderAll();
  const got = els['btnBreak'].textContent;
  const dis = els['btnBreak'].disabled;
  const ok = got === expectText && (expectDisabled === undefined || dis === expectDisabled);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: text="${got}" disabled=${dis} (expect "${expectText}"${expectDisabled !== undefined ? ' disabled=' + expectDisabled : ''})`);
  if (!ok) allOk = false;
  return ok;
}

// 态1：未破壳（shellOpened=false）→ 凿穿冰壳，disabled
state.shell = 999; state.shellOpened = false; state.dysonDone = false; state.breakSettled = false;
checkBtn('未破壳', '凿穿冰壳', true);

// 态2：破壳后、未建戴森 → 破壳轮回，enabled
state.shell = 0; state.shellOpened = true; state.dysonDone = false; state.breakSettled = false;
checkBtn('破壳后未建戴森', '破壳轮回', false);

// 态3：已建戴森球 → 繁星轮回，enabled
state.dysonDone = true;
checkBtn('已建戴森球', '繁星轮回', false);

// 态4：已建戴森且本局已结算 → 仍显示繁星轮回（dysonDone 优先），disabled
state.breakSettled = true;
checkBtn('已建戴森且已结算', '繁星轮回', true);

// 态5：破壳未建戴森且已结算 → 破壳轮回，disabled
state.dysonDone = false;
checkBtn('破壳未建戴森且已结算', '破壳轮回', true);

console.log(allOk ? '\nALL PASS' : '\nSOME FAIL');
process.exit(allOk ? 0 : 1);
