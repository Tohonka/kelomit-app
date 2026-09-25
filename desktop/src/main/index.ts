import {app, BrowserWindow, ipcMain, nativeTheme, net, protocol} from 'electron';
import {pathToFileURL} from 'node:url';
import {isSafeMediaName, mediaPath} from '../../../server/src/media.ts';
import {registerReportIpc} from './report.ts';
import {registerOffIpc} from './off.ts';
import {registerMediaIpc} from './media.ts';
import {reportCheck} from './report-check.ts';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ensureDataDir, loadOrCreateToken, pairInfo} from './config.ts';
import {startApiServer} from './server.ts';
import {installMenu} from './menu.ts';
import {registerQueryIpc} from './ipc.ts';
import {watchCurrentDb} from './watch.ts';
import {PhoneLink} from './ws.ts';
import {CommandQueue} from './queue.ts';

app.setName('Kelomit Companion');

// kelomit-media:///<basename> → the file the phone pushed into media/.
protocol.registerSchemesAsPrivileged([
  {scheme: 'kelomit-media', privileges: {secure: true, supportFetchAPI: true, stream: true}},
]);

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161719' : '#F5F5F3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // ESM preload scripts can't be sandboxed (Electron docs); contextIsolation stays on.
      sandbox: false,
    },
  });
  win.on('closed', () => {
    win = null;
  });
  // Dev aids: KELOMIT_DATE opens on a given day; KELOMIT_THEME=light|dark forces
  // the appearance; KELOMIT_SCREENSHOT=<png> captures the window after load and
  // quits (headless UI check).
  if (process.env.KELOMIT_THEME === 'light' || process.env.KELOMIT_THEME === 'dark') {
    nativeTheme.themeSource = process.env.KELOMIT_THEME;
  }
  const query: Record<string, string> = {};
  if (process.env.KELOMIT_DATE) query.date = process.env.KELOMIT_DATE;
  if (process.env.KELOMIT_VIEW) query.view = process.env.KELOMIT_VIEW;
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
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
  const queue = new CommandQueue(join(dataDir, 'queue.json'), phone);
  phone.on('state', state => {
    win?.webContents.send('phone-state', state);
    if (state.connected) queue.drain();
  });
  queue.on('change', snapshot => win?.webContents.send('queue-changed', snapshot));

  protocol.handle('kelomit-media', request => {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''));
    if (!isSafeMediaName(name)) {
      return new Response('bad name', {status: 400});
    }
    return net.fetch(pathToFileURL(mediaPath(dataDir, name)).toString());
  });
  registerReportIpc(dataDir);
  registerOffIpc();
  registerMediaIpc(dataDir, () => win);

  ipcMain.handle('pair-info', () => pairInfo(token));
  ipcMain.handle('phone-state', () => phone.state);
  ipcMain.handle('cmd', (_e, fn: string, args: unknown[], label: string) => queue.push(fn, args, label));
  ipcMain.handle('queue', () => queue.snapshot());
  ipcMain.handle('queue-update', (_e, id: string, args: unknown[], label?: string) => queue.update(id, args, label));
  ipcMain.handle('queue-remove', (_e, id: string) => queue.remove(id));
  ipcMain.handle('queue-dismiss', (_e, id: string) => queue.dismissFailed(id));
  registerQueryIpc(dataDir);
  watchCurrentDb(dataDir, () => win?.webContents.send('db-changed'));

  if (process.env.KELOMIT_REPORT_PDF) {
    reportCheck(dataDir, process.env.KELOMIT_REPORT_PDF, '2026-09-01', '2026-09-16').catch(e => {
      console.error('report check failed:', e);
      app.exit(1);
    });
    return;
  }

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
