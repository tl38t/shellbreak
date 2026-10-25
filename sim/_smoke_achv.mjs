/* 成就接入冒烟测试：验证 SB.achv 装载、ID 未回填时跳过、dev 模拟解锁、
 * 破壳钩子 onBreak 的去重与「仅最高档」判定；
 * 2026-10-24 成就墙实装（docs/ACHV_DESIGN_v0.3.md）后扩充：62 条 DEFS
 * （5 旧 + 12 新静态 + 45 派生）、unlockOnce 两层记账、syncMeta 宽限补发、
 * sweepMeta/progressOf/recheckBuildings、checkTechAll/checkCivicAll。 */
import { loadAll } from './load-sb.mjs';
import path from 'path'; import { fileURLToPath } from 'node:url';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mkEl(id){const el={id,_html:'',textContent:'',value:'',checked:false,dataset:{},style:{},children:[],onclick:null,_classes:new Set(id==='modal'?['hidden']:[]),classList:{add(c){el._classes.add(c);},remove(c){el._classes.delete(c);},contains(c){return el._classes.has(c);},toggle(c,on){if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);}else if(on)el._classes.add(c);else el._classes.delete(c);}},appendChild(c){el.children.push(c);},removeChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;}};Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});return el;}
function makeDoc(){const els=new Map();return {_els:els,readyState:'complete',body:mkEl('body'),getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},createElement(){return mkEl('x');},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},_ev:{}};}
const store=new Map();
const sandbox={console,document:makeDoc(),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat,location:{search:''}};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);

let pass=0, fail=0;
function ok(name, cond){ if(cond){pass++;console.log('  PASS', name);} else {fail++;console.log('  FAIL', name);} }

console.log('=== 1. 模块装载 ===');
ok('SB.achv 存在', !!SB.achv);
ok('init 是函数', typeof SB.achv.init === 'function');
ok('onBreak 是函数', typeof SB.achv.onBreak === 'function');
ok('unlock 是函数', typeof SB.achv.unlock === 'function');
ok('unlockOnce 是函数', typeof SB.achv.unlockOnce === 'function');
ok('syncMeta 是函数', typeof SB.achv.syncMeta === 'function');
ok('sweepMeta 是函数', typeof SB.achv.sweepMeta === 'function');
ok('progressOf 是函数', typeof SB.achv.progressOf === 'function');
ok('checkTechAll 是函数', typeof SB.achv.checkTechAll === 'function');
ok('checkCivicAll 是函数', typeof SB.achv.checkCivicAll === 'function');

console.log('=== 2. ID 回填状态（写死于 config.js）===');
ok('readyKeys = 5 条', SB.achv.readyKeys().length === 5);
ok('missingKeys = 57 条（12 静态 + 45 bld_* 全占位）', SB.achv.missingKeys().length === 57);
ok('cold ID 正确', SB.CFG.ACHV.cold === 'SHELLBREAK_COLD');
ok('small ID 正确', SB.CFG.ACHV.small === 'SHELLBREAK_SMALL');
ok('science ID 正确', SB.CFG.ACHV.science === 'SHELLBREAK_SCIENCE');
ok('abyss ID 正确', SB.CFG.ACHV.abyss === 'SHELLBREAK_ABYSS');
ok('firstRebirth ID 正确', SB.CFG.ACHV.firstRebirth === 'SHELLBREAK_FIRST_REBIRTH');
// 占位防线：临时置 '0' 仍须被跳过（与 rank 同口径）
const _saveAll = Object.assign({}, SB.CFG.ACHV);
SB.CFG.ACHV.cold = '0';
ok('占位 "0" => readyKeys 少一条', SB.achv.readyKeys().length === 4);
ok('占位 "0" => unlock 返 false', SB.achv.unlock('cold') === false);
Object.assign(SB.CFG.ACHV, _saveAll);
ok('还原后 readyKeys 回 5', SB.achv.readyKeys().length === 5);
ok('生产环境无 SDK => available() false', SB.achv.available() === false);

console.log('=== 3. dev 模拟（?achvtest）===');
sandbox.location.search = '?achvtest';
SB.achv._reset(); SB.achv.init();
ok('devMode 为真', SB.achv.devMode() === true);
ok('available() dev => true', SB.achv.available() === true);
const _saveCold = SB.CFG.ACHV.cold;
SB.CFG.ACHV.cold = '0';        // dev 只免 SDK，不免 ID
ok('dev 但 ID 未回填 => 仍跳过（与 rank 同口径）', SB.achv.unlock('cold') === false);
SB.CFG.ACHV.cold = _saveCold;
ok('dev + 真ID => true（免 SDK）', SB.achv.unlock('cold') === true);
sandbox.location.search = '';

