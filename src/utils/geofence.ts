/** Geofence radius bounds and clamping — pure logic, no DB/native imports so it
 *  is unit-testable. The 14 m floor is a practical GPS limit, not a privacy one
 *  (single user; tighter radii just sharpen enter/exit precision). Enforced both
 *  in the UI and at the DB write boundary. See Iteration 3 Phase 4.2. */
export const MIN_RADIUS_M = 14;
export const DEFAULT_RADIUS_M = 150;

/** Radius step: fine (2 m) at/below 30 m for tight geofences, coarse (25 m)
 *  above. Computed from the current value so both directions land on sane stops. */
export function radiusStep(currentM: number): number {
  return currentM <= 30 ? 2 : 25;
}

/** Clamp a radius to the safe floor and round to whole metres. */
export function clampRadius(radiusM: number): number {
  return Math.max(MIN_RADIUS_M, Math.round(radiusM));
}
