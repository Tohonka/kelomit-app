/*
 * Daily energy use, factorial method (FAO/WHO/UNU 2001): the day is cut into
 * activity buckets, each with a physical activity ratio (PAR, a multiple of
 * BMR), and TEE = BMR × Σ(PAR × minutes) / 1440. BMR is Mifflin-St Jeor.
 *
 * It is data, not a target: rounded to 10 kcal and always shown as an estimate.
 * ponytail: MET and PAR are treated as the same number. They differ by
 * BMR-vs-1-kcal/kg/h (a few percent) — far inside the noise of the inputs.
 */
import {metFor} from './energy';
import type {ExerciseBout, Sex} from '../types';

export interface BodyProfile {
  weightKg: number | null;
  heightCm: number | null;
  birthYear: number | null;
  sex: Sex | null;
}

export type ProfileField = 'weight' | 'height' | 'birthYear' | 'sex';

export function missingProfileFields(p: BodyProfile): ProfileField[] {
  const out: ProfileField[] = [];
  if (p.weightKg == null) { out.push('weight'); }
  if (p.heightCm == null) { out.push('height'); }
  if (p.birthYear == null) { out.push('birthYear'); }
  if (p.sex == null) { out.push('sex'); }
  return out;
}

/** Mifflin-St Jeor, kcal/day. Null until the whole body profile is known. */
export function bmrMifflin(p: BodyProfile, year: number): number | null {
  if (p.weightKg == null || p.heightCm == null || p.birthYear == null || p.sex == null) { return null; }
  const age = year - p.birthYear;
  return Math.round(10 * p.weightKg + 6.25 * p.heightCm - 5 * age + (p.sex === 'male' ? 5 : -161));
}

// Health Connect ExerciseType → MET (2024 Adult Compendium, mid-effort rows).
const EXERCISE_MET: Record<number, number> = {
  2: 5.5, // badminton
  5: 6.5, // basketball
  8: 7.0, // biking
  9: 6.8, // biking, stationary
  10: 7.0, // boot camp
  11: 7.8, // boxing
  13: 3.8, // calisthenics
  16: 5.0, // dancing
  25: 5.0, // elliptical
  26: 5.5, // exercise class
  32: 4.8, // golf
  33: 1.3, // guided breathing
  36: 8.0, // HIIT
  37: 6.0, // hiking
  38: 8.0, // ice hockey
  39: 5.5, // ice skating
  41: 11.0, // jump rope
  44: 7.5, // martial arts
  46: 4.0, // paddling
  48: 3.0, // pilates
  51: 7.5, // rock climbing
  53: 5.0, // rowing
  54: 6.0, // rowing machine
  56: 9.0, // running
  57: 9.0, // running, treadmill
  60: 6.0, // skating
  61: 7.0, // skiing
  62: 5.3, // snowboarding
  63: 5.3, // snowshoeing
  64: 7.0, // soccer
  66: 7.3, // squash
  68: 6.0, // stair climbing
  69: 6.0, // stair machine
  70: 3.5, // strength training
  71: 2.3, // stretching
  73: 6.0, // swimming, open water
  74: 6.0, // swimming, pool
  75: 4.0, // table tennis
  76: 6.8, // tennis
  78: 4.0, // volleyball
  79: 3.5, // walking
  81: 3.5, // weightlifting
  83: 2.5, // yoga
};
const DEFAULT_EXERCISE_MET = 5.0;

// Outdoor sessions our own GPS trail sees too; counted once (see below).
const FOOT_TYPES = new Set([37, 56, 79]);
const CYCLE_TYPES = new Set([8]);

export function exerciseMet(type: number): number {
  return EXERCISE_MET[type] ?? DEFAULT_EXERCISE_MET;
}

export const PAR_SLEEP = 1.0;
export const PAR_EXTRA_STEPS = 2.5;
export const PAR_VEHICLE = 1.5;
export const PAR_REST = 1.4;
export const WORK_PAR = {desk: 1.5, mixed: 2.2, physical: 3.5} as const;
export type WorkActivity = keyof typeof WORK_PAR;

const ASSUMED_SLEEP_MIN = 480;
const STEP_M = 0.75;
const STEPS_PER_MIN = 100;

export type EnergyBucketKey = 'sleep' | 'exercise' | 'walk' | 'cycle' | 'steps' | 'vehicle' | 'work' | 'rest';

export interface EnergyBucket {
  key: EnergyBucketKey;
  minutes: number;
  par: number;
  kcal: number;
  /** No measurement behind it (8 h of sleep when Health Connect had none). */
  assumed?: boolean;
}

