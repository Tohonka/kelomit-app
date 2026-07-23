const mockWatchPosition = jest.fn((..._args: unknown[]) => 9);
const mockStartNative = jest.fn();
const mockStopNative = jest.fn();
const mockReadFixBuffer = jest.fn().mockResolvedValue([]);
const mockAckFixBuffer = jest.fn();
const mockInsertGpsPoint = jest.fn();

jest.mock('@react-native-community/geolocation', () => ({
  setRNConfiguration: jest.fn(),
  watchPosition: (...args: unknown[]) => mockWatchPosition(...args),
  clearWatch: jest.fn(),
  getCurrentPosition: jest.fn(),
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
}));
jest.mock('../src/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({background_tracking: true}),
  },
}));
jest.mock('../src/db/locations', () => ({getLocations: jest.fn().mockResolvedValue([])}));
jest.mock('../src/services/permissionService', () => ({
  ensureActivityRecognitionPermission: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/services/diag', () => ({diag: jest.fn()}));
jest.mock('../src/db/gps', () => ({
  insertGpsPoint: (...args: unknown[]) => mockInsertGpsPoint(...args),
}));
jest.mock('../src/db/days', () => ({
  getOrCreateDay: jest.fn().mockResolvedValue({id: 1}),
}));
jest.mock('../src/services/crossingStore', () => ({recordCrossing: jest.fn()}));

import {startTracking, stopTracking} from '../src/services/gpsService';

beforeEach(() => {
  jest.clearAllMocks();
  mockReadFixBuffer.mockResolvedValue([]);
  mockInsertGpsPoint.mockResolvedValue(undefined);
});

it('uses only the native location request when background tracking is enabled', async () => {
  await startTracking(75_000);

  expect(mockStartNative).toHaveBeenCalledWith(75_000);
  expect(mockWatchPosition).not.toHaveBeenCalled();

  stopTracking();
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
  stopTracking();
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
  stopTracking();
});
