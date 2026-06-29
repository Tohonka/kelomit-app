import {distanceMeters} from '../services/locationUtils';
import type {Entry} from '../types';

export interface LocationBucket {
  latitude: number;
  longitude: number;
  entries: Entry[];
}

/**
 * Group geotagged entries into buckets of co-located notes. Greedy single pass:
 * each entry joins the first existing bucket whose anchor is within `radiusM`,
 * else starts a new bucket anchored at its own coordinates. Input order is
 * preserved (callers pass newest-first).
 */
export function bucketLocations(entries: Entry[], radiusM = 50): LocationBucket[] {
  const buckets: LocationBucket[] = [];
  for (const entry of entries) {
    const {latitude, longitude} = entry;
    if (latitude == null || longitude == null) {
      continue;
    }
    const hit = buckets.find(
      b => distanceMeters(b.latitude, b.longitude, latitude, longitude) <= radiusM,
    );
    if (hit) {
      hit.entries.push(entry);
    } else {
      buckets.push({latitude, longitude, entries: [entry]});
    }
  }
  return buckets;
}
// ponytail: greedy O(n·buckets), fine for ≤1000 pts; add a grid index if it janks.
