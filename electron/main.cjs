'use strict';

const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'shellbreak';
const APP_HOST = 'game';
const AUTO_CLOUD_SAVE_DIR = 'Saves';
const AUTO_CLOUD_SAVE_FILE = 'shellbreak-save.sav';
const STEAM_DATA_DIR = 'SteamData';
const STEAM_LEADERBOARD_QUEUE_FILE = 'steam-leaderboard-queue.json';
const MAX_AUTO_CLOUD_SAVE_BYTES = 10 * 1024 * 1024;
const STEAM_ACHIEVEMENTS = new Set([
  'SHELLBREAK_COLD',
  'SHELLBREAK_SMALL',
  'SHELLBREAK_SCIENCE',
  'SHELLBREAK_ABYSS',
  'SHELLBREAK_FIRST_REBIRTH',
  'SHELLBREAK_SHELL_BREAK',
  'SHELLBREAK_DYSON_END',
  'SHELLBREAK_VOID_END',
  'SHELLBREAK_SPEEDRUN',
  'SHELLBREAK_DRIFT_TERRA',
  'SHELLBREAK_POLLUTION_CLEAR',
  'SHELLBREAK_STAR_COMPLETE',
  'SHELLBREAK_RELIGION',
  'SHELLBREAK_REBIRTH_10',
  'SHELLBREAK_RELIC_10',
  'SHELLBREAK_RELIC_25',
  'SHELLBREAK_TECH_ALL',
  'SHELLBREAK_CIVIC_ALL',
  'SHELLBREAK_HALF_DYSON',
  'SHELLBREAK_CHALLENGE_DYSON_RUSH',
  'SHELLBREAK_CHALLENGE_ANARCHY',
  'SHELLBREAK_CHALLENGE_GOOD_OLD_DAYS',
  'SHELLBREAK_CHALLENGE_THREE_LAUNCH_SITES',
  'SHELLBREAK_CHALLENGE_ETERNITY_MOMENT',
  'SHELLBREAK_CHALLENGE_VEIL_ETERNITY_MOMENT',
  'SHELLBREAK_CHALLENGE_VEIL_ONE_WAY',
  'SHELLBREAK_CHALLENGE_LAND_GOLD',
  'SHELLBREAK_CHALLENGE_PACIFIST',
  'SHELLBREAK_CHALLENGE_WEAPON_CRITIQUE',
  'SHELLBREAK_CHALLENGE_TOTALWAR_DOCTRINE',
  'SHELLBREAK_CHALLENGE_RAIDER',
  'SHELLBREAK_CHALLENGE_CONQUEROR',
  'SHELLBREAK_BLD_KELP',
  'SHELLBREAK_BLD_NEST',
  'SHELLBREAK_BLD_CORALHOUSE',
  'SHELLBREAK_BLD_SILTPIT',
  'SHELLBREAK_BLD_HALL',
  'SHELLBREAK_BLD_WEIR',
  'SHELLBREAK_BLD_WARMNEST',
  'SHELLBREAK_BLD_KELPSTORE',
  'SHELLBREAK_BLD_BALLAST',
  'SHELLBREAK_BLD_LIGHTHOUSE',
  'SHELLBREAK_BLD_WORKSHOP',
  'SHELLBREAK_BLD_FURNACE',
  'SHELLBREAK_BLD_LIBRARY',
  'SHELLBREAK_BLD_INSTITUTE',
  'SHELLBREAK_BLD_SQUARE',
  'SHELLBREAK_BLD_TEMPLE',
  'SHELLBREAK_BLD_HYDROTURBINE',
  'SHELLBREAK_BLD_HYDROSHOP',
  'SHELLBREAK_BLD_CANAL',
  'SHELLBREAK_BLD_CIVICHALL',
  'SHELLBREAK_BLD_OBSERVATORY',
  'SHELLBREAK_BLD_CORALFARM',
  'SHELLBREAK_BLD_BANK',
  'SHELLBREAK_BLD_CARAVANSERAI',
  'SHELLBREAK_BLD_MUSEUM',
  'SHELLBREAK_BLD_BLACK_MONOLITH',
  'SHELLBREAK_BLD_HOTFORGE',
  'SHELLBREAK_BLD_SCHOOL',
  'SHELLBREAK_BLD_THEATER',
  'SHELLBREAK_BLD_TENEMENT',
  'SHELLBREAK_BLD_RESEARCHLAB',
  'SHELLBREAK_BLD_SATELLITE',
  'SHELLBREAK_BLD_SPACESTATION',
  'SHELLBREAK_BLD_FISSIONPLANT',
  'SHELLBREAK_BLD_STADIUM',
  'SHELLBREAK_BLD_BIOMATLAB',
  'SHELLBREAK_BLD_RHEAMINE',
  'SHELLBREAK_BLD_TITANCLOUD',
  'SHELLBREAK_BLD_ROBOTBAY',
  'SHELLBREAK_BLD_MARS_WORKSHOP',
  'SHELLBREAK_BLD_EUROPA_LAUNCH',
  'SHELLBREAK_BLD_SOLAR_RING',
  'SHELLBREAK_BLD_TERRA_LAUNCH',
  'SHELLBREAK_BLD_ENCELADUS_LAUNCH',
  'SHELLBREAK_BLD_VOID_ALTAR',
  'SHELLBREAK_BLD_TERRA_VAT',
  'SHELLBREAK_BLD_TERRA_ENGINE',
  'SHELLBREAK_BLD_TIDEMACHINE',
  'SHELLBREAK_BLD_SOLARSTATION',
  'SHELLBREAK_BLD_ENLADOFARM',
  'SHELLBREAK_BLD_GRAVE',
  'SHELLBREAK_BLD_HOSPITAL',
  'SHELLBREAK_BLD_RESERVE',
  'SHELLBREAK_BLD_BARRACKS',
  'SHELLBREAK_BLD_FORTRESS',
  'SHELLBREAK_BLD_MILITARY_ACADEMY'
]);
const STEAM_BUILDING_PROGRESS_STATS = new Map(
  [...STEAM_ACHIEVEMENTS]
    .filter((apiName) => apiName.startsWith('SHELLBREAK_BLD_'))
    .map((apiName) => [apiName, `${apiName}_PROGRESS`])
);
const STEAM_LEADERBOARD_SPECS = new Map([
  ['fastest', { name: 'shellbreak_fastest_ice_shellbreak', sort: 'ascending' }],
  ['firstFaith', { name: 'shellbreak_fastest_faith', sort: 'ascending' }],
  ['dev', { name: 'shellbreak_development_score', sort: 'descending' }],
  ['wonder', { name: 'shellbreak_legacy_wonders', sort: 'descending' }],
  ['cycle', { name: 'shellbreak_prestige_count', sort: 'descending' }],
  ['star', { name: 'shellbreak_stardust', sort: 'descending' }],
  ['tide', { name: 'shellbreak_prestige_points', sort: 'descending' }],
  ['dyson', { name: 'shellbreak_fastest_dyson_sphere', sort: 'ascending' }],
  ['void', { name: 'shellbreak_fastest_verge_ascension', sort: 'ascending' }],
  ['drift', { name: 'shellbreak_fastest_wandering_terra', sort: 'ascending' }],
  ['dysonrush', { name: 'shellbreak_fastest_starsea_race', sort: 'ascending' }],
  ['pollution', { name: 'shellbreak_lowest_pollution_clear', sort: 'ascending' }]
]);
const STEAM_LEADERBOARD_MAX_SCORE = 2147483647;
const STEAM_LEADERBOARD_RATE_WINDOW_MS = 10 * 60 * 1000;
const STEAM_LEADERBOARD_MAX_UPLOADS_PER_WINDOW = 10;
const STEAM_LEADERBOARD_UPLOAD_INTERVAL_MS = 61 * 1000;
const STEAM_LEADERBOARD_CALL_TIMEOUT_MS = 20 * 1000;
let steamClient = null;
let steamInitAttempted = false;
let steamStatsDirty = false;
let steamStatsStoreTimer = null;
const steamLeaderboardQueue = new Map();
const steamLeaderboardUploadTimes = [];
let steamLeaderboardUploadActive = false;
let steamLeaderboardQueueTimer = null;
let steamLeaderboardQueueLoaded = false;
let autoCloudTempSequence = 0;

