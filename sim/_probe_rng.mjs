import { loadAll, mulberry32 } from './load-sb.mjs';
import path from 'path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function mkEl(id){const el={id,_html:'',textContent:'',value:'',checked:false,dataset:{},style:{},children:[],onclick:null,_classes:new Set(id==='modal'?['hidden']:[]),classList:{add(c){el._classes.add(c);},remove(c){el._classes.delete(c);},contains(c){return el._classes.has(c);},toggle(c,on){if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);}else if(on)el._classes.add(c);else el._classes.delete(c);}},appendChild(c){el.children.push(c);},removeChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;}};Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});return el;}
function makeDoc(){const els=new Map();return {_els:els,readyState:'complete',body:mkEl('body'),getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},createElement(t){const e=mkEl('x');return e;},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},_ev:{}};}
const store=new Map();
const sandbox={console,document:makeDoc(),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},_intervals:[],setInterval(){},clearInterval(){},_timeouts:[],setTimeout(){},clearTimeout(){},Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);
function base(){SB.rng=mulberry32(20260928);SB.game.resetRun();const s=SB.game.run();
 s.t=0;s._seasonIdx=0;s.frozen=false;s.broken=false;s.era=7;if(!s.perk)s.perk=(SB.state&&SB.state.emptyPerks)?SB.state.emptyPerks():{};s.pop=30;s.peak=30;s.jobs={gather:35,coralwright:2,quarrier:1,miner:1,scholar:1,scribe:0,merchant:1};Object.assign(s.lvl,{kelp:40,kelpstore:2,ballast:100,nest:20,siltpit:10,library:8,institute:4,school:3,researchlab:2,furnace:4,hydroturbine:2,hydroshop:2,caravanserai:2,temple:3});s.res=Object.assign(s.res||{},{kelp:10000,coral:10000,stone:10000,silt:10000,warmstone:10000,iron:1000,science:1000,culture:1000,luxury:1000,faith:1000,fuel:1000,hydro:0,steel:0});s.civics={trade:1,theology:1,explore:1,market:1};s.civShown={};s.techs={};for(const t of SB.TECHS||[])s.techs[t.id]=true;s.eurekaMet={};s._grow=0;s.famine=0;s.warmOn=false;s.ad={on:false,ms:0};if(SB.folk&&SB.folk.reconcile)SB.folk.reconcile(s);s.pop=SB.economy.popCap(s);s.peak=s.pop;s.happy=0;s.coldTicks=0;s.warmBurning=false;s._seasonGrantPending=false;return s;}
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(s){s.t=1200;s._seasonIdx=2;s.frozen=true;s.warmOn=true;s.res.warmstone=10;}

// ---- PHASE A: reference ----
let sR=clone(base());setup(sR);
let rngLogR=[]; const realR=mulberry32(20260928);
SB.rng=function(){const v=realR();rngLogR.push(+sR.t.toFixed(3));return v;};
let refFrostT=null;
for(let i=0;i<5000;i++){SB.economy.tick(sR,0.1,function(m){if(m.indexOf('冻')>=0&&refFrostT===null)refFrostT=+sR.t.toFixed(3);});}
console.log('REF total rng draws:',rngLogR.length,'first frost at',refFrostT);

// ---- PHASE B: decoupled (fresh independent wrapper) ----
let sD=clone(base());setup(sD);
let rngLogD=[]; const realD=mulberry32(20260928);
SB.rng=function(){const v=realD();rngLogD.push(+sD.t.toFixed(3));return v;};
let decFrostT=null;
let remaining=500,guard=0;
while(remaining>1e-9&&guard++<1e7){const dt=Math.min(2,remaining);const tc=sD.t;SB.economy.tick(sD,dt,null,{skipFoodPop:true,skipHappy:true});SB.offline.integrateFoodPop(sD,dt,{t0:tc},function(m,tm){if(m.indexOf('冻')>=0&&decFrostT===null)decFrostT=+tm.toFixed(3);});remaining-=dt;}
console.log('DEC total rng draws:',rngLogD.length,'first frost at',decFrostT);

let n=Math.min(rngLogR.length,rngLogD.length);
let firstDiff=-1;
for(let i=0;i<n;i++){if(Math.abs(rngLogR[i]-rngLogD[i])>1e-9){firstDiff=i;break;}}
console.log('first rng-draw-time divergence at index',firstDiff, firstDiff>=0?('REF@'+rngLogR[firstDiff]+' DEC@'+rngLogD[firstDiff]):'(identical up to min length)');
if(firstDiff>=0){console.log('REF ctx:',rngLogR.slice(Math.max(0,firstDiff-3),firstDiff+3).join(','));console.log('DEC ctx:',rngLogD.slice(Math.max(0,firstDiff-3),firstDiff+3).join(','));}
