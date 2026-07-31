# Work Detection Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect work-day start/end from persisted geofence crossings (OS-geofence primary), independent of the live GPS fix stream, via a pure re-runnable inference layer.

**Architecture:** Two crossing producers (OS geofencing + trimmed live-fix detector) write deduped rows to `geofence_events` (the store); a pure `inferDay()` reads a day's crossings and yields start/end + a confirmation flag; a `dayDetection` orchestrator persists crossings, runs inference on crossing/foreground/tracking-start, and registers monitored places natively.

**Tech Stack:** React Native (New Arch), TypeScript, Kotlin (FusedLocation + GeofencingClient), op-sqlite, Jest.

## Global Constraints

- Schema migrations: append a `{version, up: string[]}` to `migrations` in `src/db/migrations.ts`. Current max version = 17; new = **18**.
- Native→JS events use `(application as? ReactApplication)?.reactHost?.currentReactContext?.emitDeviceEvent(name, map)` — reactHost, NOT reactNativeHost (throws on New Arch).
- Inference is **pure** (no I/O, no module state) and lives in `src/services/endOfDay.ts`.
- `AWAY_THRESHOLD_MS = 3_600_000` (1 h). `DEDUP_WINDOW_MS = 60_000`. `MIN_OS_RADIUS_M = 100`.
- Never overwrite a day time that is already set (gate on emptiness); stamp inference writes with source `'auto'`, manual edits with `'manual'`.
- Best-effort everywhere in the tracking path: wrap DB/native calls so detection never crashes tracking.
- Run `npx tsc --noEmit` and `npx jest` green before each commit that touches TS.

---

## File Structure

- `src/db/migrations.ts` — add v18 (source columns). **Modify.**
- `src/types/index.ts` — `Day` gains `started_at_source`, `ended_at_source`. **Modify.**
- `src/db/days.ts` — `DayTimeFields` includes the two source columns; row mapping. **Modify.**
- `src/services/endOfDay.ts` — **Rewrite** as pure `inferDay()` over crossings.
- `src/services/crossingStore.ts` — **Create.** Dedup + persist + read crossings.
- `src/services/dayDetection.ts` — **Create.** Orchestrator.
- `src/native/backgroundLocation.ts` — add `monitorPlaces`, `subscribeGeofenceCrossing`. **Modify.**
- `android/app/src/main/java/com/kelomitapp/location/LocationService.kt` — geofence registration + crossing emit. **Modify.**
- `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt` — `monitorPlaces` bridge method. **Modify.**
- `android/app/src/main/java/com/kelomitapp/location/GeofenceCrossingReceiver.kt` — **Create.**
- `android/app/src/main/AndroidManifest.xml` — register the receiver. **Modify.**
- `src/services/gpsService.ts` — trim `processGeofences` to a producer; remove eod coupling; rework `getCurrentGeofenceDetection`; simplify `canPark`; wire orchestrator. **Modify.**
- `src/store/dayStore.ts` — stamp `'manual'` source on manual time edits. **Modify.**
- `__tests__/endOfDay.test.ts` — **Rewrite** for `inferDay`.
- `__tests__/crossingStore.test.ts` — **Create.** Dedup test.

---

## Task 1: Schema — day time source columns

**Files:**
- Modify: `src/db/migrations.ts` (append version 18)
- Modify: `src/types/index.ts` (`Day` interface)
- Modify: `src/db/days.ts` (`DayTimeFields`, row mapping)

**Interfaces:**
- Produces: `Day.started_at_source: string | null`, `Day.ended_at_source: string | null` (`'auto' | 'manual' | null`); `updateDay(id, fields)` accepts these two fields.

- [ ] **Step 1: Add migration v18**

In `src/db/migrations.ts`, append to the `migrations` array after the version 17 object:

```ts
  {
    version: 18,
    up: [
      // Provenance for auto-detected vs manually-entered day times, so the
      // detection redesign never overwrites a value the user set by hand.
      'ALTER TABLE days ADD COLUMN started_at_source TEXT',
      'ALTER TABLE days ADD COLUMN ended_at_source TEXT',
    ],
  },
```

- [ ] **Step 2: Extend the `Day` type**

In `src/types/index.ts`, inside `export interface Day`, add after `ended_at_2`:

```ts
  started_at_source: string | null;
  ended_at_source: string | null;
```

- [ ] **Step 3: Include columns in `DayTimeFields` and row mapping**

In `src/db/days.ts`, extend the `DayTimeFields` Pick to include `'started_at_source' | 'ended_at_source'`, and add to the row→`Day` mapping (wherever `started_at_2` is mapped):

