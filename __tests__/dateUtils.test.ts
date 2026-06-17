import {formatDuration, durationBetween, parseTimestamp, hhmmToIsoOn, formatTime} from '../src/utils/dateUtils';

describe('parseTimestamp', () => {
  it('treats a SQLite datetime() string (no zone) as UTC', () => {
    expect(parseTimestamp('2026-06-16 05:30:00').toISOString()).toBe(
      '2026-06-16T05:30:00.000Z',
    );
  });

  it('parses app-written ISO timestamps unchanged', () => {
    expect(parseTimestamp('2026-06-16T05:30:00.000Z').toISOString()).toBe(
      '2026-06-16T05:30:00.000Z',
    );
  });
});

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

describe('hhmmToIsoOn', () => {
  it('places a wall-clock time on the given local day', () => {
    const d = new Date(hhmmToIsoOn('2026-06-17', '08:30'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-indexed)
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it('round-trips through formatTime regardless of timezone', () => {
    expect(formatTime(hhmmToIsoOn('2026-01-02', '23:05'))).toBe('23:05');
    expect(formatTime(hhmmToIsoOn('2026-01-02', '00:00'))).toBe('00:00');
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
