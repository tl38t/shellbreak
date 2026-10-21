/* G.E.E.K 库存耗料「面板撒谎」复现/验证探针（2026-10-21）。
 *
 * 用户报的现象：资源面板里 珊瑚 20.9k/328.4k 明明在减少，速率行却写着 **+450/s（绿色）**。
 * 同屏其它项（精铁 −13.76/s 等）负号是对的 ⇒ 说明负号与配色没坏，是**这一项算错了**。
 *
 * 根因：珊瑚在结算端**只有 GEEK 一个消耗方**（shell.js:111 `s.res.coral -= _gkCoral`），
 *   而 economy-rates.js 的 rates() 珊瑚行只有产出、没有任何扣项 ⇒ 面板显示的是毛产不是净额。
 *   藻食/金属(silt)/石头 同样各漏 1500/500/500，只是毛产远大于消耗且库存满仓，肉眼看不出来。
 *
 * 本探针**不 mock 公式**：真实 loadNoDom + 真实 SB.shell.tickShell（结算路）+ 真实
 *   SB.economy.rates（面板路），并且
 *     · 毛产基线 = 同一状态把 geekOn 关掉后的 rates()（GEEK 关着就没人扣这四样）；
 *     · 实测消耗 = 跑真实 tickShell 的库存每秒变化；
 *     · 断言 面板净额 === 毛产 + 实测消耗  ← 这一条就是「面板===结算」。
 *   ⚠️ 修好之前这几条是红的（红的那 500/1500 就是 bug 证据）。 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();

const C = SB.CFG;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}
function info(msg) { console.log('INFO ' + msg); }
function signed(v) { return (v > 0 ? '+' : '') + Number(v || 0).toFixed(2); }

/* 造一个「GEEK 已建、热液能供得起」的真实状态：
 * 供给走真实汽轮机（hydroturbine 等级 × 暖石），不注入 _hydroFlow ——
 * 让 tickShell 与 rates() 都从同一个 hydroAlloc 现算，这才是生产口径。 */
function makeState(opts) {
  opts = opts || {};
  const s = SB.state.freshRun(false);
  s.wonders = { wonder_geek: true };
  s.geek = { geekOn: true, enceladusDone: false, terraDone: false, costOffset: 0, enceladusRun: 0, terraRun: 0 };
  s.geekStarved = false;
  s.res = s.res || {};
  s.res.kelp = 1e6; s.res.silt = 1e6; s.res.stone = 1e6; s.res.coral = 1e6;
  s.res.warmstone = 1e9;                       // 供汽轮机烧，别让暖石门控卡住热液能
  s.lvl = s.lvl || {};
  s.lvl.hydroturbine = 50;                     // 供给远超 GEEK 的 40/秒需求
  s.jobs = s.jobs || {};
  s.jobs.coralwright = 101;                    // 复刻用户那一幕：珊瑚毛产 50.5/s < GEEK 500/s
  if (opts.coral !== undefined) s.res.coral = opts.coral;
  if (opts.noFlow) s.lvl.hydroturbine = 0;     // 断流场景：一台汽轮机都没建
  if (opts.geekOff) s.geek.geekOn = false;
  if (opts.done) { s.geek.enceladusDone = true; s.geek.terraDone = true; }
  if (opts.enceladusOnly) { s.geek.enceladusDone = true; s.geek.terraDone = false; }  // 等 terraform 研究
  if (opts.terraform) s.techs = Object.assign({}, s.techs, { terraform: true });
  return s;
}

/* 结算路实测：跑 n 个 dt=1 的 tickShell，返回四样库存的「每秒实际变化」。 */
function measureShellPerSec(s, n) {
  const before = { kelp: s.res.kelp, silt: s.res.silt, stone: s.res.stone, coral: s.res.coral };
  const emit = () => {};
  for (let i = 0; i < n; i++) SB.shell.tickShell(s, 1, emit, {});
  return {
    kelp: (s.res.kelp - before.kelp) / n,
    silt: (s.res.silt - before.silt) / n,
    stone: (s.res.stone - before.stone) / n,
    coral: (s.res.coral - before.coral) / n,
  };
}

const KEYS = ['kelp', 'silt', 'stone', 'coral'];

