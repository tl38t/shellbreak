'use strict';

const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'shellbreak';
const APP_HOST = 'game';
const AUTO_CLOUD_SAVE_DIR = 'Saves';
const AUTO_CLOUD_SAVE_FILE = 'shellbreak-save.sav';
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
let steamClient = null;
let steamInitAttempted = false;
let steamStatsDirty = false;
let steamStatsStoreTimer = null;
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
  if (!steamInitAttempted) {
    steamInitAttempted = true;
    try {
      steamClient = require('steamworks.js').init();
    } catch {
      steamClient = null;
    }
  }
  return steamClient;
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
