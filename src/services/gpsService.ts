import Geolocation, {type GeolocationResponse} from '@react-native-community/geolocation';
import {Platform, AppState, type AppStateStatus} from 'react-native';
import {diag} from './diag';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {isOutlier, distanceMeters, isStationaryJitter} from './locationUtils';
import {
  isMoving,
  nextTrackingMode,
  isDuplicateFix,
  fastIntervalForSpeed,
  dedupGapMs,
  FAST_INTERVAL_MS,
  STATIONARY_STREAK_TO_SLOW,
  type TrackingMode,
} from './trackingMode';
import {insertGpsPoint} from '../db/gps';
import {getOrCreateDay} from '../db/days';
import {getLocations} from '../db/locations';
import {recordCrossing} from './crossingStore';
import {startDayDetection, stopDayDetection, runDayDetection} from './dayDetection';
import {useSettingsStore} from '../store/settingsStore';
import {
  isBackgroundLocationAvailable,
  startBackgroundLocationService,
  stopBackgroundLocationService,
  subscribeBackgroundLocation,
  subscribeActivityTransition,
  setBackgroundMode,
  enterParkedNative,
  drainNativeFixBuffer,
  parseFixLine,
  type ParkFence,
  type NativeFix,
} from '../native/backgroundLocation';
import {ensureActivityRecognitionPermission} from './permissionService';
import {format} from 'date-fns';
import type {SavedLocation, Day} from '../types';

// Reject fixes worse than this (metres) from the trail — indoor network fixes
// can read 60-80 m and wander, polluting the path. ponytail: tune on device.
const MAX_TRAIL_ACCURACY_M = 50;

export interface KnownPosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number; // ms since epoch
}

let _lastPosition: KnownPosition | null = null;
// Last point actually written to the trail (gate compares against this, not the
// last *seen* fix, so slow drift can't accumulate into a phantom trail).
let _lastRecordedPosition: KnownPosition | null = null;
// Adaptive sampling state: 'fast' while moving (dense trail), 'slow' while still
// (battery). The watch is re-armed when the mode changes. See trackingMode.ts.
let _trackingMode: TrackingMode = 'fast';
let _stationaryStreak = 0;
let _slowIntervalMs = 60_000; // set from startTracking's arg (the gps_interval_ms setting)
// Current watch config, for change detection (sprint↔walk retunes within
// 'fast' as well as mode changes) and for the interval-scaled dedup gap.
let _currentIntervalMs = FAST_INTERVAL_MS;
let _currentHighAccuracy = true;
let _watchId: number | null = null;
// When background tracking is on, the native FGS runs as an ADDITIONAL source
// alongside the always-on JS watch (both feed handlePosition). See spec 5.8.
let _nativeActive = false;
let _active = false;
let _nativeSub: {remove: () => void} | null = null;
let _activitySub: {remove: () => void} | null = null;
// Wall-clock ms of the last accepted fix, for cross-source dedup.
let _lastAcceptedFixMs = 0;
let _configured = false;
let _lastError: string | null = null;

// Diagnostics: last time ANY fix arrived (pre-dedup) + a watchdog that flags the
// JS watch silently dying (no error callback, no fixes). ponytail: tune on device.
let _lastFixArrivedMs = 0;
let _watchdog: ReturnType<typeof setInterval> | null = null;
let _appStateHooked = false;
const WATCHDOG_MS = 60_000;
const STALL_MS = 3 * 60_000; // no fix for 3 min while actively (non-parked) tracking

// Movement memory: while a trustworthy fix showed real movement this recently,
// refuse the fast→slow power-down. A GPS-lock drought during movement yields
// poor network fixes that read as "stationary"; without this, 3 of them (~12 s)
// dropped us to balanced-power slow, which then can't re-acquire while moving —
// the e-scooter death spiral (2026-07-09). ponytail: tune on device.
const MOVEMENT_MEMORY_MS = 120_000;
// Wall-clock of the last good-accuracy MOVING fix (0 = none this session).
let _lastMovingFixMs = 0;

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

