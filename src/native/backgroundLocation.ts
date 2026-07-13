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
