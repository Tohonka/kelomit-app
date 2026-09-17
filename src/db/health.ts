import {getDB} from './database';
import type {ExerciseBout, HealthDaily, HealthDailyInput} from '../types';

type RawRow = Record<string, unknown>;

function parseExercise(raw: unknown): ExerciseBout[] | null {
  if (typeof raw !== 'string') { return null; }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function rowToHealthDaily(row: RawRow): HealthDaily {
  return {
    date: row.date as string,
    steps: (row.steps as number | null) ?? null,
    distance_m: (row.distance_m as number | null) ?? null,
    sleep_minutes: (row.sleep_minutes as number | null) ?? null,
    sleep_start: (row.sleep_start as string | null) ?? null,
    sleep_end: (row.sleep_end as string | null) ?? null,
    weight_kg: (row.weight_kg as number | null) ?? null,
    height_cm: (row.height_cm as number | null) ?? null,
    active_kcal: (row.active_kcal as number | null) ?? null,
    total_kcal: (row.total_kcal as number | null) ?? null,
    resting_hr: (row.resting_hr as number | null) ?? null,
    exercise: parseExercise(row.exercise),
    synced_at: row.synced_at as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getHealthDaily(date: string): Promise<HealthDaily | null> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM health_daily WHERE date = ?;', [date]);
  if (!result.rows || result.rows.length === 0) { return null; }
  return rowToHealthDaily(result.rows[0] as RawRow);
}

export async function getHealthDailyRange(startDate: string, endDate: string): Promise<HealthDaily[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM health_daily WHERE date >= ? AND date <= ? ORDER BY date ASC;',
    [startDate, endDate],
  );
  return (result.rows ?? []).map(r => rowToHealthDaily(r as RawRow));
}

/** Replace the day's totals. A metric the import didn't see becomes NULL —
 *  the import always fetches every type for the window, so this never wipes
 *  data that still exists in Health Connect. */
export async function upsertHealthDaily(row: HealthDailyInput): Promise<void> {
  const db = getDB();
  await db.execute(
    `INSERT INTO health_daily (
       date, steps, distance_m, sleep_minutes, sleep_start, sleep_end,
       weight_kg, height_cm, active_kcal, total_kcal, resting_hr, exercise, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       steps = excluded.steps, distance_m = excluded.distance_m,
       sleep_minutes = excluded.sleep_minutes, sleep_start = excluded.sleep_start,
       sleep_end = excluded.sleep_end, weight_kg = excluded.weight_kg,
       height_cm = excluded.height_cm, active_kcal = excluded.active_kcal,
       total_kcal = excluded.total_kcal, resting_hr = excluded.resting_hr,
       exercise = COALESCE(excluded.exercise, health_daily.exercise),
       synced_at = excluded.synced_at, updated_at = datetime('now');`,
    [
      row.date,
      row.steps,
      row.distance_m,
      row.sleep_minutes,
      row.sleep_start,
      row.sleep_end,
      row.weight_kg,
      row.height_cm,
      row.active_kcal,
      row.total_kcal,
      row.resting_hr,
      row.exercise ? JSON.stringify(row.exercise) : null,
      row.synced_at,
    ],
  );
}
