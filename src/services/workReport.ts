import {eachDayOfInterval, format, parseISO} from 'date-fns';
import {enUS, fi as fiLocale} from 'date-fns/locale';
import type {Day, Entry, LeaveRange, LeaveType} from '../types';
import {formatTime, parseTimestamp} from '../utils/timeFormat';
import {calcDayWorkBreakdown, entryTrackedSeconds} from '../utils/hoursUtils';

type Interval = [number, number];

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push([...interval]);
    }
  }
  return merged;
}

function intervalSeconds(intervals: Interval[]): number {
  return mergeIntervals(intervals)
    .reduce((total, [start, end]) => total + end - start, 0);
}

function entryInterval(entry: Entry): Interval | null {
  if (
    (entry.is_todo && !entry.completed_at) ||
    !entry.time_from ||
    !entry.time_to
  ) {
    return null;
  }
  const start = Math.round(Date.parse(entry.time_from) / 1000);
  const end = Math.round(Date.parse(entry.time_to) / 1000);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? [start, end]
    : null;
}

function overlapSeconds(left: Interval[], right: Interval[]): number {
  const overlaps: Interval[] = [];
  for (const [leftStart, leftEnd] of mergeIntervals(left)) {
    for (const [rightStart, rightEnd] of mergeIntervals(right)) {
      const start = Math.max(leftStart, rightStart);
      const end = Math.min(leftEnd, rightEnd);
      if (end > start) {
        overlaps.push([start, end]);
      }
    }
  }
  return intervalSeconds(overlaps);
}

export interface ReportHourBuckets {
  regularSeconds: number;
  remoteOtherSeconds: number;
  overtimeSeconds: number;
  totalSeconds: number;
}

function reportLeavesByDate(
  ranges: LeaveRange[],
  startDate: string,
  endDate: string,
): Record<string, LeaveRange[]> {
  const result: Record<string, LeaveRange[]> = {};
  for (const range of ranges) {
    const start = range.start_date < startDate ? startDate : range.start_date;
    const end = range.end_date > endDate ? endDate : range.end_date;
    if (start > end) continue;
    for (const day of eachDayOfInterval({start: parseISO(start), end: parseISO(end)})) {
      (result[format(day, 'yyyy-MM-dd')] ??= []).push(range);
    }
  }
  return result;
}

export function classifyReportDay(
  day: Day,
  entries: Entry[],
  hasLeave: boolean,
): ReportHourBuckets {
  const eligibleWork = entries.filter(entry =>
    entry.activity_type === 'work' &&
    entry.project?.type !== 'personal' &&
    (!entry.is_todo || entry.completed_at != null),
  );
  const overtimeIntervals: Interval[] = [];
  const normalIntervals: Interval[] = [];
  let overtimeDuration = 0;
  let normalDuration = 0;
  for (const entry of eligibleWork) {
    const interval = entryInterval(entry);
    if (interval) {
      (entry.is_overtime ? overtimeIntervals : normalIntervals).push(interval);
    } else {
      const seconds = entryTrackedSeconds(entry);
      if (entry.is_overtime) {
        overtimeDuration += seconds;
      } else {
        normalDuration += seconds;
      }
    }
  }

  const overtimeSeconds =
    intervalSeconds(overtimeIntervals) + overtimeDuration;
  if (hasLeave) {
    const remoteOtherSeconds = Math.max(
      0,
      intervalSeconds(normalIntervals) -
        overlapSeconds(normalIntervals, overtimeIntervals) +
        normalDuration,
    );
    return {
      regularSeconds: 0,
      remoteOtherSeconds,
      overtimeSeconds,
      totalSeconds: remoteOtherSeconds + overtimeSeconds,
    };
  }

  const breakdown = calcDayWorkBreakdown(day, entries);
  const legs: Interval[] = [];
  if (day.started_at && day.ended_at) {
    legs.push([
      Math.round(Date.parse(day.started_at) / 1000),
      Math.round(Date.parse(day.ended_at) / 1000),
    ]);
  }
  if (day.started_at_2 && day.ended_at_2) {
    legs.push([
      Math.round(Date.parse(day.started_at_2) / 1000),
      Math.round(Date.parse(day.ended_at_2) / 1000),
    ]);
  }
  const personalIntervals = entries
    .filter(entry =>
      entry.activity_type === 'personal' || entry.project?.type === 'personal',
    )
    .map(entryInterval)
    .filter((interval): interval is Interval => interval != null);
  const regularBeforeOvertime = Math.max(
    0,
    intervalSeconds(legs) - overlapSeconds(legs, personalIntervals),
  );
  const classifiedOvertime = Math.min(overtimeSeconds, breakdown.workSeconds);
  const regularSeconds = Math.min(
    Math.max(0, regularBeforeOvertime - overlapSeconds(legs, overtimeIntervals)),
    breakdown.workSeconds - classifiedOvertime,
  );
  return {
    regularSeconds,
    remoteOtherSeconds: Math.max(
      0,
      breakdown.workSeconds - regularSeconds - classifiedOvertime,
    ),
    overtimeSeconds: classifiedOvertime,
    totalSeconds: breakdown.workSeconds,
  };
}

