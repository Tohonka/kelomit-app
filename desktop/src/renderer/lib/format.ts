export {formatHours} from '../../../../src/utils/hoursUtils.ts';

/** `7:48` — fits a calendar cell where `7h 48m` does not. */
export function compactHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` of a local Date. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Stored instants are UTC ISO; show them as the Mac's local wall clock. */
export function clock(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit', hour12: false});
}

export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
}

export const ACTIVITY_LABEL: Record<string, string> = {
  work: 'Work',
  personal_work: 'Personal at work',
  personal: 'Personal',
};

export const LEAVE_LABEL: Record<string, string> = {
  paid_day_off: 'Day off (paid)',
  unpaid_day_off: 'Day off (unpaid)',
  vacation: 'Vacation',
  sick: 'Sick',
};
