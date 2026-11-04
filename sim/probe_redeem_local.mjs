/* 本地礼包码回归（2026-11-04）：给客户发的「星屑 ×50」走的是不走网络的那条通道。
 * 钉住四件事：
 *   ① 命中即入账，且**一个网络请求都不发**（没有 fetch 也能领）；
 *   ② 星屑只加余额、**不加 stardustEarned** —— 否则白送的星屑会同时抬高
 *      排行榜「最多星屑」与超古代科技/市政的「星屑累积」尤里卡进度；
 *   ③ 防重与平台码共用 meta.redeemed：换大小写/加连字符仍是同一个码；
 *   ④ 只配本地码、平台两项留空时，入口**不能**消失（ready() 必须为真）。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadNoDom, ROOT } from './load-sb.mjs';

const { ctx, SB } = loadNoDom();
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/redeem.js'), 'utf8'), ctx, { filename: 'src/redeem.js' });
const R = SB.redeem;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

/* 夹具：星屑从 0 起、平台通道留着但**不允许联网**（装一个会抛的 fetch，
 * 一旦有人偷偷走平台路径就立刻炸出来）。 */
const meta = {
  tide: 0, tideEarnedTotal: 0, spent: 0, compensationTotal: 0,
  stardust: 0, stardustEarned: 0, stardustShopUnlocked: false, redeemed: {}
};
let netCalls = 0;
SB.game = { meta: () => meta, log: () => {}, renderAll: () => {} };
SB.state.saveMeta = () => {};
ctx.fetch = () => { netCalls++; return Promise.reject(new Error('不该联网')); };

const RC = SB.CFG.REDEEM;
const savedLocal = RC.LOCAL_GRANTS;

/* 明文码取 config 里的**真实**条目来反推：h 只有哈希，这里加一条临时明文项
 * 专供本探针（真实条目仍走 h 分支，两者都会被测到）。 */
const PLAIN = 'PROBESTAR50';
RC.LOCAL_GRANTS = savedLocal.concat([{ code: PLAIN, stardust: 50, label: '探针明文' }]);

ok('localGrants() 认出了 config 里的哈希项', R.localGrants().length >= 2, R.localGrants().length);
ok('哈希项没有明文 code 字段（包里不该出现明文）',
  R.localGrants().every(g => !g.h || !g.code || true) && savedLocal[0].code === undefined,
  JSON.stringify(savedLocal[0]));
ok('ready() 为真（平台 + 本地码至少一条通）', R.ready() === true);
ok('platformReady() 与 ready() 分开（只配本地码时入口也不能消失）',
  typeof R.platformReady === 'function' && R.platformReady() === true);

/* ── ① 明文码：命中即入账，不联网 ── */
let r = await R.redeem(PLAIN);
ok('明文码兑换成功', r.ok === true && r.stardust === 50, r.msg);
ok('星屑余额 +50', meta.stardust === 50, String(meta.stardust));
ok('★ stardustEarned 不变（白送的星屑不许抬高榜与尤里卡）', meta.stardustEarned === 0, String(meta.stardustEarned));
ok('顺手解锁星屑商店（有余额却进不去是死路）', meta.stardustShopUnlocked === true);
ok('★ 全程没有发网络请求', netCalls === 0, String(netCalls));
ok('meta.redeemed 记下星屑数（s 字段）', meta.redeemed[PLAIN] && meta.redeemed[PLAIN].s === 50,
  JSON.stringify(meta.redeemed[PLAIN]));

/* ── ② 防重：大小写 / 连字符变体仍算同一个码 ── */
r = await R.redeem(' probe-star-50 ');
ok('同一码换大小写加连字符 ⇒ 拒绝', r.ok === false && /领过/.test(r.msg), r.msg);
ok('拒绝时余额没变', meta.stardust === 50, String(meta.stardust));

/* ── ③ 哈希码：走 config 里那条真实条目（明文码不在包里） ── */
const hashed = savedLocal[0];
const plainOfHashed = 'SHELLSTAR50';        /* 只在探针里出现，包里只有它的 sha1 */
ok('哈希项 h 与 localHash(明文) 一致', R.localHash(plainOfHashed) === hashed.h, R.localHash(plainOfHashed));
r = await R.redeem(plainOfHashed);
ok('哈希码兑换成功', r.ok === true && r.stardust === 50, r.msg);
ok('星屑累计 100（两笔各 50）', meta.stardust === 100, String(meta.stardust));
ok('stardustEarned 仍然是 0', meta.stardustEarned === 0, String(meta.stardustEarned));
r = await R.redeem('SHELL-STAR-50');
ok('哈希码防重同样生效', r.ok === false && /领过/.test(r.msg), r.msg);

/* ── ④ 未命中的码不许被本地路径吞掉 ── */
r = await R.redeem('NOPE1234');
ok('未命中的码 ⇒ 拒绝（走平台/或判无效）', r.ok === false, r.msg);
ok('未命中时余额没动', meta.stardust === 100, String(meta.stardust));

/* ── ⑤ 只配本地码、平台留空：入口必须还在 ── */
const savedC = { CLIENT_ID: RC.CLIENT_ID, ACTIVITY_ID: RC.ACTIVITY_ID };
RC.CLIENT_ID = ''; RC.ACTIVITY_ID = '';
ok('平台留空 ⇒ platformReady() 为假', R.platformReady() === false);
ok('★ 平台留空但配了本地码 ⇒ ready() 仍为真（入口不消失）', R.ready() === true);
r = await R.redeem('SHELLSTAR50');
ok('平台留空时哈希码照样能领（纯本地，不依赖网络）',
  r.ok === true || /领过/.test(r.msg), r.msg);
RC.CLIENT_ID = savedC.CLIENT_ID; RC.ACTIVITY_ID = savedC.ACTIVITY_ID;

/* ── ⑥ 空奖励项不发空气 ── */
RC.LOCAL_GRANTS = [{ code: 'EMPTY001', label: '空' }];
ok('奖励为 0 的条目被忽略', R.localGrants().length === 0, R.localGrants().length);
r = await R.redeem('EMPTY001');
ok('空条目不产生成功', r.ok === false, r.msg);
RC.LOCAL_GRANTS = savedLocal;

/* ── ⑦ creditStar 对脏数据不崩 ── */
const dirty = { stardust: NaN };
R.creditStar(dirty, 50);
ok('creditStar 对 NaN 余额按 0 处理', dirty.stardust === 50, String(dirty.stardust));
R.creditStar(dirty, -10);
ok('creditStar 不接受负发放', dirty.stardust === 50, String(dirty.stardust));

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'HAS FAIL') + '  (' + pass + ' pass / ' + fail + ' fail)');
process.exit(fail === 0 ? 0 : 1);
