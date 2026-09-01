import {groupEntries, nextDayListMode, DAY_LIST_MODES} from '../src/utils/entrySort';
import type {Entry, Project} from '../src/types';

const proj = (id: number, name: string): Project => ({
  id,
  name,
  type: 'work',
  archived: false,
  created_at: '',
  updated_at: '',
});

const e = (over: Partial<Entry>): Entry =>
  ({
    id: 0,
    day_id: 1,
    entry_type: 'note',
    activity_type: 'work',
    project_id: null,
    title: null,
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
    scheduled_date: null,
    completed_at: null,
    reminder_at: null,
    created_at: '2026-06-28T08:00:00',
    updated_at: '',
    ...over,
  }) as Entry;

const a = e({id: 1, time_from: '2026-06-28T09:00:00', activity_type: 'work', project: proj(1, 'Beta')});
const b = e({id: 2, time_from: '2026-06-28T11:00:00', activity_type: 'personal', project: proj(2, 'Alpha')});
const c = e({id: 3, time_from: null, created_at: '2026-06-28T07:00:00', activity_type: 'work', project: null});

test('cycle wraps through all modes', () => {
  let m = DAY_LIST_MODES[0];
  for (let i = 0; i < DAY_LIST_MODES.length; i++) m = nextDayListMode(m);
  expect(m).toBe(DAY_LIST_MODES[0]);
});

test('time_desc is newest-first, using created_at fallback for null time_from', () => {
  const g = groupEntries([a, b, c], 'time_desc');
  expect(g.length).toBe(1);
  expect(g[0].title).toBeNull();
  expect(g[0].items.map(x => x.entry.id)).toEqual([2, 1, 3]); // 11:00, 09:00, 07:00
});

test('time_asc is oldest-first', () => {
  const g = groupEntries([a, b, c], 'time_asc');
  expect(g[0].items.map(x => x.entry.id)).toEqual([3, 1, 2]);
});

test('project mode: alphabetical groups, no-project last with null title', () => {
  const g = groupEntries([a, b, c], 'project');
  expect(g.map(x => x.title)).toEqual(['Alpha', 'Beta', null]);
  expect(g[2].items.map(x => x.entry.id)).toEqual([3]);
});

test('type mode: fixed work/personal_work/personal order, empties dropped', () => {
  const g = groupEntries([a, b, c], 'type');
  expect(g.map(x => x.title)).toEqual(['work', 'personal']); // no personal_work present
  expect(g[0].items.map(x => x.entry.id)).toEqual([1, 3]); // both work, newest-first
});

const parent = e({id: 10, time_from: '2026-06-28T10:00:00', project: proj(1, 'Beta')});
const sub1 = e({id: 11, parent_id: 10, time_from: '2026-06-28T10:30:00', project: proj(1, 'Beta')});
const sub2 = e({id: 12, parent_id: 10, time_from: '2026-06-28T10:10:00', project: proj(1, 'Beta')});
const orphan = e({id: 13, parent_id: 999, time_from: '2026-06-28T12:00:00', project: null});

test('subnotes nest under their parent, oldest first, in every mode', () => {
  for (const mode of DAY_LIST_MODES) {
    const g = groupEntries([sub1, parent, sub2, a], mode);
    const all = g.flatMap(x => x.items);
    expect(all.map(x => x.entry.id).sort()).toEqual([1, 10]);
    const p = all.find(x => x.entry.id === 10)!;
    expect(p.subnotes.map(x => x.id)).toEqual([12, 11]);
    expect(all.find(x => x.entry.id === 1)!.subnotes).toEqual([]);
  }
});

test('time_desc orders parents only; subnotes do not affect ordering', () => {
  const g = groupEntries([a, sub1, parent, b], 'time_desc');
  expect(g[0].items.map(x => x.entry.id)).toEqual([2, 10, 1]);
});

test('a subnote whose parent is missing from the list is shown top-level', () => {
  const g = groupEntries([orphan, a], 'time_desc');
  expect(g[0].items.map(x => x.entry.id)).toEqual([13, 1]);
  const p = groupEntries([orphan, a], 'project');
  expect(p.map(x => x.title)).toEqual(['Beta', null]);
  expect(p[1].items[0].entry.id).toBe(13);
});
