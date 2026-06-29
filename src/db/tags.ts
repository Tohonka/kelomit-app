import {getDB} from './database';
import type {Tag} from '../types';

type RawRow = Record<string, unknown>;

function rowToTag(row: RawRow): Tag {
  return {
    id: row.id as number,
    name: row.name as string,
    created_at: row.created_at as string,
  };
}

export async function getAllTags(): Promise<Tag[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM tags ORDER BY name ASC;',
  );
  return (result.rows ?? []).map(r => rowToTag(r as RawRow));
}

export async function getOrCreateTag(name: string): Promise<Tag> {
  const db = getDB();
  const normalized = name.trim().toLowerCase();
  const existing = await db.execute(
    'SELECT * FROM tags WHERE name = ? COLLATE NOCASE;',
    [normalized],
  );
  if (existing.rows && existing.rows.length > 0) {
    return rowToTag(existing.rows[0] as RawRow);
  }
  const result = await db.execute(
    'INSERT INTO tags (name) VALUES (?) RETURNING *;',
    [normalized],
  );
  return rowToTag(result.rows![0] as RawRow);
}

export async function deleteTag(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM tags WHERE id = ?;', [id]);
}

/** Rename a tag. Throws on a UNIQUE collision (name already taken, NOCASE) —
 *  callers steer the user to merge instead. */
export async function renameTag(id: number, name: string): Promise<void> {
  const db = getDB();
  await db.execute('UPDATE tags SET name = ? WHERE id = ?;', [
    name.trim().toLowerCase(),
    id,
  ]);
}

/** Combine `dropId` into `keepId`: move its note links to the kept tag, then
 *  delete it. OR IGNORE skips notes that already carry the kept tag (the
 *  (entry_id, tag_id) PK would collide); deleting the dropped tag then cascades
 *  those leftover links away. */
export async function mergeTags(keepId: number, dropId: number): Promise<void> {
  const db = getDB();
  await db.execute(
    'UPDATE OR IGNORE entry_tags SET tag_id = ? WHERE tag_id = ?;',
    [keepId, dropId],
  );
  await db.execute('DELETE FROM tags WHERE id = ?;', [dropId]);
}
