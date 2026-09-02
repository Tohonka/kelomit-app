import {create} from 'zustand';
import {getCategories, getHabits, getOverridesForRange, setOverride} from '../db/habits';
import {monthKeyOf, monthRange} from '../utils/habitMonth';
import type {Habit, HabitCategory} from '../types';

/** Derived-from-entries state for one habit-day (Part C fills this). */
export interface HabitDayAuto {
  done: boolean;
  seconds: number;
  count: number;
}

interface HabitState {
  categories: HabitCategory[];
  habits: Habit[];
  /** Visible month, 'yyyy-MM'. */
  month: string;
  loaded: boolean;
  /** habitId -> date -> manual override. */
  overrides: Map<number, Map<string, boolean>>;
  /** habitId -> date -> auto-derived state. */
  auto: Map<number, Map<string, HabitDayAuto>>;
  /** Reload categories, habits and the visible month's day states. */
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

export const useHabitStore = create<HabitState>((set, get) => ({
  categories: [],
  habits: [],
  month: monthKeyOf(new Date()),
  loaded: false,
  overrides: new Map(),
  auto: new Map(),

  load: async () => {
    const [categories, habits] = await Promise.all([getCategories(), getHabits()]);
    set({categories, habits, loaded: true});
    await get().refreshMonth();
  },

  setMonth: async month => {
    set({month});
    await get().refreshMonth();
  },

  refreshMonth: async () => {
    const {habits, month} = get();
    const {from, to} = monthRange(month);
    const ids = habits.map(h => h.id);
    const overrides = await getOverridesForRange(ids, from, to);
    // ponytail: auto stays empty until Part C's matching engine lands.
    set({overrides, auto: new Map()});
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
