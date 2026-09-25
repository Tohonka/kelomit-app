import {NativeModules, DeviceEventEmitter} from 'react-native';
import type {EmitterSubscription} from 'react-native';

/**
 * Wrapper over the native `CompanionBeacon` module: listens for the desktop
 * companion's UDP presence beacon while started. Absent on older binaries /
 * jest, where the calls are no-ops and no events arrive.
 */
interface CompanionBeaconNative {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BeaconEvent {
  ip: string;
  port: number;
  id: string;
  name: string;
}

const Native = NativeModules.CompanionBeacon as CompanionBeaconNative | undefined;

export const isCompanionBeaconAvailable = (): boolean => Native != null;

export async function startBeaconListener(): Promise<void> {
  try {
    await Native?.start();
  } catch {
    // Best-effort: discovery is a convenience over the stored URL.
  }
}

export async function stopBeaconListener(): Promise<void> {
  try {
    await Native?.stop();
  } catch {
    // already stopped
  }
}

export function onBeacon(cb: (b: BeaconEvent) => void): EmitterSubscription {
  return DeviceEventEmitter.addListener('companionBeacon', cb);
}