function trustedRenderer(event) {
  try {
    const source = event.senderFrame ? event.senderFrame.url : event.sender.getURL();
    const url = new URL(source);
    return url.protocol === `${APP_SCHEME}:` && url.hostname === APP_HOST;
  } catch {
    return false;
  }
}

function autoCloudSavePath() {
  return path.join(app.getPath('userData'), AUTO_CLOUD_SAVE_DIR, AUTO_CLOUD_SAVE_FILE);
}

function steamLeaderboardQueuePath() {
  return path.join(app.getPath('userData'), STEAM_DATA_DIR, STEAM_LEADERBOARD_QUEUE_FILE);
}

function loadSteamLeaderboardQueue() {
  if (steamLeaderboardQueueLoaded) return;
  steamLeaderboardQueueLoaded = true;
  try {
    const saved = JSON.parse(fs.readFileSync(steamLeaderboardQueuePath(), 'utf8'));
    if (!saved || saved.schema !== 1) return;
    for (const entry of Array.isArray(saved.queue) ? saved.queue : []) {
      const spec = entry && STEAM_LEADERBOARD_SPECS.get(entry.key);
      const score = Number(entry && entry.score);
      if (spec && Number.isSafeInteger(score) && score > 0 && score <= STEAM_LEADERBOARD_MAX_SCORE) {
        steamLeaderboardQueue.set(entry.key, { key: entry.key, score });
      }
    }
    const cutoff = Date.now() - STEAM_LEADERBOARD_RATE_WINDOW_MS;
    for (const timestamp of Array.isArray(saved.uploadTimes) ? saved.uploadTimes : []) {
      if (Number.isFinite(timestamp) && timestamp > cutoff && timestamp <= Date.now()) {
        steamLeaderboardUploadTimes.push(timestamp);
      }
    }
    steamLeaderboardUploadTimes.sort((a, b) => a - b);
  } catch {
    // The queue is optional; a missing or malformed file does not block game startup.
  }
}

