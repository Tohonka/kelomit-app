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

    await expect(resolvePlaceCandidates(60.17, 24.94)).resolves.toEqual(
      cachedCandidates,
    );
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

  it.each([
    ['missing key', () => mockGetMapsApiKey.mockReturnValue('')],
    ['rejected fetch', () => mockFetch.mockRejectedValue(new Error('offline'))],
    ['non-2xx response', () => mockFetch.mockResolvedValue(response({}, false))],
    [
      'malformed response',
      () => mockFetch.mockResolvedValue(response({places: 'not-an-array'})),
    ],
  ])('does not cache %s as an empty success', async (_label, arrange) => {
    const execute = mockDatabase();
    arrange();

    await expect(resolvePlaceCandidates(60.17, 24.94)).resolves.toEqual([]);

    expect(
      execute.mock.calls.some(([sql]) => String(sql).includes('INSERT')),
    ).toBe(false);
  });

  it('keeps legacy name-only cache rows compatible', async () => {
    mockDatabase({name: 'Legacy place'});

    await expect(resolvePlaceName(60.17, 24.94)).resolves.toBe('Legacy place');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