/* ── 场景 1：用户截图那一幕 ── */
{
  const sOn = makeState();
  const real = measureShellPerSec(sOn, 100);          // 结算路：GEEK 每秒真扣多少
  const panelOn = SB.economy.rates(sOn);              // 面板路（修好后应含扣项）
  const panelOff = SB.economy.rates(makeState({ geekOff: true }));  // 毛产基线（GEEK 关掉）

  info('珊瑚: 毛产 ' + signed(panelOff.coral) + '/s ｜ GEEK 实扣 ' + signed(real.coral) +
       '/s ⇒ 真净额 ' + signed(panelOff.coral + real.coral) + '/s');
  info('面板修好后应显示 ' + signed(panelOn.coral) + '/s');

  ok('GEEK 确实在运转（不是停摆态）',
    sOn.geek.enceladusRun === 100 && sOn.geekStarved === false,
    'run=' + sOn.geek.enceladusRun + ' starved=' + sOn.geekStarved);

  for (const k of KEYS) {
    const expect = (panelOff[k] || 0) + real[k];
    ok('面板===结算 · ' + k + '（面板净额 == 毛产 + 实测消耗）',
      Math.abs((panelOn[k] || 0) - expect) < 1e-6,
      'panel=' + (panelOn[k] || 0).toFixed(2) + ' 期望=' + expect.toFixed(2) +
      ' 差=' + ((panelOn[k] || 0) - expect).toFixed(2));
  }

  /* 用户报的那一幕：毛产是正的（绿），真净额是负的（库存确实在掉）。 */
  ok('珊瑚: 毛产为正（这就是玩家看到的绿色 +50.50/s）', (panelOff.coral || 0) > 0,
    signed(panelOff.coral));
  ok('珊瑚: 真净额为负（库存确实在掉，20.9k/328.4k 就是这么来的）',
    (panelOff.coral + real.coral) < 0, signed(panelOff.coral + real.coral));
  ok('珊瑚: 面板现在显示负数（不再撒谎成 +）', (panelOn.coral || 0) < 0, signed(panelOn.coral));

  /* 验量级：四样各差多少必须精确等于 GEEK 的配方 */
  ok('扣项量级: 藻食差 == GEEK_KELP(1500)', Math.abs((panelOff.kelp - panelOn.kelp) - C.GEEK_KELP) < 1e-6,
    '差=' + (panelOff.kelp - panelOn.kelp).toFixed(2));
  ok('扣项量级: 金属差 == GEEK_METAL(500)', Math.abs((panelOff.silt - panelOn.silt) - C.GEEK_METAL) < 1e-6,
    '差=' + (panelOff.silt - panelOn.silt).toFixed(2));
  ok('扣项量级: 石头差 == GEEK_STONE(500)', Math.abs((panelOff.stone - panelOn.stone) - C.GEEK_STONE) < 1e-6,
    '差=' + (panelOff.stone - panelOn.stone).toFixed(2));
  ok('扣项量级: 珊瑚差 == GEEK_CORAL(500)', Math.abs((panelOff.coral - panelOn.coral) - C.GEEK_CORAL) < 1e-6,
    '差=' + (panelOff.coral - panelOn.coral).toFixed(2));
}

/* ── 场景 2：停摆态（珊瑚=0）⇒ tick 一分不扣，面板也不许扣 ── */
{
  const s = makeState({ coral: 0 });
  const real = measureShellPerSec(s, 10);
  ok('停摆态: GEEK 未推进', s.geekStarved === true && s.geek.enceladusRun === 0,
    'starved=' + s.geekStarved + ' run=' + s.geek.enceladusRun);
  ok('停摆态: 结算一分不扣', real.coral === 0 && real.kelp === 0 && real.silt === 0 && real.stone === 0, JSON.stringify(real));
  const panel = SB.economy.rates(makeState({ coral: 0 }));
  const panelOff = SB.economy.rates(makeState({ coral: 0, geekOff: true }));
  ok('停摆态: 面板不扣（== 毛产）', Math.abs((panel.coral || 0) - (panelOff.coral || 0)) < 1e-6,
    'panel=' + signed(panel.coral) + ' 毛产=' + signed(panelOff.coral));
  ok('停摆态: 藻食/金属/石头 面板也不扣',
    Math.abs((panel.kelp || 0) - (panelOff.kelp || 0)) < 1e-6 &&
    Math.abs((panel.silt || 0) - (panelOff.silt || 0)) < 1e-6 &&
    Math.abs((panel.stone || 0) - (panelOff.stone || 0)) < 1e-6);
}