export type ReportLanguage = 'fi' | 'en';
export type WorkReportType = 'hours' | 'headlines' | 'statistics';

export interface WorkReportInput {
  personName: string;
  companyName: string;
  startDate: string;
  endDate: string;
  language: ReportLanguage;
  type: WorkReportType;
  days: Day[];
  entries: Entry[];
  leaveRanges: LeaveRange[];
}

interface WorkReportDay {
  date: string;
  workTime: string;
  regular: string;
  regularSeconds: number;
  remoteOther: string;
  remoteOtherSeconds: number;
  overtime: string;
  overtimeSeconds: number;
  total: string;
  totalSeconds: number;
  headlines: string[];
}

export interface WorkReportModel {
  meta: {
    personName: string;
    companyName: string;
    range: string;
    title: string;
    totalLabel: string;
    totalHours: string;
    pageLabel: string;
  };
  columns: {
    date: string;
    workTime: string;
    regular: string;
    remoteOther: string;
    overtime: string;
    total: string;
  };
  days: WorkReportDay[];
  statistics: null | {
    title: string;
    byProjectTitle: string;
    byTagTitle: string;
    nonExclusiveNote: string;
    projectRows: Array<{label: string; hours: string; seconds: number}>;
    tagRows: Array<{label: string; hours: string; seconds: number}>;
  };
}

const COPY = {
  en: {
    title: 'Work hours report',
    total: 'Total worked',
    date: 'Date',
    workTime: 'Work time',
    regular: 'Hours',
    remoteOther: 'Remote / Other',
    overtime: 'Overtime',
    totalColumn: 'Total',
    leave: {
      paid_day_off: 'Day off (paid)',
      unpaid_day_off: 'Day off (unpaid)',
      vacation: 'Vacation',
      sick: 'Sick',
    },
    statistics: 'Statistics',
    byProject: 'By project',
    byTag: 'By tag',
    untracked: 'Untracked work',
    nonExclusive: 'Tag totals are non-exclusive.',
    page: 'Page',
  },
  fi: {
    title: 'Työaikaraportti',
    total: 'Tunteja yhteensä',
    date: 'Päivä',
    workTime: 'Työaika',
    regular: 'Tunnit',
    remoteOther: 'Etä / muu',
    overtime: 'Ylityö',
    totalColumn: 'Yhteensä',
    leave: {
      paid_day_off: 'Vapaa (palkallinen)',
      unpaid_day_off: 'Vapaa (palkaton)',
      vacation: 'Loma',
      sick: 'Sairaus',
    },
    statistics: 'Tilastot',
    byProject: 'Projekteittain',
    byTag: 'Tunnisteittain',
    untracked: 'Kohdistamaton työ',
    nonExclusive: 'Tunnisteiden tunnit eivät sulje toisiaan pois.',
    page: 'Sivu',
  },
} as const;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function workTime(day: Day): string {
  return [
    [day.started_at, day.ended_at],
    [day.started_at_2, day.ended_at_2],
  ]
    .filter((period): period is [string, string] => Boolean(period[0] && period[1]))
    .map(([start, end]) => `${formatTime(start)}–${formatTime(end)}`)
    .join(' · ');
}

function headlines(entries: Entry[]): string[] {
  return entries
    .filter(entry => (
      entry.activity_type === 'work'
      && entry.project?.type !== 'personal'
      && (!entry.is_todo || entry.completed_at != null)
      && entry.title?.trim()
    ))
    .sort((a, b) => (
      parseTimestamp(a.time_from ?? a.created_at).getTime()
        - parseTimestamp(b.time_from ?? b.created_at).getTime()
      || a.id - b.id
    ))
    .map(entry => entry.title!.trim());
}

function addSeconds(group: Map<string, number>, label: string, seconds: number): void {
  group.set(label, (group.get(label) ?? 0) + seconds);
}

function allocationRows(group: Map<string, number>, language: ReportLanguage): Array<{label: string; hours: string; seconds: number}> {
  return [...group]
    .filter(([, seconds]) => seconds > 0)
    .sort(([leftLabel, leftSeconds], [rightLabel, rightSeconds]) => (
      rightSeconds - leftSeconds || leftLabel.localeCompare(rightLabel, language)
    ))
    .map(([label, seconds]) => ({label, seconds, hours: formatDuration(seconds)}));
}

