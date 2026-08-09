let watchCallback: ((position: unknown) => void) | null = null;
const mockWatchPosition = jest.fn((callback: (position: unknown) => void) => {
  watchCallback = callback;
  return 9;
});
const mockStartNative = jest.fn();
const mockStopNative = jest.fn();
const mockReadFixBuffer = jest.fn().mockResolvedValue([]);
const mockAckFixBuffer = jest.fn();
const mockInsertGpsPoint = jest.fn();
const mockGetOrCreateDay = jest.fn();
const mockScheduleRouteRefresh = jest.fn();
const mockRefreshRouteDay = jest.fn();
let mockBackgroundTracking = true;
let mockPausedUntil = 0;

const mockGetCurrentPosition = jest.fn();
jest.mock('@react-native-community/geolocation', () => ({
  setRNConfiguration: jest.fn(),
  watchPosition: (callback: (position: unknown) => void) =>
    mockWatchPosition(callback),
  clearWatch: jest.fn(),
  getCurrentPosition: (
    success: (position: unknown) => void,
    error: (err: unknown) => void,
    options: unknown,
  ) => mockGetCurrentPosition(success, error, options),
}));
jest.mock('react-native-permissions', () => ({
  check: jest.fn().mockResolvedValue('granted'),
  request: jest.fn().mockResolvedValue('granted'),
  PERMISSIONS: {ANDROID: {ACCESS_FINE_LOCATION: 'fine'}, IOS: {LOCATION_WHEN_IN_USE: 'when'}},
  RESULTS: {GRANTED: 'granted', DENIED: 'denied'},
}));
jest.mock('../src/native/backgroundLocation', () => ({
  isBackgroundLocationAvailable: () => true,
  startBackgroundLocationService: (...args: unknown[]) => mockStartNative(...args),
  stopBackgroundLocationService: (...args: unknown[]) => mockStopNative(...args),
  subscribeBackgroundLocation: () => ({remove: jest.fn()}),
  readNativeFixBuffer: (...args: unknown[]) => mockReadFixBuffer(...args),
  ackNativeFixBuffer: (...args: unknown[]) => mockAckFixBuffer(...args),
  parseFixLine: (line: string) => JSON.parse(line),
  getTrackingPauseState: jest.fn(async () => ({pausedUntilMs: mockPausedUntil})),
}));
jest.mock('../src/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({background_tracking: mockBackgroundTracking}),
  },
}));
const mockGetLocations = jest.fn().mockResolvedValue([]);
jest.mock('../src/db/locations', () => ({
  getLocations: (...args: unknown[]) => mockGetLocations(...args),
}));
jest.mock('../src/services/permissionService', () => ({
  ensureActivityRecognitionPermission: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/services/diag', () => ({diag: jest.fn()}));
jest.mock('../src/db/gps', () => ({
  insertGpsPoint: (...args: unknown[]) => mockInsertGpsPoint(...args),
}));
jest.mock('../src/db/days', () => ({
  getOrCreateDay: (...args: unknown[]) => mockGetOrCreateDay(...args),
}));
jest.mock('../src/services/crossingStore', () => ({recordCrossing: jest.fn()}));
jest.mock('../src/services/routeHistoryService', () => ({
  scheduleRouteRefresh: (...args: unknown[]) =>
    mockScheduleRouteRefresh(...args),
  refreshRouteDay: (...args: unknown[]) => mockRefreshRouteDay(...args),
}));

import {startTracking, stopTracking} from '../src/services/gpsService';

function emitPosition(position: unknown): void {
  if (!watchCallback) {
    throw new Error('GPS watch was not armed');
  }
  watchCallback(position);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBackgroundTracking = true;
  mockPausedUntil = 0;
  watchCallback = null;
  mockGetLocations.mockResolvedValue([]);
  mockReadFixBuffer.mockResolvedValue([]);
  mockInsertGpsPoint.mockResolvedValue(undefined);
  mockGetOrCreateDay.mockResolvedValue({id: 1});
  mockRefreshRouteDay.mockResolvedValue(undefined);
});

afterEach(() => {
  stopTracking();
});

it('uses only the native location request when background tracking is enabled', async () => {
  await startTracking(75_000);

  expect(mockStartNative).toHaveBeenCalledWith(75_000);
  expect(mockWatchPosition).not.toHaveBeenCalled();

});

it('startTracking no-ops while tracking is paused', async () => {
  mockPausedUntil = Date.now() + 60_000;
  await startTracking(60_000);
  expect(mockWatchPosition).not.toHaveBeenCalled();
  expect(mockStartNative).not.toHaveBeenCalled();
});

it('acknowledges buffered fixes only after SQLite persistence', async () => {
  mockReadFixBuffer.mockResolvedValue([JSON.stringify({
    latitude: 60.1,
    longitude: 24.9,
    accuracy: 5,
    altitude: null,
    speed: 1.2,
    timestamp: Date.parse('2026-07-23T05:00:00.000Z'),
  })]);

  await startTracking(75_000);

  expect(mockInsertGpsPoint).toHaveBeenCalled();
  expect(mockAckFixBuffer).toHaveBeenCalledWith(1);
  expect(mockInsertGpsPoint.mock.invocationCallOrder[0])
    .toBeLessThan(mockAckFixBuffer.mock.invocationCallOrder[0]);
});

it('leaves an unpersisted buffered fix available for retry', async () => {
  mockReadFixBuffer.mockResolvedValue([JSON.stringify({
    latitude: 60.1,
    longitude: 24.9,
    accuracy: 5,
    altitude: null,
    speed: 1.2,
    timestamp: Date.parse('2026-07-23T05:00:00.000Z'),
  })]);
  mockInsertGpsPoint.mockRejectedValue(new Error('disk full'));

  await startTracking(75_000);

  expect(mockAckFixBuffer).not.toHaveBeenCalled();
});

it('schedules only a live fix that was durably stored', async () => {
  mockBackgroundTracking = false;
  await startTracking(75_000);

  emitPosition({
    coords: {
      latitude: 60.1,
      longitude: 24.9,
      accuracy: 5,
      altitude: null,
      speed: 1.2,
    },
    timestamp: Date.parse('2026-07-23T05:00:00.000Z'),
  });
  await new Promise<void>(resolve => setImmediate(() => resolve()));

  expect(mockScheduleRouteRefresh).toHaveBeenCalledWith(1);
  expect(mockInsertGpsPoint.mock.invocationCallOrder[0])
    .toBeLessThan(mockScheduleRouteRefresh.mock.invocationCallOrder[0]);

  stopTracking();
  jest.clearAllMocks();
  watchCallback = null;
  await startTracking(75_000);
  emitPosition({
    coords: {
      latitude: 60.1,
      longitude: 24.9,
      accuracy: 80,
      altitude: null,
      speed: null,
    },
    timestamp: Date.parse('2026-07-23T05:01:00.000Z'),
  });
  await new Promise<void>(resolve => setImmediate(() => resolve()));

  expect(mockInsertGpsPoint).not.toHaveBeenCalled();
  expect(mockScheduleRouteRefresh).not.toHaveBeenCalled();
});

it('acknowledges buffered lines before refreshing each affected day once', async () => {
  mockReadFixBuffer.mockResolvedValue([
    JSON.stringify({
      latitude: 60.1,
      longitude: 24.9,
      accuracy: 5,
      altitude: null,
      speed: 1.2,
      timestamp: Date.parse('2026-07-22T05:00:00.000Z'),
    }),
    JSON.stringify({
      latitude: 60.2,
      longitude: 24.8,
      accuracy: 5,
      altitude: null,
      speed: 1.2,
      timestamp: Date.parse('2026-07-22T05:01:00.000Z'),
    }),
    JSON.stringify({
      latitude: 60.3,
      longitude: 24.7,
      accuracy: 5,
      altitude: null,
      speed: 1.2,
      timestamp: Date.parse('2026-07-23T05:00:00.000Z'),
    }),
  ]);
  mockGetOrCreateDay.mockImplementation(async (date: string) => ({
    id: date === '2026-07-22' ? 22 : 23,
  }));

  await startTracking(75_000);

  expect(mockAckFixBuffer).toHaveBeenCalledWith(3);
  expect(mockRefreshRouteDay.mock.calls).toEqual([[22], [23]]);
  expect(mockAckFixBuffer.mock.invocationCallOrder[0])
    .toBeLessThan(mockRefreshRouteDay.mock.invocationCallOrder[0]);
});

it('keeps buffered lines acknowledged when a route refresh fails', async () => {
  mockReadFixBuffer.mockResolvedValue([JSON.stringify({
    latitude: 60.1,
    longitude: 24.9,
    accuracy: 5,
    altitude: null,
    speed: 1.2,
    timestamp: Date.parse('2026-07-23T05:00:00.000Z'),
  })]);
  mockRefreshRouteDay.mockRejectedValue(new Error('database busy'));

  await expect(startTracking(75_000)).resolves.toBeUndefined();

  expect(mockAckFixBuffer).toHaveBeenCalledWith(1);
  expect(mockRefreshRouteDay).toHaveBeenCalledWith(1);
});

// Tests for detectionFromPosition
import {detectionFromPosition} from '../src/services/gpsService';
import type {SavedLocation} from '../src/types';

const place = (over: Partial<SavedLocation>): SavedLocation => ({
  id: 1, name: 'x', kind: 'work', latitude: 60.45, longitude: 22.26,
  radius_m: 150, created_at: '', updated_at: '', ...over,
});

describe('detectionFromPosition', () => {
  it('returns the kind of the place containing the position', () => {
    const pos = {latitude: 60.45, longitude: 22.26};
    expect(detectionFromPosition(pos, [place({kind: 'work'})])).toBe('work');
  });

  it('prefers work over home when inside both', () => {
    const pos = {latitude: 60.45, longitude: 22.26};
    expect(
      detectionFromPosition(pos, [
        place({id: 2, kind: 'home'}),
        place({id: 1, kind: 'work'}),
      ]),
    ).toBe('work');
  });

  it('returns unknown outside every radius', () => {
    const pos = {latitude: 60.46, longitude: 22.28}; // ~1.5 km away
    expect(detectionFromPosition(pos, [place({kind: 'work'})])).toBe('unknown');
  });

  it('returns unknown with no position', () => {
    expect(detectionFromPosition(null, [place({})])).toBe('unknown');
  });
});

// Tests for the Home-label seed: the native service requests no location
// updates while parked (IDLE), so without an active one-shot the label
// would stick on Unknown after every app start at home/work.
import {
  ensureDetectionSeed,
  getCurrentGeofenceDetection,
} from '../src/services/gpsService';

describe('ensureDetectionSeed', () => {
  it('seeds detection with a one-shot fix when no live fix exists', async () => {
    mockGetLocations.mockResolvedValue([place({kind: 'work'})]);
    mockGetCurrentPosition.mockImplementation((success: (p: unknown) => void) =>
      success({
        coords: {latitude: 60.45, longitude: 22.26, accuracy: 20},
        timestamp: Date.now(),
      }),
    );

    expect(getCurrentGeofenceDetection()).toBe('unknown');
    await ensureDetectionSeed();
    expect(getCurrentGeofenceDetection()).toBe('work');
  });

  it('does not re-request within the cooldown after a failed lookup', async () => {
    mockGetCurrentPosition.mockImplementation(
      (_s: unknown, error: (e: unknown) => void) =>
        error({code: 2, message: 'unavailable'}),
    );

    await ensureDetectionSeed();
    // One seed = high-accuracy try + low-accuracy fallback.
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(2);
    await ensureDetectionSeed();
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('is a no-op once a position is known', async () => {
    mockGetLocations.mockResolvedValue([place({kind: 'home'})]);
    mockGetCurrentPosition.mockImplementation((success: (p: unknown) => void) =>
      success({
        coords: {latitude: 60.45, longitude: 22.26, accuracy: 20},
        timestamp: Date.now(),
      }),
    );

    await ensureDetectionSeed();
    expect(getCurrentGeofenceDetection()).toBe('home');
    await ensureDetectionSeed();
    // Still just the one lookup (2 calls would mean a second one-shot ran).
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
