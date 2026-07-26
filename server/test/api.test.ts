import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {apiRoutes} from '../src/routes/api.ts';

let dataDir: string;
let app: ReturnType<typeof apiRoutes>;
const TOKEN = 'test-token';

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

/** node's fetch Request doesn't surface an auto-computed Content-Length header
 *  the way a real HTTP transport does, so tests supply one explicitly. */
function bodyLength(body: RequestInit['body']): number | undefined {
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (body instanceof Buffer || body instanceof Uint8Array) return body.byteLength;
  return undefined;
}

function authed(path: string, init: RequestInit = {}): Request {
  const length = bodyLength(init.body);
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(length !== undefined ? {'Content-Length': String(length)} : {}),
      ...(init.headers ?? {}),
    },
  });
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-api-'));
  app = apiRoutes({dataDir, token: TOKEN});
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('manifest requires a token', async () => {
  const res = await app.fetch(new Request('http://localhost/api/media/manifest'));
  assert.equal(res.status, 401);
});

test('media upload requires a token', async () => {
  const res = await app.fetch(
    new Request('http://localhost/api/media/photo.jpg', {method: 'POST', body: 'bytes'}),
  );
  assert.equal(res.status, 401);
});

test('sync requires a token', async () => {
  const res = await app.fetch(
    new Request('http://localhost/api/sync', {method: 'POST', body: 'not a database'}),
  );
  assert.equal(res.status, 401);
});

test('manifest rejects a wrong token', async () => {
  const res = await app.fetch(
    new Request('http://localhost/api/media/manifest', {
      headers: {Authorization: 'Bearer wrong'},
    }),
  );
  assert.equal(res.status, 401);
});

test('manifest lists uploaded media', async () => {
  await app.fetch(authed('/api/media/photo.jpg', {method: 'POST', body: 'bytes'}));
  const res = await app.fetch(authed('/api/media/manifest'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {files: ['photo.jpg']});
});

test('media upload rejects traversal', async () => {
  const res = await app.fetch(
    authed('/api/media/..%2F..%2Fetc%2Fpasswd', {method: 'POST', body: 'x'}),
  );
  assert.equal(res.status, 400);
  assert.ok(!existsSync(join(dataDir, '..', 'passwd')));
});

test('media upload rejects video', async () => {
  const res = await app.fetch(authed('/api/media/clip.mp4', {method: 'POST', body: 'x'}));
  assert.equal(res.status, 400);
});

test('sync installs a valid database', async () => {
  const res = await app.fetch(
    authed('/api/sync', {method: 'POST', body: validDbBuffer()}),
  );
  assert.equal(res.status, 200);
  assert.ok(existsSync(join(dataDir, 'current.db')));
});

test('sync rejects garbage without touching current.db', async () => {
  await app.fetch(authed('/api/sync', {method: 'POST', body: validDbBuffer()}));
  const before = readFileSync(join(dataDir, 'current.db'));

  const res = await app.fetch(
    authed('/api/sync', {method: 'POST', body: 'not a database'}),
  );

  assert.equal(res.status, 400);
  assert.deepEqual(readFileSync(join(dataDir, 'current.db')), before);
});

test('media upload rejects an oversized Content-Length', async () => {
  const res = await app.fetch(
    authed('/api/media/photo.jpg', {
      method: 'POST',
      body: 'bytes',
      headers: {'Content-Length': String(33 * 1024 * 1024)},
    }),
  );
  assert.equal(res.status, 413);
});

test('media upload of normal size still succeeds', async () => {
  const res = await app.fetch(authed('/api/media/photo.jpg', {method: 'POST', body: 'bytes'}));
  assert.equal(res.status, 200);
});

test('sync rejects an oversized Content-Length', async () => {
  const res = await app.fetch(
    authed('/api/sync', {
      method: 'POST',
      body: 'not a database',
      headers: {'Content-Length': String(129 * 1024 * 1024)},
    }),
  );
  assert.equal(res.status, 413);
});

test('sync of normal size still succeeds', async () => {
  const res = await app.fetch(
    authed('/api/sync', {method: 'POST', body: validDbBuffer()}),
  );
  assert.equal(res.status, 200);
});
