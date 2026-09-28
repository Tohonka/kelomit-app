import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {classify, isLockScreen, parseFront} from '../src/main/appUse/signals.ts';
import {AppUseStore} from '../src/main/appUse/store.ts';

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
