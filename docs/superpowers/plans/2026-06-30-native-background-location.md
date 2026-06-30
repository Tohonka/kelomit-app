# Native Background Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the foreground service request location itself (Doze-resistant), bridge each fix to the existing JS pipeline, and let the JS adaptive mode drive the native interval.

**Architecture:** `LocationService` uses `FusedLocationProviderClient` to request updates and emits `onBackgroundLocation` events to JS; `gpsService` routes those through the unchanged `handlePosition` (jitter/accuracy/adaptive/geofence/DB) and pushes interval changes back to native via `setInterval`. When "Track in background" is off, the old JS `watchPosition` path is kept (foreground only).

**Tech Stack:** Kotlin, Google Play Services Location (`play-services-location`), React Native 0.86, TypeScript.

## Global Constraints

- Native change → **rebuild + sideload** (uninstall→reinstall). Native code CANNOT be built or run in this environment; native tasks are verified by code review + the user's device build. `npm run check` must stay green for all JS/TS changes.
- Native does ONLY the location request + event emit + interval retune. All filtering/processing (outlier, movement/adaptive, jitter gate, accuracy gate, geofences, DB, prune) stays in the JS `handlePosition` pipeline — do not duplicate it natively.
- No new manifest permission (manifest already has `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, and the location-typed service).
- Native location `LocationRequest`: priority `HIGH_ACCURACY`, `minUpdateDistanceMeters = 10`, interval supplied by JS (default fast 4000 ms).
- `setInterval` from JS must work while the app is backgrounded → talk to the already-running service via a static instance reference, NOT `startForegroundService` (Android 12+ forbids starting an FGS from the background).
- Event name is exactly `onBackgroundLocation`; payload keys exactly `latitude, longitude, accuracy, altitude, speed, timestamp`.

---

### Task 1: Native — fused location in the foreground service

**Files:**
- Modify: `android/app/build.gradle` (add dependency)
- Rewrite: `android/app/src/main/java/com/kelomitapp/location/LocationService.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt`

**Interfaces:**
- Produces (native module `BackgroundLocation`): `start()`, `stop()`, `setInterval(ms: Double)`; emits DeviceEvent `onBackgroundLocation` with `{latitude, longitude, accuracy, altitude, speed, timestamp}`.

Native code cannot be compiled here. Verify by careful review against the Play Services Location API; the build gate is the user's device. `npm run check` is unaffected.

- [ ] **Step 1: Add the Play Services Location dependency**

In `android/app/build.gradle`, inside the `dependencies { ... }` block (after the `implementation("com.facebook.react:react-android")` line), add:

```gradle
    implementation("com.google.android.gms:play-services-location:21.3.0")
```

- [ ] **Step 2: Rewrite `LocationService.kt`**

Replace the whole file with:

```kotlin
package com.kelomitapp.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.kelomitapp.MainActivity
import com.kelomitapp.R

/**
 * Foreground service for opt-in background GPS. Unlike the previous keep-alive-only
 * version, it now REQUESTS location itself via the fused provider — a location-typed
 * foreground service keeps getting updates under Doze, where the JS watch was
 * throttled. Each fix is emitted to JS (`onBackgroundLocation`), which runs the
 * existing processing pipeline. JS retunes the interval via [updateInterval].
 */
class LocationService : Service() {
  companion object {
    private const val CHANNEL_ID = "location-tracking"
    private const val NOTIF_ID = 4711
    const val EXTRA_INTERVAL = "interval_ms"
    const val DEFAULT_INTERVAL_MS = 4000L

    // Same-process handle so JS can retune the running service without
    // startForegroundService (which Android 12+ forbids from the background).
    @Volatile
    var instance: LocationService? = null
  }

  private var fusedClient: FusedLocationProviderClient? = null
  private var currentIntervalMs = DEFAULT_INTERVAL_MS

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let { emitLocation(it) }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIF_ID, notification)
    }
    val interval = intent?.getLongExtra(EXTRA_INTERVAL, DEFAULT_INTERVAL_MS) ?: DEFAULT_INTERVAL_MS
    startLocationUpdates(interval)
    return START_STICKY
  }

  /** Called from the JS bridge (same process) to change the request cadence. */
  fun updateInterval(ms: Long) {
    startLocationUpdates(ms)
  }

  @SuppressLint("MissingPermission")
  private fun startLocationUpdates(intervalMs: Long) {
    val client = fusedClient ?: return
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return // JS owns the permission prompt; do nothing until granted
    }
    currentIntervalMs = intervalMs
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateDistanceMeters(10f)
      .build()
    client.removeLocationUpdates(callback)
    client.requestLocationUpdates(request, callback, Looper.getMainLooper())
  }

  private fun emitLocation(loc: Location) {
    val map = Arguments.createMap().apply {
      putDouble("latitude", loc.latitude)
      putDouble("longitude", loc.longitude)
      putDouble("accuracy", loc.accuracy.toDouble())
      if (loc.hasAltitude()) putDouble("altitude", loc.altitude) else putNull("altitude")
      if (loc.hasSpeed()) putDouble("speed", loc.speed.toDouble()) else putNull("speed")
      putDouble("timestamp", loc.time.toDouble())
    }
    val reactContext =
      (application as? ReactApplication)
        ?.reactNativeHost
        ?.reactInstanceManager
        ?.currentReactContext
    reactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit("onBackgroundLocation", map)
  }

  override fun onDestroy() {
    super.onDestroy()
    fusedClient?.removeLocationUpdates(callback)
    instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  private fun buildNotification(): Notification {
    createChannel()
    val tapIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      tapIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(getString(R.string.location_service_title))
      .setContentText(getString(R.string.location_service_text))
      .setSmallIcon(R.drawable.ic_stat_tracking)
      .setOngoing(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun createChannel() {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        getString(R.string.location_channel_name),
        NotificationManager.IMPORTANCE_LOW,
      ).apply { setShowBadge(false) }
      mgr.createNotificationChannel(channel)
    }
  }
}
```

- [ ] **Step 3: Add `setInterval` to `BackgroundLocationModule.kt`**

In `BackgroundLocationModule.kt`, add this method inside the class (after `stop`):

```kotlin
  @ReactMethod
  fun setInterval(ms: Double, promise: Promise) {
    try {
      // Talk to the already-running service in-process; do NOT startForegroundService
      // here (forbidden from background on Android 12+).
      LocationService.instance?.updateInterval(ms.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("set_interval_failed", e)
    }
  }
```

- [ ] **Step 4: Commit**

```bash
git add android/app/build.gradle android/app/src/main/java/com/kelomitapp/location/LocationService.kt android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt
git commit -m "feat(gps): native fused location in the foreground service (Doze-resistant)"
```

---

### Task 2: JS bridge wrapper for native location

**Files:**
- Modify: `src/native/backgroundLocation.ts`

**Interfaces:**
- Consumes (native module `BackgroundLocation`): `setInterval(ms)`; DeviceEvent `onBackgroundLocation`.
- Produces:
  - `interface NativeFix { latitude: number; longitude: number; accuracy: number | null; altitude: number | null; speed: number | null; timestamp: number }`
  - `setBackgroundInterval(ms: number): void`
  - `subscribeBackgroundLocation(cb: (fix: NativeFix) => void): {remove: () => void}`

- [ ] **Step 1: Extend the wrapper**

In `src/native/backgroundLocation.ts`, add the import for `DeviceEventEmitter` and the new exports. Change the top import line:

```ts
import {NativeModules} from 'react-native';
```

to:

```ts
import {NativeModules, DeviceEventEmitter} from 'react-native';
```

Extend the native interface and add the new exports (append after the existing `stopBackgroundLocationService`):

```ts
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
```

Also widen the `BackgroundLocationNative` interface so `setInterval` is typed — change it to:

```ts
interface BackgroundLocationNative {
  start(): Promise<void>;
  stop(): Promise<void>;
  setInterval(ms: number): Promise<void>;
}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: lint clean, tsc no errors, all jest suites pass (no behavior change yet).

- [ ] **Step 3: Commit**

```bash
git add src/native/backgroundLocation.ts
git commit -m "feat(gps): JS wrapper for native background-location events + interval"
```

---

### Task 3: Route native fixes through gpsService + wire App.tsx

**Files:**
- Modify: `src/services/gpsService.ts`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `subscribeBackgroundLocation`, `setBackgroundInterval`, `NativeFix`, `isBackgroundLocationAvailable`, `startBackgroundLocationService`, `stopBackgroundLocationService` (Task 2 + existing); `useSettingsStore`.

Integration glue over native I/O; no unit test. Gate: `npm run check` green; real verification is the user's device build. Do NOT add mock-heavy tests.

- [ ] **Step 1: Imports + source state in gpsService**

In `src/services/gpsService.ts`, add imports (near the other imports):

```ts
import {
  isBackgroundLocationAvailable,
  startBackgroundLocationService,
  stopBackgroundLocationService,
  subscribeBackgroundLocation,
  setBackgroundInterval,
  type NativeFix,
} from '../native/backgroundLocation';
import {useSettingsStore} from '../store/settingsStore';
```

(If `useSettingsStore` is already imported, do not duplicate it.)

Add module state next to `let _watchId: number | null = null;`:

```ts
// Active source for fixes: 'native' (foreground-service fused location, Doze-safe)
// when background tracking is on, else 'js' (foreground-only watchPosition).
let _source: 'js' | 'native' = 'js';
let _active = false;
let _nativeSub: {remove: () => void} | null = null;
```

- [ ] **Step 2: Branch startTracking on the source**

Replace the whole `startTracking` function with:

```ts
export async function startTracking(intervalMs = 60_000): Promise<void> {
  if (_active) {
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
  _active = true;

  const wantsBackground = useSettingsStore.getState().background_tracking;
  if (wantsBackground && isBackgroundLocationAvailable()) {
    // Native fused location in the foreground service (Doze-resistant). Fixes
    // arrive as 'onBackgroundLocation' events and run the same pipeline.
    _source = 'native';
    _nativeSub = subscribeBackgroundLocation(handleNativeFix);
    await startBackgroundLocationService(); // starts at the native default (fast)
  } else {
    _source = 'js';
    armWatch(FAST_INTERVAL_MS);
  }
}

/** Adapt a native fix into the GeolocationResponse shape handlePosition reads. */
function handleNativeFix(fix: NativeFix): void {
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
```

- [ ] **Step 3: Drive native interval on mode change**

In `handlePosition`, replace the mode-change block:

```ts
  if (desiredMode !== _trackingMode) {
    _trackingMode = desiredMode;
    armWatch(desiredMode === 'fast' ? FAST_INTERVAL_MS : _slowIntervalMs);
  }
```

with:

```ts
  if (desiredMode !== _trackingMode) {
    _trackingMode = desiredMode;
    const ms = desiredMode === 'fast' ? FAST_INTERVAL_MS : _slowIntervalMs;
    if (_source === 'native') {
      setBackgroundInterval(ms);
    } else {
      armWatch(ms);
    }
  }
```

- [ ] **Step 4: Tear down both sources in stopTracking**

Replace the whole `stopTracking` function with:

```ts
export function stopTracking(): void {
  if (_source === 'native') {
    _nativeSub?.remove();
    _nativeSub = null;
    stopBackgroundLocationService();
  } else if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  _active = false;
  _source = 'js';
  _lastPosition = null;
  _lastRecordedPosition = null;
  _trackingMode = 'fast';
  _stationaryStreak = 0;
}
```

- [ ] **Step 5: Simplify App.tsx (gpsService now owns the service)**

In `App.tsx`, `startTracking` now starts the native service itself when background tracking is on, so the separate call is redundant. Replace the `startGpsIfEnabled` body:

```ts
    const startGpsIfEnabled = async () => {
      const settings = await getAllSettings().catch(() => null);
      if (settings?.gps_enabled) {
        startTracking(settings.gps_interval_ms);
        // The keep-alive foreground service is tied to the *setting*, not the
        // background transition: Android 12+ forbids starting a foreground
        // service once already backgrounded, so it must be started while we're
        // still in the foreground and left running the whole time tracking is on.
        if (useSettingsStore.getState().background_tracking) {
          startBackgroundLocationService();
        }
      }
    };
```

with:

```ts
    const startGpsIfEnabled = async () => {
      const settings = await getAllSettings().catch(() => null);
      if (settings?.gps_enabled) {
        // startTracking starts the native foreground service itself when
        // background tracking is on (and must run while foreground — Android 12+
        // forbids starting an FGS from the background). Called on launch + resume.
        startTracking(settings.gps_interval_ms);
      }
    };
```

Then remove the now-unused import in `App.tsx`:

```ts
import {startBackgroundLocationService} from './src/native/backgroundLocation';
```

(Delete that line. Keep the `stopTracking`/`startTracking` import from `./src/services/gpsService`.)

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: lint clean (no unused `startBackgroundLocationService` import), tsc no errors, all jest suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpsService.ts App.tsx
git commit -m "feat(gps): route native background fixes through the JS pipeline"
```

---

## Device build + soak (the real verification — user)

Native cannot be built here. After implementation:
1. `npm version patch` (optional) → rebuild → **uninstall the old app, reinstall** (sideload dance; permission/component changes).
2. Grant location ("Allow all the time" if prompted — verify whether the location-FGS works under "while in use" alone; if not, we add the background-location prompt to `permissionService`).
3. Drive A→B with the phone pocketed/screen-off → trail should follow the road (dense ~4 s points), no long straight gap; the "logging in background" notification stays up the whole time.
4. Sit still → points back off (slow interval); confirm battery is acceptable.

**Known risk:** if fixes don't arrive in deep Doze (JS not receiving events), the fallback is native SQLite writes — a separate iteration, not built here.

## Deferred
- Activity-Recognition transition wake (battery + trip-start) — follow-up, adds ACTIVITY_RECOGNITION.
- Native DB-write fallback (only if the JS-event path fails the soak).
