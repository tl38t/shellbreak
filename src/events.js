/* 天壳 / SHELLBREAK — 点击时间事件系统（天壳震动 / 深海火喷泉 / 信仰显圣 / 潮信石）
 *
 * 设计口径（与猫国 meteor 同级，但改造成「限时可点」形态）：
 *   · 场景里（顶部常驻横幅 #omen）冒出一颗事件，停留 WINDOW 墙钟秒，点上拿奖励，超时消失。
 *   · 奖励全部锚定「当前产出率 × 窗口秒数」——任何阶段都不过界，也不破「雇人 > 猛点」。
 *   · 计时一律走**墙钟秒**，不随游戏倍速放大（否则 20× 下 25s 逻辑 = 1.25s 真实，点不到）。
 *   · 生成只挂在**在线 loop**（game.js）；离线补算 drainCatchUp 不跑本系统——玩家不在场不能点。
 *   · 独立 mulberry32 RNG（固定种子），**绝不碰 SB.rng**——
 *     否则会冲掉 economy 里冰封期冻结掷骰所依赖的随机流，把 7.79h 真开局基线冲歪。
 *   · 临时全产 buff（信仰显圣）走 s.eventAllUntil（墙钟毫秒戳），由 economy.globalMul 读取；
 *     同样不进 SB.rng，且 globalMul 对 undefined 安全（旧档 / 未触发时恒为 1）。
 *
 * ⚠️ 平衡口径：本系统是「活跃 bonus」，最后统一进 8–14h 窗核算，中途不为它调常数。
 *   天壳震动奖励 = 10 分钟科技点，早期若显得过于慷慨，调低 P_SPAWN 或它的权重 / 系数 k
 *   （改成 sci/s × 300 之类）——科技不是整局瓶颈（瓶颈在 era5 破冰），故不破 8–14h 窗。
 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  /* ---- 可调参数（默认值，标定时再动）---- */
  var WINDOW = 25;       // 停留窗口（墙钟秒）：玩家可点击的时限
  var ROLL_WALL = 120;   // 每隔多少墙钟秒尝试一次生成
  var P_SPAWN = 0.30;    // 每次尝试生成的概率（当无活动事件且存在合格事件）

  /* ---- 独立 RNG（固定种子，绝不碰 SB.rng）---- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32(0x5E11B00D);

  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  /* ---- 事件定义表（共享骨架 + 各自奖励）----
   *   unlock(s) —— 解锁门槛（返回 bool）
   *   reward(s, r) —— 返回 { res:{k:amt}, buffMul?, buffSec?, msg }，r = economy.rates(s)
   * 资源键必须落在 SB.RESS / addRes 的口径内；capped 资源（stone/silt）由 addRes 自动夹到上限，
   * 无上限资源（science/culture/faith）直灌。 */
  var EVENTS = [
    {
      id: 'skyTremor',
      name: '天壳震动',
      copy: '鲛人头顶的冰层有些微晃动，有些奇异的冰冷物质落到了鲛人的聚居地。',
      weight: 0.40,
      /* 开局即可（凿珊瑚后——珊瑚是起步资源，几乎立刻满足）。 */
      unlock: function (s) { return true; },
      reward: function (s, r) {
        var amt = Math.max(0, r.science) * 600;   // ≈10 游戏分钟科技点
        return { res: { science: amt }, msg: '天壳震动：获得 ' + fmt(amt) + ' 科技点（约 10 分钟产出）。' };
      }
    },
    {
      id: 'fireVent',
      name: '深海火喷泉',
      copy: '海床骤然裂开一道炽红缝隙，熔融的岩与铁顺着热泉喷涌而出——趁余热未散，采石与锻铁皆得厚报。',
      weight: 0.25,
      /* 采石 / 采矿后：stone 解锁 {tech:'quarry'}，silt 解锁 {tech:'mining'}。 */
      unlock: function (s) { return !!(s.techs && s.techs.mining && s.techs.quarry); },
      reward: function (s, r) {
        var stone = Math.max(0, r.stone) * 120;   // ≈2 分钟石头产出
        var silt = Math.max(0, r.silt) * 120;      // ≈2 分钟金属产出
        return { res: { stone: stone, silt: silt },
          msg: '深海火喷泉：石头 +' + fmt(stone) + '，金属 +' + fmt(silt) + '。' };
      }
    },
    {
      id: 'faithVision',
      name: '信仰显圣',
      copy: '幽蓝神光自祭坛深处浮起，先祖的低语穿透水幕——信仰如潮奔涌，万物亦随之丰沛一时。',
      weight: 0.15,
      /* 神学完成后（resUnlocked('faith') ⇔ s.civics.theology，与信仰行 / 产出线同源）。 */
      unlock: function (s) { return !!(s.civics && s.civics.theology); },
      reward: function (s, r) {
        var faith = Math.max(0, r.faith) * 600;    // ≈10 分钟信仰产出
        return { res: { faith: faith }, buffMul: 0.10, buffSec: 30,
          msg: '信仰显圣：信仰 +' + fmt(faith) + '，全产 +10%（30 秒）。' };
      }
    },
    {
      id: 'tideStone',
      name: '潮信石',
      copy: '一块刻满潮汐纹路的礁石随浪浮起，上面记载着族群迁徙的古老契约——读懂它，便读懂了治国之道。',
      weight: 0.20,
      /* 历法 / 观潮后：calendar + tiddivine。 */
      unlock: function (s) { return !!(s.techs && s.techs.calendar && s.techs.tiddivine); },
      reward: function (s, r) {
        var culture = Math.max(0, r.culture) * 300; // ≈5 分钟市政点产出
        return { res: { culture: culture }, msg: '潮信石：市政点 +' + fmt(culture) + '。' };
      }
    }
  ];
  var BY_ID = {};
  for (var _i = 0; _i < EVENTS.length; _i++) BY_ID[EVENTS[_i].id] = EVENTS[_i];

  /* ---- 运行时状态（瞬态，不进存档；刷新即消失，无害）---- */
  var active = null;        // { def, expireWall(ms) }
  var lastRollWall = (typeof Date.now === 'function') ? Date.now() : 0;
  var _sig = '';            // 渲染签名（避免每帧重建 innerHTML 丢点击）

  function eligible(s) {
    var out = [];
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].unlock(s)) out.push(EVENTS[i]);
    return out;
  }

  /* 在线推进：每次循环调一次（墙钟节流）。 */
  function update(s, emit) {
    if (!s) return;
    var now = (typeof Date.now === 'function') ? Date.now() : 0;
    if (active && now >= active.expireWall) { active = null; markDirty(); }
    if (!active && now - lastRollWall >= ROLL_WALL * 1000) {
      lastRollWall = now;
      var pool = eligible(s);
      if (pool.length && rng() < P_SPAWN) {
        var tot = 0, i;
        for (i = 0; i < pool.length; i++) tot += pool[i].weight;
        var pick = rng() * tot, chosen = pool[0];
        for (i = 0; i < pool.length; i++) { pick -= pool[i].weight; if (pick <= 0) { chosen = pool[i]; break; } }
        active = { def: chosen, expireWall: now + WINDOW * 1000 };
        markDirty();
        if (emit) emit(chosen.name + '：鲛人聚居地上演异象，点击拾取。');
      }
    }
  }

  function claim(s, emit) {
    if (!active) return false;
    var def = active.def;
    var r = SB.economy.rates(s);
    var grant = def.reward(s, r);
    if (grant.res) for (var k in grant.res) SB.economy.addRes(s, k, grant.res[k]);
    if (grant.buffMul && grant.buffSec) {
      s.eventAllUntil = (typeof Date.now === 'function' ? Date.now() : 0) + grant.buffSec * 1000;
    }
    if (emit && grant.msg) emit(grant.msg);
    active = null;
    markDirty();
    if (SB.game) SB.game.renderAll();
    return true;
  }

  function markDirty() { if (SB.game && SB.game.markDirty) SB.game.markDirty(); }

  /* 测试 / 强制生成（e2e 用，确定性，绕过 RNG 与计时）。 */
  function forceSpawn(id) {
    var def = BY_ID[id];
    if (!def) return false;
    var now = (typeof Date.now === 'function') ? Date.now() : 0;
    active = { def: def, expireWall: now + WINDOW * 1000 };
    markDirty();
    return true;
  }
  function getActive() { return active ? active.def : null; }
  function timeLeft() {
    if (!active) return 0;
    var now = (typeof Date.now === 'function') ? Date.now() : 0;
    return Math.max(0, (active.expireWall - now) / 1000);
  }

  SB.events = {
    update: update, claim: claim, forceSpawn: forceSpawn,
    getActive: getActive, timeLeft: timeLeft, EVENTS: EVENTS, BY_ID: BY_ID
  };
})(typeof window !== 'undefined' ? window : globalThis);
