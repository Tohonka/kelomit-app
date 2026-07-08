import {getDB} from './database';
import type {SavedLocation, LocationKind, GeofenceEvent} from '../types';
import {clampRadius, DEFAULT_RADIUS_M} from '../utils/geofence';

// Re-export so existing call sites can keep importing from db/locations.
export {clampRadius, radiusStep, MIN_RADIUS_M, DEFAULT_RADIUS_M} from '../utils/geofence';

type RawRow = Record<string, unknown>;

function rowToLocation(row: RawRow): SavedLocation {
  return {
    id: row.id as number,
    name: row.name as string,
    kind: row.kind as LocationKind,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    radius_m: row.radius_m as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getLocations(): Promise<SavedLocation[]> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM locations ORDER BY created_at ASC;');
  return (result.rows ?? []).map(r => rowToLocation(r as RawRow));
}

export interface CreateLocationParams {
  name: string;
  kind: LocationKind;
  latitude: number;
  longitude: number;
  radius_m?: number;
}

export async function createLocation(params: CreateLocationParams): Promise<SavedLocation> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO locations (name, kind, latitude, longitude, radius_m)
     VALUES (?, ?, ?, ?, ?) RETURNING *;`,
    [params.name, params.kind, params.latitude, params.longitude, clampRadius(params.radius_m ?? DEFAULT_RADIUS_M)],
  );
  return rowToLocation(result.rows![0] as RawRow);
}

export async function updateLocationRadius(id: number, radiusM: number): Promise<void> {
  const db = getDB();
  await db.execute(
    "UPDATE locations SET radius_m = ?, updated_at = datetime('now') WHERE id = ?;",
    [clampRadius(radiusM), id],
  );
}

export async function deleteLocation(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM locations WHERE id = ?;', [id]);
}

export interface CreateGeofenceEventParams {
  location_id: number | null;
  day_id: number | null;
  event_type: 'enter' | 'exit';
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

export async function insertGeofenceEvent(params: CreateGeofenceEventParams): Promise<void> {
  const db = getDB();
  await db.execute(
    `INSERT INTO geofence_events (location_id, day_id, event_type, latitude, longitude, timestamp)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [params.location_id, params.day_id, params.event_type, params.latitude, params.longitude, params.timestamp],
  );
}

export async function getGeofenceEventsForDay(dayId: number): Promise<GeofenceEvent[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM geofence_events WHERE day_id = ? ORDER BY timestamp ASC;',
    [dayId],
  );
  return (result.rows ?? []).map(r => {
    const row = r as RawRow;
    return {
      id: row.id as number,
      location_id: (row.location_id as number | null) ?? null,
      day_id: (row.day_id as number | null) ?? null,
      event_type: row.event_type as 'enter' | 'exit',
      latitude: (row.latitude as number | null) ?? null,
      longitude: (row.longitude as number | null) ?? null,
      timestamp: row.timestamp as string,
    };
  });
}
