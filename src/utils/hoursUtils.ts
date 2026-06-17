import {differenceInSeconds, parseISO} from 'date-fns';
import type {Entry, Day} from '../types';

export interface HourBreakdown {
  workSeconds: number;
  personalWorkSeconds: number;
  personalSeconds: number;
  totalTrackedSeconds: number;
}

function entrySeconds(entry: Entry): number {
  // Unconfirmed to-dos don't count toward worked hours until completed.
  if (entry.is_todo && !entry.completed_at) {
    return 0;
  }
  if (entry.duration_sec != null) {
    return entry.duration_sec;
  }
  if (entry.time_from && entry.time_to) {
    const s = differenceInSeconds(parseISO(entry.time_to), parseISO(entry.time_from));
    return s > 0 ? s : 0;
  }
  return 0;
}

/** Per-activity tracked seconds across the given entries. This is an
 *  entry-level view (used by the activity split bar), distinct from the
 *  work-day model in {@link calcDayWorkBreakdown}. */
export function calcHourBreakdown(entries: Entry[]): HourBreakdown {
  let workSeconds = 0;
  let personalWorkSeconds = 0;
  let personalSeconds = 0;

  for (const e of entries) {
    const secs = entrySeconds(e);
    if (secs === 0) { continue; }
    if (e.activity_type === 'work') { workSeconds += secs; }
    else if (e.activity_type === 'personal_work') { personalWorkSeconds += secs; }
    else { personalSeconds += secs; }
  }

  return {
    workSeconds,
    personalWorkSeconds,
    personalSeconds,
    totalTrackedSeconds: workSeconds + personalWorkSeconds + personalSeconds,
  };
}

function legSecs(start: string | null, end: string | null): number {
  if (!start || !end) { return 0; }
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff > 0 ? diff / 1000 : 0;
}

/** Work seconds for a single day segment (leg). 0 if incomplete or invalid. */
export function segmentWorkSecs(start: string | null, end: string | null): number {
  return legSecs(start, end);
}

// ─── Work-day model (interval math) ─────────────────────────────────────────
// All times in absolute epoch seconds so comparisons are timezone/DST-safe.

type Interval = [number, number];

function epoch(iso: string): number {
  return Math.round(new Date(iso).getTime() / 1000);
}

/** Sort + merge overlapping/adjacent intervals. */
function merge(ivs: Interval[]): Interval[] {
  const sorted = ivs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) {
      last[1] = Math.max(last[1], b);
    } else {
      out.push([a, b]);
    }
  }
  return out;
}

/** Total covered length of a set of intervals (overlaps counted once). */
function totalLength(ivs: Interval[]): number {
  return merge(ivs).reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** Pieces of `iv` that fall inside the merged set `m`. */
function intersect(iv: Interval, m: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [c, d] of m) {
    const s = Math.max(iv[0], c);
    const e = Math.min(iv[1], d);
    if (e > s) { out.push([s, e]); }
  }
  return out;
}

/** Pieces of `iv` that fall outside the merged set `m`. */
function subtract(iv: Interval, m: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = iv[0];
  for (const [c, d] of m) {
    if (d <= cursor || c >= iv[1]) { continue; }
    if (c > cursor) { out.push([cursor, Math.min(c, iv[1])]); }
    cursor = Math.max(cursor, d);
    if (cursor >= iv[1]) { break; }
  }
  if (cursor < iv[1]) { out.push([cursor, iv[1]]); }
  return out;
}

/** Placeable [from, to] interval for an entry, or null if it can't be located
 *  on the timeline (duration-only entries, missing timestamps, or unconfirmed
 *  to-dos). Duration-only entries deliberately can't be placed — see the
 *  caveat on {@link calcDayWorkBreakdown}. */
function entryInterval(e: Entry): Interval | null {
  if (e.is_todo && !e.completed_at) { return null; }
  if (e.time_from && e.time_to) {
    const a = epoch(e.time_from);
    const b = epoch(e.time_to);
    return b > a ? [a, b] : null;
  }
  return null;
}

export interface DayWorkBreakdown {
  /** Sum of the day's leg durations — the work-day baseline. */
  baselineSeconds: number;
  /** Work entries' time that fell outside the legs (added). */
  addedWorkSeconds: number;
  /** Personal entries' time that fell inside the legs (deducted). */
  deductedPersonalSeconds: number;
  /** Final worked seconds: max(0, baseline + added − deducted). */
  workSeconds: number;
  /** True when the day has at least one valid leg (model applies). When false
   *  this is the entry-sum fallback and the adjustment fields are 0. */
  hasDayLegs: boolean;
}

/**
 * Worked-hours for a day under the "work day is the minimum" model:
 *  - baseline = the from–to leg span(s);
 *  - + the portion of `work` entries that falls OUTSIDE the legs;
 *  - − the portion of genuinely `personal` entries that falls INSIDE the legs.
 * `personal_work` is only a label and never adjusts the total.
 *
 * Caveat: the adjustments require placeable (time_from/time_to) entries.
 * Duration-only entries can't be located, so they neither add nor subtract when
 * legs exist (they're assumed within the work day). When no leg is set, we fall
 * back to summing `work` entry seconds (duration-only included), since the
 * entries are then the only signal.
 */
export function calcDayWorkBreakdown(day: Day, entries: Entry[]): DayWorkBreakdown {
  const legs: Interval[] = [];
  if (day.started_at && day.ended_at) { legs.push([epoch(day.started_at), epoch(day.ended_at)]); }
  if (day.started_at_2 && day.ended_at_2) { legs.push([epoch(day.started_at_2), epoch(day.ended_at_2)]); }
  const legUnion = merge(legs);

  if (legUnion.length === 0) {
    return {
      baselineSeconds: 0,
      addedWorkSeconds: 0,
      deductedPersonalSeconds: 0,
      workSeconds: calcHourBreakdown(entries).workSeconds,
      hasDayLegs: false,
    };
  }

  const baseline = totalLength(legUnion);
  const workOutside: Interval[] = [];
  const personalInside: Interval[] = [];

  for (const e of entries) {
    const iv = entryInterval(e);
    if (!iv) { continue; }
    if (e.activity_type === 'work') {
      workOutside.push(...subtract(iv, legUnion));
    } else if (e.activity_type === 'personal') {
      personalInside.push(...intersect(iv, legUnion));
    }
    // personal_work: neither added nor deducted (it's just a label).
  }

  const addedWorkSeconds = totalLength(workOutside);
  const deductedPersonalSeconds = totalLength(personalInside);
  const workSeconds = Math.max(0, baseline + addedWorkSeconds - deductedPersonalSeconds);

  return {
    baselineSeconds: baseline,
    addedWorkSeconds,
    deductedPersonalSeconds,
    workSeconds,
    hasDayLegs: true,
  };
}

/** Total work seconds for the day under the work-day model. */
export function calcDayWorkSecs(day: Day, entries: Entry[]): number {
  return calcDayWorkBreakdown(day, entries).workSeconds;
}

export function formatHours(seconds: number): string {
  if (seconds <= 0) { return '0h'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (m === 0) { return `${h}h`; }
  return `${h}h ${m}m`;
}
