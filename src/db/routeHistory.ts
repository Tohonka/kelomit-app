import {distanceMeters} from '../services/locationUtils';
import type {
  DayRouteSegment,
  DayRouteStop,
  ModeSpan,
  NamedPlace,
  RouteCoordinate,
  RouteStopNameSource,
  TripVia,
} from '../types';
import type {
  deriveRouteDay,
  DerivedRouteStop,
} from '../utils/routeSegments';
import {getDB} from './database';
import {clampRadius} from '../utils/geofence';

type RawRow = Record<string, unknown>;

const DEFAULT_RADIUS_M = 70;
const STOP_MATCH_RADIUS_M = 70;

type StopNameChoice =
  | {type: 'saved'; id: number; name: string}
  | {type: 'reusable'; id: number; name: string}
  | {type: 'google'; placeId: string; name: string}
  | {type: 'day'; name: string};

type Executor = Pick<ReturnType<typeof getDB>, 'execute'>;

function requiredName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Name is required');
  }
  return trimmed;
}

function rowToNamedPlace(row: RawRow): NamedPlace {
  return {
    id: row.id as number,
    name: row.name as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    radius_m: row.radius_m as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function rowToStop(row: RawRow): DayRouteStop {
  return {
    id: row.id as number,
    day_id: row.day_id as number,
    start_ts: row.start_ts as string,
    end_ts: row.end_ts as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    saved_location_id: (row.saved_location_id as number | null) ?? null,
    named_place_id: (row.named_place_id as number | null) ?? null,
    google_place_id: (row.google_place_id as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    name_source: row.name_source as RouteStopNameSource,
    user_edited: Boolean(row.user_edited),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function parseCoordinates(value: unknown): RouteCoordinate[] | null {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every(coordinate => {
        if (coordinate == null || typeof coordinate !== 'object') {
          return false;
        }
        const {latitude, longitude, t} = coordinate as RawRow;
        return (
          typeof latitude === 'number' &&
          Number.isFinite(latitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          typeof longitude === 'number' &&
          Number.isFinite(longitude) &&
          longitude >= -180 &&
          longitude <= 180 &&
          (t === undefined || (typeof t === 'number' && Number.isFinite(t)))
        );
      })
      ? (parsed as RouteCoordinate[])
      : null;
  } catch {
    return null;
  }
}

function parseJsonColumn<T>(value: unknown): T | null {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToSegment(row: RawRow): DayRouteSegment | null {
  const coordinates = parseCoordinates(row.coordinates_json);
  if (coordinates === null) {
    return null;
  }
  return {
    id: row.id as number,
    day_id: row.day_id as number,
    sequence: row.sequence as number,
    start_ts: row.start_ts as string,
    end_ts: row.end_ts as string,
    origin_stop_id: (row.origin_stop_id as number | null) ?? null,
    destination_stop_id: (row.destination_stop_id as number | null) ?? null,
    coordinates,
    distance_m: row.distance_m as number,
    duration_sec: row.duration_sec as number,
    average_speed_mps: row.average_speed_mps as number,
    maximum_speed_mps: row.maximum_speed_mps as number,
    raw_last_ts: row.raw_last_ts as string,
    mode_spans: parseJsonColumn<ModeSpan[]>(row.mode_spans_json),
    still_seconds: (row.still_seconds as number | null) ?? null,
    via: parseJsonColumn<TripVia[]>(row.via_json),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getNamedPlaces(): Promise<NamedPlace[]> {
  const result = await getDB().execute(
    'SELECT * FROM named_places ORDER BY name COLLATE NOCASE ASC;',
  );
  return (result.rows ?? []).map(row => rowToNamedPlace(row as RawRow));
}

export async function createNamedPlace(input: {
  name: string;
  latitude: number;
  longitude: number;
  radiusM?: number;
}): Promise<NamedPlace> {
  const name = requiredName(input.name);
  const result = await getDB().execute(
    `INSERT INTO named_places (name, latitude, longitude, radius_m)
     VALUES (?, ?, ?, ?) RETURNING *;`,
    [
      name,
      input.latitude,
      input.longitude,
      input.radiusM ?? DEFAULT_RADIUS_M,
    ],
  );
  return rowToNamedPlace(result.rows[0] as RawRow);
}

export async function renameNamedPlace(
  id: number,
  name: string,
): Promise<void> {
  await getDB().execute(
    `UPDATE named_places
     SET name = ?, updated_at = datetime('now')
     WHERE id = ?;`,
    [requiredName(name), id],
  );
}

export async function deleteNamedPlace(id: number): Promise<void> {
  await getDB().execute('DELETE FROM named_places WHERE id = ?;', [id]);
}

export async function updateNamedPlaceRadius(
  id: number,
  radiusM: number,
): Promise<void> {
  await getDB().execute(
    `UPDATE named_places SET radius_m = ?, updated_at = datetime('now') WHERE id = ?;`,
    [clampRadius(radiusM), id],
  );
}

export async function getNearbyLocalPlaces(
  lat: number,
  lng: number,
  radiusM = DEFAULT_RADIUS_M,
): Promise<
  Array<{
    type: 'saved' | 'reusable';
    id: number;
    name: string;
    distanceM: number;
  }>
> {
  const result = await getDB().execute(
    `SELECT 'saved' AS type, id, name, latitude, longitude FROM locations
     UNION ALL
     SELECT 'reusable' AS type, id, name, latitude, longitude FROM named_places;`,
  );
  return (result.rows ?? [])
    .map(value => {
      const row = value as RawRow;
      return {
        type: row.type as 'saved' | 'reusable',
        id: row.id as number,
        name: row.name as string,
        distanceM: distanceMeters(
          lat,
          lng,
          row.latitude as number,
          row.longitude as number,
        ),
      };
    })
    .filter(place => place.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

function stopNameParams(
  stopId: number,
  choice: StopNameChoice,
): [number | null, number | null, string | null, string, RouteStopNameSource, number] {
  const name = requiredName(choice.name);
  switch (choice.type) {
    case 'saved':
      return [choice.id, null, null, name, 'saved', stopId];
    case 'reusable':
      return [null, choice.id, null, name, 'reusable', stopId];
    case 'google':
      if (!choice.placeId.trim()) {
        throw new Error('Google place ID is required');
      }
      return [null, null, choice.placeId.trim(), name, 'google', stopId];
    case 'day':
      return [null, null, null, name, 'day', stopId];
  }
}

async function setDayStopNameWith(
  executor: Executor,
  stopId: number,
  choice: StopNameChoice,
): Promise<void> {
  await executor.execute(
    `UPDATE day_route_stops
     SET saved_location_id = ?, named_place_id = ?, google_place_id = ?,
         display_name = ?, name_source = ?, user_edited = 1,
         updated_at = datetime('now')
     WHERE id = ?;`,
    stopNameParams(stopId, choice),
  );
}

export async function setDayStopName(
  stopId: number,
  choice: StopNameChoice,
): Promise<void> {
  await setDayStopNameWith(getDB(), stopId, choice);
}

export async function setAutomaticGoogleStopName(
  stopId: number,
  snapshot: {name: string; placeId: string},
): Promise<boolean> {
  const result = await getDB().execute(
    `UPDATE day_route_stops
     SET saved_location_id = NULL, named_place_id = NULL,
         display_name = ?, google_place_id = ?, name_source = 'google',
         updated_at = datetime('now')
     WHERE id = ? AND user_edited = 0
       AND (display_name IS NULL OR TRIM(display_name) = '');`,
    [
      requiredName(snapshot.name),
      snapshot.placeId.trim() || null,
      stopId,
    ],
  );
  return (result.rowsAffected ?? 0) > 0;
}

export async function createNamedPlaceForStop(
  stopId: number,
  name: string,
): Promise<void> {
  const normalizedName = requiredName(name);
  await getDB().transaction(async tx => {
    const stopResult = await tx.execute(
      'SELECT latitude, longitude FROM day_route_stops WHERE id = ?;',
      [stopId],
    );
    const stop = stopResult.rows?.[0] as
      | {latitude: number; longitude: number}
      | undefined;
    if (!stop) {
      throw new Error('Route stop not found');
    }
    const insert = await tx.execute(
      `INSERT INTO named_places (name, latitude, longitude, radius_m)
       VALUES (?, ?, ?, ?) RETURNING id;`,
      [normalizedName, stop.latitude, stop.longitude, DEFAULT_RADIUS_M],
    );
    const id = (insert.rows?.[0]?.id as number | undefined) ?? insert.insertId;
    if (id == null) {
      throw new Error('Failed to insert named place');
    }
    await setDayStopNameWith(tx, stopId, {
      type: 'reusable',
      id,
      name: normalizedName,
    });
  });
}

export async function getDayRouteHistory(
  dayId: number,
): Promise<{stops: DayRouteStop[]; segments: DayRouteSegment[]}> {
  const db = getDB();
  const stopResult = await db.execute(
    'SELECT * FROM day_route_stops WHERE day_id = ? ORDER BY start_ts ASC, id ASC;',
    [dayId],
  );
  const segmentResult = await db.execute(
    'SELECT * FROM day_route_segments WHERE day_id = ? ORDER BY sequence ASC;',
    [dayId],
  );
  return {
    stops: (stopResult.rows ?? []).map(row => rowToStop(row as RawRow)),
    segments: (segmentResult.rows ?? [])
      .map(row => rowToSegment(row as RawRow))
      .filter((segment): segment is DayRouteSegment => segment !== null),
  };
}

export async function getLatestRawTimestamp(
  dayId: number,
): Promise<string | null> {
  const result = await getDB().execute(
    'SELECT MAX(timestamp) AS timestamp FROM gps_track WHERE day_id = ?;',
    [dayId],
  );
  return (result.rows?.[0]?.timestamp as string | null | undefined) ?? null;
}

export async function getLatestDerivedRawTimestamp(
  dayId: number,
): Promise<string | null> {
  const result = await getDB().execute(
    `SELECT MAX(value) AS raw_last_ts
     FROM (
       SELECT raw_last_ts AS value
       FROM day_route_segments
       WHERE day_id = ?
       UNION ALL
       SELECT end_ts AS value
       FROM day_route_stops
       WHERE day_id = ?
     );`,
    [dayId, dayId],
  );
  return (result.rows?.[0]?.raw_last_ts as string | null | undefined) ?? null;
}

export async function getEarliestDerivedTimestamp(
  dayId: number,
): Promise<string | null> {
  const result = await getDB().execute(
    `SELECT MIN(value) AS first_ts
     FROM (
       SELECT start_ts AS value
       FROM day_route_segments
       WHERE day_id = ?
       UNION ALL
       SELECT start_ts AS value
       FROM day_route_stops
       WHERE day_id = ?
     );`,
    [dayId, dayId],
  );
  return (result.rows?.[0]?.first_ts as string | null | undefined) ?? null;
}

export async function hasInvalidRouteGeometry(dayId: number): Promise<boolean> {
  const result = await getDB().execute(
    'SELECT coordinates_json FROM day_route_segments WHERE day_id = ?;',
    [dayId],
  );
  for (const row of result.rows ?? []) {
    if (parseCoordinates((row as RawRow).coordinates_json) === null) {
      return true;
    }
  }
  return false;
}

export function matchExistingStop(
  next: DerivedRouteStop,
  candidates: DayRouteStop[],
): DayRouteStop | null {
  let best:
    | {stop: DayRouteStop; overlapMs: number; distanceM: number}
    | undefined;

  for (const stop of candidates) {
    const overlapMs =
      Math.min(Date.parse(next.endTs), Date.parse(stop.end_ts)) -
      Math.max(Date.parse(next.startTs), Date.parse(stop.start_ts));
    if (overlapMs < 0) {
      continue;
    }
    const distanceM = distanceMeters(
      next.latitude,
      next.longitude,
      stop.latitude,
      stop.longitude,
    );
    if (distanceM > STOP_MATCH_RADIUS_M) {
      continue;
    }
    if (
      !best ||
      overlapMs > best.overlapMs ||
      (overlapMs === best.overlapMs && distanceM < best.distanceM) ||
      (overlapMs === best.overlapMs &&
        distanceM === best.distanceM &&
        stop.id < best.stop.id)
    ) {
      best = {stop, overlapMs, distanceM};
    }
  }

  return best?.stop ?? null;
}

function derivedIdentity(stop: DerivedRouteStop): {
  savedLocationId: number | null;
  namedPlaceId: number | null;
  displayName: string | null;
  nameSource: RouteStopNameSource;
} {
  if (stop.anchor?.type === 'saved') {
    return {
      savedLocationId: stop.anchor.id,
      namedPlaceId: null,
      displayName: stop.anchor.name,
      nameSource: 'saved',
    };
  }
  if (stop.anchor?.type === 'reusable') {
    return {
      savedLocationId: null,
      namedPlaceId: stop.anchor.id,
      displayName: stop.anchor.name,
      nameSource: 'reusable',
    };
  }
  return {
    savedLocationId: null,
    namedPlaceId: null,
    displayName: null,
    nameSource: 'unknown',
  };
}

export async function reconcileDayRouteHistory(
  dayId: number,
  derived: ReturnType<typeof deriveRouteDay>,
): Promise<void> {
  const db = getDB();
  await db.transaction(async tx => {
    const existingResult = await tx.execute(
      'SELECT * FROM day_route_stops WHERE day_id = ? ORDER BY start_ts ASC, id ASC;',
      [dayId],
    );
    const unmatched = (existingResult.rows ?? []).map(row =>
      rowToStop(row as RawRow),
    );
    const stopIds = new Map<string, number>();

    for (const next of derived.stops) {
      const existing = matchExistingStop(next, unmatched);
      const identity = derivedIdentity(next);
      if (existing) {
        unmatched.splice(
          unmatched.findIndex(candidate => candidate.id === existing.id),
          1,
        );
        const preserveIdentity =
          existing.user_edited || Boolean(existing.display_name?.trim());
        await tx.execute(
          `UPDATE day_route_stops
           SET start_ts = ?, end_ts = ?, latitude = ?, longitude = ?,
               saved_location_id = ?, named_place_id = ?, google_place_id = ?,
               display_name = ?, name_source = ?, user_edited = ?,
               updated_at = datetime('now')
           WHERE id = ? AND day_id = ?;`,
          [
            next.startTs,
            next.endTs,
            next.latitude,
            next.longitude,
            preserveIdentity
              ? existing.saved_location_id
              : identity.savedLocationId,
            preserveIdentity
              ? existing.named_place_id
              : identity.namedPlaceId,
            preserveIdentity ? existing.google_place_id : null,
            preserveIdentity ? existing.display_name : identity.displayName,
            preserveIdentity ? existing.name_source : identity.nameSource,
            existing.user_edited ? 1 : 0,
            existing.id,
            dayId,
          ],
        );
        stopIds.set(next.key, existing.id);
        continue;
      }

      const insert = await tx.execute(
        `INSERT INTO day_route_stops (
           day_id, start_ts, end_ts, latitude, longitude,
           saved_location_id, named_place_id, google_place_id,
           display_name, name_source, user_edited
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id;`,
        [
          dayId,
          next.startTs,
          next.endTs,
          next.latitude,
          next.longitude,
          identity.savedLocationId,
          identity.namedPlaceId,
          null,
          identity.displayName,
          identity.nameSource,
          0,
        ],
      );
      const id = (insert.rows?.[0]?.id as number | undefined) ?? insert.insertId;
      if (id == null) {
        throw new Error('Failed to insert route stop');
      }
      stopIds.set(next.key, id);
    }

    await tx.execute('DELETE FROM day_route_segments WHERE day_id = ?;', [
      dayId,
    ]);
    for (const obsolete of unmatched) {
      await tx.execute(
        'DELETE FROM day_route_stops WHERE id = ? AND day_id = ?;',
        [obsolete.id, dayId],
      );
    }

    for (const segment of derived.segments) {
      await tx.execute(
        `INSERT INTO day_route_segments (
           day_id, sequence, start_ts, end_ts,
           origin_stop_id, destination_stop_id, coordinates_json,
           distance_m, duration_sec, average_speed_mps, maximum_speed_mps,
           raw_last_ts, mode_spans_json, still_seconds, via_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          dayId,
          segment.sequence,
          segment.startTs,
          segment.endTs,
          segment.originStopKey
            ? (stopIds.get(segment.originStopKey) ?? null)
            : null,
          segment.destinationStopKey
            ? (stopIds.get(segment.destinationStopKey) ?? null)
            : null,
          JSON.stringify(segment.coordinates),
          segment.distanceM,
          segment.durationSec,
          segment.averageSpeedMps,
          segment.maximumSpeedMps,
          segment.rawLastTs,
          segment.modeSpans.length > 0 ? JSON.stringify(segment.modeSpans) : null,
          segment.stillSeconds,
          segment.via.length > 0 ? JSON.stringify(segment.via) : null,
        ],
      );
    }
  });
}
