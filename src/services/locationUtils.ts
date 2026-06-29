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
