import {comparePair, findPatterns, usableDays, type DayPoint} from '../src/utils/patterns';

const day = (n: number) => `2026-08-${String(n).padStart(2, '0')}`;

describe('comparePair', () => {
  it('reports the two halves when short-sleep days clearly differ', () => {
    // 8 short nights (6 h) → 2400 kcal, 8 long nights (8 h) → 2000 kcal
    const points: DayPoint[] = Array.from({length: 16}, (_, i) => ({
      date: day(i + 1), sleep: i < 8 ? 360 : 480, kcal: i < 8 ? 2400 : 2000,
    }));
    const p = comparePair(points, {x: 'sleep', y: 'kcal', lag: 0});
    expect(p).toMatchObject({threshold: 420, lowMean: 2400, highMean: 2000, lowDays: 8, highDays: 8});
    expect(p!.strength).toBeCloseTo(1 / 6, 3);
  });

  it('says nothing with too few days, a lopsided split or a small difference', () => {
    const few: DayPoint[] = Array.from({length: 10}, (_, i) => ({date: day(i + 1), sleep: 400 + i, kcal: 2000 + i * 100}));
    expect(comparePair(few, {x: 'sleep', y: 'kcal', lag: 0})).toBeNull();
    const flat: DayPoint[] = Array.from({length: 20}, (_, i) => ({date: day(i + 1), sleep: 400 + i, kcal: 2000 + (i % 2)}));
    expect(comparePair(flat, {x: 'sleep', y: 'kcal', lag: 0})).toBeNull();
    // every x equal → nothing falls below the median
    const same: DayPoint[] = Array.from({length: 20}, (_, i) => ({date: day(i + 1), sleep: 420, kcal: i * 100}));
    expect(comparePair(same, {x: 'sleep', y: 'kcal', lag: 0})).toBeNull();
  });

  it('skips days with missing data instead of reading them as zero', () => {
    const points: DayPoint[] = Array.from({length: 20}, (_, i) => ({
      date: day(i + 1), sleep: i < 10 ? 360 : 480, kcal: i % 5 === 0 ? null : (i < 10 ? 2400 : 2000),
    }));
    const p = comparePair(points, {x: 'sleep', y: 'kcal', lag: 0});
    expect(p).toMatchObject({lowDays: 8, highDays: 8, lowMean: 2400});
  });

  it('lag 1 pairs today with tomorrow (steps → the night that follows)', () => {
    const points: DayPoint[] = Array.from({length: 17}, (_, i) => ({
      date: day(i + 1),
      steps: i < 8 ? 3000 : 12000,
      // sleep filed under the wake-up date: the night after day i is on day i+1
      sleep: i === 0 ? null : (i - 1 < 8 ? 380 : 470),
    }));
    const p = comparePair(points, {x: 'steps', y: 'sleep', lag: 1});
    expect(p).toMatchObject({lowMean: 380, highMean: 470});
  });
});

it('findPatterns ranks by strength; usableDays counts days with two series', () => {
  const points: DayPoint[] = Array.from({length: 16}, (_, i) => ({
    date: day(i + 1), sleep: i < 8 ? 360 : 480, kcal: i < 8 ? 2400 : 2000, work: i < 8 ? 9 : 4.5,
  }));
  const found = findPatterns(points);
  expect(found[0]).toMatchObject({x: 'sleep', y: 'work'});
  expect(found.map(p => `${p.x}>${p.y}`)).toContain('sleep>kcal');
  expect(usableDays([...points, {date: day(20), sleep: 400}])).toBe(16);
});
