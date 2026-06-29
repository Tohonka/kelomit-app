import Geolocation, {type GeolocationResponse} from '@react-native-community/geolocation';
import {Platform} from 'react-native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {isOutlier, distanceMeters} from './locationUtils';
import {insertGpsPoint} from '../db/gps';
import {getOrCreateDay, updateDay} from '../db/days';
import {getLocations, insertGeofenceEvent} from '../db/locations';
import {evaluateEndOfDay, initialEodState, type EodEvent, type EodState} from './endOfDay';
import {createDayEndConfirmation} from '../db/dayConfirmations';
import {displayDayEndConfirmation} from './notificationService';
import {useSettingsStore} from '../store/settingsStore';
import {usualHoursForDate} from '../utils/usualHours';
import {format} from 'date-fns';
import type {SavedLocation, Day} from '../types';

export interface KnownPosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number; // ms since epoch
}

let _lastPosition: KnownPosition | null = null;
let _watchId: number | null = null;
let _configured = false;
let _lastError: string | null = null;

/** Human-readable detail of the most recent one-shot location failure, for
 *  surfacing in the UI while diagnosing device issues. */
export function getLastPositionError(): string | null {
  return _lastError;
}

/** Configure the geolocation module once. We handle runtime permissions
 *  ourselves via react-native-permissions, so skip the library's own prompt.
 *  Request the **fused Play Services** provider explicitly: the library's
 *  `'auto'` value is a no-op (it never auto-detects Play Services — it just
 *  leaves the default plain-Android GPS-only manager, which can't get a fix
 *  indoors). With `'playServices'` the lib checks availability and uses fused
 *  location when present (instant indoor fixes, like Google Maps), and falls
 *  back to the Android provider on devices without Play Services. */
function ensureConfigured(): void {
  if (_configured) {
    return;
  }
  Geolocation.setRNConfiguration({skipPermissionRequests: true, locationProvider: 'playServices'});
  _configured = true;
}

// Geofencing state
let _geofences: SavedLocation[] = [];
const _insideIds = new Set<number>();

// End-of-day inference state (reset per day). See endOfDay.ts.
let _eod: EodState = initialEodState();
let _eodDay: string | null = null;

/** Feed a geofence event to the end-of-day reducer and apply its decision.
 *  Auto-fills the day's end only when empty (never overwrites a user value). */
async function applyEndOfDay(event: EodEvent, iso: string, day: Day): Promise<void> {
  const s = useSettingsStore.getState();
  const usualEnd = usualHoursForDate(day.date, s.usual_start, s.usual_end, s.weekday_hours).end;
  const {state, action} = evaluateEndOfDay(_eod, {
    event,
    now: iso,
    dayDate: day.date,
    usualEnd,
    endedAtSet: !!day.ended_at,
    dayStarted: !!day.started_at,
  });
  _eod = state;
  if (action.type === 'commit' && !day.ended_at) {
    await updateDay(day.id, {ended_at: action.time});
    day.ended_at = action.time;
    // When the inferred end is > 1 h off the usual time, ask the user to
    // confirm — log a pending row + post a Yes/No notification. The in-app
    // banner mirrors the same row for when the notification is missed.
    if (action.confirm) {
      try {
        const confirmationId = await createDayEndConfirmation(day.id, action.time);
        await displayDayEndConfirmation(day.id, action.time, confirmationId);
      } catch {
        // Confirmation is best-effort; never break tracking over it.
      }
    }
  }
}

export function getLastKnownPosition(): KnownPosition | null {
  return _lastPosition;
}

export type GeofenceDetection = 'work' | 'home' | 'other' | 'unknown';

/**
 * Which kind of saved place we're currently inside, for the Home-screen
 * "Where am I?" diagnostic. Reads the live geofence membership (updated on each
 * position fix while the app is foreground). Prefers work > home > other; falls
 * back to 'unknown' when not inside any saved place. Note tracking is
 * foreground-only, so this is 'unknown' right after launch until the first fix.
 */
export function getCurrentGeofenceDetection(): GeofenceDetection {
  const insideKinds = _geofences
    .filter(loc => _insideIds.has(loc.id))
    .map(loc => loc.kind);
  if (insideKinds.includes('work')) {
    return 'work';
  }
  if (insideKinds.includes('home')) {
    return 'home';
  }
  if (insideKinds.includes('other')) {
    return 'other';
  }
  return 'unknown';
}

/** Reload saved geofence locations into memory. Call after editing locations. */
export async function refreshGeofences(): Promise<void> {
  try {
    _geofences = await getLocations();
  } catch {
    // ignore
  }
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

function toKnown(pos: GeolocationResponse): KnownPosition {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    timestamp: pos.timestamp,
  };
}

/** A single getCurrentPosition attempt, wrapped with a JS-side timeout so it can
 *  never hang (the library's fused path doesn't always honour its own timeout).
 *  `getCurrentPosition` uses one-shot mechanisms that don't clash with the
 *  continuous tracking watch, so this is safe to call while tracking. */
