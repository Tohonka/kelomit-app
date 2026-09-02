import {getDB} from './database';
import type {Habit, HabitCategory, HabitMatcher} from '../types';

type RawRow = Record<string, unknown>;

function rowToCategory(row: RawRow): HabitCategory {
  return {
    id: row.id as number,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    icon: row.icon as string,
    goal_streak_days: (row.goal_streak_days as number | null) ?? null,
    archived: Boolean(row.archived),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function rowToHabit(row: RawRow): Habit {
  return {
    id: row.id as number,
    category_id: row.category_id as number,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    icon: row.icon as string,
    goal_kind: (row.goal_kind as Habit['goal_kind']) ?? null,
    goal_value: (row.goal_value as number | null) ?? null,
    archived: Boolean(row.archived),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export type CategoryFields = Partial<
  Pick<HabitCategory, 'title' | 'description' | 'icon' | 'goal_streak_days'>
>;
export type HabitFields = Partial<
  Pick<Habit, 'category_id' | 'title' | 'description' | 'icon' | 'goal_kind' | 'goal_value'>
>;

/** Builds `SET a = ?, b = ?` from the defined keys of `fields`. */
function setClause(fields: Record<string, unknown>): {sql: string; params: (string | number | null)[]} {
  const keys = Object.keys(fields).filter(k => fields[k] !== undefined);
  return {
    sql: keys.map(k => `${k} = ?`).join(', '),
    params: keys.map(k => (fields[k] ?? null) as string | number | null),
  };
}

// ---- categories ----

export async function getCategories(includeArchived = false): Promise<HabitCategory[]> {
  const db = getDB();
  const result = await db.execute(
    `SELECT * FROM habit_categories${includeArchived ? '' : ' WHERE archived = 0'} ORDER BY id ASC;`,
  );
  return (result.rows ?? []).map(r => rowToCategory(r as RawRow));
}

export async function createCategory(
  fields: CategoryFields & {title: string},
): Promise<HabitCategory> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO habit_categories (title, description, icon, goal_streak_days)
     VALUES (?, ?, ?, ?) RETURNING *;`,
    [
      fields.title.trim(),
      fields.description ?? null,
      fields.icon ?? 'star-outline',
      fields.goal_streak_days ?? null,
    ],
  );
  return rowToCategory(result.rows![0] as RawRow);
}

export async function updateCategory(id: number, fields: CategoryFields): Promise<void> {
  const {sql, params} = setClause(fields);
  if (!sql) { return; }
  const db = getDB();
  await db.execute(
    `UPDATE habit_categories SET ${sql}, updated_at = datetime('now') WHERE id = ?;`,
    [...params, id],
  );
}

export async function archiveCategory(id: number, archived = true): Promise<void> {
  const db = getDB();
  await db.execute(
    `UPDATE habit_categories SET archived = ?, updated_at = datetime('now') WHERE id = ?;`,
    [archived ? 1 : 0, id],
  );
}

export async function deleteCategory(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM habit_categories WHERE id = ?;', [id]);
}

// ---- habits ----

export async function getHabits(categoryId?: number, includeArchived = false): Promise<Habit[]> {
  const db = getDB();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!includeArchived) { where.push('archived = 0'); }
  if (categoryId != null) { where.push('category_id = ?'); params.push(categoryId); }
  const result = await db.execute(
    `SELECT * FROM habits${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id ASC;`,
    params,
  );
  return (result.rows ?? []).map(r => rowToHabit(r as RawRow));
}

export async function createHabit(
  fields: HabitFields & {category_id: number; title: string},
): Promise<Habit> {
  const db = getDB();
  const result = await db.execute(
    `INSERT INTO habits (category_id, title, description, icon, goal_kind, goal_value)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *;`,
    [
      fields.category_id,
      fields.title.trim(),
      fields.description ?? null,
      fields.icon ?? 'circle-outline',
      fields.goal_kind ?? null,
      fields.goal_value ?? null,
    ],
  );
  return rowToHabit(result.rows![0] as RawRow);
}

export async function updateHabit(id: number, fields: HabitFields): Promise<void> {
  const {sql, params} = setClause(fields);
  if (!sql) { return; }
  const db = getDB();
  await db.execute(
    `UPDATE habits SET ${sql}, updated_at = datetime('now') WHERE id = ?;`,
    [...params, id],
  );
}

export async function archiveHabit(id: number, archived = true): Promise<void> {
  const db = getDB();
  await db.execute(
    `UPDATE habits SET archived = ?, updated_at = datetime('now') WHERE id = ?;`,
    [archived ? 1 : 0, id],
  );
}

export async function deleteHabit(id: number): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM habits WHERE id = ?;', [id]);
}

// ---- matchers ----

export async function getMatchers(habitId: number): Promise<HabitMatcher[]> {
  const db = getDB();
  const result = await db.execute(
    'SELECT habit_id, kind, ref_id FROM habit_matchers WHERE habit_id = ?;',
    [habitId],
  );
  return (result.rows ?? []).map(r => {
    const row = r as RawRow;
    return {
      habit_id: row.habit_id as number,
      kind: row.kind as HabitMatcher['kind'],
      ref_id: row.ref_id as number,
    };
  });
}

/** All matchers for a set of habits, keyed by habit id. */
export async function getMatchersForHabits(
  habitIds: number[],
): Promise<Map<number, HabitMatcher[]>> {
  const map = new Map<number, HabitMatcher[]>();
  if (habitIds.length === 0) { return map; }
  const db = getDB();
  const placeholders = habitIds.map(() => '?').join(',');
  const result = await db.execute(
    `SELECT habit_id, kind, ref_id FROM habit_matchers WHERE habit_id IN (${placeholders});`,
    habitIds,
  );
  for (const r of (result.rows ?? []) as RawRow[]) {
    const hid = r.habit_id as number;
    const list = map.get(hid) ?? [];
    list.push({habit_id: hid, kind: r.kind as HabitMatcher['kind'], ref_id: r.ref_id as number});
    map.set(hid, list);
  }
  return map;
}

/** Replace a habit's matchers wholesale (delete + re-insert, like tag replacement). */
export async function setMatchers(
  habitId: number,
  matchers: Omit<HabitMatcher, 'habit_id'>[],
): Promise<void> {
  const db = getDB();
  await db.execute('DELETE FROM habit_matchers WHERE habit_id = ?;', [habitId]);
  for (const m of matchers) {
    await db.execute(
      'INSERT OR IGNORE INTO habit_matchers (habit_id, kind, ref_id) VALUES (?, ?, ?);',
      [habitId, m.kind, m.ref_id],
    );
  }
}

// ---- day overrides ----

/** habitId -> (date -> done). Only stored overrides appear. */
export async function getOverridesForRange(
  habitIds: number[],
  fromDate: string,
  toDate: string,
): Promise<Map<number, Map<string, boolean>>> {
  const map = new Map<number, Map<string, boolean>>();
  if (habitIds.length === 0) { return map; }
  const db = getDB();
  const placeholders = habitIds.map(() => '?').join(',');
  const result = await db.execute(
    `SELECT habit_id, date, done FROM habit_day_overrides
      WHERE habit_id IN (${placeholders}) AND date BETWEEN ? AND ?;`,
    [...habitIds, fromDate, toDate],
  );
  for (const r of (result.rows ?? []) as RawRow[]) {
    const hid = r.habit_id as number;
    const inner = map.get(hid) ?? new Map<string, boolean>();
    inner.set(r.date as string, Boolean(r.done));
    map.set(hid, inner);
  }
  return map;
}

/** `done` null deletes the override → back to auto-derived state. */
export async function setOverride(
  habitId: number,
  date: string,
  done: boolean | null,
): Promise<void> {
  const db = getDB();
  if (done == null) {
    await db.execute('DELETE FROM habit_day_overrides WHERE habit_id = ? AND date = ?;', [
      habitId,
      date,
    ]);
    return;
  }
  await db.execute(
    `INSERT INTO habit_day_overrides (habit_id, date, done) VALUES (?, ?, ?)
     ON CONFLICT(habit_id, date) DO UPDATE SET done = excluded.done;`,
    [habitId, date, done ? 1 : 0],
  );
}
