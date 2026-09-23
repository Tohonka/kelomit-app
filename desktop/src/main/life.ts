import type Database from 'better-sqlite3';
import fineliJson from '../../../src/assets/fineli.json';
import {getDaysInRange, getEntriesInRange, hasTable} from '../../../server/src/queries.ts';
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
  Nag,
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

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(date: string, days: number): string {
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
        WHERE d.date = ? ORDER BY f.eaten_at, f.id`,
    )
    .all(date) as FoodEntry[];
  const ids = [...new Set(entries.map(e => e.product_id).filter((id): id is number => id != null))];
  const products: Record<number, FoodProduct> = {};
  if (ids.length > 0) {
    const rows = db
      .prepare(`SELECT * FROM food_products WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids) as Row[];
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
          ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name LIMIT 6`,
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
              ORDER BY CASE WHEN ${col} LIKE ? THEN 0 WHEN name_fi LIKE ? THEN 1 ELSE 2 END, length(${col}) LIMIT 8`,
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
  const row = hasTable(db, 'food_products') ? (db.prepare('SELECT * FROM food_products WHERE id = ?').get(id) as Row | undefined) : undefined;
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

/** habitStore.deriveAuto + streakOf, over the pushed database. */
export function habitsMonth(db: Database.Database, month: string): HabitsMonth {
  const today = localToday();
  const empty: HabitsMonth = {
    month, categories: [], habits: [], matchers: [], triggers: [], overrides: {}, auto: {}, streaks: {}, today,
  };
  if (!hasTable(db, 'habits')) return empty;
  const categories = (db.prepare('SELECT * FROM habit_categories ORDER BY archived, id').all() as Row[]).map(
    r => ({...(r as unknown as HabitCategory), archived: Boolean(r.archived)}),
  );
  const habits = (db.prepare('SELECT * FROM habits ORDER BY archived, id').all() as Row[]).map(r => ({
    ...(r as unknown as Habit),
    archived: Boolean(r.archived),
  }));
  const matchers = db.prepare('SELECT habit_id, kind, ref_id, threshold FROM habit_matchers').all() as HabitMatcher[];
  const triggers = hasTable(db, 'triggers') ? (db.prepare('SELECT * FROM triggers ORDER BY name').all() as Trigger[]) : [];

  const [mFrom, mTo] = monthBounds(month);
  const back = shiftDate(today, -STREAK_WINDOW_DAYS);
  const from = mFrom < back ? mFrom : back;
  const to = mTo > today ? mTo : today;

  const overrides: Record<number, Record<string, boolean>> = {};
  for (const r of db
    .prepare('SELECT habit_id, date, done FROM habit_day_overrides WHERE date BETWEEN ? AND ?')
    .all(from, to) as {habit_id: number; date: string; done: number}[]) {
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
            WHERE d.date BETWEEN ? AND ?`,
        )
        .all(from, to) as {entry_id: number; trigger_id: number}[]) {
        triggerIds.set(r.entry_id, [...(triggerIds.get(r.entry_id) ?? []), r.trigger_id]);
      }
    }
    const health = new Map<string, {steps: number | null; sleep_minutes: number | null}>();
    if (hasTable(db, 'health_daily')) {
      for (const r of db
        .prepare('SELECT date, steps, sleep_minutes FROM health_daily WHERE date BETWEEN ? AND ?')
        .all(from, to) as {date: string; steps: number | null; sleep_minutes: number | null}[]) {
        health.set(r.date, r);
      }
    }
    const food = new Map<string, {kcal: number; entries: number}>();
    if (hasTable(db, 'food_entries')) {
      for (const r of db
        .prepare(
          `SELECT d.date AS date, COALESCE(SUM(f.kcal), 0) AS kcal, COUNT(*) AS entries
             FROM food_entries f JOIN days d ON d.id = f.day_id
            WHERE d.date BETWEEN ? AND ? GROUP BY d.date`,
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

  const streaks: Record<number, number> = {};
  for (const c of categories) {
    const ids = habits.filter(h => h.category_id === c.id && !h.archived).map(h => h.id);
    const byDate = new Map<string, boolean>();
    for (let i = 0; i <= STREAK_WINDOW_DAYS; i++) {
      const d = shiftDate(today, -i);
      if (ids.some(id => overrides[id]?.[d] ?? auto[id]?.[d]?.done ?? false)) byDate.set(d, true);
    }
    streaks[c.id] = categoryStreak(byDate, today);
  }
  return {month, categories, habits, matchers, triggers, overrides, auto, streaks, today};
}

// ---- nags ----

export interface NagList {
  nags: Nag[];
  /** `${nagId}|${dueAt}` → done_at, the phone's own done-map key. */
  done: Record<string, string>;
}

export function listNags(db: Database.Database): NagList {
  if (!hasTable(db, 'nags')) return {nags: [], done: {}};
  const nags = (db.prepare('SELECT * FROM nags ORDER BY active DESC, title COLLATE NOCASE').all() as Row[]).map(
    r => ({
      ...(r as unknown as Nag),
      schedule: JSON.parse(r.schedule as string),
      plan: JSON.parse(r.plan as string),
      countdown: Boolean(r.countdown),
      active: Boolean(r.active),
    }),
  );
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
