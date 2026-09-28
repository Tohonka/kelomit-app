import type Database from 'better-sqlite3';
import {getSetting, hasTable} from '../../../../server/src/queries.ts';
import {shiftDate} from '../life.ts';
import type {Bucket} from './store.ts';

/**
 * Read model for app use: the phone's rows (last push) overlaid with the
 * Mac's own not-yet-flushed buffer so today is live. All the folding is
 * pure (`build`) so it is testable without a database.
 */
export interface AppUseChunk {
  kind: 'timer' | 'manual';
  /** app_use.id for timer chunks, app_use_assignments.id for manual; -1 = live, not on the phone yet. */
  id: number;
  /** Null on a timer chunk whose note does not exist yet (timer still running). */
  entry_id: number | null;
  title: string | null;
  seconds: number;
}

export interface AppUseApp {
  bundle_id: string;
  app_name: string;
  active_sec: number;
  idle_sec: number;
  unassigned_sec: number;
  chunks: AppUseChunk[];
}

export interface DayAppUse {
  date: string;
  apps: AppUseApp[];
  total_sec: number;
  idle_sec: number;
}

export interface AppUseRange {
  apps: {bundle_id: string; app_name: string; active_sec: number; idle_sec: number}[];
  total_sec: number;
  idle_sec: number;
  /** Days in the range with any app use. */
  days: number;
}

export interface AutoRow {
  id: number;
  date: string;
  bundle_id: string;
  app_name: string;
  session_from: string;
  entry_id: number | null;
  detached: number;
  active_sec: number;
  idle_sec: number;
  /** Joined entries.title. */
  title: string | null;
}

export interface AssignRow {
  id: number;
  bundle_id: string;
  entry_id: number;
  seconds: number;
  title: string | null;
}

let liveSource: (date: string) => Bucket[] | null = () => null;

/** The collector registers its buffer here at startup. */
export function setLiveSource(fn: (date: string) => Bucket[] | null): void {
  liveSource = fn;
}

/** Live buckets are fresher than the last push: they override a matching
 *  row's seconds and add buckets the phone has not seen as id -1. */
export function mergeLive(rows: AutoRow[], live: Bucket[] | null): AutoRow[] {
  if (!live) return rows;
  const out = rows.map(r => ({...r}));
  for (const b of live) {
    const hit = out.find(r => r.bundle_id === b.bundle_id && r.session_from === b.session_from);
    if (hit) {
      hit.active_sec = b.active_sec;
      hit.idle_sec = b.idle_sec;
      hit.app_name = b.app_name;
    } else {
      out.push({
        id: -1,
        date: '',
        bundle_id: b.bundle_id,
        app_name: b.app_name,
        session_from: b.session_from,
        entry_id: null,
        detached: 0,
        active_sec: b.active_sec,
        idle_sec: b.idle_sec,
        title: null,
      });
    }
  }
  return out;
}

export function build(date: string, rows: AutoRow[], assigns: AssignRow[]): DayAppUse {
  const apps = new Map<string, AppUseApp>();
  const appFor = (bundleId: string, name: string): AppUseApp => {
    let a = apps.get(bundleId);
    if (!a) {
      a = {bundle_id: bundleId, app_name: name, active_sec: 0, idle_sec: 0, unassigned_sec: 0, chunks: []};
      apps.set(bundleId, a);
    }
    return a;
  };
  for (const r of rows) {
    const a = appFor(r.bundle_id, r.app_name);
    a.active_sec += r.active_sec;
    a.idle_sec += r.idle_sec;
    const secs = r.active_sec + r.idle_sec;
    if (r.entry_id != null) {
      a.chunks.push({kind: 'timer', id: r.id, entry_id: r.entry_id, title: r.title, seconds: secs});
    } else if (r.session_from === '' || r.detached) {
      a.unassigned_sec += secs;
    } else {
      // Collected under a timer whose note does not exist yet: neither free nor assigned.
      a.chunks.push({kind: 'timer', id: r.id, entry_id: null, title: null, seconds: secs});
    }
  }
  for (const s of assigns) {
    const a = apps.get(s.bundle_id);
    if (!a) continue;
    a.chunks.push({kind: 'manual', id: s.id, entry_id: s.entry_id, title: s.title, seconds: s.seconds});
    a.unassigned_sec -= s.seconds;
  }
  const list = [...apps.values()]
    .map(a => ({...a, unassigned_sec: Math.max(0, a.unassigned_sec)}))
    .sort((x, y) => y.active_sec + y.idle_sec - (x.active_sec + x.idle_sec));
  return {
    date,
    apps: list,
    total_sec: list.reduce((s, a) => s + a.active_sec + a.idle_sec, 0),
    idle_sec: list.reduce((s, a) => s + a.idle_sec, 0),
  };
}

export function dayAppUse(db: Database.Database, date: string): DayAppUse {
  const live = liveSource(date);
  if (!hasTable(db, 'app_use')) {
    return build(date, mergeLive([], live), []);
  }
  const rows = db
    .prepare(
      `SELECT u.id, u.date, u.bundle_id, u.app_name, u.session_from, u.entry_id, u.detached, u.active_sec, u.idle_sec, e.title
         FROM app_use u LEFT JOIN entries e ON e.id = u.entry_id WHERE u.date = ? ORDER BY u.id`
    )
    .all(date) as AutoRow[];
  const assigns = db
    .prepare(
      `SELECT a.id, a.bundle_id, a.entry_id, a.seconds, e.title
         FROM app_use_assignments a LEFT JOIN entries e ON e.id = a.entry_id WHERE a.date = ? ORDER BY a.id`
    )
    .all(date) as AssignRow[];
  return build(date, mergeLive(rows, live), assigns);
}

/** Sums per app over [from, to], day by day through dayAppUse so today is live. */
export function appUseRange(db: Database.Database, from: string, to: string): AppUseRange {
  const apps = new Map<string, AppUseRange['apps'][number]>();
  let days = 0;
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const d = dayAppUse(db, date);
    if (d.total_sec > 0) days++;
    for (const a of d.apps) {
      const t = apps.get(a.bundle_id) ?? {bundle_id: a.bundle_id, app_name: a.app_name, active_sec: 0, idle_sec: 0};
      t.active_sec += a.active_sec;
      t.idle_sec += a.idle_sec;
      t.app_name = a.app_name;
      apps.set(a.bundle_id, t);
    }
  }
  const list = [...apps.values()].sort((x, y) => y.active_sec + y.idle_sec - (x.active_sec + x.idle_sec));
  return {
    apps: list,
    total_sec: list.reduce((s, a) => s + a.active_sec + a.idle_sec, 0),
    idle_sec: list.reduce((s, a) => s + a.idle_sec, 0),
    days,
  };
}

/** Bundle ids the collector must skip (settings `app_use_excluded`, a JSON array). */
export function excludedApps(db: Database.Database): string[] {
  try {
    const parsed: unknown = JSON.parse(getSetting(db, 'app_use_excluded') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
