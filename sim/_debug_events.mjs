import { loadAll, mulberry32 } from './load-sb.mjs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function mkEl(id){const el={id,_html:'',textContent:'',value:'',checked:false,dataset:{},style:{},children:[],onclick:null,_classes:new Set(id==='modal'?['hidden']:[]),classList:{add(c){el._classes.add(c);},remove(c){el._classes.delete(c);},contains(c){return el._classes.has(c);},toggle(c,on){if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);}else if(on)el._classes.add(c);else el._classes.delete(c);}},appendChild(c){el.children.push(c);},removeChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;}};Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});return el;}
function makeDoc(){const els=new Map();return {_els:els,readyState:'complete',body:mkEl('body'),getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},createElement(t){const e=mkEl('x');return e;},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},_ev:{}};}
const store=new Map();
const sandbox={console,document:makeDoc(),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},_intervals:[],setInterval(){},clearInterval(){},_timeouts:[],setTimeout(){},clearTimeout(){},Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);
function configure(s){s.t=0;s._seasonIdx=0;s.frozen=false;s.broken=false;s.era=7;if(!s.perk)s.perk=(SB.state&&SB.state.emptyPerks)?SB.state.emptyPerks():{};s.pop=30;s.peak=30;s.jobs={gather:35,coralwright:2,quarrier:1,miner:1,scholar:1,scribe:0,merchant:1};Object.assign(s.lvl,{kelp:40,kelpstore:2,ballast:100,nest:20,siltpit:10,library:8,institute:4,school:3,researchlab:2,furnace:4,hydroturbine:2,hydroshop:2,caravanserai:2,temple:3});s.res=Object.assign(s.res||{},{kelp:10000,coral:10000,stone:10000,silt:10000,warmstone:10000,iron:1000,science:1000,culture:1000,luxury:1000,faith:1000,fuel:1000,hydro:0,steel:0});s.civics={trade:1,theology:1,explore:1,market:1};s.civShown={};s.techs={};for(const t of SB.TECHS||[])s.techs[t.id]=true;s.eurekaMet={};s._grow=0;s.famine=0;s.warmOn=false;s.ad={on:false,ms:0};if(SB.folk&&SB.folk.reconcile)SB.folk.reconcile(s);s.pop=SB.economy.popCap(s);s.peak=s.pop;s.happy=0;s.coldTicks=0;s.warmBurning=false;s._seasonGrantPending=false;}
SB.rng=mulberry32(20260928);SB.game.resetRun();const base=SB.game.run();configure(base);
const clone=x=>JSON.parse(JSON.stringify(x));

// scenario ①: t=1200 frozen warmOn warmstone=10
function setup(s){s.t=1200;s._seasonIdx=2;s.frozen=true;s.warmOn=true;s.res.warmstone=10;}

// REFERENCE
SB.rng=mulberry32(20260928);
let r=clone(base);setup(r);
let refEv=[];
for(let i=0;i<5000;i++){SB.economy.tick(r,0.1,function(m){refEv.push({t:+r.t.toFixed(3),m,pop:r.pop});});}
// DECOUPLED
SB.rng=mulberry32(20260928);
let d=clone(base);setup(d);
let decEv=[];
let remaining=500,guard=0;
while(remaining>1e-9&&guard++<1e7){const dt=Math.min(2,remaining);const tc=d.t;SB.economy.tick(d,dt,null,{skipFoodPop:true,skipHappy:true});SB.offline.integrateFoodPop(d,dt,{t0:tc},function(m,tm){decEv.push({t:+tm.toFixed(3),m,pop:d.pop});});remaining-=dt;}

console.log('ref frost events (first 12):');
console.log(refEv.filter(e=>e.m.indexOf('冻')>=0).slice(0,12).map(e=>e.t+'s pop'+e.pop).join('  '));
console.log('dec frost events (first 12):');
console.log(decEv.filter(e=>e.m.indexOf('冻')>=0).slice(0,12).map(e=>e.t+'s pop'+e.pop).join('  '));
console.log('\nref famine events (first 12):');
console.log(refEv.filter(e=>e.m.indexOf('饿')>=0).slice(0,12).map(e=>e.t+'s pop'+e.pop).join('  '));
console.log('dec famine events (first 12):');
console.log(decEv.filter(e=>e.m.indexOf('饿')>=0).slice(0,12).map(e=>e.t+'s pop'+e.pop).join('  '));
// first divergence
let n=Math.min(refEv.length,decEv.length);
for(let i=0;i<n;i++){if(refEv[i].t!==decEv[i].t||refEv[i].m!==decEv[i].m){console.log('\nfirst divergence at idx',i,': ref',refEv[i],'dec',decEv[i]);break;}}
