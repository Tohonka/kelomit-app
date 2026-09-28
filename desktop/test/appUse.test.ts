import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {classify, isLockScreen, parseFront} from '../src/main/appUse/signals.ts';
import {AppUseStore} from '../src/main/appUse/store.ts';
import {build, mergeLive} from '../src/main/appUse/read.ts';
import type {AutoRow, AssignRow} from '../src/main/appUse/read.ts';
import {AppUseCollector, TICK_MS} from '../src/main/appUse/collector.ts';
import type {QueueSnapshot} from '../src/main/queue.ts';

test('parseFront reads name and bundle id from lsappinfo output', () => {
  const out = `"Google Chrome" ASN:0x0-0xe00e: (in front) \n    bundleID="com.google.Chrome"\n    pid = 697\n`;
  assert.deepEqual(parseFront(out), {bundleId: 'com.google.Chrome', name: 'Google Chrome'});
});

test('parseFront falls back to the name when there is no bundle id, null on garbage', () => {
  assert.deepEqual(parseFront(`"node" ASN:0x0-0x1: (in front)\n    pid = 1\n`), {bundleId: 'node', name: 'node'});
  assert.equal(parseFront(''), null);
});

test('classify: away wins, then idle by threshold', () => {
  assert.equal(classify({away: true, idleSeconds: 0, idleAfter: 60}), 'away');
  assert.equal(classify({away: false, idleSeconds: 59, idleAfter: 60}), 'active');
  assert.equal(classify({away: false, idleSeconds: 60, idleAfter: 60}), 'idle');
});

test('isLockScreen: loginwindow in front means the saver or the lock screen is up', () => {
  assert.equal(isLockScreen({bundleId: 'com.apple.loginwindow', name: 'loginwindow'}), true);
  assert.equal(isLockScreen({bundleId: 'com.google.Chrome', name: 'Google Chrome'}), false);
  assert.equal(isLockScreen(null), false);
});

const chrome = {bundleId: 'com.google.Chrome', name: 'Google Chrome'};

test('store accumulates per (date, app, session) and tracks dirty days', () => {
  const s = new AppUseStore(null);
  s.add('2026-09-28', chrome, '', 'active', 5);
  s.add('2026-09-28', chrome, '', 'idle', 5);
  s.add('2026-09-28', chrome, '2026-09-28T07:00:00.000Z', 'active', 5);
  s.add('2026-09-27', chrome, '', 'active', 5);
  assert.deepEqual(s.rows('2026-09-28'), [
    {bundle_id: 'com.google.Chrome', app_name: 'Google Chrome', session_from: '', active_sec: 5, idle_sec: 5},
    {bundle_id: 'com.google.Chrome', app_name: 'Google Chrome', session_from: '2026-09-28T07:00:00.000Z', active_sec: 5, idle_sec: 0},
  ]);
  assert.deepEqual(s.dirtyDates(), ['2026-09-27', '2026-09-28']);
  s.markClean('2026-09-27');
  assert.deepEqual(s.dirtyDates(), ['2026-09-28']);
  s.markDirty('2026-09-27');
  s.markDirty('2026-01-01'); // unknown day: no-op
  assert.deepEqual(s.dirtyDates(), ['2026-09-27', '2026-09-28']);
});

