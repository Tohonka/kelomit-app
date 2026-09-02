const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {migrations} from '../src/db/migrations';
import {
  createCategory, updateCategory, archiveCategory, deleteCategory, getCategories,
  createHabit, updateHabit, getHabits, getMatchers, getMatchersForHabits, setMatchers,
  getOverridesForRange, setOverride,
} from '../src/db/habits';
import {getOrCreateTrigger, getTriggerIdsForEntries} from '../src/db/triggers';

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockResolvedValue({rows: [], rowsAffected: 1});
});

const lastCall = () => mockExecute.mock.calls[mockExecute.mock.calls.length - 1];

it('migration 28 creates the five habit tables with cascades', () => {
  const sql = migrations.find(m => m.version === 28)?.up.join('\n') ?? '';
  for (const t of ['habit_categories', 'habits', 'triggers', 'entry_triggers', 'habit_matchers', 'habit_day_overrides']) {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
  }
  expect(sql).toContain('REFERENCES habit_categories(id) ON DELETE CASCADE');
  expect(sql).toContain("CHECK(goal_kind IN ('minutes','count'))");
  expect(sql).toContain("CHECK(kind IN ('project','tag','trigger'))");
  expect(migrations[migrations.length - 1].version).toBe(28);
});

describe('categories', () => {
  it('creates with defaults and maps the row', async () => {
    mockExecute.mockResolvedValueOnce({rows: [{id: 1, title: 'Lang', description: null, icon: 'star-outline',
      goal_streak_days: 30, archived: 0, created_at: 'c', updated_at: 'u'}]});
    const cat = await createCategory({title: ' Lang ', goal_streak_days: 30});
    expect(lastCall()[1]).toEqual(['Lang', null, 'star-outline', 30]);
    expect(cat).toMatchObject({id: 1, title: 'Lang', archived: false, goal_streak_days: 30});
  });

  it('updates only the given fields and bumps updated_at', async () => {
    await updateCategory(3, {title: 'X', goal_streak_days: null});
    expect(lastCall()[0]).toContain("SET title = ?, goal_streak_days = ?, updated_at = datetime('now') WHERE id = ?");
    expect(lastCall()[1]).toEqual(['X', null, 3]);
    mockExecute.mockClear();
    await updateCategory(3, {});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('archives, deletes, filters archived by default', async () => {
    await archiveCategory(2);
    expect(lastCall()[1]).toEqual([1, 2]);
    await deleteCategory(2);
    expect(lastCall()[0]).toContain('DELETE FROM habit_categories');
    await getCategories();
    expect(lastCall()[0]).toContain('WHERE archived = 0');
    await getCategories(true);
    expect(lastCall()[0]).not.toContain('archived');
  });
});

describe('habits', () => {
  it('creates with a null goal by default', async () => {
    mockExecute.mockResolvedValueOnce({rows: [{id: 5, category_id: 1, title: 'Spanish', icon: 'translate',
      goal_kind: null, goal_value: null, archived: 0, created_at: '', updated_at: ''}]});
    const h = await createHabit({category_id: 1, title: 'Spanish', icon: 'translate'});
    expect(lastCall()[1]).toEqual([1, 'Spanish', null, 'translate', null, null]);
    expect(h.goal_kind).toBeNull();
  });

  it('filters by category and updates goal', async () => {
    await getHabits(7);
    expect(lastCall()[0]).toContain('WHERE archived = 0 AND category_id = ?');
    expect(lastCall()[1]).toEqual([7]);
    await updateHabit(5, {goal_kind: 'minutes', goal_value: 30});
    expect(lastCall()[1]).toEqual(['minutes', 30, 5]);
  });
});

describe('matchers', () => {
  it('replaces wholesale', async () => {
    await setMatchers(5, [{kind: 'tag', ref_id: 2}, {kind: 'project', ref_id: 9}]);
    const sqls = mockExecute.mock.calls.map(c => c[0] as string);
    expect(sqls[0]).toContain('DELETE FROM habit_matchers WHERE habit_id = ?');
    expect(sqls).toHaveLength(3);
    expect(mockExecute.mock.calls[2][1]).toEqual([5, 'project', 9]);
  });

  it('reads and groups', async () => {
    mockExecute.mockResolvedValueOnce({rows: [{habit_id: 5, kind: 'tag', ref_id: 2}]});
    expect(await getMatchers(5)).toEqual([{habit_id: 5, kind: 'tag', ref_id: 2}]);
    mockExecute.mockResolvedValueOnce({rows: [
      {habit_id: 5, kind: 'tag', ref_id: 2}, {habit_id: 6, kind: 'trigger', ref_id: 1}, {habit_id: 5, kind: 'project', ref_id: 3}]});
    const m = await getMatchersForHabits([5, 6]);
    expect(m.get(5)).toHaveLength(2);
    expect(m.get(6)).toEqual([{habit_id: 6, kind: 'trigger', ref_id: 1}]);
    expect(await getMatchersForHabits([])).toEqual(new Map());
  });
});

describe('overrides', () => {
  it('upserts, clears, and reads a range', async () => {
    await setOverride(5, '2026-09-01', true);
    expect(lastCall()[0]).toContain('ON CONFLICT(habit_id, date) DO UPDATE');
    expect(lastCall()[1]).toEqual([5, '2026-09-01', 1]);
    await setOverride(5, '2026-09-01', false);
    expect(lastCall()[1]).toEqual([5, '2026-09-01', 0]);
    await setOverride(5, '2026-09-01', null);
    expect(lastCall()[0]).toContain('DELETE FROM habit_day_overrides');
    mockExecute.mockResolvedValueOnce({rows: [
      {habit_id: 5, date: '2026-09-01', done: 1}, {habit_id: 5, date: '2026-09-02', done: 0}]});
    const o = await getOverridesForRange([5], '2026-09-01', '2026-09-30');
    expect(lastCall()[1]).toEqual([5, '2026-09-01', '2026-09-30']);
    expect(o.get(5)?.get('2026-09-01')).toBe(true);
    expect(o.get(5)?.get('2026-09-02')).toBe(false);
  });
});

describe('triggers', () => {
  it('normalizes names and returns existing', async () => {
    mockExecute.mockResolvedValueOnce({rows: [{id: 1, name: 'gym', created_at: ''}]});
    const tr = await getOrCreateTrigger(' Gym ');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(lastCall()[1]).toEqual(['gym']);
    expect(tr.name).toBe('gym');
  });

  it('groups trigger ids per entry', async () => {
    mockExecute.mockResolvedValueOnce({rows: [{entry_id: 1, trigger_id: 3}, {entry_id: 1, trigger_id: 4}, {entry_id: 2, trigger_id: 3}]});
    const m = await getTriggerIdsForEntries([1, 2]);
    expect(m.get(1)).toEqual([3, 4]);
    expect(m.get(2)).toEqual([3]);
    expect((await getTriggerIdsForEntries([])).size).toBe(0);
  });
});
