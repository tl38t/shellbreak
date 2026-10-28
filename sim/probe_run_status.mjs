/* 定向验证 economy.runStatus（加工型建筑「缺料停工」唯一判据，2026-10-28）
 * 非标定、不扫参数：只验判据本身对不对。
 *   ① 库存够 → null（不许挂着角标）
 *   ② 某样料断 → 报的就是那一样
 *   ③ 玩家自己按 − 停掉的座 → null（不能误报成「缺料」，否则玩家去查一个不存在的原料问题）
 *   ④ 热液能流不足 → 按比例（0<ratio<1），完全断流 → 0
 *   ⑤ 研究所四样原料 → 报最先见底的那样
 * 【为什么必须单独一条】这条判据是「面板说的」和「结算干的」之间唯一的那根线：
 *   它算错 = 面板撒谎；它漏判 = 玩家看着炉子以为在烧。两侧都必须可取证。
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let fail = 0;
function chk(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
}
const st = (s, id) => SB.economy.runStatus(s, id);

/* 用一个真 state 打底（freshRun），再逐场景改字段 —— 避免手搓对象漏字段导致假红/假绿。 */
function base() {
  const s = SB.state.freshRun(true);
  s.techs.ironwork = true;
  s.perk = s.perk || {};
  return s;
}

/* ── 热泉炉 ── */
const f1 = base();
f1.lvl.furnace = 3; f1.furnaceStop = 0;
f1.res.silt = 500; f1.res.warmstone = 500;
chk('热泉炉·料够 → null', st(f1, 'furnace') === null);

const f2 = base();
f2.lvl.furnace = 3; f2.furnaceStop = 0;
f2.res.silt = 0; f2.res.warmstone = 500;
const r2 = st(f2, 'furnace');
chk('热泉炉·金属断了 → 报 metal', !!r2 && r2.lack === 'metal' && r2.ratio === 0, JSON.stringify(r2));

const f3 = base();
f3.lvl.furnace = 3; f3.furnaceStop = 0;
f3.res.silt = 500; f3.res.warmstone = 0;
const r3 = st(f3, 'furnace');
chk('热泉炉·暖石断了 → 报 warm', !!r3 && r3.lack === 'warm' && r3.ratio === 0, JSON.stringify(r3));

const f4 = base();
f4.lvl.furnace = 3; f4.furnaceStop = 3;
f4.res.silt = 0; f4.res.warmstone = 0;
chk('热泉炉·玩家全停 → null（不算缺料）', st(f4, 'furnace') === null);

/* ── 汽轮机（暖石门控） ── */
const t1 = base();
t1.lvl.hydroturbine = 2; t1.turbineStop = 0; t1.res.warmstone = 0;
const rt = st(t1, 'hydroturbine');
chk('汽轮机·暖石断 → 缺暖石且 ratio 0', !!rt && rt.lack === 'warm' && rt.ratio === 0, JSON.stringify(rt));

const t2 = base();
t2.lvl.hydroturbine = 2; t2.turbineStop = 0; t2.res.warmstone = 500;
chk('汽轮机·暖石足 → null', st(t2, 'hydroturbine') === null);

/* ── 热液工坊（流 + 金属双门控） ── */
const h1 = base();
h1.lvl.hydroturbine = 0; h1.lvl.hydroshop = 2; h1.hydroshopStop = 0;
h1.res.silt = 500; h1.res.warmstone = 0;
const rh1 = st(h1, 'hydroshop');
chk('工坊·无任何热液能 → 缺 hydro 且 ratio 0', !!rh1 && rh1.lack === 'hydro' && rh1.ratio === 0, JSON.stringify(rh1));

const h2 = base();
h2.lvl.hydroturbine = 4; h2.turbineStop = 0; h2.lvl.hydroshop = 2; h2.hydroshopStop = 0;
h2.res.warmstone = 99999; h2.res.silt = 0;
const rh2 = st(h2, 'hydroshop');
chk('工坊·有流无金属 → 缺 metal', !!rh2 && rh2.lack === 'metal' && rh2.ratio === 0, JSON.stringify(rh2));

/* ── 生物材料研究所（四样原料取最小） ── */
const b1 = base();
const labLv = 1;
b1.lvl.biomatlab = labLv; b1.biomatlabStop = 0;
b1.res.kelp = 0; b1.res.iron = 99999; b1.res.titanium = 99999; b1.res.uranium = 99999;
const rb1 = st(b1, 'biomatlab');
chk('研究所·藻食断 → 缺 kelp', !!rb1 && rb1.lack === 'kelp' && rb1.ratio === 0, JSON.stringify(rb1));

const b2 = base();
b2.lvl.biomatlab = labLv; b2.biomatlabStop = 0;
/* 只给铀不足（其余超量）⇒ 报的必须是 uranium，且比例约等于「铀库存/需求」 */
const nU = labLv * (SB.BLD.biomatlabU || 0);
b2.res.kelp = 99999; b2.res.iron = 99999; b2.res.titanium = 99999;
b2.res.uranium = nU * 0.4;
const rb2 = st(b2, 'biomatlab');
chk('研究所·只有铀不足 → 缺 uranium 且 ratio≈0.4',
  !!rb2 && rb2.lack === 'uranium' && Math.abs(rb2.ratio - 0.4) < 0.02, JSON.stringify(rb2));

const b3 = base();
b3.lvl.biomatlab = labLv; b3.biomatlabStop = 0;
b3.res.kelp = 99999; b3.res.iron = 99999; b3.res.titanium = 99999; b3.res.uranium = 99999;
chk('研究所·料全够 → null', st(b3, 'biomatlab') === null);

/* ── 边界：不认识的 id / 没建的建筑 ── */
chk('未知 id → null', st(base(), 'kelp') === null);
const e1 = base();
chk('没建的热泉炉 → null', st(e1, 'furnace') === null);
chk('空参 → null', st(null, 'furnace') === null);

console.log(fail ? ('FAILED ' + fail) : 'OK all');
process.exit(fail ? 1 : 0);
