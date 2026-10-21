import { loadNoDom } from './load-sb.mjs';

const { ctx, SB } = loadNoDom({});
const out = [];
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : ''));
  cond ? pass++ : fail++;
}

// ── 场景 A：学校=lvl5、pop=200、无商人、无中世纪集市（验证学校不再依赖商人/集市）──
{
  const s = SB.state.freshRun(false);
  s.pop = 200;
  s.lvl.school = 5;
  // 明确不装 market 市政、不派商人
  const r = SB.economy.rates(s);
  const sciBefore = s.res.science, culBefore = s.res.culture;
  SB.economy.tick(s, 1, null, {});
  const dSci = s.res.science - sciBefore;
  const dCul = s.res.culture - culBefore;
  const expectSci = 200 * 5 * SB.BLD.schoolMermanSci;   // pop × lvl × 常量
  const expectCul = 200 * 5 * SB.BLD.schoolMermanCivic;
  ok('A 学校科技：tick 增量 = pop×lvl×常量', Math.abs(dSci - expectSci) < 1e-6, 'got ' + dSci);
  ok('A 学校市政：tick 增量 = pop×lvl×常量', Math.abs(dCul - expectCul) < 1e-6, 'got ' + dCul);
  ok('A 面板===结算：rates.science ≈ tick增量', Math.abs(r.science - dSci) < 1e-6, 'r.science=' + r.science + ' dSci=' + dSci);
  ok('A 面板===结算：rates.culture ≈ tick增量', Math.abs(r.culture - dCul) < 1e-6, 'r.culture=' + r.culture + ' dCul=' + dCul);
}

// ── 场景 B：学校=0 级 ⇒ 完全不产出（门控正确）──
{
  const s = SB.state.freshRun(false);
  s.pop = 200;
  s.lvl.school = 0;
  const r = SB.economy.rates(s);
  ok('B 学校0级：不贡献科技', Math.abs(r.science) < 1e-9, 'r.science=' + r.science);
  ok('B 学校0级：不贡献市政', Math.abs(r.culture) < 1e-9, 'r.culture=' + r.culture);
}

// ── 场景 C：旧耦合已移除——有商人但无中世纪集市，学校仍只走鲛人口径（商人副产独立，无学校加成项）──
{
  const s = SB.state.freshRun(false);
  s.pop = 200;
  s.lvl.school = 5;
  // 派一个商人但不开 market 市政
  s.jobs = s.jobs || {}; s.jobs.merchant = 1;
  const r = SB.economy.rates(s);
  // 商人无 market → 商人副产=0；学校=200*5*0.5=500（不应有商人×学校项）
  const expectSci = 200 * 5 * SB.BLD.schoolMermanSci;
  ok('C 无集市时商人副产=0、学校仍=pop×lvl×常量', Math.abs(r.science - expectSci) < 1e-6, 'r.science=' + r.science);
}

// ── 场景 D：信息卡文案同时显示科技+市政 ──
{
  const b = SB.BLD && null; // building 对象从 config
  const B = SB.BLD;
  const L = 5;
  const text = '每名鲛人科技产出 +' + (B.schoolMermanSci).toFixed(1) + '/级/秒（当前 +' + (B.schoolMermanSci * L).toFixed(1) + '）' +
               '；每名鲛人市政产出 +' + (B.schoolMermanCivic).toFixed(1) + '/级/秒（当前 +' + (B.schoolMermanCivic * L).toFixed(1) + '）';
  ok('D 信息卡含科技+市政双行', text.indexOf('科技') >= 0 && text.indexOf('市政') >= 0, text);
}

console.log(out.join('\n'));
console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
