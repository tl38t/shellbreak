/* 天壳 / SHELLBREAK — 数值回归
 * 跑生产代码的真实 tick，用四种玩家策略各跑一局，核对：
 *   ① 单局破冰时长落在 8-14 小时（B 档基线）
 *   ② 削壳构成是否健康：不能又是「基础削壳一条直线」
 *   ③ 三档效率策略必须互相拉开差距（说明选择有意义）
 *   ④ 对照组「不供燃料」必须凿不穿——验证地热是硬门槛而非装饰
 * 用法：node sim/balance.mjs
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
const CFG = SB.CFG;

function makeS() { return SB.state.freshRun(false); }
function noop() {}

/* 建造需求函数：按缺口排序，而不是固定顺序。
 * 固定顺序会在缺珊瑚时卡在某一项上，导致饿死螺旋——新手玩家也会踩。 */
/* 两种玩家性格，对应两条不同的通关路线：
 *   rational —— 先把加工链铺开（工坊/熔炉/聆听巢），再谈凿壳
 *   rush     —— 直奔燃料链（热泉井/祭坛），其余往后排
 * 两条路线用一样的结局、不一样的时长，才说明「选择有意义」。
 * 这个差异必须显式建模，否则两次跑分完全一样，指标就成了摆设。 */
/* nofuel 是硬门槛对照组：照样正常发展，就是不碰地热链。
 * 它必须永远凿不穿——否则「地热」就只是个装饰，而不是设计里的那道门。 */
const NO_FUEL = ['geyser', 'miracle'];

const RATIO = {
  rational: { warm: { gather: 0.60, craft: 0.25, scholar: 0.15 }, cold: { gather: 0.30, craft: 0.60, scholar: 0.10 } },
  rush: { warm: { gather: 0.52, craft: 0.40, scholar: 0.08 }, cold: { gather: 0.28, craft: 0.68, scholar: 0.04 } }
};

function wantBuild(s, strategy, skip) {
  // 「想建」不等于「建得起」。缺这一步会死锁：rush 顺序里 geyser 排在 furnace 之前，
  // 而 geyser 要 iron、iron 只有 furnace 能产 —— 不检查买不起就跳过的话，
  // geyser 永远排在队首、永远失败，furnace 永远轮不到，iron 永远是 0，整局冻结。
  function free(id) {
    const b = SB.habitat.buildingById(id);
    if (!b || !SB.habitat.unlocked(s, b) || !SB.habitat.needMet(s, b)) return false;
    return SB.economy.canAfford(s, SB.economy.costOf(s, id));
  }
  function virgin(id) { return free(id) && s.lvl[id] === 0; }

  var cap = SB.economy.houseCap(s);
  var kelpNeed = Math.min(s.lvl.kelp + 99, Math.ceil(s.pop / 3) + 2);   // 保证口粮净收益为正
  if (free('kelp') && s.lvl.kelp < kelpNeed) return 'kelp';
  /* 食物三旋钮（P1 新增）。顺序 = 猫国那四条食物路径的使用顺序：
   * 先增（导流堤吃闲置的矿砂）、再省（人密之后省耗才划得来）、后储（菌毯真会爆仓才建）。
   * 不建模这三个，回归就验证不了「省/增/储」真的接上了经济层。 */
  /* 每个旋钮都设「买够了就停」，否则机器人会把保温巢刷到 40 多级——
   * 封顶 −60% 之后多买的一级一点用都没有，纯烧珊瑚，反而把两条策略拉平。 */
  if (free('weir') && s.lvl.kelp > 0 && s.lvl.weir < 12) return 'weir';
  if (free('warmnest') && s.pop >= 6 && s.lvl.warmnest < 30) return 'warmnest';
  if (free('ballast') && s.lvl.kelp > 0 && s.lvl.ballast < 12) return 'ballast';
  if (free('nest') && s.pop >= cap - 1) return 'nest';

  const unlock = strategy === 'rush'
    ? ['workshop', 'geyser', 'miracle', 'furnace', 'library', 'hearth', 'reef', 'siltpit']
    : ['workshop', 'furnace', 'library', 'hearth', 'reef', 'geyser', 'siltpit', 'miracle'];

  /* 没建过的建筑优先。少了这一步，脚本会死在「返回第一个能建的」上：
   * workshop 没满级就永远排在最前，furnace/library/geyser/miracle 永远是 0，
   * 于是整个中后期看起来像卡死——那是脚本的假象，不是游戏的。 */
  for (const id of unlock) if (virgin(id) && skip.indexOf(id) < 0) return id;
  for (const id of FALLBACK) {
    if (free(id) && skip.indexOf(id) < 0) return id;
  }
  return null;
}

