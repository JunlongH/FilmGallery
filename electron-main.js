const { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const isDev = process.env.ELECTRON_DEV === 'true' || !app.isPackaged;

// Ensure Windows uses our packaged icon for taskbar/start shortcuts
// Must be set before any BrowserWindow is created
try { app.setAppUserModelId('com.yourorg.filmgallery'); } catch (_) {}
let mainWindow = null;
let tray = null;
let isQuitting = false;
let serverProcess = null;
let appConfig = {};

const LOG = (...args) => {
  try {
    const logDir = app.getPath ? app.getPath('userData') : __dirname;
    const p = path.join(logDir, 'electron-main.log');
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${args.join(' ')}\n`);
  } catch (e) {
    // ignore
  }
};

function startServer() {
  const serverDir = path.join(process.resourcesPath || __dirname, 'server');
  LOG('startServer, serverDir=', serverDir);

  const serverEntry = path.join(serverDir, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    LOG('server entry not found', serverEntry);
    return;
  }

  const outLog = path.join(app.getPath('userData'), 'server-out.log');
  const errLog = path.join(app.getPath('userData'), 'server-err.log');
  LOG('server logs', outLog, errLog);

  // Always use Electron's embedded Node to avoid native module ABI mismatch
  try {
    const cmd = process.execPath;
    const args = [serverEntry];
    LOG('attempt spawn', cmd, args.join(' '));
    const env = {
      ...process.env,
      USER_DATA: app.getPath('userData'),
      DATA_ROOT: (appConfig && appConfig.dataRoot) ? appConfig.dataRoot : undefined,
      UPLOADS_ROOT: (appConfig && appConfig.uploadsRoot) ? appConfig.uploadsRoot : undefined,
      ELECTRON_RUN_AS_NODE: '1'
    };
    serverProcess = spawn(cmd, args, {
      cwd: serverDir,
      shell: false,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProcess.stdout && serverProcess.stdout.on('data', d => fs.appendFileSync(outLog, d));
    serverProcess.stderr && serverProcess.stderr.on('data', d => fs.appendFileSync(errLog, d));
    serverProcess.on('error', e => {
      LOG('server spawn error', cmd, e && e.message);
      fs.appendFileSync(errLog, `spawn error ${e && e.message}\n`);
    });
    serverProcess.on('exit', (code, sig) => {
      LOG('server process exit', code, sig);
      fs.appendFileSync(errLog, `process exit ${code} ${sig}\n`);
      serverProcess = null;
    });
    LOG('spawned, pid=', serverProcess.pid);
    fs.appendFileSync(outLog, `spawned ${cmd} ${args.join(' ')} pid=${serverProcess.pid}\n`);
  } catch (e) {
    LOG('Failed to start server', e && e.message);
    fs.appendFileSync(errLog, `Failed to start server ${e && e.message}\n`);
  }
}



function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    try { serverProcess.kill(); } catch (e) {}
    serverProcess = null;
  }
}

function waitForUrl(url, timeout = 10000, interval = 300) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function check() {
      const req = http.get(url, res => {
        res.destroy();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('timeout'));
        setTimeout(check, interval);
      });
      req.setTimeout(2000, () => { req.destroy(); if (Date.now() - start > timeout) return reject(new Error('timeout')); setTimeout(check, interval); });
    })();
  });
}

function createTray() {
  if (tray) return tray;
  try {
    const iconCandidates = [
      // buildResources (electron-builder) copies icons to buildResources dir (assets) or build
      path.join(process.resourcesPath || __dirname, 'assets', 'icon.png'),
      path.join(process.resourcesPath || __dirname, 'build', 'icon.png'),
      path.join(process.resourcesPath || __dirname, 'app.asar.unpacked', 'assets', 'icon.png'),
      path.join(__dirname, 'assets', 'icon.png'),
      path.join(__dirname, 'build', 'icon.png')
    ];
    const iconPath = iconCandidates.find(p => fs.existsSync(p));
    let image = undefined;
    if (iconPath) {
      image = nativeImage.createFromPath(iconPath);
      // On Windows tray prefers a small (16x16 or 24x24) icon; downscale if large
      try {
        const size = image.getSize();
        if (size.width > 64) {
          image = image.resize({ width: 24, height: 24 });
        } else if (size.width > 32) {
          image = image.resize({ width: 24, height: 24 });
        } else if (size.width > 24) {
          image = image.resize({ width: 24, height: 24 });
        }
      } catch (e) {
        LOG('tray resize error', e && e.message);
      }
    } else {
      LOG('Tray icon not found. Checked:', iconCandidates.join(' | '));
      // Fallback: embed a small base64 PNG
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAHUlEQVRIS+3OIQEAAAgDINc/9K3hKBk0MBm0MBm0MBm0MJvgAqJBA4TGAAAAAElFTkSuQmCC';
      image = nativeImage.createFromData(Buffer.from(base64, 'base64')).resize({ width:24, height:24 });
    }
    tray = new Tray(image || nativeImage.createEmpty());
    const contextMenu = Menu.buildFromTemplate([
      { label: '显示窗口', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: '重启后端', click: () => { stopServer(); startServer(); } },
      { type: 'separator' },
      { label: '退出', click: () => { isQuitting = true; stopServer(); app.quit(); } }
    ]);
    tray.setToolTip('Film Gallery');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } });
    LOG('Tray created using iconPath=', iconPath || 'none');
  } catch (e) {
    LOG('createTray error', e && e.message);
  }
  return tray;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    // titleBarStyle: 'hidden', // Removed to prevent conflict with frame: false on Windows
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
  });

  ipcMain.handle('window-minimize', () => mainWindow?.minimize());
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  // Change close to hide (minimize-to-tray behavior)
  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });
  // Provide explicit exit IPC if needed later
  ipcMain.handle('app-exit', () => { isQuitting = true; stopServer(); app.quit(); });

  // debug helpers and logging
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
    LOG('did-fail-load', errorCode, errorDescription, validatedURL);
  });
  mainWindow.webContents.on('crashed', () => {
    LOG('renderer crashed');
  });
  mainWindow.webContents.on('dom-ready', () => {
    LOG('dom-ready url=', mainWindow.webContents.getURL());
  });

  const showAndLog = () => {
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
  };

  // Intercept close to hide instead of quit
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    createTray();
  });

  if (isDev) {
    // dev server
    const devUrl = 'http://localhost:3000';
    mainWindow.loadURL(devUrl).then(showAndLog).catch(err => {
      LOG('loadURL dev failed', err && err.message);
    });
    return;
  }

  // production: static files packaged in resources
  // When packaged by electron-builder, resources are under process.resourcesPath (app.asar or resources/app.asar)
  const indexHtmlCandidates = [
    path.join(process.resourcesPath || process.cwd(), 'client', 'build', 'index.html'),
    path.join(__dirname, 'client', 'build', 'index.html'), // fallback
  ];

  const indexHtml = indexHtmlCandidates.find(p => fs.existsSync(p));
  if (!indexHtml) {
    const p = indexHtmlCandidates.join(' | ');
    LOG('index.html not found. candidates=', p);
    dialog.showErrorBox('启动失败', `找不到前端资源 (index.html)。查阅日志：${path.join(app.getPath('userData'), 'electron-main.log')}`);
    return;
  }

  // If app needs backend API, ensure server is started and ready before loading UI
  const apiHealthUrl = 'http://localhost:4000/api/rolls'; // 如果没有 health 路由可以改成 /api/rolls 或根
  const needsBackend = true; // set to true if front-end calls local API

  (async () => {
    try {
      if (needsBackend) {
        startServer();
        LOG('waiting for backend', apiHealthUrl);
        // wait for backend up (10s), if no health endpoint change to a reachable endpoint
        await waitForUrl(apiHealthUrl, 15000).catch(() => {
          LOG('backend did not respond in time; continuing to load UI anyway');
        });
      }
    } catch (e) {
      LOG('error while waiting backend', e && e.message);
    }

    mainWindow.loadFile(indexHtml).then(showAndLog).catch(err => {
      LOG('loadFile failed', err && err.message);
      dialog.showErrorBox('加载前端失败', `loadFile 失败: ${err && err.message}\n请检查 ${indexHtml}`);
    });
  })();
}

// --- Simple config persistence ---
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf-8')); } catch { return {}; }
}
function saveConfig(next) {
  appConfig = { ...(appConfig||{}), ...(next||{}) };
  try { fs.writeFileSync(CONFIG_PATH(), JSON.stringify(appConfig, null, 2)); } catch(e) { LOG('saveConfig error', e && e.message); }
}

// IPC for settings
ipcMain.handle('config-get', () => appConfig);
ipcMain.handle('pick-uploads-root', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory']});
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
  return res.filePaths[0];
});
ipcMain.handle('config-set-uploads-root', async (e, dir) => {
  if (!dir || typeof dir !== 'string') return { ok:false, error:'invalid_dir' };
  saveConfig({ uploadsRoot: dir });
  // restart backend server with new env so static mounts change
  stopServer();
  startServer();
  return { ok:true, config: appConfig };
});

ipcMain.handle('pick-data-root', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory']});
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
  return res.filePaths[0];
});
ipcMain.handle('config-set-data-root', async (e, dir) => {
  if (!dir || typeof dir !== 'string') return { ok:false, error:'invalid_dir' };
  saveConfig({ dataRoot: dir });
  // restart backend server with new env
  stopServer();
  startServer();
  return { ok:true, config: appConfig };
});

app.on('ready', async () => {
  LOG('app ready, isDev=', isDev);
  appConfig = loadConfig();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Do not quit if tray exists (keep backend alive)
  if (!tray) {
    stopServer();
    if (process.platform !== 'darwin') app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopServer();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});