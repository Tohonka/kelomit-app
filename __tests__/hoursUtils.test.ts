import {
  calcHourBreakdown,
  calcDayWorkBreakdown,
  calcDayWorkSecs,
  formatHours,
} from '../src/utils/hoursUtils';
import type {Entry, Day} from '../src/types';

const H = 3600;

function makeDay(overrides: Partial<Day>): Day {
  return {
    id: 1,
    date: '2026-06-11',
    started_at: null,
    ended_at: null,
    started_at_2: null,
    ended_at_2: null,
    started_at_source: null,
    ended_at_source: null,
    notes: null,
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

/** ISO instant on 2026-06-11 at the given UTC hour (decimal allowed). */
function at(hourUtc: number): string {
  const ms = Date.UTC(2026, 5, 11, 0, 0, 0) + hourUtc * H * 1000;
  return new Date(ms).toISOString();
}

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

describe('calcDayWorkBreakdown (work-day model)', () => {
  it('falls back to entry-sum work seconds when no legs are set', () => {
    const day = makeDay({});
    const entries = [
      makeEntry({duration_sec: 2 * H, activity_type: 'work'}),
      makeEntry({id: 2, duration_sec: H, activity_type: 'personal'}),
    ];
    const b = calcDayWorkBreakdown(day, entries);
    expect(b.hasDayLegs).toBe(false);
    expect(b.workSeconds).toBe(2 * H); // only work entries, personal ignored
  });

  it('counts personal_work when entries are the only work signal', () => {
    const day = makeDay({});
    const entries = [
      makeEntry({activity_type: 'work', duration_sec: 2 * H}),
      makeEntry({id: 2, activity_type: 'personal_work', duration_sec: H}),
    ];
    expect(calcDayWorkSecs(day, entries)).toBe(3 * H);
  });

  it('treats a Personal-project interval as personal regardless of marker', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [
      makeEntry({
        activity_type: 'work',
        time_from: at(12),
        time_to: at(13),
        project: {
          id: 9,
          name: 'Private',
          type: 'personal',
          archived: false,
          created_at: at(0),
          updated_at: at(0),
        },
      }),
    ];
    expect(calcDayWorkSecs(day, entries)).toBe(7 * H);
  });

  it('uses the leg span as the baseline with no entries', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const b = calcDayWorkBreakdown(day, []);
    expect(b.hasDayLegs).toBe(true);
    expect(b.baselineSeconds).toBe(8 * H);
    expect(b.workSeconds).toBe(8 * H);
  });

  it('sums both legs as the baseline', () => {
    const day = makeDay({
      started_at: at(8), ended_at: at(12),
      started_at_2: at(13), ended_at_2: at(17),
    });
    expect(calcDayWorkSecs(day, [])).toBe(8 * H);
  });

  it('adds a work entry that falls entirely outside the legs', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [makeEntry({activity_type: 'work', time_from: at(17), time_to: at(18)})];
    const b = calcDayWorkBreakdown(day, entries);
    expect(b.addedWorkSeconds).toBe(H);
    expect(b.workSeconds).toBe(9 * H);
  });

  it('adds only the outside portion of a work entry partially overlapping a leg', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    // 15:00–18:00 work: 15–16 is inside, 16–18 is outside → +2h
    const entries = [makeEntry({activity_type: 'work', time_from: at(15), time_to: at(18)})];
    expect(calcDayWorkBreakdown(day, entries).addedWorkSeconds).toBe(2 * H);
  });

  it('does not add a work entry fully inside the legs', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [makeEntry({activity_type: 'work', time_from: at(10), time_to: at(11)})];
    expect(calcDayWorkBreakdown(day, entries).addedWorkSeconds).toBe(0);
  });

  it('adds only the gap when a work entry spans across both legs', () => {
    const day = makeDay({
      started_at: at(8), ended_at: at(12),
      started_at_2: at(13), ended_at_2: at(17),
    });
    // 11:00–14:00 work spans the 12–13 gap → only that 1h is outside
    const entries = [makeEntry({activity_type: 'work', time_from: at(11), time_to: at(14)})];
    expect(calcDayWorkBreakdown(day, entries).addedWorkSeconds).toBe(H);
  });

  it('deducts the inside portion of a personal entry', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [makeEntry({activity_type: 'personal', time_from: at(12), time_to: at(13)})];
    const b = calcDayWorkBreakdown(day, entries);
    expect(b.deductedPersonalSeconds).toBe(H);
    expect(b.workSeconds).toBe(7 * H);
  });

  it('ignores a personal entry fully outside the legs', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [makeEntry({activity_type: 'personal', time_from: at(18), time_to: at(19)})];
    expect(calcDayWorkBreakdown(day, entries).deductedPersonalSeconds).toBe(0);
  });

  it('deducts only the inside portion of a partially-overlapping personal entry', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    // 15:00–17:00 personal: only 15–16 is inside → −1h
    const entries = [makeEntry({activity_type: 'personal', time_from: at(15), time_to: at(17)})];
    expect(calcDayWorkBreakdown(day, entries).deductedPersonalSeconds).toBe(H);
  });

  it('unions overlapping personal entries instead of double-subtracting', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [
      makeEntry({id: 1, activity_type: 'personal', time_from: at(10), time_to: at(12)}),
      makeEntry({id: 2, activity_type: 'personal', time_from: at(11), time_to: at(13)}),
    ];
    // union 10–13 = 3h, not 2h+2h
    expect(calcDayWorkBreakdown(day, entries).deductedPersonalSeconds).toBe(3 * H);
  });

  it('never deducts personal_work, inside or outside the legs', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [
      makeEntry({id: 1, activity_type: 'personal_work', time_from: at(10), time_to: at(11)}),
      makeEntry({id: 2, activity_type: 'personal_work', time_from: at(18), time_to: at(19)}),
    ];
    const b = calcDayWorkBreakdown(day, entries);
    expect(b.deductedPersonalSeconds).toBe(0);
    expect(b.addedWorkSeconds).toBe(0);
    expect(b.workSeconds).toBe(8 * H);
  });

  it('adds work and deducts personal for duration-only entries (no "to" time)', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [
      makeEntry({id: 1, activity_type: 'work', duration_sec: 3 * H}),
      makeEntry({id: 2, activity_type: 'personal', duration_sec: 2 * H}),
    ];
    const b = calcDayWorkBreakdown(day, entries);
    expect(b.addedWorkSeconds).toBe(3 * H);
    expect(b.deductedPersonalSeconds).toBe(2 * H);
    // 8h baseline + 3h work − 2h personal
    expect(b.workSeconds).toBe(9 * H);
  });

  it('never lets a personal_work duration-only entry adjust the total', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [makeEntry({activity_type: 'personal_work', duration_sec: 2 * H})];
    expect(calcDayWorkSecs(day, entries)).toBe(8 * H);
  });

  it('excludes unconfirmed to-dos but counts completed ones in the adjustments', () => {
    const day = makeDay({started_at: at(8), ended_at: at(16)});
    const entries = [
      makeEntry({id: 1, activity_type: 'work', time_from: at(17), time_to: at(18), is_todo: true, scheduled_date: '2026-06-11'}),
      makeEntry({id: 2, activity_type: 'work', time_from: at(18), time_to: at(19), is_todo: true, completed_at: at(19)}),
    ];
    // only the completed to-do (18–19) is added
    expect(calcDayWorkBreakdown(day, entries).addedWorkSeconds).toBe(H);
  });

  it('clamps to zero when personal deductions exceed the baseline', () => {
    const day = makeDay({started_at: at(8), ended_at: at(10)});
    const entries = [makeEntry({activity_type: 'personal', time_from: at(8), time_to: at(16)})];
    expect(calcDayWorkSecs(day, entries)).toBe(0);
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
