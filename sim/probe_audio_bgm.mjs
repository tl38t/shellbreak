/* 探针：BGM 引擎（2026-11-01 建 / 2026-11-07 重写）
 * 用法：node sim/probe_audio_bgm.mjs     （cwd 必须是仓库根）
 *
 * 为什么要有它：audio.js 是 2026-10-31 从零加的系统，e2e **完全不加载它**
 * （load-sb.mjs 的沙箱没有 window / Audio），所以它此前零覆盖 —— 改了也不知道红绿。
 * 这里用「假 Audio + 假 window」按真实顺序跑它的 IIFE。
 *
 * ⚠️ 2026-11-07 重写的直接原因：旧版 D 段「破壳换曲」只断言 currentTrack() 的返回值
 * （纯函数按 s.broken 算），全绿却完全测不到「全仓库没有 audio.sync() 调用」这个真 bug
 * ⇒ 玩家报「第一首切第二首要重开游戏」。现在 D/E 段一律检查真实 Audio 元素的
 * play / paused / volume，并加 H 段静态锁钉死驱动点。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let fail = 0;
const ok = (name, cond, info) => {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (info !== undefined ? '  ' + info : ''));
  if (!cond) fail++;
};
const AUD = SB.CFG && SB.CFG.AUDIO;

/* ⚠️ 音频文案的 i18n 判据（2026-11-07 二次修订）：
 * 词库 js 是 scripts/export_i18n_runtime.py 从「文案底表 xlsx」生成的产物，
 * 只在 js 里手加 key 会被下一次导出整体覆盖（本项目实测过一次，假绿两周）。
 * 现行实现走的是**正路**：曲名 / 段名 / 下拉文案全部登记进主表，再由导出脚本生成双语词库，
 * game.js 用 gameText(key, null, 中文兜底) 读取。所以防回归要锁的是
 * 「key 是否同时在主表 xlsx + 中英两份导出词库里」，而不是「有没有绕开词库」。
 * 下面直接读 xlsx 内部 sheet1.xml（极简 ZIP 读取器，不引第三方依赖）。 */
const AUDIO_I18N_KEYS = [
  'game.audio.phase.era_1_4', 'game.audio.phase.era_5_7', 'game.audio.phase.era_8_10',
  'game.audio.track_select.auto', 'game.audio.track_select.label',
  'game.audio.track_select.manual_lock', 'game.audio.now_playing',
  'game.audio.track_not_configured', 'music.artist.baijing_ensemble',
  'music.track.under_the_ice.title', 'music.track.toward_the_firmament.title',
  'music.track.glance_to_the_stars.title', 'music.track.waltz_among_the_stars.title',
  'music.track.celestial_game.title', 'music.track.age_of_radiance.title'
];
const MASTER_XLSX = 'outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx';
function zipEntryText(buf, want) {
  let off = 0;
  while (off + 30 <= buf.length) {
    if (buf.readUInt32LE(off) !== 0x04034b50) break;
    const method = buf.readUInt16LE(off + 8), csize = buf.readUInt32LE(off + 18);
    const nlen = buf.readUInt16LE(off + 26), elen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf8', off + 30, off + 30 + nlen);
    const ds = off + 30 + nlen + elen;
    if (name === want) {
      const raw = buf.subarray(ds, ds + csize);
      return method === 0 ? raw.toString('utf8') : zlib.inflateRawSync(raw).toString('utf8');
    }
    off = ds + csize;
  }
  return '';
}
const masterXml = (() => {
  try { return zipEntryText(fs.readFileSync(MASTER_XLSX), 'xl/worksheets/sheet1.xml'); }
  catch (e) { return ''; }
})();
const zhDict = fs.readFileSync('src/locales/zh-CN.js', 'utf8');
const enDict = fs.readFileSync('electron/locales/en-US.js', 'utf8');
const keyRegistered = k => masterXml.includes(k) && zhDict.includes('"' + k + '"') && enDict.includes('"' + k + '"');

