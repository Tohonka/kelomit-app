import {format, parseISO, differenceInSeconds, isToday, isYesterday} from 'date-fns';

export function todayDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDate(isoDate: string): string {
  const d = parseISO(isoDate);
  if (isToday(d)) {
    return 'Today';
  }
  if (isYesterday(d)) {
    return 'Yesterday';
  }
  return format(d, 'EEE, MMM d');
}

export function formatTime(isoDatetime: string): string {
  return format(parseISO(isoDatetime), 'HH:mm');
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
