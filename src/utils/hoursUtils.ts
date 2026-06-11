import {differenceInSeconds, parseISO} from 'date-fns';
import type {Entry} from '../types';

export interface HourBreakdown {
  workSeconds: number;
  personalWorkSeconds: number;
  personalSeconds: number;
  totalTrackedSeconds: number;
}

function entrySeconds(entry: Entry): number {
  if (entry.duration_sec != null) {
    return entry.duration_sec;
  }
  if (entry.time_from && entry.time_to) {
    const s = differenceInSeconds(
      parseISO(entry.time_to),
      parseISO(entry.time_from),
    );
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
    if (secs === 0) {
      continue;
    }
    if (e.activity_type === 'work') {
      workSeconds += secs;
    } else if (e.activity_type === 'personal_work') {
      personalWorkSeconds += secs;
    } else {
      personalSeconds += secs;
    }
  }

  return {
    workSeconds,
    personalWorkSeconds,
    personalSeconds,
    totalTrackedSeconds: workSeconds + personalWorkSeconds + personalSeconds,
  };
}

export function formatHours(seconds: number): string {
  const h = seconds / 3600;
  return `${h.toFixed(1)}h`;
}
