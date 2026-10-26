/* 排行榜定向探针 —— 覆盖 e2e 没钉的部分
 * 判据来源：MCP create_leaderboard 真实 schema + TapTap 排行榜文档
 * 重点验三件事：① 5 条上限 ② 整数化 ③ 空ID / 无 SDK 时不请求（不假装成功）
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = 'D:/shellbreak';
const files = ['src/config.js', 'src/config-catalog.js', 'src/config-content.js', 'src/config-buildings.js', 'src/rank.js', 'src/state.js', 'src/economy-social.js', 'src/economy.js', 'src/economy-rates.js', 'src/economy-tick.js'];
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); }
}

// ---- 桩环境：模拟 TapTap runtime 的 tap 全局对象 ----
const submitted = [];
let allowTap = true;
let throwOnSubmit = false;

const sandbox = {
  console: { log: () => {}, warn: () => {}, error: () => {} },
  Math, JSON, Date, isFinite, parseInt, parseFloat, Object, Array, Number, String, Boolean, Error,
  setTimeout, clearTimeout,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.location = { search: '' };
if (allowTap) {
  sandbox.tap = {
    getLeaderboardManager() {
      return {
        submitScores({ scores, callback }) {
          if (throwOnSubmit) throw new Error('boom');
          submitted.push(scores.slice());
          if (callback && callback.onSuccess) callback.onSuccess({ ok: 1 });
        },
        openLeaderboard({ leaderboardId, collection, callback }) {
          if (callback && callback.onSuccess) callback.onSuccess();
        }
      };
    }
  };
}
sandbox.SB = { CFG: {} };
vm.createContext(sandbox);

// ---- 加载 config（真实文件）----
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { vm.runInContext(code, sandbox, { filename: f }); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); }
}
const SB = sandbox.SB;
const RANK = SB.CFG.RANK;

check('① CFG.RANK 存在', !!RANK);
check('① CFG.RANK.LB 存在', !!(RANK && RANK.LB));
check('① CFG.RANK.MAP 存在', !!(RANK && RANK.MAP));

// ---- ② MAP 里 9 个指标的参数必须符合平台 enum（单次提交仍最多 5 条）----
const VALID_TYPE = ['numeric', 'time'];
const VALID_ORDER = ['desc', 'asc'];
const VALID_CALC = ['sum', 'best', 'latest'];
const EXPECT_KEYS = ['fastest', 'firstFaith', 'dev', 'wonder', 'cycle', 'star', 'tide', 'dyson', 'void'];
for (const k of EXPECT_KEYS) {
  const m = RANK.MAP[k];
  check(`② MAP.${k} 存在`, !!m, JSON.stringify(m));
  if (!m) continue;
  check(`② ${k}.scoreType 合法`, VALID_TYPE.indexOf(m.scoreType) >= 0, m.scoreType);
  check(`② ${k}.scoreOrder 合法`, VALID_ORDER.indexOf(m.scoreOrder) >= 0, m.scoreOrder);
  check(`② ${k}.calcType 合法`, VALID_CALC.indexOf(m.calcType) >= 0, m.calcType);
}
// 用户拍板：两个时间榜都是 time + asc（越快越靠前）
check('② fastest 是 time+asc', RANK.MAP.fastest.scoreType === 'time' && RANK.MAP.fastest.scoreOrder === 'asc');
check('② firstFaith 是 time+asc', RANK.MAP.firstFaith.scoreType === 'time' && RANK.MAP.firstFaith.scoreOrder === 'asc');
// 累计榜必须 desc（高→低）
for (const k of ['dev', 'wonder', 'cycle', 'star']) {
  check(`② ${k} 是 desc（累计榜高者在前）`, RANK.MAP[k].scoreOrder === 'desc');
}
check('② 共 9 个排行榜指标', EXPECT_KEYS.length === 9, String(EXPECT_KEYS.length));

// ---- ③ 榜 ID 全空 ⇒ 不提交、入口不显示（线上不能"假装成功"）----
/* 2026-10-26 起生产 LB 已在现行主体 996563 上全部重建（旧 963517 的 7 个 ID 作废），
   未回填分支改由夹具复测：先断言生产真值完整，再清空 LB 走「无 ID」路径；
   ④ 段会整体覆写 9 键，无需还原。 */
