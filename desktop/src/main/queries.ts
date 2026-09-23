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
import type {Day, Entry, LeaveRange, Project, Tag} from '../../../src/types/index.ts';

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
} as const;

export type QueryName = keyof typeof QUERIES;
export type QueryArgs<N extends QueryName> = Parameters<(typeof QUERIES)[N]> extends [
  Database.Database,
  ...infer Rest,
]
  ? Rest
  : never;
export type QueryResult<N extends QueryName> = ReturnType<(typeof QUERIES)[N]>;