console.log('=== 4. 假 tap：真 ID + SDK，解锁走 mgr ===');
let called = [];
SB.CFG.ACHV.cold = 'ACHV_COLD_ID';
SB.CFG.ACHV.science = 'ACHV_SCI_ID';
sandbox.tap = { createAchievementManager(){ return { registerListener(){}, unlockAchievement(o){ called.push(o.achievementId); } }; } };
SB.achv._reset();
ok('unlock(cold) 真ID => true', SB.achv.unlock('cold') === true);
ok('mgr 收到 cold 的 ID', called.indexOf('ACHV_COLD_ID') >= 0);

console.log('=== 5. onBreak 去重 + 仅最高档 ===');
called = [];
SB.achv._reset();
const meta = { shopUnlocked: true };
// 首次破壳：解锁 firstRebirth（真 ID 未填 => 不写 done）
SB.CFG.ACHV.firstRebirth = 'ACHV_RB_ID';
SB.achv.onBreak({ challengeClear: null }, meta);
ok('firstRebirth 已解锁', meta.achievements && meta.achievements.firstRebirth === true);
ok('mgr 收到 firstRebirth', called.indexOf('ACHV_RB_ID') >= 0);
const n1 = called.length;
SB.achv.onBreak({ challengeClear: null }, meta);
ok('第二次破壳不重复解锁 firstRebirth', called.length === n1);
// 挑战：science 第二档（非最高）不应解锁
SB.achv.onBreak({ challengeClear: { id: 'science', tier: 0, name: '忽视科文' } }, meta);
ok('science 非最高档不解锁', called.indexOf('ACHV_SCI_ID') < 0);
// science 最高档（tiers.length=3 => tier 2）应解锁
SB.achv.onBreak({ challengeClear: { id: 'science', tier: 2, name: '忽视科文' } }, meta);
ok('science 最高档解锁', called.indexOf('ACHV_SCI_ID') >= 0);
ok('science 计入 meta.achievements', meta.achievements.science === true);

console.log('=== 6. DEFS 62 条（5 旧 + 12 新静态 + 45 派生）===');
var defs = SB.achv.allDefs();
ok('allDefs = 62 条', defs.length === 62);
var bldDefs = defs.filter(function (d) { return !!d.bld; });
ok('派生 bld_* = 45 条', bldDefs.length === 45);
ok('前 17 条为静态', defs.slice(0, 17).every(function (d) { return !d.bld; }));
var B = SB.BUILDINGS || [];
ok('bld_* 与 SB.BUILDINGS 一一对应', bldDefs.length === B.length &&
  bldDefs.every(function (d, i) { return d.bld === B[i].id; }));
var zoneIds = {};
(SB.BUILD_ZONES || []).forEach(function (z) { zoneIds[z.id] = true; });
ok('派生 zone 全部合法', bldDefs.every(function (d) { return zoneIds[d.zone]; }));
ok('派生 desc 非空', bldDefs.every(function (d) { return !!d.desc; }));
ok('bld_kelp 名称正确', SB.achv.defOf('bld_kelp').name === '深海藻场：轻车熟路');
ok('bld_void_altar 名称正确', SB.achv.defOf('bld_void_altar').name === '虚境祭坛：轻车熟路');
ok('dysonEnd 更名为控星之人', SB.achv.defOf('dysonEnd').name === '控星之人');
ok('techAll 名称', SB.achv.defOf('techAll').name === '科技大成');
ok('civicAll 名称', SB.achv.defOf('civicAll').name === '市政大成');
ok('techAll desc 带全表数 83', (SB.achv.defOf('techAll').desc || '').indexOf('83') >= 0);
ok('civicAll desc 带全表数 69', (SB.achv.defOf('civicAll').desc || '').indexOf('69') >= 0);
ok('speedrun desc 存在', !!SB.achv.defOf('speedrun').desc);
ok('halfDyson desc 存在', !!SB.achv.defOf('halfDyson').desc);

