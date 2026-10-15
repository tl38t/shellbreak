import vm from 'node:vm';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadAll, mulberry32 } from './load-sb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function mkEl(id){const el={id,_html:'',textContent:'',value:'',checked:false,dataset:{},style:{},children:[],onclick:null,_classes:new Set(id==='modal'?['hidden']:[]),classList:{add(c){el._classes.add(c);},remove(c){el._classes.delete(c);},contains(c){return el._classes.has(c);},toggle(c,on){if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);}else if(on)el._classes.add(c);else el._classes.delete(c);}},appendChild(c){el.children.push(c);},removeChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(sel){if(typeof sel==='string'&&sel.charAt(0)==='#')return doc.getElementById(sel.slice(1));const cls=String(sel||'').replace(/^[.#]/,'');if(!cls)return null;if(String(el._html||'').indexOf(cls)>=0){if(!el._q)el._q={};if(!el._q[cls])el._q[cls]=mkEl(cls);return el._q[cls];}return null;}};Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});return el;}
function makeDoc(){const els=new Map();const q={};const doc={_els:els,_q:q,readyState:'complete',body:mkEl('body'),getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},createElement(tag){const e=mkEl('new-'+tag);e.tag=tag;return e;},querySelectorAll(sel){if(q[sel])return q[sel];let out=[];if(sel==='.tab')out=['village','folk','tech','civic','faith','workshop','wonder','company','meta'].map((t,i)=>{const e=mkEl('tab-'+t);e.dataset.tab=t;e._tab=i;return e;});else if(sel==='.spd')out=[1,5,10,20].map(s=>{const e=mkEl('spd-'+s);e.dataset.spd=String(s);return e;});q[sel]=out;return out;},querySelector(sel){const m=/^\.tab\[data-tab="([^"]+)"\]$/.exec(sel||'');if(!m)return null;const list=this.querySelectorAll('.tab');for(const t of list)if(t.dataset.tab===m[1])return t;return null;},addEventListener(type,fn){(doc._ev=doc._ev||{})[type]=(doc._ev[type]||[]);doc._ev[type].push(fn);},_ev:{}};return doc;}

const store=new Map();
const sandbox={console,document:makeDoc(),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},_intervals:[],setInterval(fn){sandbox._intervals.push(fn);return sandbox._intervals.length;},clearInterval(){},_timeouts:[],setTimeout(fn){sandbox._timeouts.push(fn);return sandbox._timeouts.length;},clearTimeout(){},Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);
const P = SB.economyInternals;
const STEP=0.1;

function configure(s){
  s.t=0;s._seasonIdx=0;s.frozen=false;s.broken=false;s.era=7;
  if(!s.perk)s.perk=(SB.state&&SB.state.emptyPerks)?SB.state.emptyPerks():{};
  s.pop=30;s.peak=30;
  s.jobs={gather:35,coralwright:2,quarrier:1,miner:1,scholar:1,scribe:0,merchant:1};
  Object.assign(s.lvl,{kelp:40,kelpstore:2,ballast:100,nest:20,siltpit:10,library:8,institute:4,school:3,researchlab:2,furnace:4,hydroturbine:2,hydroshop:2,caravanserai:2,temple:3});
  s.res=Object.assign(s.res||{},{kelp:10000,coral:10000,stone:10000,silt:10000,warmstone:10000,iron:1000,science:1000,culture:1000,luxury:1000,faith:1000,fuel:1000,hydro:0,steel:0});
  s.civics={trade:1,theology:1,explore:1,market:1};s.civShown={};
  s.techs={};for(const t of SB.TECHS||[])s.techs[t.id]=true;
  s.eurekaMet={};s._grow=0;s.famine=0;s.warmOn=false;s.ad={on:false,ms:0};
  if(SB.folk&&SB.folk.reconcile)SB.folk.reconcile(s);
  s.pop=SB.economy.popCap(s);s.peak=s.pop;
  s.happy=0;s.coldTicks=0;s.warmBurning=false;s._seasonGrantPending=false;
}
function makeState(){SB.rng=mulberry32(20260928);SB.game.resetRun();const s=SB.game.run();configure(s);return s;}
function clone(s){return JSON.parse(JSON.stringify(s));}

