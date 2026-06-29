import {distanceMeters} from '../services/locationUtils';
import type {GpsPoint} from '../types';

export interface RouteStats {
  distanceM: number;
  durationSec: number;
}

/** Total path length (sum of consecutive legs) and elapsed time for a day's GPS track. */
export function routeStats(points: GpsPoint[]): RouteStats {
  if (points.length < 2) {
    return {distanceM: 0, durationSec: 0};
  }
  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    distanceM += distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  const start = new Date(points[0].timestamp).getTime();
  const end = new Date(points[points.length - 1].timestamp).getTime();
  return {distanceM, durationSec: Math.max(0, Math.round((end - start) / 1000))};
}
