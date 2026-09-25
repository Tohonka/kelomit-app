import RNFS from 'react-native-fs';
import {getDB} from '../db/database';
import {
  getSyncConfig,
  getSyncStatus,
  recordSyncSuccess,
  recordSyncError,
} from './syncSettings';

export type SyncResult = 'done' | 'not_configured' | 'failed';

/** Extensions we push. Video is deliberately excluded for the remote server —
 *  see the design doc; the LAN companion target opts back in. */
export const SYNCABLE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'wav', 'm4a'] as const;
const VIDEO_EXTENSIONS = ['mp4'] as const;

const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/kelomit/media`;
const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Where a push goes. The remote server and the desktop companion are two
 *  targets of the same pipeline: snapshot → media diff → DB upload. */
export interface SyncTarget {
  url: string;
  token: string;
  includeVideo: boolean;
  /** Per-target temp file, so a companion push can't delete the server
   *  sync's snapshot from under it. */
  snapshotPath: string;
  onSuccess: (at: string) => Promise<void>;
  onError: (message: string) => Promise<void>;
}

const SERVER_SNAPSHOT_PATH = `${RNFS.CachesDirectoryPath}/kelomit-sync.db`;

/** Snapshots currently being pushed, keyed by snapshot path. */
const running = new Set<string>();

function isSyncable(name: string, includeVideo: boolean): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    (SYNCABLE_EXTENSIONS as readonly string[]).includes(ext) ||
    (includeVideo && (VIDEO_EXTENSIONS as readonly string[]).includes(ext))
  );
}

/** Consistent snapshot of the live WAL database. Does not close the DB and does
 *  not interrupt tracking, unlike backupService's export. */
async function writeSnapshot(path: string): Promise<void> {
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
  await getDB().execute(`VACUUM INTO '${path}';`);
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
  mp4: 'video/mp4',
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
  target: SyncTarget,
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
    if (
      !item.isFile() ||
      !isSyncable(item.name, target.includeVideo) ||
      present.has(item.name)
    ) {
      continue;
    }
    await upload(item.path, `${target.url}/api/media/${item.name}`, target.token);
  }
}

/** Push everything to `target`. Never throws — failures are reported through
 *  the target's `onError` only. */
export async function runSyncTo(target: SyncTarget): Promise<SyncResult> {
  if (running.has(target.snapshotPath)) {
    // Benign overlap, not a failure — leave the recorded status alone.
    return 'failed';
  }
  running.add(target.snapshotPath);
  try {
    await writeSnapshot(target.snapshotPath);
    const present = await fetchManifest(target.url, target.token);
    // Media first: the DB must never reference a file the server lacks.
    await uploadMissingMedia(target, present);
    await upload(target.snapshotPath, `${target.url}/api/sync`, target.token);
    await target.onSuccess(new Date().toISOString());
    return 'done';
  } catch (e) {
    await target.onError(e instanceof Error ? e.message : String(e));
    return 'failed';
  } finally {
    running.delete(target.snapshotPath);
    if (await RNFS.exists(target.snapshotPath)) {
      await RNFS.unlink(target.snapshotPath).catch(() => {});
    }
  }
}

/** Push everything to the remote server. Never throws — failures are recorded
 *  and surfaced in Settings only. */
export async function runSync(): Promise<SyncResult> {
  const config = await getSyncConfig();
  if (!config) {
    return 'not_configured';
  }
  return runSyncTo({
    url: config.url,
    token: config.token,
    includeVideo: false,
    snapshotPath: SERVER_SNAPSHOT_PATH,
    onSuccess: recordSyncSuccess,
    onError: recordSyncError,
  });
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
