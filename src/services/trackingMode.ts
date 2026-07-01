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
