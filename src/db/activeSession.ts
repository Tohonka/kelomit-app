import {getSetting, setSetting} from './settings';
import {
  isWidgetBridgeAvailable,
  nativeGetActiveSession,
  nativeSetActiveSession,
  nativeClearActiveSession,
} from '../native/widgetSession';
import type {ActiveSession} from '../types';

/**
 * Persistence for the single active time-tracking session (Phase 9).
 *
 * When the native widget bridge is present (Phase 9.2 build) the session lives
 * in SharedPreferences so the home-screen widgets and the in-app timer share
 * one source of truth — writes there also repaint the widgets. Otherwise it
 * falls back to a JSON blob in the `settings` key-value table (Phase 9.1): still
 * on-disk SQLite, survives app-kill, no migration. Either way the session
 * *logic* (`sessionLogic.ts`) is unchanged.
 */
const KEY = 'active_session';

export async function readActiveSession(): Promise<ActiveSession | null> {
  if (isWidgetBridgeAvailable()) {
    return nativeGetActiveSession();
  }
  const raw = await getSetting(KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ActiveSession;
  } catch {
    return null;
  }
}

export async function writeActiveSession(session: ActiveSession): Promise<void> {
  if (isWidgetBridgeAvailable()) {
    await nativeSetActiveSession(session);
    return;
  }
  await setSetting(KEY, JSON.stringify(session));
}

export async function clearActiveSession(): Promise<void> {
  if (isWidgetBridgeAvailable()) {
    await nativeClearActiveSession();
    return;
  }
  // Empty string rather than a row delete keeps the read path uniform with the
  // rest of the settings KV (absent / empty both read back as "no session").
  await setSetting(KEY, '');
}
