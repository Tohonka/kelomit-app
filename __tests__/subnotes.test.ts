const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {migrations} from '../src/db/migrations';
import {createEntry, getSubnotes, setEntryParent} from '../src/db/entries';

const row = (over: Record<string, unknown>) => ({
  id: 1, day_id: 1, entry_type: 'note', activity_type: 'work', project_id: null,
  parent_id: null, is_todo: 0, is_overtime: 0, created_at: '2026-09-01T10:00:00',
  updated_at: '', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO entries')) { return {rows: [{id: 9}]}; }
    if (sql.includes('WHERE e.parent_id = ?')) {
      return {rows: [row({id: 9, parent_id: 4, time_from: '2026-09-01T11:00:00'})]};
    }
    if (sql.includes('FROM entries') && sql.includes('WHERE e.id = ?')) {
      return {rows: [row({id: 9, parent_id: 4})]};
    }
    return {rows: [], rowsAffected: 1};
  });
});

it('v26 adds a cascading self-reference on entries', () => {
  const up = migrations.find(m => m.version === 26)?.up.join('\n') ?? '';
  expect(up).toContain('ADD COLUMN parent_id INTEGER REFERENCES entries(id) ON DELETE CASCADE');
  expect(up).toContain('idx_entries_parent');
});

it('createEntry persists parent_id and reads it back', async () => {
  const entry = await createEntry({day_id: 1, entry_type: 'note', parent_id: 4});
  const insert = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO entries'));
  expect(insert?.[0]).toContain('parent_id');
  expect(insert?.[1][19]).toBe(4);
  expect(entry.parent_id).toBe(4);
});

it('createEntry defaults parent_id to null', async () => {
  await createEntry({day_id: 1, entry_type: 'note'});
  const insert = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO entries'));
  expect(insert?.[1][19]).toBeNull();
});

it('getSubnotes queries by parent, oldest first', async () => {
  const subs = await getSubnotes(4);
  const sel = mockExecute.mock.calls.find(([sql]) => String(sql).includes('WHERE e.parent_id = ?'));
  expect(sel?.[0]).toContain('ORDER BY e.time_from ASC');
  expect(sel?.[1]).toEqual([4]);
  expect(subs.map(s => s.id)).toEqual([9]);
  expect(subs[0].parent_id).toBe(4);
});

it('setEntryParent re-parents and detaches', async () => {
  await setEntryParent([9, 10], 4);
  let upd = mockExecute.mock.calls.find(([sql]) => String(sql).includes('SET parent_id = ?'));
  expect(upd?.[0]).toContain('WHERE id IN (?,?)');
  expect(upd?.[1]).toEqual([4, 9, 10]);
  jest.clearAllMocks();
  await setEntryParent([9], null);
  upd = mockExecute.mock.calls.find(([sql]) => String(sql).includes('SET parent_id = ?'));
  expect(upd?.[1]).toEqual([null, 9]);
  jest.clearAllMocks();
  await setEntryParent([], 4);
  expect(mockExecute).not.toHaveBeenCalled();
});