function persistSteamLeaderboardQueue() {
  try {
    const filePath = steamLeaderboardQueuePath();
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const tempPath = path.join(directory, `${STEAM_LEADERBOARD_QUEUE_FILE}.${process.pid}.tmp`);
    const raw = JSON.stringify({
      schema: 1,
      queue: [...steamLeaderboardQueue.values()],
      uploadTimes: steamLeaderboardUploadTimes.slice(-STEAM_LEADERBOARD_MAX_UPLOADS_PER_WINDOW)
    });
    fs.writeFileSync(tempPath, raw, 'utf8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (error) {
    console.warn('[steam-rank] queue save failed', error && error.message ? error.message : error);
    return false;
  }
}

function saveChecksum(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function validAutoCloudRecord(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_AUTO_CLOUD_SAVE_BYTES) return false;
  try {
    const record = JSON.parse(raw);
    return !!record && record.schema === 1
      && typeof record.meta === 'string' && typeof record.run === 'string'
      && record.checksum === saveChecksum(record.meta + '\n' + record.run);
  } catch {
    return false;
  }
}

ipcMain.on('shellbreak:auto-cloud-save:read', (event) => {
  if (!trustedRenderer(event)) {
    event.returnValue = { status: 'error', code: 'untrusted_sender' };
    return;
  }
  try {
    const filePath = autoCloudSavePath();
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_AUTO_CLOUD_SAVE_BYTES) {
      event.returnValue = { status: 'error', code: 'too_large' };
      return;
    }
    event.returnValue = { status: 'ok', raw: fs.readFileSync(filePath, 'utf8') };
  } catch (error) {
    event.returnValue = error && error.code === 'ENOENT'
      ? { status: 'absent' }
      : { status: 'error', code: 'read_failed' };
  }
});

