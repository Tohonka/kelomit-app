import RNFS from 'react-native-fs';
import {getDB} from '../db/database';
import {
  getSyncConfig,
  getSyncStatus,
  recordSyncSuccess,
  recordSyncError,
} from './syncSettings';

export type SyncResult = 'done' | 'not_configured' | 'failed';

/** Extensions we push. Video is deliberately excluded — see the design doc. */
export const SYNCABLE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'wav', 'm4a'] as const;

const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/kelomit/media`;
const SNAPSHOT_PATH = `${RNFS.CachesDirectoryPath}/kelomit-sync.db`;
const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

let running = false;

function isSyncable(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (SYNCABLE_EXTENSIONS as readonly string[]).includes(ext);
}

/** Consistent snapshot of the live WAL database. Does not close the DB and does
 *  not interrupt tracking, unlike backupService's export. */
async function writeSnapshot(): Promise<void> {
  if (await RNFS.exists(SNAPSHOT_PATH)) {
    await RNFS.unlink(SNAPSHOT_PATH);
  }
  await getDB().execute(`VACUUM INTO '${SNAPSHOT_PATH}';`);
}

async function fetchManifest(url: string, token: string): Promise<Set<string>> {
  const res = await fetch(`${url}/api/media/manifest`, {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!res.ok) {
    throw new Error(`manifest failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {files?: string[]};
  return new Set(body.files ?? []);
}

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  db: 'application/octet-stream',
};

function mimeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

async function upload(path: string, toUrl: string, token: string): Promise<void> {
  const filename = path.split('/').pop() ?? 'file';
  const res = await RNFS.uploadFiles({
    toUrl,
    method: 'POST',
    binaryStreamOnly: true,
    headers: {Authorization: `Bearer ${token}`},
    files: [{name: 'file', filename, filepath: path, filetype: mimeFor(filename)}],
  }).promise;
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`upload failed: HTTP ${res.statusCode} ${toUrl}`);
  }
}

async function uploadMissingMedia(
  url: string,
  token: string,
  present: Set<string>,
): Promise<void> {
  let items: Awaited<ReturnType<typeof RNFS.readDir>>;
  try {
    items = await RNFS.readDir(MEDIA_DIR);
  } catch (e) {
    const err = e as {code?: string; message?: string};
    const notFound =
      err.code === 'ENOENT' ||
      /ENOENT|not exist|No such file/i.test(err.message ?? '');
    if (!notFound) {
      throw e;
    }
    // Media directory doesn't exist yet — nothing to upload.
    return;
  }
  for (const item of items) {
    if (!item.isFile() || !isSyncable(item.name) || present.has(item.name)) {
      continue;
    }
    await upload(item.path, `${url}/api/media/${item.name}`, token);
  }
}

/** Push everything to the server. Never throws — failures are recorded and
 *  surfaced in Settings only. */
export async function runSync(): Promise<SyncResult> {
  const config = await getSyncConfig();
  if (!config) {
    return 'not_configured';
  }
  if (running) {
    // Benign overlap, not a failure — leave the recorded status alone.
    return 'failed';
  }
  running = true;
  try {
    await writeSnapshot();
    const present = await fetchManifest(config.url, config.token);
    // Media first: the DB must never reference a file the server lacks.
    await uploadMissingMedia(config.url, config.token, present);
    await upload(SNAPSHOT_PATH, `${config.url}/api/sync`, config.token);
    await recordSyncSuccess(new Date().toISOString());
    return 'done';
  } catch (e) {
    await recordSyncError(e instanceof Error ? e.message : String(e));
    return 'failed';
  } finally {
    running = false;
    if (await RNFS.exists(SNAPSHOT_PATH)) {
      await RNFS.unlink(SNAPSHOT_PATH).catch(() => {});
    }
  }
}

/** Foreground trigger: sync at most every 6 hours. */
export async function maybeAutoSync(): Promise<SyncResult> {
  const {lastAt} = await getSyncStatus();
  if (lastAt) {
    const age = Date.now() - new Date(lastAt).getTime();
    if (Number.isFinite(age) && age < AUTO_SYNC_INTERVAL_MS) {
      return 'done';
    }
  }
  return runSync();
}
