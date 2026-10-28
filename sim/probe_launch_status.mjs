/* 定向验证 economy.launchStatus（发射场「缺料暂停」唯一判据，2026-10-28）
 * 非标定、不扫参数：只验判据本身对不对。
 *   ① 未建成 / 玩家自己按 − 停掉的场 → null（不许误报成缺料）
 *   ② 料与流都够 → null（不许常亮角标）
 *   ③ 热液能不足 → lack=hydro（**全场共用一个门**，所以只要总需求不满足，
 *      每一座已启用的场都报 —— 这条是「三座一起停」的语义取证）
 *   ④ 铀 / 强工质引擎 / θ薄膜 / 钛合金板 依次报第一个断掉的
 *   ⑤ 帆模式不查钛板、节点模式才查（材料表由 launchMaterialPer 决定，不许写死）
 * 【为什么必须单独一条】这条判据是「面板说的」与「结算干的」之间那根线：
 *   economy-rates 的 `_elRunR` 与 economy-tick 2f 的 && 链必须与它同源，
 *   它算错 = 面板撒谎；它漏判 = 玩家看着进度条不走却不知道为什么。
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let fail = 0;
function chk(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
}
const lst = (s, id) => SB.economy.launchStatus(s, id);

/* 用真 state 打底（freshRun），只清掉「其它吃热液能的建筑」，避免测试受别的线干扰。 */
function base() {
  const s = SB.state.freshRun(true);
  s.perk = s.perk || {};
  s.upgrades = s.upgrades || {};
  s.launchStops = s.launchStops || {};
  s.geek = s.geek || { geekOn: false, costOffset: 0 };
  /* 只留汽轮机当唯一热液源；其余耗流方全部归零（含工业机器人升级）。 */
  ['hydroshop', 'spacestation', 'satellite', 'biomatlab', 'robotbay', 'titancloud', 'fissionplant']
    .forEach(function (k) { if (k in s.lvl) s.lvl[k] = 0; });
  s.hydroshopStop = 0; s.biomatlabStop = 0; s.satelliteStop = 0; s.spacestationStop = 0;
  s.turbineStop = 0;
  s.lvl.hydroturbine = 40;          // 供流远超发射场的 4/级
  s.res.warmstone = 1e9;            // 汽轮机不吃不到暖石
  s.geek.geekOn = false;
  if (s.upgrades.upg_indrobot) s.upgrades.upg_indrobot = false;
  /* 发射场：帆模式、2 级全开、四种材料都给足（钛板刻意留 0 —— 帆模式不查它）。 */
  s.lvl.europa_launch = 2;
  s.launchMode = 'sail';
  s.res.uranium = 1e6; s.res.strongProp = 1e6; s.res.thinafilm = 1e6; s.res.tiplate = 0;
  return s;
}

/* ── ① 不该报的三种情形 ── */
const a1 = base(); a1.lvl.europa_launch = 0;
chk('未建成 → null', lst(a1, 'europa_launch') === null);

const a2 = base(); a2.launchStops.europa_launch = 2;
chk('玩家把本场两级全停 → null（不算缺料）', lst(a2, 'europa_launch') === null);

chk('料与流都够 → null', lst(base(), 'europa_launch') === null);

/* ── ② 热液能：全场共用一个门 ── */
const h1 = base(); h1.lvl.hydroturbine = 0;
const rh1 = lst(h1, 'europa_launch');
chk('断流 → lack=hydro 且 ratio 0', !!rh1 && rh1.lack === 'hydro' && rh1.ratio === 0, JSON.stringify(rh1));

/* 两座场都启用、供流只够一座 ⇒ 两座都报（总需求翻倍，不是每座各算） */
const h2 = base();
h2.lvl.terra_launch = 2;
h2.lvl.hydroturbine = 2;   // 只够 2 级 × 4/s，而总需求 4 级 × 4/s
const rh2a = lst(h2, 'europa_launch'), rh2b = lst(h2, 'terra_launch');
chk('两座场共用门：供流只够一座 ⇒ 两座都报 hydro',
  !!rh2a && rh2a.lack === 'hydro' && !!rh2b && rh2b.lack === 'hydro', JSON.stringify([rh2a, rh2b]));

