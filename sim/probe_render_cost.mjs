/* 实测 renderAll / renderTick 的 JS 侧单次开销（假 DOM，无 layout/paint，仅 JS 串构+状态读）。
 * 目的：量化 C 项（renderAll 节流/增量）的改造对象到底吃多少，给「有没有必要」一个底。
 * 频率是硬事实：renderAll 走 PANE_REFRESH=2000ms → 0.5Hz；renderTick 走主循环每帧。 */
import { loadAll } from './load-sb.mjs';

function mkEl(id) {
  const el = {
    id, _html: '', textContent: '', value: '', checked: false, dataset: {}, style: {}, children: [], onclick: null,
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: { add(c){el._classes.add(c);}, remove(c){el._classes.delete(c);}, contains(c){return el._classes.has(c);},
      toggle(c,on){ if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);} else if(on) el._classes.add(c); else el._classes.delete(c);} },
    appendChild(c){el.children.push(c);}, removeChild(){}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
    querySelector(sel){ if(typeof sel==='string'&&sel.charAt(0)==='#') return doc.getElementById(sel.slice(1)); const cls=String(sel||'').replace(/^[.#]/,''); if(!cls) return null; if(String(el._html||'').indexOf(cls)>=0){ if(!el._q)el._q={}; if(!el._q[cls])el._q[cls]=mkEl(cls); return el._q[cls]; } return null; }
  };
  Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});
  return el;
}
function makeDoc(){
  const els=new Map(), q={};
  const doc={ _els:els,_q:q, readyState:'complete', body:mkEl('body'),
    getElementById(id){ if(!els.has(id)) els.set(id,mkEl(id)); return els.get(id); },
    createElement(tag){ const e=mkEl('new-'+tag); e.tag=tag; return e; },
    querySelectorAll(sel){ if(q[sel]) return q[sel]; let out=[];
      if(sel==='.tab') out=['village','folk','tech','civic','faith','workshop','wonder','company','meta'].map((t,i)=>{const e=mkEl('tab-'+t);e.dataset.tab=t;e._tab=i;return e;});
      else if(sel==='.spd') out=[1,5,10,20].map(s=>{const e=mkEl('spd-'+s);e.dataset.spd=String(s);return e;});
      q[sel]=out; return out; },
    querySelector(sel){ const m=/^\.tab\[data-tab="([^"]+)"\]$/.exec(sel||''); if(!m) return null; const list=this.querySelectorAll('.tab'); for(const t of list) if(t.dataset.tab===m[1]) return t; return null; },
    addEventListener(){}, _ev:{} };
  return doc;
}
const store=new Map();
const sandbox={ console, document:makeDoc(),
  localStorage:{ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,v), removeItem:k=>store.delete(k) },
  performance:{ now:()=>Date.now() }, _intervals:[], setInterval(){}, clearInterval(){},
  setTimeout(){}, clearTimeout(){}, Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat };
sandbox.window=sandbox; sandbox.globalThis=sandbox;

const { SB } = loadAll(sandbox);
console.log('boot 完成，SB.game 存在 =', !!SB.game, ' run 存在 =', !!SB.game.run());

const run = SB.game.run();
// 给点进度，让面板有内容（解锁些科技/建筑，抬高 renderAll 串构量）
try {
  run.era = 4; run.lvl = run.lvl || {};
  for (const k of ['kelp','coral','iron','obsidian','tiplate','biomatlab']) run.lvl[k] = (run.lvl[k]||0)+3;
  if (run.res) { run.res.kelp = 5000; run.res.coral = 5000; run.res.iron = 5000; }
} catch(e){ console.log('进度注入跳过:', e.message); }

function bench(name, fn, n=200){
  // 预热
  for (let i=0;i<5;i++) fn();
  const t0=process.hrtime.bigint();
  for (let i=0;i<n;i++) fn();
  const t1=process.hrtime.bigint();
  const ms=Number(t1-t0)/1e6/n;
  console.log(`${name}: ${ms.toFixed(3)} ms/次  (×${n} 次平均, 仅 JS 串构+状态读, 无 layout/paint)`);
  return ms;
}

const renderAll = SB.ui.render.renderAll;
const renderTick = SB.ui.render.renderTick;
bench('renderAll ', () => renderAll(), 100);
bench('renderTick', () => renderTick(), 400);

// 频率换算（硬事实）
const PANE=2000, loopMs=250; // B 后主循环 250ms
console.log('\n=== 频率换算（墙钟） ===');
console.log(`renderAll: 每 ${PANE}ms 一次 = ${(1000/PANE).toFixed(2)} Hz → 单帧 ${''}`);
console.log(`  ⇒ 若 renderAll ≈ 8ms，则占单核 ${(8/(PANE/1000)*100).toFixed(2)}% 时间（0.4%）`);
console.log(`renderTick: 每 ${loopMs}ms 一次 = ${(1000/loopMs).toFixed(2)} Hz（B 后 4Hz；B 前 10Hz）`);
console.log(`  ⇒ B 后 renderTick 调用次数 = B 前的 ${(250/100).toFixed(1)} 分之一（同一 renderTick 成本下，JS 调用开销直降 ${(1-100/250)*100}%）`);
