const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({
    execute: mockExecute,
    transaction: (fn: (tx: {execute: typeof mockExecute}) => Promise<void>) => fn({execute: mockExecute}),
  }),
}));

import {migrations} from '../src/db/migrations';
import {FINELI_VERSION, FINELI_UNIT_LABELS, searchFineli, seedFineliIfNeeded} from '../src/db/fineli';

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockResolvedValue({rows: [], rowsAffected: 1});
});

const calls = () => mockExecute.mock.calls.map(c => String(c[0]));

it('migration 32 creates the two Fineli tables', () => {
  const sql = migrations.find(m => m.version === 32)?.up.join('\n') ?? '';
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS fineli_foods');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS fineli_units');
  expect(sql).toContain('REFERENCES fineli_foods(id) ON DELETE CASCADE');
});

it('bundles a real release with unit labels', () => {
  expect(FINELI_VERSION).toMatch(/^\d+\.\d+$/);
  expect(FINELI_UNIT_LABELS.KPL_M).toEqual(['keskikokoinen (kpl)', 'medium-sized piece']);
});

it('seeds when the stored version differs and records the bundled version', async () => {
  const seeded = await seedFineliIfNeeded();
  expect(seeded).toBe(true);
  const c = calls();
  expect(c).toContain('DELETE FROM fineli_foods;');
  expect(c.filter(s => s.includes('INSERT INTO fineli_foods')).length).toBeGreaterThan(4000);
  const last = mockExecute.mock.calls[mockExecute.mock.calls.length - 1];
  expect(String(last[0])).toContain('settings');
  expect(last[1]).toEqual(['fineli_version', FINELI_VERSION]);
});

it('skips seeding when the version matches', async () => {
  mockExecute.mockResolvedValueOnce({rows: [{value: FINELI_VERSION}]});
  expect(await seedFineliIfNeeded()).toBe(false);
  expect(calls().some(s => s.includes('INSERT INTO fineli_foods'))).toBe(false);
});

it('searches by name with prefix-first ordering in the UI language', async () => {
  await searchFineli('ruis', 'fi');
  const last = mockExecute.mock.calls[mockExecute.mock.calls.length - 1];
  expect(String(last[0])).toContain('WHERE name_fi LIKE ? OR name_en LIKE ?');
  expect(String(last[0])).toContain('CASE WHEN name_fi LIKE ? THEN 0');
  expect(last[1]).toEqual(['%ruis%', '%ruis%', 'ruis%', 'ruis%', 8]);
  await searchFineli('rye', 'en', 3);
  const en = mockExecute.mock.calls[mockExecute.mock.calls.length - 1];
  expect(String(en[0])).toContain('CASE WHEN name_en LIKE ? THEN 0');
  expect(en[1][4]).toBe(3);
  expect(await searchFineli('   ', 'fi')).toEqual([]);
});
