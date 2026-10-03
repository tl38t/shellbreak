/* 天壳 · 可见的真实游戏 AI 玩家（浏览器内运行）
 * AI 通过游戏正式动作 API 操作当前页面这一局；经济结算与时代推进由 game.js 正常循环完成。
 */
(function (root) {
  'use strict';
  var SB = root.SB;
  if (!SB || !SB.game) return;
  var panel, timer, lastDecision = 0, started = false, logNode;

  function el(tag, text) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    return n;
  }
  function initPanel() {
    var style = el('style');
    style.textContent = '#ai-player-panel{position:fixed;right:16px;bottom:16px;z-index:99999;width:290px;background:#10201f;color:#e6f1df;border:1px solid #719b72;border-radius:12px;padding:12px 14px;box-shadow:0 8px 32px #0008;font:13px/1.5 system-ui,sans-serif}#ai-player-panel b{color:#b8df8a}#ai-player-panel button{border:0;border-radius:7px;padding:7px 10px;margin:7px 6px 6px 0;background:#6d9f53;color:#10201f;font-weight:700;cursor:pointer}#ai-player-panel button.stop{background:#344a43;color:#fff}#ai-player-panel .stats{margin-top:5px;color:#d1dfd1}#ai-player-panel .log{max-height:100px;overflow:auto;color:#a8c4a9;font-size:11px}';
    document.head.appendChild(style);
    panel = el('section'); panel.id = 'ai-player-panel';
    var title = el('strong', 'AI 自动游玩 · 真实游戏'); title.style.fontSize = '15px'; panel.appendChild(title);
    var buttons = el('div');
    var stop = el('button', '暂停 AI'); stop.className = 'stop'; stop.onclick = pause; buttons.appendChild(stop);
    var resume = el('button', '继续 AI'); resume.onclick = start; buttons.appendChild(resume);
    panel.appendChild(buttons);
    var stats = el('div'); stats.className = 'stats'; stats.id = 'ai-player-stats'; panel.appendChild(stats);
    logNode = el('div'); logNode.className = 'log'; logNode.id = 'ai-player-log'; panel.appendChild(logNode);
    document.body.appendChild(panel);
  }
  function say(message) {
    if (!logNode) return;
    var row = el('div', '· ' + message); logNode.insertBefore(row, logNode.firstChild);
    while (logNode.children.length > 6) logNode.removeChild(logNode.lastChild);
  }
  function act(fn) {
    var s = SB.game.run();
    var changed = false;
    try { changed = !!fn(s); } catch (e) { say('动作异常：' + e.message); }
    if (changed) { SB.game.markDirty(); SB.game.renderAll(); }
    return changed;
  }
  function freeB(s, id) {
    var b = SB.habitat.buildingById(id);
    return !!(b && SB.habitat.unlocked(s, b) && SB.habitat.needMet(s, b) && SB.economy.canAfford(s, SB.economy.costOf(s, id)));
  }
  function firstMissingPrereq(s, id) {
    var t = SB.tech.byId(id); if (!t) return null;
    for (var i = 0; i < (t.reqs || []).length; i++) if (!s.techs[t.reqs[i]]) return firstMissingPrereq(s, t.reqs[i]) || t.reqs[i];
    return id;
  }
  function pickHouse(s) {
    var target = s.era >= 4 ? 100 : 30;
    if (SB.economy.popCap(s) >= target) return null;
    var best = null, bestUnit = Infinity;
    ['nest', 'coralhouse'].forEach(function (id) {
      if (!freeB(s, id)) return;
      var cost = SB.economy.costOf(s, id), before = SB.economy.popCap(s);
      s.lvl[id]++; var per = SB.economy.popCap(s) - before; s.lvl[id]--;
      var unit = per > 0 ? (cost.coral || 0) / per : Infinity;
      if (unit < bestUnit) { bestUnit = unit; best = id; }
    });
    return best;
  }
  function wantBuild(s) {
    var key = SB.tech.keysOf(s.era).find(function (t) { return !s.techs[t.id]; });
    var goalId = key && firstMissingPrereq(s, key.id), goal = goalId && SB.tech.byId(goalId);
    var cond = key && key.cond && key.cond.t === 'zoneLvl' ? key.cond : goal && goal.cond;
    if (cond && cond.t === 'built' && (s.lvl[cond.b] || 0) < cond.n) return freeB(s, cond.b) ? cond.b : null;
    if (cond && cond.t === 'tools' && !SB.tech.condMet(s, cond)) return null;
    if (s.era >= 4 && SB.economy.popCap(s) < 100) { var h = pickHouse(s); if (h) return h; }
    if (cond && cond.t === 'zoneLvl' && !SB.tech.condMet(s, cond)) {
      var rows = SB.BUILDINGS.filter(function (b) { return b.zone === cond.zone && SB.habitat.unlocked(s, b) && SB.habitat.needMet(s, b); });
      rows.sort(function (a,b) { var ca=SB.economy.costOf(s,a.id), cb=SB.economy.costOf(s,b.id); return Object.values(ca).reduce(function(x,y){return x+y;},0)-Object.values(cb).reduce(function(x,y){return x+y;},0); });
      for (var i=0;i<rows.length;i++) if (freeB(s, rows[i].id)) return rows[i].id;
      return null;
    }
    if (freeB(s,'kelp') && s.lvl.kelp < Math.ceil(s.pop/4)+2) return 'kelp';
    if (freeB(s,'weir') && s.lvl.kelp>0 && s.lvl.weir<2) return 'weir';
    if (freeB(s,'warmnest') && s.pop>=6 && s.lvl.warmnest<5) return 'warmnest';
    if (freeB(s,'kelpstore') && s.lvl.kelp>0 && s.lvl.kelpstore<4) return 'kelpstore';
    if (freeB(s,'ballast') && s.lvl.kelp>0 && s.lvl.ballast<3) return 'ballast';
    var house=pickHouse(s); if (house) return house;
    var unlock=['siltpit','hall','workshop','miracle','furnace','library'];
    for(var u=0;u<unlock.length;u++) if(freeB(s,unlock[u])&&s.lvl[unlock[u]]===0)return unlock[u];
    var list=['kelp','siltpit','nest','coralhouse','workshop','furnace','library','miracle','kelpstore','ballast'];
    for(var j=0;j<list.length;j++) if(freeB(s,list[j])) return list[j];
    return null;
  }
  function desiredWonder(s) {
    for (var i=0;i<(SB.WONDERS||[]).length;i++) { var w=SB.WONDERS[i]; if (!(s.wonders||{})[w.id] && SB.workshop.wonderBlocked(s,w.id)===null) return w.id; }
    return null;
  }
  function step() {
    if (!started) return;
    var s=SB.game.run(); if (!s || s.broken) { pause(); say('本局已结束。'); return; }
    if (s.lvl.nest===0 && s.res.coral < ((SB.BUILDINGS.find(function(b){return b.id==='nest';})||{}).cost||{}).coral) {
      for(var g=0;g<5 && s.res.coral<15;g++) SB.economy.addRes(s,'coral',SB.GATHER.coral);
    }
    var key=SB.tech.keysOf(s.era).find(function(t){return !s.techs[t.id];});
    var goalId=key&&firstMissingPrereq(s,key.id), goal=goalId&&SB.tech.byId(goalId);
    var cold=SB.economy.isCold(s);
    var foodJob=SB.UNIT.kelp*SB.economy.gatherMul(s)*SB.economy.globalMul(s)*(1+(s.lvl.weir||0)*SB.BLD.foodWeir);
    var builtFood=SB.economy.foodRate(s,cold)-(s.jobs.gather||0)*foodJob;
    var need=foodJob>0?Math.ceil((SB.economy.foodUse(s)*1.1-builtFood)/foodJob):0;
    need=Math.max(0,Math.min(need,s.pop>1?s.pop-1:s.pop));
    var grow=SB.economy.popCap(s)<(s.era>=4?100:30);
    var weights={coralwright:grow?.24:.15,quarrier:.10,craft:.14,scholar:.22,miner:.18,scribe:.06,merchant:.04};
    var cond=key&&key.cond&&key.cond.t==='zoneLvl'?key.cond:goal&&goal.cond;
    if(cond&&cond.t==='res'){if(['silt','iron','steel'].includes(cond.r))weights.miner=.55;if(cond.r==='stone')weights.quarrier=.55;if(cond.r==='coral')weights.coralwright=.55;if(cond.r==='science')weights.scholar=.55;}
    if(cond&&cond.t==='job')weights[cond.j]=.55;
    if(cond&&cond.t==='built'){var b=SB.habitat.buildingById(cond.b),c=b?SB.economy.costOf(s,cond.b):{};if((c.coral||0)>(s.res.coral||0))weights.coralwright=.58;if((c.silt||0)>(s.res.silt||0))weights.miner=.58;if((c.stone||0)>(s.res.stone||0))weights.quarrier=.58;}
    if(cond&&cond.t==='tools'){var tid=cond.ids.find(function(id){return !(s.tools||{})[id];}),tool=tid&&SB.workshop.tools().find(function(x){return x.id===tid;});Object.keys((tool&&tool.cost)||{}).forEach(function(r){if(['iron','steel','silt','warmstone'].includes(r))weights.miner=.65;if(r==='coral')weights.coralwright=.65;if(r==='stone')weights.quarrier=.65;});}
    SB.folk.autoAssign(s,Object.assign({gather:need},cold?Object.assign({},weights,{craft:Math.max(weights.craft,.25),miner:Math.max(weights.miner,.20)}):weights));
    if(key&&key.cond&&key.cond.t==='gathered'){var miss=Math.max(0,key.cond.n-((s.got||{})[key.cond.r]||0));for(var gg=0;gg<Math.min(5,Math.ceil(miss/10));gg++)SB.economy.addRes(s,key.cond.r,SB.GATHER[key.cond.r]||1);}
    if(key&&key.cond&&key.cond.t==='tools')key.cond.ids.forEach(function(id){if(SB.workshop.canBuy(s,id))SB.workshop.buy(s,id);});
    if(key&&key.cond&&key.cond.t==='upgrade'&&SB.workshop.upgradeCanBuy(s,key.cond.id))SB.workshop.upgradeBuy(s,key.cond.id);
    if(s.techs.masonry&&s.lvl.workshop&&s.res.stoneBeam<20){var cb=SB.workshop.crafts().find(function(x){return x.id==='craft_stonebeam';});if(cb)SB.workshop.craft(s,'craft_stonebeam',1);}
    if(s.techs.shellgeo&&s.res.resonantDrill<30){var cd=SB.workshop.crafts().find(function(x){return x.id==='craft_drill';});if(cd)SB.workshop.craft(s,'craft_drill',1);}
    // Build/upgrade, wonders, and research use the same APIs as the game's click handlers.
    var wid=desiredWonder(s);
    if(wid){if(SB.workshop.build(s,wid,SB.game.emit))SB.game.markDirty();}
    else {var bid=wantBuild(s);if(bid&&SB.habitat.build(s,bid,SB.game.emit))SB.game.markDirty();}
    for(var pass=0;pass<SB.TECHS.length;pass++){
      var pending=SB.tech.keysOf(s.era).find(function(t){return !s.techs[t.id];}), chain=[];
      function add(id){var t=SB.tech.byId(id);if(!t||s.techs[id]||chain.indexOf(id)>=0)return;(t.reqs||[]).forEach(add);chain.push(id);}
      if(pending)add(pending.id);
      var order=chain.concat(SB.TECHS.filter(function(t){return t.era<=s.era;}).map(function(t){return t.id;}));
      var tid=order.find(function(id){return SB.tech.canStudy(s,id);}); if(!tid)break;
      if(SB.tech.study(s,tid,SB.game.emit)){SB.game.markDirty();}else break;
    }
    if(SB.civic.panelOpen(s)){
      var civic=SB.CIVICS.find(function(c){return SB.civic.canResearch(s,c.id);}); if(civic)SB.civic.research(s,civic.id,SB.game.emit);
      if(s.gov&&!s.card){var pol=SB.POLICIES.find(function(p){return (Object.keys(p.effect||{}).length>0||typeof p.squareMul==='number')&&SB.civic.canSetCard(s,p.id);});if(pol)SB.civic.setCard(s,pol.id,SB.game.emit);}
    }
    if(s.lvl.miracle>0&&!s.miracleOn)SB.game.toggleMiracle(true);
    SB.game.pumpTech(s,SB.game.emit); SB.game.pumpCivic(s,SB.game.emit);
    SB.game.markDirty();
  }
  function refresh() {
    if(!panel)return; var s=SB.game.run(); if(!s)return;
    var stats=document.getElementById('ai-player-stats');
    var scienceRate=SB.economy.rates(s).science;
    stats.textContent=(started?'运行中 · 20×':'已暂停')+' | Era '+s.era+' | '+(s.t/3600).toFixed(2)+' 游戏小时 | 人口 '+s.pop+'/'+SB.economy.popCap(s)+' | 科技 '+Object.keys(s.techs).filter(function(k){return s.techs[k];}).length+'/'+SB.TECHS.length+' | 科研 '+(s.res.science||0).toFixed(0)+' ('+scienceRate.toFixed(2)+'/秒)';
  }
  function start(){
    if(!started){started=true;SB.game.setSpeed(20);var b=document.querySelector('.spd[data-spd="20"]');if(b)b.classList.add('on');say('AI 正在通过正式游戏循环操作这一局。');}
    if(!timer)timer=root.setInterval(function(){var now=Date.now();if(now-lastDecision>400){lastDecision=now;step();}refresh();},100);
  }
  function pause(){started=false;if(timer){root.clearInterval(timer);timer=null;}refresh();say('AI 已暂停；游戏仍按当前速度运行。');}
  function boot(){initPanel();SB.game.setSpeed(20);var speedBtn=document.querySelector('.spd[data-spd="20"]');if(speedBtn)speedBtn.classList.add('on');started=true;timer=root.setInterval(function(){var now=Date.now();if(now-lastDecision>400){lastDecision=now;step();}refresh();},100);say('接管当前新周目，游戏速度 20×。');refresh();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else root.setTimeout(boot,0);
})(typeof window!=='undefined'?window:globalThis);