const LB_PROD = Object.assign({}, RANK.LB);
// 平台真值：2026-10-26 MCP create_leaderboard 返回值 + list_leaderboards 双向核对
const LB_TRUTH = {
  fastest: 'wk8s9lkm23g2eihkz8',
  firstFaith: 'zgq97kctyiqffhcr9p',
  dev: 'riikrs1jp5m6a1nyjy',
  wonder: 'ew5xr8ex1y75ndd9kd',
  cycle: 'dl64gq9ao80hvnn5j8',
  star: '3o19a9rpfhm8bnbe94',
  tide: 'peq757lhctr3dqzx8j',
  dyson: 'bvn169c2u30f2xhmqj',
  void: '6bi4710gm6oswyed0m'
};
check('③ 生产 ID 与平台实读逐字一致',
  EXPECT_KEYS.every(k => LB_PROD[k] === LB_TRUTH[k]),
  JSON.stringify(LB_PROD));
check('③ 回填后 9 个 ID 均为非空串且够长',
  EXPECT_KEYS.every(k => typeof LB_PROD[k] === 'string' && LB_PROD[k].length >= 16),
  JSON.stringify(LB_PROD));
for (const k of EXPECT_KEYS) RANK.LB[k] = '';
check('③ 无 ID 时 readyKeys 为空', SB.rank.readyKeys().length === 0, JSON.stringify(SB.rank.readyKeys()));
check('③ 无 ID 时 missingKeys 列出全部 9 个', SB.rank.missingKeys().length === 9, JSON.stringify(SB.rank.missingKeys()));
check('③ 无 ID 时 available() = false', SB.rank.available() === false);
submitted.length = 0;
SB.rank.submitRun([{ key: 'fastest', value: 100 }, { key: 'dev', value: 5 }]);
check('③ 无 ID 时 submitRun 零请求（尽管有 SDK）', submitted.length === 0, JSON.stringify(submitted));

// ---- ④ 回填 ID 后：正常提交 ----
RANK.LB.fastest = 'lb_fastest';
RANK.LB.firstFaith = 'lb_faith';
RANK.LB.dev = 'lb_dev';
RANK.LB.wonder = 'lb_wonder';
RANK.LB.cycle = 'lb_cycle';
RANK.LB.star = 'lb_star';
RANK.LB.tide = 'lb_tide';
RANK.LB.dyson = 'lb_dyson';
RANK.LB.void = 'lb_void';
check('④ 回填后 readyKeys = 9', SB.rank.readyKeys().length === 9);
check('④ 回填后 missingKeys 为空', SB.rank.missingKeys().length === 0);
check('④ 回填后 available() = true', SB.rank.available() === true);

submitted.length = 0;
let doneCb = null, sentCb = null;
SB.rank.submitRun([
  { key: 'fastest', value: 3600 },
  { key: 'dev', value: 42.7 },
  { key: 'wonder', value: 3 },
  { key: 'cycle', value: 1 }
], function (done, sent) { doneCb = done; sentCb = sent; });
check('④ 提交 1 次调用', submitted.length === 1, String(submitted.length));
check('④ 4 条都在', submitted[0] && submitted[0].length === 4, JSON.stringify(submitted[0]));
check('④ 分数是整数（平台只收 integer）',
  submitted[0].every(x => Number.isInteger(x.score)),
  JSON.stringify(submitted[0].map(x => x.score)));
check('④ 小数向下取整 42.7 → 42', submitted[0].some(x => x.leaderboardId === 'lb_dev' && x.score === 42));
check('④ 榜 ID 映射正确', submitted[0].some(x => x.leaderboardId === 'lb_fastest' && x.score === 3600));
check('④ 回调收到 done=4 sent=4', doneCb === 4 && sentCb === 4, `done=${doneCb} sent=${sentCb}`);

// ---- ⑤ 非法分数必须被剔掉 ----
submitted.length = 0;
let d5 = null;
SB.rank.submitRun([
  { key: 'fastest', value: -1 },      // 负数
  { key: 'dev', value: NaN },// NaN
  { key: 'wonder', value: Infinity }, // 无穷
  { key: 'firstFaith', value: 88.9 }  // 合法
], function (done) { d5 = done; });
check('⑤ 负/NaN/Inf 全部被剔（只留 1 条）', submitted[0] && submitted[0].length === 1, JSON.stringify(submitted[0]));
check('⑤ 只留firstFaith=88', submitted[0] && submitted[0][0].leaderboardId === 'lb_faith' && submitted[0][0].score === 88);
check('⑤ done=1', d5 === 1, String(d5));