ipcMain.on('shellbreak:auto-cloud-save:write', (event, raw) => {
  if (!trustedRenderer(event)) {
    event.returnValue = { ok: false, code: 'untrusted_sender' };
    return;
  }
  if (!validAutoCloudRecord(raw)) {
    event.returnValue = { ok: false, code: 'invalid_record' };
    return;
  }

  const filePath = autoCloudSavePath();
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory,
    `${AUTO_CLOUD_SAVE_FILE}.${process.pid}.${++autoCloudTempSequence}.tmp`);
  let descriptor = null;
  try {
    fs.mkdirSync(directory, { recursive: true });
    descriptor = fs.openSync(tempPath, 'w');
    fs.writeFileSync(descriptor, raw, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(tempPath, filePath);
    if (fs.readFileSync(filePath, 'utf8') !== raw) throw new Error('save_readback_mismatch');
    event.returnValue = { ok: true, bytes: Buffer.byteLength(raw, 'utf8') };
  } catch {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.unlinkSync(tempPath); } catch {}
    event.returnValue = { ok: false, code: 'write_failed' };
  }
});

ipcMain.on('shellbreak:auto-cloud-save:remove', (event) => {
  if (!trustedRenderer(event)) {
    event.returnValue = { ok: false, code: 'untrusted_sender' };
    return;
  }
  try {
    fs.unlinkSync(autoCloudSavePath());
    event.returnValue = { ok: true };
  } catch (error) {
    event.returnValue = error && error.code === 'ENOENT'
      ? { ok: true }
      : { ok: false, code: 'remove_failed' };
  }
});

function currentSteamClient() {
  loadSteamLeaderboardQueue();
  if (!steamInitAttempted) {
    steamInitAttempted = true;
    try {
      steamClient = require('@cozycoast/steamworks.js').init();
    } catch {
      steamClient = null;
    }
  }
  if (steamClient && steamLeaderboardQueue.size && !steamLeaderboardUploadActive && !steamLeaderboardQueueTimer) {
    scheduleSteamLeaderboardPump(0);
  }
  return steamClient;
}

function scheduleSteamLeaderboardPump(delayMs) {
  if (steamLeaderboardQueueTimer) clearTimeout(steamLeaderboardQueueTimer);
  steamLeaderboardQueueTimer = setTimeout(() => {
    steamLeaderboardQueueTimer = null;
    void pumpSteamLeaderboardQueue();
  }, Math.max(0, delayMs));
  if (typeof steamLeaderboardQueueTimer.unref === 'function') steamLeaderboardQueueTimer.unref();
}

