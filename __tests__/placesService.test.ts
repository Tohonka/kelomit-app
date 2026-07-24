jest.mock('../src/db/database', () => ({
  getDB: jest.fn(),
}));
jest.mock('../src/native/backgroundLocation', () => ({
  getMapsApiKey: jest.fn(),
}));

import {getDB} from '../src/db/database';
import {getMapsApiKey} from '../src/native/backgroundLocation';
import {
  resolvePlaceCandidates,
  resolvePlaceName,
  resolvePlaceSnapshot,
} from '../src/services/placesService';

const mockGetDB = getDB as jest.MockedFunction<typeof getDB>;
const mockGetMapsApiKey = getMapsApiKey as jest.MockedFunction<
  typeof getMapsApiKey
>;
const mockFetch = jest.fn();

function mockDatabase(row?: Record<string, unknown>) {
  const execute = jest.fn().mockResolvedValue({
    rows: row ? [row] : [],
    rowsAffected: 0,
  });
  mockGetDB.mockReturnValue({execute} as unknown as ReturnType<typeof getDB>);
  return execute;
}

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
}

const cachedCandidates = [
  {
    placeId: 'cached-id',
    name: 'Cached place',
    latitude: 60.1701,
    longitude: 24.9401,
    distanceM: 12,
  },
];

