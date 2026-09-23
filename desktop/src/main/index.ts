import {app, BrowserWindow, ipcMain, nativeTheme} from 'electron';
import {join} from 'node:path';
import {ensureDataDir, loadOrCreateToken, pairInfo} from './config.ts';
import {startApiServer} from './server.ts';
import {installMenu} from './menu.ts';

app.setName('Kelomit Companion');

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#090D16' : '#F2F5FB',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // ESM preload scripts can't be sandboxed (Electron docs); contextIsolation stays on.
      sandbox: false,
    },
  });
  win.on('closed', () => {
    win = null;
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const dataDir = ensureDataDir(app.getPath('userData'));
  const token = loadOrCreateToken(dataDir);
  startApiServer(dataDir, token);

  ipcMain.handle('pair-info', () => pairInfo(token));

  installMenu(() => win);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS convention: the app (and its api server) stays up without a window.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
