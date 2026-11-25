/* e2e suite: 离线补算必须收尾（2026-10-30「打开游戏卡几分钟」回归锁）
 *
 * 事故形态：外层 `while (j.left > 0)` 与内层 `while (gameLeft > 1e-9)` 两条门槛之间
 * 夹着一条 1e-9 宽的缝。算完后 j.left 剩 ~1e-10（浮点累加残渣）就会：
 *   内层不进 → realDone 不涨 → `Math.max(0, j.left - 0)` 原样写回 → 外层空转到预算耗尽
 *   → `finishCatchUp` 永不执行 → 离线闸门永不关闭。
 *
 * 判据（行为级，不是搜源码字符串）：
 *   收尾后 loop.job 被清空，drainCatchUp 首行 `if (!j) return;` ⇒ **调用耗时 0ms**；
 *   活锁时同一调用会空转烧满预算（≥ 200ms）。这个差异比「s.t 推进量」敏感得多
 *   （残渣只有 1e-10 秒，取整后完全看不出来）。
 *
 * ⚠️ 夹具必须让 dt 被切成非整数段（藻场生长期 + 勤耕 perk），否则走纯整数累加、
 *    残渣恒为 0，测不出事故形态（我在沙箱对照里实测过：整数 dt 路径 0% 触发）。
 */
