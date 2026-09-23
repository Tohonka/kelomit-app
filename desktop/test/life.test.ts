import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {dayFood, foodSearch, habitsMonth, listNags} from '../src/main/life.ts';

let dir: string;
let db: Database.Database;

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const yesterday = (() => {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

function seed(): Database.Database {
  const d = new Database(join(dir, 'current.db'));
  d.exec(`
    CREATE TABLE days (id INTEGER PRIMARY KEY, date TEXT UNIQUE, started_at TEXT, ended_at TEXT, started_at_2 TEXT, ended_at_2 TEXT, started_at_source TEXT, ended_at_source TEXT, notes TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, type TEXT DEFAULT 'work', archived INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
    CREATE TABLE entry_tags (entry_id INTEGER, tag_id INTEGER);
    CREATE TABLE entries (id INTEGER PRIMARY KEY, day_id INTEGER, entry_type TEXT, activity_type TEXT DEFAULT 'work', title TEXT, body TEXT, project_id INTEGER, parent_id INTEGER, file_path TEXT, thumbnail_path TEXT, duration_sec INTEGER, time_from TEXT, time_to TEXT, latitude REAL, longitude REAL, location_label TEXT, is_todo INTEGER DEFAULT 0, is_overtime INTEGER DEFAULT 0, is_small_task INTEGER DEFAULT 0, scheduled_date TEXT, completed_at TEXT, reminder_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE triggers (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
    CREATE TABLE entry_triggers (entry_id INTEGER, trigger_id INTEGER);
    CREATE TABLE habit_categories (id INTEGER PRIMARY KEY, title TEXT, description TEXT, icon TEXT, goal_streak_days INTEGER, archived INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE habits (id INTEGER PRIMARY KEY, category_id INTEGER, title TEXT, description TEXT, icon TEXT, color TEXT, goal_kind TEXT, goal_value INTEGER, archived INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE habit_matchers (habit_id INTEGER, kind TEXT, ref_id INTEGER DEFAULT 0, threshold REAL);
    CREATE TABLE habit_day_overrides (habit_id INTEGER, date TEXT, done INTEGER, created_at TEXT);
    CREATE TABLE health_daily (date TEXT PRIMARY KEY, steps INTEGER, sleep_minutes INTEGER);
    CREATE TABLE food_products (id INTEGER PRIMARY KEY, barcode TEXT, name TEXT, brand TEXT, kcal_per_100 REAL, kcal_per_serving REAL, protein_per_100 REAL, carbs_per_100 REAL, fat_per_100 REAL, serving_g REAL, serving_label TEXT, source TEXT, source_ref TEXT, image_url TEXT, archived INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE food_entries (id INTEGER PRIMARY KEY, day_id INTEGER, eaten_at TEXT, name TEXT, kcal INTEGER, product_id INTEGER, quantity REAL, unit TEXT, note TEXT, file_path TEXT, thumbnail_path TEXT, latitude REAL, longitude REAL, location_label TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE fineli_foods (id INTEGER PRIMARY KEY, name_fi TEXT, name_en TEXT, name_sv TEXT, kcal_per_100 REAL, protein_per_100 REAL, carbs_per_100 REAL, fat_per_100 REAL);
    CREATE TABLE fineli_units (food_id INTEGER, code TEXT, grams REAL);
    CREATE TABLE nags (id INTEGER PRIMARY KEY, title TEXT, note TEXT, activity_type TEXT, schedule TEXT, plan TEXT, countdown INTEGER DEFAULT 1, active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);
    CREATE TABLE nag_done (nag_id INTEGER, due_at TEXT, done_at TEXT);

    INSERT INTO days (id, date) VALUES (1, '${yesterday}'), (2, '${today}');
    INSERT INTO tags (id, name) VALUES (1, 'run');
    INSERT INTO entries (id, day_id, entry_type, title, time_from, time_to, created_at) VALUES
      (1, 1, 'note', 'Morning run', '${yesterday}T05:00:00.000Z', '${yesterday}T05:40:00.000Z', 'x');
    INSERT INTO entry_tags VALUES (1, 1);
    INSERT INTO habit_categories (id, title, icon) VALUES (1, 'Body', 'star');
    INSERT INTO habits (id, category_id, title, icon, goal_kind, goal_value) VALUES
      (1, 1, 'Run', 'run', 'minutes', 30),
      (2, 1, 'Steps', 'walk', NULL, NULL),
      (3, 1, 'No matchers', 'x', NULL, NULL);
    INSERT INTO habit_matchers VALUES (1, 'tag', 1, NULL), (2, 'steps', 0, 8000);
    INSERT INTO health_daily VALUES ('${today}', 9000, 400);
    INSERT INTO habit_day_overrides (habit_id, date, done) VALUES (1, '${today}', 1);

    INSERT INTO food_products (id, barcode, name, brand, kcal_per_100, source, source_ref) VALUES
      (1, '641', 'Maito', 'Valio', 46, 'off', '641'),
      (2, NULL, 'Kaurapuuro', NULL, 60, 'fineli', '100');
    INSERT INTO food_entries (day_id, eaten_at, name, kcal, product_id, quantity, unit) VALUES
      (2, '${today}T06:00:00.000Z', 'Kaurapuuro', 180, 2, 300, 'g'),
      (2, '${today}T09:00:00.000Z', 'Coffee', NULL, NULL, NULL, NULL);
    INSERT INTO fineli_foods (id, name_fi, name_en, kcal_per_100) VALUES (100, 'Kaurapuuro', 'Oat porridge', 60), (101, 'Kaurahiutale', 'Oat flakes', 370);
    INSERT INTO fineli_units VALUES (101, 'DL', 35);

    INSERT INTO nags (id, title, activity_type, schedule, plan, active) VALUES
      (1, 'Water', 'personal', '{"kind":"weekly","weekdays":[1,2,3,4,5,6,7],"time":"09:00"}', '{}', 1),
      (2, 'Old', 'work', '{"kind":"once","at":"2026-01-01T07:00:00.000Z"}', '{"hoursBefore":1}', 0);
    INSERT INTO nag_done VALUES (2, '2026-01-01T07:00:00.000Z', '2026-01-01T07:05:00.000Z');
  `);
  return d;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kelomit-desktop-life-'));
  db = seed();
});
afterEach(() => {
  db.close();
  rmSync(dir, {recursive: true, force: true});
});

test('dayFood sums kcal, counts kcal-less rows and attaches the products used', () => {
  const f = dayFood(db, today);
  assert.equal(f.entries.length, 2);
  assert.equal(f.kcal, 180);
  assert.equal(f.noKcal, 1);
  assert.equal(f.products[2]?.source, 'fineli');
  assert.deepEqual(dayFood(db, '2020-01-01').entries, []);
});

test('foodSearch: own products first, Fineli foods with units, a Fineli food already saved as a product is not repeated', () => {
  const r = foodSearch(db, 'kaura', 'fi');
  assert.deepEqual(r.products.map(p => p.name), ['Kaurapuuro']);
  assert.deepEqual(r.fineli.map(f => f.id), [101]);
  assert.deepEqual(r.fineli[0].units, [{code: 'DL', grams: 35}]);
  assert.ok(r.unitLabels.DL);
  assert.deepEqual(foodSearch(db, '  ').products, []);
});

test('habitsMonth derives auto state from tagged notes and health totals, keeps overrides apart, and counts the category streak', () => {
  const h = habitsMonth(db, today.slice(0, 7));
  // 40 min tagged #run ≥ 30 min goal → yesterday auto-done
  assert.equal(h.auto[1]?.[yesterday]?.done, true);
  assert.equal(h.auto[1]?.[yesterday]?.seconds, 2400);
  // 9000 steps ≥ 8000 → today auto-done for the steps habit
  assert.equal(h.auto[2]?.[today]?.done, true);
  assert.equal(h.auto[3], undefined, 'a habit without matchers is never auto-derived');
  assert.equal(h.overrides[1]?.[today], true);
  // yesterday (auto) + today (override) → streak 2
  assert.equal(h.streaks[1], 2);
  assert.equal(h.today, today);
});

test('listNags parses schedule/plan JSON and exposes the done map with the phone key', () => {
  const n = listNags(db);
  assert.equal(n.nags[0].title, 'Water');
  assert.deepEqual(n.nags[0].schedule, {kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7], time: '09:00'});
  assert.equal(n.nags[1].active, false);
  assert.equal(n.nags[1].plan.hoursBefore, 1);
  assert.equal(n.done['2|2026-01-01T07:00:00.000Z'], '2026-01-01T07:05:00.000Z');
});

test('life reads on a database that predates the tables are empty, not errors', () => {
  const old = new Database(':memory:');
  old.exec('CREATE TABLE days (id INTEGER PRIMARY KEY, date TEXT)');
  assert.deepEqual(dayFood(old, today).entries, []);
  assert.deepEqual(habitsMonth(old, '2026-09').habits, []);
  assert.deepEqual(listNags(old).nags, []);
});
