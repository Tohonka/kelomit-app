import type Database from 'better-sqlite3';
import {
  getDay,
  getDaysInRange,
  getEntries,
  getEntriesInRange,
  getEntryMedia,
  getLeaveRangesInRange,
  getRouteSegments,
  getRouteStops,
} from '../../../server/src/queries.ts';
import type {MediaRow, RouteSegmentRow, RouteStopRow} from '../../../server/src/queries.ts';
import {calcDayWorkSecs} from '../../../src/utils/hoursUtils.ts';
import {distanceMeters} from '../../../src/services/locationUtils.ts';
import {dayFood, dayHealth, foodMonth, foodProduct, foodSearch, gallery, habitsMonth, healthMonth, listNags, listPlaces, search} from './life.ts';
import {insights} from './insights.ts';
import {appUseRange, dayAppUse, excludedApps} from './appUse/read.ts';
import type {Day, DayRouteStop, Entry, LeaveRange, ModeSpan, Project, RouteCoordinate, Tag, TripMode} from '../../../src/types/index.ts';

/**
 * Read model for the renderer. Everything here is a synchronous read of the
 * last pushed database; `hoursUtils` is the phone's own code, and the server
 * queries already attach `project` + `tags` the way the hours model expects.
 */

export interface MonthDay {
  date: string;
  workSeconds: number;
  entryCount: number;
  hasLegs: boolean;
  leaves: LeaveRange[];
}

export interface MonthSummary {
  /** `YYYY-MM` */
  month: string;
  days: MonthDay[];
  totalWorkSeconds: number;
}

function monthBounds(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

export function monthSummary(db: Database.Database, month: string): MonthSummary {
  const [from, to] = monthBounds(month);
  const days = getDaysInRange(db, from, to);
  const entries = getEntriesInRange(db, from, to);
  const leaves = getLeaveRangesInRange(db, from, to);

  const entriesByDay = new Map<number, Entry[]>();
  for (const e of entries) {
    const list = entriesByDay.get(e.day_id);
    if (list) list.push(e);
    else entriesByDay.set(e.day_id, [e]);
  }

  const byDate = new Map<string, MonthDay>();
  for (const day of days) {
    const own = entriesByDay.get(day.id) ?? [];
    byDate.set(day.date, {
      date: day.date,
      workSeconds: calcDayWorkSecs(day, own),
      entryCount: own.length,
      hasLegs: Boolean(day.started_at && day.ended_at) || Boolean(day.started_at_2 && day.ended_at_2),
      leaves: [],
    });
  }
  for (const leave of leaves) {
    for (const date of datesBetween(leave.start_date, leave.end_date, from, to)) {
      const md = byDate.get(date) ?? {date, workSeconds: 0, entryCount: 0, hasLegs: false, leaves: []};
      md.leaves.push(leave);
      byDate.set(date, md);
    }
  }
  const list = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    month,
    days: list,
    totalWorkSeconds: list.reduce((s, d) => s + d.workSeconds, 0),
  };
}

function datesBetween(start: string, end: string, clampFrom: string, clampTo: string): string[] {
  const out: string[] = [];
  const s = start < clampFrom ? clampFrom : start;
  const e = end > clampTo ? clampTo : end;
  const d = new Date(`${s}T00:00:00Z`);
  const stop = new Date(`${e}T00:00:00Z`);
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface DayDetail {
  day: Day | null;
  entries: Entry[];
  media: MediaRow[];
  leaves: LeaveRange[];
  segments: RouteSegmentRow[];
  stops: RouteStopRow[];
}

export function dayDetail(db: Database.Database, date: string): DayDetail {
  const day = getDay(db, date);
  const leaves = getLeaveRangesInRange(db, date, date);
  if (!day || day.id < 0) {
    return {day, entries: [], media: [], leaves, segments: [], stops: []};
  }
  return {
    day,
    entries: getEntries(db, day.id),
    media: getEntryMedia(db, day.id),
    leaves,
    segments: getRouteSegments(db, day.id),
    stops: getRouteStops(db, day.id),
  };
}

export function listProjects(db: Database.Database): Project[] {
  return (db.prepare('SELECT * FROM projects ORDER BY archived, name COLLATE NOCASE').all() as Project[]).map(p => ({
    ...p,
    archived: Boolean(p.archived),
  }));
}

export interface RouteTrip {
  sequence: number;
  start_ts: string;
  end_ts: string;
  coordinates: RouteCoordinate[];
  mode_spans: ModeSpan[] | null;
  distance_m: number;
  duration_sec: number;
}

export interface DayRoute {
  trips: RouteTrip[];
  /** Full rows: the Mac renames stops, so it needs ids and name sources. */
  stops: DayRouteStop[];
}

/** The day's derived route (segments + stops), coordinates parsed. */
export function dayRoute(db: Database.Database, date: string): DayRoute {
  const day = getDay(db, date);
  if (!day || day.id < 0) {
    return {trips: [], stops: []};
  }
  const rows = db
    .prepare(
      `SELECT sequence, start_ts, end_ts, coordinates_json, mode_spans_json, distance_m, duration_sec
         FROM day_route_segments WHERE day_id = ? ORDER BY sequence`,
    )
    .all(day.id) as {
    sequence: number;
    start_ts: string;
    end_ts: string;
    coordinates_json: string;
    mode_spans_json: string | null;
    distance_m: number;
    duration_sec: number;
  }[];
  const parse = <T,>(json: string | null, fallback: T): T => {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  };
  return {
    trips: rows.map(r => ({
      sequence: r.sequence,
      start_ts: r.start_ts,
      end_ts: r.end_ts,
      coordinates: parse<RouteCoordinate[]>(r.coordinates_json, []),
      mode_spans: parse<ModeSpan[] | null>(r.mode_spans_json, null),
      distance_m: r.distance_m,
      duration_sec: r.duration_sec,
    })),
    stops: (db.prepare('SELECT * FROM day_route_stops WHERE day_id = ? ORDER BY start_ts').all(day.id) as DayRouteStop[]).map(s => ({
      ...s,
      user_edited: Boolean(s.user_edited),
    })),
  };
}

export interface TrackPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  timestamp: string;
  /** `trip:n` — trip is the route segment's sequence, 0 for a fix outside every trip. */
  label: string;
  /** Activity-recognition state at the fix (latest "enter" at or before it). */
  activity: string | null;
  /** The route's derived mode at the fix, when it falls inside a trip. */
  mode: TripMode | null;
  /** Step from the previous stored fix. */
  dt_sec: number | null;
  dist_m: number | null;
}

