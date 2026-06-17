import {getDB} from './database';
import type {Day} from '../types';

function rowToDay(row: Record<string, unknown>): Day {
  return {
    id: row.id as number,
    date: row.date as string,
    started_at: (row.started_at as string | null) ?? null,
    ended_at: (row.ended_at as string | null) ?? null,
    started_at_2: (row.started_at_2 as string | null) ?? null,
    ended_at_2: (row.ended_at_2 as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** Optional ISO start/end to seed a day with the moment it is first created
 *  (the "prefill from usual hours" feature). Applied only on actual creation,
 *  never to an existing day, so it can't clobber user-entered times. */
export interface DayPrefill {
  started_at: string;
  ended_at: string;
}

export async function getOrCreateDay(date: string, prefill?: DayPrefill): Promise<Day> {
  const db = getDB();
  const insert = await db.execute(`INSERT OR IGNORE INTO days (date) VALUES (?);`, [date]);
  const created = (insert.rowsAffected ?? 0) > 0;
  if (created && prefill) {
    await db.execute(
      "UPDATE days SET started_at = ?, ended_at = ?, updated_at = datetime('now') WHERE date = ?;",
      [prefill.started_at, prefill.ended_at, date],
    );
  }
  const result = await db.execute('SELECT * FROM days WHERE date = ?;', [date]);
  return rowToDay(result.rows![0] as Record<string, unknown>);
}

export async function getDayByDate(date: string): Promise<Day | null> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM days WHERE date = ?;', [date]);
  if (!result.rows || result.rows.length === 0) { return null; }
  return rowToDay(result.rows[0] as Record<string, unknown>);
}

export async function getDaysInRange(startDate: string, endDate: string): Promise<Day[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date ASC;',
    [startDate, endDate],
  );
  return (result.rows ?? []).map(r => rowToDay(r as Record<string, unknown>));
}

type DayTimeFields = Partial<Pick<Day,
  'started_at' | 'ended_at' | 'started_at_2' | 'ended_at_2' | 'notes'
>>;

export async function updateDay(id: number, fields: DayTimeFields): Promise<void> {
  const db = getDB();
  const sets: string[] = [];
  const vals: unknown[] = [];

  const fieldKeys: (keyof DayTimeFields)[] = [
    'started_at', 'ended_at', 'started_at_2', 'ended_at_2', 'notes',
  ];
  for (const key of fieldKeys) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      vals.push(fields[key] ?? null);
    }
  }

  if (sets.length === 0) { return; }
  sets.push("updated_at = datetime('now')");
  vals.push(id);

  await db.execute(
    `UPDATE days SET ${sets.join(', ')} WHERE id = ?;`,
    vals as import('@op-engineering/op-sqlite').Scalar[],
  );
}