```ts
    started_at_source: (row.started_at_source as string | null) ?? null,
    ended_at_source: (row.ended_at_source as string | null) ?? null,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations.ts src/types/index.ts src/db/days.ts
git commit -m "feat(days): add started_at_source/ended_at_source columns (schema v18)"
```

---

## Task 2: Pure end-of-day inference

**Files:**
- Rewrite: `src/services/endOfDay.ts`
- Rewrite: `__tests__/endOfDay.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Crossing { locationId: number; kind: 'work' | 'home' | 'other'; type: 'enter' | 'exit'; time: string; }
  interface DetectionInput { crossings: Crossing[]; now: string; startedAtSet: boolean; endedAtSet: boolean; }
  interface DetectionResult { startedAt: string | null; endedAt: string | null; confirmEnd: boolean; }
  function inferDay(input: DetectionInput): DetectionResult;
  ```
  `crossings` are ordered ascending by `time`.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `__tests__/endOfDay.test.ts` with:

```ts
import {inferDay, type Crossing} from '../src/services/endOfDay';

const DAY = '2026-06-17';
function at(h: number, min = 0): string {
  return new Date(2026, 5, 17, h, min, 0).toISOString();
}
const workEnter = (h: number, m = 0, id = 1): Crossing => ({locationId: id, kind: 'work', type: 'enter', time: at(h, m)});
const workExit = (h: number, m = 0, id = 1): Crossing => ({locationId: id, kind: 'work', type: 'exit', time: at(h, m)});
const homeEnter = (h: number, m = 0): Crossing => ({locationId: 9, kind: 'home', type: 'enter', time: at(h, m)});

function infer(crossings: Crossing[], now: string, opts?: Partial<{startedAtSet: boolean; endedAtSet: boolean}>) {
  return inferDay({crossings, now, startedAtSet: opts?.startedAtSet ?? false, endedAtSet: opts?.endedAtSet ?? false});
}

describe('inferDay', () => {
  it('sets start to the first work arrival', () => {
    const r = infer([workEnter(9)], at(9, 5));
    expect(r.startedAt).toBe(at(9));
  });

  it('does not propose a start when one is already set', () => {
    const r = infer([workEnter(9)], at(9, 5), {startedAtSet: true});
    expect(r.startedAt).toBeNull();
  });

  it('commits end silently when work is followed by home (work->home rule)', () => {
    const r = infer([workEnter(9), workExit(16), homeEnter(16, 20)], at(16, 25));
    expect(r.endedAt).toBe(at(16));
    expect(r.confirmEnd).toBe(false);
  });

  it('re-entering any work cancels the pending end (stepped out / office switch)', () => {
    // leave office A, arrive office B 20 min later — still working, no end
    const r = infer([workEnter(9, 0, 1), workExit(12, 0, 1), workEnter(12, 20, 2)], at(13));
    expect(r.endedAt).toBeNull();
  });

  it('commits + asks when away > 1h with no home and no work re-entry', () => {
    const r = infer([workEnter(9), workExit(14)], at(15, 1)); // 61 min later
    expect(r.endedAt).toBe(at(14));
    expect(r.confirmEnd).toBe(true);
  });

  it('does not commit an off-time exit before the 1h threshold', () => {
    const r = infer([workEnter(9), workExit(14)], at(14, 30));
    expect(r.endedAt).toBeNull();
  });

  it('never proposes an end when one is already set', () => {
    const r = infer([workEnter(9), workExit(16), homeEnter(16, 10)], at(16, 20), {endedAtSet: true});
    expect(r.endedAt).toBeNull();
  });

  it('uses the LAST work departure as the end on an in/out day', () => {
    // out for a work errand (returns), then final departure -> home
    const r = infer(
      [workEnter(9), workExit(11), workEnter(11, 30), workExit(16), homeEnter(16, 15)],
      at(16, 20),
    );
    expect(r.endedAt).toBe(at(16));
  });

  it('empty day (no work) proposes nothing', () => {
    const r = infer([homeEnter(8)], at(20));
    expect(r.startedAt).toBeNull();
    expect(r.endedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest endOfDay`
Expected: FAIL — `inferDay` is not exported (old file exports `evaluateEndOfDay`).

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `src/services/endOfDay.ts` with:

```ts
/**
 * End-of-day inference (redesign 2026-07-13).
 *
 * Pure, re-runnable function over a day's persisted geofence crossings — no
 * timers, no I/O, no module state. Crossings come from the crossing store
 * (OS geofencing + live-fix backstop), so this survives parked/doze windows.
 *
 * Rules (single-block day; out-of-office counts as work):
 *  - start = first work arrival of the day.
 *  - A work departure opens a pending end at that departure time. It resolves:
 *      home arrival        -> commit that departure time, silent (no confirm);
 *      re-enter any work   -> cancel (stepped out / switched offices);
 *      away > 1h, no home  -> commit that departure time, ask the user.
 *  - Commute home is never counted (end = the departure, not the home arrival).
 *  - Never proposes a value that is already set.
 */

const AWAY_THRESHOLD_MS = 3_600_000; // 1 h

export interface Crossing {
  locationId: number;
  kind: 'work' | 'home' | 'other';
  type: 'enter' | 'exit';
  time: string; // ISO
}

export interface DetectionInput {
  crossings: Crossing[]; // ordered ascending by time
  now: string; // ISO — for resolving the away>1h rule
  startedAtSet: boolean; // day.started_at already set?
  endedAtSet: boolean; // day.ended_at already set?
}

export interface DetectionResult {
  startedAt: string | null; // propose this start (only when !startedAtSet)
  endedAt: string | null; // propose this end (only when !endedAtSet)
  confirmEnd: boolean; // ask the user to confirm the proposed end
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

export function inferDay(input: DetectionInput): DetectionResult {
  const {crossings, now, startedAtSet, endedAtSet} = input;
  const result: DetectionResult = {startedAt: null, endedAt: null, confirmEnd: false};

  // START — first work arrival.
  if (!startedAtSet) {
    const firstWorkEnter = crossings.find(c => c.kind === 'work' && c.type === 'enter');
    result.startedAt = firstWorkEnter ? firstWorkEnter.time : null;
  }

  if (endedAtSet) {
    return result;
  }

  // END — fold crossings into "inside any work location" + a pending departure.
  const workInside = new Set<number>();
  let pendingExit: string | null = null;

  for (const c of crossings) {
    if (c.kind === 'work') {
      if (c.type === 'enter') {
        workInside.add(c.locationId);
        pendingExit = null; // re-entering work cancels a pending departure
      } else {
        workInside.delete(c.locationId);
        if (workInside.size === 0) {
          pendingExit = c.time; // left all work — open a pending end
        }
      }
    } else if (c.kind === 'home' && c.type === 'enter' && pendingExit !== null) {
      // work -> home: commit the departure time, no confirmation needed.
      result.endedAt = pendingExit;
      result.confirmEnd = false;
      return result;
    }
    // 'other' places are ignored for day boundaries.
  }

  // Still away and no home arrival — commit once past the away threshold, and ask.
  if (pendingExit !== null && ms(now) - ms(pendingExit) > AWAY_THRESHOLD_MS) {
    result.endedAt = pendingExit;
    result.confirmEnd = true;
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest endOfDay`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck (old callers now broken — expected, fixed in Task 6)**

Run: `npx tsc --noEmit 2>&1 | rg endOfDay`
Expected: errors only in `src/services/gpsService.ts` referencing the removed `evaluateEndOfDay`/`initialEodState`. These are fixed in Task 6. Do not fix here.

- [ ] **Step 6: Commit**

```bash
git add src/services/endOfDay.ts __tests__/endOfDay.test.ts
git commit -m "feat(eod): rewrite as pure inferDay over persisted crossings"
```

---

## Task 3: Crossing store (dedup + persist + read)

**Files:**
- Create: `src/services/crossingStore.ts`
- Create: `__tests__/crossingStore.test.ts`
- Modify: `src/db/locations.ts` (add `getLastGeofenceEvent`)

**Interfaces:**
- Consumes: `insertGeofenceEvent(params)`, `getGeofenceEventsForDay(dayId)` from `src/db/locations.ts`; `Crossing` from `src/services/endOfDay.ts`.
- Produces:
  ```ts
  function isDuplicateCrossing(lastMs: number | null, nowMs: number, windowMs?: number): boolean;
  function recordCrossing(p: {locationId: number; dayId: number; type: 'enter' | 'exit'; latitude: number | null; longitude: number | null; time: string}): Promise<void>;
  function crossingsForDay(dayId: number, kindOf: (locationId: number) => 'work' | 'home' | 'other'): Promise<Crossing[]>;
  ```

- [ ] **Step 1: Write the failing dedup test**

Create `__tests__/crossingStore.test.ts`:

```ts
import {isDuplicateCrossing} from '../src/services/crossingStore';

describe('isDuplicateCrossing', () => {
  it('is not a duplicate when there is no prior event', () => {
    expect(isDuplicateCrossing(null, 1000)).toBe(false);
  });
  it('flags a same-key event inside the 60s window as duplicate', () => {
    expect(isDuplicateCrossing(1000, 1000 + 30_000)).toBe(true);
  });
  it('accepts a same-key event after the window', () => {
    expect(isDuplicateCrossing(1000, 1000 + 61_000)).toBe(false);
  });
  it('treats exactly the window boundary as not duplicate', () => {
    expect(isDuplicateCrossing(1000, 1000 + 60_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest crossingStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `getLastGeofenceEvent` to the DB layer**

In `src/db/locations.ts`, after `getGeofenceEventsForDay`, add:

```ts
/** Most recent crossing for a location + type, across all days (for dedup on
 *  a cold start where the in-memory guard is empty). Null if none. */
export async function getLastGeofenceEvent(
  locationId: number,
  eventType: 'enter' | 'exit',
): Promise<GeofenceEvent | null> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM geofence_events WHERE location_id = ? AND event_type = ? ORDER BY timestamp DESC LIMIT 1;',
    [locationId, eventType],
  );
  const rows = result.rows ?? [];
  if (rows.length === 0) {
    return null;
  }
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row.id as number,
    location_id: (row.location_id as number | null) ?? null,
    day_id: (row.day_id as number | null) ?? null,
    event_type: row.event_type as 'enter' | 'exit',
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    timestamp: row.timestamp as string,
  };
}
```

- [ ] **Step 4: Create the crossing store**

Create `src/services/crossingStore.ts`:

```ts
import {
  insertGeofenceEvent,
  getGeofenceEventsForDay,
  getLastGeofenceEvent,
} from '../db/locations';
import type {Crossing} from './endOfDay';

const DEDUP_WINDOW_MS = 60_000;

// In-memory last-seen per `${locationId}:${type}` — collapses the two producers
// (OS geofence + live-fix) firing for the same crossing within the same process.
const _lastSeen = new Map<string, number>();

/** Pure: is a crossing at nowMs a duplicate of one last seen at lastMs? */
export function isDuplicateCrossing(
  lastMs: number | null,
  nowMs: number,
  windowMs: number = DEDUP_WINDOW_MS,
): boolean {
  return lastMs !== null && nowMs - lastMs < windowMs;
}

/** Persist a crossing unless it duplicates a very recent same-key one. */
export async function recordCrossing(p: {
  locationId: number;
  dayId: number;
  type: 'enter' | 'exit';
  latitude: number | null;
  longitude: number | null;
  time: string;
}): Promise<void> {
  const key = `${p.locationId}:${p.type}`;
  const nowMs = new Date(p.time).getTime();
  let lastMs = _lastSeen.get(key) ?? null;
  if (lastMs === null) {
    // Cold-start fallback: consult the DB once.
    const last = await getLastGeofenceEvent(p.locationId, p.type);
    lastMs = last ? new Date(last.timestamp).getTime() : null;
  }
  if (isDuplicateCrossing(lastMs, nowMs)) {
    return;
  }
  _lastSeen.set(key, nowMs);
  await insertGeofenceEvent({
    location_id: p.locationId,
    day_id: p.dayId,
    event_type: p.type,
    latitude: p.latitude,
    longitude: p.longitude,
    timestamp: p.time,
  });
}

/** Read a day's crossings as ordered inference input. `kindOf` maps a location
 *  id to its saved kind (caller supplies it from the in-memory locations list). */
export async function crossingsForDay(
  dayId: number,
  kindOf: (locationId: number) => 'work' | 'home' | 'other',
): Promise<Crossing[]> {
  const events = await getGeofenceEventsForDay(dayId);
  return events
    .filter(e => e.location_id != null)
    .map(e => ({
      locationId: e.location_id as number,
      kind: kindOf(e.location_id as number),
      type: e.event_type,
      time: e.timestamp,
    }));
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest crossingStore`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/services/crossingStore.ts __tests__/crossingStore.test.ts src/db/locations.ts
git commit -m "feat(crossings): deduped crossing store over geofence_events"
```

---

## Task 4: Native — always-on geofence monitoring + crossing emit

**Files:**
- Create: `android/app/src/main/java/com/kelomitapp/location/GeofenceCrossingReceiver.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/LocationService.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces (native bridge): `BackgroundLocation.monitorPlaces(places: ReadableArray)` where each item is `{id: number, latitude: number, longitude: number, radius: number, kind: string}`.
- Produces (JS event): `onGeofenceCrossing` with `{locationId: number, type: 'enter'|'exit', latitude: number, longitude: number, timestamp: number}`.

**Note:** Native is device-verified, not unit-tested. Verify with `./gradlew :app:compileDebugKotlin` after edits.

- [ ] **Step 1: Create the crossing receiver**

Create `GeofenceCrossingReceiver.kt`:

```kotlin
package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/**
 * Always-on saved-place monitoring (separate from the parked-exit wake). On each
 * enter/exit transition it asks the running service to forward the crossing to
 * JS, which persists it + runs day-start/end inference. Independent of the GPS
 * fix stream — fires even while parked/dozing.
 */
class GeofenceCrossingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) return
    val type = when (event.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
      Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
      else -> return
    }
    val loc = event.triggeringLocation
    event.triggeringGeofences?.forEach { fence ->
      LocationService.instance?.onGeofenceCrossing(
        fence.requestId, type, loc?.latitude, loc?.longitude,
      )
    }
  }
}
```

- [ ] **Step 2: Add monitoring + emit to `LocationService.kt`**

Add a companion request-code constant near `NOTIF_ID`:

```kotlin
    const val CROSSING_REQUEST_CODE = 4712
