import {existsSync, statSync} from 'node:fs';
import {join} from 'node:path';
import Database from 'better-sqlite3';

let cached: {path: string; ino: number; size: number; mtimeMs: number; db: Database.Database} | null = null;

/**
 * Read-only handle over the last synced database, reopened whenever the file
 * changes so a sync is picked up without a restart. Null before first sync.
 *
 * Contract: the returned handle must be used synchronously and never held
 * across an `await`. `POST /api/sync` can `renameSync` a new file over
 * current.db at any time; the next `openCurrent()` call closes the old
 * handle. A reference kept across an async gap can have its handle closed
 * out from under it, and better-sqlite3 throws on a closed handle.
 *
 * ponytail: no lease/refcount to make cross-await use safe — single-user
 * server, every caller today is synchronous. Add a lease if a caller ever
 * needs to hold the handle across an await.
 */
export function openCurrent(dataDir: string): Database.Database | null {
  const path = join(dataDir, 'current.db');
  if (!existsSync(path)) {
    return null;
  }
  const {ino, size, mtimeMs} = statSync(path);
  if (cached && cached.path === path && cached.ino === ino && cached.size === size && cached.mtimeMs === mtimeMs) {
    return cached.db;
  }
  cached?.db.close();
  const db = new Database(path, {readonly: true, fileMustExist: true});
  cached = {path, ino, size, mtimeMs, db};
  return db;
}