describe('places service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMapsApiKey.mockReturnValue('maps-key');
    globalThis.fetch = mockFetch;
  });

  it('returns cached candidates without a network request', async () => {
    mockDatabase({candidates_json: JSON.stringify(cachedCandidates)});

    const candidates = await resolvePlaceCandidates(60.17, 24.94);

    expect(candidates[0]).toEqual({
      ...cachedCandidates[0],
      distanceM: expect.any(Number),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('recomputes cached distances and order for another origin in the same cell', async () => {
    const cached = [
      {
        placeId: 'south-id',
        name: 'South',
        latitude: 60.17001,
        longitude: 24.94,
        distanceM: 0,
      },
      {
        placeId: 'north-id',
        name: 'North',
        latitude: 60.17004,
        longitude: 24.94,
        distanceM: 3.3,
      },
    ];
    mockDatabase({candidates_json: JSON.stringify(cached)});

    const candidates = await resolvePlaceCandidates(60.17004, 24.94);

    expect(candidates.map(candidate => candidate.placeId)).toEqual([
      'north-id',
      'south-id',
    ]);
    expect(candidates[0].distanceM).toBeCloseTo(0);
    expect(candidates[1].distanceM).toBeGreaterThan(3);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('filters invalid cached candidates, validates coordinate ranges, and caps at ten', async () => {
    const cached = [
      {
        placeId: 'invalid-lat',
        name: 'Invalid latitude',
        latitude: 91,
        longitude: 24.94,
        distanceM: 0,
      },
      {
        placeId: 'invalid-lng',
        name: 'Invalid longitude',
        latitude: 60.17,
        longitude: 181,
        distanceM: 0,
      },
      ...Array.from({length: 11}, (_, index) => ({
        placeId: `valid-${index}`,
        name: `Valid ${index}`,
        latitude: 60.17 + index / 100_000,
        longitude: 24.94,
        distanceM: 999,
      })),
    ];
    mockDatabase({candidates_json: JSON.stringify(cached)});

    const candidates = await resolvePlaceCandidates(60.17, 24.94);

    expect(candidates.map(candidate => candidate.placeId)).toEqual([
      'valid-0',
      'valid-1',
      'valid-2',
      'valid-3',
      'valid-4',
      'valid-5',
      'valid-6',
      'valid-7',
      'valid-8',
      'valid-9',
    ]);
    expect(candidates[0].distanceM).toBeCloseTo(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes malformed cache, normalizes by distance, and stores one snapshot', async () => {
    const execute = mockDatabase({candidates_json: '{bad json'});
    mockFetch.mockResolvedValue(
      response({
        places: [
          {
            id: 'far-id',
            displayName: {text: 'Far place', languageCode: 'en'},
            location: {latitude: 60.171, longitude: 24.94},
          },
          {
            id: 'near-id',
            displayName: {text: 'Near place', languageCode: 'en'},
            location: {latitude: 60.1701, longitude: 24.94},
          },
        ],
      }),
    );

    const candidates = await resolvePlaceCandidates(60.17, 24.94);

    expect(candidates.map(candidate => candidate.placeId)).toEqual([
      'near-id',
      'far-id',
    ]);
    expect(candidates[0]).toEqual({
      placeId: 'near-id',
      name: 'Near place',
      latitude: 60.1701,
      longitude: 24.94,
      distanceM: expect.any(Number),
    });

    const [, request] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toEqual(
      expect.objectContaining({
        'X-Goog-Api-Key': 'maps-key',
        'X-Goog-FieldMask':
          'places.displayName,places.id,places.location',
      }),
    );
    expect(JSON.parse(request.body as string)).toEqual({
      maxResultCount: 10,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: {latitude: 60.17, longitude: 24.94},
          radius: 60,
        },
      },
    });

    const write = execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT'),
    );
    expect(write?.[1]).toEqual([
      '60.1700,24.9400',
      'Near place',
      'near-id',
      JSON.stringify(candidates),
    ]);
  });

  it('caches a successful empty result', async () => {
    const execute = mockDatabase();
    mockFetch.mockResolvedValue(response({places: []}));

    await expect(resolvePlaceCandidates(60.17, 24.94)).resolves.toEqual([]);

    const write = execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT'),
    );
    expect(write?.[1]).toEqual(['60.1700,24.9400', '', '', '[]']);
  });

  it('coalesces one cell fetch but ranks results for each caller origin', async () => {
    mockDatabase();
    const pending = deferred<Response>();
    mockFetch.mockReturnValue(pending.promise);

    const first = resolvePlaceCandidates(60.17001, 24.94);
    const second = resolvePlaceCandidates(60.17004, 24.94);
    await Promise.resolve();
    await Promise.resolve();
    const fetchesBeforeResolution = mockFetch.mock.calls.length;
    pending.resolve(
      response({
        places: [
          {
            id: 'south-id',
            displayName: {text: 'South'},
            location: {latitude: 60.17001, longitude: 24.94},
          },
          {
            id: 'north-id',
            displayName: {text: 'North'},
            location: {latitude: 60.17004, longitude: 24.94},
          },
        ],
      }),
    );

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(fetchesBeforeResolution).toBe(1);
    expect(firstResult.map(candidate => candidate.placeId)).toEqual([
      'south-id',
      'north-id',
    ]);
    expect(secondResult.map(candidate => candidate.placeId)).toEqual([
      'north-id',
      'south-id',
    ]);
    expect(firstResult[0].distanceM).toBeCloseTo(0);
    expect(secondResult[0].distanceM).toBeCloseTo(0);
  });

  it('filters invalid fresh candidates and caps the distance-sorted result at ten', async () => {
    const execute = mockDatabase();
    mockFetch.mockResolvedValue(
      response({
        places: [
          {
            id: 'invalid-range',
            displayName: {text: 'Invalid range'},
            location: {latitude: 91, longitude: 24.94},
          },
          {id: 'invalid-shape'},
          ...Array.from({length: 11}, (_, index) => ({
            id: `fresh-${index}`,
            displayName: {text: `Fresh ${index}`},
            location: {
              latitude: 60.17 + index / 100_000,
              longitude: 24.94,
            },
          })),
        ],
      }),
    );

    const candidates = await resolvePlaceCandidates(60.17, 24.94);

    expect(candidates.map(candidate => candidate.placeId)).toEqual([
      'fresh-0',
      'fresh-1',
      'fresh-2',
      'fresh-3',
      'fresh-4',
      'fresh-5',
      'fresh-6',
      'fresh-7',
      'fresh-8',
      'fresh-9',
    ]);
    const write = execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT'),
    );
    expect(JSON.parse(String(write?.[1]?.[3]))).toHaveLength(10);
  });

  it.each([
    ['missing key', () => mockGetMapsApiKey.mockReturnValue('')],
    ['rejected fetch', () => mockFetch.mockRejectedValue(new Error('offline'))],
    ['non-2xx response', () => mockFetch.mockResolvedValue(response({}, false))],
    [
      'malformed response',
      () => mockFetch.mockResolvedValue(response({places: 'not-an-array'})),
    ],
  ])('rejects and does not cache %s as an empty success', async (_label, arrange) => {
    const execute = mockDatabase();
    arrange();

    await expect(resolvePlaceCandidates(60.17, 24.94)).rejects.toThrow();

    expect(
      execute.mock.calls.some(([sql]) => String(sql).includes('INSERT')),
    ).toBe(false);
  });

  it('keeps legacy name-only cache rows compatible', async () => {
    mockDatabase({name: 'Legacy place'});

    await expect(resolvePlaceName(60.17, 24.94)).resolves.toBe('Legacy place');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns an authoritative legacy cached snapshot without a network request', async () => {
    mockDatabase({name: 'Legacy place', place_id: 'legacy-id'});

    await expect(resolvePlaceSnapshot(60.17, 24.94)).resolves.toEqual({
      name: 'Legacy place',
      placeId: 'legacy-id',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('treats a cached automatic no-result as authoritative', async () => {
    mockDatabase({name: '', place_id: ''});

    await expect(resolvePlaceSnapshot(60.17, 24.94)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns and caches the nearest automatic network snapshot', async () => {
    const execute = mockDatabase();
    mockFetch.mockResolvedValue(
      response({
        places: [
          {
            id: 'network-id',
            displayName: {text: 'Network place'},
            location: {latitude: 60.1701, longitude: 24.94},
          },
        ],
      }),
    );

    await expect(resolvePlaceSnapshot(60.17, 24.94)).resolves.toEqual({
      name: 'Network place',
      placeId: 'network-id',
    });
    const write = execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT'),
    );
    expect(write?.[1]?.slice(0, 3)).toEqual([
      '60.1700,24.9400',
      'Network place',
      'network-id',
    ]);
    expect(JSON.parse(String(write?.[1]?.[3]))).toHaveLength(1);
  });

  it('caches a successful automatic no-result and returns null', async () => {
    const execute = mockDatabase();
    mockFetch.mockResolvedValue(response({places: []}));

    await expect(resolvePlaceSnapshot(60.17, 24.94)).resolves.toBeNull();
    expect(
      execute.mock.calls.find(([sql]) => String(sql).includes('INSERT'))?.[1],
    ).toEqual(['60.1700,24.9400', '', '', '[]']);
  });
});
