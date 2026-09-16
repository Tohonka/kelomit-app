import {aggregateModeDurations, sliceByModeSpans} from './tripModes';
import {distanceMeters} from '../services/locationUtils';
import type {DayRouteSegment} from '../types';

/** Per-mode time and distance over any set of route segments (Balance). */
export interface MovementSummary {
  footSec: number;
  cycleSec: number;
  vehicleSec: number;
  stillSec: number;
  footM: number;
  cycleM: number;
  vehicleM: number;
}

export function emptyMovement(): MovementSummary {
  return {footSec: 0, cycleSec: 0, vehicleSec: 0, stillSec: 0, footM: 0, cycleM: 0, vehicleM: 0};
}

function sliceMeters(coords: {latitude: number; longitude: number}[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += distanceMeters(coords[i - 1].latitude, coords[i - 1].longitude, coords[i].latitude, coords[i].longitude);
  }
  return m;
}

/** Seconds per mode come from the stored spans; metres per mode from the
 *  polyline sliced by those spans. Pre-v25 rows (no spans) are skipped —
 *  their mode is unknown, so they'd only add noise. */
export function summarizeSegments(segments: DayRouteSegment[]): MovementSummary {
  const s = emptyMovement();
  for (const seg of segments) {
    const spans = seg.mode_spans;
    if (!spans || spans.length === 0) { continue; }
    const secs = aggregateModeDurations(spans);
    s.footSec += secs.foot ?? 0;
    s.cycleSec += secs.cycle ?? 0;
    s.vehicleSec += secs.vehicle ?? 0;
    s.stillSec += secs.still ?? seg.still_seconds ?? 0;
    for (const slice of sliceByModeSpans(seg.coordinates, spans)) {
      const m = sliceMeters(slice.coordinates);
      if (slice.mode === 'foot') { s.footM += m; }
      else if (slice.mode === 'cycle') { s.cycleM += m; }
      else if (slice.mode === 'vehicle') { s.vehicleM += m; }
    }
  }
  return s;
}
