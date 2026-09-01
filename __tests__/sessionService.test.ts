const mockWrite = jest.fn();
const mockRead = jest.fn();
const mockClear = jest.fn();
const mockCreateEntry = jest.fn();
const mockUpdateEntry = jest.fn();
const mockGetEntry = jest.fn();
const mockGetTimerParentId = jest.fn();
const mockClearTimerParent = jest.fn();

jest.mock('../src/db/activeSession', () => ({
  readActiveSession: (...a: unknown[]) => mockRead(...a),
  writeActiveSession: (...a: unknown[]) => mockWrite(...a),
  clearActiveSession: (...a: unknown[]) => mockClear(...a),
}));
jest.mock('../src/db/days', () => ({
  getOrCreateDay: jest.fn(async () => ({id: 42, date: '2026-08-06'})),
}));
jest.mock('../src/db/entries', () => ({
  createEntry: (...a: unknown[]) => mockCreateEntry(...a),
  updateEntry: (...a: unknown[]) => mockUpdateEntry(...a),
  getEntry: (...a: unknown[]) => mockGetEntry(...a),
}));
jest.mock('../src/services/timerSubnotes', () => ({
  getTimerParentId: (...a: unknown[]) => mockGetTimerParentId(...a),
  clearTimerParent: (...a: unknown[]) => mockClearTimerParent(...a),
}));
jest.mock('../src/db/tags', () => ({
  getOrCreateTag: jest.fn(async (name: string) => ({id: 1, name})),
}));
jest.mock('../src/db/projects', () => ({
  getAllProjects: jest.fn(async () => [{id: 5, name: 'Banana', type: 'work', archived: false}]),
}));
jest.mock('../src/services/gpsService', () => ({
  getLastKnownPosition: () => null,
}));
jest.mock('../src/native/widgetSession', () => ({
  isWidgetBridgeAvailable: () => false,
  nativeGetPendingSessions: async () => [],
  nativeClearPendingSessions: async () => {},
}));
jest.mock('../src/i18n', () => ({t: (k: string) => k}));

import {cancelSession, pauseSession, resumeSession, stopSession} from '../src/services/sessionService';

const runningSession = (over = {}) => ({
  started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  project_id: 5, activity_type: 'work', tags: [], title: null,
  source: 'timer', name: 'Banana', accumulated_ms: 0, paused_at: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateEntry.mockResolvedValue({id: 9, tally: 3, day_id: 42});
  mockGetTimerParentId.mockResolvedValue(null);
});

it('pause logs the segment and keeps a paused session', async () => {
  mockRead.mockResolvedValue(runningSession());
  const result = await pauseSession();
  expect(result.dayId).toBe(42);
  expect(mockCreateEntry).toHaveBeenCalled();          // segment note written
  expect(mockClear).not.toHaveBeenCalled();            // session survives
  const written = mockWrite.mock.calls[0][0];
  expect(written.paused_at).toBeTruthy();
  expect(written.accumulated_ms).toBeGreaterThanOrEqual(10 * 60_000 - 2000);
});

it('untitled segment gets a name+tally title', async () => {
  mockRead.mockResolvedValue(runningSession());
  await pauseSession();
  expect(mockUpdateEntry).toHaveBeenCalledWith(9, {title: 'Banana #3'});
});

it('a user-set title is kept', async () => {
  mockRead.mockResolvedValue(runningSession({title: 'my thing'}));
  await pauseSession();
  expect(mockUpdateEntry).not.toHaveBeenCalled();
});

it('resume restarts the running segment', async () => {
  mockRead.mockResolvedValue(runningSession({paused_at: new Date().toISOString(), accumulated_ms: 5000}));
  const s = await resumeSession();
  expect(s?.paused_at).toBeNull();
  expect(s?.accumulated_ms).toBe(5000);
  expect(mockWrite).toHaveBeenCalled();
});

it('pause while paused is a no-op', async () => {
  mockRead.mockResolvedValue(runningSession({paused_at: new Date().toISOString()}));
  const result = await pauseSession();
  expect(result).toEqual({entry: null, dayId: null});
  expect(mockCreateEntry).not.toHaveBeenCalled();
});

it('stop while paused clears without logging', async () => {
  mockRead.mockResolvedValue(runningSession({paused_at: new Date().toISOString(), accumulated_ms: 5000}));
  const result = await stopSession();
  expect(result).toEqual({entry: null, dayId: null});
  expect(mockCreateEntry).not.toHaveBeenCalled();
  expect(mockClear).toHaveBeenCalled();
});

describe('timer subnotes (lazy parent row)', () => {
  it('pause finalizes the lazy parent row instead of creating a second note', async () => {
    const session = runningSession();
    mockRead.mockResolvedValue(session);
    mockGetTimerParentId.mockResolvedValue(7);
    mockGetEntry.mockResolvedValue({id: 7, tally: 4, time_from: session.started_at, time_to: null, day_id: 42});
    const result = await pauseSession();
    expect(mockCreateEntry).not.toHaveBeenCalled();
    expect(mockUpdateEntry).toHaveBeenCalledWith(7, expect.objectContaining({time_to: expect.any(String)}));
    expect(mockUpdateEntry).toHaveBeenCalledWith(7, {title: 'Banana #4'});
    expect(mockClearTimerParent).toHaveBeenCalled();
    expect(result.entry?.id).toBe(7);
    expect(result.dayId).toBe(42);
  });

  it('a lazy row from another segment is left alone; a fresh note is created', async () => {
    mockRead.mockResolvedValue(runningSession());
    mockGetTimerParentId.mockResolvedValue(7);
    mockGetEntry.mockResolvedValue({id: 7, tally: 4, time_from: '2020-01-01T00:00:00.000Z', time_to: null});
    await stopSession();
    expect(mockCreateEntry).toHaveBeenCalled();
    expect(mockUpdateEntry).not.toHaveBeenCalledWith(7, expect.objectContaining({time_to: expect.any(String)}));
    expect(mockClearTimerParent).toHaveBeenCalled();
  });

  it('cancel with captured subnotes logs the segment like a stop', async () => {
    const session = runningSession();
    mockRead.mockResolvedValue(session);
    mockGetTimerParentId.mockResolvedValue(7);
    mockGetEntry.mockResolvedValue({id: 7, tally: 4, time_from: session.started_at, time_to: null});
    const result = await cancelSession();
    expect(mockUpdateEntry).toHaveBeenCalledWith(7, expect.objectContaining({time_to: expect.any(String)}));
    expect(mockClear).toHaveBeenCalled();
    expect(result.dayId).toBe(42);
  });

  it('cancel without subnotes drops the session and clears the KV', async () => {
    mockRead.mockResolvedValue(runningSession());
    const result = await cancelSession();
    expect(result).toEqual({entry: null, dayId: null});
    expect(mockCreateEntry).not.toHaveBeenCalled();
    expect(mockClearTimerParent).toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalled();
  });
});
