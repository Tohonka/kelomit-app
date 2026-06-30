# Adaptive Movement-Trail Sampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sample GPS fast (~4 s) while moving and slow (~60 s) while still, so the day trail follows streets without draining the battery all day.

**Architecture:** A pure two-state machine (`trackingMode.ts`) decides `'fast' | 'slow'` from the `speed`/displacement already in each fix. `gpsService` tracks the mode and re-arms the `watchPosition` watch with the matching interval when the mode changes. Tighten to fast immediately on movement; relax to slow only after a sustained still streak (hysteresis).

**Tech Stack:** React Native, TypeScript, `@react-native-community/geolocation`, Jest.

## Global Constraints

- No new dependencies — Metro reload only, no native rebuild/sideload.
- FAST interval = `4000` ms; SLOW interval = the existing `gps_interval_ms` setting (default 60000) — no new setting.
- Tighten to `'fast'` immediately on any moving fix; relax to `'slow'` only after `STATIONARY_STREAK_TO_SLOW` consecutive non-moving fixes.
- Movement detection uses the fused `speed` field when present, else displacement ÷ elapsed; `MOVE_SPEED_MS = 1.0` m/s.
- `distanceFilter` stays 10 m. The jitter gate, 7-day retention, and geofence-on-every-fix behavior are unchanged.
- All thresholds are named constants carrying a `ponytail:` device-tune note.
- Verify with `npm run check` (lint + tsc + jest) where it applies; re-arming/battery are device-soak only.
- Per-task commits only; the user reviews/pushes.

---

### Task 1: Tracking-mode decision (pure util)

**Files:**
- Create: `src/services/trackingMode.ts`
- Test: `__tests__/trackingMode.test.ts`

**Interfaces:**
- Produces:
  - `type TrackingMode = 'fast' | 'slow'`
  - `MOVE_SPEED_MS: number` (1.0), `STATIONARY_STREAK_TO_SLOW: number` (3)
  - `isMoving(speed: number | null, displacementM: number, elapsedMs: number): boolean`
  - `nextTrackingMode(prev: TrackingMode, movingNow: boolean, stationaryStreak: number): TrackingMode`

- [ ] **Step 1: Write the failing test**

Create `__tests__/trackingMode.test.ts`:

```ts
import {
  isMoving,
  nextTrackingMode,
  STATIONARY_STREAK_TO_SLOW,
} from '../src/services/trackingMode';

describe('isMoving', () => {
  it('uses speed when present (moving)', () => {
    expect(isMoving(2.0, 0, 1000)).toBe(true);
  });

  it('uses speed when present and ignores displacement (still)', () => {
    // speed says still even though displacement is large → still
    expect(isMoving(0.2, 9999, 1000)).toBe(false);
  });

  it('falls back to displacement/elapsed when speed is null (moving)', () => {
    expect(isMoving(null, 30, 10_000)).toBe(true); // 3 m/s
  });

  it('falls back to displacement/elapsed when speed is null (still)', () => {
    expect(isMoving(null, 2, 10_000)).toBe(false); // 0.2 m/s
  });

  it('is not moving on the first fix (no speed, zero elapsed)', () => {
    expect(isMoving(null, 0, 0)).toBe(false);
  });
});

describe('nextTrackingMode', () => {
  it('tightens to fast immediately on movement', () => {
    expect(nextTrackingMode('slow', true, 99)).toBe('fast');
  });

  it('stays in the previous mode while still but under the streak threshold', () => {
    expect(nextTrackingMode('fast', false, STATIONARY_STREAK_TO_SLOW - 1)).toBe('fast');
  });

  it('relaxes to slow once the still streak is reached', () => {
    expect(nextTrackingMode('fast', false, STATIONARY_STREAK_TO_SLOW)).toBe('slow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest trackingMode`
Expected: FAIL — cannot find module `../src/services/trackingMode`.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/trackingMode.ts`:

```ts
export type TrackingMode = 'fast' | 'slow';

// ponytail: movement thresholds are field-tuning knobs; adjust on device.
export const MOVE_SPEED_MS = 1.0; // m/s (~3.6 km/h) at/above which we treat as moving
export const STATIONARY_STREAK_TO_SLOW = 3; // consecutive still fixes before backing off

/**
 * Whether the device is moving. Prefers the fused `speed` field; falls back to
 * displacement over elapsed time when speed is unavailable (null).
 */
export function isMoving(
  speed: number | null,
  displacementM: number,
  elapsedMs: number,
): boolean {
  if (speed != null) {
    return speed >= MOVE_SPEED_MS;
  }
  if (elapsedMs <= 0) {
    return false;
  }
  return displacementM / (elapsedMs / 1000) >= MOVE_SPEED_MS;
}

/**
 * Desired sampling mode. Tighten to 'fast' immediately on movement; relax to
 * 'slow' only after a sustained still streak (hysteresis — no flapping at a
 * stoplight).
 */
