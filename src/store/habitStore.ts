import {create} from 'zustand';
import {getCategories, getHabits, getMatchersForHabits, getOverridesForRange, setOverride} from '../db/habits';
import {getTriggerIdsForEntries} from '../db/triggers';
import {getDaysInRange} from '../db/days';
import {getEntriesForDays} from '../db/entries';
import {monthKeyOf, monthRange} from '../utils/habitMonth';
import {categoryStreak, habitDayProgress, type HabitDayProgress} from '../utils/habitMatch';
import {shiftDate, todayDate} from '../utils/dateUtils';
import type {Entry, Habit, HabitCategory, HabitMatcher} from '../types';

// ponytail: streaks look back at most this far; a 120+ day streak just reads 120.
const STREAK_WINDOW_DAYS = 120;

export type HabitDayAuto = HabitDayProgress;

interface HabitState {
  categories: HabitCategory[];
  habits: Habit[];
  matchers: Map<number, HabitMatcher[]>;
  /** Visible month, 'yyyy-MM'. */
  month: string;
  loaded: boolean;
  /** habitId -> date -> manual override. */
  overrides: Map<number, Map<string, boolean>>;
  /** habitId -> date -> auto-derived state (visible month + streak window). */
  auto: Map<number, Map<string, HabitDayAuto>>;
  /** Reload categories, habits, matchers and day states. */
  load: () => Promise<void>;
  setMonth: (month: string) => Promise<void>;
  refreshMonth: () => Promise<void>;
  /** Tap: flip the effective state. Landing back on the auto value drops the override. */
  toggleDay: (habitId: number, date: string) => Promise<void>;
  /** Long-press: back to auto. */
  clearOverride: (habitId: number, date: string) => Promise<void>;
}

type DayView = Pick<HabitState, 'overrides' | 'auto'>;

export function autoDone(s: DayView, habitId: number, date: string): boolean {
  return s.auto.get(habitId)?.get(date)?.done ?? false;
}

export function overrideOf(s: DayView, habitId: number, date: string): boolean | undefined {
  return s.overrides.get(habitId)?.get(date);
}

/** override ?? auto */
export function effectiveDone(s: DayView, habitId: number, date: string): boolean {
  return overrideOf(s, habitId, date) ?? autoDone(s, habitId, date);
}

/** Current streak for a category: any of its habits done counts the day. */
export function streakOf(s: DayView & Pick<HabitState, 'habits'>, categoryId: number): number {
  const today = todayDate();
  const ids = s.habits.filter(h => h.category_id === categoryId).map(h => h.id);
  const byDate = new Map<string, boolean>();
  for (let i = 0; i <= STREAK_WINDOW_DAYS; i++) {
    const d = shiftDate(today, -i);
    if (ids.some(id => effectiveDone(s, id, d))) { byDate.set(d, true); }
  }
  return categoryStreak(byDate, today);
}

/** Range the store keeps day states for: visible month ∪ streak window. */
function loadRange(month: string): {from: string; to: string} {
  const {from, to} = monthRange(month);
  const today = todayDate();
  const back = shiftDate(today, -STREAK_WINDOW_DAYS);
  return {from: from < back ? from : back, to: to > today ? to : today};
}

async function deriveAuto(
  habits: Habit[],
  matchers: Map<number, HabitMatcher[]>,
  from: string,
  to: string,
): Promise<Map<number, Map<string, HabitDayAuto>>> {
  const auto = new Map<number, Map<string, HabitDayAuto>>();
  const active = habits.filter(h => (matchers.get(h.id)?.length ?? 0) > 0);
  if (active.length === 0) { return auto; }
  const days = await getDaysInRange(from, to);
  const entries = await getEntriesForDays(days.map(d => d.id));
  const triggerIds = await getTriggerIdsForEntries(entries.map(e => e.id));
  const byDay = new Map<number, Entry[]>();
  for (const e of entries) {
    byDay.set(e.day_id, [...(byDay.get(e.day_id) ?? []), e]);
  }
  for (const h of active) {
    const inner = new Map<string, HabitDayAuto>();
    for (const day of days) {
      const p = habitDayProgress(h, matchers.get(h.id)!, byDay.get(day.id) ?? [], triggerIds);
      if (p.count > 0) { inner.set(day.date, p); }
    }
    auto.set(h.id, inner);
  }
  return auto;
}

export const useHabitStore = create<HabitState>((set, get) => ({
  categories: [],
  habits: [],
  matchers: new Map(),
  month: monthKeyOf(new Date()),
  loaded: false,
  overrides: new Map(),
  auto: new Map(),

  load: async () => {
    const [categories, habits] = await Promise.all([getCategories(), getHabits()]);
    const matchers = await getMatchersForHabits(habits.map(h => h.id));
    set({categories, habits, matchers, loaded: true});
    await get().refreshMonth();
  },

  setMonth: async month => {
    set({month});
    await get().refreshMonth();
  },

  refreshMonth: async () => {
    const {habits, matchers, month} = get();
    const {from, to} = loadRange(month);
    const ids = habits.map(h => h.id);
    const [overrides, auto] = await Promise.all([
      getOverridesForRange(ids, from, to),
      deriveAuto(habits, matchers, from, to),
    ]);
    set({overrides, auto});
  },

  toggleDay: async (habitId, date) => {
    const s = get();
    const next = !effectiveDone(s, habitId, date);
    const value = next === autoDone(s, habitId, date) ? null : next;
    await setOverride(habitId, date, value);
    set(state => {
      const overrides = new Map(state.overrides);
      const inner = new Map(overrides.get(habitId) ?? []);
      if (value == null) { inner.delete(date); } else { inner.set(date, value); }
      overrides.set(habitId, inner);
      return {overrides};
    });
  },

  clearOverride: async (habitId, date) => {
    await setOverride(habitId, date, null);
    set(state => {
      const overrides = new Map(state.overrides);
      const inner = new Map(overrides.get(habitId) ?? []);
      inner.delete(date);
      overrides.set(habitId, inner);
      return {overrides};
    });
  },
}));
