import fineliJson from '../assets/fineli.json';
import {getDB} from './database';
import {getSetting, setSetting} from './settings';
import type {FineliFood, FineliUnit} from '../types';

/*
 * Bundled Fineli food composition data (THL, CC BY 4.0). The JSON is built by
 * scripts/build-fineli.js; this module seeds it into fineli_foods/fineli_units
 * once per bundled release and serves name search. Attribution lives in
 * Settings → App.
 */

type FoodTuple = [
  number, string, string | null, string | null,
  number, number | null, number | null, number | null,
  [string, number][],
];
interface FineliPayload {
  version: string;
  generated: string;
  unitLabels: Record<string, [string, string]>;
  foods: FoodTuple[];
}

const data = fineliJson as unknown as FineliPayload;
export const FINELI_VERSION = data.version;
export const FINELI_UNIT_LABELS = data.unitLabels;

type RawRow = Record<string, unknown>;

function rowToFood(row: RawRow): FineliFood {
  return {
    id: row.id as number,
    name_fi: row.name_fi as string,
    name_en: (row.name_en as string | null) ?? null,
    name_sv: (row.name_sv as string | null) ?? null,
    kcal_per_100: row.kcal_per_100 as number,
    protein_per_100: (row.protein_per_100 as number | null) ?? null,
    carbs_per_100: (row.carbs_per_100 as number | null) ?? null,
    fat_per_100: (row.fat_per_100 as number | null) ?? null,
  };
}

/** Replace the tables when the bundled release differs from the seeded one.
 *  Returns true when a seed ran. */
export async function seedFineliIfNeeded(): Promise<boolean> {
  if ((await getSetting('fineli_version')) === FINELI_VERSION) { return false; }
  const db = getDB();
  // ponytail: one statement per row inside a transaction (~16k rows, a few
  // seconds once per release). Switch to executeBatch if it ever shows.
  await db.transaction(async tx => {
    await tx.execute('DELETE FROM fineli_units;');
    await tx.execute('DELETE FROM fineli_foods;');
    for (const f of data.foods) {
      await tx.execute(
        `INSERT INTO fineli_foods (id, name_fi, name_en, name_sv, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]],
      );
      for (const [code, grams] of f[8]) {
        await tx.execute('INSERT INTO fineli_units (food_id, code, grams) VALUES (?, ?, ?);', [f[0], code, grams]);
      }
    }
  });
  await setSetting('fineli_version', FINELI_VERSION);
  return true;
}

/** Name search in the UI language (Finnish names always match too), prefix
 *  matches first, shorter names first. */
export async function searchFineli(query: string, lang: 'fi' | 'en', limit = 8): Promise<FineliFood[]> {
  const q = query.trim();
  if (!q) { return []; }
  const col = lang === 'fi' ? 'name_fi' : 'name_en';
  const db = getDB();
  const result = await db.execute(
    `SELECT * FROM fineli_foods
     WHERE name_fi LIKE ? OR name_en LIKE ?
     ORDER BY CASE WHEN ${col} LIKE ? THEN 0 WHEN name_fi LIKE ? THEN 1 ELSE 2 END, length(${col}) ASC
     LIMIT ?;`,
    [`%${q}%`, `%${q}%`, `${q}%`, `${q}%`, limit],
  );
  return (result.rows ?? []).map(r => rowToFood(r as RawRow));
}

/** Household units in preference order (as bundled). */
export async function getFineliUnits(foodId: number): Promise<FineliUnit[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT code, grams FROM fineli_units WHERE food_id = ? ORDER BY rowid ASC;',
    [foodId],
  );
  return (result.rows ?? []).map(r => ({code: (r as RawRow).code as string, grams: (r as RawRow).grams as number}));
}
