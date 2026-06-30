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
  setInterval(ms: number): Promise<void>;
}

const Native = NativeModules.BackgroundLocation as BackgroundLocationNative | undefined;

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

/** Retune the running service's request cadence (fast while moving / slow while
 *  still). No-op on binaries without the native module. */
export function setBackgroundInterval(ms: number): void {
  try {
    Native?.setInterval?.(ms)?.catch(() => {});
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
