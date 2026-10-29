/* e2e suite: meta.perks 迁移的幂等性（2026-10-29 P0 事故的回归锁）
 *
 * 事故：`migratePerks` 的幂等哨兵用的是「旧 id 名单里有任意一个 ⇒ 未迁移」，而名单里
 *   有 7 个 id 与现行 TIDE_TREE 节点重名（autoEvent / housePlan / autoCraft1-3 /
 *   autoStudy / autoCivic）⇒ 买过任一个的玩家**每次启动**都重跑迁移 ⇒ 新体系节点被整片
 *   删除、spent 不退。真机复现：7 节点 → 一次重载 → 只剩 autoCraft1。
 *
 * 本 suite 钉的就是「这件事不许再发生」：
 *   ① 新体系节点（autoClick / craftQuota1 / minerPact1…）迁移后必须还在；
 *   ② 连跑两次结果逐字相同（幂等）；
 *   ③ 老档该迁的还得迁对（不能为了修 ① 把 ③ 丢掉）；
 *   ④ 退役项不许复活。
 * ⚠️ 判据是 `SB.state.loadMeta()` 的**真实返回值**（走生产的读档路径），不是复算函数。
 *   写盘键会临时改成构造的 meta，跑完恢复原值 —— 不能污染后续 suite 的夹具。
 */
import fs from 'node:fs';
import { ROOT } from '../load-sb.mjs';

export async function run({ SB, check, sandbox }) {
  console.log('\n=== 跨周目 perks 迁移（幂等 / 保留存量）===');
  const KEY = SB.CFG.SAVE_KEY;
  const backup = sandbox.localStorage.getItem(KEY);

  function roundtrip(meta) {
    sandbox.localStorage.setItem(KEY, JSON.stringify(meta));
    return SB.state.loadMeta();
  }
  function perkKeys(m) { return Object.keys(m.perks || {}).sort().join(','); }

  /* ① 玩家 19:36 那份存档的真实形状：全是新体系 id，一个旧 id 都没有
   *    （唯一「像旧 id」的 autoCraft1 同时也是潮汐之树节点 —— 正是事故的引信）。 */
  const live = {
    tide: 8, spent: 50, tideEarnedTotal: 58, cycle: 3, rebirths: 2,
    perks: { autoCraft1: 1, autoClick: 1, craftQuota1: 1, craftQuota2: 1,
      minerPact1: 1, quarryPact1: 1, furnaceBoost1: 1 }
  };
  const wantLive = 'autoClick,autoCraft1,craftQuota1,craftQuota2,furnaceBoost1,minerPact1,quarryPact1';
  const m1 = roundtrip(live);
  check('买过 autoCraft1 的档：7 个节点一次都没被删', perkKeys(m1) === wantLive,
    '实际 ' + perkKeys(m1));
  check('买过 autoCraft1 的档：轮回点账本不动', m1.tide === 8 && m1.spent === 50 && m1.tideEarnedTotal === 58,
    'tide=' + m1.tide + ' spent=' + m1.spent + ' earned=' + m1.tideEarnedTotal);
  check('迁移后写入显式版本键 perksVersion', m1.perksVersion === 1, String(m1.perksVersion));

  /* ② 幂等：把 ① 的结果再读一次（= 玩家重启），必须逐字相同。 */
  const m2 = roundtrip(JSON.parse(JSON.stringify(m1)));
  check('再启动一次：perks 逐字不变（幂等）',
    JSON.stringify(m2.perks) === JSON.stringify(m1.perks), perkKeys(m2));

  /* ③ 真·老档（纯旧 id）照旧要迁对：craftQuota L3 / mineTax L1 / furnaceBoost L1 /
   *    autoCraft1 / autoClicker1 ⇒ 链映射 + 桥接 + 改名，旧键一个不留。 */
  const legacy = {
    tide: 0, spent: 35, tideEarnedTotal: 35, cycle: 1,
    perks: { craftQuota: 3, mineTax: 1, furnaceBoost: 1, autoCraft1: 1, autoClicker1: 1 }
  };
  const m3 = roundtrip(legacy);
  const wantLegacy = 'autoClick,autoCraft1,craftQuota1,craftQuota2,furnaceBoost1,minerPact1,quarryPact1';
  check('纯旧 id 的老档：链映射结果与事故前一致', perkKeys(m3) === wantLegacy, '实际 ' + perkKeys(m3));
  check('纯旧 id 的老档：旧键全部消失（无 craftQuota / mineTax / autoClicker1）',
    !('craftQuota' in m3.perks) && !('mineTax' in m3.perks) && !('autoClicker1' in m3.perks));

  /* ④ 老档迁完再启动一次 —— 这一条就是 2026-10-29 事故的复现形态，必须不变。 */
  const m4 = roundtrip(JSON.parse(JSON.stringify(m3)));
  check('老档迁移后再启动一次：不再塌成只剩 autoCraft1（事故形态）',
    perkKeys(m4) === wantLegacy, '实际 ' + perkKeys(m4));

  /* ⑤ 退役项不许复活（food / g1 是「买入后丢弃、不退款」的设计，不是 bug）。 */
  const retired = { tide: 0, spent: 9, tideEarnedTotal: 9, perks: { food: 1, g1: 3, autoCraft1: 1 } };
  const m5 = roundtrip(retired);
  check('退役项不复活（food / g1 丢弃，只留 autoCraft1）', perkKeys(m5) === 'autoCraft1', '实际 ' + perkKeys(m5));

  /* ⑥ 已写过版本的档，迁移函数必须完全不动它（哪怕里面是脏 id）。 */
  const frozen = { tide: 1, spent: 1, tideEarnedTotal: 2, perksVersion: 1, perks: { someFutureNode: 2 } };
  const m6 = roundtrip(frozen);
  check('perksVersion 已存在 ⇒ 迁移一行都不动', perkKeys(m6) === 'someFutureNode', '实际 ' + perkKeys(m6));

  sandbox.localStorage.setItem(KEY, backup);   // 还原夹具

  /* ⑦ 启动侧守卫：周目在、跨周目缺失时，不许拿空 meta 接着玩（会清零轮回点）。
   *    两条分支都要在：`decideRun`（同步主路径，线上真正走的那条）与 `bootTap`（异步三源扫描）。
   *    只能用源码判据（真要跑 decideRun 得整套 boot 夹具），故断言「守卫分支存在」——这是
   *    **回归绊线**，不是行为断言；行为已用真机 CDP 验过（tmp/_saveprobe/t_verify_metaguard.mjs）。 */
  const gameSrc = fs.readFileSync(ROOT + '/src/game.js', 'utf8');
  check('启动侧：缺 meta 的候选不再被空 meta 覆盖（bootTap 守卫存在）',
    gameSrc.indexOf('if (!best.metaRaw) {') >= 0);
  check('启动侧：decideRun 主路径也有 meta 缺失守卫', gameSrc.indexOf("boot: 'meta-missing'") >= 0);
}