console.log('=== 7. unlockOnce 两层记账（本地账本 vs 平台账本）===');
var m7 = {};
SB.CFG.ACHV.shellBreak = '0';           // 未回填
var r7 = SB.achv.unlockOnce('shellBreak', m7);
ok('首次记本地账返回 true', r7 === true);
ok('meta.achv.shellBreak = true（本地账）', m7.achv && m7.achv.shellBreak === true);
ok('未回填 ⇒ 平台账本不写（不假装成功）', !(m7.achievements && m7.achievements.shellBreak));
ok('二次调用返回 false（本地已记）', SB.achv.unlockOnce('shellBreak', m7) === false);
SB.CFG.ACHV.shellBreak = 'ACHV_SB_ID';  // 回填后补发
called = [];
var r7b = SB.achv.unlockOnce('shellBreak', m7);
ok('本地已记 ⇒ 仍返回 false', r7b === false);
ok('回填后补发平台账本', m7.achievements && m7.achievements.shellBreak === true);
ok('mgr 收到 shellBreak', called.indexOf('ACHV_SB_ID') >= 0);
ok('unlockOnce 无 meta 不炸', SB.achv.unlockOnce('shellBreak', null) === false);

console.log('=== 8. syncMeta 宽限补发 ===');
var m8a = { achievements: { cold: true } };                 // 老档：平台有、本地无
SB.achv.syncMeta(m8a);
ok('平台账本迁进本地账本', m8a.achv && m8a.achv.cold === true);
var m8b = { achv: { shellBreak: true } };                   // 本地有、平台没发过
called = [];
SB.achv.syncMeta(m8b);
ok('宽限补发平台账本', m8b.achievements && m8b.achievements.shellBreak === true);
ok('mgr 收到 shellBreak', called.indexOf('ACHV_SB_ID') >= 0);
ok('syncMeta 无 meta 不炸', SB.achv.syncMeta(null) === undefined || true);

console.log('=== 9. sweepMeta / progressOf / recheckBuildings ===');
var m9 = { religionSeen: true };
SB.achv.sweepMeta(m9);
ok('religionSeen ⇒ religion', m9.achv && m9.achv.religion === true);
var m9b = { rebirths: 10 };
SB.achv.sweepMeta(m9b);
ok('rebirths=10 ⇒ rebirth10', m9b.achv && m9b.achv.rebirth10 === true);
var m9c = { rebirths: 9 };
SB.achv.sweepMeta(m9c);
ok('rebirths=9 ⇒ 不解锁', !(m9c.achv && m9c.achv.rebirth10));
var w10 = {}; for (var wi = 0; wi < 10; wi++) w10['w' + wi] = true;
var m9d = { memorialWonders: w10 };
SB.achv.sweepMeta(m9d);
ok('入藏 10 座 ⇒ relic10', m9d.achv && m9d.achv.relic10 === true);
ok('入藏 10 座 ⇒ 无 relic25', !(m9d.achv && m9d.achv.relic25));
var p1 = SB.achv.progressOf('bld_kelp', { buildingLvlTotal: { kelp: 50 } }, { buildingLvlRun: { kelp: 60 } });
ok('bld 进度 = 跨周目 + 本周目增量', p1 && p1.cur === 110 && p1.max === 100);
ok('bld 进度 label', p1 && p1.label.indexOf('110') >= 0 && p1.label.indexOf('100') >= 0);
var p2 = SB.achv.progressOf('rebirth10', { rebirths: 3 }, null);
ok('rebirth10 进度', p2 && p2.cur === 3 && p2.max === 10);
var p3 = SB.achv.progressOf('relic25', { memorialWonders: w10 }, null);
ok('relic25 进度', p3 && p3.cur === 10 && p3.max === 25);
ok('事件型无进度', SB.achv.progressOf('cold', {}, null) === null);
var m9e = { buildingLvlTotal: { kelp: 100 } };
SB.achv.recheckBuildings(m9e);
ok('累计 100 ⇒ bld_kelp 补发', m9e.achv && m9e.achv['bld_kelp'] === true);
var m9f = { buildingLvlTotal: { kelp: 99 } };
SB.achv.recheckBuildings(m9f);
ok('累计 99 ⇒ 不补发', !(m9f.achv && m9f.achv['bld_kelp']));

