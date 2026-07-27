import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, statSync, utimesSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {openCurrent} from '../src/db.ts';
import {listDays, listDaysInRange, getDay, getEntries} from '../src/queries.ts';

let dataDir: string;

function seed(): Database.Database {
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO schema_version VALUES (21);
    CREATE TABLE days (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
      started_at TEXT, ended_at TEXT, notes TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE leave_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'work' CHECK(type IN ('work','personal','other')),
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL, activity_type TEXT NOT NULL DEFAULT 'work',
      title TEXT, body TEXT, project_id INTEGER, file_path TEXT,
      thumbnail_path TEXT, duration_sec INTEGER, time_from TEXT, time_to TEXT,
      latitude REAL, longitude REAL, location_label TEXT,
      is_overtime INTEGER NOT NULL DEFAULT 0,
      created_at TEXT, updated_at TEXT
    );
    INSERT INTO days (id, date, started_at, ended_at) VALUES
      (1, '2026-07-25', '2026-07-25T08:00:00.000Z', '2026-07-25T16:00:00.000Z'),
      (2, '2026-07-26', '2026-07-26T09:00:00.000Z', NULL);
    INSERT INTO entries (day_id, entry_type, activity_type, title, time_from, time_to, created_at)
      VALUES (1, 'note', 'work', 'Morning', '2026-07-25T08:00:00.000Z', '2026-07-25T12:00:00.000Z', '2026-07-25T08:00:00.000Z');
  `);
  return db;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-q-'));
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('openCurrent returns null before the first sync', () => {
  assert.equal(openCurrent(dataDir), null);
});

test('lists days newest first', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  const days = listDays(db, 10);
  assert.deepEqual(days.map(d => d.date), ['2026-07-26', '2026-07-25']);
  assert.equal(days[1].entryCount, 1);
});

test('getDay returns null for an unknown date', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  assert.equal(getDay(db, '1999-01-01'), null);
});

test('listDaysInRange filters by date bounds inclusively', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  assert.deepEqual(
    listDaysInRange(db, '2026-07-25', '2026-07-25').map(d => d.date),
    ['2026-07-25'],
  );
  assert.deepEqual(listDaysInRange(db, '2026-08-01', '2026-08-31'), []);
});

test('range queries include leave-only dates and combined leave categories', () => {
  const seeded = seed();
  seeded.exec(`
    INSERT INTO leave_ranges (type, start_date, end_date) VALUES
      ('vacation', '2026-07-27', '2026-07-27'),
      ('sick', '2026-07-27', '2026-07-27');
  `);
  seeded.close();
  const db = openCurrent(dataDir)!;

  const [summary] = listDaysInRange(db, '2026-07-27', '2026-07-27');
  assert.equal(summary.date, '2026-07-27');
  assert.deepEqual(summary.leaveRanges.map(range => range.type), [
    'vacation',
    'sick',
  ]);
  assert.equal(getDay(db, '2026-07-27')?.date, '2026-07-27');
});

test('getEntries returns the day entries', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  const entries = getEntries(db, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Morning');
  assert.equal(entries[0].is_overtime, false);
});

test('the handle is read-only', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  assert.throws(() => db.exec("INSERT INTO days (date) VALUES ('2026-07-27')"), /readonly/i);
});

test('openCurrent detects a sync swap even with an identical mtime', () => {
  seed().close();
  const currentPath = join(dataDir, 'current.db');
  const firstMtime = statSync(currentPath).mtimeMs;

  const first = openCurrent(dataDir)!;
  assert.deepEqual(listDays(first, 10).map(d => d.date), ['2026-07-26', '2026-07-25']);

  // Build a second, different database at a temp path, then force its mtime
  // to match the first file's exactly before swapping it in — this is what
  // would defeat an mtime-only cache key.
  const secondPath = join(dataDir, 'incoming.db');
  const second = new Database(secondPath);
  second.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO schema_version VALUES (21);
    CREATE TABLE days (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
      started_at TEXT, ended_at TEXT, notes TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE leave_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL, activity_type TEXT NOT NULL DEFAULT 'work',
      title TEXT, body TEXT, project_id INTEGER, file_path TEXT,
      thumbnail_path TEXT, duration_sec INTEGER, time_from TEXT, time_to TEXT,
      latitude REAL, longitude REAL, location_label TEXT,
      is_overtime INTEGER NOT NULL DEFAULT 0,
      created_at TEXT, updated_at TEXT
    );
    INSERT INTO days (id, date, started_at, ended_at) VALUES
      (1, '2026-09-01', '2026-09-01T08:00:00.000Z', NULL);
  `);
  second.close();

  const secondMtimeSeconds = firstMtime / 1000;
  utimesSync(secondPath, secondMtimeSeconds, secondMtimeSeconds);
  renameSync(secondPath, currentPath);
  utimesSync(currentPath, secondMtimeSeconds, secondMtimeSeconds);
  assert.equal(statSync(currentPath).mtimeMs, firstMtime);

  const reopened = openCurrent(dataDir)!;
  assert.deepEqual(listDays(reopened, 10).map(d => d.date), ['2026-09-01']);
});
