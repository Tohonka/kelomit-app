import {NativeModules} from 'react-native';

/**
 * Wrapper over the native `BackgroundLocation` module: starts/stops the
 * location-typed foreground service that keeps the JS location watch alive while
 * the app is backgrounded (opt-in "Track in background"). Absent on older
 * binaries / jest, where the calls are no-ops.
 */
interface BackgroundLocationNative {
  start(): Promise<void>;
  stop(): Promise<void>;
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