export function getLastKnownPosition(): KnownPosition | null {
  return _lastPosition;
}

export type GeofenceDetection = 'work' | 'home' | 'other' | 'unknown';

/**
 * Which kind of saved place we're currently inside, for the Home-screen
 * "Where am I?" label. Reads live geofence membership (`_insideIds`), advanced
 * by the live-fix producer while the app is foreground. This is a best-effort
 * live indicator only — the authoritative arrive/leave record is the persisted
 * crossing store. 'unknown' right after launch until the first fix.
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
  if (_active) {
    if (_trackingMode === 'parked') {
      // Resume-from-background while parked: re-arm immediately; the ladder
      // will settle back to slow/parked if we're in fact still.
      applyMode('fast', null);
    }
    return; // already running
  }
  const ok = await requestLocationPermission();
  if (!ok) {
    return;
  }
  ensureConfigured();
  await refreshGeofences();
  _slowIntervalMs = intervalMs;
  _trackingMode = 'fast';
  _stationaryStreak = 0;
  _lastAcceptedFixMs = 0;
  _lastMovingFixMs = 0;
  _active = true;
  diag('track.start', `interval=${intervalMs}`);
  startWatchdog();
  hookAppState();

  // JS watch is the always-on baseline — never worse than the pre-5.7 build.
  armWatch(FAST_INTERVAL_MS, true);

  // Native fused location in the foreground service is an ADDITIONAL,
  // Doze-resistant source when background tracking is on. Both feed handlePosition;
  // the dedup gate collapses overlap.
  const wantsBackground = useSettingsStore.getState().background_tracking;
  if (wantsBackground && isBackgroundLocationAvailable()) {
    _nativeActive = true;
    // Best-effort: request ACTIVITY_RECOGNITION here too, so users who already
    // had background tracking on (before AR shipped) still get prompted once.
    // A denial just falls back to GPS-driven movement detection.
    ensureActivityRecognitionPermission().catch(() => {});
    _activitySub = subscribeActivityTransition(handleActivityMoving);
    _nativeSub = subscribeBackgroundLocation(handleNativeFix);
    await startBackgroundLocationService(); // starts at the native default (fast)
    // Import fixes captured while the React context was dead (process restart,
    // app swiped away) — they'd otherwise be a straight line in the trail.
    drainBufferedFixes().catch(() => {});
  }

  startDayDetection().catch(() => {});
}

/** Native activity-recognition reported the user started moving — a sensor-hub
 *  signal that beats GPS to the punch. Treat it as a trusted moving fix and
 *  upgrade to fast immediately, instead of waiting for a good GPS fix to trip
 *  isMoving() (which, in slow mode, can be a full slow-interval away). */
function handleActivityMoving(): void {
  if (!_active) {
    return;
  }
  _lastMovingFixMs = Date.now();
  if (_trackingMode !== 'fast') {
    diag('mode.upgrade', 'by=ar');
    applyMode('fast', null);
  }
}

/** Adapt a native fix into the GeolocationResponse shape handlePosition reads. */
function handleNativeFix(fix: NativeFix): void {
  console.log('[gps] native fix', fix.latitude, fix.longitude, 'spd', fix.speed);
  handlePosition({
    coords: {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy ?? 0,
      altitude: fix.altitude,
      speed: fix.speed,
      altitudeAccuracy: null,
      heading: null,
    },
    timestamp: fix.timestamp,
  } as unknown as GeolocationResponse);
}

/** (Re)create the position watch with the given cadence and power level.
 *  Clears any existing watch first, so it doubles as the re-arm used on a
 *  mode or tier change. All modes use high accuracy; slow mode saves battery
 *  purely via the long interval (low accuracy starved movement detection and
 *  deadlocked the ladder — see applyMode). */
