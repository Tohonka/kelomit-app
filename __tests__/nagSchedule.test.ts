import {occurrences, fireTimes, seededUnit, nextOccurrence, MAX_FIRES_PER_OCCURRENCE} from '../src/utils/nagSchedule';
import type {Nag} from '../src/types';

const H = 3600_000;
// Tue 2026-09-22 12:00 local.
const NOW = new Date(2026, 8, 22, 12, 0).getTime();
const iso = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

function nag(overrides: Partial<Nag>): Nag {
  return {
    id: 7, title: 'Meds', note: null, activity_type: 'personal',
    schedule: {kind: 'once', at: iso(2026, 9, 23, 9)}, plan: {}, countdown: true, active: true,
    created_at: '', updated_at: '', ...overrides,
  };
}

describe('occurrences', () => {
  it('once: inside the window only', () => {
    expect(occurrences({kind: 'once', at: iso(2026, 9, 23, 9)}, NOW)).toEqual([iso(2026, 9, 23, 9)]);
    expect(occurrences({kind: 'once', at: iso(2026, 11, 1, 9)}, NOW)).toEqual([]);
    // A missed explicit date stays until it is marked done, however old.
    expect(occurrences({kind: 'once', at: iso(2026, 9, 21, 13)}, NOW)).toHaveLength(1);
    expect(occurrences({kind: 'once', at: iso(2026, 8, 1, 9)}, NOW)).toHaveLength(1);
  });
  it('dates: sorted, windowed', () => {
    const at = [iso(2026, 9, 25, 9), iso(2026, 9, 23, 9), iso(2026, 12, 1, 9)];
    expect(occurrences({kind: 'dates', at}, NOW)).toEqual([iso(2026, 9, 23, 9), iso(2026, 9, 25, 9)]);
  });
  it('weekly: every Tuesday and Friday at 08:00 within 14 days', () => {
    const out = occurrences({kind: 'weekly', weekdays: [2, 5], time: '08:00'}, NOW);
    // Tue 22 (this morning, lookback), Fri 25, Tue 29, Fri 2 Oct, Tue 6 Oct
    expect(out).toEqual([
      iso(2026, 9, 22, 8), iso(2026, 9, 25, 8), iso(2026, 9, 29, 8), iso(2026, 10, 2, 8), iso(2026, 10, 6, 8),
    ]);
  });
});

describe('fireTimes', () => {
  const due = iso(2026, 9, 23, 9); // tomorrow 09:00
  it('day before / on day / hours before, plus the due instant itself', () => {
    const n = nag({plan: {dayBefore: '20:00', onDay: '07:30', hoursBefore: 1}});
    expect(fireTimes(n, due, NOW)).toEqual([
      new Date(2026, 8, 22, 20, 0).getTime(),
      new Date(2026, 8, 23, 7, 30).getTime(),
      new Date(2026, 8, 23, 8, 0).getTime(),
      Date.parse(due),
    ]);
  });
  it('an empty plan still fires at the due time; past instants are dropped', () => {
    const n = nag({plan: {dayBefore: '08:00'}}); // 22nd 08:00 is before NOW (12:00)
    expect(fireTimes(n, due, NOW)).toEqual([Date.parse(due)]);
    expect(fireTimes(nag({plan: {}}), iso(2026, 9, 22, 9), NOW)).toEqual([]);
  });
  it('weekly + day-before survive a DST change (calendar-day stepping)', () => {
    // Finland falls back on Sun 2026-10-25 04:00 → 03:00.
    const now = new Date(2026, 9, 23, 12, 0).getTime(); // Fri
    const out = occurrences({kind: 'weekly', weekdays: [7, 1], time: '00:30'}, now, 3);
    expect(out).toEqual([iso(2026, 10, 25, 0, 30), iso(2026, 10, 26, 0, 30)]);
    const n = nag({plan: {dayBefore: '23:00'}});
    expect(fireTimes(n, iso(2026, 10, 26, 0, 30), now)[0]).toBe(new Date(2026, 9, 25, 23, 0).getTime());
  });
  it('constant repeat: 2/hour from 1 h before until 1 h after = 4 fires', () => {
    const n = nag({plan: {repeat: {perHour: 2, fromHoursBefore: 1, untilHoursAfter: 1, random: false}}});
    const d = Date.parse(due);
    expect(fireTimes(n, due, NOW)).toEqual([d - H, d - H / 2, d, d + H / 2]);
  });
  it('random repeat stays inside each slot and is stable across calls', () => {
    const n = nag({plan: {repeat: {perHour: 4, fromHoursBefore: 1, untilHoursAfter: 0, random: true}}});
    const a = fireTimes(n, due, NOW);
    const b = fireTimes(n, due, NOW);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5); // 4 random slots + the due instant itself
    const d = Date.parse(due);
    expect(a[4]).toBe(d);
    a.slice(0, 4).forEach((t, i) => {
      expect(t).toBeGreaterThanOrEqual(d - H + i * (H / 4));
      expect(t).toBeLessThan(d - H + (i + 1) * (H / 4));
    });
  });
  it('is capped', () => {
    const n = nag({plan: {repeat: {perHour: 6, fromHoursBefore: 12, untilHoursAfter: 12, random: false}}});
    expect(fireTimes(n, due, NOW)).toHaveLength(MAX_FIRES_PER_OCCURRENCE);
  });
  it('seededUnit is in [0,1) and deterministic', () => {
    const u = seededUnit('x');
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
    expect(seededUnit('x')).toBe(u);
    expect(seededUnit('y')).not.toBe(u);
  });
});

describe('nextOccurrence', () => {
  it('skips done ones', () => {
    const n = nag({schedule: {kind: 'weekly', weekdays: [2, 5], time: '08:00'}});
    const done = new Map([[`7|${iso(2026, 9, 22, 8)}`, 'x']]);
    expect(nextOccurrence(n, done, NOW)).toBe(iso(2026, 9, 25, 8));
    expect(nextOccurrence(n, new Map(), NOW)).toBe(iso(2026, 9, 22, 8));
  });
});
