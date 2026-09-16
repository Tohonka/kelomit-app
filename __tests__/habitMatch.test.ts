import {categoryStreak, effectiveDone, entryMatchesHabit, habitAutoDone, habitDayProgress} from '../src/utils/habitMatch';
import type {Entry, Habit, HabitMatcher} from '../src/types';

const e = (o: Partial<Entry>): Entry =>
  ({
    id: 0, day_id: 1, entry_type: 'note', activity_type: 'work', project_id: null, parent_id: null,
    tally: null, title: null, body: null, file_path: null, thumbnail_path: null, duration_sec: null,
    time_from: null, time_to: null, latitude: null, longitude: null, location_label: null,
    is_todo: false, is_overtime: false, is_small_task: false, scheduled_date: null,
    completed_at: null, reminder_at: null, created_at: '', updated_at: '', ...o,
  }) as Entry;
const tag = (id: number) => ({id, name: `t${id}`, created_at: ''});
const habit = (o: Partial<Habit>): Habit => ({
  id: 1, category_id: 1, title: 'h', description: null, icon: 'x', color: null, goal_kind: null, goal_value: null,
  archived: false, created_at: '', updated_at: '', ...o,
});
const M = (kind: HabitMatcher['kind'], ref_id: number, threshold: number | null = null): HabitMatcher => ({habit_id: 1, kind, ref_id, threshold});
const noTriggers = new Map<number, number[]>();

describe('entryMatchesHabit', () => {
  it('hits and misses per matcher kind', () => {
    expect(entryMatchesHabit(e({project_id: 5}), [M('project', 5)], noTriggers)).toBe(true);
    expect(entryMatchesHabit(e({project_id: 6}), [M('project', 5)], noTriggers)).toBe(false);
    expect(entryMatchesHabit(e({tags: [tag(2)]}), [M('tag', 2)], noTriggers)).toBe(true);
    expect(entryMatchesHabit(e({tags: []}), [M('tag', 2)], noTriggers)).toBe(false);
    expect(entryMatchesHabit(e({id: 9}), [M('trigger', 3)], new Map([[9, [3]]]))).toBe(true);
    expect(entryMatchesHabit(e({id: 9}), [M('trigger', 3)], new Map([[9, [4]]]))).toBe(false);
  });
  it('ORs across kinds; no matchers never matches', () => {
    expect(entryMatchesHabit(e({tags: [tag(2)]}), [M('project', 5), M('tag', 2)], noTriggers)).toBe(true);
    expect(entryMatchesHabit(e({project_id: 5, tags: [tag(2)]}), [], noTriggers)).toBe(false);
  });
});

describe('habitAutoDone', () => {
  const hits = [e({id: 1, project_id: 5}), e({id: 2, project_id: 5}), e({id: 3, project_id: 7})];
  it('null goal → any match', () => {
    expect(habitAutoDone(habit({}), [M('project', 5)], hits, noTriggers)).toBe(true);
    expect(habitAutoDone(habit({}), [M('project', 8)], hits, noTriggers)).toBe(false);
  });
  it('count goal boundary', () => {
    const h = habit({goal_kind: 'count', goal_value: 3});
    expect(habitAutoDone(h, [M('project', 5)], hits, noTriggers)).toBe(false);
    expect(habitAutoDone(h, [M('project', 5), M('project', 7)], hits, noTriggers)).toBe(true);
  });
  it('minutes goal sums tracked seconds incl. a subnote and a small task', () => {
    const h = habit({goal_kind: 'minutes', goal_value: 30});
    const day = [
      e({id: 1, tags: [tag(2)], duration_sec: 20 * 60}),
      e({id: 2, tags: [tag(2)], parent_id: 1, time_from: '2026-09-02T08:00:00Z', time_to: '2026-09-02T08:05:00Z'}),
      e({id: 3, tags: [tag(2)], is_small_task: true, duration_sec: 5 * 60}),
      e({id: 4, tags: [tag(9)], duration_sec: 60 * 60}),
    ];
    const p = habitDayProgress(h, [M('tag', 2)], day, noTriggers);
    expect(p).toEqual({done: true, seconds: 1800, count: 3});
    expect(habitAutoDone(h, [M('tag', 2)], day.slice(0, 2), noTriggers)).toBe(false);
  });
});

