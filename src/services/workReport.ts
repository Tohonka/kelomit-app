import {format, parseISO} from 'date-fns';
import {enUS, fi as fiLocale} from 'date-fns/locale';
import type {Day, Entry} from '../types';
import {calcDayWorkSecs, entryTrackedSeconds} from '../utils/hoursUtils';

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
  columns: {date: string; weekday: string; hours: string};
  days: Array<{
    date: string;
    weekday: string;
    hours: string;
    seconds: number;
    headlines: string[];
  }>;
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
    weekday: 'Weekday',
    hours: 'Hours',
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
    weekday: 'Viikonpäivä',
    hours: 'Tunnit',
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
  return `${hours}:${String(minutes).padStart(2, '0')}`;
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
      (a.time_from ?? a.created_at).localeCompare(b.time_from ?? b.created_at)
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
  if (!personName) {
    throw new Error('report_person_required');
  }
  if (input.startDate > input.endDate) {
    throw new Error('report_invalid_range');
  }

  const copy = COPY[input.language];
  const locale = input.language === 'fi' ? fiLocale : enUS;
  const entriesByDay = new Map<number, Entry[]>();
  for (const entry of input.entries) {
    const entries = entriesByDay.get(entry.day_id) ?? [];
    entries.push(entry);
    entriesByDay.set(entry.day_id, entries);
  }

  const reportDays = input.days
    .filter(day => day.date >= input.startDate && day.date <= input.endDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => {
      const entries = entriesByDay.get(day.id) ?? [];
      return {day, entries, seconds: calcDayWorkSecs(day, entries)};
    })
    .filter(({seconds}) => seconds > 0);
  const days = reportDays.map(({day, entries, seconds}) => ({
    date: format(parseISO(day.date), 'd MMM yyyy', {locale}),
    weekday: format(parseISO(day.date), 'EEEE', {locale}),
    hours: formatDuration(seconds),
    seconds,
    headlines: input.type === 'headlines' ? headlines(entries) : [],
  }));
  const totalSeconds = reportDays.reduce((total, day) => total + day.seconds, 0);
  const range = `${format(parseISO(input.startDate), 'd MMM yyyy', {locale})} – ${format(parseISO(input.endDate), 'd MMM yyyy', {locale})}`;

  return {
    meta: {
      personName,
      companyName: input.companyName.trim(),
      range,
      title: copy.title,
      totalLabel: copy.total,
      totalHours: formatDuration(totalSeconds),
      pageLabel: copy.page,
    },
    columns: {date: copy.date, weekday: copy.weekday, hours: copy.hours},
    days,
    statistics: input.type === 'statistics'
      ? buildStatistics(reportDays, totalSeconds, input.language)
      : null,
  };
}