/* ── 假 Audio：记录 play/pause，暴露 paused / volume / src / ended ── */
function mkHarness(opts = {}) {
  const els = [];
  const handlers = {};
  const state = { blocked: !!opts.blocked };
  class FakeAudio {
    constructor() {
      this.loop = true; this.preload = ''; this.volume = 0; this.src = '';
      this._failed = false; this._paused = true; this.ended = false;
      this.currentTime = 0; this.duration = 300;
      this._lis = {}; this.plays = 0; this.pauses = 0;
      els.push(this);
    }
    addEventListener(t, f) { (this._lis[t] || (this._lis[t] = [])).push(f); }
    dispatch(t) { (this._lis[t] || []).forEach(f => f()); }
    play() {
      this.plays++;
      if (state.blocked) return Promise.reject(new Error('NotAllowedError')); // 被 catch(noop) 吞掉
      this._paused = false; this.ended = false; return Promise.resolve();
    }
    pause() { this.pauses++; this._paused = true; }
    get paused() { return this._paused; }
  }
  globalThis.window = {
    SB,
    Audio: FakeAudio,
    performance: { now: () => Date.now() },
    addEventListener: (t, f) => { (handlers[t] || (handlers[t] = [])).push(f); },
    removeEventListener: (t, f) => { if (handlers[t]) handlers[t] = handlers[t].filter(x => x !== f); }
  };
  vm.runInThisContext(fs.readFileSync('src/audio.js', 'utf8'), { filename: 'audio.js' });
  const s = SB.state.freshRun(false);
  s.era = 1; s.broken = false; s.audioMuted = false; s.audioVolume = 1;
  SB.game = { run: () => s };
  SB.audio.init();
  return { SB, s, els, handlers, state, A: SB.audio, fire: () => (handlers.pointerdown[0] || (() => {}))() };
}
const elFor = (h, id) => {
  const f = AUD.tracks[id] && AUD.tracks[id].file;
  return h.els.find(e => e.src === f);
};
const poolOf = (id) => (AUD.pools || []).find(p => p.tracks.indexOf(id) >= 0);
const waitFade = () => new Promise(r => setTimeout(r, 60)); // AUD.crossfadeMs 在 B 段后调成 20

/* ── A. 配置与资源 ── */
console.log('=== A. CFG.AUDIO 与资源文件 ===');
ok('CFG.AUDIO 存在且 enabled', !!(AUD && AUD.enabled === true));
const pools = (AUD && AUD.pools) || [];
ok('三段纪元池齐全', pools.length === 3, pools.map(p => p.id).join(','));
const covered = pools.flatMap(p => p.eras || []);
ok('pools 恰好覆盖 era 1..10 且无重叠',
  covered.length === 10 && [1,2,3,4,5,6,7,8,9,10].every(e => covered.filter(x => x === e).length === 1),
  covered.join(','));
ok('每池两首、曲目 id 都在 tracks 里',
  pools.every(p => p.tracks.length === 2 && p.tracks.every(t => !!(AUD.tracks && AUD.tracks[t]))));
ok('六首曲目配置齐全', !!(AUD && AUD.tracks && Object.keys(AUD.tracks).length === 6),
  AUD ? Object.keys(AUD.tracks).join(',') : '');
ok('★ 05 用专门的 Loop 轨（不是含引子/尾巴的完整曲）',
  /loop/.test(AUD.tracks.celestial.file), AUD.tracks.celestial.file);
for (const k of Object.keys(AUD.tracks || {})) {
  const f = path.resolve(process.cwd(), AUD.tracks[k].file);
  const exists = fs.existsSync(f);
  const size = exists ? fs.statSync(f).size : 0;
  ok('曲目 ' + k + ' 文件真实存在且 > 1MB', exists && size > 1024 * 1024,
    AUD.tracks[k].file + (exists ? ' ' + (size / 1048576).toFixed(2) + 'MB' : ' 缺失!'));
}
ok('三段池都有中文段名 + 对应 i18n 段名 key（主表登记，导出不会冲掉）',
  pools.every(p => typeof p.label === 'string' && !!p.label) &&
  ['game.audio.phase.era_1_4', 'game.audio.phase.era_5_7', 'game.audio.phase.era_8_10'].every(keyRegistered));
const gameRawEarly = fs.readFileSync('src/game.js', 'utf8');
ok('面板段名走 i18n key 且带中文兜底（词库须由主表导出，不许手改 js 加 key）',
  /game\.audio\.phase\.era_1_4/.test(gameRawEarly) &&
  /gameText\(keys\[pool\.id\], null, pool\.label\)/.test(gameRawEarly));

