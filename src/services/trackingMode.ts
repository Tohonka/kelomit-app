export type TrackingMode = 'fast' | 'slow' | 'parked';

// ponytail: movement thresholds are field-tuning knobs; adjust on device.
export const MOVE_SPEED_MS = 1.0; // m/s (~3.6 km/h) at/above which we treat as moving
export const STATIONARY_STREAK_TO_SLOW = 3; // consecutive still fixes before backing off

// Speed-tiered fast rate: at scooter/bike/car speed sample at SPRINT_INTERVAL_MS
// so corners aren't cut (25 km/h × 4 s ≈ 28 m between fixes). Hysteresis band
// (enter 3.5, exit 2.5) so speed wobbling around a single boundary doesn't
// re-arm the watch every couple seconds — that churn destabilised the provider
// on an e-scooter (2026-07-09). ponytail: tune on device.
export const SPRINT_ENTER_MS = 3.5; // m/s (~13 km/h) — cross UP into sprint
export const SPRINT_EXIT_MS = 2.5; // m/s (~9 km/h) — drop back to normal fast
export const SPRINT_INTERVAL_MS = 2_000;
export const FAST_INTERVAL_MS = 4_000;

// Still fixes before fully parking (only inside a saved geofence with the
// native FGS running): STATIONARY_STREAK_TO_SLOW to reach slow, then 2 more
// slow-cadence fixes (~2 min). ponytail: tune on device.
export const STREAK_TO_PARK = STATIONARY_STREAK_TO_SLOW + 2;

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

/** Interval for 'fast' mode, tiered by current speed with hysteresis. Pass the
 *  current interval so the band knows which side we're on: once in sprint, stay
 *  there until speed drops below the exit threshold; from normal fast, only
 *  sprint once above the (higher) enter threshold. */
export function fastIntervalForSpeed(
  speed: number | null,
  currentIntervalMs: number = FAST_INTERVAL_MS,
): number {
  if (speed == null) {
    return FAST_INTERVAL_MS;
  }
  const inSprint = currentIntervalMs === SPRINT_INTERVAL_MS;
  const threshold = inSprint ? SPRINT_EXIT_MS : SPRINT_ENTER_MS;
  return speed >= threshold ? SPRINT_INTERVAL_MS : FAST_INTERVAL_MS;
}

/**
 * Desired sampling mode. Tighten to 'fast' immediately on movement; relax to
 * 'slow' after a sustained still streak; fully park (no location requests,
 * OS geofence wake) after STREAK_TO_PARK when `canPark` (still inside a saved
 * geofence AND the native FGS is running to receive the wake).
 *
 * `recentlyMoving` blocks the power-DOWN to slow: a GPS-lock drought during
 * movement produces poor network fixes that read as "stationary" (speed 0/null),
 * and dropping to balanced-power slow then can't re-acquire the chip while
 * moving — the e-scooter death spiral (2026-07-09). While a trustworthy fix
 * showed real movement recently, stay fast so the chip re-locks.
 */
export function nextTrackingMode(
  prev: TrackingMode,
  movingNow: boolean,
  stationaryStreak: number,
  canPark: boolean = false,
  recentlyMoving: boolean = false,
): TrackingMode {
  if (movingNow) {
    return 'fast';
  }
  if (canPark && stationaryStreak >= STREAK_TO_PARK) {
    return 'parked';
  }
  if (!recentlyMoving && stationaryStreak >= STATIONARY_STREAK_TO_SLOW) {
    return 'slow';
  }
  return prev;
}

// Two fix sources (JS watch + native FGS) can both fire; a fix arriving within
// this window of the last accepted one is treated as the other source's duplicate.
// ponytail: tune on device.
export const MIN_FIX_GAP_MS = 2000;

/** Cross-source dedup window, scaled so sprint-rate fixes aren't swallowed. */
export function dedupGapMs(intervalMs: number): number {
  return Math.min(MIN_FIX_GAP_MS, Math.floor(intervalMs / 2));
}

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