test('store persists and reloads; prune drops old clean days only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'appuse-'));
  try {
    const file = join(dir, 'appuse.json');
    const a = new AppUseStore(file);
    a.add('2026-09-10', chrome, '', 'active', 5);
    a.add('2026-09-20', chrome, '', 'active', 5);
    a.add('2026-09-28', chrome, '', 'active', 5);
    a.markClean('2026-09-10');
    a.markClean('2026-09-20');
    const b = new AppUseStore(file);
    assert.deepEqual(b.dirtyDates(), ['2026-09-28']);
    b.prune('2026-09-28', 7);
    assert.equal(b.has('2026-09-10'), false); // old and clean
    assert.equal(b.has('2026-09-20'), false); // 8 days: older than the window
    assert.equal(b.has('2026-09-28'), true);
    const c = new AppUseStore(file);
    assert.equal(c.has('2026-09-10'), false);
    b.add('2026-09-01', chrome, '', 'active', 5); // dirty and old: kept
    b.prune('2026-09-28', 7);
    assert.equal(b.has('2026-09-01'), true);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

const auto = (p: Partial<AutoRow>): AutoRow => ({
  id: 1, date: '2026-09-28', bundle_id: 'com.google.Chrome', app_name: 'Google Chrome', session_from: '',
  entry_id: null, detached: 0, active_sec: 0, idle_sec: 0, title: null, ...p,
});

test('build: free, timer-attached, pending and detached buckets; manual chunks reduce unassigned', () => {
  const rows: AutoRow[] = [
    auto({id: 1, active_sec: 600, idle_sec: 60}),
    auto({id: 2, session_from: 'S1', entry_id: 7, title: 'Banana #3', active_sec: 300}),
    auto({id: 3, session_from: 'S2', active_sec: 120}), // timer still running
    auto({id: 4, session_from: 'S3', detached: 1, active_sec: 30}),
    auto({id: 5, bundle_id: 'com.apple.Terminal', app_name: 'Terminal', active_sec: 100}),
  ];
  const assigns: AssignRow[] = [{id: 11, bundle_id: 'com.google.Chrome', entry_id: 8, seconds: 240, title: 'Pudding #1'}];
  const d = build('2026-09-28', rows, assigns);
  assert.equal(d.total_sec, 600 + 60 + 300 + 120 + 30 + 100);
  assert.equal(d.idle_sec, 60);
  assert.equal(d.apps[0].bundle_id, 'com.google.Chrome'); // biggest first
  const chrome = d.apps[0];
  assert.equal(chrome.active_sec, 1050);
  assert.equal(chrome.unassigned_sec, 660 + 30 - 240);
  assert.deepEqual(chrome.chunks, [
    {kind: 'timer', id: 2, entry_id: 7, title: 'Banana #3', seconds: 300},
    {kind: 'timer', id: 3, entry_id: null, title: null, seconds: 120},
    {kind: 'manual', id: 11, entry_id: 8, title: 'Pudding #1', seconds: 240},
  ]);
  assert.equal(d.apps[1].unassigned_sec, 100);
});

test('build clamps unassigned at zero when the phone totals shrank under the chunks', () => {
  const d = build('2026-09-28', [auto({active_sec: 60})], [{id: 1, bundle_id: 'com.google.Chrome', entry_id: 8, seconds: 120, title: null}]);
  assert.equal(d.apps[0].unassigned_sec, 0);
});

test('mergeLive: live seconds override matching rows and add unseen buckets as id -1', () => {
  const rows = [auto({id: 1, active_sec: 10}), auto({id: 2, session_from: 'S1', entry_id: 7, active_sec: 10})];
  const merged = mergeLive(rows, [
    {bundle_id: 'com.google.Chrome', app_name: 'Chrome', session_from: '', active_sec: 50, idle_sec: 5},
    {bundle_id: 'com.apple.Terminal', app_name: 'Terminal', session_from: '', active_sec: 15, idle_sec: 0},
  ]);
  assert.equal(merged[0].active_sec, 50);
  assert.equal(merged[0].idle_sec, 5);
  assert.equal(merged[0].app_name, 'Chrome');
  assert.equal(merged[1].active_sec, 10); // timer bucket untouched — not in the live set
  assert.equal(merged[2].id, -1);
  assert.equal(merged[2].bundle_id, 'com.apple.Terminal');
  assert.deepEqual(mergeLive(rows, null), rows);
});

class FakeQueue extends EventEmitter {
  items: {id: string; fn: string; args: unknown[]; label: string}[] = [];
  failed: {item: {id: string; fn: string; args: unknown[]; label: string}; error: string}[] = [];
  dismissed: string[] = [];
  private n = 0;
  push(fn: string, args: unknown[], label: string): string {
    const id = `q${++this.n}`;
    this.items.push({id, fn, args, label});
    return id;
  }
  update(id: string, args: unknown[], label?: string): boolean {
    const it = this.items.find(i => i.id === id);
    if (!it) return false;
    it.args = args;
    if (label) it.label = label;
    return true;
  }
  dismissFailed(id: string): void {
    this.dismissed.push(id);
    this.failed = this.failed.filter(f => f.item.id !== id);
  }
  snapshot(): QueueSnapshot {
    return {items: this.items.map(i => ({...i, createdAt: ''})), failed: this.failed.map(f => ({...f, item: {...f.item, createdAt: ''}, failedAt: ''})), sending: null};
  }
  ack(id: string): void {
    this.items = this.items.filter(i => i.id !== id);
    this.emit('change', this.snapshot());
  }
  fail(id: string): void {
    const it = this.items.find(i => i.id === id)!;
    this.items = this.items.filter(i => i.id !== id);
    this.failed.push({item: it, error: 'boom'});
    this.emit('change', this.snapshot());
  }
}

function harness(over: Partial<{idle: number; locked: boolean; saver: boolean; front: {bundleId: string; name: string} | null; excluded: string[]}> = {}) {
  const store = new AppUseStore(null);
  const queue = new FakeQueue();
  const s = {idle: 0, locked: false, saver: false, front: chrome, excluded: [] as string[], ...over};
  const changed: number[] = [];
  const c = new AppUseCollector({
    store,
    readFront: async () => s.front,
    idleSeconds: () => s.idle,
    locked: () => s.locked,
    screensaver: async () => s.saver,
    excluded: () => new Set(s.excluded),
    today: () => '2026-09-28',
    queue,
    onChanged: () => changed.push(Date.now()),
  });
  return {store, queue, s, c, changed};
}

test('tick attributes 5 s to the front app as active / idle, under the running session', async () => {
  const {store, s, c} = harness();
  await c.tick();
  s.idle = 90;
  await c.tick();
  c.setSession({started_at: 'S1', paused_at: null});
  s.idle = 0;
  await c.tick();
  c.setSession({started_at: 'S1', paused_at: '2026-09-28T08:00:00Z'});
  await c.tick();
  assert.deepEqual(store.rows('2026-09-28'), [
    {bundle_id: 'com.google.Chrome', app_name: 'Google Chrome', session_from: '', active_sec: 10, idle_sec: 5},
    {bundle_id: 'com.google.Chrome', app_name: 'Google Chrome', session_from: 'S1', active_sec: 5, idle_sec: 0},
  ]);
  assert.equal(c.status.state, 'active');
});

test('tick counts nothing while away (lock, loginwindow in front, screensaver, suspend) or for excluded apps', async () => {
  const {store, s, c} = harness({locked: true});
  await c.tick();
  assert.equal(c.status.state, 'away');
  assert.equal(c.status.front, null);
  s.locked = false;
  s.front = {bundleId: 'com.apple.loginwindow', name: 'loginwindow'};
  await c.tick();
  assert.equal(c.status.state, 'away');
  s.front = chrome;
  s.saver = true;
  await c.tick();
  s.saver = false;
  c.setAway(true);
  await c.tick();
  c.setAway(false);
  s.excluded = ['com.google.Chrome'];
  await c.tick();
  assert.deepEqual(store.rows('2026-09-28'), []);
  s.excluded = [];
  s.front = null;
  await c.tick();
  assert.deepEqual(store.rows('2026-09-28'), []);
});

test('flush sends whole-day totals once per dirty day, updating an unsent item in place', async () => {
  const {store, queue, c} = harness();
  await c.tick();
  c.flush();
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].fn, 'appUse.upsert');
  assert.deepEqual(queue.items[0].args, ['2026-09-28', store.rows('2026-09-28')]);
  assert.deepEqual(store.dirtyDates(), []);
  await c.tick();
  c.flush();
  assert.equal(queue.items.length, 1, 'still one item: updated in place');
  assert.equal((queue.items[0].args[1] as {active_sec: number}[])[0].active_sec, 10, "two ticks of 5 s");
  queue.ack('q1');
  await c.tick();
  c.flush();
  assert.equal(queue.items.length, 1, 'a new item after the ack');
  assert.equal(queue.items[0].id, 'q2');
});

test('a failed flush marks the day dirty again and dismisses the failed item', async () => {
  const {store, queue, c} = harness();
  await c.tick();
  c.flush();
  queue.fail('q1');
  assert.deepEqual(store.dirtyDates(), ['2026-09-28']);
  assert.deepEqual(queue.dismissed, ['q1']);
  c.flush();
  assert.equal(queue.items[0].id, 'q2');
});

test('a session transition flushes immediately', async () => {
  const {queue, c} = harness();
  await c.tick();
  c.setSession({started_at: 'S1', paused_at: null});
  assert.equal(queue.items.length, 1);
  c.setSession({started_at: 'S1', paused_at: null}); // same: no second flush
  assert.equal(queue.items.length, 1);
});
