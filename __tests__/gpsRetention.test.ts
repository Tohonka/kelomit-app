jest.mock('../src/db/database', () => ({
  getDB: jest.fn(),
}));

import {GPS_RETENTION_DAYS, retentionCutoffIso} from '../src/db/gps';

describe('retentionCutoffIso', () => {
  it('retains raw fixes for 45 days by default', () => {
    expect(GPS_RETENTION_DAYS).toBe(45);
    const now = Date.parse('2026-07-24T12:00:00.000Z');
    expect(retentionCutoffIso(now, GPS_RETENTION_DAYS))
      .toBe('2026-06-09T12:00:00.000Z');
  });

  it('returns the ISO timestamp N days before now', () => {
    const now = Date.parse('2026-06-29T12:00:00.000Z');
    expect(retentionCutoffIso(now, 7)).toBe('2026-06-22T12:00:00.000Z');
  });

  it('handles a 1-day window', () => {
    const now = Date.parse('2026-06-29T00:00:00.000Z');
    expect(retentionCutoffIso(now, 1)).toBe('2026-06-28T00:00:00.000Z');
  });
});