console.log('=== 10. checkTechAll / checkCivicAll ===');
var T = SB.TECHS || [], C = SB.CIVICS || [];
ok('TECHS 全表 83', T.length === 83);
ok('CIVICS 全表 69', C.length === 69);
var m10 = {};
var s10a = { techs: {}, civics: {} };
for (var ti = 0; ti < T.length - 1; ti++) s10a.techs[T[ti].id] = true;
ok('82/83 不解锁', SB.achv.checkTechAll(s10a, m10) === false);
s10a.techs[T[T.length - 1].id] = true;
ok('83/83 解锁 techAll', SB.achv.checkTechAll(s10a, m10) === true);
ok('meta.achv.techAll = true', m10.achv && m10.achv.techAll === true);
ok('二次调用 false', SB.achv.checkTechAll(s10a, m10) === false);
var s10b = { techs: {}, civics: {} };
for (var ci = 0; ci < C.length - 1; ci++) s10b.civics[C[ci].id] = 1;
ok('68/69 不解锁', SB.achv.checkCivicAll(s10b, m10) === false);
s10b.civics[C[C.length - 1].id] = 1;
ok('69/69 解锁 civicAll', SB.achv.checkCivicAll(s10b, m10) === true);
ok('meta.achv.civicAll = true', m10.achv && m10.achv.civicAll === true);
// 脏键防线：s.techs 里混入已删科技 id 不应凑数
var s10c = { techs: {}, civics: {} };
for (var ti2 = 0; ti2 < T.length - 1; ti2++) s10c.techs[T[ti2].id] = true;
s10c.techs['removed_ghost_tech'] = true;
ok('脏键不凑数（82 真 + 1 脏仍不解锁）', SB.achv.checkTechAll(s10c, {}) === false);
ok('checkTechAll 无 meta 不炸', SB.achv.checkTechAll(s10a, null) === false);

console.log('=== 11. 页签拆分（2026-10-24：成就独立页签）===');
/* 只测模块级接线（导出 + PANE_KEYS）；渲染级拆分断言在 e2e challenges suite
 * （那边 boot 完整，paneChallenges/paneAchievements 走真实 S/meta 路径）。 */
ok('render 导出 paneChallenges', typeof SB.ui.render.paneChallenges === 'function');
ok('render 导出 paneAchievements', typeof SB.ui.render.paneAchievements === 'function');
ok('PANE_KEYS 含 achievements 且在 challenges 之后',
  SB.ui.render.PANE_KEYS.indexOf('achievements') > SB.ui.render.PANE_KEYS.indexOf('challenges'));
ok('DEFS 中 45 条 bld_* 仍按 BUILD_ZONES 归属（break 区无建筑，成就页自动隐藏空区）',
  bldDefs.every(function (d) { return zoneIds[d.zone]; }) &&
  new Set(bldDefs.map(function (d) { return d.zone; })).size === 8 &&
  zoneIds.break === true);

console.log('=== 12. 页签「?」静态守卫（2026-10-24 用户：挑战/成就曾漏挂）===');
/* 新增页签忘挂 .qbtn / INTRO 表漏条目 = 运行时无声无息（玩家点不到就没人发现，
 * 正是本轮用户截图抓到的问题）。这里直读 index.html 做静态核对：
 * 正向——每个 data-tab 必须有 qbtn 且引用的 key 在 INTRO 表；
 * 反向——INTRO 每个 key 都有页签（star-dome 是旧别名二级页，豁免）。 */
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
/* ⚠️ 正则必须容忍 class 与 data-tab 之间夹别的属性：tech/civic/faith 等页签
 * 带 id="tab-xxx"，写死 "class=\"tab[^\"]*\" data-tab=" 会漏掉 7 个（曾踩）。 */
const tabRe = /<div class="tab[^"]*"[^>]*data-tab="([a-z-]+)"[^>]*>([\s\S]*?)<\/div>/g;
let tm; const tabs = [];
while ((tm = tabRe.exec(html))) tabs.push({ key: tm[1], body: tm[2] });
ok('index.html 解析出 12 个页签', tabs.length === 12);
ok('每个页签都挂了 .qbtn', tabs.every(t => t.body.indexOf('class="qbtn"') >= 0));
const introKeys = Object.keys(SB.ui.renderContent.INTRO);
const used = [];
for (const t of tabs) {
  const m2 = t.body.match(/openIntro\('([a-z-]+)'\)/);
  if (m2) used.push(m2[1]);
}
ok('qbtn 引用的 key 全部在 INTRO 表', used.length === tabs.length && used.every(k => introKeys.indexOf(k) >= 0));
ok('INTRO 无游离 key（star-dome 旧别名豁免）',
  introKeys.every(k => k === 'star-dome' || tabs.some(t => t.key === k)));
ok('challenges 有 INTRO 条目', introKeys.indexOf('challenges') >= 0);
ok('achievements 有 INTRO 条目', introKeys.indexOf('achievements') >= 0);

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
