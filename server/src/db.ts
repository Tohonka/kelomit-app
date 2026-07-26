import {existsSync, statSync} from 'node:fs';
import {join} from 'node:path';
import Database from 'better-sqlite3';

let cached: {path: string; mtimeMs: number; db: Database.Database} | null = null;

/** Read-only handle over the last synced database, reopened whenever the file
 *  changes so a sync is picked up without a restart. Null before first sync. */
export function openCurrent(dataDir: string): Database.Database | null {
  const path = join(dataDir, 'current.db');
  if (!existsSync(path)) {
    return null;
  }
  const {mtimeMs} = statSync(path);
  if (cached && cached.path === path && cached.mtimeMs === mtimeMs) {
    return cached.db;
  }
  cached?.db.close();
  const db = new Database(path, {readonly: true, fileMustExist: true});
  cached = {path, mtimeMs, db};
  return db;
}
