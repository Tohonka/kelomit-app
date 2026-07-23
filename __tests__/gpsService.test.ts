const mockWatchPosition = jest.fn((..._args: unknown[]) => 9);
const mockStartNative = jest.fn();
const mockStopNative = jest.fn();

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
  readNativeFixBuffer: jest.fn().mockResolvedValue([]),
  ackNativeFixBuffer: jest.fn(),
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
jest.mock('../src/db/gps', () => ({insertGpsPoint: jest.fn()}));
jest.mock('../src/db/days', () => ({
  getOrCreateDay: jest.fn().mockResolvedValue({id: 1}),
}));
jest.mock('../src/services/crossingStore', () => ({recordCrossing: jest.fn()}));

import {startTracking, stopTracking} from '../src/services/gpsService';

it('uses only the native location request when background tracking is enabled', async () => {
  await startTracking(75_000);

  expect(mockStartNative).toHaveBeenCalledWith(75_000);
  expect(mockWatchPosition).not.toHaveBeenCalled();

  stopTracking();
});
