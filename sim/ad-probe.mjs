/* 广告加速定向探针 —— 覆盖 e2e 没钉的部分
 * 背景：2026-10-07 广告位开通，CFG.AD.SPACE_ID 从 '' 变成 '1054324'（竖屏位）。
 *   SPACE_ID 空/非空 ⇒ ad.js 与 render.js 的判定分支**完全相反**，所以必须重验。
 * 重点验五件事：
 *   ① SPACE_ID 合法且是竖屏位（横屏位填错= 平台拉不到素材）
 *   ② 无 SDK / 无 ID ⇒ **绝不发奖**（这是 P0 白送漏洞，回归测不出）
 *   ③ 只有显式 ?adtest 才走 dev 兜底发奖
 *   ④ isEnded=false（中途退出）⇒ 不发奖
 *   ⑤ 时间银行：封顶 / 开关只冻结不清零 / 倍率=1 的三种态
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = 'D:/shellbreak';
const files = ['src/config.js', 'src/config-content.js', 'src/config-buildings.js', 'src/ad.js'];
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); }
}

// ---- 桩 tap：记录 createRewardedVideoAd 的参数与回调，可手动触发 onClose ----
let created = [];       // { adUnitId, hooks }
let closedWith = null;  // 待触发的 onClose 载荷
let showThrows = false;

function makeTap() {
  return {
    createRewardedVideoAd(opts) {
      const hooks = {};
      created.push({ adUnitId: opts && opts.adUnitId, hooks });
      return {
        onLoad(f) { hooks.onLoad = f; },
        onError(f) { hooks.onError = f; },
        onClose(f) { hooks.onClose = f; },
        load() { return Promise.resolve(); },
        show() {
          if (showThrows) throw new Error('show boom');
          return Promise.resolve();
        }
      };
    }
  };
}

const sandbox = {
  console: { log: () => {}, warn: () => {}, error: () => {} },
  Math, JSON, Date, isFinite, parseInt, parseFloat, Object, Array, Number, String, Boolean, Error,
  setTimeout, clearTimeout,
  location: { search: '' }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.tap = makeTap();
vm.createContext(sandbox);

for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { vm.runInContext(code, sandbox, { filename: f }); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); }
}
const SB = sandbox.SB, AD = SB.CFG.AD;

// ⚠️ 保留原始 game.js 文本，扫雷时用剥注释后的版本（见 ⑨ 的说明）
const gameSrcRaw = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
check('① SPACE_ID 已回填', typeof AD.SPACE_ID === 'string' && AD.SPACE_ID.length > 0, JSON.stringify(AD.SPACE_ID));
check('① SPACE_ID 是纯数字串', /^\d+$/.test(String(AD.SPACE_ID)), AD.SPACE_ID);
check('① 用的是竖屏位 1054324（横屏 1054323 会拉不到素材）', AD.SPACE_ID === '1054324', AD.SPACE_ID);
check('① BOOST_MIN=30', AD.BOOST_MIN === 30, String(AD.BOOST_MIN));
check('① BOOST_CAP_MIN=360', AD.BOOST_CAP_MIN === 360, String(AD.BOOST_CAP_MIN));
check('① MUL=2', AD.MUL === 2, String(AD.MUL));

// ---- ② 生产环境（有 SDK + 有 ID）⇒ available=true，会真的建实例 ----
created.length = 0;
SB.ad._reset();
SB.ad.init();
check('② prod（有 tap + 有 ID）available=true', SB.ad.available() === true);
check('② init 建了激励视频实例', created.length === 1, 'created=' + created.length);
check('② adUnitId 传的就是配置里的 ID', created.length === 1 && created[0].adUnitId === AD.SPACE_ID,
  created.length ? created[0].adUnitId : 'none');
check('② 注册了 onClose（判定是否看完的唯一依据）',
  created.length === 1 && typeof created[0].hooks.onClose === 'function');

// ---- ③ 看完（isEnded=true）⇒ 调onReward ----
let rewarded = 0, skipped = 0, skipReason = null;
SB.ad._reset();
created.length = 0;
SB.ad.init();
SB.ad.show(function () { rewarded++; }, function () { skipped++; });
check('③ show 后挂上了 pending', created.length === 1);
created[0].hooks.onClose({ isEnded: true });
check('③ 看完 ⇒ onReward 触发一次', rewarded === 1, 'rewarded=' + rewarded);
check('③ 看完不触发 onSkip', skipped === 0, 'skipped=' + skipped);

// ---- ④ 中途退出（isEnded=false）⇒ 不发奖 ----
rewarded = 0; skipped = 0;
SB.ad._reset();
created.length = 0;
SB.ad.init();
SB.ad.show(function () { rewarded++; }, function () { skipped++; });
created[0].hooks.onClose({ isEnded: false });
check('④ 中途退出 ⇒ 不发奖', rewarded === 0, 'rewarded=' + rewarded);
check('④ 中途退出 ⇒ 走 onSkip', skipped === 1, 'skipped=' + skipped);

// ---- ④b onClose 载荷为 undefined（老SDK / 异常）⇒ 保守不发奖 ----
rewarded = 0; skipped = 0;
SB.ad._reset();
created.length = 0;
SB.ad.init();
SB.ad.show(function () { rewarded++; }, function () { skipped++; });
created[0].hooks.onClose(undefined);
check('④b onClose 无载荷 ⇒ 不发奖（保守）', rewarded === 0, 'rewarded=' + rewarded);

// ---- ⑤ 无 SDK ⇒ 不发奖，且 available=false（控件隐藏） ----
const realTap = sandbox.tap;
sandbox.tap = undefined;
rewarded = 0; skipped = 0; skipReason = null;
SB.ad._reset();
SB.ad.init();
check('⑤ 无 tap ⇒ available=false（控件隐藏）', SB.ad.available() === false);
SB.ad.show(function () { rewarded++; }, function (r) { skipped++; skipReason = r; });
check('⑤ 无 tap ⇒ 不发奖（P0 白送漏洞）', rewarded === 0, 'rewarded=' + rewarded);
check('⑤ 无 tap ⇒ onSkip 一次且 reason="unavailable"', skipped === 1 && skipReason === 'unavailable',
  'skipped=' + skipped + ' reason=' + skipReason);
sandbox.tap = realTap;

// ---- ⑥ show 抛异常 ⇒ 不发奖 ----
showThrows = true;
rewarded = 0; skipped = 0;
SB.ad._reset();
SB.ad.init();
SB.ad.show(function () { rewarded++; }, function () { skipped++; });
check('⑥ show 抛异常 ⇒ 不发奖', rewarded === 0, 'rewarded=' + rewarded);
showThrows = false;

// ---- ⑦ dev 兜底只在显式 ?adtest ----
sandbox.location.search = '';
rewarded = 0;
SB.ad._reset();
SB.ad.show(function () { rewarded++; }, function () {});
check('⑦ 无 ?adtest（prod）⇒ 不发奖', rewarded === 0, 'rewarded=' + rewarded);
check('⑦ 无 ?adtest ⇒ devMode=false', SB.ad.devMode() === false);
check('⑦ 无 ?adtest ⇒ available 仍按SDK/ID 判（有则 true）', SB.ad.available() === true);

// ---- ⑦b 白送漏洞回归：devMode 必须是 `adtest` **整词** ----
// 曾经的 bug：正则写成 /[?&]ad(test)?\b/i，`test` 可选 ⇒ `?ad` / `?add` 也命中
//            ⇒ 玩家随便加个 query 就能白拿 30min 2×。这里逐个钉死。
// 口径（2026-10-07 定死）：**只认裸 flag** `?adtest` / `?a=1&adtest`。
// 任何带值形式（`?adtest=0` / `?adtest=1` / `?adtest=false`）一律算**关闭** ——
// 最严的一侧，不给「=1也能开」留绕路。
const notDev = ['', '?', '?a', '?ad', '?add', '?admin', '?adx', '?x=ad', '?myadtest',
  '?adtest=0', '?adtest=1', '?adtest=false', '?x=1&adtest=0', '?ADTEST', '?adtesting',
  '?x=1&add', '?x=adtest'];
for (const q of notDev) {
  sandbox.location.search = q;
  check('⑦b 非 dev 查询串不应进devMode：' + JSON.stringify(q), SB.ad.devMode() === false,
    'devMode=' + SB.ad.devMode());
}
const isDev = ['?adtest', '?x=1&adtest', '?a=1&adtest', '?a=1&adtest&b=2'];
for (const q of isDev) {
  sandbox.location.search = q;
  check('⑦b 应进 devMode：' + JSON.stringify(q), SB.ad.devMode() === true,
    'devMode=' + SB.ad.devMode());
}
// 且确认这些非 dev 查询串在 prod 下真的不发奖
for (const q of ['?ad', '?add', '?admin']) {
  sandbox.location.search = q;
  rewarded = 0;
  SB.ad._reset();
  SB.ad.show(function () { rewarded++; }, function () {});
  check('⑦b ' + JSON.stringify(q) + ' ⇒ 不发奖', rewarded === 0, 'rewarded=' + rewarded);
}

sandbox.location.search = '?adtest';
rewarded = 0;
SB.ad._reset();
check('⑦ 带 ?adtest ⇒ devMode=true', SB.ad.devMode() === true);
check('⑦ 带 ?adtest ⇒ available=true（本地可调试）', SB.ad.available() === true);
SB.ad.show(function () { rewarded++; }, function () {});
check('⑦ 带 ?adtest ⇒ 直接发奖一次', rewarded === 1, 'rewarded=' + rewarded);
sandbox.location.search = '';

// ---- ⑧ 时间银行：复刻 game.js 的 grantAdBoost / adMul 语义 ----
function grantAdBoost(S, C) {
  if (!S.ad) S.ad = { ms: 0, on: true };
  const cap = (C.BOOST_CAP_MIN || 360) * 60000;
  const add = (C.BOOST_MIN || 30) * 60000;
  S.ad.ms = Math.min(cap, S.ad.ms + add);
  S.ad.on = true;
}
function adMulOf(S, C) {
  return (S && S.ad && S.ad.on && S.ad.ms > 0) ? (C.MUL || 2) : 1;
}
const S0 = { ad: { ms: 0, on: true } };
grantAdBoost(S0, AD);
check('⑧ 一次 +30min', S0.ad.ms === 30 * 60000, String(S0.ad.ms));
check('⑧ 发完自动打开开关', S0.ad.on === true);
check('⑧ 有余额且开着 ⇒ 倍率 2', adMulOf(S0, AD) === 2, String(adMulOf(S0, AD)));

S0.ad.on = false;
check('⑧ 关开关⇒ 倍率回1', adMulOf(S0, AD) === 1);
check('⑧ 关开关不 清零余额（只冻结）', S0.ad.ms === 30 * 60000, String(S0.ad.ms));
S0.ad.on = true;

const S1 = { ad: { ms: 0, on: true } };
for (let i = 0; i < 20; i++) grantAdBoost(S1, AD);
check('⑧ 囤到上限 ⇒ 封顶 6h', S1.ad.ms === 360 * 60000, String(S1.ad.ms / 60000) + 'min');

const S2 = { ad: { ms: 500, on: true } };
check('⑧余额>0 但极小 ⇒ 仍算2×', adMulOf(S2, AD) === 2);
S2.ad.ms = 0;
check('⑧ 余额=0 ⇒ 倍率 1', adMulOf(S2, AD) === 1);

// ---- ⑨ 静态扫雷：源码里的老口径不能残留 ----
// ⚠️ 必须**先剥注释**再扫：game.js:694 那行注释里就写着
//   「原先这里有 `if (!SB.ad) grantAdBoost()` 的兜底 … 已删」——
//   直接对原文 grep 会命中这条记录本身，表现为「兜底还在」的误报。
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 块注释
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')) // 行注释（不碰 URL里的 //）
    .join('\n');
}
const adSrc = fs.readFileSync(path.join(ROOT, 'src/ad.js'), 'utf8');
const cfgSrc = stripComments(fs.readFileSync(path.join(ROOT, 'src/config.js'), 'utf8'));
const gameCode = stripComments(gameSrcRaw);
const adCode = stripComments(adSrc);

check('⑨ game.js 里没有「无广告模块也发奖」的兜底',
  !/if\s*\(\s*!\s*SB\.ad\s*\)\s*grantAdBoost\s*\(/.test(gameCode));
check('⑨ game.js 里grantAdBoost 只有 1 个真实调用点（广告奖励回调）',
  (gameCode.match(/grantAdBoost\s*\(\s*\)/g) || []).length === 2, // 1 处定义 + 1 处调用
  'count=' + (gameCode.match(/grantAdBoost\s*\(\s*\)/g) || []).length);
check('⑨ config 里没有把 SPACE_ID 写回空串的分支',
  !/SPACE_ID\s*[:=]\s*''/.test(cfgSrc));
check('⑨ ad.js 生产路径没有直接调 onReward 的兜底（只有 devMode 分支）',
  (adCode.match(/onReward\s*\(\s*\)/g) || []).length === 2, // pending 回调一处 + devMode 一处
  'count=' + (adCode.match(/onReward\s*\(\s*\)/g) || []).length);
check('⑨ devMode 判断读的是 location.search（不是把 ?adtest 当字面量硬编码）',
  /location\.search/.test(adCode) || /root\.location/.test(adCode));

console.log('');
if (fail === 0) {
  console.log(`=== 广告探针 ${pass}/${pass + fail} 全绿 ===`);
} else {
  console.log(`=== 广告探针 ${pass}/${pass + fail}，${fail} 项红 ===`);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
}
