import {format, startOfDay, subDays, subMonths} from 'date-fns';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export function parsePayPeriodStartDay(
  value: string | null | undefined,
): number {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : 1;
}

export function completedPayPeriod(
  today: Date,
  startDay: number,
): DateRange {
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) {
    throw new Error('pay_period_invalid_day');
  }
  const localToday = startOfDay(today);
  const thisMonthStart = new Date(
    localToday.getFullYear(),
    localToday.getMonth(),
    startDay,
  );
  const completedPeriodEndBoundary =
    localToday >= thisMonthStart
      ? thisMonthStart
      : subMonths(thisMonthStart, 1);
  return {
    startDate: format(subMonths(completedPeriodEndBoundary, 1), 'yyyy-MM-dd'),
    endDate: format(subDays(completedPeriodEndBoundary, 1), 'yyyy-MM-dd'),
  };
}
