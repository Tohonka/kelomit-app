# Resilient Dual-Source Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the JS watch as an always-on baseline plus the native FGS as an additional source, with a dedup gate, so tracking is never worse than the pre-5.7 build.

**Architecture:** `startTracking` always arms the JS `watchPosition`; when `background_tracking` is on it *also* subscribes to the native foreground-service fixes. Both call the one `handlePosition`, which now drops fixes arriving within `MIN_FIX_GAP_MS` of the last accepted one so the two sources don't double-count.

**Tech Stack:** React Native, TypeScript, `@react-native-community/geolocation`, the native `BackgroundLocation` module, Jest.

## Global Constraints

- No new dependencies. JS-only changes → Metro reload (no rebuild needed for this iteration; the native FGS from 5.7 is unchanged).
- The JS watch runs whenever tracking is on (foreground + background) — the pre-5.7 baseline that got 563 pts/day. Native is additive when `background_tracking` is on.
- One `desiredMode` drives BOTH sources: `armWatch(ms)` always; `setBackgroundInterval(ms)` when native is active.
- Dedup: drop a fix if the previous accepted fix arrived < `MIN_FIX_GAP_MS` (2000 ms, wall-clock `Date.now()`) ago; gate sits at the very top of `handlePosition` (a duplicate skips outlier/adaptive/jitter/geofence). Never drops legitimate single-source fixes (min real gap ≈ 4 s ≫ 2 s).
- Verify with `npm run check`; the dual-source seam + battery are device-verified.
- Per-task commits only; the user reviews/pushes.

---

### Task 1: Cross-source dedup util

**Files:**
- Modify: `src/services/trackingMode.ts`
- Test: `__tests__/trackingMode.test.ts`

