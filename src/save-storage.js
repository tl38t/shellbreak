/* 天壳 / SHELLBREAK — 本机存档后端。
 * 网页继续使用 localStorage。TapTap 同时写入原生用户目录的双版本完整快照；
 * 每次快照包含 meta/run、序号和校验值，写入排队并读回验证。旧版的
 * tap.setStorage 与分键文件保留作迁移来源。启动时各来源并行读取，
 * 任何读取失败都不能被当成“确认没有存档”。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});

  /* ⚠️ 探测只认 `tap.getStorage`：它在 TapTap 小游戏运行时才有。
   *    不要用 `tap.env` 判断 —— 云存档上传那条路也读 tap.env，但两者能力不一定同时可用。 */
  function envAvailable() {
    return !!(root.tap && typeof root.tap.getStorage === 'function');
  }
  function fsAvailable() {
    return !!(root.tap && typeof root.tap.getFileSystemManager === 'function'
      && root.tap.env && root.tap.env.USER_DATA_PATH);
  }
  function localStore() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  var st = {
    writeOk: 0, writeFail: 0, lastError: '',
    tapOk: 0, tapFail: 0, fileOk: 0, fileFail: 0, lastMirrorAt: 0,
    lastRestoreSource: '', lastRestoreAt: 0
  };

  /* localStorage 的 key 形如 `shellbreak.run.v2`，落成文件名时只留安全字符。
   * ⚠️ 先剥掉开头的 `shellbreak.` —— key 本身已带前缀，不剥会得到
   *    `shellbreak-shellbreak_run_v2.json`（多层探测时很难一眼认出是谁的文件）。 */
  function fileNameFor(key) {
    var bare = String(key).replace(/^shellbreak[._-]/, '');
    return 'shellbreak-' + bare.replace(/[^a-zA-Z0-9_-]+/g, '_') + '.json';
  }
  function filePathFor(key) {
    if (!fsAvailable()) return null;
    return root.tap.env.USER_DATA_PATH + '/' + fileNameFor(key);
  }

  /* ── ① localStorage（同步主通道）──────────────────────────────── */
  function readLocal(key) {
    var ls = localStore();
    if (!ls) return null;
    try { return ls.getItem(key); } catch (e) { return null; }
  }
  function writeLocal(key, val) {
    var ls = localStore();
    if (!ls) { st.writeFail++; st.lastError = '浏览器本地存储不可用'; return false; }
    try {
      ls.setItem(key, val);
      st.writeOk++;
      return true;
    } catch (e) {
      /* 配额满 / 隐私模式 / 容器限制 —— 原先这里被 catch(e){} 吞掉，玩家零感知；
       * 现在记下来，由存档面板显示「上次保存失败：<原因>」。 */
      st.writeFail++;
      st.lastError = (e && (e.name || e.code) ? String(e.name || e.code) + ': ' : '')
        + (e && e.message ? e.message : String(e));
      return false;
    }
  }
  function removeLocal(key) {
    var ls = localStore();
    if (!ls) return;
    try { ls.removeItem(key); } catch (e) {}
  }

  /* 通用异步调用：回调式与 Promise 式双兼容（与 save-transfer 的 callApi 同构）。
   * ⚠️ 必须两路都接：TapTap API 既可能走 success/fail 回调，也可能直接返回 Promise；
   *    只接一种会在另一种实现下静默挂死。 */
  function call(target, method, options) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function ok(r) { if (!settled) { settled = true; resolve(r || {}); } }
      function fail(e) { if (!settled) { settled = true; reject(e || new Error(method + ' 调用失败')); } }
      var args = {}, k;
      for (k in options) args[k] = options[k];
      args.success = ok; args.fail = fail;
      try {
        var ret = target[method](args);
        if (ret && typeof ret.then === 'function') ret.then(ok, fail);
      } catch (e) { fail(e); }
    });
  }

  /* ── ② tap.setStorage（异步镜像）──────────────────────────────── */
  function writeTapStorage(key, val) {
    if (!envAvailable()) return Promise.resolve(false);
    return call(root.tap, 'setStorage', { key: key, data: val })
      .then(function () { st.tapOk++; return true; })
      .catch(function (e) {
        st.tapFail++;
        st.lastError = String((e && (e.errMsg || e.message)) || e);
        return false;
      });
  }
  function readTapStorage(key) {
    if (!envAvailable()) return Promise.resolve(null);
    /* 键不存在时走 fail —— 那是正常分支，不是错误。 */
    return call(root.tap, 'getStorage', { key: key })
      .then(function (r) { return (r && typeof r.data === 'string') ? r.data : null; })
      .catch(function () { return null; });
  }

  /* ── ③ tapfile://usr 文件（异步镜像）──────────────────────────── */
  function writeFsFile(key, val) {
    var p = filePathFor(key);
    if (!p) return Promise.resolve(false);
    return call(root.tap.getFileSystemManager(), 'writeFile',
      { filePath: p, data: val, encoding: 'utf8' })
      .then(function () { st.fileOk++; return true; })
      .catch(function (e) {
        st.fileFail++;
        st.lastError = String((e && (e.errMsg || e.message)) || e);
        return false;
      });
  }
  function readFsFile(key) {
    var p = filePathFor(key);
    if (!p) return Promise.resolve(null);
    return call(root.tap.getFileSystemManager(), 'readFile', { filePath: p, encoding: 'utf8' })
      .then(function (r) { return (r && typeof r.data === 'string') ? r.data : null; })
      .catch(function () { return null; });
  }

  /* TapTap 主存档：两份轮换文件加一份后台快照。每份同时包含 meta/run，
   * 避免轮回时分别恢复到不同周目。写队列只保留最新待写快照，上一笔完成后
   * 才写下一笔；文件读回一致才算提交成功。 */
  var NATIVE_SEQ_KEY = 'shellbreak.native-seq.v1';
  var nativeSeq = Number(readLocal(NATIVE_SEQ_KEY)) || 0;
  var nativePending = null, nativeWriting = false, nativeWaiters = [];
  var nativeLatest = null, nativeLastPromise = Promise.resolve(false);
  /* ── 原生槽写保护（2026-10-30）────────────────────────────────────
   * 【它挡的是什么】启动时 tap 还没注入、于是被判成「新玩家」开了新档。这时如果
   *   不保护，5 秒后的自动存档就会把新档写进 shellbreak-save-a/b，把那份还没被
   *   我们看见的好档碾掉；`hide` 槽也要一起挡 —— 它正是旧档最可能残留的地方。
   * 【谁开谁关】game.js 的 openFreshRun() 在「tap 未就绪就开新档」时打开，
   *   lateRescue 扫完（无论有没有捞到旧档）或超过 LATE_MS 时关闭。
   * 【代价】保护期内新档只落在 localStorage / 镜像，不进原生槽。真·新玩家最多
   *   损失这段时间的原生副本 —— 与「老玩家 100 小时被 5 秒覆盖」完全不对称，划算。 */
  var nativeHold = false;
  function setNativeHold(on) {
    nativeHold = !!on;
    return nativeHold;
  }
  function nativeHeld() { return nativeHold; }
  function nextNativeRevision() {
    nativeSeq = Math.max(nativeSeq + 1, Date.now() * 1000 + (nativeSeq % 2 ? 0 : 1));
    writeLocal(NATIVE_SEQ_KEY, String(nativeSeq));
    return nativeSeq;
  }
  function checksum(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function nativePath(slot) {
    return fsAvailable() ? root.tap.env.USER_DATA_PATH + '/shellbreak-save-' + slot + '.json' : null;
  }
  function nativeRecord(metaRaw, runRaw, forceNew) {
    var embedded = 0;
    try { embedded = Number(JSON.parse(runRaw)._saveSeq) || 0; } catch (e) {}
    var seq = !forceNew && embedded > 0 && Number.isSafeInteger(embedded)
      ? embedded : nextNativeRevision();
    nativeSeq = Math.max(nativeSeq, seq);
    var rec = { schema: 1, seq: seq, savedAt: Date.now(), meta: metaRaw, run: runRaw };
    rec.checksum = checksum(metaRaw + '\n' + runRaw);
    return rec;
  }
  function validNative(raw) {
    try {
      var rec = JSON.parse(raw);
      if (!rec || rec.schema !== 1 || typeof rec.meta !== 'string' || typeof rec.run !== 'string'
          || rec.checksum !== checksum(rec.meta + '\n' + rec.run)) return null;
      return rec;
    } catch (e) { return null; }
  }
  function writeNativeNext() {
    if (nativeWriting || !nativePending) return;
    var rec = nativePending; nativePending = null; nativeWriting = true;
    var slot = rec.seq % 2 ? 'a' : 'b', path = nativePath(slot);
    var raw = JSON.stringify(rec), fs = root.tap.getFileSystemManager();
    call(fs, 'writeFile', { filePath: path, data: raw, encoding: 'utf8' })
      .then(function () { return call(fs, 'readFile', { filePath: path, encoding: 'utf8' }); })
      .then(function (back) {
        if (!back || back.data !== raw) throw new Error('原生文件写后读回不一致');
        st.fileOk++; st.lastMirrorAt = Date.now();
        var remaining = [];
        nativeWaiters.forEach(function (w) { if (w.seq <= rec.seq) w.resolve(true); else remaining.push(w); });
        nativeWaiters = remaining;
      }).catch(function (e) {
        st.fileFail++; st.lastError = String((e && (e.errMsg || e.message)) || e);
        /* 失败的快照保留供下次保存重试；不能让更旧快照盖掉新快照。 */
        if (!nativePending || nativePending.seq < rec.seq) nativePending = rec;
        var remaining = [];
        nativeWaiters.forEach(function (w) { if (w.seq <= rec.seq) w.resolve(false); else remaining.push(w); });
        nativeWaiters = remaining;
      }).then(function () {
        nativeWriting = false;
        if (nativePending && nativePending.seq > rec.seq) writeNativeNext();
      });
  }
  function writeNativeSave(metaRaw, runRaw, forceNew) {
    if (nativeHold || !fsAvailable() || typeof metaRaw !== 'string' || typeof runRaw !== 'string') return Promise.resolve(false);
    nativeLatest = nativeRecord(metaRaw, runRaw, !!forceNew);
    nativePending = nativeLatest;
    nativeLastPromise = new Promise(function (resolve) {
      nativeWaiters.push({ seq: nativeLatest.seq, resolve: resolve });
      writeNativeNext();
    });
    return nativeLastPromise;
  }
  function flushNativeSync() {
    if (nativeHold || !nativeLatest || !fsAvailable()) return false;
    var fs = root.tap.getFileSystemManager(), path = nativePath('hide');
    if (typeof fs.writeFileSync !== 'function' || typeof fs.readFileSync !== 'function') return false;
    try {
      var raw = JSON.stringify(nativeLatest);
      fs.writeFileSync(path, raw, 'utf8');
      var back = fs.readFileSync(path, 'utf8');
      if (back !== raw) throw new Error('后台原生文件写后读回不一致');
      st.fileOk++; return true;
    } catch (e) { st.fileFail++; st.lastError = String(e && e.message || e); return false; }
  }
  function writeNativeSaveSync(metaRaw, runRaw) {
    if (nativeHold || !fsAvailable() || typeof metaRaw !== 'string' || typeof runRaw !== 'string') return false;
    var previous = nativeLatest;
    nativeLatest = nativeRecord(metaRaw, runRaw, true);
    if (flushNativeSync()) return true;
    nativeLatest = previous;
    return false;
  }
  function isMissing(e) {
    return /ENOENT|not exist|not found|不存在|找不到/i.test(String(e && (e.errMsg || e.message || e.code) || e));
  }
  function bounded(job, ms) {
    return new Promise(function (resolve) {
      var done = false, timer = root.setTimeout(function () { if (!done) { done = true; resolve({ status: 'timeout' }); } }, ms);
      job.then(function (v) { if (!done) { done = true; root.clearTimeout(timer); resolve(v); } },
        function (e) { if (!done) { done = true; root.clearTimeout(timer); resolve({ status: isMissing(e) ? 'absent' : 'error' }); } });
    });
  }
  function scanNativeSaves() {
    if (!fsAvailable()) return Promise.resolve({ records: [], uncertain: false });
    var fs = root.tap.getFileSystemManager();
    return Promise.all(['a', 'b', 'hide'].map(function (slot) {
      return bounded(call(fs, 'readFile', { filePath: nativePath(slot), encoding: 'utf8' })
        .then(function (r) { return { status: 'ok', record: validNative(r && r.data), slot: slot }; }), 2500);
    })).then(function (results) {
      var records = results.filter(function (r) { return r.status === 'ok' && r.record; });
      records.forEach(function (r) { nativeSeq = Math.max(nativeSeq, Number(r.record.seq) || 0); });
      return { records: records, uncertain: results.some(function (r) {
        return r.status === 'timeout' || r.status === 'error' || (r.status === 'ok' && !r.record);
      }) };
    });
  }
  function parsedPair(metaRaw, runRaw, source, seq, savedAt) {
    if (!runRaw) return null;
    try {
      var run = JSON.parse(runRaw), meta = metaRaw ? JSON.parse(metaRaw) : null;
      if (!run || typeof run !== 'object' || Array.isArray(run)
          || !run.res || typeof run.res !== 'object' || !run.lvl || typeof run.lvl !== 'object'
          || !run.jobs || typeof run.jobs !== 'object' || typeof run.shell !== 'number' || !isFinite(run.shell)
          || (metaRaw && (!meta || typeof meta !== 'object' || Array.isArray(meta)))) return null;
      return { source: source, runRaw: runRaw, metaRaw: metaRaw,
        cycle: Number(meta && meta.cycle) || 0,
        savedAt: Number(savedAt || run._ts) || 0,
        seq: Number(seq || run._saveSeq) || 0 };
    } catch (e) { return null; }
  }
  function scanSaveCandidates(runKey, metaKey) {
    var candidates = [], uncertain = false, hadData = false;
    var localRun = null, localMeta = null;
    try {
      var ls = localStore();
      if (!ls) uncertain = true;
      else { localRun = ls.getItem(runKey); localMeta = ls.getItem(metaKey); }
    } catch (e) { uncertain = true; }
    if (localRun || localMeta) hadData = true;
    var local = parsedPair(localMeta, localRun, 'localStorage');
    if (local) candidates.push(local);
    else if (hadData) uncertain = true;
    var tasks = [];
    if (envAvailable()) tasks.push(Promise.all([runKey, metaKey].map(function (key) {
      return bounded(call(root.tap, 'getStorage', { key: key }).then(function (r) {
        return { status: r && typeof r.data === 'string' ? 'ok' : 'absent', raw: r && r.data };
      }), 2500);
    })).then(function (a) {
      var run = a[0], meta = a[1];
      if (run.status === 'ok' || meta.status === 'ok') hadData = true;
      if (run.status === 'error' || run.status === 'timeout' || meta.status === 'error' || meta.status === 'timeout') uncertain = true;
      var pair = parsedPair(meta.raw || null, run.raw || null, 'tapStorage');
      if (pair) candidates.push(pair); else if (run.status === 'ok' || meta.status === 'ok') uncertain = true;
    }));
    if (fsAvailable()) {
      var fs = root.tap.getFileSystemManager();
      tasks.push(Promise.all([runKey, metaKey].map(function (key) {
        return bounded(call(fs, 'readFile', { filePath: filePathFor(key), encoding: 'utf8' }).then(function (r) {
          return { status: r && typeof r.data === 'string' ? 'ok' : 'absent', raw: r && r.data };
        }), 2500);
      })).then(function (a) {
        var run = a[0], meta = a[1];
        if (run.status === 'ok' || meta.status === 'ok') hadData = true;
        if (run.status === 'error' || run.status === 'timeout' || meta.status === 'error' || meta.status === 'timeout') uncertain = true;
        var pair = parsedPair(meta.raw || null, run.raw || null, 'legacyFile');
        if (pair) candidates.push(pair); else if (run.status === 'ok' || meta.status === 'ok') uncertain = true;
      }));
      tasks.push(scanNativeSaves().then(function (scan) {
        if (scan.uncertain) uncertain = true;
        scan.records.forEach(function (item) {
          hadData = true;
          var rec = item.record;
          var pair = parsedPair(rec.meta, rec.run, 'native:' + item.slot, rec.seq, rec.savedAt);
          if (pair) candidates.push(pair); else uncertain = true;
        });
      }));
    }
    return Promise.all(tasks).then(function () {
      candidates.sort(function (a, b) {
        /* 原生序号是提交顺序。旧格式只在没有有效原生快照时参与迁移。 */
        if (a.seq || b.seq) return (b.seq || 0) - (a.seq || 0);
        if (a.cycle !== b.cycle) return b.cycle - a.cycle;
        if (a.savedAt !== b.savedAt) return b.savedAt - a.savedAt;
        return b.seq - a.seq;
      });
      return { best: candidates[0] || null, candidates: candidates,
        status: candidates.length ? 'found' : (uncertain || hadData ? 'uncertain' : 'absent') };
    });
  }

  /* 异步镜像写：② 与 ③ 各自独立，任一成功即算有备份。
   * ⚠️ 调用方**不 await**（fire-and-forget）；返回 Promise 只为让回归能等它落定。 */
  var mirrorQueues = {};
  function runMirrorQueue(key) {
    var q = mirrorQueues[key];
    if (q.busy || !q.jobs.length) return;
    q.busy = true;
    var job = q.jobs[0];
    var work = job.type === 'remove' ? removeMirrorsNow(key)
      : Promise.all([writeTapStorage(key, job.val), writeFsFile(key, job.val)])
        .then(function (r) { return !!(r[0] || r[1]); });
    work.then(function (ok) {
      job.waiters.forEach(function (resolve) { resolve(ok); });
    }, function () {
      job.waiters.forEach(function (resolve) { resolve(false); });
    }).then(function () { q.jobs.shift(); q.busy = false; runMirrorQueue(key); });
  }
  function mirrorWrite(key, val) {
    st.lastMirrorAt = Date.now();
    var q = mirrorQueues[key] || (mirrorQueues[key] = { busy: false, jobs: [] });
    return new Promise(function (resolve) {
      var last = q.jobs[q.jobs.length - 1];
      if (last && last.type === 'write' && (q.jobs.length > 1 || !q.busy)) {
        last.val = val; last.waiters.push(resolve);
      } else q.jobs.push({ type: 'write', val: val, waiters: [resolve] });
      runMirrorQueue(key);
    });
  }

  /* 异步镜像删除：与 mirrorWrite 严格配对。
   * ⚠️ 少了这一步，「清空存档」会被 ②③ 里的旧档复活（清档后重启又回来了）。 */
  function mirrorRemove(key) {
    var q = mirrorQueues[key] || (mirrorQueues[key] = { busy: false, jobs: [] });
    return new Promise(function (resolve) {
      q.jobs.push({ type: 'remove', waiters: [resolve] });
      runMirrorQueue(key);
    });
  }
  function removeMirrorsNow(key) {
    var jobs = [];
    if (envAvailable()) {
      jobs.push(call(root.tap, 'removeStorage', { key: key })
        .catch(function () { return false; }));
    }
    var p = filePathFor(key);
    if (p) {
      jobs.push(call(root.tap.getFileSystemManager(), 'unlink', { filePath: p })
        .catch(function () { return false; }));
    }
    if (!jobs.length) return Promise.resolve(false);
    return Promise.all(jobs).then(function () { return true; });
  }

  /* ── ④ 诊断记录（2026-10-29）──────────────────────────────────────
   * 【为什么单独一条 key】诊断必须比存档活得久。它不进 SAVE_KEY / RUN_KEY，
   *   `loadRun` / `migrateRun` 从不读它 ⇒ **对老存档零影响**（不参与校验、不参与迁移、
   *   不参与任何数值计算）。体积约 400~700 字节，三处各写一份，代价可忽略。
   * 【为什么不复用 state.js 的 saveHealth】那份是**内存**计数，重启即归零。玩家报
   *   「存档没了」时我们去问他，重启过的那台机器上什么证据都不剩 —— 这正是过去几轮
   *   只能靠猜的原因。这里把它持久化，并额外记下**四个能力探针**与**启动出口**。
   * 【会话内节流】默认 20 秒一次；`immediate=true` 的重要事件（启动出口 / 丢档 /
   *   拒写 / 读回不一致）立刻落盘 —— 那些恰好是我们最需要的那几条。
   * ⚠️ 写入**绝不经过** state.saveRun 的 33 键校验：那条校验要拦的是坏存档，
   *   而诊断本身必须能在「存档写不进去」的时候写进去，否则观测不到故障。
   */
  var DIAG_KEY = 'shellbreak.diag.v1';
  var EMERG_KEY = 'shellbreak.emergency.v1';
  var DIAG_MIN_GAP = 20000;
  var diagCache = null;
  var diagLastWrite = 0;

  function verOf() { return (SB.CFG && SB.CFG.VERSION) || ''; }
  /* 云存档能力探针：优先用 save-transfer 的真实现（避免两份判据分叉），
   * 它还没加载时退回同构的鸭子判定（与 save-transfer.js 的 cloudAvailable 逐字一致）。 */
  function cloudProbe() {
    if (SB.saveTransfer && typeof SB.saveTransfer.cloudAvailable === 'function')
      return !!SB.saveTransfer.cloudAvailable();
    return !!(root.tap && typeof root.tap.getCloudSaveManager === 'function'
      && typeof root.tap.getFileSystemManager === 'function'
      && root.tap.env && root.tap.env.USER_DATA_PATH);
  }
  /* 四个能力位，形如 `ls1ts1fs0cl1`。这是 P0-1 的直接证据：
   * 只要看到 `ts0` 而 `fs1`，就说明「有备份但旧启动链读不到」。 */
  function capText() {
    return 'ls' + (localStore() ? 1 : 0) + 'ts' + (envAvailable() ? 1 : 0)
      + 'fs' + (fsAvailable() ? 1 : 0) + 'cl' + (cloudProbe() ? 1 : 0);
  }
  function diagBlank() {
    return { schema: 1, ver: verOf(), cap: '', boots: 0, boot: '', bootAt: 0,
      /* gate / gateMs（2026-10-30）：启动就绪门的出口与等待耗时。这是「tap 注入慢」
       * 唯一的现场证据 —— 玩家报「更新后第一次打开没档」时，这两个字段能直接区分
       * 「根本没等」与「等满了还是没来」。 */
      gate: '', gateMs: 0,
      ok: 0, fail: 0, skip: 0, patch: 0, skipKey: '', lastPatchKey: '',
      rbOk: 0, rbEmpty: 0, rbMismatch: 0,
      lost: 0, recover: '', emerg: 0, emergAt: 0, err: '', at: 0 };
  }
  function diagGet() {
    if (!diagCache) diagCache = diagBlank();
    return diagCache;
  }
  /* 同步读 ①（多数情况够用）。读不到就地新建一份**空**记录，但不会覆盖磁盘上的。 */
  function diagLoad() {
    var raw = readLocal(DIAG_KEY);
    if (raw) {
      try {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object' && o.schema === 1) { diagCache = o; return diagCache; }
      } catch (e) {}
    }
    diagCache = diagCache || diagBlank();
    return diagCache;
  }
  /* 异步兜底读（① 为空时）。只用于「这台设备到底玩过没有」这一个判断，
   * 所以不写回 ①（写回交给上层，避免在这里制造不可控的写入）。 */
  function diagLoadAsync(cb) {
    var local = readLocal(DIAG_KEY);
    if (local) { diagLoad(); cb(diagCache, 'local'); return; }
    readBackupAsync(DIAG_KEY).then(function (hit) {
      if (hit && hit.raw) {
        try {
          var o = JSON.parse(hit.raw);
          if (o && o.schema === 1) { diagCache = o; cb(diagCache, hit.source); return; }
        } catch (e) {}
      }
      diagCache = diagCache || diagBlank();
      cb(diagCache, null);
    }, function () { diagCache = diagCache || diagBlank(); cb(diagCache, null); });
  }
  function diagFlush(force) {
    var now = Date.now();
    if (!force && now - diagLastWrite < DIAG_MIN_GAP) return false;
    var d = diagGet();
    diagLastWrite = now;
    d.ver = verOf();
    d.cap = capText();
    d.at = now;
    var txt;
    try { txt = JSON.stringify(d); } catch (e) { return false; }
    writeLocal(DIAG_KEY, txt);
    mirrorWrite(DIAG_KEY, txt);   /* 不 await；②③ 任一成功即算有备份 */
    return true;
  }
  /* merge=true 时对同名数值字段做**累加**（计数用），否则直接覆盖。 */
  function diagSet(patch, immediate, merge) {
    var d = diagGet();
    for (var k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      if (merge && typeof patch[k] === 'number' && typeof d[k] === 'number') d[k] += patch[k];
      else d[k] = patch[k];
    }
    return diagFlush(!!immediate);
  }
  function diagBump(field, n, immediate) {
    var patch = {}; patch[field] = (typeof n === 'number' ? n : 1);
    return diagSet(patch, immediate, true);
  }
  /* 给人看的一行摘要（云存档 extra 用，必须短：官方 extra 上限 1000 字节）。
   * ⚠️ 用 `k=v` 而不是省掉等号：这段会显示在存档面板给玩家看，`capls1` 这种拼接
   *   连我们自己也一眼读不出是哪个字段。 */
  function diagBrief() {
    var d = diagGet();
    return (d.ver || '?') + ' cap=' + (d.cap || '?') + ' boot=' + (d.boot || '?')
      + ' ok=' + (d.ok || 0) + ' f=' + (d.fail || 0) + ' s=' + (d.skip || 0)
      + '/' + (d.skipKey || '-') + ' rb=' + (d.rbOk || 0) + '/' + (d.rbEmpty || 0)
      + '/' + (d.rbMismatch || 0) + ' lost=' + (d.lost || 0) + ' em=' + (d.emerg || 0);
  }
  /* 完整多行文本（面板「复制诊断信息」用）。不含任何存档内容。 */
  function diagText() {
    var d = diagGet();
    var t = function (ms) {
      if (!ms) return '—';
      try { return new Date(ms).toLocaleString(); } catch (e) { return String(ms); }
    };
    return [
      '天壳 SHELLBREAK 存档诊断',
      '版本 ' + (d.ver || '?') + '　生成 ' + t(Date.now()),
      '能力 ' + capText() + '　(ls=localStorage ts=tap.setStorage fs=用户目录文件 cl=云存档)',
      '启动 本次=' + (d.boot || '?') + '　累计=' + (d.boots || 0) + '　时刻=' + t(d.bootAt),
      '就绪 ' + (d.gate || '未走门') + (d.gateMs ? '　等待 ' + d.gateMs + 'ms' : ''),
      '恢复 最近来源=' + (d.recover || '—') + '　丢档(localStorage空但有备份)=' + (d.lost || 0) + ' 次',
      '写盘 成功=' + (d.ok || 0) + ' 失败=' + (d.fail || 0) + ' 拒写=' + (d.skip || 0)
        + ' 补位=' + (d.patch || 0) + '　最近坏键=' + (d.skipKey || '—'),
      '读回 一致=' + (d.rbOk || 0) + ' 空=' + (d.rbEmpty || 0) + ' 不一致=' + (d.rbMismatch || 0),
      '尸检 已保留=' + (d.emerg || 0) + ' 次　最近=' + t(d.emergAt),
      '错误 ' + (d.err || '—')
    ].join('\n');
  }

  /* 尸检副本（2026-10-29）：开新档**之前**，把 ②③ 里那份旧档原样抄一份存进 ④。
   * 【为什么必须有】过去每轮丢档最痛的不是「没备份」，而是「备份被新档覆盖」：
   *   启动判成新玩家 ⇒ startRun 立刻 saveRun ⇒ 镜像把 ②③ 写成 0.03 小时 ⇒
   *   唯一的好档当场销毁。抄一份之后，即使后面的覆盖照旧发生，原文也还在。
   * ⚠️ 三条护栏：① 只留一份（固定 key 滚动覆盖，不按时间堆文件，免得吃满配额）；
   *   ② 1.5 秒硬超时（容器 API 挂起时绝不能把 boot 卡住 —— 这是 10-28 事故的形状）；
   *   ③ **永不自动恢复**，只能由玩家在存档面板手动导出。
   * ⚠️ 读备份走 readBackupAsync，**不经过** game.boot 那道门 —— 那道门正是 P0-1 的 bug。 */
  function preserveEmergency(runKey, metaKey, cb) {
    var called = false;
    function done(r) { if (called) return; called = true; cb(r); }
    var timer = root.setTimeout ? root.setTimeout(function () { done(null); }, 1500) : null;
    function stop() { if (timer) { try { root.clearTimeout(timer); } catch (e) {} timer = null; } }
    Promise.all([readBackupAsync(runKey), readBackupAsync(metaKey)]).then(function (arr) {
      stop();
      var runHit = arr[0], metaHit = arr[1];
      if (!runHit && !metaHit) { done(null); return; }
      var rec = { schema: 1, at: Date.now(), ver: verOf(),
        runKey: runKey, metaKey: metaKey,
        run: runHit ? runHit.raw : null, meta: metaHit ? metaHit.raw : null };
      var txt;
      try { txt = JSON.stringify(rec); } catch (e) { st.lastError = '尸检副本序列化失败'; done(null); return; }
      writeLocal(EMERG_KEY, txt);
      mirrorWrite(EMERG_KEY, txt);
      var src = [];
      if (runHit) src.push('run:' + runHit.source);
      if (metaHit) src.push('meta:' + metaHit.source);
      diagSet({ emerg: (diagGet().emerg || 0) + 1, emergAt: rec.at,
        lost: (diagGet().lost || 0) + 1, recover: src.join(',') }, true);
      done({ source: src.join(','), at: rec.at, bytes: txt.length });
    }, function () { stop(); done(null); });
  }
  function emergencyLoad() {
    var raw = readLocal(EMERG_KEY);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      return (o && o.schema === 1) ? o : null;
    } catch (e) { return null; }
  }
  function emergencyClear() {
    removeLocal(EMERG_KEY);
    mirrorRemove(EMERG_KEY);
  }

  /* 旧版备份读：tap.setStorage 与分键文件并行，互不等待。
   * ⚠️ 拿不到时**不要在这里开新档** —— 那是调用方（game.boot）的决定，
   *    而且「三处都没有」与「容器把三处都清了」无法区分，必须交给上层策略。 */
  function readBackupAsync(key) {
    return Promise.all([
      bounded(readTapStorage(key).then(function (raw) { return { status: 'ok', raw: raw }; }), 2500),
      bounded(readFsFile(key).then(function (raw) { return { status: 'ok', raw: raw }; }), 2500)
    ]).then(function (results) {
      var hits = [];
      if (results[0].raw) hits.push({ raw: results[0].raw, source: 'tapStorage' });
      if (results[1].raw) hits.push({ raw: results[1].raw, source: 'file' });
      hits.sort(function (a, b) {
        function score(hit) {
          try { var v = JSON.parse(hit.raw); return Number(v._ts || v.at || v.cycle) || 0; }
          catch (e) { return 0; }
        }
        return score(b) - score(a);
      });
      var hit = hits[0] || null;
      if (hit) { st.lastRestoreSource = hit.source; st.lastRestoreAt = Date.now(); }
      return hit;
    });
  }

  function status() {
    return {
      env: envAvailable(), fs: fsAvailable(), cloud: cloudProbe(),
      cap: capText(),
      writeOk: st.writeOk, writeFail: st.writeFail, lastError: st.lastError,
      tapOk: st.tapOk, tapFail: st.tapFail, fileOk: st.fileOk, fileFail: st.fileFail,
      lastMirrorAt: st.lastMirrorAt,
      lastRestoreSource: st.lastRestoreSource, lastRestoreAt: st.lastRestoreAt,
      emergencyAt: (diagCache && diagCache.emergAt) || 0
    };
  }

  SB.store = {
    envAvailable: envAvailable, fsAvailable: fsAvailable, cloudProbe: cloudProbe,
    readLocal: readLocal, writeLocal: writeLocal, removeLocal: removeLocal,
    mirrorWrite: mirrorWrite, mirrorRemove: mirrorRemove,
    writeNativeSave: writeNativeSave, flushNativeSync: flushNativeSync,
    writeNativeSaveSync: writeNativeSaveSync,
    /* 原生槽写保护（2026-10-30）：见 setNativeHold 上方那段注释。 */
    setNativeHold: setNativeHold, nativeHeld: nativeHeld,
    scanSaveCandidates: scanSaveCandidates,
    nativeRevision: function () { return nativeSeq; },
    nextNativeRevision: nextNativeRevision,
    nativeLastWrite: function () { return nativeLastPromise; },
    readBackupAsync: readBackupAsync,
    readTapStorage: readTapStorage, readFsFile: readFsFile,
    /* ④ 诊断层（2026-10-29）：独立 key，对存档格式零影响。 */
    diagLoad: diagLoad, diagLoadAsync: diagLoadAsync, diagGet: diagGet,
    diagSet: diagSet, diagBump: diagBump, diagFlush: diagFlush,
    diagBrief: diagBrief, diagText: diagText, capText: capText,
    /* 尸检副本：只在「本机读不到档」那一刻由 game.boot 调用，永不自动恢复。 */
    preserveEmergency: preserveEmergency, emergencyLoad: emergencyLoad,
    emergencyClear: emergencyClear,
    DIAG_KEY: DIAG_KEY, EMERG_KEY: EMERG_KEY,
    status: status
  };
})(typeof window !== 'undefined' ? window : globalThis);