// ---- ⑤b truthy 占位值必须被当成「未回填」（2026-10-07 真 bug 的回归钉子）----
// 起因：config 里曾写 `cycle: {}`，而 {} 是 truthy，`if (lb[k])` 会判成「已回填」
//       ⇒ 拿对象当 leaderboardId 发请求 ⇒ 平台报 500001。
//       与广告 SPACE_ID 那次同构。防线是 rank.js 的 idOf() 强制「必须是非空字符串」。
const TRUTHY_JUNK = [{}, [], 0, 12345, true, '0'];
for (const junk of TRUTHY_JUNK) {
  RANK.LB.cycle = junk;
  const rk = SB.rank.readyKeys();
  check(`⑤b 占位 ${JSON.stringify(junk)} 不算已回填`, rk.indexOf('cycle') < 0, JSON.stringify(rk));
  submitted.length = 0;
  SB.rank.submitRun([{ key: 'cycle', value: 5 }]);
  check(`⑤b 占位 ${JSON.stringify(junk)} 零请求`, submitted.length === 0, JSON.stringify(submitted));
}
RANK.LB.cycle = 'lb_cycle';
check('⑤b 换回合法字符串后恢复', SB.rank.readyKeys().indexOf('cycle') >= 0);

// ---- ⑥ 超过 5 条必须被截断（平台上限）----
submitted.length = 0;
SB.rank.submitRun([
  { key: 'fastest', value: 1 }, { key: 'firstFaith', value: 2 }, { key: 'dev', value: 3 },
  { key: 'wonder', value: 4 }, { key: 'cycle', value: 5 }, { key: 'star', value: 6 }
]);
check('⑥ 6 条输入按平台上限截为 5 条', submitted[0].length === 5, String(submitted[0].length));
check('⑥ 截断保留前 5 条，不发第 6 条', !submitted[0].some(x => x.leaderboardId === 'lb_star'));

// ---- ⑦ 异常不崩（回调失败路径）----
throwOnSubmit = true;
let d7 = null, crashed = false;
try { SB.rank.submitRun([{ key: 'dev', value: 1 }], function (done) { d7 = done; }); }
catch (e) { crashed = true; }
check('⑦ submit 抛异常不冒泡到调用方', !crashed);
check('⑦ 异常时 sent=0 但 done=1', d7 === 1, String(d7));
throwOnSubmit = false;

// ---- ⑧ toScore 边界 ----
check('⑧ toScore(3.9)=3', SB.rank.toScore(3.9) === 3);
check('⑧ toScore(0)=null（0 分不发，占榜尾更糟）', SB.rank.toScore(0) === null);
check('⑧ toScore(-0.1)=null', SB.rank.toScore(-0.1) === null);
check('⑧ toScore(null)=null', SB.rank.toScore(null) === null);
check('⑧ toScore(true)=null（布尔不算成绩）', SB.rank.toScore(true) === null);
check('⑧ toScore("12")=12（数字字符串可提交）', SB.rank.toScore('12') === 12);
check('⑧ toScore(undefined)=null', SB.rank.toScore(undefined) === null);

// ---- ⑨ fmtSeconds ----
check('⑨ fmtSeconds(59)="59 秒"', SB.rank.fmtSeconds(59) === '59 秒', SB.rank.fmtSeconds(59));
check('⑨ fmtSeconds(90)="1 分 30 秒"', SB.rank.fmtSeconds(90) === '1 分 30 秒', SB.rank.fmtSeconds(90));
check('⑨ fmtSeconds(3600) 含"小时"', /小时/.test(SB.rank.fmtSeconds(3600)), SB.rank.fmtSeconds(3600));
check('⑨ fmtSeconds(90000) 含"天"', /天/.test(SB.rank.fmtSeconds(90000)), SB.rank.fmtSeconds(90000));
check('⑨ fmtSeconds(-5) 不崩', typeof SB.rank.fmtSeconds(-5) === 'string');

// ---- ⑩ open()：无榜时false，有榜时 true ----
RANK.LB.wonder = ''; delete RANK.LB.cycle;
check('⑩ 仍有榜时 open 成功', SB.rank.open('firstFaith') === true);
check('⑩ 指定了不存在的榜 → 回落到第一个可用榜，仍 true', SB.rank.open('cycle') === true);
// 全清空 ⇒ 必须 false（不能拿空 ID 去开面板）
for (const k of Object.keys(RANK.LB)) RANK.LB[k] = '';
check('⑩ 全部未回填时 open 返回 false', SB.rank.open('firstFaith') === false);
check('⑩ 全部未回填时 available() = false', SB.rank.available() === false);
for (const k of EXPECT_KEYS) RANK.LB[k] = 'lb_' + k;

