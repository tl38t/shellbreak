import { loadNoDom } from './load-sb.mjs';
import fs from 'node:fs';

const { ctx, SB } = loadNoDom({});
const raw = JSON.parse(fs.readFileSync('D:/Downloads/shellbreak-save-2026-10-21.json', 'utf8'));
const run = raw.save.run;
const S = SB.state.migrateRun(run);

console.log('=== 状态标志 ===');
console.log('broken=', S.broken, '| frozen=', S.frozen, '| shellOpened=', S.shellOpened, '| breakSettled=', S.breakSettled);
console.log('pop=', S.pop, '| kelp=', S.res.kelp.toFixed(2), '| coral=', S.res.coral.toFixed(1), '| t=', S.t.toFixed(1));
console.log('lvl.kelp=', S.lvl.kelp, '| lvl.weir=', S.lvl.weir, '| lvl.warmnest=', S.lvl.warmnest, '| jobs.gather=', S.jobs.gather);

console.log('\n=== 藻食产出/消耗（cold=1 中性基准）===');
console.log('foodRate(cold=1,relief=0)=', SB.economy.foodRate(S, 1, 0).toFixed(3), '/s');
console.log('foodUse=', SB.economy.foodUse(S).toFixed(3), '/s');
console.log('净（cold=1）=', (SB.economy.foodRate(S, 1, 0) - SB.economy.foodUse(S)).toFixed(3), '/s');

console.log('\n=== 真实 tick 步进 600 秒（含季节 cold）===');
const emit = (m) => { if (/饿死|冻死|破壳/.test(m)) console.log('  [event]', m); };
const kelp0 = S.res.kelp, coral0 = S.res.coral, t0 = S.t, pop0 = S.pop;
let err = null;
try {
  for (let i = 0; i < 600; i++) {
    SB.economy.tick(S, 1, emit);
    if (i % 100 === 99) {
      console.log(`  +${(i+1)}s: kelp=${S.res.kelp.toFixed(2)} coral=${S.res.coral.toFixed(1)} t=${S.t.toFixed(1)} pop=${S.pop}`);
    }
  }
} catch (e) { err = e; }
console.log('kelp Δ=', (S.res.kelp - kelp0).toFixed(2), '| coral Δ=', (S.res.coral - coral0).toFixed(1), '| t Δ=', (S.t - t0).toFixed(1), '| pop', pop0, '→', S.pop);
if (err) console.log('!!! TICK 抛异常:\n', err.stack);
else console.log('tick 600s 无异常');
