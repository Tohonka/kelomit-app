import {getDB} from './database';
import type {FoodEntry, FoodProduct, FoodSource, FoodUnit} from '../types';

type RawRow = Record<string, unknown>;

function rowToFoodEntry(row: RawRow): FoodEntry {
  return {
    id: row.id as number,
    day_id: row.day_id as number,
    eaten_at: row.eaten_at as string,
    name: row.name as string,
    kcal: (row.kcal as number | null) ?? null,
    product_id: (row.product_id as number | null) ?? null,
    quantity: (row.quantity as number | null) ?? null,
    unit: (row.unit as FoodUnit | null) ?? null,
    note: (row.note as string | null) ?? null,
    file_path: (row.file_path as string | null) ?? null,
    thumbnail_path: (row.thumbnail_path as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    location_label: (row.location_label as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export interface CreateFoodEntryParams {
  day_id: number;
  eaten_at: string;
  name: string;
  kcal?: number | null;
  product_id?: number | null;
  quantity?: number | null;
  unit?: FoodUnit | null;
  note?: string | null;
  file_path?: string | null;
  thumbnail_path?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_label?: string | null;
}
export type FoodEntryFields = Partial<CreateFoodEntryParams>;

/** Builds `SET a = ?, b = ?` from the defined keys of `fields`. */
function setClause(fields: Record<string, unknown>): {sql: string; params: (string | number | null)[]} {
  const keys = Object.keys(fields).filter(k => fields[k] !== undefined);
  return {
    sql: keys.map(k => `${k} = ?`).join(', '),
    params: keys.map(k => (fields[k] ?? null) as string | number | null),
  };
}

export async function getFoodEntriesForDay(dayId: number): Promise<FoodEntry[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM food_entries WHERE day_id = ? ORDER BY eaten_at ASC;',
    [dayId],
  );
  return (result.rows ?? []).map(r => rowToFoodEntry(r as RawRow));
}

export async function getFoodEntry(id: number): Promise<FoodEntry | null> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM food_entries WHERE id = ?;', [id]);
  if (!result.rows || result.rows.length === 0) { return null; }
  return rowToFoodEntry(result.rows[0] as RawRow);
}

/** Newest-first entries eaten at/after `sinceIso` — the raw material for the
 *  recents strip (ranked in src/utils/foodMath.ts). */
export async function getRecentFoodEntries(sinceIso: string): Promise<FoodEntry[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM food_entries WHERE eaten_at >= ? ORDER BY eaten_at DESC;',
    [sinceIso],
  );
  return (result.rows ?? []).map(r => rowToFoodEntry(r as RawRow));
}

export async function createFoodEntry(params: CreateFoodEntryParams): Promise<FoodEntry> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO food_entries (
       day_id, eaten_at, name, kcal, product_id, quantity, unit, note,
       file_path, thumbnail_path, latitude, longitude, location_label
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *;`,
    [
      params.day_id,
      params.eaten_at,
      params.name.trim(),
      params.kcal ?? null,
      params.product_id ?? null,
      params.quantity ?? null,
      params.unit ?? null,
      params.note ?? null,
      params.file_path ?? null,
      params.thumbnail_path ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      params.location_label ?? null,
    ],
  );
  return rowToFoodEntry(result.rows![0] as RawRow);
}

export async function updateFoodEntry(id: number, fields: FoodEntryFields): Promise<void> {
  const {sql, params} = setClause(fields);
  if (!sql) { return; }
  const db = getDB();
  await db.execute(
    `UPDATE food_entries SET ${sql}, updated_at = datetime('now') WHERE id = ?;`,
    [...params, id],
  );
}

export async function deleteFoodEntry(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM food_entries WHERE id = ?;', [id]);
}

// ---- products (F2 barcode / F3 Fineli) ----

/** Everything about a product except the row bookkeeping. */
export type ProductFields = Omit<FoodProduct, 'id' | 'archived' | 'created_at' | 'updated_at'>;

function rowToProduct(row: RawRow): FoodProduct {
  return {
    id: row.id as number,
    barcode: (row.barcode as string | null) ?? null,
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    kcal_per_100: (row.kcal_per_100 as number | null) ?? null,
    kcal_per_serving: (row.kcal_per_serving as number | null) ?? null,
    protein_per_100: (row.protein_per_100 as number | null) ?? null,
    carbs_per_100: (row.carbs_per_100 as number | null) ?? null,
    fat_per_100: (row.fat_per_100 as number | null) ?? null,
    serving_g: (row.serving_g as number | null) ?? null,
    serving_label: (row.serving_label as string | null) ?? null,
    source: row.source as FoodSource,
    source_ref: (row.source_ref as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    archived: Boolean(row.archived),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getProduct(id: number): Promise<FoodProduct | null> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM food_products WHERE id = ?;', [id]);
  if (!result.rows || result.rows.length === 0) { return null; }
  return rowToProduct(result.rows[0] as RawRow);
}

export async function getProductByBarcode(barcode: string): Promise<FoodProduct | null> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM food_products WHERE barcode = ? AND archived = 0;',
    [barcode],
  );
  if (!result.rows || result.rows.length === 0) { return null; }
  return rowToProduct(result.rows[0] as RawRow);
}

/** Insert, or refresh the row that already carries this barcode. A NULL barcode
 *  never conflicts, so this is a plain insert for foods without a code. */
export async function upsertProduct(fields: ProductFields): Promise<FoodProduct> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO food_products (
       barcode, name, brand, kcal_per_100, kcal_per_serving, protein_per_100, carbs_per_100,
       fat_per_100, serving_g, serving_label, source, source_ref, image_url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name = excluded.name, brand = excluded.brand, kcal_per_100 = excluded.kcal_per_100,
       kcal_per_serving = excluded.kcal_per_serving, protein_per_100 = excluded.protein_per_100,
       carbs_per_100 = excluded.carbs_per_100, fat_per_100 = excluded.fat_per_100,
       serving_g = excluded.serving_g, serving_label = excluded.serving_label,
       source = excluded.source, source_ref = excluded.source_ref, image_url = excluded.image_url,
       archived = 0, updated_at = datetime('now')
     RETURNING *;`,
    [
      fields.barcode,
      fields.name.trim(),
      fields.brand,
      fields.kcal_per_100,
      fields.kcal_per_serving,
      fields.protein_per_100,
      fields.carbs_per_100,
      fields.fat_per_100,
      fields.serving_g,
      fields.serving_label,
      fields.source,
      fields.source_ref,
      fields.image_url,
    ],
  );
  return rowToProduct(result.rows![0] as RawRow);
}
