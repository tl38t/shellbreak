/* 修复验收（2026-11-04）：自动制作槽「不设上限」+ 读档按账本重建 + complexf 科技给槽。
 * 只读 + 内存模拟，不改任何生产代码。跑法：node sim/probe_autoslot_cap.mjs
 * 退出码 0 = 全部断言通过；非 0 = 有断言失败（assert 会打印期望/实际）。 */
import { loadNoDom } from './load-sb.mjs';
import assert from 'node:assert/strict';
const { SB } = loadNoDom();
const meta = { tide: 1000, spent: 0, perks: {}, starPerks: {}, cycle: 3, layers: 0, techLog: {} };
SB.game.meta = () => meta;
SB.state.saveMeta = () => {};
let s = SB.state.freshRun(false);
SB.S = s; SB.game.run = () => s; SB.game.markDirty = () => {}; SB.game.renderAll = () => {};
const W = SB.workshop, cap = () => W.slotCap(s);

console.log('SLOT_MAX =', SB.CFG.AUTO.SLOT_MAX, '（应为 undefined = 不设上限）| SLOT_BASE =', SB.CFG.AUTO.SLOT_BASE);
assert.equal(SB.CFG.AUTO.SLOT_MAX, undefined, '上限常数必须已删除');
assert.equal(W.slotMax, undefined, 'slotMax() 必须已删除');

console.log('\n=== A. 晚期玩家：ERA6 热力锻锤 + ERA7《复合型工厂》科技/升级项 + 自动工坊升级 ===');
s.upgrades = { upg_autoshop: true, upg_complexf: true };
s.techs = { hotforge_hammer: true, complexf: true };
console.log('买之前 slotCap =', cap(), '（自带1 + 热锻1 + 科技1 + 升级项1 = 4；旧版在此已被夹死）');
assert.equal(cap(), 4);
for (const id of ['craftQuota1', 'autoCraft1', 'autoCraft2', 'autoCraft3']) {
  const before = cap();
  const ok = SB.prestige.buyPerk(id);
  const isSlot = /^autoCraft[123]$/.test(id);
  console.log(`  buyPerk(${id}) ok=${ok}  autoCraft=${s.perk.autoCraft}  slotCap ${before} -> ${cap()}  ` +
    (isSlot ? (cap() > before ? '✓ 涨了' : '✗ 没涨') : '(前置节点，本就不加槽)'));
  if (isSlot) assert.equal(cap(), before + 1, id + ' 必须兑现 +1 槽');
}
assert.equal(cap(), 7, '4 个非商店来源 + 3 档商店 = 7 槽，不应被夹到 4');
console.log('  ⇒ autoCraft2/3 那 35 轮回点现在各兑现 1 槽，合计 7 槽');

console.log('\n=== B. 存储不一致：meta.perks 已购，但存档是购买前的 s.perk ===');
const s2 = SB.state.freshRun(false);
s2.upgrades = { upg_autoshop: true };
s2.perk.autoCraft = 0;                 // 购买前写下的存档快照
const rawDirty = JSON.parse(JSON.stringify(s2));
meta.perks = { craftQuota1: 1, autoCraft1: 1, autoCraft2: 1, autoCraft3: 1 }; // 账本已买齐
const back = SB.state.migrateRun(rawDirty);
console.log('  migrateRun 后（只校验不重算）perk.autoCraft =', back.perk.autoCraft, '| slotCap =', W.slotCap(back));
assert.equal(back.perk.autoCraft, 0, '迁移本身不该重算（纪律：migrateRun 只校验）');
const changed = SB.state.syncDerivedPerks(back);   // 重算落在调用方 resumeRun
console.log('  syncDerivedPerks 后 changed =', changed, '| perk.autoCraft =', back.perk.autoCraft, '| slotCap =', W.slotCap(back));
assert.equal(changed, true, '账本与存档不一致时必须改动');
assert.equal(back.perk.autoCraft, 3);
assert.equal(W.slotCap(back), 4, '读档后槽数必须真的涨上来');
assert.equal(SB.state.syncDerivedPerks(back), false, '第二次同步必须幂等');

console.log('\n全部断言 PASS');
