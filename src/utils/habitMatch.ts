// Pure habit matching — no DB access. Auto-done state is derived from a day's
// entries (and, since v33, the day's health totals / food log) each time; only
// manual overrides are persisted.
import {entryTrackedSeconds} from './hoursUtils';
import type {Entry, Habit, HabitMatcher, HabitMatcherKind} from '../types';

export const LIFE_MATCHER_KINDS = ['steps', 'sleep_minutes', 'food_entries', 'food_kcal'] as const;
export type LifeMatcherKind = (typeof LIFE_MATCHER_KINDS)[number];

export function isLifeKind(kind: HabitMatcherKind): kind is LifeMatcherKind {
  return (LIFE_MATCHER_KINDS as readonly string[]).includes(kind);
}

/** What a day looks like beyond its notes. Missing = no data that day. */
export interface DayContext {
  health?: {steps: number | null; sleep_minutes: number | null} | null;
  food?: {kcal: number; entries: number} | null;
}

/** OR across the entry matchers: project hits entry.project_id, tag hits
 *  entry.tags[], trigger hits entryTriggerIds. Day-level kinds never match an
 *  entry — see dayMatchesLife. Subnotes/small tasks are plain entries. */
export function entryMatchesHabit(
  entry: Entry,
  matchers: HabitMatcher[],
  entryTriggerIds: ReadonlyMap<number, number[]>,
): boolean {
  return matchers.some(m => {
    switch (m.kind) {
      case 'project':
        return entry.project_id === m.ref_id;
      case 'tag':
        return entry.tags?.some(t => t.id === m.ref_id) ?? false;
      case 'trigger':
        return entryTriggerIds.get(entry.id)?.includes(m.ref_id) ?? false;
      default:
        return false;
    }
  });
}

/** OR across the day-level matchers against the day's context. A kind
 *  without a threshold means "any data" for ≥ kinds; food_kcal needs one. */
export function dayMatchesLife(matchers: HabitMatcher[], ctx: DayContext): boolean {
  return matchers.some(m => {
    switch (m.kind) {
      case 'steps':
        return ctx.health?.steps != null && ctx.health.steps >= (m.threshold ?? 1);
      case 'sleep_minutes':
        return ctx.health?.sleep_minutes != null && ctx.health.sleep_minutes >= (m.threshold ?? 1);
      case 'food_entries':
        return (ctx.food?.entries ?? 0) >= (m.threshold ?? 1);
      case 'food_kcal':
        return m.threshold != null && (ctx.food?.entries ?? 0) > 0 && (ctx.food?.kcal ?? 0) <= m.threshold;
      default:
        return false;
    }
  });
}

export interface HabitDayProgress {
  done: boolean;
  seconds: number;
  count: number;
}

/** Entry hits count one each; a day-level hit counts as one more (so a
 *  "count" goal of 1 is met by steps alone, while "minutes" goals still only
 *  add up note time). */
export function habitDayProgress(
  habit: Habit,
  matchers: HabitMatcher[],
  dayEntries: Entry[],
  entryTriggerIds: ReadonlyMap<number, number[]>,
  ctx: DayContext = {},
): HabitDayProgress {
  const hits = dayEntries.filter(e => entryMatchesHabit(e, matchers, entryTriggerIds));
  const count = hits.length + (dayMatchesLife(matchers, ctx) ? 1 : 0);
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
  ctx: DayContext = {},
): boolean {
  return habitDayProgress(habit, matchers, dayEntries, entryTriggerIds, ctx).done;
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
