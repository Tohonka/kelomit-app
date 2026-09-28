import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, isLockScreen, parseFront} from '../src/main/appUse/signals.ts';

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
