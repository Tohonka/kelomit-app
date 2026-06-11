import {getDB} from './database';
import type {Project} from '../types';

type RawRow = Record<string, unknown>;

function rowToProject(row: RawRow): Project {
  return {
    id: row.id as number,
    name: row.name as string,
    type: row.type as Project['type'],
    archived: Boolean(row.archived),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getAllProjects(
  includeArchived = false,
): Promise<Project[]> {
  const db = getDB();
  const result = await db.execute(
    `SELECT * FROM projects${includeArchived ? '' : ' WHERE archived = 0'} ORDER BY name ASC;`,
  );
  return (result.rows ?? []).map(r => rowToProject(r as RawRow));
}

export async function createProject(
  name: string,
  type: Project['type'] = 'work',
): Promise<Project> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO projects (name, type) VALUES (?, ?) RETURNING *;`,
    [name, type],
  );
  return rowToProject(result.rows![0] as RawRow);
}

export async function archiveProject(id: number): Promise<void> {
  const db = getDB();
  await db.execute(
    `UPDATE projects SET archived = 1, updated_at = datetime('now') WHERE id = ?;`,
    [id],
  );
}

export async function unarchiveProject(id: number): Promise<void> {
  const db = getDB();
  await db.execute(
    `UPDATE projects SET archived = 0, updated_at = datetime('now') WHERE id = ?;`,
    [id],
  );
}

export async function deleteProject(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM projects WHERE id = ?;', [id]);
}
