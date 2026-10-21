// 验证：工坊顶部横幅改为读 craftMul 全局口径后，确实包含 boomcraft 乘区，
// 且与「无配方专属加成」的配方行 craftMul 逐字相等。
// ⚠️ 乘数值不硬编码：从 UPGRADES 表现读（2026-10-21 用户拍 1.5→1.05，避免下次标定又改探针）。
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
const s = {
  lvl: { workshop: 1 },
  techs: {}, civics: {}, wonders: {}, got: {}, perk: {},
  upgrades: { upg_boomcraft: true }, // 已购可控爆炸工艺
  /* 2026-10-21：工业机器人已改为「按建筑停用 workshopStop」模型，旧布尔 indRobotOn 字段被删。
   * 本 fixture 只想验 boomcraft 乘区 ⇒ 不装 upg_indrobot 即天然无机器人乘区（×1）。 */
  workshopStop: 0,
};

const boomMul = 1 + (SB.UPGRADES.find(u => u.id === 'upg_boomcraft') || {}).boomcraftMul;
const r = SB.workshop.craftRatio(s);
const gmGlobal = SB.workshop.craftMul(s, { id: '__global__' }); // 横幅用的全局口径
const mulExpected = (1 + r) * boomMul; // 仅 boomcraft 乘区（无王座/激光/机器人/海）

let fail = 0;
function chk(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
}

// 1) 全局 craftMul == (1+craftRatio)*boomMul （boomcraft 已含）
chk('global craftMul == (1+craftRatio)*boomMul(表读 ' + boomMul + ')', Math.abs(gmGlobal - mulExpected) < 1e-9,
  'r=' + r.toFixed(4) + ' gm=' + gmGlobal.toFixed(4) + ' expected=' + mulExpected.toFixed(4));

// 2) boomcraft 确实生效：若没买，gm 应 = (1+r)；买了应 = (1+r)*boomMul
const sNoBoom = JSON.parse(JSON.stringify(s));
sNoBoom.upgrades = {};
const gmNoBoom = SB.workshop.craftMul(sNoBoom, { id: '__global__' });
chk('无 boomcraft 时 gm == (1+r)', Math.abs(gmNoBoom - (1 + r)) < 1e-9, 'gmNoBoom=' + gmNoBoom.toFixed(4));
chk('买 boomcraft 后 gm 放大 ' + boomMul + '×', Math.abs(gmGlobal / gmNoBoom - boomMul) < 1e-9,
  'ratio=' + (gmGlobal / gmNoBoom).toFixed(4));

// 3) 横幅公式与配方行同式：(mul-1)*100
const bannerPct = ((gmGlobal - 1) * 100).toFixed(0);
const rowPct = ((gmGlobal - 1) * 100).toFixed(0);
chk('横幅与配方行同式 (mul-1)*100', bannerPct === rowPct, 'pct=' + bannerPct + '%');

// 4) 取一个普通配方（非火箭引擎 / 非物流卡定向）验证 == 全局
const rows = SB.workshop.crafts();
const generic = rows.find(c => c.id !== 'craft_rocketengine');
if (generic) {
  const gmRow = SB.workshop.craftMul(s, generic);
  chk('普通配方行 == 全局口径', Math.abs(gmRow - gmGlobal) < 1e-9,
    'recipe=' + generic.id + ' row=' + gmRow.toFixed(4) + ' global=' + gmGlobal.toFixed(4));
} else {
  console.log('SKIP 普通配方对比（无可用配方）');
}

// 5) 火箭引擎配方：无博洛西洛发射场时不计专属 +100%（顶部与之相等，诚实）；
//    建成该奇观后才高于全局——证明顶部本就不计入配方专属，靠奇观条件触发。
const re = rows.find(c => c.id === 'craft_rocketengine');
if (re) {
  const gmRe = SB.workshop.craftMul(s, re);
  chk('无博洛西洛时火箭引擎 == 全局（顶部不计入专属）', Math.abs(gmRe - gmGlobal) < 1e-9,
    'rocketengine=' + gmRe.toFixed(4) + ' == global=' + gmGlobal.toFixed(4));
  const sBolo = JSON.parse(JSON.stringify(s));
  sBolo.wonders = { wonder_bolocillo: true };
  const gmReBolo = SB.workshop.craftMul(sBolo, re);
  chk('建成博洛西洛后火箭引擎 > 全局（专属 +100% 生效）', gmReBolo > gmGlobal,
    'rocketengine(bolo)=' + gmReBolo.toFixed(4) + ' > global=' + gmGlobal.toFixed(4));
} else {
  console.log('SKIP 火箭引擎对比');
}

console.log('\n横幅将显示：工艺制作效率 +' + bannerPct + '%  （旧口径仅 +' + (r * 100).toFixed(0) + '%）');
console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
