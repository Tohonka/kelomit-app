# Iteration 5.7 — Native background location (Doze-resistant) (design)

**Date:** 2026-06-30
**Status:** approved (Tommi, 2026-06-30)

## Problem

Background tracking drops the start of trips and the "logging in background"
notification is intermittent. Root cause (confirmed from a real device backup,
`realUserData/.../kelomit.db`, day 1075): the background architecture is a JS
`Geolocation.watchPosition` kept alive only by a foreground service that **does not
request location itself** (`LocationService.kt`). When the phone is stationary +
screen-off + backgrounded, Android **Doze** throttles the JS location request, so a
SLOW-mode (60 s) watch stalls for minutes. Evidence: the A→B drive recorded as one
**621 s gap covering 1855 m** (zero points) right after a long stationary stretch,
while the drive home minutes later — app freshly foregrounded — recorded perfect 4 s
points. The 5.6 adaptive logic can't recover because it can't switch to FAST without
first receiving a fix.

## Goal

Doze-resistant background location so a pocketed-phone commute records densely and
follows the road, and the foreground-service notification stays up reliably — by
moving the **location request** into the foreground service while keeping all
processing in the existing JS pipeline.

## Approach (chosen)

Native location in the foreground service, bridged to the existing JS pipeline.
Rejected: a drop-in background-geolocation library (Android licensing cost, heavy
dep, defeats the fleet-app test-bed intent [[kelomit-tracking-intent-fleet]]).
Deferred: Activity-Recognition transition wake (battery follow-up, adds
ACTIVITY_RECOGNITION permission).

**This is a native change → rebuild + sideload** (uninstall→reinstall, back up first;
[[kelomit-sideload-gotcha]]).

## Design

### Principle
Move only the *location request* native. Jitter gate, accuracy filter, adaptive
4 s/60 s decision, geofences, day start/end, DB writes, and 7-day prune all stay in
the existing JS pipeline. Native delivers raw fixes; `handlePosition` processes them
exactly as today. One processing path, two possible sources.

### Components
- **`LocationService.kt`**: add a `FusedLocationProviderClient`. On start, call
  `requestLocationUpdates` with a `LocationRequest` (priority `HIGH_ACCURACY`,
  `minUpdateDistanceMeters = 10`, `intervalMillis` supplied by JS, default fast
  4000). Because it is a location-typed foreground service, updates continue in Doze.
  Stop updates in `onDestroy`. Requires the native gradle dep
  `com.google.android.gms:play-services-location`.
- **`BackgroundLocationModule.kt`**: (1) each native fix → emit a `DeviceEventEmitter`
  event `onBackgroundLocation` with `{latitude, longitude, accuracy, altitude, speed,
  timestamp}`; (2) add `setInterval(ms)` to retune the running request so JS adaptive
  mode drives the native cadence. Keep existing `start`/`stop`.
- **`gpsService.ts`**: add a source seam. When `background_tracking` is on, subscribe
  to `onBackgroundLocation` and route each event through the **same `handlePosition`**
  (shaped as a `GeolocationResponse`-like object); on an adaptive mode change call
  native `setInterval(FAST_INTERVAL_MS | _slowIntervalMs)` instead of re-arming a JS
  watch. When `background_tracking` is off, keep today's `watchPosition`
  (foreground-only, no persistent notification).

### Data flow
`Fused (native, Doze-exempt) → JS onBackgroundLocation event → handlePosition →
[outlier → movement/adaptive → jitter + accuracy gate → insertGpsPoint] +
processGeofences`. Adaptive decision stays in JS and now drives the native interval.
This also fixes the trip-start lag and keeps geofence / day-time stamping responsive
in the background.

### Permissions
Manifest already declares `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, and the location-typed service —
no new manifest permission. A running location-FGS can read location under
"while-in-use", so verify on device whether a "Allow all the time" runtime prompt is
needed; if so, wire it into the existing `react-native-permissions` flow in
`permissionService`/`gpsService`.

### Known risk + fallback
Open question: can RN reliably deliver native→JS events in **deep** Doze? Expected yes
(the FGS keeps the JS context alive; JS only does a cheap DB write). Build the
bridge-to-JS version first (reuses 100% of the pipeline). **If** the soak shows events
not arriving in deep Doze, fall back to writing fixes to SQLite natively in the service
and reconciling in JS on resume. Not built pre-emptively.

## Testing
- Native Kotlin: device-soak only (no JVM test harness in this project).
- JS seam is thin; existing pure tests + `npm run check` cover the TS side.
- Real verification: a device drive A→B with the phone pocketed should now follow the
  road (dense points, no long straight gap); the notification stays up the whole time.

## Out of scope / deferred
- Activity-Recognition transition wake (battery + trip-start optimization; adds
  ACTIVITY_RECOGNITION permission) — follow-up on top of this.
- Native-side DB writes (only if the JS-event fallback is needed).
- Per-day "stop tracking for today" control; work-hours recording limit.