/* 兜底清单里不放食物三旋钮：它们按上面的「买够就停」规则走。
 * 放进兜底等于允许机器人无限续级——实测会把导流堤刷到 58 级（产出 ×10.7），
 * 两条策略的珊瑚都被新建筑吃光，策略差异被压到 1.04×，回归直接变红。 */
const FALLBACK = ['kelp', 'nest', 'workshop', 'furnace', 'library', 'hearth', 'reef', 'siltpit', 'geyser', 'miracle'];
const PRIORITY = ['kelp', 'weir', 'warmnest', 'ballast', 'nest', 'workshop', 'furnace', 'library', 'hearth', 'geyser', 'miracle', 'reef', 'siltpit'];

function bestTech(s) {
  for (const t of SB.TECHS) if (!s.techs[t.id] && s.res.science >= t.cost) return t.id;
  return null;
}

function runOne(strategy) {
  const s = makeS();
  const STEP = 0.1;
  const emit = (m) => { if (strategy === 'chatty') {} };
  let sec = 0;
  const skip = strategy === 'nofuel' ? NO_FUEL : [];

  while (s.t < 48 * 3600) {
    SB.economy.tick(s, STEP, noop);

    sec += STEP;
    if (sec >= 1) {
      sec = 0;
      /* 职业：食物优先——照猫国 village.js 的 farmer 1.0/tick vs catnipPerKitten -0.85/tick
       * 那个模型：先按当下口粮缺口算「该有几个圃丁」，剩下的人力才按策略比例分。
       * 原先写死 gather/craft/scholar 三段比例，圃丁恒为 0，结果没有人种菌毯，
       * 峰值族民卡在 1、破冰 48h 也凿不穿。吃饭排在雇人前面是这套循环的起点。 */
      var cold = SB.economy.isCold(s);
      var byBuild = s.lvl.kelp * SB.BLD.food * SB.economy.season(s.t).mult * (cold ? 0.6 : 1);
      var planter = Math.ceil((s.pop * CFG.FOOD_PER - byBuild) / SB.BLD.foodJob);
      var ratio = Object.assign(
        { planter: planter },
        (RATIO[strategy] || RATIO.rational)[cold ? 'cold' : 'warm']
      );
      SB.folk.autoAssign(s, ratio);

      for (let n = 0; n < 3; n++) {          // 每步最多建 3 项，模拟人手
        const id = wantBuild(s, strategy, skip);
        if (!id || !SB.habitat.build(s, id, noop)) break;
      }

      const tid = bestTech(s);
      if (tid) SB.habitat.study(s, tid, noop);

      // 祭坛：建成就启动；地热见底时自动停（shell 层已实现），这里只管开关
      if ((s.lvl.miracle || 0) > 0) s.miracleOn = true;
    }

    if (s.broken) break;
  }

  const r = SB.prestige.breakReport(s);
  return {
    strategy,
    hours: s.t / 3600,
    broken: s.broken,
    pop: s.pop,
    peak: s.peak,
    lvl: SB.economy.lvlSum(s),
    deaths: s.famineDeaths + s.frostDeaths,
    coef: SB.shell.breakCoef(s),
    baseCut: s._cutBase || 0,
    mirCut: s._cutMir || 0,
    tide: r.tidePoints
  };
}

