const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine great-circle distance in metres */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Returns true when the new point should be discarded as an outlier.
 * Rule: >500 m jump in less than 30 s is physically impossible on foot.
 */
export function isOutlier(
  newLat: number,
  newLon: number,
  prevLat: number,
  prevLon: number,
  elapsedMs: number,
): boolean {
  const dist = distanceMeters(prevLat, prevLon, newLat, newLon);
  return dist > 500 && elapsedMs < 30_000;
}
