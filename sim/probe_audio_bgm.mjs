/* 探针：BGM 引擎（2026-11-01）
 * 用法：node sim/probe_audio_bgm.mjs     （cwd 必须是仓库根）
 *
 * 为什么要有它：audio.js 是 2026-10-31 从零加的系统，e2e **完全不加载它**
 * （load-sb.mjs 的沙箱没有 window / Audio），所以它此前零覆盖 —— 改了也不知道红绿。
 * 这里用「假 Audio + 假 window」按真实顺序跑它的 IIFE，覆盖四类会静默失效的点：
 *   1. 资源文件真实存在（cfg 里的 file 写错 = 线上 404 静音，e2e 一条也查不出）
 *   2. 自动播放策略（手势前 play() 必被浏览器拒；init 抢播是**真 bug**，2026-11-01 修）
 *   3. 破壳换曲（s.broken 是唯一权威，交叉淡入淡出）
 *   4. 降级（容器无 Audio 构造器时不许把主循环拖崩）
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let fail = 0;
const ok = (name, cond, info) => {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (info !== undefined ? '  ' + info : ''));
  if (!cond) fail++;
};

/* ── 假 Audio：记录 play/pause，暴露 paused / volume / src ── */
let playCalls = 0, pauseCalls = 0;
class FakeAudio {
  constructor() {
    this.loop = false; this.preload = ''; this.volume = 0; this.src = '';
    this._failed = false; this._paused = true; this._lis = {};
  }
  addEventListener(t, f) { (this._lis[t] || (this._lis[t] = [])).push(f); }
  play() { playCalls++; this._paused = false; return Promise.resolve(); }
  pause() { pauseCalls++; this._paused = true; }
  get paused() { return this._paused; }
}

const handlers = {};
globalThis.window = {
  SB,
  Audio: FakeAudio,
  performance: { now: () => Date.now() },
  addEventListener: (t, f) => { (handlers[t] || (handlers[t] = [])).push(f); },
  removeEventListener: (t, f) => { if (handlers[t]) handlers[t] = handlers[t].filter(x => x !== f); }
};

/* ── A. 配置与资源 ── */
console.log('=== A. CFG.AUDIO 与资源文件 ===');
const AUD = SB.CFG && SB.CFG.AUDIO;
ok('CFG.AUDIO 存在且 enabled', !!(AUD && AUD.enabled === true));
const tr = (AUD && AUD.tracks) || {};
ok('两首曲目配置齐全（underIce / firmament）', !!(tr.underIce && tr.firmament),
  Object.keys(tr).join(','));
ok('阶段标注正确（pre / post）', !!(tr.underIce && tr.firmament &&
  tr.underIce.phase === 'pre' && tr.firmament.phase === 'post'),
  tr.underIce ? (tr.underIce.phase + '/' + tr.firmament.phase) : '');
for (const k of Object.keys(tr)) {
  const f = path.resolve(process.cwd(), tr[k].file);
  const exists = fs.existsSync(f);
  const size = exists ? fs.statSync(f).size : 0;
  ok('曲目 ' + k + ' 的音频文件真实存在且 > 1MB', exists && size > 1024 * 1024,
    tr[k].file + (exists ? ' ' + (size / 1048576).toFixed(2) + 'MB' : ' 缺失!'));
}

/* ── B. 加载引擎 ── */
console.log('\n=== B. 引擎加载与导出 ===');
vm.runInThisContext(fs.readFileSync('src/audio.js', 'utf8'), { filename: 'audio.js' });
const A = SB.audio;
ok('SB.audio 已导出', !!A);
ok('导出接口齐全（init/sync/setMuted/setVolume/currentTrack）',
  !!A && ['init', 'sync', 'setMuted', 'setVolume', 'currentTrack'].every(n => typeof A[n] === 'function'),
  A ? Object.keys(A).join(',') : '');

/* 造一局：破壳前 */
const s = SB.state.freshRun(false);
s.broken = false;
s.audioMuted = false;
s.audioVolume = 1;
SB.game = SB.game || {};
SB.game.run = () => s;

