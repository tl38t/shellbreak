/* 天壳 / SHELLBREAK — e2e 回归：heritage-draft.js 的 clearNodes() 必须用「节点自身父节点」
 * 删除嵌套节点（.heritage-draft-hd / cards / 按钮…），否则真实 DOM 抛 NotFoundError，
 * 且因 nodes 不被重置导致面板第二次起再也建不起来（「择取无反应」）。
 *
 * 2026-11-12：此 bug 当初被 e2e 共享假 DOM 的「removeChild 空实现」漏掉。
 * 本 suite 自带 faithful DOM 桩（removeChild 对非直接子节点抛错，与浏览器一致），
 * 加载真实生产文件 src/ui/heritage-draft.js，断言 open→close→reopen 与 pick 路径可反复开关。
 * 不依赖 e2e 共享的 no-op 假 DOM（那个桩会漏掉本类 bug）。 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function run({ SB, check }) {
  function makeEl(tag) {
    const el = {
      tagName: tag, _children: [], parentNode: null, _attrs: {}, _className: '', _classes: new Set(),
      dataset: {}, style: {}, textContent: '',
      setAttribute(name, value) { this._attrs[name] = value; },
      getAttribute(name) { return this._attrs[name]; },
      appendChild(child) { child.parentNode = this; this._children.push(child); return child; },
      removeChild(child) {
        const idx = this._children.indexOf(child);
        if (idx === -1) throw new Error('NotFoundError: node to be removed is not a child of this node');
        this._children.splice(idx, 1); child.parentNode = null; return child;
      },
      get children() { return this._children; },
      get firstElementChild() { return this._children[0] || null; },
    };
    Object.defineProperty(el, 'className', {
      get() { return this._className; },
      set(v) { this._className = v; this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    });
    el.classList = {
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      contains: (c) => el._classes.has(c),
    };
    return el;
  }

  const layer = makeEl('div');
  layer.setAttribute('id', 'heritageDraftLayer');
  layer._className = 'heritage-draft-layer hidden';
  layer._classes = new Set(['heritage-draft-layer', 'hidden']);

  const doc = {
    createElement: (t) => makeEl(t),
    getElementById: (id) => (id === 'heritageDraftLayer' ? layer : null),
    querySelector: () => null,
    body: { contains: () => false },
  };

  const mySB = {
    i18n: { t: () => '' },
    heritage: {
      pendingOf: (s) => s._pend || [],
      nameOf: (id) => id,
      descOf: (id) => 'desc:' + id,
      roman: (n) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][(n | 0) - 1] || String(n),
    },
  };

  const sandbox = { window: null, document: doc, SB: mySB, console, globalThis: null };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const code = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/ui/heritage-draft.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'heritage-draft.js' });

  const ui = mySB.ui;
  const s = { _pend: [{ stage: 1, options: ['card_a', 'card_b', 'card_c'] }] };
  const safe = (fn) => { try { return { v: fn(), threw: null }; } catch (e) { return { v: null, threw: e.message || String(e) }; } };

  const r1 = safe(() => ui.showHeritageDraft(s));
  check('heritage-clearnodes: 首次打开 draft 不抛错且面板建起',
    !r1.threw && r1.v && layer.children.length === 1 && !layer.classList.contains('hidden'),
    JSON.stringify({ threw: r1.threw, children: layer.children.length, hidden: layer.classList.contains('hidden') }));

  const c2 = safe(() => ui.closeHeritageDraft());
  check('heritage-clearnodes: 关闭 draft clearNodes 不抛错且面板清空',
    !c2.threw && layer.children.length === 0,
    JSON.stringify({ threw: c2.threw, children: layer.children.length }));

  const r3 = safe(() => ui.showHeritageDraft(s));
  check('heritage-clearnodes: 再次打开可重建（旧 bug 会让面板始终空 = 择取无反应）',
    !r3.threw && r3.v && layer.children.length === 1 && !layer.classList.contains('hidden'),
    JSON.stringify({ threw: r3.threw, children: layer.children.length, hidden: layer.classList.contains('hidden') }));

  ui.closeHeritageDraft();
  const r4 = safe(() => ui.afterHeritagePick(s));
  check('heritage-clearnodes: afterHeritagePick 仍有待选时再渲染不抛错且重建',
    !r4.threw && r4.v && layer.children.length === 1,
    JSON.stringify({ threw: r4.threw, children: layer.children.length }));
}