function main() {
  const rows = [runOne('rational'), runOne('rush'), runOne('nofuel')];
  console.log('策略        破冰   耗时(h)  系数   基础削壳  祭坛削壳   峰值族民  建筑级  洋流点');
  for (const r of rows) {
    const tot = r.baseCut + r.mirCut || 1;
    console.log(
      r.strategy.padEnd(11),
      (r.broken ? '✓' : '✗').padEnd(5),
      r.hours.toFixed(2).padStart(7),
      r.coef.toFixed(1).padStart(6),
      (r.baseCut.toFixed(0) + ' (' + Math.round(r.baseCut / tot * 100) + '%)').padStart(12),
      (r.mirCut.toFixed(0) + ' (' + Math.round(r.mirCut / tot * 100) + '%)').padStart(12),
      String(r.peak).padStart(9),
      String(r.lvl).padStart(7),
      // 没破冰的对照组不打印洋流点：这里的 breakReport 是无条件算的，
      // 打出一个 「若破冰可得」的数字只会被误读成本局收益。
      (r.broken ? r.tide.toFixed(2) : '—').padStart(7)
    );
  }

  const ok = [];
  const broke = rows.filter(r => r.broken);

  // ① 时长：至少两种策略落在 8-14h
  const inBand = broke.filter(r => r.hours >= 8 && r.hours <= 14).length;
  ok.push(['时长 8-14h（≥2 策略）', inBand >= 2 ? 'PASS' : 'FAIL', `${inBand}/3`]);

  // ② 削壳构成：祭坛必须实质参与（>5%），否则又退回「被动一条直线」
  const mirShare = broke.length ? broke.reduce((a, r) => a + r.mirCut, 0) / broke.reduce((a, r) => a + r.baseCut + r.mirCut, 0) : 0;
  ok.push(['祭坛实质参与（>5%）', mirShare > 0.05 ? 'PASS' : 'FAIL', (mirShare * 100).toFixed(1) + '%']);

  // ③ 策略差异：rush 必须明显快于 rational
  const ra = rows.find(r => r.strategy === 'rational'), ru = rows.find(r => r.strategy === 'rush');
  const diff = ra.broken && ru.broken ? (ra.hours / ru.hours) : 0;
  ok.push(['rush 快于 rational（>1.05×）', diff > 1.05 ? 'PASS' : 'FAIL', diff ? diff.toFixed(2) + '×' : '—']);

  // ④ 硬门槛：不供燃料的对照组必须凿不穿
  const nf = rows.find(r => r.strategy === 'nofuel');
  ok.push(['不供燃料则凿不穿', !nf.broken ? 'PASS' : 'FAIL', nf.broken ? nf.hours.toFixed(2) + 'h' : '卡在 25%']);

  /* ⑤⑥ 结算锚定（2026-09-24 改成人口主导后新增的护栏）。
   * 少了这两条，谁都能把 pPart 改回建筑级的零头，而回归不会眨眼。 */
  const tideAt = (P, B) => {
    const s = makeS(); s.peak = P; s.lvl.kelp = B;
    return SB.prestige.breakReport(s);
  };
  const t54 = tideAt(54, 300), t120 = tideAt(120, 300), t30 = tideAt(30, 300);
  ok.push(['洋流点由峰值族民主导（同建筑级）', t120.tidePoints > t54.tidePoints * 1.5 ? 'PASS' : 'FAIL',
    `P54=${t54.tidePoints.toFixed(2)} → P120=${t120.tidePoints.toFixed(2)}`]);
  ok.push(['峰值族民不过门槛则无洋流点', t30.tidePoints === 0 && t30.gateMiss ? 'PASS' : 'FAIL',
    `P=${t30.P} → ${t30.tidePoints} 点`]);

  console.log();
  for (const [name, res, val] of ok) console.log(`  [${res}] ${name}  ${val}`);
  const pass = ok.filter(x => x[1] === 'PASS').length;
  console.log(`\n${pass}/${ok.length} 通过  ` + (pass === ok.length ? '[PASS]' : '[FAIL] 需重新标定数值'));
  process.exit(pass === ok.length ? 0 : 1);
}
main();
