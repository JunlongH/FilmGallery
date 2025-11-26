// electron-preload.js
const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 到前端（如果需要）
contextBridge.exposeInMainWorld('__electron', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  // Settings/config
  getConfig: () => ipcRenderer.invoke('config-get'),
  pickUploadsRoot: () => ipcRenderer.invoke('pick-uploads-root'),
  setUploadsRoot: (dir) => ipcRenderer.invoke('config-set-uploads-root', dir),
  pickDataRoot: () => ipcRenderer.invoke('pick-data-root'),
  setDataRoot: (dir) => ipcRenderer.invoke('config-set-data-root', dir)
});