export function nextTrackingMode(
  prev: TrackingMode,
  movingNow: boolean,
  stationaryStreak: number,
): TrackingMode {
  if (movingNow) {
    return 'fast';
  }
  if (stationaryStreak >= STATIONARY_STREAK_TO_SLOW) {
    return 'slow';
  }
  return prev;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest trackingMode`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/trackingMode.ts __tests__/trackingMode.test.ts
git commit -m "feat(gps): tracking-mode decision util (isMoving + nextTrackingMode)"
```

---

### Task 2: Adaptive watch re-arming in gpsService

**Files:**
- Modify: `src/services/gpsService.ts`

**Interfaces:**
- Consumes: `isMoving`, `nextTrackingMode`, `TrackingMode` (Task 1); existing `distanceMeters`, `isOutlier`, `isStationaryJitter`, `TRAIL_DISTANCE_FILTER_M`.
- Produces: behavioral change only — adaptive sampling. No new exports.

This is integration glue over device I/O; it has NO unit test (the existing `gpsService` is untested I/O). Its gate is `npm run check` green; re-arming and battery are device-soak. Do NOT add a mock-heavy test.

- [ ] **Step 1: Import the tracking-mode util**

In `src/services/gpsService.ts`, change the locationUtils import line:

```ts
import {isOutlier, distanceMeters, isStationaryJitter} from './locationUtils';
```

to add a new import directly below it:

```ts
import {isOutlier, distanceMeters, isStationaryJitter} from './locationUtils';
import {isMoving, nextTrackingMode, type TrackingMode} from './trackingMode';
```

- [ ] **Step 2: Add adaptive-sampling module state**

After this existing line:

```ts
let _lastRecordedPosition: KnownPosition | null = null;
```

add:

```ts
// Adaptive sampling state: 'fast' while moving (dense trail), 'slow' while still
// (battery). The watch is re-armed when the mode changes. See trackingMode.ts.
let _trackingMode: TrackingMode = 'fast';
let _stationaryStreak = 0;
let _slowIntervalMs = 60_000; // set from startTracking's arg (the gps_interval_ms setting)
// ponytail: tune on device.
const FAST_INTERVAL_MS = 4_000;
```

- [ ] **Step 3: Extract a re-armable watch + start in fast**

Replace the entire `startTracking` function:

```ts
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
  // Start in FAST so a trip already in progress at launch records densely; the
  // passed interval becomes the SLOW (stationary) cadence.
  _slowIntervalMs = intervalMs;
  _trackingMode = 'fast';
  _stationaryStreak = 0;
  armWatch(FAST_INTERVAL_MS);
}

/** (Re)create the position watch at the given interval. Clears any existing
 *  watch first, so it doubles as the re-arm used on a mode change. */
function armWatch(intervalMs: number): void {
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
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
      distanceFilter: TRAIL_DISTANCE_FILTER_M, // metres — minimum movement before update
      interval: intervalMs,
      fastestInterval: Math.min(intervalMs, 15_000),
    },
  );
}
```

- [ ] **Step 4: Reset adaptive state on stop**

Replace the entire `stopTracking` function:

```ts
export function stopTracking(): void {
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  _lastRecordedPosition = null;
  _trackingMode = 'fast';
  _stationaryStreak = 0;
}
```

- [ ] **Step 5: Compute movement + re-arm in handlePosition**

Replace the top of `handlePosition` — from its signature down to and including the `_lastPosition = {...};` assignment line — with the version below. (Leave the `// Persist to DB + run geofence detection` try-block that follows exactly as-is.)

Current text to replace:

```ts
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
```

Replacement:

```ts
async function handlePosition(
  pos: GeolocationResponse,
): Promise<void> {
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
    movingNow = isMoving(speed, disp, elapsedMs);
  }

  _lastPosition = {latitude, longitude, accuracy: accuracy ?? null, timestamp: now};

  // Adaptive sampling: fast while moving, slow while still. Re-arm the watch
  // only when the desired mode actually changes.
  _stationaryStreak = movingNow ? 0 : _stationaryStreak + 1;
  const desiredMode = nextTrackingMode(_trackingMode, movingNow, _stationaryStreak);
  if (desiredMode !== _trackingMode) {
    _trackingMode = desiredMode;
    armWatch(desiredMode === 'fast' ? FAST_INTERVAL_MS : _slowIntervalMs);
  }
```

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: lint clean, tsc no errors, all jest suites pass (existing + Task 1's 8 new trackingMode tests).

- [ ] **Step 7: Commit**

```bash
git add src/services/gpsService.ts
git commit -m "feat(gps): adaptive 4s/60s sampling — fast while moving, slow while still"
```

---

## Device soak (post-merge, manual)

Pure logic is covered by Jest; the rest is device-only:
- Drive/walk a route → trail follows the road, no big corner-cutting straight lines (dense ~4 s points while moving).
- Sit still a while → points stop piling up and the interval backs off (confirm battery isn't hammered; check that geofence day start/end still fires).
- Start app mid-trip → records densely from the first fixes (starts in FAST).
- Watch for the start-of-trip lag: if the first block of a commute is missed, lower the `gps_interval_ms` setting (the SLOW cadence).

## Deferred
- Native activity recognition (`react-native-activity-recognition`) — upgrade path; needs rebuild + sideload.
- Surfacing FAST/SLOW or thresholds as user settings — only if device tuning shows a need.
