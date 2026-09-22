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
  requestPinWidget(type: string): Promise<boolean>;
  setHabitWidgetState(json: string): Promise<void>;
  getPendingHabitToggles(): Promise<string>;
  clearPendingHabitToggles(): Promise<void>;
  setFoodWidgetState(json: string): Promise<void>;
  getPendingFoodAdds(): Promise<string>;
  clearPendingFoodAdds(): Promise<void>;
  setNagWidgetState(json: string): Promise<void>;
  getPendingNagDones(): Promise<string>;
  clearPendingNagDones(): Promise<void>;
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
  name?: string | null;
}

/** Per-widget mapping chosen in the in-app Widgets settings screen. */
export interface WidgetConfig {
  project_id: number | null;
  activity_type: ActivityType;
  tags: string[];
  name?: string | null;
}

/** Habit widget mapping: which habits fill its slots (≤5, in order). */
export interface HabitWidgetConfig {
  habit_ids: number[];
  show_name?: boolean;
}

/** One widget tap the app hasn't folded into habit_day_overrides yet. */
export interface PendingHabitToggle {
  habit_id: number;
  date: string;
  done: boolean;
}

export type WidgetInfo =
  | {appWidgetId: number; type: 'toggle' | 'full'; config: WidgetConfig | null}
  | {appWidgetId: number; type: 'habits'; config: HabitWidgetConfig | null};

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
  config: WidgetConfig | HabitWidgetConfig,
): Promise<void> {
  await Native?.setWidgetConfig(appWidgetId, JSON.stringify(config));
}

export async function nativeRefreshWidgets(): Promise<void> {
  await Native?.refreshWidgets();
}

/** Ask the launcher to place a new widget (Android pin flow). False = launcher
 *  doesn't support pinning; the caller points the user at the home-screen menu. */
export async function nativeRequestPinWidget(
  type: 'toggle' | 'full' | 'addnote' | 'tracking' | 'habits' | 'food' | 'nag',
): Promise<boolean> {
  return (await Native?.requestPinWidget(type)) ?? false;
}

// ── Habit widget ─────────────────────────────────────────────────────────────

/** Push today's habit states + display metadata; repaints every habit widget. */
export async function nativeSetHabitWidgetState(json: string): Promise<void> {
  await Native?.setHabitWidgetState(json);
}

export async function nativeGetPendingHabitToggles(): Promise<PendingHabitToggle[]> {
  if (!Native) {
    return [];
  }
  try {
    const arr = JSON.parse(await Native.getPendingHabitToggles()) as PendingHabitToggle[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function nativeClearPendingHabitToggles(): Promise<void> {
  await Native?.clearPendingHabitToggles();
}

// ── Food widget ──────────────────────────────────────────────────────────────

/** Push the my-foods list + barcode map; repaints every food widget. */
export async function nativeSetFoodWidgetState(json: string): Promise<void> {
  await Native?.setFoodWidgetState(json);
}

/** Raw queue of widget taps/scans; shape-checked by the caller. */
export async function nativeGetPendingFoodAdds(): Promise<unknown[]> {
  if (!Native) {
    return [];
  }
  try {
    const arr = JSON.parse(await Native.getPendingFoodAdds());
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function nativeClearPendingFoodAdds(): Promise<void> {
  await Native?.clearPendingFoodAdds();
}

// ── Nag widget ───────────────────────────────────────────────────────────────

/** Push the next undone nag occurrence (or null); repaints every nag widget. */
export async function nativeSetNagWidgetState(json: string): Promise<void> {
  await Native?.setNagWidgetState(json);
}

/** Raw queue of widget Done taps; shape-checked by the caller. */
export async function nativeGetPendingNagDones(): Promise<unknown[]> {
  if (!Native) {
    return [];
  }
  try {
    const arr = JSON.parse(await Native.getPendingNagDones());
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function nativeClearPendingNagDones(): Promise<void> {
  await Native?.clearPendingNagDones();
}
