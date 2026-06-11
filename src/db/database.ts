import {open} from '@op-engineering/op-sqlite';
import {migrations} from './migrations';

let _db: ReturnType<typeof open> | null = null;

export function getDB() {
  if (!_db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return _db;
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
      const statements = migration.up
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        await _db.execute(stmt + ';');
      }

      await _db.execute(
        'INSERT OR REPLACE INTO schema_version (version) VALUES (?);',
        [migration.version],
      );
    }
  }
}