/** Flags the JS watch silently dying: actively tracking (not parked) yet no fix
 *  from either source for STALL_MS. Runs off a JS interval, so it's reliable in
 *  the foreground; the native heartbeat covers the backgrounded case. */
function startWatchdog(): void {
  if (_watchdog !== null) {
    return;
  }
  _watchdog = setInterval(() => {
    if (!_active || _trackingMode === 'parked') {
      return;
    }
    const sinceFix = _lastFixArrivedMs === 0 ? -1 : Date.now() - _lastFixArrivedMs;
    if (sinceFix > STALL_MS) {
      diag('watch.stall', `sinceFixMs=${sinceFix} mode=${_trackingMode} watchId=${_watchId}`);
    }
  }, WATCHDOG_MS);
}

/** Log app foreground/background transitions once — a lens on whether listeners
 *  survive lifecycle events (a stall right after 'active' = re-register bug). */
function hookAppState(): void {
  if (_appStateHooked) {
    return;
  }
  _appStateHooked = true;
  AppState.addEventListener('change', (s: AppStateStatus) => {
    diag('app.state', s, {active: _active, mode: _trackingMode, watchId: _watchId});
    if (s === 'active') {
      runDayDetection();
    }
  });
}

function armWatch(intervalMs: number, highAccuracy: boolean): void {
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
  }
  _currentIntervalMs = intervalMs;
  _currentHighAccuracy = highAccuracy;
  // watchPosition returns the new id synchronously, so there is no async gap
  // between clearing the old watch and assigning the new one (single-threaded JS).
  _watchId = Geolocation.watchPosition(
    pos => {
      handlePosition(pos);
    },
    err => {
      // Individual fixes still aren't fatal, but a silently-swallowed error was
      // exactly the blind spot — record it (code 2=unavailable, 3=timeout).
      diag('watch.error', `code=${err.code}`, {message: err.message});
    },
    {
      enableHighAccuracy: highAccuracy,
      // No provider distanceFilter: it withheld ALL fixes while stationary, so
      // the fix-driven fast→slow downgrade never happened and the watch dead-
      // locked in fast mode (see 5-hour gap 2026-07-08). Fixes now flow at the
      // interval cadence; the trail stays clean via the isStationaryJitter +
      // MAX_TRAIL_ACCURACY_M gate in handlePosition (which already ran per-fix).
      distanceFilter: 0,
      interval: intervalMs,
      fastestInterval: Math.min(intervalMs, 15_000),
    },
  );
  diag('watch.arm', `interval=${intervalMs} highAcc=${highAccuracy}`);
}

/** Apply the desired mode to both sources. Re-arms only when the effective
 *  watch config actually changes (mode change OR sprint↔walk tier change). */
function applyMode(mode: TrackingMode, speed: number | null): void {
  if (mode === 'parked') {
    if (_trackingMode !== 'parked') {
      _trackingMode = 'parked';
      if (_watchId !== null) {
        Geolocation.clearWatch(_watchId);
        _watchId = null;
      }
      // Fence every saved place we're currently inside; 1.25× matches the JS
      // exit hysteresis so the OS wake and processGeofences agree.
      const fences: ParkFence[] = _geofences
        .filter(loc => _insideIds.has(loc.id))
        .map(loc => ({
          id: loc.id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radius: loc.radius_m * 1.25,
        }));
      enterParkedNative(fences);
    }
    return;
  }
  const interval = mode === 'fast' ? fastIntervalForSpeed(speed, _currentIntervalMs) : _slowIntervalMs;
  // Always high accuracy: low-accuracy slow fixes report speed=null + huge
  // accuracy, so JS can't detect movement resuming and never upgrades back to
  // fast (straight-lined commutes 2026-07-10). Battery saving is in the interval.
  const highAccuracy = true;
  if (
    mode !== _trackingMode ||
    interval !== _currentIntervalMs ||
    highAccuracy !== _currentHighAccuracy
  ) {
    _trackingMode = mode;
    armWatch(interval, highAccuracy);
    if (_nativeActive) {
      setBackgroundMode(mode, interval); // also exits native parked state
    }
  }
}

