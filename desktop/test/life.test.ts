import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {dayFood, dayHealth, foodSearch, gallery, habitsMonth, listNags, listPlaces, search} from '../src/main/life.ts';
import {insights, rangeFor} from '../src/main/insights.ts';

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
    CREATE TABLE health_daily (date TEXT PRIMARY KEY, steps INTEGER, distance_m REAL, sleep_minutes INTEGER, sleep_start TEXT, sleep_end TEXT, weight_kg REAL, height_cm REAL, active_kcal REAL, total_kcal REAL, resting_hr INTEGER, exercise TEXT, synced_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE named_places (id INTEGER PRIMARY KEY, name TEXT, latitude REAL, longitude REAL, radius_m REAL, created_at TEXT, updated_at TEXT);
    CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT, kind TEXT, latitude REAL, longitude REAL, radius_m REAL, created_at TEXT, updated_at TEXT);
    CREATE TABLE day_route_stops (id INTEGER PRIMARY KEY, day_id INTEGER, start_ts TEXT, end_ts TEXT, latitude REAL, longitude REAL, saved_location_id INTEGER, named_place_id INTEGER, google_place_id TEXT, display_name TEXT, name_source TEXT, user_edited INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE entry_media (id INTEGER PRIMARY KEY, entry_id INTEGER, media_type TEXT, file_path TEXT, thumbnail_path TEXT, duration_sec INTEGER, transcript TEXT, position INTEGER);
    CREATE TABLE food_products (id INTEGER PRIMARY KEY, barcode TEXT, name TEXT, brand TEXT, kcal_per_100 REAL, kcal_per_serving REAL, protein_per_100 REAL, carbs_per_100 REAL, fat_per_100 REAL, serving_g REAL, serving_label TEXT, source TEXT, source_ref TEXT, image_url TEXT, archived INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE food_entries (id INTEGER PRIMARY KEY, day_id INTEGER, eaten_at TEXT, name TEXT, kcal INTEGER, product_id INTEGER, quantity REAL, unit TEXT, note TEXT, file_path TEXT, thumbnail_path TEXT, latitude REAL, longitude REAL, location_label TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE fineli_foods (id INTEGER PRIMARY KEY, name_fi TEXT, name_en TEXT, name_sv TEXT, kcal_per_100 REAL, protein_per_100 REAL, carbs_per_100 REAL, fat_per_100 REAL);
    CREATE TABLE fineli_units (food_id INTEGER, code TEXT, grams REAL);
    CREATE TABLE nags (id INTEGER PRIMARY KEY, title TEXT, note TEXT, activity_type TEXT, schedule TEXT, plan TEXT, countdown INTEGER DEFAULT 1, active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);
    CREATE TABLE nag_done (nag_id INTEGER, due_at TEXT, done_at TEXT);
    CREATE TABLE day_route_segments (id INTEGER PRIMARY KEY, day_id INTEGER, sequence INTEGER, start_ts TEXT, end_ts TEXT, coordinates_json TEXT, mode_spans_json TEXT, still_seconds REAL, distance_m REAL, duration_sec REAL, average_speed_mps REAL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

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
    INSERT INTO health_daily (date, steps, sleep_minutes, exercise, synced_at) VALUES ('${today}', 9000, 400, '[{"type":8,"minutes":32}]', 'x');
    INSERT INTO named_places (id, name, latitude, longitude, radius_m) VALUES (1, 'Koti', 60.45, 22.27, 150);
    INSERT INTO locations (id, name, kind, latitude, longitude, radius_m) VALUES (1, 'Työ', 'work', 60.46, 22.28, 100);
    INSERT INTO day_route_stops (day_id, start_ts, end_ts, latitude, longitude, named_place_id, display_name, name_source, user_edited) VALUES (1, 'a', 'b', 60.45, 22.27, 1, 'Koti', 'reusable', 0), (2, 'a', 'b', 60.45, 22.27, 1, 'Koti', 'reusable', 0);
    INSERT INTO entry_media (entry_id, media_type, file_path, thumbnail_path, position) VALUES (1, 'photo', '/m/a.jpg', '/m/a_t.jpg', 0), (1, 'voice', '/m/v.m4a', NULL, 1);
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

    INSERT INTO day_route_segments (day_id, sequence, start_ts, end_ts, coordinates_json, mode_spans_json, still_seconds, distance_m, duration_sec, average_speed_mps) VALUES
      (1, 0, '${yesterday}T06:00:00.000Z', '${yesterday}T06:20:00.000Z',
       '[{"latitude":60.4500,"longitude":22.2700,"t":${Date.parse(`${yesterday}T06:00:00.000Z`)}},{"latitude":60.4590,"longitude":22.2700,"t":${Date.parse(`${yesterday}T06:20:00.000Z`)}}]',
       '[{"mode":"foot","startTs":"${yesterday}T06:00:00.000Z","endTs":"${yesterday}T06:20:00.000Z"}]', 0, 1000, 1200, 0.83);
    INSERT INTO settings VALUES ('body_weight_kg', '80'), ('body_height_cm', '180'), ('birth_year', '1985'), ('sex', 'male'), ('weekly_target_hours', '37.5');
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

test('listPlaces counts the stops pointing at each place', () => {
  const p = listPlaces(db);
  assert.equal(p.named[0].name, 'Koti');
  assert.equal(p.named[0].uses, 2);
  assert.equal(p.saved[0].kind, 'work');
  assert.equal(p.saved[0].uses, 0);
});

test('dayHealth parses the exercise JSON and is null on a day without a row', () => {
  const h = dayHealth(db, today);
  assert.equal(h?.steps, 9000);
  assert.deepEqual(h?.exercise, [{type: 8, minutes: 32}]);
  assert.equal(dayHealth(db, '2020-01-01'), null);
});

test('gallery lists only photos/videos of the month with their entry title and date', () => {
  const g = gallery(db, yesterday.slice(0, 7));
  assert.equal(g.length, 1);
  assert.equal(g[0].media_type, 'photo');
  assert.equal(g[0].title, 'Morning run');
  assert.equal(g[0].date, yesterday);
  assert.deepEqual(gallery(db, '2020-01'), []);
});

test('search matches tag names too and returns full entries with their date', () => {
  const hits = search(db, 'run');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].date, yesterday);
  assert.deepEqual(hits[0].entry.tags?.map(t => t.name), ['run']);
  assert.deepEqual(search(db, 'zzz'), []);
  assert.deepEqual(search(db, '  '), []);
});

test('insights: work breakdown by tag, movement from mode spans, food/health totals, energy from the profile, habit days', () => {
  const d = insights(db, 'last30', 'all');
  assert.equal(d.weeklyTargetHours, 37.5);
  assert.equal(d.work.totalSeconds, 2400);
  assert.deepEqual(d.work.byTag.map(s => [s.label, s.seconds]), [['run', 2400]]);
  assert.equal(d.work.byProject[0].label, 'No project');
  assert.equal(d.movement.footSec, 1200);
  assert.ok(d.movement.footM > 900 && d.movement.footM < 1100, `foot metres ${d.movement.footM}`);
  assert.equal(d.movement.footSecByDay[yesterday], 1200);
  assert.deepEqual([d.food.kcal, d.food.entries, d.food.noKcal, d.food.days], [180, 2, 1, 1]);
  assert.equal(d.health.steps, 9000);
  assert.equal(d.health.sleep, 400);
  // Mifflin-St Jeor: 10·80 + 6.25·180 − 5·age + 5
  assert.equal(d.energy.bmr, 800 + 1125 - 5 * (new Date().getFullYear() - 1985) + 5);
  assert.ok(d.energy.usedByDay[yesterday] > d.energy.bmr!, 'a day with a walk uses more than the basal rate');
  assert.equal(d.energy.days, Object.keys(d.energy.usedByDay).length - 1, 'today is not a finished day');
  // Body: Run tagged yesterday (auto) + override today
  assert.deepEqual(d.habits.map(h => [h.title, h.done]), [['Body', 2]]);
  assert.equal(d.patterns.list.length, 0);
  assert.ok(d.patterns.days <= 2);
});

test('insights: the personal scope hides work time, and the week range starts on Monday', () => {
  const d = insights(db, 'week', 'personal');
  assert.equal(d.work.totalSeconds, 0);
  const {start, end} = rangeFor('week', '2026-09-23');
  assert.deepEqual([start, end], ['2026-09-21', '2026-09-23']);
  assert.deepEqual(rangeFor('last30', '2026-09-23'), {start: '2026-08-25', end: '2026-09-23'});
  assert.deepEqual(rangeFor('month', '2026-09-23'), {start: '2026-09-01', end: '2026-09-23'});
});
