import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {monthSummary, dayDetail} from '../src/main/queries.ts';

let dir: string;
let db: Database.Database;

function seed(): Database.Database {
  const d = new Database(join(dir, 'current.db'));
  d.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO schema_version VALUES (35);
    CREATE TABLE days (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
      started_at TEXT, ended_at TEXT, started_at_2 TEXT, ended_at_2 TEXT,
      started_at_source TEXT, ended_at_source TEXT, notes TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE leave_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'work', archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT);
    CREATE TABLE entry_tags (entry_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (entry_id, tag_id));
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL, activity_type TEXT NOT NULL DEFAULT 'work',
      title TEXT, body TEXT, project_id INTEGER, parent_id INTEGER, file_path TEXT,
      thumbnail_path TEXT, duration_sec INTEGER, time_from TEXT, time_to TEXT,
      latitude REAL, longitude REAL, location_label TEXT,
      is_todo INTEGER NOT NULL DEFAULT 0, is_overtime INTEGER NOT NULL DEFAULT 0,
      is_small_task INTEGER NOT NULL DEFAULT 0,
      scheduled_date TEXT, completed_at TEXT, reminder_at TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE entry_media (id INTEGER PRIMARY KEY, entry_id INTEGER, media_type TEXT, file_path TEXT, thumbnail_path TEXT, duration_sec INTEGER, transcript TEXT, position INTEGER);
    CREATE TABLE day_route_segments (day_id INTEGER, sequence INTEGER, start_ts TEXT, end_ts TEXT, coordinates_json TEXT, distance_m REAL, duration_sec INTEGER, average_speed_mps REAL);
    CREATE TABLE day_route_stops (day_id INTEGER, start_ts TEXT, end_ts TEXT, latitude REAL, longitude REAL, display_name TEXT);
    INSERT INTO projects (id, name, type) VALUES (1, 'Hobby', 'personal');
    INSERT INTO days (id, date, started_at, ended_at) VALUES
      (1, '2026-09-15', '2026-09-15T06:00:00.000Z', '2026-09-15T14:00:00.000Z'),
      (2, '2026-09-16', NULL, NULL);
    -- 8h legs, minus 1h of a personal-project entry inside them = 7h
    INSERT INTO entries (day_id, entry_type, activity_type, title, project_id, time_from, time_to, created_at)
      VALUES (1, 'note', 'work', 'Side thing', 1, '2026-09-15T10:00:00.000Z', '2026-09-15T11:00:00.000Z', '2026-09-15T10:00:00.000Z');
    -- no legs: entry sum fallback, 30 min
    INSERT INTO entries (day_id, entry_type, activity_type, title, duration_sec, created_at)
      VALUES (2, 'note', 'work', 'Quick', 1800, '2026-09-16T10:00:00.000Z');
    INSERT INTO leave_ranges (type, start_date, end_date) VALUES ('vacation', '2026-09-28', '2026-10-02');
  `);
  return d;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kelomit-desktop-'));
  db = seed();
});
afterEach(() => {
  db.close();
  rmSync(dir, {recursive: true, force: true});
});

test('monthSummary folds days through the phone hours model, project type included', () => {
  const m = monthSummary(db, '2026-09');
  const d15 = m.days.find(d => d.date === '2026-09-15');
  const d16 = m.days.find(d => d.date === '2026-09-16');
  assert.equal(d15?.workSeconds, 7 * 3600);
  assert.equal(d15?.hasLegs, true);
  assert.equal(d16?.workSeconds, 1800);
  assert.equal(m.totalWorkSeconds, 7 * 3600 + 1800);
});

test('monthSummary lists leave days inside the month, clamped to it', () => {
  const m = monthSummary(db, '2026-09');
  const leaveDays = m.days.filter(d => d.leaves.length > 0).map(d => d.date);
  assert.deepEqual(leaveDays, ['2026-09-28', '2026-09-29', '2026-09-30']);
  const oct = monthSummary(db, '2026-10');
  assert.deepEqual(oct.days.map(d => d.date), ['2026-10-01', '2026-10-02']);
});

test('dayDetail returns entries with project attached and empty route arrays', () => {
  const d = dayDetail(db, '2026-09-15');
  assert.equal(d.day?.id, 1);
  assert.equal(d.entries[0].project?.type, 'personal');
  assert.deepEqual(d.segments, []);
  assert.deepEqual(d.stops, []);
});

test('dayDetail on an unknown day is empty, not an error', () => {
  const d = dayDetail(db, '2026-09-20');
  assert.equal(d.day, null);
  assert.deepEqual(d.entries, []);
});
