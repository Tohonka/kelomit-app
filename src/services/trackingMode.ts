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
