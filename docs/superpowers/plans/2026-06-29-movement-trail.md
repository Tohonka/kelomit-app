# Movement Trail + 7-day Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a denser, drift-free workday GPS trail and retain raw points for 7 days so routes can be re-plotted after editing hours.

**Architecture:** Lower the location watch's `distanceFilter` to 10 m for a faithful path, add a pure JS "stationary-jitter" gate that skips trail DB writes caused by GPS drift while standing still, and add a startup prune that deletes raw `gps_track` points older than 7 days. Geofence/day-start-end logic still runs on every fix; only the trail write is gated.

**Tech Stack:** React Native, TypeScript, `@react-native-community/geolocation`, op-sqlite (via `src/db`), Jest.

## Global Constraints

- No new dependencies — **Metro reload only, no native rebuild/sideload.**
- Only the raw dense trail (`gps_track`) is transient; days, notes, geofence events, and start/end times are never pruned.
- Recording is never gated by work hours (error-correction intent; the 7-day window is the safety net).
- Tests are plain Jest in top-level `__tests__/`, importing from `../src/...`; pure utils only (no DB mocking).
- Verify with `npm run check` (lint + tsc + jest).
- Do not auto-commit beyond the per-task commits in this plan; the user reviews/pushes.

---

### Task 1: Stationary-jitter gate (pure util)

**Files:**
- Modify: `src/services/locationUtils.ts`
- Test: `__tests__/locationUtils.test.ts` (create)

**Interfaces:**
- Consumes: `distanceMeters(lat1, lon1, lat2, lon2): number` (already in `locationUtils.ts`).
- Produces:
  - `interface RecordedPoint { latitude: number; longitude: number; accuracy: number | null }`
  - `isStationaryJitter(prev: RecordedPoint, lat: number, lon: number, accuracy: number | null, speed: number | null): boolean` — true ⇒ skip the trail write (the fix is GPS drift while stationary).

- [ ] **Step 1: Write the failing test**

Create `__tests__/locationUtils.test.ts`:

```ts
import {isStationaryJitter, type RecordedPoint} from '../src/services/locationUtils';

const at = (latitude: number, longitude: number, accuracy: number | null = 10): RecordedPoint => ({
  latitude,
  longitude,
  accuracy,
});

describe('isStationaryJitter', () => {
  it('rejects small drift while reported stationary', () => {
    // ~5 m north, speed ~0 → jitter
    expect(isStationaryJitter(at(60.17, 24.94), 60.170045, 24.94, 10, 0)).toBe(true);
  });

  it('keeps a point when the device reports real movement', () => {
    // small move but speed says walking → record
    expect(isStationaryJitter(at(60.17, 24.94), 60.170045, 24.94, 10, 1.4)).toBe(false);
  });

  it('keeps a large move even when speed is unknown', () => {
    // ~50 m north, speed null → beyond noise, record
    expect(isStationaryJitter(at(60.17, 24.94), 60.17045, 24.94, 10, null)).toBe(false);
  });

  it('rejects small drift when speed is unknown (uses accuracy floor)', () => {
    // ~5 m, accuracy null → noise floor 8 m, 8*1.5=12 m, 5 < 12 → jitter
    expect(isStationaryJitter(at(60.17, 24.94, null), 60.170045, 24.94, null, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest locationUtils -t isStationaryJitter`
Expected: FAIL — `isStationaryJitter is not a function` / module export missing.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/locationUtils.ts` (keep existing `distanceMeters` / `isOutlier`):

```ts
// --- Stationary-jitter gate -------------------------------------------------
// A 10 m trail filter would otherwise log GPS drift (the fix wobbles several
// metres while you stand still) as fake movement. Skip a trail write when the
// device reports ~no speed AND the move is within plausible accuracy noise,
// compared against the last *recorded* point so slow drift can't accumulate
// into a phantom trail.
// ponytail: thresholds are field-tuning knobs; adjust on device, don't expand
// into a config until there's a reason.
const STILL_SPEED_MS = 0.5; // below this the device is treated as stationary
const JITTER_FLOOR_M = 8; // minimum noise even when reported accuracy is rosy
const JITTER_K = 1.5; // multiple of accuracy still treated as noise

