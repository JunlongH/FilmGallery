// electron-preload.js
const { contextBridge, ipcRenderer, shell } = require('electron');

// Default API base for full version (embedded server)
const DEFAULT_API_BASE = 'http://127.0.0.1:4000';

// Load API_BASE from saved config synchronously before exposing to renderer
// This ensures that if user configured a remote server, we use it from startup
let savedApiBase = DEFAULT_API_BASE; // default fallback
try {
  // Get config synchronously during preload initialization
  const result = ipcRenderer.sendSync('config-get-api-base-sync');
  // Only use result if it's a valid non-empty string
  if (result && typeof result === 'string' && result.trim()) {
    savedApiBase = result.trim();
  }
} catch (e) {
  console.warn('[Preload] Failed to load API_BASE from config, using default:', e);
}

contextBridge.exposeInMainWorld('__electron', {
  platform: process.platform,
  // Use saved config, or env override, or default
  API_BASE: process.env.ELECTRON_API_BASE || savedApiBase || DEFAULT_API_BASE, 
  
  // Expose method to change API BASE at runtime (reload required)
  setApiBase: (url) => ipcRenderer.invoke('config-set-api-base', url),
  getApiBase: () => ipcRenderer.invoke('config-get-api-base'),

  minimize: () => ipcRenderer.invoke('window-minimize'),

  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  // Settings/config
  getConfig: () => ipcRenderer.invoke('config-get'),
  pickUploadsRoot: () => ipcRenderer.invoke('pick-uploads-root'),
  setUploadsRoot: (dir) => ipcRenderer.invoke('config-set-uploads-root', dir),
  pickDataRoot: () => ipcRenderer.invoke('pick-data-root'),
  setDataRoot: (dir) => ipcRenderer.invoke('config-set-data-root', dir),
  setWriteThrough: (flag) => ipcRenderer.invoke('config-set-write-through', flag),
  // FilmLab GPU processing (offscreen worker)
  filmlabGpuProcess: (payload) => ipcRenderer.invoke('filmlab-gpu:process', payload),
  filmLabSaveAs: async ({ blob, defaultName }) => {
    try {
      if (!blob) return { ok:false, error:'no_blob' };
      const arrBuf = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrBuf));
      return ipcRenderer.invoke('filmlab-save-as', { defaultName, bytes });
    } catch (e) {
      return { ok:false, error: e && e.message };
    }
  },
  showInFolder: (filePath) => { try { if (filePath) shell.showItemInFolder(filePath); } catch(_){ /* ignore shell errors */ } }
});