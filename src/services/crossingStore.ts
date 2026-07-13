import {
  insertGeofenceEvent,
  getGeofenceEventsForDay,
  getLastGeofenceEvent,
} from '../db/locations';
import type {Crossing} from './endOfDay';

const DEDUP_WINDOW_MS = 60_000;

// In-memory last-seen per `${locationId}:${type}` — collapses the two producers
// (OS geofence + live-fix) firing for the same crossing within the same process.
const _lastSeen = new Map<string, number>();

/** Pure: is a crossing at nowMs a duplicate of one last seen at lastMs? */
export function isDuplicateCrossing(
  lastMs: number | null,
  nowMs: number,
  windowMs: number = DEDUP_WINDOW_MS,
): boolean {
  return lastMs !== null && nowMs - lastMs < windowMs;
}

/** Persist a crossing unless it duplicates a very recent same-key one. */
export async function recordCrossing(p: {
  locationId: number;
  dayId: number;
  type: 'enter' | 'exit';
  latitude: number | null;
  longitude: number | null;
  time: string;
}): Promise<void> {
  const key = `${p.locationId}:${p.type}`;
  const nowMs = new Date(p.time).getTime();
  const inMem = _lastSeen.get(key) ?? null;
  let lastMs = inMem;
  if (inMem === null) {
    // Claim the slot synchronously (before the async DB lookup) so a
    // near-simultaneous second producer for the same key dedups against this
    // attempt instead of racing the same cold-start read and double-writing.
    _lastSeen.set(key, nowMs);
    const last = await getLastGeofenceEvent(p.locationId, p.type);
    lastMs = last ? new Date(last.timestamp).getTime() : null;
  }
  if (isDuplicateCrossing(lastMs, nowMs)) {
    return;
  }
  _lastSeen.set(key, nowMs);
  await insertGeofenceEvent({
    location_id: p.locationId,
    day_id: p.dayId,
    event_type: p.type,
    latitude: p.latitude,
    longitude: p.longitude,
    timestamp: p.time,
  });
}

/** Read a day's crossings as ordered inference input. `kindOf` maps a location
 *  id to its saved kind (caller supplies it from the in-memory locations list). */
export async function crossingsForDay(
  dayId: number,
  kindOf: (locationId: number) => 'work' | 'home' | 'other',
): Promise<Crossing[]> {
  const events = await getGeofenceEventsForDay(dayId);
  return events
    .filter(e => e.location_id != null)
    .map(e => ({
      locationId: e.location_id as number,
      kind: kindOf(e.location_id as number),
      type: e.event_type,
      time: e.timestamp,
    }));
}
