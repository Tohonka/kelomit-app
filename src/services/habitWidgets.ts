import {getHabits, getMatchersForHabits, getOverridesForRange, setOverride} from '../db/habits';
import {getTriggerIdsForEntries} from '../db/triggers';
import {getDaysInRange} from '../db/days';
import {getEntriesForDays} from '../db/entries';
import {habitDayProgress} from '../utils/habitMatch';
import {getHealthDaily} from '../db/health';
import {getFoodKcalByDay, type FoodDayTotals} from '../db/food';
import {todayDate} from '../utils/dateUtils';
import {
  isWidgetBridgeAvailable,
  nativeClearPendingHabitToggles,
  nativeGetPendingHabitToggles,
  nativeGetWidgets,
  nativeSetHabitWidgetState,
} from '../native/widgetSession';
import type {Habit} from '../types';

/**
 * Home-screen habit widget sync (plan 2026-09-07). The widget is a dumb
 * renderer of one native JSON blob: today's date + per-habit {done, title,
 * icon codepoint, colour}. Taps flip `done` natively and queue a toggle; we
 * fold those into habit_day_overrides here, recompute today, push it back.
 */

export interface HabitWidgetItem {
  done: boolean;
  title: string;
  /** MaterialCommunityIcons codepoint; native draws it from the bundled TTF. */
  icon_cp: number;
  color: string | null;
}

export interface HabitWidgetState {
  date: string;
  habits: Record<number, HabitWidgetItem>;
}

/** Pure: shape the blob native renders. Unknown glyph names fall back to a plain circle. */
export function buildHabitWidgetState(
  habits: Habit[],
  done: ReadonlyMap<number, boolean>,
  today: string,
  glyph: (name: string) => number | undefined,
): HabitWidgetState {
  const out: HabitWidgetState = {date: today, habits: {}};
  for (const h of habits) {
    out.habits[h.id] = {
      done: done.get(h.id) ?? false,
      title: h.title,
      icon_cp: glyph(h.icon) ?? glyph('circle-outline') ?? 0,
      color: h.color,
    };
  }
  return out;
}

async function todayDone(habits: Habit[], today: string): Promise<Map<number, boolean>> {
  const ids = habits.map(h => h.id);
  const [matchers, overrides, days] = await Promise.all([
    getMatchersForHabits(ids),
    getOverridesForRange(ids, today, today),
    getDaysInRange(today, today),
  ]);
  const entries = days.length ? await getEntriesForDays([days[0].id]) : [];
  const [triggerIds, health, foodByDay] = await Promise.all([
    getTriggerIdsForEntries(entries.map(e => e.id)),
    getHealthDaily(today).catch(() => null),
    getFoodKcalByDay(today, today).catch((): Record<string, FoodDayTotals> => ({})),
  ]);
  const ctx = {health, food: foodByDay[today] ?? null};
  const done = new Map<number, boolean>();
  for (const h of habits) {
    const auto = habitDayProgress(h, matchers.get(h.id) ?? [], entries, triggerIds, ctx).done;
    done.set(h.id, overrides.get(h.id)?.get(today) ?? auto);
  }
  return done;
}

// The raw glyphmap, not the Icon component: keeps this importable in jest/node.
const GLYPHS = require('react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json') as Record<string, number>;
const glyphOf = (name: string): number | undefined => GLYPHS[name];

/**
 * Drain widget taps into overrides, then push today's state for every habit
 * any placed widget shows. Returns true when taps were applied (caller may
 * refresh the habit store). No-op without the native bridge.
 */
export async function syncHabitWidgets(): Promise<boolean> {
  if (!isWidgetBridgeAvailable()) { return false; }
  const pending = await nativeGetPendingHabitToggles();
  // ponytail: a tap that lands on the auto value leaves a redundant override; harmless.
  for (const p of pending) { await setOverride(p.habit_id, p.date, p.done); }
  if (pending.length) { await nativeClearPendingHabitToggles(); }

  const ids = new Set<number>();
  for (const w of await nativeGetWidgets()) {
    if (w.type === 'habits') { for (const id of w.config?.habit_ids ?? []) { ids.add(id); } }
  }
  const today = todayDate();
  const habits = ids.size ? (await getHabits()).filter(h => ids.has(h.id)) : [];
  const done = habits.length ? await todayDone(habits, today) : new Map<number, boolean>();
  await nativeSetHabitWidgetState(JSON.stringify(buildHabitWidgetState(habits, done, today, glyphOf)));
  return pending.length > 0;
}
