/* Xiaohongshu MiniTool storage bridge.
 * The game expects synchronous localStorage semantics. This facade keeps values
 * in memory during a session and mirrors them to the documented async Storage API.
 * Legacy browser storage is read once at startup, migrated, then never touched. */
(function (root) {
  'use strict';
  var platform = root.shellbreakPlatform;
  if (!platform || platform.runtime !== 'xiaohongshu') return;

  var STORAGE_MIN_CLIENT_VERSION = 9460;
  var MAX_KEY_BYTES = 1024 * 1024;
  var values = Object.create(null);
  var legacy = Object.create(null);
  var touched = Object.create(null);
  var remoteKeys = Object.create(null);
  var queues = Object.create(null);
  var listeners = [];
  var originalStorage = null;
  var mode = 'checking';
  var clientVersion = 0;
  var migrationCount = 0;
  var migrationFailed = 0;
  var writeCount = 0;
  var writeFailed = 0;
  var lastError = '';
  var nativeReady = false;
  var miniTool = null;

  function errorText(error) {
    return String((error && (error.errMsg || error.message)) || error || 'Storage API error');
  }
  function notify() {
    var snapshot = status();
    listeners.slice().forEach(function (listener) {
      try { listener(snapshot); } catch (e) {}
    });
  }
  function byteLength(text) {
    try { return unescape(encodeURIComponent(text)).length; }
    catch (e) { return text.length * 3; }
  }
  function apiCall(name, options) {
    if (!miniTool || typeof miniTool[name] !== 'function')
      return Promise.reject(new Error(name + ' unavailable'));
    try {
      return Promise.resolve(miniTool[name](options || {})).then(function (result) {
        if (!result || (result.errMsg && result.errMsg !== name + ':ok'))
          throw new Error(result && result.errMsg ? result.errMsg : name + ' returned no result');
        return result;
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  function snapshotBrowserStorage() {
    try {
      originalStorage = root.localStorage;
      if (!originalStorage) return;
      for (var i = 0; i < originalStorage.length; i++) {
        var key = originalStorage.key(i);
        if (key === null || key === undefined) continue;
        var value = originalStorage.getItem(key);
        if (value !== null) {
          legacy[String(key)] = String(value);
          values[String(key)] = String(value);
        }
      }
    } catch (error) {
      lastError = 'legacy_read_failed:' + errorText(error);
    }
  }
  function recordChange(key, item) {
    touched[key] = item;
    if (mode === 'native' && nativeReady) queueChange(key, item);
  }
  function listKeys() {
    return Object.keys(values);
  }
  var facade = {
    get length() { return listKeys().length; },
    key: function (index) {
      var keys = listKeys();
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    getItem: function (key) {
      key = String(key);
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem: function (key, value) {
      key = String(key);
      value = String(value);
      values[key] = value;
      recordChange(key, { remove: false, value: value });
    },
    removeItem: function (key) {
      key = String(key);
      delete values[key];
      recordChange(key, { remove: true });
    },
    clear: function () {
      listKeys().forEach(function (key) { facade.removeItem(key); });
    }
  };
  snapshotBrowserStorage();
  try {
    Object.defineProperty(root, 'localStorage', {
      configurable: true,
      enumerable: true,
      get: function () { return facade; }
    });
  } catch (error) {
    try { root.localStorage = facade; } catch (e) {}
  }
  var facadeInstalled = false;
  try { facadeInstalled = root.localStorage === facade; } catch (e) {}
  if (!facadeInstalled) lastError = 'cannot_install_memory_storage_facade';
  originalStorage = null;

  function readBuildVersion(options) {
    var env = options && options.miniToolEnv;
    return Number(env && env.buildVersion) || 0;
  }
  function getBuildVersion() {
    var xhs = root.xhs;
    var sync = readBuildVersion(xhs && xhs.launchOptions);
    if (sync) return Promise.resolve(sync);
    var mt = xhs && xhs.miniTool;
    if (!mt || typeof mt.getLaunchOptions !== 'function') return Promise.resolve(0);
    try {
      return Promise.resolve(mt.getLaunchOptions()).then(readBuildVersion, function () { return 0; });
    } catch (error) { return Promise.resolve(0); }
  }
  function setUnavailable(reason, error) {
    mode = 'unavailable';
    nativeReady = false;
    if (error) lastError = errorText(error);
    else if (reason) lastError = reason;
    notify();
    return status();
  }
  function decodeStorageValue(data) {
    if (data === null || data === undefined) return null;
    if (typeof data !== 'string') return String(data);
    try {
      var value = JSON.parse(data);
      return value === null || value === undefined ? null : String(value);
    } catch (error) {
      /* Accept an older raw-string value during one-time migration recovery. */
      return data;
    }
  }
  function readNativeValue(key) {
    return apiCall('getStorage', { key: key }).then(function (result) {
      return decodeStorageValue(result.data);
    });
  }
  function writeNativeValue(key, value) {
    var json;
    try { json = JSON.stringify(String(value)); }
    catch (error) { return Promise.resolve(false); }
    if (byteLength(json) > MAX_KEY_BYTES) {
      lastError = 'storage_key_over_1mb:' + key;
      return Promise.resolve(false);
    }
    return apiCall('setStorage', { key: key, data: json }).then(function () {
      remoteKeys[key] = true;
      writeCount++;
      notify();
      return true;
    }, function (error) {
      writeFailed++;
      lastError = errorText(error);
      notify();
      return false;
    });
  }
  function removeNativeValue(key) {
    if (!remoteKeys[key]) return Promise.resolve(true);
    return apiCall('removeStorage', { key: key }).then(function () {
      delete remoteKeys[key];
      writeCount++;
      notify();
      return true;
    }, function (error) {
      writeFailed++;
      lastError = errorText(error);
      notify();
      return false;
    });
  }
  function runQueue(key) {
    var queue = queues[key];
    if (!queue || queue.busy) return;
    if (!queue.jobs.length) {
      queue.drainWaiters.splice(0).forEach(function (resolve) { resolve(queue.allOk); });
      return;
    }
    queue.busy = true;
    var job = queue.jobs[0];
    var operation = job.item.remove
      ? removeNativeValue(key)
      : writeNativeValue(key, job.item.value);
    operation.then(function (ok) {
      if (!ok) queue.allOk = false;
      job.waiters.forEach(function (resolve) { resolve(!!ok); });
    }, function (error) {
      queue.allOk = false;
      writeFailed++;
      lastError = errorText(error);
      job.waiters.forEach(function (resolve) { resolve(false); });
    }).then(function () {
      queue.jobs.shift();
      queue.busy = false;
      if (queue.jobs.length) runQueue(key);
      else {
        queue.drainWaiters.splice(0).forEach(function (resolve) { resolve(queue.allOk); });
        queue.allOk = true;
      }
    });
  }
  function queueChange(key, item) {
    var queue = queues[key] || (queues[key] = { busy: false, jobs: [], drainWaiters: [], allOk: true });
    return new Promise(function (resolve) {
      var last = queue.jobs[queue.jobs.length - 1];
      if (last && !queue.busy && last.item.remove === item.remove) {
        last.item = item;
        last.waiters.push(resolve);
      } else {
        queue.jobs.push({ item: item, waiters: [resolve] });
      }
      runQueue(key);
    });
  }
  function waitQueue(key) {
    var queue = queues[key];
    if (!queue || (!queue.busy && !queue.jobs.length)) return Promise.resolve(true);
    return new Promise(function (resolve) {
      queue.drainWaiters.push(resolve);
    });
  }
  function applyRemoteValues(info) {
    if (!info || !Array.isArray(info.keys)) throw new Error('getStorageInfo returned invalid keys');
    info.keys.forEach(function (key) { remoteKeys[String(key)] = true; });
    return Promise.all(info.keys.map(function (rawKey) {
      var key = String(rawKey);
      return readNativeValue(key).then(function (value) {
        if (!Object.prototype.hasOwnProperty.call(touched, key)) {
          if (value === null) delete values[key];
          else values[key] = value;
        }
        return { key: key, ok: true };
      }, function (error) {
        migrationFailed++;
        lastError = errorText(error);
        return { key: key, ok: false };
      });
    }));
  }
  function migrateLegacy(info) {
    var keys = Object.keys(legacy);
    var usedBytes = Math.max(0, Number(info && info.usedBytes) || 0);
    var limitBytes = Math.max(0, Number(info && info.limitBytes) || 0);
    keys.sort(function (a, b) {
      var order = { 'shellbreak.meta.v2': 0, 'shellbreak.run.v2': 1 };
      return (order[a] === undefined ? 2 : order[a]) - (order[b] === undefined ? 2 : order[b]);
    });
    return keys.reduce(function (chain, key) {
      return chain.then(function () {
        if (remoteKeys[key] || Object.prototype.hasOwnProperty.call(touched, key)) return;
        var data;
        try { data = JSON.stringify(legacy[key]); }
        catch (error) { migrationFailed++; lastError = errorText(error); return; }
        var bytes = byteLength(data);
        if (bytes > MAX_KEY_BYTES || (limitBytes && usedBytes + bytes > limitBytes)) {
          migrationFailed++;
          lastError = 'legacy_migration_exceeds_storage_quota:' + key;
          return;
        }
        return apiCall('setStorage', { key: key, data: data }).then(function () {
          remoteKeys[key] = true;
          usedBytes += bytes;
          migrationCount++;
        }, function (error) {
          migrationFailed++;
          lastError = errorText(error);
        });
      });
    }, Promise.resolve());
  }
  function flushTouched() {
    var keys = Object.keys(touched);
    var allOk = true;
    return keys.reduce(function (chain, key) {
      return chain.then(function () {
        var item = touched[key];
        return (item.remove ? removeNativeValue(key) : writeNativeValue(key, item.value)).then(function (ok) {
          if (!ok) allOk = false;
        });
      });
    }, Promise.resolve()).then(function () {
      touched = Object.create(null);
      return allOk;
    });
  }
  function initialize() {
    if (!facadeInstalled) return Promise.resolve(setUnavailable('memory_facade_unavailable'));
    var xhs = root.xhs;
    miniTool = xhs && xhs.miniTool;
    return getBuildVersion().then(function (buildVersion) {
      clientVersion = Math.floor((Number(buildVersion) || 0) / 1000);
      if (clientVersion < STORAGE_MIN_CLIENT_VERSION) {
        return setUnavailable(clientVersion ? 'client_version_below_9.46.0' : 'client_version_unknown');
      }
      if (!miniTool || typeof miniTool.getStorageInfo !== 'function'
          || typeof miniTool.getStorage !== 'function'
          || typeof miniTool.setStorage !== 'function'
          || typeof miniTool.removeStorage !== 'function') {
        return setUnavailable('storage_api_unavailable');
      }
      return apiCall('getStorageInfo').then(function (info) {
        return applyRemoteValues(info).then(function (readResults) {
          var readFailed = readResults.some(function (item) { return !item.ok; });
          if (readFailed) return setUnavailable('storage_read_incomplete', new Error(lastError));
          return migrateLegacy(info).then(function () {
            mode = 'native';
            nativeReady = true;
            return flushTouched().then(function (flushed) {
              if (!flushed) return setUnavailable('initial_storage_write_failed', new Error(lastError || 'Storage write failed'));
              notify();
              return status();
            });
          });
        });
      }, function (error) {
        return setUnavailable('storage_info_failed', error);
      });
    }, function (error) {
      return setUnavailable('launch_options_failed', error);
    }).then(function (result) {
      legacy = Object.create(null);
      return result || status();
    }, function (error) {
      legacy = Object.create(null);
      return setUnavailable('storage_initialization_failed', error);
    });
  }
  function status() {
    return {
      mode: mode,
      available: mode === 'native' && nativeReady,
      clientVersion: clientVersion,
      migratedKeys: migrationCount,
      migrationFailures: migrationFailed,
      writes: writeCount,
      writeFailures: writeFailed,
      lastError: lastError
    };
  }
  function flushAndVerify(keys) {
    return ready.then(function () {
      if (mode !== 'native' || !nativeReady)
        return { ok: false, unavailable: true, error: lastError || mode };
      var unique = [], seen = Object.create(null), expected = Object.create(null);
      (keys || []).forEach(function (rawKey) {
        var key = String(rawKey);
        if (seen[key]) return;
        seen[key] = true;
        unique.push(key);
        expected[key] = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      });
      return Promise.all(unique.map(waitQueue)).then(function (queueResults) {
        if (queueResults.some(function (ok) { return !ok; }))
          return { ok: false, error: lastError || 'storage_write_failed' };
        var nativeKeys = unique.some(function (key) { return expected[key] === null; })
          ? apiCall('getStorageInfo').then(function (info) {
            if (!Array.isArray(info.keys)) throw new Error('getStorageInfo returned invalid keys');
            return info.keys.map(String);
          })
          : null;
        return Promise.all(unique.map(function (key) {
          var check = expected[key] === null
            ? nativeKeys.then(function (keys) { return keys.indexOf(key) < 0; })
            : readNativeValue(key).then(function (value) { return value === expected[key]; });
          return check.catch(function (error) {
            lastError = errorText(error);
            return false;
          });
        })).then(function (checks) {
          var ok = checks.every(Boolean);
          if (!ok) {
            writeFailed++;
            if (!lastError) lastError = 'storage_readback_mismatch';
            notify();
          }
          return { ok: ok, error: ok ? '' : lastError };
        });
      });
    });
  }

  function replaceSavePair(metaRaw, runRaw) {
    if (mode !== 'native' || !nativeReady) {
      return Promise.resolve({ ok: false, unavailable: true, error: lastError || mode });
    }
    var cfg = root.SB.CFG;
    var keys = [cfg.SAVE_KEY, cfg.RUN_KEY];
    var backupKeys = [cfg.SAVE_BACKUP_KEY, cfg.RUN_BACKUP_KEY];
    var previous = keys.map(function (key) { return facade.getItem(key); });
    var backups = [];
    previous.forEach(function (value, i) {
      if (value === null) return;
      facade.setItem(backupKeys[i], value);
      backups.push(backupKeys[i]);
    });
    function writePair(pair) {
      keys.forEach(function (key, i) {
        if (pair[i] === null) facade.removeItem(key);
        else facade.setItem(key, pair[i]);
      });
    }
    function verify(expectedKeys) {
      return flushAndVerify(expectedKeys).catch(function (error) {
        return { ok: false, error: errorText(error) };
      });
    }
    // 两个备份都读回一致后才覆盖主档。主档失败时恢复原值并等待回读。
    return verify(backups).then(function (backup) {
      if (!backup.ok) return { ok: false, backupFailed: true, error: backup.error };
      writePair([metaRaw, runRaw]);
      return verify(keys).then(function (updated) {
        if (updated.ok) return updated;
        writePair(previous);
        return verify(keys).then(function (rollback) {
          return { ok: false, error: rollback.ok ? updated.error : rollback.error || updated.error };
        });
      });
    });
  }

  var ready = initialize();
  root.shellbreakXhsStorage = {
    ready: ready,
    isAvailable: function () { return mode === 'native' && nativeReady; },
    status: status,
    onStatus: function (listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.push(listener);
      try { listener(status()); } catch (e) {}
      return function () {
        listeners = listeners.filter(function (item) { return item !== listener; });
      };
    },
    flushAndVerify: flushAndVerify,
    replaceSavePair: replaceSavePair,
    flush: function (keys) {
      return ready.then(function () {
        if (mode !== 'native' || !nativeReady) return false;
        return Promise.all((keys || []).map(function (key) { return waitQueue(String(key)); }))
          .then(function (results) { return results.every(Boolean); });
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
