'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shellbreakPlatform', Object.freeze({
  runtime: 'electron',
  localizationEnabled: true,
  readAutoCloudSave: () => ipcRenderer.sendSync('shellbreak:auto-cloud-save:read'),
  writeAutoCloudSave: (raw) => ipcRenderer.sendSync('shellbreak:auto-cloud-save:write', raw),
  removeAutoCloudSave: () => ipcRenderer.sendSync('shellbreak:auto-cloud-save:remove')
}));
