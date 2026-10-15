import { loadAll, mulberry32 } from './load-sb.mjs';
import path from 'path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function mkEl(id){const el={id,_html:'',textContent:'',value:'',checked:false,dataset:{},style:{},children:[],onclick:null,_classes:new Set(id==='modal'?['hidden']:[]),classList:{add(c){el._classes.add(c);},remove(c){el._classes.delete(c);},contains(c){return el._classes.has(c);},toggle(c,on){if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);}else if(on)el._classes.add(c);else el._classes.delete(c);}},appendChild(c){el.children.push(c);},removeChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;}};Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});return el;}
function makeDoc(){const els=new Map();return {_els:els,readyState:'complete',body:mkEl('body'),getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},createElement(t){const e=mkEl('x');return e;},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},_ev:{}};}
const store=new Map();
const sandbox={console,document:makeDoc(),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},_intervals:[],setInterval(){},clearInterval(){},_timeouts:[],setTimeout(){},clearTimeout(){},Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);
const P = SB.economyInternals;
function configure(s){s.t=0;s._seasonIdx=0;s.frozen=false;s.broken=false;s.era=7;if(!s.perk)s.perk=(SB.state&&SB.state.emptyPerks)?SB.state.emptyPerks():{};s.pop=30;s.peak=30;s.jobs={gather:35,coralwright:2,quarrier:1,miner:1,scholar:1,scribe:0,merchant:1};Object.assign(s.lvl,{kelp:40,kelpstore:2,ballast:100,nest:20,siltpit:10,library:8,institute:4,school:3,researchlab:2,furnace:4,hydroturbine:2,hydroshop:2,caravanserai:2,temple:3});s.res=Object.assign(s.res||{},{kelp:10000,coral:10000,stone:10000,silt:10000,warmstone:10000,iron:1000,science:1000,culture:1000,luxury:1000,faith:1000,fuel:1000,hydro:0,steel:0});s.civics={trade:1,theology:1,explore:1,market:1};s.civShown={};s.techs={};for(const t of SB.TECHS||[])s.techs[t.id]=true;s.eurekaMet={};s._grow=0;s.famine=0;s.warmOn=false;s.ad={on:false,ms:0};if(SB.folk&&SB.folk.reconcile)SB.folk.reconcile(s);s.pop=SB.economy.popCap(s);s.peak=s.pop;s.happy=0;s.coldTicks=0;s.warmBurning=false;s._seasonGrantPending=false;}
SB.rng=mulberry32(20260928);SB.game.resetRun();const base=SB.game.run();configure(base);
const clone=x=>JSON.parse(JSON.stringify(x));

const dec=clone(base); dec.t=0;dec._seasonIdx=0;dec.frozen=false;dec.warmOn=false;dec.res.kelp=10000;
SB.economy.tick(dec,2,null,{skipFoodPop:true});
console.log('=== post tick(skipFoodPop,2s) dec state ===');
console.log('happy=',dec.happy,'pop=',dec.pop,'jobs=',JSON.stringify(dec.jobs));
console.log('globalMul=',P.globalMul(dec).toFixed(6));
console.log('foodRate(1,0)=',P.foodRate(dec,1,0).toFixed(6));
console.log('foodUse=',P.foodUse(dec).toFixed(6));
console.log('isFull=',SB.economy.isFull(dec),'popCap=',SB.economy.popCap(dec));
console.log('cv.kelp=', (SB.civic&&SB.civic.flow)?((SB.civic.flow(dec)||{}).kelp||0):'(no civic)');
console.log('kelp now=',dec.res.kelp.toFixed(4));
// Now run integrateFoodPop and watch
SB.offline.integrateFoodPop(dec,2,{t0:0},null);
console.log('after integrate kelp=',dec.res.kelp.toFixed(4));
