jest.mock('../src/db/database', () => ({
  getDB: jest.fn(),
}));

import {retentionCutoffIso} from '../src/db/gps';

describe('retentionCutoffIso', () => {
  it('returns the ISO timestamp N days before now', () => {
    const now = Date.parse('2026-06-29T12:00:00.000Z');
    expect(retentionCutoffIso(now, 7)).toBe('2026-06-22T12:00:00.000Z');
  });

  it('handles a 1-day window', () => {
    const now = Date.parse('2026-06-29T00:00:00.000Z');
    expect(retentionCutoffIso(now, 1)).toBe('2026-06-28T00:00:00.000Z');
  });
});
