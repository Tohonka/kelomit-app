import {formatDuration, durationBetween} from '../src/utils/dateUtils';

describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(300)).toBe('5m');
    expect(formatDuration(3540)).toBe('59m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(7320)).toBe('2h 2m');
  });
});

describe('durationBetween', () => {
  it('returns seconds between two ISO datetimes', () => {
    expect(
      durationBetween(
        '2026-06-11T08:00:00.000Z',
        '2026-06-11T09:00:00.000Z',
      ),
    ).toBe(3600);
  });

  it('handles sub-minute durations', () => {
    expect(
      durationBetween(
        '2026-06-11T08:00:00.000Z',
        '2026-06-11T08:00:45.000Z',
      ),
    ).toBe(45);
  });
});
