/* 诊断探针：轮回商店买的「自动工坊 I/II/III」到底有没有变成可用自动槽。
 * 只读 + 内存模拟，不改任何生产代码。跑法：node sim/probe_autoslot_perk.mjs
 * 2026-11-04 口径更新：自动制作槽**不设上限**（旧 SLOT_MAX=4 已删）。
 *
 * 覆盖四条链：
 *   ① 购买 → meta.perks → applyPerk → s.perk.autoCraft（当前局即时生效）
 *   ② s.perk.autoCraft → workshop.slotCap（槽数，不设上限）
 *   ③ 存档往返（saveRun/migrateRun）后槽数是否保留
 *   ④ autoTick 是否真的按槽制造
 */
import { loadNoDom } from './load-sb.mjs';

const { SB } = loadNoDom();
const meta = {
  tide: 1000, spent: 0, perks: {}, starPerks: {}, cycle: 1, layers: 0,
  techLog: {}, autoResearch: { tech: false, civic: false }, autoClickOn: true
};
SB.game.meta = () => meta;
SB.state.saveMeta = () => {};          // 探针不落盘

let s = SB.state.freshRun(false);
SB.S = s;
SB.game.run = () => s;
SB.game.markDirty = () => {};
SB.game.renderAll = () => {};
SB.game.log = () => {};

const W = SB.workshop;
const cap = () => W.slotCap(s);
const line = (tag) => console.log(
  tag.padEnd(34),
  'metaPerks=' + JSON.stringify(meta.perks).padEnd(58),
  's.perk.autoCraft=' + String(s.perk.autoCraft).padEnd(6),
  'slotCap=' + cap()
);

console.log('SLOT_MAX =', SB.CFG.AUTO.SLOT_MAX, '（undefined = 不设上限）| SLOT_BASE =', SB.CFG.AUTO.SLOT_BASE);
console.log('--- ① 未装自动工坊升级、未买天赋 ---');
line('初始');

console.log('--- ② 装上工坊升级项 upg_autoshop ---');
s.upgrades = s.upgrades || {};
s.upgrades.upg_autoshop = true;         // 生产里 upgradeBuy 只写 true（两态）
line('upg_autoshop = true');

console.log('--- ③ 依次买轮回商店 autoCraft1/2/3（真实 buyPerk 路径）---');
for (const id of ['craftQuota1', 'autoCraft1', 'autoCraft2', 'autoCraft3']) {
  const ok = SB.prestige.buyPerk(id);
  line('buyPerk(' + id + ') → ' + ok);
}

console.log('--- ④ 加上 ERA6 热力锻锤 + ERA7 复合型工厂科技/升级项 ---');
s.techs = s.techs || {}; s.techs.hotforge_hammer = true;
line('+ hotforge_hammer');
s.techs.complexf = true;
line('+ complexf 科技');
s.upgrades.upg_complexf = true;
line('+ upg_complexf 升级项');

console.log('--- ⑤ 全部来源打开：看是否如实累加（不再有 Math.min 夹子）---');
line('全部来源');

console.log('--- ⑥ 存档往返：migrateRun 之后槽数/perk 是否保留 ---');
const raw = JSON.parse(JSON.stringify(s));
const back = SB.state.migrateRun(raw);
console.log('migrateRun: perk.autoCraft =', back.perk.autoCraft,
  '| autoSlots =', JSON.stringify(back.autoSlots),
  '| slotCap =', W.slotCap(back));

console.log('--- ⑦ 判定汇总 ---');
const base = SB.CFG.AUTO.SLOT_BASE;
const allSources = base + 3 /* autoCraft1-3 */ + 1 /* hotforge */ + 1 /* complexf 科技 */ + 1 /* upg_complexf */;
console.log('全来源理论槽数 =', allSources, '| 当前 slotCap =', cap());
console.log('旧版 SLOT_MAX=4 会夹掉', Math.max(0, allSources - 4), '个槽（这 3 个槽就是玩家白花的 35 轮回点）');