```

Add a dedicated PendingIntent (next to `geofencePendingIntent`):

```kotlin
  private val crossingPendingIntent: PendingIntent by lazy {
    val intent = Intent(this, GeofenceCrossingReceiver::class.java)
    PendingIntent.getBroadcast(
      this, CROSSING_REQUEST_CODE, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
  }
```

Add the public methods (near `enterParked`):

```kotlin
  /** Register always-on ENTER+EXIT geofences for the given saved places (all
   *  work + home). Coarser radius floor for OS reliability; precise timing isn't
   *  needed for a workday boundary. Re-callable to replace the set. */
  @SuppressLint("MissingPermission")
  fun monitorPlaces(places: List<ParkFence>) {
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) return
    geofencingClient?.removeGeofences(crossingPendingIntent)
    if (places.isEmpty()) return
    val fences = places.map {
      Geofence.Builder()
        .setRequestId(it.id.toString())
        .setCircularRegion(it.latitude, it.longitude, maxOf(it.radiusM, 100f))
        .setExpirationDuration(Geofence.NEVER_EXPIRE)
        .setTransitionTypes(
          Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT,
        )
        .build()
    }
    val request = GeofencingRequest.Builder()
      .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
      .addGeofences(fences)
      .build()
    geofencingClient?.addGeofences(request, crossingPendingIntent)
    DiagLog.write(this, "crossing.monitor", "places=${places.size}")
  }

  /** Forward an OS geofence crossing to JS (persist + infer happen there). */
  fun onGeofenceCrossing(requestId: String, type: String, lat: Double?, lon: Double?) {
    val reactContext = (application as? ReactApplication)?.reactHost?.currentReactContext
    val map = Arguments.createMap().apply {
      putInt("locationId", requestId.toIntOrNull() ?: -1)
      putString("type", type)
      if (lat != null) putDouble("latitude", lat) else putNull("latitude")
      if (lon != null) putDouble("longitude", lon) else putNull("longitude")
      putDouble("timestamp", System.currentTimeMillis().toDouble())
    }
    DiagLog.write(this, "crossing.emit", "id=$requestId type=$type ctx=${reactContext != null}")
    reactContext?.emitDeviceEvent("onGeofenceCrossing", map)
  }
```

In `onDestroy`, add alongside the other `removeGeofences`:

```kotlin
    geofencingClient?.removeGeofences(crossingPendingIntent)
```

- [ ] **Step 3: Add the `monitorPlaces` bridge method**

In `BackgroundLocationModule.kt`, add (mirroring `enterParked`):

```kotlin
  @ReactMethod
  fun monitorPlaces(places: ReadableArray, promise: Promise) {
    try {
      val parsed = (0 until places.size()).mapNotNull { i ->
        val f = places.getMap(i) ?: return@mapNotNull null
        LocationService.ParkFence(
          id = f.getDouble("id").toLong(),
          latitude = f.getDouble("latitude"),
          longitude = f.getDouble("longitude"),
          radiusM = f.getDouble("radius").toFloat(),
        )
      }
      LocationService.instance?.monitorPlaces(parsed)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("monitor_places_failed", e)
    }
  }
```

- [ ] **Step 4: Register the receiver in the manifest**

In `AndroidManifest.xml`, next to `GeofenceExitReceiver`, add:

```xml
      <!-- Always-on saved-place monitoring for work arrive/leave detection. -->
      <receiver
        android:name=".location.GeofenceCrossingReceiver"
        android:exported="false" />
```

- [ ] **Step 5: Compile-verify Kotlin**

Run: `cd android && ./gradlew :app:compileDebugKotlin -q; echo exit=$?`
Expected: `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/kelomitapp/location/GeofenceCrossingReceiver.kt \
        android/app/src/main/java/com/kelomitapp/location/LocationService.kt \
        android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt \
        android/app/src/main/AndroidManifest.xml
