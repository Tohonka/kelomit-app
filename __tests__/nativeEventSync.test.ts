const mockReadNativeEvents = jest.fn();
const mockAckNativeEvents = jest.fn();
const mockGetOrCreateDay = jest.fn();
const mockUpdateDay = jest.fn();
const mockRecordCrossing = jest.fn();
const mockCreateOrReplaceNativeConfirmation = jest.fn();
const mockResolveNativeConfirmation = jest.fn();
const mockInsertActivityEvent = jest.fn();
const mockRefreshRouteDay = jest.fn();

jest.mock('../src/native/backgroundLocation', () => ({
  ...jest.requireActual('../src/native/backgroundLocation'),
  readNativeEvents: (...args: unknown[]) => mockReadNativeEvents(...args),
  ackNativeEvents: (...args: unknown[]) => mockAckNativeEvents(...args),
}));
jest.mock('../src/db/days', () => ({
  getOrCreateDay: (...args: unknown[]) => mockGetOrCreateDay(...args),
  updateDay: (...args: unknown[]) => mockUpdateDay(...args),
}));
jest.mock('../src/services/crossingStore', () => ({
  recordCrossing: (...args: unknown[]) => mockRecordCrossing(...args),
}));
jest.mock('../src/db/dayConfirmations', () => ({
  createOrReplaceNativeConfirmation: (...args: unknown[]) =>
    mockCreateOrReplaceNativeConfirmation(...args),
  resolveNativeConfirmation: (...args: unknown[]) =>
    mockResolveNativeConfirmation(...args),
}));
jest.mock('../src/db/activityEvents', () => ({
  insertActivityEvent: (...args: unknown[]) =>
    mockInsertActivityEvent(...args),
}));
jest.mock('../src/services/routeHistoryService', () => ({
  refreshRouteDay: (...args: unknown[]) => mockRefreshRouteDay(...args),
}));

import {reconcileNativeEvents} from '../src/services/nativeEventSync';

const workEnter = JSON.stringify({
  sequence: 10,
  type: 'crossing',
  locationId: 4,
  kind: 'work',
  direction: 'enter',
  timestamp: Date.parse('2026-07-23T05:00:00.000Z'),
  localDate: '2026-07-23',
  generation: 2,
  latitude: 60.1,
  longitude: 24.9,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOrCreateDay.mockResolvedValue({
    id: 7,
    date: '2026-07-23',
    started_at: null,
    ended_at: null,
    started_at_source: null,
    ended_at_source: null,
  });
  mockInsertActivityEvent.mockResolvedValue(true);
  mockRefreshRouteDay.mockResolvedValue(undefined);
});

it('persists an ordered work crossing, sets only the first start, then acknowledges', async () => {
  mockReadNativeEvents.mockResolvedValue([workEnter]);

  await reconcileNativeEvents();

  expect(mockRecordCrossing).toHaveBeenCalledWith({
    locationId: 4,
    dayId: 7,
    type: 'enter',
    latitude: 60.1,
    longitude: 24.9,
    time: '2026-07-23T05:00:00.000Z',
  });
  expect(mockUpdateDay).toHaveBeenCalledWith(7, {
    started_at: '2026-07-23T05:00:00.000Z',
    started_at_source: 'auto',
  });
  expect(mockAckNativeEvents).toHaveBeenCalledWith(10);
  expect(mockRecordCrossing.mock.invocationCallOrder[0])
    .toBeLessThan(mockAckNativeEvents.mock.invocationCallOrder[0]);
});

it('does not let a later work entry or a home crossing change work times', async () => {
  mockGetOrCreateDay.mockResolvedValue({
    id: 7,
    date: '2026-07-23',
    started_at: '2026-07-23T04:00:00.000Z',
    ended_at: null,
    started_at_source: 'auto',
    ended_at_source: null,
  });
  mockReadNativeEvents.mockResolvedValue([
    workEnter,
    JSON.stringify({
      sequence: 11,
      type: 'crossing',
      locationId: 8,
      kind: 'home',
      direction: 'exit',
      timestamp: Date.parse('2026-07-23T08:00:00.000Z'),
      localDate: '2026-07-23',
      generation: 2,
      latitude: null,
      longitude: null,
    }),
  ]);

  await reconcileNativeEvents();

  expect(mockRecordCrossing).toHaveBeenCalledTimes(2);
  expect(mockUpdateDay).not.toHaveBeenCalled();
  expect(mockAckNativeEvents).toHaveBeenCalledWith(11);
});

