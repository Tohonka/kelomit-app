import type Database from 'better-sqlite3';
import fineliJson from '../../../src/assets/fineli.json';
import {getDaysInRange, getEntriesInRange, hasTable, loadEntries} from '../../../server/src/queries.ts';
import {categoryStreak, habitDayProgress} from '../../../src/utils/habitMatch.ts';
import type {DayContext, HabitDayProgress} from '../../../src/utils/habitMatch.ts';
import type {
  Entry,
  FineliFood,
  FineliUnit,
  FoodEntry,
  FoodProduct,
  Habit,
  HabitCategory,
  HabitMatcher,
  HealthDaily,
  Nag,
  NamedPlace,
  SavedLocation,
  Trigger,
} from '../../../src/types/index.ts';

/**
 * Round-2 reads: food, habits, nags. Same rule as queries.ts — synchronous
 * reads of the last pushed database, the phone's own pure utils do the maths.
 */

const FINELI_UNIT_LABELS = (fineliJson as unknown as {unitLabels: Record<string, [string, string]>}).unitLabels;
// Same cap as the phone's habitStore: a 120+ day streak just reads 120.
const STREAK_WINDOW_DAYS = 120;

type Row = Record<string, unknown>;

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthBounds(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  return [`${month}-01`, `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`];
}

// ---- food ----

function product(row: Row): FoodProduct {
  return {...(row as unknown as FoodProduct), archived: Boolean(row.archived)};
}

export interface DayFood {
  entries: FoodEntry[];
  /** Products the entries point at, by id. */
  products: Record<number, FoodProduct>;
  kcal: number;
  /** Entries without a kcal figure — the total is a floor when > 0. */
  noKcal: number;
}