git commit -m "feat(native): always-on geofence monitoring + onGeofenceCrossing emit"
```

---

## Task 5: JS bridge — monitorPlaces + crossing subscription

**Files:**
- Modify: `src/native/backgroundLocation.ts`

**Interfaces:**
- Consumes: native `BackgroundLocation.monitorPlaces`, `onGeofenceCrossing` event.
- Produces:
  ```ts
  interface MonitoredPlace { id: number; latitude: number; longitude: number; radius: number; kind: string; }
  interface CrossingEvent { locationId: number; type: 'enter' | 'exit'; latitude: number | null; longitude: number | null; timestamp: number; }
  function monitorPlaces(places: MonitoredPlace[]): void;
  function subscribeGeofenceCrossing(cb: (e: CrossingEvent) => void): {remove: () => void};
  ```

- [ ] **Step 1: Extend the native interface + add wrappers**

In `src/native/backgroundLocation.ts`, add `monitorPlaces` to the `BackgroundLocationNative` interface:

```ts
  monitorPlaces(places: MonitoredPlace[]): Promise<void>;
```

Then append at the end of the file:

```ts
export interface MonitoredPlace {
  id: number;
  latitude: number;
  longitude: number;
  radius: number; // metres (native floors this to >=100 for OS reliability)
  kind: string;
}

export interface CrossingEvent {
  locationId: number;
  type: 'enter' | 'exit';
  latitude: number | null;
  longitude: number | null;
  timestamp: number; // ms since epoch
}

/** (Re)register always-on OS geofences for saved places (work + home). No-op on
 *  binaries without the native method. */
export function monitorPlaces(places: MonitoredPlace[]): void {
  try {
    Native?.monitorPlaces?.(places)?.catch(() => {});
  } catch {
    // ignore
  }
}

