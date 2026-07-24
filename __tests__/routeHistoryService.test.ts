const mockGetGpsPointsForDay = jest.fn();
const mockGetGpsDayIdsWithinRetention = jest.fn();
const mockGetLocations = jest.fn();
const mockGetNamedPlaces = jest.fn();
const mockGetLatestRawTimestamp = jest.fn();
const mockGetLatestDerivedRawTimestamp = jest.fn();
const mockReconcileDayRouteHistory = jest.fn();
const mockDeriveRouteDay = jest.fn();
const mockDiag = jest.fn();

jest.mock('../src/db/gps', () => ({
  getGpsPointsForDay: (...args: unknown[]) => mockGetGpsPointsForDay(...args),
  getGpsDayIdsWithinRetention: (...args: unknown[]) =>
    mockGetGpsDayIdsWithinRetention(...args),
}));
jest.mock('../src/db/locations', () => ({
  getLocations: (...args: unknown[]) => mockGetLocations(...args),
}));
jest.mock('../src/db/routeHistory', () => ({
  getNamedPlaces: (...args: unknown[]) => mockGetNamedPlaces(...args),
  getLatestRawTimestamp: (...args: unknown[]) =>
    mockGetLatestRawTimestamp(...args),
  getLatestDerivedRawTimestamp: (...args: unknown[]) =>
    mockGetLatestDerivedRawTimestamp(...args),
  reconcileDayRouteHistory: (...args: unknown[]) =>
    mockReconcileDayRouteHistory(...args),
}));
jest.mock('../src/utils/routeSegments', () => ({
  deriveRouteDay: (...args: unknown[]) => mockDeriveRouteDay(...args),
}));
jest.mock('../src/services/diag', () => ({
  diag: (...args: unknown[]) => mockDiag(...args),
}));

import {
  reconcileRecentRouteDays,
  refreshRouteDay,
  refreshRouteDayIfStale,
  scheduleRouteRefresh,
} from '../src/services/routeHistoryService';

const points = [{
  day_id: 4,
  latitude: 60.1,
  longitude: 24.9,
  accuracy: 5,
  altitude: null,
  speed: 1.2,
  timestamp: '2026-07-23T05:00:00.000Z',
}];
const locations = [{
  id: 2,
  name: 'Workshop',
  kind: 'work' as const,
  latitude: 60.2,
  longitude: 24.8,
  radius_m: 35,
  created_at: '',
  updated_at: '',
}];
const namedPlaces = [{
  id: 8,
  name: 'Café',
  latitude: 60.3,
  longitude: 24.7,
  radius_m: 45,
  created_at: '',
  updated_at: '',
}];
const derived = {stops: [], segments: []};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockGetGpsPointsForDay.mockResolvedValue(points);
  mockGetGpsDayIdsWithinRetention.mockResolvedValue([]);
  mockGetLocations.mockResolvedValue(locations);
  mockGetNamedPlaces.mockResolvedValue(namedPlaces);
  mockGetLatestRawTimestamp.mockResolvedValue('2026-07-23T05:00:00.000Z');
  mockGetLatestDerivedRawTimestamp.mockResolvedValue(
    '2026-07-23T05:00:00.000Z',
  );
  mockDeriveRouteDay.mockReturnValue(derived);
  mockReconcileDayRouteHistory.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('derives and reconciles a day from raw points and both anchor sources', async () => {
  await refreshRouteDay(4);

  expect(mockGetGpsPointsForDay).toHaveBeenCalledWith(4);
  expect(mockDeriveRouteDay).toHaveBeenCalledWith(points, [
    {
      id: 2,
      type: 'saved',
      name: 'Workshop',
      latitude: 60.2,
      longitude: 24.8,
      radiusM: 35,
    },
    {
      id: 8,
      type: 'reusable',
      name: 'Café',
      latitude: 60.3,
      longitude: 24.7,
      radiusM: 45,
    },
  ]);
  expect(mockDeriveRouteDay).toHaveBeenCalledTimes(1);
  expect(mockReconcileDayRouteHistory).toHaveBeenCalledWith(4, derived);
  expect(mockReconcileDayRouteHistory).toHaveBeenCalledTimes(1);
});

it('skips a day whose raw and derived timestamps match', async () => {
  await expect(refreshRouteDayIfStale(4)).resolves.toBe(false);

  expect(mockGetGpsPointsForDay).not.toHaveBeenCalled();
  expect(mockReconcileDayRouteHistory).not.toHaveBeenCalled();
});

it.each([
  ['missing', null],
  ['older', '2026-07-23T04:59:00.000Z'],
])('rebuilds when derived history is %s', async (_case, derivedTimestamp) => {
  mockGetLatestDerivedRawTimestamp.mockResolvedValue(derivedTimestamp);

  await expect(refreshRouteDayIfStale(4)).resolves.toBe(true);

  expect(mockReconcileDayRouteHistory).toHaveBeenCalledWith(4, derived);
});

