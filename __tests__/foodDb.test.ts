const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {migrations} from '../src/db/migrations';
import {
  createFoodEntry, updateFoodEntry, deleteFoodEntry, getFoodEntriesForDay, getFoodEntry,
  getRecentFoodEntries, upsertProduct, getProductByBarcode, getProduct, searchProducts, getProductBySourceRef, getFoodKcalByDay,
} from '../src/db/food';

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockResolvedValue({rows: [], rowsAffected: 1});
});

const lastCall = () => mockExecute.mock.calls[mockExecute.mock.calls.length - 1];

const row = {
  id: 7, day_id: 3, eaten_at: '2026-09-15T08:30:00.000Z', name: 'Ruisleipä', kcal: 180,
  product_id: null, quantity: null, unit: null, note: null, file_path: null, thumbnail_path: null,
  latitude: null, longitude: null, location_label: null, created_at: 'c', updated_at: 'u',
};

it('migration 30 creates food_products + food_entries and is the latest', () => {
  const sql = migrations.find(m => m.version === 30)?.up.join('\n') ?? '';
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS food_products');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS food_entries');
  expect(sql).toContain('REFERENCES days(id) ON DELETE CASCADE');
  expect(sql).toContain('REFERENCES food_products(id) ON DELETE SET NULL');
  expect(sql).toContain("CHECK(source IN ('user','off','fineli'))");
  expect(sql).toContain("CHECK(unit IN ('g','ml','serving','piece'))");
  expect(sql).toContain('idx_food_entries_day');
  expect(migrations[migrations.length - 1].version).toBe(34);
});

it('creates with defaults and maps the row', async () => {
  mockExecute.mockResolvedValueOnce({rows: [row]});
  const e = await createFoodEntry({day_id: 3, eaten_at: row.eaten_at, name: ' Ruisleipä ', kcal: 180});
  expect(lastCall()[0]).toContain('INSERT INTO food_entries');
  expect(lastCall()[1]).toEqual([3, row.eaten_at, 'Ruisleipä', 180, null, null, null, null, null, null, null, null, null]);
  expect(e).toMatchObject({id: 7, name: 'Ruisleipä', kcal: 180, product_id: null});
});

it('updates only given fields and bumps updated_at; empty patch is a no-op', async () => {
  await updateFoodEntry(7, {name: 'X', kcal: null});
  expect(lastCall()[0]).toContain("SET name = ?, kcal = ?, updated_at = datetime('now') WHERE id = ?");
  expect(lastCall()[1]).toEqual(['X', null, 7]);
  mockExecute.mockClear();
  await updateFoodEntry(7, {});
  expect(mockExecute).not.toHaveBeenCalled();
});

it('reads a day ordered by eaten_at, a single entry, and recents since a timestamp', async () => {
  await getFoodEntriesForDay(3);
  expect(lastCall()[0]).toContain('WHERE day_id = ? ORDER BY eaten_at ASC');
  expect(lastCall()[1]).toEqual([3]);
  mockExecute.mockResolvedValueOnce({rows: []});
  expect(await getFoodEntry(99)).toBeNull();
  await getRecentFoodEntries('2026-07-17T00:00:00.000Z');
  expect(lastCall()[0]).toContain('WHERE eaten_at >= ? ORDER BY eaten_at DESC');
  expect(lastCall()[1]).toEqual(['2026-07-17T00:00:00.000Z']);
});

it('deletes by id', async () => {
  await deleteFoodEntry(7);
  expect(lastCall()[0]).toContain('DELETE FROM food_entries WHERE id = ?');
  expect(lastCall()[1]).toEqual([7]);
});

describe('products', () => {
  const productRow = {
    id: 4, barcode: '6408430039517', name: 'Oltermanni 17%', brand: 'Valio', kcal_per_100: 272,
    kcal_per_serving: 27.2, protein_per_100: 29, carbs_per_100: 0, fat_per_100: 17, serving_g: 10,
    serving_label: '10 g', source: 'off', source_ref: '6408430039517', image_url: null, archived: 0,
    created_at: 'c', updated_at: 'u',
  };

  it('upserts by barcode with RETURNING and maps the row', async () => {
    mockExecute.mockResolvedValueOnce({rows: [productRow]});
    const p = await upsertProduct({
      barcode: '6408430039517', name: ' Oltermanni 17% ', brand: 'Valio', kcal_per_100: 272,
      kcal_per_serving: 27.2, protein_per_100: 29, carbs_per_100: 0, fat_per_100: 17, serving_g: 10,
      serving_label: '10 g', source: 'off', source_ref: '6408430039517', image_url: null,
    });
    expect(lastCall()[0]).toContain('ON CONFLICT(barcode) DO UPDATE SET');
    expect(lastCall()[0]).toContain('RETURNING *');
    expect(lastCall()[1].slice(0, 3)).toEqual(['6408430039517', 'Oltermanni 17%', 'Valio']);
    expect(p).toMatchObject({id: 4, source: 'off', archived: false, kcal_per_serving: 27.2});
  });

  it('looks up by barcode (unarchived only) and by id', async () => {
    mockExecute.mockResolvedValueOnce({rows: []});
    expect(await getProductByBarcode('123')).toBeNull();
    expect(lastCall()[0]).toContain('WHERE barcode = ? AND archived = 0');
    expect(lastCall()[1]).toEqual(['123']);
    mockExecute.mockResolvedValueOnce({rows: [productRow]});
    expect((await getProduct(4))?.name).toBe('Oltermanni 17%');
  });
});

describe('product search', () => {
  it('matches name or brand, prefix first, and finds by source ref', async () => {
    await searchProducts(' olter ');
    expect(lastCall()[0]).toContain('name LIKE ? OR brand LIKE ?');
    expect(lastCall()[1]).toEqual(['%olter%', '%olter%', 'olter%', 5]);
    expect(await searchProducts('  ')).toEqual([]);
    mockExecute.mockResolvedValueOnce({rows: []});
    expect(await getProductBySourceRef('fineli', '1009')).toBeNull();
    expect(lastCall()[1]).toEqual(['fineli', '1009']);
  });
});

it('sums kcal per day over a date range', async () => {
  mockExecute.mockResolvedValueOnce({rows: [{date: '2026-09-16', kcal: 1240, entries: 4, no_kcal: 1}]});
  const out = await getFoodKcalByDay('2026-09-14', '2026-09-20');
  expect(lastCall()[0]).toContain('GROUP BY d.date');
  expect(lastCall()[1]).toEqual(['2026-09-14', '2026-09-20']);
  expect(out['2026-09-16']).toEqual({kcal: 1240, entries: 4, noKcal: 1});
});
