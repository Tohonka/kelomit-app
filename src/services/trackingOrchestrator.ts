import type {SavedLocation} from '../types';
import {
  stopBackgroundLocationService,
  subscribeNativeEventAvailable,
  syncPlaces,
  type MonitoredPlace,
} from '../native/backgroundLocation';
import {startTracking, stopTracking} from './gpsService';
import {reconcileNativeEvents} from './nativeEventSync';
import {reconcileRecentRouteDays} from './routeHistoryService';
import {getSetting, setSetting} from '../db/settings';

const ROUTE_DERIVATION_VERSION = '3';

export interface TrackingState {
  gps_enabled: boolean;
  background_tracking: boolean;
  gps_interval_ms: number;
}

function monitoredPlaces(locations: SavedLocation[]): MonitoredPlace[] {
  return locations.map(location => ({
    id: location.id,
    latitude: location.latitude,
    longitude: location.longitude,
    radius: location.radius_m,
    kind: location.kind,
  }));
}

export async function syncSavedPlaces(locations: SavedLocation[]): Promise<void> {
  await syncPlaces(monitoredPlaces(locations));
}

export async function syncTrackingState(
  settings: TrackingState,
  locations: SavedLocation[],
): Promise<void> {
  if (!settings.gps_enabled) {
    stopTracking();
    await stopBackgroundLocationService();
    return;
  }
  if (settings.background_tracking) {
    await syncSavedPlaces(locations);
  } else {
    await stopBackgroundLocationService();
  }
  await startTracking(settings.gps_interval_ms);
}

export async function reconcileTrackingJournal(): Promise<void> {
  await reconcileNativeEvents();
}

export async function reconcileRouteHistory(): Promise<void> {
  const previous = await getSetting('route_derivation_version');
  const force = previous !== ROUTE_DERIVATION_VERSION;
  await reconcileRecentRouteDays(force);
  if (force) {
    await setSetting('route_derivation_version', ROUTE_DERIVATION_VERSION);
  }
}

export function subscribeTrackingJournal(): {remove: () => void} {
  return subscribeNativeEventAvailable(() => {
    reconcileNativeEvents().catch(() => {});
  });
}
