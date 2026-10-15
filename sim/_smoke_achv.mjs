/* 成就接入冒烟测试：验证 SB.achv 装载、ID 未回填时跳过、dev 模拟解锁、
 * 以及破壳钩子 onBreak 的去重与「仅最高档」判定。 */
import { loadAll } from './load-sb.mjs';
import path from 'path'; import { fileURLToPath } from 'node:url';
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

console.log('=== 2. ID 回填状态（写死于 config.js）===');
ok('readyKeys = 5 条', SB.achv.readyKeys().length === 5);
ok('missingKeys 为空', SB.achv.missingKeys().length === 0);
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

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
