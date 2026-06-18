import RNFS from 'react-native-fs';
import {zip, unzip} from 'react-native-zip-archive';
import {
  pick,
  keepLocalCopy,
  saveDocuments,
  types,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import {getDB, closeDB, initDB} from '../db/database';
import {stopTracking} from './gpsService';
import i18n from '../i18n';

const BACKUP_VERSION = 1;
const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/kelomit/media`;

export type BackupResult = 'done' | 'cancelled';

interface Manifest {
  app: 'kelomit';
  backupVersion: number;
  schemaVersion: number;
  createdAt: string;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Turn a (possibly percent-encoded) file:// URI into a plain filesystem path
 *  that RNFS / zip-archive can open. */
function uriToPath(uri: string): string {
  let path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    path = decodeURIComponent(path);
  } catch {
    // leave as-is if it wasn't encoded
  }
  return path;
}

/** Recursively copy a directory (RNFS has no built-in recursive copy). */
async function copyDir(src: string, dest: string): Promise<void> {
  await RNFS.mkdir(dest);
  for (const item of await RNFS.readDir(src)) {
    const target = `${dest}/${item.name}`;
    if (item.isDirectory()) {
      await copyDir(item.path, target);
    } else {
      await RNFS.copyFile(item.path, target);
    }
  }
}

async function schemaVersion(): Promise<number> {
  const res = await getDB().execute('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version;');
  return ((res.rows?.[0] as {v: number} | undefined)?.v) ?? 0;
}

/**
 * Build a complete backup .zip (DB file + media + manifest) at `targetZip`.
 * Checkpoints the WAL first so the copied DB file is whole. Shared by the
 * user-facing export and the pre-restore safety snapshot.
 */
async function writeBackupZip(targetZip: string): Promise<void> {
  // Flush WAL into the main DB file so a plain file copy is complete.
  await getDB().execute('PRAGMA wal_checkpoint(TRUNCATE);');

  const staging = `${RNFS.CachesDirectoryPath}/kelomit-backup-staging-${Date.now()}`;
  if (await RNFS.exists(staging)) {
    await RNFS.unlink(staging);
  }
  await RNFS.mkdir(staging);
  try {
    await RNFS.copyFile(getDB().getDbPath(), `${staging}/kelomit.db`);

    if (await RNFS.exists(MEDIA_DIR)) {
      await copyDir(MEDIA_DIR, `${staging}/media`);
    }

    const manifest: Manifest = {
      app: 'kelomit',
      backupVersion: BACKUP_VERSION,
      schemaVersion: await schemaVersion(),
      createdAt: new Date().toISOString(),
    };
    await RNFS.writeFile(`${staging}/manifest.json`, JSON.stringify(manifest), 'utf8');

    if (await RNFS.exists(targetZip)) {
      await RNFS.unlink(targetZip);
    }
    await zip(staging, targetZip);
  } finally {
    await RNFS.unlink(staging).catch(() => {});
  }
}

/**
 * Export a full backup and let the user save it to a location they choose.
 * Uses the document picker's `saveDocuments` (system "save to" dialog) — NOT
 * RN's `Share`, whose `url` is iOS-only and on Android shares only text, which
 * silently produced a bogus non-zip "backup" file.
 */
export async function exportBackup(): Promise<BackupResult> {
  const fileName = `kelomit-backup-${stamp()}.zip`;
  const target = `${RNFS.CachesDirectoryPath}/${fileName}`;
  await writeBackupZip(target);
  try {
    await saveDocuments({
      sourceUris: [`file://${target}`],
      mimeType: 'application/zip',
      fileName,
      copy: true,
    });
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return 'cancelled';
    }
    throw e;
  }
  return 'done';
}

/**
 * Restore from a user-picked backup .zip. Full replace: a pre-restore safety
 * snapshot is written first, then the DB file + media are swapped and the DB is
 * re-initialised (migrations run on the restored data). The app should be
 * restarted afterwards so all in-memory state is rebuilt from the new data.
 */
export async function importBackup(): Promise<BackupResult> {
  let picked;
  try {
    [picked] = await pick({type: [types.zip, types.allFiles]});
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return 'cancelled';
    }
    throw e;
  }

  // Resolve the (possibly content://) uri to a real local file path.
  const [copy] = await keepLocalCopy({
    files: [{uri: picked.uri, fileName: picked.name ?? 'backup.zip'}],
    destination: 'cachesDirectory',
  });
  if (copy.status !== 'success') {
    throw new Error(i18n.t('settings.restoreInvalid'));
  }
  const localZip = uriToPath(copy.localUri);
  if (!(await RNFS.exists(localZip))) {
    throw new Error(`${i18n.t('settings.restoreInvalid')} (${localZip})`);
  }

  const tmp = `${RNFS.CachesDirectoryPath}/kelomit-restore-${Date.now()}`;
  if (await RNFS.exists(tmp)) {
    await RNFS.unlink(tmp);
  }
  await RNFS.mkdir(tmp); // zip-archive needs the destination to exist
  await unzip(localZip, tmp);

  // Validate before touching live data.
  const restoredDb = `${tmp}/kelomit.db`;
  if (!(await RNFS.exists(restoredDb))) {
    await RNFS.unlink(tmp).catch(() => {});
    throw new Error(i18n.t('settings.restoreInvalid'));
  }
  const manifestPath = `${tmp}/manifest.json`;
  if (await RNFS.exists(manifestPath)) {
    try {
      const manifest = JSON.parse(await RNFS.readFile(manifestPath, 'utf8')) as Manifest;
      if (manifest.app !== 'kelomit') {
        throw new Error(i18n.t('settings.restoreInvalid'));
      }
    } catch {
      // Missing/garbled manifest: the kelomit.db presence check above still gates us.
    }
  }

  // Safety net: snapshot current state to persistent storage before overwriting.
  // Not swallowed — if we can't make the safety copy, abort BEFORE any
  // destructive step so a failed restore can never lose the current data.
  const safety = `${RNFS.DocumentDirectoryPath}/kelomit-pre-restore-${stamp()}.zip`;
  await writeBackupZip(safety);

  // Swap. Capture the live DB path before closing the connection.
  stopTracking();
  const liveDbPath = getDB().getDbPath();
  closeDB();

  // Remove the old DB + its WAL/SHM sidecars (stale sidecars corrupt a swapped db).
  for (const f of [liveDbPath, `${liveDbPath}-wal`, `${liveDbPath}-shm`]) {
    if (await RNFS.exists(f)) {
      await RNFS.unlink(f);
    }
  }
  await RNFS.copyFile(restoredDb, liveDbPath);

  // Replace media wholesale.
  if (await RNFS.exists(MEDIA_DIR)) {
    await RNFS.unlink(MEDIA_DIR);
  }
  if (await RNFS.exists(`${tmp}/media`)) {
    await copyDir(`${tmp}/media`, MEDIA_DIR);
  } else {
    await RNFS.mkdir(MEDIA_DIR);
  }

  await RNFS.unlink(tmp).catch(() => {});

  // Re-open + run any migrations the restored DB is behind on.
  await initDB();
  return 'done';
}
