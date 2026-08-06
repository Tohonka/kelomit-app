const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {createEntry, updateEntry} from '../src/db/entries';

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO entries')) { return {rows: [{id: 7}]}; }
    if (sql.includes('UPDATE projects SET next_tally')) {
      return {rows: [{next_tally: 4}]}; // post-increment value → assigned tally 3
    }
    if (sql.includes('SELECT project_id FROM entry_projects')) {
      return {rows: [{project_id: 5}]};
    }
    if (sql.includes('FROM entries') && sql.includes('WHERE') && sql.includes('id')) {
      return {rows: [{
        id: 7, day_id: 1, entry_type: 'note', activity_type: 'work',
        project_id: 5, tally: 3, is_todo: 0, is_overtime: 0,
        created_at: '', updated_at: '',
      }]};
    }
    return {rows: [], rowsAffected: 1};
  });
});

it('assigns the next tally when creating an entry with a project', async () => {
  const entry = await createEntry({day_id: 1, entry_type: 'note', project_id: 5});
  const bump = mockExecute.mock.calls.find(([sql]) =>
    String(sql).includes('UPDATE projects SET next_tally'));
  expect(bump?.[1]).toEqual([5]);
  const link = mockExecute.mock.calls.find(([sql]) =>
    String(sql).includes('INSERT INTO entry_projects'));
  expect(link?.[1]).toEqual([7, 5, 3]);
  expect(entry.tally).toBe(3);
});

it('assigns no tally without a project', async () => {
  await createEntry({day_id: 1, entry_type: 'note'});
  // Note: getEntry's SELECT always LEFT JOINs entry_projects (to fetch tally
  // when present), so this checks specifically for a tally row being written —
  // not just any SQL that mentions the table.
  expect(mockExecute.mock.calls.some(([sql]) =>
    String(sql).includes('INSERT INTO entry_projects'))).toBe(false);
});

it('reassigns tally when updateEntry changes the project', async () => {
  await updateEntry(7, {project_id: 9});
  const del = mockExecute.mock.calls.find(([sql]) =>
    String(sql).includes('DELETE FROM entry_projects'));
  expect(del?.[1]).toEqual([7]);
  const bump = mockExecute.mock.calls.find(([sql]) =>
    String(sql).includes('UPDATE projects SET next_tally'));
  expect(bump?.[1]).toEqual([9]);
});

it('keeps the tally when updateEntry does not touch the project', async () => {
  await updateEntry(7, {title: 'x'});
  expect(mockExecute.mock.calls.some(([sql]) =>
    String(sql).includes('entry_projects'))).toBe(false);
});

it('drops the link when the project is cleared', async () => {
  await updateEntry(7, {project_id: null});
  const del = mockExecute.mock.calls.find(([sql]) =>
    String(sql).includes('DELETE FROM entry_projects'));
  expect(del?.[1]).toEqual([7]);
  expect(mockExecute.mock.calls.some(([sql]) =>
    String(sql).includes('UPDATE projects SET next_tally'))).toBe(false);
});