export function dayFood(db: Database.Database, date: string): DayFood {
  if (!hasTable(db, 'food_entries')) {
    return {entries: [], products: {}, kcal: 0, noKcal: 0};
  }
  const entries = db
    .prepare(
      `SELECT f.* FROM food_entries f JOIN days d ON d.id = f.day_id
        WHERE d.date = ? ORDER BY f.eaten_at, f.id`
    )
    .all(date) as FoodEntry[];
  const ids = [...new Set(entries.map(e => e.product_id).filter((id): id is number => id != null))];
  const products: Record<number, FoodProduct> = {};
  if (ids.length > 0) {
    const rows = db.prepare(`SELECT * FROM food_products WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Row[];
    for (const r of rows) products[r.id as number] = product(r);
  }
  return {
    entries,
    products,
    kcal: entries.reduce((s, e) => s + (e.kcal ?? 0), 0),
    noKcal: entries.filter(e => e.kcal == null).length,
  };
}

export interface FoodSearch {
  products: FoodProduct[];
  fineli: (FineliFood & {units: FineliUnit[]})[];
  unitLabels: Record<string, [string, string]>;
}

function fineliUnits(db: Database.Database, foodId: number): FineliUnit[] {
  return db.prepare('SELECT code, grams FROM fineli_units WHERE food_id = ? ORDER BY rowid').all(foodId) as FineliUnit[];
}

/** The phone editor's suggestion list, from the pushed tables: own products
 *  (prefix matches first) and Fineli foods with their household units. */
export function foodSearch(db: Database.Database, query: string, lang: 'fi' | 'en' = 'fi'): FoodSearch {
  const q = query.trim();
  const empty: FoodSearch = {products: [], fineli: [], unitLabels: FINELI_UNIT_LABELS};
  if (!q || !hasTable(db, 'food_products')) return empty;
  const products = (
    db
      .prepare(
        `SELECT * FROM food_products
          WHERE archived = 0 AND (name LIKE ? OR brand LIKE ?)
          ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name LIMIT 6`
      )
      .all(`%${q}%`, `%${q}%`, `${q}%`) as Row[]
  ).map(product);
  const own = new Set(products.filter(p => p.source === 'fineli').map(p => p.source_ref));
  const col = lang === 'fi' ? 'name_fi' : 'name_en';
  const fineli = hasTable(db, 'fineli_foods')
    ? (
        db
          .prepare(
            `SELECT * FROM fineli_foods
              WHERE name_fi LIKE ? OR name_en LIKE ?
              ORDER BY CASE WHEN ${col} LIKE ? THEN 0 WHEN name_fi LIKE ? THEN 1 ELSE 2 END, length(${col}) LIMIT 8`
          )
          .all(`%${q}%`, `%${q}%`, `${q}%`, `${q}%`) as FineliFood[]
      )
        .filter(f => !own.has(String(f.id)))
        .map(f => ({...f, units: fineliUnits(db, f.id)}))
    : [];
  return {products, fineli, unitLabels: FINELI_UNIT_LABELS};
}

export interface ProductPortions {
  product: FoodProduct | null;
  units: FineliUnit[];
  unitLabels: Record<string, [string, string]>;
}

/** A product with what the amount picker needs (Fineli household units). */
export function foodProduct(db: Database.Database, id: number): ProductPortions {
  const row = hasTable(db, 'food_products')
    ? (db.prepare('SELECT * FROM food_products WHERE id = ?').get(id) as Row | undefined)
    : undefined;
  const p = row ? product(row) : null;
  const units = p?.source === 'fineli' && p.source_ref && hasTable(db, 'fineli_units') ? fineliUnits(db, Number(p.source_ref)) : [];
  return {product: p, units, unitLabels: FINELI_UNIT_LABELS};
}

// ---- habits ----

export interface HabitsMonth {
  month: string;
  categories: HabitCategory[];
  habits: Habit[];
  matchers: HabitMatcher[];
  triggers: Trigger[];
  /** habitId → date → stored override. */
  overrides: Record<number, Record<string, boolean>>;
  /** habitId → date → auto-derived progress (visible month + streak window). */
  auto: Record<number, Record<string, HabitDayProgress>>;
  /** categoryId → consecutive done days ending today or yesterday. */
  streaks: Record<number, number>;
  today: string;
}

/** Everything needed to answer "was habit h done on date d" over [from, to]:
 *  the phone's stored overrides plus the auto state derived with its own
 *  `habitDayProgress`. Shared by the Habits matrix and Insights. */
export interface HabitStates {
  categories: HabitCategory[];
  habits: Habit[];
  matchers: HabitMatcher[];
  triggers: Trigger[];
  /** habit id → date → stored override */
  overrides: Record<number, Record<string, boolean>>;
  /** habit id → date → derived state (only dates with any progress) */
  auto: Record<number, Record<string, HabitDayProgress>>;
}

export function habitStates(db: Database.Database, from: string, to: string): HabitStates {
  const empty: HabitStates = {categories: [], habits: [], matchers: [], triggers: [], overrides: {}, auto: {}};
  if (!hasTable(db, 'habits')) return empty;
  const categories = (db.prepare('SELECT * FROM habit_categories ORDER BY archived, id').all() as Row[]).map(r => ({
    ...(r as unknown as HabitCategory),
    archived: Boolean(r.archived),
  }));
  const habits = (db.prepare('SELECT * FROM habits ORDER BY archived, id').all() as Row[]).map(r => ({
    ...(r as unknown as Habit),
    archived: Boolean(r.archived),
  }));
  const matchers = db.prepare('SELECT habit_id, kind, ref_id, threshold FROM habit_matchers').all() as HabitMatcher[];
  const triggers = hasTable(db, 'triggers') ? (db.prepare('SELECT * FROM triggers ORDER BY name').all() as Trigger[]) : [];

  const overrides: Record<number, Record<string, boolean>> = {};
  for (const r of db.prepare('SELECT habit_id, date, done FROM habit_day_overrides WHERE date BETWEEN ? AND ?').all(from, to) as {
    habit_id: number;
    date: string;
    done: number;
  }[]) {
    (overrides[r.habit_id] ??= {})[r.date] = Boolean(r.done);
  }

  const byHabit = new Map<number, HabitMatcher[]>();
  for (const m of matchers) byHabit.set(m.habit_id, [...(byHabit.get(m.habit_id) ?? []), m]);
  const active = habits.filter(h => (byHabit.get(h.id)?.length ?? 0) > 0);

  const auto: Record<number, Record<string, HabitDayProgress>> = {};
  if (active.length > 0) {
    const days = getDaysInRange(db, from, to);
    const entries = getEntriesInRange(db, from, to);
    const entriesByDay = new Map<number, Entry[]>();
    for (const e of entries) entriesByDay.set(e.day_id, [...(entriesByDay.get(e.day_id) ?? []), e]);
    const triggerIds = new Map<number, number[]>();
    if (hasTable(db, 'entry_triggers')) {
      for (const r of db
        .prepare(
          `SELECT et.entry_id, et.trigger_id FROM entry_triggers et
             JOIN entries e ON e.id = et.entry_id JOIN days d ON d.id = e.day_id
            WHERE d.date BETWEEN ? AND ?`
        )
        .all(from, to) as {entry_id: number; trigger_id: number}[]) {
        triggerIds.set(r.entry_id, [...(triggerIds.get(r.entry_id) ?? []), r.trigger_id]);
      }
    }
    const health = new Map<string, {steps: number | null; sleep_minutes: number | null}>();
    if (hasTable(db, 'health_daily')) {
      for (const r of db.prepare('SELECT date, steps, sleep_minutes FROM health_daily WHERE date BETWEEN ? AND ?').all(from, to) as {
        date: string;
        steps: number | null;
        sleep_minutes: number | null;
      }[]) {
        health.set(r.date, r);
      }
    }
    const food = new Map<string, {kcal: number; entries: number}>();
    if (hasTable(db, 'food_entries')) {
      for (const r of db
        .prepare(
          `SELECT d.date AS date, COALESCE(SUM(f.kcal), 0) AS kcal, COUNT(*) AS entries
             FROM food_entries f JOIN days d ON d.id = f.day_id
            WHERE d.date BETWEEN ? AND ? GROUP BY d.date`
        )
        .all(from, to) as {date: string; kcal: number; entries: number}[]) {
        food.set(r.date, r);
      }
    }
    const dayByDate = new Map(days.map(d => [d.date, d]));
    const dates = new Set<string>([...dayByDate.keys(), ...health.keys(), ...food.keys()]);
    for (const h of active) {
      const inner: Record<string, HabitDayProgress> = {};
      for (const date of dates) {
        const day = dayByDate.get(date);
        const ctx: DayContext = {health: health.get(date) ?? null, food: food.get(date) ?? null};
        const p = habitDayProgress(h, byHabit.get(h.id)!, day ? entriesByDay.get(day.id) ?? [] : [], triggerIds, ctx);
        if (p.count > 0) inner[date] = p;
      }
      auto[h.id] = inner;
    }
  }
  return {categories, habits, matchers, triggers, overrides, auto};
}

/** override ?? auto — the phone's `effectiveDone`. */
export function habitDone(s: Pick<HabitStates, 'overrides' | 'auto'>, habitId: number, date: string): boolean {
  return s.overrides[habitId]?.[date] ?? s.auto[habitId]?.[date]?.done ?? false;
}

export function habitsMonth(db: Database.Database, month: string): HabitsMonth {
  const today = localToday();
  const [mFrom, mTo] = monthBounds(month);
  const back = shiftDate(today, -STREAK_WINDOW_DAYS);
  const states = habitStates(db, mFrom < back ? mFrom : back, mTo > today ? mTo : today);

  const streaks: Record<number, number> = {};
  for (const c of states.categories) {
    const ids = states.habits.filter(h => h.category_id === c.id && !h.archived).map(h => h.id);
    const byDate = new Map<string, boolean>();
    for (let i = 0; i <= STREAK_WINDOW_DAYS; i++) {
      const d = shiftDate(today, -i);
      if (ids.some(id => habitDone(states, id, d))) byDate.set(d, true);
    }
    streaks[c.id] = categoryStreak(byDate, today);
  }
  return {month, ...states, streaks, today};
}

// ---- nags ----

export interface NagList {
  nags: Nag[];
  /** `${nagId}|${dueAt}` → done_at, the phone's own done-map key. */
  done: Record<string, string>;
}

export function listNags(db: Database.Database): NagList {
  if (!hasTable(db, 'nags')) return {nags: [], done: {}};
  const nags = (db.prepare('SELECT * FROM nags ORDER BY active DESC, title COLLATE NOCASE').all() as Row[]).map(r => ({
    ...(r as unknown as Nag),
    schedule: JSON.parse(r.schedule as string),
    plan: JSON.parse(r.plan as string),
    countdown: Boolean(r.countdown),
    active: Boolean(r.active),
  }));
  const done: Record<string, string> = {};
  for (const r of db.prepare('SELECT nag_id, due_at, done_at FROM nag_done').all() as {
    nag_id: number;
    due_at: string;
    done_at: string;
  }[]) {
    done[`${r.nag_id}|${r.due_at}`] = r.done_at;
  }
  return {nags, done};
}

// ---- places ----

export interface PlaceList {
  named: (NamedPlace & {uses: number})[];
  saved: (SavedLocation & {uses: number})[];
}

/** Named (reusable) places and saved geofence locations, with how many route
 *  stops point at each. */
export function listPlaces(db: Database.Database): PlaceList {
  const stops = hasTable(db, 'day_route_stops');
  const named = hasTable(db, 'named_places')
    ? (db
        .prepare(
          `SELECT p.*, ${stops ? '(SELECT COUNT(*) FROM day_route_stops s WHERE s.named_place_id = p.id)' : '0'} AS uses
             FROM named_places p ORDER BY p.name COLLATE NOCASE`
        )
        .all() as (NamedPlace & {uses: number})[])
    : [];
  const saved = hasTable(db, 'locations')
    ? (db
        .prepare(
          `SELECT l.*, ${stops ? '(SELECT COUNT(*) FROM day_route_stops s WHERE s.saved_location_id = l.id)' : '0'} AS uses
             FROM locations l ORDER BY l.created_at`
        )
        .all() as (SavedLocation & {uses: number})[])
    : [];
  return {named, saved};
}

// ---- health ----

export function dayHealth(db: Database.Database, date: string): HealthDaily | null {
  if (!hasTable(db, 'health_daily')) return null;
  const row = db.prepare('SELECT * FROM health_daily WHERE date = ?').get(date) as (Row & {exercise?: string | null}) | undefined;
  if (!row) return null;
  let exercise: HealthDaily['exercise'] = null;
  if (typeof row.exercise === 'string') {
    try {
      exercise = JSON.parse(row.exercise);
    } catch {
      exercise = null;
    }
  }
  return {...(row as unknown as HealthDaily), exercise};
}

// ---- gallery ----

export interface GalleryItem {
  entry_id: number;
  media_type: string;
  file_path: string;
  thumbnail_path: string | null;
  date: string;
  created_at: string;
  title: string | null;
}

/** Photo / video attachments of a month, newest first — the phone's gallery query, scoped. */
export function gallery(db: Database.Database, month: string): GalleryItem[] {
  if (!hasTable(db, 'entry_media')) return [];
  const [from, to] = monthBounds(month);
  return db
    .prepare(
      `SELECT em.entry_id, em.media_type, em.file_path, em.thumbnail_path, d.date, e.created_at, e.title
         FROM entry_media em
         JOIN entries e ON e.id = em.entry_id
         JOIN days d ON d.id = e.day_id
        WHERE em.media_type IN ('photo', 'video') AND d.date BETWEEN ? AND ?
        ORDER BY d.date DESC, e.created_at DESC, em.position`
    )
    .all(from, to) as GalleryItem[];
}

// ---- search ----

export interface SearchHit {
  entry: Entry;
  date: string;
}

/** The phone's searchEntries: title, body, project and tag names. */
export function search(db: Database.Database, query: string, limit = 60): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT DISTINCT e.id, d.date
         FROM entries e
         JOIN days d ON d.id = e.day_id
         LEFT JOIN projects p ON p.id = e.project_id
         LEFT JOIN entry_tags et ON et.entry_id = e.id
         LEFT JOIN tags t ON t.id = et.tag_id
        WHERE e.title LIKE ? OR e.body LIKE ? OR p.name LIKE ? OR t.name LIKE ?
        ORDER BY d.date DESC, e.created_at DESC
        LIMIT ?`
    )
    .all(like, like, like, like, limit) as {id: number; date: string}[];
  if (rows.length === 0) return [];
  const byId = new Map(
    loadEntries(
      db,
      `e.id IN (${rows.map(() => '?').join(',')})`,
      rows.map(r => r.id)
    ).map(e => [e.id, e])
  );
  return rows.flatMap(r => {
    const entry = byId.get(r.id);
    return entry ? [{entry, date: r.date}] : [];
  });
}
