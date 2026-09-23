import {app, BrowserWindow, ipcMain, nativeTheme} from 'electron';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ensureDataDir, loadOrCreateToken, pairInfo} from './config.ts';
import {startApiServer} from './server.ts';
import {installMenu} from './menu.ts';
import {registerQueryIpc} from './ipc.ts';
import {watchCurrentDb} from './watch.ts';
import {PhoneLink} from './ws.ts';

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
  // Dev aids: KELOMIT_DATE opens on a given day; KELOMIT_SCREENSHOT=<png>
  // captures the window after load and quits (headless UI check).
  const query = process.env.KELOMIT_DATE ? {date: process.env.KELOMIT_DATE} : undefined;
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    if (query) url.searchParams.set('date', query.date);
    win.loadURL(url.toString());
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {query});
  }
  const shot = process.env.KELOMIT_SCREENSHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win?.webContents.capturePage();
        if (image) writeFileSync(shot, image.toPNG());
        app.quit();
      }, 1500);
    });
  }
}

app.whenReady().then(() => {
  const dataDir = ensureDataDir(app.getPath('userData'));
  const token = loadOrCreateToken(dataDir);
  const server = startApiServer(dataDir, token);
  const phone = new PhoneLink(server as import('node:http').Server, token);
  phone.on('state', state => win?.webContents.send('phone-state', state));

  ipcMain.handle('pair-info', () => pairInfo(token));
  ipcMain.handle('phone-state', () => phone.state);
  registerQueryIpc(dataDir);
  watchCurrentDb(dataDir, () => win?.webContents.send('db-changed'));

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
