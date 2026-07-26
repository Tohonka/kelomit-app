import {
  writeFileSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import {join} from 'node:path';
import Database from 'better-sqlite3';

export interface IngestPaths {
  dataDir: string;
}

const SNAPSHOT_KEEP = 30;

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** Open the candidate read-only and prove it is a Kelomit database. Anything
 *  that throws here means the upload never reaches current.db. */
function validate(path: string): void {
  let db: Database.Database | undefined;
  try {
    db = new Database(path, {readonly: true, fileMustExist: true});
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as
      | {v: number | null}
      | undefined;
    if (!row || row.v == null) {
      throw new Error('no schema version');
    }
  } catch (e) {
    throw new Error(`invalid database: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    db?.close();
  }
}

export function pruneSnapshots(dataDir: string, keep = SNAPSHOT_KEEP): void {
  const dir = join(dataDir, 'snapshots');
  if (!existsSync(dir)) {
    return;
  }
  const names = readdirSync(dir)
    .filter(n => /^kelomit-\d{8}-\d{6}\.db$/.test(n))
    .sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    rmSync(join(dir, name), {force: true});
  }
}

/** Validate then atomically install an uploaded database. */
export async function ingestDatabase(body: Buffer, paths: IngestPaths): Promise<void> {
  const {dataDir} = paths;
  mkdirSync(join(dataDir, 'snapshots'), {recursive: true});

  const incoming = join(dataDir, 'incoming.db');
  writeFileSync(incoming, body);

  try {
    validate(incoming);
  } catch (e) {
    rmSync(incoming, {force: true});
    throw e;
  }

  copyFileSync(incoming, join(dataDir, 'snapshots', `kelomit-${stamp()}.db`));
  // rename is atomic on the same filesystem — a reader never sees a partial file.
  renameSync(incoming, join(dataDir, 'current.db'));
  pruneSnapshots(dataDir);
}