// ---- ⑪ 静态扫雷：game.js 热路径不得裸引OFFLINE_MIN 等未定义标识符 ----
//起因：首版写成 `wtGap < OFFLINE_MIN * 60`（漏 SB.CFG. 前缀）⇒ e2e 首帧就
//       ReferenceError崩掉（e2e 沙箱里 SB.CFG 未注入全）。回归**不报错**时也测不出，
//       但这次是真崩了 —— 判据改成静态扫 game.js 的 wallT 段。
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
const wallIdx = gameSrc.indexOf('S.wallT +=');
check('⑪ game.js 存在 wallT 累加', wallIdx >= 0);
if (wallIdx >= 0) {
  const raw = gameSrc.slice(Math.max(0, wallIdx - 400), wallIdx + 60);
  // ⛔ 必须先剔掉块注释：这段注释里**故意**提到 OFFLINE_MIN（解释为什么不用它），
  //   直接扫原文会误报。判据只针对可执行代码。
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  check('⑪ wallT 段代码不裸引 OFFLINE_MIN', !/\bOFFLINE_MIN\b/.test(code), code.slice(0, 200));
  check('⑪ wallT 累加用 wall 差值（不吃倍速）', /wall\s*-\s*loop\._wtPrev/.test(code));
  check('⑪ wallT 有 86400 上限守卫', /wtGap\s*<\s*86400/.test(code), code.slice(0, 200));
}
// prestige.js 的两处提交必须都有守卫（`if (SB.game.submitRankOnBreak)`），
// 否则 SB.game 未就绪时会抛错
const preSrc = fs.readFileSync(path.join(ROOT, 'src/prestige.js'), 'utf8');
const guardCount = (preSrc.match(/if \(SB\.game\.submitRankOnBreak\)/g) || []).length;
check('⑪ prestige.js 两处提交都有 SB.game 守卫', guardCount === 2, String(guardCount));

// ⑫ 命名空间防回归：openRankChooser 挂在 SB.ui.render（2026-10-10 真 bug——
// 接线曾误写成 SB.render，运行时 SB.render 为 undefined ⇒ 点排行榜按钮是空操作）。
const renderSrc = fs.readFileSync(path.join(ROOT, 'src/ui/render.js'), 'utf8');
check('⑫ render.js 把 openRankChooser 导出在 SB.ui.render 下',
  /SB\.ui\.render\s*=\s*\{[\s\S]*?openRankChooser\s*:\s*openRankChooser/.test(renderSrc));
check('⑫ game.js 按钮接线用 SB.ui.render.openRankChooser（非 SB.render）',
  /SB\.ui\.render\.openRankChooser/.test(gameSrc) && !/SB\.render\.openRankChooser/.test(gameSrc));

// ⑬ 定期上报：只准碰 4 个数值榜（dev/wonder/cycle/star），时间榜绝不进定期路径
// ——重复提交会用更慢的时间覆盖历史最佳，这是设计红线。
check('⑬ game.js 定义 RANK_PERIOD 与 rankLast',
  /var\s+RANK_PERIOD\s*=\s*5\s*\*\s*60\s*\*\s*1000/.test(gameSrc) && /var\s+rankLast\s*=\s*\{\}/.test(gameSrc));
const perIdx = gameSrc.indexOf('function submitRankPeriodic');
check('⑬ game.js 存在 submitRankPeriodic', perIdx >= 0);
if (perIdx >= 0) {
  const perSrc = gameSrc.slice(perIdx, gameSrc.indexOf('}', gameSrc.indexOf('SB.rank.submitRun', perIdx)) + 1);
  check('⑬ 定期路径含 dev/wonder/cycle/star/tide 五键', ['dev', 'wonder', 'cycle', 'star', 'tide'].every(k => perSrc.includes(`key: '${k}'`)));
  check('⑬ 定期路径绝不报时间榜（fastest/firstFaith）',
    !/key:\s*'(fastest|firstFaith)'/.test(perSrc), perSrc.slice(0, 120));
  check('⑬ 定期上报有 available 守卫', /SB\.rank\.available && SB\.rank\.available\(\)/.test(perSrc));
}
check('⑬ submitRankPeriodic 导出在 SB.game 上', /submitRankPeriodic:\s*submitRankPeriodic/.test(gameSrc));
check('⑬ loop 挂了 _rankWall 墙钟钩子', /loop\._rankWall/.test(gameSrc));
check('⑬ 破壳上报同步记 rankLast（去重共用）', /rankLast\[entries\[i\]\.key\]\s*=\s*Math\.floor\(entries\[i\]\.value\)/.test(gameSrc));

console.log(`\n=== 排行榜探针 ${pass}/${pass + fail} ===`);
if (fails.length) { console.log('FAIL:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('ALL PASS');
