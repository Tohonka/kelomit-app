import {NativeModules} from 'react-native';
import type {ActiveSession, ActivityType} from '../types';

/**
 * Typed JS wrapper over the native `WidgetSession` module (Iteration 3 Phase
 * 9.2). The native side is the single source of truth for the active session
 * (SharedPreferences), so the in-app quick timer and the home-screen widgets
 * stay in sync. Values cross the bridge as JSON strings.
 *
 * The module is only present in a native build that includes Phase 9.2. When
 * it's absent (e.g. a JS-only reload on an older binary, or jest), callers fall
 * back to the settings-table store — see `db/activeSession.ts`.
 */
interface WidgetSessionNative {
  getActiveSession(): Promise<string | null>;
  setActiveSession(json: string): Promise<void>;
  clearActiveSession(): Promise<void>;
  getPendingSessions(): Promise<string>;
  clearPendingSessions(): Promise<void>;
  setWidgetConfig(appWidgetId: number, json: string): Promise<void>;
  getWidgets(): Promise<string>;
  refreshWidgets(): Promise<void>;
}

const Native = NativeModules.WidgetSession as WidgetSessionNative | undefined;

export const isWidgetBridgeAvailable = (): boolean => Native != null;

/** A finished session captured by a widget while RN wasn't running. */
export interface PendingSession {
  started_at: string;
  ended_at: string;
  project_id: number | null;
  activity_type: ActivityType;
  tags: string[];
  title: string | null;
}

/** Per-widget mapping chosen in the in-app Widgets settings screen. */
export interface WidgetConfig {
  project_id: number | null;
  activity_type: ActivityType;
  tags: string[];
}

export interface WidgetInfo {
  appWidgetId: number;
  type: 'toggle' | 'full';
  config: WidgetConfig | null;
}

export async function nativeGetActiveSession(): Promise<ActiveSession | null> {
  if (!Native) {
    return null;
  }
  const raw = await Native.getActiveSession();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ActiveSession;
  } catch {
    return null;
  }
}

export async function nativeSetActiveSession(session: ActiveSession): Promise<void> {
  await Native?.setActiveSession(JSON.stringify(session));
}

export async function nativeClearActiveSession(): Promise<void> {
  await Native?.clearActiveSession();
}

export async function nativeGetPendingSessions(): Promise<PendingSession[]> {
  if (!Native) {
    return [];
  }
  const raw = await Native.getPendingSessions();
  try {
    const arr = JSON.parse(raw) as PendingSession[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function nativeClearPendingSessions(): Promise<void> {
  await Native?.clearPendingSessions();
}

export async function nativeGetWidgets(): Promise<WidgetInfo[]> {
  if (!Native) {
    return [];
  }
  const raw = await Native.getWidgets();
  try {
    const arr = JSON.parse(raw) as WidgetInfo[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function nativeSetWidgetConfig(
  appWidgetId: number,
  config: WidgetConfig,
): Promise<void> {
  await Native?.setWidgetConfig(appWidgetId, JSON.stringify(config));
}

export async function nativeRefreshWidgets(): Promise<void> {
  await Native?.refreshWidgets();
}
