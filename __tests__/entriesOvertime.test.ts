const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {createEntry, updateEntry} from '../src/db/entries';

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO entries')) {
      return {rows: [{id: 1}]};
    }
    if (sql.includes('SELECT * FROM entries WHERE id')) {
      return {
        rows: [{
          id: 1,
          day_id: 1,
          entry_type: 'note',
          activity_type: 'work',
          project_id: null,
          is_todo: 0,
          is_overtime: 1,
          created_at: '',
          updated_at: '',
        }],
      };
    }
    return {rows: [], rowsAffected: 1};
  });
});

it('persists and maps overtime for work entries', async () => {
  const entry = await createEntry({
    day_id: 1,
    entry_type: 'note',
    activity_type: 'work',
    is_overtime: true,
  } as Parameters<typeof createEntry>[0] & {is_overtime: boolean});

  const insert = mockExecute.mock.calls.find(([sql]) =>
    String(sql).includes('INSERT INTO entries'));
  expect(insert?.[0]).toContain('is_overtime');
  expect(insert?.[1][15]).toBe(1);
  expect(entry.is_overtime).toBe(true);
});

it('normalizes overtime off when creating a non-work entry', async () => {
  await createEntry({
    day_id: 1,
    entry_type: 'note',
    activity_type: 'personal',
    is_overtime: true,
  } as Parameters<typeof createEntry>[0] & {is_overtime: boolean});

  const insert = mockExecute.mock.calls.find(([sql]) =>
    String(sql).includes('INSERT INTO entries'));
  expect(insert?.[1][15]).toBe(0);
});

it('clears overtime whenever activity changes away from work', async () => {
  await updateEntry(1, {activity_type: 'personal'});

  expect(mockExecute).toHaveBeenCalledWith(
    expect.stringContaining('is_overtime = 0'),
    expect.any(Array),
  );
});

it('guards an overtime-only update with the persisted activity', async () => {
  await updateEntry(1, {is_overtime: true} as Parameters<typeof updateEntry>[1]);

  expect(mockExecute).toHaveBeenCalledWith(
    expect.stringContaining(
      "is_overtime = CASE WHEN activity_type = 'work' THEN ? ELSE 0 END",
    ),
    [1, 1],
  );
});
