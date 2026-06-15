import {format, parseISO, differenceInSeconds, isToday, isYesterday} from 'date-fns';
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
