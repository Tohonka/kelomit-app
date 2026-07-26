import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {ingestDatabase, pruneSnapshots} from '../src/ingest.ts';

let dataDir: string;

/** A minimal but valid Kelomit database, as a buffer. */
function validDbBuffer(): Buffer {
  const p = join(dataDir, 'fixture.db');
  const db = new Database(p);
  db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
  db.exec('INSERT INTO schema_version (version) VALUES (21)');
  db.close();
  const buf = readFileSync(p);
  rmSync(p);
  return buf;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-ingest-'));
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('installs a valid upload as current.db', async () => {
  await ingestDatabase(validDbBuffer(), {dataDir});
  assert.ok(existsSync(join(dataDir, 'current.db')));
  const db = new Database(join(dataDir, 'current.db'), {readonly: true});
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {v: number};
  assert.equal(row.v, 21);
  db.close();
});

test('keeps a timestamped snapshot', async () => {
  await ingestDatabase(validDbBuffer(), {dataDir});
  const snaps = readdirSync(join(dataDir, 'snapshots'));
  assert.equal(snaps.length, 1);
  assert.match(snaps[0], /^kelomit-\d{8}-\d{6}\.db$/);
});

test('rejects a body that is not a database and leaves current.db intact', async () => {
  await ingestDatabase(validDbBuffer(), {dataDir});
  const before = readFileSync(join(dataDir, 'current.db'));

  await assert.rejects(
    () => ingestDatabase(Buffer.from('this is not sqlite'), {dataDir}),
    /invalid database/,
  );

  assert.deepEqual(readFileSync(join(dataDir, 'current.db')), before);
});

test('rejects a truncated sqlite file', async () => {
  const truncated = validDbBuffer().subarray(0, 100);
  await assert.rejects(() => ingestDatabase(truncated, {dataDir}), /invalid database/);
  assert.ok(!existsSync(join(dataDir, 'current.db')));
});

test('rejects a database with no schema_version table', async () => {
  const p = join(dataDir, 'wrong.db');
  const db = new Database(p);
  db.exec('CREATE TABLE unrelated (id INTEGER)');
  db.close();
  const buf = readFileSync(p);
  rmSync(p);
  await assert.rejects(() => ingestDatabase(buf, {dataDir}), /invalid database/);
});

test('pruneSnapshots keeps only the newest N', () => {
  const snapDir = join(dataDir, 'snapshots');
  writeFileSync(join(dataDir, 'ignore-me'), 'x');
  mkdirSync(snapDir, {recursive: true});
  for (const name of ['kelomit-20260101-000000.db', 'kelomit-20260102-000000.db', 'kelomit-20260103-000000.db']) {
    writeFileSync(join(snapDir, name), 'x');
  }

  pruneSnapshots(dataDir, 2);

  const left = readdirSync(snapDir).sort();
  assert.deepEqual(left, ['kelomit-20260102-000000.db', 'kelomit-20260103-000000.db']);
});
