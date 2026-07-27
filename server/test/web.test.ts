import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {webRoutes} from '../src/routes/web.ts';

let dataDir: string;
let app: ReturnType<typeof webRoutes>;

function seed(): void {
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO schema_version VALUES (21);
    CREATE TABLE days (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
      started_at TEXT, ended_at TEXT, started_at_2 TEXT, ended_at_2 TEXT,
      notes TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'work' CHECK(type IN ('work','personal','other')),
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL, activity_type TEXT NOT NULL DEFAULT 'work',
      title TEXT, body TEXT, project_id INTEGER, file_path TEXT,
      thumbnail_path TEXT, duration_sec INTEGER, time_from TEXT, time_to TEXT,
      latitude REAL, longitude REAL, location_label TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE entry_tags (
      entry_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
      PRIMARY KEY (entry_id, tag_id)
    );
    CREATE TABLE entry_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL,
      media_type TEXT NOT NULL, file_path TEXT NOT NULL, thumbnail_path TEXT,
      duration_sec INTEGER, position INTEGER NOT NULL DEFAULT 0,
      transcript TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE day_route_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL, sequence INTEGER,
      start_ts TEXT, end_ts TEXT, origin_stop_id INTEGER, destination_stop_id INTEGER,
      coordinates_json TEXT, distance_m REAL, duration_sec REAL,
      average_speed_mps REAL, maximum_speed_mps REAL, raw_last_ts TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE day_route_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      start_ts TEXT, end_ts TEXT, latitude REAL, longitude REAL,
      saved_location_id INTEGER, named_place_id INTEGER, google_place_id TEXT,
      display_name TEXT, name_source TEXT, user_edited INTEGER,
      created_at TEXT, updated_at TEXT
    );
    INSERT INTO days (id, date, started_at, ended_at)
      VALUES (1, '2026-07-25', '2026-07-25T08:00:00.000Z', '2026-07-25T16:00:00.000Z');
    INSERT INTO entries (day_id, entry_type, activity_type, title, time_from, time_to, created_at)
      VALUES (1, 'note', 'work', '<script>alert(1)</script>',
              '2026-07-25T08:00:00.000Z', '2026-07-25T12:00:00.000Z', '2026-07-25T08:00:00.000Z');
    INSERT INTO entry_media (entry_id, media_type, file_path, position)
      VALUES (1, 'photo', '/data/user/0/app/files/kelomit/media/shot.jpg', 0);
  `);
  db.close();
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-web-'));
  app = webRoutes({dataDir});
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('renders an empty state before the first sync', async () => {
  const res = await app.fetch(new Request('http://localhost/'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /no data/i);
});

test('day list shows synced days', async () => {
  seed();
  const res = await app.fetch(new Request('http://localhost/'));
  assert.match(await res.text(), /2026-07-25/);
});

test('day page shows both legs and the worked adjustments', async () => {
  seed();
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    UPDATE days SET started_at_2 = '2026-07-25T17:00:00.000Z',
                    ended_at_2   = '2026-07-25T18:00:00.000Z' WHERE id = 1;
    INSERT INTO entries (day_id, entry_type, activity_type, title, time_from, time_to, created_at)
      VALUES (1, 'note', 'work', 'Late call',
              '2026-07-25T19:00:00.000Z', '2026-07-25T20:00:00.000Z', '2026-07-25T19:00:00.000Z'),
             (1, 'note', 'personal', 'Dentist',
              '2026-07-25T12:00:00.000Z', '2026-07-25T12:30:00.000Z', '2026-07-25T12:00:00.000Z');
  `);
  db.close();
  const html = await app.fetch(new Request('http://localhost/day/2026-07-25')).then(r => r.text());
  // Legs 08–16 and 17–18 = 9h baseline, +1h after hours, −30m personal = 9h 30m.
  assert.match(html, /08:00 &rarr; 16:00/);
  assert.match(html, /17:00 &rarr; 18:00/);
  assert.match(html, /Worked/);
  assert.match(html, /9h 30m/);
  assert.match(html, /\+1h after hours/);
  assert.match(html, /−0h 30m personal/);
});