**Interfaces:**
- Produces:
  - `MIN_FIX_GAP_MS: number` (2000)
  - `isDuplicateFix(nowMs: number, lastAcceptedMs: number, minGapMs?: number): boolean` — true when `nowMs` is within `minGapMs` of `lastAcceptedMs`; `lastAcceptedMs <= 0` means "none yet" → false.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/trackingMode.test.ts` (keep the existing imports/tests; extend the import and add a describe block):

Change the import at the top to add the new names:

```ts
import {
  isMoving,
  nextTrackingMode,
  isDuplicateFix,
  MIN_FIX_GAP_MS,
  STATIONARY_STREAK_TO_SLOW,
} from '../src/services/trackingMode';
```

Add at the end of the file:

```ts
describe('isDuplicateFix', () => {
  it('is not a duplicate when there is no prior accepted fix', () => {
    expect(isDuplicateFix(10_000, 0)).toBe(false);
  });

  it('flags a fix arriving within the gap as a duplicate', () => {
    expect(isDuplicateFix(10_500, 10_000)).toBe(true); // 500ms < 2000ms
  });

  it('accepts a fix arriving after the gap', () => {
    expect(isDuplicateFix(14_000, 10_000)).toBe(false); // 4000ms >= 2000ms
  });

  it('treats a fix exactly at the gap boundary as not a duplicate', () => {
    expect(isDuplicateFix(10_000 + MIN_FIX_GAP_MS, 10_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest trackingMode -t isDuplicateFix`
Expected: FAIL — `isDuplicateFix is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/trackingMode.ts`:

```ts
// Two fix sources (JS watch + native FGS) can both fire; a fix arriving within
// this window of the last accepted one is treated as the other source's duplicate.
// ponytail: tune on device.
export const MIN_FIX_GAP_MS = 2000;

/**
 * Whether a fix arriving at `nowMs` duplicates one already accepted at
 * `lastAcceptedMs` (within `minGapMs`). `lastAcceptedMs <= 0` means none yet.
 */
export function isDuplicateFix(
  nowMs: number,
  lastAcceptedMs: number,
  minGapMs: number = MIN_FIX_GAP_MS,
): boolean {
  if (lastAcceptedMs <= 0) {
    return false;
  }
  return nowMs - lastAcceptedMs < minGapMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest trackingMode`
Expected: PASS (existing tests + 4 new isDuplicateFix tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/trackingMode.ts __tests__/trackingMode.test.ts
git commit -m "feat(gps): cross-source fix dedup util (isDuplicateFix)"
```

---

### Task 2: Dual-source seam + dedup gate in gpsService

**Files:**
- Modify: `src/services/gpsService.ts`

**Interfaces:**
- Consumes: `isDuplicateFix` (Task 1); existing `armWatch`, `subscribeBackgroundLocation`, `startBackgroundLocationService`, `stopBackgroundLocationService`, `setBackgroundInterval`, `isBackgroundLocationAvailable`, `handleNativeFix`.
- Produces: behavioral change only — JS + native run together, deduped. No new exports.

Integration glue over device I/O; no unit test (gpsService is untested I/O). Gate: `npm run check` green; real verification is device soak. Do NOT add mock-heavy tests.

- [ ] **Step 1: Import the dedup util**

In `src/services/gpsService.ts`, change the trackingMode import:

```ts
import {isMoving, nextTrackingMode, type TrackingMode} from './trackingMode';
```

to:

```ts
import {isMoving, nextTrackingMode, isDuplicateFix, type TrackingMode} from './trackingMode';
```

- [ ] **Step 2: Replace the `_source` state with `_nativeActive` + dedup clock**

Replace these existing module-state lines:

```ts
// Active source for fixes: 'native' (foreground-service fused location, Doze-safe)
// when background tracking is on, else 'js' (foreground-only watchPosition).
let _source: 'js' | 'native' = 'js';
let _active = false;
let _nativeSub: {remove: () => void} | null = null;
```

with:

```ts
// When background tracking is on, the native FGS runs as an ADDITIONAL source
// alongside the always-on JS watch (both feed handlePosition). See spec 5.8.
let _nativeActive = false;
let _active = false;
let _nativeSub: {remove: () => void} | null = null;
// Wall-clock ms of the last accepted fix, for cross-source dedup.
let _lastAcceptedFixMs = 0;
```

- [ ] **Step 3: Always run the JS watch; add native additionally**

Replace the body of `startTracking` from `_active = true;` through the end of the function:

```ts
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
```

with:

```ts
  _slowIntervalMs = intervalMs;
  _trackingMode = 'fast';
  _stationaryStreak = 0;
  _lastAcceptedFixMs = 0;
  _active = true;

  // JS watch is the always-on baseline — never worse than the pre-5.7 build.
  armWatch(FAST_INTERVAL_MS);

  // Native fused location in the foreground service is an ADDITIONAL,
  // Doze-resistant source when background tracking is on. Both feed handlePosition;
  // the dedup gate collapses overlap.
  const wantsBackground = useSettingsStore.getState().background_tracking;
  if (wantsBackground && isBackgroundLocationAvailable()) {
    _nativeActive = true;
    _nativeSub = subscribeBackgroundLocation(handleNativeFix);
    await startBackgroundLocationService(); // starts at the native default (fast)
  }
}
```

- [ ] **Step 4: Drive both sources on a mode change**

Replace the mode-change block in `handlePosition`:

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

with:

```ts
  if (desiredMode !== _trackingMode) {
    _trackingMode = desiredMode;
    const ms = desiredMode === 'fast' ? FAST_INTERVAL_MS : _slowIntervalMs;
    armWatch(ms); // JS baseline is always retuned
    if (_nativeActive) {
      setBackgroundInterval(ms);
    }
  }
```

- [ ] **Step 5: Add the dedup gate at the top of handlePosition**

Replace the opening of `handlePosition`:

```ts
async function handlePosition(
  pos: GeolocationResponse,
): Promise<void> {
  const {latitude, longitude, accuracy} = pos.coords;
  const now = pos.timestamp;
  const speed = pos.coords.speed ?? null;
```

with:

```ts
async function handlePosition(
  pos: GeolocationResponse,
): Promise<void> {
  // Two sources (JS watch + native FGS) can both deliver fixes; collapse
  // near-simultaneous duplicates so points/geofences aren't double-counted.
  const arrivedMs = Date.now();
  if (isDuplicateFix(arrivedMs, _lastAcceptedFixMs)) {
    return;
  }
  _lastAcceptedFixMs = arrivedMs;

  const {latitude, longitude, accuracy} = pos.coords;
  const now = pos.timestamp;
  const speed = pos.coords.speed ?? null;
```

- [ ] **Step 6: Reset both sources in stopTracking**

Replace the whole `stopTracking` function:

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

with:

```ts
export function stopTracking(): void {
  if (_watchId !== null) {
    Geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  if (_nativeActive) {
    _nativeSub?.remove();
    _nativeSub = null;
    stopBackgroundLocationService();
  }
  _active = false;
  _nativeActive = false;
  _lastAcceptedFixMs = 0;
  _lastPosition = null;
  _lastRecordedPosition = null;
  _trackingMode = 'fast';
  _stationaryStreak = 0;
}
```

- [ ] **Step 7: Verify no stale `_source` references remain + check**

Run: `grep -n "_source" src/services/gpsService.ts` — expect NO matches.
Then run: `npm run check`
Expected: grep prints nothing; lint clean (no unused imports/vars), tsc no errors, all jest suites pass (existing + Task 1's new isDuplicateFix tests).

- [ ] **Step 8: Commit**

```bash
git add src/services/gpsService.ts
git commit -m "feat(gps): dual-source tracking — JS baseline + native, with dedup"
```

---

## Device soak (post-merge, manual)
- Confirm normal use records densely again (back to ~hundreds of points/day, not ~13) — the JS baseline alone guarantees this even if the native FGS still dies.
- A pocketed background drive: if the native FGS is alive it should follow the road; if not, you get the pre-5.7 (Doze-limited) trail — never worse.
- No obvious duplicate/zig-zag points from the two sources overlapping (dedup working).
- Grab `logcat` when the cable's available so we can root-cause + fix the native FGS death itself.

## Deferred
- Native FGS-death root cause (needs logcat).
- Start/stop-tracking home-screen widget (next spec).
- Request `POST_NOTIFICATIONS` when enabling background tracking (small follow-up).
