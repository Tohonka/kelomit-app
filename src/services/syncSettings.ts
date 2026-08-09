import {getSetting, setSetting} from '../db/settings';

export interface SyncConfig {
  url: string;
  token: string;
}

export interface SyncStatus {
  lastAt: string | null;
  lastError: string | null;
}

const MAX_ERROR_LEN = 500;

/** Force https: the token must not travel in cleartext, and the server's
 *  http→https redirect makes Android's OkHttp drop the Authorization header —
 *  an http (or bare-host) URL is a guaranteed 401 with a perfectly good token. */
function normalizeUrl(url: string): string {
  const noSlash = url.replace(/\/+$/, '');
  if (noSlash.startsWith('https://')) {
    return noSlash;
  }
  return `https://${noSlash.replace(/^http:\/\//, '')}`;
}

/** Server URL + token, or null when sync is not configured. */
export async function getSyncConfig(): Promise<SyncConfig | null> {
  const url = (await getSetting('sync_url'))?.trim() ?? '';
  const token = (await getSetting('sync_token'))?.trim() ?? '';
  if (!url || !token) {
    return null;
  }
  return {url: normalizeUrl(url), token};
}

export async function setSyncConfig(url: string, token: string): Promise<void> {
  await setSetting('sync_url', url.trim());
  await setSetting('sync_token', token.trim());
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return {
    lastAt: (await getSetting('sync_last_at')) || null,
    lastError: (await getSetting('sync_last_error')) || null,
  };
}

export async function recordSyncSuccess(at: string): Promise<void> {
  await setSetting('sync_last_at', at);
  await setSetting('sync_last_error', '');
}

export async function recordSyncError(message: string): Promise<void> {
  await setSetting('sync_last_error', message.slice(0, MAX_ERROR_LEN));
}
