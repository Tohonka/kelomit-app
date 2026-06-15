import Geolocation from 'react-native-geolocation-service';
import {Platform} from 'react-native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {isOutlier} from './locationUtils';
import {insertGpsPoint} from '../db/gps';
import {getOrCreateDay} from '../db/days';
import {format} from 'date-fns';

export interface KnownPosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number; // ms since epoch
}

let _lastPosition: KnownPosition | null = null;
let _watchId: number | null = null;

export function getLastKnownPosition(): KnownPosition | null {
  return _lastPosition;
}

export async function requestLocationPermission(): Promise<boolean> {
  const perm =
    Platform.OS === 'android'
      ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION
      : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
  const status = await check(perm);
  if (status === RESULTS.GRANTED) {
    return true;
  }
  if (status === RESULTS.DENIED) {
    const result = await request(perm);
    return result === RESULTS.GRANTED;
  }
  return false;
}

export async function startTracking(intervalMs = 60_000): Promise<void> {
  if (_watchId !== null) {
    return; // already running
  }
  const ok = await requestLocationPermission();
  if (!ok) {
    return;
  }
  _watchId = Geolocation.watchPosition(
    pos => {
      handlePosition(pos);
    },
    _err => {
      // Silently ignore individual position errors
    },
    {
      enableHighAccuracy: true,
      distanceFilter: 20, // metres — minimum movement before update
      interval: intervalMs,
      fastestInterval: Math.min(intervalMs, 15_000),
    },
  );
}

export function stopTracking(): void {
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}

async function handlePosition(
  pos: Geolocation.GeoPosition,
): Promise<void> {
  const {latitude, longitude, accuracy} = pos.coords;
  const now = pos.timestamp;

  // Outlier rejection
  if (_lastPosition) {
    const elapsedMs = now - _lastPosition.timestamp;
    if (
      isOutlier(latitude, longitude, _lastPosition.latitude, _lastPosition.longitude, elapsedMs)
    ) {
      return;
    }
  }

  _lastPosition = {latitude, longitude, accuracy: accuracy ?? null, timestamp: now};

  // Persist to DB
  try {
    const todayStr = format(new Date(now), 'yyyy-MM-dd');
    const day = await getOrCreateDay(todayStr);
    await insertGpsPoint({
      day_id: day.id,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      altitude: pos.coords.altitude ?? null,
      speed: pos.coords.speed ?? null,
      timestamp: new Date(now).toISOString(),
    });
  } catch {
    // Don't crash the app on DB write failure
  }
}
