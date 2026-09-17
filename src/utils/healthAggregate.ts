import {localDateOf} from './timeFormat';
import type {ExerciseBout, HealthDailyInput} from '../types';

/** A per-day total already sliced by Health Connect (period = 1 day). */
export interface DayValue {
  date: string;
  value: number;
}
/** An instantaneous sample (weight, height, resting heart rate). */
export interface Sample {
  time: string;
  value: number;
}
export interface SleepSpan {
  startTime: string;
  endTime: string;
}

export interface ExerciseSpan extends SleepSpan {
  exerciseType: number;
}

export interface HealthImportInput {
  steps: DayValue[];
  distanceM: DayValue[];
  activeKcal: DayValue[];
  totalKcal: DayValue[];
  sleep: SleepSpan[];
  weightKg: Sample[];
  heightCm: Sample[];
  restingHr: Sample[];
  /** Null when the exercise permission isn't granted — leaves stored values alone. */
  exercise: ExerciseSpan[] | null;
}

type Draft = Omit<HealthDailyInput, 'synced_at'>;

function blank(date: string): Draft {
  return {
    date,
    steps: null,
    distance_m: null,
    sleep_minutes: null,
    sleep_start: null,
    sleep_end: null,
    weight_kg: null,
    height_cm: null,
    active_kcal: null,
    total_kcal: null,
    resting_hr: null,
    exercise: null,
  };
}

/**
 * Shape library-free Health Connect output into one row per local date. Sleep is
 * attributed to the wake-up date (a night across midnight belongs to the
 * morning's day); instantaneous samples keep the latest reading of the day.
 * Only dates with at least one metric are returned, sorted ascending.
 */
export function buildHealthDays(input: HealthImportInput, syncedAt: string): HealthDailyInput[] {
  const days = new Map<string, Draft>();
  const at = (date: string) => {
    const d = days.get(date) ?? blank(date);
    days.set(date, d);
    return d;
  };

  const setTotal = (rows: DayValue[], key: 'steps' | 'distance_m' | 'active_kcal' | 'total_kcal') => {
    for (const r of rows) {
      if (Number.isFinite(r.value)) { at(r.date)[key] = r.value; }
    }
  };
  setTotal(input.steps, 'steps');
  setTotal(input.distanceM, 'distance_m');
  setTotal(input.activeKcal, 'active_kcal');
  setTotal(input.totalKcal, 'total_kcal');

  // Several sources (watch, phone, the provider's own app) can report the same
  // night as overlapping sessions; summing them double-counts (a "17 h night").
  // Union the intervals per wake-up date first, then sum.
  const nights = new Map<string, {start: number; end: number}[]>();
  for (const s of input.sleep) {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    if (!(end > start)) { continue; }
    const date = localDateOf(s.endTime);
    nights.set(date, [...(nights.get(date) ?? []), {start, end}]);
  }
  for (const [date, spans] of nights) {
    spans.sort((a, b) => a.start - b.start);
    const merged: {start: number; end: number}[] = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span.start <= last.end) { last.end = Math.max(last.end, span.end); }
      else { merged.push({...span}); }
    }
    const d = at(date);
    d.sleep_minutes = Math.round(merged.reduce((sum, m) => sum + (m.end - m.start), 0) / 60000);
    d.sleep_start = new Date(merged[0].start).toISOString();
    d.sleep_end = new Date(merged[merged.length - 1].end).toISOString();
  }

  const latest = (samples: Sample[], key: 'weight_kg' | 'height_cm' | 'resting_hr') => {
    const seen = new Map<string, string>();
    for (const s of samples) {
      if (!Number.isFinite(s.value)) { continue; }
      const date = localDateOf(s.time);
      const prev = seen.get(date);
      if (prev && prev > s.time) { continue; }
      seen.set(date, s.time);
      at(date)[key] = s.value;
    }
  };
  latest(input.weightKg, 'weight_kg');
  latest(input.heightCm, 'height_cm');
  latest(input.restingHr, 'resting_hr');

  // Exercise: the same overlap problem as sleep (watch + phone recording one
  // workout). Walk the sessions in start order and clip each to begin where
  // the previous one ended; a session belongs to the date it started on.
  if (input.exercise) {
    for (const d of days.values()) { d.exercise = []; }
    const sessions = input.exercise
      .map(s => ({type: s.exerciseType, start: new Date(s.startTime).getTime(), end: new Date(s.endTime).getTime()}))
      .filter(s => s.end > s.start)
      .sort((a, b) => a.start - b.start);
    let coveredTo = 0;
    for (const s of sessions) {
      const start = Math.max(s.start, coveredTo);
      coveredTo = Math.max(coveredTo, s.end);
      const minutes = Math.round((s.end - start) / 60000);
      if (minutes <= 0) { continue; }
      const d = at(localDateOf(new Date(s.start).toISOString()));
      const bouts: ExerciseBout[] = d.exercise ?? [];
      bouts.push({type: s.type, minutes});
      d.exercise = bouts;
    }
  }

  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({...d, synced_at: syncedAt}));
}
