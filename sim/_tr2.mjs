import { loadAll, mulberry32 } from './load-sb.mjs';
import path from 'path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function mkEl(id){const el={id,_html:'',textContent:'',value:'',checked:false,dataset:{},style:{},children:[],onclick:null,_classes:new Set(id==='modal'?['hidden']:[]),classList:{add(c){el._classes.add(c);},remove(c){el._classes.delete(c);},contains(c){return el._classes.has(c);},toggle(c,on){if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);}else if(on)el._classes.add(c);else el._classes.delete(c);}},appendChild(c){el.children.push(c);},removeChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;}};Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});return el;}
function makeDoc(){const els=new Map();return {_els:els,readyState:'complete',body:mkEl('body'),getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},createElement(t){const e=mkEl('x');return e;},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},_ev:{}};}
const store=new Map();
const sandbox={console,document:makeDoc(),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},_intervals:[],setInterval(){},clearInterval(){},_timeouts:[],setTimeout(){},clearTimeout(){},Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);
function configure(s){s.t=0;s._seasonIdx=0;s.frozen=false;s.broken=false;s.era=7;if(!s.perk)s.perk=(SB.state&&SB.state.emptyPerks)?SB.state.emptyPerks():{};s.pop=30;s.peak=30;s.jobs={gather:35,coralwright:2,quarrier:1,miner:1,scholar:1,scribe:0,merchant:1};Object.assign(s.lvl,{kelp:40,kelpstore:2,ballast:100,nest:20,siltpit:10,library:8,institute:4,school:3,researchlab:2,furnace:4,hydroturbine:2,hydroshop:2,caravanserai:2,temple:3});s.res=Object.assign(s.res||{},{kelp:10000,coral:10000,stone:10000,silt:10000,warmstone:10000,iron:1000,science:1000,culture:1000,luxury:1000,faith:1000,fuel:1000,hydro:0,steel:0});s.civics={trade:1,theology:1,explore:1,market:1};s.civShown={};s.techs={};for(const t of SB.TECHS||[])s.techs[t.id]=true;s.eurekaMet={};s._grow=0;s.famine=0;s.warmOn=false;s.ad={on:false,ms:0};if(SB.folk&&SB.folk.reconcile)SB.folk.reconcile(s);s.pop=SB.economy.popCap(s);s.peak=s.pop;s.happy=0;s.coldTicks=0;s.warmBurning=false;s._seasonGrantPending=false;}
const SEED=20260928, STEP=0.1;
function mk(){SB.rng=mulberry32(SEED);SB.game.resetRun();const s=SB.game.run();configure(s);return s;}
function clone(x){return JSON.parse(JSON.stringify(x));}
const st=mk();st.t=1200;st._seasonIdx=2;st.frozen=true;st.warmOn=true;st.res.warmstone=10000;
const s=clone(st);
const chunk=SB.CFG.OFFLINE_STEP;
SB.__trace=[];
let rem=500,g=0;
while(rem>1e-9&&g++<1e7){const dt=Math.min(chunk,rem);const tc=s.t;SB.economy.tick(s,dt,null,{skipFoodPop:true,skipHappy:true});SB.offline.integrateFoodPop(s,dt,{t0:tc},null);rem-=dt;}
// print trace rows where kelp near 0 / famine changing, around first death t~1447
const T=SB.__trace;
console.log('total microsteps:',T.length);
// find where famine first >0
let firstFam=T.findIndex(r=>r.fam>0);
console.log('first famine at idx',firstFam,'at t=',firstFam>=0?T[firstFam].at:'-');
// print rows from firstFam-2 to firstFam+65 (one cycle)
for(let i=Math.max(0,firstFam-3);i<Math.min(T.length,firstFam+66);i++){const r=T[i];console.log(`i=${i} at=${r.at} kelp=${r.kelp} fam=${r.fam} pop=${r.pop} warm=${r.warm}${r.fam===0&&i>firstFam?'  <== famine reset!':''}`);}