export function run({ SB, check, loadAll }) {
  const CFG = SB.CFG;
  const BUDGET = 225;

  function fixture(phaseShift) {
    SB.game.resetRun();
    const s = SB.game.run();
    s.t = 200000 + phaseShift;      // 稳定期，避开破壳与开局
    s.era = 8;
    s.broken = false;
    s.shellOpened = false;
    s.pop = 120;
    s.peak = 120;
    /* 生长期切分：growthDuration 被勤耕工作量乘区拉成非整数 ⇒ dt 不再是整齐的 2 秒 */
    s.lvl.kelp = 12;
    s.res.kelp = 5000;
    s._grow = 0.37 + phaseShift * 0.11;
    if (!s.perk) s.perk = {};
    s.perk.workSpeed = 0.17;
    s.warmOn = true;
    s.res.warmstone = 400;
    s.ad.on = false;
    s.ad.ms = 0;
    return s;
  }

  /* 直接用验收预算驱动各切片，直到 drainCatchUp 立即返回。 */
  function driveToFinish(s, secs) {
    SB.game.planCatchUp(s, secs, true);      // silent：不弹闸门，e2e 没有可用遮罩
    const t0 = s.t;
    let frames = 0, maxFrame = 0, total = 0, closed = false;
    while (frames < 400) {
      const a = Date.now();
      SB.game.drainCatchUp(BUDGET);
      const ms = Date.now() - a;
      frames++; total += ms;
      if (ms > maxFrame) maxFrame = ms;
      if (ms === 0) { closed = true; break; }   // job 已清空 ⇒ 首行立即 return
    }
    return { closed, frames, maxFrame, total, advanced: s.t - t0 };
  }

  /* ── 1. 30 分钟档（旧逻辑实测 100% 活锁） ── */
  {
    const s = fixture(0.4);
    const r = driveToFinish(s, 1800);
    check('离线补算 30 分钟能收尾（活锁时 drainCatchUp 永不返回 0ms）', r.closed,
      'frames=' + r.frames + ' maxFrame=' + r.maxFrame + 'ms advanced=' + r.advanced.toFixed(2));
    check('30 分钟补算确实推进了对应时长', Math.abs(r.advanced - 1800) < 30,
      'advanced=' + r.advanced.toFixed(2) + '（期望 1800±30）');
  }

  /* ── 2. 8 小时档：既要收尾，也要真的分帧（旧逻辑一帧算完 + 永不收尾） ── */
  {
    const s = fixture(1.7);
    const r = driveToFinish(s, 28800);
    check('离线补算 8 小时能收尾（闸门会关闭）', r.closed,
      'frames=' + r.frames + ' maxFrame=' + r.maxFrame + 'ms advanced=' + r.advanced.toFixed(2));
    check('8 小时补算确实推进了对应时长', Math.abs(r.advanced - 28800) < 60,
      'advanced=' + r.advanced.toFixed(2) + '（期望 28800±60）');
    /* ⚠️ 这一条锁的是「内层让出预算」：旧代码内层不检查时间，整个 8 小时挤在一帧里
     *    （真机实测单条长任务 4471ms）。分帧后必然 ≥2 帧。 */
    check('8 小时补算分帧推进（≥2 帧），不是一帧算完', r.frames >= 2,
      'frames=' + r.frames + ' total=' + r.total + 'ms');
    check('单帧不超过预算上限（内层会让出）', r.maxFrame <= 600,
      'maxFrame=' + r.maxFrame + 'ms（测试预算 ' + BUDGET + 'ms，内层每四步检查）');
  }

  /* ── 3. 残渣容差不许把「还没算完」误判成「算完了」 ── */
  {
    /* 只给 1ms 预算 ⇒ 一定算不完。此时绝不能被 CATCHUP_EPS 当成收尾。 */
    const s = fixture(0.9);
    SB.game.planCatchUp(s, 7200, true);
    const t0 = s.t;
    SB.game.drainCatchUp(1);
    const advanced = s.t - t0;
    check('预算不足时不会被当成已收尾（容差不许吞掉剩余时间）',
      advanced > 0 && advanced < 7200,
      'advanced=' + advanced.toFixed(2) + '（应远小于 7200）');
    /* 收尾掉这一批，避免污染后续 suite（下一次 drain 会给足预算） */
    for (let i = 0; i < 400 && s.t - t0 < 7200; i++) SB.game.drainCatchUp(2000);
  }

  /* ── 4. 广告余额 < 离线时长：银行归零后必须回落 1× 并收尾（2026-11-07 客户反馈）──
   * 事故形态：双倍段扣减 ad.ms 留下 1ulp 正残差 ⇒ adMul() 仍判 2× ⇒ realChunk ≈1e-16
   * 真实秒 ⇒ 内层一步不进 ⇒ j.left 原样写回 ⇒ 外层每帧空转、闸门永不关、1× 段被吞。
   * ⚠️ 夹具必须用**会留下正浮点残差**的 ad.ms；整数 3000 精确归零，测不出事故形态。
   *    在线主循环按 elapsed*1000 扣余额（game.js:1366），真实玩家余额天然带小数。
   * ⚠️ 本 suite 的 fixture 原本写死 s.ad.on=false / s.ad.ms=0 ⇒ 广告开启的补算零覆盖。
   * 用 5ms 小预算 + 40 帧上限：活锁时不会把全量回归拖慢。 */
  {
    const s = fixture(0.4);
    s.ad.on = true;
    s.ad.ms = 3000 - 0.0001;          // 3 秒双倍余额，离线 5 秒
    SB.game.planCatchUp(s, 5, true);
    const t0 = s.t;
    let frames = 0, closed = false, still = 0, prevT = s.t;
    for (let f = 0; f < 40; f++) {
      SB.game.drainCatchUp(5);
      frames++;
      if (!SB.game.runtimeStatus().catchupActive) { closed = true; break; }
      if (s.t === prevT) still++; else still = 0;
      prevT = s.t;
      if (still >= 5) break;           // 连续 5 帧 s.t 不动 = 活锁实锤
    }
    check('广告余额耗尽后离线补算能收尾（残差不得让闸门永开）', closed,
      'frames=' + frames + ' still=' + still + ' advanced=' + (s.t - t0).toFixed(6));
    /* 3 秒双倍 = 6 游戏秒 + 剩余 2 秒 1× = 2 游戏秒 ⇒ 共 8 游戏秒（活锁时只有 6） */
    check('广告余额耗尽后的 1× 段没有被吞掉', Math.abs((s.t - t0) - 8) < 0.2,
      'advanced=' + (s.t - t0).toFixed(6) + '（期望 8±0.2）');
    check('广告余额残差被夹零（不再留下 1ulp 假余额）', s.ad.ms === 0,
      'ad.ms=' + s.ad.ms);
  }

  /* ── 5. 非静默闸门：进度条必须走到 100%，不能冻结在广告余额占比（本例 60%）── */
  {
    const seq = [];
    const orig = SB.ui.render.setOfflineProgress;
    SB.ui.render.setOfflineProgress = function (p) {
      seq.push(p);
      return orig ? orig.apply(this, arguments) : undefined;
    };
    let ok = false, err = '';
    try {
      const s = fixture(0.4);
      s.ad.on = true;
      s.ad.ms = 3000 - 0.0001;
      SB.game.planCatchUp(s, 5, false);
      for (let f = 0; f < 40; f++) {
        SB.game.drainCatchUp(5);
        if (!SB.game.runtimeStatus().catchupActive) break;
      }
      ok = true;
    } catch (e) { err = String((e && e.message) || e); }
    finally { SB.ui.render.setOfflineProgress = orig; }
    check('离线闸门进度条上报到 100%（不再冻结在 60%）',
      ok && seq.length > 0 && Math.abs(seq[seq.length - 1] - 1) < 1e-9,
      'ok=' + ok + ' err=' + err + ' 末3帧=' + seq.slice(-3).map(p => (100 * p).toFixed(2) + '%').join('→'));
  }

  {
    const s = fixture(0);
    s.t = s.seasonLengths[0] + s.seasonLengths[1] + 60;
    s.frozen = true;
    Object.assign(s.lvl, { furnace: 5, hydroturbine: 4, siltpit: 3 });
    s.turbineStop = 2;
    s.jobs.miner = 15;
    s.res.silt = 300;
    const match = [0.05, 20, 400].every(warmstone => {
      s.res.warmstone = warmstone;
      const breakdown = SB.economy.ratesParts(s);
      const net = breakdown.parts.warmstone.reduce((sum, part) => sum + part.v, 0);
      return SB.economyRateParts.warmstoneRate(s) === breakdown.rate.warmstone && net === breakdown.rate.warmstone;
    });
    check('暖石单项速率与面板分项、净值一致，覆盖缺料、保温和设备扣料', match);

    const rate = SB.economy.warmRate(s);
    s.res.warmstone = rate / 2;
    const refused = SB.economy.warmRelief(s, 0.25) === 0 && s.res.warmstone === rate / 2;
    s.res.warmstone = rate;
    const paid = SB.economy.warmRelief(s, 0.25) === CFG.WARM_RELIEF && s.res.warmstone === rate - rate * 0.25;
    const stopped = !SB.economy.warmBurningNow(s);
    s.challenge = { id: 'cold', tier: 0 };
    s.res.warmstone = rate * 2;
    const blocked = SB.economy.warmRelief(s, 0.25) === 0 && s.res.warmstone === rate * 2;
    check('保温沿用一秒库存门槛、按实际步长扣费，并遵守寒流禁火限制',
      rate > 0 && refused && paid && stopped && blocked);
  }

  {
    const s = SB.state.freshRun(false);
    s.cards = [null, 'card_town_meeting'];
    const active = SB.civic.cardPopCapFlat(s) === 3 && SB.civic.cardPopGrowthTimeMul(s) === 0.5;
    s.civics.city_supply = true;
    s.war.heritage.pending = null;
    const retired = SB.civic.cardPopCapFlat(s) === 0 && SB.civic.cardPopGrowthTimeMul(s) === 1 &&
      Array.isArray(s.war.heritage.pending);
    s.war.heritage.owned.push({ id: 'card_town_meeting', stage: 1 });
    const inherited = SB.civic.cardPopCapFlat(s) === 3 && SB.civic.cardPopGrowthTimeMul(s) === 0.5;
    check('空槽、退役与新获得传承保留政策效果原有数值，并补齐旧档传承栏', active && retired && inherited);
  }

  /* ── 检查点从落盘、载入、后台恢复及换档的入口验证 ── */
  if (typeof loadAll === 'function') {
    const RealDate = Date;
    function bootIsolated(store, offsetMsRef) {
      function mkMiniEl(id) {
        const el = {
          id, _html: '', _text: '', value: '', checked: false, dataset: {},
          style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
          children: [], options: [], onclick: null,
          _classes: new Set(id === 'modal' ? ['hidden'] : []),
          classList: {
            add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); },
            contains(c) { return el._classes.has(c); },
            toggle(c, on) { if (on === undefined) el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); else if (on) el._classes.add(c); else el._classes.delete(c); }
          },
          appendChild(c) { el.children.push(c); if (c && c.tag === 'option') el.options.push(c); return c; },
          removeChild() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
          querySelector(sel) {
            if (typeof sel === 'string' && sel.charAt(0) === '#') return miniDoc.getElementById(sel.slice(1));
            const cls = String(sel || '').replace(/^[.#]/, '');
            if (!cls) return null;
            if (String(el._html || '').indexOf(cls) >= 0) {
              if (!el._q) el._q = {};
              if (!el._q[cls]) el._q[cls] = mkMiniEl(cls);
              return el._q[cls];
            }
            return null;
          }
        };
        Object.defineProperty(el, 'textContent', { get() { return el._text; }, set(v) { el._text = String(v == null ? '' : v); } });
        Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); } });
        return el;
      }
      const els = new Map(), q = {}, listeners = {};
      const miniDoc = {
        _els: els, readyState: 'complete',
        getElementById(id) { if (!els.has(id)) els.set(id, mkMiniEl(id)); return els.get(id); },
        createElement(tag) { const e = mkMiniEl('new-' + tag); e.tag = tag; return e; },
        createTextNode(t) { const e = mkMiniEl('#text'); e.textContent = String(t); return e; },
        querySelectorAll(sel) {
          if (q[sel]) return q[sel];
          const out = sel === '.tab'
            ? ['village', 'folk', 'tech', 'civic', 'faith', 'diplomacy', 'workshop', 'wonder', 'company', 'meta', 'challenges', 'star-map', 'achievements'].map((t, i) => {
                const e = mkMiniEl('tab-' + t); e.dataset.tab = t; e._tab = i; return e;
              })
            : [];
          q[sel] = out;
          return out;
        },
        querySelector(sel) {
          const m = /^\.tab\[data-tab="([^"]+)"\]$/.exec(sel || '');
          return m ? (this.querySelectorAll('.tab').find(t => t.dataset.tab === m[1]) || null) : null;
        },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        dispatch(type) { for (const fn of listeners[type] || []) fn(); }
      };
      miniDoc.body = mkMiniEl('body');
      class SimDate extends RealDate {
        constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + offsetMsRef.v); }
        static now() {
          if (offsetMsRef.bumpPerRead) offsetMsRef.v += offsetMsRef.bumpPerRead;
          return RealDate.now() + offsetMsRef.v;
        }
      }
      const sb = {
        console, document: miniDoc,
        localStorage: {
          getItem: k => store.has(k) ? store.get(k) : null,
          setItem: (k, v) => store.set(k, v),
          removeItem: k => store.delete(k)
        },
        performance: { now: () => RealDate.now() + offsetMsRef.v },
        addEventListener: (type, fn) => miniDoc.addEventListener(type, fn),
        _intervals: [], setInterval(fn) { sb._intervals.push(fn); return sb._intervals.length; }, clearInterval() {},
        _timeouts: [], setTimeout(fn) { sb._timeouts.push(fn); return sb._timeouts.length; }, clearTimeout() {},
        Math, Date: SimDate, JSON, Object, Array, String, Number, Boolean, Set, Map, isNaN, parseInt, parseFloat
      };
      sb.window = sb;
      sb.globalThis = sb;
      const loaded = loadAll(sb);
      return { sb, doc: miniDoc, SB: loaded.SB };
    }

    function seedMidRun(SB1) {
      const s = SB1.game.run();
      s.t = 200000;
      s.era = 8;
      s.broken = false;
      s.shellOpened = false;
      s.pop = 120;
      s.peak = 120;
      s.lvl.kelp = 12;
      s.res.kelp = 5000;
      s._grow = 0.37;
      if (!s.perk) s.perk = {};
      s.perk.workSpeed = 0.17;
      s.warmOn = true;
      s.res.warmstone = 400;
      s.ad.on = false;
      s.ad.ms = 0;
      return s;
    }

    function savedRun(r, store) {
      return JSON.parse(store.get(r.SB.CFG.RUN_KEY));
    }

    function drainPart(r, clock) {
      clock.bumpPerRead = 0.4;
      try { r.SB.game.drainCatchUp(5); }
      finally { clock.bumpPerRead = 0; }
    }

    function savePartial(r, clock, store) {
      drainPart(r, clock);
      r.SB.state.saveRun(r.SB.game.snapshot(r.SB.game.run()));
      return savedRun(r, store);
    }

    function finish(r) {
      for (let f = 0; f < 500 && r.SB.game.runtimeStatus().catchupActive; f++) {
        r.SB.game.drainCatchUp(BUDGET);
      }
      return !r.SB.game.runtimeStatus().catchupActive;
    }

    /* 普通存档没有检查点，启动入口根据存档时间认领离线间隙。 */
    {
      const store = new Map(), clock = { v: 0 };
      const r1 = bootIsolated(store, clock), s = seedMidRun(r1.SB);
      const cap = r1.SB.CFG.OFFLINE_CAP, skipped = 7200;
      const adMs = r1.SB.CFG.AD.BOOST_CAP_MIN * 60000;
      s.ad = { ms: adMs, on: true };
      const raw = r1.SB.game.snapshot(s);
      r1.SB.state.saveRun(raw);

      clock.v += (cap + skipped) * 1000;
      const r2 = bootIsolated(store, clock), pending = savedRun(r2, store);
      const cp = pending.offlineCheckpoint;
      const duration = (secs) => r2.SB.i18n.t('game.duration.hours_minutes', {
        hours: Math.floor(secs / 3600), minutes: Math.floor((secs % 3600) / 60)
      });
      const modalBox = r2.doc.getElementById('modalBox');
      const capNotice = r2.SB.i18n.t('game.offline.catchup.cap_notice', {
        capDuration: duration(cap), uncountedDuration: duration(skipped)
      });
      check('普通冷启动只认领上限内的时间，进度窗列明被截掉的时间',
        !raw.offlineCheckpoint && cp?.left === cap && cp.total === cap && cp.cap === cap &&
        Math.abs(cp.uncountedSecs - ((cp.wallAt - raw._ts) / 1000 - cap)) < 1e-9 &&
        pending.ad.ms === adMs && modalBox.innerHTML.includes(capNotice));
      const closed = finish(r2), after = savedRun(r2, store);
      const reportNotice = r2.SB.i18n.t('game.offline.settlement.uncounted_note', { uncountedDuration: duration(skipped) });
      check('冷启动结算按已认领的秒数扣广告并展示未计入时长',
        closed && Math.abs(after.t - raw.t - cap - adMs / 1000) < 1e-5 && after.ad.ms === 0 &&
        !after.offlineCheckpoint && modalBox.innerHTML.includes('offline-report') && modalBox.innerHTML.includes(reportNotice),
        'advanced=' + (after.t - raw.t).toFixed(5));
    }

    /* 远小于 60s 的重启只恢复已有时段，读档自愈不能覆盖检查点。 */
    {
      const store = new Map(), clock = { v: 0 };
      const r1 = bootIsolated(store, clock);
      const s1 = seedMidRun(r1.SB);
      const cap = r1.SB.CFG.OFFLINE_CAP, tStart = s1.t;
      s1.seasonLengthsVersion = 0;
      r1.SB.game.planCatchUp(s1, cap, false);
      const saved = savePartial(r1, clock, store);
      const cp = saved.offlineCheckpoint;
      check('补算中途保存已推进时长和剩余时长', cp?.v === 2 && !('s' in cp) &&
        cp.left > 0 && cp.left < cap && Math.abs(saved.t - tStart + cp.left - cap) < 1e-6,
        't=' + saved.t + ' left=' + cp?.left);

      clock.v += 2000;
      const r2 = bootIsolated(store, clock);
      const loaded = savedRun(r2, store);
      check('不足 60 秒也恢复任务，且季长自愈写盘后保留检查点',
        r2.SB.game.runtimeStatus().catchupActive && loaded.seasonLengthsVersion === 1 &&
        loaded.t === saved.t && loaded.offlineCheckpoint?.left === cp.left &&
        loaded.offlineCheckpoint?.total === cap);
      const closed = finish(r2), after = savedRun(r2, store);
      check('短间隙不额外补算，完成时清除检查点', closed &&
        Math.abs(after.t - tStart - cap) < 1e-5 && after.offlineCheckpoint == null,
        'advanced=' + (after.t - tStart).toFixed(5));
    }

    /* 未达上限时中断后再次离线可补齐剩余差额；已达上限时不再无界叠加，防止多轮重启刷时长。 */
    {
      const store = new Map(), clock = { v: 0 };
      const r1 = bootIsolated(store, clock);
      const s1 = seedMidRun(r1.SB);
      const cap = r1.SB.CFG.OFFLINE_CAP, halfCap = cap / 2, tStart = s1.t;
      s1.ad.on = true;
      s1.ad.ms = 1200000;
      r1.SB.game.planCatchUp(s1, halfCap, false);
      const first = savePartial(r1, clock, store);
      const cp1 = first.offlineCheckpoint;
      check('第一次检查点的广告余额与已推进的双倍时长一致',
        cp1?.left > 0 && Math.abs(first.t - tStart - 2 * (halfCap - cp1.left)) < 1e-6 &&
        Math.abs(first.ad.ms - (1200000 - (halfCap - cp1.left) * 1000)) < 1e-5);

      clock.v += 600000;
      const r2 = bootIsolated(store, clock);
      const secondBoot = savedRun(r2, store);
      const cp2 = secondBoot.offlineCheckpoint;
      const extra = (cp2.wallAt - cp1.wallAt) / 1000;
      check('未超上限时再离线约 10 分钟可完整接续新间隙并保留剩余双倍进度',
        extra >= 600 && extra < 602 && cp2.uncountedSecs === 0 &&
        Math.abs(cp2.left - cp1.left - extra) < 1e-6 && Math.abs(cp2.total - halfCap - extra) < 1e-6);
      const closed = finish(r2), after = savedRun(r2, store);
      check('连续重启仍完整发放混合 2×/1× 进度且广告余额只扣一次',
        closed && Math.abs(after.t - tStart - cp2.total - 1200) < 1e-5 &&
        after.ad.ms === 0 && after.offlineCheckpoint == null,
        'advanced=' + (after.t - tStart).toFixed(5) + ' ad.ms=' + after.ad.ms);
    }

    {
      const store = new Map(), clock = { v: 0 };
      const r1 = bootIsolated(store, clock);
      const s1 = seedMidRun(r1.SB);
      const cap = r1.SB.CFG.OFFLINE_CAP, tStart = s1.t;
      r1.SB.game.planCatchUp(s1, cap, false);
      const first = savePartial(r1, clock, store);
      const done1 = first.t - tStart;
      const cp1 = first.offlineCheckpoint;

      clock.v += 600000;
      const r2 = bootIsolated(store, clock);
      const secondBoot = savedRun(r2, store);
      const cp2 = secondBoot.offlineCheckpoint;
      const extra1 = (cp2.wallAt - cp1.wallAt) / 1000;
      check('已满上限时中途重启仅补回已消耗配额，剩余时长仍封顶于 cap',
        r2.SB.game.runtimeStatus().catchupActive &&
        Math.abs(cp2.left - cap) < 1e-6 &&
        Math.abs(cp2.total - (done1 + cap)) < 1e-6 &&
        Math.abs(cp2.uncountedSecs - Math.max(0, extra1 - done1)) < 1e-6,
        'left=' + cp2?.left + ' uncounted=' + cp2?.uncountedSecs);

      const second = savePartial(r2, clock, store);
      const done2 = second.t - tStart;
      clock.v += 36000000;
      const r3 = bootIsolated(store, clock);
      const third = savedRun(r3, store);
      const cp3 = third.offlineCheckpoint;
      check('多轮长离线下待补算剩余时长始终受 cap 封顶（防刷上限）',
        r3.SB.game.runtimeStatus().catchupActive && third.t === second.t &&
        Math.abs(cp3.left - cap) < 1e-6 && Math.abs(cp3.total - (done2 + cap)) < 1e-6 &&
        cp3.uncountedSecs >= 36000 - (done2 - done1) - 5,
        'left=' + cp3?.left + ' total=' + cp3?.total);
      check('封顶队列补算完成后总推进精确收口并清除检查点',
        finish(r3) && Math.abs((savedRun(r3, store).t - tStart) - cp3.total) < 1e-5 &&
        savedRun(r3, store).offlineCheckpoint == null);
    }

    {
      const store = new Map(), clock = { v: 0 };
      const rBoot = bootIsolated(store, clock);
      const s = seedMidRun(rBoot.SB);
      const cap = rBoot.SB.CFG.OFFLINE_CAP, done = 32, extra = 900;
      rBoot.SB.game.planCatchUp(s, cap, false);
      const raw = rBoot.SB.game.snapshot(s), cp = raw.offlineCheckpoint;
      Object.assign(cp, { left: cap + extra, secs: cap + extra + done, total: cap + extra + done,
        cap: cap * 3, uncountedSecs: 120, silent: true });
      raw.perk.offline = 1e300;
      const migrated = rBoot.SB.state.migrateRun(raw).offlineCheckpoint;
      rBoot.SB.state.saveRun(raw);
      const r2 = bootIsolated(store, clock);
      const booted = savedRun(r2, store).offlineCheckpoint;
      check('旧 v2 待补超限时按现行上限裁剪，保留已推进的时长并显示超限报告',
        [migrated, booted].every(item => item?.cap === cap && item.left === cap &&
          item.total - item.left === done && item.uncountedSecs === 120 + extra && !item.silent) &&
        r2.doc.getElementById('modalBox').innerHTML.includes('id="offPr"') && r2.SB.game.run().t === raw.t);

      Object.assign(cp, { left: cap - done, secs: cap, total: cap, cap: cap / 2, uncountedSecs: 0 });
      const underreported = rBoot.SB.state.migrateRun(raw).offlineCheckpoint;
      check('旧检查点较小的 cap 不会裁掉现行上限内的待补时间',
        underreported?.cap === cap && underreported.left === cap - done &&
        underreported.total === cap && underreported.uncountedSecs === 0);

      Object.assign(cp, { cap: Infinity, wallAt: Number.MAX_VALUE, uncountedSecs: Infinity });
      raw.ad = { ms: Infinity, on: true };
      const invalid = rBoot.SB.state.migrateRun(raw);
      raw.ad = { ms: Number.MAX_VALUE, on: false };
      const oversized = rBoot.SB.state.migrateRun(raw);
      check('损坏的诊断数值不丢弃待补时长，广告余额受现行上限且保留关闭状态',
        invalid.offlineCheckpoint?.left === cap - done && invalid.offlineCheckpoint.cap === cap &&
        invalid.offlineCheckpoint.wallAt === 0 && invalid.offlineCheckpoint.uncountedSecs === 0 && invalid.ad.ms === 0 &&
        oversized.ad.ms === rBoot.SB.CFG.AD.BOOST_CAP_MIN * 60000 && oversized.ad.on === false);
      rBoot.SB.game.resetRun();
      for (const gap of [NaN, Infinity, Number.MAX_VALUE, -1, '600']) {
        rBoot.SB.game.planCatchUp(rBoot.SB.game.run(), gap, false);
      }
      check('无效或无法用墙钟毫秒表示的离线间隙不会启动补算', !rBoot.SB.game.runtimeStatus().catchupActive);
    }

    /* 旧版在 8h 补算中重启，再次写盘后可能出现 secs=28832、left=28768。 */
    {
      const store = new Map(), clock = { v: 0 };
      const r1 = bootIsolated(store, clock);
      const s1 = r1.SB.game.run();
      r1.SB.game.planCatchUp(s1, 28800, false);
      const raw = r1.SB.game.snapshot(s1), cp = raw.offlineCheckpoint;
      Object.assign(cp, { v: 1, left: 28768, total: 28832, secs: 28832, uncountedSecs: 568 });
      delete cp.wallAt;
      raw.t = 64;
      r1.SB.state.saveRun(raw);
      const r2 = bootIsolated(store, clock);
      const recovered = savedRun(r2, store);
      check('兼容旧版累计时长超过单段上限的合法检查点',
        r2.SB.game.runtimeStatus().catchupActive && recovered.t === 64 &&
        recovered.offlineCheckpoint?.left === 28768 && recovered.offlineCheckpoint?.total === 28832);
    }

    {
      const store = new Map(), clock = { v: 0 };
      const r1 = bootIsolated(store, clock), s1 = seedMidRun(r1.SB);
      Object.assign(s1, { shell: 0, shellOpened: true, broken: true, challengeDone: true,
        challenge: { id: 'cold', tier: 0 }, challengeReleased: false });
      r1.SB.game.planCatchUp(s1, 600, false);
      savePartial(r1, clock, store);

      const r2 = bootIsolated(store, clock), s2 = r2.SB.game.run();
      const modalBox = r2.doc.getElementById('modalBox');
      check('续算中保留离线遮罩，破壳挑战的解除和轮回按钮不会提前出现',
        r2.SB.game.runtimeStatus().catchupActive && !s2.challengeReleased &&
        modalBox.innerHTML.includes('id="offPr"') && !modalBox.innerHTML.includes('id="mCycle"'));
      const closed = finish(r2);
      const handedBack = closed && modalBox.innerHTML.includes('offline-report') &&
        !modalBox.innerHTML.includes('id="mRelease"');
      r2.doc.getElementById('mOk').onclick?.();
      const actions = modalBox.innerHTML.includes('id="mRelease"') && modalBox.innerHTML.includes('id="mCycle"');
      if (actions) r2.doc.getElementById('mRelease').onclick();
      check('玩家看完离线结算后可以继续选择解除挑战或轮回',
        handedBack && actions && s2.challengeReleased && r2.SB.game.run() === s2);
    }

    /* 后台挂起后可能先触发补算回调，再触发主循环。退出保存也可能先到。 */
    {
      const store = new Map(), clock = { v: 0 };
      const r = bootIsolated(store, clock), s = seedMidRun(r.SB);
      const interval = r.sb._intervals[0], n = r.sb._timeouts.length;
      const cap = r.SB.CFG.OFFLINE_CAP;
      r.SB.game.planCatchUp(s, cap, false);
      clock.bumpPerRead = 2;
      try { interval(); } finally { clock.bumpPerRead = 0; }
      const nextSlice = r.sb._timeouts[n];
      const before = r.SB.game.snapshot(s).offlineCheckpoint;
      r.doc.hidden = true;
      r.doc.dispatch('visibilitychange');
      clock.v += 600000;
      r.doc.dispatch('pagehide');
      const whileSuspended = savedRun(r, store);
      const reopenedStore = new Map(store);
      const reopened = bootIsolated(reopenedStore, clock);
      const reopenedCp = savedRun(reopened, reopenedStore).offlineCheckpoint;
      const room = cap - before.left;
      check('后台长间隙先保存再被杀，仍可从上次计时处补算',
        !!before && whileSuspended.offlineCheckpoint?.wallAt === before.wallAt &&
        whileSuspended._ts - before.wallAt >= 600000 &&
        reopenedCp?.left === cap && Math.abs(reopenedCp.total - before.total - room) < 1e-6 &&
        Math.abs(reopenedCp.uncountedSecs - (reopenedCp.wallAt - before.wallAt) / 1000 + room) < 1e-6);
      r.doc.hidden = false;
      r.doc.dispatch('visibilitychange');
      clock.bumpPerRead = 2;
      try { nextSlice(); interval(); } finally { clock.bumpPerRead = 0; }
      const resumed = r.SB.game.snapshot(s).offlineCheckpoint;
      const accepted = savedRun(r, store).offlineCheckpoint;
      check('同进程回前台先触发补算回调时，间隙只入账一次且待补时长封顶',
        accepted?.left === cap && resumed?.total === accepted.total &&
        Math.abs(resumed.total - before.total - room) < 1e-6 &&
        Math.abs(resumed.uncountedSecs - (accepted.wallAt - before.wallAt) / 1000 + room) < 1e-6,
        'total=' + resumed?.total);
    }

    {
      const store = new Map(), clock = { v: 0 };
      const r = bootIsolated(store, clock);
      seedMidRun(r.SB);
      const interval = r.sb._intervals[0];
      interval();
      r.doc.hidden = true;
      r.doc.dispatch('visibilitychange');
      const before = savedRun(r, store);
      clock.v += 120000;
      r.doc.dispatch('pagehide');
      const exiting = savedRun(r, store);
      const reopened = bootIsolated(new Map(store), clock);
      const cold = reopened.SB.game.snapshot(reopened.SB.game.run()).offlineCheckpoint;
      r.doc.hidden = false;
      r.doc.dispatch('visibilitychange');
      interval();
      const closed = finish(r);
      const returned = savedRun(r, store);
      check('暂停时尚无任务，先触发退出保存也能在冷启动或原页面恢复短离线且只补一次',
        closed && !before.offlineCheckpoint && exiting.t === before.t && cold?.total >= 120 && cold.total < 122 && cold.silent &&
        Math.abs(returned.t - before.t - cold.total) < 1e-6 && !returned.offlineCheckpoint);
    }

    /* 换周目、云端接管和导入各自只使用本周目的检查点与时间。 */
    {
      const store = new Map(), clock = { v: 0 };
      const r = bootIsolated(store, clock), s = seedMidRun(r.SB);
      r.SB.game.planCatchUp(s, 120, false);
      const incoming = savePartial(r, clock, store);
      const bundle = { format: 'shellbreak-save', version: 1,
        save: { meta: r.SB.game.meta(), run: incoming } };
      check('为另一周目生成快照不会附带当前补算任务',
        !r.SB.game.snapshot(r.SB.state.freshRun(false)).offlineCheckpoint);
      clock.v += 600000;
      r.SB.game.resetRun();
      r.sb._intervals[0]();
      check('重开周目清除旧任务及上一周目的墙钟间隙',
        !r.SB.game.runtimeStatus().catchupActive && r.SB.game.run().t < 1);
      r.SB.game.adoptBundle(bundle);
      const adopted = r.SB.game.snapshot(r.SB.game.run());
      check('云端接管保留来档自己的待补时长',
        adopted.offlineCheckpoint?.left === incoming.offlineCheckpoint.left &&
        adopted.offlineCheckpoint?.total === incoming.offlineCheckpoint.total && adopted.t === incoming.t);

      let reloads = 0;
      r.sb.location = { reload() { reloads++; } };
      clock.v += 600000;
      r.SB.game.installImportedSave(bundle);
      const imported = savedRun(r, store);
      r.sb._intervals[0]();
      r.doc.dispatch('pagehide');
      const fresh = bootIsolated(store, clock);
      const afterImport = savedRun(fresh, store);
      check('导入后旧循环不能覆盖来档，源设备时间也不追加到来档检查点',
        reloads === 1 && imported.offlineCheckpoint?.wallAt === imported._ts &&
        fresh.SB.game.runtimeStatus().catchupActive && afterImport.t === incoming.t &&
        afterImport.offlineCheckpoint?.total === incoming.offlineCheckpoint.total &&
        afterImport.offlineCheckpoint?.left === incoming.offlineCheckpoint.left);
    }

    {
      const store = new Map(), clock = { v: 0 };
      const r = bootIsolated(store, clock), s = seedMidRun(r.SB);
      const tStart = s.t, seconds = 600;
      s.challenge = { id: 'drift_terra', tier: 0 };
      s.lvl.terra_engine = 50;
      s.res.coreCharge = 50000000;
      s.ad.on = true;
      s.ad.ms = 120000;
      r.SB.game.planCatchUp(s, seconds, true);
      drainPart(r, clock);
      const saved = savedRun(r, store);
      check('离线达成挑战立即保存阶段结果及对应的补算检查点',
        saved.challengeDone && saved.offlineCheckpoint?.left > 0 &&
        Math.abs(saved.t - tStart - 2 * (seconds - saved.offlineCheckpoint.left)) < 1e-6 &&
        Math.abs(saved.ad.ms - (120000 - (seconds - saved.offlineCheckpoint.left) * 1000)) < 1e-5);
    }

    /* 岗位复用必须在每次减员后失效。用同一个随机序列逐字段对照原重算路径。 */
    function simulateDeaths(pollution, reuseJobs) {
      const r = bootIsolated(new Map(), { v: 0 }), s = r.SB.game.run();
      s.pop = 24;
      s.lvl.nest = 20;
      s.lvl.robotbay = 1;
      Object.assign(s.jobs, { gather: 1, miner: 3, merchant: 20 });
      Object.assign(s.robotJobs, { gather: 1, merchant: 2 });
      s.civics.trade = true;
      s.faithTenets = ['fertile_rite'];
      s.res.kelp = 1;
      s.ad = { on: true, ms: 13000 };
      s.warmOn = false;
      if (pollution) {
        s.challenge = { id: 'waterpollution', tier: 0 };
        s.pollution = 10000000;
      } else {
        s.t = s.seasonLengths[0] + s.seasonLengths[1] + 120;
        s._seasonIdx = 2;
        s.frozen = true;
      }
      let draws = 0;
      r.SB.rng = () => ++draws % 47 === 0 ? 0 : 0.99;
      const integrate = r.SB.offline.integrateFoodPop;
      if (!reuseJobs) r.SB.offline.integrateFoodPop = (state, dt, opts, emit) =>
        integrate(state, dt, { ...opts, reuseJobs: false }, emit);
      r.SB.game.planCatchUp(s, 40, true);
      const closed = finish(r);
      const snapshot = r.SB.game.snapshot(s);
      delete snapshot._ts;
      return { closed, snapshot, draws };
    }

    for (const pollution of [false, true]) {
      const baseline = simulateDeaths(pollution, false);
      const cached = simulateDeaths(pollution, true);
      check(pollution ? '污染死亡后岗位复用与原逐步重算结果完全一致' : '饥荒、冻伤后岗位复用与原逐步重算结果完全一致',
        cached.closed && cached.draws === baseline.draws && cached.snapshot.jobs.merchant < 20 &&
        (pollution ? cached.snapshot.pollutionDeaths > 0 : cached.snapshot.famineDeaths > 0 && cached.snapshot.frostDeaths > 0) &&
        JSON.stringify(cached.snapshot) === JSON.stringify(baseline.snapshot),
        'draws=' + cached.draws + ' famine=' + cached.snapshot.famineDeaths +
        ' frost=' + cached.snapshot.frostDeaths + ' pollution=' + cached.snapshot.pollutionDeaths);
    }
  }
}
