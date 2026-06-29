import {parseWeekdayHours, usualHoursForDate} from '../src/utils/usualHours';

// 2026-06-29 is a Monday (getDay 1); 2026-06-28 is a Sunday (getDay 0).
const MON = '2026-06-29';
const SUN = '2026-06-28';

test('no overrides → default for every day', () => {
  const wh = parseWeekdayHours(undefined);
  expect(usualHoursForDate(MON, '09:00', '17:00', wh)).toEqual({start: '09:00', end: '17:00'});
});

test('custom weekday override wins over default', () => {
  const wh = parseWeekdayHours(JSON.stringify({1: {start: '08:00', end: '14:00'}}));
  expect(usualHoursForDate(MON, '09:00', '17:00', wh)).toEqual({start: '08:00', end: '14:00'});
  // A day without an override still uses the default.
  expect(usualHoursForDate(SUN, '09:00', '17:00', wh)).toEqual({start: '09:00', end: '17:00'});
});

test('day off → no hours', () => {
  const wh = parseWeekdayHours(JSON.stringify({0: {off: true}}));
  expect(usualHoursForDate(SUN, '09:00', '17:00', wh)).toEqual({start: null, end: null});
});

test('malformed JSON / bad entries are dropped', () => {
  expect(parseWeekdayHours('not json')).toEqual({});
  const wh = parseWeekdayHours(JSON.stringify({1: {start: 'nope'}, 9: {off: true}, 2: {off: true}}));
  expect(wh[1]).toBeUndefined(); // bad time dropped
  expect(wh[9]).toBeUndefined(); // out-of-range weekday dropped
  expect(wh[2]).toEqual({off: true});
});
