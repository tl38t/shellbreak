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
      throw new Error('这不是受支持的游戏存档文件或存档码。');
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
  /* ── 诊断出口（2026-10-29）──────────────────────────────────────────
   * 【为什么要有它】玩家报「存档没了」时，我们过去只能靠猜：日志里只有 [rank]，
   *   重启一次连内存计数都没了。这里把「能力探针 / 启动出口 / 写盘计数 / 读回结果 /
   *   丢档次数」拼成一段纯文本，玩家一键复制贴给我们，一条反馈就能定性。
   * ⚠️ 只含布尔位、计数、版本号与错误串，**不含任何存档内容**。 */
  function diagLine() {
    if (!(SB.store && SB.store.diagBrief)) return '';
    try { return '存档诊断：' + SB.store.diagBrief(); } catch (e) { return ''; }
  }
  function diagnosticsText() {
    var parts = [];
    try { if (SB.store && SB.store.diagText) parts.push(SB.store.diagText()); } catch (e) {}
    try {
      var st = SB.state.saveStatus();
      parts.push('面板 上次保存=' + agoText(st.lastOkAt) + '　拒写=' + (st.skipCount || 0)
        + ' 失败=' + (st.failCount || 0) + ' 补位=' + (st.patchCount || 0)
        + '　连续坏=' + (st.skipAfterOk || 0) + '/' + (st.failAfterOk || 0)
        + (st.lastSkipKey ? '　坏键=' + st.lastSkipKey : '')
        + (st.lastError ? '　错误=' + st.lastError : ''));
    } catch (e) {}
    try {
      var objects = null;
      objects = { cloud: cloudAvailable(), local: rawLocal(CFG.RUN_KEY) ? rawLocal(CFG.RUN_KEY).length : 0 };
      parts.push('云端 ' + (objects.cloud ? '可用' : '不可用') + '　本机存档字节=' + objects.local);
    } catch (e) {}
    try {
      var em = SB.store && SB.store.emergencyLoad ? SB.store.emergencyLoad() : null;
      parts.push('旧档副本 ' + (em ? ('有（' + dateLabel(em.at) + '）') : '无'));
    } catch (e) {}
    parts.push('UA ' + (root.navigator && root.navigator.userAgent
      ? String(root.navigator.userAgent).slice(0, 140) : '—'));
    return parts.join('\n');
  }
  function copyDiag() {
    var text = diagnosticsText();
    var box = document.getElementById('saveDiagBox');
    if (box) {
      box.value = text;
      box.focus();
      try { box.select(); } catch (e) {}
      /* ⚠️ select() 会把 textarea 滚到**末尾**，首行（版本 / 能力）就被切掉半行，
       * 看着像内容坏了。选完再把视口拨回顶部，选中的内容不受影响。 */
      try { box.scrollTop = 0; } catch (e) {}
    }
    var nav = root.navigator;
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      nav.clipboard.writeText(text).then(function () {
        setStatus('诊断信息已复制到剪贴板，直接粘贴发给开发者即可。');
      }, function () {
        setStatus('浏览器未授权剪贴板：上面文本框里已生成诊断信息，请手动复制。');
      });
    } else {
      setStatus('上面文本框里已生成诊断信息，请手动复制。');
    }
  }
  /* 尸检副本导出：只在「上次启动读不到存档」时才存在。
   * ⚠️ 只导出、**永不自动恢复** —— 自动恢复等于让清掉的档自己爬回来。 */
  function emergencyHTML() {
    var em = null;
    try { em = SB.store && SB.store.emergencyLoad ? SB.store.emergencyLoad() : null; } catch (e) {}
    if (!em) return '';
    var kb = Math.max(1, Math.round(((em.run || '').length + (em.meta || '').length) / 1024));
    return '<div class="save-manager-warning">发现一份<b>旧档副本</b>（' + escapeHtml(dateLabel(em.at)) +
      '，约 ' + kb + ' KB）。它是在上次启动读不到存档时自动留下的，只供导出救援，不会自动恢复。</div>' +
      '<div class="save-manager-actions">' +
      '<button type="button" class="btn" data-save-action="export-emergency">导出旧档副本</button>' +
      '</div>';
  }
  function exportEmergency() {
    var em = null;
    try { em = SB.store && SB.store.emergencyLoad ? SB.store.emergencyLoad() : null; } catch (e) {}
    if (!em) { setStatus('没有可导出的旧档副本。', true); return; }
    try {
      var raw = { meta: em.meta === undefined ? null : em.meta, run: em.run === undefined ? null : em.run,
        metaBackup: null, runBackup: null };
      var bundle = { format: FORMAT, version: FORMAT_VERSION, createdAt: Date.now(),
        recovery: true, raw: raw, checksum: crc32(JSON.stringify(raw)) };
      downloadFile('shellbreak-emergency-' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify(bundle, null, 2));
      setStatus('旧档副本已导出。把它发给开发者，或从「从文件导入」直接恢复。');
    } catch (e) { setStatus('导出旧档副本失败：' + (e.message || e), true); }
  }

  function openPanel() {
    var box = document.getElementById('modalBox'), modal = document.getElementById('modal');
    if (!box || !modal) return;
    var cloudOK = cloudAvailable();
    box.innerHTML =
      '<div class="modal-hd"><b>存档管理</b><button type="button" class="modal-x" id="saveManagerClose" aria-label="关闭">×</button></div>' +
      '<div id="saveManagerPanel">' +
        '<p class="save-manager-intro">存档文件和存档码都包含当前周目与跨周目进度。导入会先备份本机现有存档，并在确认后重载游戏。</p>' +
        /* 本地 / 云端对比（2026-10-28）：玩家自己决定谁覆盖谁，不弹窗、不打扰。 */
        cloudCompareHTML() +
        /* 旧档副本（2026-10-29）：只在「上次启动读不到存档」时才出现，没有就返回空串。 */
        emergencyHTML() +
        '<div class="save-manager-actions">' +
          '<button type="button" class="btn buy" data-save-action="export-file">导出存档文件</button>' +
          '<button type="button" class="btn" data-save-action="export-code">生成并复制存档码</button>' +
          '<button type="button" class="btn" data-save-action="import-file">从文件导入</button>' +
          '<button type="button" class="btn" data-save-action="import-code">从存档码导入</button>' +
          '<button type="button" class="btn" data-save-action="cloud-upload"' + (cloudOK ? '' : ' disabled') + '>上传到 TapTap 云存档</button>' +
          '<button type="button" class="btn" data-save-action="cloud-download"' + (cloudOK ? '' : ' disabled') + '>从 TapTap 云存档恢复</button>' +
          '<button type="button" class="btn" data-save-action="copy-diag">复制诊断信息</button>' +
        '</div>' +
        '<label class="save-manager-label" for="saveCodeBox">存档码</label>' +
        '<textarea id="saveCodeBox" rows="4" spellcheck="false" placeholder="生成的存档码会显示在这里；也可以粘贴已有存档码"></textarea>' +
        /* 诊断文本框常驻但为空：点「复制诊断信息」才写入。剪贴板被拒时这里是唯一的手动出口。 */
        '<label class="save-manager-label" for="saveDiagBox">诊断信息</label>' +
        '<textarea id="saveDiagBox" rows="5" spellcheck="false" readonly placeholder="点上面的「复制诊断信息」生成；存档出问题时把这段贴给开发者。"></textarea>' +
        '<input type="file" id="saveFileInput" accept=".json,application/json" hidden>' +
        '<p id="saveManagerStatus" class="save-manager-status" role="status">' +
          (cloudOK ? 'TapTap 云存档已就绪。' : '云存档只在 TapTap 小游戏运行环境可用；当前浏览器仍可导出/导入文件和存档码。') +
        '</p>' +
        /* 存档健康度（2026-10-27）：常显「上次保存 / 云端备份」，写盘被拦或失败就标红。
         * 原先这些失败全被吞掉，玩家唯一的感受就是「存档没了」。 */
        '<p id="saveManagerHealth" class="save-manager-status save-manager-health' +
          (saveHealthBad() ? ' error' : '') + '">' +
          escapeHtml(saveHealthText()) + '</p>' +
        /* 诊断一行（2026-10-29）：能力位 + 启动出口，一眼能看出「有没有备份被读到」。 */
        '<p id="saveManagerDiag" class="save-manager-status save-manager-diag">' +
          escapeHtml(diagLine()) + '</p>' +
      '</div>';
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.getElementById('saveManagerClose').onclick = function () { closePanel(); };
    document.getElementById('saveFileInput').onchange = onFileSelected;
    box.querySelectorAll('[data-save-action]').forEach(function (button) {
      button.onclick = function () { onAction(button.getAttribute('data-save-action')); };
    });
    bindCloudCompare();
    fillCloudCompare();      /* 异步取云端摘要；失败只把那一行降级，不影响面板其它功能 */
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
    if (action === 'copy-diag') return copyDiag();
    if (action === 'export-emergency') return exportEmergency();
  }
  function exportFile() {
    try {
      var bundle = exportBundle();
      /* 2026-10-29：导出的存档文件顺带带上诊断信息 —— 玩家发文件给我们时，
       * 不用再教他单独去点「复制诊断信息」，一条文件就是完整证据。 */
      try { bundle.diagnostics = diagnosticsText(); } catch (e) {}
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
      /* ⚠️ 2026-10-28 对照官方 API 文档修正字段名（CloudSaveManager.getArchiveList →
       *   ArchiveDetailData）：官方是 `modifiedTime` / `createdTime`（**秒级**）。
       *   这里原来写的是 updatedAt / modifyTime / createdAt —— 三个都不在官方字段表里，
       *   于是 Number(undefined||undefined||0) 恒为 0 ⇒ 排序恒等、完全失效。
       *   单槽时看不出来；P1 做 5 槽轮转时会把「最旧的」当成「最新的」下载下来。
       *   旧名保留做前向兼容（万一某个基础库版本真是那样拼的）。 */
      matches.sort(function (a, b) {
        var ta = Number(a.modifiedTime || a.updatedAt || 0) || Number(a.createdTime || a.createdAt || 0);
        var tb = Number(b.modifiedTime || b.updatedAt || 0) || Number(b.createdTime || b.createdAt || 0);
        return tb - ta;
      });
      return matches[0] || null;
    });
  }
  /* 云存档推送核心（2026-10-27）：手动上传与自动备份**共用这一份**。
   * 只有 `silent` 决定要不要动面板状态 —— 自动备份失败绝不能弹提示打扰玩家。
   * ⚠️ 冷却 key 是共享的（平台按账号限流，不是按按钮），所以自动备份成功后
   *    玩家紧接着手动点「上传」会被挡 60 秒，那是**正确**的（TapTap 确实拒）。 */
  function pushCloud(silent) {
    var objects, bundle, filePath;
    try {
      objects = cloudObjects(); bundle = currentBundle(); filePath = objects.base + '/' + CLOUD_FILE;
    } catch (e) {
      if (!silent) setStatus(e.message || String(e), true);
      return Promise.reject(e);
    }
    var now = Date.now(), ls = localStore(), savedAt = 0;
    try { savedAt = Number(ls && ls.getItem(CLOUD_COOLDOWN_KEY)) || 0; } catch (e) {}
    savedAt = Math.max(savedAt, lastUploadAt);
    /* ⚠️ 2026-10-28 冷却从 60s 放宽到 70s：官方 createArchive 文档写明
     *   「createArchive 和 updateArchive 限制一分钟一次」，60 秒正好卡在边界上 ——
     *   玩家在第 60.0 秒点第二次时，平台很可能仍判超频（400001）。
     *   10 秒余量不影响体感，但能消掉这条边界失败。 */
    if (now - savedAt < 70000) {
      var wait = 'TapTap 限制每分钟最多上传一次，请约 ' + Math.ceil((70000 - (now - savedAt)) / 1000) + ' 秒后重试。';
      if (!silent) setStatus(wait, true);
      return Promise.reject(new Error(wait));
    }
    if (!silent) { setBusy(true); setStatus('正在写入 TapTap 本地文件并检查云端存档…'); }
    return callApi(objects.fs, 'writeFile', { filePath: filePath, data: JSON.stringify(bundle), encoding: 'utf8' })
      .then(function () { return findOurArchive(objects.cloud); })
      .then(function (archive) {
        /* ── 防倒退守卫（2026-10-28 从严）──────────────────────────
         * 【它防的事故】手机 A 玩到 5 小时（云端 5h）→ 换手机 B（本地还存着 3h 旧档）
         *   → 启动只读本地、不查云 → 30 秒后自动上传 3h → **云端 5h 被 3h 覆盖**
         *   → 回手机 A 也变 3h，那份真档永久没了。
         * 【原判据为什么不够】旧版是「云端 ≥ 600s 且 本地×3 ≤ 云端」，只能挡 10 倍量级；
         *   3h vs 5h 这种**同量级倒退**实测直接放行（`tmp/_cdp_cloudoverwrite.mjs`：UPLOADED）。
         * 【现判据】一律不许倒退：云端比本地多 60 秒以上就跳过。
         *   留 60 秒容忍是因为刚恢复云端档时两边会差几个 tick。
         * ⚠️ 只拦自动备份（silent）。手动上传是玩家明确意图（他可能真想用这份覆盖云端），放行。 */
        if (silent && archive) {
          var _run = SB.game && SB.game.run ? SB.game.run() : null;
          var _curPlay = Math.max(0, Math.floor((_run && _run.t) || 0));
          var _cloudPlay = Number(archive.playtime
            || (archive.archiveMetaData && archive.archiveMetaData.playtime)
            || (archive.archiveMetadata && archive.archiveMetadata.playtime) || 0) || 0;
          if (_cloudPlay > _curPlay + 60) {
            throw new Error('云端进度（' + playtimeText(_cloudPlay) + '）领先本地（' + playtimeText(_curPlay)
              + '），已跳过自动上传以免用旧档覆盖新档');
          }
        }
        var current = Date.now(); lastUploadAt = current;
        try { if (ls) ls.setItem(CLOUD_COOLDOWN_KEY, String(current)); } catch (e) {}
        var _meta = (SB.game && SB.game.meta) ? SB.game.meta() : null;
        var metadata = { name: CLOUD_NAME, summary: 'Shellbreak save · ' + dateLabel(current),
          /* extra 官方限 1000 字节；带上周目是为了面板能显示「第 N 周目」——
           * 旧档没有 cycle，展示层会自然省略这一段。 */
          extra: JSON.stringify({ format: FORMAT, version: FORMAT_VERSION,
            cycle: (_meta && _meta.cycle) || 0,
            /* 2026-10-29：诊断摘要随云档走。本机三处（localStorage / tap.setStorage /
             * tapfile）是同生共死的，云端这条 metadata 是**唯一跨设备**还能带出来的证据：
             * 玩家换机或重装后，`getArchiveList` 仍能把这段读回来显示在面板上。
             * ⚠️ 官方 extra 上限 1000 字节，diagBrief 约 90 字符，留足余量。 */
            d: (SB.store && SB.store.diagBrief) ? String(SB.store.diagBrief()).slice(0, 240) : '' }),
          playtime: Math.max(0, Math.floor((SB.game.run() && SB.game.run().t) || 0)) };
        var options = { archiveMetaData: metadata, archiveFilePath: filePath };
        if (archive && archive.uuid) options.archiveUUID = archive.uuid;
        return callApi(objects.cloud, archive ? 'updateArchive' : 'createArchive', options);
      });
  }
  function uploadCloud() {
    pushCloud(false).then(function () {
      setBusy(false); setStatus('TapTap 云存档上传成功。');
    }, function (e) {
      setBusy(false); setStatus('云存档上传失败：' + errorText(e), true);
    });
  }

  /* 自动云备份（2026-10-27，玩家报「存档没了」的根治项）。
   * 原先云存档**纯手动**：玩家不点按钮，云端永远是空的 ⇒ 本地一丢就救不回来。
   * 这里每 30 秒检查一次，满足条件就静默推一份上去。
   * 触发条件（全部满足）：
   *   ① TapTap 小游戏环境（cloudAvailable）—— 浏览器/回归环境直接跳过；
   *   ② 距上次尝试 ≥ AUTO_GAP_MS（5 分钟；平台限流是每分钟 1 次，放宽到 5 分钟够安全）；
   *   ③ 游戏内时间往前进过整分钟（进度没变就不重复传，省调用也省玩家流量）。 */
  var AUTO_GAP_MS = 5 * 60 * 1000;
  var autoState = { lastTryAt: 0, lastOkAt: 0, lastError: '', failCount: 0, lastMark: -1 };
  function autoCloudPump() {
    if (busy) return;                        // 手动操作进行中，让路
    if (!cloudAvailable()) return;           // 非 TapTap 环境：静默跳过，不报错
    var s = null;
    try { s = SB.game && SB.game.run ? SB.game.run() : null; } catch (e) { return; }
    /* 破壳未结算时状态是过渡态，传上去价值低、还可能与结算后的档打架 —— 跳过。 */
    if (!s || s.broken) return;
    var now = Date.now();
    if (now - autoState.lastTryAt < AUTO_GAP_MS) return;
    var mark = Math.floor((s.t || 0) / 60);
    if (mark === autoState.lastMark && autoState.lastOkAt) return;
    autoState.lastTryAt = now;
    pushCloud(true).then(function () {
      autoState.lastOkAt = Date.now(); autoState.lastMark = mark;
      autoState.lastError = ''; autoState.failCount = 0;
    }, function (e) {
      autoState.lastError = errorText(e); autoState.failCount++;
    });
  }
  function autoCloudStatus() {
    return { lastOkAt: autoState.lastOkAt, lastError: autoState.lastError, failCount: autoState.failCount };
  }
  /* 游戏内时长 → 「3h20m」（2026-10-28）：本地与云端对比要用同一种写法，
   * 否则玩家得自己把「11980 秒」和「3 小时 19 分」对上号。 */
  function playtimeText(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    if (s < 60) return s + '秒';
    var m = Math.floor(s / 60);
    if (m < 60) return m + '分钟';
    var h = Math.floor(m / 60), rm = m % 60;
    /* 整点也补 00m：与云端的「1h30m」并排时不补会显得缺一位。 */
    return h + 'h' + String(rm).padStart(2, '0') + 'm';
  }
  function agoText(ms) {
    if (!ms) return '尚未';
    var d = Date.now() - Number(ms);
    if (!isFinite(d) || d < 0) d = 0;
    var sec = Math.floor(d / 1000);
    if (sec < 60) return sec + ' 秒前';
    if (sec < 3600) return Math.floor(sec / 60) + ' 分钟前';
    if (sec < 86400) return Math.floor(sec / 3600) + ' 小时前';
    return Math.floor(sec / 86400) + ' 天前';
  }
  /* 健康度是否处于「异常」态（写盘被拦或失败都比最后一次成功更晚）。
   * 面板据此加 .error 标红；不作任何自动修复 —— 只让玩家看得见。 */
  function saveHealthBad() {
    var st = (SB.state && SB.state.saveStatus) ? SB.state.saveStatus() : null;
    if (!st) return false;
    return (st.skipAfterOk || 0) > 0 || (st.failAfterOk || 0) > 0;
  }
  /* 存档健康度一行文案（面板底部常显）：
   * ok = 上次成功写盘时间；skip/fail 都意味着「浏览器里的进度比存档新」。 */
  function saveHealthText() {
    var st = (SB.state && SB.state.saveStatus) ? SB.state.saveStatus() : null;
    if (!st) return '';
    var parts = ['上次保存：' + agoText(st.lastOkAt)];
    var bad = false, why = '';
    /* ⚠️ 用「距上次成功之后的坏次数」判定，不用时间戳比较 —— 两者常落在同一毫秒。 */
    if ((st.failAfterOk || 0) > 0) {
      bad = true;
      why = '存档写入失败：' + (st.lastError || '未知原因') + '（连续 ' + st.failAfterOk + ' 次）';
    } else if ((st.skipAfterOk || 0) > 0) {
      bad = true;
      why = '存档写入被拦下（' + (st.lastSkipKey || '未知字段') + ' 数值异常），这局进度没有存上';
    }
    if (bad) parts.push('⚠ ' + why);
    /* 2026-10-29（P0-3）：补位是「部分成功」，不能和上面的整份拒写混为一谈，
     * 也不能标红 —— 玩家看到红色「存档失败」会以为全废了，实际只有那一个资源没涨。 */
    if ((st.patchCount || 0) > 0 && !bad) {
      parts.push('资源 ' + (st.lastPatchKey || '?') + ' 数值异常，已用上次记录值补位（其余进度正常保存）');
    }
    var au = autoCloudStatus();
    /* ⚠️ 2026-10-28：云端**备份时间**从这里移走了 —— 顶部新增的「本地 / 云端」对比块
     *   用的是云端真实 modifiedTime，而这里是本次会话的内存值（刚启动永远是「尚未」）。
     *   两处并存会互相打脸（顶部「12 分钟前备份」vs 底部「云端备份：尚未」）。
     *   这里只留「上次云备份失败」，那是内存态才有的信息，别处拿不到。 */
    if (cloudAvailable() && au.lastError) parts.push('⚠ 上次云备份失败：' + au.lastError);
    return parts.join(' · ');
  }
  /* ── 本地 / 云端对比（2026-10-28 用户「按 A 做」）──────────────────────
   * 【要解决的问题】本地有档时启动**完全不读云**，所以玩家根本不知道云端还有另一份。
   *   换设备后本地那份可能是旧的，云端才是新的（或反之），但界面上没有任何入口让他判断。
   * 【方案 A】不弹窗、不打扰：在存档管理面板顶部并排摆「本地 / 云端」的周目·时长·时间，
   *   不一致时多一行提示，下面两个按钮让玩家自己决定谁覆盖谁。
   * ⚠️ 全部只读。没有任何一条路径会因为「打开面板」而改写存档。 */
  function localDigest() {
    var s = null, m = null;
    try { s = SB.game && SB.game.run ? SB.game.run() : null; } catch (e) {}
    try { m = SB.game && SB.game.meta ? SB.game.meta() : null; } catch (e) {}
    var at = 0;
    try { at = Number(rawLocal(CFG.SAVE_AT_KEY)) || 0; } catch (e) {}
    return {
      playtime: Math.max(0, Math.floor((s && s.t) || 0)),
      cycle: (m && m.cycle) || 1,
      savedAt: at
    };
  }
  /* 云端存档摘要。任何失败都 resolve 成 {ok:false}，面板据此降级显示，绝不抛错。 */
  function cloudDigest() {
    return new Promise(function (resolve) {
      if (!cloudAvailable()) return resolve({ ok: false, reason: 'env' });
      var objects;
      try { objects = cloudObjects(); } catch (e) { return resolve({ ok: false, reason: 'env' }); }
      findOurArchive(objects.cloud).then(function (archive) {
        if (!archive) return resolve({ ok: false, reason: 'none' });
        var extra = {};
        try { extra = JSON.parse(archive.extra || '{}') || {}; } catch (e) {}
        resolve({
          ok: true,
          playtime: Number(archive.playtime) || 0,
          modifiedTime: Number(archive.modifiedTime) || 0,   /* 官方字段：秒级 */
          cycle: Number(extra.cycle) || 0,                   /* 旧档没有这一项，显示时省略 */
          /* 2026-10-29：上传时塞进 extra 的诊断摘要（见 pushCloud）。本机三处全空时
           * （重装 / 换机 / 被清缓存），这是**唯一**还能看到「上次是怎么丢的」的地方。 */
          diag: String(extra.d || ''),
          size: Number(archive.saveSize) || 0,
          uuid: archive.uuid || ''
        });
      }).catch(function (e) { resolve({ ok: false, reason: errorText(e) }); });
    });
  }
  function digestLine(d, tail) {
    var parts = [];
    if (d.cycle) parts.push('第 ' + d.cycle + ' 周目');
    parts.push(playtimeText(d.playtime));
    /* 本地是「保存」、云端是「备份」—— 两个动词不能混用，否则玩家会以为自己刚存过云端。 */
    if (d.at) parts.push(agoText(d.at) + (tail || '保存'));
    return parts.join(' · ');
  }
  function cloudCompareHTML() {
    var ok = cloudAvailable();
    return '<div class="cloud-compare" id="cloudCompare">' +
      '<div class="cc-row"><i class="cc-tag local">本地</i><span class="cc-body" id="ccLocal">—</span></div>' +
      '<div class="cc-row"><i class="cc-tag cloud">云端</i><span class="cc-body" id="ccCloud">' +
        (ok ? '读取中…' : '仅 TapTap 小游戏环境可用') + '</span></div>' +
      '<div class="cc-hint" id="ccHint"></div>' +
      '<div class="cc-actions">' +
        '<button type="button" class="btn" id="ccUseLocal"' + (ok ? '' : ' disabled') + '>用本地覆盖云端</button>' +
        '<button type="button" class="btn" id="ccUseCloud"' + (ok ? '' : ' disabled') + '>用云端覆盖本地</button>' +
      '</div></div>';
  }
  function fillCloudCompare() {
    var lc = document.getElementById('ccLocal');
    if (!lc) return;                       /* 面板已关闭 */
    var local = localDigest();
    lc.textContent = digestLine({ cycle: local.cycle, playtime: local.playtime, at: local.savedAt });
    var hint = document.getElementById('ccHint');
    var btnLocal = document.getElementById('ccUseLocal');
    var btnCloud = document.getElementById('ccUseCloud');
    cloudDigest().then(function (cloud) {
      var node = document.getElementById('ccCloud');
      if (!node) return;                   /* 异步回来时面板已被关掉 */
      if (!cloud.ok) {
        node.textContent = cloud.reason === 'none' ? '还没有云存档' : '读取失败';
        /* 云端没档时「用本地覆盖云端」仍然有意义 —— 那等于 createArchive 建第一份。
         * 只有「用云端覆盖本地」必须禁用（没东西可下）。 */
        if (btnCloud) btnCloud.disabled = true;
        if (hint) hint.textContent = cloud.reason === 'none'
          ? '上传一次即可创建云存档，之后每 5 分钟自动备份。' : '';
        return;
      }
      node.textContent = digestLine({
        cycle: cloud.cycle, playtime: cloud.playtime,
        at: cloud.modifiedTime ? cloud.modifiedTime * 1000 : 0
      }, '备份');
      if (btnLocal) btnLocal.disabled = false;
      if (btnCloud) btnCloud.disabled = false;
      if (!hint) return;
      var diff = cloud.playtime - local.playtime;
      /* 阈值 60 秒：小于这个数就是同一份档的正常 tick 漂移，提示「不一致」只会让人困惑。 */
      if (Math.abs(diff) <= 60) {
        hint.textContent = '两边进度基本一致。';
        hint.className = 'cc-hint';
      } else if (diff > 0) {
        hint.textContent = '云端比本地多 ' + playtimeText(diff) + '（本地这份更旧）';
        hint.className = 'cc-hint warn';
      } else {
        hint.textContent = '本地比云端多 ' + playtimeText(-diff) + '（云端那份更旧）';
        hint.className = 'cc-hint warn';
      }
      /* 本机没有本地进度（刚重装 / 换机 / 被清缓存）时，把云档带回的上一会话诊断亮出来：
       * 这是丢档现场唯一还能自证的线索，也是让玩家能一键复制发给我们。 */
      if (hint && cloud.diag && !local.savedAt && !local.playtime) {
        hint.textContent = '云端带回上次诊断：' + cloud.diag;
        hint.className = 'cc-hint warn';
      }
    });
  }
  function bindCloudCompare() {
    var useLocal = document.getElementById('ccUseLocal');
    var useCloud = document.getElementById('ccUseCloud');
    if (useLocal) useLocal.onclick = function () {
      /* 手动上传走 pushCloud(false)：会绕开「不许倒退」守卫（那是给自动备份的），
       * 但仍然受 70 秒平台频控约束 —— 被挡时把平台原话交给玩家看。 */
      setBusy(true); setStatus('正在用本地存档覆盖云端…');
      pushCloud(false).then(function () {
        setBusy(false); setStatus('云端已更新为本地进度。');
        fillCloudCompare();
      }, function (e) { setBusy(false); setStatus('覆盖失败：' + errorText(e), true); });
    };
    if (useCloud) useCloud.onclick = function () {
      if (busy) return;
      downloadCloud();                     /* 复用现有确认流程（会先备份本地再覆盖） */
    };
  }

  function downloadCloud() {
    var objects;
    try { objects = cloudObjects(); } catch (e) { setStatus(e.message || String(e), true); return; }
    setBusy(true); setStatus('正在查找 TapTap 云存档…');
    findOurArchive(objects.cloud).then(function (archive) {
      if (!archive) throw new Error('云端没有找到游戏存档；先在 TapTap 小游戏里上传一次即可创建。');
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
  /* ── 启动时的云端救援（2026-10-28）──────────────────────────────────
   * 【为什么必须有它】本机三层（localStorage / tap.setStorage / tapfile://usr）是**同生共死**的：
   *   清缓存、换设备、容器重建会让三处同时消失。云端那份自动备份（autoCloudPump 每 5 分钟）
   *   是唯一跨设备、跨重装还活着的档 —— 但此前启动流程**从不查它**：三处本机都空就直接
   *   判「新玩家」开新档。玩家看到的就是「退出之后存档没了」。
   * 【调用时机】只在 game.boot 判定「本机三处都没有」之后（真·最后一根稻草），
   *   正常读档路径永不触发，所以对老玩家零开销、零延迟。
   * 【为什么**不**再借 installImportedSave】2026-10-28 前的实现复用它，而它末尾是
   *   `location.reload()` —— 那是全应用唯一的自动重载点，也是「无限重载环」的唯一发动机
   *   （详见本函数 then 分支的注释）。现在它只把 bundle 交回 game.adoptBundle 就地接管。
   * ⚠️ 必须带 8 秒超时：云端不响应时不能让玩家卡在启动。game.boot 另有 8 秒兜底，
   *   两层超时保证 boot 一定往前走。
   * ⚠️ 60 秒内只试一次：万一写入后被容器拦住，也不会变成每次启动都拉云端。
   *   ⚠️⚠️ 这个节流键存在 localStorage，而 localStorage 在容器里可能不持久 ⇒ 环里它
   *     也失效。真正的保险是「不再 reload」：只拉一次、只接管到内存，不重载就不会成环。 */
  var CLOUD_TRY_KEY = 'shellbreak.cloud-recover-at.v1';
  function restoreFromCloudIfAny(cb) {
    var finished = false;
    function done(result) { if (finished) return; finished = true; cb(result); }
    if (!cloudAvailable()) return done(null);
    var ls = localStore(), now = Date.now();
    try {
      var at = Number(ls && ls.getItem(CLOUD_TRY_KEY)) || 0;
      if (now - at < 60000) return done(null);
      if (ls) ls.setItem(CLOUD_TRY_KEY, String(now));
    } catch (e) {}
    var objects;
    try { objects = cloudObjects(); } catch (e) { return done(null); }
    var timer = root.setTimeout(function () { done(null); }, 8000);
    var tempPath = objects.base + '/shellbreak-cloud-recover.json';
    findOurArchive(objects.cloud).then(function (archive) {
      if (!archive || !archive.uuid || !archive.fileId) throw new Error('云端没有存档');
      return callApi(objects.cloud, 'getArchiveData', {
        archiveUUID: archive.uuid, archiveFileId: archive.fileId, targetFilePath: tempPath
      });
    }).then(function (res) {
      return callApi(objects.fs, 'readFile', {
        filePath: (res && res.filePath) || tempPath, encoding: 'utf8'
      });
    }).then(function (fileResult) {
      var text = typeof fileResult.data === 'string'
        ? fileResult.data : textFromBytes(new Uint8Array(fileResult.data));
      var bundle = validateBundle(JSON.parse(text));
      root.clearTimeout(timer);
      /* ⚠️⚠️ 2026-10-28 P0：这里**绝不**再调 installImportedSave —— 它末尾是
       *   `location.reload()`，而那是全应用唯一的自动重载点。
       *   在「localStorage 写进去读不回来」的容器里（正是「退出就没存档」的根因），
       *   它会把启动变成「本机空 → 拉云端 → 写盘 → 重载 → 还是空 → 再拉云端 → …」的
       *   无限重载环；而 meta.seenVersion（更新日志已读）与救援节流键都存在同一个地方
       *   ⇒ 每圈都判「该版本首次进入」⇒ 每圈重弹更新日志、每次点击都被重载打断。
       *   现在只负责「把档交出去」，落盘与接管由 game.adoptBundle 就地完成（不重载）。 */
      done({ source: 'cloud', bundle: bundle });
    }).catch(function (e) {
      root.clearTimeout(timer);
      done(null);
    });
  }

  function boot() {
    var button = document.getElementById('btnSaveManager');
    if (button) button.onclick = openPanel;
    var settingsManager = document.getElementById('btnSettingsSaveManager');
    if (settingsManager) settingsManager.onclick = openPanel;
    /* 自动云备份（2026-10-27）：**只在 TapTap 小游戏环境装定时器**。
     * 普通浏览器与 e2e 沙箱一律不装 —— 装了 node 沙箱进程不肯退出，回归会挂住。 */
    if (cloudAvailable() && root.setInterval) root.setInterval(autoCloudPump, 30000);
    var settingsWipe = document.getElementById('btnSettingsWipe');
    if (settingsWipe) settingsWipe.onclick = function () {
      SB.ui.render.confirmPanel({
        title: '清空存档？',
        body: '<div class="warnbox">这会删掉<b>全部跨周目进度</b>：轮回点、破层层级、已购增益、科技记录，以及当前这局的一切。</div>' +
              '<div class="note">页面会回到第 1 周目的全新状态。此操作不可撤销。</div>',
        danger: true,
        requireCheck: '我明白这会抹掉全部轮回点与破层层级，且无法撤销',
        ok: '清空存档',
        onOk: function () { SB.game.wipeSave(); }
      });
    };
  }

  SB.saveTransfer = { boot: boot, open: openPanel, showLoadProblem: showLoadProblem,
    currentBundle: currentBundle, validateBundle: validateBundle,
    /* 2026-10-27 新增：自动云备份与存档健康度（供 UI 与回归直接读/驱动）。 */
    autoCloudPump: autoCloudPump, autoCloudStatus: autoCloudStatus,
    saveHealthText: saveHealthText, pushCloud: pushCloud,
    /* 2026-10-29 诊断出口（面板「复制诊断信息」/ 导出的存档文件里都会带上）。 */
    diagnosticsText: diagnosticsText, diagLine: diagLine,
    /* 2026-10-28：启动时云端救援（game.boot 的最后一根稻草）+ 环境探测（供 boot 判断）。 */
    restoreFromCloudIfAny: restoreFromCloudIfAny, cloudAvailable: cloudAvailable };
})(typeof window !== 'undefined' ? window : globalThis);
