import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CommandQueue} from '../src/main/queue.ts';
import {PhoneOfflineError} from '../src/main/ws.ts';
import type {Ack} from '../src/main/ws.ts';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kelomit-queue-'));
  file = join(dir, 'queue.json');
});
afterEach(() => {
  rmSync(dir, {recursive: true, force: true});
});

const tick = () => new Promise(r => setTimeout(r, 5));

/** A fake phone link: offline until `online = true`, then acks per `reply`. */
function fakeLink(reply: (fn: string, args: unknown[], id: string) => Ack) {
  const sent: {fn: string; args: unknown[]; id: string}[] = [];
  return {
    online: false,
    sent,
    send(fn: string, args: unknown[], id: string): Promise<Ack> {
      if (!this.online) return Promise.reject(new PhoneOfflineError());
      sent.push({fn, args, id});
      return Promise.resolve(reply(fn, args, id));
    },
  };
}

test('queues while offline, persists, drains in order on reconnect', async () => {
  const link = fakeLink((_fn, _args, id) => ({id, ok: true}));
  let q = new CommandQueue(file, link);
  q.push('entries.create', ['2026-09-23', {title: 'a'}], 'New note');
  q.push('entries.update', [5, {title: 'b'}], 'Edit note');
  await tick();
  assert.equal(link.sent.length, 0);
  assert.equal(q.snapshot().items.length, 2);

  // restart the app
  q = new CommandQueue(file, link);
  assert.equal(q.snapshot().items.length, 2);
  assert.ok(readFileSync(file, 'utf8').includes('entries.update'));

  link.online = true;
  q.drain();
  await tick();
  assert.deepEqual(link.sent.map(s => s.fn), ['entries.create', 'entries.update']);
  assert.equal(q.snapshot().items.length, 0);
});

test('a pending create can be edited and removed in the queue', async () => {
  const link = fakeLink((_fn, _args, id) => ({id, ok: true}));
  const q = new CommandQueue(file, link);
  const id = q.push('entries.create', ['2026-09-23', {title: 'a'}], 'New note');
  await tick();
  assert.equal(q.update(id, ['2026-09-23', {title: 'a edited'}]), true);
  assert.deepEqual(q.snapshot().items[0].args, ['2026-09-23', {title: 'a edited'}]);
  assert.equal(q.remove(id), true);
  assert.equal(q.snapshot().items.length, 0);
  assert.equal(q.remove(id), false);
});

test('a failed ack lands in the failed list and the queue keeps draining', async () => {
  const link = fakeLink((fn, _args, id) =>
    fn === 'entries.delete' ? {id, ok: false, error: 'entry 9 not found'} : {id, ok: true},
  );
  link.online = true;
  const q = new CommandQueue(file, link);
  q.push('entries.delete', [9], 'Delete note');
  q.push('tags.getOrCreate', ['x'], 'New tag');
  await tick();
  const snap = q.snapshot();
  assert.equal(snap.items.length, 0);
  assert.equal(snap.failed.length, 1);
  assert.equal(snap.failed[0].error, 'entry 9 not found');
  assert.deepEqual(link.sent.map(s => s.fn), ['entries.delete', 'tags.getOrCreate']);
  q.dismissFailed(snap.failed[0].item.id);
  assert.equal(q.snapshot().failed.length, 0);
});

test('an ack timeout keeps the item at the head with the same id', async () => {
  let calls = 0;
  const link = fakeLink((_fn, _args, id) => (calls++ === 0 ? {id, ok: false, error: 'ack timeout'} : {id, ok: true}));
  link.online = true;
  const q = new CommandQueue(file, link);
  const id = q.push('tags.rename', [1, 'y'], 'Rename tag');
  await tick();
  assert.equal(q.snapshot().items[0]?.id, id);
  q.drain();
  await tick();
  assert.equal(q.snapshot().items.length, 0);
  assert.equal(link.sent[0].id, link.sent[1].id);
});
