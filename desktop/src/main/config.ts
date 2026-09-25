import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {networkInterfaces} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';

// KELOMIT_PORT: run a dev instance beside the packaged app (which holds 8090).
export const PORT = Number(process.env.KELOMIT_PORT) || 8090;

/** Same layout as the server's /data: current.db, snapshots/, media/. */
export function ensureDataDir(userData: string): string {
  mkdirSync(join(userData, 'media'), {recursive: true});
  mkdirSync(join(userData, 'snapshots'), {recursive: true});
  return userData;
}

function loadOrCreateSecret(dataDir: string, name: string, bytes: number): string {
  const path = join(dataDir, name);
  if (existsSync(path)) {
    return readFileSync(path, 'utf8').trim();
  }
  const value = randomBytes(bytes).toString('base64url');
  writeFileSync(path, value, {mode: 0o600});
  return value;
}

/** The pairing secret, generated once per install. */
export function loadOrCreateToken(dataDir: string): string {
  return loadOrCreateSecret(dataDir, 'token', 24);
}

/** Public per-install id: rides in the QR and in every beacon so the phone
 *  can tell this desktop from a dev instance on the same LAN. */
export function loadOrCreateId(dataDir: string): string {
  return loadOrCreateSecret(dataDir, 'id', 8);
}

/** First non-internal IPv4 — what the phone must dial on the LAN. */
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

export interface PairInfo {
  url: string | null;
  token: string;
  id: string;
  /** What the QR encodes; the phone's scanner parses this. */
  payload: string | null;
}

export function pairInfo(token: string, id: string): PairInfo {
  const ip = lanAddress();
  const url = ip ? `http://${ip}:${PORT}` : null;
  const payload = url
    ? `kelomit://pair?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`
    : null;
  return {url, token, id, payload};
}