it('creates a token-bound prompt and accepts a native decision without overwriting an existing end', async () => {
  mockGetOrCreateDay.mockResolvedValue({
    id: 7,
    date: '2026-07-23',
    started_at: null,
    ended_at: '2026-07-23T12:00:00.000Z',
    started_at_source: null,
    ended_at_source: 'manual',
  });
  const exitTimestamp = Date.parse('2026-07-23T13:00:00.000Z');
  mockReadNativeEvents.mockResolvedValue([
    JSON.stringify({
      sequence: 20,
      type: 'day_end_prompted',
      token: 'exit-20',
      exitTimestamp,
      timestamp: exitTimestamp + 45 * 60_000,
    }),
    JSON.stringify({
      sequence: 21,
      type: 'day_end_confirmed',
      token: 'exit-20',
      exitTimestamp,
      timestamp: exitTimestamp + 46 * 60_000,
    }),
  ]);

  await reconcileNativeEvents();

  expect(mockCreateOrReplaceNativeConfirmation).toHaveBeenCalledWith(
    7,
    '2026-07-23T13:00:00.000Z',
    'exit-20',
  );
  expect(mockResolveNativeConfirmation).toHaveBeenCalledWith('exit-20', true);
  expect(mockUpdateDay).not.toHaveBeenCalled();
  expect(mockAckNativeEvents).toHaveBeenCalledWith(21);
});

it('writes an assumed end when no end exists', async () => {
  const exitTimestamp = Date.parse('2026-07-23T13:00:00.000Z');
  mockReadNativeEvents.mockResolvedValue([JSON.stringify({
    sequence: 30,
    type: 'day_end_assumed',
    token: 'exit-30',
    exitTimestamp,
    timestamp: exitTimestamp + 9 * 60 * 60_000,
  })]);

  await reconcileNativeEvents();

  expect(mockResolveNativeConfirmation).toHaveBeenCalledWith('exit-30', true);
  expect(mockUpdateDay).toHaveBeenCalledWith(7, {
    ended_at: '2026-07-23T13:00:00.000Z',
    ended_at_source: 'auto',
  });
  expect(mockAckNativeEvents).toHaveBeenCalledWith(30);
});

it('does not acknowledge malformed, out-of-order, or failed persistence', async () => {
  mockReadNativeEvents.mockResolvedValue([workEnter, '{"broken":true}']);
  await expect(reconcileNativeEvents()).rejects.toThrow('Malformed native event');
  expect(mockAckNativeEvents).not.toHaveBeenCalled();

  mockReadNativeEvents.mockResolvedValue([
    workEnter,
    workEnter.replace('"sequence":10', '"sequence":12'),
  ]);
  await expect(reconcileNativeEvents()).rejects.toThrow('sequence gap');
  expect(mockAckNativeEvents).not.toHaveBeenCalled();

  mockReadNativeEvents.mockResolvedValue([workEnter]);
  mockRecordCrossing.mockRejectedValueOnce(new Error('disk full'));
  await expect(reconcileNativeEvents()).rejects.toThrow('disk full');
  expect(mockAckNativeEvents).not.toHaveBeenCalled();
});

it('persists activity evidence and refreshes its route before acknowledging', async () => {
  mockReadNativeEvents.mockResolvedValue([JSON.stringify({
    sequence: 40,
    type: 'activity',
    activity: 'walking',
    transition: 'enter',
    timestamp: Date.parse('2026-07-26T17:00:00.000Z'),
  })]);

  await reconcileNativeEvents();

  expect(mockInsertActivityEvent).toHaveBeenCalledWith({
    activity: 'walking',
    transition: 'enter',
    timestamp: '2026-07-26T17:00:00.000Z',
  });
  expect(mockRefreshRouteDay).toHaveBeenCalledWith(7, {force: true});
  expect(mockInsertActivityEvent.mock.invocationCallOrder[0])
    .toBeLessThan(mockRefreshRouteDay.mock.invocationCallOrder[0]);
  expect(mockRefreshRouteDay.mock.invocationCallOrder[0])
    .toBeLessThan(mockAckNativeEvents.mock.invocationCallOrder[0]);
});
