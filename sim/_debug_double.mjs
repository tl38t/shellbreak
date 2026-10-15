import { loadAll, mulberry32 } from './load-sb.mjs';
import vm from 'node:vm';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function mkEl(id){const el={id,_html:'',textContent:'',value:'',checked:false,dataset:{},style:{},children:[],onclick:null,_classes:new Set(id==='modal'?['hidden']:[]),classList:{add(c){el._classes.add(c);},remove(c){el._classes.delete(c);},contains(c){return el._classes.has(c);},toggle(c,on){if(on===undefined){el._classes.has(c)?el._classes.delete(c):el._classes.add(c);}else if(on)el._classes.add(c);else el._classes.delete(c);}},appendChild(c){el.children.push(c);},removeChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;}};Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=String(v);}});return el;}
function makeDoc(){const els=new Map();return {_els:els,readyState:'complete',body:mkEl('body'),getElementById(id){if(!els.has(id))els.set(id,mkEl(id));return els.get(id);},createElement(t){const e=mkEl('x');return e;},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},_ev:{}};}
const store=new Map();
const sandbox={console,document:makeDoc(),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},performance:{now:()=>0},_intervals:[],setInterval(){},clearInterval(){},_timeouts:[],setTimeout(){},clearTimeout(){},Math,Date,JSON,Object,Array,String,Number,Boolean,Set,Map,isNaN,parseInt,parseFloat};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const { SB } = loadAll(sandbox);
const P = SB.economyInternals;

function configure(s){s.t=0;s._seasonIdx=0;s.frozen=false;s.broken=false;s.era=7;if(!s.perk)s.perk=(SB.state&&SB.state.emptyPerks)?SB.state.emptyPerks():{};s.pop=30;s.peak=30;s.jobs={gather:35,coralwright:2,quarrier:1,miner:1,scholar:1,scribe:0,merchant:1};Object.assign(s.lvl,{kelp:40,kelpstore:2,ballast:100,nest:20,siltpit:10,library:8,institute:4,school:3,researchlab:2,furnace:4,hydroturbine:2,hydroshop:2,caravanserai:2,temple:3});s.res=Object.assign(s.res||{},{kelp:10000,coral:10000,stone:10000,silt:10000,warmstone:10000,iron:1000,science:1000,culture:1000,luxury:1000,faith:1000,fuel:1000,hydro:0,steel:0});s.civics={trade:1,theology:1,explore:1,market:1};s.civShown={};s.techs={};for(const t of SB.TECHS||[])s.techs[t.id]=true;s.eurekaMet={};s._grow=0;s.famine=0;s.warmOn=false;s.ad={on:false,ms:0};if(SB.folk&&SB.folk.reconcile)SB.folk.reconcile(s);s.pop=SB.economy.popCap(s);s.peak=s.pop;s.happy=0;s.coldTicks=0;s.warmBurning=false;s._seasonGrantPending=false;}

function civicKelp(s){var cv=(SB.civic&&SB.civic.flow)?SB.civic.flow(s):null;return cv&&cv.kelp?cv.kelp*P.globalMul(s):0;}

SB.rng=mulberry32(20260928);SB.game.resetRun();const base=SB.game.run();configure(base);
const clone=x=>JSON.parse(JSON.stringify(x));

// ---------- REFERENCE: 20 ticks of 0.1s, wrap addRes to log kelp writes ----------
const ref=clone(base);
let refKelpWrites=[];
const oAdd=P.addRes;
P.addRes=function(s,k,v){ if(k==='kelp') refKelpWrites.push({src:'addRes',v:+v.toFixed(4)}); return oAdd(s,k,v); };
const ck0=ref.res.kelp;
for(let i=0;i<20;i++) SB.economy.tick(ref,0.1,null);
P.addRes=oAdd;
console.log('=== REFERENCE 2s (20×0.1) ===');
console.log(' kelp:', ck0.toFixed(2), '->', ref.res.kelp.toFixed(2), ' net:', (ref.res.kelp-ck0).toFixed(2));
console.log(' foodUse-ish consume/step ~ (', (SB.economyInternals.foodUse(ref)).toFixed(2) ,')');
console.log(' civicKelp(s)=', civicKelp(ref).toFixed(4), ' (per sec)');
console.log(' addRes kelp writes:', refKelpWrites.length, JSON.stringify(refKelpWrites.slice(0,4)), '...');
// total direct kelp subtract via foodUse:
let refConsume=0;
// recompute consume by sampling: each tick consumes foodUse*0.1; but foodUse depends on pop which may grow
// just print pop
console.log(' pop after:', ref.pop, ' _grow:', ref._grow, ' famine:', ref.famine);

// ---------- DECOUPLED: 1 tick(skipFoodPop,2s) + integrateFoodPop(2s) ----------
const dec=clone(base);
let decKelpWrites=[];
P.addRes=function(s,k,v){ if(k==='kelp') decKelpWrites.push({src:'addRes',v:+v.toFixed(4)}); return oAdd(s,k,v); };
const dk0=dec.res.kelp;
const ch=dec.happy;
SB.economy.tick(dec,2,null,{skipFoodPop:true});
console.log('\n=== DECOUPLED after tick(skipFoodPop,2s) ===');
console.log(' kelp:', dk0.toFixed(2), '->', dec.res.kelp.toFixed(2), ' delta:', (dec.res.kelp-dk0).toFixed(2));
SB.offline.integrateFoodPop(dec,2,{t0:0,happy:ch},null);
P.addRes=oAdd;
console.log('=== DECOUPLED after integrateFoodPop(2s) ===');
console.log(' kelp:', dk0.toFixed(2), '->', dec.res.kelp.toFixed(2), ' net:', (dec.res.kelp-dk0).toFixed(2));
console.log(' addRes kelp writes (total):', decKelpWrites.length);
console.log('   first 6:', JSON.stringify(decKelpWrites.slice(0,6)));
console.log(' pop after:', dec.pop);

// ---------- MANUAL: what SHOULD foodRate*2 - consume*2 be? ----------
const fr=P.foodRate(dec,1,0), fu=P.foodUse(dec);
console.log('\nfoodRate(1,0)=',fr.toFixed(4),' foodUse=',fu.toFixed(4),' net/s=',(fr-fu).toFixed(4),' net*2=',((fr-fu)*2).toFixed(4));
console.log('civicKelp per sec =', civicKelp(dec).toFixed(4), ' *2 =', (civicKelp(dec)*2).toFixed(4));
console.log('expected REF net*2 (food only) =', ((fr-fu)*2).toFixed(4));
console.log('expected DEC net*2 (food only) =', ((fr-fu)*2).toFixed(4), '+ civic in tick =', (civicKelp(dec)*2).toFixed(4));