export function stopTracking(): void {
  diag('track.stop', '');
  stopDayDetection();
  if (_watchdog !== null) {
    clearInterval(_watchdog);
    _watchdog = null;
  }
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  if (_nativeActive) {
    _nativeSub?.remove();
    _nativeSub = null;
    _activitySub?.remove();
    _activitySub = null;
    stopBackgroundLocationService();
  }
  _active = false;
  _nativeActive = false;
  _lastAcceptedFixMs = 0;
  _lastMovingFixMs = 0;
  _lastPosition = null;
  _lastRecordedPosition = null;
  _trackingMode = 'fast';
  _stationaryStreak = 0;
  _currentIntervalMs = FAST_INTERVAL_MS;
  _currentHighAccuracy = true;
}

async function handlePosition(
  pos: GeolocationResponse,
): Promise<void> {
  // Two sources (JS watch + native FGS) can both deliver fixes; collapse
  // near-simultaneous duplicates so points/geofences aren't double-counted.
  const arrivedMs = Date.now();
  _lastFixArrivedMs = arrivedMs; // pre-dedup: proves the source is still alive
  if (isDuplicateFix(arrivedMs, _lastAcceptedFixMs, dedupGapMs(_currentIntervalMs))) {
    return;
  }
  _lastAcceptedFixMs = arrivedMs;

  const {latitude, longitude, accuracy} = pos.coords;
  const now = pos.timestamp;
  const speed = pos.coords.speed ?? null;

  // Outlier rejection + movement detection, both relative to the last seen fix.
  let movingNow = isMoving(speed, 0, 0); // first-fix / speed-only case
  if (_lastPosition) {
    const elapsedMs = now - _lastPosition.timestamp;
    const disp = distanceMeters(
      _lastPosition.latitude,
      _lastPosition.longitude,
      latitude,
      longitude,
    );
    if (
      isOutlier(latitude, longitude, _lastPosition.latitude, _lastPosition.longitude, elapsedMs)
    ) {
      return;
    }
    // Displacement only counts as movement between two decent-accuracy fixes;
    // poor network fixes wander tens of metres and would fake motion indoors.
    const trustDisp =
      accuracy != null &&
      accuracy <= MAX_TRAIL_ACCURACY_M &&
      _lastPosition.accuracy != null &&
      _lastPosition.accuracy <= MAX_TRAIL_ACCURACY_M;
    movingNow = isMoving(speed, trustDisp ? disp : 0, elapsedMs);
  }

  _lastPosition = {latitude, longitude, accuracy: accuracy ?? null, timestamp: now};

  // Power ladder: fast (speed-tiered) while moving, slow+balanced while still,
  // parked (zero requests, OS geofence wake) when still inside a saved place
  // with the native FGS running. See trackingMode.ts + spec 5.9.
  _stationaryStreak = movingNow ? 0 : _stationaryStreak + 1;
  // Movement memory: only a trustworthy (good-accuracy) moving fix refreshes it.
  // Poor network fixes (acc > MAX_TRAIL_ACCURACY_M) carry no reliable movement
  // signal, so they neither set nor clear it — that's what stops a lost-lock
  // drought from masquerading as "stationary" and powering us down.
  if (movingNow && accuracy != null && accuracy <= MAX_TRAIL_ACCURACY_M) {
    _lastMovingFixMs = arrivedMs;
  }
  const recentlyMoving =
    _lastMovingFixMs > 0 && arrivedMs - _lastMovingFixMs < MOVEMENT_MEMORY_MS;
  // Park (zero GPS requests; woken by OS geofence-exit + activity-recognition)
  // when the native FGS is running and we're inside a saved place. End-of-day
  // detection no longer depends on live ticks (OS geofence + re-derive), so the
  // old pendingExit guard is gone.
  const canPark = _nativeActive && _insideIds.size > 0;
  const desiredMode = nextTrackingMode(
    _trackingMode,
    movingNow,
    _stationaryStreak,
    canPark,
    recentlyMoving,
  );
  // Confirms the guard on the next device capture: fires only when a would-be
  // downgrade to slow was held off because we moved recently (the fix working).
  if (
    !movingNow &&
    recentlyMoving &&
    _stationaryStreak >= STATIONARY_STREAK_TO_SLOW &&
    desiredMode !== 'slow'
  ) {
    diag('mode.hold', `held ${_trackingMode} sinceMoveMs=${arrivedMs - _lastMovingFixMs}`, {
      streak: _stationaryStreak,
      acc: accuracy,
    });
  }
  applyMode(desiredMode, speed);

  await persistFix(
    latitude,
    longitude,
    accuracy ?? null,
    pos.coords.altitude ?? null,
    pos.coords.speed ?? null,
    now,
  );
}

