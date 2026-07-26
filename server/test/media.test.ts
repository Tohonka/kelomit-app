import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {isSafeMediaName, listMedia, saveMedia} from '../src/media.ts';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-media-'));
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('accepts ordinary media filenames', () => {
  assert.ok(isSafeMediaName('photo_1719.jpg'));
  assert.ok(isSafeMediaName('voice-2.m4a'));
  assert.ok(isSafeMediaName('IMG.JPEG'));
});

test('rejects traversal and separators', () => {
  assert.ok(!isSafeMediaName('../../etc/passwd'));
  assert.ok(!isSafeMediaName('a/b.jpg'));
  assert.ok(!isSafeMediaName('..'));
  assert.ok(!isSafeMediaName('a\\b.jpg'));
  assert.ok(!isSafeMediaName(''));
});

test('rejects extensions we do not sync', () => {
  assert.ok(!isSafeMediaName('clip.mp4'));
  assert.ok(!isSafeMediaName('shell.sh'));
  assert.ok(!isSafeMediaName('noextension'));
});

test('saveMedia writes into the media dir', () => {
  saveMedia(dataDir, 'photo.jpg', Buffer.from('bytes'));
  assert.equal(readFileSync(join(dataDir, 'media', 'photo.jpg'), 'utf8'), 'bytes');
});

test('saveMedia refuses an unsafe name', () => {
  assert.throws(() => saveMedia(dataDir, '../escape.jpg', Buffer.from('x')), /unsafe/);
  assert.ok(!existsSync(join(dataDir, '..', 'escape.jpg')));
});

test('listMedia returns filenames, empty when the dir is absent', () => {
  assert.deepEqual(listMedia(dataDir), []);
  mkdirSync(join(dataDir, 'media'), {recursive: true});
  writeFileSync(join(dataDir, 'media', 'a.jpg'), 'x');
  writeFileSync(join(dataDir, 'media', 'b.m4a'), 'x');
  assert.deepEqual(listMedia(dataDir).sort(), ['a.jpg', 'b.m4a']);
});
