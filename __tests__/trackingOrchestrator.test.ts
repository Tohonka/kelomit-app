const mockSyncPlaces = jest.fn();
const mockStartTracking = jest.fn();
const mockStopTracking = jest.fn();
const mockStopNative = jest.fn();
const mockReconcile = jest.fn();
const mockReconcileRouteDays = jest.fn();
const mockGetSetting = jest.fn();
const mockSetSetting = jest.fn();
let nativeListener: (() => void) | null = null;

jest.mock('../src/native/backgroundLocation', () => ({
  syncPlaces: (...args: unknown[]) => mockSyncPlaces(...args),
  stopBackgroundLocationService: (...args: unknown[]) => mockStopNative(...args),
  subscribeNativeEventAvailable: (cb: () => void) => {
    nativeListener = cb;
    return {remove: jest.fn()};
  },
}));
jest.mock('../src/services/gpsService', () => ({
  startTracking: (...args: unknown[]) => mockStartTracking(...args),
  stopTracking: (...args: unknown[]) => mockStopTracking(...args),
}));
jest.mock('../src/services/nativeEventSync', () => ({
  reconcileNativeEvents: (...args: unknown[]) => mockReconcile(...args),
}));
jest.mock('../src/services/routeHistoryService', () => ({
  reconcileRecentRouteDays: (...args: unknown[]) =>
    mockReconcileRouteDays(...args),
}));
jest.mock('../src/db/settings', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}));

import {
  reconcileRouteHistory,
  reconcileTrackingJournal,
  subscribeTrackingJournal,
  syncSavedPlaces,
  syncTrackingState,
} from '../src/services/trackingOrchestrator';

const locations = [{
  id: 2,
  name: 'Workshop',
  kind: 'work' as const,
  latitude: 60.1,
  longitude: 24.9,
  radius_m: 35,
  created_at: '',
  updated_at: '',
}];

beforeEach(() => {
  jest.clearAllMocks();
  nativeListener = null;
  mockGetSetting.mockResolvedValue('3');
  mockSetSetting.mockResolvedValue(undefined);
});

it('syncs the full place set before starting native background tracking', async () => {
  await syncTrackingState({
    gps_enabled: true,
    background_tracking: true,
    gps_interval_ms: 75_000,
  }, locations);

  expect(mockSyncPlaces).toHaveBeenCalledWith([{
    id: 2,
    kind: 'work',
    latitude: 60.1,
    longitude: 24.9,
    radius: 35,
  }]);
  expect(mockStartTracking).toHaveBeenCalledWith(75_000);
  expect(mockSyncPlaces.mock.invocationCallOrder[0])
    .toBeLessThan(mockStartTracking.mock.invocationCallOrder[0]);
});

it('replaces the full persisted place set after a mutation', async () => {
  await syncSavedPlaces([]);
  expect(mockSyncPlaces).toHaveBeenCalledWith([]);
});

it('disables native monitoring when GPS is disabled', async () => {
  await syncTrackingState({
    gps_enabled: false,
    background_tracking: false,
    gps_interval_ms: 60_000,
  }, locations);
  expect(mockStopTracking).toHaveBeenCalled();
  expect(mockStopNative).toHaveBeenCalled();
  expect(mockStartTracking).not.toHaveBeenCalled();
});

it('reconciles on foreground calls and live native events', async () => {
  mockReconcile.mockResolvedValue(undefined);
  await reconcileTrackingJournal();
  const sub = subscribeTrackingJournal();
  nativeListener?.();
  await Promise.resolve();

  expect(mockReconcile).toHaveBeenCalledTimes(2);
  expect(sub.remove).toEqual(expect.any(Function));
});

it('uses ordinary stale checks after version 3 is recorded', async () => {
  mockReconcileRouteDays.mockResolvedValue(undefined);

  await reconcileRouteHistory();

  expect(mockReconcileRouteDays).toHaveBeenCalledWith(false);
  expect(mockSetSetting).not.toHaveBeenCalled();
});

it('forces retained route derivation once per algorithm version', async () => {
  mockGetSetting.mockResolvedValue('2');
  mockReconcileRouteDays.mockResolvedValue(undefined);

  await reconcileRouteHistory();

  expect(mockReconcileRouteDays).toHaveBeenCalledWith(true);
  expect(mockSetSetting).toHaveBeenCalledWith('route_derivation_version', '3');
  expect(mockReconcileRouteDays.mock.invocationCallOrder[0])
    .toBeLessThan(mockSetSetting.mock.invocationCallOrder[0]);
});
