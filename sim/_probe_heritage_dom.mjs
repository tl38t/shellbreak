/* 回归：heritage-draft.js 的 clearNodes() 必须用「节点自身父节点」删除嵌套节点。
 * 用 faithful DOM 桩（removeChild 对非直接子节点抛错，与真实浏览器一致）复现
 * open → close → reopen 与 pick（afterHeritagePick）路径，断言面板可反复开关。
 * 只读生产文件 src/ui/heritage-draft.js，不改它。用法：node sim/_probe_heritage_dom.mjs
 * 退出码 0=通过，1=失败。 */
import fs from 'node:fs';
import vm from 'node:vm';

function makeEl(tag) {
  const el = {
    tagName: tag,
    _children: [],
    parentNode: null,
    _attrs: {},
    _className: '',
    _classes: new Set(),
    dataset: {},
    style: {},
    textContent: '',
    setAttribute(name, value) { this._attrs[name] = value; },
    getAttribute(name) { return this._attrs[name]; },
    appendChild(child) {
      child.parentNode = this;
      this._children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this._children.indexOf(child);
      if (idx === -1) {
        const who = (child && (child._className || child.tagName)) || String(child);
        const par = this._className || this.tagName;
        throw new Error('NotFoundError: The node to be removed is not a child of this node '
          + '(尝试从 <' + par + '> 移除 <' + who + '>，但后者并非其直接子节点)');
      }
      this._children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    get children() { return this._children; },
    get firstElementChild() { return this._children[0] || null; },
    get innerHTML() { return this._children.length ? '(有子树)' : '(空)'; },
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

const SB = {
  i18n: { t: () => '' },
  heritage: {
    pendingOf: (s) => s._pend || [],
    nameOf: (id) => id,
    descOf: (id) => 'desc:' + id,
    roman: (n) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][(n | 0) - 1] || String(n),
  },
};

const sandbox = { window: null, document: doc, SB, console, globalThis: null };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const code = fs.readFileSync(new URL('../src/ui/heritage-draft.js', import.meta.url), 'utf8');
vm.runInNewContext(code, sandbox, { filename: 'heritage-draft.js' });

const ui = SB.ui;
const s = { _pend: [{ stage: 1, options: ['card_a', 'card_b', 'card_c'] }] };

let failed = 0;
const expect = (label, cond, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failed++;
};

// ① 首次打开
let r1;
try { r1 = ui.showHeritageDraft(s); } catch (e) { r1 = { THREW: e.code || e.message }; }
expect('① 首次打开：render 不抛错且面板有 1 个直接子节点',
  !!r1 && !r1.THREW && layer.children.length === 1 && !layer.classList.contains('hidden'),
  { children: layer.children.length, hidden: layer.classList.contains('hidden') });

// ② 关闭
let closeThrew = null;
try { ui.closeHeritageDraft(); } catch (e) { closeThrew = e.code || e.message; }
expect('② 关闭：clearNodes 不抛错且 nodes 已清空（面板空）',
  !closeThrew && layer.children.length === 0,
  { threw: closeThrew, children: layer.children.length });

// ③ 再次打开（旧 bug 在这里死：nodes 残留脏引用 → render 在 clearNodes 即抛 → 面板建不起来）
let r3;
try { r3 = ui.showHeritageDraft(s); } catch (e) { r3 = { THREW: e.code || e.message }; }
expect('③ 再次打开：可重建（旧 bug 会让 layer 始终空 = 择取无反应）',
  !!r3 && !r3.THREW && layer.children.length === 1 && !layer.classList.contains('hidden'),
  { children: layer.children.length, hidden: layer.classList.contains('hidden') });

// ④ pick 路径：还有待选时 afterHeritagePick 应再渲染下一张（旧 bug 在第二次 render 死）
try { ui.closeHeritageDraft(); } catch (e) {}
let pickThrew = null, r4;
try { r4 = ui.afterHeritagePick(s); } catch (e) { pickThrew = e.code || e.message; }
expect('④ afterHeritagePick（仍有待选）：再渲染不抛错且面板重建',
  !pickThrew && !!r4 && layer.children.length === 1,
  { threw: pickThrew, children: layer.children.length });

console.log('\n' + (failed ? ('失败 ' + failed + ' 项') : '全部通过') + ' — heritage-draft clearNodes 回归');
process.exit(failed ? 1 : 0);
