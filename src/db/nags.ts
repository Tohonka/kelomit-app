import {getDB} from './database';
import type {Nag, NagPlan, NagSchedule} from '../types';

type RawRow = Record<string, unknown>;

function rowToNag(row: RawRow): Nag {
  return {
    id: row.id as number,
    title: row.title as string,
    note: (row.note as string | null) ?? null,
    activity_type: row.activity_type as Nag['activity_type'],
    schedule: JSON.parse(row.schedule as string) as NagSchedule,
    plan: JSON.parse(row.plan as string) as NagPlan,
    countdown: Boolean(row.countdown),
    active: Boolean(row.active),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export type NagFields = Pick<Nag, 'title' | 'note' | 'activity_type' | 'schedule' | 'plan' | 'countdown'>;

export async function getNags(includeInactive = false): Promise<Nag[]> {
  const res = await getDB().execute(
    `SELECT * FROM nags${includeInactive ? '' : ' WHERE active = 1'} ORDER BY id ASC;`,
  );
  return (res.rows ?? []).map(r => rowToNag(r as RawRow));
}

export async function getNag(id: number): Promise<Nag | null> {
  const res = await getDB().execute('SELECT * FROM nags WHERE id = ?;', [id]);
  const row = res.rows?.[0] as RawRow | undefined;
  return row ? rowToNag(row) : null;
}

export async function createNag(fields: NagFields): Promise<Nag> {
  const res = await getDB().execute(
    `INSERT INTO nags (title, note, activity_type, schedule, plan, countdown)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id;`,
    [fields.title, fields.note, fields.activity_type, JSON.stringify(fields.schedule),
      JSON.stringify(fields.plan), fields.countdown ? 1 : 0],
  );
  const id = (res.rows![0] as RawRow).id as number;
  return (await getNag(id))!;
}

export async function updateNag(id: number, fields: Partial<NagFields> & {active?: boolean}): Promise<void> {
  const cols: string[] = [];
  const params: (string | number | null)[] = [];
  const put = (col: string, v: string | number | null) => { cols.push(`${col} = ?`); params.push(v); };
  if (fields.title !== undefined) { put('title', fields.title); }
  if (fields.note !== undefined) { put('note', fields.note); }
  if (fields.activity_type !== undefined) { put('activity_type', fields.activity_type); }
  if (fields.schedule !== undefined) { put('schedule', JSON.stringify(fields.schedule)); }
  if (fields.plan !== undefined) { put('plan', JSON.stringify(fields.plan)); }
  if (fields.countdown !== undefined) { put('countdown', fields.countdown ? 1 : 0); }
  if (fields.active !== undefined) { put('active', fields.active ? 1 : 0); }
  if (cols.length === 0) { return; }
  cols.push("updated_at = datetime('now')");
  await getDB().execute(`UPDATE nags SET ${cols.join(', ')} WHERE id = ?;`, [...params, id]);
}

export async function deleteNag(id: number): Promise<void> {
  await getDB().execute('DELETE FROM nags WHERE id = ?;', [id]);
}

/** done_at per due instant for the given nag ids: `${nag_id}|${due_at}` → done_at. */
export async function getNagDoneMap(nagIds: number[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (nagIds.length === 0) { return out; }
  const res = await getDB().execute(
    `SELECT nag_id, due_at, done_at FROM nag_done WHERE nag_id IN (${nagIds.map(() => '?').join(',')});`,
    nagIds,
  );
  for (const r of (res.rows ?? []) as RawRow[]) {
    out.set(`${r.nag_id}|${r.due_at}`, r.done_at as string);
  }
  return out;
}

export async function setNagDone(nagId: number, dueAt: string, doneAt: string | null): Promise<void> {
  if (doneAt) {
    await getDB().execute(
      'INSERT OR REPLACE INTO nag_done (nag_id, due_at, done_at) VALUES (?, ?, ?);',
      [nagId, dueAt, doneAt],
    );
  } else {
    await getDB().execute('DELETE FROM nag_done WHERE nag_id = ? AND due_at = ?;', [nagId, dueAt]);
  }
}
