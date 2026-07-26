const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {
  getActivityEventsThrough,
  insertActivityEvent,
  pruneActivityEventsOlderThan,
} from '../src/db/activityEvents';
import {GPS_RETENTION_DAYS, retentionCutoffIso} from '../src/db/gps';

beforeEach(() => {
  jest.clearAllMocks();
});

it('inserts idempotently and reports whether a row changed', async () => {
  mockExecute.mockResolvedValueOnce({rowsAffected: 1});
  await expect(
    insertActivityEvent({
      activity: 'vehicle',
      transition: 'enter',
      timestamp: '2026-07-26T17:00:00.000Z',
    }),
  ).resolves.toBe(true);
  expect(mockExecute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT OR IGNORE INTO activity_events'),
    ['vehicle', 'enter', '2026-07-26T17:00:00.000Z'],
  );
});

it('reports a replayed row as unchanged', async () => {
  mockExecute.mockResolvedValueOnce({rowsAffected: 0});
  await expect(
    insertActivityEvent({
      activity: 'walking',
      transition: 'exit',
      timestamp: '2026-07-26T17:10:00.000Z',
    }),
  ).resolves.toBe(false);
});

it('loads all retained prior state through the requested end', async () => {
  mockExecute.mockResolvedValueOnce({
    rows: [
      {
        activity: 'vehicle',
        transition: 'exit',
        timestamp: '2026-07-26T17:10:00.000Z',
      },
    ],
  });
  await expect(
    getActivityEventsThrough('2026-07-26T18:00:00.000Z'),
  ).resolves.toEqual([
    {
      activity: 'vehicle',
      transition: 'exit',
      timestamp: '2026-07-26T17:10:00.000Z',
    },
  ]);
  expect(mockExecute).toHaveBeenCalledWith(
    expect.stringContaining('WHERE timestamp <= ?'),
    ['2026-07-26T18:00:00.000Z'],
  );
});

it('prunes activity evidence at the GPS retention cutoff', async () => {
  const now = Date.parse('2026-07-26T12:00:00.000Z');
  jest.spyOn(Date, 'now').mockReturnValue(now);
  mockExecute.mockResolvedValueOnce({rowsAffected: 2});

  await pruneActivityEventsOlderThan();

  expect(mockExecute).toHaveBeenCalledWith(
    'DELETE FROM activity_events WHERE timestamp < ?;',
    [retentionCutoffIso(now, GPS_RETENTION_DAYS)],
  );
});
