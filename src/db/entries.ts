import {getDB} from './database';
import i18n from '../i18n';
import {getDaysInRange} from './days';
import {calcDayWorkSecs} from '../utils/hoursUtils';
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
    is_todo: Boolean(row.is_todo),
    scheduled_date: (row.scheduled_date as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    reminder_at: (row.reminder_at as string | null) ?? null,
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
    'SELECT * FROM entries WHERE day_id = ? ORDER BY time_from DESC;',
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
  is_todo?: boolean;
  scheduled_date?: string | null;
  completed_at?: string | null;
  reminder_at?: string | null;
  tagIds?: number[];
}

export async function createEntry(params: CreateEntryParams): Promise<Entry> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO entries (
       day_id, entry_type, activity_type, project_id, title, body,
       file_path, thumbnail_path, duration_sec, time_from, time_to,
       latitude, longitude, location_label, is_todo, scheduled_date, completed_at, reminder_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      params.is_todo ? 1 : 0,
      params.scheduled_date ?? null,
      params.completed_at ?? null,
      params.reminder_at ?? null,
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
 * Returns work seconds keyed by ISO date string, for all days in the range.
 * Computed in JS via the shared {@link calcDayWorkSecs} work-day model (legs as
 * baseline, work-outside added, personal-inside deducted) so Calendar matches
 * Home/Day exactly. The interval math (overlaps, partial intersections) is not
 * expressible in portable SQLite, so we load days + their entries and fold them
 * through the same function instead of duplicating the logic in SQL.
 */
export async function getWorkSecondsByDay(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const days = await getDaysInRange(startDate, endDate);
  if (days.length === 0) { return {}; }

  const db = getDB();
  const dayIds = days.map(d => d.id);
  const placeholders = dayIds.map(() => '?').join(',');
  const result = await db.execute(
    `SELECT * FROM entries WHERE day_id IN (${placeholders});`,
    dayIds,
  );
  // Tags/project aren't needed for the hours math, so skip those joins.
  const entriesByDay = new Map<number, Entry[]>();
  for (const row of result.rows ?? []) {
    const e = rowToEntry(row as RawRow, [], null);
    const list = entriesByDay.get(e.day_id);
    if (list) { list.push(e); } else { entriesByDay.set(e.day_id, [e]); }
  }

  const map: Record<string, number> = {};
  for (const day of days) {
    const secs = calcDayWorkSecs(day, entriesByDay.get(day.id) ?? []);
    if (secs > 0) { map[day.date] = secs; }
  }
  return map;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface SearchResult {
  entry: Entry;
  date: string;
}

/** Full-text-ish search across entry title/body, tag names and project names. */
export async function searchEntries(query: string, limit = 60): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }
  const db = getDB();
  const like = `%${q}%`;
  const result = await db.execute(
    `SELECT DISTINCT e.*, d.date AS day_date
       FROM entries e
       JOIN days d ON d.id = e.day_id
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN entry_tags et ON et.entry_id = e.id
       LEFT JOIN tags t ON t.id = et.tag_id
      WHERE e.title LIKE ? OR e.body LIKE ? OR p.name LIKE ? OR t.name LIKE ?
      ORDER BY d.date DESC, e.created_at DESC
      LIMIT ?;`,
    [like, like, like, like, limit],
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
  const projectsMap = new Map<number, Project>();
  if (projectIds.length > 0) {
    const pr = await db.execute(
      `SELECT * FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')});`,
      projectIds,
    );
    for (const row of pr.rows ?? []) {
      const r = row as RawRow;
      projectsMap.set(r.id as number, {
        id: r.id as number,
        name: r.name as string,
        type: r.type as Project['type'],
        archived: Boolean(r.archived),
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      });
    }
  }

  return rows.map(r => ({
    entry: rowToEntry(
      r,
      tagsMap.get(r.id as number) ?? [],
      projectsMap.get(r.project_id as number) ?? null,
    ),
    date: r.day_date as string,
  }));
}

// ─── Gallery ────────────────────────────────────────────────────────────────

export interface MediaItem {
  entry: Entry;
  /** The owning day's date (YYYY-MM-DD), used for period grouping. */
  date: string;
}

/** Photo + video entries, newest first, with tags/projects batched in — for the
 *  Gallery grid and its detail modal. */
export async function getMediaEntries(limit = 1000): Promise<MediaItem[]> {
  const db = getDB();
  const result = await db.execute(
    `SELECT e.*, d.date AS day_date
       FROM entries e JOIN days d ON d.id = e.day_id
      WHERE e.entry_type IN ('photo', 'video')
      ORDER BY e.created_at DESC
      LIMIT ?;`,
    [limit],
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
  const projectsMap = new Map<number, Project>();
  if (projectIds.length > 0) {
    const pr = await db.execute(
      `SELECT * FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')});`,
      projectIds,
    );
    for (const row of pr.rows ?? []) {
      const r = row as RawRow;
      projectsMap.set(r.id as number, {
        id: r.id as number,
        name: r.name as string,
        type: r.type as Project['type'],
        archived: Boolean(r.archived),
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      });
    }
  }

  return rows.map(r => ({
    entry: rowToEntry(
      r,
      tagsMap.get(r.id as number) ?? [],
      projectsMap.get(r.project_id as number) ?? null,
    ),
    date: r.day_date as string,
  }));
}

// ─── Insights ───────────────────────────────────────────────────────────────

export interface InsightSlice {
  key: string;
  label: string;
  seconds: number;
}

export interface InsightsData {
  totalSeconds: number;
  byActivity: InsightSlice[];
  byProject: InsightSlice[];
  byTag: InsightSlice[];
}

// Per-entry tracked seconds: explicit duration, else from→to interval.
const ENTRY_SECS_SQL = `CASE
    WHEN duration_sec IS NOT NULL THEN duration_sec
    WHEN time_from IS NOT NULL AND time_to IS NOT NULL
      THEN MAX(0, CAST(strftime('%s', time_to) AS INTEGER) - CAST(strftime('%s', time_from) AS INTEGER))
    ELSE 0
  END`;

/** Aggregated time breakdowns over a date range, for the Insights screen. */
export async function getInsightsBreakdown(
  startDate: string,
  endDate: string,
): Promise<InsightsData> {
  const db = getDB();

  const activityRes = await db.execute(
    `SELECT e.activity_type AS k, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s
       FROM entries e JOIN days d ON d.id = e.day_id
      WHERE d.date >= ? AND d.date <= ?
        AND (e.is_todo = 0 OR e.completed_at IS NOT NULL)
      GROUP BY e.activity_type;`,
    [startDate, endDate],
  );
  const projectRes = await db.execute(
    `SELECT e.project_id AS k, p.name AS name, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s
       FROM entries e JOIN days d ON d.id = e.day_id
       LEFT JOIN projects p ON p.id = e.project_id
      WHERE d.date >= ? AND d.date <= ?
        AND (e.is_todo = 0 OR e.completed_at IS NOT NULL)
      GROUP BY e.project_id;`,
    [startDate, endDate],
  );
  const tagRes = await db.execute(
    `SELECT t.id AS k, t.name AS name, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s
       FROM entries e JOIN days d ON d.id = e.day_id
       JOIN entry_tags et ON et.entry_id = e.id
       JOIN tags t ON t.id = et.tag_id
      WHERE d.date >= ? AND d.date <= ?
        AND (e.is_todo = 0 OR e.completed_at IS NOT NULL)
      GROUP BY t.id;`,
    [startDate, endDate],
  );

  const toSlices = (
    rows: RawRow[] | undefined,
    label: (r: RawRow) => string,
  ): InsightSlice[] =>
    (rows ?? [])
      .map(r => ({key: String(r.k), label: label(r), seconds: (r.s as number | null) ?? 0}))
      .filter(s => s.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);

  const byActivity = toSlices(activityRes.rows as RawRow[], r => i18n.t(`activity.${String(r.k)}`));
  const byProject = toSlices(projectRes.rows as RawRow[], r => (r.name as string | null) ?? i18n.t('insights.noProject'));
  const byTag = toSlices(tagRes.rows as RawRow[], r => (r.name as string | null) ?? '—');
  const totalSeconds = byActivity.reduce((sum, s) => sum + s.seconds, 0);

  return {totalSeconds, byActivity, byProject, byTag};
}

// ─── To-do / future items ────────────────────────────────────────────────────

/** Mark a to-do confirmed (completedAt = ISO) or back to pending (null). */
export async function setTodoCompleted(
  id: number,
  completedAt: string | null,
): Promise<void> {
  const db = getDB();
  await db.execute(
    "UPDATE entries SET completed_at = ?, updated_at = datetime('now') WHERE id = ?;",
    [completedAt, id],
  );
}

/** Pending (uncompleted) to-do entries scheduled on any of the given dates. */
export async function getUpcomingTodos(dates: string[]): Promise<Entry[]> {
  if (dates.length === 0) {
    return [];
  }
  const db = getDB();
  const placeholders = dates.map(() => '?').join(',');
  const result = await db.execute(
    `SELECT * FROM entries
      WHERE is_todo = 1 AND completed_at IS NULL
        AND scheduled_date IN (${placeholders})
      ORDER BY scheduled_date ASC, created_at ASC;`,
    dates,
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
  const projectsMap = new Map<number, Project>();
  if (projectIds.length > 0) {
    const pr = await db.execute(
      `SELECT * FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')});`,
      projectIds,
    );
    for (const row of pr.rows ?? []) {
      const r = row as RawRow;
      projectsMap.set(r.id as number, {
        id: r.id as number,
        name: r.name as string,
        type: r.type as Project['type'],
        archived: Boolean(r.archived),
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      });
    }
  }

  return rows.map(r =>
    rowToEntry(
      r,
      tagsMap.get(r.id as number) ?? [],
      projectsMap.get(r.project_id as number) ?? null,
    ),
  );
}
