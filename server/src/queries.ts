import type Database from 'better-sqlite3';
import type {Day, Entry, LeaveRange, Project, Tag} from '../../src/types/index.ts';

export interface DaySummary {
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  entryCount: number;
  leaveRanges: LeaveRange[];
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

/** The phone pushes whole snapshots, so the server can be handed a database
 *  older than the queries written against it. A table the snapshot predates
 *  reads as empty instead of 500-ing the page. */
function hasTable(db: Database.Database, name: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) != null
  );
}

export function listDays(db: Database.Database, limit: number): DaySummary[] {
  const sources = ['SELECT date FROM days'];
  if (hasTable(db, 'leave_ranges')) {
    sources.push('SELECT end_date FROM leave_ranges');
  }
  const latest = db.prepare(
    `SELECT MAX(date) AS date FROM (${sources.join(' UNION ALL ')})`,
  ).get() as {date: string | null};
  if (!latest.date) return [];
  const from = db.prepare("SELECT date(?, '-' || ? || ' days') AS date")
    .get(latest.date, limit - 1) as {date: string};
  return listDaysInRange(db, from.date, latest.date).slice(0, limit);
}

/** Dates are stored as `YYYY-MM-DD` text, so string comparison is date order. */
export function listDaysInRange(
  db: Database.Database,
  from: string,
  to: string,
): DaySummary[] {
  const rows = db
    .prepare(
      `SELECT d.date AS date,
              d.started_at AS startedAt,
              d.ended_at AS endedAt,
              (SELECT COUNT(*) FROM entries e WHERE e.day_id = d.id) AS entryCount
         FROM days d
        WHERE d.date >= ? AND d.date <= ?
        ORDER BY d.date DESC`,
    )
    .all(from, to) as Omit<DaySummary, 'leaveRanges'>[];
  const byDate = new Map(rows.map(row => [
    row.date,
    {...row, leaveRanges: [] as LeaveRange[]},
  ]));
  for (const range of getLeaveRangesInRange(db, from, to)) {
    let date = range.start_date < from ? from : range.start_date;
    const end = range.end_date > to ? to : range.end_date;
    while (date <= end) {
      const summary = byDate.get(date) ?? {
        date,
        startedAt: null,
        endedAt: null,
        entryCount: 0,
        leaveRanges: [],
      };
      summary.leaveRanges.push(range);
      byDate.set(date, summary);
      date = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
        .toISOString().slice(0, 10);
    }
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function getDay(db: Database.Database, date: string): Day | null {
  const row = db.prepare('SELECT * FROM days WHERE date = ?').get(date);
  if (row) return row as Day;
  return getLeaveRangesInRange(db, date, date).length > 0
    ? {
        id: -1,
        date,
        started_at: null,
        ended_at: null,
        started_at_2: null,
        ended_at_2: null,
        started_at_source: null,
        ended_at_source: null,
        notes: null,
        created_at: '',
        updated_at: '',
      }
    : null;
}

/** Raw join row: entry columns plus the project's own columns, prefixed.
 *  `hoursUtils.dayWorkActivity` only reads `project.type`, but the app always
 *  attaches a full `Project`, so this mirrors that shape rather than a cast. */
interface EntryProjectRow extends Entry {
  project_name: string | null;
  project_type: Project['type'] | null;
  project_archived: number | null;
  project_created_at: string | null;
  project_updated_at: string | null;
}

/** One query for the whole selection's tags, grouped by entry — not one per
 *  entry. `scope` is a WHERE fragment over `e`, never interpolated user input. */
function tagsByEntry(
  db: Database.Database,
  scope: string,
  params: unknown[],
): Map<number, Tag[]> {
  const rows = db
    .prepare(
      `SELECT et.entry_id AS entryId, t.id AS id, t.name AS name,
              t.created_at AS created_at
         FROM entry_tags et
         JOIN tags t ON t.id = et.tag_id
         JOIN entries e ON e.id = et.entry_id
        WHERE ${scope}
        ORDER BY t.name COLLATE NOCASE`,
    )
    .all(...params) as (Tag & {entryId: number})[];

  const map = new Map<number, Tag[]>();
  for (const {entryId, ...tag} of rows) {
    const list = map.get(entryId);
    if (list) {
      list.push(tag);
    } else {
      map.set(entryId, [tag]);
    }
  }
  return map;
}

/** Entries with their project and tags attached, exactly as the app builds them
 *  — `hoursUtils` reclassifies by `project.type`, so bare rows give wrong hours.
 *  `scope` is a fixed WHERE fragment chosen by the caller; values are bound. */
function loadEntries(
  db: Database.Database,
  scope: string,
  params: unknown[],
): Entry[] {
  const rows = db
    .prepare(
      `SELECT e.*,
              p.name AS project_name,
              p.type AS project_type,
              p.archived AS project_archived,
              p.created_at AS project_created_at,
              p.updated_at AS project_updated_at
         FROM entries e
         LEFT JOIN projects p ON p.id = e.project_id
        WHERE ${scope}
        ORDER BY COALESCE(e.time_from, e.created_at)`,
    )
    .all(...params) as EntryProjectRow[];

  const tags = tagsByEntry(db, scope, params);

  return rows.map(
    ({
      project_name,
      project_type,
      project_archived,
      project_created_at,
      project_updated_at,
      ...entry
    }): Entry => ({
      ...entry,
      is_overtime: Boolean(entry.is_overtime),
      is_small_task: Boolean(entry.is_small_task),
      tags: tags.get(entry.id) ?? [],
      project:
        entry.project_id != null && project_type != null
          ? {
              id: entry.project_id,
              name: project_name ?? '',
              type: project_type,
              archived: Boolean(project_archived),
              created_at: project_created_at ?? '',
              updated_at: project_updated_at ?? '',
            }
          : null,
    }),
  );
}

export function getEntries(db: Database.Database, dayId: number): Entry[] {
  return loadEntries(db, 'e.day_id = ?', [dayId]);
}

/** Every entry across a date range, for the work-hours report. */
export function getEntriesInRange(
  db: Database.Database,
  from: string,
  to: string,
): Entry[] {
  return loadEntries(
    db,
    'e.day_id IN (SELECT id FROM days WHERE date >= ? AND date <= ?)',
    [from, to],
  );
}

/** Full day rows (not the list summaries) across a range. */
export function getDaysInRange(
  db: Database.Database,
  from: string,
  to: string,
): Day[] {
  return db
    .prepare('SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date')
    .all(from, to) as Day[];
}

export function getLeaveRangesInRange(
  db: Database.Database,
  from: string,
  to: string,
): LeaveRange[] {
  if (!hasTable(db, 'leave_ranges')) return [];
  return db.prepare(
    `SELECT * FROM leave_ranges
      WHERE start_date <= ? AND end_date >= ?
      ORDER BY start_date, id`,
  ).all(to, from) as LeaveRange[];
}

/** A settings value from the synced database — the report's person and company
 *  names are whatever the phone has set. */
export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | {value: string | null}
    | undefined;
  return row?.value ?? null;
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
