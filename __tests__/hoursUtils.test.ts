import {calcHourBreakdown, formatHours} from '../src/utils/hoursUtils';
import type {Entry} from '../src/types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    day_id: 1,
    entry_type: 'note',
    activity_type: 'work',
    project_id: null,
    title: null,
    body: null,
    file_path: null,
    thumbnail_path: null,
    duration_sec: null,
    time_from: null,
    time_to: null,
    latitude: null,
    longitude: null,
    location_label: null,
    is_todo: false,
    scheduled_date: null,
    completed_at: null,
    reminder_at: null,
    created_at: '2026-06-11T08:00:00.000Z',
    updated_at: '2026-06-11T08:00:00.000Z',
    tags: [],
    project: null,
    ...overrides,
  };
}

describe('calcHourBreakdown', () => {
  it('returns zero breakdown for empty entries', () => {
    const result = calcHourBreakdown([]);
    expect(result.workSeconds).toBe(0);
    expect(result.personalWorkSeconds).toBe(0);
    expect(result.personalSeconds).toBe(0);
    expect(result.totalTrackedSeconds).toBe(0);
  });

  it('counts duration_sec for work entry', () => {
    const entries = [makeEntry({duration_sec: 3600, activity_type: 'work'})];
    const result = calcHourBreakdown(entries);
    expect(result.workSeconds).toBe(3600);
    expect(result.personalWorkSeconds).toBe(0);
  });

  it('excludes unconfirmed to-dos but counts completed ones', () => {
    const entries = [
      makeEntry({duration_sec: 3600, activity_type: 'work', is_todo: true, scheduled_date: '2026-06-20'}),
      makeEntry({id: 2, duration_sec: 1800, activity_type: 'work', is_todo: true, completed_at: '2026-06-20T10:00:00.000Z'}),
    ];
    const result = calcHourBreakdown(entries);
    expect(result.workSeconds).toBe(1800); // only the completed to-do counts
  });

  it('counts time_from/time_to interval correctly', () => {
    const entries = [
      makeEntry({
        time_from: '2026-06-11T09:00:00.000Z',
        time_to: '2026-06-11T10:30:00.000Z',
        activity_type: 'work',
      }),
    ];
    const result = calcHourBreakdown(entries);
    expect(result.workSeconds).toBe(5400); // 1.5h
  });

  it('separates activity types', () => {
    const entries = [
      makeEntry({duration_sec: 1800, activity_type: 'work'}),
      makeEntry({
        id: 2,
        duration_sec: 600,
        activity_type: 'personal_work',
      }),
      makeEntry({
        id: 3,
        duration_sec: 300,
        activity_type: 'personal',
      }),
    ];
    const result = calcHourBreakdown(entries);
    expect(result.workSeconds).toBe(1800);
    expect(result.personalWorkSeconds).toBe(600);
    expect(result.personalSeconds).toBe(300);
    expect(result.totalTrackedSeconds).toBe(2700);
  });

  it('ignores entries with no time info', () => {
    const entries = [makeEntry({activity_type: 'work'})];
    const result = calcHourBreakdown(entries);
    expect(result.workSeconds).toBe(0);
  });
});

describe('formatHours', () => {
  it('formats whole hours', () => {
    expect(formatHours(3600)).toBe('1h');
    expect(formatHours(7200)).toBe('2h');
  });

  it('formats fractional hours', () => {
    expect(formatHours(5400)).toBe('1h 30m');
  });

  it('formats zero', () => {
    expect(formatHours(0)).toBe('0h');
  });
});