/* ── B. 加载引擎 ── */
console.log('\n=== B. 引擎加载与导出 ===');
const h = mkHarness();
ok('SB.audio 已导出', !!h.A);
ok('导出接口齐全（init/sync/setMuted/setVolume/setTrack/manualTrack/currentTrack/currentPool）',
  ['init', 'sync', 'setMuted', 'setVolume', 'setTrack', 'manualTrack', 'currentTrack', 'currentPool'].every(n => typeof h.A[n] === 'function'),
  h.A ? Object.keys(h.A).join(',') : '');
AUD.crossfadeMs = 20;   // 加速淡变，避免探针等 800ms × N

/* ── C. 自动播放策略 ── */
console.log('\n=== C. 手势前不起播 ===');
let threw = null;
try { h.A.sync(); } catch (e) { threw = e; }
ok('init() + 一次 sync() 不抛', threw === null, threw ? String(threw) : 'ok');
ok('★ 手势前未触发 play（init 只预建元素）', h.els.every(e => e.plays === 0),
  'play=' + h.els.reduce((n, e) => n + e.plays, 0));
ok('已挂常驻 pointerdown / keydown / touchstart',
  ['pointerdown', 'keydown', 'touchstart'].every(t => (h.handlers[t] || []).length === 1),
  'handlers=' + Object.keys(h.handlers).join(','));
const first = h.A.currentTrack();
ok('开局曲目属于 era1 池（under_ice）',
  !!first && !!poolOf(first.id) && poolOf(first.id).id === 'under_ice', first ? first.id : 'null');

/* ── D. 手势后起播 ── */
console.log('\n=== D. 首次手势起播 ===');
h.fire();
const firstEl = elFor(h, first.id);
ok('手势后该曲 play() 被调', !!firstEl && firstEl.plays >= 1,
  firstEl ? 'play=' + firstEl.plays : 'el 缺失');
ok('★ 手势监听常驻（不自我注销）', (h.handlers.pointerdown || []).length === 1,
  'remain=' + (h.handlers.pointerdown || []).length);
await waitFade();
ok('淡变完成后该曲出声（paused=false, volume≈1）',
  !!firstEl && !firstEl.paused && Math.abs(firstEl.volume - 1) < 0.02,
  firstEl ? 'v=' + firstEl.volume.toFixed(2) : '');

/* ── E. 跨段换曲：检查真实元素，不再只信 currentTrack() ── */
console.log('\n=== E. 跨纪元段换曲（真断言） ===');
h.s.era = 5;
threw = null;
try { h.A.sync(); } catch (e) { threw = e; }
ok('era 1→5 sync() 不抛', threw === null, threw ? String(threw) : 'ok');
const mid = h.A.currentTrack();
ok('currentTrack() 落到 era5-7 池', !!mid && poolOf(mid.id).id === 'first_stars', mid ? mid.id : 'null');
const midEl = elFor(h, mid.id);
ok('★ 新曲元素真的被 play()（不是只改文案）', !!midEl && midEl.plays >= 1,
  midEl ? 'play=' + midEl.plays : 'el 缺失');
await waitFade();
ok('★ 旧曲已 pause 且音量归零（不会两首同时响）',
  !!firstEl && firstEl.paused && firstEl.volume === 0,
  firstEl ? 'paused=' + firstEl.paused + ' v=' + firstEl.volume : '');
ok('★ 新曲淡变后出声', !!midEl && !midEl.paused && Math.abs(midEl.volume - 1) < 0.02,
  midEl ? 'v=' + midEl.volume.toFixed(2) : '');

h.s.era = 8;
h.A.sync();
const late = h.A.currentTrack();
const lateEl = elFor(h, late.id);
ok('era 5→8 再换到 era8-10 池', !!late && poolOf(late.id).id === 'star_sea', late ? late.id : 'null');
ok('era8 新曲真的被 play()', !!lateEl && lateEl.plays >= 1, lateEl ? 'play=' + lateEl.plays : '');
await waitFade();

