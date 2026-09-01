import {classifyReportDay} from '../src/reports/workHours/build';
import type {Day, Entry} from '../src/types';

const H = 3600;
const at = (hour: number) =>
  new Date(Date.UTC(2026, 6, 27, Math.floor(hour), (hour % 1) * 60)).toISOString();

const day = (overrides: Partial<Day> = {}): Day => ({
  id: 1,
  date: '2026-07-27',
  started_at: at(8),
  ended_at: at(16),
  started_at_2: null,
  ended_at_2: null,
  started_at_source: null,
  ended_at_source: null,
  notes: null,
  created_at: at(0),
  updated_at: at(0),
  ...overrides,
});

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 1,
  day_id: 1,
  entry_type: 'note',
  activity_type: 'work',
  project_id: null,
  parent_id: null,
  tally: null,
  title: null,
  body: null,
  file_path: null,
  thumbnail_path: null,
  duration_sec: null,
  time_from: at(8),
  time_to: at(9),
  latitude: null,
  longitude: null,
  location_label: null,
  is_todo: false,
  is_overtime: false,
  scheduled_date: null,
  completed_at: null,
  reminder_at: null,
  created_at: at(8),
  updated_at: at(8),
  ...overrides,
});

it('moves marked time inside a day leg from regular to overtime', () => {
  expect(classifyReportDay(day(), [
    entry({time_from: at(14), time_to: at(16), is_overtime: true}),
  ], false)).toEqual({
    regularSeconds: 6 * H,
    remoteOtherSeconds: 0,
    overtimeSeconds: 2 * H,
    totalSeconds: 8 * H,
  });
});

it('keeps ordinary outside work remote and merges overlapping overtime', () => {
  expect(classifyReportDay(day(), [
    entry({id: 1, time_from: at(16), time_to: at(18)}),
    entry({id: 2, time_from: at(18), time_to: at(20), is_overtime: true}),
    entry({id: 3, time_from: at(19), time_to: at(21), is_overtime: true}),
  ], false)).toEqual({
    regularSeconds: 8 * H,
    remoteOtherSeconds: 2 * H,
    overtimeSeconds: 3 * H,
    totalSeconds: 13 * H,
  });
});

it('ignores legs on leave and counts only manually logged work', () => {
  expect(classifyReportDay(day(), [
    entry({id: 1, time_from: at(9), time_to: at(10.5)}),
    entry({
      id: 2,
      time_from: at(11),
      time_to: at(12),
      is_overtime: true,
    }),
    entry({
      id: 3,
      activity_type: 'personal_work',
      time_from: at(13),
      time_to: at(14),
    }),
  ], true)).toEqual({
    regularSeconds: 0,
    remoteOtherSeconds: 1.5 * H,
    overtimeSeconds: H,
    totalSeconds: 2.5 * H,
  });
});

it('normalizes timestamp milliseconds to whole report seconds', () => {
  expect(classifyReportDay(day({
    started_at: '2026-07-27T08:00:00.123Z',
    ended_at: '2026-07-27T16:00:00.987Z',
  }), [
    entry({
      time_from: '2026-07-27T14:00:00.123Z',
      time_to: '2026-07-27T16:00:00.987Z',
      is_overtime: true,
    }),
  ], false)).toEqual({
    regularSeconds: 6 * H,
    remoteOtherSeconds: 0,
    overtimeSeconds: 2 * H + 1,
    totalSeconds: 8 * H + 1,
  });
});