export interface RecordedPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export function isStationaryJitter(
  prev: RecordedPoint,
  lat: number,
  lon: number,
  accuracy: number | null,
  speed: number | null,
): boolean {
  const moving = speed != null && speed >= STILL_SPEED_MS;
  if (moving) {
    return false;
  }
  const dist = distanceMeters(prev.latitude, prev.longitude, lat, lon);
  const noise = Math.max(accuracy ?? 0, prev.accuracy ?? 0, JITTER_FLOOR_M);
  return dist < noise * JITTER_K;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest locationUtils -t isStationaryJitter`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/locationUtils.ts __tests__/locationUtils.test.ts
git commit -m "feat(gps): stationary-jitter gate util for trail recording"
```

---

### Task 2: 7-day retention prune (DB)

**Files:**
- Modify: `src/db/gps.ts`
- Test: `__tests__/gpsRetention.test.ts` (create)

**Interfaces:**
- Consumes: `getDB()` from `./database` (already imported in `src/db/gps.ts`).
- Produces:
  - `retentionCutoffIso(nowMs: number, days: number): string` — ISO timestamp `days` before `nowMs`.
  - `pruneGpsTracksOlderThan(days?: number): Promise<void>` — deletes `gps_track` rows with `timestamp` before the cutoff (default 7 days).

- [ ] **Step 1: Write the failing test**

Create `__tests__/gpsRetention.test.ts` (pure cutoff calc only — no DB):

```ts
import {retentionCutoffIso} from '../src/db/gps';

describe('retentionCutoffIso', () => {
  it('returns the ISO timestamp N days before now', () => {
    const now = Date.parse('2026-06-29T12:00:00.000Z');
    expect(retentionCutoffIso(now, 7)).toBe('2026-06-22T12:00:00.000Z');
  });

  it('handles a 1-day window', () => {
    const now = Date.parse('2026-06-29T00:00:00.000Z');
    expect(retentionCutoffIso(now, 1)).toBe('2026-06-28T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest gpsRetention`
Expected: FAIL — `retentionCutoffIso is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/db/gps.ts`:

```ts
const DAY_MS = 86_400_000;

/** ISO timestamp `days` before `nowMs`. Pure, for testability. */
export function retentionCutoffIso(nowMs: number, days: number): string {
  return new Date(nowMs - days * DAY_MS).toISOString();
}

/**
 * Delete raw trail points older than the retention window. Only the dense
 * `gps_track` is transient — days/notes/geofence events are never touched.
 * ISO timestamps compare lexicographically, so a string `<` is correct.
 */
export async function pruneGpsTracksOlderThan(days = 7): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM gps_track WHERE timestamp < ?;', [
    retentionCutoffIso(Date.now(), days),
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest gpsRetention`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/gps.ts __tests__/gpsRetention.test.ts
git commit -m "feat(gps): 7-day raw-trail retention prune"
```

---

### Task 3: Denser recording + gate wiring (gpsService)

**Files:**
- Modify: `src/services/gpsService.ts`

**Interfaces:**
- Consumes: `isStationaryJitter`, `RecordedPoint` (Task 1); existing `insertGpsPoint`, `distanceMeters`, `isOutlier`.
- Produces: behavioral change only — denser trail, drift-gated writes. No new exports.

This task is integration glue over device I/O; it has no clean unit test (the existing `gpsService` is untested I/O). Its gate is `npm run check` green + a device soak. Do NOT invent a brittle mock-heavy test.

- [ ] **Step 1: Lower the distance filter**

In `src/services/gpsService.ts`, add a named const near the top (after the imports / module state, e.g. by `let _watchId`):

```ts
// Trail point spacing. Tighter than the old 20 m so the path reflects real
// movement; stationary GPS drift is rejected by isStationaryJitter below.
const TRAIL_DISTANCE_FILTER_M = 10;
```

In `startTracking`, change the watch option `distanceFilter: 20,` to:

```ts
      distanceFilter: TRAIL_DISTANCE_FILTER_M, // metres — minimum movement before update
```

- [ ] **Step 2: Import the gate and add a last-recorded anchor**

Update the import from `./locationUtils`:

```ts
import {isOutlier, distanceMeters, isStationaryJitter} from './locationUtils';
```

Add module state beside `let _lastPosition: KnownPosition | null = null;`:

```ts
// Last point actually written to the trail (gate compares against this, not the
// last *seen* fix, so slow drift can't accumulate into a phantom trail).
let _lastRecordedPosition: KnownPosition | null = null;
```

In `stopTracking`, reset the anchor so a resume after a long pause re-anchors cleanly. Change:

```ts
export function stopTracking(): void {
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}
```

to:

```ts
export function stopTracking(): void {
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  _lastRecordedPosition = null;
}
```

- [ ] **Step 3: Gate the trail write in handlePosition**

In `handlePosition`, replace the persist block. Current:

```ts
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
```

Replace with (geofences still run on every fix; only the trail write is gated):

```ts
  // Persist to DB + run geofence detection
  try {
    const iso = new Date(now).toISOString();
    const todayStr = format(new Date(now), 'yyyy-MM-dd');
    const day = await getOrCreateDay(todayStr);
    // Skip the trail write for stationary GPS drift; keep geofence/day logic
    // running on every accepted fix so start/end inference stays responsive.
    const jitter =
      _lastRecordedPosition != null &&
      isStationaryJitter(
        _lastRecordedPosition,
        latitude,
        longitude,
        accuracy ?? null,
        pos.coords.speed ?? null,
      );
    if (!jitter) {
      await insertGpsPoint({
        day_id: day.id,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        altitude: pos.coords.altitude ?? null,
        speed: pos.coords.speed ?? null,
        timestamp: iso,
      });
      _lastRecordedPosition = {latitude, longitude, accuracy: accuracy ?? null, timestamp: now};
    }
    await processGeofences(latitude, longitude, day, iso);
  } catch {
    // Don't crash the app on DB write failure
  }
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: lint clean, tsc no errors, all jest suites pass (existing 83 + Tasks 1–2 new).

- [ ] **Step 5: Commit**

```bash
git add src/services/gpsService.ts
git commit -m "feat(gps): denser 10m trail with stationary-jitter gating"
```

---

### Task 4: Prune on startup (App.tsx)

**Files:**
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `pruneGpsTracksOlderThan` (Task 2).
- Produces: startup side effect — stale trail points cleared once per launch.

- [ ] **Step 1: Import the prune**

In `App.tsx`, beside the existing `import {initDB} from './src/db/database';`, add:

```ts
import {pruneGpsTracksOlderThan} from './src/db/gps';
```

- [ ] **Step 2: Call it in the initDB block**

In the `initDB().then(() => { ... })` block, add a best-effort prune alongside the existing calls (after `setDbReady(true); load();`):

```ts
        // Drop raw trail points past the retention window (best-effort).
        pruneGpsTracksOlderThan().catch(() => {});
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: lint clean, tsc no errors, all jest suites pass.

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat(gps): prune raw trail older than 7 days on startup"
```

---

## Device soak (post-merge, manual)

Pure logic is covered by Jest; battery and field fidelity are device-only:
- Walk/drive a route → confirm the trail on `DayMapScreen` follows the actual path (denser than before, no zig-zag drift while stopped).
- Stand still several minutes → confirm few/no points accrue (jitter gate working).
- Relaunch after a few days of data → confirm points older than 7 days are gone, recent days intact.
- Edit a past day's hours → confirm the map still shows the full retained trail.

## Deferred (not in this plan)
- Activity-recognition native dep (battery gating) — needs rebuild + sideload.
- Work-hours recording limit — intentionally omitted (would defeat error-correction).
- Per-day "stop tracking for today" control.
- Polyline simplification — add only if `DayMapScreen` lags on device; leave a `ponytail:` marker at the render site when it does.
