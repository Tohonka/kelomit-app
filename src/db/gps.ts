import {getDB} from './database';
import type {GpsPoint} from '../types';

type RawRow = Record<string, unknown>;

export async function insertGpsPoint(point: GpsPoint): Promise<void> {
  const db = getDB();
  await db.execute(
    `INSERT INTO gps_track (day_id, latitude, longitude, accuracy, altitude, speed, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      point.day_id,
      point.latitude,
      point.longitude,
      point.accuracy,
      point.altitude,
      point.speed,
      point.timestamp,
    ],
  );
}

export async function getGpsPointsForDay(dayId: number): Promise<GpsPoint[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM gps_track WHERE day_id = ? ORDER BY timestamp ASC;',
    [dayId],
  );
  return (result.rows ?? []).map(r => {
    const row = r as RawRow;
    return {
      day_id: row.day_id as number,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      accuracy: (row.accuracy as number | null) ?? null,
      altitude: (row.altitude as number | null) ?? null,
      speed: (row.speed as number | null) ?? null,
      timestamp: row.timestamp as string,
    };
  });
}

export async function getLatestGpsPoint(
  dayId: number,
): Promise<GpsPoint | null> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM gps_track WHERE day_id = ? ORDER BY timestamp DESC LIMIT 1;',
    [dayId],
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0] as RawRow;
  return {
    day_id: row.day_id as number,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    accuracy: (row.accuracy as number | null) ?? null,
    altitude: (row.altitude as number | null) ?? null,
    speed: (row.speed as number | null) ?? null,
    timestamp: row.timestamp as string,
  };
}

const DAY_MS = 86_400_000;
export const GPS_RETENTION_DAYS = 45;

/** ISO timestamp `days` before `nowMs`. Pure, for testability. */
export function retentionCutoffIso(nowMs: number, days: number): string {
  return new Date(nowMs - days * DAY_MS).toISOString();
}

/**
 * Delete raw trail points older than the retention window. Only the dense
 * `gps_track` is transient — days/notes/geofence events are never touched.
 * ISO timestamps compare lexicographically, so a string `<` is correct.
 */
export async function pruneGpsTracksOlderThan(
  days = GPS_RETENTION_DAYS,
): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM gps_track WHERE timestamp < ?;', [
    retentionCutoffIso(Date.now(), days),
  ]);
}

export async function getGpsDayIdsWithinRetention(
  days = GPS_RETENTION_DAYS,
): Promise<number[]> {
  const result = await getDB().execute(
    `SELECT DISTINCT day_id
     FROM gps_track
     WHERE timestamp >= ?
     ORDER BY day_id DESC;`,
    [retentionCutoffIso(Date.now(), days)],
  );
  return (result.rows ?? []).map(row => (row as RawRow).day_id as number);
}
