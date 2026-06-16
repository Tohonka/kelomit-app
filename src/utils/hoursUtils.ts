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

/** Total work seconds for the day. Uses day start/end as source of truth if set,
 *  otherwise falls back to the sum of entry durations. */
export function calcDayWorkSecs(day: Day, entries: Entry[]): number {
  const leg1 = legSecs(day.started_at, day.ended_at);
  const leg2 = legSecs(day.started_at_2, day.ended_at_2);
  if (leg1 > 0 || leg2 > 0) { return leg1 + leg2; }
  return calcHourBreakdown(entries).workSeconds;
}

export function formatHours(seconds: number): string {
  if (seconds <= 0) { return '0h'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (m === 0) { return `${h}h`; }
  return `${h}h ${m}m`;
}
