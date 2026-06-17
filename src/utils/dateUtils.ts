import {
  format,
  parseISO,
  differenceInSeconds,
  isToday,
  isYesterday,
  getISOWeek,
  getISOWeekYear,
} from 'date-fns';
import i18n, {getDateFnsLocale} from '../i18n';

export function todayDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDate(isoDate: string): string {
  const d = parseISO(isoDate);
  if (isToday(d)) {
    return i18n.t('dates.today');
  }
  if (isYesterday(d)) {
    return i18n.t('dates.yesterday');
  }
  return format(d, 'EEE, MMM d', {locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en')});
}

/**
 * Parse a stored timestamp to a Date (absolute instant).
 * App-written values are ISO 8601 with a zone (`toISOString()` → ends in `Z`).
 * SQLite `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` in UTC with no zone
 * marker — without this it would be misread as local time and shown hours off.
 */
export function parseTimestamp(value: string): Date {
  if (value.includes('T')) {
    return parseISO(value);
  }
  return new Date(value.replace(' ', 'T') + 'Z');
}

/** Local YYYY-MM-DD for a stored timestamp (used for date grouping/headers). */
export function localDateOf(value: string): string {
  return format(parseTimestamp(value), 'yyyy-MM-dd');
}

export function formatTime(isoDatetime: string): string {
  return format(parseTimestamp(isoDatetime), 'HH:mm');
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

export function durationBetween(
  fromIso: string,
  toIso: string,
): number {
  return differenceInSeconds(parseISO(toIso), parseISO(fromIso));
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ─── Period grouping (Gallery day/week/month buckets) ───────────────────────

export type PeriodMode = 'day' | 'week' | 'month';

function localDateFromStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Stable bucket key for a YYYY-MM-DD date under the given grouping. ISO weeks
 *  are Monday-based (matches the calendar). */
export function periodKey(dateStr: string, mode: PeriodMode): string {
  if (mode === 'day') {
    return dateStr;
  }
  const d = localDateFromStr(dateStr);
  if (mode === 'month') {
    return format(d, 'yyyy-MM');
  }
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

/** Human label for a period bucket (localized). */
export function periodLabel(dateStr: string, mode: PeriodMode): string {
  if (mode === 'day') {
    return formatDate(dateStr);
  }
  const d = localDateFromStr(dateStr);
  const locale = getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en');
  if (mode === 'month') {
    return format(d, 'LLLL yyyy', {locale});
  }
  // Week: Monday–Sunday range.
  const mondayIdx = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - mondayIdx);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${format(start, 'MMM d', {locale})} – ${format(end, 'MMM d', {locale})}`;
}

/** Combine a local day (YYYY-MM-DD) with a wall-clock "HH:mm" into an ISO
 *  instant (UTC). Used to place "usual hours" onto a specific day. */
export function hhmmToIsoOn(dateStr: string, hhmm: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

/** Shift a YYYY-MM-DD date string by N days (local time, no UTC drift). */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return format(new Date(y, m - 1, d + days), 'yyyy-MM-dd');
}

/**
 * Dates considered "next day" for upcoming to-dos. On Fridays this is both
 * Saturday and Monday (so weekend planning isn't lost); otherwise just tomorrow.
 */
export function nextDayDates(from: Date = new Date()): string[] {
  const offsets = from.getDay() === 5 ? [1, 3] : [1];
  return offsets.map(o => {
    const d = new Date(from);
    d.setDate(from.getDate() + o);
    return format(d, 'yyyy-MM-dd');
  });
}
