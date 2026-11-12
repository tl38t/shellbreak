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
let steamClient = null;
let steamInitAttempted = false;
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

function currentSteamGameLanguage() {
  if (!steamInitAttempted) {
    steamInitAttempted = true;
    try {
      steamClient = require('steamworks.js').init();
    } catch {
      steamClient = null;
    }
  }
  try {
    return steamClient && steamClient.apps
      ? String(steamClient.apps.currentGameLanguage() || '')
      : '';
  } catch {
    return '';
  }
}

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
