jest.mock('../src/db/database', () => ({
  getDB: jest.fn(),
}));

import {getDB} from '../src/db/database';
import {getGpsDayIdsWithinRetention} from '../src/db/gps';
import {
  createNamedPlace,
  createNamedPlaceForStop,
  getDayRouteHistory,
  getEarliestDerivedTimestamp,
  getLatestDerivedRawTimestamp,
  getLatestRawTimestamp,
  getNearbyLocalPlaces,
  getNamedPlaces,
  matchExistingStop,
  reconcileDayRouteHistory,
  renameNamedPlace,
  hasInvalidRouteGeometry,
  setAutomaticGoogleStopName,
  setDayStopName,
} from '../src/db/routeHistory';
import type {DayRouteStop} from '../src/types';
import type {
  DerivedRouteSegment,
  DerivedRouteStop,
} from '../src/utils/routeSegments';

const mockGetDB = getDB as jest.MockedFunction<typeof getDB>;

const result = (
  rows: Record<string, unknown>[] = [],
  rowsAffected = 0,
) => ({
  rows,
  rowsAffected,
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

  it('returns saved and reusable places inside the radius ordered by distance', async () => {
    mockDatabase([
      result([
        {
          type: 'reusable',
          id: 8,
          name: 'Workshop',
          latitude: 60.1702,
          longitude: 24.94,
        },
        {
          type: 'saved',
          id: 5,
          name: 'Home',
          latitude: 60.1701,
          longitude: 24.94,
        },
        {
          type: 'saved',
          id: 6,
          name: 'Too far',
          latitude: 60.18,
          longitude: 24.94,
        },
      ]),
    ]);

    const nearby = await getNearbyLocalPlaces(60.17, 24.94, 50);

    expect(nearby.map(place => [place.type, place.id, place.name])).toEqual([
      ['saved', 5, 'Home'],
      ['reusable', 8, 'Workshop'],
    ]);
    expect(nearby.every(place => place.distanceM <= 50)).toBe(true);
  });

  it.each([
    [
      {type: 'saved' as const, id: 5, name: ' Home '},
      [5, null, null, 'Home', 'saved', 12],
    ],
    [
      {type: 'reusable' as const, id: 8, name: ' Workshop '},
      [null, 8, null, 'Workshop', 'reusable', 12],
    ],
    [
      {type: 'google' as const, placeId: 'google-id', name: ' Cafe '},
      [null, null, 'google-id', 'Cafe', 'google', 12],
    ],
    [
      {type: 'day' as const, name: ' Today only '},
      [null, null, null, 'Today only', 'day', 12],
    ],
  ])('sets one stop snapshot and clears incompatible links', async (choice, params) => {
    const {execute} = mockDatabase();

    await setDayStopName(12, choice);

    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /UPDATE day_route_stops[\s\S]*user_edited = 1[\s\S]*WHERE id = \?/i,
      ),
      params,
    );
  });

  it('snapshots an automatic Google name only while the stop is still unnamed', async () => {
    const {execute} = mockDatabase([result([], 1), result([], 0)]);

    await expect(
      setAutomaticGoogleStopName(12, {
        name: ' Nearby cafe ',
        placeId: ' google-id ',
      }),
    ).resolves.toBe(true);
    await expect(
      setAutomaticGoogleStopName(12, {
        name: 'Late result',
        placeId: 'late-id',
      }),
    ).resolves.toBe(false);

    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /UPDATE day_route_stops[\s\S]*user_edited = 0[\s\S]*display_name[\s\S]*(IS NULL|= '')/i,
      ),
      ['Nearby cafe', 'google-id', 12],
    );
  });

  it('creates a reusable place from the stop centroid in one transaction', async () => {
    const inserted = {
      id: 9,
      name: 'Workshop',
      latitude: 60.17,
      longitude: 24.94,
      radius_m: 70,
      created_at: 'created',
      updated_at: 'updated',
    };
    const {execute, transaction, transactionExecute} = mockDatabase([], [
      result([{latitude: 60.17, longitude: 24.94}]),
      result([inserted]),
      result(),
    ]);

    await createNamedPlaceForStop(12, ' Workshop ');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(transactionExecute.mock.calls[0]).toEqual([
      expect.stringMatching(/SELECT latitude, longitude[\s\S]*WHERE id = \?/i),
      [12],
    ]);
    expect(transactionExecute.mock.calls[1]).toEqual([
      expect.stringMatching(/INSERT INTO named_places/i),
      ['Workshop', 60.17, 24.94, 70],
    ]);
    expect(transactionExecute.mock.calls[2]).toEqual([
      expect.stringMatching(/UPDATE day_route_stops/i),
      [null, 9, null, 'Workshop', 'reusable', 12],
    ]);
    expect(
      transactionExecute.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE'),
      ),
    ).toBe(false);
  });

  it('does not create a reusable place when the stop is missing', async () => {
    const {transactionExecute} = mockDatabase([], [result()]);

    await expect(createNamedPlaceForStop(404, 'Missing')).rejects.toThrow(
      'Route stop not found',
    );
    expect(transactionExecute).toHaveBeenCalledTimes(1);
  });

  it('omits malformed segment geometry but keeps a valid empty array', async () => {
    const valid = {
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
    };
    const segments = [
      valid,
      {...valid, id: 11, sequence: 1, coordinates_json: '{bad json'},
      {
        ...valid,
        id: 12,
        sequence: 2,
        coordinates_json: '{"latitude":60.17}',
      },
      {
        ...valid,
        id: 13,
        sequence: 3,
        coordinates_json: '[{"latitude":"bad","longitude":24.94}]',
      },
      {
        ...valid,
        id: 14,
        sequence: 4,
        coordinates_json: '[{"latitude":91,"longitude":24.94}]',
      },
      {
        ...valid,
        id: 15,
        sequence: 5,
        coordinates_json: '[{"latitude":60.17,"longitude":181}]',
      },
      {...valid, id: 16, sequence: 6, coordinates_json: '[]'},
    ];
    mockDatabase([result([stopRow({user_edited: 1})]), result(segments)]);

    const history = await getDayRouteHistory(4);

    expect(history.stops[0].user_edited).toBe(true);
    expect(history.segments.map(item => [item.id, item.coordinates])).toEqual([
      [
        10,
        [
          {latitude: 60.17, longitude: 24.94},
          {latitude: 60.18, longitude: 24.95},
        ],
      ],
      [16, []],
    ]);
  });

  it('reads the newest raw and derived timestamps', async () => {
    const {execute} = mockDatabase([
      result([{timestamp: 'raw-latest'}]),
      result([{raw_last_ts: 'derived-latest'}]),
      result([{first_ts: 'derived-first'}]),
    ]);

    await expect(getLatestRawTimestamp(4)).resolves.toBe('raw-latest');
    await expect(getLatestDerivedRawTimestamp(4)).resolves.toBe(
      'derived-latest',
    );
    await expect(getEarliestDerivedTimestamp(4)).resolves.toBe(
      'derived-first',
    );
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/MAX\(timestamp\)/i),
      [4],
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /day_route_segments[\s\S]*day_route_stops|day_route_stops[\s\S]*day_route_segments/i,
      ),
      [4, 4],
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(
        /day_route_segments[\s\S]*day_route_stops|day_route_stops[\s\S]*day_route_segments/i,
      ),
      [4, 4],
    );
  });

  it('reports malformed geometry without discarding its persisted watermark', async () => {
    mockDatabase([
      result([{raw_last_ts: 'derived-latest'}]),
      result([{coordinates_json: '{bad json'}]),
    ]);

    await expect(getLatestDerivedRawTimestamp(4)).resolves.toBe(
      'derived-latest',
    );
    await expect(hasInvalidRouteGeometry(4)).resolves.toBe(true);
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

  it('preserves a frozen identity for a coincident zero-duration stop', async () => {
    const timestamp = '2026-07-24T08:10:00.000Z';
    const existing = stopRow({
      id: 10,
      start_ts: timestamp,
      end_ts: timestamp,
      latitude: 60.1706,
      google_place_id: 'frozen-google-id',
      display_name: 'Frozen workshop',
      name_source: 'google',
    });
    const unrelated = stopRow({
      id: 1,
      start_ts: '2026-07-24T08:11:00.000Z',
      end_ts: '2026-07-24T08:11:00.000Z',
    });
    const {transactionExecute} = mockDatabase([], [
      result([existing, unrelated]),
      result([{id: 20}]),
      result(),
      result(),
    ]);
    const next = derivedStop({
      startTs: timestamp,
      endTs: timestamp,
      anchor: {
        id: 99,
        type: 'saved',
        name: 'New derived anchor',
        latitude: 60.17,
        longitude: 24.94,
        radiusM: 70,
      },
    });

    await reconcileDayRouteHistory(4, {stops: [next], segments: []});

    expect(
      transactionExecute.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE day_route_stops'),
      )?.[1],
    ).toEqual([
      timestamp,
      timestamp,
      60.17,
      24.94,
      null,
      null,
      'frozen-google-id',
      'Frozen workshop',
      'google',
      0,
      10,
      4,
    ]);
    expect(
      transactionExecute.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO day_route_stops'),
      ),
    ).toHaveLength(0);
    expect(
      transactionExecute.mock.calls
        .filter(([sql]) => String(sql).includes('DELETE FROM day_route_stops'))
        .map(([, params]) => params),
    ).toEqual([[1, 4]]);
  });

  it.each([
    {
      label: 'saved',
      existing: {
        saved_location_id: 5,
        display_name: 'Chosen saved place',
        name_source: 'saved',
      },
      identity: [5, null, null, 'Chosen saved place', 'saved', 1],
    },
    {
      label: 'reusable',
      existing: {
        named_place_id: 7,
        display_name: 'Chosen reusable place',
        name_source: 'reusable',
      },
      identity: [null, 7, null, 'Chosen reusable place', 'reusable', 1],
    },
    {
      label: 'Google',
      existing: {
        google_place_id: 'chosen-google-id',
        display_name: 'Chosen Google place',
        name_source: 'google',
      },
      identity: [
        null,
        null,
        'chosen-google-id',
        'Chosen Google place',
        'google',
        1,
      ],
    },
    {
      label: 'day-only',
      existing: {
        display_name: 'Chosen for this day',
        name_source: 'day',
      },
      identity: [null, null, null, 'Chosen for this day', 'day', 1],
    },
  ])('preserves every mutually exclusive $label choice on rebuild', async item => {
    const existing = stopRow({
      id: 10,
      ...item.existing,
      user_edited: 1,
    });
    const {transactionExecute} = mockDatabase([], [
      result([existing]),
      result(),
      result(),
    ]);
    const next = derivedStop({
      startTs: '2026-07-24T08:03:00.000Z',
      endTs: '2026-07-24T08:13:00.000Z',
      latitude: 60.1702,
      longitude: 24.9402,
      anchor: {
        id: 99,
        type: 'reusable',
        name: 'Conflicting derived place',
        latitude: 60.17,
        longitude: 24.94,
        radiusM: 70,
      },
    });

    await reconcileDayRouteHistory(4, {stops: [next], segments: []});

    const update = transactionExecute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE day_route_stops'),
    );
    expect(update?.[1]).toEqual([
      next.startTs,
      next.endTs,
      next.latitude,
      next.longitude,
      ...item.identity,
      10,
      4,
    ]);
  });

  it('preserves automatic Google snapshot provenance while updating derived fields', async () => {
    const existing = stopRow({
      id: 11,
      display_name: 'Frozen Google snapshot',
      google_place_id: 'automatic-google-id',
      name_source: 'google',
      user_edited: 0,
    });
    const {transactionExecute} = mockDatabase([], [
      result([existing]),
      result(),
      result(),
    ]);
    const next = derivedStop({
      startTs: '2026-07-24T08:03:00.000Z',
      endTs: '2026-07-24T08:13:00.000Z',
      latitude: 60.1702,
      longitude: 24.9402,
      anchor: {
        id: 99,
        type: 'saved',
        name: 'New derived anchor',
        latitude: 60.17,
        longitude: 24.94,
        radiusM: 70,
      },
    });

    await reconcileDayRouteHistory(4, {stops: [next], segments: []});

    const update = transactionExecute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE day_route_stops'),
    );
    expect(update?.[1]).toEqual([
      next.startTs,
      next.endTs,
      next.latitude,
      next.longitude,
      null,
      null,
      'automatic-google-id',
      'Frozen Google snapshot',
      'google',
      0,
      11,
      4,
    ]);
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
