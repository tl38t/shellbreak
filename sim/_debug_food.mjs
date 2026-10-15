/* 调试：对照参考路径（0.1s tick）与半解耦子步，逐值打印 kelp/pop/famine。
 * 场景 ② 寒流季·口粮穿零（t=1200, frozen, warmOn=false, kelp=50）
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadAll, mulberry32 } from './load-sb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STEP = 0.1;

function mkEl(id) {
  const el = { id, _html: '', textContent: '', value: '', checked: false, dataset: {}, style: {}, children: [], onclick: null,
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: { add(c){el._classes.add(c);}, remove(c){el._classes.delete(c);}, contains(c){return el._classes.has(c);},
      toggle(c,on){ if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);} else if(on) el._classes.add(c); else el._classes.delete(c);} },
    appendChild(c){el.children.push(c);}, removeChild(){}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
    querySelector(sel){ if(typeof sel==='string'&&sel.charAt(0)==='#') return doc.getElementById(sel.slice(1)); return null; } };
  Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});
  return el;
}
function makeDoc() {
  const els=new Map(); const q={};
  const doc={ _els:els,_q:q,readyState:'complete',body:mkEl('body'),
    getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},
    createElement(t){const e=mkEl('new-'+t);e.tag=t;return e;},
    querySelectorAll(sel){ if(q[sel])return q[sel]; let out=[];
      if(sel==='.tab')out=['village','folk','tech','civic','faith','workshop','wonder','company','meta'].map((t,i)=>{const e=mkEl('tab-'+t);e.dataset.tab=t;e._tab=i;return e;});
      else if(sel==='.spd')out=[1,5,10,20].map(s=>{const e=mkEl('spd-'+s);e.dataset.spd=String(s);return e;});
      q[sel]=out;return out; },
    querySelector(sel){const m=/^\.tab\[data-tab="([^"]+)"\]$/.exec(sel||'');if(!m)return null;const list=this.querySelectorAll('.tab');for(const t of list)if(t.dataset.tab===m[1])return t;return null;},
    addEventListener(){}, _ev:{} };
  return doc;
}
const store=new Map();
const sandbox={ console, document:makeDoc(),
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  performance:{now:()=>0}, _intervals:[], setInterval(fn){sandbox._intervals.push(fn);return sandbox._intervals.length;}, clearInterval(){},
  _timeouts:[], setTimeout(fn){sandbox._timeouts.push(fn);return sandbox._timeouts.length;}, clearTimeout(){},
  Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);

function configure(s) {
  s.t=0; s._seasonIdx=0; s.frozen=false; s.broken=false; s.era=7;
  s.pop=30; s.peak=30;
  s.jobs={gather:35,coralwright:2,quarrier:1,miner:1,scholar:1,scribe:0,merchant:1};
  s.lvl={kelp:40,kelpstore:2,ballast:100,nest:20,siltpit:10,library:8,institute:4,school:3,researchlab:2,furnace:4,hydroturbine:2,hydroshop:2,caravanserai:2,temple:3};
  s.res=Object.assign(s.res||{},{kelp:10000,coral:10000,stone:10000,silt:10000,warmstone:10000,iron:1000,science:1000,culture:1000,luxury:1000,faith:1000,fuel:1000,hydro:0,steel:0});
  s.civics={trade:1,theology:1,explore:1,market:1}; s.civShown={};
  s.techs={}; for(const t of SB.TECHS||[]) s.techs[t.id]=true;
  s.eurekaMet={}; s._grow=0; s.famine=0; s.warmOn=false; s.ad={on:false,ms:0};
  s.pop=SB.economy.popCap(s); s.peak=s.pop;
  s.happy=0; s.coldTicks=0; s.warmBurning=false; s._seasonGrantPending=false;
}
function makeState(){ SB.rng=mulberry32(20260928); SB.game.resetRun(); const s=SB.game.run(); configure(s); return s; }
function clone(s){ return JSON.parse(JSON.stringify(s)); }

const SEED=20260928;
// ---- 场景 ② ----
const base=makeState();
const st=clone(base);
st.t=1200; st._seasonIdx=2; st.frozen=true; st.warmOn=false; st.res.kelp=50;

console.log('popCap =', SB.economy.popCap(st));
console.log('isFull =', SB.economy.isFull(st));
console.log('foodRate(s,0.25,0) =', SB.economyInternals.foodRate(st, 0.25, 0).toFixed(4));
console.log('foodUse =', SB.economyInternals.foodUse(st).toFixed(4));
console.log('warmBurningNow =', SB.economyInternals.warmBurningNow(st));
console.log('foodNextBoundary =', SB.offline.foodNextBoundary(st));

console.log('\n--- 参考 0.1s × 20 (2s) ---');
SB.rng=mulberry32(SEED);
let sR=clone(st);
for(let i=1;i<=20;i++){
  SB.economy.tick(sR, STEP, null);
  console.log(`t=${sR.t.toFixed(1)} kelp=${sR.res.kelp.toFixed(2)} pop=${sR.pop} famine=${sR.famine.toFixed(2)} happy=${sR.happy.toFixed(4)} warmB=${sR.warmBurning}`);
}

console.log('\n--- 半解耦 1 chunk dt=2 ---');
SB.rng=mulberry32(SEED);
let sD=clone(st);
const tc=sD.t;
SB.economy.tick(sD, 2, null, { skipFoodPop: true });
console.log(`[after tick skipFoodPop] t=${sD.t} kelp=${sD.res.kelp.toFixed(2)} pop=${sD.pop} happy=${sD.happy.toFixed(4)} warmB=${sD.warmBurning}`);
// 手动复刻 integrateFoodPop 子步打印
const P=SB.economyInternals;
let at=tc, remaining=2, guard=0;
while(remaining>1e-9 && guard++<1000){
  const b0=SB.offline.foodNextBoundary(sD);
  let b = (!(b0<remaining))?remaining:b0;
  if(b<=1e-9) b=remaining;
  const cold=P.isCold(sD)?P.coldSeasonMul(sD):1;
  const warm=P.warmRelief(sD,b);
  const produce=P.foodRate(sD,cold,warm);
  const consume=P.foodUse(sD);
  console.log(`  substep b=${b.toFixed(4)} cold=${cold.toFixed(3)} warm=${warm.toFixed(3)} produce=${produce.toFixed(4)} consume=${consume.toFixed(4)} kelpBefore=${sD.res.kelp.toFixed(2)} popBefore=${sD.pop} famineBefore=${sD.famine.toFixed(2)}`);
  SB.offline.integrateFoodPop(sD, b, { t0: at }, null);
  console.log(`    -> kelp=${sD.res.kelp.toFixed(2)} pop=${sD.pop} famine=${sD.famine.toFixed(2)} happy=${sD.happy.toFixed(4)}`);
  at+=b; remaining-=b;
}
