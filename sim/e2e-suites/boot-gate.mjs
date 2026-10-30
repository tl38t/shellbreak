/* e2e suite: 运行时就绪门（2026-10-30）
 *
 * 钉住的事故：TapTap 原生桥注入 `tap` 是异步的，冷启动（刚更新完）最慢。
 *   旧代码在 DOMContentLoaded 里**同步** boot，那一刻三项能力全假 ⇒ 被读成
 *   「这台机器没有存档能力」⇒ 本机读不到 ⇒ startRun 并立刻落盘 ⇒ 5 秒后自动存档
 *   把新档写进 shellbreak-save-a/b，唯一的好档销毁。
 *
 * 本套件不复用共享沙箱（那条纪律见 persistence.mjs 顶部注释）：每次要一个**干净**
 * 的 SB，且必须能在「boot 之前」改 CFG —— 所以 document.readyState 设成 loading，
 * 由我们显式触发 DOMContentLoaded，boot 才跑。
 */
export async function run({ SB, check, makeDoc, loadAll, errors }) {
  console.log('\n=== 运行时就绪门（tap 慢注入）===');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const DIAG = 'shellbreak.diag.v1';

  function mkStore() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); }
    };
  }
  /* 假 tap：o={} 表示「桥刚建好、方法还没灌进来」—— 正是我们要模拟的那一刻。 */
  function mkTap(o) {
    o = o || {};
    const t = {};
    if (o.storage) {
      const kv = o.store || (o.store = {});
      t.getStorage = (a) => {
        if (kv[a.key] == null) { if (a.fail) a.fail({ errMsg: 'data not found' }); }
        else if (a.success) a.success({ data: kv[a.key] });
      };
      t.setStorage = (a) => { kv[a.key] = a.data; if (a.success) a.success({}); };
      t.removeStorage = (a) => { delete kv[a.key]; if (a.success) a.success({}); };
      /* 同步键值（2026-10-30）：官方写明「长期保留」，是「设备没有同步文件接口」时
       * 唯一能保证 onHide 那一刻真落盘的通道。夹具必须提供，否则测不到兜底分支。 */
      t.setStorageSync = (k, v) => { kv[k] = v; };
      t.getStorageSync = (k) => (kv[k] == null ? '' : kv[k]);
    }
    if (o.fs) {
      t.env = { USER_DATA_PATH: 'tapfile://usr' };
      const files = o.files || (o.files = {});
      const fs = {
        writeFile(a) { files[a.filePath] = a.data; if (a.success) a.success({}); },
        readFile(a) {
          if (files[a.filePath] == null) { if (a.fail) a.fail({ errMsg: 'ENOENT: no such file or directory' }); }
          else if (a.success) a.success({ data: files[a.filePath] });
        },
        unlink(a) { delete files[a.filePath]; if (a.success) a.success({}); },
        writeFileSync(p, d) { files[p] = d; },
        readFileSync(p) { if (files[p] == null) throw new Error('ENOENT'); return files[p]; }
      };
      t.getFileSystemManager = () => fs;
    }
    return t;
  }
  function mkSandbox(tapObj, ua) {
    const q = [];
    const dead = new Set();
    let seq = 0;
    const sb = {
      console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
      isNaN, parseInt, parseFloat,
      performance: { now: () => Date.now() },
      localStorage: mkStore(),
      navigator: { userAgent: ua || '' },
      _intervals: [], _timeouts: q,
      setInterval(fn) { sb._intervals.push(fn); return sb._intervals.length; },
      clearInterval() {},
      setTimeout(fn) { q.push({ id: ++seq, fn }); return seq; },
      clearTimeout(id) { dead.add(id); }
    };
    if (tapObj) sb.tap = tapObj;
    sb.window = sb; sb.globalThis = sb;
    const d = makeDoc();
    d.readyState = 'loading';
    let onReady = null;
    d.addEventListener = (ev, fn) => { if (ev === 'DOMContentLoaded') onReady = fn; };
    sb.document = d;
    sb.__boot = () => { if (onReady) { const f = onReady; onReady = null; f(); } };
    /* 只跑「当前这一代」定时器：poll 每跑一次会再排一个，一次全跑会死循环。 */
    sb.__flush = () => {
      const batch = q.splice(0, q.length);
      batch.forEach((j) => {
        if (dead.has(j.id)) return;
        try { j.fn(); } catch (e) { errors.push('就绪门定时器回调抛错: ' + e.message); }
      });
      return batch.length;
    };
    return sb;
  }
  async function settle(sb, rounds) {
    for (let i = 0; i < (rounds || 5); i++) { sb.__flush(); await sleep(0); }
  }
  function diagOf(sb) {
    try { return JSON.parse(sb.localStorage.getItem(DIAG) || '{}'); } catch (e) { return {}; }
  }
  /* 与 save-storage.js 的 checksum 同一个算法（FNV-1a 32 位）。原生快照靠它判有效，
   * 夹具必须自己算一遍，否则 validNative 直接返回 null、晚到补偿什么也看不见。 */
  function checksum(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  /* ── A) 能力晚到：等，且等到后能正常读档 ───────────────────────── */
  {
    const tapA = mkTap({});                       /* 桥在，方法还没来 */
    const sbA = mkSandbox(tapA, 'Mozilla/5.0 TapTap/2.0');
    let A = null;
    try { A = loadAll(sbA).SB; } catch (e) { errors.push('就绪门 A 加载异常: ' + e.message); }
    if (!A) {
      check('就绪门 A：沙箱加载成功', false);
    } else {
      sbA.__boot();
      check('只看到 tap 空壳时：不开新档（进入等待）',
        A.game.run() === null && !sbA.localStorage.getItem(A.CFG.RUN_KEY),
        'run=' + (A.game.run() ? '有' : 'null'));

      /* 桥把方法灌进来 —— 这就是「TapTap 加载得慢」之后的那一刻。 */
      Object.assign(tapA, mkTap({ storage: true, fs: true }));
      await settle(sbA, 6);
      check('桥就绪后：立刻继续启动并读档（不是干等满 8 秒）',
        !!A.game.run() && !!sbA.localStorage.getItem(A.CFG.RUN_KEY),
        'gate=' + (diagOf(sbA).gate || '?'));
      check('就绪出口被诊断记录为 ready',
        diagOf(sbA).gate === 'ready', 'gate=' + diagOf(sbA).gate);
      check('等到了才开档：不误报丢档（lost 计数为 0）',
        (diagOf(sbA).lost || 0) === 0);
      /* 能力矩阵第①格：全有。shapeText 必须在任何形态下都如实，不许整体为 0 或整体为 1。 */
      check('接口形态（全有）：wfs1 rfs1 wf1 ud1 kv1',
        A.store.shapeText() === 'wfs1 rfs1 wf1 ud1 kv1', A.store.shapeText());
    }
  }

  /* ── B) 一直等不到：超时必须暂停，绝不开新档 ───────────────────── */
  {
    const tapB = mkTap({});
    const sbB = mkSandbox(tapB, 'Mozilla/5.0 TapTap/2.0');
    let B = null;
    try { B = loadAll(sbB).SB; } catch (e) { errors.push('就绪门 B 加载异常: ' + e.message); }
    if (!B) {
      check('就绪门 B：沙箱加载成功', false);
    } else {
      /* 夹具注入短超时（game.js 的 gateCfg 是运行时读的，所以能改）。 */
      B.CFG.BOOT_GATE.WAIT_MS = 90;
      B.CFG.BOOT_GATE.POLL_MS = 15;
      B.CFG.BOOT_GATE.SKIP_MS = 30;
      sbB.__boot();
      check('等不到 tap 时：第一步不落盘新档',
        B.game.run() === null && !sbB.localStorage.getItem(B.CFG.RUN_KEY));
      for (let i = 0; i < 14; i++) { await sleep(20); sbB.__flush(); }
      await settle(sbB, 2);
      check('超时后仍不开新档（走保护性暂停，不是 startRun）',
        B.game.run() === null && !sbB.localStorage.getItem(B.CFG.RUN_KEY),
        'gate=' + (diagOf(sbB).gate || '?'));
      check('超时出口被诊断记录为 timeout', diagOf(sbB).gate === 'timeout');

      /* C) 暂停期间玩家显式开新局 ⇒ 必须打开原生槽写保护 */
      const booted = B.game.forceFreshBoot();
      check('暂停期间「确认没有旧档，开新局」仍然可用（不是死锁）',
        booted === true && !!B.game.run());
      check('tap 未就绪时开的新档：原生槽写保护已打开',
        B.store.nativeHeld() === true);

      /* D) 桥随后才到，本机没有旧档 ⇒ 扫描完必须解除保护（否则玩家永远没有原生副本） */
      Object.assign(tapB, mkTap({ storage: true, fs: true }));
      for (let i = 0; i < 8; i++) { await sleep(20); sbB.__flush(); }
      await settle(sbB, 4);
      check('晚到补偿扫完（本机无旧档）后解除写保护',
        B.store.nativeHeld() === false);
    }
  }

  /* ── E) 桥晚到 + 本机确有更完整的旧档 ⇒ 保护不解除，等玩家选 ──── */
  {
    const tapE = mkTap({});
    const sbE = mkSandbox(tapE, 'Mozilla/5.0 TapTap/2.0');
    let E = null;
    try { E = loadAll(sbE).SB; } catch (e) { errors.push('就绪门 E 加载异常: ' + e.message); }
    if (!E) {
      check('就绪门 E：沙箱加载成功', false);
    } else {
      E.CFG.BOOT_GATE.WAIT_MS = 90;
      E.CFG.BOOT_GATE.POLL_MS = 15;
      E.CFG.BOOT_GATE.SKIP_MS = 30;
      sbE.__boot();
      for (let i = 0; i < 14; i++) { await sleep(20); sbE.__flush(); }
      await settle(sbE, 2);

      /* ⚠️ 顺序是关键，反了夹具就测不到这条路：必须**先在 tap 未就绪时**开新档
       *   （openFreshRun 才会打开写保护、装上晚到补偿），再把桥修好。
       *   若先把 tap 补全，capReady 为真、保护根本不打开（第一版写错了，红了两条）。 */
      E.game.forceFreshBoot();
      check('E 前条件：tap 未就绪时开的新档确实开了写保护',
        E.store.nativeHeld() === true);

      /* 用当前这局的形状造一份「第 3 周目 / 10 小时」的旧档，写进 hide 槽。
       * ⚠️ 不复用一份手写的最小 run：结构不全会在 migrateRun/resumeRun 里炸，
       *    那会变成「夹具造错」而不是「被测代码错」。 */
      const tapFs = mkTap({ storage: true, fs: true });
      const oldMeta = JSON.parse(JSON.stringify(E.game.meta()));
      oldMeta.cycle = 3;
      const oldRun = JSON.parse(JSON.stringify(E.game.run()));
      oldRun.t = 36000;
      const mRaw = JSON.stringify(oldMeta), rRaw = JSON.stringify(oldRun);
      const rec = { schema: 1, seq: 111, savedAt: Date.now() - 3600000,
        meta: mRaw, run: rRaw, checksum: checksum(mRaw + '\n' + rRaw) };
      tapFs.getFileSystemManager().writeFileSync(
        'tapfile://usr/shellbreak-save-hide.json', JSON.stringify(rec));
      Object.assign(tapE, tapFs);

      for (let i = 0; i < 8; i++) { await sleep(20); sbE.__flush(); }
      await settle(sbE, 5);
      check('桥晚到且本机有更完整的旧档：写保护保持开启（等玩家决定，不落盘）',
        E.store.nativeHeld() === true);
      check('当前这局仍是新档（旧档只被提出，没有被自动套用）',
        (E.game.run().t || 0) < 36000, 't=' + (E.game.run().t || 0));

      const useBtn = sbE.document.getElementById('lateSaveUse');
      if (useBtn && typeof useBtn.onclick === 'function') useBtn.onclick();
      await settle(sbE, 4);
      check('玩家点「载入这份」后：旧档被接管',
        Math.round(E.game.run().t || 0) === 36000, 't=' + (E.game.run().t || 0));
      check('接管后解除写保护（旧档才能写回原生槽）',
        E.store.nativeHeld() === false);
    }
  }

  /* ── F) 纯网页：不许等 ─────────────────────────────────────────── */
  {
    const sbF = mkSandbox(null, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120');
    let F = null;
    try { F = loadAll(sbF).SB; } catch (e) { errors.push('就绪门 F 加载异常: ' + e.message); }
    if (!F) {
      check('就绪门 F：沙箱加载成功', false);
    } else {
      sbF.__boot();
      check('纯浏览器（无 tap、无 TapTap UA）：一步都不等，直接开新档',
        !!F.game.run() && diagOf(sbF).gate === 'direct',
        'gate=' + (diagOf(sbF).gate || '?') + ' run=' + (F.game.run() ? '有' : 'null'));
      check('纯浏览器：不记等待耗时（一步没等）',
        (diagOf(sbF).gateMs || 0) === 0, 'gate=' + diagOf(sbF).gate);
      /* 能力矩阵第④格：全无。这一格曾经是唯一被测过的形态 —— 其余三格没夹具，
       * 于是「有 fs 但没有同步写」的中间态一路绿灯放过了两个版本。 */
      check('接口形态（无 tap）：wfs0 rfs0 wf0 ud0 kv0',
        F.store.shapeText() === 'wfs0 rfs0 wf0 ud0 kv0', F.store.shapeText());
    }
  }

  /* ── G) 设备没有「同步文件接口」：落盘与导入都必须还能走通 ─────────
   * 钉住的事故（2026-10-30 玩家诊断反推）：某台 Android 机的 FileSystemManager
   *   没有 writeFileSync ⇒ ①onHide 的同步落盘恒失败（诊断里「后台原生文件同步
   *   保存未确认」但「写盘 失败=0」）；②installImportedSave 的原生硬门槛恒 false
   *   ⇒「用云端覆盖本地」「从存档码导入」100% 中止回滚，玩家只觉得按钮没反应。 */
  {
    const tapG = mkTap({ storage: true, fs: true });
    /* 把同步读写抹掉 —— 这正是真机的形状（异步 writeFile 正常，同步没有）。 */
    const fsG = tapG.getFileSystemManager();
    delete fsG.writeFileSync;
    delete fsG.readFileSync;
    const sbG = mkSandbox(tapG, 'Mozilla/5.0 TapTap/2.0');
    let reloads = 0;
    sbG.location = { reload: () => { reloads++; } };   /* installImportedSave 末尾会 reload */
    let G = null;
    try { G = loadAll(sbG).SB; } catch (e) { errors.push('就绪门 G 加载异常: ' + e.message); }
    if (!G) {
      check('就绪门 G：沙箱加载成功', false);
    } else {
      sbG.__boot();
      /* ⚠️ 必须先让一轮微任务落定，再开始 flush。
       *   本夹具的 `setTimeout` 不认延迟（排队即跑），而 `scanSaveCandidates` 内部用
       *   `bounded(…, 2500)` 给每个读操作套超时 ⇒ 若 boot 刚同步跑完 scan 就 flush，
       *   那些 2.5 秒超时会**立刻**触发，扫描被判成 `uncertain`（实测：夹具第一版就
       *   因此崩在 showRecoveryPending）。先 `await sleep(0)` 让 promise 链结算完，
       *   定时器已被 clearTimeout 标记，后续 flush 才等价于「真机上的正常读」。 */
      await sleep(0);
      await settle(sbG, 6);
      check('G 前条件：这台设备确实开起来了（能力齐、只是没有同步文件 API）',
        !!G.game.run() && G.store.syncStorageAvailable() === true);

      /* 1) 同步落盘：文件路不通 → 必须退到 tap.setStorageSync 且返回成功 */
      const flushed = G.store.flushNativeSync();
      check('无同步文件接口时：同步落盘退到 tap.setStorageSync 并成功',
        flushed === true && G.store.syncState() === 'kv',
        'flushed=' + flushed + ' state=' + G.store.syncState());
      const kvRun = tapG.getStorageSync ? tapG.getStorageSync(G.CFG.RUN_KEY) : null;
      check('键值通道里确实有这份主档（不是只返回了 true）',
        !!kvRun && Number(JSON.parse(kvRun).t) >= 0);
      check('诊断把通道记成 kv（下次玩家发诊断就能一眼定性）',
        G.store.diagText().indexOf('落盘 同步=kv') >= 0,
        G.store.diagText().split('\n').filter((l) => l.indexOf('落盘') === 0).join(''));
      /* 能力矩阵第②格：有 fs、有异步写、**没有**同步读写。诊断必须自己说出这件事，
       * 不能让下一个人再从返回值反推。 */
      check('接口形态（有 fs 无同步）：wfs0 rfs0 wf1 ud1 kv1',
        G.store.shapeText() === 'wfs0 rfs0 wf1 ud1 kv1', G.store.shapeText());
      /* ⚠️ 这里不能用 `/^接口/` 锚定 —— diagText 是多行拼接的单个字符串，
       *    不带 m 标志时 `^` 只匹配整串开头，永远命中不了第二行（第一版就红在这）。
       *    用子串匹配，测的是「这一行在不在、值对不对」，不是行首位置。 */
      check('诊断里有「接口」这一行且标明 wfs0',
        G.store.diagText().indexOf('接口 wfs0') >= 0,
        G.store.diagText().split('\n').filter((l) => l.indexOf('接口') === 0).join(''));

      /* 2) 导入：旧代码在这台设备上必然回滚 + throw。现在必须成功。 */
      const beforeSeq = Number((G.game.run() || {})._saveSeq) || 0;
      const bundle = { format: 'shellbreak-save', version: 1, save: {
        meta: JSON.parse(JSON.stringify(G.game.meta())),
        run: Object.assign(JSON.parse(JSON.stringify(G.game.run())), { t: 7910 })
      } };
      let thrown = null, ret = null;
      try { ret = G.game.installImportedSave(bundle); } catch (e) { thrown = e; }
      check('无同步文件接口的设备上：导入不再中止（这就是「云端覆盖无效」的根因）',
        !thrown && ret === true, thrown ? 'throw: ' + thrown.message : '');
      const afterRaw = sbG.localStorage.getItem(G.CFG.RUN_KEY);
      check('导入后主档确实换成了导入的那份',
        !!afterRaw && Math.round(JSON.parse(afterRaw).t) === 7910,
        't=' + (afterRaw ? JSON.parse(afterRaw).t : 'null'));
      check('导入后取了本机更大的 seq（下次启动三源比新旧时它才赢得下来）',
        Number(JSON.parse(afterRaw)._saveSeq) > beforeSeq,
        'before=' + beforeSeq + ' after=' + (afterRaw ? JSON.parse(afterRaw)._saveSeq : '?'));
      check('导入末尾仍走 reload（文件/存档码这条路的既有语义没变）', reloads === 1,
        'reloads=' + reloads);
    }
  }

  /* ── H) 只有键值通道、连文件系统都没有：兜底必须真落地 ─────────────
   * 能力矩阵第③格。造这一格立刻抓到一个真 bug（已修）：writeNativeSave 的旧判据
   *   要求 `fsAvailable()`，而这台机器上它恒 false ⇒ nativeLatest 永远是 null ⇒
   *   flushNativeSync 只能返回 nolatest ⇒ **kv 兜底一次都不可能被触发**。
   *   也就是说「降级通道」被主路的门槛一起掐死了，和导入被掐是同一个病。
   * ⚠️ 这一格不能靠 G 段代劳：G 段有 fs（只是没同步方法），异步队列照跑，
   *    快照照建，测不出「队列根本跑不了」时快照会不会被建起来。 */
  {
    const tapH = mkTap({ storage: true });        /* 只有 getStorage/setStorage*，无 getFileSystemManager */
    const sbH = mkSandbox(tapH, 'Mozilla/5.0 TapTap/2.0');
    let H = null;
    try { H = loadAll(sbH).SB; } catch (e) { errors.push('就绪门 H 加载异常: ' + e.message); }
    if (!H) {
      check('就绪门 H：沙箱加载成功', false);
    } else {
      let bootErrH = null;
      try { sbH.__boot(); } catch (e) { bootErrH = e; }
      await sleep(0);
      await settle(sbH, 6);
      check('H 前条件：无文件系统但有键值通道，游戏能起来',
        !!H.game.run() && H.store.syncStorageAvailable() === true,
        'run=' + (H.game.run() ? '有' : 'null'));
      check('接口形态（只有 kv）：wfs0 rfs0 wf0 ud0 kv1',
        H.store.shapeText() === 'wfs0 rfs0 wf0 ud0 kv1', H.store.shapeText());

      const flushedH = H.store.flushNativeSync();
      check('无文件系统时：同步落盘仍走 kv 并成功（旧判据下这里是 nolatest）',
        flushedH === true && H.store.syncState() === 'kv',
        'flushed=' + flushedH + ' state=' + H.store.syncState());
      const kvRunH = tapH.getStorageSync ? tapH.getStorageSync(H.CFG.RUN_KEY) : null;
      check('键值通道里确实落了主档（不是只返回 true）',
        !!kvRunH && Number(JSON.parse(kvRunH).t) >= 0,
        kvRunH ? 't=' + JSON.parse(kvRunH).t : 'null');
      check('无文件系统时启动不会去碰异步文件队列（碰了就是 TypeError）',
        !bootErrH, bootErrH ? bootErrH.message : '');
    }
  }

  /* 共享 SB 未被这些沙箱污染（这条只是在替上面这些独立上下文兜底）。 */
  check('共享沙箱的 SB 未被就绪门夹具污染', !!SB && !!SB.game);
}
