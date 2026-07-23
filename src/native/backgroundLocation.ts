import {NativeModules, DeviceEventEmitter} from 'react-native';

/**
 * Wrapper over the native `BackgroundLocation` module: starts/stops the
 * location-typed foreground service that keeps the JS location watch alive while
 * the app is backgrounded (opt-in "Track in background"). Absent on older
 * binaries / jest, where the calls are no-ops.
 */
interface BackgroundLocationNative {
  start(): Promise<void>;
  stop(): Promise<void>;
  setMode(mode: string, ms: number): Promise<void>;
  enterParked(fences: ParkFence[]): Promise<void>;
  syncPlaces(places: MonitoredPlace[]): Promise<void>;
  readNativeEvents(): Promise<string[]>;
  ackNativeEvents(sequence: number): Promise<void>;
  drainFixBuffer(): Promise<string[]>;
  /** Build-time Google Maps key (from .maps.env), exposed as a native constant. */
  mapsApiKey?: string;
}

const Native = NativeModules.BackgroundLocation as BackgroundLocationNative | undefined;

/** The app's Google Maps key, reused for the Places lookup. Empty when the
 *  key file was absent at build time, or on jest / older binaries. */
export const getMapsApiKey = (): string => Native?.mapsApiKey ?? '';

/** A saved location to fence while parked (radius already includes the
 *  exit hysteresis multiplier). */
export interface ParkFence {
  id: number;
  latitude: number;
  longitude: number;
  radius: number; // metres
}

export const isBackgroundLocationAvailable = (): boolean => Native != null;

export async function startBackgroundLocationService(): Promise<void> {
  try {
    await Native?.start();
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

/** Retune the running service: cadence + power priority (fast = high accuracy,
 *  slow = balanced power). Also exits native parked state if active. No-op on
 *  binaries without the native method. */
export function setBackgroundMode(mode: 'fast' | 'slow', ms: number): void {
  try {
    Native?.setMode?.(mode, ms)?.catch(() => {});
  } catch {
    // ignore
  }
}

/** Park: native drops its location request and arms OS geofence-exit wakes on
 *  the given fences. The FGS stays alive (idle) to receive the wake. */
export function enterParkedNative(fences: ParkFence[]): void {
  try {
    Native?.enterParked?.(fences)?.catch(() => {});
  } catch {
    // ignore
  }
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

/** Fixes buffered natively while the React context was dead (JSONL lines, in
 *  arrival order; the native file is deleted on drain). Empty on jest / older
 *  binaries / no buffer. */
export async function drainNativeFixBuffer(): Promise<string[]> {
  try {
    return (await Native?.drainFixBuffer?.()) ?? [];
  } catch {
    return [];
  }
}

/** Subscribe to native background fixes. Returns a remover. */
export function subscribeBackgroundLocation(
  cb: (fix: NativeFix) => void,
): {remove: () => void} {
  return DeviceEventEmitter.addListener('onBackgroundLocation', cb);
}

export interface ActivityEvent {
  moving: boolean; // always true today — we only register ENTER-moving transitions
  timestamp: number;
}

/** Subscribe to native activity-recognition "started moving" events (sensor-hub
 *  signal, faster than a GPS fix). Returns a remover. */
export function subscribeActivityTransition(
  cb: (e: ActivityEvent) => void,
): {remove: () => void} {
  return DeviceEventEmitter.addListener('onActivityTransition', cb);
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

export interface CrossingEvent {
  locationId: number;
  type: 'enter' | 'exit';
  latitude: number | null;
  longitude: number | null;
  timestamp: number; // ms since epoch
}

/** Persist the complete native saved-place set. Task 3 adds OS registration. */
export async function syncPlaces(places: MonitoredPlace[]): Promise<void> {
  await Native?.syncPlaces?.(places);
}

/** Temporary name retained until the old JS workday engine is deleted. */
export const monitorPlaces = syncPlaces;

export async function readNativeEvents(): Promise<string[]> {
  return (await Native?.readNativeEvents?.()) ?? [];
}

export async function ackNativeEvents(sequence: number): Promise<void> {
  await Native?.ackNativeEvents?.(sequence);
}

export function subscribeNativeEventAvailable(
  cb: () => void,
): {remove: () => void} {
  return DeviceEventEmitter.addListener('onNativeEventAvailable', cb);
}

/** Subscribe to OS geofence crossings (enter/exit of a saved place). */
export function subscribeGeofenceCrossing(
  cb: (e: CrossingEvent) => void,
): {remove: () => void} {
  return DeviceEventEmitter.addListener('onGeofenceCrossing', cb);
}
