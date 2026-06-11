import {getDB} from './database';
import type {Entry, Tag, Project} from '../types';

type RawRow = Record<string, unknown>;

function rowToEntry(row: RawRow, tags: Tag[], project: Project | null): Entry {
  return {
    id: row.id as number,
    day_id: row.day_id as number,
    entry_type: row.entry_type as Entry['entry_type'],
    activity_type: row.activity_type as Entry['activity_type'],
    project_id: (row.project_id as number | null) ?? null,
    title: (row.title as string | null) ?? null,
    body: (row.body as string | null) ?? null,
    file_path: (row.file_path as string | null) ?? null,
    thumbnail_path: (row.thumbnail_path as string | null) ?? null,
    duration_sec: (row.duration_sec as number | null) ?? null,
    time_from: (row.time_from as string | null) ?? null,
    time_to: (row.time_to as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    location_label: (row.location_label as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    tags,
    project,
  };
}

async function fetchTagsForEntries(
  entryIds: number[],
): Promise<Map<number, Tag[]>> {
  if (entryIds.length === 0) {
    return new Map();
  }
  const db = getDB();
  const placeholders = entryIds.map(() => '?').join(',');
  const result = await db.execute(
    `SELECT et.entry_id, t.id, t.name, t.created_at
     FROM entry_tags et
     JOIN tags t ON t.id = et.tag_id
     WHERE et.entry_id IN (${placeholders});`,
    entryIds,
  );
  const map = new Map<number, Tag[]>();
  for (const row of result.rows ?? []) {
    const r = row as RawRow;
    const entryId = r.entry_id as number;
    if (!map.has(entryId)) {
      map.set(entryId, []);
    }
    map.get(entryId)!.push({
      id: r.id as number,
      name: r.name as string,
      created_at: r.created_at as string,
    });
  }
  return map;
}

async function fetchProjectById(
  projectId: number | null,
): Promise<Project | null> {
  if (projectId == null) {
    return null;
  }
  const db = getDB();
  const result = await db.execute('SELECT * FROM projects WHERE id = ?;', [
    projectId,
  ]);
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  const r = result.rows[0] as RawRow;
  return {
    id: r.id as number,
    name: r.name as string,
    type: r.type as Project['type'],
    archived: Boolean(r.archived),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export async function getEntriesForDay(dayId: number): Promise<Entry[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT * FROM entries WHERE day_id = ? ORDER BY created_at DESC;',
    [dayId],
  );
  const rows = (result.rows ?? []) as RawRow[];
  if (rows.length === 0) {
    return [];
  }

  const entryIds = rows.map(r => r.id as number);
  const tagsMap = await fetchTagsForEntries(entryIds);

  const projectIds = [
    ...new Set(rows.map(r => r.project_id as number | null).filter(Boolean)),
  ] as number[];
  const projectsResult =
    projectIds.length > 0
      ? await db.execute(
          `SELECT * FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')});`,
          projectIds,
        )
      : {rows: []};
  const projectsMap = new Map<number, Project>();
  for (const pr of projectsResult.rows ?? []) {
    const r = pr as RawRow;
    projectsMap.set(r.id as number, {
      id: r.id as number,
      name: r.name as string,
      type: r.type as Project['type'],
      archived: Boolean(r.archived),
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    });
  }

  return rows.map(r =>
    rowToEntry(
      r,
      tagsMap.get(r.id as number) ?? [],
      projectsMap.get(r.project_id as number) ?? null,
    ),
  );
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = getDB();
  const result = await db.execute('SELECT * FROM entries WHERE id = ?;', [id]);
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  const r = result.rows[0] as RawRow;
  const tagsMap = await fetchTagsForEntries([r.id as number]);
  const project = await fetchProjectById(r.project_id as number | null);
  return rowToEntry(r, tagsMap.get(r.id as number) ?? [], project);
}

export interface CreateEntryParams {
  day_id: number;
  entry_type: Entry['entry_type'];
  activity_type?: Entry['activity_type'];
  project_id?: number | null;
  title?: string | null;
  body?: string | null;
  file_path?: string | null;
  thumbnail_path?: string | null;
  duration_sec?: number | null;
  time_from?: string | null;
  time_to?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_label?: string | null;
  tagIds?: number[];
}

export async function createEntry(params: CreateEntryParams): Promise<Entry> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO entries (
       day_id, entry_type, activity_type, project_id, title, body,
       file_path, thumbnail_path, duration_sec, time_from, time_to,
       latitude, longitude, location_label
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *;`,
    [
      params.day_id,
      params.entry_type,
      params.activity_type ?? 'work',
      params.project_id ?? null,
      params.title ?? null,
      params.body ?? null,
      params.file_path ?? null,
      params.thumbnail_path ?? null,
      params.duration_sec ?? null,
      params.time_from ?? null,
      params.time_to ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      params.location_label ?? null,
    ],
  );

  const row = result.rows![0] as RawRow;
  const entryId = row.id as number;

  if (params.tagIds && params.tagIds.length > 0) {
    for (const tagId of params.tagIds) {
      await db.execute(
        'INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?);',
        [entryId, tagId],
      );
    }
  }

  const entry = await getEntry(entryId);
  return entry!;
}

export async function updateEntry(
  id: number,
  fields: Partial<
    Omit<CreateEntryParams, 'day_id' | 'entry_type' | 'tagIds'>
  > & {tagIds?: number[]},
): Promise<void> {
  const db = getDB();
  const sets: string[] = [];
  const vals: unknown[] = [];

  const directFields: Array<keyof typeof fields> = [
    'activity_type',
    'project_id',
    'title',
    'body',
    'file_path',
    'thumbnail_path',
    'duration_sec',
    'time_from',
    'time_to',
    'latitude',
    'longitude',
    'location_label',
  ];

  for (const f of directFields) {
    if (f in fields) {
      sets.push(`${f} = ?`);
      vals.push(fields[f] ?? null);
    }
  }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    await db.execute(
      `UPDATE entries SET ${sets.join(', ')} WHERE id = ?;`,
      vals as import('@op-engineering/op-sqlite').Scalar[],
    );
  }

  if (fields.tagIds !== undefined) {
    await db.execute('DELETE FROM entry_tags WHERE entry_id = ?;', [id]);
    for (const tagId of fields.tagIds) {
      await db.execute(
        'INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?);',
        [id, tagId],
      );
    }
  }
}

export async function deleteEntry(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM entries WHERE id = ?;', [id]);
}

/**
 * Returns work seconds (activity_type='work') keyed by ISO date string,
 * for all days in the given range that have tracked entries.
 * Uses SQLite strftime('%s') for from/to interval math.
 */
export async function getWorkSecondsByDay(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const db = getDB();
  // Day-level started_at/ended_at is the source of truth (mirrors calcDayWorkSecs).
  // Falls back to summing entry durations when day times are absent.
  const result = await db.execute(
    `SELECT d.date,
       CASE
         WHEN d.started_at IS NOT NULL AND d.ended_at IS NOT NULL THEN
           MAX(0, CAST(strftime('%s', d.ended_at) AS INTEGER)
                  - CAST(strftime('%s', d.started_at) AS INTEGER))
           + CASE WHEN d.started_at_2 IS NOT NULL AND d.ended_at_2 IS NOT NULL
               THEN MAX(0, CAST(strftime('%s', d.ended_at_2) AS INTEGER)
                           - CAST(strftime('%s', d.started_at_2) AS INTEGER))
               ELSE 0 END
         ELSE COALESCE(es.total, 0)
       END AS work_seconds
     FROM days d
     LEFT JOIN (
       SELECT day_id,
         CAST(SUM(
           CASE
             WHEN duration_sec IS NOT NULL THEN duration_sec
             WHEN time_from IS NOT NULL AND time_to IS NOT NULL
               THEN MAX(0, CAST(strftime('%s', time_to) AS INTEGER)
                          - CAST(strftime('%s', time_from) AS INTEGER))
             ELSE 0
           END
         ) AS INTEGER) AS total
       FROM entries
       WHERE activity_type = 'work'
       GROUP BY day_id
     ) es ON es.day_id = d.id
     WHERE d.date >= ? AND d.date <= ?;`,
    [startDate, endDate],
  );

  const map: Record<string, number> = {};
  for (const row of result.rows ?? []) {
    const r = row as Record<string, unknown>;
    const secs = (r.work_seconds as number | null) ?? 0;
    if (secs > 0) {
      map[r.date as string] = secs;
    }
  }
  return map;
}
