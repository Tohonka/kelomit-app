import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

/**
 * The three macOS signals behind app-use tracking, each a stdlib call:
 *  - frontmost app: `lsappinfo` (LaunchServices CLI, ~7 ms, no TCC prompt —
 *    AppleScript would need Automation permission, get-windows a dependency);
 *  - screensaver / lock screen: loginwindow is the front app, the session is
 *    locked (powerMonitor, read by the collector), and the ScreenSaverEngine
 *    process exists;
 *  - idle: Electron's powerMonitor, read by the collector.
 */
const run = promisify(execFile);

export interface FrontApp {
  bundleId: string;
  name: string;
}

export type TickState = 'away' | 'idle' | 'active';

/** Probed 2026-09-28: the saver runs as this process, and while it is up the
 *  front app is loginwindow and the session reports itself locked. pgrep
 *  matched on only one of two probes, so it is never the only signal. */
export const SCREENSAVER_PROCESS = 'ScreenSaverEngine';
export const LOCK_SCREEN_BUNDLE = 'com.apple.loginwindow';

export function isLockScreen(app: FrontApp | null): boolean {
  return app?.bundleId === LOCK_SCREEN_BUNDLE;
}

/** `lsappinfo info -only name,bundleid <asn>` →
 *  `"Google Chrome" ASN:0x0-0xe00e: (in front)` / `bundleID="com.google.Chrome"`.
 *  Bare processes (no bundle) are keyed by their name. */
export function parseFront(info: string): FrontApp | null {
  const name = /^"(.+?)" ASN:/m.exec(info)?.[1];
  if (!name) return null;
  const bundleId = /bundleID="([^"]+)"/.exec(info)?.[1] ?? name;
  return {bundleId, name};
}

export async function readFront(): Promise<FrontApp | null> {
  try {
    const {stdout: asn} = await run('lsappinfo', ['front'], {timeout: 3000});
    if (!asn.trim()) return null;
    const {stdout: info} = await run('lsappinfo', ['info', '-only', 'name,bundleid', asn.trim()], {timeout: 3000});
    return parseFront(info);
  } catch {
    return null;
  }
}

/** pgrep exits 1 when nothing matches. */
export async function screensaverRunning(): Promise<boolean> {
  try {
    await run('pgrep', ['-x', SCREENSAVER_PROCESS], {timeout: 3000});
    return true;
  } catch {
    return false;
  }
}

export function classify(input: {away: boolean; idleSeconds: number; idleAfter: number}): TickState {
  if (input.away) return 'away';
  return input.idleSeconds >= input.idleAfter ? 'idle' : 'active';
}
