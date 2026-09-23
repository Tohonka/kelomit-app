import {getSetting, setSetting} from '../../db/settings';

/**
 * Desktop companion pairing (plan 2026-09-22). Separate from the remote
 * server's `sync_*` keys: the companion is a LAN peer reached over plain
 * http, so it must not go through `syncSettings.normalizeUrl`'s https
 * coercion.
 */
export interface CompanionConfig {
  url: string;
  token: string;
}

export interface CompanionStatus {
  lastPushAt: string | null;
  lastError: string | null;
}

const MAX_ERROR_LEN = 500;

/** `http://` unless the user typed https; trailing slashes dropped. */
export function normalizeCompanionUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

/** Parses what the desktop's pairing QR encodes:
 *  `kelomit://pair?url=<encoded url>&token=<token>`. Null for anything else. */
export function parsePairPayload(raw: string): CompanionConfig | null {
  const m = /^kelomit:\/\/pair\?(.*)$/i.exec(raw.trim());
  if (!m) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const pair of m[1].split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) {
      continue;
    }
    try {
      params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return null;
    }
  }
  const url = params.url?.trim();
  const token = params.token?.trim();
  if (!url || !token) {
    return null;
  }
  return {url: normalizeCompanionUrl(url), token};
}

export async function getCompanionConfig(): Promise<CompanionConfig | null> {
  const url = (await getSetting('companion_url'))?.trim() ?? '';
  const token = (await getSetting('companion_token'))?.trim() ?? '';
  if (!url || !token) {
    return null;
  }
  return {url: normalizeCompanionUrl(url), token};
}

export async function setCompanionConfig(url: string, token: string): Promise<void> {
  await setSetting('companion_url', url.trim());
  await setSetting('companion_token', token.trim());
}

/* Status lives in memory, not in the settings table: a push that recorded its
 * own result in SQLite would fire the update hook and schedule the next push.
 * ponytail: lost on app restart — the card shows "never pushed" until the next
 * push, which the first write after launch triggers anyway. */
let status: CompanionStatus = {lastPushAt: null, lastError: null};

export async function getCompanionStatus(): Promise<CompanionStatus> {
  return {...status};
}

export async function recordCompanionSuccess(at: string): Promise<void> {
  status = {lastPushAt: at, lastError: null};
}

export async function recordCompanionError(message: string): Promise<void> {
  status = {...status, lastError: message.slice(0, MAX_ERROR_LEN)};
}