function steamCallWithTimeout(promise, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Steam ${label} timed out`)), STEAM_LEADERBOARD_CALL_TIMEOUT_MS);
    })
  ]).finally(() => clearTimeout(timer));
}

function enqueueSteamLeaderboardScores(entries) {
  loadSteamLeaderboardQueue();
  const client = currentSteamClient();
  if (!client || !client.leaderboard || typeof client.leaderboard.findLeaderboard !== 'function') {
    return { ok: false, code: 'steam_unavailable', queued: 0 };
  }

  let queued = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.key !== 'string') continue;
    const spec = STEAM_LEADERBOARD_SPECS.get(entry.key);
    const score = Number(entry.score);
    if (!spec || !Number.isSafeInteger(score) || score < 1 || score > STEAM_LEADERBOARD_MAX_SCORE) continue;

    const current = steamLeaderboardQueue.get(entry.key);
    const isBetter = !current || (spec.sort === 'ascending' ? score < current.score : score > current.score);
    if (!isBetter) continue;
    steamLeaderboardQueue.set(entry.key, { key: entry.key, score });
    queued++;
  }

  if (queued) {
    persistSteamLeaderboardQueue();
    if (!steamLeaderboardUploadActive && !steamLeaderboardQueueTimer) scheduleSteamLeaderboardPump(0);
  }
  return { ok: true, queued };
}

async function pumpSteamLeaderboardQueue() {
  loadSteamLeaderboardQueue();
  if (steamLeaderboardUploadActive || !steamLeaderboardQueue.size) return;
  steamLeaderboardUploadActive = true;
  try {
    const now = Date.now();
    const recentCountBeforePrune = steamLeaderboardUploadTimes.length;
    while (steamLeaderboardUploadTimes.length && now - steamLeaderboardUploadTimes[0] >= STEAM_LEADERBOARD_RATE_WINDOW_MS) {
      steamLeaderboardUploadTimes.shift();
    }
    if (steamLeaderboardUploadTimes.length !== recentCountBeforePrune) persistSteamLeaderboardQueue();
    if (steamLeaderboardUploadTimes.length >= STEAM_LEADERBOARD_MAX_UPLOADS_PER_WINDOW) {
      const nextAllowed = steamLeaderboardUploadTimes[0] + STEAM_LEADERBOARD_RATE_WINDOW_MS + 1000;
      scheduleSteamLeaderboardPump(nextAllowed - now);
      return;
    }

    const queued = steamLeaderboardQueue.values().next().value;
    const spec = queued && STEAM_LEADERBOARD_SPECS.get(queued.key);
    const client = currentSteamClient();
    if (!queued || !spec || !client || !client.leaderboard) return;

    const board = await steamCallWithTimeout(client.leaderboard.findLeaderboard(spec.name), 'leaderboard lookup');
    if (!board || typeof board.uploadScore !== 'function') throw new Error(`Steam leaderboard not found: ${spec.name}`);

    const upload = board.uploadScore(0, queued.score);
    steamLeaderboardUploadTimes.push(Date.now());
    persistSteamLeaderboardQueue();
    const result = await steamCallWithTimeout(upload, 'leaderboard upload');
    if (!result) throw new Error(`Steam leaderboard rejected score: ${spec.name}`);

    if (steamLeaderboardQueue.get(queued.key) === queued) steamLeaderboardQueue.delete(queued.key);
    persistSteamLeaderboardQueue();
    console.info('[steam-rank] uploaded', queued.key, queued.score, result.globalRankNew);
    if (steamLeaderboardQueue.size) scheduleSteamLeaderboardPump(STEAM_LEADERBOARD_UPLOAD_INTERVAL_MS);
  } catch (error) {
    console.warn('[steam-rank] upload deferred', error && error.message ? error.message : error);
    scheduleSteamLeaderboardPump(Math.max(STEAM_LEADERBOARD_UPLOAD_INTERVAL_MS, 5 * 60 * 1000));
  } finally {
    steamLeaderboardUploadActive = false;
  }
}

function steamEntryToRecord(entry, client, localSteamId) {
  const steamId = entry && entry.user ? String(entry.user.steamId64) : '';
  let playerName = '';
  if (steamId && steamId === localSteamId) {
    try { playerName = String(client.localplayer.getName() || ''); } catch {}
  } else if (steamId && client.friends && typeof client.friends.getFriendName === 'function') {
    try {
      const cached = String(client.friends.getFriendName(BigInt(steamId)) || '');
      if (cached && cached !== '[unknown]') playerName = cached;
    } catch {}
  }
  return {
    rank: Number(entry && entry.globalRank) || 0,
    score: Number(entry && entry.score) || 0,
    steamId,
    playerName,
    isLocalPlayer: !!steamId && steamId === localSteamId
  };
}

async function readSteamLeaderboard(key, mode) {
  const spec = STEAM_LEADERBOARD_SPECS.get(key);
  const client = currentSteamClient();
  if (!spec || !client || !client.leaderboard || typeof client.leaderboard.findLeaderboard !== 'function') {
    return { ok: false, code: 'steam_unavailable', entries: [] };
  }

  try {
    const board = await steamCallWithTimeout(client.leaderboard.findLeaderboard(spec.name), 'leaderboard lookup');
    if (!board || typeof board.downloadEntries !== 'function') return { ok: false, code: 'board_not_found', entries: [] };

    let downloaded;
    if (mode === 'friends') {
      downloaded = await steamCallWithTimeout(board.downloadEntries(2, 0, 0, 0), 'friends leaderboard read');
    } else {
      const top = await steamCallWithTimeout(board.downloadEntries(0, 1, 10, 0), 'global leaderboard read');
      const around = await steamCallWithTimeout(board.downloadEntries(1, -2, 2, 0), 'player leaderboard read');
      const merged = new Map();
      for (const entry of [...(top || []), ...(around || [])]) {
        if (entry && entry.user) merged.set(String(entry.user.steamId64), entry);
      }
      downloaded = [...merged.values()].sort((a, b) => Number(a.globalRank) - Number(b.globalRank));
    }

    let localSteamId = '';
    try { localSteamId = String(client.localplayer.getSteamId().steamId64); } catch {}
    if (client.friends && typeof client.friends.requestUserInformation === 'function') {
      for (const entry of downloaded || []) {
        const steamId = entry && entry.user ? String(entry.user.steamId64) : '';
        if (!steamId || steamId === localSteamId) continue;
        try { client.friends.requestUserInformation(BigInt(steamId), true); } catch {}
      }
      if ((downloaded || []).length) await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return {
      ok: true,
      mode: mode === 'friends' ? 'friends' : 'global',
      entries: (downloaded || []).map((entry) => steamEntryToRecord(entry, client, localSteamId))
    };
  } catch (error) {
    console.warn('[steam-rank] read failed', key, error && error.message ? error.message : error);
    return { ok: false, code: 'read_failed', entries: [] };
  }
}

function flushSteamStats() {
  if (!steamStatsDirty) return true;
  const client = currentSteamClient();
  if (!client || !client.stats || typeof client.stats.store !== 'function') return false;
  try {
    const stored = !!client.stats.store();
    if (stored) steamStatsDirty = false;
    return stored;
  } catch {
    return false;
  }
}

function scheduleSteamStatsStore() {
  if (steamStatsStoreTimer) return;
  steamStatsStoreTimer = setTimeout(() => {
    steamStatsStoreTimer = null;
    if (steamStatsDirty && !flushSteamStats()) scheduleSteamStatsStore();
  }, 60_000);
  if (typeof steamStatsStoreTimer.unref === 'function') steamStatsStoreTimer.unref();
}

function currentSteamGameLanguage() {
  const client = currentSteamClient();
  try {
    return client && client.apps
      ? String(client.apps.currentGameLanguage() || '')
      : '';
  } catch {
    return '';
  }
}

ipcMain.handle('shellbreak:steam-leaderboard:submit', async (event, entries) => {
  if (!trustedRenderer(event)) return { ok: false, code: 'untrusted_sender', queued: 0 };
  if (!Array.isArray(entries) || entries.length > STEAM_LEADERBOARD_SPECS.size) {
    return { ok: false, code: 'invalid_payload', queued: 0 };
  }
  return enqueueSteamLeaderboardScores(entries);
});

ipcMain.on('shellbreak:steam-leaderboard:available', (event) => {
  if (!trustedRenderer(event)) {
    event.returnValue = false;
    return;
  }
  const client = currentSteamClient();
  event.returnValue = !!(client && client.leaderboard
    && typeof client.leaderboard.findLeaderboard === 'function'
    && typeof client.leaderboard.downloadEntries === 'function');
});

ipcMain.handle('shellbreak:steam-leaderboard:read', async (event, key, mode) => {
  if (!trustedRenderer(event)) return { ok: false, code: 'untrusted_sender', entries: [] };
  if (typeof key !== 'string' || !STEAM_LEADERBOARD_SPECS.has(key)) {
    return { ok: false, code: 'unknown_leaderboard', entries: [] };
  }
  return readSteamLeaderboard(key, mode === 'friends' ? 'friends' : 'global');
});

ipcMain.on('shellbreak:steam-achievement:unlock', (event, apiName) => {
  if (!trustedRenderer(event)) {
    event.returnValue = { ok: false, code: 'untrusted_sender' };
    return;
  }
  if (typeof apiName !== 'string' || !STEAM_ACHIEVEMENTS.has(apiName)) {
    event.returnValue = { ok: false, code: 'unknown_achievement' };
    return;
  }
  try {
    const client = currentSteamClient();
    if (!client || !client.achievement || typeof client.achievement.activate !== 'function') {
      event.returnValue = { ok: false, code: 'steam_unavailable' };
      return;
    }
    const ok = !!client.achievement.activate(apiName);
    event.returnValue = ok ? { ok: true } : { ok: false, code: 'unlock_failed' };
  } catch {
    event.returnValue = { ok: false, code: 'unlock_failed' };
  }
});

ipcMain.on('shellbreak:steam-building-progress:sync', (event, apiName, rawProgress) => {
  if (!trustedRenderer(event)) return;
  const statName = typeof apiName === 'string' ? STEAM_BUILDING_PROGRESS_STATS.get(apiName) : '';
  const progress = Number(rawProgress);
  if (!statName || !Number.isFinite(progress)) return;

  const client = currentSteamClient();
  if (!client || !client.stats
      || typeof client.stats.getInt !== 'function'
      || typeof client.stats.setInt !== 'function') return;

  const nextValue = Math.max(0, Math.min(100, Math.floor(progress)));
  let currentValue = 0;
  try {
    const storedValue = client.stats.getInt(statName);
    if (typeof storedValue === 'number' && Number.isFinite(storedValue))
      currentValue = Math.max(0, Math.min(100, Math.floor(storedValue)));
  } catch {
    return;
  }
  if (nextValue <= currentValue) return;

  try {
    if (client.stats.setInt(statName, nextValue)) {
      steamStatsDirty = true;
      scheduleSteamStatsStore();
    }
  } catch {
    // Steam stats can be unavailable until the matching Steamworks configuration is published.
  }
});

app.on('before-quit', () => {
  if (steamStatsStoreTimer) {
    clearTimeout(steamStatsStoreTimer);
    steamStatsStoreTimer = null;
  }
  flushSteamStats();
  if (steamLeaderboardQueueTimer) {
    clearTimeout(steamLeaderboardQueueTimer);
    steamLeaderboardQueueTimer = null;
  }
  persistSteamLeaderboardQueue();
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true
    }
  }
]);

function resolveAppFile(requestUrl) {
  const url = new URL(requestUrl);
  if (url.hostname !== APP_HOST) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname === '/') pathname = '/index.html';

  const appRoot = path.resolve(app.getAppPath());
  const filePath = path.resolve(appRoot, `.${pathname}`);
  const relativePath = path.relative(appRoot, filePath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return null;
  }
  return filePath;
}

async function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const filePath = resolveAppFile(request.url);
    if (!filePath) return new Response('Not found', { status: 404 });

    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#07141a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const target = new URL(targetUrl);
      if (target.protocol !== `${APP_SCHEME}:` || target.hostname !== APP_HOST) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  const steamLanguage = currentSteamGameLanguage();
  const languageQuery = steamLanguage
    ? '?steamLanguage=' + encodeURIComponent(steamLanguage)
    : '';
  window.loadURL(APP_SCHEME + '://' + APP_HOST + '/index.html' + languageQuery);
  return window;
}

app.setName('Shellbreak');
app.setPath('userData', path.join(app.getPath('appData'), 'Shellbreak'));

app.whenReady().then(async () => {
  await registerAppProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