/* 破壳不再单独换曲（2026-11-07 定案 A）：broken 变 true 但 era 没动 ⇒ 曲目不动 */
h.s.broken = true;
const beforeBreak = h.A.currentTrack().id;
h.A.sync();
ok('★ s.broken 变 true 但 era 不变 ⇒ 不换曲（破壳不再是音乐分界）',
  h.A.currentTrack().id === beforeBreak, beforeBreak);

/* ── F. 池内 shuffle ── */
console.log('\n=== F. 池内播完轮换 ===');
const beforeEnd = h.A.currentTrack().id;
const curEl = elFor(h, beforeEnd);
curEl.ended = true;
curEl.dispatch('ended');
const afterEnd = h.A.currentTrack().id;
ok('★ ended 事件换到同池另一首', afterEnd !== beforeEnd && poolOf(afterEnd).id === poolOf(beforeEnd).id,
  beforeEnd + ' -> ' + afterEnd);
ok('换到的新曲被 play()', (elFor(h, afterEnd) || {}).plays >= 1);
/* 后台节流吞掉 ended 时，sync() 用 currentTime/duration 补刀 */
const late2 = elFor(h, afterEnd);
late2.ended = false; late2.currentTime = late2.duration;
h.A.sync();
ok('★ ended 被吞时 sync() 也能补刀换曲', h.A.currentTrack().id !== afterEnd,
  afterEnd + ' -> ' + h.A.currentTrack().id);

/* ── G. 静音 / 音量 ── */
console.log('\n=== G. 静音与音量 ===');
threw = null;
try { h.A.setVolume(0.5); h.A.setMuted(true); h.A.setMuted(false); h.A.setVolume(1); } catch (e) { threw = e; }
ok('setVolume / setMuted 不抛', threw === null, threw ? String(threw) : 'ok');
ok('setVolume 回写 s.audioVolume', Math.abs(h.s.audioVolume - 1) < 1e-9, 'v=' + h.s.audioVolume);
h.A.setVolume(2.5);
ok('音量越界被夹到 1（2.5 ⇒ 1）', h.s.audioVolume === 1, 'v=' + h.s.audioVolume);
h.A.setVolume(-3);
ok('音量负数被夹到 0', h.s.audioVolume === 0, 'v=' + h.s.audioVolume);
h.A.setVolume(1);