export interface EnergyDayInput {
  bmr: number;
  /** 1440 for a finished day, minutes since midnight for today. */
  minutesInDay: number;
  sleepMinutes: number | null;
  exercise: ExerciseBout[];
  movement: {footSec: number; footM: number; cycleSec: number; cycleM: number; vehicleSec: number};
  steps: number | null;
  workMinutes: number;
  workActivity: WorkActivity;
}

export interface EnergyDay {
  buckets: EnergyBucket[];
  /** Rounded to 10. */
  totalKcal: number;
  /** Physical activity level = TEE / BMR over the covered minutes. */
  pal: number;
}

interface Leg { minutes: number; metMinutes: number }

function gpsLeg(mode: 'foot' | 'cycle', sec: number, meters: number): Leg {
  if (sec <= 0) { return {minutes: 0, metMinutes: 0}; }
  const minutes = sec / 60;
  return {minutes, metMinutes: metFor(mode, meters / 1000 / (sec / 3600)) * minutes};
}

function sessionLeg(bouts: ExerciseBout[], types: Set<number>): Leg {
  let minutes = 0;
  let metMinutes = 0;
  for (const b of bouts) {
    if (!types.has(b.type)) { continue; }
    minutes += b.minutes;
    metMinutes += exerciseMet(b.type) * b.minutes;
  }
  return {minutes, metMinutes};
}

/** A walk recorded by the watch and seen by our GPS trail is one walk: keep
 *  whichever source claims more energy, never the sum. */
function larger(a: Leg, b: Leg): Leg {
  return a.metMinutes >= b.metMinutes ? a : b;
}

export function energyDay(input: EnergyDayInput): EnergyDay {
  const perMin = input.bmr / 1440;
  let remaining = Math.max(0, Math.min(1440, input.minutesInDay));
  const buckets: EnergyBucket[] = [];
  const push = (key: EnergyBucketKey, minutes: number, par: number, assumed?: boolean) => {
    const m = Math.max(0, Math.min(minutes, remaining));
    if (m <= 0) { return; }
    remaining -= m;
    buckets.push({key, minutes: Math.round(m), par: Math.round(par * 10) / 10, kcal: Math.round(perMin * par * m), ...(assumed ? {assumed} : {})});
  };

  const m = input.movement;
  const hcFoot = sessionLeg(input.exercise, FOOT_TYPES);
  const gpsFoot = gpsLeg('foot', m.footSec, m.footM);
  const walk = larger(gpsFoot, hcFoot);
  const cycle = larger(gpsLeg('cycle', m.cycleSec, m.cycleM), sessionLeg(input.exercise, CYCLE_TYPES));
  const other = input.exercise.filter(b => !FOOT_TYPES.has(b.type) && !CYCLE_TYPES.has(b.type));
  const otherMin = other.reduce((s, b) => s + b.minutes, 0);
  const otherMet = otherMin > 0 ? other.reduce((s, b) => s + exerciseMet(b.type) * b.minutes, 0) / otherMin : 0;

  // Steps the walking bucket already explains; the rest is pottering about.
  const explained = walk === gpsFoot ? m.footM / STEP_M : walk.minutes * STEPS_PER_MIN;
  const extraSteps = Math.max(0, (input.steps ?? 0) - explained);

  // Most certain first; each bucket only gets what is left of the day.
  if (input.sleepMinutes != null) { push('sleep', input.sleepMinutes, PAR_SLEEP); }
  else { push('sleep', ASSUMED_SLEEP_MIN, PAR_SLEEP, true); }
  push('exercise', otherMin, otherMet);
  push('walk', walk.minutes, walk.minutes > 0 ? walk.metMinutes / walk.minutes : 0);
  push('cycle', cycle.minutes, cycle.minutes > 0 ? cycle.metMinutes / cycle.minutes : 0);
  push('steps', extraSteps / STEPS_PER_MIN, PAR_EXTRA_STEPS);
  push('vehicle', m.vehicleSec / 60, PAR_VEHICLE);
  push('work', input.workMinutes, WORK_PAR[input.workActivity]);
  push('rest', remaining, PAR_REST);

  const kcal = buckets.reduce((s, b) => s + b.kcal, 0);
  const covered = buckets.reduce((s, b) => s + b.minutes, 0);
  return {
    buckets,
    totalKcal: Math.round(kcal / 10) * 10,
    pal: covered > 0 ? Math.round((kcal / (perMin * covered)) * 100) / 100 : 0,
  };
}
