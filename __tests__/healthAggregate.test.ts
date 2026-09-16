import {buildHealthDays} from '../src/utils/healthAggregate';

// Local-time ISO helper so the dates below don't depend on the test machine's zone.
const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

const empty = {steps: [], distanceM: [], activeKcal: [], totalKcal: [], sleep: [], weightKg: [], heightCm: [], restingHr: []};

describe('buildHealthDays', () => {
  it('maps day totals onto rows and stamps synced_at', () => {
    const rows = buildHealthDays({
      ...empty,
      steps: [{date: '2026-09-15', value: 8432}, {date: '2026-09-16', value: 120}],
      distanceM: [{date: '2026-09-15', value: 6100.5}],
      activeKcal: [{date: '2026-09-15', value: 540}],
      totalKcal: [{date: '2026-09-15', value: 2410}],
    }, 'now');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({date: '2026-09-15', steps: 8432, distance_m: 6100.5, active_kcal: 540, total_kcal: 2410, sleep_minutes: null, synced_at: 'now'});
    expect(rows[1]).toMatchObject({date: '2026-09-16', steps: 120, distance_m: null});
  });

  it('attributes a night across midnight to the wake-up date and sums naps', () => {
    const rows = buildHealthDays({
      ...empty,
      sleep: [
        {startTime: local(2026, 9, 15, 23, 10), endTime: local(2026, 9, 16, 6, 40)},
        {startTime: local(2026, 9, 16, 14, 0), endTime: local(2026, 9, 16, 14, 30)},
      ],
    }, 'now');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-09-16',
      sleep_minutes: 450 + 30,
      sleep_start: local(2026, 9, 15, 23, 10),
      sleep_end: local(2026, 9, 16, 14, 30),
    });
  });

  it('keeps the latest sample per day and skips empty dates', () => {
    const rows = buildHealthDays({
      ...empty,
      weightKg: [
        {time: local(2026, 9, 15, 7), value: 82.9},
        {time: local(2026, 9, 15, 21), value: 82.4},
        {time: local(2026, 9, 14, 7), value: NaN},
      ],
      restingHr: [{time: local(2026, 9, 15, 3), value: 52}],
    }, 'now');
    expect(rows.map(r => r.date)).toEqual(['2026-09-15']);
    expect(rows[0]).toMatchObject({weight_kg: 82.4, resting_hr: 52, height_cm: null});
  });
});