/** Persist one fix: trail write (jitter + accuracy gated) + geofence/day logic.
 *  Shared by the live pipeline and the native buffer drain. */
async function persistFix(
  latitude: number,
  longitude: number,
  accuracy: number | null,
  altitude: number | null,
  speed: number | null,
  tsMs: number,
): Promise<void> {
  try {
    const iso = new Date(tsMs).toISOString();
    const dayStr = format(new Date(tsMs), 'yyyy-MM-dd');
    const day = await getOrCreateDay(dayStr);
    // Skip the trail write for stationary GPS drift; keep geofence/day logic
    // running on every accepted fix so start/end inference stays responsive.
    const jitter =
      _lastRecordedPosition != null &&
      isStationaryJitter(_lastRecordedPosition, latitude, longitude, accuracy, speed);
    // Drop imprecise fixes from the trail: indoor network fixes wander tens of
    // metres and read as fake movement. Geofence/day logic still uses every fix.
    const lowQuality = accuracy != null && accuracy > MAX_TRAIL_ACCURACY_M;
    if (!jitter && !lowQuality) {
      await insertGpsPoint({
        day_id: day.id,
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        timestamp: iso,
      });
      _lastRecordedPosition = {latitude, longitude, accuracy, timestamp: tsMs};
    }
    await processGeofences(latitude, longitude, day, iso);
  } catch {
    // Don't crash the app on DB write failure
  }
}

/** Import fixes the native service buffered while the React context was dead:
 *  same persistence pipeline as live fixes (trail + geofences + day inference),
 *  but no ladder/dedup — these are historical, not a movement signal. */
async function drainBufferedFixes(): Promise<void> {
  const lines = await drainNativeFixBuffer();
  if (lines.length === 0) {
    return;
  }
  diag('buffer.drain', `lines=${lines.length}`);
  for (const line of lines) {
    const fix = parseFixLine(line);
    if (fix) {
      await persistFix(fix.latitude, fix.longitude, fix.accuracy, fix.altitude, fix.speed, fix.timestamp);
    }
  }
}

/**
 * Secondary crossing producer: detect saved-place enter/exit from the live fix
 * (hysteresis to avoid flapping) and hand each crossing to the store. The store
 * dedups against the OS-geofence producer. NO end-of-day logic here — that lives
 * in dayDetection/endOfDay, re-derived from the persisted crossings.
 */
async function processGeofences(
  lat: number,
  lon: number,
  day: Day,
  iso: string,
): Promise<void> {
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
    } else {
      _insideIds.delete(loc.id);
    }
    await recordCrossing({
      locationId: loc.id,
      dayId: day.id,
      type: nowInside ? 'enter' : 'exit',
      latitude: lat,
      longitude: lon,
      time: iso,
    });
    await runDayDetection();
  }
}
