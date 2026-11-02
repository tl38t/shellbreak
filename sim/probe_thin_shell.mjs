/* 薄壳之智口径探针（2026-11-01）
 *
 * 背景：`perk.thin` 原来是 `Math.pow(0.9, thin)`（复利），desc 写「天壳厚度 −20%」，
 *   thin=2 时得 500000×0.81 = 405000 = −19% ⇒ 少减 5000 点。用户拍板改线性 `1−0.1×thin`。
 *
 * 本探针锁三件事：
 *   A 新建局按线性算（且不靠「照抄实现」自证）
 *   B 老档（已按旧复利口径存了 405000）能被迁移纠正，且剩余百分比不变
 *   C 幂等 —— 反复迁移不会把壳越改越薄/越厚
 *
 * 跑法：node sim/probe_thin_shell.mjs
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
}

const BASE = SB.CFG.ICE_SHELL;
console.log('CFG.ICE_SHELL =', BASE);

/* 用 meta.perks 走生产路径（freshRun → derivePerksFromMeta），不直写 s.perk */
function runWithTHIN(thinLv) {
  const keep = SB.game.meta;
  SB.game.meta = () => ({ tide: 0, spent: 0, cycle: 1, layers: 0, techLog: {},
    perks: thinLv ? { thinShell: 1 } : {}, starPerks: {} });
  // thinShell 的 apply 是 { thin: 2 }，买 1 级就得到 thin=2
  const s = SB.state.freshRun(false);
  SB.game.meta = keep;
  return s;
}

console.log('\n=== A 新建局：线性 −10%/级 ===');
{
  const s0 = runWithTHIN(0);
  ok('无薄壳之智 ⇒ 壳厚 = ICE_SHELL', s0.iceShell === BASE, 'iceShell=' + s0.iceShell);
  ok('开局 shell 与 iceShell 相等', s0.shell === s0.iceShell, s0.shell + '/' + s0.iceShell);
  ok('baseShell 记录当前厚度版本', s0.baseShell === BASE, 'baseShell=' + s0.baseShell);
  ok('perk.thin = 0', (s0.perk.thin || 0) === 0, 'thin=' + s0.perk.thin);

  const s1 = runWithTHIN(1);
  ok('薄壳 1 级 ⇒ thin=2（apply 表本身没动）', (s1.perk.thin || 0) === 2, 'thin=' + s1.perk.thin);
  ok('薄壳 1 级 ⇒ 壳厚 −20% = 400000，不是复利的 405000',
    s1.iceShell === Math.round(BASE * 0.8) && s1.iceShell === 400000,
    'iceShell=' + s1.iceShell + '（复利会给 ' + Math.round(BASE * 0.81) + '）');
  /* 独立算式，不引实现：描述是「−20%」，那就必须等于 80% */
  ok('实测减幅恰好 20.00%',
    Math.abs((1 - s1.iceShell / BASE) - 0.20) < 1e-12,
    '减幅=' + ((1 - s1.iceShell / BASE) * 100).toFixed(2) + '%');
}

console.log('\n=== B 老档迁移：405000 → 400000，进度比例不变 ===');
{
  const KEYS = 0.6;   // 玩家已凿掉 40%，剩 60%
  const oldShell = Math.round(405000 * KEYS);
  const raw = {
    t: 100, shell: oldShell, iceShell: 405000, baseShell: BASE,
    perk: Object.assign(SB.state.emptyPerks(), { thin: 2 }),
  };
  const mig = (r) => SB.stateMigrations.migrateRun(r, SB.state.freshRun, SB.state.emptyPerks);

  const out = mig(raw);
  ok('迁移后 iceShell = 400000', out.iceShell === 400000, 'iceShell=' + out.iceShell);
  ok('迁移后 shell 按比例缩放（剩余百分比不变）',
    out.shell === Math.round(400000 * KEYS),
    'shell=' + out.shell + '（迁移前 ' + oldShell + '）');
  const rBefore = raw.shell / raw.iceShell, rAfter = out.shell / out.iceShell;
  ok('剩余比例误差 < 0.01%（不是白送进度）',
    Math.abs(rBefore - rAfter) < 1e-4,
    (rBefore * 100).toFixed(2) + '% → ' + (rAfter * 100).toFixed(2) + '%');
  ok('baseShell 仍是当前厚度版本', out.baseShell === BASE, 'baseShell=' + out.baseShell);

  const again = mig(out);
  ok('幂等：再迁一次 iceShell 不变', again.iceShell === 400000, 'iceShell=' + again.iceShell);
  ok('幂等：再迁一次 shell 不变', again.shell === out.shell, 'shell=' + again.shell);
}

console.log('\n=== C 不该动的档位一律不动 ===');
{
  const mig = (r) => SB.stateMigrations.migrateRun(r, SB.state.freshRun, SB.state.emptyPerks);
  /* C1 没有薄壳的档：iceShell 就是满壳 */
  const c1 = mig({ shell: 200000, iceShell: BASE, baseShell: BASE, perk: SB.state.emptyPerks() });
  ok('无薄壳：iceShell 500000 不动', c1.iceShell === BASE, 'iceShell=' + c1.iceShell);
  ok('无薄壳：shell 200000 不动', c1.shell === 200000, 'shell=' + c1.shell);
  /* C2 thin=1：0.9^1 === 1−0.1×1，两式本来就相等 ⇒ 不该被当成旧口径 */
  const c2 = mig({ shell: 450000, iceShell: 450000, baseShell: BASE,
    perk: Object.assign(SB.state.emptyPerks(), { thin: 1 }) });
  ok('thin=1：iceShell 450000 不动（两式相等，无口径分歧）', c2.iceShell === 450000, 'iceShell=' + c2.iceShell);
  /* C3 新局（已是线性值）再过一次迁移 */
  const s = runWithTHIN(1);
  const c3 = mig(s);
  ok('新局（400000）再过迁移不动', c3.iceShell === 400000, 'iceShell=' + c3.iceShell);
  ok('新局 shell 不被二次缩放', c3.shell === s.shell, c3.shell + ' vs ' + s.shell);
}

console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail ? 1 : 0);