function tryGet(highAccuracy: boolean, timeoutMs: number, maximumAge: number): Promise<KnownPosition | null> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (val: KnownPosition | null) => {
      if (!settled) { settled = true; resolve(val); }
    };
    const timer = setTimeout(() => {
      if (!_lastError) { _lastError = `${highAccuracy ? 'high' : 'low'}-accuracy request timed out`; }
      finish(null);
    }, timeoutMs + 2_000);
    Geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); finish(toKnown(pos)); },
      err => {
        _lastError = `getCurrentPosition code=${err?.code} ${err?.message ?? ''}`.trim();
        clearTimeout(timer);
        finish(null);
      },
      {enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge},
    );
  });
}

/**
 * One-shot current position (works even when continuous tracking is off).
 * Real devices often can't get a high-accuracy GPS fix indoors, so we:
 *  1. Try high accuracy (GPS) briefly — accurate outdoors.
 *  2. Fall back to low accuracy (network/wifi/cell) — works indoors, fast, and
 *     plenty precise for a geofence centre.
 *  3. Fall back to the last fix continuous tracking has seen.
 */
export async function getCurrentPositionOnce(): Promise<KnownPosition | null> {
  _lastError = null;
  const ok = await requestLocationPermission();
  if (!ok) {
    _lastError = 'location permission not granted';
    return null;
  }
  ensureConfigured();

  let pos = await tryGet(true, 15_000, 300_000); // GPS — outdoors
  if (pos) {
    return pos;
  }
  pos = await tryGet(false, 15_000, 600_000); // network — indoors
  if (pos) {
    return pos;
  }

  if (_lastPosition) {
    return _lastPosition;
  }
  if (!_lastError) {
    _lastError = 'no location available';
  }
  return null;
}

export async function startTracking(intervalMs = 60_000): Promise<void> {
  if (_watchId !== null) {
    return; // already running
  }
  const ok = await requestLocationPermission();
  if (!ok) {
    return;
  }
  ensureConfigured();
  await refreshGeofences();
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
  pos: GeolocationResponse,
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

  // Persist to DB + run geofence detection
  try {
    const iso = new Date(now).toISOString();
    const todayStr = format(new Date(now), 'yyyy-MM-dd');
    const day = await getOrCreateDay(todayStr);
    await insertGpsPoint({
      day_id: day.id,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      altitude: pos.coords.altitude ?? null,
      speed: pos.coords.speed ?? null,
      timestamp: iso,
    });
    await processGeofences(latitude, longitude, day, iso);
  } catch {
    // Don't crash the app on DB write failure
  }
}

/**
 * Detect enter/leave transitions for saved locations (with hysteresis to avoid
 * flapping). Every crossing is logged. For 'work' locations, the day's start time
 * is auto-filled on arrival and end time on leaving — but only when empty, so a
 * user-entered value is never overwritten.
 */
async function processGeofences(
  lat: number,
  lon: number,
  day: Day,
  iso: string,
): Promise<void> {
  // Reset end-of-day state when the day rolls over.
  if (_eodDay !== day.date) {
    _eod = initialEodState();
    _eodDay = day.date;
  }

  for (const loc of _geofences) {
    const dist = distanceMeters(lat, lon, loc.latitude, loc.longitude);
    const wasInside = _insideIds.has(loc.id);
    let nowInside = wasInside;
    if (!wasInside && dist <= loc.radius_m) {
      nowInside = true;
    } else if (wasInside && dist > loc.radius_m * 1.25) {
      nowInside = false;
    }
    if (nowInside === wasInside) {
      continue;
    }

    if (nowInside) {
      _insideIds.add(loc.id);
      await insertGeofenceEvent({
        location_id: loc.id,
        day_id: day.id,
        event_type: 'enter',
        latitude: lat,
        longitude: lon,
        timestamp: iso,
      });
      if (loc.kind === 'work') {
        // Arrival at work still auto-fills the day start (only when empty).
        if (!day.started_at) {
          await updateDay(day.id, {started_at: iso});
          day.started_at = iso;
        }
        await applyEndOfDay('work_enter', iso, day);
      } else if (loc.kind === 'home') {
        await applyEndOfDay('home_enter', iso, day);
      }
    } else {
      _insideIds.delete(loc.id);
      await insertGeofenceEvent({
        location_id: loc.id,
        day_id: day.id,
        event_type: 'exit',
        latitude: lat,
        longitude: lon,
        timestamp: iso,
      });
      if (loc.kind === 'work') {
        // End-of-day is now inferred (usual-time / 1 h / home rules), not
        // stamped blindly on every work exit. See endOfDay.ts.
        await applyEndOfDay('work_exit', iso, day);
      }
    }
  }

  // Resolve the "still away > 1 h" rule on every fix (timestamp-driven, no timer).
  await applyEndOfDay('tick', iso, day);
}