it('coalesces repeated live writes for one day', async () => {
  jest.useFakeTimers();

  scheduleRouteRefresh(4);
  scheduleRouteRefresh(4);
  await jest.advanceTimersByTimeAsync(14_999);
  expect(mockGetGpsPointsForDay).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(1);
  expect(mockGetGpsPointsForDay).toHaveBeenCalledTimes(1);
});

it('keeps separate refresh timers for different days', async () => {
  jest.useFakeTimers();
  mockGetGpsPointsForDay.mockImplementation(async (dayId: number) =>
    points.map(point => ({...point, day_id: dayId})),
  );

  scheduleRouteRefresh(4);
  scheduleRouteRefresh(5);
  await jest.advanceTimersByTimeAsync(15_000);

  expect(mockGetGpsPointsForDay).toHaveBeenCalledTimes(2);
  expect(mockReconcileDayRouteHistory).toHaveBeenCalledWith(4, derived);
  expect(mockReconcileDayRouteHistory).toHaveBeenCalledWith(5, derived);
});

it('serializes same-day refreshes and coalesces in-flight calls into one follow-up', async () => {
  const olderPoints = points;
  const newerPoints = [{
    ...points[0],
    timestamp: '2026-07-23T05:01:00.000Z',
  }];
  const olderRead = deferred<typeof points>();
  const newerRead = deferred<typeof newerPoints>();
  const olderDerived = {stops: [{key: 'older'}], segments: []};
  const newerDerived = {stops: [{key: 'newer'}], segments: []};
  mockGetGpsPointsForDay
    .mockImplementationOnce(() => olderRead.promise)
    .mockImplementationOnce(() => newerRead.promise);
  mockDeriveRouteDay
    .mockReturnValueOnce(olderDerived)
    .mockReturnValueOnce(newerDerived);

  const first = refreshRouteDay(4);
  const second = refreshRouteDay(4);
  const third = refreshRouteDay(4);
  const readsStartedBeforeFirstCompleted =
    mockGetGpsPointsForDay.mock.calls.length;

  olderRead.resolve(olderPoints);
  newerRead.resolve(newerPoints);
  await Promise.all([first, second, third]);

  expect(readsStartedBeforeFirstCompleted).toBe(1);
  expect(mockGetGpsPointsForDay).toHaveBeenCalledTimes(2);
  expect(mockReconcileDayRouteHistory.mock.calls).toEqual([
    [4, olderDerived],
    [4, newerDerived],
  ]);
});

it('allows different days to refresh independently', async () => {
  const dayFourRead = deferred<typeof points>();
  const dayFiveRead = deferred<typeof points>();
  mockGetGpsPointsForDay.mockImplementation((dayId: number) =>
    dayId === 4 ? dayFourRead.promise : dayFiveRead.promise,
  );

  const dayFour = refreshRouteDay(4);
  const dayFive = refreshRouteDay(5);

  expect(mockGetGpsPointsForDay.mock.calls).toEqual([[4], [5]]);
  dayFiveRead.resolve(points.map(point => ({...point, day_id: 5})));
  await dayFive;
  expect(mockReconcileDayRouteHistory).toHaveBeenCalledWith(5, derived);
  expect(mockReconcileDayRouteHistory).not.toHaveBeenCalledWith(4, derived);

  dayFourRead.resolve(points);
  await dayFour;
  expect(mockReconcileDayRouteHistory).toHaveBeenCalledWith(4, derived);
});

it('checks only raw day IDs returned inside the retention window', async () => {
  mockGetGpsDayIdsWithinRetention.mockResolvedValue([9, 4]);

  await reconcileRecentRouteDays();

  expect(mockGetGpsDayIdsWithinRetention).toHaveBeenCalledWith();
  expect(mockGetLatestRawTimestamp.mock.calls).toEqual([[9], [4]]);
  expect(mockGetLatestDerivedRawTimestamp.mock.calls).toEqual([[9], [4]]);
});

it('diagnoses a failed scheduled refresh without rejecting the timer', async () => {
  jest.useFakeTimers();
  mockGetLatestDerivedRawTimestamp.mockResolvedValue(null);
  mockGetGpsPointsForDay.mockRejectedValue(new Error('database busy'));

  scheduleRouteRefresh(4);
  await expect(jest.advanceTimersByTimeAsync(15_000)).resolves.toBeUndefined();

  expect(mockDiag).toHaveBeenCalledWith(
    'route.refresh.fail',
    'Error: database busy',
    {dayId: 4},
  );
});