test('day page escapes entry titles', async () => {
  seed();
  const res = await app.fetch(new Request('http://localhost/day/2026-07-25'));
  const html = await res.text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('day page links media by basename', async () => {
  seed();
  const html = await (await app.fetch(new Request('http://localhost/day/2026-07-25'))).text();
  assert.match(html, /\/media\/shot\.jpg/);
  assert.ok(!html.includes('/data/user/0/app/files'));
});

test('day page shows an entry\u2019s tags and project', async () => {
  seed();
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    INSERT INTO projects (id, name, type) VALUES (7, 'Roofing', 'work');
    INSERT INTO tags (id, name) VALUES (1, 'invoiced'), (2, 'urgent');
    INSERT INTO entries (id, day_id, entry_type, activity_type, project_id, title,
                         time_from, time_to, created_at)
      VALUES (50, 1, 'note', 'work', 7, 'Gutter run',
              '2026-07-25T13:00:00.000Z', '2026-07-25T14:00:00.000Z', '2026-07-25T13:00:00.000Z');
    INSERT INTO entry_tags (entry_id, tag_id) VALUES (50, 1), (50, 2);
  `);
  db.close();
  const html = await app.fetch(new Request('http://localhost/day/2026-07-25')).then(r => r.text());
  assert.match(html, /#invoiced/);
  assert.match(html, /#urgent/);
  assert.match(html, /Roofing/);
});

test('section labels are not double-escaped', async () => {
  seed();
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    INSERT INTO day_route_segments (day_id, sequence, start_ts, end_ts, coordinates_json,
                                    distance_m, duration_sec, average_speed_mps,
                                    maximum_speed_mps, raw_last_ts)
      VALUES (1, 0, '2026-07-25T10:00:00.000Z', '2026-07-25T10:20:00.000Z', '[]',
              12300, 1200, 10, 20, '2026-07-25T10:20:00.000Z');
  `);
  db.close();
  const html = await app.fetch(new Request('http://localhost/day/2026-07-25')).then(r => r.text());
  // section() escapes its label, so an HTML entity in the label would surface
  // to the reader as a literal `&middot;`.
  assert.ok(!html.includes('&amp;middot;'));
  assert.match(html, /Route .* 1 trip, 12\.3 km/);
});

test('unknown day returns 404', async () => {
  seed();
  const res = await app.fetch(new Request('http://localhost/day/1999-01-01'));
  assert.equal(res.status, 404);
});

test('summary totals hours over a range', async () => {
  seed();
  const html = await (await app.fetch(
    new Request('http://localhost/summary?from=2026-07-01&to=2026-07-31'),
  )).text();
  assert.match(html, /8h/);
  assert.match(html, /2026-07-25/);
});

test('summary excludes days outside the range', async () => {
  seed();
  const html = await (await app.fetch(
    new Request('http://localhost/summary?from=2026-08-01&to=2026-08-31'),
  )).text();
  assert.ok(!html.includes('2026-07-25'));
  assert.match(html, /0h/);
});

test('day page hours match hoursUtils for the same day', async () => {
  seed();
  const html = await (await app.fetch(new Request('http://localhost/day/2026-07-25'))).text();
  // The day's legs run 08:00–16:00, so the baseline is 8 h. The work entry
  // (08:00–12:00) falls inside the legs and therefore adds nothing — this is
  // the "work day is the minimum" model in docs/hours-model.md. Asserting 8h
  // rather than the entry's 4h is what proves calcDayWorkSecs is really being
  // called instead of a naive entry sum.
  assert.match(html, /class="hours-big">8h</);
});

test('day page deducts a work-activity entry on a personal project', async () => {
  seed();
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    INSERT INTO projects (id, name, type) VALUES (1, 'Home', 'personal');
    INSERT INTO entries (day_id, entry_type, activity_type, project_id, title, time_from, time_to, created_at)
      VALUES (1, 'note', 'work', 1, 'painting the fence',
              '2026-07-25T09:00:00.000Z', '2026-07-25T10:00:00.000Z', '2026-07-25T09:00:00.000Z');
  `);
  db.close();
  const html = await (await app.fetch(new Request('http://localhost/day/2026-07-25'))).text();
  // Legs run 08:00-16:00 (8h baseline). The new entry is activity_type 'work'
  // but attached to a 'personal'-type project, so the app's model
  // (hoursUtils.dayWorkActivity) treats it as personal and deducts its 1h
  // from the baseline: 8h - 1h = 7h. If the server fed bare rows (no
  // entry.project), it would stay 'work' and add nothing, still showing 8h
  // — this test only distinguishes the two when the join is present.
  assert.match(html, /class="hours-big">7h</);
  assert.ok(!html.includes('class="hours-big">8h<'));
});