/* ── 场景 3：断流（没汽轮机）⇒ tick 不扣，面板也不许扣 ── */
{
  const s = makeState({ noFlow: true });
  const real = measureShellPerSec(s, 10);
  ok('断流: 结算不扣料', real.coral === 0 && real.kelp === 0, JSON.stringify(real));
  const panel = SB.economy.rates(makeState({ noFlow: true }));
  const panelOff = SB.economy.rates(makeState({ noFlow: true, geekOff: true }));
  ok('断流: 面板不扣（== 毛产）', Math.abs((panel.coral || 0) - (panelOff.coral || 0)) < 1e-6,
    'panel=' + signed(panel.coral) + ' 毛产=' + signed(panelOff.coral));
}

/* ── 场景 4：未启动（geekOn=false）⇒ 面板没有任何扣项 ── */
{
  const sOff = makeState({ geekOff: true });
  const panelOff = SB.economy.rates(sOff);
  const noWonder = makeState({ geekOff: true }); noWonder.wonders = {};
  const panelNoWonder = SB.economy.rates(noWonder);
  ok('未启动: 面板与「没有这台机器」时完全一致',
    Math.abs((panelOff.coral || 0) - (panelNoWonder.coral || 0)) < 1e-6 &&
    Math.abs((panelOff.kelp || 0) - (panelNoWonder.kelp || 0)) < 1e-6);
}

/* ── 场景 5：两阶段都完成后 ⇒ 自动停扣（用户拍板：改造做完就停）── */
{
  const s = makeState({ done: true, terraform: true });   // 完整完成态：恩克拉多斯+泰拉 都做完
  const real = measureShellPerSec(s, 10);
  ok('完成后: 结算一分不扣（不再吃料）',
    real.coral === 0 && real.kelp === 0 && real.silt === 0 && real.stone === 0, JSON.stringify(real));
  ok('完成后: 不置 starvation（不是「停摆」，是「完工」）', s.geekStarved === false, 'starved=' + s.geekStarved);
  const panel = SB.economy.rates(makeState({ done: true, terraform: true }));
  const panelOff = SB.economy.rates(makeState({ done: true, terraform: true, geekOff: true }));
  ok('完成后: 面板也不扣（== 毛产，不显示假的 −500/s）',
    Math.abs((panel.coral || 0) - (panelOff.coral || 0)) < 1e-6 &&
    Math.abs((panel.kelp || 0) - (panelOff.kelp || 0)) < 1e-6 &&
    Math.abs((panel.silt || 0) - (panelOff.silt || 0)) < 1e-6 &&
    Math.abs((panel.stone || 0) - (panelOff.stone || 0)) < 1e-6,
    'panel.coral=' + signed(panel.coral) + ' 毛产=' + signed(panelOff.coral));
  info('两阶段完成后: 实测每秒扣 藻食 ' + real.kelp + ' / 金属 ' + real.silt + ' / 石头 ' + real.stone +
       ' / 珊瑚 ' + real.coral + '（已自动停扣 ✔）');
}

/* ── 场景 6：恩克拉多斯完成、但 terraform 还没研究 ⇒ 等待态，同样不扣料 ── */
{
  const s = makeState({ enceladusOnly: true });   // enceladusDone=true, terraform 未研究
  const real = measureShellPerSec(s, 10);
  ok('等待态(等 terraform): 结算不扣料',
    real.coral === 0 && real.kelp === 0 && real.silt === 0 && real.stone === 0, JSON.stringify(real));
  ok('等待态: 不置 starvation（既非缺料也非完工，只是等研究）', s.geekStarved === false, 'starved=' + s.geekStarved);
  const panel = SB.economy.rates(makeState({ enceladusOnly: true }));
  const panelOff = SB.economy.rates(makeState({ enceladusOnly: true, geekOff: true }));
  ok('等待态: 面板也不扣', Math.abs((panel.coral || 0) - (panelOff.coral || 0)) < 1e-6,
    'panel=' + signed(panel.coral) + ' 毛产=' + signed(panelOff.coral));
}

console.log('\n== ' + pass + ' PASS / ' + fail + ' FAIL ==');
process.exit(fail ? 1 : 0);
