/* e2e suite: 科技读档迁移不应把当前存活 id 误迁走（攻城学重复研究回归锁）。
 *
 * 根因（2026-11-12 客户反馈「攻城学研究过、重新进又提示要研究」）：
 *   LEGACY_MAP 里 `siegeT: 'skydrill'` 把现纪元三存活节点「攻城学」(id=siegeT) 在每次读档时
 *   改写成「天穹钻机」(skydrill)，导致攻城学读回来变未研究、页签红点复燃、玩家重复研究。
 * 修复：state-migrate.js 在套 legacy 前先建 `_curTechIds`，当前存活 id 直过、不再被迁。
 *
 * 本套件锁：
 *   ① 研究攻城学 → 读档 round-trip 后 siegeT 仍在、skydrill 不被误点亮；
 *   ② 攻城学 + 天穹钻机 可同存（不再互斥）；
 *   ③ 真正已删除的旧 id（pick → skydrill）仍正确迁移；
 *   ④ 彻底删除的旧 id（ignition/heat）被丢弃、不污染运行状态；
 *   ⑤ 已研究天穹钻机的当前玩家不受回归影响。
 */
export function run({ SB, check }) {
  console.log('\n=== Tech migrate (攻城学重复研究回归锁) ===');

  const mig = SB.state.migrateRun;

  // 防御：确认 siegeT / skydrill 都是当前存活科技 id（假设本身成立，否则本锁无意义）
  const curIds = (SB.TECHS || []).map(t => t.id);
  check('前提：siegeT(攻城学) 与 skydrill(天穹钻机) 均为当前存活科技 id',
    curIds.includes('siegeT') && curIds.includes('skydrill'),
    JSON.stringify({ siegeT: curIds.includes('siegeT'), skydrill: curIds.includes('skydrill') }));

  // ① 研究攻城学 → 读档后 siegeT 仍在、skydrill 不被误点亮
  {
    const m = mig({ techs: { siegeT: true } });
    check('① 研究攻城学读档后 siegeT 仍为真、skydrill 不被误点亮',
      m.techs.siegeT === true && m.techs.skydrill !== true,
      JSON.stringify({ siegeT: !!m.techs.siegeT, skydrill: !!m.techs.skydrill }));
  }

  // ② 攻城学 + 天穹钻机 可同存（不再互斥）
  {
    const m = mig({ techs: { siegeT: true, skydrill: true } });
    check('② 攻城学 + 天穹钻机 可同存（siegeT 与 skydrill 各自保真）',
      m.techs.siegeT === true && m.techs.skydrill === true,
      JSON.stringify({ siegeT: !!m.techs.siegeT, skydrill: !!m.techs.skydrill }));
  }

  // ③ 真正已删除的旧 id（pick → skydrill）仍正确迁移
  {
    const m = mig({ techs: { pick: true } });
    check('③ 旧 id pick 仍正确迁到 skydrill（已删旧 id 才走 legacy）',
      m.techs.skydrill === true && m.techs.pick !== true,
      JSON.stringify({ skydrill: !!m.techs.skydrill, pick: !!m.techs.pick }));
  }

  // ④ 彻底删除的旧 id（ignition/heat）被丢弃、不污染运行状态
  {
    const m = mig({ techs: { ignition: true, heat: true } });
    check('④ 彻底删除的旧 id（ignition/heat）被丢弃、不污染 techs',
      m.techs.ignition !== true && m.techs.heat !== true,
      JSON.stringify({ ignition: !!m.techs.ignition, heat: !!m.techs.heat }));
  }

  // ⑤ 已研究天穹钻机的当前玩家不受回归影响
  {
    const m = mig({ techs: { skydrill: true } });
    check('⑤ 已研究天穹钻机的当前玩家读档后 skydrill 仍为真',
      m.techs.skydrill === true,
      JSON.stringify({ skydrill: !!m.techs.skydrill }));
  }
}