/* ── ③ 四种材料，按 && 链顺序报第一个断的 ── */
const m1 = base(); m1.res.uranium = 0;
const rm1 = lst(m1, 'europa_launch');
chk('缺铀 → lack=uranium', !!rm1 && rm1.lack === 'uranium' && rm1.ratio === 0, JSON.stringify(rm1));

const m2 = base(); m2.res.strongProp = 0;
const rm2 = lst(m2, 'europa_launch');
chk('缺强工质引擎 → lack=strongProp', !!rm2 && rm2.lack === 'strongProp', JSON.stringify(rm2));

const m3 = base(); m3.res.thinafilm = 0;
const rm3 = lst(m3, 'europa_launch');
chk('缺 θ金属薄膜 → lack=thinafilm', !!rm3 && rm3.lack === 'thinafilm', JSON.stringify(rm3));

const m4 = base(); m4.res.uranium = 0; m4.res.strongProp = 0;
const rm4 = lst(m4, 'europa_launch');
chk('铀与引擎同时断 → 只报第一个（uranium），不刷屏',
  !!rm4 && rm4.lack === 'uranium', JSON.stringify(rm4));

/* 比例口径：铀只有需求的 40% ⇒ ratio≈0.4（2 级 × 0.5/s = 1/s，给 0.4） */
const m5 = base();
const perU = SB.economy.launchMaterialPer(m5).uranium;
m5.res.uranium = 2 * perU * 0.4;
const rm5 = lst(m5, 'europa_launch');
chk('铀只有 40% → ratio≈0.4', !!rm5 && rm5.lack === 'uranium' && Math.abs(rm5.ratio - 0.4) < 0.02,
  JSON.stringify(rm5));

/* ── ④ 钛板只在节点模式查 ── */
const n1 = base();   // 帆模式，tiplate=0
chk('帆模式下钛板为 0 → 仍 null（不查这条）', lst(n1, 'europa_launch') === null);

const n2 = base();
n2.techs.adiabatic = true; n2.launchMode = 'node';
const rn2 = lst(n2, 'europa_launch');
chk('节点模式缺钛板 → lack=tiplate', !!rn2 && rn2.lack === 'tiplate', JSON.stringify(rn2));

const n3 = base();
n3.techs.adiabatic = true; n3.launchMode = 'node'; n3.res.tiplate = 1e6;
chk('节点模式四料齐 → null', lst(n3, 'europa_launch') === null);

/* ── ⑤ 边界 ── */
chk('未知 id → null', lst(base(), 'kelp') === null);
chk('空参 → null', lst(null, 'europa_launch') === null);

/* ── ⑥ 与 rates 的 _elRunR 同源（面板净速率必须跟着归零，不许一边说暂停一边报产出） ── */
/* ⚠️ 键名是 sunSailRate / dysonNodeRate（economy-rates 的 return），不是 sail/node ——
 *   第一版写 R.sail 取到 undefined，`(undefined||0)===0` 直接假绿，已改。 */
const sr = base();
sr.lvl.europa_launch = 2;
sr.res.uranium = 0;
const R = SB.economy.rates(sr);
chk('缺铀时 rates 的帆产出速率归零（面板与徽标同判据）',
  typeof R.sunSailRate === 'number' && R.sunSailRate === 0, 'sunSailRate=' + R.sunSailRate);

const sr2 = base();
sr2.lvl.europa_launch = 2;
const R2 = SB.economy.rates(sr2);
chk('料足时 rates 的帆产出为正（对照组，证明上一条不是恒 0）',
  typeof R2.sunSailRate === 'number' && R2.sunSailRate > 0, 'sunSailRate=' + R2.sunSailRate);

console.log(fail ? ('FAILED ' + fail) : 'OK all');
process.exit(fail ? 1 : 0);
