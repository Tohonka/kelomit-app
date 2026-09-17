const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {migrations} from '../src/db/migrations';
import {getHealthDaily, getHealthDailyRange, upsertHealthDaily} from '../src/db/health';

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockResolvedValue({rows: [], rowsAffected: 1});
});

const lastCall = () => mockExecute.mock.calls[mockExecute.mock.calls.length - 1];

it('migration 31 creates health_daily keyed by date', () => {
  const sql = migrations.find(m => m.version === 31)?.up.join('\n') ?? '';
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS health_daily');
  expect(sql).toContain('date TEXT PRIMARY KEY');
  expect(sql).toContain('synced_at TEXT NOT NULL');
  expect(sql).not.toContain('day_id');
});

it('upserts by date and bumps updated_at', async () => {
  await upsertHealthDaily({
    date: '2026-09-16', steps: 8432, distance_m: 6100.5, sleep_minutes: 432,
    sleep_start: 's', sleep_end: 'e', weight_kg: 82.4, height_cm: null, active_kcal: 540,
    total_kcal: 2410, resting_hr: 52, exercise: [{type: 79, minutes: 30}], synced_at: 'now',
  });
  expect(lastCall()[0]).toContain('ON CONFLICT(date) DO UPDATE SET');
  expect(lastCall()[0]).toContain("updated_at = datetime('now')");
  // An import without the exercise permission must not wipe stored sessions.
  expect(lastCall()[0]).toContain('exercise = COALESCE(excluded.exercise, health_daily.exercise)');
  expect(lastCall()[1]).toEqual(['2026-09-16', 8432, 6100.5, 432, 's', 'e', 82.4, null, 540, 2410, 52, '[{"type":79,"minutes":30}]', 'now']);
});

it('reads one day and a range, mapping rows', async () => {
  mockExecute.mockResolvedValueOnce({rows: []});
  expect(await getHealthDaily('2026-09-16')).toBeNull();
  mockExecute.mockResolvedValueOnce({rows: [{date: '2026-09-15', steps: 1, distance_m: null, sleep_minutes: null,
    sleep_start: null, sleep_end: null, weight_kg: null, height_cm: null, active_kcal: null, total_kcal: null,
    resting_hr: null, exercise: '[{"type":56,"minutes":20}]', synced_at: 'n', created_at: 'c', updated_at: 'u'}]});
  const rows = await getHealthDailyRange('2026-09-01', '2026-09-16');
  expect(lastCall()[0]).toContain('WHERE date >= ? AND date <= ? ORDER BY date ASC');
  expect(lastCall()[1]).toEqual(['2026-09-01', '2026-09-16']);
  expect(rows[0]).toMatchObject({date: '2026-09-15', steps: 1, weight_kg: null, exercise: [{type: 56, minutes: 20}]});
});
