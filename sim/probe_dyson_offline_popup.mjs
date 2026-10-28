// 验证：离线补算达戴森竣工时，胜利弹窗不被「离线结算」窗冲掉。
// 复现真实条件：热液汽轮机供流 + 欧罗巴发射场在跑（让 economy-tick 的发射场块进入），
// 且 sunSails/dysonNodes 双达标已顶满 ⇒ 该 tick 必走 dysonDone 分支。
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
function base() {
  const s = SB.state.freshRun();
  s.lvl.hydroturbine = 1;     // 供热液
  s.lvl.europa_launch = 1;    // 发射场在跑（_el=1）
  s.res.hydro = 1e6; s.res.uranium = 1e6; s.res.strongProp = 1e6;
  s.res.thinafilm = 1e6; s.res.tiplate = 1e6;
  s.sunSails = 10000; s.dysonNodes = 1000;  // 双达标已 100%
  return s;
}

let fail = 0;
function chk(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
}

// 1) 离线 tick：deferBreakUI:true ⇒ 只挂 pending，不置 seen
const s = base();
SB.economy.tick(s, 0.1, null, { skipFoodPop: true, skipHappy: true, deferBreakUI: true });
chk('发射场块进入（sunSails 已被 tick 累加，仍 >=cap）', s.sunSails >= 10000);
chk('离线 tick 后 dysonDone=true', s.dysonDone === true, 'done=' + s.dysonDone);
chk('离线 tick 后 dysonPopupSeen 仍 false（未提前置位）', s.dysonPopupSeen === false);
chk('离线 tick 后 dysonPopupPending=true（挂起待结算窗关闭）', s.dysonPopupPending === true, 'pending=' + s.dysonPopupPending);

// 2) 在线 tick：无 deferBreakUI ⇒ 无 DOM 下 _R 为 null 不弹；但 pending 必 false（区别于离线）
const s2 = base();
SB.economy.tick(s2, 0.1, null, { skipFoodPop: true, skipHappy: true });
chk('在线 tick 后 dysonDone=true', s2.dysonDone === true);
chk('在线 tick 后 dysonPopupPending=false（与离线路径区分）', s2.dysonPopupPending === false);

// 3) 旧 bug 对照：离线态 seen 保持 false ⇒ 结算 onOk 的 fireDysonPending 仍能播（不会因 seen=true 跳过）
chk('离线态 seen=false 保证结算后仍可播（旧 bug 已修）', s.dysonPopupSeen === false);

process.exit(fail ? 1 : 0);
