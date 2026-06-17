/** Geofence radius bounds and clamping — pure logic, no DB/native imports so it
 *  is unit-testable. The 50 m floor protects the user: a smaller radius has no
 *  benefit for work/home detection and only risks pinpointing. Enforced both in
 *  the UI and at the DB write boundary. See Iteration 3 Phase 4.2. */
export const MIN_RADIUS_M = 50;
export const DEFAULT_RADIUS_M = 150;

/** Clamp a radius to the safe floor and round to whole metres. */
export function clampRadius(radiusM: number): number {
  return Math.max(MIN_RADIUS_M, Math.round(radiusM));
}
