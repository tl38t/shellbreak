/* 用受控的浏览器时钟和可见性事件执行生产星图脚本，覆盖高刷、停用、切视图与恢复。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../load-sb.mjs';

function fixture(script) {
  const pending = new Map(), elements = new Map(), messages = [];
  const stats = { moons: 0, overview: 0, flights: 0 };
  let requestID = 0, now = 0, intersect;
  function element(id) {
    if (!elements.has(id)) {
      const events = {};
      elements.set(id, {
        hidden: false, isConnected: true, dataset: {}, style: {},
        classList: { toggle() {} },
        addEventListener(type, callback) { events[type] = callback; },
        click() { events.click?.(); },
        querySelectorAll: () => []
      });
    }
    return elements.get(id);
  }
  const localMap = element('local-map'), canvas = element('sm-system-canvas');
  const europa = element('sm-europa');
  europa.dataset = { period: '38000', phase: '1.3', rx: '250', ry: '138', tilt: '27' };
  let left = '';
  Object.defineProperty(europa.style, 'left', {
    get: () => left,
    set(value) { left = value; stats.moons++; }
  });
  const gradient = () => ({ addColorStop() {} });
  canvas.getContext = () => new Proxy({
    clearRect() { stats.overview++; },
    quadraticCurveTo() { stats.flights++; },
    createLinearGradient: gradient,
    createRadialGradient: gradient
  }, { get: (target, key) => target[key] || (() => {}) });
  canvas.getBoundingClientRect = () => ({ width: 640, height: 430 });

  const documentEvents = {}, windowEvents = {};
  const document = {
    hidden: false,
    getElementById: element,
    querySelector: selector => selector === '#sm-phase1 .sm-map' ? localMap : null,
    querySelectorAll: selector => selector === '#sm-phase1 .sm-body[data-rx]' ? [europa] : [],
    addEventListener(type, callback) { documentEvents[type] = callback; }
  };
  const host = { postMessage: data => messages.push(data) };
  const window = {
    parent: host,
    addEventListener(type, callback) { windowEvents[type] = callback; }
  };
  vm.runInNewContext(script, {
    window, document,
    IntersectionObserver: class {
      constructor(callback) { intersect = callback; }
      observe() {}
    },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(callback) {
      const id = ++requestID;
      pending.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { pending.delete(id); }
  }, { filename: 'star-map-frame.html' });

  function update(data) { windowEvents.message({ source: host, data }); }
  return {
    stats, pending, europa, messages,
    view: () => window._smGetView(),
    click: id => element(id).click(),
    setActive(active, powerSave = false) { update({ type: 'sb-star-map-active', active, powerSave }); },
    setSails(sunSails, era = 9) {
      update({ type: 'sb-spacecraft', era, sunSails, launchpads: { terra: 1 } });
    },
    setIntersecting(view, visible) {
      const target = view === 'phase2' ? canvas : localMap;
      intersect([{ target, isIntersecting: visible, intersectionRatio: visible ? 0.5 : 0 }]);
    },
    setHidden(hidden) {
      document.hidden = hidden;
      documentEvents.visibilitychange();
    },
    tick(hz, count = 1) {
      for (let i = 0; i < count; i++) {
        now += 1000 / hz;
        for (const id of [...pending.keys()]) {
          const callback = pending.get(id);
          if (!callback) continue;
          pending.delete(id);
          callback(now);
        }
      }
    }
  };
}

export function run({ check }) {
  console.log('\n=== 星图动画启停与高刷回归 ===');
  const source = fs.readFileSync(path.join(ROOT, 'src/ui/star-map-frame.html'), 'utf8');
  const runtime = /<script id="star-map-runtime">([\s\S]*?)<\/script>/.exec(source)?.[1];
  const entry = /<script id="star-map-frame-entry">([\s\S]*?)<\/script>/.exec(source)?.[1];
  check('星图动画：读取生产运行时和 iframe 入口', !!runtime && !!entry);
  if (!runtime || !entry) return;

  const f = fixture(runtime + '\n' + entry);
  f.setIntersecting('phase1', true);
  check('星图动画：iframe 等待宿主启用', f.pending.size === 0 && f.messages[0]?.type === 'sb-star-map-ready');
  f.setActive(true);
  f.tick(120, 120);
  check('星图动画：120Hz 下卫星视图连续绘制并限于 60fps',
    f.pending.size === 1 && f.stats.moons === 60 && f.europa.style.left.startsWith('calc(50%'),
    'draws=' + f.stats.moons);
  const moonDraws = f.stats.moons;
  f.setActive(true, true);
  f.tick(120, 120);
  check('星图动画：切换省电模式后以 30fps 绘制', f.stats.moons - moonDraws === 30);
  const originalRequest = f.pending.keys().next().value;
  for (let i = 0; i < 5; i++) f.setActive(true);
  check('星图动画：重复启用沿用原回调', f.pending.size === 1 && f.pending.has(originalRequest));
  f.setActive(false);
  check('星图动画：切离页签立即取消排帧', f.pending.size === 0);

  f.setActive(true);
  const afterResume = f.stats.moons;
  f.tick(60, 6);
  check('星图动画：切回卫星视图继续绘制', f.stats.moons === afterResume + 6);
  f.setSails(40);
  check('星图动画：解锁总览时取消卫星回调，等待总览画布可见',
    f.view() === 'phase2' && f.pending.size === 0);
  f.setIntersecting('phase2', true);
  f.setSails(40);
  const phase1Draws = f.stats.moons;
  f.tick(60, 6);
  check('星图动画：总览可见时只绘制总览',
    f.pending.size === 1 && f.stats.overview === 6 && f.stats.moons === phase1Draws);

  f.setSails(44);
  f.tick(60);
  check('星图动画：可见时收到新增太阳帆会绘制发射轨迹', f.stats.flights === 1);
  f.setIntersecting('phase2', false);
  check('星图动画：画布滚出视口后立即取消排帧', f.pending.size === 0);
  f.setSails(60);
  f.tick(60, 120);
  const visibilityReports = f.messages.filter(d => d.type === 'sb-star-map-visible').length;
  f.setIntersecting('phase2', true);
  f.setSails(70);
  f.tick(60, 6);
  check('星图动画：滚回时请求当前进度，隐藏期间的发射不补播',
    f.messages.filter(d => d.type === 'sb-star-map-visible').length === visibilityReports + 1 &&
    f.stats.overview === 13 && f.stats.flights === 1);

  f.setHidden(true);
  check('星图动画：文档进入后台后取消排帧', f.pending.size === 0);
  f.setHidden(false);
  check('星图动画：文档恢复时继续绘制总览',
    f.pending.size === 1 && f.pending.values().next().value.name === '_smFrame');
  f.click('sm-crumb-saturn');
  for (let i = 0; i < 5; i++) {
    f.setActive(false);
    f.setActive(true);
  }
  f.setSails(78);
  check('星图动画：反复切页后只保留一个卫星回调，刷新存档时保留视图',
    f.view() === 'phase1' && f.pending.size === 1 && f.pending.values().next().value.name === 'animate');

  const pane = fs.readFileSync(path.join(ROOT, 'src/ui/star-map-iframe.js'), 'utf8');
  const version = Number(/star-map-frame\.html\?v=(\d+)/.exec(pane)?.[1]);
  check('星图动画：iframe 地址带新缓存版本', version >= 11, 'v=' + version);
}
