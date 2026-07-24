jest.mock('../src/db/database', () => ({
  getDB: jest.fn(),
}));

import {getDB} from '../src/db/database';
import {getGpsDayIdsWithinRetention} from '../src/db/gps';
import {
  createNamedPlace,
  getDayRouteHistory,
  getLatestDerivedRawTimestamp,
  getLatestRawTimestamp,
  getNamedPlaces,
  matchExistingStop,
  reconcileDayRouteHistory,
  renameNamedPlace,
} from '../src/db/routeHistory';
import type {DayRouteStop} from '../src/types';
import type {
  DerivedRouteSegment,
  DerivedRouteStop,
} from '../src/utils/routeSegments';

const mockGetDB = getDB as jest.MockedFunction<typeof getDB>;

const result = (rows: Record<string, unknown>[] = []) => ({
  rows,
  rowsAffected: 0,
});

const stopRow = (
  overrides: Partial<Record<keyof DayRouteStop, unknown>> = {},
): Record<string, unknown> => ({
  id: 1,
  day_id: 4,
  start_ts: '2026-07-24T08:00:00.000Z',
  end_ts: '2026-07-24T08:10:00.000Z',
  latitude: 60.17,
  longitude: 24.94,
  saved_location_id: null,
  named_place_id: null,
  google_place_id: null,
  display_name: null,
  name_source: 'unknown',
  user_edited: 0,
  created_at: '2026-07-24 08:00:00',
  updated_at: '2026-07-24 08:00:00',
  ...overrides,
});

const derivedStop = (
  overrides: Partial<DerivedRouteStop> = {},
): DerivedRouteStop => ({
  key: 'unknown:08:00',
  startTs: '2026-07-24T08:02:00.000Z',
  endTs: '2026-07-24T08:12:00.000Z',
  latitude: 60.17,
  longitude: 24.94,
  anchor: null,
  ...overrides,
});

const derivedSegment = (
  overrides: Partial<DerivedRouteSegment> = {},
): DerivedRouteSegment => ({
  sequence: 0,
  startTs: '2026-07-24T08:12:00.000Z',
  endTs: '2026-07-24T08:20:00.000Z',
  originStopKey: null,
  destinationStopKey: null,
  coordinates: [
    {latitude: 60.17, longitude: 24.94},
    {latitude: 60.18, longitude: 24.95},
  ],
  distanceM: 1200,
  durationSec: 480,
  averageSpeedMps: 2.5,
  maximumSpeedMps: 4,
  rawLastTs: '2026-07-24T08:20:00.000Z',
  ...overrides,
});

function mockDatabase(
  executeResults: ReturnType<typeof result>[] = [],
  transactionResults: ReturnType<typeof result>[] = [],
) {
  const execute = jest.fn();
  for (const queued of executeResults) {
    execute.mockResolvedValueOnce(queued);
  }
  execute.mockResolvedValue(result());

  const transactionExecute = jest.fn();
  for (const queued of transactionResults) {
    transactionExecute.mockResolvedValueOnce(queued);
  }
  transactionExecute.mockResolvedValue(result());

  const transaction = jest.fn(async callback => {
    await callback({execute: transactionExecute});
  });
  const db = {execute, transaction};
  mockGetDB.mockReturnValue(db as unknown as ReturnType<typeof getDB>);
  return {db, execute, transaction, transactionExecute};
}

