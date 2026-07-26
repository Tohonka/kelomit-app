import type Database from 'better-sqlite3';
import type {Day, Entry} from '../../src/types/index.ts';

export interface DaySummary {
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  entryCount: number;
}

export interface MediaRow {
  entry_id: number;
  media_type: string;
  file_path: string;
  thumbnail_path: string | null;
  duration_sec: number | null;
  transcript: string | null;
}

export interface RouteSegmentRow {
  sequence: number;
  start_ts: string;
  end_ts: string;
  coordinates_json: string;
  distance_m: number;
  duration_sec: number;
  average_speed_mps: number;
}

export interface RouteStopRow {
  start_ts: string;
  end_ts: string;
  latitude: number;
  longitude: number;
  display_name: string | null;
}

export function listDays(db: Database.Database, limit: number): DaySummary[] {
  return db
    .prepare(
      `SELECT d.date AS date,
              d.started_at AS startedAt,
              d.ended_at AS endedAt,
              (SELECT COUNT(*) FROM entries e WHERE e.day_id = d.id) AS entryCount
         FROM days d
        ORDER BY d.date DESC
        LIMIT ?`,
    )
    .all(limit) as DaySummary[];
}

/** Dates are stored as `YYYY-MM-DD` text, so string comparison is date order. */
export function listDaysInRange(
  db: Database.Database,
  from: string,
  to: string,
): DaySummary[] {
  return db
    .prepare(
      `SELECT d.date AS date,
              d.started_at AS startedAt,
              d.ended_at AS endedAt,
              (SELECT COUNT(*) FROM entries e WHERE e.day_id = d.id) AS entryCount
         FROM days d
        WHERE d.date >= ? AND d.date <= ?
        ORDER BY d.date DESC`,
    )
    .all(from, to) as DaySummary[];
}

export function getDay(db: Database.Database, date: string): Day | null {
  const row = db.prepare('SELECT * FROM days WHERE date = ?').get(date);
  return (row as Day | undefined) ?? null;
}

export function getEntries(db: Database.Database, dayId: number): Entry[] {
  return db
    .prepare('SELECT * FROM entries WHERE day_id = ? ORDER BY COALESCE(time_from, created_at)')
    .all(dayId) as Entry[];
}

export function getEntryMedia(db: Database.Database, dayId: number): MediaRow[] {
  return db
    .prepare(
      `SELECT m.entry_id, m.media_type, m.file_path, m.thumbnail_path,
              m.duration_sec, m.transcript
         FROM entry_media m
         JOIN entries e ON e.id = m.entry_id
        WHERE e.day_id = ?
        ORDER BY m.entry_id, m.position`,
    )
    .all(dayId) as MediaRow[];
}

export function getRouteSegments(db: Database.Database, dayId: number): RouteSegmentRow[] {
  return db
    .prepare(
      `SELECT sequence, start_ts, end_ts, coordinates_json,
              distance_m, duration_sec, average_speed_mps
         FROM day_route_segments WHERE day_id = ? ORDER BY sequence`,
    )
    .all(dayId) as RouteSegmentRow[];
}

export function getRouteStops(db: Database.Database, dayId: number): RouteStopRow[] {
  return db
    .prepare(
      `SELECT start_ts, end_ts, latitude, longitude, display_name
         FROM day_route_stops WHERE day_id = ? ORDER BY start_ts`,
    )
    .all(dayId) as RouteStopRow[];
}
