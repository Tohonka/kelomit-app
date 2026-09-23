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
import {dayFood, dayHealth, foodProduct, foodSearch, gallery, habitsMonth, listNags, listPlaces, search} from './life.ts';
import {insights} from './insights.ts';
import type {Day, DayRouteStop, Entry, LeaveRange, ModeSpan, Project, RouteCoordinate, Tag} from '../../../src/types/index.ts';

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
  dayFood,
  foodSearch,
  foodProduct,
  habitsMonth,
  listNags,
  listPlaces,
  dayHealth,
  gallery,
  search,
  insights,
} as const;

export type QueryName = keyof typeof QUERIES;
export type QueryArgs<N extends QueryName> = Parameters<(typeof QUERIES)[N]> extends [
  Database.Database,
  ...infer Rest,
]
  ? Rest
  : never;
export type QueryResult<N extends QueryName> = ReturnType<(typeof QUERIES)[N]>;