/* ── C. 自动播放策略 ── */
console.log('\n=== C. 自动播放策略 ===');
playCalls = 0;
let threw = null;
try { A.init(); } catch (e) { threw = e; }
ok('init() 不抛', threw === null, threw ? String(threw) : 'ok');
/* ⚠️ 这条 2026-11-01 真的抓到过 bug：init 曾调用 sync() ⇒ 无手势上下文里 play() 被拒。 */
ok('★ 手势前未触发 play（init 只预建元素）', playCalls === 0, 'play=' + playCalls);
ok('已挂 pointerdown 手势监听', (handlers.pointerdown || []).length === 1,
  'handlers=' + Object.keys(handlers).join(','));
ok('当前曲目 = 《冰壳之下》（破壳前）',
  !!(A.currentTrack() && A.currentTrack().name === '冰壳之下'),
  A.currentTrack() ? A.currentTrack().name : '');

/* 触发手势 */
try { (handlers.pointerdown[0] || function () {})(); } catch (e) { threw = e; }
ok('手势后触发 play（进入播放上下文）', playCalls >= 1 && threw === null, 'play=' + playCalls);
ok('手势监听已自我注销（一次性）', (handlers.pointerdown || []).length === 0,
  'remain=' + (handlers.pointerdown || []).length);

/* ── D. 破壳换曲 ── */
console.log('\n=== D. 破壳交叉淡入淡出 ===');
s.broken = true;
threw = null;
try { A.sync(); } catch (e) { threw = e; }
ok('破壳后 sync() 不抛', threw === null, threw ? String(threw) : 'ok');
ok('当前曲目切到《向着天穹》',
  !!(A.currentTrack() && A.currentTrack().name === '向着天穹'),
  A.currentTrack() ? A.currentTrack().name : '');

/* ── E. 静音 / 音量 ── */
console.log('\n=== E. 静音与音量 ===');
threw = null;
try { A.setVolume(0.5); A.setMuted(true); A.setMuted(false); A.setVolume(1); } catch (e) { threw = e; }
ok('setVolume / setMuted 不抛', threw === null, threw ? String(threw) : 'ok');
ok('setVolume 回写 s.audioVolume', Math.abs(s.audioVolume - 1) < 1e-9, 'v=' + s.audioVolume);
threw = null;
try { A.setVolume(2.5); } catch (e) { threw = e; }
ok('音量越界被夹到 1（2.5 ⇒ 1）', threw === null && s.audioVolume === 1, 'v=' + s.audioVolume);
threw = null;
try { A.setVolume(-3); } catch (e) { threw = e; }
ok('音量负数被夹到 0', threw === null && s.audioVolume === 0, 'v=' + s.audioVolume);
A.setVolume(1);

/* ── F. 降级：无 Audio 构造器 ── */
console.log('\n=== F. 降级（容器没有 Audio） ===');
const SB2 = { CFG: SB.CFG, state: SB.state, game: SB.game };
const win2 = {
  SB: SB2,
  performance: { now: () => Date.now() },
  addEventListener: () => { throw new Error('不该挂监听'); }
};
const ctx2 = vm.createContext({
  window: win2, performance: { now: () => Date.now() },
  setInterval, clearInterval, Date, Math, parseFloat, isNaN, console
});
threw = null;
try { vm.runInContext(fs.readFileSync('src/audio.js', 'utf8'), ctx2, { filename: 'audio-nodown.js' }); }
catch (e) { threw = e; }
ok('无 Audio 时加载不抛', threw === null, threw ? String(threw) : 'ok');
threw = null;
try { SB2.audio.init(); SB2.audio.sync(); SB2.audio.setVolume(0.3); } catch (e) { threw = e; }
ok('无 Audio 时 init/sync/setVolume 静默降级', threw === null, threw ? String(threw) : 'ok');
ok('无 Audio 时 enabled() === false', SB2.audio.enabled() === false);

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED ' + fail));
process.exitCode = fail ? 1 : 0;
