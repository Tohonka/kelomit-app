/** Geofence radius bounds and clamping — pure logic, no DB/native imports so it
 *  is unit-testable. 6 m floor is Tommi's explicit call (2026-08-24 routes
 *  iteration); the UI shows a "not recommended below 20 m" caution instead of
 *  hard-blocking. Enforced in the UI and at the DB write boundary. */
export const MIN_RADIUS_M = 6;
export const MAX_RADIUS_M = 2000; // typo guard for typed entry
export const DEFAULT_RADIUS_M = 150;

/** Clamp a radius to bounds and round to whole metres. */
export function clampRadius(radiusM: number): number {
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(radiusM)));
}
