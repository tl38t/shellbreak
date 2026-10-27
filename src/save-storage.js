/* 天壳 / SHELLBREAK — 存档多后端（2026-10-27）
 *
 * 【为什么需要这一层】
 * 玩家一直报「退出之后就没存档了」。查 TapTap 官方一手文档后定性：**是，但不是被沙盒
 * 「影响」，而是我们只用了沙盒唯一不保证的那条通道**：
 *   · 官方云存档文档的路径表里，只有 `tap.env.USER_DATA_PATH`（tapfile://usr）被标
 *     「用户数据目录（**持久化**）」；TEMP_DATA_PATH 标临时、STORE_DATA_PATH 标存储。
 *   · `tap.setStorage` 是**独立于浏览器 localStorage** 的通道，官方承诺「数据将长期保留，
 *     除非用户手动删除或系统因空间不足自动清理」（1MB/key、总 10MB）。
 *   · 而浏览器 localStorage 在小游戏容器里**没有任何持久性承诺**（官方社区文章原话：
 *     「本地存储既不可靠也不跨设备，云存档不是可选项而是必须」）。
 * 我们的存档原先 100% 压在 localStorage 上（state.js 8 处 / game.js 26 处），
 * `tap.setStorage` 一次没用过 ⇒ 容器清缓存 / 版本更新重建 WebView / 空间不足即丢。
 *
 * 【本层的策略：不改同步语义，只加冗余】
 *   写 = 同步写 ① localStorage（保持 state.js 现有同步路径不阻塞主循环）
 *        + 异步镜像 ② tap.setStorage、③ tapfile://usr/shellbreak-<key>.json（fire-and-forget）
 *   读 = 先同步读 ①（绝大多数情况够用）；① 空时由 game.boot 调 readBackupAsync 异步兜底。
 *   ⚠️ **绝不在写路径上 await 异步后端** —— 存档每 5 秒一次，等异步会让主循环抖动。
 *
 * 【三处必须一起清】
 *   clearRun / wipeSave 若只清 ①，玩家点「清空存档」后下次启动会从 ②③ 把旧档读回来 ⇒
 *   「清档不管用」。故本层提供 mirrorRemove，与 mirrorWrite 严格配对。
 *
 * 【环境降级】
 *   浏览器 / node 沙箱里 `tap.getStorage` 不存在 ⇒ envAvailable() 为假 ⇒
 *   所有异步后端退化为空操作，行为与改造前完全一致（e2e 不会因此变红）。
 */
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

  /* 异步镜像写：② 与 ③ 各自独立，任一成功即算有备份。
   * ⚠️ 调用方**不 await**（fire-and-forget）；返回 Promise 只为让回归能等它落定。 */
  function mirrorWrite(key, val) {
    st.lastMirrorAt = Date.now();
    return Promise.all([writeTapStorage(key, val), writeFsFile(key, val)])
      .then(function (r) { return !!(r[0] || r[1]); });
  }

  /* 异步镜像删除：与 mirrorWrite 严格配对。
   * ⚠️ 少了这一步，「清空存档」会被 ②③ 里的旧档复活（清档后重启又回来了）。 */
  function mirrorRemove(key) {
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

  /* 异步兜底读：② 优先（同源、快），再 ③。都没有返回 null。
   * ⚠️ 拿不到时**不要在这里开新档** —— 那是调用方（game.boot）的决定，
   *    而且「三处都没有」与「容器把三处都清了」无法区分，必须交给上层策略。 */
  function readBackupAsync(key) {
    return readTapStorage(key).then(function (v) {
      if (v) return { raw: v, source: 'tapStorage' };
      return readFsFile(key).then(function (v2) {
        return v2 ? { raw: v2, source: 'file' } : null;
      });
    }).then(function (hit) {
      if (hit) { st.lastRestoreSource = hit.source; st.lastRestoreAt = Date.now(); }
      return hit;
    });
  }

  function status() {
    return {
      env: envAvailable(), fs: fsAvailable(),
      writeOk: st.writeOk, writeFail: st.writeFail, lastError: st.lastError,
      tapOk: st.tapOk, tapFail: st.tapFail, fileOk: st.fileOk, fileFail: st.fileFail,
      lastMirrorAt: st.lastMirrorAt,
      lastRestoreSource: st.lastRestoreSource, lastRestoreAt: st.lastRestoreAt
    };
  }

  SB.store = {
    envAvailable: envAvailable, fsAvailable: fsAvailable,
    readLocal: readLocal, writeLocal: writeLocal, removeLocal: removeLocal,
    mirrorWrite: mirrorWrite, mirrorRemove: mirrorRemove,
    readBackupAsync: readBackupAsync,
    readTapStorage: readTapStorage, readFsFile: readFsFile,
    status: status
  };
})(typeof window !== 'undefined' ? window : globalThis);
