/* 实测 renderAll / renderTick 的 JS 侧单次开销（假 DOM，无 layout/paint，仅 JS 串构+状态读）。
 * 目的：量化 C 项（renderAll 节流/增量）的改造对象到底吃多少，给「有没有必要」一个底。
 * 频率是硬事实：renderAll 走 PANE_REFRESH=2000ms → 0.5Hz；renderTick 走主循环每帧。 */
import { loadAll } from './load-sb.mjs';

function attrToDataKey(attr) {
  return attr.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}
function escHtml(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function serializeAttrs(el) {
  const out = [];
  if (el.id && !String(el.id).startsWith('new-')) out.push('id="' + escHtml(el.id) + '"');
  const cls = el._classes && el._classes.size ? Array.from(el._classes).join(' ') : '';
  if (cls) out.push('class="' + escHtml(cls) + '"');
  const attrs = el._attrs || {};
  for (const k in attrs) {
    if (k === 'id' || k === 'class') continue;
    out.push(k + '="' + escHtml(attrs[k]) + '"');
  }
  const ds = el.dataset || {};
  for (const dk in ds) {
    const ak = 'data-' + String(dk).replace(/[A-Z]/g, ch => '-' + ch.toLowerCase());
    if (!(ak in attrs)) out.push(ak + '="' + escHtml(ds[dk]) + '"');
  }
  return out.length ? ' ' + out.join(' ') : '';
}
function serializeChildren(el) {
  let out = '';
  for (let i = 0; i < el.children.length; i++) {
    const c = el.children[i];
    if (!c) continue;
    if (c.nodeType === 3) { out += escHtml(c.textContent); continue; }
    const tag = c.tag || 'div';
    const inner = c._html !== '' ? c._html : (c.children.length ? serializeChildren(c) : escHtml(c._text || ''));
    out += '<' + tag + serializeAttrs(c) + '>' + inner + '</' + tag + '>';
  }
  return out;
}
function mkEl(id, doc) {
  const isText = id === '#text';
  const el = {
    id, nodeType: isText ? 3 : 1, _html: '', _text: '', value: '', checked: false,
    _attrs: Object.create(null), dataset: {},
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    children: [], parentNode: null, onclick: null, options: [],
    _classes: new Set(id === 'modal' ? ['hidden'] : []),
    classList: {
      add(c){el._classes.add(c);}, remove(c){el._classes.delete(c);}, contains(c){return el._classes.has(c);},
      toggle(c,on){ if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);} else if(on) el._classes.add(c); else el._classes.delete(c);}
    },
    appendChild(c){
      if (!c) return c;
      if (c.parentNode && c.parentNode !== el && typeof c.parentNode.removeChild === 'function') c.parentNode.removeChild(c);
      c.parentNode = el;
      el.children.push(c);
      if (c.tag === 'option' && el.options.indexOf(c) < 0) el.options.push(c);
      if (el._onMut) el._onMut('appendChild', c);
      return c;
    },
    removeChild(c){
      const idx = el.children.indexOf(c);
      if (idx >= 0) el.children.splice(idx, 1);
      if (c && c.parentNode === el) c.parentNode = null;
      if (c && c.tag === 'option') { const oi = el.options.indexOf(c); if (oi >= 0) el.options.splice(oi, 1); }
      if (el._onMut) el._onMut('removeChild', c);
      return c;
    },
    addEventListener(){},
    setAttribute(k, v){
      const sv = String(v); el._attrs[k] = sv;
      if (k === 'class') el.className = sv;
      else if (k === 'id') el.id = sv;
      else if (k && k.indexOf('data-') === 0) el.dataset[attrToDataKey(k)] = sv;
    },
    getAttribute(k){
      if (k === 'class') return (el._classes.size || 'class' in el._attrs) ? el.className : null;
      if (k === 'id') return el.id || null;
      if (k in el._attrs) return el._attrs[k];
      if (k && k.indexOf('data-') === 0) { const dk = attrToDataKey(k); if (dk in el.dataset) return String(el.dataset[dk]); }
      return null;
    },
    removeAttribute(k){
      delete el._attrs[k];
      if (k === 'class') el._classes.clear();
      else if (k && k.indexOf('data-') === 0) delete el.dataset[attrToDataKey(k)];
    },
    querySelector(sel){
      if(typeof sel==='string'&&sel.charAt(0)==='#') return doc.getElementById(sel.slice(1));
      const cls=String(sel||'').replace(/^[.#]/,'');
      if(!cls) return null;
      if(String(el.innerHTML||'').indexOf(cls)>=0){ if(!el._q)el._q={}; if(!el._q[cls])el._q[cls]=mkEl(cls, doc); return el._q[cls]; }
      return null;
    }
  };
  Object.defineProperty(el,'className',{
    get(){ return Array.from(el._classes).join(' '); },
    set(v){ el._classes = new Set(String(v||'').trim().split(/\s+/).filter(Boolean)); }
  });
  Object.defineProperty(el,'textContent',{
    get(){
      if (el.nodeType === 3) return el._text;
      if (el.children.length) return el.children.map(c => c.textContent).join('');
      return el._text || (el._html ? el._html.replace(/<[^>]+>/g, '') : '');
    },
    set(v){
      el._text = String(v == null ? '' : v);
      if (el.nodeType !== 3) { el._html = ''; el.children.length = 0; el.options.length = 0; }
    }
  });
  Object.defineProperty(el,'innerHTML',{
    get(){ return el._html !== '' ? el._html : (el.children.length ? serializeChildren(el) : ''); },
    set(v){
      el._html = String(v); el._text = ''; el.children.length = 0; el.options.length = 0;
      if (el._onMut) el._onMut('innerHTML', v);
    }
  });
  return el;
}
function makeDoc(){
  const els=new Map(), q={};
  const doc={ _els:els,_q:q, readyState:'complete',
    getElementById(id){ if(!els.has(id)) els.set(id,mkEl(id, doc)); return els.get(id); },
    createElement(tag){ const e=mkEl('new-'+tag, doc); e.tag=tag; return e; },
    createTextNode(t){ const e=mkEl('#text', doc); e.textContent=String(t); return e; },
    querySelectorAll(sel){ if(q[sel]) return q[sel]; let out=[];
      if(sel==='.tab') out=['village','folk','tech','civic','faith','diplomacy','workshop','wonder','company','meta','challenges','star-map','achievements'].map((t,i)=>{const e=mkEl('tab-'+t, doc);e.dataset.tab=t;e._tab=i;return e;});
      else if(sel==='.spd') out=[1,5,10,20].map(s=>{const e=mkEl('spd-'+s, doc);e.dataset.spd=String(s);return e;});
      q[sel]=out; return out; },
    querySelector(sel){ const m=/^\.tab\[data-tab="([^"]+)"\]$/.exec(sel||''); if(!m) return null; const list=this.querySelectorAll('.tab'); for(const t of list) if(t.dataset.tab===m[1]) return t; return null; },
    addEventListener(){}, _ev:{} };
  doc.body = mkEl('body', doc);
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

// 遥测计数：统计单次 renderAll 对隐藏面板 innerHTML 的写入次数，以及 renderTick 对 #res 子节点的变更次数
const PANE_IDS = [
  'pane-village-body', 'pane-folk', 'pane-tech', 'pane-civic', 'pane-faith-body',
  'pane-diplomacy', 'pane-workshop', 'pane-workshop-upgrades', 'pane-wonder', 'pane-company-body', 'pane-meta',
  'pane-veil', 'pane-challenges', 'pane-star-map', 'pane-achievements'
];
let paneWriteTotal = 0;
let paneWriteActive = 0;
let paneWriteHidden = 0;
const curTab = SB.game.getTab ? SB.game.getTab() : 'village';
const paneIdByTab = {
  village: 'pane-village-body', folk: 'pane-folk', tech: 'pane-tech', civic: 'pane-civic',
  faith: 'pane-faith-body', diplomacy: 'pane-diplomacy', workshop: 'pane-workshop', 'workshop-upgrades': 'pane-workshop-upgrades',
  wonder: 'pane-wonder', company: 'pane-company-body', meta: 'pane-meta', veil: 'pane-veil',
  challenges: 'pane-challenges', 'star-map': 'pane-star-map', achievements: 'pane-achievements'
};
const activePaneId = paneIdByTab[curTab] || 'pane-' + curTab;
for (const pid of PANE_IDS) {
  const el = sandbox.document.getElementById(pid);
  el._onMut = (kind) => {
    if (kind === 'innerHTML') {
      paneWriteTotal++;
      if (pid === activePaneId) paneWriteActive++;
      else paneWriteHidden++;
    }
  };
}
let resMutations = 0;
sandbox.document.getElementById('res')._onMut = () => { resMutations++; };
// 筛选和密度应保留按钮。切换建筑图标会改变卡片结构。
SB.ui.renderParts.setVillageDensity('compact');
SB.ui.renderParts.setVillageFilter('ready');
renderAll();
if (paneWriteTotal) throw new Error('筛选和切换密度不应重写建筑列表');
SB.ui.render.toggleBuildingIcons();
run.era = 6;
run.lvl.coral = (run.lvl.coral || 0) + 1;
run.res.kelp = (run.res.kelp || 0) + 100;
renderAll();
console.log('\n=== DOM 写入遥测 ===');
console.log(`当前页签=${curTab} · 变化态单次 renderAll #pane 写入: 总计=${paneWriteTotal} (当前=${paneWriteActive}, 隐藏=${paneWriteHidden})`);
const resBeforeTick = resMutations;
renderTick();
console.log(`稳态单次 renderTick #res DOM 结构变更 (innerHTML/appendChild/removeChild): ${resMutations - resBeforeTick}`);

if (paneWriteActive < 1 || paneWriteHidden || resMutations !== resBeforeTick) {
  throw new Error('变动态必须刷新当前面板，隐藏面板与稳态资源格应保持原状');
}
