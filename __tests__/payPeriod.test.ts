import {completedPayPeriod} from '../src/utils/payPeriod';

it('returns the most recently completed 26-25 period', () => {
  expect(completedPayPeriod(new Date(2026, 6, 27, 12), 26)).toEqual({
    startDate: '2026-06-26',
    endDate: '2026-07-25',
  });
});

it('does not include a period whose final day is still in progress', () => {
  expect(completedPayPeriod(new Date(2026, 6, 25, 12), 26)).toEqual({
    startDate: '2026-05-26',
    endDate: '2026-06-25',
  });
});

it('uses yesterday as the completed end when a new period starts today', () => {
  expect(completedPayPeriod(new Date(2026, 6, 26, 12), 26)).toEqual({
    startDate: '2026-06-26',
    endDate: '2026-07-25',
  });
});

it('crosses the year boundary using local calendar dates', () => {
  expect(completedPayPeriod(new Date(2027, 0, 2, 12), 1)).toEqual({
    startDate: '2026-12-01',
    endDate: '2026-12-31',
  });
});

it('rejects unsupported start days', () => {
  expect(() => completedPayPeriod(new Date(2026, 6, 27), 0))
    .toThrow('pay_period_invalid_day');
  expect(() => completedPayPeriod(new Date(2026, 6, 27), 29))
    .toThrow('pay_period_invalid_day');
  expect(() => completedPayPeriod(new Date(2026, 6, 27), 2.5))
    .toThrow('pay_period_invalid_day');
});