// scenario ⑥ setup (warm, t=0)
const st = makeState();
const s6 = clone(st);

console.log('=== 场景⑥ 单 chunk (dt=2s) 对照 ===');
console.log('初始: pop='+s6.pop+' kelp='+s6.res.kelp.toFixed(2)+' happy='+s6.happy+' warmOn='+s6.warmOn);

// 参考：20 个 0.1s tick
const ref = clone(s6);
let refKelpStart = ref.res.kelp;
let refEvents=0, refPopStart=ref.pop;
for(let i=1;i<=20;i++){
  SB.economy.tick(ref, STEP, function(m){refEvents++;});
}
let refKelpDelta = ref.res.kelp - refKelpStart;

// 半解耦：tick(skipFoodPop,2) + integrateFoodPop(2)
const dec = clone(s6);
let decKelpStart = dec.res.kelp;
SB.economy.tick(dec, 2, null, { skipFoodPop: true });
let decAfterTick = dec.res.kelp; // 应注意 food 没动，但 happy 被改
SB.offline.integrateFoodPop(dec, 2, { t0: 0 }, null);
let decKelpDelta = dec.res.kelp - decKelpStart;

console.log('\n--- 参考(20×0.1s) ---');
console.log('kelp 起='+refKelpStart.toFixed(2)+' 末='+ref.res.kelp.toFixed(2)+' Δ='+refKelpDelta.toFixed(4));
console.log('pop='+ref.pop+' happy='+ref.happy.toFixed(4)+' _grow='+ref._grow.toFixed(3));
console.log('famineDeaths='+ref.famineDeaths+' frostDeaths='+ref.frostDeaths);

console.log('\n--- 半解耦(tick跳过food + integrate) ---');
console.log('tick(skipFoodPop) 后 kelp='+decAfterTick.toFixed(2)+' (food段未跑, 应=起值 '+decKelpStart.toFixed(2)+')');
console.log('kelp 起='+decKelpStart.toFixed(2)+' 末='+dec.res.kelp.toFixed(2)+' Δ='+decKelpDelta.toFixed(4));
console.log('pop='+dec.pop+' happy='+dec.happy.toFixed(4)+' _grow='+dec._grow.toFixed(3));
console.log('famineDeaths='+dec.famineDeaths+' frostDeaths='+dec.frostDeaths);

console.log('\n--- 速率函数直查(初始状态 s6) ---');
console.log('globalMul='+P.globalMul(s6).toFixed(6));
console.log('foodRate(s,1,0)='+P.foodRate(s6,1,0).toFixed(6));
console.log('foodUse(s)='+P.foodUse(s6).toFixed(6));
console.log('civicKelpPerSec='+ (function(){var cv=(SB.civic&&SB.civic.flow)?SB.civic.flow(s6):null;return cv&&cv.kelp?cv.kelp*P.globalMul(s6):0;})().toFixed(6));

console.log('\n--- 速率函数直查(参考跑完20tick后的 ref 状态) ---');
console.log('globalMul='+P.globalMul(ref).toFixed(6));
console.log('foodRate='+P.foodRate(ref,1,0).toFixed(6));
console.log('foodUse='+P.foodUse(ref).toFixed(6));

console.log('\n--- 速率函数直查(半解耦跑完后的 dec 状态) ---');
console.log('globalMul='+P.globalMul(dec).toFixed(6));
console.log('foodRate='+P.foodRate(dec,1,0).toFixed(6));
console.log('foodUse='+P.foodUse(dec).toFixed(6));

console.log('\nΔ 差(ref-decoupled)='+(refKelpDelta-decKelpDelta).toFixed(4));
