const mockExecute = jest.fn();
jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));
const mockSettings: Record<string, string> = {};
jest.mock('../src/db/settings', () => ({
  getSetting: jest.fn(async (k: string) => mockSettings[k] ?? null),
  setSetting: jest.fn(async (k: string, v: string) => { mockSettings[k] = v; }),
}));

import {migrations} from '../src/db/migrations';
import {
  upsertAppUseTotals, unassignedAppUseSeconds, assignAppUse, detachAppUse, setAppUseExcluded,
} from '../src/db/appUse';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockSettings)) { delete mockSettings[k]; }
  mockExecute.mockResolvedValue({rows: [], rowsAffected: 1});
});

const calls = () => mockExecute.mock.calls as [string, unknown[]][];

it('migration 36 creates app_use + app_use_assignments', () => {
  const sql = migrations.find(m => m.version === 36)?.up.join('\n') ?? '';
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS app_use (');
  expect(sql).toContain('UNIQUE (date, bundle_id, session_from)');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS app_use_assignments (');
  expect(sql).toContain('REFERENCES entries(id) ON DELETE CASCADE');
  expect(sql).toContain('BEFORE DELETE ON entries');
  expect(migrations[migrations.length - 1].version).toBe(36);
});

describe('upsertAppUseTotals', () => {
  it('upserts each non-empty row on the unique key, then resolves timer buckets', async () => {
    const n = await upsertAppUseTotals('2026-09-28', [
      {bundle_id: 'com.google.Chrome', app_name: 'Google Chrome', session_from: '', active_sec: 600, idle_sec: 60},
      {bundle_id: 'com.apple.Terminal', app_name: 'Terminal', session_from: '', active_sec: 0, idle_sec: 0},
      {bundle_id: 'junk'},
      {bundle_id: 'neg', app_name: 'N', session_from: '', active_sec: -5, idle_sec: 10},
    ]);
    expect(n).toBe(1);
    const [insertSql, insertArgs] = calls()[0];
    expect(insertSql).toContain('ON CONFLICT(date, bundle_id, session_from) DO UPDATE');
    expect(insertArgs).toEqual(['2026-09-28', 'com.google.Chrome', 'Google Chrome', '', 600, 60]);
    const [resolveSql, resolveArgs] = calls()[1];
    expect(resolveSql).toContain('e.time_from = app_use.session_from');
    expect(resolveSql).toContain('detached = 0');
    expect(resolveArgs).toEqual(['2026-09-28']);
  });
});

describe('assignAppUse', () => {
  it('refuses more than the unassigned amount', async () => {
    mockExecute.mockResolvedValueOnce({rows: [{free: 120}]});
    await expect(assignAppUse('2026-09-28', 'com.google.Chrome', 5, 300)).rejects.toThrow('only 120s unassigned');
  });
  it('inserts a chunk and returns its id', async () => {
    mockExecute.mockResolvedValueOnce({rows: [{free: 600}]});
    mockExecute.mockResolvedValueOnce({rows: [{id: 9}]});
    await expect(assignAppUse('2026-09-28', 'com.google.Chrome', 5, 300)).resolves.toBe(9);
    expect(calls()[1][1]).toEqual(['2026-09-28', 'com.google.Chrome', 5, 300]);
  });
  it('rejects non-positive seconds before touching the db', async () => {
    await expect(assignAppUse('2026-09-28', 'x', 1, 0)).rejects.toThrow('positive');
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

it('unassignedAppUseSeconds never goes below zero', async () => {
  mockExecute.mockResolvedValueOnce({rows: [{free: -30}]});
  await expect(unassignedAppUseSeconds('2026-09-28', 'x')).resolves.toBe(0);
});

it('detachAppUse clears the note and marks the row detached', async () => {
  await detachAppUse(4);
  const [sql, args] = calls()[0];
  expect(sql).toContain('entry_id = NULL, detached = 1');
  expect(args).toEqual([4]);
});

describe('setAppUseExcluded', () => {
  it('adds and removes a bundle id in the setting', async () => {
    await expect(setAppUseExcluded('com.a', true)).resolves.toEqual(['com.a']);
    await expect(setAppUseExcluded('com.b', true)).resolves.toEqual(['com.a', 'com.b']);
    await expect(setAppUseExcluded('com.a', false)).resolves.toEqual(['com.b']);
    expect(mockSettings.app_use_excluded).toBe('["com.b"]');
  });
});
