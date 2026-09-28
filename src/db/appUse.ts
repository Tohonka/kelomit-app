import {getDB} from './database';
import {getSetting, setSetting} from './settings';

/**
 * App use (plan 2026-09-28): foreground time the desktop companion observed,
 * per day and app. The desktop owns the totals and re-sends a whole day each
 * flush; the phone owns which note a bucket belongs to.
 */

/** One desktop-observed bucket: totals for (date, app, timer segment). */
export interface AppUseTotal {
  bundle_id: string;
  app_name: string;
  /** Timer segment start (ISO) the time was collected under; '' = none. */
  session_from: string;
  active_sec: number;
  idle_sec: number;
}

export const APP_USE_EXCLUDED_KEY = 'app_use_excluded';

function isTotal(r: unknown): r is AppUseTotal {
  const t = r as Partial<AppUseTotal> | null;
  return (
    typeof t?.bundle_id === 'string' && t.bundle_id.length > 0 &&
    typeof t.app_name === 'string' && typeof t.session_from === 'string' &&
    Number.isFinite(t.active_sec) && Number.isFinite(t.idle_sec)
  );
}

/** Replace the day's buckets with the desktop's totals (idempotent), then
 *  attach timer buckets to their notes. Returns the number of rows written. */
export async function upsertAppUseTotals(date: string, rows: unknown[]): Promise<number> {
  const db = getDB();
  let n = 0;
  for (const r of rows) {
    if (!isTotal(r) || r.active_sec + r.idle_sec <= 0) { continue; }
    await db.execute(
      `INSERT INTO app_use (date, bundle_id, app_name, session_from, active_sec, idle_sec)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, bundle_id, session_from) DO UPDATE SET
         app_name = excluded.app_name,
         active_sec = excluded.active_sec,
         idle_sec = excluded.idle_sec,
         updated_at = datetime('now');`,
      [date, r.bundle_id, r.app_name, r.session_from, Math.round(r.active_sec), Math.round(r.idle_sec)],
    );
    n++;
  }
  await resolveTimerBuckets(date);
  return n;
}

/** A timer note's time_from is exactly its segment's started_at
 *  (sessionLogic.sessionToEntryParams), so that is the join. Rows the user
 *  detached are left alone; rows whose note does not exist yet stay NULL and
 *  are retried on the next upsert of the day. */
export async function resolveTimerBuckets(date: string): Promise<void> {
  await getDB().execute(
    `UPDATE app_use SET
       entry_id = (SELECT e.id FROM entries e WHERE e.time_from = app_use.session_from ORDER BY e.id LIMIT 1),
       updated_at = datetime('now')
     WHERE date = ? AND session_from <> '' AND entry_id IS NULL AND detached = 0;`,
    [date],
  );
}

/** Seconds of this app on this day not attached to any note: free buckets
 *  (no timer, or detached) minus manual chunks. */
export async function unassignedAppUseSeconds(date: string, bundleId: string): Promise<number> {
  const res = await getDB().execute(
    `SELECT
       (SELECT COALESCE(SUM(active_sec + idle_sec), 0) FROM app_use
         WHERE date = ? AND bundle_id = ? AND entry_id IS NULL AND (session_from = '' OR detached = 1))
       - (SELECT COALESCE(SUM(seconds), 0) FROM app_use_assignments WHERE date = ? AND bundle_id = ?)
       AS free;`,
    [date, bundleId, date, bundleId],
  );
  const free = Number((res.rows?.[0] as {free?: number} | undefined)?.free ?? 0);
  return Math.max(0, free);
}

/** Take `seconds` of the app's free time on `date` and pin it to a note. */
export async function assignAppUse(
  date: string, bundleId: string, entryId: number, seconds: number,
): Promise<number> {
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error('seconds must be a positive integer');
  }
  const free = await unassignedAppUseSeconds(date, bundleId);
  if (seconds > free) {
    throw new Error(`only ${free}s unassigned`);
  }
  const res = await getDB().execute(
    'INSERT INTO app_use_assignments (date, bundle_id, entry_id, seconds) VALUES (?, ?, ?, ?) RETURNING id;',
    [date, bundleId, entryId, seconds],
  );
  return Number((res.rows![0] as {id: number}).id);
}

export async function removeAppUseAssignment(id: number): Promise<void> {
  await getDB().execute('DELETE FROM app_use_assignments WHERE id = ?;', [id]);
}

/** Take a timer bucket off its note; its seconds become free time. */
export async function detachAppUse(id: number): Promise<void> {
  await getDB().execute(
    "UPDATE app_use SET entry_id = NULL, detached = 1, updated_at = datetime('now') WHERE id = ?;",
    [id],
  );
}

/** Add/remove a bundle id in the exclusion list; returns the new list.
 *  Already-logged rows are kept — the desktop simply stops sampling the app. */
export async function setAppUseExcluded(bundleId: string, excluded: boolean): Promise<string[]> {
  let list: string[] = [];
  try {
    const raw = await getSetting(APP_USE_EXCLUDED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) { list = parsed.filter((x): x is string => typeof x === 'string'); }
  } catch {
    list = [];
  }
  const next = excluded
    ? (list.includes(bundleId) ? list : [...list, bundleId])
    : list.filter(b => b !== bundleId);
  await setSetting(APP_USE_EXCLUDED_KEY, JSON.stringify(next));
  return next;
}
