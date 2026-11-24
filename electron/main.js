// SCORMcraft desktop shell.
//
// Packaged: forks the Next.js standalone server (resources/app/.next/standalone)
// on 127.0.0.1:3417 with a local SQLite database and file store under
// %APPDATA%/SCORMcraft/data, then shows it in a window.
// Development (`npm run desktop:dev`): electron/dev-server.js starts `next dev`
// with the same environment; this only waits for it and opens the window.

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const http = require('http');
const { PORT, buildServerEnv } = require('./env');

const IS_DEV = !app.isPackaged;
const APP_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let nextServer = null;
let quitting = false;

function getDataDir() {
  return IS_DEV ? path.join(__dirname, '..', '.desktop-data') : path.join(app.getPath('userData'), 'data');
}

// ── Next.js server ─────────────────────────────────────────────────────────

function waitForServer(timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const req = http.get(APP_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('The app server did not start in time.'));
        else setTimeout(tick, 400);
      });
      req.end();
    };
    tick();
  });
}

function startNextServer() {
  if (IS_DEV) return waitForServer(180000);

  const appRoot = path.join(process.resourcesPath, 'app');
  const serverScript = path.join(appRoot, '.next', 'standalone', 'server.js');
  if (!fs.existsSync(serverScript)) {
    return Promise.reject(new Error(`Server not found at ${serverScript}`));
  }

  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'server.log');
  const log = fs.createWriteStream(logPath, { flags: 'a' });
  log.write(`\n--- start ${new Date().toISOString()} ---\n`);

  nextServer = fork(serverScript, [], {
    env: buildServerEnv({ dataDir: getDataDir(), migrationsDir: path.join(appRoot, 'migrations') }),
    cwd: path.dirname(serverScript),
    silent: true,
  });
  nextServer.stdout?.pipe(log);
  nextServer.stderr?.pipe(log);

  const exited = new Promise((_, reject) => {
    nextServer.once('exit', (code) => {
      nextServer = null;
      if (!quitting) reject(new Error(`The app server stopped (exit code ${code}). See ${logPath}`));
    });
  });

  return Promise.race([waitForServer(90000), exited]);
}

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
  const icon = path.join(__dirname, '..', 'build-resources', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    icon: fs.existsSync(icon) ? icon : undefined,
    title: 'SCORMcraft',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Course preview opens in an app window; anything off-site goes to the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    fs.mkdirSync(path.join(getDataDir(), 'files'), { recursive: true });
    try {
      await startNextServer();
      createWindow();
    } catch (err) {
      dialog.showErrorBox('SCORMcraft', `Could not start SCORMcraft.\n\n${err.message}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    quitting = true;
    if (nextServer) {
      nextServer.kill();
      nextServer = null;
    }
  });
}
