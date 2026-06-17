import {open} from '@op-engineering/op-sqlite';
import {migrations} from './migrations';

let _db: ReturnType<typeof open> | null = null;

function isDuplicateColumnError(error: unknown): boolean {
  return String(error).toLowerCase().includes('duplicate column name');
}

export function getDB() {
  if (!_db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return _db;
}

/** Ensure the DB is open + migrated. Safe to call from a headless context
 *  (e.g. a notifee background event after the app was killed). */
export async function ensureDBReady(): Promise<void> {
  if (!_db) {
    await initDB();
  }
}

/** Close the DB connection (used by restore before swapping the file). */
export function closeDB(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export async function initDB(): Promise<void> {
  _db = open({name: 'kelomit.db'});

  // Enable WAL mode and foreign keys
  await _db.execute('PRAGMA journal_mode=WAL;');
  await _db.execute('PRAGMA foreign_keys=ON;');

  // Get current schema version
  await _db.execute(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);',
  );
  const result = await _db.execute(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_version;',
  );
  const currentVersion =
    (result.rows?.[0] as {version: number} | undefined)?.version ?? 0;

  // Run pending migrations in order
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await _db.transaction(async tx => {
        for (const stmt of migration.up) {
          try {
            await tx.execute(stmt);
          } catch (error) {
            if (!isDuplicateColumnError(error)) {
              throw error;
            }
          }
        }

        await tx.execute(
          'INSERT OR REPLACE INTO schema_version (version) VALUES (?);',
          [migration.version],
        );
      });
    }
  }
}
