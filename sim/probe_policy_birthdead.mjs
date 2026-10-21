import { loadNoDom } from './load-sb.mjs';
const { ctx, SB } = loadNoDom({});
const out = [];
let pass = 0, fail = 0;
function ok(n, c, e) { out.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? '  [' + e + ']' : '')); c ? pass++ : fail++; }

// pool() 只渲染 cardOwned 为 true 的卡；retiredBy 指向的市政一旦完成即 false（直接消失）。
function inPool(s, id) { return SB.civic.cardOwned(s, id); }

// ── 场景 1：planet_village 完成前 —— 新卡绝不可提前出现，旧卡正常在卡库 ──
{
  const s = SB.state.freshRun(false);
  s.civics = { mercantilism: true, theology: true }; // 旧卡各自的市政完成了，但 planet_village 还没
  ok('planet_village 前：重商主义(card_mercantilism) 仍可见', inPool(s, 'card_mercantilism') === true);
  ok('planet_village 前：神学(card_theology) 仍可见', inPool(s, 'card_theology') === true);
  ok('planet_village 前：跨国经济(card_transnational) 不该出现', inPool(s, 'card_transnational') === false);
  ok('planet_village 前：未来主义神学(card_future_theology) 不该出现', inPool(s, 'card_future_theology') === false);
}

// ── 场景 2：planet_village 完成 —— 旧卡退役消失，新卡（链尾）应当出现 ──
{
  const s = SB.state.freshRun(false);
  s.civics = { mercantilism: true, theology: true, planet_village: true };
  ok('planet_village 后：重商主义 退役消失', inPool(s, 'card_mercantilism') === false, 'cardOwned=' + SB.civic.cardOwned(s, 'card_mercantilism'));
  ok('planet_village 后：神学 退役消失', inPool(s, 'card_theology') === false, 'cardOwned=' + SB.civic.cardOwned(s, 'card_theology'));
  ok('planet_village 后：跨国经济 出现（出生即死 bug 已修）', inPool(s, 'card_transnational') === true, 'cardOwned=' + SB.civic.cardOwned(s, 'card_transnational'));
  ok('planet_village 后：未来主义神学 出现（出生即死 bug 已修）', inPool(s, 'card_future_theology') === true, 'cardOwned=' + SB.civic.cardOwned(s, 'card_future_theology'));
}

console.log(out.join('\n'));
console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