describe('route history repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps named places ordered case-insensitively', async () => {
    const rows = [
      {
        id: 2,
        name: 'alpha',
        latitude: 60.2,
        longitude: 24.9,
        radius_m: 70,
        created_at: 'created-2',
        updated_at: 'updated-2',
      },
      {
        id: 1,
        name: 'Zoo',
        latitude: 60.1,
        longitude: 24.8,
        radius_m: 90,
        created_at: 'created-1',
        updated_at: 'updated-1',
      },
    ];
    const {execute} = mockDatabase([result(rows)]);

    await expect(getNamedPlaces()).resolves.toEqual(rows);
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/ORDER BY name COLLATE NOCASE/i),
    );
  });

  it('trims reusable names and rejects whitespace before SQL', async () => {
    const saved = {
      id: 3,
      name: 'Workshop',
      latitude: 60.1,
      longitude: 24.8,
      radius_m: 70,
      created_at: 'created',
      updated_at: 'updated',
    };
    const {execute} = mockDatabase([result([saved])]);

    await expect(
      createNamedPlace({
        name: '  Workshop  ',
        latitude: 60.1,
        longitude: 24.8,
      }),
    ).resolves.toEqual(saved);
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO named_places/i),
      ['Workshop', 60.1, 24.8, 70],
    );

    execute.mockClear();
    await expect(
      createNamedPlace({name: '   ', latitude: 0, longitude: 0}),
    ).rejects.toThrow('Name is required');
    expect(execute).not.toHaveBeenCalled();
  });

  it('renames only the reusable place, not historical stop snapshots', async () => {
    const {execute} = mockDatabase();

    await renameNamedPlace(7, '  New name ');

    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/^UPDATE named_places/i),
      ['New name', 7],
    );
    expect(execute.mock.calls.flat().join(' ')).not.toContain(
      'day_route_stops',
    );
  });

  it('reads history and safely falls back for malformed segment geometry', async () => {
    const segments = [
      {
        id: 10,
        day_id: 4,
        sequence: 0,
        start_ts: 'start',
        end_ts: 'end',
        origin_stop_id: 1,
        destination_stop_id: null,
        coordinates_json:
          '[{"latitude":60.17,"longitude":24.94},{"latitude":60.18,"longitude":24.95}]',
        distance_m: 100,
        duration_sec: 60,
        average_speed_mps: 1.67,
        maximum_speed_mps: 2,
        raw_last_ts: 'latest',
        created_at: 'created',
        updated_at: 'updated',
      },
      {
        id: 11,
        day_id: 4,
        sequence: 1,
        coordinates_json: '{bad json',
      },
      {
        id: 12,
        day_id: 4,
        sequence: 2,
        coordinates_json: '{"latitude":60.17}',
      },
      {
        id: 13,
        day_id: 4,
        sequence: 3,
        coordinates_json: '[{"latitude":"bad","longitude":24.94}]',
      },
    ];
    mockDatabase([result([stopRow({user_edited: 1})]), result(segments)]);

    const history = await getDayRouteHistory(4);

    expect(history.stops[0].user_edited).toBe(true);
    expect(history.segments.map(item => item.coordinates)).toEqual([
      [
        {latitude: 60.17, longitude: 24.94},
        {latitude: 60.18, longitude: 24.95},
      ],
      [],
      [],
      [],
    ]);
  });

  it('reads the newest raw and derived timestamps', async () => {
    const {execute} = mockDatabase([
      result([{timestamp: 'raw-latest'}]),
      result([{raw_last_ts: 'derived-latest'}]),
    ]);

    await expect(getLatestRawTimestamp(4)).resolves.toBe('raw-latest');
    await expect(getLatestDerivedRawTimestamp(4)).resolves.toBe(
      'derived-latest',
    );
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/MAX\(timestamp\)/i),
      [4],
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/MAX\(raw_last_ts\)/i),
      [4],
    );
  });

  it('matches by overlap, then distance, then lowest ID', () => {
    const next = derivedStop();
    const candidates = [
      stopRow({
        id: 3,
        start_ts: '2026-07-24T08:01:00.000Z',
        end_ts: '2026-07-24T08:11:00.000Z',
        latitude: 60.1701,
      }),
      stopRow({
        id: 2,
        start_ts: '2026-07-24T08:01:00.000Z',
        end_ts: '2026-07-24T08:11:00.000Z',
        latitude: 60.17,
      }),
      stopRow({
        id: 1,
        start_ts: '2026-07-24T08:01:00.000Z',
        end_ts: '2026-07-24T08:11:00.000Z',
        latitude: 60.17,
      }),
      stopRow({
        id: 0,
        start_ts: '2026-07-24T08:02:00.000Z',
        end_ts: '2026-07-24T08:05:00.000Z',
        latitude: 60.17,
      }),
      stopRow({
        id: -1,
        start_ts: '2026-07-24T08:00:00.000Z',
        end_ts: '2026-07-24T08:12:00.000Z',
        latitude: 60.171,
      }),
    ].map(row => ({...row, user_edited: false}) as DayRouteStop);

    expect(matchExistingStop(next, candidates)?.id).toBe(1);
  });

  it('reconciles once while preserving explicit identity and frozen names', async () => {
    const existing = [
      stopRow({
        id: 10,
        named_place_id: 7,
        google_place_id: 'chosen-google-id',
        display_name: 'Chosen for this day',
        name_source: 'day',
        user_edited: 1,
      }),
      stopRow({
        id: 11,
        start_ts: '2026-07-24T09:00:00.000Z',
        end_ts: '2026-07-24T09:10:00.000Z',
        display_name: 'Frozen Google snapshot',
        google_place_id: 'automatic-google-id',
        name_source: 'google',
      }),
    ];
    const {execute, transaction, transactionExecute} = mockDatabase([], [
      result(existing),
      result(),
      result(),
      result(),
    ]);
    const nextStops = [
      derivedStop({
        key: 'first',
        anchor: {
          id: 99,
          type: 'reusable',
          name: 'Renamed reusable place',
          latitude: 60.17,
          longitude: 24.94,
          radiusM: 70,
        },
      }),
      derivedStop({
        key: 'second',
        startTs: '2026-07-24T09:02:00.000Z',
        endTs: '2026-07-24T09:12:00.000Z',
      }),
    ];

    await reconcileDayRouteHistory(4, {stops: nextStops, segments: []});

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    const updates = transactionExecute.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE day_route_stops'),
    );
    expect(updates).toHaveLength(2);
    expect(updates[0][1].slice(4)).toEqual([
      null,
      7,
      'chosen-google-id',
      'Chosen for this day',
      'day',
      1,
      10,
      4,
    ]);
    expect(updates[1][1][7]).toBe('Frozen Google snapshot');
  });

  it('consumes each old stop at most once during reconciliation', async () => {
    const {transactionExecute} = mockDatabase([], [
      result([stopRow({id: 10})]),
      result(),
      result([{id: 20}]),
      result(),
    ]);

    await reconcileDayRouteHistory(4, {
      stops: [
        derivedStop({key: 'first'}),
        derivedStop({key: 'second'}),
      ],
      segments: [],
    });

    expect(
      transactionExecute.mock.calls.filter(([sql]) =>
        String(sql).includes('UPDATE day_route_stops'),
      ),
    ).toHaveLength(1);
    expect(
      transactionExecute.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO day_route_stops'),
      ),
    ).toHaveLength(1);
  });

  it('deletes obsolete summaries before inserting segments with new anchor snapshots', async () => {
    const saved = derivedStop({
      key: 'saved',
      startTs: '2026-07-24T10:00:00.000Z',
      endTs: '2026-07-24T10:10:00.000Z',
      anchor: {
        id: 5,
        type: 'saved',
        name: 'Home',
        latitude: 60.17,
        longitude: 24.94,
        radiusM: 80,
      },
    });
    const reusable = derivedStop({
      key: 'reusable',
      startTs: '2026-07-24T11:00:00.000Z',
      endTs: '2026-07-24T11:10:00.000Z',
      anchor: {
        id: 8,
        type: 'reusable',
        name: 'Workshop',
        latitude: 60.18,
        longitude: 24.95,
        radiusM: 70,
      },
    });
    const segment = derivedSegment({
      originStopKey: saved.key,
      destinationStopKey: reusable.key,
    });
    const {transactionExecute} = mockDatabase([], [
      result([stopRow({id: 44})]),
      result([{id: 101}]),
      result([{id: 102}]),
      result(),
      result(),
      result(),
    ]);

    await reconcileDayRouteHistory(4, {
      stops: [saved, reusable],
      segments: [segment],
    });

    const calls = transactionExecute.mock.calls;
    const stopInserts = calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO day_route_stops'),
    );
    expect(stopInserts[0][1]).toEqual(
      expect.arrayContaining([5, null, 'Home', 'saved']),
    );
    expect(stopInserts[1][1]).toEqual(
      expect.arrayContaining([null, 8, 'Workshop', 'reusable']),
    );

    const segmentDeleteIndex = calls.findIndex(([sql]) =>
      String(sql).includes('DELETE FROM day_route_segments'),
    );
    const obsoleteStopDeleteIndex = calls.findIndex(([sql]) =>
      String(sql).includes('DELETE FROM day_route_stops'),
    );
    const segmentInsertIndex = calls.findIndex(([sql]) =>
      String(sql).includes('INSERT INTO day_route_segments'),
    );
    expect(segmentDeleteIndex).toBeLessThan(obsoleteStopDeleteIndex);
    expect(obsoleteStopDeleteIndex).toBeLessThan(segmentInsertIndex);
    expect(calls[obsoleteStopDeleteIndex][1]).toEqual([44, 4]);
    expect(calls[segmentInsertIndex][1]).toEqual(
      expect.arrayContaining([
        101,
        102,
        JSON.stringify(segment.coordinates),
      ]),
    );
  });

  it('returns distinct raw day IDs inside the requested retention window', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(
      Date.parse('2026-07-24T12:00:00.000Z'),
    );
    const {execute} = mockDatabase([result([{day_id: 9}, {day_id: 4}])]);

    await expect(getGpsDayIdsWithinRetention(7)).resolves.toEqual([9, 4]);
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT DISTINCT day_id[\s\S]*timestamp >= \?/i),
      ['2026-07-17T12:00:00.000Z'],
    );
  });
});
