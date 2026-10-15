/* 直接驱动 e2e 的 offline-fastforward 套件，看它真实判定（PASS/FAIL）。 */
import vm from 'node:vm';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadAll } from './load-sb.mjs';
import { run as runOffline } from './e2e-suites/offline-fastforward.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mkEl(id) {
  const el = {
    id, _html: '', textContent: '', value: '', checked: false, dataset: {}, style: {}, children: [], onclick: null,
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: { add(c){el._classes.add(c);}, remove(c){el._classes.delete(c);}, contains(c){return el._classes.has(c);},
      toggle(c,on){ if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);} else if(on) el._classes.add(c); else el._classes.delete(c);} },
    appendChild(c){el.children.push(c);}, removeChild(){}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
    querySelector(sel){ if(typeof sel==='string'&&sel.charAt(0)==='#') return doc.getElementById(sel.slice(1)); const cls=String(sel||'').replace(/^[.#]/,''); if(!cls) return null; if(String(el._html||'').indexOf(cls)>=0){ if(!el._q)el._q={}; if(!el._q[cls])el._q[cls]=mkEl(cls); return el._q[cls];} return null; }
  };
  Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});
  return el;
}
function makeDoc(){ const els=new Map(); const q={}; const doc={
  _els:els,_q:q,readyState:'complete',body:mkEl('body'),
  getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},
  createElement(tag){const e=mkEl('new-'+tag);e.tag=tag;return e;},
  querySelectorAll(sel){ if(q[sel])return q[sel]; let out=[];
    if(sel==='.tab') out=['village','folk','tech','civic','faith','workshop','wonder','company','meta'].map((t,i)=>{const e=mkEl('tab-'+t);e.dataset.tab=t;e._tab=i;return e;});
    else if(sel==='.spd') out=[1,5,10,20].map(s=>{const e=mkEl('spd-'+s);e.dataset.spd=String(s);return e;});
    q[sel]=out; return out; },
  querySelector(sel){const m=/^\.tab\[data-tab="([^"]+)"\]$/.exec(sel||'');if(!m)return null;const list=this.querySelectorAll('.tab');for(const t of list)if(t.dataset.tab===m[1])return t;return null;},
  addEventListener(type,fn){(doc._ev[type]=doc._ev[type]||[]).push(fn);},_ev:{} };
  return doc;
}
const store=new Map();
const sandbox={ console, document:makeDoc(),
  localStorage:{getItem:k=>(store.has(k)?store.get(k):null),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  performance:{now:()=>0}, _intervals:[], setInterval(fn){sandbox._intervals.push(fn);return sandbox._intervals.length;}, clearInterval(){},
  _timeouts:[], setTimeout(fn){sandbox._timeouts.push(fn);return sandbox._timeouts.length;}, clearTimeout(){},
  Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);
const doc=sandbox.document;

let pass=0, fail=0;
function check(name, cond, detail){ if(cond){pass++;console.log('  ✓ '+name+(detail?'  '+detail:''));} else {fail++;console.log('  ✗ '+name+(detail?'  '+detail:''));} }

console.log('=== e2e offline-fastforward 套件真实判定 ===');
runOffline({ SB, check });
console.log(`\n结果: PASS=${pass}  FAIL=${fail}`);
process.exit(fail>0?1:0);
