# GPS Power Ladder Implementation Plan (iter 5.9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-state tracking ladder (fast/slow/parked) that stops all location requests while parked at a saved place, waking via native OS geofence exit; plus speed-tiered fast rate and drive instrumentation.

**Architecture:** Pure mode logic lives in `src/services/trackingMode.ts` (TDD'd). `src/services/gpsService.ts` applies the mode to both sources. The native `LocationService.kt` gains priority-aware requests, a parked state with `GeofencingClient` exit fences, and a wake receiver. Spec: `docs/superpowers/specs/2026-07-03-gps-power-ladder-design.md`.

**Tech Stack:** React Native (TS, Jest), Kotlin FGS, `play-services-location:21.3.0` (already a direct dependency — GeofencingClient included, **no new deps**).

## Global Constraints

- Parked state requires background tracking ON (`_nativeActive`); foreground-only mode keeps today's fast/slow behavior.
- Knob values verbatim from spec: `SPRINT_SPEED_MS = 3.0`, `SPRINT_INTERVAL_MS = 2000`, `FAST_INTERVAL_MS = 4000`, park after `STATIONARY_STREAK_TO_SLOW + 2 = 5` still fixes, geofence radius sent to native = `radius_m × 1.25`, dedup gap = `min(MIN_FIX_GAP_MS, interval/2)`.
- Each knob keeps/gets a `ponytail: tune on device` comment.
- Run `npm run check` before every commit (typecheck + lint + 103 tests must stay green).
- Kotlin/manifest changes take effect only after rebuild + uninstall→reinstall (user does this; never claim device-verified).
- JS must stay no-op-safe on binaries without the new native methods (optional-call pattern already used in `src/native/backgroundLocation.ts`).

---

### Task 1: Three-state ladder + speed tier + dedup scaling in trackingMode.ts (TDD)

**Files:**
- Modify: `src/services/trackingMode.ts`
- Test: `__tests__/trackingMode.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 3 relies on these exact names):
  - `type TrackingMode = 'fast' | 'slow' | 'parked'`
  - `const FAST_INTERVAL_MS = 4_000` (moved here from gpsService), `SPRINT_INTERVAL_MS = 2_000`, `SPRINT_SPEED_MS = 3.0`, `STREAK_TO_PARK = STATIONARY_STREAK_TO_SLOW + 2`
  - `fastIntervalForSpeed(speed: number | null): number`
  - `nextTrackingMode(prev: TrackingMode, movingNow: boolean, stationaryStreak: number, canPark?: boolean): TrackingMode` (canPark defaults to `false` so the old 3-arg call in gpsService still compiles until Task 3)
  - `dedupGapMs(intervalMs: number): number`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/trackingMode.test.ts` (and add `fastIntervalForSpeed`, `dedupGapMs`, `STREAK_TO_PARK`, `SPRINT_INTERVAL_MS`, `FAST_INTERVAL_MS` to the import):

```ts
describe('nextTrackingMode – parked', () => {
  it('parks when still long enough inside a saved fence (canPark)', () => {
    expect(nextTrackingMode('slow', false, STREAK_TO_PARK, true)).toBe('parked');
  });

  it('does not park without canPark (bg tracking off / outside fences)', () => {
    expect(nextTrackingMode('slow', false, STREAK_TO_PARK, false)).toBe('slow');
  });

  it('does not park before the park streak even inside a fence', () => {
    expect(nextTrackingMode('slow', false, STREAK_TO_PARK - 1, true)).toBe('slow');
  });

  it('wakes straight to fast from parked on movement', () => {
    expect(nextTrackingMode('parked', true, 0, true)).toBe('fast');
  });

  it('stays parked while still inside the fence', () => {
    expect(nextTrackingMode('parked', false, STREAK_TO_PARK + 5, true)).toBe('parked');
  });
});

describe('fastIntervalForSpeed', () => {
  it('uses the sprint interval at scooter speed', () => {
    expect(fastIntervalForSpeed(7)).toBe(SPRINT_INTERVAL_MS); // 25 km/h
  });

  it('uses the normal fast interval at walking speed', () => {
    expect(fastIntervalForSpeed(1.4)).toBe(FAST_INTERVAL_MS);
  });

  it('uses the normal fast interval when speed is unknown', () => {
    expect(fastIntervalForSpeed(null)).toBe(FAST_INTERVAL_MS);
  });

  it('sprints exactly at the threshold', () => {
    expect(fastIntervalForSpeed(3.0)).toBe(SPRINT_INTERVAL_MS);
  });
});

describe('dedupGapMs', () => {
  it('is half the interval when that is under the cap (sprint)', () => {
    expect(dedupGapMs(2000)).toBe(1000);
  });

  it('caps at MIN_FIX_GAP_MS for slow intervals', () => {
    expect(dedupGapMs(60_000)).toBe(MIN_FIX_GAP_MS);
  });

  it('equals the cap at the normal fast interval (unchanged behavior)', () => {
    expect(dedupGapMs(4000)).toBe(2000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/trackingMode.test.ts`
Expected: FAIL — `fastIntervalForSpeed is not a function` / parked cases failing.

- [ ] **Step 3: Implement in `src/services/trackingMode.ts`**

Change the type and add below the existing consts:

```ts
export type TrackingMode = 'fast' | 'slow' | 'parked';

// Speed-tiered fast rate: above SPRINT_SPEED_MS (scooter/bike/car) sample at
// SPRINT_INTERVAL_MS so corners aren't cut (25 km/h × 4 s ≈ 28 m between fixes).
// ponytail: tune on device.
export const SPRINT_SPEED_MS = 3.0; // m/s (~11 km/h)
export const SPRINT_INTERVAL_MS = 2_000;
export const FAST_INTERVAL_MS = 4_000;

// Still fixes before fully parking (only inside a saved geofence with the
// native FGS running): STATIONARY_STREAK_TO_SLOW to reach slow, then 2 more
// slow-cadence fixes (~2 min). ponytail: tune on device.
export const STREAK_TO_PARK = STATIONARY_STREAK_TO_SLOW + 2;

/** Interval for 'fast' mode, tiered by current speed. */
export function fastIntervalForSpeed(speed: number | null): number {
  return speed != null && speed >= SPRINT_SPEED_MS ? SPRINT_INTERVAL_MS : FAST_INTERVAL_MS;
}

/** Cross-source dedup window, scaled so sprint-rate fixes aren't swallowed. */
export function dedupGapMs(intervalMs: number): number {
  return Math.min(MIN_FIX_GAP_MS, Math.floor(intervalMs / 2));
}
```

Replace `nextTrackingMode` with:

```ts
/**
 * Desired sampling mode. Tighten to 'fast' immediately on movement; relax to
 * 'slow' after a sustained still streak; fully park (no location requests,
 * OS geofence wake) after STREAK_TO_PARK when `canPark` (still inside a saved
 * geofence AND the native FGS is running to receive the wake).
 */
export function nextTrackingMode(
  prev: TrackingMode,
  movingNow: boolean,
  stationaryStreak: number,
  canPark: boolean = false,
): TrackingMode {
  if (movingNow) {
    return 'fast';
  }
  if (canPark && stationaryStreak >= STREAK_TO_PARK) {
    return 'parked';
  }
  if (stationaryStreak >= STATIONARY_STREAK_TO_SLOW) {
    return 'slow';
  }
  return prev;
}
```

- [ ] **Step 4: Run the full check**

Run: `npm run check`
Expected: PASS (new tests green; gpsService still compiles — `canPark` is optional, and its local `FAST_INTERVAL_MS` still exists until Task 3).

- [ ] **Step 5: Commit**

```bash
git add __tests__/trackingMode.test.ts src/services/trackingMode.ts
git commit -m "feat(gps): three-state ladder, speed-tiered fast rate, scaled dedup gap"
```

---

### Task 2: Bridge methods — setBackgroundMode + enterParkedNative

**Files:**
- Modify: `src/native/backgroundLocation.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (Task 3 imports these; Task 4 implements the Kotlin side):
  - `export interface ParkFence {id: number; latitude: number; longitude: number; radius: number}`
  - `setBackgroundMode(mode: 'fast' | 'slow', ms: number): void`
  - `enterParkedNative(fences: ParkFence[]): void`
  - Native module methods called: `setMode(mode: string, ms: number)`, `enterParked(fences: ParkFence[])`

- [ ] **Step 1: Update `src/native/backgroundLocation.ts`**

Replace the `BackgroundLocationNative` interface and `setBackgroundInterval` with:

```ts
interface BackgroundLocationNative {
  start(): Promise<void>;
  stop(): Promise<void>;
  setMode(mode: string, ms: number): Promise<void>;
  enterParked(fences: ParkFence[]): Promise<void>;
}
```

```ts
/** A saved location to fence while parked (radius already includes the
 *  exit hysteresis multiplier). */
export interface ParkFence {
  id: number;
  latitude: number;
  longitude: number;
  radius: number; // metres
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
```

Delete `setBackgroundInterval` (Task 3 removes its only caller — until then `npm run check` would fail on the missing export, so Tasks 2 and 3 commit together if needed; preferred: keep `setBackgroundInterval` as a deprecated alias `export const setBackgroundInterval = (ms: number) => setBackgroundMode('fast', ms);` in this task and delete it in Task 3).

- [ ] **Step 2: Run the check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/native/backgroundLocation.ts
git commit -m "feat(gps): bridge setBackgroundMode (priority-aware) + enterParkedNative"
```

---

### Task 3: gpsService ladder wiring — accuracy-aware watch, park, wake

**Files:**
- Modify: `src/services/gpsService.ts`

**Interfaces:**
- Consumes: Task 1 (`fastIntervalForSpeed`, `dedupGapMs`, `STREAK_TO_PARK` via `nextTrackingMode` 4-arg, `FAST_INTERVAL_MS` now imported), Task 2 (`setBackgroundMode`, `enterParkedNative`, `ParkFence`).
- Produces: no new exports. Behavior contract for Task 4: while parked the JS watch is cleared; any incoming native fix in parked mode is processed normally and the ladder re-arms via `applyMode`.

- [ ] **Step 1: Update imports and state**

In `src/services/gpsService.ts`:
- Import `fastIntervalForSpeed`, `dedupGapMs`, `FAST_INTERVAL_MS` from `./trackingMode` (delete the local `const FAST_INTERVAL_MS = 4_000;` and its comment).
- Replace the `setBackgroundInterval` import with `setBackgroundMode, enterParkedNative, type ParkFence`.
- Add state next to `_trackingMode`:

```ts
// Current watch config, for change detection (sprint↔walk retunes within
// 'fast' as well as mode changes) and for the interval-scaled dedup gap.
let _currentIntervalMs = FAST_INTERVAL_MS;
let _currentHighAccuracy = true;
```

- [ ] **Step 2: Make armWatch accuracy-aware**

```ts
/** (Re)create the position watch with the given cadence and power level.
 *  Clears any existing watch first, so it doubles as the re-arm used on a
 *  mode or tier change. Slow mode uses low accuracy (no GPS chip; wifi/cell
 *  is enough to notice departure and the >MAX_TRAIL_ACCURACY_M filter keeps
 *  poor fixes out of the trail). */
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
    _err => {
      // Silently ignore individual position errors
    },
    {
      enableHighAccuracy: highAccuracy,
      distanceFilter: TRAIL_DISTANCE_FILTER_M, // metres — minimum movement before update
      interval: intervalMs,
      fastestInterval: Math.min(intervalMs, 15_000),
    },
  );
}
```

Update the two existing callers: `startTracking` → `armWatch(FAST_INTERVAL_MS, true)`.

- [ ] **Step 3: Add applyMode and rewire handlePosition**

Add above `handlePosition`:

```ts
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
  const interval = mode === 'fast' ? fastIntervalForSpeed(speed) : _slowIntervalMs;
  const highAccuracy = mode === 'fast';
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
```

In `handlePosition`, replace the dedup line to use the scaled gap:

```ts
  if (isDuplicateFix(arrivedMs, _lastAcceptedFixMs, dedupGapMs(_currentIntervalMs))) {
    return;
  }
```

Replace the existing adaptive-sampling block (`_stationaryStreak = ...` through the `if (desiredMode !== _trackingMode) {...}`) with:

```ts
  // Power ladder: fast (speed-tiered) while moving, slow+balanced while still,
  // parked (zero requests, OS geofence wake) when still inside a saved place
  // with the native FGS running. See trackingMode.ts + spec 5.9.
  _stationaryStreak = movingNow ? 0 : _stationaryStreak + 1;
  const canPark = _nativeActive && _insideIds.size > 0;
  applyMode(nextTrackingMode(_trackingMode, movingNow, _stationaryStreak, canPark), speed);
```

- [ ] **Step 4: Wake paths + state resets**

In `startTracking`, replace the early return so app-foregrounding wakes a parked session (App.tsx already calls `startTracking` on every resume):

```ts
  if (_active) {
    if (_trackingMode === 'parked') {
      // Resume-from-background while parked: re-arm immediately; the ladder
      // will settle back to slow/parked if we're in fact still.
      applyMode('fast', null);
    }
    return; // already running
  }
```

In `handleNativeFix`, add the drive-instrumentation log as the first line:

```ts
  console.log('[gps] native fix', fix.latitude, fix.longitude, 'spd', fix.speed);
```

In `stopTracking`, reset the new state (after `_stationaryStreak = 0;`):

```ts
  _currentIntervalMs = FAST_INTERVAL_MS;
  _currentHighAccuracy = true;
```

(Native geofences are torn down by the service's own `onDestroy` — Task 4.)

- [ ] **Step 5: Run the check**

Run: `npm run check`
Expected: PASS (103+ tests; no gpsService unit tests exist — the pure logic is covered by Task 1).

- [ ] **Step 6: Delete the deprecated alias**

Remove `setBackgroundInterval` from `src/native/backgroundLocation.ts` (its only caller is gone). Run `npm run check` again — PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpsService.ts src/native/backgroundLocation.ts
git commit -m "feat(gps): wire power ladder — balanced-power slow, parked state, wake paths"
```

---

### Task 4: Native — priority-aware requests, parked state, geofence wake, Log.d

**Files:**
- Modify: `android/app/src/main/java/com/kelomitapp/location/LocationService.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/GeofenceExitReceiver.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: Task 2's bridge calls — `setMode(mode: String, ms: Double)`, `enterParked(fences: ReadableArray)` where each fence is `{id: number, latitude: number, longitude: number, radius: number}`.
- Produces: geofence-exit wake that restarts fused updates at `DEFAULT_INTERVAL_MS` HIGH_ACCURACY and resumes emitting `onBackgroundLocation` (JS ladder takes over from the first fix).

- [ ] **Step 1: strings.xml — paused notification text**

After `location_service_text`:

```xml
    <string name="location_service_paused_text">Paused at a saved place — resumes when you leave.</string>
```

- [ ] **Step 2: Rework LocationService.kt**

Add imports:

```kotlin
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
```

Add to the class (fields next to `fusedClient`):

```kotlin
  data class ParkFence(val id: Long, val latitude: Double, val longitude: Double, val radiusM: Float)

  private var geofencingClient: GeofencingClient? = null
  private var parked = false
  private val geofencePendingIntent: PendingIntent by lazy {
    val intent = Intent(this, GeofenceExitReceiver::class.java)
    // FLAG_MUTABLE: the geofencing API fills in the triggering event (API 31+).
    PendingIntent.getBroadcast(
      this, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
  }
```

In `onCreate`, after the fused client line:

```kotlin
    geofencingClient = LocationServices.getGeofencingClient(this)
```

Replace `updateInterval` and `startLocationUpdates` with:

```kotlin
  /** Called from the JS bridge (same process) to change cadence + power level.
   *  Also exits parked state (JS calls this on app-foreground wake). */
  fun updateMode(mode: String, ms: Long) {
    if (parked) exitParked(restart = false)
    val priority = if (mode == "slow") {
      Priority.PRIORITY_BALANCED_POWER_ACCURACY // no GPS chip while idling
    } else {
      Priority.PRIORITY_HIGH_ACCURACY
    }
    startLocationUpdates(ms, priority)
  }

  /** Park: drop the location request entirely; arm OS geofence-exit wakes.
   *  The service (and its notification) stays alive — an idle process is
   *  ~free and keeps the React context warm for the wake. */
  @SuppressLint("MissingPermission")
  fun enterParked(fences: List<ParkFence>) {
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED || fences.isEmpty()
    ) {
      return
    }
    fusedClient?.removeLocationUpdates(callback)
    val geofences = fences.map {
      Geofence.Builder()
        .setRequestId(it.id.toString())
        .setCircularRegion(it.latitude, it.longitude, it.radiusM)
        .setExpirationDuration(Geofence.NEVER_EXPIRE)
        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
        .build()
    }
    val request = GeofencingRequest.Builder()
      .setInitialTrigger(0) // never fire on registration
      .addGeofences(geofences)
      .build()
    geofencingClient?.addGeofences(request, geofencePendingIntent)
    parked = true
    Log.d("KelomitLoc", "parked with ${fences.size} fence(s)")
    updateNotification(paused = true)
  }

  /** Geofence-exit wake (from GeofenceExitReceiver). */
  fun onGeofenceExitWake() {
    Log.d("KelomitLoc", "geofence exit wake")
    exitParked(restart = true)
  }

  private fun exitParked(restart: Boolean) {
    geofencingClient?.removeGeofences(geofencePendingIntent)
    parked = false
    updateNotification(paused = false)
    if (restart) {
      startLocationUpdates(DEFAULT_INTERVAL_MS, Priority.PRIORITY_HIGH_ACCURACY)
    }
  }

  private fun updateNotification(paused: Boolean) {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    mgr.notify(NOTIF_ID, buildNotification(paused))
  }

  @SuppressLint("MissingPermission")
  private fun startLocationUpdates(intervalMs: Long, priority: Int) {
    val client = fusedClient ?: return
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return // JS owns the permission prompt; do nothing until granted
    }
    val request = LocationRequest.Builder(priority, intervalMs)
      .setMinUpdateDistanceMeters(10f)
      .build()
    client.removeLocationUpdates(callback)
    client.requestLocationUpdates(request, callback, Looper.getMainLooper())
  }
```

Update the `onStartCommand` call site: `startLocationUpdates(interval, Priority.PRIORITY_HIGH_ACCURACY)`.

In `emitLocation`, replace the last two lines with (drive instrumentation — logs whether the React context existed for the emit):

```kotlin
    val reactContext = (application as? ReactApplication)?.reactHost?.currentReactContext
    Log.d(
      "KelomitLoc",
      "fix lat=${loc.latitude} lon=${loc.longitude} spd=${loc.speed} acc=${loc.accuracy} ctx=${reactContext != null}",
    )
    reactContext?.emitDeviceEvent("onBackgroundLocation", map)
```

In `onDestroy`, before `instance = null`:

```kotlin
    geofencingClient?.removeGeofences(geofencePendingIntent)
```

In `buildNotification`, change the signature to `private fun buildNotification(paused: Boolean = false): Notification` and the content-text line to:

```kotlin
      .setContentText(getString(if (paused) R.string.location_service_paused_text else R.string.location_service_text))
```

- [ ] **Step 3: Create GeofenceExitReceiver.kt**

```kotlin
package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/**
 * Wakes the parked [LocationService] when the OS reports we left a saved
 * place. If the service is gone (process killed), there is nothing to wake —
 * by design parked mode only exists while the FGS is alive.
 */
class GeofenceExitReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) {
      Log.d("KelomitLoc", "geofence event error=${event.errorCode}")
      return
    }
    if (event.geofenceTransition == Geofence.GEOFENCE_TRANSITION_EXIT) {
      LocationService.instance?.onGeofenceExitWake()
    }
  }
}
```

- [ ] **Step 4: Register the receiver in AndroidManifest.xml**

After the `LocationService` `<service>` element:

```xml
      <!-- Wakes the parked location service when the OS reports a saved-place
           exit (GeofencingClient PendingIntent target). -->
      <receiver
        android:name=".location.GeofenceExitReceiver"
        android:exported="false" />
```

- [ ] **Step 5: Update BackgroundLocationModule.kt**

Add import `com.facebook.react.bridge.ReadableArray`. Replace the `setInterval` method with:

```kotlin
  @ReactMethod
  fun setMode(mode: String, ms: Double, promise: Promise) {
    try {
      // Talk to the already-running service in-process; do NOT startForegroundService
      // here (forbidden from background on Android 12+).
      LocationService.instance?.updateMode(mode, ms.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("set_mode_failed", e)
    }
  }

  @ReactMethod
  fun enterParked(fences: ReadableArray, promise: Promise) {
    try {
      val parsed = (0 until fences.size()).mapNotNull { i ->
        val f = fences.getMap(i) ?: return@mapNotNull null
        LocationService.ParkFence(
          id = f.getDouble("id").toLong(),
          latitude = f.getDouble("latitude"),
          longitude = f.getDouble("longitude"),
          radiusM = f.getDouble("radius").toFloat(),
        )
      }
      LocationService.instance?.enterParked(parsed)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("enter_parked_failed", e)
    }
  }
```

- [ ] **Step 6: Verify the Kotlin compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin -q; cd ..`
Expected: BUILD SUCCESSFUL (no test run — native behavior is device-confirmed only).

- [ ] **Step 7: Run the JS check + commit**

Run: `npm run check`
Expected: PASS.

```bash
git add android/app/src/main/java/com/kelomitapp/location/ android/app/src/main/AndroidManifest.xml android/app/src/main/res/values/strings.xml
git commit -m "feat(gps): native parked state — geofence-exit wake, balanced-power slow, drive Log.d"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full suite** — `npm run check` → all green (expect 103 + ~12 new tests).
- [ ] **Step 2: Kotlin compile** — `cd android && ./gradlew :app:compileDebugKotlin -q; cd ..` → BUILD SUCCESSFUL.
- [ ] **Step 3: Grep the knobs** — every const from Global Constraints exists with a `ponytail:` comment: `grep -rn "ponytail" src/services/trackingMode.ts src/services/gpsService.ts`.
- [ ] **Step 4: Report** — summarize for the user: what changed, that device steps remain (rebuild, uninstall→reinstall, drive with `adb logcat -s KelomitLoc ReactNativeJS` for the native-path confirmation), and that the JS-demotion flip is the follow-up once the drive logcat confirms.

**Device checklist for the user (not claimable by the implementer):**
1. Rebuild + uninstall→reinstall (native changed).
2. Enable background tracking; sit at Work/Home 3+ min → notification should flip to "Paused at a saved place".
3. Leave → tracking resumes within moments of crossing ~1.25× the fence radius; trail shows the departure.
4. Drive once with logcat capture → `KelomitLoc` lines with `ctx=true` while backgrounded settle the native→JS question → then flip JS to fallback-only (tiny follow-up).
