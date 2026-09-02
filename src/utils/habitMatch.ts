// Pure habit matching — no DB access. Auto-done state is derived from a day's
// entries each time; only manual overrides are persisted.
import {entryTrackedSeconds} from './hoursUtils';
import type {Entry, Habit, HabitMatcher} from '../types';

/** OR across matchers: project hits entry.project_id, tag hits entry.tags[],
 *  trigger hits entryTriggerIds. Subnotes/small tasks are plain entries. */
export function entryMatchesHabit(
  entry: Entry,
  matchers: HabitMatcher[],
  entryTriggerIds: ReadonlyMap<number, number[]>,
): boolean {
  return matchers.some(m => {
    if (m.kind === 'project') { return entry.project_id === m.ref_id; }
    if (m.kind === 'tag') { return entry.tags?.some(t => t.id === m.ref_id) ?? false; }
    return entryTriggerIds.get(entry.id)?.includes(m.ref_id) ?? false;
  });
}

export interface HabitDayProgress {
  done: boolean;
  seconds: number;
  count: number;
}

export function habitDayProgress(
  habit: Habit,
  matchers: HabitMatcher[],
  dayEntries: Entry[],
  entryTriggerIds: ReadonlyMap<number, number[]>,
): HabitDayProgress {
  const hits = dayEntries.filter(e => entryMatchesHabit(e, matchers, entryTriggerIds));
  const count = hits.length;
  const seconds = hits.reduce((sum, e) => sum + entryTrackedSeconds(e), 0);
  const goal = habit.goal_value ?? 0;
  const done =
    habit.goal_kind === 'count' ? count >= goal
    : habit.goal_kind === 'minutes' ? seconds >= goal * 60
    : count > 0;
  return {done, seconds, count};
}

export function habitAutoDone(
  habit: Habit,
  matchers: HabitMatcher[],
  dayEntries: Entry[],
  entryTriggerIds: ReadonlyMap<number, number[]>,
): boolean {
  return habitDayProgress(habit, matchers, dayEntries, entryTriggerIds).done;
}

export function effectiveDone(auto: boolean, override: boolean | undefined): boolean {
  return override ?? auto;
}

/** Consecutive done days ending today or yesterday — an unfinished today
 *  doesn't break yesterday's streak. */
export function categoryStreak(
  habitsDoneByDate: ReadonlyMap<string, boolean>,
  today: string,
): number {
  let d = new Date(`${today}T00:00:00`);
  if (!habitsDoneByDate.get(today)) { d.setDate(d.getDate() - 1); }
  let n = 0;
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!habitsDoneByDate.get(key)) { return n; }
    n++;
    d.setDate(d.getDate() - 1);
  }
}
