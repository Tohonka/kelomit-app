import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'wav', 'm4a'];
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** Hostile input gate: the filename arrives straight off the wire. */
export function isSafeMediaName(name: string): boolean {
  if (!name || name.length > 200 || !SAFE_NAME.test(name) || name.includes('..')) {
    return false;
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext !== name.toLowerCase() && ALLOWED_EXTENSIONS.includes(ext);
}

/** Resolves and validates a media filename into a path under `dataDir`. Throws if unsafe. */
export function mediaPath(dataDir: string, name: string): string {
  if (!isSafeMediaName(name)) {
    throw new Error(`unsafe media name: ${name}`);
  }
  return join(dataDir, 'media', name);
}

/** Lists filenames in the media dir, or `[]` if it doesn't exist yet. */
export function listMedia(dataDir: string): string[] {
  const dir = join(dataDir, 'media');
  return existsSync(dir) ? readdirSync(dir) : [];
}

/** Writes `body` under the media dir as `name`, creating the dir if needed. */
export function saveMedia(dataDir: string, name: string, body: Buffer): void {
  const path = mediaPath(dataDir, name);
  mkdirSync(join(dataDir, 'media'), {recursive: true});
  writeFileSync(path, body);
}
