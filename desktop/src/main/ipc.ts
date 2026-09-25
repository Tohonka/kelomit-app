import {ipcMain} from 'electron';
import {openCurrent} from '../../../server/src/db.ts';
import {QUERIES} from './queries.ts';
import type {QueryName} from './queries.ts';

/**
 * `query(name, ...args)` from the renderer → the named read in queries.ts
 * against the last pushed database. Null result = nothing pushed yet.
 * Reads are synchronous on purpose: `openCurrent`'s handle must never be
 * held across an await (ingest can rename a new file under it).
 */
export function registerQueryIpc(dataDir: string): void {
  ipcMain.handle('query', (_e, name: string, ...args: unknown[]) => {
    if (!Object.prototype.hasOwnProperty.call(QUERIES, name)) {
      throw new Error(`unknown query: ${name}`);
    }
    const db = openCurrent(dataDir);
    if (!db) {
      return null;
    }
    const fn = QUERIES[name as QueryName] as (db: unknown, ...a: unknown[]) => unknown;
    return fn(db, ...args);
  });
}
