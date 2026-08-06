import {NativeModules, DeviceEventEmitter} from 'react-native';
import type {ActivityKind, ActivityTransition} from '../types';

/**
 * Wrapper over the native `BackgroundLocation` module: starts/stops the
 * location-typed foreground service that keeps the JS location watch alive while
 * the app is backgrounded (opt-in "Track in background"). Absent on older
 * binaries / jest, where the calls are no-ops.
 */
interface BackgroundLocationNative {
  start(slowIntervalMs: number): Promise<void>;
  stop(): Promise<void>;
  syncPlaces(places: MonitoredPlace[]): Promise<void>;
  readNativeEvents(): Promise<string[]>;
  ackNativeEvents(sequence: number): Promise<void>;
  respondToDayEnd(token: string, confirmed: boolean): Promise<void>;
  readFixBuffer(): Promise<string[]>;
  ackFixBuffer(count: number): Promise<void>;
  getTrackingPauseState(): Promise<{pausedUntilMs: number}>;
  setTrackingPause(untilMs: number): Promise<void>;
  expirePauseIfDue(): Promise<{pausedUntilMs: number}>;
  /** Build-time Google Maps key (from .maps.env), exposed as a native constant. */
  mapsApiKey?: string;
}

const Native = NativeModules.BackgroundLocation as BackgroundLocationNative | undefined;

/** The app's Google Maps key, reused for the Places lookup. Empty when the
 *  key file was absent at build time, or on jest / older binaries. */
export const getMapsApiKey = (): string => Native?.mapsApiKey ?? '';

export const isBackgroundLocationAvailable = (): boolean => Native != null;

export async function startBackgroundLocationService(slowIntervalMs: number): Promise<void> {
  try {
    await Native?.start(slowIntervalMs);
  } catch {
    // Best-effort; never crash over the keep-alive service.
  }
}

export async function stopBackgroundLocationService(): Promise<void> {
  try {
    await Native?.stop();
  } catch {
    // ignore
  }
}

export interface NativeFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  timestamp: number; // ms since epoch
}

/** Parse one native buffer JSONL line (see LocationService.bufferFix) into a
 *  fix; null when malformed. */
export function parseFixLine(line: string): NativeFix | null {
  try {
    const v = JSON.parse(line);
    if (typeof v?.latitude !== 'number' || typeof v?.longitude !== 'number' ||
        typeof v?.timestamp !== 'number') {
      return null;
    }
    return {
      latitude: v.latitude,
      longitude: v.longitude,
      accuracy: typeof v.accuracy === 'number' ? v.accuracy : null,
      altitude: typeof v.altitude === 'number' ? v.altitude : null,
      speed: typeof v.speed === 'number' ? v.speed : null,
      timestamp: v.timestamp,
    };
  } catch {
    return null;
  }
}

/** Fixes buffered while React was dead. Read is non-destructive; acknowledge
 * only after SQLite persistence succeeds. */
export async function readNativeFixBuffer(): Promise<string[]> {
  try {
    return (await Native?.readFixBuffer?.()) ?? [];
  } catch {
    return [];
  }
}

export async function ackNativeFixBuffer(count: number): Promise<void> {
  await Native?.ackFixBuffer?.(count);
}

/** Subscribe to native background fixes. Returns a remover. */
export function subscribeBackgroundLocation(
  cb: (fix: NativeFix) => void,
): {remove: () => void} {
  return DeviceEventEmitter.addListener('onBackgroundLocation', cb);
}

export interface MonitoredPlace {
  id: number;
  latitude: number;
  longitude: number;
  radius: number; // metres (native floors this to >=100 for OS reliability)
  kind: string;
}

export type NativeJournalEvent =
  | {
      sequence: number;
      type: 'crossing';
      locationId: number;
      kind: 'work' | 'home' | 'other';
      direction: 'enter' | 'exit';
      timestamp: number;
      localDate: string;
      generation: number;
      latitude: number | null;
      longitude: number | null;
    }
  | {
      sequence: number;
      type: 'activity';
      activity: ActivityKind;
      transition: ActivityTransition;
      timestamp: number;
    }
  | {
      sequence: number;
      type: 'day_end_prompted' | 'day_end_confirmed' | 'day_end_rejected' |
        'day_end_assumed' | 'day_end_cancelled';
      token: string;
      exitTimestamp: number;
      timestamp: number;
    };

const dayEndTypes = new Set([
  'day_end_prompted',
  'day_end_confirmed',
  'day_end_rejected',
  'day_end_assumed',
  'day_end_cancelled',
]);
const activityKinds = new Set<ActivityKind>([
  'still',
  'walking',
  'running',
  'on_foot',
  'bicycle',
  'vehicle',
]);
const activityTransitions = new Set<ActivityTransition>(['enter', 'exit']);

export function parseNativeEvent(line: string): NativeJournalEvent | null {
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== 'object') return null;
    const event = value as Record<string, unknown>;
    if (!Number.isSafeInteger(event.sequence) ||
        typeof event.timestamp !== 'number') {
      return null;
    }
    if (event.type === 'crossing') {
      if (!Number.isSafeInteger(event.locationId) ||
          !['work', 'home', 'other'].includes(String(event.kind)) ||
          !['enter', 'exit'].includes(String(event.direction)) ||
          typeof event.localDate !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(event.localDate) ||
          !Number.isSafeInteger(event.generation) ||
          !(event.latitude === null || typeof event.latitude === 'number') ||
          !(event.longitude === null || typeof event.longitude === 'number')) {
        return null;
      }
      return event as NativeJournalEvent;
    }
    if (event.type === 'activity') {
      if (
        typeof event.activity !== 'string' ||
        !activityKinds.has(event.activity as ActivityKind) ||
        typeof event.transition !== 'string' ||
        !activityTransitions.has(event.transition as ActivityTransition)
      ) {
        return null;
      }
      return event as NativeJournalEvent;
    }
    if (typeof event.type === 'string' && dayEndTypes.has(event.type) &&
        typeof event.token === 'string' && event.token.length > 0 &&
        typeof event.exitTimestamp === 'number') {
      return event as NativeJournalEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the complete native saved-place set. Task 3 adds OS registration. */
export async function syncPlaces(places: MonitoredPlace[]): Promise<void> {
  await Native?.syncPlaces?.(places);
}

export async function readNativeEvents(): Promise<string[]> {
  return (await Native?.readNativeEvents?.()) ?? [];
}

export async function ackNativeEvents(sequence: number): Promise<void> {
  await Native?.ackNativeEvents?.(sequence);
}

export async function respondToDayEnd(
  token: string,
  confirmed: boolean,
): Promise<void> {
  await Native?.respondToDayEnd?.(token, confirmed);
}

export function subscribeNativeEventAvailable(
  cb: () => void,
): {remove: () => void} {
  return DeviceEventEmitter.addListener('onNativeEventAvailable', cb);
}

/** JS-side stand-in for Kotlin's Long.MAX_VALUE (not Double-safe): any value at
 *  or above this means "paused until resumed". Kotlin stores what we pass. */
export const INDEFINITE_PAUSE_MS = 2 ** 62;

export async function getTrackingPauseState(): Promise<{pausedUntilMs: number}> {
  if (!Native) {
    return {pausedUntilMs: 0};
  }
  return Native.getTrackingPauseState();
}

export async function setTrackingPause(untilMs: number): Promise<void> {
  await Native?.setTrackingPause(untilMs);
}

export async function expirePauseIfDue(): Promise<{pausedUntilMs: number}> {
  if (!Native) {
    return {pausedUntilMs: 0};
  }
  return Native.expirePauseIfDue();
}
