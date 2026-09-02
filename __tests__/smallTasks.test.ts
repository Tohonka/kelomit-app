const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {createEntry, updateEntry} from '../src/db/entries';
import {groupEntries, DAY_LIST_MODES} from '../src/utils/entrySort';
import {spanIntersectsDayLegs, calcDayWorkSecs} from '../src/utils/hoursUtils';
import type {Entry, Day} from '../src/types';

const H = 3600;
const at = (h: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, 0) + h * H * 1000).toISOString();

const day = (o: Partial<Day>): Day => ({
  id: 1, date: '2026-09-01', started_at: null, ended_at: null, started_at_2: null, ended_at_2: null,
  started_at_source: null, ended_at_source: null, notes: null, created_at: at(0), updated_at: at(0), ...o,
});

const e = (o: Partial<Entry>): Entry =>
  ({
    id: 0, day_id: 1, entry_type: 'note', activity_type: 'work', project_id: null, parent_id: null,
    tally: null, title: null, body: null, file_path: null, thumbnail_path: null, duration_sec: null,
    time_from: null, time_to: null, latitude: null, longitude: null, location_label: null,
    is_todo: false, is_overtime: false, is_small_task: false, scheduled_date: null,
    completed_at: null, reminder_at: null, created_at: at(8), updated_at: '', ...o,
  }) as Entry;

describe('db round-trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO entries')) { return {rows: [{id: 1}]}; }
      if (sql.includes('FROM entries e') && sql.includes('WHERE e.id')) {
        return {rows: [{id: 1, day_id: 1, entry_type: 'note', activity_type: 'work',
          is_small_task: 1, created_at: '', updated_at: ''}]};
      }
      return {rows: [], rowsAffected: 1};
    });
  });

  it('persists and maps is_small_task', async () => {
    const entry = await createEntry({day_id: 1, entry_type: 'note', is_small_task: true});
    const insert = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO entries'));
    expect(insert?.[0]).toContain('is_small_task');
    expect(insert?.[1][20]).toBe(1);
    expect(entry.is_small_task).toBe(true);
  });

  it('defaults to 0 and updates via SET', async () => {
    await createEntry({day_id: 1, entry_type: 'note'});
    const insert = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO entries'));
    expect(insert?.[1][20]).toBe(0);
    await updateEntry(1, {is_small_task: false});
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('is_small_task = ?'), [0, 1]);
  });
});

describe('groupEntries trailing Tasks group', () => {
  const note = e({id: 1, time_from: at(9)});
  const task = e({id: 2, time_from: at(10), is_small_task: true});
  const task2 = e({id: 3, time_from: at(12), is_small_task: true});
  const sub = e({id: 4, parent_id: 2, time_from: at(10.5)});

  it.each(DAY_LIST_MODES)('%s: tasks trail with their subnotes', mode => {
    const g = groupEntries([task, note, sub, task2], mode);
    const last = g[g.length - 1];
    expect(last.key).toBe('tasks');
    expect(last.items.map(x => x.entry.id)).toEqual(mode === 'time_asc' ? [2, 3] : [3, 2]);
    expect(last.items.find(x => x.entry.id === 2)?.subnotes.map(s => s.id)).toEqual([4]);
    // Normal notes are untouched by the split.
    expect(g.slice(0, -1).flatMap(x => x.items).map(x => x.entry.id)).toEqual([1]);
  });

  it('no tasks → no Tasks group', () => {
    expect(groupEntries([note], 'time_desc').some(g => g.key === 'tasks')).toBe(false);
  });
});

describe('spanIntersectsDayLegs', () => {
  it('no legs → true (nothing to warn about)', () => {
    expect(spanIntersectsDayLegs(day({}), at(23), at(23.5))).toBe(true);
  });
  it('inside leg 1 / leg 2 → true, fully outside → false', () => {
    const d = day({started_at: at(8), ended_at: at(12), started_at_2: at(13), ended_at_2: at(16)});
    expect(spanIntersectsDayLegs(d, at(9), at(9.5))).toBe(true);
    expect(spanIntersectsDayLegs(d, at(14), at(14.5))).toBe(true);
    expect(spanIntersectsDayLegs(d, at(12.2), at(12.8))).toBe(false);
    expect(spanIntersectsDayLegs(d, at(23), at(23.5))).toBe(false);
  });
  it('open leg extends to now-ish: after start → true, before → false', () => {
    const d = day({started_at: at(8)});
    expect(spanIntersectsDayLegs(d, at(23), at(23.5))).toBe(true);
    expect(spanIntersectsDayLegs(d, at(6), at(6.5))).toBe(false);
  });
});

describe('hours: a small task behaves like any duration note', () => {
  const d = day({started_at: at(8), ended_at: at(16)});
  it('inside the span adds nothing; outside adds work', () => {
    const inside = e({id: 1, is_small_task: true, duration_sec: H, time_from: at(10), time_to: at(11)});
    const outside = e({id: 2, is_small_task: true, duration_sec: H, time_from: at(17), time_to: at(18)});
    expect(calcDayWorkSecs(d, [inside])).toBe(8 * H);
    expect(calcDayWorkSecs(d, [outside])).toBe(9 * H);
  });
});
