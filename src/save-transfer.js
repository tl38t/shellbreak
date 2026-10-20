/* 天壳 / SHELLBREAK — 存档导入导出与 TapTap 云存档。
 * 普通网页只提供文件/存档码；云存档严格依赖 TapTap 小游戏运行时，不做假成功兜底。 */
(function (root) {
  'use strict';
  var SB = root.SB || (root.SB = {});
  var CFG = SB.CFG;
  var FORMAT = 'shellbreak-save', FORMAT_VERSION = 1;
  var CLOUD_NAME = 'shellbreak_main', CLOUD_FILE = 'shellbreak-save-v1.json';
  var CLOUD_COOLDOWN_KEY = 'shellbreak.cloud-upload-at.v1';
  var lastUploadAt = 0, busy = false, pendingCloudArchive = null;

  function localStore() { try { return root.localStorage || null; } catch (e) { return null; } }
  function rawLocal(key) { var ls = localStore(); try { return ls ? ls.getItem(key) : null; } catch (e) { return null; } }
  function dateLabel(ms) {
    try { return new Date(ms).toLocaleString(); } catch (e) { return new Date(ms).toISOString(); }
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function crc32(text) {
    var crc = -1, i, j, c;
    for (i = 0; i < text.length; i++) {
      crc ^= text.charCodeAt(i);
      for (j = 0; j < 8; j++) { c = crc & 1; crc = (crc >>> 1) ^ (c ? 0xedb88320 : 0); }
    }
    return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0');
  }
  function bundleForSave(save) {
    return { format: FORMAT, version: FORMAT_VERSION, createdAt: Date.now(), save: save,
      checksum: crc32(JSON.stringify(save)) };
  }
  function currentBundle() {
    var s = SB.game && SB.game.run ? SB.game.run() : null;
    var m = SB.game && SB.game.meta ? SB.game.meta() : null;
    if (!s || !m) throw new Error('当前存档无法正常载入；可以先导出原始存档救援包。');
    return bundleForSave({ meta: m, run: SB.game.snapshot(s) });
  }
  function exportBundle() {
    try { return currentBundle(); }
    catch (liveError) {
      /* 若读档保护已暂停游戏，仍允许玩家把主档和最近原始备份导出带走。 */
      var raw = { meta: rawLocal(CFG.SAVE_KEY), run: rawLocal(CFG.RUN_KEY),
        metaBackup: rawLocal(CFG.SAVE_BACKUP_KEY), runBackup: rawLocal(CFG.RUN_BACKUP_KEY) };
      if (raw.meta === null && raw.run === null && raw.metaBackup === null && raw.runBackup === null) throw liveError;
      return { format: FORMAT, version: FORMAT_VERSION, createdAt: Date.now(), recovery: true,
        raw: raw, checksum: crc32(JSON.stringify(raw)) };
    }
  }
  function validateBundle(value) {
    if (!value || value.format !== FORMAT || value.version !== FORMAT_VERSION)
      throw new Error('这不是受支持的天壳存档文件或存档码。');
    if (value.recovery) {
      if (!value.raw || typeof value.raw !== 'object'
          || !(value.raw.meta === null || typeof value.raw.meta === 'string')
          || !(value.raw.run === null || typeof value.raw.run === 'string')
          || !(value.raw.metaBackup === null || typeof value.raw.metaBackup === 'string')
          || !(value.raw.runBackup === null || typeof value.raw.runBackup === 'string'))
        throw new Error('原始救援包格式无效。');
      if (typeof value.checksum === 'string' && value.checksum !== crc32(JSON.stringify(value.raw)))
        throw new Error('救援包校验失败，内容可能不完整或已损坏。');
      return value;
    }
    if (!value.save) throw new Error('存档文件缺少游戏数据。');
    if (typeof value.checksum === 'string' && value.checksum !== crc32(JSON.stringify(value.save)))
      throw new Error('存档校验失败，内容可能不完整或已损坏。');
    if (!value.save.meta || !value.save.run) throw new Error('存档缺少跨周目或本周目数据。');
    return value;
  }
  function downloadFile(name, contents) {
    var blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
    var url = root.URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  }
  function bytesFromText(text) {
    if (root.TextEncoder) return new root.TextEncoder().encode(text);
    var escaped = unescape(encodeURIComponent(text)), out = new Uint8Array(escaped.length);
    for (var i = 0; i < escaped.length; i++) out[i] = escaped.charCodeAt(i);
    return out;
  }
  function textFromBytes(bytes) {
    if (root.TextDecoder) return new root.TextDecoder().decode(bytes);
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }
  function base64url(bytes) {
    var binary = '', step = 0x8000;
    for (var i = 0; i < bytes.length; i += step)
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
    return root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function unbase64url(code) {
    var normalized = code.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    var binary = root.atob(normalized), out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  function streamBytes(bytes, stream) {
    return new root.Response(new root.Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (buffer) { return new Uint8Array(buffer); });
  }
  function encodeSaveCode(bundle) {
    var bytes = bytesFromText(JSON.stringify(bundle));
    if (typeof root.CompressionStream === 'function' && root.Blob && root.Response) {
      return streamBytes(bytes, new root.CompressionStream('gzip')).then(function (packed) {
        return 'SB1G.' + base64url(packed);
      }).catch(function () { return 'SB1J.' + base64url(bytes); });
    }
    return Promise.resolve('SB1J.' + base64url(bytes));
  }
  function decodeSaveCode(code) {
    var match = /^SB1([GJ])\.([A-Za-z0-9_-]+)$/.exec(String(code || '').trim().replace(/\s+/g, ''));
    if (!match) return Promise.reject(new Error('存档码格式不正确。'));
    var bytes;
    try { bytes = unbase64url(match[2]); } catch (e) { return Promise.reject(new Error('存档码无法解码。')); }
    if (match[1] === 'J') return Promise.resolve(textFromBytes(bytes));
    if (typeof root.DecompressionStream !== 'function' || !root.Blob || !root.Response)
      return Promise.reject(new Error('当前浏览器不支持读取压缩存档码，请在较新的 Chrome 中打开。'));
    return streamBytes(bytes, new root.DecompressionStream('gzip')).then(textFromBytes);
  }
  function setStatus(message, error) {
    var node = document.getElementById('saveManagerStatus');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('error', !!error);
  }
  function setBusy(value) {
    busy = !!value;
    var buttons = document.querySelectorAll('#saveManagerPanel button[data-save-action]');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = busy;
  }
  function openPanel() {
    var box = document.getElementById('modalBox'), modal = document.getElementById('modal');
    if (!box || !modal) return;
    var cloudOK = cloudAvailable();
    box.innerHTML =
      '<div class="modal-hd"><b>存档管理</b><button type="button" class="modal-x" id="saveManagerClose" aria-label="关闭">×</button></div>' +
      '<div id="saveManagerPanel">' +
        '<p class="save-manager-intro">存档文件和存档码都包含当前周目与跨周目进度。导入会先备份本机现有存档，并在确认后重载游戏。</p>' +
        '<div class="save-manager-actions">' +
          '<button type="button" class="btn buy" data-save-action="export-file">导出存档文件</button>' +
          '<button type="button" class="btn" data-save-action="export-code">生成并复制存档码</button>' +
          '<button type="button" class="btn" data-save-action="import-file">从文件导入</button>' +
          '<button type="button" class="btn" data-save-action="import-code">从存档码导入</button>' +
          '<button type="button" class="btn" data-save-action="cloud-upload"' + (cloudOK ? '' : ' disabled') + '>上传到 TapTap 云存档</button>' +
          '<button type="button" class="btn" data-save-action="cloud-download"' + (cloudOK ? '' : ' disabled') + '>从 TapTap 云存档恢复</button>' +
        '</div>' +
        '<label class="save-manager-label" for="saveCodeBox">存档码</label>' +
        '<textarea id="saveCodeBox" rows="4" spellcheck="false" placeholder="生成的存档码会显示在这里；也可以粘贴已有存档码"></textarea>' +
        '<input type="file" id="saveFileInput" accept=".json,application/json" hidden>' +
        '<p id="saveManagerStatus" class="save-manager-status" role="status">' +
          (cloudOK ? 'TapTap 云存档已就绪。' : '云存档只在 TapTap 小游戏运行环境可用；当前浏览器仍可导出/导入文件和存档码。') +
        '</p>' +
      '</div>';
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.getElementById('saveManagerClose').onclick = function () { closePanel(); };
    document.getElementById('saveFileInput').onchange = onFileSelected;
    box.querySelectorAll('[data-save-action]').forEach(function (button) {
      button.onclick = function () { onAction(button.getAttribute('data-save-action')); };
    });
  }
  function closePanel() {
    if (SB.ui && SB.ui.render && SB.ui.render.hideModal) SB.ui.render.hideModal();
    else {
      var modal = document.getElementById('modal'); if (modal) modal.classList.add('hidden');
      if (document.body) document.body.classList.remove('modal-open');
    }
  }
  function onAction(action) {
    if (busy) return;
    var box = document.getElementById('saveCodeBox');
    if (action === 'export-file') return exportFile();
    if (action === 'export-code') return exportCode();
    if (action === 'import-file') { document.getElementById('saveFileInput').click(); return; }
    if (action === 'import-code') return importCode(box.value);
    if (action === 'cloud-upload') return uploadCloud();
    if (action === 'cloud-download') return downloadCloud();
  }
  function exportFile() {
    try {
      var bundle = exportBundle();
      downloadFile('shellbreak-save-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(bundle, null, 2));
      setStatus(bundle.recovery ? '游戏读档异常：已导出包含本地原始主档和备份的救援文件。' : '存档文件已导出。建议另存到游戏目录以外的位置。');
    } catch (e) { setStatus(e.message || String(e), true); }
  }
  function exportCode() {
    var bundle;
    try { bundle = exportBundle(); } catch (e) { setStatus(e.message || String(e), true); return; }
    setBusy(true); setStatus('正在压缩并生成存档码…');
    encodeSaveCode(bundle).then(function (code) {
      var box = document.getElementById('saveCodeBox');
      if (box) box.value = code;
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
          return root.navigator.clipboard.writeText(code).then(function () { setStatus(bundle.recovery ? '原始存档救援码已生成并复制到剪贴板。' : '存档码已生成并复制到剪贴板。'); }, function () {
          if (box) { box.focus(); box.select(); }
          setStatus(bundle.recovery ? '原始存档救援码已生成；请手动复制文本框内容。' : '存档码已生成；浏览器未授权剪贴板，请手动复制文本框内容。');
        });
      }
      if (box) { box.focus(); box.select(); }
      setStatus(bundle.recovery ? '原始存档救援码已生成；请手动复制文本框内容。' : '存档码已生成；请手动复制文本框内容。');
    }).catch(function (e) { setStatus('生成存档码失败：' + (e.message || e), true); })
      .then(function () { setBusy(false); });
  }
  function onFileSelected(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var bundle;
      try { bundle = validateBundle(JSON.parse(String(reader.result || ''))); }
      catch (e) { setStatus(e.message || String(e), true); return; }
      confirmImport(bundle, '文件「' + escapeHtml(file.name) + '」');
    };
    reader.onerror = function () { setStatus('读取存档文件失败。', true); };
    reader.readAsText(file, 'utf-8');
  }
  function importCode(text) {
    setBusy(true); setStatus('正在读取存档码…');
    decodeSaveCode(text).then(function (json) {
      var bundle = validateBundle(JSON.parse(json));
      setBusy(false); confirmImport(bundle, '存档码');
    }).catch(function (e) {
      setBusy(false); setStatus('导入失败：' + (e.message || e), true);
    });
  }
  function confirmImport(bundle, source) {
    var box = document.getElementById('modalBox');
    var local = localStore(), cycle = bundle.save && bundle.save.meta && bundle.save.meta.cycle;
    if (bundle.recovery) {
      box.innerHTML = '<h3>恢复原始救援包？</h3>' +
        '<div class="save-manager-warning">救援包保留的是存档原始文本，不保证其中数据能被当前版本读取。恢复前会把这台设备现有的主档另存为本机备份。</div>' +
        '<div class="foot" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" id="saveImportCancel">取消</button>' +
        '<button type="button" class="btn" id="saveRestoreMain"' + (bundle.raw.meta === null && bundle.raw.run === null ? ' disabled' : '') + '>还原包内主档</button>' +
        '<button type="button" class="btn buy" id="saveRestoreBackup"' + (bundle.raw.metaBackup === null && bundle.raw.runBackup === null ? ' disabled' : '') + '>还原包内备份</button></div>';
      document.getElementById('saveImportCancel').onclick = openPanel;
      function restorePair(metaRaw, runRaw) {
        if (!local) { openPanel(); setStatus('本机存储不可用，未恢复。', true); return; }
        try { SB.game.restoreRawSave({ meta: metaRaw, run: runRaw }); }
        catch (e) { openPanel(); setStatus(e.message || String(e), true); }
      }
      document.getElementById('saveRestoreMain').onclick = function () { restorePair(bundle.raw.meta, bundle.raw.run); };
      document.getElementById('saveRestoreBackup').onclick = function () { restorePair(bundle.raw.metaBackup, bundle.raw.runBackup); };
      return;
    }
    box.innerHTML =
      '<h3>覆盖本地存档？</h3>' +
      '<div class="save-manager-warning">即将从' + source + '导入' + (cycle ? '第 ' + cycle + ' 周目' : '') + '存档。导入后当前本地进度会被替换；程序会先把当前原始存档保存到本机备份键。</div>' +
      '<div class="save-manager-status">确认后页面会自动重载。若本机存储无法先备份，导入会中止。</div>' +
      '<div class="foot" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" id="saveImportCancel">取消</button><button type="button" class="btn buy" id="saveImportConfirm">备份并导入</button></div>';
    document.getElementById('saveImportCancel').onclick = openPanel;
    document.getElementById('saveImportConfirm').onclick = function () {
      if (!local) { openPanel(); setStatus('本机存储不可用，未导入。', true); return; }
      try { SB.game.installImportedSave(bundle); }
      catch (e) { openPanel(); setStatus(e.message || String(e), true); }
    };
  }

  function cloudAvailable() {
    return !!(root.tap && typeof root.tap.getCloudSaveManager === 'function'
      && typeof root.tap.getFileSystemManager === 'function'
      && root.tap.env && root.tap.env.USER_DATA_PATH);
  }
  function cloudObjects() {
    if (!cloudAvailable()) throw new Error('当前不是 TapTap 小游戏运行环境，云存档接口不可用。');
    return { cloud: root.tap.getCloudSaveManager(), fs: root.tap.getFileSystemManager(), base: root.tap.env.USER_DATA_PATH };
  }
  function callApi(target, method, options) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function ok(result) { if (!settled) { settled = true; resolve(result || {}); } }
      function fail(error) { if (!settled) { settled = true; reject(error || new Error(method + ' 调用失败')); } }
      var args = Object.assign({}, options, { success: ok, fail: fail });
      try {
        var returned = target[method](args);
        if (returned && typeof returned.then === 'function') returned.then(ok, fail);
      } catch (e) { fail(e); }
    });
  }
  function errorText(error) {
    var msg = error && (error.errMsg || error.message || error.msg);
    var code = error && (error.errno !== undefined ? error.errno : error.code);
    return (code !== undefined ? '[' + code + '] ' : '') + (msg || String(error || '未知错误'));
  }
  function archiveList(cloud) {
    return callApi(cloud, 'getArchiveList', {}).then(function (result) {
      return Array.isArray(result.saves) ? result.saves : (Array.isArray(result.archives) ? result.archives : []);
    });
  }
  function archiveName(item) {
    return item && (item.name || (item.archiveMetaData && item.archiveMetaData.name)
      || (item.archiveMetadata && item.archiveMetadata.name));
  }
  function findOurArchive(cloud) {
    return archiveList(cloud).then(function (list) {
      var matches = list.filter(function (item) { return archiveName(item) === CLOUD_NAME; });
      matches.sort(function (a, b) { return Number(b.updatedAt || b.modifyTime || b.createdAt || 0) - Number(a.updatedAt || a.modifyTime || a.createdAt || 0); });
      return matches[0] || null;
    });
  }
  function uploadCloud() {
    var objects, bundle, filePath;
    try { objects = cloudObjects(); bundle = currentBundle(); filePath = objects.base + '/' + CLOUD_FILE; }
    catch (e) { setStatus(e.message || String(e), true); return; }
    var now = Date.now(), ls = localStore(), savedAt = 0;
    try { savedAt = Number(ls && ls.getItem(CLOUD_COOLDOWN_KEY)) || 0; } catch (e) {}
    savedAt = Math.max(savedAt, lastUploadAt);
    if (now - savedAt < 60000) {
      setStatus('TapTap 限制每分钟最多上传一次，请约 ' + Math.ceil((60000 - (now - savedAt)) / 1000) + ' 秒后重试。', true); return;
    }
    setBusy(true); setStatus('正在写入 TapTap 本地文件并检查云端存档…');
    callApi(objects.fs, 'writeFile', { filePath: filePath, data: JSON.stringify(bundle), encoding: 'utf8' })
      .then(function () { return findOurArchive(objects.cloud); })
      .then(function (archive) {
        var current = Date.now(); lastUploadAt = current;
        try { if (ls) ls.setItem(CLOUD_COOLDOWN_KEY, String(current)); } catch (e) {}
        var metadata = { name: CLOUD_NAME, summary: 'Shellbreak save · ' + dateLabel(current),
          extra: JSON.stringify({ format: FORMAT, version: FORMAT_VERSION }),
          playtime: Math.max(0, Math.floor((SB.game.run() && SB.game.run().t) || 0)) };
        var options = { archiveMetaData: metadata, archiveFilePath: filePath };
        if (archive && archive.uuid) options.archiveUUID = archive.uuid;
        return callApi(objects.cloud, archive ? 'updateArchive' : 'createArchive', options);
      })
      .then(function () { setStatus('TapTap 云存档上传成功。'); })
      .catch(function (e) { setStatus('云存档上传失败：' + errorText(e), true); })
      .then(function () { setBusy(false); });
  }
  function downloadCloud() {
    var objects;
    try { objects = cloudObjects(); } catch (e) { setStatus(e.message || String(e), true); return; }
    setBusy(true); setStatus('正在查找 TapTap 云存档…');
    findOurArchive(objects.cloud).then(function (archive) {
      if (!archive) throw new Error('云端没有找到天壳存档；先在 TapTap 小游戏里上传一次即可创建。');
      if (!archive.uuid || !archive.fileId) throw new Error('云存档列表缺少 uuid 或 fileId，无法下载。');
      pendingCloudArchive = { archive: archive, objects: objects };
      setBusy(false);
      var box = document.getElementById('modalBox');
      box.innerHTML = '<h3>下载并覆盖本地？</h3>' +
        '<div class="save-manager-warning">将从 TapTap 云端下载存档并覆盖这台设备的本地进度。导入前会先备份当前本地存档。此云存档属于当前 TapTap 账号。</div>' +
        '<div class="foot" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" id="cloudDownloadCancel">取消</button><button type="button" class="btn buy" id="cloudDownloadConfirm">备份并恢复</button></div>';
      document.getElementById('cloudDownloadCancel').onclick = function () { pendingCloudArchive = null; openPanel(); };
      document.getElementById('cloudDownloadConfirm').onclick = restoreCloud;
    }).catch(function (e) {
      setBusy(false); setStatus('云存档读取失败：' + errorText(e), true);
    });
  }
  function restoreCloud() {
    if (!pendingCloudArchive) return;
    var pending = pendingCloudArchive; pendingCloudArchive = null;
    var tempPath = pending.objects.base + '/shellbreak-cloud-download.json';
    setBusy(true);
    callApi(pending.objects.cloud, 'getArchiveData', {
      archiveUUID: pending.archive.uuid, archiveFileId: pending.archive.fileId, targetFilePath: tempPath
    }).then(function (result) {
      return callApi(pending.objects.fs, 'readFile', { filePath: result.filePath || tempPath, encoding: 'utf8' });
    }).then(function (fileResult) {
      var text = typeof fileResult.data === 'string' ? fileResult.data : textFromBytes(new Uint8Array(fileResult.data));
      var bundle = validateBundle(JSON.parse(text));
      setBusy(false); confirmImport(bundle, 'TapTap 云存档');
    }).catch(function (e) {
      setBusy(false); setStatus('云存档恢复失败：' + errorText(e), true);
    });
  }
  function showLoadProblem(problems) {
    openPanel();
    var list = [];
    if (problems && problems.meta) list.push('跨周目存档读取失败：' + (problems.meta.message || '格式无效'));
    if (problems && problems.run) list.push('本周目存档读取失败：' + (problems.run.message || '格式无效'));
    var node = document.getElementById('saveManagerStatus');
    if (node) {
      node.textContent = '为保护进度，游戏已暂停且没有创建新档。原始存档已尽力备份到本机；请先导出文件或存档码，再尝试导入备份。' +
        (list.length ? ' 详情：' + list.join('；') : '');
      node.classList.add('error');
    }
  }
  function boot() {
    var button = document.getElementById('btnSaveManager');
    if (button) button.onclick = openPanel;
  }

  SB.saveTransfer = { boot: boot, open: openPanel, showLoadProblem: showLoadProblem,
    currentBundle: currentBundle, validateBundle: validateBundle };
})(typeof window !== 'undefined' ? window : globalThis);
