import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPendingEntries, applyPendingDay} from '../src/renderer/lib/pending.ts';
import type {Entry} from '../../src/types/index.ts';
import type {QueueItem} from '../src/main/queue.ts';

const base: Entry = {
  id: 10,
  day_id: 1,
  entry_type: 'note',
  activity_type: 'work',
  project_id: null,
  parent_id: null,
  tally: null,
  title: 'Old',
  body: null,
  file_path: null,
  thumbnail_path: null,
  duration_sec: null,
  time_from: null,
  time_to: null,
  latitude: null,
  longitude: null,
  location_label: null,
  is_todo: false,
  is_overtime: false,
  is_small_task: false,
  scheduled_date: null,
  completed_at: null,
  reminder_at: null,
  created_at: '2026-09-23T10:00:00.000Z',
  updated_at: '2026-09-23T10:00:00.000Z',
  tags: [{id: 1, name: 'a', created_at: ''}],
  project: null,
};

const item = (fn: string, args: unknown[], id = fn): QueueItem => ({
  id,
  fn,
  args,
  label: fn,
  createdAt: '2026-09-23T11:00:00.000Z',
});

test('creates on this date appear as pending rows; other dates are ignored', () => {
  const out = applyPendingEntries(
    [base],
    [
      item('entries.create', ['2026-09-23', {entry_type: 'note', title: 'New', tagNames: ['x']}], 'q1'),
      item('entries.create', ['2026-09-24', {entry_type: 'note', title: 'Elsewhere'}], 'q2'),
    ],
    '2026-09-23',
  );
  assert.equal(out.length, 2);
  assert.equal(out[1].title, 'New');
  assert.equal(out[1].queueId, 'q1');
  assert.equal(out[1].pending, true);
  assert.deepEqual(out[1].tags?.map(t => t.name), ['x']);
});

test('updates merge over the mirror row, deletes hide it', () => {
  const updated = applyPendingEntries([base], [item('entries.update', [10, {title: 'Newer', tagNames: ['b', 'c']}])], '2026-09-23');
  assert.equal(updated[0].title, 'Newer');
  assert.equal(updated[0].pending, true);
  assert.deepEqual(updated[0].tags?.map(t => t.name), ['b', 'c']);

  const deleted = applyPendingEntries([base], [item('entries.delete', [10])], '2026-09-23');
  assert.equal(deleted.length, 0);
});

test('day updates overlay the day, even when the mirror has none yet', () => {
  const day = applyPendingDay(null, [item('days.update', ['2026-09-23', {started_at: '2026-09-23T06:00:00.000Z'}])], '2026-09-23');
  assert.equal(day?.started_at, '2026-09-23T06:00:00.000Z');
  assert.equal(day?.pending, true);
  assert.equal(applyPendingDay(null, [], '2026-09-23'), null);
});
