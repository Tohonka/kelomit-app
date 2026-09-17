import {
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
  type ReadHealthDataHistoryPermission,
} from 'react-native-health-connect';
import {getHealthDailyRange, upsertHealthDaily} from '../db/health';
import {getSetting, setSetting} from '../db/settings';
import {useSettingsStore} from '../store/settingsStore';
import {buildHealthDays, type DayValue, type Sample} from '../utils/healthAggregate';
import {localDateOf} from '../utils/timeFormat';
import {shiftDate, todayDate} from '../utils/dateUtils';

/*
 * Health Connect import (plan 2026-09-14 H1). Daily totals only — raw records
 * never touch our database. Reads happen on app foreground, throttled; the
 * history permission is requested from day one so the 30-day read window
 * survives our uninstall→reinstall sideload cycle.
 */

const RECORD_TYPES = [
  'Steps',
  'Distance',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'SleepSession',
  'Weight',
  'Height',
  'RestingHeartRate',
] as const;

// Added later (2026-09-17, energy estimate): asked for, but an older grant
// without it still counts as connected and keeps importing everything else.
const OPTIONAL_RECORD_TYPES = ['ExerciseSession'] as const;

export const HEALTH_PERMISSIONS: (Permission | ReadHealthDataHistoryPermission)[] = [
  ...[...RECORD_TYPES, ...OPTIONAL_RECORD_TYPES].map(recordType => ({accessType: 'read', recordType}) as Permission),
  {accessType: 'read', recordType: 'ReadHealthDataHistory'},
];

const LAST_IMPORT_KEY = 'health_last_import';
const IMPORT_INTERVAL_MS = 3 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 7;
const FIRST_WINDOW_DAYS = 90;
const PAGE_SIZE = 1000;

export type HealthStatus = 'available' | 'update_required' | 'unavailable';

export async function getHealthStatus(): Promise<HealthStatus> {
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) { return 'available'; }
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) { return 'update_required'; }
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function coversAllTypes(granted: {accessType: string; recordType: string}[]): boolean {
  const have = new Set(granted.filter(p => p.accessType === 'read').map(p => p.recordType));
  return RECORD_TYPES.every(r => have.has(r));
}

/** Ask for every read permission. True when all record types were granted
 *  (history is nice-to-have and never blocks). */
export async function connectHealth(): Promise<boolean> {
  if (!(await initialize())) { return false; }
  const granted = await requestPermission(HEALTH_PERMISSIONS);
  return coversAllTypes(granted);
}

export async function isHealthConnected(): Promise<boolean> {
  try {
    if (!(await initialize())) { return false; }
    return coversAllTypes(await getGrantedPermissions());
  } catch {
    return false;
  }
}

/** False while the Exercise permission (added 2026-09-17) hasn't been granted. */
export async function hasExercisePermission(): Promise<boolean> {
  try {
    if (!(await initialize())) { return false; }
    return (await getGrantedPermissions()).some(p => p.accessType === 'read' && p.recordType === 'ExerciseSession');
  } catch {
    return false;
  }
}

export function openHealthSettings(): void {
  openHealthConnectSettings();
}

export async function getLastImportAt(): Promise<string | null> {
  return getSetting(LAST_IMPORT_KEY);
}

function localStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

type TotalType = 'Steps' | 'Distance' | 'ActiveCaloriesBurned' | 'TotalCaloriesBurned';

async function dailyTotals(recordType: TotalType, startTime: string, endTime: string): Promise<DayValue[]> {
  const groups = await aggregateGroupByPeriod({
    recordType,
    timeRangeFilter: {operator: 'between', startTime, endTime},
    timeRangeSlicer: {period: 'DAYS', length: 1},
  });
  const out: DayValue[] = [];
  for (const g of groups) {
    // The library's AggregateResult<T> doesn't narrow over a union T; pick by
    // the type we asked for instead of the discriminant.
    const r = g.result as unknown as {
      COUNT_TOTAL?: number;
      DISTANCE?: {inMeters: number};
      ACTIVE_CALORIES_TOTAL?: {inKilocalories: number};
      ENERGY_TOTAL?: {inKilocalories: number};
    };
    const value =
      recordType === 'Steps' ? r.COUNT_TOTAL
      : recordType === 'Distance' ? r.DISTANCE?.inMeters
      : recordType === 'ActiveCaloriesBurned' ? r.ACTIVE_CALORIES_TOTAL?.inKilocalories
      : r.ENERGY_TOTAL?.inKilocalories;
    if (value != null && value > 0) { out.push({date: localDateOf(g.startTime), value}); }
  }
  return out;
}

type SampleType = 'Weight' | 'Height' | 'RestingHeartRate';

/** Every record in the window, following page tokens (history imports of a
 *  few years can exceed one page). */
async function readAll<T extends SampleType | 'SleepSession' | 'ExerciseSession'>(
  recordType: T,
  startTime: string,
  endTime: string,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let pageToken: string | undefined;
  do {
    const res = await readRecords(recordType, {
      timeRangeFilter: {operator: 'between', startTime, endTime},
      pageSize: PAGE_SIZE,
      pageToken,
    });
    all.push(...res.records);
    pageToken = res.pageToken;
  } while (pageToken);
  return all;
}

