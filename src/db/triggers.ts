import {getDB} from './database';
import type {Trigger} from '../types';

type RawRow = Record<string, unknown>;

function rowToTrigger(row: RawRow): Trigger {
  return {
    id: row.id as number,
    name: row.name as string,
    created_at: row.created_at as string,
  };
}

export async function getAllTriggers(): Promise<Trigger[]> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM triggers ORDER BY name ASC;');
  return (result.rows ?? []).map(r => rowToTrigger(r as RawRow));
}

export async function getOrCreateTrigger(name: string): Promise<Trigger> {
  const db = getDB();
  const normalized = name.trim().toLowerCase();
  const existing = await db.execute(
    'SELECT * FROM triggers WHERE name = ? COLLATE NOCASE;',
    [normalized],
  );
  if (existing.rows && existing.rows.length > 0) {
    return rowToTrigger(existing.rows[0] as RawRow);
  }
  const result = await db.execute(
    'INSERT INTO triggers (name) VALUES (?) RETURNING *;',
    [normalized],
  );
  return rowToTrigger(result.rows![0] as RawRow);
}

/** Throws on a UNIQUE collision (NOCASE). */
export async function renameTrigger(id: number, name: string): Promise<void> {
  const db = getDB();
  await db.execute('UPDATE triggers SET name = ? WHERE id = ?;', [
    name.trim().toLowerCase(),
    id,
  ]);
}

export async function deleteTrigger(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM triggers WHERE id = ?;', [id]);
}

/** entryId -> triggerIds, for the habit matcher engine. */
export async function getTriggerIdsForEntries(
  entryIds: number[],
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (entryIds.length === 0) { return map; }
  const db = getDB();
  const placeholders = entryIds.map(() => '?').join(',');
  const result = await db.execute(
    `SELECT entry_id, trigger_id FROM entry_triggers WHERE entry_id IN (${placeholders});`,
    entryIds,
  );
  for (const r of (result.rows ?? []) as RawRow[]) {
    const eid = r.entry_id as number;
    const list = map.get(eid) ?? [];
    list.push(r.trigger_id as number);
    map.set(eid, list);
  }
  return map;
}
