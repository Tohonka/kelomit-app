import {distanceMeters} from '../services/locationUtils';
import type {GpsPoint, SavedLocation} from '../types';

export interface Visit {
  latitude: number;
  longitude: number;
  startTs: string;
  endTs: string;
  /** Saved place this stay falls inside, else null (candidate for a Places lookup). */
  location: SavedLocation | null;
}

export interface VisitOptions {
  /** A point stays in the current cluster while within this of its centroid. */
  radiusM?: number;
  /** A cluster only counts as a visit once it spans at least this long. */
  minDwellSec?: number;
}

/**
 * Dwell-cluster a day's GPS track (time-ascending) into the places the user
 * stayed put, and tag each with a saved location when it falls inside one.
 *
 * Greedy single pass: each point joins the current cluster if within `radiusM`
 * of its running-mean centroid, otherwise the cluster closes (emitted only if
 * it lasted `minDwellSec`) and a new one opens. Travel between stays is dropped.
 */
export function visitedLocations(
  points: GpsPoint[],
  saved: SavedLocation[],
  {radiusM = 70, minDwellSec = 300}: VisitOptions = {},
): Visit[] {
  const visits: Visit[] = [];
  let lat = 0;
  let lng = 0;
  let n = 0;
  let startTs = '';
  let endTs = '';

  const flush = () => {
    if (n === 0) {
      return;
    }
    const durationSec = (new Date(endTs).getTime() - new Date(startTs).getTime()) / 1000;
    if (durationSec >= minDwellSec) {
      visits.push({latitude: lat, longitude: lng, startTs, endTs, location: matchSaved(lat, lng, saved)});
    }
    n = 0;
  };

  for (const p of points) {
    if (n > 0 && distanceMeters(lat, lng, p.latitude, p.longitude) <= radiusM) {
      // Running-mean centroid keeps the anchor stable as the cluster grows.
      lat += (p.latitude - lat) / (n + 1);
      lng += (p.longitude - lng) / (n + 1);
      n += 1;
      endTs = p.timestamp;
    } else {
      flush();
      lat = p.latitude;
      lng = p.longitude;
      n = 1;
      startTs = p.timestamp;
      endTs = p.timestamp;
    }
  }
  flush();
  return visits;
  // ponytail: running-mean centroid can drift on a slow walk; tighten radiusM or
  // switch to a fixed-anchor cluster if stays start merging.
}

/** Nearest saved place whose radius contains the point, else null. */
function matchSaved(lat: number, lng: number, saved: SavedLocation[]): SavedLocation | null {
  let best: {loc: SavedLocation; dist: number} | null = null;
  for (const loc of saved) {
    const dist = distanceMeters(lat, lng, loc.latitude, loc.longitude);
    if (dist <= loc.radius_m && (!best || dist < best.dist)) {
      best = {loc, dist};
    }
  }
  return best?.loc ?? null;
}