async function samples(recordType: SampleType, startTime: string, endTime: string): Promise<Sample[]> {
  const records = (await readAll(recordType, startTime, endTime)) as {
    time: string;
    weight?: {inKilograms: number};
    height?: {inMeters: number};
    beatsPerMinute?: number;
  }[];
  return records.map(r => ({
    time: r.time,
    value:
      recordType === 'Weight' ? r.weight?.inKilograms ?? NaN
      : recordType === 'Height' ? (r.height?.inMeters ?? NaN) * 100
      : r.beatsPerMinute ?? NaN,
  }));
}

/** Import [fromDate, toDate] (local dates, inclusive) into health_daily.
 *  Returns the number of day rows written. Throws on Health Connect errors. */
export async function importHealthDays(fromDate: string, toDate: string): Promise<number> {
  if (!(await initialize())) { throw new Error('Health Connect unavailable'); }
  const startTime = localStart(fromDate);
  const endTime = localStart(shiftDate(toDate, 1));
  // Sleep that ends on fromDate may have started the evening before.
  const sleepStart = localStart(shiftDate(fromDate, -1));
  const canReadExercise = await hasExercisePermission();
  const [steps, distanceM, activeKcal, totalKcal, sleepRecords, weightKg, heightCm, restingHr, exerciseRecords] =
    await Promise.all([
      dailyTotals('Steps', startTime, endTime),
      dailyTotals('Distance', startTime, endTime),
      dailyTotals('ActiveCaloriesBurned', startTime, endTime),
      dailyTotals('TotalCaloriesBurned', startTime, endTime),
      readAll('SleepSession', sleepStart, endTime) as Promise<{startTime: string; endTime: string}[]>,
      samples('Weight', startTime, endTime),
      samples('Height', startTime, endTime),
      samples('RestingHeartRate', startTime, endTime),
      canReadExercise
        ? (readAll('ExerciseSession', startTime, endTime) as Promise<{startTime: string; endTime: string; exerciseType: number}[]>)
        : Promise.resolve(null),
    ]);
  const rows = buildHealthDays(
    {
      steps,
      distanceM,
      activeKcal,
      totalKcal,
      sleep: sleepRecords.map(r => ({startTime: r.startTime, endTime: r.endTime})),
      weightKg,
      heightCm,
      restingHr,
      exercise: exerciseRecords?.map(r => ({startTime: r.startTime, endTime: r.endTime, exerciseType: r.exerciseType})) ?? null,
    },
    new Date().toISOString(),
  ).filter(r => r.date >= fromDate && r.date <= toDate);
  for (const row of rows) {
    await upsertHealthDaily(row);
  }
  await setSetting(LAST_IMPORT_KEY, new Date().toISOString());
  await applyBodyProfile(rows, false);
  return rows.length;
}

/** Copy the latest weight/height in `rows` into the body profile. With
 *  `force` false only empty fields are filled (first import); with `force`
 *  true the user asked for it, so stored values are overwritten too. */
async function applyBodyProfile(
  rows: {weight_kg: number | null; height_cm: number | null}[],
  force: boolean,
): Promise<boolean> {
  const s = useSettingsStore.getState();
  const latest = (key: 'weight_kg' | 'height_cm') => [...rows].reverse().find(r => r[key] != null)?.[key] ?? null;
  const patch: {body_weight_kg?: number; body_height_cm?: number} = {};
  const w = latest('weight_kg');
  const h = latest('height_cm');
  if ((force || s.body_weight_kg == null) && w != null) { patch.body_weight_kg = Math.round(w * 10) / 10; }
  if ((force || s.body_height_cm == null) && h != null) { patch.body_height_cm = Math.round(h); }
  if (Object.keys(patch).length === 0) { return false; }
  await s.setBodyProfile(patch);
  return true;
}

/** "Update now": body profile ← latest imported weight/height (last year).
 *  Returns false when nothing was imported yet. Reads our own table, so it
 *  works offline. */
export async function refreshBodyProfile(): Promise<boolean> {
  const today = todayDate();
  const rows = await getHealthDailyRange(shiftDate(today, -365), today);
  return applyBodyProfile(rows, true);
}

/** "Import history": the last `days` days, however far the history permission
 *  lets us reach. Returns the number of day rows written. */
export async function importHistory(days: number): Promise<number> {
  const today = todayDate();
  return importHealthDays(shiftDate(today, -days), today);
}

/** Foreground trigger: import at most every 3 h while enabled. The first run
 *  reaches back 90 days (the history permission makes that legal). */
export async function maybeImportHealth(force = false): Promise<number> {
  if (!useSettingsStore.getState().health_enabled) { return 0; }
  const last = await getLastImportAt();
  if (!force && last) {
    const age = Date.now() - new Date(last).getTime();
    if (Number.isFinite(age) && age < IMPORT_INTERVAL_MS) { return 0; }
  }
  const today = todayDate();
  const from = shiftDate(today, -(last ? RECENT_WINDOW_DAYS : FIRST_WINDOW_DAYS));
  return importHealthDays(from, today);
}
