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

/** The pairing secret, generated once per install. */
export function loadOrCreateToken(dataDir: string): string {
  const path = join(dataDir, 'token');
  if (existsSync(path)) {
    return readFileSync(path, 'utf8').trim();
  }
  const token = randomBytes(24).toString('base64url');
  writeFileSync(path, token, {mode: 0o600});
  return token;
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
  /** What the QR encodes; the phone's scanner parses this. */
  payload: string | null;
}

export function pairInfo(token: string): PairInfo {
  const ip = lanAddress();
  const url = ip ? `http://${ip}:${PORT}` : null;
  const payload = url
    ? `kelomit://pair?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`
    : null;
  return {url, token, payload};
}