function buildStatistics(
  days: Array<{entries: Entry[]}>,
  totalSeconds: number,
  language: ReportLanguage,
): NonNullable<WorkReportModel['statistics']> {
  const copy = COPY[language];
  const projects = new Map<string, number>();
  const tags = new Map<string, number>();
  let projectAllocatedSeconds = 0;
  let tagAllocatedSeconds = 0;

  for (const {entries} of days) {
    for (const entry of entries) {
      if (entry.activity_type !== 'work' || entry.project?.type === 'personal') {
        continue;
      }
      const seconds = entryTrackedSeconds(entry);
      if (seconds <= 0) {
        continue;
      }
      if (entry.project) {
        addSeconds(projects, entry.project.name, seconds);
        projectAllocatedSeconds += seconds;
      }
      if (entry.tags && entry.tags.length > 0) {
        tagAllocatedSeconds += seconds;
        for (const tag of entry.tags) {
          addSeconds(tags, tag.name, seconds);
        }
      }
    }
  }

  const projectRows = allocationRows(projects, language);
  const tagRows = allocationRows(tags, language);
  const projectUntracked = Math.max(0, totalSeconds - projectAllocatedSeconds);
  const tagUntracked = Math.max(0, totalSeconds - tagAllocatedSeconds);
  if (projectUntracked > 0) {
    projectRows.push({label: copy.untracked, seconds: projectUntracked, hours: formatDuration(projectUntracked)});
  }
  if (tagUntracked > 0) {
    tagRows.push({label: copy.untracked, seconds: tagUntracked, hours: formatDuration(tagUntracked)});
  }

  return {
    title: copy.statistics,
    byProjectTitle: copy.byProject,
    byTagTitle: copy.byTag,
    nonExclusiveNote: copy.nonExclusive,
    projectRows,
    tagRows,
  };
}

export function buildWorkReport(input: WorkReportInput): WorkReportModel {
  const personName = input.personName.trim();
  const companyName = input.companyName.trim();
  if (!personName) {
    throw new Error('report_person_required');
  }
  if (!companyName) {
    throw new Error('report_company_required');
  }
  if (input.startDate > input.endDate) {
    throw new Error('report_invalid_range');
  }

  const copy = COPY[input.language];
  const locale = input.language === 'fi' ? fiLocale : enUS;
  const leaveByDate = reportLeavesByDate(
    input.leaveRanges,
    input.startDate,
    input.endDate,
  );
  const entriesByDay = new Map<number, Entry[]>();
  for (const entry of input.entries) {
    const entries = entriesByDay.get(entry.day_id) ?? [];
    entries.push(entry);
    entriesByDay.set(entry.day_id, entries);
  }

  const daysByDate = new Map(input.days
    .filter(day => day.date >= input.startDate && day.date <= input.endDate)
    .map(day => [day.date, day]));
  const reportDates = [...new Set([
    ...daysByDate.keys(),
    ...Object.keys(leaveByDate),
  ])].sort();
  const reportDays = reportDates.flatMap(date => {
    const day = daysByDate.get(date);
    const leave = leaveByDate[date] ?? [];
    const entries = day ? entriesByDay.get(day.id) ?? [] : [];
    const emptyDay: Day = {
      id: -1,
      date,
      started_at: null,
      ended_at: null,
      started_at_2: null,
      ended_at_2: null,
      started_at_source: null,
      ended_at_source: null,
      notes: null,
      created_at: '',
      updated_at: '',
    };
    const sourceDay = day ?? emptyDay;
    const buckets = classifyReportDay(sourceDay, entries, leave.length > 0);
    return buckets.totalSeconds > 0 || leave.length > 0
      ? [{day: sourceDay, entries, leave, buckets}]
      : [];
  });
  if (reportDays.length === 0) {
    throw new Error('report_empty');
  }
  const days = reportDays.map(({day, entries, leave, buckets}) => ({
    date: input.language === 'fi'
      ? format(parseISO(day.date), 'EEEEEE d MMM yyyy', {locale})
        .replace(/^\S+/, weekday => weekday.toUpperCase())
      : format(parseISO(day.date), 'EEE d MMM yyyy', {locale}),
    workTime: leave.length > 0
      ? leave.map(item => copy.leave[item.type as LeaveType]).join(' + ')
      : workTime(day),
    regular: formatDuration(buckets.regularSeconds),
    regularSeconds: buckets.regularSeconds,
    remoteOther: formatDuration(buckets.remoteOtherSeconds),
    remoteOtherSeconds: buckets.remoteOtherSeconds,
    overtime: formatDuration(buckets.overtimeSeconds),
    overtimeSeconds: buckets.overtimeSeconds,
    total: formatDuration(buckets.totalSeconds),
    totalSeconds: buckets.totalSeconds,
    headlines: input.type === 'headlines' || input.type === 'statistics'
      ? headlines(entries)
      : [],
  }));
  const totalSeconds = reportDays.reduce(
    (total, day) => total + day.buckets.totalSeconds,
    0,
  );
  const range = `${format(parseISO(input.startDate), 'd MMM yyyy', {locale})} – ${format(parseISO(input.endDate), 'd MMM yyyy', {locale})}`;

  return {
    meta: {
      personName,
      companyName,
      range,
      title: copy.title,
      totalLabel: copy.total,
      totalHours: formatDuration(totalSeconds),
      pageLabel: copy.page,
    },
    columns: {
      date: copy.date,
      workTime: copy.workTime,
      regular: copy.regular,
      remoteOther: copy.remoteOther,
      overtime: copy.overtime,
      total: copy.totalColumn,
    },
    days,
    statistics: input.type === 'statistics'
      ? buildStatistics(reportDays, totalSeconds, input.language)
      : null,
  };
}
