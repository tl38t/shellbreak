// 定向验证 shell.js 负壳修复（非标定、不扫参数）：
//   ① 破壳后（shellOpened=true）钻机不再把壳凿负；
//   ② 历史负壳（如 -235602）在读档后下一 tick 被钳回 0。
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let fail = 0;
function chk(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
}

// ── 场景①：已破壳 + 钻机开着 + 壳=0 → 多跑若干 tick，壳必须保持 0，不得变负 ──
const s1 = {
  broken: true, shellOpened: true, breakSettled: true,
  shell: 0, iceShell: 1000, baseShell: 1000,
  skydrillOn: true, lvl: { wonder_skydrill: 1 },
  res: { resonantDrill: 1e9 },
  _hydroFlow: { skyDraw: 1 },
  wonders: { wonder_skydrill: true },
  pop: 1, techs: {}, civics: {}, geek: { geekOn: false },
};
const before1 = s1.shell;
for (let i = 0; i < 50; i++) SB.shell.tickShell(s1, 1, null, {});
chk('已破壳+钻机开：壳保持 0 不变负', s1.shell === 0, 'shell=' + s1.shell);

// ── 场景②：历史负壳（破壳态）→ 下一 tick 钳回 0 ──
const s2 = {
  broken: true, shellOpened: true, breakSettled: true,
  shell: -235602, iceShell: 1000, baseShell: 1000,
  skydrillOn: false, lvl: {}, res: {}, wonders: {},
  pop: 1, techs: {}, civics: {}, geek: { geekOn: false },
};
SB.shell.tickShell(s2, 1, null, {});
chk('历史负壳读档后钳回 0', s2.shell === 0, 'shell=' + s2.shell);

// ── 场景③：未破壳 + 钻机开 + 壳>0 → 正常凿（壳应减小且不低于 0 触发的破壳态） ──
const s3 = {
  broken: false, shellOpened: false, breakSettled: false,
  shell: 50, iceShell: 200, baseShell: 200,
  skydrillOn: true, lvl: { wonder_skydrill: 1 },
  res: { resonantDrill: 1e9 },
  _hydroFlow: { skyDraw: 1 },
  wonders: { wonder_skydrill: true },
  pop: 1, techs: {}, civics: {}, geek: { geekOn: false },
};
const before3 = s3.shell;
let broke = false;
for (let i = 0; i < 200; i++) {
  const r = SB.shell.tickShell(s3, 1, (m) => { if (/冰壳裂开|凿穿/.test(m)) broke = true; }, {});
  if (s3.shellOpened) break;
}
chk('未破壳+钻机：壳被凿到归零并触发破壳', s3.shell <= 0 && s3.shellOpened, 'shell=' + s3.shell + ' opened=' + s3.shellOpened);

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
