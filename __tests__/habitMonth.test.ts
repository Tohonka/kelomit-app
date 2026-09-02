import {monthGrid, monthKeyOf, monthRange, shiftMonth} from '../src/utils/habitMonth';

it('Sep 2026 starts on Tuesday, Mon-first grid has one leading blank', () => {
  const g = monthGrid('2026-09');
  expect(g.slice(0, 3)).toEqual([null, '2026-09-01', '2026-09-02']);
  expect(g.filter(Boolean)).toHaveLength(30);
  expect(g.length % 7).toBe(0);
  expect(g[g.length - 1]).toBeNull();
});

it('a Sunday-first month gets six leading blanks; Feb of a leap year fits exactly', () => {
  expect(monthGrid('2026-11').slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
  expect(monthGrid('2027-02')).toHaveLength(28); // 2027-02-01 is a Monday
});

it('shifts months across year boundaries and computes ranges', () => {
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  expect(monthRange('2026-02')).toEqual({from: '2026-02-01', to: '2026-02-28'});
  expect(monthKeyOf(new Date(2026, 8, 2))).toBe('2026-09');
});