/* ── H. 静态锁：驱动点、shuffle 机制、常驻手势 ── */
console.log('\n=== H. 静态锁（防「漏接驱动」回归） ===');
const strip = txt => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const gj = strip(fs.readFileSync('src/game.js', 'utf8'));
ok('★ game.js 的 renderAll() 里真的调了 SB.audio.sync()',
  /function renderAll\(\)\s*\{[\s\S]*?SB\.audio\.sync\(\)/.test(gj));
const aj = strip(fs.readFileSync('src/audio.js', 'utf8'));
ok('audio.js 关掉 el.loop 并监听 ended（shuffle 必需）',
  /el\.loop\s*=\s*false/.test(aj) && /addEventListener\('ended'/.test(aj));
ok('★ 手势监听常驻（源码里没有 removeEventListener）', !/removeEventListener/.test(aj));
ok('淡变定时器拆成两支（fadeTimer / gainTimer 互不 clear）',
  /clearFade\(\)/.test(aj) && /clearGain\(\)/.test(aj) && /function rampGain\(\)[\s\S]*?if \(fadeTimer\) return;/.test(aj));

/* ── I. play() 被拒后的重试通道 ── */
console.log('\n=== I. 自动播放策略拒播后的自愈 ===');
const b = mkHarness({ blocked: true });
b.state.blocked = false;         // 首次手势允许起播
b.fire();
await waitFade();
const bFirst = b.A.currentTrack().id;
b.state.blocked = true;          // 跨段这次 play 被拒
b.s.era = 5;
b.A.sync();
const bMidEl = elFor(b, b.A.currentTrack().id);
ok('跨段 play() 被拒后元素仍 paused（复现旧 bug）', !!bMidEl && bMidEl.paused, 'paused=' + (bMidEl && bMidEl.paused));
b.state.blocked = false;
b.fire();                        // 常驻手势监听还在 ⇒ 有重试通道
ok('★ 后续手势重试 play() 成功', !!bMidEl && bMidEl.plays >= 2 && !bMidEl.paused,
  bMidEl ? 'play=' + bMidEl.plays + ' paused=' + bMidEl.paused : '');

/* ── K. 手动选曲（优先级高于一切自动切歌，2026-11-07 用户拍板） ── */
console.log('\n=== K. 手动锁定：跨段 / 破壳 / 播完 / nearEnd 全部短路 ===');
const k = mkHarness();
k.fire();
await waitFade();
const kFirst = k.A.currentTrack().id;
const norm = k.A.setTrack('radiance');     // era1 却锁 era8 的曲
ok('setTrack() 归一化返回曲目 id 并写回 s.audioTrack',
  norm === 'radiance' && k.s.audioTrack === 'radiance', 'ret=' + norm);
ok('manualTrack() 与引擎口径一致', k.A.manualTrack() === 'radiance');
ok('★ 锁定曲真的被 play()（不是只改文案）', (elFor(k, 'radiance') || {}).plays >= 1,
  (elFor(k, 'radiance') || {}).plays);
await waitFade();
ok('★ 锁定曲淡变后出声', (() => { const e = elFor(k, 'radiance'); return !!e && !e.paused && Math.abs(e.volume - 1) < 0.02; })());
ok('★ 锁定曲用原生 loop=true 单曲循环', elFor(k, 'radiance').loop === true);
ok('锁定后 currentTrack() 是锁定曲（跨池也不纠正）', k.A.currentTrack().id === 'radiance',
  kFirst + ' -> ' + k.A.currentTrack().id);

k.s.era = 5; k.A.sync();
ok('★ era 1→5 不换曲（自动跨段被短路）', k.A.currentTrack().id === 'radiance');
k.s.era = 8; k.A.sync();
ok('★ era 5→8 不换曲', k.A.currentTrack().id === 'radiance');
k.s.broken = true; k.A.sync();
ok('★ 破壳不换曲', k.A.currentTrack().id === 'radiance');

const kEl = elFor(k, 'radiance');
kEl.currentTime = kEl.duration;            // nearEnd 兜底本该触发换曲
k.A.sync();
ok('★ nearEnd 补刀不换曲', k.A.currentTrack().id === 'radiance');
kEl.dispatch('ended');                     // 部分 WebView 仍会发 ended
ok('★ ended 事件不换曲（原地重播）', k.A.currentTrack().id === 'radiance' && kEl.currentTime === 0);
ok('手动态 setVolume 不抛且不换曲', (() => {
  try { k.A.setVolume(0.4); k.A.setVolume(1); } catch (e) { return false; }
  return k.A.currentTrack().id === 'radiance';
})());

/* 改回自动：立即交叉淡变回当前纪元池（era8 → star_sea），且所有 loop 复位 */
const backNorm = k.A.setTrack('');
ok('setTrack(\'\') 归一化成自动且 manualTrack() 为空', backNorm === '' && k.A.manualTrack() === null);
const kBack = k.A.currentTrack().id;
ok('★ 改回自动立即淡变回当前纪元池', kBack !== 'radiance' && poolOf(kBack).id === 'star_sea',
  'radiance -> ' + kBack);
ok('★ 离开手动态后所有元素 loop 复位（自动 shuffle 不会悄悄死）',
  k.els.every(e => e.loop === false), k.els.map(e => e.loop).join(','));
ok('回自动后新曲真的被 play()', (elFor(k, kBack) || {}).plays >= 1);
k.s.era = 1; k.A.sync();
ok('★ 恢复自动后跨段换池重新生效', poolOf(k.A.currentTrack().id).id === 'under_ice',
  k.A.currentTrack().id);

/* 白名单：脏存档 / 原型链 key / 'auto' 一律降级为自动，绝不污染 activeId */
ok('★ 非法曲目 id 降级为自动（不污染 activeId）',
  k.A.setTrack('__proto__') === '' && k.A.setTrack('constructor') === '' &&
  k.A.setTrack('no-such-track') === '' && k.A.setTrack('auto') === '' &&
  k.A.manualTrack() === null && !!k.A.currentTrack());
ok('★ 直接把脏值塞进 s.audioTrack 也降级为自动', (() => {
  k.s.audioTrack = '__proto__';
  const before = k.A.currentTrack();
  k.A.sync();
  return k.A.manualTrack() === null && !!before;
})());

/* 静态锁：存档白名单 / 面板接线 / 词库防护 / 增量更新 */
console.log('\n=== L. 手动选曲静态锁 ===');
const st = strip(fs.readFileSync('src/state.js', 'utf8'));
const idx = fs.readFileSync('index.html', 'utf8');
ok('★ freshRun 基础表登记 audioTrack（否则 migrateRun 白名单会丢读档值）',
  /audioTrack\s*:\s*''/.test(st) && /function freshRun\([\s\S]*?audioTrack\s*:\s*''/.test(st));
ok('★ game.js 的 applyAudioPref / setAudioPref 接通两层模型',
  /function applyAudioPref\(s\)[\s\S]*?audioTrack\s*=\s*audioTrackPref\(\)/.test(gj) &&
  /function setAudioPref\(\)[\s\S]*?meta\.audioTrack\s*=/.test(gj));
ok('★ game.js 绑了下拉 onchange 并调 audio.setTrack',
  /sel\.onchange\s*=[\s\S]*?SB\.audio\.setTrack/.test(gj));
ok('★ game.js 的 syncAudioSetting 里调 syncAudioTrackSelect',
  /function syncAudioSetting\(\)[\s\S]*?syncAudioTrackSelect\(\)/.test(gj));
ok('★ 语言切换时重刷音频段（否则被 i18n.apply 覆盖成 Loading…）',
  /addEventListener\('shellbreak:locale-changed'[\s\S]{0,120}syncAudioSetting\(\)/.test(gj));
ok('★ audio.js 的 sync() 顶部有手动短路',
  /function sync\(\)[\s\S]*?var m = manualId\(\);[\s\S]*?if \(m\)/.test(aj));
ok('★ audio.js 离开手动态会复位 loop',
  /els\[rk\]\.loop = false/.test(aj) && /toEl\.loop = \(manualId\(\) === id\)/.test(aj));
ok('★ 手动锁定段名走 i18n key + 中文兜底，且主表已登记',
  /gameText\('game\.audio\.track_select\.manual_lock', null, '手动锁定'\)/.test(gj) &&
  masterXml.includes('game.audio.track_select.manual_lock'));
ok('★ select 自身不带 data-i18n（只带 aria-label 变体，option 由 JS 建）',
  /id="audioTrackSelect"/.test(idx) &&
  !/id="audioTrackSelect"[^>]*\sdata-i18n\s*=/.test(idx) && /autoOpt\.textContent\s*=/.test(gj));
ok('★ 下拉结构静态、只允许增量更新（无 innerHTML 重建）',
  !/audioTrackSelect[\s\S]{0,120}innerHTML/.test(gj) && /sel\.options\[0\]\.textContent/.test(gj));
ok('★ 音频 15 个 i18n key 全在「主表 xlsx + 中英词库」（防导出覆盖）',
  AUDIO_I18N_KEYS.every(keyRegistered), AUDIO_I18N_KEYS.length + ' 个 key');
const qv = f => {
  const m = idx.match(new RegExp('src/' + f.replace(/\./g, '\\.') + '\\?v=(\\d+)'));
  return m ? Number(m[1]) : 0;
};
ok('★ 四个改动 js 的 ?v 已 bump（>= 基线，允许后续继续 bump）',
  qv('config.js') >= 226 && qv('state.js') >= 179 &&
  qv('audio.js') >= 3 && qv('game.js') >= 192,
  ['config.js', 'state.js', 'audio.js', 'game.js'].map(f => f + '=' + qv(f)).join(' '));

/* ── J. 降级：无 Audio 构造器 ── */
console.log('\n=== J. 降级（容器没有 Audio） ===');
const SB2 = { CFG: SB.CFG, state: SB.state, game: SB.game };
const win2 = { SB: SB2, performance: { now: () => Date.now() }, addEventListener: () => { throw new Error('不该挂监听'); } };
const ctx2 = vm.createContext({
  window: win2, performance: { now: () => Date.now() },
  setInterval, clearInterval, Date, Math, parseFloat, isNaN, console, Object
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
