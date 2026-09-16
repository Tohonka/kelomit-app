import {localDateOf} from './timeFormat';
import type {HealthDailyInput} from '../types';

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

export interface HealthImportInput {
  steps: DayValue[];
  distanceM: DayValue[];
  activeKcal: DayValue[];
  totalKcal: DayValue[];
  sleep: SleepSpan[];
  weightKg: Sample[];
  heightCm: Sample[];
  restingHr: Sample[];
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

  for (const s of input.sleep) {
    const minutes = Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000);
    if (!(minutes > 0)) { continue; }
    const d = at(localDateOf(s.endTime));
    d.sleep_minutes = (d.sleep_minutes ?? 0) + minutes;
    if (!d.sleep_start || s.startTime < d.sleep_start) { d.sleep_start = s.startTime; }
    if (!d.sleep_end || s.endTime > d.sleep_end) { d.sleep_end = s.endTime; }
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

  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({...d, synced_at: syncedAt}));
}
