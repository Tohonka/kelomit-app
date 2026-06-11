import {getDB} from './database';
import type {Day} from '../types';

function rowToDay(row: Record<string, unknown>): Day {
  return {
    id: row.id as number,
    date: row.date as string,
    started_at: (row.started_at as string | null) ?? null,
    ended_at: (row.ended_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getOrCreateDay(date: string): Promise<Day> {
  const db = getDB();
  await db.execute(
    `INSERT OR IGNORE INTO days (date) VALUES (?);`,
    [date],
  );
  const result = await db.execute('SELECT * FROM days WHERE date = ?;', [date]);
  return rowToDay(result.rows![0] as Record<string, unknown>);
}

export async function getDayByDate(date: string): Promise<Day | null> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM days WHERE date = ?;', [date]);
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return rowToDay(result.rows[0] as Record<string, unknown>);
}

export async function getDaysInRange(
  startDate: string,
  endDate: string,
): Promise<Day[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date ASC;',
    [startDate, endDate],
  );
  return (result.rows ?? []).map(r => rowToDay(r as Record<string, unknown>));
}

export async function updateDay(
  id: number,
  fields: Partial<Pick<Day, 'started_at' | 'ended_at' | 'notes'>>,
): Promise<void> {
  const db = getDB();
  const sets: string[] = [];
  const vals: unknown[] = [];

  if ('started_at' in fields) {
    sets.push('started_at = ?');
    vals.push(fields.started_at);
  }
  if ('ended_at' in fields) {
    sets.push('ended_at = ?');
    vals.push(fields.ended_at);
  }
  if ('notes' in fields) {
    sets.push('notes = ?');
    vals.push(fields.notes);
  }

  if (sets.length === 0) {
    return;
  }

  sets.push("updated_at = datetime('now')");
  vals.push(id);

  await db.execute(
    `UPDATE days SET ${sets.join(', ')} WHERE id = ?;`,
    vals as import('@op-engineering/op-sqlite').Scalar[],
  );
}
