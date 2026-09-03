const mockFormat = jest.fn();
const mockGetOrCreateDay = jest.fn();
const mockGetDayByDate = jest.fn();

jest.mock('date-fns', () => ({
  ...jest.requireActual('date-fns'),
  format: (...args: unknown[]) => mockFormat(...args),
}));
jest.mock('../src/db/days', () => ({
  getOrCreateDay: (...args: unknown[]) => mockGetOrCreateDay(...args),
  getDayByDate: (...args: unknown[]) => mockGetDayByDate(...args),
  updateDay: jest.fn(),
}));
jest.mock('../src/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      prefill_from_usual: false,
      usual_start: null,
      usual_end: null,
      weekday_hours: {},
    }),
  },
}));

import {useDayStore} from '../src/store/dayStore';
import type {Day} from '../src/types';

function day(id: number, date: string, startedAt: string | null = null): Day {
  return {
    id,
    date,
    started_at: startedAt,
    ended_at: null,
    started_at_2: null,
    ended_at_2: null,
    started_at_source: null,
    ended_at_source: null,
    notes: null,
    created_at: '',
    updated_at: '',
  };
}

beforeEach(() => {
  useDayStore.setState({
    today: null,
    selectedDay: null,
    daysCache: {},
    isLoading: false,
    error: null,
  });
  jest.clearAllMocks();
});

it('replaces yesterday after midnight and returns the current day', async () => {
  mockFormat.mockReturnValueOnce('2026-07-22').mockReturnValueOnce('2026-07-23');
  mockGetOrCreateDay
    .mockResolvedValueOnce(day(22, '2026-07-22'))
    .mockResolvedValueOnce(day(23, '2026-07-23'));

  await useDayStore.getState().loadToday();
  const current = await useDayStore.getState().loadToday();

  expect(current.date).toBe('2026-07-23');
  expect(useDayStore.getState().today?.id).toBe(23);
});

it('loadDay rereads SQLite even when the day is cached (native events write behind the store)', async () => {
  useDayStore.setState({daysCache: {'2026-07-22': day(22, '2026-07-22')}});
  mockGetOrCreateDay.mockResolvedValue({
    ...day(22, '2026-07-22', '2026-07-22T06:00:00.000Z'),
    ended_at: '2026-07-22T13:04:10.000Z',
    ended_at_source: 'auto',
  });

  const fresh = await useDayStore.getState().loadDay('2026-07-22');

  expect(mockGetOrCreateDay).toHaveBeenCalledWith('2026-07-22');
  expect(fresh.ended_at).toBe('2026-07-22T13:04:10.000Z');
  expect(useDayStore.getState().daysCache['2026-07-22'].ended_at).toBe('2026-07-22T13:04:10.000Z');
});

it('rejects loadToday failures instead of returning an unusable day', async () => {
  mockFormat.mockReturnValue('2026-07-23');
  mockGetOrCreateDay.mockRejectedValue(new Error('database unavailable'));

  await expect(useDayStore.getState().loadToday()).rejects.toThrow(
    'database unavailable',
  );
  expect(useDayStore.getState().isLoading).toBe(false);
});
