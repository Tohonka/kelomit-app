import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {reportRoutes} from '../src/routes/report.ts';
import {chromiumPath} from '../src/pdf.ts';

let dataDir: string;
let app: ReturnType<typeof reportRoutes>;

/** Two worked days plus a personal-project day, so the report has to apply the
 *  app's hours rules rather than summing entry spans. */
function seed(): void {
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO schema_version VALUES (21);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO settings (key, value) VALUES
      ('report_person_name', 'Tommi'), ('report_company_name', 'Pico');
    CREATE TABLE days (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
      started_at TEXT, ended_at TEXT, notes TEXT, created_at TEXT, updated_at TEXT
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
      created_at TEXT, updated_at TEXT
    );
    INSERT INTO days (id, date, started_at, ended_at) VALUES
      (1, '2026-07-20', '2026-07-20T08:00:00.000Z', '2026-07-20T16:00:00.000Z'),
      (2, '2026-07-21', '2026-07-21T08:00:00.000Z', '2026-07-21T12:00:00.000Z');
    INSERT INTO projects (id, name, type) VALUES (1, 'Home', 'personal');
    INSERT INTO entries (id, day_id, entry_type, activity_type, project_id, title,
                         time_from, time_to, created_at)
      VALUES (10, 1, 'note', 'work', NULL, 'Roof',
              '2026-07-20T09:00:00.000Z', '2026-07-20T10:00:00.000Z', '2026-07-20T09:00:00.000Z'),
             (11, 2, 'note', 'work', 1, 'Fence',
              '2026-07-21T09:00:00.000Z', '2026-07-21T10:00:00.000Z', '2026-07-21T09:00:00.000Z');
  `);
  db.close();
}

function get(query: string): Promise<Response> {
  return app.fetch(new Request(`http://localhost/report${query}`));
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-report-'));
  app = reportRoutes({dataDir});
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('renders an empty state before the first sync', async () => {
  const html = await get('').then(r => r.text());
  assert.match(html, /no data synced yet/i);
});

test('totals the range using the app hours model', async () => {
  seed();
  const html = await get('?from=2026-07-20&to=2026-07-21&language=en').then(r => r.text());
  // Day 1: legs 08:00-16:00 = 8h. Day 2: legs 08:00-12:00 = 4h baseline, minus
  // the 1h entry on a 'personal'-type project = 3h. Total 11h, NOT the 12h a
  // naive leg sum would give, and not the 2h an entry sum would give.
  assert.match(html, /11:00/);
  assert.ok(!html.includes('12:00'));
});

test('defaults person and company from the synced settings', async () => {
  seed();
  const html = await get('?from=2026-07-20&to=2026-07-21').then(r => r.text());
  assert.match(html, /Tommi/);
  assert.match(html, /Pico/);
});

test('reports an empty range without throwing', async () => {
  seed();
  const res = await get('?from=2026-09-01&to=2026-09-30');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /No worked hours in that range/);
});

test('reports a reversed range without throwing', async () => {
  seed();
  const html = await get('?from=2026-07-21&to=2026-07-20').then(r => r.text());
  assert.match(html, /start date is after the end date/i);
});

test('a missing name is reported, not thrown', async () => {
  seed();
  const html = await get('?from=2026-07-20&to=2026-07-21&person=').then(r => r.text());
  assert.match(html, /Enter a name/);
});

test('escapes the name and company', async () => {
  seed();
  const html = await get(
    '?from=2026-07-20&to=2026-07-21&person=%3Cscript%3Ealert(1)%3C%2Fscript%3E&company=X',
  ).then(r => r.text());
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('an unknown type or language falls back instead of throwing', async () => {
  seed();
  const res = await get('?from=2026-07-20&to=2026-07-21&type=evil&language=xx');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /11:00/);
});

test('statistics type adds the project and tag breakdown', async () => {
  seed();
  const html = await get(
    '?from=2026-07-20&to=2026-07-21&type=statistics&language=en',
  ).then(r => r.text());
  assert.match(html, /Statistics/);
  assert.match(html, /By project/);
});

test('carries an A4 print stylesheet', async () => {
  seed();
  const html = await get('?from=2026-07-20&to=2026-07-21').then(r => r.text());
  assert.match(html, /@page \{ size: A4/);
  // The form must not print — it is screen chrome, not part of the document.
  assert.match(html, /@media print/);
});

test('the allocation bars are scaled against the largest row', async () => {
  seed();
  const html = await get(
    '?from=2026-07-20&to=2026-07-21&type=statistics&language=en',
  ).then(r => r.text());
  // Widest row is always 100%; nothing may exceed it.
  const widths = [...html.matchAll(/sheet-bar"><span style="width:([\d.]+)%/g)].map(m =>
    Number(m[1]),
  );
  assert.ok(widths.length > 0, 'expected at least one allocation bar');
  assert.equal(Math.max(...widths), 100);
  assert.ok(widths.every(w => w >= 0 && w <= 100));
});

function getPdf(query: string): Promise<Response> {
  return app.fetch(new Request(`http://localhost/report.pdf${query}`));
}

test('the PDF route reports a bad range instead of launching a browser', async () => {
  seed();
  const res = await getPdf('?from=2026-07-21&to=2026-07-20');
  assert.equal(res.status, 400);
  assert.match(await res.text(), /start date is after the end date/i);
});

test('the PDF route 404s before the first sync', async () => {
  const res = await getPdf('?from=2026-07-20&to=2026-07-21');
  assert.equal(res.status, 404);
});

// Needs a real browser. The image installs Alpine's chromium; on a dev machine
// this picks up an installed Chrome. Without one there is nothing to assert.
test('the PDF route returns a real PDF file', {skip: chromiumPath() === null}, async () => {
  seed();
  const res = await getPdf('?from=2026-07-20&to=2026-07-21&type=statistics&language=en');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(
    res.headers.get('content-disposition') ?? '',
    /attachment; filename="work-report-2026-07-20-to-2026-07-21\.pdf"/,
  );
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(bytes.length > 1000, `suspiciously small PDF: ${bytes.length} bytes`);
});

// Work-period times are wall-clock, so they follow the process timezone. The
// image pins TZ for exactly this reason; a UTC container silently shifts every
// printed time by the offset.
test('work periods print in the process timezone', async () => {
  seed();
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Helsinki';
    // Day 1's legs run 08:00-16:00Z, i.e. 11:00-19:00 in Helsinki.
    const html = await get('?from=2026-07-20&to=2026-07-20&language=en').then(r => r.text());
    assert.match(html, /11:00-19:00/);

    process.env.TZ = 'UTC';
    const utc = await get('?from=2026-07-20&to=2026-07-20&language=en').then(r => r.text());
    assert.match(utc, /08:00-16:00/);
  } finally {
    process.env.TZ = original;
  }
});