/** Subscribe to OS geofence crossings (enter/exit of a saved place). */
export function subscribeGeofenceCrossing(
  cb: (e: CrossingEvent) => void,
): {remove: () => void} {
  return DeviceEventEmitter.addListener('onGeofenceCrossing', cb);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | rg backgroundLocation`
Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/native/backgroundLocation.ts
git commit -m "feat(bridge): monitorPlaces + subscribeGeofenceCrossing"
```

---

## Task 6: Day-detection orchestrator + gpsService integration

**Files:**
- Create: `src/services/dayDetection.ts`
- Modify: `src/services/gpsService.ts`

**Interfaces:**
- Consumes: `crossingsForDay`, `recordCrossing` (Task 3); `inferDay` (Task 2); `monitorPlaces`, `subscribeGeofenceCrossing`, `CrossingEvent` (Task 5); `getOrCreateDay`, `updateDay` (`src/db/days.ts`); `getLocations` (`src/db/locations.ts`); `createDayEndConfirmation` (`src/db/dayConfirmations.ts`); `displayDayEndConfirmation` (`src/services/notificationService.ts`).
- Produces:
  ```ts
  function startDayDetection(): void;   // subscribe + register places
  function stopDayDetection(): void;    // unsubscribe
  function runDayDetection(): Promise<void>; // re-run inference for today
  function recordAndInfer(e: CrossingEvent): Promise<void>;
  ```

- [ ] **Step 1: Create the orchestrator**

Create `src/services/dayDetection.ts`:

```ts
import {format} from 'date-fns';
import {getLocations} from '../db/locations';
import {getOrCreateDay, updateDay} from '../db/days';
import {createDayEndConfirmation} from '../db/dayConfirmations';
import {displayDayEndConfirmation} from './notificationService';
import {inferDay} from './endOfDay';
import {recordCrossing, crossingsForDay} from './crossingStore';
import {
  monitorPlaces,
  subscribeGeofenceCrossing,
  type CrossingEvent,
} from '../native/backgroundLocation';
import type {SavedLocation} from '../types';

let _sub: {remove: () => void} | null = null;
let _locations: SavedLocation[] = [];

async function loadLocations(): Promise<void> {
  try {
    _locations = await getLocations();
  } catch {
    _locations = [];
  }
}

function kindOf(locationId: number): 'work' | 'home' | 'other' {
  const loc = _locations.find(l => l.id === locationId);
  const k = loc?.kind;
  return k === 'work' || k === 'home' ? k : 'other';
}

/** Re-derive today's start/end from persisted crossings and apply it. Only fills
 *  empty values, and stamps them 'auto' so a manual edit is never overwritten. */
export async function runDayDetection(): Promise<void> {
  try {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const day = await getOrCreateDay(todayStr);
    const crossings = await crossingsForDay(day.id, kindOf);
    const r = inferDay({
      crossings,
      now: new Date().toISOString(),
      startedAtSet: !!day.started_at,
      endedAtSet: !!day.ended_at,
    });
    if (r.startedAt && !day.started_at) {
      await updateDay(day.id, {started_at: r.startedAt, started_at_source: 'auto'});
    }
    if (r.endedAt && !day.ended_at) {
      await updateDay(day.id, {ended_at: r.endedAt, ended_at_source: 'auto'});
      if (r.confirmEnd) {
        try {
          const id = await createDayEndConfirmation(day.id, r.endedAt);
          await displayDayEndConfirmation(day.id, r.endedAt, id);
        } catch {
          // confirmation is best-effort
        }
      }
    }
  } catch {
    // never crash tracking over detection
  }
}

/** Persist an incoming crossing, then re-run inference. */
export async function recordAndInfer(e: CrossingEvent): Promise<void> {
  try {
    if (e.locationId < 0) return;
    const dayStr = format(new Date(e.timestamp), 'yyyy-MM-dd');
    const day = await getOrCreateDay(dayStr);
    await recordCrossing({
      locationId: e.locationId,
      dayId: day.id,
      type: e.type,
      latitude: e.latitude,
      longitude: e.longitude,
      time: new Date(e.timestamp).toISOString(),
    });
    await runDayDetection();
  } catch {
    // best-effort
  }
}

/** Register monitored places and subscribe to crossings. Call on tracking-start. */
export async function startDayDetection(): Promise<void> {
  await loadLocations();
  const places = _locations
    .filter(l => l.kind === 'work' || l.kind === 'home')
    .map(l => ({
      id: l.id,
      latitude: l.latitude,
      longitude: l.longitude,
      radius: l.radius_m,
      kind: l.kind,
    }));
  monitorPlaces(places);
  _sub?.remove();
  _sub = subscribeGeofenceCrossing(recordAndInfer);
}

export function stopDayDetection(): void {
  _sub?.remove();
  _sub = null;
}
```

- [ ] **Step 2: Trim `processGeofences` to a producer + record via the store**

In `src/services/gpsService.ts`, replace the body of `processGeofences` (the enter/exit loop that inserts events and calls `applyEndOfDay`) so it records crossings through the store and drops all eod logic. Replace the whole function with:

```ts
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
```

- [ ] **Step 3: Remove the eod coupling from gpsService**

In `src/services/gpsService.ts`:
- Delete the `applyEndOfDay` function (the whole `async function applyEndOfDay(...) {...}` block).
- Delete the module state lines `let _eod: EodState = ...` and `let _eodDay: string | null = null;`.
- Remove the imports of `evaluateEndOfDay, initialEodState, type EodEvent, type EodState` from `./endOfDay`, `createDayEndConfirmation` from `../db/dayConfirmations`, and `displayDayEndConfirmation` from `../services/notificationService` **only if** no longer referenced in the file (they moved to `dayDetection.ts`). Leave `usualHoursForDate`/`updateDay` if still used elsewhere.
- Add imports:

```ts
import {recordCrossing} from './crossingStore';
import {startDayDetection, stopDayDetection, runDayDetection} from './dayDetection';
```

- [ ] **Step 4: Simplify `canPark`**

In `handlePosition`, change the `canPark` line to drop the pending-exit term (end detection no longer needs live ticks):

```ts
  // Park (zero GPS requests; woken by OS geofence-exit + activity-recognition)
  // when the native FGS is running and we're inside a saved place. End-of-day
  // detection no longer depends on live ticks (OS geofence + re-derive), so the
  // old pendingExit guard is gone.
  const canPark = _nativeActive && _insideIds.size > 0;
```

- [ ] **Step 5: Wire the orchestrator into start/stop tracking**

In `startTracking`, after `_geofences` is loaded / native is set up, call detection start (place near the native block):

```ts
  startDayDetection();
```

In `stopTracking`, add near the other teardown:

```ts
  stopDayDetection();
```

In the AppState `hookAppState` handler, when the app becomes `'active'`, re-derive today:

```ts
    if (s === 'active') {
      runDayDetection();
    }
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx jest`
Expected: all pass (including the new endOfDay + crossingStore suites).

- [ ] **Step 7: Commit**

```bash
git add src/services/dayDetection.ts src/services/gpsService.ts
git commit -m "feat(detection): orchestrator + decouple eod from the live fix loop"
```

---

## Task 7: Rework the DayView live label off crossing state

**Files:**
- Modify: `src/services/gpsService.ts` (`getCurrentGeofenceDetection`)

**Interfaces:**
- Consumes: `_insideIds`, `_geofences` (already in module).
- Produces: `getCurrentGeofenceDetection(): GeofenceDetection` — unchanged signature; DayView untouched.

**Note:** `_insideIds` is still maintained by `processGeofences` (Task 6, Step 2), so the existing implementation keeps working. This task only updates the doc comment to reflect that membership now also advances via the OS-geofence producer path is *not* reflected here (the label stays a foreground, live-fix view — acceptable).

- [ ] **Step 1: Update the doc comment**

In `src/services/gpsService.ts`, replace the `getCurrentGeofenceDetection` doc comment with:

```ts
/**
 * Which kind of saved place we're currently inside, for the Home-screen
 * "Where am I?" label. Reads live geofence membership (`_insideIds`), advanced
 * by the live-fix producer while the app is foreground. This is a best-effort
 * live indicator only — the authoritative arrive/leave record is the persisted
 * crossing store. 'unknown' right after launch until the first fix.
 */
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpsService.ts
git commit -m "docs(gps): clarify getCurrentGeofenceDetection is a live-only label"
```

---

## Task 8: Stamp manual day-time edits with source='manual'

**Files:**
- Modify: `src/store/dayStore.ts` (`updateDayTimes`)

**Interfaces:**
- Consumes: `updateDay(id, fields)` accepting `started_at_source`/`ended_at_source` (Task 1).

- [ ] **Step 1: Stamp the source on manual edits**

In `src/store/dayStore.ts`, in `updateDayTimes`, before calling `updateDay`, augment the fields so that any manually-changed time carries a `'manual'` source. Replace the field pass-through with:

```ts
    const stamped = {...fields};
    if ('started_at' in fields) {
      stamped.started_at_source = 'manual';
    }
    if ('ended_at' in fields) {
      stamped.ended_at_source = 'manual';
    }
    await updateDay(day.id, stamped);
```

(Adapt the surrounding lines to however `updateDayTimes` currently resolves `day`/`id` — keep that logic; only add the stamping.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/store/dayStore.ts
git commit -m "feat(days): mark manual time edits as source=manual"
```

---

## Task 9: Full verification + device checklist

**Files:** none (verification only).

- [ ] **Step 1: Full static gate**

Run: `npx tsc --noEmit && npx jest && (cd android && ./gradlew :app:compileDebugKotlin -q)`
Expected: tsc clean, all jest suites pass, gradle exit 0.

- [ ] **Step 2: Rebuild + uninstall/reinstall on device**

Back up the DB first. Uninstall→reinstall (schema migration v18 + new receiver component).

- [ ] **Step 3: On-device work-day verification (the real proof)**

With background tracking on, watch the diag log (`KelomitLoc` / on-device diag):
- On tracking start: `crossing.monitor places=3`.
- Arrive at work → `crossing.emit type=enter` → `days.started_at` auto-filled (source `auto`).
- Leave work → home → `crossing.emit` exit then home enter → `days.ended_at` = the work departure time, **no** confirmation.
- Simulate an errand day (leave work, stay out > 1 h, don't go home, reopen app) → `ended_at` set + a "Did you leave work at hh:mm?" confirmation appears (notification and/or in-app banner).
- Manually edit a time in the day view → re-open app → inference does **not** overwrite it (source `manual`).

- [ ] **Step 4: Capture + hand back**

Drop the backup + diag log in `realUserData/` for review.

---

## Self-Review

**Spec coverage:**
- OS-geofence primary producer → Task 4. Live-fix secondary producer → Task 6 Step 2. Crossing store + dedup → Task 3. Pure inference (start/end/confirm rules) → Task 2. Orchestrator (crossing/foreground/tracking-start triggers, place registration) → Task 6. Source columns / never-overwrite → Tasks 1, 6, 8. `canPark` de-coupling → Task 6 Step 4. DayView label → Task 7. Error handling (best-effort, geofence-fail fallback) → Tasks 4/6 (try-catch + live-fix backstop). Testing → Tasks 2, 3, 9. Non-goals (headless force-kill, leg 2, midnight) not implemented — correct.
- All spec sections map to a task. No gaps.

**Placeholder scan:** No TBD/TODO; every code step has complete code. Task 6 Step 3 references "if no longer referenced" — that's a concrete conditional the implementer resolves by grep, not a placeholder.

**Type consistency:** `Crossing` (Task 2) reused by Task 3/6. `CrossingEvent`/`MonitoredPlace` (Task 5) consumed by Task 6. `recordCrossing` param shape identical in Tasks 3 and 6. `inferDay`/`DetectionResult` fields (`startedAt`/`endedAt`/`confirmEnd`) consistent across Tasks 2 and 6. Native `monitorPlaces`/`onGeofenceCrossing` names match between Tasks 4 and 5. Consistent.