it('override forces both directions', () => {
  expect(effectiveDone(true, false)).toBe(false);
  expect(effectiveDone(false, true)).toBe(true);
  expect(effectiveDone(true, undefined)).toBe(true);
});

describe('categoryStreak', () => {
  const m = (...dates: string[]) => new Map(dates.map(d => [d, true]));
  it('counts a run ending today', () => {
    expect(categoryStreak(m('2026-08-31', '2026-09-01', '2026-09-02'), '2026-09-02')).toBe(3);
  });
  it('today not yet done keeps yesterday’s streak; a gap breaks it', () => {
    expect(categoryStreak(m('2026-08-31', '2026-09-01'), '2026-09-02')).toBe(2);
    expect(categoryStreak(m('2026-08-30', '2026-09-01'), '2026-09-02')).toBe(1);
    expect(categoryStreak(m('2026-08-30'), '2026-09-02')).toBe(0);
  });
  it('empty map ⇒ 0', () => {
    expect(categoryStreak(new Map(), '2026-09-02')).toBe(0);
  });
});

describe('day-level (life) matchers', () => {
  const none: Entry[] = [];
  it('steps / sleep / food entries reach a threshold; food kcal stays under one', () => {
    expect(habitAutoDone(habit({}), [M('steps', 0, 8000)], none, noTriggers, {health: {steps: 8432, sleep_minutes: null}})).toBe(true);
    expect(habitAutoDone(habit({}), [M('steps', 0, 8000)], none, noTriggers, {health: {steps: 7999, sleep_minutes: null}})).toBe(false);
    expect(habitAutoDone(habit({}), [M('steps', 0, 8000)], none, noTriggers, {})).toBe(false);
    expect(habitAutoDone(habit({}), [M('sleep_minutes', 0, 420)], none, noTriggers, {health: {steps: null, sleep_minutes: 450}})).toBe(true);
    expect(habitAutoDone(habit({}), [M('food_entries', 0, null)], none, noTriggers, {food: {kcal: 0, entries: 1}})).toBe(true);
    expect(habitAutoDone(habit({}), [M('food_entries', 0, 3)], none, noTriggers, {food: {kcal: 900, entries: 2}})).toBe(false);
    expect(habitAutoDone(habit({}), [M('food_kcal', 0, 2200)], none, noTriggers, {food: {kcal: 1900, entries: 3}})).toBe(true);
    expect(habitAutoDone(habit({}), [M('food_kcal', 0, 2200)], none, noTriggers, {food: {kcal: 2500, entries: 3}})).toBe(false);
    // A day with nothing logged never satisfies "kcal ≤".
    expect(habitAutoDone(habit({}), [M('food_kcal', 0, 2200)], none, noTriggers, {food: {kcal: 0, entries: 0}})).toBe(false);
    expect(habitAutoDone(habit({}), [M('food_kcal', 0, null)], none, noTriggers, {food: {kcal: 100, entries: 1}})).toBe(false);
  });
  it('ORs with entry matchers and counts as one hit for count goals', () => {
    const ctx = {health: {steps: 9000, sleep_minutes: null}};
    expect(habitAutoDone(habit({}), [M('project', 5), M('steps', 0, 8000)], none, noTriggers, ctx)).toBe(true);
    expect(habitDayProgress(habit({goal_kind: 'count', goal_value: 2}), [M('project', 5), M('steps', 0, 8000)], [e({project_id: 5})], noTriggers, ctx).done).toBe(true);
    expect(habitDayProgress(habit({goal_kind: 'count', goal_value: 2}), [M('steps', 0, 8000)], none, noTriggers, ctx).done).toBe(false);
    // Minutes goals only add up note time.
    expect(habitDayProgress(habit({goal_kind: 'minutes', goal_value: 30}), [M('steps', 0, 8000)], none, noTriggers, ctx).done).toBe(false);
  });
  it('day-level kinds never match a single entry', () => {
    expect(entryMatchesHabit(e({project_id: 5}), [M('steps', 0, 1)], noTriggers)).toBe(false);
  });
});
