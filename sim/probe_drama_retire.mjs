import { loadNoDom } from './load-sb.mjs';
const { ctx, SB } = loadNoDom({});
const out = [];
let pass = 0, fail = 0;
function ok(n, c, e) { out.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? '  [' + e + ']' : '')); c ? pass++ : fail++; }

// 模拟 pool() 的过滤：只有 cardOwned 为 true 的卡才进卡库列表
function inPool(s, id) { return SB.civic.cardOwned(s, id); }

// ── 场景 1：只完成 drama（戏剧与诗歌自己的市政）→ 卡应出现 ──
{
  const s = SB.state.freshRun(false);
  s.civics = { drama: true };            // 完成《戏剧与诗歌》市政
  ok('仅 drama：card_drama 在卡库里（出现）', inPool(s, 'card_drama') === true);
}

// ── 场景 2：再完成 rationing（后继卡 政治经济学 的市政）→ 戏剧与诗歌应直接消失 ──
{
  const s = SB.state.freshRun(false);
  s.civics = { drama: true, rationing: true };
  ok('drama+rationing：card_drama 从卡库消失', inPool(s, 'card_drama') === false, 'cardOwned=' + SB.civic.cardOwned(s, 'card_drama'));
  ok('drama+rationing：政治经济学(card_political_econ) 此时在卡库里', inPool(s, 'card_political_econ') === true);
}

// ── 场景 3：支架行为不变——rationing 没完成前，后继卡也不该凭空出现 ──
{
  const s = SB.state.freshRun(false);
  s.civics = { drama: true };
  ok('仅 drama：政治经济学 尚未出现（rationing 没完成）', inPool(s, 'card_political_econ') === false);
}

console.log(out.join('\n'));
console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
