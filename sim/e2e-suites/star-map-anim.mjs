/* 星图动画：高刷屏死锁回归锁（2026-11-16）
 *
 * ⚠️ 本套件**只写不跑**：用户 2026-11-15 09:14 明令「别跑 e2e，等我说跑再跑」，
 *    全量与 --xxx-only 单套件都须等当次明说「跑」。下面断言只是先落盘。
 *
 * 事故根因（452bd873 / Ver1.2.2「星图发热修复」引入）：
 *   star-map-frame.html 的 animate() 加了三条早退（document.hidden / now-last>500 /
 *   now-_lastDraw<FRAME_MIN-0.5），但 requestAnimationFrame(animate) 写在函数末尾，
 *   任一早退命中就不再调度下一帧 ⇒ 动画永久停。60Hz 下首帧间隔 16.67ms>16.167 侥幸
 *   不命中，90/120/144Hz 下首帧间隔 11.11/8.33/6.94ms 全部命中 ⇒ 天体停在 CSS 默认
 *   left:50%/top:53%，标签糊成一团（玩家截图实证）。
 *   修复：把 rAF 调度提到 animate 函数开头（与同文件 _smFrame 对称）。
 *
 * 2026-11-22 升级（挂机发烫）：调度改为 `if(_smActive)rAF(...)` + `if(!_smActive)return`，
 *   父页面切页签/切后台发 sb-star-map-active:false ⇒ 链条真停；切回发 true ⇒ 重新点火。
 *   机制锁从「rAF 恒在开头」升级为「rAF 受 active 控制且在早退之前」，并加 inactive 停链行为锁。
 *
 * 反 mock 纪律：不复制 animate 实现，直接读生产 star-map-frame.html，用花括号配对
 *   抽出真实 animate 函数体，注入受控 requestAnimationFrame / document / canvases，
 *   在 vm 里跑真实代码。断言「链条持续」+「天体位置被设置」+「节流仍生效」。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../load-sb.mjs';

/* 花括号配对抽取函数体（忽略字符串/注释里的括号——本函数体内无字符串常量含裸 {}）。 */
function extractFunctionBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return null;
  const open = src.indexOf('{', start + signature.length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

export function run({ SB, check }) {
  console.log('\n=== 星图动画：高刷屏死锁回归 ===');
  const framePath = path.join(ROOT, 'src/ui/star-map-frame.html');
  const src = fs.readFileSync(framePath, 'utf8');
  const body = extractFunctionBody(src, 'function animate(now)');

  check('星图动画：能从生产 HTML 抽到 animate 函数体', !!body && body.length > 200,
    'body=' + (body ? body.length : 'null'));
  if (!body) return;

  /* 判据 1（机制锁）：rAF 调度必须出现在所有早退 return 之前。
   * 直接抽函数体文本判「首个语句是 requestAnimationFrame(animate)」——
   * 这条锁住"再把 rAF 挪回末尾"的复发，比行为测试更早、更稳。 */
  const firstNonSpace = body.trimStart();
  const rafStartsFirst = /^_smRafA=0;if\(_smActive\)_smRafA=requestAnimationFrame\(\s*animate\s*\);/.test(firstNonSpace);
  check('星图动画：rAF 带 id 且受 active 控制，在所有早退之前', rafStartsFirst,
    'first=' + firstNonSpace.slice(0, 110));
  check('星图动画：animate 含 active 早退与 phase1 状态守卫',
    /if\(!_smActive\|\|_smView!=="phase1"\)return;/.test(body), 'body=' + body.slice(0, 130));
  check('星图动画：_smFrame 的调度同样带 id 且受 active 控制',
    /function _smFrame\(now\)\{_smRafB=0;if\(_smActive\)_smRafB=requestAnimationFrame\(_smFrame\);if\(!_smActive\|\|/.test(src), 'ok');
  check('星图动画：_smSetActive 取消旧链且幂等点火（防快速往返翻倍）',
    /cancelAnimationFrame\(_smRafA\)/.test(src) &&
    /cancelAnimationFrame\(_smRafB\)/.test(src) &&
    /if\(!_smRafA\)_smRafA=requestAnimationFrame\(animate\)/.test(src) &&
    /if\(!_smRafB\)_smRafB=requestAnimationFrame\(_smFrame\)/.test(src) &&
    src.indexOf('sb-star-map-active') >= 0, 'ok');
  const rafCount = (body.match(/requestAnimationFrame\(\s*animate\s*\)/g) || []).length;
  check('星图动画：animate 体内 rAF 调度恰好 1 次（开头，无末尾重复）', rafCount === 1,
    'count=' + rafCount);

  /* 判据 2（行为锁）：在 120Hz 帧间隔下跑真实函数体，链条必须持续。
   * 受控环境：rAF 只登记回调不自动跑；外部按 step 推进 now 驱动。 */
  function runAtHz(hz) {
    const step = 1000 / hz;
    const FRAME_MIN = 1000 / 60;
    let last = 0, _lastDraw = 0, frames = 0, drew = 0;
    let pending = null;
    const raf = (cb) => { pending = cb; frames++; };
    const canvases = []; // 真实函数体对 canvases.forEach 调用；空数组即可
    /* 假元素带真实天体 dataset：period/phase/rx/ry/tilt 与生产 HTML 一致，
     * 否则 Number(undefined) 产出 NaN，会把 left 写成 calc(50% + NaNpx) 假警报。 */
    const bodyEl = {
      style: { left: '', top: '', zIndex: '' },
      dataset: { period: '38000', phase: '1.3', rx: '250', ry: '138', tilt: '27' }
    };
    const markerEl = {
      style: { left: '', top: '', zIndex: '' },
      dataset: { period: '4200', phase: '0' }
    };
    const documentStub = {
      hidden: false,
      querySelectorAll(sel) {
        if (String(sel).indexOf('sm-body') >= 0) return [bodyEl];
        if (String(sel).indexOf('marker') >= 0) return [markerEl];
        return [];
      }
    };
    const offsets = new WeakMap();
    const drawPlanet = () => {};
    const context = vm.createContext({
      requestAnimationFrame: raf, document: documentStub, canvases, offsets,
      _drawPlanetSphere: drawPlanet, FRAME_MIN, Math, Number, String
    });
    /* 包装成具名函数 animate，使函数体内的 requestAnimationFrame(animate) 自引用成立；
     * last/_lastDraw 用 let 声明在同一闭包作用域，保证跨帧可变、与生产一致。 */
    const wrapper = new vm.Script(
      '(function(){let last=0,_lastDraw=0,_smActive=true,_smRafA=0,_smView="phase1";return function animate(now){' + body + '\n};})()'
    ).runInContext(context);
    // 先登记首帧
    wrapper(0);
    let t = 0;
    // 最多推进 60 帧；每次取出 pending 回调并用递增 now 调用
    for (let i = 0; i < 60 && pending; i++) {
      const cb = pending; pending = null;
      t += step;
      cb(t);
    }
    // 天体位置被设置过 = 至少画过一帧（left 形如 calc(50% + ...px)）
    drew = /calc\(50%/.test(bodyEl.style.left) ? frames : 0;
    return { frames, drew, bodyLeft: bodyEl.style.left };
  }

  const hz120 = runAtHz(120);
  check('星图动画：120Hz 下 rAF 链条持续（非 1 帧即死锁）', hz120.frames >= 50,
    'frames=' + hz120.frames);
  check('星图动画：120Hz 下天体位置被真实设置（left=calc(50% + ...)）',
    /calc\(50%/.test(hz120.bodyLeft), 'left=' + JSON.stringify(hz120.bodyLeft));

  const hz60 = runAtHz(60);
  check('星图动画：60Hz 下同样持续调度（未破坏原路径）', hz60.frames >= 50,
    'frames=' + hz60.frames);

  /* 判据 4（行为锁）：active=false 时链条必须真的停下来，不再自调度。 */
  function runInactive() {
    const step = 1000 / 120;
    const FRAME_MIN = 1000 / 60;
    let frames = 0, pending = null;
    const raf = (cb) => { pending = cb; frames++; };
    const canvases = [];
    const bodyEl = { style: { left: '', top: '', zIndex: '' },
      dataset: { period: '38000', phase: '1.3', rx: '250', ry: '138', tilt: '27' } };
    const markerEl = { style: { left: '', top: '', zIndex: '' },
      dataset: { period: '4200', phase: '0' } };
    const documentStub = { hidden: false, querySelectorAll(sel) {
      if (String(sel).indexOf('sm-body') >= 0) return [bodyEl];
      if (String(sel).indexOf('marker') >= 0) return [markerEl];
      return [];
    } };
    const context = vm.createContext({ requestAnimationFrame: raf,
      cancelAnimationFrame: () => { pending = null; },
      document: documentStub,
      canvases, offsets: new WeakMap(), _drawPlanetSphere: () => {},
      FRAME_MIN, Math, Number, String });
    const holder = new vm.Script(
      '(function(){let last=0,_lastDraw=0,_smActive=true,_smRafA=0,_smView="phase1";' +
      'return {fn:function animate(now){' + body + '\n},off:function(){_smActive=false;}};})()'
    ).runInContext(context);
    holder.fn(0);
    const first = frames;
    holder.off();
    const cb = pending; pending = null;
    if (cb) cb(step);
    return { first: first, after: frames, pending: !!pending };
  }
  const idle = runInactive();
  check('星图动画：active 时首帧正常调度', idle.first === 1, 'first=' + idle.first);
  check('星图动画：inactive 后不再自调度（链条真停）', idle.after === 1 && idle.pending === false,
    'after=' + idle.after + ' pending=' + idle.pending);

  /* 判据 3（cache-buster）：改过的 iframe 必须 bump ?v=10，否则玩家拿旧缓存仍坏。 */
  const paneSrc = fs.readFileSync(path.join(ROOT, 'src/ui/render-pane-star-map.js'), 'utf8');
  check('星图动画：iframe 引用已 bump 到 ?v=11',
    paneSrc.indexOf('star-map-frame.html?v=11') >= 0 && paneSrc.indexOf('?v=10') < 0,
    'has v11=' + (paneSrc.indexOf('?v=11') >= 0));
}
