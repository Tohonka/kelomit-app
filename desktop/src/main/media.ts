import {dialog, ipcMain} from 'electron';
import type {BrowserWindow} from 'electron';
import {copyFileSync} from 'node:fs';
import {extname} from 'node:path';
import {mediaPath} from '../../../server/src/media.ts';
import type {MediaType} from '../../../src/types/index.ts';

/** A Mac file copied into media/ under the name the phone will store it as. */
export interface StagedFile {
  name: string;
  media_type: MediaType;
}

export interface StageResult {
  staged: StagedFile[];
  /** Basenames of files of a type the phone can't take (HEIC, PDF, …). */
  skipped: string[];
}

const KIND: Record<string, MediaType> = {jpg: 'photo', jpeg: 'photo', png: 'photo', mp4: 'video', m4a: 'voice', wav: 'voice'};
export const MEDIA_EXTENSIONS = Object.keys(KIND);

/**
 * Staging = the desktop's half of `media.add`: the file lands in media/ under a
 * phone-style name (`photo_<ts>_<rand>.jpg`) so the renderer can show it at
 * once, the phone can pull it by name, and the phone's next push finds the
 * same basename in the manifest and skips it.
 */
export function stageFiles(dataDir: string, paths: string[]): StageResult {
  const out: StageResult = {staged: [], skipped: []};
  for (const p of paths) {
    let ext = extname(p).slice(1).toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    const media_type = KIND[ext];
    if (!media_type) {
      out.skipped.push(p.split('/').pop() ?? p);
      continue;
    }
    const name = `${media_type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    copyFileSync(p, mediaPath(dataDir, name));
    out.staged.push({name, media_type});
  }
  return out;
}

export function registerMediaIpc(dataDir: string, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('media-stage', (_e, paths: string[]) => stageFiles(dataDir, paths));
  ipcMain.handle('media-pick', async () => {
    const win = getWindow();
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{name: 'Photos, videos, audio', extensions: MEDIA_EXTENSIONS}],
    };
    const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
    return r.canceled ? {staged: [], skipped: []} : stageFiles(dataDir, r.filePaths);
  });
}