/** Route debug: every stored fix of the day, numbered so a spot can be named. */
export function dayTrack(db: Database.Database, date: string): TrackPoint[] {
  const day = getDay(db, date);
  if (!day || day.id < 0) {
    return [];
  }
  const rows = db
    .prepare('SELECT id, latitude, longitude, accuracy, altitude, speed, timestamp FROM gps_track WHERE day_id = ? ORDER BY timestamp, id')
    .all(day.id) as Omit<TrackPoint, 'label' | 'activity' | 'mode' | 'dt_sec' | 'dist_m'>[];
  if (rows.length === 0) {
    return [];
  }
  const trips = (
    db.prepare('SELECT sequence, start_ts, end_ts, mode_spans_json FROM day_route_segments WHERE day_id = ? ORDER BY sequence').all(day.id) as {
      sequence: number;
      start_ts: string;
      end_ts: string;
      mode_spans_json: string | null;
    }[]
  ).map(t => {
    let spans: ModeSpan[] = [];
    try {
      spans = (t.mode_spans_json && JSON.parse(t.mode_spans_json)) || [];
    } catch {
      // unparseable spans: the point just shows no mode
    }
    return {sequence: t.sequence, start: Date.parse(t.start_ts), end: Date.parse(t.end_ts), spans};
  });
  // The activity in force at the first fix started before it, possibly on an earlier day.
  const enters = (where: string, order: string, ...args: string[]) =>
    db.prepare(`SELECT activity, timestamp FROM activity_events WHERE transition = 'enter' AND ${where} ORDER BY timestamp ${order}`).all(...args) as {activity: string; timestamp: string}[];
  const acts = [
    ...enters('timestamp <= ?', 'DESC LIMIT 1', rows[0].timestamp),
    ...enters('timestamp > ? AND timestamp <= ?', 'ASC', rows[0].timestamp, rows[rows.length - 1].timestamp),
  ].map(a => ({activity: a.activity, t: Date.parse(a.timestamp)}));

  const counts = new Map<number, number>();
  let ai = -1;
  return rows.map((r, i) => {
    const t = Date.parse(r.timestamp);
    const trip = trips.find(s => t >= s.start && t <= s.end);
    const seq = trip?.sequence ?? 0;
    const n = (counts.get(seq) ?? 0) + 1;
    counts.set(seq, n);
    while (ai + 1 < acts.length && acts[ai + 1].t <= t) ai++;
    const prev = rows[i - 1];
    return {
      ...r,
      label: `${seq}:${n}`,
      activity: acts[ai]?.activity ?? null,
      mode: trip?.spans.find(s => t >= Date.parse(s.startTs) && t <= Date.parse(s.endTs))?.mode ?? null,
      dt_sec: prev ? (t - Date.parse(prev.timestamp)) / 1000 : null,
      dist_m: prev ? distanceMeters(prev.latitude, prev.longitude, r.latitude, r.longitude) : null,
    };
  });
}

/** Leave ranges touching a calendar year. */
export function listLeave(db: Database.Database, year: number): LeaveRange[] {
  return getLeaveRangesInRange(db, `${year}-01-01`, `${year}-12-31`);
}

export function listTags(db: Database.Database): Tag[] {
  return db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all() as Tag[];
}

/** Every query the renderer may call, by name. The IPC layer looks them up
 *  here, so a typo is a thrown error rather than arbitrary SQL. */
export const QUERIES = {
  monthSummary,
  dayDetail,
  listProjects,
  listTags,
  listLeave,
  dayRoute,
  dayTrack,
  dayFood,
  foodSearch,
  foodProduct,
  habitsMonth,
  listNags,
  listPlaces,
  dayHealth,
  foodMonth,
  healthMonth,
  gallery,
  search,
  insights,
  dayAppUse,
  appUseRange,
  excludedApps,
} as const;

export type QueryName = keyof typeof QUERIES;
export type QueryArgs<N extends QueryName> = Parameters<(typeof QUERIES)[N]> extends [
  Database.Database,
  ...infer Rest,
]
  ? Rest
  : never;
export type QueryResult<N extends QueryName> = ReturnType<(typeof QUERIES)[N]>;
